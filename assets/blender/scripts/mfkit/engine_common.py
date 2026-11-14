"""Shared building blocks for rocket engines, so every engine in the kit reads as one family.

Engine layout convention: origin = centre of the nozzle exit plane (z = 0), the engine
grows upward to the gimbal mount face at z = length (attach_top). `nozzle_exit` sits at
the origin, `gimbal_pivot` at the gimbal bearing just under the mount face.
"""
from __future__ import annotations

import math

from mathutils import Vector

from .core import TAU, bell_profile


def _interp(profile, z):
    """Radius of an (r, z) profile (sorted by z ascending) at height z."""
    if z <= profile[0][1]:
        return profile[0][0]
    for (r0, z0), (r1, z1) in zip(profile, profile[1:]):
        if z0 <= z <= z1:
            k = (z - z0) / (z1 - z0) if z1 > z0 else 0.0
            return r0 + (r1 - r0) * k
    return profile[-1][0]


def bell_nozzle(mb, *, z_exit, length, r_throat, r_exit, seg=48, steps=14, wall=0.012,
                theta_n=32.0, theta_e=8.0, mat_out="nozzle_hot", mat_in="nozzle_hot",
                bands=0, band_mat="engine_metal", band_size=None, band_z0=0.08, band_z1=0.92,
                heat_exit=0.30, heat_throat=1.0, lip_mat="engine_metal", z_split=None,
                mat_out_lower=None):
    """Double-walled bell from the exit plane (z_exit) up to the throat (z_exit + length).

    bands        : number of stiffening hat-bands on the outside.
    z_split      : optional height; below it the outer wall uses mat_out_lower (nozzle
                   extension of a different material, e.g. radiatively cooled skirt).
    Heat mask runs from heat_exit at the exit to heat_throat at the throat.
    Returns r_at(z): outer radius of the bell at height z (for attaching plumbing)."""
    n = mb.steps(steps, 6)
    prof = bell_profile(r_throat, r_exit, length, n, theta_n=theta_n, theta_e=theta_e, z_exit=z_exit)
    s = mb.seg(seg, 12)

    def heat_at(z):
        return heat_exit + (heat_throat - heat_exit) * (z - z_exit) / length

    heats = [heat_at(z) for _, z in prof]
    if z_split is not None and mat_out_lower is not None:
        lower = [p for p in prof if p[1] <= z_split]
        upper = [p for p in prof if p[1] >= z_split]
        r_split = _interp(prof, z_split)
        if not lower or lower[-1][1] < z_split - 1e-6:
            lower.append((r_split, z_split))
        if not upper or upper[0][1] > z_split + 1e-6:
            upper.insert(0, (r_split, z_split))
        mb.lathe(lower, s, mat_out_lower, crease=60.0, heat=[heat_at(z) * 0.8 for _, z in lower])
        mb.lathe(upper, s, mat_out, crease=60.0, heat=[heat_at(z) * 0.6 for _, z in upper])
    else:
        mb.lathe(prof, s, mat_out, crease=60.0, heat=[h * 0.6 for h in heats])
    inner = [(max(r - wall, 0.002), z) for r, z in reversed(prof)]
    mb.lathe(inner, s, mat_in, crease=60.0, heat=list(reversed(heats)))
    # exit lip
    mb.lathe([(prof[0][0] - wall, z_exit), (prof[0][0], z_exit)], s, lip_mat, heat=heat_exit)

    def r_at(z):
        return _interp(prof, z)

    if bands:
        size = band_size or max(0.008, r_exit * 0.022)
        for i in range(bands):
            if mb.lod > 0 and i % 2 == 1 and bands > 3:
                continue
            k = band_z0 + (band_z1 - band_z0) * (i / max(1, bands - 1))
            z = z_exit + length * k
            mb.torus(r_at(z) + size * 0.35, size, z, s, 4 if mb.lod else 6, band_mat, heat=heat_at(z) * 0.3)
    return r_at


def chamber(mb, *, z_throat, r_throat, r_chamber, length, seg=32, mat="engine_metal",
            dome=True, heat=0.5, flange=True):
    """Combustion chamber above the throat: converging cone, barrel, injector head.

    Returns z of the top of the injector head."""
    s = mb.seg(seg, 10)
    conv = (r_chamber - r_throat) * 1.15
    barrel = max(0.02, length - conv)
    z0 = z_throat
    prof = [(r_throat, z0), (r_throat * 1.04, z0 + conv * 0.12), (r_chamber * 0.96, z0 + conv * 0.88),
            (r_chamber, z0 + conv), (r_chamber, z0 + conv + barrel)]
    z_top = z0 + conv + barrel
    hs = [heat, heat * 0.9, heat * 0.6, heat * 0.5, heat * 0.3]
    mb.lathe(prof, s, mat, crease=50.0, heat=hs)
    if flange:
        mb.band(r_chamber, z_top - barrel * 0.18, z_top, r_chamber * 0.10, s, mat)
        if mb.want(0):
            mb.bolt_ring(r_chamber * 1.05, z_top, max(10, int(r_chamber * 60)), max(0.006, r_chamber * 0.035),
                         max(0.006, r_chamber * 0.04), mat)
    if dome:
        h = r_chamber * 0.55
        mb.dome(r_chamber * 0.98, h, z_top, s, mb.steps(4, 2), mat, up=True)
        z_top += h
    else:
        mb.lathe([(r_chamber, z_top), (0.0, z_top)], s, mat)
    return z_top


