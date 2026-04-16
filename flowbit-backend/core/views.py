# All imports organized in ONE place at the top
from rest_framework import viewsets, generics, status
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated, IsAuthenticatedOrReadOnly
from django.contrib.auth.models import User
from django.core.mail import send_mail
from django.contrib.auth import authenticate
from django.conf import settings
from django.db import transaction as db_transaction, transaction
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from django.http import HttpResponse
from django.db.models import Count, Q, Sum
from django.core.exceptions import ValidationError
from rest_framework.authtoken.models import Token
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
from .models import (
    DEFAULT_HELPER_NAME,
    Period,
    Ledger,
    Identifier,
    Transaction,
    Overflow,
    OverflowNotification,
    AuditLog,
    Profile,
    PasswordResetToken,
    Ticket,
    LedgerAllocation,
    IdentifierCapacityAdjustment,
    preview_transaction_allocation,
    refund_overflow,
    refund_transactions,
)
from .audit import record_audit_log, serialize_audit_value, snapshot_instance
from .permissions import (
    IsAdminRole,
    IsAuthenticatedReadOnlyOrAdminWriteOrOverride,
    get_request_admin_override_profile,
    is_admin_user,
)
from .serializers import (
    PeriodSerializer,
    LedgerSerializer,
    IdentifierSerializer,
    TransactionSerializer,
    OverflowSerializer,
    CollaboratorSerializer,
    OverflowNotificationSerializer,
    TicketSerializer,
    AuditLogSerializer,
    LoginSerializer,
    GoogleLoginSerializer,
    UserProfileSerializer,
    ChangePasswordSerializer,
    ForgotPasswordSerializer,
    ResetPasswordConfirmSerializer,
    CollaboratorManageSerializer,
    UserRoleUpdateSerializer,
    MasterOverridePasswordSerializer,
)


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


def selected_period_from_request(request):
    period_id = request.query_params.get('period_id')
    if period_id:
        try:
            return Period.objects.get(id=period_id)
        except (Period.DoesNotExist, ValueError):
            return None
    return Period.get_open_period()


def period_transaction_queryset(period):
    if period is None:
        return Transaction.objects.all().distinct()

    return Transaction.objects.filter(
        Q(allocations__ledger__period=period) |
        Q(
            allocations__isnull=True,
            timestamp__gte=period.start_date,
            timestamp__lte=period.end_date,
        )
    ).distinct()


def period_overflow_rows(period, identifier=None):
    overflow_queryset = Overflow.objects.all()
    if identifier is not None:
        overflow_queryset = overflow_queryset.filter(transaction__identifier=identifier)

    if period is not None:
        overflow_queryset = overflow_queryset.filter(
            Q(transaction__allocations__ledger__period=period) |
            Q(
                transaction__allocations__isnull=True,
                transaction__timestamp__gte=period.start_date,
                transaction__timestamp__lte=period.end_date,
            )
        )

    return list(overflow_queryset.distinct())


def build_password_reset_email_body(reset_token, raw_token):
    frontend_url = getattr(settings, 'FRONTEND_PASSWORD_RESET_URL', '').strip()
    body_lines = [
        "FlowBit password reset request",
        "",
        f"Selector: {reset_token.selector}",
        f"Token: {raw_token}",
        f"Expires At: {timezone.localtime(reset_token.expires_at).isoformat()}",
    ]
    if frontend_url:
        body_lines.extend([
            "",
            f"Reset URL: {frontend_url}?selector={reset_token.selector}&token={raw_token}",
        ])
    return "\n".join(body_lines)


def collaborator_snapshot(user):
    return {
        'id': user.id,
        'username': user.username,
        'first_name': user.first_name,
        'last_name': user.last_name,
        'email': user.email,
    }


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


def helper_name_from_request(request):
    helper_name = (request.data.get('helper_name') or '').strip() if hasattr(request, 'data') else ''
    if helper_name:
        return helper_name
    if getattr(request, 'user', None) and request.user.is_authenticated:
        return request.user.username
    return DEFAULT_HELPER_NAME


def _build_unique_username(email, fallback='google_user'):
    base = (email.split('@')[0] if email else fallback).strip() or fallback
    base = ''.join(char if char.isalnum() or char in {'_', '.'} else '_' for char in base).strip('._') or fallback
    candidate = base[:150]
    counter = 1
    while User.objects.filter(username=candidate).exists():
        suffix = f'_{counter}'
        candidate = f"{base[:150-len(suffix)]}{suffix}"
        counter += 1
    return candidate


def verify_google_id_token(id_token_value):
    if not settings.GOOGLE_OAUTH_CLIENT_ID:
        raise ValidationError("Google sign-in is not configured.")

    try:
        from google.auth.transport import requests as google_requests
        from google.oauth2 import id_token as google_id_token
    except ImportError as exc:
        raise ValidationError("google-auth package is required for Google sign-in.") from exc

    try:
        return google_id_token.verify_oauth2_token(
            id_token_value,
            google_requests.Request(),
            settings.GOOGLE_OAUTH_CLIENT_ID,
        )
    except Exception as exc:
        raise ValidationError("Invalid Google ID token.") from exc


def resolve_collaborators_for_approval(request, collaborator_ids):
    if not collaborator_ids or not isinstance(collaborator_ids, list):
        raise ValidationError("At least one collaborator must be selected.")

    collaborators = list(User.objects.filter(id__in=collaborator_ids).order_by('id'))
    if len(collaborators) != len(set(collaborator_ids)):
        raise ValidationError("One or more selected collaborators do not exist.")

    if getattr(request, 'user', None) and request.user.is_authenticated:
        if any(collaborator.id == request.user.id for collaborator in collaborators):
            raise ValidationError("Current user cannot be selected as a collaborator.")

    return collaborators


