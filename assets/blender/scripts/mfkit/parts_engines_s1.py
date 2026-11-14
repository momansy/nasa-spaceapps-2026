"""First-stage engines, part A: the three kerolox engines of GAME_DESIGN.md 7.7.

  eng_kerolox_workhorse          Merlin 1D class   gas generator, turbine exhaust duct
  eng_kerolox_giant              F-1 class         wrap-around exhaust manifold + extension
  eng_kerolox_staged_combustion  RD-180 class      two chambers, one turbopump

Layout (see engine_common): nozzle exit plane at z = 0, gimbal mount face at z = length.
Dimensions come from spec.ENGINES (real_world_approximate); everything else here
(pump placement, pipe runs, band counts) is a game_value styling choice.
"""
from __future__ import annotations

import math

from mathutils import Vector

from . import spec
from .core import TAU
from .engine_common import actuator, bell_nozzle, chamber, gimbal_mount, pipe_flange, pump
from .pipeline import register


# --------------------------------------------------------------------------- helpers
def _pol(r, deg, z, cx=0.0, cy=0.0):
    """Point at radius r, azimuth deg (from +X towards +Y) around the axis through (cx, cy)."""
    a = math.radians(deg)
    return (cx + r * math.cos(a), cy + r * math.sin(a), z)


