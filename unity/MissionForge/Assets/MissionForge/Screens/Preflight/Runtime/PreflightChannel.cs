using System;
using System.Collections.Generic;
using MissionForge.Net;
using MissionForge.Screens.BuildBay;
using Newtonsoft.Json.Linq;

namespace MissionForge.Screens.Preflight
{
    /// <summary>One player seat as the pre-flight screens show it.</summary>
    public sealed class Seat
    {
        public string PlayerId;
        public string Name;
        public bool Connected = true;
        public readonly List<string> Roles = new List<string>();
    }

    /// <summary>
    /// Where the pre-flight screens' messages go and come from: the real room (<see cref="RoomPreflightChannel"/>) or the
    /// rehearsal driver. Extends the Build Bay's vote channel with <c>poll.*</c> messages, the room roster and the
    /// host-to-server <c>phase.set</c>.
    /// </summary>
    public interface IPreflightChannel : IBayVoteChannel
    {
        /// <summary>Players in the room in seat order, with the roles each holds.</summary>
        IReadOnlyList<Seat> Seats { get; }

        /// <summary>Room language code and accessibility flags (null until known).</summary>
        RoomSettingsDto Settings { get; }
    }

    /// <summary>The real room: <see cref="RoomClient"/> with its server-clock offset and roster.</summary>
    public sealed class RoomPreflightChannel : IPreflightChannel
    {
        private readonly RoomClient _client;
        private readonly List<Seat> _seats = new List<Seat>();

        public RoomPreflightChannel(RoomClient client)
        {
            _client = client ?? throw new ArgumentNullException(nameof(client));
            _client.MessageReceived += OnMessage;
        }

        public bool IsRehearsal => false;
        public bool HasClock => _client.HasServerClock;
        public RoomSettingsDto Settings => _client.LastSettings;
        public event Action<string, JObject> Received;

        public void Send(string type, JObject payload) => _client.Send(type, payload);

        public long ServerNowMs() =>
            _client.HasServerClock ? _client.EstimateServerTimeMs() : DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        public string PlayerName(string playerId)
        {
            PlayerInfoDto p = _client.LastRoomState?.FindPlayer(playerId);
            return p != null && !string.IsNullOrEmpty(p.Nickname) ? p.Nickname : playerId;
        }

        public IReadOnlyList<Seat> Seats
        {
            get
            {
                _seats.Clear();
                RoomStateDto room = _client.LastRoomState;
                if (room == null) return _seats;
                foreach (PlayerInfoDto p in room.Players)
                {
                    var seat = new Seat { PlayerId = p.Id, Name = string.IsNullOrEmpty(p.Nickname) ? p.Id : p.Nickname, Connected = p.Connected };
                    if (_client.LastRolesState != null) seat.Roles.AddRange(_client.LastRolesState.RolesOf(p.Id));
                    _seats.Add(seat);
                }
                return _seats;
            }
        }

        public void Tick()
        {
        }

        private void OnMessage(Envelope e)
        {
            if (e?.Type == null) return;
            if (e.Type.StartsWith("vote.", StringComparison.Ordinal) || e.Type.StartsWith("poll.", StringComparison.Ordinal) || e.Type == "ping.event")
                Received?.Invoke(e.Type, e.Data);
        }

        public void Dispose() => _client.MessageReceived -= OnMessage;
    }
}
