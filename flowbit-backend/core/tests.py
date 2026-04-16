from decimal import Decimal
from datetime import datetime

from django.core.management import call_command
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from core.models import (
    Period,
    Identifier,
    IdentifierCapacityAdjustment,
    Ledger,
    Overflow,
    OverflowNotification,
    Ticket,
    Transaction,
)


class LedgerArchiveAPITests(APITestCase):
    def setUp(self):
        self.identifier = Identifier.objects.create(number='101')
        self.collaborator = User.objects.create_user(
            username='helper_user',
            first_name='Helper',
            last_name='User',
            password='password123',
        )
        self.approver = User.objects.create_user(
            username='approver_user',
            first_name='Approver',
            last_name='User',
            password='password123',
        )

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

    def test_closing_ledger_reallocates_pending_overflow_into_other_active_ledgers(self):
        self.active_period.close(closed_at=timezone.now())

        now = timezone.make_aware(datetime(2027, 1, 1, 12, 0, 0))
        period = Period.objects.create(
            name='Overflow Resolution Period',
            start_date=now,
            end_date=now + timezone.timedelta(days=30),
            is_open=True,
        )
        primary_ledger = Ledger.objects.create(
            period=period,
            name='Primary Ledger',
            end_date=period.end_date,
            limit_per_identifier=Decimal('100.00'),
            priority=1,
            is_active=True,
        )
        tx = Transaction.objects.create(
            identifier=self.identifier,
            total_amount=Decimal('150.00'),
        )
        overflow = Overflow.objects.get(transaction=tx)

        backup_ledger = Ledger.objects.create(
            period=period,
            name='Backup Ledger',
            end_date=period.end_date,
            limit_per_identifier=Decimal('100.00'),
            priority=2,
            is_active=True,
        )

        primary_ledger.close(closed_at=now)

        primary_ledger.refresh_from_db()
        self.assertFalse(primary_ledger.is_active)
        self.assertTrue(
            tx.allocations.filter(ledger=backup_ledger, amount=Decimal('50.00')).exists()
        )
        self.assertFalse(Overflow.objects.filter(pk=overflow.pk).exists())

    def test_closing_period_converts_remaining_pending_overflow(self):
        self.active_period.close(closed_at=timezone.now())

        now = timezone.make_aware(datetime(2027, 3, 1, 12, 0, 0))
        period = Period.objects.create(
            name='Final Overflow Period',
            start_date=now - timezone.timedelta(days=1),
            end_date=now + timezone.timedelta(days=30),
            is_open=True,
        )
        Ledger.objects.create(
            period=period,
            name='Only Ledger',
            end_date=period.end_date,
            limit_per_identifier=Decimal('100.00'),
            priority=1,
            is_active=True,
        )
        tx = Transaction.objects.create(
            identifier=self.identifier,
            total_amount=Decimal('150.00'),
        )
        overflow = Overflow.objects.get(transaction=tx)

        period.close(closed_at=now)

        overflow.refresh_from_db()
        self.assertEqual(overflow.status, 'CSO')
        self.assertEqual(overflow.amount_to_approve, Decimal('50.00'))
        self.assertEqual(overflow.excess_amount, Decimal('50.00'))
        self.assertEqual(overflow.approved_at, now)
        self.assertEqual(overflow.helper_name, 'system')

    def test_period_create_accepts_date_only_and_defaults_close_time(self):
        self.active_period.close(closed_at=timezone.now())

        response = self.client.post('/api/periods/', {
            'name': 'Date Only Period',
            'start_date': '2027-04-01',
            'end_date': '2027-04-30',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        period = Period.objects.get(id=response.data['id'])
        self.assertEqual(period.start_date.hour, 0)
        self.assertEqual(period.start_date.minute, 0)
        self.assertEqual(period.end_date.hour, 15)
        self.assertEqual(period.end_date.minute, 0)
        self.assertEqual(period.end_date.date().isoformat(), '2027-04-30')

    def test_period_create_accepts_date_only_with_custom_close_time(self):
        self.active_period.close(closed_at=timezone.now())

        response = self.client.post('/api/periods/', {
            'name': 'Custom Close Time Period',
            'start_date': '2027-05-01',
            'end_date': '2027-05-31',
            'close_time': '17:30:00',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        period = Period.objects.get(id=response.data['id'])
        self.assertEqual(period.end_date.hour, 17)
        self.assertEqual(period.end_date.minute, 30)

    def test_ledger_create_defaults_end_date_from_period(self):
        response = self.client.post('/api/ledgers/', {
            'period': self.active_period.id,
            'name': 'Inherited Ledger',
            'limit_per_identifier': '100.00',
            'priority': 2,
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        ledger = Ledger.objects.get(id=response.data['id'])
        self.assertEqual(ledger.end_date, self.active_period.end_date)

    def test_ledger_create_uses_period_date_with_custom_close_time(self):
        response = self.client.post('/api/ledgers/', {
            'period': self.active_period.id,
            'name': 'Custom Time Ledger',
            'limit_per_identifier': '100.00',
            'priority': 2,
            'close_time': '16:45:00',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        ledger = Ledger.objects.get(id=response.data['id'])
        self.assertEqual(ledger.end_date.date(), self.active_period.end_date.date())
        self.assertEqual(ledger.end_date.hour, 16)
        self.assertEqual(ledger.end_date.minute, 45)

    def test_ledger_create_rejects_duplicate_active_priority_in_same_period(self):
        response = self.client.post('/api/ledgers/', {
            'period': self.active_period.id,
            'name': 'Duplicate Priority Ledger',
            'limit_per_identifier': '100.00',
            'priority': 1,
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data['priority'][0],
            'An active ledger with this priority already exists in the selected period.'
        )

    def test_approving_overflow_above_excess_creates_identifier_capacity_adjustment(self):
        tx = Transaction.objects.create(
            identifier=self.identifier,
            total_amount=Decimal('250.00'),
        )
        overflow = Overflow.objects.get(transaction=tx)

        response = self.client.post(
            f'/api/overflows/{overflow.id}/approve/',
            {
                'amount_to_approve': '180.00',
                'collaborator_ids': [self.collaborator.id],
            },
            format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        overflow.refresh_from_db()
        self.assertEqual(overflow.status, 'CSO')
        self.assertEqual(overflow.amount_to_approve, Decimal('180.00'))
        self.assertEqual(overflow.helper_name, 'Helper User')
        self.assertEqual(list(overflow.collaborators.values_list('id', flat=True)), [self.collaborator.id])

        adjustment = IdentifierCapacityAdjustment.objects.get(overflow=overflow)
        self.assertEqual(adjustment.identifier, self.identifier)
        self.assertEqual(adjustment.period, self.active_period)
        self.assertEqual(adjustment.amount, Decimal('55.00'))

        reserve_ledger = Ledger.objects.get(period=self.active_period, is_capacity_reserve=True)
        self.assertEqual(reserve_ledger.limit_per_identifier, Decimal('0.00'))

    def test_refunding_approved_overflow_only_adds_refund_capacity(self):
        tx = Transaction.objects.create(
            identifier=self.identifier,
            total_amount=Decimal('250.00'),
        )
        overflow = Overflow.objects.get(transaction=tx)

        approve_response = self.client.post(
            f'/api/overflows/{overflow.id}/resolve/',
            {
                'action': 'approve',
                'amount_to_approve': '180.00',
                'collaborator_ids': [self.collaborator.id],
            },
            format='json'
        )
        self.assertEqual(approve_response.status_code, status.HTTP_200_OK)

        refund_response = self.client.post(
            f'/api/overflows/{overflow.id}/resolve/',
            {
                'action': 'refund_overflow_only',
                'helper_name': 'Bob',
            },
            format='json'
        )
        self.assertEqual(refund_response.status_code, status.HTTP_200_OK)

        overflow.refresh_from_db()
        self.assertEqual(overflow.status, Overflow.STATUS_REFUNDED)
        self.assertEqual(overflow.helper_name, 'Bob')

        adjustments = IdentifierCapacityAdjustment.objects.filter(overflow=overflow).order_by('created_at')
        self.assertEqual(adjustments.count(), 2)
        self.assertEqual(adjustments[0].amount, Decimal('55.00'))
        self.assertEqual(adjustments[1].amount, Decimal('125.00'))
        self.assertEqual(adjustments[1].adjustment_type, IdentifierCapacityAdjustment.TYPE_REFUND_CSO)

    def test_refunding_transaction_reprocesses_next_pending_overflow(self):
        tx1 = Transaction.objects.create(
            identifier=self.identifier,
            total_amount=Decimal('250.00'),
        )
        overflow1 = Overflow.objects.get(transaction=tx1)
        approve_response = self.client.post(
            f'/api/overflows/{overflow1.id}/resolve/',
            {
                'action': 'approve',
                'amount_to_approve': '50.00',
                'collaborator_ids': [self.collaborator.id],
            },
            format='json'
        )
        self.assertEqual(approve_response.status_code, status.HTTP_200_OK)

        tx2 = Transaction.objects.create(
            identifier=self.identifier,
            total_amount=Decimal('200.00'),
        )
        overflow2 = Overflow.objects.get(transaction=tx2)
        self.assertEqual(overflow2.excess_amount, Decimal('200.00'))

        refund_response = self.client.post(
            f'/api/overflows/{overflow1.id}/resolve/',
            {
                'action': 'refund_transaction',
                'helper_name': 'Helper 2',
            },
            format='json'
        )
        self.assertEqual(refund_response.status_code, status.HTTP_200_OK)

        tx1.refresh_from_db()
        self.assertTrue(tx1.is_refunded)
        overflow2.refresh_from_db()
        self.assertEqual(overflow2.status, Overflow.STATUS_TCSO)
        self.assertEqual(overflow2.excess_amount, Decimal('25.00'))
        self.assertTrue(
            tx2.allocations.filter(
                ledger__period=self.active_period,
                amount=Decimal('125.00'),
            ).exists()
        )
        self.assertTrue(
            tx2.allocations.filter(
                ledger__period=self.active_period,
                ledger__is_capacity_reserve=True,
                amount=Decimal('50.00'),
            ).exists()
        )

    def test_notify_pending_overflows_command_creates_pre_close_notifications(self):
        self.active_period.end_date = timezone.now() + timezone.timedelta(minutes=20)
        self.active_period.save(update_fields=['end_date'])
        self.active_ledger.end_date = self.active_period.end_date
        self.active_ledger.save(update_fields=['end_date'])

        tx = Transaction.objects.create(
            identifier=self.identifier,
            total_amount=Decimal('250.00'),
        )
        overflow = Overflow.objects.get(transaction=tx)

        call_command('notify_pending_overflows')

        notification = OverflowNotification.objects.get(overflow=overflow)
        self.assertEqual(notification.period, self.active_period)
        self.assertEqual(notification.notification_type, OverflowNotification.TYPE_PRE_CLOSE)

    def test_extra_approved_capacity_is_consumed_only_by_same_identifier(self):
        tx = Transaction.objects.create(
            identifier=self.identifier,
            total_amount=Decimal('250.00'),
        )
        overflow = Overflow.objects.get(transaction=tx)
        approval_response = self.client.post(
            f'/api/overflows/{overflow.id}/approve/',
            {
                'amount_to_approve': '180.00',
                'collaborator_ids': [self.collaborator.id],
            },
            format='json'
        )
        self.assertEqual(approval_response.status_code, status.HTTP_200_OK)

        follow_up_tx = Transaction.objects.create(
            identifier=self.identifier,
            total_amount=Decimal('30.00'),
        )
        self.assertFalse(Overflow.objects.filter(transaction=follow_up_tx).exists())
        self.assertTrue(
            follow_up_tx.allocations.filter(
                ledger__period=self.active_period,
                ledger__is_capacity_reserve=True,
                amount=Decimal('30.00'),
            ).exists()
        )

        other_identifier = Identifier.objects.get(number='102')
        blocked_tx = Transaction.objects.create(
            identifier=other_identifier,
            total_amount=Decimal('250.00'),
        )
        blocked_overflow = Overflow.objects.get(transaction=blocked_tx)
        self.assertEqual(blocked_overflow.excess_amount, Decimal('50.00'))

    def test_approve_overflow_requires_selected_collaborator(self):
        tx = Transaction.objects.create(
            identifier=self.identifier,
            total_amount=Decimal('250.00'),
        )
        overflow = Overflow.objects.get(transaction=tx)

        response = self.client.post(
            f'/api/overflows/{overflow.id}/approve/',
            {'amount_to_approve': '180.00'},
            format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['detail'], "['At least one collaborator must be selected.']")

    def test_approve_overflow_rejects_current_user_as_collaborator(self):
        self.client.force_authenticate(user=self.approver)
        tx = Transaction.objects.create(
            identifier=self.identifier,
            total_amount=Decimal('250.00'),
        )
        overflow = Overflow.objects.get(transaction=tx)

        response = self.client.post(
            f'/api/overflows/{overflow.id}/approve/',
            {
                'amount_to_approve': '180.00',
                'collaborator_ids': [self.approver.id],
            },
            format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['detail'], "['Current user cannot be selected as a collaborator.']")

    def test_collaborator_list_endpoint_returns_existing_users(self):
        response = self.client.get('/api/collaborators/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        collaborator_ids = {item['id'] for item in response.data}
        self.assertIn(self.collaborator.id, collaborator_ids)
        collaborator_row = next(item for item in response.data if item['id'] == self.collaborator.id)
        self.assertEqual(collaborator_row['full_name'], 'Helper User')

    def test_collaborator_export_transactions_uses_requested_format(self):
        tx1 = Transaction.objects.create(
            identifier=self.identifier,
            total_amount=Decimal('250.00'),
        )
        overflow1 = Overflow.objects.get(transaction=tx1)
        approve_one = self.client.post(
            f'/api/overflows/{overflow1.id}/approve/',
            {
                'amount_to_approve': '125.00',
                'collaborator_ids': [self.collaborator.id],
            },
            format='json'
        )
        self.assertEqual(approve_one.status_code, status.HTTP_200_OK)

        tx2 = Transaction.objects.create(
            identifier=Identifier.objects.get(number='102'),
            total_amount=Decimal('225.00'),
        )
        overflow2 = Overflow.objects.get(transaction=tx2)
        approve_two = self.client.post(
            f'/api/overflows/{overflow2.id}/approve/',
            {
                'amount_to_approve': '100.00',
                'collaborator_ids': [self.collaborator.id],
            },
            format='json'
        )
        self.assertEqual(approve_two.status_code, status.HTTP_200_OK)

        response = self.client.get(
            f'/api/collaborators/{self.collaborator.id}/export-transactions/',
            {
                'period_id': self.active_period.id,
                'sort_by': 'identifier',
                'sort_order': 'asc',
            }
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        csv_body = response.content.decode('utf-8')
        self.assertIn('Name,Helper User', csv_body)
        self.assertIn(f'Period,{self.active_period.name}', csv_body)
        self.assertIn('Transactions', csv_body)
        self.assertIn('101,.,125.00', csv_body)
        self.assertIn('102,.,100.00', csv_body)
        self.assertTrue(csv_body.index('101,.,125.00') < csv_body.index('102,.,100.00'))
        self.assertIn('Total Amount,,225.00', csv_body)

    def test_collaborator_export_transactions_can_sort_by_approved_time(self):
        later_collaborator = User.objects.create_user(
            username='later_helper',
            first_name='Later',
            last_name='Helper',
            password='password123',
        )

        tx1 = Transaction.objects.create(
            identifier=self.identifier,
            total_amount=Decimal('250.00'),
        )
        overflow1 = Overflow.objects.get(transaction=tx1)
        approve_one = self.client.post(
            f'/api/overflows/{overflow1.id}/approve/',
            {
                'amount_to_approve': '125.00',
                'collaborator_ids': [later_collaborator.id],
            },
            format='json'
        )
        self.assertEqual(approve_one.status_code, status.HTTP_200_OK)

        tx2 = Transaction.objects.create(
            identifier=Identifier.objects.get(number='102'),
            total_amount=Decimal('250.00'),
        )
        overflow2 = Overflow.objects.get(transaction=tx2)
        approve_two = self.client.post(
            f'/api/overflows/{overflow2.id}/approve/',
            {
                'amount_to_approve': '125.00',
                'collaborator_ids': [later_collaborator.id],
            },
            format='json'
        )
        self.assertEqual(approve_two.status_code, status.HTTP_200_OK)

        overflow1.refresh_from_db()
        overflow2.refresh_from_db()
        overflow1.approved_at = timezone.make_aware(datetime(2027, 1, 1, 10, 0, 0))
        overflow2.approved_at = timezone.make_aware(datetime(2027, 1, 1, 9, 0, 0))
        overflow1.save(update_fields=['approved_at'])
        overflow2.save(update_fields=['approved_at'])

        response = self.client.get(
            f'/api/collaborators/{later_collaborator.id}/export-transactions/',
            {
                'period_id': self.active_period.id,
                'sort_by': 'approved_at',
                'sort_order': 'asc',
            }
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        csv_body = response.content.decode('utf-8')
        self.assertTrue(csv_body.index('102,.,125.00') < csv_body.index('101,.,125.00'))
        self.assertIn('Name,Later Helper', csv_body)
        self.assertIn('Total Amount,,250.00', csv_body)

    def test_allocation_preview_uses_priority_by_default(self):
        backup_ledger = Ledger.objects.create(
            period=self.active_period,
            name='Backup Ledger',
            end_date=self.active_period.end_date,
            limit_per_identifier=Decimal('100.00'),
            priority=2,
            is_active=True,
        )

        response = self.client.post('/api/transactions/allocation-preview/', {
            'identifier': self.identifier.id,
            'total_amount': '180.00',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['overflow_amount'], '0.00')
        self.assertEqual(response.data['ledger_allocations'][0]['ledger_id'], self.active_ledger.id)
        self.assertEqual(response.data['ledger_allocations'][0]['allocated_amount'], '125.00')
        self.assertEqual(response.data['ledger_allocations'][1]['ledger_id'], backup_ledger.id)
        self.assertEqual(response.data['ledger_allocations'][1]['allocated_amount'], '55.00')

    def test_allocation_preview_supports_manual_amounts_and_feedback(self):
        backup_ledger = Ledger.objects.create(
            period=self.active_period,
            name='Manual Backup Ledger',
            end_date=self.active_period.end_date,
            limit_per_identifier=Decimal('100.00'),
            priority=2,
            is_active=True,
        )

        response = self.client.post('/api/transactions/allocation-preview/', {
            'identifier': self.identifier.id,
            'total_amount': '230.00',
            'manual_allocations': [
                {'ledger': self.active_ledger.id, 'amount': '150.00'},
                {'ledger': backup_ledger.id, 'amount': '50.00'},
            ],
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['ledger_allocations'][0]['allocated_amount'], '125.00')
        self.assertEqual(response.data['ledger_allocations'][0]['overflow_amount'], '25.00')
        self.assertFalse(response.data['ledger_allocations'][0]['fits'])
        self.assertEqual(response.data['ledger_allocations'][1]['allocated_amount'], '50.00')
        self.assertEqual(response.data['overflow_amount'], '30.00')
        self.assertTrue(response.data['has_overflow'])

    def test_transaction_create_rejects_overflow_when_allow_overflow_is_false(self):
        response = self.client.post('/api/transactions/', {
            'identifier': self.identifier.id,
            'total_amount': '250.00',
            'allow_overflow': False,
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['detail'], 'Transaction does not fit available capacity.')
        self.assertEqual(response.data['preview']['overflow_amount'], '125.00')

    def test_transaction_create_supports_manual_allocation_selection(self):
        backup_ledger = Ledger.objects.create(
            period=self.active_period,
            name='Selected Ledger',
            end_date=self.active_period.end_date,
            limit_per_identifier=Decimal('100.00'),
            priority=2,
            is_active=True,
        )

        response = self.client.post('/api/transactions/', {
            'identifier': self.identifier.id,
            'total_amount': '230.00',
            'manual_allocations': [
                {'ledger': self.active_ledger.id, 'amount': '100.00'},
                {'ledger': backup_ledger.id, 'amount': '80.00'},
            ],
            'allow_overflow': True,
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        transaction_id = response.data['id']
        tx = Transaction.objects.get(id=transaction_id)
        self.assertTrue(tx.allocations.filter(ledger=self.active_ledger, amount=Decimal('100.00')).exists())
        self.assertTrue(tx.allocations.filter(ledger=backup_ledger, amount=Decimal('80.00')).exists())
        overflow = Overflow.objects.get(transaction=tx)
        self.assertEqual(overflow.excess_amount, Decimal('50.00'))
        self.assertEqual(response.data['allocation_preview']['overflow_amount'], '50.00')