def _minor(mb, n=8):
    return n if mb.lod == 0 else max(4, n // 2)


def _inlet(mb, x, y, z0, z_face, r, mat="engine_metal", bellows=3):
    """Vertical propellant inlet: pipe + flex bellows + bolted flange, top at <= z_face."""
    s = mb.seg(14, 8)
    z_top = z_face - 0.30 * r - 0.004
    mb.cyl((x, y, z0), (x, y, z_top), r, s, mat, caps=False)
    with mb.xform(loc=(x, y, 0.0)):
        mb.lathe([(r * 0.97, z_top - 0.004), (0.0, z_top - 0.004)], s, "detail_dark")
        if mb.want(0):
            span = (z_top - z0)
            for i in range(bellows):
                z = z0 + span * (0.30 + 0.14 * i)
                mb.torus(r * 1.02, r * 0.13, z, s, 4, mat)
    pipe_flange(mb, (x, y, z_top - 0.18 * r), (0, 0, 1), r, mat, seg=14, bolts=8)


def _open_end(mb, p, direction, r, mat="engine_metal"):
    """Dark bore + rim on the open end of a duct that ends at p, pointing along direction."""
    p, d = Vector(p), Vector(direction).normalized()
    s = mb.seg(12, 8)
    mb.cyl(p - d * (r * 0.5), p - d * (r * 0.06), r * 0.96, s, "detail_dark", caps=(False, True))
    mb.cyl(p - d * (r * 0.45), p, r * 1.10, s, mat, caps=(False, False))
    mb.cyl(p, p - d * (r * 0.45), r * 1.0, s, mat, r1=r * 1.10, caps=False)


def _bands(mb, r_at, z_list, size, seg, mat, heat=0.0, minor=4):
    for i, z in enumerate(z_list):
        if mb.lod > 0 and i % 2 == 1 and len(z_list) > 3:
            continue
        mb.torus(r_at(z) + size * 0.35, size, z, seg, minor, mat, heat=heat)


def _lug(mb, p, size, mat="engine_metal"):
    mb.box((size, size, size), mat, center=tuple(p))


def _finish(ctx, pid, z_pivot, extra=None):
    e = spec.ENGINES[pid]
    ctx.empty("attach_top", (0.0, 0.0, e["length"]))
    ctx.empty("nozzle_exit", (0.0, 0.0, 0.0))
    ctx.empty("gimbal_pivot", (0.0, 0.0, round(z_pivot, 4)))
    ctx.meta.update(
        name=e["name"], twin=e["twin"], stage=1,
        length_m=e["length"], diameter_bottom_m=e["exit_d"], diameter_top_m=e["mount_d"],
        exit_diameter_m=e["exit_d"], envelope_diameter_m=e["envelope_d"],
        mount_diameter_m=e["mount_d"], gimbal_pivot_z_m=round(z_pivot, 4), ring_check=False,
        value_types=dict(length_m="real_world_approximate", exit_diameter_m="real_world_approximate",
                         envelope_diameter_m="real_world_approximate",
                         diameter_bottom_m="real_world_approximate",
                         diameter_top_m="game_value", mount_diameter_m="game_value",
                         gimbal_pivot_z_m="game_value"))
    if extra:
        ctx.meta.update(extra)


# --------------------------------------------------------------------------- Kerolox Workhorse
def gen_workhorse(ctx):
    """Merlin 1D class: compact gas-generator engine with a turbine exhaust duct beside the bell."""
    pid = "eng_kerolox_workhorse"
    e = spec.ENGINES[pid]
    mb = ctx.mesh()
    length, r_exit = e["length"], e["exit_d"] / 2.0
    r_th, bell_len = 0.115, 1.30
    s_main = mb.seg(56, 14)
    s_pipe = mb.seg(12, 6)

    r_at = bell_nozzle(mb, z_exit=0.0, length=bell_len, r_throat=r_th, r_exit=r_exit, seg=56, steps=16,
                       wall=0.012, theta_n=30.0, theta_e=9.0, bands=5, band_z0=0.30, band_z1=0.86,
                       band_size=0.011)
    # regen fuel inlet manifold near the exit
    z_man = 0.15
    mb.torus(r_at(z_man) + 0.022, 0.026, z_man, s_main, _minor(mb), "engine_metal")
    # throat stiffener collar
    mb.torus(r_th + 0.030, 0.022, bell_len - 0.02, mb.seg(32, 10), _minor(mb, 6), "engine_metal")

    z_ch = chamber(mb, z_throat=bell_len, r_throat=r_th, r_chamber=0.19, length=0.52, seg=36,
                   mat="nozzle_hot", heat=0.9)
    # injector / LOX dome
    s_head = mb.seg(36, 10)
    mb.lathe([(0.19, 1.79), (0.245, 1.83), (0.245, 1.95), (0.20, 2.05), (0.11, 2.11)], s_head,
             "engine_metal", crease=35.0)
    if mb.want(0):
        mb.bolt_ring(0.222, 1.95, 20, 0.011, 0.014)
    # thrust column up to the gimbal
    g_h = 0.38
    z_piv = gimbal_mount(mb, z_top=length, d=e["mount_d"], h=g_h, seg=28)
    z_gb = length - g_h
    mb.lathe([(0.11, 2.10), (0.118, 2.22), (e["mount_d"] / 2 * 0.55, z_gb + 0.01)], s_head, "engine_metal",
             crease=50.0)
    with mb.radial(4, phase=TAU / 8):
        mb.extrude_poly([(0.10, 2.13), (0.235, 2.13), (0.135, z_gb)], -0.012, 0.012, "engine_metal",
                        matrix=_xz_plane())
    _ = z_ch

    # ---- turbopump on the +X side, shaft vertical
    px = 0.41
    pr = 0.135
    pump(mb, (px, 0, 1.40), (px, 0, 2.30), pr, ribs=6, seg=20)
    # turbine housing under the pump
    with mb.xform(loc=(px, 0, 0)):
        mb.lathe([(0.0, 1.27), (0.085, 1.27), (0.150, 1.33), (0.150, 1.43), (0.10, 1.47)], mb.seg(20, 8),
                 "engine_metal", crease=40.0)
        if mb.want(0):
            mb.bolt_ring(0.142, 1.43, 12, 0.008, 0.012)
    # pump mounts to the chamber
    for z in (1.62, 2.02):
        mb.strut((0.18, 0.07, z), (px - 0.10, 0.07, z + 0.03), 0.018, seg=6)
        mb.strut((0.18, -0.07, z), (px - 0.10, -0.07, z + 0.03), 0.018, seg=6)

    # ---- turbine exhaust duct: the signature pipe running down beside the bell
    dr = 0.060
    off = 0.11
    z_end = 0.07
    duct = [(px, 0, 1.30), (px, 0, 1.12), (r_at(0.80) + off, 0, 0.80), (r_at(0.45) + off, 0, 0.45),
            (r_at(z_end) + off, 0, z_end)]
    mb.tube(duct, dr, s_pipe, "engine_metal", bend=0.22, bend_seg=5)
    _open_end(mb, duct[-1], Vector(duct[-1]) - Vector(duct[-2]), dr)
    pipe_flange(mb, (px, 0, 1.22), (0, 0, 1), dr, seg=12, bolts=8)
    for z in (0.42, 0.78):
        x_d = r_at(z) + off
        mb.box((off + 0.01, 0.022, 0.05), "engine_metal", center=(x_d - off / 2.0, 0.0, z))
        with mb.xform(loc=(x_d, 0, 0)):
            mb.band(dr, z - 0.025, z + 0.025, 0.010, s_pipe, "engine_metal")

    # ---- gas generator feeding the turbine
    gg = (0.305, 0.215)
    with mb.xform(loc=(gg[0], gg[1], 0)):
        mb.lathe([(0.0, 1.44), (0.05, 1.44), (0.058, 1.48), (0.058, 1.68), (0.035, 1.74), (0.0, 1.74)],
                 mb.seg(14, 8), "engine_metal", crease=40.0)
    mb.tube([(gg[0], gg[1], 1.47), (gg[0], gg[1], 1.36), (px - 0.02, 0.10, 1.35)], 0.034, mb.seg(10, 6),
            "engine_metal", bend=0.07)
    if mb.want(0):
        mb.tube([(gg[0], gg[1], 1.72), (gg[0] - 0.02, gg[1] + 0.02, 1.84), (0.20, 0.14, 1.90)], 0.014, 6,
                "engine_metal", bend=0.05)

    # ---- propellant inlets (top of the pump and its -Y side)
    _inlet(mb, px, 0.0, 2.28, length - 0.06, 0.085)
    mb.tube([(px, -0.10, 2.02), (px, -0.305, 2.02), (px, -0.305, 2.50)], 0.060, s_pipe, "engine_metal",
            bend=0.13)
    _inlet(mb, px, -0.305, 2.48, length - 0.06, 0.060, bellows=2)

    # ---- high-pressure LOX line: pump -> LOX dome (over the +Y side)
    mb.tube([(px, 0.10, 2.16), (px, 0.30, 2.16), (0.12, 0.36, 2.10), (0.0, 0.20, 2.00)], 0.045, s_pipe,
            "engine_metal", bend=0.12)
    pipe_flange(mb, (px, 0.19, 2.16), (0, 1, 0), 0.045, seg=10, bolts=6)
    # main oxidiser valve
    mb.cyl((0.20, 0.365, 2.115), (0.30, 0.345, 2.14), 0.062, mb.seg(12, 6), "engine_metal")

    # ---- high-pressure fuel line: pump -> regen manifold at the nozzle exit (-Y side)
    az = -52.0
    fuel = [(px, -0.10, 1.66), (px - 0.03, -0.27, 1.60), _pol(r_at(1.05) + 0.085, az, 1.05),
            _pol(r_at(0.55) + 0.07, az, 0.55), _pol(r_at(z_man) + 0.03, az, z_man + 0.03)]
    mb.tube(fuel, 0.040, s_pipe, "engine_metal", bend=0.14, bend_seg=5)
    pipe_flange(mb, _pol(r_at(0.55) + 0.07, az, 0.62), (Vector(fuel[3]) - Vector(fuel[2])), 0.040, seg=10,
                bolts=6)
    # main fuel valve on the line
    mb.cyl(_pol(r_at(1.05) + 0.085, az, 1.12), _pol(r_at(0.95) + 0.082, az, 0.94), 0.058, mb.seg(12, 6),
           "engine_metal")

    # ---- two gimbal actuators, 90 degrees apart on the side away from the pump
    for a_deg in (135.0, 225.0):
        lug = _pol(0.235, a_deg, 1.74)
        top = _pol(0.50, a_deg, length - 0.09)
        mb.strut(_pol(0.17, a_deg, 1.70), lug, 0.026, seg=6)
        mb.strut(_pol(0.17, a_deg, 1.84), lug, 0.020, seg=6)
        actuator(mb, lug, top, 0.036)
        if mb.want(0):
            _lug(mb, top, 0.07)

    # ---- small lines and harness
    if mb.want(0):
        # igniter fluid line and sensor harness down the chamber
        mb.tube([_pol(0.20, 180, 2.08), _pol(0.26, 180, 1.98), _pol(0.215, 180, 1.60), _pol(0.15, 180, 1.36)],
                0.012, 6, "engine_metal", bend=0.05)
        mb.tube([_pol(0.16, 95, 2.50), _pol(0.27, 100, 2.20), _pol(0.26, 105, 1.96), _pol(0.215, 120, 1.70),
                 _pol(0.16, 125, 1.30), _pol(r_at(0.9) + 0.03, 128, 0.90)], 0.013, 6, "detail_dark", bend=0.06)
        mb.box((0.10, 0.05, 0.14), "detail_dark", center=_pol(0.27, 180, 2.02))

    _finish(ctx, pid, z_piv, dict(cycle="gas generator"))


def _xz_plane():
    """Matrix mapping extrude_poly's (x, y, z) -> (x, z_extrude, y): a plate standing in the XZ plane."""
    from mathutils import Matrix
    return Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))


