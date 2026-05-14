from django.urls import path

from core.notification_realtime import NotificationConsumer


websocket_urlpatterns = [
    path('ws/notifications/', NotificationConsumer.as_asgi()),
]
