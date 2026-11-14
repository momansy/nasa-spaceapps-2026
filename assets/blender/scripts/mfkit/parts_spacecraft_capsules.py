"""Capsules and heat shields (family 3 of T017; design 7.2.2, 7.3).

Capsule frame: origin = centre of the bottom mating ring (a kit stack diameter), +Z up. A short
adapter skirt flares from the ring to the capsule diameter, the heat shield (separable sub-object
`heatshield`) bulges downward inside it, the blunt cone rises above, docking ring on top.
`cap_deep_space` adds the separable `service_module` between ring and capsule.
Empties: attach_top (docking ring / escape-tower mount), attach_pod_1..4 (pusher pods on the cone,
outward radial), parachute_bay (forward bay cover).

Heat-shield meshes `tps_<type>__<cap id>`: origin at the shield apex, rim plane at z = depth,
empty `capsule_rim`. `tps_<type>` is the phone card: cap_standard exploded above its shield.
"""
from __future__ import annotations

import math

from . import spec
from .pipeline import register

GAME = "game_value"
REAL = "real_world_approximate"
TAU = math.tau
TAN_C = math.tan(math.radians(spec.CAPSULE_CONE_DEG))
LIFT = 0.04     # shield seams and tiles stand up to 0.04 m proud of the dish; the dish apex sits this high so z >= 0


# --------------------------------------------------------------------------- geometry helpers
class Cap:
    """Derived dimensions of one capsule."""

    def __init__(self, cap_id):
        c = spec.CAPSULES[cap_id]
        self.id, self.d, self.ring_d, self.service = cap_id, c["d"], c["ring_d"], c["service"]
        self.R = self.d / 2.0
        self.Rc = spec.CAPSULE_SHIELD_RC * self.d
        self.depth = self.Rc - math.sqrt(self.Rc ** 2 - self.R ** 2)       # shield dish depth, m
        self.skirt = 0.0 if self.service else round(self.depth + 0.3, 3)  # adapter skirt height below the shield rim
        self.sm_top = (0.55 + self.service) if self.service else 0.0
        self.rim_z = self.sm_top + (0.2 + self.depth if self.service else self.skirt)   # shield rim plane
        self.r_top = 0.34 * self.R
        self.lip = 0.10 * self.R
        self.h_cone = (self.R - self.r_top) / TAN_C
        self.z_cone0 = self.rim_z + self.lip
        self.z_cone1 = self.z_cone0 + self.h_cone
        self.r_dock = 0.27 * self.R
        self.bay_h = 0.12 * self.R
        self.ring_h = 0.16 * self.R
        self.length = self.z_cone1 + self.bay_h + self.ring_h

    def cone_r(self, z):
        return self.R - (z - self.z_cone0) * TAN_C


def dish_profile(R, Rc, n, shoulder=0.07):
    """(r, z) from the apex (0, 0) outward to the rim (R, depth). Faces DOWN (outward of the shield)."""
    depth = Rc - math.sqrt(Rc ** 2 - R ** 2)
    rs = R * (1.0 - shoulder)
    pts = []
    for i in range(n + 1):
        r = rs * i / n
        pts.append((r, Rc - math.sqrt(Rc ** 2 - r ** 2)))
    zs = pts[-1][1]
    for k in (1, 2, 3):                                                   # rounded shoulder up to the rim
        a = (math.pi / 2.0) * k / 3.0
        pts.append((rs + (R - rs) * math.sin(a), zs + (depth - zs) * (1 - math.cos(a))))
    return pts, depth


def _surface_pt(R, Rc, r):
    return r, Rc - math.sqrt(Rc ** 2 - r ** 2)


