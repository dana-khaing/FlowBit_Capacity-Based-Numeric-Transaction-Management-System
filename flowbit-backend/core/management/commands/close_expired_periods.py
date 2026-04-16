from django.core.management.base import BaseCommand
from django.utils import timezone

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

        expired_periods = Period.objects.filter(
            is_open=True,
            end_date__lte=now,
        ).order_by('end_date')

        if not expired_periods.exists():
            self.stdout.write(self.style.SUCCESS('No expired periods found'))
            return

        if dry_run:
            self.stdout.write(
                self.style.WARNING(f'[DRY RUN] Would close {expired_periods.count()} period(s)')
            )
            for period in expired_periods:
                self.stdout.write(f'  - {period.name} ({period.end_date:%Y-%m-%d %H:%M:%S})')
            return

        for period in expired_periods:
            period.close(closed_at=now, helper_name=DEFAULT_HELPER_NAME)
            self.stdout.write(
                self.style.SUCCESS(
                    f"Closed period '{period.name}' and archived {period.ledgers.filter(is_capacity_reserve=False).count()} ledger(s)"
                )
            )
