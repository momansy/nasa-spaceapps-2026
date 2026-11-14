using System.Collections.Generic;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEngine.Scripting;

namespace MissionForge.Net
{
    // Payload DTOs mirroring protocol/schema/<type>.schema.json (field names and enum values are
    // identical; units are in the names, as in the contract). Incoming DTOs tolerate unknown and
    // missing fields: read them through ProtocolJson.TryRead, which ignores unknown members and
    // JSON nulls so the defaults below survive, then calls Normalize. [Preserve] keeps the
    // constructors alive under IL2CPP managed stripping, because Json.NET creates these types
    // through reflection. The only UnityEngine dependency is that attribute.

    /// <summary>Implemented by DTOs that restore null-safety guarantees after deserialization.</summary>
    internal interface INormalizable
    {
        void Normalize();
    }

    // ───────────────────────── connection ─────────────────────────

    /// <summary>Payload of <c>hello</c> (host → server).</summary>
    [Preserve]
    public sealed class HelloDto
    {
        [JsonProperty(ProtocolNames.Fields.ProtocolVersion)]
        public int ProtocolVersion = ProtocolNames.ProtocolVersion;

        /// <summary>Enum ClientKind; the Unity host always sends HOST.</summary>
        [JsonProperty(ProtocolNames.Fields.Client)]
        public string Client = ProtocolNames.ClientKinds.Host;

        /// <summary>Build version, for server logs; must match <c>^[0-9A-Za-z][0-9A-Za-z.+_-]{0,31}$</c>.</summary>
        [JsonProperty(ProtocolNames.Fields.AppVersion)]
        public string AppVersion = "0.0.0";

        /// <summary>Optional LangTag; omitted when null.</summary>
        [JsonProperty(ProtocolNames.Fields.Lang, NullValueHandling = NullValueHandling.Ignore)]
        public string Lang;
    }

    /// <summary>Payload of <c>hello.ok</c>: accepts the handshake and states the connection limits.</summary>
    [Preserve]
    public sealed class HelloOkDto
    {
        [JsonProperty(ProtocolNames.Fields.ProtocolVersion)]
        public int ProtocolVersion = ProtocolNames.ProtocolVersion;

        /// <summary>Server clock when sent, ms since the Unix epoch.</summary>
        [JsonProperty(ProtocolNames.Fields.ServerTimeMs)]
        public long ServerTimeMs;

        /// <summary>Interval of <c>clock.ping</c>, ms.</summary>
        [JsonProperty(ProtocolNames.Fields.HeartbeatMs)]
        public int HeartbeatMs = ProtocolNames.Defaults.HeartbeatMs;

        [JsonProperty(ProtocolNames.Fields.IdleTimeoutMs)]
        public int IdleTimeoutMs = 15000;

        [JsonProperty(ProtocolNames.Fields.MaxFrameBytes)]
        public int MaxFrameBytes = 65536;

        [JsonProperty(ProtocolNames.Fields.MaxMsgsPerSec)]
        public int MaxMsgsPerSec = 400;

        [JsonProperty(ProtocolNames.Fields.MaxBytesPerSec)]
        public int MaxBytesPerSec = 262144;
    }

    /// <summary>Payload of <c>clock.pong</c>.</summary>
    [Preserve]
    public sealed class ClockPongDto
    {
        /// <summary>Echo of <c>clock.ping.clientTimeMs</c> (the host's monotonic clock, ms).</summary>
        [JsonProperty(ProtocolNames.Fields.ClientTimeMs)]
        public double ClientTimeMs = -1;

        /// <summary>Server clock when the ping was processed, ms since the Unix epoch.</summary>
        [JsonProperty(ProtocolNames.Fields.ServerTimeMs)]
        public long ServerTimeMs;
    }

    /// <summary>Payload of the server's <c>error</c> message.</summary>
    [Preserve]
    public sealed class ErrorDto
    {
        /// <summary>Enum ErrorCode, see <see cref="ProtocolNames.ErrorCodes"/>.</summary>
        [JsonProperty(ProtocolNames.Fields.Code)]
        public string Code = "";

        /// <summary>True when the server closes the connection after this error (a <c>bye</c> follows).</summary>
        [JsonProperty(ProtocolNames.Fields.Fatal)]
        public bool Fatal;

