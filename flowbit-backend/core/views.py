# All imports organized in ONE place at the top
from rest_framework import viewsets, generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticatedOrReadOnly
from django.db import transaction as db_transaction, transaction
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from django.http import HttpResponse
from django.db.models import Sum
from django.core.exceptions import ValidationError
from decimal import Decimal, InvalidOperation
from datetime import datetime, time
import csv
from io import BytesIO
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from .models import Period, Ledger, Identifier, Transaction, Overflow, Ticket, LedgerAllocation, IdentifierCapacityAdjustment
from .serializers import PeriodSerializer, LedgerSerializer, IdentifierSerializer, TransactionSerializer, OverflowSerializer, TicketSerializer


def parse_period_value(value):
    if not value:
        return None

    parsed_datetime = parse_datetime(value)
    if parsed_datetime:
        if timezone.is_naive(parsed_datetime):
            return timezone.make_aware(parsed_datetime, timezone.get_current_timezone())
        return parsed_datetime

    parsed_date = parse_date(value)
    if parsed_date:
        parsed_datetime = datetime.combine(parsed_date, time.min)
        return timezone.make_aware(parsed_datetime, timezone.get_current_timezone())

    return None


def apply_ledger_period_filters(queryset, query_params, ledger_prefix=''):
    section = (query_params.get('section') or '').strip().lower()
    period_start = parse_period_value(query_params.get('period_start'))
    period_end = parse_period_value(query_params.get('period_end'))
    ledger_id = query_params.get('ledger_id')
    period_id = query_params.get('period_id')

    if section == 'active':
        queryset = queryset.filter(**{f'{ledger_prefix}is_active': True})
    elif section in {'archive', 'archived', 'closed', 'inactive'}:
        queryset = queryset.filter(**{f'{ledger_prefix}is_active': False})

    if period_start:
        queryset = queryset.filter(**{f'{ledger_prefix}end_date__gte': period_start})

    if period_end:
        queryset = queryset.filter(**{f'{ledger_prefix}created_at__lte': period_end})

    if ledger_id:
        queryset = queryset.filter(**{f'{ledger_prefix}id': ledger_id})

    if period_id:
        queryset = queryset.filter(**{f'{ledger_prefix}period_id': period_id})

    if ledger_prefix:
        queryset = queryset.distinct()

    return queryset


