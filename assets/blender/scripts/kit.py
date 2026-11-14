"""MissionForge kit command line.

    BL=/Applications/Blender.app/Contents/MacOS/Blender
    $BL -b --factory-startup --python assets/blender/scripts/kit.py -- list
    $BL -b --factory-startup --python assets/blender/scripts/kit.py -- preview 'eng_*' --views 3q,side,low
    $BL -b --factory-startup --python assets/blender/scripts/kit.py -- build 'tank_*'
    $BL -b --factory-startup --python assets/blender/scripts/kit.py -- build            # everything

preview: builds the parts (no export), prints triangle counts and validation problems
         and writes assets/blender/_build/preview/<id>.png (git-ignored).
sheets:  labelled contact sheet per family (arguments are family names) into
         orchestration/evidence/T009/ (or --out DIR).
build:   validates and writes <id>.blend, <id>.fbx, <id>.glb and kit_manifest.json.
"""
from __future__ import annotations

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402

from mfkit import assemble, bake, beauty, evidence, lookdev, pipeline, studio  # noqa: E402


def main() -> int:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser(prog="kit.py")
    ap.add_argument("cmd", choices=["list", "preview", "build", "sheets", "assembly", "evidence", "matsheet", "bake"])
    ap.add_argument("patterns", nargs="*")
    ap.add_argument("--views", default="3q,side,low")
    ap.add_argument("--size", type=int, default=640)
    ap.add_argument("--lod", type=int, default=0)
    ap.add_argument("--out", default=os.path.join(pipeline.BUILD_DIR, "preview"))
    ap.add_argument("--no-render", action="store_true")
    ap.add_argument("--split", action="store_true", help="write one <id>_<view>.png per view instead of a row")
    ap.add_argument("--lookdev", choices=["legacy", *lookdev.LOOKDEVS], default="legacy",
                    help="studio = HDRI studio, dusk = HDRI sunset on wet concrete (Cycles); legacy = T009 Eevee rig")
    ap.add_argument("--samples", type=int, default=lookdev.DEFAULT_SAMPLES, help="Cycles samples for --lookdev")
    args = ap.parse_args(argv)
    args.out_given = "--out" in argv

    if args.cmd == "evidence":
        return write_evidence(args)
    if args.cmd == "matsheet":
        scene = bpy.context.scene
        pipeline.clear_scene(scene, keep_collection="")
        studio.setup_studio(scene)
        lookdev.setup(scene, "studio" if args.lookdev == "legacy" else args.lookdev, samples=args.samples)
        print("SHEET", evidence.material_sheet(scene, args.out if args.out_given else
                                               os.path.join(os.path.dirname(evidence.EVIDENCE_DIR), "T032", "material_library_sheet.png")))
        return 0
    ids = pipeline.part_ids(args.patterns) if args.cmd not in ("sheets", "assembly") else []
    if args.cmd == "list":
        for pid in ids:
            print(pid, pipeline.PARTS[pid].family)
        return 0

    scene = bpy.context.scene
    pipeline.clear_scene(scene, keep_collection="")
    studio.setup_studio(scene)
    if args.lookdev != "legacy":
        lookdev.setup(scene, args.lookdev, samples=args.samples)
    if args.cmd == "sheets":
        # patterns are family names here (engine_s1, tank, ...); default all
        out = evidence.contact_sheets(scene, families=args.patterns or None, tile=args.size,
                                      out_dir=args.out if args.out_given else None)
        for p in out:
            print("SHEET", p)
        return 0
    if args.cmd == "assembly":
        return run_assembly(scene, args)
    failed = 0
    entries = []
    if args.cmd == "bake":
        done = {pid: bake.bake_part(pid, scene) for pid in ids}
        bake.write_parts(done)
        print(f"DONE baked {len(done)} parts")
        return 0
    for pid in ids:
        if args.cmd == "preview":
            pipeline.clear_scene(scene)
            inst = pipeline.instantiate(pid, scene=scene)
            issues = pipeline.validate(pid, inst)
            lo, hi = pipeline._world_bbox(inst["lod"][0])
            print(f"PART {pid}: LOD0 {inst['tris'][0]} tris, LOD1 {inst['tris'][1]} tris, "
                  f"bbox z {lo.z:.3f}..{hi.z:.3f}, r_max {max(abs(lo.x), hi.x, abs(lo.y), hi.y):.3f}, "
                  f"empties {sorted(inst['empties'])}")
            for i in issues:
                print(f"  ISSUE {pid}: {i}")
            failed += bool(issues)
            if not args.no_render:
                show = inst["lod"][args.lod]
                for o in inst["lod"][1 - args.lod]:
                    o.hide_render = True
                out = os.path.join(args.out, f"{pid}{'_lod1' if args.lod else ''}.png")
                studio.preview(scene, show, out, views=args.views.split(","), size=args.size, split=args.split)
                print(f"  preview {out}")
        else:
            entry = pipeline.build_part(pid, scene=scene)
            entries.append(entry)
            t = entry["triangles"]
            print(f"BUILT {pid}: lod0 {t['lod0']} lod1 {t['lod1']} phone {t['phone']} "
                  f"fbx {entry['files']['fbx_bytes'] // 1024} KB glb {entry['files']['glb_bytes'] // 1024} KB")
            for i in entry["issues"]:
                print(f"  ISSUE {pid}: {i}")
            failed += bool(entry["issues"])
    if entries:
        pipeline.update_manifest(entries)
    print(f"DONE {len(ids)} parts, {failed} with issues")
    return 0


def write_evidence(args) -> int:
    import json
    out_dir = args.out if args.out_given else evidence.EVIDENCE_DIR
    os.makedirs(out_dir, exist_ok=True)
    with open(pipeline.MANIFEST_PATH) as fh:
        manifest = json.load(fh)
    path = os.path.join(out_dir, "triangle_counts.md")
    with open(path, "w") as fh:
        fh.write(evidence.triangle_table(manifest))
    print("TABLE", path)
    return 0


def run_assembly(scene, args) -> int:
    """Build the assembly test scene, check every joint, save it and render it."""
    out_dir = args.out if args.out_given else evidence.EVIDENCE_DIR
    os.makedirs(out_dir, exist_ok=True)
    pipeline.clear_scene(scene, keep_collection="")
    beauty.setup_dusk(scene)
    built = beauty.build_assembly_scene(scene)
    report, all_ok = beauty.joint_report(built)
    with open(os.path.join(out_dir, "assembly_joints.md"), "w") as fh:
        fh.write(report)
    for b in built:
        bad = [r for r in assemble.check_joints(b) if not r["ok"]]
        print(f"VEHICLE {b['name']}: {len(b['placed'])} parts, {len(bad)} failing joints")
        for r in bad:
            print(f"  ISSUE {b['name']}: {r}")
    blend = os.path.join(pipeline.BLENDER_DIR, "_assembly_test.blend")
    bpy.ops.wm.save_as_mainfile(filepath=blend, compress=True, copy=True)
    print("SAVED", blend)
    if not args.no_render:
        for b in built:
            others = [o for x in built if x is not b for o in x["collection"].all_objects]
            for o in others:
                o.hide_render = True
            for p in beauty.render_vehicle(scene, b, out_dir):
                print("RENDER", p)
            for o in others:
                o.hide_render = False
        print("RENDER", beauty.render_lineup(scene, built, out_dir))
    print(f"DONE assembly, joints {'ok' if all_ok else 'FAIL'}")
    return 0


if __name__ == "__main__":
    main()
