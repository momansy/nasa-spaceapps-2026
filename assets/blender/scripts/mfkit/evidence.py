"""MissionForge kit: evidence output (contact sheets, triangle table, Unity expectations)."""
from __future__ import annotations

import json
import os

import bpy

from . import pipeline, studio

EVIDENCE_DIR = os.path.join(pipeline.REPO_DIR, "orchestration", "evidence", "T009")

FAMILY_ORDER = ["engine_s1", "engine_s2", "mount_s1", "mount_s2", "tank", "interstage", "adapter",
                "fairing", "booster"]
FAMILY_TITLE = {
    "engine_s1": "First-stage engines (design 7.7)", "engine_s2": "Upper-stage engines (design 7.8)",
    "mount_s1": "First-stage engine mounts (design 7.6)", "mount_s2": "Upper-stage engine mounts (design 7.6)",
    "tank": "Propellant tanks (design 7.9)", "interstage": "Interstages by separation system (design 7.12)",
    "adapter": "Stack adapters (kit helper)", "fairing": "Payload fairings (design 7.5)",
    "booster": "Strap-on boosters (design 7.11)",
}


def _label_material():
    mat = bpy.data.materials.get("mf_label")
    if mat is None:
        mat = bpy.data.materials.new("mf_label")
        mat.use_nodes = True
        nt = mat.node_tree
        nt.nodes.clear()
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        em = nt.nodes.new("ShaderNodeEmission")
        em.inputs[0].default_value = (0.82, 0.86, 0.88, 1.0)
        em.inputs[1].default_value = 1.0
        nt.links.new(em.outputs[0], out.inputs[0])
    return mat


def _add_label(scene, lines, col):
    """Text glued to the bottom of the camera frame."""
    cam = scene.camera
    dist = cam.data.clip_start * 3.0
    aspect = scene.render.resolution_x / scene.render.resolution_y
    import math
    if cam.data.type == "ORTHO":
        half_w = cam.data.ortho_scale / 2.0
    else:
        half_w = dist * math.tan(2.0 * math.atan(cam.data.sensor_width / (2.0 * cam.data.lens)) / 2.0)
    half_h = half_w / aspect
    objs = []
    for i, text in enumerate(reversed(lines)):
        cu = bpy.data.curves.new("mf_label", "FONT")
        cu.body = text
        cu.align_x = "CENTER"
        cu.size = half_h * (0.105 if i == len(lines) - 1 else 0.082)
        ob = bpy.data.objects.new("mf_label", cu)
        col.objects.link(ob)
        ob.parent = cam
        ob.location = (0.0, -half_h * (0.93 - 0.125 * i), -dist)
        ob.data.materials.append(_label_material())
        ob.visible_shadow = False
        objs.append(ob)
    return objs


def render_tile(scene, part_id, path, *, tile=480, view="3q", lod=0, label=True):
    """Render one part with its label. Returns the instance dict (objects stay in scene)."""
    pipeline.clear_scene(scene)
    inst = pipeline.instantiate(part_id, scene=scene)
    for o in inst["lod"][1 - lod]:
        o.hide_render = True
    scene.render.resolution_x = tile
    scene.render.resolution_y = tile
    studio.frame_camera(scene, inst["lod"][lod], view, margin=1.30, lens=85.0)
    if bpy.data.objects.get("mf_lookdev_floor") is not None:
        from . import lookdev
        lookdev.place_floor(scene, inst["lod"][lod], camera_view_dir=studio.VIEWS.get(view, view))
    labels = []
    if label:
        m = inst["meta"]
        dia = max(m.get("diameter_bottom_m", 0), m.get("diameter_top_m", 0), m.get("max_diameter_m", 0),
                  m.get("envelope_diameter_m", 0))
        line2 = f"L {m.get('length_m', 0):g} m   D {dia:g} m   {inst['tris'][0]:,} / {inst['tris'][1]:,} tris"
        labels = _add_label(scene, [part_id, line2], bpy.data.collections[studio.STUDIO])
    studio.render_to(scene, path, tile, tile)
    for ob in labels:
        cu = ob.data
        bpy.data.objects.remove(ob, do_unlink=True)
        bpy.data.curves.remove(cu)
    return inst


def contact_sheets(scene=None, *, tile=480, cols=6, families=None, out_dir=None):
    """One labelled contact sheet per part family. Returns the list of written files."""
    scene = scene or bpy.context.scene
    out_dir = out_dir or EVIDENCE_DIR
    pipeline.load_all()
    if scene.camera is None:
        studio.setup_studio(scene)
    written = []
    tmp = os.path.join(pipeline.BUILD_DIR, "tiles")
    for fam in families or FAMILY_ORDER:
        ids = [pid for pid, p in pipeline.PARTS.items() if p.family == fam]
        if not ids:
            continue
        paths = []
        for pid in ids:
            p = os.path.join(tmp, pid + ".png")
            view = "low" if fam in ("mount_s1",) else ("high" if fam == "mount_s2" else "3q")
            render_tile(scene, pid, p, tile=tile, view=view)
            paths.append(p)
        out = os.path.join(out_dir, f"contact_sheet_{fam}.png")
        studio.stitch(paths, out, cols=min(cols, len(paths)))
        written.append(out)
    pipeline.clear_scene(scene)
    return written


