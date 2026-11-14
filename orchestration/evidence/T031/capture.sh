#!/bin/zsh
# T031 evidence capture. Usage: capture.sh <repo-root>
set -u
ROOT=$1
LOOK=$ROOT/unity/MissionForge/Logs/lookdev/MissionForge.app/Contents/MacOS/MissionForge
BAY=$(ls $ROOT/unity/MissionForge/Builds/BayEvidence/BayEvidence.app/Contents/MacOS/*)
SPEC=$(ls $ROOT/unity/MissionForge/Builds/Specimen/Specimen.app/Contents/MacOS/*)
E=$ROOT/orchestration/evidence/T031
L=/tmp/t031/r2/logs; mkdir -p $L $E/after $E/accessibility
W=(-screen-fullscreen 0 -screen-width 1920 -screen-height 1080 -window-mode windowed)
shot() { # name binary phase extra...
  local name=$1 bin=$2 phase=$3; shift 3
  "$bin" $W -mfShot $E/$name -mfPhase $phase -mfWait 6 "$@" -logFile $L/${name:t:r}.log >/dev/null 2>&1
  echo "$name exit=$?"
}
shot after/title-after-1920x1080.png $LOOK Title
shot after/lobby-after-1920x1080.png $LOOK Lobby -mfCreateRoom
for mode in HighContrast ReducedMotion; do
  shot accessibility/title-${mode:l}-1920x1080.png $LOOK Title -mf$mode
  shot accessibility/lobby-${mode:l}-1920x1080.png $LOOK Lobby -mfCreateRoom -mf$mode
done
shot accessibility/title-text200-rtl-1920x1080.png $LOOK Title -mfText200 -mfRtl
shot accessibility/lobby-text200-rtl-1920x1080.png $LOOK Lobby -mfCreateRoom -mfText200 -mfRtl
