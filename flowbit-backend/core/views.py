# All imports organized in ONE place at the top
from rest_framework import viewsets, generics, status, mixins
from rest_framework.permissions import AllowAny
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated, IsAuthenticatedOrReadOnly
from rest_framework.parsers import MultiPartParser, FormParser
from django.contrib.auth.models import User
from django.core.mail import send_mail
from django.contrib.auth import authenticate
from django.conf import settings
from django.db import transaction as db_transaction, transaction
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from django.http import HttpResponse
from django.db.models import Count, DecimalField, ExpressionWrapper, F, IntegerField, OuterRef, Prefetch, Q, Subquery, Sum, Value
from django.db.models.functions import Coalesce, Greatest
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
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from .models import (
    DEFAULT_HELPER_NAME,
    Period,
    LuckyDraw,
    Ledger,
    Identifier,
    Transaction,
    Overflow,
    OverflowNotification,
    UserNotification,
    SupportCase,
    SupportMessage,
    AuditLog,
    Profile,
    PasswordResetToken,
    Collaborator,
    Ticket,
    LedgerAllocation,
    IdentifierCapacityAdjustment,
    IdentifierLedgerFreeze,
    _is_returned_pending_overflow,
    _announce_pending_overflows,
    _notify_remaining_overkill_for_lucky_draw,
    _retry_pending_overflows,
    preview_transaction_allocation,
    refund_overflow,
    refund_transactions,
)
from .audit import record_audit_log, serialize_audit_value, snapshot_instance
from .permissions import (
    IsAdminRole,
    IsAuthenticatedReadOnlyOrAdminWrite,
    IsAuthenticatedReadOnlyOrAdminWriteOrOverride,
    get_request_admin_override_code,
    get_request_admin_override_profile,
    get_valid_admin_override_profile,
    is_admin_user,
)
from .serializers import (
    FlexibleDateTimeField,
    PeriodSerializer,
    LuckyDrawSerializer,
    LedgerSerializer,
    IdentifierSerializer,
    TransactionSerializer,
    OverflowSerializer,
    CollaboratorSerializer,
    OverflowNotificationSerializer,
    UserNotificationSerializer,
    NotificationBroadcastSerializer,
    SupportCaseSerializer,
    SupportCaseDetailSerializer,
    SupportCaseCreateSerializer,
    SupportCaseReplySerializer,
    TicketSerializer,
    TicketDetailSerializer,
    AuditLogSerializer,
    LoginSerializer,
    RegisterSerializer,
    GoogleLoginSerializer,
    UserProfileSerializer,
    UserProfileUpdateSerializer,
    ChangePasswordSerializer,
    AccountDeletionSerializer,
    ProfileAvatarSerializer,
    ForgotPasswordSerializer,
    ResetPasswordConfirmSerializer,
    CollaboratorManageSerializer,
    UserRoleUpdateSerializer,
    MasterOverridePasswordSerializer,
    TicketRefundActionSerializer,
    TicketReceiptPdfSerializer,
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


def parse_time_value(value):
    if value in (None, ''):
        return None
    if isinstance(value, time):
        return value.replace(tzinfo=None) if getattr(value, 'tzinfo', None) is not None else value
    if isinstance(value, str):
        stripped = value.strip()
        for fmt in ('%H:%M', '%H:%M:%S'):
            try:
                return datetime.strptime(stripped, fmt).time()
            except ValueError:
                continue
    return None


def selected_period_from_request(request):
    period_id = request.query_params.get('period_id')
    if period_id:
        try:
            return Period.objects.get(id=period_id)
        except (Period.DoesNotExist, ValueError):
            return None
    return Period.get_open_period()


def period_transaction_queryset(period, user=None):
    queryset = Transaction.objects.all()
    if user is not None:
        queryset = queryset.filter(created_by=user)

    if period is None:
        return queryset.distinct()

    return queryset.filter(
        Q(allocations__ledger__period=period) |
        Q(
            allocations__isnull=True,
            timestamp__gte=period.start_date,
            timestamp__lte=period.end_date,
        )
    ).distinct()


def period_overflow_rows(period, identifier=None, user=None):
    overflow_queryset = Overflow.objects.all()
    if user is not None:
        overflow_queryset = overflow_queryset.filter(owner=user)
    if identifier is not None:
        overflow_queryset = overflow_queryset.filter(identifier=identifier)

    if period is not None:
        overflow_queryset = overflow_queryset.filter(period=period)

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
        'full_name': user.full_name,
        'email': user.email,
        'phone_number': user.phone_number,
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


def ticket_creation_locked_for_period(period):
    if period is None:
        return False
    lucky_draw = getattr(period, 'lucky_draw', None)
    return bool(lucky_draw and lucky_draw.announced_at)


def period_locked_after_lucky_draw(period):
    return ticket_creation_locked_for_period(period)


def notification_action_href_for_recipient(recipient, action_href):
    if not action_href:
        return action_href

    if action_href.startswith('/admin/'):
        return action_href if is_admin_user(recipient) else '/notifications'

    if action_href == '/periods':
        return action_href if is_admin_user(recipient) else '/'

    return action_href


def create_user_notification(
    *,
    recipient,
    title,
    message,
    category=UserNotification.CATEGORY_SYSTEM,
    level=UserNotification.LEVEL_INFO,
    action_href='',
    source_key='',
    created_by=None,
    period=None,
):
    defaults = {
        'category': category,
        'level': level,
        'title': title,
        'message': message,
        'action_href': notification_action_href_for_recipient(recipient, action_href),
        'created_by': created_by,
        'period': period,
    }

    if source_key:
        notification, created = UserNotification.objects.update_or_create(
            recipient=recipient,
            source_key=source_key,
            defaults=defaults,
        )
        return notification, created

    notification = UserNotification.objects.create(
        recipient=recipient,
        category=category,
        level=level,
        title=title,
        message=message,
        action_href=notification_action_href_for_recipient(recipient, action_href),
        created_by=created_by,
        period=period,
    )
    return notification, True


def broadcast_user_notification(
    *,
    title,
    message,
    category=UserNotification.CATEGORY_ANNOUNCEMENT,
    level=UserNotification.LEVEL_INFO,
    action_href='',
    source_key='',
    created_by=None,
    period=None,
):
    created_count = 0
    for recipient in User.objects.filter(is_active=True).order_by('id'):
        _, created = create_user_notification(
            recipient=recipient,
            title=title,
            message=message,
            category=category,
            level=level,
            action_href=action_href,
            source_key=source_key,
            created_by=created_by,
            period=period,
        )
        if created:
            created_count += 1
    return created_count


def notify_period_change(*, period, action_label, message, request_user, action_href='/periods'):
    broadcast_user_notification(
        title=f'Period {action_label}',
        message=message,
        category=UserNotification.CATEGORY_SYSTEM,
        level=UserNotification.LEVEL_IMPORTANT,
        action_href=action_href,
        source_key=f'period:{action_label}:{period.id}:{timezone.now().isoformat()}',
        created_by=request_user,
        period=period,
    )


def notify_ledger_change(*, ledger, action_label, message, request_user, action_href='/ledgers'):
    broadcast_user_notification(
        title=f'Ledger {action_label}',
        message=message,
        category=UserNotification.CATEGORY_SYSTEM,
        level=UserNotification.LEVEL_WARNING,
        action_href=action_href,
        source_key=f'ledger:{action_label}:{ledger.id}:{timezone.now().isoformat()}',
        created_by=request_user,
        period=ledger.period,
    )


def notify_refund_change(*, recipient, title, message, request_user, action_href='/tickets', source_key='', period=None):
    create_user_notification(
        recipient=recipient,
        title=title,
        message=message,
        category=UserNotification.CATEGORY_SYSTEM,
        level=UserNotification.LEVEL_WARNING,
        action_href=action_href,
        source_key=source_key,
        created_by=request_user,
        period=period,
    )


def notify_identifier_freeze_change(
    *,
    recipient,
    identifier,
    period,
    action_label,
    message,
    request_user,
    action_href='/ledgers',
    source_key='',
):
    create_user_notification(
        recipient=recipient,
        title=f'Identifier {action_label}',
        message=message,
        category=UserNotification.CATEGORY_SYSTEM,
        level=UserNotification.LEVEL_WARNING,
        action_href=action_href,
        source_key=source_key,
        created_by=request_user,
        period=period,
    )


def notify_user_account_change(
    *,
    recipient,
    title,
    message,
    request_user,
    action_href='/profile',
    source_key='',
):
    create_user_notification(
        recipient=recipient,
        title=title,
        message=message,
        category=UserNotification.CATEGORY_SYSTEM,
        level=UserNotification.LEVEL_IMPORTANT,
        action_href=action_href,
        source_key=source_key,
        created_by=request_user,
    )


def notify_support_case_participants(
    *,
    support_case,
    actor,
    title,
    message,
    include_admins=False,
    action_href='/contact-support',
):
    recipients = set()
    if support_case.created_by_id != actor.id:
        recipients.add(support_case.created_by)
    if include_admins:
        recipients.update(
            User.objects.filter(profile__role='admin', is_active=True).exclude(pk=actor.pk)
        )

    for recipient in recipients:
        create_user_notification(
            recipient=recipient,
            title=title,
            message=message,
            category=UserNotification.CATEGORY_SYSTEM,
            level=UserNotification.LEVEL_IMPORTANT,
            action_href=action_href,
            source_key=f"support-case:{support_case.id}:{title.lower().replace(' ', '-')}:{recipient.id}:{timezone.now().isoformat()}",
            created_by=actor,
        )


def _ticket_refund_summary(ticket):
    transactions = list(ticket.transactions.all())
    visible_transactions = [transaction for transaction in transactions if not transaction.is_refunded]
    entries = []
    total_amount = Decimal('0.00')

    for transaction_obj in visible_transactions:
        total_amount += transaction_obj.total_amount
        entries.append({
            'transaction_id': transaction_obj.id,
            'order_number': transaction_obj.order_number,
            'identifier_number': transaction_obj.identifier.number,
            'ticket_amount': str(transaction_obj.total_amount),
        })

    return {
        'ticket_number': ticket.ticket_number,
        'entry_count': len(visible_transactions),
        'total_ticket_amount': str(total_amount),
        'entries': entries,
    }


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
        raise DRFValidationError("Google sign-in is not configured.")

    try:
        from google.auth.transport import requests as google_requests
        from google.oauth2 import id_token as google_id_token
    except ImportError as exc:
        raise DRFValidationError(
            "Google sign-in dependencies are incomplete. Please install the requests package."
        ) from exc

    try:
        return google_id_token.verify_oauth2_token(
            id_token_value,
            google_requests.Request(),
            settings.GOOGLE_OAUTH_CLIENT_ID,
        )
    except Exception as exc:
        raise DRFValidationError("Invalid Google ID token.") from exc


def resolve_collaborators_for_approval(request, collaborator_ids):
    if not collaborator_ids or not isinstance(collaborator_ids, list):
        raise ValidationError("At least one collaborator must be selected.")

    if not getattr(request, 'user', None) or not request.user.is_authenticated:
        raise ValidationError("Authentication is required.")

    collaborators = list(
        Collaborator.objects.filter(owner=request.user, id__in=collaborator_ids).order_by('id')
    )
    if len(collaborators) != len(set(collaborator_ids)):
        raise ValidationError("One or more selected collaborators do not exist.")

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
                owner=getattr(identifier, '_allocation_owner', None),
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
    permission_classes = [IsAuthenticatedReadOnlyOrAdminWrite]

    def _auto_close_expired_periods(self, request):
        now = timezone.now()
        expired_periods = list(
            Period.objects.filter(is_open=True, end_date__lte=now).order_by('end_date', 'id')
        )

        if not expired_periods:
            return

        closed_periods = []
        with db_transaction.atomic():
            for period in expired_periods:
                period.close(
                    closed_at=now,
                    helper_name=helper_name_from_request(request),
                    closing_user=request.user if getattr(request, 'user', None) and request.user.is_authenticated else None,
                )
                broadcast_user_notification(
                    title='Period auto-closed',
                    message=f"{period.name} was auto-closed by the system after reaching its end time.",
                    category=UserNotification.CATEGORY_SYSTEM,
                    level=UserNotification.LEVEL_WARNING,
                    action_href='/periods',
                    source_key=f'period:auto-closed:{period.id}:{serialize_audit_value(now)}',
                    created_by=request.user if getattr(request, 'user', None) and request.user.is_authenticated else None,
                    period=period,
                )
                closed_periods.append({
                    'id': period.id,
                    'name': period.name,
                    'closed_at': serialize_audit_value(now),
                })

        record_audit_log(
            request,
            'period.auto_closed',
            details=f"Auto-closed {len(closed_periods)} expired period(s)",
            changes={'closed_periods': closed_periods},
        )

    def perform_create(self, serializer):
        period = serializer.save()
        for user in User.objects.all().order_by('id'):
            Ledger.get_capacity_reserve(period, user, create=True)
        notify_period_change(
            period=period,
            action_label='created',
            message=f"{period.name} has been created and opened for operations.",
            request_user=self.request.user,
        )
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
        period.sync_reserve_ledgers()
        notify_period_change(
            period=period,
            action_label='updated',
            message=f"{period.name} has been updated. Review the latest period schedule.",
            request_user=self.request.user,
        )
        record_audit_log(
            self.request,
            'period.updated',
            target=period,
            details=f"Updated period '{period.name}'",
            changes={'before': before, 'after': snapshot_instance(period)},
        )

    def perform_destroy(self, instance):
        try:
            instance.can_delete()
        except ValidationError as exc:
            message = exc.messages[0] if getattr(exc, 'messages', None) else str(exc)
            raise DRFValidationError({'detail': message})

        before = snapshot_instance(instance)
        period_name = instance.name
        notify_period_change(
            period=instance,
            action_label='deleted',
            message=f"{period_name} has been deleted by admin.",
            request_user=self.request.user,
        )
        instance.ledgers.all().delete()
        super().perform_destroy(instance)
        record_audit_log(
            self.request,
            'period.deleted',
            details=f"Deleted period '{period_name}'",
            changes={'before': before},
        )

    def get_queryset(self):
        self._auto_close_expired_periods(self.request)
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
        self._auto_close_expired_periods(request)
        period = Period.get_open_period()
        if not period:
            return Response(
                {"detail": "No open period found"},
                status=status.HTTP_404_NOT_FOUND
            )

        serializer = self.get_serializer(period)
        return Response(serializer.data)

    @action(detail=True, methods=['get', 'post', 'patch', 'delete'], url_path='lucky-draw')
    def lucky_draw(self, request, pk=None):
        period = self.get_object()
        lucky_draw = getattr(period, 'lucky_draw', None)

        if request.method == 'GET':
            if lucky_draw is None:
                return Response({
                    'period': period.id,
                    'period_name': period.name,
                    'number': None,
                    'display_number': "***-***",
                    'winning_identifiers': [],
                    'announced_by': None,
                    'announced_by_username': None,
                    'announced_at': None,
                    'reveal_time': period.lucky_draw_reveal_time.strftime('%H:%M:%S'),
                    'created_at': None,
                    'updated_at': None,
                }, status=status.HTTP_200_OK)

            serializer = LuckyDrawSerializer(lucky_draw, context={'request': request})
            data = serializer.data
            data['reveal_time'] = period.lucky_draw_reveal_time.strftime('%H:%M:%S')
            if not is_admin_user(request.user):
                data['number'] = None
            return Response(data)

        if not is_admin_user(request.user):
            return Response(
                {'detail': 'Only admin users can update the lucky draw number.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        if (not period.is_open) or timezone.now() >= period.end_date:
            return Response(
                {'detail': 'Lucky draw number cannot be changed after the period ends.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if request.method == 'DELETE':
            if lucky_draw is None:
                return Response(
                    {'detail': 'Lucky draw number does not exist for this period.'},
                    status=status.HTTP_404_NOT_FOUND,
                )

            before = snapshot_instance(lucky_draw)
            broadcast_user_notification(
                title='Lucky draw removed',
                message=f"The lucky draw number for {period.name} has been removed by admin.",
                category=UserNotification.CATEGORY_SYSTEM,
                level=UserNotification.LEVEL_WARNING,
                action_href='/periods',
                source_key=f'lucky-draw-removed:{period.id}:{before.get("updated_at", before.get("id", ""))}',
                created_by=request.user,
                period=period,
            )
            lucky_draw.delete()
            record_audit_log(
                request,
                'period.lucky_draw_deleted',
                details=f"Deleted lucky draw for period '{period.name}'",
                changes={'before': before},
            )
            return Response(status=status.HTTP_204_NO_CONTENT)

        reveal_time = parse_time_value(request.data.get('reveal_time'))
        if request.data.get('reveal_time') not in (None, '') and reveal_time is None:
            return Response(
                {'detail': 'Reveal time must be a valid time.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = LuckyDrawSerializer(
            lucky_draw,
            data=request.data,
            partial=request.method == 'PATCH',
            context={'request': request},
        )
        serializer.is_valid(raise_exception=True)
        before = snapshot_instance(lucky_draw) if lucky_draw is not None else None
        if reveal_time is not None and period.lucky_draw_reveal_time != reveal_time:
            period.lucky_draw_reveal_time = reveal_time
            period.save(update_fields=['lucky_draw_reveal_time'])
        announced_at = timezone.now()
        reveal_at = period.lucky_draw_reveal_at
        lucky_draw = serializer.save(
            period=period,
            announced_by=request.user,
            announced_at=announced_at,
        )
        period.ledgers.filter(is_active=True).update(
            is_active=False,
            closed_at=lucky_draw.announced_at,
        )
        _announce_pending_overflows(
            period,
            announced_at=lucky_draw.announced_at,
            helper_name=request.user.username,
            announcing_user=request.user,
        )
        _notify_remaining_overkill_for_lucky_draw(
            period,
            announced_at=lucky_draw.announced_at,
            announcing_user=request.user,
        )
        broadcast_user_notification(
            title='Lucky draw announced',
            message=f"{period.name} lucky draw number is now {lucky_draw.display_number(reveal_for_admin=True)}.",
            category=UserNotification.CATEGORY_SYSTEM,
            level=UserNotification.LEVEL_IMPORTANT,
            action_href='/',
            source_key=f'lucky-draw-announced:{period.id}:{lucky_draw.number}',
            created_by=request.user,
            period=period,
        )
        record_audit_log(
            request,
            'period.lucky_draw_updated' if before else 'period.lucky_draw_created',
            target=lucky_draw,
            details=f"{'Updated' if before else 'Created'} lucky draw for period '{period.name}'",
            changes={
                'before': before,
                'after': snapshot_instance(lucky_draw),
            },
        )
        return Response(
            LuckyDrawSerializer(lucky_draw, context={'request': request}).data,
            status=status.HTTP_200_OK if before else status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=['get'], url_path='lucky-draw-winners')
    def lucky_draw_winners(self, request, pk=None):
        period = self.get_object()
        lucky_draw = getattr(period, 'lucky_draw', None)
        serialized_draw = (
            LuckyDrawSerializer(lucky_draw, context={'request': request}).data
            if lucky_draw is not None
            else {
                'period': period.id,
                'period_name': period.name,
                'number': None,
                'display_number': "***-***",
                'winning_identifiers': [],
                'announced_by': None,
                'announced_by_username': None,
                'announced_at': None,
                'created_at': None,
                'updated_at': None,
            }
        )
        if lucky_draw is None:
            return Response({
                'lucky_draw': serialized_draw,
                'tickets': [],
                'approved_overflows': [],
                'overkill_overflows': [],
            }, status=status.HTTP_200_OK)

        serialized_draw['display_number'] = f"{lucky_draw.number[:3]}-{lucky_draw.number[3:]}"

        winning_identifiers = lucky_draw.winning_identifiers
        ticket_queryset = Ticket.objects.filter(
            created_by=request.user,
            transactions__identifier__number__in=winning_identifiers,
        ).distinct().prefetch_related('transactions__identifier')
        tickets = []
        for ticket in ticket_queryset.order_by('-created_at'):
            matched_identifiers = sorted({
                transaction.identifier.number
                for transaction in ticket.transactions.all()
                if transaction.identifier.number in winning_identifiers and not transaction.is_refunded
            })
            if not matched_identifiers:
                continue
            visible_transactions = [transaction for transaction in ticket.transactions.all() if not transaction.is_refunded]
            total_amount = sum((transaction.total_amount for transaction in visible_transactions), Decimal('0.00'))
            tickets.append({
                'ticket_number': ticket.ticket_number,
                'customer_name': ticket.customer_name,
                'created_at': ticket.created_at,
                'matched_identifiers': matched_identifiers,
                'transaction_count': len(visible_transactions),
                'total_amount': str(total_amount),
            })

        approved_overflow_rows = []
        for overflow in Overflow.objects.filter(
            owner=request.user,
            period=period,
            status=Overflow.STATUS_CSO,
            identifier__number__in=winning_identifiers,
        ).select_related('identifier', 'transaction__ticket').prefetch_related('collaborators').order_by('-approved_at', '-id'):
            approved_overflow_rows.append({
                'id': overflow.id,
                'identifier_number': overflow.identifier.number if overflow.identifier_id else '',
                'ticket_number': overflow.transaction.ticket.ticket_number if overflow.transaction_id and overflow.transaction.ticket_id else None,
                'amount': str(overflow.amount_to_approve or overflow.excess_amount or Decimal('0.00')),
                'approved_at': overflow.approved_at,
                'collaborator_names': [collaborator.full_name for collaborator in overflow.collaborators.all()],
            })

        overkill_rows = []
        for overflow in Overflow.objects.filter(
            owner=request.user,
            period=period,
            status=Overflow.STATUS_OVERKILL,
            identifier__number__in=winning_identifiers,
        ).select_related('identifier').prefetch_related('collaborators').order_by('-approved_at', '-id'):
            overkill_rows.append({
                'id': overflow.id,
                'identifier_number': overflow.identifier.number if overflow.identifier_id else '',
                'ticket_number': None,
                'amount': str(overflow.amount_to_approve or overflow.excess_amount or Decimal('0.00')),
                'approved_at': overflow.approved_at,
                'collaborator_names': [collaborator.full_name for collaborator in overflow.collaborators.all()],
            })

        return Response({
            'lucky_draw': serialized_draw,
            'tickets': tickets,
            'approved_overflows': approved_overflow_rows,
            'overkill_overflows': overkill_rows,
        }, status=status.HTTP_200_OK)

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
            closing_user=request.user if request.user.is_authenticated else None,
        )
        notify_period_change(
            period=period,
            action_label='closed',
            message=f"{period.name} has been closed.",
            request_user=request.user,
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

    @action(detail=True, methods=['post'], url_path='reopen')
    def reopen_period(self, request, pk=None):
        period = self.get_object()

        end_date_value = request.data.get('end_date')
        close_time_value = request.data.get('close_time')
        if not end_date_value or not close_time_value:
            return Response(
                {"detail": "End date and close time are required to reopen a period."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            parsed_close_time = PeriodSerializer().fields['close_time'].to_internal_value(close_time_value)
            if getattr(parsed_close_time, 'tzinfo', None) is not None:
                parsed_close_time = parsed_close_time.replace(tzinfo=None)
            parsed_end_date = FlexibleDateTimeField(
                default_time=lambda _field: parsed_close_time
            ).to_internal_value(end_date_value)
        except Exception:
            return Response(
                {"detail": "Enter a valid end date and close time."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        period.end_date = parsed_end_date

        try:
            period.reopen(save=False)
            period.save(update_fields=['is_open', 'closed_at', 'end_date'])
            period.sync_reserve_ledgers()
        except ValidationError as exc:
            message = exc.messages[0] if getattr(exc, 'messages', None) else str(exc)
            return Response({"detail": message}, status=status.HTTP_400_BAD_REQUEST)

        notify_period_change(
            period=period,
            action_label='reopened',
            message=f"{period.name} has been reopened with a new end date.",
            request_user=request.user,
        )
        record_audit_log(
            request,
            'period.reopened',
            target=period,
            details=f"Reopened period '{period.name}'",
            changes={
                'reopened_at': serialize_audit_value(timezone.now()),
                'end_date': serialize_audit_value(period.end_date),
                'reactivated_reserve_ledgers': period.ledgers.filter(is_capacity_reserve=True, is_active=True).count(),
            },
        )

        serializer = self.get_serializer(period)
        return Response({
            "message": f"Period '{period.name}' reopened successfully",
            "period": serializer.data,
            "reactivated_ledgers": period.ledgers.filter(is_capacity_reserve=False, is_active=True).count(),
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['get'], url_path='summary')
    def summary(self, request, pk=None):
        period = self.get_object()
        transactions = Transaction.objects.filter(
            created_by=request.user,
            allocations__ledger__period=period,
        ).distinct()
        overflows = Overflow.objects.filter(
            transaction__created_by=request.user,
            transaction__allocations__ledger__period=period,
        ).distinct()
        total_transaction_amount = transactions.aggregate(
            total=Sum('total_amount')
        )['total'] or Decimal('0.00')
        total_allocated_amount = LedgerAllocation.objects.filter(
            transaction__created_by=request.user,
            ledger__period=period
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
        total_pending_overflow_amount = overflows.filter(status='TCSO').aggregate(
            total=Sum('excess_amount')
        )['total'] or Decimal('0.00')
        total_approved_overflow_amount = overflows.filter(status='CSO').aggregate(
            total=Sum('excess_amount')
        )['total'] or Decimal('0.00')

        ticket_count = Ticket.objects.filter(
            created_by=request.user,
            transactions__allocations__ledger__period=period
        ).distinct().count()

        summary = {
            'period_id': period.id,
            'period_name': period.name,
            'is_open': period.is_open,
            'ledger_count': period.ledgers.filter(owner=request.user, is_capacity_reserve=False).count(),
            'active_ledger_count': period.ledgers.filter(owner=request.user, is_active=True, is_capacity_reserve=False).count(),
            'closed_ledger_count': period.ledgers.filter(owner=request.user, is_active=False, is_capacity_reserve=False).count(),
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
                transactions__created_by=request.user,
                transactions__allocations__ledger__period=period
            ).distinct().count(),
        }

        return Response(summary)


class LedgerViewSet(viewsets.ModelViewSet):
    queryset = Ledger.objects.all()
    serializer_class = LedgerSerializer
    permission_classes = [IsAuthenticated]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        period = serializer.validated_data.get('period')
        if ticket_creation_locked_for_period(period):
            return Response(
                {"detail": "Ledger creation is locked after the lucky draw is announced for this period."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def perform_create(self, serializer):
        ledger = serializer.save(owner=self.request.user)
        notify_ledger_change(
            ledger=ledger,
            action_label='created',
            message=f"{ledger.name} has been created for {ledger.period.name if ledger.period else 'the current period'}.",
            request_user=self.request.user,
        )
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
        notify_ledger_change(
            ledger=ledger,
            action_label='updated',
            message=f"{ledger.name} has been updated.",
            request_user=self.request.user,
        )
        record_audit_log(
            self.request,
            'ledger.updated',
            target=ledger,
            details=f"Updated ledger '{ledger.name}'",
            changes={'before': before, 'after': snapshot_instance(ledger)},
        )

    def perform_destroy(self, instance):
        try:
            instance.can_delete()
        except ValidationError as exc:
            detail = exc.message_dict if hasattr(exc, 'message_dict') else exc.messages[0]
            raise DRFValidationError(detail)

        before = snapshot_instance(instance)
        ledger_name = instance.name
        notify_ledger_change(
            ledger=instance,
            action_label='deleted',
            message=f"{ledger_name} has been deleted.",
            request_user=self.request.user,
        )
        super().perform_destroy(instance)
        record_audit_log(
            self.request,
            'ledger.deleted',
            details=f"Deleted ledger '{ledger_name}'",
            changes={'before': before},
        )

    def get_queryset(self):
        period_id = self.request.query_params.get('period_id')
        if period_id:
            try:
                period = Period.objects.get(id=period_id)
            except (Period.DoesNotExist, ValueError, TypeError):
                period = None
        else:
            period = Period.get_open_period()

        if period is not None and self.request.user.is_authenticated:
            Ledger.get_capacity_reserve(period, self.request.user, create=True)

        queryset = super().get_queryset()
        queryset = queryset.filter(owner=self.request.user)
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

        try:
            ledger.can_modify()
        except ValidationError as exc:
            detail = exc.message_dict if hasattr(exc, 'message_dict') else exc.messages[0]
            return Response({"detail": detail}, status=status.HTTP_400_BAD_REQUEST)

        ledger.close()
        notify_ledger_change(
            ledger=ledger,
            action_label='closed',
            message=f"{ledger.name} has been closed.",
            request_user=request.user,
        )
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

    @action(detail=True, methods=['post'], url_path='reopen')
    def reopen_ledger(self, request, pk=None):
        """
        POST /api/ledgers/{id}/reopen/

        Reopen a closed ledger while its period is still active.
        """
        ledger = self.get_object()

        if ledger.is_active:
            return Response(
                {"detail": "Ledger is already active"},
                status=status.HTTP_400_BAD_REQUEST
            )
        if period_locked_after_lucky_draw(ledger.period):
            return Response(
                {"detail": "Ledger reopen is locked after the lucky draw is announced for this period."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        end_date_value = request.data.get('end_date')
        close_time_value = request.data.get('close_time')
        if not end_date_value or not close_time_value:
            return Response(
                {"detail": "End date and close time are required to reopen a ledger."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            parsed_close_time = LedgerSerializer().fields['close_time'].to_internal_value(close_time_value)
            if getattr(parsed_close_time, 'tzinfo', None) is not None:
                parsed_close_time = parsed_close_time.replace(tzinfo=None)
            parsed_end_date = FlexibleDateTimeField(
                default_time=lambda _field: parsed_close_time
            ).to_internal_value(end_date_value)
        except Exception:
            return Response(
                {"detail": "Enter a valid end date and close time."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ledger.end_date = parsed_end_date

        try:
            ledger.reopen(save=False)
            ledger.save(update_fields=['is_active', 'closed_at', 'end_date'])
        except ValidationError as exc:
            detail = exc.message_dict if hasattr(exc, 'message_dict') else exc.messages[0]
            return Response({"detail": detail}, status=status.HTTP_400_BAD_REQUEST)

        notify_ledger_change(
            ledger=ledger,
            action_label='reopened',
            message=f"{ledger.name} has been reopened.",
            request_user=request.user,
        )
        record_audit_log(
            request,
            'ledger.reopened',
            target=ledger,
            details=f"Reopened ledger '{ledger.name}'",
            changes={'after': snapshot_instance(ledger)},
        )

        serializer = self.get_serializer(ledger)
        return Response({
            "message": f"Ledger '{ledger.name}' reopened successfully",
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
                    ledger = Ledger.objects.get(id=ledger_id)
                    ledger.can_modify()
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
                except ValidationError as exc:
                    detail = exc.message_dict if hasattr(exc, 'message_dict') else exc.messages[0]
                    return Response({"detail": detail}, status=status.HTTP_400_BAD_REQUEST)
        
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

    @action(detail=True, methods=['get'], url_path='view')
    def view_ledger(self, request, pk=None):
        ledger = self.get_object()
        identifiers = list(Identifier.objects.all().order_by('number'))
        period_standard_ledgers = Ledger.objects.filter(
            period=ledger.period,
            owner=ledger.owner,
            is_capacity_reserve=False,
        )
        if ledger.is_active:
            period_standard_ledgers = period_standard_ledgers.filter(is_active=True)
        freeze_rows = list(
            IdentifierLedgerFreeze.objects.filter(
                period=ledger.period,
                owner=ledger.owner,
            ).values('identifier_id', 'ledger_id', 'applies_to_all')
        )
        active_ledger_ids = list(
            period_standard_ledgers.values_list('id', flat=True)
        )
        active_ledger_capacities = {
            item['id']: item['limit_per_identifier']
            for item in period_standard_ledgers.values('id', 'limit_per_identifier')
        }
        allocation_queryset = LedgerAllocation.objects.filter(
            ledger__period=ledger.period,
            ledger__owner=ledger.owner,
            ledger__is_capacity_reserve=ledger.is_capacity_reserve,
        )
        if ledger.is_active:
            allocation_queryset = allocation_queryset.filter(ledger__is_active=True)
        allocations = list(
            allocation_queryset
            .select_related('transaction__identifier', 'transaction__ticket')
            .order_by('ledger_id', 'transaction__timestamp', 'id')
        )
        reserve_grants_by_identifier = {}
        if ledger.is_capacity_reserve:
            reserve_grants_by_identifier = {
                row['identifier_id']: row['total'] or Decimal('0.00')
                for row in IdentifierCapacityAdjustment.objects.filter(
                    owner=ledger.owner,
                    period=ledger.period,
                )
                .values('identifier_id')
                .annotate(total=Sum('amount'))
            }

        allocations_by_identifier = {}
        ledger_usage_by_identifier = {}
        freezes_by_identifier = {}
        total_allocated = Decimal('0.00')
        used_identifier_ids = set()

        for row in freeze_rows:
            identifier_freezes = freezes_by_identifier.setdefault(
                row['identifier_id'],
                {'all_ledgers': False, 'ledger_ids': set()},
            )
            if row['applies_to_all']:
                identifier_freezes['all_ledgers'] = True
            elif row['ledger_id']:
                identifier_freezes['ledger_ids'].add(row['ledger_id'])

        for allocation in allocations:
            identifier_id = allocation.transaction.identifier_id
            ledger_id = allocation.ledger_id
            amount = allocation.amount or Decimal('0.00')
            ledger_usage = ledger_usage_by_identifier.setdefault(identifier_id, {})
            ledger_usage[ledger_id] = ledger_usage.get(ledger_id, Decimal('0.00')) + amount

            if ledger_id == ledger.id:
                used_identifier_ids.add(identifier_id)
                total_allocated += amount
                allocations_by_identifier.setdefault(identifier_id, []).append(
                    {
                        'allocation_id': allocation.id,
                        'amount': str(amount),
                        'display_amount': str(int(amount)) if amount == amount.to_integral_value() else f"{amount}",
                        'order_number': allocation.transaction.order_number,
                        'ticket_number': allocation.transaction.ticket.ticket_number if allocation.transaction.ticket else None,
                        'transaction_id': allocation.transaction.id,
                        'created_at': allocation.transaction.timestamp,
                    }
                )

        identifier_rows = []
        capacity_per_identifier = ledger.limit_per_identifier or Decimal('0.00')
        for identifier in identifiers:
            recordings = allocations_by_identifier.get(identifier.id, [])
            freeze_state = freezes_by_identifier.get(
                identifier.id,
                {'all_ledgers': False, 'ledger_ids': set()},
            )
            allocated_amount = sum(
                (Decimal(item['amount']) for item in recordings),
                Decimal('0.00'),
            )
            row_capacity = reserve_grants_by_identifier.get(identifier.id, capacity_per_identifier)
            remaining_amount = row_capacity - allocated_amount
            if remaining_amount < Decimal('0.00'):
                remaining_amount = Decimal('0.00')

            recording_display = '------'
            if recordings:
                recording_display = '.'.join(item['display_amount'] for item in recordings) + '.------'

            full_ledger_ids = sorted(
                ledger_id
                for ledger_id in active_ledger_ids
                if ledger_usage_by_identifier.get(identifier.id, {}).get(ledger_id, Decimal('0.00'))
                >= Decimal(str(active_ledger_capacities.get(ledger_id, Decimal('0.00'))))
            )

            identifier_rows.append(
                {
                    'identifier_id': identifier.id,
                    'number': identifier.number,
                    'recording_display': recording_display,
                    'recordings': recordings,
                    'total_capacity': str(row_capacity),
                    'allocated_amount': str(allocated_amount),
                    'remaining_capacity': str(remaining_amount),
                    'is_full': remaining_amount <= Decimal('0.00'),
                    'is_frozen': freeze_state['all_ledgers'] or ledger.id in freeze_state['ledger_ids'],
                    'frozen_all_ledgers': freeze_state['all_ledgers'],
                    'frozen_ledger_ids': sorted(freeze_state['ledger_ids']),
                    'full_ledger_ids': full_ledger_ids,
                }
            )

        identifier_count = len(identifiers)
        if ledger.is_capacity_reserve:
            total_capacity = sum(reserve_grants_by_identifier.values(), Decimal('0.00'))
        else:
            total_capacity = capacity_per_identifier * identifier_count
        remaining_capacity = total_capacity - total_allocated
        if remaining_capacity < Decimal('0.00'):
            remaining_capacity = Decimal('0.00')

        return Response(
            {
                'ledger': self.get_serializer(ledger).data,
                'summary': {
                    'identifier_count': identifier_count,
                    'used_identifier_count': len(used_identifier_ids),
                    'capacity_per_identifier': str(capacity_per_identifier),
                    'total_capacity': str(total_capacity),
                    'allocated_total': str(total_allocated),
                    'remaining_capacity': str(remaining_capacity),
                },
                'identifiers': identifier_rows,
            },
            status=status.HTTP_200_OK,
        )


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

    def get_permissions(self):
        if self.action in {'freeze', 'unfreeze'}:
            return [IsAuthenticated()]
        return [permission() for permission in self.permission_classes]

    @action(detail=False, methods=['get'], url_path='options')
    def options(self, request):
        identifiers = list(
            self.get_queryset()
            .order_by('number')
            .values('id', 'number')
        )
        return Response(identifiers, status=status.HTTP_200_OK)

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

    @action(detail=True, methods=['post'], url_path='freeze')
    def freeze(self, request, pk=None):
        identifier = self.get_object()
        period = Period.get_open_period()
        if not period:
            return Response({"detail": "No open period available."}, status=status.HTTP_400_BAD_REQUEST)

        scope = (request.data.get('scope') or '').strip().lower()
        if scope not in {'all', 'ledger'}:
            return Response({"detail": "scope must be 'all' or 'ledger'."}, status=status.HTTP_400_BAD_REQUEST)

        if scope == 'all':
            IdentifierLedgerFreeze.objects.filter(
                identifier=identifier,
                period=period,
                owner=request.user,
            ).delete()
            freeze, created = IdentifierLedgerFreeze.objects.get_or_create(
                identifier=identifier,
                period=period,
                owner=request.user,
                applies_to_all=True,
                defaults={'ledger': None},
            )
            record_audit_log(
                request,
                'identifier.freeze_all',
                target=identifier,
                details=f"Froze identifier '{identifier.number}' across all ledgers",
                changes={'identifier_number': identifier.number, 'period': period.name, 'created': created},
            )
            notify_identifier_freeze_change(
                recipient=request.user,
                identifier=identifier,
                period=period,
                action_label='frozen',
                message=f"Identifier {identifier.number} was frozen across all active ledgers in {period.name}.",
                request_user=request.user,
                source_key=f'identifier:freeze:all:{period.id}:{request.user.id}:{identifier.id}:{timezone.now().isoformat()}',
            )
            return Response(
                {
                    'message': f"Identifier '{identifier.number}' frozen across all ledgers.",
                    'identifier_number': identifier.number,
                    'scope': 'all',
                },
                status=status.HTTP_200_OK,
            )

        ledger_id = request.data.get('ledger_id')
        try:
            ledger = Ledger.objects.get(
                pk=ledger_id,
                owner=request.user,
                period=period,
                is_active=True,
                is_capacity_reserve=False,
            )
        except (Ledger.DoesNotExist, TypeError, ValueError):
            return Response({"detail": "Choose a valid active ledger."}, status=status.HTTP_400_BAD_REQUEST)

        freeze, created = IdentifierLedgerFreeze.objects.get_or_create(
            identifier=identifier,
            period=period,
            owner=request.user,
            ledger=ledger,
            applies_to_all=False,
        )
        record_audit_log(
            request,
            'identifier.freeze_ledger',
            target=identifier,
            details=f"Froze identifier '{identifier.number}' in ledger '{ledger.name}'",
            changes={
                'identifier_number': identifier.number,
                'ledger_name': ledger.name,
                'period': period.name,
                'created': created,
            },
        )
        notify_identifier_freeze_change(
            recipient=request.user,
            identifier=identifier,
            period=period,
            action_label='frozen',
            message=f"Identifier {identifier.number} was frozen in ledger {ledger.name}.",
            request_user=request.user,
            source_key=f'identifier:freeze:ledger:{period.id}:{request.user.id}:{identifier.id}:{ledger.id}:{timezone.now().isoformat()}',
        )
        return Response(
            {
                'message': f"Identifier '{identifier.number}' frozen in ledger '{ledger.name}'.",
                'identifier_number': identifier.number,
                'scope': 'ledger',
                'ledger_id': ledger.id,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=['post'], url_path='unfreeze')
    def unfreeze(self, request, pk=None):
        identifier = self.get_object()
        period = Period.get_open_period()
        if not period:
            return Response({"detail": "No open period available."}, status=status.HTTP_400_BAD_REQUEST)

        scope = (request.data.get('scope') or '').strip().lower()
        if scope not in {'all', 'ledger'}:
            return Response({"detail": "scope must be 'all' or 'ledger'."}, status=status.HTTP_400_BAD_REQUEST)

        if scope == 'all':
            deleted, _ = IdentifierLedgerFreeze.objects.filter(
                identifier=identifier,
                period=period,
                owner=request.user,
            ).delete()
            record_audit_log(
                request,
                'identifier.unfreeze_all',
                target=identifier,
                details=f"Removed all-ledger freeze for identifier '{identifier.number}'",
                changes={'identifier_number': identifier.number, 'period': period.name, 'deleted': deleted},
            )
            notify_identifier_freeze_change(
                recipient=request.user,
                identifier=identifier,
                period=period,
                action_label='unfrozen',
                message=f"Identifier {identifier.number} was unfrozen across all active ledgers in {period.name}.",
                request_user=request.user,
                source_key=f'identifier:unfreeze:all:{period.id}:{request.user.id}:{identifier.id}:{timezone.now().isoformat()}',
            )
            return Response(
                {
                    'message': f"Identifier '{identifier.number}' unfrozen across all ledgers.",
                    'identifier_number': identifier.number,
                    'scope': 'all',
                },
                status=status.HTTP_200_OK,
            )

        ledger_id = request.data.get('ledger_id')
        try:
            ledger_id = int(ledger_id)
        except (TypeError, ValueError):
            return Response({"detail": "Choose a valid ledger_id."}, status=status.HTTP_400_BAD_REQUEST)

        deleted, _ = IdentifierLedgerFreeze.objects.filter(
            identifier=identifier,
            period=period,
            owner=request.user,
            ledger_id=ledger_id,
            applies_to_all=False,
        ).delete()
        record_audit_log(
            request,
            'identifier.unfreeze_ledger',
            target=identifier,
            details=f"Removed ledger freeze for identifier '{identifier.number}'",
            changes={'identifier_number': identifier.number, 'ledger_id': ledger_id, 'period': period.name, 'deleted': deleted},
        )
        ledger = Ledger.objects.filter(pk=ledger_id, owner=request.user, period=period).only('name').first()
        ledger_name = ledger.name if ledger else f'#{ledger_id}'
        notify_identifier_freeze_change(
            recipient=request.user,
            identifier=identifier,
            period=period,
            action_label='unfrozen',
            message=f"Identifier {identifier.number} was unfrozen in ledger {ledger_name}.",
            request_user=request.user,
            source_key=f'identifier:unfreeze:ledger:{period.id}:{request.user.id}:{identifier.id}:{ledger_id}:{timezone.now().isoformat()}',
        )
        return Response(
            {
                'message': f"Identifier '{identifier.number}' unfrozen for that ledger.",
                'identifier_number': identifier.number,
                'scope': 'ledger',
                'ledger_id': ledger_id,
            },
            status=status.HTTP_200_OK,
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
        queryset = super().get_queryset().filter(created_by=self.request.user)
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
        if ticket_creation_locked_for_period(open_period):
            return Response(
                {"detail": "Ticket creation is locked after the lucky draw is announced."},
                status=status.HTTP_400_BAD_REQUEST
            )

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        identifier = serializer.validated_data['identifier']
        identifier._allocation_owner = request.user
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
        if ticket_creation_locked_for_period(open_period):
            return Response(
                {"detail": "Ticket creation is locked after the lucky draw is announced."},
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
        identifier._allocation_owner = request.user
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
        queryset = super().get_queryset().filter(owner=self.request.user)
        return apply_ledger_period_filters(
            queryset,
            self.request.query_params,
            ledger_prefix='transaction__allocations__ledger__'
        )

    def _overflow_limit(self):
        raw_limit = self.request.query_params.get('limit')
        if raw_limit in {None, ''}:
            return None
        try:
            return max(1, min(int(raw_limit), 20))
        except (TypeError, ValueError):
            return 20

    def _overflow_page(self):
        raw_page = self.request.query_params.get('page')
        if raw_page in {None, ''}:
            return None
        try:
            return max(1, int(raw_page))
        except (TypeError, ValueError):
            return 1

    def _overflow_page_size(self):
        raw_page_size = self.request.query_params.get('page_size')
        if raw_page_size in {None, ''}:
            return 20
        try:
            return max(1, min(int(raw_page_size), 20))
        except (TypeError, ValueError):
            return 20

    def _apply_overflow_limit(self, queryset):
        limit = self._overflow_limit()
        if limit is None:
            return queryset
        return queryset[:limit]

    def _overflow_page_response(self, queryset):
        page = self._overflow_page()
        if page is None:
            serializer = self.get_serializer(self._apply_overflow_limit(queryset), many=True)
            return Response(serializer.data)

        page_size = self._overflow_page_size()
        total_count = queryset.count()
        total_amount = queryset.aggregate(
            total=Coalesce(
                Sum(Coalesce('amount_to_approve', 'excess_amount')),
                Value(Decimal('0.00')),
                output_field=DecimalField(max_digits=14, decimal_places=2),
            )
        )['total']
        total_pages = max(1, (total_count + page_size - 1) // page_size)
        safe_page = min(page, total_pages)
        start = (safe_page - 1) * page_size
        end = start + page_size
        serializer = self.get_serializer(queryset[start:end], many=True)
        return Response(
            {
                'results': serializer.data,
                'count': total_count,
                'page': safe_page,
                'page_size': page_size,
                'total_pages': total_pages,
                'summary': {
                    'count': total_count,
                    'total_amount': total_amount,
                },
            }
        )

    def _selected_period(self, request):
        period_id = request.query_params.get('period_id')
        if not period_id:
            return None
        try:
            return Period.objects.get(id=period_id)
        except (Period.DoesNotExist, ValueError):
            return None

    def _filter_overflow_period(self, queryset, request):
        selected_period = self._selected_period(request)
        if selected_period is not None:
            return queryset.filter(period=selected_period)
        return queryset

    def _filter_overflow_search(self, queryset, request):
        search = (request.query_params.get('search') or '').strip()
        ticket_number = (request.query_params.get('ticket_number') or '').strip()
        customer_name = (request.query_params.get('customer_name') or '').strip()
        identifier_number = (request.query_params.get('identifier_number') or '').strip()
        collaborator_name = (request.query_params.get('collaborator_name') or '').strip()

        if search:
            queryset = queryset.filter(
                Q(identifier__number__icontains=search)
                | Q(transaction__ticket__ticket_number__icontains=search)
                | Q(transaction__ticket__customer_name__icontains=search)
                | Q(transaction__order_number__icontains=search)
                | Q(collaborators__full_name__icontains=search)
                | Q(collaborators__username__icontains=search)
            ).distinct()
        if ticket_number:
            queryset = queryset.filter(transaction__ticket__ticket_number__icontains=ticket_number)
        if customer_name:
            queryset = queryset.filter(transaction__ticket__customer_name__icontains=customer_name)
        if identifier_number:
            queryset = queryset.filter(identifier__number__icontains=identifier_number)
        if collaborator_name:
            queryset = queryset.filter(
                Q(collaborators__full_name__icontains=collaborator_name)
                | Q(collaborators__username__icontains=collaborator_name)
            ).distinct()

        return queryset

    @action(detail=False, methods=['get'], url_path='pending')
    def pending_overflows(self, request):
        """GET /api/overflows/pending/ - Get all TCSO (red) overflows"""
        pending = Overflow.objects.filter(status='TCSO').select_related(
            'transaction__identifier',
            'transaction__ticket'
        ).filter(
            owner=request.user
        ).order_by('-transaction__timestamp')
        pending = self._filter_overflow_period(pending, request)
        pending = self._filter_overflow_search(pending, request)
        return self._overflow_page_response(pending)

    @action(detail=False, methods=['get'], url_path='approved')
    def approved_overflows(self, request):
        """GET /api/overflows/approved/ - Get all CSO (green) overflows"""
        approved = Overflow.objects.filter(
            status=Overflow.STATUS_CSO
        ).select_related(
            'transaction__identifier',
            'transaction__ticket',
            'identifier',
        ).filter(
            owner=request.user
        ).order_by('-approved_at')
        approved = self._filter_overflow_period(approved, request)
        approved = self._filter_overflow_search(approved, request)
        return self._overflow_page_response(approved)

    @action(detail=False, methods=['get', 'post'], url_path='overkill')
    def overkill_overflows(self, request):
        if request.method.lower() == 'get':
            overkill = Overflow.objects.filter(
                status=Overflow.STATUS_OVERKILL
            ).select_related(
                'transaction__identifier',
                'transaction__ticket',
                'identifier',
            ).filter(
                owner=request.user
            ).order_by('-approved_at')
            overkill = self._filter_overflow_period(overkill, request)
            overkill = self._filter_overflow_search(overkill, request)
            return self._overflow_page_response(overkill)

        period = Period.get_open_period()
        if not period:
            return Response({"detail": "No open period available."}, status=status.HTTP_400_BAD_REQUEST)
        if ticket_creation_locked_for_period(period):
            return Response(
                {"detail": "Ticket creation is locked after the lucky draw is announced."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        identifier_id = request.data.get('identifier')
        amount_str = request.data.get('amount')
        collaborator_ids = request.data.get('collaborator_ids', [])

        try:
            identifier = Identifier.objects.get(pk=identifier_id)
        except (Identifier.DoesNotExist, TypeError, ValueError):
            return Response({"detail": "Choose a valid identifier."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            collaborators = resolve_collaborators_for_approval(request, collaborator_ids)
        except ValidationError as exc:
            detail = exc.messages[0] if getattr(exc, 'messages', None) else str(exc)
            return Response({"detail": detail}, status=status.HTTP_400_BAD_REQUEST)

        try:
            amount = Decimal(str(amount_str))
            if amount <= 0:
                raise InvalidOperation
        except (InvalidOperation, ValueError, TypeError):
            return Response({"detail": "Invalid overkill amount."}, status=status.HTTP_400_BAD_REQUEST)

        helper_name = ", ".join(
            filter(None, [collaborator.full_name.strip() or collaborator.username for collaborator in collaborators])
        )

        with db_transaction.atomic():
            overkill = Overflow.objects.create(
                transaction=None,
                identifier=identifier,
                owner=request.user,
                period=period,
                excess_amount=amount,
                status=Overflow.STATUS_OVERKILL,
                amount_to_approve=amount,
                approved_at=timezone.now(),
                helper_name=helper_name,
                resolution_type=Overflow.RESOLUTION_APPROVE,
            )
            overkill.collaborators.set(collaborators)
            IdentifierCapacityAdjustment.objects.create(
                identifier=identifier,
                period=period,
                owner=request.user,
                overflow=overkill,
                amount=amount,
                adjustment_type=IdentifierCapacityAdjustment.TYPE_APPROVAL_EXTRA,
                helper_name=helper_name,
            )
            Ledger.get_capacity_reserve(period, request.user, create=True)

        record_audit_log(
            request,
            'overflow.overkill_created',
            target=overkill,
            details=f"Created detached overkill for identifier '{identifier.number}'",
            changes={
                'identifier_number': identifier.number,
                'amount': str(amount),
                'period': period.name,
                'collaborator_ids': [collaborator.id for collaborator in collaborators],
            },
        )
        return Response(
            {
                'message': f"Overkill created for identifier '{identifier.number}'.",
                'overflow': self.get_serializer(overkill).data,
            },
            status=status.HTTP_201_CREATED,
        )

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
            detail = exc.messages[0] if getattr(exc, 'messages', None) else str(exc)
            return Response({"detail": detail}, status=status.HTTP_400_BAD_REQUEST)

        if amount_str:
            try:
                amount = Decimal(str(amount_str))
                if amount <= 0:
                    return Response(
                        {"detail": "Invalid approval amount"},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                requested_amount = amount
            except (InvalidOperation, ValueError):
                return Response(
                    {"detail": "Invalid amount format"},
                    status=status.HTTP_400_BAD_REQUEST
                )
        else:
            requested_amount = overflow.excess_amount

        helper_name = ", ".join(
            filter(None, [collaborator.full_name.strip() or collaborator.username for collaborator in collaborators])
        )
        approved_amount = min(requested_amount, overflow.excess_amount)
        extra_amount = requested_amount - overflow.excess_amount
        target_period = overflow.period
        if extra_amount > 0 and (not target_period or not target_period.is_open):
            return Response(
                {"detail": "Extra approved capacity can only be granted to an open period."},
                status=status.HTTP_400_BAD_REQUEST
            )

        with db_transaction.atomic():
            overflow.amount_to_approve = approved_amount
            overflow.status = Overflow.STATUS_CSO
            overflow.approved_at = timezone.now()
            overflow.refunded_at = None
            overflow.refund_amount = None
            overflow.helper_name = helper_name
            overflow.resolution_type = Overflow.RESOLUTION_APPROVE
            overflow.save()
            overflow.collaborators.set(collaborators)

            overkill_overflow = None
            if extra_amount > 0:
                overkill_overflow = Overflow.objects.create(
                    transaction=None,
                    identifier=overflow.transaction.identifier,
                    owner=overflow.transaction.created_by,
                    period=target_period,
                    excess_amount=extra_amount,
                    status=Overflow.STATUS_OVERKILL,
                    amount_to_approve=extra_amount,
                    approved_at=overflow.approved_at,
                    helper_name=helper_name,
                    resolution_type=Overflow.RESOLUTION_APPROVE,
                )
                adjustment = IdentifierCapacityAdjustment.objects.create(
                    identifier=overflow.transaction.identifier,
                    period=target_period,
                    owner=overflow.transaction.created_by,
                    overflow=overkill_overflow,
                    amount=extra_amount,
                    adjustment_type=IdentifierCapacityAdjustment.TYPE_APPROVAL_EXTRA,
                    helper_name=helper_name,
                )
                if adjustment:
                    Ledger.get_capacity_reserve(target_period, overflow.transaction.created_by, create=True)
                overkill_overflow.collaborators.set(collaborators)
                _retry_pending_overflows(target_period, overflow.transaction.identifier)
        record_audit_log(
            request,
            'overflow.approved',
            target=overflow,
            details=f"Approved overflow for transaction '{overflow.transaction.order_number}'",
            changes={
                'status': overflow.status,
                'amount_to_approve': str(overflow.amount_to_approve),
                'extra_approved_amount': str(max(extra_amount, Decimal('0.00'))),
                'overkill_overflow_id': overkill_overflow.id if overkill_overflow else None,
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
            if period_locked_after_lucky_draw(overflow.period):
                return Response(
                    {"detail": "Refunds are locked after the lucky draw is announced for this period."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if not is_admin_user(request.user) and override_profile is None:
                return Response(
                    {"detail": "Admin override code is required for refund actions."},
                    status=status.HTTP_403_FORBIDDEN,
                )

        if action_name == 'refund_overflow_only':
            refund_amount = overflow.amount_to_approve or overflow.excess_amount or Decimal('0.00')
            overflow_id = overflow.id
            overflow_status = overflow.status
            overflow_ticket_number = (
                overflow.transaction.ticket.ticket_number
                if overflow.transaction_id and overflow.transaction.ticket_id
                else ''
            )
            overflow_transaction_id = overflow.transaction.id if overflow.transaction_id else None
            overflow_order_number = overflow.transaction.order_number if overflow.transaction_id else ''
            overflow_identifier_number = (
                overflow.identifier.number if overflow.identifier_id else ''
            )
            with db_transaction.atomic():
                resolved_overflow = refund_overflow(
                    overflow,
                    helper_name=helper_name,
                    resolution_type=Overflow.RESOLUTION_REFUND_OVERFLOW,
                )
            serializer_data = self.get_serializer(resolved_overflow).data if resolved_overflow is not None else None
            record_audit_log(
                request,
                'overflow.refunded',
                target=overflow,
                details=(
                    f"Refunded overflow for transaction '{overflow_order_number}'"
                    if overflow_order_number
                    else f"Refunded overflow for identifier '{overflow_identifier_number}'"
                ),
                changes={
                    'resolution_type': Overflow.RESOLUTION_REFUND_OVERFLOW,
                    'ticket_number': overflow_ticket_number,
                    'transaction_id': overflow_transaction_id,
                    'order_number': overflow_order_number,
                    'identifier_number': overflow_identifier_number,
                    'refund_amount': str(refund_amount),
                    'status': resolved_overflow.status if resolved_overflow is not None else overflow_status,
                    'overflow_id': overflow_id,
                },
            )
            if overflow.owner_id:
                notify_refund_change(
                    recipient=overflow.owner,
                    title='Spill over refunded',
                    message=(
                        f"Spill over for identifier {overflow_identifier_number} on ticket {overflow_ticket_number or '-'} was refunded."
                    ),
                    request_user=request.user,
                    action_href='/spill-over',
                    source_key=f'refund:overflow:{overflow_id}:{timezone.now().isoformat()}',
                    period=overflow.period,
                )
            return Response({
                "message": "Overflow refunded successfully",
                "overflow": serializer_data,
            }, status=status.HTTP_200_OK)

        if action_name == 'refund_transaction':
            refund_amount = overflow.transaction.total_amount
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
                changes={
                    'resolution_type': Overflow.RESOLUTION_REFUND_TRANSACTION,
                    'ticket_number': overflow.transaction.ticket.ticket_number if overflow.transaction.ticket_id else '',
                    'transaction_id': overflow.transaction.id,
                    'order_number': overflow.transaction.order_number,
                    'identifier_number': overflow.transaction.identifier.number,
                    'refund_amount': str(refund_amount),
                },
            )
            notify_refund_change(
                recipient=overflow.transaction.created_by,
                title='Transaction refunded',
                message=f"Transaction {overflow.transaction.order_number} on ticket {overflow.transaction.ticket.ticket_number if overflow.transaction.ticket_id else '-'} was refunded.",
                request_user=request.user,
                action_href='/tickets',
                source_key=f'refund:transaction:{overflow.transaction.id}:{timezone.now().isoformat()}',
                period=overflow.period,
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
            ticket = overflow.transaction.ticket
            refund_summary = _ticket_refund_summary(ticket)

            with db_transaction.atomic():
                refund_transactions(
                    list(ticket.transactions.all()),
                    helper_name=helper_name,
                    resolution_type=Overflow.RESOLUTION_REFUND_TICKET,
                )
            record_audit_log(
                request,
                'ticket.refunded',
                target=ticket,
                details=f"Refunded ticket '{ticket.ticket_number}'",
                changes={
                    'resolution_type': Overflow.RESOLUTION_REFUND_TICKET,
                    **refund_summary,
                },
            )
            notify_refund_change(
                recipient=ticket.created_by,
                title='Ticket refunded',
                message=f"Ticket {ticket.ticket_number} was refunded.",
                request_user=request.user,
                action_href='/tickets',
                source_key=f'refund:ticket:{ticket.id}:{timezone.now().isoformat()}',
                period=ticket.transactions.first().allocations.first().ledger.period if ticket.transactions.exists() and ticket.transactions.first().allocations.exists() else None,
            )
            return Response({
                "message": f"Ticket '{ticket.ticket_number}' refunded successfully",
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


class UserNotificationViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = UserNotification.objects.select_related('created_by', 'period', 'recipient')
    serializer_class = UserNotificationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = super().get_queryset().filter(recipient=self.request.user)
        category = (self.request.query_params.get('category') or '').strip().upper()
        unread_only = (self.request.query_params.get('unread_only') or '').strip().lower()
        limit = self.request.query_params.get('limit')

        if category:
            queryset = queryset.filter(category=category)
        if unread_only in {'1', 'true', 'yes'}:
            queryset = queryset.filter(read_at__isnull=True)
        if limit:
            try:
                queryset = queryset[: max(1, int(limit))]
            except ValueError:
                pass
        return queryset

    @action(detail=False, methods=['get'], url_path='summary')
    def summary(self, request):
        queryset = super().get_queryset().filter(recipient=request.user)
        recent = queryset[:4]
        unread_count = queryset.filter(read_at__isnull=True).count()
        return Response({
            'unread_count': unread_count,
            'recent': UserNotificationSerializer(recent, many=True).data,
        }, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'], url_path='mark-all-read')
    def mark_all_read(self, request):
        updated = self.get_queryset().filter(read_at__isnull=True).update(read_at=timezone.now())
        return Response({'message': 'Notifications marked as read.', 'updated_count': updated}, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='mark-read')
    def mark_read(self, request, pk=None):
        notification = self.get_object()
        notification.mark_read()
        return Response(UserNotificationSerializer(notification).data, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'], url_path='broadcast', permission_classes=[IsAdminRole])
    def broadcast(self, request):
        serializer = NotificationBroadcastSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        created_count = broadcast_user_notification(
            title=serializer.validated_data['title'],
            message=serializer.validated_data['message'],
            category=UserNotification.CATEGORY_ANNOUNCEMENT,
            level=serializer.validated_data['level'],
            action_href=serializer.validated_data.get('action_href', ''),
            created_by=request.user,
        )
        record_audit_log(
            request,
            'notifications.broadcasted',
            details=f"Broadcasted notification '{serializer.validated_data['title']}'",
            changes={'recipient_count': created_count},
        )
        return Response(
            {'message': 'Notification sent to all users.', 'recipient_count': created_count},
            status=status.HTTP_201_CREATED,
        )


class SupportCaseViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = SupportCase.objects.select_related(
            'created_by',
            'created_by__profile',
            'closed_by',
        ).prefetch_related(
            Prefetch(
                'messages',
                queryset=SupportMessage.objects.select_related('sender', 'sender__profile').order_by('created_at', 'id'),
            )
        ).annotate(
            message_count_annotated=Count('messages', distinct=True),
        )

        if is_admin_user(self.request.user):
            return queryset
        return queryset.filter(created_by=self.request.user)

    def get_serializer_class(self):
        if self.action == 'create':
            return SupportCaseCreateSerializer
        if self.action == 'reply':
            return SupportCaseReplySerializer
        if self.action == 'retrieve':
            return SupportCaseDetailSerializer
        return SupportCaseSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        with db_transaction.atomic():
            support_case = SupportCase.objects.create(
                created_by=request.user,
                subject=serializer.validated_data['subject'],
                last_message_at=timezone.now(),
            )
            SupportMessage.objects.create(
                support_case=support_case,
                sender=request.user,
                body=serializer.validated_data['message'],
            )

        support_case = self.get_queryset().get(pk=support_case.pk)
        if is_admin_user(request.user):
            notify_support_case_participants(
                support_case=support_case,
                actor=request.user,
                title='Customer service case created',
                message=f"A customer service case was opened: {support_case.subject}.",
                include_admins=False,
            )
        else:
            notify_support_case_participants(
                support_case=support_case,
                actor=request.user,
                title='New customer service case',
                message=f"{request.user.get_full_name().strip() or request.user.username} opened a new case: {support_case.subject}.",
                include_admins=True,
            )
        record_audit_log(
            request,
            'support.case_created',
            target=support_case,
            details=f"Created support case '{support_case.subject}'",
            changes={'case_id': support_case.id, 'subject': support_case.subject},
        )
        return Response(SupportCaseSerializer(support_case).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='reply')
    def reply(self, request, pk=None):
        support_case = self.get_object()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        with db_transaction.atomic():
            message = SupportMessage.objects.create(
                support_case=support_case,
                sender=request.user,
                body=serializer.validated_data['message'],
            )
            support_case.last_message_at = message.created_at
            support_case.save(update_fields=['last_message_at', 'updated_at'])

        actor_label = request.user.get_full_name().strip() or request.user.username
        if is_admin_user(request.user):
            notify_support_case_participants(
                support_case=support_case,
                actor=request.user,
                title='Admin replied to your case',
                message=f"{actor_label} replied to your customer service case: {support_case.subject}.",
                include_admins=False,
            )
        else:
            notify_support_case_participants(
                support_case=support_case,
                actor=request.user,
                title='Support case updated',
                message=f"{actor_label} replied to case: {support_case.subject}.",
                include_admins=True,
            )
        record_audit_log(
            request,
            'support.case_replied',
            target=support_case,
            details=f"Replied to support case '{support_case.subject}'",
            changes={'case_id': support_case.id, 'message_id': message.id},
        )
        support_case = self.get_queryset().get(pk=support_case.pk)
        return Response(SupportCaseSerializer(support_case).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='close')
    def close_case(self, request, pk=None):
        support_case = self.get_object()
        if support_case.status == SupportCase.STATUS_CLOSED:
            return Response({'detail': 'Case is already closed.'}, status=status.HTTP_400_BAD_REQUEST)

        support_case.close(closed_by=request.user)
        actor_label = request.user.get_full_name().strip() or request.user.username
        notify_support_case_participants(
            support_case=support_case,
            actor=request.user,
            title='Customer service case closed',
            message=f"{actor_label} closed case: {support_case.subject}.",
            include_admins=not is_admin_user(request.user),
        )
        record_audit_log(
            request,
            'support.case_closed',
            target=support_case,
            details=f"Closed support case '{support_case.subject}'",
            changes={'case_id': support_case.id},
        )
        support_case = self.get_queryset().get(pk=support_case.pk)
        return Response(SupportCaseSerializer(support_case).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='reopen')
    def reopen_case(self, request, pk=None):
        support_case = self.get_object()
        if support_case.status == SupportCase.STATUS_OPEN:
            return Response({'detail': 'Case is already open.'}, status=status.HTTP_400_BAD_REQUEST)

        support_case.reopen()
        actor_label = request.user.get_full_name().strip() or request.user.username
        notify_support_case_participants(
            support_case=support_case,
            actor=request.user,
            title='Customer service case reopened',
            message=f"{actor_label} reopened case: {support_case.subject}.",
            include_admins=not is_admin_user(request.user),
        )
        record_audit_log(
            request,
            'support.case_reopened',
            target=support_case,
            details=f"Reopened support case '{support_case.subject}'",
            changes={'case_id': support_case.id},
        )
        support_case = self.get_queryset().get(pk=support_case.pk)
        return Response(SupportCaseSerializer(support_case).data, status=status.HTTP_200_OK)


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = AuditLog.objects.select_related('user')
    serializer_class = AuditLogSerializer
    permission_classes = [IsAdminRole]

    def get_queryset(self):
        queryset = super().get_queryset()
        action = (self.request.query_params.get('action') or '').strip()
        target_model = (self.request.query_params.get('target_model') or '').strip()
        target_id = self.request.query_params.get('target_id')
        related_ticket_number = (self.request.query_params.get('related_ticket_number') or '').strip()
        user_id = self.request.query_params.get('user_id')
        date_from = parse_period_value(self.request.query_params.get('date_from'))
        date_to = parse_period_value(self.request.query_params.get('date_to'))

        if action:
            queryset = queryset.filter(action=action)
        if target_model:
            queryset = queryset.filter(target_model__iexact=target_model)
        if target_id:
            queryset = queryset.filter(target_id=target_id)
        if related_ticket_number:
            ticket = Ticket.objects.filter(ticket_number=related_ticket_number).prefetch_related(
                'transactions__overflows'
            ).first()
            if ticket is None:
                return queryset.none()

            transaction_ids = list(ticket.transactions.values_list('id', flat=True))
            overflow_ids = list(
                Overflow.objects.filter(transaction__ticket=ticket).values_list('id', flat=True)
            )
            queryset = queryset.filter(
                Q(target_model__iexact='ticket', target_id=ticket.id) |
                Q(target_model__iexact='transaction', target_id__in=transaction_ids) |
                Q(target_model__iexact='overflow', target_id__in=overflow_ids)
            )
        if user_id:
            queryset = queryset.filter(user_id=user_id)
        if date_from:
            queryset = queryset.filter(timestamp__gte=date_from)
        if date_to:
            queryset = queryset.filter(timestamp__lte=date_to)
        return queryset


class CollaboratorViewSet(viewsets.ModelViewSet):
    queryset = Collaborator.objects.all().order_by('username')
    serializer_class = CollaboratorSerializer
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.action in {'create', 'update', 'partial_update'}:
            return CollaboratorManageSerializer
        return CollaboratorSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        if not self.request.user.is_authenticated:
            return queryset.none()
        return queryset.filter(owner=self.request.user)

    def perform_create(self, serializer):
        collaborator = serializer.save()
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
            owner=request.user,
            status__in=[Overflow.STATUS_CSO, Overflow.STATUS_OVERKILL],
        ).select_related(
            'transaction__identifier',
        ).distinct()

        if selected_period:
            overflows = overflows.filter(period=selected_period).distinct()
            period_label = selected_period.name
        else:
            period_label = 'All Periods'

        order_field = 'identifier__number' if sort_by == 'identifier' else 'approved_at'
        if sort_order == 'desc':
            order_field = f'-{order_field}'

        if sort_by == 'identifier':
            overflows = overflows.order_by(order_field, 'approved_at', 'id')
        else:
            overflows = overflows.order_by(order_field, 'identifier__number', 'id')

        return overflows, period_label

    def _get_spillover_export_payload(self, request, collaborator=None):
        period_id = request.query_params.get('period_id')
        if period_id:
            try:
                selected_period = Period.objects.get(id=period_id)
            except Period.DoesNotExist as exc:
                raise Period.DoesNotExist("Period not found.") from exc
        else:
            selected_period = Period.get_open_period()

        overflows = Overflow.objects.filter(
            owner=request.user,
            status__in=[Overflow.STATUS_CSO, Overflow.STATUS_OVERKILL],
        ).select_related('identifier')

        if collaborator is not None:
            overflows = overflows.filter(collaborators=collaborator)
            collaborator_label = collaborator.full_name.strip() or collaborator.username
        else:
            collaborator_label = 'All collaborators'

        if selected_period:
            overflows = overflows.filter(period=selected_period)
            period_label = selected_period.name
        else:
            period_label = 'All Periods'

        identifier_rows = [
            {
                'identifier_number': overflow.identifier.number,
                'amount': overflow.amount_to_approve or overflow.excess_amount or Decimal('0.00'),
            }
            for overflow in overflows.select_related('identifier').order_by('approved_at', 'id')
        ]

        approved_total = overflows.filter(status=Overflow.STATUS_CSO).aggregate(
            total=Coalesce(
                Sum(Coalesce('amount_to_approve', 'excess_amount')),
                Value(Decimal('0.00')),
                output_field=DecimalField(max_digits=14, decimal_places=2),
            )
        )['total']
        overkill_total = overflows.filter(status=Overflow.STATUS_OVERKILL).aggregate(
            total=Coalesce(
                Sum(Coalesce('amount_to_approve', 'excess_amount')),
                Value(Decimal('0.00')),
                output_field=DecimalField(max_digits=14, decimal_places=2),
            )
        )['total']
        total_amount = approved_total + overkill_total

        return {
            'collaborator_label': collaborator_label,
            'period_label': period_label,
            'summary': {
                'identifier_count': len(identifier_rows),
                'approved_total': approved_total,
                'overkill_total': overkill_total,
                'total_amount': total_amount,
            },
            'rows': identifier_rows,
        }

    @action(detail=False, methods=['get'], url_path='spill-over-export')
    def spill_over_export(self, request):
        collaborator_id = request.query_params.get('collaborator_id')
        collaborator = None
        if collaborator_id and collaborator_id != 'all':
            collaborator = self.get_queryset().filter(id=collaborator_id).first()
            if collaborator is None:
                return Response({"detail": "Collaborator not found."}, status=status.HTTP_404_NOT_FOUND)

        try:
            payload = self._get_spillover_export_payload(request, collaborator=collaborator)
        except Period.DoesNotExist as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_404_NOT_FOUND)

        return Response(
            {
                'collaborator_label': payload['collaborator_label'],
                'period_label': payload['period_label'],
                'summary': {
                    'identifier_count': payload['summary']['identifier_count'],
                    'approved_total': str(payload['summary']['approved_total']),
                    'overkill_total': str(payload['summary']['overkill_total']),
                    'total_amount': str(payload['summary']['total_amount']),
                },
                'rows': [
                    {
                        'identifier_number': row['identifier_number'],
                        'amount': str(row['amount']),
                    }
                    for row in payload['rows']
                ],
            }
        )

    @action(detail=False, methods=['get'], url_path='spill-over-export-pdf')
    def spill_over_export_pdf(self, request):
        collaborator_id = request.query_params.get('collaborator_id')
        collaborator = None
        if collaborator_id and collaborator_id != 'all':
            collaborator = self.get_queryset().filter(id=collaborator_id).first()
            if collaborator is None:
                return Response({"detail": "Collaborator not found."}, status=status.HTTP_404_NOT_FOUND)

        try:
            payload = self._get_spillover_export_payload(request, collaborator=collaborator)
        except Period.DoesNotExist as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_404_NOT_FOUND)

        receipt_width = 3.15 * inch
        receipt_height = max(5.0 * inch, (2.6 + len(payload['rows']) * 0.24) * inch)
        response = HttpResponse(content_type='application/pdf')
        response['Content-Disposition'] = 'attachment; filename="spill_over_export.pdf"'

        buffer = BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=(receipt_width, receipt_height),
            topMargin=0.2 * inch,
            bottomMargin=0.2 * inch,
            leftMargin=0.22 * inch,
            rightMargin=0.22 * inch,
        )
        styles = getSampleStyleSheet()
        title_style = ParagraphStyle(
            'SpillOverExportTitle',
            parent=styles['Heading2'],
            fontSize=11,
            alignment=TA_CENTER,
            spaceAfter=8,
        )
        body_style = ParagraphStyle(
            'SpillOverExportBody',
            parent=styles['BodyText'],
            fontSize=8,
            leading=10,
            alignment=TA_LEFT,
        )

        elements = [
            Paragraph("Spill-over export", title_style),
            Paragraph(f"Collaborator name: {payload['collaborator_label']}", body_style),
            Paragraph(f"Period: {payload['period_label']}", body_style),
            Spacer(1, 0.1 * inch),
            Paragraph(f"Number of spill over: {payload['summary']['identifier_count']}", body_style),
            Paragraph(f"Total amount: {payload['summary']['total_amount']:.0f}", body_style),
            Spacer(1, 0.12 * inch),
        ]

        table_rows = [['Identifier', 'Amount']]
        table_rows.extend(
            [[row['identifier_number'], f"{row['amount']:.0f}"] for row in payload['rows']]
        )
        table = Table(table_rows, colWidths=[1.0 * inch, 1.45 * inch])
        table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 8),
            ('LINEBELOW', (0, 0), (-1, 0), 0.75, colors.black),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
            ('TOPPADDING', (0, 0), (-1, -1), 2),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
        ]))
        elements.append(table)

        doc.build(elements)
        pdf = buffer.getvalue()
        buffer.close()
        response.write(pdf)
        return response

    @action(detail=True, methods=['get'], url_path='export-transactions')
    def export_transactions(self, request, pk=None):
        collaborator = self.get_object()
        try:
            overflows, period_label = self._get_export_overflows(collaborator, request)
        except ValidationError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Period.DoesNotExist as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_404_NOT_FOUND)

        collaborator_name = collaborator.full_name.strip() or collaborator.username
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

        collaborator_name = collaborator.full_name.strip() or collaborator.username
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
        transaction_queryset = period_transaction_queryset(period, request.user)
        ticket_queryset = Ticket.objects.filter(created_by=request.user)
        ledger_queryset = Ledger.objects.filter(owner=request.user, is_capacity_reserve=False)
        adjustment_queryset = IdentifierCapacityAdjustment.objects.filter(owner=request.user)
        allocation_queryset = LedgerAllocation.objects.filter(transaction__created_by=request.user)
        overflow_rows = period_overflow_rows(period, user=request.user)

        if period is not None:
            ticket_queryset = ticket_queryset.filter(
                transactions__in=transaction_queryset,
            ).distinct()
            ledger_queryset = ledger_queryset.filter(period=period)
            adjustment_queryset = adjustment_queryset.filter(period=period)
            allocation_queryset = allocation_queryset.filter(ledger__period=period)

        active_standard_ledger_ids = set(
            ledger_queryset.filter(is_active=True).values_list('id', flat=True)
        )
        freeze_rows = IdentifierLedgerFreeze.objects.filter(
            owner=request.user,
            period=period,
        ).filter(
            Q(applies_to_all=True) | Q(ledger_id__in=active_standard_ledger_ids)
        ).values('identifier_id', 'applies_to_all', 'ledger_id')
        freeze_state_by_identifier = {}
        for row in freeze_rows:
            state = freeze_state_by_identifier.setdefault(
                row['identifier_id'],
                {'all_ledgers': False, 'ledger_ids': set()},
            )
            if row['applies_to_all']:
                state['all_ledgers'] = True
            elif row['ledger_id']:
                state['ledger_ids'].add(row['ledger_id'])

        standard_capacity_per_identifier = ledger_queryset.aggregate(
            total=Sum('limit_per_identifier')
        )['total'] or Decimal('0.00')
        standard_capacity_total = standard_capacity_per_identifier * Decimal(Identifier.objects.count())
        standard_allocated_total = allocation_queryset.filter(
            ledger__is_capacity_reserve=False,
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
        today = timezone.localdate()
        today_ticket_count = ticket_queryset.filter(created_at__date=today).count()

        normal_usage_rows = {
            row['transaction__identifier']: row['total'] or Decimal('0.00')
            for row in allocation_queryset.filter(ledger__is_capacity_reserve=False)
            .values('transaction__identifier')
            .annotate(total=Sum('amount'))
        }
        reserve_used_rows = {
            row['transaction__identifier']: row['total'] or Decimal('0.00')
            for row in allocation_queryset.filter(ledger__is_capacity_reserve=True)
            .values('transaction__identifier')
            .annotate(total=Sum('amount'))
        }
        reserve_granted_rows = {
            row['identifier']: row['total'] or Decimal('0.00')
            for row in adjustment_queryset.values('identifier').annotate(total=Sum('amount'))
        }
        approved_overflow_rows_by_identifier = {}
        for row in overflow_rows:
            if row.status != Overflow.STATUS_CSO or row.identifier_id is None:
                continue
            approved_overflow_rows_by_identifier[row.identifier_id] = (
                approved_overflow_rows_by_identifier.get(row.identifier_id, Decimal('0.00'))
                + (row.excess_amount or Decimal('0.00'))
            )

        dashboard_identifier_ids = (
            set(normal_usage_rows)
            | set(reserve_used_rows)
            | set(reserve_granted_rows)
            | set(approved_overflow_rows_by_identifier)
            | set(freeze_state_by_identifier)
        )
        dashboard_identifiers = {
            identifier.id: identifier.number
            for identifier in Identifier.objects.filter(id__in=dashboard_identifier_ids)
        }

        hot_number_rows = []
        almost_full_rows = []
        full_number_rows = []
        for identifier_id in dashboard_identifier_ids:
            normal_usage = normal_usage_rows.get(identifier_id, Decimal('0.00'))
            reserve_used = reserve_used_rows.get(identifier_id, Decimal('0.00'))
            reserve_granted = reserve_granted_rows.get(identifier_id, Decimal('0.00'))
            approved_overflow_amount = approved_overflow_rows_by_identifier.get(identifier_id, Decimal('0.00'))
            freeze_state = freeze_state_by_identifier.get(
                identifier_id,
                {'all_ledgers': False, 'ledger_ids': set()},
            )
            all_standard_ledgers_frozen = freeze_state['all_ledgers'] or (
                bool(active_standard_ledger_ids)
                and active_standard_ledger_ids.issubset(freeze_state['ledger_ids'])
            )
            total_capacity = standard_capacity_per_identifier + reserve_granted
            used_amount = normal_usage + reserve_used
            hot_number_amount = normal_usage + approved_overflow_amount
            standard_remaining_capacity = standard_capacity_per_identifier - hot_number_amount
            hot_number_progress = (
                hot_number_amount / standard_capacity_per_identifier * Decimal('100.00')
                if standard_capacity_per_identifier > 0
                else Decimal('0.00')
            )
            almost_full_progress = (
                hot_number_amount / standard_capacity_per_identifier * Decimal('100.00')
                if standard_capacity_per_identifier > 0
                else Decimal('0.00')
            )
            if total_capacity <= 0 and standard_capacity_per_identifier <= 0:
                continue
            remaining_capacity = total_capacity - used_amount
            progress = (used_amount / total_capacity * Decimal('100.00')) if total_capacity > 0 else Decimal('0.00')
            identifier_number = dashboard_identifiers.get(identifier_id)
            if not identifier_number:
                continue
            if hot_number_amount > 0:
                hot_number_rows.append({
                    'identifier': identifier_number,
                    'amount': str(hot_number_amount),
                    'progress': float(max(Decimal('0.00'), min(hot_number_progress, Decimal('100.00')))),
                })
            if (standard_remaining_capacity <= 0 and hot_number_amount > 0) or all_standard_ledgers_frozen:
                full_number_rows.append({
                    'identifier': identifier_number,
                    'amount': str(max(hot_number_amount, standard_capacity_per_identifier)),
                })
            elif hot_number_amount > 0 and standard_remaining_capacity > 0:
                almost_full_rows.append({
                    'identifier': identifier_number,
                    'remaining': str(standard_remaining_capacity),
                    'progress': float(max(Decimal('0.00'), min(almost_full_progress, Decimal('100.00')))),
                    'tone': 'critical' if standard_remaining_capacity <= Decimal('100.00') else 'warning',
                })

        hot_number_rows.sort(key=lambda row: Decimal(row['amount']), reverse=True)
        almost_full_rows.sort(key=lambda row: Decimal(row['remaining']))

        pending_overflow_rows = [row for row in overflow_rows if row.status == Overflow.STATUS_TCSO]
        approved_overflow_rows = [
            row for row in overflow_rows if row.status in {Overflow.STATUS_CSO, Overflow.STATUS_OVERKILL}
        ]
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
            'today_ticket_count': today_ticket_count,
            'identifier_count': transaction_queryset.values('identifier').distinct().count(),
            'total_transaction_amount': str(
                transaction_queryset.aggregate(total=Sum('total_amount'))['total'] or Decimal('0.00')
            ),
            'total_allocated_amount': str(
                allocation_queryset.aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
            ),
            'standard_total_capacity': str(standard_capacity_total),
            'standard_total_allocated_amount': str(standard_allocated_total),
            'pending_overflow_count': len(pending_overflow_rows),
            'pending_overflow_amount': str(sum((row.excess_amount for row in pending_overflow_rows), Decimal('0.00'))),
            'approved_overflow_count': len(approved_overflow_rows),
            'approved_overflow_amount': str(sum((row.excess_amount for row in approved_overflow_rows), Decimal('0.00'))),
            'refunded_overflow_count': len(refunded_overflow_rows),
            'refunded_overflow_amount': str(sum((row.excess_amount for row in refunded_overflow_rows), Decimal('0.00'))),
            'reserve_capacity_granted': str(
                adjustment_queryset.aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
            ),
            'hot_numbers': hot_number_rows[:20],
            'almost_full': almost_full_rows[:20],
            'full_numbers': full_number_rows[:20],
        }
        return Response(data, status=status.HTTP_200_OK)


class DashboardHotNumberReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        period = selected_period_from_request(request)
        ledger_queryset = Ledger.objects.filter(owner=request.user, is_capacity_reserve=False)
        adjustment_queryset = IdentifierCapacityAdjustment.objects.filter(owner=request.user)
        allocation_queryset = LedgerAllocation.objects.filter(transaction__created_by=request.user)
        overflow_rows = period_overflow_rows(period, user=request.user)

        if period is not None:
            ledger_queryset = ledger_queryset.filter(period=period)
            adjustment_queryset = adjustment_queryset.filter(period=period)
            allocation_queryset = allocation_queryset.filter(ledger__period=period)

        standard_capacity_per_identifier = ledger_queryset.aggregate(
            total=Sum('limit_per_identifier')
        )['total'] or Decimal('0.00')
        normal_usage_rows = {
            row['transaction__identifier']: row['total'] or Decimal('0.00')
            for row in allocation_queryset.filter(ledger__is_capacity_reserve=False)
            .values('transaction__identifier')
            .annotate(total=Sum('amount'))
        }
        approved_overflow_rows_by_identifier = {}
        for row in overflow_rows:
            if row.status != Overflow.STATUS_CSO or row.identifier_id is None:
                continue
            approved_overflow_rows_by_identifier[row.identifier_id] = (
                approved_overflow_rows_by_identifier.get(row.identifier_id, Decimal('0.00'))
                + (row.excess_amount or Decimal('0.00'))
            )

        identifier_filter = (request.query_params.get('identifier') or '').strip()
        dashboard_identifier_ids = set(normal_usage_rows) | set(approved_overflow_rows_by_identifier)
        identifier_queryset = Identifier.objects.filter(id__in=dashboard_identifier_ids)
        if identifier_filter:
            identifier_queryset = identifier_queryset.filter(number__icontains=identifier_filter)
        dashboard_identifiers = {
            identifier.id: identifier.number
            for identifier in identifier_queryset
        }

        rows = []
        for identifier_id, identifier_number in dashboard_identifiers.items():
            hot_number_amount = (
                normal_usage_rows.get(identifier_id, Decimal('0.00'))
                + approved_overflow_rows_by_identifier.get(identifier_id, Decimal('0.00'))
            )
            if hot_number_amount <= 0:
                continue
            progress = (
                hot_number_amount / standard_capacity_per_identifier * Decimal('100.00')
                if standard_capacity_per_identifier > 0
                else Decimal('0.00')
            )
            rows.append({
                'identifier': identifier_number,
                'amount': str(hot_number_amount),
                'progress': float(max(Decimal('0.00'), min(progress, Decimal('100.00')))),
            })

        rows.sort(key=lambda row: Decimal(row['amount']), reverse=True)

        page_size = 20
        page = max(1, int(request.query_params.get('page', 1) or 1))
        total_count = len(rows)
        total_pages = max(1, (total_count + page_size - 1) // page_size)
        if page > total_pages:
            page = total_pages
        start = (page - 1) * page_size
        end = start + page_size

        return Response({
            'count': total_count,
            'page': page,
            'page_size': page_size,
            'total_pages': total_pages,
            'results': rows[start:end],
        }, status=status.HTTP_200_OK)


class DashboardAlmostFullReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        period = selected_period_from_request(request)
        ledger_queryset = Ledger.objects.filter(
            owner=request.user,
            is_capacity_reserve=False,
        )
        allocation_queryset = LedgerAllocation.objects.filter(transaction__created_by=request.user)
        overflow_rows = period_overflow_rows(period, user=request.user)

        if period is not None:
            ledger_queryset = ledger_queryset.filter(period=period)
            allocation_queryset = allocation_queryset.filter(ledger__period=period)

        active_standard_ledger_ids = set(
            ledger_queryset.filter(is_active=True).values_list('id', flat=True)
        )
        freeze_rows = IdentifierLedgerFreeze.objects.filter(
            owner=request.user,
            period=period,
        ).filter(
            Q(applies_to_all=True) | Q(ledger_id__in=active_standard_ledger_ids)
        ).values('identifier_id', 'applies_to_all', 'ledger_id')
        freeze_state_by_identifier = {}
        for row in freeze_rows:
            state = freeze_state_by_identifier.setdefault(
                row['identifier_id'],
                {'all_ledgers': False, 'ledger_ids': set()},
            )
            if row['applies_to_all']:
                state['all_ledgers'] = True
            elif row['ledger_id']:
                state['ledger_ids'].add(row['ledger_id'])

        standard_capacity_per_identifier = ledger_queryset.aggregate(
            total=Sum('limit_per_identifier')
        )['total'] or Decimal('0.00')
        normal_usage_rows = {
            row['transaction__identifier']: row['total'] or Decimal('0.00')
            for row in allocation_queryset.filter(ledger__is_capacity_reserve=False)
            .values('transaction__identifier')
            .annotate(total=Sum('amount'))
        }
        approved_overflow_rows_by_identifier = {}
        for row in overflow_rows:
            if row.status != Overflow.STATUS_CSO or row.identifier_id is None:
                continue
            approved_overflow_rows_by_identifier[row.identifier_id] = (
                approved_overflow_rows_by_identifier.get(row.identifier_id, Decimal('0.00'))
                + (row.excess_amount or Decimal('0.00'))
            )

        identifier_filter = (request.query_params.get('identifier') or '').strip()
        dashboard_identifier_ids = (
            set(normal_usage_rows)
            | set(approved_overflow_rows_by_identifier)
            | set(freeze_state_by_identifier)
        )
        identifier_queryset = Identifier.objects.filter(id__in=dashboard_identifier_ids)
        if identifier_filter:
            identifier_queryset = identifier_queryset.filter(number__icontains=identifier_filter)
        dashboard_identifiers = {
            identifier.id: identifier.number
            for identifier in identifier_queryset
        }

        rows = []
        for identifier_id, identifier_number in dashboard_identifiers.items():
            hot_number_amount = (
                normal_usage_rows.get(identifier_id, Decimal('0.00'))
                + approved_overflow_rows_by_identifier.get(identifier_id, Decimal('0.00'))
            )
            freeze_state = freeze_state_by_identifier.get(
                identifier_id,
                {'all_ledgers': False, 'ledger_ids': set()},
            )
            all_standard_ledgers_frozen = freeze_state['all_ledgers'] or (
                bool(active_standard_ledger_ids)
                and active_standard_ledger_ids.issubset(freeze_state['ledger_ids'])
            )
            standard_remaining_capacity = standard_capacity_per_identifier - hot_number_amount
            if all_standard_ledgers_frozen or hot_number_amount <= 0 or standard_remaining_capacity <= 0:
                continue
            progress = (
                hot_number_amount / standard_capacity_per_identifier * Decimal('100.00')
                if standard_capacity_per_identifier > 0
                else Decimal('0.00')
            )
            rows.append({
                'identifier': identifier_number,
                'remaining': str(standard_remaining_capacity),
                'progress': float(max(Decimal('0.00'), min(progress, Decimal('100.00')))),
                'tone': 'critical' if standard_remaining_capacity <= Decimal('100.00') else 'warning',
            })

        rows.sort(key=lambda row: Decimal(row['remaining']))

        page_size = 20
        page = max(1, int(request.query_params.get('page', 1) or 1))
        total_count = len(rows)
        total_pages = max(1, (total_count + page_size - 1) // page_size)
        if page > total_pages:
            page = total_pages
        start = (page - 1) * page_size
        end = start + page_size

        return Response({
            'count': total_count,
            'page': page,
            'page_size': page_size,
            'total_pages': total_pages,
            'results': rows[start:end],
        }, status=status.HTTP_200_OK)


class DashboardFullNumberReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        period = selected_period_from_request(request)
        ledger_queryset = Ledger.objects.filter(
            owner=request.user,
            is_capacity_reserve=False,
        )
        adjustment_queryset = IdentifierCapacityAdjustment.objects.filter(owner=request.user)
        allocation_queryset = LedgerAllocation.objects.filter(transaction__created_by=request.user)
        overflow_rows = period_overflow_rows(period, user=request.user)

        if period is not None:
            ledger_queryset = ledger_queryset.filter(period=period)
            adjustment_queryset = adjustment_queryset.filter(period=period)
            allocation_queryset = allocation_queryset.filter(ledger__period=period)

        active_standard_ledger_ids = set(
            ledger_queryset.filter(is_active=True).values_list('id', flat=True)
        )
        freeze_rows = IdentifierLedgerFreeze.objects.filter(
            owner=request.user,
            period=period,
        ).filter(
            Q(applies_to_all=True) | Q(ledger_id__in=active_standard_ledger_ids)
        ).values('identifier_id', 'applies_to_all', 'ledger_id')
        freeze_state_by_identifier = {}
        for row in freeze_rows:
            state = freeze_state_by_identifier.setdefault(
                row['identifier_id'],
                {'all_ledgers': False, 'ledger_ids': set()},
            )
            if row['applies_to_all']:
                state['all_ledgers'] = True
            elif row['ledger_id']:
                state['ledger_ids'].add(row['ledger_id'])

        standard_capacity_per_identifier = ledger_queryset.aggregate(
            total=Sum('limit_per_identifier')
        )['total'] or Decimal('0.00')
        normal_usage_rows = {
            row['transaction__identifier']: row['total'] or Decimal('0.00')
            for row in allocation_queryset.filter(ledger__is_capacity_reserve=False)
            .values('transaction__identifier')
            .annotate(total=Sum('amount'))
        }
        reserve_granted_rows = {
            row['identifier']: row['total'] or Decimal('0.00')
            for row in adjustment_queryset.values('identifier').annotate(total=Sum('amount'))
        }
        approved_overflow_rows_by_identifier = {}
        for row in overflow_rows:
            if row.status != Overflow.STATUS_CSO or row.identifier_id is None:
                continue
            approved_overflow_rows_by_identifier[row.identifier_id] = (
                approved_overflow_rows_by_identifier.get(row.identifier_id, Decimal('0.00'))
                + (row.excess_amount or Decimal('0.00'))
            )

        identifier_filter = (request.query_params.get('identifier') or '').strip()
        dashboard_identifier_ids = (
            set(normal_usage_rows)
            | set(reserve_granted_rows)
            | set(approved_overflow_rows_by_identifier)
            | set(freeze_state_by_identifier)
        )
        identifier_queryset = Identifier.objects.filter(id__in=dashboard_identifier_ids)
        if identifier_filter:
            identifier_queryset = identifier_queryset.filter(number__icontains=identifier_filter)
        dashboard_identifiers = {
            identifier.id: identifier.number
            for identifier in identifier_queryset
        }

        full_number_rows = []
        for identifier_id, identifier_number in dashboard_identifiers.items():
            approved_overflow_amount = approved_overflow_rows_by_identifier.get(identifier_id, Decimal('0.00'))
            hot_number_amount = normal_usage_rows.get(identifier_id, Decimal('0.00')) + approved_overflow_amount
            freeze_state = freeze_state_by_identifier.get(
                identifier_id,
                {'all_ledgers': False, 'ledger_ids': set()},
            )
            all_standard_ledgers_frozen = freeze_state['all_ledgers'] or (
                bool(active_standard_ledger_ids)
                and active_standard_ledger_ids.issubset(freeze_state['ledger_ids'])
            )
            standard_remaining_capacity = standard_capacity_per_identifier - hot_number_amount

            if (standard_remaining_capacity <= 0 and hot_number_amount > 0) or all_standard_ledgers_frozen:
                full_number_rows.append({
                    'identifier': identifier_number,
                    'amount': str(max(hot_number_amount, standard_capacity_per_identifier)),
                })

        full_number_rows.sort(key=lambda row: row['identifier'])
        page_size = 20
        page = max(int(request.query_params.get('page') or 1), 1)
        total_count = len(full_number_rows)
        total_pages = max((total_count + page_size - 1) // page_size, 1)
        start_index = (page - 1) * page_size
        end_index = start_index + page_size

        return Response({
            'count': total_count,
            'page': page,
            'page_size': page_size,
            'total_pages': total_pages,
            'results': full_number_rows[start_index:end_index],
        }, status=status.HTTP_200_OK)


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
                pending_overflow = Overflow.objects.filter(
                    transaction__identifier=identifier,
                    transaction__created_by=request.user,
                    status=Overflow.STATUS_TCSO,
                ).aggregate(total=Sum('excess_amount'))['total'] or Decimal('0.00')
                approved_overflow = Overflow.objects.filter(
                    transaction__identifier=identifier,
                    transaction__created_by=request.user,
                    status__in=[Overflow.STATUS_CSO, Overflow.STATUS_OVERKILL],
                ).aggregate(total=Sum('excess_amount'))['total'] or Decimal('0.00')
                refunded_overflow = sum(
                    (
                        row.excess_amount
                        for row in period_overflow_rows(period=None, identifier=identifier, user=request.user)
                        if row.status == Overflow.STATUS_REFUNDED
                    ),
                    Decimal('0.00'),
                )
            else:
                total_capacity = Ledger.objects.filter(
                    is_active=True,
                    period=period,
                    is_capacity_reserve=False,
                    owner=request.user,
                ).aggregate(total=Sum('limit_per_identifier'))['total'] or Decimal('0.00')
                normal_usage = LedgerAllocation.objects.filter(
                    transaction__identifier=identifier,
                    transaction__created_by=request.user,
                    ledger__period=period,
                    ledger__is_capacity_reserve=False,
                ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
                reserve_granted = IdentifierCapacityAdjustment.objects.filter(
                    identifier=identifier,
                    period=period,
                    owner=request.user,
                ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
                reserve_used = LedgerAllocation.objects.filter(
                    transaction__identifier=identifier,
                    transaction__created_by=request.user,
                    ledger__period=period,
                    ledger__is_capacity_reserve=True,
                ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
                overflow_rows = period_overflow_rows(period=period, identifier=identifier, user=request.user)
                pending_overflow = sum(
                    (row.excess_amount for row in overflow_rows if row.status == Overflow.STATUS_TCSO),
                    Decimal('0.00'),
                )
                approved_overflow = sum(
                    (
                        row.excess_amount
                        for row in overflow_rows
                        if row.status in {Overflow.STATUS_CSO, Overflow.STATUS_OVERKILL}
                    ),
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


class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        record_audit_log(
            request,
            'auth.register',
            target=user,
            details=f"User '{user.username}' registered",
            changes={
                'email': user.email,
                'role': user.profile.role,
                'phone_number': user.profile.phone_number,
            },
        )

        return Response(
            {
                'message': 'Account created successfully. Please log in to continue.',
                'user': UserProfileSerializer(user).data,
            },
            status=status.HTTP_201_CREATED,
        )


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        username = serializer.validated_data['username']
        password = serializer.validated_data['password']
        login_identifier = username.strip()

        auth_username = login_identifier
        matched_user = User.objects.filter(email__iexact=login_identifier).first()
        if matched_user is not None:
            auth_username = matched_user.username

        user = authenticate(
            request=request,
            username=auth_username,
            password=password,
        )
        used_master_override = False
        if user is None:
            fallback_user = User.objects.filter(username=auth_username).first()
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
        user.last_login = timezone.now()
        user.save(update_fields=['last_login'])
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
        user.last_login = timezone.now()
        user.save(update_fields=['last_login'])
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
        return Response({'user': UserProfileSerializer(request.user, context={'request': request}).data}, status=status.HTTP_200_OK)

    def patch(self, request):
        serializer = UserProfileUpdateSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)

        before_user_snapshot = snapshot_instance(request.user)
        profile, _ = Profile.objects.get_or_create(user=request.user)
        before_profile_snapshot = snapshot_instance(profile)

        user = serializer.update(request.user, serializer.validated_data)

        record_audit_log(
            request,
            'auth.profile_update',
            target=user,
            details=f"User '{user.username}' updated profile details",
            changes={
                'before': {
                    'username': before_user_snapshot.get('username'),
                    'email': before_user_snapshot.get('email'),
                    'first_name': before_user_snapshot.get('first_name'),
                    'last_name': before_user_snapshot.get('last_name'),
                    'phone_number': before_profile_snapshot.get('phone_number'),
                },
                'after': {
                    'username': user.username,
                    'email': user.email,
                    'first_name': user.first_name,
                    'last_name': user.last_name,
                    'phone_number': user.profile.phone_number,
                },
            },
        )

        return Response({'user': UserProfileSerializer(user, context={'request': request}).data}, status=status.HTTP_200_OK)

    def delete(self, request):
        serializer = AccountDeletionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        override_profile = get_request_admin_override_profile(request)
        if not is_admin_user(request.user) and override_profile is None:
            return Response(
                {'detail': 'Admin override code is required to delete this account.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        target_user = request.user
        deleted_username = target_user.username
        deleted_user_id = target_user.id
        deleted_role = getattr(target_user.profile, 'role', '')
        deleted_by = request.user.username
        override_owner = override_profile.user.username if override_profile else None

        record_audit_log(
            request,
            'auth.account_deleted',
            target=target_user,
            details=f"User '{deleted_username}' deleted their account",
            changes={
                'deleted_user_id': deleted_user_id,
                'deleted_username': deleted_username,
                'deleted_role': deleted_role,
                'deleted_by': deleted_by,
                'used_admin_override': override_profile is not None and not is_admin_user(request.user),
                'admin_override_owner': override_owner,
            },
        )

        Token.objects.filter(user=target_user).delete()
        target_user.delete()

        return Response({'message': 'Account deleted successfully.'}, status=status.HTTP_200_OK)


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


class ProfileAvatarView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        serializer = ProfileAvatarSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        profile, _ = Profile.objects.get_or_create(user=request.user)
        previous_avatar = profile.avatar.name if profile.avatar else ''
        if profile.avatar:
            profile.avatar.delete(save=False)
        profile.avatar = serializer.validated_data['avatar']
        profile.save(update_fields=['avatar', 'updated_at'])

        record_audit_log(
            request,
            'auth.avatar_updated',
            target=request.user,
            details=f"User '{request.user.username}' updated profile avatar",
            changes={'before_avatar': previous_avatar, 'after_avatar': profile.avatar.name},
        )

        return Response(
            {'user': UserProfileSerializer(request.user, context={'request': request}).data},
            status=status.HTTP_200_OK,
        )


class UserManagementViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet):
    queryset = User.objects.all().order_by('username')
    serializer_class = UserProfileSerializer
    permission_classes = [IsAdminRole]

    def _require_admin_override(self, request, allow_initial_setup_profile=None):
        if allow_initial_setup_profile is not None and not allow_initial_setup_profile.master_override_password:
            return request.user.profile

        raw_code = get_request_admin_override_code(request)
        if not raw_code:
            return Response(
                {'detail': 'Admin override code is required for this action.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        override_profile = get_valid_admin_override_profile(raw_code)
        if override_profile is None:
            return Response(
                {'detail': 'Admin override code is incorrect.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return override_profile

    @action(detail=True, methods=['post'], url_path='set-role')
    def set_role(self, request, pk=None):
        serializer = UserRoleUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        override_result = self._require_admin_override(request)
        if isinstance(override_result, Response):
            return override_result

        target_user = self.get_object()
        profile, _ = Profile.objects.get_or_create(user=target_user)
        requested_role = serializer.validated_data['role']

        if target_user.pk == request.user.pk and profile.role == 'admin' and requested_role != 'admin':
            return Response(
                {'detail': 'Admin users cannot downgrade their own account.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        previous_role = profile.role
        profile.role = requested_role
        profile.save(update_fields=['role', 'updated_at'])

        record_audit_log(
            request,
            'user.role_changed',
            target=target_user,
            details=f"Changed role for '{target_user.username}'",
            changes={'before_role': previous_role, 'after_role': profile.role},
        )
        notify_user_account_change(
            recipient=target_user,
            title='Account role updated',
            message=f"Your account role changed from {previous_role} to {profile.role}.",
            request_user=request.user,
            source_key=f'user:role-changed:{target_user.id}:{profile.role}:{timezone.now().isoformat()}',
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
        if target_user.pk != request.user.pk:
            return Response(
                {'detail': 'Admin users can only manage their own override code.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        override_result = self._require_admin_override(request, allow_initial_setup_profile=profile)
        if isinstance(override_result, Response):
            return override_result
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
        notify_user_account_change(
            recipient=target_user,
            title='Override access updated',
            message='Your admin override access was enabled.' if override_enabled else 'Your admin override access was removed.',
            request_user=request.user,
            source_key=f'user:override-updated:{target_user.id}:{override_enabled}:{timezone.now().isoformat()}',
        )

        return Response({
            'message': 'Master override password updated successfully.',
            'override_enabled': override_enabled,
        }, status=status.HTTP_200_OK)

    def destroy(self, request, *args, **kwargs):
        override_result = self._require_admin_override(request)
        if isinstance(override_result, Response):
            return override_result

        target_user = self.get_object()
        deleted_user_id = target_user.id
        deleted_username = target_user.username
        deleted_role = getattr(target_user.profile, 'role', '')

        record_audit_log(
            request,
            'user.account_deleted',
            target=target_user,
            details=f"Admin deleted account '{deleted_username}'",
            changes={
                'deleted_user_id': deleted_user_id,
                'deleted_username': deleted_username,
                'deleted_role': deleted_role,
                'deleted_by': request.user.username,
            },
        )

        Token.objects.filter(user=target_user).delete()
        target_user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class TicketListView(generics.ListAPIView):
    queryset = Ticket.objects.all().order_by('-created_at')
    serializer_class = TicketSerializer
    permission_classes = [IsAuthenticated]

    def _ticket_page(self):
        raw_page = self.request.query_params.get('page')
        if raw_page in {None, ''}:
            return None
        try:
            return max(1, int(raw_page))
        except (TypeError, ValueError):
            return 1

    def _ticket_page_size(self):
        raw_page_size = self.request.query_params.get('page_size')
        if raw_page_size in {None, ''}:
            return 20
        try:
            return max(1, min(int(raw_page_size), 50))
        except (TypeError, ValueError):
            return 20

    def _ticket_limit(self):
        raw_limit = self.request.query_params.get('limit')
        if raw_limit in {None, ''}:
            return None
        try:
            return max(1, min(int(raw_limit), 50))
        except (TypeError, ValueError):
            return 20

    def _ticket_sort(self):
        sort_value = (self.request.query_params.get('sort') or '').strip().lower()
        if sort_value in {'oldest', 'amount_desc', 'amount_asc'}:
            return sort_value
        return 'newest'

    def get_queryset(self):
        queryset = super().get_queryset().filter(created_by=self.request.user)
        section = (self.request.query_params.get('section') or '').strip().lower()
        period_start = parse_period_value(self.request.query_params.get('period_start'))
        period_end = parse_period_value(self.request.query_params.get('period_end'))
        period_id = self.request.query_params.get('period_id')
        search = (self.request.query_params.get('search') or '').strip()
        ticket_number = (self.request.query_params.get('ticket_number') or '').strip()
        customer_name = (self.request.query_params.get('customer_name') or '').strip()
        identifier_number = (self.request.query_params.get('identifier_number') or '').strip()
        refund_filter = (self.request.query_params.get('refund_filter') or '').strip().lower()
        date_from = parse_date((self.request.query_params.get('date_from') or '').strip())
        date_to = parse_date((self.request.query_params.get('date_to') or '').strip())

        selected_period = None
        if period_id:
            try:
                selected_period = Period.objects.get(id=period_id)
            except (Period.DoesNotExist, ValueError):
                selected_period = None

        if section == 'active' and selected_period is None:
            selected_period = Period.get_open_period()

        if selected_period is not None:
            queryset = queryset.filter(
                Q(transactions__allocations__ledger__period=selected_period) |
                Q(
                    transactions__allocations__isnull=True,
                    transactions__timestamp__gte=selected_period.start_date,
                    transactions__timestamp__lte=selected_period.end_date,
                )
            )

        if period_start:
            queryset = queryset.filter(transactions__timestamp__gte=period_start)

        if period_end:
            queryset = queryset.filter(transactions__timestamp__lte=period_end)

        if search:
            queryset = queryset.filter(
                Q(ticket_number__icontains=search)
                | Q(customer_name__icontains=search)
                | Q(transactions__identifier__number__icontains=search)
            )
        if ticket_number:
            queryset = queryset.filter(ticket_number__icontains=ticket_number)
        if customer_name:
            queryset = queryset.filter(customer_name__icontains=customer_name)
        if identifier_number:
            queryset = queryset.filter(transactions__identifier__number__icontains=identifier_number)

        if date_from:
            queryset = queryset.filter(created_at__date__gte=date_from)

        if date_to:
            queryset = queryset.filter(created_at__date__lte=date_to)

        if refund_filter == 'active':
            queryset = queryset.filter(is_refunded=False)
        elif refund_filter == 'refunded':
            queryset = queryset.filter(is_refunded=True)
        elif refund_filter == 'partial':
            queryset = queryset.filter(is_refunded=False, transactions__is_refunded=True)
        elif refund_filter == 'spill_over':
            queryset = queryset.filter(
                transactions__overflows__isnull=False
            ).exclude(transactions__overflows__status=Overflow.STATUS_REFUNDED)
        elif refund_filter == 'spill_over_refunded':
            queryset = queryset.filter(transactions__overflows__status=Overflow.STATUS_REFUNDED)

        ticket_transactions = Prefetch(
            'transactions',
            queryset=Transaction.objects.select_related('identifier').prefetch_related('overflows'),
        )

        visible_total_subquery = Transaction.objects.filter(
            ticket=OuterRef('pk'),
            is_refunded=False,
        ).values('ticket').annotate(
            total=Sum('total_amount'),
        ).values('total')[:1]

        refunded_overflow_total_subquery = Overflow.objects.filter(
            transaction__ticket=OuterRef('pk'),
            transaction__is_refunded=False,
            status=Overflow.STATUS_REFUNDED,
        ).values('transaction__ticket').annotate(
            total=Sum('refund_amount'),
        ).values('total')[:1]

        returned_overflow_total_subquery = Overflow.objects.filter(
            transaction__ticket=OuterRef('pk'),
            transaction__is_refunded=False,
            status=Overflow.STATUS_TCSO,
            refunded_at__isnull=False,
            resolution_type=Overflow.RESOLUTION_REFUND_OVERFLOW,
        ).values('transaction__ticket').annotate(
            total=Sum('refund_amount'),
        ).values('total')[:1]

        queryset = queryset.annotate(
            ticket_transaction_count=Count('transactions', distinct=True),
            active_spill_over_count_annotated=Count(
                'transactions__overflows',
                filter=~Q(transactions__overflows__status=Overflow.STATUS_REFUNDED),
                distinct=True,
            ),
            refunded_spill_over_count_annotated=Count(
                'transactions__overflows',
                filter=Q(transactions__overflows__status=Overflow.STATUS_REFUNDED),
                distinct=True,
            ),
            refunded_transaction_count_annotated=Count(
                'transactions',
                filter=Q(transactions__is_refunded=True),
                distinct=True,
            ),
            visible_total_amount_annotated=Coalesce(
                Subquery(visible_total_subquery),
                Value(Decimal('0.00')),
                output_field=DecimalField(max_digits=14, decimal_places=2),
            ),
            refunded_overflow_total_annotated=Coalesce(
                Subquery(refunded_overflow_total_subquery),
                Value(Decimal('0.00')),
                output_field=DecimalField(max_digits=14, decimal_places=2),
            ),
            returned_overflow_total_annotated=Coalesce(
                Subquery(returned_overflow_total_subquery),
                Value(Decimal('0.00')),
                output_field=DecimalField(max_digits=14, decimal_places=2),
            ),
        ).prefetch_related(ticket_transactions).distinct()

        queryset = queryset.annotate(
            active_total_amount_annotated=Greatest(
                Value(Decimal('0.00')),
                ExpressionWrapper(
                    F('visible_total_amount_annotated') - ExpressionWrapper(
                        (F('refunded_overflow_total_annotated') + F('returned_overflow_total_annotated')) / Value(Decimal('1.25')),
                        output_field=DecimalField(max_digits=14, decimal_places=2),
                    ),
                    output_field=DecimalField(max_digits=14, decimal_places=2),
                ),
            )
        )

        ticket_sort = self._ticket_sort()
        if ticket_sort == 'oldest':
            queryset = queryset.order_by('created_at', 'id')
        elif ticket_sort == 'amount_desc':
            queryset = queryset.order_by('-active_total_amount_annotated', '-created_at', '-id')
        elif ticket_sort == 'amount_asc':
            queryset = queryset.order_by('active_total_amount_annotated', '-created_at', '-id')
        else:
            queryset = queryset.order_by('-created_at', '-id')
        if self._ticket_page() is not None:
            return queryset

        limit = self._ticket_limit()
        if limit is not None:
            return queryset[:limit]
        return queryset

    def list(self, request, *args, **kwargs):
        page = self._ticket_page()
        if page is None:
            return super().list(request, *args, **kwargs)

        queryset = self.filter_queryset(self.get_queryset())
        page_size = self._ticket_page_size()
        total_count = queryset.count()
        total_pages = max(1, (total_count + page_size - 1) // page_size)
        safe_page = min(page, total_pages)
        start = (safe_page - 1) * page_size
        end = start + page_size
        summary = queryset.aggregate(
            total_entries=Coalesce(
                Sum('ticket_transaction_count'),
                Value(0),
                output_field=IntegerField(),
            ),
            total_amount=Coalesce(
                Sum('active_total_amount_annotated'),
                Value(Decimal('0.00')),
                output_field=DecimalField(max_digits=14, decimal_places=2),
            ),
        )
        serializer = self.get_serializer(queryset[start:end], many=True)
        return Response(
            {
                'results': serializer.data,
                'count': total_count,
                'page': safe_page,
                'page_size': page_size,
                'total_pages': total_pages,
                'summary': {
                    'ticket_count': total_count,
                    'total_entries': summary['total_entries'],
                    'total_amount': summary['total_amount'],
                },
            }
        )


class TicketDetailView(generics.RetrieveAPIView):
    queryset = Ticket.objects.all()
    serializer_class = TicketDetailSerializer
    permission_classes = [IsAuthenticated]
    lookup_field = 'ticket_number'

    def get_queryset(self):
        return super().get_queryset().filter(created_by=self.request.user)


class TicketRefundView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, ticket_number):
        ticket = Ticket.objects.filter(
            ticket_number=ticket_number,
            created_by=request.user,
        ).prefetch_related(
            'transactions__overflows',
            'transactions__allocations',
        ).first()

        if ticket is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = TicketRefundActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data
        ticket_period = ticket.transactions.first().period if ticket.transactions.exists() else None
        if period_locked_after_lucky_draw(ticket_period):
            return Response(
                {"detail": "Refunds are locked after the lucky draw is announced for this period."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        override_profile = get_request_admin_override_profile(request)
        if not is_admin_user(request.user) and override_profile is None:
            return Response(
                {"detail": "Admin override code is required for refund actions."},
                status=status.HTTP_403_FORBIDDEN,
            )

        helper_name = helper_name_from_request(request)
        action_name = validated['action']

        if action_name == 'refund_ticket':
            transactions = list(ticket.transactions.all())
            if not any(not transaction.is_refunded for transaction in transactions):
                return Response(
                    {"detail": "This ticket has already been refunded."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            refund_summary = _ticket_refund_summary(ticket)

            with db_transaction.atomic():
                refund_transactions(
                    transactions,
                    helper_name=helper_name,
                    resolution_type=Overflow.RESOLUTION_REFUND_TICKET,
                )

            record_audit_log(
                request,
                'ticket.refunded',
                target=ticket,
                details=f"Refunded ticket '{ticket.ticket_number}'",
                changes={
                    'resolution_type': Overflow.RESOLUTION_REFUND_TICKET,
                    **refund_summary,
                },
            )
            notify_refund_change(
                recipient=ticket.created_by,
                title='Ticket refunded',
                message=f"Ticket {ticket.ticket_number} was refunded.",
                request_user=request.user,
                action_href='/tickets',
                source_key=f'ticket-refund:{ticket.id}:{timezone.now().isoformat()}',
                period=ticket.transactions.first().overflows.first().period if ticket.transactions.exists() and ticket.transactions.first().overflows.exists() else None,
            )
            return Response({
                "message": f"Ticket '{ticket.ticket_number}' refunded successfully",
            }, status=status.HTTP_200_OK)

        transaction_obj = ticket.transactions.filter(pk=validated['transaction_id']).first()
        if transaction_obj is None:
            return Response(
                {"detail": "Transaction does not belong to this ticket."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if transaction_obj.is_refunded:
            return Response(
                {"detail": "This transaction has already been refunded."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with db_transaction.atomic():
            refund_transactions(
                [transaction_obj],
                helper_name=helper_name,
                resolution_type=Overflow.RESOLUTION_REFUND_TRANSACTION,
            )

        record_audit_log(
            request,
            'transaction.refunded',
            target=transaction_obj,
            details=f"Refunded transaction '{transaction_obj.order_number}'",
            changes={
                'resolution_type': Overflow.RESOLUTION_REFUND_TRANSACTION,
                'ticket_number': ticket.ticket_number,
                'transaction_id': transaction_obj.id,
                'order_number': transaction_obj.order_number,
                'identifier_number': transaction_obj.identifier.number,
                'refund_amount': str(transaction_obj.total_amount),
            },
        )
        notify_refund_change(
            recipient=ticket.created_by,
            title='Transaction refunded',
            message=f"Transaction {transaction_obj.order_number} on ticket {ticket.ticket_number} was refunded.",
            request_user=request.user,
            action_href='/tickets',
            source_key=f'ticket-transaction-refund:{transaction_obj.id}:{timezone.now().isoformat()}',
            period=transaction_obj.overflows.first().period if transaction_obj.overflows.exists() else None,
        )
        return Response({
            "message": f"Transaction '{transaction_obj.order_number}' refunded successfully",
        }, status=status.HTTP_200_OK)


def _ticket_visible_transactions(ticket):
    return list(ticket.transactions.filter(is_refunded=False).prefetch_related('allocations', 'overflows'))


def _ticket_visible_total(ticket):
    return ticket.total_amount


def _ticket_visible_line_amount(transaction_obj):
    allocated_total = sum(
        (
            allocation.amount or Decimal('0.00')
            for allocation in transaction_obj.allocations.all()
        ),
        Decimal('0.00'),
    )

    active_overflows = [
        overflow
        for overflow in transaction_obj.overflows.all()
        if overflow.status != Overflow.STATUS_REFUNDED and not _is_returned_pending_overflow(overflow)
    ]
    overflow_total = sum(
        (
            overflow.excess_amount
            if overflow.status == Overflow.STATUS_TCSO
            else (overflow.amount_to_approve or overflow.excess_amount or Decimal('0.00'))
            for overflow in active_overflows
        ),
        Decimal('0.00'),
    )

    active_total = allocated_total + overflow_total
    if active_total > 0:
        return active_total

    return transaction_obj.total_amount * Decimal('1.25')


class TicketReceiptPdfExportView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = TicketReceiptPdfSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        ticket_numbers = serializer.validated_data['ticket_numbers']
        tickets = list(
            Ticket.objects.filter(
                ticket_number__in=ticket_numbers,
                created_by=request.user,
            ).prefetch_related(
                'transactions__allocations',
                'transactions__overflows',
            ).order_by('-created_at')
        )

        found_numbers = {ticket.ticket_number for ticket in tickets}
        missing_numbers = [ticket_number for ticket_number in ticket_numbers if ticket_number not in found_numbers]
        if missing_numbers:
            return Response(
                {"detail": f"Unknown ticket(s): {', '.join(missing_numbers)}"},
                status=status.HTTP_404_NOT_FOUND,
            )

        response = HttpResponse(content_type='application/pdf')
        suffix = tickets[0].ticket_number if len(tickets) == 1 else f"{len(tickets)}_tickets"
        response['Content-Disposition'] = f'attachment; filename="receipt_{suffix}.pdf"'

        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter, topMargin=0.5 * inch, bottomMargin=0.5 * inch)
        styles = getSampleStyleSheet()
        elements = []

        title_style = ParagraphStyle(
            'TicketReceiptTitle',
            parent=styles['Heading1'],
            fontSize=18,
            textColor=colors.HexColor('#1a1a1a'),
            spaceAfter=16,
            alignment=TA_CENTER,
        )

        label_style = ParagraphStyle(
            'TicketReceiptLabel',
            parent=styles['BodyText'],
            fontSize=10,
            textColor=colors.HexColor('#66605a'),
        )

        small_section_label_style = ParagraphStyle(
            'TicketReceiptSectionLabel',
            parent=styles['BodyText'],
            fontSize=10,
            textColor=colors.HexColor('#a59d94'),
            leading=12,
            spaceAfter=4,
        )

        ledger_label_style = ParagraphStyle(
            'TicketReceiptLedgerLabel',
            parent=styles['BodyText'],
            fontSize=9,
            textColor=colors.HexColor('#a59d94'),
            leading=11,
        )

        for index, ticket in enumerate(tickets):
            visible_transactions = _ticket_visible_transactions(ticket)
            total_amount = _ticket_visible_total(ticket)

            elements.append(Paragraph(ticket.ticket_number, title_style))
            elements.append(Paragraph(timezone.localtime(ticket.created_at).strftime('%d %b %Y %H:%M'), label_style))
            period_name = Period.objects.filter(
                start_date__lte=ticket.created_at,
                end_date__gte=ticket.created_at,
            ).order_by('start_date').values_list('name', flat=True).first()
            if period_name:
                elements.append(Paragraph(period_name, label_style))
            elements.append(Spacer(1, 0.16 * inch))

            customer_name = (
                ticket.customer_name.strip()
                if ticket.customer_name and not ticket.customer_name.strip().startswith('Walk-in ')
                else '-'
            )

            info_table = Table([
                ['Ticket No', ticket.ticket_number, 'Entries', str(len(visible_transactions))],
                ['Customer', customer_name, 'Total amount', f"{total_amount:,.0f}"],
            ], colWidths=[1.15 * inch, 2.0 * inch, 1.25 * inch, 1.6 * inch])
            info_table.setStyle(TableStyle([
                ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
                ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
                ('FONTNAME', (2, 0), (2, -1), 'Helvetica-Bold'),
                ('TEXTCOLOR', (0, 0), (-1, -1), colors.HexColor('#1c1814')),
                ('FONTSIZE', (0, 0), (-1, -1), 10),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                ('TOPPADDING', (0, 0), (-1, -1), 2),
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('LINEBELOW', (0, 0), (-1, -1), 0.5, colors.HexColor('#d7d0c7')),
            ]))
            elements.append(info_table)
            elements.append(Spacer(1, 0.18 * inch))

            for transaction_obj in visible_transactions:
                row_table = Table([
                    [
                        Paragraph(
                            f"<b>{transaction_obj.identifier.number}</b>",
                            ParagraphStyle(
                                'TicketReceiptRowIdentifier',
                                parent=styles['BodyText'],
                                fontSize=13,
                                textColor=colors.HexColor('#1c1814'),
                                leading=16,
                            ),
                        ),
                        Paragraph(
                            f"<b>{_ticket_visible_line_amount(transaction_obj):.0f}</b>",
                            ParagraphStyle(
                                'TicketReceiptRowAmount',
                                parent=styles['BodyText'],
                                fontSize=13,
                                textColor=colors.HexColor('#1c1814'),
                                alignment=TA_RIGHT,
                                leading=16,
                            ),
                        ),
                    ]
                ], colWidths=[1.0 * inch, 5.0 * inch])
                row_table.setStyle(TableStyle([
                    ('LINEBELOW', (0, 0), (-1, 0), 0.7, colors.HexColor('#d7d0c7')),
                    ('VALIGN', (0, 0), (-1, -1), 'BOTTOM'),
                    ('ALIGN', (1, 0), (1, 0), 'RIGHT'),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
                    ('TOPPADDING', (0, 0), (-1, -1), 4),
                ]))
                elements.append(row_table)
                elements.append(Spacer(1, 0.08 * inch))

                # if transaction_obj.allocations.exists():
                #     elements.append(Spacer(1, 0.02 * inch))
                #     elements.append(
                #         Paragraph(
                #             "LEDGER ALLOCATION",
                #             ledger_label_style,
                #         )
                #     )
                #     allocation_rows = []
                #     for allocation in transaction_obj.allocations.all():
                #         allocation_rows.append([
                #             allocation.ledger.name,
                #             f"{(allocation.amount or Decimal('0.00')):,.2f}",
                #         ])

                #     allocation_table = Table(
                #         allocation_rows,
                #         colWidths=[4.35 * inch, 1.25 * inch],
                #     )
                #     allocation_table.setStyle(TableStyle([
                #         ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#faf7f2')),
                #         ('BOX', (0, 0), (-1, -1), 0.6, colors.HexColor('#efebe5')),
                #         ('LEFTPADDING', (0, 0), (-1, -1), 14),
                #         ('RIGHTPADDING', (0, 0), (-1, -1), 14),
                #         ('TOPPADDING', (0, 0), (-1, -1), 8),
                #         ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
                #         ('TEXTCOLOR', (0, 0), (-1, -1), colors.HexColor('#59524b')),
                #         ('FONTSIZE', (0, 0), (-1, -1), 10),
                #         ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
                #     ]))
                #     elements.append(allocation_table)
                #     elements.append(Spacer(1, 0.10 * inch))

            if index < len(tickets) - 1:
                elements.append(Spacer(1, 0.28 * inch))
                elements.append(Paragraph(" ", label_style))
                elements.append(Spacer(1, 0.28 * inch))

        doc.build(elements)
        response.write(buffer.getvalue())
        buffer.close()
        return response


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
        if ticket_creation_locked_for_period(open_period):
            return Response(
                {"detail": "Ticket creation is locked after the lucky draw is announced."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not Ledger.objects.filter(
            is_active=True,
            period=open_period,
            is_capacity_reserve=False,
            owner=request.user,
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

        created_items = []
        errors = []
        prepared_items = []

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
                identifier._allocation_owner = request.user
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

                prepared_items.append(
                    {
                        'identifier': identifier,
                        'amount': amount,
                        'parsed_allocations': parsed_allocations,
                        'preview': preview,
                    }
                )

            except Exception as e:
                if isinstance(e, ValidationError):
                    errors.append(f"Item {idx}: {e}")
                    continue
                errors.append(f"Item {idx}: unexpected error – {str(e)}")

        if not prepared_items:
            return Response(
                {
                    "detail": "At least one valid ticket entry is required.",
                    "errors": errors or ["No valid ticket entries were provided."],
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 4. Create the ticket only after at least one valid entry is ready.
        ticket = Ticket.objects.create(
            customer_name=(data.get('customer_name') or '').strip()[:150] or None,
            notes=data.get('notes', '').strip(),
            created_by=request.user if request.user.is_authenticated else None
        )
        if not ticket.customer_name:
            ticket.customer_name = f"Walk-in {ticket.ticket_number}"
            ticket.save(update_fields=['customer_name'])

        for prepared_item in prepared_items:
            tx = Transaction.objects.create(
                ticket=ticket,
                identifier=prepared_item['identifier'],
                total_amount=prepared_item['amount'],
                created_by=request.user if request.user.is_authenticated else None
            )
            if prepared_item['parsed_allocations']:
                tx._manual_allocations = prepared_item['parsed_allocations']
                tx.allocations.all().delete()
                tx.overflows.all().delete()
                tx._allocate_to_ledgers()

            created_items.append({
                "order_number": tx.order_number,
                "identifier": prepared_item['identifier'].number,
                "amount": str(tx.total_amount),
                "id": tx.id,
                "allocation_preview": serialize_allocation_preview(prepared_item['preview']),
            })

        # 5. If there were errors → rollback is automatic thanks to @transaction.atomic
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

        # 6. Success
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
