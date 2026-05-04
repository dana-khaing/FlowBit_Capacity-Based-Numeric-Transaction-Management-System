"""
Improved Django management command for auto-closing ledgers at exact times

This command:
1. Closes ledgers that have passed their end_date
2. Respects the EXACT time in end_date (not just the date)
3. Safe to run frequently (every 5 minutes)
4. Won't close the same ledger twice

Usage:
    python manage.py close_expired_ledgers

Recommended Cron Setup:
    # Check every 5 minutes
    */5 * * * * cd /path/to/project && /path/to/venv/bin/python manage.py close_expired_ledgers >> /var/log/ledger_close.log 2>&1
"""

from django.core.management.base import BaseCommand
from django.utils import timezone
from core.audit import record_system_audit_log, serialize_audit_value
from core.models import Ledger
from datetime import datetime


class Command(BaseCommand):
    help = 'Close all ledgers that have passed their end_date time'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be closed without actually closing',
        )
        parser.add_argument(
            '--verbose',
            action='store_true',
            help='Show detailed output including current time',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        verbose = options['verbose']
        
        now = timezone.now()

        if verbose:
            self.stdout.write(f'Current time: {now.strftime("%Y-%m-%d %H:%M:%S %Z")}')
            self.stdout.write('')

        # Find expired ledgers (end_date is in the past)
        expired_ledgers = Ledger.objects.filter(
            is_active=True,
            end_date__lte=now  # Less than or equal to current time
        ).order_by('end_date')

        count = expired_ledgers.count()

        if count == 0:
            if verbose:
                self.stdout.write(self.style.SUCCESS('✓ No expired ledgers found'))
                
                # Show upcoming closings
                upcoming = Ledger.objects.filter(
                    is_active=True,
                    end_date__gt=now
                ).order_by('end_date')[:5]
                
                if upcoming.exists():
                    self.stdout.write('')
                    self.stdout.write('Upcoming ledger closings:')
                    for ledger in upcoming:
                        time_until = ledger.end_date - now
                        days = time_until.days
                        hours = time_until.seconds // 3600
                        minutes = (time_until.seconds % 3600) // 60
                        
                        self.stdout.write(
                            f'  • {ledger.name} - closes in {days}d {hours}h {minutes}m '
                            f'({ledger.end_date.strftime("%Y-%m-%d %H:%M")})'
                        )
            return

        if dry_run:
            self.stdout.write(
                self.style.WARNING(f'[DRY RUN] Would close {count} ledger(s):')
            )
            for ledger in expired_ledgers:
                time_expired = now - ledger.end_date
                hours_ago = time_expired.total_seconds() / 3600
                
                self.stdout.write(
                    f'  • {ledger.name} (ID: {ledger.id})\n'
                    f'    End Date: {ledger.end_date.strftime("%Y-%m-%d %H:%M:%S")}\n'
                    f'    Expired: {hours_ago:.1f} hours ago'
                )
        else:
            closed_names = []
            for ledger in expired_ledgers:
                time_expired = now - ledger.end_date
                hours_ago = time_expired.total_seconds() / 3600
                
                ledger.close(closed_at=now)
                record_system_audit_log(
                    'ledger.auto_closed',
                    target=ledger,
                    details=f"Auto-closed ledger '{ledger.name}'",
                    changes={
                        'closed_at': serialize_audit_value(now),
                        'period_id': ledger.period_id,
                    },
                )
                closed_names.append(ledger.name)
                
                self.stdout.write(
                    self.style.SUCCESS(
                        f'✓ Closed: {ledger.name} (ID: {ledger.id})\n'
                        f'  End Date: {ledger.end_date.strftime("%Y-%m-%d %H:%M:%S")}\n'
                        f'  Expired: {hours_ago:.1f} hours ago'
                    )
                )

            self.stdout.write('')
            self.stdout.write(
                self.style.SUCCESS(f'✓ Successfully closed {count} ledger(s)')
            )
            
            # Log the closure
            self._log_closure(closed_names, now)

    def _log_closure(self, ledger_names, timestamp):
        """Optional: Log closures to file for audit trail"""
        try:
            import os
            log_dir = '/tmp'
            
            log_file = os.path.join(log_dir, 'ledger_closures.log')
            
            with open(log_file, 'a') as f:
                f.write(f'{timestamp.isoformat()} - Closed {len(ledger_names)} ledgers: {", ".join(ledger_names)}\n')
        except Exception as e:
            # Don't fail if logging fails
            self.stdout.write(
                self.style.WARNING(f'Warning: Could not write to log file: {e}')
            )
