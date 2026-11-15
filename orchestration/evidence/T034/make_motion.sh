#!/bin/zsh
# T034 rework: encode a landing frame sequence (capture_bay.sh seq / seqrm) to an MP4 and a contact sheet.
# Usage: make_motion.sh <frames-dir> <out-basename>   e.g. make_motion.sh /tmp/cap/seq/10-landing-sequence motion/landing-normal-motion
# The frames carry real capture times (timestamps.txt, written by EvidenceShots.LandingSequence); each frame is shown
# for exactly its real duration and the clip is resampled to a constant 30 fps, so it plays at real speed.
# Needs ffmpeg (Homebrew) and Python with Pillow (contact_sheet.py next to this script).
set -eu
FRAMES=$1; OUT=$2
HERE=${0:A:h}
mkdir -p ${OUT:h}
LIST=$(mktemp -t t034concat)
${PYTHON:-python3} - "$FRAMES" "$LIST" <<'EOF'
import os, sys
frames, out = sys.argv[1], sys.argv[2]
rows = [line.split() for line in open(os.path.join(frames, "timestamps.txt")) if line.strip()]
times = [float(t) for _, t in rows]
with open(out, "w") as f:
    for k, (idx, _) in enumerate(rows):
        dur = (times[k + 1] - times[k]) if k + 1 < len(times) else 1 / 30
        f.write(f"file '{os.path.join(frames, 'frame_' + idx + '.jpg')}'\nduration {dur:.4f}\n")
    f.write(f"file '{os.path.join(frames, 'frame_' + rows[-1][0] + '.jpg')}'\n")
print(f"{len(rows)} frames over {times[-1]:.2f} s real time ({len(rows) / max(times[-1], 1e-3):.1f} fps captured)")
EOF
ffmpeg -y -loglevel error -f concat -safe 0 -i "$LIST" -vf "fps=30,scale=1280:720" -c:v libx264 -preset slow -crf 24 \
  -pix_fmt yuv420p -movflags +faststart "$OUT.mp4"
rm -f "$LIST"
${PYTHON:-python3} "$HERE/contact_sheet.py" "$FRAMES" "$OUT-contact.jpg"
echo "$OUT.mp4 $(du -h "$OUT.mp4" | cut -f1); $OUT-contact.jpg"
