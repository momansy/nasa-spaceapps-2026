"""Upper-stage engines (GAME_DESIGN.md 7.8).

All five follow the engine layout of engine_common: nozzle exit plane at z = 0, mount
face at z = length (attach_top). Dimensions come from spec.ENGINES and are
real_world_approximate (rounded from the real hardware class named as the twin).
Vacuum bells are much larger relative to their chambers than the sea-level engines.
"""
from __future__ import annotations

import math

from . import spec
from .core import bell_profile
from .engine_common import actuator, bell_nozzle, chamber, gimbal_mount, pipe_flange, pump
from .pipeline import register

FAMILY = "engine_s2"
DESIGN_REF = "7.8"


# --------------------------------------------------------------------------- helpers
def _pol(r, ang, z):
    """Cylindrical -> cartesian."""
    return (r * math.cos(ang), r * math.sin(ang), z)


def _hoop(mb, r_at, z, size, seg, mat="engine_metal", heat=0.0):
    """Stiffening hoop hugging the bell at height z."""
    mb.torus(r_at(z) + size * 0.35, size, z, mb.seg(seg, 12), 6 if mb.lod == 0 else 4, mat, heat=heat)


def _chamber_len(z_throat, z_target, r_ch, dome=True):
    """Chamber length so that engine_common.chamber() ends exactly at z_target."""
    return z_target - z_throat - (r_ch * 0.55 if dome else 0.0)


def _bell_run(r_at, ang, zs, off):
    """Polyline hugging the bell at angle `ang`, `off` metres outside the wall."""
    return [_pol(r_at(z) + off, ang, z) for z in zs]


def _split_height(r_throat, r_exit, length, theta_n, theta_e, r_target):
    """Height above the exit plane where the bell's outer radius equals r_target."""
    prof = bell_profile(r_throat, r_exit, length, 240, theta_n=theta_n, theta_e=theta_e)
    for r, z in prof:               # exit first, radius shrinking upward
        if r <= r_target:
            return z
    return length * 0.8


def _actuators(mb, length, angs, *, z_eng, r_surf, r_eng, r_frame, r_act):
    """Two gimbal actuators from a lug on the engine up to clevis pads on the mount plane."""
    for a in angs:
        actuator(mb, _pol(r_eng, a, z_eng), _pol(r_frame, a, length - r_act * 2.4), r_act)
        with mb.xform(rot_z=a):
            lug = max(0.02, r_eng - r_surf) + r_act
            mb.box((lug, r_act * 1.3, r_act * 1.7), "engine_metal",
                   center=((r_eng + r_surf) / 2.0, 0.0, z_eng))
            mb.box((r_act * 3.2, r_act * 3.6, r_act * 1.5), "engine_metal",
                   center=(r_frame, 0.0, length - r_act * 0.75))


def _inlet(mb, path, r, seg=12):
    """Propellant inlet duct ending in an upward-facing bolted flange."""
    mb.tube(path, r, mb.seg(seg, 8), "engine_metal", bend=r * 2.2)
    end = path[-1]
    prev = path[-2]
    axis = (end[0] - prev[0], end[1] - prev[1], end[2] - prev[2])
    pipe_flange(mb, end, axis, r, bolts=8)


def _finish(ctx, pid, z_pivot):
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


