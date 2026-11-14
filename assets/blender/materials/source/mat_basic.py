"""Basic tiling materials: hull, engine_metal, detail_dark (T032 step 4). Sources: ambientCG, CC0.

Albedo is near-neutral luminance (mean ~0.9); the library `tint` multiplies it, so the game can recolour a slot.
ORM roughness always carries breakup (VISUAL_TARGET 2.1): paint 0.40-0.55 with +-0.05 mottling.
"""
from __future__ import annotations

import os

import numpy as np

import registry as R
import texlib as T

TEX = os.path.join(R.MATERIALS_DIR, "textures")


def _paths(mid):
    d = os.path.join(TEX, mid)
    return (os.path.join(d, f"{mid}_albedo.jpg"), os.path.join(d, f"{mid}_normal.png"),
            os.path.join(d, f"{mid}_orm.jpg"))


def _neutral_albedo(lum, mean, spread):
    """Neutral grey albedo with the given mean and +-spread, shaped like lum."""
    g = np.clip(mean + spread * T.zscore(lum), 0.0, 1.0)
    return np.repeat(g[..., None], 3, axis=2)


def build_hull(lib, size=2048):
    """Ceramic satin paint (#E8EEF0). ambientCG Metal012 supplies the micro-relief and the mottling pattern."""
    mid = "hull"
    a_p, n_p, o_p = _paths(mid)
    lum = T.luma(T.load(R.src("Metal012", "Color")))
    rgh = T.load(R.src("Metal012", "Roughness"))[..., 0]
    low = T.fbm(lum.shape[0], seed=11, f_lo=1.0, f_hi=5.0, slope=1.2)           # large soft patches
    mottle = 0.65 * low + 0.35 * T.zscore(rgh)
    albedo = _neutral_albedo(lum * 0 + mottle, 0.955, 0.012)                      # paint is even; only +-1 % drift
    rough = np.clip(0.475 + 0.032 * mottle, 0.40, 0.55)                          # 0.40-0.55, +-0.05 breakup
    normal = T.normal_scaled(T.load(R.src("Metal012", "NormalGL")), 0.35)        # faint orange peel
    sizes = [T.save(T.resize(albedo, size), a_p), T.save(T.resize(normal, size), n_p),
             T.save(T.resize(T.orm(1.0, rough, 0.0), size), o_p)]
    R.record_material(lib, mid, albedo=a_p, normal=n_p, orm=o_p, tiling_m=2.0, tint="#E8EEF0",
                      metallic=(0.0, 0.0), roughness=(0.40, 0.55), normal_strength=0.8, hero=True,
                      sources=[R.ambientcg("Metal012")])
    R.note_assets([R.ambientcg("Metal012")], f"textures/{mid}/",
                  "Colour discarded (neutral albedo); roughness and normal used as mottling / orange-peel "
                  "pattern, normal slope x0.35; mixed with procedural tileable noise")
    return sizes


def build_engine_metal(lib, size=2048):
    """Brushed cool-silver steel with directional streaks. ambientCG Metal009."""
    mid = "engine_metal"
    a_p, n_p, o_p = _paths(mid)
    lum = T.luma(T.load(R.src("Metal009", "Color")))
    rgh = T.load(R.src("Metal009", "Roughness"))[..., 0]
    albedo = _neutral_albedo(lum, 0.90, 0.045)
    rough = np.clip(0.34 + 0.07 * T.zscore(rgh), 0.22, 0.52)
    metal = np.clip(0.93 + 0.02 * T.fbm(lum.shape[0], 5, f_lo=2, f_hi=10), 0.88, 0.97)
    normal = T.load(R.src("Metal009", "NormalGL"))
    sizes = [T.save(T.resize(albedo, size), a_p), T.save(T.resize(normal[..., :3], size), n_p),
             T.save(T.resize(T.orm(1.0, rough, metal), size), o_p)]
    R.record_material(lib, mid, albedo=a_p, normal=n_p, orm=o_p, tiling_m=1.0, tint="#BEC1C6",
                      metallic=(0.88, 0.97), roughness=(0.22, 0.52), normal_strength=1.0, hero=True,
                      sources=[R.ambientcg("Metal009")])
    R.note_assets([R.ambientcg("Metal009")], f"textures/{mid}/",
                  "Colour reduced to neutral luminance; roughness remapped to 0.22-0.52; metallic from "
                  "procedural noise around 0.93; normal unchanged")
    return sizes


def build_detail_dark(lib, size=1024):
    """Dark rubber / composite / shadow-gap material with roughness breakup. ambientCG Rubber004."""
    mid = "detail_dark"
    a_p, n_p, o_p = _paths(mid)
    lum = T.luma(T.load(R.src("Rubber004", "Color")))
    rgh = T.load(R.src("Rubber004", "Roughness"))[..., 0]
    albedo = _neutral_albedo(lum, 0.80, 0.08)
    rough = np.clip(0.62 + 0.07 * T.zscore(rgh), 0.48, 0.78)
    normal = T.load(R.src("Rubber004", "NormalGL"))
    sizes = [T.save(T.resize(albedo, size), a_p), T.save(T.resize(normal[..., :3], size), n_p),
             T.save(T.resize(T.orm(1.0, rough, 0.12), size), o_p)]
    R.record_material(lib, mid, albedo=a_p, normal=n_p, orm=o_p, tiling_m=0.5, tint="#2A3A4A",
                      metallic=(0.10, 0.15), roughness=(0.48, 0.78), normal_strength=1.0, hero=False,
                      sources=[R.ambientcg("Rubber004")])
    R.note_assets([R.ambientcg("Rubber004")], f"textures/{mid}/",
                  "Downsampled to 1024; colour reduced to neutral luminance; roughness remapped 0.48-0.78")
    return sizes
