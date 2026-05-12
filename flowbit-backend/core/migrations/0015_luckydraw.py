from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0014_alter_identifiercapacityadjustment_adjustment_type_and_more"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="LuckyDraw",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("number", models.CharField(max_length=6)),
                ("announced_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("announced_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="announced_lucky_draws", to=settings.AUTH_USER_MODEL)),
                ("period", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="lucky_draw", to="core.period")),
            ],
            options={
                "ordering": ["-period__start_date", "-updated_at"],
            },
        ),
    ]
