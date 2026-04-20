from io import StringIO
from decimal import Decimal
from datetime import datetime
from unittest.mock import patch

from django.core.management import call_command
from django.core import mail
from django.contrib.auth.models import User
from django.test import override_settings
from django.test import SimpleTestCase
from django.utils import timezone
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework.authtoken.models import Token

from core.models import (
    Period,
    Identifier,
    IdentifierCapacityAdjustment,
    Ledger,
    Overflow,
    OverflowNotification,
    AuditLog,
    PasswordResetToken,
    Profile,
    Collaborator,
    Ticket,
    Transaction,
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

    def test_check_database_connection_command_succeeds(self):
        out = StringIO()

        call_command('check_database_connection', stdout=out)

        output = out.getvalue()
        self.assertIn('Database configuration:', output)
        self.assertIn('Database connection succeeded.', output)


class ApiDocumentationTests(APITestCase):
    def setUp(self):
        self.admin_user = User.objects.create_user(username='docs_admin', password='password123')
        self.admin_user.profile.role = 'admin'
        self.admin_user.profile.save(update_fields=['role', 'updated_at'])
        self.regular_user = User.objects.create_user(username='docs_user', password='password123')

    @override_settings(DEBUG=True)
    def test_openapi_schema_endpoint_returns_json(self):
        response = self.client.get('/api/schema/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response['Content-Type'], 'application/vnd.oai.openapi+json')
        self.assertIn('openapi', response.json())
        self.assertIn('/api/auth/login/', response.json()['paths'])

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
        self.assertEqual(created_user.first_name, 'New')
        self.assertEqual(created_user.last_name, 'Flow User')
        self.assertEqual(created_user.profile.phone_number, '+44-7000-000001')
        self.assertEqual(response.data['user']['phone_number'], '+44-7000-000001')
        self.assertTrue(AuditLog.objects.filter(action='auth.register', target_id=created_user.id).exists())

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
        self.assertTrue(AuditLog.objects.filter(action='auth.avatar_updated', target_id=self.user.id).exists())

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
        admin_user.profile.set_master_override_password('override-123')
        admin_user.profile.save(update_fields=['role', 'master_override_password', 'updated_at'])

        token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

        response = self.client.delete('/api/auth/me/', {
            'admin_override_code': 'override-123',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(User.objects.filter(pk=self.user.pk).exists())
        self.assertTrue(AuditLog.objects.filter(action='auth.account_deleted').exists())

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
        self.user.profile.set_master_override_password('override-456')
        self.user.profile.save(update_fields=['master_override_password', 'updated_at'])

        response = self.client.post('/api/auth/login/', {
            'username': 'auth_user',
            'password': 'override-456',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('token', response.data)
        self.assertTrue(AuditLog.objects.filter(action='auth.login_override', target_id=self.user.id).exists())

    def test_login_rejects_master_override_for_non_admin_user(self):
        self.user.profile.set_master_override_password('override-456')
        self.user.profile.save(update_fields=['master_override_password', 'updated_at'])

        response = self.client.post('/api/auth/login/', {
            'username': 'auth_user',
            'password': 'override-456',
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
        self.assertTrue(
            AuditLog.objects.filter(action='auth.password_reset_requested', target_id=self.user.id).exists()
        )

    def test_forgot_password_returns_generic_message_for_unknown_email(self):
        response = self.client.post('/api/auth/forgot-password/', {
            'email': 'missing@example.com',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 0)

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


class RolePermissionTests(APITestCase):
    def setUp(self):
        self.admin_user = User.objects.create_user(
            username='admin_role_user',
            password='password123',
        )
        self.admin_user.profile.role = 'admin'
        self.admin_user.profile.set_master_override_password('override-123')
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
            name='Role Ledger',
            end_date=self.period.end_date,
            limit_per_identifier=Decimal('100.00'),
            priority=1,
            is_active=True,
        )
        self.identifier = Identifier.objects.get(number='101')

    def test_regular_user_cannot_create_period(self):
        self.client.force_authenticate(user=self.regular_user)

        response = self.client.post('/api/periods/', {
            'name': 'Blocked Period',
            'start_date': '2027-02-01',
            'end_date': '2027-02-28',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_regular_user_can_create_period_with_admin_override_code(self):
        self.admin_user.profile.set_master_override_password('override-123')
        self.admin_user.profile.save(update_fields=['master_override_password', 'updated_at'])
        self.client.force_authenticate(user=self.regular_user)

        response = self.client.post('/api/periods/', {
            'name': 'Override Period',
            'start_date': '2028-01-01',
            'end_date': '2028-01-31',
            'is_open': False,
            'admin_override_code': 'override-123',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_regular_user_can_close_ledger_with_admin_override_code(self):
        self.admin_user.profile.set_master_override_password('override-123')
        self.admin_user.profile.save(update_fields=['master_override_password', 'updated_at'])
        self.client.force_authenticate(user=self.regular_user)

        response = self.client.post(
            f'/api/ledgers/{self.ledger.id}/close/',
            {'admin_override_code': 'override-123'},
            format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.ledger.refresh_from_db()
        self.assertFalse(self.ledger.is_active)

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

    def test_admin_can_change_user_role(self):
        self.client.force_authenticate(user=self.admin_user)

        response = self.client.post(
            f'/api/users/{self.regular_user.id}/set-role/',
            {'role': 'admin', 'admin_override_code': 'override-123'},
            format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.regular_user.refresh_from_db()
        self.assertEqual(self.regular_user.profile.role, 'admin')

    def test_admin_cannot_downgrade_own_account(self):
        self.client.force_authenticate(user=self.admin_user)

        response = self.client.post(
            f'/api/users/{self.admin_user.id}/set-role/',
            {'role': 'user', 'admin_override_code': 'override-123'},
            format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['detail'], 'Admin users cannot downgrade their own account.')
        self.admin_user.refresh_from_db()
        self.assertEqual(self.admin_user.profile.role, 'admin')

    def test_admin_can_set_master_override_password(self):
        self.client.force_authenticate(user=self.admin_user)
        self.regular_user.profile.role = 'admin'
        self.regular_user.profile.save(update_fields=['role', 'updated_at'])

        response = self.client.post(
            f'/api/users/{self.regular_user.id}/set-master-override-password/',
            {'master_override_password': 'override-999', 'admin_override_code': 'override-123'},
            format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.regular_user.refresh_from_db()
        self.assertTrue(self.regular_user.profile.check_master_override_password('override-999'))

    def test_admin_can_delete_user_account(self):
        self.client.force_authenticate(user=self.admin_user)

        response = self.client.delete(
            f'/api/users/{self.regular_user.id}/',
            {'admin_override_code': 'override-123'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(User.objects.filter(pk=self.regular_user.pk).exists())
        self.assertTrue(AuditLog.objects.filter(action='user.account_deleted').exists())

    def test_admin_cannot_set_master_override_password_for_non_admin_user(self):
        self.client.force_authenticate(user=self.admin_user)

        response = self.client.post(
            f'/api/users/{self.regular_user.id}/set-master-override-password/',
            {'master_override_password': 'override-123', 'admin_override_code': 'override-123'},
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
        self.regular_user.profile.role = 'admin'
        self.regular_user.profile.save(update_fields=['role', 'updated_at'])

        response = self.client.post(
            f'/api/users/{self.regular_user.id}/set-master-override-password/',
            {'master_override_password': 'override-999'},
            format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['detail'], 'Admin override code is required for this action.')

    def test_admin_cannot_delete_user_without_override_code(self):
        self.client.force_authenticate(user=self.admin_user)

        response = self.client.delete(f'/api/users/{self.regular_user.id}/')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['detail'], 'Admin override code is required for this action.')
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


class LedgerArchiveAPITests(APITestCase):
    def setUp(self):
        self.identifier = Identifier.objects.create(number='101')
        self.approver = User.objects.create_user(
            username='approver_user',
            first_name='Approver',
            last_name='User',
            password='password123',
        )
        self.approver.profile.role = 'admin'
        self.approver.profile.save(update_fields=['role', 'updated_at'])
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

    def test_period_close_creates_audit_log(self):
        self.client.force_authenticate(user=self.approver)

        response = self.client.post(f'/api/periods/{self.active_period.id}/close/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        audit_entry = AuditLog.objects.get(action='period.closed')
        self.assertEqual(audit_entry.user, self.approver)
        self.assertEqual(audit_entry.target_model, 'Period')
        self.assertEqual(audit_entry.target_id, self.active_period.id)
        self.assertEqual(audit_entry.ip_address, '127.0.0.1')

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

        audit_entry = AuditLog.objects.get(action='period.auto_closed', target_id=expired_period.id)
        self.assertEqual(audit_entry.target_model, 'Period')
        self.assertIn("Auto-closed period", audit_entry.details)

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

    def test_regular_user_cannot_refund_overflow_without_admin_override_code(self):
        tx = Transaction.objects.create(
            identifier=self.identifier,
            total_amount=Decimal('250.00'),
        )
        overflow = Overflow.objects.get(transaction=tx)
        self.client.post(
            f'/api/overflows/{overflow.id}/resolve/',
            {
                'action': 'approve',
                'amount_to_approve': '180.00',
                'collaborator_ids': [self.collaborator.id],
            },
            format='json'
        )

        regular_user = User.objects.create_user(
            username='refund_regular_user',
            password='password123',
        )
        self.client.force_authenticate(user=regular_user)

        refund_response = self.client.post(
            f'/api/overflows/{overflow.id}/resolve/',
            {
                'action': 'refund_overflow_only',
                'helper_name': 'Bob',
            },
            format='json'
        )

        self.assertEqual(refund_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(refund_response.data['detail'], 'Admin override code is required for refund actions.')

    def test_regular_user_can_refund_overflow_with_admin_override_code(self):
        self.approver.profile.set_master_override_password('override-123')
        self.approver.profile.save(update_fields=['master_override_password', 'updated_at'])

        tx = Transaction.objects.create(
            identifier=self.identifier,
            total_amount=Decimal('250.00'),
        )
        overflow = Overflow.objects.get(transaction=tx)
        self.client.post(
            f'/api/overflows/{overflow.id}/resolve/',
            {
                'action': 'approve',
                'amount_to_approve': '180.00',
                'collaborator_ids': [self.collaborator.id],
            },
            format='json'
        )

        regular_user = User.objects.create_user(
            username='refund_override_user',
            password='password123',
        )
        self.client.force_authenticate(user=regular_user)

        refund_response = self.client.post(
            f'/api/overflows/{overflow.id}/resolve/',
            {
                'action': 'refund_overflow_only',
                'helper_name': 'Bob',
                'admin_override_code': 'override-123',
            },
            format='json'
        )

        self.assertEqual(refund_response.status_code, status.HTTP_200_OK)
        overflow.refresh_from_db()
        self.assertEqual(overflow.status, Overflow.STATUS_REFUNDED)

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

    def test_approve_overflow_rejects_other_users_collaborator(self):
        other_user = User.objects.create_user(
            username='other_collaborator_owner',
            password='password123',
        )
        foreign_collaborator = Collaborator.objects.create(
            owner=other_user,
            username='foreign_helper',
            full_name='Foreign Helper',
            email='foreign-helper@example.com',
            phone_number='999999',
        )
        tx = Transaction.objects.create(
            identifier=self.identifier,
            total_amount=Decimal('250.00'),
        )
        overflow = Overflow.objects.get(transaction=tx)

        response = self.client.post(
            f'/api/overflows/{overflow.id}/approve/',
            {
                'amount_to_approve': '180.00',
                'collaborator_ids': [foreign_collaborator.id],
            },
            format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['detail'], "['One or more selected collaborators do not exist.']")

    def test_collaborator_list_endpoint_returns_current_users_collaborators(self):
        response = self.client.get('/api/collaborators/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        collaborator_ids = {item['id'] for item in response.data}
        self.assertIn(self.collaborator.id, collaborator_ids)
        collaborator_row = next(item for item in response.data if item['id'] == self.collaborator.id)
        self.assertEqual(collaborator_row['full_name'], 'Helper User')

    def test_overflow_approval_creates_audit_log(self):
        self.client.force_authenticate(user=self.approver)
        tx = Transaction.objects.create(
            identifier=self.identifier,
            total_amount=Decimal('250.00'),
        )
        overflow = Overflow.objects.get(transaction=tx)

        response = self.client.post(
            f'/api/overflows/{overflow.id}/approve/',
            {
                'amount_to_approve': '125.00',
                'collaborator_ids': [self.collaborator.id],
            },
            format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        audit_entry = AuditLog.objects.get(action='overflow.approved', target_id=overflow.id)
        self.assertEqual(audit_entry.user, self.approver)
        self.assertEqual(audit_entry.target_model, 'Overflow')
        self.assertEqual(audit_entry.changes['collaborator_ids'], [self.collaborator.id])

    def test_audit_logs_endpoint_can_filter_by_action_and_target(self):
        self.client.force_authenticate(user=self.approver)
        self.client.post(f'/api/periods/{self.active_period.id}/close/')

        response = self.client.get('/api/audit-logs/', {
            'action': 'period.closed',
            'target_model': 'Period',
            'target_id': self.active_period.id,
        })

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['action'], 'period.closed')
        self.assertEqual(response.data[0]['target_model'], 'Period')
        self.assertEqual(response.data[0]['target_id'], self.active_period.id)
        self.assertEqual(response.data[0]['username'], self.approver.username)

    def test_audit_logs_endpoint_requires_authentication(self):
        self.client.force_authenticate(user=None)
        response = self.client.get('/api/audit-logs/')

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_close_expired_periods_command_creates_audit_log(self):
        self.active_period.close(closed_at=timezone.now())

        expired_period = Period.objects.create(
            name='Audit Expired Period',
            start_date=timezone.make_aware(datetime(2025, 11, 1, 0, 0, 0)),
            end_date=timezone.make_aware(datetime(2025, 11, 30, 23, 59, 59)),
            is_open=True,
        )
        Ledger.objects.create(
            period=expired_period,
            name='Audit Expired Ledger',
            end_date=expired_period.end_date,
            limit_per_identifier=Decimal('100.00'),
            priority=3,
            is_active=True,
        )

        call_command('close_expired_periods')

    def test_dashboard_report_returns_period_kpis(self):
        tx = Transaction.objects.create(
            ticket=Ticket.objects.create(customer_name='Dashboard Ticket'),
            identifier=self.identifier,
            total_amount=Decimal('250.00'),
        )
        overflow = Overflow.objects.get(transaction=tx)
        self.client.post(
            f'/api/overflows/{overflow.id}/approve/',
            {
                'amount_to_approve': '180.00',
                'collaborator_ids': [self.collaborator.id],
            },
            format='json'
        )

        response = self.client.get('/api/reports/dashboard/', {'period_id': self.active_period.id})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['period']['id'], self.active_period.id)
        self.assertEqual(response.data['ledger_count'], 1)
        self.assertEqual(response.data['pending_overflow_count'], 0)
        self.assertEqual(response.data['approved_overflow_count'], 1)
        self.assertEqual(response.data['approved_overflow_amount'], '125.00')
        self.assertEqual(response.data['reserve_capacity_granted'], '55')

    def test_identifier_capacity_report_returns_identifier_rows(self):
        tx = Transaction.objects.create(
            identifier=self.identifier,
            total_amount=Decimal('250.00'),
        )
        overflow = Overflow.objects.get(transaction=tx)
        self.client.post(
            f'/api/overflows/{overflow.id}/approve/',
            {
                'amount_to_approve': '180.00',
                'collaborator_ids': [self.collaborator.id],
            },
            format='json'
        )

        response = self.client.get('/api/reports/identifiers/capacity/', {
            'period_id': self.active_period.id,
            'number': '101',
        })

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 1)
        row = response.data['results'][0]
        self.assertEqual(row['number'], '101')
        self.assertEqual(row['reserve_granted'], '55')
        self.assertEqual(row['approved_overflow_amount'], '125.00')

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
        later_collaborator = Collaborator.objects.create(
            owner=self.approver,
            username='later_helper',
            full_name='Later Helper',
            email='later-helper@example.com',
            phone_number='666666',
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

    def test_collaborator_export_transactions_pdf_returns_pdf_file(self):
        tx = Transaction.objects.create(
            identifier=self.identifier,
            total_amount=Decimal('250.00'),
        )
        overflow = Overflow.objects.get(transaction=tx)
        approve_response = self.client.post(
            f'/api/overflows/{overflow.id}/approve/',
            {
                'amount_to_approve': '125.00',
                'collaborator_ids': [self.collaborator.id],
            },
            format='json'
        )
        self.assertEqual(approve_response.status_code, status.HTTP_200_OK)

        response = self.client.get(
            f'/api/collaborators/{self.collaborator.id}/export-transactions-pdf/',
            {'period_id': self.active_period.id}
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response['Content-Type'], 'application/pdf')
        self.assertIn('collaborator_', response['Content-Disposition'])
        self.assertTrue(response.content.startswith(b'%PDF'))

    def test_ledger_export_pdf_returns_pdf_file(self):
        response = self.client.get(f'/api/ledgers/{self.active_ledger.id}/export-pdf/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response['Content-Type'], 'application/pdf')
        self.assertIn(f'ledger_{self.active_ledger.id}', response['Content-Disposition'])
        self.assertTrue(response.content.startswith(b'%PDF'))

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