def gimbal_mount(mb, *, z_top, d, h, seg=24, mat="engine_metal", plate_mat="engine_metal"):
    """Gimbal bearing + thrust mount plate whose top face is exactly at z_top.

    d: mount plate diameter, h: total height. Returns z of the gimbal pivot."""
    s = mb.seg(seg, 10)
    r = d / 2.0
    plate_h = min(h * 0.22, 0.08)
    z_plate = z_top - plate_h
    # mount plate (closed puck, top face = interface plane)
    mb.lathe([(0.0, z_plate), (r, z_plate), (r, z_top), (0.0, z_top)], s, plate_mat)
    if mb.want(0):
        mb.bolt_ring(r * 0.82, z_plate - 0.0, max(8, int(r * 36)), max(0.006, r * 0.05),
                     -max(0.008, r * 0.06), mat)
    # bearing block: two stacked spherical-ish pieces
    z_piv = z_top - h * 0.55
    mb.lathe([(r * 0.42, z_piv), (r * 0.60, z_piv + (z_plate - z_piv) * 0.5), (r * 0.72, z_plate)], s, mat,
             crease=60.0)
    mb.sphere((0, 0, z_piv), r * 0.46, s, mb.steps(6, 4), mat)
    mb.lathe([(r * 0.55, z_top - h), (r * 0.50, z_piv - r * 0.15), (r * 0.40, z_piv)], s, mat, crease=60.0)
    return z_piv


def actuator(mb, p_engine, p_frame, r, mat="engine_metal", rod_mat="engine_metal", seg=8):
    """Gimbal actuator (hydraulic/electric strut): fat barrel + thin rod + clevis ends."""
    a, b = Vector(p_engine), Vector(p_frame)
    d = b - a
    length = d.length
    if length < 1e-6:
        return
    u = d / length
    s = mb.seg(seg, 6)
    mid = a + u * (length * 0.55)
    mb.cyl(b, mid, r, s, mat, caps=True)
    mb.cyl(mid, a, r * 0.45, s, rod_mat, caps=(False, True))
    mb.sphere(a, r * 0.75, s, 4, mat)
    mb.sphere(b, r * 0.95, s, 4, mat)


def pipe_flange(mb, p, axis, r, mat="engine_metal", thickness=None, seg=12, bolts=6):
    """Bolted flange disc around a pipe of radius r at point p, normal `axis`."""
    ax = Vector(axis).normalized()
    t = thickness or r * 0.35
    p = Vector(p)
    s = mb.seg(seg, 8)
    mb.cyl(p - ax * t / 2.0, p + ax * t / 2.0, r * 1.45, s, mat, caps=True)
    if bolts and mb.want(0):
        side = ax.orthogonal().normalized()
        other = ax.cross(side)
        for k in range(bolts):
            ang = TAU * k / bolts
            c = p + (side * math.cos(ang) + other * math.sin(ang)) * r * 1.22
            mb.cyl(c - ax * (t / 2 + r * 0.12), c + ax * (t / 2 + r * 0.12), r * 0.11, 6, mat, caps=True,
                   smooth=False)


def pump(mb, p0, p1, r, mat="engine_metal", *, volute=True, seg=16, ribs=0):
    """Turbopump body between two points: barrel with end bells, a volute collar and ribs."""
    a, b = Vector(p0), Vector(p1)
    d = b - a
    length = d.length
    if length < 1e-6:
        return
    s = mb.seg(seg, 8)
    m = d.to_track_quat("Z", "Y").to_matrix().to_4x4()
    m.translation = a
    with mb.xform(m):
        prof = [(0.0, 0.0), (r * 0.55, 0.0), (r * 0.9, length * 0.08), (r, length * 0.18),
                (r, length * 0.82), (r * 0.9, length * 0.92), (r * 0.55, length), (0.0, length)]
        mb.lathe(prof, s, mat, crease=40.0)
        if volute:
            mb.torus(r * 1.08, r * 0.30, length * 0.34, s, 6 if mb.lod == 0 else 4, mat)
            mb.band(r, length * 0.60, length * 0.68, r * 0.14, s, mat)
        if ribs and mb.want(0):
            with mb.radial(ribs):
                mb.box((r * 0.16, r * 0.08, length * 0.30), mat, center=(r * 1.04, 0, length * 0.80))
