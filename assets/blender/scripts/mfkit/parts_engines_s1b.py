"""First-stage engines, set B (design 7.7): Hydrolox High-Efficiency, Methalox Full-Flow,
Electric-Pump Mini.

Layout convention (engine_common): nozzle exit plane at z = 0, gimbal mount face at
z = length. Dimensions come from spec.ENGINES and are real_world_approximate; the
arrangement of pumps and plumbing is a stylised reading of the real-world twin.
"""
from __future__ import annotations

import math

from mathutils import Vector

from . import spec
from .core import TAU
from .engine_common import actuator, bell_nozzle, chamber, gimbal_mount, pipe_flange, pump
from .pipeline import register

VALUE_TYPES = dict(length_m="real_world_approximate", exit_diameter_m="real_world_approximate",
                   envelope_diameter_m="real_world_approximate",
                   diameter_bottom_m="real_world_approximate",
                   diameter_top_m="game_value", gimbal_pivot_z_m="game_value")


def _polar(r, ang, z):
    return (r * math.cos(ang), r * math.sin(ang), z)


def _bell_path(r_at, ang, z_hi, z_lo, n, offset, twist=0.0):
    """Points hugging the outside of a bell from z_hi down to z_lo at angle ang."""
    pts = []
    for i in range(n + 1):
        k = i / n
        z = z_hi + (z_lo - z_hi) * k
        pts.append(_polar(r_at(z) + offset, ang + twist * k, z))
    return pts


def _valve(mb, p, axis, r, mat="engine_metal"):
    """Small valve body on a pipe: a fat collar and an actuator can sticking out sideways."""
    p = Vector(p)
    ax = Vector(axis).normalized()
    side = ax.orthogonal().normalized()
    s = mb.seg(10, 6)
    mb.cyl(p - ax * r * 1.3, p + ax * r * 1.3, r * 1.5, s, mat, caps=True)
    mb.cyl(p, p + side * r * 3.4, r * 0.8, s, mat, caps=True)
    if mb.want(0):
        mb.cyl(p + side * r * 3.4, p + side * r * 4.6, r * 1.05, s, "detail_dark", caps=True)


def _outrigger(mb, ang, r_plate, r_tip, z_top, size):
    """Arm from the mount plate out to an actuator's frame-side clevis (top face at z_top)."""
    w, h = size
    mid = (r_plate * 0.8 + r_tip) / 2.0
    with mb.xform(loc=(0.0, 0.0, z_top - h / 2.0), rot_z=ang):
        mb.box((r_tip - r_plate * 0.8 + w * 0.5, w, h), "engine_metal", center=(mid, 0.0, 0.0))
        mb.box((w * 1.5, w * 1.7, h * 1.6), "engine_metal", center=(r_tip, 0.0, -h * 0.3))


def _finish(ctx, eid, z_pivot):
    e = spec.ENGINES[eid]
    ctx.empty("attach_top", (0, 0, e["length"]))
    ctx.empty("nozzle_exit", (0, 0, 0))
    ctx.empty("gimbal_pivot", (0, 0, z_pivot))
    ctx.meta.update(
        length_m=e["length"], diameter_bottom_m=e["exit_d"], diameter_top_m=e["mount_d"],
        exit_diameter_m=e["exit_d"], envelope_diameter_m=e["envelope_d"],
        gimbal_pivot_z_m=round(z_pivot, 4), ring_check=False, twin=e["twin"], name=e["name"],
        stage=e["stage"], value_types=VALUE_TYPES)


