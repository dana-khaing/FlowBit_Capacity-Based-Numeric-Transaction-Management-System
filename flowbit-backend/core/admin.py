from django.contrib import admin
from .models import (
    Ledger,
    Identifier,
    Transaction,
    Overflow,
    Profile,
    AuditLog,
)


@admin.register(Ledger)
class LedgerAdmin(admin.ModelAdmin):
    list_display = ('name', 'end_date', 'limit_per_identifier', 'priority', 'is_active')
    list_filter = ('is_active', 'priority')
    search_fields = ('name',)


@admin.register(Identifier)
class IdentifierAdmin(admin.ModelAdmin):
    list_display = ('number', 'current_utilization', 'remaining_capacity')
    search_fields = ('number',)
    readonly_fields = ('current_utilization', 'remaining_capacity')


@admin.register(Transaction)
class TransactionAdmin(admin.ModelAdmin):
    list_display = (
        'order_number',
        'identifier',
        'amount',
        'ledger',
        'timestamp',
        'created_by',
        'is_overflow',
    )
    list_filter = ('ledger', 'is_overflow')
    search_fields = ('order_number', 'identifier__number')
    readonly_fields = ('order_number', 'timestamp')


@admin.register(Overflow)
class OverflowAdmin(admin.ModelAdmin):
    list_display = ('transaction', 'status', 'excess_amount', 'approved_at')
    list_filter = ('status',)


admin.site.register(Profile)
admin.site.register(AuditLog)