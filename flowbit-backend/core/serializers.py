from datetime import datetime, time
from decimal import Decimal
from itertools import permutations

from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.db.models import Sum
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from rest_framework import serializers
from .models import (
    Period,
    LuckyDraw,
    Ledger,
    Identifier,
    IdentifierLedgerFreeze,
    Transaction,
    LedgerAllocation,
    Overflow,
    OverflowNotification,
    UserNotification,
    AuditLog,
    Profile,
    PasswordResetToken,
    Collaborator,
    Ticket,
    RepeatTicket,
    RepeatTicketItem,
    RepeatTicketGeneration,
    IdentifierCapacityAdjustment,
    SupportCase,
    SupportMessage,
    _from_allocation_basis_amount,
)


DEFAULT_PERIOD_CLOSE_TIME = time(hour=23, minute=0)
DEFAULT_LEDGER_CLOSE_TIME = time(hour=14, minute=30)


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


def _serializer_ledger_close_time(field):
    serializer = field.parent
    raw_close_time = serializer.initial_data.get('close_time') if serializer and serializer.initial_data else None
    if not raw_close_time:
        return DEFAULT_LEDGER_CLOSE_TIME

    parsed_close_time = serializers.TimeField().to_internal_value(raw_close_time)
    if getattr(parsed_close_time, 'tzinfo', None) is not None:
        return parsed_close_time.replace(tzinfo=None)
    return parsed_close_time


class PeriodSerializer(serializers.ModelSerializer):
    ledger_count = serializers.SerializerMethodField()
    lucky_draw_display = serializers.SerializerMethodField()
    lucky_draw_revealed = serializers.SerializerMethodField()
    lucky_draw_announced_at = serializers.SerializerMethodField()
    pre_close_at = serializers.SerializerMethodField()
    pre_close_time = serializers.TimeField(required=False)
    lucky_draw_reveal_at = serializers.SerializerMethodField()
    lucky_draw_reveal_time = serializers.TimeField(required=False)
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
            'pre_closed_at',
            'created_at',
            'ledger_count',
            'lucky_draw_display',
            'lucky_draw_revealed',
            'lucky_draw_announced_at',
            'pre_close_at',
            'pre_close_time',
            'lucky_draw_reveal_at',
            'lucky_draw_reveal_time',
            'close_time',
        ]
        read_only_fields = ['closed_at', 'created_at', 'ledger_count']

    def get_ledger_count(self, obj):
        return obj.ledgers.filter(is_capacity_reserve=False).count()

    def get_lucky_draw_display(self, obj):
        lucky_draw = getattr(obj, 'lucky_draw', None)
        if lucky_draw is None:
            return "***-***"
        return lucky_draw.display_number()

    def get_lucky_draw_revealed(self, obj):
        lucky_draw = getattr(obj, 'lucky_draw', None)
        if lucky_draw is None:
            return False
        return lucky_draw.is_revealed()

    def get_lucky_draw_announced_at(self, obj):
        lucky_draw = getattr(obj, 'lucky_draw', None)
        return lucky_draw.announced_at if lucky_draw is not None else None

    def get_pre_close_at(self, obj):
        return obj.pre_close_at

    def get_lucky_draw_reveal_at(self, obj):
        return obj.lucky_draw_reveal_at

    def validate(self, attrs):
        attrs = super().validate(attrs)
        attrs.pop('close_time', None)
        end_date = attrs.get('end_date', getattr(self.instance, 'end_date', None))
        pre_close_time = attrs.get('pre_close_time', getattr(self.instance, 'pre_close_time', time(hour=15, minute=30)))
        if end_date is not None and pre_close_time is not None:
            period_close_time = end_date.astimezone(timezone.get_current_timezone()).time().replace(tzinfo=None)
            if pre_close_time >= period_close_time:
                raise serializers.ValidationError({
                    'pre_close_time': ['Pre-close time must be earlier than the period close time.'],
                })
        should_be_open = attrs.get('is_open', getattr(self.instance, 'is_open', True))
        if should_be_open and Period.objects.exclude(pk=getattr(self.instance, 'pk', None)).filter(is_open=True).exists():
            raise serializers.ValidationError({
                'is_open': ['Close the active period before opening another one.'],
            })
        return attrs


