from datetime import datetime
from decimal import Decimal

from django.utils import timezone

from .models import AuditLog


def serialize_audit_value(value):
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, datetime):
        if timezone.is_aware(value):
            value = timezone.localtime(value)
        return value.isoformat()
    if hasattr(value, 'pk'):
        return value.pk
    return value


def snapshot_instance(instance):
    return {
        field.name: serialize_audit_value(getattr(instance, field.name))
        for field in instance._meta.concrete_fields
    }


def request_ip(request):
    forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if forwarded_for:
        return forwarded_for.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR')


def record_audit_log(request, action, target=None, details='', changes=None):
    AuditLog.objects.create(
        user=request.user if getattr(request, 'user', None) and request.user.is_authenticated else None,
        action=action,
        ip_address=request_ip(request),
        target_model=target.__class__.__name__ if target is not None else '',
        target_id=getattr(target, 'pk', None) if target is not None else None,
        details=details,
        changes=changes or {},
    )


def record_system_audit_log(action, target=None, details='', changes=None):
    AuditLog.objects.create(
        action=action,
        target_model=target.__class__.__name__ if target is not None else '',
        target_id=getattr(target, 'pk', None) if target is not None else None,
        details=details,
        changes=changes or {},
    )
