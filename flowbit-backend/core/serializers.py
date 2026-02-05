from rest_framework import serializers
from .models import Ledger, Identifier, Transaction, Overflow, Profile

class LedgerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Ledger
        fields = '__all__'

class IdentifierSerializer(serializers.ModelSerializer):
    current_utilization = serializers.ReadOnlyField()
    remaining_capacity = serializers.ReadOnlyField()
    amount_history_str = serializers.ReadOnlyField()

    class Meta:
        model = Identifier
        fields = [
            'id', 'number',
            'current_utilization', 'remaining_capacity',
            'amount_history_str'
        ]

class TransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Transaction
        fields = '__all__'
        read_only_fields = ['order_number', 'timestamp', 'created_by']

class OverflowSerializer(serializers.ModelSerializer):
    class Meta:
        model = Overflow
        fields = '__all__'