using System;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;

namespace MissionForge.Screens.BuildBay
{
    /// <summary>Timer arithmetic for vote stages (protocol/messages.md §2, §7): server-clock deadlines, never local guesses.</summary>
    public static class VoteClock
    {
        /// <summary>Server time now, ms: local epoch ms corrected by the <c>clock.ping/pong</c> offset (server − local).</summary>
        public static long ServerNowMs(long localNowMs, double offsetMs) => localNowMs + (long)Math.Round(offsetMs);

        /// <summary>Whole seconds left until <paramref name="endsAtMs"/> (rounded up, never negative); null when untimed.</summary>
        public static int? SecondsLeft(long? endsAtMs, long serverNowMs)
        {
            if (!endsAtMs.HasValue) return null;
            long left = endsAtMs.Value - serverNowMs;
            if (left <= 0) return 0;
            return (int)((left + 999) / 1000);
        }

        /// <summary>Fraction of the stage elapsed (0..1); 1 when untimed or over.</summary>
        public static float Progress(long startedAtMs, long? endsAtMs, long serverNowMs)
        {
            if (!endsAtMs.HasValue || endsAtMs.Value <= startedAtMs) return 1f;
            return (float)Math.Max(0, Math.Min(1, (serverNowMs - startedAtMs) / (double)(endsAtMs.Value - startedAtMs)));
        }
    }

    /// <summary>One "if chosen" metric change as carried by the protocol <c>Delta</c> type.</summary>
    public sealed class DeltaItem
    {
        public string Metric;
        public double Value;
        public double Delta;
        public string Rating;
    }

    /// <summary>A role holder's tag on an option.</summary>
    public sealed class TagItem
    {
        public string PlayerId;
        public string Role;
        public string Tag;
    }

    /// <summary>One option of the round as rendered on the host.</summary>
    public sealed class OptionState
    {
        public string Id;
        public string PartId;
        public string LabelKey;
        public double CostM;
        public string Afford;
        public double OverBudgetByM;
        public double OverScheduleByDays;
        public bool WillNotFly;
        public bool FixExists;
        public readonly List<string> WarningKeys = new List<string>();
        public readonly List<DeltaItem> Deltas = new List<DeltaItem>();
        public readonly List<TagItem> Tags = new List<TagItem>();
        /// <summary>Player ballots, or null while tallies are hidden.</summary>
        public int? Count;
        public bool Vetoed;
        public string VetoedBy;
        /// <summary>Still in the running for the current stage (runoff / tiebreak narrow this).</summary>
        public bool Candidate = true;
    }

    /// <summary>One line of the vote feed: pings, tags and vetoes.</summary>
    public sealed class FeedItem
    {
        public string Kind;      // ping, tag, veto
        public string PlayerId;
        public string Key;       // strings key of the message (ping text, tag name)
        public string OptionId;
        public string Role;
    }

    /// <summary>
    /// The host's view of one vote round, built only from server messages (<c>vote.opened</c>, <c>vote.stage</c>,
    /// <c>vote.tally</c>, <c>vote.tags</c>, <c>vote.vetoed</c>, <c>vote.result</c>, <c>vote.cancelled</c>,
    /// <c>ping.event</c>) exactly as protocol/messages.md §7 defines them. Hidden tallies stay null until the result.
    /// Pure C#: no Unity, no clock (time comes in through <see cref="VoteClock"/>).
    /// </summary>
    public sealed class VoteRoundModel
    {
        public const int MaxFeed = 6;

        /// <summary>Protocol PingId › strings key (data/strings/en.content.json uses descriptive ids).</summary>
        public static readonly IReadOnlyDictionary<string, string> PingKeys = new Dictionary<string, string>
        {
            { "TOO_EXPENSIVE", "ping.too_expensive.text" },
            { "TOO_HEAVY", "ping.too_heavy.text" },
            { "LIKE_THIS", "ping.i_like_this_one.text" },
            { "CHECK_DRAWBACK", "ping.check_the_drawback.text" },
            { "NEED_MORE_DV", "ping.need_more_delta_v.text" },
            { "TEST_IT_FIRST", "ping.test_it_first.text" },
            { "TRUST_ME", "ping.trust_me.text" },
            { "AGREED", "ping.agreed.text" },
        };

