import secrets
import uuid

from django.db import models, transaction
from django.contrib.auth.models import User
from django.contrib.auth.hashers import check_password, identify_hasher, make_password
from django.db.models import Q, Sum
from decimal import Decimal
from django.core.exceptions import ValidationError
from django.utils import timezone


DEFAULT_HELPER_NAME = 'system'


class Period(models.Model):
    name = models.CharField(max_length=100, unique=True)
    start_date = models.DateTimeField()
    end_date = models.DateTimeField()
    is_open = models.BooleanField(default=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-start_date']

    def __str__(self):
        return self.name

    def clean(self):
        if self.start_date >= self.end_date:
            raise ValidationError("Period end_date must be after start_date.")

        overlapping_periods = Period.objects.exclude(pk=self.pk).filter(
            start_date__lt=self.end_date,
            end_date__gt=self.start_date,
        )
        if overlapping_periods.exists():
            raise ValidationError("Period dates overlap with an existing period.")

        if self.is_open and Period.objects.exclude(pk=self.pk).filter(is_open=True).exists():
            raise ValidationError("Only one period can remain open at a time.")

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)
        reserve = Ledger.get_capacity_reserve(self, create=True)
        if reserve is None:
            return

        update_fields = []
        if reserve.end_date != self.end_date:
            reserve.end_date = self.end_date
            update_fields.append('end_date')
        if reserve.is_active != self.is_open:
            reserve.is_active = self.is_open
            update_fields.append('is_active')
        expected_closed_at = None if self.is_open else self.closed_at
        if reserve.closed_at != expected_closed_at:
            reserve.closed_at = expected_closed_at
            update_fields.append('closed_at')
        if reserve.priority != Ledger.CAPACITY_RESERVE_PRIORITY:
            reserve.priority = Ledger.CAPACITY_RESERVE_PRIORITY
            update_fields.append('priority')
        if reserve.name != f"{self.name} Capacity Reserve":
            reserve.name = f"{self.name} Capacity Reserve"
            update_fields.append('name')

        if update_fields:
            reserve.save(update_fields=update_fields)

    def close(self, closed_at=None, save=True, helper_name=DEFAULT_HELPER_NAME):
        if closed_at is None:
            closed_at = timezone.now()

        with transaction.atomic():
            _auto_close_pending_overflows(
                self,
                closed_at=closed_at,
                helper_name=helper_name,
            )

            self.is_open = False
            self.closed_at = closed_at

            if save:
                self.save(update_fields=['is_open', 'closed_at'])

            self.ledgers.filter(is_active=True).update(
                is_active=False,
                closed_at=closed_at,
            )

        return self

    @classmethod
    def get_open_period(cls):
        return cls.objects.filter(is_open=True).order_by('start_date').first()

    @classmethod
    def get_last_closed_period(cls):
        return cls.objects.filter(is_open=False, closed_at__isnull=False).order_by('-closed_at', '-start_date').first()

    def can_reopen(self):
        if self.is_open:
            raise ValidationError("Period is already open.")

        if Period.objects.exclude(pk=self.pk).filter(is_open=True).exists():
            raise ValidationError("Close the active period before reopening another one.")

        last_closed_period = Period.get_last_closed_period()
        if not last_closed_period or last_closed_period.pk != self.pk:
            raise ValidationError("Only the most recently closed period can be reopened.")

    def reopen(self, save=True):
        self.can_reopen()

        with transaction.atomic():
            self.is_open = True
            self.closed_at = None

            if save:
                self.save(update_fields=['is_open', 'closed_at'])

            self.ledgers.update(
                is_active=True,
                closed_at=None,
            )

        return self

    def can_delete(self):
        if self.is_open:
            raise ValidationError("Close the active period before deleting it.")

        last_closed_period = Period.get_last_closed_period()
        if not last_closed_period or last_closed_period.pk != self.pk:
            raise ValidationError("Only the most recently closed period can be deleted.")

        if LedgerAllocation.objects.filter(ledger__period=self).exists():
            raise ValidationError("This period cannot be deleted because it already has ticket activity.")


