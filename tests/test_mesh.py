"""Pure-local regression tests for the dynamic GitHub Issues agent mesh."""
import datetime as dt
from pathlib import Path
from tempfile import TemporaryDirectory
import sys
import unittest
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit, unquote
sys.path.insert(0, str(Path(__file__).parents[1]))
import mesh


class MemoryGitHub(mesh.GitHub):
    """Simulated GitHub API, exercises the production routing methods without network."""
    def __init__(self):
        self.repo = "org/space-apps"
        self.token = "test-not-real"
        self.base = "https://api.github.com/repos/org/space-apps"
        self.issues = {}
        self.all_comments = {}
        self.labels_set = set()
        self.next_number = 0

    def request(self, method, path, payload=None):
        parsed = urlsplit(path)
        parts = [unquote(s) for s in parsed.path.split("/") if s]
        if method == "POST" and parts == ["labels"]:
            self.labels_set.add(payload["name"])
            return payload
        if parts == ["issues"] and method == "POST":
            self.next_number += 1
            number = self.next_number
            self.issues[number] = {"number": number, "title": payload["title"],
                "body": payload["body"], "state": "open",
                "labels": [{"name": label} for label in payload.get("labels", [])],
                "updated_at": mesh.utcnow().isoformat(),
                "html_url": f"https://example.invalid/issue/{number}"}
            return self.issues[number]
        if parts == ["issues"] and method == "GET":
            query = parse_qs(parsed.query)
            requested = set(query.get("labels", [""])[0].split(","))
            state = query.get("state", ["open"])[0]
            results = [v for v in self.issues.values() if
                v["state"] == state and requested <= {x["name"] for x in v["labels"]}]
            page = int(query.get("page", [1])[0])
            per_page = int(query.get("per_page", [100])[0])
            return results[(page - 1) * per_page:page * per_page]
        if len(parts) >= 2 and parts[0] == "issues":
            number = int(parts[1])
            issue = self.issues[number]
            if len(parts) == 2 and method == "GET":
                return issue
            if len(parts) == 2 and method == "PATCH":
                issue.update(payload)
                issue["updated_at"] = mesh.utcnow().isoformat()
                return issue
            if parts[2:] == ["labels"] and method == "POST":
                current = {item["name"] for item in issue["labels"]}
                current.update(payload["labels"])
                issue["labels"] = [{"name": item} for item in sorted(current)]
                return issue["labels"]
            if len(parts) == 4 and parts[2] == "labels" and method == "DELETE":
                label = parts[3]
                issue["labels"] = [l for l in issue["labels"] if l["name"] != label]
                return None
            if parts[2:] == ["comments"] and method == "POST":
                self.all_comments.setdefault(number, []).append({"body": payload["body"],
                                                                  "user": {"login": "test"}})
                issue["updated_at"] = mesh.utcnow().isoformat()
                return {}
            if parts[2:] == ["comments"] and method == "GET":
                return self.all_comments.get(number, [])
        raise AssertionError(f"Unimplemented simulated API: {method} {path}")

    def register(self, name, caps="", provider="mock"):
        return self.heartbeat(name, name.title(), provider, caps)

    def offline(self, name):
        entry = self.presence()[name]
        self.heartbeat(name, name.title(), "mock", entry["capabilities"],
                       status="offline", issue_number=entry["issue_number"])


