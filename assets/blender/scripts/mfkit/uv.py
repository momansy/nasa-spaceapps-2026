"""MissionForge kit: UV layers (VISUAL_TARGET 2.4).

UV0  metric tiling, 1 UV unit = 1 m. ``MeshBuilder`` writes it for every face (lathe: metric around the
     circumference and along the meridian, or angle-normalised with ``uv_u_repeat=N`` for bells; box /
     tube / extrusion faces: metres along their own edges; free faces: planar projection in metres).
UV1  a unique, non-overlapping 0..1 layout for the per-part bake masks. Smart UV Project, margin in
     pixels at the bake resolution, then checked by ``uv1_overlap``.

Both layers are named: UV0 is "UVMap" (the layer MeshBuilder always wrote), UV1 is "UV1".
"""
from __future__ import annotations

import math

import bpy
import numpy as np

UV0_NAME = "UVMap"
UV1_NAME = "UV1"
UV1_FAMILY_PREFIXES = ("engine",)   # families that get a UV1 bake layout (T033 may extend this tuple)
UV1_MARGIN_PX = 6                   # game_value: >= 4 px required at bake resolution, 6 gives smoothing headroom
BAKE_RES_LOD0 = 2048                # engines and fairings; 1024 for everything else (VISUAL_TARGET 2.1)
BAKE_RES_LOD1 = 1024
UV1_OVERLAP_LIMIT = 0.005           # 0.5 % of covered area


def wants_uv1(family: str) -> bool:
    return family.startswith(UV1_FAMILY_PREFIXES)


def bake_res(lod: int) -> int:
    return BAKE_RES_LOD0 if lod == 0 else BAKE_RES_LOD1


