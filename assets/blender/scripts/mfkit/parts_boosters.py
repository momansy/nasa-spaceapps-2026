"""Strap-on solid boosters (design 7.11).

Booster layout: origin = centre of the nozzle exit plane (z = 0), nose tip at z = length.
The core vehicle is on the booster's +Y side. Struts are part of the booster and end
exactly on the plane y = D/2 + gap at x = 0, so they touch a core of any diameter:
`attach_side` (forward thrust fitting) and `attach_side_aft` (aft V-brace) mark the two
contact points on the core skin.
"""
from __future__ import annotations

import math

from . import spec
from .engine_common import bell_nozzle
from .parts_fairings import nose_points, skin_runs
from .pipeline import register

REAL = "real_world_approximate"
GAME = "game_value"


def _attach_hardware(mb, r, gap, z_fwd, z_aft):
    """Forward thrust fitting, aft V-brace and sway link, all ending on y = r + gap."""
    y_end = r + gap
    puck = min(0.08 * r, gap * 0.3)
    pr = 0.12 * r
    s = mb.seg(12, 8)
    # forward thrust fitting: saddle pad, tapered post, ball puck
    mb.box((0.60 * r, 0.16 * r, 0.75 * r), "engine_metal", center=(0.0, r, z_fwd), taper=0.8)
    mb.cyl((0.0, r, z_fwd), (0.0, y_end - puck, z_fwd), 0.18 * r, s, "engine_metal", r1=0.09 * r, caps=False)
    mb.cyl((0.0, y_end - puck, z_fwd), (0.0, y_end, z_fwd), pr, s, "engine_metal", caps=True)
    if mb.want(0):
        for sx in (-1.0, 1.0):
            mb.box((0.05 * r, 0.20 * r, 0.50 * r), "engine_metal", center=(sx * 0.2 * r, r + 0.06 * r, z_fwd),
                   taper=0.5)
    # aft V-brace converging on one fitting
    tip = (0.0, y_end - puck * 0.5, z_aft)
    for sx in (-1.0, 1.0):
        ang = math.radians(90.0 + sx * 42.0)
        p = (r * math.cos(ang), r * math.sin(ang), z_aft)
        mb.strut(p, tip, 0.05 * r, "engine_metal", seg=mb.seg(8, 6))
        mb.sphere(p, 0.10 * r, 8, 4, "engine_metal")
    # sway link: diagonal from higher up the case down to the same fitting
    top = (0.0, r * 0.99, z_aft + 1.1 * r)
    mb.strut(top, tip, 0.04 * r, "engine_metal", seg=mb.seg(8, 6))
    mb.sphere(top, 0.085 * r, 8, 4, "engine_metal")
    mb.cyl((0.0, y_end - puck, z_aft), (0.0, y_end, z_aft), pr * 0.85, s, "engine_metal", caps=True)


def _sep_motors(mb, r, z, ang, s):
    """Cluster of four booster separation motors in a housing, at angle `ang`."""
    with mb.xform(rot_z=ang):
        mb.box((0.26 * s, 0.66 * s, 0.66 * s), "hull", center=(r + 0.05 * s, 0.0, z), taper=0.85)
        if mb.want(0):
            for dy in (-0.16, 0.16):
                for dz in (-0.16, 0.16):
                    a = (r + 0.14 * s, dy * s, z + dz * s)
                    b = (r + 0.32 * s, dy * s, z + dz * s + 0.10 * s)
                    mb.cyl(a, b, 0.085 * s, 10, "engine_metal", caps=(False, True))


