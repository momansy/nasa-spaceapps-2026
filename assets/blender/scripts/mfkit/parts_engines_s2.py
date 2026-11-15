"""Upper-stage engines (GAME_DESIGN.md 7.8).

All five follow the engine layout of engine_common: nozzle exit plane at z = 0, mount
face at z = length (attach_top). Dimensions come from spec.ENGINES and are
real_world_approximate (rounded from the real hardware class named as the twin).
Vacuum bells are much larger relative to their chambers than the sea-level engines.
"""
from __future__ import annotations

import math

from mathutils import Matrix, Vector

from . import spec
from .core import TAU, bell_profile
from .engine_common import (TUBES_PER_TILE, actuator, bellows, chamber, extension_joint, gimbal_mount, harness,
                            inducer, mount_plate, pipe_flange, pump, stiffener, volute, weld_seams)
from .pipeline import register

FAMILY = "engine_s2"
DESIGN_REF = "7.8"


# --------------------------------------------------------------------------- helpers
def _pol(r, ang, z):
    """Cylindrical -> cartesian."""
    return (r * math.cos(ang), r * math.sin(ang), z)


def _deg(r, deg, z):
    """Cylindrical -> cartesian with the azimuth in degrees."""
    return _pol(r, math.radians(deg), z)


def _vac_bell(mb, *, z_th, r_th, r_exit, seg, steps, wall, theta_n, theta_e, z_split=None,
              mat_up="nozzle_hot", mat_low="nozzle_radiative", tubes=None, low_repeat=4,
              heat_exit=0.3, heat_throat=1.0, low_heat=0.8, lip_mat=None):
    """Double-walled vacuum bell (exit plane z = 0 up to the throat z_th) whose outer AND inner walls change
    material at z_split: tube-wall regen section above (angle-normalised UV, `tubes` coolant tubes from throat
    to joint), smooth radiative / carbon extension below (no tubes). Returns r_at(z) of the outer wall."""
    n = mb.steps(steps, 8)
    prof = bell_profile(r_th, r_exit, z_th, n, theta_n=theta_n, theta_e=theta_e, z_exit=0.0)
    s = mb.seg(seg, 14)

    def heat_at(z):
        return heat_exit + (heat_throat - heat_exit) * z / z_th

    def r_at(z):
        return _interp_desc(prof, z)

    rep_up = tubes / TUBES_PER_TILE if (tubes and mat_up == "nozzle_hot") else 4
    if z_split is None:
        parts = [(prof, mat_up, rep_up, 0.6)]
    else:
        r_s = r_at(z_split)
        lower = [p for p in prof if p[1] < z_split - 1e-6] + [(r_s, z_split)]
        upper = [(r_s, z_split)] + [p for p in prof if p[1] > z_split + 1e-6]
        parts = [(lower, mat_low, low_repeat, low_heat), (upper, mat_up, rep_up, 0.6)]
    for pts, mat, rep, hk in parts:
        mb.lathe(pts, s, mat, crease=60.0, heat=[min(1.0, heat_at(z) * hk) for _, z in pts], uv_u_repeat=rep)
    for pts, mat, rep, _hk in reversed(parts):
        inner = [(max(r - wall, 0.002), z) for r, z in reversed(pts)]
        mat_in = "nozzle_inner" if mat == "nozzle_hot" else mat       # bronze copper-alloy liner inside regen sections
        mb.lathe(inner, s, mat_in, crease=60.0, heat=[heat_at(z) for _, z in inner], uv_u_repeat=rep)
    r0 = prof[0][0]
    mb.lathe([(r0 - wall, 0.0), (r0, 0.0)], s, lip_mat or parts[0][1], heat=heat_exit)
    return r_at


def _interp_desc(prof, z):
    """Radius of a bell profile listed exit-first (z ascending) at height z."""
    if z <= prof[0][1]:
        return prof[0][0]
    for (r0, z0), (r1, z1) in zip(prof, prof[1:]):
        if z0 <= z <= z1:
            k = (z - z0) / (z1 - z0) if z1 > z0 else 0.0
            return r0 + (r1 - r0) * k
    return prof[-1][0]


def _duct(mb, path, r, *, leg=0, at=(0.3, 0.7), mat="engine_metal", bend=None, ends=(True, True), folds=4):
    """Major propellant duct: pipe along `path`, two (or more) flex bellows on straight leg `leg` (fractions `at`),
    a 12-bolt flange at each end (VISUAL_TARGET 2.2)."""
    pts = [Vector(p) for p in path]
    mb.tube(pts, r, mb.seg(12, 8), mat, bend=bend if bend is not None else r * 2.2, bend_seg=5)
    a, b = pts[leg], pts[leg + 1]
    d = (b - a).normalized()
    run = (b - a).length
    for f in at:
        c = a + d * (run * f)
        bellows(mb, c - d * r * 0.8, c + d * r * 0.8, r, mat, folds=folds)
    d0 = (pts[1] - pts[0]).normalized()
    d1 = (pts[-1] - pts[-2]).normalized()
    if ends[0]:
        pipe_flange(mb, pts[0] + d0 * r * 0.4, d0, r, mat)
    if ends[1]:
        pipe_flange(mb, pts[-1] - d1 * r * 0.4, d1, r, mat)


def _feed(mb, x, y, z0, z_face, r, *, mat="engine_metal", flex=2, pump_inlet=True):
    """Vertical propellant feed from a pump inlet (z0) up to the stage interface: pipe, flex bellows, a bolted
    flange at both ends and the inducer visible inside the open bore at the top (pump_inlet=False: a dark bore with
    an inlet screen hub, for pressure-fed engines)."""
    s = mb.seg(14, 8)
    z_top = z_face - 0.30 * r - 0.004
    mb.cyl((x, y, z0), (x, y, z_top), r, s, mat, caps=False)
    if pump_inlet:
        inducer(mb, (x, y, z_top - 0.004), (0, 0, 1), r)
    else:
        with mb.xform(loc=(x, y, 0.0)):
            mb.lathe([(r * 0.97, z_top - 0.03), (0.0, z_top - 0.03)], mb.seg(14, 8), "detail_dark")
            mb.cyl((0.0, 0.0, z_top - 0.03), (0.0, 0.0, z_top - 0.012), r * 0.25, mb.seg(8, 6), mat)
            if mb.want(0):
                with mb.radial(6):
                    mb.box((r * 0.75, r * 0.06, 0.012), mat, center=(r * 0.6, 0.0, z_top - 0.024))
    span = z_top - z0
    for i in range(flex):
        zc = z0 + span * (0.36 + 0.28 * i)
        bellows(mb, (x, y, zc - r * 0.8), (x, y, zc + r * 0.8), r, mat, folds=3)
    pipe_flange(mb, (x, y, z_top - 0.18 * r), (0, 0, 1), r, mat)
    pipe_flange(mb, (x, y, z0 + 0.20 * r), (0, 0, 1), r, mat)


def _valve(mb, p, axis, r, *, body=1.0, mat="engine_metal", act_dir=(0, 0, 1)):
    """In-line valve on a pipe of radius r at p: fat body, two end flanges' worth of collars and a pneumatic
    actuator can on top (act_dir)."""
    p, ax, up = Vector(p), Vector(axis).normalized(), Vector(act_dir).normalized()
    s = mb.seg(12, 8)
    h = r * 1.6 * body
    mb.cyl(p - ax * h, p + ax * h, r * 1.55, s, mat, caps=True)
    for k in (-1, 1):
        mb.cyl(p + ax * (k * h), p + ax * (k * (h + r * 0.25)), r * 1.75, s, mat, caps=True)
    mb.cyl(p + up * r * 1.3, p + up * r * 2.6, r * 0.45, mb.seg(8, 6), mat, caps=False)
    mb.cyl(p + up * r * 2.6, p + up * r * 3.6, r * 0.95, s, "detail_dark", caps=True)


def _conn(mb, p, size=0.03):
    """Electrical connector block at the end of a harness."""
    mb.box((size * 1.2, size, size), "detail_dark", center=tuple(p))


def _xz_plane():
    """Matrix mapping extrude_poly's (x, y, z) -> (x, z_extrude, y): a plate standing in the XZ plane."""
    return Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))








def _split_height(r_throat, r_exit, length, theta_n, theta_e, r_target):
    """Height above the exit plane where the bell's outer radius equals r_target."""
    prof = bell_profile(r_throat, r_exit, length, 240, theta_n=theta_n, theta_e=theta_e)
    for r, z in prof:               # exit first, radius shrinking upward
        if r <= r_target:
            return z
    return length * 0.8






