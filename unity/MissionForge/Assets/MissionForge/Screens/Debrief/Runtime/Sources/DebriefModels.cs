using System;
using System.Collections.Generic;

namespace MissionForge.EndScreens.Sources
{
    /// <summary>A player at the debrief: identity for the avatar badge, nothing personal beyond the chosen nickname.</summary>
    public sealed class DebriefPlayer
    {
        public DebriefPlayer(string id, string nickname, string avatarId, IReadOnlyList<string> roles)
        {
            Id = id ?? throw new ArgumentNullException(nameof(id));
            Nickname = nickname ?? id;
            AvatarId = avatarId ?? "";
            Roles = roles ?? Array.Empty<string>();
        }

        public string Id { get; }
        public string Nickname { get; }
        public string AvatarId { get; }
        public IReadOnlyList<string> Roles { get; }
    }

    /// <summary>One additive term of the design 11.3 score formula, in points (game_value, computed by Core).</summary>
    public sealed class ScoreTermView
    {
        public ScoreTermView(string termId, string nameKey, double points)
        {
            TermId = termId;
            NameKey = nameKey;
            Points = points;
        }

        /// <summary>scoring.json term group: objective_points, efficiency, safety_recovery, science_data, teamwork, knowledge.</summary>
        public string TermId { get; }
        /// <summary>String key, e.g. score.objective_points.name.</summary>
        public string NameKey { get; }
        public double Points { get; }
    }

    /// <summary>One objective: met or not, with its points before multipliers.</summary>
    public sealed class ObjectiveView
    {
        public ObjectiveView(string id, string kind, string textKey, bool met, double points)
        {
            Id = id;
            Kind = kind;
            TextKey = textKey;
            Met = met;
            Points = points;
        }

        public string Id { get; }
        /// <summary>PRIMARY, SECONDARY, STRETCH or SAFETY.</summary>
        public string Kind { get; }
        public string TextKey { get; }
        public bool Met { get; }
        public double Points { get; }
    }

    /// <summary>Kinds of mark on the mission timeline strip.</summary>
    public enum TimelineKind
    {
        Phase,
        Minigame,
        Boost,
        GoodCall,
        Anomaly,
        Failure,
    }

    /// <summary>A mark on the mission timeline: mission elapsed time in s, a label key and an optional tier id.</summary>
    public sealed class TimelineEventView
    {
        public TimelineEventView(double timeS, TimelineKind kind, string labelKey, string tierId)
        {
            TimeS = timeS;
            Kind = kind;
            LabelKey = labelKey;
            TierId = tierId;
        }

        /// <summary>Mission elapsed time, s (from the session record).</summary>
        public double TimeS { get; }
        public TimelineKind Kind { get; }
        public string LabelKey { get; }
        /// <summary>Minigame tier id (bronze..platinum) for minigame marks, else null.</summary>
        public string TierId { get; }
    }

    /// <summary>Awards of one player (positive only, at least one; Core AwardAssigner decides).</summary>
    public sealed class PlayerAwardsView
    {
        public PlayerAwardsView(DebriefPlayer player, IReadOnlyList<string> awardIds)
        {
            Player = player;
            AwardIds = awardIds ?? Array.Empty<string>();
        }

        public DebriefPlayer Player { get; }
        public IReadOnlyList<string> AwardIds { get; }
    }

    /// <summary>Verification status of a fact in data/facts.json.</summary>
    public enum FactStatus
    {
        Unverified,
        Verified,
        Rejected,
    }

    /// <summary>A fact the team collected, with its citation. Rejected facts never become views.</summary>
    public sealed class FactView
    {
        public FactView(string id, string topicKey, string textKey, string sourceKey, string sourceUrl, FactStatus status)
        {
            Id = id;
            TopicKey = topicKey;
            TextKey = textKey;
            SourceKey = sourceKey;
            SourceUrl = sourceUrl;
            Status = status;
        }

