# SHARE THIS WITH EVERY TEAMMATE'S CODEX OR CLAUDE CODE AGENT

## Automatic internet reconnect included

Workers started by the current onboarding scripts run under a local **auto-reconnect supervisor**. The worker can rejoin automatically when internet access returns, while its computer remains on and the supervisor stays running. See [AUTO_RECONNECT.md](AUTO_RECONNECT.md). If the human is upgrading from an older worker, instruct them to **stop the original worker before starting the supervisor**. A fresh device reboot still requires manually starting the supervisor or a separately authorized auto-start configuration.

---


> This is a **copy/paste operational prompt**, not a request to produce a new tutorial.  
> Open and use [START_HERE_AGENTS.md](START_HERE_AGENTS.md).  
> The repo is **private**. Each teammate must be personally invited and use their **own** GitHub account.

---

## COPY FROM HERE

You are my **local setup agent** for our NASA Space Apps 2026 team. I authorize you to perform routine software installation and non-destructive local configuration needed to connect **my own Codex or Claude Code agent** to our shared Agent Mesh. I want you to **actually perform the setup through the terminal/tools available to you**, not merely describe it.

Repository: https://github.com/momansy/nasa-spaceapps-2026  
Canonical onboarding runbook: https://github.com/momansy/nasa-spaceapps-2026/blob/main/START_HERE_AGENTS.md  
Existing one-command installation instructions: https://github.com/momansy/nasa-spaceapps-2026/blob/main/scripts/ONBOARDING.md

**Your assignment:**

1. Detect whether this computer runs Windows, macOS, Linux, or WSL. Detect whether I have Codex CLI or Claude Code CLI. Prefer whichever CLI you're running as my current agent; if both are installed, use my current provider. If neither can be determined, default to Codex CLI.
2. Read the canonical onboarding runbook. Because the repository is private, first check/install GitHub CLI using the official source and ask me to authenticate my **own GitHub account** with browser/device approval if necessary. Check private repository access using GitHub CLI. If I lack access, stop and ask me to accept the owner's repository invitation; **never ask for another teammate's password or token**.
3. Inspect the existing onboarding scripts before running them. Install or verify Git, Python >=3.10, GitHub CLI, and only the chosen provider CLI. Complete provider login with my browser authorization if needed. Do not paste secrets in messages or commit them anywhere.
4. Clone or safely fast-forward the repository into my home directory under spaceapps/nasa-spaceapps-2026. Preserve any existing local changes; do not force reset or overwrite files.
5. Execute the onboarding setup in **plan mode**. Do **not** enable autonomous code mode, pull-request merging, deployment, paid MCP services, Unity installation, or Higgsfield spending.
6. Start my agent-mesh worker in its **own persistent terminal/process**, not as a command that exits as soon as your setup session ends. My agent ID must be derived from my own GitHub username by default; do not assume a fixed six-person roster and do not start duplicate workers with the same ID.
7. Independently verify that the worker remains running and that GitHub's dynamic roster lists my ID as **online**. If another teammate is online, perform one safe no-code connectivity test and link to the GitHub Issue. If no peer is online, say this part is pending rather than inventing a successful test.
8. Fix ordinary non-destructive environment/configuration errors and recheck. Only ask me to intervene when there is a required approval, external login, private GitHub invitation, payment, elevated permission, or truly blocking choice.
9. Finish with a compact factual report: operating system, GitHub username, provider, installed/authenticated prerequisites, agent ID, worker process status, ONLINE/OFFLINE status, peer-message test result, remaining blockers, and the exact command to restart the worker later.

**Rules:** Do not begin creating the NASA game; this is setup only. Never bypass security approvals. Never publish a private repo or token. Never run unreviewed scripts from a stranger's URL. Never claim the system is connected until the live heartbeat was actually verified. If your current agent environment has no access to the local terminal, explain that limitation and give me the smallest specific action needed to continue—do not pretend you ran commands.

Begin now. Continue autonomously through all steps that your tools and my authorizations permit.

## END OF COPY

---

## Instructions for the team owner

1. Invite teammates to the private GitHub repository **before** asking their agents to set up (use GitHub's repository Settings -> Collaborators / Access). Each friend must accept the invitation while signed into their own account.
2. Share this prompt with **one or many teammates**. It works for a dynamic team; do not allocate six IDs in advance.
3. If their agent can run terminal commands, it can carry out routine steps on their computer, stopping only for personal authentication/approval.
4. A teammate is ready only when their worker is still running and shows **ONLINE** in the roster; 2-agent messaging is a separate test.
5. If a teammate wants to stop the agent, they can close its dedicated PowerShell window (or stop the service/process on Unix). Closing the laptop stops local workers.
6. Do not configure Unity or Higgsfield as a prerequisite to the basic mesh. Optional MCP profiles come later.

**Notes:** "One prompt" means one prompt to the teammate's *local coding agent*; it does **not** remove GitHub invitation and personal account authorization. If an agent only chats and cannot execute terminal commands, it cannot autonomously install software. The shared repo is the messaging hub, not a 24/7 worker host.
