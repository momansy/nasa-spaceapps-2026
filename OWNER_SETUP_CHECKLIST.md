# Team owner checklist — NASA Space Apps Agent Mesh

**Owner:** https://github.com/momansy  
**Private repository:** https://github.com/momansy/nasa-spaceapps-2026  
**Teammate prompt:** [SHARE_WITH_TEAM.md](SHARE_WITH_TEAM.md)  
**Agent runbook:** [START_HERE_AGENTS.md](START_HERE_AGENTS.md)

This page is for the repository owner. Teammate agents should primarily follow the runbook above.

## A. Before sending the agent prompt

- [ ] Keep the repository **private** while onboarding.
- [ ] Enable GitHub **Issues** (the mesh uses Issues for presence and messages).
- [ ] Open repository **Settings -> Collaborators / Access** and invite each actual participant by **GitHub username**. Do not invent six accounts. One, two, three or more can join later.
- [ ] Teammates must accept invitations while signed in to their own personal GitHub accounts.
- [ ] Ensure each teammate has permissions sufficient to read and create Issues. Push access is needed later for code-mode PRs; it is not needed to plan and coordinate at first.
- [ ] Protect the default branch from unattended force-pushes/merges when protection is available.
- [ ] Do not post API keys, GitHub tokens, subscription credentials or private authentication files in Issues or README.
- [ ] Share only the direct [agent setup prompt](SHARE_WITH_TEAM.md), not passwords or copies of a teammate's personal auth state.

## B. What to send

Send the private repository link and tell each teammate to **copy the entire text in the “COPY FROM HERE” section** of [SHARE_WITH_TEAM.md](SHARE_WITH_TEAM.md) into **their local Codex or Claude Code agent** with terminal access.

The setup agent may need to ask its human for GitHub authentication, provider login, accepting the repo invitation, operating-system installation permission, or administrator elevation. These human steps cannot be safely bypassed.

## C. Readiness criteria

For each teammate, record:

| Field | Expected |
| --- | --- |
| Own GitHub login | A unique, invited account |
| Repository access | Verified |
| Provider CLI | Codex or Claude Code; signed in |
| Agent ID | Normally their lowercase GitHub login |
| Worker mode | plan |
| Process | Still running in persistent terminal/service |
| Mesh presence | ONLINE in live roster |
| Peer test | Pending until a second worker is online |

**Never confuse installation success with live connectivity.** A worker's presence is published through GitHub, but it becomes OFFLINE if its process stops or its heartbeat expires.

## D. Prove cross-agent messaging (after >=2 workers are ONLINE)

From the repo directory of an authenticated teammate:

~~~powershell
$env:MESH_REPO = 'momansy/nasa-spaceapps-2026'
python mesh.py roster
python mesh.py send --to PEER_AGENT_ID --subject 'Setup-only connectivity check' --message 'Acknowledge this issue. No code edits or game work.'
python mesh.py status
~~~

Replace PEER_AGENT_ID with a **real ONLINE ID** from roster. The send command prints the GitHub Issue URL.

- [ ] A worker picks up the queued task and posts its result.
- [ ] Status for the Issue changes to completed/done.
- [ ] Optionally test a bounded agent-to-agent handoff and reply back; verify **both** Issues rather than relying on a message that claims it worked.
- [ ] Record the Issue URLs as evidence, not private credentials.

If just one teammate is online, stop at the live heartbeat verification; do not force a fake multiplayer test.

## E. Coordinator and hosting

Basic message passing works without the coordinator. For automatic reassignment of **queued auto-routed** tasks after workers disappear, run **one** coordinator:

~~~bash
python mesh.py coordinator
~~~

Only one coordinator should run for this repository. Do not run one per teammate. Run it on an actual always-on host if you require timely reassignment. The worker and coordinator are **separate processes**; their machines must stay on. This initial system has no transactional exactly-once queue, centralized auth service or 24/7 managed hosting.

If someone disconnects while executing code, do not automatically retry that action. Inspect the existing Issue and source changes first.

## F. Optional tools — *not* required for onboarding

| Optional tool | Best owner | When to add |
| --- | --- | --- |
| Playwright MCP | QA/browser agent | After choosing the web development flow |
| Unity CLI MCP | 3D/Unity agent | Only if Unity is the chosen game engine |
| Higgsfield MCP | Design/media agent | Only after explicit cost/credit approval |
| GitHub MCP | GitHub-heavy agent | Optional; core mesh uses gh CLI already |
| Cloud worker hosting | Infrastructure owner | Only when local workers are proven |

Separate login/access for each optional service. Do not share one developer's subscription or personal session across teammates. Before assigning Higgsfield generation, verify available credits and how spending will be supervised.

## G. Restore/rejoin safely

If a teammate's computer restarts, rerun the previously reviewed [onboarding script](scripts/ONBOARDING.md). It checks already installed tools, uses the existing checkout and refuses destructive Git actions. The same GitHub login results in the same default ID.

If another worker is still running under that ID, stop the duplicate first. Never use a forced reset to “fix” setup problems.

## H. Readiness is not the NASA submission

This repository currently contains **agent coordination tooling**. Passing the setup test does not mean the NASA game, deployed demo, or final submission is complete. Keep event-specific development and submission compliance separate from onboarding. Follow the competition start-time and AI-disclosure rules when the event begins.

Owner's live status can be checked from an authenticated local checkout using:

~~~bash
python mesh.py roster
python mesh.py status
~~~
