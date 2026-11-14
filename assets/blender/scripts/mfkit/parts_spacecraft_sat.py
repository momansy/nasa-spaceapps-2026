"""Earth-observation satellite (family 5 of T017; design 7.2.1, style guide satellite).

One compact insulated bus (thermal blanket), a nadir-facing instrument aperture (barrel with hood) and a
separate communications dish on a boom, in three power variants. Frame: origin at the separation ring
centre, +Z launch axis, nadir = +Y (empties `aperture` and `antenna` point along +Y). stack=False.

Wings (deployable and large variants) are separable sub-objects authored deployed:
  wing_l / wing_r              inner panel + yoke, hinge empties hinge_wing_l / hinge_wing_r (axis +Z)
  wing_l_outer / wing_r_outer  outer panel, fold empties fold_wing_l / fold_wing_r (axis +Z)
Stowed pose (all rotations about the empty's local +Z): wing_l +90 deg, wing_r -90 deg about the hinge, then
wing_l_outer +180 deg / wing_r_outer -180 deg about the fold empty. The wing then lies flat on the bus side.
"""
from __future__ import annotations

import math

from . import spec
from .pipeline import register

GAME = "game_value"
REAL = "real_world_approximate"


def _panel(mb, cx, cy, cz, length, chord, th=0.03):
    """Solar panel: frame plus cells on both faces, spanning x (length) and z (chord)."""
    mb.box((length, th, chord), "engine_metal", center=(cx, cy, cz))
    mb.box((length - 0.06, th + 0.014, chord - 0.06), "solar_cell", center=(cx, cy, cz))