# --------------------------------------------------------------------------- Kerolox Giant
def gen_giant(ctx):
    """F-1 class: huge tube-wall bell, wrap-around turbine exhaust manifold, nozzle extension."""
    pid = "eng_kerolox_giant"
    e = spec.ENGINES[pid]
    mb = ctx.mesh()
    length, r_exit = e["length"], e["exit_d"] / 2.0
    r_th, bell_len = 0.4625, 3.35
    z_man = 1.30
    s_main = mb.seg(56, 16)
    s_pipe = mb.seg(12, 8)

    r_at = bell_nozzle(mb, z_exit=0.0, length=bell_len, r_throat=r_th, r_exit=r_exit, seg=56, steps=18,
                       wall=0.03, theta_n=36.0, theta_e=12.0, bands=0, z_split=z_man,
                       mat_out_lower="engine_metal", heat_exit=0.25)
    # tube-wall hat bands above the manifold
    _bands(mb, r_at, [1.66, 1.90, 2.13, 2.36, 2.58, 2.80, 3.00, 3.18], 0.034, s_main, "engine_metal")
    # nozzle extension: shingle bands + exit stiffener
    _bands(mb, r_at, [0.36, 0.70, 1.00], 0.026, s_main, "nozzle_hot", heat=0.2)
    mb.torus(r_exit - 0.012, 0.040, 0.045, s_main, _minor(mb), "engine_metal")
    # wrap-around turbine exhaust manifold
    man_r = 0.165
    man_R = r_at(z_man) + man_r * 0.80
    mb.torus(man_R, man_r, z_man + 0.05, s_main, _minor(mb, 8), "engine_metal")
    mb.band(r_at(z_man - 0.14), z_man - 0.16, z_man - 0.10, 0.02, s_main, "engine_metal")
    if mb.want(0):
        with mb.radial(16, phase=TAU / 32):
            mb.box((0.05, 0.10, 0.30), "engine_metal", center=(man_R + man_r * 0.55, 0, z_man + 0.05))
    # throat collar
    mb.torus(r_th + 0.07, 0.055, bell_len - 0.04, s_main, _minor(mb), "engine_metal")

    # ---- chamber, fuel manifold ring, LOX dome
    r_ch = 0.52
    z_ch = chamber(mb, z_throat=bell_len, r_throat=r_th, r_chamber=r_ch, length=0.75, seg=40,
                   mat="nozzle_hot", dome=False, heat=0.9)
    s_head = mb.seg(40, 14)
    mb.torus(r_ch + 0.075, 0.105, z_ch - 0.02, s_head, _minor(mb), "engine_metal")       # fuel inlet manifold
    mb.lathe([(r_ch + 0.02, z_ch + 0.02), (r_ch + 0.10, z_ch + 0.07), (r_ch + 0.10, z_ch + 0.15),
              (r_ch - 0.02, z_ch + 0.17)], s_head, "engine_metal", crease=40.0)            # injector flange
    if mb.want(0):
        mb.bolt_ring(r_ch + 0.05, z_ch + 0.16, 24, 0.022, 0.03)
    dome_z = z_ch + 0.16
    mb.dome(r_ch - 0.03, 0.36, dome_z, s_head, mb.steps(6, 3), "engine_metal", up=True)   # LOX dome
    # gimbal block
    g_h = 1.02
    z_piv = gimbal_mount(mb, z_top=length, d=e["mount_d"], h=g_h, seg=28)
    z_gb = length - g_h
    mb.lathe([(0.34, dome_z + 0.20), (0.36, dome_z + 0.33), (e["mount_d"] / 2 * 0.55, z_gb + 0.01)], s_head,
             "engine_metal", crease=50.0)
    with mb.radial(6, phase=TAU / 12):
        mb.extrude_poly([(0.36, dome_z + 0.22), (0.62, dome_z + 0.10), (0.44, z_gb + 0.16)], -0.03, 0.03,
                        "engine_metal", matrix=_xz_plane())

    # ---- turbopump on the +X side of the chamber, shaft vertical
    px, pr = 1.12, 0.40
    p_z0, p_z1 = 3.10, 4.78
    pump(mb, (px, 0, p_z0), (px, 0, p_z1), pr, ribs=8, seg=24)
    with mb.xform(loc=(px, 0, 0)):
        # second (LOX) volute and the turbine manifold at the bottom
        mb.torus(pr * 1.06, pr * 0.27, p_z0 + (p_z1 - p_z0) * 0.80, mb.seg(24, 10), _minor(mb, 6),
                 "engine_metal")
        mb.torus(pr * 0.86, pr * 0.30, p_z0 + 0.10, mb.seg(24, 10), _minor(mb, 6), "engine_metal")
        if mb.want(0):
            mb.bolt_ring(pr * 1.02, p_z0 + (p_z1 - p_z0) * 0.50, 16, 0.018, 0.03)
    # pump mounts
    for z in (3.62, 4.24):
        for y in (-0.22, 0.22):
            mb.strut((r_ch - 0.02, y * 0.8, z), (px - pr + 0.03, y, z + 0.04), 0.045, seg=8)

    # ---- turbine exhaust: pump -> heat exchanger -> wrap-around manifold
    dr = 0.20
    ex = [(px, 0, p_z0 + 0.06), (px, 0, 2.80), (r_at(2.05) + 0.26, 0, 2.05), (man_R - 0.02, 0, z_man + 0.10)]
    mb.tube(ex, dr, mb.seg(16, 8), "engine_metal", bend=0.50, bend_seg=5)
    # heat exchanger (insulated, fatter section of the duct)
    hx_a = Vector((r_at(2.62) + 0.42, 0, 2.62))
    hx_b = Vector((r_at(2.12) + 0.29, 0, 2.12))
    mb.cyl(hx_a, hx_b, 0.265, mb.seg(18, 8), "thermal", caps=True)
    for k in (0.0, 0.5, 1.0):
        c = hx_a.lerp(hx_b, k)
        u = (hx_b - hx_a).normalized()
        mb.cyl(c - u * 0.03, c + u * 0.03, 0.285, mb.seg(18, 8), "engine_metal", caps=True)
    pipe_flange(mb, (px, 0, 2.93), (0, 0, 1), dr, seg=14, bolts=8)
    if mb.want(0):
        # helium / LOX coils feeding the heat exchanger
        mb.tube([hx_a + Vector((0, 0.27, 0.0)), hx_a + Vector((0.02, 0.42, 0.5)), (px, 0.52, 3.9)], 0.035, 8,
                "engine_metal", bend=0.2)
        mb.tube([hx_b + Vector((0, -0.27, 0.0)), hx_a + Vector((0.02, -0.44, 0.4)), (px, -0.52, 3.8)], 0.035,
                8, "engine_metal", bend=0.2)

    # ---- two high-pressure fuel ducts: fuel volute -> fuel manifold ring, one each side
    for sy in (1.0, -1.0):
        z_v = p_z0 + (p_z1 - p_z0) * 0.34
        mb.tube([(px, sy * 0.36, z_v), (px - 0.12, sy * 0.66, z_v + 0.06), (0.42, sy * 0.80, z_ch - 0.10),
                 (0.02, sy * 0.60, z_ch - 0.02)], 0.115, s_pipe, "engine_metal", bend=0.34, bend_seg=5)
        pipe_flange(mb, (0.36, sy * 0.795, z_ch - 0.095), (1, sy * 0.05, 0.1), 0.115, seg=12, bolts=6)
        # two LOX ducts: LOX volute -> LOX dome
        z_l = p_z0 + (p_z1 - p_z0) * 0.80
        mb.tube([(px, sy * 0.36, z_l), (px - 0.25, sy * 0.60, z_l + 0.10), (0.36, sy * 0.52, dome_z + 0.30),
                 (0.10, sy * 0.24, dome_z + 0.20)], 0.12, s_pipe, "engine_metal", bend=0.32, bend_seg=5)
        pipe_flange(mb, (px - 0.20, sy * 0.565, z_l + 0.083), (1, -sy * 0.9, -0.35), 0.12, seg=12, bolts=6)
        # fuel inlet: side of the pump, elbow up to the vehicle
        z_i = p_z0 + (p_z1 - p_z0) * 0.60
        mb.tube([(px + 0.05, sy * 0.30, z_i), (px + 0.05, sy * 0.76, z_i), (px + 0.05, sy * 0.76, 5.0)], 0.15,
                s_pipe, "engine_metal", bend=0.30, bend_seg=5)
        _inlet(mb, px + 0.05, sy * 0.76, 4.96, length - 0.08, 0.15)

    # ---- LOX inlet: axial, on top of the pump
    with mb.xform(loc=(px, 0, 0)):
        mb.lathe([(pr * 0.55, p_z1 - 0.02), (0.235, p_z1 + 0.16)], mb.seg(20, 8), "engine_metal")
    _inlet(mb, px, 0.0, p_z1 + 0.14, length - 0.08, 0.235, bellows=4)

    # ---- gimbal outriggers and two actuators on the side away from the pump
    for a_deg in (135.0, 225.0):
        tip = _pol(1.10, a_deg, 3.86)
        mb.strut(_pol(r_ch - 0.03, a_deg - 20, 3.62), tip, 0.055, seg=8)
        mb.strut(_pol(r_ch - 0.03, a_deg + 20, 3.62), tip, 0.055, seg=8)
        mb.strut(_pol(r_ch - 0.03, a_deg, 4.05), tip, 0.045, seg=8)
        mb.sphere(tip, 0.10, mb.seg(10, 6), 4, "engine_metal")
        top = _pol(1.30, a_deg, length - 0.20)
        actuator(mb, tip, top, 0.085, seg=10)
        if mb.want(0):
            _lug(mb, top, 0.17)

    # ---- interface panel, harness and drain lines on the -X side
    panel_c = _pol(0.86, 180, 4.82)
    mb.box((0.07, 0.74, 0.46), "engine_metal", center=panel_c)
    mb.strut((-0.40, 0.22, 4.72), (-0.83, 0.26, 4.80), 0.03, seg=6)
    mb.strut((-0.40, -0.22, 4.72), (-0.83, -0.26, 4.80), 0.03, seg=6)
    if mb.want(0):
        for i in range(5):
            y = -0.28 + 0.14 * i
            mb.cyl((-0.90, y, 4.96), (-0.93, y, 4.96), 0.04, 8, "detail_dark", caps=True)
        for i, a_deg in enumerate((168, 180, 192)):
            mb.tube([(-0.86, -0.20 + 0.2 * i, 4.60), _pol(r_ch + 0.14, a_deg, 4.20), _pol(r_ch + 0.06, a_deg, 3.60),
                     _pol(r_at(3.0) + 0.09, a_deg, 3.0), _pol(r_at(2.0) + 0.07, a_deg, 2.0),
                     _pol(man_R + 0.02, a_deg, z_man + 0.24)], 0.028, 6,
                    "detail_dark" if i == 1 else "engine_metal", bend=0.15)
        # thermal insulation boots at the throat
        mb.lathe([(r_th + 0.04, bell_len - 0.30), (r_th + 0.075, bell_len - 0.16), (r_th + 0.06, bell_len + 0.10)],
                 s_main, "thermal", crease=60.0)

    _finish(ctx, pid, z_piv, dict(cycle="gas generator",
                                  exhaust_manifold_z_m=z_man))


