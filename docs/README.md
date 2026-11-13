# MissionForge — Team HQ Website

The complete standalone, interactive onboarding website is in **[docs/index.html](index.html)**.

**Intended audience:** every human teammate and each teammate's local Codex or Claude Code agent, including people with no prior experience with NASA Space Apps, engineering simulations, GitHub, or MCP servers.

## What is included

- Beginner explanation of the **official Space Mission Design Game** challenge
- Proposed **MissionForge** educational Earth-observation CubeSat game (clearly labeled as an idea, not a NASA mandate)
- Interactive toy spacecraft trade-off example with mass, power, downlink and science metrics (illustrative figures, not NASA specifications)
- Dynamic team sizes, agent routing, heartbeats and one-process-per-agent safety model
- Base tools and optional GitHub / Playwright / Unity CLI / Higgsfield integrations
- Copyable instruction for an agent to actually perform its owner's setup
- Windows PowerShell + Unix setup command selector for Codex or Claude
- Readiness checklist with browser-local progress (not a real GitHub live-status feed)
- FAQ, troubleshooting, NASA resources and submission guidance

## Share it with invited teammates now

This repository is private. Invite friends on GitHub and tell them to:

1. Open [docs/index.html in this repository](https://github.com/momansy/nasa-spaceapps-2026/blob/main/docs/index.html).
2. Click **Raw / Download raw file** on GitHub to save index.html to their computer.
3. Open the saved HTML file in Chrome, Edge, Firefox, or Safari. It has **no external JS, fonts or build dependencies**.
4. Follow **Connect your coding agent** and paste the prompt into local Codex or Claude Code.

For agents that cannot display the HTML, use the machine-readable [START_HERE_AGENTS.md](../START_HERE_AGENTS.md) and [SHARE_WITH_TEAM.md](../SHARE_WITH_TEAM.md) Markdown files directly.

## Put it on the web

This page is build-free static HTML. The GitHub source file itself is **not a live hosted website**.

**Option A — Netlify Drop:** After downloading the site, place index.html in a folder named site, visit https://app.netlify.com/drop, and drag the folder to publish. This is a **manual owner-authorized publishing action**. Do not upload credentials or private files; the page only contains information intended for sharing.

**Option B — GitHub Pages:** If your plan and repository settings allow Pages for private source repositories, select **Deploy from a branch**, branch main, folder **/docs** under **Settings → Pages**. Pages on a private repository can still result in a publicly accessible website depending on plan/settings. Do not assume that a public Pages URL is access-controlled. Check eligibility and permissions before turning it on.

**Option C — Netlify Git integration:** A root-level netlify.toml points to docs/ as the publish directory. Connect this repository in Netlify only if you are comfortable granting the hosting provider access to its private source.

The public website contains no private credentials, but it includes a private repository URL; visitors need an invitation to use the onboarding backend.

## Security and deployment status

- Static website source: **committed**
- Public hosted URL: **not configured**
- Web page itself: **can be opened offline**
- Live GitHub worker connections: **not established by opening the site**
- One-command onboarding: see [scripts/ONBOARDING.md](../scripts/ONBOARDING.md); still needs personal browser/device authentication
- Optional paid MCPs: never installed automatically by this website

**Do not claim this is NASA's official portal.** It is a team-created guide linking to official NASA resources.
