using System;
using System.Collections;
using System.IO;
using System.Text;
using MissionForge.App;
using MissionForge.Screens.Briefing;
using MissionForge.Screens.ContractVote;
using MissionForge.Screens.Review;
using MissionForge.UI;
using UnityEngine;

namespace MissionForge.Screens.Preflight.Evidence
{
    /// <summary>
    /// Desktop evidence pass for T027, inert unless the player starts with <c>-mfPreShots &lt;folder&gt; -mfPreScript &lt;name&gt;</c>.
    /// Walks the legal phase path (Title → Lobby → Briefing → Contract Vote → Build → FRR), lets the rehearsal driver feed the
    /// screens, writes one 1920 × 1080 PNG per state and a log with frame times, and quits. Never compiled for WebGL.
    /// Scripts: <c>briefing</c>, <c>contract</c>, <c>frr</c>, <c>frr_blocker</c>, <c>flow</c> (C1 Briefing → Countdown hand-off).
    /// Accessibility flags (<c>-mfRtl -mfText200 -mfHighContrast -mfReducedMotion</c>) and <c>-mfShotSuffix</c> name variants.
    /// </summary>
    public sealed class PreflightEvidence : MonoBehaviour
    {
        private const float StepTimeoutSeconds = 90f;
        private string _folder;
        private string _script;
        private string _suffix;
        private SceneFlow _flow;
        private readonly StringBuilder _log = new StringBuilder();

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void Boot()
        {
            if (Application.isEditor) return;
            string folder = PreflightArgs.Value("-mfPreShots");
            if (string.IsNullOrEmpty(folder)) return;
            SceneFlow flow = FindAnyObjectByType<SceneFlow>();
            if (flow == null) return;
            var go = new GameObject("T027 Evidence");
            DontDestroyOnLoad(go);
            var runner = go.AddComponent<PreflightEvidence>();
            runner._folder = Path.GetFullPath(folder);
            runner._script = PreflightArgs.Value("-mfPreScript") ?? "briefing";
            runner._suffix = PreflightArgs.Value("-mfShotSuffix") ?? "";
            runner._flow = flow;
        }

        private IEnumerator Start()
        {
            Directory.CreateDirectory(_folder);
            Log("Unity " + Application.unityVersion + ", " + SystemInfo.operatingSystem + ", " + SystemInfo.processorType + ", " + SystemInfo.graphicsDeviceName
                + ", screen " + Screen.width + " × " + Screen.height + ", script " + _script);
            bool a11y = PreflightArgs.Flag("-mfRtl") || PreflightArgs.Flag("-mfText200") || PreflightArgs.Flag("-mfHighContrast") || PreflightArgs.Flag("-mfReducedMotion");
            if (a11y) MfAccessibility.Set(PreflightArgs.Flag("-mfRtl"), PreflightArgs.Flag("-mfText200"), PreflightArgs.Flag("-mfHighContrast"), PreflightArgs.Flag("-mfReducedMotion"));
            yield return new WaitUntil(() => _flow.Current != null && !_flow.IsBusy);
            yield return new WaitForSecondsRealtime(1f);

            IEnumerator routine = null;
            switch (_script)
            {
                case "briefing": routine = BriefingShots(); break;
                case "contract": routine = ContractShots(); break;
                case "frr": routine = FrrShots(false); break;
                case "frr_blocker": routine = FrrShots(true); break;
                case "frr_rework": routine = FrrReworkShots(); break;
                case "flow": routine = Flow(); break;
                case "review": routine = ReviewShots(); break;
                case "test": routine = TestShots(); break;
                case "server": routine = ServerRun(); break;
                default: Log("unknown script " + _script); break;
            }
            if (routine != null) yield return Guard(routine);
            File.AppendAllText(Path.Combine(_folder, "evidence_log.txt"), _log.ToString() + "\n");
            yield return new WaitForSecondsRealtime(0.5f);
            Application.Quit(0);
        }

