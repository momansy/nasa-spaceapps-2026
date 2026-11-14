#nullable enable
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using MissionForge.Core.Data;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace MissionForge.Core.Session
{
    /// <summary>Entry kinds of the replay log (design 17.6).</summary>
    public static class ReplayKinds
    {
        /// <summary>A vote result.</summary>
        public const string VoteResult = "vote_result";
        /// <summary>A build action.</summary>
        public const string BuildAction = "build_action";
        /// <summary>A pilot input sample.</summary>
        public const string PilotInput = "pilot_input";
        /// <summary>A pilot action.</summary>
        public const string PilotAction = "pilot_action";
        /// <summary>A minigame summary.</summary>
        public const string MgSummary = "mg_summary";
        /// <summary>A callout.</summary>
        public const string Callout = "callout";
        /// <summary>An abort.</summary>
        public const string Abort = "abort";
        /// <summary>A Mission Control Moment choice.</summary>
        public const string McmChoice = "mcm_choice";
        /// <summary>A phase change.</summary>
        public const string Phase = "phase";

        /// <summary>Every known kind.</summary>
        public static readonly IReadOnlyList<string> All = new[]
        {
            VoteResult, BuildAction, PilotInput, PilotAction, MgSummary, Callout, Abort, McmChoice, Phase,
        };
    }

    /// <summary>Header of a replay log: what is needed to replay it (design 17.6).</summary>
    public sealed class ReplayHeader
    {
        /// <summary>Creates a header.</summary>
        public ReplayHeader(ulong seed, string contractId, string mode, string assistLevel, string dataHash)
        { Seed = seed; ContractId = contractId; Mode = mode; AssistLevel = assistLevel; DataHash = dataHash; }
        /// <summary>Session seed.</summary>
        public ulong Seed { get; }
        /// <summary>Contract flown.</summary>
        public string ContractId { get; }
        /// <summary>Game mode token.</summary>
        public string Mode { get; }
        /// <summary>Assist level id.</summary>
        public string AssistLevel { get; }
        /// <summary>Hash of the game data, supplied by the caller (Core does no I/O).</summary>
        public string DataHash { get; }
    }

    /// <summary>One replay entry.</summary>
    public sealed class ReplayEntry
    {
        /// <summary>Creates an entry.</summary>
        public ReplayEntry(int seq, int tick, string kind, string payloadJson) { Seq = seq; Tick = tick; Kind = kind; PayloadJson = payloadJson; }
        /// <summary>Sequence number, 1-based, strictly increasing.</summary>
        public int Seq { get; }
        /// <summary>Flight tick at 120 Hz; -1 outside flight. Never decreases once flight has begun.</summary>
        public int Tick { get; }
        /// <summary>Entry kind (<see cref="ReplayKinds"/>).</summary>
        public string Kind { get; }
        /// <summary>Payload as JSON text, kept verbatim.</summary>
        public string PayloadJson { get; }
    }

    /// <summary>A parsed replay log.</summary>
    public sealed class ReplayLog
    {
        /// <summary>Format version written to the header.</summary>
        public const int Version = 1;

        /// <summary>Creates a log.</summary>
        public ReplayLog(ReplayHeader header, IReadOnlyList<ReplayEntry> entries) { Header = header; Entries = entries; }
        /// <summary>The header.</summary>
        public ReplayHeader Header { get; }
        /// <summary>The entries in order.</summary>
        public IReadOnlyList<ReplayEntry> Entries { get; }

        /// <summary>
        /// Serializes the log in its canonical form: no whitespace, fixed field order, the seed as a decimal string, the payload as a JSON
        /// string. Because the form is canonical, <c>Parse(json).ToJson()</c> equals <c>json</c> byte for byte.
        /// </summary>
        public string ToJson()
        {
            var sb = new System.Text.StringBuilder();
            using (var sw = new StringWriter(sb, CultureInfo.InvariantCulture))
            using (var w = new JsonTextWriter(sw) { Formatting = Formatting.None })
            {
                w.WriteStartObject();
                w.WritePropertyName("version"); w.WriteValue(Version);
                w.WritePropertyName("seed"); w.WriteValue(Header.Seed.ToString(CultureInfo.InvariantCulture));
                w.WritePropertyName("contract"); w.WriteValue(Header.ContractId);
                w.WritePropertyName("mode"); w.WriteValue(Header.Mode);
                w.WritePropertyName("assist"); w.WriteValue(Header.AssistLevel);
                w.WritePropertyName("dataHash"); w.WriteValue(Header.DataHash);
                w.WritePropertyName("entries");
                w.WriteStartArray();
                foreach (var e in Entries)
                {
                    w.WriteStartObject();
                    w.WritePropertyName("seq"); w.WriteValue(e.Seq);
                    w.WritePropertyName("tick"); w.WriteValue(e.Tick);
                    w.WritePropertyName("kind"); w.WriteValue(e.Kind);
                    w.WritePropertyName("payload"); w.WriteValue(e.PayloadJson);
                    w.WriteEndObject();
                }
                w.WriteEndArray();
                w.WriteEndObject();
            }
            return sb.ToString();
        }

        /// <summary>Parses a log written by <see cref="ToJson"/> and checks its rules (known kinds, Seq strictly increasing, Tick never decreasing).</summary>
        /// <exception cref="CatalogException">Malformed or invalid log.</exception>
        public static ReplayLog Parse(string json)
        {
            if (json == null) throw new ArgumentNullException(nameof(json));
            JObject root;
            try { root = JObject.Parse(json); }
            catch (Exception e) { throw new CatalogException("replay log: malformed JSON: " + e.Message, e); }
            try
            {
                if (root["version"]?.Value<int>() != Version) throw new CatalogException("replay log: unsupported version");
                var header = new ReplayHeader(
                    ulong.Parse(root["seed"]!.Value<string>()!, CultureInfo.InvariantCulture),
                    root["contract"]!.Value<string>()!, root["mode"]!.Value<string>()!,
                    root["assist"]!.Value<string>()!, root["dataHash"]!.Value<string>()!);
                var entries = new List<ReplayEntry>();
                int lastSeq = 0, lastTick = int.MinValue;
                foreach (var e in (JArray)root["entries"]!)
                {
                    var entry = new ReplayEntry(e["seq"]!.Value<int>(), e["tick"]!.Value<int>(), e["kind"]!.Value<string>()!, e["payload"]!.Value<string>()!);
                    Check(entry, lastSeq, lastTick);
                    lastSeq = entry.Seq;
                    lastTick = Math.Max(lastTick, entry.Tick);
                    entries.Add(entry);
                }
                return new ReplayLog(header, entries);
            }
            catch (CatalogException) { throw; }
            catch (Exception e) { throw new CatalogException("replay log: invalid structure: " + e.Message, e); }
        }

        private static readonly HashSet<string> KnownKinds = new HashSet<string>(ReplayKinds.All, StringComparer.Ordinal);

        internal static void Check(ReplayEntry entry, int lastSeq, int lastTick)
        {
            if (!KnownKinds.Contains(entry.Kind))
                throw new CatalogException("replay log: unknown kind '" + entry.Kind + "'");
            if (entry.Seq <= lastSeq) throw new CatalogException("replay log: seq " + entry.Seq + " does not increase");
            if (entry.Tick < -1) throw new CatalogException("replay log: tick " + entry.Tick + " is below -1");
            // Decision: -1 marks entries outside flight and may appear at any time; flight ticks (>= 0) never decrease.
            if (entry.Tick >= 0 && lastTick >= 0 && entry.Tick < lastTick)
                throw new CatalogException("replay log: tick " + entry.Tick + " goes back from " + lastTick);
        }
    }

    /// <summary>Builds a replay log entry by entry (design 17.6).</summary>
    public sealed class ReplayLogWriter
    {
        private readonly List<ReplayEntry> _entries = new List<ReplayEntry>();
        private int _lastFlightTick = -1;

        /// <summary>Creates a writer.</summary>
        public ReplayLogWriter(ReplayHeader header) { Header = header ?? throw new ArgumentNullException(nameof(header)); }

        /// <summary>The header.</summary>
        public ReplayHeader Header { get; }

        /// <summary>Entries written so far.</summary>
        public IReadOnlyList<ReplayEntry> Entries => _entries;

        /// <summary>Appends an entry; Seq is assigned (previous + 1).</summary>
        /// <param name="kind">One of <see cref="ReplayKinds"/>.</param>
        /// <param name="tick">120 Hz flight tick, -1 outside flight; flight ticks never decrease.</param>
        /// <param name="payloadJson">Payload JSON text, stored verbatim.</param>
        /// <exception cref="ArgumentException">Unknown kind or a tick that goes back.</exception>
        public ReplayEntry Append(string kind, int tick, string payloadJson)
        {
            if (payloadJson == null) throw new ArgumentNullException(nameof(payloadJson));
            var entry = new ReplayEntry(_entries.Count + 1, tick, kind, payloadJson);
            try { ReplayLog.Check(entry, _entries.Count, _lastFlightTick); }
            catch (CatalogException e) { throw new ArgumentException(e.Message, nameof(kind)); }
            if (tick >= 0) _lastFlightTick = tick;
            _entries.Add(entry);
            return entry;
        }

        /// <summary>Serializes the log (see <see cref="ReplayLog.ToJson"/>).</summary>
        public string ToJson() => new ReplayLog(Header, _entries).ToJson();
    }
}