def _finish(ctx, pid, z_pivot, extra=None):
    e = spec.ENGINES[pid]
    ctx.empty("attach_top", (0.0, 0.0, e["length"]))
    ctx.empty("nozzle_exit", (0.0, 0.0, 0.0))
    ctx.empty("gimbal_pivot", (0.0, 0.0, round(z_pivot, 4)))
    ctx.meta.update(
        name=e["name"], twin=e["twin"], stage=2,
        length_m=e["length"], diameter_bottom_m=e["exit_d"], diameter_top_m=e["mount_d"],
        exit_diameter_m=e["exit_d"], envelope_diameter_m=e["envelope_d"],
        gimbal_pivot_z_m=round(z_pivot, 4), ring_check=False,
        value_types=dict(length_m="real_world_approximate", diameter_bottom_m="real_world_approximate",
                         diameter_top_m="game_value", exit_diameter_m="real_world_approximate",
                         envelope_diameter_m="real_world_approximate", gimbal_pivot_z_m="game_value"))
    if extra:
        ctx.meta.update(extra)


# --------------------------------------------------------------------------- 1. RL10 class
def gen_hydrolox_vacuum(ctx):
    """RL10 class expander-cycle engine: 84-tube regen chamber and upper bell, a smooth carbon nozzle extension
    bolted on below, geared turbopump (fuel pump + LOX pump) on +X, two actuators at 90 degrees on the far side."""
    pid = "eng_hydrolox_vacuum"
    mb = ctx.mesh()
    e = spec.ENGINES[pid]
    length, r_exit = e["length"], e["exit_d"] / 2.0
    gim_h = 0.22
    r_th, r_ch = 0.07, 0.125
    z_th = 1.50
    z_split = 0.72                       # regen tube-wall above, carbon-composite extension below
    s_main = mb.seg(72, 16)

    # ---- bell. game_value: 84 coolant tubes (real RL10: 180 + bifurcations) so one tube is ~4.0 cm wide at the
    # extension joint (r 0.535 m), ~2.6 cm mid-regen (r 0.35 m): they read at Build Bay distance. The extension is
    # smooth carbon (nozzle_ablative wrap texture, no tubes, no hoop rings).
    r_at = _vac_bell(mb, z_th=z_th, r_th=r_th, r_exit=r_exit, seg=72, steps=28, wall=0.010, theta_n=40.0,
                     theta_e=9.0, z_split=z_split, mat_up="nozzle_hot", mat_low="nozzle_ablative", tubes=84,
                     low_repeat=5, heat_exit=0.15, lip_mat="nozzle_ablative")
    for z in (1.00, 1.24):                                     # two dark hat-band stiffeners on the tube wall
        stiffener(mb, r_at, z, 0.032, 0.008, s_main, "nozzle_hot", trim=None, heat=0.25)
    stiffener(mb, r_at, 0.37, 0.030, 0.007, s_main, "nozzle_ablative", trim=None, heat=0.15)   # one on the extension
    # bolted joint between the tube wall and the carbon extension (two flanges, bolt heads on top, nuts below; no
    # weld on carbon) + regen fuel inlet manifold just above it
    extension_joint(mb, r_at, z_split + 0.012, s_main, width=0.044, t=0.016, bolts=40, weld=False)
    z_m = z_split + 0.075
    r_m = r_at(z_m) + 0.030
    mb.torus(r_m, 0.026, z_m, s_main, 8 if mb.lod == 0 else 5, "engine_metal")
    # throat collar (actuator load ring)
    stiffener(mb, r_at, z_th - 0.07, 0.05, 0.018, mb.seg(32, 10), "engine_metal", trim="bolt_flange")

    # ---- tube-wall chamber, coolant outlet manifold, injector head, gimbal block
    chamber(mb, z_throat=z_th, r_throat=r_th, r_chamber=r_ch, length=0.40, seg=36, mat="nozzle_hot",
            dome=False, heat=0.85, flange=False)
    s_head = mb.seg(36, 10)
    z_jm = 1.835
    mb.torus(r_ch + 0.020, 0.022, z_jm, s_head, 8 if mb.lod == 0 else 5, "engine_metal")
    mb.lathe([(r_ch - 0.004, 1.862), (0.157, 1.872), (0.157, 1.926), (0.146, 1.946), (0.128, 1.986), (0.0, 1.986)],
             s_head, "engine_metal", crease=35.0)
    if mb.want(0):
        mb.bolt_ring(0.150, 1.926, 20, 0.0065, 0.008)
    z_piv = gimbal_mount(mb, z_top=length, d=e["mount_d"], h=gim_h)

    # ---- turbopump package (+X): fuel pump + turbine, gearbox, LOX pump
    fx, fy, fr = 0.33, -0.06, 0.095
    f_lo, f_hi = (fx, fy, 1.50), (fx, fy, 1.90)
    pump(mb, f_lo, f_hi, fr, ribs=6, seg=20)
    with mb.xform(loc=(fx, fy, 0.0)):                            # turbine housing under the fuel pump
        mb.lathe([(0.0, 1.405), (0.075, 1.405), (0.122, 1.44), (0.122, 1.50), (0.085, 1.53)], mb.seg(20, 8),
                 "engine_metal", crease=40.0)
        if mb.want(0):
            mb.bolt_ring(0.114, 1.50, 14, 0.0065, 0.009)
    v_out, v_dir = volute(mb, f_lo, f_hi, fr, z_frac=0.62, turns=0.85, end_angle=-90.0, outlet_len=0.05)
    lx, ly, lr = 0.22, 0.27, 0.07
    l_lo, l_hi = (lx, ly, 1.45), (lx, ly, 1.72)
    pump(mb, l_lo, l_hi, lr, ribs=0, seg=16)
    lv_out, lv_dir = volute(mb, l_lo, l_hi, lr, z_frac=0.36, turns=0.85, end_angle=140.0, outlet_len=0.03)
    ang = math.atan2(ly - fy, lx - fx)
    dist = math.hypot(lx - fx, ly - fy)
    with mb.xform(loc=((fx + lx) / 2.0, (fy + ly) / 2.0, 1.585), rot_z=ang):
        mb.box((dist, 0.11, 0.085), "engine_metal")                                    # gear case
        mb.cyl((0.0, 0.0, 0.042), (0.0, 0.0, 0.065), 0.045, mb.seg(12, 8), "engine_metal")
        if mb.want(0):
            mb.bolt_ring(0.036, 0.065, 8, 0.005, 0.005)
    for z in (1.56, 1.82):                                      # pump mounts to the chamber
        mb.strut((fx - fr * 0.9, fy + 0.05, z), (r_ch * 0.9, 0.05, z + 0.03), 0.012, seg=6)
        mb.strut((fx - fr * 0.9, fy - 0.05, z), (r_ch * 0.9, -0.07, z + 0.03), 0.012, seg=6)

    # ---- major ducts (each: 2 bellows, 12-bolt flanges at both ends)
    _feed(mb, fx, fy, 1.90, length, 0.042)                      # D1 fuel (LH2) feed from the stage
    _feed(mb, lx, ly, 1.72, length, 0.036)                      # D2 LOX feed from the stage
    # D3 fuel pump discharge down the bell to the regen inlet manifold
    vo = Vector(v_out)
    x3 = math.sqrt(r_m * r_m - vo.y * vo.y)                   # drop straight down onto the manifold crown
    az3 = math.atan2(vo.y, x3)
    d3 = [vo, Vector((x3, vo.y, vo.z)), Vector((x3, vo.y, z_m + 0.07))]
    _duct(mb, d3, 0.028, leg=1, at=(0.16, 0.34))
    _valve(mb, (x3, vo.y, 1.16), (0, 0, 1), 0.028, act_dir=(math.cos(az3), math.sin(az3), 0.0))
    # D4 LOX pump discharge up to the injector head
    lo = Vector(lv_out)
    a4 = lo + Vector(lv_dir) * 0.06
    az4 = math.atan2(a4.y, a4.x)
    d4 = [lo, a4, Vector((a4.x, a4.y, 1.90)), Vector(_pol(0.162, az4, 1.90))]
    _duct(mb, d4, 0.024, leg=1, at=(0.30, 0.62))
    # D5 warm hydrogen from the chamber coolant outlet manifold down to the turbine inlet
    az5 = math.radians(-78.0)
    p5 = Vector(_pol(0.27, az5, z_jm))
    t_in = Vector((fx, fy, 1.47)) + (Vector((p5.x, p5.y, 0)) - Vector((fx, fy, 0))).normalized() * 0.122
    d5 = [Vector(_pol(r_ch + 0.04, az5, z_jm)), p5, Vector((p5.x, p5.y, 1.47)), Vector((t_in.x, t_in.y, 1.47))]
    _duct(mb, d5, 0.024, leg=1, at=(0.30, 0.62))
    # turbine exhaust into the injector fuel manifold (short, flanged)
    ex0 = Vector((fx - 0.05, fy + 0.06, 1.53))
    mb.tube([ex0, Vector((0.20, 0.03, 1.60)), Vector((0.20, 0.03, 1.80)), Vector(_pol(0.162, math.radians(8), 1.80))],
            0.022, mb.seg(10, 6), "engine_metal", bend=0.05)
    pipe_flange(mb, _pol(0.17, math.radians(8), 1.80), (-1, 0, 0), 0.022)

    # ---- two gimbal actuators at 90 degrees (135 / 225), clevis ends, pads on the thrust plate
    for a_deg in (135.0, 225.0):
        a = math.radians(a_deg)
        lug = _pol(0.215, a, 1.44)
        top = _pol(0.30, a, 2.10)
        mb.strut(_pol(0.14, a - 0.25, 1.43), lug, 0.012, seg=6)
        mb.strut(_pol(0.14, a + 0.25, 1.43), lug, 0.012, seg=6)
        mb.strut(_pol(r_ch, a, 1.60), lug, 0.012, seg=6)
        actuator(mb, lug, top, 0.026)
        with mb.xform(rot_z=a):
            mb.box((0.12, 0.07, 0.05), "engine_metal", center=(0.28, 0.0, 2.1516 - 0.025))
            mb.box((0.04, 0.05, 0.05), "engine_metal", center=(0.215, 0.0, 1.44))

    # ---- avionics: spark exciter on the -X side, transducers, cooldown valves; 8+ clamped harness lines
    with mb.xform(rot_z=math.pi):
        mb.box((0.05, 0.10, 0.12), "detail_dark", center=(0.175, 0.0, 1.70))
        mb.box((0.03, 0.12, 0.02), "engine_metal", center=(0.142, 0.0, 1.70))
        mb.cyl((0.148, 0.0, 1.955), (0.21, 0.0, 1.985), 0.014, mb.seg(8, 6), "engine_metal")       # igniter
    for a_deg in (60.0, 300.0):                                                                    # pc / temp sensors
        mb.cyl(_deg(r_ch - 0.003, a_deg, 1.70), _deg(r_ch + 0.035, a_deg, 1.70), 0.013, mb.seg(8, 6), "engine_metal")
    for a_deg in (160.0, 200.0):                                                                   # cooldown valves
        mb.box((0.05, 0.05, 0.06), "engine_metal", center=_deg(0.165, a_deg, 1.50))
    runs = [
        ([_deg(0.20, 180, 1.765), _deg(0.215, 180, 1.88), _deg(0.21, 180, 1.97)], 0.009, True),
        ([_deg(0.20, 180, 1.635), _deg(0.215, 172, 1.50), _deg(r_at(1.24) + 0.03, 170, 1.24)], 0.010, False),
        ([_deg(r_ch + 0.035, 300, 1.70), _deg(0.185, 300, 1.85), _deg(0.20, 300, 2.12)], 0.008, False),
        ([_deg(r_ch + 0.035, 60, 1.70), _deg(0.165, 52, 1.84), _deg(0.165, 40, 2.00), _deg(0.21, 35, 2.12)], 0.008, True),
        ([_deg(r_m + 0.02, 160, z_m + 0.02), _deg(r_at(1.0) + 0.035, 160, 1.0), _deg(r_at(1.3) + 0.03, 160, 1.3),
          _deg(0.165, 160, 1.47)], 0.010, False),
        ([_deg(r_m + 0.02, 200, z_m + 0.02), _deg(r_at(1.0) + 0.035, 200, 1.0), _deg(r_at(1.3) + 0.03, 200, 1.3),
          _deg(0.165, 200, 1.47)], 0.010, False),
        ([_deg(r_at(z_split) + 0.03, 250, z_split + 0.04), _deg(r_at(1.0) + 0.03, 250, 1.0),
          _deg(r_at(1.3) + 0.03, 252, 1.30), _deg(0.16, 255, 1.48)], 0.007, True),
        ([_deg(r_at(z_split) + 0.03, 110, z_split + 0.04), _deg(r_at(1.0) + 0.03, 110, 1.0),
          _deg(r_at(1.3) + 0.03, 108, 1.30), _deg(0.16, 105, 1.48)], 0.007, True),
        ([_deg(0.155, 150, 1.95), _deg(0.21, 155, 2.04), _deg(0.21, 165, 2.13)], 0.008, False),
    ]
    for path, rad, braided in runs:
        if not mb.want(0) and rad < 0.009:
            continue
        harness(mb, path, rad, clamps=2, braided=braided)
        for end in (path[0], path[-1]):
            _conn(mb, end, 0.026)

    ctx.decal("serial_s2", 1.899, math.radians(-150.0), (0.13, 0.032), r_at=lambda z: 0.1575, z_max=length)
    ctx.decal("fluid_lh2", 1.80, math.radians(-30.0), (0.09, 0.0225), r_at=lambda z: fr + 0.001,
              center=(fx, fy), z_max=length)
    _finish(ctx, pid, z_piv, dict(cycle="expander", regen_tubes=84))


