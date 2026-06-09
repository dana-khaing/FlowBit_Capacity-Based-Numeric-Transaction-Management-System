# FlowBit User Manual

Last reviewed: June 9, 2026

## 1. Purpose

FlowBit is a realtime capacity-based transaction platform for numeric identifiers
`000` through `999`. This manual explains the current application workflows,
operational rules, administrator controls, API surface, and scheduled backend
tasks.

## 2. Roles And Access

### Standard users

Standard users can:

- view the dashboard, ledgers, identifiers, tickets, spill-over, notifications,
  archive, exports, and their profile
- create tickets and transactions while the current period is open for operations
- manage their own collaborators and repeat-ticket templates
- resolve and refund their own eligible transactions and spill-over
- create support cases and reply to their own cases

Some protected period and ledger operations require a valid administrator
override code.

### Administrators

Administrators can perform standard-user operations and can also:

- manage periods, ledgers, identifier freezes, users, roles, and override codes
- create and announce lucky draws
- review audit logs
- manage support cases
- broadcast notifications
- access the Django admin and API documentation

## 3. Sign-In And Account Management

FlowBit supports username/password and Google sign-in.

### Create and verify an account

1. Open **Sign up**.
2. Enter the required account details and choose an available username.
3. Submit the form.
4. Use the verification link or code sent to the account email.
5. Sign in after verification.

### Recover access

- Use **Forgot password** to request a password-reset link.
- Use **Login help** to create a support request without signing in.
- Administrators can use the override-code recovery flow when an override code
  has been forgotten.

### Profile

The profile page allows users to review session information, update profile
details, change their password, and manage their avatar. Administrator profiles
also provide shortcuts to user management, audit logs, override codes, API
documentation, and Django admin.

## 4. Core Concepts

### Period

A period is a date-bounded operating window. Only one period can be open at a
time, and periods cannot overlap.

Each period has:

- start and end date/time
- pre-close time
- lucky-draw reveal time
- open, pre-closed, and closed state
- optional lucky draw

### Ledger

A ledger is a capacity bucket within a period. Lower priority numbers allocate
first. A normal ledger can inherit its end date from its period. Internal
reserve ledgers hold identifier-specific capacity returned or created by
spill-over operations.

### Identifier

Identifiers are fixed numeric values from `000` to `999`. FlowBit tracks each
identifier's utilization, remaining capacity, spill-over totals, and freeze
state.

An identifier may be frozen across all ledgers or only selected ledgers.
Frozen capacity is skipped during allocation.

### Ticket And Transaction

A ticket groups one or more transactions and stores an automatically generated
ticket number, customer information, notes, and refund state.

Each transaction belongs to one identifier, receives an order number, and may
contain ledger allocations, spill-over, or both.

### Spill-Over And Overkill

FlowBit uses these statuses:

- `TCSO`: pending spill-over awaiting resolution
- `CSO`: approved spill-over
- `RFND`: refunded spill-over
- `OVRK`: detached overkill recorded outside a normal ticket allocation

Approving above the required spill-over amount or refunding approved `CSO` can
create identifier-specific reserve capacity.

### Collaborator

A collaborator is a private contact owned by the current user and selected
during spill-over approval. Collaborators are not FlowBit login accounts.

### Repeat Ticket

A repeat ticket is a reusable ticket template. It stores ticket items and can
generate a new ticket for the current operating period.

## 5. Daily Operations

### Dashboard

The dashboard shows the current period, capacity summary, recent tickets, hot
numbers, almost-full numbers, full numbers, and lucky-draw information. Relevant
changes refresh in realtime across active sessions.

### Create a ticket

1. Open **Create ticket**.
2. Enter customer details and optional notes.
3. Add one or more identifier and amount entries.
4. Review the allocation preview.
5. Choose automatic allocation or provide manual ledger allocations when needed.
6. Confirm whether spill-over is acceptable if capacity is insufficient.
7. Submit the ticket.
8. Review, print, or export the receipt PDF.

Ticket and transaction creation is blocked after pre-close.

### Review and refund tickets

Open **Tickets** to search ticket history and view ticket details. Eligible
refund actions include:

- refund a complete ticket
- refund one transaction
- refund only the spill-over portion

Refunds that affect a locked period are rejected. A ticket is marked refunded
when all of its transactions are refunded.

### Manage spill-over

Open **Spill over** to review pending, approved, and overkill records.

To approve pending `TCSO`:

1. Select the pending record.
2. Choose one of your collaborators.
3. Enter the helper name and approval amount.
4. Confirm the resolution.

The approval amount may create reserve capacity when it exceeds the required
amount. Returned capacity can also trigger a retry of pending spill-over.

### Use repeat tickets

1. Open **Repeat tickets**.
2. Create a template and add its identifier/amount items.
3. Generate the template when a new ticket is required.
4. Review the generation result and generated ticket.

Generation still follows current-period capacity and lock rules.

### Notifications

The notification inbox provides unread tracking and links to related work.
Notifications include system events, pending spill-over warnings, lucky-draw
events, and administrator announcements. Users can mark individual
notifications or all notifications as read.

### Customer support

Signed-in users can open **Contact support**, create a case, reply, and reopen a
closed case. Administrators can review and reply to all support cases. Users
who cannot sign in can submit a request through **Login help**.

## 6. Period And Lucky-Draw Lifecycle

### Open operation

While a period is open and not pre-closed, users can create tickets,
transactions, allocations, direct overkill, ledgers, and eligible refunds.

