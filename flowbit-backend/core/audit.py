from datetime import date, datetime, time
from decimal import Decimal

from django.utils import timezone

from .models import AuditLog
from .permissions import get_request_admin_override_profile


def serialize_audit_value(value):
    if isinstance(value, dict):
        return {
            key: serialize_audit_value(item)
            for key, item in value.items()
        }
    if isinstance(value, (list, tuple, set)):
        return [serialize_audit_value(item) for item in value]
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, time):
        return value.strftime('%H:%M:%S')
    if isinstance(value, date) and not isinstance(value, datetime):
        return value.isoformat()
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


def _override_admin_audit_changes(request, changes):
    override_profile = get_request_admin_override_profile(request)
    if override_profile is None:
        return None, None

    actor = request.user if getattr(request, 'user', None) and request.user.is_authenticated else None
    if actor is not None and actor.pk == override_profile.user_id:
        return override_profile, None

    override_changes = dict(changes or {})
    override_changes.update({
        'admin_override_used': True,
        'override_actor_id': getattr(actor, 'pk', None),
        'override_actor_username': getattr(actor, 'username', ''),
        'override_owner_id': override_profile.user_id,
        'override_owner_username': override_profile.user.username,
    })
    return override_profile, override_changes


def record_audit_log(request, action, target=None, details='', changes=None):
    serialized_changes = serialize_audit_value(changes or {})
    actor = request.user if getattr(request, 'user', None) and request.user.is_authenticated else None
    AuditLog.objects.create(
        user=request.user if getattr(request, 'user', None) and request.user.is_authenticated else None,
        action=action,
        ip_address=request_ip(request),
        target_model=target.__class__.__name__ if target is not None else '',
        target_id=getattr(target, 'pk', None) if target is not None else None,
        details=details,
        changes=serialized_changes,
    )

    override_profile, override_changes = _override_admin_audit_changes(request, serialized_changes)
    if override_profile is None or override_changes is None:
        return

    admin_details = details
    if actor is not None:
        admin_details = f"{details} (admin override used by '{actor.username}')"

    AuditLog.objects.create(
        user=override_profile.user,
        action=action,
        ip_address=request_ip(request),
        target_model=target.__class__.__name__ if target is not None else '',
        target_id=getattr(target, 'pk', None) if target is not None else None,
        details=admin_details,
        changes=override_changes,
    )


def record_system_audit_log(action, target=None, details='', changes=None):
    AuditLog.objects.create(
        action=action,
        target_model=target.__class__.__name__ if target is not None else '',
        target_id=getattr(target, 'pk', None) if target is not None else None,
        details=details,
        changes=serialize_audit_value(changes or {}),
    )
