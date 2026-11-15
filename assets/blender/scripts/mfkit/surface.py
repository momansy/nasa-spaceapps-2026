"""MissionForge kit: edge bevels and weighted normals, applied to the mesh before UV1, bake and export.

VISUAL_TARGET 2.1 "Edges": every hard edge visible at hero distance has a bevel (2 segments at LOD0, 1 at LOD1;
3-6 mm on engine parts); weighted normals keep flat faces flat. Only edges long enough to carry a bevel are
weighted (tiny bolt heads and pins are left alone), so the triangle budget is spent where the light catches.
The result carries custom split normals, which the FBX and GLB exporters write.
"""
from __future__ import annotations

import math

import bmesh
import bpy

SURFACE_FAMILY_PREFIXES = ("engine",)      # T033 may extend this tuple for tanks, fairings, boosters
BEVEL_WIDTH_M = 0.004                      # game_value: 3-6 mm on engine parts
BEVEL_ANGLE_DEG = 35.0
MIN_EDGE_M = {0: 0.015, 1: 0.03}           # edges shorter than this carry no bevel


def wants_finish(family: str) -> bool:
    return family.startswith(SURFACE_FAMILY_PREFIXES)


def finish(me: bpy.types.Mesh, lod: int, *, width: float = BEVEL_WIDTH_M) -> bpy.types.Mesh:
    """Return a new mesh: beveled hard edges + weighted normals. The input mesh is removed."""
    bm = bmesh.new()
    bm.from_mesh(me)
    layer = bm.edges.layers.float.new("bevel_weight_edge")
    limit = math.radians(BEVEL_ANGLE_DEG)
    for e in bm.edges:
        if len(e.link_faces) == 2 and e.calc_length() > MIN_EDGE_M[min(lod, 1)] and e.calc_face_angle(0.0) > limit:
            e[layer] = 1.0
    bm.to_mesh(me)
    bm.free()
    scene = bpy.context.scene
    ob = bpy.data.objects.new("_mf_surface_tmp", me)
    scene.collection.objects.link(ob)
    bev = ob.modifiers.new("mf_bevel", "BEVEL")
    bev.width = width
    bev.segments = 2 if lod == 0 else 1
    bev.limit_method = "WEIGHT"
    bev.harden_normals = False
    wn = ob.modifiers.new("mf_wn", "WEIGHTED_NORMAL")
    wn.mode = "FACE_AREA"
    wn.weight = 50
    wn.keep_sharp = True
    bpy.context.view_layer.update()
    out = bpy.data.meshes.new_from_object(ob.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    name = me.name
    scene.collection.objects.unlink(ob)
    bpy.data.objects.remove(ob)
    bpy.data.meshes.remove(me)
    out.name = name
    return out