        /// <summary><c>seq</c> of the rejected message; null when the frame could not be parsed.</summary>
        [JsonProperty(ProtocolNames.Fields.Re)]
        public int? Re;

        /// <summary><c>t</c> of the rejected message; null when unknown.</summary>
        [JsonProperty(ProtocolNames.Fields.ReT)]
        public string ReT;

        /// <summary>RATE_LIMITED only, ms.</summary>
        [JsonProperty(ProtocolNames.Fields.RetryAfterMs)]
        public int? RetryAfterMs;

        /// <summary>BAD_PAYLOAD only: dotted path of the first failing field.</summary>
        [JsonProperty(ProtocolNames.Fields.Field)]
        public string Field;

        /// <summary>VERSION_MISMATCH only.</summary>
        [JsonProperty(ProtocolNames.Fields.ServerProtocolVersion)]
        public int? ServerProtocolVersion;

        /// <summary>NICK_REJECTED / NICK_TAKEN only.</summary>
        [JsonProperty(ProtocolNames.Fields.Suggestion)]
        public string Suggestion;
    }

    /// <summary>Payload of <c>bye</c>: the last message before the server closes the socket.</summary>
    [Preserve]
    public sealed class ByeDto
    {
        /// <summary>Enum ByeReason, see <see cref="ProtocolNames.ByeReasons"/>.</summary>
        [JsonProperty(ProtocolNames.Fields.Reason)]
        public string Reason = "";

        /// <summary>WebSocket close code the server uses (4000–4010).</summary>
        [JsonProperty(ProtocolNames.Fields.CloseCode)]
        public int CloseCode;

        /// <summary>True when the token is still valid and <c>room.resume</c> should be tried after reconnecting.</summary>
        [JsonProperty(ProtocolNames.Fields.CanResume)]
        public bool CanResume;
    }

    /// <summary>Payload of <c>relay</c>: a player message forwarded to the host.</summary>
    [Preserve]
    public sealed class RelayDto : INormalizable
    {
        /// <summary>PlayerId of the sender.</summary>
        [JsonProperty(ProtocolNames.Fields.From)]
        public string From = "";

        /// <summary>Type of the inner message (RelayedType).</summary>
        [JsonProperty(ProtocolNames.Fields.RelayType)]
        public string Type = "";

        /// <summary>Inner payload, exactly as the player sent it. Never null.</summary>
        [JsonProperty(ProtocolNames.Fields.RelayData)]
        public JObject Data = new JObject();

        void INormalizable.Normalize()
        {
            if (Data == null) Data = new JObject();
        }
    }

    /// <summary>Payload of <c>snapshot.end</c>.</summary>
    [Preserve]
    public sealed class SnapshotEndDto
    {
        [JsonProperty(ProtocolNames.Fields.ServerTimeMs)]
        public long ServerTimeMs;

        /// <summary>Newest entry of the room outcome log; 0 when empty.</summary>
        [JsonProperty(ProtocolNames.Fields.LastOutcomeSeq)]
        public int LastOutcomeSeq;
    }

    // ───────────────────────── room and membership ─────────────────────────

    /// <summary>Payload of <c>room.created</c>.</summary>
    [Preserve]
    public sealed class RoomCreatedDto
    {
        /// <summary>The 4-letter room code.</summary>
        [JsonProperty(ProtocolNames.Fields.Room)]
        public string Room = "";

        /// <summary>Host reconnect token for <c>room.resume</c>. Never shown on screen.</summary>
        [JsonProperty(ProtocolNames.Fields.HostToken)]
        public string HostToken = "";

        /// <summary>Player join URL and QR content: <c>&lt;clientBaseUrl&gt;?room=&lt;CODE&gt;</c>.</summary>
        [JsonProperty(ProtocolNames.Fields.JoinUrl)]
        public string JoinUrl = "";

        /// <summary>Audience join URL: <c>&lt;clientBaseUrl&gt;?room=&lt;CODE&gt;&amp;watch=1</c>.</summary>
        [JsonProperty(ProtocolNames.Fields.SpectateUrl)]
        public string SpectateUrl = "";

        [JsonProperty(ProtocolNames.Fields.MaxPlayers)]
        public int MaxPlayers = ProtocolNames.Defaults.MaxPlayers;

