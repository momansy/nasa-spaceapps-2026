"""Launch-site prop sets and phone dioramas (family 2 of T017; design 7.1).

Props are `stack=False` world parts named `world_site_<site>_<prop>`: origin at ground level in
the middle of the footprint, +Z up, all geometry z >= 0. They are deliberately modest (<= 5 000
triangles at LOD0) so a site reads from the Build Bay camera without pulling the eye from the
vehicle. Each launch-site id additionally exports a phone diorama (`site_<...>`: pad, trench,
a short gantry and that site's props on a ground disc, <= 8 000 triangles). All layout numbers
are game_value; the real places that inspired the silhouettes are named in comments.
"""
from __future__ import annotations

import math
import random

from . import spec
from .parts_world import gen_flame_trench, gen_gantry_base, gen_gantry_crown, gen_gantry_segment, gen_lightning_mast, gen_pad_deck
from .pipeline import register

GAME = "game_value"
TAU = math.tau


def _meta(ctx, footprint, height, **extra):
    ctx.meta.update(length_m=round(footprint, 2), height_m=round(height, 2), stack=False, ring_check=False,
                    required_empties=[], max_diameter_m=round(footprint, 2),
                    value_types=dict(length_m=GAME, height_m=GAME), **extra)


class _Sub:
    """Lets a generator of another part draw into a shared MeshBuilder (diorama composition)."""

    def __init__(self, mb):
        self._mb, self.lod, self.meta, self.params, self.id = mb, mb.lod, {}, {}, "sub"

    def mesh(self, sub=""):
        return self._mb

    def empty(self, *_a, **_k):
        pass


def _leaf(mb, pts, mat):
    """Two-sided flat leaf from a convex polygon (counter-clockwise from above)."""
    mb.face(pts, mat)
    mb.face(list(reversed(pts)), mat)


# --------------------------------------------------------------------------- primitives
def _palm(mb, x, y, h, lean, rng, fronds=7):
    """Palm: bent trunk (3 sections) and drooping fronds. Coconut palm class, about 12 m."""
    a = rng.uniform(0, TAU)
    dx, dy = math.cos(a) * lean, math.sin(a) * lean
    pts = [(x + dx * h * t * t, y + dy * h * t * t, h * t + 0.03) for t in (0.0, 0.34, 0.68, 1.0)]
    s = mb.seg(6, 5)
    for i in range(3):
        mb.cyl(pts[i], pts[i + 1], 0.30 - 0.07 * i, s, "heat_shield", r1=0.30 - 0.07 * (i + 1), caps=False)
    cx, cy, cz = pts[-1]
    for k in range(fronds):
        b = TAU * k / fronds + rng.uniform(-0.2, 0.2)
        L = h * 0.42
        ux, uy = math.cos(b), math.sin(b)
        px, py = -uy, ux
        w = L * 0.14
        base = (cx, cy, cz)
        mid = (cx + ux * L * 0.55, cy + uy * L * 0.55, cz + L * 0.20)
        tip = (cx + ux * L, cy + uy * L, cz - L * 0.22)
        _leaf(mb, [base, (mid[0] + px * w, mid[1] + py * w, mid[2]), tip, (mid[0] - px * w, mid[1] - py * w, mid[2])],
              "foliage")


def _clump(mb, x, y, r, h, seg=8, rings=4):
    """Rounded foliage mass (tree canopy / shrub) sitting on the ground."""
    mb.sphere((x, y, h * 0.5 + r * 0.15), r, mb.seg(seg, 6), rings, "foliage", scale=(1.0, 1.0, h / (2.0 * r)))


def _tuft(mb, x, y, h, rng, blades=4):
    """Grass tuft of thin two-sided triangles leaning outward."""
    for k in range(blades):
        a = TAU * k / blades + rng.uniform(0, 1.0)
        ux, uy = math.cos(a), math.sin(a)
        w = h * 0.09
        tip = (x + ux * h * 0.35, y + uy * h * 0.35, h * rng.uniform(0.75, 1.0))
        _leaf(mb, [(x - uy * w, y + ux * w, 0.0), (x + uy * w, y - ux * w, 0.0), tip], "foliage")


def _mound(mb, x, y, rx, ry, h, mat="ground", seg=12, rings=4, rot=0.0, z=0.0):
    """Low earth mound: upper hemisphere squashed into an ellipsoid."""
    with mb.xform(loc=(x, y, z), rot_z=rot):
        mb.sphere((0, 0, 0), 1.0, mb.seg(seg, 8), rings, mat, lat0=0.0, lat1=90.0, scale=(rx, ry, h))


