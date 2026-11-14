"""Launch escape systems (family 4 of T017; design 7.4).

les_escape_tower          stack part: bottom ring = docking ring of cap_standard / cap_deep_space; empties
                          attach_top (tower tip), nozzle_ring, jettison_motor.
les_integrated_pusher     stack=False; frame = capsule frame (origin on the capsule axis at its mating
                          ring); four pods sit on the cone at the capsule's attach_pod_1..4 empties.
les_ejection_seats        stack=False; one seat for the part card, origin at the seat pan centre.
"""
from __future__ import annotations

import math

from . import spec
from .parts_spacecraft_capsules import Cap
from .pipeline import register

GAME = "game_value"
REAL = "real_world_approximate"


def gen_escape_tower(ctx):
    mb = ctx.mesh()
    L = spec.LES_TOWER_LEN
    r0 = spec.LES_TOWER_RING_D / 2.0
    seg = mb.seg(40, 16)
    # base adapter ring and truss of four legs up to the abort motor
    mb.lathe([(r0, 0.0), (r0, 0.30), (r0 - 0.04, 0.34), (r0 - 0.04, 0.06), (r0 - 0.02, 0.02)], seg, "engine_metal", crease=40.0)
    z_t = 3.4
    r_m = 0.60
    s = mb.seg(8, 5)
    for k in range(4):
        a = math.pi / 4.0 + math.pi / 2.0 * k
        p0 = ((r0 - 0.08) * math.cos(a), (r0 - 0.08) * math.sin(a), 0.30)
        p1 = ((r_m - 0.12) * math.cos(a), (r_m - 0.12) * math.sin(a), z_t)
        mb.strut(p0, p1, 0.06, "engine_metal", seg=s)
        a2 = a + math.pi / 2.0
        q1 = ((r_m - 0.12) * math.cos(a2), (r_m - 0.12) * math.sin(a2), z_t)
        if mb.want(0):
            mb.strut(p0, q1, 0.035, "engine_metal", seg=s)
    for zr in (1.15, 2.25):
        rr = (r0 - 0.08) + ((r_m - 0.12) - (r0 - 0.08)) * (zr - 0.30) / (z_t - 0.30)
        mb.torus(rr, 0.03, zr, seg, 4, "engine_metal")
    # abort motor body (hull) with the nozzle ring skirt, then attitude-control section and jettison motor
    prof = [(r_m * 0.55, z_t), (r_m, z_t + 0.35), (r_m, z_t + 3.6), (r_m * 0.78, z_t + 4.0), (r_m * 0.78, z_t + 4.5),
            (0.46, z_t + 4.7), (0.46, z_t + 6.7), (0.46, z_t + 6.7)]
    mb.lathe(prof, seg, "hull", crease=35.0)
    mb.band(r_m, z_t + 0.9, z_t + 1.15, 0.015, seg, "livery")
    mb.band(0.46, z_t + 6.2, z_t + 6.45, 0.015, seg, "livery")
    # four canted abort nozzles at the motor base
    cant = math.radians(spec.LES_NOZZLE_CANT_DEG)
    zn = z_t + 0.35
    for k in range(4):
        a = math.pi / 4.0 + math.pi / 2.0 * k
        ux, uy = math.cos(a), math.sin(a)
        p0 = ((r_m - 0.12) * ux, (r_m - 0.12) * uy, zn)
        d = (math.sin(cant) * ux, math.sin(cant) * uy, -math.cos(cant))
        p1 = (p0[0] + d[0] * 1.15, p0[1] + d[1] * 1.15, p0[2] + d[2] * 1.15)
        mb.cyl(p0, p1, 0.09, mb.seg(14, 8), "nozzle_hot", r1=0.26, caps=False, heat=0.25)
        mb.cyl(((r_m - 0.12) * ux, (r_m - 0.12) * uy, zn + 0.30), p0, 0.14, mb.seg(14, 8), "engine_metal", r1=0.09, caps=False)
    # attitude-control motor ports (four small pads) and jettison motor nozzles pointing aft-outward
    if mb.want(0):
        for k in range(4):
            a = math.pi / 2.0 * k
            mb.box((0.10, 0.18, 0.24), "detail_dark", center=((0.46 + 0.02) * math.cos(a), (0.46 + 0.02) * math.sin(a), z_t + 5.3),
                   matrix=None)
    # nose: ogive to a point, then pitot boom
    z_n = z_t + 6.7
    nose_h = L - z_n - 1.0
    prof_n = []
    for i in range(7):
        t = i / 6.0
        prof_n.append((0.46 * (1.0 - t ** 1.7) ** 0.62 if t < 1.0 else 0.03, z_n + nose_h * t))
    mb.lathe(prof_n, seg, "hull", crease=40.0)
    mb.cyl((0, 0, z_n + nose_h - 0.02), (0, 0, L), 0.035, mb.seg(8, 5), "engine_metal", r1=0.0, caps=False)
    ctx.empty("attach_top", (0.0, 0.0, L))
    ctx.empty("nozzle_ring", (0.0, 0.0, zn))
    ctx.empty("jettison_motor", (0.0, 0.0, z_t + 5.0))
    ctx.meta.update(length_m=L, diameter_bottom_m=spec.LES_TOWER_RING_D, diameter_top_m=0.0, abort_motor_diameter_m=2 * r_m,
                    nozzle_cant_deg=spec.LES_NOZZLE_CANT_DEG, mates_with=["cap_standard", "cap_deep_space"],
                    twin="Orion Launch Abort System class (tractor tower)",
                    value_types=dict(length_m=GAME, diameter_bottom_m=GAME, abort_motor_diameter_m=GAME, nozzle_cant_deg=REAL))