class TestIdentityAndSchema(unittest.TestCase):
    def test_unbounded_team_identity(self):
        for name in ("ali", "sara", "extra-agent-11", "developer_22"):
            self.assertEqual(mesh.validate_agent(name), name)
        for name in ("", "A", "Has Space", "../secret", "a" * 30):
            with self.assertRaises(ValueError):
                mesh.validate_agent(name)

    def test_metadata_round_trip(self):
        body = mesh.render_issue_body("Please review the camera", "ali", "sara", 1, 27,
                                      capability="frontend", auto_route=True)
        got = mesh.metadata(body)
        self.assertEqual(got["sender"], "ali")
        self.assertEqual(got["recipient"], "sara")
        self.assertEqual(got["hop"], 1)
        self.assertTrue(got["auto_route"])
        self.assertEqual(got["capability"], "frontend")
        update = mesh.replace_metadata(body, dict(got, recipient="omar"))
        self.assertEqual(mesh.metadata(update)["recipient"], "omar")

    def test_dynamic_schema_for_one_two_three(self):
        self.assertEqual(mesh.output_schema([])["properties"]["handoffs"]["maxItems"], 0)
        self.assertEqual(mesh.output_schema(["sara"])["properties"]["handoffs"]["items"]["properties"]["to"]["enum"], ["auto", "sara"])
        schema = mesh.output_schema(["sara", "ramy"])
        self.assertEqual(schema["properties"]["handoffs"]["maxItems"], 2)

    def test_validate_handoff_active_and_inactive(self):
        obj = {"summary": "Done", "status": "done", "handoffs": [
            {"to": "sara", "subject": "UI", "body": "Render a meter"}]}
        self.assertEqual(mesh.validate_output(obj, "ali", ["sara"]), obj)
        with self.assertRaises(ValueError):
            mesh.validate_output(obj, "ali", ["ramy"])
        with self.assertRaises(ValueError):
            mesh.validate_output(obj, "ali", [])

    def test_no_self_send_and_depth(self):
        with self.assertRaises(ValueError):
            mesh.render_issue_body("work", "ali", "invalid person")
        with self.assertRaises(ValueError):
            mesh.render_issue_body("work", "ali", "sara", 4)

    def test_forbidden_paths(self):
        for path in [".github/workflows/bot.yml", "mesh.py", ".env", "src/.env.production", "keys/private.pem"]:
            self.assertTrue(mesh.forbidden_path(path))
        for path in ["src/app.ts", "README.md", "tests/power.test.ts"]:
            self.assertFalse(mesh.forbidden_path(path))

    def test_mock_provider(self):
        with TemporaryDirectory() as root:
            result = mesh.run_agent("mock", "test", root, "plan")
            self.assertEqual(result["status"], "done")
            self.assertFalse((Path(root) / ".mesh-agent-result.json").exists())


