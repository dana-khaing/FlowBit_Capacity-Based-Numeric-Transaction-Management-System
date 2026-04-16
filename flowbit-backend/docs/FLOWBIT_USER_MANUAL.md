# FlowBit User Manual

## 1. Purpose

This document explains how to operate FlowBit based on the current backend implementation.

It includes:

- system overview
- feature reference
- workflow guidance
- API endpoint summary
- admin and operations guidance

## 2. System Overview

FlowBit is a capacity allocation system that works inside one active period at a time.

Main objects:

- `Period`
- `Ledger`
- `Identifier`
- `Ticket`
- `Transaction`
- `LedgerAllocation`
- `Overflow`
- `IdentifierCapacityAdjustment`
- `OverflowNotification`

## 3. Core Concepts

### 3.1 Period

A period is a date-bounded operating window.

Rules:

- only one period can be open at a time
- periods cannot overlap
- period close archives active ledgers
- unresolved `TCSO` converts to `CSO` at close time

### 3.2 Ledger

A ledger is a capacity bucket inside a period.

Rules:

- lower priority number is used first
- ledgers can inherit end date from their period
- active priority values must be unique within the same period
- hidden reserve ledgers are internal and not treated as normal ledgers

### 3.3 Identifier

Identifiers are fixed values from `000` to `999`.

The system tracks per identifier:

- current utilization
- remaining capacity
- pending overflow
- confirmed overflow
- total overflow

### 3.4 Ticket

A ticket groups one or more transactions.

It stores:

- auto-generated ticket number
- customer name
- notes
- refunded state

### 3.5 Transaction

A transaction:

- belongs to one identifier
- may belong to a ticket
- gets an auto-generated order number
- can have allocations, overflow, refund state, or a combination of them

### 3.6 Overflow

Overflow is the part of a transaction that cannot be allocated.

Status values:

- `TCSO`: pending overflow
- `CSO`: approved or auto-closed overflow
- `RFND`: refunded overflow

### 3.7 Reserve Capacity

Reserve capacity is identifier-specific capacity created by:

- approval above the required overflow amount
- refund of approved `CSO`

It is stored through `IdentifierCapacityAdjustment` and consumed through an internal reserve ledger.

## 4. Current Feature Reference

### 4.1 Period Features

- create periods
- update periods
- list periods
- view the current open period
- close periods manually
- auto-close periods by command
- get period summaries
- filter periods by section and date range
- accept date-only inputs with default close time support

### 4.2 Ledger Features

- create ledgers
- update ledgers
- list ledgers
- close ledgers manually
- auto-close expired ledgers
- reorder priorities
- export ledgers to CSV
- export ledgers to PDF
- default ledger end date from period when omitted
- accept custom close time

### 4.3 Identifier Features

- list identifiers
- view utilization and remaining capacity
- view overflow totals

### 4.4 Ticket Features

- create one ticket with multiple transactions
- list tickets
- retrieve tickets by ticket number
- mark tickets refunded when all transactions are refunded

### 4.5 Transaction Features

- create transactions
- allocate across active ledgers by priority
- preview allocation before creating a transaction
- support manual ledger-by-ledger allocation
- allow transaction creation to be blocked when overflow is not accepted
- consume reserve capacity if available
- create overflow for any remaining amount
- mark transactions refunded

### 4.6 Overflow Features

- list all overflows
- list pending overflows
- list approved overflows
- approve overflow
- resolve overflow through one endpoint
- store helper name
- store collaborators
- require collaborator selection from existing users during `TCSO -> CSO` approval
- refund overflow only
- refund whole transaction
- refund whole ticket
- retry pending overflow when capacity is returned
- auto-convert pending overflow to approved overflow at period close

### 4.7 Collaborator Features

- list collaborators for approval selection
- export collaborator-approved transactions to CSV
- export collaborator-approved transactions to PDF
- filter collaborator exports by period
- sort collaborator exports by identifier or approval time

### 4.8 Notification Features

- create pre-close notifications for pending `TCSO`
- expose notifications through API and admin

### 4.9 Admin Features

Admin pages are available for:

- periods
- ledgers
- identifiers
- tickets
- transactions
- ledger allocations
- overflows
- identifier capacity adjustments
- overflow notifications
- profiles
- audit logs

## 5. Main Business Workflows

### 5.1 Open A New Period

1. Create a period.
2. Add one or more ledgers.
3. Confirm only that period is open.
4. Begin posting transactions.

### 5.2 Create Ledgers

1. Choose period.
2. Set name.
3. Set `limit_per_identifier`.
4. Set priority.
5. Optionally set `close_time`.

### 5.3 Create A Ticket With Transactions

