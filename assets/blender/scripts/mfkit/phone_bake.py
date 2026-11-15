"""MissionForge kit: bake the phone LOD to one 512x512 texture set on UV1 (VISUAL_TARGET 2.4, T032 step 11).

The phone GLB carries a single material:
    albedo (sRGB, RGBA): base colour of every slot material with the part mask applied (AO, grime, soot, heat tint)
                          and the decal atlas; alpha is 1 on the skin and the stencil shape on decal quads (glTF MASK)
    ORM    (linear):     R occlusion (already multiplied into albedo, kept for the format), G roughness, B metallic
    normal (linear):     tangent-space normal on UV1 (OpenGL +Y), from the slot normal maps
Bakes run in Cycles on copies of the slot materials, so the shared slot materials are never modified.
"""
from __future__ import annotations

import bpy
import numpy as np

from . import materials, uv

PHONE_TEX_RES = 512             # game_value: VISUAL_TARGET 2.4 phone set
PHONE_BAKE_SAMPLES = 16         # emission and normal bakes converge quickly
PHONE_MARGIN_PX = 4
ALPHA_CUTOFF = 0.5


def _bsdf(mat):
    return next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)


def _output(mat):
    return next((n for n in mat.node_tree.nodes if n.type == "OUTPUT_MATERIAL" and n.is_active_output),
                next((n for n in mat.node_tree.nodes if n.type == "OUTPUT_MATERIAL"), None))


def _source(nt, sock, *, colour: bool):
    """Output socket feeding `sock`, or an RGB/Value node holding its default value."""
    if sock.is_linked:
        return sock.links[0].from_socket
    if colour:
        n = nt.nodes.new("ShaderNodeRGB")
        v = sock.default_value
        n.outputs[0].default_value = (v[0], v[1], v[2], 1.0)
    else:
        n = nt.nodes.new("ShaderNodeValue")
        n.outputs[0].default_value = float(sock.default_value)
    return n.outputs[0]


def _bake_copies(ob) -> list:
    """Replace the object's materials by working copies (the originals stay untouched)."""
    copies = []
    for i, m in enumerate(ob.data.materials):
        if m is None:
            m = bpy.data.materials.new(f"_mf_phone_blank_{i}")
            m.use_nodes = True
        c = m.copy()
        c.name = f"_mf_phone_{m.name}"
        ob.data.materials[i] = c
        copies.append(c)
    return copies


def _bake(scene, ob, copies, kind: str, res: int) -> np.ndarray:
    """One bake pass into a float image; kind in albedo, alpha, metallic, roughness, normal."""
    img = bpy.data.images.new(f"_mf_phone_{kind}", res, res, alpha=False, float_buffer=True)
    img.colorspace_settings.name = "Non-Color"
    restore = []
    for mat in copies:
        nt = mat.node_tree
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = img
        for n in nt.nodes:
            n.select = False
        tex.select = True
        nt.nodes.active = tex
        bsdf, out = _bsdf(mat), _output(mat)
        if kind in ("albedo", "alpha", "metallic") and bsdf is not None and out is not None:
            sock = {"albedo": "Base Color", "alpha": "Alpha", "metallic": "Metallic"}[kind]
            src = _source(nt, bsdf.inputs[sock], colour=(kind == "albedo"))
            em = nt.nodes.new("ShaderNodeEmission")
            nt.links.new(src, em.inputs["Color"])
            old = out.inputs["Surface"].links[0].from_socket if out.inputs["Surface"].is_linked else None
            nt.links.new(em.outputs[0], out.inputs["Surface"])
            restore.append((nt, out, old))
    btype = {"albedo": "EMIT", "alpha": "EMIT", "metallic": "EMIT", "roughness": "ROUGHNESS", "normal": "NORMAL"}[kind]
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    kwargs = dict(type=btype, margin=PHONE_MARGIN_PX, margin_type="EXTEND", use_clear=True,
                  target="IMAGE_TEXTURES")
    if btype == "NORMAL":
        kwargs.update(normal_space="TANGENT", normal_r="POS_X", normal_g="POS_Y", normal_b="POS_Z")
    bpy.ops.object.bake(**kwargs)
    for nt, out, old in restore:
        if old is not None:
            nt.links.new(old, out.inputs["Surface"])
    arr = np.empty(res * res * 4, dtype=np.float32)
    img.pixels.foreach_get(arr)
    bpy.data.images.remove(img)
    return arr.reshape(res, res, 4)


def _linear_to_srgb(x: np.ndarray) -> np.ndarray:
    x = np.clip(x, 0.0, 1.0)
    return np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(x, 1.0 / 2.4) - 0.055)


