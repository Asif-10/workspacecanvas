from django.contrib import admin
from .models import Floor, FloorObject


class FloorObjectInline(admin.TabularInline):
    model = FloorObject
    extra = 0


@admin.register(Floor)
class FloorAdmin(admin.ModelAdmin):
    list_display = ("slug", "name", "building", "is_default")
    inlines = [FloorObjectInline]


@admin.register(FloorObject)
class FloorObjectAdmin(admin.ModelAdmin):
    list_display = ("object_id", "type", "label", "floor", "is_bookable")
    list_filter = ("floor", "type", "is_bookable")
    search_fields = ("object_id", "label")