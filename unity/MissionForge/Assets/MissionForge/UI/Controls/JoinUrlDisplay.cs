using System;

namespace MissionForge.UI
{
    /// <summary>
    /// What a join panel may print under its QR: only a publicly reachable host. A localhost, loopback or 0.0.0.0 dev
    /// URL is never shown in a shipped view (the QR still encodes the full join URL).
    /// </summary>
    public static class JoinUrlDisplay
    {
        /// <summary>Host (and non-default port) of <paramref name="url"/>; empty for localhost, loopback, 0.0.0.0 or a bad URL.</summary>
        public static string PublicHost(string url)
        {
            if (!Uri.TryCreate(url, UriKind.Absolute, out Uri uri)) return string.Empty;
            if (uri.IsLoopback || uri.Host == "localhost" || uri.Host == "0.0.0.0") return string.Empty;
            return uri.IsDefaultPort ? uri.Host : uri.Host + ":" + uri.Port;
        }
    }
}
