"""MissionForge launch pad kit (T015 step 4): modular pad, gantry and site pieces.

Run headless (no live Blender session needed):
    /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
        --python unity/MissionForge/Assets/MissionForge/Art/Environment/LaunchPad/Source/build_launchpad.py

Writes Source/launchpad.blend and one FBX per piece to ../Models/ with the rocket kit's export settings
(assets/blender/scripts/mfkit/pipeline.py): metres, +Z up, origin documented per piece.
Swap point: when T017 exports world_* gantry and pad parts to assets/blender/export/fbx/, replace these
FBX files (same names or update LaunchPadBuilder.cs) and rebuild MF_LaunchPad.prefab.

Every dimension is a game_value (stylised realism, proportions from real pads of the 2010s-2020s);
the scale references (person 1.75 m, ten-storey building about 30 m, Saturn V 110.6 m tall and 10.1 m wide)
are real_world_approximate.
Material slots by name only: concrete, concrete_dark, marking, steel, grating, detail_dark, lamp,
warning_red, ghost, suit, skin, cable.
"""
from __future__ import annotations

import math
import os

import bmesh
import bpy
from mathutils import Matrix, Quaternion, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
MODELS = os.path.normpath(os.path.join(HERE, "..", "Models"))
SLOTS = ["concrete", "concrete_dark", "marking", "steel", "grating", "detail_dark", "lamp", "warning_red",
         "ghost", "suit", "skin", "cable"]
LOOKS = {  # viewport/preview colours only; Unity replaces every slot with a URP material
    "concrete": (0.42, 0.42, 0.40), "concrete_dark": (0.18, 0.18, 0.18), "marking": (0.85, 0.66, 0.30),
    "steel": (0.07, 0.17, 0.25), "grating": (0.10, 0.14, 0.18), "detail_dark": (0.16, 0.19, 0.21),
    "lamp": (1.0, 0.9, 0.7), "warning_red": (0.9, 0.1, 0.08), "ghost": (0.33, 0.77, 0.80),
    "suit": (0.9, 0.5, 0.15), "skin": (0.55, 0.38, 0.28), "cable": (0.05, 0.05, 0.05),
}

# ----------------------------------------------------------------------------- dimensions (game_value, m)
DECK_R = 44.0          # deck circumradius
DECK_H = 2.0           # deck top above grade
TRENCH_W = 10.0        # flame trench width
TRENCH_D = 9.0         # trench floor below grade
MOUNT_TOP = 12.0       # launch-mount table top above grade
MOUNT_HOLE = 11.0      # exhaust opening (square side)
MOUNT_SIZE = 22.0      # table outer side
VEHICLE_MOUNT_Z = 10.5  # where the rig's lowest point (nozzle exits) sits: just inside the opening
GANTRY_W = 9.0         # tower footprint side
SEG_H = 8.0            # one stackable gantry segment


def new_mat(name):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*LOOKS[name], 1.0)
    return m


