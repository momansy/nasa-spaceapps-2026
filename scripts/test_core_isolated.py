#!/usr/bin/env python3
"""Restore and test MissionForge Core without reading the user's NuGet.Config.

Run from any directory: python scripts/test_core_isolated.py
Requires .NET 8 SDK and network access to nuget.org for an initial restore.
"""
from __future__ import annotations

import os
from pathlib import Path
import shutil
import subprocess
import sys


NUGET_CONFIG = """<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <packageSources>
    <clear />
    <add key="nuget.org" value="https://api.nuget.org/v3/index.json" protocolVersion="3" />
  </packageSources>
</configuration>
"""


def main(repo_root: Path | None = None) -> int:
    root = (repo_root or Path(__file__).resolve().parents[1]).resolve()
    solution = root / "core" / "dotnet~" / "MissionForge.Core.sln"
    if not solution.is_file():
        print(f"Solution not found: {solution}", file=sys.stderr)
        return 2
    if shutil.which("dotnet") is None:
        print(".NET SDK not found. Install .NET 8 SDK, then retry.", file=sys.stderr)
        return 127

    work = root / ".agentmesh" / "dotnet-isolated"
    config = work / "NuGet.Config"
    config.parent.mkdir(parents=True, exist_ok=True)
    config.write_text(NUGET_CONFIG, encoding="utf-8")

    env = os.environ.copy()
    for name, folder in (
        ("APPDATA", "appdata"),
        ("LOCALAPPDATA", "localappdata"),
        ("DOTNET_CLI_HOME", "cli-home"),
        ("NUGET_PACKAGES", "packages"),
        ("NUGET_HTTP_CACHE_PATH", "http-cache"),
    ):
        path = work / folder
        path.mkdir(parents=True, exist_ok=True)
        env[name] = str(path)
    env["DOTNET_CLI_TELEMETRY_OPTOUT"] = "1"
    env["DOTNET_SKIP_FIRST_TIME_EXPERIENCE"] = "1"

    commands = (
        ["dotnet", "restore", str(solution), "--configfile", str(config),
         "--packages", env["NUGET_PACKAGES"]],
        ["dotnet", "test", str(solution), "--no-restore"],
    )
    for command in commands:
        print("Running:", " ".join(command), flush=True)
        result = subprocess.run(command, cwd=root, env=env, check=False)
        if result.returncode:
            print(f"Command failed (exit {result.returncode}); no files in your personal NuGet folder were changed.", file=sys.stderr)
            return result.returncode
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
