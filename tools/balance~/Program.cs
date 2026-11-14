using System.Diagnostics;
using MissionForge.Core.Data;

namespace MissionForge.Balance;

internal static class Program
{
    private static int Main(string[] args)
    {
        try
        {
            var options = Options.Parse(args);
            var catalog = CatalogReader.Load(options.DataPath);
            var contracts = SelectContracts(catalog, options.ContractId);
            var clock = Stopwatch.StartNew();

            // Contracts are independent; each search is sequential and deterministic, so running them in parallel
            // does not change any result. Core's build functions are pure over a read-only catalog.
            var results = new ContractResult[contracts.Count];
            Parallel.For(0, contracts.Count, new ParallelOptions { MaxDegreeOfParallelism = options.Threads }, i =>
            {
                var watch = Stopwatch.StartNew();
                var result = new SearchEngine(catalog, options.MaxEvals, options.Seed).Search(contracts[i]);
                BalanceAnalysis.Analyze(result);
                results[i] = result;
                Console.WriteLine($"  {result.ContractId}: {result.Valid}/{result.Evaluated} valid, " +
                                  $"{result.ArchitectureCount} architectures, {(result.Pass ? "PASS" : "FAIL")}, " +
                                  $"capped={result.Capped.ToString().ToLowerInvariant()} ({watch.Elapsed.TotalSeconds:0.0} s)");
            });

            var list = results.ToList();
            var unused = BalanceAnalysis.UnusedParts(list, catalog);
            var report = new BalanceReport
            {
                Commit = ReportWriter.Commit(),
                Seed = options.Seed,
                MaxEvalsPerContract = options.MaxEvals,
                Contracts = list,
                UnusedParts = unused,
                Recommendations = Recommender.Recommend(list, unused, catalog, options.Seed),
            };
            ReportWriter.Write(report, options.OutputPath);
            Console.WriteLine($"Wrote {Path.Combine(options.OutputPath, "balance-report.md")} and balance-report.json " +
                              $"in {clock.Elapsed.TotalSeconds:0.0} s.");
            return options.Check && list.Any(result => !result.Pass) ? 1 : 0;
        }
        catch (OptionException ex)
        {
            if (ex.Help)
            {
                Console.WriteLine(ex.Message);
                return 0;
            }
            Console.Error.WriteLine(ex.Message);
            return 2;
        }
        catch (Exception ex) when (ex is IOException || ex is UnauthorizedAccessException || ex is CatalogException)
        {
            Console.Error.WriteLine(ex.Message);
            return 2;
        }
    }

    private static IReadOnlyList<ContractDef> SelectContracts(GameCatalog catalog, string? requested)
    {
        if (requested == null)
            return catalog.Contracts.Values.OrderBy(c => c.Id, StringComparer.Ordinal).ToArray();
        if (!catalog.Contracts.TryGetValue(requested, out var contract))
            throw new OptionException($"Unknown contract '{requested}'.");
        return new[] { contract };
    }
}
