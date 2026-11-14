"""Build-mode regression tests. No GitHub, model or network calls."""
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parents[1]))
sys.path.insert(0, str(Path(__file__).parent))
import mesh
import mesh_supervisor
from test_mesh import MemoryGitHub


def run(cwd, *args):
    subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True, text=True)


class TestCommands(unittest.TestCase):
    def test_plan_and_code_commands_unchanged(self):
        plan = mesh.agent_command("claude", "plan", mesh.SCHEMA, mesh.run_options("plan"))
        self.assertEqual(plan[-4:], ["--permission-mode", "plan", "--allowedTools", "Read"])
        self.assertEqual(plan[plan.index("--max-turns") + 1], "12")
        code = mesh.agent_command("claude", "code", mesh.SCHEMA, mesh.run_options("code"))
        self.assertEqual(code[-1], "Read,Edit,Write")
        self.assertNotIn("--model", plan)

    def test_build_command_uses_allowlist_model_and_effort(self):
        options = mesh.run_options("build", model="claude-opus-5-5", effort="high",
                                   mcp="unity, blender", orchestrators="KingRMA")
        cmd = mesh.agent_command("claude", "build", mesh.SCHEMA, options)
        self.assertEqual(cmd[cmd.index("--model") + 1], "claude-opus-5-5")
        self.assertEqual(cmd[cmd.index("--effort") + 1], "high")
        self.assertEqual(cmd[cmd.index("--max-turns") + 1], "400")
        allowed = cmd[cmd.index("--allowedTools") + 1].split(",")
        self.assertIn("Bash", allowed)
        self.assertIn("mcp__unity", allowed)
        self.assertIn("mcp__blender", allowed)
        self.assertNotIn("--dangerously-skip-permissions", cmd)
        self.assertEqual(options["orchestrators"], {"kingrma"})
        self.assertEqual(options["timeout"], 10800)

    def test_skip_permissions_is_explicit(self):
        cmd = mesh.agent_command("claude", "build", mesh.SCHEMA,
                                 mesh.run_options("build", skip_permissions=True))
        self.assertIn("--dangerously-skip-permissions", cmd)
        self.assertNotIn("--allowedTools", cmd)

    def test_codex_build_command(self):
        cmd = mesh.agent_command("codex", "build", mesh.SCHEMA,
                                 mesh.run_options("build", model="gpt-x", effort="high"),
                                 "s.json", "r.json")
        self.assertEqual(cmd[cmd.index("--sandbox") + 1], "workspace-write")
        self.assertIn("model_reasoning_effort=high", cmd)
        self.assertEqual(cmd[cmd.index("--model") + 1], "gpt-x")

    def test_codex_skip_permissions_allows_mcp_calls(self):
        cmd = mesh.agent_command("codex", "build", mesh.SCHEMA,
                                 mesh.run_options("build", skip_permissions=True), "s.json", "r.json")
        self.assertIn("--dangerously-bypass-approvals-and-sandbox", cmd)
        self.assertNotIn("--sandbox", cmd)

    def test_invalid_mcp_name_rejected(self):
        with self.assertRaises(ValueError):
            mesh.run_options("build", mcp="bad;name")

    def test_supervisor_passes_build_flags(self):
        with TemporaryDirectory() as root:
            Path(root, "mesh.py").write_text("print(1)", encoding="utf-8")
            args = SimpleNamespace(path=root, repo="o/r", agent="sara", provider="claude",
                                   mode="build", poll=45, name="", capabilities="unity",
                                   model="claude-opus-5-5", effort="high", orchestrator="kingrma",
                                   tools="", mcp="unity", max_turns=0, timeout=0,
                                   progress_minutes=5, skip_permissions=False)
            cmd = mesh_supervisor.worker_command(args)
            for expected in ("build", "--model", "claude-opus-5-5", "--effort", "high",
                             "--orchestrator", "kingrma", "--mcp", "--progress-minutes"):
                self.assertIn(expected, cmd)
            self.assertNotIn("--skip-permissions", cmd)
            self.assertNotIn("--max-turns", cmd)

    def test_protected_paths_include_supervisor(self):
        self.assertTrue(mesh.forbidden_path("mesh_supervisor.py"))
        self.assertFalse(mesh.forbidden_path("unity/MissionForge/Assets/Scripts/Sim/Rocket.cs"))