# --------------------------------------------------------------------------- 2. Merlin Vacuum class
def gen_kerolox_vacuum(ctx):
    """Merlin Vacuum class gas-generator engine: 72-tube regen chamber and short regen bell, a huge smooth
    radiatively cooled extension (heat-tint gradient, soot ring at the exit) with the turbine exhaust injected through
    a manifold torus at its top, volute turbopump on +X, two actuators at 90 degrees on the far side."""
    pid = "eng_kerolox_vacuum"
    mb = ctx.mesh()
    e = spec.ENGINES[pid]
    length, r_exit = e["length"], e["exit_d"] / 2.0
    gim_h = 0.28
    r_th, r_ch = 0.117, 0.20
    z_th = 2.90
    th_n, th_e = 38.0, 10.0
    z_split = _split_height(r_th, r_exit, z_th, th_n, th_e, 0.50)   # extension starts at ~1 m diameter
    s_main = mb.seg(80, 18)

    # ---- bell. game_value: 72 coolant tubes (real Merlin: a few hundred) -> ~4.4 cm per tube at the extension joint
    # (r 0.50 m), ~3.0 cm mid-regen (r 0.34 m). Extension: smooth nozzle_radiative, hot (bronze/violet) at the top,
    # cooler toward the exit; one dark stiffener and the exit lip, no hoop-ring stack.
    r_at = _vac_bell(mb, z_th=z_th, r_th=r_th, r_exit=r_exit, seg=80, steps=30, wall=0.008, theta_n=th_n,
                     theta_e=th_e, z_split=z_split, mat_up="nozzle_hot", mat_low="nozzle_radiative", tubes=72,
                     low_repeat=6, heat_exit=0.30, heat_throat=1.0, low_heat=1.15, lip_mat="nozzle_radiative")
    # extension: exit ring + two unevenly spaced stiffeners (VISUAL_TARGET 2.2: no hoop stack), four longitudinal
    # sheet weld seams (LOD0) between the joint weld and the exit ring
    stiffener(mb, r_at, 1.05, 0.06, 0.012, s_main, "nozzle_radiative", trim=None, heat=0.45)
    stiffener(mb, r_at, 1.74, 0.045, 0.010, s_main, "nozzle_radiative", trim=None, heat=0.6)
    stiffener(mb, r_at, 0.085, 0.05, 0.008, s_main, "nozzle_radiative", trim=None, heat=0.2)   # inside the 3.0 m envelope
    weld_seams(mb, r_at, 0.20, z_split - 0.06, 4, width=0.028, t=0.004, phase=math.radians(20.0), heat=0.5)
    stiffener(mb, r_at, z_split + 0.20, 0.04, 0.008, mb.seg(48, 12), "nozzle_hot", trim=None, heat=0.3)
    # joint (regen bell <-> extension): two bolted flanges, parting line, weld bead on the extension side
    extension_joint(mb, r_at, z_split + 0.005, s_main, width=0.05, t=0.020, bolts=44)
    # turbine exhaust manifold on the top of the extension, regen fuel inlet manifold just above the joint
    z_xm = z_split - 0.13
    r_xm = r_at(z_xm) + 0.058
    mb.torus(r_xm, 0.055, z_xm, s_main, 10 if mb.lod == 0 else 6, "engine_metal")
    z_fm = z_split + 0.085
    r_fm = r_at(z_fm) + 0.030
    mb.torus(r_fm, 0.028, z_fm, mb.seg(64, 14), 8 if mb.lod == 0 else 5, "engine_metal")
    # throat collar
    stiffener(mb, r_at, z_th - 0.07, 0.06, 0.020, mb.seg(40, 10), "engine_metal", trim="bolt_flange")

    # ---- chamber, injector head with LOX dome, gimbal block
    chamber(mb, z_throat=z_th, r_throat=r_th, r_chamber=r_ch, length=0.46, seg=40, mat="nozzle_hot", dome=False,
            heat=0.85, flange=False)
    s_head = mb.seg(40, 12)
    mb.lathe([(r_ch - 0.004, 3.33), (0.25, 3.37), (0.25, 3.47), (0.215, 3.55), (0.165, 3.60), (0.152, 3.625),
              (0.0, 3.625)], s_head, "engine_metal", crease=35.0)
    if mb.want(0):
        mb.bolt_ring(0.232, 3.47, 24, 0.009, 0.011)
    z_piv = gimbal_mount(mb, z_top=length, d=e["mount_d"], h=gim_h)
    with mb.radial(4, phase=TAU / 8):
        mb.extrude_poly([(0.13, 3.555), (0.215, 3.555), (0.145, 3.64)], -0.010, 0.010, "engine_metal",
                        matrix=_xz_plane())

    # ---- turbopump (+X): turbine housing at the bottom, barrel, volute, inlets
    px, pr = 0.46, 0.14
    p_lo, p_hi = (px, 0.0, 2.86), (px, 0.0, 3.56)
    pump(mb, p_lo, p_hi, pr, ribs=8, seg=22)
    with mb.xform(loc=(px, 0.0, 0.0)):
        mb.lathe([(0.0, 2.73), (0.10, 2.73), (0.172, 2.79), (0.172, 2.87), (0.12, 2.91)], mb.seg(22, 8),
                 "engine_metal", crease=40.0)
        if mb.want(0):
            mb.bolt_ring(0.162, 2.87, 16, 0.009, 0.012)
    v_out, v_dir = volute(mb, p_lo, p_hi, pr, z_frac=0.66, turns=0.85, end_angle=100.0, outlet_len=0.05)
    for z in (3.00, 3.40):                                     # pump mounts
        mb.strut((r_ch * 0.95, 0.08, z), (px - pr * 0.9, 0.08, z + 0.03), 0.016, seg=6)
        mb.strut((r_ch * 0.95, -0.08, z), (px - pr * 0.9, -0.08, z + 0.03), 0.016, seg=6)
    # gas generator (+Y) and its hot-gas feed into the turbine
    gx, gy = 0.33, 0.30
    with mb.xform(loc=(gx, gy, 0.0)):
        mb.lathe([(0.0, 2.98), (0.05, 2.98), (0.062, 3.02), (0.062, 3.22), (0.038, 3.28), (0.0, 3.28)],
                 mb.seg(14, 8), "engine_metal", crease=40.0)
        mb.band(0.062, 3.06, 3.11, 0.008, mb.seg(14, 8), "engine_metal", trim="bolt_flange")
    mb.tube([(gx, gy, 3.00), (gx, gy, 2.84), (px - 0.03, 0.15, 2.81)], 0.034, mb.seg(10, 6), "engine_metal",
            bend=0.07)
    pipe_flange(mb, (gx, gy, 2.95), (0, 0, 1), 0.034)

    # ---- major ducts (each: 2 bellows, 12-bolt flanges at both ends)
    _feed(mb, px, 0.0, 3.56, length, 0.075)                                   # D1 RP-1 feed on the pump axis
    mb.tube([(px, -0.12, 3.24), (px, -0.34, 3.24), (px, -0.34, 3.36)], 0.06, mb.seg(12, 8), "engine_metal",
            bend=0.10)
    _feed(mb, px, -0.34, 3.36, length, 0.06)                                  # D2 LOX feed, -Y elbow
    # D3 LOX discharge: volute -> injector LOX dome
    v0 = Vector(v_out)
    _duct(mb, [v0, v0 + Vector(v_dir) * 0.10, Vector((0.22, 0.38, v0.z + 0.02)), Vector((0.12, 0.22, 3.575))],
          0.045, leg=1, at=(0.35, 0.68))
    # D4 high-pressure RP-1: pump -> regen inlet manifold above the joint (-Y side, straight drop)
    az4 = math.radians(-34.0)
    top4 = Vector(_pol(r_fm, az4, 3.05))
    _duct(mb, [Vector((px - 0.02, -0.11, 3.08)), Vector((top4.x, top4.y, 3.08)), Vector((top4.x, top4.y, z_fm + 0.07))],
          0.040, leg=1, at=(0.18, 0.40))
    _valve(mb, (top4.x, top4.y, 2.58), (0, 0, 1), 0.040, act_dir=(math.cos(az4), math.sin(az4), 0.0))
    # D5 turbine exhaust: turbine housing -> exhaust manifold on the extension (+X)
    x5 = r_xm
    _duct(mb, [Vector((px, 0.0, 2.75)), Vector((px, 0.0, 2.60)), Vector((x5, 0.0, z_split + 0.06)),
               Vector((x5, 0.0, z_xm + 0.07))], 0.062, leg=2, at=(0.25, 0.72), bend=0.16)

    # ---- two gimbal actuators at 90 degrees (135 / 225), clevis ends, pads under the thrust plate
    for a_deg in (135.0, 225.0):
        a = math.radians(a_deg)
        lug = _pol(0.30, a, 2.94)
        top = _pol(0.40, a, 3.80)
        mb.strut(_pol(0.20, a - 0.22, 2.86), lug, 0.016, seg=6)
        mb.strut(_pol(0.20, a + 0.22, 2.86), lug, 0.016, seg=6)
        mb.strut(_pol(r_ch, a, 3.14), lug, 0.016, seg=6)
        actuator(mb, lug, top, 0.038)
        with mb.xform(rot_z=a):
            mb.box((0.16, 0.08, 0.06), "engine_metal", center=(0.37, 0.0, 3.838 - 0.03))
            mb.box((0.06, 0.07, 0.07), "engine_metal", center=(0.30, 0.0, 2.94))

    # ---- avionics + igniter (TEA-TEB) on -X, sensors; 8+ clamped harness lines
    with mb.xform(rot_z=math.pi):
        mb.box((0.07, 0.16, 0.14), "detail_dark", center=(r_ch + 0.065, 0.0, 3.16))
        mb.box((0.03, 0.18, 0.03), "engine_metal", center=(r_ch + 0.018, 0.0, 3.16))
        mb.cyl((0.22, 0.0, 3.56), (0.30, 0.0, 3.62), 0.022, mb.seg(8, 6), "engine_metal")        # igniter fitting
    for a_deg in (60.0, 300.0):
        mb.cyl(_deg(r_ch - 0.003, a_deg, 3.12), _deg(r_ch + 0.04, a_deg, 3.12), 0.016, mb.seg(8, 6), "engine_metal")
    for a_deg in (165.0, 195.0):
        mb.box((0.06, 0.06, 0.07), "engine_metal", center=_deg(0.215, a_deg, 2.95))
    zs = z_split
    runs = [
        ([_deg(r_ch + 0.10, 180, 3.23), _deg(0.30, 180, 3.42), _deg(0.30, 180, 3.59)], 0.012, True),
        ([_deg(r_ch + 0.10, 180, 3.09), _deg(0.27, 175, 2.95), _deg(r_at(2.7) + 0.04, 172, 2.70),
          _deg(r_fm + 0.03, 170, z_fm + 0.02)], 0.012, False),
        ([_deg(r_ch + 0.04, 300, 3.12), _deg(0.25, 300, 3.40), _deg(0.25, 302, 3.82)], 0.010, False),
        ([_deg(r_ch + 0.04, 60, 3.12), _deg(0.23, 55, 3.36), _deg(0.25, 50, 3.82)], 0.010, True),
        ([_deg(r_fm + 0.03, 150, z_fm + 0.03), _deg(r_at(2.62) + 0.04, 152, 2.62), _deg(0.215, 160, 2.92)],
         0.012, False),
        ([_deg(r_fm + 0.03, 210, z_fm + 0.03), _deg(r_at(2.62) + 0.04, 208, 2.62), _deg(0.215, 200, 2.92)],
         0.012, False),
        ([_deg(r_xm, 250, z_xm + 0.066), _deg(r_at(zs + 0.2) + 0.035, 250, zs + 0.2),
          _deg(r_at(2.7) + 0.03, 252, 2.70), _deg(0.215, 255, 2.90)], 0.009, True),
        ([_deg(r_xm, 100, z_xm + 0.066), _deg(r_at(zs + 0.2) + 0.035, 100, zs + 0.2),
          _deg(r_at(2.7) + 0.03, 98, 2.70), _deg(0.215, 95, 2.90)], 0.009, True),
        ([_deg(0.24, 150, 3.50), _deg(0.30, 155, 3.66), _deg(0.30, 165, 3.82)], 0.010, False),
    ]
    for path, rad, braided in runs:
        if not mb.want(0) and rad < 0.011:
            continue
        harness(mb, path, rad, clamps=2, braided=braided)
        for end in (path[0], path[-1]):
            _conn(mb, end, 0.034)

    ctx.decal("serial_s2", 3.42, math.radians(-150.0), (0.18, 0.045), r_at=lambda z: 0.2505, z_max=length)
    ctx.decal("fluid_rp1", 3.10, math.radians(-30.0), (0.12, 0.03), r_at=lambda z: pr + 0.001, center=(px, 0.0),
              z_max=length)
    _finish(ctx, pid, z_piv, dict(cycle="gas generator", regen_tubes=72,
                                  soot=dict(z0_m=0.0, z1_m=0.85, strength=0.9)))


