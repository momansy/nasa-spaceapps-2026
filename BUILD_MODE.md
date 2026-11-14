# Build mode: switching your worker on for the game build

Plan mode lets a worker read and answer. **Build mode** lets it build: it can run shell
commands, use the MCP servers on your computer (Unity, Blender, Higgsfield), start
subagents, work for hours on one task, and open a pull request with the result.

You switch it on yourself, on your own computer. Nothing changes until you restart your
worker with the command below.

## What you are agreeing to

- Tasks written by the **orchestrator** (GitHub login `kingrma`) run on your computer
  without asking you first. Tasks from anyone else are refused and marked blocked.
- The agent can run shell commands and edit files in the repository checkout. By default
  it can only use the tools on an allowlist, plus the MCP servers you name with `--mcp`.
- It never merges, never deploys, and cannot commit changes to `mesh.py`,
  `mesh_supervisor.py`, `AGENTS.md`, `CLAUDE.md`, `.github/`, `.claude/` or credential files.
- If your checkout has uncommitted files when a task starts, they are parked in a
  `git stash` (not deleted). See them with `git stash list`.
- Usage counts against your own Claude or Codex plan. Paid MCP credits (Higgsfield) are
  spent only when a task states a budget; say so if you do not want any spent.
- Stop at any time with **Ctrl+C** in the worker window.

This is not a security sandbox. Run it only on a machine where you accept that.

## Switch on (one time)

Stop your current worker (Ctrl+C), then run this from the repository checkout.
Replace the values in capitals.

### Windows PowerShell

```powershell
cd "$HOME\spaceapps\nasa-spaceapps-2026"
git pull --ff-only
$agentId = (gh api user --jq .login).Trim().ToLowerInvariant()
python mesh_supervisor.py --agent $agentId --provider claude --mode build --orchestrator kingrma --model claude-opus-5-5 --effort high --capabilities CAPABILITIES --mcp MCP_SERVERS --path .
```

### macOS / Linux

```bash
cd "$HOME/spaceapps/nasa-spaceapps-2026"
git pull --ff-only
AGENT_ID="$(gh api user --jq .login | tr '[:upper:]' '[:lower:]')"
python3 mesh_supervisor.py --agent "$AGENT_ID" --provider claude --mode build --orchestrator kingrma --model claude-opus-5-5 --effort high --capabilities CAPABILITIES --mcp MCP_SERVERS --path .
```

### Values per teammate

| Worker | `--model` | `--capabilities` | `--mcp` |
|---|---|---|---|
| `yousuf-amek` | `claude-fable-5-2` | `unity,blender,art3d` | your Unity and Blender server names |
| `cyrex04` | `claude-sonnet-5-5` | `unity,blender,art3d` | your Unity and Blender server names |
| `ahmed-saeed-amek` | `claude-opus-5-5` | `coding,qa` | leave out |
| `mohammed-alainieh` | `claude-sonnet-5-5` | `coding,qa,media` | your Higgsfield server name |
| `momansy` (Codex) | leave out (`--provider codex`) | `media,higgsfield` | not used by Codex |

`--model` is the worker's default. The orchestrator can set the model for a single task
by putting `mesh-model: <model>` (and `mesh-effort: <level>`) on a line of the task.

- **MCP server names:** run `claude mcp list` and use the names it prints, separated by
  commas, with spaces replaced by `_` (for example `unity,blender` or `claude_ai_Higgsfield`).
  Leave `--mcp` out if you have none.
- **Every tool, no allowlist:** add `--skip-permissions` if you want the agent to use every
  tool and MCP server on your machine without naming them. This is your choice to make.
- **Codex:** use `--provider codex`. Build mode uses the `workspace-write` sandbox with
  network access. In that mode Codex refuses every MCP tool call (it cannot ask for
  approval when running unattended), so a Codex worker that must use an MCP server such as
  Higgsfield needs `--skip-permissions`, which runs Codex with approvals and sandbox off.
- Other flags: `--max-turns` (default 400), `--timeout` seconds per task (default 10800),
  `--progress-minutes` (default 10).

## Check it worked

```bash
python mesh.py --repo momansy/nasa-spaceapps-2026 status
```

Your line should read `mode=build` with your model. The orchestrator sends work only to
workers that show `mode=build`.

## What the worker does with a task

1. Fetches `origin`, creates the branch `agentmesh/<you>/issue-<n>` from the default branch.
2. Runs the agent with the task. A "still running" note is posted on the issue every
   10 minutes, and the agent posts its own progress notes.
3. Commits the changes, pushes the branch and opens a pull request. A blocked or failed
   task still publishes what it produced, as a draft pull request.
4. The orchestrator reviews, tests and merges.

If your worker restarts in the middle of a task, that task is marked blocked for the
orchestrator to retry. It is not run twice automatically.

## Changing a setting or restarting in the middle of a task

You can stop and restart your worker at any time, including while a task is running:

1. Ctrl+C in the worker window.
2. Update the worker program without touching your task files:
   `git fetch origin` then `git checkout origin/main -- mesh.py mesh_supervisor.py`
3. Run the same start command with the changed value (for example a different `--model`).
   Do not run `git pull` here: the checkout is on a task branch.

The interrupted task is marked blocked and the files it produced stay where they are.
When the orchestrator requeues it, the agent continues from those files. The same happens
when a run is cut off by a usage limit: the partial work is pushed as a draft pull request
and the retry continues from it.

Your Claude Code must be recent enough for the model you choose; run `claude update` if a
task fails with "does not support this model".
