"""
Builds the Spotter écorché figure from the Z-Anatomy atlas (CC BY-SA 4.0, derived from BodyParts3D).

Run headless:
  Blender -b --disable-autoexec Startup.blend --python tools/anatomy/build_figure.py -- out.glb report.json

Steps
  1. Collect muscles, tendon insertions and bones; drop labels, fasciae, bursae and internal organs' muscles.
  2. Keep only surfaces visible from outside the body (ray-cast from many directions).
  3. Map each muscle to Spotter's muscle groups (see src/lib/exercise/muscles.ts).
  4. Decimate, add fibre UVs (u = around the muscle's long axis, v = along it, in metres).
  5. Build an armature from bone landmarks and skin every vertex with distance-based weights.
  6. Join by muscle group and export a skinned GLB (Y up, facing +Z, feet on the floor, 1.78 m tall).

Then compress for the web (~7 MB -> ~2 MB). Keep the quantization volume scene-wide: per-mesh volumes
put offsets on node transforms, which glTF ignores for skinned meshes.
  npx @gltf-transform/cli@4.5.1 meshopt out.glb public/models/ecorche.glb --quantization-volume scene
"""

import json
import math
import re
import sys

import bpy
import numpy as np
from mathutils import Vector
from mathutils.interpolate import poly_3d_calc
from mathutils.bvhtree import BVHTree

ARGS = sys.argv[sys.argv.index("--") + 1 :]
OUT_GLB, OUT_REPORT = ARGS[0], ARGS[1]

TARGET_HEIGHT = 1.78
TRIANGLE_BUDGET = 200_000
MIN_TRIS_PER_OBJECT = 300  # thin sheets collapse into holes below this
MIN_DECIMATE_POLYS = 60
PROXY_VOXEL = 0.014  # metres; small enough to keep arms and hands apart from the torso and thighs
MAX_INFLUENCES = 4
MIN_VISIBLE_FRACTION = 0.12  # muscles with less of their surface in view are deep layers
DEEP_INSET = 0.003  # metres; deep layers sit this far behind their rest surface
WEIGHT_SHARPNESS = 1.6  # >1 narrows joint blends so limbs keep their volume when bent
RAY_DIRECTIONS = 140
GRID_STEPS = 190

depsgraph = bpy.context.evaluated_depsgraph_get()

# ---------------------------------------------------------------- selection

LABEL = re.compile(r"\.[a-z]$|\.j$|\.i$")
SKIP_WORDS = (
    "bursa", "fascia", "septum", "sheath", "compartment", "fibrous", "synovial", "muscles of", "part of muscular",
    "arytenoid", "pharyn", "palat", "glossus", "tongue", "laryn", "thyro", "crico", "sphincter", "levator ani",
    "coccygeus", "pubococcygeus", "iliococcygeus", "perine", "diaphragm", "transversus thoracis", "subcostal",
    "innermost intercostal", "internal intercostal", "rotatores", "intertransvers", "interspinales", "multifidus",
    "levatores", "longus colli", "longus capitis", "rectus capitis", "obliquus capitis", "pterygoid", "stapedius",
    "tensor tympani", "tensor veli", "uvula", "rectus muscle", "oblique muscle of", "superior oblique",
    "inferior oblique", "levator palpebrae", "orbital", "auricular", "ciliary", "dartos", "cremaster", "bulbo",
    "ischiocavernosus", "urethra", "detrusor", "genio", "mylohyoid", "stylo", "digastric", "nasalis", "procerus",
    "tarsus", "tendinous ring", "ligament", "membrane",
)
TENDON_WORDS = ("tendon", "aponeurosis", "retinaculum", "tract", "linea alba", "galea")


def side_of(name: str):
    if name.endswith(".l") or re.search(r"\.[a-z0-9]*l$", name):
        return "l"
    if name.endswith(".r") or re.search(r"\.[a-z0-9]*r$", name):
        return "r"
    return None


def collection_objects(name):
    coll = bpy.data.collections.get(name)
    if coll is None:
        raise SystemExit(f"Collection not found: {name}")
    # Single-letter suffixes (.g, .j, ...) mark the atlas's text labels; .l/.r are body sides.
    return [
        o for o in coll.all_objects
        if o.type == "MESH" and len(o.data.vertices) > 20
        and not (LABEL.search(o.name) and not o.name.endswith((".l", ".r")))
    ]