# --------------------------------------------------------------------------- 3. Raptor Vacuum class
def gen_methalox_vacuum(ctx):
    """Raptor Vacuum class full-flow staged-combustion engine: a long 144-tube regen bell with a clean exit, two
    turbopumps (oxygen +X, methane -X) each topped by its preburner and a short hot-gas duct into the main injector,
    two actuators at 90 degrees on the -Y side."""
    pid = "eng_methalox_vacuum"
    mb = ctx.mesh()
    e = spec.ENGINES[pid]
    length, r_exit = e["length"], e["exit_d"] / 2.0
    gim_h = 0.36
    r_th, r_ch = 0.14, 0.26
    z_th = 3.30
    z_cb = 3.95                           # chamber barrel top / injector head
    s_main = mb.seg(72, 18)

    # ---- bell: regen all the way to the exit. game_value: 144 coolant channels -> ~3.0 cm per channel at mid-bell
    # (r 0.70 m), ~5.5 cm at the exit, constant count from the throat (angle-normalised UV0). Clean exit (no soot).
    r_at = _vac_bell(mb, z_th=z_th, r_th=r_th, r_exit=r_exit, seg=72, steps=28, wall=0.014, theta_n=34.0,
                     theta_e=7.0, z_split=None, mat_up="nozzle_hot", tubes=144, heat_exit=0.20, heat_throat=1.0)
    stiffener(mb, r_at, 0.15, 0.09, 0.014, s_main, "nozzle_hot", trim=None, heat=0.15)     # exit stiffener (in envelope)
    stiffener(mb, r_at, 1.30, 0.05, 0.010, s_main, "nozzle_hot", trim=None, heat=0.25)
    z_m = 2.30                                                                              # coolant inlet manifold
    r_m = r_at(z_m) + 0.058
    mb.torus(r_m, 0.052, z_m, s_main, 10 if mb.lod == 0 else 6, "engine_metal")
    stiffener(mb, r_at, z_th - 0.08, 0.07, 0.022, mb.seg(48, 12), "engine_metal", trim="bolt_flange")

    # ---- chamber, coolant outlet manifold, injector head, gimbal block
    chamber(mb, z_throat=z_th, r_throat=r_th, r_chamber=r_ch, length=z_cb - z_th, seg=44, mat="nozzle_hot",
            dome=False, heat=0.85, flange=False)
    s_head = mb.seg(44, 12)
    mb.torus(r_ch + 0.030, 0.034, 3.86, s_head, 8 if mb.lod == 0 else 5, "engine_metal")
    mb.lathe([(r_ch - 0.004, 3.93), (0.325, 3.97), (0.325, 4.17), (0.275, 4.24), (0.228, 4.30), (0.215, 4.345),
              (0.0, 4.345)], s_head, "engine_metal", crease=35.0)
    if mb.want(0):
        mb.bolt_ring(0.305, 4.17, 28, 0.010, 0.012)
    z_piv = gimbal_mount(mb, z_top=length, d=e["mount_d"], h=gim_h, seg=28)
    with mb.radial(4, phase=TAU / 8):
        mb.extrude_poly([(0.20, 4.285), (0.29, 4.285), (0.215, 4.40)], -0.014, 0.014, "engine_metal",
                        matrix=_xz_plane())

    # ---- two turbopump columns: pump barrel, turbine housing, preburner; hot-gas duct into the injector head
    pr, px = 0.16, 0.62
    outs = {}
    for side, x in (("ox", px), ("fuel", -px)):
        sg = 1.0 if x > 0 else -1.0
        p_lo, p_hi = (x, 0.0, 3.48), (x, 0.0, 4.02)
        pump(mb, p_lo, p_hi, pr, ribs=8, seg=22)
        outs[side] = volute(mb, p_lo, p_hi, pr, z_frac=0.36, turns=0.85,
                            end_angle=-90.0 if sg > 0 else 90.0, outlet_len=0.05)
        with mb.xform(loc=(x, 0.0, 0.0)):
            mb.lathe([(0.0, 4.00), (0.17, 4.00), (0.205, 4.04), (0.205, 4.12), (0.13, 4.15)], mb.seg(22, 8),
                     "engine_metal", crease=40.0)                                    # turbine housing
            mb.lathe([(0.0, 4.13), (0.115, 4.13), (0.115, 4.36), (0.075, 4.43), (0.0, 4.45)], mb.seg(18, 8),
                     "engine_metal", crease=40.0)                                    # preburner
            mb.band(0.115, 4.20, 4.25, 0.010, mb.seg(18, 8), "engine_metal", trim="bolt_flange")
            if mb.want(0):
                mb.bolt_ring(0.19, 4.12, 16, 0.009, 0.012)
                mb.bolt_ring(0.122, 4.25, 12, 0.007, 0.008)
        # hot-gas duct turbine -> injector head (short, big, flanged both ends)
        a, b = Vector((sg * 0.315, 0.0, 4.07)), Vector((x - sg * 0.19, 0.0, 4.07))
        mb.cyl(a, b, 0.075, mb.seg(16, 10), "engine_metal", caps=False)
        pipe_flange(mb, a + Vector((sg * 0.02, 0, 0)), (sg, 0, 0), 0.075)
        pipe_flange(mb, b - Vector((sg * 0.02, 0, 0)), (sg, 0, 0), 0.075)
        for z in (3.58, 3.92):                                                       # pump mounts
            mb.strut((sg * r_ch * 0.95, 0.09, z), (x - sg * pr * 0.9, 0.09, z + 0.04), 0.018, seg=6)
            mb.strut((sg * r_ch * 0.95, -0.09, z), (x - sg * pr * 0.9, -0.09, z + 0.04), 0.018, seg=6)
        # propellant feed: elbow into the pump side, vertical run with bellows to the stage interface (D1 / D2)
        yf = 0.34
        mb.tube([(x, pr * 0.9, 3.86), (x, yf, 3.86), (x, yf, 3.98)], 0.07, mb.seg(12, 8), "engine_metal", bend=0.12)
        _feed(mb, x, yf, 3.98, length, 0.075 if sg > 0 else 0.068)

    # D3 LOX discharge: oxygen pump volute -> ox-rich preburner
    o, od = outs["ox"]
    o = Vector(o)
    a3 = o + Vector(od) * 0.07
    pb = Vector((px, 0.0, 4.28))
    hit = pb + (Vector((a3.x, a3.y, 4.28)) - pb).normalized() * 0.118
    _duct(mb, [o, a3, Vector((a3.x, a3.y, 4.28)), hit], 0.042, leg=1, at=(0.28, 0.62))
    # D4 methane discharge: fuel pump volute -> coolant inlet manifold (straight drop on the -X side)
    f, fd = outs["fuel"]
    f = Vector(f)
    x4 = -math.sqrt(max(0.0, r_m * r_m - f.y * f.y))
    _duct(mb, [f, Vector((x4, f.y, f.z)), Vector((x4, f.y, z_m + 0.075))], 0.045, leg=1, at=(0.14, 0.30))
    _valve(mb, (x4, f.y, 2.95), (0, 0, 1), 0.045, act_dir=(-1.0, 0.0, 0.0))
    # D5 warm methane: manifold (az 210) -> fuel-rich preburner
    p5 = Vector(_deg(r_m, 210.0, z_m + 0.075))
    pbf = Vector((-px, 0.0, 4.28))
    hit5 = pbf + (Vector((p5.x, p5.y, 4.28)) - pbf).normalized() * 0.118
    _duct(mb, [p5, Vector((p5.x, p5.y, 4.28)), hit5], 0.042, leg=0, at=(0.30, 0.55))

    # ---- two gimbal actuators at 90 degrees (225 / 315), clevis ends, pads under the thrust plate
    z_pl = length - 0.0792                                                           # plate underside
    for a_deg in (225.0, 315.0):
        a = math.radians(a_deg)
        lug = _pol(0.40, a, 3.25)
        top = _pol(0.52, a, length - 0.15)
        mb.strut(_pol(0.25, a - 0.22, 3.21), lug, 0.020, seg=6)
        mb.strut(_pol(0.25, a + 0.22, 3.21), lug, 0.020, seg=6)
        mb.strut(_pol(r_ch, a, 3.55), lug, 0.020, seg=6)
        actuator(mb, lug, top, 0.046)
        with mb.xform(rot_z=a):
            mb.box((0.20, 0.10, 0.07), "engine_metal", center=(0.48, 0.0, z_pl - 0.035))
            mb.box((0.08, 0.09, 0.09), "engine_metal", center=(0.40, 0.0, 3.25))

    # ---- avionics (+Y), igniters, sensors; 8+ clamped harness lines
    with mb.xform(rot_z=math.pi / 2.0):
        mb.box((0.08, 0.22, 0.18), "detail_dark", center=(r_ch + 0.07, 0.0, 3.62))
        mb.box((0.03, 0.24, 0.03), "engine_metal", center=(r_ch + 0.02, 0.0, 3.62))
    for a_deg in (60.0, 120.0):                                                       # spark igniters
        mb.cyl(_deg(0.30, a_deg, 4.20), _deg(0.38, a_deg, 4.27), 0.022, mb.seg(8, 6), "engine_metal")
    for a_deg in (30.0, 150.0, 250.0):
        mb.cyl(_deg(r_ch - 0.003, a_deg, 3.62), _deg(r_ch + 0.04, a_deg, 3.62), 0.016, mb.seg(8, 6), "engine_metal")
    runs = [
        ([_deg(r_ch + 0.11, 90, 3.71), _deg(0.40, 75, 3.95), _deg(0.38, 60, 4.27)], 0.012, True),
        ([_deg(r_ch + 0.11, 90, 3.71), _deg(0.40, 105, 3.95), _deg(0.38, 120, 4.27)], 0.012, True),
        ([_deg(r_ch + 0.11, 90, 3.53), _deg(0.33, 92, 3.30), _deg(r_at(2.9) + 0.04, 95, 2.90),
          _deg(r_m + 0.035, 95, z_m + 0.03)], 0.012, False),
        ([_deg(r_ch + 0.04, 30, 3.62), _deg(0.33, 40, 3.80), _deg(0.36, 55, 4.10), _deg(0.36, 65, z_pl - 0.02)],
         0.010, False),
        ([_deg(r_ch + 0.04, 150, 3.62), _deg(0.33, 140, 3.80), _deg(0.36, 125, 4.10), _deg(0.36, 115, z_pl - 0.02)],
         0.010, False),
        ([_deg(r_ch + 0.04, 250, 3.62), _deg(0.30, 255, 3.80), _deg(0.34, 262, 4.10), _deg(0.34, 268, z_pl - 0.02)],
         0.010, True),
        ([_deg(r_at(1.30) + 0.04, 60, 1.30), _deg(r_at(1.9) + 0.035, 62, 1.9), _deg(r_m + 0.035, 64, z_m - 0.03)],
         0.009, True),
        ([_deg(r_at(1.30) + 0.04, 150, 1.30), _deg(r_at(1.9) + 0.035, 150, 1.9), _deg(r_m + 0.035, 150, z_m - 0.03)],
         0.009, True),
        ([_deg(r_at(1.30) + 0.04, 270, 1.30), _deg(r_at(1.9) + 0.035, 270, 1.9), _deg(r_m + 0.035, 270, z_m - 0.03)],
         0.009, False),
    ]
    for path, rad, braided in runs:
        if not mb.want(0) and rad < 0.011:
            continue
        harness(mb, path, rad, clamps=2, braided=braided)
        for end in (path[0], path[-1]):
            _conn(mb, end, 0.036)

    ctx.decal("serial_s2", 4.07, math.radians(-90.0), (0.22, 0.055), r_at=lambda z: 0.3255, z_max=length)
    ctx.decal("fluid_lox", 3.86, math.radians(-30.0), (0.13, 0.0325), r_at=lambda z: pr + 0.001, center=(px, 0.0),
              z_max=length)
    ctx.decal("fluid_ch4", 3.86, math.radians(-150.0), (0.13, 0.0325), r_at=lambda z: pr + 0.001,
              center=(-px, 0.0), z_max=length)
    _finish(ctx, pid, z_piv, dict(cycle="full-flow staged combustion", regen_tubes=144))


