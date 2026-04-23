from django.core.management.base import BaseCommand
from django.db import transaction

from core.models import (
    AuditLog,
    Collaborator,
    Identifier,
    IdentifierCapacityAdjustment,
    Ledger,
    LedgerAllocation,
    Overflow,
    OverflowNotification,
    PasswordResetToken,
    Period,
    Ticket,
    Transaction,
)


class Command(BaseCommand):
    help = "Delete all FlowBit operational data while keeping user accounts and profiles."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would be deleted without deleting anything.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        targets = [
            ("overflow_notifications", OverflowNotification),
            ("capacity_adjustments", IdentifierCapacityAdjustment),
            ("ledger_allocations", LedgerAllocation),
            ("overflows", Overflow),
            ("transactions", Transaction),
            ("tickets", Ticket),
            ("collaborators", Collaborator),
            ("ledgers", Ledger),
            ("periods", Period),
            ("identifiers", Identifier),
            ("password_reset_tokens", PasswordResetToken),
            ("audit_logs", AuditLog),
        ]

        counts = {label: model.objects.count() for label, model in targets}
        total = sum(counts.values())

        if dry_run:
            self.stdout.write(self.style.WARNING(f"[DRY RUN] Would delete {total} operational record(s)"))
            for label, _ in targets:
                self.stdout.write(f"  - {label}: {counts[label]}")
            return

        with transaction.atomic():
            for _, model in targets:
                model.objects.all().delete()

        self.stdout.write(self.style.SUCCESS(f"Deleted {total} operational record(s)"))
        for label, _ in targets:
            self.stdout.write(f"  - {label}: {counts[label]}")
