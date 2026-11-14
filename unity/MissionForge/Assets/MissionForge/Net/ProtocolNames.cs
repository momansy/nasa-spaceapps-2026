namespace MissionForge.Net
{
    /// <summary>
    /// Single home of every protocol string the Unity host uses: message types, payload field names
    /// and enumerated values. They mirror the wire contract exactly: <c>protocol/messages.md</c>
    /// (source of truth), <c>protocol/schema/&lt;type&gt;.schema.json</c> and
    /// <c>protocol/ts/messages.ts</c> at the repository root. Protocol version 1.
    /// </summary>
    /// <remarks>
    /// <see cref="Messages"/> lists all 105 message types; an EditMode test checks it against the
    /// schema file names, so a type added to or removed from the contract fails the test until it
    /// is mirrored here.
    /// </remarks>
    public static class ProtocolNames
    {
        /// <summary>Protocol version sent in <c>hello.protocolVersion</c> (messages.md, Versioning).</summary>
        public const int ProtocolVersion = 1;

        /// <summary>Letters allowed in a room code: A–Z without I and O (messages.md 4.1, shared type RoomCode).</summary>
        public const string RoomCodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ";

        /// <summary>Number of letters in a room code.</summary>
        public const int RoomCodeLength = 4;

        /// <summary>Property names of the message envelope <c>{"t":..,"seq":..,"d":{..}}</c>.</summary>
        public static class EnvelopeFields
        {
            public const string Type = "t";
            public const string Seq = "seq";
            public const string Data = "d";
        }

        /// <summary>
        /// Every message type of the contract (the envelope's <c>t</c>), in the order of
        /// <c>MESSAGE_META</c> in <c>protocol/ts/messages.ts</c>. Only message types belong here.
        /// </summary>
        public static class Messages
        {
            /// <summary><c>hello</c>: any -> server.</summary>
            public const string Hello = "hello";

            /// <summary><c>hello.ok</c>: server -> host and phones.</summary>
            public const string HelloOk = "hello.ok";

            /// <summary><c>clock.ping</c>: any -> server.</summary>
            public const string ClockPing = "clock.ping";

            /// <summary><c>clock.pong</c>: server -> host and phones.</summary>
            public const string ClockPong = "clock.pong";

            /// <summary><c>error</c>: server -> host and phones.</summary>
            public const string Error = "error";

            /// <summary><c>bye</c>: server -> host and phones.</summary>
            public const string Bye = "bye";

            /// <summary><c>relay</c>: server -> host.</summary>
            public const string Relay = "relay";

            /// <summary><c>snapshot.end</c>: server -> host and phones.</summary>
            public const string SnapshotEnd = "snapshot.end";

            /// <summary><c>room.create</c>: host -> server.</summary>
            public const string RoomCreate = "room.create";

            /// <summary><c>room.created</c>: server -> host.</summary>
            public const string RoomCreated = "room.created";

            /// <summary><c>room.join</c>: phone -> server.</summary>
            public const string RoomJoin = "room.join";

            /// <summary><c>room.joined</c>: server -> phone.</summary>
            public const string RoomJoined = "room.joined";

            /// <summary><c>room.resume</c>: any -> server.</summary>
            public const string RoomResume = "room.resume";

            /// <summary><c>room.resumed</c>: server -> host and phones.</summary>
            public const string RoomResumed = "room.resumed";

            /// <summary><c>room.state</c>: server -> host and phones.</summary>
            public const string RoomState = "room.state";

            /// <summary><c>room.leave</c>: phone -> server.</summary>
            public const string RoomLeave = "room.leave";

            /// <summary><c>room.kick</c>: host -> server.</summary>
            public const string RoomKick = "room.kick";

            /// <summary><c>room.close</c>: host -> server.</summary>
            public const string RoomClose = "room.close";

            /// <summary><c>room.promoted</c>: server -> phone.</summary>
            public const string RoomPromoted = "room.promoted";

            /// <summary><c>player.profile</c>: phone -> server.</summary>
            public const string PlayerProfile = "player.profile";

            /// <summary><c>player.prefs</c>: phone -> server.</summary>
            public const string PlayerPrefs = "player.prefs";

            /// <summary><c>settings.set</c>: host -> server.</summary>
            public const string SettingsSet = "settings.set";

            /// <summary><c>settings.state</c>: server -> host and phones.</summary>
            public const string SettingsState = "settings.state";

            /// <summary><c>roles.pick</c>: phone -> server.</summary>
            public const string RolesPick = "roles.pick";

            /// <summary><c>roles.vote</c>: phone -> server.</summary>
            public const string RolesVote = "roles.vote";

            /// <summary><c>roles.lock</c>: host -> server.</summary>
            public const string RolesLock = "roles.lock";

            /// <summary><c>roles.set</c>: host -> server.</summary>
            public const string RolesSet = "roles.set";

            /// <summary><c>roles.rotate</c>: host -> server.</summary>
            public const string RolesRotate = "roles.rotate";

            /// <summary><c>roles.state</c>: server -> host and phones.</summary>
            public const string RolesState = "roles.state";

            /// <summary><c>ability.use</c>: phone -> server.</summary>
            public const string AbilityUse = "ability.use";

            /// <summary><c>ability.requested</c>: server -> host.</summary>
            public const string AbilityRequested = "ability.requested";

            /// <summary><c>ability.resolve</c>: host -> server.</summary>
            public const string AbilityResolve = "ability.resolve";

            /// <summary><c>ability.consume</c>: host -> server.</summary>
            public const string AbilityConsume = "ability.consume";

            /// <summary><c>ability.used</c>: server -> host and phones.</summary>
            public const string AbilityUsed = "ability.used";

            /// <summary><c>phase.set</c>: host -> server -> phones (relayed unchanged).</summary>
            public const string PhaseSet = "phase.set";

            /// <summary><c>game.pause</c>: host -> server.</summary>
            public const string GamePause = "game.pause";

            /// <summary><c>game.paused</c>: server -> host and phones.</summary>
            public const string GamePaused = "game.paused";

            /// <summary><c>game.resume</c>: host -> server.</summary>
            public const string GameResume = "game.resume";

            /// <summary><c>game.resumed</c>: server -> host and phones.</summary>
            public const string GameResumed = "game.resumed";

            /// <summary><c>notice.show</c>: host -> server -> phones (relayed unchanged).</summary>
            public const string NoticeShow = "notice.show";

            /// <summary><c>build.state</c>: host -> server -> phones (relayed unchanged).</summary>
            public const string BuildState = "build.state";

            /// <summary><c>build.event</c>: host -> server -> phones (relayed unchanged).</summary>
            public const string BuildEvent = "build.event";

            /// <summary><c>flight.event</c>: host -> server -> phones (relayed unchanged).</summary>
            public const string FlightEvent = "flight.event";

            /// <summary><c>flight.hud</c>: host -> server -> phones (relayed unchanged).</summary>
            public const string FlightHud = "flight.hud";

            /// <summary><c>vote.open</c>: host -> server.</summary>
            public const string VoteOpen = "vote.open";

            /// <summary><c>vote.opened</c>: server -> host and phones.</summary>
            public const string VoteOpened = "vote.opened";

            /// <summary><c>vote.stage</c>: server -> host and phones.</summary>
            public const string VoteStage = "vote.stage";

            /// <summary><c>vote.insight</c>: host -> server -> phones (relayed unchanged).</summary>
            public const string VoteInsight = "vote.insight";

            /// <summary><c>vote.predict</c>: phone -> server.</summary>
            public const string VotePredict = "vote.predict";

            /// <summary><c>vote.predict.result</c>: server -> host and phones.</summary>
            public const string VotePredictResult = "vote.predict.result";

            /// <summary><c>vote.tag</c>: phone -> server.</summary>
            public const string VoteTag = "vote.tag";

            /// <summary><c>vote.tags</c>: server -> host and phones.</summary>
            public const string VoteTags = "vote.tags";

            /// <summary><c>vote.cast</c>: phone -> server.</summary>
            public const string VoteCast = "vote.cast";

            /// <summary><c>vote.ack</c>: server -> phone.</summary>
            public const string VoteAck = "vote.ack";

            /// <summary><c>vote.tally</c>: server -> host and phones.</summary>
            public const string VoteTally = "vote.tally";

            /// <summary><c>vote.veto</c>: phone -> server.</summary>
            public const string VoteVeto = "vote.veto";

            /// <summary><c>vote.vetoed</c>: server -> host and phones.</summary>
            public const string VoteVetoed = "vote.vetoed";

            /// <summary><c>vote.close</c>: host -> server.</summary>
            public const string VoteClose = "vote.close";

            /// <summary><c>vote.cancel</c>: host -> server.</summary>
            public const string VoteCancel = "vote.cancel";

            /// <summary><c>vote.cancelled</c>: server -> host and phones.</summary>
            public const string VoteCancelled = "vote.cancelled";

            /// <summary><c>vote.trivia.open</c>: server -> host and phones.</summary>
            public const string VoteTriviaOpen = "vote.trivia.open";

            /// <summary><c>vote.trivia.answer</c>: phone -> server.</summary>
            public const string VoteTriviaAnswer = "vote.trivia.answer";

            /// <summary><c>vote.trivia.result</c>: server -> host and phones.</summary>
            public const string VoteTriviaResult = "vote.trivia.result";

            /// <summary><c>vote.trivia.pick</c>: phone -> server.</summary>
            public const string VoteTriviaPick = "vote.trivia.pick";

            /// <summary><c>vote.result</c>: server -> host and phones.</summary>
            public const string VoteResult = "vote.result";

            /// <summary><c>vote.commit</c>: host -> server -> phones (relayed unchanged).</summary>
            public const string VoteCommit = "vote.commit";

            /// <summary><c>ping.send</c>: phone -> server.</summary>
            public const string PingSend = "ping.send";

            /// <summary><c>ping.event</c>: server -> host and phones.</summary>
            public const string PingEvent = "ping.event";

            /// <summary><c>react.send</c>: phone -> server.</summary>
            public const string ReactSend = "react.send";

            /// <summary><c>react.event</c>: server -> host and phones.</summary>
            public const string ReactEvent = "react.event";

            /// <summary><c>react.audience</c>: server -> host and phones.</summary>
            public const string ReactAudience = "react.audience";

            /// <summary><c>poll.open</c>: host -> server.</summary>
            public const string PollOpen = "poll.open";

            /// <summary><c>poll.call</c>: server -> host and phones.</summary>
            public const string PollCall = "poll.call";

            /// <summary><c>poll.answer</c>: phone -> server.</summary>
            public const string PollAnswer = "poll.answer";

            /// <summary><c>poll.answered</c>: server -> host and phones.</summary>
            public const string PollAnswered = "poll.answered";

            /// <summary><c>poll.result</c>: server -> host and phones.</summary>
            public const string PollResult = "poll.result";

            /// <summary><c>pilot.assign</c>: host -> server -> phones (relayed unchanged).</summary>
            public const string PilotAssign = "pilot.assign";

            /// <summary><c>pilot.input</c>: phone -> server -> host (inside relay).</summary>
            public const string PilotInput = "pilot.input";

            /// <summary><c>pilot.action</c>: phone -> server -> host (inside relay).</summary>
            public const string PilotAction = "pilot.action";

            /// <summary><c>copilot.action</c>: phone -> server -> host (inside relay).</summary>
            public const string CopilotAction = "copilot.action";

            /// <summary><c>pilot.hud</c>: host -> server -> phones (relayed unchanged).</summary>
            public const string PilotHud = "pilot.hud";

            /// <summary><c>console.config</c>: host -> server -> phones (relayed unchanged).</summary>
            public const string ConsoleConfig = "console.config";

            /// <summary><c>console.telemetry</c>: host -> server -> phones (relayed unchanged).</summary>
            public const string ConsoleTelemetry = "console.telemetry";

            /// <summary><c>console.alert</c>: host -> server -> phones (relayed unchanged).</summary>
            public const string ConsoleAlert = "console.alert";

            /// <summary><c>console.callout</c>: phone -> server -> host (inside relay).</summary>
            public const string ConsoleCallout = "console.callout";

            /// <summary><c>console.request</c>: phone -> server -> host (inside relay).</summary>
            public const string ConsoleRequest = "console.request";

            /// <summary><c>console.goodcall</c>: host -> server -> phones (relayed unchanged).</summary>
            public const string ConsoleGoodcall = "console.goodcall";

            /// <summary><c>blackout.set</c>: host -> server -> phones (relayed unchanged).</summary>
            public const string BlackoutSet = "blackout.set";

            /// <summary><c>haptic.cue</c>: host -> server -> phones (relayed unchanged).</summary>
            public const string HapticCue = "haptic.cue";

            /// <summary><c>sync.meter</c>: host -> server -> phones (relayed unchanged).</summary>
            public const string SyncMeter = "sync.meter";

            /// <summary><c>boost.applied</c>: host -> server -> phones (relayed unchanged).</summary>
            public const string BoostApplied = "boost.applied";

            /// <summary><c>boost.state</c>: host -> server -> phones (relayed unchanged).</summary>
            public const string BoostState = "boost.state";

            /// <summary><c>mg.start</c>: host -> server -> phones (relayed unchanged).</summary>
            public const string MgStart = "mg.start";

            /// <summary><c>mg.ready</c>: phone -> server -> host (inside relay).</summary>
            public const string MgReady = "mg.ready";

            /// <summary><c>mg.progress</c>: phone -> server -> host (inside relay).</summary>
            public const string MgProgress = "mg.progress";

            /// <summary><c>mg.action</c>: phone -> server -> host (inside relay).</summary>
            public const string MgAction = "mg.action";

            /// <summary><c>mg.state</c>: host -> server -> phones (relayed unchanged).</summary>
            public const string MgState = "mg.state";

            /// <summary><c>mg.result</c>: phone -> server -> host (inside relay).</summary>
            public const string MgResult = "mg.result";

            /// <summary><c>mg.summary</c>: host -> server -> phones (relayed unchanged).</summary>
            public const string MgSummary = "mg.summary";

            /// <summary><c>mg.cancel</c>: host -> server -> phones (relayed unchanged).</summary>
            public const string MgCancel = "mg.cancel";

            /// <summary><c>kp.awarded</c>: host -> server -> phones (relayed unchanged).</summary>
            public const string KpAwarded = "kp.awarded";

            /// <summary><c>codex.unlock</c>: host -> server -> phones (relayed unchanged).</summary>
            public const string CodexUnlock = "codex.unlock";

            /// <summary><c>debrief.score</c>: host -> server -> phones (relayed unchanged).</summary>
            public const string DebriefScore = "debrief.score";

            /// <summary><c>debrief.awards</c>: host -> server -> phones (relayed unchanged).</summary>
            public const string DebriefAwards = "debrief.awards";

            /// <summary><c>debrief.facts</c>: host -> server -> phones (relayed unchanged).</summary>
            public const string DebriefFacts = "debrief.facts";
        }

        /// <summary>Payload field names (inside the envelope's <c>d</c>), exact wire casing.</summary>
        public static class Fields
        {
            // hello / hello.ok
            public const string ProtocolVersion = "protocolVersion";
            public const string Client = "client";
            public const string AppVersion = "appVersion";
            public const string Lang = "lang";
            public const string ServerTimeMs = "serverTimeMs";
            public const string HeartbeatMs = "heartbeatMs";
            public const string IdleTimeoutMs = "idleTimeoutMs";
            public const string MaxFrameBytes = "maxFrameBytes";
            public const string MaxMsgsPerSec = "maxMsgsPerSec";
            public const string MaxBytesPerSec = "maxBytesPerSec";

            // clock.ping / clock.pong
            public const string ClientTimeMs = "clientTimeMs";

            // error
            public const string Code = "code";
            public const string Fatal = "fatal";
            public const string Re = "re";
            public const string ReT = "reT";
            public const string RetryAfterMs = "retryAfterMs";
            public const string Field = "field";
            public const string ServerProtocolVersion = "serverProtocolVersion";
            public const string Suggestion = "suggestion";

            // bye
            public const string Reason = "reason";
            public const string CloseCode = "closeCode";
            public const string CanResume = "canResume";

            // relay (inner type and payload use the envelope names "t" and "d")
            public const string From = "from";
            public const string RelayType = "t";
            public const string RelayData = "d";

            // snapshot.end / room.resume
            public const string LastOutcomeSeq = "lastOutcomeSeq";

            // room.create / room.created / room.join / room.joined / room.resume / room.resumed
            public const string Room = "room";
            public const string HostToken = "hostToken";
            public const string JoinUrl = "joinUrl";
            public const string SpectateUrl = "spectateUrl";
            public const string MaxPlayers = "maxPlayers";
            public const string SlotHoldMs = "slotHoldMs";
            public const string RoomHoldMs = "roomHoldMs";
            public const string Token = "token";
            public const string As = "as";
            public const string Kind = "kind";
            public const string Id = "id";
            public const string Slot = "slot";
            public const string PendingPlayer = "pendingPlayer";
            public const string SpectatorReason = "spectatorReason";
            public const string Paused = "paused";

            // room.state and PlayerInfo
            public const string HostConnected = "hostConnected";
            public const string Players = "players";
            public const string SpectatorCount = "spectatorCount";
            public const string PendingPlayerCount = "pendingPlayerCount";
            public const string Nickname = "nickname";
            public const string Avatar = "avatar";
            public const string Connected = "connected";
            public const string SlotExpiresAtMs = "slotExpiresAtMs";
            public const string VetoAvailable = "vetoAvailable";
            public const string Prefs = "prefs";

            // Avatar
            public const string SuitId = "suitId";
            public const string PatchId = "patchId";

            // PlayerPrefs (lang, reducedMotion and highContrast are shared with RoomA11y / RoomSettings)
            public const string Relaxed = "relaxed";
            public const string OneButton = "oneButton";
            public const string HoldToToggle = "holdToToggle";
            public const string ReducedMotion = "reducedMotion";
            public const string HighContrast = "highContrast";
            public const string TextScalePct = "textScalePct";
            public const string ScreenReader = "screenReader";
            public const string Haptics = "haptics";

            // settings.set / settings.state / room.create and RoomSettings / SettingsPatch
            public const string Settings = "settings";
            public const string RoleAssignMode = "roleAssignMode";
            public const string VoteTimerS = "voteTimerS";
            public const string InspectTimerS = "inspectTimerS";
            public const string TallyVisibility = "tallyVisibility";
            public const string StrictMajority = "strictMajority";
            public const string AssistLevel = "assistLevel";
            public const string AudienceVoteWeight = "audienceVoteWeight";
            public const string PilotRotation = "pilotRotation";
            public const string PilotSelect = "pilotSelect";
            public const string PassTheControls = "passTheControls";
            public const string A11y = "a11y";

            // RoomA11y
            public const string SlowTimers = "slowTimers";
            public const string RelaxedMinigames = "relaxedMinigames";
            public const string Subtitles = "subtitles";
            public const string ExplainTooltips = "explainTooltips";

            // roles.state, RoleGroup, roles.set, room.kick
            public const string Mode = "mode";
            public const string Locked = "locked";
            public const string Groups = "groups";
            public const string FlightVotes = "flightVotes";
            public const string AbilitiesUsed = "abilitiesUsed";
            public const string Lead = "lead";
            public const string Roles = "roles";
            public const string PlayerId = "playerId";
            public const string N = "n";
            public const string Assignments = "assignments";

            // phase.set
            public const string MissionSeq = "missionSeq";
            public const string Phase = "phase";
            public const string Sub = "sub";
            public const string Review = "review";
            public const string FlightPhase = "flightPhase";
            public const string Segment = "segment";
            public const string BoosterTrack = "boosterTrack";
            public const string ContractId = "contractId";
            public const string Step = "step";
            public const string Index = "index";
            public const string Total = "total";

            // game.paused / game.resumed
            public const string AtMs = "atMs";
            public const string RoomExpiresAtMs = "roomExpiresAtMs";
            public const string PausedForMs = "pausedForMs";
        }

        /// <summary>Enum <c>ClientKind</c>: value of <c>hello.client</c>.</summary>
        public static class ClientKinds
        {
            public const string Host = "HOST";
            public const string Phone = "PHONE";
        }

        /// <summary>Enum <c>ConnKind</c>: value of <c>room.resumed.kind</c>.</summary>
        public static class ConnKinds
        {
            public const string Host = "HOST";
            public const string Player = "PLAYER";
            public const string Spectator = "SPECTATOR";
        }

        /// <summary>The literal <c>room.resumed.id</c> of a resumed host connection.</summary>
        public const string HostConnectionId = "host";

        /// <summary>Enum <c>Phase</c> (top-level phase of <c>phase.set</c>).</summary>
        public static class Phases
        {
            public const string Lobby = "LOBBY";
            public const string Briefing = "BRIEFING";
            public const string ContractVote = "CONTRACT_VOTE";
            public const string Build = "BUILD";
            public const string Frr = "FRR";
            public const string Countdown = "COUNTDOWN";
            public const string Flight = "FLIGHT";
            public const string Debrief = "DEBRIEF";
            public const string CampaignHub = "CAMPAIGN_HUB";
        }

        /// <summary>Enum <c>SubPhase</c>.</summary>
        public static class SubPhases
        {
            public const string None = "NONE";
            public const string VoteRound = "VOTE_ROUND";
            public const string Test = "TEST";
            public const string Anomaly = "ANOMALY";
            public const string Review = "REVIEW";
            public const string Flying = "FLYING";
            public const string Abort = "ABORT";
            public const string Summary = "SUMMARY";
            public const string Investigation = "INVESTIGATION";
        }

        /// <summary>Values of <c>ReviewId</c>, <c>FlightPhase</c> and <c>FlightSegment</c> used for default <c>phase.set</c> payloads.</summary>
        public static class PhaseDetails
        {
            public const string ReviewFrr = "FRR";
            public const string FlightPhaseF0 = "F0";
            public const string FlightPhaseF2 = "F2";
            public const string SegmentAscent = "ASCENT";
        }

        /// <summary>Enum <c>GameMode</c>.</summary>
        public static class GameModes
        {
            public const string Quick = "QUICK";
            public const string Campaign = "CAMPAIGN";
            public const string Sandbox = "SANDBOX";
            public const string Daily = "DAILY";
            public const string Heritage = "HERITAGE";
            public const string Classroom = "CLASSROOM";
            public const string Solo = "SOLO";
            public const string Speedrun = "SPEEDRUN";
            public const string BudgetCrunch = "BUDGET_CRUNCH";
        }

        /// <summary>Enum <c>RoleId</c>, canonical order.</summary>
        public static class RoleIds
        {
            public const string Flight = "FLIGHT";
            public const string Booster = "BOOSTER";
            public const string Struct = "STRUCT";
            public const string Guido = "GUIDO";
            public const string Fido = "FIDO";
            public const string Eecom = "EECOM";
            public const string Inco = "INCO";
            public const string Payload = "PAYLOAD";
            public const string Retro = "RETRO";
            public const string Pm = "PM";
        }

        /// <summary>Enum <c>RoleAssignMode</c>.</summary>
        public static class RoleAssignModes
        {
            public const string Random = "RANDOM";
            public const string Pick = "PICK";
            public const string Vote = "VOTE";
        }

        /// <summary>Enum <c>AssistLevel</c>.</summary>
        public static class AssistLevels
        {
            public const string Cadet = "CADET";
            public const string Engineer = "ENGINEER";
            public const string FlightDirector = "FLIGHT_DIRECTOR";
        }

        /// <summary>Enum <c>TallyVisibility</c>.</summary>
        public static class TallyVisibilities
        {
            public const string Open = "OPEN";
            public const string Hidden = "HIDDEN";
        }

        /// <summary>Enum <c>PilotRotation</c>.</summary>
        public static class PilotRotations
        {
            public const string PerSegment = "PER_SEGMENT";
            public const string Single = "SINGLE";
        }

        /// <summary>Enum <c>PilotSelect</c>.</summary>
        public static class PilotSelects
        {
            public const string Rotation = "ROTATION";
            public const string Vote = "VOTE";
        }

        /// <summary>Enum <c>PauseReason</c>.</summary>
        public static class PauseReasons
        {
            public const string HostRequest = "HOST_REQUEST";
            public const string HostDisconnected = "HOST_DISCONNECTED";
        }

        /// <summary>Enum <c>ByeReason</c>; each value has a fixed close code (see <see cref="WebSocketCloseCodes"/>).</summary>
        public static class ByeReasons
        {
            public const string RoomClosed = "ROOM_CLOSED";
            public const string VersionMismatch = "VERSION_MISMATCH";
            public const string Kicked = "KICKED";
            public const string Replaced = "REPLACED";
            public const string RoomExpired = "ROOM_EXPIRED";
            public const string HandshakeTimeout = "HANDSHAKE_TIMEOUT";
            public const string Flood = "FLOOD";
            public const string ProtocolViolation = "PROTOCOL_VIOLATION";
            public const string ServerShutdown = "SERVER_SHUTDOWN";
            public const string Left = "LEFT";
            public const string IdleTimeout = "IDLE_TIMEOUT";
        }

        /// <summary>Enum <c>ErrorCode</c>: values of <c>error.code</c>.</summary>
        public static class ErrorCodes
        {
            public const string BadEnvelope = "BAD_ENVELOPE";
            public const string FrameTooLarge = "FRAME_TOO_LARGE";
            public const string HandshakeRequired = "HANDSHAKE_REQUIRED";
            public const string VersionMismatch = "VERSION_MISMATCH";
            public const string Flood = "FLOOD";
            public const string UnknownType = "UNKNOWN_TYPE";
            public const string BadPayload = "BAD_PAYLOAD";
            public const string Forbidden = "FORBIDDEN";
            public const string NotInRoom = "NOT_IN_ROOM";
            public const string AlreadyInRoom = "ALREADY_IN_ROOM";
            public const string RoomNotFound = "ROOM_NOT_FOUND";
            public const string TokenInvalid = "TOKEN_INVALID";
            public const string NickRejected = "NICK_REJECTED";
            public const string NickTaken = "NICK_TAKEN";
            public const string RateLimited = "RATE_LIMITED";
            public const string Paused = "PAUSED";
            public const string WrongPhase = "WRONG_PHASE";
            public const string WrongStage = "WRONG_STAGE";
            public const string InvalidTransition = "INVALID_TRANSITION";
            public const string SettingLocked = "SETTING_LOCKED";
            public const string UnknownPlayer = "UNKNOWN_PLAYER";
            public const string StaleId = "STALE_ID";
            public const string DuplicateId = "DUPLICATE_ID";
            public const string RoundActive = "ROUND_ACTIVE";
            public const string NoWinnableOption = "NO_WINNABLE_OPTION";
            public const string UnknownOption = "UNKNOWN_OPTION";
            public const string OptionVetoed = "OPTION_VETOED";
            public const string OptionNotWinnable = "OPTION_NOT_WINNABLE";
            public const string OptionUnaffordable = "OPTION_UNAFFORDABLE";
            public const string NotAVoter = "NOT_A_VOTER";
            public const string VetoNotAllowed = "VETO_NOT_ALLOWED";
            public const string VetoUsed = "VETO_USED";
            public const string VetoMinOptions = "VETO_MIN_OPTIONS";
            public const string NotRoleHolder = "NOT_ROLE_HOLDER";
            public const string AlreadyAnswered = "ALREADY_ANSWERED";
            public const string NotYourTurn = "NOT_YOUR_TURN";
            public const string AbilityUsed = "ABILITY_USED";
            public const string AbilityRejected = "ABILITY_REJECTED";
            public const string RoleTaken = "ROLE_TAKEN";
            public const string InvalidAssignment = "INVALID_ASSIGNMENT";
            public const string NotPilot = "NOT_PILOT";
            public const string Internal = "INTERNAL";
        }

        /// <summary>Contract defaults and limits the host relies on.</summary>
        public static class Defaults
        {
            /// <summary><c>hello.ok.heartbeatMs</c>: interval of <c>clock.ping</c> (always 5000).</summary>
            public const int HeartbeatMs = 5000;

            /// <summary>A client with no <c>clock.pong</c> for this long closes the socket and reconnects (messages.md 3.4).</summary>
            public const int PongTimeoutMs = 10000;

            /// <summary>Number of <c>clock.ping</c> clock probes sent right after <c>hello.ok</c>.</summary>
            public const int ClockProbeCount = 3;

            /// <summary>Spacing of the clock probes sent right after <c>hello.ok</c>.</summary>
            public const int ClockProbeSpacingMs = 200;

            /// <summary>Most players in a room (<c>room.created.maxPlayers</c>).</summary>
            public const int MaxPlayers = 10;

            /// <summary>Default <c>RoomSettings.voteTimerS</c>; the contract range is 10–60.</summary>
            public const int VoteTimerS = 20;

            /// <summary>Default <c>RoomSettings.inspectTimerS</c>; the contract range is 5–60.</summary>
            public const int InspectTimerS = 20;

            /// <summary>Default language tag.</summary>
            public const string Lang = "en";

            /// <summary>Default <c>PlayerPrefs.textScalePct</c>.</summary>
            public const int TextScalePct = 100;
        }
    }
}