# --------------------------------------------------------------------------- 1. RL10 class
def gen_hydrolox_vacuum(ctx):
    """Expander-cycle hydrolox engine: tube-wall bell, carbon extension, geared turbopump."""
    pid = "eng_hydrolox_vacuum"
    mb = ctx.mesh()
    e = spec.ENGINES[pid]
    length, r_exit = e["length"], e["exit_d"] / 2.0
    gim_h = 0.22
    r_th, r_ch = 0.07, 0.125
    z_th = 1.50
    z_split = 0.72                       # regen tube-wall above, carbon-composite extension below

    r_at = bell_nozzle(mb, z_exit=0.0, length=z_th, r_throat=r_th, r_exit=r_exit, seg=64, steps=20,
                       wall=0.010, theta_n=40.0, theta_e=9.0, mat_out="nozzle_hot",
                       z_split=z_split, mat_out_lower="detail_dark", heat_exit=0.25, lip_mat="detail_dark")
    # fine hat-bands of the brazed tube wall
    n_bands = 10
    for i in range(n_bands):
        if mb.lod > 0 and i % 2:
            continue
        z = z_split + 0.10 + (z_th - 0.14 - z_split - 0.10) * i / (n_bands - 1)
        _hoop(mb, r_at, z, 0.0075, 64, heat=0.2)
    # extension joint + fuel inlet manifold, and two rings on the extension
    _hoop(mb, r_at, z_split, 0.016, 64)
    r_man = r_at(z_split + 0.06) + 0.034
    mb.torus(r_man, 0.030, z_split + 0.06, mb.seg(64, 16), 8 if mb.lod == 0 else 4, "engine_metal")
    if mb.want(0):
        mb.bolt_ring(r_at(z_split) + 0.012, z_split - 0.018, 48, 0.006, -0.01)
    _hoop(mb, r_at, 0.36, 0.011, 64, "detail_dark")
    _hoop(mb, r_at, 0.05, 0.012, 64, "detail_dark")

    z_inj = length - gim_h
    chamber(mb, z_throat=z_th, r_throat=r_th, r_chamber=r_ch, length=_chamber_len(z_th, z_inj, r_ch),
            seg=32, heat=0.45)
    # coolant outlet manifold at the head of the chamber
    mb.torus(r_ch + 0.018, 0.022, z_inj - 0.16, mb.seg(32, 12), 6 if mb.lod == 0 else 4, "engine_metal")
    z_piv = gimbal_mount(mb, z_top=length, d=e["mount_d"], h=gim_h)

    # turbopump package on the +X side: fuel pump/turbine, gearbox, LOX pump
    fx, lx, ly = 0.34, 0.215, 0.30
    pump(mb, (fx, 0.0, 1.50), (fx, 0.0, 1.92), 0.10, ribs=6)
    pump(mb, (lx, ly, 1.50), (lx, ly, 1.80), 0.075, volute=True, seg=14)
    ang = math.atan2(ly, lx - fx)
    dist = math.hypot(lx - fx, ly)
    with mb.xform(loc=((fx + lx) / 2.0, ly / 2.0, 1.60), rot_z=ang):
        mb.box((dist + 0.06, 0.13, 0.11), "engine_metal")
        mb.cyl((0.0, 0.0, 0.05), (0.0, 0.0, 0.085), 0.055, mb.seg(12, 8), "engine_metal")   # drive housing cover
        if mb.want(0):
            mb.bolt_ring(0.043, 0.085, 8, 0.006, 0.006)
            mb.box((dist * 0.5, 0.15, 0.03), "detail_dark", center=(0.0, 0.0, -0.065))
    # propellant inlets rising to the stage (flanges just under the mount plane)
    _inlet(mb, [(fx, 0.0, 1.90), (fx, 0.0, 2.02), (fx + 0.05, -0.04, 2.10)], 0.042)
    _inlet(mb, [(lx, ly, 1.78), (lx, ly, 2.00), (lx + 0.02, ly + 0.03, 2.10)], 0.036)
    # fuel discharge down to the nozzle inlet manifold
    mb.tube([(fx + 0.10, 0.0, 1.62), (fx + 0.16, 0.0, 1.45)] + _bell_run(r_at, 0.0, [1.18, 0.98, 0.84], 0.07)
            + [_pol(r_man, 0.0, z_split + 0.07)], 0.028, mb.seg(10, 6), "engine_metal", bend=0.09)
    # warm coolant from the chamber jacket to the turbine
    mb.tube([_pol(r_ch + 0.02, math.radians(-50), z_inj - 0.16), (0.21, -0.20, z_inj - 0.13),
             (fx - 0.01, -0.095, 1.86)], 0.026, mb.seg(10, 6), "engine_metal", bend=0.08)
    # turbine discharge to the injector
    mb.tube([(fx - 0.09, 0.03, 1.74), (0.17, 0.06, 1.80), (0.08, 0.03, z_inj - 0.035)], 0.03,
            mb.seg(10, 6), "engine_metal", bend=0.07)
    # LOX from pump to injector dome
    mb.tube([(lx - 0.05, ly - 0.05, 1.70), (0.10, 0.17, 1.84), (0.035, 0.07, z_inj - 0.03)], 0.026,
            mb.seg(10, 6), "engine_metal", bend=0.07)
    if mb.want(0):
        # cool-down / bleed lines and valve bodies (slim plumbing)
        mb.tube(_bell_run(r_at, math.radians(150), [z_split + 0.07, 0.95, 1.15, 1.32], 0.03)
                + [_pol(r_ch + 0.04, math.radians(150), z_th + 0.12)], 0.011, 6, "engine_metal", bend=0.05)
        mb.tube(_bell_run(r_at, math.radians(215), [z_split + 0.07, 1.0, 1.25], 0.03)
                + [_pol(r_ch + 0.05, math.radians(215), z_th + 0.2)], 0.009, 6, "engine_metal", bend=0.05)
        with mb.xform(rot_z=math.radians(150)):
            mb.box((0.07, 0.06, 0.09), "engine_metal", center=(r_ch + 0.05, 0.0, z_th + 0.16))
        with mb.xform(rot_z=math.radians(215)):
            mb.box((0.06, 0.07, 0.07), "detail_dark", center=(r_ch + 0.055, 0.0, z_th + 0.24))
            mb.cyl((r_ch + 0.055, 0.0, z_th + 0.275), (r_ch + 0.055, 0.0, z_th + 0.33), 0.02, 8, "engine_metal")
        # igniter on the injector dome
        mb.cyl((-0.06, -0.05, z_inj - 0.07), (-0.13, -0.11, z_inj + 0.0), 0.016, 8, "engine_metal")

    # structural ring below the throat carrying the actuator lugs
    z_lug = 1.28
    _hoop(mb, r_at, z_lug, 0.014, 64)
    _actuators(mb, length, [math.radians(180), math.radians(270)], z_eng=z_lug, r_surf=r_at(z_lug),
               r_eng=r_at(z_lug) + 0.07, r_frame=0.47, r_act=0.026)
    _finish(ctx, pid, z_piv)


