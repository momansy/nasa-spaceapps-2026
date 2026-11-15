"""MissionForge kit: decal quads from the shared atlas (assets/blender/materials/decals/, library.json "decals").

    ctx.decal("fluid_lox", z=1.2, angle=0.4, size_m=0.30, r_at=lambda z: 0.25)

The quad strip conforms to a surface of revolution (``r_at(z)`` = skin radius), sits ``offset_m`` (3 mm) along the
surface normal and uses the `decal` slot (alpha-clipped atlas). It is built at LOD0 and LOD1 (fewer cells at LOD1)
and keeps out of the end-plane clearance (default 20 mm from z = 0 and from ``z_max``).
"""
from __future__ import annotations

import math

from . import materials

END_CLEARANCE_M = 0.02       # physical keep-out around the attach planes (matches the stack rule in AUTHORING.md)
DEFAULT_OFFSET_M = 0.003


def _tile(tile_id: str) -> dict:
    for t in materials.library().get("decals", {}).get("tiles", []):
        if t["id"] == tile_id:
            return t
    raise KeyError(f"decal tile {tile_id!r} not in library.json")


def add_decal(mb, tile_id, *, z, angle, size_m=None, r_at, z_max=None, offset_m=None, center=(0.0, 0.0)):
    """Add one conformal decal to MeshBuilder ``mb``. Returns the (z0, z1) range actually used."""
    tile = _tile(tile_id)
    u0, v0, u1, v1 = tile["rect"]
    w_m, h_m = tile["size_m"]
    if size_m is not None:
        w_m = float(size_m[0] if isinstance(size_m, (list, tuple)) else size_m)
        h_m = float(size_m[1]) if isinstance(size_m, (list, tuple)) else w_m * tile["size_m"][1] / tile["size_m"][0]
    off = DEFAULT_OFFSET_M if offset_m is None else offset_m
    zc = z
    lo = END_CLEARANCE_M + h_m / 2.0
    zc = max(zc, lo)
    if z_max is not None:
        zc = min(zc, z_max - END_CLEARANCE_M - h_m / 2.0)
    nu = max(1, int(math.ceil(w_m / 0.08))) if mb.lod == 0 else max(1, int(math.ceil(w_m / 0.20)))
    nv = 3 if mb.lod == 0 else 1
    nu = min(nu, 24)
    zs = [zc - h_m / 2.0 + h_m * j / nv for j in range(nv + 1)]
    grid = []
    for i in range(nu + 1):
        col = []
        for zz in zs:
            r = r_at(zz)
            eps = 1e-3
            slope = (r_at(zz + eps) - r_at(zz - eps)) / (2 * eps)
            theta = angle + (w_m * (i / nu - 0.5)) / max(r, 1e-3)
            n = (math.cos(theta), math.sin(theta), -slope)
            ln = math.sqrt(1.0 + slope * slope)
            col.append(mb._vert((center[0] + r * math.cos(theta) + off * n[0] / ln,
                                 center[1] + r * math.sin(theta) + off * n[1] / ln, zz + off * n[2] / ln)))
        grid.append(col)
    for i in range(nu):
        for j in range(nv):
            ua, ub = u0 + (u1 - u0) * i / nu, u0 + (u1 - u0) * (i + 1) / nu
            va, vb = v0 + (v1 - v0) * j / nv, v0 + (v1 - v0) * (j + 1) / nv
            mb._face([grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]], "decal", True,
                     [(ua, va), (ub, va), (ub, vb), (ua, vb)])
    return zs[0], zs[-1]
