from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    CreateTicketWithTransactions,
    PeriodViewSet,
    LedgerViewSet,
    IdentifierViewSet,
    TransactionViewSet,
    OverflowViewSet,
    TicketListView,
    TicketDetailView
)

router = DefaultRouter()
router.register(r'periods', PeriodViewSet)
router.register(r'ledgers', LedgerViewSet)
router.register(r'identifiers', IdentifierViewSet)
router.register(r'transactions', TransactionViewSet)
router.register(r'overflows', OverflowViewSet)

urlpatterns = [
    # All router endpoints (ledgers, identifiers, transactions, overflows)
    path('', include(router.urls)),

    # Ticket creation (multiple transactions in one request)
    path('tickets/create-with-items/', CreateTicketWithTransactions.as_view(), name='create-ticket-with-items'),

    # Ticket listing & detail
    path('tickets/', TicketListView.as_view(), name='ticket-list'),
    path('tickets/<str:ticket_number>/', TicketDetailView.as_view(), name='ticket-detail'),
]
