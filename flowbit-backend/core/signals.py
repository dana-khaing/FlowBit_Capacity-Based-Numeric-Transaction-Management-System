from django.db.models.signals import post_save
from django.dispatch import receiver
from django.contrib.auth.models import User

from .models import Ledger, Identifier, Profile

@receiver(post_save, sender=Ledger)
def create_identifiers_on_first_ledger(sender, instance, created, **kwargs):
    """
    When the VERY FIRST Ledger is created, populate all 000–999 identifiers.
    """
    if not created:
        return  # only on create, not on update

    # Check if this is the first ledger ever
    if Ledger.objects.count() == 1:  # just created one, so total is 1
        print("First Ledger detected → Creating all 000–999 identifiers...")

        identifiers_to_create = []
        for i in range(1000):  # 0 to 999
            num_str = f"{i:03d}"  # '000', '001', ..., '999'
            identifiers_to_create.append(Identifier(number=num_str))

        # Bulk create for performance (much faster than 1000 individual saves)
        Identifier.objects.bulk_create(identifiers_to_create, ignore_conflicts=True)

        print(f"Created {len(identifiers_to_create)} identifiers (000–999)")


@receiver(post_save, sender=User)
def create_profile_for_user(sender, instance, created, **kwargs):
    if created:
        Profile.objects.get_or_create(user=instance)