class PeriodViewSet(viewsets.ModelViewSet):
    queryset = Period.objects.all()
    serializer_class = PeriodSerializer
    permission_classes = []

    def get_queryset(self):
        queryset = super().get_queryset()
        section = (self.request.query_params.get('section') or '').strip().lower()
        period_start = parse_period_value(self.request.query_params.get('period_start'))
        period_end = parse_period_value(self.request.query_params.get('period_end'))

        if section == 'active':
            queryset = queryset.filter(is_open=True)
        elif section in {'archive', 'archived', 'closed', 'inactive'}:
            queryset = queryset.filter(is_open=False)

        if period_start:
            queryset = queryset.filter(end_date__gte=period_start)

        if period_end:
            queryset = queryset.filter(start_date__lte=period_end)

        return queryset

    @action(detail=False, methods=['get'], url_path='current')
    def current_period(self, request):
        period = Period.get_open_period()
        if not period:
            return Response(
                {"detail": "No open period found"},
                status=status.HTTP_404_NOT_FOUND
            )

        serializer = self.get_serializer(period)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='close')
    def close_period(self, request, pk=None):
        period = self.get_object()

        if not period.is_open:
            return Response(
                {"detail": "Period is already closed"},
                status=status.HTTP_400_BAD_REQUEST
            )

        closed_at = timezone.now()
        period.close(closed_at=closed_at)

        serializer = self.get_serializer(period)
        return Response({
            "message": f"Period '{period.name}' closed successfully",
            "period": serializer.data,
            "closed_ledgers": period.ledgers.count(),
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['get'], url_path='summary')
    def summary(self, request, pk=None):
        period = self.get_object()
        transactions = Transaction.objects.filter(allocations__ledger__period=period).distinct()
        overflows = Overflow.objects.filter(transaction__allocations__ledger__period=period).distinct()
        total_transaction_amount = transactions.aggregate(
            total=Sum('total_amount')
        )['total'] or Decimal('0.00')
        total_allocated_amount = LedgerAllocation.objects.filter(
            ledger__period=period
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
        total_pending_overflow_amount = overflows.filter(status='TCSO').aggregate(
            total=Sum('excess_amount')
        )['total'] or Decimal('0.00')
        total_approved_overflow_amount = overflows.filter(status='CSO').aggregate(
            total=Sum('excess_amount')
        )['total'] or Decimal('0.00')

        ticket_count = Ticket.objects.filter(
            transactions__allocations__ledger__period=period
        ).distinct().count()

        summary = {
            'period_id': period.id,
            'period_name': period.name,
            'is_open': period.is_open,
            'ledger_count': period.ledgers.filter(is_capacity_reserve=False).count(),
            'active_ledger_count': period.ledgers.filter(is_active=True, is_capacity_reserve=False).count(),
            'closed_ledger_count': period.ledgers.filter(is_active=False, is_capacity_reserve=False).count(),
            'transaction_count': transactions.count(),
            'ticket_count': ticket_count,
            'overflow_count': overflows.count(),
            'pending_overflow_count': overflows.filter(status='TCSO').count(),
            'approved_overflow_count': overflows.filter(status='CSO').count(),
            'total_transaction_amount': str(total_transaction_amount),
            'total_allocated_amount': str(total_allocated_amount),
            'total_pending_overflow_amount': str(total_pending_overflow_amount),
            'total_approved_overflow_amount': str(total_approved_overflow_amount),
            'identifier_count': Identifier.objects.filter(
                transactions__allocations__ledger__period=period
            ).distinct().count(),
        }

        return Response(summary)


class LedgerViewSet(viewsets.ModelViewSet):
    queryset = Ledger.objects.filter(is_capacity_reserve=False)
    serializer_class = LedgerSerializer
    permission_classes =[]

    def get_queryset(self):
        queryset = super().get_queryset()
        return apply_ledger_period_filters(queryset, self.request.query_params)

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

        ledger.close()
        
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
                ledger.close(closed_at=now)
                closed_ledgers.append({
                    'id': ledger.id,
                    'name': ledger.name,
                    'end_date': ledger.end_date,
                    'closed_at': ledger.closed_at
                })
        
        return Response({
            "message": f"Closed {len(closed_ledgers)} expired ledger(s)",
            "closed_ledgers": closed_ledgers
        }, status=status.HTTP_200_OK)
        

    @action(detail=False, methods=['post'], url_path='reorder-priorities')
    def reorder_priorities(self, request):
        """
        POST /api/ledgers/reorder-priorities/
        
        Bulk update ledger priorities (for drag-and-drop reordering)
        
        Request body:
        {
            "ledger_priorities": [
                {"id": 1, "priority": 1},
                {"id": 3, "priority": 2},
                {"id": 2, "priority": 3}
            ]
        }
        
        Response:
        {
            "message": "Priorities updated successfully",
            "ledgers": [
                {"id": 1, "name": "January 2026", "priority": 1},
                {"id": 3, "name": "March 2026", "priority": 2},
                {"id": 2, "name": "February 2026", "priority": 3}
            ]
        }
        """
        ledger_priorities = request.data.get('ledger_priorities', [])
        
        # Validate input
        if not ledger_priorities or not isinstance(ledger_priorities, list):
            return Response(
                {"detail": "ledger_priorities must be a non-empty list"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Use atomic transaction to ensure all-or-nothing update
        with transaction.atomic():
            updated_ledgers = []
            
            for item in ledger_priorities:
                ledger_id = item.get('id')
                new_priority = item.get('priority')
                
                # Validate each item
                if ledger_id is None or new_priority is None:
                    return Response(
                        {"detail": "Each item must have 'id' and 'priority' fields"},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                
                # Validate priority is a positive integer
                try:
                    new_priority = int(new_priority)
                    if new_priority < 1:
                        raise ValueError("Priority must be positive")
                except (TypeError, ValueError):
                    return Response(
                        {"detail": f"Invalid priority value: {new_priority}"},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                
                # Update ledger
                try:
                    ledger = Ledger.objects.get(id=ledger_id, is_capacity_reserve=False)
                    ledger.priority = new_priority
                    ledger.save()
                    
                    updated_ledgers.append({
                        'id': ledger.id,
                        'name': ledger.name,
                        'priority': ledger.priority
                    })
                except Ledger.DoesNotExist:
                    return Response(
                        {"detail": f"Ledger with id {ledger_id} not found"},
                        status=status.HTTP_404_NOT_FOUND
                    )
        
        # Sort by priority for response
        updated_ledgers.sort(key=lambda x: x['priority'])
        
        return Response({
            "message": "Priorities updated successfully",
            "ledgers": updated_ledgers
        }, status=status.HTTP_200_OK)


    # =============================================================================
    # METHOD 1: CSV EXPORT WITH IDENTIFIER VISUAL REPRESENTATION
    # =============================================================================

    @action(detail=True, methods=['get'], url_path='export-csv')
    def export_csv(self, request, pk=None):
        """
        GET /api/ledgers/{id}/export-csv/
        
        Export ledger with identifier visual representation
        Format: 124: 3250.5000.2500
        """
        from .models import LedgerAllocation, Identifier
        
        ledger = self.get_object()
        
        # Create CSV response
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="ledger_{ledger.id}_{ledger.name}.csv"'
        
        writer = csv.writer(response)
        
        # Header section
        writer.writerow(['Ledger Export'])
        writer.writerow(['Ledger Name', ledger.name])
        writer.writerow(['Priority', ledger.priority])
        writer.writerow(['Limit Per Identifier', str(ledger.limit_per_identifier)])
        writer.writerow(['End Date', ledger.end_date.strftime('%Y-%m-%d %H:%M:%S')])
        writer.writerow(['Status', 'Active' if ledger.is_active else 'Closed'])
        writer.writerow([])
        
        # Identifier recordings header
        writer.writerow(['Identifier Recordings'])
        writer.writerow(['ID', 'Accumulated Values'])
        writer.writerow([])
        
        # Get all identifiers (000-999)
        identifiers = Identifier.objects.all().order_by('number')
        
        for identifier in identifiers:
            # Get all transactions for this identifier in this ledger
            allocations = LedgerAllocation.objects.filter(
                ledger=ledger,
                transaction__identifier=identifier
            ).select_related('transaction').order_by('transaction__timestamp')
            
            if allocations.exists():
                # Build the visual representation: "3250.5000.2500"
                values = [str(int(alloc.amount)) for alloc in allocations]
                visual = '.'.join(values)
                writer.writerow([identifier.number, visual])
            else:
                # No transactions for this identifier
                writer.writerow([identifier.number, '________'])
        
        # Summary section
        writer.writerow([])
        writer.writerow(['Summary'])
        
        total_allocated = LedgerAllocation.objects.filter(
            ledger=ledger
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
        
        total_capacity = ledger.limit_per_identifier * 1000
        identifiers_used = LedgerAllocation.objects.filter(
            ledger=ledger
        ).values('transaction__identifier').distinct().count()
        
        writer.writerow(['Total Identifiers Used', identifiers_used])
        writer.writerow(['Total Amount Allocated', str(total_allocated)])
        writer.writerow(['Total Capacity', str(total_capacity)])
        writer.writerow(['Remaining Capacity', str(total_capacity - total_allocated)])
        
        return response


    # =============================================================================
    # METHOD 2: PDF EXPORT WITH IDENTIFIER VISUAL REPRESENTATION
    # =============================================================================

    @action(detail=True, methods=['get'], url_path='export-pdf')
    def export_pdf(self, request, pk=None):
        """
        GET /api/ledgers/{id}/export-pdf/
        
        Export ledger with identifier visual representation
        Format: 124: 3250.5000.2500
        """
        from .models import LedgerAllocation, Identifier
        
        ledger = self.get_object()
        
        # Create PDF response
        response = HttpResponse(content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="ledger_{ledger.id}_{ledger.name}.pdf"'
        
        # Create PDF
        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter, topMargin=0.5*inch, bottomMargin=0.5*inch)
        
        elements = []
        styles = getSampleStyleSheet()
        
        # Title
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=20,
            textColor=colors.HexColor('#1a1a1a'),
            spaceAfter=20,
            alignment=TA_CENTER
        )
        
        title = Paragraph(f"Ledger Report: {ledger.name}", title_style)
        elements.append(title)
        elements.append(Spacer(1, 0.2*inch))
        
        # Ledger Info Table
        info_data = [
            ['Ledger Information', ''],
            ['Name:', ledger.name],
            ['Priority:', str(ledger.priority)],
            ['Limit Per Identifier:', f"{ledger.limit_per_identifier:,.2f}"],
            ['End Date:', ledger.end_date.strftime('%Y-%m-%d %H:%M:%S')],
            ['Status:', 'Active' if ledger.is_active else 'Closed'],
        ]
        
        info_table = Table(info_data, colWidths=[2*inch, 4*inch])
        info_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 12),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('GRID', (0, 0), (-1, -1), 1, colors.black),
            ('FONTNAME', (0, 1), (0, -1), 'Helvetica-Bold'),
        ]))
        
        elements.append(info_table)
        elements.append(Spacer(1, 0.3*inch))
        
        # Identifier Recordings
        heading = Paragraph("Identifier Recordings", styles['Heading2'])
        elements.append(heading)
        elements.append(Spacer(1, 0.1*inch))
        
        # Get all identifiers
        identifiers = Identifier.objects.all().order_by('number')
        
        # Build identifier data
        identifier_data = [['ID', 'Accumulated Values']]
        
        for identifier in identifiers:
            # Get all allocations for this identifier in this ledger
            allocations = LedgerAllocation.objects.filter(
                ledger=ledger,
                transaction__identifier=identifier
            ).select_related('transaction').order_by('transaction__timestamp')
            
            if allocations.exists():
                # Build visual: "3250.5000.2500"
                values = [str(int(alloc.amount)) for alloc in allocations]
                visual = '.'.join(values)
                identifier_data.append([identifier.number, visual])
            else:
                # No data for this identifier
                identifier_data.append([identifier.number, '________'])
        
        # Create table (split into pages if needed)
        # Show first 100 identifiers per page
        chunk_size = 100
        for i in range(0, len(identifier_data), chunk_size):
            chunk = identifier_data[i:i+chunk_size+1] if i == 0 else [identifier_data[0]] + identifier_data[i:i+chunk_size]
            
            id_table = Table(chunk, colWidths=[0.8*inch, 5.5*inch])
            id_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('ALIGN', (0, 0), (0, -1), 'CENTER'),  # ID column centered
                ('ALIGN', (1, 0), (1, -1), 'LEFT'),    # Values column left
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 10),
                ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                ('FONTSIZE', (0, 1), (-1, -1), 8),
                ('FONTNAME', (0, 1), (0, -1), 'Courier'),  # Monospace for IDs
                ('FONTNAME', (1, 1), (1, -1), 'Courier'),  # Monospace for values
            ]))
            
            elements.append(id_table)
            
            # Add page break between chunks (except last)
            if i + chunk_size < len(identifier_data):
                elements.append(Spacer(1, 0.2*inch))
        
        elements.append(Spacer(1, 0.3*inch))
        
        # Summary
        summary_heading = Paragraph("Summary", styles['Heading2'])
        elements.append(summary_heading)
        elements.append(Spacer(1, 0.1*inch))
        
        total_allocated = LedgerAllocation.objects.filter(
            ledger=ledger
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
        
        total_capacity = ledger.limit_per_identifier * 1000
        identifiers_used = LedgerAllocation.objects.filter(
            ledger=ledger
        ).values('transaction__identifier').distinct().count()
        
        summary_data = [
            ['Summary Statistics', ''],
            ['Total Identifiers Used:', str(identifiers_used)],
            ['Total Amount Allocated:', f"{total_allocated:,.2f}"],
            ['Total Capacity:', f"{total_capacity:,.2f}"],
            ['Remaining Capacity:', f"{total_capacity - total_allocated:,.2f}"],
            ['Utilization:', f"{(total_allocated / total_capacity * 100):.2f}%" if total_capacity > 0 else "0%"],
        ]
        
        summary_table = Table(summary_data, colWidths=[2.5*inch, 2*inch])
        summary_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 12),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('GRID', (0, 0), (-1, -1), 1, colors.black),
            ('FONTNAME', (0, 1), (0, -1), 'Helvetica-Bold'),
        ]))
        
        elements.append(summary_table)
        
        # Build PDF
        doc.build(elements)
        
        # Get PDF from buffer
        pdf = buffer.getvalue()
        buffer.close()
        response.write(pdf)
        
        return response


