"""Launch pad and gantry (family 1 of T017; design 6.1, 6.10, 7.1).

World parts are non-stack (`stack=False`). Pad parts: origin at ground level under the vehicle
axis, deck top at spec.PAD_DECK_H. Gantry parts: origin at ground level under the TOWER axis
(the tower stands spec.GANTRY_OFFSET_X metres from the vehicle axis along +X and every arm
reaches toward -X, the vehicle). Required empties are listed in meta `required_empties`.
"""
from __future__ import annotations

import math

from mathutils import Matrix

from . import spec
from .pipeline import register

GAME = "game_value"
REAL = "real_world_approximate"
G = spec.GANTRY_HALF
LEG = spec.GANTRY_LEG
# local (x, y, z) -> world (z, x, y): extrudes a polygon given in (y, z) along +X
_YZ_TO_X = Matrix(((0, 0, 1, 0), (1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 0, 1)))


def _world_meta(ctx, length, required, **extra):
    ctx.meta.update(length_m=length, stack=False, ring_check=False, required_empties=list(required),
                    **extra)
    ctx.meta.setdefault("max_diameter_m", extra.get("width_m", max(length, 1.0)))   # contact-sheet label


# --------------------------------------------------------------------------- pad
def gen_pad_deck(ctx):
    mb = ctx.mesh()
    zt, t = spec.PAD_DECK_H, spec.PAD_DECK_T
    hx, hy, op = spec.PAD_DECK_HALF_X, spec.PAD_DECK_HALF_Y, spec.PAD_OPENING / 2.0
    zc = zt - t / 2.0
    # slab built around the square opening
    mb.box((hx - op, 2 * hy, t), "concrete", center=((hx + op) / 2.0, 0, zc))
    mb.box((hx - op, 2 * hy, t), "concrete", center=(-(hx + op) / 2.0, 0, zc))
    mb.box((2 * op, hy - op, t), "concrete", center=(0, (hy + op) / 2.0, zc))
    mb.box((2 * op, hy - op, t), "concrete", center=(0, -(hy + op) / 2.0, zc))
    # steel rim lining the opening
    rim, rh = 0.35, 0.30
    mb.box((2 * op + 2 * rim, rim, rh), "engine_metal", center=(0, op + rim / 2.0, zt + rh / 2.0 - 0.02))
    mb.box((2 * op + 2 * rim, rim, rh), "engine_metal", center=(0, -op - rim / 2.0, zt + rh / 2.0 - 0.02))
    mb.box((rim, 2 * op, rh), "engine_metal", center=(op + rim / 2.0, 0, zt + rh / 2.0 - 0.02))
    mb.box((rim, 2 * op, rh), "engine_metal", center=(-op - rim / 2.0, 0, zt + rh / 2.0 - 0.02))
    # launch mount ring (navy structure) around the vehicle base
    seg = mb.seg(48, 24)
    r0, r1, h = spec.PAD_MOUNT_R_IN, spec.PAD_MOUNT_R_OUT, spec.PAD_MOUNT_H
    mb.lathe([(r0, zt), (r1, zt), (r1, zt + h * 0.6), (r1 - 0.25, zt + h), (r0 + 0.1, zt + h), (r0, zt + h * 0.7)],
             seg, "gantry", crease=35.0)
    mb.lathe([(r0, zt + h * 0.7), (r0, zt)], seg, "detail_dark")  # shadow gap against the skirt
    # deck-edge kerb and four blast-door-style access plates
    if mb.want(0):
        mb.box((2 * hx, 0.3, 0.25), "concrete", center=(0, hy - 0.15, zt + 0.12))
        mb.box((2 * hx, 0.3, 0.25), "concrete", center=(0, -hy + 0.15, zt + 0.12))
        mb.box((0.3, 2 * hy, 0.25), "concrete", center=(hx - 0.15, 0, zt + 0.12))
        mb.box((0.3, 2 * hy, 0.25), "concrete", center=(-hx + 0.15, 0, zt + 0.12))
    # hold-down clamps: pedestal, jaw reaching the core base ring, latch cover
    n = spec.PAD_CLAMPS
    with mb.radial(n, phase=math.pi / n):
        rj = spec.PAD_CLAMP_R
        mb.box((0.9, 0.9, 1.1), "engine_metal", center=(r0 + 0.65, 0, zt + h + 0.55), taper=0.85)
        mb.box((0.55, 0.55, 0.45), "engine_metal", center=(rj + 0.30, 0, zt + h + 0.95), taper=0.8)
        mb.box((0.45, 0.65, 0.30), "detail_dark", center=(r0 + 0.65, 0, zt + h + 1.25))
    ctx.empty("vehicle_base", (0.0, 0.0, zt))
    ctx.empty("clamp_ring", (0.0, 0.0, zt + h + 0.95))
    ctx.empty("trench_mate", (0.0, 0.0, zt - t))
    _world_meta(ctx, zt, ["vehicle_base", "trench_mate"], deck_height_m=zt, deck_size_m=[2 * hx, 2 * hy],
                opening_m=spec.PAD_OPENING, hold_down_count=n, hold_down_radius_m=spec.PAD_CLAMP_R,
                value_types=dict(deck_height_m=GAME, deck_size_m=GAME, opening_m=GAME, hold_down_count=GAME,
                                 hold_down_radius_m=REAL))


