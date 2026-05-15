"""
Apply due pre-close transitions, then close expired periods and their active ledgers.

Recommended scheduler:
    */5 * * * * cd /path/to/project && /path/to/venv/bin/python manage.py close_expired_periods >> /var/log/period_close.log 2>&1
"""

from django.core.management.base import BaseCommand
from django.utils import timezone

from core.audit import record_system_audit_log, serialize_audit_value
from core.models import DEFAULT_HELPER_NAME, Period


class Command(BaseCommand):
    help = 'Close all open periods that have passed their end_date time'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be closed without actually closing',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        now = timezone.now()

        due_pre_close_periods = [
            period
            for period in Period.objects.filter(is_open=True, pre_closed_at__isnull=True).order_by('end_date')
            if period.pre_close_at <= now
        ]

        expired_periods = Period.objects.filter(
            is_open=True,
            end_date__lte=now,
        ).order_by('end_date')

        if not due_pre_close_periods and not expired_periods.exists():
            self.stdout.write(self.style.SUCCESS('No due pre-close or expired periods found'))
            return

        if dry_run:
            if due_pre_close_periods:
                self.stdout.write(
                    self.style.WARNING(f'[DRY RUN] Would pre-close {len(due_pre_close_periods)} period(s)')
                )
                for period in due_pre_close_periods:
                    self.stdout.write(f'  - {period.name} ({period.pre_close_at:%Y-%m-%d %H:%M:%S})')
            self.stdout.write(
                self.style.WARNING(f'[DRY RUN] Would close {expired_periods.count()} period(s)')
            )
            for period in expired_periods:
                self.stdout.write(f'  - {period.name} ({period.end_date:%Y-%m-%d %H:%M:%S})')
            return

        for period in due_pre_close_periods:
            period.apply_pre_close(triggered_at=period.pre_close_at, helper_name=DEFAULT_HELPER_NAME)
            record_system_audit_log(
                'period.pre_closed',
                target=period,
                details=f"Applied pre-close for period '{period.name}'",
                changes={
                    'pre_closed_at': serialize_audit_value(period.pre_close_at),
                    'closed_ledgers': period.ledgers.filter(is_capacity_reserve=False).count(),
                },
            )
            self.stdout.write(
                self.style.SUCCESS(
                    f"Applied pre-close for period '{period.name}'"
                )
            )

        for period in expired_periods:
            period.close(closed_at=now, helper_name=DEFAULT_HELPER_NAME)
            record_system_audit_log(
                'period.auto_closed',
                target=period,
                details=f"Auto-closed period '{period.name}'",
                changes={
                    'closed_at': serialize_audit_value(now),
                    'closed_ledgers': period.ledgers.filter(is_capacity_reserve=False).count(),
                },
            )
            self.stdout.write(
                self.style.SUCCESS(
                    f"Closed period '{period.name}' and archived {period.ledgers.filter(is_capacity_reserve=False).count()} ledger(s)"
                )
            )