def _common(ctx, p, length, d, gimbal_z):
    r, gap = d / 2.0, p["gap"]
    ctx.empty("attach_top", (0, 0, length))
    ctx.empty("nozzle_exit", (0, 0, 0))
    ctx.empty("gimbal_pivot", (0, 0, gimbal_z))
    ctx.empty("attach_side", (0, r + gap, p["attach_fwd_z"]))
    ctx.empty("attach_side_aft", (0, r + gap, p["attach_aft_z"]))
    ctx.meta.update(
        length_m=length, diameter_bottom_m=d, diameter_top_m=d, stack=False, ring_check=False,
        gap_m=gap, core_side="+Y", core_axis_offset_note="core axis is at y = D/2 + gap + core radius",
        attach_fwd_z_m=p["attach_fwd_z"], attach_aft_z_m=p["attach_aft_z"], twin=p["twin"],
        value_types=dict(length_m=REAL, diameter_bottom_m=REAL, diameter_top_m=REAL, gap_m=GAME,
                         attach_fwd_z_m=GAME, attach_aft_z_m=GAME))


def gen_small_solid(ctx):
    """GEM-63 class strap-on: composite case, ogive nose, fixed nozzle."""
    mb = ctx.mesh()
    p = spec.BOOSTERS[ctx.id]
    d, length = p["diameter"], p["length"]
    r, gap = d / 2.0, p["gap"]
    zf, za = p["attach_fwd_z"], p["attach_aft_z"]
    seg = mb.seg(40, 20)
    z_sk0, z_sk1 = 1.0, 2.6            # aft skirt
    nose_len = 2.0 * d
    z_nose = length - nose_len

    # ---- nozzle (exit plane z = 0) and aft closure dome
    noz_len, r_th = 1.75, 0.21
    bell_nozzle(mb, z_exit=0.0, length=noz_len, r_throat=r_th, r_exit=0.64, seg=40, steps=10,
                wall=0.02, theta_n=30.0, theta_e=12.0, bands=3, band_z0=0.15, band_z1=0.75,
                heat_exit=0.35)
    mb.lathe([(0.0, noz_len), (r_th - 0.02, noz_len)], seg, "nozzle_hot", heat=1.0)
    z_lo, h = 1.55, 0.85
    dome = []
    n = mb.steps(6, 3)
    for i in range(n + 1):
        t = (math.pi / 2.0) * i / n
        dome.append((0.25 + (r - 0.02 - 0.25) * math.sin(t), z_lo + h * (1.0 - math.cos(t))))
    mb.lathe(dome, seg, "thermal", crease=60.0)
    mb.torus(0.30, 0.06, z_lo + 0.02, seg, 6 if mb.lod == 0 else 4, "thermal")

    # ---- aft skirt, case, nose
    t_sk = 0.015
    mb.lathe([(r - t_sk, z_sk1 - 0.1), (r - t_sk, z_sk0)], seg, "detail_dark")
    mb.lathe([(r - t_sk, z_sk0), (r, z_sk0)], seg, "engine_metal")
    case = [(r, z_sk0), (r, z_nose)]
    skin_runs(mb, case, seg, "hull", [(z_sk0, z_sk0 + 0.22, "thermal"), (11.6, 13.0, "livery"),
                                      (13.25, 13.45, "livery")])
    nose, cap_i = nose_points(r, nose_len, z_nose, mb.steps(12, 6), blunt=0.2,
                              cap_steps=4 if mb.lod == 0 else 3)
    mb.lathe(nose[:cap_i + 1], seg, "livery", crease=12.0)
    mb.lathe(nose[cap_i:], seg, "engine_metal", crease=60.0)

    # ---- joint rings
    for z, hh, th in ((z_sk1, 0.14, 0.022), (z_nose, 0.14, 0.022), (zf, 0.20, 0.03), (za, 0.20, 0.03)):
        mb.band(r, z - hh / 2.0, z + hh / 2.0, th, seg, "engine_metal")
    if mb.want(0):
        mb.bolt_ring(r + 0.022, z_sk1, 36, 0.014, 0.012, "engine_metal", axis="R")
        mb.bolt_ring(r + 0.022, z_nose, 36, 0.014, 0.012, "engine_metal", axis="R")
        # skirt stiffeners
        with mb.radial(16):
            mb.box((0.03, 0.04, z_sk1 - z_sk0 - 0.75), "hull", center=(r + 0.012, 0.0, z_sk0 + 0.25 + (z_sk1 - z_sk0 - 0.75) / 2.0))

    # ---- raceway (cable tunnel) and destruct-charge strip
    ang = math.radians(-35.0)
    mb.panel(r, z_sk1 + 0.3, z_nose - 0.3, 0.16 / r, 0.05, "hull", ang=ang, seg=2)
    if mb.want(0):
        for i in range(7):
            z = z_sk1 + 0.9 + i * (z_nose - z_sk1 - 1.8) / 6.0
            mb.panel(r, z - 0.05, z + 0.05, 0.22 / r, 0.058, "detail_dark", ang=ang, seg=2)
        mb.panel(r, z_sk1 + 1.0, z_nose - 1.0, 0.05 / r, 0.02, "detail_dark", ang=math.radians(200.0), seg=1)

    _attach_hardware(mb, r, gap, zf, za)
    _common(ctx, p, length, d, noz_len)
    ctx.meta.update(nozzle_exit_diameter_m=1.28, nozzle="fixed (gimbal_pivot marks the throat)")


