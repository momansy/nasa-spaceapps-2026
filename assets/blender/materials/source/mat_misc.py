"""livery (teal paint), thermal (gold MLI quilt) and foam (SOFI spray-on foam) - T032 step 5."""
from __future__ import annotations

import os

import numpy as np

import registry as R
import texlib as T
from mat_nozzle import PROC, _grey, _paths


def build_livery(lib, size=1024):
    """Teal paint: same satin recipe as hull, tinted at runtime. Reuses the hull's mottling pattern, shifted."""
    mid = "livery"
    a_p, n_p, o_p = _paths(mid)
    n = size
    mott = T.fbm(n, 41, f_lo=1, f_hi=6, slope=1.2)
    albedo = _grey(0.95 + 0.012 * mott)
    rough = np.clip(0.44 + 0.03 * mott + 0.015 * T.fbm(n, 42, f_lo=8, f_hi=60), 0.38, 0.52)
    normal = T.normal_from_height(0.2 * T.fbm(n, 43, f_lo=40, f_hi=200, slope=0.5), 1.0)
    sizes = [T.save(albedo, a_p), T.save(normal, n_p), T.save(T.orm(1.0, rough, 0.0), o_p)]
    R.record_material(lib, mid, albedo=a_p, normal=n_p, orm=o_p, tiling_m=1.5, tint="#176887",
                      metallic=(0.0, 0.0), roughness=(0.38, 0.52), normal_strength=0.6, hero=False, sources=[PROC])
    R.note_assets([PROC], f"textures/{mid}/", "Generated: tileable noise mottling")
    return sizes


def build_thermal(lib, size=1024):
    """Gold MLI quilt: puffy cells pinched at the seams, crinkled foil."""
    mid = "thermal"
    a_p, n_p, o_p = _paths(mid)
    n = size
    cells = 8
    u = (np.arange(n, dtype=np.float32) + 0.5) / n
    uu, vv = np.meshgrid(u, u)
    pu = 0.5 - 0.5 * np.cos(uu * cells * 2 * np.pi)                   # 0 at seams, 1 mid cell
    pv = 0.5 - 0.5 * np.cos(vv * cells * 2 * np.pi)
    pillow = np.sqrt(pu * pv)
    crinkle = T.fbm(n, 51, f_lo=6, f_hi=90, slope=0.9)
    height = pillow + 0.08 * crinkle
    lum = 0.74 + 0.12 * (pillow - 0.5) + 0.04 * crinkle
    rough = np.clip(0.30 + 0.06 * crinkle - 0.06 * (pillow - 0.5), 0.15, 0.55)
    ao = np.clip(0.55 + 0.45 * pillow, 0, 1)
    sizes = [T.save(_grey(lum), a_p), T.save(T.normal_from_height(height.astype(np.float32), 5.0), n_p),
             T.save(T.orm(ao, rough, 0.72), o_p)]
    R.record_material(lib, mid, albedo=a_p, normal=n_p, orm=o_p, tiling_m=1.0, tint="#C79A52",
                      metallic=(0.6, 0.8), roughness=(0.15, 0.55), normal_strength=1.0, hero=False, sources=[PROC])
    R.note_assets([PROC], f"textures/{mid}/", "Generated: quilted pillow cells with foil crinkle")
    return sizes


def build_foam(lib, size=1024):
    """SOFI spray-on foam: burnt amber, rough (~0.8), closed-cell normal (Worley cells with a soft rim)."""
    mid = "foam"
    a_p, n_p, o_p = _paths(mid)
    n = size
    big = T.worley(n, 20, 61)
    small = T.worley(n, 64, 62)
    cell = 0.6 * (1.0 - T.smoothstep(0.0, 0.75, big)) + 0.4 * (1.0 - T.smoothstep(0.0, 0.8, small))
    mott = T.fbm(n, 63, f_lo=1, f_hi=6, slope=1.2)
    lum = 0.78 + 0.07 * mott + 0.10 * (cell - 0.5)
    rough = np.clip(0.80 + 0.03 * mott - 0.06 * (cell - 0.5), 0.7, 0.9)
    ao = np.clip(0.7 + 0.3 * cell, 0, 1)
    sizes = [T.save(_grey(lum), a_p), T.save(T.normal_from_height(cell.astype(np.float32), 3.0), n_p),
             T.save(T.orm(ao, rough, 0.0), o_p)]
    R.record_material(lib, mid, albedo=a_p, normal=n_p, orm=o_p, tiling_m=0.5, tint="#9A6A3F",
                      metallic=(0.0, 0.0), roughness=(0.7, 0.9), normal_strength=1.0, hero=False, sources=[PROC])
    R.note_assets([PROC], f"textures/{mid}/", "Generated: tileable Worley cells + low-frequency mottling")
    return sizes
