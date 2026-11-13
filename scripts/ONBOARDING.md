# One-command teammate onboarding — NASA Space Apps Agent Mesh

**Only for trusted teammates invited to the private repository** `momansy/nasa-spaceapps-2026`.

## Windows 10/11: paste **one PowerShell command**

The command below installs **GitHub CLI only if missing**, asks the teammate to log in to **their own** GitHub account, retrieves the installation script **from this private repository using authenticated GitHub access**, then runs it. The script checks or installs Git, Python, and the chosen AI CLI, signs that CLI in, clones/updates the repo, creates coordination labels and **starts the agent**.

Choose **one** command. These are PowerShell commands, **not CMD commands**.

### Codex

```powershell
& { if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { winget install --id GitHub.cli --exact --source winget --accept-package-agreements --accept-source-agreements | Out-Host; $env:Path += ';' + [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User') + ';' + "$env:ProgramFiles\GitHub CLI" }; if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { throw 'GitHub CLI missing. Restart PowerShell and retry.' }; gh auth status *> $null; if ($LASTEXITCODE -ne 0) { gh auth login --hostname github.com --git-protocol https --web }; $b64 = gh api repos/momansy/nasa-spaceapps-2026/contents/scripts/join.ps1 --jq .content; if ($LASTEXITCODE -ne 0) { throw 'No access to the private repo: accept the GitHub invitation first.' }; $p = Join-Path $env:TEMP 'spaceapps-join.ps1'; [IO.File]::WriteAllBytes($p,[Convert]::FromBase64String(($b64 -join ''))); powershell -NoProfile -ExecutionPolicy Bypass -File $p -Provider codex }
```

### Claude Code

Same command, change **only the final** `-Provider codex` to `-Provider claude`.

**Logins are mandatory the first time**; the script cannot bypass the browser's authorization. It never asks for passwords in chat or stores tokens in the repository.

The agent automatically uses its own GitHub login as its ID (e.g. `sara`, `yousuf`), so team membership is dynamic. Different people should **not** share a GitHub login or an agent ID. If necessary, after initial repo clone, run the local command with `-AgentId anothername`.

### What the script does

1. Authenticates and confirms access to the private repository.
2. Detects/installs Git, Python 3.12 (when needed) and just **one** of Codex/Claude CLI via WinGet.
3. Completes the agent provider's personal account login, when needed.
4. Clones to `~/spaceapps/nasa-spaceapps-2026` or performs `git pull --ff-only` for an existing checkout. Never resets local edits.
5. Runs `python mesh.py bootstrap`, reports the roster, and starts a persistent `plan` worker.
6. The worker registers a heartbeat in GitHub Issues; teammates who are online automatically discover it.

By default it runs **planning-only** with no code changes, automatic PR merges or deployment. To opt in to code mode *later*, run the local `join.ps1` with `-Mode code` after configuring permissions, isolation and review. Code mode is not a permission/security sandbox.

## macOS, Linux or WSL

Install `gh`, Git, Python 3.10+ and the chosen provider CLI following their official instructions. After `gh auth login` and accepting the repository invitation, one command can retrieve the private script and run it:

```bash
f="$(mktemp)" && gh api repos/momansy/nasa-spaceapps-2026/contents/scripts/join.sh --jq .content | base64 -d > "$f" && bash "$f" codex
```

On macOS, if `base64 -d` is unavailable, use `base64 -D`. Substitute `claude` for `codex` to select Claude Code. The Unix script checks prerequisites rather than installing system packages because package managers and privileges vary.

## How to confirm two agents can see each other

On another terminal in either teammate's checked-out repo:

```powershell
$env:MESH_REPO = 'momansy/nasa-spaceapps-2026'
python mesh.py roster
python mesh.py send --to auto --subject 'Connectivity test' --message 'Reply with a short acknowledgement. No code changes.'
python mesh.py status
```

**Important:** Sending a task to one worker does not automatically test agent-to-agent replies; for that test, send a task that asks one agent to hand a specific message to another online agent. The 2-hop/3-hop limits in `mesh.py` apply.

To reroute queued auto-addressed tasks after a teammate disconnects, run **one** coordinator on a reliable host:

```powershell
$env:MESH_REPO = 'momansy/nasa-spaceapps-2026'
python mesh.py coordinator
```

### What isn't automatic yet

- A GitHub invitation must be accepted by each friend; AI-provider authentication must be completed by its owner.
- On Windows, some first-time WinGet installations require a restart of PowerShell before new executables are visible. Rerun the **same command** afterward.
- The worker stops if its terminal or computer stops. An always-on hosted worker is a separate deployment.
- This script does not install Unity, Higgsfield, Playwright MCP, or other expensive/optional development tooling. Add only what each role needs after deciding on the engine.
- The existing GitHub Issues queue is **not an exactly-once task queue**. Never run two workers with one ID, and keep automatic merges/deployments disabled.

## Security review

Read [`scripts/join.ps1`](join.ps1) before executing it; it is downloaded from the **private repository** you control. Onboarding scripts can install packages and access local authentication, so do not substitute untrusted URLs. For stricter integrity, pin retrieval to a reviewed commit SHA instead of `main` after the scripts are stable. Ask teammates to use separate personal accounts and limit GitHub repository permissions.