class Mesh:
    """Small bmesh helper: boxes, beams, lathes and prisms with a material slot per face."""

    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()

    def _faces(self, faces, slot):
        idx = SLOTS.index(slot)
        for f in faces:
            f.material_index = idx

    def quad_box(self, corners, slot):
        """corners: 8 points, bottom 4 then top 4, counter-clockwise seen from above."""
        v = [self.bm.verts.new(c) for c in corners]
        faces = [
            self.bm.faces.new((v[0], v[3], v[2], v[1])),
            self.bm.faces.new((v[4], v[5], v[6], v[7])),
        ]
        for i in range(4):
            j = (i + 1) % 4
            faces.append(self.bm.faces.new((v[i], v[j], v[j + 4], v[i + 4])))
        self._faces(faces, slot)

    def box(self, center, size, slot, rot_z=0.0):
        cx, cy, cz = center
        sx, sy, sz = (s / 2.0 for s in size)
        r = Matrix.Rotation(rot_z, 3, "Z")
        pts = []
        for z in (-sz, sz):
            for x, y in ((-sx, -sy), (sx, -sy), (sx, sy), (-sx, sy)):
                p = r @ Vector((x, y, z))
                pts.append((cx + p.x, cy + p.y, cz + p.z))
        self.quad_box(pts, slot)

    def beam(self, p0, p1, w, slot):
        p0, p1 = Vector(p0), Vector(p1)
        d = p1 - p0
        length = d.length
        if length < 1e-4:
            return
        q = d.to_track_quat("Z", "Y")
        h = w / 2.0
        pts = []
        for z in (0.0, length):
            for x, y in ((-h, -h), (h, -h), (h, h), (-h, h)):
                pts.append(tuple(p0 + q @ Vector((x, y, z))))
        self.quad_box(pts, slot)

    def prism(self, outline, z0, z1, slot_side, slot_top, slot_bottom=None):
        """Extrudes a simple (possibly concave) CCW outline between z0 and z1; caps are ear-clipped."""
        bot = [self.bm.verts.new((x, y, z0)) for x, y in outline]
        top = [self.bm.verts.new((x, y, z1)) for x, y in outline]
        n = len(outline)
        sides = [self.bm.faces.new((bot[i], bot[(i + 1) % n], top[(i + 1) % n], top[i])) for i in range(n)]
        self._faces(sides, slot_side)
        cap_t = self.bm.faces.new(top)
        cap_b = self.bm.faces.new(list(reversed(bot)))
        self._faces([cap_t], slot_top)
        self._faces([cap_b], slot_bottom or slot_side)
        bmesh.ops.triangulate(self.bm, faces=[cap_t, cap_b], quad_method="BEAUTY", ngon_method="EAR_CLIP")

    def lathe(self, profile, segments, slot, z_offset=0.0, center=(0.0, 0.0)):
        """profile: list of (radius, z) bottom to top; revolved about +Z."""
        rings = []
        for k in range(segments):
            a = 2 * math.pi * k / segments
            rings.append([self.bm.verts.new((center[0] + r * math.cos(a), center[1] + r * math.sin(a), z + z_offset))
                          for r, z in profile])
        faces = []
        for k in range(segments):
            a, b = rings[k], rings[(k + 1) % segments]
            for i in range(len(profile) - 1):
                if profile[i][0] < 1e-5 and profile[i + 1][0] < 1e-5:
                    continue
                faces.append(self.bm.faces.new((a[i], b[i], b[i + 1], a[i + 1])))
        self._faces(faces, slot)

    def finish(self, collection, empties=()):
        bmesh.ops.remove_doubles(self.bm, verts=self.bm.verts, dist=1e-5)
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        me = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(me)
        self.bm.free()
        for s in SLOTS:
            me.materials.append(new_mat(s))
        ob = bpy.data.objects.new(self.name, me)
        collection.objects.link(ob)
        for name, pos in empties:
            e = bpy.data.objects.new(name, None)
            e.empty_display_size = 0.5
            e.location = pos
            e.parent = ob
            collection.objects.link(e)
        return ob


# ----------------------------------------------------------------------------- pieces

def lattice_faces(m, x0, x1, y0, y1, z0, z1, col, brace, slot="steel"):
    """Square lattice bay: four corner columns, ring girts at z0 and z1, X bracing on the four faces."""
    corners = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
    for x, y in corners:
        m.beam((x, y, z0), (x, y, z1), col, slot)
    for z in (z0, z1):
        for i in range(4):
            a, b = corners[i], corners[(i + 1) % 4]
            m.beam((a[0], a[1], z), (b[0], b[1], z), brace * 1.3, slot)
    for i in range(4):
        a, b = corners[i], corners[(i + 1) % 4]
        m.beam((a[0], a[1], z0), (b[0], b[1], z1), brace, slot)
        m.beam((b[0], b[1], z0), (a[0], a[1], z1), brace, slot)


