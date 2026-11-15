using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using MissionForge.App;
using MissionForge.EndScreens.Sources;
using MissionForge.Screens.Codex;
using MissionForge.Screens.Campaign;
using MissionForge.Screens.Debrief;
using MissionForge.Settings;
using MissionForge.UI;
using UnityEngine;

namespace MissionForge.EndScreens.Evidence
{
    public sealed partial class EndScreensEvidence
    {
        /// <summary>Evidence states after the Debrief (settings, Codex, campaign hub, replay, investigation).</summary>
        private IEnumerable<Func<IEnumerator>> MoreSteps()
        {
            if (MissionForge.Screens.Debrief.CommandLine.Flag("-mfEndRetryPass"))
            {
                yield return FailForwardShots;
                yield break;
            }
            yield return SettingsShots;
            yield return CodexShots;
            yield return CampaignShots;
        }

        private IEnumerator OpenOverlay(ScreenId id)
        {
            yield return new WaitUntil(() => !_flow.IsBusy);
            if (!_flow.OpenOverlay(id)) Log("could not open overlay " + id);
            yield return new WaitUntil(() => !_flow.IsBusy && _flow.Overlay != null);
            yield return new WaitForSecondsRealtime(1.5f);
        }

        private IEnumerator CloseOverlay()
        {
            yield return new WaitUntil(() => !_flow.IsBusy);
            _flow.CloseOverlay();
            yield return new WaitUntil(() => !_flow.IsBusy && _flow.Overlay == null);
            yield return new WaitForSecondsRealtime(0.8f);
        }

        /// <summary>C1 success: debrief → campaign hub (design 17.3), then the hub's frame times. Runs last (the hub leaves the debrief).</summary>
        private IEnumerator CampaignShots()
        {
            DebriefScreen debrief = FindAnyObjectByType<DebriefScreen>();
            debrief.ShowFixture("c1_success");
            yield return new WaitForSecondsRealtime(0.5f);
            yield return new WaitUntil(() => !_flow.IsBusy);
            if (!_flow.GoToPhase(GamePhase.CampaignHub)) Log("could not go to the campaign hub");
            yield return new WaitUntil(() => !_flow.IsBusy && _flow.Current != null && _flow.Current.Id == ScreenId.CampaignHub);
            CampaignHubScreen hub = FindAnyObjectByType<CampaignHubScreen>();
            yield return new WaitUntil(() => hub.View != null);
            yield return new WaitForSecondsRealtime(2f);
            yield return Shot("campaign_hub");
            hub.Buy("methalox");
            yield return new WaitForSecondsRealtime(SettleSeconds);
            yield return Shot("campaign_hub_after_research");
            MfAccessibility.Set(true, true, false, true);
            yield return new WaitForSecondsRealtime(SettleSeconds);
            yield return Shot("campaign_hub_200_rtl");
            MfAccessibility.Set(false, false, true, false);
            yield return new WaitForSecondsRealtime(SettleSeconds);
            yield return Shot("campaign_hub_high_contrast");
            MfAccessibility.Set(false, false, false, false);
            yield return new WaitForSecondsRealtime(SettleSeconds);
            yield return Fps("campaign hub");
        }