        /// <summary>How long a disconnected player keeps slot and roles, ms.</summary>
        [JsonProperty(ProtocolNames.Fields.SlotHoldMs)]
        public int SlotHoldMs = 180000;

        /// <summary>How long the room survives without its host, ms.</summary>
        [JsonProperty(ProtocolNames.Fields.RoomHoldMs)]
        public int RoomHoldMs = 600000;
    }

    /// <summary>Payload of <c>room.resume</c> as sent by the host.</summary>
    [Preserve]
    public sealed class RoomResumeDto
    {
        [JsonProperty(ProtocolNames.Fields.Room)]
        public string Room = "";

        [JsonProperty(ProtocolNames.Fields.Token)]
        public string Token = "";

        /// <summary>Last outcome the host has durably applied (0 = none); later outcomes are replayed.</summary>
        [JsonProperty(ProtocolNames.Fields.LastOutcomeSeq)]
        public int LastOutcomeSeq;
    }

    /// <summary>Payload of <c>room.resumed</c>.</summary>
    [Preserve]
    public sealed class RoomResumedDto
    {
        [JsonProperty(ProtocolNames.Fields.Room)]
        public string Room = "";

        /// <summary>Enum ConnKind; HOST for the Unity host.</summary>
        [JsonProperty(ProtocolNames.Fields.Kind)]
        public string Kind = ProtocolNames.ConnKinds.Host;

        /// <summary>"host" for the host, else a PlayerId or SpectatorId.</summary>
        [JsonProperty(ProtocolNames.Fields.Id)]
        public string Id = ProtocolNames.HostConnectionId;

        [JsonProperty(ProtocolNames.Fields.Slot)]
        public int? Slot;

        [JsonProperty(ProtocolNames.Fields.PendingPlayer)]
        public bool PendingPlayer;

        /// <summary>True when the game is paused; the host must send <c>game.resume</c> after restoring its state.</summary>
        [JsonProperty(ProtocolNames.Fields.Paused)]
        public bool Paused;
    }

    /// <summary>Shared type <c>Avatar</c>: suit colour and patch cosmetic ids.</summary>
    [Preserve]
    public sealed class AvatarDto
    {
        [JsonProperty(ProtocolNames.Fields.SuitId)]
        public string SuitId = "";

        [JsonProperty(ProtocolNames.Fields.PatchId)]
        public string PatchId = "";
    }

    /// <summary>Shared type <c>PlayerPrefs</c>: per-device accessibility and language preferences.</summary>
    [Preserve]
    public sealed class PlayerPrefsDto
    {
        [JsonProperty(ProtocolNames.Fields.Lang)]
        public string Lang = ProtocolNames.Defaults.Lang;

        [JsonProperty(ProtocolNames.Fields.Relaxed)]
        public bool Relaxed;

        [JsonProperty(ProtocolNames.Fields.OneButton)]
        public bool OneButton;

        [JsonProperty(ProtocolNames.Fields.HoldToToggle)]
        public bool HoldToToggle;

        [JsonProperty(ProtocolNames.Fields.ReducedMotion)]
        public bool ReducedMotion;

        [JsonProperty(ProtocolNames.Fields.HighContrast)]
        public bool HighContrast;

        /// <summary>Text scale in percent, 100–200.</summary>
        [JsonProperty(ProtocolNames.Fields.TextScalePct)]
        public int TextScalePct = ProtocolNames.Defaults.TextScalePct;

        [JsonProperty(ProtocolNames.Fields.ScreenReader)]
        public bool ScreenReader;

        [JsonProperty(ProtocolNames.Fields.Haptics)]
        public bool Haptics = true;
    }

    /// <summary>Shared type <c>PlayerInfo</c>: one player slot in <c>room.state</c>.</summary>
    [Preserve]
    public sealed class PlayerInfoDto : INormalizable
    {
        /// <summary>PlayerId, e.g. "p3".</summary>
        [JsonProperty(ProtocolNames.Fields.Id)]
        public string Id = "";

        /// <summary>Seat number 1–10 (display order).</summary>
        [JsonProperty(ProtocolNames.Fields.Slot)]
        public int Slot;

        [JsonProperty(ProtocolNames.Fields.Nickname)]
        public string Nickname = "";

        /// <summary>Never null after a read.</summary>
        [JsonProperty(ProtocolNames.Fields.Avatar)]
        public AvatarDto Avatar = new AvatarDto();