# --------------------------------------------------------------------------- 4. AJ10-137 class
def gen_hypergolic_storable(ctx):
    """AJ10-137 class pressure-fed hypergolic engine: carbon-phenolic ablative chamber, a large radiatively cooled
    extension bolted on at area ratio ~6, two-axis gimbal ring and a valve-heavy injector top.

    No turbopump: the real class is pressure-fed from helium-pressurised tanks, so the propellant ducts run straight
    from the stage interface through two bipropellant ball-valve packages (two valves in series per propellant, each
    with a nitrogen-driven actuator fed from its own GN2 bottle) into the injector manifold."""
    pid = "eng_hypergolic_storable"
    mb = ctx.mesh()
    e = spec.ENGINES[pid]
    length, r_exit = e["length"], e["exit_d"] / 2.0
    r_th = 0.158
    z_th = 2.80
    th_n, th_e = 36.0, 9.0
    z_split = _split_height(r_th, r_exit, z_th, th_n, th_e, 0.39)   # extension bolts on at area ratio ~6
    r_ch = 0.30                          # outer mould line of the thick ablative chamber
    z_inj = 3.36
    s_main = mb.seg(72, 16)

    # ---- bell: ablative throat section (hidden under the chamber overwrap) + smooth radiative extension with a
    # heat-tint gradient (hot at the joint, cooler at the exit); one dark stiffener and the exit lip ring.
    r_at = _vac_bell(mb, z_th=z_th, r_th=r_th, r_exit=r_exit, seg=72, steps=26, wall=0.010, theta_n=th_n,
                     theta_e=th_e, z_split=z_split, mat_up="nozzle_ablative", mat_low="nozzle_radiative",
                     low_repeat=6, heat_exit=0.30, heat_throat=1.0, low_heat=1.15, lip_mat="nozzle_radiative")
    # extension: exit ring + two unevenly spaced stiffeners (no hoop stack), four sheet weld seams (LOD0)
    stiffener(mb, r_at, 1.05, 0.06, 0.012, s_main, "nozzle_radiative", trim=None, heat=0.5)
    stiffener(mb, r_at, 1.82, 0.045, 0.010, s_main, "nozzle_radiative", trim=None, heat=0.65)
    stiffener(mb, r_at, 0.085, 0.05, 0.008, s_main, "nozzle_radiative", trim=None, heat=0.2)
    weld_seams(mb, r_at, 0.20, z_split - 0.07, 4, width=0.026, t=0.004, phase=math.radians(0.0), heat=0.5)
    # bolted joint between ablative chamber and extension: two flanges, parting line, nuts below and a weld bead on
    # the extension side (no bolt heads on top: the chamber overwrap starts on the upper flange)
    r_s = r_at(z_split)
    seg_c = mb.seg(40, 12)
    extension_joint(mb, r_at, z_split + 0.008, s_main, width=0.052, t=0.034, bolts=36, top_bolts=False)
    # thick carbon-phenolic chamber (nozzle_ablative wrap) with two retention bands
    z0 = z_split + 0.034
    mb.lathe([(r_at(z0), z0), (r_at(z0) + 0.04, z0), (0.255, z_th - 0.07), (0.245, z_th + 0.03),
              (r_ch, z_th + 0.22), (r_ch, z_inj)], seg_c, "nozzle_ablative", crease=50.0, uv_u_repeat=3)
    for z in (z_th + 0.30, z_th + 0.44):
        mb.band(r_ch - 0.002, z - 0.014, z + 0.014, 0.009, seg_c, "engine_metal")
    # injector head + injector manifold torus (both propellants enter here from the valve packages)
    mb.lathe([(r_ch, z_inj), (r_ch + 0.03, z_inj), (r_ch + 0.03, z_inj + 0.07), (0.21, z_inj + 0.07)],
             seg_c, "engine_metal")
    mb.dome(0.21, 0.09, z_inj + 0.07, seg_c, mb.steps(4, 2), "engine_metal")
    if mb.want(0):
        mb.bolt_ring(r_ch + 0.005, z_inj + 0.07, 30, 0.009, 0.012)
    z_im = 3.315
    mb.torus(0.35, 0.025, z_im, seg_c, 8 if mb.lod == 0 else 5, "engine_metal")

    # two-axis gimbal ring around the chamber head, carried by a strut cone from the mount plate
    z_g = 3.22
    rg_in, rg_out = 0.47, 0.535
    mb.lathe([(rg_in, z_g - 0.045), (rg_out, z_g - 0.045), (rg_out, z_g + 0.045), (rg_in, z_g + 0.045)],
             mb.seg(48, 16), "engine_metal", closed=True)
    for a in (0.0, math.pi):                         # trunnions chamber <-> ring
        mb.cyl(_pol(r_ch - 0.02, a, z_g), _pol(rg_in + 0.01, a, z_g), 0.04, mb.seg(12, 8), "engine_metal", caps=False)
        with mb.xform(rot_z=a):
            mb.box((0.07, 0.13, 0.13), "engine_metal", center=(r_ch + 0.02, 0.0, z_g))
            mb.box((0.05, 0.15, 0.15), "engine_metal", center=(rg_out + 0.012, 0.0, z_g))
    for a in (math.pi / 2.0, -math.pi / 2.0):        # trunnion bearings ring <-> stage frame
        with mb.xform(rot_z=a):
            mb.box((0.06, 0.16, 0.16), "engine_metal", center=(rg_out + 0.018, 0.0, z_g))
            mb.cyl((rg_out + 0.03, 0.0, z_g), (rg_out + 0.075, 0.0, z_g), 0.045, mb.seg(12, 8), "engine_metal")
    # thrust mount plate (top face = mount plane) and the strut cone
    r_pl = e["mount_d"] / 2.0
    z_pl = length - 0.06
    mount_plate(mb, z_top=length, r=r_pl, plate_h=length - z_pl, seg=mb.seg(32, 12), r_hub=0.215)
    mb.lathe([(0.12, z_pl - 0.10), (0.20, z_pl)], mb.seg(24, 10), "engine_metal")
    mb.lathe([(0.0, z_pl - 0.10), (0.12, z_pl - 0.10)], mb.seg(24, 10), "engine_metal")
    with mb.radial(4, phase=math.pi / 4.0):
        apex = (r_pl - 0.03, 0.0, z_pl + 0.01)
        mb.box((0.07, 0.10, 0.07), "engine_metal", center=(r_pl - 0.03, 0.0, z_pl - 0.025))
        for da in (math.radians(27), -math.radians(27)):
            foot = _pol((rg_in + rg_out) / 2.0, da, z_g + 0.045)
            mb.strut(apex, foot, 0.022, seg=8)
            mb.sphere(foot, 0.032, 8, 4, "engine_metal")

    # ---- bipropellant valve packages (fuel +Y, oxidiser -Y): radial valve body, two ball valves with GN2 actuators,
    # D1/D2 feed from the stage interface (2 bellows each), D3/D4 valve -> injector manifold (2 bellows each)
    # game_value: the valve bodies and actuator cans are drawn ~35 % larger than a scaled AJ10 so the packages read
    # from the 3/4 Build Bay camera (RUBRIC M3); the cans stand 0.25 m proud of the injector top, under the plate.
    z_v = 3.55
    for sg in (1.0, -1.0):
        mb.cyl((0.0, sg * 0.40, z_v), (0.0, sg * 0.61, z_v), 0.052, mb.seg(12, 8), "engine_metal", caps=True)
        mb.box((0.075, 0.20, 0.085), "engine_metal", center=(0.0, sg * 0.5075, z_v - 0.035))         # valve block
        for yv in (0.45, 0.565):
            mb.sphere((0.0, sg * yv, z_v), 0.092, mb.seg(16, 8), mb.steps(8, 4), "engine_metal", scale=(1.0, 0.62, 1.0))
            mb.cyl((0.0, sg * yv, z_v + 0.07), (0.0, sg * yv, z_v + 0.11), 0.022, mb.seg(8, 6), "engine_metal")
            mb.cyl((0.0, sg * yv, z_v + 0.11), (0.0, sg * yv, z_v + 0.23), 0.052, mb.seg(14, 8), "detail_dark")
            mb.cyl((0.0, sg * yv, z_v + 0.23), (0.0, sg * yv, z_v + 0.245), 0.057, mb.seg(14, 8), "engine_metal")
            mb.cyl((0.0, sg * yv, z_v + 0.105), (0.0, sg * yv, z_v + 0.118), 0.057, mb.seg(14, 8), "engine_metal")
            if mb.want(0):
                with mb.xform(rot_z=math.pi / 2.0 * sg):
                    mb.box((0.04, 0.06, 0.05), "engine_metal", center=(yv, 0.085, z_v + 0.15))   # position switch
        pipe_flange(mb, (0.0, sg * 0.405, z_v), (0, sg, 0), 0.045)
        pipe_flange(mb, (0.0, sg * 0.605, z_v), (0, sg, 0), 0.045)
        mb.tube([(0.0, sg * 0.61, z_v), (0.0, sg * 0.66, z_v), (0.0, sg * 0.66, z_v + 0.06)], 0.04,
                mb.seg(12, 8), "engine_metal", bend=0.05)
        _feed(mb, 0.0, sg * 0.66, z_v + 0.05, length, 0.04, pump_inlet=False)
        _duct(mb, [(0.0, sg * 0.40, z_v - 0.045), (0.0, sg * 0.355, z_im + 0.028)], 0.032, leg=0, at=(0.32, 0.68))

    # ---- GN2 actuation bottles (+X / -X) on brackets off the injector dome, regulators
    for sx in (1.0, -1.0):
        c = (sx * 0.20, 0.0, 3.63)
        mb.sphere(c, 0.075, mb.seg(16, 8), mb.steps(8, 4), "engine_metal")
        mb.box((0.05, 0.05, 0.10), "engine_metal", center=(sx * 0.17, 0.0, 3.52))
        mb.box((0.05, 0.06, 0.05), "detail_dark", center=(sx * 0.20, 0.10, 3.63))                # regulator

    # ---- two gimbal actuators at 90 degrees (45 / 135): lug on the extension joint, clevis on an outrigger arm
    for a_deg in (45.0, 135.0):
        a = math.radians(a_deg)
        lug = _pol(r_s + 0.11, a, z_split + 0.01)
        top = _pol(0.70, a, 3.80)
        actuator(mb, lug, top, 0.042)
        with mb.xform(rot_z=a):
            mb.box((0.15, 0.06, 0.07), "engine_metal", center=(r_s + 0.075, 0.0, z_split + 0.01))
            mb.box((0.44, 0.09, 0.056), "engine_metal", center=(0.545, 0.0, length - 0.032))    # outrigger arm (top
            # 4 mm under the mount plane: no coplanar faces with the plate top)
            mb.box((0.10, 0.08, 0.05), "engine_metal", center=(0.70, 0.0, length - 0.085))

    # ---- lines: 4 GN2 actuation lines (braided), chamber pressure + 2 extension temperature lines, purge
    runs = []
    for sx in (1.0, -1.0):
        for sg in (1.0, -1.0):
            runs.append(([(sx * 0.20, sg * 0.075, 3.66), (sx * 0.10, sg * 0.30, 3.72),
                          (sx * 0.035, sg * 0.45, z_v + 0.12)], 0.008, True))
    runs += [
        ([_deg(r_ch + 0.03, 250, z_inj - 0.12), _deg(0.40, 250, z_inj - 0.06), _deg(0.44, 262, z_g + 0.05)],
         0.010, False),
        ([_deg(r_ch + 0.03, 290, z_inj - 0.12), _deg(0.40, 290, z_inj - 0.06), _deg(0.44, 278, z_g + 0.05)],
         0.010, False),
        ([_deg(r_s + 0.05, 210, z_split + 0.04), _deg(0.29, 210, z_th - 0.05), _deg(r_ch + 0.03, 205, z_th + 0.30),
          _deg(0.44, 190, z_g + 0.05)], 0.010, True),
        ([_deg(r_s + 0.05, 330, z_split + 0.04), _deg(0.29, 330, z_th - 0.05), _deg(r_ch + 0.03, 335, z_th + 0.30),
          _deg(0.44, 350, z_g + 0.05)], 0.010, True),
        ([_deg(r_s + 0.05, 260, z_split + 0.04), _deg(0.29, 260, z_th - 0.05), _deg(r_ch + 0.03, 262, z_th + 0.25)],
         0.009, False),
    ]
    for a_deg in (250.0, 290.0, 262.0):
        mb.cyl(_deg(r_ch - 0.004, a_deg, z_inj - 0.12 if a_deg != 262.0 else z_th + 0.25),
               _deg(r_ch + 0.03, a_deg, z_inj - 0.12 if a_deg != 262.0 else z_th + 0.25), 0.016, mb.seg(8, 6),
               "engine_metal")
    for path, rad, braided in runs:
        if not mb.want(0) and rad < 0.009:
            continue
        harness(mb, path, rad, clamps=2, braided=braided)
        for end in (path[0], path[-1]):
            _conn(mb, end, 0.026)

    ctx.decal("serial_s2", z_inj + 0.035, math.radians(-90.0), (0.16, 0.04), r_at=lambda z: r_ch + 0.0305,
              z_max=length)
    _finish(ctx, pid, z_g, dict(cycle="pressure-fed"))