def gen_heavy_solid(ctx):
    """Shuttle / SLS class solid rocket booster: four segments, flared aft skirt."""
    mb = ctx.mesh()
    p = spec.BOOSTERS[ctx.id]
    d, length = p["diameter"], p["length"]
    r, gap = d / 2.0, p["gap"]
    zf, za = p["attach_fwd_z"], p["attach_aft_z"]
    nseg = p.get("segments", 4)
    seg = mb.seg(48, 24)
    # The skirt flare is limited so that it never reaches the core skin (game_value;
    # the real aft skirt flares to 5.3 m).
    rb = r + gap - 0.06
    z_sk0, z_sk1 = 0.6, 2.7
    z_c0, z_c1 = z_sk1, zf - 0.6
    z_fs1 = z_c1 + 3.2
    z_fr1 = length - 1.7
    r_fr = 0.70

    def r_skirt(z):
        k = (z - (z_sk0 + 0.18)) / (z_sk1 - z_sk0 - 0.18)
        return rb + (r - rb) * max(0.0, min(1.0, k))

    # ---- nozzle (exit plane z = 0), flex boot and aft closure
    noz_len, r_th, wall = 3.7, 0.68, 0.05
    r_at = bell_nozzle(mb, z_exit=0.0, length=noz_len, r_throat=r_th, r_exit=1.88, seg=48, steps=12,
                       wall=wall, theta_n=28.0, theta_e=13.0, bands=4, band_z0=0.10, band_z1=0.52,
                       band_size=0.05, heat_exit=0.35)
    mb.lathe([(0.0, noz_len), (r_th - wall, noz_len)], seg, "nozzle_hot", heat=1.0)
    mb.lathe([(r_at(2.0) + 0.01, 2.0), (r - 0.04, 2.9)], seg, "thermal")
    mb.torus(r_at(2.05) + 0.13, 0.13, 2.05, seg, 6 if mb.lod == 0 else 4, "thermal")

    # ---- flared aft skirt
    skirt = [(rb, z_sk0), (rb, z_sk0 + 0.18), (r, z_sk1)]
    skin_runs(mb, skirt, seg, "hull", [(z_sk0, z_sk0 + 0.18, "thermal")], crease=8.0)
    mb.lathe([(r - 0.04, z_sk1), (rb - 0.04, z_sk0 + 0.18), (rb - 0.04, z_sk0)], seg, "detail_dark", crease=8.0)
    mb.lathe([(rb - 0.04, z_sk0), (rb, z_sk0)], seg, "engine_metal")
    for z in (1.15, 1.65, 2.15):
        mb.torus(r_skirt(z) + 0.015, 0.045, z, seg, 6 if mb.lod == 0 else 4, "engine_metal")
    with mb.radial(4, phase=math.pi / 4.0):          # hold-down posts
        mb.box((0.36, 0.52, 0.80), "engine_metal", center=(rb + 0.10, 0.0, z_sk0 + 0.42), taper=0.65)
        if mb.want(0):
            mb.cyl((rb + 0.12, 0.0, z_sk0 + 0.02), (rb + 0.12, 0.0, z_sk0 + 0.10), 0.12, 8, "detail_dark",
                   caps=(True, False))
    _sep_motors(mb, r_skirt(1.6), 1.6, math.radians(58.0), 0.8)

    # ---- motor case: segments, field joints, factory joints, stiffeners
    skin_runs(mb, [(r, z_c0), (r, z_fs1)], seg, "hull",
              [(z_c1 + 1.9, z_c1 + 2.7, "livery"), (z_c1 + 2.85, z_c1 + 2.97, "livery")])
    seg_len = (z_c1 - z_c0) / nseg
    for i in range(nseg + 1):
        z = z_c0 + i * seg_len
        mb.band(r, z - 0.15, z + 0.15, 0.05, seg, "engine_metal")
        if mb.want(0) and 0 < i < nseg:
            mb.bolt_ring(r + 0.05, z, 60, 0.022, 0.016, "engine_metal", axis="R")
    for i in range(nseg):
        for k in (1.0 / 3.0, 2.0 / 3.0):
            z = z_c0 + (i + k) * seg_len
            mb.band(r, z - 0.05, z + 0.05, 0.02, seg, "hull")
    mb.band(r, za - 0.20, za + 0.20, 0.13, seg, "engine_metal")           # ET-style attach ring
    for dz in (1.2, 2.2, 3.2):
        mb.band(r, za + dz - 0.045, za + dz + 0.045, 0.09, seg, "hull")   # aft stiffener rings
    mb.band(r, z_fs1 - 0.10, z_fs1, 0.03, seg, "engine_metal")            # ordnance ring

    # ---- forward frustum and nose cap
    mb.lathe([(r, z_fs1), (r_fr, z_fr1)], seg, "hull")
    mb.torus(r_fr + 0.012, 0.035, z_fr1, seg, 6 if mb.lod == 0 else 4, "engine_metal")
    nose, cap_i = nose_points(r_fr, length - z_fr1, z_fr1, mb.steps(6, 3), blunt=0.42,
                              cap_steps=4 if mb.lod == 0 else 3)
    mb.lathe(nose, seg, "livery", crease=25.0)
    z_bsm = z_fs1 + 0.38 * (z_fr1 - z_fs1)
    r_bsm = r + (r_fr - r) * 0.38
    _sep_motors(mb, r_bsm - 0.06, z_bsm, math.radians(58.0), 0.8)
    if mb.want(0):
        with mb.radial(24):
            mb.box((0.03, 0.05, 1.45), "hull", center=(r + 0.012, 0.0, z_c1 + 0.30 + 0.725))

    # ---- systems tunnel and range-safety strip
    ang = math.radians(-40.0)
    mb.panel(r, za + 0.45, z_fs1 - 0.5, 0.44 / r, 0.10, "hull", ang=ang, seg=2)
    if mb.want(0):
        n_clamp = 12
        for i in range(n_clamp):
            z = za + 1.6 + i * (z_fs1 - za - 3.4) / (n_clamp - 1)
            mb.panel(r, z - 0.07, z + 0.07, 0.52 / r, 0.115, "detail_dark", ang=ang, seg=2)
        mb.panel(r, z_c0 + 1.0, z_c1 - 0.5, 0.10 / r, 0.03, "detail_dark", ang=math.radians(215.0), seg=1)

    _attach_hardware(mb, r, gap, zf, za)
    _common(ctx, p, length, d, 3.3)
    ctx.meta.update(nozzle_exit_diameter_m=3.76, casing_segments=nseg,
                    aft_skirt_base_diameter_m=round(2.0 * rb, 2),
                    nozzle="gimballed (flex bearing at gimbal_pivot)")
    ctx.meta["value_types"]["aft_skirt_base_diameter_m"] = GAME


register("booster_small_solid", "booster", gen_small_solid, "7.11")
register("booster_heavy_solid", "booster", gen_heavy_solid, "7.11")
