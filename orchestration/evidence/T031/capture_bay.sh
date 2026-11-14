#!/bin/zsh
# T031 Build Bay evidence, same seeds as T015 (README in orchestration/evidence/T015). Usage: capture_bay.sh <repo-root>
set -u
ROOT=$1
BAY=$(ls $ROOT/unity/MissionForge/Builds/BayEvidence/BayEvidence.app/Contents/MacOS/*)
L=/tmp/t031/r2/logs; mkdir -p $L
W=(-screen-fullscreen 0 -screen-width 1920 -screen-height 1080 -window-mode windowed)
run() { # outdir only extra...
  local out=$1 only=$2; shift 2
  rm -rf $out
  "$BAY" $W -mfBayShots $out -mfBayOnly $only "$@" -logFile $L/${out:t}.log >/dev/null 2>&1
  echo "${out:t} exit=$? -> $(ls $out 2>/dev/null | tr '\n' ' ')"
}
B=/tmp/t031/r2/bb
run $B-idle 01-idle,02-beauty,09-complete -mfBayVotes 9
run $B-vote 03-vote,04-assembly -mfBayVotes 4 -mfRehearsalPace 0.6
run $B-hc 01-idle -mfBayVotes 9 -mfHighContrast
run $B-rm 01-idle -mfBayVotes 9 -mfReducedMotion
run $B-t200rtl 01-idle -mfBayVotes 9 -mfText200 -mfRtl