        // ------------------------------------------------------------------ scripts

        private IEnumerator BriefingShots()
        {
            yield return Go(GamePhase.Lobby);
            yield return Go(GamePhase.Briefing);
            BriefingScreen b = null;
            yield return Until(() => (b = FindAnyObjectByType<BriefingScreen>()) != null && b.IsBound, "briefing bound");
            if (PreflightArgs.Flag("-mfReducedMotion"))
            {
                yield return new WaitForSecondsRealtime(1.5f);
                yield return Shot("briefing_reduced_motion");
                yield break;
            }
            yield return new WaitForSecondsRealtime(4.0f);
            yield return Shot("briefing_frame1");
            yield return new WaitForSecondsRealtime(6.5f);
            yield return Shot("briefing_frame2");
            yield return Fps("briefing (C1 cinematic + UI)", 5f);
        }

        private IEnumerator ContractShots()
        {
            yield return Go(GamePhase.Lobby);
            yield return Go(GamePhase.Briefing);
            BriefingScreen b = null;
            yield return Until(() => (b = FindAnyObjectByType<BriefingScreen>()) != null && b.IsBound, "briefing bound");
            Log("briefing pages: " + string.Join(", ", b.PageContractIds));
            yield return new WaitForSecondsRealtime(1f);
            b.Skip();
            yield return new WaitForSecondsRealtime(0.5f);
            b.Skip();
            ContractVoteScreen c = null;
            yield return Until(() => (c = FindAnyObjectByType<ContractVoteScreen>()) != null && c.IsBound, "contract vote bound");
            yield return Until(() => c.CurrentRound?.Stage == "INSPECT", "INSPECT stage");
            yield return new WaitForSecondsRealtime(1.2f);
            yield return Shot("contract_inspect");
            yield return Until(() => c.CurrentRound?.Stage == "VOTE" && c.CurrentRound.VotedIds.Count >= 2, "VOTE with ballots");
            yield return new WaitForSecondsRealtime(1.5f);
            yield return Shot("contract_vote");
            yield return Until(() => c.AwardedId != null, "award");
            Log("awarded " + c.AwardedId + " by " + c.CurrentRound?.Method);
            yield return new WaitForSecondsRealtime(1.2f);
            yield return Shot("contract_award");
        }

        private IEnumerator FrrShots(bool blocker)
        {
            yield return WalkToFrr();
            FrrScreen f = null;
            yield return Until(() => (f = FindAnyObjectByType<FrrScreen>()) != null && f.IsBound, "FRR bound");
            if (blocker)
            {
                yield return new WaitForSecondsRealtime(1.5f);
                yield return Shot("frr_blocker_to_build");
                yield return Until(() => _flow.Phase == GamePhase.Build, "back to BUILD");
                Log("FRR forced Blocker returned to " + _flow.Phase + ", rework category " + MissionContext.ReworkCategory);
                yield break;
            }
            yield return Until(() => f.CurrentPoll != null && f.CurrentPoll.Answers.Count >= 2 && f.CurrentPoll.CalledPlayerId != null
                && f.CurrentPoll.CallEndsAtMs.HasValue, "mid-poll");
            yield return Shot("frr_mid_poll");
            yield return Until(() => f.Stage == "DISCUSS", "NO-GO discussion");
            yield return new WaitForSecondsRealtime(1.0f);
            yield return Shot("frr_nogo_discussion");
            yield return Until(() => f.Stage == "GO", "GO");
            yield return new WaitForSecondsRealtime(1.2f);
            yield return Shot("frr_go");
            foreach (string line in f.Outcomes) Log("FRR poll " + line);
            Log("FRR outcome " + f.LastOutcome + "; next phase after hold");
            yield return Until(() => _flow.Phase == GamePhase.Countdown, "COUNTDOWN hand-off");
            Log("phase now " + _flow.Phase);
        }

