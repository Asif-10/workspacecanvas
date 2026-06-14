from django.db import models


class Floor(models.Model):
    slug = models.SlugField(max_length=60, unique=True)
    name = models.CharField(max_length=120)
    building = models.CharField(max_length=120, blank=True, default="")
    is_default = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["id"]

    def __str__(self):
        return f"{self.name} ({self.slug})"


class FloorObject(models.Model):
    floor = models.ForeignKey(
        Floor, related_name="items", on_delete=models.CASCADE
    )
    object_id = models.CharField(max_length=60)
    type = models.CharField(max_length=40)
    label = models.CharField(max_length=160, blank=True, default="")
    x = models.FloatField()
    y = models.FloatField()
    w = models.FloatField()
    h = models.FloatField()
    rotation = models.FloatField(default=0)
    zone = models.CharField(max_length=80, blank=True, default="Common Area")
    is_bookable = models.BooleanField(default=False)
    layer_group = models.CharField(max_length=40, blank=True, default="")
    is_visible = models.BooleanField(default=True)
    custom_color = models.CharField(max_length=20, blank=True, default="")
    image_src = models.CharField(max_length=300, blank=True, default="")

    class Meta:
        ordering = ["id"]
        indexes = [
            models.Index(fields=["floor", "is_bookable"]),
        ]

    def __str__(self):
        return f"{self.type}:{self.object_id} on {self.floor.slug}"

class DefaultSize(models.Model):
    type = models.CharField(max_length=40, unique=True)
    w = models.FloatField()
    h = models.FloatField()

    def __str__(self):
        return f"{self.type}: {self.w}x{self.h}"