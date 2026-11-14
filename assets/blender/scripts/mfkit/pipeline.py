"""MissionForge kit: registry, Blender object creation, validation and export."""
from __future__ import annotations

import fnmatch
import json
import math
import os
from dataclasses import dataclass, field
from typing import Callable

import bpy
from mathutils import Vector

from .core import SLOTS, MeshBuilder

# --------------------------------------------------------------------------- paths
SCRIPTS_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BLENDER_DIR = os.path.dirname(SCRIPTS_DIR)                      # assets/blender
REPO_DIR = os.path.dirname(os.path.dirname(BLENDER_DIR))
FBX_DIR = os.path.join(REPO_DIR, "unity", "MissionForge", "Assets", "Art", "Models")
GLB_DIR = os.path.join(REPO_DIR, "client", "public", "models")
BUILD_DIR = os.path.join(BLENDER_DIR, "_build")                 # git-ignored scratch
MANIFEST_PATH = os.path.join(BLENDER_DIR, "kit_manifest.json")

# --------------------------------------------------------------------------- budgets
HOST_TRI_BUDGET = 30000
LOD1_RATIO = 0.30
PHONE_TRI_BUDGET = 8000
PHONE_BYTES_BUDGET = 2 * 1024 * 1024

# --------------------------------------------------------------------------- materials
# Default look of each slot (Principled BSDF). The game swaps / recolours these.
MATERIAL_LOOK = {
    # Linear RGB. Matches assets/media/style/STYLE_GUIDE.md (task T005): ceramic-white
    # painted shell (#E8EEF0), ocean accent (#176887), cool silver structure, dark warm
    # graphite bells, muted warm insulation. All game_value art choices.
    "hull": dict(color=(0.807, 0.855, 0.871), metallic=0.0, roughness=0.46),
    "livery": dict(color=(0.0086, 0.138, 0.242), metallic=0.0, roughness=0.40),
    "engine_metal": dict(color=(0.50, 0.52, 0.55), metallic=0.92, roughness=0.36),
    "nozzle_hot": dict(color=(0.17, 0.135, 0.115), metallic=0.82, roughness=0.50),
    "thermal": dict(color=(0.60, 0.33, 0.11), metallic=0.0, roughness=0.82),
    "detail_dark": dict(color=(0.022, 0.030, 0.040), metallic=0.15, roughness=0.62),
}


def get_material(name: str) -> bpy.types.Material:
    mat = bpy.data.materials.get(name)
    if mat is not None and mat.get("mfkit"):
        return mat
    look = MATERIAL_LOOK[name]
    mat = bpy.data.materials.new(name)
    mat["mfkit"] = True
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*look["color"], 1.0)
    bsdf.inputs["Metallic"].default_value = look["metallic"]
    bsdf.inputs["Roughness"].default_value = look["roughness"]
    mat.diffuse_color = (*look["color"], 1.0)
    mat.metallic = look["metallic"]
    mat.roughness = look["roughness"]
    return mat


# --------------------------------------------------------------------------- registry
@dataclass
class PartDef:
    id: str
    family: str
    gen: Callable
    design_ref: str = ""
    params: dict = field(default_factory=dict)


PARTS: dict[str, PartDef] = {}


def register(part_id: str, family: str, gen: Callable, design_ref: str = "", **params) -> None:
    """Register a part generator. gen(ctx) builds geometry through ctx.mesh()."""
    PARTS[part_id] = PartDef(part_id, family, gen, design_ref, params)


def part_ids(patterns=None) -> list[str]:
    load_all()
    if not patterns:
        return list(PARTS)
    out = []
    for pid in PARTS:
        if any(fnmatch.fnmatch(pid, p) for p in patterns):
            out.append(pid)
    return out


_LOADED = False
PART_MODULES = ["parts_engines_s1", "parts_engines_s1b", "parts_engines_s2", "parts_tanks", "parts_structures",
                "parts_fairings", "parts_boosters"]


def load_all(reload: bool = False) -> None:
    """Import every parts_* module that exists so their register() calls run."""
    global _LOADED
    if _LOADED and not reload:
        return
    import importlib
    for mod in PART_MODULES:
        path = os.path.join(os.path.dirname(os.path.abspath(__file__)), mod + ".py")
        if not os.path.exists(path):
            continue
        m = importlib.import_module("mfkit." + mod)
        if reload:
            importlib.reload(m)
    _LOADED = True


