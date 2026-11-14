"""Payload fairings (design 7.5). Every fairing is two separable halves.

half_a occupies x > 0, half_b x < 0; the seam is the x = 0 plane. Both halves have their
origin at the centre of the base ring, so identical transforms give a closed fairing.
To open: translate half_a along +X / half_b along -X, or rotate each about its hinge
empty (hinge_a / hinge_b on the base rim) around the Y axis.
"""
from __future__ import annotations

import math

from . import spec
from .pipeline import register

HALF_PI = math.pi / 2.0


# --------------------------------------------------------------------------- shared helpers
def interp_r(pts, z):
    """Radius of an (r, z) profile sorted by ascending z at height z."""
    if z <= pts[0][1]:
        return pts[0][0]
    for (r0, z0), (r1, z1) in zip(pts, pts[1:]):
        if z0 <= z <= z1:
            k = (z - z0) / (z1 - z0) if z1 > z0 else 0.0
            return r0 + (r1 - r0) * k
    return pts[-1][0]


def nose_points(radius, nose_len, z0, n, blunt=0.12, cap_steps=4):
    """Blunted tangent ogive from (radius, z0) up to the tip (0, z0 + nose_len).

    Returns (points bottom->top, index of the first point of the spherical nose cap).
    The cap is tangent to the ogive, so the whole nose shades smoothly."""
    virt = nose_len / 0.9
    rho = (radius ** 2 + virt ** 2) / (2.0 * radius)
    r_c = radius * blunt
    x_c = math.sqrt(max(0.0, rho ** 2 - (r_c - radius + rho) ** 2))
    tan_phi = x_c / math.sqrt(max(1e-9, rho ** 2 - x_c ** 2))
    phi = math.atan(tan_phi)
    pts = []
    for i in range(n + 1):
        x = x_c * i / n
        pts.append((math.sqrt(max(0.0, rho ** 2 - x ** 2)) + radius - rho, x))
    cap_i = len(pts) - 1
    sph = r_c / math.cos(phi)
    zc = x_c - r_c * tan_phi
    for k in range(1, cap_steps + 1):
        th = phi + (HALF_PI - phi) * k / cap_steps
        pts.append((0.0 if k == cap_steps else sph * math.cos(th), zc + sph * math.sin(th)))
    scale = nose_len / pts[-1][1]
    pts = [(r, z0 + x * scale) for r, x in pts]
    pts[0] = (radius, z0)
    pts[-1] = (0.0, z0 + nose_len)
    return pts, cap_i


def skin_runs(mb, pts, seg, default_mat, ranges=(), *, sweep=None, crease=12.0):
    """Lathe an ascending (r, z) profile, switching material inside the given z ranges.

    ranges: iterable of (z0, z1, material). Material changes get their own vertex rings."""
    lo, hi = pts[0][1], pts[-1][1]
    cuts = sorted({z for a, b, _ in ranges for z in (a, b) if lo + 1e-6 < z < hi - 1e-6})
    full = []
    for p0, p1 in zip(pts, pts[1:]):
        full.append(p0)
        for z in cuts:
            if p0[1] + 1e-6 < z < p1[1] - 1e-6:
                k = (z - p0[1]) / (p1[1] - p0[1])
                full.append((p0[0] + (p1[0] - p0[0]) * k, z))
    full.append(pts[-1])

    def mat_at(z):
        for a, b, m in ranges:
            if a - 1e-9 <= z <= b + 1e-9:
                return m
        return default_mat

    run, cur = [full[0]], None
    for p0, p1 in zip(full, full[1:]):
        m = mat_at((p0[1] + p1[1]) / 2.0)
        if cur is None:
            cur = m
        if m != cur:
            mb.lathe(run, seg, cur, crease=crease, sweep=sweep)
            run, cur = [p0], m
        run.append(p1)
    mb.lathe(run, seg, cur, crease=crease, sweep=sweep)


def arc_solid(mb, prof, seg, mat, a0, a1, *, crease=30.0, closed=False):
    """Partial revolve of a counter-clockwise (r, z) section with both ends capped."""
    mb.lathe(prof, seg, mat, crease=crease, sweep=(a0, a1), closed=closed)
    for a, rev in ((a0, False), (a1, True)):
        c, s = math.cos(a), math.sin(a)
        poly = [(r * c, r * s, z) for r, z in prof]
        if rev:
            poly.reverse()
        mb.face(poly, mat)