def is_usable_muscle(name: str) -> bool:
    lower = name.lower()
    if name.startswith("(") or (LABEL.search(name) and not name.endswith((".l", ".r"))):
        return False
    return not any(w in lower for w in SKIP_WORDS)


muscles = [o for o in collection_objects("4: Muscular system") if is_usable_muscle(o.name)]
insertions = collection_objects("2: Muscular insertions")
bones = collection_objects("1: Skeletal system")
bones_by_name = {o.name: o for o in bones}

# ---------------------------------------------------------------- muscle groups

GROUP_RULES = [
    # leg-specific names first so "extensor digitorum longus" never lands in forearms
    (("gastrocnemius", "soleus", "plantaris"), ("calves",)),
    (("biceps femoris", "semitendinosus", "semimembranosus"), ("hamstrings",)),
    (("rectus femoris", "vastus"), ("quads",)),
    (("adductor longus", "adductor brevis", "adductor magnus", "adductor minimus", "gracilis", "pectineus"), ("adductors",)),
    (("gluteus maximus",), ("glutes",)),
    (("gluteus medius", "gluteus minimus"), ("glutes", "abductors")),
    (("tensor fasciae latae", "tensor of fascia lata"), ("abductors",)),
    (("pectoralis",), ("chest",)),
    (("clavicular part of deltoid", "anterior part of deltoid"), ("front_delts",)),
    (("spinal part of deltoid", "posterior part of deltoid"), ("rear_delts",)),
    (("deltoid",), ("side_delts",)),
    (("latissimus dorsi", "teres major"), ("lats",)),
    (("trapezius", "rhomboid", "infraspinatus", "supraspinatus", "teres minor", "levator scapulae"), ("upper_back",)),
    (("iliocostalis", "longissimus", "spinalis", "quadratus lumborum", "serratus posterior", "splenius"), ("lower_back",)),
    (("triceps brachii", "anconeus"), ("triceps",)),
    (("biceps brachii", "brachialis", "coracobrachialis"), ("biceps",)),
    (
        (
            "brachioradialis", "flexor carpi", "extensor carpi", "flexor digitorum superficialis",
            "flexor digitorum profundus", "extensor digitorum muscle", "extensor digiti minimi muscle", "pronator",
            "supinator", "palmaris", "flexor pollicis longus", "extensor pollicis", "abductor pollicis longus",
            "extensor indicis",
        ),
        ("forearms",),
    ),
    (("rectus abdominis", "pyramidalis", "transversus abdominis"), ("abs",)),
    (("abdominal oblique",), ("obliques",)),
]

ARM_GROUPS = {"biceps", "triceps", "forearms", "front_delts", "side_delts", "rear_delts"}
TORSO_GROUPS = {"chest", "abs", "obliques", "lats", "upper_back", "lower_back"}
LEG_GROUPS = {"quads", "hamstrings", "adductors", "calves", "glutes", "abductors"}


def groups_for(name: str):
    lower = name.lower()
    for words, groups in GROUP_RULES:
        if any(w in lower for w in words):
            return groups
    return ()


def is_tendon(name: str) -> bool:
    lower = name.lower()
    return any(w in lower for w in TENDON_WORDS)


# ---------------------------------------------------------------- world-space geometry


def world_mesh_arrays(obj):
    ev = obj.evaluated_get(depsgraph)
    mesh = ev.to_mesh()
    mesh.calc_loop_triangles()
    co = np.empty(len(mesh.vertices) * 3, dtype=np.float64)
    mesh.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    mw = np.array(obj.matrix_world)
    co = co @ mw[:3, :3].T + mw[:3, 3]
    tris = np.empty(len(mesh.loop_triangles) * 3, dtype=np.int64)
    mesh.loop_triangles.foreach_get("vertices", tris)
    ev.to_mesh_clear()
    return co, tris.reshape(-1, 3)


candidates = [("muscle", o) for o in muscles] + [("insertion", o) for o in insertions] + [("bone", o) for o in bones]
all_verts, all_tris, tri_owner = [], [], []
offset = 0
geometry = {}
for idx, (_, obj) in enumerate(candidates):
    co, tris = world_mesh_arrays(obj)
    geometry[obj.name] = co
    all_verts.append(co)
    all_tris.append(tris + offset)
    tri_owner.append(np.full(len(tris), idx, dtype=np.int32))
    offset += len(co)