1. Submit customer name and notes.
2. Submit item list with identifier and amount.
3. The system creates:
   - one ticket
   - one transaction per item
   - ledger allocations
   - overflow where needed

### 5.4 Choose Allocation Mode

Transactions can be created in two modes:

- automatic allocation, where FlowBit fills ledgers by priority
- manual allocation, where the user chooses which ledger receives which amount

Recommended use:

- use automatic allocation for standard daily work
- use manual allocation when an operator needs direct control over ledger usage

### 5.5 Approve Overflow

1. Review `TCSO`.
2. Select one or more existing collaborators.
3. Approve exact amount or higher amount.
4. Current user cannot be one of the selected collaborators.
5. The system stores current time as approval time.
6. If approved amount is greater than overflow amount, the extra becomes reserve capacity for the identifier.

### 5.6 Refund Overflow Or Transactions

Available actions:

- refund overflow only
- refund transaction
- refund ticket

Effects:

- returned capacity becomes available again
- approved `CSO` refunds return helper reserve capacity
- pending overflow for the same identifier is retried

### 5.7 Close Period

1. Review pending overflow.
2. Run pre-close notification if needed.
3. Resolve manually where appropriate.
4. Close period.
5. System converts remaining `TCSO` to `CSO` automatically.
6. Ledgers are archived.

### 5.8 Export Collaborator Reports

1. Open the collaborator to be reviewed.
2. Choose an optional period.
3. Choose sorting by identifier or approval time.
4. Download CSV or PDF.
5. Review the transaction rows and total approved amount.

## 6. How To Use FlowBit

### 6.1 Create A Period

Example:

```json
{
  "name": "April 2027 Period",
  "start_date": "2027-04-01",
  "end_date": "2027-04-30"
}
```

Behavior:

- start date becomes midnight
- end date defaults to `15:00`

Custom close time:

```json
{
  "name": "April 2027 Period",
  "start_date": "2027-04-01",
  "end_date": "2027-04-30",
  "close_time": "17:30:00"
}
```

### 6.2 Create A Ledger

Example:

```json
{
  "period": 5,
  "name": "Primary April Ledger",
  "limit_per_identifier": "100.00",
  "priority": 1
}
```

Custom close time:

```json
{
  "period": 5,
  "name": "Primary April Ledger",
  "limit_per_identifier": "100.00",
  "priority": 1,
  "close_time": "16:45:00"
}
```

### 6.3 Create A Ticket With Transactions

Endpoint:

- `POST /api/tickets/create-with-items/`

Example:

```json
{
  "customer_name": "ABC Trading",
  "notes": "Daily batch",
  "items": [
    {"identifier": 1, "amount": "250.00"},
    {"identifier": 3, "amount": "80.00"},
    {"identifier": 1, "amount": "40.00"}
  ]
}
```

Each item can also include:

- `manual_allocations`
- `allow_overflow`

Example:

```json
{
  "customer_name": "ABC Trading",
  "notes": "Manual split batch",
  "items": [
    {
      "identifier": 1,
      "amount": "230.00",
      "manual_allocations": [
        {"ledger": 10, "amount": "100.00"},
        {"ledger": 12, "amount": "80.00"}
      ],
      "allow_overflow": true
    }
  ]
}
```

### 6.4 Preview Allocation Before Create

Endpoint:

- `POST /api/transactions/allocation-preview/`

Automatic preview example:

```json
{
  "identifier": 1,
  "total_amount": "180.00"
}
```

Manual preview example:

```json
{
  "identifier": 1,
  "total_amount": "230.00",
  "manual_allocations": [
    {"ledger": 10, "amount": "100.00"},
    {"ledger": 12, "amount": "80.00"}
  ]
}
```

Preview response includes:

- ledger available amount
- requested amount
- allocated amount
- overflow amount per ledger request
- reserve available and reserve allocated
- total overflow amount
- `has_overflow`

This endpoint is intended for instant frontend feedback while the user is typing.

### 6.5 Create Transaction Automatically By Priority

Example:

```json
{
  "identifier": 1,
  "total_amount": "180.00",
  "allow_overflow": true
}
```

Behavior:

- FlowBit fills ledgers by priority
- if there is not enough capacity, the remainder becomes `TCSO`
- if `allow_overflow` is `false`, the request is rejected with preview feedback instead

### 6.6 Create Transaction With Manual Allocation

Example:

```json
{
  "identifier": 1,
  "total_amount": "230.00",
  "manual_allocations": [
    {"ledger": 10, "amount": "100.00"},
    {"ledger": 12, "amount": "80.00"}
  ],
  "allow_overflow": true
}
```

Behavior:

- the user-selected ledger order is respected
- each requested amount is checked against actual ledger capacity
- if the full request does not fit, the system reports the shortfall
- if `allow_overflow` is `true`, the remainder becomes `TCSO`
- if `allow_overflow` is `false`, the transaction is rejected and preview feedback is returned

### 6.7 Review Pending Overflow

Use:

- `GET /api/overflows/pending/`

Important fields:

- `excess_amount`
- `status`
- `amount_to_approve`
- `helper_name`
- `approved_at`
- `resolution_type`

### 6.8 Approve Overflow

Endpoint:

- `POST /api/overflows/{id}/approve/`

Example:

```json
{
  "amount_to_approve": "180.00",
  "helper_name": "Alice",
  "collaborator_ids": [2, 4]
}
```

Rules:

- no amount means approve the current overflow amount
- higher approval amount creates extra reserve capacity
- helper name is stored with the overflow

### 6.9 Resolve Overflow Through Unified Action

Endpoint:

- `POST /api/overflows/{id}/resolve/`

Approve:

```json
{
  "action": "approve",
  "amount_to_approve": "180.00",
  "helper_name": "Alice"
}
```

Refund overflow only:

```json
{
  "action": "refund_overflow_only",
  "helper_name": "Bob"
}
```

Refund transaction:

```json
{
  "action": "refund_transaction",
  "helper_name": "Bob"
}
```

Refund ticket:

```json
{
  "action": "refund_ticket",
  "helper_name": "Bob"
}
```

## 7. Allocation Feedback Rules

### 7.1 Default Rule

If the user does not supply `manual_allocations`:

- the system allocates by ledger priority automatically

### 7.2 Manual Rule

If the user supplies `manual_allocations`:

- the system uses the user-provided ledger order and amount requests

### 7.3 Capacity Check Rule

For both automatic and manual modes:

- the backend checks actual remaining ledger capacity
- reserve capacity is considered after normal ledgers

### 7.4 Overflow Confirmation Rule

If capacity is insufficient:

- and `allow_overflow` is `true`, the remaining amount becomes `TCSO`
- and `allow_overflow` is `false`, the request is rejected with preview information

## 8. Refund And Retry Behavior

### 8.1 Refund Overflow Only

- overflow status becomes refunded
- if it had approved `CSO`, helper reserve capacity is returned
- pending overflow for the same identifier is retried

### 8.2 Refund Transaction

- allocations are removed
- related overflow entries are refunded
- transaction is marked refunded
- ticket refund state is refreshed
- pending overflow for the same identifier is retried

### 8.3 Refund Ticket

- all transactions in the ticket are refunded
- all related overflow entries are refunded
- all allocations are removed
- ticket becomes refunded when every child transaction is refunded

### 8.4 Retry Rules

When capacity is restored:

- retry oldest pending overflow first
- allocate into normal ledgers first
- then consume reserve capacity
- delete overflow if fully absorbed
- reduce overflow amount if only partially absorbed

## 9. Period Close Behavior

When a period closes:

- pending `TCSO` becomes `CSO`
- `approved_at` becomes the close time
- `amount_to_approve` becomes the remaining overflow amount
- `helper_name` defaults to the helper performing close or `system`
- active ledgers are closed

## 10. Notifications

### 10.1 Pre-Close Notifications

Run:

```bash
python manage.py notify_pending_overflows
```

Behavior:

- checks open periods ending within 30 minutes
- finds pending `TCSO`
- creates one notification record per overflow

API:

- `GET /api/overflow-notifications/`
- `GET /api/overflow-notifications/{id}/`

## 11. Management Commands

### 11.1 Close Expired Periods

```bash
python manage.py close_expired_periods
```

Dry run:

```bash
python manage.py close_expired_periods --dry-run
```

### 11.2 Close Expired Ledgers

```bash
python manage.py close_expired_ledgers
```

Verbose:

```bash
python manage.py close_expired_ledgers --verbose
```

Dry run:

```bash
python manage.py close_expired_ledgers --dry-run
```

### 11.3 Notify Pending Overflows

```bash
python manage.py notify_pending_overflows
```

## 12. Exporting Reports

### 12.1 CSV Export

- `GET /api/ledgers/{id}/export-csv/`

### 12.2 PDF Export

- `GET /api/ledgers/{id}/export-pdf/`

### 12.3 Collaborator CSV Export

- `GET /api/collaborators/{id}/export-transactions/`
- query params:
  - `period_id`
  - `sort_by=identifier|approved_at`
  - `sort_order=asc|desc`

### 12.4 Collaborator PDF Export

