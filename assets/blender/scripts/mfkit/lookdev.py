"""MissionForge kit: scripted, deterministic look-dev setups (VISUAL_TARGET 2.5).

    setup_studio_hdri(scene)   neutral CC0 HDRI + soft shadow-catcher floor + navy backdrop, no horizon line
    setup_dusk_pad(scene)      CC0 sunset HDRI (sun 3..8 deg above the horizon) + 4500 K sun lamp
                               aligned to the HDRI sun + wet ambientCG concrete that reflects

Both render with Cycles (denoised, AgX). The cameras are created by ``studio`` and framed per shot by
``studio.frame_camera``; ``place_floor`` keeps the floor just under the part being rendered.

Sources (also in assets/blender/materials/THIRD_PARTY.md):
    studio_small_09_2k.hdr          Poly Haven, Sergej Majboroda, CC0  https://polyhaven.com/a/studio_small_09
    belfast_sunset_puresky_2k.hdr   Poly Haven, Greg Zaal et al., CC0  https://polyhaven.com/a/belfast_sunset_puresky
    Concrete034 (2K-JPG, resized to 1K)            ambientCG, CC0                     https://ambientcg.com/a/Concrete034
"""
from __future__ import annotations

import math
import os

import bpy
from mathutils import Euler, Matrix, Vector

from . import studio

MATERIALS_DIR = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "materials"))
HDRI_STUDIO = os.path.join(MATERIALS_DIR, "hdri", "studio_small_09_2k.hdr")
HDRI_DUSK = os.path.join(MATERIALS_DIR, "hdri", "belfast_sunset_puresky_2k.hdr")
CONCRETE_DIR = os.path.join(MATERIALS_DIR, "textures", "lookdev_concrete034")

LOOKDEVS = ("studio", "dusk")
DEFAULT_SAMPLES = 256            # game_value: VISUAL_TARGET 2.5 asks for at least 256
SUN_TEMPERATURE_K = 4500.0       # game_value, VISUAL_TARGET 1
FLOOR_RADIUS_M = 400.0
# Brightest pixel of belfast_sunset_puresky_2k.hdr (measured once with numpy), equirectangular uv.
DUSK_SUN_UV = (0.604736, 0.511230)
DUSK_SUN_ELEVATION_TARGET_DEG = 5.0   # inside the 3..8 degree window
DUSK_SUN_AZIMUTH_DEG = 70.0           # world azimuth of the sun: a warm 3/4 rim, about 120 deg from the 3q camera (frame 02)
FLOOR_NAME = "mf_lookdev_floor"
_COL = "lookdev"


def blackbody_rgb(kelvin: float) -> tuple[float, float, float]:
    """Linear-ish RGB for a black body, Tanner Helland approximation (clamped 1000..12000 K)."""
    t = max(1000.0, min(12000.0, kelvin)) / 100.0
    r = 255.0 if t <= 66 else 329.698727446 * ((t - 60) ** -0.1332047592)
    g = 99.4708025861 * math.log(t) - 161.1195681661 if t <= 66 else 288.1221695283 * ((t - 60) ** -0.0755148492)
    b = 255.0 if t >= 66 else (0.0 if t <= 19 else 138.5177312231 * math.log(t - 10) - 305.0447927307)
    srgb = [max(0.0, min(255.0, c)) / 255.0 for c in (r, g, b)]
    return tuple(c ** 2.2 for c in srgb)


def _col(scene):
    col = bpy.data.collections.get(_COL) or bpy.data.collections.new(_COL)
    if col.name not in scene.collection.children:
        scene.collection.children.link(col)
    return col


def _reset(scene):
    """Remove the previous look-dev (and the legacy studio rig) so setups never stack."""
    for name in (_COL, studio.STUDIO):
        col = bpy.data.collections.get(name)
        if col is not None:
            for o in list(col.objects):
                if name == studio.STUDIO and o.name.startswith("mf_camera"):
                    continue
                bpy.data.objects.remove(o, do_unlink=True)
    scene.camera = scene.camera or _make_camera(scene)