# --------------------------------------------------------------------------- layout
def fairing_layout(p):
    d = p["diameter"]
    rm, rb, length = d / 2.0, p["base_d"] / 2.0, p["length"]
    land = round(0.06 * d + 0.03, 2)
    boat = 0.6 if rm - rb > 1e-6 else 0.0
    nose = round((1.35 if d < 2.0 else 1.25) * d, 2)
    wall = max(0.02, round(0.008 * d, 3))
    pad_t = max(0.015, round(0.006 * d, 3))
    return dict(d=d, rm=rm, rb=rb, length=length, land=land, boat=boat, nose=nose,
                z_cyl0=land + boat, z_cyl1=length - nose, cyl=length - nose - land - boat,
                wall=wall, pad_t=pad_t, rail_w=0.02 + 0.012 * d,
                seg_full=40 if d < 2.0 else (64 if d < 5.0 else 72),
                usable_d=round(d - 2.0 * (wall + pad_t) - 0.06 * d, 2))


def _profile(mb, lay):
    pts = [(lay["rb"], 0.0), (lay["rb"], lay["land"])]
    if lay["boat"]:
        pts.append((lay["rm"], lay["z_cyl0"]))
    nose, cap_i = nose_points(lay["rm"], lay["nose"], lay["z_cyl1"], mb.steps(16, 8),
                              blunt=max(0.12, 0.16 / lay["rm"]), cap_steps=4 if mb.lod == 0 else 3)
    base_n = len(pts)
    return pts + nose, base_n + cap_i


def _thruster_pod(mb, ang, r, z, s):
    with mb.xform(rot_z=ang):
        mb.box((0.14 * s, 0.26 * s, 0.38 * s), "detail_dark", center=(r + 0.04 * s, 0.0, z), taper=0.8)
        if mb.want(0):
            for dy in (-0.07, 0.07):
                mb.cyl((r + 0.09 * s, dy * s, z), (r + 0.17 * s, dy * s, z), 0.02 * s, 8,
                       "engine_metal", r1=0.04 * s, caps=False)