- `GET /api/collaborators/{id}/export-transactions-pdf/`
- query params:
  - `period_id`
  - `sort_by=identifier|approved_at`
  - `sort_order=asc|desc`

Exports include:

- ledger details
- identifier-by-identifier values
- summary statistics
- collaborator name, period, approved rows, and total amount for collaborator reports

## 13. API Endpoint Summary

### 13.1 Periods

- `GET /api/periods/`
- `POST /api/periods/`
- `GET /api/periods/{id}/`
- `PUT /api/periods/{id}/`
- `PATCH /api/periods/{id}/`
- `DELETE /api/periods/{id}/`
- `GET /api/periods/current/`
- `POST /api/periods/{id}/close/`
- `GET /api/periods/{id}/summary/`

### 13.2 Ledgers

- `GET /api/ledgers/`
- `POST /api/ledgers/`
- `GET /api/ledgers/{id}/`
- `PUT /api/ledgers/{id}/`
- `PATCH /api/ledgers/{id}/`
- `DELETE /api/ledgers/{id}/`
- `POST /api/ledgers/{id}/close/`
- `POST /api/ledgers/auto-close-expired/`
- `POST /api/ledgers/reorder-priorities/`
- `GET /api/ledgers/{id}/export-csv/`
- `GET /api/ledgers/{id}/export-pdf/`

### 13.3 Identifiers

- `GET /api/identifiers/`
- `POST /api/identifiers/`
- `GET /api/identifiers/{id}/`
- `PUT /api/identifiers/{id}/`
- `PATCH /api/identifiers/{id}/`
- `DELETE /api/identifiers/{id}/`

### 13.4 Transactions

- `GET /api/transactions/`
- `POST /api/transactions/`
- `GET /api/transactions/{id}/`
- `PUT /api/transactions/{id}/`
- `PATCH /api/transactions/{id}/`
- `DELETE /api/transactions/{id}/`
- `POST /api/transactions/allocation-preview/`

### 13.5 Collaborators

- `GET /api/collaborators/`
- `GET /api/collaborators/{id}/`
- `GET /api/collaborators/{id}/export-transactions/`
- `GET /api/collaborators/{id}/export-transactions-pdf/`

### 13.6 Overflows

- `GET /api/overflows/`
- `POST /api/overflows/`
- `GET /api/overflows/{id}/`
- `PUT /api/overflows/{id}/`
- `PATCH /api/overflows/{id}/`
- `DELETE /api/overflows/{id}/`
- `GET /api/overflows/pending/`
- `GET /api/overflows/approved/`
- `POST /api/overflows/{id}/approve/`
- `POST /api/overflows/{id}/resolve/`

### 13.7 Overflow Notifications

- `GET /api/overflow-notifications/`
- `GET /api/overflow-notifications/{id}/`

### 13.8 Tickets

- `POST /api/tickets/create-with-items/`
- `GET /api/tickets/`
- `GET /api/tickets/{ticket_number}/`

## 14. Filtering Options

Supported list filters include:

- `section=active`
- `section=archive`
- `period_start`
- `period_end`
- `period_id`
- `ledger_id`

Archive-aware filters are used by:

- ledgers
- transactions
- overflows
- tickets

## 15. Admin Guide

### 15.1 Most Important Admin Screens

- Periods
- Ledgers
- Transactions
- Overflows
- Identifier Capacity Adjustments
- Overflow Notifications

### 15.2 What To Inspect

Transactions:

- ticket link
- allocations
- overflow summary
- refunded state

Overflows:

- status
- approved amount
- helper name
- refunded time

Identifiers:

- current utilization
- remaining capacity
- pending overflow
- confirmed overflow

## 16. Operational Runbook

### 16.1 Daily Start

1. Confirm correct period is open.
2. Confirm required ledgers are active.
3. Review pending overflow.

### 16.2 During The Day

1. Create tickets and transactions.
2. Use allocation preview when operators need manual placement.
3. Review `TCSO`.
4. Approve or refund exceptions.
5. Use collaborator exports when approval activity needs review.
6. Review reserve-capacity adjustments.

### 16.3 Thirty Minutes Before Close

1. Run `notify_pending_overflows`.
2. Review notification records.
3. Resolve critical pending overflow manually.

### 16.4 End Of Period

1. Close the period manually or by scheduled command.
2. Confirm pending `TCSO` became `CSO`.
3. Confirm ledgers are archived.
4. Export ledger reports if required.
5. Export collaborator reports if approval audit is required.

## 17. Important Notes

- role data exists in the backend, but API permissions are still broad
- reserve ledgers are internal implementation details
- notifications are stored in the database, not sent by email yet
- refund behavior restores capacity through tracked adjustments rather than silent deletion
