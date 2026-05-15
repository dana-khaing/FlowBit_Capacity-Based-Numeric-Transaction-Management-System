from datetime import time

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0018_period_lucky_draw_reveal_time"),
    ]

    operations = [
        migrations.AddField(
            model_name="period",
            name="pre_close_time",
            field=models.TimeField(default=time(15, 30)),
        ),
        migrations.AddField(
            model_name="period",
            name="pre_closed_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