        /// <summary>
        /// Against the real room server: creates a room, writes room_code.txt for Tools~/phones.mjs, waits for the phones,
        /// then runs Briefing → Contract Vote (online) → Build → FRR (online poll) → Countdown. The Build Bay hook is not on
        /// main, so the runner hands the FRR a build (Core's seeded picker) the way the hook will (MissionContext.Build).
        /// </summary>
        private IEnumerator ServerRun()
        {
            AppRoot app = FindAnyObjectByType<AppRoot>();
            string serverUrl = PreflightArgs.Value("-mfServerUrl");
            if (serverUrl != null)
            {
                app.Room.Client.Disconnect();
                yield return new WaitForSecondsRealtime(0.5f);
                app.Room.Client.Connect(serverUrl);
            }
            else app.Room.ConnectIfNeeded();
            yield return new WaitForSecondsRealtime(2f);
            app.Room.Client.CreateRoom();
            yield return Until(() => !string.IsNullOrEmpty(app.Room.Client.RoomCode), "room created");
            string code = app.Room.Client.RoomCode;
            File.WriteAllText(Path.Combine(_folder, "room_code.txt"), code ?? "");
            Log("room " + code + " on " + (serverUrl ?? app.Room.ResolvedServerUrl));
            int want = (int)PreflightArgs.Float("-mfServerPlayers", 4);
            float until = Time.realtimeSinceStartup + 120f;
            while ((app.Room.Client.LastRoomState?.Players?.Count ?? 0) < want && Time.realtimeSinceStartup < until) yield return null;
            Log("players in room: " + (app.Room.Client.LastRoomState?.Players?.Count ?? 0));
            yield return Go(GamePhase.Lobby);
            yield return Go(GamePhase.Briefing);
            BriefingScreen b = null;
            yield return Until(() => (b = FindAnyObjectByType<BriefingScreen>()) != null && b.IsBound, "briefing bound");
            yield return new WaitForSecondsRealtime(2f);
            b.Skip();
            yield return new WaitForSecondsRealtime(0.4f);
            b.Skip();
            ContractVoteScreen c = null;
            yield return Until(() => (c = FindAnyObjectByType<ContractVoteScreen>()) != null && c.IsBound, "contract vote bound (online)");
            yield return Until(() => c.CurrentRound?.Stage == "VOTE" && c.CurrentRound.VotedIds.Count >= 2, "online VOTE with ballots");
            yield return new WaitForSecondsRealtime(0.8f);
            yield return Shot("server_contract_vote");
            yield return Until(() => c.AwardedId != null, "online award");
            Log("online contract " + c.AwardedId + " by " + c.CurrentRound?.Method + ", voters " + c.CurrentRound?.VoterCount);
            yield return Until(() => _flow.Phase == GamePhase.Build, "BUILD");
            yield return new WaitForSecondsRealtime(2f);
            var catalog = MissionForge.Screens.BuildBay.CatalogCache.Get(app.Data.Data);
            MissionContext.Build = RehearsalBuilds.Continue(MissionForge.Core.Build.BuildState.New(MissionContext.ContractId ?? "C1", MissionContext.Seed), catalog);
            Log("roles: " + (app.Room.Client.LastRolesState != null ? "assigned" : "none"));
            yield return Go(GamePhase.Frr);
            FrrScreen f = null;
            yield return Until(() => (f = FindAnyObjectByType<FrrScreen>()) != null && f.IsBound, "FRR bound (online)");
            yield return Until(() => f.CurrentPoll != null && f.CurrentPoll.Answers.Count >= 1 && f.CurrentPoll.CalledPlayerId != null, "online mid-poll");
            yield return Shot("server_frr_mid_poll");
            yield return Until(() => f.Stage == "DISCUSS" || f.Stage == "GO", "online poll result");
            if (f.Stage == "DISCUSS")
            {
                yield return new WaitForSecondsRealtime(1f);
                yield return Shot("server_frr_nogo_discussion");
            }
            yield return Until(() => f.Stage == "GO", "online GO");
            yield return new WaitForSecondsRealtime(1f);
            yield return Shot("server_frr_go");
            foreach (string line in f.Outcomes) Log("online FRR poll " + line);
            yield return Until(() => _flow.Phase == GamePhase.Countdown, "COUNTDOWN hand-off");
        }