class PartCtx:
    """Handed to a generator. One call per LOD."""

    def __init__(self, part: PartDef, lod: int):
        self.id = part.id
        self.params = part.params
        self.lod = lod
        self.meshes: dict[str, MeshBuilder] = {}
        self.empties: dict[str, dict] = {}
        self.meta: dict = {}

    def mesh(self, sub: str = "") -> MeshBuilder:
        """Mesh builder of the main object (sub='') or of a separable sub-object."""
        if sub not in self.meshes:
            self.meshes[sub] = MeshBuilder(self.lod)
        return self.meshes[sub]

    def empty(self, name: str, loc, sub: str = "") -> None:
        """Attach point. Identity rotation: local +Z is the stack's up axis."""
        self.empties[name] = dict(loc=tuple(float(c) for c in loc), sub=sub)


def generate(part_id: str, lod: int) -> PartCtx:
    load_all()
    part = PARTS[part_id]
    ctx = PartCtx(part, lod)
    part.gen(ctx)
    ctx.meta.setdefault("family", part.family)
    ctx.meta.setdefault("design_ref", part.design_ref)
    return ctx


# --------------------------------------------------------------------------- blender objects
def tri_count(me: bpy.types.Mesh) -> int:
    return sum(len(p.vertices) - 2 for p in me.polygons)


def builder_to_mesh(mb: MeshBuilder, name: str) -> bpy.types.Mesh:
    me = bpy.data.meshes.new(name)
    me.from_pydata(mb.v, [], mb.f)
    used = sorted(set(mb.fm))
    remap = {slot: i for i, slot in enumerate(used)}
    for slot in used:
        me.materials.append(get_material(SLOTS[slot]))
    me.polygons.foreach_set("material_index", [remap[m] for m in mb.fm])
    me.polygons.foreach_set("use_smooth", mb.fs)
    uv_layer = me.uv_layers.new(name="UVMap")
    flat = []
    for face, uvs in zip(mb.f, mb.uv):
        if uvs is None:
            # planar fallback in metres from the two dominant axes of the face
            cs = [mb.v[i] for i in face]
            n = (Vector(cs[1]) - Vector(cs[0])).cross(Vector(cs[-1]) - Vector(cs[0]))
            ax = max(range(3), key=lambda k: abs(n[k]))
            ua, va = [(1, 2), (0, 2), (0, 1)][ax]
            uvs = [(c[ua], c[va]) for c in cs]
        for u, v in uvs:
            flat.extend((u, v))
    uv_layer.data.foreach_set("uv", flat)
    if SLOTS.index("nozzle_hot") in used and any(h > 0 for h in mb.heat):
        col = me.color_attributes.new("heat", "BYTE_COLOR", "CORNER")
        cflat = []
        for face in mb.f:
            for vi in face:
                cflat.extend((mb.heat[vi], 0.0, 0.0, 1.0))
        col.data.foreach_set("color", cflat)
    me.validate(clean_customdata=False)
    me.update()
    return me


def _link(obj, collection):
    collection.objects.link(obj)
    return obj


def _decimate_to(obj: bpy.types.Object, target_tris: int) -> None:
    """Collapse-decimate obj's mesh in place to at most target_tris triangles."""
    for _ in range(4):
        cur = tri_count(obj.data)
        if cur <= target_tris:
            return
        mod = obj.modifiers.new("mf_decimate", "DECIMATE")
        mod.ratio = max(0.02, target_tris / cur * 0.97)
        deps = bpy.context.evaluated_depsgraph_get()
        deps.update()
        new_me = bpy.data.meshes.new_from_object(obj.evaluated_get(deps))
        obj.modifiers.clear()
        old = obj.data
        new_me.name = old.name
        obj.data = new_me
        bpy.data.meshes.remove(old)


