"""Offline auto-reconnect watchdog regression tests. No GitHub or model calls."""
import os
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from types import SimpleNamespace
from unittest.mock import Mock
import sys

sys.path.insert(0, str(Path(__file__).parents[1]))
import mesh_supervisor as s


class TestReconnect(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        Path(self.temp.name, 'mesh.py').write_text('print("test")', encoding='utf-8')
        self.args = SimpleNamespace(
            path=self.temp.name, repo='momansy/nasa-spaceapps-2026',
            agent='sara', provider='codex', mode='plan', poll=45,
            name='', capabilities='', min_delay=5, max_delay=60,
            reset_after=300)

    def tearDown(self):
        self.temp.cleanup()

    def test_generated_command_keeps_mode_and_identity(self):
        cmd = s.worker_command(self.args)
        self.assertIn('plan', cmd)
        self.assertIn('sara', cmd)
        self.assertEqual(cmd[0], sys.executable)
        self.assertIn('momansy/nasa-spaceapps-2026', cmd)

    def test_retries_and_caps_delay(self):
        delays = []
        cycles = []

        def launch(cmd, cwd):
            cycles.append((cmd, cwd))
            return Mock()

        def sleep(sec):
            delays.append(sec)
            if len(delays) == 6:
                raise KeyboardInterrupt()

        rc = s.supervise(self.args, launch=launch, wait=lambda child: 1,
                         monotonic=lambda: 10, sleep=sleep)
        self.assertEqual(rc, 0)
        self.assertEqual(delays, [5, 10, 20, 40, 60, 60])
        self.assertEqual(len(cycles), 6)

    def test_long_running_worker_resets_backoff(self):
        times = iter([0, 0, 0, 0, 0, 301])
        delays = []

        def sleep(sec):
            delays.append(sec)
            if len(delays) == 3:
                raise KeyboardInterrupt()

        s.supervise(self.args, launch=lambda *a, **kw: Mock(), wait=lambda x: 1,
                    monotonic=lambda: next(times), sleep=sleep)
        self.assertEqual(delays, [5, 10, 5])

    @unittest.skipIf(os.name == 'nt', 'fcntl lock test only on Unix')
    def test_prevents_duplicate_agent_on_same_host(self):
        with s.acquire_singleton(self.args.repo, self.args.agent):
            with self.assertRaisesRegex(RuntimeError, 'already has a supervisor'):
                s.acquire_singleton(self.args.repo, self.args.agent)
        with s.acquire_singleton(self.args.repo, self.args.agent):
            pass

    def test_missing_mesh_fails_before_start(self):
        self.args.path = Path(self.temp.name) / 'nonexistent'
        with self.assertRaisesRegex(ValueError, 'mesh.py not found'):
            s.worker_command(self.args)

    def test_provider_and_capabilities_passed(self):
        self.args.provider = 'claude'
        self.args.capabilities = 'frontend,qa'
        self.args.name = 'S. A.'
        cmd = s.worker_command(self.args)
        self.assertIn('claude', cmd)
        self.assertIn('frontend,qa', cmd)
        self.assertIn('S. A.', cmd)

    def test_default_retry_settings(self):
        args = s.parser().parse_args(['--agent', 'sara', '--provider', 'codex'])
        self.assertEqual(args.min_delay, 5)
        self.assertEqual(args.max_delay, 60)


if __name__ == '__main__':
    unittest.main()