class LedgerSerializer(serializers.ModelSerializer):
    period_name = serializers.CharField(source='period.name', read_only=True, allow_null=True)
    owner_username = serializers.CharField(source='owner.username', read_only=True, allow_null=True)
    end_date = FlexibleDateTimeField(default_time=_serializer_ledger_close_time, required=False)
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


class LuckyDrawSerializer(serializers.ModelSerializer):
    display_number = serializers.SerializerMethodField()
    winning_identifiers = serializers.SerializerMethodField()
    period_name = serializers.CharField(source='period.name', read_only=True)
    announced_by_username = serializers.CharField(source='announced_by.username', read_only=True, allow_null=True)

    class Meta:
        model = LuckyDraw
        fields = [
            'id',
            'period',
            'period_name',
            'number',
            'display_number',
            'winning_identifiers',
            'announced_by',
            'announced_by_username',
            'announced_at',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'period',
            'period_name',
            'display_number',
            'winning_identifiers',
            'announced_by',
            'announced_by_username',
            'announced_at',
            'created_at',
            'updated_at',
        ]

    def get_display_number(self, obj):
        return obj.display_number()

    def get_winning_identifiers(self, obj):
        return obj.winning_identifiers

    def validate_number(self, value):
        digits = ''.join(char for char in str(value) if char.isdigit())
        if len(digits) != 6:
            raise serializers.ValidationError("Lucky draw number must be exactly 6 digits.")
        return digits