def gen_flame_trench(ctx):
    mb = ctx.mesh()
    zt = spec.PAD_DECK_H - spec.PAD_DECK_T      # trench walls meet the deck underside here
    w, hx = spec.TRENCH_HALF_W, spec.PAD_DECK_HALF_X
    y0, y1 = -spec.TRENCH_LEN_AFT, spec.TRENCH_LEN_FWD
    floor_t = 0.5
    # floor and apron
    mb.box((2 * hx + 4, y1 - y0 + 6, floor_t), "concrete", center=(0, (y0 + y1) / 2.0 + 3, floor_t / 2.0))
    # walls: monolith under the deck (full height), then a ramp of lower walls toward the exit
    for sx in (-1.0, 1.0):
        xc = sx * (w + hx) / 2.0
        mb.box((hx - w, spec.TRENCH_LEN_AFT * 2, zt - floor_t), "concrete", center=(xc, 0, floor_t + (zt - floor_t) / 2.0))
        # exit wall: top slopes from deck underside down to 2.8 m
        pts = [(0.0, floor_t), (y1 - spec.TRENCH_LEN_AFT, floor_t), (y1 - spec.TRENCH_LEN_AFT, 2.8),
               (0.0, zt)]
        with mb.xform(loc=(xc, spec.TRENCH_LEN_AFT, 0)):
            wall = [(a, b) for a, b in pts]
            # polygon in (y, z), extruded across the wall thickness along X
            mb.extrude_poly(wall, -(hx - w) / 2.0, (hx - w) / 2.0, "concrete", matrix=_YZ_TO_X)
    # back wall closing the trench behind the axis
    mb.box((2 * hx, 1.5, zt - floor_t), "concrete", center=(0, y0 - 0.75, floor_t + (zt - floor_t) / 2.0))
    # flame deflector: wedge under the axis rising toward -Y, sloping away toward +Y, steel plated
    wedge = [(-4.0, floor_t), (9.0, floor_t), (-0.5, 3.4), (-4.0, 3.4)]
    mb.extrude_poly(wedge, -w + 0.4, w - 0.4, "concrete", matrix=_YZ_TO_X)
    plate = [(-0.5 + 0.0, 3.4 + 0.04), (9.0 + 0.0, floor_t + 0.04), (9.0, floor_t + 0.2), (-0.5, 3.6)]
    mb.extrude_poly(plate, -w + 0.6, w - 0.6, "nozzle_hot", matrix=_YZ_TO_X, caps=True)
    # deflector side ribs
    if mb.want(0):
        for sx in (-1.0, 1.0):
            mb.box((0.35, 12.0, 0.5), "detail_dark", center=(sx * (w - 0.5), 4.0, floor_t + 0.25))
    ctx.empty("deck_mate", (0.0, 0.0, zt))
    ctx.empty("deflector_tip", (0.0, 9.0, floor_t))
    ctx.empty("trench_exit", (0.0, y1, floor_t))
    _world_meta(ctx, y1 - y0, ["deck_mate", "trench_exit"], trench_clear_width_m=2 * w,
                deck_underside_z_m=zt,
                value_types=dict(trench_clear_width_m=GAME, deck_underside_z_m=GAME))


