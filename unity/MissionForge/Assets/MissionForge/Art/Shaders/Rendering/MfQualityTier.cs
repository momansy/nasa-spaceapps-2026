using UnityEngine;

namespace MissionForge.Rendering
{
    /// <summary>
    /// Allocation-free check of the active quality tier name. QualitySettings.names allocates a new array, so the
    /// name is only re-read when the quality level index changes.
    /// </summary>
    internal static class MfQualityTier
    {
        private static int s_CachedLevel = -1;
        private static string s_CachedName = string.Empty;

        public static bool Is(string tierName)
        {
            int level = QualitySettings.GetQualityLevel();
            if (level != s_CachedLevel)
            {
                string[] names = QualitySettings.names;
                s_CachedName = level >= 0 && level < names.Length ? names[level] : string.Empty;
                s_CachedLevel = level;
            }
            return string.Equals(s_CachedName, tierName, System.StringComparison.Ordinal);
        }
    }
}
