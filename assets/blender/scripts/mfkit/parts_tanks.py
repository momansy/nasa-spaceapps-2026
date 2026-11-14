"""Propellant tanks, first and upper stage, five sizes, standard and hydrolox (design 7.9).

One parametric generator builds all 20 tanks from spec.tank_dims().

Layout (bottom -> top), all inside 0 <= z <= length:
  aft skirt | lower tank barrel | intertank (stage 1) or common-bulkhead ring (stage 2)
  | upper tank barrel | forward skirt
The tank domes sit recessed inside the skirts so they show when the stage is separated.

Angles around +Z (0 = +X, counter-clockwise): the systems tunnel is on -Y (-90 deg), the
ports and the intertank door face the -Y/+X quadrant, hydrolox lines run on the +X side.
"""
from __future__ import annotations

import math

from . import spec
from .parts_structures import mating_flange
from .pipeline import register

A_RACEWAY = math.radians(-90.0)
A_DOOR = math.radians(-45.0)
A_PORTS = math.radians(-28.0)
A_VENT = math.radians(-64.0)
A_FEED = math.radians(28.0)
A_PRESS = math.radians(52.0)

MAX_SEAMS = 14


def _seg0(radius: float) -> int:
    return int(round((34.0 + 9.2 * radius) / 4.0)) * 4


def _polar(r: float, a: float, z: float) -> tuple[float, float, float]:
    return (r * math.cos(a), r * math.sin(a), z)


def _seam_positions(za: float, zb: float, spacing: float) -> list[float]:
    n = max(0, int(round((zb - za) / spacing)) - 1)
    return [za + (zb - za) * (k + 1) / (n + 1) for k in range(n)]


def _v_ridge(mb, r, a, z0, z1, half_w, t, mat):
    """Vertical weld bead: a shallow triangular ridge on a cylinder of radius r."""
    c, s = math.cos(a), math.sin(a)
    tx, ty = -s, c
    rb = r - 0.002
    pl = (rb * c - tx * half_w, rb * s - ty * half_w)
    pr = (rb * c + tx * half_w, rb * s + ty * half_w)
    ap = ((r + t) * c, (r + t) * s)
    mb.face([(*pl, z0), (*ap, z0), (*ap, z1), (*pl, z1)], mat)
    mb.face([(*ap, z0), (*pr, z0), (*pr, z1), (*ap, z1)], mat)


def _radial_stub(mb, a, z, r_from, r_to, radius, seg, mat, cap=True):
    mb.cyl(_polar(r_from, a, z), _polar(r_to, a, z), radius, seg, mat, caps=(False, cap))


def _port(mb, a, z, r_skin, size):
    """Fill/drain or vent port: bolted flange with a capped stub."""
    s = mb.seg(12, 8)
    _radial_stub(mb, a, z, r_skin - 0.02, r_skin + size * 0.35, size * 1.55, s, "engine_metal")
    _radial_stub(mb, a, z, r_skin, r_skin + size * 0.9, size, s, "engine_metal")
    _radial_stub(mb, a, z, r_skin, r_skin + size * 0.93, size * 0.72, s, "detail_dark")