# --------------------------------------------------------------------------- gantry
def _frame(mb, z, w=G, depth=0.26):
    """Horizontal ring beams on the four faces at height z (centre of the beam)."""
    for sy in (-1.0, 1.0):
        mb.box((2 * w, 0.24, depth), "gantry", center=(0, sy * (w - LEG / 2.0), z))
    for sx in (-1.0, 1.0):
        mb.box((0.24, 2 * w - 2 * LEG, depth), "gantry", center=(sx * (w - LEG / 2.0), 0, z))


def _x_brace(mb, z0, z1, w=G, r=0.07):
    """Crossing diagonals on the four faces of one bay."""
    c = w - LEG / 2.0
    s = mb.seg(6, 4)
    for sy in (-1.0, 1.0):
        mb.strut((-c, sy * c, z0), (c, sy * c, z1), r, "gantry", seg=s)
        mb.strut((c, sy * c, z0), (-c, sy * c, z1), r, "gantry", seg=s)
    for sx in (-1.0, 1.0):
        mb.strut((sx * c, -c, z0), (sx * c, c, z1), r, "gantry", seg=s)
        mb.strut((sx * c, c, z0), (sx * c, -c, z1), r, "gantry", seg=s)


def _legs(mb, z0, z1, w=G):
    for sx in (-1.0, 1.0):
        for sy in (-1.0, 1.0):
            mb.box((LEG, LEG, z1 - z0), "gantry", center=(sx * (w - LEG / 2.0), sy * (w - LEG / 2.0), (z0 + z1) / 2.0))


def gen_gantry_segment(ctx):
    mb = ctx.mesh()
    h = spec.GANTRY_SEGMENT_H
    _legs(mb, 0.0, h)
    _frame(mb, 0.13)
    _frame(mb, h - 0.13)
    _x_brace(mb, 0.26, h / 2.0)
    _x_brace(mb, h / 2.0, h - 0.26)
    _frame(mb, h / 2.0, depth=0.20)
    if mb.want(0):
        # service platform on the vehicle-facing (-X) side with a guard rail on posts, and a cable run
        zp = h / 2.0
        mb.box((1.4, 2 * G - 2 * LEG, 0.14), "engine_metal", center=(-G - 0.5, 0, zp))
        mb.box((1.4, 2 * G - 2 * LEG, 0.05), "detail_dark", center=(-G - 0.5, 0, zp - 0.09))
        for dy in (-1.0, 0.0, 1.0):
            mb.box((0.06, 0.06, 1.05), "engine_metal", center=(-G - 1.18, dy * (G - LEG), zp + 0.58))
        for dy in (-1.0, 1.0):
            mb.box((1.4, 0.06, 0.06), "engine_metal", center=(-G - 0.5, dy * (G - LEG), zp + 1.08))
        mb.box((0.06, 2 * G - 2 * LEG, 0.06), "engine_metal", center=(-G - 1.18, 0, zp + 1.08))
        mb.box((0.06, 2 * G - 2 * LEG, 0.06), "engine_metal", center=(-G - 1.18, 0, zp + 0.55))
        mb.cyl((G - 0.55, G - 0.1, 0.1), (G - 0.55, G - 0.1, h - 0.1), 0.06, 8, "detail_dark")
        mb.cyl((G - 0.75, G - 0.1, 0.1), (G - 0.75, G - 0.1, h - 0.1), 0.045, 8, "thermal")
    ctx.empty("attach_top", (0.0, 0.0, h))
    ctx.empty("attach_base", (0.0, 0.0, 0.0))
    _world_meta(ctx, h, ["attach_top"], width_m=2 * G, vehicle_axis_offset_m=[-spec.GANTRY_OFFSET_X, 0.0],
                stackable=True, max_stack_height_m=spec.GANTRY_MAX_H,
                value_types=dict(length_m=GAME, width_m=GAME, vehicle_axis_offset_m=GAME))


