#!/usr/bin/env bash
# Space Apps Agent Mesh — macOS/Linux/WSL onboarding.
# Usage: bash scripts/join.sh codex [agent-id] [capabilities]
set -euo pipefail
REPO="momansy/nasa-spaceapps-2026"
PROVIDER="${1:-codex}"
AGENT="${2:-}"
CAPABILITIES="${3:-}"
MODE="${MESH_MODE:-plan}"
DEST="${MESH_INSTALL_DIR:-$HOME/spaceapps}/nasa-spaceapps-2026"
case "$PROVIDER" in codex|claude) ;; *) echo 'Provider must be codex or claude' >&2; exit 2;; esac
case "$MODE" in plan|code) ;; *) echo 'MESH_MODE must be plan or code' >&2; exit 2;; esac
say() { printf '[SpaceApps] %s\n' "$*"; }
need() { command -v "$1" >/dev/null || { echo "Missing $1. Install it first and rerun." >&2; exit 1; }; }
need gh
if ! gh auth status >/dev/null 2>&1; then
    say 'Log into your own GitHub account.'
    gh auth login --hostname github.com --git-protocol https --web
fi
USER_LOGIN="$(gh api user --jq .login)"
gh api "repos/$REPO" --jq .full_name >/dev/null || {
    echo "GitHub @$USER_LOGIN cannot access private $REPO; accept your invitation." >&2; exit 1;
}
if [ -z "$AGENT" ]; then AGENT="$(printf '%s' "$USER_LOGIN" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9_-' '-' | cut -c 1-24)"; fi
if ! [[ "$AGENT" =~ ^[a-z][a-z0-9_-]{1,23}$ ]]; then echo 'Invalid agent ID' >&2; exit 2; fi
need git
if command -v python3 >/dev/null; then PYTHON=python3; elif command -v python >/dev/null; then PYTHON=python; else
    echo 'Python 3.10+ required. Install it and rerun.' >&2; exit 1
fi
"$PYTHON" -c 'import sys; assert sys.version_info >= (3,10), "Python 3.10+ required"'
need "$PROVIDER"
if [ "$PROVIDER" = codex ]; then
    if ! codex login status >/dev/null 2>&1; then codex login; fi
    codex login status >/dev/null
else
    if ! claude auth status >/dev/null 2>&1; then claude auth login; fi
    claude auth status >/dev/null
fi
gh auth setup-git
mkdir -p "$(dirname "$DEST")"
if [ ! -d "$DEST" ]; then
    say "Cloning $REPO to $DEST"
    gh repo clone "$REPO" "$DEST"
else
    [ -d "$DEST/.git" ] || { echo "Existing path is not a Git checkout: $DEST" >&2; exit 1; }
    origin="$(git -C "$DEST" remote get-url origin)"
    case "$origin" in *momansy/nasa-spaceapps-2026|*momansy/nasa-spaceapps-2026.git) ;; *) echo "Unexpected git remote: $origin" >&2; exit 1;; esac
    git -C "$DEST" pull --ff-only
fi
export MESH_REPO="$REPO"
cd "$DEST"
"$PYTHON" mesh.py bootstrap
"$PYTHON" mesh.py roster
if [ "${MESH_NO_START:-0}" = '1' ]; then say 'SETUP COMPLETE — no worker started'; exit 0; fi
say "READY — starting auto-reconnect supervisor for $AGENT ($PROVIDER), mode=$MODE."
say 'The worker will be restarted after internet outages; keep this terminal running.'
ARGS=(mesh_supervisor.py --repo "$REPO" --agent "$AGENT" --provider "$PROVIDER" --mode "$MODE" --path "$DEST")
if [ -n "$CAPABILITIES" ]; then ARGS+=(--capabilities "$CAPABILITIES"); fi
exec "$PYTHON" "${ARGS[@]}"