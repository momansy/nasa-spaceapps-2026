#nullable enable
namespace MissionForge.Core.Data
{
    /// <summary>
    /// How a number was obtained (design section 19). Every constant in data and in code is
    /// tagged with one of these so physical models stay distinct from game simplifications.
    /// </summary>
    public enum ValueKind
    {
        /// <summary>A physical constant or law (e.g. g0 = 9.80665 m/s²).</summary>
        Physical,
        /// <summary>Rounded from real hardware or real missions.</summary>
        RealWorldApproximate,
        /// <summary>Chosen for balance and teaching; not a real-world value.</summary>
        GameValue,
    }

    /// <summary>Technology maturity of a part (design section 7.0). Sets the uncertainty band.</summary>
    public enum Maturity
    {
        /// <summary>Flight-proven hardware: ±1 percentage point band.</summary>
        Proven,
        /// <summary>Mature hardware: ±3 percentage point band.</summary>
        Mature,
        /// <summary>New technology: ±6 percentage point band.</summary>
        New,
    }

    /// <summary>Severity of a validation or review issue (design sections 6.9 and 6.11).</summary>
    public enum Severity
    {
        /// <summary>Informational; does not block.</summary>
        Minor = 0,
        /// <summary>High risk; the vehicle can still fly.</summary>
        Major = 1,
        /// <summary>The vehicle cannot fly.</summary>
        Blocker = 2,
    }
}
