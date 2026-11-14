using System.Collections.Generic;
using Newtonsoft.Json;
using UnityEngine.Scripting;

namespace MissionForge.Net
{
    // Plain payload DTOs. They tolerate unknown and missing fields: read them through
    // ProtocolJson.TryRead, which ignores unknown members and JSON nulls so the defaults
    // below survive. [Preserve] keeps the constructors alive under IL2CPP managed stripping,
    // because Json.NET creates these types through reflection.

    /// <summary>Payload of <c>room.created</c>.</summary>
    [Preserve]
    public sealed class RoomCreatedDto
    {
        /// <summary>Room code players type to join.</summary>
        [JsonProperty(ProtocolNames.Fields.Code)]
        public string Code = "";

        /// <summary>Opaque secret that lets the host resume the room after a reconnect.</summary>
        [JsonProperty(ProtocolNames.Fields.HostToken)]
        public string HostToken = "";

        /// <summary>Optional join URL chosen by the server; null when the client should build one.</summary>
        [JsonProperty(ProtocolNames.Fields.JoinUrl)]
        public string JoinUrl;
    }

    /// <summary>One entry of <see cref="RoomStateDto.Players"/>.</summary>
    [Preserve]
    public sealed class PlayerDto
    {
        [JsonProperty(ProtocolNames.Fields.Id)]
        public string Id = "";

        [JsonProperty(ProtocolNames.Fields.Nickname)]
        public string Nickname = "";

        [JsonProperty(ProtocolNames.Fields.Avatar)]
        public string Avatar = "";

        /// <summary>Mission Control role id such as <c>FLIGHT</c>, or null while unassigned.</summary>
        [JsonProperty(ProtocolNames.Fields.Role)]
        public string Role;

        /// <summary>False while the player's device is disconnected. Defaults to true when the server omits it.</summary>
        [JsonProperty(ProtocolNames.Fields.Connected)]
        public bool Connected = true;

        [JsonProperty(ProtocolNames.Fields.Spectator)]
        public bool Spectator;
    }

    /// <summary>The <c>settings</c> object of <c>room.state</c>.</summary>
    [Preserve]
    public sealed class RoomSettingsDto
    {
        /// <summary>How roles are assigned: random, pick or vote.</summary>
        [JsonProperty(ProtocolNames.Fields.RoleMode)]
        public string RoleMode = ProtocolNames.Values.RoleModeRandom;

        /// <summary>Assist level: cadet, engineer or flight_director.</summary>
        [JsonProperty(ProtocolNames.Fields.Assist)]
        public string Assist = ProtocolNames.Values.AssistCadet;

        /// <summary>Vote timer in seconds.</summary>
        [JsonProperty(ProtocolNames.Fields.VoteTimerS)]
        public int VoteTimerS = ProtocolNames.Values.DefaultVoteTimerS;

        [JsonProperty(ProtocolNames.Fields.HiddenTallies)]
        public bool HiddenTallies;
    }

    /// <summary>Payload of <c>room.state</c>.</summary>
    [Preserve]
    public sealed class RoomStateDto
    {
        [JsonProperty(ProtocolNames.Fields.Code)]
        public string Code = "";

        [JsonProperty(ProtocolNames.Fields.Phase)]
        public string Phase = ProtocolNames.Values.PhaseLobby;

        /// <summary>Players in join order. Never null and never contains null entries.</summary>
        [JsonProperty(ProtocolNames.Fields.Players)]
        public List<PlayerDto> Players = new List<PlayerDto>();

        /// <summary>Room settings. Never null.</summary>
        [JsonProperty(ProtocolNames.Fields.Settings)]
        public RoomSettingsDto Settings = new RoomSettingsDto();

        /// <summary>Restores the null-safety guarantees after deserialization.</summary>
        internal void Normalize()
        {
            if (Players == null)
            {
                Players = new List<PlayerDto>();
            }

            Players.RemoveAll(player => player == null);

            if (Settings == null)
            {
                Settings = new RoomSettingsDto();
            }
        }
    }

    /// <summary>Payload of the server's <c>error</c> message.</summary>
    [Preserve]
    public sealed class ErrorDto
    {
        /// <summary>Machine-readable code such as <c>room_not_found</c>.</summary>
        [JsonProperty(ProtocolNames.Fields.Code)]
        public string Code = "";

        /// <summary>Human-readable description.</summary>
        [JsonProperty(ProtocolNames.Fields.Message)]
        public string Message = "";
    }
}