# --------------------------------------------------------------------------- Kerolox Staged-Combustion
def gen_staged(ctx):
    """RD-180 class: two gimballed chambers fed by one central turbopump / preburner."""
    pid = "eng_kerolox_staged_combustion"
    e = spec.ENGINES[pid]
    mb = ctx.mesh()
    length, r_exit = e["length"], e["exit_d"] / 2.0
    cx = e["nozzle_spacing"] / 2.0
    r_th, bell_len = 0.12, 2.0
    r_ch = 0.19
    s_pipe = mb.seg(10, 6)
    z_gt = 3.36            # top face of the two chamber gimbals = underside of the thrust beam
    g_h = 0.44
    z_man = 0.42
    holder = {}

    # ---- one chamber assembly built on the axis, moved to +X and mirrored to -X
    with mb.mirror("X"):
        with mb.xform(loc=(cx, 0.0, 0.0)):
            r_at = bell_nozzle(mb, z_exit=0.0, length=bell_len, r_throat=r_th, r_exit=r_exit, seg=44,
                               steps=16, wall=0.014, theta_n=33.0, theta_e=7.0, bands=0)
            holder["r_at"] = r_at
            s_main = mb.seg(44, 12)
            _bands(mb, r_at, [bell_len * k for k in (0.34, 0.48, 0.62, 0.76, 0.90)], 0.014, s_main,
                   "engine_metal")
            mb.torus(r_at(z_man) + 0.030, 0.038, z_man, s_main, _minor(mb), "engine_metal")   # regen manifold
            mb.torus(r_exit - 0.004, 0.018, 0.022, s_main, _minor(mb, 6), "engine_metal")       # exit ring
            mb.torus(r_th + 0.032, 0.026, bell_len - 0.02, mb.seg(28, 10), _minor(mb, 6), "engine_metal")
            z_ch = chamber(mb, z_throat=bell_len, r_throat=r_th, r_chamber=r_ch, length=0.50, seg=28,
                           mat="nozzle_hot", heat=0.95)
            holder["z_ch"] = z_ch
            # mixing head (hot oxidiser-rich gas enters from the inboard side)
            s_head = mb.seg(28, 10)
            mb.lathe([(r_ch, 2.47), (0.235, 2.52), (0.235, 2.74), (0.18, 2.85), (0.125, 2.90),
                      (0.121, z_gt - g_h + 0.01)], s_head, "engine_metal", crease=35.0)
            if mb.want(0):
                mb.bolt_ring(0.213, 2.74, 12, 0.011, 0.014)
            # flex boot under the gimbal
            mb.lathe([(0.135, 2.885), (0.165, 2.915), (0.135, 2.945)], s_head, "thermal", crease=80.0)
            gimbal_mount(mb, z_top=z_gt, d=0.44, h=g_h, seg=18)
        # hot-gas duct: pump -> mixing head, arching over the gap
        hot = [(0.15, 0, 2.47), (0.405, 0, 2.47), (0.405, 0, 2.79), (cx - 0.20, 0, 2.79)]
        mb.tube(hot, 0.105, mb.seg(12, 8), "engine_metal", bend=0.17, bend_seg=5)
        pipe_flange(mb, (cx - 0.255, 0, 2.79), (1, 0, 0), 0.105, seg=12, bolts=6)
        pipe_flange(mb, (0.30, 0, 2.47), (1, 0, 0), 0.105, seg=12, bolts=6)
        # high-pressure fuel line: pump -> regen manifold of this nozzle
        az = -122.0
        r_at = holder["r_at"]
        fuel = [(0.20, -0.14, 2.12), (0.40, -0.36, 1.98), _pol(r_at(1.35) + 0.075, az, 1.35, cx),
                _pol(r_at(0.85) + 0.07, az, 0.85, cx), _pol(r_at(z_man) + 0.04, az, z_man + 0.03, cx)]
        mb.tube(fuel, 0.050, s_pipe, "engine_metal", bend=0.16, bend_seg=5)
        mb.cyl(_pol(r_at(1.25) + 0.075, az, 1.25, cx), _pol(r_at(1.05) + 0.072, az, 1.05, cx), 0.072,
               mb.seg(12, 6), "engine_metal")
        # two gimbal actuators per chamber (pitch outboard, yaw on +Y) hung from frame outriggers
        lug_x = (cx + 0.245, 0.0, 2.22)
        top_x = (1.43, 0.0, 3.30)
        mb.strut((cx + 0.15, 0.0, 2.16), lug_x, 0.03, seg=6)
        mb.strut((cx + 0.15, 0.0, 2.34), lug_x, 0.024, seg=6)
        actuator(mb, lug_x, top_x, 0.045)
        mb.strut((0.93, 0.0, 3.44), top_x, 0.035, seg=6)
        mb.strut((0.93, 0.0, 3.12), top_x, 0.028, seg=6)
        lug_y = (cx, 0.245, 2.22)
        top_y = (cx, 0.62, 3.30)
        mb.strut((cx, 0.15, 2.16), lug_y, 0.03, seg=6)
        mb.strut((cx, 0.15, 2.34), lug_y, 0.024, seg=6)
        actuator(mb, lug_y, top_y, 0.045)
        mb.strut((cx, 0.14, 3.44), top_y, 0.035, seg=6)
        mb.strut((cx, 0.20, 3.10), top_y, 0.028, seg=6)
        # frame braces: mount ring -> chamber gimbals
        for sy in (1.0, -1.0):
            mb.strut((0.10, sy * 0.70, 3.52), (cx - 0.05, sy * 0.13, 3.40), 0.035, seg=6)
        if mb.want(0):
            # chamber sensor harness
            mb.tube([(cx - 0.10, 0.16, 3.36), (cx - 0.20, 0.20, 2.95), (cx - 0.12, 0.215, 2.60),
                     (cx - 0.10, 0.18, 2.20), _pol(r_at(1.5) + 0.03, 120, 1.5, cx)], 0.013, 6, "detail_dark",
                    bend=0.06)

    # ---- shared thrust frame: beam across the two gimbals + mount ring (top face = attach plane)
    mb.box((2 * cx + 0.30, 0.30, 0.14), "engine_metal", center=(0, 0, z_gt + 0.07))
    mb.box((0.26, 1.40, 0.12), "engine_metal", center=(0, 0, z_gt + 0.08))
    s_ring = mb.seg(40, 14)
    r_m = e["mount_d"] / 2.0
    mb.lathe([(r_m - 0.16, z_gt + 0.14), (r_m, z_gt + 0.14), (r_m, length), (r_m - 0.16, length)], s_ring,
             "engine_metal", closed=True)
    mb.lathe([(0.0, z_gt + 0.17), (r_m - 0.15, z_gt + 0.17)], s_ring, "engine_metal", flip=True)
    mb.lathe([(r_m - 0.15, length - 0.03), (0.0, length - 0.03)], s_ring, "engine_metal")
    if mb.want(0):
        mb.bolt_ring(r_m - 0.08, z_gt + 0.14, 16, 0.016, -0.02)

    # ---- central turbopump (shaft vertical) with the preburner on top
    pr = 0.26
    p_z0, p_z1 = 1.92, 2.98
    pump(mb, (0, 0, p_z0), (0, 0, p_z1), pr, ribs=8, seg=24)
    mb.torus(pr * 1.05, pr * 0.24, p_z0 + (p_z1 - p_z0) * 0.14, mb.seg(24, 10), _minor(mb, 6), "engine_metal")
    mb.sphere((0, 0, 3.12), 0.20, mb.seg(20, 8), mb.steps(8, 4), "engine_metal", scale=(1, 1, 0.9))
    mb.band(0.195, 3.10, 3.14, 0.02, mb.seg(20, 8), "engine_metal")
    mb.cyl((0, 0, 3.28), (0, 0, z_gt + 0.01), 0.07, mb.seg(12, 6), "engine_metal", caps=False)
    # pump hangs from the beam
    for sx in (1.0, -1.0):
        for sy in (1.0, -1.0):
            mb.strut((sx * 0.20, sy * 0.13, z_gt + 0.02), (sx * 0.17, sy * 0.17, 2.90), 0.022, seg=6)
    # turbine exhaust collector under the pump (staged combustion: no dump, feeds the hot-gas ducts)
    mb.lathe([(0.0, p_z0 - 0.16), (0.10, p_z0 - 0.16), (0.17, p_z0 - 0.06), (pr * 0.55, p_z0 + 0.01)],
             mb.seg(20, 8), "engine_metal", crease=40.0)

    # ---- boost pumps / propellant inlets on +Y (LOX) and -Y (fuel), outside the mount ring
    for sy, r_in, z_in in ((1.0, 0.150, 2.30), (-1.0, 0.125, 2.12)):
        y = sy * 1.0
        pump(mb, (0, y, 2.86), (0, y, 3.32), r_in, ribs=0, seg=18)
        _inlet(mb, 0.0, y, 3.30, length - 0.02, r_in * 0.86, bellows=2)
        mb.tube([(0, y, 2.90), (0, y, 2.58), (0, sy * 0.52, z_in), (0, sy * 0.20, z_in)], r_in * 0.80, s_pipe,
                "engine_metal", bend=0.22, bend_seg=5)
        mb.strut((0, sy * 0.72, z_gt + 0.10), (0, y - sy * r_in * 0.6, 3.22), 0.03, seg=6)
        pipe_flange(mb, (0, sy * 0.40, z_in), (0, 1, 0), r_in * 0.80, seg=10, bolts=6)
    # LOX line pump -> preburner
    mb.tube([(0.16, 0.16, 2.72), (0.30, 0.30, 2.86), (0.26, 0.26, 3.10), (0.10, 0.10, 3.14)], 0.055, s_pipe,
            "engine_metal", bend=0.10)
    if mb.want(0):
        # start-fluid ampoules + control box on the pump
        mb.cyl((-0.20, 0.24, 2.30), (-0.20, 0.24, 2.62), 0.045, 8, "engine_metal")
        mb.cyl((-0.30, 0.13, 2.30), (-0.30, 0.13, 2.62), 0.045, 8, "engine_metal")
        mb.box((0.20, 0.07, 0.26), "detail_dark", center=(0.0, -0.285, 2.62))
        mb.tube([(0.0, -0.30, 2.75), (0.05, -0.34, 3.10), (0.05, -0.20, 3.38)], 0.014, 6, "detail_dark",
                bend=0.06)

    z_piv = z_gt - g_h * 0.55
    ctx.empty("nozzle_exit_1", (cx, 0.0, 0.0))
    ctx.empty("nozzle_exit_2", (-cx, 0.0, 0.0))
    ctx.empty("gimbal_pivot_1", (cx, 0.0, round(z_piv, 4)))
    ctx.empty("gimbal_pivot_2", (-cx, 0.0, round(z_piv, 4)))
    _finish(ctx, pid, z_piv, dict(cycle="oxidiser-rich staged combustion", nozzles=2,
                                  nozzle_spacing_m=e["nozzle_spacing"]))


register("eng_kerolox_workhorse", "engine_s1", gen_workhorse, "7.7")
register("eng_kerolox_giant", "engine_s1", gen_giant, "7.7")
register("eng_kerolox_staged_combustion", "engine_s1", gen_staged, "7.7")