V = np.concatenate(all_verts)
T = np.concatenate(all_tris)
owner = np.concatenate(tri_owner)
print(f"candidates={len(candidates)} verts={len(V)} tris={len(T)}")

lo, hi = V.min(axis=0), V.max(axis=0)
height = hi[2] - lo[2]
center = (lo + hi) / 2

# ---------------------------------------------------------------- visibility

bvh = BVHTree.FromPolygons(V.tolist(), T.tolist(), all_triangles=True)
hits = np.zeros(len(candidates), dtype=np.int64)
face_hit = np.zeros(len(T), dtype=bool)
golden = math.pi * (3 - math.sqrt(5))
radius = float(np.linalg.norm(hi - lo))
for i in range(RAY_DIRECTIONS):
    z = 1 - 2 * (i + 0.5) / RAY_DIRECTIONS
    if z < -0.85:
        continue  # skip views from under the floor
    r = math.sqrt(1 - z * z)
    d = np.array([math.cos(golden * i) * r, math.sin(golden * i) * r, z])
    a = np.array([0, 0, 1.0]) if abs(d[2]) < 0.9 else np.array([1.0, 0, 0])
    u = np.cross(d, a)
    u /= np.linalg.norm(u)
    w = np.cross(d, u)
    pu, pw = (V - center) @ u, (V - center) @ w
    step = height / GRID_STEPS
    origin_base = center - d * radius
    dir_v = Vector(d)
    for su in np.arange(pu.min(), pu.max(), step):
        for sw in np.arange(pw.min(), pw.max(), step):
            o = origin_base + u * su + w * sw
            _, _, face, _ = bvh.ray_cast(Vector(o), dir_v, radius * 2)
            if face is not None:
                hits[owner[face]] += 1
                face_hit[face] = True

# A deep muscle can be glimpsed through a gap at rest, then poke through the surface once posed.
# It still fills real gaps in the layer above, so keep it but inset it slightly (see DEEP_INSET).
tri_area = 0.5 * np.linalg.norm(np.cross(V[T[:, 1]] - V[T[:, 0]], V[T[:, 2]] - V[T[:, 0]]), axis=1)
area_total = np.bincount(owner, weights=tri_area, minlength=len(candidates))
area_seen = np.bincount(owner, weights=tri_area * face_hit, minlength=len(candidates))
seen_fraction = area_seen / np.maximum(area_total, 1e-12)
visible, deep = [], set()
for (kind, obj), h, f in zip(candidates, hits, seen_fraction):
    if h < 4:
        continue
    if kind == "muscle" and f < MIN_VISIBLE_FRACTION:
        deep.add(obj.name)
    visible.append((kind, obj))
print(f"visible={len(visible)} deep={len(deep)}")
print("DEEP", sorted(deep))

# ---------------------------------------------------------------- normalisation

scale = TARGET_HEIGHT / height


def landmark_points(name):
    return (geometry[name] - 0) if name in geometry else None


def region(points, axis, frac, top=True):
    vals = points[:, axis]
    span = vals.max() - vals.min()
    mask = vals >= vals.max() - span * frac if top else vals <= vals.min() + span * frac
    return points[mask]


def side_names(base):
    return {s: f"{base}.{s}" for s in ("l", "r")}


femur_l = geometry["Femur.l"]
left_sign = 1.0 if femur_l[:, 0].mean() > 0 else -1.0  # which world x side is the anatomical left


def hip_joint(femur):
    top = region(femur, 2, 0.1)
    medial = top[np.abs(top[:, 0]) <= np.median(np.abs(top[:, 0]))]
    return medial.mean(axis=0)


L = {}
for s in ("l", "r"):
    femur, tibia = geometry[f"Femur.{s}"], geometry[f"Tibia.{s}"]
    humerus = geometry[f"Humerus.{s}"]
    L[f"hip.{s}"] = hip_joint(femur)
    L[f"knee.{s}"] = (region(femur, 2, 0.06, top=False).mean(0) + region(tibia, 2, 0.06).mean(0)) / 2
    L[f"ankle.{s}"] = geometry[f"Talus.{s}"].mean(0)
    L[f"toe.{s}"] = geometry[f"Distal phalanx of third finger of foot.{s}"].mean(0)
    L[f"shoulder.{s}"] = region(humerus, 2, 0.08).mean(0)
    L[f"elbow.{s}"] = region(humerus, 2, 0.06, top=False).mean(0)
    L[f"wrist.{s}"] = (
        region(geometry[f"Radius.{s}"], 2, 0.05, top=False).mean(0)
        + region(geometry[f"Ulna.{s}"], 2, 0.05, top=False).mean(0)
    ) / 2
    L[f"fingertip.{s}"] = geometry[f"Distal phalanx of third finger of hand.{s}"].mean(0)