def _building(mb, cx, cy, sx, sy, h, rot=0.0, roof=1.0, door=None, mat_wall="hull", stripe=True):
    """Hall: walls, low-pitch gable roof along Y, big door on the -Y face, navy base stripe."""
    with mb.xform(loc=(cx, cy, 0.0), rot_z=rot):
        mb.box((sx, sy, h), mat_wall, center=(0, 0, h / 2.0))
        ridge = (roof if roof > 0 else 0.01)
        gable = [(-sx / 2.0 - 0.3, 0.0), (sx / 2.0 + 0.3, 0.0), (sx / 2.0 + 0.3, 0.25), (0.0, ridge + 0.25),
                 (-sx / 2.0 - 0.3, 0.25)]
        # roof prism: polygon in (x, z) extruded along Y
        from mathutils import Matrix
        xz_to_y = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
        with mb.xform(loc=(0, 0, h)):
            mb.extrude_poly(gable, -sy / 2.0 - 0.3, sy / 2.0 + 0.3, "concrete", matrix=xz_to_y)
        if stripe:
            mb.box((sx + 0.1, sy + 0.1, 0.9), "gantry", center=(0, 0, 0.45))
        dw, dh = door or (sx * 0.34, h * 0.78)
        mb.box((dw, 0.3, dh), "detail_dark", center=(0, -sy / 2.0 - 0.02, dh / 2.0))
        mb.box((dw + 0.5, 0.2, 0.35), "engine_metal", center=(0, -sy / 2.0 - 0.08, dh + 0.18))


# --------------------------------------------------------------------------- equatorial (Kourou / Alcantara class)
def prop_palms(mb, rng, n=9):
    for i in range(n):
        a = TAU * i / n + rng.uniform(-0.3, 0.3)
        r = rng.uniform(2.0, 11.0)
        _palm(mb, math.cos(a) * r, math.sin(a) * r, rng.uniform(9.5, 13.5), rng.uniform(0.05, 0.16), rng)
    for i in range(5):
        a = rng.uniform(0, TAU)
        r = rng.uniform(4.0, 13.0)
        _clump(mb, math.cos(a) * r, math.sin(a) * r, rng.uniform(1.0, 1.6), rng.uniform(1.2, 2.0))


def prop_treeline(mb, rng, n=26, length=120.0):
    for i in range(n):
        x = -length / 2.0 + length * i / (n - 1)
        y = rng.uniform(-2.5, 2.5)
        r = rng.uniform(3.0, 4.8)
        _clump(mb, x, y, r, rng.uniform(8.0, 13.0), seg=8, rings=4)
        if i % 3 == 0:
            _clump(mb, x + rng.uniform(-2, 2), y + 3.0, r * 0.7, rng.uniform(4.0, 6.0), seg=7, rings=3)


def prop_hall(mb, rng):
    _building(mb, 0, 0, 40.0, 24.0, 14.0, roof=2.2, door=(14.0, 11.0))
    if mb.want(0):
        for i in range(-2, 3):
            mb.box((0.5, 24.2, 13.4), "gantry", center=(i * 8.0, 0, 7.0))
        mb.box((6.0, 8.0, 5.0), "hull", center=(23.0, -2.0, 2.5))          # lean-to annex


# --------------------------------------------------------------------------- subtropical coast (Cape Canaveral class)
def prop_dunes(mb, rng, n=7, tufts=60):
    for i in range(n):
        x = -42.0 + 84.0 * i / (n - 1) + rng.uniform(-4, 4)
        y = rng.uniform(-8.0, 8.0)
        _mound(mb, x, y, rng.uniform(9.0, 16.0), rng.uniform(6.0, 10.0), rng.uniform(1.6, 3.4), "concrete", rot=rng.uniform(0, 3.0))
    for i in range(tufts):
        _tuft(mb, rng.uniform(-48, 48), rng.uniform(-10, 10), rng.uniform(0.5, 1.0), rng, blades=3)


