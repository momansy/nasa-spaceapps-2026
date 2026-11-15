"""Contact sheet of a landing sequence: 16 frames, one every 0.8 s of real time, 4 x 4, each labelled with its time.

Usage: python contact_sheet.py <frames-dir> <out.jpg>   (Pillow; reads <frames-dir>/timestamps.txt)
"""
import os
import sys

from PIL import Image, ImageDraw

STEP_S = 0.8        # real seconds between tiles
TILE = (480, 270)   # each tile, px


def main() -> None:
    src, out = sys.argv[1], sys.argv[2]
    rows = [line.split() for line in open(os.path.join(src, "timestamps.txt")) if line.strip()]
    stamps = [(idx, float(t)) for idx, t in rows]
    picks = []
    for k in range(16):
        target = k * STEP_S
        picks.append(min(stamps, key=lambda s: abs(s[1] - target)))
    sheet = Image.new("RGB", (TILE[0] * 4, TILE[1] * 4), (7, 21, 34))
    draw = ImageDraw.Draw(sheet)
    for i, (idx, t) in enumerate(picks):
        im = Image.open(os.path.join(src, f"frame_{idx}.jpg")).convert("RGB").resize(TILE)
        x, y = (i % 4) * TILE[0], (i // 4) * TILE[1]
        sheet.paste(im, (x, y))
        draw.rectangle([x + 6, y + 6, x + 78, y + 28], fill=(7, 21, 34))
        draw.text((x + 12, y + 10), f"t = {t:4.1f} s", fill=(232, 238, 240))
    sheet.save(out, quality=88)


if __name__ == "__main__":
    main()
