from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0004_identifiercapacityadjustment_adjustment_type_and_more"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="PasswordResetToken",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("selector", models.UUIDField(default=uuid.uuid4, editable=False, unique=True)),
                ("token_hash", models.CharField(max_length=128)),
                ("expires_at", models.DateTimeField()),
                ("used_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="password_reset_tokens", to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="passwordresettoken",
            index=models.Index(fields=["selector"], name="core_passwo_selecto_6d6096_idx"),
        ),
        migrations.AddIndex(
            model_name="passwordresettoken",
            index=models.Index(fields=["expires_at"], name="core_passwo_expires_2d8a9b_idx"),
        ),
    ]
