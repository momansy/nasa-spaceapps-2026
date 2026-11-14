using System;
using MissionForge.Net;
using Newtonsoft.Json.Linq;

namespace MissionForge.Screens.BuildBay
{
    /// <summary>
    /// Where the Build Bay's vote messages go and come from. The room server is the authority for votes; the
    /// rehearsal driver (editor and MF_REHEARSAL builds) stands in for it with synthetic players and
    /// feeds the very same handler.
    /// </summary>
    public interface IBayVoteChannel : IDisposable
    {
        /// <summary>True for the rehearsal driver (shown as REHEARSAL on screen).</summary>
        bool IsRehearsal { get; }

        /// <summary>Sends a host message (<c>vote.open</c>, <c>vote.commit</c>, <c>build.state</c>, <c>vote.cancel</c>).</summary>
        void Send(string type, JObject payload);

        /// <summary>Server messages: (type, payload).</summary>
        event Action<string, JObject> Received;

        /// <summary>True once the clock offset is known (clock.ping/pong); timers stay hidden until then.</summary>
        bool HasClock { get; }

        /// <summary>Server-clock now in ms (local clock corrected by the clock.ping/pong offset).</summary>
        long ServerNowMs();

        /// <summary>Display name for a player id (falls back to the id).</summary>
        string PlayerName(string playerId);

        /// <summary>Called every frame by the director.</summary>
        void Tick();
    }

    /// <summary>The real room: <see cref="RoomClient"/> with its clock offset.</summary>
    public sealed class RoomVoteChannel : IBayVoteChannel
    {
        private readonly RoomClient _client;

        public RoomVoteChannel(RoomClient client)
        {
            _client = client ?? throw new ArgumentNullException(nameof(client));
            _client.MessageReceived += OnMessage;
        }

        public bool IsRehearsal => false;
        public bool HasClock => _client.HasServerClock;
        public event Action<string, JObject> Received;

        public void Send(string type, JObject payload) => _client.Send(type, payload);

        public long ServerNowMs() =>
            _client.HasServerClock ? _client.EstimateServerTimeMs() : DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        public string PlayerName(string playerId)
        {
            PlayerInfoDto p = _client.LastRoomState?.FindPlayer(playerId);
            return p != null && !string.IsNullOrEmpty(p.Nickname) ? p.Nickname : playerId;
        }

        public void Tick()
        {
        }

        private void OnMessage(Envelope e)
        {
            if (e?.Type == null) return;
            if (e.Type.StartsWith("vote.", StringComparison.Ordinal) || e.Type == "ping.event") Received?.Invoke(e.Type, e.Data);
        }

        public void Dispose() => _client.MessageReceived -= OnMessage;
    }
}
