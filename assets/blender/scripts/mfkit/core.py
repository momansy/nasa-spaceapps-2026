"""MissionForge kit: mesh-building core.

Everything here is plain-Python geometry accumulation (no bpy operators), so it runs the
same in a live Blender session (through the Blender MCP) and in `blender -b`.

Conventions (see assets/blender/README.md):
  * 1 unit = 1 m. +Z is the rocket's long axis ("up"), +Y is "forward".
  * A part's origin is the centre of its bottom mating ring.
  * Lathe profiles are (r, z) pairs. The surface normal points to the RIGHT of the travel
    direction in the r-z plane (r to the right, z up): a profile that runs bottom->top
    faces outward, top->bottom faces inward. A closed loop run counter-clockwise is a
    solid of revolution with outward normals.
"""
from __future__ import annotations

import math
from contextlib import contextmanager

from mathutils import Matrix, Vector

TAU = math.tau

# Material slots. The first five are recoloured by the game; detail_dark is a fixed
# dark rubber/composite/shadow-gap material shared by every part.
SLOTS = ("hull", "livery", "engine_metal", "nozzle_hot", "thermal", "detail_dark",
         # T017 world / spacecraft slots (appended; never reorder the ones above)
         "gantry", "concrete", "ground", "foliage", "solar_cell", "heat_shield")


def _even(n: int) -> int:
    return n + (n % 2)


def fillet_polyline(points, bend_radius, bend_seg):
    """Round the interior corners of a polyline with circular arcs."""
    pts = [Vector(p) for p in points]
    if len(pts) < 3 or bend_radius <= 0 or bend_seg < 1:
        return pts
    out = [pts[0]]
    for i in range(1, len(pts) - 1):
        p_prev, p, p_next = pts[i - 1], pts[i], pts[i + 1]
        d_in = p - p_prev
        d_out = p_next - p
        l_in, l_out = d_in.length, d_out.length
        if l_in < 1e-9 or l_out < 1e-9:
            continue
        d_in /= l_in
        d_out /= l_out
        cos_a = max(-1.0, min(1.0, d_in.dot(d_out)))
        turn = math.acos(cos_a)
        if turn < math.radians(3.0):
            out.append(p)
            continue
        # distance from corner to tangent points
        t = bend_radius * math.tan(turn / 2.0)
        t = min(t, l_in * 0.49, l_out * 0.49)
        r = t / math.tan(turn / 2.0)
        a = p - d_in * t
        b = p + d_out * t
        bis = (d_out - d_in)
        if bis.length < 1e-9:
            out.append(p)
            continue
        bis.normalize()
        centre = p + bis * (r / math.cos(turn / 2.0))
        va = a - centre
        axis = d_in.cross(d_out)
        if axis.length < 1e-9:
            out.append(p)
            continue
        axis.normalize()
        for k in range(bend_seg + 1):
            ang = turn * k / bend_seg
            out.append(centre + Matrix.Rotation(ang, 3, axis) @ va)
        _ = b
    out.append(pts[-1])
    return out


