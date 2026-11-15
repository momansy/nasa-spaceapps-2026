"""MissionForge kit: PBR slot materials built from assets/blender/materials/library.json.

``get_material(slot)`` returns a Principled BSDF material wired as:

    UV0 -> Mapping (1 / tiling_m, or u already angle-normalised) -> albedo (sRGB) x tint
                                                                  -> ORM  (R occlusion, G roughness, B metallic)
                                                                  -> normal map (OpenGL +Y, strength)
    UV1 -> "mf_mask" image (R AO, G edge wear, B heat or frost, A grime) multiplied into AO and roughness

Slots with no library entry keep the flat ``MATERIAL_LOOK`` colour (the T009 behaviour). The per-part mask is
bound with ``bind_part_mask`` (one part per render); materials stay shared and named by slot.
"""
from __future__ import annotations

import json
import os

import bpy

MATERIALS_DIR = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "materials"))
LIBRARY_PATH = os.path.join(MATERIALS_DIR, "library.json")
MASK_NODE = "mf_mask"
WHITE_MASK = "mf_mask_white"
WEAR_ROUGHNESS_GAIN = 0.25     # game_value: edge-wear (mask G) raises roughness by up to this much
GRIME_DARKEN = 0.35            # game_value: grime (mask A) darkens albedo by up to this fraction
SOOT_START = 0.82              # game_value: mask A above this is soot (cavity grime is baked at <= 0.8)
SOOT_DARKEN = 0.80             # game_value: full soot keeps 20 % of the (already grimed) albedo
HEAT_TINT_START = 0.35         # game_value: heat below this shows no tint (the tint sits near the throat only)

_LIB: dict | None = None


def library() -> dict:
    global _LIB
    if _LIB is None:
        _LIB = {"materials": {}}
        if os.path.exists(LIBRARY_PATH):
            with open(LIBRARY_PATH) as fh:
                _LIB = json.load(fh)
    return _LIB


def reload_library() -> dict:
    global _LIB
    _LIB = None
    return library()