def _packed_image(name: str, rgba: np.ndarray, *, colour: bool, fmt: str) -> bpy.types.Image:
    res = rgba.shape[0]
    img = bpy.data.images.new(name, res, res, alpha=True)
    img.colorspace_settings.name = "sRGB" if colour else "Non-Color"
    img.alpha_mode = "STRAIGHT"
    img.pixels.foreach_set(np.ascontiguousarray(rgba, dtype=np.float32).ravel())
    img.file_format = fmt
    img.pack()
    return img


def _phone_material(part_id: str, alb, orm, nrm) -> bpy.types.Material:
    mat = bpy.data.materials.new(f"{part_id}_phone")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs[0], out.inputs["Surface"])
    uvn = nt.nodes.new("ShaderNodeUVMap")
    uvn.uv_map = uv.UV1_NAME

    def tex(img):
        n = nt.nodes.new("ShaderNodeTexImage")
        n.image = img
        n.interpolation = "Linear"
        nt.links.new(uvn.outputs["UV"], n.inputs["Vector"])
        return n

    a, o, n = tex(alb), tex(orm), tex(nrm)
    nt.links.new(a.outputs["Color"], bsdf.inputs["Base Color"])
    clip = nt.nodes.new("ShaderNodeMath")              # glTF exporter reads ROUND on alpha as alphaMode MASK, cutoff 0.5
    clip.operation = "ROUND"
    nt.links.new(a.outputs["Alpha"], clip.inputs[0])
    nt.links.new(clip.outputs[0], bsdf.inputs["Alpha"])
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(o.outputs["Color"], sep.inputs["Color"])
    nt.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
    nt.links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
    nm = nt.nodes.new("ShaderNodeNormalMap")
    nm.uv_map = uv.UV1_NAME
    nt.links.new(n.outputs["Color"], nm.inputs["Color"])
    nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    try:
        mat.surface_render_method = "DITHERED"
    except (AttributeError, TypeError):
        pass
    return mat


def bake_phone(part_id: str, ob, scene, lod: int, res: int = PHONE_TEX_RES) -> dict:
    """Bake `ob` (a phone-LOD mesh object with UV1 and slot materials) to one texture set and swap its materials for
    the single baked material. Returns sizes for the report."""
    if uv.UV1_NAME not in ob.data.uv_layers:
        raise RuntimeError(f"{part_id}: phone mesh has no {uv.UV1_NAME}")
    materials.bind_part_mask(part_id, lod)
    eng = scene.render.engine
    try:
        scene.render.engine = "CYCLES"
    except TypeError:
        pass
    samples = scene.cycles.samples
    scene.cycles.samples = PHONE_BAKE_SAMPLES
    me = ob.data
    me.uv_layers.active = me.uv_layers[uv.UV1_NAME]          # bake target and normal tangents on UV1
    copies = _bake_copies(ob)
    try:
        alb = _bake(scene, ob, copies, "albedo", res)
        alpha = _bake(scene, ob, copies, "alpha", res)
        rough = _bake(scene, ob, copies, "roughness", res)
        metal = _bake(scene, ob, copies, "metallic", res)
        nrm = _bake(scene, ob, copies, "normal", res)
    finally:
        scene.cycles.samples = samples
        try:
            scene.render.engine = eng
        except TypeError:
            pass
    rgba = np.empty((res, res, 4), np.float32)
    rgba[..., :3] = _linear_to_srgb(alb[..., :3])
    rgba[..., 3] = np.where(alpha[..., 0] >= ALPHA_CUTOFF, 1.0, 0.0)
    orm = np.ones((res, res, 4), np.float32)
    orm[..., 0] = 1.0                                          # occlusion already multiplied into albedo
    orm[..., 1] = np.clip(rough[..., 0], 0.0, 1.0)
    orm[..., 2] = np.clip(metal[..., 0], 0.0, 1.0)
    nrm[..., 3] = 1.0
    a_img = _packed_image(f"{part_id}_phone_albedo", rgba, colour=True, fmt="PNG")
    o_img = _packed_image(f"{part_id}_phone_orm", orm, colour=False, fmt="JPEG")
    n_img = _packed_image(f"{part_id}_phone_normal", np.clip(nrm, 0.0, 1.0), colour=False, fmt="PNG")
    mat = _phone_material(part_id, a_img, o_img, n_img)
    for c in copies:
        bpy.data.materials.remove(c)
    me.materials.clear()
    me.materials.append(mat)
    me.polygons.foreach_set("material_index", [0] * len(me.polygons))
    me.update()
    if uv.UV0_NAME in me.uv_layers:                           # the phone set lives on UV1 only
        me.uv_layers.remove(me.uv_layers[uv.UV0_NAME])
    for attr in [a for a in me.color_attributes]:            # heat is baked in; no vertex colours in the GLB
        me.color_attributes.remove(attr)
    return dict(res=res, images=[a_img.name, o_img.name, n_img.name])