def gen_gantry_base(ctx):
    mb = ctx.mesh()
    h = spec.GANTRY_BASE_H
    # concrete pedestal (slightly tapered), steel base plate and anchor bolts
    mb.box((2 * G + 1.2, 2 * G + 1.2, h - 0.4), "concrete", center=(0, 0, (h - 0.4) / 2.0), taper=0.92)
    mb.box((2 * G + 0.2, 2 * G + 0.2, 0.40), "gantry", center=(0, 0, h - 0.2))
    wb = 2 * G + 1.2
    for zb in (2.2, 5.0, 7.4):   # navy expansion bands break up the concrete mass
        mb.box((wb * (1.0 - 0.08 * zb / h) + 0.08, wb * (1.0 - 0.08 * zb / h) + 0.08, 0.22), "gantry", center=(0, 0, zb))
    mb.box((0.10, 2.0, 3.2), "detail_dark", center=(-G - 0.55 + 0.0, 0, 1.8))   # service door
    if mb.want(0):
        for sx in (-1.0, 1.0):
            for sy in (-1.0, 1.0):
                mb.cyl((sx * (G - LEG / 2.0), sy * (G - LEG / 2.0), h), (sx * (G - LEG / 2.0), sy * (G - LEG / 2.0), h + 0.08),
                       0.13, 8, "engine_metal", caps=(False, True))
    ctx.empty("attach_top", (0.0, 0.0, h))
    _world_meta(ctx, h, ["attach_top"], width_m=2 * G + 1.2, vehicle_axis_offset_m=[-spec.GANTRY_OFFSET_X, 0.0],
                value_types=dict(length_m=GAME, width_m=GAME, vehicle_axis_offset_m=GAME))