def triangle_table(manifest: dict) -> str:
    """Markdown triangle-count table grouped by family."""
    lines = ["# T009 kit: triangle counts and sizes", "",
             "Budgets: host LOD0 <= 30 000 triangles, LOD1 <= 30 % of LOD0, phone GLB <= 8 000 triangles "
             "and <= 2 MB. Lengths in metres.", ""]
    parts = list(manifest["parts"].values())
    total = dict(n=0, lod0=0, fbx=0, glb=0, blend=0)
    for fam in FAMILY_ORDER:
        rows = [p for p in parts if p.get("family") == fam]
        if not rows:
            continue
        lines += [f"## {FAMILY_TITLE[fam]}", "",
                  "| Part | Length (m) | Diameter bottom / top (m) | LOD0 tris | LOD1 tris | LOD1 % | Phone tris "
                  "| FBX (KB) | GLB (KB) | Within budget |", "|---|---|---|---|---|---|---|---|---|---|"]
        for p in rows:
            t, f = p["triangles"], p.get("files", {})
            pct = 100.0 * t["lod1"] / t["lod0"] if t["lod0"] else 0.0
            ok = (t["lod0"] <= 30000 and t["lod1"] <= max(int(t["lod0"] * 0.30), 200) + 2
                  and (t["phone"] or 0) <= 8000 and f.get("glb_bytes", 0) <= 2 * 1024 * 1024
                  and not p.get("issues"))
            lines.append(f"| `{p['id']}` | {p.get('length_m', 0):g} | {p.get('diameter_bottom_m', 0):g} / "
                         f"{p.get('diameter_top_m', 0):g} | {t['lod0']:,} | {t['lod1']:,} | {pct:.0f} % | "
                         f"{t['phone']:,} | {f.get('fbx_bytes', 0) // 1024:,} | {f.get('glb_bytes', 0) // 1024:,} | "
                         f"{'yes' if ok else 'NO: ' + '; '.join(p.get('issues', ['over budget']))} |")
            total["n"] += 1
            total["lod0"] += t["lod0"]
            total["fbx"] += f.get("fbx_bytes", 0)
            total["glb"] += f.get("glb_bytes", 0)
            total["blend"] += f.get("blend_bytes", 0)
        lines.append("")
    lines += [f"**Totals:** {total['n']} parts, {total['lod0']:,} LOD0 triangles; FBX {total['fbx'] / 1e6:.1f} MB, "
              f"GLB {total['glb'] / 1e6:.1f} MB, .blend {total['blend'] / 1e6:.1f} MB.", ""]
    return "\n".join(lines)


def write_unity_expect(manifest: dict) -> str:
    """Flat JSON the Unity import test reads (JsonUtility-friendly)."""
    parts = []
    for p in manifest["parts"].values():
        parts.append(dict(
            id=p["id"], length=p.get("length_m", 0.0), diameter_bottom=p.get("diameter_bottom_m", 0.0),
            bbox_min=p["bbox_min_m"], bbox_max=p["bbox_max_m"],
            empties=[dict(name=n, x=e["blender_xyz"][0], y=e["blender_xyz"][1], z=e["blender_xyz"][2])
                     for n, e in p["attach_points_m"].items()]))
    path = os.path.join(pipeline.BUILD_DIR, "unity_expect.json")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as fh:
        json.dump(dict(parts=parts), fh)
    return path


def material_sheet(scene, out_path, *, tile=420, cols=5):
    """One material ball per library entry under the active look-dev; labelled; written to out_path."""
    import math
    from . import materials
    from .core import MeshBuilder
    lib = materials.library()["materials"]
    names = [n for n in lib if materials.has_entry(n)]
    pipeline.clear_scene(scene)
    col = scene.collection
    objs = []
    rows = math.ceil(len(names) / cols)
    for i, name in enumerate(names):
        mb = MeshBuilder(0)
        prof = [(0.0 if abs(math.cos(a)) < 1e-6 else 0.5 * math.cos(a), 0.5 * math.sin(a))
                for a in [math.radians(-90 + 180 * k / 24) for k in range(25)]]
        mb.lathe(prof, 96, name, crease=80.0, uv_u_repeat=4 if lib[name].get("uv_mode") == "angle" else None,
                 uv_scale=1.0)
        me = pipeline.builder_to_mesh(mb, f"ball_{name}")
        ob = bpy.data.objects.new(f"ball_{name}", me)
        c, r = i % cols, i // cols
        ob.location = ((c - (cols - 1) / 2.0) * 1.25, 0.0, ((rows - 1) / 2.0 - r) * 1.9 + 0.5)
        col.objects.link(ob)
        objs.append(ob)
        cu = bpy.data.curves.new(f"lbl_{name}", "FONT")
        cu.body = name
        cu.align_x = "CENTER"
        cu.size = 0.13
        lbl = bpy.data.objects.new(f"lbl_{name}", cu)
        lbl.location = (ob.location.x, -0.6, ob.location.z - 0.72)
        lbl.rotation_euler = (math.radians(90), 0, 0)
        lbl.data.materials.append(_label_material())
        col.objects.link(lbl)
        objs.append(lbl)
    w, h = cols * tile, int(rows * tile * 1.5)
    studio.frame_camera(scene, [o for o in objs if o.type == "MESH"], (0.0, -1.0, 0.0), lens=85.0, margin=1.0,
                        ortho=True)
    scene.render.resolution_x, scene.render.resolution_y = w, h
    scene.camera.data.ortho_scale = max(cols * 1.25, rows * 1.9 * w / h) * 1.04
    studio.render_to(scene, out_path, w, h)
    pipeline.clear_scene(scene)
    return out_path
