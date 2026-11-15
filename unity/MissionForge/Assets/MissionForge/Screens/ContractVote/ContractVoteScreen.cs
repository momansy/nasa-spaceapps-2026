using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using MissionForge.App;
using MissionForge.Core.Data;
using MissionForge.Screens.BuildBay;
using MissionForge.Screens.Preflight;
using MissionForge.UI;
using UnityEngine;
using UnityEngine.UIElements;

namespace MissionForge.Screens.ContractVote
{
    /// <summary>
    /// Controller of <c>MF_ContractVote</c> (design 14.1 #4, T027 step 4). Opens a CONTRACT vote (CHOICE profile with
    /// INSPECT) over the 2–3 offered contracts and renders the server's <c>vote.*</c> stream: cards with the briefing facts
    /// and a difficulty marker, tallies (or hidden), timer, voters, runoff / tiebreak stages, coin flip. On
    /// <c>vote.result</c>: the "contract awarded" reveal with the winner's objectives, <c>vote.commit</c>,
    /// <see cref="PreflightEvents.ContractChosen"/>, then BUILD. A host-locked contract skips the vote. Solo rooms vote
    /// like any room (the server resolves a solo round on the first pick, protocol section 7).
    /// </summary>
    public sealed class ContractVoteScreen : PreflightScreen
    {
        /// <summary>How long the award reveal stays before the Build Bay opens, s (game_value editorial pacing).</summary>
        public const float AwardHoldSeconds = 6f;
        /// <summary>Wait after the screen opens before the first round, s (lets phase.set arrive first; game_value).</summary>
        public const float PhaseSettleSeconds = 0.75f;

        private VisualElement _voteHost;
        private VisualElement _award;
        private ChoiceVotePanel _panel;
        private readonly Dictionary<string, ContractBriefing> _briefs = new Dictionary<string, ContractBriefing>();
        private readonly List<ContractDef> _offered = new List<ContractDef>();
        private float _awardAt = -1f;
        private bool _handedOver;

        /// <summary>Contract the team chose (null until the vote resolves).</summary>
        public string AwardedId { get; private set; }
        public bool IsVoting => _panel != null && AwardedId == null;

        protected override void OnReady()
        {
            _voteHost = Screen.Q<VisualElement>("pf-vote-host");
            _award = Screen.Q<VisualElement>("pf-award");
            PfUi.Show(_award, false);
            BuildKicker();
            BuildRehearsalTag();

            IReadOnlyList<string> ids = ContractOffer.Resolve(out bool locked);
            foreach (string id in ids)
            {
                if (!Catalog.Contracts.TryGetValue(id, out ContractDef def)) continue;
                _offered.Add(def);
                _briefs[id] = ContractBriefing.From(def, Text);
            }
            if (_offered.Count == 0)
            {
                Debug.LogError("[MissionForge] Contract Vote: no offered contract exists in the catalog.");
                return;
            }
            if (Session == null && !locked)
            {
                Debug.LogError("[MissionForge] Contract Vote: no room is open and no contract is locked.");
                return;
            }
            if (locked || _offered.Count == 1)
            {
                Award(_offered[0].Id, Text.Get("ui.host.contract.locked"));
                return;
            }
            _ = RunVoteAsync();
        }

        protected override void OnTick()
        {
            if (_panel != null && Session != null && AwardedId == null)
                _panel.Refresh(Session.Round, Session.Channel.Seats, Session.SecondsLeft, Session.ServerNowMs, A11y.ReducedMotion);
            if (_awardAt >= 0f && !_handedOver && Time.unscaledTime - _awardAt >= AwardHoldSeconds) HandOver();
        }

        private async Task RunVoteAsync()
        {
            _panel = new ChoiceVotePanel(Text, CardBody);
            _voteHost.Add(_panel);
            // Let the app's phase.set CONTRACT_VOTE reach the room first: a round opened before it is cancelled with
            // PHASE_CHANGE (seen against the real server). game_value.
            float settle = Time.unscaledTime + PhaseSettleSeconds;
            while (Session != null && Time.unscaledTime < settle) await Task.Yield();
            if (Session == null) return;
            string winner;
            try
            {
                winner = await DecideAsync("contract", id => PreflightVotes.Contract(id, _offered, (uint)(MissionContext.Seed & 0xffffffff)), null);
            }
            catch (Exception e)
            {
                Debug.LogError("[MissionForge] Contract Vote failed: " + e);
                return;
            }
            if (Session == null) return; // screen left
            if (winner == null)
            {
                // Every round was cancelled or rejected: the first offer stands (decision, game_value), clearly labelled.
                Award(_offered[0].Id, Text.Get("ui.buildbay.vote.cancelled"));
                return;
            }
            _panel.Refresh(Session.Round, Session.Channel.Seats, null, Session.ServerNowMs, A11y.ReducedMotion);
            Award(winner, Text.Format("ui.host.contract.awarded_by", Text.Method(Session.Round.Method)));
        }

