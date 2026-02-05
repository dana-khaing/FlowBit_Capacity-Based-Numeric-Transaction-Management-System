from rest_framework import viewsets
from .models import Ledger, Identifier, Transaction, Overflow
from .serializers import LedgerSerializer, IdentifierSerializer, TransactionSerializer, OverflowSerializer

class LedgerViewSet(viewsets.ModelViewSet):
    queryset = Ledger.objects.all()
    serializer_class = LedgerSerializer

class IdentifierViewSet(viewsets.ModelViewSet):
    queryset = Identifier.objects.all()
    serializer_class = IdentifierSerializer

class TransactionViewSet(viewsets.ModelViewSet):
    queryset = Transaction.objects.all()
    serializer_class = TransactionSerializer

class OverflowViewSet(viewsets.ModelViewSet):
    queryset = Overflow.objects.all()
    serializer_class = OverflowSerializer