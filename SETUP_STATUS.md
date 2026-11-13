# Deployment status

GitHub setup was initialized from ChatGPT on 2026-11-14.

## Installed
- Private repository `momansy/nasa-spaceapps-2026`
- `mesh.py`: dynamic roster, Codex/Claude CLI worker, GitHub Issues task routing and coordinator
- `tests/test_mesh.py`: 17 tests passed in a local simulation (not on GitHub runners)
- `README.md`, `AGENTS.md`, `CLAUDE.md`, `.gitignore`
- `examples/`: first task and variable-size team commands
- [Issue #1](https://github.com/momansy/nasa-spaceapps-2026/issues/1): deployment checklist

## Still required for live autonomous collaboration
- Run `python mesh.py bootstrap` on one authenticated machine to create the queue labels
- Install/authenticate `gh` and `codex` or `claude` on each worker host
- Launch at least one worker and exactly one coordinator
- Test live multi-host routing; no live Codex/Claude execution has been verified
- Configure always-on hosting if laptops may be powered off
- Add stronger job locking/permissions before production-level unattended use

**Security:** never put provider keys or GitHub tokens in this repository. Start in plan mode, leave PR merging and deployment to human review. GitHub Issues are not atomic task locks.
