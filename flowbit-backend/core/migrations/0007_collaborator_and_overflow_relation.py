from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0006_rename_core_passwo_selecto_6d6096_idx_core_passwo_selecto_7ec384_idx_and_more"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="Collaborator",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("username", models.CharField(max_length=150)),
                ("full_name", models.CharField(max_length=150)),
                ("email", models.EmailField(max_length=254)),
                ("phone_number", models.CharField(max_length=50)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("owner", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="collaborators", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["username", "id"]},
        ),
        migrations.AddConstraint(
            model_name="collaborator",
            constraint=models.UniqueConstraint(fields=("owner", "username"), name="unique_collaborator_username_per_owner"),
        ),
        migrations.RemoveField(
            model_name="overflow",
            name="collaborators",
        ),
        migrations.AddField(
            model_name="overflow",
            name="collaborators",
            field=models.ManyToManyField(blank=True, related_name="approved_overflows", to="core.collaborator"),
        ),
    ]
