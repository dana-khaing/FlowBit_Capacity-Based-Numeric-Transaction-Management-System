from decimal import Decimal
from datetime import datetime

from django.core.management import call_command
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from core.models import Period, Identifier, Ledger, Overflow, Ticket, Transaction


class LedgerArchiveAPITests(APITestCase):
    def setUp(self):
        self.identifier = Identifier.objects.create(number='101')

        january_start = timezone.make_aware(datetime(2026, 1, 1, 0, 0, 0))
        january_end = timezone.make_aware(datetime(2026, 1, 31, 23, 59, 59))
        february_start = timezone.make_aware(datetime(2026, 2, 1, 0, 0, 0))
        december_end = timezone.make_aware(datetime(2026, 12, 31, 23, 59, 59))

        archived_closed_at = timezone.make_aware(datetime(2026, 2, 1, 0, 0, 0))
        self.archived_period = Period.objects.create(
            name='January 2026 Period',
            start_date=january_start,
            end_date=january_end,
            is_open=True,
        )
        self.archived_ledger = Ledger.objects.create(
            period=self.archived_period,
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
        self.archived_period.close(closed_at=archived_closed_at)
        self.archived_period.refresh_from_db()
        self.archived_ledger.refresh_from_db()

        self.active_period = Period.objects.create(
            name='Current Period',
            start_date=february_start,
            end_date=december_end,
            is_open=True,
        )
        self.active_ledger = Ledger.objects.create(
            period=self.active_period,
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

    def test_period_close_archives_related_ledgers(self):
        response = self.client.post(f'/api/periods/{self.active_period.id}/close/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.active_period.refresh_from_db()
        self.active_ledger.refresh_from_db()
        self.assertFalse(self.active_period.is_open)
        self.assertFalse(self.active_ledger.is_active)
        self.assertIsNotNone(self.active_ledger.closed_at)

    def test_current_period_returns_open_period(self):
        response = self.client.get('/api/periods/current/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['id'], self.active_period.id)
        self.assertTrue(response.data['is_open'])

    def test_period_summary_returns_dashboard_totals(self):
        response = self.client.get(f'/api/periods/{self.active_period.id}/summary/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['period_id'], self.active_period.id)
        self.assertEqual(response.data['ledger_count'], 1)
        self.assertEqual(response.data['transaction_count'], 1)
        self.assertEqual(response.data['ticket_count'], 1)
        self.assertEqual(response.data['overflow_count'], 0)
        self.assertEqual(response.data['total_transaction_amount'], '75')

    def test_ledgers_can_be_filtered_by_period_id(self):
        response = self.client.get('/api/ledgers/', {'period_id': self.active_period.id})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['id'], self.active_ledger.id)

    def test_tickets_can_be_filtered_by_period(self):
        response = self.client.get('/api/tickets/', {
            'section': 'archive',
            'period_id': self.archived_period.id,
        })

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['ticket_number'], self.archived_transaction.ticket.ticket_number)

    def test_overflows_can_be_filtered_by_archive_section(self):
        response = self.client.get('/api/overflows/', {'section': 'archive'})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['id'], self.archived_overflow.id)

    def test_close_expired_periods_command_closes_matching_periods(self):
        self.active_period.close(closed_at=timezone.now())

        expired_period = Period.objects.create(
            name='Expired Period',
            start_date=timezone.make_aware(datetime(2025, 12, 1, 0, 0, 0)),
            end_date=timezone.make_aware(datetime(2025, 12, 31, 23, 59, 59)),
            is_open=True,
        )
        expired_ledger = Ledger.objects.create(
            period=expired_period,
            name='Expired Ledger',
            end_date=expired_period.end_date,
            limit_per_identifier=Decimal('100.00'),
            priority=3,
            is_active=True,
        )

        call_command('close_expired_periods')

        expired_period.refresh_from_db()
        expired_ledger.refresh_from_db()
        self.assertFalse(expired_period.is_open)
        self.assertFalse(expired_ledger.is_active)

    def test_ticket_creation_requires_open_period(self):
        self.active_period.close(closed_at=timezone.now())

        response = self.client.post('/api/tickets/create-with-items/', {
            'customer_name': 'Blocked Customer',
            'items': [
                {'identifier': self.identifier.id, 'amount': '50.00'},
            ],
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['detail'], 'No open period available.')
