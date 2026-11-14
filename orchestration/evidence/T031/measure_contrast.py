"""Measure WCAG contrast of the T031 text styles over the backgrounds actually rendered in the captures.

Usage: python measure_contrast.py <regions.json> <out.md>

regions.json: [{"surface": "...", "capture": "<png path>", "box": [x0, y0, x1, y1], "tile": 24}, ...] in 1920x1080
pixels ("tile" is optional). Boxes over whole panels are conservative: their brightest tiles can be UI fills (bars, chips)
rather than text backgrounds. Narrow boxes in a panel's padding strip measure the glass itself.
For each region the capture is cut into 24 x 24 px tiles; the per-channel median of a tile estimates the background
under any text in it (text covers well under half of a tile). The worst background is the 90th-percentile brightest
tile (the very brightest tiles are usually solid UI fills such as a Ceramic pill, not text backgrounds).
Every foreground style is then scored against that colour. Thresholds: VISUAL_TARGET 3.2.
"""
import json
import statistics
import sys

from PIL import Image

TILE = 24
PERCENTILE = 0.90

STYLES = [
    ("Ceramic body and labels", "#E8EEF0", 4.5),
    ("Muted secondary text", "#B6C7D3", 4.5),
    ("Signal ghost delta (24 px bold)", "#55C5CD", 3.0),
    ("Meets word (24 px bold)", "#77D6A1", 3.0),
    ("Marginal word (24 px bold)", "#FFD166", 3.0),
    ("Fails word (24 px bold)", "#FF8F8F", 3.0),
]


def hex_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def lin(c):
    c = c / 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def lum(rgb):
    r, g, b = (lin(x) for x in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def ratio(a, b):
    la, lb = lum(a), lum(b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)


def worst_background(img, box, tile=TILE):
    x0, y0, x1, y1 = box
    tiles = []
    for ty in range(y0, y1 - tile + 1, tile):
        for tx in range(x0, x1 - tile + 1, tile):
            px = list(img.crop((tx, ty, tx + tile, ty + tile)).get_flattened_data())
            med = tuple(int(statistics.median(p[i] for p in px)) for i in range(3))
            tiles.append(med)
    tiles.sort(key=lum)
    return tiles[min(len(tiles) - 1, int(len(tiles) * PERCENTILE))]


def main():
    regions = json.load(open(sys.argv[1]))
    cache = {}
    rows = []
    for r in regions:
        img = cache.setdefault(r["capture"], Image.open(r["capture"]).convert("RGB"))
        rows.append((r, worst_background(img, r["box"], r.get("tile", TILE))))

    out = ["| Surface (capture, box) | Worst bg | " + " | ".join(f"{n} (needs {t}:1)" for n, _, t in STYLES) + " |",
           "|---|---|" + "---|" * len(STYLES)]
    failures = 0
    for r, bg in rows:
        cells = []
        for _, fg, need in STYLES:
            c = ratio(hex_rgb(fg), bg)
            ok = c >= need
            failures += 0 if ok else 1
            cells.append(f"{c:.1f}:1 {'pass' if ok else '**FAIL**'}")
        name = r["capture"].split("/")[-1]
        out.append(f"| {r['surface']} (`{name}` {r['box']}) | #{bg[0]:02X}{bg[1]:02X}{bg[2]:02X} | " + " | ".join(cells) + " |")
    out.append("")
    out.append(f"Failing cells: {failures}.")
    open(sys.argv[2], "w").write("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
