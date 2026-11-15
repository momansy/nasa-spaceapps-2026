using System;
using System.Collections.Generic;
using System.Globalization;

namespace MissionForge.EndScreens.Sources
{
    /// <summary>Codex categories of the T024 brief (design 12.2 Mission Codex, 8.3, 9.9).</summary>
    public enum CodexCategory
    {
        /// <summary>Physics and what the game simplifies (8.3).</summary>
        Physics,
        /// <summary>Parts with real-world twins.</summary>
        Parts,
        Facts,
        /// <summary>Lessons learned (9.9.3) with the real-world parallel.</summary>
        Lessons,
        Milestones,
        Minigames,
    }

    /// <summary>A number on a Codex entry in SI, with its imperial equivalent for the optional imperial display (14.4).</summary>
    public sealed class CodexStat
    {
        public CodexStat(string nameKey, double si, string siUnit, double imperial, string imperialUnit, int decimals)
        {
            NameKey = nameKey;
            Si = si;
            SiUnit = siUnit;
            Imperial = imperial;
            ImperialUnit = imperialUnit;
            Decimals = decimals;
        }

        public string NameKey { get; }
        public double Si { get; }
        public string SiUnit { get; }
        /// <summary>Same quantity in US customary units (exact conversion factors, physical); NaN when there is none (e.g. s).</summary>
        public double Imperial { get; }
        public string ImperialUnit { get; }
        public int Decimals { get; }
        public bool HasImperial => !double.IsNaN(Imperial) && !string.IsNullOrEmpty(ImperialUnit);

        public string SiText => Si.ToString("N" + Decimals, CultureInfo.InvariantCulture);
        public string ImperialText => Imperial.ToString("N" + Math.Max(0, Decimals), CultureInfo.InvariantCulture);
    }

    /// <summary>Exact unit conversion factors (physical; NIST SP 811).</summary>
    public static class UnitConversions
    {
        /// <summary>Pound-force per kilonewton (1 lbf = 4.448 221 615 260 5 N).</summary>
        public const double LbfPerKn = 1000.0 / 4.4482216152605;
        /// <summary>Pounds per tonne (1 lb = 0.453 592 37 kg).</summary>
        public const double LbPerTonne = 1000.0 / 0.45359237;
        public const double LbPerKg = 1.0 / 0.45359237;
        /// <summary>Feet per metre (1 ft = 0.3048 m).</summary>
        public const double FtPerM = 1.0 / 0.3048;
        /// <summary>Statute miles per kilometre (1 mi = 1.609 344 km).</summary>
        public const double MiPerKm = 1.0 / 1.609344;
        /// <summary>Feet per second per kilometre per second.</summary>
        public const double FtsPerKms = 1000.0 / 0.3048;
    }

    /// <summary>One Codex entry. Text comes from string keys; numbers and citations come from the data.</summary>
    public sealed class CodexEntryView
    {
        public string Id { get; set; } = "";
        public CodexCategory Category { get; set; }
        public string TitleKey { get; set; } = "";
        /// <summary>Second line under the title (a part's real-world twin, a fact's topic).</summary>
        public string SubtitleKey { get; set; }
        public string BodyKey { get; set; }
        /// <summary>Optional format arguments for <see cref="BodyKey"/>, each a string key.</summary>
        public IReadOnlyList<string> BodyArgKeys { get; set; } = Array.Empty<string>();
        /// <summary>"What the game simplifies" line (12.1.6), expected on physics entries.</summary>
        public string SimplificationKey { get; set; }
        public IReadOnlyList<string> StrengthKeys { get; set; } = Array.Empty<string>();
        public IReadOnlyList<string> DrawbackKeys { get; set; } = Array.Empty<string>();
        public IReadOnlyList<CodexStat> Stats { get; set; } = Array.Empty<CodexStat>();
        /// <summary>Cited facts (never rejected ones).</summary>
        public IReadOnlyList<FactView> Facts { get; set; } = Array.Empty<FactView>();
        /// <summary>True for entries about real tragedies: respectful tone, never a gameplay failure (12.1.5).</summary>
        public bool Sensitive { get; set; }
        public bool Unlocked { get; set; }
        /// <summary>String key saying how a locked entry unlocks.</summary>
        public string UnlockHintKey { get; set; } = "";
        /// <summary>Illustration path under Screens/Codex/Art, or null (the screen then draws the category glyph tile).</summary>
        public string Image { get; set; }
    }

    /// <summary>Source of the Codex screen.</summary>
    public interface ICodexSource
    {
        bool IsRehearsal { get; }
        IReadOnlyList<CodexEntryView> Entries { get; }
    }

    /// <summary>What the team has unlocked: entry ids (codex.unlock) plus the session facts that unlock synthesised entries.</summary>
    public sealed class CodexUnlocks
    {
        public HashSet<string> EntryIds { get; } = new HashSet<string>(StringComparer.Ordinal);
        public HashSet<string> Parts { get; } = new HashSet<string>(StringComparer.Ordinal);
        public HashSet<string> Facts { get; } = new HashSet<string>(StringComparer.Ordinal);
        public HashSet<string> FailureModes { get; } = new HashSet<string>(StringComparer.Ordinal);
        public HashSet<string> Minigames { get; } = new HashSet<string>(StringComparer.Ordinal);
        public HashSet<string> Milestones { get; } = new HashSet<string>(StringComparer.Ordinal);

        /// <summary>Adds what a debrief shows: its facts, minigames played and failure mode.</summary>
        public void AddDebrief(DebriefView view)
        {
            if (view == null) return;
            foreach (FactView f in view.Facts) Facts.Add(f.Id);
            foreach (TimelineEventView e in view.Timeline)
            {
                if (e.Kind == TimelineKind.Minigame && e.LabelKey.StartsWith("minigame.", StringComparison.Ordinal))
                {
                    string id = e.LabelKey.Substring("minigame.".Length);
                    int dot = id.IndexOf('.');
                    Minigames.Add(dot > 0 ? id.Substring(0, dot) : id);
                }
            }
            if (view.Failure != null) FailureModes.Add(view.Failure.FailureModeId);
        }
    }
}
