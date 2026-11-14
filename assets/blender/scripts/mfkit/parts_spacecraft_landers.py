"""Mars landers (family 6 of T017; design 7.2.3). stack=False; origin on the ground under the lander axis.

lander_airbag     Pathfinder class: tetrahedral lander (three petals + base petal) in an inflated airbag cluster.
lander_legged     Phoenix / InSight class: hex deck, three legs with foot pads, two round solar arrays, boom, mast.
lander_sky_crane  Curiosity class: sub-objects `descent_stage` (8 engines, tanks, bridle spools) and `rover`;
                  empty `bridle` where the three cables meet the rover deck. Authored with the rover lowered.
"""
from __future__ import annotations

import math

from . import spec
from .pipeline import register

GAME = "game_value"
REAL = "real_world_approximate"
TAU = math.tau


def _meta(ctx, length, width, required, **extra):
    vt = dict(length_m=GAME, max_diameter_m=GAME)
    vt.update(extra.pop("value_types", {}))
    ctx.meta.update(length_m=round(length, 3), stack=False, ring_check=False, required_empties=list(required),
                    max_diameter_m=round(width, 3), value_types=vt, **extra)


# --------------------------------------------------------------------------- airbag
def gen_airbag(ctx):
    mb = ctx.mesh()
    a = spec.LANDER_AIRBAG_TETRA_EDGE
    z0 = 0.55                                    # tetra base height above the ground (inside the bags)
    ra = a / math.sqrt(3.0)                      # base triangle circumradius
    base = [(ra * math.cos(TAU * k / 3 + math.pi / 2), ra * math.sin(TAU * k / 3 + math.pi / 2), z0) for k in range(3)]
    h = a * math.sqrt(2.0 / 3.0)
    apex = (0.0, 0.0, z0 + h)
    # base petal and three side petals (closed tetrahedron), blanket skin with metal edge frames
    mb.face([base[0], base[2], base[1]], "engine_metal")
    for k in range(3):
        p, q = base[k], base[(k + 1) % 3]
        mb.face([p, q, apex], "thermal")
        mb.strut(p, q, 0.035, "engine_metal", seg=6)
        mb.strut(p, apex, 0.035, "engine_metal", seg=6)
    # instrument box on the apex and a low-gain antenna
    mb.box((0.22, 0.22, 0.14), "hull", center=(0, 0, apex[2] + 0.05))
    mb.cyl((0, 0, apex[2] + 0.12), (0, 0, apex[2] + 0.42), 0.015, 6, "engine_metal")
    mb.sphere((0, 0, apex[2] + 0.45), 0.05, 8, 4, "engine_metal")
    # inflated airbag cluster: 3 lobes per face (12 lobes) around the tetrahedron
    zc = z0 + h * 0.30
    r_lobe = 0.78
    for k in range(3):
        ang = TAU * k / 3 + math.pi / 2
        out = (math.cos(ang), math.sin(ang))
        for j in (-1, 0, 1):
            tang = (-out[1], out[0])
            c = (out[0] * (ra * 0.55 + 0.75) + tang[0] * j * 1.1, out[1] * (ra * 0.55 + 0.75) + tang[1] * j * 1.1)
            mb.sphere((c[0], c[1], r_lobe), r_lobe, mb.seg(14, 8), 6, "hull", scale=(1.0, 1.0, 1.0))
    # lobes below the base petal (the cluster cradles the lander)
    mb.sphere((0, 0, 0.5), 0.78, mb.seg(14, 8), 6, "hull", scale=(1.1, 1.1, 0.64))
    # tether lines between the lobes
    if mb.want(0):
        for k in range(3):
            ang = TAU * k / 3 + math.pi / 2
            mb.strut((0, 0, z0 + h * 0.5), (math.cos(ang) * 1.3, math.sin(ang) * 1.3, 0.9), 0.012, "detail_dark", seg=4)
    ctx.empty("tetra_base", (0.0, 0.0, z0))
    ctx.empty("antenna", (0.0, 0.0, apex[2] + 0.45))
    top = apex[2] + 0.5
    _meta(ctx, top, 2 * (ra * 0.55 + 0.75 + 1.1 + r_lobe), ["tetra_base"], tetra_edge_m=a, airbag_lobe_count=10,
          mass_t=0.6, twin="Mars Pathfinder (airbag landing)",
          value_types=dict(length_m=GAME, tetra_edge_m=REAL, mass_t=GAME))


