#nullable enable
using System.Globalization;
using MissionForge.Core.Random;

namespace MissionForge.Core.Build
{
    /// <summary>
    /// Deterministic random draws for the build phase, all from <see cref="SeededRandom"/> (design 17.6).
    /// Every draw names its stream and a key (e.g. stream <c>reliability</c>, key the part ID) so the result
    /// does not depend on the order in which votes happen, and replays match.
    /// </summary>
    public static class BuildRandom
    {
        /// <summary>Stream for hidden true reliabilities and hidden flaws.</summary>
        public const string ReliabilityStream = "reliability";
        /// <summary>Stream for test reveal rolls.</summary>
        public const string TestStream = "test";
        /// <summary>Stream for anomaly card draws.</summary>
        public const string AnomalyStream = "anomaly";

        /// <summary>
        /// A uniform number in [0, 1) for (session seed, stream, key, index):
        /// <c>new SeededRandom(seed).ForStream(stream).ForStream(key + "#" + index).NextDouble()</c>.
        /// </summary>
        public static double Uniform(ulong seed, string stream, string key, int index = 0) =>
            new SeededRandom(seed)
                .ForStream(stream)
                .ForStream(key + "#" + index.ToString(CultureInfo.InvariantCulture))
                .NextDouble();
    }
}
