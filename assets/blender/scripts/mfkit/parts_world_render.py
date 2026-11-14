"""T017 evidence: pad, flame trench and a 60 m gantry stacked beside an assembled kit vehicle.

Not a part module (never listed in pipeline.PART_MODULES). Run:
    Blender -b --factory-startup --python assets/blender/scripts/mfkit/parts_world_render.py -- OUT_DIR
"""
from __future__ import annotations

import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(_HERE))

import bpy  # noqa: E402

from mfkit import assemble, beauty, pipeline, spec, studio  # noqa: E402

N_SEGMENTS = 8        # base 9 m + 8 x 6 m = 57 m structure, crown tip at 64.7 m (game_value layout)


def _place(part, loc, scene, col, prefix, cache):
    inst = pipeline.instantiate(part, lods=(0,), prefix=prefix, collection=col, scene=scene, mesh_cache=cache)
    inst["root"].location = loc
    bpy.context.view_layer.update()
    return inst


def build_pad_scene(scene, spec_path=None, vehicle_name="heavy_pneumatic_d54"):
    cache: dict = {}
    col = bpy.data.collections.new("pad")
    scene.collection.children.link(col)
    objs = []
    zt = spec.PAD_DECK_H
    deck = _place("world_pad_deck", (0, 0, 0), scene, col, "pad.", cache)
    trench = _place("world_flame_trench", (0, 0, 0), scene, col, "trench.", cache)
    objs += deck["lod"][0] + trench["lod"][0]
    # vehicle: the core base ring sits on the launch mount ring
    veh = next(v for v in assemble.load_spec()["vehicles"] if v["name"] == vehicle_name)
    built = assemble.build_vehicle(veh, scene=scene, origin=(0, 0, 0), mesh_cache=cache)
    tank = built["placed"]["tank1"]["root"]
    dz = (zt + spec.PAD_MOUNT_H + 0.7) - tank.matrix_world.translation.z
    for inst in built["placed"].values():
        inst["root"].location.z += dz
    objs += assemble.vehicle_objects(built)
    # tower
    x = spec.GANTRY_OFFSET_X
    z = 0.0
    base = _place("world_gantry_base", (x, 0, z), scene, col, "g.base.", cache)
    objs += base["lod"][0]
    z = base["empties"]["attach_top"].matrix_world.translation.z
    for i in range(N_SEGMENTS):
        seg = _place("world_gantry_segment", (x, 0, z), scene, col, f"g.seg{i}.", cache)
        objs += seg["lod"][0]
        z = seg["empties"]["attach_top"].matrix_world.translation.z
    crown = _place("world_gantry_crown", (x, 0, z), scene, col, "g.crown.", cache)
    objs += crown["lod"][0]
    zc = z
    # arms reach toward -X at levels along the tower (umbilical and crew arm near the upper stages)
    for part, zz in (("world_umbilical_arm", zt + 18.0), ("world_umbilical_arm", zt + 30.0),
                     ("world_crew_access_arm", zt + 42.0), ("world_crane_arm", zc - 0.0)):
        a = _place(part, (x - spec.GANTRY_HALF, 0, zz), scene, col, f"g.{part}.", cache)
        objs += a["lod"][0]
    mast = _place("world_lightning_mast", (-16.0, -12.0, 0), scene, col, "mast.", cache)
    objs += mast["lod"][0]
    return objs, zc + 7.72


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    out_dir = argv[0] if argv else "orchestration/evidence/T017"
    scene = bpy.context.scene
    pipeline.clear_scene(scene, keep_collection="")
    beauty.setup_dusk(scene)
    objs, top = build_pad_scene(scene)
    print(f"tower tip height {top:.1f} m")
    scene.render.resolution_x, scene.render.resolution_y = 1500, 1800
    studio.frame_camera(scene, objs, (0.9, -1.0, 0.22), lens=70.0, margin=1.04)
    studio.render_to(scene, os.path.join(out_dir, "gantry_beside_vehicle.png"), 1500, 1800)
    print("RENDER done")


if __name__ == "__main__":
    main()
