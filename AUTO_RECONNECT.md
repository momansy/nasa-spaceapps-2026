# Automatic reconnection when internet returns

The teammate's one-command onboarding now starts mesh_supervisor.py, not mesh.py directly.

## How it works

1. Your local Codex or Claude worker registers and refreshes its GitHub Issues heartbeat.
2. If internet is lost, its heartbeat becomes stale and the roster marks it offline after the 180-second presence TTL.
3. If the main worker process exits due to a connection failure, the supervisor keeps running and restarts it with bounded retries: 5, 10, 20, 40, then 60 seconds between attempts.
4. Once internet connectivity and GitHub access return, a successful worker heartbeat marks the agent online again. Messages left queued can be processed.
5. **Already-running tasks are not automatically replayed after a crash.** They may have partial side effects and need review before retrying.

There is no need to manually reconnect after a normal Wi-Fi interruption as long as the supervisor remains running, the computer is awake, and the credentials are still valid.

## Migrate an existing worker (one-time)

If you currently started a worker using the original mesh.py command, stop that worker first with Ctrl+C to avoid duplicate workers. Then update the local checkout.

### Windows PowerShell (Codex example)

~~~powershell
cd "$HOME\spaceapps\nasa-spaceapps-2026"
git pull --ff-only
$env:MESH_REPO = "momansy/nasa-spaceapps-2026"
$agentId = (gh api user --jq .login).Trim().ToLowerInvariant()
python mesh_supervisor.py --repo momansy/nasa-spaceapps-2026 --agent $agentId --provider codex --mode plan --path .
~~~

For Claude Code, use --provider claude. If the appropriate Python launcher is py -3.12 rather than python, use that instead.

### macOS / Linux / WSL

~~~bash
cd "$HOME/spaceapps/nasa-spaceapps-2026"
git pull --ff-only
export MESH_REPO=momansy/nasa-spaceapps-2026
AGENT_ID="$(gh api user --jq .login | tr '[:upper:]' '[:lower:]')"
python3 mesh_supervisor.py --repo "$MESH_REPO" --agent "$AGENT_ID" --provider codex --mode plan --path .
~~~

New teammates can use the existing [one-command onboarding instructions](scripts/ONBOARDING.md); the updated join scripts launch the supervisor automatically.

## Check that reconnection worked

Open a separate terminal while the supervised worker is running:

~~~powershell
$env:MESH_REPO = "momansy/nasa-spaceapps-2026"
python mesh.py roster
python mesh.py status
~~~

The expected ID returns to online after the next successful heartbeat. Do not claim a successful two-way exchange without a real peer test.

## Important limitations

- An offline or sleeping computer cannot run a process. On wake, the supervisor resumes; after shutdown or reboot, it must be launched again unless separately configured as a user-login startup task.
- The supervisor intentionally refuses duplicate **supervisors** for the same agent ID on the same machine. A separately launched bare worker is not covered by the lock; stop it before starting the supervisor.
- GitHub/provider credentials can expire. Automatic reconnection does not bypass authentication requirements.
- The optional coordinator is a separate service. Only one coordinator should be running for the repository; this update does not supervise the coordinator.
- Network recovery alone does not guarantee exactly-once execution of work. Do not automatically rerun partially completed code tasks.
- An internet outage occurring during the initial setup can still interrupt installation. Once onboarded, normal connectivity interruptions are automatically handled while the supervisor runs.

## Safe test

1. Start a supervised worker, and confirm it shows online in the GitHub roster.
2. Disconnect Wi-Fi temporarily while keeping the terminal open.
3. Reconnect and inspect the terminal. The supervisor will restart a crashed worker after a backoff delay, up to 60 seconds.
4. Check the roster again and verify a new heartbeat. Optionally send a harmless setup-only message to another online worker.

The [reconnect regression tests](tests/test_reconnect.py) exercise worker restarts and the backoff mechanism without a real model or network. End-to-end Wi-Fi recovery still requires a teammate to test it on their own computer.

## Launch at login (optional)

To recover automatically after a full computer restart, configure the supervisor as a user-level startup task or service with the owner's consent: Windows Task Scheduler, macOS LaunchAgent or Linux systemd --user. These are separate from recovery after an internet interruption. GitHub does not keep local workers alive when computers are powered off.