class MeshBuilder:
    """Accumulates vertices/faces with material, smoothing, UV and heat-mask data."""

    def __init__(self, lod: int = 0):
        self.lod = lod
        self.v: list[tuple] = []
        self.f: list[tuple] = []
        self.fm: list[int] = []
        self.fs: list[bool] = []
        self.uv: list[list] = []
        self.heat: list[float] = []

    # ------------------------------------------------------------------ LOD helpers
    def seg(self, n: int, lo: int = 6) -> int:
        """Radial segment count: n at LOD0, about half at LOD1 (never below `lo`)."""
        if self.lod == 0:
            return max(lo, int(n))
        return max(lo, _even(int(round(n * 0.5))))

    def steps(self, n: int, lo: int = 1) -> int:
        """Lengthwise subdivision count: n at LOD0, about half at LOD1."""
        if self.lod == 0:
            return max(lo, int(n))
        return max(lo, int(math.ceil(n * 0.5)))

    def want(self, max_lod: int = 0) -> bool:
        """True if detail meant for LODs <= max_lod should be built now."""
        return self.lod <= max_lod

    @property
    def tri_count(self) -> int:
        return sum(len(f) - 2 for f in self.f)

    # ------------------------------------------------------------------ low level
    @staticmethod
    def _slot(mat) -> int:
        return mat if isinstance(mat, int) else SLOTS.index(mat)

    def _vert(self, co, heat=0.0) -> int:
        self.v.append((co[0], co[1], co[2]))
        self.heat.append(heat)
        return len(self.v) - 1

    def _face(self, idx, mat, smooth, uvs=None):
        self.f.append(tuple(idx))
        self.fm.append(self._slot(mat))
        self.fs.append(bool(smooth))
        self.uv.append(list(uvs) if uvs is not None else None)

    def face(self, coords, mat, smooth=False):
        """A single free polygon from coordinates (counter-clockwise seen from outside)."""
        idx = [self._vert(c) for c in coords]
        self._face(idx, mat, smooth)

    # ------------------------------------------------------------------ transforms
    @contextmanager
    def xform(self, matrix=None, *, loc=None, rot_z=0.0, rot_x=0.0, rot_y=0.0, scale=None):
        """Transform everything built inside the block.

        Order applied to the geometry: scale, rot_x, rot_y, rot_z, then loc (or just
        `matrix` if given)."""
        v0, f0 = len(self.v), len(self.f)
        yield
        if matrix is None:
            m = Matrix.Identity(4)
            if loc is not None:
                m = Matrix.Translation(Vector(loc))
            if rot_z:
                m = m @ Matrix.Rotation(rot_z, 4, "Z")
            if rot_y:
                m = m @ Matrix.Rotation(rot_y, 4, "Y")
            if rot_x:
                m = m @ Matrix.Rotation(rot_x, 4, "X")
            if scale is not None:
                sc = (scale, scale, scale) if isinstance(scale, (int, float)) else scale
                m = m @ Matrix.Diagonal((sc[0], sc[1], sc[2], 1.0))
        else:
            m = matrix
        flip = m.determinant() < 0
        for i in range(v0, len(self.v)):
            self.v[i] = tuple(m @ Vector(self.v[i]))
        if flip:
            # mirrored transform: reverse the winding of the faces built in the block
            for fi in range(f0, len(self.f)):
                self.f[fi] = tuple(reversed(self.f[fi]))
                if self.uv[fi] is not None:
                    self.uv[fi] = list(reversed(self.uv[fi]))

    @contextmanager
    def radial(self, n: int, phase: float = 0.0):
        """Build one instance inside the block; it is repeated n times around +Z.

        The instance as built ends up at angle `phase`; copies follow every 2*pi/n."""
        v0, f0 = len(self.v), len(self.f)
        yield
        v1, f1 = len(self.v), len(self.f)
        base_v = [Vector(c) for c in self.v[v0:v1]]
        base_heat = self.heat[v0:v1]
        base_f = self.f[f0:f1]
        base_fm = self.fm[f0:f1]
        base_fs = self.fs[f0:f1]
        base_uv = self.uv[f0:f1]
        rot0 = Matrix.Rotation(phase, 3, "Z")
        for i, c in enumerate(base_v):
            self.v[v0 + i] = tuple(rot0 @ c)
        for k in range(1, n):
            rot = Matrix.Rotation(phase + TAU * k / n, 3, "Z")
            off = len(self.v) - v0
            for c, h in zip(base_v, base_heat):
                self.v.append(tuple(rot @ c))
                self.heat.append(h)
            for face, m, s, uv in zip(base_f, base_fm, base_fs, base_uv):
                self.f.append(tuple(i + off for i in face))
                self.fm.append(m)
                self.fs.append(s)
                self.uv.append(list(uv) if uv is not None else None)

    @contextmanager
    def mirror(self, axis: str = "X"):
        """Build one instance inside the block; a mirrored copy is added across `axis`=0."""
        v0, f0 = len(self.v), len(self.f)
        yield
        v1, f1 = len(self.v), len(self.f)
        ai = "XYZ".index(axis.upper())
        off = v1 - v0
        for i in range(v0, v1):
            c = list(self.v[i])
            c[ai] = -c[ai]
            self.v.append(tuple(c))
            self.heat.append(self.heat[i])
        for fi in range(f0, f1):
            self.f.append(tuple(reversed([i + off for i in self.f[fi]])))
            self.fm.append(self.fm[fi])
            self.fs.append(self.fs[fi])
            uv = self.uv[fi]
            self.uv.append(list(reversed(uv)) if uv is not None else None)

    # ------------------------------------------------------------------ primitives
    def lathe(self, profile, seg, mat, *, smooth=True, crease=30.0, sweep=None, flip=False,
              heat=0.0, closed=False, uv_scale=1.0):
        """Revolve an (r, z) profile around +Z.

        profile : list of (r, z). Points with r <= 1e-6 become a single pole vertex.
        seg     : radial segments (pass through mb.seg() yourself).
        crease  : profile corners sharper than this (degrees) get a hard edge.
        sweep   : (a0, a1) radians for a partial revolve (open ends, no end caps).
        flip    : reverse normals.
        heat    : float, or list with one value per profile point (nozzle glow mask 0..1).
        closed  : profile is a closed loop (last point connects to first; do not repeat it).
        """
        pts = [(float(r), float(z)) for r, z in profile]
        n = len(pts)
        if n < 2:
            return
        heats = list(heat) if isinstance(heat, (list, tuple)) else [float(heat)] * n
        if closed:
            pts = pts + [pts[0]]
            heats = heats + [heats[0]]
            n += 1
        full = sweep is None
        a0, a1 = (0.0, TAU) if full else sweep
        cols = seg if full else seg + 1
        angles = [a0 + (a1 - a0) * j / seg for j in range(cols)]
        cs = [(math.cos(a), math.sin(a)) for a in angles]
        r_ref = max(r for r, _ in pts) or 1.0

        # split the profile into smooth runs at sharp corners
        def direction(i0, i1):
            dr, dz = pts[i1][0] - pts[i0][0], pts[i1][1] - pts[i0][1]
            length = math.hypot(dr, dz)
            return (dr / length, dz / length) if length > 1e-9 else None

        runs = [[0]]
        for i in range(1, n - 1):
            runs[-1].append(i)
            d_in, d_out = direction(i - 1, i), direction(i, i + 1)
            if d_in is None or d_out is None:
                continue
            dot = max(-1.0, min(1.0, d_in[0] * d_out[0] + d_in[1] * d_out[1]))
            if not smooth or math.degrees(math.acos(dot)) > crease:
                runs.append([i])
        runs[-1].append(n - 1)

        # cumulative length for V
        vlen = [0.0]
        for i in range(1, n):
            vlen.append(vlen[-1] + math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))

        for run in runs:
            rings = []
            for i in run:
                r, z = pts[i]
                if r <= 1e-6:
                    rings.append([self._vert((0.0, 0.0, z), heats[i])])
                else:
                    rings.append([self._vert((r * c, r * s, z), heats[i]) for c, s in cs])
            for k in range(len(run) - 1):
                ia, ib = run[k], run[k + 1]
                ra, rb = rings[k], rings[k + 1]
                va, vb = vlen[ia] * uv_scale, vlen[ib] * uv_scale
                for j in range(seg):
                    j2 = (j + 1) % cols if full else j + 1
                    u0 = (a0 + (a1 - a0) * j / seg) * r_ref * uv_scale
                    u1 = (a0 + (a1 - a0) * (j + 1) / seg) * r_ref * uv_scale
                    if len(ra) == 1 and len(rb) == 1:
                        continue
                    if len(ra) == 1:
                        idx = [ra[0], rb[j2], rb[j]]
                        uvs = [((u0 + u1) / 2, va), (u1, vb), (u0, vb)]
                    elif len(rb) == 1:
                        idx = [ra[j], ra[j2], rb[0]]
                        uvs = [(u0, va), (u1, va), ((u0 + u1) / 2, vb)]
                    else:
                        idx = [ra[j], ra[j2], rb[j2], rb[j]]
                        uvs = [(u0, va), (u1, va), (u1, vb), (u0, vb)]
                    if flip:
                        idx.reverse()
                        uvs.reverse()
                    self._face(idx, mat, smooth, uvs)

    def cyl(self, p0, p1, r0, seg, mat, *, r1=None, caps=True, smooth=True, heat=0.0):
        """Cylinder / cone frustum between two points. caps: bool or (start, end)."""
        p0, p1 = Vector(p0), Vector(p1)
        d = p1 - p0
        length = d.length
        if length < 1e-9:
            return
        r1 = r0 if r1 is None else r1
        cap0, cap1 = (caps, caps) if isinstance(caps, bool) else caps
        prof = []
        if cap0 and r0 > 1e-6:
            prof.append((0.0, 0.0))
        prof += [(r0, 0.0), (r1, length)]
        if cap1 and r1 > 1e-6:
            prof.append((0.0, length))
        m = Matrix.Translation(p0) @ d.to_track_quat("Z", "Y").to_matrix().to_4x4()
        with self.xform(m):
            self.lathe(prof, seg, mat, smooth=smooth, heat=heat)

    def strut(self, p0, p1, r, mat="engine_metal", seg=6, caps=False):
        self.cyl(p0, p1, r, seg, mat, caps=caps)

    def tube(self, path, radius, seg, mat, *, bend=None, bend_seg=4, caps=False, smooth=True):
        """Pipe of constant radius along a polyline, with rounded bends.

        bend: bend radius (default 2.5 x pipe radius). bend_seg: arc steps per corner at LOD0."""
        bend = radius * 2.5 if bend is None else bend
        bseg = bend_seg if self.lod == 0 else max(2, bend_seg // 2)
        pts = fillet_polyline(path, bend, bseg)
        if len(pts) < 2:
            return
        # tangents
        tans = []
        for i in range(len(pts)):
            if i == 0:
                t = pts[1] - pts[0]
            elif i == len(pts) - 1:
                t = pts[-1] - pts[-2]
            else:
                t = (pts[i + 1] - pts[i]).normalized() + (pts[i] - pts[i - 1]).normalized()
            if t.length < 1e-9:
                t = Vector((0, 0, 1))
            tans.append(t.normalized())
        # parallel transport frame
        ref = Vector((0, 0, 1)) if abs(tans[0].z) < 0.9 else Vector((1, 0, 0))
        nrm = (ref - tans[0] * ref.dot(tans[0])).normalized()
        rings = []
        vcoord = [0.0]
        for i, (p, t) in enumerate(zip(pts, tans)):
            if i > 0:
                nrm = (nrm - t * nrm.dot(t))
                if nrm.length < 1e-9:
                    nrm = t.orthogonal()
                nrm.normalize()
                vcoord.append(vcoord[-1] + (p - pts[i - 1]).length)
            bin_ = t.cross(nrm)
            ring = []
            for j in range(seg):
                a = TAU * j / seg
                ring.append(self._vert(p + (nrm * math.cos(a) + bin_ * math.sin(a)) * radius))
            rings.append(ring)
        for i in range(len(rings) - 1):
            ra, rb = rings[i], rings[i + 1]
            for j in range(seg):
                j2 = (j + 1) % seg
                u0, u1 = TAU * radius * j / seg, TAU * radius * (j + 1) / seg
                self._face([ra[j], ra[j2], rb[j2], rb[j]], mat, smooth,
                           [(u0, vcoord[i]), (u1, vcoord[i]), (u1, vcoord[i + 1]), (u0, vcoord[i + 1])])
        if caps:
            for ring, p, flip in ((rings[0], pts[0], True), (rings[-1], pts[-1], False)):
                idx = [self._vert(self.v[i]) for i in ring]
                if flip:
                    idx.reverse()
                self._face(idx, mat, False)

    def box(self, size, mat, *, center=(0.0, 0.0, 0.0), matrix=None, taper=1.0):
        """Axis-aligned box (flat shaded). taper scales the +Z face in X and Y."""
        sx, sy, sz = size[0] / 2.0, size[1] / 2.0, size[2] / 2.0
        cx, cy, cz = center
        t = taper
        c = [
            (cx - sx, cy - sy, cz - sz), (cx + sx, cy - sy, cz - sz),
            (cx + sx, cy + sy, cz - sz), (cx - sx, cy + sy, cz - sz),
            (cx - sx * t, cy - sy * t, cz + sz), (cx + sx * t, cy - sy * t, cz + sz),
            (cx + sx * t, cy + sy * t, cz + sz), (cx - sx * t, cy + sy * t, cz + sz),
        ]
        quads = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
        dims = [(size[0], size[1]), (size[0], size[1]), (size[0], size[2]),
                (size[1], size[2]), (size[0], size[2]), (size[1], size[2])]

        def build():
            for q, (du, dv) in zip(quads, dims):
                idx = [self._vert(c[i]) for i in q]
                self._face(idx, mat, False, [(0, 0), (du, 0), (du, dv), (0, dv)])

        if matrix is not None:
            with self.xform(matrix):
                build()
        else:
            build()

    def extrude_poly(self, pts2d, z0, z1, mat, *, matrix=None, caps=True, smooth_sides=False):
        """Extrude a convex-ish 2D polygon (x, y), listed counter-clockwise, from z0 to z1."""
        n = len(pts2d)

        def build():
            for i in range(n):
                a, b = pts2d[i], pts2d[(i + 1) % n]
                du = math.hypot(b[0] - a[0], b[1] - a[1])
                idx = [self._vert((a[0], a[1], z0)), self._vert((b[0], b[1], z0)),
                       self._vert((b[0], b[1], z1)), self._vert((a[0], a[1], z1))]
                self._face(idx, mat, smooth_sides, [(0, 0), (du, 0), (du, z1 - z0), (0, z1 - z0)])
            if caps:
                top = [self._vert((p[0], p[1], z1)) for p in pts2d]
                self._face(top, mat, False, [(p[0], p[1]) for p in pts2d])
                bot = [self._vert((p[0], p[1], z0)) for p in reversed(pts2d)]
                self._face(bot, mat, False, [(p[0], p[1]) for p in reversed(pts2d)])

        if matrix is not None:
            with self.xform(matrix):
                build()
        else:
            build()

    def sphere(self, center, radius, seg, rings, mat, *, lat0=-90.0, lat1=90.0, scale=(1, 1, 1),
               heat=0.0, flip=False):
        """UV sphere (or a latitude band of one). scale squashes it into an ellipsoid."""
        prof = []
        for i in range(rings + 1):
            lat = math.radians(lat0 + (lat1 - lat0) * i / rings)
            r = radius * math.cos(lat)
            prof.append((0.0 if abs(r) < 1e-6 else r, radius * math.sin(lat)))
        m = Matrix.Translation(Vector(center)) @ Matrix.Diagonal((scale[0], scale[1], scale[2], 1.0))
        with self.xform(m):
            self.lathe(prof, seg, mat, crease=80.0, heat=heat, flip=flip)

    def dome(self, radius, height, z, seg, rings, mat, *, up=True, flip=False):
        """Elliptical tank dome whose rim sits at height z. up=True bulges toward +Z.

        Normals face away from the tank interior (outward) unless flip is set."""
        prof = []
        for i in range(rings + 1):
            a = (math.pi / 2.0) * i / rings
            r = radius * math.cos(a)
            dz = height * math.sin(a)
            prof.append((0.0 if r < 1e-6 else r, z + dz if up else z - dz))
        if not up:
            prof.reverse()
        self.lathe(prof, seg, mat, crease=80.0, flip=flip)

    def torus(self, major_r, minor_r, z, seg, minor_seg, mat, *, heat=0.0):
        """Ring (hoop) around +Z at height z."""
        prof = [(major_r + minor_r * math.cos(TAU * i / minor_seg),
                 z + minor_r * math.sin(TAU * i / minor_seg)) for i in range(minor_seg)]
        self.lathe(prof, seg, mat, crease=179.0, closed=True, heat=heat)

    def band(self, radius, z0, z1, thickness, seg, mat, *, heat=0.0):
        """Flat raised hoop (rectangular section) hugging a cylinder of `radius`."""
        r_out = radius + thickness
        self.lathe([(radius, z0), (r_out, z0), (r_out, z1), (radius, z1)], seg, mat, heat=heat)

    def bolt_ring(self, radius, z, count, bolt_r, bolt_h, mat="engine_metal", *, axis="Z", phase=0.0,
                  seg=6):
        """Ring of hex bolt heads. axis 'Z': heads point up; 'R': heads point radially out."""
        with self.radial(count, phase):
            if axis == "Z":
                self.cyl((radius, 0, z), (radius, 0, z + bolt_h), bolt_r, seg, mat,
                         caps=(False, True), smooth=False)
            else:
                self.cyl((radius, 0, z), (radius + bolt_h, 0, z), bolt_r, seg, mat,
                         caps=(False, True), smooth=False)

    def panel(self, radius, z0, z1, ang_width, thickness, mat, *, ang=0.0, seg=3):
        """Curved raised rectangular panel (door, hatch, raceway cover) on a cylinder.

        ang_width and ang in radians; the panel is centred on angle `ang`."""
        seg = max(1, seg if self.lod == 0 else (seg + 1) // 2)
        r_out = radius + thickness
        a0, a1 = ang - ang_width / 2.0, ang + ang_width / 2.0
        self.lathe([(radius, z0), (r_out, z0), (r_out, z1), (radius, z1)], seg, mat, sweep=(a0, a1))
        # end caps
        for a, rev in ((a0, False), (a1, True)):
            c, s = math.cos(a), math.sin(a)
            quad = [(radius * c, radius * s, z0), (radius * c, radius * s, z1),
                    (r_out * c, r_out * s, z1), (r_out * c, r_out * s, z0)]
            if rev:
                quad.reverse()
            self.face(quad, mat)


def bell_profile(r_throat, r_exit, length, n, *, theta_n=32.0, theta_e=8.0, z_exit=0.0):
    """Parabolic (Rao-style) bell contour from the throat down to the exit plane.

    Returns n+1 (r, z) points from the EXIT (z = z_exit) up to the THROAT (z = z_exit +
    length), i.e. bottom -> top, ready for an outward-facing lathe. theta_n / theta_e are
    the wall angles (degrees from the axis) just after the throat and at the exit."""
    tn, te = math.radians(theta_n), math.radians(theta_e)
    # quadratic Bezier: P0 throat, P2 exit, P1 from tangent intersection
    p0 = (r_throat, 0.0)
    p2 = (r_exit, length)
    # lines: from p0 direction (sin tn, cos tn); from p2 direction (sin te, cos te)
    # solve p0 + a*d0 = p2 - b*d2
    d0 = (math.sin(tn), math.cos(tn))
    d2 = (math.sin(te), math.cos(te))
    det = d0[0] * d2[1] - d0[1] * d2[0]
    if abs(det) < 1e-9:
        p1 = ((p0[0] + p2[0]) / 2.0, (p0[1] + p2[1]) / 2.0)
    else:
        a = ((p2[0] - p0[0]) * d2[1] - (p2[1] - p0[1]) * d2[0]) / det
        p1 = (p0[0] + a * d0[0], p0[1] + a * d0[1])
    out = []
    for i in range(n + 1):
        t = 1.0 - i / n  # exit first
        r = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t ** 2 * p2[0]
        x = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t ** 2 * p2[1]
        out.append((r, z_exit + (length - x)))
    return out


def ogive_profile(radius, length, n, *, z0=0.0, bluntness=0.0, power=None):
    """Nose-cone profile from the base (z0, r=radius) to the tip (z0+length), n steps.

    Tangent ogive by default; power=0.5..1 gives a power-series nose instead.
    bluntness (0..0.5) rounds the tip with a spherical cap of that fraction of radius."""
    pts = []
    if power is None:
        rho = (radius ** 2 + length ** 2) / (2.0 * radius)
        for i in range(n + 1):
            x = length * i / n  # from base to tip
            r = math.sqrt(max(0.0, rho ** 2 - x ** 2)) + radius - rho
            pts.append((max(0.0, r), z0 + x))
    else:
        for i in range(n + 1):
            x = length * i / n
            r = radius * (max(0.0, 1.0 - x / length)) ** power
            pts.append((r, z0 + x))
    if bluntness > 0:
        rb = radius * bluntness
        # cut the profile where r < rb*0.9 and close it with a small spherical cap
        cut = [p for p in pts if p[0] > rb * 0.85]
        r_c, z_c = cut[-1]
        cap_h = r_c * 0.6
        steps = 4
        for k in range(1, steps + 1):
            a = (math.pi / 2.0) * k / steps
            cut.append((0.0 if k == steps else r_c * math.cos(a), z_c + cap_h * math.sin(a)))
        pts = cut
    else:
        pts[-1] = (0.0, pts[-1][1])
    return pts