def prop_water_tower(mb, rng):
    h, r_leg = 24.0, 4.0
    s = mb.seg(8, 5)
    for k in range(6):
        a = TAU * k / 6
        mb.strut((math.cos(a) * r_leg, math.sin(a) * r_leg, 0.06), (math.cos(a) * r_leg * 0.72, math.sin(a) * r_leg * 0.72, h), 0.22, "concrete", seg=s)
    for z in (h * 0.33, h * 0.66):
        rr = r_leg * (1 - 0.28 * z / h)
        mb.torus(rr, 0.1, z, mb.seg(18, 10), 4, "engine_metal")
    mb.lathe([(0.0, h), (3.6, h), (4.4, h + 1.2), (4.7, h + 5.0), (4.0, h + 7.2), (0.0, h + 8.2)], mb.seg(28, 12), "hull",
             crease=50.0)
    mb.band(4.7, h + 3.0, h + 3.7, 0.1, mb.seg(28, 12), "livery")
    mb.cyl((0, 0, 0.0), (0, 0, h), 0.45, 8, "concrete")                      # riser pipe


def prop_assembly(mb, rng):
    """Large generic assembly building (VAB class, simplified): tall nave, low annexes, big door."""
    _building(mb, 0, 0, 52.0, 40.0, 56.0, roof=0.0, door=(16.0, 46.0), stripe=True)
    mb.box((70.0, 18.0, 14.0), "hull", center=(0, 29.0, 7.0))
    mb.box((52.5, 40.5, 1.4), "gantry", center=(0, 0, 40.0))
    mb.box((52.5, 40.5, 1.4), "gantry", center=(0, 0, 22.0))
    mb.box((6.0, 0.3, 40.0), "gantry", center=(-18.0, -20.1, 20.0))


# --------------------------------------------------------------------------- west-coast polar (Vandenberg class)
def prop_cliff_hills(mb, rng, n=7, cliff_len=140.0):
    """Coastal hills (rounded ground mounds) behind a cliff edge: a raised bluff with a rock face."""
    for i in range(n):
        x = -cliff_len / 2.0 + cliff_len * i / (n - 1)
        _mound(mb, x, rng.uniform(26.0, 32.0), rng.uniform(14.0, 22.0), rng.uniform(9.0, 13.0), rng.uniform(5.0, 11.0),
               "ground", seg=14, rings=4, rot=rng.uniform(0, 3.0), z=6.0)
    # cliff edge: a 6 m bluff with a jagged rock face (front) and a grassy top, 26 m deep
    pts = [(-cliff_len / 2.0, 0.0)]
    for i in range(1, 14):
        pts.append((-cliff_len / 2.0 + cliff_len * i / 13.0, rng.uniform(-2.5, 2.5) * (0.4 if i in (1, 13) else 1.0)))
    pts[-1] = (cliff_len / 2.0, 0.0)
    plate = pts + [(cliff_len / 2.0, 26.0), (-cliff_len / 2.0, 26.0)]
    plate = [(x, y + 8.0) for x, y in plate]
    mb.extrude_poly(plate, 0.0, 6.0, "concrete")
    mb.extrude_poly(plate, 6.0, 6.1, "ground")


def prop_blockhouse(mb, rng):
    """Blast-protected control blockhouse: bermed concrete box with a domed earth cover (Titan-era class)."""
    mb.box((18.0, 12.0, 5.0), "concrete", center=(0, 0, 2.5), taper=0.92)
    _mound(mb, 0, 3.0, 12.0, 9.0, 4.2, "ground", seg=14, rings=3)
    mb.box((8.0, 0.4, 2.2), "detail_dark", center=(0, -6.1, 1.8))
    mb.box((9.0, 0.5, 0.5), "engine_metal", center=(0, -6.2, 3.1))
    for sx in (-5.0, 5.0):
        mb.cyl((sx, -5.9, 5.0), (sx, -5.9, 7.2), 0.25, 8, "engine_metal")    # periscope masts
        mb.box((0.9, 0.6, 0.5), "detail_dark", center=(sx, -5.9, 7.4))


# --------------------------------------------------------------------------- inland steppe (Baikonur class)
def prop_grass(mb, rng, tufts=170, spread=70.0):
    for _ in range(tufts):
        a, r = rng.uniform(0, TAU), spread * math.sqrt(rng.uniform(0.02, 1.0))
        _tuft(mb, math.cos(a) * r, math.sin(a) * r, rng.uniform(1.0, 1.9), rng, blades=3)
    for _ in range(8):
        a, r = rng.uniform(0, TAU), rng.uniform(8, spread)
        _mound(mb, math.cos(a) * r, math.sin(a) * r, rng.uniform(3, 6), rng.uniform(3, 6), rng.uniform(0.3, 0.7), "foliage", seg=8, rings=2)