        /// <summary>Card body: destination, payload, difficulty, the three key facts with units and the primary (and crew-safety) objective.</summary>
        private VisualElement CardBody(OptionState option, VoteRoundModel round)
        {
            if (!_briefs.TryGetValue(option.Id, out ContractBriefing b)) return null;
            VisualElement body = PfUi.El("pf-contract");
            body.Add(PfUi.Lbl(b.Destination, "pf-contract__dest"));
            if (!string.IsNullOrEmpty(b.Payload)) body.Add(PfUi.Lbl(b.Payload, "pf-meta"));
            body.Add(ContractViews.Difficulty(b.Difficulty, Text));
            body.Add(ContractViews.Facts(b));
            foreach (BriefingObjective o in b.Objectives)
            {
                if (o.Kind != "primary" && o.Kind != "safety") continue;
                body.Add(ContractViews.Objective(o, Text));
            }
            return body;
        }

        /// <summary>The "contract awarded" reveal with the winner's objectives and constraints.</summary>
        private void Award(string contractId, string how)
        {
            if (AwardedId != null) return;
            AwardedId = contractId;
            MissionContext.ContractId = contractId;
            PreflightEvents.RaiseContractChosen(contractId);
            if (!_briefs.TryGetValue(contractId, out ContractBriefing b) && Catalog.Contracts.TryGetValue(contractId, out ContractDef def))
                b = ContractBriefing.From(def, Text);
            if (b == null) return;

            _award.Clear();
            var panel = new MfGlassPanel();
            panel.AddToClassList("mf-glass");
            panel.AddToClassList("pf-award__panel");
            VisualElement head = PfUi.El("pf-award__head");
            var icon = new MfIcon { kind = "award" };
            icon.AddToClassList("pf-award__icon");
            head.Add(icon);
            VisualElement headText = PfUi.El("pf-award__headtext");
            headText.Add(PfUi.Lbl(Text.Get("ui.host.contract.awarded"), "pf-award__kicker"));
            headText.Add(PfUi.Lbl(b.Name, "pf-title"));
            headText.Add(PfUi.Lbl(b.Destination, "pf-subtitle"));
            headText.Add(PfUi.Lbl(how, "pf-meta"));
            head.Add(headText);
            panel.Add(head);

            VisualElement cols = PfUi.El("pf-award__cols");
            VisualElement left = PfUi.El("pf-award__col");
            left.Add(ContractViews.Facts(b));
            left.Add(ContractViews.Difficulty(b.Difficulty, Text));
            foreach (string rule in b.SpecialRules) left.Add(PfUi.Lbl(rule, "pf-rule"));
            VisualElement right = PfUi.El("pf-award__col");
            VisualElement obj = PfUi.El("pf-section");
            obj.Add(PfUi.Lbl(Text.Get("ui.host.briefing.objectives"), "pf-section__title"));
            foreach (BriefingObjective o in b.Objectives) obj.Add(ContractViews.Objective(o, Text));
            right.Add(obj);
            VisualElement cons = PfUi.El("pf-section");
            cons.Add(PfUi.Lbl(Text.Get("ui.host.briefing.constraints"), "pf-section__title"));
            foreach (string c in b.Constraints) cons.Add(ContractViews.Constraint(c));
            right.Add(cons);
            cols.Add(left);
            cols.Add(right);
            panel.Add(cols);

            VisualElement actions = PfUi.El("pf-award__actions");
            Button go = PfUi.Btn(Text.Get("ui.host.contract.to_build"), "primary", HandOver);
            actions.Add(go);
            panel.Add(actions);
            _award.Add(panel);
            PfUi.Show(_award, true);
            PfUi.Show(_voteHost, false);
            if (!A11y.ReducedMotion) MfMotion.Enter(panel);
            go.Focus();
            _awardAt = Time.unscaledTime;
        }

        private void HandOver()
        {
            if (_handedOver || AwardedId == null) return;
            _handedOver = true;
            if (App?.Flow != null) _ = NavigateAsync(() => App != null && App.Flow.GoToPhase(GamePhase.Build));
        }

        private void BuildKicker()
        {
            VisualElement kicker = Screen.Q<VisualElement>("pf-kicker-host");
            kicker.Clear();
            VisualElement row = PfUi.El("pf-kicker");
            row.Add(PfUi.Lbl(Text.Get("ui.host.contract.lifecycle"), "pf-lifecycle"));
            kicker.Add(row);
        }

        private void BuildRehearsalTag()
        {
            VisualElement host = Screen.Q<VisualElement>("pf-rehearsal-host");
            host.Clear();
#if UNITY_EDITOR || MF_REHEARSAL
            if (IsRehearsal) host.Add(PfUi.RehearsalBanner(Text, Text.Get("ui.host.contract.rehearsal")));
#endif
        }
    }
}
