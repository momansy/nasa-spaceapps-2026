#!/bin/zsh
# T034 Build Bay captures (T015/T031 seeds). Usage: capture_bay.sh <repo-root> <out-dir>
# Build the player first: Unity -batchmode -quit -buildTarget OSXUniversal
#   -executeMethod MissionForge.Screens.BuildBay.Editor.BuildBayBuilds.MacEvidence
set -u
ROOT=$1; OUT=$2
BAY=$(ls $ROOT/unity/MissionForge/Builds/BayEvidence/BayEvidence.app/Contents/MacOS/*)
L=$OUT/logs; mkdir -p $L
W=(-screen-fullscreen 0 -screen-width 1920 -screen-height 1080 -window-mode windowed)
run() { # name only extra...
  local name=$1 only=$2; shift 2
  rm -rf $OUT/$name
  "$BAY" $W -mfBayShots $OUT/$name -mfBayOnly $only "$@" -logFile $L/$name.log >/dev/null 2>&1
  echo "$name exit=$? -> $(ls $OUT/$name 2>/dev/null | tr '\n' ' ')"
}
run full 01-idle,02-beauty,05-compare,06-exploded,07-scale,09-complete -mfBayVotes 9
run vote 03-vote,04-assembly -mfBayVotes 4 -mfRehearsalPace 0.6
run early 01-idle,02-beauty -mfBayVotes 2
run mid 01-idle,02-beauty -mfBayVotes 5
run late 01-idle,02-beauty -mfBayVotes 7
run rm 01-idle -mfBayVotes 9 -mfReducedMotion
