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