class TicketSerializer(serializers.ModelSerializer):
    total_amount = serializers.SerializerMethodField()
    transaction_count = serializers.SerializerMethodField()
    created_by_username = serializers.CharField(source='created_by.username', read_only=True, default=None)
    identifier_numbers = serializers.SerializerMethodField()
    has_spill_over = serializers.SerializerMethodField()
    active_spill_over_count = serializers.SerializerMethodField()
    refunded_spill_over_count = serializers.SerializerMethodField()
    refunded_transaction_count = serializers.SerializerMethodField()
    repeat_ticket_id = serializers.SerializerMethodField()

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
            'identifier_numbers',
            'has_spill_over',
            'active_spill_over_count',
            'refunded_spill_over_count',
            'refunded_transaction_count',
            'repeat_ticket_id',
        ]
        read_only_fields = [
            'ticket_number',
            'created_at',
            'is_refunded',
            'refunded_at',
            'total_amount',
            'transaction_count',
            'identifier_numbers',
            'has_spill_over',
        ]

    def _get_transactions(self, obj):
        prefetched_transactions = getattr(obj, '_prefetched_objects_cache', {}).get('transactions')
        if prefetched_transactions is not None:
            return list(prefetched_transactions)
        return list(
            obj.transactions.select_related('identifier').prefetch_related('overflows').all()
        )

    def _get_overflows(self, obj):
        overflows = []
        for transaction in self._get_transactions(obj):
            prefetched_overflows = getattr(transaction, '_prefetched_objects_cache', {}).get('overflows')
            if prefetched_overflows is not None:
                overflows.extend(prefetched_overflows)
            else:
                overflows.extend(transaction.overflows.all())
        return overflows

    def get_total_amount(self, obj):
        visible_total = Decimal('0.00')
        refunded_overflow_total = Decimal('0.00')

        transactions = self._get_transactions(obj)
        for transaction in transactions:
            if transaction.is_refunded:
                continue
            visible_total += transaction.total_amount

        for overflow in self._get_overflows(obj):
            transaction = getattr(overflow, 'transaction', None)
            if transaction is None or transaction.is_refunded:
                continue
            if overflow.status == Overflow.STATUS_REFUNDED:
                refunded_overflow_total += overflow.refund_amount or Decimal('0.00')

        active_total = visible_total - _from_allocation_basis_amount(refunded_overflow_total)
        if active_total < Decimal('0.00'):
            return Decimal('0.00')
        return active_total

    def get_transaction_count(self, obj):
        annotated_count = getattr(obj, 'ticket_transaction_count', None)
        if annotated_count is not None:
            return annotated_count
        return len(self._get_transactions(obj))

    def get_identifier_numbers(self, obj):
        seen_numbers = set()
        ordered_numbers = []
        for transaction in sorted(self._get_transactions(obj), key=lambda item: item.id):
            identifier_number = transaction.identifier.number
            if identifier_number in seen_numbers:
                continue
            seen_numbers.add(identifier_number)
            ordered_numbers.append(identifier_number)
        return ordered_numbers

    def get_has_spill_over(self, obj):
        active_count = getattr(obj, 'active_spill_over_count_annotated', None)
        if active_count is not None:
            return active_count > 0
        return any(
            overflow.status != Overflow.STATUS_REFUNDED
            for overflow in self._get_overflows(obj)
        )

    def get_active_spill_over_count(self, obj):
        annotated_count = getattr(obj, 'active_spill_over_count_annotated', None)
        if annotated_count is not None:
            return annotated_count
        return sum(
            1 for overflow in self._get_overflows(obj)
            if overflow.status != Overflow.STATUS_REFUNDED
        )

    def get_refunded_spill_over_count(self, obj):
        annotated_count = getattr(obj, 'refunded_spill_over_count_annotated', None)
        if annotated_count is not None:
            return annotated_count
        return sum(
            1 for overflow in self._get_overflows(obj)
            if overflow.status == Overflow.STATUS_REFUNDED
        )

    def get_refunded_transaction_count(self, obj):
        annotated_count = getattr(obj, 'refunded_transaction_count_annotated', None)
        if annotated_count is not None:
            return annotated_count
        return sum(1 for transaction in self._get_transactions(obj) if transaction.is_refunded)

    def get_repeat_ticket_id(self, obj):
        try:
            repeat_generation = obj.repeat_generation
        except RepeatTicketGeneration.DoesNotExist:
            repeat_generation = None
        if repeat_generation is not None:
            return repeat_generation.repeat_ticket_id
        generation = RepeatTicketGeneration.objects.filter(ticket=obj).only('repeat_ticket_id').first()
        return generation.repeat_ticket_id if generation else None


class RepeatTicketItemSerializer(serializers.ModelSerializer):
    identifier = serializers.PrimaryKeyRelatedField(queryset=Identifier.objects.all(), required=False)
    identifier_number = serializers.CharField(required=False)

    class Meta:
        model = RepeatTicketItem
        fields = [
            'id',
            'identifier',
            'identifier_number',
            'amount',
            'amount_uses_allocation_basis',
            'use_permutations',
            'position',
        ]

    def validate(self, attrs):
        attrs = super().validate(attrs)
        identifier = attrs.get('identifier')
        identifier_number = attrs.get('identifier_number')

        if identifier is None:
            normalized_identifier_number = ''.join(ch for ch in str(identifier_number or '') if ch.isdigit())
            if not normalized_identifier_number:
                raise serializers.ValidationError({'identifier_number': 'Identifier number is required.'})
            normalized_identifier_number = normalized_identifier_number[-3:].zfill(3)
            Identifier.ensure_default_numbers()
            identifier = Identifier.objects.filter(number=normalized_identifier_number).first()
            if identifier is None:
                raise serializers.ValidationError({'identifier_number': 'Choose a valid identifier.'})
            attrs['identifier'] = identifier
            attrs['identifier_number'] = normalized_identifier_number

        return attrs

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['identifier_number'] = instance.identifier.number
        return data


