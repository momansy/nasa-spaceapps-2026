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
    seam = np.exp(-((vv - 0.5) / 0.004) ** 2) * 0.25                 # faint circumferential weld, normal map only
    height = 0.8 * tube - 0.5 * groove - seam
    per_tube = (np.floor(uu * TUBES_PER_TILE) * 0.6180339) % 1.0     # each tube: a slight roughness offset only
    # albedo stays even (a plank-like tone per tube read as wood grain in T032 step 9): the tubes read through the
    # normal map and the specular ridge highlights, not through colour
    lum = 0.72 + 0.025 * T.fbm(n, 4, f_lo=1, f_hi=6) - 0.22 * groove
    rough = np.clip(0.24 + 0.025 * (per_tube - 0.5) + 0.04 * T.fbm(n, 6, f_lo=2, f_hi=12) + 0.16 * groove, 0.2, 0.6)
    ao = np.clip(1.0 - 0.5 * groove, 0.0, 1.0)
    normal = T.normal_from_height(height.astype(np.float32), 3.2)
    sizes = [T.save(_grey(lum), a_p), T.save(normal, n_p), T.save(T.orm(ao, rough, 0.88), o_p)]
    R.record_material(lib, mid, albedo=a_p, normal=n_p, orm=o_p, tiling_m=0.5, tint="#4F5155",
                      metallic=(0.8, 0.9), roughness=(0.2, 0.6), normal_strength=2.0, hero=True,
                      sources=[PROC])
    lib["materials"][mid].update(uv_mode="angle", tubes_per_tile=TUBES_PER_TILE, heat_tint=0.55, heat_range=[0.45, 0.66],
                                 note="regen tube wall; u repeats around the bell, v is metres along the meridian")
    R.note_assets([PROC], f"textures/{mid}/", "Generated: tube-wall height field, braze grooves, faint weld seam (even albedo)")
    return sizes


def _smear_cols(a: np.ndarray, k: int) -> np.ndarray:
    """Tileable box blur of length k along axis 1 (u): streaks running around the bell (spin-forming marks)."""
    ext = np.concatenate([a, a[:, :k]], axis=1)
    c = np.cumsum(ext, axis=1, dtype=np.float64)
    c = np.concatenate([np.zeros((a.shape[0], 1)), c], axis=1)
    return ((c[:, k:k + a.shape[1]] - c[:, :a.shape[1]]) / k).astype(np.float32)


def build_nozzle_radiative(lib, size=1024):
    """Smooth spun niobium-alloy sheet: a fine hoop-direction finish, one faint panel seam per repeat, NO cloudy
    mottle (T032 requeue, RUBRIC M2/M7). The colour story (straw -> bronze -> blue-violet heat tint, axial and
    smooth) comes from the shader's heat ramp on the vertex / mask heat, not from this texture."""
    mid = "nozzle_radiative"
    a_p, n_p, o_p = _paths(mid)
    n = size
    rng = np.random.default_rng(21)
    spin = T.zscore(_smear_cols(rng.standard_normal((n, n)).astype(np.float32), 96))
    spin = (np.roll(spin, 1, 0) + 2.0 * spin + np.roll(spin, -1, 0)) / 4.0
    spin = T.zscore(spin)
    u = (np.arange(n, dtype=np.float32) + 0.5) / n
    seam = np.exp(-((u[None, :] - 0.5) / 0.0025) ** 2) * np.ones((n, 1), np.float32)
    lum = 0.66 + 0.010 * spin - 0.06 * seam
    rough = np.clip(0.38 + 0.020 * spin + 0.06 * seam, 0.30, 0.50)
    height = 0.20 * spin + 0.45 * seam
    sizes = [T.save(_grey(lum), a_p), T.save(T.normal_from_height(height.astype(np.float32), 0.9), n_p),
             T.save(T.orm(np.clip(1 - 0.25 * seam, 0, 1), rough, 0.78), o_p)]
    R.record_material(lib, mid, albedo=a_p, normal=n_p, orm=o_p, tiling_m=1.0, tint="#5E5B5E",
                      metallic=(0.78, 0.78), roughness=(0.30, 0.50), normal_strength=0.7, hero=True, sources=[PROC])
    lib["materials"][mid].update(uv_mode="angle", slot="nozzle_hot", heat_tint=0.45, heat_range=[0.58, 1.0],
                                 note="radiatively cooled extension; smooth axial straw-bronze-violet heat tint from "
                                      "the heat mask; fine hoop finish, no mottle")
    R.note_assets([PROC], f"textures/{mid}/", "Generated: fine hoop-direction spin marks, one faint panel seam "
                                              "per repeat (cloudy mottle removed in the T032 requeue)")
    return sizes