# =========================================================================== RS-25 class
def gen_hydrolox_high_efficiency(ctx):
    """Staged-combustion hydrolox engine: big hat-banded bell, dense twin-preburner powerhead."""
    eid = "eng_hydrolox_high_efficiency"
    e = spec.ENGINES[eid]
    mb = ctx.mesh()
    length = e["length"]
    r_env = e["envelope_d"] / 2.0

    # ---- nozzle: bell exit 2.30 m; the aft manifold brings the overall width to 2.40 m
    noz_len = 2.95
    r_bell = r_env - 0.05
    r_throat = 0.14
    r_at = bell_nozzle(mb, z_exit=0.0, length=noz_len, r_throat=r_throat, r_exit=r_bell, seg=64,
                       steps=18, wall=0.016, theta_n=37.0, theta_e=6.0, bands=9, band_size=0.018,
                       band_z0=0.10, band_z1=0.86)
    s_ring = mb.seg(64, 16)
    # aft coolant manifold ring at the exit and forward manifold under the throat
    z_aft = 0.085
    mb.torus(r_at(z_aft) + 0.012, 0.030, z_aft, s_ring, 8 if mb.lod == 0 else 4, "engine_metal")
    z_fwd = 2.50
    r_fwd = r_at(z_fwd) + 0.045
    mb.torus(r_fwd, 0.040, z_fwd, mb.seg(40, 12), 8 if mb.lod == 0 else 4, "engine_metal")
    # three coolant downcomers from the forward manifold to the aft manifold
    n_dc = mb.steps(14, 7)
    for k in range(3):
        ang = math.radians(35.0) + TAU * k / 3.0
        path = [_polar(r_fwd, ang, z_fwd)] + _bell_path(r_at, ang, z_fwd - 0.16, z_aft + 0.05, n_dc, 0.048)
        path.append(_polar(r_at(z_aft) + 0.012, ang, z_aft))
        mb.tube(path, 0.021, mb.seg(8, 6), "engine_metal", bend=0.08, bend_seg=2)
        if mb.want(0):
            # stand-off brackets tying each downcomer to a hat-band
            for zb in (0.75, 1.45, 2.05):
                mb.box((0.035, 0.07, 0.035), "engine_metal",
                       matrix=_rotz_at(_polar(r_at(zb) + 0.03, ang, zb), ang))

    # ---- main combustion chamber with coolant jacket hoops
    z_ch_top = chamber(mb, z_throat=noz_len, r_throat=r_throat, r_chamber=0.25, length=0.52,
                       seg=36, mat="nozzle_hot", dome=False, heat=0.6)
    s_ch = mb.seg(36, 12)
    for zb in (noz_len + 0.02, noz_len + 0.24, noz_len + 0.34):
        rr = 0.25 if zb > noz_len + 0.15 else r_throat * 1.06
        mb.band(rr, zb, zb + 0.035, 0.022, s_ch, "engine_metal")

    # ---- gimbal mount (top face = z length)
    z_piv = gimbal_mount(mb, z_top=length, d=e["mount_d"], h=0.46, seg=28)

    # ---- hot-gas manifold: wide squashed body linking both preburners over the chamber
    z_hgm = 3.67
    mb.sphere((0, 0, z_hgm), 0.42, mb.seg(32, 14), mb.steps(8, 5), "engine_metal", scale=(1.42, 1.0, 0.55))
    mb.cyl((0, 0, z_ch_top - 0.02), (0, 0, z_hgm), 0.27, s_ch, "engine_metal", caps=False)
    mb.cyl((0, 0, z_hgm + 0.12), (0, 0, length - 0.44), 0.30, s_ch, "engine_metal", r1=0.24, caps=False)
    mb.band(0.27, z_ch_top + 0.02, z_ch_top + 0.07, 0.03, s_ch, "engine_metal")
    if mb.want(0):
        mb.bolt_ring(0.285, z_ch_top + 0.07, 24, 0.011, 0.014)

    # ---- high-pressure turbopumps hanging like ears, preburners stacked on top
    x_f, x_o = 0.64, -0.62
    pump(mb, (x_f, 0, 2.72), (x_f, 0, 3.46), 0.175, ribs=8, seg=20)            # HPFTP (fuel, larger)
    pump(mb, (x_o, 0, 2.86), (x_o, 0, 3.46), 0.155, ribs=6, seg=20)            # HPOTP
    for x, r_pb, top in ((x_f, 0.15, 3.93), (x_o, 0.135, 3.90)):
        s_pb = mb.seg(20, 10)
        with mb.xform(loc=(x, 0, 0)):
            mb.lathe([(r_pb * 0.92, 3.44), (r_pb, 3.50), (r_pb, top)], s_pb, "engine_metal", crease=50.0)
            mb.dome(r_pb, r_pb * 0.55, top, s_pb, mb.steps(4, 2), "engine_metal", up=True)
            mb.band(r_pb, 3.50, 3.545, 0.022, s_pb, "engine_metal")
            mb.band(r_pb, top - 0.045, top, 0.022, s_pb, "engine_metal")
            if mb.want(0):
                mb.bolt_ring(r_pb + 0.011, top, 12, 0.009, 0.012)
                # igniter can on the preburner dome
                mb.cyl((0, 0, top + r_pb * 0.4), (0, 0, top + r_pb * 0.4 + 0.08), 0.03, 8,
                       "detail_dark", caps=True)

    # ---- low-pressure pumps, fore and aft of the powerhead, with their inlets rising to the stage
    y_lp = 0.68
    pump(mb, (-0.20, y_lp, 3.72), (0.26, y_lp, 3.72), 0.135, seg=16)           # LPFTP (+Y)
    pump(mb, (0.20, -y_lp, 3.72), (-0.26, -y_lp, 3.72), 0.125, seg=16)         # LPOTP (-Y)
    s_d = mb.seg(14, 8)
    # fuel inlet (insulated, thermal) and oxidiser inlet
    fuel_in = [(-0.20, y_lp, 3.72), (-0.40, y_lp, 3.72), (-0.40, y_lp, length - 0.05)]
    ox_in = [(0.20, -y_lp, 3.72), (0.40, -y_lp, 3.72), (0.40, -y_lp, length - 0.05)]
    mb.tube(fuel_in, 0.105, s_d, "thermal", bend=0.17, bend_seg=5)
    mb.tube(ox_in, 0.095, s_d, "engine_metal", bend=0.16, bend_seg=5)
    pipe_flange(mb, (-0.40, y_lp, length - 0.045), (0, 0, 1), 0.105, thickness=0.05, seg=16, bolts=10)
    pipe_flange(mb, (0.40, -y_lp, length - 0.045), (0, 0, 1), 0.095, thickness=0.05, seg=16, bolts=10)
    # low-pressure discharge ducts down to the high-pressure pump inlets (fuel one insulated)
    mb.tube([(0.26, y_lp, 3.72), (0.50, y_lp, 3.72), (0.80, 0.40, 3.20), (0.78, 0.12, 2.80), (x_f, 0.0, 2.74)],
            0.085, s_d, "thermal", bend=0.20, bend_seg=5)
    mb.tube([(-0.26, -y_lp, 3.72), (-0.50, -y_lp, 3.72), (-0.78, -0.40, 3.25), (-0.76, -0.12, 2.94),
             (x_o, 0.0, 2.88)], 0.075, s_d, "engine_metal", bend=0.18, bend_seg=5)

    # ---- high-pressure discharge: fuel to the forward nozzle manifold and chamber jacket, LOX to injector
    a_f = math.radians(-38.0)
    mb.tube([(x_f, -0.17, 3.02), (x_f - 0.02, -0.36, 2.96), (0.48, -0.44, 2.72), _polar(r_fwd, a_f, z_fwd)],
            0.060, mb.seg(12, 8), "engine_metal", bend=0.14, bend_seg=4)
    mb.tube([(x_f, -0.16, 3.22), (0.50, -0.34, 3.30), (0.26, -0.26, 3.30), (0.19, -0.19, 3.20)],
            0.045, mb.seg(10, 6), "engine_metal", bend=0.10, bend_seg=3)
    mb.tube([(x_o, 0.16, 3.10), (x_o + 0.04, 0.36, 3.14), (-0.36, 0.40, 3.42), (-0.16, 0.30, 3.56)],
            0.060, mb.seg(12, 8), "engine_metal", bend=0.14, bend_seg=4)
    _valve(mb, (0.50, -0.42, 2.76), (0.3, 0.05, 1.0), 0.060)
    _valve(mb, (-0.40, 0.39, 3.36), (-0.4, -0.1, 1.0), 0.060)
    # preburner oxidiser supply lines arcing over the top of the powerhead
    mb.tube([(x_o, -0.10, 3.16), (x_o - 0.02, -0.33, 3.40), (x_o + 0.10, -0.30, 4.02), (x_o, 0.0, 4.00)],
            0.030, mb.seg(8, 6), "engine_metal", bend=0.08, bend_seg=3)
    mb.tube([(x_o + 0.08, -0.28, 3.86), (-0.20, -0.52, 4.00), (0.34, -0.42, 4.06), (x_f - 0.08, -0.10, 4.02),
             (x_f, 0.0, 3.98)], 0.028, mb.seg(8, 6), "engine_metal", bend=0.10, bend_seg=3)

    # ---- pogo accumulator, controller box, harness
    mb.sphere((-0.34, -0.36, 3.30), 0.115, mb.seg(14, 8), mb.steps(6, 4), "engine_metal")
    ctl_ang = math.radians(-95.0)
    with mb.xform(loc=_polar(0.60, ctl_ang, 3.02), rot_z=ctl_ang):
        mb.box((0.16, 0.40, 0.46), "detail_dark")
        mb.box((0.03, 0.44, 0.50), "engine_metal", center=(-0.085, 0.0, 0.0))
        if mb.want(0):
            for dy in (-0.12, 0.0, 0.12):
                mb.cyl((0.08, dy, 0.14), (0.12, dy, 0.14), 0.022, 8, "engine_metal", caps=True)
    if mb.want(0):
        # harness from the controller up to the stage and around to the fuel pump
        c0 = Vector(_polar(0.70, ctl_ang, 3.22))
        mb.tube([c0, (c0.x - 0.16, c0.y + 0.02, 3.50), (-0.30, -0.50, 4.05), (-0.22, -0.34, 4.22)],
                0.016, 6, "detail_dark", bend=0.06, bend_seg=3)
        mb.tube([c0, (c0.x + 0.24, c0.y + 0.03, 3.02), (0.50, -0.56, 2.96), (0.70, -0.20, 2.90)],
                0.014, 6, "detail_dark", bend=0.06, bend_seg=3)

    # ---- gimbal actuators, 90 degrees apart
    for ang in (math.radians(48.0), math.radians(138.0)):
        actuator(mb, _polar(0.36, ang, z_hgm + 0.10), _polar(0.90, ang, length - 0.085), 0.050, seg=10)
        _outrigger(mb, ang, e["mount_d"] / 2.0, 0.90, length, (0.09, 0.06))

    _finish(ctx, eid, z_piv)


