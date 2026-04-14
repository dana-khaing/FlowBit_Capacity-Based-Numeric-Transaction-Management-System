from decimal import Decimal
from datetime import datetime

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from core.models import Identifier, Ledger, Overflow, Ticket, Transaction


class LedgerArchiveAPITests(APITestCase):
    def setUp(self):
        self.identifier = Identifier.objects.create(number='101')

        january_start = timezone.make_aware(datetime(2026, 1, 1, 0, 0, 0))
        january_end = timezone.make_aware(datetime(2026, 1, 31, 23, 59, 59))
        february_start = timezone.make_aware(datetime(2026, 2, 1, 0, 0, 0))
        december_end = timezone.make_aware(datetime(2026, 12, 31, 23, 59, 59))

        self.archived_ledger = Ledger.objects.create(
            name='January 2026',
            end_date=january_end,
            limit_per_identifier=Decimal('100.00'),
            priority=1,
            is_active=True,
        )
        Ledger.objects.filter(pk=self.archived_ledger.pk).update(created_at=january_start)
        self.archived_ledger.refresh_from_db()

        archived_ticket = Ticket.objects.create(customer_name='Archived Customer')
        Transaction.objects.create(
            ticket=archived_ticket,
            identifier=self.identifier,
            total_amount=Decimal('150.00'),
        )
        self.archived_ledger.close(
            closed_at=timezone.make_aware(datetime(2026, 2, 1, 0, 0, 0))
        )

        self.active_ledger = Ledger.objects.create(
            name='Current Ledger',
            end_date=december_end,
            limit_per_identifier=Decimal('200.00'),
            priority=1,
            is_active=True,
        )
        Ledger.objects.filter(pk=self.active_ledger.pk).update(created_at=february_start)
        self.active_ledger.refresh_from_db()

        active_ticket = Ticket.objects.create(customer_name='Active Customer')
        self.active_transaction = Transaction.objects.create(
            ticket=active_ticket,
            identifier=self.identifier,
            total_amount=Decimal('75.00'),
        )

        self.archived_transaction = Transaction.objects.exclude(pk=self.active_transaction.pk).get()
        self.archived_overflow = Overflow.objects.get(transaction=self.archived_transaction)

    def test_manual_close_sets_closed_at(self):
        ledger = Ledger.objects.create(
            name='Close Me',
            end_date=timezone.now() + timezone.timedelta(days=1),
            limit_per_identifier=Decimal('100.00'),
            priority=2,
            is_active=True,
        )

        response = self.client.post(f'/api/ledgers/{ledger.id}/close/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ledger.refresh_from_db()
        self.assertFalse(ledger.is_active)
        self.assertIsNotNone(ledger.closed_at)

    def test_ledger_list_can_filter_archive_section(self):
        response = self.client.get('/api/ledgers/', {'section': 'archive'})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['id'], self.archived_ledger.id)
        self.assertIsNotNone(response.data[0]['closed_at'])

    def test_transactions_can_be_filtered_by_archive_section(self):
        response = self.client.get('/api/transactions/', {'section': 'archive'})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['id'], self.archived_transaction.id)

    def test_tickets_can_be_filtered_by_period(self):
        response = self.client.get('/api/tickets/', {
            'section': 'archive',
            'period_start': '2026-01-01',
            'period_end': '2026-01-31',
        })

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['ticket_number'], self.archived_transaction.ticket.ticket_number)

    def test_overflows_can_be_filtered_by_archive_section(self):
        response = self.client.get('/api/overflows/', {'section': 'archive'})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['id'], self.archived_overflow.id)
