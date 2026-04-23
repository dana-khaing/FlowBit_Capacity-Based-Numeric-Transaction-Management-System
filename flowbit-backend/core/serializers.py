from datetime import datetime, time
from decimal import Decimal

from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.db.models import Sum
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from rest_framework import serializers
from .models import (
    Period,
    Ledger,
    Identifier,
    Transaction,
    LedgerAllocation,
    Overflow,
    OverflowNotification,
    AuditLog,
    Profile,
    PasswordResetToken,
    Collaborator,
    Ticket,
    IdentifierCapacityAdjustment,
)


DEFAULT_PERIOD_CLOSE_TIME = time(hour=15, minute=0)


def _aware_datetime_from_date(value, fallback_time):
    naive_datetime = datetime.combine(value, fallback_time)
    return timezone.make_aware(naive_datetime, timezone.get_current_timezone())


class FlexibleDateTimeField(serializers.DateTimeField):
    def __init__(self, *args, default_time=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.default_time = default_time or time.min

    def to_internal_value(self, value):
        if isinstance(value, datetime):
            if timezone.is_naive(value):
                return timezone.make_aware(value, timezone.get_current_timezone())
            return value

        if isinstance(value, str):
            stripped_value = value.strip()
            parsed_date = parse_date(stripped_value)
            is_date_only = parsed_date and 'T' not in stripped_value and ':' not in stripped_value and ' ' not in stripped_value
            if is_date_only:
                close_time = self._resolve_default_time()
                return _aware_datetime_from_date(parsed_date, close_time)

            parsed_datetime = parse_datetime(stripped_value)
            if parsed_datetime:
                if timezone.is_naive(parsed_datetime):
                    return timezone.make_aware(parsed_datetime, timezone.get_current_timezone())
                return parsed_datetime

        return super().to_internal_value(value)

    def _resolve_default_time(self):
        if callable(self.default_time):
            return self.default_time(self)
        return self.default_time


def _serializer_close_time(field):
    serializer = field.parent
    raw_close_time = serializer.initial_data.get('close_time') if serializer and serializer.initial_data else None
    if not raw_close_time:
        return DEFAULT_PERIOD_CLOSE_TIME

    parsed_close_time = serializers.TimeField().to_internal_value(raw_close_time)
    if getattr(parsed_close_time, 'tzinfo', None) is not None:
        return parsed_close_time.replace(tzinfo=None)
    return parsed_close_time


class PeriodSerializer(serializers.ModelSerializer):
    ledger_count = serializers.SerializerMethodField()
    start_date = FlexibleDateTimeField(default_time=time.min)
    end_date = FlexibleDateTimeField(default_time=_serializer_close_time)
    close_time = serializers.TimeField(write_only=True, required=False)

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
            'close_time',
        ]
        read_only_fields = ['closed_at', 'created_at', 'ledger_count']

    def get_ledger_count(self, obj):
        return obj.ledgers.filter(is_capacity_reserve=False).count()

    def validate(self, attrs):
        attrs = super().validate(attrs)
        attrs.pop('close_time', None)
        should_be_open = attrs.get('is_open', getattr(self.instance, 'is_open', True))
        if should_be_open and Period.objects.exclude(pk=getattr(self.instance, 'pk', None)).filter(is_open=True).exists():
            raise serializers.ValidationError({
                'is_open': ['Close the active period before opening another one.'],
            })
        return attrs


