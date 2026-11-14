"""Decal atlas mf_decals_01 (T032 step 7): 2048 x 2048 RGBA albedo, normal, ORM. No logos, flags or insignia.

Lettering is Saira Stencil One (SIL OFL 1.1, source/fonts/OFL.txt), rendered through a Blender text object into an alpha
mask. Tile layout (pixels, origin top-left of the sheet as seen in the file; library.json stores v from the bottom):

    256 px rows:  fluid_lox | fluid_rp1 / fluid_lh2 | fluid_ch4 / fluid_gn2 | no_step / stage_1 | stage_2 /
                  serial_s1 | serial_s2 / arm_plug | safe_plug / hazard_chevrons (full width) /
                  lift_point | cg_marker (256 x 256 each)
"""
from __future__ import annotations

import os

import bpy
import numpy as np

import registry as R
import texlib as T
from mat_nozzle import PROC

N = 2048
FONT = os.path.join(R.HERE, "fonts", "SairaStencilOne-Regular.ttf")
FONT_ASSET = dict(name="Saira Stencil One (Regular)", url="https://fonts.google.com/specimen/Saira+Stencil+One",
                  author="The Saira Stencil Project Authors (Omnibus-Type)", licence="SIL OFL 1.1",
                  date=R.DOWNLOAD_DATE)
TILE_H = 256
SIZE_M = {"text": [0.40, 0.10], "hazard": [0.80, 0.10], "symbol": [0.10, 0.10]}


def _hex(h):
    return np.array([int(h[i:i + 2], 16) / 255.0 for i in (1, 3, 5)], np.float32)


def render_text_alpha(text: str, w: int, h: int, pad: float = 0.12) -> np.ndarray:
    """White text centred in a w x h frame, returned as alpha (h, w)."""
    sc = bpy.data.scenes.new("_mf_text")
    sc.render.engine = "BLENDER_WORKBENCH"
    sc.display.shading.light = "FLAT"
    sc.display.shading.color_type = "SINGLE"
    sc.display.shading.single_color = (1, 1, 1)
    sc.view_settings.view_transform = "Standard"
    sc.render.film_transparent = True
    sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = w, h, 100
    sc.render.filter_size = 0.8
    cu = bpy.data.curves.new("_mf_text", "FONT")
    cu.font = bpy.data.fonts.load(FONT)
    cu.body, cu.align_x, cu.align_y, cu.size = text, "CENTER", "CENTER", 1.0
    ob = bpy.data.objects.new("_mf_text", cu)
    sc.collection.objects.link(ob)
    bpy.context.view_layer.update()
    width = max(ob.dimensions.x, 1e-3)
    height = max(ob.dimensions.y, 1e-3)
    k = min((1 - 2 * pad) * w / width, (1 - 2 * pad) * h / height)       # text size in pixels per unit
    cam = bpy.data.cameras.new("_mf_text")
    cam.type, cam.ortho_scale = "ORTHO", w / k
    co = bpy.data.objects.new("_mf_text", cam)
    co.location = (0, 0, 5)
    sc.collection.objects.link(co)
    sc.camera = co
    path = os.path.join(bpy.app.tempdir, "_mf_text.png")
    sc.render.filepath = path
    sc.render.image_settings.file_format, sc.render.image_settings.color_mode = "PNG", "RGBA"
    bpy.ops.render.render(write_still=True, scene=sc.name)
    a = np.flipud(T.load(path)[..., 3])          # images load bottom row first; tiles here are top-down
    bpy.data.scenes.remove(sc)
    return a


def _tile_text(text, w, h, fg, bg=None):
    a = render_text_alpha(text, w, h)
    rgb = np.zeros((h, w, 3), np.float32)
    rgb[:] = fg
    out_a = a.copy()
    if bg is not None:
        yy, xx = np.mgrid[0:h, 0:w]
        r = 0.12 * h
        dx = np.maximum(np.abs(xx - w / 2) - (w / 2 - r - 3), 0)
        dy = np.maximum(np.abs(yy - h / 2) - (h / 2 - r - 3), 0)
        box = (np.hypot(dx, dy) < r).astype(np.float32)
        rgb = rgb * a[..., None] + bg * (1 - a[..., None])
        rgb = np.where(box[..., None] > 0, rgb, 0)
        out_a = box
    return np.concatenate([rgb, out_a[..., None]], axis=2), [1.0, 1.0]


def _hazard(w, h):
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    stripe = (((xx + yy) / 48.0) % 1.0) < 0.5
    rgb = np.where(stripe[..., None], _hex("#F2C94C"), _hex("#1B1F24"))
    edge = np.minimum(yy, h - 1 - yy)
    a = (edge > 4).astype(np.float32)
    return np.concatenate([rgb, a[..., None]], axis=2)


def _lift_point(s):
    yy, xx = np.mgrid[0:s, 0:s].astype(np.float32) + 0.5
    d = np.hypot(xx - s / 2, yy - s / 2)
    ring = (d > 0.40 * s) & (d < 0.47 * s)
    hook_s = (np.abs(xx - s / 2) < 0.045 * s) & (yy > 0.22 * s) & (yy < 0.70 * s)
    hook_b = (np.hypot(xx - 0.60 * s, yy - 0.70 * s) > 0.10 * s) & (np.hypot(xx - 0.60 * s, yy - 0.70 * s) < 0.19 * s) \
        & (yy > 0.70 * s)
    eye = (np.hypot(xx - s / 2, yy - 0.27 * s) < 0.075 * s) & (np.hypot(xx - s / 2, yy - 0.27 * s) > 0.04 * s)
    a = (ring | hook_s | hook_b | eye).astype(np.float32)
    rgb = np.broadcast_to(_hex("#15324A"), (s, s, 3))
    return np.concatenate([rgb, a[..., None]], axis=2)


