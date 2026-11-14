using MissionForge.Core.Build;
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
            var results = new List<ContractResult>();
            foreach (var contract in contracts)
            {
                Console.WriteLine($"Searching {contract.Id} {contract.Name}...");
                var result = new SearchEngine(catalog, options.MaxEvals, options.Seed).Search(contract);
                BalanceAnalysis.Analyze(result);
                results.Add(result);
                Console.WriteLine($"  {result.Valid}/{result.Evaluated} valid, {result.ArchitectureCount} architectures, " +
                                  $"{(result.Pass ? "PASS" : "FAIL")}, capped={result.Capped.ToString().ToLowerInvariant()}");
            }

            var unused = BalanceAnalysis.UnusedParts(results, catalog);
            var report = new BalanceReport
            {
                Commit = ReportWriter.Commit(),
                Seed = options.Seed,
                MaxEvalsPerContract = options.MaxEvals,
                Contracts = results,
                UnusedPartIds = unused,
                Recommendations = BalanceAnalysis.Recommend(unused, catalog),
            };
            ReportWriter.Write(report, options.OutputPath);
            Console.WriteLine($"Wrote {Path.Combine(options.OutputPath, "balance-report.md")} and balance-report.json.");
            return options.Check && results.Any(result => !result.Pass) ? 1 : 0;
        }
        catch (OptionException ex)
        {
            Console.Error.WriteLine(ex.Message);
            return ex.Help ? 0 : 2;
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