pelvis = (L["hip.l"] + L["hip.r"]) / 2
sacrum = geometry["Sacrum"].mean(0)
atlas = geometry["Atlas (C1)"].mean(0)
manubrium_top = region(geometry["Manubrium of sternum"], 2, 0.1).mean(0)

# Normalise: scale to target height, feet on the floor, hips centred on x/y.
shift = np.array([-pelvis[0], -pelvis[1], -lo[2]])


def norm(p):
    return (np.asarray(p) + shift) * scale


L = {k: norm(v) for k, v in L.items()}
pelvis, sacrum, atlas, manubrium_top = norm(pelvis), norm(sacrum), norm(atlas), norm(manubrium_top)

spine_y = lambda z: np.interp(z, [sacrum[2], atlas[2]], [sacrum[1], atlas[1]])  # noqa: E731
waist = np.array([0, spine_y(pelvis[2] + 0.06), pelvis[2] + 0.06])
chest_z = waist[2] + (manubrium_top[2] - waist[2]) * 0.55
chest = np.array([0, spine_y(chest_z), chest_z])
neck = np.array([0, spine_y(manubrium_top[2]), manubrium_top[2]])
head_top = atlas + np.array([0, 0, 0.18])

SIDE = {"l": "L", "r": "R"}
BONES = {
    "hips": (pelvis, waist, None),
    "spine": (waist, chest, "hips"),
    "chest": (chest, neck, "spine"),
    "neck": (neck, atlas, "chest"),
    "head": (atlas, head_top, "neck"),
}
for s, S in SIDE.items():
    BONES[f"upper_arm_{S}"] = (L[f"shoulder.{s}"], L[f"elbow.{s}"], "chest")
    BONES[f"forearm_{S}"] = (L[f"elbow.{s}"], L[f"wrist.{s}"], f"upper_arm_{S}")
    BONES[f"hand_{S}"] = (L[f"wrist.{s}"], L[f"fingertip.{s}"], f"forearm_{S}")
    BONES[f"thigh_{S}"] = (L[f"hip.{s}"], L[f"knee.{s}"], "hips")
    BONES[f"shin_{S}"] = (L[f"knee.{s}"], L[f"ankle.{s}"], f"thigh_{S}")
    BONES[f"foot_{S}"] = (L[f"ankle.{s}"], L[f"toe.{s}"], f"shin_{S}")

# ---------------------------------------------------------------- armature

for o in list(bpy.context.view_layer.objects):
    o.select_set(False)
arm_data = bpy.data.armatures.new("SpotterRig")
arm = bpy.data.objects.new("SpotterRig", arm_data)
export_coll = bpy.data.collections.new("SpotterExport")
bpy.context.scene.collection.children.link(export_coll)
export_coll.objects.link(arm)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode="EDIT")
for name, (head, tail, parent) in BONES.items():
    eb = arm_data.edit_bones.new(name)
    eb.head, eb.tail = Vector(head), Vector(tail)
for name, (_, _, parent) in BONES.items():
    if parent:
        arm_data.edit_bones[name].parent = arm_data.edit_bones[parent]
bpy.ops.object.mode_set(mode="OBJECT")

BONE_NAMES = list(BONES.keys())


def split_bone(name):
    """'upper_arm_L' -> ('upper_arm', 'L'); 'spine' -> ('spine', '')."""
    if name.endswith(("_L", "_R")):
        return name[:-2], name[-1]
    return name, ""
heads = np.array([BONES[n][0] for n in BONE_NAMES])
tails = np.array([BONES[n][1] for n in BONE_NAMES])


