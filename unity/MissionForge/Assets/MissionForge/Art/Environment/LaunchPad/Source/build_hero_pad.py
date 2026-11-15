"""MissionForge hero launch-pad pieces (T034 rework, rubric M1/M3/M6/M10): a clad service tower and a legged mount.

Run headless:
    /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
        --python unity/MissionForge/Assets/MissionForge/Art/Environment/LaunchPad/Source/build_hero_pad.py [-- --preview DIR]

Writes Source/hero_pad.blend and one FBX per piece to ../Models/Hero/ (same export settings as build_launchpad.py:
metres, +Z up in Blender, bevels and hardened custom normals baked in; Unity imports the normals for Models/Hero/).

The pieces keep the LaunchPadRig contracts of T015 so the tower still grows with the vehicle:
    hero_tower_segment_a/b  one 8 m storey (SEG_H) on a 9 m square footprint (GANTRY_W), origin at the storey floor,
                            +X faces the vehicle axis (the rig turns the tower so), -Y faces the camera (CAM).
    hero_tower_crown        the 8.6 m machine house on top; empty crane_pivot at (0, 0, 8.6) like pad_gantry_crown.
    hero_tower_base         the plant building that wraps the tower foot (origin at the tower centre, deck level).
    hero_launch_mount       legged table on the deck; origin at the pad axis on grade, table top at MOUNT_TOP.
    hero_crane_hook         hook block hanging from its origin (the cable ends at the origin), down to about -2.6 m.

Every dimension is a game_value (stylised from 2010s-2020s pads and frame 02, not a survey of a real pad).
Rework 2 (issue #147): every piece now has just two material slots, hero_atlas and concrete. The paint names used
below (hero_white, hero_teal, hero_clad, hero_core, hero_rail, hero_pipe, hero_dark, grating, lamp, warning_red,
glow_warm, window, hose, panel_seam, soot) are swatches of the colour atlas in hero_atlas.py: a face's UVs point at its
swatch, and Unity draws the whole piece with LP_hero_atlas (one draw per pass instead of up to eleven, rubric M9).
Bevels are two-tier (rubric M6): forms whose smallest side is at least BIG_FORM_M get BEVEL_BIG_M (12 cm), the rest
BEVEL_SMALL_M.
"""
from __future__ import annotations

import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import hero_atlas  # noqa: E402  (sibling module, needs HERE on the path inside Blender)

MODELS = os.path.normpath(os.path.join(HERE, "..", "Models", "Hero"))
TEXTURES = os.path.normpath(os.path.join(HERE, "..", "Textures"))
SLOTS = ["hero_atlas", "concrete"]

# ----------------------------------------------------------------------------- dimensions (game_value, m)
SEG_H = 8.0          # LaunchPadRig.SegmentHeightM
GANTRY_W = 9.0       # LaunchPadRig.TowerHalfWidthM * 2
H = GANTRY_W / 2
CAM = -1.0           # sign of the Blender Y face that turns toward the Build Bay camera
DECK_H = 2.0         # LaunchPadRig.DeckTopM
MOUNT_TOP = 12.0     # table top above grade (VehicleMount at 10.5 m sits inside the opening)
MOUNT_HALF = 11.0    # table half-side (T015 MOUNT_SIZE / 2): its 15.6 m diagonal clears the tower platforms at 16.2 m
HOLE = 5.6           # exhaust opening half-side
BEVEL_BIG_M = 0.12   # bevel on big forms (rubric M6 asks 8-15 cm), weight-limited
BEVEL_SMALL_M = 0.02 # bevel on members thinner than BIG_FORM_M (rails, braces, treads), angle-limited
BIG_FORM_M = 0.5     # smallest box side that counts as a big form


def new_mat(name):
    """Blender-side material for a slot: the atlas albedo image on hero_atlas (preview only), grey on concrete."""
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    if name == "hero_atlas":
        img_path = os.path.join(TEXTURES, "Hero_atlas_albedo.png")
        if os.path.exists(img_path):
            tex = m.node_tree.nodes.new("ShaderNodeTexImage")
            tex.image = bpy.data.images.load(img_path, check_existing=True)
            tex.interpolation = "Closest"
            m.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    else:
        bsdf.inputs["Base Color"].default_value = (0.45, 0.45, 0.43, 1.0)
    return m