def instantiate(part_id: str, *, lods=(0, 1), prefix: str = "", collection=None, scene=None,
                mesh_cache: dict | None = None) -> dict:
    """Build a part as Blender objects.

    Returns dict(root, lod={0: [objs], 1: [objs]}, empties={name: obj}, meta, tris={lod: n}).
    Hierarchy: root empty <id> -> <id>_LOD0, <id>_LOD1, attach empties. Separable
    sub-objects (fairing halves) sit under their own empty <sub>."""
    scene = scene or bpy.context.scene
    collection = collection or scene.collection
    ctx0 = generate(part_id, 0)
    root = _link(bpy.data.objects.new(prefix + part_id, None), collection)
    root.empty_display_type = "PLAIN_AXES"
    span = max((max(abs(c) for c in v) for mb in ctx0.meshes.values() for v in mb.v), default=1.0)
    root.empty_display_size = max(0.05, span * 0.06)
    root["mf_part_id"] = part_id
    sub_parent = {"": root}
    for sub in ctx0.meshes:
        if sub:
            e = _link(bpy.data.objects.new(prefix + sub, None), collection)
            e.parent = root
            e.empty_display_type = "PLAIN_AXES"
            e.empty_display_size = root.empty_display_size
            sub_parent[sub] = e
    result = dict(root=root, lod={}, empties={}, meta=ctx0.meta, tris={}, subs=sub_parent)
    for lod in lods:
        ctx = ctx0 if lod == 0 else generate(part_id, lod)
        objs = []
        for sub, mb in ctx.meshes.items():
            base = part_id + (("_" + sub) if sub else "")
            name = f"{prefix}{base}_LOD{lod}"
            if mesh_cache is not None:
                # assemblies share one mesh datablock per (part, sub-object, LOD)
                ckey = (part_id, sub, lod)
                if ckey not in mesh_cache:
                    mesh_cache[ckey] = builder_to_mesh(mb, f"{base}_LOD{lod}")
                me = mesh_cache[ckey]
            else:
                me = builder_to_mesh(mb, name)
            ob = _link(bpy.data.objects.new(name, me), collection)
            ob.parent = sub_parent[sub]
            objs.append(ob)
        result["lod"][lod] = objs
    if 0 in result["lod"] and 1 in result["lod"]:
        t0 = sum(tri_count(o.data) for o in result["lod"][0])
        limit = max(int(t0 * LOD1_RATIO), 200)
        t1 = sum(tri_count(o.data) for o in result["lod"][1])
        if t1 > limit:
            for o in result["lod"][1]:
                _decimate_to(o, int(tri_count(o.data) * limit / t1))
    for lod, objs in result["lod"].items():
        result["tris"][lod] = sum(tri_count(o.data) for o in objs)
    for name, e in ctx0.empties.items():
        ob = _link(bpy.data.objects.new(prefix + name, None), collection)
        ob.parent = sub_parent[e["sub"]]
        ob.location = e["loc"]
        ob.empty_display_type = "ARROWS"
        ob.empty_display_size = max(0.05, span * 0.08)
        result["empties"][name] = ob
    return result


# --------------------------------------------------------------------------- validation
def _world_bbox(objs):
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for o in objs:
        for v in o.data.vertices:
            for k in range(3):
                lo[k] = min(lo[k], v.co[k])
                hi[k] = max(hi[k], v.co[k])
    return lo, hi


def _ring_radius(objs, z, tol=0.004):
    r = 0.0
    for o in objs:
        for v in o.data.vertices:
            if abs(v.co.z - z) <= tol:
                r = max(r, math.hypot(v.co.x, v.co.y))
    return r