        public string Id { get; }
        public string TopicKey { get; }
        public string TextKey { get; }
        public string SourceKey { get; }
        public string SourceUrl { get; }
        public FactStatus Status { get; }
        /// <summary>True while the source is being checked: the UI shows the "source being checked" badge.</summary>
        public bool NeedsBadge => Status == FactStatus.Unverified;
    }

    /// <summary>Where and how the mission failed (null on a success).</summary>
    public sealed class FailureView
    {
        public FailureView(string failureModeId, string flightPhaseId, string slot, double atS)
        {
            FailureModeId = failureModeId;
            FlightPhaseId = flightPhaseId;
            Slot = slot;
            AtS = atS;
        }

        /// <summary>Value of the failure_mode enum (common.schema.json).</summary>
        public string FailureModeId { get; }
        /// <summary>Flight phase id (F0..F14).</summary>
        public string FlightPhaseId { get; }
        /// <summary>Build slot that failed, e.g. first_stage_engine.</summary>
        public string Slot { get; }
        /// <summary>Mission elapsed time of the failure, s.</summary>
        public double AtS { get; }
    }

    /// <summary>
    /// Everything the Debrief screen (14.1 screen 13) shows. Every number comes from Core (score, grade, awards) or from
    /// the session record (KP, timeline); the screen only formats.
    /// </summary>
    public sealed class DebriefView
    {
        public string FixtureId { get; set; } = "";
        public string ContractId { get; set; } = "";
        public string ContractNameKey { get; set; } = "";
        public string AssistLevelId { get; set; } = "engineer";
        /// <summary>Success, Partial or Failure (Core MissionOutcome name).</summary>
        public string Outcome { get; set; } = "Failure";
        public string Grade { get; set; } = "D";
        public string GradeTitleKey { get; set; } = "";
        /// <summary>Mission Score after multipliers, whole points.</summary>
        public int Total { get; set; }
        /// <summary>Sum of the additive terms before multipliers, points.</summary>
        public double Subtotal { get; set; }
        public IReadOnlyList<ScoreTermView> Terms { get; set; } = Array.Empty<ScoreTermView>();
        /// <summary>Difficulty multiplier, ×0.8–×1.25 (game_value).</summary>
        public double DifficultyMult { get; set; } = 1.0;
        /// <summary>Score boost multiplier, ×1.0–×1.5 (game_value).</summary>
        public double BoostMult { get; set; } = 1.0;
        public IReadOnlyList<ObjectiveView> Objectives { get; set; } = Array.Empty<ObjectiveView>();
        public IReadOnlyList<TimelineEventView> Timeline { get; set; } = Array.Empty<TimelineEventView>();
        /// <summary>Mission length for the timeline axis, s.</summary>
        public double MissionLengthS { get; set; }
        public IReadOnlyList<DebriefPlayer> Players { get; set; } = Array.Empty<DebriefPlayer>();
        public IReadOnlyList<PlayerAwardsView> Awards { get; set; } = Array.Empty<PlayerAwardsView>();
        public IReadOnlyList<FactView> Facts { get; set; } = Array.Empty<FactView>();
        /// <summary>Knowledge Points earned this mission, KP.</summary>
        public int KpEarned { get; set; }
        public bool Crewed { get; set; }
        public bool CapsuleRecovered { get; set; }
        public bool BoosterRecovered { get; set; }
        public FailureView Failure { get; set; }
        public bool RetryAvailable { get; set; }
        /// <summary>Session seed (deterministic investigation and award tie-breaks).</summary>
        public ulong Seed { get; set; }
        /// <summary>True when the data came from a rehearsal fixture rather than a live session.</summary>
        public bool IsRehearsal { get; set; }
    }

    /// <summary>Source of the Debrief screen.</summary>
    public interface IDebriefSource
    {
        /// <summary>True when the data is a rehearsal fixture (the screen shows the REHEARSAL label).</summary>
        bool IsRehearsal { get; }

        /// <summary>The debrief of the mission that just ended.</summary>
        DebriefView Load();
    }
}