def gen_tank(ctx):
    mb = ctx.mesh()
    stage, size, family = ctx.params["stage"], ctx.params["size"], ctx.params["propellant"]
    dims = spec.tank_dims(stage, size, family)
    d, length = dims["diameter"], dims["length"]
    ox = dims["ox_fraction"]
    R = d / 2.0
    hydro = family == "hydrolox"
    seg = mb.seg(_seg0(R), 16)
    skin_t = spec.SKIN

    # ------------------------------------------------------------------ layout
    hs = min(0.22 * d, 0.20 * length)                 # skirt height (both ends)
    body = length - 2.0 * hs
    hi = min(0.42 * d, 0.24 * body) if stage == 1 else 0.0     # intertank height
    prop = body - hi
    # stage 1 and standard upper stages: oxidiser on top. Hydrolox upper stage
    # (S-IVB / Centaur style): LH2 forward, LOX aft.
    lower_frac = ox if (stage == 2 and hydro) else (1.0 - ox)
    zi0 = hs + lower_frac * prop
    zi1 = zi0 + hi
    z_top_barrel = length - hs
    tanks = [(hs, zi0), (zi1, z_top_barrel)]          # lower tank, upper tank

    # detail sizes scale with diameter
    t_str = 0.006 * d + 0.012                          # stringer radial height
    w_str = 0.012 * d + 0.014
    t_band = 0.004 * d + 0.006                         # ring-frame band
    h_band = 0.025 * d + 0.02
    t_seam = max(0.006, 0.0035 * d)
    tf = (0.006 * d + 0.012) if hydro else 0.0         # foam thickness
    ramp = 2.0 * tf
    Rb = R + tf                                        # outermost barrel radius

    # ------------------------------------------------------------------ seams
    total = sum(b - a for a, b in tanks)
    spacing = max(min(max(0.45 * d, 1.4), 3.0), total / (MAX_SEAMS + 1))
    seams = []                                          # (z, heavy)
    for za, zb in tanks:
        seams += [(z, False) for z in _seam_positions(za, zb, spacing)]
    if stage == 2:
        seams.append((zi0, True))                       # common bulkhead
    seams.sort()

    # ------------------------------------------------------------------ livery
    livery = []                                         # (z0, z1) painted intervals
    if not hydro:
        u0, u1 = tanks[1]
        ulen = u1 - u0
        wb = min(0.45 * d, 0.40 * ulen)
        top = u1 - min(0.30 * d, 0.15 * ulen)
        livery.append((top - wb, top))
        ps_h, ps_gap = 0.12 * wb, 0.10 * wb
        if top - wb - ps_gap - ps_h > u0 + 0.05 * ulen:
            livery.append((top - wb - ps_gap - ps_h, top - wb - ps_gap))
        livery.sort()

    def mat_at(z: float) -> str:
        if hydro:
            return "thermal"
        for a, b in livery:
            if a <= z <= b:
                return "livery"
        return "hull"

    def split_by_mat(z0: float, z1: float) -> list[tuple[float, float, str]]:
        cuts = sorted({z0, z1, *[c for iv in livery for c in iv if z0 < c < z1]})
        return [(a, b, mat_at((a + b) / 2.0)) for a, b in zip(cuts, cuts[1:]) if b - a > 1e-6]

    # ------------------------------------------------------------------ outer skin
    mb.lathe([(R, 0.0), (R, hs)], seg, "hull")
    mb.lathe([(R, z_top_barrel), (R, length)], seg, "hull")
    if stage == 1:
        mb.lathe([(R, zi0), (R, zi1)], seg, "hull")

    def section_r(i: int) -> float:
        return R + tf * (1.0 if i % 2 == 0 else 0.72)

    if hydro:
        foam_regions = tanks if stage == 1 else [(hs, z_top_barrel)]
        sec = 0
        for za, zb in foam_regions:
            rp = min(ramp, 0.2 * (zb - za))
            pts = [(R, za), (section_r(sec), za + rp)]
            for z, _heavy in seams:
                if za + rp < z < zb - rp:
                    pts += [(section_r(sec), z), (section_r(sec + 1), z)]
                    sec += 1
            pts += [(section_r(sec), zb - rp), (R, zb)]
            mb.lathe(pts, seg, "thermal", crease=25.0)
            sec += 1
    else:
        for za, zb in tanks:
            for a, b, m in split_by_mat(za, zb):
                mb.lathe([(R, a), (R, b)], seg, m)

    # weld seams / foam closeout beads
    for k, (z, heavy) in enumerate(seams):
        if mb.lod > 0 and not heavy and k % 2 == 1:
            continue
        if hydro:
            t, w = tf * (0.75 if heavy else 0.45), tf * (3.4 if heavy else 2.2)
            base = R + tf * 0.70
            mb.lathe([(base, z - w), (Rb + t, z - w * 0.35), (Rb + t, z + w * 0.35), (base, z + w)]
                     if heavy else [(base, z - w), (Rb + t, z), (base, z + w)], seg, "thermal")
        elif heavy:
            mb.band(R - 0.001, z - h_band * 0.5, z + h_band * 0.5, t_band * 1.4, seg, "hull")
        else:
            w = t_seam * 1.8
            mb.lathe([(R - 0.001, z - w), (R + t_seam, z), (R - 0.001, z + w)], seg, mat_at(z))

    # ring frames at the skirt / intertank junctions
    for z in ([hs, z_top_barrel] + ([zi0, zi1] if stage == 1 else [])):
        mb.band(R - 0.001, z - h_band * 0.5, z + h_band * 0.5, t_band, seg, "hull")

    # vertical weld beads (standard) / long foam closeout strips (hydrolox)
    if mb.want(0):
        cuts_all = sorted([c for tk in tanks for c in tk] + [z for z, _ in seams])
        if not hydro:
            nv = 3 if d < 3.0 else (4 if d < 5.0 else 6)
            idx = 0
            for za, zb in tanks:
                cuts = [c for c in cuts_all if za - 1e-6 <= c <= zb + 1e-6]
                for a, b in zip(cuts, cuts[1:]):
                    if b - a < 0.05:
                        continue
                    for j in range(nv):
                        ang = 0.35 + math.tau * (j + 0.5 * (idx % 2)) / nv
                        for s0, s1, m in split_by_mat(a + t_seam * 2.0, b - t_seam * 2.0):
                            _v_ridge(mb, R, ang, s0, s1, t_seam * 1.5, t_seam * 0.8, m)
                    idx += 1
        else:
            strip_w = 0.05 * d + 0.03
            foam_regions = tanks if stage == 1 else [(hs, z_top_barrel)]
            for ri, (za, zb) in enumerate(foam_regions):
                rp = min(ramp, 0.2 * (zb - za)) * 1.2
                if zb - za < 6.0 * rp:
                    continue
                for j, deg in enumerate((-135.0, 5.0, 95.0, 170.0)):
                    wj = strip_w * (1.0 if j % 2 == 0 else 0.6)
                    mb.panel(R + tf * 0.65, za + rp, zb - rp, wj / R, tf * 0.62, "thermal",
                             ang=math.radians(deg + 11.0 * ri), seg=2)

    # ------------------------------------------------------------------ skirt stringers
    n_s = max(20, int(round(d * 9.0)))
    if mb.lod > 0:
        n_s = max(10, n_s // 2)
    w_s = w_str * (1.0 if mb.lod == 0 else 1.5)
    pad = max(0.03, 0.07 * hs)
    for z0, z1 in ((pad, hs - h_band * 0.5 - 0.3 * pad), (z_top_barrel + h_band * 0.5 + 0.3 * pad, length - pad)):
        if z1 - z0 < 0.05:
            continue
        with mb.radial(n_s, phase=math.pi / n_s):
            mb.box((t_str, w_s, z1 - z0), "hull", center=(R + t_str / 2.0 - 0.004, 0.0, (z0 + z1) / 2.0))
    if stage == 1 and hi > 0.1:
        n_i = int(n_s * 1.6)
        z0, z1 = zi0 + h_band * 0.5 + 0.01, zi1 - h_band * 0.5 - 0.01
        with mb.radial(n_i, phase=math.pi / n_i):
            mb.box((t_str, w_s * 0.9, z1 - z0), "hull", center=(R + t_str / 2.0 - 0.004, 0.0, (z0 + z1) / 2.0))
        # access door with a dark frame
        dh, dw = (z1 - z0) * 0.56, (z1 - z0) * 0.34
        zc = (z0 + z1) / 2.0
        mb.panel(R, zc - dh * 0.5 - 0.04 * d, zc + dh * 0.5 + 0.04 * d, (dw + 0.08 * d) / R, t_str + 0.006,
                 "detail_dark", ang=A_DOOR)
        mb.panel(R, zc - dh * 0.5, zc + dh * 0.5, dw / R, t_str + 0.016 + 0.002 * d, "hull", ang=A_DOOR)
        if mb.want(0):
            rr = R + t_str + 0.016 + 0.002 * d
            for sx in (-1, 1):
                for sz in (-1, 1):
                    a = A_DOOR + sx * (dw * 0.42) / R
                    _radial_stub(mb, a, zc + sz * dh * 0.42, rr - 0.005, rr + 0.012, 0.008 + 0.003 * d, 6,
                                 "engine_metal")

    # ------------------------------------------------------------------ systems tunnel (-Y)
    w_r = 0.05 * d + 0.06
    h_r = 0.45 * w_r
    rz0, rz1 = hs * 0.5, length - hs * 0.5
    sag = w_r * w_r / (8.0 * R)
    base = Rb - sag - 0.004                             # radial position of the tunnel floor
    under = tf + 0.03                                   # how far the body dips into the skin
    from mathutils import Matrix
    m_race = Matrix(((0.0, 0.0, 1.0, 0.0),
                     (0.0, -1.0, 0.0, -base),
                     (1.0, 0.0, 0.0, 0.0),
                     (0.0, 0.0, 0.0, 1.0)))
    rr_len = min(2.0 * h_r, 0.2 * (rz1 - rz0))
    mb.extrude_poly([(rz0, -under), (rz1, -under), (rz1 - rr_len, h_r), (rz0 + rr_len, h_r)],
                    -w_r / 2.0, w_r / 2.0, "hull", matrix=m_race)
    run = rz1 - rz0 - 2.0 * rr_len
    if run > 0.3:
        n_strap = max(2, min(14, int(run / (0.9 * d + 0.6)) + 1))
        if mb.lod > 0:
            n_strap = max(2, n_strap // 2)
        strap_len = 0.03 * d + 0.03
        for k in range(n_strap):
            z = rz0 + rr_len + run * (k + 0.5) / n_strap
            mb.box((w_r + 0.02, h_r + 0.01 + under, strap_len), "detail_dark",
                   center=(0.0, -(base + (h_r + 0.01 - under) / 2.0), z))
        if mb.want(0):
            n_b = max(3, min(22, int(run / (0.45 * d + 0.25))))
            br = 0.004 * d + 0.008
            for k in range(n_b):
                z = rz0 + rr_len + run * (k + 0.5) / n_b
                for sx in (-1, 1):
                    x = sx * (w_r * 0.5 - br * 1.8)
                    mb.cyl((x, -(base + h_r - 0.002), z), (x, -(base + h_r + br * 0.7), z), br, 6,
                           "engine_metal", caps=(False, True), smooth=False)

    # ------------------------------------------------------------------ ports + umbilical plate
    port_size = 0.016 * d + 0.022
    for za, zb in tanks:
        tl = zb - za
        if tl < port_size * 6.0:
            continue
        dz = min(0.16 * tl, 0.4 * d)
        _port(mb, A_PORTS, za + dz, Rb, port_size)              # fill / drain
        _port(mb, A_VENT, zb - dz, Rb, port_size * 0.8)         # vent
    uz0, uz1 = hs * 0.30, hs * 0.74
    u_w = 0.14 * d + 0.10
    u_t = t_str + 0.012 + 0.002 * d
    mb.panel(R, uz0, uz1, u_w / R, u_t, "engine_metal", ang=A_PORTS)
    for k in (-1, 0, 1):
        a = A_PORTS + k * (u_w * 0.3) / R
        cr = min(0.012 * d + 0.012, (uz1 - uz0) * 0.28)
        _radial_stub(mb, a, (uz0 + uz1) / 2.0, R + u_t - 0.005, R + u_t + cr * 0.9, cr, mb.seg(10, 6), "detail_dark")

    # ------------------------------------------------------------------ hydrolox plumbing
    if hydro:
        clear = max(Rb, R + t_str)
        # pressurisation line, full length
        r_p = 0.007 * d + 0.012
        rc = clear + r_p * 1.35
        pz0, pz1 = hs * 0.55, length - hs * 0.55
        with mb.xform(rot_z=A_PRESS):
            mb.tube([(R - 2.0 * r_p, 0, pz1), (rc, 0, pz1), (rc, 0, pz0), (R - 2.0 * r_p, 0, pz0)], r_p,
                    mb.seg(8, 6), "engine_metal", bend=r_p * 2.2, bend_seg=3)
            n_br = max(2, min(12, int((pz1 - pz0) / (1.1 * d + 0.5))))
            if mb.lod > 0:
                n_br = max(2, n_br // 2)
            for k in range(n_br):
                z = pz0 + (pz1 - pz0) * (k + 0.5) / n_br
                mb.box((rc - R + r_p * 0.2, r_p * 2.6, r_p * 1.6), "hull" if (zi0 < z < zi1 and stage == 1) else "thermal",
                       center=((R + rc + r_p * 0.2) / 2.0 - 0.01, 0.0, z), taper=0.7)
        if stage == 1 and hi > 0.1:
            # LOX feedline: out of the intertank, down past the LH2 tank, into the aft skirt
            r_f = 0.028 * d + 0.01
            rc = clear + r_f * 1.45
            fz1, fz0 = zi0 + hi * 0.40, hs * 0.55
            with mb.xform(rot_z=A_FEED):
                mb.tube([(R - 2.0 * r_f, 0, fz1), (rc, 0, fz1), (rc, 0, fz0), (R - 2.0 * r_f, 0, fz0)], r_f,
                        mb.seg(14, 8), "engine_metal", bend=r_f * 2.4, bend_seg=5)
                z_lo, z_hi = fz0 + r_f * 3.5, fz1 - r_f * 3.5
                n_br = max(2, min(12, int((z_hi - z_lo) / (0.9 * d + 0.6)) + 1))
                if mb.lod > 0:
                    n_br = max(2, n_br // 2)
                for k in range(n_br):
                    z = z_lo + (z_hi - z_lo) * (k + 0.5) / n_br
                    # clamp collar, strut to the tank, foam ramp over the bracket foot
                    mb.cyl((rc, 0, z - r_f * 0.3), (rc, 0, z + r_f * 0.3), r_f * 1.22, mb.seg(14, 8), "engine_metal")
                    mb.box((rc - R, r_f * 0.7, r_f * 0.5), "engine_metal", center=((R + rc) / 2.0, 0.0, z))
                    mb.box((tf * 1.6 + 0.02, r_f * 3.0, r_f * 5.0), "thermal",
                           center=(Rb + tf * 0.3, 0.0, z), taper=0.45)
                # flanged joints near both ends
                for z in (fz0 + r_f * 3.0, fz1 - r_f * 3.0):
                    mb.cyl((rc, 0, z - r_f * 0.22), (rc, 0, z + r_f * 0.22), r_f * 1.4, mb.seg(14, 8), "engine_metal")

    # ------------------------------------------------------------------ open ends: rims, inner walls, domes
    ri = R - skin_t
    gap = 0.03 * d
    rd = ri - gap
    apex_clear = max(0.07, 0.02 * d)
    hd = hs - apex_clear
    dome_mat = "thermal" if hydro else "hull"
    rings = mb.steps(5, 3)
    # top
    mb.lathe([(R, length), (ri, length)], seg, "engine_metal")
    mb.lathe([(ri, length), (ri, z_top_barrel)], seg, "detail_dark")
    mb.lathe([(ri, z_top_barrel), (rd, z_top_barrel)], seg, "detail_dark")
    mb.dome(rd, hd, z_top_barrel, seg, rings, dome_mat, up=True)
    # bottom
    mb.lathe([(ri, 0.0), (R, 0.0)], seg, "engine_metal")
    mb.lathe([(ri, hs), (ri, 0.0)], seg, "detail_dark")
    mb.lathe([(rd, hs), (ri, hs)], seg, "detail_dark")
    mb.dome(rd, hd, hs, seg, rings, dome_mat, up=False)
    # dome fittings: manhole cover on top, sump / outlet below, one gore weld ring each
    s_small = mb.seg(20, 10)
    puck_r = 0.075 * d
    puck_h = apex_clear * 0.45
    z_ap_top, z_ap_bot = z_top_barrel + hd, hs - hd
    mb.lathe([(puck_r, z_ap_top - puck_h), (puck_r, z_ap_top + puck_h), (0.0, z_ap_top + puck_h)], s_small,
             "engine_metal")
    mb.lathe([(0.0, z_ap_bot - puck_h), (puck_r * 0.8, z_ap_bot - puck_h), (puck_r * 0.8, z_ap_bot + puck_h)],
             s_small, "engine_metal")
    if mb.want(0):
        mb.bolt_ring(puck_r * 0.8, z_ap_top + puck_h, 10, puck_r * 0.07, puck_h * 0.35)
        k = 0.62
        dz = hd * math.sqrt(1.0 - k * k)
        tw = max(0.006, t_seam)
        for zc in (z_top_barrel + dz, hs - dz):
            mb.torus(rd * k, tw, zc, seg, 4, dome_mat)

    flange_d = 0.03 + 0.012 * d
    flange_h = min(0.03 + 0.008 * d, hs * 0.2)
    mating_flange(mb, ri, 0.0, up=True, height=flange_h, depth=flange_d)
    mating_flange(mb, ri, length, up=False, height=flange_h, depth=flange_d)

    # ------------------------------------------------------------------ attach + meta
    ctx.empty("attach_top", (0.0, 0.0, length))
    ctx.meta.update(
        length_m=length, diameter_bottom_m=d, diameter_top_m=d,
        stage=stage, size=size, propellant_family=family,
        propellant_t=dims["prop_t"], volume_m3=dims["volume_m3"],
        skirt_height_m=round(hs, 3), intertank_height_m=round(hi, 3),
        bulkhead_or_intertank_z_m=round(zi0, 3),
        max_radius_m=round(max(Rb, R + t_str) + (0.028 * d + 0.01) * 2.9 if (hydro and stage == 1)
                           else base + h_r + 0.02, 3),
        value_types=dict(
            propellant_t="game_value",
            bulk_density="physical",
            volume_m3="physical (propellant mass / bulk density, plus 3 % ullage: game_value)",
            diameter_bottom_m="game_value", diameter_top_m="game_value",
            length_m="game_value derived from the physical volume",
            skirt_height_m="game_value", intertank_height_m="game_value"),
    )


for _stage in (1, 2):
    for _size in spec.TANK_SIZES:
        for _family in ("standard", "hydrolox"):
            register(spec.tank_id(_stage, _size, _family), "tank", gen_tank, "7.9",
                     stage=_stage, size=_size, propellant=_family)
