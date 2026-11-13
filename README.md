# Space Apps Agent Mesh — Dynamic Team Edition (v2)

## Quick teammate onboarding (one command)

Give each teammate access to this **private repository**, then send them [the Windows PowerShell one-command guide](scripts/ONBOARDING.md). The setup checks prerequisites, uses each person's own GitHub + Codex/Claude login, clones the repo, and starts a planning-only agent with a dynamic ID. No fixed team size and no shared tokens.

The coordinator is optional for basic agent messaging; run only one coordinator to reassign queued auto-routed tasks when agents go offline. See [ONBOARDING.md](scripts/ONBOARDING.md) for macOS/Linux, security limitations, and connectivity tests.

---


Connect an arbitrary number of Codex CLI and Claude Code CLI workers through GitHub Issues. **No list of team members is embedded in the program.** A project may have one, two, three, six, or more online agents; an agent can join or leave without changing code or rebooting another worker.

> **Verification:** 17 local unit/integration-style tests passed with a simulated GitHub API and a mock AI provider. Actual GitHub network calls, Codex CLI calls, Claude Code CLI calls, cloud hosting, and provider account credentials have **not** been tested in your repository.

## What changed from v1?

| v1 | v2 |
| --- | --- |
| Six hardcoded agent IDs | Any lower-case agent ID, created when a worker starts |
| Static recipients | GitHub presence Issues + live heartbeats |
| Agents route to prelisted team | Agents see only currently online peers |
| Tasks require named recipient | `--to auto` chooses an online agent with lowest queue load |
| No skill-based targeting | Optional capability tags (e.g. `frontend`, `simulation`, `testing`) |
| Offline handoffs risk an idle queue | Coordinator reassigns **queued, auto-routed** tasks after an agent goes offline |
| Static model output schema | Output schema adapts to the number of available teammates |

## Architecture

```text
GitHub repository
├── Issues labeled agentmesh,mesh:presence  <-- one presence record per agent
│     ├── ali     online, skills=[backend,simulation], heartbeat every 45s
│     └── sara    online, skills=[frontend,design], heartbeat every 45s
├── Issues labeled agentmesh,mesh:queued,to:ali   <-- agent inbox
├── Issues labeled agentmesh,mesh:queued,to:sara  <-- agent inbox
└── coordinator                            <-- optional separate persistent process
        ├── observes worker availability
        ├── reroutes QUEUED auto-routed tasks after offline changes
        └── BLOCKS stale running tasks for review; never double-executes them
```

Each worker checks the inbox, invokes Codex or Claude with a structured response, creates bounded handoff Issues, and sends a reply back to the original agent. In code mode, it proposes a PR; it does not auto-merge, deploy, or approve PRs.

The **number of human teammates is independent of the number of running agent instances**. One person can run an agent, or one person can run multiple separately identified workers if each has an isolated working copy. One agent ID must be operated by **one worker process** at a time; the GitHub label queue does not provide an atomic claim lock.

## Initial installation

Requirements: Python 3.10+, Git, GitHub CLI (`gh`), and a working locally authenticated `codex` or `claude` CLI installation. Use a **private repository** during development.

1. Place `mesh.py`, `AGENTS.md`, `CLAUDE.md`, and `.gitignore` at the root of the shared GitHub repository. Commit and push. Preserve your existing project files.
2. Grant collaborators appropriate repository permissions. Enable Issues.
3. Configure narrow GitHub authentication. Example (PowerShell):

```powershell
$env:MESH_REPO = "OWNER/REPOSITORY"
gh auth login
gh auth setup-git
python mesh.py bootstrap
```

4. Start **any number** of workers, each with a unique ID, on computers or hosted services that remain running:

```powershell
# Teammate 1 (Computer A)
python mesh.py worker --agent ali --name "Ali" --provider codex --capabilities simulation,backend --mode plan

# Teammate 2 (Computer B)
python mesh.py worker --agent sara --name "Sara" --provider claude --capabilities frontend,design --mode plan

# Optional teammate 3 (Computer C), launched later without changing configuration
python mesh.py worker --agent omar --provider codex --capabilities testing,qa --mode plan
```

If you run workers on separate computers, set `MESH_REPO` and authenticate `gh` on **each** computer.

5. Run **exactly one** coordinator process for automated queued-task reassignments (on an always-on machine or server):

```powershell
python mesh.py coordinator
```

The coordinator and agent workers must keep running to carry out real-time work. The coordinator does not itself invoke AI models.

## Basic commands