# --------------------------------------------------------------------------- 2. Merlin Vacuum class
def gen_kerolox_vacuum(ctx):
    """Gas-generator kerolox engine with a huge, thin, radiatively cooled nozzle extension."""
    pid = "eng_kerolox_vacuum"
    mb = ctx.mesh()
    e = spec.ENGINES[pid]
    length, r_exit = e["length"], e["exit_d"] / 2.0
    gim_h = 0.28
    r_th, r_ch = 0.117, 0.20
    z_th = 2.90
    th_n, th_e = 38.0, 10.0
    z_split = _split_height(r_th, r_exit, z_th, th_n, th_e, 0.50)   # extension starts at ~1 m diameter

    r_at = bell_nozzle(mb, z_exit=0.0, length=z_th, r_throat=r_th, r_exit=r_exit, seg=72, steps=22,
                       wall=0.008, theta_n=th_n, theta_e=th_e, mat_out="engine_metal",
                       z_split=z_split, mat_out_lower="nozzle_hot", heat_exit=0.45, lip_mat="nozzle_hot")
    # stiffener rings on the thin extension
    _hoop(mb, r_at, 0.07, 0.016, 72, "nozzle_hot", heat=0.3)
    _hoop(mb, r_at, 0.80, 0.012, 72, "nozzle_hot", heat=0.4)
    _hoop(mb, r_at, 1.55, 0.012, 72, "nozzle_hot", heat=0.5)
    # joint flange + turbine-exhaust manifold ring where the extension begins
    mb.band(r_at(z_split) - 0.004, z_split - 0.02, z_split + 0.025, 0.03, mb.seg(72, 16), "engine_metal")
    if mb.want(0):
        mb.bolt_ring(r_at(z_split) + 0.014, z_split + 0.025, 40, 0.007, 0.01)
    z_man = z_split + 0.11
    r_man = r_at(z_man) + 0.062
    mb.torus(r_man, 0.055, z_man, mb.seg(64, 16), 8 if mb.lod == 0 else 4, "engine_metal")
    # regen jacket bands between manifold and throat
    for z in (z_man + 0.16, z_th - 0.16):
        _hoop(mb, r_at, z, 0.010, 48)

    z_inj = length - gim_h
    chamber(mb, z_throat=z_th, r_throat=r_th, r_chamber=r_ch, length=_chamber_len(z_th, z_inj, r_ch),
            seg=36, heat=0.5)
    # fuel inlet manifold around the lower chamber
    z_fm = z_th + 0.16
    mb.torus(r_ch + 0.03, 0.032, z_fm, mb.seg(36, 12), 6 if mb.lod == 0 else 4, "engine_metal")
    z_piv = gimbal_mount(mb, z_top=length, d=e["mount_d"], h=gim_h)

    # turbopump on the +X side (single shaft: turbine, LOX pump, fuel pump)
    px, pr = 0.45, 0.15
    pump(mb, (px, 0.0, 2.78), (px, 0.0, 3.50), pr, ribs=8)
    # mounting struts pump -> chamber
    for z in (2.98, 3.36):
        mb.strut((px - pr * 0.8, 0.07, z), (r_ch * 0.9, 0.05, z + 0.03), 0.014)
        mb.strut((px - pr * 0.8, -0.07, z), (r_ch * 0.9, -0.05, z + 0.03), 0.014)
    # turbine exhaust duct into the manifold ring
    mb.tube([(px + 0.03, 0.0, 2.80), (px + 0.07, 0.0, 2.62), (r_man + 0.01, 0.0, z_man + 0.03)], 0.055,
            mb.seg(12, 8), "engine_metal", bend=0.14)
    # gas generator and its hot-gas duct to the turbine
    gx, gy = 0.33, 0.27
    mb.cyl((gx, gy, 3.02), (gx, gy, 3.26), 0.06, mb.seg(12, 8), "engine_metal")
    mb.sphere((gx, gy, 3.26), 0.06, mb.seg(12, 8), 4, "engine_metal", lat0=0.0)
    mb.tube([(gx, gy, 3.03), (gx + 0.03, gy - 0.02, 2.90), (px + 0.02, pr * 0.6, 2.86)], 0.035,
            mb.seg(10, 6), "engine_metal", bend=0.07)
    # LOX discharge from the pump head into the injector dome
    mb.tube([(px, 0.0, 3.46), (px, 0.0, 3.62), (0.26, 0.0, 3.675), (0.10, 0.0, z_inj - 0.02)], 0.045,
            mb.seg(12, 8), "engine_metal", bend=0.10)
    # high-pressure fuel to the chamber manifold
    mb.tube([(px - pr * 0.75, -0.11, 3.03), (0.27, -0.17, z_fm + 0.02), _pol(r_ch + 0.03, math.radians(-40), z_fm)],
            0.034, mb.seg(10, 6), "engine_metal", bend=0.08)
    # propellant inlets
    _inlet(mb, [(px, -pr * 0.9, 3.00), (px, -0.36, 3.00), (px, -0.36, 3.74)], 0.05)
    _inlet(mb, [(px, pr * 0.9, 3.34), (px, 0.37, 3.34), (px, 0.37, 3.74)], 0.05)
    if mb.want(0):
        # igniter fluid line, pressurant bottle and harness box on the far side
        mb.tube([_pol(r_ch + 0.02, math.radians(160), z_inj - 0.12), _pol(0.30, math.radians(165), z_inj - 0.2),
                 _pol(0.30, math.radians(165), z_th + 0.05)] + _bell_run(r_at, math.radians(165), [2.7, z_man + 0.1], 0.04),
                0.012, 6, "engine_metal", bend=0.05)
        mb.sphere(_pol(0.33, math.radians(125), 3.20), 0.075, 12, 6, "detail_dark")
        mb.strut(_pol(0.33, math.radians(125), 3.20), _pol(r_ch, math.radians(125), 3.20), 0.012)
        with mb.xform(rot_z=math.radians(200)):
            mb.box((0.07, 0.16, 0.13), "detail_dark", center=(r_ch + 0.06, 0.0, 3.30))
        mb.tube([_pol(r_ch + 0.07, math.radians(200), 3.24), _pol(0.30, math.radians(205), 3.05),
                 _pol(r_at(2.6) + 0.03, math.radians(205), 2.6)], 0.009, 6, "detail_dark", bend=0.04)

    # actuator ring on the regen section
    z_lug = z_man + 0.30
    _hoop(mb, r_at, z_lug, 0.016, 48)
    _actuators(mb, length, [math.radians(180), math.radians(270)], z_eng=z_lug, r_surf=r_at(z_lug),
               r_eng=r_at(z_lug) + 0.10, r_frame=0.66, r_act=0.04)
    _finish(ctx, pid, z_piv)


