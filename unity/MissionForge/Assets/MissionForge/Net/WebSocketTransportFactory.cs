namespace MissionForge.Net
{
    /// <summary>Creates the <see cref="IWebSocketTransport"/> that fits the current platform.</summary>
    public static class WebSocketTransportFactory
    {
        /// <summary>
        /// Returns a browser-backed transport in WebGL player builds and a
        /// <c>ClientWebSocket</c>-backed transport everywhere else (Editor, desktop).
        /// </summary>
        public static IWebSocketTransport Create()
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            return new WebGLWebSocketTransport();
#else
            return new ManagedWebSocketTransport();
#endif
        }
    }
}