```bash
# Discover agents by live heartbeat, not by any static roster file
python mesh.py roster
python mesh.py status

# Automatically choose the least busy online agent
python mesh.py send --to auto --subject "Mission rules" --message "Plan the game mechanics and scoring"

# Choose an online agent with a certain skill
python mesh.py send --to auto --capability frontend --subject "Mission builder UI" --message "Design a responsive spacecraft editor"

# Give a particular ONLINE agent a task
python mesh.py send --to sara --subject "Battery UI" --message "Display power usage and remaining energy"

# Deliberately queue a named task for a currently OFFLINE agent
python mesh.py send --to sara --allow-offline --subject "Review" --message "Please review when you return"

# A quick smoke test (requires an online agent with ID 'ali')
python mesh.py send --to ali --subject "Ping" --message "Test message delivery"
python mesh.py status

# Run the coordinator only once for testing
python mesh.py coordinator --once

# Validate locally without using a model or GitHub
python -m unittest discover -s tests -v
```

## How two, three, or more participants work

**Two online agents:** `ali`, `sara`. Both can exchange task messages. Handoff JSON includes only `ali`, `sara` as applicable, and `auto` is available. A worker cannot hand a task to itself.

**Three online agents:** `omar` starts a worker. His presence record appears automatically, and the other two agents can send him work immediately on their next task. No manual roster edit is required.

**Back to two:** `omar` stops his worker. A clean shutdown marks him offline right away; if the machine loses power, he becomes offline after **180 seconds** without a successful heartbeat. New auto-routed work goes only to the two available agents. The coordinator reassigns queued **auto-routed** work away from the offline agent when a suitable online recipient exists.

**Only one online:** Tasks to that worker can still be processed, but no agent-to-agent handoffs are permitted. A request targeted to another offline worker is rejected unless `--allow-offline` was explicitly passed.

**Zero online:** `send --to auto` returns a clear error instead of creating an unserviceable task. Already queued tasks remain auditable in GitHub.

## Skills and automatic scheduling

An agent registers with a comma-separated skill list. This is a **routing hint**, not verification that the model is qualified.

- `--to auto`: select the online agent with fewest running + queued tasks (stable ID tie-breaker).
- `--to auto --capability frontend`: consider only online agents listing `frontend`.
- An agent-generated handoff can use `to=auto` and a `capability` tag; it will be assigned when posted.
- A named recipient who goes offline before a new **agent-generated** handoff is sent can be replaced with an online agent matching the requested capability.
- If no appropriate teammate exists, the handoff cannot be delivered and the task is marked `mesh:blocked` for review. We **do not silently assign specialized tasks to unrelated workers**.

## Limits, correctness and safety

- **Keep hosts on:** Without cloud hosting, offline laptops do not run agents. Heartbeats indicate a reachable worker, not proof that a model is currently making progress.
- **Single coordinator:** Run one coordinator per repository. Multiple coordinators and multiple workers sharing an agent ID can race, producing duplicate execution. GitHub Issues labels are not atomic locks and do not guarantee exactly-once processing.
- **No unreviewed merges:** In `--mode code`, workers edit a separate branch, commit, push, and request human PR review. Protected files, including `.github/`, `mesh.py`, `AGENTS.md`, `CLAUDE.md`, `.env*` and private keys, are denied by path checks. These checks are **not a security sandbox**.
- **Trust boundaries:** GitHub issue content and agent responses are untrusted inputs. Use private repositories, narrowly scoped tokens, protected main branch, separate VM/container workers, CI, and spending limits. Codex/Claude local CLI auth must already be configured.
- **No unchecked retry of running edits:** If an agent disappears during a running task, the coordinator eventually marks the task **blocked**, not silently rerunning possibly repeated code or API actions. Manually verify before `retry`.
- **Bounded conversations:** 2 handoffs max per task, 3 hops max, and messages limited to 5,000 characters, to reduce runaway costs and loops.
- **No test suite execution on generated PRs:** Add your own CI for build/tests before merging.
- **Migration from v1:** Existing `to:<name>` tasks remain visible. Existing tasks without `auto_route` metadata are not automatically reassigned. Use v2 on all running workers; stop v1 workers first. Existing fixed six-person role suggestions are not required.

This is a working **local simulation-backed prototype**, not a battle-tested multi-host service. Next steps for production-grade unattended operation are durable job claims (e.g. a transactional queue), cloud services for agents and coordinator, server-side audit/authorization, and robust monitoring/retry policies.

See [example team commands](examples/example-team-commands.md) for a compact two-to-three-to-two demo.