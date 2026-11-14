"""Texture helpers shared by the library builders (run inside Blender: `blender -b --python ...`).

Everything works on float32 arrays (h, w, c) holding the *encoded* pixel values (no colour management),
so albedo stays sRGB-encoded and normal / ORM / mask data stays raw. Output goes through bpy images
because the Blender Python has numpy but no PIL.
"""
from __future__ import annotations

import os

import bpy
import numpy as np

RAW = "Non-Color"


def load(path: str) -> np.ndarray:
    img = bpy.data.images.load(path, check_existing=False)
    img.colorspace_settings.name = RAW
    w, h = img.size
    a = np.empty(w * h * img.channels, dtype=np.float32)
    img.pixels.foreach_get(a)
    bpy.data.images.remove(img)
    return a.reshape(h, w, -1)


def save(arr: np.ndarray, path: str, *, quality: int = 90) -> int:
    """Write an (h, w, 1|3|4) array; .jpg gets `quality`, .png is lossless. Returns the file size in bytes."""
    arr = np.clip(arr, 0.0, 1.0).astype(np.float32)
    if arr.shape[2] == 1:
        arr = np.repeat(arr, 3, axis=2)
    if arr.shape[2] == 3:
        arr = np.concatenate([arr, np.ones(arr.shape[:2] + (1,), np.float32)], axis=2)
    h, w = arr.shape[:2]
    img = bpy.data.images.new("_mf_tex", w, h, alpha=True, float_buffer=False)
    img.colorspace_settings.name = RAW
    img.pixels.foreach_set(arr.ravel())
    os.makedirs(os.path.dirname(path), exist_ok=True)
    is_jpg = path.lower().endswith((".jpg", ".jpeg"))
    img.file_format = "JPEG" if is_jpg else "PNG"
    img.filepath_raw = path
    if is_jpg:
        img.save(quality=quality)
    else:
        img.save()
    bpy.data.images.remove(img)
    return os.path.getsize(path)


def resize(a: np.ndarray, size: int) -> np.ndarray:
    """Box-filter down (or nearest up) to size x size."""
    h = a.shape[0]
    if h == size:
        return a
    if h > size:
        k = h // size
        return a.reshape(size, k, size, k, -1).mean(axis=(1, 3))
    k = size // h
    return np.repeat(np.repeat(a, k, axis=0), k, axis=1)


def luma(rgb: np.ndarray) -> np.ndarray:
    return (rgb[..., 0] * 0.2126 + rgb[..., 1] * 0.7152 + rgb[..., 2] * 0.0722).astype(np.float32)


def zscore(x: np.ndarray) -> np.ndarray:
    return ((x - x.mean()) / (x.std() + 1e-8)).astype(np.float32)


def fbm(n: int, seed: int, *, f_lo: float = 2.0, f_hi: float = 24.0, slope: float = 1.6) -> np.ndarray:
    """Tileable band-limited noise (zero mean, unit variance): random FFT phases shaped by 1/f^slope."""
    rng = np.random.default_rng(seed)
    fx = np.fft.fftfreq(n) * n
    r = np.hypot(*np.meshgrid(fx, fx))
    amp = np.where((r >= f_lo) & (r <= f_hi), 1.0 / np.maximum(r, 1.0) ** slope, 0.0)
    spec = amp * np.exp(1j * rng.uniform(0, 2 * np.pi, (n, n)))
    return zscore(np.real(np.fft.ifft2(spec)))


def normal_scaled(n_rgb: np.ndarray, k: float) -> np.ndarray:
    """Scale the slope of an OpenGL (+Y) tangent-space normal map by k and re-normalise."""
    v = n_rgb[..., :3] * 2.0 - 1.0
    v[..., 0:2] *= k
    v /= np.maximum(np.linalg.norm(v, axis=2, keepdims=True), 1e-6)
    return (v * 0.5 + 0.5).astype(np.float32)


def normal_from_height(h: np.ndarray, strength: float) -> np.ndarray:
    """Tileable OpenGL (+Y) normal map from a height field (strength in height units per pixel)."""
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5      # image row 0 is the bottom in Blender: +row = +v = +Y
    v = np.stack([-dx * strength, -dy * strength, np.ones_like(h)], axis=2)
    v /= np.linalg.norm(v, axis=2, keepdims=True)
    return (v * 0.5 + 0.5).astype(np.float32)


def orm(ao, rough, metal) -> np.ndarray:
    """Pack occlusion (R), roughness (G), metallic (B) - glTF / Unity convention, linear."""
    one = np.ones_like(rough)
    ao = one * ao if np.isscalar(ao) else ao
    metal = one * metal if np.isscalar(metal) else metal
    return np.stack([ao, rough, metal], axis=2).astype(np.float32)


def hex_to_srgb(h: str) -> tuple[float, float, float]:
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))


def worley(n: int, cells: int, seed: int, *, jitter: float = 0.9) -> np.ndarray:
    """Tileable Worley F1 distance (0..~1, in cell units) on an n x n grid with cells x cells feature points."""
    rng = np.random.default_rng(seed)
    pts = (np.stack(np.meshgrid(np.arange(cells), np.arange(cells), indexing="ij"), axis=-1).astype(np.float32)
           + 0.5 + (rng.random((cells, cells, 2)).astype(np.float32) - 0.5) * jitter)
    ys, xs = np.meshgrid((np.arange(n, dtype=np.float32) + 0.5) * cells / n,
                         (np.arange(n, dtype=np.float32) + 0.5) * cells / n, indexing="ij")
    best = np.full((n, n), 9.0, dtype=np.float32)
    ci, cj = np.floor(ys).astype(int), np.floor(xs).astype(int)
    for di in (-1, 0, 1):
        for dj in (-1, 0, 1):
            gi, gj = (ci + di) % cells, (cj + dj) % cells
            p = pts[gi, gj]
            px = p[..., 1] + (cj + dj - gj)
            py = p[..., 0] + (ci + di - gi)
            best = np.minimum(best, np.hypot(xs - px, ys - py))
    return best


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)