def _half(ctx, sub, side, lay, reusable):
    mb = ctx.mesh(sub)
    d, rm, rb, length = lay["d"], lay["rm"], lay["rb"], lay["length"]
    wall, pad_t = lay["wall"], lay["pad_t"]
    z_cyl0, z_cyl1, cyl, land = lay["z_cyl0"], lay["z_cyl1"], lay["cyl"], lay["land"]
    a_c = 0.0 if side > 0 else math.pi
    a0, a1 = a_c - HALF_PI, a_c + HALF_PI
    seg = max(8, mb.seg(lay["seg_full"], 16) // 2)
    w = lay["rail_w"] / rm                      # angular width of the seam rail

    pts, cap_i = _profile(mb, lay)
    body, cap = pts[:cap_i + 1], pts[cap_i:]
    z_cap = body[-1][1]
    nose_body = z_cap - z_cyl1

    # ---- outer skin: seam rails + painted body + nose cap
    stripe0 = z_cyl0 + 0.10 * cyl
    ranges = [(stripe0, stripe0 + 0.07 * d, "livery"),
              (z_cyl1 + 0.52 * nose_body, z_cyl1 + 0.74 * nose_body, "livery")]
    if reusable:
        # ablative coating reaches a little further down the nose than the cap
        ranges.append((z_cap - 0.14 * nose_body, z_cap, "thermal"))
    skin_runs(mb, body, seg - 2, "hull", ranges, sweep=(a0 + w, a1 - w))
    mb.lathe(body, 1, "engine_metal", crease=12.0, sweep=(a0, a0 + w))
    mb.lathe(body, 1, "engine_metal", crease=12.0, sweep=(a1 - w, a1))
    mb.lathe(cap, seg, "thermal" if reusable else "hull", crease=60.0, sweep=(a0, a1))
    # ---- inner wall
    inner = []
    for (r0, zz0), (r1, zz1) in zip(pts, pts[1:]):
        if r0 - wall > 0.01:
            inner.append((r0 - wall, zz0))
        if r0 - wall > 0.01 >= r1 - wall:
            k = (r0 - wall) / (r0 - r1)
            inner.append((0.0, zz0 + (zz1 - zz0) * k))
            break
    mb.lathe(list(reversed(inner)), seg, "hull", crease=30.0, sweep=(a0, a1))
    mb.lathe([(rb - wall, 0.0), (rb, 0.0)], seg, "engine_metal", sweep=(a0, a1))

    # ---- closed cut edges along the seam (plane x = 0)
    for s in (-1.0, 1.0):
        for (r0, zz0), (r1, zz1) in zip(pts, pts[1:]):
            i0, i1 = max(r0 - wall, 0.0), max(r1 - wall, 0.0)
            poly = [(0.0, s * r0, zz0), (0.0, s * r1, zz1)]
            if i1 > 1e-6 or r1 > 1e-6:
                poly.append((0.0, s * i1, zz1))
            if i0 > 1e-6 or (i1 > 1e-6):
                poly.append((0.0, s * i0, zz0))
            # drop duplicate points
            clean = []
            for q in poly:
                if not clean or max(abs(q[k] - clean[-1][k]) for k in range(3)) > 1e-7:
                    clean.append(q)
            if len(clean) > 2 and max(abs(clean[0][k] - clean[-1][k]) for k in range(3)) < 1e-7:
                clean.pop()
            if len(clean) < 3:
                continue
            if s == side:
                clean.reverse()
            mb.face(clean, "engine_metal")

    r_in = lambda z: interp_r(pts, z) - wall  # noqa: E731

    # ---- base separation ring (inside flange + outer band) with latch / pusher housings
    depth = 0.035 + 0.012 * d
    ring_h = land * 0.55
    arc_solid(mb, [(rb - wall - depth, 0.0), (rb - wall - 0.002, 0.0),
                   (rb - wall - 0.002, ring_h), (rb - wall - depth, ring_h)],
              seg, "engine_metal", a0, a1, closed=True)
    mb.lathe([(rb, 0.03), (rb + 0.006, 0.03), (rb + 0.006, land - 0.03), (rb, land - 0.03)],
             seg, "engine_metal", sweep=(a0, a1))
    for k in (-1.05, -0.35, 0.35, 1.05):
        with mb.xform(rot_z=a_c + k):
            # pusher-spring housing on the inside of the ring
            mb.box((depth * 1.5, 0.05 + 0.03 * d, ring_h + land * 0.5), "engine_metal",
                   center=(rb - wall - depth * 0.75, 0.0, 0.03 + (ring_h + land * 0.5) / 2.0))
            if mb.want(0):
                # latch fairing on the outside of the band
                mb.box((0.012 + 0.004 * d, 0.03 + 0.016 * d, land - 0.08), "engine_metal",
                       center=(rb + 0.004, 0.0, land / 2.0))

    # ---- acoustic blankets: quilted pads on the inner wall
    cols = 6 if mb.lod == 0 else 3
    pseg = 2 if mb.lod == 0 else 1
    gap_a = 0.035
    span0, span1 = a0 + 0.07, a1 - 0.07
    col_w = (span1 - span0) / cols
    rows = []
    n_bar = max(2, round(cyl / (0.26 * d)))
    if mb.lod:
        n_bar = max(1, n_bar // 2)
    zb0, zb1 = z_cyl0 + 0.06 * d, z_cyl1 - 0.02 * d
    for i in range(n_bar):
        rows.append((zb0 + (zb1 - zb0) * i / n_bar, zb0 + (zb1 - zb0) * (i + 1) / n_bar))
    n_nose = 3 if mb.lod == 0 else 2
    zn0, zn1 = z_cyl1 + 0.01 * d, z_cyl1 + 0.62 * nose_body
    for i in range(n_nose):
        rows.append((zn0 + (zn1 - zn0) * i / n_nose, zn0 + (zn1 - zn0) * (i + 1) / n_nose))
    for zr0, zr1 in rows:
        gz = min(0.04, (zr1 - zr0) * 0.05)
        pz0, pz1 = zr0 + gz, zr1 - gz
        bev = min(0.06, (pz1 - pz0) * 0.14)
        r0, r1 = r_in(pz0), r_in(pz1)
        t0, t1 = min(pad_t, r0 * 0.3), min(pad_t, r1 * 0.3)
        prof = [(r1 - 0.001, pz1), (r1 - t1, pz1 - bev), (r0 - t0, pz0 + bev), (r0 - 0.001, pz0)]
        for c in range(cols):
            arc_solid(mb, prof, pseg, "detail_dark", span0 + c * col_w + gap_a / 2.0,
                      span0 + (c + 1) * col_w - gap_a / 2.0, crease=70.0)

    # ---- seam latch housings along the split line
    if mb.want(0):
        n_latch = max(2, round(cyl / (0.4 * d)))
        bx, by, bz = 0.02 + 0.010 * d, 0.02 + 0.006 * d, 0.06 * d
        for s in (-1.0, 1.0):
            for i in range(n_latch):
                z = z_cyl0 + cyl * (i + 0.5) / n_latch
                mb.box((bx, by, bz), "engine_metal", center=(side * bx / 2.0, s * (rm + by / 2.0 - 0.006), z),
                       taper=0.7)

    # ---- vent ports, access door (half_a), RF window (half_b)
    vz = z_cyl0 + 0.03 * cyl
    for k in (-1.15, 1.15):
        mb.panel(rm, vz, vz + 0.035 * d, 0.05 * d / rm, 0.005, "detail_dark", ang=a_c + k, seg=1)
    if side > 0:
        dz0, dh, dw = z_cyl0 + 0.30 * cyl, 0.20 * d, 0.14 * d
        dz0 = min(dz0, z_cyl1 - dh - 0.05 * d)
        mb.panel(rm, dz0 - 0.012 * d, dz0 + dh + 0.012 * d, (dw + 0.024 * d) / rm, 0.005, "engine_metal",
                 ang=a_c + 0.55, seg=3)
        mb.panel(rm, dz0, dz0 + dh, dw / rm, 0.011, "hull", ang=a_c + 0.55, seg=3)
        if mb.want(0):
            # door latches
            for k in (0.25, 0.75):
                with mb.xform(rot_z=a_c + 0.55 + dw * 0.38 / rm):
                    mb.box((0.012, 0.012 * d, 0.02 * d), "detail_dark", center=(rm + 0.014, 0.0, dz0 + dh * k))
    else:
        wz0, ws = z_cyl0 + 0.52 * cyl, 0.13 * d
        wz0 = min(wz0, z_cyl1 - ws - 0.05 * d)
        mb.panel(rm, wz0 - 0.008 * d, wz0 + ws + 0.008 * d, (ws + 0.016 * d) / rm, 0.004, "engine_metal",
                 ang=a_c - 0.55, seg=3)
        mb.panel(rm, wz0, wz0 + ws, ws / rm, 0.008, "detail_dark", ang=a_c - 0.55, seg=3)

    # ---- recovery hardware (reusable variant)
    if reusable:
        s = d / 5.4
        zb = z_cyl0 + 0.35 * s + 0.06 * cyl
        zn = z_cyl1 + 0.20 * nose_body
        for k in (-0.95, 0.95):
            _thruster_pod(mb, a_c + k, rm, zb, s)
            _thruster_pod(mb, a_c + k * 0.8, interp_r(pts, zn) - 0.02 * s, zn, s)
        # parafoil container: half-ellipsoid blister on the outside of the half
        z_par = z_cyl0 + 0.70 * cyl
        with mb.xform(rot_z=a_c):
            with mb.xform(loc=(rm - 0.06 * s, 0.0, z_par), rot_y=HALF_PI, scale=(1.35 * s, 0.52 * s, 0.24 * s)):
                mb.sphere((0, 0, 0), 1.0, mb.seg(16, 10), mb.steps(6, 3), "thermal", lat0=0.0, lat1=90.0)
            if mb.want(0):
                for dz in (-0.7, 0.0, 0.7):
                    mb.box((0.03 * s, 0.9 * s, 0.07 * s), "detail_dark",
                           center=(rm + 0.14 * s * (1.0 - abs(dz) * 0.55), 0.0, z_par + dz * s))


def gen_fairing(ctx):
    p = spec.FAIRINGS[ctx.id]
    lay = fairing_layout(p)
    reusable = bool(p.get("reusable"))
    _half(ctx, "half_a", 1.0, lay, reusable)
    _half(ctx, "half_b", -1.0, lay, reusable)
    ctx.empty("attach_top", (0, 0, lay["length"]))
    ctx.empty("hinge_a", (lay["rb"], 0, 0), sub="half_a")
    ctx.empty("hinge_b", (-lay["rb"], 0, 0), sub="half_b")
    ctx.meta.update(
        name=p["name"], length_m=lay["length"], diameter_bottom_m=p["base_d"], diameter_top_m=0.0,
        max_diameter_m=lay["d"], usable_inner_diameter_m=lay["usable_d"],
        cylinder_length_m=round(lay["cyl"], 2), nose_length_m=lay["nose"],
        halves=["half_a", "half_b"], seam_plane="x=0", open_direction=dict(half_a="+X", half_b="-X"),
        reusable=reusable,
        value_types=dict(length_m="game_value", diameter_bottom_m="game_value",
                         max_diameter_m="game_value", usable_inner_diameter_m="game_value",
                         cylinder_length_m="game_value", nose_length_m="game_value"))


for _fid in spec.FAIRINGS:
    register(_fid, "fairing", gen_fairing, "7.5")