def gen_gantry_crown(ctx):
    mb = ctx.mesh()
    _legs(mb, 0.0, 1.2)
    _frame(mb, 0.13)
    _frame(mb, 1.2)
    _x_brace(mb, 0.26, 1.1)
    # roof deck, machinery house, slewing ring
    mb.box((2 * G + 0.3, 2 * G + 0.3, 0.2), "gantry", center=(0, 0, 1.3))
    mb.box((3.2, 3.0, 1.8), "hull", center=(0.4, 0, 2.3), taper=0.9)
    mb.box((3.3, 0.06, 0.5), "livery", center=(0.4, 1.5, 2.3))
    seg = mb.seg(24, 12)
    mb.lathe([(0.6, 3.2), (0.9, 3.2), (0.9, 3.5), (0.6, 3.5)], seg, "engine_metal", crease=40.0)
    # crane head: jib toward the vehicle (-X), counter-jib behind with ballast, tie lines
    jib_len = 7.0
    mb.box((jib_len, 0.45, 0.45), "gantry", center=(-jib_len / 2.0 + 0.4, 0, 3.7))
    mb.box((3.0, 0.45, 0.45), "gantry", center=(0.4 + 1.5, 0, 3.7))
    mb.box((1.4, 1.2, 1.0), "concrete", center=(3.4, 0, 3.5))
    mb.strut((0.4, 0, 5.4), (-jib_len + 0.4, 0, 3.8), 0.04, "engine_metal", seg=6)
    mb.strut((0.4, 0, 5.4), (3.9, 0, 3.8), 0.04, "engine_metal", seg=6)
    mb.strut((0.4, 0, 3.8), (0.4, 0, 5.4), 0.10, "gantry", seg=8)
    # lightning rod with finial
    mb.cyl((0.4, 0, 3.8), (0.4, 0, 7.6), 0.07, 8, "engine_metal", r1=0.03)
    mb.sphere((0.4, 0, 5.4), 0.16, 8, 4, "engine_metal")
    mb.sphere((0.4, 0, 7.65), 0.07, 6, 3, "engine_metal")
    # hoist line and hook block hanging from the jib tip
    mb.cyl((-jib_len + 0.4, 0, 3.5), (-jib_len + 0.4, 0, 1.8), 0.02, 6, "detail_dark")
    mb.box((0.35, 0.35, 0.40), "engine_metal", center=(-jib_len + 0.4, 0, 1.6))
    ctx.empty("attach_base", (0.0, 0.0, 0.0))
    ctx.empty("lightning_tip", (0.4, 0.0, 7.72))
    ctx.empty("hook", (-jib_len + 0.4, 0.0, 1.4))
    _world_meta(ctx, 7.72, ["lightning_tip", "hook"], width_m=2 * G, jib_length_m=jib_len,
                vehicle_axis_offset_m=[-spec.GANTRY_OFFSET_X, 0.0],
                value_types=dict(length_m=GAME, jib_length_m=GAME))


def _truss_boom(mb, x0, x1, z, depth, width, bays, mat="gantry", r=0.05):
    """Box-truss beam along X from x0 to x1, chords at z +- depth/2."""
    s = mb.seg(6, 4)
    hy = width / 2.0
    for dz in (-depth / 2.0, depth / 2.0):
        for dy in (-hy, hy):
            mb.strut((x0, dy, z + dz), (x1, dy, z + dz), r * 1.4, mat, seg=s)
    n = mb.steps(bays, 3)
    for i in range(n):
        xa, xb = x0 + (x1 - x0) * i / n, x0 + (x1 - x0) * (i + 1) / n
        for dy in (-hy, hy):
            a, b = (xa, dy, z - depth / 2.0), (xb, dy, z + depth / 2.0)
            mb.strut(a, b, r, mat, seg=s) if i % 2 == 0 else mb.strut((xa, dy, z + depth / 2.0), (xb, dy, z - depth / 2.0), r, mat, seg=s)
        if mb.want(0):
            mb.strut((xa, -hy, z + depth / 2.0), (xa, hy, z + depth / 2.0), r * 0.8, mat, seg=s)


def gen_crane_arm(ctx):
    mb = ctx.mesh()
    piv_z, length = 3.0, 12.0
    # slewing pedestal and housing
    mb.box((1.6, 1.6, piv_z - 0.4), "gantry", center=(0, 0, (piv_z - 0.4) / 2.0), taper=0.9)
    mb.box((1.7, 1.7, 0.4), "engine_metal", center=(0, 0, piv_z - 0.2))
    seg = mb.seg(20, 10)
    mb.lathe([(0.0, piv_z), (0.75, piv_z), (0.75, piv_z + 0.55), (0.0, piv_z + 0.55)], seg, "engine_metal", crease=40.0)
    _truss_boom(mb, -length, 0.0, piv_z + 0.65, 0.9, 0.8, 8)
    mb.box((1.2, 1.0, 1.0), "concrete", center=(1.1, 0, piv_z + 0.55))     # counterweight
    # hoist line and hook block at the tip
    xt = -length + 0.1
    mb.cyl((xt, 0, piv_z + 0.2), (xt, 0, 0.9), 0.02, 6, "detail_dark")
    mb.box((0.35, 0.35, 0.40), "engine_metal", center=(xt, 0, 0.75))
    ctx.empty("pivot", (0.0, 0.0, piv_z))
    ctx.empty("hook", (xt, 0.0, 0.55))
    _world_meta(ctx, length, ["pivot", "hook"], boom_length_m=length, reach_axis="-X",
                value_types=dict(boom_length_m=GAME, length_m=GAME))