def build_shield(mb, kind, D, z0=0.0):
    """Shield of one TPS type. The dish apex is LIFT above z0 and the rim plane at z0 + depth, where
    the returned depth already includes LIFT. Returns (depth, extent_radius)."""
    z0 = z0 + LIFT
    R = D / 2.0
    Rc = spec.CAPSULE_SHIELD_RC * D
    if kind == "inflatable_decelerator":
        d_, e_ = _build_inflatable(mb, D * spec.TPS_INFLATED_SCALE, z0)
        return d_ + LIFT, e_
    seg = mb.seg(48, 24)
    prof, depth = dish_profile(R, Rc, mb.steps(10, 5))
    base = [(r, z + z0) for r, z in prof]
    mb.lathe(base, seg, "heat_shield", crease=60.0)
    # backing flange so the shield is closed seen from behind
    mb.lathe([(R, z0 + depth), (0.0, z0 + depth)], seg, "detail_dark", flip=False)
    if not mb.want(0):
        return depth, R
    off = 0.012

    def on_dish(r):
        r_, z_ = _surface_pt(R, Rc, r)
        return r_, z_ + z0

    if kind == "avcoat_ablator":
        # fine honeycomb read: concentric seams and radial seams, dark filled cells
        for f in (0.22, 0.42, 0.62, 0.80):
            r0 = R * f
            a = on_dish(r0)
            mb.lathe([(a[0], a[1] - off), (a[0] + 0.012, a[1] - off - 0.004)], seg, "detail_dark")
            mb.torus(a[0], 0.012, a[1] - off * 0.5, seg, 4, "detail_dark")
        with mb.radial(16):
            for i in range(9):
                p, q = on_dish(R * (0.1 + 0.8 * i / 9)), on_dish(R * (0.1 + 0.8 * (i + 1) / 9))
                mb.strut((p[0], 0.0, p[1] - off), (q[0], 0.0, q[1] - off), 0.010, "detail_dark", seg=4)
    elif kind == "pica_ablator":
        # chunky tiles: three rings of raised blocks, light tile faces over dark gaps
        for ring, (fa, fb, n) in enumerate(((0.12, 0.40, 8), (0.42, 0.70, 16), (0.72, 0.93, 24))):
            ra, rb = R * fa, R * fb
            sweep = TAU / n * 0.88
            prof_t = [(on_dish(ra + (rb - ra) * j / 3)[0], on_dish(ra + (rb - ra) * j / 3)[1] - 0.035) for j in range(4)]
            with mb.radial(n):
                mb.lathe(prof_t, 1, "ground", crease=179.0, sweep=(0.0, sweep))
    else:  # reusable_ceramic_tiles
        # square-ish black tile mosaic: many small raised sectors in five rings
        for fa, n in ((0.10, 8), (0.28, 18), (0.46, 28), (0.64, 38), (0.82, 46)):
            ra, rb = R * fa, R * (fa + 0.16)
            sweep = TAU / n * 0.90
            prof_t = [(on_dish(ra + (rb - ra) * j / 2)[0], on_dish(ra + (rb - ra) * j / 2)[1] - 0.025) for j in range(3)]
            with mb.radial(n):
                mb.lathe(prof_t, 1, "detail_dark", crease=179.0, sweep=(0.0, sweep))
    return depth + LIFT, R


def _build_inflatable(mb, D_inf, z0):
    """Inflated torus stack (LOFTID class) over a flexible TPS cone. Apex at z0, rim at z0 + depth."""
    R = D_inf / 2.0
    n = 5
    minor = R * 0.105
    slope = math.tan(math.radians(20.0))
    seg = mb.seg(40, 20)
    cover_r = lambda r: z0 + r * slope
    # flexible heat-shield cone (face, outward = down)
    prof = [(R * f, cover_r(R * f)) for f in (0.0, 0.35, 0.7, 1.0)]
    mb.lathe(prof, seg, "heat_shield", crease=80.0)
    for i in range(n):
        r = R * (0.30 + 0.70 * i / (n - 1)) - minor * 0.4
        mb.torus(r, minor, cover_r(r) + minor, seg, mb.seg(8, 5), "hull")
    depth = cover_r(R) + minor - z0
    mb.lathe([(R, cover_r(R) + 2 * minor), (0.0, cover_r(0.0) + 2 * minor + R * slope * 0.2)], seg, "hull", flip=True)
    return depth, R