def _cg_marker(s):
    yy, xx = np.mgrid[0:s, 0:s].astype(np.float32) + 0.5
    d = np.hypot(xx - s / 2, yy - s / 2)
    quad = ((xx > s / 2) ^ (yy > s / 2))
    disc = d < 0.44 * s
    ring = (d > 0.40 * s) & (d < 0.47 * s)
    rgb = np.where(quad[..., None], _hex("#15324A"), _hex("#F4F7F8"))
    a = (disc | ring).astype(np.float32)
    return np.concatenate([np.where(ring[..., None], _hex("#15324A"), rgb), a[..., None]], axis=2)


def build_decals(lib, size=N):
    atlas = np.zeros((N, N, 4), np.float32)            # row 0 = TOP of the file; flipped when saved
    tiles = []

    def put(tid, x, y, tile, kind):
        h, w = tile.shape[:2]
        atlas[y:y + h, x:x + w] = tile
        tiles.append(dict(id=tid, rect=[round(x / N, 6), round(1 - (y + h) / N, 6), round((x + w) / N, 6),
                                        round(1 - y / N, 6)], size_m=SIZE_M[kind], px=[w, h]))

    dark, white = _hex("#10202E"), _hex("#F4F7F8")
    band = lambda hexc: _hex(hexc)
    text_tiles = [
        ("fluid_lox", "LOX", dark, band("#8EC3E6")), ("fluid_rp1", "RP-1", dark, band("#F0B94A")),
        ("fluid_lh2", "LH2", dark, band("#C9A3DE")), ("fluid_ch4", "CH4", dark, band("#5FBFB0")),
        ("fluid_gn2", "GN2", dark, band("#C9CED3")), ("no_step", "NO STEP", _hex("#B8322E"), None),
        ("stage_1", "STAGE 1", _hex("#15324A"), None), ("stage_2", "STAGE 2", _hex("#15324A"), None),
        ("serial_s1", "MF-S1-0427", _hex("#3A4652"), None), ("serial_s2", "MF-S2-0112", _hex("#3A4652"), None),
        ("arm_plug", "ARM", white, band("#C93C34")), ("safe_plug", "SAFE", white, band("#2F9A5B"))]
    for i, (tid, text, fg, bg) in enumerate(text_tiles):
        col, row = i % 2, i // 2
        tile, _ = _tile_text(text, 1024, TILE_H, fg, bg)
        put(tid, col * 1024, row * TILE_H, tile, "text")
    put("hazard_chevrons", 0, 6 * TILE_H, _hazard(N, TILE_H), "hazard")
    put("lift_point", 0, 7 * TILE_H, _lift_point(TILE_H), "symbol")
    put("cg_marker", TILE_H, 7 * TILE_H, _cg_marker(TILE_H), "symbol")

    a = atlas[..., 3]
    # stencil paint relief: height from the blurred alpha (thin raised film)
    k = 3
    blur = sum(np.roll(np.roll(a, i, 0), j, 1) for i in range(-k, k + 1) for j in range(-k, k + 1)) / (2 * k + 1) ** 2
    normal = T.normal_from_height(np.flipud(blur).astype(np.float32), 1.5)
    rgba = np.flipud(atlas)
    d = os.path.join(R.MATERIALS_DIR, "decals")
    a_p, n_p, o_p = (os.path.join(d, f"mf_decals_01_{k}") for k in ("albedo.png", "normal.png", "orm.jpg"))
    rough = np.full((N, N), 0.55, np.float32) + 0.04 * T.fbm(N, 81, f_lo=4, f_hi=80)
    sizes = [T.save(rgba, a_p), T.save(normal, n_p), T.save(T.orm(1.0, rough, 0.0), o_p)]
    lib["decals"] = {"textures": {"albedo": R.rel(a_p), "normal": R.rel(n_p), "orm": R.rel(o_p)}, "size_px": N,
                     "offset_m": 0.003, "tiles": tiles, "value_type": "game_value",
                     "source": [dict(name=FONT_ASSET["name"], url=FONT_ASSET["url"], licence=FONT_ASSET["licence"]),
                                dict(name=PROC["name"], url=PROC["url"], licence=PROC["licence"])],
                     "note": "RGBA albedo (alpha-clipped); rect = [u0, v0, u1, v1] with v from the bottom; "
                             "size_m = default printed size in metres [width, height]"}
    R.record_material(lib, "decal", albedo=a_p, normal=n_p, orm=o_p, tiling_m=1.0, tint="#FFFFFF",
                      metallic=(0.0, 0.0), roughness=(0.5, 0.6), normal_strength=0.5, hero=True,
                      sources=[PROC, FONT_ASSET])
    lib["materials"]["decal"].update(uv_mode="atlas", alpha="clip", alpha_cutoff=0.5)
    R.note_assets([FONT_ASSET], "decals/ (lettering), source/fonts/",
                  "Glyphs rendered to alpha masks; font file kept for rebuilding, OFL.txt alongside")
    R.note_assets([PROC], "decals/", "Generated: tile artwork (bands, hazard chevrons, lift point, CG marker)")
    return sizes
