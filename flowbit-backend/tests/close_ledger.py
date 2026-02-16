from core.models import Ledger
from django.utils import timezone
from datetime import timedelta

# Create ledger expiring in 2 minutes
end_time = timezone.now() + timedelta(minutes=2)
ledger = Ledger.objects.create(
    name=f"Test Ledger - Expires at {end_time.strftime('%H:%M')}",
    end_date=end_time,
    limit_per_identifier=100000,
    priority=99,
    is_active=True
)
print(f"Created ledger ID: {ledger.id}")
print(f"Will expire at: {end_time.strftime('%Y-%m-%d %H:%M:%S')}")
exit()