        private IEnumerator TestShots()
        {
            foreach (GamePhase p in new[] { GamePhase.Lobby, GamePhase.Briefing, GamePhase.ContractVote, GamePhase.Build })
                yield return Go(p);
            yield return new WaitUntil(() => !_flow.IsBusy);
            Log("show TestStand: " + _flow.ShowWithinPhase(ScreenId.TestStand));
            MissionForge.Screens.TestStand.TestStandScreen t = null;
            yield return Until(() => (t = FindAnyObjectByType<MissionForge.Screens.TestStand.TestStandScreen>()) != null && t.IsBound, "test stand bound");
            string name = PreflightArgs.Value("-mfShotName") ?? "test";
            yield return Until(() => t.CurrentRound?.Stage == "VOTE" && t.CurrentRound.VotedIds.Count >= 2, "TEST vote");
            yield return new WaitForSecondsRealtime(0.6f);
            yield return Shot(name + "_vote");
            yield return Until(() => t.Stage == "RUNNING" || t.Stage == "SKIPPED", "vote decided");
            Log("test vote: " + t.Stage);
            if (t.Stage == "RUNNING")
            {
                yield return new WaitForSecondsRealtime(0.2f);
                yield return Fps("test cell running (" + name + ")", 1.3f);
                yield return Shot(name + "_cell");
                yield return Until(() => t.Stage == "RESULTS" || t.Stage.StartsWith("TEST_FAILURE") || t.Stage.StartsWith("RESPONDED") || t.Stage == "DONE", "results");
                yield return new WaitForSecondsRealtime(1.0f);
                yield return Shot(name + "_results");
                if (t.Outcome != null) Log("outcome: flaw " + t.Outcome.FlawRevealed + ", reveal chance " + t.Outcome.RevealChance + ", roll " + t.Outcome.Roll.ToString("F3"));
                if (t.Outcome != null && t.Outcome.FlawRevealed)
                {
                    yield return Until(() => t.Stage == "TEST_FAILURE" && t.CurrentRound?.Stage == "VOTE" && t.CurrentRound.VotedIds.Count >= 2, "Test Failure vote");
                    yield return new WaitForSecondsRealtime(0.6f);
                    yield return Shot(name + "_failure_vote");
                    yield return Until(() => t.Stage.StartsWith("RESPONDED"), "response");
                    Log("Test Failure response: " + t.Stage);
                }
            }
            yield return Until(() => _flow.Current != null && _flow.Current.Id == ScreenId.BuildBay, "back in the Build Bay");
        }