# --------------------------------------------------------------------------- 5. Star 48 class
def gen_solid_kick_motor(ctx):
    """Star 48 class solid kick motor: bare titanium spherical case with a girth weld and a bolted payload-ring
    flange, a carbon-phenolic exit cone (nozzle_ablative) on a submerged nozzle, fixed (no actuators: thrust vector
    by spin), igniter boss and a safe/arm device on the forward dome inside the payload attach ring."""
    pid = "eng_solid_kick_motor"
    mb = ctx.mesh()
    e = spec.ENGINES[pid]
    length = e["length"]
    r_case = e["envelope_d"] / 2.0                   # 0.62
    r_exit = e["exit_d"] / 2.0
    r_ring = e["mount_d"] / 2.0
    zc = length - 0.04 - r_case                      # sphere centre
    z_th = 0.86                                      # throat, submerged inside the case
    seg = mb.seg(64, 20)

    def r_sph(z):
        return math.sqrt(max(0.0, r_case * r_case - (z - zc) ** 2))

    def on_case(lat_deg, az_deg, off=0.0):
        la = math.radians(lat_deg)
        return _deg((r_case + off) * math.cos(la), az_deg, zc + (r_case + off) * math.sin(la))

    # ---- carbon-phenolic exit cone (smooth layered wrap, no tubes, no hoops) and the aft polar boss
    _vac_bell(mb, z_th=z_th, r_th=0.06, r_exit=r_exit, seg=56, steps=16, wall=0.022, theta_n=30.0, theta_e=16.0,
              z_split=None, mat_up="nozzle_ablative", heat_exit=0.3)
    mb.lathe([(0.11, 0.68), (0.20, 0.68), (0.25, 0.80), (0.11, 0.80)], mb.seg(40, 12), "engine_metal",
             closed=True)
    mb.band(0.204, 0.692, 0.722, 0.006, mb.seg(40, 12), "engine_metal", trim="bolt_flange")
    if mb.want(0):
        mb.bolt_ring(0.165, 0.68, 20, 0.011, -0.014)

    # ---- titanium case: girth weld at the equator, bolted flange where the payload attach skirt joins
    mb.sphere((0.0, 0.0, zc), r_case, seg, mb.steps(24, 10), "engine_metal_satin")   # satin: no brushing to band (M2)
    stiffener(mb, r_sph, zc, 0.030, 0.004, seg, "engine_metal", trim="weld_bead")
    z_fl = zc + 0.37
    stiffener(mb, r_sph, z_fl, 0.040, 0.016, seg, "engine_metal", trim="bolt_flange")
    if mb.want(0):
        mb.bolt_ring(r_sph(z_fl) + 0.016, z_fl, 40, 0.0065, 0.008, axis="R")
    stiffener(mb, r_sph, zc - 0.50, 0.030, 0.005, mb.seg(48, 14), "engine_metal", trim="weld_bead")  # aft boss weld

    # payload attach ring (mount face = top flange)
    mb.lathe([(r_ring + 0.027, zc + 0.395), (r_ring, length - 0.09), (r_ring, length), (r_ring - 0.08, length),
              (r_ring - 0.08, length - 0.03), (r_ring - 0.02, length - 0.03), (r_ring + 0.005, zc + 0.415)],
             seg, "engine_metal", crease=25.0)
    mb.band(r_ring - 0.002, length - 0.03, length, 0.012, seg, "engine_metal")
    if mb.want(0):
        mb.bolt_ring(r_ring + 0.012, length - 0.015, 48, 0.007, 0.008, axis="R")
        with mb.radial(24, phase=math.pi / 24.0):
            mb.box((0.012, 0.022, 0.13), "engine_metal", center=(r_ring + 0.016, 0.0, length - 0.115))

    # ---- forward dome: igniter boss on the pole, safe/arm device, cable to the vehicle connector on the ring
    mb.cyl((0.0, 0.0, zc + r_case - 0.03), (0.0, 0.0, length - 0.006), 0.085, mb.seg(20, 8), "engine_metal")
    mb.cyl((0.0, 0.0, zc + r_case - 0.03), (0.0, 0.0, length - 0.016), 0.13, mb.seg(24, 8), "engine_metal")
    if mb.want(0):
        mb.bolt_ring(0.108, length - 0.016, 12, 0.008, 0.008)
    sa_az, sa_lat = 200.0, 58.0
    p_sa = Vector(on_case(sa_lat, sa_az, 0.0))
    with mb.xform(loc=tuple(p_sa), rot_z=math.radians(sa_az)):
        mb.box((0.12, 0.16, 0.09), "detail_dark", center=(0.0, 0.0, 0.04))               # S&A device housing
        mb.box((0.14, 0.18, 0.012), "engine_metal", center=(0.0, 0.0, 0.0))              # mounting pad
        mb.cyl((0.0, -0.08, 0.05), (0.0, -0.12, 0.05), 0.022, mb.seg(10, 6), "engine_metal")   # arming plug
        mb.cyl((0.0, -0.12, 0.05), (0.0, -0.135, 0.05), 0.028, mb.seg(10, 6), "detail_dark")
        if mb.want(0):
            mb.cyl((0.03, 0.08, 0.05), (0.03, 0.11, 0.05), 0.012, 8, "engine_metal")
            mb.cyl((-0.03, 0.08, 0.05), (-0.03, 0.11, 0.05), 0.012, 8, "engine_metal")
    p_top = p_sa + Vector((0, 0, 0.085))
    harness(mb, [p_top, p_top.lerp(Vector((0.0, 0.0, length - 0.05)), 0.5) + Vector((0, 0, 0.04)),
                 Vector(_deg(0.135, sa_az, length - 0.05))], 0.010, clamps=1, braided=True)
    harness(mb, [p_sa + Vector(_deg(0.05, sa_az, 0.05)), Vector(_deg(r_ring - 0.03, sa_az + 8.0, zc + 0.47)),
                 Vector(_deg(r_ring - 0.03, sa_az + 12.0, length - 0.06))], 0.010, clamps=1)
    _conn(mb, _deg(r_ring - 0.025, sa_az + 12.0, length - 0.06), 0.03)

    # ---- restrained outside detail: two hoist lugs at the equator, temperature sensor patches with clamped leads
    for a_deg in (90.0, 270.0):                       # (kept inside the 1.24 m envelope)
        p_l = on_case(30.0, a_deg, 0.0)
        with mb.xform(loc=p_l, rot_z=math.radians(a_deg)):
            with mb.xform(rot_y=math.radians(-30.0)):
                mb.box((0.03, 0.08, 0.07), "engine_metal", center=(0.010, 0.0, 0.0))
                mb.cyl((0.022, -0.025, 0.012), (0.022, 0.025, 0.012), 0.012, 8, "engine_metal")
    for a_deg, lat0 in ((20.0, -25.0), (160.0, -32.0)):
        pts = [on_case(lat, a_deg + (lat - lat0) * 0.15, 0.016) for lat in (lat0, lat0 + 18.0, 6.0, 22.0, 36.0)]
        pts.append(on_case(38.5, a_deg + (38.5 - lat0) * 0.15, 0.03))
        harness(mb, pts, 0.008, clamps=3)
        with mb.xform(rot_z=math.radians(a_deg)):
            la = math.radians(lat0 - 3.0)
            mb.box((0.012, 0.06, 0.05), "detail_dark",
                   center=((r_case + 0.004) * math.cos(la), 0.0, zc + (r_case + 0.004) * math.sin(la)))

    ctx.decal("serial_s2", zc + 0.12, math.radians(-40.0), (0.20, 0.05), r_at=r_sph, z_max=length)
    ctx.decal("hazard_chevrons", length - 0.06, math.radians(-90.0), (0.16, 0.04), r_at=lambda z: r_ring + 0.0005,
              z_max=length)
    _finish(ctx, pid, z_th, dict(cycle="solid", nozzle="fixed, carbon-phenolic exit cone"))


register("eng_hydrolox_vacuum", FAMILY, gen_hydrolox_vacuum, DESIGN_REF)
register("eng_kerolox_vacuum", FAMILY, gen_kerolox_vacuum, DESIGN_REF)
register("eng_methalox_vacuum", FAMILY, gen_methalox_vacuum, DESIGN_REF)
register("eng_hypergolic_storable", FAMILY, gen_hypergolic_storable, DESIGN_REF)
register("eng_solid_kick_motor", FAMILY, gen_solid_kick_motor, DESIGN_REF)
