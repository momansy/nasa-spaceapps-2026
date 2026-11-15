"""Engine metals (T032 requeue, RUBRIC M2): fine brushed steel and a satin cast / bead-blasted finish.

Both are procedural and tileable (numpy, no downloads). They replace the ambientCG Metal009 set, whose coarse streaks
were about 3x too long and too contrasty at engine scale and ran across the pipes.

Direction contract: the brushing runs along texture **v** (image rows). MeshBuilder writes UV0 with v along the
pipe for `tube()` and along the meridian for `lathe()`, so the streaks follow ducts and turn with every elbow.

Texel density: 1024 px per 0.5 m repeat = 0.49 mm per pixel (same density as the old 2048 px / 1 m set, a quarter
of the file size). All numbers are game_value.
"""
from __future__ import annotations

import os

import numpy as np

import registry as R
import texlib as T

TEX = os.path.join(R.MATERIALS_DIR, "textures")
PROC = dict(name="Procedural (numpy generator in assets/blender/materials/source/mat_metal.py)",
            url="https://github.com/momansy/nasa-spaceapps-2026", author="MissionForge team", licence="CC0 1.0",
            date=R.DOWNLOAD_DATE)

SIZE = 1024
TILING_M = 0.5
STREAK_FINE_PX = 24          # ~12 mm micro-scratches
STREAK_LONG_PX = 64          # ~31 mm brush strokes (Metal009 strokes were ~10 cm at the old tiling)


def _paths(mid):
    d = os.path.join(TEX, mid)
    return (os.path.join(d, f"{mid}_albedo.jpg"), os.path.join(d, f"{mid}_normal.png"),
            os.path.join(d, f"{mid}_orm.jpg"))


def _grey(g):
    return np.repeat(np.clip(g, 0, 1)[..., None], 3, axis=2).astype(np.float32)


def _smear_rows(a: np.ndarray, k: int) -> np.ndarray:
    """Tileable box blur of length k along axis 0 (v): turns white noise into streaks running along v."""
    ext = np.concatenate([a, a[:k]], axis=0)
    c = np.cumsum(ext, axis=0, dtype=np.float64)
    c = np.concatenate([np.zeros((1, a.shape[1])), c], axis=0)
    return ((c[k:k + a.shape[0]] - c[:a.shape[0]]) / k).astype(np.float32)


def _soft_cols(a: np.ndarray) -> np.ndarray:
    """1-2-1 blur across the streaks so they are not single-pixel aliasing lines."""
    return (np.roll(a, 1, 1) + 2.0 * a + np.roll(a, -1, 1)) / 4.0


def brushed_field(n: int, seed: int) -> np.ndarray:
    """Zero-mean, unit-variance brushed pattern along v: fine scratches plus longer, sparser strokes."""
    rng = np.random.default_rng(seed)
    fine = _soft_cols(_smear_rows(rng.standard_normal((n, n)).astype(np.float32), STREAK_FINE_PX))
    strokes = _smear_rows(rng.standard_normal((n, n)).astype(np.float32), STREAK_LONG_PX)
    strokes = _soft_cols(_soft_cols(strokes))
    return T.zscore(0.6 * T.zscore(fine) + 0.4 * T.zscore(strokes))


def build_engine_metal(lib, size=SIZE):
    """Brushed stainless: short, low-contrast streaks along v; roughness 0.26-0.36 with faint breakup."""
    mid = "engine_metal"
    a_p, n_p, o_p = _paths(mid)
    br = brushed_field(size, 101)
    drift = T.fbm(size, 102, f_lo=2, f_hi=8, slope=1.0)              # very faint large-scale drift, no clouds
    lum = 0.86 + 0.012 * br + 0.006 * drift
    rough = np.clip(0.31 + 0.022 * br + 0.012 * drift, 0.24, 0.40)
    metal = np.full_like(rough, 0.94)
    normal = T.normal_from_height((0.35 * br).astype(np.float32), 0.6)
    sizes = [T.save(_grey(lum), a_p), T.save(normal, n_p), T.save(T.orm(1.0, rough, metal), o_p)]
    R.record_material(lib, mid, albedo=a_p, normal=n_p, orm=o_p, tiling_m=TILING_M, tint="#878C93",
                      metallic=(0.94, 0.94), roughness=(0.24, 0.40), normal_strength=0.6, hero=True, sources=[PROC])
    lib["materials"][mid].update(note="fine brushed steel; streaks run along UV0 v (along pipes and meridians)")
    R.note_assets([PROC], f"textures/{mid}/",
                  "Generated: two-scale streak noise smeared along v (12 mm and 31 mm), low contrast (+-1.2 % albedo, "
                  "+-0.022 roughness); replaces the ambientCG Metal009 set")
    return sizes


def build_engine_metal_satin(lib, size=SIZE):
    """Satin cast / bead-blasted steel for pump housings, volutes, mount plates and the kick-motor case: isotropic
    fine grain (nothing to band on spheres), rougher and slightly darker than the brushed ducts."""
    mid = "engine_metal_satin"
    a_p, n_p, o_p = _paths(mid)
    grain = T.fbm(size, 111, f_lo=120, f_hi=480, slope=0.3)
    pits = T.fbm(size, 112, f_lo=40, f_hi=120, slope=0.8)
    drift = T.fbm(size, 113, f_lo=2, f_hi=8, slope=1.0)
    lum = 0.80 + 0.010 * grain + 0.006 * pits + 0.006 * drift
    rough = np.clip(0.44 + 0.025 * grain + 0.015 * pits + 0.012 * drift, 0.36, 0.52)
    normal = T.normal_from_height((0.25 * grain + 0.15 * pits).astype(np.float32), 0.5)
    sizes = [T.save(_grey(lum), a_p), T.save(normal, n_p), T.save(T.orm(1.0, rough, 0.90), o_p)]
    R.record_material(lib, mid, albedo=a_p, normal=n_p, orm=o_p, tiling_m=TILING_M, tint="#7E838A",
                      metallic=(0.90, 0.90), roughness=(0.36, 0.52), normal_strength=0.5, hero=False, sources=[PROC])
    lib["materials"][mid].update(slot="engine_metal",
                                 note="satin cast / bead-blasted finish; variant of engine_metal (not a new slot)")
    R.note_assets([PROC], f"textures/{mid}/", "Generated: isotropic fine grain and shallow pits, no direction")
    return sizes


def drop_stale_provenance():
    """Metal009 no longer feeds textures/engine_metal/: remove its provenance row."""
    rows = R.load_json(R.THIRD_PARTY_JSON, [])
    rows = [r for r in rows if not (r["path"] == "textures/engine_metal/" and "Metal009" in r["name"])]
    R.save_json(R.THIRD_PARTY_JSON, rows)
