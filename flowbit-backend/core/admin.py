from django.contrib import admin
from .models import Ledger, Identifier, Transaction, LedgerAllocation, Overflow, Profile, AuditLog


@admin.register(Ledger)
class LedgerAdmin(admin.ModelAdmin):
    list_display = ('name', 'priority', 'limit_per_identifier', 'is_active', 'end_date')
    list_filter = ('is_active', 'priority')
    search_fields = ('name',)


@admin.register(Identifier)
class IdentifierAdmin(admin.ModelAdmin):
    list_display = (
        'number',
        'utilization_display',
        'remaining_display',
        'pending_overflow_display',
        'confirmed_overflow_display',  # fixed name
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


class LedgerAllocationInline(admin.TabularInline):
    model = LedgerAllocation
    extra = 0
    readonly_fields = ('ledger', 'amount')
    can_delete = False


class OverflowInline(admin.TabularInline):
    model = Overflow
    extra = 0
    readonly_fields = ('excess_amount', 'status', 'approved_at', 'amount_to_approve')
    fields = ('status', 'excess_amount', 'amount_to_approve', 'approved_at', 'collaborators')


@admin.register(Transaction)
class TransactionAdmin(admin.ModelAdmin):
    list_display = (
        'order_number',
        'identifier',
        'total_amount',
        'timestamp',
        'created_by',
        'get_ledgers_summary',
        'get_overflow_summary',
    )
    list_filter = ('timestamp', 'created_by', 'identifier')
    search_fields = ('order_number', 'identifier__number')
    readonly_fields = ('order_number', 'total_amount', 'timestamp', 'identifier', 'created_by')
    inlines = [LedgerAllocationInline, OverflowInline]
    date_hierarchy = 'timestamp'

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
    list_display = ('transaction', 'excess_amount', 'status', 'approved_at', 'amount_to_approve')
    list_filter = ('status',)
    search_fields = ('transaction__order_number',)
    readonly_fields = ('transaction', 'excess_amount')


@admin.register(Profile)
class ProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'role', 'created_at')
    list_filter = ('role',)
    search_fields = ('user__username',)


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ('action', 'user', 'timestamp', 'target_model', 'target_id')
    list_filter = ('action', 'timestamp')
    search_fields = ('action', 'details')
    readonly_fields = ('timestamp', 'ip_address', 'changes')
    date_hierarchy = 'timestamp'