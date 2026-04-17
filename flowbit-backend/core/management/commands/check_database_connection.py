from django.core.management.base import BaseCommand, CommandError
from django.conf import settings
from django.db import connection

from flowbit_backend.db_config import sanitized_database_summary


class Command(BaseCommand):
    help = "Check the configured database connection and print a sanitized summary."

    def handle(self, *args, **options):
        summary = sanitized_database_summary(settings.DATABASES)
        self.stdout.write("Database configuration:")
        for key, value in summary.items():
            self.stdout.write(f"  {key}: {value}")

        try:
            connection.ensure_connection()
        except Exception as exc:
            raise CommandError(f"Database connection failed: {exc}") from exc

        self.stdout.write(self.style.SUCCESS("Database connection succeeded."))
