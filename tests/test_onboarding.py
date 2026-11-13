"""No-network smoke tests for the macOS/Linux one-command helper.

Windows PowerShell is checked structurally; functional Windows validation is still
required on an actual Windows machine with WinGet, GitHub CLI, and provider CLI.
"""
from pathlib import Path
import os
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


@unittest.skipUnless(shutil.which('bash'), 'Requires bash')
class TestJoinScript(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.dir.cleanup)
        self.home = Path(self.dir.name)
        self.bins = self.home / 'bin'
        self.bins.mkdir()
        self.repo = self.home / 'spaceapps' / 'nasa-spaceapps-2026'
        self.repo.mkdir(parents=True)
        (self.repo / '.git').mkdir()
        # Simulate the network-dependent commands without touching real GitHub.
        commands = {
            'gh': '''#!/usr/bin/env bash
case "$*" in
  'api user --jq .login') echo 'Test-Member';;
  'api repos/momansy/nasa-spaceapps-2026 --jq .full_name')
    if [ "${NO_REPO_ACCESS:-0}" = 1 ]; then exit 1; else echo momansy/nasa-spaceapps-2026; fi;;
  'auth status'|'auth setup-git') exit 0;;
  *) echo "Bad gh invocation: $*" >&2; exit 12;;
esac
''',
            'git': '''#!/usr/bin/env bash
case "$*" in
  *'remote get-url origin') echo https://github.com/momansy/nasa-spaceapps-2026.git;;
  *'pull --ff-only') exit 0;;
  *) echo "Bad git invocation: $*" >&2; exit 13;;
esac
''',
            'codex': '''#!/usr/bin/env bash
[ "$*" = 'login status' ] || exit 14
''',
            'claude': '''#!/usr/bin/env bash
[ "$*" = 'auth status' ] || exit 15
''',
            'python3': '''#!/usr/bin/env bash
if [ "${1:-}" = '-c' ]; then exit 0; fi
printf '%s\\n' "$*" >> "$MESH_TEST_LOG"
''',
        }
        for name, content in commands.items():
            path = self.bins / name
            path.write_text(content)
            path.chmod(0o755)
        self.env = os.environ.copy()
        self.env.update({'HOME': str(self.home), 'PATH': str(self.bins) + ':' + self.env['PATH'],
                         'MESH_TEST_LOG': str(self.home / 'commands.log')})

    def execute(self, *args, **extra):
        env = dict(self.env, **extra)
        return subprocess.run(['bash', str(ROOT / 'scripts/join.sh'), *args],
                              env=env, capture_output=True, text=True, timeout=10)

    def test_join_defaults_to_own_github_login(self):
        p = self.execute('codex')
        self.assertEqual(p.returncode, 0, p.stderr)
        calls = (self.home / 'commands.log').read_text()
        self.assertIn('mesh.py bootstrap', calls)
        self.assertIn('mesh.py worker --agent test-member --provider codex --mode plan', calls)

    def test_explicit_claude_skill_and_code_mode(self):
        p = self.execute('claude', 'sara', 'frontend,design', MESH_MODE='code')
        self.assertEqual(p.returncode, 0, p.stderr)
        calls = (self.home / 'commands.log').read_text()
        self.assertIn('mesh.py worker --agent sara --provider claude --mode code', calls)
        self.assertIn('--capabilities frontend,design', calls)

    def test_refuses_private_repo_without_invitation(self):
        p = self.execute('codex', NO_REPO_ACCESS='1')
        self.assertNotEqual(p.returncode, 0)
        self.assertIn('accept your invitation', p.stderr)
        self.assertFalse((self.home / 'commands.log').exists())

    def test_no_start_option_only_bootstraps(self):
        p = self.execute('codex', MESH_NO_START='1')
        self.assertEqual(p.returncode, 0, p.stderr)
        calls = (self.home / 'commands.log').read_text()
        self.assertIn('mesh.py bootstrap', calls)
        self.assertNotIn('mesh.py worker', calls)

    def test_powershell_script_has_safe_defaults(self):
        text = (ROOT / 'scripts/join.ps1').read_text()
        self.assertIn("[ValidateSet('plan','code')][string]$Mode = 'plan'", text)
        self.assertIn("$Repo = 'momansy/nasa-spaceapps-2026'", text)
        self.assertIn('pull --ff-only', text)
        self.assertNotIn('git reset --hard', text)
        self.assertNotIn('codex --dangerously-bypass-approvals-and-sandbox', text)


if __name__ == '__main__':
    unittest.main()