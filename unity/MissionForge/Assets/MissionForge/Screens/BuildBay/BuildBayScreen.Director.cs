using System;
using System.Collections;
using System.Collections.Generic;
using MissionForge.App;
using MissionForge.Core.Build;
using MissionForge.Core.Random;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.UIElements;

namespace MissionForge.Screens.BuildBay
{
    /// <summary>
    /// BuildBayDirector (T015 step 5): runs the PART vote rounds of the contract in Core's order. For each round:
    /// <c>VoteOptions.NextVote</c> › <c>VoteOptions.For</c> › <c>vote.open</c> (options with Core's "if chosen"
    /// deltas) › the server's stages, tallies, tags, vetoes and pings are rendered › on <c>vote.result</c> the host
    /// applies the winner with <c>VoteOptions.Commit</c> and sends <c>vote.commit</c> and <c>build.state</c> › the part
    /// is assembled on the pad › next vote, until none remain; then the app moves on to the FRR through SceneFlow.
    /// </summary>
    public sealed partial class BuildBayScreen
    {
        /// <summary>Pause after the last part before moving on to the Flight Readiness Review, s (game_value).</summary>
        private const float HandOverDelaySeconds = 5f;
        /// <summary>Longest a round may stay open before the host cancels and re-opens it, s (guards a lost server).</summary>
        private const float RoundTimeoutSeconds = 240f;

        private IBayVoteChannel _channel;
        private VotePanelView _votePanel;
        private readonly VoteRoundModel _round = new VoteRoundModel();
        private readonly Dictionary<string, VoteOption> _offered = new Dictionary<string, VoteOption>();
        private string _roundSlot;
        private string _roundId;
        private int _roundNumber;
        private Coroutine _loop;
        private string _ghostOption;

        public VoteRoundModel Round => _round;
        public IBayVoteChannel Channel => _channel;
        public string RoundSlot => _roundSlot;
        public IReadOnlyDictionary<string, VoteOption> Offered => _offered;

        /// <summary>True when the director should not hand over to the next screen after the last vote (evidence runs).</summary>
        public bool HoldAfterLastVote { get; set; }

        /// <summary>Raised when the winning part of a round has been committed: (slot, partId).</summary>
        public event Action<string, string> PartCommitted;

        private void BindDirector()
        {
            _votePanel = new VotePanelView(Screen, _text, this);
            BindTools();
            Session.Changed += OnSessionChangedForTools;
            _channel = CreateChannel();
            if (_channel != null) _channel.Received += OnServerMessage;
            Screen.Q<UnityEngine.UIElements.VisualElement>("rehearsal")?.EnableInClassList("bb-hidden", _channel == null || !_channel.IsRehearsal);
            UnityEngine.UIElements.Label title = Screen.Q<UnityEngine.UIElements.Label>("rehearsal-title");
            if (title != null) title.text = _text.Get("ui.buildbay.rehearsal").ToUpperInvariant();
            UnityEngine.UIElements.Label detail = Screen.Q<UnityEngine.UIElements.Label>("rehearsal-detail");
            if (detail != null) detail.text = _text.Get("ui.buildbay.rehearsal.detail");
            _votePanel.ShowIdle(Session.NextVote == null);
            if (_channel != null && !Flag("-mfNoDirector")) _loop = StartCoroutine(RunRounds());
        }

        private void ExitDirector()
        {
            if (_loop != null) StopCoroutine(_loop);
            if (Session != null) Session.Changed -= OnSessionChangedForTools;
            if (stage != null) stage.Unbind();
            if (_channel != null)
            {
                _channel.Received -= OnServerMessage;
                _channel.Dispose();
                _channel = null;
            }
        }

        private IBayVoteChannel CreateChannel()
        {
            var client = App?.Room?.Client;
            bool online = client != null && !string.IsNullOrEmpty(client.RoomCode) && !Flag("-mfRehearsal");
            if (online) return new RoomVoteChannel(client);
#if UNITY_EDITOR || MF_REHEARSAL
            float pace = float.TryParse(Argument("-mfRehearsalPace"), System.Globalization.NumberStyles.Float,
                System.Globalization.CultureInfo.InvariantCulture, out float p) ? p : 1f;
            return new RehearsalVoteChannel(Session.Build.Seed, pace)
            {
                HiddenTallies = Flag("-mfHiddenTallies"),
                Solo = Flag("-mfSolo"),
            };
#else
            return null; // shipped builds wait for a room; the vote panel shows the idle state
#endif
        }

        private void Update()
        {
            if (Session != null) UpdateTools();
            _channel?.Tick();
            if (_votePanel != null && _channel != null) _votePanel.Tick(_channel.ServerNowMs());
        }