def _rotz_at(loc, ang):
    from mathutils import Matrix
    return Matrix.Translation(Vector(loc)) @ Matrix.Rotation(ang, 4, "Z")


# =========================================================================== Raptor class
def gen_methalox_full_flow(ctx):
    """Full-flow staged-combustion methalox engine: clean bell, two compact turbopump stacks."""
    eid = "eng_methalox_full_flow"
    e = spec.ENGINES[eid]
    mb = ctx.mesh()
    length = e["length"]
    r_exit = e["exit_d"] / 2.0

    # ---- nozzle: smooth regen bell, one stiffener and a slim manifold near the exit
    noz_len = 1.92
    r_throat = 0.115
    r_at = bell_nozzle(mb, z_exit=0.0, length=noz_len, r_throat=r_throat, r_exit=r_exit - 0.012, seg=56,
                       steps=18, wall=0.012, theta_n=34.0, theta_e=7.0, bands=1, band_size=0.011,
                       band_z0=0.045, heat_exit=0.35)
    s_ring = mb.seg(56, 14)
    # machined jacket closeout: a slightly proud upper jacket section in engine metal
    z_j0, z_j1 = 1.30, noz_len
    n_j = mb.steps(6, 3)
    jacket = [(r_at(z_j0 + (z_j1 - z_j0) * i / n_j) + 0.014, z_j0 + (z_j1 - z_j0) * i / n_j) for i in range(n_j + 1)]
    jacket = [(r_at(z_j0) + 0.001, z_j0 - 0.012)] + jacket
    mb.lathe(jacket, s_ring, "engine_metal", crease=50.0)
    z_man = 1.26
    r_man = r_at(z_man) + 0.030
    mb.torus(r_man, 0.034, z_man, s_ring, 8 if mb.lod == 0 else 4, "engine_metal")

    # ---- chamber and main injector
    z_ch_top = chamber(mb, z_throat=noz_len, r_throat=r_throat, r_chamber=0.205, length=0.40, seg=36,
                       mat="engine_metal", dome=False, heat=0.0)
    s_ch = mb.seg(36, 12)
    z_inj = z_ch_top + 0.10
    mb.sphere((0, 0, z_inj), 0.27, s_ch, mb.steps(8, 5), "engine_metal", scale=(1.0, 1.0, 0.52))
    mb.band(0.205, z_ch_top - 0.01, z_ch_top + 0.03, 0.035, s_ch, "engine_metal")

    # ---- gimbal mount and thrust neck
    z_piv = gimbal_mount(mb, z_top=length, d=e["mount_d"], h=0.36, seg=28)
    mb.cyl((0, 0, z_inj + 0.08), (0, 0, length - 0.30), 0.15, s_ch, "engine_metal", r1=0.165, caps=False)

    # ---- two turbopump stacks: oxygen-rich (-X, larger) and fuel-rich (+X)
    x_o, x_f = -0.425, 0.435
    z_s0, z_s1 = 1.98, 2.74
    for x, r_p, ribs in ((x_o, 0.168, 8), (x_f, 0.150, 6)):
        pump(mb, (x, 0, z_s0), (x, 0, z_s1 - 0.20), r_p, seg=22, ribs=0)
        s_p = mb.seg(22, 10)
        with mb.xform(loc=(x, 0, 0)):
            # preburner on top of the pump: clean capsule with one flange
            mb.lathe([(r_p * 0.80, z_s1 - 0.22), (r_p * 0.86, z_s1 - 0.16), (r_p * 0.86, z_s1 - 0.05)], s_p,
                     "engine_metal", crease=50.0)
            mb.dome(r_p * 0.86, 0.05, z_s1 - 0.05, s_p, mb.steps(3, 2), "engine_metal", up=True)
            mb.band(r_p * 0.86, z_s1 - 0.20, z_s1 - 0.165, 0.022, s_p, "engine_metal")
            if mb.want(0):
                mb.bolt_ring(r_p * 0.86 + 0.011, z_s1 - 0.165, max(10, ribs + 6), 0.009, 0.012)
        # hot-gas transfer duct from the stack straight into the main injector
        sign = 1.0 if x > 0 else -1.0
        mb.tube([(x - sign * r_p * 0.6, 0, z_inj + 0.07), (sign * 0.14, 0, z_inj + 0.05)], 0.085,
                mb.seg(16, 8), "engine_metal")
        pipe_flange(mb, (sign * 0.265, 0, z_inj + 0.06), (1, 0, 0), 0.085, thickness=0.035, seg=16, bolts=8)

    # ---- propellant inlets rising to the stage
    s_d = mb.seg(14, 8)
    for x, y, r_in in ((x_o - 0.085, -0.10, 0.075), (x_f + 0.07, 0.10, 0.068)):
        sgn = 1.0 if x > 0 else -1.0
        mb.tube([(x - sgn * 0.10, y * 0.3, z_s0 + 0.20), (x, y, z_s0 + 0.34), (x, y, length - 0.03)], r_in, s_d,
                "engine_metal", bend=0.13, bend_seg=4)
        pipe_flange(mb, (x, y, length - 0.03), (0, 0, 1), r_in, thickness=0.04, seg=14, bolts=8)

    # ---- fuel pump discharge down to the regen manifold (the one big external pipe)
    mb.tube([(x_f, -0.10, z_s0 + 0.10), (x_f + 0.02, -0.22, z_s0 - 0.10), (x_f - 0.02, -0.24, 1.60),
             _polar(r_man, math.radians(-30.0), z_man)], 0.058, mb.seg(12, 8), "engine_metal", bend=0.14,
            bend_seg=4)
    # ---- oxygen pump discharge into the ox-rich preburner: short neat loop on the -X stack
    mb.tube([(x_o, 0.10, z_s0 + 0.12), (x_o - 0.02, 0.25, z_s0 + 0.20), (x_o - 0.02, 0.25, z_s1 - 0.28),
             (x_o, 0.10, z_s1 - 0.12)], 0.045, mb.seg(10, 6), "engine_metal", bend=0.09, bend_seg=3)
    # ---- regen return from the chamber jacket to the fuel-rich preburner
    mb.tube([_polar(0.215, math.radians(55.0), z_ch_top - 0.10), (0.24, 0.34, z_ch_top + 0.02),
             (x_f - 0.03, 0.26, z_s1 - 0.30), (x_f, 0.10, z_s1 - 0.12)], 0.045, mb.seg(10, 6), "engine_metal",
            bend=0.09, bend_seg=3)

    # ---- flat controller pack tucked on the +Y side, one tidy harness
    with mb.xform(loc=(-0.06, 0.38, 2.36)):
        mb.box((0.24, 0.09, 0.20), "detail_dark")
        mb.box((0.28, 0.025, 0.24), "engine_metal", center=(0.0, -0.055, 0.0))
    if mb.want(0):
        mb.tube([(-0.14, 0.40, 2.46), (-0.20, 0.42, 2.80), (-0.16, 0.34, 3.00)], 0.014, 6, "detail_dark",
                bend=0.05, bend_seg=3)
        mb.bolt_ring(0.24, z_ch_top + 0.03, 28, 0.009, 0.012)

    # ---- gimbal actuators (electric), 90 degrees apart on the -Y side
    for ang in (math.radians(-45.0), math.radians(-135.0)):
        actuator(mb, _polar(0.25, ang, z_inj + 0.02), _polar(0.60, ang, length - 0.065), 0.036, seg=10)
        _outrigger(mb, ang, e["mount_d"] / 2.0, 0.60, length, (0.07, 0.045))

    _finish(ctx, eid, z_piv)