def allowed_bones(groups, side):
    """Bones that may influence a muscle, to stop arms dragging the torso and so on."""
    central = {"hips", "spine", "chest", "neck", "head"}
    g = set(groups)
    if g & ARM_GROUPS:
        names = {"chest", "upper_arm", "forearm", "hand"}
    elif g & TORSO_GROUPS:
        names = {"hips", "spine", "chest", "neck", "upper_arm"}
    elif g & LEG_GROUPS:
        names = {"hips", "spine", "thigh", "shin", "foot"}
    else:
        names = central | {"upper_arm", "forearm", "hand", "thigh", "shin", "foot"}
    out = []
    for i, n in enumerate(BONE_NAMES):
        base, sfx = split_bone(n)
        if base not in names:
            continue
        if sfx and side and sfx != SIDE[side]:
            continue
        out.append(i)
    return out


def segment_distance(p, a, b):
    ab = b - a
    t = np.clip(((p - a) @ ab) / (ab @ ab), 0, 1)
    return np.linalg.norm(p - (a + t[:, None] * ab), axis=1)


def skin_weights(points, groups, side):
    idx = allowed_bones(groups, side)
    if side is None:
        # midline objects: decide per vertex by x so left and right halves follow their own limb
        idx = allowed_bones(groups, None)
    d = np.stack([segment_distance(points, heads[i], tails[i]) for i in idx], axis=1)
    if side is None:
        for col, i in enumerate(idx):
            sfx = split_bone(BONE_NAMES[i])[1]
            if sfx:
                wrong = (points[:, 0] * left_sign < -0.03) if sfx == "L" else (points[:, 0] * left_sign > 0.03)
                d[wrong, col] = 10.0
    w = 1.0 / (d + 0.01) ** 5
    top = np.argsort(-w, axis=1)[:, :3]
    rows = np.arange(len(points))[:, None]
    tw = w[rows, top]
    tw /= tw.sum(axis=1, keepdims=True)
    return [idx[c] for c in range(len(idx))], top, tw


# ---------------------------------------------------------------- per-object processing

# Share the triangle budget by surface area, not by source density: the atlas models big flat
# sheets (trapezius, lats) sparsely, so a uniform ratio starves them into holes.
def surface_area(obj):
    co, tris = world_mesh_arrays(obj)
    a, b, c = co[tris[:, 0]], co[tris[:, 1]], co[tris[:, 2]]
    return 0.5 * np.linalg.norm(np.cross(b - a, c - a), axis=1).sum(), len(tris)


stats = {o.name: surface_area(o) for _, o in visible}
total_area = sum(a for a, _ in stats.values())
target = {}
for name, (area, n) in stats.items():
    target[name] = min(n, max(MIN_TRIS_PER_OBJECT, TRIANGLE_BUDGET * area / total_area))
# Rescale the area-driven share so the total lands on budget (floors and caps distort it).
for _ in range(4):
    free = [k for k, (_, n) in stats.items() if MIN_TRIS_PER_OBJECT < target[k] < n]
    fixed = sum(v for k, v in target.items() if k not in free)
    flexible = sum(target[k] for k in free)
    if not flexible:
        break
    f = (TRIANGLE_BUDGET - fixed) / flexible
    for k in free:
        target[k] = min(stats[k][1], max(MIN_TRIS_PER_OBJECT, target[k] * f))
ratios = {k: target[k] / max(1, stats[k][1]) for k in stats}
print(f"visible tris={sum(n for _, n in stats.values())} target={int(sum(target.values()))}")