def build_deck(col):
    m = Mesh("pad_deck")
    a = DECK_R * math.cos(math.pi / 8)
    w = TRENCH_W / 2
    outline = []
    for k in range(8):
        ang = -math.pi / 8 + k * math.pi / 4
        if k == 0:
            # +X edge carries the flame trench notch (trench runs from under the mount to the deck edge along +X).
            outline += [(DECK_R * math.cos(ang), DECK_R * math.sin(ang)), (a, -w), (-w - 2.0, -w), (-w - 2.0, w), (a, w)]
        else:
            outline.append((DECK_R * math.cos(ang), DECK_R * math.sin(ang)))
    m.prism(outline, -0.6, DECK_H, "concrete", "concrete")
    # Trench: floor, side walls, back wall and the curved flame deflector under the mount.
    x_back, x_end = -w - 2.0, a + 6.0
    m.box(((x_back + x_end) / 2, 0, -TRENCH_D - 0.5), (x_end - x_back, TRENCH_W + 2, 1.0), "concrete_dark")
    for s in (-1, 1):
        m.box(((x_back + x_end) / 2, s * (w + 0.5), (-TRENCH_D + DECK_H) / 2 - 0.3), (x_end - x_back, 1.0, TRENCH_D + DECK_H - 0.6), "concrete_dark")
    m.box((x_back - 0.5, 0, (-TRENCH_D + DECK_H) / 2), (1.0, TRENCH_W, TRENCH_D + DECK_H), "concrete_dark")
    steps = 10
    for i in range(steps):
        t0, t1 = i / steps, (i + 1) / steps
        def ramp(t):
            return x_back + 14.0 * t, -TRENCH_D + (TRENCH_D + 1.0) * (1 - t) ** 2
        (xa, za), (xb, zb) = ramp(t0), ramp(t1)
        m.quad_box([(xa, -w, za - 0.4), (xb, -w, zb - 0.4), (xb, w, zb - 0.4), (xa, w, za - 0.4),
                    (xa, -w, za), (xb, -w, zb), (xb, w, zb), (xa, w, za)], "steel")
    # Deck markings: a thin ring and four tie-down pads (raised 2 cm, no text, no logos).
    ring = 20.0
    for k in range(48):
        a0, a1 = 2 * math.pi * k / 48, 2 * math.pi * (k + 0.6) / 48
        p0 = (ring * math.cos(a0), ring * math.sin(a0), DECK_H + 0.01)
        p1 = (ring * math.cos(a1), ring * math.sin(a1), DECK_H + 0.01)
        if abs(p0[1]) < w + 1 and p0[0] > 0:
            continue
        m.beam(p0, p1, 0.35, "marking")
    for sx, sy in ((1, 1), (-1, 1), (-1, -1), (1, -1)):
        m.box((sx * 30.0, sy * 18.0, DECK_H + 0.15), (3.0, 3.0, 0.3), "detail_dark")
    return m.finish(col)


def build_mount(col):
    m = Mesh("pad_mount")
    s, hole, top = MOUNT_SIZE / 2, MOUNT_HOLE / 2, MOUNT_TOP
    t = 1.8
    # Table: four slabs around the exhaust opening.
    m.box((0, (s + hole) / 2, top - t / 2), (2 * s, s - hole, t), "steel")
    m.box((0, -(s + hole) / 2, top - t / 2), (2 * s, s - hole, t), "steel")
    m.box(((s + hole) / 2, 0, top - t / 2), (s - hole, 2 * hole, t), "steel")
    m.box((-(s + hole) / 2, 0, top - t / 2), (s - hole, 2 * hole, t), "steel")
    # Legs, kept clear of the trench.
    for sx in (-1, 1):
        for sy in (-1, 1):
            m.box((sx * (s - 1.6), sy * (s - 1.6), (DECK_H + top - t) / 2), (2.4, 2.4, top - t - DECK_H), "steel")
    # Exhaust ring and four hold-down clamps (not touching the vehicle footprint).
    m.lathe([(hole + 0.05, top), (hole + 0.6, top), (hole + 0.6, top + 0.25), (hole + 0.05, top + 0.25), (hole + 0.05, top)], 48, "detail_dark")
    for k in range(4):
        ang = math.pi / 4 + k * math.pi / 2
        m.box(((hole + 1.6) * math.cos(ang), (hole + 1.6) * math.sin(ang), top + 0.7), (1.2, 1.2, 1.4), "warning_red", rot_z=ang)
    # Water deluge rain-birds on the corners.
    for k in range(4):
        ang = k * math.pi / 2
        x, y = (s - 0.8) * math.cos(ang), (s - 0.8) * math.sin(ang)
        m.beam((x, y, top), (x, y, top + 3.0), 0.35, "detail_dark")
        m.box((x, y, top + 3.1), (1.0, 1.0, 0.4), "detail_dark")
    return m.finish(col, empties=[("VehicleMount", (0.0, 0.0, VEHICLE_MOUNT_Z))])