register("les_escape_tower", "spacecraft_les_tower", gen_escape_tower, "7.4")


# --------------------------------------------------------------------------- integrated pusher pods
def gen_pusher(ctx):
    mb = ctx.mesh()
    c = Cap("cap_standard")
    zp = c.z_cone0 + 0.28 * c.h_cone
    rp = c.cone_r(zp)
    tilt = -math.radians(spec.CAPSULE_CONE_DEG)
    for i in range(4):
        az = math.radians(45.0 + 90.0 * i)
        with mb.xform(loc=(rp * math.cos(az), rp * math.sin(az), zp), rot_z=az, rot_y=tilt):
            mb.box((0.46, 0.95, 1.35), "hull", center=(0.20, 0, 0.0), taper=0.92)
            mb.box((0.06, 0.70, 1.0), "detail_dark", center=(0.45, 0, 0.0))
            mb.box((0.12, 1.05, 0.12), "livery", center=(0.22, 0, 0.62))
            for sy in (-0.24, 0.24):
                mb.cyl((0.28, sy, -0.55), (0.28, sy, -1.25), 0.07, mb.seg(12, 6), "nozzle_hot", r1=0.17, caps=False, heat=0.2)
                mb.cyl((0.28, sy, -0.30), (0.28, sy, -0.55), 0.12, mb.seg(12, 6), "engine_metal", r1=0.07, caps=False)
        ctx.empty(f"attach_pod_{i + 1}", (rp * math.cos(az), rp * math.sin(az), zp))
    ctx.meta.update(length_m=round(zp + 1.0, 3), stack=False, ring_check=False, max_diameter_m=round(2 * rp + 2.0, 2),
                    required_empties=[f"attach_pod_{i + 1}" for i in range(4)], frame="capsule frame of cap_standard",
                    pod_count=4, twin="Crew Dragon SuperDraco pods (8 engines in 4 pods)",
                    value_types=dict(pod_count=REAL, length_m=GAME))


register("les_integrated_pusher", "spacecraft_les_pod", gen_pusher, "7.4")


# --------------------------------------------------------------------------- ejection seat
def gen_ejection_seat(ctx):
    mb = ctx.mesh()
    # frame: origin under the seat (lowest point); attach_base = seat pan centre; +Y forward (occupant faces +Y)
    mb.box((0.52, 0.50, 0.08), "hull", center=(0, 0.0, 0.04))                         # pan
    mb.box((0.52, 0.10, 0.85), "hull", center=(0, -0.24, 0.50), taper=0.9)            # back
    mb.box((0.30, 0.14, 0.30), "hull", center=(0, -0.24, 1.06))                       # headrest
    mb.box((0.34, 0.06, 0.22), "livery", center=(0, -0.16, 1.06))
    mb.box((0.30, 0.28, 0.22), "engine_metal", center=(0, -0.27, -0.16))              # rocket pack under the pan
    mb.cyl((0, -0.27, -0.28), (0, -0.27, -0.55), 0.06, 10, "nozzle_hot", r1=0.10, caps=False, heat=0.2)
    for sx in (-0.30, 0.30):
        mb.cyl((sx, -0.28, 0.02), (sx, -0.28, 1.12), 0.025, 8, "engine_metal")        # guide rails
        mb.box((0.09, 0.06, 0.06), "engine_metal", center=(sx * 0.95, -0.02, 0.28), taper=0.8)   # armrest
    mb.box((0.34, 0.20, 0.06), "detail_dark", center=(0, 0.04, 0.20))                # harness lap belt
    for sx in (-0.11, 0.11):
        mb.box((0.05, 0.03, 0.55), "livery", center=(sx, -0.14, 0.62))
    mb.box((0.14, 0.10, 0.07), "livery", center=(0, 0.06, -0.03))                      # firing handle
    mb.v = [(x, y, z + 0.56) for x, y, z in mb.v]     # origin = lowest point (nozzle exit), pan top at z = 0.64 m
    ctx.empty("attach_base", (0.0, 0.0, 0.56))
    ctx.meta.update(length_m=1.77, stack=False, ring_check=False, max_diameter_m=0.7, required_empties=["attach_base"],
                    twin="Gemini ejection seat class", value_types=dict(length_m=GAME))


register("les_ejection_seats", "spacecraft_les_pod", gen_ejection_seat, "7.4")
