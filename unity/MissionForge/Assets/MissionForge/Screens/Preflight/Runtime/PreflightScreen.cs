using System;
using System.Collections;
using MissionForge.App;
using MissionForge.Core.Data;
using MissionForge.Screens.BuildBay;
using UnityEngine;

namespace MissionForge.Screens.Preflight
{
    /// <summary>
    /// Base of the five pre-flight screen controllers (T027): waits for the game data, parses it with Core, builds the text,
    /// accessibility state and the <see cref="PreflightSession"/> (the room, or the rehearsal driver in the editor and
    /// development builds), ticks the session every frame and hands over to <see cref="OnReady"/>.
    /// </summary>
    public abstract class PreflightScreen : ScreenController
    {
        private const float DataTimeoutSeconds = 20f;
        private Coroutine _boot;

        protected GameCatalog Catalog { get; private set; }
        protected PreflightText Text { get; private set; }
        protected PreflightA11y A11y { get; } = new PreflightA11y();
        protected PreflightSession Session { get; private set; }
        protected bool IsReady { get; private set; }

        /// <summary>True while the screen is fed by the rehearsal driver instead of the room server.</summary>
        protected bool IsRehearsal => Session != null && Session.Channel.IsRehearsal;

        /// <summary>The current vote round as the server reported it (read-only view for evidence and tests).</summary>
        public VoteRoundModel CurrentRound => Session?.Round;

        /// <summary>The current GO/NO-GO poll as the server reported it.</summary>
        public PollModel CurrentPoll => Session?.Poll;

        public bool IsBound => IsReady;

        /// <summary>Raised once the screen is bound and running (evidence tooling waits for it).</summary>
        public event Action Ready;

        /// <summary>A cancelled or rejected round is reopened at most this many times (game_value).</summary>
        public const int MaxReopens = 2;

        protected abstract void OnReady();

        /// <summary>
        /// Runs one vote the protocol way: opens a round with a fresh id, renders through <paramref name="panel"/>, and on
        /// <c>vote.result</c> sends <c>vote.commit</c> and returns the winner. A cancelled or rejected round is never committed:
        /// it is reopened up to <see cref="MaxReopens"/> times, then <paramref name="fallback"/> is applied without a vote.
        /// Fewer than <see cref="PreflightSession.MinOptions"/> options: no vote, the only option is the decision.
        /// Returns null when the screen closed meanwhile.
        /// </summary>
        protected async System.Threading.Tasks.Task<string> DecideAsync(string prefix, Func<string, Newtonsoft.Json.Linq.JObject> open, string fallback)
        {
            for (int attempt = 0; attempt <= MaxReopens; attempt++)
            {
                if (Session == null) return null;
                string roundId = PreflightSession.NewId(prefix);
                Newtonsoft.Json.Linq.JObject payload = open(roundId);
                var options = payload["options"] as Newtonsoft.Json.Linq.JArray;
                if (options == null || options.Count < PreflightSession.MinOptions)
                    return options != null && options.Count == 1 ? (string)options[0]["id"] : fallback;
                VoteOutcome o = await Session.RunVoteAsync(payload);
                if (Session == null) return null;
                if (o.Cancelled || string.IsNullOrEmpty(o.WinnerId))
                {
                    Debug.LogWarning("[MissionForge] " + ScreenId + ": vote " + roundId + " ended without a result (" + o.CancelReason + "); reopening.");
                    continue;
                }
                Session.Commit(roundId, o.WinnerId);
                return o.WinnerId;
            }
            return fallback;
        }

        /// <summary>Navigates once the flow is free (a busy flow refuses; retried every frame for up to 10 s).</summary>
        protected async System.Threading.Tasks.Task<bool> NavigateAsync(Func<bool> go)
        {
            float until = Time.realtimeSinceStartup + 10f;
            while (Time.realtimeSinceStartup < until)
            {
                if (go()) return true;
                await System.Threading.Tasks.Task.Yield();
            }
            Debug.LogError("[MissionForge] " + ScreenId + ": the scene flow refused to move on.");
            return false;
        }

        /// <summary>Announces this screen's phase / sub-state to the phones (protocol section 6); no-op in rehearsal.</summary>
        protected void AnnouncePhase(string phase, string sub, string review)
        {
            if (Session == null || IsRehearsal || App == null) return;
            Session.SetPhase(App.MissionSeq, phase, sub, review, MissionContext.ContractId);
        }
        protected virtual void OnTick() { }
        protected virtual void OnClose() { }

        protected override void OnEnter()
        {
            _boot = StartCoroutine(Boot());
        }

        protected override void OnExit()
        {
            if (_boot != null) StopCoroutine(_boot);
            IsReady = false;
            OnClose();
            Session?.Dispose();
            Session = null;
            A11y.Changed -= ApplyA11y;
        }

        private IEnumerator Boot()
        {
            float deadline = Time.realtimeSinceStartup + DataTimeoutSeconds;
            while ((App == null || App.Data == null || !App.Data.IsReady) && Time.realtimeSinceStartup < deadline) yield return null;
            if (App == null || App.Data == null || !App.Data.IsReady)
            {
                Debug.LogError("[MissionForge] " + ScreenId + ": game data did not load (" + (App?.Data?.LastError ?? "no data service") + ").");
                yield break;
            }

            try
            {
                Catalog = CatalogCache.Get(App.Data.Data);
            }
            catch (CatalogException e)
            {
                Debug.LogError("[MissionForge] " + ScreenId + ": catalog rejected by Core: " + e.Message);
                yield break;
            }

            Text = PreflightText.From(Catalog.Strings);
            string seedArg = PreflightArgs.Value("-mfSeed"); // demos and evidence: another seeded rehearsal session
            if (seedArg != null && ulong.TryParse(seedArg, out ulong seed)) MissionContext.Seed = seed;
            IPreflightChannel channel = CreateChannel();
            if (channel != null) Session = new PreflightSession(channel);
            A11y.ApplyCommandLine();
            A11y.FromRoom(channel?.Settings);
            A11y.Changed += ApplyA11y;
            ApplyA11y();
            IsReady = true;
            OnReady();
            Ready?.Invoke();
        }

        protected void ApplyA11y() => A11y.ApplyTo(Screen);

        private IPreflightChannel CreateChannel()
        {
            var client = App?.Room?.Client;
            bool online = client != null && !string.IsNullOrEmpty(client.RoomCode) && !PreflightArgs.Flag("-mfRehearsal");
            if (online) return new RoomPreflightChannel(client);
#if UNITY_EDITOR || MF_REHEARSAL
            return CreateRehearsalChannel();
#else
            return null; // shipped builds wait for a room
#endif
        }

#if UNITY_EDITOR || MF_REHEARSAL
        /// <summary>Rehearsal channel for this screen: seeded, 1 / 4 / 10 players (<c>-mfPlayers</c>), paced (<c>-mfRehearsalPace</c>).</summary>
        protected virtual IPreflightChannel CreateRehearsalChannel()
        {
            int players = (int)PreflightArgs.Float("-mfPlayers", 4);
            return new PreflightRehearsalChannel(MissionContext.Seed, players, PreflightArgs.Float("-mfRehearsalPace", 1f))
            {
                HiddenTallies = PreflightArgs.Flag("-mfHiddenTallies"),
                NoGoRounds = (int)PreflightArgs.Float("-mfNoGoRounds", 1),
                LeanOptionId = PreflightArgs.Value("-mfRehearsalLean"),
            };
        }
#endif

        private void Update()
        {
            if (!IsReady) return;
            Session?.Tick();
            OnTick();
        }
    }
}
