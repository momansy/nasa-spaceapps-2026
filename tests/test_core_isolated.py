"""Offline tests for the isolated NuGet workaround; do not require .NET."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "test_core_isolated.py"
spec = importlib.util.spec_from_file_location("test_core_isolated_script", SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class IsolatedDotnetTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        solution = self.root / "core" / "dotnet~" / "MissionForge.Core.sln"
        solution.parent.mkdir(parents=True)
        solution.write_text("", encoding="utf-8")

    @patch.object(module.shutil, "which", return_value="dotnet")
    @patch.object(module.subprocess, "run")
    def test_isolated_config_used_and_implicit_restore_disabled(self, run, _which):
        run.return_value.returncode = 0
        self.assertEqual(0, module.main(self.root))
        self.assertEqual(2, run.call_count)
        restore, test = run.call_args_list
        self.assertEqual("restore", restore.args[0][1])
        self.assertIn("--configfile", restore.args[0])
        self.assertIn("--packages", restore.args[0])
        self.assertEqual(["dotnet", "test", str(self.root / "core" / "dotnet~" / "MissionForge.Core.sln"), "--no-restore"], test.args[0])
        self.assertTrue(str(restore.kwargs["env"]["APPDATA"]).startswith(str(self.root)))
        self.assertEqual(restore.kwargs["env"], test.kwargs["env"])
        config = self.root / ".agentmesh" / "dotnet-isolated" / "NuGet.Config"
        self.assertIn("<clear />", config.read_text(encoding="utf-8"))

    @patch.object(module.shutil, "which", return_value="dotnet")
    @patch.object(module.subprocess, "run")
    def test_restore_failure_does_not_run_tests(self, run, _which):
        run.return_value.returncode = 1
        self.assertEqual(1, module.main(self.root))
        self.assertEqual(1, run.call_count)

    @patch.object(module.shutil, "which", return_value=None)
    def test_missing_sdk_is_reported(self, _which):
        self.assertEqual(127, module.main(self.root))


if __name__ == "__main__":
    unittest.main()