class RepeatTicketSerializer(serializers.ModelSerializer):
    items = RepeatTicketItemSerializer(many=True)
    repeat_code = serializers.SerializerMethodField()
    current_status = serializers.SerializerMethodField()
    generated_ticket_id = serializers.SerializerMethodField()
    generated_ticket_number = serializers.SerializerMethodField()
    generation_error = serializers.SerializerMethodField()
    item_count = serializers.SerializerMethodField()
    total_amount = serializers.SerializerMethodField()

    class Meta:
        model = RepeatTicket
        fields = [
            'id',
            'repeat_code',
            'customer_name',
            'notes',
            'version',
            'created_at',
            'updated_at',
            'current_status',
            'generated_ticket_id',
            'generated_ticket_number',
            'generation_error',
            'item_count',
            'total_amount',
            'items',
        ]
        read_only_fields = [
            'version',
            'created_at',
            'updated_at',
            'repeat_code',
            'current_status',
            'generated_ticket_id',
            'generated_ticket_number',
            'generation_error',
            'item_count',
            'total_amount',
        ]

    def _active_period(self):
        return self.context.get('active_period')

    def _generation(self, obj):
        period = self._active_period()
        if period is None:
            return None
        prefetched_generations = getattr(obj, '_prefetched_objects_cache', {}).get('generations')
        if prefetched_generations is not None:
            for generation in prefetched_generations:
                if generation.period_id == period.id:
                    return generation
            return None
        return obj.generations.filter(period=period).select_related('ticket').first()

    def get_current_status(self, obj):
        return obj.current_status_for_period(self._active_period())

    def get_repeat_code(self, obj):
        return obj.repeat_code

    def get_generated_ticket_id(self, obj):
        generation = self._generation(obj)
        return generation.ticket_id if generation and generation.ticket_id else None

    def get_generated_ticket_number(self, obj):
        generation = self._generation(obj)
        if generation and generation.ticket_id and generation.ticket:
            return generation.ticket.ticket_number
        return None

    def get_generation_error(self, obj):
        generation = self._generation(obj)
        if generation and generation.status == RepeatTicketGeneration.STATUS_UNSUCCESSFUL:
            return generation.failure_message
        return None

    def get_item_count(self, obj):
        prefetched_items = getattr(obj, '_prefetched_objects_cache', {}).get('items')
        if prefetched_items is not None:
            return len(prefetched_items)
        return obj.items.count()

    def get_total_amount(self, obj):
        prefetched_items = getattr(obj, '_prefetched_objects_cache', {}).get('items')
        items = prefetched_items if prefetched_items is not None else obj.items.select_related('identifier').all()
        total = Decimal('0.00')
        for item in items:
            amount = item.amount
            if item.amount_uses_allocation_basis:
                amount = amount / Decimal('1.25')
            multiplier = len({''.join(value) for value in permutations(item.identifier.number)}) if item.use_permutations else 1
            total += amount * Decimal(str(multiplier))
        return total.quantize(Decimal('0.01'))

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError("At least one repeat ticket entry is required.")
        return value

    def create(self, validated_data):
        items_data = validated_data.pop('items', [])
        repeat_ticket = RepeatTicket.objects.create(**validated_data)
        repeat_ticket.assign_serial_number()
        repeat_ticket.save(update_fields=['serial_number'])
        self._replace_items(repeat_ticket, items_data)
        return repeat_ticket

    def update(self, instance, validated_data):
        items_data = validated_data.pop('items', None)
        changed = False
        for field, value in validated_data.items():
            if getattr(instance, field) != value:
                setattr(instance, field, value)
                changed = True
        if changed:
            instance.bump_version(save=False)
            instance.save()
        if items_data is not None:
            self._replace_items(instance, items_data, bump_version=not changed)
        return instance

    def _replace_items(self, repeat_ticket, items_data, bump_version=False):
        repeat_ticket.items.all().delete()
        for index, item_data in enumerate(items_data):
            RepeatTicketItem.objects.create(
                repeat_ticket=repeat_ticket,
                identifier=item_data['identifier'],
                amount=item_data['amount'],
                amount_uses_allocation_basis=item_data.get('amount_uses_allocation_basis', False),
                use_permutations=item_data.get('use_permutations', False),
                position=index,
            )
        if bump_version:
            repeat_ticket.bump_version()


