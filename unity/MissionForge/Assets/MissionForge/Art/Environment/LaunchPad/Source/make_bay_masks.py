"""T034 rework: procedural helper textures for the Build Bay (no third-party content, deterministic from fixed seeds).

Usage: python make_bay_masks.py   (needs numpy and Pillow; writes into ../Textures/)

    Macro_variation_mask.png  512 x 512 tileable low-frequency brightness noise around linear 0.5, used as a URP Lit
                              detail albedo (x2 multiply) at a 150-180 m tile to break the ground repeat (rubric M2/M8).
    Frame_grade.png           512 x 256 navy (#071522) with an alpha ramp at the left and right edges and the top
                              corners: the camera-attached framing card that pulls the frame edges to navy (frame 02).
    Glint_streaks.png         256 x 512 sparkle streaks for the sun-glint path on the sea (additive).
    Horizon_band.png          16 x 256 vertical alpha band for the haze card that softens the sea-sky line.
All values are game_value art direction.
"""
from __future__ import annotations

import os

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "Textures"))


def smoothstep(e0: float, e1: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def tileable_noise(size: int, cutoff: float, seed: int) -> np.ndarray:
    """Band-limited noise by FFT filtering white noise: periodic, so it tiles seamlessly. Range normalised to -1..1."""
    rng = np.random.default_rng(seed)
    white = rng.standard_normal((size, size))
    f = np.fft.fftfreq(size)
    fx, fy = np.meshgrid(f, f)
    radius = np.sqrt(fx * fx + fy * fy)
    spectrum = np.fft.fft2(white) * np.exp(-(radius / cutoff) ** 2)
    n = np.real(np.fft.ifft2(spectrum))
    n -= n.mean()
    return n / np.abs(n).max()


def macro_variation() -> None:
    n = 0.65 * tileable_noise(512, 0.012, 7) + 0.35 * tileable_noise(512, 0.04, 11)
    n /= np.abs(n).max()
    v = 0.5 + 0.13 * n                                    # x2 multiply in URP -> 0.74 .. 1.26 brightness
    rgb = np.stack([v * 1.01, v, v * 0.98], axis=-1)      # a hint of warm/cool drift
    img = (np.clip(rgb, 0, 1) * 255 + 0.5).astype(np.uint8)
    Image.fromarray(img, "RGB").save(os.path.join(OUT, "Macro_variation_mask.png"))


def frame_grade() -> None:
    w, h = 512, 256
    u = (np.arange(w) + 0.5) / w
    v = 1.0 - (np.arange(h) + 0.5) / h                    # v = 1 at the top row
    uu, vv = np.meshgrid(u, v)
    edge = np.minimum(uu, 1.0 - uu)                       # 0 at the side edges, 0.5 at the centre
    side = smoothstep(0.30, 0.0, edge) ** 1.4             # side falloff over the outer 30 % of each half
    corner = smoothstep(0.42, 0.05, edge) * smoothstep(0.45, 1.0, vv)
    bottom = smoothstep(0.22, 0.0, vv) * 0.25             # a little weight at the very bottom
    alpha = np.clip(0.78 * side + 0.38 * corner + bottom * side, 0.0, 0.86)
    navy = np.array([7, 21, 34], dtype=np.float32)
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    rgba[..., :3] = navy
    rgba[..., 3] = (alpha * 255 + 0.5).astype(np.uint8)
    Image.fromarray(rgba, "RGBA").save(os.path.join(OUT, "Frame_grade.png"))


def glint_streaks() -> None:
    w, h = 256, 512                                       # u across the path, v along it (toward the sun)
    rng = np.random.default_rng(23)
    img = np.zeros((h, w), dtype=np.float32)
    for _ in range(1400):
        x = rng.normal(w / 2, w / 6)
        y = rng.uniform(0, h)
        length = rng.uniform(4, 22)
        bright = rng.uniform(0.3, 1.0)
        x0, x1 = int(max(0, x - length)), int(min(w, x + length))
        yi = int(y)
        if 0 <= yi < h and x1 > x0:
            xs = np.arange(x0, x1)
            img[yi, x0:x1] = np.maximum(img[yi, x0:x1], bright * (1 - np.abs(xs - x) / length))
    across = np.exp(-(((np.arange(w) + 0.5) / w - 0.5) / 0.22) ** 2)
    img *= across[None, :]
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    rgba[..., :3] = 255
    rgba[..., 3] = (np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8)
    Image.fromarray(rgba, "RGBA").save(os.path.join(OUT, "Glint_streaks.png"))


def horizon_band() -> None:
    h = 256
    v = (np.arange(h) + 0.5) / h                          # 0 top row .. 1 bottom row
    up = 1.0 - v                                          # 0 bottom .. 1 top
    a = smoothstep(0.0, 0.18, up) * smoothstep(1.0, 0.22, up) ** 1.5
    rgba = np.zeros((h, 16, 4), dtype=np.uint8)
    rgba[..., :3] = 255
    rgba[..., 3] = (np.clip(a, 0, 1)[:, None] * 255 + 0.5).astype(np.uint8)
    Image.fromarray(rgba, "RGBA").save(os.path.join(OUT, "Horizon_band.png"))


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    macro_variation()
    frame_grade()
    glint_streaks()
    horizon_band()
    print("wrote", OUT)


if __name__ == "__main__":
    main()