def _shield_depth(kind, c):
    """Rim height above z0 of the shield (dish depth + LIFT; inflated stacks are only used on the card)."""
    return c.depth + LIFT, c.R


# --------------------------------------------------------------------------- capsule
def build_capsule(ctx, cap_id, *, shield="avcoat_ablator", z0=0.0, own_shield=True):
    c = Cap(cap_id)
    mb = ctx.mesh()
    seg = mb.seg(56, 24)
    R, rr = c.R, c.ring_d / 2.0

    def at(z):
        return z + z0

    # ---- adapter skirt (deep space: the service module below carries the ring)
    if not c.service:
        mb.lathe([(rr, at(0.0)), (R * 0.98, at(c.skirt)), (R * 0.98 - 0.03, at(c.skirt)), (rr - 0.03, at(0.0))], seg, "hull", crease=45.0)
        mb.torus(R * 0.985, 0.03, at(c.skirt), seg, 6, "engine_metal")
    else:  # crew-module base wall between the service-module deck and the shield rim
        mb.lathe([(R, at(c.sm_top)), (R, at(c.rim_z)), (R - 0.03, at(c.rim_z)), (R - 0.03, at(c.sm_top))], seg, "hull", crease=45.0)
    # ---- blunt cone: lip, cone, forward bay, docking ring
    z_bay = c.z_cone1
    prof = [(R, at(c.rim_z)), (R, at(c.z_cone0)), (c.r_top, at(z_bay)), (c.r_top, at(z_bay + c.bay_h)),
            (c.r_dock, at(z_bay + c.bay_h)), (c.r_dock, at(c.length)), (0.0, at(c.length))]
    mb.lathe(prof, seg, "hull", crease=25.0)
    mb.lathe([(c.r_top * 1.02, at(z_bay + 0.01)), (c.r_top * 1.02, at(z_bay + c.bay_h * 0.8))], seg, "livery")
    mb.torus(c.r_dock, 0.035, at(c.length - c.ring_h * 0.5), seg, 6, "engine_metal")
    # ---- livery bands and shoulder trim
    e = 0.012
    for fa, fb in ((0.10, 0.17), (0.82, 0.88)):
        za, zb = c.z_cone0 + fa * c.h_cone, c.z_cone0 + fb * c.h_cone
        mb.lathe([(c.cone_r(za) + e, at(za)), (c.cone_r(zb) + e, at(zb))], seg, "livery")
    mb.torus(R * 0.995, 0.035, at(c.z_cone0), seg, 6, "engine_metal")
    # ---- windows, hatch and RCS pads on the cone
    n_win = 4 if cap_id != "cap_compact" else 2
    zm = c.z_cone0 + 0.46 * c.h_cone
    rm = c.cone_r(zm)
    tilt = -math.radians(spec.CAPSULE_CONE_DEG)
    ws = 0.10 * R
    with mb.radial(n_win, phase=math.radians(90.0 + 45.0 if n_win == 4 else 90.0)):
        with mb.xform(loc=(rm, 0, at(zm)), rot_y=tilt):
            mb.box((0.05, ws * 1.6, ws * 1.9), "detail_dark", center=(0, 0, 0))
            if mb.want(0):
                mb.box((0.03, ws * 2.1, ws * 2.4), "engine_metal", center=(-0.01, 0, 0))
    zh = c.z_cone0 + 0.30 * c.h_cone
    with mb.xform(loc=(c.cone_r(zh), 0, at(zh)), rot_y=tilt):          # side hatch (azimuth 0)
        mb.box((0.05, ws * 2.6, ws * 3.2), "livery", center=(0, 0, 0))
        mb.box((0.04, ws * 1.4, ws * 1.8), "detail_dark", center=(0.015, 0, 0))
    if mb.want(0):
        zt = c.z_cone0 + 0.74 * c.h_cone
        with mb.radial(4, phase=math.pi / 4.0):
            with mb.xform(loc=(c.cone_r(zt), 0, at(zt)), rot_y=tilt):
                mb.box((0.06, ws * 1.0, ws * 1.0), "engine_metal", center=(0, 0, 0))
    # ---- heat shield sub-object
    if own_shield:
        sm = ctx.mesh("heatshield")
        _d, _ = _shield_depth(shield, c)
        build_shield(sm, shield, c.d, z0=at(c.rim_z - _d))
    # ---- service module (deep-space)
    if c.service:
        _service_module(ctx, c, z0)
    # ---- attach points
    ctx.empty("attach_top", (0.0, 0.0, at(c.length)))
    zp = c.z_cone0 + 0.28 * c.h_cone
    for i in range(4):
        a = math.radians(45.0 + 90.0 * i)
        ctx.empty(f"attach_pod_{i + 1}", (c.cone_r(zp) * math.cos(a), c.cone_r(zp) * math.sin(a), at(zp)))
    ctx.empty("parachute_bay", (0.0, 0.0, at(z_bay + c.bay_h)))
    ctx.meta.update(length_m=round(c.length + z0, 4), diameter_bottom_m=c.ring_d, diameter_top_m=round(2 * c.r_dock, 4),
                    capsule_diameter_m=c.d, shield_depth_m=round(c.depth, 3), cone_half_angle_deg=spec.CAPSULE_CONE_DEG,
                    shield_sphere_radius_m=round(c.Rc, 3), mating_ring_key=spec.dkey(c.ring_d), twin=spec.CAPSULES[cap_id]["twin"],
                    value_types=dict(capsule_diameter_m=GAME, diameter_bottom_m=GAME, shield_depth_m=GAME,
                                     cone_half_angle_deg=REAL, shield_sphere_radius_m=REAL, length_m=GAME))
    return c