def build_nozzle_ablative(lib, size=1024):
    """Matte carbon-phenolic tape wrap: many narrow plies of varying width at a shallow angle, low contrast, no
    large-scale mottle, so the wrap reads as material rather than as a repeating tile."""
    mid = "nozzle_ablative"
    a_p, n_p, o_p = _paths(mid)
    n = size
    u = (np.arange(n, dtype=np.float32) + 0.5) / n
    uu, vv = np.meshgrid(u, u)
    plies = 28
    phase = uu * 1.0 + vv * plies                                     # one turn per repeat in u, 28 plies in v
    idx = np.floor(phase)
    frac = phase - idx
    width = 0.80 + 0.18 * ((idx * 0.6180339) % 1.0)                   # each ply overlaps the next by a varying amount
    edge = T.smoothstep(width - 0.08, width, frac) * (1.0 - T.smoothstep(0.98, 1.0, frac))
    tone = ((idx * 0.7548776) % 1.0) - 0.5                            # tiny per-ply tone change
    weave = 0.5 + 0.5 * np.sin(uu * 2 * np.pi * 160) * np.sin(vv * 2 * np.pi * 160)
    grain = T.fbm(n, 31, f_lo=60, f_hi=240, slope=0.5)
    lum = 0.38 + 0.025 * tone + 0.015 * (weave - 0.5) + 0.008 * grain - 0.07 * edge
    rough = np.clip(0.76 + 0.03 * grain + 0.05 * edge, 0.65, 0.88)
    height = 0.5 * (1.0 - edge) + 0.10 * weave + 0.05 * grain
    sizes = [T.save(_grey(lum), a_p), T.save(T.normal_from_height(height.astype(np.float32), 1.2), n_p),
             T.save(T.orm(1.0 - 0.35 * edge, rough, 0.0), o_p)]
    R.record_material(lib, mid, albedo=a_p, normal=n_p, orm=o_p, tiling_m=0.8, tint="#40342C",
                      metallic=(0.0, 0.05), roughness=(0.65, 0.88), normal_strength=0.9, hero=False, sources=[PROC])
    lib["materials"][mid].update(uv_mode="angle", slot="nozzle_hot", heat_tint=0.0,
                                 note="carbon-phenolic tape wrap (28 plies of varying overlap per repeat)")
    R.note_assets([PROC], f"textures/{mid}/", "Generated: 28 varying-width tape plies, fine weave and grain, "
                                              "no large-scale mottle (T032 requeue)")
    return sizes


def build_nozzle_inner(lib, size=1024):
    """Copper-alloy hot-gas liner on the inside of regen bells and the exit lip (frames 01 and 02 show a warm bronze
    inner rim). Physical basis: regen chambers use copper-alloy liners (e.g. NARloy-Z, GRCop-84); the bronze tone
    is stylised (game_value). Same tube pattern as nozzle_hot, softer."""
    mid = "nozzle_inner"
    a_p, n_p, o_p = _paths(mid)
    n = size
    u = (np.arange(n, dtype=np.float32) + 0.5) / n
    uu, vv = np.meshgrid(u, u)
    f = (uu * TUBES_PER_TILE) % 1.0
    tube = np.sqrt(np.clip(1.0 - (2.0 * f - 1.0) ** 2, 0.0, 1.0))
    groove = 1.0 - T.smoothstep(0.0, 0.10, tube)
    grain = T.fbm(n, 41, f_lo=40, f_hi=200, slope=0.6)
    lum = 0.86 + 0.012 * grain - 0.12 * groove
    rough = np.clip(0.34 + 0.02 * grain + 0.12 * groove, 0.28, 0.50)
    height = 0.5 * tube - 0.3 * groove
    sizes = [T.save(_grey(lum), a_p), T.save(T.normal_from_height(height.astype(np.float32), 2.0), n_p),
             T.save(T.orm(np.clip(1.0 - 0.4 * groove, 0, 1), rough, 0.92), o_p)]
    R.record_material(lib, mid, albedo=a_p, normal=n_p, orm=o_p, tiling_m=0.5, tint="#B57A45",
                      metallic=(0.92, 0.92), roughness=(0.28, 0.50), normal_strength=1.2, hero=False, sources=[PROC])
    lib["materials"][mid].update(uv_mode="angle", slot="nozzle_hot", tubes_per_tile=TUBES_PER_TILE, heat_tint=0.35,
                                 heat_range=[0.55, 1.0],
                                 note="bronze copper-alloy liner inside regen bells and at the exit lip")
    R.note_assets([PROC], f"textures/{mid}/", "Generated: soft tube-wall height field, bronze tint in library.json")
    return sizes
