"""MissionForge kit: per-part mask bake on UV1 (VISUAL_TARGET 2.4), headless Cycles.

    R  ambient occlusion (distance scales with the part)
    G  edge wear: bevel-normal difference, broken up by noise so wear sits in patches (kept subtle)
    B  heat (engines: the `heat` vertex colour of nozzle_hot faces) - frost for tanks (T033)
    A  cavity and grime: tight-radius AO, inverted

Output: assets/blender/materials/bakes/<part_id>/<part_id>_lod{0,1}_mask.png (2048 for LOD0, 1024 for LOD1) and the
`parts` section of library.json.
"""
from __future__ import annotations

import json
import os
import time

import bpy
import numpy as np

from . import materials, pipeline, uv

BAKES_DIR = os.path.join(materials.MATERIALS_DIR, "bakes")
BAKE_SAMPLES = 48
MARGIN_PX = 16
AO_DISTANCE_FRACTION = 0.20      # of the part's bounding-box diagonal
CAVITY_DISTANCE_M = 0.02
EDGE_RADIUS_M = 0.004
EDGE_GAIN = 40.0
EDGE_MAX = 0.8                   # game_value: wear never exceeds 80 %, kept sparse by the noise gate


def _bake_material(kind: str, img: bpy.types.Image) -> bpy.types.Material:
    mat = bpy.data.materials.new(f"mf_bake_{kind}")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    nt.nodes.active = tex
    tex.select = True
    if kind == "ao":
        diff = nt.nodes.new("ShaderNodeBsdfDiffuse")
        nt.links.new(diff.outputs[0], out.inputs[0])
        return mat
    em = nt.nodes.new("ShaderNodeEmission")
    nt.links.new(em.outputs[0], out.inputs[0])
    if kind == "edge":
        bev = nt.nodes.new("ShaderNodeBevel")
        bev.inputs["Radius"].default_value = EDGE_RADIUS_M
        bev.samples = 8
        geo = nt.nodes.new("ShaderNodeNewGeometry")
        dot = nt.nodes.new("ShaderNodeVectorMath")
        dot.operation = "DOT_PRODUCT"
        nt.links.new(bev.outputs["Normal"], dot.inputs[0])
        nt.links.new(geo.outputs["Normal"], dot.inputs[1])
        inv = nt.nodes.new("ShaderNodeMath")                 # (1 - dot) * gain
        inv.operation = "MULTIPLY_ADD"
        inv.inputs[1].default_value = -EDGE_GAIN
        inv.inputs[2].default_value = EDGE_GAIN
        inv.use_clamp = True
        nt.links.new(dot.outputs["Value"], inv.inputs[0])
        coord = nt.nodes.new("ShaderNodeTexCoord")
        noise = nt.nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = 5.0
        noise.inputs["Detail"].default_value = 4.0
        nt.links.new(coord.outputs["Object"], noise.inputs["Vector"])
        gate = nt.nodes.new("ShaderNodeMapRange")
        gate.inputs["From Min"].default_value = 0.48
        gate.inputs["From Max"].default_value = 0.62
        nt.links.new(noise.outputs["Fac"], gate.inputs["Value"])
        mul = nt.nodes.new("ShaderNodeMath")
        mul.operation = "MULTIPLY"
        mul.use_clamp = True
        nt.links.new(inv.outputs[0], mul.inputs[0])
        nt.links.new(gate.outputs["Result"], mul.inputs[1])
        scale = nt.nodes.new("ShaderNodeMath")
        scale.operation = "MULTIPLY"
        scale.inputs[1].default_value = EDGE_MAX
        nt.links.new(mul.outputs[0], scale.inputs[0])
        nt.links.new(scale.outputs[0], em.inputs["Color"])
    return mat


def _bake_pass(scene, ob, me, kind: str, res: int, *, ao_distance: float = 0.5):
    img = bpy.data.images.new(f"mf_bake_{kind}", res, res, alpha=False, float_buffer=True)
    img.colorspace_settings.name = "Non-Color"
    mat = _bake_material(kind, img)
    me.materials.clear()
    me.materials.append(mat)
    me.polygons.foreach_set("material_index", [0] * len(me.polygons))
    scene.world.light_settings.distance = ao_distance
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.bake(type="AO" if kind == "ao" else "EMIT", margin=MARGIN_PX, margin_type="EXTEND",
                        use_clear=True, target="IMAGE_TEXTURES")
    arr = np.empty(res * res * 4, dtype=np.float32)
    img.pixels.foreach_get(arr)
    arr = arr.reshape(res, res, 4)[..., 0].copy()
    bpy.data.images.remove(img)
    bpy.data.materials.remove(mat)
    return arr


def _smooth(a: np.ndarray, passes: int) -> np.ndarray:
    for _ in range(passes):
        for ax in (0, 1):
            a = (np.roll(a, 1, ax) + 2.0 * a + np.roll(a, -1, ax)) / 4.0
    return a