def build_gantry_segment(col):
    m = Mesh("pad_gantry_segment")
    h = GANTRY_W / 2
    lattice_faces(m, -h, h, -h, h, 0.0, SEG_H, 0.55, 0.22)
    # Mid girt, floor grating at the top, an elevator shaft core and stair stringers.
    for z in (SEG_H / 2,):
        for (ax, ay), (bx, by) in (((-h, -h), (h, -h)), ((h, -h), (h, h)), ((h, h), (-h, h)), ((-h, h), (-h, -h))):
            m.beam((ax, ay, z), (bx, by, z), 0.22, "steel")
    m.box((0, 0, SEG_H - 0.12), (GANTRY_W - 0.6, GANTRY_W - 0.6, 0.18), "grating")
    m.box((-1.4, -1.4, SEG_H / 2), (2.6, 2.6, SEG_H - 0.4), "detail_dark")
    m.beam((1.0, 1.5, 0.2), (3.6, 1.5, SEG_H - 0.3), 0.18, "steel")
    m.beam((1.0, 2.9, 0.2), (3.6, 2.9, SEG_H - 0.3), 0.18, "steel")
    # Red aviation light at one corner of every segment (emissive practical).
    m.box((h + 0.25, h + 0.25, SEG_H - 0.3), (0.35, 0.35, 0.35), "warning_red")
    return m.finish(col, empties=[("attach_top", (0, 0, SEG_H))])


def build_gantry_crown(col):
    m = Mesh("pad_gantry_crown")
    h = GANTRY_W / 2
    lattice_faces(m, -h, h, -h, h, 0.0, 4.0, 0.55, 0.22)
    m.box((0, 0, 4.1), (GANTRY_W + 0.6, GANTRY_W + 0.6, 0.25), "steel")
    # Crane mast (the slewing jib attaches at crane_pivot) and the lightning rod.
    m.lathe([(1.4, 4.2), (1.4, 8.0), (0.9, 8.6), (0.0, 8.6)], 16, "steel")
    m.beam((h - 0.5, h - 0.5, 4.2), (h - 0.5, h - 0.5, 16.0), 0.12, "detail_dark")
    m.box((h - 0.5, h - 0.5, 16.1), (0.3, 0.3, 0.3), "warning_red")
    return m.finish(col, empties=[("crane_pivot", (0.0, 0.0, 8.6))])


def build_crane_jib(col):
    """Hammerhead jib, pivot at origin, reaching along +X to the vehicle axis; trolley/hook hangs from hook_point."""
    m = Mesh("pad_crane_jib")
    reach, back, d = 26.0, 9.0, 1.6
    for y in (-d / 2, d / 2):
        m.beam((-back, y, 0.2), (reach, y, 0.2), 0.3, "steel")
        m.beam((-back, y, 0.2 + d), (reach - 2.0, y, 0.2 + d), 0.25, "steel")
    x = -back
    while x < reach - 2.5:
        for y in (-d / 2, d / 2):
            m.beam((x, y, 0.2), (x + 2.0, y, 0.2 + d), 0.14, "steel")
        m.beam((x, -d / 2, 0.2), (x, d / 2, 0.2), 0.14, "steel")
        x += 2.0
    m.box((-back + 1.5, 0, -0.6), (3.0, 2.6, 2.2), "concrete_dark")      # counterweight
    m.box((0, 0, 1.0), (2.2, 2.2, 2.0), "detail_dark")                  # slewing cab
    m.box((reach - 2.5, 0, -0.1), (1.6, 2.0, 0.6), "detail_dark")       # trolley
    m.box((reach - 1.0, d / 2 + 0.2, 0.3), (0.25, 0.25, 0.25), "warning_red")
    return m.finish(col, empties=[("hook_point", (reach - 2.5, 0.0, -0.4))])


def build_crane_hook(col):
    m = Mesh("pad_crane_hook")
    m.box((0, 0, -0.5), (1.4, 0.6, 1.0), "warning_red")
    m.lathe([(0.0, -1.6), (0.25, -1.6), (0.35, -1.2), (0.25, -1.0), (0.0, -1.0)], 12, "detail_dark")
    m.beam((0, 0, -1.6), (0.5, 0, -2.1), 0.15, "detail_dark")
    return m.finish(col)


