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

        /// <summary>Raised once the screen is bound and running (evidence tooling waits for it).</summary>
        public event Action Ready;

        protected abstract void OnReady();
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
