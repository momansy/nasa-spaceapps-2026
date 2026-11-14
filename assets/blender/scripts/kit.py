"""MissionForge kit command line.

    BL=/Applications/Blender.app/Contents/MacOS/Blender
    $BL -b --factory-startup --python assets/blender/scripts/kit.py -- list
    $BL -b --factory-startup --python assets/blender/scripts/kit.py -- preview 'eng_*' --views 3q,side,low
    $BL -b --factory-startup --python assets/blender/scripts/kit.py -- build 'tank_*'
    $BL -b --factory-startup --python assets/blender/scripts/kit.py -- build            # everything

preview: builds the parts (no export), prints triangle counts and validation problems
         and writes assets/blender/_build/preview/<id>.png (git-ignored).
sheets:  labelled contact sheet per family (arguments are family names) into
         orchestration/evidence/T006/ (or --out DIR).
build:   validates and writes <id>.blend, <id>.fbx, <id>.glb and kit_manifest.json.
"""
from __future__ import annotations

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402

from mfkit import evidence, pipeline, studio  # noqa: E402


def main() -> int:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser(prog="kit.py")
    ap.add_argument("cmd", choices=["list", "preview", "build", "sheets"])
    ap.add_argument("patterns", nargs="*")
    ap.add_argument("--views", default="3q,side,low")
    ap.add_argument("--size", type=int, default=640)
    ap.add_argument("--lod", type=int, default=0)
    ap.add_argument("--out", default=os.path.join(pipeline.BUILD_DIR, "preview"))
    ap.add_argument("--no-render", action="store_true")
    args = ap.parse_args(argv)
    args.out_given = "--out" in argv

    ids = pipeline.part_ids(args.patterns) if args.cmd != "sheets" else []
    if args.cmd == "list":
        for pid in ids:
            print(pid, pipeline.PARTS[pid].family)
        return 0

    scene = bpy.context.scene
    pipeline.clear_scene(scene, keep_collection="")
    studio.setup_studio(scene)
    if args.cmd == "sheets":
        # patterns are family names here (engine_s1, tank, ...); default all
        out = evidence.contact_sheets(scene, families=args.patterns or None, tile=args.size,
                                      out_dir=args.out if args.out_given else None)
        for p in out:
            print("SHEET", p)
        return 0
    failed = 0
    entries = []
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
                studio.preview(scene, show, out, views=args.views.split(","), size=args.size)
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


if __name__ == "__main__":
    main()
