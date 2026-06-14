import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

import json
from floors.models import Floor
from floors.serializers import FloorSerializer


def seed(slug, name, json_path, is_default=False):
    with open(json_path, "r", encoding="utf-8") as f:
        objects = json.load(f)

    # strip any door imageSrc dev-paths; backend stores them as-is otherwise
    for o in objects:
        o.pop("iso", None)  # frontend-only field, not in our model

    Floor.objects.filter(slug=slug).delete()  # fresh each run
    data = {
        "slug": slug,
        "name": name,
        "building": "Dublin Office",
        "is_default": is_default,
        "objects": objects,
    }
    s = FloorSerializer(data=data)
    s.is_valid(raise_exception=True)
    s.save()
    print(f"Seeded '{slug}' with {len(objects)} objects.")


if __name__ == "__main__":
    seed("downstairs", "Downstairs", "downstairs.json", is_default=True)
    seed("upstairs", "Upstairs", "upstairs.json")
    print("Done.")