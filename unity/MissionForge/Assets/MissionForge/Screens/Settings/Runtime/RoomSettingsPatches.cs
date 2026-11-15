using System;
using MissionForge.Net;
using Newtonsoft.Json.Linq;

namespace MissionForge.Settings
{
    /// <summary>The six room-wide accessibility flags of RoomA11y (protocol settings.state, design 16).</summary>
    public enum RoomA11yFlag
    {
        SlowTimers,
        RelaxedMinigames,
        ReducedMotion,
        HighContrast,
        Subtitles,
        ExplainTooltips,
    }

    /// <summary>
    /// Builds <c>settings.set</c> patches. Only the changed fields are present; an a11y change always carries all six flags
    /// (the protocol replaces the whole RoomA11y object). Pure: no network, so the patch shape is unit-tested.
    /// </summary>
    public static class RoomSettingsPatches
    {
        /// <summary>Vote timer bounds of the protocol (VOTE stage), s.</summary>
        public const int MinVoteTimerS = 10;
        public const int MaxVoteTimerS = 60;
        /// <summary>Vote timer choices offered on the settings screen, s (game_value).</summary>
        public static readonly int[] VoteTimerOptions = { 10, 20, 30, 45, 60 };

        public static readonly string[] AssistLevels =
        {
            ProtocolNames.AssistLevels.Cadet, ProtocolNames.AssistLevels.Engineer, ProtocolNames.AssistLevels.FlightDirector,
        };

        public static readonly string[] TallyVisibilities = { ProtocolNames.TallyVisibilities.Open, ProtocolNames.TallyVisibilities.Hidden };

        public static bool Get(RoomA11yDto a11y, RoomA11yFlag flag)
        {
            if (a11y == null) return flag == RoomA11yFlag.Subtitles;
            switch (flag)
            {
                case RoomA11yFlag.SlowTimers: return a11y.SlowTimers;
                case RoomA11yFlag.RelaxedMinigames: return a11y.RelaxedMinigames;
                case RoomA11yFlag.ReducedMotion: return a11y.ReducedMotion;
                case RoomA11yFlag.HighContrast: return a11y.HighContrast;
                case RoomA11yFlag.Subtitles: return a11y.Subtitles;
                case RoomA11yFlag.ExplainTooltips: return a11y.ExplainTooltips;
                default: throw new ArgumentOutOfRangeException(nameof(flag));
            }
        }

        /// <summary>A patch that sets one flag and keeps the other five as they are in <paramref name="current"/>.</summary>
        public static SettingsPatchDto A11y(RoomA11yDto current, RoomA11yFlag flag, bool value)
        {
            var next = new RoomA11yDto
            {
                SlowTimers = Get(current, RoomA11yFlag.SlowTimers),
                RelaxedMinigames = Get(current, RoomA11yFlag.RelaxedMinigames),
                ReducedMotion = Get(current, RoomA11yFlag.ReducedMotion),
                HighContrast = Get(current, RoomA11yFlag.HighContrast),
                Subtitles = Get(current, RoomA11yFlag.Subtitles),
                ExplainTooltips = Get(current, RoomA11yFlag.ExplainTooltips),
            };
            switch (flag)
            {
                case RoomA11yFlag.SlowTimers: next.SlowTimers = value; break;
                case RoomA11yFlag.RelaxedMinigames: next.RelaxedMinigames = value; break;
                case RoomA11yFlag.ReducedMotion: next.ReducedMotion = value; break;
                case RoomA11yFlag.HighContrast: next.HighContrast = value; break;
                case RoomA11yFlag.Subtitles: next.Subtitles = value; break;
                case RoomA11yFlag.ExplainTooltips: next.ExplainTooltips = value; break;
            }
            return new SettingsPatchDto { A11y = next };
        }

        /// <summary>Assist level patch (lobby only; the server answers SETTING_LOCKED in another phase).</summary>
        public static SettingsPatchDto AssistLevel(string level)
        {
            if (Array.IndexOf(AssistLevels, level) < 0) throw new ArgumentException("unknown assist level '" + level + "'", nameof(level));
            return new SettingsPatchDto { AssistLevel = level };
        }

        /// <summary>Vote timer patch, s (10–60, the protocol range).</summary>
        public static SettingsPatchDto VoteTimer(int seconds)
        {
            if (seconds < MinVoteTimerS || seconds > MaxVoteTimerS) throw new ArgumentOutOfRangeException(nameof(seconds), seconds, "vote timer must be 10–60 s");
            return new SettingsPatchDto { VoteTimerS = seconds };
        }

        public static SettingsPatchDto Tally(string visibility)
        {
            if (Array.IndexOf(TallyVisibilities, visibility) < 0) throw new ArgumentException("unknown tally visibility '" + visibility + "'", nameof(visibility));
            return new SettingsPatchDto { TallyVisibility = visibility };
        }

        /// <summary>Host language patch (lang of RoomSettings), so phones can follow the host screen.</summary>
        public static SettingsPatchDto Language(string code) => new SettingsPatchDto { Lang = code };

        /// <summary>The <c>d</c> object of <c>settings.set</c> as sent by RoomClient.UpdateSettings.</summary>
        public static JObject Payload(SettingsPatchDto patch) =>
            new JObject { { ProtocolNames.Fields.Settings, JObject.FromObject(patch) } };
    }
}
