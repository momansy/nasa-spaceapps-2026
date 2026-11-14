using System.Diagnostics;
using System.Globalization;
using System.Text;
using System.Text.Json;
using MissionForge.Core.Data;

namespace MissionForge.Balance;

internal static class ReportWriter
{
    public static string Commit()
    {
        try
        {
            using var process = Process.Start(new ProcessStartInfo
            {
                FileName = "git",
                Arguments = "rev-parse --short HEAD",
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true,
            });
            if (process == null) return "unavailable";
            var value = process.StandardOutput.ReadToEnd().Trim();
            process.WaitForExit();
            return process.ExitCode == 0 && value.Length > 0 ? value : "unavailable";
        }
        catch (Exception)
        {
            return "unavailable";
        }
    }

    public static void Write(BalanceReport report, string outputPath)
    {
        Directory.CreateDirectory(outputPath);
        var markdown = Markdown(report);
        var json = Json(report);
        File.WriteAllText(Path.Combine(outputPath, "balance-report.md"), markdown, new UTF8Encoding(false));
        File.WriteAllText(Path.Combine(outputPath, "balance-report.json"), json, new UTF8Encoding(false));
    }

    private static string Markdown(BalanceReport report)
    {
        var text = new StringBuilder();
        text.AppendLine("# MissionForge balance report");
        text.AppendLine();
        text.AppendLine($"Commit: `{report.Commit}`  ");
        text.AppendLine($"Seed: `{report.Seed}`  ");
        text.AppendLine($"Maximum complete builds evaluated per contract: `{report.MaxEvalsPerContract}`");
        text.AppendLine();
        text.AppendLine("## Rules and model boundaries");
        text.AppendLine();
        text.AppendLine("- A valid build fills every vote returned by Core `VoteOptions.VotesFor` with an option from `VoteOptions.Offered`, has no Complete-mode Blocker from Core `Validator`, has at least `0 $M` remaining, and finishes no later than the contract deadline in days.");
        text.AppendLine("- Core's rocket equation, thrust-to-weight, mass, entry, power and data calculations remain the physical or simplified-physical models documented by Core. Budget (`$M`), schedule (`days`), part reliability, the displayed success estimate, and the thresholds in this report are game values. This tool never uses hidden reliability truth.");
        text.AppendLine("- Propulsion-coupled votes are enumerated depth-first. A branch is pruned on a Partial-mode Blocker or when selected hardware exceeds the budget even after the largest still-available mission-assurance discount. Other votes are filled twice: a greedy lowest-current-cost variant and a greedy highest-displayed-success variant.");
        text.AppendLine("- Architecture is `(first-stage engine, upper-stage engine, booster-recovery family, strap-on)`. Recovery families are expendable, parachute, and propulsive. At least 3 valid architectures are required.");
        text.AppendLine("- One representative per architecture minimizes balanced normalized regret: `cost / budget + days / deadline + (1 - displayed success)`. The Pareto front then minimizes cost and schedule while maximizing displayed success.");
        text.AppendLine("- Dominant means one architecture is alone on that front. Near-dominant means an architecture is within 2% of the best architecture representative on all three axes (`cost <= 1.02 × minimum`, `days <= 1.02 × minimum`, `success >= 0.98 × maximum`). A contract passes only when it has at least 3 architectures and no dominant architecture.");
        text.AppendLine("- Majors are permitted and counted. Capped searches report only builds observed before the deterministic evaluation cap.");
        text.AppendLine();
        text.AppendLine("## Contract summary");
        text.AppendLine();
        text.AppendLine("| Contract | Valid / evaluated | Capped | Architectures | ≥3 | Dominance | Overall |");
        text.AppendLine("|---|---:|:---:|---:|:---:|---|:---:|");
        foreach (var contract in report.Contracts)
            text.AppendLine($"| {contract.ContractId} {Escape(contract.ContractName)} | {contract.Valid} / {contract.Evaluated} | {YesNo(contract.Capped)} | {contract.ArchitectureCount} | {PassFail(contract.ArchitecturePass)} | {(contract.Dominant ? "DOMINANT" : "none")} | {PassFail(contract.Pass)} |");
        text.AppendLine();

        foreach (var contract in report.Contracts)
        {
            text.AppendLine($"## {contract.ContractId} — {contract.ContractName}");
            text.AppendLine();
            text.AppendLine($"Evaluated `{contract.Evaluated}` complete builds; `{contract.Valid}` valid; capped: `{contract.Capped.ToString().ToLowerInvariant()}`. Pruned `{contract.PartialBlockerPrunes}` branches for Partial-mode Blockers and `{contract.CostLowerBoundPrunes}` for the conservative cost lower bound.");
            text.AppendLine();
            text.AppendLine($"Architectures: `{contract.ArchitectureCount}` — {PassFail(contract.ArchitecturePass)} against ≥3. Dominance: `{(contract.Dominant ? "dominant" : "not dominant")}` — {PassFail(contract.DominancePass)}. Near-dominant architectures: `{(contract.NearDominant.Count == 0 ? "none" : string.Join("; ", contract.NearDominant))}`.");
            text.AppendLine();
            text.AppendLine("### Archetypes");
            text.AppendLine();
            AppendBuild(text, "Cheapest valid (cheap and risky)", contract.Cheapest);
            AppendBuild(text, "Highest displayed success (expensive and safe)", contract.HighestSuccess);
            AppendBuild(text, "Best reusable", contract.BestReusable);
            text.AppendLine("### Pareto-front architecture representatives");
            text.AppendLine();
            if (contract.ParetoFront.Count == 0) text.AppendLine("None.");
            foreach (var build in contract.ParetoFront)
                AppendBuild(text, build.Architecture.ToString(), build);
        }

        text.AppendLine("## Unused parts");
        text.AppendLine();
        text.AppendLine("Parts appearing in no Pareto-front build of any evaluated contract:");
        text.AppendLine();
        if (report.UnusedPartIds.Count == 0) text.AppendLine("None.");
        else foreach (var id in report.UnusedPartIds) text.AppendLine($"- `{id}`");
        text.AppendLine();
        text.AppendLine("## Recommended data changes");
        text.AppendLine();
        text.AppendLine("Recommendations only; no data files were changed. Each proposal is a playtest starting point, not a claim that a physical parameter should change.");
        text.AppendLine();
        text.AppendLine("| File | ID | Field | Current | Proposed | Reason |");
        text.AppendLine("|---|---|---|---:|---:|---|");
        foreach (var recommendation in report.Recommendations)
            text.AppendLine($"| `{recommendation.File}` | `{recommendation.PartId}` | `{recommendation.Field}` | {recommendation.CurrentValue} | {recommendation.ProposedValue} | {Escape(recommendation.Reason)} |");
        if (report.Recommendations.Count == 0) text.AppendLine("| — | — | — | — | — | No changes recommended from this run. |");
        return text.ToString().Replace("\r\n", "\n", StringComparison.Ordinal);
    }