        private IEnumerator RunRounds()
        {
            yield return new WaitForSecondsRealtime(1.5f);
            string lastSlot = null;
            int sameSlot = 0;
            while (true)
            {
                string slot = Session.NextVote;
                if (slot == null) break;
                sameSlot = slot == lastSlot ? sameSlot + 1 : 0;
                lastSlot = slot;
                if (sameSlot >= 3)
                {
                    // A slot that cannot be resolved (no options, Core rejecting every result) must not loop forever.
                    Debug.LogError("[MissionForge] Build Bay: vote '" + slot + "' could not be resolved after 3 rounds; the director stops.");
                    _votePanel.ShowIdle(false);
                    yield break;
                }
                yield return RunRound(slot);
                if (Session.NextVote == slot) yield return new WaitForSecondsRealtime(2f);
            }
            _votePanel.ShowIdle(true);
            SetLeadingPreview(null);
            if (HoldAfterLastVote || Flag("-mfBayShots")) yield break;
            yield return new WaitForSecondsRealtime(HandOverDelaySeconds);
            if (App != null && App.Flow != null && App.Flow.Phase == GamePhase.Build) App.Flow.GoToPhase(GamePhase.Frr);
        }

        private IEnumerator RunRound(string slot)
        {
            _roundNumber++;
            _roundSlot = slot;
            _roundId = "m" + (App != null ? App.MissionSeq : 0) + ".b" + _roundNumber + "." + slot.Substring(0, Math.Min(12, slot.Length));
            IReadOnlyList<VoteOption> options = VoteOptions.For(Session.Build, Session.Catalog, slot);
            _offered.Clear();
            foreach (VoteOption o in options) _offered[o.Part.Id] = o;
            if (options.Count < 2)
            {
                // A vote with a single option needs no round (design 6.2 votes need 3-5 options; data offers fewer here).
                if (options.Count == 1) yield return Apply(slot, options[0].Part.Id, null);
                yield break;
            }
            uint coin = (uint)(new SeededRandom(Session.Build.Seed).ForStream("tiebreak:" + _roundNumber).NextUInt64() & 0xFFFFFFFF);
            _channel.Send("vote.open", VoteMessages.Open(_roundId, slot, options, coin));

            float opened = Time.realtimeSinceStartup;
            while (_round.RoundId != _roundId || (_round.WinnerId == null && !_round.Cancelled))
            {
                if (Time.realtimeSinceStartup - opened > RoundTimeoutSeconds)
                {
                    _channel.Send("vote.cancel", new JObject { ["roundId"] = _roundId });
                    float sent = Time.realtimeSinceStartup;
                    while (!_round.Cancelled && _round.Stage != "CLOSED" && Time.realtimeSinceStartup - sent < 10f) yield return null;
                    yield break;
                }
                yield return null;
            }
            if (_round.Cancelled)
            {
                ClearGhost();
                yield return new WaitForSecondsRealtime(2f);
                yield break; // the loop re-opens the same slot
            }
            yield return Apply(slot, _round.WinnerId, _roundId);
            // Only one round may be active (§7): wait for the server's CLOSED before the next vote.open.
            float wait = Time.realtimeSinceStartup;
            while (_round.Stage != "CLOSED" && !_round.Cancelled && Time.realtimeSinceStartup - wait < 20f) yield return null;
        }

        private IEnumerator Apply(string slot, string winnerId, string roundId)
        {
            OptionPreview applied = _offered.TryGetValue(winnerId, out VoteOption won) ? won.Preview : null;
            try
            {
                Session.Commit(slot, winnerId); // Core: records the part, counts the vote, Emergency Funding if needed
            }
            catch (InvalidOperationException e)
            {
                Debug.LogError("[MissionForge] Build Bay: Core rejected the vote result " + winnerId + " for " + slot + ": " + e.Message);
                yield break;
            }
            ClearGhost();
            if (roundId != null) _channel.Send("vote.commit", VoteMessages.Commit(roundId, winnerId, applied));
            _channel.Send("build.state", VoteMessages.BuildState(Session.Build, Session.Catalog, Session.Metrics));
            PartCommitted?.Invoke(slot, winnerId);
            if (stage != null) yield return stage.WaitForAssembly();
        }

        private void OnServerMessage(string type, JObject data)
        {
            if (!_round.Apply(type, data)) return;
            _votePanel.Show(_round, _channel);
            UpdateLeading();
        }

        /// <summary>Leading option (open tallies only) › dashboard "if chosen" deltas and the ghost on the pad.</summary>
        private void UpdateLeading()
        {
            string leading = _round.IsOpen && _round.Kind == "PART" && _round.WinnerId == null ? _round.LeadingOptionId : null;
            if (leading == _ghostOption) return;
            _ghostOption = leading;
            if (leading != null && _offered.TryGetValue(leading, out VoteOption o))
            {
                SetLeadingPreview(o.Preview.Delta);
                if (stage != null) stage.ShowGhost(_roundSlot, leading);
            }
            else
            {
                ClearGhost();
            }
        }

        private void OnSessionChangedForTools(BuildState previous, BuildState current) => StartCoroutine(RebuildTagsNextFrame());

        private IEnumerator RebuildTagsNextFrame()
        {
            yield return null;
            if (_active.Contains(Tool.Compare)) { _compareKey = null; RefreshCompareIfLeadChanged(); }
            RebuildTags();
        }

        private void ClearGhost()
        {
            _ghostOption = null;
            if (LeadingDelta != null) SetLeadingPreview(null);
            if (stage != null) stage.ShowGhost(null, null);
        }
    }
}