def gen_sat(ctx, part_id):
    mb = ctx.mesh()
    bx, by, bz = spec.SAT_BUS
    rr, rh = spec.SAT_RING_R, spec.SAT_RING_H
    z0, z1 = rh, rh + bz
    zc = (z0 + z1) / 2.0
    seg = mb.seg(40, 16)
    # separation ring and clamp-band flange
    mb.lathe([(rr, 0.0), (rr, rh * 0.75), (rr - 0.05, rh), (rr - 0.12, rh), (rr - 0.12, 0.02), (rr - 0.02, 0.0)], seg, "engine_metal", crease=40.0)
    mb.band(rr, rh * 0.30, rh * 0.62, 0.02, seg, "detail_dark")
    # bus: insulated body, battens and plates
    mb.box((bx, by, bz), "thermal", center=(0, 0, zc))
    for sx in (-1, 1):
        for sy in (-1, 1):
            mb.box((0.04, 0.04, bz + 0.02), "hull", center=(sx * (bx / 2.0 - 0.01), sy * (by / 2.0 - 0.01), zc))
    mb.box((bx + 0.02, by + 0.02, 0.03), "hull", center=(0, 0, z0 + 0.005))
    mb.box((bx + 0.02, by + 0.02, 0.03), "hull", center=(0, 0, z1 - 0.005))
    if mb.want(0):
        mb.box((bx * 0.8, 0.012, bz * 0.7), "hull", center=(0, -by / 2.0 - 0.004, zc))        # radiator (-Y)
        for k in (-2, -1, 0, 1, 2):
            mb.box((0.012, 0.014, bz * 0.7), "detail_dark", center=(k * bx * 0.15, -by / 2.0 - 0.008, zc))
        mb.box((0.14, 0.14, 0.10), "detail_dark", center=(-0.12, -0.10, z1 + 0.05))           # star tracker baffle
        mb.cyl((-0.12, -0.10, z1 + 0.10), (-0.12, -0.10, z1 + 0.18), 0.05, mb.seg(12, 6), "detail_dark", r1=0.07)
    # nadir instrument aperture: barrel, hood, lens
    ax, az = 0.08, zc + 0.08
    y0 = by / 2.0
    mb.cyl((ax, y0, az), (ax, y0 + 0.18, az), 0.15, mb.seg(24, 10), "hull")
    mb.cyl((ax, y0 + 0.18, az), (ax, y0 + 0.25, az), 0.15, mb.seg(24, 10), "detail_dark", r1=0.18, caps=(False, False))
    mb.cyl((ax, y0 + 0.08, az), (ax, y0 + 0.085, az), 0.135, mb.seg(24, 10), "detail_dark")
    # communications dish on a short boom (nadir facing, distinct from the aperture)
    dx, dz = -0.19, z0 + 0.17
    mb.cyl((dx, y0, dz), (dx, y0 + 0.11, dz), 0.025, mb.seg(8, 5), "engine_metal")
    with mb.xform(loc=(dx, y0 + 0.11, dz), rot_x=-math.pi / 2.0):
        mb.dome(0.14, 0.05, 0.0, mb.seg(20, 8), 3, "hull", up=False, flip=True)
        mb.cyl((0, 0, 0.0), (0, 0, 0.09), 0.012, 6, "engine_metal")
    ctx.empty("aperture", (ax, y0 + 0.25, az))
    ctx.empty("antenna", (dx, y0 + 0.16, dz))
    ctx.empty("separation_ring", (0.0, 0.0, 0.0))

    required = ["aperture", "antenna"]
    ctx.meta.update(nadir_axis="+Y", aperture_axis=[0, 1, 0], antenna_axis=[0, 1, 0], bus_size_m=list(spec.SAT_BUS),
                    twin="Landsat-type small Earth-observation satellite (150 kg class)")
    span = bx
    if part_id == "satpwr_body_mounted_solar_cells":
        for sx in (-1, 1):                                    # cell strings on the +-X faces, the -Y face and the top
            mb.box((0.012, by - 0.10, bz - 0.12), "solar_cell", center=(sx * (bx / 2.0 + 0.004), 0, zc))
        mb.box((bx - 0.10, 0.012, bz * 0.18), "solar_cell", center=(0, -by / 2.0 - 0.004, z1 - 0.10))
        mb.box((bx - 0.10, by - 0.10, 0.012), "solar_cell", center=(0, 0.0, z1 + 0.012))
        ctx.meta.update(power_variant="body_mounted_cells", wings=False)
    else:
        chord = spec.SAT_WING_CHORD[part_id]
        pl = spec.SAT_WING_PANEL_L
        yh = by / 2.0 - 0.03
        zw = zc if chord < bz + 0.2 else z0 + 0.06 + chord / 2.0
        hx = bx / 2.0 + 0.05                                   # hinge distance from the axis
        gap = 0.03
        for side, name in ((-1, "l"), (1, "r")):
            sm = ctx.mesh(f"wing_{name}")
            so = ctx.mesh(f"wing_{name}_outer")
            sm.box((0.07, 0.05, 0.22), "engine_metal", center=(side * (bx / 2.0 + 0.025), yh, zw))             # yoke
            sm.box((0.06, 0.06, 0.14), "engine_metal", center=(side * hx, yh, zw))                              # hinge knuckle
            _panel(sm, side * (hx + 0.03 + pl / 2.0), yh, zw, pl, chord)
            x_fold = side * (hx + 0.03 + pl + gap / 2.0)
            so.box((gap + 0.02, 0.05, 0.14), "engine_metal", center=(x_fold, yh, zw))
            _panel(so, side * (hx + 0.03 + pl + gap + pl / 2.0), yh, zw, pl, chord)
            ctx.empty(f"hinge_wing_{name}", (side * hx, yh, zw), sub=f"wing_{name}")
            ctx.empty(f"fold_wing_{name}", (x_fold, yh, zw), sub=f"wing_{name}_outer")
            required += [f"hinge_wing_{name}", f"fold_wing_{name}"]
        span = 2.0 * (hx + 0.03 + 2 * pl + gap)
        large = part_id == "satpwr_large_deployable_array"
        if large:                                              # big battery module on the radiator side
            mb.box((0.40, 0.14, 0.34), "thermal", center=(0, -by / 2.0 - 0.07, z0 + 0.22))
            mb.box((0.44, 0.02, 0.38), "hull", center=(0, -by / 2.0 - 0.15, z0 + 0.22))
        ctx.meta.update(power_variant="large_deployable_array" if large else "deployable_wings", wings=True,
                        wing_panel_count=2, wing_panel_length_m=pl, wing_chord_m=chord, wing_span_deployed_m=round(span, 3),
                        wings_authored="deployed", wing_stowed_angle_deg=90.0,
                        wing_stow=dict(hinge_deg={"wing_l": 90.0, "wing_r": -90.0}, fold_deg={"wing_l_outer": 180.0, "wing_r_outer": -180.0},
                                       axis="+Z of hinge_wing_* / fold_wing_*"))
    top = z1 + (0.18 if mb.want(0) else 0.0)
    ctx.meta.update(length_m=round(max(top, z1 + 0.03), 3), stack=False, ring_check=False, required_empties=required,
                    max_diameter_m=round(span, 3), separation_ring_radius_m=rr,
                    value_types=dict(length_m=GAME, bus_size_m=GAME, separation_ring_radius_m=REAL, wing_chord_m=GAME,
                                     wing_panel_length_m=GAME))


for _pid in ("satpwr_body_mounted_solar_cells", "satpwr_deployable_solar_wings", "satpwr_large_deployable_array"):
    register(_pid, "spacecraft_sat", (lambda p: (lambda ctx: gen_sat(ctx, p)))(_pid), "7.2.1")