def parse_manual_allocations_input(identifier, period, manual_allocations):
    parsed_allocations = []
    seen_ledgers = set()

    for index, item in enumerate(manual_allocations or [], start=1):
        ledger_id = item.get('ledger')
        amount = item.get('amount')

        if ledger_id is None or amount is None:
            raise ValidationError(f"Manual allocation item {index} must include 'ledger' and 'amount'.")

        if ledger_id in seen_ledgers:
            raise ValidationError(f"Ledger {ledger_id} is listed more than once in manual allocations.")
        seen_ledgers.add(ledger_id)

        try:
            ledger = Ledger.objects.get(
                id=ledger_id,
                period=period,
                is_active=True,
                is_capacity_reserve=False,
            )
        except Ledger.DoesNotExist:
            raise ValidationError(f"Ledger {ledger_id} is not an active ledger in the current period.")

        try:
            allocation_amount = Decimal(str(amount))
        except (InvalidOperation, ValueError):
            raise ValidationError(f"Invalid allocation amount for ledger {ledger_id}.")

        if allocation_amount <= 0:
            raise ValidationError(f"Allocation amount for ledger {ledger_id} must be positive.")

        parsed_allocations.append({
            'ledger': ledger,
            'amount': allocation_amount,
        })

    return parsed_allocations


def serialize_allocation_preview(preview):
    return {
        'ledger_allocations': [
            {
                'ledger_id': item['ledger'].id,
                'ledger_name': item['ledger'].name,
                'available_amount': str(item['available_amount']),
                'requested_amount': str(item['requested_amount']),
                'allocated_amount': str(item['allocated_amount']),
                'overflow_amount': str(item['overflow_amount']),
                'fits': item['overflow_amount'] == 0,
            }
            for item in preview['ledger_allocations']
        ],
        'reserve_available': str(preview['reserve_available']),
        'reserve_allocated': str(preview['reserve_allocated']),
        'overflow_amount': str(preview['overflow_amount']),
        'has_overflow': preview['overflow_amount'] > 0,
    }