class IdentifierViewSet(viewsets.ModelViewSet):
    queryset = Identifier.objects.all()
    serializer_class = IdentifierSerializer
    # permission_classes =[IsAuthenticatedOrReadOnly]


class TransactionViewSet(viewsets.ModelViewSet):
    queryset = Transaction.objects.all()
    serializer_class = TransactionSerializer
    permission_classes = []

    def get_queryset(self):
        queryset = super().get_queryset()
        return apply_ledger_period_filters(
            queryset,
            self.request.query_params,
            ledger_prefix='allocations__ledger__'
        )


class OverflowViewSet(viewsets.ModelViewSet):
    queryset = Overflow.objects.all()
    serializer_class = OverflowSerializer
    permission_classes = []

    def get_queryset(self):
        queryset = super().get_queryset()
        return apply_ledger_period_filters(
            queryset,
            self.request.query_params,
            ledger_prefix='transaction__allocations__ledger__'
        )

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
                if amount <= 0:
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

        extra_amount = overflow.amount_to_approve - overflow.excess_amount
        target_period = overflow.period
        if extra_amount > 0 and (not target_period or not target_period.is_open):
            return Response(
                {"detail": "Extra approved capacity can only be granted to an open period."},
                status=status.HTTP_400_BAD_REQUEST
            )

        with db_transaction.atomic():
            overflow.status = 'CSO'
            overflow.approved_at = timezone.now()
            overflow.save()

            if extra_amount > 0:
                Ledger.get_capacity_reserve(target_period, create=True)
                IdentifierCapacityAdjustment.objects.create(
                    identifier=overflow.transaction.identifier,
                    period=target_period,
                    overflow=overflow,
                    amount=extra_amount,
                )
        
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

    def get_queryset(self):
        queryset = super().get_queryset()
        return apply_ledger_period_filters(
            queryset,
            self.request.query_params,
            ledger_prefix='transactions__allocations__ledger__'
        )


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

        open_period = Period.get_open_period()
        if not open_period:
            return Response(
                {"detail": "No open period available."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not Ledger.objects.filter(
            is_active=True,
            period=open_period,
            is_capacity_reserve=False,
        ).exists():
            return Response(
                {"detail": "No active ledgers available in the current open period."},
                status=status.HTTP_400_BAD_REQUEST
            )

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
                if isinstance(e, ValidationError):
                    errors.append(f"Item {idx}: {e}")
                    continue
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