def _service_module(ctx, c, z0):
    sm = ctx.mesh("service_module")
    rr, R, zt = c.ring_d / 2.0, c.R, c.sm_top
    seg = sm.seg(56, 24)
    sm.lathe([(rr, z0), (R, z0 + 0.55), (R, z0 + zt), (R * 0.96, z0 + zt), (R * 0.96, z0 + 0.58), (rr - 0.03, z0 + 0.03)],
             seg, "hull", crease=45.0)
    sm.lathe([(R * 0.96, z0 + zt), (0.0, z0 + zt)], seg, "detail_dark")
    for zb in (0.8, zt - 0.25):
        sm.band(R, z0 + zb, z0 + zb + 0.18, 0.02, seg, "livery")
    # main engine bell inside the adapter (nozzle exit above the ring plane)
    sm.lathe([(0.55, z0 + 0.4), (0.12, z0 + 1.7)], sm.seg(28, 12), "engine_metal")
    sm.lathe([(0.10, z0 + 1.7), (0.52, z0 + 0.42)], sm.seg(28, 12), "nozzle_hot", heat=0.3)
    # radiators (azimuths 0, 90, 180, 270) and solar wings (45, 135, ...)
    with sm.radial(4):
        sm.box((0.07, 1.7, 2.7), "hull", center=(R + 0.04, 0, z0 + 0.55 + (zt - 0.55) * 0.5))
        if sm.want(0):
            for k in (-1, 0, 1):
                sm.box((0.04, 0.05, 2.5), "detail_dark", center=(R + 0.09, k * 0.5, z0 + 0.55 + (zt - 0.55) * 0.5))
    spec_c = spec.CAPSULES[c.id]
    wl, ww = spec_c["wing_len"], spec_c["wing_w"]
    zc = z0 + 0.55 + (zt - 0.55) * 0.5
    n_pan, gap, th = 3, 0.10, 0.05
    pl = (wl - gap * (n_pan - 1)) / n_pan
    with sm.radial(4, phase=math.pi / 4.0):
        sm.box((0.5, 0.3, 0.3), "engine_metal", center=(R + 0.25, 0, zc))                 # hinge fitting
        for i in range(n_pan):
            x0 = R + 0.5 + i * (pl + gap)
            sm.box((pl, th, ww), "engine_metal", center=(x0 + pl / 2, 0, zc))
            sm.box((pl - 0.12, th + 0.02, ww - 0.12), "solar_cell", center=(x0 + pl / 2, 0, zc))
        sm.strut((R + 0.4, 0, zc - ww / 2 + 0.05), (R + wl + 0.2, 0, zc - ww / 2 + 0.05), 0.03, "engine_metal", seg=4)
    for i in range(4):
        a = math.radians(45.0 + 90.0 * i)
        ctx.empty(f"hinge_wing_{i + 1}", ((R + 0.25) * math.cos(a), (R + 0.25) * math.sin(a), zc), sub="service_module")
    ctx.empty("service_module_top", (0.0, 0.0, z0 + zt), sub="service_module")
    ctx.meta.update(service_module_length_m=c.service, wing_span_m=wl, wing_count=4, wings_authored="deployed",
                    wing_stowed_angle_deg=90.0, wing_hinge_axis="tangent (local Z of each wing plane)")


