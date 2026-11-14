using System;

namespace MissionForge.Net
{
    /// <summary>
    /// Pure functions that work out which server to talk to and which join link to show.
    /// No Unity types, so they are unit-testable.
    /// </summary>
    public static class ServerUrlResolver
    {
        /// <summary>Name of the page query parameter that overrides the configured server URL.</summary>
        public const string ServerQueryParameter = "server";

        /// <summary>Template placeholder for the scheme, host and port of the page.</summary>
        public const string OriginPlaceholder = "{origin}";

        /// <summary>Template placeholder for the room code.</summary>
        public const string CodePlaceholder = "{code}";

        /// <summary>Template used when none is given.</summary>
        public const string DefaultJoinUrlTemplate = OriginPlaceholder + "/play/?room=" + CodePlaceholder;

        private const string WsPrefix = "ws://";
        private const string WssPrefix = "wss://";

        /// <summary>
        /// Returns the URL-decoded <c>server</c> query parameter of <paramref name="pageUrl"/> when it
        /// is present and starts with ws:// or wss://; otherwise <paramref name="configuredUrl"/>.
        /// </summary>
        /// <param name="configuredUrl">Server URL from configuration.</param>
        /// <param name="pageUrl">URL of the page hosting the game (<c>Application.absoluteURL</c>); may be null or empty.</param>
        public static string ResolveServerUrl(string configuredUrl, string pageUrl)
        {
            string fromPage = GetServerOverride(pageUrl);
            return fromPage ?? configuredUrl;
        }

        /// <summary>Builds the link players open to join a room.</summary>
        /// <param name="template">Template with <c>{origin}</c> and <c>{code}</c>; the default template is used when empty.</param>
        /// <param name="pageUrl">URL of the page hosting the game; may be null or empty.</param>
        /// <param name="fallbackOrigin">Origin used when <paramref name="pageUrl"/> is not an http(s) URL.</param>
        /// <param name="code">Room code.</param>
        /// <param name="serverProvidedJoinUrl">Join URL sent by the server; returned unchanged when not empty.</param>
        /// <returns>
        /// The server-provided URL when there is one; otherwise the filled-in template, with
        /// <c>server=&lt;encoded&gt;</c> appended when the page URL carried a valid <c>server</c>
        /// override, so phones reach the same server as the host.
        /// </returns>
        public static string BuildJoinUrl(string template, string pageUrl, string fallbackOrigin, string code, string serverProvidedJoinUrl)
        {
            if (!string.IsNullOrWhiteSpace(serverProvidedJoinUrl))
            {
                return serverProvidedJoinUrl;
            }

            string origin = GetHttpOrigin(pageUrl) ?? (fallbackOrigin ?? "").TrimEnd('/');
            string joinUrl = (string.IsNullOrEmpty(template) ? DefaultJoinUrlTemplate : template)
                .Replace(OriginPlaceholder, origin)
                .Replace(CodePlaceholder, Uri.EscapeDataString(code ?? ""));

            string serverOverride = GetServerOverride(pageUrl);
            if (serverOverride == null)
            {
                return joinUrl;
            }

            return AppendQueryParameter(joinUrl, ServerQueryParameter, serverOverride);
        }

        /// <summary>Returns the decoded <c>server</c> page parameter when it is a WebSocket URL, else null.</summary>
        private static string GetServerOverride(string pageUrl)
        {
            string value = GetQueryParameter(pageUrl, ServerQueryParameter);
            return IsWebSocketUrl(value) ? value : null;
        }

        private static bool IsWebSocketUrl(string value)
        {
            if (string.IsNullOrEmpty(value))
            {
                return false;
            }

            return HasPrefixAndMore(value, WsPrefix) || HasPrefixAndMore(value, WssPrefix);
        }

        private static bool HasPrefixAndMore(string value, string prefix)
        {
            return value.Length > prefix.Length && value.StartsWith(prefix, StringComparison.OrdinalIgnoreCase);
        }

        /// <summary>Returns the decoded value of the first query parameter called <paramref name="name"/>, or null.</summary>
        private static string GetQueryParameter(string url, string name)
        {
            if (string.IsNullOrEmpty(url))
            {
                return null;
            }

            int fragmentStart = url.IndexOf('#');
            string withoutFragment = fragmentStart >= 0 ? url.Substring(0, fragmentStart) : url;
            int queryStart = withoutFragment.IndexOf('?');
            if (queryStart < 0)
            {
                return null;
            }

            string[] pairs = withoutFragment.Substring(queryStart + 1).Split('&');
            foreach (string pair in pairs)
            {
                int equals = pair.IndexOf('=');
                string key = equals >= 0 ? pair.Substring(0, equals) : pair;
                if (DecodeQueryComponent(key) != name)
                {
                    continue;
                }

                return equals >= 0 ? DecodeQueryComponent(pair.Substring(equals + 1)) : "";
            }

            return null;
        }

        private static string DecodeQueryComponent(string value)
        {
            // In a query string '+' means a space; percent-escapes are decoded as UTF-8.
            return Uri.UnescapeDataString(value.Replace('+', ' '));
        }

        /// <summary>Returns scheme://host[:port] for an http(s) URL, else null.</summary>
        private static string GetHttpOrigin(string pageUrl)
        {
            if (string.IsNullOrEmpty(pageUrl))
            {
                return null;
            }

            Uri uri;
            if (!Uri.TryCreate(pageUrl, UriKind.Absolute, out uri))
            {
                return null;
            }

            if (uri.Scheme != "http" && uri.Scheme != "https")
            {
                return null;
            }

            return uri.GetLeftPart(UriPartial.Authority);
        }

        private static string AppendQueryParameter(string url, string name, string value)
        {
            int fragmentStart = url.IndexOf('#');
            string fragment = fragmentStart >= 0 ? url.Substring(fragmentStart) : "";
            string beforeFragment = fragmentStart >= 0 ? url.Substring(0, fragmentStart) : url;
            string separator = beforeFragment.IndexOf('?') >= 0 ? "&" : "?";
            return beforeFragment + separator + name + "=" + Uri.EscapeDataString(value) + fragment;
        }
    }
}
