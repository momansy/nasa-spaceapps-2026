"""Offline regression tests for agent mesh Git publish recovery."""
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parents[1]))
import mesh


def run(cwd, *args):
    return subprocess.run(["git", *args], cwd=cwd, check=True,
                          capture_output=True, text=True).stdout.strip()


class GitRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        self.remote, self.first, self.second = root / "remote.git", root / "a", root / "b"
        run(root, "init", "--bare", str(self.remote))
        run(root, "clone", str(self.remote), str(self.first))
        self.configure(self.first, "a")
        run(self.first, "checkout", "-b", "main")
        (self.first / "README").write_text("hello\n", encoding="utf-8")
        run(self.first, "add", "README")
        run(self.first, "commit", "-m", "init")
        run(self.first, "push", "-u", "origin", "main")
        run(self.remote, "symbolic-ref", "HEAD", "refs/heads/main")
        run(self.first, "remote", "set-head", "origin", "main")
        self.branch = "agentmesh/momansy/issue-24"
        run(self.first, "checkout", "-b", self.branch)
        (self.first / "initial.txt").write_text("initial\n", encoding="utf-8")
        run(self.first, "add", "initial.txt")
        run(self.first, "commit", "-m", "first")
        run(self.first, "push", "-u", "origin", self.branch)
        run(root, "clone", str(self.remote), str(self.second))
        self.configure(self.second, "b")
        run(self.second, "checkout", self.branch)

    @staticmethod
    def configure(path, who):
        run(path, "config", "user.email", f"{who}@example.invalid")
        run(path, "config", "user.name", who)

    def test_nonfastforward_preserves_both_commits(self):
        (self.second / "remote.txt").write_text("remote", encoding="utf-8")
        run(self.second, "add", "remote.txt")
        run(self.second, "commit", "-m", "remote")
        run(self.second, "push", "origin", self.branch)
        (self.first / "local.txt").write_text("local", encoding="utf-8")
        run(self.first, "add", "local.txt")
        run(self.first, "commit", "-m", "local")
        mesh.push_branch_with_recovery(self.first, self.branch)
        paths = run(self.remote, "ls-tree", "-r", "--name-only", self.branch).splitlines()
        self.assertTrue({"initial.txt", "remote.txt", "local.txt"} <= set(paths))

    def test_conflict_preserves_local_without_force_push(self):
        (self.second / "README").write_text("remote", encoding="utf-8")
        run(self.second, "add", "README")
        run(self.second, "commit", "-m", "remote")
        run(self.second, "push", "origin", self.branch)
        (self.first / "README").write_text("local", encoding="utf-8")
        run(self.first, "add", "README")
        run(self.first, "commit", "-m", "local")
        local_head = run(self.first, "rev-parse", "HEAD")
        with self.assertRaisesRegex(RuntimeError, "no force-push"):
            mesh.push_branch_with_recovery(self.first, self.branch)
        self.assertEqual(local_head, run(self.first, "rev-parse", "HEAD"))
        self.assertEqual("remote", run(self.remote, "show", self.branch + ":README"))
        self.assertEqual("", run(self.first, "status", "--porcelain"))

    def test_transient_fetch_error_is_retried(self):
        with patch.object(mesh, "run_command",
                          side_effect=[RuntimeError("Could not resolve host: github.com"), "ok"]) as call, \
             patch.object(mesh.time, "sleep"):
            self.assertEqual("ok", mesh.git(self.first, "fetch", "origin"))
            self.assertEqual(2, call.call_count)

    def test_authentication_error_is_not_retried(self):
        with patch.object(mesh, "run_command", side_effect=RuntimeError("403 Forbidden")) as call, \
             patch.object(mesh.time, "sleep"):
            with self.assertRaisesRegex(RuntimeError, "403"):
                mesh.git(self.first, "push", "origin", self.branch)
            self.assertEqual(1, call.call_count)


if __name__ == "__main__":
    unittest.main()
