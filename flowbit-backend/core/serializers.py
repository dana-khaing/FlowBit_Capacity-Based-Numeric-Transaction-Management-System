from rest_framework import serializers
from .models import Period, Ledger, Identifier, Transaction, LedgerAllocation, Overflow, Profile, Ticket


class PeriodSerializer(serializers.ModelSerializer):
    ledger_count = serializers.SerializerMethodField()

    class Meta:
        model = Period
        fields = [
            'id',
            'name',
            'start_date',
            'end_date',
            'is_open',
            'closed_at',
            'created_at',
            'ledger_count',
        ]
        read_only_fields = ['closed_at', 'created_at', 'ledger_count']

    def get_ledger_count(self, obj):
        return obj.ledgers.count()


class LedgerSerializer(serializers.ModelSerializer):
    period_name = serializers.CharField(source='period.name', read_only=True, allow_null=True)

    class Meta:
        model = Ledger
        fields = [
            'id',
            'period',
            'period_name',
            'name',
            'end_date',
            'limit_per_identifier',
            'priority',
            'is_active',
            'closed_at',
            'created_at',
        ]

    def validate_period(self, value):
        if value and not value.is_open:
            raise serializers.ValidationError("Cannot assign a ledger to a closed period.")
        return value


class TicketSerializer(serializers.ModelSerializer):
    total_amount = serializers.ReadOnlyField()
    transaction_count = serializers.ReadOnlyField()
    created_by_username = serializers.CharField(source='created_by.username', read_only=True, default=None)

    class Meta:
        model = Ticket
        fields = [
            'id',
            'ticket_number',
            'created_at',
            'created_by',
            'created_by_username',
            'customer_name',
            'notes',
            'total_amount',
            'transaction_count',
        ]
        read_only_fields = ['ticket_number', 'created_at', 'total_amount', 'transaction_count']


class IdentifierSerializer(serializers.ModelSerializer):
    current_utilization = serializers.ReadOnlyField()
    remaining_capacity = serializers.ReadOnlyField()
    current_overflow_amount = serializers.ReadOnlyField()
    total_overflow_amount = serializers.ReadOnlyField()
    confirmed_overflow_amount = serializers.ReadOnlyField()

    class Meta:
        model = Identifier
        fields = [
            'id', 'number',
            'current_utilization',
            'remaining_capacity',
            'current_overflow_amount',
            'confirmed_overflow_amount',
            'total_overflow_amount',
        ]


class LedgerAllocationSerializer(serializers.ModelSerializer):
    ledger_name = serializers.CharField(source='ledger.name', read_only=True)

    class Meta:
        model = LedgerAllocation
        fields = ['id', 'ledger', 'ledger_name', 'amount']


class OverflowSerializer(serializers.ModelSerializer):
    class Meta:
        model = Overflow
        fields = '__all__'


class TransactionSerializer(serializers.ModelSerializer):
    allocations = LedgerAllocationSerializer(many=True, read_only=True)
    overflows = OverflowSerializer(many=True, read_only=True)
    identifier_number = serializers.CharField(source='identifier.number', read_only=True)
    ticket_number = serializers.CharField(source='ticket.ticket_number', read_only=True, allow_null=True)
    ticket_id = serializers.PrimaryKeyRelatedField(
        source='ticket',
        queryset=Ticket.objects.all(),
        required=False,
        allow_null=True
    )

    class Meta:
        model = Transaction
        fields = [
            'id',
            'ticket',
            'ticket_id',
            'ticket_number',
            'identifier',
            'identifier_number',
            'total_amount',
            'timestamp',
            'order_number',
            'created_by',
            'allocations',
            'overflows',
        ]
        read_only_fields = [
            'order_number',
            'timestamp',
            'created_by',
            'ticket_number',
            'allocations',
            'overflows',
        ]

    def validate(self, attrs):
        attrs = super().validate(attrs)

        open_period = Period.get_open_period()
        if not open_period:
            raise serializers.ValidationError("No open period available.")

        if not Ledger.objects.filter(is_active=True, period=open_period).exists():
            raise serializers.ValidationError(
                "No active ledgers available in the current open period."
            )

        return attrs


class ProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = Profile
        fields = '__all__'
