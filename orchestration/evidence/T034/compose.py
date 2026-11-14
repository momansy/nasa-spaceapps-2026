"""T034 evidence composites. Usage: python compose.py <evidence_dir> <before_dir> <after_dir> <frame02_png>
Copies the 1920x1080 captures into before/ and after/ (PNG) and writes side-by-side composites
(left labelled, right labelled, each 936 x 526 on a 1920 x 1080 navy canvas, as in T031)."""
import shutil
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H = 1920, 1080
NAVY = (7, 21, 34)
SHOTS = {  # evidence name: capture path relative to a capture dir
    "idle-ui": "full/01-idle-bay-partial-vehicle.png",
    "beauty-no-ui": "full/02-beauty-no-ui.png",
    "complete-vehicle-beauty": "full/09-complete-vehicle-beauty.png",
    "compare": "full/05-compare.png",
    "exploded": "full/06-exploded.png",
    "scale-reference": "full/07-scale-reference.png",
    "vote-in-progress": "vote/03-vote-in-progress-ghost-tallies.png",
    "assembly-crane-sparks": "vote/04-assembly-crane-sparks.png",
    "stage1-early-ui": "early/01-idle-bay-partial-vehicle.png",
    "stage1-early-no-ui": "early/02-beauty-no-ui.png",
    "stage2-mid-ui": "mid/01-idle-bay-partial-vehicle.png",
    "stage2-mid-no-ui": "mid/02-beauty-no-ui.png",
    "stage3-late-ui": "late/01-idle-bay-partial-vehicle.png",
    "stage3-late-no-ui": "late/02-beauty-no-ui.png",
    "reduced-motion-ui": "rm/01-idle-bay-partial-vehicle.png",
}


def font(size):
    for p in ("/System/Library/Fonts/SFNS.ttf", "/System/Library/Fonts/Helvetica.ttc"):
        try:
            return ImageFont.truetype(p, size)
        except OSError:
            pass
    return ImageFont.load_default()


def side_by_side(left, right, out, left_label, right_label):
    canvas = Image.new("RGB", (W, H), NAVY)
    half = (W // 2 - 24, int((W // 2 - 24) * 9 / 16))
    y = (H - half[1]) // 2
    for i, (path, label) in enumerate(((left, left_label), (right, right_label))):
        im = Image.open(path).convert("RGB").resize(half, Image.LANCZOS)
        x = 12 + i * (W // 2)
        canvas.paste(im, (x, y))
        ImageDraw.Draw(canvas).text((x, y - 48), label, fill=(232, 238, 240), font=font(30))
    canvas.save(out)
    print("wrote", out)


def main():
    ev, before, after, frame = (Path(a) for a in sys.argv[1:5])
    for sub, src in (("before", before), ("after", after)):
        (ev / sub).mkdir(parents=True, exist_ok=True)
        for name, rel in SHOTS.items():
            if (src / rel).exists():
                shutil.copyfile(src / rel, ev / sub / f"{name}-1920x1080.png")
    pairs = ev / "pairs"
    pairs.mkdir(exist_ok=True)
    for name in ("idle-ui", "beauty-no-ui", "complete-vehicle-beauty", "assembly-crane-sparks", "compare", "exploded", "scale-reference"):
        side_by_side(ev / "before" / f"{name}-1920x1080.png", ev / "after" / f"{name}-1920x1080.png",
                     pairs / f"{name}-before-after.png", "Before (main, T031 state)", "After (T034)")
    side_by_side(ev / "after" / "complete-vehicle-beauty-1920x1080.png", frame, ev / "complete-beauty-vs-frame02.png",
                 "MissionForge Build Bay, T034 (Unity capture)", "Reference frame 02")
    side_by_side(ev / "after" / "idle-ui-1920x1080.png", frame, ev / "buildbay-ui-vs-frame02.png",
                 "Build Bay with UI, T034 (Unity capture)", "Reference frame 02")
    # Three assembly stages with the UI on, in one strip (each 624 x 351).
    strip = Image.new("RGB", (W, H), NAVY)
    d = ImageDraw.Draw(strip)
    for i, (name, label) in enumerate((("stage1-early-ui", "Vote 3 of 22: pad before the stack"),
                                       ("stage2-mid-ui", "Vote 6 of 22: payload on the pad"),
                                       ("stage3-late-ui", "Vote 8 of 22: stack growing"))):
        im = Image.open(ev / "after" / f"{name}-1920x1080.png").convert("RGB").resize((624, 351), Image.LANCZOS)
        x = 12 + i * 636
        strip.paste(im, (x, 380))
        d.text((x, 330), label, fill=(232, 238, 240), font=font(24))
    strip.save(ev / "assembly-stages-ui.png")
    print("wrote", ev / "assembly-stages-ui.png")
    # Keep the repository light: the single captures are stored as JPEG q90 (composites stay PNG).
    for sub in ("before", "after"):
        for png in (ev / sub).glob("*.png"):
            Image.open(png).convert("RGB").save(png.with_suffix(".jpg"), quality=90)
            png.unlink()


if __name__ == "__main__":
    main()