        /// <summary>C1 failure: debrief → replay → investigation → lessons → retry hand-off to the Build Bay (separate pass).</summary>
        private IEnumerator FailForwardShots()
        {
            DebriefScreen debrief = FindAnyObjectByType<DebriefScreen>();
            debrief.ShowFixture("c1_failure_pogo");
            yield return new WaitForSecondsRealtime(CountUpSeconds);
            yield return Shot("flow_1_debrief_failure");
            debrief.OpenReplay();
            yield return new WaitForSecondsRealtime(14f);
            yield return Shot("replay_frame");
            Log("replay at T+" + debrief.Replay.Time.ToString("0.0") + " s");
            debrief.OpenInvestigation();
            yield return new WaitForSecondsRealtime(17f);
            yield return Shot("investigation_mid_vote");
            MfAccessibility.Set(true, true, false, false);
            yield return new WaitForSecondsRealtime(0.6f);
            yield return Shot("investigation_200_rtl");
            MfAccessibility.Set(false, false, false, false);
            Log("investigation mid-vote: chain " + string.Join(",", debrief.InvestigationRun.State.Chain) + ", votes " + string.Join(",", debrief.InvestigationRun.State.VoteCounts));
            yield return new WaitUntil(() => debrief.InvestigationRun.State.Locked);
            yield return new WaitForSecondsRealtime(1.5f);
            yield return Shot("investigation_reveal_lesson");
            Log("mg.summary " + debrief.InvestigationRun.LastSummary.ToString(Newtonsoft.Json.Formatting.None));
            Log("messages: " + string.Join(", ", debrief.InvestigationRun.Outbox.GroupBy(m => m.Key).Select(g => g.Key + " ×" + g.Count())));
            debrief.StartRetry();
            Log("retry hand-off: " + EndScreenSession.Retry.ContractId + " " + EndScreenSession.Retry.LessonId + " [" + string.Join(", ", EndScreenSession.Retry.BuildFlags) + "]");
            yield return new WaitUntil(() => !_flow.IsBusy && _flow.Current != null && _flow.Current.Id == ScreenId.BuildBay);
            yield return new WaitForSecondsRealtime(4f);
            yield return Shot("flow_retry_build_bay");
            Log("retry reached " + _flow.Current.Id);
        }

        private IEnumerator CodexShots()
        {
            yield return OpenOverlay(ScreenId.Codex);
            CodexScreen codex = FindAnyObjectByType<CodexScreen>();
            yield return new WaitUntil(() => codex.Source != null);
            codex.SetImperial(false);
            codex.SelectCategory(CodexCategory.Physics, "physics.atmosphere");
            yield return new WaitForSecondsRealtime(SettleSeconds);
            yield return Shot("codex_list_physics");
            codex.SelectCategory(CodexCategory.Parts, "part.eng_kerolox_workhorse");
            codex.SetImperial(true);
            yield return new WaitForSecondsRealtime(SettleSeconds);
            yield return Shot("codex_entry_part_imperial");
            codex.SetImperial(false);
            codex.SelectCategory(CodexCategory.Lessons, CodexSource.LessonId("pogo_oscillation"));
            yield return new WaitForSecondsRealtime(SettleSeconds);
            yield return Shot("codex_entry_lesson");
            codex.SelectCategory(CodexCategory.Lessons, CodexSource.LessonId("cryogenic_leak"));
            yield return new WaitForSecondsRealtime(SettleSeconds);
            yield return Shot("codex_entry_locked");
            MfAccessibility.Set(true, true, false, false);
            codex.SelectCategory(CodexCategory.Facts, "fact.F01");
            yield return new WaitForSecondsRealtime(SettleSeconds);
            yield return Shot("codex_200_rtl");
            MfAccessibility.Set(false, false, true, false);
            yield return new WaitForSecondsRealtime(SettleSeconds);
            yield return Shot("codex_high_contrast");
            MfAccessibility.Set(false, false, false, false);
            yield return CloseOverlay();
        }

        private IEnumerator SettingsShots()
        {
            HostPreferences prefs = HostPreferences.Current;
            prefs.ResetToDefaults();
            yield return OpenOverlay(ScreenId.Settings);
            yield return Shot("settings_100");

            prefs.TextScalePercent = 200;
            prefs.Language = "ar";
            yield return new WaitForSecondsRealtime(SettleSeconds);
            yield return Shot("settings_200_rtl");

            prefs.ResetToDefaults();
            prefs.HighContrast = true;
            yield return new WaitForSecondsRealtime(SettleSeconds);
            yield return Shot("settings_high_contrast");

            prefs.ResetToDefaults();
            yield return CloseOverlay();
        }
    }
}