class LedgerSerializer(serializers.ModelSerializer):
    period_name = serializers.CharField(source='period.name', read_only=True, allow_null=True)
    owner_username = serializers.CharField(source='owner.username', read_only=True, allow_null=True)
    end_date = FlexibleDateTimeField(default_time=_serializer_close_time, required=False)
    close_time = serializers.TimeField(write_only=True, required=False)
    is_capacity_reserve = serializers.BooleanField(read_only=True)

    class Meta:
        model = Ledger
        fields = [
            'id',
            'period',
            'period_name',
            'owner_username',
            'name',
            'end_date',
            'limit_per_identifier',
            'priority',
            'is_active',
            'is_capacity_reserve',
            'closed_at',
            'created_at',
            'close_time',
        ]

    def validate_period(self, value):
        if value and not value.is_open:
            raise serializers.ValidationError("Cannot assign a ledger to a closed period.")
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)

        if self.instance and self.instance.is_capacity_reserve:
            raise serializers.ValidationError({
                'detail': 'The reserve ledger is managed automatically and cannot be edited here.',
            })

        period = attrs.get('period', getattr(self.instance, 'period', None))
        priority = attrs.get('priority', getattr(self.instance, 'priority', None))
        is_active = attrs.get('is_active', getattr(self.instance, 'is_active', True))
        close_time = attrs.pop('close_time', None)
        owner = getattr(self.instance, 'owner', None) or self.context['request'].user

        if 'end_date' not in attrs and period:
            if close_time:
                attrs['end_date'] = _aware_datetime_from_date(period.end_date.date(), close_time)
            else:
                attrs['end_date'] = period.end_date

        if 'end_date' not in attrs:
            raise serializers.ValidationError({'end_date': 'This field is required.'})

        if period and priority is not None and is_active:
            conflicting_ledgers = Ledger.objects.filter(
                period=period,
                owner=owner,
                is_active=True,
                priority=priority,
                is_capacity_reserve=False,
            )
            if self.instance:
                conflicting_ledgers = conflicting_ledgers.exclude(pk=self.instance.pk)
            if conflicting_ledgers.exists():
                raise serializers.ValidationError({
                    'priority': 'An active ledger with this priority already exists in the selected period.'
                })

        return attrs


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
            'is_refunded',
            'refunded_at',
            'total_amount',
            'transaction_count',
        ]
        read_only_fields = [
            'ticket_number',
            'created_at',
            'is_refunded',
            'refunded_at',
            'total_amount',
            'transaction_count',
        ]


