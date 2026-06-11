from django.db import migrations


SECURE_PUBLIC_TABLES_SQL = """
DO $$
DECLARE
    public_table RECORD;
BEGIN
    FOR public_table IN
        SELECT schemaname, tablename
        FROM pg_tables
        WHERE schemaname = 'public'
    LOOP
        EXECUTE format(
            'ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',
            public_table.schemaname,
            public_table.tablename
        );
        EXECUTE format(
            'REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM anon, authenticated',
            public_table.schemaname,
            public_table.tablename
        );
    END LOOP;
END
$$;

REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    REVOKE ALL ON SEQUENCES FROM anon, authenticated;

CREATE SCHEMA IF NOT EXISTS flowbit_private;
REVOKE ALL ON SCHEMA flowbit_private FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION flowbit_private.secure_new_public_tables()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
    new_public_table RECORD;
BEGIN
    FOR new_public_table IN
        SELECT namespace.nspname AS schemaname, relation.relname AS tablename
        FROM pg_event_trigger_ddl_commands() AS command
        JOIN pg_class AS relation ON relation.oid = command.objid
        JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        WHERE command.command_tag = 'CREATE TABLE'
          AND namespace.nspname = 'public'
          AND relation.relkind IN ('r', 'p')
    LOOP
        EXECUTE format(
            'ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',
            new_public_table.schemaname,
            new_public_table.tablename
        );
    END LOOP;
END
$$;

DROP EVENT TRIGGER IF EXISTS flowbit_secure_new_public_tables;
CREATE EVENT TRIGGER flowbit_secure_new_public_tables
    ON ddl_command_end
    WHEN TAG IN ('CREATE TABLE')
    EXECUTE FUNCTION flowbit_private.secure_new_public_tables();
"""


def secure_public_tables(apps, schema_editor):
    if schema_editor.connection.vendor == "postgresql":
        schema_editor.execute(SECURE_PUBLIC_TABLES_SQL)


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0025_supportcase_requester_email"),
    ]

    operations = [
        migrations.RunPython(
            secure_public_tables,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
