"""MissionForge kit: lighting, camera framing, preview renders and image stitching."""
from __future__ import annotations

import math
import os

import bpy
import numpy as np
from mathutils import Vector

STUDIO = "studio"

# view name -> direction from the target towards the camera (Blender axes)
VIEWS = {
    "3q": (0.80, -1.0, 0.42),
    "side": (0.0, -1.0, 0.02),
    "front": (1.0, 0.0, 0.02),
    "back3q": (-0.8, 1.0, 0.35),
    "low": (0.65, -0.8, -0.62),
    "under": (0.2, -0.25, -1.0),
    "top": (0.2, -0.25, 1.0),
    "high": (0.7, -0.9, 0.95),
}


def _studio_collection(scene):
    col = bpy.data.collections.get(STUDIO)
    if col is None:
        col = bpy.data.collections.new(STUDIO)
    if col.name not in scene.collection.children:
        scene.collection.children.link(col)
    return col


def setup_studio(scene=None, *, ground=False, sky=(0.035, 0.075, 0.13), horizon=(0.11, 0.18, 0.26),
                 sun_strength=4.6, sun_dir=(-0.45, -0.55, 0.70), ground_color=(0.42, 0.43, 0.45),
                 ground_roughness=0.9):
    """Sun + two fill lights + gradient world + camera in the 'studio' collection."""
    scene = scene or bpy.context.scene
    col = _studio_collection(scene)
    for o in list(col.objects):
        bpy.data.objects.remove(o, do_unlink=True)

    world = bpy.data.worlds.get("mf_world") or bpy.data.worlds.new("mf_world")
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    bg = nt.nodes.new("ShaderNodeBackground")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    mapr = nt.nodes.new("ShaderNodeMapRange")
    mapr.inputs[1].default_value = -0.35
    mapr.inputs[2].default_value = 0.9
    ramp.color_ramp.elements[0].color = (0.02, 0.035, 0.055, 1.0)
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[1].color = (*sky, 1.0)
    ramp.color_ramp.elements[1].position = 1.0
    mid = ramp.color_ramp.elements.new(0.30)
    mid.color = (*horizon, 1.0)
    nt.links.new(geo.outputs["Incoming"], sep.inputs[0])
    nt.links.new(sep.outputs["Z"], mapr.inputs[0])
    nt.links.new(mapr.outputs[0], ramp.inputs[0])
    nt.links.new(ramp.outputs[0], bg.inputs[0])
    bg.inputs[1].default_value = 1.0
    nt.links.new(bg.outputs[0], out.inputs[0])
    scene.world = world

    def light(name, kind, energy, direction, color=(1, 1, 1), angle=None):
        data = bpy.data.lights.new(name, kind)
        data.energy = energy
        data.color = color
        if angle is not None and kind == "SUN":
            data.angle = angle
        ob = bpy.data.objects.new(name, data)
        col.objects.link(ob)
        ob.rotation_euler = Vector(direction).normalized().to_track_quat("Z", "Y").to_euler()
        return ob

    light("mf_sun", "SUN", sun_strength, sun_dir, (1.0, 0.86, 0.70), math.radians(3.0))
    light("mf_fill", "SUN", sun_strength * 0.25, (0.8, -0.2, 0.25), (0.72, 0.84, 1.0), math.radians(25.0))
    light("mf_rim", "SUN", sun_strength * 0.45, (0.3, 0.9, 0.35), (1.0, 0.98, 0.95), math.radians(10.0))
    light("mf_under", "SUN", sun_strength * 0.16, (0.1, -0.3, -1.0), (0.9, 0.92, 1.0), math.radians(40.0))

    cam_data = bpy.data.cameras.new("mf_camera")
    cam = bpy.data.objects.new("mf_camera", cam_data)
    col.objects.link(cam)
    scene.camera = cam

    if ground:
        me = bpy.data.meshes.new("mf_ground")
        s = 2000.0
        me.from_pydata([(-s, -s, 0), (s, -s, 0), (s, s, 0), (-s, s, 0)], [], [(0, 1, 2, 3)])
        g = bpy.data.objects.new("mf_ground", me)
        col.objects.link(g)
        mat = bpy.data.materials.get("mf_ground") or bpy.data.materials.new("mf_ground")
        mat.use_nodes = True
        bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        bsdf.inputs["Base Color"].default_value = (*ground_color, 1)
        bsdf.inputs["Roughness"].default_value = ground_roughness
        me.materials.append(mat)

    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        scene.render.engine = "BLENDER_EEVEE"
    ee = scene.eevee
    for attr, val in (("taa_render_samples", 32), ("use_shadows", True), ("use_raytracing", True),
                      ("use_gtao", True)):
        if hasattr(ee, attr):
            try:
                setattr(ee, attr, val)
            except Exception:
                pass
    try:
        scene.view_settings.view_transform = "AgX"
        scene.view_settings.look = "AgX - Medium High Contrast"
    except TypeError:
        pass
    scene.render.film_transparent = False
    scene.render.image_settings.file_format = "PNG"
    return cam