def prop_rail_erector(mb, rng, length=90.0, car_at=-6.0):
    """Standard-gauge-like rail (game_value 4.0 m track for readability), sleepers, erector car with a lowered boom."""
    gauge = 4.0
    for sx in (-1.0, 1.0):
        mb.box((0.35, length, 0.35), "engine_metal", center=(sx * gauge / 2.0, 0, 0.55))
    n = int(length / 1.8)
    for i in range(n):
        y = -length / 2.0 + (i + 0.5) * length / n
        mb.box((gauge + 1.4, 0.7, 0.35), "concrete", center=(0, y, 0.18))
    mb.box((gauge + 2.4, length, 0.3), "ground", center=(0, 0, 0.15))
    # erector car: flat bed on two bogies, cradle, folded erector boom
    y0 = car_at
    mb.box((6.0, 30.0, 1.0), "gantry", center=(0, y0, 2.0))
    for by in (-10.0, 10.0):
        mb.box((5.0, 5.0, 1.2), "detail_dark", center=(0, y0 + by, 1.0))
        for sx in (-1.0, 1.0):
            mb.cyl((sx * 2.0, y0 + by - 1.6, 0.8), (sx * 2.0, y0 + by + 1.6, 0.8), 0.7, mb.seg(10, 6), "engine_metal", caps=True)
    mb.box((4.4, 27.0, 1.2), "hull", center=(0, y0, 3.1), taper=0.9)
    for sy in (-1.0, 1.0):
        mb.strut((-2.0, y0 + sy * 13.0, 3.7), (-2.0, y0 + sy * 13.0, 6.5), 0.18, "engine_metal", seg=6)
        mb.strut((2.0, y0 + sy * 13.0, 3.7), (2.0, y0 + sy * 13.0, 6.5), 0.18, "engine_metal", seg=6)
    mb.strut((-1.6, y0 - 12.0, 6.5), (-1.6, y0 + 13.0, 4.2), 0.25, "livery", seg=6)
    mb.strut((1.6, y0 - 12.0, 6.5), (1.6, y0 + 13.0, 4.2), 0.25, "livery", seg=6)


def prop_drop_zone(mb, rng):
    """Drop-zone marker (booster / capsule landing area): flat painted ring and cross, four corner posts."""
    seg = mb.seg(36, 16)
    mb.lathe([(14.0, 0.06), (15.0, 0.06), (15.0, 0.12), (14.0, 0.12)], seg, "livery")
    mb.lathe([(1.2, 0.06), (3.0, 0.06), (3.0, 0.12), (1.2, 0.12)], seg, "livery")
    mb.box((30.0, 1.0, 0.1), "livery", center=(0, 0, 0.1))
    mb.box((1.0, 30.0, 0.1), "livery", center=(0, 0, 0.1))
    for sx in (-1, 1):
        for sy in (-1, 1):
            p = (sx * 16.5, sy * 16.5)
            mb.cyl((p[0], p[1], 0), (p[0], p[1], 3.0), 0.12, 8, "engine_metal")
            mb.box((0.7, 0.7, 0.5), "livery", center=(p[0], p[1], 3.2))


# --------------------------------------------------------------------------- registration of the props
PROPS = {
    # site key: [(prop name, generator, kwargs, footprint m, height m, seed)]
    "equatorial": [("palms", prop_palms, {}, 28.0, 17.0, 11), ("treeline", prop_treeline, {}, 124.0, 14.0, 12),
                   ("hall", prop_hall, {}, 48.0, 16.0, 13)],
    "subtropical": [("dunes", prop_dunes, {}, 100.0, 4.0, 21), ("water_tower", prop_water_tower, {}, 10.0, 33.0, 22),
                    ("assembly", prop_assembly, {}, 70.0, 57.0, 23)],
    "polar": [("cliff_hills", prop_cliff_hills, {}, 150.0, 25.0, 31), ("blockhouse", prop_blockhouse, {}, 24.0, 8.0, 32)],
    "steppe": [("grass", prop_grass, {}, 140.0, 1.6, 41), ("rail_erector", prop_rail_erector, {}, 90.0, 6.6, 42),
               ("drop_zone", prop_drop_zone, {}, 34.0, 3.8, 43)],
}
SITE_IDS = {"equatorial": "site_equatorial_spaceport", "subtropical": "site_subtropical_coast",
            "polar": "site_west_coast_polar_range", "steppe": "site_inland_steppe_cosmodrome"}