def _hose(mb, p0, p1, droop, r, mat, seg):
    mid = ((p0[0] + p1[0]) / 2.0, (p0[1] + p1[1]) / 2.0, min(p0[2], p1[2]) - droop)
    mb.tube([p0, mid, p1], r, seg, mat, bend=1.0, bend_seg=3)


def gen_umbilical_arm(ctx):
    mb = ctx.mesh()
    length, zc = 7.6, 0.9
    # hinge column
    mb.box((0.55, 0.55, 2.6), "gantry", center=(0, 0, 1.3))
    seg = mb.seg(16, 8)
    mb.lathe([(0.0, zc - 0.5), (0.34, zc - 0.5), (0.34, zc + 0.5), (0.0, zc + 0.5)], seg, "engine_metal", crease=40.0)
    # swing arm: enclosed box truss with a navy frame and thermal-blanketed service line
    _truss_boom(mb, -length, -0.3, zc, 0.8, 0.7, 6, r=0.04)
    mb.box((length - 0.4, 0.5, 0.18), "engine_metal", center=(-(length + 0.3) / 2.0, 0, zc - 0.5))
    mb.cyl((-0.3, 0.0, zc + 0.14), (-length + 0.2, 0.0, zc + 0.14), 0.13, 10, "thermal", caps=False)
    mb.cyl((-0.3, 0.2, zc + 0.04), (-length + 0.2, 0.2, zc + 0.04), 0.06, 8, "detail_dark", caps=False)
    # tip: umbilical plate with a quick-disconnect cluster
    mb.box((0.30, 0.9, 0.9), "engine_metal", center=(-length - 0.05, 0, zc), taper=0.9)
    if mb.want(0):
        for dy, dz in ((-0.25, -0.2), (0.25, -0.2), (0.0, 0.22)):
            mb.cyl((-length - 0.2, dy, zc + dz), (-length - 0.45, dy, zc + dz), 0.09, 10, "detail_dark")
    ctx.empty("pivot", (0.0, 0.0, zc))
    ctx.empty("tip", (-length - 0.5, 0.0, zc))
    _world_meta(ctx, length, ["pivot", "tip"], arm_length_m=length, reach_axis="-X",
                value_types=dict(arm_length_m=GAME, length_m=GAME))