buckets = {}
report_groups = {}
pending = []  # (object, normalised vertex positions), skinned together below
for kind, src in visible:
    groups = groups_for(src.name) if kind == "muscle" and not is_tendon(src.name) else ()
    material = "tendon" if kind != "muscle" or is_tendon(src.name) else "muscle"
    key = "tendon" if material == "tendon" else ("muscle_" + "+".join(groups) if groups else "muscle_other")
    side = side_of(src.name)

    tmp = src.copy()
    tmp.data = src.data.copy()
    export_coll.objects.link(tmp)
    if ratios[src.name] < 0.999 and len(tmp.data.polygons) > MIN_DECIMATE_POLYS:
        mod = tmp.modifiers.new("dec", "DECIMATE")
        mod.ratio = ratios[src.name]
    bpy.context.view_layer.update()
    ev = tmp.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = bpy.data.meshes.new_from_object(ev)
    bpy.data.objects.remove(tmp)

    co = np.empty(len(mesh.vertices) * 3)
    mesh.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    mw = np.array(src.matrix_world)
    co = ((co @ mw[:3, :3].T + mw[:3, 3]) + shift) * scale
    mesh.vertices.foreach_set("co", co.ravel())
    if np.linalg.det(mw[:3, :3]) < 0:
        # The atlas mirrors one side with a negative scale; baking it in turns the faces inside out.
        mesh.flip_normals()
    mesh.update()
    if src.name in deep:
        normals = np.empty(len(mesh.vertices) * 3)
        mesh.vertex_normals.foreach_get("vector", normals)
        co = co - normals.reshape(-1, 3) * DEEP_INSET
        mesh.vertices.foreach_set("co", co.ravel())
        mesh.update()

    # Fibre UVs: cylinder around the principal axis.
    c = co.mean(0)
    _, sv, vt = np.linalg.svd(co - c, full_matrices=False)
    axis, b1, b2 = vt[0], vt[1], vt[2]
    rel = co - c
    along = rel @ axis
    sheet = sv[1] > 2.5 * sv[2]  # flat muscles (lats, trapezius, obliques): fibres run across the sheet
    if sheet:
        ang = (rel @ b1) / 0.0035 * (2 * math.pi)  # one fibre every 3.5 mm across the sheet
        fibres = 1
    else:
        ang = np.arctan2(rel @ b2, rel @ b1)
        radius_m = np.sqrt((rel @ b1) ** 2 + (rel @ b2) ** 2).mean()
        fibres = max(6, round(2 * math.pi * radius_m / 0.0035))
    while mesh.uv_layers:  # drop the atlas's own UVs so TEXCOORD_0 is always the fibre map
        mesh.uv_layers.remove(mesh.uv_layers[0])
    uv_layer = mesh.uv_layers.new(name="UVMap")
    loop_v = np.empty(len(mesh.loops), dtype=np.int64)
    mesh.loops.foreach_get("vertex_index", loop_v)
    loop_start = np.empty(len(mesh.polygons), dtype=np.int64)
    mesh.polygons.foreach_get("loop_start", loop_start)
    loop_total = np.empty(len(mesh.polygons), dtype=np.int64)
    mesh.polygons.foreach_get("loop_total", loop_total)
    u = ang[loop_v] / (2 * math.pi)
    poly_of_loop = np.repeat(np.arange(len(loop_start)), loop_total)
    first_u = u[loop_start][poly_of_loop]
    if not sheet:
        u = u - np.round(u - first_u)  # unwrap across the seam within each face
    uv = np.stack([u * fibres, along[loop_v]], axis=1)
    uv_layer.data.foreach_set("uv", uv.ravel())

    obj = bpy.data.objects.new(f"{key}|{src.name}", mesh)
    export_coll.objects.link(obj)
    pending.append((obj, co))
    if hasattr(mesh, "shade_smooth"):
        mesh.shade_smooth()
    buckets.setdefault(key, []).append(obj)
    report_groups.setdefault(key, []).append(src.name)

# ---------------------------------------------------------------- skinning via a proxy body
#
# Weighting each muscle on its own lets touching muscles follow different bones, so they tear
# apart when posed. Instead: voxel-remesh every part into one watertight proxy, let Blender's
# bone-heat solver weight it, and give every vertex the weights of the nearest proxy surface.

all_co = np.concatenate([co for _, co in pending])
proxy_tris, base = [], 0
for obj, co in pending:
    obj.data.calc_loop_triangles()
    t = np.empty(len(obj.data.loop_triangles) * 3, dtype=np.int64)
    obj.data.loop_triangles.foreach_get("vertices", t)
    proxy_tris.append(t.reshape(-1, 3) + base)
    base += len(co)
raw = bpy.data.meshes.new("proxy_raw")
raw.from_pydata(all_co.tolist(), [], np.concatenate(proxy_tris).tolist())
proxy = bpy.data.objects.new("proxy", raw)
export_coll.objects.link(proxy)
remesh = proxy.modifiers.new("remesh", "REMESH")
remesh.mode = "VOXEL"
remesh.voxel_size = PROXY_VOXEL
bpy.context.view_layer.update()
proxy_mesh = bpy.data.meshes.new_from_object(proxy.evaluated_get(bpy.context.evaluated_depsgraph_get()))
proxy.modifiers.clear()
proxy.data = proxy_mesh
bpy.data.meshes.remove(raw)
print(f"proxy verts={len(proxy_mesh.vertices)}")

for o in bpy.context.view_layer.objects:
    o.select_set(False)
proxy.select_set(True)
arm.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.parent_set(type="ARMATURE_AUTO")

