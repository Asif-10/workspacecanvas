from rest_framework.routers import DefaultRouter
from .views import FloorViewSet, DefaultSizeViewSet

router = DefaultRouter()
router.register(r"floors", FloorViewSet, basename="floor")
router.register(r"default-sizes", DefaultSizeViewSet, basename="defaultsize")

urlpatterns = router.urls