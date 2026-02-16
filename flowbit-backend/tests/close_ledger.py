from core.models import Ledger
from django.utils import timezone
from datetime import timedelta

# Create ledger expiring in 8 minutes
end_time = timezone.now() + timedelta(minutes=8)
print(f"Creating ledger expiring at: {end_time.strftime('%H:%M:%S UTC')}")
print(f"Current time: {timezone.now().strftime('%H:%M:%S UTC')}")
print(f"Will expire in 8 minutes")
print(f"Cron should close it within 5 minutes after that (by {(end_time + timedelta(minutes=5)).strftime('%H:%M:%S')})")

Ledger.objects.create(
    name=f"CRON TEST - Expires {end_time.strftime('%H:%M')}",
    end_date=end_time,
    limit_per_identifier=100000,
    priority=99,
    is_active=True
)
print("\n✓ Test ledger created!")
exit()