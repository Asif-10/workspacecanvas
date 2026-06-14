from rest_framework import serializers
from .models import Floor, FloorObject, DefaultSize


class FloorObjectSerializer(serializers.ModelSerializer):
    id = serializers.CharField(source="object_id")
    isBookable = serializers.BooleanField(source="is_bookable")
    layerGroup = serializers.CharField(source="layer_group", allow_blank=True)
    isVisible = serializers.BooleanField(source="is_visible")
    customColor = serializers.CharField(source="custom_color", allow_blank=True, required=False)
    imageSrc = serializers.CharField(source="image_src", allow_blank=True, required=False)

    class Meta:
        model = FloorObject
        fields = [
            "id", "type", "label", "x", "y", "w", "h", "rotation",
            "zone", "isBookable", "layerGroup", "isVisible",
            "customColor", "imageSrc",
        ]


class FloorSerializer(serializers.ModelSerializer):
    objects = FloorObjectSerializer(source="items", many=True)

    class Meta:
        model = Floor
        fields = ["slug", "name", "building", "is_default", "objects"]

    def create(self, validated_data):
        items = validated_data.pop("items", [])
        floor = Floor.objects.create(**validated_data)
        self._sync_items(floor, items)
        return floor

    def update(self, instance, validated_data):
        items = validated_data.pop("items", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if items is not None:
            self._sync_items(instance, items)
        return instance

    def _sync_items(self, floor, items):
        floor.items.all().delete()
        FloorObject.objects.bulk_create([
            FloorObject(floor=floor, **item) for item in items
        ])

class DefaultSizeSerializer(serializers.ModelSerializer):
    class Meta:
        model = DefaultSize
        fields = ["type", "w", "h"]