# =========================================================================== Rutherford class
def gen_electric_pump_mini(ctx):
    """Tiny battery-electric pump-fed engine: printed chamber, two motor pumps, battery pack."""
    eid = "eng_electric_pump_mini"
    e = spec.ENGINES[eid]
    mb = ctx.mesh()
    length = e["length"]
    r_exit = e["exit_d"] / 2.0

    # ---- nozzle: short thick-walled bell with two chunky printed ribs
    noz_len = 0.335
    r_throat = 0.040
    r_at = bell_nozzle(mb, z_exit=0.0, length=noz_len, r_throat=r_throat, r_exit=r_exit, seg=36, steps=12,
                       wall=0.007, theta_n=30.0, theta_e=10.0, bands=0, heat_exit=0.4)
    s_n = mb.seg(36, 12)
    for i, (zb, t) in enumerate(((0.012, 0.007), (0.115, 0.006), (0.215, 0.006))):
        if i == 1 and not mb.want(0):
            continue
        r0 = r_at(zb)
        r1 = r_at(zb + 0.016)
        mb.lathe([(r0 - 0.001, zb - 0.004), (r0 + t, zb), (r1 + t, zb + 0.016), (r1 - 0.001, zb + 0.020)], s_n,
                 "engine_metal", crease=50.0)

    # ---- printed chamber with vertical cooling ribs and a bolted injector cap
    r_ch = 0.062
    z_ch_top = chamber(mb, z_throat=noz_len, r_throat=r_throat, r_chamber=r_ch, length=0.125, seg=24,
                       mat="nozzle_hot", dome=False, heat=0.7, flange=False)
    s_c = mb.seg(24, 10)
    if mb.want(0):
        with mb.radial(16):
            mb.box((0.008, 0.007, 0.085), "nozzle_hot", center=(r_ch + 0.003, 0.0, z_ch_top - 0.05))
    # injector cap
    mb.lathe([(r_ch + 0.004, z_ch_top - 0.006), (r_ch + 0.016, z_ch_top - 0.006), (r_ch + 0.016, z_ch_top + 0.014),
              (r_ch * 0.72, z_ch_top + 0.030), (0.0, z_ch_top + 0.030)], s_c, "engine_metal", crease=35.0)
    if mb.want(0):
        mb.bolt_ring(r_ch + 0.009, z_ch_top + 0.012, 10, 0.0055, 0.008)

    # ---- gimbal
    z_piv = gimbal_mount(mb, z_top=length, d=e["mount_d"], h=0.135, seg=20)
    mb.cyl((0, 0, z_ch_top + 0.028), (0, 0, length - 0.125), 0.036, s_c, "engine_metal", r1=0.052, caps=False)

    # ---- two electric motor pumps (finned motor on top, pump head below), one per propellant
    x_p = 0.132
    z_p0, z_p1 = 0.345, 0.535
    r_m = 0.048
    s_m = mb.seg(18, 8)
    for sign in (1.0, -1.0):
        with mb.xform(loc=(sign * x_p, 0.0, 0.0)):
            # pump head (volute)
            mb.lathe([(0.0, z_p0), (0.030, z_p0), (0.050, z_p0 + 0.012), (0.056, z_p0 + 0.030),
                      (0.050, z_p0 + 0.050), (r_m * 0.9, z_p0 + 0.056)], s_m, "engine_metal", crease=40.0)
            # motor can
            mb.lathe([(r_m * 0.9, z_p0 + 0.056), (r_m, z_p0 + 0.064), (r_m, z_p1 - 0.014),
                      (r_m * 0.80, z_p1), (0.0, z_p1)], s_m, "engine_metal", crease=40.0)
            # cooling fins
            n_fin = 5 if mb.lod == 0 else 2
            for i in range(n_fin):
                zf = z_p0 + 0.074 + (z_p1 - z_p0 - 0.105) * i / (n_fin - 1)
                mb.band(r_m, zf, zf + 0.008, 0.010, s_m, "detail_dark")
            if mb.want(0):
                # cable gland on top, bolts around the pump head split line
                mb.cyl((0.0, 0.022, z_p1 - 0.004), (0.0, 0.022, z_p1 + 0.014), 0.012, 8, "detail_dark",
                       caps=True)
                mb.bolt_ring(0.050, z_p0 + 0.050, 8, 0.0045, 0.007)
                mb.band(r_m * 0.80, z_p1 - 0.004, z_p1 + 0.004, 0.006, s_m, "engine_metal")
        # discharge pipe from the pump head into the injector cap
        mb.tube([(sign * (x_p - 0.040), 0.0, z_p0 + 0.030), (sign * 0.078, 0.0, z_p0 + 0.030),
                 (sign * 0.070, 0.0, z_ch_top + 0.004)], 0.012, mb.seg(8, 6), "engine_metal", bend=0.022,
                bend_seg=3)
        # propellant inlet: out of the pump head, back and up to the stage
        mb.tube([(sign * x_p, -0.030, z_p0 + 0.028), (sign * (x_p + 0.012), -0.092, z_p0 + 0.028),
                 (sign * (x_p + 0.012), -0.092, length - 0.012)], 0.017, mb.seg(10, 6), "engine_metal",
                bend=0.035, bend_seg=4)
        pipe_flange(mb, (sign * (x_p + 0.012), -0.092, length - 0.012), (0, 0, 1), 0.017, thickness=0.012,
                    seg=10, bolts=6)

    # ---- battery pack on the +Y side with a mounting frame, and power cables to both motors
    by = 0.158
    mb.box((0.150, 0.078, 0.150), "detail_dark", center=(0.0, by, 0.455))
    mb.box((0.160, 0.010, 0.160), "engine_metal", center=(0.0, by - 0.042, 0.455))
    for dz in ((-0.050, 0.0, 0.050) if mb.want(0) else (0.0,)):
        mb.box((0.154, 0.082, 0.010), "engine_metal", center=(0.0, by, 0.455 + dz))
    if mb.want(0):
        # frame bolts and a status-light / connector strip on the outer face
        for bx in (-0.066, 0.066):
            for bz in (-0.066, 0.066):
                mb.cyl((bx, by - 0.047, 0.455 + bz), (bx, by - 0.055, 0.455 + bz), 0.006, 6, "engine_metal",
                       caps=(False, True), smooth=False)
        mb.box((0.090, 0.006, 0.018), "engine_metal", center=(0.0, by + 0.040, 0.490))
        for bx in (-0.030, 0.0, 0.030):
            mb.cyl((bx, by + 0.040, 0.490), (bx, by + 0.049, 0.490), 0.005, 6, "livery", caps=(False, True))
    mb.box((0.016, 0.060, 0.016), "engine_metal", center=(0.0, 0.092, 0.490))      # strut to the neck
    for sign in (1.0, -1.0):
        mb.tube([(sign * 0.045, by - 0.01, 0.530), (sign * 0.050, by - 0.02, 0.585), (sign * 0.118, 0.075, 0.590),
                 (sign * x_p, 0.022, z_p1 + 0.012)], 0.0085, mb.seg(8, 6), "detail_dark", bend=0.030, bend_seg=3)
        if mb.want(0):
            mb.cyl((sign * 0.045, by - 0.01, 0.528), (sign * 0.045, by - 0.01, 0.540), 0.013, 8,
                   "engine_metal", caps=True)

    # ---- two small electric gimbal actuators on the -Y side
    for ang in (math.radians(-62.0), math.radians(-118.0)):
        actuator(mb, _polar(0.060, ang, z_ch_top + 0.004), _polar(0.150, ang, length - 0.022), 0.011, seg=8)
        _outrigger(mb, ang, e["mount_d"] / 2.0, 0.150, length, (0.022, 0.014))

    _finish(ctx, eid, z_piv)


register("eng_hydrolox_high_efficiency", "engine_s1", gen_hydrolox_high_efficiency, "7.7")
register("eng_methalox_full_flow", "engine_s1", gen_methalox_full_flow, "7.7")
register("eng_electric_pump_mini", "engine_s1", gen_electric_pump_mini, "7.7")
