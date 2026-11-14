"""Structures: stack adapters, engine mounts and interstages (design 7.6 and 7.12)."""
from __future__ import annotations

import math

from . import spec
from .core import TAU
from .pipeline import register

GAME = "game_value"


# --------------------------------------------------------------------------- helpers
def _sc(d: float) -> float:
    """Detail-size scale so 1.5 m and 8.4 m parts both read right (1.0 at 3.7 m)."""
    return max(0.5, min(1.8, (d / 3.7) ** 0.6))


def _r_interp(prof, z: float) -> float:
    """Radius of an (r, z) wall profile (z ascending) at height z."""
    if z <= prof[0][1]:
        return prof[0][0]
    for (r0, z0), (r1, z1) in zip(prof, prof[1:]):
        if z0 <= z <= z1:
            return r0 + (r1 - r0) * ((z - z0) / (z1 - z0) if z1 > z0 else 0.0)
    return prof[-1][0]


def _clip_profile(prof, za: float, zb: float):
    """Part of a wall profile between heights za and zb (end points interpolated)."""
    pts = [(_r_interp(prof, za), za)]
    pts += [(r, z) for r, z in prof if za + 1e-6 < z < zb - 1e-6]
    pts.append((_r_interp(prof, zb), zb))
    return pts


def _shell(mb, prof, seg, t, *, mat="hull", mat_in="detail_dark", rim_mat="engine_metal",
           crease=4.0):
    """Open shell of wall thickness t: outer skin, inner skin and both end rims."""
    mb.lathe(prof, seg, mat, crease=crease)
    mb.lathe([(r - t, z) for r, z in reversed(prof)], seg, mat_in, crease=crease)
    (r0, z0), (r1, z1) = prof[0], prof[-1]
    mb.lathe([(r0 - t, z0), (r0, z0)], seg, rim_mat)
    mb.lathe([(r1, z1), (r1 - t, z1)], seg, rim_mat)


def _wall_band(mb, prof, za, zb, th, seg, mat):
    """Raised hoop that follows the wall profile between za and zb."""
    ra, rb = _r_interp(prof, za), _r_interp(prof, zb)
    mb.lathe([(ra, za), (ra + th, za), (rb + th, zb), (rb, zb)], seg, mat, crease=30.0)


def _inner_frame(mb, prof, za, zb, t, depth, seg, mat="engine_metal"):
    """Ring frame on the inside of the wall between za and zb, `depth` deep."""
    ra, rb = _r_interp(prof, za) - t, _r_interp(prof, zb) - t
    mb.lathe([(ra - depth, za), (ra + 0.002, za), (rb + 0.002, zb), (rb - depth, zb)], seg, mat,
             closed=True, crease=30.0)


def _wall_box(mb, p_lo, p_hi, th, w, mat, *, inside=False, t=0.0, embed=0.004, taper=1.0):
    """Box lying on a straight piece of wall between two (r, z) points, at angle 0.

    Use inside `mb.radial()`. inside=True puts it on the inner face (wall thickness t)."""
    (r0, z0), (r1, z1) = p_lo, p_hi
    slope = math.atan2(r1 - r0, z1 - z0)
    slant = math.hypot(r1 - r0, z1 - z0)
    off = -(t + th / 2.0 - embed) if inside else (th / 2.0 - embed)
    with mb.xform(loc=(r0, 0.0, z0), rot_y=slope):
        mb.box((th, w, slant), mat, center=(off, 0.0, slant / 2.0), taper=taper)


