from django.db import models
from django.contrib.auth.models import User
from django.db.models import Sum
from decimal import Decimal
from django.contrib.auth.models import User
from django.forms import ValidationError
from django.utils import timezone

class Ledger(models.Model):
    name = models.CharField(max_length=100, default='Default Ledger')
    end_date = models.DateTimeField()
    limit_per_identifier = models.DecimalField(max_digits=12, decimal_places=2, default=100000.00)
    priority = models.IntegerField(default=1)  # Editable - lower = higher priority
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
        total = self.transaction_set.aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
        return total

    @property
    def remaining_capacity(self):
        """
        Remaining capacity = total active limits - effective used amount.
        
        Effective used amount = 
        - Amounts from non-overflow transactions
        - + Only APPROVED (CSO) overflow excesses
        Pending (TCSO) overflows are NOT included → shows negative until approved.
        """
        # Total capacity from all active ledgers
        total_limit = Ledger.objects.filter(is_active=True).aggregate(
            total=Sum('limit_per_identifier')
        )['total'] or Decimal('0.00')

        # Sum of ALL transaction amounts (normal + overflow ones)
        total_transaction_amount = self.transaction_set.aggregate(
            total=Sum('amount')
        )['total'] or Decimal('0.00')

        # Subtract ONLY the excess from APPROVED (CSO) overflows
        # (this avoids double-counting the excess)
        approved_excess = Overflow.objects.filter(
            transaction__identifier=self,
            status='CSO'
        ).aggregate(
            total=Sum('excess_amount')
        )['total'] or Decimal('0.00')

        # Effective usage = total transactions - approved excesses (they're already in total_transaction_amount)
        effective_usage = total_transaction_amount - approved_excess

        return total_limit - effective_usage
    
    @property
    def pending_overflow_amount(self):
        """Total excess still in TCSO (pending) state."""
        return Overflow.objects.filter(
            transaction__identifier=self,
            status='TCSO'
        ).aggregate(total=Sum('excess_amount'))['total'] or Decimal('0.00')


    @property
    def approved_overflow_amount(self):
        """Total excess that has been approved (CSO)."""
        return Overflow.objects.filter(
            transaction__identifier=self,
            status='CSO'
        ).aggregate(total=Sum('excess_amount'))['total'] or Decimal('0.00')

# Transaction model to log each transaction with order number and overflow flag
class Transaction(models.Model):
    identifier = models.ForeignKey(Identifier, on_delete=models.CASCADE, related_name='transaction_set')
    ledger = models.ForeignKey(Ledger, on_delete=models.CASCADE, related_name='transactions')
    amount = models.DecimalField(max_digits=12, decimal_places=2) 
    timestamp = models.DateTimeField(auto_now_add=True)
    order_number = models.CharField(max_length=20, unique=True, blank=True)  # FB-000123
    is_overflow = models.BooleanField(default=False)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)

    class Meta:
        ordering = ['-timestamp']

    # Override save to auto-generate order number in the format FB-000001, FB-000002, etc.

    def save(self, *args, **kwargs):
        if not self.order_number:
            last = Transaction.objects.order_by('-id').first()
            seq = (last.id + 1) if last else 1
            self.order_number = f'FB-{seq:06d}'

        if self.pk is not None:
            super().save(*args, **kwargs)
            return

        active_ledgers = Ledger.objects.filter(is_active=True).order_by('priority')
        if not active_ledgers.exists():
            raise ValidationError("No active ledgers available.")

        remaining = self.amount
        assigned_ledger = None

        for ledger in active_ledgers:
            if remaining <= 0:
                break

            current_usage = Transaction.objects.filter(
                identifier=self.identifier,
                ledger=ledger
            ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')

            available = ledger.limit_per_identifier - current_usage

            if available >= remaining:
                assigned_ledger = ledger
                remaining = Decimal('0.00')
                break
            else:
                remaining -= available

        excess = remaining
        self.is_overflow = excess > 0
        self.ledger = assigned_ledger or active_ledgers.first()

        # Save transaction first (so it has PK)
        super().save(*args, **kwargs)

        # Always create a NEW overflow record if excess > 0
        if excess > 0:
            Overflow.objects.create(
                transaction=self,
                excess_amount=excess,           # only this transaction's excess
                status='TCSO'
            )

    def __str__(self):
        return f"{self.order_number} | {self.identifier} ← {self.amount}"

# Overflow model to track spill overs when limits are exceeded
class Overflow(models.Model):
    STATUS_CHOICES = (
        ('TCSO', 'Take Care Spill Over'),  # red / pending
        ('CSO', 'Completed Spill Over'),   # green / approved
    )
    transaction = models.OneToOneField(Transaction, on_delete=models.CASCADE, related_name='overflow')
    excess_amount = models.DecimalField(max_digits=12, decimal_places=2)
    status = models.CharField(max_length=4, choices=STATUS_CHOICES, default='TCSO')
    collaborators = models.ManyToManyField(User, blank=True, related_name='approved_overflows')
    approved_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.status} - {self.transaction}"
    




class Profile(models.Model):
    """
    Extends the built-in User model with Flowbit-specific fields.
    One-to-one relationship with User.
    """
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    
    # Role for access control (expandable later)
    ROLE_CHOICES = (
        ('admin', 'Administrator'),
        ('user', 'Regular User'),
    )
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='user')
    
    # For master override functionality (Phase 2)
    # Store hashed value – never store plain text!
    """In a real implementation, you would use Django's built-in password hashing utilities to set and check this value securely. The field is just a placeholder to indicate where the master override password would be stored."""
    master_override_password = models.CharField(max_length=128, blank=True, null=True)
    
    # Optional: track last login or other profile info
    last_activity = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.username} ({self.role})"

    class Meta:
        verbose_name = "User Profile"
        verbose_name_plural = "User Profiles"


class AuditLog(models.Model):
    """
    Tracks significant actions in the system for security and auditing.
    Useful for overrides, approvals, deletions, etc.
    """
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='audit_logs')
    action = models.CharField(max_length=100)  # e.g. 'override_transaction', 'approve_overflow', 'ledger_priority_changed'
    timestamp = models.DateTimeField(default=timezone.now, db_index=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    
    # What was affected
    target_model = models.CharField(max_length=100, blank=True)      # e.g. 'Transaction', 'Overflow'
    target_id = models.PositiveIntegerField(null=True, blank=True)   # ID of the affected object
    
    # Details – can be JSON string or text description
    details = models.TextField(blank=True)
    
    # Optional: old vs new values (as JSON)
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