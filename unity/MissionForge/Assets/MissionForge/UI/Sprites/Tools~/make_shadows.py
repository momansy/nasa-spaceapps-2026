"""Generates the 9-slice elevation shadow sprites e1-e4 (VISUAL_TARGET 3.1 elevation, game_value).
Each sprite is a soft shadow of a rounded rectangle with the rectangle itself cut out (alpha 0 inside), so it can be
drawn as a child over the surface without darkening it. Run: python make_shadows.py <out_dir>  (needs Pillow)."""
import sys
from PIL import Image, ImageDraw, ImageFilter

SPACE = (7, 21, 34)
# name: (blur_px, radius_px, y_offset_px, alpha) -- game_value
LEVELS = {
    "e1": (24, 16, 8, 0.40),
    "e2": (32, 24, 12, 0.48),
    "e3": (48, 24, 20, 0.60),
    "e4": (40, 16, 14, 0.52),
}

def make(blur, radius, dy, alpha, scale=2):
    pad = blur + dy  # room for blur + offset on every side (keeps slices symmetric)
    core = 2 * radius + 4
    size = 2 * pad + core
    s = scale
    mask = Image.new("L", (size * s, size * s), 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([pad * s, (pad + dy) * s, (pad + core) * s - 1, (pad + dy + core) * s - 1], radius * s, fill=int(255 * alpha))
    mask = mask.filter(ImageFilter.GaussianBlur(blur * s / 2.2))
    cut = Image.new("L", (size * s, size * s), 0)
    ImageDraw.Draw(cut).rounded_rectangle([pad * s, pad * s, (pad + core) * s - 1, (pad + core) * s - 1], radius * s, fill=255)
    from PIL import ImageChops
    mask = ImageChops.multiply(mask, ImageChops.invert(cut))
    img = Image.new("RGBA", (size * s, size * s), SPACE + (0,))
    img.putalpha(mask)
    return img.resize((size, size), Image.LANCZOS), pad, radius

if __name__ == "__main__":
    out = sys.argv[1]
    for name, (blur, radius, dy, alpha) in LEVELS.items():
        img, pad, r = make(blur, radius, dy, alpha)
        img.save(f"{out}/mf-shadow-{name}.png")
        print(name, img.size, "inset", pad, "slice", pad + r + 2)
