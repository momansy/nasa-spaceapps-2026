namespace MissionForge.Net
{
    /// <summary>
    /// Single home of every provisional protocol string: message types, payload field names and
    /// well-known values. The formal protocol (protocol/messages.md) is not merged yet; when it
    /// lands, change the names here (and in Tools~/stub-server/lib/protocol.mjs) only.
    /// </summary>
    public static class ProtocolNames
    {
        /// <summary>Protocol version sent in <see cref="Messages.RoomCreate"/>.</summary>
        public const int ProtocolVersion = 1;

        /// <summary>Letters allowed in a room code (no confusable I, O or L).</summary>
        public const string RoomCodeAlphabet = "ABCDEFGHJKMNPQRSTUVWXYZ";

        /// <summary>Number of letters in a room code.</summary>
        public const int RoomCodeLength = 4;

        /// <summary>Property names of the message envelope <c>{"t":..,"seq":..,"d":{..}}</c>.</summary>
        public static class EnvelopeFields
        {
            public const string Type = "t";
            public const string Seq = "seq";
            public const string Data = "d";
        }

        /// <summary>Message type strings (the envelope's <c>t</c>).</summary>
        public static class Messages
        {
            // Host <-> server (provisional).
            public const string RoomCreate = "room.create";
            public const string RoomCreated = "room.created";
            public const string RoomResume = "room.resume";
            public const string RoomSettings = "room.settings";
            public const string PhaseSet = "phase.set";

            // Player <-> server.
            public const string RoomJoin = "room.join";
            public const string RoomJoined = "room.joined";

            // Server -> everyone.
            public const string RoomState = "room.state";
            public const string Error = "error";

            // Keepalive.
            public const string Ping = "ping";
            public const string Pong = "pong";

            // Named in the design document; payloads are not defined yet.
            public const string VoteOpen = "vote.open";
            public const string VoteCast = "vote.cast";
            public const string VoteResult = "vote.result";
            public const string PingSend = "ping.send";
            public const string ConsoleTelemetry = "console.telemetry";
            public const string MinigameStart = "mg.start";
            public const string MinigameResult = "mg.result";
            public const string MinigameSummary = "mg.summary";
        }

        /// <summary>Payload field names (inside the envelope's <c>d</c>).</summary>
        public static class Fields
        {
            // room.create
            public const string Client = "client";
            public const string Version = "version";

            // room.created / room.resume / room.join / room.state
            public const string Code = "code";
            public const string HostToken = "hostToken";
            public const string JoinUrl = "joinUrl";

            // room.state
            public const string Phase = "phase";
            public const string Players = "players";
            public const string Settings = "settings";

            // player entry / room.join
            public const string Id = "id";
            public const string Nickname = "nickname";
            public const string Avatar = "avatar";
            public const string Role = "role";
            public const string Connected = "connected";
            public const string Spectator = "spectator";

            // settings
            public const string RoleMode = "roleMode";
            public const string Assist = "assist";
            public const string VoteTimerS = "voteTimerS";
            public const string HiddenTallies = "hiddenTallies";

            // room.joined
            public const string PlayerId = "playerId";
            public const string Token = "token";

            // error (it also uses Code)
            public const string Message = "message";

            // ping / pong: client timestamp in milliseconds, echoed back by the server
            public const string Time = "t";
        }

        /// <summary>Well-known payload values.</summary>
        public static class Values
        {
            public const string ClientHost = "host";

            public const string PhaseLobby = "LOBBY";
            public const string PhaseBriefing = "BRIEFING";

            public const string RoleModeRandom = "random";
            public const string RoleModePick = "pick";
            public const string RoleModeVote = "vote";

            public const string AssistCadet = "cadet";
            public const string AssistEngineer = "engineer";
            public const string AssistFlightDirector = "flight_director";

            public const int DefaultVoteTimerS = 30;
        }

        /// <summary>Values of the <c>code</c> field of an <see cref="Messages.Error"/> message.</summary>
        public static class ErrorCodes
        {
            public const string RoomNotFound = "room_not_found";
        }
    }
}