def gen_crew_access_arm(ctx):
    mb = ctx.mesh()
    length, zc = 8.4, 1.3
    mb.box((0.7, 0.7, 3.2), "gantry", center=(0, 0, 1.6))
    seg = mb.seg(16, 8)
    mb.lathe([(0.0, zc - 0.5), (0.38, zc - 0.5), (0.38, zc + 0.5), (0.0, zc + 0.5)], seg, "engine_metal", crease=40.0)
    # enclosed walkway: ceramic shell, navy base frame, dark windows
    mb.box((length - 2.0, 1.6, 2.0), "hull", center=(-(length - 2.0) / 2.0 - 0.4, 0, zc + 0.1), taper=0.95)
    mb.box((length - 2.0, 1.7, 0.2), "gantry", center=(-(length - 2.0) / 2.0 - 0.4, 0, zc - 0.95))
    # white room at the tip
    mb.box((2.4, 2.4, 2.4), "hull", center=(-length + 1.0, 0, zc + 0.3), taper=0.95)
    mb.box((0.10, 1.5, 1.7), "detail_dark", center=(-length - 0.22, 0, zc + 0.35))   # hatch frame
    mb.box((2.6, 2.6, 0.2), "gantry", center=(-length + 1.0, 0, zc - 0.95))
    if mb.want(0):
        for i in range(4):
            xw = -1.4 - i * 1.3
            mb.box((0.7, 0.04, 0.5), "detail_dark", center=(xw, 0.81, zc + 0.35))
            mb.box((0.7, 0.04, 0.5), "detail_dark", center=(xw, -0.81, zc + 0.35))
        mb.box((2.4, 0.04, 0.3), "livery", center=(-length + 1.0, 1.22, zc + 0.8))
        mb.box((2.4, 0.04, 0.3), "livery", center=(-length + 1.0, -1.22, zc + 0.8))
        mb.cyl((-length + 0.9, 1.0, zc - 0.85), (-length + 0.9, 1.0, 0.1), 0.05, 8, "engine_metal")
        mb.cyl((-length + 0.9, -1.0, zc - 0.85), (-length + 0.9, -1.0, 0.1), 0.05, 8, "engine_metal")
    ctx.empty("pivot", (0.0, 0.0, zc))
    ctx.empty("tip", (-length - 0.3, 0.0, zc + 0.35))
    _world_meta(ctx, length, ["pivot", "tip"], arm_length_m=length, reach_axis="-X",
                value_types=dict(arm_length_m=GAME, length_m=GAME))


def gen_lightning_mast(ctx):
    mb = ctx.mesh()
    h, r_base, r_top = 30.0, 1.4, 0.55
    n_leg = 3
    s = mb.seg(6, 4)
    bays = 6

    def leg_pt(k, z):
        r = r_base + (r_top - r_base) * z / h
        a = math.tau * k / n_leg + math.pi / 2.0
        return (r * math.cos(a), r * math.sin(a), z)

    # footing
    mb.cyl((0, 0, 0), (0, 0, 0.6), 2.0, mb.seg(24, 12), "concrete", r1=1.7)
    zs = [h * i / bays for i in range(bays + 1)]
    for k in range(n_leg):
        mb.strut(leg_pt(k, 0.6), leg_pt(k, h), 0.07, "gantry", seg=s)
    for i in range(bays):
        for k in range(n_leg):
            k2 = (k + 1) % n_leg
            a, b = leg_pt(k, zs[i] if i else 0.6), leg_pt(k2, zs[i + 1])
            mb.strut(a, b, 0.035, "gantry", seg=s)
            if mb.want(0):
                mb.strut(leg_pt(k, zs[i + 1]), leg_pt(k2, zs[i + 1]), 0.035, "gantry", seg=s)
    mb.cyl((0, 0, h), (0, 0, h + 3.0), 0.06, 8, "engine_metal", r1=0.025)
    mb.sphere((0, 0, h + 3.02), 0.06, 6, 3, "engine_metal")
    ctx.empty("lightning_tip", (0.0, 0.0, h + 3.1))
    _world_meta(ctx, h + 3.1, ["lightning_tip"], mast_height_m=h, base_radius_m=r_base,
                value_types=dict(mast_height_m=GAME, base_radius_m=GAME, length_m=GAME))


register("world_pad_deck", "world_pad", gen_pad_deck, "6.1, 7.1")
register("world_flame_trench", "world_pad", gen_flame_trench, "6.1, 7.1")
register("world_gantry_base", "world_pad", gen_gantry_base, "6.1")
register("world_gantry_segment", "world_pad", gen_gantry_segment, "6.1")
register("world_gantry_crown", "world_pad", gen_gantry_crown, "6.1")
register("world_crane_arm", "world_pad", gen_crane_arm, "6.1")
register("world_umbilical_arm", "world_pad", gen_umbilical_arm, "6.1")
register("world_crew_access_arm", "world_pad", gen_crew_access_arm, "6.1, 7.4")
register("world_lightning_mast", "world_pad", gen_lightning_mast, "6.1, 7.1")
