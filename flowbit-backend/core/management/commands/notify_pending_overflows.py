from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from core.audit import record_system_audit_log
from core.models import Overflow, OverflowNotification, Period, UserNotification, _period_overflow_filter
from core.views import create_user_notification


class Command(BaseCommand):
    help = 'Create notifications for pending TCSO overflows in periods closing within 30 minutes'

    def handle(self, *args, **options):
        now = timezone.now()
        window_end = now + timedelta(minutes=30)

        periods = Period.objects.filter(
            is_open=True,
            end_date__gt=now,
            end_date__lte=window_end,
        ).order_by('end_date')

        created_count = 0
        for period in periods:
            pending_overflows = Overflow.objects.filter(
                _period_overflow_filter(period),
                status=Overflow.STATUS_TCSO,
            ).select_related('transaction__identifier')

            for overflow in pending_overflows:
                _, created = OverflowNotification.objects.get_or_create(
                    overflow=overflow,
                    notification_type=OverflowNotification.TYPE_PRE_CLOSE,
                    defaults={
                        'period': period,
                        'message': (
                            f"Pending overflow for identifier "
                            f"{overflow.transaction.identifier.number} must be resolved "
                            f"before {period.end_date:%Y-%m-%d %H:%M}."
                        ),
                    },
                )
                if created:
                    created_count += 1
                create_user_notification(
                    recipient=overflow.owner,
                    title='Pending spill over before period close',
                    message=(
                        f"Identifier {overflow.transaction.identifier.number} still has pending spill over "
                        f"before {period.end_date:%Y-%m-%d %H:%M}."
                    ),
                    category=UserNotification.CATEGORY_SYSTEM,
                    level=UserNotification.LEVEL_IMPORTANT,
                    action_href='/spill-over',
                    source_key=f'pre-close-overflow:{overflow.id}',
                    period=period,
                )

        self.stdout.write(
            self.style.SUCCESS(f'Created {created_count} pending overflow notification(s)')
        )
        if created_count:
            record_system_audit_log(
                'overflow_notifications.generated',
                details='Generated pre-close overflow notifications',
                changes={'created_count': created_count},
            )