### Pre-close

At the configured pre-close time:

- active normal ledgers close
- ticket and transaction creation lock
- allocation preview and direct overkill lock
- ledger creation and reopen lock
- ticket and spill-over refunds lock

If an administrator moves pre-close later before the lucky draw is announced,
the pre-close may be undone and affected ledgers reopened.

### Lucky draw

Administrators can create, edit, remove, and announce one lucky number for a
period. Announcing it:

- applies pre-close immediately if needed
- converts pending `TCSO` to `CSO`
- leaves remaining `OVRK` as overkill
- looks for winners across tickets, approved spill-over, and overkill
- keeps the announced period locked

### Period close and reopen

Closing a period archives active ledgers and resolves remaining pending
spill-over according to the close workflow. Reopen operations are
administrator-controlled and remain subject to period and lucky-draw rules.

## 7. Ledger And Identifier Operations

Administrators can create, edit, close, reopen, and reorder ledgers. Ledger
priority values must be unique among active ledgers in the same period.

The ledger detail view shows identifier capacity and allocation information.
Ledger data can be exported to CSV or PDF.

Administrators can freeze an identifier for all ledgers or selected ledgers in
the current period, and can later remove the freeze. Existing allocations are
not removed; future allocation skips frozen capacity.

## 8. Exports And Reports

Available reports and exports include:

- dashboard summary, hot numbers, almost-full numbers, and full numbers
- identifier capacity report
- ledger CSV and PDF exports
- ticket receipt PDF
- collaborator transaction CSV and PDF exports
- spill-over CSV and PDF exports

Collaborator and spill-over exports support period filtering and relevant
sorting options.

## 9. Administrator Workspace

The administrator workspace provides current-period status and shortcuts for:

- user and role management
- override-code management
- period and ledger operations
- lucky-draw operations
- identifier freezes
- spill-over queue
- support cases
- notification broadcasts
- audit logs
- API documentation
- Django admin

Audit logs are read-only through the API and record key write actions, acting
user, request IP where available, target object, and change metadata.

## 10. API Reference

All application API routes are under `/api/`. Authenticated requests use the
token returned by login.

### Documentation and health

- `/healthz/`
- `/api/schema/`
- `/api/docs/`
- `/api/redoc/`
- `/admin/`

### Authentication

- `/api/auth/login/`
- `/api/auth/register/`
- `/api/auth/username-availability/`
- `/api/auth/google/`
- `/api/auth/logout/`
- `/api/auth/me/`
- `/api/auth/avatar/`
- `/api/auth/change-password/`
- `/api/auth/forgot-password/`
- `/api/auth/reset-password/`
- `/api/auth/verify-email/`
- `/api/auth/resend-verification/`
- `/api/auth/forgot-override-code/`
- `/api/auth/reset-override-code/`

### Main resources

- `/api/periods/`
- `/api/ledgers/`
- `/api/identifiers/`
- `/api/transactions/`
- `/api/overflows/`
- `/api/collaborators/`
- `/api/repeat-tickets/`
- `/api/notifications/`
- `/api/support-cases/`
- `/api/audit-logs/`
- `/api/users/`

Resource-specific actions include period close/reopen, lucky draw and summary;
ledger close/reopen, reorder, view, and export; identifier freeze/unfreeze;
transaction allocation preview; spill-over approve/resolve and overkill;
notification read/broadcast actions; support reply/close/reopen; and repeat
ticket generation.

### Tickets and reports

- `/api/tickets/create-with-items/`
- `/api/tickets/`
- `/api/tickets/<ticket_number>/`
- `/api/tickets/<ticket_number>/refund/`
- `/api/tickets/receipt-pdf/`
- `/api/reports/dashboard/`
- `/api/reports/dashboard/hot-numbers/`
- `/api/reports/dashboard/almost-full/`
- `/api/reports/dashboard/full-numbers/`
- `/api/reports/identifiers/capacity/`

### Realtime

Authenticated realtime notification updates use:

- `/ws/notifications/`

Use Swagger UI or ReDoc for current request fields, methods, and response
schemas.

## 11. Scheduled Backend Tasks

Run management commands from `flowbit-backend/`.

```bash
python manage.py check_database_connection
python manage.py close_expired_ledgers --dry-run
python manage.py close_expired_periods --dry-run
python manage.py notify_pending_overflows
```

Recommended production scheduling:

- run `close_expired_ledgers` frequently to close expired ledgers
- run `close_expired_periods` frequently to apply due pre-close transitions and
  close expired periods
- run `notify_pending_overflows` frequently enough to create warnings during
  the 30-minute period-close window

`purge_operational_data` deletes operational records while preserving user
accounts and profiles. Always preview it first:

```bash
python manage.py purge_operational_data --dry-run
```

## 12. Deployment Notes

The backend supports environment-based PostgreSQL configuration, Redis-backed
realtime delivery, and production avatar storage.

Important backend environment variables include:

- `SECRET_KEY`
- `DEBUG`
- `ALLOWED_HOSTS`
- `CORS_ALLOWED_ORIGINS`
- `CSRF_TRUSTED_ORIGINS`
- `DATABASE_URL`
- `REDIS_URL`
- `GOOGLE_OAUTH_CLIENT_ID`
- `FRONTEND_PASSWORD_RESET_URL`
- `DEFAULT_FROM_EMAIL`

The production backend should run as an ASGI application so WebSocket
notifications are available.
