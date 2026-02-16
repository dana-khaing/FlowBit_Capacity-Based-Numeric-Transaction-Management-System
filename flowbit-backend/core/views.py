from rest_framework import viewsets, generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticatedOrReadOnly
from django.db import transaction as db_transaction
from django.utils import timezone
from django.http import HttpResponse
from django.db.models import Sum
from decimal import Decimal, InvalidOperation
from .models import Ledger, Identifier, Transaction, Overflow, Ticket
from .serializers import LedgerSerializer, IdentifierSerializer, TransactionSerializer, OverflowSerializer, TicketSerializer


class LedgerViewSet(viewsets.ModelViewSet):
    queryset = Ledger.objects.all()
    serializer_class = LedgerSerializer
    permission_classes =[]

    @action(detail=True, methods=['post'], url_path='close')
    def close_ledger(self, request, pk=None):
        """
        POST /api/ledgers/{id}/close/
        
        Manually close a ledger (set is_active=False)
        """
        ledger = self.get_object()
        
        if not ledger.is_active:
            return Response(
                {"detail": "Ledger is already closed"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        ledger.is_active = False
        ledger.save()
        
        serializer = self.get_serializer(ledger)
        return Response({
            "message": f"Ledger '{ledger.name}' closed successfully",
            "ledger": serializer.data
        }, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'], url_path='auto-close-expired')
    def auto_close_expired(self, request):
        """
        POST /api/ledgers/auto-close-expired/
        
        Close all ledgers that have passed their end_date
        This can be called by a cron job or manually
        
        Returns list of closed ledgers
        """
        now = timezone.now()
        
        expired_ledgers = Ledger.objects.filter(
            is_active=True,
            end_date__lte=now
        )
        
        closed_ledgers = []
        
        with db_transaction.atomic():
            for ledger in expired_ledgers:
                ledger.is_active = False
                ledger.save()
                closed_ledgers.append({
                    'id': ledger.id,
                    'name': ledger.name,
                    'end_date': ledger.end_date,
                    'closed_at': now
                })
        
        return Response({
            "message": f"Closed {len(closed_ledgers)} expired ledger(s)",
            "closed_ledgers": closed_ledgers
        }, status=status.HTTP_200_OK)


class IdentifierViewSet(viewsets.ModelViewSet):
    queryset = Identifier.objects.all()
    serializer_class = IdentifierSerializer
    # permission_classes =[IsAuthenticatedOrReadOnly]


class TransactionViewSet(viewsets.ModelViewSet):
    queryset = Transaction.objects.all()
    serializer_class = TransactionSerializer


class OverflowViewSet(viewsets.ModelViewSet):
    queryset = Overflow.objects.all()
    serializer_class = OverflowSerializer

    @action(detail=False, methods=['get'], url_path='pending')
    def pending_overflows(self, request):
        """GET /api/overflows/pending/ - Get all TCSO (red) overflows"""
        pending = Overflow.objects.filter(status='TCSO').select_related(
            'transaction__identifier',
            'transaction__ticket'
        ).order_by('-transaction__timestamp')
        serializer = self.get_serializer(pending, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'], url_path='approved')
    def approved_overflows(self, request):
        """GET /api/overflows/approved/ - Get all CSO (green) overflows"""
        approved = Overflow.objects.filter(status='CSO').select_related(
            'transaction__identifier',
            'transaction__ticket'
        ).order_by('-approved_at')
        serializer = self.get_serializer(approved, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='approve')
    def approve_overflow(self, request, pk=None):
        """POST /api/overflows/{id}/approve/ - Approve overflow with collaborators"""
        overflow = self.get_object()
        
        if overflow.status == 'CSO':
            return Response(
                {"detail": "Already approved"}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        amount_str = request.data.get('amount_to_approve')
        collaborator_ids = request.data.get('collaborator_ids', [])
        
        if amount_str:
            try:
                amount = Decimal(str(amount_str))
                if amount <= 0 or amount > overflow.excess_amount:
                    return Response(
                        {"detail": "Invalid approval amount"},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                overflow.amount_to_approve = amount
            except (InvalidOperation, ValueError):
                return Response(
                    {"detail": "Invalid amount format"},
                    status=status.HTTP_400_BAD_REQUEST
                )
        else:
            overflow.amount_to_approve = overflow.excess_amount
        
        overflow.status = 'CSO'
        overflow.approved_at = timezone.now()
        overflow.save()
        
        if collaborator_ids:
            from django.contrib.auth.models import User
            collaborators = User.objects.filter(id__in=collaborator_ids)
            overflow.collaborators.set(collaborators)
        
        serializer = self.get_serializer(overflow)
        return Response({
            "message": "Approved successfully",
            "overflow": serializer.data
        }, status=status.HTTP_200_OK)


class TicketListView(generics.ListAPIView):
    queryset = Ticket.objects.all().order_by('-created_at')
    serializer_class = TicketSerializer
    permission_classes = []


class TicketDetailView(generics.RetrieveAPIView):
    queryset = Ticket.objects.all()
    serializer_class = TicketSerializer
    permission_classes = []
    lookup_field = 'ticket_number'


class CreateTicketWithTransactions(APIView):
    """
    POST: Create one ticket + multiple transactions in one request.
    
    Example payload:
    {
        "customer_name": "John Doe",
        "notes": "Quick service request",
        "items": [
            {"identifier": 1, "amount": "2500.00"},
            {"identifier": 3, "amount": "4800.50"},
            {"identifier": 1, "amount": "1200.00"}
        ]
    }
    """
    permission_classes = []

    @db_transaction.atomic
    def post(self, request):
        data = request.data

        # 1. Validate required fields
        items = data.get('items')
        if not items or not isinstance(items, list):
            return Response(
                {"detail": "Field 'items' must be a non-empty list"},
                status=status.HTTP_400_BAD_REQUEST
            )

        # 2. Create the ticket
        ticket = Ticket.objects.create(
            customer_name=data.get('customer_name', '').strip()[:150],
            notes=data.get('notes', '').strip(),
            created_by=request.user if request.user.is_authenticated else None
        )

        created_items = []
        errors = []

        # 3. Process each item
        for idx, item in enumerate(items, 1):
            try:
                identifier_id = item.get('identifier')
                amount_str = item.get('amount')

                if not identifier_id:
                    errors.append(f"Item {idx}: missing 'identifier'")
                    continue

                if not amount_str:
                    errors.append(f"Item {idx}: missing 'amount'")
                    continue

                # Validate amount
                try:
                    amount = Decimal(str(amount_str))
                    if amount <= 0:
                        raise ValueError("Amount must be positive")
                except (InvalidOperation, ValueError) as e:
                    errors.append(f"Item {idx}: invalid amount '{amount_str}' – {e}")
                    continue

                # Get identifier
                try:
                    identifier = Identifier.objects.get(id=identifier_id)
                except Identifier.DoesNotExist:
                    errors.append(f"Item {idx}: identifier ID {identifier_id} not found")
                    continue

                # Create transaction → this triggers allocation & overflow logic
                tx = Transaction.objects.create(
                    ticket=ticket,
                    identifier=identifier,
                    total_amount=amount,
                    created_by=request.user if request.user.is_authenticated else None
                )

                created_items.append({
                    "order_number": tx.order_number,
                    "identifier": identifier.number,
                    "amount": str(tx.total_amount),
                    "id": tx.id
                })

            except Exception as e:
                errors.append(f"Item {idx}: unexpected error – {str(e)}")

        # 4. If there were errors → rollback is automatic thanks to @transaction.atomic
        if errors:
            return Response(
                {
                    "detail": "Some items failed",
                    "created": created_items,
                    "errors": errors,
                    "ticket_id": ticket.id,
                    "ticket_number": ticket.ticket_number
                },
                status=status.HTTP_207_MULTI_STATUS
            )

        # 5. Success
        return Response({
            "message": "Ticket and all transactions created successfully",
            "ticket": TicketSerializer(ticket).data,
            "transactions": created_items,
            "total_amount": str(ticket.total_amount),
            "transaction_count": ticket.transaction_count
        }, status=status.HTTP_201_CREATED)