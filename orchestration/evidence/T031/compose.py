"""T031 evidence composites: side-by-side (capture left, reference frame right) and the 33 % downscale test.
Usage: python compose.py <evidence_dir> <frames_dir> <bay_dir>"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

W, H = 1920, 1080
NAVY = (7, 21, 34)


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


def downscale(src, out):
    small = Image.open(src).convert("RGB").resize((640, 360), Image.LANCZOS)
    canvas = Image.new("RGB", (W, H), NAVY)
    canvas.paste(small, ((W - 640) // 2, (H - 360) // 2))
    ImageDraw.Draw(canvas).text(((W - 640) // 2, (H - 360) // 2 - 50), "Build Bay at 33 % (640 x 360), shown 1:1", fill=(232, 238, 240), font=font(30))
    canvas.save(out)
    print("wrote", out)


if __name__ == "__main__":
    ev, frames, bay = (Path(a) for a in sys.argv[1:4])
    after = ev / "after"
    if (after / "title-after-1920x1080.png").exists():
        side_by_side(after / "title-after-1920x1080.png", frames / "01-title.png", ev / "title_vs_frame01.png", "MissionForge Title (Unity capture)", "Reference frame 01")
    if (after / "lobby-after-1920x1080.png").exists():
        side_by_side(after / "lobby-after-1920x1080.png", frames / "06-mission-control.png", ev / "lobby_vs_frame06.png", "MissionForge Lobby (Unity capture)", "Reference frame 06")
    idle = bay / "01-idle-bay-partial-vehicle.png"
    if idle.exists():
        side_by_side(after / "buildbay-after-1920x1080.png", frames / "02-build-bay.png", ev / "buildbay_vs_frame02.png", "MissionForge Build Bay (Unity capture)", "Reference frame 02")
        downscale(after / "buildbay-after-1920x1080.png", ev / "buildbay_downscale_33pct.png")
