from rest_framework import serializers
from .models import Ledger, Identifier, Transaction, LedgerAllocation, Overflow, Profile


class LedgerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Ledger
        fields = '__all__'


class IdentifierSerializer(serializers.ModelSerializer):
    current_utilization = serializers.ReadOnlyField()
    remaining_capacity = serializers.ReadOnlyField()
    current_overflow_amount = serializers.ReadOnlyField()
    total_overflow_amount = serializers.ReadOnlyField()
    # Optional: if you implement amount_history_str later
    # amount_history_str = serializers.SerializerMethodField()

    class Meta:
        model = Identifier
        fields = [
            'id', 'number',
            'current_utilization',
            'remaining_capacity',
            'current_overflow_amount',
            'total_overflow_amount',
            # 'amount_history_str',
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

    class Meta:
        model = Transaction
        fields = [
            'id',
            'identifier',
            'identifier_number',
            'total_amount',
            'timestamp',
            'order_number',
            'created_by',
            'allocations',
            'overflows',
        ]
        read_only_fields = ['order_number', 'timestamp', 'created_by', 'allocations', 'overflows']


class ProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = Profile
        fields = '__all__'