def validate(part_id: str, inst: dict) -> list[str]:
    """Check a built part against the modular standard. Returns a list of problems."""
    issues = []
    meta = inst["meta"]
    family = meta.get("family", "")
    lod0 = inst["lod"].get(0, [])
    lo, hi = _world_bbox(lod0)
    for key in ("length_m", "diameter_bottom_m", "diameter_top_m"):
        if key not in meta:
            issues.append(f"meta missing {key}")
    if "attach_top" not in inst["empties"]:
        issues.append("missing empty attach_top")
    else:
        at = inst["empties"]["attach_top"].location
        if abs(at.x) > 1e-4 or abs(at.y) > 1e-4:
            issues.append("attach_top not on the axis")
        if "length_m" in meta and abs(at.z - meta["length_m"]) > 1e-3:
            issues.append(f"attach_top z {at.z:.3f} != length_m {meta['length_m']}")
    if family.startswith("engine"):
        for name in ("nozzle_exit", "gimbal_pivot"):
            if name not in inst["empties"]:
                issues.append(f"engine missing empty {name}")
    if family == "booster" and "attach_side" not in inst["empties"]:
        issues.append("booster missing empty attach_side")
    if family.startswith("mount"):
        n = meta.get("engine_count", 0)
        for i in range(1, n + 1):
            if f"attach_engine_{i}" not in inst["empties"]:
                issues.append(f"mount missing attach_engine_{i}")
    if lo.z < -1e-3:
        issues.append(f"geometry below the origin plane: min z {lo.z:.3f}")
    if meta.get("stack", True) and "length_m" in meta:
        length = meta["length_m"]
        if hi.z > length + 1e-3:
            issues.append(f"geometry above attach_top: max z {hi.z:.3f} > {length}")
        if abs(hi.z - length) > 1e-3 and not family.startswith("engine"):
            issues.append(f"top of mesh {hi.z:.3f} does not reach attach_top {length}")
        for key, z in (("diameter_bottom_m", 0.0), ("diameter_top_m", length)):
            if key in meta and meta.get("ring_check", True):
                r = _ring_radius(lod0, z)
                if abs(r - meta[key] / 2.0) > 0.003:
                    issues.append(f"mating ring at z={z:g}: radius {r:.3f}, expected {meta[key] / 2.0:.3f}")
    for o in lod0:
        for m in o.data.materials:
            if m is None or m.name not in SLOTS:
                issues.append(f"unknown material {m.name if m else None}")
    t0, t1 = inst["tris"].get(0, 0), inst["tris"].get(1, 0)
    if t0 > HOST_TRI_BUDGET:
        issues.append(f"LOD0 {t0} tris over host budget {HOST_TRI_BUDGET}")
    if 1 in inst["tris"] and t1 > max(int(t0 * LOD1_RATIO), 200) + 2:
        issues.append(f"LOD1 {t1} tris over {LOD1_RATIO:.0%} of LOD0 ({t0})")
    return issues


# --------------------------------------------------------------------------- export
def _select_only(objs, scene):
    for o in scene.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]


def make_phone_meshes(inst: dict, collection) -> list:
    """Phone-LOD mesh objects (<= PHONE_TRI_BUDGET triangles in total), named <base>_mesh."""
    pick = 0 if inst["tris"].get(0, 1e9) <= PHONE_TRI_BUDGET else 1
    src = inst["lod"][pick]
    total = sum(tri_count(o.data) for o in src)
    out = []
    for o in src:
        ob = o.copy()
        ob.data = o.data.copy()
        ob.name = o.name.rsplit("_LOD", 1)[0] + "_mesh"
        ob.data.name = ob.name
        collection.objects.link(ob)
        if total > PHONE_TRI_BUDGET:
            _decimate_to(ob, int(tri_count(ob.data) * PHONE_TRI_BUDGET / total))
        out.append(ob)
    return out


def export_fbx(path: str, objs, scene) -> None:
    _select_only(objs, scene)
    bpy.ops.export_scene.fbx(
        filepath=path, use_selection=True, object_types={"EMPTY", "MESH"},
        apply_scale_options="FBX_SCALE_UNITS", bake_space_transform=True,
        axis_forward="-Z", axis_up="Y", mesh_smooth_type="OFF", use_mesh_modifiers=True,
        add_leaf_bones=False, bake_anim=False, colors_type="LINEAR", use_custom_props=False)


def export_glb(path: str, objs, scene) -> None:
    _select_only(objs, scene)
    kwargs = dict(filepath=path, export_format="GLB", use_selection=True, export_yup=True,
                  export_apply=True, export_materials="EXPORT", export_cameras=False,
                  export_lights=False, export_animations=False, export_extras=False)
    try:
        bpy.ops.export_scene.gltf(export_vertex_color="NONE", **kwargs)
    except TypeError:
        bpy.ops.export_scene.gltf(**kwargs)


def clear_scene(scene=None, keep_collection: str = "studio") -> None:
    """Delete every object in the scene except those in the studio collection."""
    scene = scene or bpy.context.scene
    keep = set()
    col = bpy.data.collections.get(keep_collection)
    if col is not None:
        keep = set(col.all_objects)
    for o in list(scene.objects):
        if o not in keep:
            bpy.data.objects.remove(o, do_unlink=True)
    for me in list(bpy.data.meshes):
        if me.users == 0:
            bpy.data.meshes.remove(me)


