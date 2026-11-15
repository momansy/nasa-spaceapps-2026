using System;
using System.Linq;
using MissionForge.Net;
using Newtonsoft.Json.Linq;
using NUnit.Framework;

namespace MissionForge.Settings.Tests
{
    public sealed class HostPreferencesTests
    {
        [Test]
        public void Changes_PersistAndReloadFromTheStore()
        {
            var store = new MemoryPreferenceStore();
            var prefs = new HostPreferences(store)
            {
                MasterVolume = 0.4f,
                MusicVolume = 0.25f,
                EffectsVolume = 0.5f,
                VoiceVolume = 0.75f,
                Subtitles = false,
                HighContrast = true,
                ReducedMotion = true,
                TextScalePercent = 200,
                Language = "ar",
            };

            var reloaded = new HostPreferences(store);

            Assert.That(reloaded.MasterVolume, Is.EqualTo(0.4f).Within(1e-6));
            Assert.That(reloaded.MusicVolume, Is.EqualTo(0.25f).Within(1e-6));
            Assert.That(reloaded.EffectsVolume, Is.EqualTo(0.5f).Within(1e-6));
            Assert.That(reloaded.VoiceVolume, Is.EqualTo(0.75f).Within(1e-6));
            Assert.That(reloaded.Subtitles, Is.False);
            Assert.That(reloaded.HighContrast, Is.True);
            Assert.That(reloaded.ReducedMotion, Is.True);
            Assert.That(reloaded.TextScalePercent, Is.EqualTo(200));
            Assert.That(reloaded.Language, Is.EqualTo("ar"));
            Assert.That(reloaded.RightToLeft, Is.True);
            Assert.That(reloaded.LargeText, Is.True);
            Assert.That(store.SaveCount, Is.GreaterThan(0));
            Assert.That(prefs.IsDefault, Is.False);
        }

        [Test]
        public void Values_AreClampedAndValidated()
        {
            var prefs = new HostPreferences(new MemoryPreferenceStore())
            {
                MasterVolume = 3f,
                MusicVolume = -1f,
                EffectsVolume = float.NaN,
                TextScalePercent = 450,
                Language = "xx",
            };

            Assert.That(prefs.MasterVolume, Is.EqualTo(1f));
            Assert.That(prefs.MusicVolume, Is.EqualTo(0f));
            Assert.That(prefs.EffectsVolume, Is.EqualTo(0f));
            Assert.That(prefs.TextScalePercent, Is.EqualTo(HostPreferences.MaxTextScalePercent));
            Assert.That(prefs.Language, Is.EqualTo("en"));
            prefs.TextScalePercent = 10;
            Assert.That(prefs.TextScalePercent, Is.EqualTo(HostPreferences.MinTextScalePercent));
            Assert.That(prefs.LargeText, Is.False);
        }

        [Test]
        public void EveryChange_RaisesChangedOnce_AndNoChangeRaisesNothing()
        {
            var prefs = new HostPreferences(new MemoryPreferenceStore());
            int raised = 0;
            prefs.Changed += _ => raised++;

            prefs.HighContrast = true;
            prefs.HighContrast = true;
            prefs.Language = "fr";
            prefs.ResetToDefaults();

            Assert.That(raised, Is.EqualTo(3));
            Assert.That(prefs.IsDefault, Is.True);
        }

        [Test]
        public void Defaults_AreSubtitlesOnAndLeftToRight()
        {
            var prefs = new HostPreferences(new MemoryPreferenceStore());
            Assert.That(prefs.IsDefault, Is.True);
            Assert.That(prefs.Subtitles, Is.True);
            Assert.That(prefs.RightToLeft, Is.False);
            Assert.That(prefs.TextScalePercent, Is.EqualTo(100));
        }
    }

    public sealed class SettingsPatchTests
    {
        private static readonly string[] A11yFields = { "slowTimers", "relaxedMinigames", "reducedMotion", "highContrast", "subtitles", "explainTooltips" };

        [Test]
        public void A11yPatch_CarriesAllSixFlagsAndNothingElse()
        {
            var current = new RoomA11yDto { Subtitles = true, ExplainTooltips = true };

            JObject d = RoomSettingsPatches.Payload(RoomSettingsPatches.A11y(current, RoomA11yFlag.SlowTimers, true));

            var settings = (JObject)d["settings"];
            Assert.That(settings.Properties().Select(p => p.Name), Is.EqualTo(new[] { "a11y" }));
            var a11y = (JObject)settings["a11y"];
            Assert.That(a11y.Properties().Select(p => p.Name), Is.EquivalentTo(A11yFields));
            Assert.That((bool)a11y["slowTimers"], Is.True);
            Assert.That((bool)a11y["subtitles"], Is.True);
            Assert.That((bool)a11y["explainTooltips"], Is.True);
            Assert.That((bool)a11y["highContrast"], Is.False);
        }

        [Test]
        public void A11yPatch_DoesNotChangeTheCurrentState()
        {
            var current = new RoomA11yDto();
            RoomSettingsPatches.A11y(current, RoomA11yFlag.HighContrast, true);
            Assert.That(current.HighContrast, Is.False);
        }

        [Test]
        public void A11yPatch_WithoutKnownState_UsesProtocolDefaults()
        {
            JObject d = RoomSettingsPatches.Payload(RoomSettingsPatches.A11y(null, RoomA11yFlag.ReducedMotion, true));
            Assert.That((bool)d["settings"]["a11y"]["reducedMotion"], Is.True);
            Assert.That((bool)d["settings"]["a11y"]["subtitles"], Is.True);
        }

        [Test]
        public void LobbyPatches_HaveOneFieldEach()
        {
            Assert.That(Fields(RoomSettingsPatches.AssistLevel("FLIGHT_DIRECTOR")), Is.EqualTo(new[] { "assistLevel" }));
            Assert.That(Fields(RoomSettingsPatches.VoteTimer(30)), Is.EqualTo(new[] { "voteTimerS" }));
            Assert.That(Fields(RoomSettingsPatches.Tally("HIDDEN")), Is.EqualTo(new[] { "tallyVisibility" }));
            Assert.That(Fields(RoomSettingsPatches.Language("ar")), Is.EqualTo(new[] { "lang" }));
            Assert.That((int)RoomSettingsPatches.Payload(RoomSettingsPatches.VoteTimer(30))["settings"]["voteTimerS"], Is.EqualTo(30));
        }

        [Test]
        public void LobbyPatches_RejectValuesOutsideTheProtocol()
        {
            Assert.Throws<ArgumentOutOfRangeException>(() => RoomSettingsPatches.VoteTimer(5));
            Assert.Throws<ArgumentOutOfRangeException>(() => RoomSettingsPatches.VoteTimer(61));
            Assert.Throws<ArgumentException>(() => RoomSettingsPatches.AssistLevel("EASY"));
            Assert.Throws<ArgumentException>(() => RoomSettingsPatches.Tally("SOMETIMES"));
        }

        private static string[] Fields(SettingsPatchDto patch) =>
            ((JObject)RoomSettingsPatches.Payload(patch)["settings"]).Properties().Select(p => p.Name).ToArray();
    }
}
