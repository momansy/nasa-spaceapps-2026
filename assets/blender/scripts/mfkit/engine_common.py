"""Shared building blocks for rocket engines, so every engine in the kit reads as one family.

Engine layout convention: origin = centre of the nozzle exit plane (z = 0), the engine
grows upward to the gimbal mount face at z = length (attach_top). `nozzle_exit` sits at
the origin, `gimbal_pivot` at the gimbal bearing just under the mount face.
"""
from __future__ import annotations

import math

from mathutils import Vector

from .core import TAU, bell_profile, trim_range

TUBES_PER_TILE = 12                  # nozzle_hot texture: coolant tubes per u repeat (library.json tubes_per_tile)


def frame(p, axis):
    """4x4 matrix with local +Z along axis, origin at p (for building rotated parts with mb.xform)."""
    m = Vector(axis).normalized().to_track_quat("Z", "Y").to_matrix().to_4x4()
    m.translation = Vector(p)
    return m


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
                mat_out_lower=None, tubes=None, u_repeat=None, stiffener_trim="hat_stringer"):
    """Double-walled bell from the exit plane (z_exit) up to the throat (z_exit + length).

    bands        : number of stiffening hat-bands on the outside (use 2-3: no stacks of hoop rings).
    tubes        : coolant tube count, constant from throat to exit (UV0 u is angle-normalised, one texture
                   repeat holds TUBES_PER_TILE tubes). u_repeat overrides the repeat count (smooth extensions).
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
    rep = u_repeat if u_repeat is not None else (tubes / TUBES_PER_TILE if tubes else None)
    if z_split is not None and mat_out_lower is not None:
        lower = [p for p in prof if p[1] <= z_split]
        upper = [p for p in prof if p[1] >= z_split]
        r_split = _interp(prof, z_split)
        if not lower or lower[-1][1] < z_split - 1e-6:
            lower.append((r_split, z_split))
        if not upper or upper[0][1] > z_split + 1e-6:
            upper.insert(0, (r_split, z_split))
        mb.lathe(lower, s, mat_out_lower, crease=60.0, heat=[heat_at(z) * 0.8 for _, z in lower],
                 uv_u_repeat=rep if mat_out_lower == "nozzle_hot" else 4)
        mb.lathe(upper, s, mat_out, crease=60.0, heat=[heat_at(z) * 0.6 for _, z in upper],
                 uv_u_repeat=rep if mat_out == "nozzle_hot" else 4)
    else:
        mb.lathe(prof, s, mat_out, crease=60.0, heat=[h * 0.6 for h in heats], uv_u_repeat=rep)
    inner = [(max(r - wall, 0.002), z) for r, z in reversed(prof)]
    mb.lathe(inner, s, mat_in, crease=60.0, heat=list(reversed(heats)), uv_u_repeat=rep)
    # exit lip
    mb.lathe([(prof[0][0] - wall, z_exit), (prof[0][0], z_exit)], s, lip_mat, heat=heat_exit)

    def r_at(z):
        return _interp(prof, z)

    if bands:
        size = band_size or max(0.008, r_exit * 0.022)
        for i in range(bands):
            k = band_z0 + (band_z1 - band_z0) * (i / max(1, bands - 1))
            stiffener(mb, r_at, z_exit + length * k, size * 3.2, size * 0.9, s, band_mat, trim=stiffener_trim,
                      heat=heat_at(z_exit + length * k) * 0.3)
    return r_at


def stiffener(mb, r_at, z, width, t, seg, mat="engine_metal", *, trim="hat_stringer", heat=0.0):
    """Raised hat-band that follows the wall of a surface of revolution (r_at(z)); outer face on a trim row."""
    z0, z1 = z - width / 2.0, z + width / 2.0
    ra, rb = r_at(z0), r_at(z1)
    mb.lathe([(ra, z0), (ra + t, z0)], seg, mat, heat=heat)
    outer = [(ra + t, z0), (rb + t, z1)]
    if trim:
        mb.lathe(outer, seg, "trim", heat=heat, uv_v_range=trim_range(trim))
    else:
        mb.lathe(outer, seg, mat, heat=heat)
    mb.lathe([(rb + t, z1), (rb, z1)], seg, mat, heat=heat)


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
    """Gimbal actuator (hydraulic/electric strut): fat barrel + thin rod + clevis ends (two plates and a pin)."""
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
    with mb.xform(frame(mid, u)):                                  # barrel collar at the rod seal
        mb.band(r, -r * 0.16, r * 0.16, r * 0.06, s, mat)
    for end, rr in ((a, r * 0.75), (b, r * 0.95)):
        clevis(mb, end, u, rr, mat)


def clevis(mb, p, axis, r, mat="engine_metal"):
    """U-shaped clevis at point p: two cheek plates with a cross pin, plates perpendicular to the strut."""
    ax = Vector(axis).normalized()
    side = ax.orthogonal().normalized()
    other = ax.cross(side)
    t = r * 0.28
    for k in (-1, 1):
        c = Vector(p) + side * (k * r * 0.62)
        mb.box((t, r * 1.5, r * 1.9), mat, matrix=_box_frame(c, ax, other, side))
    mb.cyl(Vector(p) - side * r * 0.95, Vector(p) + side * r * 0.95, r * 0.26, mb.seg(8, 6), mat, caps=True)


def _box_frame(c, ax, other, side):
    """Matrix placing an axis-aligned box so its X is `side`... (local x -> side, y -> other, z -> ax)."""
    from mathutils import Matrix
    m = Matrix(((side.x, other.x, ax.x, c.x), (side.y, other.y, ax.y, c.y), (side.z, other.z, ax.z, c.z),
                (0, 0, 0, 1)))
    return m


def pipe_flange(mb, p, axis, r, mat="engine_metal", thickness=None, seg=12, bolts=12):
    """Bolted flange around a pipe of radius r at point p, normal `axis`: a disc whose rim carries the
    bolt-flange trim row, plus at least 12 hex bolt heads at LOD0 (VISUAL_TARGET 2.2)."""
    ax = Vector(axis).normalized()
    t = thickness or r * 0.35
    p = Vector(p)
    s = mb.seg(max(seg, 16), 10)
    rf = r * 1.5
    with mb.xform(frame(p - ax * t / 2.0, ax)):
        mb.lathe([(r * 0.98, 0.0), (rf, 0.0)], s, mat)
        mb.lathe([(rf, 0.0), (rf, t)], s, "trim", uv_v_range=trim_range("bolt_flange"))
        mb.lathe([(rf, t), (r * 0.98, t)], s, mat)
    if bolts and mb.want(0):
        n = max(12, bolts)
        side = ax.orthogonal().normalized()
        other = ax.cross(side)
        for k in range(n):
            ang = TAU * k / n
            c = p + (side * math.cos(ang) + other * math.sin(ang)) * r * 1.26
            mb.cyl(c - ax * (t / 2 + r * 0.02), c + ax * (t / 2 + r * 0.14), r * 0.085, 6, mat, caps=(False, True),
                   smooth=False)


def bellows(mb, p0, p1, r, mat="engine_metal", *, folds=5, depth=0.22):
    """Flex bellows sleeve around a duct between p0 and p1: end collars and `folds` corrugations."""
    a, b = Vector(p0), Vector(p1)
    length = (b - a).length
    if length < 1e-6:
        return
    n = folds if mb.lod == 0 else max(2, folds // 2)
    ro = r * (1.0 + depth)
    col = min(length * 0.12, r * 0.5)
    prof = [(r * 1.0, 0.0), (r * 1.12, 0.0), (r * 1.12, col)]
    span = length - 2 * col
    for i in range(n):
        z = col + span * (i + 0.5) / n
        h = span / n / 2.0
        prof += [(r * 1.04, z - h * 0.9), (ro, z - h * 0.35), (ro, z + h * 0.35), (r * 1.04, z + h * 0.9)]
    prof += [(r * 1.12, length - col), (r * 1.12, length), (r * 1.0, length)]
    with mb.xform(frame(a, b - a)):
        mb.lathe(prof, mb.seg(16, 8), mat, crease=40.0)


def duct(mb, path, r, *, bellows_at=(0.35, 0.65), mat="engine_metal", bend=None, seg=12, bolts=12):
    """Propellant duct along `path` (polyline): pipe, `bellows_at` flex sections (fractions of the first straight
    run, at least 2 for a major duct) and a flange at each end. Returns the straight start/end directions."""
    pts = [Vector(p) for p in path]
    mb.tube(pts, r, mb.seg(seg, 8), mat, bend=bend if bend is not None else r * 2.2, bend_seg=5)
    d0 = (pts[1] - pts[0]).normalized()
    d1 = (pts[-1] - pts[-2]).normalized()
    run = (pts[1] - pts[0]).length
    for f in bellows_at:
        c = pts[0] + d0 * (run * f)
        bellows(mb, c - d0 * r * 0.8, c + d0 * r * 0.8, r, mat, folds=4)
    pipe_flange(mb, pts[0] + d0 * r * 0.4, d0, r, mat, bolts=bolts)
    pipe_flange(mb, pts[-1] - d1 * r * 0.4, d1, r, mat, bolts=bolts)
    return d0, d1


def harness(mb, path, r=0.008, *, clamps=3, mat="detail_dark", braided=False):
    """Small line or cable run: tube (rubber or braided hose) with clamp collars (cable-clamp trim) along it."""
    pts = [Vector(p) for p in path]
    if braided:
        mb.tube(pts, r, mb.seg(8, 5), "trim", bend=r * 3.0, trim="braided_hose")
    else:
        mb.tube(pts, r, mb.seg(8, 5), mat, bend=r * 3.0)
    if not mb.want(0):
        return
    total = sum((pts[i + 1] - pts[i]).length for i in range(len(pts) - 1))
    for k in range(clamps):
        target = total * (k + 1) / (clamps + 1)
        acc = 0.0
        for i in range(len(pts) - 1):
            seg_len = (pts[i + 1] - pts[i]).length
            if acc + seg_len >= target:
                d = (pts[i + 1] - pts[i]).normalized()
                c = pts[i] + d * (target - acc)
                mb.cyl(c - d * r * 1.1, c + d * r * 1.1, r * 1.9, 8, "engine_metal", caps=True, smooth=False)
                mb.box((r * 1.2, r * 1.2, r * 1.2), "engine_metal", center=tuple(c + d.orthogonal().normalized() * r * 2.0))
                break
            acc += seg_len


def volute(mb, p0, p1, r_pump, mat="engine_metal", *, z_frac=0.36, turns=0.88, outlet_len=None, end_angle=90.0):
    """Scroll (volute) case around a turbopump axis p0->p1: a tube whose section and distance from the axis grow
    along the spiral, ending in a tangential discharge. Returns (outlet point, outlet direction) in world space."""
    a, b = Vector(p0), Vector(p1)
    length = (b - a).length
    n = 22 if mb.lod == 0 else 12
    r0, r1 = r_pump * 1.05, r_pump * 1.55
    sec0, sec1 = r_pump * 0.16, r_pump * 0.34
    path, radii = [], []
    for i in range(n + 1):
        k = i / n
        ang = math.radians(end_angle) - TAU * turns * (1.0 - k)      # the scroll ends at end_angle
        rr = r0 + (r1 - r0) * k
        path.append(Vector((rr * math.cos(ang), rr * math.sin(ang), length * z_frac)))
        radii.append(sec0 + (sec1 - sec0) * k)
    last_ang = math.radians(end_angle)
    tang = Vector((-math.sin(last_ang), math.cos(last_ang), 0.0))
    out_len = outlet_len or r_pump * 1.3
    p_end = path[-1] + tang * out_len
    path.append(p_end)
    radii.append(radii[-1] * 0.9)
    with mb.xform(frame(a, b - a)):
        mb.tube(path, sec1, mb.seg(12, 8), mat, radii=radii)
    m = frame(a, b - a)
    return m @ p_end, (m.to_3x3() @ tang).normalized()


def inducer(mb, p, axis, r, mat="engine_metal"):
    """Pump inlet: a dark bore with a hub cone and four swept inducer blades visible inside the throat."""
    ax = Vector(axis).normalized()
    p = Vector(p)
    with mb.xform(frame(p, ax)):
        mb.lathe([(r * 0.97, 0.0), (0.0, 0.0)], mb.seg(16, 8), "detail_dark")
        mb.lathe([(0.0, 0.0), (r * 0.22, -r * 0.02), (r * 0.22, -r * 0.30), (0.0, -r * 0.55)], mb.seg(12, 6), mat)
        if mb.want(0):
            with mb.radial(4):
                mb.box((r * 0.72, r * 0.07, r * 0.18), mat, center=(r * 0.55, 0, -r * 0.12))


def pump(mb, p0, p1, r, mat="engine_metal", *, volute=True, seg=16, ribs=0):
    """Turbopump body between two points: barrel with end bells, a weld-bead band and ribs. Add the scroll
    case with `volute()` (kept separate so the caller can route the discharge)."""
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
            mb.band(r, length * 0.60, length * 0.68, r * 0.14, s, mat, trim="weld_bead")
        if ribs and mb.want(0):
            with mb.radial(ribs):
                mb.box((r * 0.16, r * 0.08, length * 0.30), mat, center=(r * 1.04, 0, length * 0.80))