class TestBuildFlow(unittest.TestCase):
    def setUp(self):
        self.gh = MemoryGitHub()
        self.gh.register("sara")
        self.temp = TemporaryDirectory()
        base = Path(self.temp.name)
        self.remote = base / "remote.git"
        self.work = base / "work"
        run(base, "init", "--bare", str(self.remote))
        run(base, "clone", str(self.remote), str(self.work))
        run(self.work, "config", "user.email", "t@example.invalid")
        run(self.work, "config", "user.name", "Test")
        run(self.work, "config", "core.autocrlf", "false")
        run(self.work, "checkout", "-b", "main")
        (self.work / "README.md").write_text("hello\n", encoding="utf-8")
        run(self.work, "add", "README.md")
        run(self.work, "commit", "-m", "init")
        run(self.work, "push", "-u", "origin", "main")
        run(self.work, "remote", "set-head", "origin", "main")
        self.options = mesh.run_options("build", orchestrators="KingRMA", progress_minutes=60)
        self.created = []
        real_run_command = mesh.run_command

        def fake_run_command(args, cwd, env, timeout=1200, input_text=None):
            if args[0] == "gh":
                self.created.append(args)
                return f"https://example.invalid/pr/{len(self.created)}"
            return real_run_command(args, cwd, env, timeout, input_text)

        self.command_patch = patch.object(mesh, "run_command", side_effect=fake_run_command)
        self.command_patch.start()

    def tearDown(self):
        self.command_patch.stop()
        self.temp.cleanup()

    def task(self, author):
        issue = self.gh.send("human", "sara", "Build it", "Create game/hello.txt")
        self.gh.issues[issue["number"]]["user"] = {"login": author}
        return issue["number"]

    def labels(self, number):
        return {item["name"] for item in self.gh.issues[number]["labels"]}

    def comments(self, number):
        return " ".join(c["body"] for c in self.gh.all_comments[number])

    def test_task_from_stranger_is_blocked_without_running(self):
        number = self.task("someone-else")
        with patch.object(mesh, "run_agent") as agent:
            self.assertFalse(mesh.handle_one(self.gh, "sara", "mock", str(self.work), "build",
                                             options=self.options))
            agent.assert_not_called()
        self.assertIn("mesh:blocked", self.labels(number))

    def test_orchestrator_task_runs_and_publishes_branch(self):
        number = self.task("KingRMA")
        prompts = []

        def fake_agent(provider, prompt, cwd, mode, output_schema=None, options=None, **_):
            prompts.append(prompt)
            self.assertEqual(output_schema["properties"]["handoffs"]["maxItems"], 0)
            Path(cwd, "game").mkdir()
            Path(cwd, "game", "hello.txt").write_text("hi\n", encoding="utf-8")
            Path(cwd, "CLAUDE.md").write_text("tampered\n", encoding="utf-8")
            return {"summary": "made it", "status": "done", "handoffs": []}

        with patch.object(mesh, "run_agent", side_effect=fake_agent):
            self.assertTrue(mesh.handle_one(self.gh, "sara", "mock", str(self.work), "build",
                                            options=self.options))
        self.assertIn("mesh:done", self.labels(number))
        self.assertIn("STANDING ORDERS", prompts[0])
        self.assertIn("progress --issue", prompts[0])
        self.assertEqual(len(self.created), 1)
        self.assertNotIn("--draft", self.created[0])
        branch = f"agentmesh/sara/issue-{number}"
        files = subprocess.run(["git", "ls-tree", "-r", "--name-only", branch], cwd=self.remote,
                               capture_output=True, text=True, check=True).stdout.split()
        self.assertIn("game/hello.txt", files)
        # The protected file was not committed; it was parked and the tree is clean again.
        self.assertNotIn("CLAUDE.md", files)
        status = subprocess.run(["git", "status", "--porcelain"], cwd=self.work,
                                capture_output=True, text=True, check=True).stdout
        self.assertEqual(status, "")
        self.assertIn("https://example.invalid/pr/1", self.comments(number))

    def test_blocked_result_still_publishes_draft(self):
        number = self.task("kingrma")

        def blocked_agent(provider, prompt, cwd, mode, **_):
            Path(cwd, "half.txt").write_text("wip\n", encoding="utf-8")
            return {"summary": "need Unity", "status": "blocked", "handoffs": []}

        with patch.object(mesh, "run_agent", side_effect=blocked_agent):
            mesh.handle_one(self.gh, "sara", "mock", str(self.work), "build", options=self.options)
        self.assertIn("mesh:blocked", self.labels(number))
        self.assertIn("--draft", self.created[0])

    def test_failed_run_saves_partial_work_as_draft(self):
        number = self.task("kingrma")

        def failing_agent(provider, prompt, cwd, mode, **_):
            Path(cwd, "partial.txt").write_text("wip\n", encoding="utf-8")
            raise RuntimeError("model timed out")

        with patch.object(mesh, "run_agent", side_effect=failing_agent):
            self.assertTrue(mesh.handle_one(self.gh, "sara", "mock", str(self.work), "build",
                                            options=self.options))
        self.assertIn("mesh:blocked", self.labels(number))
        self.assertIn("--draft", self.created[0])
        self.assertIn("Partial work saved", self.comments(number))

    def test_agent_commit_of_protected_file_is_not_published(self):
        number = self.task("kingrma")

        def sneaky_agent(provider, prompt, cwd, mode, **_):
            Path(cwd, "mesh.py").write_text("print('changed')\n", encoding="utf-8")
            run(cwd, "add", "mesh.py")
            run(cwd, "commit", "-m", "sneak")
            return {"summary": "done", "status": "done", "handoffs": []}

        with patch.object(mesh, "run_agent", side_effect=sneaky_agent):
            mesh.handle_one(self.gh, "sara", "mock", str(self.work), "build", options=self.options)
        self.assertIn("mesh:blocked", self.labels(number))
        self.assertEqual(self.created, [])
        branches = subprocess.run(["git", "branch", "--list"], cwd=self.remote,
                                  capture_output=True, text=True, check=True).stdout
        self.assertNotIn("agentmesh", branches)

    def test_already_staged_deletion_does_not_break_publish(self):
        number = self.task("kingrma")

        def tidy(provider, prompt, cwd, mode, **_):
            run(cwd, "rm", "-q", "README.md")  # deletion staged: gone from index and tree
            Path(cwd, "new.txt").write_text("x\n", encoding="utf-8")
            return {"summary": "done", "status": "done", "handoffs": []}

        with patch.object(mesh, "run_agent", side_effect=tidy):
            mesh.handle_one(self.gh, "sara", "mock", str(self.work), "build", options=self.options)
        self.assertIn("mesh:done", self.labels(number))
        files = subprocess.run(["git", "ls-tree", "-r", "--name-only", f"agentmesh/sara/issue-{number}"],
                               cwd=self.remote, capture_output=True, text=True, check=True).stdout.split()
        self.assertEqual(files, ["new.txt"])

    def test_build_outputs_are_never_published(self):
        number = self.task("kingrma")

        def messy(provider, prompt, cwd, mode, **_):
            Path(cwd, "assets", "blender", "_build", "preview").mkdir(parents=True)
            Path(cwd, "assets", "blender", "_build", "preview", "x.png").write_text("png", encoding="utf-8")
            Path(cwd, "unity", "Scratch", "Library").mkdir(parents=True)
            Path(cwd, "unity", "Scratch", "Library", "cache.bin").write_text("c", encoding="utf-8")
            Path(cwd, "game.txt").write_text("real work\n", encoding="utf-8")
            return {"summary": "done", "status": "done", "handoffs": []}

        with patch.object(mesh, "run_agent", side_effect=messy):
            mesh.handle_one(self.gh, "sara", "mock", str(self.work), "build", options=self.options)
        files = subprocess.run(["git", "ls-tree", "-r", "--name-only", f"agentmesh/sara/issue-{number}"],
                               cwd=self.remote, capture_output=True, text=True, check=True).stdout.split()
        self.assertEqual([f for f in files if f != "README.md"], ["game.txt"])
        self.assertFalse(mesh.junk_path("docs/play/host/Build/game.wasm"))
        self.assertTrue(mesh.junk_path("client/node_modules/x/index.js"))

    def test_task_can_set_model_and_effort(self):
        self.assertEqual(mesh.task_overrides("Do it\nmesh-model: claude-sonnet-5-5\nmesh-effort: High\n"),
                         {"model": "claude-sonnet-5-5", "effort": "high"})
        self.assertEqual(mesh.task_overrides("mesh-model: bad model; rm -rf"), {})
        issue = self.gh.send("human", "sara", "Build it", "Make it\nmesh-model: claude-sonnet-5-5")
        self.gh.issues[issue["number"]]["user"] = {"login": "kingrma"}
        seen = {}

        def agent(provider, prompt, cwd, mode, options=None, **_):
            seen.update(options)
            return {"summary": "ok", "status": "done", "handoffs": []}

        with patch.object(mesh, "run_agent", side_effect=agent):
            mesh.handle_one(self.gh, "sara", "mock", str(self.work), "build", options=self.options)
        self.assertEqual(seen["model"], "claude-sonnet-5-5")
        self.assertIn("claude-sonnet-5-5", self.comments(issue["number"]))

    def test_retry_resumes_published_partial_work(self):
        number = self.task("kingrma")

        def cut_off(provider, prompt, cwd, mode, **_):
            Path(cwd, "step1.txt").write_text("one\n", encoding="utf-8")
            raise RuntimeError("usage limit reached")

        def finish(provider, prompt, cwd, mode, **_):
            self.assertTrue(Path(cwd, "step1.txt").exists(), "partial work must be present on retry")
            Path(cwd, "step2.txt").write_text("two\n", encoding="utf-8")
            return {"summary": "finished", "status": "done", "handoffs": []}

        with patch.object(mesh, "run_agent", side_effect=cut_off):
            mesh.handle_one(self.gh, "sara", "mock", str(self.work), "build", options=self.options)
        self.assertIn("mesh:blocked", self.labels(number))
        # Another task ran in between, so the checkout left the first task's branch.
        run(self.work, "checkout", "main")
        self.gh.transition(number, "blocked", "queued")
        with patch.object(mesh, "run_agent", side_effect=finish):
            mesh.handle_one(self.gh, "sara", "mock", str(self.work), "build", options=self.options)
        self.assertIn("mesh:done", self.labels(number))
        files = subprocess.run(["git", "ls-tree", "-r", "--name-only", f"agentmesh/sara/issue-{number}"],
                               cwd=self.remote, capture_output=True, text=True, check=True).stdout.split()
        self.assertIn("step1.txt", files)
        self.assertIn("step2.txt", files)

    def test_restart_mid_task_keeps_working_tree(self):
        number = self.task("kingrma")
        branch = f"agentmesh/sara/issue-{number}"
        run(self.work, "checkout", "-b", branch)
        Path(self.work, "unsaved.txt").write_text("in progress\n", encoding="utf-8")

        def finish(provider, prompt, cwd, mode, **_):
            self.assertTrue(Path(cwd, "unsaved.txt").exists())
            return {"summary": "finished", "status": "done", "handoffs": []}

        with patch.object(mesh, "run_agent", side_effect=finish):
            mesh.handle_one(self.gh, "sara", "mock", str(self.work), "build", options=self.options)
        files = subprocess.run(["git", "ls-tree", "-r", "--name-only", branch], cwd=self.remote,
                               capture_output=True, text=True, check=True).stdout.split()
        self.assertIn("unsaved.txt", files)

    def test_restart_flags_interrupted_task(self):
        number = self.task("kingrma")
        self.gh.transition(number, "queued", "running")
        self.assertEqual(mesh.recover_interrupted(self.gh, "sara"), 1)
        self.assertIn("mesh:blocked", self.labels(number))


if __name__ == "__main__":
    unittest.main()