def add_uv1(me: bpy.types.Mesh, *, res: int = BAKE_RES_LOD0, margin_px: int = UV1_MARGIN_PX) -> None:
    """Add (or rebuild) the unique UV1 layout with Smart UV Project, leaving UV0 as the active layer."""
    if UV1_NAME in me.uv_layers:
        me.uv_layers.remove(me.uv_layers[UV1_NAME])
    uv1 = me.uv_layers.new(name=UV1_NAME)
    me.uv_layers.active = uv1
    scene = bpy.context.scene
    ob = bpy.data.objects.new("_mf_uv_tmp", me)
    scene.collection.objects.link(ob)
    prev_active = bpy.context.view_layer.objects.active
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    try:
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(angle_limit=math.radians(66.0), island_margin=margin_px / res * 1.25,
                                 area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
        bpy.ops.object.mode_set(mode="OBJECT")
    finally:
        if bpy.context.object is not None and bpy.context.object.mode != "OBJECT":
            bpy.ops.object.mode_set(mode="OBJECT")
        scene.collection.objects.unlink(ob)
        bpy.data.objects.remove(ob)
        if prev_active is not None:
            bpy.context.view_layer.objects.active = prev_active
    me.uv_layers.active = me.uv_layers[UV0_NAME]


def _uv_array(me, name):
    layer = me.uv_layers.get(name)
    if layer is None:
        return None
    arr = np.empty(len(layer.data) * 2, dtype=np.float64)
    layer.data.foreach_get("uv", arr)
    return arr.reshape(-1, 2)


def faces_without_uv0(me: bpy.types.Mesh) -> int:
    """Count faces that have no usable UV0: layer missing, non-finite values or a collapsed face."""
    uv = _uv_array(me, UV0_NAME)
    if uv is None:
        return len(me.polygons)
    bad = 0
    for p in me.polygons:
        a = uv[p.loop_start:p.loop_start + p.loop_total]
        if not np.all(np.isfinite(a)) or (p.area > 1e-8 and float(np.ptp(a, axis=0).max()) < 1e-9):
            bad += 1
    return bad


def uv1_overlap(me: bpy.types.Mesh, res: int = 1024) -> float:
    """Fraction (0..1) of covered UV1 area that is covered more than once (rasterised at res x res)."""
    uv = _uv_array(me, UV1_NAME)
    if uv is None:
        return 1.0
    me.calc_loop_triangles()
    cover = np.zeros((res, res), dtype=np.uint8)
    for t in me.loop_triangles:
        a, b, c = (uv[l] * res for l in t.loops)
        x0, x1 = int(max(0, math.floor(min(a[0], b[0], c[0])))), int(min(res - 1, math.ceil(max(a[0], b[0], c[0]))))
        y0, y1 = int(max(0, math.floor(min(a[1], b[1], c[1])))), int(min(res - 1, math.ceil(max(a[1], b[1], c[1]))))
        if x1 < x0 or y1 < y0:
            continue
        den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if abs(den) < 1e-12:
            continue
        xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        w0 = ((b[1] - c[1]) * (xs - c[0]) + (c[0] - b[0]) * (ys - c[1])) / den
        w1 = ((c[1] - a[1]) * (xs - c[0]) + (a[0] - c[0]) * (ys - c[1])) / den
        inside = (w0 > 1e-9) & (w1 > 1e-9) & (1.0 - w0 - w1 > 1e-9)
        sub = cover[y0:y1 + 1, x0:x1 + 1]
        sub += inside.astype(np.uint8)
    covered = int((cover >= 1).sum())
    return float((cover >= 2).sum()) / covered if covered else 0.0


def uv_issues(part_id: str, objs, family: str) -> list[str]:
    """Validation lines for pipeline.validate."""
    issues = []
    for o in objs:
        n = faces_without_uv0(o.data)
        if n:
            issues.append(f"{o.name}: {n} faces without UV0")
        if wants_uv1(family):
            frac = uv1_overlap(o.data)
            if frac > UV1_OVERLAP_LIMIT:
                issues.append(f"{o.name}: UV1 overlap {frac:.2%} > {UV1_OVERLAP_LIMIT:.1%}")
    return issues


def texel_density_px_per_m(tile_m: float, tex_px: int) -> float:
    """Texture density of a tiling set whose texture repeats every tile_m metres (UV0 is 1 UV = 1 m)."""
    return tex_px / tile_m


def rasterize_corner_scalar(me: bpy.types.Mesh, loop_values: np.ndarray, res: int, *, uv_name: str = UV1_NAME,
                            dilate_px: int = 16) -> np.ndarray:
    """Barycentric-interpolated per-corner scalar rasterised into UV space (res x res, row 0 = v 0), then dilated
    ``dilate_px`` pixels so mip-mapping never samples empty texels."""
    uvs = _uv_array(me, uv_name)
    me.calc_loop_triangles()
    img = np.zeros((res, res), dtype=np.float32)
    cov = np.zeros((res, res), dtype=bool)
    for t in me.loop_triangles:
        ls = t.loops
        a, b, c = (uvs[l] * res for l in ls)
        va, vb, vc = (float(loop_values[l]) for l in ls)
        x0, x1 = int(max(0, math.floor(min(a[0], b[0], c[0])))), int(min(res - 1, math.ceil(max(a[0], b[0], c[0]))))
        y0, y1 = int(max(0, math.floor(min(a[1], b[1], c[1])))), int(min(res - 1, math.ceil(max(a[1], b[1], c[1]))))
        den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if x1 < x0 or y1 < y0 or abs(den) < 1e-12:
            continue
        xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        w0 = ((b[1] - c[1]) * (xs - c[0]) + (c[0] - b[0]) * (ys - c[1])) / den
        w1 = ((c[1] - a[1]) * (xs - c[0]) + (a[0] - c[0]) * (ys - c[1])) / den
        w2 = 1.0 - w0 - w1
        inside = (w0 > -1e-4) & (w1 > -1e-4) & (w2 > -1e-4)
        val = w0 * va + w1 * vb + w2 * vc
        img[y0:y1 + 1, x0:x1 + 1] = np.where(inside, val, img[y0:y1 + 1, x0:x1 + 1])
        cov[y0:y1 + 1, x0:x1 + 1] |= inside
    for _ in range(dilate_px):
        if cov.all():
            break
        grown = img.copy()
        gc = cov.copy()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            sh_c = np.roll(cov, (dy, dx), (0, 1))
            sh_v = np.roll(img, (dy, dx), (0, 1))
            take = sh_c & ~gc
            grown[take] = sh_v[take]
            gc |= take
        img, cov = grown, gc
    return img
