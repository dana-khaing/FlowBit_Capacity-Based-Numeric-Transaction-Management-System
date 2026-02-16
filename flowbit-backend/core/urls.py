from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import CreateTicketWithTransactions, LedgerViewSet, IdentifierViewSet, TransactionViewSet, OverflowViewSet

router = DefaultRouter()
router.register(r'ledgers', LedgerViewSet)
router.register(r'identifiers', IdentifierViewSet)
router.register(r'transactions', TransactionViewSet)
router.register(r'overflows', OverflowViewSet)

urlpatterns = [
    # Router endpoints (no extra 'api/' here)
    path('', include(router.urls)),
    
    # Custom view – no extra 'api/' prefix
    path('tickets/create-with-items/', CreateTicketWithTransactions.as_view(), name='create-ticket-with-items'),
]