"""T017 evidence renders for the spacecraft families (not a part module).

    Blender -b --factory-startup --python assets/blender/scripts/mfkit/parts_spacecraft_evidence.py -- OUT_DIR [capsules|sat|landers|all]
"""
from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import bpy  # noqa: E402
from mathutils import Euler  # noqa: E402

from mfkit import pipeline, spec, studio  # noqa: E402
from mfkit.parts_spacecraft_capsules import Cap  # noqa: E402

CELL = 560


def _hide(inst, subs):
    for sub in subs:
        for ob in inst["lod"][0]:
            if ob.name.endswith(f"_{sub}_LOD0"):
                ob.hide_render = True


def capsule_grid(scene, out_dir):
    """Every capsule with every heat shield (assembled, seen from below-front), one sheet."""
    paths = []
    for cap in spec.CAPSULES:
        c = Cap(cap)
        for kind in spec.TPS_TYPES:
            pipeline.clear_scene(scene, keep_collection="studio")
            ci = pipeline.instantiate(cap, lods=(0,), scene=scene)
            _hide(ci, ["heatshield"])
            si = pipeline.instantiate(f"tps_{kind}__{cap}", lods=(0,), scene=scene)
            rim = si["empties"]["capsule_rim"].location.z
            si["root"].location.z = c.rim_z - rim
            bpy.context.view_layer.update()
            objs = ci["lod"][0] + si["lod"][0]
            studio.frame_camera(scene, [o for o in objs if not o.hide_render], (0.5, -0.8, -0.62), lens=70.0, margin=1.12)
            p = os.path.join(out_dir, f"_cell_{cap}__{kind}.png")
            studio.render_to(scene, p, CELL, CELL)
            paths.append(p)
    sheet = os.path.join(out_dir, "capsules_with_shields.png")
    studio.stitch(paths, sheet, cols=len(spec.TPS_TYPES))
    for p in paths:
        os.remove(p)
    print("SHEET", sheet)


SAT_IDS = ("satpwr_body_mounted_solar_cells", "satpwr_deployable_solar_wings", "satpwr_large_deployable_array")
SAT_BASE_Z = 0.25     # satellite separation ring above the fairing base ring (payload adapter), m (game_value)
FAIRING_SKIN = 0.05   # inner wall is this far inside the fairing's outer surface, m (game_value)


def _about(point, deg):
    from mathutils import Matrix
    return Matrix.Translation(point) @ Matrix.Rotation(math.radians(deg), 4, "Z") @ Matrix.Translation([-c for c in point])


def stow(inst, meta):
    """Apply the stowed pose described in the part meta to the wing sub-empties."""
    st = meta.get("wing_stow")
    if not st:
        return
    for name in ("l", "r"):
        hinge = inst["empties"][f"hinge_wing_{name}"].location.copy()
        fold = inst["empties"][f"fold_wing_{name}"].location.copy()
        m_in = _about(hinge, st["hinge_deg"][f"wing_{name}"])
        inst["subs"][f"wing_{name}"].matrix_basis = m_in
        inst["subs"][f"wing_{name}_outer"].matrix_basis = m_in @ _about(fold, st["fold_deg"][f"wing_{name}_outer"])
    bpy.context.view_layer.update()


def _fairing_profile(scene):
    """Outer radius of fairing_small versus height (max over vertices in 0.1 m bins)."""
    inst = pipeline.instantiate("fairing_small", lods=(0,), scene=scene)
    prof = {}
    for ob in inst["lod"][0]:
        mw = ob.matrix_world
        for v in ob.data.vertices:
            p = mw @ v.co
            k = round(p.z * 10)
            prof[k] = max(prof.get(k, 0.0), math.hypot(p.x, p.y))
    pipeline.clear_scene(scene, keep_collection="studio")
    return prof


def sat_views(scene, out_dir):
    """Satellites deployed and stowed (nadir side view), plus the stowed-fit report against fairing_small."""
    fair = _fairing_profile(scene)
    lines = ["# T017 satellite stowed envelope inside `fairing_small`", "",
             f"Separation ring at {SAT_BASE_Z} m above the fairing base ring; inner wall taken as outer radius minus "
             f"{FAIRING_SKIN} m (game_value). Radius is measured about the fairing axis on the LOD0 mesh in the stowed pose.", "",
             "| Part | Stowed height (m) | Max stowed radius (m) | Min clearance to fairing inner wall (m) | Result |", "|---|---|---|---|---|"]
    cells = []
    for pid in SAT_IDS:
        for pose in ("deployed", "stowed"):
            pipeline.clear_scene(scene, keep_collection="studio")
            inst = pipeline.instantiate(pid, lods=(0,), scene=scene)
            inst["root"].location.z = SAT_BASE_Z
            if pose == "stowed":
                stow(inst, inst["meta"])
            objs = inst["lod"][0]
            studio.frame_camera(scene, objs, (-0.55, 1.0, 0.40), lens=70.0, margin=1.10)
            p = os.path.join(out_dir, f"_cell_{pid}__{pose}.png")
            studio.render_to(scene, p, CELL, CELL)
            cells.append(p)
            if pose == "stowed":
                worst, rmax, zmax = 9.0, 0.0, 0.0
                for ob in objs:
                    mw = ob.matrix_world
                    for v in ob.data.vertices:
                        q = mw @ v.co
                        r = math.hypot(q.x, q.y)
                        k = round(q.z * 10)
                        if k in fair:
                            worst = min(worst, fair[k] - FAIRING_SKIN - r)
                        rmax, zmax = max(rmax, r), max(zmax, q.z)
                lines.append(f"| {pid} | {zmax:.2f} | {rmax:.3f} | {worst:.3f} | {'fits' if worst > 0.02 else 'DOES NOT FIT'} |")
    sheet = os.path.join(out_dir, "satellite_stowed_deployed.png")
    studio.stitch(cells, sheet, cols=2)
    for p in cells:
        os.remove(p)
    with open(os.path.join(out_dir, "satellite_fairing_fit.md"), "w") as fh:
        fh.write("\n".join(lines) + "\n")
    print("SHEET", sheet)
    print("\n".join(lines))


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    out_dir = argv[0] if argv else "orchestration/evidence/T017"
    what = argv[1] if len(argv) > 1 else "all"
    scene = bpy.context.scene
    pipeline.clear_scene(scene, keep_collection="")
    studio.setup_studio(scene)   # space-style backdrop, no ground plane (views from below)
    scene.render.resolution_x = scene.render.resolution_y = CELL
    if what in ("capsules", "all"):
        capsule_grid(scene, out_dir)
    for name in ("sat", "landers"):
        fn = globals().get(f"{name}_views")
        if fn and what in (name, "all"):
            fn(scene, out_dir)


if __name__ == "__main__":
    main()