def _wall_panel(mb, prof, z0, z1, width, th, mat, ang, seg=3):
    """Raised curved panel (door, plate) that follows the wall profile. width in metres."""
    r_mid = _r_interp(prof, (z0 + z1) / 2.0)
    aw = width / r_mid
    a0, a1 = ang - aw / 2.0, ang + aw / 2.0
    s = max(1, seg if mb.lod == 0 else (seg + 1) // 2)
    ra, rb = _r_interp(prof, z0), _r_interp(prof, z1)
    mb.lathe([(ra, z0), (ra + th, z0), (rb + th, z1), (rb, z1)], s, mat, sweep=(a0, a1), crease=30.0)
    for a, rev in ((a0, False), (a1, True)):
        c, sn = math.cos(a), math.sin(a)
        quad = [(ra * c, ra * sn, z0), (rb * c, rb * sn, z1),
                ((rb + th) * c, (rb + th) * sn, z1), ((ra + th) * c, (ra + th) * sn, z0)]
        if rev:
            quad.reverse()
        mb.face(quad, mat)


def _beam(mb, a, b, z0, h, w, mat="engine_metal"):
    """I-beam between two (x, y) points, sitting on z0."""
    dx, dy = b[0] - a[0], b[1] - a[1]
    length = math.hypot(dx, dy)
    if length < 1e-6:
        return
    with mb.xform(loc=(a[0], a[1], z0), rot_z=math.atan2(dy, dx)):
        mb.box((length, w * 0.22, h), mat, center=(length / 2.0, 0.0, h / 2.0))
        mb.box((length, w, h * 0.10), mat, center=(length / 2.0, 0.0, h * 0.95))
        if mb.want(0):
            mb.box((length, w, h * 0.10), mat, center=(length / 2.0, 0.0, h * 0.05))


def mating_flange(mb, radius, z, mat="engine_metal", *, up=True, height=0.05, depth=0.045,
                  bolts=True):
    """Field-joint ring just inside a mating plane: an inward flange plus a bolt circle.

    The flange stays inside `radius`, so the outer skin keeps the exact stack diameter."""
    seg = mb.seg(max(24, int(radius * 26)), 16)
    z_in = z + height if up else z - height
    lo, hi = min(z, z_in), max(z, z_in)
    r_in = radius - depth
    # closed loop, counter-clockwise in r-z: solid ring hugging the inside of the skin
    mb.lathe([(r_in, lo), (radius - 0.004, lo), (radius - 0.004, hi), (r_in, hi)], seg, mat, closed=True)
    if bolts and mb.want(0):
        n = max(12, int(radius * 16))
        mb.bolt_ring(radius - depth * 0.5, hi if up else lo, n,
                     max(0.008, depth * 0.22), 0.012 if up else -0.012, mat)


def gen_adapter(ctx):
    """Plain conical adapter between two stack diameters (payload attach / fairing boat-tail)."""
    mb = ctx.mesh()
    d_bot, d_top = ctx.params["d_bottom"], ctx.params["d_top"]
    rb, rt = d_bot / 2.0, d_top / 2.0
    length = spec.adapter_length(d_bot, d_top)
    seg = mb.seg(max(32, int(max(rb, rt) * 22)), 20)
    ring = min(0.12, length * 0.12)          # short cylindrical land at each end
    t = spec.SKIN

    # outer skin (bottom -> top = outward) and inner skin (top -> bottom = inward)
    outer = [(rb, 0.0), (rb, ring), (rt, length - ring), (rt, length)]
    mb.lathe(outer, seg, "hull", crease=60.0)
    inner = [(rt - t, length), (rt - t, length - ring), (rb - t, ring), (rb - t, 0.0)]
    mb.lathe(inner, seg, "detail_dark", crease=60.0)
    # rims
    mb.lathe([(rb - t, 0.0), (rb, 0.0)], seg, "engine_metal")
    mb.lathe([(rt, length), (rt - t, length)], seg, "engine_metal")

    # livery stripe band around the middle of the cone
    def r_at(z):
        k = (z - ring) / (length - 2 * ring)
        return rb + (rt - rb) * max(0.0, min(1.0, k))

    z0, z1 = length * 0.42, length * 0.58
    mb.lathe([(r_at(z0) + 0.006, z0), (r_at(z1) + 0.006, z1)], seg, "livery")

    # external stringers along the cone
    if mb.want(0):
        n = max(12, int(max(rb, rt) * 10))
        slope = math.atan2(rt - rb, length - 2 * ring)
        slant = math.hypot(rt - rb, length - 2 * ring)
        w = 0.03 + 0.004 * max(rb, rt)
        with mb.radial(n, phase=TAU / n / 2.0):
            # box built along +Z, tilted to follow the cone, then moved to the skin
            with mb.xform(loc=(rb + 0.012, 0.0, ring), rot_y=slope):
                mb.box((0.03, w, slant * 0.94), "hull", center=(0.0, 0.0, slant / 2.0))

    mating_flange(mb, rb - t, 0.0, up=True, height=min(0.06, ring * 0.5))
    mating_flange(mb, rt - t, length, up=False, height=min(0.06, ring * 0.5))

    ctx.empty("attach_top", (0, 0, length))
    ctx.meta.update(length_m=length, diameter_bottom_m=d_bot, diameter_top_m=d_top,
                    value_types=dict(length_m="game_value", diameter_bottom_m="game_value",
                                     diameter_top_m="game_value"))


for _db, _dt in spec.ADAPTER_PAIRS:
    register(spec.adapter_id(_db, _dt), "adapter", gen_adapter, "7.5 (fairing mating)",
             d_bottom=_db, d_top=_dt)


# =========================================================================== S1 mounts
def _thrust_pad(mb, x, y, z_face, pad_h, pad_r, seg):
    """Round thrust pad whose LOWER face (the engine interface) is exactly at z_face."""
    mb.cyl((x, y, z_face), (x, y, z_face + pad_h + 0.004), pad_r, seg, "engine_metal",
           caps=(True, False))
    with mb.xform(loc=(x, y, 0.0)):
        # blanket boot around the pad and a ring of fasteners in the closeout
        mb.torus(pad_r * 1.10, pad_h * 0.42, z_face + pad_h, seg, 6 if mb.lod == 0 else 4, "detail_dark")
        if mb.want(0):
            mb.bolt_ring(pad_r * 1.42, z_face + pad_h, max(8, int(pad_r * 40)),
                         max(0.006, pad_r * 0.045), -pad_h * 0.7, "engine_metal")


def _s1_pad_radius(clear: float, radius: float) -> float:
    return round(min(clear * 0.30, 0.30 * radius + 0.05, 0.85), 3)


def gen_mount_s1(ctx):
    """First-stage engine section: aft skirt, thrust structure, base heat shield, engine pads."""
    mb = ctx.mesh()
    n, d = ctx.params["count"], ctx.params["d"]
    R = d / 2.0
    H = spec.S1_MOUNT[d]["height"]
    rec = spec.S1_MOUNT[d]["recess"]
    sc = _sc(d)
    t = spec.SKIN
    seg = mb.seg(max(32, int(R * 22)), 20)
    pattern = spec.s1_pattern(n, d)
    clear = spec.slot_clear_diameter(pattern, d, False)
    pad_r = _s1_pad_radius(clear, R)
    pad_h = 0.035 * sc
    plate_t = 0.05 * sc
    z_p0 = rec + pad_h            # lower face of the closeout (heat shield)
    z_p1 = z_p0 + plate_t         # upper face = thrust plate
    wall = [(R, 0.0), (R, H)]

    # ---- skirt
    _shell(mb, wall, seg, t)
    zb1 = max(0.09, rec * 0.82)
    mb.lathe([(R, 0.03), (R + 0.006, 0.037), (R + 0.006, zb1 - 0.007), (R, zb1)], seg, "thermal",
             crease=30.0)                                  # cork/ablative band around the base
    mb.lathe([(R + 0.005, H * 0.80), (R + 0.005, H * 0.91)], seg, "livery")
    _wall_band(mb, wall, H * 0.755, H * 0.785, 0.014 * sc, seg, "hull")
    _wall_band(mb, wall, H * 0.925, H * 0.955, 0.012 * sc, seg, "engine_metal")
    if mb.want(0):
        ns = max(16, int(R * 16))
        with mb.radial(ns, phase=TAU / ns / 2.0):
            _wall_box(mb, (R, zb1 + 0.02), (R, H * 0.75), 0.022 * sc, 0.03 * sc + 0.004 * R, "hull")
    # inner ring frames (seen from below in the engine cavity and from above)
    _inner_frame(mb, wall, rec * 0.42, rec * 0.42 + 0.05 * sc, t, 0.05 * sc, seg)
    _inner_frame(mb, wall, H * 0.84, H * 0.84 + 0.05 * sc, t, 0.05 * sc, seg)
    mating_flange(mb, R - t, H, up=False, height=min(0.06, H * 0.06))

    # ---- base closeout: heat shield below, thrust plate above
    mb.lathe([(0.0, z_p0), (R - t + 0.002, z_p0)], seg, "thermal")
    mb.lathe([(R - t + 0.002, z_p1), (0.0, z_p1)], seg, "engine_metal")
    mb.torus(R - t - 0.03 * sc, 0.022 * sc, z_p0, seg, 6 if mb.lod == 0 else 4, "detail_dark")
    if mb.want(0) and n > 1:
        # blanket seams between the engine bays
        ring_a = math.atan2(pattern[-1][1], pattern[-1][0])
        nseam = len(pattern) - (1 if n in (5, 9) else 0)
        with mb.radial(nseam, phase=ring_a + TAU / nseam / 2.0):
            mb.box((R - t - 0.06 * sc - pad_r * 0.2, 0.025 * sc, 0.012 * sc), "detail_dark",
                   center=((R - t - 0.06 * sc + pad_r * 0.2) / 2.0 + pad_r * 0.2, 0.0, z_p0 - 0.004 * sc))
    pad_seg = mb.seg(max(16, int(pad_r * 44)), 12)
    for x, y in pattern:
        _thrust_pad(mb, x, y, rec, pad_h, pad_r, pad_seg)

    # ---- thrust structure above the plate
    web_h = (H - z_p1) * 0.56
    z_stub = H - max(0.03, 0.045 * H)
    stubs = []                     # (x, y) of each propellant feed stub
    if n == 9:
        rc = pad_r * 1.55
        tw = 0.03 * sc
        mb.lathe([(rc - tw, z_p1), (rc, z_p1), (rc, z_p1 + web_h), (rc - tw, z_p1 + web_h)],
                 mb.seg(32, 16), "engine_metal", closed=True)
        ro = math.hypot(*pattern[1]) + pad_r * 1.5
        if ro < R - t - 0.08:
            mb.lathe([(ro - tw, z_p1), (ro, z_p1), (ro, z_p1 + web_h * 0.7), (ro - tw, z_p1 + web_h * 0.7)],
                     seg, "engine_metal", closed=True)
        with mb.radial(8, phase=TAU / 16.0):
            _beam(mb, (rc - tw * 0.5, 0.0), (R - t, 0.0), z_p1, web_h, pad_r * 0.55)
        stubs = list(pattern)
    elif n == 5:
        w = pad_r * 0.7
        c45 = math.cos(math.pi / 4.0) * (R - t)
        _beam(mb, (-c45, -c45), (c45, c45), z_p1, web_h, w)
        _beam(mb, (c45, -c45), (-c45, c45), z_p1, web_h * 0.98, w)
        outer = pattern[1:]
        for i in range(4):
            _beam(mb, outer[i], outer[(i + 1) % 4], z_p1, web_h * 0.62, w * 0.6)
        stubs = [(pad_r * 1.05, 0.0)]
        for x, y in outer:
            a = math.atan2(y, x)
            stubs.append((x - math.sin(a) * pad_r * 0.9, y + math.cos(a) * pad_r * 0.9))
    elif n == 3:
        w = pad_r * 0.7
        hub = pad_r * 0.75
        mb.cyl((0, 0, z_p1), (0, 0, z_p1 + web_h * 1.05), hub, mb.seg(24, 12), "engine_metal",
               caps=(False, True))
        for x, y in pattern:
            a = math.atan2(y, x)
            _beam(mb, (math.cos(a) * hub * 0.9, math.sin(a) * hub * 0.9),
                  (math.cos(a) * (R - t), math.sin(a) * (R - t)), z_p1, web_h, w)
            stubs.append((x - math.sin(a) * pad_r * 0.9, y + math.cos(a) * pad_r * 0.9))
        for i in range(3):
            _beam(mb, pattern[i], pattern[(i + 1) % 3], z_p1, web_h * 0.6, w * 0.6)
    else:
        # single engine: thrust cone spreading the load from the pad into the skirt
        r0, r1 = pad_r * 1.15, R - t - 0.02
        z1 = H - max(0.10, 0.14 * H)
        cone = [(r0, z_p1), (r1, z1)]
        cseg = mb.seg(max(28, int(R * 18)), 16)
        mb.lathe(cone, cseg, "engine_metal")
        mb.lathe([(r1 - 0.015, z1), (r0 - 0.015, z_p1)], cseg, "engine_metal")
        mb.lathe([(r1, z1), (r1 - 0.015, z1)], cseg, "engine_metal")
        if mb.want(0):
            with mb.radial(12, phase=TAU / 24.0):
                _wall_box(mb, cone[0], cone[1], 0.07 * sc, 0.03 * sc, "engine_metal", inside=True,
                          t=0.015, taper=0.5)
        mb.band(r0 - 0.015, z_p1, z_p1 + 0.05 * sc, -0.03 * sc, cseg, "engine_metal")
        stubs = [(0.0, 0.0)]
    fr = pad_r * (0.34 if n == 1 else 0.30)
    fseg = mb.seg(16, 8)
    for x, y in stubs:
        mb.cyl((x, y, z_p1), (x, y, z_stub), fr, fseg, "engine_metal", caps=(False, True))
        mb.cyl((x, y, z_stub - fr * 0.5), (x, y, z_stub + 0.001), fr * 0.78, fseg, "detail_dark",
               caps=(False, True))
        zf = z_p1 + (z_stub - z_p1) * 0.72
        mb.cyl((x, y, zf), (x, y, zf + fr * 0.35), fr * 1.4, fseg, "engine_metal", caps=True)
        mb.cyl((x, y, z_p1), (x, y, z_p1 + fr * 0.5), fr * 1.5, fseg, "engine_metal", caps=(False, True))

    # ---- hold-down lugs, umbilical plate, vents
    lug_phase = 0.0 if n == 5 else TAU / 8.0
    lt, lw, lh = 0.05 * R, 0.11 * R, max(0.12, rec * 0.72)
    with mb.radial(4, phase=lug_phase):
        mb.box((lt, lw, lh), "engine_metal", center=(R + lt * 0.25, 0.0, 0.03 + lh / 2.0), taper=0.5)
        if mb.want(0):
            mb.cyl((R + lt * 0.42, -lw * 0.56, 0.03 + lh * 0.3), (R + lt * 0.42, lw * 0.56, 0.03 + lh * 0.3),
                   lt * 0.22, 8, "detail_dark", caps=True)
    a_umb = math.radians(197.0)
    uz0, uz1 = H * 0.46, H * 0.72
    _wall_panel(mb, wall, uz0, uz1, 0.26 * R + 0.1, 0.03 * sc, "engine_metal", a_umb, seg=4)
    if mb.want(0):
        with mb.xform(rot_z=a_umb):
            for k, dz in enumerate((0.25, 0.5, 0.75)):
                rr = (0.05 if k == 1 else 0.035) * sc
                mb.cyl((R + 0.02 * sc, 0.0, uz0 + (uz1 - uz0) * dz), (R + 0.03 * sc + rr * 1.2, 0.0, uz0 + (uz1 - uz0) * dz),
                       rr, 10, "detail_dark", caps=(False, True))
    for a_deg in (70.0, 160.0, 250.0, 340.0) if mb.want(0) else ():
        a = math.radians(a_deg)
        vz0 = H * 0.52
        _wall_panel(mb, wall, vz0, vz0 + 0.12 * sc + 0.03 * R, 0.14 * R + 0.06, 0.028 * sc, "hull", a, seg=2)
        _wall_panel(mb, wall, vz0 + 0.025 * sc, vz0 + 0.095 * sc + 0.03 * R, 0.14 * R + 0.06 - 0.05 * sc,
                    0.033 * sc, "detail_dark", a, seg=2)

    # ---- engine fairings for the overhanging outboard engines (8.4 m, five engines)
    if n == 5 and d > 8.0:
        ring_r = math.hypot(*pattern[1])
        rs0, rs1 = 1.98, R - ring_r + 0.04
        z0, z1 = 0.03, H * 0.97
        k_n = mb.steps(7, 4)
        prof = []
        for i in range(k_n + 1):
            k = i / k_n
            prof.append((rs1 + (rs0 - rs1) * (1.0 - k) ** 0.62, z0 + (z1 - z0) * k))
        sseg = mb.seg(18, 10)
        for x, y in pattern[1:]:
            a = math.atan2(y, x)
            with mb.xform(loc=(x, y, 0.0), rot_z=a):
                mb.lathe(prof, sseg, "hull", sweep=(-math.pi * 0.52, math.pi * 0.52), crease=50.0)
                mb.lathe([(r - 0.025, z) for r, z in reversed(prof)], sseg, "detail_dark",
                         sweep=(-math.pi * 0.52, math.pi * 0.52), crease=50.0)
                mb.lathe([(rs0 - 0.025, z0), (rs0, z0)], sseg, "engine_metal",
                         sweep=(-math.pi * 0.52, math.pi * 0.52))
                mb.lathe([(rs0 + 0.004, z0 + 0.12), (_r_interp(prof, z0 + 0.5) + 0.004, z0 + 0.5)], sseg,
                         "thermal", sweep=(-math.pi * 0.5, math.pi * 0.5))

    for i, (x, y) in enumerate(pattern, 1):
        ctx.empty(f"attach_engine_{i}", (x, y, rec))
    ctx.empty("attach_top", (0, 0, H))
    ctx.meta.update(
        length_m=H, diameter_bottom_m=d, diameter_top_m=d, engine_count=n, stage=1,
        engine_attach_z_m=rec, slot_clear_diameter_m=clear, thrust_pad_diameter_m=round(pad_r * 2, 3),
        value_types=dict(length_m=GAME, diameter_bottom_m=GAME, diameter_top_m=GAME,
                         engine_attach_z_m=GAME, slot_clear_diameter_m=GAME, thrust_pad_diameter_m=GAME))


for _d in spec.DIAMETERS.values():
    for _n in spec.S1_ENGINE_COUNTS:
        register(f"mount_s1_{_n}_{spec.dkey(_d)}", "mount_s1", gen_mount_s1, "7.6", count=_n, d=_d)


# =========================================================================== S2 mounts
def gen_mount_s2(ctx):
    """Upper-stage thrust frame hanging under the tank, inside the interstage."""
    mb = ctx.mesh()
    n, d = ctx.params["count"], ctx.params["d"]
    R = d / 2.0
    H = spec.S2_MOUNT[d]["height"]
    keep = spec.interstage_keepout(d)
    Rm = R - keep - 0.02                      # nothing may exceed this radius
    sc = _sc(d)
    seg = mb.seg(max(28, int(Rm * 24)), 16)
    pattern = spec.s2_pattern(n, d)
    clear = spec.slot_clear_diameter(pattern, d, True)
    pad_r = round(min(clear * 0.30, 0.45 * Rm, 0.46), 3)
    pad_h = 0.10 * H
    rim_h = 0.08 * H
    z_rim = H - rim_h
    dome_r = Rm * 0.955
    dome_h = 0.42 * H

    def dome_z(r):
        return z_rim - dome_h * math.sqrt(max(0.0, 1.0 - (r / dome_r) ** 2))

    # ---- top closure, attach ring, blanketed aft dome
    Rw = Rm - 0.014 * sc                      # attach ring wall (its bolt heads reach Rm)
    mb.lathe([(Rw, H), (0.0, H)], seg, "detail_dark")
    mb.lathe([(dome_r, z_rim), (Rw, z_rim), (Rw, H)], seg, "engine_metal")
    mb.dome(dome_r, dome_h, z_rim, seg, mb.steps(6, 3), "thermal", up=False)
    for frac in (0.45, 0.8):
        rr = dome_r * frac
        mb.torus(rr, 0.012 * sc, dome_z(rr) - 0.004 * sc, seg, 4, "detail_dark")
    if mb.want(0):
        mb.bolt_ring(Rw, z_rim + rim_h * 0.5, max(16, int(Rm * 14)), max(0.008, 0.016 * sc), 0.012 * sc,
                     "engine_metal", axis="R")

    # ---- thrust pads (lower face at z = 0) and frames
    pad_seg = mb.seg(max(16, int(pad_r * 44)), 12)
    strut_r = max(0.012, 0.028 * Rm)
    top_r = 0.80 * dome_r
    for x, y in pattern:
        mb.cyl((x, y, 0.0), (x, y, pad_h), pad_r, pad_seg, "engine_metal", caps=True)
        with mb.xform(loc=(x, y, 0.0)):
            mb.torus(pad_r, pad_h * 0.22, pad_h * 0.55, pad_seg, 4, "detail_dark")
            # central load column up into the dome
            mb.lathe([(pad_r * 0.78, pad_h), (pad_r * 0.36, max(pad_h * 1.5, dome_z(math.hypot(x, y)) + 0.02))],
                     pad_seg, "engine_metal")
    if n == 1:
        nn = 8
        for i in range(nn):
            a_b = TAU * (i + 0.5) / nn
            pb = (pad_r * 0.92 * math.cos(a_b), pad_r * 0.92 * math.sin(a_b), pad_h * 0.6)
            for a_t in (TAU * i / nn, TAU * (i + 1) / nn):
                pt = (top_r * math.cos(a_t), top_r * math.sin(a_t), dome_z(top_r) + 0.01)
                mb.strut(pb, pt, strut_r, seg=mb.seg(8, 6))
        if mb.want(0):
            with mb.radial(nn):
                mb.sphere((top_r, 0.0, dome_z(top_r)), strut_r * 1.9, 8, 4, "engine_metal")
    else:
        (xa, ya), (xb, yb) = pattern
        _beam(mb, (xa, ya), (xb, yb), pad_h * 0.25, pad_h * 1.5, pad_r * 0.6)
        reach = 0.34 * Rm
        for x, y in pattern:
            for dx, dy in ((1, 1), (-1, 1), (-1, -1), (1, -1)):
                tx, ty = x + dx * reach, y + dy * reach
                rr = math.hypot(tx, ty)
                if rr > top_r:
                    tx, ty = tx * top_r / rr, ty * top_r / rr
                    rr = top_r
                pb = (x + dx * pad_r * 0.62, y + dy * pad_r * 0.62, pad_h * 0.6)
                pt = (tx, ty, dome_z(rr) + 0.01)
                mb.strut(pb, pt, strut_r, seg=mb.seg(8, 6))
                if mb.want(0):
                    mb.sphere(pt, strut_r * 1.9, 8, 4, "engine_metal")

    # ---- pressurant bottles under the dome
    br = min(0.13 * Rm, 0.22 * H)
    b_r = 0.72 * Rm
    zc = dome_z(b_r) - br * 0.8
    with mb.radial(4, phase=TAU / 16.0):
        mb.sphere((b_r, 0.0, zc), br, mb.seg(16, 10), mb.steps(8, 5), "detail_dark")
        mb.cyl((b_r, 0.0, zc + br * 0.9), (b_r, 0.0, dome_z(b_r) + 0.01), br * 0.22, 8, "engine_metal",
               caps=False)
        if mb.want(0):
            with mb.xform(loc=(b_r, 0.0, zc)):
                mb.torus(br * 1.0, br * 0.07, 0.0, mb.seg(16, 10), 4, "engine_metal")

    # ---- propellant feed lines from the dome down to each pad
    fr = max(0.012, pad_r * 0.2)
    for x, y in pattern:
        base_a = math.atan2(y, x) if n == 2 else 0.0
        for side in (1.0, -1.0):
            a = base_a + side * math.pi / 2.0
            ex, ey = x + math.cos(a) * pad_r * 0.55, y + math.sin(a) * pad_r * 0.55
            sx, sy = x + math.cos(a) * pad_r * 1.5, y + math.sin(a) * pad_r * 1.5
            rr = math.hypot(sx, sy)
            if rr > dome_r * 0.6:
                sx, sy = sx * dome_r * 0.6 / rr, sy * dome_r * 0.6 / rr
                rr = dome_r * 0.6
            zt = dome_z(rr) + 0.01
            mb.tube([(sx, sy, zt), (sx, sy, pad_h * 2.3), (ex, ey, pad_h * 1.5), (ex, ey, pad_h * 0.9)],
                    fr, mb.seg(10, 6), "engine_metal", bend=fr * 2.2)
            if mb.want(0):
                mb.cyl((sx, sy, (zt + pad_h * 2.3) / 2.0), (sx, sy, (zt + pad_h * 2.3) / 2.0 + fr * 0.6),
                       fr * 1.5, 10, "engine_metal", caps=True)

    for i, (x, y) in enumerate(pattern, 1):
        ctx.empty(f"attach_engine_{i}", (x, y, 0.0))
    ctx.empty("attach_top", (0, 0, H))
    ctx.meta.update(
        length_m=H, diameter_bottom_m=round(2 * Rm, 3), diameter_top_m=round(2 * Rm, 3),
        ring_check=False, engine_count=n, stage=2, stack_diameter_m=d, engine_attach_z_m=0.0,
        slot_clear_diameter_m=clear, thrust_pad_diameter_m=round(pad_r * 2, 3),
        value_types=dict(length_m=GAME, diameter_bottom_m=GAME, diameter_top_m=GAME,
                         stack_diameter_m=GAME, engine_attach_z_m=GAME, slot_clear_diameter_m=GAME,
                         thrust_pad_diameter_m=GAME))


for _d in spec.DIAMETERS.values():
    for _n in spec.S2_ENGINE_COUNTS:
        register(f"mount_s2_{_n}_{spec.dkey(_d)}", "mount_s2", gen_mount_s2, "7.6", count=_n, d=_d)


# =========================================================================== interstages
def _ullage_pod(mb, prof, z_top, rp, cant):
    """Small solid ullage motor on the outside of the wall (built at angle 0).

    Its top is at z_top; the canted nozzle at the bottom points down and outward."""
    lb = 3.6 * rp
    slope = math.atan2(_r_interp(prof, z_top) - _r_interp(prof, z_top - lb), lb)
    s = mb.seg(14, 8)
    tan_c = math.tan(cant)

    def x_wall(zl):                     # wall position in pod-local coordinates
        return -0.78 * rp + zl * tan_c

    with mb.xform(loc=(_r_interp(prof, z_top) + rp * 0.78, 0.0, z_top), rot_y=slope - cant):
        body = [(0.0, -lb), (rp * 0.86, -lb), (rp, -lb + 0.2 * rp), (rp, 0.0), (rp * 0.78, 0.7 * rp),
                (rp * 0.38, 1.25 * rp), (0.0, 1.45 * rp)]
        mb.lathe(body, s, "hull", crease=50.0)
        mb.lathe([(rp * 1.012, -lb * 0.62), (rp * 1.012, -lb * 0.44)], s, "livery")
        mb.lathe([(rp * 0.62, -lb - 0.9 * rp), (rp * 0.30, -lb - 0.02 * rp)], s, "nozzle_hot",
                 heat=[0.35, 1.0])
        mb.lathe([(rp * 0.26, -lb - 0.02 * rp), (rp * 0.58, -lb - 0.9 * rp)], s, "nozzle_hot",
                 heat=[1.0, 0.5])
        mb.lathe([(rp * 0.58, -lb - 0.9 * rp), (rp * 0.62, -lb - 0.9 * rp)], s, "engine_metal")
        for zl in (-0.18 * lb, -0.80 * lb):
            x0 = x_wall(zl) - 0.008
            mb.box((-x0, rp * 0.7, rp * 0.5), "engine_metal", center=(x0 / 2.0, 0.0, zl))


def gen_interstage(ctx):
    """Interstage for one separation system (design 7.12); stays with the first stage."""
    mb = ctx.mesh()
    system = ctx.params["system"]
    d_bot, d_top = ctx.params["d_bottom"], ctx.params["d_top"]
    rb, rt = d_bot / 2.0, d_top / 2.0
    L = spec.INTERSTAGE_LENGTH[d_top]
    keep = spec.interstage_keepout(d_top)
    sc = _sc(d_top)
    t = spec.SKIN
    r_big = max(rb, rt)
    seg = mb.seg(max(32, int(r_big * 22)), 20)
    tapered = abs(rb - rt) > 1e-6
    land_b, land_t = 0.10 * L, 0.14 * L
    wall = [(rb, 0.0), (rb, land_b), (rt, L - land_t), (rt, L)] if tapered else [(rb, 0.0), (rt, L)]
    z_sep = L - 0.07 * L
    gap = 0.035 * sc

    def r_at(z):
        return _r_interp(wall, z)

    def inner_ribs(za, zb, count):
        """Isogrid-style ribs on the inside of the wall (straight piece between za and zb)."""
        depth = min(0.5 * keep, 0.05 * sc)
        with mb.radial(count, phase=TAU / count / 2.0):
            _wall_box(mb, (r_at(za), za), (r_at(zb), zb), depth, 0.022 * sc, "engine_metal",
                      inside=True, t=t)

    def separation_joint():
        """Dark joint line of the separation plane with a metal doubler either side."""
        mb.band(rt, z_sep - gap / 2.0, z_sep + gap / 2.0, 0.004, seg, "detail_dark")
        mb.band(rt, z_sep + gap / 2.0, z_sep + gap / 2.0 + 0.055 * sc, 0.009 * sc, seg, "engine_metal")
        mb.band(rt, z_sep - gap / 2.0 - 0.055 * sc, z_sep - gap / 2.0, 0.009 * sc, seg, "engine_metal")

    def door(z0, height, ang):
        width = min(0.62 * sc, 0.9 * r_at(z0))
        _wall_panel(mb, wall, z0, z0 + height, width, 0.026 * sc, "engine_metal", ang, seg=4)
        _wall_panel(mb, wall, z0 + 0.04 * sc, z0 + height - 0.04 * sc, width - 0.08 * sc, 0.031 * sc,
                    "hull", ang, seg=4)
        if mb.want(0):
            zc = z0 + height * 0.5
            with mb.xform(rot_z=ang + (width * 0.3) / r_at(zc)):
                mb.box((0.02 * sc, 0.035 * sc, 0.12 * sc), "detail_dark",
                       center=(r_at(zc) + 0.036 * sc, 0.0, zc))

    frame_depth = min(0.5 * keep, 0.06 * sc)
    n_ribs = max(12, int(r_big * 9))

    if system != "hot_staging":
        _shell(mb, wall, seg, t)
        mating_flange(mb, rb - t, 0.0, up=True, height=min(0.06, land_b * 0.5))
        mating_flange(mb, rt - t, L, up=False, height=min(0.06, land_t * 0.3))
        separation_joint()
        zl0, zl1 = 0.60 * L, 0.685 * L
        mb.lathe([(r_at(zl0) + 0.006, zl0), (r_at(zl1) + 0.006, zl1)], seg, "livery")
        # inner ring frames + ribs
        z_lo = land_b if tapered else 0.10 * L
        z_hi = L - land_t if tapered else 0.86 * L
        for k in (0.0, 0.5, 1.0):
            zf = z_lo + (z_hi - z_lo) * k
            _inner_frame(mb, wall, zf - 0.02 * sc, zf + 0.02 * sc, t, frame_depth, seg)
        if mb.want(0):
            inner_ribs(z_lo, z_hi, n_ribs)
        door(0.26 * L, min(0.95 * sc, 0.2 * L), math.radians(205.0))

    if system == "pyro":
        # external stringers on the main barrel / cone
        za = (land_b + 0.02) if tapered else 0.05 * L
        zb = (L - land_t - 0.02) if tapered else z_sep - 0.10 * L
        if mb.want(0):
            ns = max(16, int(r_big * 14))
            with mb.radial(ns, phase=TAU / ns / 2.0):
                _wall_box(mb, (r_at(za), za), (r_at(zb), zb), 0.02 * sc, 0.03 * sc + 0.004 * r_big, "hull")
        _wall_band(mb, wall, za + (zb - za) * 0.30, za + (zb - za) * 0.30 + 0.05 * sc, 0.021 * sc, seg, "hull")
        # frangible joint: circle of pyrotechnic bolt housings on the separation plane
        nb = max(12, int(rt * 9))
        with mb.radial(nb):
            mb.box((0.06 * sc, 0.075 * sc, 0.13 * sc), "engine_metal", center=(rt + 0.022 * sc, 0.0, z_sep),
                   taper=0.8)
            if mb.want(0):
                mb.cyl((rt + 0.05 * sc, 0.0, z_sep), (rt + 0.064 * sc, 0.0, z_sep), 0.02 * sc, 6,
                       "detail_dark", caps=(False, True), smooth=False)
        # spring canisters inside the wall zone, pushing on the upper stage
        nsp = 8 if d_top >= 3.7 else 4
        cr = min(keep * 0.28, 0.07 * sc)
        cl = min(0.55 * sc, 0.10 * L)
        r_c = rt - t - cr - 0.012
        with mb.radial(nsp, phase=TAU / nsp / 2.0):
            mb.cyl((r_c, 0.0, z_sep - cl), (r_c, 0.0, z_sep - 0.012), cr, mb.seg(12, 8), "engine_metal", caps=True)
            mb.cyl((r_c, 0.0, z_sep - 0.012), (r_c, 0.0, L - 0.02), cr * 0.45, 8, "engine_metal",
                   caps=(False, True))
            mb.box((cr + 0.02, cr * 1.6, cr * 0.5), "engine_metal", center=(r_c + cr * 0.5, 0.0, z_sep - cl * 0.5))
        # four solid ullage motors with canted nozzles (settle the propellant before ignition)
        rp = 0.05 * d_top + 0.03
        z_pod = max(0.52 * L, 3.6 * rp + 0.9 * rp + 0.25)
        with mb.radial(4, phase=TAU / 8.0):
            _ullage_pod(mb, wall, z_pod, rp, math.radians(9.0))

    elif system == "pneumatic":
        # clean shell: just two flush doubler rings and low latch covers
        for k in (0.20, 0.44):
            zf = k * L
            _wall_band(mb, wall, zf, zf + 0.04 * sc, 0.006, seg, "hull")
        np_ = 4 if d_top >= 3.7 else 3
        pr = keep * 0.26
        z0 = 0.30 * L
        z1 = (L - land_t) if tapered else 0.62 * L

        def r_c(z):
            return r_at(z) - t - pr - 0.01

        pseg = mb.seg(14, 8)
        with mb.radial(np_, phase=TAU / 8.0):
            p0, p1, p2 = (r_c(z0), 0.0, z0), (r_c(z1), 0.0, z1), (r_c(L), 0.0, L - 0.04)
            mb.cyl(p0, p1, pr, pseg, "engine_metal", caps=True)                     # barrel
            mb.cyl(p1, p2, pr * 0.42, mb.seg(10, 6), "engine_metal", caps=False)     # polished rod
            mb.sphere(p1, pr * 0.7, pseg, 4, "engine_metal")
            mb.cyl((p2[0], 0.0, L - 0.04), (p2[0], 0.0, L - 0.008), pr * 1.5, pseg, "detail_dark",
                   caps=True)                                                       # pusher pad
            for zk in (0.15, 0.85):
                zc = z0 + (z1 - z0) * zk
                mb.box((pr + 0.014, pr * 2.5, pr * 0.6), "engine_metal",
                       center=(r_c(zc) + (pr + 0.014) / 2.0, 0.0, zc))
            # slim external fairing over each pusher's load path
            _wall_box(mb, (r_at(z0), z0), (r_at(z1), z1), 0.022 * sc, 0.17 * sc, "hull", taper=0.6)
        # pressure spheres either side of each pusher, plumbed to the barrel foot
        sr = min(keep * 0.36, (keep - 0.035) / 2.0)
        zs = 0.24 * L
        r_s = r_at(zs) - t - sr - 0.008
        da = 2.7 * max(sr, pr) / r_s
        for side in (1.0, -1.0):
            with mb.radial(np_, phase=TAU / 8.0 + side * da):
                mb.sphere((r_s, 0.0, zs), sr, mb.seg(14, 8), mb.steps(7, 4), "detail_dark")
                mb.box((sr * 0.5 + 0.01, sr * 1.4, sr * 0.3), "engine_metal",
                       center=(r_s + sr * 0.75, 0.0, zs))
                if mb.want(0):
                    mb.cyl((r_s, 0.0, zs + sr * 0.9), (r_s, 0.0, z0 + pr), sr * 0.14, 6, "engine_metal",
                           caps=False)
        # latch covers just under the separation plane
        nl = np_ * 2
        with mb.radial(nl, phase=TAU / 8.0 + TAU / nl / 2.0):
            _wall_box(mb, (rt, z_sep - gap / 2.0 - 0.27 * sc), (rt, z_sep - gap / 2.0 - 0.06 * sc), 0.04 * sc,
                      0.13 * sc, "hull", taper=0.65)

    elif system == "hot_staging":
        z1, z2 = 0.25 * L, 0.83 * L
        lower, upper = _clip_profile(wall, 0.0, z1), _clip_profile(wall, z2, L)
        _shell(mb, lower, seg, t)
        _shell(mb, upper, seg, t)
        mating_flange(mb, rb - t, 0.0, up=True, height=min(0.06, land_b * 0.5))
        mating_flange(mb, rt - t, L, up=False, height=min(0.06, land_t * 0.3))
        separation_joint()
        zl0, zl1 = 0.135 * L, 0.20 * L
        mb.lathe([(r_at(zl0) + 0.006, zl0), (r_at(zl1) + 0.006, zl1)], seg, "livery")
        # heavy ring frames closing the vent bay
        fh = 0.10 * sc
        _wall_band(mb, wall, z1 - fh, z1 - 0.002, 0.018 * sc, seg, "engine_metal")
        _wall_band(mb, wall, z2 + 0.002, z2 + fh, 0.018 * sc, seg, "engine_metal")
        _inner_frame(mb, wall, z1 - fh, z1 - 0.004, t, frame_depth, seg)
        _inner_frame(mb, wall, z2 + 0.004, z2 + fh, t, frame_depth, seg)
        if mb.want(0):
            ns = max(16, int(r_big * 12))
            with mb.radial(ns, phase=TAU / ns / 2.0):
                _wall_box(mb, (r_at(0.03 * L), 0.03 * L), (r_at(0.125 * L), 0.125 * L), 0.02 * sc,
                          0.03 * sc + 0.004 * r_big, "hull")
            inner_ribs(0.04 * L, z1 - fh, n_ribs)
        # open X-braced lattice between the rings: the vent path for the upper engine's plume
        nb = max(8, 2 * round((rb + rt) / 2.0 * 2.6))
        ra, rc = r_at(z1) - t / 2.0, r_at(z2) - t / 2.0
        da = TAU / nb
        lr, dr = 0.045 * sc, 0.030 * sc
        with mb.radial(nb):
            mb.cyl((ra, 0.0, z1 - 0.03), (rc, 0.0, z2 + 0.03), lr, mb.seg(8, 6), "engine_metal", caps=False)
            a = (ra * math.cos(da), ra * math.sin(da), z1 - 0.02)
            b = (rc * math.cos(da), rc * math.sin(da), z2 + 0.02)
            mb.cyl((ra, 0.0, z1 - 0.02), b, dr, 6, "engine_metal", caps=False)
            mb.cyl(a, (rc, 0.0, z2 + 0.02), dr, 6, "engine_metal", caps=False)
            if mb.want(0):
                mb.box((0.03 * sc, 0.22 * sc, 0.16 * sc), "engine_metal", center=(ra, 0.0, z1 + 0.05 * sc), taper=0.5)
                with mb.xform(loc=(0.0, 0.0, 2.0 * z2), scale=(1.0, 1.0, -1.0)):
                    mb.box((0.03 * sc, 0.22 * sc, 0.16 * sc), "engine_metal", center=(rc, 0.0, z2 + 0.05 * sc),
                           taper=0.5)
        # low heat-shield dome over the first stage: turns the plume out through the vents
        z_rim = 0.055
        dome_r = rb - t - 0.04
        rise = min(spec.HOT_STAGE_SHIELD_MAX_RISE - z_rim - 0.03, 0.24 * rb)
        dseg = seg
        mb.dome(dome_r, rise, z_rim, dseg, mb.steps(5, 3), "thermal", up=True)
        mb.dome(dome_r, rise * 0.96, z_rim - 0.012, dseg, mb.steps(5, 3), "detail_dark", up=True, flip=True)
        mb.lathe([(dome_r, z_rim), (rb - t + 0.002, z_rim)], dseg, "engine_metal")
        mb.lathe([(rb - t + 0.002, z_rim - 0.012), (dome_r, z_rim - 0.012)], dseg, "detail_dark", flip=True)
        for frac in (0.35, 0.68, 0.93):
            rr = dome_r * frac
            zz = z_rim + rise * math.sqrt(max(0.0, 1.0 - frac ** 2))
            mb.torus(rr, 0.012 * sc, zz, dseg, 4, "detail_dark")
        door(0.045 * L, min(0.5 * sc, 0.07 * L), math.radians(205.0))

    ctx.empty("attach_top", (0, 0, L))
    ctx.meta.update(
        length_m=L, diameter_bottom_m=d_bot, diameter_top_m=d_top, separation_system=system,
        separation_plane_z_m=round(z_sep, 3), clear_inner_diameter_m=round(d_top - 2.0 * keep, 3),
        value_types=dict(length_m=GAME, diameter_bottom_m=GAME, diameter_top_m=GAME,
                         separation_plane_z_m=GAME, clear_inner_diameter_m=GAME))


for _system in spec.SEPARATION_SYSTEMS:
    for _db, _dt in spec.STACK_PAIRS:
        register(spec.interstage_id(_system, _db, _dt), "interstage", gen_interstage, "7.12",
                 system=_system, d_bottom=_db, d_top=_dt)
