from django.contrib import admin
from django.urls import reverse
from django.utils.html import format_html
from .models import (
    Period,
    Ledger,
    Identifier,
    IdentifierCapacityAdjustment,
    OverflowNotification,
    UserNotification,
    SupportCase,
    SupportMessage,
    Transaction,
    LedgerAllocation,
    Overflow,
    Collaborator,
    Profile,
    AuditLog,
    PasswordResetToken,
    Ticket,
)


@admin.register(Period)
class PeriodAdmin(admin.ModelAdmin):
    list_display = ('name', 'start_date', 'end_date', 'is_open', 'closed_at')
    list_filter = ('is_open',)
    search_fields = ('name',)


@admin.register(Ledger)
class LedgerAdmin(admin.ModelAdmin):
    list_display = ('name', 'period', 'priority', 'limit_per_identifier', 'is_active', 'end_date')
    list_filter = ('is_active', 'priority', 'period')
    search_fields = ('name', 'period__name')


@admin.register(Identifier)
class IdentifierAdmin(admin.ModelAdmin):
    list_display = (
        'number',
        'utilization_display',
        'remaining_display',
        'pending_overflow_display',
        'confirmed_overflow_display',
    )
    search_fields = ('number',)
    readonly_fields = (
        'current_utilization',
        'remaining_capacity',
        'current_overflow_amount',
        'confirmed_overflow_amount',
        'total_overflow_amount',
    )

    def utilization_display(self, obj):
        return f"{obj.current_utilization:,.2f}"
    utilization_display.short_description = "Utilization (incl. overflow)"

    def remaining_display(self, obj):
        return f"{obj.remaining_capacity:,.2f}"
    remaining_display.short_description = "Remaining Capacity"

    def pending_overflow_display(self, obj):
        return f"{obj.current_overflow_amount:,.2f}"
    pending_overflow_display.short_description = "Pending Overflow"

    def confirmed_overflow_display(self, obj):
        return f"{obj.confirmed_overflow_amount:,.2f}"
    confirmed_overflow_display.short_description = "Confirmed Overflow"


@admin.register(Ticket)
class TicketAdmin(admin.ModelAdmin):
    list_display = (
        'ticket_number',
        'created_at',
        'created_by',
        'customer_name',
        'is_refunded',
        'total_amount_display',
        'transaction_count',
    )
    list_filter = ('created_at', 'created_by')
    search_fields = ('ticket_number', 'customer_name', 'notes')
    date_hierarchy = 'created_at'
    readonly_fields = ('total_amount_display', 'transaction_count', 'created_at')

    def total_amount_display(self, obj):
        return f"{obj.total_amount:,.2f}"
    total_amount_display.short_description = "Total Amount"


class LedgerAllocationInline(admin.TabularInline):
    model = LedgerAllocation
    extra = 0
    readonly_fields = ('ledger', 'amount')
    can_delete = False


class OverflowInline(admin.TabularInline):
    model = Overflow
    extra = 0
    readonly_fields = (
        'excess_amount',
        'status',
        'approved_at',
        'amount_to_approve',
        'helper_name',
        'resolution_type',
        'refunded_at',
    )
    fields = (
        'status',
        'excess_amount',
        'amount_to_approve',
        'approved_at',
        'helper_name',
        'resolution_type',
        'refunded_at',
        'collaborators',
    )


@admin.register(Transaction)
class TransactionAdmin(admin.ModelAdmin):
    list_display = (
        'ticket_link',
        'order_number',
        'identifier',
        'total_amount',
        'is_refunded',
        'timestamp',
        'created_by',
        'get_ledgers_summary',
        'get_overflow_summary',
    )
    list_filter = ('timestamp', 'created_by', 'identifier', 'ticket')
    search_fields = ('order_number', 'identifier__number', 'ticket__ticket_number')
    readonly_fields = ('order_number', 'timestamp', 'created_by')
    list_select_related = ('ticket', 'identifier')
    inlines = [LedgerAllocationInline, OverflowInline]
    date_hierarchy = 'timestamp'

    def ticket_link(self, obj):
        if obj.ticket:
            url = reverse("admin:core_ticket_change", args=(obj.ticket.id,))
            return format_html('<a href="{}">{}</a>', url, obj.ticket.ticket_number)
        return "-"
    ticket_link.short_description = "Ticket"

    def get_ledgers_summary(self, obj):
        allocations = obj.allocations.all()
        if not allocations.exists():
            return "-"
        parts = [f"{a.amount} ({a.ledger.name})" for a in allocations]
        return ", ".join(parts)
    get_ledgers_summary.short_description = "Allocations"

    def get_overflow_summary(self, obj):
        overflows = obj.overflows.all()
        if not overflows.exists():
            return "-"
        parts = [f"{o.excess_amount} ({o.status})" for o in overflows]
        return ", ".join(parts)
    get_overflow_summary.short_description = "Overflow"


