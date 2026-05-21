from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0020_repeatticket_repeatticketitem_repeatticketgeneration_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='repeatticket',
            name='serial_number',
            field=models.PositiveIntegerField(blank=True, db_index=True, null=True),
        ),
        migrations.AddConstraint(
            model_name='repeatticket',
            constraint=models.UniqueConstraint(fields=('created_by', 'serial_number'), name='unique_repeat_ticket_serial_per_user'),
        ),
    ]
