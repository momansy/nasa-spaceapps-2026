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
Material slots by name (Unity maps them to LP_hero_* in BayDressingBuilder): hero_white (structural steel, light
paint), hero_teal (painted steel), hero_clad (cladding panels), hero_core (foil-wrapped cryo lines), hero_rail
(safety-yellow railings), hero_pipe (bare steel pipe), hero_dark (machinery), grating, lamp, concrete, warning_red.
"""
from __future__ import annotations

import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
MODELS = os.path.normpath(os.path.join(HERE, "..", "Models", "Hero"))
SLOTS = ["hero_white", "hero_teal", "hero_clad", "hero_core", "hero_rail", "hero_pipe", "hero_dark", "grating", "lamp",
         "concrete", "warning_red"]
LOOKS = {  # Blender preview colours only
    "hero_white": (0.62, 0.66, 0.68), "hero_teal": (0.08, 0.38, 0.42), "hero_clad": (0.16, 0.45, 0.50),
    "hero_core": (0.75, 0.52, 0.18), "hero_rail": (0.85, 0.65, 0.15), "hero_pipe": (0.55, 0.57, 0.58),
    "hero_dark": (0.10, 0.12, 0.14), "grating": (0.12, 0.15, 0.18), "lamp": (1.0, 0.9, 0.7),
    "concrete": (0.45, 0.45, 0.43), "warning_red": (0.9, 0.1, 0.08),
}

# ----------------------------------------------------------------------------- dimensions (game_value, m)
SEG_H = 8.0          # LaunchPadRig.SegmentHeightM
GANTRY_W = 9.0       # LaunchPadRig.TowerHalfWidthM * 2
H = GANTRY_W / 2
CAM = -1.0           # sign of the Blender Y face that turns toward the Build Bay camera
DECK_H = 2.0         # LaunchPadRig.DeckTopM
MOUNT_TOP = 12.0     # table top above grade (VehicleMount at 10.5 m sits inside the opening)
MOUNT_HALF = 11.0    # table half-side (T015 MOUNT_SIZE / 2): its 15.6 m diagonal clears the tower platforms at 16.2 m
HOLE = 5.6           # exhaust opening half-side
BEVEL_M = 0.045      # edge bevel width (rubric M6 asks 5-15 cm on big forms; small members get the same 4.5 cm)


def new_mat(name):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*LOOKS[name], 1.0)
    if name in ("hero_white", "hero_teal", "hero_pipe", "hero_core"):
        bsdf.inputs["Metallic"].default_value = 0.7
        bsdf.inputs["Roughness"].default_value = 0.35
    if name == "lamp":
        bsdf.inputs["Emission Color"].default_value = (1.0, 0.85, 0.6, 1.0)
        bsdf.inputs["Emission Strength"].default_value = 20.0
    return m


class Mesh:
    """bmesh helper: boxes, beams, tubes, lathes and stairs with one material slot per face."""

    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()

    def _slot(self, faces, slot):
        idx = SLOTS.index(slot)
        for f in faces:
            f.material_index = idx

    def quad_box(self, c, slot):
        v = [self.bm.verts.new(p) for p in c]
        faces = [self.bm.faces.new((v[0], v[3], v[2], v[1])), self.bm.faces.new((v[4], v[5], v[6], v[7]))]
        for i in range(4):
            j = (i + 1) % 4
            faces.append(self.bm.faces.new((v[i], v[j], v[j + 4], v[i + 4])))
        self._slot(faces, slot)

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
            mod = ob.modifiers.new("Bevel", "BEVEL")
            mod.width = BEVEL_M
            mod.segments = 2
            mod.limit_method = "ANGLE"
            mod.angle_limit = math.radians(35)
            mod.harden_normals = True
            mod.miter_outer = "MITER_ARC"
        wn = ob.modifiers.new("WeightedNormal", "WEIGHTED_NORMAL")
        wn.keep_sharp = True
        wn.mode = "FACE_AREA"
        try:  # Blender 4.1+: auto smooth is a modifier; sharp edges by angle keep flat faces flat
            bpy.context.view_layer.objects.active = ob
            ob.select_set(True)
            bpy.ops.object.shade_smooth_by_angle(angle=math.radians(35), keep_sharp_edges=True)
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
    # Concrete plinth core walls under the table (the trench runs out along +X, so +X stays open).
    m.span(-s + 2.2, -HOLE - 0.4, -s + 2.2, s - 2.2, DECK_H, under, "concrete")
    m.span(-HOLE - 0.4, s - 2.2, -s + 2.2, -HOLE - 0.6, DECK_H, under, "concrete")
    m.span(-HOLE - 0.4, s - 2.2, HOLE + 0.6, s - 2.2, DECK_H, under, "concrete")
    # Recessed pilasters on the camera face of the plinth (frame 02's vertical ribs) and a lit service door.
    face = CAM * (s - 2.2)
    for x in (-8.0, -4.0, 4.0, 8.0):
        m.span(x - 0.35, x + 0.35, face, face + CAM * 0.4, DECK_H, under, "concrete")
    m.span(-1.0, 1.0, face, face + CAM * 0.05, DECK_H, DECK_H + 2.4, "hero_dark")
    m.span(-1.0, 1.0, face + CAM * 0.05, face + CAM * 0.1, DECK_H + 2.5, DECK_H + 2.65, "lamp")
    m.lamp((0.0, CAM * (s - 1.6), under - 0.25))
    m.lamp((-6.0, CAM * (s - 1.6), under - 0.25))
    m.lamp((6.0, CAM * (s - 1.6), under - 0.25))
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


# ----------------------------------------------------------------------------- export and preview

def export(ob):
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
    pieces = [build_tower_segment(col, "a"), build_tower_segment(col, "b"), build_tower_crown(col), build_tower_base(col),
              build_launch_mount(col), build_crane_hook(col)]
    os.makedirs(MODELS, exist_ok=True)
    for ob in pieces:
        export(ob)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, "hero_pad.blend"))
    if preview_dir:
        preview(preview_dir, pieces[:5])
    print("DONE", len(pieces))


main()