register("lander_airbag", "spacecraft_lander", gen_airbag, "7.2.3")


# --------------------------------------------------------------------------- legged
def gen_legged(ctx):
    mb = ctx.mesh()
    rd = spec.LANDER_LEGGED_DECK_D / 2.0
    zd = 1.05                                     # deck underside height
    # hexagonal deck (hull) with blanketed instrument bay on top
    hexp = [(rd * math.cos(TAU * k / 6), rd * math.sin(TAU * k / 6)) for k in range(6)]
    mb.extrude_poly(hexp, zd, zd + 0.14, "hull")
    mb.box((0.9, 0.8, 0.40), "thermal", center=(-0.15, 0.0, zd + 0.34))
    mb.box((0.5, 0.45, 0.22), "detail_dark", center=(0.35, -0.2, zd + 0.25))
    # three legs: strut from the deck edge to a foot pad, plus a landing-gear damper strut
    s = mb.seg(8, 5)
    for k in range(3):
        a = TAU * k / 3 + math.pi / 6
        ux, uy = math.cos(a), math.sin(a)
        top = ((rd - 0.15) * ux, (rd - 0.15) * uy, zd + 0.02)
        foot = (1.75 * ux, 1.75 * uy, 0.08)
        mb.strut(top, foot, 0.055, "engine_metal", seg=s)
        mid = (top[0] * 0.35 + foot[0] * 0.65, top[1] * 0.35 + foot[1] * 0.65, top[2] * 0.35 + foot[2] * 0.65)
        mb.strut(((rd * 0.35) * ux, (rd * 0.35) * uy, zd + 0.02), mid, 0.035, "engine_metal", seg=s)
        mb.cyl((foot[0], foot[1], 0.0), (foot[0], foot[1], 0.07), 0.24, mb.seg(14, 8), "engine_metal", r1=0.20)
        mb.cyl((foot[0], foot[1], 0.07), (foot[0], foot[1], 0.14), 0.07, mb.seg(10, 6), "engine_metal")
    # descent-engine pods and propellant tanks under the deck
    for k in range(6):
        a = TAU * k / 6 + math.pi / 6
        ux, uy = math.cos(a), math.sin(a)
        p0 = (0.45 * ux, 0.45 * uy, zd - 0.04)
        mb.cyl(p0, (p0[0] + 0.05 * ux, p0[1] + 0.05 * uy, zd - 0.40), 0.05, mb.seg(10, 6), "nozzle_hot", r1=0.10, caps=False, heat=0.15)
    mb.sphere((0.0, 0.0, zd - 0.28), 0.26, mb.seg(14, 8), 6, "engine_metal")
    # round solar arrays (deployed, tilted a little toward the sun) on side booms
    ds = spec.LANDER_LEGGED_SOLAR_D / 2.0
    for sx in (-1, 1):
        base = (sx * (rd + 0.05), 0.0, zd + 0.30)
        mb.strut(base, (sx * (rd + 0.45), 0.0, zd + 0.62), 0.03, "engine_metal", seg=6)
        cx = sx * (rd + 0.45 + ds * 0.95)
        with mb.xform(loc=(cx, 0.0, zd + 0.72), rot_y=sx * math.radians(-12.0)):
            mb.lathe([(0.0, 0.0), (ds, 0.0), (ds, 0.03), (0.0, 0.03)], mb.seg(36, 16), "solar_cell", crease=60.0)
            mb.lathe([(ds, 0.0), (ds + 0.025, 0.0), (ds + 0.025, 0.03), (ds, 0.03)], mb.seg(36, 16), "engine_metal", crease=60.0)
            mb.lathe([(0.0, -0.001), (ds + 0.025, -0.001)], mb.seg(36, 16), "detail_dark", flip=True)
    # robotic arm folded on the front, mast with camera head, antenna
    mb.box((0.14, 0.9, 0.10), "engine_metal", center=(0.0, rd * 0.55 + 0.45, zd + 0.30))
    mb.box((0.18, 0.18, 0.10), "detail_dark", center=(0.0, rd * 0.55 + 0.95, zd + 0.30))
    mb.cyl((-0.45, -0.25, zd + 0.54), (-0.45, -0.25, zd + 1.15), 0.025, 8, "engine_metal")
    mb.box((0.18, 0.10, 0.10), "hull", center=(-0.45, -0.25, zd + 1.2))
    mb.cyl((0.35, 0.35, zd + 0.14), (0.35, 0.35, zd + 0.55), 0.02, 6, "engine_metal")
    mb.sphere((0.35, 0.35, zd + 0.58), 0.07, 8, 4, "hull")
    ctx.empty("deck_centre", (0.0, 0.0, zd + 0.14))
    ctx.empty("arm_base", (0.0, rd * 0.55, zd + 0.30))
    width = 2 * (rd + 0.45 + 2 * ds * 0.95 + ds * 0.05)
    _meta(ctx, zd + 1.3, max(width, 2 * 1.75 + 0.5), ["deck_centre"], deck_diameter_m=spec.LANDER_LEGGED_DECK_D,
          solar_array_diameter_m=spec.LANDER_LEGGED_SOLAR_D, leg_count=3, mass_t=0.8,
          twin="Phoenix / InSight (propulsive landing on legs)",
          value_types=dict(length_m=GAME, deck_diameter_m=GAME, solar_array_diameter_m=REAL, leg_count=REAL, mass_t=GAME))


