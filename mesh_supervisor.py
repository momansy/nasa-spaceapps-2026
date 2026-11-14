#!/usr/bin/env python3
"""Restart one Agent Mesh worker after a crash or network outage.

Uses only Python stdlib; does NOT retry or requeue tasks. The worker's GitHub
issue state remains the source of truth. Run one supervisor per agent identity.
"""
from __future__ import annotations

import argparse
import hashlib
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time


def acquire_singleton(repo, agent):
    """Hold an OS-enforced lock for this (repo, agent, OS user) supervisor."""
    key = hashlib.sha256(f"{repo}:{agent}".encode("utf-8")).hexdigest()[:20]
    path = Path(tempfile.gettempdir()) / f"spaceapps-agentmesh-{key}.lock"
    handle = path.open("a+b")
    try:
        handle.seek(0)
        if os.name == "nt":
            import msvcrt
            handle.write(b"0")
            handle.flush()
            handle.seek(0)
            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except (OSError, BlockingIOError):
        handle.close()
        raise RuntimeError(f"Agent {agent!r} already has a supervisor running on this computer")
    return handle  # Retain open until exit; OS releases the lock if killed.


def worker_command(args):
    runner = Path(args.path).resolve() / "mesh.py"
    if not runner.is_file():
        raise ValueError(f"mesh.py not found at {runner}")
    command = [sys.executable, str(runner), "--repo", args.repo,
               "worker", "--agent", args.agent, "--provider", args.provider,
               "--mode", args.mode, "--path", str(Path(args.path).resolve()),
               "--poll", str(args.poll)]
    if args.name:
        command += ["--name", args.name]
    if args.capabilities:
        command += ["--capabilities", args.capabilities]
    # Optional per-worker run settings (see BUILD_MODE.md); omitted when unset.
    for flag, attr in (("--model", "model"), ("--effort", "effort"), ("--orchestrator", "orchestrator"),
                       ("--tools", "tools"), ("--mcp", "mcp")):
        value = getattr(args, attr, "")
        if value:
            command += [flag, str(value)]
    for flag, attr in (("--max-turns", "max_turns"), ("--timeout", "timeout"),
                       ("--progress-minutes", "progress_minutes")):
        value = getattr(args, attr, 0)
        if value:
            command += [flag, str(value)]
    if getattr(args, "skip_permissions", False):
        command.append("--skip-permissions")
    return command


def supervise(args, *, launch=None, wait=None, monotonic=None, sleep=None):
    """Restart transiently exiting workers with capped exponential backoff.

    A fake launch/wait/clock may be injected for deterministic tests.
    """
    launch = launch or subprocess.Popen
    wait = wait or (lambda child: child.wait())
    monotonic = monotonic or time.monotonic
    sleep = sleep or time.sleep
    command = worker_command(args)
    delay = args.min_delay
    runs = 0
    while True:
        runs += 1
        started = monotonic()
        print(f"[mesh supervisor] Starting {args.agent} ({args.provider}/{args.mode}); attempt {runs}", flush=True)
        child = launch(command, cwd=str(Path(args.path).resolve()))
        try:
            exit_code = wait(child)
        except KeyboardInterrupt:
            print("\n[mesh supervisor] Stopping by user request.", flush=True)
            child.terminate()
            try:
                child.wait(timeout=10)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait()
            return 0
        elapsed = monotonic() - started
        # A worker that stayed up for a while deserves a fresh short retry delay.
        if elapsed >= args.reset_after:
            delay = args.min_delay
        print(f"[mesh supervisor] Worker exited ({exit_code}). Retrying in {delay}s. "
              "If there is no internet, it will rejoin when connectivity returns. "
              "Check authentication if errors persist.", file=sys.stderr, flush=True)
        try:
            sleep(delay)
        except KeyboardInterrupt:
            print("\n[mesh supervisor] Stopped by user request.", flush=True)
            return 0
        delay = min(args.max_delay, delay * 2)


def parser():
    p = argparse.ArgumentParser(description="Keep an Agent Mesh worker alive across internet outages")
    p.add_argument("--repo", default=os.environ.get("MESH_REPO", "momansy/nasa-spaceapps-2026"))
    p.add_argument("--agent", required=True)
    p.add_argument("--provider", required=True, choices=("codex", "claude", "mock"))
    p.add_argument("--mode", default="plan", choices=("plan", "code", "build"))
    p.add_argument("--model", default="")
    p.add_argument("--effort", default="")
    p.add_argument("--max-turns", type=int, default=0)
    p.add_argument("--timeout", type=int, default=0)
    p.add_argument("--orchestrator", default="")
    p.add_argument("--tools", default="")
    p.add_argument("--mcp", default="")
    p.add_argument("--skip-permissions", action="store_true")
    p.add_argument("--progress-minutes", type=int, default=0)
    p.add_argument("--path", default=".")
    p.add_argument("--name", default="")
    p.add_argument("--capabilities", default="")
    p.add_argument("--poll", type=int, default=45)
    p.add_argument("--min-delay", type=int, default=5)
    p.add_argument("--max-delay", type=int, default=60)
    p.add_argument("--reset-after", type=int, default=300)
    return p


def main(argv=None):
    args = parser().parse_args(argv)
    if not (args.repo and "/" in args.repo):
        raise ValueError("--repo must be OWNER/REPOSITORY")
    from mesh import validate_agent
    validate_agent(args.agent)
    if args.mode == "build" and not args.orchestrator.strip():
        raise ValueError("Build mode needs --orchestrator GITHUB_LOGIN")
    if args.min_delay <= 0 or args.max_delay < args.min_delay or args.reset_after <= 0:
        raise ValueError("Retry intervals must be positive and max-delay >= min-delay")
    command = worker_command(args)
    print("[mesh supervisor] Auto-reconnect enabled. Worker commands: "
          f"{Path(command[1]).name} for {args.agent}; Ctrl+C stops the supervisor.", flush=True)
    with acquire_singleton(args.repo, args.agent):
        return supervise(args)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (RuntimeError, ValueError) as exc:
        sys.exit(str(exc))
