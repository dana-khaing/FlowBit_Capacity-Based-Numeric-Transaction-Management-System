from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def populate_overflow_tracking_fields(apps, schema_editor):
    Overflow = apps.get_model("core", "Overflow")
    Period = apps.get_model("core", "Period")

    for overflow in Overflow.objects.select_related("transaction__identifier", "transaction__created_by").all():
        transaction = overflow.transaction
        if transaction is None:
            continue

        period = (
            Period.objects.filter(
                start_date__lte=transaction.timestamp,
                end_date__gte=transaction.timestamp,
            )
            .order_by("start_date")
            .first()
        )

        overflow.identifier_id = transaction.identifier_id
        overflow.owner_id = transaction.created_by_id
        overflow.period_id = period.id if period else None
        overflow.save(update_fields=["identifier", "owner", "period"])


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0012_identifierledgerfreeze_and_more"),
    ]

    operations = [
        migrations.AlterField(
            model_name="overflow",
            name="transaction",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="overflows",
                to="core.transaction",
            ),
        ),
        migrations.AddField(
            model_name="overflow",
            name="identifier",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="overflows",
                to="core.identifier",
            ),
        ),
        migrations.AddField(
            model_name="overflow",
            name="owner",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="overflows",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="overflow",
            name="period",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="overflows",
                to="core.period",
            ),
        ),
        migrations.RunPython(populate_overflow_tracking_fields, migrations.RunPython.noop),
    ]