def srgb_hex_to_linear(h: str) -> tuple[float, float, float, float]:
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
    lin = [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return (*lin, 1.0)


def _image(path: str, *, colour: bool) -> bpy.types.Image:
    img = bpy.data.images.load(path, check_existing=True)
    img.colorspace_settings.name = "sRGB" if colour else "Non-Color"
    return img


def _white_mask() -> bpy.types.Image:
    img = bpy.data.images.get(WHITE_MASK)
    if img is None:
        img = bpy.data.images.new(WHITE_MASK, 4, 4, alpha=True)
        img.colorspace_settings.name = "Non-Color"      # set colour space first: it regenerates a generated image
        img.alpha_mode = "CHANNEL_PACKED"               # alpha carries grime data, never transparency
        img.pixels.foreach_set([1.0, 0.0, 0.0, 0.0] * 16)   # R AO = 1 (clean), G wear 0, B heat 0, A grime 0
        img.pack()
    return img


def has_entry(slot: str) -> bool:
    e = library()["materials"].get(slot)
    return bool(e) and os.path.exists(os.path.join(MATERIALS_DIR, e["albedo"]))


def _build_textured(slot: str, entry: dict, look: dict) -> bpy.types.Material:
    mat = bpy.data.materials.new(slot)
    mat["mfkit"] = True
    mat["mf_library"] = library().get("version", 1)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    uv0 = nt.nodes.new("ShaderNodeUVMap")
    uv0.uv_map = "UVMap"
    mapn = nt.nodes.new("ShaderNodeMapping")
    s = 1.0 / float(entry["tiling_m"])
    angle_u = entry.get("uv_mode") == "angle"
    if entry.get("uv_mode") in ("trim", "atlas"):              # u: 1 repeat per metre; v is already sheet coordinates
        mapn.inputs["Scale"].default_value = (1.0, 1.0, 1.0)
    else:
        mapn.inputs["Scale"].default_value = (1.0 if angle_u else s, s, 1.0)
    nt.links.new(uv0.outputs["UV"], mapn.inputs["Vector"])

    def tex(rel, colour):
        n = nt.nodes.new("ShaderNodeTexImage")
        n.image = _image(os.path.join(MATERIALS_DIR, rel), colour=colour)
        n.interpolation = "Linear"
        n.extension = "REPEAT"
        nt.links.new(mapn.outputs["Vector"], n.inputs["Vector"])
        return n

    alb, orm, nrm = tex(entry["albedo"], True), tex(entry["orm"], False), tex(entry["normal"], False)

    uv1 = nt.nodes.new("ShaderNodeUVMap")
    uv1.uv_map = "UV1"
    mask = nt.nodes.new("ShaderNodeTexImage")
    mask.name = mask.label = MASK_NODE
    mask.image = _white_mask()
    mask.extension = "CLIP"
    nt.links.new(uv1.outputs["UV"], mask.inputs["Vector"])
    msep = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(mask.outputs["Color"], msep.inputs["Color"])
    osep = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(orm.outputs["Color"], osep.inputs["Color"])

    # colour = albedo * tint * AO(orm.R * mask.R) * (1 - grime)
    tint = nt.nodes.new("ShaderNodeMix")
    tint.data_type = "RGBA"
    tint.blend_type = "MULTIPLY"
    tint.inputs[0].default_value = 1.0
    tint.inputs[7].default_value = srgb_hex_to_linear(entry["tint"])     # RGBA sockets: 6 = A, 7 = B, output 2
    nt.links.new(alb.outputs["Color"], tint.inputs[6])
    ao = nt.nodes.new("ShaderNodeMath")
    ao.operation = "MULTIPLY"
    nt.links.new(osep.outputs["Red"], ao.inputs[0])
    nt.links.new(msep.outputs["Red"], ao.inputs[1])
    grime = nt.nodes.new("ShaderNodeMath")
    grime.operation = "MULTIPLY_ADD"        # 1 - GRIME_DARKEN * a  == a * -GRIME_DARKEN + 1
    nt.links.new(mask.outputs["Alpha"], grime.inputs[0])
    grime.inputs[1].default_value = -GRIME_DARKEN
    grime.inputs[2].default_value = 1.0
    soot = nt.nodes.new("ShaderNodeMapRange")       # soot (mask A above SOOT_START) darkens much harder
    soot.inputs["From Min"].default_value = SOOT_START
    soot.inputs["From Max"].default_value = 1.0
    soot.inputs["To Min"].default_value = 1.0
    soot.inputs["To Max"].default_value = 1.0 - SOOT_DARKEN
    nt.links.new(mask.outputs["Alpha"], soot.inputs["Value"])
    grime_soot = nt.nodes.new("ShaderNodeMath")
    grime_soot.operation = "MULTIPLY"
    nt.links.new(grime.outputs[0], grime_soot.inputs[0])
    nt.links.new(soot.outputs["Result"], grime_soot.inputs[1])
    grime = grime_soot
    shade = nt.nodes.new("ShaderNodeMath")
    shade.operation = "MULTIPLY"
    nt.links.new(ao.outputs[0], shade.inputs[0])
    nt.links.new(grime.outputs[0], shade.inputs[1])
    col = nt.nodes.new("ShaderNodeMix")
    col.data_type = "RGBA"
    col.blend_type = "MULTIPLY"
    col.inputs[0].default_value = 1.0
    nt.links.new(tint.outputs[2], col.inputs[6])
    nt.links.new(shade.outputs[0], col.inputs[7])
    base_out = col.outputs[2]
    if entry.get("heat_tint", 0.0) > 0.0:
        base_out = _heat_tint(nt, base_out, float(entry["heat_tint"]))
    nt.links.new(base_out, bsdf.inputs["Base Color"])

    # roughness = orm.G + WEAR_ROUGHNESS_GAIN * mask.G
    rough = nt.nodes.new("ShaderNodeMath")
    rough.operation = "MULTIPLY_ADD"
    nt.links.new(msep.outputs["Green"], rough.inputs[0])
    rough.inputs[1].default_value = WEAR_ROUGHNESS_GAIN
    nt.links.new(osep.outputs["Green"], rough.inputs[2])
    soot_r = nt.nodes.new("ShaderNodeMapRange")     # soot is matte: roughness rises towards 0.85
    soot_r.inputs["From Min"].default_value = SOOT_START
    soot_r.inputs["From Max"].default_value = 1.0
    nt.links.new(mask.outputs["Alpha"], soot_r.inputs["Value"])
    rmix = nt.nodes.new("ShaderNodeMix")
    rmix.data_type = "FLOAT"
    nt.links.new(soot_r.outputs["Result"], rmix.inputs["Factor"])
    nt.links.new(rough.outputs[0], rmix.inputs["A"])
    rmix.inputs["B"].default_value = 0.85
    nt.links.new(rmix.outputs["Result"], bsdf.inputs["Roughness"])

    if entry.get("alpha") == "clip":                # decal atlas: RGBA albedo, alpha carries the stencil shape
        nt.links.new(alb.outputs["Alpha"], bsdf.inputs["Alpha"])
        alb.image.alpha_mode = "STRAIGHT"
        try:
            mat.surface_render_method = "DITHERED"
        except (AttributeError, TypeError):
            pass
    if entry["metallic"][1] > 0.0:
        nt.links.new(osep.outputs["Blue"], bsdf.inputs["Metallic"])
    else:
        bsdf.inputs["Metallic"].default_value = 0.0

    nmap = nt.nodes.new("ShaderNodeNormalMap")
    nmap.inputs["Strength"].default_value = float(entry.get("normal_strength", 1.0))
    nmap.uv_map = "UVMap"
    nt.links.new(nrm.outputs["Color"], nmap.inputs["Color"])
    nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])

    mat.diffuse_color = (*look["color"], 1.0)
    mat.metallic = look["metallic"]
    mat.roughness = look["roughness"]
    return mat


