"""MissionForge kit: assembly test scene, joint report and beauty renders."""
from __future__ import annotations

import os

import bpy
from mathutils import Vector

from . import assemble, evidence, pipeline, studio

SPACING_M = 34.0  # distance between vehicles in the assembly test scene (game_value)


def build_assembly_scene(scene=None, spec=None):
    """Build every vehicle of assembly_test.json side by side. Returns the built list."""
    scene = scene or bpy.context.scene
    spec = spec or assemble.load_spec()
    cache: dict = {}
    built = []
    n = len(spec["vehicles"])
    for i, v in enumerate(spec["vehicles"]):
        x = (i - (n - 1) / 2.0) * SPACING_M
        built.append(assemble.build_vehicle(v, scene=scene, origin=(x, 0.0, 0.0), mesh_cache=cache))
    return built


def joint_report(built_list) -> tuple[str, bool]:
    """Markdown table of every joint of every vehicle, and whether all are within tolerance."""
    lines = ["# T006 assembly test: mating joints", "",
             "Measured on the LOD0 meshes in `assets/blender/_assembly_test.blend`. A stack joint passes "
             "when the vertical gap is under 2 mm and the two mating rings differ by under 4 mm in radius. "
             "A hang joint (engine or upper-stage mount) passes when its top face is within 2 mm of the "
             "attach point. A side joint (booster) passes when its `attach_side` point is within 2 mm of "
             "the core skin. Negative gap = overlap.", ""]
    all_ok = True
    for built in built_list:
        rows = assemble.check_joints(built)
        objs = assemble.vehicle_objects(built)
        lo, hi = studio.bounds_of(objs)
        lines += [f"## {built['name']}", "",
                  f"{len(built['placed'])} parts, height {hi.z - lo.z:.2f} m, {len(rows)} joints.", "",
                  "| Joint | Type | Height z (m) | Gap (mm) | Ring radius lower / upper (m) | Result |",
                  "|---|---|---|---|---|---|"]
        for r in rows:
            ring = (f"{r['ring_lower_m']:.3f} / {r['ring_upper_m']:.3f}" if r["kind"] == "stack" else "n/a")
            lines.append(f"| {r['joint']} | {r['kind']} | {r['z_m']:.3f} | {r['gap_m'] * 1000:.1f} | {ring} | "
                         f"{'ok' if r['ok'] else 'FAIL'} |")
            all_ok = all_ok and r["ok"]
        lines.append("")
    lines.insert(2, f"**Overall: {'all joints pass' if all_ok else 'FAILURES PRESENT'}.**\n")
    return "\n".join(lines), all_ok


def setup_dusk(scene):
    """Style-guide dusk: warm low key, cool sky fill, navy backdrop, dark pad."""
    cam = studio.setup_studio(scene, ground=True, sky=(0.03, 0.07, 0.15), horizon=(0.20, 0.22, 0.30),
                              sun_strength=5.2, sun_dir=(-0.62, -0.60, 0.40))
    return cam


def render_vehicle(scene, built, out_dir=None, *, width=1080, height=1920):
    """Full-height beauty render plus an engine-section close-up of one vehicle."""
    out_dir = out_dir or evidence.EVIDENCE_DIR
    objs = assemble.vehicle_objects(built)
    scene.render.resolution_x, scene.render.resolution_y = width, height
    studio.frame_camera(scene, objs, (0.72, -1.0, 0.16), lens=85.0, margin=1.06)
    full = os.path.join(out_dir, f"beauty_{built['name']}.png")
    studio.render_to(scene, full, width, height)
    # engine section: everything within the lowest 16 % of the vehicle (at least 9 m)
    lo, hi = studio.bounds_of(objs)
    cut = lo.z + max(9.0, (hi.z - lo.z) * 0.16)
    low_objs = [o for o in objs if (o.matrix_world @ Vector(o.bound_box[0])).z < cut
                and (o.matrix_world @ Vector(o.bound_box[6])).z < cut + 4.0]
    close = os.path.join(out_dir, f"beauty_{built['name']}_engines.png")
    if low_objs:
        scene.render.resolution_x, scene.render.resolution_y = 1600, 1200
        studio.frame_camera(scene, low_objs, (0.75, -1.0, 0.06), lens=60.0, margin=1.10)
        studio.render_to(scene, close, 1600, 1200)
    return full, close


def render_lineup(scene, built_list, out_dir=None, *, width=2400, height=1500):
    out_dir = out_dir or evidence.EVIDENCE_DIR
    objs = [o for b in built_list for o in assemble.vehicle_objects(b)]
    scene.render.resolution_x, scene.render.resolution_y = width, height
    studio.frame_camera(scene, objs, (0.25, -1.0, 0.10), lens=110.0, margin=1.05)
    path = os.path.join(out_dir, "beauty_lineup_all_vehicles.png")
    studio.render_to(scene, path, width, height)
    return path