# --------------------------------------------------------------------------- 3. Raptor Vacuum class
def gen_methalox_vacuum(ctx):
    """Full-flow methalox vacuum engine: twin-preburner powerhead on a long regen bell."""
    pid = "eng_methalox_vacuum"
    mb = ctx.mesh()
    e = spec.ENGINES[pid]
    length, r_exit = e["length"], e["exit_d"] / 2.0
    gim_h = 0.36
    r_th, r_ch = 0.14, 0.26
    z_th = 3.30
    z_ch_top = 3.86                       # chamber head; the oxygen turbopump stacks on top
    z_ox_top = length - gim_h

    r_at = bell_nozzle(mb, z_exit=0.0, length=z_th, r_throat=r_th, r_exit=r_exit, seg=72, steps=24,
                       wall=0.014, theta_n=34.0, theta_e=7.0, mat_out="nozzle_hot", heat_exit=0.35)
    # big stiffening ring near the exit + a slim lip ring
    z_ring = 0.26
    r_ring = r_at(z_ring)
    mb.lathe([(r_ring - 0.004, z_ring - 0.045), (r_ring + 0.030, z_ring - 0.03), (r_ring + 0.030, z_ring + 0.03),
              (r_ring - 0.01, z_ring + 0.045)], mb.seg(72, 16), "engine_metal", crease=25.0)
    _hoop(mb, r_at, 0.08, 0.014, 72)
    # light support bands
    for z in (0.95, 1.60):
        _hoop(mb, r_at, z, 0.011, 72, heat=0.15)
    # regen coolant inlet manifold
    z_man = 2.30
    r_man = r_at(z_man) + 0.055
    mb.torus(r_man, 0.05, z_man, mb.seg(64, 16), 8 if mb.lod == 0 else 4, "engine_metal")
    _hoop(mb, r_at, 2.85, 0.012, 48)

    chamber(mb, z_throat=z_th, r_throat=r_th, r_chamber=r_ch, length=z_ch_top - z_th, seg=40,
            dome=False, heat=0.5)
    # hot-gas manifold wrapped around the chamber head
    mb.torus(r_ch + 0.035, 0.075, z_ch_top - 0.09, mb.seg(40, 12), 8 if mb.lod == 0 else 6, "engine_metal")
    # oxygen-rich turbopump / preburner, coaxial with the chamber
    pump(mb, (0.0, 0.0, z_ch_top - 0.03), (0.0, 0.0, z_ox_top + 0.02), 0.215, seg=28, ribs=0)
    z_piv = gimbal_mount(mb, z_top=length, d=e["mount_d"], h=gim_h, seg=28)

    # fuel-rich turbopump / preburner on the +X side
    fx, fr = 0.54, 0.17
    pump(mb, (fx, 0.0, 3.42), (fx, 0.0, 4.20), fr, seg=24, ribs=0)
    mb.cyl((fx - fr * 0.6, 0.0, 3.80), (r_ch + 0.03, 0.0, 3.78), 0.085, mb.seg(16, 8), "engine_metal",
           caps=False)                                                    # fuel-rich hot-gas duct
    pipe_flange(mb, ((fx - fr + r_ch + 0.09) / 2.0, 0.0, 3.79), (1, 0, 0), 0.085, bolts=10)
    # thick methane line from the pump down to the regen manifold
    mb.tube([(fx + 0.02, 0.0, 3.46), (fx + 0.03, 0.0, 3.18)] + _bell_run(r_at, 0.0, [2.86, 2.55], 0.11)
            + [(r_man + 0.01, 0.0, z_man + 0.02)], 0.065, mb.seg(14, 8), "engine_metal", bend=0.18)
    # warmed methane return on the far side, up to the chamber head
    mb.tube([_pol(r_man, math.pi, z_man + 0.02)] + _bell_run(r_at, math.pi, [2.62, 2.95, 3.22], 0.09)
            + [_pol(r_ch + 0.10, math.pi, 3.52), _pol(r_ch + 0.06, math.pi, z_ch_top - 0.10)], 0.05,
            mb.seg(12, 8), "engine_metal", bend=0.14)
    # propellant inlets (LOX on -X into the coaxial pump, methane beside the fuel pump)
    _inlet(mb, [(-0.20, 0.0, 4.12), (-0.47, 0.0, 4.12), (-0.47, 0.0, 4.52)], 0.08, seg=14)
    _inlet(mb, [(fx, fr * 0.85, 3.62), (fx, 0.37, 3.62), (fx, 0.37, 4.52)], 0.065, seg=14)
    # pump support struts
    for z in (3.50, 4.10):
        mb.strut((fx - fr * 0.7, 0.10, z), (0.20, 0.09, z + 0.05), 0.018)
        mb.strut((fx - fr * 0.7, -0.10, z), (0.20, -0.09, z + 0.05), 0.018)
    if mb.want(0):
        # igniter torch, controller box and a harness along the bell
        mb.cyl(_pol(r_ch + 0.02, math.radians(60), z_ch_top - 0.30), _pol(r_ch + 0.16, math.radians(60), z_ch_top - 0.20),
               0.028, 8, "engine_metal")
        with mb.xform(rot_z=math.radians(300)):
            mb.box((0.09, 0.24, 0.20), "detail_dark", center=(r_ch + 0.07, 0.0, 3.60))
        mb.tube([_pol(r_ch + 0.08, math.radians(300), 3.50), _pol(r_at(3.1) + 0.07, math.radians(300), 3.1)]
                + _bell_run(r_at, math.radians(300), [2.8, z_man + 0.08], 0.03), 0.012, 6, "detail_dark", bend=0.05)
        mb.bolt_ring(r_ring + 0.03, z_ring, 36, 0.009, 0.008, axis="R")

    z_lug = 2.95
    _actuators(mb, length, [math.radians(135), math.radians(225)], z_eng=z_lug, r_surf=r_at(z_lug),
               r_eng=r_at(z_lug) + 0.10, r_frame=0.74, r_act=0.045)
    _finish(ctx, pid, z_piv)


