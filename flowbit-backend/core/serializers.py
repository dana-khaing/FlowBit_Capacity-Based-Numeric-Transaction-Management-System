from datetime import datetime, time

from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
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
    Ticket,
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
        return attrs


class LedgerSerializer(serializers.ModelSerializer):
    period_name = serializers.CharField(source='period.name', read_only=True, allow_null=True)
    end_date = FlexibleDateTimeField(default_time=_serializer_close_time, required=False)
    close_time = serializers.TimeField(write_only=True, required=False)

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
            'close_time',
        ]

    def validate_period(self, value):
        if value and not value.is_open:
            raise serializers.ValidationError("Cannot assign a ledger to a closed period.")
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)

        period = attrs.get('period', getattr(self.instance, 'period', None))
        priority = attrs.get('priority', getattr(self.instance, 'priority', None))
        is_active = attrs.get('is_active', getattr(self.instance, 'is_active', True))
        close_time = attrs.pop('close_time', None)

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


class CollaboratorSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'username', 'first_name', 'last_name', 'full_name']

    def get_full_name(self, obj):
        return obj.get_full_name().strip()


class CollaboratorManageSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)
    full_name = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = User
        fields = ['id', 'username', 'first_name', 'last_name', 'email', 'password', 'full_name']

    def get_full_name(self, obj):
        return obj.get_full_name().strip()

    def validate_username(self, value):
        queryset = User.objects.filter(username=value)
        if self.instance is not None:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError('A user with this username already exists.')
        return value

    def validate_email(self, value):
        if not value:
            return value
        queryset = User.objects.filter(email__iexact=value)
        if self.instance is not None:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError('A user with this email already exists.')
        return value

    def create(self, validated_data):
        password = validated_data.pop('password', '')
        user = User(**validated_data)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        if password is not None:
            if password:
                instance.set_password(password)
            else:
                instance.set_unusable_password()
        instance.save()
        return instance


class OverflowNotificationSerializer(serializers.ModelSerializer):
    overflow_id = serializers.IntegerField(source='overflow_id', read_only=True)
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
        ).exists():
            raise serializers.ValidationError(
                "No active ledgers available in the current open period."
            )

        return attrs


class ProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = Profile
        fields = '__all__'


class UserProfileSerializer(serializers.ModelSerializer):
    role = serializers.CharField(source='profile.role', read_only=True)

    class Meta:
        model = User
        fields = ['id', 'username', 'first_name', 'last_name', 'email', 'role']


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)


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


class MasterOverridePasswordSerializer(serializers.Serializer):
    master_override_password = serializers.CharField(write_only=True, required=False, allow_blank=True)


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
