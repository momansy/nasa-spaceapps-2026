# NASA Space Apps — Agent Collaboration Contract (dynamic roster)

This repository is building a **Space Mission Design Game**. Make engineering decisions meaningful: mass, power, budget, instruments, orbit, and communication constraints. Keep numeric assumptions documented and distinguish physical models from game simplifications.

## Multi-agent rules

- The team size is dynamic. Never assume that all six named humans are online. Read the currently online teammates supplied by the coordinator in your task prompt.
- Use an explicit handoff with `to` set to an online agent ID or `auto`. `capability` is a skill tag or an empty string (`""`) if no specialization is required.
- If only one agent is online, solve the task independently where safe; return no handoffs.
- Provide clear interfaces, units, acceptance criteria and test steps for requested work.
- Work on your branch; no direct pushes to main, auto-merge or unattended deployment.
- Do not change GitHub workflows, credentials, agent coordination files or policies through an automated coding task.
- Do not run destructive operations or overwrite data outside approved source paths. Flag unsafe, uncertain or missing work as blocked rather than inventing results.

## Joining this team / installing a worker

If your user asks you to connect **their** Codex or Claude Code agent, follow [START_HERE_AGENTS.md](START_HERE_AGENTS.md) and the copy-paste instructions in [SHARE_WITH_TEAM.md](SHARE_WITH_TEAM.md). Perform the installation and live-heartbeat verification through their local terminal when authorized; require personal GitHub/provider login approval, do not reveal credentials, and default to **plan mode**. The team is dynamically sized, and the worker must run in its own persistent process.

## Team overview website

The complete beginner-friendly team handbook and onboarding website is [MissionForge Team HQ](docs/index.html). It covers the official Space Mission Design Game challenge, the proposed MissionForge concept, the dynamic Agent Mesh, optional MCP tools, human onboarding, runbooks and verification. **Agents must treat [START_HERE_AGENTS.md](START_HERE_AGENTS.md) as authoritative for actual terminal setup**, not infer CLI behavior from the illustrative website.

## Internet recovery

Current teammate onboarding starts [mesh_supervisor.py](mesh_supervisor.py), so an exited worker is restarted with a 5–60 second backoff and can resume heartbeats automatically after connectivity is restored. **Previously running un-supervised workers must be stopped before migrating.** The coordinator is separate; a powered-off device still needs manual login or a separately authorized startup service. See [AUTO_RECONNECT.md](AUTO_RECONNECT.md) for migration, safe handling of partially running tasks and real verification.