class PeriodViewSet(viewsets.ModelViewSet):
    queryset = Period.objects.all()
    serializer_class = PeriodSerializer
    permission_classes = [IsAuthenticatedReadOnlyOrAdminWriteOrOverride]

    def perform_create(self, serializer):
        period = serializer.save()
        record_audit_log(
            self.request,
            'period.created',
            target=period,
            details=f"Created period '{period.name}'",
            changes={'after': snapshot_instance(period)},
        )

    def perform_update(self, serializer):
        before = snapshot_instance(self.get_object())
        period = serializer.save()
        record_audit_log(
            self.request,
            'period.updated',
            target=period,
            details=f"Updated period '{period.name}'",
            changes={'before': before, 'after': snapshot_instance(period)},
        )

    def perform_destroy(self, instance):
        before = snapshot_instance(instance)
        period_name = instance.name
        super().perform_destroy(instance)
        record_audit_log(
            self.request,
            'period.deleted',
            details=f"Deleted period '{period_name}'",
            changes={'before': before},
        )

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
        period.close(
            closed_at=closed_at,
            helper_name=helper_name_from_request(request),
        )
        record_audit_log(
            request,
            'period.closed',
            target=period,
            details=f"Closed period '{period.name}'",
            changes={
                'closed_at': serialize_audit_value(closed_at),
                'closed_ledgers': period.ledgers.filter(is_capacity_reserve=False).count(),
            },
        )

        serializer = self.get_serializer(period)
        return Response({
            "message": f"Period '{period.name}' closed successfully",
            "period": serializer.data,
            "closed_ledgers": period.ledgers.filter(is_capacity_reserve=False).count(),
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
    permission_classes = [IsAuthenticatedReadOnlyOrAdminWriteOrOverride]

    def perform_create(self, serializer):
        ledger = serializer.save()
        record_audit_log(
            self.request,
            'ledger.created',
            target=ledger,
            details=f"Created ledger '{ledger.name}'",
            changes={'after': snapshot_instance(ledger)},
        )

    def perform_update(self, serializer):
        before = snapshot_instance(self.get_object())
        ledger = serializer.save()
        record_audit_log(
            self.request,
            'ledger.updated',
            target=ledger,
            details=f"Updated ledger '{ledger.name}'",
            changes={'before': before, 'after': snapshot_instance(ledger)},
        )

    def perform_destroy(self, instance):
        before = snapshot_instance(instance)
        ledger_name = instance.name
        super().perform_destroy(instance)
        record_audit_log(
            self.request,
            'ledger.deleted',
            details=f"Deleted ledger '{ledger_name}'",
            changes={'before': before},
        )

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
        record_audit_log(
            request,
            'ledger.closed',
            target=ledger,
            details=f"Closed ledger '{ledger.name}'",
            changes={'after': snapshot_instance(ledger)},
        )
        
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

        if closed_ledgers:
            record_audit_log(
                request,
                'ledger.auto_closed',
                details=f"Auto-closed {len(closed_ledgers)} expired ledger(s)",
                changes={'closed_ledgers': closed_ledgers},
            )
        
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
        record_audit_log(
            request,
            'ledger.reordered',
            details='Bulk updated ledger priorities',
            changes={'ledgers': updated_ledgers},
        )
        
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
    permission_classes = [IsAuthenticatedReadOnlyOrAdminWriteOrOverride]

    def perform_create(self, serializer):
        identifier = serializer.save()
        record_audit_log(
            self.request,
            'identifier.created',
            target=identifier,
            details=f"Created identifier '{identifier.number}'",
            changes={'after': snapshot_instance(identifier)},
        )

    def perform_update(self, serializer):
        before = snapshot_instance(self.get_object())
        identifier = serializer.save()
        record_audit_log(
            self.request,
            'identifier.updated',
            target=identifier,
            details=f"Updated identifier '{identifier.number}'",
            changes={'before': before, 'after': snapshot_instance(identifier)},
        )

    def perform_destroy(self, instance):
        before = snapshot_instance(instance)
        identifier_number = instance.number
        super().perform_destroy(instance)
        record_audit_log(
            self.request,
            'identifier.deleted',
            details=f"Deleted identifier '{identifier_number}'",
            changes={'before': before},
        )


class TransactionViewSet(viewsets.ModelViewSet):
    queryset = Transaction.objects.all()
    serializer_class = TransactionSerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.action in {'update', 'partial_update', 'destroy'}:
            return [IsAdminRole()]
        return [permission() for permission in self.permission_classes]

    def perform_update(self, serializer):
        before = snapshot_instance(self.get_object())
        transaction_obj = serializer.save()
        record_audit_log(
            self.request,
            'transaction.updated',
            target=transaction_obj,
            details=f"Updated transaction '{transaction_obj.order_number}'",
            changes={'before': before, 'after': snapshot_instance(transaction_obj)},
        )

    def perform_destroy(self, instance):
        before = snapshot_instance(instance)
        order_number = instance.order_number
        super().perform_destroy(instance)
        record_audit_log(
            self.request,
            'transaction.deleted',
            details=f"Deleted transaction '{order_number}'",
            changes={'before': before},
        )

    def get_queryset(self):
        queryset = super().get_queryset()
        return apply_ledger_period_filters(
            queryset,
            self.request.query_params,
            ledger_prefix='allocations__ledger__'
        )

    def create(self, request, *args, **kwargs):
        open_period = Period.get_open_period()
        if not open_period:
            return Response(
                {"detail": "No open period available."},
                status=status.HTTP_400_BAD_REQUEST
            )

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        identifier = serializer.validated_data['identifier']
        total_amount = serializer.validated_data['total_amount']
        manual_allocations_input = request.data.get('manual_allocations') or []
        allow_overflow = request.data.get('allow_overflow', True)

        if isinstance(allow_overflow, str):
            allow_overflow = allow_overflow.strip().lower() not in {'false', '0', 'no'}

        parsed_allocations = []
        preview = None
        if manual_allocations_input:
            try:
                parsed_allocations = parse_manual_allocations_input(
                    identifier=identifier,
                    period=open_period,
                    manual_allocations=manual_allocations_input,
                )
            except ValidationError as exc:
                return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

            preview = preview_transaction_allocation(
                identifier=identifier,
                total_amount=total_amount,
                period=open_period,
                manual_allocations=parsed_allocations,
            )
        else:
            preview = preview_transaction_allocation(
                identifier=identifier,
                total_amount=total_amount,
                period=open_period,
            )

        if preview['overflow_amount'] > 0 and not allow_overflow:
            return Response(
                {
                    "detail": "Transaction does not fit available capacity.",
                    "preview": serialize_allocation_preview(preview),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        transaction_obj = serializer.save(
            created_by=request.user if request.user.is_authenticated else None
        )
        if parsed_allocations:
            transaction_obj._manual_allocations = parsed_allocations
            transaction_obj.allocations.all().delete()
            transaction_obj.overflows.all().delete()
            transaction_obj._allocate_to_ledgers()

        response_serializer = self.get_serializer(transaction_obj)
        response_payload = response_serializer.data
        if preview is not None:
            response_payload['allocation_preview'] = serialize_allocation_preview(preview)
        record_audit_log(
            request,
            'transaction.created',
            target=transaction_obj,
            details=f"Created transaction '{transaction_obj.order_number}'",
            changes={
                'after': snapshot_instance(transaction_obj),
                'allocation_preview': response_payload.get('allocation_preview', {}),
            },
        )
        headers = self.get_success_headers(response_payload)
        return Response(response_payload, status=status.HTTP_201_CREATED, headers=headers)

    @action(detail=False, methods=['post'], url_path='allocation-preview')
    def allocation_preview(self, request):
        open_period = Period.get_open_period()
        if not open_period:
            return Response(
                {"detail": "No open period available."},
                status=status.HTTP_400_BAD_REQUEST
            )

        identifier_id = request.data.get('identifier')
        total_amount = request.data.get('total_amount')

        if not identifier_id or total_amount is None:
            return Response(
                {"detail": "'identifier' and 'total_amount' are required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            identifier = Identifier.objects.get(id=identifier_id)
        except Identifier.DoesNotExist:
            return Response(
                {"detail": "Identifier not found."},
                status=status.HTTP_404_NOT_FOUND
            )

        try:
            total_amount = Decimal(str(total_amount))
        except (InvalidOperation, ValueError):
            return Response(
                {"detail": "Invalid total_amount format."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if total_amount <= 0:
            return Response(
                {"detail": "total_amount must be positive."},
                status=status.HTTP_400_BAD_REQUEST
            )

        manual_allocations_input = request.data.get('manual_allocations') or []
        try:
            parsed_allocations = parse_manual_allocations_input(
                identifier=identifier,
                period=open_period,
                manual_allocations=manual_allocations_input,
            ) if manual_allocations_input else None
        except ValidationError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        preview = preview_transaction_allocation(
            identifier=identifier,
            total_amount=total_amount,
            period=open_period,
            manual_allocations=parsed_allocations,
        )
        return Response(serialize_allocation_preview(preview), status=status.HTTP_200_OK)

class OverflowViewSet(viewsets.ModelViewSet):
    queryset = Overflow.objects.all()
    serializer_class = OverflowSerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.action in {'create', 'update', 'partial_update', 'destroy'}:
            return [IsAdminRole()]
        return [permission() for permission in self.permission_classes]

    def perform_create(self, serializer):
        overflow = serializer.save()
        record_audit_log(
            self.request,
            'overflow.created',
            target=overflow,
            details='Created overflow entry',
            changes={'after': snapshot_instance(overflow)},
        )

    def perform_update(self, serializer):
        before = snapshot_instance(self.get_object())
        overflow = serializer.save()
        record_audit_log(
            self.request,
            'overflow.updated',
            target=overflow,
            details='Updated overflow entry',
            changes={'before': before, 'after': snapshot_instance(overflow)},
        )

    def perform_destroy(self, instance):
        before = snapshot_instance(instance)
        target_id = instance.pk
        super().perform_destroy(instance)
        record_audit_log(
            self.request,
            'overflow.deleted',
            details=f"Deleted overflow entry '{target_id}'",
            changes={'before': before},
        )

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
        approved = Overflow.objects.filter(status=Overflow.STATUS_CSO).select_related(
            'transaction__identifier',
            'transaction__ticket'
        ).order_by('-approved_at')
        serializer = self.get_serializer(approved, many=True)
        return Response(serializer.data)

    def _approve_overflow(self, overflow, request):
        if overflow.status != Overflow.STATUS_TCSO:
            return Response(
                {"detail": "Only pending overflows can be approved"},
                status=status.HTTP_400_BAD_REQUEST
            )

        amount_str = request.data.get('amount_to_approve')
        collaborator_ids = request.data.get('collaborator_ids', [])
        try:
            collaborators = resolve_collaborators_for_approval(request, collaborator_ids)
        except ValidationError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

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

        helper_name = ", ".join(
            filter(None, [collaborator.get_full_name().strip() or collaborator.username for collaborator in collaborators])
        )
        extra_amount = overflow.amount_to_approve - overflow.excess_amount
        target_period = overflow.period
        if extra_amount > 0 and (not target_period or not target_period.is_open):
            return Response(
                {"detail": "Extra approved capacity can only be granted to an open period."},
                status=status.HTTP_400_BAD_REQUEST
            )

        with db_transaction.atomic():
            overflow.status = Overflow.STATUS_CSO
            overflow.approved_at = timezone.now()
            overflow.helper_name = helper_name
            overflow.resolution_type = Overflow.RESOLUTION_APPROVE
            overflow.save()

            if extra_amount > 0:
                adjustment = IdentifierCapacityAdjustment.objects.create(
                    identifier=overflow.transaction.identifier,
                    period=target_period,
                    overflow=overflow,
                    amount=extra_amount,
                    adjustment_type=IdentifierCapacityAdjustment.TYPE_APPROVAL_EXTRA,
                    helper_name=helper_name,
                )
                if adjustment:
                    Ledger.get_capacity_reserve(target_period, create=True)

        overflow.collaborators.set(collaborators)
        record_audit_log(
            request,
            'overflow.approved',
            target=overflow,
            details=f"Approved overflow for transaction '{overflow.transaction.order_number}'",
            changes={
                'status': overflow.status,
                'amount_to_approve': str(overflow.amount_to_approve),
                'helper_name': helper_name,
                'collaborator_ids': [collaborator.id for collaborator in collaborators],
            },
        )
        
        serializer = self.get_serializer(overflow)
        return Response({
            "message": "Approved successfully",
            "overflow": serializer.data
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='approve')
    def approve_overflow(self, request, pk=None):
        """POST /api/overflows/{id}/approve/ - Approve overflow with collaborators"""
        return self._approve_overflow(self.get_object(), request)

    @action(detail=True, methods=['post'], url_path='resolve')
    def resolve_overflow(self, request, pk=None):
        overflow = self.get_object()
        action_name = (request.data.get('action') or '').strip().lower()
        helper_name = helper_name_from_request(request)
        override_profile = get_request_admin_override_profile(request)

        if action_name in {'', 'approve'}:
            return self._approve_overflow(overflow, request)

        if action_name in {'refund_overflow_only', 'refund_transaction', 'refund_ticket'}:
            if not is_admin_user(request.user) and override_profile is None:
                return Response(
                    {"detail": "Admin override code is required for refund actions."},
                    status=status.HTTP_403_FORBIDDEN,
                )

        if action_name == 'refund_overflow_only':
            with db_transaction.atomic():
                refund_overflow(
                    overflow,
                    helper_name=helper_name,
                    resolution_type=Overflow.RESOLUTION_REFUND_OVERFLOW,
                )
            serializer = self.get_serializer(overflow)
            record_audit_log(
                request,
                'overflow.refunded',
                target=overflow,
                details=f"Refunded overflow for transaction '{overflow.transaction.order_number}'",
                changes={'resolution_type': Overflow.RESOLUTION_REFUND_OVERFLOW},
            )
            return Response({
                "message": "Overflow refunded successfully",
                "overflow": serializer.data,
            }, status=status.HTTP_200_OK)

        if action_name == 'refund_transaction':
            with db_transaction.atomic():
                refund_transactions(
                    [overflow.transaction],
                    helper_name=helper_name,
                    resolution_type=Overflow.RESOLUTION_REFUND_TRANSACTION,
                )
            record_audit_log(
                request,
                'transaction.refunded',
                target=overflow.transaction,
                details=f"Refunded transaction '{overflow.transaction.order_number}'",
                changes={'resolution_type': Overflow.RESOLUTION_REFUND_TRANSACTION},
            )
            return Response({
                "message": f"Transaction '{overflow.transaction.order_number}' refunded successfully",
            }, status=status.HTTP_200_OK)

        if action_name == 'refund_ticket':
            if not overflow.transaction.ticket_id:
                return Response(
                    {"detail": "Overflow transaction is not attached to a ticket."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            with db_transaction.atomic():
                refund_transactions(
                    list(overflow.transaction.ticket.transactions.all()),
                    helper_name=helper_name,
                    resolution_type=Overflow.RESOLUTION_REFUND_TICKET,
                )
            record_audit_log(
                request,
                'ticket.refunded',
                target=overflow.transaction.ticket,
                details=f"Refunded ticket '{overflow.transaction.ticket.ticket_number}'",
                changes={'resolution_type': Overflow.RESOLUTION_REFUND_TICKET},
            )
            return Response({
                "message": f"Ticket '{overflow.transaction.ticket.ticket_number}' refunded successfully",
            }, status=status.HTTP_200_OK)

        return Response(
            {"detail": "Unsupported resolution action"},
            status=status.HTTP_400_BAD_REQUEST,
        )


class OverflowNotificationViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = OverflowNotification.objects.select_related(
        'period',
        'overflow__transaction__identifier',
    )
    serializer_class = OverflowNotificationSerializer
    permission_classes = [IsAuthenticated]


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = AuditLog.objects.select_related('user')
    serializer_class = AuditLogSerializer
    permission_classes = [IsAdminRole]

    def get_queryset(self):
        queryset = super().get_queryset()
        action = (self.request.query_params.get('action') or '').strip()
        target_model = (self.request.query_params.get('target_model') or '').strip()
        target_id = self.request.query_params.get('target_id')
        user_id = self.request.query_params.get('user_id')
        date_from = parse_period_value(self.request.query_params.get('date_from'))
        date_to = parse_period_value(self.request.query_params.get('date_to'))

        if action:
            queryset = queryset.filter(action=action)
        if target_model:
            queryset = queryset.filter(target_model__iexact=target_model)
        if target_id:
            queryset = queryset.filter(target_id=target_id)
        if user_id:
            queryset = queryset.filter(user_id=user_id)
        if date_from:
            queryset = queryset.filter(timestamp__gte=date_from)
        if date_to:
            queryset = queryset.filter(timestamp__lte=date_to)
        return queryset


class CollaboratorViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all().order_by('username')
    serializer_class = CollaboratorSerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.action in {'create', 'update', 'partial_update', 'destroy'}:
            return [IsAdminRole()]
        return [permission() for permission in self.permission_classes]

    def get_serializer_class(self):
        if self.action in {'create', 'update', 'partial_update'}:
            return CollaboratorManageSerializer
        return CollaboratorSerializer

    def perform_create(self, serializer):
        collaborator = serializer.save()
        profile, _ = Profile.objects.get_or_create(user=collaborator)
        if profile.role != 'user':
            profile.role = 'user'
            profile.save(update_fields=['role', 'updated_at'])
        record_audit_log(
            self.request,
            'collaborator.created',
            target=collaborator,
            details=f"Created collaborator '{collaborator.username}'",
            changes={'after': collaborator_snapshot(collaborator)},
        )

    def perform_update(self, serializer):
        before = collaborator_snapshot(self.get_object())
        collaborator = serializer.save()
        profile, _ = Profile.objects.get_or_create(user=collaborator)
        if profile.role != 'user':
            profile.role = 'user'
            profile.save(update_fields=['role', 'updated_at'])
        record_audit_log(
            self.request,
            'collaborator.updated',
            target=collaborator,
            details=f"Updated collaborator '{collaborator.username}'",
            changes={'before': before, 'after': collaborator_snapshot(collaborator)},
        )

    def perform_destroy(self, instance):
        before = collaborator_snapshot(instance)
        username = instance.username
        super().perform_destroy(instance)
        record_audit_log(
            self.request,
            'collaborator.deleted',
            details=f"Deleted collaborator '{username}'",
            changes={'before': before},
        )

    def _get_export_overflows(self, collaborator, request):
        period_id = request.query_params.get('period_id')
        sort_by = (request.query_params.get('sort_by') or 'identifier').strip().lower()
        sort_order = (request.query_params.get('sort_order') or 'asc').strip().lower()

        if sort_by not in {'identifier', 'approved_at'}:
            raise ValidationError("sort_by must be either 'identifier' or 'approved_at'.")

        if sort_order not in {'asc', 'desc'}:
            raise ValidationError("sort_order must be either 'asc' or 'desc'.")

        if period_id:
            try:
                selected_period = Period.objects.get(id=period_id)
            except Period.DoesNotExist as exc:
                raise Period.DoesNotExist("Period not found.") from exc
        else:
            selected_period = Period.get_open_period()

        overflows = Overflow.objects.filter(
            collaborators=collaborator,
            status=Overflow.STATUS_CSO,
        ).select_related(
            'transaction__identifier',
        ).distinct()

        if selected_period:
            overflows = overflows.filter(transaction__allocations__ledger__period=selected_period).distinct()
            period_label = selected_period.name
        else:
            period_label = 'All Periods'

        order_field = 'transaction__identifier__number' if sort_by == 'identifier' else 'approved_at'
        if sort_order == 'desc':
            order_field = f'-{order_field}'

        if sort_by == 'identifier':
            overflows = overflows.order_by(order_field, 'approved_at', 'id')
        else:
            overflows = overflows.order_by(order_field, 'transaction__identifier__number', 'id')

        return overflows, period_label

    @action(detail=True, methods=['get'], url_path='export-transactions')
    def export_transactions(self, request, pk=None):
        collaborator = self.get_object()
        try:
            overflows, period_label = self._get_export_overflows(collaborator, request)
        except ValidationError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Period.DoesNotExist as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_404_NOT_FOUND)

        collaborator_name = collaborator.get_full_name().strip() or collaborator.username
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = (
            f'attachment; filename="collaborator_{collaborator.id}_transactions.csv"'
        )

        writer = csv.writer(response)
        writer.writerow(['Name', collaborator_name])
        writer.writerow(['Period', period_label])
        writer.writerow([])
        writer.writerow(['Transactions'])

        total_amount = Decimal('0.00')
        for overflow in overflows:
            approved_amount = overflow.amount_to_approve or overflow.excess_amount or Decimal('0.00')
            total_amount += approved_amount
            writer.writerow([
                overflow.transaction.identifier.number,
                '.',
                f'{approved_amount:.2f}',
            ])

        writer.writerow([])
        writer.writerow(['Total Amount', '', f'{total_amount:.2f}'])
        return response

    @action(detail=True, methods=['get'], url_path='export-transactions-pdf')
    def export_transactions_pdf(self, request, pk=None):
        collaborator = self.get_object()
        try:
            overflows, period_label = self._get_export_overflows(collaborator, request)
        except ValidationError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Period.DoesNotExist as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_404_NOT_FOUND)

        collaborator_name = collaborator.get_full_name().strip() or collaborator.username
        response = HttpResponse(content_type='application/pdf')
        response['Content-Disposition'] = (
            f'attachment; filename="collaborator_{collaborator.id}_transactions.pdf"'
        )

        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter, topMargin=0.5 * inch, bottomMargin=0.5 * inch)
        styles = getSampleStyleSheet()
        elements = []

        title_style = ParagraphStyle(
            'CollaboratorReportTitle',
            parent=styles['Heading1'],
            fontSize=18,
            textColor=colors.HexColor('#1a1a1a'),
            spaceAfter=18,
            alignment=TA_CENTER,
        )
        elements.append(Paragraph(f"Collaborator Report: {collaborator_name}", title_style))
        elements.append(Spacer(1, 0.2 * inch))

        info_table = Table([
            ['Name', collaborator_name],
            ['Period', period_label],
        ], colWidths=[1.5 * inch, 4.5 * inch])
        info_table.setStyle(TableStyle([
            ('GRID', (0, 0), (-1, -1), 1, colors.black),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ]))
        elements.append(info_table)
        elements.append(Spacer(1, 0.25 * inch))

        transaction_rows = [['Identifier', '', 'Amount']]
        total_amount = Decimal('0.00')
        for overflow in overflows:
            approved_amount = overflow.amount_to_approve or overflow.excess_amount or Decimal('0.00')
            total_amount += approved_amount
            transaction_rows.append([
                overflow.transaction.identifier.number,
                '.',
                f'{approved_amount:.2f}',
            ])

        transaction_table = Table(transaction_rows, colWidths=[1.2 * inch, 0.4 * inch, 1.8 * inch])
        transaction_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ]))
        elements.append(transaction_table)
        elements.append(Spacer(1, 0.25 * inch))

        total_table = Table([
            ['Total Amount', f'{total_amount:.2f}'],
        ], colWidths=[2.0 * inch, 1.8 * inch])
        total_table.setStyle(TableStyle([
            ('GRID', (0, 0), (-1, -1), 1, colors.black),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ]))
        elements.append(total_table)

        doc.build(elements)
        response.write(buffer.getvalue())
        buffer.close()
        return response


class DashboardReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        period = selected_period_from_request(request)
        transaction_queryset = period_transaction_queryset(period)
        ticket_queryset = Ticket.objects.all()
        ledger_queryset = Ledger.objects.filter(is_capacity_reserve=False)
        adjustment_queryset = IdentifierCapacityAdjustment.objects.all()
        allocation_queryset = LedgerAllocation.objects.all()
        overflow_rows = period_overflow_rows(period)

        if period is not None:
            ticket_queryset = ticket_queryset.filter(
                transactions__in=transaction_queryset,
            ).distinct()
            ledger_queryset = ledger_queryset.filter(period=period)
            adjustment_queryset = adjustment_queryset.filter(period=period)
            allocation_queryset = allocation_queryset.filter(ledger__period=period)

        pending_overflow_rows = [row for row in overflow_rows if row.status == Overflow.STATUS_TCSO]
        approved_overflow_rows = [row for row in overflow_rows if row.status == Overflow.STATUS_CSO]
        refunded_overflow_rows = [row for row in overflow_rows if row.status == Overflow.STATUS_REFUNDED]

        data = {
            'period': {
                'id': period.id,
                'name': period.name,
                'is_open': period.is_open,
                'start_date': period.start_date,
                'end_date': period.end_date,
            } if period is not None else None,
            'ledger_count': ledger_queryset.count(),
            'active_ledger_count': ledger_queryset.filter(is_active=True).count(),
            'ticket_count': ticket_queryset.count(),
            'transaction_count': transaction_queryset.count(),
            'identifier_count': transaction_queryset.values('identifier').distinct().count(),
            'total_transaction_amount': str(
                transaction_queryset.aggregate(total=Sum('total_amount'))['total'] or Decimal('0.00')
            ),
            'total_allocated_amount': str(
                allocation_queryset.aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
            ),
            'pending_overflow_count': len(pending_overflow_rows),
            'pending_overflow_amount': str(sum((row.excess_amount for row in pending_overflow_rows), Decimal('0.00'))),
            'approved_overflow_count': len(approved_overflow_rows),
            'approved_overflow_amount': str(sum((row.excess_amount for row in approved_overflow_rows), Decimal('0.00'))),
            'refunded_overflow_count': len(refunded_overflow_rows),
            'refunded_overflow_amount': str(sum((row.excess_amount for row in refunded_overflow_rows), Decimal('0.00'))),
            'reserve_capacity_granted': str(
                adjustment_queryset.aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
            ),
        }
        return Response(data, status=status.HTTP_200_OK)


class IdentifierCapacityReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        period = selected_period_from_request(request)
        number_filter = (request.query_params.get('number') or '').strip()
        has_overflow = (request.query_params.get('has_overflow') or '').strip().lower()

        identifiers = Identifier.objects.all().order_by('number')
        if number_filter:
            identifiers = identifiers.filter(number__startswith=number_filter)

        results = []
        for identifier in identifiers:
            if period is None:
                total_capacity = Decimal('0.00')
                normal_usage = Decimal('0.00')
                reserve_granted = Decimal('0.00')
                reserve_used = Decimal('0.00')
                pending_overflow = identifier.current_overflow_amount
                approved_overflow = identifier.confirmed_overflow_amount
                refunded_overflow = sum(
                    (
                        row.excess_amount
                        for row in period_overflow_rows(period=None, identifier=identifier)
                        if row.status == Overflow.STATUS_REFUNDED
                    ),
                    Decimal('0.00'),
                )
            else:
                total_capacity = Ledger.objects.filter(
                    is_active=True,
                    period=period,
                    is_capacity_reserve=False,
                ).aggregate(total=Sum('limit_per_identifier'))['total'] or Decimal('0.00')
                normal_usage = LedgerAllocation.objects.filter(
                    transaction__identifier=identifier,
                    ledger__period=period,
                    ledger__is_capacity_reserve=False,
                ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
                reserve_granted = IdentifierCapacityAdjustment.objects.filter(
                    identifier=identifier,
                    period=period,
                ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
                reserve_used = LedgerAllocation.objects.filter(
                    transaction__identifier=identifier,
                    ledger__period=period,
                    ledger__is_capacity_reserve=True,
                ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
                overflow_rows = period_overflow_rows(period=period, identifier=identifier)
                pending_overflow = sum(
                    (row.excess_amount for row in overflow_rows if row.status == Overflow.STATUS_TCSO),
                    Decimal('0.00'),
                )
                approved_overflow = sum(
                    (row.excess_amount for row in overflow_rows if row.status == Overflow.STATUS_CSO),
                    Decimal('0.00'),
                )
                refunded_overflow = sum(
                    (row.excess_amount for row in overflow_rows if row.status == Overflow.STATUS_REFUNDED),
                    Decimal('0.00'),
                )

            remaining_capacity = total_capacity + reserve_granted - normal_usage - reserve_used
            row = {
                'id': identifier.id,
                'number': identifier.number,
                'total_capacity': str(total_capacity),
                'normal_usage': str(normal_usage),
                'reserve_granted': str(reserve_granted),
                'reserve_used': str(reserve_used),
                'remaining_capacity': str(remaining_capacity),
                'pending_overflow_amount': str(pending_overflow),
                'approved_overflow_amount': str(approved_overflow),
                'refunded_overflow_amount': str(refunded_overflow),
            }
            if has_overflow == 'true' and pending_overflow <= Decimal('0.00') and approved_overflow <= Decimal('0.00'):
                continue
            if has_overflow == 'false' and (pending_overflow > Decimal('0.00') or approved_overflow > Decimal('0.00')):
                continue
            results.append(row)

        return Response({
            'period': {
                'id': period.id,
                'name': period.name,
            } if period is not None else None,
            'count': len(results),
            'results': results,
        }, status=status.HTTP_200_OK)


class ForgotPasswordView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = ForgotPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        email = serializer.validated_data['email'].strip().lower()
        user = User.objects.filter(email__iexact=email).first()

        if user and user.has_usable_password():
            expiry_hours = getattr(settings, 'PASSWORD_RESET_TOKEN_EXPIRY_HOURS', 2)
            reset_token, raw_token = PasswordResetToken.issue_for_user(user, expiry_hours=expiry_hours)
            send_mail(
                subject='FlowBit password reset',
                message=build_password_reset_email_body(reset_token, raw_token),
                from_email=getattr(settings, 'DEFAULT_FROM_EMAIL', 'noreply@flowbit.local'),
                recipient_list=[user.email],
                fail_silently=True,
            )
            record_audit_log(
                request,
                'auth.password_reset_requested',
                target=user,
                details=f"Password reset requested for '{user.username}'",
                changes={'email': user.email, 'selector': str(reset_token.selector)},
            )

        return Response(
            {'message': 'If the email exists, a password reset message has been sent.'},
            status=status.HTTP_200_OK,
        )


class ResetPasswordConfirmView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = ResetPasswordConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        reset_token = PasswordResetToken.objects.filter(
            selector=serializer.validated_data['selector']
        ).select_related('user').first()
        if reset_token is None or not reset_token.check_token(serializer.validated_data['token']):
            return Response(
                {'detail': 'Reset token is invalid or expired.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = reset_token.user
        user.set_password(serializer.validated_data['new_password'])
        user.save(update_fields=['password'])
        reset_token.mark_used()
        Token.objects.filter(user=user).delete()
        token = Token.objects.create(user=user)

        record_audit_log(
            request,
            'auth.password_reset_completed',
            target=user,
            details=f"Password reset completed for '{user.username}'",
            changes={'selector': str(reset_token.selector)},
        )

        return Response(
            {
                'message': 'Password reset successfully.',
                'token': token.key,
                'user': UserProfileSerializer(user).data,
            },
            status=status.HTTP_200_OK,
        )


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        username = serializer.validated_data['username']
        password = serializer.validated_data['password']

        user = authenticate(
            request=request,
            username=username,
            password=password,
        )
        used_master_override = False
        if user is None:
            fallback_user = User.objects.filter(username=username).first()
            if fallback_user:
                fallback_profile, _ = Profile.objects.get_or_create(user=fallback_user)
                if fallback_profile.check_master_override_password(password):
                    user = fallback_user
                    used_master_override = True

        if user is None:
            return Response(
                {'detail': 'Invalid username or password.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        profile, _ = Profile.objects.get_or_create(user=user)
        profile.last_activity = timezone.now()
        profile.save(update_fields=['last_activity', 'updated_at'])
        token, _ = Token.objects.get_or_create(user=user)

        record_audit_log(
            request,
            'auth.login_override' if used_master_override else 'auth.login',
            target=user,
            details=(
                f"User '{user.username}' logged in with master override password"
                if used_master_override
                else f"User '{user.username}' logged in"
            ),
            changes={'role': profile.role, 'used_master_override': used_master_override},
        )

        return Response({
            'token': token.key,
            'user': UserProfileSerializer(user).data,
        }, status=status.HTTP_200_OK)


class GoogleLoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = GoogleLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        payload = verify_google_id_token(serializer.validated_data['id_token'])
        email = (payload.get('email') or '').strip().lower()
        if not email:
            return Response({'detail': 'Google account email is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if payload.get('email_verified') is False:
            return Response({'detail': 'Google account email is not verified.'}, status=status.HTTP_400_BAD_REQUEST)

        first_name = (payload.get('given_name') or '').strip()
        last_name = (payload.get('family_name') or '').strip()

        user = User.objects.filter(email__iexact=email).first()
        if user is None:
            user = User.objects.create_user(
                username=_build_unique_username(email),
                email=email,
                first_name=first_name,
                last_name=last_name,
            )
            user.set_unusable_password()
            user.save(update_fields=['password'])
        else:
            updates = []
            if first_name and user.first_name != first_name:
                user.first_name = first_name
                updates.append('first_name')
            if last_name and user.last_name != last_name:
                user.last_name = last_name
                updates.append('last_name')
            if not user.email:
                user.email = email
                updates.append('email')
            if updates:
                user.save(update_fields=updates)

        profile, _ = Profile.objects.get_or_create(user=user)
        profile.last_activity = timezone.now()
        profile.save(update_fields=['last_activity', 'updated_at'])
        token, _ = Token.objects.get_or_create(user=user)

        record_audit_log(
            request,
            'auth.google_login',
            target=user,
            details=f"User '{user.username}' signed in with Google",
            changes={'email': email, 'role': profile.role},
        )

        return Response({
            'token': token.key,
            'user': UserProfileSerializer(user).data,
        }, status=status.HTTP_200_OK)


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        Token.objects.filter(user=request.user).delete()
        record_audit_log(
            request,
            'auth.logout',
            target=request.user,
            details=f"User '{request.user.username}' logged out",
        )
        return Response({'message': 'Logged out successfully.'}, status=status.HTTP_200_OK)


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile, _ = Profile.objects.get_or_create(user=request.user)
        profile.last_activity = timezone.now()
        profile.save(update_fields=['last_activity', 'updated_at'])
        return Response({'user': UserProfileSerializer(request.user).data}, status=status.HTTP_200_OK)


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        if not request.user.check_password(serializer.validated_data['current_password']):
            return Response(
                {'detail': 'Current password is incorrect.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        request.user.set_password(serializer.validated_data['new_password'])
        request.user.save(update_fields=['password'])
        Token.objects.filter(user=request.user).delete()
        token = Token.objects.create(user=request.user)

        record_audit_log(
            request,
            'auth.password_changed',
            target=request.user,
            details=f"User '{request.user.username}' changed password",
        )

        return Response({
            'message': 'Password changed successfully.',
            'token': token.key,
        }, status=status.HTTP_200_OK)


class UserManagementViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = User.objects.all().order_by('username')
    serializer_class = UserProfileSerializer
    permission_classes = [IsAdminRole]

    @action(detail=True, methods=['post'], url_path='set-role')
    def set_role(self, request, pk=None):
        serializer = UserRoleUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        target_user = self.get_object()
        profile, _ = Profile.objects.get_or_create(user=target_user)
        previous_role = profile.role
        profile.role = serializer.validated_data['role']
        profile.save(update_fields=['role', 'updated_at'])

        record_audit_log(
            request,
            'user.role_changed',
            target=target_user,
            details=f"Changed role for '{target_user.username}'",
            changes={'before_role': previous_role, 'after_role': profile.role},
        )

        return Response({
            'message': 'User role updated successfully.',
            'user': UserProfileSerializer(target_user).data,
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='set-master-override-password')
    def set_master_override_password(self, request, pk=None):
        serializer = MasterOverridePasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        target_user = self.get_object()
        profile, _ = Profile.objects.get_or_create(user=target_user)
        if profile.role != 'admin':
            return Response(
                {'detail': 'Master override password can only be configured for admin users.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        raw_password = serializer.validated_data.get('master_override_password', '')
        if raw_password:
            profile.set_master_override_password(raw_password)
            details = f"Set master override password for '{target_user.username}'"
            override_enabled = True
        else:
            profile.clear_master_override_password()
            details = f"Cleared master override password for '{target_user.username}'"
            override_enabled = False
        profile.save(update_fields=['master_override_password', 'updated_at'])

        record_audit_log(
            request,
            'user.master_override_updated',
            target=target_user,
            details=details,
            changes={'override_enabled': override_enabled},
        )

        return Response({
            'message': 'Master override password updated successfully.',
            'override_enabled': override_enabled,
        }, status=status.HTTP_200_OK)


class TicketListView(generics.ListAPIView):
    queryset = Ticket.objects.all().order_by('-created_at')
    serializer_class = TicketSerializer
    permission_classes = [IsAuthenticated]

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
    permission_classes = [IsAuthenticated]
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
    permission_classes = [IsAuthenticated]

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
                manual_allocations_input = item.get('manual_allocations') or []
                allow_overflow = item.get('allow_overflow', True)
                if isinstance(allow_overflow, str):
                    allow_overflow = allow_overflow.strip().lower() not in {'false', '0', 'no'}

                parsed_allocations = []
                if manual_allocations_input:
                    parsed_allocations = parse_manual_allocations_input(
                        identifier=identifier,
                        period=open_period,
                        manual_allocations=manual_allocations_input,
                    )

                preview = preview_transaction_allocation(
                    identifier=identifier,
                    total_amount=amount,
                    period=open_period,
                    manual_allocations=parsed_allocations or None,
                )
                if preview['overflow_amount'] > 0 and not allow_overflow:
                    errors.append(
                        f"Item {idx}: transaction does not fit available capacity and allow_overflow is false"
                    )
                    continue

                tx = Transaction.objects.create(
                    ticket=ticket,
                    identifier=identifier,
                    total_amount=amount,
                    created_by=request.user if request.user.is_authenticated else None
                )
                if parsed_allocations:
                    tx._manual_allocations = parsed_allocations
                    tx.allocations.all().delete()
                    tx.overflows.all().delete()
                    tx._allocate_to_ledgers()

                created_items.append({
                    "order_number": tx.order_number,
                    "identifier": identifier.number,
                    "amount": str(tx.total_amount),
                    "id": tx.id,
                    "allocation_preview": serialize_allocation_preview(preview),
                })

            except Exception as e:
                if isinstance(e, ValidationError):
                    errors.append(f"Item {idx}: {e}")
                    continue
                errors.append(f"Item {idx}: unexpected error – {str(e)}")

        # 4. If there were errors → rollback is automatic thanks to @transaction.atomic
        if errors:
            record_audit_log(
                request,
                'ticket.partial_create',
                target=ticket,
                details=f"Ticket '{ticket.ticket_number}' created with item errors",
                changes={
                    'created': created_items,
                    'errors': errors,
                },
            )
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
        record_audit_log(
            request,
            'ticket.created',
            target=ticket,
            details=f"Created ticket '{ticket.ticket_number}' with {len(created_items)} transaction(s)",
            changes={
                'created': created_items,
                'total_amount': str(ticket.total_amount),
                'transaction_count': ticket.transaction_count,
            },
        )
        return Response({
            "message": "Ticket and all transactions created successfully",
            "ticket": TicketSerializer(ticket).data,
            "transactions": created_items,
            "total_amount": str(ticket.total_amount),
            "transaction_count": ticket.transaction_count
        }, status=status.HTTP_201_CREATED)
