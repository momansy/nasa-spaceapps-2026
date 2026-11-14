"""Nozzle materials (T032 step 5): regenerative tube-wall bell, radiative extension, ablative carbon-phenolic.

All three are procedural and tileable (numpy generators, no downloads). UV0 on bells is angle-normalised, so one
u repeat of the texture holds `tubes_per_tile` coolant tubes and the generator picks the repeat count that gives
a constant tube count from throat to exit (library `tubes_per_tile`; engine side: `uv_u_repeat = tubes / tubes_per_tile`).
Variants are library entries mapped from the engine's params to the `nozzle_hot` slot; they are not new slots.
"""
from __future__ import annotations

import os

import numpy as np

import registry as R
import texlib as T

TEX = os.path.join(R.MATERIALS_DIR, "textures")
TUBES_PER_TILE = 12
PROC = dict(name="Procedural (numpy generator in assets/blender/materials/source/mat_nozzle.py)",
            url="https://github.com/momansy/nasa-spaceapps-2026", author="MissionForge team", licence="CC0 1.0",
            date=R.DOWNLOAD_DATE)


def _paths(mid):
    d = os.path.join(TEX, mid)
    return (os.path.join(d, f"{mid}_albedo.jpg"), os.path.join(d, f"{mid}_normal.png"),
            os.path.join(d, f"{mid}_orm.jpg"))


def _grey(g):
    return np.repeat(np.clip(g, 0, 1)[..., None], 3, axis=2)


def build_nozzle_hot(lib, size=2048):
    """Regeneratively cooled bell: round coolant tubes along the meridian, dark braze grooves, one weld seam."""
    mid = "nozzle_hot"
    a_p, n_p, o_p = _paths(mid)
    n = size
    u = (np.arange(n, dtype=np.float32) + 0.5) / n
    v = (np.arange(n, dtype=np.float32) + 0.5) / n
    uu, vv = np.meshgrid(u, v)                                       # rows = v (meridian), cols = u (angle)
    f = (uu * TUBES_PER_TILE) % 1.0
    wobble = T.fbm(n, 3, f_lo=1, f_hi=4, slope=1.0) * 0.004          # tubes are not perfectly straight
    f = (f + wobble) % 1.0
    tube = np.sqrt(np.clip(1.0 - (2.0 * f - 1.0) ** 2, 0.0, 1.0))    # round tube section
    groove = 1.0 - T.smoothstep(0.0, 0.10, tube)                     # braze seam between tubes
    seam = np.exp(-((vv - 0.5) / 0.006) ** 2) * 0.5                  # circumferential weld, one per tile
    height = 0.8 * tube - 0.5 * groove - seam
    per_tube = (np.floor(uu * TUBES_PER_TILE) * 0.6180339) % 1.0     # each tube has its own tone and roughness
    lum = 0.70 + 0.05 * (per_tube - 0.5) + 0.05 * T.fbm(n, 4, f_lo=2, f_hi=12) - 0.35 * groove - 0.10 * seam
    rough = np.clip(0.34 + 0.07 * (per_tube - 0.5) + 0.05 * T.fbm(n, 6, f_lo=3, f_hi=30) + 0.18 * groove, 0.2, 0.75)
    ao = np.clip(1.0 - 0.55 * groove - 0.3 * (seam > 0.2), 0.0, 1.0)
    normal = T.normal_from_height(height.astype(np.float32), 3.2)
    sizes = [T.save(_grey(lum), a_p), T.save(normal, n_p), T.save(T.orm(ao, rough, 0.88), o_p)]
    R.record_material(lib, mid, albedo=a_p, normal=n_p, orm=o_p, tiling_m=0.5, tint="#6A5648",
                      metallic=(0.8, 0.9), roughness=(0.2, 0.75), normal_strength=1.0, hero=True,
                      sources=[PROC])
    lib["materials"][mid].update(uv_mode="angle", tubes_per_tile=TUBES_PER_TILE, heat_tint=0.55,
                                 note="regen tube wall; u repeats around the bell, v is metres along the meridian")
    R.note_assets([PROC], f"textures/{mid}/", "Generated: tube-wall height field, braze grooves, weld seam")
    return sizes