        public string RoundId { get; private set; }
        public string Kind { get; private set; }
        public string SubjectId { get; private set; }
        public string TitleKey { get; private set; }
        public string WhyKey { get; private set; }
        public readonly List<OptionState> Options = new List<OptionState>();
        public int VoterCount { get; private set; }
        public bool Solo { get; private set; }
        public bool TalliesHidden { get; private set; }
        public readonly List<string> PlanStages = new List<string>();

        public string Stage { get; private set; }
        public long StartedAtMs { get; private set; }
        public long? EndsAtMs { get; private set; }
        public readonly List<string> VotedIds = new List<string>();
        public string LeadingOptionId { get; private set; }

        public string WinnerId { get; private set; }
        public string Method { get; private set; }
        public string ClosedBy { get; private set; }
        public bool EmergencyFunding { get; private set; }
        public bool Cancelled { get; private set; }
        public string CancelReason { get; private set; }

        public readonly List<FeedItem> Feed = new List<FeedItem>();

        public bool IsOpen => RoundId != null && !Cancelled && Stage != "CLOSED";

        public OptionState Option(string id)
        {
            foreach (OptionState o in Options) if (o.Id == id) return o;
            return null;
        }

        /// <summary>Applies one server message. Returns true when it changed this round's view.</summary>
        public bool Apply(string type, JObject d)
        {
            if (d == null) return false;
            switch (type)
            {
                case "vote.opened": Opened(d); return true;
                case "ping.event": return Ping(d);
            }
            if ((string)d["roundId"] != RoundId || RoundId == null) return false;
            switch (type)
            {
                case "vote.stage":
                    Stage = (string)d["stage"];
                    StartedAtMs = (long?)d["startedAtMs"] ?? 0;
                    EndsAtMs = (long?)d["endsAtMs"];
                    if (d["candidateIds"] is JArray cands && cands.Count > 0)
                    {
                        var set = new HashSet<string>();
                        foreach (JToken c in cands) set.Add((string)c);
                        foreach (OptionState o in Options) o.Candidate = set.Contains(o.Id);
                    }
                    return true;
                case "vote.tally":
                    Tally(d);
                    return true;
                case "vote.tags":
                    foreach (OptionState o in Options) o.Tags.Clear();
                    if (d["tags"] is JArray tags)
                    {
                        foreach (JToken t in tags)
                        {
                            OptionState o = Option((string)t["optionId"]);
                            if (o == null) continue;
                            var tag = new TagItem { PlayerId = (string)t["playerId"], Role = (string)t["role"], Tag = (string)t["tag"] };
                            o.Tags.Add(tag);
                            if (!Feed.Exists(f => f.Kind == "tag" && f.PlayerId == tag.PlayerId && f.OptionId == o.Id && f.Key == TagKey(tag.Tag)))
                                AddFeed(new FeedItem { Kind = "tag", PlayerId = tag.PlayerId, Key = TagKey(tag.Tag), OptionId = o.Id, Role = tag.Role });
                        }
                    }
                    return true;
                case "vote.vetoed":
                {
                    OptionState o = Option((string)d["optionId"]);
                    if (o != null)
                    {
                        o.Vetoed = true;
                        o.VetoedBy = (string)d["playerId"];
                        o.Candidate = false;
                        o.Tags.Clear();
                    }
                    AddFeed(new FeedItem { Kind = "veto", PlayerId = (string)d["playerId"], Key = "ui.buildbay.vote.vetoed", OptionId = (string)d["optionId"] });
                    return true;
                }
                case "vote.result":
                    WinnerId = (string)d["winnerId"];
                    Method = (string)d["method"];
                    ClosedBy = (string)d["closedBy"];
                    EmergencyFunding = (bool?)d["emergencyFunding"] ?? false;
                    ApplyCounts(d["counts"] as JArray, true);
                    LeadingOptionId = WinnerId;
                    return true;
                case "vote.cancelled":
                    Cancelled = true;
                    CancelReason = (string)d["reason"];
                    return true;
            }
            return false;
        }

