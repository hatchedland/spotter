"""Dump the object/collection structure of the Z-Anatomy blend to JSON (run headless in Blender)."""
import json
import sys

import bpy

out_path = sys.argv[sys.argv.index("--") + 1]


def walk(collection, path):
    rows = []
    for obj in collection.objects:
        rows.append(
            {
                "name": obj.name,
                "type": obj.type,
                "collection": path,
                "verts": len(obj.data.vertices) if obj.type == "MESH" else 0,
                "parent": obj.parent.name if obj.parent else None,
            }
        )
    for child in collection.children:
        rows.extend(walk(child, f"{path}/{child.name}"))
    return rows


rows = walk(bpy.context.scene.collection, "")
with open(out_path, "w") as f:
    json.dump(rows, f, indent=1)
print("objects:", len(rows))
