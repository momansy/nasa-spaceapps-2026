"""Colour atlas for the hero launch-pad pieces (T034 rework 2, rubric M9 draw calls and M2 materials).

Every painted or metal surface of a hero piece shares ONE Unity material (LP_hero_atlas, URP Lit) instead of one
material slot per paint: each face's UVs point at the centre of a 16 px swatch in three small textures written here:

    Textures/Hero_atlas_albedo.png    sRGB base colour
    Textures/Hero_atlas_mask.png      linear: R metallic, G occlusion (1), B 0, A smoothness (URP Lit metallic map)
    Textures/Hero_atlas_emission.png  sRGB emission, multiplied in Unity by EMISSION_INTENSITY (HDR)

A hero piece then draws with two submeshes (atlas + box-UV concrete) instead of up to eleven. Pure Python (zlib PNG
writer) so it runs inside Blender with no extra packages. All colours and surface values are game_value art direction
(frame 02 palette), not measured paint data.
"""
from __future__ import annotations

import os
import struct
import zlib

CELL = 16          # px per swatch
COLS = 4           # 4 x 4 swatches -> 64 x 64 px textures
EMISSION_INTENSITY = 8.0   # Unity _EmissionColor multiplier (HDR, linear); the lamp swatch is 1.0 of this

# name: (base sRGB hex, metallic, smoothness, emission strength as a fraction of EMISSION_INTENSITY, emission hex)
PALETTE: dict[str, tuple[str, float, float, float, str]] = {
    "hero_white": ("#C9D0D2", 0.50, 0.62, 0.0, "#000000"),    # structural steel, light paint: a sun rim on the bevels
    "hero_teal": ("#2B7D85", 0.45, 0.62, 0.0, "#000000"),     # braces, legs, fascia (frame 02 teal)
    "hero_clad": ("#3A8890", 0.25, 0.50, 0.0, "#000000"),     # cladding panels
    "hero_core": ("#9C8358", 0.45, 0.30, 0.0, "#000000"),     # cryo-line foil: matte crinkled, no longer reads emissive
    "hero_rail": ("#E2AD36", 0.10, 0.50, 0.0, "#000000"),     # safety-yellow railings, hook block
    "hero_pipe": ("#AAB1B5", 0.90, 0.70, 0.0, "#000000"),     # bare steel pipe, flanges, sheave
    "hero_dark": ("#283037", 0.50, 0.45, 0.0, "#000000"),     # machinery, doors, hook
    "grating": ("#1C2833", 0.30, 0.32, 0.0, "#000000"),       # deck grating
    "lamp": ("#FFE9C8", 0.00, 0.60, 1.0, "#FFE9C8"),          # practical lamp lens (8x HDR)
    "warning_red": ("#E0332B", 0.00, 0.50, 0.375, "#E0332B"), # aviation light (3x HDR)
    "glow_warm": ("#3A2A1E", 0.00, 0.40, 0.45, "#FF8A3A"),    # lit exhaust-pit strips (3.6x HDR amber)
    "window": ("#2A3036", 0.20, 0.80, 0.15, "#FFD59A"),       # lit window bands on the far hall (1.2x HDR)
    "hose": ("#1E2226", 0.05, 0.35, 0.0, "#000000"),          # umbilical hoses (black rubber)
    "panel_seam": ("#8E979B", 0.50, 0.55, 0.0, "#000000"),    # darker steel for seams, trims and kerbs
    "soot": ("#5A4C42", 0.20, 0.30, 0.0, "#000000"),          # heat-stained steel at the flame opening (not crushed)
}
NAMES = list(PALETTE)
assert len(NAMES) <= COLS * COLS


def uv_of(name: str) -> tuple[float, float]:
    """UV of the swatch centre (Blender UV origin is bottom-left; PNG rows are written top-down)."""
    i = NAMES.index(name)
    col, row = i % COLS, i // COLS
    size = COLS * CELL
    return ((col * CELL + CELL / 2) / size, 1.0 - (row * CELL + CELL / 2) / size)


def _hex(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def _srgb_to_linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _linear_to_srgb(c: float) -> float:
    return c * 12.92 if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055


def _png(path: str, pixels: list[list[tuple[int, int, int, int]]]) -> None:
    h, w = len(pixels), len(pixels[0])
    raw = b"".join(b"\x00" + bytes(v for px in row for v in px) for row in pixels)
    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n")
        f.write(chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)))
        f.write(chunk(b"IDAT", zlib.compress(raw, 9)))
        f.write(chunk(b"IEND", b""))


def _texture(fn) -> list[list[tuple[int, int, int, int]]]:
    size = COLS * CELL
    rows = []
    for y in range(size):
        row = []
        for x in range(size):
            i = (y // CELL) * COLS + x // CELL
            row.append(fn(NAMES[i]) if i < len(NAMES) else (0, 0, 0, 255))
        rows.append(row)
    return rows


def _emission(name: str) -> tuple[int, int, int, int]:
    _, _, _, strength, hexcol = PALETTE[name]
    rgb = [_linear_to_srgb(min(1.0, _srgb_to_linear(c / 255.0) * strength)) for c in _hex(hexcol)]
    return (*[int(round(v * 255)) for v in rgb], 255)


def write_textures(out_dir: str) -> list[str]:
    os.makedirs(out_dir, exist_ok=True)
    paths = []
    for suffix, fn in (
        ("albedo", lambda n: (*_hex(PALETTE[n][0]), 255)),
        ("mask", lambda n: (int(round(PALETTE[n][1] * 255)), 255, 0, int(round(PALETTE[n][2] * 255)))),
        ("emission", _emission),
    ):
        p = os.path.join(out_dir, "Hero_atlas_" + suffix + ".png")
        _png(p, _texture(fn))
        paths.append(p)
    return paths


if __name__ == "__main__":
    import sys
    print(write_textures(sys.argv[1] if len(sys.argv) > 1 else "."))
