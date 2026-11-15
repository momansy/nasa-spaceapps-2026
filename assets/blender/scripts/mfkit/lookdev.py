"""MissionForge kit: scripted, deterministic look-dev setups (VISUAL_TARGET 2.5).

    setup_studio_hdri(scene)   neutral CC0 HDRI + soft shadow-catcher floor + navy backdrop, no horizon line
    setup_dusk_pad(scene)      CC0 sunset HDRI (sun 3..8 deg above the horizon, re-tinted navy, lights diffuse
                               only) + 4500 K sun lamp aligned to the HDRI sun (key:fill ~4:1) + procedural
                               navy -> amber sky for camera/glossy rays + wet ambientCG concrete with
                               near-mirror puddles + a soft navy vignette (compositor)

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
STUDIO_RIM_STRENGTH = 3.0             # game_value: warm rim sun of studio_hdri (was 4.5)
STUDIO_RIM_ANGLE_DEG = 10.0           # game_value: softer disc (was 4 deg) so grazing highlights spread instead of fringing
STUDIO_RIM_SATURATION = 1.6           # game_value: keep the 4500 K rim gold after AgX

# --- dusk_pad grade (T032 review M8/M10: "overcast lavender", no rim, grey shadows, dry ground) -----------
# All values below are game_value art-direction constants tuned by eye against reference frame 02 under
# Cycles + AgX Medium High Contrast; colours are linear Rec.709.
DUSK_EXPOSURE = 0.8                   # game_value (stops): T032 requeue; at 0 the hardware read as a silhouette
DUSK_CAMERA_SKY = 0.5                 # game_value: camera-ray sky strength relative to the reflected sky
DUSK_SUN_STRENGTH = 4.2               # key: 4500 K sun lamp irradiance (W/m^2) aligned to the HDRI sun
DUSK_SUN_ANGLE_DEG = 1.2              # soft-ish disc: crisp rim, slightly softened shadow edge
DUSK_FILL_STRENGTH = 1.25             # world (HDRI) strength for diffuse light only. Measured on a white diffuse
                                      # card: (key + fill) / fill = 3.9 (sun-facing vs away-facing), i.e. ~4:1
DUSK_FILL_NAVY = (0.30, 0.52, 1.00)   # HDRI luminance is re-tinted toward this deep-blue sky (about 8000 K+)
DUSK_FILL_KEEP_HUE = 0.20             # share of the HDRI's own colour kept (0 = pure navy fill, 1 = raw HDRI)
DUSK_FILL_CLAMP = 1.5                 # per-channel cap on the HDRI light so its own sun disc is not a 2nd key
# Camera / glossy sky: procedural grade built from the same sun direction (the puresky HDRI has no clouds,
# so nothing is lost), so the backdrop and every reflection read navy above, amber at the horizon by the sun.
DUSK_SKY_STOPS = (                    # (sin(elevation) remapped to 0..1 as (z + 1) / 2, colour)
    (0.00, (0.003, 0.009, 0.020)),    # straight down (low views with the floor hidden): deep navy
    (0.47, (0.010, 0.024, 0.050)),    # just below the horizon: navy haze
    (0.50, (0.100, 0.135, 0.215)),    # horizon, away from the sun: dusky blue (paler read lavender in the wet floor)
    (0.56, (0.120, 0.210, 0.310)),    # ~7 deg: clear pale blue; kept light so the warm blend reads as glow, not grey
    (0.63, (0.060, 0.135, 0.250)),    # ~15 deg: blue (T032 requeue: brighter, metals mirror this band)
    (0.75, (0.022, 0.066, 0.150)),    # ~30 deg: mid blue (frame 02 centre sky)
    (1.00, (0.006, 0.020, 0.050)),    # zenith: deep navy (the vignette takes the corners to frame 02's 10/35/58)
)
DUSK_GLOW_STOPS = (                   # warm sky colour by elevation (same fac): orange at the horizon, gold above
    (0.50, (1.00, 0.24, 0.020)),      # it, pale cream where it meets the blue (frame 02), so the blend stays bright
    (0.53, (1.00, 0.45, 0.090)),      # instead of muddy. It REPLACES the blue (a lerp); adding it on top of blue is
    (0.58, (1.00, 0.72, 0.380)),      # what made the T032 sky lavender. Pre-saturated: AgX desaturates bright values.
)
DUSK_GLOW_STRENGTH = 1.7              # radiance of that warm horizon
DUSK_GLOW_LOBE = ((0.40, 0.0), (0.55, 0.10), (0.68, 0.35), (0.82, 0.75), (0.95, 1.0))
# ^ warm weight vs (cos(angle to sun) + 1) / 2 (eased): 0 beyond ~100 deg, ~0.35 at ~69 deg, ~0.75 at ~50 deg.
#   The 3q / cluster cameras look ~58 deg off the sun, so their horizon runs pale (left) -> amber (right), like frame 02.
DUSK_GLOW_BAND = ((0.495, 0.0), (0.502, 1.0), (0.53, 0.70), (0.56, 0.30), (0.62, 0.0))
# ^ (fac, weight): the warm band hugs the horizon and is gone by ~14 deg; any warm colour lerped into the navy
#   upper sky turns it brown, so only the dome right around the sun climbs higher
DUSK_GLOW_DOME = (0.50, 28.0)         # (weight, p): extra warm dome ((cos+1)/2)^p around the sun, so the glow
                                      # climbs higher near the sun instead of being a flat strip
DUSK_HALO_COLOUR = (1.00, 0.50, 0.16)  # glow around the sun disc (sun-side sky, puddle glints)
DUSK_HALO_WIDE = (0.9, 24.0)          # (radiance, cos^p): ~ 20 deg soft bloom of the low sun
DUSK_HALO_TIGHT = (25.0, 900.0)       # (radiance, cos^p): ~ 2.5 deg hot core
DUSK_RIM_SATURATION = 2.4             # AgX desaturates bright highlights; pre-saturate the 4500 K key so the rim
                                      # reads gold like frame 02 (hue unchanged, chroma x2.4)
DUSK_VIGNETTE = 0.6                   # compositor: frame edges fall 60 % of the way to navy (frame 02 vignette)
DUSK_VIGNETTE_NAVY = (0.004, 0.014, 0.032)
DUSK_VIGNETTE_SIZE = (0.85, 0.85)     # ellipse (fraction of the frame) left untouched before the soft falloff
DUSK_VIGNETTE_SOFT = 0.25             # Gaussian blur of the ellipse edge, as a fraction of the longer render side
# Wet concrete (ambientCG Concrete034)
WET_ALBEDO_SCALE = 0.22               # wet concrete is ~3x darker than dry (frame 02 pad reads near-navy)
WET_ALBEDO_TINT = (0.80, 0.86, 1.00)  # slight cool cast (water film + sky)
WET_ROUGH_SCALE = 0.40                # damp areas: texture roughness * scale + offset
WET_ROUGH_OFFSET = 0.06
PUDDLE_ROUGHNESS = 0.025              # near-mirror standing water
PUDDLE_ALBEDO_SCALE = 0.55            # puddles darken the concrete further
PUDDLE_NOISE_SCALE = 0.22             # 1/m: puddle blobs a few metres across (object space = metres)
PUDDLE_THRESHOLD = (0.50, 0.56)       # noise ramp: coverage ~40 %, soft 0.06 edge
WET_SPECULAR = 0.24                   # Specular IOR Level 0.5 = F0 4 %; reflections are now navy/amber, not lavender
WET_NORMAL_STRENGTH = 0.30            # concrete relief on damp areas; 0 inside puddles (flat water)
_COL = "lookdev"


def blackbody_rgb(kelvin: float) -> tuple[float, float, float]:
    """Linear-ish RGB for a black body, Tanner Helland approximation (clamped 1000..12000 K)."""
    t = max(1000.0, min(12000.0, kelvin)) / 100.0
    r = 255.0 if t <= 66 else 329.698727446 * ((t - 60) ** -0.1332047592)
    g = 99.4708025861 * math.log(t) - 161.1195681661 if t <= 66 else 288.1221695283 * ((t - 60) ** -0.0755148492)
    b = 255.0 if t >= 66 else (0.0 if t <= 19 else 138.5177312231 * math.log(t - 10) - 305.0447927307)
    srgb = [max(0.0, min(255.0, c)) / 255.0 for c in (r, g, b)]
    return tuple(c ** 2.2 for c in srgb)


def _saturate(rgb, amount: float) -> tuple[float, float, float]:
    """Scale chroma about Rec.709 luminance, renormalised so the brightest channel is 1."""
    lum = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]
    c = [max(0.0, lum + (v - lum) * amount) for v in rgb]
    m = max(c)
    return tuple(v / m for v in c)


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
    scene.use_nodes = False              # drop a previous dusk vignette; studio renders never use the compositor
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


def _math(nt, op, a=None, b=None, c=None, *, vector=False):
    """A Math / Vector Math node; a, b and c are sockets or constants. Returns the first output."""
    node = nt.nodes.new("ShaderNodeVectorMath" if vector else "ShaderNodeMath")
    node.operation = op
    for i, v in enumerate((a, b, c)):
        if v is None:
            continue
        if isinstance(v, bpy.types.NodeSocket):
            nt.links.new(v, node.inputs[i])
        else:
            node.inputs[i].default_value = v
    return node.outputs[0]


def _ramp(nt, fac, stops, interpolation="LINEAR"):
    node = nt.nodes.new("ShaderNodeValToRGB")
    node.color_ramp.interpolation = interpolation
    els = node.color_ramp.elements
    els[0].position, els[0].color = stops[0][0], (*stops[0][1], 1.0)
    els[1].position, els[1].color = stops[-1][0], (*stops[-1][1], 1.0)
    for pos, c in stops[1:-1]:
        els.new(pos).color = (*c, 1.0)
    nt.links.new(fac, node.inputs["Fac"])
    return node.outputs["Color"]


def _dusk_sky_colour(nt, sun_dir: Vector):
    """Procedural graded sky (linear RGB socket): navy zenith, amber horizon glow and halo towards sun_dir."""
    texc = nt.nodes.new("ShaderNodeTexCoord")
    d = texc.outputs["Generated"]                                   # world view direction for world shaders
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(d, sep.inputs[0])
    fac = _math(nt, "MULTIPLY_ADD", sep.outputs["Z"], 0.5, 0.5)     # (z + 1) / 2
    base = _ramp(nt, fac, DUSK_SKY_STOPS)
    sun = _math(nt, "DOT_PRODUCT", d, tuple(sun_dir), vector=True).node.outputs["Value"]   # cos(angle to sun)
    lobe = _math(nt, "MULTIPLY", _ramp(nt, _math(nt, "MULTIPLY_ADD", sun, 0.5, 0.5),
                                       tuple((f, (w,) * 3) for f, w in DUSK_GLOW_LOBE), "EASE"), 1.0)
    band = _ramp(nt, fac, tuple((f, (w,) * 3) for f, w in DUSK_GLOW_BAND), "EASE")
    dome = _math(nt, "POWER", _math(nt, "MULTIPLY_ADD", sun, 0.5, 0.5), DUSK_GLOW_DOME[1])
    dome = _math(nt, "MULTIPLY", dome, _math(nt, "GREATER_THAN", sep.outputs["Z"], -0.01))
    weight = _math(nt, "MULTIPLY", _math(nt, "MULTIPLY", band, 1.0), lobe)
    weight = _math(nt, "MULTIPLY_ADD", dome, DUSK_GLOW_DOME[0], weight)
    weight.node.use_clamp = True
    warm = nt.nodes.new("ShaderNodeMix")
    warm.data_type = "RGBA"
    nt.links.new(weight, warm.inputs[0])
    nt.links.new(base, warm.inputs[6])
    nt.links.new(_ramp(nt, fac, tuple((f, tuple(v * DUSK_GLOW_STRENGTH for v in c)) for f, c in DUSK_GLOW_STOPS)),
                 warm.inputs[7])
    cos_pos = _math(nt, "MAXIMUM", sun, 0.0)
    above = _math(nt, "GREATER_THAN", sep.outputs["Z"], -0.01)       # no halo through the ground
    halo = _math(nt, "ADD", _math(nt, "MULTIPLY", _math(nt, "POWER", cos_pos, DUSK_HALO_WIDE[1]), DUSK_HALO_WIDE[0]),
                 _math(nt, "MULTIPLY", _math(nt, "POWER", cos_pos, DUSK_HALO_TIGHT[1]), DUSK_HALO_TIGHT[0]))
    halo = _math(nt, "MULTIPLY", halo, above)
    return _math(nt, "MULTIPLY_ADD", DUSK_HALO_COLOUR, halo, warm.outputs[2], vector=True)


def _world_dusk(name, hdri_path, rotation: Euler, sun_dir: Vector):
    """Dusk world: the HDRI (re-tinted to a navy sky, sun disc clamped) lights diffuse surfaces; camera and
    glossy rays see the procedural graded sky so the backdrop and reflections read navy -> amber."""
    world = bpy.data.worlds.get(name) or bpy.data.worlds.new(name)
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    texc = nt.nodes.new("ShaderNodeTexCoord")
    mapn = nt.nodes.new("ShaderNodeMapping")
    mapn.inputs["Rotation"].default_value = rotation
    env = _env_node(nt, hdri_path)
    nt.links.new(texc.outputs["Generated"], mapn.inputs["Vector"])
    nt.links.new(mapn.outputs["Vector"], env.inputs["Vector"])
    # fill = mix(luminance * navy, hdri, keep_hue), clamped per channel
    bw = nt.nodes.new("ShaderNodeRGBToBW")
    nt.links.new(env.outputs["Color"], bw.inputs[0])
    navy = _math(nt, "SCALE", DUSK_FILL_NAVY, None, vector=True)
    nt.links.new(bw.outputs[0], navy.node.inputs["Scale"])
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.inputs[0].default_value = DUSK_FILL_KEEP_HUE
    nt.links.new(navy, mix.inputs[6])
    nt.links.new(env.outputs["Color"], mix.inputs[7])
    fill = _math(nt, "MINIMUM", mix.outputs[2], (DUSK_FILL_CLAMP,) * 3, vector=True)
    light_bg = nt.nodes.new("ShaderNodeBackground")
    light_bg.inputs["Strength"].default_value = DUSK_FILL_STRENGTH
    nt.links.new(fill, light_bg.inputs["Color"])
    sky_bg = nt.nodes.new("ShaderNodeBackground")
    nt.links.new(_dusk_sky_colour(nt, sun_dir), sky_bg.inputs["Color"])
    lp = nt.nodes.new("ShaderNodeLightPath")
    # the backdrop the camera sees is dimmer than the sky the metal mirrors: hardware stays readable while the
    # frame keeps frame 02's deep navy (strength = 1 - (1 - DUSK_CAMERA_SKY) * is_camera)
    sky_k = _math(nt, "MULTIPLY_ADD", lp.outputs["Is Camera Ray"], -(1.0 - DUSK_CAMERA_SKY), 1.0)
    nt.links.new(sky_k, sky_bg.inputs["Strength"])
    seen = _math(nt, "MAXIMUM", lp.outputs["Is Camera Ray"], lp.outputs["Is Glossy Ray"])
    pick = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(seen, pick.inputs["Fac"])
    nt.links.new(light_bg.outputs[0], pick.inputs[1])
    nt.links.new(sky_bg.outputs[0], pick.inputs[2])
    nt.links.new(pick.outputs[0], out.inputs[0])
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
    # T032 requeue (RUBRIC M6): the old 4.5 / 4 deg rim burnt a crisp white 1-2 px fringe into every metal silhouette
    # in the low views (AgX desaturates it to white). A softer, pre-saturated, slightly weaker rim reads warm instead.
    _make_light(col, "mf_rim", "SUN", STUDIO_RIM_STRENGTH, (-0.85, 0.75, 0.38),
                _saturate(blackbody_rgb(SUN_TEMPERATURE_K), STUDIO_RIM_SATURATION), math.radians(STUDIO_RIM_ANGLE_DEG))
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
    # puddle mask: low-frequency noise in object space (metres), soft-thresholded; 1 = standing water
    objc = nt.nodes.new("ShaderNodeTexCoord")
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = PUDDLE_NOISE_SCALE
    noise.inputs["Detail"].default_value = 4.0
    noise.inputs["Roughness"].default_value = 0.55
    nt.links.new(objc.outputs["Object"], noise.inputs["Vector"])
    lo, hi = PUDDLE_THRESHOLD
    puddle = _math(nt, "SUBTRACT", noise.outputs["Fac"], lo)
    puddle = _math(nt, "MULTIPLY", puddle, 1.0 / (hi - lo))
    puddle.node.use_clamp = True
    dry = _math(nt, "SUBTRACT", 1.0, puddle)
    # albedo: wet concrete is darker and slightly cool; puddles darker still
    albedo = _math(nt, "MULTIPLY", col.outputs["Color"], tuple(c * WET_ALBEDO_SCALE for c in WET_ALBEDO_TINT),
                   vector=True)
    pud_mul = _math(nt, "MULTIPLY_ADD", puddle, PUDDLE_ALBEDO_SCALE - 1.0, 1.0)     # 1 dry .. scale in puddles
    albedo = _math(nt, "SCALE", albedo, vector=True)
    nt.links.new(pud_mul, albedo.node.inputs["Scale"])
    nt.links.new(albedo, bsdf.inputs["Base Color"])
    # roughness: damp concrete (texture * scale + offset) blended to near-mirror water in puddles
    damp = _math(nt, "MULTIPLY_ADD", rough.outputs["Color"], WET_ROUGH_SCALE, WET_ROUGH_OFFSET)
    rmix = nt.nodes.new("ShaderNodeMix")
    rmix.data_type = "FLOAT"
    nt.links.new(puddle, rmix.inputs[0])
    nt.links.new(damp, rmix.inputs[2])
    rmix.inputs[3].default_value = PUDDLE_ROUGHNESS
    nt.links.new(rmix.outputs[0], bsdf.inputs["Roughness"])
    nmap = nt.nodes.new("ShaderNodeNormalMap")
    nt.links.new(_math(nt, "MULTIPLY", dry, WET_NORMAL_STRENGTH), nmap.inputs["Strength"])   # flat water
    nt.links.new(nrm.outputs["Color"], nmap.inputs["Color"])
    nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    bsdf.inputs["Specular IOR Level"].default_value = WET_SPECULAR
    return mat


def setup_dusk_pad(scene=None, *, samples: int = DEFAULT_SAMPLES):
    """Low-sun sunset HDRI, a 4500 K sun lamp aligned to the HDRI sun, wet reflective concrete ground."""
    scene = scene or bpy.context.scene
    _reset(scene)
    col = _col(scene)
    rot = _dusk_rotation()
    sun_dir = dusk_sun_direction(rot)
    elev = math.degrees(math.asin(sun_dir.z))
    if not 3.0 <= elev <= 8.0:
        raise RuntimeError(f"dusk sun elevation {elev:.2f} deg is outside 3..8")
    scene.world = _world_dusk("mf_world_dusk", HDRI_DUSK, rot, sun_dir)
    _make_light(col, "mf_sun_dusk", "SUN", DUSK_SUN_STRENGTH, tuple(sun_dir),
                _saturate(blackbody_rgb(SUN_TEMPERATURE_K), DUSK_RIM_SATURATION), math.radians(DUSK_SUN_ANGLE_DEG))
    _floor(col, FLOOR_NAME, _wet_concrete())
    configure_cycles(scene, samples)
    scene.view_settings.exposure = DUSK_EXPOSURE
    _dusk_vignette(scene)
    return _make_camera(scene)


VIGNETTE_BLUR = "mf_vignette_blur"


def _size_vignette(scene):
    nt = scene.node_tree if scene.use_nodes else None
    blur = nt.nodes.get(VIGNETTE_BLUR) if nt is not None else None
    if blur is None:
        return
    r = scene.render
    px = max(1, round(DUSK_VIGNETTE_SOFT * max(r.resolution_x, r.resolution_y) * r.resolution_percentage / 100.0))
    blur.size_x = blur.size_y = px


@bpy.app.handlers.persistent
def _size_vignette_handler(scene, *_args):
    _size_vignette(scene)


def _dusk_vignette(scene):
    """Soft elliptical vignette into navy (scene-linear, before AgX), like the edges of frame 02."""
    scene.use_nodes = True
    nt = scene.node_tree
    nt.nodes.clear()
    rl = nt.nodes.new("CompositorNodeRLayers")
    comp = nt.nodes.new("CompositorNodeComposite")
    ell = nt.nodes.new("CompositorNodeEllipseMask")
    ell.mask_type = "MULTIPLY"                     # intersect with alpha (= 1): gives the mask the render size
    w, h = DUSK_VIGNETTE_SIZE
    try:
        ell.inputs["Size"].default_value = (w, h)
    except (KeyError, TypeError, ValueError):
        ell.mask_width, ell.mask_height = w, h
    nt.links.new(rl.outputs["Alpha"], ell.inputs["Mask"])
    blur = nt.nodes.new("CompositorNodeBlur")
    blur.name = VIGNETTE_BLUR
    blur.filter_type = "GAUSS"
    blur.use_relative = False                      # relative blur is ignored by the 4.5 compositor: pixel size
    _size_vignette(scene)                          # is set from the resolution here and again before each render
    if _size_vignette_handler not in bpy.app.handlers.render_pre:
        bpy.app.handlers.render_pre.append(_size_vignette_handler)
    nt.links.new(ell.outputs["Mask"], blur.inputs["Image"])
    inv = nt.nodes.new("CompositorNodeMath")
    inv.operation = "MULTIPLY_ADD"                 # (mask * -s) + s = (1 - mask) * s
    inv.inputs[1].default_value = -DUSK_VIGNETTE
    inv.inputs[2].default_value = DUSK_VIGNETTE
    nt.links.new(blur.outputs["Image"], inv.inputs[0])
    mix = nt.nodes.new("CompositorNodeMixRGB")
    mix.blend_type = "MIX"
    nt.links.new(inv.outputs[0], mix.inputs[0])
    nt.links.new(rl.outputs["Image"], mix.inputs[1])
    mix.inputs[2].default_value = (*DUSK_VIGNETTE_NAVY, 1.0)
    nt.links.new(mix.outputs[0], comp.inputs["Image"])


def setup(scene, name: str, *, samples: int = DEFAULT_SAMPLES):
    if name == "studio":
        return setup_studio_hdri(scene, samples=samples)
    if name == "dusk":
        return setup_dusk_pad(scene, samples=samples)
    raise ValueError(f"unknown look-dev {name!r}; use one of {LOOKDEVS}")