        /// <summary>False while the player is disconnected and the slot is held. Defaults to true when omitted.</summary>
        [JsonProperty(ProtocolNames.Fields.Connected)]
        public bool Connected = true;

        /// <summary>When the held slot is released (server clock, ms); null while connected.</summary>
        [JsonProperty(ProtocolNames.Fields.SlotExpiresAtMs)]
        public long? SlotExpiresAtMs;

        [JsonProperty(ProtocolNames.Fields.VetoAvailable)]
        public bool VetoAvailable = true;

        /// <summary>Never null after a read.</summary>
        [JsonProperty(ProtocolNames.Fields.Prefs)]
        public PlayerPrefsDto Prefs = new PlayerPrefsDto();

        void INormalizable.Normalize()
        {
            if (Avatar == null) Avatar = new AvatarDto();
            if (Prefs == null) Prefs = new PlayerPrefsDto();
        }
    }

    /// <summary>Payload of <c>room.state</c>: full membership snapshot. Roles are in <c>roles.state</c>, the phase in <c>phase.set</c>.</summary>
    [Preserve]
    public sealed class RoomStateDto : INormalizable
    {
        [JsonProperty(ProtocolNames.Fields.Room)]
        public string Room = "";

        [JsonProperty(ProtocolNames.Fields.HostConnected)]
        public bool HostConnected = true;

        [JsonProperty(ProtocolNames.Fields.Paused)]
        public bool Paused;

        /// <summary>Players ordered by slot. Never null and never contains null entries.</summary>
        [JsonProperty(ProtocolNames.Fields.Players)]
        public List<PlayerInfoDto> Players = new List<PlayerInfoDto>();

        /// <summary>Connected spectators, including pending players.</summary>
        [JsonProperty(ProtocolNames.Fields.SpectatorCount)]
        public int SpectatorCount;

        /// <summary>Spectators waiting to be promoted to player.</summary>
        [JsonProperty(ProtocolNames.Fields.PendingPlayerCount)]
        public int PendingPlayerCount;

        /// <summary>Returns the player with this id, or null.</summary>
        public PlayerInfoDto FindPlayer(string playerId)
        {
            return Players.Find(player => player.Id == playerId);
        }

        void INormalizable.Normalize()
        {
            if (Players == null) Players = new List<PlayerInfoDto>();
            Players.RemoveAll(player => player == null);
            foreach (PlayerInfoDto player in Players) ((INormalizable)player).Normalize();
            Players.Sort((a, b) => a.Slot.CompareTo(b.Slot));
        }
    }

    // ───────────────────────── settings ─────────────────────────

    /// <summary>Shared type <c>RoomA11y</c>: room-wide accessibility flags.</summary>
    [Preserve]
    public sealed class RoomA11yDto
    {
        [JsonProperty(ProtocolNames.Fields.SlowTimers)]
        public bool SlowTimers;

        [JsonProperty(ProtocolNames.Fields.RelaxedMinigames)]
        public bool RelaxedMinigames;

        [JsonProperty(ProtocolNames.Fields.ReducedMotion)]
        public bool ReducedMotion;

        [JsonProperty(ProtocolNames.Fields.HighContrast)]
        public bool HighContrast;

        [JsonProperty(ProtocolNames.Fields.Subtitles)]
        public bool Subtitles = true;

        [JsonProperty(ProtocolNames.Fields.ExplainTooltips)]
        public bool ExplainTooltips;
    }

    /// <summary>Shared type <c>RoomSettings</c>: complete host settings (defaults as at <c>room.create</c>).</summary>
    [Preserve]
    public sealed class RoomSettingsDto : INormalizable
    {
        /// <summary>Enum RoleAssignMode. Lobby-only.</summary>
        [JsonProperty(ProtocolNames.Fields.RoleAssignMode)]
        public string RoleAssignMode = ProtocolNames.RoleAssignModes.Random;

        /// <summary>VOTE stage of PART and CHOICE votes, seconds (10–60).</summary>
        [JsonProperty(ProtocolNames.Fields.VoteTimerS)]
        public int VoteTimerS = ProtocolNames.Defaults.VoteTimerS;

