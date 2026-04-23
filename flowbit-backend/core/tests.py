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
        self.identifier = Identifier.objects.create(number='101')

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
        admin_audit = AuditLog.objects.get(user=self.admin_user, action='period.created')
        self.assertEqual(admin_audit.changes['override_actor_username'], 'regular_role_user')
        self.assertEqual(admin_audit.changes['override_owner_username'], 'admin_role_user')
        self.assertTrue(admin_audit.changes['admin_override_used'])

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

    def test_regular_user_can_reopen_closed_ledger_with_admin_override_code(self):
        self.admin_user.profile.set_master_override_password('override-123')
        self.admin_user.profile.save(update_fields=['master_override_password', 'updated_at'])
        self.ledger.close()
        self.client.force_authenticate(user=self.regular_user)

        response = self.client.post(
            f'/api/ledgers/{self.ledger.id}/reopen/',
            {'admin_override_code': 'override-123'},
            format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.ledger.refresh_from_db()
        self.assertTrue(self.ledger.is_active)
        self.assertIsNone(self.ledger.closed_at)

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
        self.client.force_authenticate(user=self.admin_user)
        self.ledger.close()
        self.period.close()

        response = self.client.post(f'/api/ledgers/{self.ledger.id}/reopen/')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['detail'], 'Only ledgers in the active period can be reopened.')

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
        response = self.client.post(
            f'/api/users/{self.admin_user.id}/set-master-override-password/',
            {'master_override_password': 'override-999', 'admin_override_code': 'override-123'},
            format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.admin_user.refresh_from_db()
        self.assertTrue(self.admin_user.profile.check_master_override_password('override-999'))

    def test_admin_can_set_initial_master_override_password_without_existing_override(self):
        self.client.force_authenticate(user=self.admin_user)
        self.admin_user.profile.clear_master_override_password()
        self.admin_user.profile.save(update_fields=['master_override_password', 'updated_at'])

        response = self.client.post(
            f'/api/users/{self.admin_user.id}/set-master-override-password/',
            {'master_override_password': 'first-override'},
            format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.admin_user.refresh_from_db()
        self.assertTrue(self.admin_user.profile.check_master_override_password('first-override'))

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
        self.admin_user.profile.set_master_override_password('existing-override')
        self.admin_user.profile.save(update_fields=['master_override_password', 'updated_at'])

        response = self.client.post(
            f'/api/users/{self.admin_user.id}/set-master-override-password/',
            {'master_override_password': 'override-999'},
            format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['detail'], 'Admin override code is required for this action.')

    def test_admin_cannot_set_master_override_with_incorrect_override_code(self):
        self.client.force_authenticate(user=self.admin_user)
        self.admin_user.profile.set_master_override_password('existing-override')
        self.admin_user.profile.save(update_fields=['master_override_password', 'updated_at'])

        response = self.client.post(
            f'/api/users/{self.admin_user.id}/set-master-override-password/',
            {'master_override_password': 'override-999', 'admin_override_code': 'wrong-code'},
            format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['detail'], 'Admin override code is incorrect.')

    def test_admin_cannot_set_other_admin_override_password(self):
        self.client.force_authenticate(user=self.admin_user)
        other_admin = User.objects.create_user(username='second_admin_user', password='password123')
        other_admin.profile.role = 'admin'
        other_admin.profile.set_master_override_password('second-override')
        other_admin.profile.save(update_fields=['role', 'master_override_password', 'updated_at'])

        response = self.client.post(
            f'/api/users/{other_admin.id}/set-master-override-password/',
            {'master_override_password': 'override-999', 'admin_override_code': 'override-123'},
            format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['detail'], 'Admin users can only manage their own override code.')

    def test_admin_cannot_delete_user_without_override_code(self):
        self.client.force_authenticate(user=self.admin_user)

        response = self.client.delete(f'/api/users/{self.regular_user.id}/')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['detail'], 'Admin override code is required for this action.')
        self.assertTrue(User.objects.filter(pk=self.regular_user.pk).exists())

    def test_admin_cannot_delete_user_with_incorrect_override_code(self):
        self.client.force_authenticate(user=self.admin_user)

        response = self.client.delete(
            f'/api/users/{self.regular_user.id}/',
            {'admin_override_code': 'wrong-code'},
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
        self.admin_user.profile.set_master_override_password('override-123')
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
            'admin_override_code': 'override-123',
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
        self.assertEqual(row['normal_usage'], '60')


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
        self.approver.profile.save(update_fields=['role', 'updated_at'])
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
            identifier=self.identifier,
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
        self.assertIn('101,.,180.00', export_response.content.decode('utf-8'))

        self.client.force_authenticate(user=self.other_user)
        hidden_response = self.client.get('/api/overflows/')
        self.assertEqual(hidden_response.status_code, status.HTTP_200_OK)
        self.assertEqual(hidden_response.data, [])

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
        self.assertEqual(preview_response.data['overflow_amount'], '50.00')

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
        self.assertEqual(Overflow.objects.get(transaction=tx).excess_amount, Decimal('50.00'))

    def test_ledger_export_pdf_is_limited_to_owner(self):
        allowed_response = self.client.get(f'/api/ledgers/{self.active_ledger.id}/export-pdf/')
        self.assertEqual(allowed_response.status_code, status.HTTP_200_OK)

        self.client.force_authenticate(user=self.other_user)
        blocked_response = self.client.get(f'/api/ledgers/{self.active_ledger.id}/export-pdf/')
        self.assertEqual(blocked_response.status_code, status.HTTP_404_NOT_FOUND)