def gen_capsule(ctx, cap_id):
    build_capsule(ctx, cap_id)


for _cap in spec.CAPSULES:
    register(_cap, "spacecraft_capsule", (lambda cid: (lambda ctx: gen_capsule(ctx, cid)))(_cap), "7.2.2")


# --------------------------------------------------------------------------- heat-shield parts
def _tps_meta(ctx, kind, d, depth, extent, cap=None):
    ctx.meta.update(length_m=round(depth, 4), stack=False, ring_check=False, required_empties=["capsule_rim"],
                    shield_type=kind, shield_diameter_m=round(d, 3), shield_extent_diameter_m=round(2 * extent, 3),
                    max_diameter_m=round(2 * extent, 3), depth_m=round(depth, 4), capsule=cap,
                    value_types=dict(shield_diameter_m=GAME, depth_m=GAME, length_m=GAME))


def gen_tps_for_cap(ctx, kind, cap_id):
    c = Cap(cap_id)
    depth, extent = build_shield(ctx.mesh(), kind, c.d)
    ctx.empty("capsule_rim", (0.0, 0.0, depth))
    _tps_meta(ctx, kind, c.d, depth, extent, cap_id)


def gen_tps_card(ctx, kind):
    """Phone card: cap_standard (no shield of its own) exploded above the chosen shield."""
    c = Cap("cap_standard")
    depth, extent = build_shield(ctx.mesh(), kind, c.d, z0=0.0)
    gap = 0.9
    z0 = depth + gap   # depth already includes LIFT; the capsule skirt starts above the shield
    build_capsule(ctx, "cap_standard", own_shield=False, z0=z0)
    ctx.empty("capsule_rim", (0.0, 0.0, depth))
    ctx.meta.update(stack=False, ring_check=False, required_empties=["capsule_rim"], shield_type=kind,
                    card_for="cap_standard", exploded_gap_m=gap, max_diameter_m=round(2 * extent, 3))


for _t in spec.TPS_TYPES:
    register(f"tps_{_t}", "spacecraft_tps_card", (lambda k: (lambda ctx: gen_tps_card(ctx, k)))(_t), "7.3")
    for _cap in spec.CAPSULES:
        register(f"tps_{_t}__{_cap}", "spacecraft_tps", (lambda k, cid: (lambda ctx: gen_tps_for_cap(ctx, k, cid)))(_t, _cap), "7.3")