        /// <summary>INSPECT stage, seconds (5–60).</summary>
        [JsonProperty(ProtocolNames.Fields.InspectTimerS)]
        public int InspectTimerS = ProtocolNames.Defaults.InspectTimerS;

        /// <summary>Enum TallyVisibility.</summary>
        [JsonProperty(ProtocolNames.Fields.TallyVisibility)]
        public string TallyVisibility = ProtocolNames.TallyVisibilities.Open;

        [JsonProperty(ProtocolNames.Fields.StrictMajority)]
        public bool StrictMajority;

        /// <summary>Enum AssistLevel. Lobby-only.</summary>
        [JsonProperty(ProtocolNames.Fields.AssistLevel)]
        public string AssistLevel = ProtocolNames.AssistLevels.Engineer;

        /// <summary>0 = advisory only, 1 = the audience counts as one extra ballot.</summary>
        [JsonProperty(ProtocolNames.Fields.AudienceVoteWeight)]
        public int AudienceVoteWeight;

        /// <summary>Enum PilotRotation.</summary>
        [JsonProperty(ProtocolNames.Fields.PilotRotation)]
        public string PilotRotation = ProtocolNames.PilotRotations.PerSegment;

        /// <summary>Enum PilotSelect.</summary>
        [JsonProperty(ProtocolNames.Fields.PilotSelect)]
        public string PilotSelect = ProtocolNames.PilotSelects.Rotation;

        [JsonProperty(ProtocolNames.Fields.PassTheControls)]
        public bool PassTheControls;

        /// <summary>Language of the host screen.</summary>
        [JsonProperty(ProtocolNames.Fields.Lang)]
        public string Lang = ProtocolNames.Defaults.Lang;

        /// <summary>Never null after a read.</summary>
        [JsonProperty(ProtocolNames.Fields.A11y)]
        public RoomA11yDto A11y = new RoomA11yDto();

        void INormalizable.Normalize()
        {
            if (A11y == null) A11y = new RoomA11yDto();
        }
    }

    /// <summary>
    /// Shared type <c>SettingsPatch</c> for <c>settings.set</c> and <c>room.create</c>: only the
    /// non-null fields are sent and changed. <see cref="A11y"/>, when set, replaces all six flags.
    /// </summary>
    [Preserve]
    public sealed class SettingsPatchDto
    {
        [JsonProperty(ProtocolNames.Fields.RoleAssignMode, NullValueHandling = NullValueHandling.Ignore)]
        public string RoleAssignMode;

        [JsonProperty(ProtocolNames.Fields.VoteTimerS, NullValueHandling = NullValueHandling.Ignore)]
        public int? VoteTimerS;

        [JsonProperty(ProtocolNames.Fields.InspectTimerS, NullValueHandling = NullValueHandling.Ignore)]
        public int? InspectTimerS;

        [JsonProperty(ProtocolNames.Fields.TallyVisibility, NullValueHandling = NullValueHandling.Ignore)]
        public string TallyVisibility;

        [JsonProperty(ProtocolNames.Fields.StrictMajority, NullValueHandling = NullValueHandling.Ignore)]
        public bool? StrictMajority;

        [JsonProperty(ProtocolNames.Fields.AssistLevel, NullValueHandling = NullValueHandling.Ignore)]
        public string AssistLevel;

        [JsonProperty(ProtocolNames.Fields.AudienceVoteWeight, NullValueHandling = NullValueHandling.Ignore)]
        public int? AudienceVoteWeight;

        [JsonProperty(ProtocolNames.Fields.PilotRotation, NullValueHandling = NullValueHandling.Ignore)]
        public string PilotRotation;

        [JsonProperty(ProtocolNames.Fields.PilotSelect, NullValueHandling = NullValueHandling.Ignore)]
        public string PilotSelect;

        [JsonProperty(ProtocolNames.Fields.PassTheControls, NullValueHandling = NullValueHandling.Ignore)]
        public bool? PassTheControls;

        [JsonProperty(ProtocolNames.Fields.Lang, NullValueHandling = NullValueHandling.Ignore)]
        public string Lang;

        [JsonProperty(ProtocolNames.Fields.A11y, NullValueHandling = NullValueHandling.Ignore)]
        public RoomA11yDto A11y;
    }

