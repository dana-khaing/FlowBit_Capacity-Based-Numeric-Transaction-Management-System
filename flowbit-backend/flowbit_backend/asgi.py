"""
ASGI config for flowbit_backend project.

It exposes the ASGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/4.2/howto/deployment/asgi/
"""

import os

from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "flowbit_backend.settings")

django_asgi_app = get_asgi_application()
from core.notification_realtime import notifications_websocket_app


async def application(scope, receive, send):
    if scope["type"] == "websocket" and scope.get("path") == "/ws/notifications/":
        await notifications_websocket_app(scope, receive, send)
        return

    await django_asgi_app(scope, receive, send)
