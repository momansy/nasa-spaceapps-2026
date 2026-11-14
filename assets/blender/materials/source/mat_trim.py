"""Trim sheet mf_trim_01 (T032 step 6): 2048 x 2048, 16 units of 128 px, rows listed bottom (v=0) to top.

Every row tiles along u (2048 px = 1 m of band length, UV0 is metric). v runs across the strip. Rows are
generated from height fields: albedo is neutral grey (the `trim` slot tint colours it), the normal is derived
from the height, ORM carries cavity AO, roughness breakup and a per-row metallic value.
"""
from __future__ import annotations

import os

import numpy as np

import registry as R
import texlib as T
from mat_nozzle import PROC

N = 2048
UNIT = N // 16
# (name, units, metallic, base roughness, normal strength)
ROWS = [("weld_bead", 1.0, 0.85, 0.40, 3.0), ("rivet_single", 1.0, 0.85, 0.38, 3.0),
        ("rivet_double", 1.5, 0.85, 0.38, 3.0), ("panel_gap", 1.0, 0.6, 0.45, 3.0),
        ("hat_stringer", 2.0, 0.85, 0.36, 3.0), ("bolt_flange", 2.0, 0.9, 0.34, 3.0),
        ("bellows", 2.0, 0.92, 0.32, 3.0), ("braided_hose", 1.5, 0.25, 0.55, 3.0),
        ("cable_clamp_strip", 1.5, 0.7, 0.42, 3.0), ("hinge_latch_strip", 1.5, 0.85, 0.38, 3.0),
        ("vent_grille", 1.0, 0.5, 0.45, 3.0)]


def _dome(d, r):
    return np.sqrt(np.clip(1.0 - (d / r) ** 2, 0.0, 1.0))


def _row_height(name, w, h):
    """Height field (0..1-ish) of one row, shape (h, w); x along u (pixels), y across v (pixels)."""
    X, Y = np.meshgrid(np.arange(w, dtype=np.float32) + 0.5, np.arange(h, dtype=np.float32) + 0.5)
    t = Y / h
    if name == "weld_bead":
        ridge = np.exp(-(((t - 0.5) / 0.2) ** 2))
        ripple = 0.75 + 0.25 * np.sin(2 * np.pi * (X / 22.0 + 1.6 * (t - 0.5)))
        return 0.9 * ridge * ripple
    if name in ("rivet_single", "rivet_double"):
        rows = [0.5] if name == "rivet_single" else [0.3, 0.7]
        out = -0.35 * np.exp(-(((t - 0.5) / 0.015) ** 2)) * (1 if name == "rivet_single" else 0)
        for k, ty in enumerate(rows):
            px = 64.0
            xo = (X + (px / 2 if k else 0.0)) % px - px / 2
            out = out + _dome(np.hypot(xo, (t - ty) * h), 15.0)
        return out
    if name == "panel_gap":
        return -np.exp(-(((t - 0.5) / 0.045) ** 2)) + 0.04 * np.sin(X / 40.0)
    if name == "hat_stringer":
        up = T.smoothstep(0.22, 0.34, t) * (1.0 - T.smoothstep(0.66, 0.78, t))
        return 0.8 * up + 0.12 * (T.smoothstep(0.05, 0.12, t) * (1 - T.smoothstep(0.88, 0.95, t)))
    if name == "bolt_flange":
        plate = T.smoothstep(0.08, 0.14, t) * (1 - T.smoothstep(0.86, 0.92, t))
        px = 96.0
        xo = (X % px) - px / 2
        d = np.hypot(xo, (t - 0.5) * h)
        hexa = np.clip(1.0 - np.maximum.reduce([np.abs(xo * np.cos(a) + (t - 0.5) * h * np.sin(a))
                                                for a in (0, np.pi / 3, 2 * np.pi / 3)]) / 24.0, 0, 1)
        bolt = np.where(hexa > 0.0, 0.5 + 0.3 * np.minimum(hexa * 6, 1), 0) * (d < 30)
        washer = (d < 36) * 0.18
        return 0.35 * plate + washer * plate + bolt * plate
    if name == "bellows":
        folds = 5
        base = 0.5 + 0.5 * np.cos(2 * np.pi * folds * t)
        collar = 1.0 - T.smoothstep(0.0, 0.07, t) * (1 - T.smoothstep(0.93, 1.0, t))
        return 0.8 * base * (1 - collar) + 0.7 * collar
    if name == "braided_hose":
        a = 0.5 + 0.5 * np.sin(2 * np.pi * (X / 64.0 + Y / 64.0))
        b = 0.5 + 0.5 * np.sin(2 * np.pi * (X / 64.0 - Y / 64.0))
        over = (np.floor(X / 32.0) + np.floor(Y / 32.0)) % 2
        return np.where(over > 0.5, np.maximum(a, 0.6 * b), np.maximum(b, 0.6 * a)) * 0.8
    if name == "cable_clamp_strip":
        cable = _dome(np.abs(t - 0.5) * h, 0.22 * h) * 0.6
        px = 256.0
        xo = (X % px) - px / 2
        plate = (np.abs(xo) < 30) * (np.abs(t - 0.5) < 0.38) * 0.6
        bolt = _dome(np.hypot(xo, (t - 0.5) * h), 12.0) * 0.5 * (np.abs(xo) < 30)
        return np.maximum(cable, plate) + bolt
    if name == "hinge_latch_strip":
        px = 96.0
        k = np.floor(X / px)
        xo = (X % px) - px / 2
        pin = _dome(np.abs(t - 0.5) * h, 14.0) * 0.5
        knuckle = (np.abs(xo) < 42) * _dome(np.abs(t - np.where(k % 2 == 0, 0.38, 0.62)) * h, 34.0) * 0.8
        latch = (((X % 512.0) > 380) & ((X % 512.0) < 440)) * (np.abs(t - 0.5) < 0.3) * 0.5
        return np.maximum(np.maximum(pin, knuckle), latch)
    if name == "vent_grille":
        slot = ((X % 32.0) > 8) & ((X % 32.0) < 24) & (t > 0.2) & (t < 0.8)
        return np.where(slot, -0.9, 0.2 * (T.smoothstep(0.1, 0.2, t) * (1 - T.smoothstep(0.8, 0.9, t))))
    raise ValueError(name)