    /// <summary>Payload of <c>settings.state</c>.</summary>
    [Preserve]
    public sealed class SettingsStateDto : INormalizable
    {
        /// <summary>Never null after a read.</summary>
        [JsonProperty(ProtocolNames.Fields.Settings)]
        public RoomSettingsDto Settings = new RoomSettingsDto();

        void INormalizable.Normalize()
        {
            if (Settings == null) Settings = new RoomSettingsDto();
            ((INormalizable)Settings).Normalize();
        }
    }

    // ───────────────────────── roles ─────────────────────────

    /// <summary>Shared type <c>RoleGroup</c>: roles held together by one player.</summary>
    [Preserve]
    public sealed class RoleGroupDto : INormalizable
    {
        /// <summary>First role of the group in canonical order.</summary>
        [JsonProperty(ProtocolNames.Fields.Lead)]
        public string Lead = "";

        /// <summary>All roles of the group in canonical order. Never null.</summary>
        [JsonProperty(ProtocolNames.Fields.Roles)]
        public List<string> Roles = new List<string>();

        /// <summary>Holder, or null while unassigned.</summary>
        [JsonProperty(ProtocolNames.Fields.PlayerId)]
        public string PlayerId;

        void INormalizable.Normalize()
        {
            if (Roles == null) Roles = new List<string>();
            Roles.RemoveAll(role => role == null);
        }
    }

    /// <summary>One entry of <c>roles.state.flightVotes</c>.</summary>
    [Preserve]
    public sealed class FlightVoteDto
    {
        [JsonProperty(ProtocolNames.Fields.PlayerId)]
        public string PlayerId = "";

        /// <summary>Votes received.</summary>
        [JsonProperty(ProtocolNames.Fields.N)]
        public int N;
    }

    /// <summary>Payload of <c>roles.state</c>: complete role assignment.</summary>
    [Preserve]
    public sealed class RolesStateDto : INormalizable
    {
        /// <summary>Enum RoleAssignMode.</summary>
        [JsonProperty(ProtocolNames.Fields.Mode)]
        public string Mode = ProtocolNames.RoleAssignModes.Random;

        [JsonProperty(ProtocolNames.Fields.Locked)]
        public bool Locked;

        /// <summary>Role groups in table order. Never null and never contains null entries.</summary>
        [JsonProperty(ProtocolNames.Fields.Groups)]
        public List<RoleGroupDto> Groups = new List<RoleGroupDto>();

        /// <summary>Never null.</summary>
        [JsonProperty(ProtocolNames.Fields.FlightVotes)]
        public List<FlightVoteDto> FlightVotes = new List<FlightVoteDto>();

        /// <summary>Roles whose once-per-mission ability is spent. Never null.</summary>
        [JsonProperty(ProtocolNames.Fields.AbilitiesUsed)]
        public List<string> AbilitiesUsed = new List<string>();

        /// <summary>Every role held by <paramref name="playerId"/>, in group order; empty when none.</summary>
        public List<string> RolesOf(string playerId)
        {
            var roles = new List<string>();
            if (string.IsNullOrEmpty(playerId)) return roles;
            foreach (RoleGroupDto group in Groups)
            {
                if (group.PlayerId == playerId) roles.AddRange(group.Roles);
            }
            return roles;
        }

        void INormalizable.Normalize()
        {
            if (Groups == null) Groups = new List<RoleGroupDto>();
            Groups.RemoveAll(group => group == null);
            foreach (RoleGroupDto group in Groups) ((INormalizable)group).Normalize();
            if (FlightVotes == null) FlightVotes = new List<FlightVoteDto>();
            FlightVotes.RemoveAll(vote => vote == null);
            if (AbilitiesUsed == null) AbilitiesUsed = new List<string>();
        }
    }

    // ───────────────────────── phase and pause ─────────────────────────

    /// <summary>The <c>step</c> object of <c>phase.set</c>: build progress, both 1–99.</summary>
    [Preserve]
    public sealed class PhaseStepDto
    {
        [JsonProperty(ProtocolNames.Fields.Index)]
        public int Index = 1;

        [JsonProperty(ProtocolNames.Fields.Total)]
        public int Total = 1;
    }

    /// <summary>
    /// Payload of <c>phase.set</c> (host → server → phones). Every field is required on the wire;
    /// the nullable ones are sent as JSON null.
    /// </summary>
    [Preserve]
    public sealed class PhaseSetDto
    {
        /// <summary>Mission counter; 0 before the first mission, +1 when a new mission or retry starts.</summary>
        [JsonProperty(ProtocolNames.Fields.MissionSeq)]
        public int MissionSeq;

