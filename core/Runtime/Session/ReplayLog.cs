#nullable enable
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace MissionForge.Core.Session
{
    /// <summary>Kinds of replay-log entries (design 17.6: inputs and vote results are logged so a mission can be replayed exactly).</summary>
    public static class ReplayKinds
    {
        /// <summary>A resolved vote (option chosen, tally).</summary>
        public const string VoteResult = "vote_result";
        /// <summary>A build action that changed the build (part chosen, test run, fix, rework).</summary>
        public const string BuildAction = "build_action";
        /// <summary>A sampled pilot input (throttle, pitch…).</summary>
        public const string PilotInput = "pilot_input";
        /// <summary>A discrete pilot action (stage, deploy, cutoff).</summary>
        public const string PilotAction = "pilot_action";
        /// <summary>A minigame summary (<c>mg.summary</c>).</summary>
        public const string MgSummary = "mg_summary";
        /// <summary>A console callout or Good Call.</summary>
        public const string Callout = "callout";
        /// <summary>An abort decision.</summary>
        public const string Abort = "abort";
        /// <summary>A Mission Control Moment choice.</summary>
        public const string McmChoice = "mcm_choice";
        /// <summary>A change of state-machine position (<c>phase.set</c>).</summary>
        public const string Phase = "phase";

        /// <summary>The nine kinds above.</summary>
        public static readonly IReadOnlyList<string> All = new[]
        {
            VoteResult, BuildAction, PilotInput, PilotAction, MgSummary, Callout, Abort, McmChoice, Phase,
        };

        /// <summary>True when the kind is one of <see cref="All"/>.</summary>
        public static bool IsKnown(string kind)
        {
            foreach (var k in All) if (k == kind) return true;
            return false;
        }
    }

    /// <summary>The header of a replay log: what is needed to start the same mission again (design 17.6).</summary>
    public sealed class ReplayHeader
    {
        /// <summary>Creates a header.</summary>
        /// <param name="seed">Session seed.</param>
        /// <param name="contractId">Contract flown.</param>
        /// <param name="mode">Game mode token.</param>
        /// <param name="assistLevelId">Assist level ID (<c>engineer</c>…).</param>
        /// <param name="dataHash">Hash of the game data the mission was played with, supplied by the caller (Core does no hashing or I/O).</param>
        public ReplayHeader(ulong seed, string contractId, string mode, string assistLevelId, string dataHash)
        {
            Seed = seed;
            ContractId = contractId ?? throw new ArgumentNullException(nameof(contractId));
            Mode = mode ?? throw new ArgumentNullException(nameof(mode));
            AssistLevelId = assistLevelId ?? throw new ArgumentNullException(nameof(assistLevelId));
            DataHash = dataHash ?? throw new ArgumentNullException(nameof(dataHash));
        }
        /// <summary>Session seed. Written as a decimal string so JavaScript readers do not lose precision above 2^53.</summary>
        public ulong Seed { get; }
        /// <summary>Contract ID.</summary>
        public string ContractId { get; }
        /// <summary>Game mode token.</summary>
        public string Mode { get; }
        /// <summary>Assist level ID.</summary>
        public string AssistLevelId { get; }
        /// <summary>Caller-supplied data hash.</summary>
        public string DataHash { get; }
    }

    /// <summary>One entry of a replay log.</summary>
    public sealed class ReplayEntry
    {
        internal ReplayEntry(int seq, int tick, string kind, string payloadJson) { Seq = seq; Tick = tick; Kind = kind; PayloadJson = payloadJson; }
        /// <summary>Sequence number, 1-based, strictly increasing.</summary>
        public int Seq { get; }
        /// <summary>Flight tick at 120 Hz (1 tick = 1/120 s since lift-off); −1 outside flight.</summary>
        public int Tick { get; }
        /// <summary>Entry kind, one of <see cref="ReplayKinds"/> (or another lower-case snake-case word).</summary>
        public string Kind { get; }
        /// <summary>Payload as compact JSON text (canonical form: no white space, property order as written).</summary>
        public string PayloadJson { get; }
    }

    /// <summary>
    /// A replay log (design 17.6): header plus ordered entries. Immutable. <see cref="ToJson"/> writes one canonical form, so
    /// <c>ReplayLog.Parse(json).ToJson() == json</c> byte for byte for any text produced by <see cref="ToJson"/>.
    /// Format: <c>{"version":1,"header":{"seed":"…","contract":"…","mode":"…","assist":"…","dataHash":"…"},"entries":[{"seq":1,"tick":-1,"kind":"phase","payload":{…}}]}</c>.
    /// </summary>
    public sealed class ReplayLog
    {
        /// <summary>Format version written to and required from the JSON.</summary>
        public const int FormatVersion = 1;

        internal ReplayLog(ReplayHeader header, IReadOnlyList<ReplayEntry> entries) { Header = header; Entries = entries; }

        /// <summary>Header.</summary>
        public ReplayHeader Header { get; }
        /// <summary>Entries in order.</summary>
        public IReadOnlyList<ReplayEntry> Entries { get; }

        /// <summary>The canonical JSON text of the log.</summary>
        public string ToJson()
        {
            var sw = new StringWriter(CultureInfo.InvariantCulture);
            using (var w = new JsonTextWriter(sw) { Formatting = Formatting.None })
            {
                w.WriteStartObject();
                w.WritePropertyName("version"); w.WriteValue(FormatVersion);
                w.WritePropertyName("header");
                w.WriteStartObject();
                w.WritePropertyName("seed"); w.WriteValue(Header.Seed.ToString(CultureInfo.InvariantCulture));
                w.WritePropertyName("contract"); w.WriteValue(Header.ContractId);
                w.WritePropertyName("mode"); w.WriteValue(Header.Mode);
                w.WritePropertyName("assist"); w.WriteValue(Header.AssistLevelId);
                w.WritePropertyName("dataHash"); w.WriteValue(Header.DataHash);
                w.WriteEndObject();
                w.WritePropertyName("entries");
                w.WriteStartArray();
                foreach (var e in Entries)
                {
                    w.WriteStartObject();
                    w.WritePropertyName("seq"); w.WriteValue(e.Seq);
                    w.WritePropertyName("tick"); w.WriteValue(e.Tick);
                    w.WritePropertyName("kind"); w.WriteValue(e.Kind);
                    w.WritePropertyName("payload"); w.WriteRawValue(e.PayloadJson);
                    w.WriteEndObject();
                }
                w.WriteEndArray();
                w.WriteEndObject();
            }
            return sw.ToString();
        }

        /// <summary>
        /// Parses and validates a log: version, header fields, <c>seq</c> strictly increasing, flight ticks (≥ 0) never decreasing,
        /// ticks ≥ −1, kinds lower-case snake case, payloads present.
        /// </summary>
        /// <exception cref="FormatException">Malformed JSON or a rule above is broken; the message says which.</exception>
        public static ReplayLog Parse(string json)
        {
            if (json == null) throw new ArgumentNullException(nameof(json));
            JObject root;
            try
            {
                root = ReadToken(json) as JObject ?? throw new FormatException("Replay log: the root is not an object.");
            }
            catch (JsonException e)
            {
                throw new FormatException("Replay log: malformed JSON (" + e.Message + ").", e);
            }
            if (!(root["version"] is JValue v) || v.Type != JTokenType.Integer || v.Value<int>() != FormatVersion)
                throw new FormatException("Replay log: 'version' must be " + FormatVersion + ".");
            var h = root["header"] as JObject ?? throw new FormatException("Replay log: missing 'header'.");
            var seedText = RequireString(h, "seed");
            if (!ulong.TryParse(seedText, NumberStyles.None, CultureInfo.InvariantCulture, out var seed))
                throw new FormatException("Replay log: header seed '" + seedText + "' is not an unsigned integer.");
            var header = new ReplayHeader(seed, RequireString(h, "contract"), RequireString(h, "mode"), RequireString(h, "assist"), RequireString(h, "dataHash"));
            var arr = root["entries"] as JArray ?? throw new FormatException("Replay log: missing 'entries'.");

            var entries = new List<ReplayEntry>(arr.Count);
            var lastSeq = 0;
            var lastFlightTick = -1;
            foreach (var t in arr)
            {
                var o = t as JObject ?? throw new FormatException("Replay log: an entry is not an object.");
                var seq = RequireInt(o, "seq");
                var tick = RequireInt(o, "tick");
                var kind = RequireString(o, "kind");
                if (!o.TryGetValue("payload", out var payload)) throw new FormatException("Replay log: entry " + seq + " has no payload.");
                ReplayLogWriter.CheckEntry(kind, tick, lastFlightTick);
                if (seq <= lastSeq) throw new FormatException("Replay log: seq " + seq + " does not increase (previous " + lastSeq + ").");
                lastSeq = seq;
                if (tick >= 0) lastFlightTick = tick;
                entries.Add(new ReplayEntry(seq, tick, kind, payload.ToString(Formatting.None)));
            }
            return new ReplayLog(header, entries);
        }

        internal static JToken ReadToken(string json)
        {
            using (var reader = new JsonTextReader(new StringReader(json)) { DateParseHandling = DateParseHandling.None })
            {
                var token = JToken.ReadFrom(reader);
                while (reader.Read())
                    if (reader.TokenType != JsonToken.Comment) throw new JsonReaderException("Additional text after the JSON value.");
                return token;
            }
        }

        private static string RequireString(JObject o, string name) =>
            o[name] is JValue v && v.Type == JTokenType.String ? (string)v.Value! : throw new FormatException("Replay log: missing string '" + name + "'.");

        private static int RequireInt(JObject o, string name) =>
            o[name] is JValue v && v.Type == JTokenType.Integer && v.Value<long>() >= int.MinValue && v.Value<long>() <= int.MaxValue
                ? v.Value<int>() : throw new FormatException("Replay log: missing integer '" + name + "'.");
    }

    /// <summary>
    /// Builds a replay log by appending entries (design 17.6). <c>Seq</c> is assigned 1, 2, 3 … so it strictly increases.
    /// <c>Tick</c> is the 120 Hz flight tick (−1 outside flight); flight ticks never decrease. Payloads are canonicalised
    /// to compact JSON so that parse and write give the same bytes.
    /// </summary>
    public sealed class ReplayLogWriter
    {
        private readonly List<ReplayEntry> entries = new List<ReplayEntry>();
        private int lastFlightTick = -1;

        /// <summary>Starts a log with a header.</summary>
        public ReplayLogWriter(ReplayHeader header) { Header = header ?? throw new ArgumentNullException(nameof(header)); }

        /// <summary>The header.</summary>
        public ReplayHeader Header { get; }
        /// <summary>Number of entries appended.</summary>
        public int Count => entries.Count;

        /// <summary>
        /// Appends an entry and returns its <c>Seq</c>.
        /// </summary>
        /// <param name="kind">Entry kind, lower-case snake case; see <see cref="ReplayKinds"/>.</param>
        /// <param name="tick">120 Hz flight tick since lift-off (≥ 0, not below an earlier flight tick), or −1 outside flight.</param>
        /// <param name="payloadJson">The payload as JSON text; null or empty gives <c>{}</c>.</param>
        /// <exception cref="ArgumentException">Bad kind, bad tick, or a payload that is not valid JSON.</exception>
        public int Append(string kind, int tick, string? payloadJson)
        {
            CheckEntryArgs(kind, tick, lastFlightTick);
            string canonical;
            if (string.IsNullOrWhiteSpace(payloadJson)) canonical = "{}";
            else
            {
                try
                {
                    canonical = ReplayLog.ReadToken(payloadJson!).ToString(Formatting.None);
                }
                catch (JsonException e)
                {
                    throw new ArgumentException("Payload is not valid JSON: " + e.Message, nameof(payloadJson), e);
                }
            }
            var seq = entries.Count + 1;
            entries.Add(new ReplayEntry(seq, tick, kind, canonical));
            if (tick >= 0) lastFlightTick = tick;
            return seq;
        }

        /// <summary>An immutable snapshot of the log so far.</summary>
        public ReplayLog ToLog() => new ReplayLog(Header, entries.ToArray());

        /// <summary>The canonical JSON text of the log so far.</summary>
        public string ToJson() => ToLog().ToJson();

        internal static void CheckEntry(string kind, int tick, int lastFlightTick)
        {
            try
            {
                CheckEntryArgs(kind, tick, lastFlightTick);
            }
            catch (ArgumentException e)
            {
                throw new FormatException("Replay log: " + e.Message, e);
            }
        }

        private static void CheckEntryArgs(string kind, int tick, int lastFlightTick)
        {
            if (string.IsNullOrEmpty(kind)) throw new ArgumentException("Entry kind is empty.", nameof(kind));
            foreach (var c in kind)
                if (!((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '_'))
                    throw new ArgumentException("Entry kind '" + kind + "' must be lower-case snake case.", nameof(kind));
            if (tick < -1) throw new ArgumentException("Tick " + tick + " is below -1 (-1 means outside flight).", nameof(tick));
            if (tick >= 0 && tick < lastFlightTick)
                throw new ArgumentException("Tick " + tick + " is before the previous flight tick " + lastFlightTick + ".", nameof(tick));
        }
    }
}
