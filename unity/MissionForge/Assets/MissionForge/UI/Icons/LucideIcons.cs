using System;
using System.Collections.Generic;
using UnityEngine;

namespace MissionForge.UI
{
    /// <summary>
    /// Lookup and parse cache for the vendored Lucide subset (path data in LucideIcons.g.cs).
    /// Names are current Lucide names; <see cref="Resolve"/> also accepts MissionForge legacy names
    /// (check, warn, cross, ring, signal), status names (meets, marginal, fails) and the upstream
    /// aliases of renamed icons (triangle-alert, circle-alert, ...).
    /// </summary>
    public static partial class LucideIcons
    {
        /// <summary>Lucide's viewBox edge in user units; icons are designed on a 24 x 24 grid.</summary>
        public const float ViewBoxSize = 24f;

        /// <summary>Lucide stroke width in user units (2 px at 24 px).</summary>
        public const float StrokeWidth = 2f;

        /// <summary>Status shapes required by the style guide (VISUAL_TARGET.md 3.1).</summary>
        public const string Meets = "circle-check";
        public const string Marginal = "triangle-exclamation-point";
        public const string Fails = "octagon-x";

        private static readonly Dictionary<string, string> Aliases = new Dictionary<string, string>(StringComparer.Ordinal)
        {
            // MissionForge legacy MfIcon kinds ("check" and "signal" are Lucide names already).
            ["warn"] = Marginal,
            ["cross"] = "x",
            ["ring"] = "circle",
            // Status kinds.
            ["meets"] = Meets,
            ["marginal"] = Marginal,
            ["fails"] = Fails,
            // Upstream Lucide aliases for icons in this subset (from lucide-static 1.73.0 exports).
            ["triangle-alert"] = "triangle-exclamation-point",
            ["alert-triangle"] = "triangle-exclamation-point",
            ["circle-alert"] = "circle-exclamation-point",
            ["alert-circle"] = "circle-exclamation-point",
            ["check-circle-2"] = "circle-check",
            ["x-octagon"] = "octagon-x",
            ["unlock"] = "lock-open",
            ["more-horizontal"] = "ellipsis",
            ["layers-3"] = "layers",
            ["stars"] = "sparkles",
        };

        private static readonly Dictionary<string, SvgPath> Cache = new Dictionary<string, SvgPath>(StringComparer.Ordinal);
        private static readonly HashSet<string> Failed = new HashSet<string>(StringComparer.Ordinal);

        /// <summary>Every canonical icon name in the vendored subset.</summary>
        public static IEnumerable<string> Names => Paths.Keys;

        /// <summary>Every alias name (legacy, status and upstream renames).</summary>
        public static IEnumerable<string> AliasNames => Aliases.Keys;

        public static int Count => Paths.Count;

        /// <summary>Returns the canonical icon name for a name or alias, or null if unknown.</summary>
        public static string Resolve(string name)
        {
            if (string.IsNullOrEmpty(name)) return null;
            if (Paths.ContainsKey(name)) return name;
            return Aliases.TryGetValue(name, out string target) ? target : null;
        }

        public static bool Contains(string name) => Resolve(name) != null;

        /// <summary>Raw SVG path data (one string per source element), or null if unknown.</summary>
        public static IReadOnlyList<string> GetPathData(string name)
        {
            string canonical = Resolve(name);
            return canonical != null ? Paths[canonical] : null;
        }

        /// <summary>
        /// Parsed geometry for a name or alias. Parsed once, then served from a static cache, so
        /// repeated calls do not allocate.
        /// </summary>
        public static bool TryGetPath(string name, out SvgPath path)
        {
            string canonical = Resolve(name);
            if (canonical == null)
            {
                path = null;
                return false;
            }
            if (Cache.TryGetValue(canonical, out path)) return true;
            if (Failed.Contains(canonical)) return false;

            try
            {
                path = SvgPath.Parse(Paths[canonical]);
            }
            catch (FormatException e)
            {
                Failed.Add(canonical);
                Debug.LogError($"[LucideIcons] Could not parse icon '{canonical}': {e.Message}");
                path = null;
                return false;
            }
            Cache[canonical] = path;
            return true;
        }
    }
}
