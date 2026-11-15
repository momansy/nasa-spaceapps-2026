using System.Collections.Generic;

namespace MissionForge.EndScreens.Sources
{
    /// <summary>
    /// Hand-over point between the live session and the end screens. A live flight puts its <see cref="DebriefRecord"/> here
    /// when the mission ends; when nothing is pending the end screens run on rehearsal fixtures (and say so).
    /// The fail-forward flow leaves the retry hand-off here for the Build Bay.
    /// </summary>
    public static class EndScreenSession
    {
        /// <summary>The record of the mission that just ended, or null (rehearsal).</summary>
        public static DebriefRecord PendingDebrief { get; set; }

        /// <summary>Fixture id the rehearsal starts with (-mfDebriefFixture overrides it).</summary>
        public static string RehearsalFixture { get; set; } = "c1_success";

        /// <summary>The last debrief shown, so the replay, investigation and Codex can follow it.</summary>
        public static DebriefView LastDebrief { get; set; }

        /// <summary>The live flight's recording and failure trace for the instant replay (null: no replay for a live failure).</summary>
        public static LiveReplayData LiveReplay { get; set; }

        /// <summary>Retry hand-off written by the fail-forward flow (null when there is none).</summary>
        public static RetryHandoff Retry { get; set; }

        /// <summary>Codex entry the next Codex opening should show (the investigation reveal links to its lesson).</summary>
        public static string CodexFocus { get; set; }

        /// <summary>Codex entry ids unlocked during this session (from codex.unlock and the fail-forward reveal).</summary>
        public static readonly HashSet<string> UnlockedCodex = new HashSet<string>();
    }

    /// <summary>What a live flight hands to the replay: a T016 FlightRecording JSON and the failure trace JSON (fixture shape).</summary>
    public sealed class LiveReplayData
    {
        public LiveReplayData(string recordingJson, string failureJson)
        {
            RecordingJson = recordingJson;
            FailureJson = failureJson;
        }

        public string RecordingJson { get; }
        public string FailureJson { get; }
    }

    /// <summary>What the Build Bay needs to rebuild after an investigation (design 9.9.4).</summary>
    public sealed class RetryHandoff
    {
        public RetryHandoff(string contractId, string failureModeId, string failedSlot, string lessonId, IReadOnlyList<string> buildFlags)
        {
            ContractId = contractId;
            FailureModeId = failureModeId;
            FailedSlot = failedSlot;
            LessonId = lessonId;
            BuildFlags = buildFlags;
        }

        public string ContractId { get; }
        public string FailureModeId { get; }
        public string FailedSlot { get; }
        public string LessonId { get; }
        /// <summary>Build flags of the lesson (risk_cleared:…, free_test:…), from Core LessonsLearned.</summary>
        public IReadOnlyList<string> BuildFlags { get; }
    }
}