def manifest_entry(part_id: str, inst: dict, phone_tris=None, files=None) -> dict:
    lo, hi = _world_bbox(inst["lod"][0])
    entry = dict(id=part_id)
    entry.update({k: v for k, v in inst["meta"].items()})
    entry["bbox_min_m"] = [round(c, 3) for c in lo]
    entry["bbox_max_m"] = [round(c, 3) for c in hi]
    entry["attach_points_m"] = {
        name: dict(blender_xyz=[round(c, 4) for c in ob.location],
                   **({"sub": ob.parent.name} if ob.parent is not inst["root"] else {}))
        for name, ob in inst["empties"].items()}
    entry["materials"] = sorted({m.name for o in inst["lod"][0] for m in o.data.materials})
    entry["triangles"] = dict(lod0=inst["tris"].get(0), lod1=inst["tris"].get(1), phone=phone_tris)
    if files:
        entry["files"] = files
    return entry


def build_part(part_id: str, *, scene=None, export=True, save_blend=True) -> dict:
    """Generate one part into `scene` (cleared first), validate it and write
    <id>.blend, <id>.fbx and <id>.glb. Returns its manifest entry (with 'issues')."""
    scene = scene or bpy.context.scene
    clear_scene(scene)
    inst = instantiate(part_id, scene=scene)
    issues = validate(part_id, inst)
    files = {}
    phone_tris = None
    if export:
        for d in (FBX_DIR, GLB_DIR):
            os.makedirs(d, exist_ok=True)
        host = [inst["root"], *inst["subs"].values(), *inst["lod"][0], *inst["lod"][1],
                *inst["empties"].values()]
        host = list(dict.fromkeys(host))
        fbx = os.path.join(FBX_DIR, part_id + ".fbx")
        export_fbx(fbx, host, scene)
        phone = make_phone_meshes(inst, scene.collection)
        phone_tris = sum(tri_count(o.data) for o in phone)
        glb = os.path.join(GLB_DIR, part_id + ".glb")
        sel = [inst["root"], *inst["subs"].values(), *phone, *inst["empties"].values()]
        export_glb(glb, list(dict.fromkeys(sel)), scene)
        for o in phone:
            me = o.data
            bpy.data.objects.remove(o, do_unlink=True)
            bpy.data.meshes.remove(me)
        files = dict(fbx=os.path.relpath(fbx, REPO_DIR), glb=os.path.relpath(glb, REPO_DIR),
                     fbx_bytes=os.path.getsize(fbx), glb_bytes=os.path.getsize(glb))
        if phone_tris > PHONE_TRI_BUDGET:
            issues.append(f"phone mesh {phone_tris} tris over {PHONE_TRI_BUDGET}")
        if files["glb_bytes"] > PHONE_BYTES_BUDGET:
            issues.append(f"GLB {files['glb_bytes']} bytes over 2 MB")
    if save_blend:
        blend = os.path.join(BLENDER_DIR, part_id + ".blend")
        for o in scene.objects:
            o.select_set(False)
        # write this scene (with its objects and materials) as a standalone file
        old_name = scene.name
        scene.name = part_id
        bpy.data.libraries.write(blend, {scene}, compress=True, fake_user=False)
        scene.name = old_name
        files["blend"] = os.path.relpath(blend, REPO_DIR)
        files["blend_bytes"] = os.path.getsize(blend)
    entry = manifest_entry(part_id, inst, phone_tris, files)
    entry["issues"] = issues
    return entry


def update_manifest(entries: list[dict]) -> dict:
    """Merge entries into kit_manifest.json (keyed by part id)."""
    data = dict(schema=1, units="metres, Blender axes (+Z up, +Y forward)", parts={})
    if os.path.exists(MANIFEST_PATH):
        with open(MANIFEST_PATH) as fh:
            data = json.load(fh)
    for e in entries:
        data["parts"][e["id"]] = e
    data["parts"] = dict(sorted(data["parts"].items()))
    with open(MANIFEST_PATH, "w") as fh:
        json.dump(data, fh, indent=1, sort_keys=False)
        fh.write("\n")
    return data
