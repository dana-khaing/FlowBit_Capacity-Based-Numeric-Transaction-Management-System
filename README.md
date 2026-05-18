# FlowBit

FlowBit is a capacity-based numeric transaction management platform built around identifiers `000`-`999`. It combines period-based ledger control, ticket entry, spill-over approval workflows, reserve capacity, lucky draw rules, archive access, and live notifications in a single web application.

Current release:
- `0.1.0-beta`

## Overview

FlowBit is designed for workflows where every identifier has a constrained allocation pool and transactions must be tracked precisely across time-bounded periods.

The system supports:
- controlled capacity allocation across multiple ledgers
- spill-over approval and reserve capacity handling
- ticket receipt generation, printing, and export
- period lifecycle control with pre-close and lucky draw rules
- archived historical review
- live user notifications and customer service cases

## Core Concepts

### Identifiers

- shared numeric pool from `000` to `999`
- every identifier can consume capacity across one or more ledgers
- capacity and usage are tracked per period and per user context where needed

### Periods

- only one period can remain open at a time
- each period has:
  - start date
  - end date
  - close time
  - pre-close time
  - lucky draw reveal time
- reserve ledgers are created automatically for users inside the period

### Ledgers

- standard ledgers carry the normal identifier capacity
- reserve ledgers support approved extra capacity and overkill usage
- standard ledger allocations follow priority order unless manually assigned

### Spill-over States

- `TCSO`:
  pending spill-over waiting for approval
- `CSO`:
  approved spill-over
- `OVRK`:
  detached overkill capacity that can be consumed later

## Main Features

### Dashboard

- live current-period summary
- next draw / lucky number panel
- hot numbers
- almost full numbers
- full numbers
- recent tickets
- lucky winner display after announcement
- drill-down popups with search and paging
- live refresh across tabs, browsers, and devices for capacity-changing actions

### Admin Panel

- admin-only workspace in the side navigation
- active period overview with pre-close and lucky draw status
- quick counts for:
  - users
  - pending spill over
  - active ledgers
  - open support cases
- direct shortcuts to:
  - users
  - override codes
  - audit logs
  - periods
  - spill-over queue
  - customer service
  - notification broadcast
- lucky number announce popup with OTP-style entry
- reveal time edit popup
- recent audit activity preview
- open support case preview

### Period Management

- create, edit, close, reopen, and delete periods
- configure pre-close time and lucky draw reveal time
- audit logging for period actions
- automatic reserve ledger synchronization

### Pre-close Workflow

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

If pre-close is moved later before lucky draw is announced:
- pre-close can be undone automatically
- affected ledgers reopen
- operations unlock again

If lucky draw is announced before pre-close happens:
- pre-close is applied immediately

### Ledger Management

- create and manage per-user ledgers
- per-identifier capacity limits
- priority-based allocation
- dedicated ledger view page
- active / closed ledger status
- reserve ledger support
- archive paging and search

### Identifier Freeze Control

- freeze one identifier in one ledger
- freeze one identifier across all active standard ledgers
- reserve ledger remains system-managed
- freeze state affects allocation and dashboard fullness logic

### Ticket Entry and Ticket History

- create tickets with one or many entries
- default allocation mode
- manual allocation mode
- capacity preview before submission
- receipt preview on screen
- POS-style print output
- PDF receipt export
- ticket history with:
  - server-side paging
  - server-side search
  - server-side filtering
  - server-side sorting
  - server-side summary cards

### Spill-over Management

- pending, approved, and overkill tabs
- collaborator-based approval flow
- extra approval into reserve capacity
- detached overkill creation
- refund / return handling
- export and print flows
- server-side paging and filtering

### Lucky Draw

- one shared lucky draw number per period
- admin-only create, edit, and remove
- reveal-time based display
- real announcement timestamp recorded
- winner matching by lucky draw result

When lucky draw is announced:
- pending `TCSO` converts to `CSO`
- remaining `OVRK` stays overkill
- winner lookup checks:
  - tickets
  - approved spill-over
  - overkill
- operations for the announced period remain locked

### Archive

- closed period browser
- archived ticket view
- archived ledger view
- archived spill-over review
- archived lucky draw winners
- read-only archive interaction

### Export

- ledger export
- spill-over export
- PDF and receipt-style print flows where supported

### Notifications

- per-user inbox
- admin broadcast announcements
- dropdown bell with recent items
- full notification page
- live refresh through WebSocket
- unread count in the side navigation

Notification coverage includes:
- period changes
- ledger changes
- refunds
- lucky draw changes
- pre-close changes
- support case activity

### Customer Service

- user opens support case
- admin and user can reply
- either side can close or reopen the case
- conversation history is stored per case

## User Roles

### Admin

- manage periods
- manage users and override codes
- send announcements
- manage lucky draw
- view audit logs
- access admin pages

### Regular User

- create tickets
- manage own ledgers where allowed
- review notifications
- use spill-over workflow
- open support cases
- review archive data

## Architecture

### Frontend

- Next.js application
- workspace-based UI
- receipt preview and export flows
- live notification refresh through WebSocket

### Backend

- Django REST Framework
- period, ledger, ticket, overflow, notification, archive, and support APIs
- Django admin for operational oversight

### Database

- PostgreSQL

### Realtime

- Django Channels
- Redis-backed channel layer for shared live notifications
- cross-device dashboard refresh events for capacity-changing actions

## Project Structure

```text
FlowBit/
├── flowbit-backend/
│   ├── core/
│   └── flowbit_backend/
└── flowbit-frontend/
    └── src/
```

## Local Development

### Requirements

- Python 3.11+
- Node.js
- pnpm
- Redis
- PostgreSQL access

### Backend Environment

Backend `.env` should include at least:

```env
DATABASE_URL=postgresql://...
GOOGLE_OAUTH_CLIENT_ID=...
REDIS_URL=redis://127.0.0.1:6379/0
```

### Install Backend Dependencies

```bash
cd flowbit-backend
venv/bin/python -m pip install -r requirements.txt
venv/bin/python manage.py migrate
```

### Start Redis

```bash
redis-cli ping
```

Expected:

```text
PONG
```

### Start Backend

Use Daphne so WebSocket notifications are served correctly:

```bash
cd flowbit-backend
venv/bin/python -m daphne -b 127.0.0.1 -p 8000 flowbit_backend.asgi:application
```

Backend base URL:

```text
http://127.0.0.1:8000
```

### Start Frontend

```bash
cd flowbit-frontend
pnpm install
pnpm dev
```

Default frontend URL:

```text
http://localhost:3000
```

### Google Sign-in for Local Development

Add these authorized JavaScript origins in Google Cloud Console:

```text
http://localhost:3000
http://127.0.0.1:3000
```

## Realtime Notes

- WebSocket endpoint:
  `/ws/notifications/`
- production shared realtime depends on `REDIS_URL`
- without Redis, only an in-memory single-process fallback is available
- dashboard and notification state can refresh live across sessions when Redis-backed realtime is active

## Testing

### Backend

```bash
cd flowbit-backend
venv/bin/python manage.py test --settings=flowbit_backend.test_settings
```

### Frontend

```bash
cd flowbit-frontend
pnpm build
```

## Operational Notes

- use Daphne for local websocket testing
- keep Redis running for shared notification delivery
- restart backend after changing `.env`
- use the frontend origin registered in Google Cloud Console when testing Google sign-in