def _compress(mask: np.ndarray) -> np.ndarray:
    """Keep the repo small (VISUAL_TARGET 2.6: about 60 MB of textures per task): blur the sampling noise out of
    AO (R) and cavity (A) and quantise to 5 bits. Masks are low-frequency multipliers, so nothing visible is lost."""
    out = mask.copy()
    for ch in (0, 3):
        out[..., ch] = _smooth(out[..., ch], 3)
    return np.round(np.clip(out, 0.0, 1.0) * 31.0) / 31.0


def _heat_mask(me, res: int) -> np.ndarray:
    """B channel: the `heat` corner colour (R) rasterised on UV1. (Cycles' Attribute node returned 0 in headless
    bakes, so this is interpolated directly; it is exact and needs no samples.)"""
    attr = me.color_attributes.get("heat")
    if attr is None:
        return np.zeros((res, res), dtype=np.float32)
    arr = np.empty(len(attr.data) * 4, dtype=np.float32)
    attr.data.foreach_get("color", arr)
    return uv.rasterize_corner_scalar(me, arr.reshape(-1, 4)[:, 0], res)


def _configure(scene):
    scene.render.engine = "CYCLES"
    scene.cycles.samples = BAKE_SAMPLES
    scene.cycles.use_denoising = False
    scene.cycles.device = "CPU"
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        prefs.compute_device_type = "METAL"
        prefs.get_devices()
        if any(d.type != "CPU" for d in prefs.devices):
            for d in prefs.devices:
                d.use = True
            scene.cycles.device = "GPU"
    except Exception:
        scene.cycles.device = "CPU"
    world = bpy.data.worlds.get("mf_bake_world") or bpy.data.worlds.new("mf_bake_world")
    world.use_nodes = True
    scene.world = world


def bake_part(part_id: str, scene=None) -> dict:
    """Bake the masks of both LODs; returns the library `parts` entry and prints the time taken."""
    scene = scene or bpy.context.scene
    pipeline.clear_scene(scene, keep_collection="")
    _configure(scene)
    inst = pipeline.instantiate(part_id, scene=scene)
    entry = {"mask_res": uv.BAKE_RES_LOD0, "mask_b": "heat",
             "channels": "R ao, G edge wear, B heat, A cavity and grime"}
    t_part = time.time()
    for lod in (0, 1):
        objs = inst["lod"][lod]
        if len(objs) != 1:
            raise RuntimeError(f"{part_id}: bake supports one mesh per LOD, found {len(objs)}")
        src = objs[0]
        res = uv.bake_res(lod)
        me = src.data.copy()
        me.uv_layers.active = me.uv_layers[uv.UV1_NAME]
        ob = bpy.data.objects.new("_mf_bake", me)
        scene.collection.objects.link(ob)
        lo, hi = pipeline._world_bbox(objs)
        diag = (hi - lo).length
        t0 = time.time()
        ao = _bake_pass(scene, ob, me, "ao", res, ao_distance=max(0.15, AO_DISTANCE_FRACTION * diag))
        edge = _bake_pass(scene, ob, me, "edge", res)
        heat = _heat_mask(me, res)
        cav = _bake_pass(scene, ob, me, "ao", res, ao_distance=CAVITY_DISTANCE_M)
        bpy.data.objects.remove(ob)
        bpy.data.meshes.remove(me)
        mask = _compress(np.stack([ao, edge, heat, np.clip(1.0 - cav, 0.0, 1.0) * 0.8], axis=2))
        out_dir = os.path.join(BAKES_DIR, part_id)
        os.makedirs(out_dir, exist_ok=True)
        path = os.path.join(out_dir, f"{part_id}_lod{lod}_mask.png")
        img = bpy.data.images.new("_mf_mask_out", res, res, alpha=True)
        img.colorspace_settings.name = "Non-Color"
        img.alpha_mode = "CHANNEL_PACKED"
        img.pixels.foreach_set(np.ascontiguousarray(mask, dtype=np.float32).ravel())
        img.filepath_raw = path
        img.file_format = "PNG"
        img.save()
        bpy.data.images.remove(img)
        entry[f"lod{lod}_mask"] = os.path.relpath(path, materials.MATERIALS_DIR).replace(os.sep, "/")
        print(f"  bake {part_id} lod{lod} {res}px: {time.time() - t0:.1f} s, {os.path.getsize(path) // 1024} KB, "
              f"{scene.cycles.device}")
    print(f"BAKED {part_id}: {time.time() - t_part:.1f} s")
    return entry


def write_parts(entries: dict) -> None:
    """Merge bake entries into library.json (`parts`)."""
    with open(materials.LIBRARY_PATH) as fh:
        lib = json.load(fh)
    lib.setdefault("parts", {}).update(entries)
    with open(materials.LIBRARY_PATH, "w") as fh:
        json.dump(lib, fh, indent=1)
        fh.write("\n")
    materials.reload_library()