        private IEnumerator ReviewShots()
        {
            foreach (GamePhase p in new[] { GamePhase.Lobby, GamePhase.Briefing, GamePhase.ContractVote, GamePhase.Build })
                yield return Go(p);
            yield return new WaitUntil(() => !_flow.IsBusy);
            Log("show DesignReview: " + _flow.ShowWithinPhase(ScreenId.DesignReview));
            DesignReviewScreen r = null;
            yield return Until(() => (r = FindAnyObjectByType<DesignReviewScreen>()) != null && r.IsBound, "review bound");
            string kind = r.Kind.ToString().ToLowerInvariant();
            Log("review " + kind + ": " + r.Report.Blockers + " blockers, " + r.Report.Majors + " majors, " + r.Report.Minors + " minors, pass allowed " + r.Report.PassAllowed);
            foreach (var i in r.Report.Issues) Log("  issue " + i);
            yield return new WaitForSecondsRealtime(1.5f);
            yield return Shot("review_" + kind);
            yield return Until(() => r.Stage == "VOTE" && r.CurrentRound?.Stage == "VOTE" && r.CurrentRound.VotedIds.Count >= 2, "review vote");
            yield return new WaitForSecondsRealtime(0.8f);
            yield return Shot("review_" + kind + "_vote");
            yield return Until(() => r.Stage == "REWORK_CATEGORY" || r.Stage == "PASSED" || r.Stage == "REWORK", "review decision");
            if (r.Stage == "REWORK_CATEGORY")
            {
                yield return Until(() => r.CurrentRound?.Stage == "VOTE" && r.CurrentRound.VotedIds.Count >= 2, "rework category vote");
                yield return new WaitForSecondsRealtime(0.8f);
                yield return Shot("review_rework_vote");
            }
            yield return Until(() => r.Stage == "PASSED" || r.Stage == "REWORK", "review closed");
            yield return new WaitForSecondsRealtime(0.8f);
            yield return Shot("review_" + kind + "_outcome");
            Log("review closed: " + r.Stage + ", reopened " + MissionContext.ReworkCategory);
            yield return Until(() => _flow.Current != null && _flow.Current.Id == ScreenId.BuildBay, "back in the Build Bay");
        }

        /// <summary>Two NO-GO rounds: Core offers Rework; the REVIEW vote, the category vote, then BUILD (-mfNoGoRounds 2).</summary>
        private IEnumerator FrrReworkShots()
        {
            yield return WalkToFrr();
            FrrScreen f = null;
            yield return Until(() => (f = FindAnyObjectByType<FrrScreen>()) != null && f.IsBound, "FRR bound");
            yield return Until(() => f.Stage == "REWORK_OFFERED" && f.CurrentRound?.Stage == "VOTE" && f.CurrentRound.VotedIds.Count >= 2, "rework offered vote");
            yield return new WaitForSecondsRealtime(0.6f);
            yield return Shot("frr_rework_offered");
            yield return Until(() => f.Stage == "REWORK_CATEGORY" && f.CurrentRound?.Stage == "VOTE" && f.CurrentRound.VotedIds.Count >= 2, "rework category vote");
            yield return new WaitForSecondsRealtime(0.6f);
            yield return Shot("frr_rework_vote");
            yield return Until(() => _flow.Phase == GamePhase.Build, "back to BUILD");
            foreach (string line in f.Outcomes) Log("FRR poll " + line);
            Log("FRR rework returned to " + _flow.Phase + ", reopened " + MissionContext.ReworkCategory);
        }

        /// <summary>C1 rehearsal: Briefing → Contract Vote (C1 locked) → Build → FRR (NO-GO, re-poll, GO) → Countdown.</summary>
        private IEnumerator Flow()
        {
            yield return Go(GamePhase.Lobby);
            yield return Go(GamePhase.Briefing);
            BriefingScreen b = null;
            yield return Until(() => (b = FindAnyObjectByType<BriefingScreen>()) != null && b.IsBound, "briefing bound");
            b.Skip();
            yield return new WaitForSecondsRealtime(0.3f);
            b.Skip();
            yield return Until(() => _flow.Phase == GamePhase.ContractVote, "CONTRACT_VOTE");
            ContractVoteScreen c = null;
            yield return Until(() => (c = FindAnyObjectByType<ContractVoteScreen>()) != null && c.AwardedId != null, "contract awarded");
            Log("contract " + c.AwardedId);
            yield return Until(() => _flow.Phase == GamePhase.Build, "BUILD");
            yield return new WaitForSecondsRealtime(3f);
            foreach (string review in new[] { "PDR", "CDR" })
            {
                yield return new WaitUntil(() => !_flow.IsBusy);
                Log("show DesignReview (" + review + " expected): " + _flow.ShowWithinPhase(ScreenId.DesignReview));
                DesignReviewScreen r = null;
                yield return Until(() => (r = FindAnyObjectByType<DesignReviewScreen>()) != null && r.IsBound, review + " bound");
                Log(r.Kind + ": " + r.Report.Blockers + " blockers, " + r.Report.Majors + " majors, " + r.Report.Minors + " minors");
                yield return Until(() => r.Stage == "PASSED" || r.Stage == "REWORK", review + " closed");
                Log(r.Kind + " closed: " + r.Stage);
                yield return Until(() => _flow.Current != null && _flow.Current.Id == ScreenId.BuildBay && !_flow.IsBusy, "back in the Build Bay");
                yield return new WaitForSecondsRealtime(1f);
            }
            yield return Go(GamePhase.Frr);
            FrrScreen f = null;
            yield return Until(() => (f = FindAnyObjectByType<FrrScreen>()) != null && f.IsBound, "FRR bound");
            yield return Until(() => _flow.Phase == GamePhase.Countdown, "COUNTDOWN hand-off");
            foreach (string line in f.Outcomes) Log("FRR poll " + line);
            Log("flow reached " + _flow.Phase + " (FRR last outcome " + f.LastOutcome + ")");
        }

