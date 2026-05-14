import json
from urllib.parse import parse_qs

from asgiref.sync import async_to_sync
from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.layers import get_channel_layer
from channels.middleware import BaseMiddleware
from django.contrib.auth.models import AnonymousUser
from django.db import close_old_connections
from rest_framework.authtoken.models import Token

from core.models import UserNotification
from core.serializers import UserNotificationSerializer


def notification_group_name(user_id: int) -> str:
    return f"notifications_user_{user_id}"


def _notification_payload(notification: UserNotification):
    unread_count = UserNotification.objects.filter(
        recipient=notification.recipient,
        read_at__isnull=True,
    ).count()
    return {
        'type': 'notifications.updated',
        'notification': UserNotificationSerializer(notification).data,
        'unread_count': unread_count,
    }


def push_notification_event(notification: UserNotification):
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return
    async_to_sync(channel_layer.group_send)(
        notification_group_name(notification.recipient_id),
        {
            'type': 'notification.message',
            'payload': _notification_payload(notification),
        },
    )


def push_notification_refresh_for_user(user_id: int):
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return
    async_to_sync(channel_layer.group_send)(
        notification_group_name(user_id),
        {
            'type': 'notification.message',
            'payload': {'type': 'notifications.refresh'},
        },
    )


@database_sync_to_async
def _get_user_from_token(token_key: str):
    close_old_connections()
    token = Token.objects.select_related('user').filter(key=token_key).first()
    if not token or not token.user.is_active:
        return AnonymousUser()
    return token.user


@database_sync_to_async
def _get_unread_count(user_id: int):
    close_old_connections()
    return UserNotification.objects.filter(
        recipient_id=user_id,
        read_at__isnull=True,
    ).count()


class TokenAuthMiddleware(BaseMiddleware):
    async def __call__(self, scope, receive, send):
        query_string = scope.get('query_string', b'').decode('utf-8')
        token_key = (parse_qs(query_string).get('token') or [None])[0]
        scope['user'] = await _get_user_from_token(token_key) if token_key else AnonymousUser()
        return await super().__call__(scope, receive, send)


class NotificationConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        user = self.scope.get('user')
        if not user or isinstance(user, AnonymousUser) or not getattr(user, 'is_authenticated', False):
            await self.close(code=4401)
            return

        self.notification_group = notification_group_name(user.id)
        await self.channel_layer.group_add(self.notification_group, self.channel_name)
        await self.accept()
        await self.send(
            text_data=json.dumps({
                'type': 'notifications.connected',
                'unread_count': await _get_unread_count(user.id),
            })
        )

    async def disconnect(self, close_code):
        if hasattr(self, 'notification_group'):
            await self.channel_layer.group_discard(self.notification_group, self.channel_name)

    async def receive(self, text_data=None, bytes_data=None):
        if text_data == 'ping':
            await self.send(text_data=json.dumps({'type': 'pong'}))

    async def notification_message(self, event):
        await self.send(text_data=json.dumps(event['payload']))