        /// <summary>Enum GameMode.</summary>
        [JsonProperty(ProtocolNames.Fields.Mode)]
        public string Mode = ProtocolNames.GameModes.Quick;

        /// <summary>Enum Phase.</summary>
        [JsonProperty(ProtocolNames.Fields.Phase)]
        public string Phase = ProtocolNames.Phases.Lobby;

        /// <summary>Enum SubPhase.</summary>
        [JsonProperty(ProtocolNames.Fields.Sub)]
        public string Sub = ProtocolNames.SubPhases.None;

        /// <summary>Enum ReviewId or null.</summary>
        [JsonProperty(ProtocolNames.Fields.Review)]
        public string Review;

        /// <summary>Enum FlightPhase or null.</summary>
        [JsonProperty(ProtocolNames.Fields.FlightPhase)]
        public string FlightPhase;

        /// <summary>Enum FlightSegment or null.</summary>
        [JsonProperty(ProtocolNames.Fields.Segment)]
        public string Segment;

        [JsonProperty(ProtocolNames.Fields.BoosterTrack)]
        public bool BoosterTrack;

        /// <summary>Chosen contract id or null.</summary>
        [JsonProperty(ProtocolNames.Fields.ContractId)]
        public string ContractId;

        /// <summary>Build progress or null (always null outside BUILD).</summary>
        [JsonProperty(ProtocolNames.Fields.Step)]
        public PhaseStepDto Step;

        /// <summary>
        /// A <c>phase.set</c> for <paramref name="phase"/> with the first field combination that
        /// messages.md section 6 allows: FRR gets review FRR, COUNTDOWN gets F0, FLIGHT gets
        /// FLYING/F2/ASCENT, DEBRIEF gets SUMMARY, everything else sub NONE and nulls.
        /// </summary>
        public static PhaseSetDto ForPhase(string phase, int missionSeq, string mode = ProtocolNames.GameModes.Quick)
        {
            var dto = new PhaseSetDto { Phase = phase, MissionSeq = missionSeq, Mode = mode };
            switch (phase)
            {
                case ProtocolNames.Phases.Frr:
                    dto.Review = ProtocolNames.PhaseDetails.ReviewFrr;
                    break;
                case ProtocolNames.Phases.Countdown:
                    dto.FlightPhase = ProtocolNames.PhaseDetails.FlightPhaseF0;
                    break;
                case ProtocolNames.Phases.Flight:
                    dto.Sub = ProtocolNames.SubPhases.Flying;
                    dto.FlightPhase = ProtocolNames.PhaseDetails.FlightPhaseF2;
                    dto.Segment = ProtocolNames.PhaseDetails.SegmentAscent;
                    break;
                case ProtocolNames.Phases.Debrief:
                    dto.Sub = ProtocolNames.SubPhases.Summary;
                    break;
            }
            return dto;
        }
    }

    /// <summary>Payload of <c>game.paused</c>.</summary>
    [Preserve]
    public sealed class GamePausedDto
    {
        /// <summary>Enum PauseReason.</summary>
        [JsonProperty(ProtocolNames.Fields.Reason)]
        public string Reason = ProtocolNames.PauseReasons.HostRequest;

        /// <summary>Server clock when the pause began, ms.</summary>
        [JsonProperty(ProtocolNames.Fields.AtMs)]
        public long AtMs;

        /// <summary>HOST_DISCONNECTED only: when the room is destroyed, ms; null otherwise.</summary>
        [JsonProperty(ProtocolNames.Fields.RoomExpiresAtMs)]
        public long? RoomExpiresAtMs;
    }

    /// <summary>Payload of <c>game.resumed</c>.</summary>
    [Preserve]
    public sealed class GameResumedDto
    {
        /// <summary>Server clock when the game resumed, ms.</summary>
        [JsonProperty(ProtocolNames.Fields.AtMs)]
        public long AtMs;

        /// <summary>Length of the pause, ms; every earlier deadline moves later by this.</summary>
        [JsonProperty(ProtocolNames.Fields.PausedForMs)]
        public long PausedForMs;
    }
}