register("lander_legged", "spacecraft_lander", gen_legged, "7.2.3")


# --------------------------------------------------------------------------- sky crane
ROVER_Z = 0.9          # rover body underside (wheel radius 0.26 + clearance), m


def _rover(mb):
    """Curiosity-class rover on the ground at the origin; +Y forward."""
    mb.box((1.7, 2.2, 0.75), "hull", center=(0, 0.0, ROVER_Z + 0.375), taper=0.96)
    mb.box((1.72, 2.22, 0.10), "livery", center=(0, 0.0, ROVER_Z + 0.78))                 # deck plate
    mb.box((1.5, 1.4, 0.10), "thermal", center=(0, -0.25, ROVER_Z + 0.88))
    mb.cyl((0, -1.35, ROVER_Z + 0.55), (0, -1.05, ROVER_Z + 0.55), 0.25, mb.seg(14, 8), "engine_metal", caps=True)   # RTG (aft)
    mb.cyl((-0.5, 0.25, ROVER_Z + 0.83), (-0.5, 0.25, ROVER_Z + 1.9), 0.04, 8, "engine_metal")                        # mast
    mb.box((0.45, 0.12, 0.16), "detail_dark", center=(-0.5, 0.25, ROVER_Z + 1.97))                                   # camera head
    mb.box((0.12, 1.1, 0.12), "engine_metal", center=(0.55, 1.25, ROVER_Z + 0.45))                                   # arm
    mb.box((0.30, 0.25, 0.25), "detail_dark", center=(0.55, 1.85, ROVER_Z + 0.45))
    s = mb.seg(14, 8)
    for sx in (-1, 1):
        for yy in (-1.15, 0.0, 1.15):
            wx = sx * 1.0
            mb.cyl((wx - 0.19, yy, 0.30), (wx + 0.19, yy, 0.30), 0.30, s, "detail_dark")
            mb.cyl((wx + sx * 0.19, yy, 0.30), (wx + sx * 0.20, yy, 0.30), 0.18, 8, "engine_metal")
        # rocker-bogie struts
        mb.strut((sx * 0.9, -1.15, 0.3), (sx * 0.9, 0.0, ROVER_Z + 0.2), 0.05, "engine_metal", seg=6)
        mb.strut((sx * 0.9, 1.15, 0.3), (sx * 0.9, 0.0, ROVER_Z + 0.2), 0.05, "engine_metal", seg=6)
        mb.strut((sx * 0.9, 0.0, 0.3), (sx * 0.9, 0.0, ROVER_Z + 0.2), 0.05, "engine_metal", seg=6)
        mb.strut((sx * 0.9, 0.0, ROVER_Z + 0.2), (sx * 0.6, 0.0, ROVER_Z + 0.4), 0.05, "engine_metal", seg=6)