def build_cable(col):
    """Unit cable, 1 m long downward from the origin; Unity scales it in Y."""
    m = Mesh("pad_cable")
    m.lathe([(0.0, -1.0), (0.04, -1.0), (0.04, 0.0), (0.0, 0.0)], 8, "cable")
    return m.finish(col)


def build_umbilical_arm(col):
    """Swing arm, hinge at origin on the tower face, reaching along +X; hood at the tip."""
    m = Mesh("pad_umbilical_arm")
    length, d = 10.0, 1.6
    for y in (-d / 2, d / 2):
        for z in (0.0, d):
            m.beam((0, y, z), (length, y, z), 0.18, "steel")
    x = 0.0
    while x < length - 0.1:
        m.beam((x, -d / 2, 0), (x + 1.25, d / 2, d), 0.1, "steel")
        m.beam((x, -d / 2, d), (x + 1.25, d / 2, 0), 0.1, "steel")
        x += 1.25
    m.box((length - 0.4, 0, d / 2), (0.8, 2.6, 2.4), "detail_dark")
    m.beam((0.5, 0, d + 0.15), (length - 0.8, 0, d + 0.15), 0.25, "warning_red")  # umbilical bundle
    return m.finish(col)


def build_lightning_mast(col):
    m = Mesh("pad_lightning_mast")
    h, r = 70.0, 1.6
    pts = [(r * math.cos(a), r * math.sin(a)) for a in (0, 2 * math.pi / 3, 4 * math.pi / 3)]
    for i in range(3):
        m.beam((pts[i][0] * 1.6, pts[i][1] * 1.6, 0), (pts[i][0] * 0.6, pts[i][1] * 0.6, h), 0.3, "steel")
    z = 0.0
    while z < h - 4:
        t0, t1 = 1.6 - z / h, 1.6 - (z + 4) / h
        for i in range(3):
            a, b = pts[i], pts[(i + 1) % 3]
            m.beam((a[0] * t0, a[1] * t0, z), (b[0] * t1, b[1] * t1, z + 4), 0.1, "steel")
        z += 4
    m.beam((0, 0, h), (0, 0, h + 8.0), 0.15, "detail_dark")
    m.box((0, 0, h + 8.1), (0.4, 0.4, 0.4), "warning_red")
    m.box((0, 0, 0.5), (5, 5, 1.0), "concrete")
    return m.finish(col)


def build_floodlight(col):
    m = Mesh("pad_floodlight")
    m.lathe([(0.25, 0), (0.18, 14.0), (0.0, 14.0)], 10, "detail_dark")
    m.box((0, 0, 14.4), (3.0, 0.5, 1.4), "detail_dark")
    for i in range(3):
        m.box((-1.0 + i, -0.27, 14.4), (0.8, 0.06, 1.0), "lamp")
    m.box((0, 0, 0.4), (1.6, 1.6, 0.8), "concrete")
    return m.finish(col, empties=[("lamp", (0.0, -0.4, 14.4))])


def build_site(col):
    # Low hills ring (distant, low contrast): a coarse ring with a gently varying silhouette.
    m = Mesh("site_hills")
    seg = 96
    inner, outer = 900.0, 1300.0
    rings = []
    for k in range(seg):
        a = 2 * math.pi * k / seg
        hgt = 22 + 14 * math.sin(3 * a + 0.7) + 9 * math.sin(7 * a + 1.3) + 5 * math.sin(13 * a)
        ca, sa = math.cos(a), math.sin(a)
        rings.append([m.bm.verts.new((inner * ca, inner * sa, -2)), m.bm.verts.new((1.08 * inner * ca, 1.08 * inner * sa, hgt)),
                      m.bm.verts.new((outer * ca, outer * sa, hgt * 0.6))])
    faces = []
    for k in range(seg):
        a, b = rings[k], rings[(k + 1) % seg]
        faces.append(m.bm.faces.new((a[0], b[0], b[1], a[1])))
        faces.append(m.bm.faces.new((a[1], b[1], b[2], a[2])))
    m._faces(faces, "concrete_dark")
    m.finish(col)

    g = Mesh("site_ground")
    g.prism([(1400.0 * math.cos(2 * math.pi * k / 64), 1400.0 * math.sin(2 * math.pi * k / 64)) for k in range(64)],
            -2.0, 0.0, "concrete_dark", "concrete_dark")
    g.finish(col)

    b = Mesh("site_hangar")  # vertical integration building silhouette, far behind the pad
    b.box((0, 0, 40), (90, 70, 80), "concrete")
    for i in range(9):
        b.box((-40 + i * 10, -35.2, 40), (0.8, 0.6, 80), "detail_dark")
    b.box((0, -35.3, 30), (30, 0.6, 60), "detail_dark")
    b.box((44.0, -30.0, 81.0), (1.0, 1.0, 1.0), "warning_red")
    b.finish(col)

    w = Mesh("site_water_tower")
    w.lathe([(2.0, 0), (1.2, 50), (1.2, 52), (7.0, 56), (7.0, 64), (0.0, 68)], 20, "concrete")
    w.finish(col)