        public static string TagKey(string tag) => tag == "CONCERN" ? "role_tag.concern.name" : "role_tag.recommended.name";

        private void Opened(JObject d)
        {
            RoundId = (string)d["roundId"];
            Kind = (string)d["kind"];
            SubjectId = (string)d["subjectId"];
            TitleKey = (string)d["title"]?["key"];
            WhyKey = d["why"] is JObject why ? (string)why["key"] : null;
            Solo = (bool?)d["solo"] ?? false;
            TalliesHidden = (string)d["tallyVisibility"] == "HIDDEN";
            VoterCount = (d["voters"] as JArray)?.Count ?? 0;
            Stage = null;
            StartedAtMs = 0;
            EndsAtMs = null;
            WinnerId = Method = ClosedBy = LeadingOptionId = null;
            EmergencyFunding = Cancelled = false;
            CancelReason = null;
            VotedIds.Clear();
            Feed.Clear();
            PlanStages.Clear();
            if (d["plan"] is JArray plan) foreach (JToken p in plan) PlanStages.Add((string)p["stage"]);
            Options.Clear();
            if (d["options"] is JArray options)
            {
                foreach (JToken t in options)
                {
                    var o = new OptionState
                    {
                        Id = (string)t["id"],
                        PartId = (string)t["partId"],
                        LabelKey = t["label"] is JObject l ? (string)l["key"] : null,
                        CostM = (double?)t["costM"] ?? 0,
                        Afford = (string)t["afford"] ?? "OK",
                        OverBudgetByM = (double?)t["overBudgetByM"] ?? 0,
                        OverScheduleByDays = (double?)t["overScheduleByDays"] ?? 0,
                        WillNotFly = (bool?)t["willNotFly"] ?? false,
                        FixExists = (bool?)t["fixExists"] ?? false,
                    };
                    if (t["warnings"] is JArray w) foreach (JToken x in w) o.WarningKeys.Add((string)x["key"]);
                    if (t["deltas"] is JArray ds)
                    {
                        foreach (JToken x in ds)
                            o.Deltas.Add(new DeltaItem { Metric = (string)x["metric"], Value = (double?)x["value"] ?? 0, Delta = (double?)x["delta"] ?? 0, Rating = (string)x["rating"] });
                    }
                    Options.Add(o);
                }
            }
        }

        private void Tally(JObject d)
        {
            VotedIds.Clear();
            if (d["votedIds"] is JArray voted) foreach (JToken v in voted) VotedIds.Add((string)v);
            JArray counts = d["counts"] as JArray;
            if (counts == null || TalliesHidden)
            {
                foreach (OptionState o in Options) o.Count = null;
                LeadingOptionId = null; // hidden tallies never leak a leader, not even to the host (§7)
                return;
            }
            ApplyCounts(counts, false);
            LeadingOptionId = (string)d["leadingOptionId"];
        }

        private void ApplyCounts(JArray counts, bool final)
        {
            if (counts == null) return;
            foreach (OptionState o in Options) if (final || o.Candidate) o.Count = 0;
            foreach (JToken c in counts)
            {
                OptionState o = Option((string)c["optionId"]);
                if (o != null) o.Count = (int?)c["n"] ?? 0;
            }
        }

        private bool Ping(JObject d)
        {
            string round = (string)d["roundId"];
            if (round != null && round != RoundId) return false;
            string id = (string)d["pingId"];
            AddFeed(new FeedItem
            {
                Kind = "ping",
                PlayerId = (string)d["playerId"],
                Key = id != null && PingKeys.TryGetValue(id, out string key) ? key : null,
                OptionId = (string)d["optionId"],
            });
            return true;
        }

        private void AddFeed(FeedItem item)
        {
            Feed.Insert(0, item);
            while (Feed.Count > MaxFeed) Feed.RemoveAt(Feed.Count - 1);
        }
    }
}