# --------------------------------------------------------------------------- 4. AJ10-137 class
def gen_hypergolic_storable(ctx):
    """Pressure-fed hypergolic engine: no pumps, ablative chamber, big radiative skirt."""
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

    r_at = bell_nozzle(mb, z_exit=0.0, length=z_th, r_throat=r_th, r_exit=r_exit, seg=72, steps=22,
                       wall=0.010, theta_n=th_n, theta_e=th_e, mat_out="detail_dark",
                       z_split=z_split, mat_out_lower="nozzle_hot", heat_exit=0.40, lip_mat="nozzle_hot")
    for z, size in ((0.06, 0.016), (0.52, 0.014), (1.02, 0.014), (1.52, 0.013), (1.98, 0.012)):
        if mb.lod > 0 and z in (0.52, 1.52):
            continue
        _hoop(mb, r_at, z, size, 72, "nozzle_hot", heat=0.25 + 0.2 * z / z_split)
    # bolted joint between ablative chamber and extension
    r_s = r_at(z_split)
    seg_c = mb.seg(40, 12)
    mb.band(r_s - 0.004, z_split - 0.022, z_split + 0.03, 0.05, mb.seg(72, 16), "engine_metal")
    if mb.want(0):
        mb.bolt_ring(r_s + 0.03, z_split + 0.03, 36, 0.008, 0.012)
    # thick ablative chamber overwrap (hides the thin upper bell)
    z0 = z_split + 0.03
    mb.lathe([(r_at(z0), z0), (r_at(z0) + 0.04, z0), (0.255, z_th - 0.07), (0.245, z_th + 0.03),
              (r_ch, z_th + 0.22), (r_ch, z_inj)], seg_c, "detail_dark", crease=50.0)
    for z in (z_th + 0.30, z_th + 0.44):
        mb.band(r_ch - 0.002, z - 0.012, z + 0.012, 0.008, seg_c, "engine_metal")
    # injector head
    mb.lathe([(r_ch, z_inj), (r_ch + 0.03, z_inj), (r_ch + 0.03, z_inj + 0.07), (0.21, z_inj + 0.07)],
             seg_c, "engine_metal")
    mb.dome(0.21, 0.09, z_inj + 0.07, seg_c, mb.steps(4, 2), "engine_metal")
    if mb.want(0):
        mb.bolt_ring(r_ch + 0.005, z_inj + 0.07, 30, 0.009, 0.012)

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
    mb.lathe([(0.0, z_pl), (r_pl, z_pl), (r_pl, length), (0.0, length)], mb.seg(32, 12), "engine_metal")
    mb.lathe([(0.12, z_pl - 0.10), (0.20, z_pl)], mb.seg(24, 10), "engine_metal")
    mb.lathe([(0.0, z_pl - 0.10), (0.12, z_pl - 0.10)], mb.seg(24, 10), "engine_metal")
    if mb.want(0):
        mb.bolt_ring(r_pl * 0.86, z_pl, 16, 0.012, -0.014)
    with mb.radial(4, phase=math.pi / 4.0):
        apex = (r_pl - 0.03, 0.0, z_pl + 0.01)
        mb.box((0.07, 0.10, 0.07), "engine_metal", center=(r_pl - 0.03, 0.0, z_pl - 0.025))
        for da in (math.radians(27), -math.radians(27)):
            foot = _pol((rg_in + rg_out) / 2.0, da, z_g + 0.045)
            mb.strut(apex, foot, 0.022, seg=8)
            mb.sphere(foot, 0.032, 8, 4, "engine_metal")

    # bipropellant valve assemblies on the injector and their feed lines (fuel +Y, oxidiser -Y)
    z_v = z_inj + 0.17
    for sgn in (1.0, -1.0):
        mb.box((0.17, 0.13, 0.13), "engine_metal", center=(0.0, sgn * 0.15, z_v))
        mb.cyl((-0.17, sgn * 0.15, z_v), (0.17, sgn * 0.15, z_v), 0.048, mb.seg(12, 8), "engine_metal")
        mb.cyl((0.17, sgn * 0.15, z_v), (0.25, sgn * 0.15, z_v), 0.034, mb.seg(10, 6), "detail_dark")
        _inlet(mb, [(0.0, sgn * 0.20, z_v), (0.0, sgn * 0.37, z_v), (0.0, sgn * 0.37, z_pl - 0.05)], 0.04)
        if mb.want(0):
            mb.tube([(-0.17, sgn * 0.15, z_v), (-0.24, sgn * 0.12, z_v - 0.06), (-0.26, sgn * 0.05, z_inj + 0.03)],
                    0.011, 6, "engine_metal", bend=0.04)
    if mb.want(0):
        # purge / instrumentation line down the chamber and a pressure transducer
        mb.tube([_pol(r_ch + 0.035, math.radians(250), z_inj + 0.03), _pol(r_ch + 0.03, math.radians(250), z_th + 0.25),
                 _pol(0.285, math.radians(250), z_th - 0.05), _pol(r_s + 0.07, math.radians(250), z_split + 0.05)],
                0.010, 6, "engine_metal", bend=0.05)
        mb.cyl(_pol(r_ch, math.radians(300), z_inj - 0.12), _pol(r_ch + 0.07, math.radians(300), z_inj - 0.12),
               0.018, 8, "engine_metal")

    _actuators(mb, length, [math.radians(45), math.radians(135)], z_eng=z_split + 0.005, r_surf=r_s,
               r_eng=r_s + 0.11, r_frame=0.84, r_act=0.042)
    _finish(ctx, pid, z_g)


