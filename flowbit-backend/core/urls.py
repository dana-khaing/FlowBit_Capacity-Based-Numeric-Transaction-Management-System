from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    CreateTicketWithTransactions,
    PeriodViewSet,
    LedgerViewSet,
    IdentifierViewSet,
    TransactionViewSet,
    OverflowViewSet,
    OverflowNotificationViewSet,
    AuditLogViewSet,
    CollaboratorViewSet,
    UserManagementViewSet,
    LoginView,
    GoogleLoginView,
    LogoutView,
    MeView,
    ChangePasswordView,
    TicketListView,
    TicketDetailView
)

router = DefaultRouter()
router.register(r'periods', PeriodViewSet)
router.register(r'ledgers', LedgerViewSet)
router.register(r'identifiers', IdentifierViewSet)
router.register(r'transactions', TransactionViewSet)
router.register(r'overflows', OverflowViewSet)
router.register(r'overflow-notifications', OverflowNotificationViewSet)
router.register(r'audit-logs', AuditLogViewSet)
router.register(r'collaborators', CollaboratorViewSet)
router.register(r'users', UserManagementViewSet, basename='user-management')

urlpatterns = [
    # All router endpoints (ledgers, identifiers, transactions, overflows)
    path('', include(router.urls)),

    path('auth/login/', LoginView.as_view(), name='auth-login'),
    path('auth/google/', GoogleLoginView.as_view(), name='auth-google-login'),
    path('auth/logout/', LogoutView.as_view(), name='auth-logout'),
    path('auth/me/', MeView.as_view(), name='auth-me'),
    path('auth/change-password/', ChangePasswordView.as_view(), name='auth-change-password'),

    # Ticket creation (multiple transactions in one request)
    path('tickets/create-with-items/', CreateTicketWithTransactions.as_view(), name='create-ticket-with-items'),

    # Ticket listing & detail
    path('tickets/', TicketListView.as_view(), name='ticket-list'),
    path('tickets/<str:ticket_number>/', TicketDetailView.as_view(), name='ticket-detail'),
]