def _make_camera(scene):
    cam = bpy.data.objects.get("mf_camera")
    if cam is None:
        cam = bpy.data.objects.new("mf_camera", bpy.data.cameras.new("mf_camera"))
    col = studio._studio_collection(scene)
    if cam.name not in col.objects:
        col.objects.link(cam)
    scene.camera = cam
    return cam


def configure_cycles(scene, samples: int = DEFAULT_SAMPLES):
    """Cycles with denoising, AgX and the best available GPU (Metal on macOS), else CPU."""
    scene.render.engine = "CYCLES"
    cy = scene.cycles
    cy.samples = samples
    cy.use_denoising = True
    try:
        cy.denoiser = "OPENIMAGEDENOISE"
    except TypeError:
        pass
    cy.use_adaptive_sampling = True
    cy.adaptive_threshold = 0.01
    cy.max_bounces = 8
    cy.glossy_bounces = 6
    cy.device = "CPU"
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        for dev_type in ("METAL", "OPTIX", "CUDA", "HIP", "NONE"):
            try:
                prefs.compute_device_type = dev_type
            except TypeError:
                continue
            if dev_type == "NONE":
                break
            prefs.get_devices()
            gpus = [d for d in prefs.devices if d.type != "CPU"]
            if gpus:
                for d in prefs.devices:
                    d.use = True
                cy.device = "GPU"
                break
    except Exception:
        cy.device = "CPU"
    try:
        scene.view_settings.view_transform = "AgX"
        scene.view_settings.look = "AgX - Medium High Contrast"
    except TypeError:
        pass
    scene.render.film_transparent = False
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_depth = "8"
    scene.view_settings.exposure = 0.0


def _env_node(nt, path):
    node = nt.nodes.new("ShaderNodeTexEnvironment")
    node.image = bpy.data.images.load(path, check_existing=True)
    node.image.colorspace_settings.name = "Linear Rec.709"
    return node


def _world_with_hdri(name, hdri_path, rotation: Euler, strength: float, camera_mode: str):
    """World whose lighting comes from the HDRI; camera rays see the HDRI ('hdri') or a navy gradient ('navy')."""
    world = bpy.data.worlds.get(name) or bpy.data.worlds.new(name)
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    texc = nt.nodes.new("ShaderNodeTexCoord")
    mapn = nt.nodes.new("ShaderNodeMapping")
    mapn.inputs["Rotation"].default_value = rotation
    env = _env_node(nt, hdri_path)
    light_bg = nt.nodes.new("ShaderNodeBackground")
    light_bg.inputs["Strength"].default_value = strength
    nt.links.new(texc.outputs["Generated"], mapn.inputs["Vector"])
    nt.links.new(mapn.outputs["Vector"], env.inputs["Vector"])
    nt.links.new(env.outputs["Color"], light_bg.inputs["Color"])
    if camera_mode == "hdri":
        nt.links.new(light_bg.outputs[0], out.inputs[0])
        return world
    # navy backdrop in screen space: a vertical gradient with a soft vignette, no horizon line
    lp = nt.nodes.new("ShaderNodeLightPath")
    mix = nt.nodes.new("ShaderNodeMixShader")
    navy = nt.nodes.new("ShaderNodeBackground")
    win = nt.nodes.new("ShaderNodeTexCoord")
    sepx = nt.nodes.new("ShaderNodeSeparateXYZ")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = (0.010, 0.026, 0.050, 1.0)    # bottom: deep navy (linear)
    ramp.color_ramp.elements[1].position = 1.0
    ramp.color_ramp.elements[1].color = (0.034, 0.075, 0.125, 1.0)    # top: lighter navy
    mid = ramp.color_ramp.elements.new(0.45)
    mid.color = (0.020, 0.048, 0.085, 1.0)
    nt.links.new(win.outputs["Window"], sepx.inputs[0])
    nt.links.new(sepx.outputs["Y"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], navy.inputs["Color"])
    navy.inputs["Strength"].default_value = 1.0
    nt.links.new(lp.outputs["Is Camera Ray"], mix.inputs["Fac"])
    nt.links.new(light_bg.outputs[0], mix.inputs[1])
    nt.links.new(navy.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs[0])
    return world


