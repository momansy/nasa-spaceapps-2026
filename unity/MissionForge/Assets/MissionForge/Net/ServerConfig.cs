using UnityEngine;

namespace MissionForge.Net
{
    /// <summary>
    /// Where the room server lives and how the join link shown to players is built.
    /// Create one through Assets &gt; Create &gt; MissionForge &gt; Server Config.
    /// </summary>
    [CreateAssetMenu(menuName = "MissionForge/Server Config")]
    public sealed class ServerConfig : ScriptableObject
    {
        /// <summary>Default of <see cref="serverUrl"/>: the local stub server.</summary>
        public const string DefaultServerUrl = "ws://localhost:8787";

        /// <summary>Default of <see cref="joinUrlTemplate"/>.</summary>
        public const string DefaultJoinUrlTemplate = ServerUrlResolver.DefaultJoinUrlTemplate;

        /// <summary>Default of <see cref="fallbackOrigin"/>: the local phone-client dev server.</summary>
        public const string DefaultFallbackOrigin = "http://localhost:5173";

        /// <summary>
        /// WebSocket URL of the room server. In WebGL builds a <c>?server=ws://...</c> query
        /// parameter on the page URL overrides it.
        /// </summary>
        [Tooltip("WebSocket URL of the room server. A ?server=ws://... page query parameter overrides it in WebGL builds.")]
        public string serverUrl = DefaultServerUrl;

        /// <summary>Join link template. <c>{origin}</c> and <c>{code}</c> are replaced.</summary>
        [Tooltip("Join link template. {origin} is the page origin (or the fallback origin), {code} is the room code.")]
        public string joinUrlTemplate = DefaultJoinUrlTemplate;

        /// <summary>Origin used for <c>{origin}</c> when the game does not run on an http(s) page (Editor, desktop).</summary>
        [Tooltip("Origin used for {origin} when the game is not running on an http(s) page (Editor, desktop builds).")]
        public string fallbackOrigin = DefaultFallbackOrigin;
    }
}
