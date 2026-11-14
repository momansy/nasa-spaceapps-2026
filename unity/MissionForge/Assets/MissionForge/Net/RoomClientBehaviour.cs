using System;
using UnityEngine;

namespace MissionForge.Net
{
    /// <summary>
    /// Scene component that owns a <see cref="RoomClient"/>, ticks it every frame and disconnects
    /// it when destroyed. It does not call <c>DontDestroyOnLoad</c>; the owner decides its lifetime.
    /// </summary>
    [DisallowMultipleComponent]
    public sealed class RoomClientBehaviour : MonoBehaviour
    {
        /// <summary>Server settings. Built-in defaults are used when this is not assigned.</summary>
        [Tooltip("Server settings. Built-in defaults (local stub server) are used when not assigned.")]
        public ServerConfig config;

        private RoomClient _client;

        /// <summary>The room client. Created on first use; it stays valid until this component is destroyed.</summary>
        public RoomClient Client
        {
            get
            {
                if (_client == null)
                {
                    _client = CreateClient();
                }

                return _client;
            }
        }

        /// <summary>
        /// Server URL that will be used: the page's <c>?server=</c> override (WebGL) when present,
        /// otherwise the configured URL.
        /// </summary>
        public string ResolvedServerUrl
        {
            get
            {
                string configured = config != null ? config.serverUrl : ServerConfig.DefaultServerUrl;
                return ServerUrlResolver.ResolveServerUrl(configured, Application.absoluteURL);
            }
        }

        /// <summary>Builds the link players open to join the room.</summary>
        /// <param name="code">Room code.</param>
        /// <param name="serverJoinUrl">Join URL from <c>room.created</c>; wins when not empty.</param>
        public string BuildJoinUrl(string code, string serverJoinUrl)
        {
            string template = config != null ? config.joinUrlTemplate : ServerConfig.DefaultJoinUrlTemplate;
            string fallbackOrigin = config != null ? config.fallbackOrigin : ServerConfig.DefaultFallbackOrigin;
            return ServerUrlResolver.BuildJoinUrl(template, Application.absoluteURL, fallbackOrigin, code, serverJoinUrl);
        }

        /// <summary>Connects to <see cref="ResolvedServerUrl"/> unless the client is already connected or trying to.</summary>
        public void ConnectIfNeeded()
        {
            if (Client.State != ConnectionState.Disconnected)
            {
                return;
            }

            Client.Connect(ResolvedServerUrl);
        }

        private void Update()
        {
            if (_client != null)
            {
                _client.Tick(Time.realtimeSinceStartupAsDouble);
            }
        }

        private void OnDestroy()
        {
            if (_client == null)
            {
                return;
            }

            _client.ProtocolError -= OnProtocolError;
            _client.TransportError -= OnTransportError;
            _client.Disconnect();
            _client = null;
        }

        private RoomClient CreateClient()
        {
            // Seeded per run so several hosts do not retry in lockstep.
            var backoff = new BackoffPolicy(seed: Environment.TickCount);
            var client = new RoomClient(WebSocketTransportFactory.Create, backoff);
            client.ProtocolError += OnProtocolError;
            client.TransportError += OnTransportError;
            return client;
        }

        private void OnProtocolError(string message)
        {
            Debug.LogWarning("[MissionForge.Net] Protocol error: " + message, this);
        }

        private void OnTransportError(string message)
        {
            // Only the first fault of an outage is logged; retries would repeat it every few seconds.
            if (_client != null && _client.ReconnectAttempts == 0)
            {
                Debug.LogWarning("[MissionForge.Net] Connection problem: " + message, this);
            }
        }
    }
}