def build_trim(lib, size=N):
    ys = 0
    h_all = np.zeros((N, N), np.float32)
    rough = np.zeros((N, N), np.float32)
    metal = np.zeros((N, N), np.float32)
    rows = []
    for name, units, met, rgh, _ in ROWS:
        hpx = int(round(units * UNIT))
        height = _row_height(name, N, hpx).astype(np.float32)
        h_all[ys:ys + hpx] = height
        mott = T.fbm(N, 70 + len(rows), f_lo=3, f_hi=60, slope=1.0)[ys:ys + hpx]
        rough[ys:ys + hpx] = np.clip(rgh + 0.05 * mott + 0.08 * np.clip(-height, 0, 1), 0.2, 0.8)
        metal[ys:ys + hpx] = met
        rows.append(dict(name=name, v0=round(ys / N, 6), v1=round((ys + hpx) / N, 6)))
        ys += hpx
    assert ys == N, ys
    cavity = np.clip(0.5 + 0.5 * np.tanh(1.5 * (h_all - np.roll(h_all, 6, 0) * 0.5 - np.roll(h_all, -6, 0) * 0.5)),
                     0.55, 1.0)
    lum = np.clip(0.80 + 0.12 * h_all - 0.15 * np.clip(-h_all, 0, 1), 0.25, 1.0)
    d = os.path.join(R.MATERIALS_DIR, "trim")
    a_p, n_p, o_p = (os.path.join(d, f"mf_trim_01_{k}") for k in ("albedo.jpg", "normal.png", "orm.jpg"))
    # rows meet each other without wrapping across v: normals use a clamped edge by zeroing the seam gradient
    normal = T.normal_from_height(h_all, 3.2)
    sizes = [T.save(np.repeat(lum[..., None], 3, axis=2), a_p), T.save(normal, n_p),
             T.save(T.orm(cavity, rough, metal), o_p)]
    lib["trim"] = {"textures": {"albedo": R.rel(a_p), "normal": R.rel(n_p), "orm": R.rel(o_p)}, "size_px": N,
                   "u_repeat_m": 1.0, "tint": "#BEC1C6", "rows": rows,
                   "source": [dict(name=PROC["name"], url=PROC["url"], licence=PROC["licence"])],
                   "value_type": "game_value",
                   "note": "u: 1 repeat per metre of band length (UV0 metric); v: across the strip, inside the row range"}
    # the `trim` slot itself: same textures, so it renders and exports like any other slot
    R.record_material(lib, "trim", albedo=a_p, normal=n_p, orm=o_p, tiling_m=1.0, tint="#BEC1C6",
                      metallic=(0.25, 0.92), roughness=(0.2, 0.8), normal_strength=1.0, hero=True, sources=[PROC])
    lib["materials"]["trim"]["uv_mode"] = "trim"
    R.note_assets([PROC], "trim/", "Generated: 11 rows (weld, rivets, gap, stringer, bolt flange, bellows, braid, "
                                   "clamp, hinge/latch, vent)")
    return sizes