class Mesh:
    """bmesh helper: boxes, beams, tubes, lathes and stairs with one material slot per face."""

    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new("UVMap")
        self.weight = self.bm.edges.layers.float.new("bevel_weight_edge")

    def _slot(self, faces, slot):
        """concrete -> slot 1 (box-projected in Unity); any other name -> slot 0 with UVs on its atlas swatch."""
        if slot == "concrete":
            for f in faces:
                f.material_index = 1
            return
        uv = hero_atlas.uv_of(slot)
        for f in faces:
            f.material_index = 0
            for loop in f.loops:
                loop[self.uv].uv = uv

    def quad_box(self, c, slot):
        v = [self.bm.verts.new(p) for p in c]
        faces = [self.bm.faces.new((v[0], v[3], v[2], v[1])), self.bm.faces.new((v[4], v[5], v[6], v[7]))]
        for i in range(4):
            j = (i + 1) % 4
            faces.append(self.bm.faces.new((v[i], v[j], v[j + 4], v[i + 4])))
        self._slot(faces, slot)
        sides = ((Vector(c[1]) - Vector(c[0])).length, (Vector(c[3]) - Vector(c[0])).length,
                 (Vector(c[4]) - Vector(c[0])).length)
        if min(sides) >= BIG_FORM_M:   # big form: the 12 cm weight-limited bevel catches the sun at bay distance
            for f in faces:
                for e in f.edges:
                    e[self.weight] = 1.0

    def box(self, center, size, slot):
        cx, cy, cz = center
        sx, sy, sz = (s / 2.0 for s in size)
        pts = []
        for z in (-sz, sz):
            for x, y in ((-sx, -sy), (sx, -sy), (sx, sy), (-sx, sy)):
                pts.append((cx + x, cy + y, cz + z))
        self.quad_box(pts, slot)

    def span(self, x0, x1, y0, y1, z0, z1, slot):
        self.box(((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), (abs(x1 - x0), abs(y1 - y0), abs(z1 - z0)), slot)

    def beam(self, p0, p1, w, slot, d=None):
        p0, p1 = Vector(p0), Vector(p1)
        dv = p1 - p0
        if dv.length < 1e-4:
            return
        q = dv.to_track_quat("Z", "Y")
        hx, hy = w / 2.0, (d if d is not None else w) / 2.0
        pts = []
        for z in (0.0, dv.length):
            for x, y in ((-hx, -hy), (hx, -hy), (hx, hy), (-hx, hy)):
                pts.append(tuple(p0 + q @ Vector((x, y, z))))
        self.quad_box(pts, slot)

    def tube(self, p0, p1, r, slot, sides=12):
        """Closed cylinder between two points."""
        p0, p1 = Vector(p0), Vector(p1)
        dv = p1 - p0
        q = dv.to_track_quat("Z", "Y")
        rings = []
        for z in (0.0, dv.length):
            rings.append([self.bm.verts.new(tuple(p0 + q @ Vector((r * math.cos(2 * math.pi * k / sides),
                                                                     r * math.sin(2 * math.pi * k / sides), z))))
                          for k in range(sides)])
        faces = [self.bm.faces.new((rings[0][k], rings[0][(k + 1) % sides], rings[1][(k + 1) % sides], rings[1][k]))
                 for k in range(sides)]
        faces.append(self.bm.faces.new(list(reversed(rings[0]))))
        faces.append(self.bm.faces.new(rings[1]))
        self._slot(faces, slot)

    def lathe(self, profile, sides, slot, center=(0.0, 0.0, 0.0)):
        rings = []
        for k in range(sides):
            a = 2 * math.pi * k / sides
            rings.append([self.bm.verts.new((center[0] + r * math.cos(a), center[1] + r * math.sin(a), center[2] + z))
                          for r, z in profile])
        faces = []
        for k in range(sides):
            a, b = rings[k], rings[(k + 1) % sides]
            for i in range(len(profile) - 1):
                if profile[i][0] < 1e-5 and profile[i + 1][0] < 1e-5:
                    continue
                faces.append(self.bm.faces.new((a[i], b[i], b[i + 1], a[i + 1])))
        self._slot(faces, slot)

    def railing(self, pts, z, slot="hero_rail", height=1.1, post_every=1.6):
        """Guard rail along a polyline at deck height z: posts, top rail and knee rail."""
        for a, b in zip(pts, pts[1:]):
            a3, b3 = Vector((a[0], a[1], z)), Vector((b[0], b[1], z))
            n = max(1, int((b3 - a3).length / post_every))
            for i in range(n + 1):
                p = a3.lerp(b3, i / n)
                self.beam(p, p + Vector((0, 0, height)), 0.06, slot)
            self.beam(a3 + Vector((0, 0, height)), b3 + Vector((0, 0, height)), 0.07, slot)
            self.beam(a3 + Vector((0, 0, height * 0.5)), b3 + Vector((0, 0, height * 0.5)), 0.05, slot)
            self.beam(a3 + Vector((0, 0, 0.08)), b3 + Vector((0, 0, 0.08)), 0.03, slot, d=0.16)  # toe board

    def stairs(self, x0, y0, z0, x1, z1, width, slot_tread="grating", slot_side="hero_teal", axis="x"):
        """Straight flight from (x0, y0, z0) rising to z1 at x1 (along X, or along Y when axis='y'); width across."""
        rise = z1 - z0
        n = max(2, int(round(rise / 0.19)))
        run = (x1 - x0) / n
        def p(u, v, z):
            return (u, v, z) if axis == "x" else (v, u, z)
        for i in range(n):
            u = x0 + run * (i + 0.5)
            z = z0 + rise * (i + 1) / n
            c = p(u, y0, z - 0.03)
            s = p(abs(run) * 1.05, width, 0.06)
            self.box(c, s, slot_tread)
        for side in (-1, 1):
            v = y0 + side * (width / 2 + 0.06)
            self.beam(p(x0, v, z0 - 0.25), p(x1, v, z1 - 0.25), 0.1, slot_side, d=0.32)
            rail_a, rail_b = p(x0, v, z0 + 0.9), p(x1, v, z1 + 0.9)
            self.beam(rail_a, rail_b, 0.07, "hero_rail")
            for t in (0.0, 0.33, 0.66, 1.0):
                q = Vector(p(x0, v, z0)).lerp(Vector(p(x1, v, z1)), t)
                self.beam(q, q + Vector((0, 0, 0.9)), 0.06, "hero_rail")

    def lamp(self, at, facing_down=True):
        """Small bulkhead lamp: dark housing with an emissive lens (a practical, no Light)."""
        x, y, z = at
        self.box((x, y, z + 0.1), (0.55, 0.32, 0.18), "hero_dark")
        self.box((x, y, z - 0.005 if facing_down else z + 0.2), (0.42, 0.22, 0.03), "lamp")

    def finish(self, collection, empties=(), bevel=True):
        bmesh.ops.remove_doubles(self.bm, verts=self.bm.verts, dist=1e-5)
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        me = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(me)
        self.bm.free()
        for s in SLOTS:
            me.materials.append(new_mat(s))
        ob = bpy.data.objects.new(self.name, me)
        collection.objects.link(ob)
        for p in me.polygons:
            p.use_smooth = True
        if bevel:
            big = ob.modifiers.new("BevelBig", "BEVEL")
            big.width = BEVEL_BIG_M
            big.segments = 3
            big.limit_method = "WEIGHT"
            try:
                big.edge_weight = "bevel_weight_edge"   # Blender 4.3+: named attribute
            except AttributeError:
                pass
            big.harden_normals = True
            big.miter_outer = "MITER_ARC"
            small = ob.modifiers.new("BevelSmall", "BEVEL")
            small.width = BEVEL_SMALL_M
            small.segments = 2
            small.limit_method = "ANGLE"
            small.angle_limit = math.radians(50)   # box corners only: 8+ sided tubes (45 deg) and the big bevel steps stay
            small.harden_normals = True
            small.miter_outer = "MITER_ARC"
        wn = ob.modifiers.new("WeightedNormal", "WEIGHTED_NORMAL")
        wn.keep_sharp = True
        wn.mode = "FACE_AREA"
        try:  # Blender 4.1+: auto smooth is a modifier; sharp edges by angle keep flat faces flat
            bpy.context.view_layer.objects.active = ob
            ob.select_set(True)
            bpy.ops.object.shade_smooth_by_angle(angle=math.radians(50), keep_sharp_edges=True)
            ob.select_set(False)
        except Exception as exc:  # noqa: BLE001 - older Blender: fall back to the mesh flag
            print("smooth-by-angle unavailable:", exc)
        for name, pos in empties:
            e = bpy.data.objects.new(name, None)
            e.empty_display_size = 0.5
            e.location = pos
            e.parent = ob
            collection.objects.link(e)
        return ob


# ----------------------------------------------------------------------------- tower

def tower_storey(m, variant):
    """One 8 m storey: white columns and girts, teal cladding on the back and the camera-left half, braced open
    bays, two foil-wrapped cryo lines inside, a pipe run on the camera face and a vehicle-side work platform."""
    col, girt = 0.62, 0.42
    c = CAM
    # Columns (light structural steel) with base plates.
    for x in (-H, H):
        for y in (-H, H):
            m.box((x, y, SEG_H / 2), (col, col, SEG_H), "hero_white")
    # Ring girts top and mid.
    for z in (0.25, SEG_H / 2):
        m.span(-H, H, -H - 0.18, -H + 0.18, z - 0.18, z + 0.18, "hero_white")
        m.span(-H, H, H - 0.18, H + 0.18, z - 0.18, z + 0.18, "hero_white")
        m.span(-H - 0.18, -H + 0.18, -H, H, z - 0.18, z + 0.18, "hero_white")
        m.span(H - 0.18, H + 0.18, -H, H, z - 0.18, z + 0.18, "hero_white")
    # Back face (-X): full cladding, panel seams every 1.5 m, recessed 0.25 m behind the column face.
    xb = -H + 0.05
    for i in range(6):
        y0 = -H + 0.35 + i * (GANTRY_W - 0.7) / 6
        m.span(xb - 0.12, xb + 0.04, y0 + 0.04, y0 + (GANTRY_W - 0.7) / 6 - 0.04, 0.45, SEG_H - 0.05, "hero_clad")
    # Camera face: the back two thirds clad, the front third open with a teal K-brace.
    yf = c * (H - 0.05)
    for i in range(4):
        x0 = -H + 0.35 + i * 1.3
        m.span(x0 + 0.04, x0 + 1.26, yf - 0.06, yf + 0.1 * c, 0.45, SEG_H - 0.05, "hero_clad")
    m.beam((0.0, c * H, 0.4), (H - 0.3, c * H, SEG_H / 2 - 0.1), 0.28, "hero_teal")
    m.beam((H - 0.3, c * H, SEG_H / 2 + 0.1), (0.0, c * H, SEG_H - 0.2), 0.28, "hero_teal")
    # Far face (+Y from the camera) and vehicle face (+X): open X bracing in teal.
    for (ax, ay), (bx, by) in (((-H, -c * H), (H, -c * H)), ((H, -H), (H, H))):
        m.beam((ax, ay, 0.4), (bx, by, SEG_H / 2 - 0.1), 0.24, "hero_teal")
        m.beam((bx, by, SEG_H / 2 + 0.1), (ax, ay, SEG_H - 0.2), 0.24, "hero_teal")
    # Floor grating at the storey top and an elevator/stair core.
    m.span(-H + 0.3, H - 0.3, -H + 0.3, H - 0.3, SEG_H - 0.18, SEG_H - 0.02, "grating")
    m.span(-3.4, -1.0, -c * 0.8, -c * 3.6, 0.2, SEG_H - 0.2, "hero_dark")
    # Two foil-wrapped cryo lines (warm gold) inside the open front half, with band clamps.
    for (x, y, r) in ((1.6, c * 1.5, 0.55), (2.9, c * 0.1, 0.42)):
        m.tube((x, y, 0.0), (x, y, SEG_H), r, "hero_core", sides=16)
        for z in (1.0, 3.6, 6.2):
            m.tube((x, y, z), (x, y, z + 0.18), r + 0.06, "hero_pipe", sides=16)
    # Pipe run outside the camera face: two bare steel pipes on stand-off brackets, flanges every storey.
    for (x, r) in ((-2.4, 0.24), (-1.6, 0.17)):
        y = c * (H + 0.75)
        m.tube((x, y, 0.0), (x, y, SEG_H), r, "hero_pipe", sides=12)
        m.tube((x, y, 0.1), (x, y, 0.32), r + 0.09, "hero_pipe", sides=12)
        for z in (2.0, 6.0):
            m.beam((x, c * H, z), (x, y, z), 0.12, "hero_white")
    # Vehicle-side work platform (+X), cantilevered 2.8 m, 6.4 m wide, on two teal knee braces, lamps beneath.
    z = SEG_H - 0.02
    out = H + 2.8
    m.span(H, out, -3.2, 3.2, z - 0.16, z, "grating")
    m.span(H, out, -3.2, -2.95, z - 0.55, z - 0.16, "hero_teal")
    m.span(H, out, 2.95, 3.2, z - 0.55, z - 0.16, "hero_teal")
    m.span(out - 0.25, out, -3.2, 3.2, z - 0.55, z - 0.16, "hero_teal")
    for y in (-2.8, 2.8):
        m.beam((H + 0.1, y, z - 2.6), (out - 0.3, y, z - 0.5), 0.22, "hero_teal")
    m.railing([(H + 0.2, -3.15), (out - 0.1, -3.15), (out - 0.1, 3.15), (H + 0.2, 3.15)], z)
    m.lamp((H + 1.0, -1.6, z - 0.75))
    m.lamp((H + 1.0, 1.6, z - 0.75))
    if variant == "b":
        # Camera-side balcony half a storey up (frame 02 left platforms), with a lamp under it.
        zb = SEG_H / 2 + 0.2
        yo = c * (H + 2.4)
        m.span(-H - 1.4, 1.2, c * H, yo, zb - 0.16, zb, "grating")
        m.span(-H - 1.4, 1.2, yo - 0.12, yo + 0.12, zb - 0.5, zb - 0.16, "hero_teal")
        m.beam((-H - 1.2, c * H, zb - 2.2), (-H - 1.2, yo, zb - 0.4), 0.2, "hero_teal")
        m.beam((1.0, c * H, zb - 2.2), (1.0, yo, zb - 0.4), 0.2, "hero_teal")
        m.railing([(-H - 1.35, c * H), (-H - 1.35, yo), (1.15, yo), (1.15, c * H)], zb)
        m.lamp((-1.6, c * (H + 1.2), zb - 0.7))
    # Red aviation light on the vehicle-side outer corner.
    m.box((H + 0.35, -c * (H + 0.35), SEG_H - 0.4), (0.3, 0.3, 0.3), "warning_red")


def build_tower_segment(col, variant):
    m = Mesh("hero_tower_segment_" + variant)
    tower_storey(m, variant)
    return m.finish(col, empties=[("attach_top", (0, 0, SEG_H))])


def build_tower_crown(col):
    """Machine house: clad box, roof railing, the crane slewing mast (crane_pivot) and a lightning rod."""
    m = Mesh("hero_tower_crown")
    for x in (-H, H):
        for y in (-H, H):
            m.box((x, y, 2.2), (0.62, 0.62, 4.4), "hero_white")
    m.span(-H + 0.1, H - 0.1, -H + 0.1, H - 0.1, 0.0, 4.2, "hero_clad")
    m.span(-H - 0.35, H + 0.35, -H - 0.35, H + 0.35, 4.2, 4.6, "hero_white")
    # Control-room glazing facing the camera and vehicle, with a thin warm lamp line under the eave.
    m.span(-H + 0.8, H - 0.8, CAM * (H - 0.0), CAM * (H + 0.06), 1.9, 3.1, "hero_dark")
    m.span(H, H + 0.06, -H + 0.8, H - 0.8, 1.9, 3.1, "hero_dark")
    m.span(-H + 0.8, H - 0.8, CAM * (H + 0.06), CAM * (H + 0.1), 3.95, 4.05, "lamp")
    m.railing([(-H - 0.3, -H - 0.3), (H + 0.3, -H - 0.3), (H + 0.3, H + 0.3), (-H - 0.3, H + 0.3), (-H - 0.3, -H - 0.3)], 4.6)
    m.lathe([(1.5, 4.6), (1.5, 7.8), (1.1, 8.0), (1.1, 8.6), (0.0, 8.6)], 20, "hero_teal")
    m.tube((-H + 0.6, H - 0.6, 4.6), (-H + 0.6, H - 0.6, 18.0), 0.08, "hero_dark", sides=6)
    m.box((-H + 0.6, H - 0.6, 18.1), (0.3, 0.3, 0.3), "warning_red")
    m.box((2.6, -CAM * 2.6, 5.4), (1.6, 1.6, 1.6), "hero_dark")       # winch house
    return m.finish(col)  # crane_pivot stays on the T015 crown at (0, 0, 8.6), which this house matches


def build_tower_base(col):
    """Two-storey plant building around the tower foot (frame 02): clad, with a lit door, roof railing and tanks."""
    m = Mesh("hero_tower_base")
    x0, x1, y0, y1 = -H - 5.0, H + 0.6, -H - 3.6, H + 3.0
    hgt = 6.4
    m.span(x0, x1, y0, y1, 0.0, hgt, "concrete")
    m.span(x0 - 0.2, x1 + 0.2, y0 - 0.2, y1 + 0.2, hgt, hgt + 0.35, "hero_white")
    # Teal cladding band and panel seams on the camera face.
    yc = CAM * 1.0
    face = y0 if CAM < 0 else y1
    m.span(x0 + 0.4, x1 - 0.4, face - 0.08 * yc, face + 0.0, 3.4, hgt - 0.3, "hero_clad")
    for i in range(8):
        x = x0 + 0.4 + i * (x1 - x0 - 0.8) / 8
        m.span(x, x + 0.06, face - 0.14 * yc, face, 3.4, hgt - 0.3, "hero_white")
    m.span(x0 + 2.0, x0 + 4.2, face - 0.1 * yc, face, 0.0, 2.6, "hero_dark")           # door
    m.span(x0 + 2.0, x0 + 4.2, face - 0.14 * yc, face - 0.1 * yc, 2.7, 2.85, "lamp")   # door lamp strip
    m.span(x0 + 6.0, x1 - 1.0, face - 0.1 * yc, face, 1.2, 2.2, "lamp")                # lit window strip
    m.railing([(x0, y0), (x1, y0), (x1, y1), (x0, y1), (x0, y0)], hgt + 0.35)
    # Two vertical tanks on the roof back corner and a vent.
    for (x, y) in ((x0 + 1.6, -CAM * (y1 - 1.6) if CAM < 0 else y0 + 1.6), (x0 + 4.0, -CAM * (y1 - 1.6) if CAM < 0 else y0 + 1.6)):
        m.lathe([(0.0, hgt + 0.35), (1.0, hgt + 0.35), (1.0, hgt + 3.6), (0.7, hgt + 4.1), (0.0, hgt + 4.2)], 16, "hero_white",
                center=(x, y, 0.0))
    return m.finish(col)


# ----------------------------------------------------------------------------- mount

def exhaust_pit(m, s, under):
    """Lit exhaust opening under the table: a concrete kerb round the hole footprint at deck level, a sloped steel flame
    deflector turning the plume toward +X (the trench), heat-stained throat plates under the table, and warm glow
    strips along the pit walls so the opening reads lit from the camera between the legs (frame 02)."""
    k0, k1 = HOLE + 0.4, HOLE + 1.1
    for (x0, x1, y0, y1) in ((-k1, k1, -k1, -k0), (-k1, k1, k0, k1), (-k1, -k0, -k0, k0)):
        m.span(x0, x1, y0, y1, DECK_H, DECK_H + 0.9, "concrete")
        m.span(x0, x1, y0, y1, DECK_H + 0.9, DECK_H + 1.0, "panel_seam")
    # Deflector: a ramp from 6.5 m on the tower side down to the deck at the trench mouth (+X), steel, heat-stained.
    ramp = [(-HOLE, -HOLE, DECK_H + 4.5), (-HOLE, HOLE, DECK_H + 4.5), (HOLE + 1.0, HOLE, DECK_H + 0.15),
            (HOLE + 1.0, -HOLE, DECK_H + 0.15)]
    v = [m.bm.verts.new(p) for p in ramp] + [m.bm.verts.new((p[0], p[1], DECK_H + 0.05)) for p in ramp]
    faces = [m.bm.faces.new((v[0], v[1], v[2], v[3])), m.bm.faces.new((v[7], v[6], v[5], v[4])),
             m.bm.faces.new((v[0], v[4], v[5], v[1])), m.bm.faces.new((v[1], v[5], v[6], v[2])),
             m.bm.faces.new((v[3], v[7], v[4], v[0])), m.bm.faces.new((v[2], v[6], v[7], v[3]))]
    m._slot(faces, "soot")
    # (no ribs: the review read the ribbed ramp as a staircase; edge rails only)
    for y in (-HOLE + 0.1, HOLE - 0.1):
        m.beam((-HOLE, y, DECK_H + 4.6), (HOLE + 1.0, y, DECK_H + 0.25), 0.2, "panel_seam")
    # Warm glow strips low on the kerb inner faces and on the far wall, and a glowing slot at the trench mouth.
    m.span(-HOLE, HOLE, -k0 - 0.0, -k0 + 0.04, DECK_H + 0.3, DECK_H + 0.55, "glow_warm")   # on the kerb inner faces
    m.span(-HOLE, HOLE, k0 - 0.04, k0 + 0.0, DECK_H + 0.3, DECK_H + 0.55, "glow_warm")
    m.span(-k0 + 0.01, -k0 + 0.05, -HOLE, HOLE, DECK_H + 0.3, DECK_H + 0.55, "glow_warm")
    m.span(HOLE + 1.0, HOLE + 1.15, -HOLE + 0.5, HOLE - 0.5, DECK_H + 0.05, DECK_H + 0.12, "glow_warm")
    # Heat-stained throat plates lining the opening under the table.
    # Inset 1 cm from the slabs and 6 cm short at the corners: coincident corners made the bevel emit NaN vertices.
    a, b, c = HOLE - 0.06, HOLE - 0.01, HOLE - 0.07
    for (x0, x1, y0, y1) in ((-c, c, -b, -a), (-c, c, a, b), (-b, -a, -c, c), (a, b, -c, c)):
        m.span(x0, x1, y0, y1, under - 0.9, under - 0.01, "soot")


def build_launch_mount(col):
    """Legged launch table (frame 02): concrete plinth, teal splayed legs, a steel table with an exhaust opening,
    railings, two stair flights on the camera side, hold-down posts and lamps lighting the opening."""
    m = Mesh("hero_launch_mount")
    s, top, t = MOUNT_HALF, MOUNT_TOP, 1.5
    under = top - t
    # Table: four slabs around the opening, with a teal fascia.
    m.span(-s, s, HOLE, s, under, top, "hero_white")
    m.span(-s, s, -s, -HOLE, under, top, "hero_white")
    m.span(HOLE, s, -HOLE, HOLE, under, top, "hero_white")
    m.span(-s, -HOLE, -HOLE, HOLE, under, top, "hero_white")
    for (a, b, c0, c1) in ((-s - 0.15, s + 0.15, -s - 0.15, -s + 0.05), (-s - 0.15, s + 0.15, s - 0.05, s + 0.15)):
        m.span(a, b, c0, c1, under + 0.2, top - 0.25, "hero_teal")
    for (a, b) in ((-s - 0.15, -s + 0.05), (s - 0.05, s + 0.15)):
        m.span(a, b, -s - 0.15, s + 0.15, under + 0.2, top - 0.25, "hero_teal")
    # Deck plates on top (grating ring around the opening) and the exhaust collar.
    m.span(-s + 0.4, s - 0.4, -s + 0.4, -HOLE - 0.6, top, top + 0.06, "grating")
    m.span(-s + 0.4, s - 0.4, HOLE + 0.6, s - 0.4, top, top + 0.06, "grating")
    m.lathe([(HOLE - 0.1, top - 0.2), (HOLE + 0.5, top - 0.2), (HOLE + 0.5, top + 0.3), (HOLE - 0.1, top + 0.3),
             (HOLE - 0.1, top - 0.2)], 32, "hero_dark")
    # Hold-down posts (teal) at 45 degrees, clear of a 4.2 m vehicle radius.
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        x, y = (HOLE + 1.4) * math.cos(a), (HOLE + 1.4) * math.sin(a)
        m.box((x, y, top + 0.9), (0.9, 0.9, 1.8), "hero_teal")
        m.box((x, y, top + 1.85), (1.1, 1.1, 0.12), "hero_dark")
    # Soffit framing under the table slabs (rework 2 review: the underside read as one flat surface): main girders
    # both ways every 2.75 m, outside the opening.
    for k in range(-3, 4):
        c = k * 2.75
        if abs(c) < HOLE + 0.4:
            for (a0, a1) in ((-s + 0.6, -HOLE - 0.3), (HOLE + 0.3, s - 0.6)):
                m.span(c - 0.18, c + 0.18, a0, a1, under - 0.55, under, "hero_teal")
                m.span(a0, a1, c - 0.18, c + 0.18, under - 0.45, under, "hero_white")
        else:
            m.span(c - 0.18, c + 0.18, -s + 0.6, s - 0.6, under - 0.55, under, "hero_teal")
            m.span(-s + 0.6, s - 0.6, c - 0.18, c + 0.18, under - 0.45, under, "hero_white")
    # Open under-table (rework 2, M1): no plinth walls at all. The camera sees between the splayed legs, under the
    # lit table soffit, into the exhaust pit and its flame deflector, and through to the dusk beyond (frame 02).
    for sx in (-1, 1):   # pit floodlights on the inner faces of the mid legs, aimed into the opening and at the camera
        for sy in (-1, 1):
            x, y = sx * (HOLE + 0.4), sy * (s - 1.6)
            m.box((x, y, DECK_H + 4.2), (0.9, 0.5, 0.6), "hero_dark")
            m.box((x - sx * 0.47, y, DECK_H + 4.2), (0.04, 0.42, 0.46), "lamp")
    exhaust_pit(m, s, under)
    # Lamps on the table underside around the opening, pointing down into the pit (frame 02's lit underside).
    for k in range(8):
        a = k * math.pi / 4 + math.pi / 8
        m.lamp(((HOLE + 0.9) * math.cos(a), (HOLE + 0.9) * math.sin(a), under - 0.25))
    for x in (-6.0, 6.0):
        m.lamp((x, CAM * (s - 1.6), under - 0.25))
    # Mid legs on the camera and far faces (open portal frames between the corner legs) with knee struts.
    for sy in (-1, 1):
        for x in (-HOLE - 0.6, HOLE + 0.6):
            y = sy * (s - 0.9)
            m.beam((x * 1.08, sy * (s + 0.4), DECK_H), (x, y, under), 0.9, "hero_teal")
            m.box((x * 1.08, sy * (s + 0.4), DECK_H + 0.25), (1.6, 1.6, 0.5), "concrete")
        m.beam((-HOLE - 0.6, sy * (s - 0.9), under - 2.6), (HOLE + 0.6, sy * (s - 0.9), under - 2.6), 0.5, "hero_teal")
        m.beam((-HOLE - 0.6, sy * (s - 0.9), under - 2.4), (0.0, sy * (s - 0.9), under - 0.3), 0.36, "hero_teal")
        m.beam((HOLE + 0.6, sy * (s - 0.9), under - 2.4), (0.0, sy * (s - 0.9), under - 0.3), 0.36, "hero_teal")
    # Splayed teal legs at the corners: box section from the deck out to under the table edge, with a knee strut.
    for sx in (-1, 1):
        for sy in (-1, 1):
            foot = (sx * (s + 1.3), sy * (s + 1.3), DECK_H)
            head = (sx * (s - 1.2), sy * (s - 1.2), under)
            m.beam(foot, head, 1.1, "hero_teal")
            m.box((foot[0], foot[1], DECK_H + 0.2), (2.0, 2.0, 0.4), "concrete")
            m.beam((sx * (s - 1.0), sy * (s - 1.0), DECK_H), (sx * (s - 1.0), sy * (s - 1.0), under), 0.9, "hero_white")
    # Railing round the table edge, open where the two stairs arrive.
    e = s - 0.25
    m.railing([(-e + 3.2, CAM * e), (e - 3.2, CAM * e)], top)
    m.railing([(e - 0.6, CAM * e), (e, CAM * e), (e, -CAM * e), (-e, -CAM * e), (-e, CAM * e), (-e + 0.6, CAM * e)], top)
    # Two stair runs on the camera side (one per end), each two flights with a mid landing, rising toward the
    # middle and reaching the table top over a short bridge (frame 02). Rise 0.19-0.2 m, going about 0.23 m.
    ys = CAM * (s + 3.0)
    for sx in (-1, 1):
        m.stairs(sx * (s + 13.0), ys, DECK_H, sx * (s + 7.0), 7.0, 1.6)
        m.span(min(sx * (s + 7.0), sx * (s + 5.0)), max(sx * (s + 7.0), sx * (s + 5.0)), ys - 0.9, ys + 0.9, 6.85, 7.0, "grating")
        m.railing([(sx * (s + 7.0), ys - CAM * 0.9), (sx * (s + 5.0), ys - CAM * 0.9)], 7.0)
        m.stairs(sx * (s + 5.0), ys, 7.0, sx * (s - 1.0), top, 1.6)
        bx0, bx1 = sorted((sx * (s - 1.0), sx * (s - 3.0)))
        y_in, y_out = sorted((CAM * (s - 0.3), ys + CAM * 0.9))
        m.span(bx0, bx1, y_in, y_out, top - 0.15, top, "grating")
        for x in (sx * (s + 6.0), sx * (s - 2.0)):
            z1 = 6.85 if abs(x) > s else top - 0.15
            m.beam((x, ys, DECK_H), (x, ys, z1), 0.32, "hero_teal")
    return m.finish(col)  # VehicleMount stays on the T015 pad_mount (LaunchPadRig reference)


def build_crane_hook(col):
    """Hook block: yellow sheave housing, steel side plates, a forged hook and a safety latch (origin = cable end)."""
    m = Mesh("hero_crane_hook")
    m.tube((0, 0, 0.0), (0, 0, -0.25), 0.12, "hero_pipe", sides=10)          # swivel where the cable ends
    m.span(-0.55, 0.55, -0.32, 0.32, -1.25, -0.25, "hero_rail")               # sheave housing
    for y in (-0.36, 0.36):
        m.span(-0.6, 0.6, y - 0.04, y + 0.04, -1.3, -0.2, "hero_dark")         # side plates
    m.tube((0, -0.42, -0.75), (0, 0.42, -0.75), 0.18, "hero_pipe", sides=12)  # sheave axle
    m.tube((0, 0, -1.3), (0, 0, -1.65), 0.14, "hero_pipe", sides=10)          # shank
    # Hook: a 270-degree arc of a thick tube in the XZ plane.
    r, th, n = 0.42, 0.11, 14
    centre = Vector((0.0, 0.0, -2.1))
    prev = None
    for i in range(n + 1):
        a = math.radians(90 + 270 * i / n)
        p = centre + Vector((r * math.cos(a), 0.0, r * math.sin(a)))
        if prev is not None:
            m.tube(prev, p, th, "hero_dark", sides=8)
        prev = p
    m.beam((0.0, 0.0, -1.62), (r * 0.9, 0.0, -1.95), 0.05, "warning_red")    # latch
    return m.finish(col)


# ----------------------------------------------------------------------------- umbilical arm (rework 2, M3)

ARM_L = 10.0   # LaunchPadRig.ArmModelLengthM: the rig scales the arm along +X to reach the vehicle skin
ARM_D = 1.6    # truss depth and width (pad_umbilical_arm)


def build_umbilical_truss(col):
    """Swing-arm truss that the rig stretches along +X (hinge at the origin on the tower face): white chords, teal
    diagonals, a grating walkway with a rail on top and the hose bundle in trays. No end box: the hood is its own
    unscaled piece (hero_umbilical_end), so stretching never distorts it."""
    m = Mesh("hero_umbilical_truss")
    d = ARM_D
    for y in (-d / 2, d / 2):
        for z in (0.0, d):
            m.beam((0, y, z), (ARM_L - 1.2, y, z), 0.2, "hero_white")
    x = 0.0
    while x < ARM_L - 1.3:
        m.beam((x, -d / 2, 0), (x + 1.2, d / 2, d), 0.1, "hero_teal")
        m.beam((x, d / 2, 0), (x + 1.2, -d / 2, d), 0.1, "hero_teal")
        m.beam((x, -d / 2, 0), (x, d / 2, 0), 0.1, "hero_teal")
        x += 1.2
    m.span(0.0, ARM_L - 1.2, -d / 2 - 0.05, d / 2 + 0.05, d, d + 0.06, "grating")
    m.railing([(0.2, -d / 2), (ARM_L - 1.3, -d / 2)], d + 0.06, height=1.0, post_every=1.2)
    for (y, r) in ((0.3, 0.16), (0.0, 0.12), (-0.25, 0.1)):
        m.tube((0.3, y, -0.25 - r), (ARM_L - 1.2, y, -0.25 - r), r, "hose", sides=8)
    m.span(0.3, ARM_L - 1.2, -0.5, 0.5, -0.12, -0.04, "panel_seam")   # cable tray
    return m.finish(col)


def build_umbilical_end(col):
    """Arm-end umbilical plate (origin at the arm tip, +X toward the vehicle): a hinge yoke on the truss, a swing
    frame, a curved connector plate that meets the skin with quick-disconnect couplers, hose loops sagging below and
    a work lamp. Replaces the plain near-black end cube (rubric M3)."""
    m = Mesh("hero_umbilical_end")
    d = ARM_D
    # Truss stub and hinge yoke (vertical pin) from x = -1.2 to the tip.
    for y in (-d / 2, d / 2):
        for z in (0.0, d):
            m.beam((-1.2, y, z), (-0.5, y, z), 0.2, "hero_white")
    m.span(-0.6, -0.3, -d / 2 - 0.1, d / 2 + 0.1, -0.1, d + 0.1, "hero_teal")
    m.tube((-0.2, 0.0, -0.3), (-0.2, 0.0, d + 0.3), 0.14, "hero_pipe", sides=12)            # hinge pin
    for z in (-0.15, d + 0.05):
        m.span(-0.45, 0.05, -0.35, 0.35, z, z + 0.12, "hero_dark")                          # yoke plates
    # Swing frame and the curved connector plate (a shallow arc in plan) facing the vehicle.
    m.span(-0.1, 0.25, -1.1, 1.1, 0.05, d - 0.05, "hero_dark")
    arc, n, w = 1.3, 8, 0.22
    for i in range(n):
        a0, a1 = -0.5 + i / n, -0.5 + (i + 1) / n
        y0, y1 = a0 * 2 * arc * 0.9, a1 * 2 * arc * 0.9
        x0, x1 = 0.25 + 0.18 * (1 - (2 * a0) ** 2), 0.25 + 0.18 * (1 - (2 * a1) ** 2)
        m.quad_box([(x0, y0, -0.15), (x0 + w, y0, -0.15), (x1 + w, y1, -0.15), (x1, y1, -0.15),
                    (x0, y0, d + 0.15), (x0 + w, y0, d + 0.15), (x1 + w, y1, d + 0.15), (x1, y1, d + 0.15)], "hero_white")
    for (y, z) in ((-0.6, 0.4), (0.0, 0.4), (0.6, 0.4), (-0.35, 1.15), (0.35, 1.15)):      # couplers
        m.tube((0.45, y, z), (0.62, y, z), 0.13, "hero_pipe", sides=10)
        m.tube((0.40, y, z), (0.46, y, z), 0.17, "warning_red" if z > 1 else "hero_rail", sides=10)
    m.span(0.42, 0.47, -1.15, 1.15, d + 0.05, d + 0.15, "hero_rail")                        # bumper strip
    # Three hose loops from the arm's trays sagging under the hinge into the plate.
    for (y, r) in ((0.3, 0.14), (0.0, 0.11), (-0.25, 0.09)):
        prev = None
        for k in range(9):
            t = k / 8
            p = Vector((-1.2 + 1.65 * t, y, -0.4 - 0.9 * math.sin(math.pi * t)))
            if prev is not None:
                m.tube(prev, p, r, "hose", sides=8)
            prev = p
    m.lamp((-0.9, 0.0, d + 0.25), facing_down=False)
    return m.finish(col)


# ----------------------------------------------------------------------------- far hall (rework 2, M1/M10)

def build_far_hall(col):
    """Vehicle assembly hall seen 400-500 m away (in place of T017's plain assembly box): a tall clad main bay with
    white pilasters every 4 m, a full-height door with lit seams, a stepped roof with parapet and rooftop plant, a lit
    window band, a low annex with loading doors, and red aviation lights on the corners. Origin on grade at the
    centre; -Y faces the Build Bay camera. 60 m x 34 m x 42 m main bay (game_value)."""
    m = Mesh("hero_far_hall")
    w, dpt, h = 30.0, 17.0, 42.0
    face = CAM * dpt
    m.span(-w, w, -dpt, dpt, 0.0, h, "hero_clad")
    m.span(-w - 0.4, w + 0.4, -dpt - 0.4, dpt + 0.4, h, h + 1.2, "hero_white")              # parapet
    m.span(-w * 0.6, w * 0.4, -dpt * 0.5, dpt * 0.6, h + 1.2, h + 6.0, "hero_clad")        # roof step
    m.span(-w * 0.6 - 0.3, w * 0.4 + 0.3, -dpt * 0.5 - 0.3, dpt * 0.6 + 0.3, h + 6.0, h + 6.6, "hero_white")
    x = -w
    while x <= w + 0.01:                                                                   # pilasters
        m.span(x - 0.5, x + 0.5, min(face, face + CAM * 0.8), max(face, face + CAM * 0.8), 0.0, h, "hero_white")
        x += 4.0
    for z in (14.0, 28.0):                                                                 # floor bands
        m.span(-w, w, min(face, face + CAM * 0.5), max(face, face + CAM * 0.5), z, z + 0.8, "hero_white")
    # Full-height vehicle door (two leaves) with lit seams and a lit lintel.
    m.span(-8.0, 8.0, min(face, face + CAM * 0.9), max(face, face + CAM * 0.9), 0.0, 34.0, "panel_seam")
    m.span(-0.15, 0.15, min(face, face + CAM * 1.0), max(face, face + CAM * 1.0), 0.0, 34.0, "window")
    m.span(-8.0, 8.0, min(face, face + CAM * 1.0), max(face, face + CAM * 1.0), 34.0, 34.6, "lamp")
    for z in (9.0, 18.0, 26.0):
        m.span(-8.0, 8.0, min(face, face + CAM * 1.0), max(face, face + CAM * 1.0), z, z + 0.12, "hero_dark")
    for x0 in (-27.0, 10.0):                                                               # lit window bands
        m.span(x0, x0 + 17.0, min(face, face + CAM * 0.85), max(face, face + CAM * 0.85), 36.5, 38.5, "window")
        m.span(x0, x0 + 17.0, min(face, face + CAM * 0.85), max(face, face + CAM * 0.85), 3.0, 4.6, "window")
    # Low annex on the right with three loading doors and a lamp over each.
    ax0, ax1 = w, w + 26.0
    m.span(ax0, ax1, -dpt + 4.0, dpt - 2.0, 0.0, 12.0, "hero_white")
    m.span(ax0 - 0.2, ax1 + 0.3, -dpt + 3.7, dpt - 1.7, 12.0, 12.8, "panel_seam")
    af = CAM * (dpt - 4.0)
    for i in range(3):
        x0 = ax0 + 2.5 + i * 8.0
        m.span(x0, x0 + 5.5, min(af, af + CAM * 0.3), max(af, af + CAM * 0.3), 0.0, 6.0, "hero_dark")
        m.span(x0 + 1.5, x0 + 4.0, min(af, af + CAM * 0.5), max(af, af + CAM * 0.5), 6.6, 7.0, "lamp")
    # Rooftop plant and a mast.
    for (x, y) in ((-10.0, 2.0), (-4.0, -3.0), (4.0, 4.0)):
        m.box((x, y, h + 7.6), (3.5, 3.5, 2.0), "hero_dark")
    m.tube((-12.0, 6.0, h + 6.6), (-12.0, 6.0, h + 22.0), 0.3, "hero_white", sides=8)
    for (x, y, z) in ((-w, -dpt, h + 1.4), (w, -dpt, h + 1.4), (-12.0, 6.0, h + 22.3)):
        m.box((x, y, z), (0.8, 0.8, 0.8), "warning_red")
    return m.finish(col)


# ----------------------------------------------------------------------------- export and preview

def bake_modifiers(ob):
    """Applies the bevel and weighted-normal stack into the mesh and repairs any NaN UV the bevel interpolated on a
    degenerate corner (it takes a finite UV from the same face, which is always one swatch), so FBX export succeeds."""
    # Triangulate last (keeping the weighted custom normals): Unity discarded about 300 bevel n-gons it judged
    # self-intersecting, which left holes.
    tri = ob.modifiers.new("Triangulate", "TRIANGULATE")
    tri.quad_method = "BEAUTY"
    tri.ngon_method = "BEAUTY"
    tri.keep_custom_normals = True
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    fixed = 0
    for uvl in me.uv_layers:
        for poly in me.polygons:
            loops = list(poly.loop_indices)
            good = [uvl.data[i].uv.copy() for i in loops if not any(math.isnan(c) for c in uvl.data[i].uv)]
            for i in loops:
                if any(math.isnan(c) for c in uvl.data[i].uv):
                    uvl.data[i].uv = good[0] if good else hero_atlas.uv_of("hero_white")
                    fixed += 1
    bad = sum(1 for v in me.vertices if any(math.isnan(c) or abs(c) > 1.0e4 for c in v.co))
    if bad:   # Unity drops a mesh with NaN vertices ("abnormal mesh bounds"): fail the export loudly instead
        raise RuntimeError(f"{ob.name}: {bad} NaN vertices after bevel (coincident thin faces?)")
    ob.modifiers.clear()
    ob.data = me
    if fixed:
        print("NAN-UV", ob.name, fixed)


def export(ob):
    bake_modifiers(ob)
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
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg).to_mesh()
    tris = sum(len(p.vertices) - 2 for p in ev.polygons)
    ob.evaluated_get(dg).to_mesh_clear()
    print("PIECE", ob.name, "tris", tris, "->", path)