PW = np.zeros((len(proxy_mesh.vertices), len(BONE_NAMES)))
group_bone = {g.index: BONE_NAMES.index(g.name) for g in proxy.vertex_groups if g.name in BONE_NAMES}
for v in proxy_mesh.vertices:
    for g in v.groups:
        if g.group in group_bone:
            PW[v.index, group_bone[g.group]] = g.weight
pco = np.array([v.co[:] for v in proxy_mesh.vertices])
empty = PW.sum(axis=1) < 1e-6
if empty.any():
    # Bone heat can miss isolated islands; fall back to distance weights there.
    idx, top, tw = skin_weights(pco[empty], (), None)
    rows = np.where(empty)[0]
    for col in range(top.shape[1]):
        PW[rows, np.array(idx)[top[:, col]]] += tw[:, col]
print(f"proxy unweighted by bone heat: {int(empty.sum())}")
PW = PW ** WEIGHT_SHARPNESS
PW /= np.maximum(PW.sum(axis=1, keepdims=True), 1e-12)

proxy_polys = [list(p.vertices) for p in proxy_mesh.polygons]
proxy_bvh = BVHTree.FromPolygons(pco.tolist(), proxy_polys)
far = 0
for obj, co in pending:
    W = np.zeros((len(co), len(BONE_NAMES)))
    for i, p in enumerate(co):
        loc, _, face, dist = proxy_bvh.find_nearest(Vector(p))
        if face is None:
            continue
        if dist > PROXY_VOXEL * 3:
            far += 1
        verts = proxy_polys[face]
        bary = poly_3d_calc([Vector(pco[v]) for v in verts], loc)
        W[i] = np.asarray(bary) @ PW[verts]
    top = np.argsort(-W, axis=1)[:, :MAX_INFLUENCES]
    rows = np.arange(len(co))[:, None]
    tw = W[rows, top]
    tw[tw < 0.02] = 0
    tw /= np.maximum(tw.sum(axis=1, keepdims=True), 1e-9)
    groups_out = {}
    for col in range(MAX_INFLUENCES):
        for v_i in np.nonzero(tw[:, col])[0]:
            groups_out.setdefault(int(top[v_i, col]), []).append((int(v_i), float(tw[v_i, col])))
    for b, items in groups_out.items():
        vg = obj.vertex_groups.new(name=BONE_NAMES[b])
        for v_i, wt in items:
            vg.add([v_i], wt, "REPLACE")
print(f"vertices far from proxy: {far}")
bpy.data.objects.remove(proxy)

# ---------------------------------------------------------------- join and skin

joined = []
for key, objs in buckets.items():
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    target = bpy.context.view_layer.objects.active
    target.name = key
    target.data.name = key
    target.data.validate(clean_customdata=False)
    target.parent = arm
    mod = target.modifiers.new("Armature", "ARMATURE")
    mod.object = arm
    joined.append(target)

for o in bpy.context.view_layer.objects:
    o.select_set(False)
arm.select_set(True)
for o in joined:
    o.select_set(True)
bpy.context.view_layer.objects.active = arm

# Keep the rigged scene for inspection and quick re-exports.
# Saved beside the report, never beside the GLB (which lives in public/).
bpy.ops.wm.save_as_mainfile(filepath=OUT_REPORT.rsplit(".", 1)[0] + ".blend", copy=True)

bpy.ops.export_scene.gltf(
    filepath=OUT_GLB,
    export_format="GLB",
    use_selection=True,
    export_apply=False,
    export_yup=True,
    export_texcoords=True,
    export_leaf_bone=False,
    export_normals=True,
    export_skins=True,
    export_animations=False,
    export_morph=False,
    export_materials="NONE",
    export_def_bones=False,
)

tri_count = 0
for o in joined:
    o.data.calc_loop_triangles()
    tri_count += len(o.data.loop_triangles)

with open(OUT_REPORT, "w") as f:
    json.dump(
        {
            "source_height": float(height),
            "scale": float(scale),
            "left_sign": left_sign,
            "triangles": tri_count,
            "meshes": {k: len(v) for k, v in report_groups.items()},
            "muscles": report_groups,
            "bones": {n: {"head": list(map(float, h)), "tail": list(map(float, t))} for n, (h, t, _) in BONES.items()},
        },
        f,
        indent=1,
    )
print(f"exported {OUT_GLB} triangles={tri_count}")
