# test_ticket_creation.py
from core.models import Ticket, Transaction, Identifier, Ledger
from decimal import Decimal
from django.utils import timezone
import traceback

print("=== Starting ticket test script ===\n")

# Make sure we have at least one active ledger
if not Ledger.objects.filter(is_active=True).exists():
    print("WARNING: No active ledgers found! Creating one...")
    Ledger.objects.create(
        name="Test Ledger",
        end_date=timezone.now() + timezone.timedelta(days=365),
        limit_per_identifier=Decimal("20000.00"),
        priority=1,
        is_active=True
    )
    print("Created test ledger.\n")

# Create a new ticket
print("Creating a new ticket...")
ticket = Ticket(
    customer_name="VS Code Test Customer",
    notes="Created from VS Code test script"
)
ticket.save()

print(f"Ticket created!")
print(f"  Ticket number: {ticket.ticket_number}")
print(f"  Created at:    {ticket.created_at}")
print(f"  Total so far:  {ticket.total_amount}\n")

# Find or create identifiers
print("Looking for identifiers...")
identifiers = {}
for num in ["001", "002", "003"]:
    try:
        ident = Identifier.objects.get(number=num)
        identifiers[num] = ident
        print(f"  Found identifier {num}")
    except Identifier.DoesNotExist:
        print(f"  Creating identifier {num}")
        ident = Identifier.objects.create(number=num)
        identifiers[num] = ident

# Create 3 transactions
print("\nCreating 3 transactions...")
amounts = [Decimal("4000.00"), Decimal("7000.00"), Decimal("9000.00")]
ids_used = ["001", "002", "001"]

for i, (amount, id_num) in enumerate(zip(amounts, ids_used), 1):
    try:
        tx = Transaction(
            ticket=ticket,
            identifier=identifiers[id_num],
            total_amount=amount
        )
        tx.save()
        print(f"  Transaction {i} created: {tx.order_number} - {tx.total_amount}")
    except Exception as e:
        print(f"  Error on transaction {i}: {e}")
        traceback.print_exc()

# Results
print("\n=== Results ===")
print(f"Ticket: {ticket.ticket_number}")
print(f"Total: {ticket.total_amount:,.2f}")
print(f"Transactions: {ticket.transaction_count}")

print("\nTransactions list:")
for tx in ticket.transactions.all():
    print(f"  - {tx.order_number} | {tx.total_amount:,.2f} | {tx.identifier.number}")