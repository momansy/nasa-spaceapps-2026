#nullable enable
using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace MissionForge.Core.Campaign
{
    /// <summary>Validation for anonymous team leaderboard labels, not individual names.</summary>
    public static class TeamName
    {
        /// <summary>True for 1–24 characters consisting only of letters, digits, spaces, '-' and '_'.</summary>
        public static bool Validate(string? name)
        {
            if (string.IsNullOrWhiteSpace(name) || name.Length > CampaignConstants.TeamNameMaxLength ||
                name != name.Trim()) return false;
            foreach (char c in name)
                if (!char.IsLetterOrDigit(c) && c != ' ' && c != '-' && c != '_') return false;
            return true;
        }
    }

    /// <summary>Anonymous team-only leaderboard record for one contract and mode (13.6).</summary>
    public sealed class LeaderboardRecord
    {
        /// <summary>Contract ID.</summary>
        public string ContractId { get; }
        /// <summary>Protocol GameMode token.</summary>
        public string Mode { get; }
        /// <summary>Anonymous team name; never an account or player name.</summary>
        public string TeamName { get; }
        /// <summary>Score points.</summary>
        public double Score { get; }
        /// <summary>Fraction of original budget unused, 0–1.</summary>
        public double BudgetEfficiency { get; }
        /// <summary>Elapsed mission schedule days, game value.</summary>
        public double ScheduleDays { get; }
        /// <summary>Seed for reproducibility; no account reference.</summary>
        public ulong Seed { get; }
        /// <summary>Caller-supplied yyyy-MM-dd string.</summary>
        public string Date { get; }

        /// <summary>Creates and validates a portable leaderboard record.</summary>
        [JsonConstructor]
        public LeaderboardRecord(string contractId, string mode, string teamName, double score,
            double budgetEfficiency, double scheduleDays, ulong seed, string date)
        {
            if (string.IsNullOrWhiteSpace(contractId) || string.IsNullOrWhiteSpace(mode))
                throw new ArgumentException("Contract and mode are required.");
            if (!global::MissionForge.Core.Campaign.TeamName.Validate(teamName))
                throw new ArgumentException("Team name has invalid characters or length.", nameof(teamName));
            if (double.IsNaN(score) || double.IsInfinity(score) ||
                double.IsNaN(budgetEfficiency) || double.IsInfinity(budgetEfficiency) ||
                budgetEfficiency < 0 || budgetEfficiency > 1 || double.IsNaN(scheduleDays) ||
                double.IsInfinity(scheduleDays) || scheduleDays < 0)
                throw new ArgumentOutOfRangeException(nameof(score), "Leaderboard numbers must be finite and valid.");
            ContractId = contractId;
            Mode = mode;
            TeamName = teamName;
            Score = score;
            BudgetEfficiency = budgetEfficiency;
            ScheduleDays = scheduleDays;
            Seed = seed;
            Date = date ?? "";
        }
    }

    /// <summary>Immutable leaderboard supporting deterministic sorting, ranking and JSON saves.</summary>
    public sealed class Leaderboard
    {
        private readonly IReadOnlyList<LeaderboardRecord> _records;
        /// <summary>Records, in insertion order.</summary>
        public IReadOnlyList<LeaderboardRecord> Records => _records;
        /// <summary>Starts an empty leaderboard.</summary>
        public Leaderboard() : this(Array.Empty<LeaderboardRecord>()) { }
        /// <summary>Creates a board from anonymous, immutable records.</summary>
        public Leaderboard(IEnumerable<LeaderboardRecord> records)
        {
            _records = Array.AsReadOnly((records ?? throw new ArgumentNullException(nameof(records))).ToArray());
        }

        /// <summary>Returns a new board including the record; never mutates the original.</summary>
        public Leaderboard Insert(LeaderboardRecord record)
        {
            if (record == null) throw new ArgumentNullException(nameof(record));
            return new Leaderboard(_records.Concat(new[] { record }));
        }

        /// <summary>Top n for a contract and mode; tie order never depends on dictionary iteration.</summary>
        public IReadOnlyList<LeaderboardRecord> Top(int n, string contractId, string mode,
            string metric = "SCORE")
        {
            if (n < 0) throw new ArgumentOutOfRangeException(nameof(n));
            return Array.AsReadOnly(Sorted(contractId, mode, metric).Take(n).ToArray());
        }

        /// <summary>One-based rank of the first matching record, or 0 if it is not on this board.</summary>
        public int Rank(LeaderboardRecord record, string metric = "SCORE")
        {
            if (record == null) throw new ArgumentNullException(nameof(record));
            var sorted = Sorted(record.ContractId, record.Mode, metric).ToArray();
            for (int i = 0; i < sorted.Length; i++)
                if (ReferenceEquals(sorted[i], record) || SameRecord(sorted[i], record))
                    return i + 1;
            return 0;
        }

        private static bool SameRecord(LeaderboardRecord a, LeaderboardRecord b) =>
            a.ContractId == b.ContractId && a.Mode == b.Mode && a.TeamName == b.TeamName &&
            a.Score == b.Score && a.BudgetEfficiency == b.BudgetEfficiency &&
            a.ScheduleDays == b.ScheduleDays && a.Seed == b.Seed && a.Date == b.Date;

        private IEnumerable<LeaderboardRecord> Sorted(string contractId, string mode, string metric)
        {
            var subset = _records.Where(r => r.ContractId == contractId && r.Mode == mode);
            IOrderedEnumerable<LeaderboardRecord> ordered;
            switch (metric)
            {
                case "SCORE":
                    ordered = subset.OrderByDescending(r => r.Score);
                    break;
                case "BUDGET_EFFICIENCY":
                    ordered = subset.OrderByDescending(r => r.BudgetEfficiency);
                    break;
                case "SCHEDULE_DAYS":
                    ordered = subset.OrderBy(r => r.ScheduleDays);
                    break;
                default:
                    throw new ArgumentException("Unknown leaderboard metric: " + metric, nameof(metric));
            }
            // Canonical tie-breaks are independent of culture, runtime, and hash-table order.
            return ordered.ThenByDescending(r => r.Score).ThenByDescending(r => r.BudgetEfficiency)
                .ThenBy(r => r.ScheduleDays).ThenBy(r => r.TeamName, StringComparer.Ordinal)
                .ThenBy(r => r.Date, StringComparer.Ordinal).ThenBy(r => r.Seed);
        }

        /// <summary>Serializes leaderboard records to a versioned JSON string.</summary>
        public string ToJson() => JsonConvert.SerializeObject(new { Version = 1, Records = _records });

        /// <summary>Restores a leaderboard, rejecting unknown JSON schema versions.</summary>
        public static Leaderboard FromJson(string json)
        {
            if (json == null) throw new ArgumentNullException(nameof(json));
            var obj = JObject.Parse(json);
            int? version = obj.Value<int?>("Version") ?? obj.Value<int?>("version");
            if (version != 1) throw new NotSupportedException("Unsupported leaderboard version: " +
                (version?.ToString() ?? "missing"));
            var arr = obj["Records"] ?? obj["records"];
            if (!(arr is JArray)) throw new JsonSerializationException("Leaderboard records array is missing.");
            return new Leaderboard(arr.ToObject<List<LeaderboardRecord>>() ?? new List<LeaderboardRecord>());
        }
    }
}