class IdentifierSerializer(serializers.ModelSerializer):
    current_utilization = serializers.SerializerMethodField()
    remaining_capacity = serializers.SerializerMethodField()
    current_overflow_amount = serializers.SerializerMethodField()
    total_overflow_amount = serializers.SerializerMethodField()
    confirmed_overflow_amount = serializers.SerializerMethodField()

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

    def _request_user(self):
        request = self.context.get('request')
        if request and request.user and request.user.is_authenticated:
            return request.user
        return None

    def get_current_utilization(self, obj):
        user = self._request_user()
        allocated = LedgerAllocation.objects.filter(
            transaction__identifier=obj,
            transaction__created_by=user,
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
        overflow_total = Overflow.objects.filter(
            transaction__identifier=obj,
            transaction__created_by=user,
        ).aggregate(total=Sum('excess_amount'))['total'] or Decimal('0.00')
        return allocated + overflow_total

    def get_remaining_capacity(self, obj):
        user = self._request_user()
        open_period = Period.get_open_period()
        if user is None or open_period is None:
            return Decimal('0.00')

        total_limit = Ledger.objects.filter(
            owner=user,
            is_active=True,
            period=open_period,
            is_capacity_reserve=False,
        ).aggregate(total=Sum('limit_per_identifier'))['total'] or Decimal('0.00')

        normal_usage = LedgerAllocation.objects.filter(
            transaction__identifier=obj,
            transaction__created_by=user,
            ledger__period=open_period,
            ledger__is_active=True,
            ledger__is_capacity_reserve=False,
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')

        reserve_granted = IdentifierCapacityAdjustment.objects.filter(
            identifier=obj,
            period=open_period,
            owner=user,
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')

        reserve_used = LedgerAllocation.objects.filter(
            transaction__identifier=obj,
            transaction__created_by=user,
            ledger__period=open_period,
            ledger__is_capacity_reserve=True,
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')

        return total_limit + reserve_granted - normal_usage - reserve_used

    def get_current_overflow_amount(self, obj):
        user = self._request_user()
        return Overflow.objects.filter(
            transaction__identifier=obj,
            transaction__created_by=user,
            status='TCSO'
        ).aggregate(total=Sum('excess_amount'))['total'] or Decimal('0.00')

    def get_confirmed_overflow_amount(self, obj):
        user = self._request_user()
        return Overflow.objects.filter(
            transaction__identifier=obj,
            transaction__created_by=user,
            status='CSO'
        ).aggregate(total=Sum('excess_amount'))['total'] or Decimal('0.00')

    def get_total_overflow_amount(self, obj):
        user = self._request_user()
        return Overflow.objects.filter(
            transaction__identifier=obj,
            transaction__created_by=user,
        ).aggregate(total=Sum('excess_amount'))['total'] or Decimal('0.00')


class LedgerAllocationSerializer(serializers.ModelSerializer):
    ledger_name = serializers.CharField(source='ledger.name', read_only=True)

    class Meta:
        model = LedgerAllocation
        fields = ['id', 'ledger', 'ledger_name', 'amount']


class OverflowSerializer(serializers.ModelSerializer):
    class Meta:
        model = Overflow
        fields = '__all__'


class CollaboratorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Collaborator
        fields = ['id', 'username', 'full_name', 'email', 'phone_number']


class CollaboratorManageSerializer(serializers.ModelSerializer):
    class Meta:
        model = Collaborator
        fields = ['id', 'username', 'full_name', 'email', 'phone_number']

    def validate_username(self, value):
        owner = self.context['request'].user
        queryset = Collaborator.objects.filter(owner=owner, username=value)
        if self.instance is not None:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError('A collaborator with this username already exists.')
        return value

    def validate_email(self, value):
        return value

    def create(self, validated_data):
        validated_data['owner'] = self.context['request'].user
        return super().create(validated_data)


class OverflowNotificationSerializer(serializers.ModelSerializer):
    overflow_id = serializers.IntegerField(read_only=True)
    order_number = serializers.CharField(source='overflow.transaction.order_number', read_only=True)
    identifier_number = serializers.CharField(source='overflow.transaction.identifier.number', read_only=True)

    class Meta:
        model = OverflowNotification
        fields = [
            'id',
            'overflow_id',
            'period',
            'notification_type',
            'message',
            'created_at',
            'order_number',
            'identifier_number',
        ]


class TransactionSerializer(serializers.ModelSerializer):
    allocations = LedgerAllocationSerializer(many=True, read_only=True)
    overflows = OverflowSerializer(many=True, read_only=True)
    identifier_number = serializers.CharField(source='identifier.number', read_only=True)
    ticket_number = serializers.CharField(source='ticket.ticket_number', read_only=True, allow_null=True)
    manual_allocations = serializers.JSONField(write_only=True, required=False)
    allow_overflow = serializers.BooleanField(write_only=True, required=False, default=True)
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
            'is_refunded',
            'refunded_at',
            'manual_allocations',
            'allow_overflow',
            'allocations',
            'overflows',
        ]
        read_only_fields = [
            'order_number',
            'timestamp',
            'created_by',
            'ticket_number',
            'is_refunded',
            'refunded_at',
            'allocations',
            'overflows',
        ]

    def validate(self, attrs):
        attrs = super().validate(attrs)
        attrs.pop('manual_allocations', None)
        attrs.pop('allow_overflow', None)

        open_period = Period.get_open_period()
        if not open_period:
            raise serializers.ValidationError("No open period available.")

        if not Ledger.objects.filter(
            is_active=True,
            period=open_period,
            is_capacity_reserve=False,
            owner=self.context['request'].user,
        ).exists():
            raise serializers.ValidationError(
                "No active ledgers available in the current open period."
            )

        ticket = attrs.get('ticket')
        if ticket is not None and ticket.created_by_id != self.context['request'].user.id:
            raise serializers.ValidationError("You can only attach transactions to your own tickets.")

        return attrs


class ProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = Profile
        fields = '__all__'


class UserProfileSerializer(serializers.ModelSerializer):
    role = serializers.SerializerMethodField()
    phone_number = serializers.SerializerMethodField()
    full_name = serializers.SerializerMethodField()
    last_activity = serializers.SerializerMethodField()
    last_login = serializers.DateTimeField(read_only=True)
    date_joined = serializers.DateTimeField(read_only=True)
    avatar_url = serializers.SerializerMethodField()
    has_override_code = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id',
            'username',
            'first_name',
            'last_name',
            'full_name',
            'email',
            'role',
            'phone_number',
            'avatar_url',
            'has_override_code',
            'last_activity',
            'last_login',
            'date_joined',
        ]

    def get_full_name(self, obj):
        return obj.get_full_name().strip()

    def get_role(self, obj):
        profile = getattr(obj, 'profile', None)
        return getattr(profile, 'role', '')

    def get_phone_number(self, obj):
        profile = getattr(obj, 'profile', None)
        return getattr(profile, 'phone_number', '')

    def get_last_activity(self, obj):
        profile = getattr(obj, 'profile', None)
        return getattr(profile, 'last_activity', None)

    def get_has_override_code(self, obj):
        profile = getattr(obj, 'profile', None)
        return bool(getattr(profile, 'master_override_password', ''))

    def get_avatar_url(self, obj):
        profile = getattr(obj, 'profile', None)
        avatar = getattr(profile, 'avatar', None)
        if not avatar:
            return None
        request = self.context.get('request')
        if request is not None:
            return request.build_absolute_uri(avatar.url)
        return avatar.url


class UserProfileUpdateSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=150)
    username = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    phone_number = serializers.CharField(max_length=50, allow_blank=True, required=False)

    def validate_username(self, value):
        normalized = value.strip()
        user = self.context['request'].user
        if User.objects.filter(username__iexact=normalized).exclude(pk=user.pk).exists():
            raise serializers.ValidationError('A user with this username already exists.')
        return normalized

    def validate_full_name(self, value):
        normalized = value.strip()
        if not normalized:
            raise serializers.ValidationError('Full name is required.')
        return normalized

    def validate_email(self, value):
        normalized = value.strip().lower()
        user = self.context['request'].user
        if User.objects.filter(email__iexact=normalized).exclude(pk=user.pk).exists():
            raise serializers.ValidationError('A user with this email already exists.')
        return normalized

    def update(self, instance, validated_data):
        full_name = validated_data['full_name']
        first_name, _, last_name = full_name.partition(' ')
        instance.username = validated_data['username']
        instance.email = validated_data['email']
        instance.first_name = first_name.strip()
        instance.last_name = last_name.strip()
        instance.save(update_fields=['username', 'email', 'first_name', 'last_name'])

        profile, _ = Profile.objects.get_or_create(user=instance)
        profile.phone_number = (validated_data.get('phone_number') or '').strip()
        profile.save(update_fields=['phone_number', 'updated_at'])
        instance.refresh_from_db()
        return instance


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)


class RegisterSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=150)
    username = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    phone_number = serializers.CharField(max_length=50)
    password = serializers.CharField(write_only=True)
    confirm_password = serializers.CharField(write_only=True)

    def validate_username(self, value):
        normalized = value.strip()
        if User.objects.filter(username__iexact=normalized).exists():
            raise serializers.ValidationError('A user with this username already exists.')
        return normalized

    def validate_email(self, value):
        normalized = value.strip().lower()
        if User.objects.filter(email__iexact=normalized).exists():
            raise serializers.ValidationError('A user with this email already exists.')
        return normalized

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if attrs['password'] != attrs['confirm_password']:
            raise serializers.ValidationError({'confirm_password': 'Passwords do not match.'})
        validate_password(attrs['password'])
        return attrs

    def create(self, validated_data):
        full_name = validated_data['full_name'].strip()
        first_name, _, last_name = full_name.partition(' ')
        user = User.objects.create_user(
            username=validated_data['username'],
            email=validated_data['email'],
            password=validated_data['password'],
            first_name=first_name.strip(),
            last_name=last_name.strip(),
        )
        profile, _ = Profile.objects.get_or_create(user=user)
        profile.phone_number = validated_data['phone_number'].strip()
        profile.save(update_fields=['phone_number', 'updated_at'])
        user.refresh_from_db()
        return user


class GoogleLoginSerializer(serializers.Serializer):
    id_token = serializers.CharField(write_only=True)


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True)

    def validate_new_password(self, value):
        validate_password(value)
        return value


class ForgotPasswordSerializer(serializers.Serializer):
    email = serializers.EmailField()


class ResetPasswordConfirmSerializer(serializers.Serializer):
    selector = serializers.UUIDField()
    token = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True)

    def validate_new_password(self, value):
        validate_password(value)
        return value


class UserRoleUpdateSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=Profile.ROLE_CHOICES)
    admin_override_code = serializers.CharField(write_only=True, required=False, allow_blank=True)


class MasterOverridePasswordSerializer(serializers.Serializer):
    master_override_password = serializers.CharField(write_only=True, required=False, allow_blank=True)
    admin_override_code = serializers.CharField(write_only=True, required=False, allow_blank=True)


class AccountDeletionSerializer(serializers.Serializer):
    admin_override_code = serializers.CharField(write_only=True, required=False, allow_blank=True)


class ProfileAvatarSerializer(serializers.Serializer):
    avatar = serializers.ImageField(required=True)


class AuditLogSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)

    class Meta:
        model = AuditLog
        fields = [
            'id',
            'user',
            'username',
            'action',
            'timestamp',
            'ip_address',
            'target_model',
            'target_id',
            'details',
            'changes',
        ]
