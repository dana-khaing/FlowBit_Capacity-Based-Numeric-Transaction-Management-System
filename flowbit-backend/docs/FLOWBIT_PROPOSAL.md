# FlowBit Proposal

## 1. Purpose

This document presents FlowBit as a product proposal based on the current backend implementation.

## 2. Executive Summary

FlowBit is a period-based capacity allocation and overflow-resolution platform built around controlled identifiers and prioritized ledgers. It helps teams:

- manage capacity by accounting period
- allocate transactions across prioritized ledgers
- detect and handle overflow exceptions
- approve helper-driven reserve capacity for specific identifiers
- manage refund-driven capacity recovery
- maintain operational discipline at period close
- export ledger reports and support archive review
- export collaborator approval reports in CSV and PDF

FlowBit is suitable for controlled environments where capacity must be distributed carefully and exceptions must be tracked clearly.

## 3. Problem Statement

Teams managing shared operational or monetary capacity often face:

- inconsistent period control
- manual spreadsheet tracking
- unclear ledger priority handling
- unresolved overflow at close time
- weak traceability for approvals and refunds
- no systematic way to return capacity after reversals

FlowBit solves these problems by combining period governance, ledger capacity, overflow workflows, reserve-capacity adjustments, and reporting in one platform.

## 4. Product Vision

FlowBit should be positioned as:

`A controlled capacity allocation and overflow-resolution platform for period-based operations.`

This positioning matches the actual backend, which already supports:

- periods
- prioritized ledgers
- identifiers
- tickets and transactions
- overflow approval and refund workflows
- helper-based reserve capacity
- close-time automation
- notifications
- exports
- archive analysis

## 5. Core Product Concepts

### 5.1 Period

A period defines the active operating window.

Business value:

- allows strict start and end boundaries
- ensures only one open period exists
- supports archive separation
- provides close-time automation for unresolved overflow

### 5.2 Ledger

A ledger is a capacity bucket inside a period.

Business value:

- supports planned capacity distribution
- allows ordered allocation by priority
- enables staged usage across multiple ledgers

### 5.3 Identifier

An identifier is a 3-digit code from `000` to `999`.

Business value:

- capacity is monitored and controlled at identifier level
- utilization, remaining capacity, and overflow can be tracked per identifier

### 5.4 Ticket And Transaction

A ticket groups one or more transactions. Each transaction is posted against one identifier.

Business value:

- supports batch intake
- keeps related transactions together
- enables ticket-level refund workflows

### 5.5 Overflow

Overflow represents the unallocated remainder of a transaction.

Business value:

- exposes exceptions clearly
- supports approval, refund, and close-time workflows
- prevents hidden overuse of normal capacity

### 5.6 Reserve Capacity

Reserve capacity is identifier-specific extra capacity created through helper approval or refund recovery.

Business value:

- allows controlled exceptions
- avoids changing capacity for all identifiers
- keeps special-case capacity targeted and traceable

## 6. Current Product Strengths

- Single-open-period enforcement
- Priority-based ledger allocation
- Automatic identifier generation
- Pending and approved overflow workflows
- Helper-driven reserve capacity
- Refund-driven capacity restoration
- Ticket-level batch transaction creation
- Ledger report export in CSV and PDF
- Collaborator approval export in CSV and PDF
- Pre-close overflow notification support
- Period and ledger auto-close operations
- Archive filtering for historical analysis
- Admin visibility for operations staff

## 7. Current Feature Scope

FlowBit currently includes:

- Period creation, filtering, summary, and close
- Ledger creation, priority control, close, reorder, and export
- Identifier capacity and overflow visibility
- Ticket creation with multiple transactions
- Transaction allocation across active ledgers
- Default transaction allocation by ledger priority
- Manual transaction allocation by user-selected ledger and amount
- Allocation preview before transaction creation
- Overflow confirmation support when requested allocation exceeds capacity
- Overflow approval and unified overflow resolution
- Overflow refund at overflow, transaction, and ticket level
- Identifier-specific reserve capacity adjustments
- Pre-close overflow notifications
- Collaborator-based approval reporting with period and sort options
- Admin support for core operational entities
- Scheduled close and notification management commands

## 8. Business Workflows Supported

### 8.1 Open A New Period

- create period
- create ledgers
- begin posting transactions

### 8.2 Allocate Transactions

- allocate to active ledgers in priority order
- optionally let the user choose which ledgers receive which amounts first
- preview capacity before create
- reject create when overflow is not allowed
- consume reserve capacity if available
- create overflow for any remainder

### 8.3 Resolve Overflow

- approve exact overflow amount
- approve extra amount and create reserve capacity
- refund only the overflow
- refund the whole transaction
- refund the whole ticket

### 8.4 Retry Pending Overflow

When capacity returns:

- pending overflow for the same identifier is retried oldest-first
- it is absorbed where possible
- any remaining shortfall stays pending

### 8.5 Close A Period

- notify pending overflow before close
- auto-convert unresolved `TCSO` to `CSO`
- close ledgers and archive the period

### 8.6 Export Collaborator Approval Reports

- export approved `CSO` activity for one collaborator
- filter the report by period
- sort rows by identifier or approval time
- download the report in CSV or PDF
- review collaborator totals for audit and operational control

## 9. Target Users

FlowBit is appropriate for:

- operations teams
- finance control teams
- capacity planning teams
- exception-management teams
- back-office support teams

It is especially useful where:

- period close matters
- priorities matter
- exceptions need named helper handling
- refunds must return usable capacity

## 10. Differentiators

FlowBit is not just a ledger tracker. Its differentiators are:

- period-aware allocation
- identifier-level overflow handling
- helper-specific reserve capacity
- refund-triggered capacity recovery
- automated pre-close operational controls
- collaborator-level approval reporting

These features make it more operationally useful than a simple static ledger system.

## 11. Manual Allocation Capability

FlowBit now supports two transaction allocation modes:

- automatic mode, where capacity is filled by ledger priority
- manual mode, where the user chooses which ledger should absorb which amount

This is important because some teams want system-default behavior most of the time, but still need manual override for operational exceptions.

The backend now supports:

- previewing available capacity before transaction creation
- returning ledger-level fit or overflow feedback
- allowing the user to continue and create `TCSO` when capacity is short
- blocking creation when the user has not agreed to overflow

This makes FlowBit more suitable for guided operator workflows and richer frontend interaction.

## 12. Recommended Next Improvements

The highest-value future improvements would be:

- permission enforcement by role
- richer audit logging for every resolution event
- dashboard views for overflow and reserve capacity
- explicit ticket workflow states
- delivery channels for notifications such as email or push
- reporting for refunds and helper activity

## 13. Conclusion

FlowBit is already a strong operational platform for period-based capacity allocation and overflow control. Its most valuable qualities are:

- structured period governance
- prioritized ledger allocation
- optional manual allocation override
- clear overflow visibility
- helper-driven exception handling
- reserve-capacity flexibility
- refund-aware capacity recovery

It should be presented as a full operational control platform, not only as a ledger tool.
