from django.db import models
from django.contrib.auth.models import User
from django.db.models import Sum
from decimal import Decimal
from django.core.exceptions import ValidationError
from django.utils import timezone


class Ledger(models.Model):
    name = models.CharField(max_length=100, default='Default Ledger')
    end_date = models.DateTimeField()
    limit_per_identifier = models.DecimalField(max_digits=12, decimal_places=2, default=100000.00)
    priority = models.IntegerField(default=1)  # lower = higher priority
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['priority', '-end_date']

    def __str__(self):
        return f"{self.name} (Priority: {self.priority})"


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
        total_limit = Ledger.objects.filter(is_active=True).aggregate(
            total=Sum('limit_per_identifier')
        )['total'] or Decimal('0.00')

        # Only count the part booked INSIDE the limits
        normal_usage = LedgerAllocation.objects.filter(
            transaction__identifier=self
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')

        return total_limit - normal_usage

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


class Transaction(models.Model):
    identifier = models.ForeignKey(Identifier, on_delete=models.CASCADE, related_name='transactions')
    total_amount = models.DecimalField(max_digits=12, decimal_places=2)
    timestamp = models.DateTimeField(auto_now_add=True)
    order_number = models.CharField(max_length=20, unique=True, blank=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)

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
        active_ledgers = Ledger.objects.filter(is_active=True).order_by('priority')
        if not active_ledgers.exists():
            raise ValidationError("No active ledgers available.")

        remaining = self.total_amount

        for ledger in active_ledgers:
            if remaining <= 0:
                break

            current_usage = LedgerAllocation.objects.filter(
                transaction__identifier=self.identifier,
                ledger=ledger
            ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')

            available = ledger.limit_per_identifier - current_usage

            if available <= 0:
                continue

            assign_amount = min(remaining, available)

            LedgerAllocation.objects.create(
                transaction=self,
                ledger=ledger,
                amount=assign_amount
            )

            remaining -= assign_amount

        if remaining > 0:
            Overflow.objects.create(
                transaction=self,
                excess_amount=remaining,
                status='TCSO'
            )


class LedgerAllocation(models.Model):
    transaction = models.ForeignKey(Transaction, on_delete=models.CASCADE, related_name='allocations')
    ledger = models.ForeignKey(Ledger, on_delete=models.PROTECT, related_name='allocations')
    amount = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        ordering = ['ledger__priority']

    def __str__(self):
        return f"{self.transaction.order_number} ← {self.amount} ({self.ledger.name})"


class Overflow(models.Model):
    STATUS_CHOICES = (
        ('TCSO', 'Take Care Spill Over'),
        ('CSO', 'Completed Spill Over'),
    )

    transaction = models.ForeignKey(Transaction, on_delete=models.CASCADE, related_name='overflows')
    excess_amount = models.DecimalField(max_digits=12, decimal_places=2)
    status = models.CharField(max_length=4, choices=STATUS_CHOICES, default='TCSO')
    amount_to_approve = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    collaborators = models.ManyToManyField(User, blank=True, related_name='approved_overflows')
    approved_at = models.DateTimeField(null=True, blank=True)

    def save(self, *args, **kwargs):
        if self.approved_at and self.status != 'CSO':
            self.status = 'CSO'
        elif self.status == 'CSO' and self.approved_at is None:
            self.approved_at = timezone.now()
        elif self.status == 'TCSO' and self.approved_at is not None:
            self.approved_at = None

        super().save(*args, **kwargs)

        if self.status == 'CSO':
            leftover = self.excess_amount - (self.amount_to_approve or Decimal('0.00'))
            if leftover > 0:
                self.excess_amount = self.amount_to_approve or Decimal('0.00')
                super().save(update_fields=['excess_amount'])
                Overflow.objects.create(
                    transaction=self.transaction,
                    excess_amount=leftover,
                    status='TCSO'
                )

    def __str__(self):
        return f"{self.status} - {self.transaction.order_number}"


class Profile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')

    ROLE_CHOICES = (
        ('admin', 'Administrator'),
        ('user', 'Regular User'),
    )
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='user')

    master_override_password = models.CharField(max_length=128, blank=True, null=True)
    last_activity = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.username} ({self.role})"

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