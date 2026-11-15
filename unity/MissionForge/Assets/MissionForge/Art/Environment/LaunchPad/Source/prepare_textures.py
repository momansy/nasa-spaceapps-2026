"""T034: prepare the Build Bay ground texture sets (ambientCG, CC0) and the generated maps.

Usage: python3 prepare_textures.py <ambientcg-extract-dir> <out-dir>
  <ambientcg-extract-dir>/<Id>/<Id>_1K-JPG_{Color,NormalGL,Roughness,AmbientOcclusion}.jpg
Writes per set: <Id>_albedo.jpg (sRGB, q90), <Id>_normal.png (OpenGL +Y), <Id>_mask.png
(URP Lit metallic/smoothness + occlusion: R metallic 0, G ambient occlusion, B 0, A smoothness = 1 - roughness).
Generated (deterministic, seed 34): Ocean_normal.png (tileable swell + chop normal map, 512 px),
Soft_puff.png (radial falloff for steam particles, 128 px).
Requires Pillow and numpy.
"""
import os
import sys

import numpy as np
from PIL import Image

SETS = ["Concrete034", "Concrete031", "Gravel022", "Ground037", "Ground054"]


def prepare_set(src_root, out, set_id):
    base = os.path.join(src_root, set_id, set_id + "_1K-JPG_")
    Image.open(base + "Color.jpg").convert("RGB").save(os.path.join(out, set_id + "_albedo.jpg"), quality=90)
    Image.open(base + "NormalGL.jpg").convert("RGB").save(os.path.join(out, set_id + "_normal.png"), optimize=True)
    rough = np.asarray(Image.open(base + "Roughness.jpg").convert("L"), dtype=np.float32) / 255.0
    ao_path = base + "AmbientOcclusion.jpg"
    ao = np.asarray(Image.open(ao_path).convert("L"), dtype=np.float32) / 255.0 if os.path.exists(ao_path) else np.ones_like(rough)
    mask = np.zeros(rough.shape + (4,), dtype=np.uint8)
    mask[..., 1] = (ao * 255).astype(np.uint8)
    mask[..., 3] = ((1.0 - rough) * 255).astype(np.uint8)
    Image.fromarray(mask, "RGBA").save(os.path.join(out, set_id + "_mask.png"), optimize=True)


def ocean_normal(out, size=512, seed=34):
    rng = np.random.default_rng(seed)
    y, x = np.mgrid[0:size, 0:size].astype(np.float32) / size
    h = np.zeros((size, size), dtype=np.float32)
    # Integer wave numbers keep the map tileable; amplitude falls with frequency (swell, then chop).
    for _ in range(48):
        kx, ky = rng.integers(-14, 15, size=2)
        if kx == 0 and ky == 0:
            continue
        k = np.hypot(kx, ky)
        amp = 1.0 / (k ** 1.6)
        phase = rng.uniform(0, 2 * np.pi)
        h += amp * np.sin(2 * np.pi * (kx * x + ky * y) + phase)
    gy, gx = np.gradient(h)
    strength = 18.0
    n = np.stack([-gx * strength, -gy * strength, np.ones_like(h)], axis=-1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    img = ((n * 0.5 + 0.5) * 255).astype(np.uint8)
    Image.fromarray(img, "RGB").save(os.path.join(out, "Ocean_normal.png"), optimize=True)


def soft_puff(out, size=128):
    y, x = np.mgrid[0:size, 0:size].astype(np.float32)
    r = np.hypot(x - size / 2 + 0.5, y - size / 2 + 0.5) / (size / 2)
    a = np.clip(1.0 - r, 0, 1) ** 2.2
    img = np.zeros((size, size, 4), dtype=np.uint8)
    img[..., :3] = 255
    img[..., 3] = (a * 255).astype(np.uint8)
    Image.fromarray(img, "RGBA").save(os.path.join(out, "Soft_puff.png"), optimize=True)


def main():
    src_root, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    for set_id in SETS:
        prepare_set(src_root, out, set_id)
    ocean_normal(out)
    soft_puff(out)


if __name__ == "__main__":
    main()
