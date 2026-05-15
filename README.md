# FlowBit

Capacity-based numeric transaction management system for identifiers `000`-`999`.

FlowBit manages:
- period-based ledgers
- ticket and transaction entry
- spill-over approval workflows
- reserve / overkill capacity
- lucky draw period closure rules
- live user notifications

## Stack

- Frontend: Next.js
- Backend: Django REST Framework
- Database: PostgreSQL
- Realtime notifications: Django Channels + Redis

## Main Features

### Periods

- one active period at a time
- configurable period close time
- configurable `pre-close time`
- reserve ledgers created automatically per user
- reopen / close / delete controls with audit logging

### Pre-close

When pre-close is reached:
- active ledgers in that period close
- ticket creation locks
- transaction creation locks
- allocation preview locks
- direct overkill creation locks
- ledger creation locks
- ledger reopen locks
- ticket refunds lock
- spill-over refunds lock

If admin moves pre-close later before lucky draw is announced:
- pre-close can be undone automatically
- affected ledgers reopen
- operations unlock again

### Ledgers

- per-user ledgers
- per-identifier capacity
- priority-based allocation
- reserve ledger support
- ledger view with identifier usage / leftover
- identifier freeze across one ledger or all standard ledgers

### Tickets

- create tickets with one or many entries
- default and manual allocation
- receipt preview, print, and PDF export
- server-side ticket paging, filtering, sorting, and summaries

### Spill Over

States:
- `TCSO` pending
- `CSO` approved
- `OVRK` overkill

Supports:
- collaborator approval
- extra approval into reserve capacity
- direct overkill creation
- refund / return flows
- export and print

### Lucky Draw

- one shared lucky draw number per period
- admin-only add / edit / remove
- reveal time support
- if lucky draw is announced before pre-close, pre-close is forced immediately
- on lucky draw announcement:
  - pending `TCSO` becomes `CSO`
  - remaining `OVRK` stays overkill
  - winner lookup checks tickets, approved spill over, and overkill

### Notifications

- per-user notification inbox
- admin broadcast announcements
- navbar bell with latest items
- live refresh through WebSocket

Notification events include:
- period changes
- ledger changes
- refunds
- lucky draw changes
- pre-close changes
- support case activity

### Customer Service

- user creates a support case
- admin and user can reply
- either side can close / reopen the case

### Archive

- closed periods
- archived ledgers
- archived tickets
- archived spill over
- lucky draw winners for archived periods

## Project Structure

```text
FlowBit/
├── flowbit-backend/
└── flowbit-frontend/
```

## Local Run

### Requirements

- Python 3.11+
- Node.js
- Redis
- PostgreSQL access

### Backend setup

```bash
cd flowbit-backend
venv/bin/python -m pip install -r requirements.txt
venv/bin/python manage.py migrate
```

Backend `.env` should include at least:

```env
DATABASE_URL=postgresql://...
GOOGLE_OAUTH_CLIENT_ID=...
REDIS_URL=redis://127.0.0.1:6379/0
```

### Start Redis

```bash
redis-cli ping
```

Expected:

```text
PONG
```

### Start backend

Use Daphne so websocket notifications work:

```bash
cd flowbit-backend
venv/bin/python -m daphne -b 127.0.0.1 -p 8000 flowbit_backend.asgi:application
```

### Start frontend

```bash
cd flowbit-frontend
pnpm install
pnpm dev
```

Default frontend:

```text
http://localhost:3000
```

### Google sign-in

If you use Google sign-in locally, add these authorized JavaScript origins in Google Cloud Console:

```text
http://localhost:3000
http://127.0.0.1:3000
```

## Realtime Notes

- WebSocket endpoint: `/ws/notifications/`
- shared transport uses Django Channels
- production multi-worker realtime requires Redis through `REDIS_URL`
- without Redis, in-memory fallback is only suitable for single-process local use

## Testing

Backend:

```bash
cd flowbit-backend
venv/bin/python manage.py test --settings=flowbit_backend.test_settings
```

Frontend:

```bash
cd flowbit-frontend
pnpm build
```

## Current Branch Note

Recent work includes:
- pre-close schedule management
- lucky draw operational locking
- Channels + Redis notification realtime
- notification inbox / dropdown polish
