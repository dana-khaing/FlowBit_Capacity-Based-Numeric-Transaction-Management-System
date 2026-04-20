from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0007_collaborator_and_overflow_relation"),
    ]

    operations = [
        migrations.AddField(
            model_name="profile",
            name="phone_number",
            field=models.CharField(blank=True, default="", max_length=50),
        ),
    ]
