from django.db import migrations


def repair_period_is_open(apps, schema_editor):
    table_name = "core_period"
    quote_name = schema_editor.quote_name
    connection = schema_editor.connection

    with connection.cursor() as cursor:
        columns = {
            column.name
            for column in connection.introspection.get_table_description(cursor, table_name)
        }

    if "is_open" in columns:
        return

    with connection.cursor() as cursor:
        if "is_closed" in columns:
            cursor.execute(
                f"ALTER TABLE {quote_name(table_name)} "
                f"ADD COLUMN {quote_name('is_open')} boolean"
            )
            cursor.execute(
                f"UPDATE {quote_name(table_name)} "
                f"SET {quote_name('is_open')} = NOT COALESCE({quote_name('is_closed')}, FALSE)"
            )

            if connection.vendor == "postgresql":
                cursor.execute(
                    f"ALTER TABLE {quote_name(table_name)} "
                    f"ALTER COLUMN {quote_name('is_open')} SET DEFAULT TRUE"
                )
                cursor.execute(
                    f"UPDATE {quote_name(table_name)} "
                    f"SET {quote_name('is_open')} = TRUE "
                    f"WHERE {quote_name('is_open')} IS NULL"
                )
                cursor.execute(
                    f"ALTER TABLE {quote_name(table_name)} "
                    f"ALTER COLUMN {quote_name('is_open')} SET NOT NULL"
                )

            cursor.execute(
                f"ALTER TABLE {quote_name(table_name)} "
                f"DROP COLUMN {quote_name('is_closed')}"
            )
            return

        cursor.execute(
            f"ALTER TABLE {quote_name(table_name)} "
            f"ADD COLUMN {quote_name('is_open')} boolean DEFAULT TRUE"
        )

        if connection.vendor == "postgresql":
            cursor.execute(
                f"ALTER TABLE {quote_name(table_name)} "
                f"ALTER COLUMN {quote_name('is_open')} SET NOT NULL"
            )


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0001_initial"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunPython(repair_period_is_open, migrations.RunPython.noop),
            ],
            state_operations=[],
        ),
    ]