HEAT_RAMP = ((0.0, (0.55, 0.40, 0.16, 1.0)),      # straw
             (0.5, (0.30, 0.15, 0.06, 1.0)),      # bronze
             (1.0, (0.10, 0.09, 0.24, 1.0)))      # blue-violet (restrained; linear RGB, game_value)


def _heat_tint(nt, colour_out, strength: float):
    """Mix a straw -> bronze -> blue-violet gradient into the colour, driven by the `heat` vertex colour (R)."""
    vc = nt.nodes.new("ShaderNodeVertexColor")
    vc.layer_name = "heat"
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(vc.outputs["Color"], sep.inputs["Color"])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position, ramp.color_ramp.elements[0].color = HEAT_RAMP[0]
    ramp.color_ramp.elements[1].position, ramp.color_ramp.elements[1].color = HEAT_RAMP[2]
    mid = ramp.color_ramp.elements.new(HEAT_RAMP[1][0])
    mid.color = HEAT_RAMP[1][1]
    hot = nt.nodes.new("ShaderNodeMapRange")       # 0 below HEAT_TINT_START, 1 at full heat
    hot.inputs["From Min"].default_value = HEAT_TINT_START
    hot.inputs["From Max"].default_value = 1.0
    nt.links.new(sep.outputs["Red"], hot.inputs["Value"])
    nt.links.new(hot.outputs["Result"], ramp.inputs["Fac"])
    fac = nt.nodes.new("ShaderNodeMath")
    fac.operation = "MULTIPLY"
    fac.use_clamp = True
    fac.inputs[1].default_value = strength
    nt.links.new(hot.outputs["Result"], fac.inputs[0])
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    nt.links.new(fac.outputs[0], mix.inputs[0])
    nt.links.new(colour_out, mix.inputs[6])
    nt.links.new(ramp.outputs["Color"], mix.inputs[7])
    return mix.outputs[2]


def get_material(slot: str, look: dict, flat_builder) -> bpy.types.Material:
    """Library material for slot when textures exist, else the flat fallback from ``flat_builder``."""
    mat = bpy.data.materials.get(slot)
    if mat is not None and mat.get("mfkit"):
        return mat
    entry = library().get("materials", {}).get(slot)
    if entry is not None and has_entry(slot):
        return _build_textured(slot, entry, look)
    return flat_builder(slot)


def bind_part_mask(part_id: str, lod: int) -> bool:
    """Point every slot material's mask node at the baked mask of (part_id, lod); white when none exists."""
    part = library().get("parts", {}).get(part_id)
    key = f"lod{lod}_mask"
    img = _white_mask()
    found = False
    if part and key in part:
        path = os.path.join(MATERIALS_DIR, part[key])
        if os.path.exists(path):
            img = bpy.data.images.load(path, check_existing=True)
            img.colorspace_settings.name = "Non-Color"
            img.alpha_mode = "CHANNEL_PACKED"
            found = True
    for mat in bpy.data.materials:
        if mat.use_nodes and mat.get("mfkit"):
            node = mat.node_tree.nodes.get(MASK_NODE)
            if node is not None:
                node.image = img
    return found
