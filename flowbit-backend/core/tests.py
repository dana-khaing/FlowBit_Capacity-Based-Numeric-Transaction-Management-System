from io import StringIO
from decimal import Decimal
from datetime import datetime, time, timedelta
import tempfile
from unittest.mock import patch

from django.core.management import call_command
from django.core import mail
from django.contrib.auth.models import User
from django.db.models import Q, Sum
from django.test import override_settings
from django.test import SimpleTestCase
from django.utils import timezone
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework.authtoken.models import Token

from core.models import (
    Period,
    LuckyDraw,
    Identifier,
    IdentifierLedgerFreeze,
    IdentifierCapacityAdjustment,
    Ledger,
    LedgerAllocation,
    Overflow,
    OverflowNotification,
    UserNotification,
    AuditLog,
    PasswordResetToken,
    EmailVerificationToken,
    OverrideResetToken,
    Profile,
    Collaborator,
    Ticket,
    Transaction,
    SupportCase,
    SupportMessage,
    RepeatTicket,
    RepeatTicketGeneration,
)
from flowbit_backend.db_config import build_database_config


class DatabaseConfigTests(SimpleTestCase):
    databases = {'default'}

    def test_build_database_config_from_database_url(self):
        config = build_database_config({
            'DATABASE_URL': 'postgresql://postgres:secret@db.example.supabase.co:5432/postgres?sslmode=require&connect_timeout=10',
            'DB_CONN_MAX_AGE': '120',
        })

        self.assertEqual(config['default']['ENGINE'], 'django.db.backends.postgresql')
        self.assertEqual(config['default']['NAME'], 'postgres')
        self.assertEqual(config['default']['USER'], 'postgres')
        self.assertEqual(config['default']['HOST'], 'db.example.supabase.co')
        self.assertEqual(config['default']['PORT'], '5432')
        self.assertEqual(config['default']['OPTIONS']['sslmode'], 'require')
        self.assertEqual(config['default']['OPTIONS']['connect_timeout'], 10)
        self.assertEqual(config['default']['CONN_MAX_AGE'], 120)

    def test_build_database_config_from_discrete_env_values(self):
        config = build_database_config({
            'DB_NAME': 'flowbit_db',
            'DB_USER': 'flowbit_user',
            'DB_PASSWORD': 'secret',
            'DB_HOST': 'localhost',
            'DB_PORT': '5433',
            'DB_SSLMODE': 'require',
            'DB_DISABLE_SERVER_SIDE_CURSORS': 'true',
        })

        self.assertEqual(config['default']['NAME'], 'flowbit_db')
        self.assertEqual(config['default']['USER'], 'flowbit_user')
        self.assertEqual(config['default']['HOST'], 'localhost')
        self.assertEqual(config['default']['PORT'], '5433')
        self.assertEqual(config['default']['OPTIONS']['sslmode'], 'require')
        self.assertTrue(config['default']['DISABLE_SERVER_SIDE_CURSORS'])

    def test_build_database_config_defaults_to_non_persistent_connections_for_supabase_pooler(self):
        config = build_database_config({
            'DATABASE_URL': 'postgresql://postgres.project:secret@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require',
        })

        self.assertEqual(config['default']['CONN_MAX_AGE'], 0)
        self.assertTrue(config['default']['DISABLE_SERVER_SIDE_CURSORS'])

    def test_explicit_pooler_connection_settings_override_defaults(self):
        config = build_database_config({
            'DATABASE_URL': 'postgresql://postgres.project:secret@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require',
            'DB_CONN_MAX_AGE': '120',
            'DB_DISABLE_SERVER_SIDE_CURSORS': 'false',
        })

        self.assertEqual(config['default']['CONN_MAX_AGE'], 120)
        self.assertFalse(config['default'].get('DISABLE_SERVER_SIDE_CURSORS', False))

    def test_check_database_connection_command_succeeds(self):
        out = StringIO()

        call_command('check_database_connection', stdout=out)

        output = out.getvalue()
        self.assertIn('Database configuration:', output)
        self.assertIn('Database connection succeeded.', output)


class OperationalDataPurgeCommandTests(APITestCase):
    def test_purge_operational_data_keeps_users_and_profiles(self):
        admin_user = User.objects.create_user(username='purge_admin', password='password123')
        admin_user.profile.role = 'admin'
        admin_user.profile.save(update_fields=['role', 'updated_at'])
        regular_user = User.objects.create_user(username='purge_user', password='password123')

        identifier = Identifier.objects.create(number='101')
        period = Period.objects.create(
            name='Purge Period',
            start_date=timezone.make_aware(datetime(2027, 1, 1, 0, 0, 0)),
            end_date=timezone.make_aware(datetime(2027, 1, 31, 23, 59, 59)),
            is_open=True,
        )
        ledger = Ledger.objects.create(
            owner=admin_user,
            period=period,
            name='Purge Ledger',
            end_date=period.end_date,
            limit_per_identifier=Decimal('100.00'),
            priority=1,
            is_active=True,
        )
        Ledger.get_capacity_reserve(period, admin_user, create=True)
        ticket = Ticket.objects.create(customer_name='Purge Ticket', created_by=admin_user)
        transaction_obj = Transaction.objects.create(
            ticket=ticket,
            identifier=identifier,
            total_amount=Decimal('150.00'),
            created_by=admin_user,
        )
        overflow = Overflow.objects.get(transaction=transaction_obj)
        OverflowNotification.objects.create(
            overflow=overflow,
            period=period,
            message='Test notification',
        )
        PasswordResetToken.issue_for_user(regular_user, expiry_hours=1)
        OverrideResetToken.issue_for_user(admin_user, expiry_hours=1)
        Collaborator.objects.create(
            owner=admin_user,
            username='purge_helper',
            full_name='Purge Helper',
            email='purge-helper@example.com',
            phone_number='555555',
        )
        AuditLog.objects.create(action='test.audit', user=admin_user)

        out = StringIO()
        call_command('purge_operational_data', stdout=out)

        self.assertEqual(User.objects.count(), 2)
        self.assertEqual(Profile.objects.count(), 2)
        self.assertFalse(Period.objects.exists())
        self.assertFalse(Ledger.objects.exists())
        self.assertFalse(Ticket.objects.exists())
        self.assertFalse(Transaction.objects.exists())
        self.assertFalse(Overflow.objects.exists())
        self.assertFalse(OverflowNotification.objects.exists())
        self.assertFalse(IdentifierCapacityAdjustment.objects.exists())
        self.assertFalse(Collaborator.objects.exists())
        self.assertFalse(PasswordResetToken.objects.exists())
        self.assertFalse(OverrideResetToken.objects.exists())
        self.assertFalse(AuditLog.objects.exists())
        self.assertFalse(Identifier.objects.exists())
        self.assertIn('Deleted', out.getvalue())


