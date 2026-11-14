namespace MissionForge.Balance;

internal sealed class Options
{
    public string DataPath { get; private set; } = "data";
    public string? ContractId { get; private set; }
    public int MaxEvals { get; private set; } = 300_000;
    public ulong Seed { get; private set; } = 1;
    public string OutputPath { get; private set; } = "orchestration/evidence/T012";
    public bool Check { get; private set; }
    public int Threads { get; private set; } = Math.Max(1, Environment.ProcessorCount);

    public static Options Parse(string[] args)
    {
        var result = new Options();
        for (var i = 0; i < args.Length; i++)
        {
            var arg = args[i];
            string Value()
            {
                if (++i >= args.Length) throw new OptionException($"Missing value after '{arg}'.");
                return args[i];
            }

            switch (arg)
            {
                case "--data": result.DataPath = Value(); break;
                case "--contract": result.ContractId = Value(); break;
                case "--max-evals":
                    if (!int.TryParse(Value(), out var max) || max <= 0)
                        throw new OptionException("--max-evals must be a positive integer.");
                    result.MaxEvals = max;
                    break;
                case "--seed":
                    if (!ulong.TryParse(Value(), out var seed))
                        throw new OptionException("--seed must be an unsigned integer.");
                    result.Seed = seed;
                    break;
                case "--out": result.OutputPath = Value(); break;
                case "--threads":
                    if (!int.TryParse(Value(), out var threads) || threads <= 0)
                        throw new OptionException("--threads must be a positive integer.");
                    result.Threads = threads;
                    break;
                case "--check": result.Check = true; break;
                case "--help": throw new OptionException(Usage, true);
                default: throw new OptionException($"Unknown argument '{arg}'.\n{Usage}");
            }
        }

        return result;
    }

    public const string Usage =
        "Usage: dotnet run -c Release --project tools/balance~ -- " +
        "[--data data] [--contract C1] [--max-evals 300000] [--seed 1] " +
        "[--out orchestration/evidence/T012] [--threads N] [--check]";
}

internal sealed class OptionException : Exception
{
    public OptionException(string message, bool help = false) : base(message) => Help = help;
    public bool Help { get; }
}
