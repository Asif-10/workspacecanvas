from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework import status

from .models import Floor, DefaultSize
from .serializers import FloorSerializer, DefaultSizeSerializer


class FloorViewSet(viewsets.ModelViewSet):
    queryset = Floor.objects.all()
    serializer_class = FloorSerializer
    lookup_field = "slug"

   
    @action(detail=False, methods=["get"])
    def default(self, request):
        floor = Floor.objects.filter(is_default=True).first()
        if not floor:
            floor = Floor.objects.first()
        if not floor:
            return Response(
                {"detail": "No floors exist yet."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(self.get_serializer(floor).data)

   
    @action(detail=True, methods=["put"])
    def layout(self, request, slug=None):
        floor = self.get_object()
        serializer = self.get_serializer(floor, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)
    
class DefaultSizeViewSet(viewsets.ModelViewSet):
    queryset = DefaultSize.objects.all()
    serializer_class = DefaultSizeSerializer
    lookup_field = "type"

    def update(self, request, *args, **kwargs):
        # "Set as default" — create the row if it doesn't exist yet, else update it
        type_value = kwargs.get("type")
        obj, _ = DefaultSize.objects.get_or_create(
            type=type_value,
            defaults={"w": request.data.get("w", 0), "h": request.data.get("h", 0)},
        )
        obj.w = request.data.get("w", obj.w)
        obj.h = request.data.get("h", obj.h)
        obj.save()
        return Response(self.get_serializer(obj).data)