    private static string Json(BalanceReport report)
    {
        var document = new
        {
            schema_version = 1,
            commit = report.Commit,
            seed = report.Seed,
            max_evals_per_contract = report.MaxEvalsPerContract,
            rules = new
            {
                required_architectures = 3,
                dominant_front_size = 1,
                near_dominant_tolerance_fraction = 0.02,
                success_source = "DashboardMetrics.Success (displayed estimate)",
            },
            contracts = report.Contracts.Select(contract => new
            {
                id = contract.ContractId,
                name = contract.ContractName,
                evaluated = contract.Evaluated,
                valid = contract.Valid,
                capped = contract.Capped,
                partial_blocker_prunes = contract.PartialBlockerPrunes,
                cost_lower_bound_prunes = contract.CostLowerBoundPrunes,
                architectures = contract.ArchitectureCount,
                architecture_pass = contract.ArchitecturePass,
                dominant = contract.Dominant,
                dominance_pass = contract.DominancePass,
                near_dominant = contract.NearDominant.Select(ArchitectureJson),
                pass = contract.Pass,
                archetypes = new
                {
                    cheapest = BuildJson(contract.Cheapest),
                    highest_success = BuildJson(contract.HighestSuccess),
                    best_reusable = BuildJson(contract.BestReusable),
                },
                pareto_front = contract.ParetoFront.Select(BuildJson),
            }),
            unused_parts = report.UnusedPartIds,
            recommended_data_changes = report.Recommendations.Select(item => new
            {
                file = item.File,
                id = item.PartId,
                field = item.Field,
                current = item.CurrentValue,
                proposed = item.ProposedValue,
                reason = item.Reason,
            }),
        };
        return JsonSerializer.Serialize(document, new JsonSerializerOptions { WriteIndented = true }) + "\n";
    }

    private static object? BuildJson(BuildResult? build) => build == null ? null : new
    {
        architecture = ArchitectureJson(build.Architecture),
        cost_M = Round(build.CostM),
        schedule_days = Round(build.ScheduleDays),
        displayed_success = Round(build.SuccessEstimate),
        majors = build.MajorCount,
        variant = build.Variant,
        parts = build.Choices.Select(choice => new { slot = choice.Slot, id = choice.PartId }),
    };

    private static object ArchitectureJson(Architecture architecture) => new
    {
        first_stage_engine = architecture.FirstStageEngine,
        upper_stage_engine = architecture.UpperStageEngine,
        recovery_family = architecture.RecoveryFamily,
        strap_on = architecture.StrapOn,
    };

    private static void AppendBuild(StringBuilder text, string label, BuildResult? build)
    {
        text.AppendLine($"#### {label}");
        text.AppendLine();
        if (build == null)
        {
            text.AppendLine("None found.");
            text.AppendLine();
            return;
        }
        text.AppendLine($"Architecture: `{build.Architecture}`  ");
        text.AppendLine($"Metrics: `{build.CostM.ToString("0.###", CultureInfo.InvariantCulture)} $M`; `{build.ScheduleDays.ToString("0.###", CultureInfo.InvariantCulture)} days`; `{(build.SuccessEstimate * 100).ToString("0.###", CultureInfo.InvariantCulture)}%` displayed success; `{build.MajorCount}` Majors.  ");
        text.AppendLine("Parts: " + string.Join(", ", build.Choices.Select(choice => $"`{choice.Slot}={choice.PartId}`")));
        text.AppendLine();
    }

    private static double Round(double value) => Math.Round(value, 9, MidpointRounding.AwayFromZero);
    private static string YesNo(bool value) => value ? "yes" : "no";
    private static string PassFail(bool value) => value ? "PASS" : "FAIL";
    private static string Escape(string value) => value.Replace("|", "\\|", StringComparison.Ordinal);
}