def build_scale_refs(col):
    h = Mesh("ref_human")  # stylised person, 1.75 m (real_world_approximate)
    h.lathe([(0.0, 0.0), (0.16, 0.0), (0.18, 0.9), (0.22, 1.05), (0.2, 1.45), (0.08, 1.5), (0.0, 1.5)], 14, "ghost")
    h.lathe([(0.0, 1.5), (0.11, 1.55), (0.12, 1.66), (0.0, 1.75)], 14, "ghost")
    h.finish(col)

    b = Mesh("ref_building")  # ten storeys, 30 m (3 m per storey, real_world_approximate)
    b.box((0, 0, 15), (18, 14, 30), "ghost")
    for i in range(1, 10):
        b.box((0, -7.05, i * 3.0), (18.1, 0.2, 0.25), "ghost")
    b.finish(col)

    s = Mesh("ref_saturn_v")  # generic silhouette: 110.6 m tall, 10.1 m wide (real_world_approximate), no markings
    r = 10.1 / 2
    prof = [(0.0, 0.0), (r * 0.9, 0.0), (r * 1.18, 1.0), (r, 3.0), (r, 42.0), (r, 66.9), (r * 0.66, 72.0),
            (r * 0.66, 84.7), (r * 0.66, 88.0), (r * 0.39, 95.0), (r * 0.39, 99.0), (r * 0.12, 103.0),
            (0.12, 110.6), (0.0, 110.6)]
    s.lathe(prof, 32, "ghost")
    s.finish(col)

    t = Mesh("tech_worker")  # stylised technician: suit, helmet, skin tone set per instance in Unity
    t.lathe([(0.0, 0.0), (0.17, 0.0), (0.19, 0.85), (0.24, 1.0), (0.23, 1.42), (0.09, 1.5), (0.0, 1.5)], 12, "suit")
    t.lathe([(0.0, 1.5), (0.1, 1.53), (0.11, 1.62), (0.0, 1.66)], 12, "skin")
    t.lathe([(0.0, 1.6), (0.135, 1.62), (0.14, 1.7), (0.0, 1.78)], 12, "warning_red")
    t.box((0.0, 0.0, 1.1), (0.52, 0.06, 0.08), "marking")  # hi-vis band
    t.finish(col)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    col = scene.collection
    builders = [build_deck, build_mount, build_gantry_segment, build_gantry_crown, build_crane_jib, build_crane_hook,
                build_cable, build_umbilical_arm, build_lightning_mast, build_floodlight, build_site, build_scale_refs]
    for b in builders:
        b(col)
    os.makedirs(MODELS, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, "launchpad.blend"))
    meshes = [o for o in scene.objects if o.type == "MESH"]
    for ob in meshes:
        bpy.ops.object.select_all(action="DESELECT")
        ob.select_set(True)
        for child in ob.children:
            child.select_set(True)
        bpy.context.view_layer.objects.active = ob
        path = os.path.join(MODELS, ob.name + ".fbx")
        bpy.ops.export_scene.fbx(
            filepath=path, use_selection=True, object_types={"EMPTY", "MESH"},
            apply_scale_options="FBX_SCALE_UNITS", bake_space_transform=True,
            axis_forward="-Z", axis_up="Y", mesh_smooth_type="OFF", use_mesh_modifiers=True,
            add_leaf_bones=False, bake_anim=False, colors_type="LINEAR", use_custom_props=False)
        tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
        print("PIECE", ob.name, "tris", tris, "->", path)
    print("DONE", len(meshes))


main()
