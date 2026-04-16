from rest_framework.permissions import BasePermission


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
