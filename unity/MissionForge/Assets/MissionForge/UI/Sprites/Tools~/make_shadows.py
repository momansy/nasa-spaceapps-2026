"""Generates the 9-slice elevation shadow sprites e1-e4 (VISUAL_TARGET 3.1 elevation, game_value).
Each sprite is a soft shadow of a rounded rectangle with the rectangle itself cut out (alpha 0 inside), so it can be
drawn as a child over the surface without darkening it. Run: python make_shadows.py <out_dir>  (needs Pillow)."""
import sys
from PIL import Image, ImageDraw, ImageFilter

# Shadow colour: Space darkened to near black. Space itself (7, 21, 34) is the page and scene background, so a Space
# shadow is invisible exactly where most surfaces sit; this keeps the navy hue but always reads darker than Space.
SHADOW = (1, 4, 9)
# name: (blur_px = tokens.json shadow_px, radius_px, y_offset_px, alpha) -- game_value. Each level reads deeper than the last:
# larger blur and offset, higher alpha. The radius matches the surface the level is used on (card 16, panel/modal 24,
# toast 16) so the cut-out fits the surface exactly.
LEVELS = {
    "e1": (24, 16, 4, 0.55),
    "e2": (32, 24, 10, 0.65),
    "e3": (48, 24, 22, 0.78),
    "e4": (40, 16, 16, 0.72),
}

def make(blur, radius, dy, alpha, scale=2):
    # Room for the whole Gaussian (3 sigma, sigma = blur / 2.2) plus the offset on every side, so the blur never
    # reaches the sprite edge (a shorter pad shows as a hard square halo); equal on all sides keeps slices symmetric.
    pad = int(round(blur * 3 / 2.2)) + dy
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
    img = Image.new("RGBA", (size * s, size * s), SHADOW + (0,))
    img.putalpha(mask)
    return img.resize((size, size), Image.LANCZOS), pad, radius

if __name__ == "__main__":
    out = sys.argv[1]
    for name, (blur, radius, dy, alpha) in LEVELS.items():
        img, pad, r = make(blur, radius, dy, alpha)
        img.save(f"{out}/mf-shadow-{name}.png")
        print(name, img.size, "inset", pad, "slice", pad + r + 2)
