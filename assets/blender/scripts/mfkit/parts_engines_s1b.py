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
from .engine_common import (actuator, bell_nozzle, bellows, chamber, gimbal_mount, harness, inducer, pipe_flange,
                            pump, stiffener, volute)
from .pipeline import register

VALUE_TYPES = dict(length_m="real_world_approximate", exit_diameter_m="real_world_approximate",
                   envelope_diameter_m="real_world_approximate",
                   diameter_bottom_m="real_world_approximate",
                   diameter_top_m="game_value", gimbal_pivot_z_m="game_value")


def _polar(r, ang, z):
    return (r * math.cos(ang), r * math.sin(ang), z)


def _pol(r, deg, z, cx=0.0, cy=0.0):
    """Point at radius r, azimuth deg (from +X towards +Y) around the axis through (cx, cy)."""
    a = math.radians(deg)
    return (cx + r * math.cos(a), cy + r * math.sin(a), z)


def _minor(mb, n=8):
    return n if mb.lod == 0 else max(4, n // 2)


def _duct(mb, path, r, *, run=0, at=(0.32, 0.68), mat="engine_metal", bend=None, ends=(True, True), folds=3):
    """Major propellant duct: pipe along `path`, two (or more) flex bellows on straight run `run` (fractions `at`)
    and a bolted flange (>= 12 bolts) at each flagged end. The bellows sit on the straight part of the run."""
    pts = [Vector(p) for p in path]
    mb.tube(pts, r, mb.seg(12, 8), mat, bend=bend if bend is not None else r * 2.2, bend_seg=4, caps=True)
    a, b = pts[run], pts[run + 1]
    u = (b - a).normalized()
    span = (b - a).length
    for f in at:
        c = a + u * (span * f)
        bellows(mb, c - u * r * 0.8, c + u * r * 0.8, r, mat, folds=folds)
    d0 = (pts[1] - pts[0]).normalized()
    d1 = (pts[-1] - pts[-2]).normalized()
    if ends[0]:
        pipe_flange(mb, pts[0] + d0 * r * 0.4, d0, r, mat)
    if ends[1]:
        pipe_flange(mb, pts[-1] - d1 * r * 0.4, d1, r, mat)


def _inlet(mb, x, y, z0, z_face, r, mat="engine_metal", at=(0.30, 0.56)):
    """Vertical propellant inlet from a pump up to the stage interface: pipe, flex bellows, inducer visible in the
    bore and a bolted flange whose bolt heads stay below the mount face z_face."""
    s = mb.seg(14, 8)
    z_top = z_face - 0.30 * r - 0.004
    mb.cyl((x, y, z0), (x, y, z_top), r, s, mat, caps=False)
    inducer(mb, (x, y, z_top - 0.004), (0, 0, 1), r)
    span = z_top - z0
    for f in at:
        zc = z0 + span * f
        bellows(mb, (x, y, zc - r * 0.8), (x, y, zc + r * 0.8), r, mat, folds=3)
    pipe_flange(mb, (x, y, z_top - 0.18 * r), (0, 0, 1), r, mat, seg=14)


def _lines(mb, runs, block=0.03):
    """Small lines / harness runs with clamps; each end lands on a connector block (nothing ends in mid-air).
    runs: (path, radius, braided, material)."""
    for path, rad, braided, mat in runs:
        if not mb.want(0) and rad < 0.6 * block:
            continue
        harness(mb, path, rad, clamps=2, braided=braided, mat=mat)
        if mb.want(0) and mat == "detail_dark":
            b = max(block, rad * 2.6)
            for end in (path[0], path[-1]):
                mb.box((b * 1.15, b, b), "detail_dark", center=tuple(end))


def _valve(mb, p, axis, r, mat="engine_metal", side=None):
    """Small valve body on a pipe: a fat collar and an actuator can sticking out sideways (along `side`)."""
    p = Vector(p)
    ax = Vector(axis).normalized()
    side = (ax.orthogonal() if side is None else Vector(side) - ax * Vector(side).dot(ax)).normalized()
    s = mb.seg(10, 6)
    mb.cyl(p - ax * r * 1.3, p + ax * r * 1.3, r * 1.5, s, mat, caps=True)
    mb.cyl(p, p + side * r * 2.5, r * 0.8, s, mat, caps=True)
    if mb.want(0):
        mb.cyl(p + side * r * 2.5, p + side * r * 3.4, r * 1.0, s, "detail_dark", caps=True)


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
    """Staged-combustion hydrolox engine (RS-25 class): dense tube-wall bell with two stiffeners, exit and forward
    coolant manifolds, two steer-horn ducts, a hot-gas manifold carrying two preburners over their high-pressure
    turbopumps, two low-pressure turbopumps feeding them, two gimbal actuators at 90 degrees and a clamped harness."""
    eid = "eng_hydrolox_high_efficiency"
    e = spec.ENGINES[eid]
    mb = ctx.mesh()
    length = e["length"]
    r_env = e["envelope_d"] / 2.0

    # ---- nozzle: bell exit 2.30 m; the aft manifold brings the overall width to 2.40 m.
    # 216 coolant tubes (game_value): about 3.3 cm per tube at the exit so they read at Build Bay distance (the
    # real class has ~1 080 much finer tubes); UV0 u is angle-normalised so the count is constant to the throat.
    noz_len = 2.95
    r_bell = r_env - 0.05
    r_throat = 0.14
    r_at = bell_nozzle(mb, z_exit=0.0, length=noz_len, r_throat=r_throat, r_exit=r_bell, seg=64,
                       steps=16, wall=0.016, theta_n=37.0, theta_e=6.0, bands=2, band_size=0.016,
                       band_z0=0.30, band_z1=0.62, tubes=216, band_mat="nozzle_hot", stiffener_trim=None,
                       heat_exit=0.25)
    s_ring = mb.seg(64, 16)
    # aft (exit) coolant manifold: the fat torus that defines the class silhouette
    z_aft = 0.075
    r_aft = r_at(z_aft) + 0.008
    mb.torus(r_aft, 0.036, z_aft, s_ring, _minor(mb, 8), "engine_metal")
    # forward nozzle inlet manifold, fed by the steer horns
    z_fwd = 2.25
    r_fwd = r_at(z_fwd) + 0.046
    mb.torus(r_fwd, 0.042, z_fwd, mb.seg(40, 12), _minor(mb, 8), "engine_metal")
    mb.band(r_at(z_fwd + 0.07), z_fwd + 0.04, z_fwd + 0.08, 0.012, mb.seg(48, 14), "engine_metal")
    # nozzle-to-chamber bolted joint just under the throat
    stiffener(mb, r_at, 2.68, 0.06, 0.022, mb.seg(40, 12), "engine_metal", trim="bolt_flange")

    # three coolant drain lines from the forward to the aft manifold, clamped to the stiffeners
    for a_deg in (60.0, 180.0, 300.0):
        n_dc = mb.steps(12, 6)
        path = [_pol(r_fwd, a_deg, z_fwd - 0.035)]
        for i in range(n_dc + 1):
            z = (z_fwd - 0.14) + ((z_aft + 0.09) - (z_fwd - 0.14)) * i / n_dc
            path.append(_pol(r_at(z) + 0.05, a_deg, z))
        path.append(_pol(r_aft + 0.012, a_deg, z_aft + 0.030))
        mb.tube(path, 0.021, mb.seg(10, 6), "engine_metal", bend=0.06, bend_seg=2)
        for zb in (noz_len * 0.30, noz_len * 0.62):
            mb.box((0.05, 0.05, 0.055), "engine_metal",
                   matrix=_rotz_at(_pol(r_at(zb) + 0.032, a_deg, zb), math.radians(a_deg)))
            if mb.want(0):
                with mb.xform(loc=_pol(r_at(zb) + 0.05, a_deg, 0.0)[:2] + (0.0,)):
                    mb.band(0.021, zb - 0.018, zb + 0.018, 0.007, 8, "engine_metal")

    # ---- main combustion chamber (hot-gas wall) with its forward flange and a weld bead
    z_ch_top = chamber(mb, z_throat=noz_len, r_throat=r_throat, r_chamber=0.25, length=0.52,
                       seg=40, mat="nozzle_hot", dome=False, heat=0.6)
    s_ch = mb.seg(40, 12)
    mb.band(0.25, z_ch_top - 0.30, z_ch_top - 0.285, 0.006, s_ch, "engine_metal", trim="weld_bead")

    # ---- gimbal mount (top face = z length)
    z_piv = gimbal_mount(mb, z_top=length, d=e["mount_d"], h=0.46, seg=28)

    # ---- hot-gas manifold: wide squashed body linking both preburners over the chamber
    z_hgm = 3.67
    mb.sphere((0, 0, z_hgm), 0.42, mb.seg(36, 14), mb.steps(10, 5), "engine_metal", scale=(1.42, 1.0, 0.55))
    mb.cyl((0, 0, z_ch_top - 0.02), (0, 0, z_hgm), 0.27, s_ch, "engine_metal", caps=False)
    mb.cyl((0, 0, z_hgm + 0.12), (0, 0, length - 0.44), 0.30, s_ch, "engine_metal", r1=0.24, caps=False)
    mb.band(0.27, z_ch_top + 0.02, z_ch_top + 0.07, 0.03, s_ch, "engine_metal", trim="bolt_flange")
    if mb.want(0):
        mb.bolt_ring(0.285, z_ch_top + 0.07, 24, 0.011, 0.014)

    # ---- high-pressure turbopumps hanging under the preburners, each with its scroll case (volute)
    x_f, x_o = 0.64, -0.62
    r_hf, r_ho = 0.175, 0.155
    hf0, hf1 = (x_f, 0, 2.72), (x_f, 0, 3.46)
    ho0, ho1 = (x_o, 0, 2.76), (x_o, 0, 3.46)
    pump(mb, hf0, hf1, r_hf, ribs=8, seg=24)            # HPFTP (fuel, larger)
    pump(mb, ho0, ho1, r_ho, ribs=6, seg=24)            # HPOTP
    # volute(): for a +Z pump axis the scroll frame is turned 180 degrees about Z, so end_angle 90 puts the
    # discharge on the -Y side pointing +X, end_angle -90 on the +Y side pointing -X.
    vf_out, vf_dir = volute(mb, hf0, hf1, r_hf, z_frac=0.45, turns=0.85, end_angle=90.0, outlet_len=0.16)
    vo_out, vo_dir = volute(mb, ho0, ho1, r_ho, z_frac=0.45, turns=0.85, end_angle=90.0, outlet_len=0.12)
    for x, r_p, z0 in ((x_f, r_hf, 2.72), (x_o, r_ho, 2.76)):
        with mb.xform(loc=(x, 0, 0)):                       # pump-inlet bolt flange at the bottom bell
            mb.band(r_p * 0.92, z0 + 0.06, z0 + 0.10, 0.02, mb.seg(24, 10), "engine_metal", trim="bolt_flange")
            if mb.want(0):
                mb.bolt_ring(r_p * 0.92 + 0.012, z0 + 0.10, 16, 0.008, 0.012)
    for x, r_pb, top in ((x_f, 0.15, 3.93), (x_o, 0.135, 3.90)):
        s_pb = mb.seg(24, 10)
        with mb.xform(loc=(x, 0, 0)):
            mb.lathe([(r_pb * 0.92, 3.44), (r_pb, 3.50), (r_pb, top)], s_pb, "engine_metal", crease=50.0)
            mb.dome(r_pb, r_pb * 0.55, top, s_pb, mb.steps(4, 2), "engine_metal", up=True)
            mb.band(r_pb, 3.50, 3.545, 0.022, s_pb, "engine_metal", trim="bolt_flange")
            mb.band(r_pb, top - 0.045, top, 0.022, s_pb, "engine_metal")
            if mb.want(0):
                mb.bolt_ring(r_pb + 0.011, top, 14, 0.009, 0.012)
                # igniter can on the preburner dome
                mb.cyl((0, 0, top + r_pb * 0.4), (0, 0, top + r_pb * 0.4 + 0.08), 0.03, 8, "detail_dark", caps=True)

    # ---- low-pressure turbopumps (vertical), fuel on +Y and oxidiser on -Y, axial inlets up to the stage
    lpf = (0.05, 0.70)
    lpo = (-0.05, -0.70)
    z_lp0, z_lp1 = 3.30, 3.85
    pump(mb, (lpf[0], lpf[1], z_lp0), (lpf[0], lpf[1], z_lp1), 0.13, ribs=6, seg=20)
    pump(mb, (lpo[0], lpo[1], z_lp0), (lpo[0], lpo[1], z_lp1), 0.12, ribs=6, seg=20)
    lf_out, _ = volute(mb, (lpf[0], lpf[1], z_lp0), (lpf[0], lpf[1], z_lp1), 0.13, z_frac=0.25, turns=0.85,
                       end_angle=90.0, outlet_len=0.10)
    lo_out, _ = volute(mb, (lpo[0], lpo[1], z_lp0), (lpo[0], lpo[1], z_lp1), 0.12, z_frac=0.25, turns=0.85,
                       end_angle=-90.0, outlet_len=0.10)
    _inlet(mb, lpf[0], lpf[1], z_lp1 - 0.02, length, 0.100)
    _inlet(mb, lpo[0], lpo[1], z_lp1 - 0.02, length, 0.092)

    # ---- low-pressure discharge ducts down to the high-pressure pump inlets
    lf = Vector(lf_out)
    _duct(mb, [lf, (0.60, lf.y, lf.z), (0.70, 0.42, 2.84), (x_f, r_hf + 0.01, 2.84)], 0.070, run=0)
    lo = Vector(lo_out)
    _duct(mb, [lo, (-0.58, lo.y, lo.z), (-0.68, -0.42, 2.88), (x_o, -(r_ho + 0.01), 2.88)], 0.065, run=0)

    # ---- steer horns: HPFTP discharge -> main fuel valve -> forward nozzle manifold (A); forward manifold ->
    # coolant return into the oxidiser preburner (B). The two big curved ducts that identify the class.
    vf = Vector(vf_out)
    a_a, a_b = -25.0, 135.0
    horn_a = [vf, (0.93, vf.y, vf.z), (0.93, vf.y, 2.55), _pol(r_fwd + 0.30, a_a, z_fwd),
              _pol(r_fwd + 0.05, a_a, z_fwd)]
    _duct(mb, horn_a, 0.062, run=1, at=(0.50, 0.78), bend=0.16)
    _valve(mb, (0.93, vf.y, vf.z - 0.13), (0, 0, 1), 0.062, side=(-0.3, -1.0, 0.0))          # main fuel valve
    horn_b = [_pol(r_fwd + 0.05, a_b, z_fwd), _pol(r_fwd + 0.26, a_b, z_fwd), (-0.66, 0.62, 3.30),
              (x_o, 0.40, 3.64), (x_o, 0.150, 3.64)]
    _duct(mb, horn_b, 0.058, run=2, at=(0.30, 0.68), bend=0.15)

    # ---- HPOTP discharge -> main oxidiser valve -> main injector (under the hot-gas manifold)
    vo = Vector(vo_out)
    mb.tube([vo, (-0.30, vo.y, vo.z), (-0.22, -0.22, 3.30), (-0.22, -0.22, 3.47)], 0.055, mb.seg(12, 8),
            "engine_metal", bend=0.12, bend_seg=4)
    pipe_flange(mb, vo + Vector((0.02, 0, 0)), (1, 0, 0), 0.055)
    pipe_flange(mb, (-0.22, -0.22, 3.43), (0, 0, 1), 0.055)
    _valve(mb, (-0.36, vo.y, vo.z), (1, 0, 0), 0.055, side=(0.0, -0.2, -1.0))
    # pogo accumulator on the HPOTP inlet side, piped into the pump body
    mb.sphere((-0.38, 0.33, 3.18), 0.095, mb.seg(16, 8), mb.steps(8, 4), "engine_metal")
    mb.cyl((-0.42, 0.27, 3.15), (x_o + 0.08, 0.10, 3.10), 0.028, mb.seg(10, 6), "engine_metal", caps=False)

    # ---- engine controller on the -Y side, strutted to the chamber
    ctl_ang = math.radians(250.0)
    with mb.xform(loc=_polar(0.60, ctl_ang, 3.00), rot_z=ctl_ang):
        mb.box((0.15, 0.36, 0.40), "detail_dark")
        mb.box((0.025, 0.40, 0.44), "engine_metal", center=(-0.088, 0.0, 0.0))
        if mb.want(0):
            for dy in (-0.11, 0.0, 0.11):
                mb.cyl((0.075, dy, 0.13), (0.11, dy, 0.13), 0.022, 8, "engine_metal", caps=True)
            for dy in (-0.17, 0.17):
                for dz in (-0.19, 0.19):
                    mb.cyl((-0.10, dy, dz), (-0.11, dy, dz), 0.008, 6, "engine_metal", caps=(False, True),
                           smooth=False)
    for zs, zc in ((2.90, 3.12), (3.12, 3.27)):
        mb.strut(_polar(0.505, ctl_ang, zs), _polar(0.24, ctl_ang, zc), 0.018, seg=6)

    # ---- harness and small lines: controller cables, chamber sensors, preburner oxidiser lines, drain clamps
    c_ang = 250.0
    runs = [
        # controller -> connector at the thrust cone (stage interface)
        ([_pol(0.71, c_ang, 3.13), _pol(0.70, c_ang + 8, 3.40), _pol(0.42, c_ang + 25, 3.92), _pol(0.27, c_ang + 25, 3.98)],
         0.016, False, "detail_dark"),
        # controller -> HPFTP speed sensor
        ([_pol(0.62, c_ang - 14, 2.84), _pol(0.52, 290, 2.78), _pol(0.44, 330, 2.80), (x_f - 0.14, -0.12, 2.86)],
         0.013, True, "detail_dark"),
        # controller -> HPOTP
        ([_pol(0.66, c_ang + 12, 3.13), (-0.40, -0.52, 3.20), (x_o + 0.04, -0.17, 3.30)], 0.013, False, "detail_dark"),
        # chamber pressure / temperature sensor lines down the chamber to the joint flange
        ([_pol(0.29, 220, z_ch_top + 0.04), _pol(0.29, 220, 3.20), _pol(0.20, 220, 2.95), _pol(r_at(2.75) + 0.035, 220, 2.75)],
         0.011, True, "detail_dark"),
        ([_pol(0.29, 320, z_ch_top + 0.04), _pol(0.29, 320, 3.20), _pol(0.20, 320, 2.95), _pol(r_at(2.75) + 0.035, 320, 2.75)],
         0.011, False, "detail_dark"),
        # oxidiser supply to the fuel preburner arcing over the powerhead
        ([(x_o + 0.06, -0.08, 3.84), (-0.20, -0.46, 4.00), (0.34, -0.40, 4.04), (x_f - 0.06, -0.06, 3.97)],
         0.026, False, "engine_metal"),
        # oxidiser supply into the oxidiser preburner dome
        ([(x_o, -0.12, 3.30), (x_o - 0.03, -0.24, 3.56), (x_o - 0.02, -0.20, 3.92), (x_o, -0.07, 3.94)],
         0.026, False, "engine_metal"),
        # purge / pressurant line from the stage down to the HPFTP turbine
        ([_pol(0.27, 20, 3.98), _pol(0.40, 22, 3.90), (x_f - 0.08, 0.16, 3.62), (x_f - 0.06, 0.16, 3.40)],
         0.012, True, "detail_dark"),
        # igniter cables to both preburner igniters
        ([_pol(0.27, 160, 3.98), (x_o + 0.14, 0.14, 4.06), (x_o + 0.03, 0.03, 4.04)], 0.010, False, "detail_dark"),
        ([_pol(0.27, -20, 3.98), (x_f - 0.16, -0.10, 4.06), (x_f - 0.03, -0.03, 4.08)], 0.010, False, "detail_dark"),
    ]
    _lines(mb, runs, block=0.032)

    # ---- gimbal actuators, 90 degrees apart, from lugs on the hot-gas manifold to the frame outriggers
    for a_deg in (48.0, 138.0):
        lug = _pol(0.50, a_deg, 3.72)
        mb.strut(_pol(0.28, a_deg, 3.70), lug, 0.035, seg=8)
        mb.box((0.07, 0.07, 0.07), "engine_metal", matrix=_rotz_at(lug, math.radians(a_deg)))
        actuator(mb, lug, _pol(0.90, a_deg, length - 0.085), 0.050, seg=10)
        _outrigger(mb, math.radians(a_deg), e["mount_d"] / 2.0, 0.90, length, (0.09, 0.06))

    # ---- markings (sparse, generic): serial on the chamber, fluid tags on the low-pressure pumps
    ctx.decal("serial_s1", z_ch_top - 0.17, math.radians(-75.0), (0.17, 0.0425), r_at=lambda z: 0.2505, z_max=length)
    ctx.decal("fluid_lox", 3.53, math.radians(-120.0), (0.13, 0.0325), r_at=lambda z: 0.1205, center=lpo,
              z_max=length)
    ctx.decal("fluid_lh2", 3.53, math.radians(60.0), (0.13, 0.0325), r_at=lambda z: 0.1305, center=lpf,
              z_max=length)

    _finish(ctx, eid, z_piv)


def _rotz_at(loc, ang):
    from mathutils import Matrix
    return Matrix.Translation(Vector(loc)) @ Matrix.Rotation(ang, 4, "Z")


# =========================================================================== Raptor class
def gen_methalox_full_flow(ctx):
    """Full-flow staged-combustion methalox engine (Raptor class): clean tube-wall bell, regen inlet manifold, and
    two compact turbopump stacks (inlet + pump with volute + turbine + preburner), oxygen-rich on -X and fuel-rich
    on +X, each turbine dumping straight into the injector's hot-gas manifold."""
    eid = "eng_methalox_full_flow"
    e = spec.ENGINES[eid]
    mb = ctx.mesh()
    length = e["length"]
    r_exit = e["exit_d"] / 2.0

    # ---- nozzle: 132 coolant channels (game_value: ~3.0 cm per channel at the 1.25 m exit so the wall reads at
    # Build Bay distance; angle-normalised UV0), two dark stiffeners and a slim rolled exit rim. Clean (no soot).
    noz_len = 1.92
    r_throat = 0.115
    r_at = bell_nozzle(mb, z_exit=0.0, length=noz_len, r_throat=r_throat, r_exit=r_exit - 0.012, seg=56,
                       steps=16, wall=0.012, theta_n=34.0, theta_e=7.0, bands=2, band_size=0.011,
                       band_z0=0.10, band_z1=0.44, tubes=132, band_mat="nozzle_hot", stiffener_trim=None,
                       heat_exit=0.28)
    s_ring = mb.seg(56, 14)
    mb.torus(r_at(0.016) + 0.002, 0.014, 0.016, s_ring, _minor(mb, 6), "engine_metal")
    # regen inlet manifold where the fuel discharge enters the nozzle wall, plus the nozzle/chamber joint flange
    z_man = 1.26
    r_man = r_at(z_man) + 0.030
    mb.torus(r_man, 0.034, z_man, s_ring, _minor(mb, 8), "engine_metal")
    stiffener(mb, r_at, 1.70, 0.05, 0.016, mb.seg(40, 12), "engine_metal", trim="bolt_flange")

    # ---- chamber and main injector with its hot-gas manifold ring
    z_ch_top = chamber(mb, z_throat=noz_len, r_throat=r_throat, r_chamber=0.205, length=0.40, seg=40,
                       mat="nozzle_hot", dome=False, heat=0.6)
    s_ch = mb.seg(40, 12)
    z_inj = z_ch_top + 0.10
    mb.sphere((0, 0, z_inj), 0.27, s_ch, mb.steps(10, 5), "engine_metal", scale=(1.0, 1.0, 0.52))
    mb.band(0.205, z_ch_top - 0.01, z_ch_top + 0.03, 0.035, s_ch, "engine_metal", trim="bolt_flange")
    z_hg = z_ch_top + 0.045
    mb.torus(0.245, 0.052, z_hg, s_ch, _minor(mb, 8), "engine_metal")
    mb.band(0.205, z_ch_top - 0.17, z_ch_top - 0.155, 0.005, s_ch, "engine_metal", trim="weld_bead")

    # ---- gimbal mount and thrust neck
    z_piv = gimbal_mount(mb, z_top=length, d=e["mount_d"], h=0.36, seg=28)
    mb.cyl((0, 0, z_inj + 0.08), (0, 0, length - 0.30), 0.15, s_ch, "engine_metal", r1=0.165, caps=False)
    with mb.radial(4, phase=TAU / 8):
        mb.box((0.10, 0.018, 0.20), "engine_metal", center=(0.20, 0.0, length - 0.42))

    # ---- two turbopump stacks: oxygen-rich (-X) and fuel-rich (+X). Top to bottom: inlet with inducer, pump with
    # scroll case, turbine housing (bolted flange) and the preburner (dome + igniter) underneath.
    x_s = 0.47
    r_p, r_t, r_pb = 0.12, 0.13, 0.092
    z_pb0, z_t0, z_p0, z_p1 = 1.80, z_hg - 0.07, z_hg + 0.07, 2.73
    outs = {}
    for sign in (-1.0, 1.0):
        x = sign * x_s
        pump(mb, (x, 0, z_p0), (x, 0, z_p1), r_p, seg=24, ribs=6)
        # volute: both discharges on the +Y side pointing -X (end_angle -90; the scroll frame is turned 180 deg),
        # so the widest part of the scroll faces +-Y and the stack stays inside the 1.35 m envelope
        outs[sign] = volute(mb, (x, 0, z_p0), (x, 0, z_p1), r_p, z_frac=0.30, turns=0.88, end_angle=-90.0,
                            outlet_len=0.08)
        s_t = mb.seg(24, 10)
        with mb.xform(loc=(x, 0, 0)):
            # turbine housing with bolted flanges top and bottom
            mb.lathe([(r_pb * 0.9, z_t0 - 0.01), (r_t, z_t0 + 0.02), (r_t, z_p0 - 0.02), (r_p * 0.7, z_p0 + 0.01)],
                     s_t, "engine_metal", crease=40.0)
            mb.band(r_t, z_t0 + 0.035, z_t0 + 0.06, 0.016, s_t, "engine_metal", trim="bolt_flange")
            if mb.want(0):
                mb.bolt_ring(r_t + 0.008, z_t0 + 0.06, 16, 0.006, 0.009)
            # preburner: cylinder with a bottom dome, a mid flange and an igniter
            mb.lathe([(r_pb, z_pb0 + 0.04), (r_pb, z_t0)], s_t, "engine_metal", crease=50.0)
            mb.dome(r_pb, 0.05, z_pb0 + 0.04, s_t, mb.steps(4, 2), "engine_metal", up=False)
            mb.band(r_pb, z_pb0 + 0.20, z_pb0 + 0.23, 0.014, s_t, "engine_metal", trim="bolt_flange")
            if mb.want(0):
                mb.bolt_ring(r_pb + 0.007, z_pb0 + 0.23, 14, 0.0055, 0.008)
                mb.cyl((0.0, 0.0, z_pb0 - 0.004), (0.0, 0.0, z_pb0 - 0.05), 0.022, 8, "detail_dark", caps=True)
        # turbine exhaust: short flanged transfer straight into the injector's hot-gas manifold
        mb.cyl((x - sign * (r_t - 0.02), 0, z_hg), (sign * 0.27, 0, z_hg), 0.062, mb.seg(16, 8), "engine_metal",
               caps=False)
        pipe_flange(mb, (sign * 0.325, 0, z_hg), (sign, 0, 0), 0.062, thickness=0.024)
        # inlet: short canted adapter off the pump eye, then a straight flex inlet up to the stage
        x_in = sign * 0.525
        mb.cyl((x, 0, z_p1 - 0.03), (x_in, 0, z_p1 + 0.075), r_p * 0.52, mb.seg(14, 8), "engine_metal",
               r1=0.058, caps=True)
        _inlet(mb, x_in, 0.0, z_p1 + 0.02, length, 0.066 if sign > 0 else 0.070, at=(0.30, 0.64))

    # ---- fuel pump discharge -> regen inlet manifold (+Y side)
    vf = Vector(outs[1.0][0])
    a_m = 62.0
    _duct(mb, [vf, (0.27, vf.y, vf.z), (0.28, 0.37, 2.02), (0.25, 0.43, 1.50), _pol(r_man, a_m, z_man + 0.045)],
          0.045, run=2, at=(0.30, 0.68))
    # ---- oxygen pump discharge -> oxygen-rich preburner
    vo = Vector(outs[-1.0][0])
    _duct(mb, [vo, (-0.61, vo.y, vo.z), (-0.61, 0.20, 2.02), (-x_s, r_pb + 0.004, 2.02)], 0.045, run=1,
          at=(0.28, 0.70))
    # ---- regen return: chamber jacket -> fuel-rich preburner (-Y side of the +X stack)
    _duct(mb, [_pol(0.20, -28.0, z_ch_top - 0.12), _pol(0.34, -28.0, z_ch_top - 0.12), (x_s, -0.25, 1.96),
               (x_s, -(r_pb + 0.004), 1.96)], 0.040, run=1, at=(0.28, 0.70))
    # ---- second fuel lead: manifold -> lower chamber jacket (-Y), short, two bellows
    _duct(mb, [_pol(r_man, -62.0, z_man + 0.045), _pol(r_man + 0.03, -62.0, 1.55),
               _pol(r_at(1.76) + 0.012, -62.0, 1.76)], 0.036, run=0, at=(0.35, 0.72))

    # ---- controller pack on the +Y side, bracketed to the neck
    with mb.xform(loc=(-0.10, 0.36, 2.60)):
        mb.box((0.22, 0.08, 0.20), "detail_dark")
        mb.box((0.26, 0.02, 0.24), "engine_metal", center=(0.0, -0.05, 0.0))
        if mb.want(0):
            for dx in (-0.06, 0.0, 0.06):
                mb.cyl((dx, 0.04, 0.07), (dx, 0.065, 0.07), 0.014, 8, "engine_metal", caps=True)
    mb.strut((-0.10, 0.34, 2.68), (-0.05, 0.14, 2.70), 0.014, seg=6)
    mb.strut((-0.10, 0.34, 2.52), (-0.05, 0.14, 2.56), 0.014, seg=6)

    # ---- harness: >= 8 clamped lines, every one ending on a connector block or inside a component
    runs = [
        # controller -> stage connector
        ([(-0.14, 0.40, 2.70), (-0.16, 0.40, 2.86), (-0.10, 0.26, 2.98)], 0.012, False, "detail_dark"),
        # controller -> fuel turbine speed sensor and -> oxygen turbine speed sensor
        ([(0.10, -0.13, 2.64), (0.30, -0.10, 2.50), (x_s - 0.10, -0.07, z_t0 + 0.05)], 0.010, True, "detail_dark"),
        ([(-0.20, 0.40, 2.56), (-0.34, 0.26, 2.46), (-x_s + 0.10, 0.09, z_t0 + 0.05)], 0.010, True, "detail_dark"),
        # igniter cables: exciter block on each turbine housing, down the preburner wall to the igniter
        ([_pol(r_t + 0.02, 60.0, z_t0 + 0.04, x_s), _pol(r_pb + 0.028, 60.0, z_t0 - 0.04, x_s),
          _pol(r_pb + 0.028, 60.0, z_pb0 + 0.06, x_s), _pol(0.045, 60.0, z_pb0 - 0.025, x_s)], 0.009, False,
         "detail_dark"),
        ([_pol(r_t + 0.02, 210.0, z_t0 + 0.04, -x_s), _pol(r_pb + 0.028, 210.0, z_t0 - 0.04, -x_s),
          _pol(r_pb + 0.028, 210.0, z_pb0 + 0.06, -x_s), _pol(0.045, 210.0, z_pb0 - 0.025, -x_s)], 0.009, False,
         "detail_dark"),
        # chamber pressure transducer lines
        ([_pol(0.215, 200, z_ch_top - 0.08), _pol(0.27, 200, z_ch_top - 0.20), _pol(r_at(1.78) + 0.03, 200, 1.78)],
         0.009, True, "detail_dark"),
        ([_pol(0.215, 250, z_ch_top - 0.08), _pol(0.27, 250, z_ch_top - 0.20), _pol(r_at(1.78) + 0.03, 250, 1.78)],
         0.009, False, "detail_dark"),
        # actuator power cables from the neck to each actuator barrel
        ([(0.10, -0.13, 2.86), _pol(0.40, -45.0, 2.88), _pol(0.46, -45.0, 2.80)], 0.011, False, "detail_dark"),
        ([(-0.10, -0.13, 2.86), _pol(0.40, -135.0, 2.88), _pol(0.46, -135.0, 2.80)], 0.011, False, "detail_dark"),
        # manifold temperature probe line, clamped along the nozzle wall up to the chamber
        ([_pol(r_man + 0.03, 120.0, z_man + 0.03)] + [_pol(r_at(z) + 0.022, 122.0, z) for z in (1.42, 1.56, 1.68)]
         + [_pol(0.226, 125.0, z_ch_top - 0.15)], 0.009, True, "detail_dark"),
    ]
    _lines(mb, runs, block=0.026)

    # ---- gimbal actuators (electric), 90 degrees apart on the -Y side, from lugs on the injector head
    for a_deg in (-45.0, -135.0):
        lug = _pol(0.31, a_deg, z_inj + 0.03)
        mb.box((0.05, 0.05, 0.05), "engine_metal", matrix=_rotz_at(lug, math.radians(a_deg)))
        actuator(mb, lug, _pol(0.60, a_deg, length - 0.065), 0.036, seg=10)
        _outrigger(mb, math.radians(a_deg), e["mount_d"] / 2.0, 0.60, length, (0.07, 0.045))

    # ---- markings: serial on the neck, fluid tags on the preburners
    ctx.decal("serial_s1", z_ch_top - 0.075, math.radians(-72.0), (0.15, 0.0375), r_at=lambda z: 0.2055,
              z_max=length)
    ctx.decal("fluid_lox", 2.12, math.radians(-150.0), (0.10, 0.025), r_at=lambda z: r_pb + 0.0005,
              center=(-x_s, 0.0), z_max=length)
    ctx.decal("fluid_ch4", 2.12, math.radians(-30.0), (0.10, 0.025), r_at=lambda z: r_pb + 0.0005,
              center=(x_s, 0.0), z_max=length)

    _finish(ctx, eid, z_piv)


# =========================================================================== Rutherford class
def gen_electric_pump_mini(ctx):
    """Tiny battery-electric pump-fed engine (Rutherford class): printed-metal chamber and injector, small channel-
    wall bell, two electric pump stacks (inlet + pump head with volute + finned motor), an inverter box with power
    cables, two electric gimbal actuators at 90 degrees."""
    eid = "eng_electric_pump_mini"
    e = spec.ENGINES[eid]
    mb = ctx.mesh()
    length = e["length"]
    r_exit = e["exit_d"] / 2.0

    # ---- nozzle: 32 printed coolant channels (game_value: ~2.5 cm per channel at the 0.25 m exit, so the wall
    # reads like the bigger engines), two slim dark stiffeners, a rolled exit rim and the regen inlet manifold.
    # 96 radial segments = 3 per channel: at 40 segments (< 2 per channel) the bell shaded as flat staves (RUBRIC M6)
    noz_len = 0.335
    r_throat = 0.040
    r_at = bell_nozzle(mb, z_exit=0.0, length=noz_len, r_throat=r_throat, r_exit=r_exit, seg=96, steps=14,
                       wall=0.006, theta_n=30.0, theta_e=10.0, bands=2, band_size=0.004, band_z0=0.14,
                       band_z1=0.48, tubes=32, band_mat="nozzle_hot", stiffener_trim=None, heat_exit=0.35)
    s_n = mb.seg(64, 12)
    mb.torus(r_at(0.006) + 0.001, 0.0055, 0.006, s_n, _minor(mb, 6), "engine_metal")
    z_man = 0.27
    r_man = r_at(z_man) + 0.010
    mb.torus(r_man, 0.009, z_man, mb.seg(32, 10), _minor(mb, 6), "engine_metal")

    # ---- printed chamber: vertical cooling ribs and a bolted injector cap
    r_ch = 0.062
    z_ch_top = chamber(mb, z_throat=noz_len, r_throat=r_throat, r_chamber=r_ch, length=0.125, seg=28,
                       mat="engine_metal", dome=False, heat=0.25, flange=False)
    s_c = mb.seg(28, 10)
    stiffener(mb, r_at, noz_len - 0.016, 0.014, 0.005, s_c, "engine_metal", trim="bolt_flange")
    if mb.want(0):
        with mb.radial(16, phase=TAU / 32):
            mb.box((0.006, 0.006, 0.080), "engine_metal", center=(r_ch + 0.002, 0.0, z_ch_top - 0.05))
    mb.lathe([(r_ch + 0.004, z_ch_top - 0.006), (r_ch + 0.016, z_ch_top - 0.006), (r_ch + 0.016, z_ch_top + 0.014),
              (r_ch * 0.72, z_ch_top + 0.030), (0.0, z_ch_top + 0.030)], s_c, "engine_metal", crease=35.0)
    if mb.want(0):
        mb.bolt_ring(r_ch + 0.009, z_ch_top + 0.012, 12, 0.0045, 0.006)

    # ---- gimbal
    z_piv = gimbal_mount(mb, z_top=length, d=e["mount_d"], h=0.135, seg=20)
    mb.cyl((0, 0, z_ch_top + 0.028), (0, 0, length - 0.125), 0.036, s_c, "engine_metal", r1=0.052, caps=False)

    # ---- two electric pump stacks, fuel on +X and oxidiser on -X: inlet (with inducer) on top, pump head with
    # its scroll case, and the finned motor hanging underneath
    x_s = 0.135
    r_p, r_m = 0.034, 0.040
    z_p0, z_p1 = 0.45, 0.52
    z_m0 = 0.30
    outs = {}
    for sign in (1.0, -1.0):
        x = sign * x_s
        pump(mb, (x, 0, z_p0), (x, 0, z_p1), r_p, seg=20, ribs=0)
        # scroll frame is turned 180 deg about +Z: fuel discharges outboard (+X side, towards +Y), oxidiser
        # discharges inboard (+X side of the -X pump, towards +Y)
        outs[sign] = volute(mb, (x, 0, z_p0), (x, 0, z_p1), r_p, z_frac=0.45, turns=0.85,
                            end_angle=180.0, outlet_len=0.02)
        _inlet(mb, x, 0.0, z_p1 - 0.01, length, 0.017, at=(0.30, 0.62))
        with mb.xform(loc=(x, 0, 0)):
            # motor can: end bell, barrel, flange to the pump head
            s_m = mb.seg(20, 10)
            mb.lathe([(0.0, z_m0), (r_m * 0.75, z_m0), (r_m, z_m0 + 0.012), (r_m, z_p0 - 0.006),
                      (r_p * 0.95, z_p0 + 0.004)], s_m, "engine_metal", crease=40.0)
            mb.band(r_m, z_p0 - 0.014, z_p0 - 0.004, 0.005, s_m, "engine_metal", trim="bolt_flange")
            mb.band(r_m, z_m0 + 0.016, z_m0 + 0.024, 0.004, s_m, "engine_metal")
            # longitudinal cooling fins
            with mb.radial(14 if mb.lod == 0 else 7):
                mb.box((0.009, 0.0035, z_p0 - z_m0 - 0.05), "engine_metal",
                       center=(r_m + 0.0035, 0.0, (z_m0 + z_p0) / 2.0 + 0.004))
            if mb.want(0):
                mb.bolt_ring(r_m + 0.003, z_p0 - 0.004, 10, 0.003, 0.004)
                mb.cyl((0.0, 0.0, z_m0 + 0.002), (0.0, 0.0, z_m0 - 0.012), 0.011, 8, "detail_dark", caps=True)
            # cable gland on the motor's +Y side
            mb.cyl((0.0, r_m - 0.004, 0.375), (0.0, r_m + 0.012, 0.375), 0.008, 8, "detail_dark", caps=True)

    # ---- fuel discharge: outboard down the motor to the regen inlet manifold
    vf = Vector(outs[1.0][0])
    _duct(mb, [vf, (vf.x, 0.062, vf.z), (0.172, 0.072, z_man), _pol(r_man + 0.004, 28.0, z_man)], 0.010, run=1,
          at=(0.32, 0.66))
    # ---- oxidiser discharge: round the +Y side into the injector cap
    vo = Vector(outs[-1.0][0])
    _duct(mb, [vo, (vo.x, 0.094, vo.z), (0.0, 0.094, vo.z), (0.0, 0.066, z_ch_top + 0.016)], 0.010, run=1,
          at=(0.36, 0.64))

    # ---- inverter / battery box on +Y, strutted to both motors
    by, bz = 0.165, 0.42
    mb.box((0.150, 0.066, 0.120), "detail_dark", center=(0.0, by, bz))
    mb.box((0.158, 0.008, 0.128), "engine_metal", center=(0.0, by - 0.037, bz))
    for dz in ((-0.035, 0.035) if mb.want(0) else ()):
        mb.box((0.154, 0.070, 0.006), "engine_metal", center=(0.0, by, bz + dz))
    for sx in (1.0, -1.0):
        mb.strut((sx * 0.055, by - 0.040, bz - 0.03), (sx * (x_s - 0.02), 0.032, bz - 0.04), 0.0055, seg=6)
    if mb.want(0):
        mb.box((0.090, 0.005, 0.016), "engine_metal", center=(0.0, by + 0.035, bz + 0.040))
        for bx in (-0.030, 0.0, 0.030):
            mb.cyl((bx, by + 0.035, bz + 0.040), (bx, by + 0.044, bz + 0.040), 0.006, 8, "engine_metal",
                   caps=(False, True))
        for bx in (-0.066, 0.066):
            for bzz in (-0.052, 0.052):
                mb.cyl((bx, by - 0.041, bz + bzz), (bx, by - 0.046, bz + bzz), 0.0045, 6, "engine_metal",
                       caps=(False, True), smooth=False)

    # ---- harness: power cables to both motors, stage links, sensor and igniter lines (>= 8, all clamped)
    runs = []
    for sx in (1.0, -1.0):
        x = sx * x_s
        runs += [
            # 3-phase power cable: inverter side -> motor cable gland
            ([(sx * 0.072, by - 0.012, bz - 0.035), (sx * 0.105, 0.110, 0.385), (x, r_m + 0.020, 0.375)], 0.0065,
             True, "detail_dark"),
            # inverter -> stage connector under the mount plate
            ([(sx * 0.050, by - 0.010, bz + 0.058), (sx * 0.055, 0.130, 0.575), (sx * 0.050, 0.078, 0.6125)], 0.006,
             False, "detail_dark"),
            # motor temperature sensor: motor end bell -> inverter
            ([(x, -0.020, z_m0 + 0.004), (x * 0.92, 0.060, z_m0 + 0.030), (sx * 0.070, by - 0.030, bz - 0.058)],
             0.0045, False, "detail_dark"),
        ]
    runs += [
        # chamber pressure transducer line and igniter feed on the -Y side
        ([_pol(r_ch + 0.018, -90.0, z_ch_top - 0.002), _pol(r_ch + 0.010, -90.0, z_ch_top - 0.07),
          _pol(r_at(noz_len - 0.03) + 0.012, -90.0, noz_len - 0.03)], 0.0045, True, "detail_dark"),
        ([_pol(r_ch + 0.018, 150.0, z_ch_top - 0.002), _pol(r_ch + 0.010, 150.0, z_ch_top - 0.08),
          _pol(r_at(noz_len - 0.03) + 0.012, 150.0, noz_len - 0.03)], 0.0045, False, "detail_dark"),
    ]
    _lines(mb, runs, block=0.012)

    # ---- two small electric gimbal actuators on the -Y side, 90 degrees apart
    for a_deg in (-45.0, -135.0):
        lug = _pol(0.088, a_deg, z_ch_top + 0.004)
        mb.box((0.016, 0.016, 0.016), "engine_metal", matrix=_rotz_at(lug, math.radians(a_deg)))
        actuator(mb, lug, _pol(0.150, a_deg, length - 0.022), 0.011, seg=8)
        _outrigger(mb, math.radians(a_deg), e["mount_d"] / 2.0, 0.150, length, (0.022, 0.014))

    _finish(ctx, eid, z_piv)


register("eng_hydrolox_high_efficiency", "engine_s1", gen_hydrolox_high_efficiency, "7.7")
register("eng_methalox_full_flow", "engine_s1", gen_methalox_full_flow, "7.7")
register("eng_electric_pump_mini", "engine_s1", gen_electric_pump_mini, "7.7")