def _make_light(col, name, kind, energy, direction, colour, angle_rad=None):
    data = bpy.data.lights.new(name, kind)
    data.energy = energy
    data.color = colour
    if kind == "SUN" and angle_rad is not None:
        data.angle = angle_rad
    ob = bpy.data.objects.new(name, data)
    col.objects.link(ob)
    # a sun lamp shines along its local -Z; direction is the direction TOWARDS the light
    ob.rotation_euler = Vector(direction).normalized().to_track_quat("Z", "Y").to_euler()
    return ob


def _floor(col, name, material):
    me = bpy.data.meshes.new(name)
    n, r = 48, FLOOR_RADIUS_M
    verts = [(r * math.cos(2 * math.pi * i / n), r * math.sin(2 * math.pi * i / n), 0.0) for i in range(n)]
    me.from_pydata(verts, [], [list(range(n))])
    me.update()
    ob = bpy.data.objects.new(FLOOR_NAME, me)
    col.objects.link(ob)
    if material is not None:
        me.materials.append(material)
    return ob


def place_floor(scene, objs, *, camera_view_dir=None):
    """Put the floor just under objs; hide it for cameras that look from below (so the backdrop shows)."""
    floor = bpy.data.objects.get(FLOOR_NAME)
    if floor is None:
        return
    lo, hi = studio.bounds_of(objs)
    size = max((hi - lo).length, 0.1)
    floor.location = (0.0, 0.0, lo.z - 0.012 * size)
    below = camera_view_dir is not None and Vector(camera_view_dir).z < -0.01
    floor.hide_render = bool(below)


# ---------------------------------------------------------------------------------------------------------
def setup_studio_hdri(scene=None, *, samples: int = DEFAULT_SAMPLES):
    """Neutral studio HDRI, a warm 4500 K rim sun, soft shadow-catcher floor and a graded navy backdrop."""
    scene = scene or bpy.context.scene
    _reset(scene)
    col = _col(scene)
    scene.world = _world_with_hdri("mf_world_studio", HDRI_STUDIO, Euler((0.0, 0.0, math.radians(200.0))),
                                   strength=1.7, camera_mode="navy")
    # warm low rim from behind-left, cool fill from the right: key:fill about 4:1
    _make_light(col, "mf_rim", "SUN", 4.5, (-0.85, 0.75, 0.38), blackbody_rgb(SUN_TEMPERATURE_K), math.radians(4.0))
    _make_light(col, "mf_fill", "SUN", 0.8, (0.9, -0.3, 0.25), blackbody_rgb(8000.0), math.radians(25.0))
    mat = bpy.data.materials.new("mf_shadow_floor")
    mat.use_nodes = True
    floor = _floor(col, FLOOR_NAME, mat)
    floor.is_shadow_catcher = True
    configure_cycles(scene, samples)
    return _make_camera(scene)


def dusk_sun_direction(rotation: Euler) -> Vector:
    """World direction (towards the sun) of the HDRI sun after the world mapping ``rotation``."""
    u, v = DUSK_SUN_UV
    az = -(u - 0.5) * 2.0 * math.pi
    el = (v - 0.5) * math.pi
    env = Vector((math.cos(el) * math.cos(az), math.cos(el) * math.sin(az), math.sin(el)))
    # Mapping (point) turns the lookup vector by R, so a world direction d reads the image at R @ d
    return rotation.to_matrix().inverted() @ env


def _dusk_rotation() -> Euler:
    """Mapping rotation that puts the HDRI sun at DUSK_SUN_AZIMUTH_DEG and about 5 deg elevation."""
    u, v = DUSK_SUN_UV
    az_e = -(u - 0.5) * 2.0 * math.pi
    el_e = (v - 0.5) * math.pi
    tilt = math.radians(DUSK_SUN_ELEVATION_TARGET_DEG) - el_e
    axis = Vector((-math.sin(az_e), math.cos(az_e), 0.0))
    # raising the sun by `tilt` about the horizontal axis perpendicular to its azimuth (axis x sun = -z)
    m_tilt = Matrix.Rotation(-tilt, 3, axis)
    m_yaw = Matrix.Rotation(math.radians(DUSK_SUN_AZIMUTH_DEG) - az_e, 3, "Z")
    world_from_env = m_yaw @ m_tilt
    return world_from_env.inverted().to_euler("XYZ")


