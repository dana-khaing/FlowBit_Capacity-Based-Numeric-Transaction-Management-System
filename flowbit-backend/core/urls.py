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
    DashboardReportView,
    IdentifierCapacityReportView,
    LoginView,
    RegisterView,
    GoogleLoginView,
    LogoutView,
    MeView,
    ProfileAvatarView,
    ChangePasswordView,
    ForgotPasswordView,
    ResetPasswordConfirmView,
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
    path('auth/register/', RegisterView.as_view(), name='auth-register'),
    path('auth/google/', GoogleLoginView.as_view(), name='auth-google-login'),
    path('auth/logout/', LogoutView.as_view(), name='auth-logout'),
    path('auth/me/', MeView.as_view(), name='auth-me'),
    path('auth/avatar/', ProfileAvatarView.as_view(), name='auth-avatar'),
    path('auth/change-password/', ChangePasswordView.as_view(), name='auth-change-password'),
    path('auth/forgot-password/', ForgotPasswordView.as_view(), name='auth-forgot-password'),
    path('auth/reset-password/', ResetPasswordConfirmView.as_view(), name='auth-reset-password'),

    path('reports/dashboard/', DashboardReportView.as_view(), name='report-dashboard'),
    path('reports/identifiers/capacity/', IdentifierCapacityReportView.as_view(), name='report-identifier-capacity'),

    # Ticket creation (multiple transactions in one request)
    path('tickets/create-with-items/', CreateTicketWithTransactions.as_view(), name='create-ticket-with-items'),

    # Ticket listing & detail
    path('tickets/', TicketListView.as_view(), name='ticket-list'),
    path('tickets/<str:ticket_number>/', TicketDetailView.as_view(), name='ticket-detail'),
]