        private IEnumerator WalkToFrr()
        {
            foreach (GamePhase p in new[] { GamePhase.Lobby, GamePhase.Briefing, GamePhase.ContractVote, GamePhase.Build, GamePhase.Frr })
                yield return Go(p);
        }

        // ------------------------------------------------------------------ helpers

        private IEnumerator Go(GamePhase phase)
        {
            yield return new WaitUntil(() => !_flow.IsBusy);
            if (_flow.Phase == phase) yield break;
            bool ok = _flow.GoToPhase(phase);
            Log("go " + phase + (ok ? "" : " (refused)"));
            yield return new WaitUntil(() => !_flow.IsBusy);
            yield return new WaitForSecondsRealtime(0.4f);
        }

        private IEnumerator Until(Func<bool> condition, string what)
        {
            float until = Time.realtimeSinceStartup + StepTimeoutSeconds;
            while (!SafeCheck(condition) && Time.realtimeSinceStartup < until) yield return null;
            Log((SafeCheck(condition) ? "reached: " : "TIMEOUT: ") + what);
        }

        private static bool SafeCheck(Func<bool> c)
        {
            try { return c(); }
            catch { return false; }
        }

        private IEnumerator Shot(string name)
        {
            yield return new WaitForEndOfFrame();
            string path = Path.Combine(_folder, name + _suffix + ".png");
            ScreenCapture.CaptureScreenshot(path);
            yield return null;
            yield return new WaitForSecondsRealtime(0.4f);
            Log("shot " + path);
        }

        private IEnumerator Fps(string label, float seconds)
        {
            var frames = new System.Collections.Generic.List<float>();
            float end = Time.realtimeSinceStartup + seconds;
            while (Time.realtimeSinceStartup < end)
            {
                yield return null;
                frames.Add(Time.unscaledDeltaTime);
            }
            frames.Sort();
            float median = frames.Count > 0 ? frames[frames.Count / 2] : 0f;
            Log("fps " + label + ": median " + (median > 0 ? (1f / median).ToString("F1") : "n/a") + " fps over " + frames.Count + " frames");
        }

        private IEnumerator Guard(IEnumerator routine)
        {
            while (true)
            {
                object current;
                try
                {
                    if (!routine.MoveNext()) yield break;
                    current = routine.Current;
                }
                catch (Exception e)
                {
                    Log("step failed: " + e);
                    yield break;
                }
                yield return current;
            }
        }

        private void Log(string line)
        {
            _log.AppendLine(DateTime.UtcNow.ToString("HH:mm:ss.fff") + " " + line);
            Debug.Log("[MissionForge] T027 evidence: " + line);
        }
    }
}
