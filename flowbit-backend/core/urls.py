from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import LedgerViewSet, IdentifierViewSet, TransactionViewSet, OverflowViewSet

router = DefaultRouter()
router.register(r'ledgers', LedgerViewSet)
router.register(r'identifiers', IdentifierViewSet)
router.register(r'transactions', TransactionViewSet)
router.register(r'overflows', OverflowViewSet)

urlpatterns = [
    path('', include(router.urls)),
]