class IdentifierBootstrapTests(APITestCase):
    def test_identifier_options_bootstrap_identifiers_without_standard_ledger(self):
        user = User.objects.create_user(username='options_owner', password='password123')
        self.client.force_authenticate(user=user)

        self.assertEqual(Identifier.objects.count(), 0)

        response = self.client.get('/api/identifiers/options/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1000)
        self.assertEqual(Identifier.objects.count(), 1000)
        self.assertEqual(response.data[0]['number'], '000')
        self.assertEqual(response.data[-1]['number'], '999')

    def test_repeat_ticket_create_bootstraps_identifiers_without_standard_ledger(self):
        user = User.objects.create_user(username='repeat_bootstrap_owner', password='password123')
        self.client.force_authenticate(user=user)

        self.assertEqual(Identifier.objects.count(), 0)

        response = self.client.post(
            '/api/repeat-tickets/',
            {
                'customer_name': 'Bootstrap Repeat',
                'items': [
                    {
                        'identifier_number': '101',
                        'amount': '50.00',
                        'amount_uses_allocation_basis': False,
                        'use_permutations': False,
                        'position': 0,
                    },
                ],
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Identifier.objects.count(), 1000)
        self.assertEqual(response.data['items'][0]['identifier_number'], '101')

    def test_first_standard_ledger_creates_identifiers_even_if_reserve_exists(self):
        owner = User.objects.create_user(username='ledger_owner', password='password123')
        period = Period.objects.create(
            name='Bootstrap Period',
            start_date=timezone.make_aware(datetime(2027, 2, 1, 0, 0, 0)),
            end_date=timezone.make_aware(datetime(2027, 2, 28, 23, 59, 59)),
            is_open=True,
        )

        reserve = Ledger.get_capacity_reserve(period, owner, create=True)

        self.assertTrue(reserve.is_capacity_reserve)
        self.assertEqual(Identifier.objects.count(), 0)

        Ledger.objects.create(
            owner=owner,
            period=period,
            name='Primary Ledger',
            end_date=period.end_date,
            limit_per_identifier=Decimal('100.00'),
            priority=1,
            is_active=True,
        )

        self.assertEqual(Identifier.objects.count(), 1000)
        self.assertTrue(Identifier.objects.filter(number='000').exists())
        self.assertTrue(Identifier.objects.filter(number='999').exists())


class ApiDocumentationTests(APITestCase):
    def setUp(self):
        self.admin_user = User.objects.create_user(username='docs_admin', password='password123')
        self.admin_user.profile.role = 'admin'
        self.admin_user.profile.save(update_fields=['role', 'updated_at'])
        self.regular_user = User.objects.create_user(username='docs_user', password='password123')

    @override_settings(DEBUG=True)
    def test_openapi_schema_endpoint_returns_json(self):
        response = self.client.get('/api/schema/')
        schema = response.json()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response['Content-Type'], 'application/vnd.oai.openapi+json')
        self.assertIn('openapi', schema)
        self.assertIn('/api/auth/login/', schema['paths'])
        self.assertEqual(schema['paths']['/api/auth/login/']['post']['tags'], ['Authentication'])
        self.assertEqual(schema['paths']['/api/tickets/']['get']['tags'], ['Tickets'])
        self.assertIn('Authorization: Token <token>', schema['info']['description'])

    @override_settings(DEBUG=True)
    def test_swagger_ui_page_renders(self):
        response = self.client.get('/api/docs/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('SwaggerUIBundle', response.content.decode('utf-8'))
        self.assertIn('/api/schema/', response.content.decode('utf-8'))

    @override_settings(DEBUG=True)
    def test_redoc_page_renders(self):
        response = self.client.get('/api/redoc/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('redoc', response.content.decode('utf-8').lower())
        self.assertIn('/api/schema/', response.content.decode('utf-8'))

    @override_settings(DEBUG=False)
    def test_schema_requires_admin_when_debug_is_false(self):
        unauthenticated_response = self.client.get('/api/schema/')
        self.assertEqual(unauthenticated_response.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_login(self.regular_user)
        regular_response = self.client.get('/api/schema/')
        self.assertEqual(regular_response.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_login(self.admin_user)
        admin_response = self.client.get('/api/schema/')
        self.assertEqual(admin_response.status_code, status.HTTP_200_OK)

    @override_settings(DEBUG=False)
    def test_docs_pages_require_admin_when_debug_is_false(self):
        self.assertEqual(self.client.get('/api/docs/').status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.get('/api/redoc/').status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_login(self.admin_user)
        self.assertEqual(self.client.get('/api/docs/').status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.get('/api/redoc/').status_code, status.HTTP_200_OK)


class AuthAPITests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='auth_user',
            password='password123',
            first_name='Auth',
            last_name='User',
            email='auth@example.com',
        )

    def test_profile_is_created_for_new_user(self):
        self.assertTrue(Profile.objects.filter(user=self.user).exists())
        self.assertEqual(self.user.profile.role, 'user')

    def test_register_creates_user_profile_and_returns_user_payload(self):
        response = self.client.post('/api/auth/register/', {
            'full_name': 'New Flow User',
            'username': 'new_flow_user',
            'email': 'new-user@example.com',
            'phone_number': '+44-7000-000001',
            'password': 'strong-pass-456',
            'confirm_password': 'strong-pass-456',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        created_user = User.objects.get(username='new_flow_user')
        self.assertEqual(created_user.email, 'new-user@example.com')
        self.assertFalse(created_user.is_active)
        self.assertEqual(created_user.first_name, 'New')
        self.assertEqual(created_user.last_name, 'Flow User')
        self.assertEqual(created_user.profile.phone_number, '+44-7000-000001')
        self.assertEqual(response.data['user']['phone_number'], '+44-7000-000001')
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn('Selector:', mail.outbox[0].body)
        self.assertIn('Token:', mail.outbox[0].body)
        self.assertTrue(EmailVerificationToken.objects.filter(user=created_user).exists())
        self.assertTrue(AuditLog.objects.filter(action='auth.register', target_id=created_user.id).exists())
        self.assertTrue(AuditLog.objects.filter(action='auth.email_verification_requested', target_id=created_user.id).exists())

    def test_register_rejects_duplicate_email(self):
        response = self.client.post('/api/auth/register/', {
            'full_name': 'Another User',
            'username': 'another_user',
            'email': 'auth@example.com',
            'phone_number': '+44-7000-000002',
            'password': 'strong-pass-456',
            'confirm_password': 'strong-pass-456',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('email', response.data)

    def test_register_rejects_password_mismatch(self):
        response = self.client.post('/api/auth/register/', {
            'full_name': 'Mismatch User',
            'username': 'mismatch_user',
            'email': 'mismatch@example.com',
            'phone_number': '+44-7000-000003',
            'password': 'strong-pass-456',
            'confirm_password': 'other-pass-789',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('confirm_password', response.data)

    @patch('core.views.send_mail', side_effect=Exception('smtp down'))
    def test_register_returns_operational_error_when_verification_email_fails(self, mock_send_mail):
        response = self.client.post('/api/auth/register/', {
            'full_name': 'Delivery Failure User',
            'username': 'delivery_failure_user',
            'email': 'delivery-failure@example.com',
            'phone_number': '+44-7000-000009',
            'password': 'strong-pass-456',
            'confirm_password': 'strong-pass-456',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertEqual(
            response.data['detail'],
            'Account created, but we could not send the verification email right now. Please try resending verification shortly.',
        )
        created_user = User.objects.get(username='delivery_failure_user')
        self.assertFalse(created_user.is_active)
        self.assertTrue(AuditLog.objects.filter(action='auth.register', target_id=created_user.id).exists())
        self.assertTrue(AuditLog.objects.filter(action='auth.email_delivery_failed', target_id=created_user.id).exists())

    def test_login_returns_token_and_user_payload(self):
        response = self.client.post('/api/auth/login/', {
            'username': 'auth_user',
            'password': 'password123',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('token', response.data)
        self.assertEqual(response.data['user']['username'], 'auth_user')
        self.assertEqual(response.data['user']['role'], 'user')
        self.assertIsNotNone(response.data['user']['last_login'])
        self.assertIsNotNone(response.data['user']['date_joined'])
        self.assertTrue(Token.objects.filter(user=self.user, key=response.data['token']).exists())
        self.assertTrue(AuditLog.objects.filter(action='auth.login', target_id=self.user.id).exists())

    def test_login_rejects_unverified_account_even_with_correct_password(self):
        self.client.post('/api/auth/register/', {
            'full_name': 'Pending User',
            'username': 'pending_user',
            'email': 'pending@example.com',
            'phone_number': '+44-7000-000004',
            'password': 'strong-pass-456',
            'confirm_password': 'strong-pass-456',
        }, format='json')

        response = self.client.post('/api/auth/login/', {
            'username': 'pending_user',
            'password': 'strong-pass-456',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['detail'], 'Verify your email before logging in.')

    def test_verify_email_activates_user(self):
        self.client.post('/api/auth/register/', {
            'full_name': 'Verify User',
            'username': 'verify_user',
            'email': 'verify@example.com',
            'phone_number': '+44-7000-000005',
            'password': 'strong-pass-456',
            'confirm_password': 'strong-pass-456',
        }, format='json')

        created_user = User.objects.get(username='verify_user')
        body_lines = mail.outbox[0].body.splitlines()
        selector = next(line.split(': ', 1)[1] for line in body_lines if line.startswith('Selector: '))
        token_value = next(line.split(': ', 1)[1] for line in body_lines if line.startswith('Token: '))

        response = self.client.post('/api/auth/verify-email/', {
            'selector': selector,
            'token': token_value,
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        created_user.refresh_from_db()
        self.assertTrue(created_user.is_active)
        verification_token = EmailVerificationToken.objects.get(user=created_user)
        self.assertIsNotNone(verification_token.used_at)
        self.assertTrue(AuditLog.objects.filter(action='auth.email_verified', target_id=created_user.id).exists())

    def test_verify_email_rejects_invalid_token(self):
        self.client.post('/api/auth/register/', {
            'full_name': 'Verify User',
            'username': 'verify_user_invalid',
            'email': 'verify-invalid@example.com',
            'phone_number': '+44-7000-000006',
            'password': 'strong-pass-456',
            'confirm_password': 'strong-pass-456',
        }, format='json')

        verification_token = EmailVerificationToken.objects.get(user__username='verify_user_invalid')
        response = self.client.post('/api/auth/verify-email/', {
            'selector': str(verification_token.selector),
            'token': 'wrong-token',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['detail'], 'Verification token is invalid or expired.')

    @override_settings(EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS=0)
    def test_resend_verification_sends_new_email_for_inactive_user(self):
        self.client.post('/api/auth/register/', {
            'full_name': 'Resend User',
            'username': 'resend_user',
            'email': 'resend@example.com',
            'phone_number': '+44-7000-000007',
            'password': 'strong-pass-456',
            'confirm_password': 'strong-pass-456',
        }, format='json')

        first_token = EmailVerificationToken.objects.get(user__username='resend_user')
        response = self.client.post('/api/auth/resend-verification/', {
            'email': 'resend@example.com',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 2)
        first_token.refresh_from_db()
        self.assertIsNotNone(first_token.used_at)
        self.assertEqual(EmailVerificationToken.objects.filter(user__username='resend_user').count(), 2)

    def test_resend_verification_returns_generic_message_for_unknown_email(self):
        response = self.client.post('/api/auth/resend-verification/', {
            'email': 'missing-verify@example.com',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['message'], 'If the email exists, a verification message has been sent.')
        self.assertEqual(len(mail.outbox), 0)

    @override_settings(EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS=60)
    def test_resend_verification_is_rate_limited_when_requested_too_soon(self):
        self.client.post('/api/auth/register/', {
            'full_name': 'Resend Limited User',
            'username': 'resend_limited_user',
            'email': 'resend-limited@example.com',
            'phone_number': '+44-7000-000010',
            'password': 'strong-pass-456',
            'confirm_password': 'strong-pass-456',
        }, format='json')

        response = self.client.post('/api/auth/resend-verification/', {
            'email': 'resend-limited@example.com',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertIn('Please wait', response.data['detail'])
        self.assertTrue(
            AuditLog.objects.filter(action='auth.email_verification_resend_rate_limited').exists()
        )

    @patch('core.views.send_mail', side_effect=Exception('smtp down'))
    @override_settings(EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS=0)
    def test_resend_verification_returns_operational_error_when_email_fails(self, mock_send_mail):
        self.client.post('/api/auth/register/', {
            'full_name': 'Resend Failure User',
            'username': 'resend_failure_user',
            'email': 'resend-failure@example.com',
            'phone_number': '+44-7000-000011',
            'password': 'strong-pass-456',
            'confirm_password': 'strong-pass-456',
        }, format='json')

        response = self.client.post('/api/auth/resend-verification/', {
            'email': 'resend-failure@example.com',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertEqual(
            response.data['detail'],
            'We could not send the verification email right now. Please try again shortly.',
        )
        self.assertTrue(
            AuditLog.objects.filter(action='auth.email_delivery_failed', target_id=User.objects.get(username='resend_failure_user').id).exists()
        )

    def test_login_accepts_email_address(self):
        response = self.client.post('/api/auth/login/', {
            'username': 'auth@example.com',
            'password': 'password123',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['user']['username'], 'auth_user')

    def test_me_requires_authentication(self):
        response = self.client.get('/api/auth/me/')

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_me_returns_authenticated_user(self):
        token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

        response = self.client.get('/api/auth/me/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['user']['username'], 'auth_user')
        self.assertIsNotNone(response.data['user']['last_activity'])

    def test_me_patch_updates_full_name_username_and_phone_number(self):
        token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

        response = self.client.patch('/api/auth/me/', {
            'full_name': 'Updated Auth User',
            'username': 'updated_auth_user',
            'email': 'updated-auth@example.com',
            'phone_number': '+44-7000-111111',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(self.user.username, 'updated_auth_user')
        self.assertEqual(self.user.email, 'updated-auth@example.com')
        self.assertEqual(self.user.first_name, 'Updated')
        self.assertEqual(self.user.last_name, 'Auth User')
        self.assertEqual(self.user.profile.phone_number, '+44-7000-111111')
        self.assertEqual(response.data['user']['full_name'], 'Updated Auth User')
        self.assertTrue(AuditLog.objects.filter(action='auth.profile_update', target_id=self.user.id).exists())

    def test_me_patch_rejects_duplicate_username(self):
        User.objects.create_user(username='taken_name', password='secret123', email='taken@example.com')
        token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

        response = self.client.patch('/api/auth/me/', {
            'full_name': 'Updated Auth User',
            'username': 'taken_name',
            'email': 'updated-auth@example.com',
            'phone_number': '+44-7000-111111',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('username', response.data)

    def test_me_patch_rejects_duplicate_email(self):
        User.objects.create_user(username='taken_email_user', password='secret123', email='taken@example.com')
        token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

        response = self.client.patch('/api/auth/me/', {
            'full_name': 'Updated Auth User',
            'username': 'updated_auth_user',
            'email': 'taken@example.com',
            'phone_number': '+44-7000-111111',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('email', response.data)

    def test_avatar_upload_updates_profile(self):
        token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

        with tempfile.TemporaryDirectory() as media_root:
            with override_settings(
                MEDIA_ROOT=media_root,
                STORAGES={
                    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
                    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
                },
            ):
                avatar_file = SimpleUploadedFile(
                    'avatar.png',
                    (
                        b'\x89PNG\r\n\x1a\n'
                        b'\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde'
                        b'\x00\x00\x00\x0cIDATx\x9cc```\x00\x00\x00\x04\x00\x01\xf6\x178U'
                        b'\x00\x00\x00\x00IEND\xaeB`\x82'
                    ),
                    content_type='image/png',
                )

                response = self.client.post('/api/auth/avatar/', {'avatar': avatar_file})

                self.assertEqual(response.status_code, status.HTTP_200_OK)
                self.user.refresh_from_db()
                self.assertTrue(bool(self.user.profile.avatar))
                self.assertIsNotNone(response.data['user']['avatar_url'])
                self.assertIn('?v=', response.data['user']['avatar_url'])
                self.assertTrue(AuditLog.objects.filter(action='auth.avatar_updated', target_id=self.user.id).exists())

    def test_avatar_delete_clears_profile_photo(self):
        token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

        with tempfile.TemporaryDirectory() as media_root:
            with override_settings(
                MEDIA_ROOT=media_root,
                STORAGES={
                    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
                    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
                },
            ):
                avatar_file = SimpleUploadedFile(
                    'avatar.png',
                    (
                        b'\x89PNG\r\n\x1a\n'
                        b'\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde'
                        b'\x00\x00\x00\x0cIDATx\x9cc```\x00\x00\x00\x04\x00\x01\xf6\x178U'
                        b'\x00\x00\x00\x00IEND\xaeB`\x82'
                    ),
                    content_type='image/png',
                )
                self.client.post('/api/auth/avatar/', {'avatar': avatar_file})

                response = self.client.delete('/api/auth/avatar/')

                self.assertEqual(response.status_code, status.HTTP_200_OK)
                self.user.refresh_from_db()
                self.assertFalse(bool(self.user.profile.avatar))
                self.assertIsNone(response.data['user']['avatar_url'])
                self.assertTrue(AuditLog.objects.filter(action='auth.avatar_removed', target_id=self.user.id).exists())

    def test_regular_user_cannot_delete_account_without_admin_override_code(self):
        token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

        response = self.client.delete('/api/auth/me/', {}, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['detail'], 'Admin override code is required to delete this account.')
        self.assertTrue(User.objects.filter(pk=self.user.pk).exists())

    def test_regular_user_can_delete_account_with_admin_override_code(self):
        admin_user = User.objects.create_user(
            username='account_admin',
            password='password123',
            email='account-admin@example.com',
        )
        admin_user.profile.role = 'admin'
        admin_user.profile.set_master_override_password('1234')
        admin_user.profile.save(update_fields=['role', 'master_override_password', 'updated_at'])

        token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

        response = self.client.delete('/api/auth/me/', {
            'admin_override_code': '1234',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(User.objects.filter(pk=self.user.pk).exists())
        self.assertTrue(AuditLog.objects.filter(action='auth.account_deleted').exists())
        admin_audit = AuditLog.objects.get(user=admin_user, action='auth.account_deleted')
        self.assertEqual(admin_audit.changes['override_actor_username'], 'auth_user')
        self.assertEqual(admin_audit.changes['override_owner_username'], 'account_admin')
        self.assertTrue(admin_audit.changes['admin_override_used'])

    def test_admin_user_can_delete_own_account_without_override_code(self):
        self.user.profile.role = 'admin'
        self.user.profile.save(update_fields=['role', 'updated_at'])
        token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

        response = self.client.delete('/api/auth/me/', {}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(User.objects.filter(pk=self.user.pk).exists())

    def test_logout_deletes_token(self):
        token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

        response = self.client.post('/api/auth/logout/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(Token.objects.filter(user=self.user).exists())
        self.assertTrue(AuditLog.objects.filter(action='auth.logout', target_id=self.user.id).exists())

    def test_change_password_rotates_token(self):
        token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

        response = self.client.post('/api/auth/change-password/', {
            'current_password': 'password123',
            'new_password': 'new-password-456',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotEqual(response.data['token'], token.key)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('new-password-456'))
        self.assertTrue(AuditLog.objects.filter(action='auth.password_changed', target_id=self.user.id).exists())

    @patch('core.views.verify_google_id_token')
    def test_google_login_creates_user_and_returns_token(self, mock_verify_google_id_token):
        mock_verify_google_id_token.return_value = {
            'email': 'google-user@example.com',
            'email_verified': True,
            'given_name': 'Google',
            'family_name': 'User',
        }

        response = self.client.post('/api/auth/google/', {
            'id_token': 'fake-google-token',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        created_user = User.objects.get(email='google-user@example.com')
        self.assertEqual(created_user.first_name, 'Google')
        self.assertEqual(created_user.last_name, 'User')
        self.assertIn('token', response.data)
        self.assertTrue(AuditLog.objects.filter(action='auth.google_login', target_id=created_user.id).exists())

    @patch('core.views.verify_google_id_token')
    def test_google_login_updates_existing_user_names(self, mock_verify_google_id_token):
        existing_user = User.objects.create_user(
            username='existing_google',
            email='existing@example.com',
            password='password123',
        )
        mock_verify_google_id_token.return_value = {
            'email': 'existing@example.com',
            'email_verified': True,
            'given_name': 'Existing',
            'family_name': 'User',
        }

        response = self.client.post('/api/auth/google/', {
            'id_token': 'fake-google-token',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        existing_user.refresh_from_db()
        self.assertEqual(existing_user.first_name, 'Existing')
        self.assertEqual(existing_user.last_name, 'User')

    @patch('core.views.verify_google_id_token')
    def test_google_login_rejects_unverified_email(self, mock_verify_google_id_token):
        mock_verify_google_id_token.return_value = {
            'email': 'google-user@example.com',
            'email_verified': False,
        }

        response = self.client.post('/api/auth/google/', {
            'id_token': 'fake-google-token',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['detail'], 'Google account email is not verified.')

    def test_login_accepts_master_override_password(self):
        self.user.profile.role = 'admin'
        self.user.profile.save(update_fields=['role', 'updated_at'])
        self.user.profile.set_master_override_password('4567')
        self.user.profile.save(update_fields=['master_override_password', 'updated_at'])

        response = self.client.post('/api/auth/login/', {
            'username': 'auth_user',
            'password': '4567',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('token', response.data)
        self.assertTrue(AuditLog.objects.filter(action='auth.login_override', target_id=self.user.id).exists())

    def test_login_rejects_master_override_for_non_admin_user(self):
        self.user.profile.set_master_override_password('4567')
        self.user.profile.save(update_fields=['master_override_password', 'updated_at'])

        response = self.client.post('/api/auth/login/', {
            'username': 'auth_user',
            'password': '4567',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['detail'], 'Invalid username or password.')

    def test_forgot_password_sends_reset_email_for_existing_user(self):
        response = self.client.post('/api/auth/forgot-password/', {
            'email': 'auth@example.com',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ['auth@example.com'])
        self.assertIn('Selector:', mail.outbox[0].body)
        self.assertIn('Token:', mail.outbox[0].body)

    def test_forgot_override_code_sends_reset_email_for_admin(self):
        self.user.profile.role = 'admin'
        self.user.profile.set_master_override_password('4567')
        self.user.profile.save(update_fields=['role', 'master_override_password', 'updated_at'])
        self.client.force_authenticate(user=self.user)

        response = self.client.post('/api/auth/forgot-override-code/', {}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ['auth@example.com'])
        self.assertIn('FlowBit override code reset request', mail.outbox[0].body)
        self.assertTrue(OverrideResetToken.objects.filter(user=self.user).exists())

    def test_forgot_override_code_requires_admin_account(self):
        self.client.force_authenticate(user=self.user)

        response = self.client.post('/api/auth/forgot-override-code/', {}, format='json')

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data['detail'], 'Only admin accounts can reset override codes.')

    def test_reset_override_code_requires_correct_account_password(self):
        self.user.profile.role = 'admin'
        self.user.profile.set_master_override_password('4567')
        self.user.profile.save(update_fields=['role', 'master_override_password', 'updated_at'])
        override_reset_token, raw_token = OverrideResetToken.issue_for_user(self.user, expiry_hours=1)

        response = self.client.post('/api/auth/reset-override-code/', {
            'selector': str(override_reset_token.selector),
            'token': raw_token,
            'new_override_code': '1234',
            'confirm_override_code': '1234',
            'account_password': 'wrong-password',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['detail'], 'Account password is incorrect.')

    def test_reset_override_code_completes_with_valid_token(self):
        self.user.profile.role = 'admin'
        self.user.profile.set_master_override_password('4567')
        self.user.profile.save(update_fields=['role', 'master_override_password', 'updated_at'])
        override_reset_token, raw_token = OverrideResetToken.issue_for_user(self.user, expiry_hours=1)

        response = self.client.post('/api/auth/reset-override-code/', {
            'selector': str(override_reset_token.selector),
            'token': raw_token,
            'new_override_code': '1234',
            'confirm_override_code': '1234',
            'account_password': 'password123',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.profile.check_master_override_password('1234'))
        override_reset_token.refresh_from_db()
        self.assertIsNotNone(override_reset_token.used_at)
        self.assertTrue(
            AuditLog.objects.filter(action='auth.override_reset_completed', target_id=self.user.id).exists()
        )

    def test_forgot_password_returns_generic_message_for_unknown_email(self):
        response = self.client.post('/api/auth/forgot-password/', {
            'email': 'missing@example.com',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 0)

    @patch('core.views.send_mail', side_effect=Exception('smtp down'))
    def test_forgot_password_returns_operational_error_when_email_fails(self, mock_send_mail):
        response = self.client.post('/api/auth/forgot-password/', {
            'email': 'auth@example.com',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertEqual(
            response.data['detail'],
            'We could not send the password reset email right now. Please try again shortly.',
        )
        self.assertTrue(
            AuditLog.objects.filter(action='auth.email_delivery_failed', target_id=self.user.id).exists()
        )
        self.assertFalse(
            AuditLog.objects.filter(action='auth.password_reset_requested', target_id=self.user.id).exists()
        )

    def test_reset_password_completes_with_valid_token(self):
        self.client.post('/api/auth/forgot-password/', {
            'email': 'auth@example.com',
        }, format='json')

        body_lines = mail.outbox[0].body.splitlines()
        selector = next(line.split(': ', 1)[1] for line in body_lines if line.startswith('Selector: '))
        token_value = next(line.split(': ', 1)[1] for line in body_lines if line.startswith('Token: '))

        response = self.client.post('/api/auth/reset-password/', {
            'selector': selector,
            'token': token_value,
            'new_password': 'new-reset-pass-456',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('new-reset-pass-456'))
        self.assertIn('token', response.data)
        reset_token = PasswordResetToken.objects.get(user=self.user)
        self.assertIsNotNone(reset_token.used_at)
        self.assertTrue(
            AuditLog.objects.filter(action='auth.password_reset_completed', target_id=self.user.id).exists()
        )

    def test_reset_password_rejects_invalid_token(self):
        self.client.post('/api/auth/forgot-password/', {
            'email': 'auth@example.com',
        }, format='json')

        selector = str(PasswordResetToken.objects.get(user=self.user).selector)
        response = self.client.post('/api/auth/reset-password/', {
            'selector': selector,
            'token': 'wrong-token',
            'new_password': 'new-reset-pass-456',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['detail'], 'Reset token is invalid or expired.')

    def test_reset_password_token_is_one_time_use(self):
        self.client.post('/api/auth/forgot-password/', {
            'email': 'auth@example.com',
        }, format='json')

        body_lines = mail.outbox[0].body.splitlines()
        selector = next(line.split(': ', 1)[1] for line in body_lines if line.startswith('Selector: '))
        token_value = next(line.split(': ', 1)[1] for line in body_lines if line.startswith('Token: '))

        first_response = self.client.post('/api/auth/reset-password/', {
            'selector': selector,
            'token': token_value,
            'new_password': 'new-reset-pass-456',
        }, format='json')
        second_response = self.client.post('/api/auth/reset-password/', {
            'selector': selector,
            'token': token_value,
            'new_password': 'another-pass-789',
        }, format='json')

        self.assertEqual(first_response.status_code, status.HTTP_200_OK)
        self.assertEqual(second_response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_reset_password_does_not_activate_unverified_account(self):
        self.client.post('/api/auth/register/', {
            'full_name': 'Reset Pending User',
            'username': 'reset_pending_user',
            'email': 'reset-pending@example.com',
            'phone_number': '+44-7000-000008',
            'password': 'strong-pass-456',
            'confirm_password': 'strong-pass-456',
        }, format='json')

        self.client.post('/api/auth/forgot-password/', {
            'email': 'reset-pending@example.com',
        }, format='json')

        body_lines = mail.outbox[-1].body.splitlines()
        selector = next(line.split(': ', 1)[1] for line in body_lines if line.startswith('Selector: '))
        token_value = next(line.split(': ', 1)[1] for line in body_lines if line.startswith('Token: '))

        response = self.client.post('/api/auth/reset-password/', {
            'selector': selector,
            'token': token_value,
            'new_password': 'new-reset-pass-456',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        pending_user = User.objects.get(username='reset_pending_user')
        self.assertFalse(pending_user.is_active)


class RolePermissionTests(APITestCase):
    def setUp(self):
        self.admin_user = User.objects.create_user(
            username='admin_role_user',
            password='password123',
        )
        self.admin_user.profile.role = 'admin'
        self.admin_user.profile.set_master_override_password('1234')
        self.admin_user.profile.save(update_fields=['role', 'master_override_password', 'updated_at'])

        self.regular_user = User.objects.create_user(
            username='regular_role_user',
            password='password123',
        )

        self.period = Period.objects.create(
            name='Role Permission Period',
            start_date=timezone.make_aware(datetime(2027, 1, 1, 0, 0, 0)),
            end_date=timezone.make_aware(datetime(2027, 12, 31, 23, 59, 59)),
            is_open=True,
        )
        self.ledger = Ledger.objects.create(
            period=self.period,
            owner=self.regular_user,
            name='Role Ledger',
            end_date=self.period.end_date,
            limit_per_identifier=Decimal('100.00'),
            priority=1,
            is_active=True,
        )
        self.identifier, _ = Identifier.objects.get_or_create(number='101')

    def test_regular_user_cannot_create_period(self):
        self.client.force_authenticate(user=self.regular_user)

        response = self.client.post('/api/periods/', {
            'name': 'Blocked Period',
            'start_date': '2027-02-01',
            'end_date': '2027-02-28',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_regular_user_can_create_period_with_admin_override_code(self):
        self.admin_user.profile.set_master_override_password('1234')
        self.admin_user.profile.save(update_fields=['master_override_password', 'updated_at'])
        self.client.force_authenticate(user=self.regular_user)

        response = self.client.post('/api/periods/', {
            'name': 'Override Period',
            'start_date': '2028-01-01',
            'end_date': '2028-01-31',
            'is_open': False,
            'admin_override_code': '1234',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        admin_audit = AuditLog.objects.get(user=self.admin_user, action='period.created')
        self.assertEqual(admin_audit.changes['override_actor_username'], 'regular_role_user')
        self.assertEqual(admin_audit.changes['override_owner_username'], 'admin_role_user')
        self.assertTrue(admin_audit.changes['admin_override_used'])

    def test_regular_user_can_close_ledger_with_admin_override_code(self):
        self.admin_user.profile.set_master_override_password('1234')
        self.admin_user.profile.save(update_fields=['master_override_password', 'updated_at'])
        self.client.force_authenticate(user=self.regular_user)

        response = self.client.post(
            f'/api/ledgers/{self.ledger.id}/close/',
            {'admin_override_code': '1234'},
            format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.ledger.refresh_from_db()
        self.assertFalse(self.ledger.is_active)

    def test_regular_user_can_reopen_closed_ledger_with_admin_override_code(self):
        self.admin_user.profile.set_master_override_password('1234')
        self.admin_user.profile.save(update_fields=['master_override_password', 'updated_at'])
        self.ledger.close()
        self.client.force_authenticate(user=self.regular_user)

        response = self.client.post(
            f'/api/ledgers/{self.ledger.id}/reopen/',
            {
                'admin_override_code': '1234',
                'end_date': '2027-01-20',
                'close_time': '18:30',
            },
            format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.ledger.refresh_from_db()
        self.assertTrue(self.ledger.is_active)
        self.assertIsNone(self.ledger.closed_at)
        self.assertEqual(self.ledger.end_date.date().isoformat(), '2027-01-20')
        self.assertEqual(self.ledger.end_date.strftime('%H:%M'), '18:30')

    def test_regular_user_can_create_ticket_with_transactions(self):
        self.client.force_authenticate(user=self.regular_user)

        response = self.client.post('/api/tickets/create-with-items/', {
            'customer_name': 'Regular User Customer',
            'items': [
                {'identifier': self.identifier.id, 'amount': '50.00'},
            ],
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_regular_user_cannot_view_audit_logs(self):
        self.client.force_authenticate(user=self.regular_user)

        response = self.client.get('/api/audit-logs/')

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_regular_user_cannot_close_ledger(self):
        self.client.force_authenticate(user=self.regular_user)

        response = self.client.post(f'/api/ledgers/{self.ledger.id}/close/')

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_closed_ledger_cannot_reopen_if_period_is_closed(self):
        self.client.force_authenticate(user=self.regular_user)
        self.ledger.close()
        self.period.close()

        response = self.client.post(
            f'/api/ledgers/{self.ledger.id}/reopen/',
            {
                'end_date': '2027-01-20',
                'close_time': '18:30',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['detail'], 'Only ledgers in the active period can be reopened.')

    def test_ledger_reopen_requires_new_end_date_and_time(self):
        self.client.force_authenticate(user=self.regular_user)
        self.ledger.close()

        response = self.client.post(f'/api/ledgers/{self.ledger.id}/reopen/', {}, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['detail'], 'End date and close time are required to reopen a ledger.')

    def test_ledger_reopen_is_blocked_after_period_pre_close_for_period(self):
        self.client.force_authenticate(user=self.regular_user)
        self.ledger.close()
        self.period.apply_pre_close(triggered_at=timezone.now(), acting_user=self.admin_user)

        response = self.client.post(
            f'/api/ledgers/{self.ledger.id}/reopen/',
            {
                'end_date': '2027-01-20',
                'close_time': '18:30',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['detail'], 'Ledger reopen is locked after the pre-close time is reached for this period.')

    def test_admin_can_list_users(self):
        self.client.force_authenticate(user=self.admin_user)

        response = self.client.get('/api/users/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        usernames = {item['username'] for item in response.data}
        self.assertIn('admin_role_user', usernames)
        self.assertIn('regular_role_user', usernames)

    def test_admin_can_list_users_without_profile_records(self):
        self.client.force_authenticate(user=self.admin_user)
        profileless_user = User.objects.create_user(
            username='profileless_user',
            email='profileless@example.com',
            password='password123',
        )
        profileless_user.profile.delete()

        response = self.client.get('/api/users/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        listed_user = next((item for item in response.data if item['id'] == profileless_user.id), None)
        self.assertIsNotNone(listed_user)
        self.assertEqual(listed_user['role'], '')
        self.assertEqual(listed_user['phone_number'], '')
        self.assertIsNone(listed_user['avatar_url'])
        self.assertFalse(listed_user['has_override_code'])

    def test_admin_can_change_user_role(self):
        self.client.force_authenticate(user=self.admin_user)

        response = self.client.post(
            f'/api/users/{self.regular_user.id}/set-role/',
            {'role': 'admin', 'admin_override_code': '1234'},
            format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.regular_user.refresh_from_db()
        self.assertEqual(self.regular_user.profile.role, 'admin')
        self.assertTrue(
            UserNotification.objects.filter(
                recipient=self.regular_user,
                title='Account role updated',
            ).exists()
        )

    def test_admin_cannot_downgrade_own_account(self):
        self.client.force_authenticate(user=self.admin_user)

        response = self.client.post(
            f'/api/users/{self.admin_user.id}/set-role/',
            {'role': 'user', 'admin_override_code': '1234'},
            format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['detail'], 'Admin users cannot downgrade their own account.')
        self.admin_user.refresh_from_db()
        self.assertEqual(self.admin_user.profile.role, 'admin')

    def test_admin_can_set_master_override_password(self):
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.post(
            f'/api/users/{self.admin_user.id}/set-master-override-password/',
            {'master_override_password': '9999', 'admin_override_code': '1234'},
            format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.admin_user.refresh_from_db()
        self.assertTrue(self.admin_user.profile.check_master_override_password('9999'))
        self.assertTrue(
            UserNotification.objects.filter(
                recipient=self.admin_user,
                title='Override access updated',
            ).exists()
        )

    def test_admin_can_set_initial_master_override_password_without_existing_override(self):
        self.client.force_authenticate(user=self.admin_user)
        self.admin_user.profile.clear_master_override_password()
        self.admin_user.profile.save(update_fields=['master_override_password', 'updated_at'])

        response = self.client.post(
            f'/api/users/{self.admin_user.id}/set-master-override-password/',
            {'master_override_password': '2468'},
            format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.admin_user.refresh_from_db()
        self.assertTrue(self.admin_user.profile.check_master_override_password('2468'))

    def test_admin_cannot_set_non_numeric_override_password(self):
        self.client.force_authenticate(user=self.admin_user)

        response = self.client.post(
            f'/api/users/{self.admin_user.id}/set-master-override-password/',
            {'master_override_password': '12a4', 'admin_override_code': '1234'},
            format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['master_override_password'][0], 'Override code must be exactly 4 digits.')

    def test_admin_can_delete_user_account(self):
        self.client.force_authenticate(user=self.admin_user)

        response = self.client.delete(
            f'/api/users/{self.regular_user.id}/',
            {'admin_override_code': '1234'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(User.objects.filter(pk=self.regular_user.pk).exists())
        self.assertTrue(AuditLog.objects.filter(action='user.account_deleted').exists())

    def test_admin_cannot_set_master_override_password_for_non_admin_user(self):
        self.client.force_authenticate(user=self.admin_user)

        response = self.client.post(
            f'/api/users/{self.regular_user.id}/set-master-override-password/',
            {'master_override_password': '1234', 'admin_override_code': '1234'},
            format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data['detail'],
            'Master override password can only be configured for admin users.'
        )

    def test_regular_user_cannot_list_users(self):
        self.client.force_authenticate(user=self.regular_user)

        response = self.client.get('/api/users/')

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_cannot_change_user_role_without_override_code(self):
        self.client.force_authenticate(user=self.admin_user)

        response = self.client.post(
            f'/api/users/{self.regular_user.id}/set-role/',
            {'role': 'admin'},
            format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['detail'], 'Admin override code is required for this action.')

    def test_admin_cannot_set_master_override_without_override_code(self):
        self.client.force_authenticate(user=self.admin_user)
        self.admin_user.profile.set_master_override_password('5678')
        self.admin_user.profile.save(update_fields=['master_override_password', 'updated_at'])

        response = self.client.post(
            f'/api/users/{self.admin_user.id}/set-master-override-password/',
            {'master_override_password': '9999'},
            format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['detail'], 'Admin override code is required for this action.')

    def test_admin_cannot_set_master_override_with_incorrect_override_code(self):
        self.client.force_authenticate(user=self.admin_user)
        self.admin_user.profile.set_master_override_password('5678')
        self.admin_user.profile.save(update_fields=['master_override_password', 'updated_at'])

        response = self.client.post(
            f'/api/users/{self.admin_user.id}/set-master-override-password/',
            {'master_override_password': '9999', 'admin_override_code': '0000'},
            format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['detail'], 'Admin override code is incorrect.')

    def test_admin_cannot_set_other_admin_override_password(self):
        self.client.force_authenticate(user=self.admin_user)
        other_admin = User.objects.create_user(username='second_admin_user', password='password123')
        other_admin.profile.role = 'admin'
        other_admin.profile.set_master_override_password('6789')
        other_admin.profile.save(update_fields=['role', 'master_override_password', 'updated_at'])

        response = self.client.post(
            f'/api/users/{other_admin.id}/set-master-override-password/',
            {'master_override_password': '9999', 'admin_override_code': '1234'},
            format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['detail'], 'Admin users can only manage their own override code.')

    def test_admin_cannot_delete_user_without_override_code(self):
        self.client.force_authenticate(user=self.admin_user)

        response = self.client.delete(f'/api/users/{self.regular_user.id}/')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['detail'], 'Admin override code is required for this action.')

    def test_admin_cannot_delete_user_with_invalid_override_code_format(self):
        self.client.force_authenticate(user=self.admin_user)

        response = self.client.delete(
            f'/api/users/{self.regular_user.id}/',
            {'admin_override_code': '12a4'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['detail'], 'Override code must be exactly 4 digits.')
        self.assertTrue(User.objects.filter(pk=self.regular_user.pk).exists())

    def test_admin_cannot_delete_user_with_incorrect_override_code(self):
        self.client.force_authenticate(user=self.admin_user)

        response = self.client.delete(
            f'/api/users/{self.regular_user.id}/',
            {'admin_override_code': '0000'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['detail'], 'Admin override code is incorrect.')
        self.assertTrue(User.objects.filter(pk=self.regular_user.pk).exists())

    def test_authenticated_user_can_create_collaborator(self):
        self.client.force_authenticate(user=self.regular_user)

        response = self.client.post('/api/collaborators/', {
            'username': 'new_collaborator',
            'full_name': 'New Collaborator',
            'email': 'collaborator@example.com',
            'phone_number': '+44-7000-123456',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        collaborator = Collaborator.objects.get(username='new_collaborator')
        self.assertEqual(collaborator.email, 'collaborator@example.com')
        self.assertEqual(collaborator.full_name, 'New Collaborator')
        self.assertEqual(collaborator.owner, self.regular_user)
        self.assertTrue(
            AuditLog.objects.filter(action='collaborator.created', target_id=collaborator.id).exists()
        )

    def test_owner_can_update_collaborator(self):
        collaborator = Collaborator.objects.create(
            owner=self.regular_user,
            username='owned_collaborator',
            full_name='Owned Collaborator',
            email='owned@example.com',
            phone_number='111111',
        )
        self.client.force_authenticate(user=self.regular_user)

        response = self.client.patch(
            f'/api/collaborators/{collaborator.id}/',
            {
                'full_name': 'Updated Collaborator',
                'email': 'updated-collaborator@example.com',
                'phone_number': '222222',
            },
            format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        collaborator.refresh_from_db()
        self.assertEqual(collaborator.full_name, 'Updated Collaborator')
        self.assertEqual(collaborator.email, 'updated-collaborator@example.com')
        self.assertTrue(
            AuditLog.objects.filter(action='collaborator.updated', target_id=collaborator.id).exists()
        )

    def test_owner_can_delete_collaborator(self):
        collaborator = Collaborator.objects.create(
            owner=self.regular_user,
            username='delete_collaborator',
            full_name='Delete Collaborator',
            email='delete@example.com',
            phone_number='333333',
        )
        self.client.force_authenticate(user=self.regular_user)

        response = self.client.delete(f'/api/collaborators/{collaborator.id}/')

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Collaborator.objects.filter(id=collaborator.id).exists())
        self.assertTrue(AuditLog.objects.filter(action='collaborator.deleted').exists())

    def test_user_cannot_manage_other_users_collaborator(self):
        collaborator = Collaborator.objects.create(
            owner=self.admin_user,
            username='foreign_collaborator',
            full_name='Foreign Collaborator',
            email='foreign@example.com',
            phone_number='444444',
        )
        self.client.force_authenticate(user=self.regular_user)

        response = self.client.patch(
            f'/api/collaborators/{collaborator.id}/',
            {'full_name': 'Blocked Update'},
            format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class PrivateWorkspaceTests(APITestCase):
    def setUp(self):
        self.admin_user = User.objects.create_user(
            username='private_admin',
            password='password123',
        )
        self.admin_user.profile.role = 'admin'
        self.admin_user.profile.set_master_override_password('1234')
        self.admin_user.profile.save(update_fields=['role', 'master_override_password', 'updated_at'])

        self.user_one = User.objects.create_user(
            username='private_user_one',
            password='password123',
        )
        self.user_two = User.objects.create_user(
            username='private_user_two',
            password='password123',
        )
        self.identifier = Identifier.objects.create(number='101')
        self.period = Period.objects.create(
            name='Private Workspace Period',
            start_date=timezone.make_aware(datetime(2027, 1, 1, 0, 0, 0)),
            end_date=timezone.make_aware(datetime(2027, 12, 31, 23, 59, 59)),
            is_open=True,
        )
        self.user_one_ledger = Ledger.objects.create(
            owner=self.user_one,
            period=self.period,
            name='User One Ledger',
            end_date=self.period.end_date,
            limit_per_identifier=Decimal('100.00'),
            priority=1,
            is_active=True,
        )

    def test_regular_user_cannot_create_period_even_with_override_code(self):
        self.client.force_authenticate(user=self.user_one)

        response = self.client.post('/api/periods/', {
            'name': 'Blocked Period',
            'start_date': '2028-01-01',
            'end_date': '2028-01-31',
            'admin_override_code': '1234',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_regular_user_cannot_update_or_close_period(self):
        self.client.force_authenticate(user=self.user_one)

        update_response = self.client.patch(
            f'/api/periods/{self.period.id}/',
            {'end_date': '2028-01-31'},
            format='json',
        )
        close_response = self.client.post(f'/api/periods/{self.period.id}/close/', {}, format='json')

        self.assertEqual(update_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(close_response.status_code, status.HTTP_403_FORBIDDEN)

    def test_regular_user_cannot_reopen_closed_period(self):
        self.period.close(closed_at=timezone.now())
        self.client.force_authenticate(user=self.user_one)

        response = self.client.post(f'/api/periods/{self.period.id}/reopen/', {}, format='json')

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_reopen_period_requires_new_end_date_and_time(self):
        self.period.close(closed_at=timezone.now())
        self.client.force_authenticate(user=self.admin_user)

        missing_fields_response = self.client.post(f'/api/periods/{self.period.id}/reopen/', {}, format='json')
        self.assertEqual(missing_fields_response.status_code, status.HTTP_400_BAD_REQUEST)

        response = self.client.post(
            f'/api/periods/{self.period.id}/reopen/',
            {
                'end_date': '2028-01-15',
                'close_time': '18:30',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.period.refresh_from_db()
        self.assertTrue(self.period.is_open)
        self.assertEqual(self.period.end_date.date().isoformat(), '2028-01-15')
        self.assertEqual(self.period.end_date.strftime('%H:%M'), '18:30')

    def test_period_rejects_pre_close_time_after_close_time(self):
        self.period.close(closed_at=timezone.now())
        self.client.force_authenticate(user=self.admin_user)

        response = self.client.post('/api/periods/', {
            'name': 'Bad Pre Close Period',
            'start_date': '2028-02-01',
            'end_date': '2028-02-28',
            'close_time': '15:00',
            'pre_close_time': '16:00',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('pre_close_time', response.data)

    def test_period_update_syncs_reserve_ledger_end_date(self):
        reserve = Ledger.get_capacity_reserve(self.period, self.user_one, create=True)
        self.client.force_authenticate(user=self.admin_user)

        response = self.client.patch(
            f'/api/periods/{self.period.id}/',
            {
                'end_date': '2028-02-20',
                'close_time': '19:45',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        reserve.refresh_from_db()
        self.assertEqual(reserve.end_date.date().isoformat(), '2028-02-20')
        self.assertEqual(reserve.end_date.strftime('%H:%M'), '19:45')

    def test_period_reopen_syncs_and_reactivates_reserve_ledgers(self):
        reserve = Ledger.get_capacity_reserve(self.period, self.user_one, create=True)
        self.period.close(closed_at=timezone.now())
        self.user_one_ledger.refresh_from_db()
        self.client.force_authenticate(user=self.admin_user)

        response = self.client.post(
            f'/api/periods/{self.period.id}/reopen/',
            {
                'end_date': '2028-01-18',
                'close_time': '17:30',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        reserve.refresh_from_db()
        self.user_one_ledger.refresh_from_db()
        self.assertTrue(reserve.is_active)
        self.assertIsNone(reserve.closed_at)
        self.assertEqual(reserve.end_date.date().isoformat(), '2028-01-18')
        self.assertEqual(reserve.end_date.strftime('%H:%M'), '17:30')
        self.assertFalse(self.user_one_ledger.is_active)
        self.assertIsNotNone(self.user_one_ledger.closed_at)

    @patch('core.views.timezone.now')
    def test_fetch_periods_auto_closes_expired_active_period(self, mocked_now):
        mocked_now.return_value = timezone.make_aware(datetime(2028, 1, 2, 12, 0, 0))
        self.period.end_date = timezone.make_aware(datetime(2028, 1, 1, 16, 0, 0))
        self.period.save(update_fields=['end_date'])
        self.user_one_ledger.end_date = self.period.end_date
        self.user_one_ledger.save(update_fields=['end_date'])

        self.client.force_authenticate(user=self.admin_user)
        response = self.client.get('/api/periods/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.period.refresh_from_db()
        self.user_one_ledger.refresh_from_db()
        self.assertFalse(self.period.is_open)
        self.assertIsNotNone(self.period.closed_at)
        self.assertFalse(self.user_one_ledger.is_active)
        self.assertTrue(AuditLog.objects.filter(action='period.auto_closed').exists())

    @patch('core.views.timezone.now')
    def test_fetch_periods_auto_applies_due_pre_close(self, mocked_now):
        mocked_now.return_value = timezone.make_aware(datetime(2028, 1, 1, 15, 31, 0))
        self.period.end_date = timezone.make_aware(datetime(2028, 1, 1, 23, 0, 0))
        self.period.pre_close_time = time(hour=15, minute=30)
        self.period.save(update_fields=['end_date', 'pre_close_time'])
        self.user_one_ledger.end_date = self.period.end_date
        self.user_one_ledger.save(update_fields=['end_date'])

        self.client.force_authenticate(user=self.admin_user)
        response = self.client.get('/api/periods/current/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.period.refresh_from_db()
        self.user_one_ledger.refresh_from_db()
        self.assertEqual(self.period.pre_closed_at, self.period.pre_close_at)
        self.assertFalse(self.user_one_ledger.is_active)
        self.assertEqual(self.user_one_ledger.closed_at, self.period.pre_close_at)
        self.assertTrue(AuditLog.objects.filter(action='period.pre_closed').exists())

    @patch('core.views.timezone.now')
    def test_period_update_can_undo_pre_close_when_moved_later(self, mocked_now):
        triggered_at = timezone.make_aware(datetime(2028, 1, 1, 15, 30, 0))
        mocked_now.return_value = timezone.make_aware(datetime(2028, 1, 1, 15, 31, 0))
        self.period.end_date = timezone.make_aware(datetime(2028, 1, 1, 23, 0, 0))
        self.period.pre_close_time = time(hour=15, minute=30)
        self.period.save(update_fields=['end_date', 'pre_close_time'])
        self.user_one_ledger.end_date = self.period.end_date
        self.user_one_ledger.save(update_fields=['end_date'])
        self.period.apply_pre_close(triggered_at=triggered_at, acting_user=self.admin_user)

        self.client.force_authenticate(user=self.admin_user)
        response = self.client.patch(
            f'/api/periods/{self.period.id}/',
            {'pre_close_time': '16:30'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.period.refresh_from_db()
        self.user_one_ledger.refresh_from_db()
        self.assertIsNone(self.period.pre_closed_at)
        self.assertTrue(self.user_one_ledger.is_active)
        self.assertIsNone(self.user_one_ledger.closed_at)
        self.assertTrue(
            UserNotification.objects.filter(
                title='Period pre-close removed',
                period=self.period,
            ).exists()
        )

    @patch('core.views.timezone.now')
    def test_period_update_cannot_change_pre_close_time_after_lucky_draw_announcement(self, mocked_now):
        triggered_at = timezone.make_aware(datetime(2028, 1, 1, 15, 30, 0))
        mocked_now.return_value = timezone.make_aware(datetime(2028, 1, 1, 15, 31, 0))
        self.period.end_date = timezone.make_aware(datetime(2028, 1, 1, 23, 0, 0))
        self.period.pre_close_time = time(hour=15, minute=30)
        self.period.save(update_fields=['end_date', 'pre_close_time'])
        self.user_one_ledger.end_date = self.period.end_date
        self.user_one_ledger.save(update_fields=['end_date'])
        self.period.apply_pre_close(triggered_at=triggered_at, acting_user=self.admin_user)
        LuckyDraw.objects.create(
            period=self.period,
            number='123456',
            announced_by=self.admin_user,
            announced_at=timezone.now(),
        )

        self.client.force_authenticate(user=self.admin_user)
        response = self.client.patch(
            f'/api/periods/{self.period.id}/',
            {'pre_close_time': '16:30'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('pre_close_time', response.data)
        self.period.refresh_from_db()
        self.user_one_ledger.refresh_from_db()
        self.assertIsNotNone(self.period.pre_closed_at)
        self.assertFalse(self.user_one_ledger.is_active)

    @patch('core.management.commands.close_expired_periods.timezone.now')
    def test_close_expired_periods_command_closes_ledgers_with_same_timestamp(self, mocked_now):
        closed_at = timezone.make_aware(datetime(2028, 1, 2, 12, 5, 0))
        mocked_now.return_value = closed_at
        self.period.end_date = timezone.make_aware(datetime(2028, 1, 2, 12, 0, 0))
        self.period.save(update_fields=['end_date'])
        self.user_one_ledger.end_date = self.period.end_date
        self.user_one_ledger.save(update_fields=['end_date'])

        out = StringIO()
        call_command('close_expired_periods', stdout=out)

        self.period.refresh_from_db()
        self.user_one_ledger.refresh_from_db()
        self.assertFalse(self.period.is_open)
        self.assertEqual(self.period.closed_at, closed_at)
        self.assertFalse(self.user_one_ledger.is_active)
        self.assertEqual(self.user_one_ledger.closed_at, closed_at)
        self.assertTrue(AuditLog.objects.filter(action='period.auto_closed').exists())

    @patch('core.management.commands.close_expired_periods.timezone.now')
    def test_close_expired_periods_command_applies_due_pre_close(self, mocked_now):
        now = timezone.make_aware(datetime(2028, 1, 1, 15, 35, 0))
        mocked_now.return_value = now
        self.period.end_date = timezone.make_aware(datetime(2028, 1, 1, 23, 0, 0))
        self.period.pre_close_time = time(hour=15, minute=30)
        self.period.save(update_fields=['end_date', 'pre_close_time'])
        self.user_one_ledger.end_date = self.period.end_date
        self.user_one_ledger.save(update_fields=['end_date'])

        out = StringIO()
        call_command('close_expired_periods', stdout=out)

        self.period.refresh_from_db()
        self.user_one_ledger.refresh_from_db()
        self.assertEqual(self.period.pre_closed_at, self.period.pre_close_at)
        self.assertFalse(self.user_one_ledger.is_active)
        self.assertEqual(self.user_one_ledger.closed_at, self.period.pre_close_at)
        self.assertTrue(AuditLog.objects.filter(action='period.pre_closed').exists())

    def test_admin_period_create_creates_reserve_ledgers_for_all_users(self):
        self.period.close(closed_at=timezone.now())
        self.client.force_authenticate(user=self.admin_user)

        response = self.client.post('/api/periods/', {
            'name': 'Creator Reserve Period',
            'start_date': '2028-01-01',
            'end_date': '2028-01-31',
            'close_time': '15:00',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        period = Period.objects.get(id=response.data['id'])
        reserve_owners = set(
            Ledger.objects.filter(
                period=period,
                is_capacity_reserve=True,
                is_active=True,
            ).values_list('owner__username', flat=True)
        )
        self.assertSetEqual(
            reserve_owners,
            {self.admin_user.username, self.user_one.username, self.user_two.username},
        )

    def test_ledger_list_only_returns_current_users_ledgers_and_reserve(self):
        Ledger.objects.create(
            owner=self.user_two,
            period=self.period,
            name='User Two Ledger',
            end_date=self.period.end_date,
            limit_per_identifier=Decimal('100.00'),
            priority=1,
            is_active=True,
        )
        self.client.force_authenticate(user=self.user_one)

        response = self.client.get('/api/ledgers/', {'period_id': self.period.id})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        returned_names = {item['name'] for item in response.data}
        self.assertIn('User One Ledger', returned_names)
        self.assertNotIn('User Two Ledger', returned_names)
        reserve_rows = [item for item in response.data if item['is_capacity_reserve']]
        self.assertEqual(len(reserve_rows), 1)
        self.assertEqual(reserve_rows[0]['owner_username'], self.user_one.username)

    def test_same_priority_is_allowed_for_different_users(self):
        self.client.force_authenticate(user=self.user_two)

        response = self.client.post('/api/ledgers/', {
            'period': self.period.id,
            'name': 'User Two Priority One',
            'end_date': '2027-12-31',
            'limit_per_identifier': '120.00',
            'priority': 1,
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['priority'], 1)
        self.assertEqual(response.data['owner_username'], self.user_two.username)

    def test_ledger_creation_is_blocked_after_period_pre_close_for_period(self):
        self.period.apply_pre_close(triggered_at=timezone.now(), acting_user=self.admin_user)
        self.client.force_authenticate(user=self.user_one)

        response = self.client.post('/api/ledgers/', {
            'period': self.period.id,
            'name': 'Locked Ledger',
            'end_date': '2027-12-31',
            'limit_per_identifier': '120.00',
            'priority': 2,
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['detail'], 'Ledger creation is locked after the pre-close time is reached for this period.')

    def test_ticket_creation_uses_only_current_users_ledgers(self):
        self.client.force_authenticate(user=self.user_two)

        blocked_response = self.client.post('/api/tickets/create-with-items/', {
            'customer_name': 'Blocked Customer',
            'items': [
                {'identifier': self.identifier.id, 'amount': '50.00'},
            ],
        }, format='json')

        self.assertEqual(blocked_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(blocked_response.data['detail'], 'No active ledgers available in the current open period.')

        self.client.force_authenticate(user=self.user_one)
        allowed_response = self.client.post('/api/tickets/create-with-items/', {
            'customer_name': 'Allowed Customer',
            'items': [
                {'identifier': self.identifier.id, 'amount': '50.00'},
            ],
        }, format='json')

        self.assertEqual(allowed_response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(Ticket.objects.filter(created_by=self.user_one).exists())

    def test_blank_customer_name_defaults_to_ticket_based_walk_in_name(self):
        self.client.force_authenticate(user=self.user_one)

        response = self.client.post('/api/tickets/create-with-items/', {
            'customer_name': '   ',
            'items': [
                {'identifier': self.identifier.id, 'amount': '50.00'},
            ],
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        ticket = Ticket.objects.get(id=response.data['ticket']['id'])
        expected_name = f'Walk-in {ticket.ticket_number}'
        self.assertEqual(ticket.customer_name, expected_name)
        self.assertEqual(response.data['ticket']['customer_name'], expected_name)

    def test_allocation_preview_uses_125_percent_of_ticket_amount(self):
        self.client.force_authenticate(user=self.user_one)

        response = self.client.post('/api/transactions/allocation-preview/', {
            'identifier': self.identifier.id,
            'total_amount': '1000.00',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        allocated_total = sum(
            Decimal(item['allocated_amount']) + Decimal(item['overflow_amount'])
            for item in response.data['ledger_allocations']
        )
        allocated_total += Decimal(response.data['reserve_allocated'])
        allocated_total += Decimal(response.data['overflow_amount'])
        self.assertEqual(allocated_total, Decimal('1250.00'))

    def test_ticket_creation_allocates_125_percent_to_ledgers(self):
        self.client.force_authenticate(user=self.user_one)

        response = self.client.post('/api/tickets/create-with-items/', {
            'customer_name': 'Markup Customer',
            'items': [
                {'identifier': self.identifier.id, 'amount': '1000.00'},
            ],
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        ticket = Ticket.objects.get(id=response.data['ticket']['id'])
        transaction = ticket.transactions.get()
        allocation_total = transaction.allocations.aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
        self.assertEqual(transaction.total_amount, Decimal('1000.00'))
        self.assertEqual(allocation_total, Decimal('1250.00'))

    def test_ticket_creation_is_blocked_after_period_pre_close(self):
        self.period.apply_pre_close(triggered_at=timezone.now(), acting_user=self.admin_user)
        self.client.force_authenticate(user=self.user_one)

        ticket_response = self.client.post('/api/tickets/create-with-items/', {
            'customer_name': 'Locked Customer',
            'items': [
                {'identifier': self.identifier.id, 'amount': '50.00'},
            ],
        }, format='json')
        transaction_response = self.client.post('/api/transactions/', {
            'identifier': self.identifier.id,
            'total_amount': '50.00',
        }, format='json')
        preview_response = self.client.post('/api/transactions/allocation-preview/', {
            'identifier': self.identifier.id,
            'total_amount': '50.00',
        }, format='json')

        self.assertEqual(ticket_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(ticket_response.data['detail'], 'Ticket creation is locked after the pre-close time is reached.')
        self.assertEqual(transaction_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(transaction_response.data['detail'], 'Ticket creation is locked after the pre-close time is reached.')
        self.assertEqual(preview_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(preview_response.data['detail'], 'Ticket creation is locked after the pre-close time is reached.')

    def test_ticket_creation_rejects_empty_items_without_creating_ticket(self):
        self.client.force_authenticate(user=self.user_one)

        response = self.client.post('/api/tickets/create-with-items/', {
            'customer_name': 'Empty Draft',
            'items': [
                {'identifier': self.identifier.id, 'amount': '0.00'},
            ],
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['detail'], 'At least one valid ticket entry is required.')
        self.assertFalse(Ticket.objects.filter(customer_name='Empty Draft').exists())

    def test_ticket_creation_rejects_blank_entry_without_creating_ticket(self):
        self.client.force_authenticate(user=self.user_one)

        response = self.client.post('/api/tickets/create-with-items/', {
            'customer_name': 'Blank Draft',
            'items': [
                {'identifier': self.identifier.id, 'amount': ''},
            ],
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['detail'], 'At least one valid ticket entry is required.')
        self.assertFalse(Ticket.objects.filter(customer_name='Blank Draft').exists())

    def test_transactions_and_overflows_are_private_to_the_current_user(self):
        self.client.force_authenticate(user=self.user_one)
        one_ticket = Ticket.objects.create(customer_name='One Ticket', created_by=self.user_one)
        one_transaction = Transaction.objects.create(
            ticket=one_ticket,
            identifier=self.identifier,
            total_amount=Decimal('150.00'),
            created_by=self.user_one,
        )
        self.client.force_authenticate(user=self.user_two)
        two_ticket = Ticket.objects.create(customer_name='Two Ticket', created_by=self.user_two)
        two_transaction = Transaction.objects.create(
            ticket=two_ticket,
            identifier=self.identifier,
            total_amount=Decimal('25.00'),
            created_by=self.user_two,
        )

        transaction_response = self.client.get('/api/transactions/')
        overflow_response = self.client.get('/api/overflows/')

        self.assertEqual(transaction_response.status_code, status.HTTP_200_OK)
        returned_transaction_ids = {item['id'] for item in transaction_response.data}
        self.assertIn(two_transaction.id, returned_transaction_ids)
        self.assertNotIn(one_transaction.id, returned_transaction_ids)

        self.assertEqual(overflow_response.status_code, status.HTTP_200_OK)
        returned_overflow_ids = {item['id'] for item in overflow_response.data}
        self.assertTrue(Overflow.objects.filter(transaction=one_transaction).exists())
        self.assertNotIn(Overflow.objects.get(transaction=one_transaction).id, returned_overflow_ids)

    def test_period_summary_and_reports_are_scoped_to_the_current_user(self):
        Ticket.objects.create(customer_name='User One Ticket', created_by=self.user_one)
        user_one_ticket = Ticket.objects.get(customer_name='User One Ticket')
        Transaction.objects.create(
            ticket=user_one_ticket,
            identifier=self.identifier,
            total_amount=Decimal('60.00'),
            created_by=self.user_one,
        )

        Ledger.objects.create(
            owner=self.user_two,
            period=self.period,
            name='User Two Ledger',
            end_date=self.period.end_date,
            limit_per_identifier=Decimal('80.00'),
            priority=1,
            is_active=True,
        )
        user_two_ticket = Ticket.objects.create(customer_name='User Two Ticket', created_by=self.user_two)
        Transaction.objects.create(
            ticket=user_two_ticket,
            identifier=self.identifier,
            total_amount=Decimal('30.00'),
            created_by=self.user_two,
        )

        self.client.force_authenticate(user=self.user_one)
        summary_response = self.client.get(f'/api/periods/{self.period.id}/summary/')
        dashboard_response = self.client.get('/api/reports/dashboard/', {'period_id': self.period.id})
        identifier_report_response = self.client.get('/api/reports/identifiers/capacity/', {'period_id': self.period.id})

        self.assertEqual(summary_response.status_code, status.HTTP_200_OK)
        self.assertEqual(summary_response.data['ledger_count'], 1)
        self.assertEqual(summary_response.data['ticket_count'], 1)
        self.assertEqual(summary_response.data['transaction_count'], 1)
        self.assertEqual(summary_response.data['total_transaction_amount'], '60')

        self.assertEqual(dashboard_response.status_code, status.HTTP_200_OK)
        self.assertEqual(dashboard_response.data['ledger_count'], 1)
        self.assertEqual(dashboard_response.data['ticket_count'], 1)
        self.assertEqual(dashboard_response.data['transaction_count'], 1)
        self.assertEqual(dashboard_response.data['total_transaction_amount'], '60')

        self.assertEqual(identifier_report_response.status_code, status.HTTP_200_OK)
        row = next(
            item
            for item in identifier_report_response.data['results']
            if item['number'] == self.identifier.number
        )
        self.assertEqual(row['total_capacity'], '100')
        self.assertEqual(row['normal_usage'], '75')
        self.assertEqual(row['remaining_capacity'], '25.00')

    def test_dashboard_hot_numbers_include_approved_overflow_amount(self):
        user_one_ticket = Ticket.objects.create(customer_name='User One Hot Number', created_by=self.user_one)
        user_one_transaction = Transaction.objects.create(
            ticket=user_one_ticket,
            identifier=self.identifier,
            total_amount=Decimal('80.00'),
            created_by=self.user_one,
        )
        Overflow.objects.create(
            transaction=user_one_transaction,
            identifier=self.identifier,
            owner=self.user_one,
            period=self.period,
            excess_amount=Decimal('20.00'),
            amount_to_approve=Decimal('20.00'),
            status=Overflow.STATUS_CSO,
            approved_at=timezone.now(),
        )

        self.client.force_authenticate(user=self.user_one)
        dashboard_response = self.client.get('/api/reports/dashboard/', {'period_id': self.period.id})

        self.assertEqual(dashboard_response.status_code, status.HTTP_200_OK)
        hot_row = next(
            item
            for item in dashboard_response.data['hot_numbers']
            if item['identifier'] == self.identifier.number
        )
        self.assertEqual(hot_row['amount'], '120.00')
        self.assertEqual(hot_row['progress'], 100.0)

    def test_dashboard_full_numbers_include_identifiers_frozen_across_all_ledgers(self):
        IdentifierLedgerFreeze.objects.create(
            identifier=self.identifier,
            period=self.period,
            owner=self.user_one,
            applies_to_all=True,
        )

        self.client.force_authenticate(user=self.user_one)
        dashboard_response = self.client.get('/api/reports/dashboard/', {'period_id': self.period.id})

        self.assertEqual(dashboard_response.status_code, status.HTTP_200_OK)
        full_row = next(
            item
            for item in dashboard_response.data['full_numbers']
            if item['identifier'] == self.identifier.number
        )
        self.assertEqual(full_row['amount'], '100')
        self.assertFalse(
            any(item['identifier'] == self.identifier.number for item in dashboard_response.data['almost_full'])
        )

    def test_dashboard_full_numbers_can_be_searched_and_paged(self):
        for value in range(30):
            identifier = Identifier.objects.create(number=f"{200 + value:03d}")
            IdentifierLedgerFreeze.objects.create(
                identifier=identifier,
                period=self.period,
                owner=self.user_one,
                applies_to_all=True,
            )

        self.client.force_authenticate(user=self.user_one)
        page_one_response = self.client.get('/api/reports/dashboard/full-numbers/', {
            'period_id': self.period.id,
            'page': 1,
        })
        search_response = self.client.get('/api/reports/dashboard/full-numbers/', {
            'period_id': self.period.id,
            'identifier': '205',
        })

        self.assertEqual(page_one_response.status_code, status.HTTP_200_OK)
        self.assertEqual(page_one_response.data['count'], 30)
        self.assertEqual(page_one_response.data['page_size'], 20)
        self.assertEqual(len(page_one_response.data['results']), 20)

        self.assertEqual(search_response.status_code, status.HTTP_200_OK)
        self.assertEqual(search_response.data['count'], 1)
        self.assertEqual(search_response.data['results'][0]['identifier'], '205')

    def test_dashboard_hot_numbers_can_be_searched_and_paged(self):
        for value in range(25):
            identifier = Identifier.objects.create(number=f"{300 + value:03d}")
            ticket = Ticket.objects.create(customer_name=f'Hot {value}', created_by=self.user_one)
            transaction = Transaction.objects.create(
                ticket=ticket,
                identifier=identifier,
                total_amount=Decimal('80.00'),
                created_by=self.user_one,
            )
            Overflow.objects.create(
                transaction=transaction,
                identifier=identifier,
                owner=self.user_one,
                period=self.period,
                excess_amount=Decimal('20.00'),
                amount_to_approve=Decimal('20.00'),
                status=Overflow.STATUS_CSO,
                approved_at=timezone.now(),
            )

        self.client.force_authenticate(user=self.user_one)
        page_one_response = self.client.get('/api/reports/dashboard/hot-numbers/', {
            'period_id': self.period.id,
            'page': 1,
        })
        search_response = self.client.get('/api/reports/dashboard/hot-numbers/', {
            'period_id': self.period.id,
            'identifier': '305',
        })

        self.assertEqual(page_one_response.status_code, status.HTTP_200_OK)
        self.assertEqual(page_one_response.data['count'], 25)
        self.assertEqual(page_one_response.data['page_size'], 20)
        self.assertEqual(len(page_one_response.data['results']), 20)

        self.assertEqual(search_response.status_code, status.HTTP_200_OK)
        self.assertEqual(search_response.data['count'], 1)
        self.assertEqual(search_response.data['results'][0]['identifier'], '305')

    def test_dashboard_almost_full_can_be_searched_and_paged(self):
        for value in range(25):
            identifier = Identifier.objects.create(number=f"{400 + value:03d}")
            ticket = Ticket.objects.create(customer_name=f'Almost {value}', created_by=self.user_one)
            Transaction.objects.create(
                ticket=ticket,
                identifier=identifier,
                total_amount=Decimal('60.00'),
                created_by=self.user_one,
            )

        self.client.force_authenticate(user=self.user_one)
        page_one_response = self.client.get('/api/reports/dashboard/almost-full/', {
            'period_id': self.period.id,
            'page': 1,
        })
        search_response = self.client.get('/api/reports/dashboard/almost-full/', {
            'period_id': self.period.id,
            'identifier': '405',
        })

        self.assertEqual(page_one_response.status_code, status.HTTP_200_OK)
        self.assertEqual(page_one_response.data['count'], 25)
        self.assertEqual(page_one_response.data['page_size'], 20)
        self.assertEqual(len(page_one_response.data['results']), 20)

        self.assertEqual(search_response.status_code, status.HTTP_200_OK)
        self.assertEqual(search_response.data['count'], 1)
        self.assertEqual(search_response.data['results'][0]['identifier'], '405')

    def test_admin_can_create_and_update_period_lucky_draw(self):
        self.client.force_authenticate(user=self.admin_user)

        create_response = self.client.post(
            f'/api/periods/{self.period.id}/lucky-draw/',
            {'number': '123456', 'reveal_time': '15:30'},
            format='json',
        )
        update_response = self.client.patch(
            f'/api/periods/{self.period.id}/lucky-draw/',
            {'number': '654321', 'reveal_time': '16:30'},
            format='json',
        )

        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(update_response.status_code, status.HTTP_200_OK)
        lucky_draw = LuckyDraw.objects.get(period=self.period)
        self.period.refresh_from_db()
        self.assertEqual(lucky_draw.number, '654321')
        self.assertEqual(self.period.lucky_draw_reveal_time.strftime('%H:%M'), '16:30')
        self.assertIsNotNone(lucky_draw.announced_at)
        self.assertTrue(
            AuditLog.objects.filter(action='period.lucky_draw_created', target_id=lucky_draw.id).exists()
        )
        self.assertTrue(
            AuditLog.objects.filter(action='period.lucky_draw_updated', target_id=lucky_draw.id).exists()
        )

    def test_period_lucky_draw_hides_raw_number_for_non_admin(self):
        LuckyDraw.objects.create(
            period=self.period,
            number='123456',
            announced_by=self.user_one,
            announced_at=timezone.now(),
        )

        self.client.force_authenticate(user=self.user_two)
        response = self.client.get(f'/api/periods/{self.period.id}/lucky-draw/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['display_number'], '123-456')
        self.assertIsNone(response.data['number'])

    def test_admin_can_delete_period_lucky_draw_before_period_end(self):
        lucky_draw = LuckyDraw.objects.create(
            period=self.period,
            number='123456',
            announced_by=self.admin_user,
            announced_at=timezone.now(),
        )

        self.client.force_authenticate(user=self.admin_user)
        response = self.client.delete(f'/api/periods/{self.period.id}/lucky-draw/')

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(LuckyDraw.objects.filter(id=lucky_draw.id).exists())
        self.assertTrue(
            AuditLog.objects.filter(action='period.lucky_draw_deleted').exists()
        )

    def test_user_notification_list_is_scoped_to_current_user(self):
        UserNotification.objects.create(
            recipient=self.user_one,
            category=UserNotification.CATEGORY_SYSTEM,
            level=UserNotification.LEVEL_IMPORTANT,
            title='User One Notice',
            message='Only user one should see this.',
        )
        UserNotification.objects.create(
            recipient=self.user_two,
            category=UserNotification.CATEGORY_SYSTEM,
            level=UserNotification.LEVEL_IMPORTANT,
            title='User Two Notice',
            message='Only user two should see this.',
        )

        self.client.force_authenticate(user=self.user_one)
        response = self.client.get('/api/notifications/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['title'], 'User One Notice')

    @patch('core.signals.push_notification_event')
    def test_user_notification_create_triggers_realtime_push(self, mocked_push):
        with self.captureOnCommitCallbacks(execute=True):
            UserNotification.objects.create(
                recipient=self.user_one,
                category=UserNotification.CATEGORY_SYSTEM,
                level=UserNotification.LEVEL_INFO,
                title='Realtime check',
                message='Notification should push after commit.',
            )

        mocked_push.assert_called_once()

    @patch('core.views.push_notification_refresh_for_user')
    def test_mark_all_notifications_read_triggers_realtime_refresh(self, mocked_refresh):
        notification = UserNotification.objects.create(
            recipient=self.user_one,
            category=UserNotification.CATEGORY_SYSTEM,
            level=UserNotification.LEVEL_WARNING,
            title='Unread notification',
            message='Mark all read should refresh live state.',
        )

        self.client.force_authenticate(user=self.user_one)
        response = self.client.post('/api/notifications/mark-all-read/', {}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        notification.refresh_from_db()
        self.assertIsNotNone(notification.read_at)
        mocked_refresh.assert_called_once_with(self.user_one.id)

    def test_admin_can_broadcast_notification_to_all_users(self):
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.post('/api/notifications/broadcast/', {
            'title': 'System maintenance',
            'message': 'FlowBit will be updated tonight.',
            'level': UserNotification.LEVEL_WARNING,
            'action_href': '/profile',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(
            UserNotification.objects.filter(title='System maintenance').count(),
            User.objects.filter(is_active=True).count(),
        )

    @patch('core.views.push_dashboard_refresh_for_users')
    def test_period_update_triggers_dashboard_refresh_push(self, mocked_push):
        self.client.force_authenticate(user=self.admin_user)

        response = self.client.patch(
            f'/api/periods/{self.period.id}/',
            {'name': f'{self.period.name} Updated'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        mocked_push.assert_called_once()

    def test_notification_admin_identity_is_masked_for_users_but_visible_to_admins(self):
        other_admin = User.objects.create_user(username='admin_two', password='pass12345')
        other_admin.profile.role = 'admin'
        other_admin.profile.save(update_fields=['role'])

        user_notification = UserNotification.objects.create(
            recipient=self.user_one,
            category=UserNotification.CATEGORY_ANNOUNCEMENT,
            level=UserNotification.LEVEL_INFO,
            title='Admin update',
            message='Notice for regular user.',
            created_by=self.admin_user,
        )
        admin_notification = UserNotification.objects.create(
            recipient=other_admin,
            category=UserNotification.CATEGORY_ANNOUNCEMENT,
            level=UserNotification.LEVEL_INFO,
            title='Admin update',
            message='Notice for admin.',
            created_by=self.admin_user,
        )

        self.client.force_authenticate(user=self.user_one)
        user_response = self.client.get('/api/notifications/')
        self.assertEqual(user_response.status_code, status.HTTP_200_OK)
        self.assertEqual(user_response.data[0]['id'], user_notification.id)
        self.assertEqual(user_response.data[0]['created_by_display'], 'Admin')

        self.client.force_authenticate(user=other_admin)
        admin_response = self.client.get('/api/notifications/')
        self.assertEqual(admin_response.status_code, status.HTTP_200_OK)
        self.assertEqual(admin_response.data[0]['id'], admin_notification.id)
        self.assertEqual(admin_response.data[0]['created_by_display'], self.admin_user.username)

    def test_lucky_draw_announcement_creates_system_notifications(self):
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.post(
            f'/api/periods/{self.period.id}/lucky-draw/',
            {'number': '123456'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(
            UserNotification.objects.filter(
                title='Lucky draw announced',
                period=self.period,
            ).count(),
            User.objects.filter(is_active=True).count(),
        )

    def test_period_pre_close_closes_active_ledgers(self):
        reserve_ledger = Ledger.get_capacity_reserve(self.period, self.user_one, create=True)
        triggered_at = timezone.now()
        self.period.apply_pre_close(triggered_at=triggered_at, acting_user=self.admin_user)
        self.user_one_ledger.refresh_from_db()
        reserve_ledger.refresh_from_db()
        self.assertFalse(self.user_one_ledger.is_active)
        self.assertFalse(reserve_ledger.is_active)
        self.assertEqual(self.user_one_ledger.closed_at, triggered_at)
        self.assertEqual(reserve_ledger.closed_at, triggered_at)

    @patch('core.views.timezone.now')
    def test_fetch_periods_pre_close_creates_system_notifications(self, mocked_now):
        mocked_now.return_value = timezone.make_aware(datetime(2028, 1, 1, 15, 31, 0))
        self.period.end_date = timezone.make_aware(datetime(2028, 1, 1, 23, 0, 0))
        self.period.pre_close_time = time(hour=15, minute=30)
        self.period.save(update_fields=['end_date', 'pre_close_time'])

        self.client.force_authenticate(user=self.admin_user)
        response = self.client.get('/api/periods/current/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            UserNotification.objects.filter(
                title='Period pre-close activated',
                period=self.period,
            ).count(),
            User.objects.filter(is_active=True).count(),
        )

    def test_current_period_returns_null_when_no_open_period_exists(self):
        self.period.close(closed_at=timezone.now(), closing_user=self.admin_user)
        self.client.force_authenticate(user=self.admin_user)

        response = self.client.get('/api/periods/current/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, {'period': None})

    def test_lucky_draw_announcement_applies_pre_close_if_needed(self):
        self.client.force_authenticate(user=self.admin_user)
        self.assertIsNone(self.period.pre_closed_at)

        response = self.client.post(
            f'/api/periods/{self.period.id}/lucky-draw/',
            {'number': '123456'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.period.refresh_from_db()
        self.user_one_ledger.refresh_from_db()
        self.assertIsNotNone(self.period.pre_closed_at)
        self.assertFalse(self.user_one_ledger.is_active)
        self.assertTrue(
            UserNotification.objects.filter(
                title='Period pre-close activated',
                period=self.period,
            ).exists()
        )

    def test_period_and_ledger_changes_create_system_notifications(self):
        self.client.force_authenticate(user=self.admin_user)

        period_update_response = self.client.patch(
            f'/api/periods/{self.period.id}/',
            {'end_date': '2027-12-30', 'close_time': '22:00'},
            format='json',
        )
        ledger_create_response = self.client.post('/api/ledgers/', {
            'period': self.period.id,
            'name': 'Alert Ledger',
            'end_date': '2027-12-30',
            'close_time': '14:30',
            'limit_per_identifier': '100',
            'priority': 2,
            'is_active': True,
        }, format='json')

        self.assertEqual(period_update_response.status_code, status.HTTP_200_OK)
        self.assertEqual(ledger_create_response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(
            UserNotification.objects.filter(title='Period updated', period=self.period).exists()
        )
        self.assertTrue(
            UserNotification.objects.filter(title='Ledger created', period=self.period).exists()
        )
        user_period_notification = UserNotification.objects.filter(
            recipient=self.user_one,
            title='Period updated',
            period=self.period,
        ).latest('created_at')
        admin_period_notification = UserNotification.objects.filter(
            recipient=self.admin_user,
            title='Period updated',
            period=self.period,
        ).latest('created_at')
        self.assertEqual(user_period_notification.action_href, '/')
        self.assertEqual(admin_period_notification.action_href, '/periods')

    def test_auto_closed_period_creates_system_notifications(self):
        self.period.start_date = timezone.now() - timezone.timedelta(days=2)
        self.period.end_date = timezone.now() - timezone.timedelta(minutes=1)
        self.period.save(update_fields=['start_date', 'end_date'])

        self.client.force_authenticate(user=self.admin_user)
        response = self.client.get('/api/periods/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            UserNotification.objects.filter(
                title='Period auto-closed',
                period=self.period,
            ).count(),
            User.objects.filter(is_active=True).count(),
        )

    def test_period_lucky_draw_cannot_change_after_period_end(self):
        self.period.start_date = timezone.now() - timezone.timedelta(days=1)
        self.period.is_open = False
        self.period.end_date = timezone.now() - timezone.timedelta(minutes=5)
        self.period.save(update_fields=['start_date', 'is_open', 'end_date'])
        LuckyDraw.objects.create(
            period=self.period,
            number='123456',
            announced_by=self.admin_user,
            announced_at=timezone.now() - timezone.timedelta(hours=1),
        )

        self.client.force_authenticate(user=self.admin_user)
        response = self.client.patch(
            f'/api/periods/{self.period.id}/lucky-draw/',
            {'number': '654321'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['detail'], 'Lucky draw number cannot be changed after the period ends.')

    def test_user_support_case_list_is_scoped_to_owner(self):
        case_one = SupportCase.objects.create(
            created_by=self.user_one,
            subject='User One Case',
            last_message_at=timezone.now(),
        )
        case_two = SupportCase.objects.create(
            created_by=self.user_two,
            subject='User Two Case',
            last_message_at=timezone.now(),
        )
        SupportMessage.objects.create(support_case=case_one, sender=self.user_one, body='User one message')
        SupportMessage.objects.create(support_case=case_two, sender=self.user_two, body='User two message')

        self.client.force_authenticate(user=self.user_one)
        response = self.client.get('/api/support-cases/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        subjects = {item['subject'] for item in response.data}
        self.assertEqual(subjects, {'User One Case'})

    def test_support_cases_are_listed_latest_activity_first(self):
        earlier_case = SupportCase.objects.create(
            created_by=self.user_one,
            subject='Earlier Case',
            last_message_at=timezone.now() - timezone.timedelta(hours=2),
        )
        later_case = SupportCase.objects.create(
            created_by=self.user_one,
            subject='Later Case',
            last_message_at=timezone.now() - timezone.timedelta(hours=1),
        )
        SupportMessage.objects.create(support_case=earlier_case, sender=self.user_one, body='Earlier message')
        SupportMessage.objects.create(support_case=later_case, sender=self.user_one, body='Later message')

        later_case.last_message_at = timezone.now() - timezone.timedelta(minutes=10)
        later_case.save(update_fields=['last_message_at', 'updated_at'])
        earlier_case.last_message_at = timezone.now()
        earlier_case.save(update_fields=['last_message_at', 'updated_at'])

        self.client.force_authenticate(user=self.user_one)
        response = self.client.get('/api/support-cases/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([item['subject'] for item in response.data], ['Earlier Case', 'Later Case'])

    def test_admin_can_view_all_support_cases(self):
        case_one = SupportCase.objects.create(
            created_by=self.user_one,
            subject='User One Case',
            last_message_at=timezone.now(),
        )
        case_two = SupportCase.objects.create(
            created_by=self.user_two,
            subject='User Two Case',
            last_message_at=timezone.now(),
        )
        SupportMessage.objects.create(support_case=case_one, sender=self.user_one, body='User one message')
        SupportMessage.objects.create(support_case=case_two, sender=self.user_two, body='User two message')

        self.client.force_authenticate(user=self.admin_user)
        response = self.client.get('/api/support-cases/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        subjects = {item['subject'] for item in response.data}
        self.assertEqual(subjects, {'User One Case', 'User Two Case'})

    def test_user_can_create_support_case_with_initial_message(self):
        self.client.force_authenticate(user=self.user_one)
        response = self.client.post('/api/support-cases/', {
            'subject': 'Ticket issue',
            'message': 'I need help with a ticket.',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        support_case = SupportCase.objects.get(subject='Ticket issue')
        self.assertEqual(support_case.created_by, self.user_one)
        self.assertEqual(support_case.messages.count(), 1)
        self.assertEqual(support_case.messages.first().body, 'I need help with a ticket.')
        self.assertTrue(
            UserNotification.objects.filter(
                recipient=self.admin_user,
                title='New customer service case',
            ).exists()
        )
        self.assertFalse(
            UserNotification.objects.filter(
                recipient=self.user_one,
                title='New customer service case',
            ).exists()
        )

    def test_public_login_help_case_can_be_created_without_authentication(self):
        response = self.client.post('/api/support-cases/login-help/', {
            'login_identifier': 'locked.user',
            'requester_name': 'Locked User',
            'subject': 'Cannot log in',
            'message': 'I cannot access my account after several attempts.',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['message'], 'Your login-help case has been sent to the admin.')
        support_case = SupportCase.objects.get(subject='Cannot log in')
        self.assertEqual(support_case.intake_type, SupportCase.INTAKE_LOGIN_HELP)
        self.assertEqual(support_case.requester_name, 'Locked User')
        self.assertEqual(support_case.requester_login_identifier, 'locked.user')
        self.assertEqual(support_case.created_by.username, '_login_help_intake')
        self.assertEqual(support_case.messages.count(), 1)
        self.assertEqual(support_case.messages.first().sender.username, '_login_help_intake')
        self.assertEqual(response.data['case']['created_by_full_name'], 'Locked User')
        self.assertEqual(response.data['case']['created_by_username'], 'locked.user')
        self.assertTrue(
            UserNotification.objects.filter(
                recipient=self.admin_user,
                title='New login help case',
            ).exists()
        )
        audit_entry = AuditLog.objects.get(action='support.login_help_case_created')
        self.assertIsNone(audit_entry.user)

    def test_public_login_help_does_not_open_authenticated_support_case_routes(self):
        response = self.client.get('/api/support-cases/')

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_case_detail_shows_requester_identity_for_login_help_message(self):
        self.client.post('/api/support-cases/login-help/', {
            'login_identifier': 'locked.user',
            'requester_name': 'Locked User',
            'subject': 'Cannot log in',
            'message': 'I cannot access my account after several attempts.',
        }, format='json')
        support_case = SupportCase.objects.get(subject='Cannot log in')

        self.client.force_authenticate(user=self.admin_user)
        response = self.client.get(f'/api/support-cases/{support_case.id}/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['created_by_full_name'], 'Locked User')
        self.assertEqual(response.data['created_by_username'], 'locked.user')
        self.assertEqual(response.data['messages'][0]['sender_full_name'], 'Locked User')
        self.assertEqual(response.data['messages'][0]['sender_username'], 'locked.user')

    def test_case_can_be_replied_closed_and_reopened_by_both_sides(self):
        support_case = SupportCase.objects.create(
            created_by=self.user_one,
            subject='Need overflow help',
            last_message_at=timezone.now(),
        )
        SupportMessage.objects.create(support_case=support_case, sender=self.user_one, body='Initial issue')

        self.client.force_authenticate(user=self.admin_user)
        admin_reply = self.client.post(
            f'/api/support-cases/{support_case.id}/reply/',
            {'message': 'Please try again now.'},
            format='json',
        )
        self.assertEqual(admin_reply.status_code, status.HTTP_200_OK)

        self.client.force_authenticate(user=self.user_one)
        close_response = self.client.post(f'/api/support-cases/{support_case.id}/close/', {}, format='json')
        self.assertEqual(close_response.status_code, status.HTTP_200_OK)

        reopen_response = self.client.post(f'/api/support-cases/{support_case.id}/reopen/', {}, format='json')
        self.assertEqual(reopen_response.status_code, status.HTTP_200_OK)

        support_case.refresh_from_db()
        self.assertEqual(support_case.status, SupportCase.STATUS_OPEN)
        self.assertEqual(support_case.messages.count(), 2)
        self.assertTrue(
            UserNotification.objects.filter(
                recipient=self.user_one,
                title='Admin replied to your case',
            ).exists()
        )

    def test_lucky_draw_winners_report_returns_matching_tickets_approved_overflows_and_overkill(self):
        winning_identifier = Identifier.objects.create(number='456')
        LuckyDraw.objects.create(
            period=self.period,
            number='123456',
            announced_by=self.admin_user,
            announced_at=timezone.now(),
        )

        winning_ticket = Ticket.objects.create(customer_name='Winner', created_by=self.user_one)
        winning_transaction = Transaction.objects.create(
            ticket=winning_ticket,
            identifier=winning_identifier,
            total_amount=Decimal('80.00'),
            created_by=self.user_one,
        )
        winning_overflow = Overflow.objects.create(
            transaction=winning_transaction,
            identifier=winning_identifier,
            owner=self.user_one,
            period=self.period,
            excess_amount=Decimal('25.00'),
            amount_to_approve=Decimal('25.00'),
            status=Overflow.STATUS_CSO,
            approved_at=timezone.now(),
        )
        winning_overkill = Overflow.objects.create(
            transaction=None,
            identifier=winning_identifier,
            owner=self.user_one,
            period=self.period,
            excess_amount=Decimal('40.00'),
            amount_to_approve=Decimal('40.00'),
            status=Overflow.STATUS_OVERKILL,
            approved_at=timezone.now(),
        )

        self.client.force_authenticate(user=self.user_one)
        response = self.client.get(f'/api/periods/{self.period.id}/lucky-draw-winners/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['lucky_draw']['display_number'], '123-456')
        self.assertEqual(response.data['tickets'][0]['ticket_number'], winning_ticket.ticket_number)
        self.assertEqual(response.data['tickets'][0]['matched_identifiers'], ['456'])
        self.assertEqual(response.data['approved_overflows'][0]['id'], winning_overflow.id)
        self.assertEqual(response.data['approved_overflows'][0]['identifier_number'], '456')
        self.assertEqual(response.data['overkill_overflows'][0]['id'], winning_overkill.id)
        self.assertEqual(response.data['overkill_overflows'][0]['identifier_number'], '456')


class PrivateWorkflowAPITests(APITestCase):
    def setUp(self):
        self.identifier = Identifier.objects.create(number='101')
        self.second_identifier = Identifier.objects.create(number='102')
        self.approver = User.objects.create_user(
            username='approver_user',
            first_name='Approver',
            last_name='User',
            password='password123',
        )
        self.approver.profile.role = 'admin'
        self.approver.profile.set_master_override_password('1234')
        self.approver.profile.save(update_fields=['role', 'master_override_password', 'updated_at'])
        self.other_user = User.objects.create_user(
            username='other_user',
            password='password123',
        )
        self.collaborator = Collaborator.objects.create(
            owner=self.approver,
            username='helper_user',
            full_name='Helper User',
            email='helper@example.com',
            phone_number='555555',
        )
        self.client.force_authenticate(user=self.approver)

        january_start = timezone.make_aware(datetime(2026, 1, 1, 0, 0, 0))
        january_end = timezone.make_aware(datetime(2026, 1, 31, 23, 59, 59))
        february_start = timezone.make_aware(datetime(2026, 2, 1, 0, 0, 0))
        december_end = timezone.make_aware(datetime(2026, 12, 31, 23, 59, 59))

        self.archived_period = Period.objects.create(
            name='January 2026 Period',
            start_date=january_start,
            end_date=january_end,
            is_open=True,
        )
        self.archived_ledger = Ledger.objects.create(
            owner=self.approver,
            period=self.archived_period,
            name='January 2026',
            end_date=january_end,
            limit_per_identifier=Decimal('100.00'),
            priority=1,
            is_active=True,
        )
        Ledger.get_capacity_reserve(self.archived_period, self.approver, create=True)
        archived_ticket = Ticket.objects.create(customer_name='Archived Customer', created_by=self.approver)
        self.archived_transaction = Transaction.objects.create(
            ticket=archived_ticket,
            identifier=self.identifier,
            total_amount=Decimal('150.00'),
            created_by=self.approver,
        )
        self.archived_period.close(closed_at=timezone.make_aware(datetime(2026, 2, 1, 0, 0, 0)))
        self.archived_ledger.refresh_from_db()
        self.archived_overflow = Overflow.objects.get(transaction=self.archived_transaction)

        self.active_period = Period.objects.create(
            name='Current Period',
            start_date=february_start,
            end_date=december_end,
            is_open=True,
        )
        self.active_ledger = Ledger.objects.create(
            owner=self.approver,
            period=self.active_period,
            name='Current Ledger',
            end_date=december_end,
            limit_per_identifier=Decimal('200.00'),
            priority=1,
            is_active=True,
        )
        Ledger.get_capacity_reserve(self.active_period, self.approver, create=True)
        self.active_ticket = Ticket.objects.create(customer_name='Active Customer', created_by=self.approver)
        self.active_transaction = Transaction.objects.create(
            ticket=self.active_ticket,
            identifier=self.identifier,
            total_amount=Decimal('75.00'),
            created_by=self.approver,
        )

    def test_ledger_list_can_filter_archive_section_for_current_user(self):
        response = self.client.get('/api/ledgers/', {'section': 'archive'})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        archived_ids = {item['id'] for item in response.data}
        self.assertIn(self.archived_ledger.id, archived_ids)
        self.assertTrue(any(item['is_capacity_reserve'] for item in response.data))

    def test_transactions_and_tickets_can_be_filtered_by_period_for_current_user(self):
        ticket_response = self.client.get('/api/tickets/', {
            'section': 'archive',
            'period_id': self.archived_period.id,
        })
        transaction_response = self.client.get('/api/transactions/', {'section': 'archive'})

        self.assertEqual(ticket_response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(ticket_response.data), 1)
        self.assertEqual(ticket_response.data[0]['ticket_number'], self.archived_transaction.ticket.ticket_number)
        self.assertEqual(transaction_response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(transaction_response.data), 1)
        self.assertEqual(transaction_response.data[0]['id'], self.archived_transaction.id)

    def test_archived_ledger_view_keeps_closed_allocations(self):
        response = self.client.get(f'/api/ledgers/{self.archived_ledger.id}/view/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(Decimal(response.data['summary']['allocated_total']), Decimal('100.00'))
        identifier_row = next(
            row for row in response.data['identifiers']
            if row['number'] == self.identifier.number
        )
        self.assertEqual(Decimal(identifier_row['allocated_amount']), Decimal('100.00'))

    def test_ticket_list_can_fetch_second_page(self):
        for index in range(24):
            ticket = Ticket.objects.create(
                customer_name=f'Paged Customer {index}',
                created_by=self.approver,
            )
            Transaction.objects.create(
                ticket=ticket,
                identifier=self.identifier if index % 2 == 0 else self.second_identifier,
                total_amount=Decimal('10.00'),
                created_by=self.approver,
            )

        response = self.client.get('/api/tickets/', {
            'period_id': self.active_period.id,
            'page': 2,
            'page_size': 20,
        })

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['page'], 2)
        self.assertEqual(response.data['page_size'], 20)
        self.assertEqual(response.data['total_pages'], 2)
        self.assertEqual(response.data['count'], 25)
        self.assertEqual(len(response.data['results']), 5)

    def test_ticket_list_can_search_identifier_across_active_period(self):
        response = self.client.get('/api/tickets/', {
            'period_id': self.active_period.id,
            'page': 1,
            'page_size': 20,
            'search': self.identifier.number,
        })

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['results'][0]['ticket_number'], self.active_ticket.ticket_number)

    def test_ticket_list_can_filter_refunded_tickets(self):
        refund_response = self.client.post(
            f'/api/tickets/{self.active_ticket.ticket_number}/refund/',
            {'action': 'refund_ticket', 'admin_override_code': '1234'},
            format='json',
        )
        self.assertEqual(refund_response.status_code, status.HTTP_200_OK)

        response = self.client.get('/api/tickets/', {
            'period_id': self.active_period.id,
            'page': 1,
            'page_size': 20,
            'refund_filter': 'refunded',
        })

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['results'][0]['ticket_number'], self.active_ticket.ticket_number)

    def test_repeat_ticket_can_be_created_and_generated_into_active_ticket(self):
        create_response = self.client.post(
            '/api/repeat-tickets/',
            {
                'customer_name': 'Repeat Customer',
                'notes': 'Monthly template',
                'items': [
                    {
                        'identifier': self.identifier.id,
                        'amount': '50.00',
                        'amount_uses_allocation_basis': False,
                        'use_permutations': False,
                        'position': 0,
                    },
                    {
                        'identifier': self.second_identifier.id,
                        'amount': '40.00',
                        'amount_uses_allocation_basis': False,
                        'use_permutations': False,
                        'position': 1,
                    },
                ],
            },
            format='json',
        )

        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)
        repeat_ticket_id = create_response.data['id']

        generate_response = self.client.post(
            f'/api/repeat-tickets/{repeat_ticket_id}/generate/',
            {},
            format='json',
        )

        self.assertEqual(generate_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(generate_response.data['status'], 'GENERATED')
        generated_ticket = Ticket.objects.get(pk=generate_response.data['ticket_id'])
        self.assertEqual(generated_ticket.created_by, self.approver)
        self.assertEqual(generated_ticket.transactions.count(), 2)

        repeat_ticket = RepeatTicket.objects.get(pk=repeat_ticket_id)
        generation = RepeatTicketGeneration.objects.get(
            repeat_ticket=repeat_ticket,
            period=self.active_period,
        )
        self.assertEqual(generation.ticket_id, generated_ticket.id)
        self.assertEqual(generation.status, RepeatTicketGeneration.STATUS_GENERATED)

        list_response = self.client.get('/api/repeat-tickets/')
        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        listed_repeat_ticket = next(item for item in list_response.data if item['id'] == repeat_ticket_id)
        self.assertEqual(listed_repeat_ticket['current_status'], 'GENERATED')
        self.assertEqual(listed_repeat_ticket['generated_ticket_id'], generated_ticket.id)
        self.assertEqual(listed_repeat_ticket['generated_ticket_number'], generated_ticket.ticket_number)

    def test_repeat_ticket_without_customer_name_generates_using_repeat_code(self):
        create_response = self.client.post(
            '/api/repeat-tickets/',
            {
                'customer_name': '',
                'items': [
                    {
                        'identifier': self.identifier.id,
                        'amount': '50.00',
                        'amount_uses_allocation_basis': False,
                        'use_permutations': False,
                        'position': 0,
                    },
                ],
            },
            format='json',
        )

        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)
        repeat_ticket_id = create_response.data['id']
        self.assertEqual(create_response.data['repeat_code'], 'REP-00001')

        generate_response = self.client.post(
            f'/api/repeat-tickets/{repeat_ticket_id}/generate/',
            {},
            format='json',
        )

        self.assertEqual(generate_response.status_code, status.HTTP_201_CREATED)
        generated_ticket = Ticket.objects.get(pk=generate_response.data['ticket_id'])
        self.assertEqual(generated_ticket.customer_name, 'REP-00001')

    def test_repeat_ticket_with_customer_name_generates_using_rep_prefix(self):
        create_response = self.client.post(
            '/api/repeat-tickets/',
            {
                'customer_name': 'Dana',
                'items': [
                    {
                        'identifier': self.identifier.id,
                        'amount': '50.00',
                        'amount_uses_allocation_basis': False,
                        'use_permutations': False,
                        'position': 0,
                    },
                ],
            },
            format='json',
        )

        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)
        repeat_ticket_id = create_response.data['id']

        generate_response = self.client.post(
            f'/api/repeat-tickets/{repeat_ticket_id}/generate/',
            {},
            format='json',
        )

        self.assertEqual(generate_response.status_code, status.HTTP_201_CREATED)
        generated_ticket = Ticket.objects.get(pk=generate_response.data['ticket_id'])
        self.assertEqual(generated_ticket.customer_name, 'REP-Dana')

    def test_repeat_ticket_can_be_created_with_identifier_number_only(self):
        create_response = self.client.post(
            '/api/repeat-tickets/',
            {
                'customer_name': 'Number Only Repeat',
                'items': [
                    {
                        'identifier_number': '101',
                        'amount': '50.00',
                        'amount_uses_allocation_basis': False,
                        'use_permutations': False,
                        'position': 0,
                    },
                ],
            },
            format='json',
        )

        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(create_response.data['items'][0]['identifier_number'], '101')

    def test_repeat_ticket_assigns_per_user_serial_code_and_reuses_gaps(self):
        first_response = self.client.post(
            '/api/repeat-tickets/',
            {
                'customer_name': 'First Repeat',
                'items': [
                    {
                        'identifier': self.identifier.id,
                        'amount': '50.00',
                        'amount_uses_allocation_basis': False,
                        'use_permutations': False,
                        'position': 0,
                    },
                ],
            },
            format='json',
        )
        second_response = self.client.post(
            '/api/repeat-tickets/',
            {
                'customer_name': 'Second Repeat',
                'items': [
                    {
                        'identifier': self.second_identifier.id,
                        'amount': '40.00',
                        'amount_uses_allocation_basis': False,
                        'use_permutations': False,
                        'position': 0,
                    },
                ],
            },
            format='json',
        )

        self.assertEqual(first_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(first_response.data['repeat_code'], 'REP-00001')
        self.assertEqual(second_response.data['repeat_code'], 'REP-00002')

        delete_response = self.client.delete(f"/api/repeat-tickets/{first_response.data['id']}/")
        self.assertEqual(delete_response.status_code, status.HTTP_204_NO_CONTENT)

        third_response = self.client.post(
            '/api/repeat-tickets/',
            {
                'customer_name': 'Third Repeat',
                'items': [
                    {
                        'identifier': self.identifier.id,
                        'amount': '30.00',
                        'amount_uses_allocation_basis': False,
                        'use_permutations': False,
                        'position': 0,
                    },
                ],
            },
            format='json',
        )

        self.assertEqual(third_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(third_response.data['repeat_code'], 'REP-00001')

    def test_repeat_ticket_generate_all_skips_generated_and_collects_unsuccessful(self):
        generated_repeat = self.client.post(
            '/api/repeat-tickets/',
            {
                'customer_name': 'Already Generated',
                'items': [
                    {
                        'identifier': self.identifier.id,
                        'amount': '40.00',
                        'amount_uses_allocation_basis': False,
                        'use_permutations': False,
                        'position': 0,
                    },
                ],
            },
            format='json',
        )
        ready_repeat = self.client.post(
            '/api/repeat-tickets/',
            {
                'customer_name': 'Ready Repeat',
                'items': [
                    {
                        'identifier': self.second_identifier.id,
                        'amount': '45.00',
                        'amount_uses_allocation_basis': False,
                        'use_permutations': False,
                        'position': 0,
                    },
                ],
            },
            format='json',
        )
        failing_repeat = self.client.post(
            '/api/repeat-tickets/',
            {
                'customer_name': 'Permutation Failure',
                'items': [
                    {
                        'identifier': self.identifier.id,
                        'amount': '20.00',
                        'amount_uses_allocation_basis': False,
                        'use_permutations': True,
                        'position': 0,
                    },
                ],
            },
            format='json',
        )

        self.assertEqual(generated_repeat.status_code, status.HTTP_201_CREATED)
        self.assertEqual(ready_repeat.status_code, status.HTTP_201_CREATED)
        self.assertEqual(failing_repeat.status_code, status.HTTP_201_CREATED)

        first_generate = self.client.post(
            f"/api/repeat-tickets/{generated_repeat.data['id']}/generate/",
            {},
            format='json',
        )
        self.assertEqual(first_generate.status_code, status.HTTP_201_CREATED)

        response = self.client.post('/api/repeat-tickets/generate-all/', {}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['generated']), 1)
        self.assertEqual(response.data['generated'][0]['repeat_ticket_id'], ready_repeat.data['id'])
        self.assertEqual(len(response.data['skipped']), 1)
        self.assertEqual(response.data['skipped'][0]['repeat_ticket_id'], generated_repeat.data['id'])
        self.assertEqual(len(response.data['unsuccessful']), 1)
        self.assertEqual(response.data['unsuccessful'][0]['repeat_ticket_id'], failing_repeat.data['id'])
        self.assertEqual(
            response.data['unsuccessful'][0]['status'],
            RepeatTicketGeneration.STATUS_UNSUCCESSFUL,
        )

    def test_repeat_ticket_generate_requires_spill_over_confirmation(self):
        repeat_ticket_response = self.client.post(
            '/api/repeat-tickets/',
            {
                'customer_name': 'Overflow Confirm Customer',
                'items': [
                    {
                        'identifier': self.identifier.id,
                        'amount': '150.00',
                        'amount_uses_allocation_basis': False,
                        'use_permutations': False,
                        'position': 0,
                    },
                ],
            },
            format='json',
        )
        repeat_ticket_id = repeat_ticket_response.data['id']

        response = self.client.post(
            f'/api/repeat-tickets/{repeat_ticket_id}/generate/',
            {},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'CONFIRM_REQUIRED')
        self.assertEqual(response.data['repeat_ticket_id'], repeat_ticket_id)
        self.assertEqual(response.data['overflow_items'][0]['identifier_number'], self.identifier.number)

        list_response = self.client.get('/api/repeat-tickets/')
        listed_repeat_ticket = next(item for item in list_response.data if item['id'] == repeat_ticket_id)
        self.assertEqual(listed_repeat_ticket['current_status'], 'NEW')

    def test_repeat_ticket_generate_can_continue_after_spill_over_confirmation(self):
        repeat_ticket_response = self.client.post(
            '/api/repeat-tickets/',
            {
                'customer_name': 'Overflow Process Customer',
                'items': [
                    {
                        'identifier': self.identifier.id,
                        'amount': '150.00',
                        'amount_uses_allocation_basis': False,
                        'use_permutations': False,
                        'position': 0,
                    },
                ],
            },
            format='json',
        )
        repeat_ticket_id = repeat_ticket_response.data['id']

        response = self.client.post(
            f'/api/repeat-tickets/{repeat_ticket_id}/generate/',
            {
                'confirm_spill_over': True,
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['status'], RepeatTicketGeneration.STATUS_GENERATED)

    def test_repeat_ticket_status_returns_new_again_for_next_period(self):
        repeat_ticket_response = self.client.post(
            '/api/repeat-tickets/',
            {
                'customer_name': 'Recurring Customer',
                'items': [
                    {
                        'identifier': self.identifier.id,
                        'amount': '40.00',
                        'amount_uses_allocation_basis': False,
                        'use_permutations': False,
                        'position': 0,
                    },
                ],
            },
            format='json',
        )
        self.assertEqual(repeat_ticket_response.status_code, status.HTTP_201_CREATED)
        repeat_ticket_id = repeat_ticket_response.data['id']

        generate_response = self.client.post(
            f'/api/repeat-tickets/{repeat_ticket_id}/generate/',
            {},
            format='json',
        )
        self.assertEqual(generate_response.status_code, status.HTTP_201_CREATED)

        self.active_period.close(closed_at=timezone.now())
        next_period = Period.objects.create(
            name='Next Active Period',
            start_date=timezone.make_aware(datetime(2027, 1, 1, 0, 0, 0)),
            end_date=timezone.make_aware(datetime(2027, 12, 31, 23, 59, 59)),
            is_open=True,
        )
        Ledger.objects.create(
            owner=self.approver,
            period=next_period,
            name='Next Current Ledger',
            end_date=next_period.end_date,
            limit_per_identifier=Decimal('200.00'),
            priority=1,
            is_active=True,
        )

        list_response = self.client.get('/api/repeat-tickets/')
        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        listed_repeat_ticket = next(item for item in list_response.data if item['id'] == repeat_ticket_id)
        self.assertEqual(listed_repeat_ticket['current_status'], 'NEW')
        self.assertIsNone(listed_repeat_ticket['generated_ticket_id'])

    def test_ticket_transaction_refund_can_sync_repeat_ticket_template(self):
        repeat_ticket_response = self.client.post(
            '/api/repeat-tickets/',
            {
                'customer_name': 'Sync Customer',
                'items': [
                    {
                        'identifier': self.identifier.id,
                        'amount': '50.00',
                        'amount_uses_allocation_basis': False,
                        'use_permutations': False,
                        'position': 0,
                    },
                    {
                        'identifier': self.second_identifier.id,
                        'amount': '40.00',
                        'amount_uses_allocation_basis': False,
                        'use_permutations': False,
                        'position': 1,
                    },
                ],
            },
            format='json',
        )
        repeat_ticket_id = repeat_ticket_response.data['id']

        generate_response = self.client.post(
            f'/api/repeat-tickets/{repeat_ticket_id}/generate/',
            {},
            format='json',
        )
        generated_ticket = Ticket.objects.get(pk=generate_response.data['ticket_id'])
        generated_transaction = generated_ticket.transactions.get(identifier=self.identifier)

        refund_response = self.client.post(
            f'/api/tickets/{generated_ticket.ticket_number}/refund/',
            {
                'action': 'refund_transaction',
                'admin_override_code': '1234',
                'transaction_id': generated_transaction.id,
                'sync_repeat_ticket': True,
            },
            format='json',
        )

        self.assertEqual(refund_response.status_code, status.HTTP_200_OK)
        repeat_ticket = RepeatTicket.objects.get(pk=repeat_ticket_id)
        repeat_items = list(repeat_ticket.items.order_by('position').values_list('identifier__number', 'amount'))
        self.assertEqual(repeat_items, [(self.second_identifier.number, Decimal('40.00'))])

    def test_overflow_refund_can_sync_repeat_ticket_template_amount(self):
        repeat_ticket_response = self.client.post(
            '/api/repeat-tickets/',
            {
                'customer_name': 'Overflow Sync Customer',
                'items': [
                    {
                        'identifier': self.identifier.id,
                        'amount': '150.00',
                        'amount_uses_allocation_basis': False,
                        'use_permutations': False,
                        'position': 0,
                    },
                ],
            },
            format='json',
        )
        repeat_ticket_id = repeat_ticket_response.data['id']

        generate_response = self.client.post(
            f'/api/repeat-tickets/{repeat_ticket_id}/generate/',
            {},
            format='json',
        )
        generated_ticket = Ticket.objects.get(pk=generate_response.data['ticket_id'])
        generated_transaction = generated_ticket.transactions.get(identifier=self.identifier)
        overflow = generated_transaction.overflows.get(status=Overflow.STATUS_TCSO)

        refund_response = self.client.post(
            f'/api/overflows/{overflow.id}/resolve/',
            {
                'action': 'refund_overflow_only',
                'admin_override_code': '1234',
                'sync_repeat_ticket': True,
            },
            format='json',
        )

        self.assertEqual(refund_response.status_code, status.HTTP_200_OK)
        generated_ticket.refresh_from_db()
        repeat_ticket = RepeatTicket.objects.get(pk=repeat_ticket_id)
        repeat_item = repeat_ticket.items.get()
        self.assertEqual(repeat_item.identifier.number, self.identifier.number)
        self.assertEqual(repeat_item.amount, generated_ticket.total_amount)

    def test_ticket_list_can_sort_by_amount_desc(self):
        higher_ticket = Ticket.objects.create(
            customer_name='Higher Amount Customer',
            created_by=self.approver,
        )
        Transaction.objects.create(
            ticket=higher_ticket,
            identifier=self.second_identifier,
            total_amount=Decimal('125.00'),
            created_by=self.approver,
        )

        response = self.client.get('/api/tickets/', {
            'period_id': self.active_period.id,
            'page': 1,
            'page_size': 20,
            'sort': 'amount_desc',
        })

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['results'][0]['ticket_number'], higher_ticket.ticket_number)

    def test_ticket_list_page_summary_reflects_full_filtered_result(self):
        extra_ticket = Ticket.objects.create(
            customer_name='Summary Customer',
            created_by=self.approver,
        )
        Transaction.objects.create(
            ticket=extra_ticket,
            identifier=self.second_identifier,
            total_amount=Decimal('25.00'),
            created_by=self.approver,
        )

        response = self.client.get('/api/tickets/', {
            'period_id': self.active_period.id,
            'page': 1,
            'page_size': 1,
        })

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['summary']['ticket_count'], 2)
        self.assertEqual(response.data['summary']['total_entries'], 2)
        self.assertEqual(Decimal(response.data['summary']['total_amount']), Decimal('100.00'))

    def test_approved_overflows_can_be_filtered_by_closed_period(self):
        response = self.client.get('/api/overflows/approved/', {
            'period_id': self.archived_period.id,
        })

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        overflow_ids = {item['id'] for item in response.data}
        self.assertIn(self.archived_overflow.id, overflow_ids)

    def test_approved_overflows_can_be_paged_for_closed_period(self):
        first_identifier = Identifier.objects.create(number='771')
        second_identifier = Identifier.objects.create(number='772')

        first_ticket = Ticket.objects.create(
            customer_name='Archive Overflow One',
            created_by=self.approver,
        )
        second_ticket = Ticket.objects.create(
            customer_name='Archive Overflow Two',
            created_by=self.approver,
        )
        first_transaction = Transaction.objects.create(
            ticket=first_ticket,
            identifier=first_identifier,
            total_amount=Decimal('200.00'),
            created_by=self.approver,
        )
        second_transaction = Transaction.objects.create(
            ticket=second_ticket,
            identifier=second_identifier,
            total_amount=Decimal('200.00'),
            created_by=self.approver,
        )
        first_overflow = Overflow.objects.create(
            transaction=first_transaction,
            identifier=first_identifier,
            period=self.archived_period,
            owner=self.approver,
            excess_amount=Decimal('25.00'),
            amount_to_approve=Decimal('25.00'),
            status=Overflow.STATUS_CSO,
            approved_at=timezone.now() - timedelta(minutes=2),
        )
        second_overflow = Overflow.objects.create(
            transaction=second_transaction,
            identifier=second_identifier,
            period=self.archived_period,
            owner=self.approver,
            excess_amount=Decimal('30.00'),
            amount_to_approve=Decimal('30.00'),
            status=Overflow.STATUS_CSO,
            approved_at=timezone.now() - timedelta(minutes=1),
        )

        response = self.client.get('/api/overflows/approved/', {
            'period_id': self.archived_period.id,
            'page': 2,
            'page_size': 1,
        })

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 3)
        self.assertEqual(response.data['page'], 2)
        self.assertEqual(response.data['page_size'], 1)
        self.assertEqual(response.data['total_pages'], 3)
        self.assertEqual(len(response.data['results']), 1)
        returned_ids = {item['id'] for item in response.data['results']}
        self.assertEqual(returned_ids, {first_overflow.id})

    def test_pending_and_overkill_overflows_can_be_paged(self):
        first_pending_identifier = Identifier.objects.create(number='781')
        second_pending_identifier = Identifier.objects.create(number='782')
        first_pending_ticket = Ticket.objects.create(
            customer_name='Pending One',
            created_by=self.approver,
        )
        second_pending_ticket = Ticket.objects.create(
            customer_name='Pending Two',
            created_by=self.approver,
        )
        first_pending_transaction = Transaction.objects.create(
            ticket=first_pending_ticket,
            identifier=first_pending_identifier,
            total_amount=Decimal('200.00'),
            created_by=self.approver,
        )
        second_pending_transaction = Transaction.objects.create(
            ticket=second_pending_ticket,
            identifier=second_pending_identifier,
            total_amount=Decimal('200.00'),
            created_by=self.approver,
        )
        first_pending = Overflow.objects.get(
            transaction=first_pending_transaction,
            status=Overflow.STATUS_TCSO,
        )
        second_pending = Overflow.objects.get(
            transaction=second_pending_transaction,
            status=Overflow.STATUS_TCSO,
        )

        overkill_identifier_one = Identifier.objects.create(number='783')
        overkill_identifier_two = Identifier.objects.create(number='784')
        first_overkill = Overflow.objects.create(
            identifier=overkill_identifier_one,
            period=self.active_period,
            owner=self.approver,
            excess_amount=Decimal('25.00'),
            amount_to_approve=Decimal('25.00'),
            status=Overflow.STATUS_OVERKILL,
            approved_at=timezone.now() - timedelta(minutes=2),
        )
        second_overkill = Overflow.objects.create(
            identifier=overkill_identifier_two,
            period=self.active_period,
            owner=self.approver,
            excess_amount=Decimal('30.00'),
            amount_to_approve=Decimal('30.00'),
            status=Overflow.STATUS_OVERKILL,
            approved_at=timezone.now() - timedelta(minutes=1),
        )

        pending_response = self.client.get('/api/overflows/pending/', {
            'page': 2,
            'page_size': 1,
        })
        overkill_response = self.client.get('/api/overflows/overkill/', {
            'page': 2,
            'page_size': 1,
        })

        self.assertEqual(pending_response.status_code, status.HTTP_200_OK)
        self.assertEqual(pending_response.data['count'], 2)
        self.assertEqual(pending_response.data['page'], 2)
        self.assertEqual(pending_response.data['page_size'], 1)
        self.assertEqual(pending_response.data['total_pages'], 2)
        self.assertEqual({item['id'] for item in pending_response.data['results']}, {first_pending.id})

        self.assertEqual(overkill_response.status_code, status.HTTP_200_OK)
        self.assertEqual(overkill_response.data['count'], 2)
        self.assertEqual(overkill_response.data['page'], 2)
        self.assertEqual(overkill_response.data['page_size'], 1)
        self.assertEqual(overkill_response.data['total_pages'], 2)
        self.assertEqual({item['id'] for item in overkill_response.data['results']}, {first_overkill.id})

    def test_overflow_page_filters_and_summary_use_full_dataset(self):
        collaborator = Collaborator.objects.create(
            owner=self.approver,
            username='summary_collab',
            full_name='Summary Collaborator',
            email='summary@example.com',
            phone_number='0123456789',
        )
        first_identifier = Identifier.objects.create(number='791')
        second_identifier = Identifier.objects.create(number='792')

        first_ticket = Ticket.objects.create(
            customer_name='Summary Customer One',
            created_by=self.approver,
        )
        second_ticket = Ticket.objects.create(
            customer_name='Summary Customer Two',
            created_by=self.approver,
        )
        first_transaction = Transaction.objects.create(
            ticket=first_ticket,
            identifier=first_identifier,
            total_amount=Decimal('200.00'),
            created_by=self.approver,
        )
        second_transaction = Transaction.objects.create(
            ticket=second_ticket,
            identifier=second_identifier,
            total_amount=Decimal('200.00'),
            created_by=self.approver,
        )

        first_overflow = Overflow.objects.create(
            transaction=first_transaction,
            identifier=first_identifier,
            period=self.active_period,
            owner=self.approver,
            excess_amount=Decimal('25.00'),
            amount_to_approve=Decimal('25.00'),
            status=Overflow.STATUS_CSO,
            approved_at=timezone.now() - timedelta(minutes=2),
        )
        second_overflow = Overflow.objects.create(
            transaction=second_transaction,
            identifier=second_identifier,
            period=self.active_period,
            owner=self.approver,
            excess_amount=Decimal('30.00'),
            amount_to_approve=Decimal('30.00'),
            status=Overflow.STATUS_CSO,
            approved_at=timezone.now() - timedelta(minutes=1),
        )
        first_overflow.collaborators.add(collaborator)
        second_overflow.collaborators.add(collaborator)

        response = self.client.get('/api/overflows/approved/', {
            'page': 1,
            'page_size': 1,
            'identifier_number': '79',
            'collaborator_name': collaborator.full_name,
        })

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 2)
        self.assertEqual(response.data['total_pages'], 2)
        self.assertEqual(Decimal(response.data['summary']['total_amount']), Decimal('55.00'))

    def test_spill_over_export_summary_can_scope_to_collaborator_and_all(self):
        tx = Transaction.objects.create(
            ticket=Ticket.objects.create(customer_name='Spill Export Ticket', created_by=self.approver),
            identifier=self.second_identifier,
            total_amount=Decimal('250.00'),
            created_by=self.approver,
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

        collaborator_response = self.client.get(
            '/api/collaborators/spill-over-export/',
            {
                'period_id': self.active_period.id,
                'collaborator_id': self.collaborator.id,
            }
        )
        all_response = self.client.get(
            '/api/collaborators/spill-over-export/',
            {
                'period_id': self.active_period.id,
                'collaborator_id': 'all',
            }
        )

        self.assertEqual(collaborator_response.status_code, status.HTTP_200_OK)
        self.assertEqual(collaborator_response.data['collaborator_label'], self.collaborator.full_name)
        self.assertGreaterEqual(Decimal(collaborator_response.data['summary']['total_amount']), Decimal('180.00'))
        self.assertTrue(any(row['identifier_number'] == self.second_identifier.number for row in collaborator_response.data['rows']))

        self.assertEqual(all_response.status_code, status.HTTP_200_OK)
        self.assertEqual(all_response.data['collaborator_label'], 'All collaborators')

    def test_spill_over_export_all_collaborators_keeps_duplicate_identifiers_separate(self):
        duplicate_identifier = Identifier.objects.create(number='887')
        first_tx = Transaction.objects.create(
            ticket=Ticket.objects.create(customer_name='First Duplicate Export Ticket', created_by=self.approver),
            identifier=duplicate_identifier,
            total_amount=Decimal('250.00'),
            created_by=self.approver,
        )
        second_tx = Transaction.objects.create(
            ticket=Ticket.objects.create(customer_name='Second Duplicate Export Ticket', created_by=self.approver),
            identifier=duplicate_identifier,
            total_amount=Decimal('200.00'),
            created_by=self.approver,
        )
        first_overflow = Overflow.objects.get(transaction=first_tx)
        second_overflow = Overflow.objects.get(transaction=second_tx)

        first_approval_response = self.client.post(
            f'/api/overflows/{first_overflow.id}/approve/',
            {
                'amount_to_approve': str(first_overflow.excess_amount),
                'collaborator_ids': [self.collaborator.id],
            },
            format='json'
        )
        second_approval_response = self.client.post(
            f'/api/overflows/{second_overflow.id}/approve/',
            {
                'amount_to_approve': str(second_overflow.excess_amount),
                'collaborator_ids': [self.collaborator.id],
            },
            format='json'
        )
        self.assertEqual(first_approval_response.status_code, status.HTTP_200_OK)
        self.assertEqual(second_approval_response.status_code, status.HTTP_200_OK)

        all_response = self.client.get(
            '/api/collaborators/spill-over-export/',
            {
                'period_id': self.active_period.id,
                'collaborator_id': 'all',
            }
        )

        self.assertEqual(all_response.status_code, status.HTTP_200_OK)
        matching_rows = [
            row for row in all_response.data['rows']
            if row['identifier_number'] == duplicate_identifier.number
        ]
        self.assertEqual(len(matching_rows), 2)
        self.assertEqual(sorted(Decimal(row['amount']) for row in matching_rows), sorted([
            first_overflow.excess_amount,
            second_overflow.excess_amount,
        ]))

    def test_spill_over_export_collaborator_keeps_duplicate_identifiers_separate_and_time_ordered(self):
        duplicate_identifier = Identifier.objects.create(number='886')
        first_tx = Transaction.objects.create(
            ticket=Ticket.objects.create(customer_name='First Collaborator Duplicate Export Ticket', created_by=self.approver),
            identifier=duplicate_identifier,
            total_amount=Decimal('220.00'),
            created_by=self.approver,
        )
        second_tx = Transaction.objects.create(
            ticket=Ticket.objects.create(customer_name='Second Collaborator Duplicate Export Ticket', created_by=self.approver),
            identifier=duplicate_identifier,
            total_amount=Decimal('180.00'),
            created_by=self.approver,
        )
        first_overflow = Overflow.objects.get(transaction=first_tx)
        second_overflow = Overflow.objects.get(transaction=second_tx)

        first_approval_response = self.client.post(
            f'/api/overflows/{first_overflow.id}/approve/',
            {
                'amount_to_approve': str(first_overflow.excess_amount),
                'collaborator_ids': [self.collaborator.id],
            },
            format='json'
        )
        second_approval_response = self.client.post(
            f'/api/overflows/{second_overflow.id}/approve/',
            {
                'amount_to_approve': str(second_overflow.excess_amount),
                'collaborator_ids': [self.collaborator.id],
            },
            format='json'
        )
        self.assertEqual(first_approval_response.status_code, status.HTTP_200_OK)
        self.assertEqual(second_approval_response.status_code, status.HTTP_200_OK)

        collaborator_response = self.client.get(
            '/api/collaborators/spill-over-export/',
            {
                'period_id': self.active_period.id,
                'collaborator_id': self.collaborator.id,
            }
        )

        self.assertEqual(collaborator_response.status_code, status.HTTP_200_OK)
        matching_rows = [
            row for row in collaborator_response.data['rows']
            if row['identifier_number'] == duplicate_identifier.number
        ]
        self.assertEqual(len(matching_rows), 2)
        self.assertEqual(
            [Decimal(row['amount']) for row in matching_rows],
            [first_overflow.excess_amount, second_overflow.excess_amount],
        )

    def test_approved_overflows_can_be_searched_for_closed_period(self):
        searchable_identifier = Identifier.objects.create(number='889')
        searchable_ticket = Ticket.objects.create(
            customer_name='Searchable Archive Customer',
            created_by=self.approver,
        )
        searchable_transaction = Transaction.objects.create(
            ticket=searchable_ticket,
            identifier=searchable_identifier,
            total_amount=Decimal('200.00'),
            created_by=self.approver,
        )
        searchable_overflow = Overflow.objects.create(
            transaction=searchable_transaction,
            identifier=searchable_identifier,
            period=self.archived_period,
            owner=self.approver,
            excess_amount=Decimal('25.00'),
            amount_to_approve=Decimal('25.00'),
            status=Overflow.STATUS_CSO,
            approved_at=timezone.now(),
        )
        searchable_overflow.collaborators.add(self.collaborator)

        response = self.client.get('/api/overflows/approved/', {
            'period_id': self.archived_period.id,
            'search': '889',
            'page': 1,
            'page_size': 20,
        })

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        returned_ids = {item['id'] for item in response.data['results']}
        self.assertIn(searchable_overflow.id, returned_ids)

    def test_approved_overflows_can_be_filtered_by_identifier_field_for_closed_period(self):
        searchable_identifier = Identifier.objects.create(number='991')
        searchable_ticket = Ticket.objects.create(
            customer_name='Archive Filtered Overflow',
            created_by=self.approver,
        )
        searchable_transaction = Transaction.objects.create(
            ticket=searchable_ticket,
            identifier=searchable_identifier,
            total_amount=Decimal('200.00'),
            created_by=self.approver,
        )
        searchable_overflow = Overflow.objects.create(
            transaction=searchable_transaction,
            identifier=searchable_identifier,
            period=self.archived_period,
            owner=self.approver,
            excess_amount=Decimal('25.00'),
            amount_to_approve=Decimal('25.00'),
            status=Overflow.STATUS_CSO,
            approved_at=timezone.now(),
        )

        response = self.client.get('/api/overflows/approved/', {
            'period_id': self.archived_period.id,
            'identifier_number': '991',
            'page': 1,
            'page_size': 20,
        })

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        returned_ids = {item['id'] for item in response.data['results']}
        self.assertIn(searchable_overflow.id, returned_ids)
        self.assertNotIn(self.archived_overflow.id, returned_ids)

    def test_approved_overflows_can_be_filtered_by_collaborator_field_for_closed_period(self):
        searchable_identifier = Identifier.objects.create(number='993')
        searchable_ticket = Ticket.objects.create(
            customer_name='Archive Collaborator Filter',
            created_by=self.approver,
        )
        searchable_transaction = Transaction.objects.create(
            ticket=searchable_ticket,
            identifier=searchable_identifier,
            total_amount=Decimal('200.00'),
            created_by=self.approver,
        )
        searchable_overflow = Overflow.objects.create(
            transaction=searchable_transaction,
            identifier=searchable_identifier,
            period=self.archived_period,
            owner=self.approver,
            excess_amount=Decimal('25.00'),
            amount_to_approve=Decimal('25.00'),
            status=Overflow.STATUS_CSO,
            approved_at=timezone.now(),
        )
        searchable_overflow.collaborators.add(self.collaborator)

        response = self.client.get('/api/overflows/approved/', {
            'period_id': self.archived_period.id,
            'collaborator_name': self.collaborator.full_name,
            'page': 1,
            'page_size': 20,
        })

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        returned_ids = {item['id'] for item in response.data['results']}
        self.assertIn(searchable_overflow.id, returned_ids)

    def test_ticket_list_can_filter_by_ticket_customer_and_identifier_fields(self):
        ticket = Ticket.objects.create(
            customer_name='Archive Search Customer',
            created_by=self.approver,
        )
        transaction = Transaction.objects.create(
            ticket=ticket,
            identifier=Identifier.objects.create(number='992'),
            total_amount=Decimal('120.00'),
            created_by=self.approver,
        )
        LedgerAllocation.objects.create(
            ledger=self.archived_ledger,
            transaction=transaction,
            amount=Decimal('100.00'),
        )

        response = self.client.get('/api/tickets/', {
            'period_id': self.archived_period.id,
            'page': 1,
            'page_size': 20,
            'ticket_number': ticket.ticket_number,
            'customer_name': 'Archive Search Customer',
            'identifier_number': '992',
        })

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        returned_ticket_numbers = {item['ticket_number'] for item in response.data['results']}
        self.assertEqual(returned_ticket_numbers, {ticket.ticket_number})

    def test_period_close_auto_approves_pending_overflows_with_current_user_collaborator(self):
        closing_identifier = Identifier.objects.create(number='228')
        closing_ticket = Ticket.objects.create(
            customer_name='Pending Close Customer',
            created_by=self.approver,
        )
        closing_transaction = Transaction.objects.create(
            ticket=closing_ticket,
            identifier=closing_identifier,
            total_amount=Decimal('240.00'),
            created_by=self.approver,
        )
        pending_overflow = Overflow.objects.get(
            transaction=closing_transaction,
            status=Overflow.STATUS_TCSO,
        )

        response = self.client.post(
            f'/api/periods/{self.active_period.id}/close/',
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        pending_overflow.refresh_from_db()
        self.assertEqual(pending_overflow.status, Overflow.STATUS_CSO)
        self.assertEqual(pending_overflow.amount_to_approve, Decimal('100.00'))
        auto_collaborator = Collaborator.objects.get(
            owner=self.approver,
            username=self.approver.username,
        )
        self.assertEqual(auto_collaborator.full_name, 'Approver User')
        self.assertEqual(
            list(pending_overflow.collaborators.values_list('id', flat=True)),
            [auto_collaborator.id],
        )

    def test_ticket_detail_returns_receipt_transactions_for_current_user(self):
        response = self.client.get(f'/api/tickets/{self.active_ticket.ticket_number}/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['ticket_number'], self.active_ticket.ticket_number)
        self.assertEqual(response.data['customer_name'], 'Active Customer')
        self.assertEqual(len(response.data['transactions']), 1)
        self.assertEqual(
            response.data['transactions'][0]['identifier_number'],
            self.identifier.number,
        )
        self.assertEqual(
            response.data['transactions'][0]['ticket_number'],
            self.active_ticket.ticket_number,
        )

    def test_ticket_refund_can_succeed_without_spill_over(self):
        response = self.client.post(
            f'/api/tickets/{self.active_ticket.ticket_number}/refund/',
            {'action': 'refund_ticket', 'admin_override_code': '1234'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.active_ticket.refresh_from_db()
        self.active_transaction.refresh_from_db()
        self.assertTrue(self.active_ticket.is_refunded)
        self.assertTrue(self.active_transaction.is_refunded)

    def test_ticket_refund_requires_admin_override_code_for_admin_user(self):
        response = self.client.post(
            f'/api/tickets/{self.active_ticket.ticket_number}/refund/',
            {'action': 'refund_ticket'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data['detail'], 'Admin override code is required for refund actions.')

    def test_ticket_refund_rejects_incorrect_admin_override_code_for_admin_user(self):
        response = self.client.post(
            f'/api/tickets/{self.active_ticket.ticket_number}/refund/',
            {'action': 'refund_ticket', 'admin_override_code': '0000'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data['detail'], 'Admin override code is incorrect.')

    def test_identifier_detail_keeps_reserve_capacity_when_frozen_for_all_ledgers(self):
        IdentifierLedgerFreeze.objects.create(
            identifier=self.identifier,
            period=self.active_period,
            owner=self.approver,
            applies_to_all=True,
        )
        IdentifierCapacityAdjustment.objects.create(
            identifier=self.identifier,
            period=self.active_period,
            owner=self.approver,
            amount=Decimal('50.00'),
        )

        response = self.client.get(f'/api/identifiers/{self.identifier.id}/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['remaining_capacity'], Decimal('50.00'))
        self.assertTrue(response.data['is_frozen_all_ledgers'])

    def test_identifier_detail_excludes_capacity_from_frozen_ledger_only(self):
        second_ledger = Ledger.objects.create(
            owner=self.approver,
            period=self.active_period,
            name='Second Active Ledger',
            end_date=self.active_period.end_date,
            limit_per_identifier=Decimal('50.00'),
            priority=2,
            is_active=True,
        )
        IdentifierLedgerFreeze.objects.create(
            identifier=self.identifier,
            period=self.active_period,
            owner=self.approver,
            ledger=second_ledger,
            applies_to_all=False,
        )

        response = self.client.get(f'/api/identifiers/{self.identifier.id}/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['remaining_capacity'], Decimal('106.25'))
        self.assertFalse(response.data['is_frozen_all_ledgers'])

    def test_ticket_transaction_refund_can_succeed_without_spill_over(self):
        response = self.client.post(
            f'/api/tickets/{self.active_ticket.ticket_number}/refund/',
            {
                'action': 'refund_transaction',
                'admin_override_code': '1234',
                'transaction_id': self.active_transaction.id,
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.active_transaction.refresh_from_db()
        self.assertTrue(self.active_transaction.is_refunded)
        self.active_ticket.refresh_from_db()
        self.assertEqual(self.active_ticket.total_amount, Decimal('0.00'))
        self.assertTrue(
            UserNotification.objects.filter(
                recipient=self.approver,
                title='Transaction refunded',
            ).exists()
        )
        audit_entry = AuditLog.objects.filter(action='transaction.refunded').latest('timestamp')
        self.assertEqual(audit_entry.changes['identifier_number'], self.identifier.number)
        self.assertEqual(audit_entry.changes['refund_amount'], '75.00')

    def test_ticket_total_amount_updates_after_partial_transaction_refund(self):
        second_transaction = Transaction.objects.create(
            ticket=self.active_ticket,
            identifier=self.second_identifier,
            total_amount=Decimal('25.00'),
            created_by=self.approver,
        )

        response = self.client.post(
            f'/api/tickets/{self.active_ticket.ticket_number}/refund/',
            {
                'action': 'refund_transaction',
                'admin_override_code': '1234',
                'transaction_id': second_transaction.id,
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.active_ticket.total_amount, Decimal('75.00'))

    def test_ticket_total_amount_updates_after_overflow_only_refund(self):
        overflow = Overflow.objects.create(
            transaction=self.active_transaction,
            excess_amount=Decimal('30.00'),
            status=Overflow.STATUS_TCSO,
        )

        response = self.client.post(
            f'/api/overflows/{overflow.id}/resolve/',
            {'action': 'refund_overflow_only', 'admin_override_code': '1234'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.active_ticket.refresh_from_db()
        self.assertEqual(self.active_ticket.total_amount, Decimal('51.00'))
        self.assertTrue(
            UserNotification.objects.filter(
                recipient=self.approver,
                title='Spill over refunded',
            ).exists()
        )

    def test_ticket_refund_with_cso_can_change_back_to_tcso_without_reducing_total(self):
        refund_ticket = Ticket.objects.create(
            customer_name='Ticket CSO Return',
            created_by=self.approver,
        )
        refund_transaction = Transaction.objects.create(
            ticket=refund_ticket,
            identifier=self.second_identifier,
            total_amount=Decimal('400.00'),
            created_by=self.approver,
        )
        overflow = Overflow.objects.get(transaction=refund_transaction, status=Overflow.STATUS_TCSO)
        self.client.post(
            f'/api/overflows/{overflow.id}/approve/',
            {
                'amount_to_approve': '300.00',
                'collaborator_ids': [self.collaborator.id],
            },
            format='json',
        )

        response = self.client.post(
            f'/api/tickets/{refund_ticket.ticket_number}/refund/',
            {
                'action': 'refund_ticket',
                'admin_override_code': '1234',
                'cso_refund_mode': 'return_to_tcso',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        refund_ticket.refresh_from_db()
        refund_transaction.refresh_from_db()
        overflow.refresh_from_db()
        self.assertFalse(refund_ticket.is_refunded)
        self.assertFalse(refund_transaction.is_refunded)
        self.assertEqual(overflow.status, Overflow.STATUS_TCSO)
        self.assertEqual(refund_transaction.total_amount, Decimal('400.00'))
        self.assertEqual(refund_ticket.total_amount, Decimal('400.00'))

        detail_response = self.client.get(f'/api/tickets/{refund_ticket.ticket_number}/')
        self.assertEqual(detail_response.status_code, status.HTTP_200_OK)
        self.assertEqual(Decimal(detail_response.data['total_amount']), Decimal('400.00'))

    def test_return_to_tcso_restores_transaction_total_if_old_bug_already_reduced_it(self):
        refund_ticket = Ticket.objects.create(
            customer_name='Ticket CSO Restore',
            created_by=self.approver,
        )
        refund_transaction = Transaction.objects.create(
            ticket=refund_ticket,
            identifier=self.second_identifier,
            total_amount=Decimal('400.00'),
            created_by=self.approver,
        )
        overflow = Overflow.objects.get(transaction=refund_transaction, status=Overflow.STATUS_TCSO)
        self.client.post(
            f'/api/overflows/{overflow.id}/approve/',
            {
                'amount_to_approve': '300.00',
                'collaborator_ids': [self.collaborator.id],
            },
            format='json',
        )

        refund_transaction.total_amount = Decimal('160.00')
        refund_transaction.save(update_fields=['total_amount'])

        response = self.client.post(
            f'/api/tickets/{refund_ticket.ticket_number}/refund/',
            {
                'action': 'refund_ticket',
                'admin_override_code': '1234',
                'cso_refund_mode': 'return_to_tcso',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        refund_transaction.refresh_from_db()
        refund_ticket.refresh_from_db()
        detail_response = self.client.get(f'/api/tickets/{refund_ticket.ticket_number}/')
        self.assertEqual(detail_response.status_code, status.HTTP_200_OK)
        self.assertEqual(refund_transaction.total_amount, Decimal('400.00'))
        self.assertEqual(Decimal(detail_response.data['total_amount']), Decimal('400.00'))

    def test_ticket_transaction_refund_with_cso_can_refund_spill_over_into_overkill(self):
        refund_ticket = Ticket.objects.create(
            customer_name='Transaction CSO Refund',
            created_by=self.approver,
        )
        refund_transaction = Transaction.objects.create(
            ticket=refund_ticket,
            identifier=self.second_identifier,
            total_amount=Decimal('400.00'),
            created_by=self.approver,
        )
        overflow = Overflow.objects.get(transaction=refund_transaction, status=Overflow.STATUS_TCSO)
        self.client.post(
            f'/api/overflows/{overflow.id}/approve/',
            {
                'amount_to_approve': '300.00',
                'collaborator_ids': [self.collaborator.id],
            },
            format='json',
        )

        response = self.client.post(
            f'/api/tickets/{refund_ticket.ticket_number}/refund/',
            {
                'action': 'refund_transaction',
                'transaction_id': refund_transaction.id,
                'admin_override_code': '1234',
                'cso_refund_mode': 'refund_spill_over',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        refund_ticket.refresh_from_db()
        refund_transaction.refresh_from_db()
        self.assertFalse(refund_ticket.is_refunded)
        self.assertFalse(refund_transaction.is_refunded)
        self.assertEqual(refund_transaction.total_amount, Decimal('160.00'))
        self.assertEqual(refund_ticket.total_amount, Decimal('160.00'))
        overkill = Overflow.objects.get(
            identifier=self.second_identifier,
            owner=self.approver,
            period=self.active_period,
            status=Overflow.STATUS_OVERKILL,
        )
        self.assertEqual(overkill.amount_to_approve, Decimal('300.00'))

    def test_ticket_refunds_are_blocked_after_period_pre_close(self):
        self.active_period.apply_pre_close(triggered_at=timezone.now(), acting_user=self.approver)

        refund_ticket_response = self.client.post(
            f'/api/tickets/{self.active_ticket.ticket_number}/refund/',
            {'action': 'refund_ticket', 'admin_override_code': '1234'},
            format='json',
        )
        refund_transaction_response = self.client.post(
            f'/api/tickets/{self.active_ticket.ticket_number}/refund/',
            {
                'action': 'refund_transaction',
                'admin_override_code': '1234',
                'transaction_id': self.active_transaction.id,
            },
            format='json',
        )

        self.assertEqual(refund_ticket_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(refund_ticket_response.data['detail'], 'Refunds are locked after the pre-close time is reached for this period.')
        self.assertEqual(refund_transaction_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(refund_transaction_response.data['detail'], 'Refunds are locked after the pre-close time is reached for this period.')

    def test_overflow_refunds_are_blocked_after_period_pre_close(self):
        overflow = Overflow.objects.create(
            transaction=self.active_transaction,
            excess_amount=Decimal('30.00'),
            status=Overflow.STATUS_TCSO,
        )
        self.active_period.apply_pre_close(triggered_at=timezone.now(), acting_user=self.approver)

        response = self.client.post(
            f'/api/overflows/{overflow.id}/resolve/',
            {'action': 'refund_overflow_only', 'admin_override_code': '1234'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['detail'], 'Refunds are locked after the pre-close time is reached for this period.')

    def test_ticket_total_amount_converts_refunded_spill_over_from_basis_amount(self):
        high_value_ticket = Ticket.objects.create(
            customer_name='Basis Refund Customer',
            created_by=self.approver,
        )
        high_value_transaction = Transaction.objects.create(
            ticket=high_value_ticket,
            identifier=self.second_identifier,
            total_amount=Decimal('1000.00'),
            created_by=self.approver,
        )
        overflow = Overflow.objects.create(
            transaction=high_value_transaction,
            excess_amount=Decimal('1100.00'),
            status=Overflow.STATUS_TCSO,
        )

        response = self.client.post(
            f'/api/overflows/{overflow.id}/resolve/',
            {'action': 'refund_overflow_only', 'admin_override_code': '1234'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        high_value_ticket.refresh_from_db()
        self.assertEqual(high_value_ticket.total_amount, Decimal('120.00'))

    def test_fully_refunded_ticket_still_appears_in_active_period_history(self):
        response = self.client.post(
            f'/api/tickets/{self.active_ticket.ticket_number}/refund/',
            {'action': 'refund_ticket', 'admin_override_code': '1234'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        list_response = self.client.get('/api/tickets/', {'period_id': self.active_period.id})
        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        ticket_numbers = [ticket['ticket_number'] for ticket in list_response.data]
        self.assertIn(self.active_ticket.ticket_number, ticket_numbers)

    def test_ticket_receipt_pdf_export_returns_pdf_for_current_user(self):
        response = self.client.post(
            '/api/tickets/receipt-pdf/',
            {'ticket_numbers': [self.active_ticket.ticket_number]},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response['Content-Type'], 'application/pdf')

    def test_ticket_refund_audit_includes_ticket_summary(self):
        response = self.client.post(
            f'/api/tickets/{self.active_ticket.ticket_number}/refund/',
            {'action': 'refund_ticket', 'admin_override_code': '1234'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        audit_entry = AuditLog.objects.filter(action='ticket.refunded').latest('timestamp')
        self.assertEqual(audit_entry.changes['ticket_number'], self.active_ticket.ticket_number)
        self.assertEqual(audit_entry.changes['entry_count'], 1)
        self.assertEqual(audit_entry.changes['entries'][0]['identifier_number'], self.identifier.number)

    def test_audit_logs_can_filter_by_related_ticket_number(self):
        AuditLog.objects.create(
            user=self.approver,
            action='ticket.created',
            target_model='ticket',
            target_id=self.active_ticket.id,
            details='Created ticket',
        )
        AuditLog.objects.create(
            user=self.approver,
            action='transaction.refunded',
            target_model='transaction',
            target_id=self.active_transaction.id,
            details='Refunded transaction',
        )
        unrelated_transaction = Transaction.objects.create(
            identifier=self.second_identifier,
            total_amount=Decimal('25.00'),
            created_by=self.approver,
            ticket=Ticket.objects.create(customer_name='Elsewhere', created_by=self.approver),
        )
        AuditLog.objects.create(
            user=self.approver,
            action='transaction.refunded',
            target_model='transaction',
            target_id=unrelated_transaction.id,
            details='Unrelated transaction',
        )

        response = self.client.get('/api/audit-logs/', {
            'related_ticket_number': self.active_ticket.ticket_number,
        })

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        actions = {entry['action'] for entry in response.data}
        details = {entry['details'] for entry in response.data}
        self.assertIn('ticket.created', actions)
        self.assertIn('transaction.refunded', actions)
        self.assertIn('Created ticket', details)
        self.assertIn('Refunded transaction', details)
        self.assertNotIn('Unrelated transaction', details)

    def test_period_summary_returns_private_totals(self):
        response = self.client.get(f'/api/periods/{self.active_period.id}/summary/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['ledger_count'], 1)
        self.assertEqual(response.data['ticket_count'], 1)
        self.assertEqual(response.data['transaction_count'], 1)
        self.assertEqual(response.data['total_transaction_amount'], '75')

    def test_reserve_ledger_is_unique_per_owner_and_period(self):
        self.client.get('/api/ledgers/', {'period_id': self.active_period.id})
        Ledger.get_capacity_reserve(self.active_period, self.approver, create=True)
        Ledger.get_capacity_reserve(self.active_period, self.other_user, create=True)

        approver_reserves = Ledger.objects.filter(
            period=self.active_period,
            owner=self.approver,
            is_capacity_reserve=True,
        )
        other_reserves = Ledger.objects.filter(
            period=self.active_period,
            owner=self.other_user,
            is_capacity_reserve=True,
        )
        self.assertEqual(approver_reserves.count(), 1)
        self.assertEqual(other_reserves.count(), 1)

    def test_same_priority_is_rejected_only_within_same_owner(self):
        duplicate_response = self.client.post('/api/ledgers/', {
            'period': self.active_period.id,
            'name': 'Duplicate Priority Ledger',
            'limit_per_identifier': '100.00',
            'priority': 1,
        }, format='json')

        self.assertEqual(duplicate_response.status_code, status.HTTP_400_BAD_REQUEST)

        self.client.force_authenticate(user=self.other_user)
        allowed_response = self.client.post('/api/ledgers/', {
            'period': self.active_period.id,
            'name': 'Other User Priority One',
            'limit_per_identifier': '100.00',
            'priority': 1,
        }, format='json')

        self.assertEqual(allowed_response.status_code, status.HTTP_201_CREATED)

    def test_overflow_approval_and_exports_are_private_to_owner(self):
        tx = Transaction.objects.create(
            ticket=Ticket.objects.create(customer_name='Overflow Ticket', created_by=self.approver),
            identifier=self.second_identifier,
            total_amount=Decimal('250.00'),
            created_by=self.approver,
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
        export_response = self.client.get(
            f'/api/collaborators/{self.collaborator.id}/export-transactions/',
            {'period_id': self.active_period.id}
        )
        self.assertEqual(export_response.status_code, status.HTTP_200_OK)
        export_content = export_response.content.decode('utf-8')
        self.assertIn('102,.,112.50', export_content)
        self.assertIn('102,.,67.50', export_content)

        self.client.force_authenticate(user=self.other_user)
        hidden_response = self.client.get('/api/overflows/')
        self.assertEqual(hidden_response.status_code, status.HTTP_200_OK)
        self.assertEqual(hidden_response.data, [])

    def test_extra_overflow_approval_creates_separate_overkill_record(self):
        tx = Transaction.objects.create(
            ticket=Ticket.objects.create(customer_name='Overkill Ticket', created_by=self.approver),
            identifier=self.second_identifier,
            total_amount=Decimal('400.00'),
            created_by=self.approver,
        )
        overflow = Overflow.objects.get(transaction=tx, status=Overflow.STATUS_TCSO)

        response = self.client.post(
            f'/api/overflows/{overflow.id}/approve/',
            {
                'amount_to_approve': '500.00',
                'collaborator_ids': [self.collaborator.id],
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        overflow.refresh_from_db()
        self.assertEqual(overflow.status, Overflow.STATUS_CSO)
        self.assertEqual(overflow.amount_to_approve, Decimal('300.00'))
        self.assertEqual(overflow.excess_amount, Decimal('300.00'))

        overkill = Overflow.objects.get(
            identifier=self.second_identifier,
            owner=self.approver,
            period=self.active_period,
            status=Overflow.STATUS_OVERKILL,
        )
        self.assertIsNone(overkill.transaction)
        self.assertEqual(overkill.excess_amount, Decimal('200.00'))
        self.assertEqual(overkill.amount_to_approve, Decimal('200.00'))
        self.assertEqual(list(overkill.collaborators.values_list('id', flat=True)), [self.collaborator.id])

        adjustment = IdentifierCapacityAdjustment.objects.get(
            overflow=overkill,
            adjustment_type=IdentifierCapacityAdjustment.TYPE_APPROVAL_EXTRA,
        )
        self.assertEqual(adjustment.amount, Decimal('200.00'))

    def test_direct_overkill_creation_creates_detached_reserve_capacity(self):
        response = self.client.post(
            '/api/overflows/overkill/',
            {
                'identifier': self.second_identifier.id,
                'amount': '125.00',
                'collaborator_ids': [self.collaborator.id],
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        overkill = Overflow.objects.get(
            identifier=self.second_identifier,
            owner=self.approver,
            period=self.active_period,
            status=Overflow.STATUS_OVERKILL,
        )
        self.assertIsNone(overkill.transaction)
        self.assertEqual(overkill.excess_amount, Decimal('125.00'))
        self.assertEqual(overkill.amount_to_approve, Decimal('125.00'))
        self.assertEqual(list(overkill.collaborators.values_list('id', flat=True)), [self.collaborator.id])

        adjustment = IdentifierCapacityAdjustment.objects.get(
            overflow=overkill,
            adjustment_type=IdentifierCapacityAdjustment.TYPE_APPROVAL_EXTRA,
        )
        self.assertEqual(adjustment.amount, Decimal('125.00'))

    @patch('core.views.push_dashboard_refresh_for_user')
    def test_direct_overkill_creation_triggers_dashboard_refresh_push(self, mocked_push):
        response = self.client.post(
            '/api/overflows/overkill/',
            {
                'identifier': self.second_identifier.id,
                'amount': '125.00',
                'collaborator_ids': [self.collaborator.id],
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        mocked_push.assert_called_once_with(self.approver.id)

    @patch('core.views.push_dashboard_refresh_for_user')
    def test_ticket_creation_triggers_dashboard_refresh_push(self, mocked_push):
        response = self.client.post(
            '/api/tickets/create-with-items/',
            {
                'customer_name': 'Realtime Customer',
                'items': [
                    {'identifier': self.second_identifier.id, 'amount': '50.00'},
                ],
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        mocked_push.assert_called_once_with(self.approver.id)

    def test_direct_overkill_creation_is_blocked_after_period_pre_close(self):
        self.active_period.apply_pre_close(triggered_at=timezone.now(), acting_user=self.approver)

        response = self.client.post(
            '/api/overflows/overkill/',
            {
                'identifier': self.second_identifier.id,
                'amount': '125.00',
                'collaborator_ids': [self.collaborator.id],
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['detail'], 'Ticket creation is locked after the pre-close time is reached.')

    def test_returning_cso_overflow_moves_it_back_to_tcso_without_reducing_total(self):
        tx = Transaction.objects.create(
            ticket=Ticket.objects.create(customer_name='Return CSO Ticket', created_by=self.approver),
            identifier=self.second_identifier,
            total_amount=Decimal('400.00'),
            created_by=self.approver,
        )
        overflow = Overflow.objects.get(transaction=tx, status=Overflow.STATUS_TCSO)

        approve_response = self.client.post(
            f'/api/overflows/{overflow.id}/approve/',
            {
                'amount_to_approve': '300.00',
                'collaborator_ids': [self.collaborator.id],
            },
            format='json',
        )
        self.assertEqual(approve_response.status_code, status.HTTP_200_OK)

        return_response = self.client.post(
            f'/api/overflows/{overflow.id}/resolve/',
            {
                'action': 'refund_overflow_only',
                'admin_override_code': '1234',
                'cso_refund_mode': 'return_to_tcso',
            },
            format='json',
        )

        self.assertEqual(return_response.status_code, status.HTTP_200_OK)
        overflow.refresh_from_db()
        tx.refresh_from_db()
        tx.ticket.refresh_from_db()
        self.assertEqual(overflow.status, Overflow.STATUS_TCSO)
        self.assertIsNone(overflow.approved_at)
        self.assertIsNone(overflow.amount_to_approve)
        self.assertIsNone(overflow.refunded_at)
        self.assertIsNone(overflow.refund_amount)
        self.assertEqual(tx.total_amount, Decimal('400.00'))
        self.assertEqual(tx.ticket.total_amount, Decimal('400.00'))
        self.assertFalse(
            IdentifierCapacityAdjustment.objects.filter(
                overflow=overflow,
                adjustment_type=IdentifierCapacityAdjustment.TYPE_REFUND_CSO,
            ).exists()
        )

    def test_refunding_cso_spill_over_moves_it_to_overkill_and_reduces_total(self):
        tx = Transaction.objects.create(
            ticket=Ticket.objects.create(customer_name='Refund CSO Ticket', created_by=self.approver),
            identifier=self.second_identifier,
            total_amount=Decimal('400.00'),
            created_by=self.approver,
        )
        overflow = Overflow.objects.get(transaction=tx, status=Overflow.STATUS_TCSO)

        self.client.post(
            f'/api/overflows/{overflow.id}/approve/',
            {
                'amount_to_approve': '300.00',
                'collaborator_ids': [self.collaborator.id],
            },
            format='json',
        )

        refund_response = self.client.post(
            f'/api/overflows/{overflow.id}/resolve/',
            {
                'action': 'refund_overflow_only',
                'admin_override_code': '1234',
                'cso_refund_mode': 'refund_spill_over',
            },
            format='json',
        )

        self.assertEqual(refund_response.status_code, status.HTTP_200_OK)
        tx.refresh_from_db()
        tx.ticket.refresh_from_db()
        self.assertEqual(tx.total_amount, Decimal('160.00'))
        self.assertEqual(tx.ticket.total_amount, Decimal('160.00'))
        overkill = Overflow.objects.get(
            identifier=self.second_identifier,
            owner=self.approver,
            period=self.active_period,
            status=Overflow.STATUS_OVERKILL,
        )
        self.assertEqual(overkill.amount_to_approve, Decimal('300.00'))
        self.assertEqual(list(overkill.collaborators.values_list('id', flat=True)), [self.collaborator.id])

    def test_reapproving_returned_cso_restores_active_total(self):
        tx = Transaction.objects.create(
            ticket=Ticket.objects.create(customer_name='Reapprove CSO Ticket', created_by=self.approver),
            identifier=self.second_identifier,
            total_amount=Decimal('400.00'),
            created_by=self.approver,
        )
        overflow = Overflow.objects.get(transaction=tx, status=Overflow.STATUS_TCSO)

        self.client.post(
            f'/api/overflows/{overflow.id}/approve/',
            {
                'amount_to_approve': '300.00',
                'collaborator_ids': [self.collaborator.id],
            },
            format='json',
        )
        self.client.post(
            f'/api/overflows/{overflow.id}/resolve/',
            {
                'action': 'refund_overflow_only',
                'admin_override_code': '1234',
                'cso_refund_mode': 'return_to_tcso',
            },
            format='json',
        )

        reapprove_response = self.client.post(
            f'/api/overflows/{overflow.id}/approve/',
            {
                'amount_to_approve': '300.00',
                'collaborator_ids': [self.collaborator.id],
            },
            format='json',
        )

        self.assertEqual(reapprove_response.status_code, status.HTTP_200_OK)
        overflow.refresh_from_db()
        tx.refresh_from_db()
        tx.ticket.refresh_from_db()
        self.assertEqual(overflow.status, Overflow.STATUS_CSO)
        self.assertIsNone(overflow.refunded_at)
        self.assertIsNone(overflow.refund_amount)
        self.assertEqual(tx.total_amount, Decimal('400.00'))
        self.assertEqual(tx.ticket.total_amount, Decimal('400.00'))

    def test_refund_transaction_on_cso_can_change_back_to_tcso(self):
        tx = Transaction.objects.create(
            ticket=Ticket.objects.create(customer_name='Refund Tx CSO Ticket', created_by=self.approver),
            identifier=self.second_identifier,
            total_amount=Decimal('400.00'),
            created_by=self.approver,
        )
        overflow = Overflow.objects.get(transaction=tx, status=Overflow.STATUS_TCSO)
        self.client.post(
            f'/api/overflows/{overflow.id}/approve/',
            {
                'amount_to_approve': '300.00',
                'collaborator_ids': [self.collaborator.id],
            },
            format='json',
        )

        response = self.client.post(
            f'/api/overflows/{overflow.id}/resolve/',
            {
                'action': 'refund_transaction',
                'admin_override_code': '1234',
                'cso_refund_mode': 'return_to_tcso',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        overflow.refresh_from_db()
        tx.refresh_from_db()
        self.assertFalse(tx.is_refunded)
        self.assertEqual(overflow.status, Overflow.STATUS_TCSO)
        self.assertEqual(tx.total_amount, Decimal('400.00'))

    def test_refund_ticket_on_cso_can_refund_spill_over_into_overkill(self):
        tx = Transaction.objects.create(
            ticket=Ticket.objects.create(customer_name='Refund Ticket CSO Ticket', created_by=self.approver),
            identifier=self.second_identifier,
            total_amount=Decimal('400.00'),
            created_by=self.approver,
        )
        overflow = Overflow.objects.get(transaction=tx, status=Overflow.STATUS_TCSO)
        self.client.post(
            f'/api/overflows/{overflow.id}/approve/',
            {
                'amount_to_approve': '300.00',
                'collaborator_ids': [self.collaborator.id],
            },
            format='json',
        )

        response = self.client.post(
            f'/api/overflows/{overflow.id}/resolve/',
            {
                'action': 'refund_ticket',
                'admin_override_code': '1234',
                'cso_refund_mode': 'refund_spill_over',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        tx.refresh_from_db()
        tx.ticket.refresh_from_db()
        self.assertFalse(tx.is_refunded)
        self.assertEqual(tx.total_amount, Decimal('160.00'))
        self.assertEqual(tx.ticket.total_amount, Decimal('160.00'))

    def test_returning_overkill_removes_it_and_clears_reserve_capacity(self):
        tx = Transaction.objects.create(
            ticket=Ticket.objects.create(customer_name='Return Overkill Ticket', created_by=self.approver),
            identifier=self.second_identifier,
            total_amount=Decimal('400.00'),
            created_by=self.approver,
        )
        overflow = Overflow.objects.get(transaction=tx, status=Overflow.STATUS_TCSO)

        approve_response = self.client.post(
            f'/api/overflows/{overflow.id}/approve/',
            {
                'amount_to_approve': '500.00',
                'collaborator_ids': [self.collaborator.id],
            },
            format='json',
        )
        self.assertEqual(approve_response.status_code, status.HTTP_200_OK)

        overkill = Overflow.objects.get(
            identifier=self.second_identifier,
            owner=self.approver,
            period=self.active_period,
            status=Overflow.STATUS_OVERKILL,
        )
        self.assertEqual(
            IdentifierCapacityAdjustment.get_available_capacity(
                self.second_identifier,
                self.active_period,
                self.approver,
            ),
            Decimal('200.00'),
        )

        return_response = self.client.post(
            f'/api/overflows/{overkill.id}/resolve/',
            {'action': 'refund_overflow_only', 'admin_override_code': '1234'},
            format='json',
        )

        self.assertEqual(return_response.status_code, status.HTTP_200_OK)
        self.assertFalse(Overflow.objects.filter(id=overkill.id).exists())
        self.assertEqual(
            IdentifierCapacityAdjustment.get_available_capacity(
                self.second_identifier,
                self.active_period,
                self.approver,
            ),
            Decimal('0.00'),
        )

    def test_returning_reserve_consumed_cso_merges_back_into_overkill(self):
        third_identifier = Identifier.objects.create(number='398')
        seed_ticket = Ticket.objects.create(customer_name='Reserve Return Seed', created_by=self.approver)
        seed_transaction = Transaction.objects.create(
            ticket=seed_ticket,
            identifier=third_identifier,
            total_amount=Decimal('400.00'),
            created_by=self.approver,
        )
        seed_overflow = Overflow.objects.get(transaction=seed_transaction, status=Overflow.STATUS_TCSO)
        self.client.post(
            f'/api/overflows/{seed_overflow.id}/approve/',
            {
                'amount_to_approve': '500.00',
                'collaborator_ids': [self.collaborator.id],
            },
            format='json',
        )

        IdentifierLedgerFreeze.objects.create(
            identifier=third_identifier,
            period=self.active_period,
            owner=self.approver,
            applies_to_all=True,
        )

        consume_ticket = Ticket.objects.create(customer_name='Reserve Return Consume', created_by=self.approver)
        Transaction.objects.create(
            ticket=consume_ticket,
            identifier=third_identifier,
            total_amount=Decimal('80.00'),
            created_by=self.approver,
        )

        consumed_cso = Overflow.objects.get(
            transaction__ticket=consume_ticket,
            status=Overflow.STATUS_CSO,
            resolution_type=Overflow.RESOLUTION_RESERVE_CONSUMED,
        )

        return_response = self.client.post(
            f'/api/overflows/{consumed_cso.id}/resolve/',
            {'action': 'refund_overflow_only', 'admin_override_code': '1234'},
            format='json',
        )

        self.assertEqual(return_response.status_code, status.HTTP_200_OK)
        self.assertFalse(Overflow.objects.filter(id=consumed_cso.id).exists())
        overkill_rows = list(
            Overflow.objects.filter(
                identifier=third_identifier,
                owner=self.approver,
                period=self.active_period,
                status=Overflow.STATUS_OVERKILL,
            ).order_by('id')
        )
        self.assertEqual(len(overkill_rows), 1)
        self.assertEqual(overkill_rows[0].amount_to_approve, Decimal('200.00'))
        self.assertEqual(overkill_rows[0].excess_amount, Decimal('200.00'))
        self.assertEqual(
            IdentifierCapacityAdjustment.get_available_capacity(
                third_identifier,
                self.active_period,
                self.approver,
            ),
            Decimal('200.00'),
        )

    def test_refunding_ticket_with_reserve_consumed_cso_restores_overkill_balance(self):
        third_identifier = Identifier.objects.create(number='397')
        seed_ticket = Ticket.objects.create(customer_name='Reserve Refund Seed', created_by=self.approver)
        seed_transaction = Transaction.objects.create(
            ticket=seed_ticket,
            identifier=third_identifier,
            total_amount=Decimal('400.00'),
            created_by=self.approver,
        )
        seed_overflow = Overflow.objects.get(transaction=seed_transaction, status=Overflow.STATUS_TCSO)
        self.client.post(
            f'/api/overflows/{seed_overflow.id}/approve/',
            {
                'amount_to_approve': '500.00',
                'collaborator_ids': [self.collaborator.id],
            },
            format='json',
        )

        IdentifierLedgerFreeze.objects.create(
            identifier=third_identifier,
            period=self.active_period,
            owner=self.approver,
            applies_to_all=True,
        )

        consume_ticket = Ticket.objects.create(customer_name='Reserve Refund Ticket', created_by=self.approver)
        consume_transaction = Transaction.objects.create(
            ticket=consume_ticket,
            identifier=third_identifier,
            total_amount=Decimal('40.00'),
            created_by=self.approver,
        )

        consumed_cso = Overflow.objects.get(
            transaction=consume_transaction,
            identifier=third_identifier,
            status=Overflow.STATUS_CSO,
            resolution_type=Overflow.RESOLUTION_RESERVE_CONSUMED,
        )
        self.assertEqual(consumed_cso.amount_to_approve, Decimal('50.00'))

        refund_response = self.client.post(
            f'/api/tickets/{consume_ticket.ticket_number}/refund/',
            {'action': 'refund_ticket', 'admin_override_code': '1234'},
            format='json',
        )

        self.assertEqual(refund_response.status_code, status.HTTP_200_OK)
        self.assertFalse(Overflow.objects.filter(id=consumed_cso.id).exists())
        overkill = Overflow.objects.get(
            identifier=third_identifier,
            owner=self.approver,
            period=self.active_period,
            status=Overflow.STATUS_OVERKILL,
        )
        self.assertEqual(overkill.amount_to_approve, Decimal('200.00'))
        self.assertEqual(overkill.excess_amount, Decimal('200.00'))
        self.assertIsNone(overkill.transaction)
        self.assertEqual(
            IdentifierCapacityAdjustment.get_available_capacity(
                third_identifier,
                self.active_period,
                self.approver,
            ),
            Decimal('200.00'),
        )

    def test_period_close_does_not_create_reserve_archive_ticket_for_leftover_capacity(self):
        reserve_ledger = Ledger.get_capacity_reserve(self.active_period, self.approver, create=True)
        IdentifierCapacityAdjustment.objects.create(
            identifier=self.identifier,
            period=self.active_period,
            owner=self.approver,
            amount=Decimal('200.00'),
        )

        self.active_period.close()

        self.assertFalse(
            Ticket.objects.filter(
                created_by=self.approver,
                notes=f"Reserve archive for {self.active_period.name}",
            ).exists()
        )
        self.assertFalse(
            LedgerAllocation.objects.filter(
                ledger=reserve_ledger,
                amount=Decimal('200.00'),
            ).exists()
        )

    def test_period_pre_close_does_not_auto_approve_pending_overflow(self):
        seed_ticket = Ticket.objects.create(customer_name='Pending Draw Notice', created_by=self.approver)
        seed_transaction = Transaction.objects.create(
            ticket=seed_ticket,
            identifier=self.identifier,
            total_amount=Decimal('250.00'),
            created_by=self.approver,
        )
        pending_overflow = Overflow.objects.get(transaction=seed_transaction, status=Overflow.STATUS_TCSO)
        self.active_period.apply_pre_close(triggered_at=timezone.now(), acting_user=self.approver)
        pending_overflow.refresh_from_db()
        self.assertEqual(pending_overflow.status, Overflow.STATUS_TCSO)
        self.assertFalse(
            UserNotification.objects.filter(
                recipient=self.approver,
                source_key=f'lucky-draw:pending-overflow:{self.active_period.id}:{pending_overflow.id}',
            ).exists()
        )

    def test_period_pre_close_does_not_notify_remaining_overkill(self):
        overkill = Overflow.objects.create(
            transaction=None,
            identifier=self.identifier,
            owner=self.approver,
            period=self.active_period,
            excess_amount=Decimal('200.00'),
            status=Overflow.STATUS_OVERKILL,
            amount_to_approve=Decimal('200.00'),
            approved_at=timezone.now(),
            helper_name='Helper User',
            resolution_type=Overflow.RESOLUTION_APPROVE,
        )

        self.active_period.apply_pre_close(triggered_at=timezone.now(), acting_user=self.approver)
        self.assertFalse(
            UserNotification.objects.filter(
                recipient=self.approver,
                source_key=f'lucky-draw:overkill-remaining:{self.active_period.id}:{overkill.id}',
            ).exists()
        )
        self.assertTrue(Overflow.objects.filter(id=overkill.id, status=Overflow.STATUS_OVERKILL).exists())

    def test_lucky_draw_announcement_keeps_overkill_rows_unarchived(self):
        third_identifier = Identifier.objects.create(number='398')
        seed_ticket = Ticket.objects.create(customer_name='Archive Overkill Seed', created_by=self.approver)
        seed_transaction = Transaction.objects.create(
            ticket=seed_ticket,
            identifier=third_identifier,
            total_amount=Decimal('400.00'),
            created_by=self.approver,
        )
        seed_overflow = Overflow.objects.get(transaction=seed_transaction, status=Overflow.STATUS_TCSO)
        approve_response = self.client.post(
            f'/api/overflows/{seed_overflow.id}/approve/',
            {
                'amount_to_approve': '500.00',
                'collaborator_ids': [self.collaborator.id],
            },
            format='json',
        )
        self.assertEqual(approve_response.status_code, status.HTTP_200_OK)
        self.assertTrue(
            Overflow.objects.filter(
                identifier=third_identifier,
                owner=self.approver,
                period=self.active_period,
                status=Overflow.STATUS_OVERKILL,
            ).exists()
        )

        announce_response = self.client.post(
            f'/api/periods/{self.active_period.id}/lucky-draw/',
            {'number': '123456'},
            format='json',
        )

        self.assertEqual(announce_response.status_code, status.HTTP_201_CREATED)
        remaining_overkill = Overflow.objects.get(
            identifier=third_identifier,
            owner=self.approver,
            period=self.active_period,
            status=Overflow.STATUS_OVERKILL,
        )
        self.assertEqual(remaining_overkill.amount_to_approve, Decimal('200.00'))
        self.assertFalse(
            Ticket.objects.filter(
                created_by=self.approver,
                notes=f"Reserve archive for {self.active_period.name}",
            ).exists()
        )

    def test_lucky_draw_announcement_notifies_pending_overflow_auto_approval(self):
        seed_ticket = Ticket.objects.create(customer_name='Pending Draw Notice', created_by=self.approver)
        seed_transaction = Transaction.objects.create(
            ticket=seed_ticket,
            identifier=self.identifier,
            total_amount=Decimal('250.00'),
            created_by=self.approver,
        )
        pending_overflow = Overflow.objects.get(transaction=seed_transaction, status=Overflow.STATUS_TCSO)

        response = self.client.post(
            f'/api/periods/{self.active_period.id}/lucky-draw/',
            {'number': '123456'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        pending_overflow.refresh_from_db()
        self.assertEqual(pending_overflow.status, Overflow.STATUS_CSO)
        notification = UserNotification.objects.get(
            recipient=self.approver,
            source_key=f'lucky-draw:pending-overflow:{self.active_period.id}:{pending_overflow.id}',
        )
        self.assertEqual(notification.title, 'Pending spill over auto-approved')
        self.assertIn(
            f'Identifier {self.identifier.number} spill over of 206.25 was auto-approved',
            notification.message,
        )
        self.assertEqual(notification.action_href, '/spill-over')

    def test_lucky_draw_announcement_notifies_remaining_overkill(self):
        overkill = Overflow.objects.create(
            transaction=None,
            identifier=self.identifier,
            owner=self.approver,
            period=self.active_period,
            excess_amount=Decimal('200.00'),
            status=Overflow.STATUS_OVERKILL,
            amount_to_approve=Decimal('200.00'),
            approved_at=timezone.now(),
            helper_name='Helper User',
            resolution_type=Overflow.RESOLUTION_APPROVE,
        )

        response = self.client.post(
            f'/api/periods/{self.active_period.id}/lucky-draw/',
            {'number': '123456'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        notification = UserNotification.objects.get(
            recipient=self.approver,
            source_key=f'lucky-draw:overkill-remaining:{self.active_period.id}:{overkill.id}',
        )
        self.assertEqual(notification.title, 'Overkill still remaining')
        self.assertIn(
            f'Identifier {self.identifier.number} still has overkill amount of 200.00',
            notification.message,
        )
        self.assertEqual(notification.action_href, '/spill-over')
        self.assertTrue(Overflow.objects.filter(id=overkill.id, status=Overflow.STATUS_OVERKILL).exists())

    def test_reserve_consumption_turns_overkill_into_cso(self):
        third_identifier = Identifier.objects.create(number='398')
        seed_ticket = Ticket.objects.create(customer_name='Reserve Seed', created_by=self.approver)
        seed_transaction = Transaction.objects.create(
            ticket=seed_ticket,
            identifier=third_identifier,
            total_amount=Decimal('400.00'),
            created_by=self.approver,
        )
        seed_overflow = Overflow.objects.get(transaction=seed_transaction, status=Overflow.STATUS_TCSO)
        self.client.post(
            f'/api/overflows/{seed_overflow.id}/approve/',
            {
                'amount_to_approve': '500.00',
                'collaborator_ids': [self.collaborator.id],
            },
            format='json',
        )

        overkill = Overflow.objects.get(
            identifier=third_identifier,
            owner=self.approver,
            period=self.active_period,
            status=Overflow.STATUS_OVERKILL,
        )
        IdentifierLedgerFreeze.objects.create(
            identifier=third_identifier,
            period=self.active_period,
            owner=self.approver,
            applies_to_all=True,
        )

        consume_ticket = Ticket.objects.create(customer_name='Reserve Consume', created_by=self.approver)
        Transaction.objects.create(
            ticket=consume_ticket,
            identifier=third_identifier,
            total_amount=Decimal('160.00'),
            created_by=self.approver,
        )

        self.assertFalse(Overflow.objects.filter(id=overkill.id).exists())
        consumed_cso = Overflow.objects.get(
            transaction__ticket=consume_ticket,
            identifier=third_identifier,
            status=Overflow.STATUS_CSO,
            resolution_type=Overflow.RESOLUTION_RESERVE_CONSUMED,
        )
        self.assertEqual(consumed_cso.amount_to_approve, Decimal('200.00'))

    def test_partial_reserve_consumption_splits_overkill_balance(self):
        third_identifier = Identifier.objects.create(number='399')
        seed_ticket = Ticket.objects.create(customer_name='Reserve Split Seed', created_by=self.approver)
        seed_transaction = Transaction.objects.create(
            ticket=seed_ticket,
            identifier=third_identifier,
            total_amount=Decimal('400.00'),
            created_by=self.approver,
        )
        seed_overflow = Overflow.objects.get(transaction=seed_transaction, status=Overflow.STATUS_TCSO)
        self.client.post(
            f'/api/overflows/{seed_overflow.id}/approve/',
            {
                'amount_to_approve': '500.00',
                'collaborator_ids': [self.collaborator.id],
            },
            format='json',
        )

        IdentifierLedgerFreeze.objects.create(
            identifier=third_identifier,
            period=self.active_period,
            owner=self.approver,
            applies_to_all=True,
        )

        consume_ticket = Ticket.objects.create(customer_name='Reserve Partial Consume', created_by=self.approver)
        Transaction.objects.create(
            ticket=consume_ticket,
            identifier=third_identifier,
            total_amount=Decimal('80.00'),
            created_by=self.approver,
        )

        overkill_rows = list(
            Overflow.objects.filter(
                Q(transaction=seed_transaction) |
                Q(transaction__ticket=consume_ticket) |
                Q(identifier=third_identifier, owner=self.approver, period=self.active_period, transaction__isnull=True)
            ).exclude(status=Overflow.STATUS_REFUNDED).order_by('status', 'id')
        )
        self.assertEqual(
            sorted((row.status, row.amount_to_approve or row.excess_amount) for row in overkill_rows),
            [
                (Overflow.STATUS_CSO, Decimal('100.00')),
                (Overflow.STATUS_CSO, Decimal('300.00')),
                (Overflow.STATUS_OVERKILL, Decimal('100.00')),
            ],
        )

    def test_extra_approval_immediately_partially_covers_next_pending_overflow(self):
        identifier = Identifier.objects.create(number='173')
        IdentifierLedgerFreeze.objects.create(
            identifier=identifier,
            period=self.active_period,
            owner=self.approver,
            applies_to_all=True,
        )

        first_ticket = Ticket.objects.create(customer_name='First Pending', created_by=self.approver)
        first_transaction = Transaction.objects.create(
            ticket=first_ticket,
            identifier=identifier,
            total_amount=Decimal('1.00'),
            created_by=self.approver,
        )
        first_overflow = Overflow.objects.get(transaction=first_transaction, status=Overflow.STATUS_TCSO)
        first_overflow.excess_amount = Decimal('500.00')
        first_overflow.save(update_fields=['excess_amount'])

        second_ticket = Ticket.objects.create(customer_name='Second Pending', created_by=self.approver)
        second_transaction = Transaction.objects.create(
            ticket=second_ticket,
            identifier=identifier,
            total_amount=Decimal('1.00'),
            created_by=self.approver,
        )
        second_overflow = Overflow.objects.get(transaction=second_transaction, status=Overflow.STATUS_TCSO)
        second_overflow.excess_amount = Decimal('300.00')
        second_overflow.save(update_fields=['excess_amount'])

        response = self.client.post(
            f'/api/overflows/{first_overflow.id}/approve/',
            {
                'amount_to_approve': '700.00',
                'collaborator_ids': [self.collaborator.id],
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        first_overflow.refresh_from_db()
        self.assertEqual(first_overflow.status, Overflow.STATUS_CSO)
        self.assertEqual(first_overflow.amount_to_approve, Decimal('500.00'))

        second_overflow.refresh_from_db()
        self.assertEqual(second_overflow.status, Overflow.STATUS_TCSO)
        self.assertEqual(second_overflow.excess_amount, Decimal('100.00'))

        self.assertFalse(
            Overflow.objects.filter(
                identifier=identifier,
                owner=self.approver,
                period=self.active_period,
                status=Overflow.STATUS_OVERKILL,
            ).exists()
        )

        reserve_consumed = Overflow.objects.get(
            transaction=second_transaction,
            identifier=identifier,
            status=Overflow.STATUS_CSO,
            resolution_type=Overflow.RESOLUTION_RESERVE_CONSUMED,
        )
        self.assertEqual(reserve_consumed.amount_to_approve, Decimal('200.00'))
        self.assertEqual(list(reserve_consumed.collaborators.values_list('id', flat=True)), [self.collaborator.id])

    def test_extra_approval_can_fully_cover_next_pending_overflow(self):
        identifier = Identifier.objects.create(number='174')
        IdentifierLedgerFreeze.objects.create(
            identifier=identifier,
            period=self.active_period,
            owner=self.approver,
            applies_to_all=True,
        )

        first_ticket = Ticket.objects.create(customer_name='First Pending Full', created_by=self.approver)
        first_transaction = Transaction.objects.create(
            ticket=first_ticket,
            identifier=identifier,
            total_amount=Decimal('1.00'),
            created_by=self.approver,
        )
        first_overflow = Overflow.objects.get(transaction=first_transaction, status=Overflow.STATUS_TCSO)
        first_overflow.excess_amount = Decimal('500.00')
        first_overflow.save(update_fields=['excess_amount'])

        second_ticket = Ticket.objects.create(customer_name='Second Pending Full', created_by=self.approver)
        second_transaction = Transaction.objects.create(
            ticket=second_ticket,
            identifier=identifier,
            total_amount=Decimal('1.00'),
            created_by=self.approver,
        )
        second_overflow = Overflow.objects.get(transaction=second_transaction, status=Overflow.STATUS_TCSO)
        second_overflow.excess_amount = Decimal('300.00')
        second_overflow.save(update_fields=['excess_amount'])

        response = self.client.post(
            f'/api/overflows/{first_overflow.id}/approve/',
            {
                'amount_to_approve': '800.00',
                'collaborator_ids': [self.collaborator.id],
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        first_overflow.refresh_from_db()
        self.assertEqual(first_overflow.status, Overflow.STATUS_CSO)
        self.assertEqual(first_overflow.amount_to_approve, Decimal('500.00'))

        self.assertFalse(Overflow.objects.filter(id=second_overflow.id).exists())
        self.assertFalse(
            Overflow.objects.filter(
                identifier=identifier,
                owner=self.approver,
                period=self.active_period,
                status=Overflow.STATUS_OVERKILL,
            ).exists()
        )

        reserve_consumed = Overflow.objects.get(
            transaction=second_transaction,
            identifier=identifier,
            status=Overflow.STATUS_CSO,
            resolution_type=Overflow.RESOLUTION_RESERVE_CONSUMED,
        )
        self.assertEqual(reserve_consumed.amount_to_approve, Decimal('300.00'))
        self.assertEqual(list(reserve_consumed.collaborators.values_list('id', flat=True)), [self.collaborator.id])

    def test_extra_approval_can_cover_next_pending_and_leave_remaining_overkill(self):
        identifier = Identifier.objects.create(number='175')
        IdentifierLedgerFreeze.objects.create(
            identifier=identifier,
            period=self.active_period,
            owner=self.approver,
            applies_to_all=True,
        )

        first_ticket = Ticket.objects.create(customer_name='First Pending Remaining', created_by=self.approver)
        first_transaction = Transaction.objects.create(
            ticket=first_ticket,
            identifier=identifier,
            total_amount=Decimal('1.00'),
            created_by=self.approver,
        )
        first_overflow = Overflow.objects.get(transaction=first_transaction, status=Overflow.STATUS_TCSO)
        first_overflow.excess_amount = Decimal('500.00')
        first_overflow.save(update_fields=['excess_amount'])

        second_ticket = Ticket.objects.create(customer_name='Second Pending Remaining', created_by=self.approver)
        second_transaction = Transaction.objects.create(
            ticket=second_ticket,
            identifier=identifier,
            total_amount=Decimal('1.00'),
            created_by=self.approver,
        )
        second_overflow = Overflow.objects.get(transaction=second_transaction, status=Overflow.STATUS_TCSO)
        second_overflow.excess_amount = Decimal('300.00')
        second_overflow.save(update_fields=['excess_amount'])

        response = self.client.post(
            f'/api/overflows/{first_overflow.id}/approve/',
            {
                'amount_to_approve': '900.00',
                'collaborator_ids': [self.collaborator.id],
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        first_overflow.refresh_from_db()
        self.assertEqual(first_overflow.status, Overflow.STATUS_CSO)
        self.assertEqual(first_overflow.amount_to_approve, Decimal('500.00'))

        self.assertFalse(Overflow.objects.filter(id=second_overflow.id).exists())

        reserve_consumed = Overflow.objects.get(
            transaction=second_transaction,
            identifier=identifier,
            status=Overflow.STATUS_CSO,
            resolution_type=Overflow.RESOLUTION_RESERVE_CONSUMED,
        )
        self.assertEqual(reserve_consumed.amount_to_approve, Decimal('300.00'))
        self.assertEqual(list(reserve_consumed.collaborators.values_list('id', flat=True)), [self.collaborator.id])

        overkill = Overflow.objects.get(
            identifier=identifier,
            owner=self.approver,
            period=self.active_period,
            status=Overflow.STATUS_OVERKILL,
        )
        self.assertIsNone(overkill.transaction)
        self.assertEqual(overkill.amount_to_approve, Decimal('100.00'))
        self.assertEqual(overkill.excess_amount, Decimal('100.00'))
        self.assertEqual(list(overkill.collaborators.values_list('id', flat=True)), [self.collaborator.id])

    def test_allocation_preview_and_manual_create_use_current_users_ledgers(self):
        backup_ledger = Ledger.objects.create(
            owner=self.approver,
            period=self.active_period,
            name='Backup Ledger',
            end_date=self.active_period.end_date,
            limit_per_identifier=Decimal('100.00'),
            priority=2,
            is_active=True,
        )

        preview_response = self.client.post('/api/transactions/allocation-preview/', {
            'identifier': self.identifier.id,
            'total_amount': '230.00',
            'manual_allocations': [
                {'ledger': self.active_ledger.id, 'amount': '100.00'},
                {'ledger': backup_ledger.id, 'amount': '80.00'},
            ],
        }, format='json')

        self.assertEqual(preview_response.status_code, status.HTTP_200_OK)
        self.assertEqual(preview_response.data['overflow_amount'], '107.50')

        create_response = self.client.post('/api/transactions/', {
            'identifier': self.identifier.id,
            'total_amount': '230.00',
            'manual_allocations': [
                {'ledger': self.active_ledger.id, 'amount': '100.00'},
                {'ledger': backup_ledger.id, 'amount': '80.00'},
            ],
            'allow_overflow': True,
        }, format='json')

        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)
        tx = Transaction.objects.get(id=create_response.data['id'])
        self.assertTrue(tx.allocations.filter(ledger=self.active_ledger, amount=Decimal('100.00')).exists())
        self.assertTrue(tx.allocations.filter(ledger=backup_ledger, amount=Decimal('80.00')).exists())
        self.assertEqual(Overflow.objects.get(transaction=tx).excess_amount, Decimal('107.50'))

    def test_freezing_identifier_in_one_ledger_moves_usage_to_other_ledgers(self):
        backup_ledger = Ledger.objects.create(
            owner=self.approver,
            period=self.active_period,
            name='Backup Ledger',
            end_date=self.active_period.end_date,
            limit_per_identifier=Decimal('200.00'),
            priority=2,
            is_active=True,
        )

        freeze_response = self.client.post(
            f'/api/identifiers/{self.identifier.id}/freeze/',
            {
                'scope': 'ledger',
                'ledger_id': self.active_ledger.id,
            },
            format='json',
        )
        self.assertEqual(freeze_response.status_code, status.HTTP_200_OK)

        preview_response = self.client.post('/api/transactions/allocation-preview/', {
            'identifier': self.identifier.id,
            'total_amount': '120.00',
        }, format='json')

        self.assertEqual(preview_response.status_code, status.HTTP_200_OK)
        allocations = preview_response.data['ledger_allocations']
        self.assertEqual(len(allocations), 1)
        self.assertEqual(allocations[0]['ledger_id'], backup_ledger.id)
        self.assertEqual(allocations[0]['allocated_amount'], '150.00')
        self.assertEqual(preview_response.data['overflow_amount'], '0.00')

    def test_freezing_identifier_across_all_ledgers_keeps_reserve_capacity_available(self):
        Ledger.objects.create(
            owner=self.approver,
            period=self.active_period,
            name='Backup Ledger',
            end_date=self.active_period.end_date,
            limit_per_identifier=Decimal('200.00'),
            priority=2,
            is_active=True,
        )
        IdentifierCapacityAdjustment.objects.create(
            identifier=self.identifier,
            period=self.active_period,
            owner=self.approver,
            amount=Decimal('50.00'),
        )

        freeze_response = self.client.post(
            f'/api/identifiers/{self.identifier.id}/freeze/',
            {'scope': 'all'},
            format='json',
        )
        self.assertEqual(freeze_response.status_code, status.HTTP_200_OK)

        preview_response = self.client.post('/api/transactions/allocation-preview/', {
            'identifier': self.identifier.id,
            'total_amount': '100.00',
        }, format='json')

        self.assertEqual(preview_response.status_code, status.HTTP_200_OK)
        self.assertEqual(preview_response.data['reserve_allocated'], '50.00')
        self.assertEqual(preview_response.data['overflow_amount'], '75.00')
        self.assertTrue(all(item['allocated_amount'] == '0.00' for item in preview_response.data['ledger_allocations']))

    def test_freezing_identifier_across_all_ledgers_still_uses_reserve_on_submit(self):
        Ledger.objects.create(
            owner=self.approver,
            period=self.active_period,
            name='Backup Ledger',
            end_date=self.active_period.end_date,
            limit_per_identifier=Decimal('200.00'),
            priority=2,
            is_active=True,
        )
        IdentifierCapacityAdjustment.objects.create(
            identifier=self.identifier,
            period=self.active_period,
            owner=self.approver,
            amount=Decimal('50.00'),
        )
        IdentifierLedgerFreeze.objects.create(
            identifier=self.identifier,
            period=self.active_period,
            owner=self.approver,
            applies_to_all=True,
        )

        response = self.client.post('/api/transactions/', {
            'identifier': self.identifier.id,
            'total_amount': '100.00',
            'allow_overflow': True,
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        transaction_obj = Transaction.objects.get(id=response.data['id'])
        reserve_ledger = Ledger.get_capacity_reserve(self.active_period, self.approver, create=True)
        self.assertTrue(
            LedgerAllocation.objects.filter(
                transaction=transaction_obj,
                ledger=reserve_ledger,
                amount=Decimal('50.00'),
            ).exists()
        )
        self.assertEqual(Overflow.objects.get(transaction=transaction_obj).excess_amount, Decimal('75.00'))

    def test_ledger_view_includes_identifier_freeze_state(self):
        freeze = IdentifierLedgerFreeze.objects.create(
            identifier=self.identifier,
            period=self.active_period,
            owner=self.approver,
            ledger=self.active_ledger,
            applies_to_all=False,
        )

        response = self.client.get(f'/api/ledgers/{self.active_ledger.id}/view/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        identifier_row = next(
            row for row in response.data['identifiers']
            if row['number'] == self.identifier.number
        )
        self.assertTrue(identifier_row['is_frozen'])
        self.assertFalse(identifier_row['frozen_all_ledgers'])
        self.assertIn(freeze.ledger_id, identifier_row['frozen_ledger_ids'])

    def test_ledger_view_includes_full_ledger_ids_for_identifier(self):
        self.active_ledger.limit_per_identifier = Decimal('50.00')
        self.active_ledger.save(update_fields=['limit_per_identifier'])
        backup_ledger = Ledger.objects.create(
            owner=self.approver,
            period=self.active_period,
            name='Full Backup Ledger',
            end_date=self.active_period.end_date,
            limit_per_identifier=Decimal('100.00'),
            priority=2,
            is_active=True,
        )
        self.active_transaction.allocations.all().delete()
        LedgerAllocation.objects.create(
            transaction=self.active_transaction,
            ledger=self.active_ledger,
            amount=Decimal('50.00'),
        )
        second_ticket = Ticket.objects.create(customer_name='Second Full Ticket', created_by=self.approver)
        second_transaction = Transaction.objects.create(
            ticket=second_ticket,
            identifier=self.identifier,
            total_amount=Decimal('10.00'),
            created_by=self.approver,
        )
        second_transaction.allocations.all().delete()
        LedgerAllocation.objects.create(
            transaction=second_transaction,
            ledger=backup_ledger,
            amount=Decimal('100.00'),
        )

        response = self.client.get(f'/api/ledgers/{self.active_ledger.id}/view/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        identifier_row = next(
            row for row in response.data['identifiers']
            if row['number'] == self.identifier.number
        )
        self.assertIn(self.active_ledger.id, identifier_row['full_ledger_ids'])
        self.assertIn(backup_ledger.id, identifier_row['full_ledger_ids'])

    def test_unfreeze_all_clears_individual_ledger_freezes(self):
        backup_ledger = Ledger.objects.create(
            owner=self.approver,
            period=self.active_period,
            name='Second Freeze Ledger',
            end_date=self.active_period.end_date,
            limit_per_identifier=Decimal('100.00'),
            priority=2,
            is_active=True,
        )
        IdentifierLedgerFreeze.objects.create(
            identifier=self.identifier,
            period=self.active_period,
            owner=self.approver,
            ledger=self.active_ledger,
            applies_to_all=False,
        )
        IdentifierLedgerFreeze.objects.create(
            identifier=self.identifier,
            period=self.active_period,
            owner=self.approver,
            ledger=backup_ledger,
            applies_to_all=False,
        )

        response = self.client.post(
            f'/api/identifiers/{self.identifier.id}/unfreeze/',
            {'scope': 'all'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(
            IdentifierLedgerFreeze.objects.filter(
                identifier=self.identifier,
                period=self.active_period,
                owner=self.approver,
            ).exists()
        )
        self.assertTrue(
            UserNotification.objects.filter(
                recipient=self.approver,
                title='Identifier unfrozen',
            ).exists()
        )

    def test_freeze_all_creates_identifier_notification(self):
        response = self.client.post(
            f'/api/identifiers/{self.identifier.id}/freeze/',
            {'scope': 'all'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(
            UserNotification.objects.filter(
                recipient=self.approver,
                title='Identifier frozen',
                period=self.active_period,
            ).exists()
        )

    def test_ledger_export_pdf_is_limited_to_owner(self):
        allowed_response = self.client.get(f'/api/ledgers/{self.active_ledger.id}/export-pdf/')
        self.assertEqual(allowed_response.status_code, status.HTTP_200_OK)

    def test_ledger_view_returns_identifier_rows_and_ticket_links_for_owner(self):
        ticket = Ticket.objects.create(customer_name='Ledger View Ticket', created_by=self.approver)
        transaction_obj = Transaction.objects.create(
            ticket=ticket,
            identifier=self.identifier,
            total_amount=Decimal('120.00'),
            created_by=self.approver,
        )

        response = self.client.get(f'/api/ledgers/{self.active_ledger.id}/view/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['ledger']['id'], self.active_ledger.id)
        self.assertIn('summary', response.data)
        identifier_row = next(
            row for row in response.data['identifiers']
            if row['number'] == self.identifier.number
        )
        self.assertTrue(identifier_row['recordings'])
        ticket_numbers = {recording['ticket_number'] for recording in identifier_row['recordings']}
        order_numbers = {recording['order_number'] for recording in identifier_row['recordings']}
        self.assertIn(ticket.ticket_number, ticket_numbers)
        self.assertIn(transaction_obj.order_number, order_numbers)
        self.assertIn('remaining_capacity', identifier_row)

    def test_identifier_options_returns_lightweight_number_list(self):
        response = self.client.get('/api/identifiers/options/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(len(response.data) >= 1)
        first_item = response.data[0]
        self.assertEqual(set(first_item.keys()), {'id', 'number'})

        self.client.force_authenticate(user=self.other_user)
        blocked_response = self.client.get(f'/api/ledgers/{self.active_ledger.id}/export-pdf/')
        self.assertEqual(blocked_response.status_code, status.HTTP_404_NOT_FOUND)
        blocked_view_response = self.client.get(f'/api/ledgers/{self.active_ledger.id}/view/')
        self.assertEqual(blocked_view_response.status_code, status.HTTP_404_NOT_FOUND)
