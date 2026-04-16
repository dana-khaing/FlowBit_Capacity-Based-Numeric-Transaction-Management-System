from rest_framework.permissions import BasePermission

from .models import Profile


def is_admin_user(user):
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    profile = getattr(user, 'profile', None)
    return bool(profile and profile.role == 'admin')


class IsAdminRole(BasePermission):
    def has_permission(self, request, view):
        return is_admin_user(request.user)


class IsAuthenticatedReadOnlyOrAdminWrite(BasePermission):
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.method in ('GET', 'HEAD', 'OPTIONS'):
            return True
        return is_admin_user(request.user)


def get_request_admin_override_code(request):
    override_code = ''
    if hasattr(request, 'data'):
        override_code = (request.data.get('admin_override_code') or '').strip()

    if not override_code and hasattr(request, 'query_params'):
        override_code = (request.query_params.get('admin_override_code') or '').strip()

    return override_code


def get_valid_admin_override_profile(raw_code):
    if not raw_code:
        return None

    for profile in Profile.objects.select_related('user').filter(role='admin'):
        if profile.check_master_override_password(raw_code):
            return profile
    return None


def get_request_admin_override_profile(request):
    return get_valid_admin_override_profile(get_request_admin_override_code(request))


class IsAuthenticatedReadOnlyOrAdminWriteOrOverride(BasePermission):
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.method in ('GET', 'HEAD', 'OPTIONS'):
            return True
        if is_admin_user(request.user):
            return True
        return bool(get_request_admin_override_profile(request))