@admin.register(LedgerAllocation)
class LedgerAllocationAdmin(admin.ModelAdmin):
    list_display = ('transaction', 'ledger', 'amount')
    list_filter = ('ledger',)
    search_fields = ('transaction__order_number', 'ledger__name')


@admin.register(Overflow)
class OverflowAdmin(admin.ModelAdmin):
    list_display = (
        'transaction',
        'excess_amount',
        'status',
        'approved_at',
        'amount_to_approve',
        'helper_name',
        'refunded_at',
    )
    list_filter = ('status',)
    search_fields = ('transaction__order_number',)
    readonly_fields = ('transaction', 'excess_amount')


@admin.register(IdentifierCapacityAdjustment)
class IdentifierCapacityAdjustmentAdmin(admin.ModelAdmin):
    list_display = ('identifier', 'period', 'amount', 'adjustment_type', 'helper_name', 'created_at')
    list_filter = ('adjustment_type', 'period')
    search_fields = ('identifier__number', 'helper_name')


@admin.register(OverflowNotification)
class OverflowNotificationAdmin(admin.ModelAdmin):
    list_display = ('overflow', 'period', 'notification_type', 'created_at')
    list_filter = ('notification_type', 'period')
    search_fields = ('overflow__transaction__order_number', 'message')


@admin.register(UserNotification)
class UserNotificationAdmin(admin.ModelAdmin):
    list_display = ('recipient', 'category', 'level', 'title', 'created_by', 'period', 'read_at', 'created_at')
    list_filter = ('category', 'level', 'period', 'created_at')
    search_fields = ('recipient__username', 'title', 'message', 'created_by__username')


class SupportMessageInline(admin.TabularInline):
    model = SupportMessage
    extra = 0
    readonly_fields = ('sender', 'body', 'created_at')
    can_delete = False


@admin.register(SupportCase)
class SupportCaseAdmin(admin.ModelAdmin):
    list_display = ('subject', 'created_by', 'status', 'closed_by', 'last_message_at', 'created_at')
    list_filter = ('status', 'created_at', 'closed_at')
    search_fields = ('subject', 'created_by__username', 'messages__body')
    inlines = [SupportMessageInline]


@admin.register(SupportMessage)
class SupportMessageAdmin(admin.ModelAdmin):
    list_display = ('support_case', 'sender', 'created_at')
    list_filter = ('created_at',)
    search_fields = ('support_case__subject', 'sender__username', 'body')


@admin.register(Collaborator)
class CollaboratorAdmin(admin.ModelAdmin):
    list_display = ('username', 'full_name', 'owner', 'email', 'phone_number', 'created_at')
    list_filter = ('owner',)
    search_fields = ('username', 'full_name', 'email', 'phone_number', 'owner__username')


@admin.register(Profile)
class ProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'role', 'created_at')
    list_filter = ('role',)
    search_fields = ('user__username',)


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ('action', 'user', 'timestamp', 'target_model', 'target_id', 'ip_address')
    list_filter = ('action', 'target_model', 'timestamp')
    search_fields = ('action', 'details', 'target_model', 'user__username')
    readonly_fields = ('user', 'action', 'timestamp', 'ip_address', 'target_model', 'target_id', 'details', 'changes')
    date_hierarchy = 'timestamp'

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(PasswordResetToken)
class PasswordResetTokenAdmin(admin.ModelAdmin):
    list_display = ('user', 'selector', 'expires_at', 'used_at', 'created_at')
    search_fields = ('user__username', 'user__email', 'selector')
    list_filter = ('expires_at', 'used_at', 'created_at')
    readonly_fields = ('user', 'selector', 'expires_at', 'used_at', 'created_at')

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
