# Supabase Database Setup

Supabase uses PostgreSQL, so FlowBit can connect to it with normal Django Postgres settings.

## 1. Choose One Configuration Style

Use either:

- `DATABASE_URL`
- separate `DB_*` variables

Do not use both unless they match. `DATABASE_URL` takes priority.

## 2. Example `.env`

Using a full URL:

```env
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@YOUR_HOST:5432/postgres?sslmode=require
DB_CONN_MAX_AGE=600
DB_CONNECT_TIMEOUT=10
```

Using separate fields:

```env
DB_ENGINE=django.db.backends.postgresql
DB_NAME=postgres
DB_USER=postgres
DB_PASSWORD=YOUR_PASSWORD
DB_HOST=YOUR_HOST
DB_PORT=5432
DB_SSLMODE=require
DB_CONN_MAX_AGE=600
DB_CONNECT_TIMEOUT=10
```

## 3. Apply Migrations

```bash
python manage.py migrate
```

## 4. Verify The Connection

```bash
python manage.py check_database_connection
```

This prints a sanitized database summary and confirms whether Django can connect.

## 5. Notes

- Supabase SSL should normally be enabled with `DB_SSLMODE=require`.
- FlowBit keeps using Django auth and business logic. Supabase is only the hosted PostgreSQL database in this setup.
- If you later use Supabase pooler settings, update `DB_HOST` and `DB_PORT` to match that connection endpoint.