def _make_prop(site, name, fn, kwargs, footprint, height, seed):
    def gen(ctx):
        mb = ctx.mesh()
        fn(mb, random.Random(seed), **kwargs)
        _meta(ctx, footprint, height, site=SITE_IDS[site])
    return gen


for _site, _items in PROPS.items():
    for _name, _fn, _kw, _fp, _h, _seed in _items:
        register(f"world_site_{_site}_{_name}", "world_site", _make_prop(_site, _name, _fn, _kw, _fp, _h, _seed), "7.1")


# --------------------------------------------------------------------------- phone dioramas
GROUND_R = 72.0
PROP_K = 0.8         # props are drawn at 0.8 of their Build Bay size and pulled in, so the pad dominates the card     # diorama ground disc radius, m (game_value)


def _ground(mb):
    seg = mb.seg(40, 16)
    mb.lathe([(0.0, 0.0), (GROUND_R, 0.0), (GROUND_R + 2.0, 0.0), (GROUND_R + 2.0, 0.0)], seg, "ground", crease=40.0)


def _tower(mb, base_xy=(spec.GANTRY_OFFSET_X, 0.0), segments=2):
    """Short gantry (base + segments + crown) for the diorama."""
    ctx = _Sub(mb)
    z = 0.0
    with mb.xform(loc=(base_xy[0], base_xy[1], 0.0)):
        gen_gantry_base(ctx)
        z = spec.GANTRY_BASE_H
        for _ in range(segments):
            with mb.xform(loc=(0, 0, z)):
                gen_gantry_segment(ctx)
            z += spec.GANTRY_SEGMENT_H
        with mb.xform(loc=(0, 0, z)):
            gen_gantry_crown(ctx)


def _diorama(site):
    def gen(ctx):
        mb = ctx.mesh()
        ctx_sub = _Sub(mb)
        _ground(mb)
        # pad, trench and tower are drawn at full size to leave room for the props
        with mb.xform(scale=1.0):
            gen_pad_deck(ctx_sub)
            gen_flame_trench(ctx_sub)
            _tower(mb, segments=2)
        place = DIORAMA[site]
        for name, loc, rot, sc in place:
            fn, kw, seed = next((f, k, s) for n, f, k, _fp, _h, s in PROPS[site] if n == name)
            with mb.xform(loc=(loc[0] * PROP_K, loc[1] * PROP_K, 0.0), rot_z=rot, scale=sc * PROP_K):
                fn(mb, random.Random(seed), **DIORAMA_ARGS.get((site, name), {}))
        for mast in DIORAMA_MASTS.get(site, []):
            with mb.xform(loc=(mast[0], mast[1], 0.0)):
                gen_lightning_mast(ctx_sub)
        _meta(ctx, 2 * GROUND_R, 25.0, diorama_for=site, phone_only=True)
    return gen


# (prop, (x, y) m, rot_z rad, scale): layout of each diorama (game_value)
DIORAMA = {
    "equatorial": [("palms", (-32, -24), 0.0, 0.9), ("treeline", (0, 58), 0.0, 1.0), ("hall", (42, -32), 0.5, 0.6)],
    "subtropical": [("dunes", (0, -58), 0.0, 0.85), ("water_tower", (44, 30), 0.0, 0.8), ("assembly", (-50, -16), 0.3, 0.55)],
    "polar": [("cliff_hills", (0, 40), 0.0, 1.0), ("blockhouse", (-36, -22), 0.4, 1.0)],
    "steppe": [("grass", (0, 0), 0.0, 1.0), ("rail_erector", (-40, 4), 1.5708, 0.8), ("drop_zone", (42, -38), 0.0, 0.8)],
}
DIORAMA_ARGS = {("equatorial", "palms"): dict(n=7), ("equatorial", "treeline"): dict(n=14, length=110.0),
                ("subtropical", "dunes"): dict(n=5, tufts=36), ("polar", "cliff_hills"): dict(n=7, cliff_len=120.0),
                ("steppe", "grass"): dict(tufts=90, spread=80.0)}
DIORAMA_MASTS = {"subtropical": [(-5.0, -16.0), (14.0, 18.0)]}

for _site, _sid in SITE_IDS.items():
    register(_sid, "world_site_diorama", _diorama(_site), "7.1")
