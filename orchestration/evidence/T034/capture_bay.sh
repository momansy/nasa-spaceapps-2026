#!/bin/zsh
# T034 Build Bay captures (T015/T031 seeds). Usage: capture_bay.sh <repo-root> <out-dir> [set ...]
# Build the player first: Unity -batchmode -quit -buildTarget OSXUniversal
#   -executeMethod MissionForge.Screens.BuildBay.Editor.BuildBayBuilds.MacEvidence
# Sets: full vote early sat mid late rm seq seqrm (default: all). The seq sets record the next part landing as a
# 15 fps, 13 s frame sequence (EvidenceShots.LandingSequence); encode with make_motion.sh.
set -u
ROOT=$1; OUT=$2; shift 2
SETS=(${@:-full vote early sat mid late rm seq seqrm})
BAY=$(ls $ROOT/unity/MissionForge/Builds/BayEvidence/BayEvidence.app/Contents/MacOS/*)
L=$OUT/logs; mkdir -p $L
W=(-screen-fullscreen 0 -screen-width 1920 -screen-height 1080 -window-mode windowed)
run() { # name only extra...  (rework 2: retried up to twice if the window was resized and a shot is not 1920x1080)
  local name=$1 only=$2; shift 2
  local try
  for try in 1 2 3; do
    rm -rf $OUT/$name
    "$BAY" $W -mfBayShots $OUT/$name -mfBayOnly $only "$@" -logFile $L/$name.log >/dev/null 2>&1
    local code=$?
    if ! grep "Evidence shot" $L/$name.log | grep -qv "1920x1080"; then break; fi
    echo "$name: a shot was not 1920x1080 (window resized), retry $try"
  done
  echo "$name exit=$code -> $(ls $OUT/$name 2>/dev/null | tr '\n' ' ')"
}
for s in $SETS; do
  case $s in
    full)  run full 01-idle,02-beauty,05-compare,06-exploded,07-scale,09-complete -mfBayVotes 9 ;;
    vote)  run vote 03-vote,04-assembly -mfBayVotes 4 -mfRehearsalPace 0.6 ;;
    early) run early 01-idle,02-beauty -mfBayVotes 2 ;;
    sat)   run sat 01-idle,02-beauty -mfBayVotes 4 ;;
    mid)   run mid 01-idle,02-beauty -mfBayVotes 5 ;;
    late)  run late 01-idle,02-beauty -mfBayVotes 7 ;;
    rm)    run rm 01-idle -mfBayVotes 9 -mfReducedMotion ;;
    seq)   run seq 10-landing -mfBayVotes 4 -mfRehearsalPace 0.6 -mfBaySeqNoUi ;;
    seqrm) run seqrm 10-landing -mfBayVotes 4 -mfRehearsalPace 0.6 -mfBaySeqNoUi -mfReducedMotion ;;
  esac
done
