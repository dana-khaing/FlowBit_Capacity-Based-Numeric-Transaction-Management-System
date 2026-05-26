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
    UserNotificationViewSet,
    SupportCaseViewSet,
    AuditLogViewSet,
    CollaboratorViewSet,
    UserManagementViewSet,
    DashboardReportView,
    DashboardHotNumberReportView,
    DashboardAlmostFullReportView,
    DashboardFullNumberReportView,
    IdentifierCapacityReportView,
    LoginView,
    RegisterView,
    GoogleLoginView,
    LogoutView,
    MeView,
    ProfileAvatarView,
    ChangePasswordView,
    ForgotPasswordView,
    VerifyEmailView,
    ResendVerificationView,
    ResetPasswordConfirmView,
    PublicLoginHelpCaseCreateView,
    TicketListView,
    TicketDetailView,
    TicketRefundView,
    TicketReceiptPdfExportView,
    RepeatTicketViewSet,
)

router = DefaultRouter()
router.register(r'periods', PeriodViewSet)
router.register(r'ledgers', LedgerViewSet)
router.register(r'identifiers', IdentifierViewSet)
router.register(r'transactions', TransactionViewSet)
router.register(r'overflows', OverflowViewSet)
router.register(r'overflow-notifications', OverflowNotificationViewSet)
router.register(r'notifications', UserNotificationViewSet, basename='notifications')
router.register(r'support-cases', SupportCaseViewSet, basename='support-case')
router.register(r'audit-logs', AuditLogViewSet)
router.register(r'collaborators', CollaboratorViewSet)
router.register(r'users', UserManagementViewSet, basename='user-management')
router.register(r'repeat-tickets', RepeatTicketViewSet, basename='repeat-ticket')

urlpatterns = [
    path('support-cases/login-help/', PublicLoginHelpCaseCreateView.as_view(), name='support-case-login-help'),
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
    path('auth/verify-email/', VerifyEmailView.as_view(), name='auth-verify-email'),
    path('auth/resend-verification/', ResendVerificationView.as_view(), name='auth-resend-verification'),
    path('auth/reset-password/', ResetPasswordConfirmView.as_view(), name='auth-reset-password'),

    path('reports/dashboard/', DashboardReportView.as_view(), name='report-dashboard'),
    path('reports/dashboard/hot-numbers/', DashboardHotNumberReportView.as_view(), name='report-dashboard-hot-numbers'),
    path('reports/dashboard/almost-full/', DashboardAlmostFullReportView.as_view(), name='report-dashboard-almost-full'),
    path('reports/dashboard/full-numbers/', DashboardFullNumberReportView.as_view(), name='report-dashboard-full-numbers'),
    path('reports/identifiers/capacity/', IdentifierCapacityReportView.as_view(), name='report-identifier-capacity'),

    # Ticket creation (multiple transactions in one request)
    path('tickets/create-with-items/', CreateTicketWithTransactions.as_view(), name='create-ticket-with-items'),

    # Ticket listing & detail
    path('tickets/', TicketListView.as_view(), name='ticket-list'),
    path('tickets/receipt-pdf/', TicketReceiptPdfExportView.as_view(), name='ticket-receipt-pdf'),
    path('tickets/<str:ticket_number>/', TicketDetailView.as_view(), name='ticket-detail'),
    path('tickets/<str:ticket_number>/refund/', TicketRefundView.as_view(), name='ticket-refund'),
]
