using System;
using System.Collections.Generic;
using MissionForge.Net;
using Newtonsoft.Json.Linq;

namespace MissionForge.Screens.Flight
{
    /// <summary>
    /// What <see cref="FlightMinigameHost"/> needs from the room connection. The live implementation is
    /// <see cref="RoomMinigameChannel"/>; <see cref="RehearsalMinigameChannel"/> simulates phones offline.
    /// </summary>
    public interface IMinigameChannel
    {
        /// <summary>True when messages sent now reach the phones.</summary>
        bool IsConnected { get; }

        /// <summary>Current server clock, ms since the Unix epoch.</summary>
        long NowMs();

        /// <summary>Sends a host message (<c>mg.start</c>, <c>mg.summary</c>, <c>mg.cancel</c>). The host always passes a <see cref="JObject"/>.</summary>
        void Send(string type, object payload);

        /// <summary>A phone message arrived: (from PlayerId, inner type, inner payload).</summary>
        event Action<string, string, JObject> Received;

        /// <summary>PlayerIds of the currently connected players.</summary>
        IReadOnlyList<string> PlayerIds { get; }
    }

    /// <summary>Adapts <see cref="RoomClient"/> to <see cref="IMinigameChannel"/>: relayed messages become <see cref="Received"/>.</summary>
    public sealed class RoomMinigameChannel : IMinigameChannel, IDisposable
    {
        private readonly RoomClient _client;

        public RoomMinigameChannel(RoomClient client)
        {
            _client = client ?? throw new ArgumentNullException(nameof(client));
            _client.RelayReceived += OnRelay;
        }

        public event Action<string, string, JObject> Received;

        public bool IsConnected => _client.State == ConnectionState.Connected;

        /// <summary>Assist level from the room settings (default ENGINEER).</summary>
        public string AssistLevel => _client.LastSettings?.AssistLevel ?? ProtocolNames.AssistLevels.Engineer;

        public IReadOnlyList<string> PlayerIds
        {
            get
            {
                var ids = new List<string>();
                RoomStateDto room = _client.LastRoomState;
                if (room?.Players == null) return ids;
                foreach (PlayerInfoDto p in room.Players)
                {
                    if (p != null && p.Connected && !string.IsNullOrEmpty(p.Id)) ids.Add(p.Id);
                }
                return ids;
            }
        }

        /// <summary>Server clock when synchronised, else local UTC (the phones correct for skew themselves).</summary>
        public long NowMs() =>
            _client.HasServerClock ? _client.EstimateServerTimeMs() : DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        public void Send(string type, object payload) => _client.Send(type, payload);

        public void Dispose() => _client.RelayReceived -= OnRelay;

        private void OnRelay(RelayDto relay)
        {
            if (relay == null || string.IsNullOrEmpty(relay.Type)) return;
            Received?.Invoke(relay.From, relay.Type, relay.Data ?? new JObject());
        }
    }
}