def bounds_of(objs):
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    found = False
    for o in objs:
        if o.type != "MESH":
            continue
        mw = o.matrix_world
        for corner in o.bound_box:
            p = mw @ Vector(corner)
            for k in range(3):
                lo[k] = min(lo[k], p[k])
                hi[k] = max(hi[k], p[k])
            found = True
    if not found:
        return Vector((-1, -1, -1)), Vector((1, 1, 1))
    return lo, hi


def frame_camera(scene, objs, view="3q", *, lens=70.0, margin=1.12, ortho=False):
    """Point the scene camera at objs from a named view (or an (x, y, z) direction)."""
    cam = scene.camera
    bpy.context.view_layer.update()
    lo, hi = bounds_of(objs)
    centre = (lo + hi) / 2.0
    direction = Vector(VIEWS[view] if isinstance(view, str) else view).normalized()
    cam.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()
    bpy.context.view_layer.update()
    # project the bbox corners on the camera plane to size the shot
    rot = cam.rotation_euler.to_matrix()
    right, up = rot @ Vector((1, 0, 0)), rot @ Vector((0, 1, 0))
    corners = [Vector((x, y, z)) for x in (lo.x, hi.x) for y in (lo.y, hi.y) for z in (lo.z, hi.z)]
    half_w = max(abs((c - centre).dot(right)) for c in corners)
    half_h = max(abs((c - centre).dot(up)) for c in corners)
    depth = max(abs((c - centre).dot(direction)) for c in corners)
    aspect = scene.render.resolution_x / scene.render.resolution_y
    cam.data.sensor_fit = "HORIZONTAL"
    if ortho:
        cam.data.type = "ORTHO"
        cam.data.ortho_scale = 2.0 * max(half_w, half_h * aspect) * margin
        dist = depth + max(half_w, half_h) * 4.0 + 10.0
    else:
        cam.data.type = "PERSP"
        cam.data.lens = lens
        fov_h = 2.0 * math.atan(cam.data.sensor_width / (2.0 * lens))
        fov_v = 2.0 * math.atan(math.tan(fov_h / 2.0) / aspect)
        dist = max(half_w / math.tan(fov_h / 2.0), half_h / math.tan(fov_v / 2.0)) * margin + depth * 0.35
    cam.location = centre + direction * dist
    cam.data.clip_start = max(0.01, dist * 0.01)
    cam.data.clip_end = dist * 4.0 + 1000.0
    return cam


def render_to(scene, path, width, height):
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.filepath = path
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.render.render(write_still=True, scene=scene.name)


def load_pixels(path):
    img = bpy.data.images.load(path, check_existing=False)
    w, h = img.size
    arr = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(arr)
    bpy.data.images.remove(img)
    return arr.reshape(h, w, 4)


def save_pixels(arr, path):
    h, w = arr.shape[:2]
    img = bpy.data.images.new("mf_sheet", w, h, alpha=True)
    img.pixels.foreach_set(np.ascontiguousarray(arr, dtype=np.float32).ravel())
    img.filepath_raw = path
    img.file_format = "PNG"
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save()
    bpy.data.images.remove(img)


def stitch(paths, out_path, cols=None, pad=4, bg=(0.10, 0.11, 0.13, 1.0)):
    """Tile equally sized PNGs into one sheet (row-major, top-left first)."""
    tiles = [load_pixels(p) for p in paths]
    if not tiles:
        return
    th, tw = tiles[0].shape[:2]
    cols = cols or len(tiles)
    rows = math.ceil(len(tiles) / cols)
    sheet = np.empty((rows * th + (rows + 1) * pad, cols * tw + (cols + 1) * pad, 4), dtype=np.float32)
    sheet[:] = bg
    for i, t in enumerate(tiles):
        r, c = divmod(i, cols)
        y_top = pad + r * (th + pad)                 # from the top
        y0 = sheet.shape[0] - y_top - th             # image rows are bottom-up
        x0 = pad + c * (tw + pad)
        sheet[y0:y0 + th, x0:x0 + tw] = t[:, :, :4]
    save_pixels(sheet, out_path)


def preview(scene, objs, out_path, views=("3q", "side", "low"), size=640, ortho_side=True, split=False):
    """Render objs from several views and stitch them into one PNG row."""
    paths = []
    stem = os.path.splitext(out_path)[0]
    for v in views:
        frame_camera(scene, objs, v, ortho=(ortho_side and v in ("side", "front")))
        if bpy.data.objects.get("mf_lookdev_floor") is not None:     # HDRI look-dev: floor follows the part
            from . import lookdev
            lookdev.place_floor(scene, objs, camera_view_dir=VIEWS[v] if isinstance(v, str) else v)
        p = f"{stem}_{v}.png" if split else f"{stem}__{v}.png"
        render_to(scene, p, size, size)
        paths.append(p)
    if split:
        return paths
    if len(paths) == 1:
        os.replace(paths[0], out_path)
    else:
        stitch(paths, out_path)
        for p in paths:
            os.remove(p)
    return out_path