def _descent_stage(mb, zb):
    """Sky-crane descent stage with its centre at height zb (the bridle length above the rover deck)."""
    oct_pts = [(1.45 * math.cos(TAU * k / 8 + math.pi / 8), 1.45 * math.sin(TAU * k / 8 + math.pi / 8)) for k in range(8)]
    mb.extrude_poly(oct_pts, zb - 0.22, zb + 0.22, "hull")
    mb.extrude_poly([(x * 0.72, y * 0.72) for x, y in oct_pts], zb + 0.22, zb + 0.46, "thermal")
    for k in range(4):                                         # four propellant tanks on the deck
        a = TAU * k / 4 + math.pi / 4
        mb.sphere((0.65 * math.cos(a), 0.65 * math.sin(a), zb + 0.62), 0.30, mb.seg(14, 8), 6, "engine_metal")
    s = mb.seg(12, 6)
    for k in range(4):                                         # four corners, two throttleable engines each
        a = TAU * k / 4 + math.pi / 4
        ux, uy = math.cos(a), math.sin(a)
        for dtan in (-0.26, 0.26):
            px, py = 1.30 * ux - dtan * uy, 1.30 * uy + dtan * ux
            d = (0.35 * ux, 0.35 * uy, -0.94)
            p0 = (px, py, zb - 0.15)
            p1 = (px + d[0] * 0.9, py + d[1] * 0.9, zb - 0.15 + d[2] * 0.9)
            mb.cyl(p0, p1, 0.07, s, "nozzle_hot", r1=0.17, caps=False, heat=0.2)
            mb.cyl((px, py, zb + 0.15), p0, 0.14, s, "engine_metal", r1=0.07, caps=False)
    for k in range(3):                                         # bridle spools
        a = TAU * k / 3
        mb.cyl((0.9 * math.cos(a), 0.9 * math.sin(a), zb - 0.5), (0.9 * math.cos(a), 0.9 * math.sin(a), zb - 0.22), 0.14, 8, "detail_dark")


def gen_sky_crane(ctx):
    L = spec.LANDER_SKYCRANE_BRIDLE
    rover = ctx.mesh("rover")
    _rover(rover)
    z_deck = ROVER_Z + 0.9
    zb = z_deck + L
    ds = ctx.mesh("descent_stage")
    _descent_stage(ds, zb)
    for k in range(3):                                         # bridle cables from the spools to the rover deck
        a = TAU * k / 3
        ds.strut((0.9 * math.cos(a), 0.9 * math.sin(a), zb - 0.5), (0.35 * math.cos(a + 0.5), 0.35 * math.sin(a + 0.5), z_deck), 0.018, "detail_dark", seg=4)
    ctx.empty("bridle", (0.0, 0.0, z_deck), sub="rover")
    _meta(ctx, zb + 0.7, 3.2, ["bridle"], bridle_length_m=L, descent_stage_height_m=round(zb, 3), rover_mass_t=1.0,
          pose="rover lowered on the bridle", twin="Mars Science Laboratory / Perseverance (sky crane)",
          value_types=dict(length_m=GAME, bridle_length_m=GAME, rover_mass_t=GAME))


register("lander_sky_crane", "spacecraft_lander", gen_sky_crane, "7.2.3")