def _wet_concrete():
    mat = bpy.data.materials.get("mf_wet_concrete")
    if mat is not None:
        return mat
    mat = bpy.data.materials.new("mf_wet_concrete")
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")

    def tex(name, noncolor):
        n = nt.nodes.new("ShaderNodeTexImage")
        n.image = bpy.data.images.load(os.path.join(CONCRETE_DIR, name), check_existing=True)
        n.image.colorspace_settings.name = "Non-Color" if noncolor else "sRGB"
        return n

    texc = nt.nodes.new("ShaderNodeTexCoord")
    mapn = nt.nodes.new("ShaderNodeMapping")
    mapn.inputs["Scale"].default_value = (FLOOR_RADIUS_M / 1.0,) * 3     # Generated coords span 0..1 over 2R; ambientCG tile is 2 m: ~2 m per repeat
    nt.links.new(texc.outputs["Generated"], mapn.inputs["Vector"])
    col, rough, nrm = (tex("Concrete034_2K-JPG_Color.jpg", False), tex("Concrete034_2K-JPG_Roughness.jpg", True),
                       tex("Concrete034_2K-JPG_NormalGL.jpg", True))
    for n in (col, rough, nrm):
        nt.links.new(mapn.outputs["Vector"], n.inputs["Vector"])
    darken = nt.nodes.new("ShaderNodeMix")
    darken.data_type = "RGBA"
    darken.inputs[0].default_value = 0.8                              # wet concrete is darker
    darken.inputs[7].default_value = (0.03, 0.035, 0.045, 1.0)        # RGBA sockets: 6 = A, 7 = B, output 2
    nt.links.new(col.outputs["Color"], darken.inputs[6])
    nt.links.new(darken.outputs[2], bsdf.inputs["Base Color"])
    # wet: roughness scaled down hard so the sky and the hardware reflect in it
    wet = nt.nodes.new("ShaderNodeMath")
    wet.operation = "MULTIPLY"
    wet.inputs[1].default_value = 0.5
    nt.links.new(rough.outputs["Color"], wet.inputs[0])
    nt.links.new(wet.outputs[0], bsdf.inputs["Roughness"])
    nmap = nt.nodes.new("ShaderNodeNormalMap")
    nmap.inputs["Strength"].default_value = 0.25
    nt.links.new(nrm.outputs["Color"], nmap.inputs["Color"])
    nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    bsdf.inputs["Specular IOR Level"].default_value = 0.3        # T032: 0.7 washed the pad out to lavender
    return mat


def setup_dusk_pad(scene=None, *, samples: int = DEFAULT_SAMPLES):
    """Low-sun sunset HDRI, a 4500 K sun lamp aligned to the HDRI sun, wet reflective concrete ground."""
    scene = scene or bpy.context.scene
    _reset(scene)
    col = _col(scene)
    rot = _dusk_rotation()
    scene.world = _world_with_hdri("mf_world_dusk", HDRI_DUSK, rot, strength=0.55, camera_mode="hdri")
    sun_dir = dusk_sun_direction(rot)
    elev = math.degrees(math.asin(sun_dir.z))
    if not 3.0 <= elev <= 8.0:
        raise RuntimeError(f"dusk sun elevation {elev:.2f} deg is outside 3..8")
    _make_light(col, "mf_sun_dusk", "SUN", 5.0, tuple(sun_dir), blackbody_rgb(SUN_TEMPERATURE_K), math.radians(1.2))
    _floor(col, FLOOR_NAME, _wet_concrete())
    configure_cycles(scene, samples)
    return _make_camera(scene)


def setup(scene, name: str, *, samples: int = DEFAULT_SAMPLES):
    if name == "studio":
        return setup_studio_hdri(scene, samples=samples)
    if name == "dusk":
        return setup_dusk_pad(scene, samples=samples)
    raise ValueError(f"unknown look-dev {name!r}; use one of {LOOKDEVS}")