def preview(out_dir, pieces):
    """Workbench preview of the assembled tower and mount from the Build Bay's side (for look-dev only)."""
    scene = bpy.context.scene
    seg_a, seg_b, crown, base, mount = pieces
    tower = []
    for i in range(6):
        src = seg_a if i % 2 == 0 else seg_b
        o = src.copy()
        o.location = (0, 0, DECK_H + i * SEG_H)
        scene.collection.objects.link(o)
        tower.append(o)
    c = crown.copy()
    c.location = (0, 0, DECK_H + 6 * SEG_H)
    scene.collection.objects.link(c)
    b = base.copy()
    b.location = (0, 0, DECK_H)
    scene.collection.objects.link(b)
    group = tower + [c, b]
    for o in group:  # put the tower 23.5 m from the axis, +X toward it (as the rig does)
        o.location = (o.location.x - 23.5, o.location.y, o.location.z)
    for o in (seg_a, seg_b, crown, base):
        o.location = (1000, 1000, 0)
    cam_data = bpy.data.cameras.new("cam")
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    cam.location = (-6.0, -105.0, 26.0)
    cam.rotation_euler = (math.radians(86), 0, math.radians(0))
    cam_data.lens = 40
    scene.camera = cam
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "MATERIAL"
    scene.display.shading.show_cavity = True
    scene.render.resolution_x, scene.render.resolution_y = 1280, 720
    scene.render.filepath = os.path.join(out_dir, "hero_pad_preview.png")
    bpy.ops.render.render(write_still=True)
    print("PREVIEW", scene.render.filepath)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    preview_dir = argv[argv.index("--preview") + 1] if "--preview" in argv else None
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    col = scene.collection
    print("ATLAS", hero_atlas.write_textures(TEXTURES))
    pieces = [build_tower_segment(col, "a"), build_tower_segment(col, "b"), build_tower_crown(col), build_tower_base(col),
              build_launch_mount(col), build_crane_hook(col), build_umbilical_truss(col), build_umbilical_end(col),
              build_far_hall(col)]
    os.makedirs(MODELS, exist_ok=True)
    for ob in pieces:
        export(ob)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, "hero_pad.blend"))
    if preview_dir:
        preview(preview_dir, pieces[:5])
    print("DONE", len(pieces))


main()
