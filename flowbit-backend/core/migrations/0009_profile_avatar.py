from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0008_profile_phone_number"),
    ]

    operations = [
        migrations.AddField(
            model_name="profile",
            name="avatar",
            field=models.ImageField(blank=True, null=True, upload_to="profile_avatars/"),
        ),
    ]
