"""MissionForge kit: assemble vehicles from kit parts using only their attach empties.

The same rules are implemented in the Unity import test (MfKitImportTest.cs), so they are
the contract the Build Bay can rely on:

  stack_on  "<key>.<empty>"  place the new part's ORIGIN on that empty        (build upward)
  hang_from "<key>.<empty>"  place the new part's attach_top on that empty    (hang below);
                             "<key>.origin" means the origin of part <key>
  side      {core, azimuth_deg, base}  strap-on booster: its attach_side empty lands on the
                             core skin (radius = core diameter / 2) at the azimuth, booster
                             +Y facing the core axis; its origin height = base ("<key>.origin"
                             or "<key>.<empty>") + dz.
"""
from __future__ import annotations

import json
import math
import os

import bpy
from mathutils import Matrix, Vector

from . import pipeline


def load_spec(path=None):
    path = path or os.path.join(pipeline.BLENDER_DIR, "assembly_test.json")
    with open(path) as fh:
        return json.load(fh)


def _resolve(placed, ref):
    key, name = ref.split(".", 1)
    inst = placed[key]
    if name == "origin":
        return inst["root"].matrix_world.translation.copy()
    return inst["empties"][name].matrix_world.translation.copy()


def build_vehicle(vehicle: dict, *, scene=None, lods=(0,), origin=(0.0, 0.0, 0.0),
                  mesh_cache: dict | None = None) -> dict:
    """Instantiate one vehicle. Returns dict(name, placed={key: inst}, joints=[...])."""
    scene = scene or bpy.context.scene
    col = bpy.data.collections.new(vehicle["name"])
    scene.collection.children.link(col)
    placed = {}
    joints = []
    for step in vehicle["parts"]:
        key = step["key"]
        inst = pipeline.instantiate(step["part"], lods=lods, prefix=f"{vehicle['name']}.{key}.",
                                    collection=col, scene=scene, mesh_cache=mesh_cache)
        root = inst["root"]
        bpy.context.view_layer.update()
        if "stack_on" in step:
            p = _resolve(placed, step["stack_on"])
            root.location = p
            joints.append(dict(kind="stack", lower=step["stack_on"].split(".")[0], upper=key, z=p.z))
        elif "hang_from" in step:
            p = _resolve(placed, step["hang_from"])
            top = Vector(inst["empties"]["attach_top"].location)
            root.location = p - top
            joints.append(dict(kind="hang", lower=key, upper=step["hang_from"].split(".")[0], z=p.z,
                               at=step["hang_from"]))
        elif "side" in step:
            side = step["side"]
            core = placed[side["core"]]
            core_r = core["meta"]["diameter_bottom_m"] / 2.0
            core_axis = core["root"].matrix_world.translation
            az = math.radians(side["azimuth_deg"])
            att = Vector(inst["empties"]["attach_side"].location)   # (0, R + gap, z)
            base = _resolve(placed, side["base"])
            # booster local +Y must point at the core axis: rotate about Z
            out_dir = Vector((math.cos(az), math.sin(az), 0.0))       # core axis -> booster
            rot = Matrix.Rotation(math.atan2(-out_dir.y, -out_dir.x) - math.pi / 2.0, 4, "Z")
            root.rotation_euler = rot.to_euler()
            centre = Vector((core_axis.x, core_axis.y, 0.0)) + out_dir * (core_r + att.y)
            root.location = (centre.x, centre.y, base.z + side.get("dz", 0.0))
            joints.append(dict(kind="side", lower=side["core"], upper=key, z=base.z))
        else:
            root.location = (0.0, 0.0, 0.0)
        bpy.context.view_layer.update()
        placed[key] = inst
    # put the lowest point of the vehicle on the ground plane and move it to `origin`
    zmin = 1e9
    for inst in placed.values():
        for ob in inst["lod"][lods[0]]:
            mw = ob.matrix_world
            for c in ob.bound_box:
                zmin = min(zmin, (mw @ Vector(c)).z)
    shift = Vector(origin) - Vector((0.0, 0.0, zmin))
    for inst in placed.values():
        inst["root"].location = inst["root"].location + shift
    for j in joints:
        j["z"] += shift.z
    bpy.context.view_layer.update()
    return dict(name=vehicle["name"], placed=placed, joints=joints, collection=col)


def _ring(inst, lod, z_world, tol=0.004):
    """(max radius about the part axis, count) of vertices within tol of a world height."""
    r, n = 0.0, 0
    axis = inst["root"].matrix_world.translation
    for ob in inst["lod"][lod]:
        mw = ob.matrix_world
        for v in ob.data.vertices:
            p = mw @ v.co
            if abs(p.z - z_world) <= tol:
                r = max(r, math.hypot(p.x - axis.x, p.y - axis.y))
                n += 1
    return r, n


def _zrange(inst, lod):
    lo, hi = 1e9, -1e9
    for ob in inst["lod"][lod]:
        mw = ob.matrix_world
        for v in ob.data.vertices:
            z = (mw @ v.co).z
            lo, hi = min(lo, z), max(hi, z)
    return lo, hi


def check_joints(built: dict, lod: int = 0) -> list[dict]:
    """Measure every stack joint: vertical gap/overlap and ring radius mismatch (metres)."""
    out = []
    placed = built["placed"]
    for j in built["joints"]:
        if j["kind"] == "stack":
            lower, upper = placed[j["lower"]], placed[j["upper"]]
            lo_top = _zrange(lower, lod)[1]
            up_bot = _zrange(upper, lod)[0]
            r_low, _ = _ring(lower, lod, j["z"])
            r_up, _ = _ring(upper, lod, j["z"])
            out.append(dict(joint=f"{j['lower']} -> {j['upper']}", kind="stack", z_m=round(j["z"], 3),
                            gap_m=round(up_bot - lo_top, 4), ring_lower_m=round(r_low, 4),
                            ring_upper_m=round(r_up, 4), ring_mismatch_m=round(abs(r_low - r_up), 4),
                            ok=abs(up_bot - lo_top) < 2e-3 and abs(r_low - r_up) < 4e-3))
        elif j["kind"] == "hang":
            hung = placed[j["lower"]]
            top = _zrange(hung, lod)[1]
            out.append(dict(joint=f"{j['lower']} under {j['at']}", kind="hang", z_m=round(j["z"], 3),
                            gap_m=round(j["z"] - top, 4), ok=abs(j["z"] - top) < 2e-3))
        elif j["kind"] == "side":
            boost, core = placed[j["upper"]], placed[j["lower"]]
            att = boost["empties"]["attach_side"].matrix_world.translation
            axis = core["root"].matrix_world.translation
            dist = math.hypot(att.x - axis.x, att.y - axis.y)
            core_r = core["meta"]["diameter_bottom_m"] / 2.0
            out.append(dict(joint=f"{j['upper']} on {j['lower']}", kind="side", z_m=round(att.z, 3),
                            gap_m=round(dist - core_r, 4), ok=abs(dist - core_r) < 2e-3))
    return out


def vehicle_objects(built: dict, lod: int = 0):
    return [ob for inst in built["placed"].values() for ob in inst["lod"][lod]]