def build_nozzle_radiative(lib, size=2048):
    """Smooth rolled dark sheet (niobium or carbon-carbon look) with faint hoop streaks and one longitudinal seam."""
    mid = "nozzle_radiative"
    a_p, n_p, o_p = _paths(mid)
    n = size
    streak = T.fbm(n, 21, f_lo=1, f_hi=60, slope=1.0)
    # anisotropic streaks along u: smear noise along the columns by averaging neighbours in one direction
    k = 24
    streak = sum(np.roll(streak, s, axis=1) for s in range(k)) / k
    streak = T.zscore(streak)
    u = (np.arange(n, dtype=np.float32) + 0.5) / n
    seam = np.exp(-((u[None, :] - 0.5) / 0.004) ** 2) * np.ones((n, 1), np.float32)
    patch = T.fbm(n, 22, f_lo=1, f_hi=5, slope=1.3)
    lum = 0.62 + 0.05 * streak + 0.03 * patch - 0.12 * seam
    rough = np.clip(0.46 + 0.05 * streak + 0.03 * patch, 0.3, 0.7)
    height = 0.15 * streak + 0.6 * seam
    sizes = [T.save(_grey(lum), a_p), T.save(T.normal_from_height(height.astype(np.float32), 1.2), n_p),
             T.save(T.orm(np.clip(1 - 0.4 * seam, 0, 1), rough, 0.75), o_p)]
    R.record_material(lib, mid, albedo=a_p, normal=n_p, orm=o_p, tiling_m=1.0, tint="#58555A",
                      metallic=(0.6, 0.8), roughness=(0.3, 0.7), normal_strength=0.8, hero=True, sources=[PROC])
    lib["materials"][mid].update(uv_mode="angle", slot="nozzle_hot", heat_tint=1.0,
                                 note="radiatively cooled extension; vertex heat drives straw-bronze-violet tint")
    R.note_assets([PROC], f"textures/{mid}/", "Generated: smeared noise streaks, one longitudinal seam")
    return sizes


def build_nozzle_ablative(lib, size=1024):
    """Matte carbon-phenolic with layered tape wrap at 35 degrees."""
    mid = "nozzle_ablative"
    a_p, n_p, o_p = _paths(mid)
    n = size
    u = (np.arange(n, dtype=np.float32) + 0.5) / n
    uu, vv = np.meshgrid(u, u)
    phase = (uu * 6.0 + vv * 6.0 * 0.7) % 1.0                        # diagonal ply bands, wraps in both axes
    ply = T.smoothstep(0.0, 0.06, phase) * (1.0 - T.smoothstep(0.94, 1.0, phase))
    edge = 1.0 - ply
    weave = 0.5 + 0.5 * np.sin(uu * 2 * np.pi * 96) * np.sin(vv * 2 * np.pi * 96)
    mott = T.fbm(n, 31, f_lo=2, f_hi=20)
    lum = 0.36 + 0.05 * mott + 0.03 * (weave - 0.5) - 0.12 * edge
    rough = np.clip(0.74 + 0.05 * mott + 0.04 * edge, 0.6, 0.9)
    height = ply * 0.6 + 0.12 * weave
    sizes = [T.save(_grey(lum), a_p), T.save(T.normal_from_height(height.astype(np.float32), 1.6), n_p),
             T.save(T.orm(1.0 - 0.5 * edge, rough, 0.0), o_p)]
    R.record_material(lib, mid, albedo=a_p, normal=n_p, orm=o_p, tiling_m=0.8, tint="#40342C",
                      metallic=(0.0, 0.05), roughness=(0.6, 0.9), normal_strength=1.0, hero=False, sources=[PROC])
    lib["materials"][mid].update(uv_mode="angle", slot="nozzle_hot", heat_tint=0.0,
                                 note="carbon-phenolic layered wrap; solid and ablative nozzles")
    R.note_assets([PROC], f"textures/{mid}/", "Generated: diagonal ply bands, weave, mottling")
    return sizes