# --------------------------------------------------------------------------- 5. Star 48 class
def gen_solid_kick_motor(ctx):
    """Spherical solid kick motor with a submerged nozzle and a payload attach ring."""
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

    # exit cone (carbon-phenolic)
    r_at = bell_nozzle(mb, z_exit=0.0, length=z_th, r_throat=0.06, r_exit=r_exit, seg=56, steps=14,
                       wall=0.022, theta_n=30.0, theta_e=16.0, mat_out="nozzle_hot", heat_exit=0.3,
                       lip_mat="nozzle_hot")
    _hoop(mb, r_at, 0.05, 0.012, 56)
    _hoop(mb, r_at, 0.36, 0.009, 56)
    # nozzle closure / polar boss where the cone enters the case
    mb.lathe([(0.11, 0.68), (0.20, 0.68), (0.25, 0.80), (0.11, 0.80)], mb.seg(40, 12), "engine_metal",
             closed=True)
    if mb.want(0):
        mb.bolt_ring(0.165, 0.68, 20, 0.011, -0.014)

    # titanium case
    mb.sphere((0.0, 0.0, zc), r_case, seg, mb.steps(24, 10), "engine_metal")
    # equator girth band
    mb.band(r_case - 0.004, zc - 0.04, zc + 0.04, 0.013, seg, "engine_metal")
    # thermal blankets fore and aft of the girth band
    mb.sphere((0.0, 0.0, zc), r_case + 0.008, seg, mb.steps(7, 3), "thermal", lat0=-56.0, lat1=-6.0)
    mb.sphere((0.0, 0.0, zc), r_case + 0.008, seg, mb.steps(5, 3), "thermal", lat0=6.0, lat1=38.0)
    for lat in (-56.0, 38.0):
        a = math.radians(lat)
        mb.torus((r_case + 0.006) * math.cos(a), 0.008, zc + (r_case + 0.006) * math.sin(a), seg,
                 6 if mb.lod == 0 else 4, "engine_metal")

    # payload attach ring (mount face = top flange)
    mb.lathe([(r_ring + 0.027, zc + 0.395), (r_ring, length - 0.09), (r_ring, length), (r_ring - 0.08, length),
              (r_ring - 0.08, length - 0.03), (r_ring - 0.02, length - 0.03), (r_ring + 0.005, zc + 0.415)],
             seg, "engine_metal", crease=25.0)
    mb.band(r_ring - 0.002, length - 0.03, length, 0.012, seg, "engine_metal")
    if mb.want(0):
        mb.bolt_ring(r_ring + 0.012, length - 0.015, 48, 0.007, 0.008, axis="R")
        with mb.radial(24, phase=math.pi / 24.0):
            mb.box((0.012, 0.022, 0.13), "engine_metal", center=(r_ring + 0.016, 0.0, length - 0.115))
    # igniter boss on the forward pole (seen through the attach ring)
    mb.cyl((0.0, 0.0, zc + r_case - 0.03), (0.0, 0.0, length - 0.006), 0.085, mb.seg(20, 8), "engine_metal")
    mb.cyl((0.0, 0.0, zc + r_case - 0.03), (0.0, 0.0, length - 0.016), 0.13, mb.seg(24, 8), "engine_metal")
    if mb.want(0):
        mb.bolt_ring(0.108, length - 0.016, 12, 0.008, 0.008)

    # safe-and-arm box on the case and its cable up to the attach ring
    a_box = math.radians(200.0)
    lat = math.radians(-20.0)
    with mb.xform(rot_z=a_box):
        with mb.xform(loc=(r_case * math.cos(lat) + 0.012, 0.0, zc + r_case * math.sin(lat))):
            mb.box((0.05, 0.15, 0.11), "detail_dark")
            mb.cyl((0.0, 0.085, 0.0), (0.0, 0.12, 0.0), 0.02, 8, "engine_metal")
    cable = []
    for deg in (-17.0, -8.0, 4.0, 16.0, 28.0, 38.0):
        la = math.radians(deg)
        cable.append(_pol((r_case + 0.019) * math.cos(la), a_box + math.radians(4.0 + (deg + 17.0) * 0.25),
                          zc + (r_case + 0.019) * math.sin(la)))
    mb.tube(cable, 0.009, 6, "detail_dark", bend=0.05, bend_seg=2)
    # second, shorter harness to a temperature sensor patch
    if mb.want(0):
        a2 = math.radians(20.0)
        pts = []
        for deg in (38.0, 24.0, 12.0):
            la = math.radians(deg)
            pts.append(_pol((r_case + 0.018) * math.cos(la), a2, zc + (r_case + 0.018) * math.sin(la)))
        mb.tube(pts, 0.007, 6, "detail_dark", bend=0.05, bend_seg=2)
        with mb.xform(rot_z=a2):
            la = math.radians(10.0)
            mb.box((0.02, 0.07, 0.06), "detail_dark",
                   center=((r_case + 0.012) * math.cos(la), 0.0, zc + (r_case + 0.012) * math.sin(la)))
    _finish(ctx, pid, z_th)


register("eng_hydrolox_vacuum", FAMILY, gen_hydrolox_vacuum, DESIGN_REF)
register("eng_kerolox_vacuum", FAMILY, gen_kerolox_vacuum, DESIGN_REF)
register("eng_methalox_vacuum", FAMILY, gen_methalox_vacuum, DESIGN_REF)
register("eng_hypergolic_storable", FAMILY, gen_hypergolic_storable, DESIGN_REF)
register("eng_solid_kick_motor", FAMILY, gen_solid_kick_motor, DESIGN_REF)
