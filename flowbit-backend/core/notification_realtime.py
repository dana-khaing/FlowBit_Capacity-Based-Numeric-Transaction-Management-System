import asyncio
import json
from collections import defaultdict
from urllib.parse import parse_qs

from asgiref.sync import async_to_sync
from django.contrib.auth.models import AnonymousUser
from rest_framework.authtoken.models import Token

from core.models import UserNotification
from core.serializers import UserNotificationSerializer


_notification_connections = defaultdict(set)


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


async def _register_connection(user_id: int, queue: asyncio.Queue):
    _notification_connections[user_id].add(queue)


async def _unregister_connection(user_id: int, queue: asyncio.Queue):
    user_connections = _notification_connections.get(user_id)
    if not user_connections:
        return
    user_connections.discard(queue)
    if not user_connections:
        _notification_connections.pop(user_id, None)


async def _broadcast_to_user(user_id: int, payload: dict):
    user_connections = list(_notification_connections.get(user_id, set()))
    if not user_connections:
        return
    for queue in user_connections:
        await queue.put(payload)


def push_notification_event(notification: UserNotification):
    async_to_sync(_broadcast_to_user)(
        notification.recipient_id,
        _notification_payload(notification),
    )


def push_notification_refresh_for_user(user_id: int):
    async_to_sync(_broadcast_to_user)(
        user_id,
        {'type': 'notifications.refresh'},
    )


def _authenticate_websocket(scope):
    query_string = scope.get('query_string', b'').decode('utf-8')
    token_key = (parse_qs(query_string).get('token') or [None])[0]
    if not token_key:
        return None
    token = Token.objects.select_related('user').filter(key=token_key).first()
    if not token or not token.user.is_active:
        return None
    return token.user


async def notifications_websocket_app(scope, receive, send):
    if scope['type'] != 'websocket':
        return

    user = _authenticate_websocket(scope)
    if user is None or isinstance(user, AnonymousUser):
        await send({'type': 'websocket.close', 'code': 4401})
        return

    await send({'type': 'websocket.accept'})

    queue: asyncio.Queue = asyncio.Queue()
    await _register_connection(user.id, queue)

    try:
        initial_unread_count = UserNotification.objects.filter(
            recipient=user,
            read_at__isnull=True,
        ).count()
        await send({
            'type': 'websocket.send',
            'text': json.dumps({
                'type': 'notifications.connected',
                'unread_count': initial_unread_count,
            }),
        })

        while True:
            receive_task = asyncio.create_task(receive())
            queue_task = asyncio.create_task(queue.get())
            done, pending = await asyncio.wait(
                {receive_task, queue_task},
                return_when=asyncio.FIRST_COMPLETED,
            )

            for task in pending:
                task.cancel()

            if receive_task in done:
                message = receive_task.result()
                if message['type'] == 'websocket.disconnect':
                    break
                if message['type'] == 'websocket.receive' and message.get('text') == 'ping':
                    await send({'type': 'websocket.send', 'text': json.dumps({'type': 'pong'})})

            if queue_task in done:
                payload = queue_task.result()
                await send({
                    'type': 'websocket.send',
                    'text': json.dumps(payload),
                })
    finally:
        await _unregister_connection(user.id, queue)