class TicketReceiptPdfSerializer(serializers.Serializer):
    ticket_numbers = serializers.ListField(
        child=serializers.CharField(),
        allow_empty=False,
    )


class TicketRefundActionSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=['refund_ticket', 'refund_transaction'])
    transaction_id = serializers.IntegerField(required=False)
    sync_repeat_ticket = serializers.BooleanField(required=False, default=False)
    cso_refund_mode = serializers.ChoiceField(
        choices=['return_to_tcso', 'refund_spill_over'],
        required=False,
    )
    admin_override_code = serializers.CharField(
        write_only=True,
        required=False,
        allow_blank=True,
    )

    def validate(self, attrs):
        attrs = super().validate(attrs)

        if attrs['action'] == 'refund_transaction' and not attrs.get('transaction_id'):
            raise serializers.ValidationError({
                'transaction_id': 'This field is required for transaction refunds.',
            })

        return attrs


class IdentifierSerializer(serializers.ModelSerializer):
    current_utilization = serializers.SerializerMethodField()
    remaining_capacity = serializers.SerializerMethodField()
    is_frozen_all_ledgers = serializers.SerializerMethodField()
    freeze_status = serializers.SerializerMethodField()
    ledger_capacity_rows = serializers.SerializerMethodField()
    current_overflow_amount = serializers.SerializerMethodField()
    total_overflow_amount = serializers.SerializerMethodField()
    confirmed_overflow_amount = serializers.SerializerMethodField()

    class Meta:
        model = Identifier
        fields = [
            'id', 'number',
            'current_utilization',
            'remaining_capacity',
            'is_frozen_all_ledgers',
            'freeze_status',
            'ledger_capacity_rows',
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

        all_ledgers_frozen = IdentifierLedgerFreeze.objects.filter(
            identifier=obj,
            period=open_period,
            owner=user,
            applies_to_all=True,
        ).exists()

        frozen_ledger_ids = list(
            IdentifierLedgerFreeze.objects.filter(
                identifier=obj,
                period=open_period,
                owner=user,
                applies_to_all=False,
                ledger__isnull=False,
            ).values_list('ledger_id', flat=True)
        )

        usable_standard_ledgers = Ledger.objects.filter(
            owner=user,
            is_active=True,
            period=open_period,
            is_capacity_reserve=False,
        )
        if all_ledgers_frozen:
            usable_standard_ledgers = usable_standard_ledgers.none()
        elif frozen_ledger_ids:
            usable_standard_ledgers = usable_standard_ledgers.exclude(id__in=frozen_ledger_ids)

        total_limit = usable_standard_ledgers.aggregate(total=Sum('limit_per_identifier'))['total'] or Decimal('0.00')

        normal_usage = LedgerAllocation.objects.filter(
            transaction__identifier=obj,
            transaction__created_by=user,
            ledger__period=open_period,
            ledger__is_active=True,
            ledger__is_capacity_reserve=False,
        )
        if all_ledgers_frozen:
            normal_usage = normal_usage.none()
        elif frozen_ledger_ids:
            normal_usage = normal_usage.exclude(ledger_id__in=frozen_ledger_ids)
        normal_usage = normal_usage.aggregate(total=Sum('amount'))['total'] or Decimal('0.00')

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

    def get_is_frozen_all_ledgers(self, obj):
        user = self._request_user()
        open_period = Period.get_open_period()
        if user is None or open_period is None:
            return False

        return IdentifierLedgerFreeze.objects.filter(
            identifier=obj,
            period=open_period,
            owner=user,
            applies_to_all=True,
        ).exists()

    def get_freeze_status(self, obj):
        user = self._request_user()
        open_period = Period.get_open_period()
        if user is None or open_period is None:
            return 'none'

        freeze_rows = IdentifierLedgerFreeze.objects.filter(
            identifier=obj,
            period=open_period,
            owner=user,
        )
        if freeze_rows.filter(applies_to_all=True).exists():
            return 'all'
        if freeze_rows.filter(applies_to_all=False, ledger__isnull=False).exists():
            return 'partial'
        return 'none'

    def get_ledger_capacity_rows(self, obj):
        user = self._request_user()
        open_period = Period.get_open_period()
        if user is None or open_period is None:
            return []

        active_ledgers = list(
            Ledger.objects.filter(
                owner=user,
                is_active=True,
                period=open_period,
            ).order_by('priority', 'id')
        )
        if not active_ledgers:
            return []

        freeze_rows = IdentifierLedgerFreeze.objects.filter(
            identifier=obj,
            period=open_period,
            owner=user,
        )
        all_ledgers_frozen = freeze_rows.filter(applies_to_all=True).exists()
        frozen_ledger_ids = set(
            freeze_rows.filter(applies_to_all=False, ledger__isnull=False).values_list('ledger_id', flat=True)
        )

        allocation_totals = {
            row['ledger_id']: row['total'] or Decimal('0.00')
            for row in LedgerAllocation.objects.filter(
                transaction__identifier=obj,
                transaction__created_by=user,
                ledger__period=open_period,
                ledger__is_active=True,
            )
            .values('ledger_id')
            .annotate(total=Sum('amount'))
        }

        reserve_available = IdentifierCapacityAdjustment.get_available_capacity(
            obj,
            open_period,
            user,
        )
        if reserve_available < Decimal('0.00'):
            reserve_available = Decimal('0.00')

        rows = []
        for ledger in active_ledgers:
            is_reserve = ledger.is_capacity_reserve
            if is_reserve:
                capacity = reserve_available + (allocation_totals.get(ledger.id, Decimal('0.00')) or Decimal('0.00'))
                allocated = allocation_totals.get(ledger.id, Decimal('0.00')) or Decimal('0.00')
                remaining = reserve_available
                is_frozen = False
            else:
                capacity = ledger.limit_per_identifier or Decimal('0.00')
                allocated = allocation_totals.get(ledger.id, Decimal('0.00')) or Decimal('0.00')
                remaining = capacity - allocated
                if remaining < Decimal('0.00'):
                    remaining = Decimal('0.00')
                is_frozen = all_ledgers_frozen or ledger.id in frozen_ledger_ids

            rows.append(
                {
                    'ledger_id': ledger.id,
                    'ledger_name': ledger.name,
                    'priority': ledger.priority,
                    'is_capacity_reserve': ledger.is_capacity_reserve,
                    'total_capacity': str(capacity),
                    'allocated_amount': str(allocated),
                    'remaining_capacity': str(remaining),
                    'is_frozen': is_frozen,
                    'is_full': remaining <= Decimal('0.00'),
                }
            )

        return rows

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
    ticket_number = serializers.SerializerMethodField()
    customer_name = serializers.SerializerMethodField()
    order_number = serializers.SerializerMethodField()
    identifier_number = serializers.SerializerMethodField()
    timestamp = serializers.SerializerMethodField()
    collaborator_names = serializers.SerializerMethodField()
    repeat_ticket_id = serializers.SerializerMethodField()

    class Meta:
        model = Overflow
        fields = [
            'id',
            'transaction',
            'ticket_number',
            'repeat_ticket_id',
            'customer_name',
            'order_number',
            'identifier_number',
            'timestamp',
            'excess_amount',
            'status',
            'amount_to_approve',
            'collaborators',
            'collaborator_names',
            'approved_at',
            'helper_name',
            'resolution_type',
            'refunded_at',
            'refund_amount',
        ]

    def get_collaborator_names(self, obj):
        return [
            collaborator.full_name.strip() or collaborator.username
            for collaborator in obj.collaborators.all()
        ]

    def get_ticket_number(self, obj):
        if obj.status == Overflow.STATUS_OVERKILL or obj.transaction_id is None or obj.transaction.ticket_id is None:
            return None
        return obj.transaction.ticket.ticket_number

    def get_customer_name(self, obj):
        if obj.status == Overflow.STATUS_OVERKILL or obj.transaction_id is None or obj.transaction.ticket_id is None:
            return None
        return obj.transaction.ticket.customer_name

    def get_repeat_ticket_id(self, obj):
        if obj.status == Overflow.STATUS_OVERKILL or obj.transaction_id is None or obj.transaction.ticket_id is None:
            return None
        try:
            repeat_generation = obj.transaction.ticket.repeat_generation
        except RepeatTicketGeneration.DoesNotExist:
            repeat_generation = None
        if repeat_generation is not None:
            return repeat_generation.repeat_ticket_id
        generation = RepeatTicketGeneration.objects.filter(ticket=obj.transaction.ticket).only('repeat_ticket_id').first()
        return generation.repeat_ticket_id if generation else None

    def get_order_number(self, obj):
        if obj.status == Overflow.STATUS_OVERKILL or obj.transaction_id is None:
            return None
        return obj.transaction.order_number

    def get_identifier_number(self, obj):
        if obj.identifier_id:
            return obj.identifier.number
        if obj.transaction_id:
            return obj.transaction.identifier.number
        return ""

    def get_timestamp(self, obj):
        if obj.status == Overflow.STATUS_OVERKILL:
            return obj.approved_at or obj.refunded_at
        if obj.transaction_id is None:
            return obj.approved_at or obj.refunded_at
        return obj.transaction.timestamp


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


class UserNotificationSerializer(serializers.ModelSerializer):
    created_by_display = serializers.SerializerMethodField()
    period_name = serializers.CharField(source='period.name', read_only=True, allow_null=True)
    is_read = serializers.SerializerMethodField()

    class Meta:
        model = UserNotification
        fields = [
            'id',
            'category',
            'level',
            'title',
            'message',
            'action_href',
            'created_by',
            'created_by_display',
            'period',
            'period_name',
            'read_at',
            'is_read',
            'created_at',
        ]
        read_only_fields = fields

    def get_is_read(self, obj):
        return obj.is_read

    def get_created_by_display(self, obj):
        created_by = getattr(obj, 'created_by', None)
        if created_by is None:
            return None

        request = self.context.get('request')
        viewer = getattr(request, 'user', None)
        viewer_profile = getattr(viewer, 'profile', None)
        if viewer_profile and viewer_profile.role == 'admin':
            return created_by.get_full_name().strip() or created_by.username

        profile = getattr(created_by, 'profile', None)
        if profile and profile.role == 'admin':
            return 'Admin'

        return created_by.get_full_name().strip() or created_by.username


class NotificationBroadcastSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=140)
    message = serializers.CharField()
    action_href = serializers.CharField(max_length=255, required=False, allow_blank=True)
    level = serializers.ChoiceField(choices=UserNotification.LEVEL_CHOICES, default=UserNotification.LEVEL_INFO)