class Ledger(models.Model):
    CAPACITY_RESERVE_PRIORITY = 999999

    period = models.ForeignKey(
        Period,
        on_delete=models.PROTECT,
        related_name='ledgers',
        null=True,
        blank=True
    )
    name = models.CharField(max_length=100, default='Default Ledger')
    end_date = models.DateTimeField()
    limit_per_identifier = models.DecimalField(max_digits=12, decimal_places=2, default=100000.00)
    priority = models.IntegerField(default=1)  # lower = higher priority
    is_active = models.BooleanField(default=True)
    is_capacity_reserve = models.BooleanField(default=False)
    closed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['priority', '-end_date']

    def __str__(self):
        return f"{self.name} (Priority: {self.priority})"

    @classmethod
    def get_capacity_reserve(cls, period, create=False):
        reserve = cls.objects.filter(
            period=period,
            is_capacity_reserve=True,
        ).order_by('id').first()
        if reserve or not create or period is None:
            return reserve

        return cls.objects.create(
            period=period,
            name=f"{period.name} Capacity Reserve",
            end_date=period.end_date,
            limit_per_identifier=Decimal('0.00'),
            priority=cls.CAPACITY_RESERVE_PRIORITY,
            is_active=period.is_open,
            is_capacity_reserve=True,
        )

    def close(self, closed_at=None, save=True):
        if closed_at is None:
            closed_at = timezone.now()

        with transaction.atomic():
            _resolve_pending_overflows(
                self.period,
                exclude_ledger_ids=[self.pk],
            )

            self.is_active = False
            self.closed_at = closed_at

            if save:
                self.save(update_fields=['is_active', 'closed_at'])

        return self

    def can_modify(self):
        if self.is_capacity_reserve:
            raise ValidationError("The reserve ledger is managed automatically and cannot be edited here.")

    def can_delete(self):
        self.can_modify()
        if self.allocations.exists():
            raise ValidationError("This ledger cannot be deleted because it already has ticket activity.")

    def can_reopen(self):
        if self.is_active:
            raise ValidationError("Ledger is already active.")

        if self.period is None or not self.period.is_open:
            raise ValidationError("Only ledgers in the active period can be reopened.")

        self.can_modify()

    def reopen(self, save=True):
        self.can_reopen()

        self.is_active = True
        self.closed_at = None

        if save:
            self.save(update_fields=['is_active', 'closed_at'])

        return self