class TestPresenceRouting(unittest.TestCase):
    def setUp(self):
        self.gh = MemoryGitHub()
        self.gh.labels()

    def test_two_three_new_or_returning_participants(self):
        self.gh.register("ali", "simulation")
        self.gh.register("sara", "frontend")
        self.assertEqual(len(mesh.online_agents(self.gh.presence())), 2)
        self.gh.register("omar", "testing")
        self.assertEqual(len(mesh.online_agents(self.gh.presence())), 3)
        self.gh.offline("sara")
        self.assertEqual(set(mesh.online_agents(self.gh.presence())), {"ali", "omar"})
        self.gh.register("sara", "frontend")
        self.assertEqual(len(mesh.online_agents(self.gh.presence())), 3)

    def test_expired_heartbeat_offline(self):
        number = self.gh.register("ali", "simulation")
        stale = mesh.utcnow() - dt.timedelta(seconds=mesh.PRESENCE_TTL_SECONDS + 30)
        self.gh.issues[number]["body"] = mesh.presence_body("ali", "Ali", "mock", "simulation", timestamp=stale)
        self.assertFalse(self.gh.presence()["ali"]["online"])

    def test_auto_routing_lowest_load(self):
        self.gh.register("ali")
        self.gh.register("sara")
        first = self.gh.send("human", "auto", "One", "Work on something")
        second = self.gh.send("human", "auto", "Two", "Work on next thing")
        self.assertEqual(mesh.metadata(first["body"])["recipient"], "ali")
        self.assertEqual(mesh.metadata(second["body"])["recipient"], "sara")

    def test_skill_matching(self):
        self.gh.register("ali", "simulation")
        self.gh.register("sara", "frontend,design")
        self.gh.register("omar", "testing")
        task = self.gh.send("human", "auto", "UI", "Build UI", capability="frontend")
        self.assertEqual(mesh.metadata(task["body"])["recipient"], "sara")
        with self.assertRaisesRegex(ValueError, "No online agent"):
            self.gh.send("human", "auto", "Missing skill", "Need astrodynamics", capability="astrodynamics")

    def test_offline_explicit_send_requires_opt_in(self):
        self.gh.register("ali")
        self.gh.offline("ali")
        with self.assertRaisesRegex(ValueError, "offline"):
            self.gh.send("human", "ali", "Do task", "Please work")
        waiting = self.gh.send("human", "ali", "Do task", "Please work", allow_offline=True)
        self.assertFalse(mesh.metadata(waiting["body"])["auto_route"])

    def test_offline_agent_automatically_reassigns_queued_work(self):
        self.gh.register("ali")
        self.gh.register("sara")
        issue = self.gh.send("human", "auto", "Science", "Work on simulation")
        self.assertEqual(mesh.metadata(issue["body"])["recipient"], "ali")
        self.gh.offline("ali")
        self.assertEqual(mesh.reconcile_queued(self.gh), 1)
        updated = self.gh.issue(issue["number"])
        self.assertEqual(mesh.metadata(updated["body"])["recipient"], "sara")
        self.assertEqual(len(self.gh.find("sara")), 1)
        self.assertEqual(len(self.gh.find("ali")), 0)

    def test_offline_explicit_task_stays_with_owner(self):
        self.gh.register("ali")
        self.gh.register("sara")
        issue = self.gh.send("human", "ali", "Specific", "Ali only")
        self.gh.offline("ali")
        self.assertEqual(mesh.reconcile_queued(self.gh), 0)
        self.assertEqual(mesh.metadata(self.gh.issue(issue["number"])["body"])["recipient"], "ali")

    def test_no_recipient_stays_queued(self):
        self.gh.register("ali")
        issue = self.gh.send("human", "auto", "One", "Do something")
        self.gh.offline("ali")
        self.assertEqual(mesh.reconcile_queued(self.gh), 0)
        self.assertEqual(len(self.gh.find("ali")), 1)

    def test_handoff_auto_reply_between_two_dynamic_agents(self):
        self.gh.register("ali", "simulation")
        self.gh.register("sara", "frontend")
        first = self.gh.send("human", "ali", "Power", "Implement power model")
        with TemporaryDirectory() as root:
            with patch.object(mesh, "run_agent", return_value={
                "summary": "Need UI", "status": "done",
                "handoffs": [{"to": "sara", "subject": "Dashboard", "body": "Show battery Wh"}]}):
                self.assertTrue(mesh.handle_one(self.gh, "ali", "mock", root, "plan"))
            with patch.object(mesh, "run_agent", return_value={
                "summary": "Use energyWh:number", "status": "done", "handoffs": []}):
                self.assertTrue(mesh.handle_one(self.gh, "sara", "mock", root, "plan"))
            self.assertIn("energyWh", self.gh.all_comments[first["number"]][-1]["body"])
            self.assertEqual(len(self.gh.find("ali")), 1)

    def test_single_agent_no_handoffs_allowed(self):
        self.gh.register("ali")
        issue = self.gh.send("human", "auto", "Task", "Plan it")
        with TemporaryDirectory() as root:
            def answer(provider, prompt, cwd, mode, output_schema):
                self.assertEqual(output_schema["properties"]["handoffs"]["maxItems"], 0)
                self.assertIn("online teammates: none", prompt.lower())
                return {"summary": "Solo task complete", "status": "done", "handoffs": []}
            with patch.object(mesh, "run_agent", side_effect=answer):
                self.assertTrue(mesh.handle_one(self.gh, "ali", "mock", root, "plan"))
            self.assertEqual(len(self.gh.find("ali", "done")), 1)


if __name__ == "__main__":
    unittest.main()