class SupportMessageSerializer(serializers.ModelSerializer):
    sender_username = serializers.SerializerMethodField()
    sender_full_name = serializers.SerializerMethodField()
    sender_role = serializers.SerializerMethodField()
    is_admin_sender = serializers.SerializerMethodField()

    class Meta:
        model = SupportMessage
        fields = [
            'id',
            'sender',
            'sender_username',
            'sender_full_name',
            'sender_role',
            'is_admin_sender',
            'body',
            'created_at',
        ]
        read_only_fields = fields

    def get_sender_username(self, obj):
        if obj.sender_id is None:
            return ''
        return obj.sender.username

    def get_sender_full_name(self, obj):
        if obj.sender_id is None:
            return 'Login help requester'
        return obj.sender.get_full_name().strip() or obj.sender.username

    def get_sender_role(self, obj):
        if obj.sender_id is None:
            return ''
        profile = getattr(obj.sender, 'profile', None)
        return getattr(profile, 'role', '')

    def get_is_admin_sender(self, obj):
        profile = getattr(obj.sender, 'profile', None)
        return bool(profile and profile.role == 'admin')


class SupportCaseSerializer(serializers.ModelSerializer):
    created_by_username = serializers.SerializerMethodField()
    created_by_full_name = serializers.SerializerMethodField()
    created_by_role = serializers.SerializerMethodField()
    closed_by_username = serializers.CharField(source='closed_by.username', read_only=True, allow_null=True)
    message_count = serializers.SerializerMethodField()
    last_message_preview = serializers.SerializerMethodField()
    class Meta:
        model = SupportCase
        fields = [
            'id',
            'subject',
            'intake_type',
            'requester_name',
            'requester_login_identifier',
            'status',
            'created_by',
            'created_by_username',
            'created_by_full_name',
            'created_by_role',
            'closed_at',
            'closed_by',
            'closed_by_username',
            'last_message_at',
            'message_count',
            'last_message_preview',
            'created_at',
            'updated_at',
        ]
        read_only_fields = fields

    def get_created_by_username(self, obj):
        if obj.intake_type == SupportCase.INTAKE_LOGIN_HELP:
            return obj.requester_login_identifier or obj.created_by.username
        return obj.created_by.username

    def get_created_by_full_name(self, obj):
        if obj.intake_type == SupportCase.INTAKE_LOGIN_HELP:
            return obj.requester_name or obj.requester_login_identifier or obj.created_by.username
        return obj.created_by.get_full_name().strip() or obj.created_by.username

    def get_created_by_role(self, obj):
        if obj.intake_type == SupportCase.INTAKE_LOGIN_HELP:
            return 'login_help'
        profile = getattr(obj.created_by, 'profile', None)
        return getattr(profile, 'role', '')

    def get_message_count(self, obj):
        annotated_count = getattr(obj, 'message_count_annotated', None)
        if annotated_count is not None:
            return annotated_count
        return obj.messages.count()

    def get_last_message_preview(self, obj):
        last_message = obj.messages.order_by('-created_at', '-id').first()
        return last_message.body[:140] if last_message else ''