class Identifier(models.Model):
    number = models.CharField(max_length=3, unique=True)  # '000' to '999'

    class Meta:
        ordering = ['number']

    def __str__(self):
        return self.number

    @property
    def current_utilization(self):
        """Total amount actually used, including approved and pending overflow"""
        transaction_in_limits = LedgerAllocation.objects.filter(
            transaction__identifier=self
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
        allocated = transaction_in_limits
        all_overflow = self.total_overflow_amount
        return allocated + all_overflow

    @property
    def remaining_capacity(self):
        open_period = Period.get_open_period()
        if not open_period:
            return Decimal('0.00')

        total_limit = Ledger.objects.filter(
            is_active=True,
            period=open_period,
            is_capacity_reserve=False,
        ).aggregate(
            total=Sum('limit_per_identifier')
        )['total'] or Decimal('0.00')

        # Count normal allocations plus any identifier-specific reserve usage.
        normal_usage = LedgerAllocation.objects.filter(
            transaction__identifier=self,
            ledger__period=open_period,
            ledger__is_active=True,
            ledger__is_capacity_reserve=False,
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')

        reserve_granted = IdentifierCapacityAdjustment.objects.filter(
            identifier=self,
            period=open_period,
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')

        reserve_used = LedgerAllocation.objects.filter(
            transaction__identifier=self,
            ledger__period=open_period,
            ledger__is_capacity_reserve=True,
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')

        return total_limit + reserve_granted - normal_usage - reserve_used

    @property
    def current_overflow_amount(self):
        return Overflow.objects.filter(
            transaction__identifier=self,
            status='TCSO'
        ).aggregate(total=Sum('excess_amount'))['total'] or Decimal('0.00')

    @property
    def confirmed_overflow_amount(self):
        return Overflow.objects.filter(
            transaction__identifier=self,
            status='CSO'
        ).aggregate(total=Sum('excess_amount'))['total'] or Decimal('0.00')

    @property
    def total_overflow_amount(self):
        """Total overflow amount across all statuses."""
        return Overflow.objects.filter(
            transaction__identifier=self
        ).aggregate(total=Sum('excess_amount'))['total'] or Decimal('0.00')


def _period_overflow_filter(period):
    if period is None:
        return Q(transaction__allocations__ledger__period__isnull=True)

    return (
        Q(transaction__allocations__ledger__period=period) |
        Q(
            transaction__timestamp__gte=period.start_date,
            transaction__timestamp__lte=period.end_date,
        )
    )


def _get_transaction_period(transaction_obj):
    period = Period.objects.filter(
        start_date__lte=transaction_obj.timestamp,
        end_date__gte=transaction_obj.timestamp,
    ).order_by('start_date').first()
    if period:
        return period

    period_id = transaction_obj.allocations.exclude(
        ledger__period__isnull=True
    ).values_list('ledger__period', flat=True).first()
    if period_id:
        return Period.objects.filter(pk=period_id).first()

    return None


def _get_ledger_available_capacity(identifier, ledger):
    current_usage = LedgerAllocation.objects.filter(
        transaction__identifier=identifier,
        ledger=ledger,
    ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
    return ledger.limit_per_identifier - current_usage


def _normalize_manual_allocations(manual_allocations):
    normalized = []
    for item in manual_allocations or []:
        ledger = item.get('ledger')
        amount = item.get('amount', Decimal('0.00'))
        normalized.append({
            'ledger': ledger,
            'amount': Decimal(str(amount)),
        })
    return normalized


def preview_transaction_allocation(identifier, total_amount, period, manual_allocations=None):
    total_amount = Decimal(str(total_amount))
    remaining = total_amount
    allocation_preview = []
    seen_ledgers = set()

    if manual_allocations:
        allocation_plan = _normalize_manual_allocations(manual_allocations)
    else:
        allocation_plan = [
            {'ledger': ledger, 'amount': None}
            for ledger in Ledger.objects.filter(
                is_active=True,
                period=period,
                is_capacity_reserve=False,
            ).order_by('priority', 'end_date', 'id')
        ]

    for item in allocation_plan:
        ledger = item['ledger']
        if ledger is None or ledger.pk in seen_ledgers:
            continue

        seen_ledgers.add(ledger.pk)
        available = _get_ledger_available_capacity(identifier, ledger)
        requested = item['amount']

        if requested is None:
            allocate_amount = min(max(available, Decimal('0.00')), remaining)
        else:
            allocate_amount = min(requested, remaining)

        overflow_amount = Decimal('0.00')
        if allocate_amount > available:
            overflow_amount = allocate_amount - max(available, Decimal('0.00'))
            allocate_amount = max(available, Decimal('0.00'))

        allocation_preview.append({
            'ledger': ledger,
            'requested_amount': requested if requested is not None else allocate_amount,
            'allocated_amount': allocate_amount,
            'available_amount': max(available, Decimal('0.00')),
            'overflow_amount': overflow_amount,
        })
        remaining -= allocate_amount + overflow_amount

        if remaining <= 0:
            remaining = Decimal('0.00')
            break

    reserve_available = IdentifierCapacityAdjustment.get_available_capacity(
        identifier=identifier,
        period=period,
    )
    reserve_allocated = min(max(reserve_available, Decimal('0.00')), remaining)
    remaining -= reserve_allocated

    return {
        'ledger_allocations': allocation_preview,
        'reserve_available': max(reserve_available, Decimal('0.00')),
        'reserve_allocated': reserve_allocated,
        'overflow_amount': max(remaining, Decimal('0.00')),
    }


def _allocate_transaction_amount(transaction_obj, amount, period):
    remaining = amount
    active_ledgers = Ledger.objects.filter(
        is_active=True,
        period=period,
        is_capacity_reserve=False,
    ).order_by('priority', 'end_date', 'id')

    for ledger in active_ledgers:
        if remaining <= 0:
            break

        current_usage = LedgerAllocation.objects.filter(
            transaction__identifier=transaction_obj.identifier,
            ledger=ledger,
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')

        available = ledger.limit_per_identifier - current_usage
        if available <= 0:
            continue

        assign_amount = min(remaining, available)
        LedgerAllocation.objects.create(
            transaction=transaction_obj,
            ledger=ledger,
            amount=assign_amount,
        )
        remaining -= assign_amount

    if remaining > 0:
        reserve_available = IdentifierCapacityAdjustment.get_available_capacity(
            identifier=transaction_obj.identifier,
            period=period,
        )
        if reserve_available > 0:
            reserve_ledger = Ledger.get_capacity_reserve(period, create=True)
            reserve_amount = min(remaining, reserve_available)
            LedgerAllocation.objects.create(
                transaction=transaction_obj,
                ledger=reserve_ledger,
                amount=reserve_amount,
            )
            remaining -= reserve_amount

    return remaining


def _allocate_manual_transaction_amount(transaction_obj, amount, period, manual_allocations):
    preview = preview_transaction_allocation(
        identifier=transaction_obj.identifier,
        total_amount=amount,
        period=period,
        manual_allocations=manual_allocations,
    )

    for item in preview['ledger_allocations']:
        allocated_amount = item['allocated_amount']
        if allocated_amount <= 0:
            continue
        LedgerAllocation.objects.create(
            transaction=transaction_obj,
            ledger=item['ledger'],
            amount=allocated_amount,
        )

    if preview['reserve_allocated'] > 0:
        reserve_ledger = Ledger.get_capacity_reserve(period, create=True)
        LedgerAllocation.objects.create(
            transaction=transaction_obj,
            ledger=reserve_ledger,
            amount=preview['reserve_allocated'],
        )

    return preview['overflow_amount']


def _retry_pending_overflows(period, identifier):
    if period is None:
        return

    pending_overflows = (
        Overflow.objects.filter(
            _period_overflow_filter(period),
            status=Overflow.STATUS_TCSO,
            transaction__identifier=identifier,
        )
        .select_related('transaction__identifier')
        .distinct()
        .order_by('transaction__timestamp', 'id')
    )

    for overflow in pending_overflows:
        remaining = _allocate_transaction_amount(
            overflow.transaction,
            overflow.excess_amount,
            period,
        )

        if remaining <= 0:
            overflow.delete()
            continue

        if remaining != overflow.excess_amount:
            overflow.excess_amount = remaining
            overflow.save(update_fields=['excess_amount'])


def _resolve_pending_overflows(period, exclude_ledger_ids=None):
    if period is None:
        return

    exclude_ledger_ids = exclude_ledger_ids or []
    target_ledgers = list(
        Ledger.objects.filter(
            period=period,
            is_active=True,
            is_capacity_reserve=False,
        )
        .exclude(pk__in=exclude_ledger_ids)
        .order_by('priority', 'end_date', 'id')
    )

    pending_overflows = (
        Overflow.objects.filter(
            _period_overflow_filter(period),
            status=Overflow.STATUS_TCSO,
        )
        .select_related('transaction__identifier')
        .distinct()
        .order_by('transaction__timestamp', 'id')
    )

    for overflow in pending_overflows:
        remaining = overflow.excess_amount

        for ledger in target_ledgers:
            if remaining <= 0:
                break

            current_usage = LedgerAllocation.objects.filter(
                transaction__identifier=overflow.transaction.identifier,
                ledger=ledger,
            ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')

            available = ledger.limit_per_identifier - current_usage
            if available <= 0:
                continue

            assign_amount = min(remaining, available)
            LedgerAllocation.objects.create(
                transaction=overflow.transaction,
                ledger=ledger,
                amount=assign_amount,
            )
            remaining -= assign_amount

        if remaining <= 0:
            overflow.delete()
            continue

        if remaining != overflow.excess_amount:
            overflow.excess_amount = remaining
            overflow.save(update_fields=['excess_amount'])


def _auto_close_pending_overflows(period, closed_at=None, helper_name=DEFAULT_HELPER_NAME):
    if period is None:
        return

    closed_at = closed_at or timezone.now()
    pending_overflows = Overflow.objects.filter(
        _period_overflow_filter(period),
        status=Overflow.STATUS_TCSO,
    ).distinct()

    for overflow in pending_overflows:
        overflow.status = Overflow.STATUS_CSO
        overflow.amount_to_approve = overflow.excess_amount
        overflow.approved_at = closed_at
        overflow.helper_name = helper_name or DEFAULT_HELPER_NAME
        overflow.resolution_type = Overflow.RESOLUTION_AUTO_CLOSE
        overflow.save(update_fields=[
            'status',
            'amount_to_approve',
            'approved_at',
            'helper_name',
            'resolution_type',
        ])


class Ticket(models.Model):
    """
    Represents a logical ticket/receipt/invoice that can contain multiple transactions.
    """
    ticket_number = models.CharField(
        max_length=50,
        unique=True,
        db_index=True,
        help_text="Unique ticket identifier (e.g. TICKET-20260209-001)"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_tickets'
    )
    customer_name = models.CharField(max_length=150, blank=True, null=True)
    notes = models.TextField(blank=True, null=True)
    is_refunded = models.BooleanField(default=False)
    refunded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = "Ticket"
        verbose_name_plural = "Tickets"

    def __str__(self):
        return self.ticket_number

    def save(self, *args, **kwargs):
        if not self.ticket_number:
            today = timezone.now().strftime('%Y%m%d')
            last = Ticket.objects.filter(
                ticket_number__startswith=f"TICKET-{today}"
            ).order_by('-ticket_number').first()
            seq = 1
            if last:
                last_seq = int(last.ticket_number.split('-')[-1])
                seq = last_seq + 1
            self.ticket_number = f"TICKET-{today}-{seq:04d}"
        super().save(*args, **kwargs)

    @property
    def total_amount(self):
        return self.transactions.aggregate(total=Sum('total_amount'))['total'] or Decimal('0.00')

    @property
    def transaction_count(self):
        return self.transactions.count()

    def refresh_refund_state(self):
        transactions_exist = self.transactions.exists()
        all_refunded = transactions_exist and not self.transactions.filter(is_refunded=False).exists()
        self.is_refunded = all_refunded
        self.refunded_at = timezone.now() if all_refunded else None
        self.save(update_fields=['is_refunded', 'refunded_at'])


class Transaction(models.Model):
    identifier = models.ForeignKey(Identifier, on_delete=models.CASCADE, related_name='transactions')
    total_amount = models.DecimalField(max_digits=12, decimal_places=2)
    timestamp = models.DateTimeField(auto_now_add=True)
    order_number = models.CharField(max_length=20, unique=True, blank=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    is_refunded = models.BooleanField(default=False)
    refunded_at = models.DateTimeField(null=True, blank=True)

    # Link to Ticket
    ticket = models.ForeignKey(
        Ticket,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='transactions'
    )

    class Meta:
        ordering = ['-timestamp']

    def __str__(self):
        return f"{self.order_number} | {self.identifier} ← {self.total_amount}"

    @property
    def period(self):
        return _get_transaction_period(self)

    def save(self, *args, **kwargs):
        if not self.order_number:
            last = Transaction.objects.order_by('-id').first()
            seq = (last.id + 1) if last else 1
            self.order_number = f'FB-{seq:06d}'

        is_new = self.pk is None
        super().save(*args, **kwargs)

        if is_new:
            self._allocate_to_ledgers()

    def _allocate_to_ledgers(self):
        open_period = Period.get_open_period()
        if not open_period:
            raise ValidationError("No open period available.")

        active_ledgers = Ledger.objects.filter(
            is_active=True,
            period=open_period,
            is_capacity_reserve=False,
        ).order_by('priority')
        if not active_ledgers.exists():
            raise ValidationError("No active ledgers available in the current open period.")

        manual_allocations = getattr(self, '_manual_allocations', None)
        if manual_allocations:
            remaining = _allocate_manual_transaction_amount(
                self,
                self.total_amount,
                open_period,
                manual_allocations,
            )
        else:
            remaining = _allocate_transaction_amount(self, self.total_amount, open_period)

        if remaining > 0:
            Overflow.objects.create(
                transaction=self,
                excess_amount=remaining,
                status=Overflow.STATUS_TCSO
            )


class LedgerAllocation(models.Model):
    transaction = models.ForeignKey(Transaction, on_delete=models.CASCADE, related_name='allocations')
    ledger = models.ForeignKey(Ledger, on_delete=models.PROTECT, related_name='allocations')
    amount = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        ordering = ['ledger__priority']

    def __str__(self):
        return f"{self.transaction.order_number} ← {self.amount} ({self.ledger.name})"


class Collaborator(models.Model):
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name='collaborators')
    username = models.CharField(max_length=150)
    full_name = models.CharField(max_length=150)
    email = models.EmailField()
    phone_number = models.CharField(max_length=50)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['username', 'id']
        constraints = [
            models.UniqueConstraint(fields=['owner', 'username'], name='unique_collaborator_username_per_owner'),
        ]

    def __str__(self):
        return f"{self.username} ({self.owner.username})"


class Overflow(models.Model):
    STATUS_TCSO = 'TCSO'
    STATUS_CSO = 'CSO'
    STATUS_REFUNDED = 'RFND'

    RESOLUTION_APPROVE = 'APPROVE'
    RESOLUTION_AUTO_CLOSE = 'AUTO_CLOSE'
    RESOLUTION_REFUND_OVERFLOW = 'REFUND_OVERFLOW'
    RESOLUTION_REFUND_TRANSACTION = 'REFUND_TRANSACTION'
    RESOLUTION_REFUND_TICKET = 'REFUND_TICKET'

    STATUS_CHOICES = (
        (STATUS_TCSO, 'Take Care Spill Over'),
        (STATUS_CSO, 'Completed Spill Over'),
        (STATUS_REFUNDED, 'Refunded'),
    )
    RESOLUTION_CHOICES = (
        (RESOLUTION_APPROVE, 'Approved'),
        (RESOLUTION_AUTO_CLOSE, 'Auto Close'),
        (RESOLUTION_REFUND_OVERFLOW, 'Refund Overflow'),
        (RESOLUTION_REFUND_TRANSACTION, 'Refund Transaction'),
        (RESOLUTION_REFUND_TICKET, 'Refund Ticket'),
    )

    transaction = models.ForeignKey(Transaction, on_delete=models.CASCADE, related_name='overflows')
    excess_amount = models.DecimalField(max_digits=12, decimal_places=2)
    status = models.CharField(max_length=4, choices=STATUS_CHOICES, default=STATUS_TCSO)
    amount_to_approve = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    collaborators = models.ManyToManyField(Collaborator, blank=True, related_name='approved_overflows')
    approved_at = models.DateTimeField(null=True, blank=True)
    helper_name = models.CharField(max_length=150, blank=True, default='')
    resolution_type = models.CharField(max_length=32, choices=RESOLUTION_CHOICES, blank=True, default='')
    refunded_at = models.DateTimeField(null=True, blank=True)
    refund_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)

    @property
    def period(self):
        return _get_transaction_period(self.transaction)

    @property
    def approved_capacity_amount(self):
        return self.amount_to_approve or self.excess_amount

    def save(self, *args, **kwargs):
        if self.status == self.STATUS_REFUNDED:
            pass
        elif self.approved_at and self.status != self.STATUS_CSO:
            self.status = self.STATUS_CSO
        elif self.status == self.STATUS_CSO and self.approved_at is None:
            self.approved_at = timezone.now()
        elif self.status == self.STATUS_TCSO and self.approved_at is not None:
            self.approved_at = None

        super().save(*args, **kwargs)

        if self.status == self.STATUS_CSO:
            leftover = self.excess_amount - (self.amount_to_approve or Decimal('0.00'))
            if leftover > 0:
                self.excess_amount = self.amount_to_approve or Decimal('0.00')
                super().save(update_fields=['excess_amount'])
                Overflow.objects.create(
                    transaction=self.transaction,
                    excess_amount=leftover,
                    status=self.STATUS_TCSO
                )

    def __str__(self):
        return f"{self.status} - {self.transaction.order_number}"


class IdentifierCapacityAdjustment(models.Model):
    TYPE_APPROVAL_EXTRA = 'APPROVAL_EXTRA'
    TYPE_REFUND_CSO = 'REFUND_CSO'

    TYPE_CHOICES = (
        (TYPE_APPROVAL_EXTRA, 'Approved Extra Capacity'),
        (TYPE_REFUND_CSO, 'Refunded CSO Capacity'),
    )

    identifier = models.ForeignKey(
        Identifier,
        on_delete=models.CASCADE,
        related_name='capacity_adjustments',
    )
    period = models.ForeignKey(
        Period,
        on_delete=models.CASCADE,
        related_name='capacity_adjustments',
    )
    overflow = models.ForeignKey(
        Overflow,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='capacity_adjustments',
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    adjustment_type = models.CharField(
        max_length=32,
        choices=TYPE_CHOICES,
        default=TYPE_APPROVAL_EXTRA,
    )
    helper_name = models.CharField(max_length=150, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at', 'id']

    def __str__(self):
        return f"{self.identifier.number} +{self.amount} ({self.period.name})"

    @classmethod
    def get_available_capacity(cls, identifier, period):
        granted = cls.objects.filter(
            identifier=identifier,
            period=period,
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')

        used = LedgerAllocation.objects.filter(
            transaction__identifier=identifier,
            ledger__period=period,
            ledger__is_capacity_reserve=True,
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')

        return granted - used


class OverflowNotification(models.Model):
    TYPE_PRE_CLOSE = 'PRE_CLOSE'

    TYPE_CHOICES = (
        (TYPE_PRE_CLOSE, 'Pre-close pending overflow'),
    )

    overflow = models.ForeignKey(
        Overflow,
        on_delete=models.CASCADE,
        related_name='notifications',
    )
    period = models.ForeignKey(
        Period,
        on_delete=models.CASCADE,
        related_name='overflow_notifications',
    )
    notification_type = models.CharField(max_length=32, choices=TYPE_CHOICES)
    message = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at', '-id']
        constraints = [
            models.UniqueConstraint(
                fields=['overflow', 'notification_type'],
                name='unique_overflow_notification_type',
            ),
        ]

    def __str__(self):
        return f"{self.notification_type} - {self.overflow}"


def _grant_capacity_adjustment(overflow, amount, adjustment_type, helper_name):
    if amount <= 0:
        return None

    period = overflow.period
    if period is None:
        return None

    Ledger.get_capacity_reserve(period, create=True)
    return IdentifierCapacityAdjustment.objects.create(
        identifier=overflow.transaction.identifier,
        period=period,
        overflow=overflow,
        amount=amount,
        adjustment_type=adjustment_type,
        helper_name=helper_name or DEFAULT_HELPER_NAME,
    )


def _refund_capacity_amount_for_overflow(overflow):
    approval_extra = overflow.capacity_adjustments.filter(
        adjustment_type=IdentifierCapacityAdjustment.TYPE_APPROVAL_EXTRA,
    ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
    return max((overflow.amount_to_approve or Decimal('0.00')) - approval_extra, Decimal('0.00'))


def refund_overflow(overflow, helper_name, resolution_type, refunded_at=None):
    refunded_at = refunded_at or timezone.now()
    helper_name = helper_name or DEFAULT_HELPER_NAME
    period = overflow.period

    if overflow.status == Overflow.STATUS_REFUNDED:
        return overflow

    if overflow.status == Overflow.STATUS_CSO:
        refund_capacity = _refund_capacity_amount_for_overflow(overflow)
        _grant_capacity_adjustment(
            overflow,
            refund_capacity,
            IdentifierCapacityAdjustment.TYPE_REFUND_CSO,
            helper_name,
        )

    overflow.status = Overflow.STATUS_REFUNDED
    overflow.refunded_at = refunded_at
    overflow.refund_amount = overflow.amount_to_approve or overflow.excess_amount
    overflow.helper_name = helper_name
    overflow.resolution_type = resolution_type
    overflow.save(update_fields=[
        'status',
        'refunded_at',
        'refund_amount',
        'helper_name',
        'resolution_type',
    ])

    if period:
        _retry_pending_overflows(period, overflow.transaction.identifier)
    return overflow


def refund_transactions(transactions, helper_name, resolution_type, refunded_at=None):
    refunded_at = refunded_at or timezone.now()
    helper_name = helper_name or DEFAULT_HELPER_NAME
    affected_pairs = set()

    for transaction_obj in transactions:
        if transaction_obj.is_refunded:
            continue

        period = transaction_obj.period
        if period:
            affected_pairs.add((period.id, transaction_obj.identifier_id))

        for overflow in transaction_obj.overflows.exclude(status=Overflow.STATUS_REFUNDED):
            refund_overflow(
                overflow,
                helper_name=helper_name,
                resolution_type=resolution_type,
                refunded_at=refunded_at,
            )

        transaction_obj.allocations.all().delete()
        transaction_obj.is_refunded = True
        transaction_obj.refunded_at = refunded_at
        transaction_obj.save(update_fields=['is_refunded', 'refunded_at'])

        if transaction_obj.ticket_id:
            transaction_obj.ticket.refresh_refund_state()

    for period_id, identifier_id in affected_pairs:
        period = Period.objects.filter(pk=period_id).first()
        identifier = Identifier.objects.filter(pk=identifier_id).first()
        if period and identifier:
            _retry_pending_overflows(period, identifier)


class Profile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')

    ROLE_CHOICES = (
        ('admin', 'Administrator'),
        ('user', 'Regular User'),
    )
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='user')

    phone_number = models.CharField(max_length=50, blank=True, default='')
    avatar = models.ImageField(upload_to='profile_avatars/', blank=True, null=True)
    master_override_password = models.CharField(max_length=128, blank=True, null=True)
    last_activity = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.username} ({self.role})"

    def set_master_override_password(self, raw_password):
        self.master_override_password = make_password(raw_password)

    def clear_master_override_password(self):
        self.master_override_password = ''

    def check_master_override_password(self, raw_password):
        if self.role != 'admin':
            return False

        stored_value = (self.master_override_password or '').strip()
        if not stored_value:
            return False

        try:
            identify_hasher(stored_value)
            return check_password(raw_password, stored_value)
        except Exception:
            return stored_value == raw_password

    class Meta:
        verbose_name = "User Profile"
        verbose_name_plural = "User Profiles"


class AuditLog(models.Model):
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='audit_logs')
    action = models.CharField(max_length=100)
    timestamp = models.DateTimeField(default=timezone.now, db_index=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    target_model = models.CharField(max_length=100, blank=True)
    target_id = models.PositiveIntegerField(null=True, blank=True)
    details = models.TextField(blank=True)
    changes = models.JSONField(null=True, blank=True, default=dict)

    def __str__(self):
        return f"{self.action} by {self.user or 'System'} at {self.timestamp:%Y-%m-%d %H:%M}"

    class Meta:
        ordering = ['-timestamp']
        verbose_name = "Audit Log Entry"
        verbose_name_plural = "Audit Logs"
        indexes = [
            models.Index(fields=['timestamp']),
            models.Index(fields=['action']),
        ]


class PasswordResetToken(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='password_reset_tokens')
    selector = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    token_hash = models.CharField(max_length=128)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['selector']),
            models.Index(fields=['expires_at']),
        ]

    def __str__(self):
        return f"Password reset token for {self.user.username}"

    @property
    def is_active(self):
        return self.used_at is None and self.expires_at > timezone.now()

    def check_token(self, raw_token):
        return self.is_active and check_password(raw_token, self.token_hash)

    def mark_used(self, used_at=None):
        if used_at is None:
            used_at = timezone.now()
        self.used_at = used_at
        self.save(update_fields=['used_at'])

    @classmethod
    def issue_for_user(cls, user, expiry_hours=2):
        cls.objects.filter(user=user, used_at__isnull=True).update(used_at=timezone.now())

        raw_token = secrets.token_urlsafe(32)
        reset_token = cls.objects.create(
            user=user,
            token_hash=make_password(raw_token),
            expires_at=timezone.now() + timezone.timedelta(hours=expiry_hours),
        )
        return reset_token, raw_token