class SupportCaseCreateSerializer(serializers.Serializer):
    subject = serializers.CharField(max_length=160)
    message = serializers.CharField()

    def validate_subject(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Subject is required.')
        return value

    def validate_message(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Message is required.')
        return value


class PublicLoginHelpCaseCreateSerializer(serializers.Serializer):
    login_identifier = serializers.CharField(max_length=160)
    requester_name = serializers.CharField(max_length=160, required=False, allow_blank=True)
    subject = serializers.CharField(max_length=160)
    message = serializers.CharField()

    def validate_login_identifier(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Username or email is required.')
        return value

    def validate_requester_name(self, value):
        return value.strip()

    def validate_subject(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Subject is required.')
        return value

    def validate_message(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Message is required.')
        return value


class SupportCaseReplySerializer(serializers.Serializer):
    message = serializers.CharField()

    def validate_message(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Message is required.')
        return value


class SupportCaseDetailSerializer(SupportCaseSerializer):
    messages = SupportMessageSerializer(many=True, read_only=True)

    class Meta(SupportCaseSerializer.Meta):
        fields = SupportCaseSerializer.Meta.fields + ['messages']
        read_only_fields = fields


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


class TicketDetailSerializer(TicketSerializer):
    transactions = TransactionSerializer(many=True, read_only=True)

    class Meta(TicketSerializer.Meta):
        fields = TicketSerializer.Meta.fields + ['transactions']
        read_only_fields = TicketSerializer.Meta.read_only_fields + ['transactions']


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
        version = getattr(profile, 'updated_at', None)
        version_suffix = f"?v={int(version.timestamp())}" if version else ""
        request = self.context.get('request')
        if request is not None:
            return request.build_absolute_uri(f"{avatar.url}{version_suffix}")
        return f"{avatar.url}{version_suffix}"


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
            is_active=False,
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


class EmailVerificationConfirmSerializer(serializers.Serializer):
    selector = serializers.UUIDField()
    token = serializers.CharField(write_only=True)


class ResendVerificationSerializer(serializers.Serializer):
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
