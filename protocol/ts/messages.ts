// MissionForge network protocol — TypeScript types.
// Mirrors protocol/messages.md (the source of truth) and protocol/schema/*.schema.json.
// Kept in step by `node protocol/check.mjs`. No runtime dependencies.

/** Protocol version sent in `hello.protocolVersion`. Additive changes keep the version. */
export const PROTOCOL_VERSION = 1;

// ───────────────────────────── Enumerations ─────────────────────────────

/** Kind of application opening the connection. */
export const CLIENT_KINDS = ['HOST', 'PHONE'] as const;
export type ClientKind = (typeof CLIENT_KINDS)[number];

/** Requested membership kind in `room.join`. */
export const JOIN_AS = ['PLAYER', 'SPECTATOR'] as const;
export type JoinAs = (typeof JOIN_AS)[number];

/** Membership kind of a phone connection. */
export const MEMBER_KINDS = ['PLAYER', 'SPECTATOR'] as const;
export type MemberKind = (typeof MEMBER_KINDS)[number];

/** Kind of a resumed connection. */
export const CONN_KINDS = ['HOST', 'PLAYER', 'SPECTATOR'] as const;
export type ConnKind = (typeof CONN_KINDS)[number];

/** Why a joiner was made a spectator. */
export const SPECTATOR_REASONS = ['REQUESTED', 'LATE_JOIN', 'ROOM_FULL'] as const;
export type SpectatorReason = (typeof SPECTATOR_REASONS)[number];

/** Reason the server is about to close the connection. Each value has a fixed WebSocket close code. */
export const BYE_REASONS = ['ROOM_CLOSED', 'VERSION_MISMATCH', 'KICKED', 'REPLACED', 'ROOM_EXPIRED', 'HANDSHAKE_TIMEOUT', 'FLOOD', 'PROTOCOL_VIOLATION', 'SERVER_SHUTDOWN', 'LEFT', 'IDLE_TIMEOUT'] as const;
export type ByeReason = (typeof BYE_REASONS)[number];

/** Error codes carried by `error`. */
export const ERROR_CODES = ['BAD_ENVELOPE', 'FRAME_TOO_LARGE', 'HANDSHAKE_REQUIRED', 'VERSION_MISMATCH', 'FLOOD', 'UNKNOWN_TYPE', 'BAD_PAYLOAD', 'FORBIDDEN', 'NOT_IN_ROOM', 'ALREADY_IN_ROOM', 'ROOM_NOT_FOUND', 'TOKEN_INVALID', 'NICK_REJECTED', 'NICK_TAKEN', 'RATE_LIMITED', 'PAUSED', 'WRONG_PHASE', 'WRONG_STAGE', 'INVALID_TRANSITION', 'SETTING_LOCKED', 'UNKNOWN_PLAYER', 'STALE_ID', 'DUPLICATE_ID', 'ROUND_ACTIVE', 'NO_WINNABLE_OPTION', 'UNKNOWN_OPTION', 'OPTION_VETOED', 'OPTION_NOT_WINNABLE', 'OPTION_UNAFFORDABLE', 'NOT_A_VOTER', 'VETO_NOT_ALLOWED', 'VETO_USED', 'VETO_MIN_OPTIONS', 'NOT_ROLE_HOLDER', 'ALREADY_ANSWERED', 'NOT_YOUR_TURN', 'ABILITY_USED', 'ABILITY_REJECTED', 'ROLE_TAKEN', 'INVALID_ASSIGNMENT', 'NOT_PILOT', 'INTERNAL'] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/** Mission Control role (§3.3), in canonical order. */
export const ROLE_IDS = ['FLIGHT', 'BOOSTER', 'STRUCT', 'GUIDO', 'FIDO', 'EECOM', 'INCO', 'PAYLOAD', 'RETRO', 'PM'] as const;
export type RoleId = (typeof ROLE_IDS)[number];

/** How roles are assigned in the lobby (§3.3). */
export const ROLE_ASSIGN_MODES = ['RANDOM', 'PICK', 'VOTE'] as const;
export type RoleAssignMode = (typeof ROLE_ASSIGN_MODES)[number];

/** Whether live vote tallies are shown before the result (§4.1 step 5). */
export const TALLY_VISIBILITYS = ['OPEN', 'HIDDEN'] as const;
export type TallyVisibility = (typeof TALLY_VISIBILITYS)[number];

/** Difficulty / assist level (§9.3). */
export const ASSIST_LEVELS = ['CADET', 'ENGINEER', 'FLIGHT_DIRECTOR'] as const;
export type AssistLevel = (typeof ASSIST_LEVELS)[number];

/** Pilot rotation rule (§9.4). */
export const PILOT_ROTATIONS = ['PER_SEGMENT', 'SINGLE'] as const;
export type PilotRotation = (typeof PILOT_ROTATIONS)[number];

/** How the next pilot is chosen (§9.4). */
export const PILOT_SELECTS = ['ROTATION', 'VOTE'] as const;
export type PilotSelect = (typeof PILOT_SELECTS)[number];

/** Game mode (§13). Informational for clients; the server does not interpret it. */
export const GAME_MODES = ['QUICK', 'CAMPAIGN', 'SANDBOX', 'DAILY', 'HERITAGE', 'CLASSROOM', 'SOLO', 'SPEEDRUN', 'BUDGET_CRUNCH'] as const;
export type GameMode = (typeof GAME_MODES)[number];

/** Top-level game phase (§17.3). */
export const PHASES = ['LOBBY', 'BRIEFING', 'CONTRACT_VOTE', 'BUILD', 'FRR', 'COUNTDOWN', 'FLIGHT', 'DEBRIEF', 'CAMPAIGN_HUB'] as const;
export type Phase = (typeof PHASES)[number];

/** Sub-state inside a phase (§17.3). */
export const SUB_PHASES = ['NONE', 'VOTE_ROUND', 'TEST', 'ANOMALY', 'REVIEW', 'FLYING', 'ABORT', 'SUMMARY', 'INVESTIGATION'] as const;
export type SubPhase = (typeof SUB_PHASES)[number];

/** Design review (§6.9). */
export const REVIEW_IDS = ['PDR', 'CDR', 'FRR'] as const;
export type ReviewId = (typeof REVIEW_IDS)[number];

/** Flight phase (§9.1). F0–F1 belong to COUNTDOWN, F2–F13 to FLIGHT. The parallel booster-return track F7b is signalled by `boosterTrack`, not by a value here; F14 is the DEBRIEF phase. */
export const FLIGHT_PHASES = ['F0', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12', 'F13'] as const;
export type FlightPhase = (typeof FLIGHT_PHASES)[number];

/** Flight segment used for pilot rotation (§9.4). */
export const FLIGHT_SEGMENTS = ['ASCENT', 'ORBIT', 'ENTRY', 'LANDING'] as const;
export type FlightSegment = (typeof FLIGHT_SEGMENTS)[number];

/** Kind of vote round. The kind selects the stage profile (see Vote profiles). */
export const VOTE_KINDS = ['PART', 'CONTRACT', 'REWORK_CATEGORY', 'LIVERY', 'PATCH', 'PILOT', 'TEST', 'ANOMALY', 'REVIEW', 'ABORT', 'FLIGHT_DECISION', 'MCM'] as const;
export type VoteKind = (typeof VOTE_KINDS)[number];

/** Stage of a vote round (§4.1). */
export const VOTE_STAGES = ['REVEAL', 'PREDICT', 'INSPECT', 'VOTE', 'RUNOFF', 'TIEBREAK_TRIVIA', 'TIEBREAK_PICK', 'RESULT', 'CLOSED'] as const;
export type VoteStage = (typeof VOTE_STAGES)[number];

/** Affordability of an option, computed by the host (§4.2 Affordability). */
export const AFFORDS = ['OK', 'EMERGENCY_FUNDING', 'NEVER'] as const;
export type Afford = (typeof AFFORDS)[number];

/** Readiness Dashboard metric (§6.3). The unit is part of the identifier. */
export const METRIC_IDS = ['TOTAL_DV_MS', 'LIFTOFF_TWR', 'UPPER_TWR', 'TOTAL_MASS_T', 'COST_M', 'BUDGET_LEFT_M', 'SCHEDULE_DAYS', 'SCHEDULE_MARGIN_DAYS', 'SUCCESS_PCT', 'SUCCESS_BAND_PCT', 'POWER_BALANCE_W', 'DATA_BUDGET_GB_DAY', 'ENTRY_SPEED_RATING_KMS', 'STABILITY'] as const;
export type MetricId = (typeof METRIC_IDS)[number];

/** Colour class of a value or delta (§14.4). */
export const RATINGS = ['GOOD', 'MARGINAL', 'BAD', 'NEUTRAL'] as const;
export type Rating = (typeof RATINGS)[number];

/** Role tag on an option (§3.4). */
export const TAG_KINDS = ['RECOMMENDED', 'CONCERN'] as const;
export type TagKind = (typeof TAG_KINDS)[number];

/** Why the server reports a ballot to its owner. */
export const BALLOT_CHANGES = ['CAST', 'OPTION_REMOVED', 'RUNOFF_RESET', 'SNAPSHOT'] as const;
export type BallotChange = (typeof BALLOT_CHANGES)[number];

/** How the winner of a vote round was decided (§4.2). */
export const RESOLVE_METHODS = ['PLURALITY', 'RUNOFF', 'DECISION_TIME', 'FLIGHT_TIEBREAK', 'TRIVIA', 'COIN_FLIP', 'ABSTAIN_RECOMMENDED', 'ABSTAIN_DEFAULT', 'ABSTAIN_CHEAPEST'] as const;
export type ResolveMethod = (typeof RESOLVE_METHODS)[number];

/** Why the voting stage ended. */
export const CLOSE_CAUSES = ['TIMER', 'ALL_VOTED', 'SOLO', 'DECISION_TIME', 'HOST'] as const;
export type CloseCause = (typeof CLOSE_CAUSES)[number];

/** Why a vote round was cancelled without a result. */
export const CANCEL_REASONS = ['HOST', 'PHASE_CHANGE'] as const;
export type CancelReason = (typeof CANCEL_REASONS)[number];

/** Quick ping (§3.4). */
export const PING_IDS = ['TOO_EXPENSIVE', 'TOO_HEAVY', 'LIKE_THIS', 'CHECK_DRAWBACK', 'NEED_MORE_DV', 'TEST_IT_FIRST', 'TRUST_ME', 'AGREED'] as const;
export type PingId = (typeof PING_IDS)[number];

/** Emoji reaction (§3.4). */
export const REACTION_IDS = ['ROCKET', 'THUMBS_UP', 'GRIMACE', 'FIRE', 'THINKING'] as const;
export type ReactionId = (typeof REACTION_IDS)[number];

/** A player's GO/NO-GO answer. */
export const GO_NO_GOS = ['GO', 'NO_GO'] as const;
export type GoNoGo = (typeof GO_NO_GOS)[number];

/** Recorded GO/NO-GO answer. */
export const POLL_ANSWERS = ['GO', 'NO_GO', 'NO_ANSWER'] as const;
export type PollAnswer = (typeof POLL_ANSWERS)[number];

/** Where the GO/NO-GO poll happens (§4.3, §6.9). */
export const POLL_CONTEXTS = ['FRR', 'LAUNCH'] as const;
export type PollContext = (typeof POLL_CONTEXTS)[number];

/** What spent a role ability. */
export const ABILITY_TRIGGERS = ['PLAYER', 'OVER_BUDGET_WIN', 'HOST'] as const;
export type AbilityTrigger = (typeof ABILITY_TRIGGERS)[number];

/** Why the host declined an ability. */
export const ABILITY_REJECT_REASONS = ['NOT_APPLICABLE', 'WRONG_PHASE', 'BAD_TARGET'] as const;
export type AbilityRejectReason = (typeof ABILITY_REJECT_REASONS)[number];

/** Why the host spent an ability without a player request. */
export const ABILITY_CONSUME_REASONS = ['ANOMALY_RESPONSE', 'GAME_EVENT'] as const;
export type AbilityConsumeReason = (typeof ABILITY_CONSUME_REASONS)[number];

/** Why the game is paused (§17.7, §13.3 Classroom). */
export const PAUSE_REASONS = ['HOST_REQUEST', 'HOST_DISCONNECTED'] as const;
export type PauseReason = (typeof PAUSE_REASONS)[number];

/** Kind of host notice shown on phones. */
export const NOTICE_KINDS = ['CAPCOM', 'HINT', 'SUMMARY', 'DISCUSSION', 'FACT', 'WARNING'] as const;
export type NoticeKind = (typeof NOTICE_KINDS)[number];

/** Design-review issue severity (§6.9, §6.11). */
export const SEVERITYS = ['BLOCKER', 'MAJOR', 'MINOR'] as const;
export type Severity = (typeof SEVERITYS)[number];

/** Kind of build-phase event shown in the phone feed. */
export const BUILD_EVENT_KINDS = ['TEST_RESULT', 'FLAW_FOUND', 'FLAW_FIXED', 'ANOMALY_DRAWN', 'ANOMALY_RESOLVED', 'REVIEW_OPENED', 'REVIEW_PASSED', 'REWORK_OPENED', 'DEADLINE_SLIP', 'LESSON_APPLIED'] as const;
export type BuildEventKind = (typeof BUILD_EVENT_KINDS)[number];

/** Severity of a flight event. */
export const EVENT_SEVERITYS = ['INFO', 'CAUTION', 'WARNING', 'CRITICAL'] as const;
export type EventSeverity = (typeof EVENT_SEVERITYS)[number];

/** Where a pilot seat reads its input from (§9.4 Pass the controls). */
export const INPUT_SOURCES = ['HOST_DEVICE', 'PHONE'] as const;
export type InputSource = (typeof INPUT_SOURCES)[number];

/** Which vehicle a pilot seat flies. */
export const CRAFTS = ['VEHICLE', 'BOOSTER'] as const;
export type Craft = (typeof CRAFTS)[number];

/** Discrete pilot action (§9.2). Hold-to-confirm gestures (STAGE 0.3 s, ABORT 1.5 s) are evaluated on the phone; the action is sent once when the hold completes. */
export const PILOT_ACTIONS = ['STAGE', 'CUTOFF', 'RCS_TOGGLE', 'ATT_HOLD', 'DEPLOY', 'WARP_UP', 'WARP_DOWN', 'MAP_TOGGLE', 'CAMERA_CYCLE', 'ABORT', 'COUNTDOWN_HOLD', 'COUNTDOWN_RESUME'] as const;
export type PilotAction = (typeof PILOT_ACTIONS)[number];

/** Attitude hold mode (§9.2). */
export const ATT_MODES = ['OFF', 'PROGRADE', 'RETROGRADE', 'HEAT_SHIELD_FWD'] as const;
export type AttMode = (typeof ATT_MODES)[number];

/** What to deploy (§9.2). */
export const DEPLOY_TARGETS = ['CONTEXT', 'FAIRING', 'CHUTES', 'LEGS', 'ARRAYS'] as const;
export type DeployTarget = (typeof DEPLOY_TARGETS)[number];

/** Co-pilot action (§9.4). */
export const COPILOT_ACTIONS = ['STAGE', 'DEPLOY'] as const;
export type CopilotAction = (typeof COPILOT_ACTIONS)[number];

/** Console telemetry channel. The unit is part of the identifier. Each role has a fixed channel set (see Console channels). */
export const TELEMETRY_CHANNELS = ['met_s', 'altitude_km', 'velocity_ms', 'countdown_s', 'hold', 'consoles_red', 'consoles_amber', 'chamber_pressure_pct', 'engines_running', 'engines_total', 'engine_health_pct', 'prop_stage1_pct', 'prop_stage2_pct', 'throttle_pct', 'q_kpa', 'load_pct', 'g_load', 'vibration_pct', 'traj_error_km', 'pitch_error_deg', 'heading_error_deg', 'apoapsis_km', 'periapsis_km', 'inclination_deg', 'window_remaining_s', 'dv_remaining_ms', 'battery_pct', 'power_balance_w', 'temp_c', 'cabin_pressure_kpa', 'cabin_co2_pct', 'signal_pct', 'data_downlinked_gb', 'next_pass_s', 'in_pass', 'targets_captured', 'targets_total', 'payload_health_pct', 'data_stored_gb', 'entry_angle_deg', 'heat_load_pct', 'landing_ellipse_km', 'descent_rate_ms', 'chutes_deployed', 'budget_left_m', 'schedule_margin_days', 'score_pts', 'sync_meter'] as const;
export type TelemetryChannel = (typeof TELEMETRY_CHANNELS)[number];

/** Severity of a console alert. */
export const ALERT_SEVERITYS = ['CAUTION', 'WARNING'] as const;
export type AlertSeverity = (typeof ALERT_SEVERITYS)[number];

/** Why phones are blacked out. */
export const BLACKOUT_CAUSES = ['PLASMA', 'SIGNAL_DELAY', 'OUT_OF_COVERAGE'] as const;
export type BlackoutCause = (typeof BLACKOUT_CAUSES)[number];

/** Phone vibration cue (§15). The vibration pattern for each cue is defined in the client. */
export const HAPTIC_CUES = ['IGNITION', 'MAX_Q_RUMBLE', 'STAGING', 'CHUTE_OPEN', 'TOUCHDOWN', 'ALERT', 'GOOD_CALL', 'VETO', 'TIER_NONE', 'TIER_BRONZE', 'TIER_SILVER', 'TIER_GOLD', 'TIER_PLATINUM'] as const;
export type HapticCue = (typeof HAPTIC_CUES)[number];

/** Why the Team Sync meter changed (§11.2). */
export const SYNC_REASONS = ['GOLD', 'SILVER', 'BRONZE', 'GOOD_CALL', 'MOMENT_SPENT', 'RESET'] as const;
export type SyncReason = (typeof SYNC_REASONS)[number];

/** Boost type (§10.4). */
export const BOOST_IDS = ['DV_BONUS', 'RELIABILITY_SHIELD', 'HEAT_MARGIN', 'PRECISION', 'LOAD_MARGIN', 'FUEL_SAVER', 'DATA_MULTIPLIER', 'BUDGET_REFUND', 'SCHEDULE_RECOVERY', 'CREW_MORALE', 'SCORE_MULTIPLIER'] as const;
export type BoostId = (typeof BOOST_IDS)[number];

/** Unit of a boost amount. */
export const BOOST_UNITS = ['PCT', 'MULT', 'M_USD', 'DAYS', 'POINTS', 'SHIELDS'] as const;
export type BoostUnit = (typeof BOOST_UNITS)[number];

/** What produced a boost. */
export const BOOST_SOURCES = ['MINIGAME', 'ABILITY', 'MOMENT', 'LESSON', 'ANOMALY'] as const;
export type BoostSource = (typeof BOOST_SOURCES)[number];

/** Minigame completion tier (§10.3). */
export const TIERS = ['NONE', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM'] as const;
export type Tier = (typeof TIERS)[number];

/** Minigame type (§10.2). */
export const MINIGAME_TYPES = ['PARALLEL_SOLO', 'COOP_SPLIT', 'RELAY', 'TEAM_SYNC'] as const;
export type MinigameType = (typeof MINIGAME_TYPES)[number];

/** Input mode the player used (§16 Motor). */
export const MINIGAME_MODES = ['STANDARD', 'RELAXED', 'ONE_BUTTON'] as const;
export type MinigameMode = (typeof MINIGAME_MODES)[number];

/** Why a minigame run was cancelled. */
export const MG_CANCEL_REASONS = ['HOST', 'ABORT', 'PHASE_CHANGE'] as const;
export type MgCancelReason = (typeof MG_CANCEL_REASONS)[number];

/** Why Knowledge Points were awarded (§11.3, §12.2). */
export const KP_REASONS = ['PREDICTION', 'TRIVIA', 'MINIGAME', 'BONUS'] as const;
export type KpReason = (typeof KP_REASONS)[number];

/** What unlocked a Codex entry (§12.2). */
export const CODEX_SOURCES = ['PART', 'EVENT', 'MINIGAME', 'DEBRIEF', 'MILESTONE'] as const;
export type CodexSource = (typeof CODEX_SOURCES)[number];

/** Mission outcome (§8.5). */
export const MISSION_OUTCOMES = ['SUCCESS', 'PARTIAL', 'FAILURE'] as const;
export type MissionOutcome = (typeof MISSION_OUTCOMES)[number];

/** Mission grade (§11.4). */
export const GRADES = ['S', 'A', 'B', 'C', 'D'] as const;
export type Grade = (typeof GRADES)[number];

/** Objective kind (§5.2). */
export const OBJECTIVE_KINDS = ['PRIMARY', 'SECONDARY', 'STRETCH', 'SAFETY'] as const;
export type ObjectiveKind = (typeof OBJECTIVE_KINDS)[number];

/** Message types a player may send that the server forwards to the host inside `relay`. */
export const RELAYED_TYPES = ['pilot.input', 'pilot.action', 'copilot.action', 'console.callout', 'console.request', 'mg.ready', 'mg.progress', 'mg.action', 'mg.result'] as const;
export type RelayedType = (typeof RELAYED_TYPES)[number];

// ───────────────────────────── Shared types ─────────────────────────────

/** Room code: exactly 4 upper-case letters from A–Z without I and O (24-letter alphabet). Clients upper-case user input before sending. */
export type RoomCode = string;

/** Opaque reconnect token issued by the server (URL-safe, 16–64 characters). Stored in the browser sessionStorage (phones) or host persistent storage. Never shown on screen. */
export type Token = string;

/** Player identifier, unique within a room and never reused: "p" followed by a positive integer (p1, p2, …). */
export type PlayerId = string;

/** Spectator identifier, unique within a room and never reused: "s" followed by a positive integer. */
export type SpectatorId = string;

/** Display nickname after server normalisation (NFC, trimmed, inner whitespace collapsed): 2–16 characters; Unicode letters, digits, space, underscore and hyphen; first and last character must be a letter or digit. */
export type Nickname = string;

/** Identifier of an entry in the shared game data (`data/`): part, part category, contract, test, anomaly card, minigame, fact, codex entry, callout, console request, award, objective, validation rule, cosmetic. 1–48 characters. */
export type DataId = string;

/** Identifier of one option inside a vote round. For PART votes it equals the part id; for CONTRACT votes the contract id; for PILOT votes a PlayerId; for quick votes an upper-case token defined in the vote-kind table (e.g. TEST, SKIP). */
export type OptionId = string;

/** Vote round identifier chosen by the host; unique within the room for its whole lifetime. */
export type RoundId = string;

/** Minigame run identifier chosen by the host; unique within the room. */
export type RunId = string;

/** GO/NO-GO poll identifier chosen by the host; unique within the room. */
export type PollId = string;

/** Console alert identifier chosen by the host; unique within the room. */
export type AlertId = string;

/** Ability request identifier chosen by the server; unique within the room. */
export type RequestId = string;

/** BCP 47 language tag, lower-case primary subtag (e.g. "en", "ar", "pt-BR"). */
export type LangTag = string;

/** Absolute time on the server clock: integer milliseconds since the Unix epoch. Every `…AtMs` field in the protocol uses the server clock (see Clock). */
export type TimeMs = number;

/** Unsigned 32-bit integer. */
export type Uint32 = number;

/** Position of a server-resolved outcome in the room outcome log; starts at 1 and increases by 1 per outcome for the lifetime of the room. */
export type OutcomeSeq = number;

/** Reference to localised player-visible text. The protocol never carries free display text: `key` is a key of `data/strings/<lang>.json`, and `args` supplies substitution values. Receivers format numbers and units locally. */
export interface TextRef {
  /** String-table key. */
  key: string;
  /** Substitution values by placeholder name. String values must themselves be data ids or string-table keys, never user text. */
  args?: Record<string, string | number>;
}

/** Player avatar (§3.1): astronaut suit colour and patch, both cosmetic ids. */
export interface Avatar {
  /** Suit colour cosmetic id, e.g. "suit_orange". */
  suitId: DataId;
  /** Patch cosmetic id, e.g. "patch_comet". */
  patchId: DataId;
}

/** Per-device accessibility and language preferences (§16). Set by each phone, relayed to the host and all clients inside `room.state`. */
export interface PlayerPrefs {
  /** UI language of this device. */
  lang: LangTag;
  /** Motor: Relaxed minigame mode (wider timing windows). */
  relaxed: boolean;
  /** Motor: One-Button minigame alternative. */
  oneButton: boolean;
  /** Motor: hold-to-press controls become toggles. */
  holdToToggle: boolean;
  /** Motion: no shake, fewer particles, no flashing. */
  reducedMotion: boolean;
  /** Visual: high-contrast mode. */
  highContrast: boolean;
  /** Visual: text scale in percent (100–200). */
  textScalePct: number;
  /** Visual: screen-reader labels requested. */
  screenReader: boolean;
  /** Whether the device wants `haptic.cue` vibrations. */
  haptics: boolean;
}

/** Room-wide accessibility flags set by the host (§16). Phones apply each flag in addition to their own preferences. */
export interface RoomA11y {
  /** Cognitive: every server-run vote and poll timer is multiplied by 1.5 (rounded up to a whole second). Default false. */
  slowTimers: boolean;
  /** Motor: every phone runs minigames in Relaxed mode. Default false. */
  relaxedMinigames: boolean;
  /** Motion: reduced-motion on every device. Default false. */
  reducedMotion: boolean;
  /** Visual: high contrast on every device. Default false. */
  highContrast: boolean;
  /** Hearing: phones show subtitles for voice lines and callouts. Default true. */
  subtitles: boolean;
  /** Cognitive: "Explain like I'm new" tooltips on every device. Default false. */
  explainTooltips: boolean;
}

/** Complete host settings of a room. Defaults apply at `room.create`. */
export interface RoomSettings {
  /** Role assignment mode (§3.3). Default RANDOM. Lobby-only. */
  roleAssignMode: RoleAssignMode;
  /** Duration of the VOTE stage of PART and CHOICE votes, seconds (§4.1 step 5). Default 20. */
  voteTimerS: number;
  /** Duration of the INSPECT stage, seconds (§4.1 step 2). Default 20. */
  inspectTimerS: number;
  /** Live tallies open or hidden (§4.1 step 5). Default OPEN. */
  tallyVisibility: TallyVisibility;
  /** Strict-majority runoff on or off (§4.2). Default false. */
  strictMajority: boolean;
  /** Difficulty / assist level (§9.3). Default ENGINEER. Lobby-only. */
  assistLevel: AssistLevel;
  /** Audience vote weight (§13.7): 0 = advisory only (default), 1 = the audience counts as one extra player ballot (judging-day mode). */
  audienceVoteWeight: number;
  /** Pilot rotation rule (§9.4). Default PER_SEGMENT. */
  pilotRotation: PilotRotation;
  /** How the next pilot is chosen (§9.4). Default ROTATION. */
  pilotSelect: PilotSelect;
  /** Phones may act as virtual gamepads (§9.4). Default false. */
  passTheControls: boolean;
  /** Language of the host screen. Default "en". */
  lang: LangTag;
  /** Room-wide accessibility flags (§16). */
  a11y: RoomA11y;
}

/** Partial host settings: only the listed fields change. `a11y`, when present, replaces all six flags. */
export interface SettingsPatch {
  /** Role assignment mode (§3.3). Default RANDOM. Lobby-only. */
  roleAssignMode?: RoleAssignMode;
  /** Duration of the VOTE stage of PART and CHOICE votes, seconds (§4.1 step 5). Default 20. */
  voteTimerS?: number;
  /** Duration of the INSPECT stage, seconds (§4.1 step 2). Default 20. */
  inspectTimerS?: number;
  /** Live tallies open or hidden (§4.1 step 5). Default OPEN. */
  tallyVisibility?: TallyVisibility;
  /** Strict-majority runoff on or off (§4.2). Default false. */
  strictMajority?: boolean;
  /** Difficulty / assist level (§9.3). Default ENGINEER. Lobby-only. */
  assistLevel?: AssistLevel;
  /** Audience vote weight (§13.7): 0 = advisory only (default), 1 = the audience counts as one extra player ballot (judging-day mode). */
  audienceVoteWeight?: number;
  /** Pilot rotation rule (§9.4). Default PER_SEGMENT. */
  pilotRotation?: PilotRotation;
  /** How the next pilot is chosen (§9.4). Default ROTATION. */
  pilotSelect?: PilotSelect;
  /** Phones may act as virtual gamepads (§9.4). Default false. */
  passTheControls?: boolean;
  /** Language of the host screen. Default "en". */
  lang?: LangTag;
  /** Room-wide accessibility flags (§16). */
  a11y?: RoomA11y;
}

/** One player slot in `room.state`. */
export interface PlayerInfo {
  /** Player id. */
  id: PlayerId;
  /** Seat number 1–10 (display order; the lowest free seat is assigned at join). */
  slot: number;
  /** Display nickname. */
  nickname: Nickname;
  /** Avatar. */
  avatar: Avatar;
  /** False while the player is disconnected and the slot is being held. */
  connected: boolean;
  /** When the held slot is released (server clock); null while connected. Frozen while the game is paused. */
  slotExpiresAtMs: TimeMs | null;
  /** True until the player uses the one veto of this mission (§4.2). */
  vetoAvailable: boolean;
  /** Accessibility and language preferences of the device. */
  prefs: PlayerPrefs;
}

/** A set of roles held together by one player (§3.3 role merging). */
export interface RoleGroup {
  /** First role of the group in canonical order; identifies the group in `roles.pick`. */
  lead: RoleId;
  /** All roles of the group in canonical order. */
  roles: RoleId[];
  /** Holder, or null while the group is unassigned (lobby, PICK/VOTE modes). */
  playerId: PlayerId | null;
}

/** One Readiness Dashboard metric after a hypothetical or applied change, computed by the host (§6.3, §14.3 "IF CHOSEN"). */
export interface Delta {
  /** Metric (unit in the id). */
  metric: MetricId;
  /** Value of the metric after the change. */
  value: number;
  /** Change against the current build (value after − value before). */
  delta: number;
  /** Colour class of the change. */
  rating: Rating;
}

/** One option of a vote round with host-computed preview numbers. */
export interface VoteOption {
  /** Option id, unique within the round. */
  id: OptionId;
  /** Catalog part id for PART votes (the phone renders the Part Card from its bundled catalog); null otherwise. */
  partId: DataId | null;
  /** Display text for options that are not catalog parts or contracts; null when the client derives the text from `kind` + `id`. */
  label: TextRef | null;
  /** Cost in $M (game value) used by the all-abstain "cheapest option" rule. 0 for options without a cost. */
  costM: number;
  /** Affordability (§4.2). */
  afford: Afford;
  /** Amount over the remaining budget in $M for the red banner; 0 when within budget. */
  overBudgetByM: number;
  /** Days over the remaining schedule; 0 when within schedule. */
  overScheduleByDays: number;
  /** True when choosing it makes the rocket unflyable now ("Will not fly" warning, §4.2). */
  willNotFly: boolean;
  /** Only meaningful when `willNotFly`: true when a later vote can still fix it. `willNotFly && !fixExists` makes the option unwinnable. */
  fixExists: boolean;
  /** Explanations for the warnings (e.g. the §6.11 rule text). */
  warnings: TextRef[];
  /** "If chosen" dashboard preview against the current build. */
  deltas: Delta[];
}

/** Number of ballots for one option. */
export interface OptionCount {
  /** Option id. */
  optionId: OptionId;
  /** Ballot count. */
  n: number;
}

/** A multiple-choice question with its answer (host → server only). */
export interface Question {
  /** Question or fact id in the game data. */
  id: DataId;
  /** Question text. */
  prompt: TextRef;
  /** Answer choices, in display order. */
  choices: TextRef[];
  /** Zero-based index of the correct choice. Never sent to phones before the answer window closes. */
  correctIndex: number;
}

/** A multiple-choice question without its answer (server → clients). */
export interface QuestionPublic {
  /** Question or fact id in the game data. */
  id: DataId;
  /** Question text. */
  prompt: TextRef;
  /** Answer choices, in display order. */
  choices: TextRef[];
}

/** Host overrides of stage durations in milliseconds. A missing field uses the profile default. Overrides are used exactly as given (not scaled by `a11y.slowTimers`). */
export interface VoteTimers {
  /** REVEAL duration; 0 skips the stage. */
  revealMs?: number;
  /** PREDICT duration. */
  predictMs?: number;
  /** INSPECT duration; 0 skips the stage. */
  inspectMs?: number;
  /** VOTE duration. */
  voteMs?: number;
  /** RUNOFF duration. */
  runoffMs?: number;
  /** TIEBREAK_TRIVIA duration. */
  triviaMs?: number;
  /** TIEBREAK_PICK duration. */
  pickMs?: number;
  /** RESULT duration; 0 skips the stage. */
  resultMs?: number;
}

/** One planned stage of a vote round. */
export interface StagePlan {
  /** Stage. */
  stage: VoteStage;
  /** Planned duration; null for an untimed stage (solo VOTE). */
  durationMs: number | null;
}

/** One boost applied by the host (§10.4, §11.1). */
export interface BoostGrant {
  /** Boost type. */
  boost: BoostId;
  /** Tier that produced it (NONE when the source is not a minigame). */
  tier: Tier;
  /** Amount granted by this event, in `unit`. */
  amount: number;
  /** Mission total for this boost type after the grant and after the cap, in `unit`. */
  total: number;
  /** Unit of `amount` and `total`. */
  unit: BoostUnit;
  /** True when the per-mission cap reduced the grant. */
  capped: boolean;
  /** What produced the boost. */
  source: BoostSource;
  /** Id of the source (minigame id, role id, lesson id…) or null. */
  sourceId: DataId | null;
}

/** Open key/value bag for minigame parameters and shared state. Keys and meanings are defined per minigame in `data/minigames.json`; the server relays it without interpretation. At most 32 keys. */
export type MgMap = Record<string, number | string | boolean | number[]>;

/** Telemetry values by channel id; only the channels of the addressed role are present. */
export interface TelemetryValues {
  /** Channel met_s. */
  met_s?: number;
  /** Channel altitude_km. */
  altitude_km?: number;
  /** Channel velocity_ms. */
  velocity_ms?: number;
  /** Channel countdown_s. */
  countdown_s?: number;
  /** Channel hold. */
  hold?: number;
  /** Channel consoles_red. */
  consoles_red?: number;
  /** Channel consoles_amber. */
  consoles_amber?: number;
  /** Channel chamber_pressure_pct. */
  chamber_pressure_pct?: number;
  /** Channel engines_running. */
  engines_running?: number;
  /** Channel engines_total. */
  engines_total?: number;
  /** Channel engine_health_pct. */
  engine_health_pct?: number;
  /** Channel prop_stage1_pct. */
  prop_stage1_pct?: number;
  /** Channel prop_stage2_pct. */
  prop_stage2_pct?: number;
  /** Channel throttle_pct. */
  throttle_pct?: number;
  /** Channel q_kpa. */
  q_kpa?: number;
  /** Channel load_pct. */
  load_pct?: number;
  /** Channel g_load. */
  g_load?: number;
  /** Channel vibration_pct. */
  vibration_pct?: number;
  /** Channel traj_error_km. */
  traj_error_km?: number;
  /** Channel pitch_error_deg. */
  pitch_error_deg?: number;
  /** Channel heading_error_deg. */
  heading_error_deg?: number;
  /** Channel apoapsis_km. */
  apoapsis_km?: number;
  /** Channel periapsis_km. */
  periapsis_km?: number;
  /** Channel inclination_deg. */
  inclination_deg?: number;
  /** Channel window_remaining_s. */
  window_remaining_s?: number;
  /** Channel dv_remaining_ms. */
  dv_remaining_ms?: number;
  /** Channel battery_pct. */
  battery_pct?: number;
  /** Channel power_balance_w. */
  power_balance_w?: number;
  /** Channel temp_c. */
  temp_c?: number;
  /** Channel cabin_pressure_kpa. */
  cabin_pressure_kpa?: number;
  /** Channel cabin_co2_pct. */
  cabin_co2_pct?: number;
  /** Channel signal_pct. */
  signal_pct?: number;
  /** Channel data_downlinked_gb. */
  data_downlinked_gb?: number;
  /** Channel next_pass_s. */
  next_pass_s?: number;
  /** Channel in_pass. */
  in_pass?: number;
  /** Channel targets_captured. */
  targets_captured?: number;
  /** Channel targets_total. */
  targets_total?: number;
  /** Channel payload_health_pct. */
  payload_health_pct?: number;
  /** Channel data_stored_gb. */
  data_stored_gb?: number;
  /** Channel entry_angle_deg. */
  entry_angle_deg?: number;
  /** Channel heat_load_pct. */
  heat_load_pct?: number;
  /** Channel landing_ellipse_km. */
  landing_ellipse_km?: number;
  /** Channel descent_rate_ms. */
  descent_rate_ms?: number;
  /** Channel chutes_deployed. */
  chutes_deployed?: number;
  /** Channel budget_left_m. */
  budget_left_m?: number;
  /** Channel schedule_margin_days. */
  schedule_margin_days?: number;
  /** Channel score_pts. */
  score_pts?: number;
  /** Channel sync_meter. */
  sync_meter?: number;
}

/** One GO/NO-GO answer. */
export interface PollEntry {
  /** Player who was called. */
  playerId: PlayerId;
  /** Roles (consoles) that player answered for. */
  roles: RoleId[];
  /** Recorded answer. */
  answer: PollAnswer;
}

/** Number of reactions per emoji. */
export interface ReactionCounts {
  /** 🚀 count. */
  ROCKET: number;
  /** 👍 count. */
  THUMBS_UP: number;
  /** 😬 count. */
  GRIMACE: number;
  /** 🔥 count. */
  FIRE: number;
  /** 🤔 count. */
  THINKING: number;
}

// ───────────────────────────── Payloads ─────────────────────────────

/** `hello` — any → server. First message on every connection. Declares the protocol version and the kind of application. The server answers `hello.ok`, or `error` VERSION_MISMATCH followed by `bye` and close. */
export interface HelloPayload {
  /** Protocol version the sender implements. This document defines version 1. */
  protocolVersion: number;
  /** Kind of application. Selects the frame-size and rate budget of the connection. */
  client: ClientKind;
  /** Build version of the application, for logs only. */
  appVersion: string;
  /** Preferred language of the device, used only for server-chosen nickname suggestions. Default "en". */
  lang?: LangTag;
}

/** `hello.ok` — server → host and clients. Accepts the handshake and states the limits of this connection. After it the client must send `room.create` (host), `room.join` (phone) or `room.resume` (either) within 30 s. */
export interface HelloOkPayload {
  /** Server protocol version (equals the client version). */
  protocolVersion: number;
  /** Server clock when the message was sent. */
  serverTimeMs: TimeMs;
  /** Interval at which the client must send `clock.ping`. Always 5000. */
  heartbeatMs: number;
  /** The server drops the connection after this long without any frame. Always 15000. */
  idleTimeoutMs: number;
  /** Largest frame the client may send, UTF-8 bytes. PHONE: 2048. HOST: 65536. */
  maxFrameBytes: number;
  /** Overall message budget of the connection. PHONE: 60. HOST: 400. */
  maxMsgsPerSec: number;
  /** Overall inbound byte budget of the connection. PHONE: 8192. HOST: 262144. */
  maxBytesPerSec: number;
}

/** `clock.ping` — any → server. Heartbeat and clock probe. Sent every `heartbeatMs` (5 s) by every client, and three times 200 ms apart right after `hello.ok`. The client keeps the offset from the sample with the smallest round trip: `offset = serverTimeMs − (clientTimeMs + rtt/2)`. A client that gets no `clock.pong` for 10 s must reconnect. */
export interface ClockPingPayload {
  /** Sender's local monotonic or wall clock in milliseconds; echoed back unchanged. */
  clientTimeMs: number;
}

/** `clock.pong` — server → host and clients. Answer to `clock.ping`. */
export interface ClockPongPayload {
  /** Echo of `clock.ping.clientTimeMs`. */
  clientTimeMs: number;
  /** Server clock when the ping was processed. */
  serverTimeMs: TimeMs;
}

/** `error` — server → host and clients. Rejects one message from this connection. The rejected message had no effect. When `fatal` is true the server sends `bye` next and closes the socket. */
export interface ErrorPayload {
  /** Error code (see the error table). */
  code: ErrorCode;
  /** True when the connection is closed because of this error. */
  fatal: boolean;
  /** `seq` of the rejected message; null when the frame could not be parsed. */
  re: number | null;
  /** `t` of the rejected message; null when unknown. */
  reT: string | null;
  /** RATE_LIMITED only: wait at least this long before sending this type again. */
  retryAfterMs?: number;
  /** BAD_PAYLOAD only: name of the first failing field (dotted path). */
  field?: string;
  /** VERSION_MISMATCH only: version the server speaks. */
  serverProtocolVersion?: number;
  /** NICK_REJECTED / NICK_TAKEN only: a nickname the server would accept. */
  suggestion?: Nickname;
}

/** `bye` — server → host and clients. Last message before the server closes the socket. Carries the reason because browsers do not reliably expose close reasons. The WebSocket close code equals `closeCode`. */
export interface ByePayload {
  /** Why the connection is being closed. */
  reason: ByeReason;
  /** WebSocket close code the server uses (fixed per reason, see ByeReason). */
  closeCode: number;
  /** True when the token is still valid and the client should reconnect and send `room.resume` (SERVER_SHUTDOWN, IDLE_TIMEOUT, FLOOD, PROTOCOL_VIOLATION). False otherwise. */
  canResume: boolean;
}

/** `relay` — server → host. Wrapper for every player message that the server forwards to the host. The server validates the inner message (sender, schema, rate, seat), then forwards it unchanged inside `d`, adding who sent it. The envelope `seq` is the server→host sequence; the player's own `seq` is not forwarded. If the host is disconnected the inner message is rejected with PAUSED and not queued. */
export interface RelayPayload {
  /** Player who sent the inner message. */
  from: PlayerId;
  /** Type of the inner message. */
  t: RelayedType;
  /** Payload of the inner message, exactly as sent by the player and valid against the schema of `t`. */
  d: PayloadMap[RelayedType];
}

/** `snapshot.end` — server → host and clients. Marks the end of the state snapshot sent after `room.created`, `room.joined` or `room.resumed`. Until it arrives the receiver should build state silently (no animations, no haptics). */
export interface SnapshotEndPayload {
  /** Server clock when the snapshot was completed. */
  serverTimeMs: TimeMs;
  /** Sequence number of the newest entry in the room outcome log; 0 when the log is empty. */
  lastOutcomeSeq: number;
}

/** `room.create` — host → server. The host application opens a new room ("New Mission"). The connection becomes the room's host. The server answers `room.created`, then `settings.state`, `room.state`, `roles.state`, `snapshot.end`. */
export interface RoomCreatePayload {
  /** Initial settings; missing fields take their defaults. */
  settings?: SettingsPatch;
}

/** `room.created` — server → host. Confirms the new room and gives the host everything it shows on the title screen. The host renders `joinUrl` as the QR code. */
export interface RoomCreatedPayload {
  /** The 4-letter room code. */
  room: RoomCode;
  /** Host reconnect token. The host must persist it (PlayerPrefs / localStorage) so a refresh can `room.resume`. */
  hostToken: Token;
  /** Player join URL and QR content: `<clientBaseUrl>?room=<CODE>`. */
  joinUrl: string;
  /** Audience join URL and QR content: `<clientBaseUrl>?room=<CODE>&watch=1`. */
  spectateUrl: string;
  /** Player slots. Always 10. */
  maxPlayers: number;
  /** How long a disconnected player keeps slot and roles. Always 180000 (3 min). */
  slotHoldMs: number;
  /** How long the room survives without its host. Always 600000 (10 min). */
  roomHoldMs: number;
}

/** `room.join` — client → server. A phone joins a room as a player or as a spectator. No account and no personal data: only a nickname and an avatar. The server answers `room.joined` followed by the snapshot. A PLAYER request becomes a spectator with `pendingPlayer = true` when the Build phase has started (late join) or when all 10 slots are taken. */
export interface RoomJoinPayload {
  /** Room code typed or taken from the `room` URL parameter, upper-cased. */
  room: RoomCode;
  /** PLAYER, or SPECTATOR when the URL has `watch=1`. */
  as: JoinAs;
  /** Requested nickname, before server normalisation. Required when `as` = PLAYER; ignored for SPECTATOR. */
  nickname?: string;
  /** Requested avatar. Required when `as` = PLAYER; ignored for SPECTATOR. */
  avatar?: Avatar;
  /** Device preferences; defaults (all false, 100 %, haptics true, lang from `hello`) when missing. */
  prefs?: PlayerPrefs;
}

/** `room.joined` — server → client. Confirms the join and hands out the reconnect token. The phone stores `room` and `token` in sessionStorage. The snapshot follows. */
export interface RoomJoinedPayload {
  /** Room code. */
  room: RoomCode;
  /** Membership actually granted. */
  kind: MemberKind;
  /** PlayerId when `kind` = PLAYER, SpectatorId when SPECTATOR. */
  id: PlayerId | SpectatorId;
  /** Seat number for players; null for spectators. */
  slot: number | null;
  /** Nickname after normalisation; null for spectators who gave none. */
  nickname: Nickname | null;
  /** Reconnect token for `room.resume`. */
  token: Token;
  /** Why the member is a spectator; null for players. */
  spectatorReason: SpectatorReason | null;
  /** True when the spectator will be promoted to player at the next vote round (see `room.promoted`). */
  pendingPlayer: boolean;
}

/** `room.resume` — any → server. Reattaches a new connection to an existing membership (player, spectator or host) using the token. The server answers `room.resumed` followed by the snapshot. Any older connection using the same token receives `bye` REPLACED. */
export interface RoomResumePayload {
  /** Room code. */
  room: RoomCode;
  /** Token from `room.joined` or `room.created`. */
  token: Token;
  /** Host only: sequence number of the last outcome the host has durably applied (0 = none). The server replays every later outcome during the snapshot. Ignored for phones. */
  lastOutcomeSeq?: number;
}

/** `room.resumed` — server → host and clients. Confirms the resume. The snapshot follows. The token stays the same. */
export interface RoomResumedPayload {
  /** Room code. */
  room: RoomCode;
  /** Membership that was resumed. */
  kind: ConnKind;
  /** The literal "host" for the host, else a PlayerId or a SpectatorId. */
  id: string | PlayerId | SpectatorId;
  /** Seat number for players; null otherwise. */
  slot: number | null;
  /** Spectators only: still waiting to be promoted. False otherwise. */
  pendingPlayer: boolean;
  /** True when the game is paused at the time of the resume. */
  paused: boolean;
}

/** `room.state` — server → host and clients. Full membership snapshot. Sent in every snapshot and broadcast after any change to it: join, leave, kick, disconnect, reconnect, slot expiry, promotion, profile or preference change, veto use, pause change, host connect/disconnect. Roles are in `roles.state`, the phase in `phase.set`. */
export interface RoomStatePayload {
  /** Room code. */
  room: RoomCode;
  /** False while the host is away (the game is then paused). */
  hostConnected: boolean;
  /** True while the game is paused for any reason. */
  paused: boolean;
  /** Players ordered by `slot`. */
  players: PlayerInfo[];
  /** Connected spectators, including pending players. */
  spectatorCount: number;
  /** Spectators waiting to be promoted to player. */
  pendingPlayerCount: number;
}

/** `room.leave` — client → server. The member leaves for good. The slot is freed at once (no 3-minute hold), the token is revoked, the player's roles are redistributed, and the server answers `bye` LEFT. */
export interface RoomLeavePayload {
}

/** `room.kick` — host → server. The host removes a player. The player receives `bye` KICKED, the token is revoked, the slot is freed and the roles are redistributed. The person can join again with the room code. */
export interface RoomKickPayload {
  /** Player to remove. */
  playerId: PlayerId;
}

/** `room.close` — host → server. The host ends the session. Every connection receives `bye` ROOM_CLOSED and all tokens are revoked. */
export interface RoomClosePayload {
}

/** `room.promoted` — server → client. Tells a pending spectator that it is now a full player. Sent when a vote round opens (before the electorate is fixed) or a new mission starts, while a slot is free; pending players are promoted in join order. The token stays valid; the SpectatorId is retired. `room.state` and `roles.state` follow for everyone. */
export interface RoomPromotedPayload {
  /** The new PlayerId. */
  id: PlayerId;
  /** Seat number. */
  slot: number;
  /** Roles received through rebalancing (see Role rules); may be empty before roles lock. */
  roles: RoleId[];
}

/** `player.profile` — client → server. Changes the sender's nickname and avatar. The server broadcasts `room.state`. */
export interface PlayerProfilePayload {
  /** Requested nickname, before server normalisation. */
  nickname: string;
  /** Requested avatar. */
  avatar: Avatar;
}

/** `player.prefs` — client → server. Sets the sender's accessibility and language preferences at any time, including while paused. For players the server broadcasts `room.state` so the host can adapt (for example subtitles or text scale on shared prompts). Spectator preferences are stored but not broadcast. */
export interface PlayerPrefsPayload {
  /** Complete preference set (all fields). */
  prefs: PlayerPrefs;
}

/** `settings.set` — host → server. The host changes one or more room settings. Only the fields present change. The server broadcasts `settings.state`. Changes to timers and vote rules apply from the next vote round; a round already open keeps the values in its `vote.opened`. */
export interface SettingsSetPayload {
  /** Fields to change. */
  settings: SettingsPatch;
}

/** `settings.state` — server → host and clients. Complete current settings. Sent in every snapshot and after every accepted `settings.set`. This is how accessibility flags reach every device. */
export interface SettingsStatePayload {
  /** All settings. */
  settings: RoomSettings;
}

/** `roles.pick` — client → server. PICK mode: the sender claims a role group, or releases the current claim with null. A player holds at most one group; claiming another releases the previous one. The server broadcasts `roles.state`. */
export interface RolesPickPayload {
  /** Lead role of the group to claim (see `roles.state.groups[].lead`), or null to release. */
  lead: RoleId | null;
}

/** `roles.vote` — client → server. VOTE mode: the sender votes for the player who should be Flight Director. Sending again changes the vote. A player may vote for themself. The server broadcasts `roles.state`. */
export interface RolesVotePayload {
  /** Candidate for the FLIGHT group. */
  playerId: PlayerId;
}

/** `roles.lock` — host → server. The host finalises role assignment in the lobby. The server computes the role groups for the current player count, completes the assignment for the active mode (see Role rules), sets `locked = true` and broadcasts `roles.state`. If the host never sends it, the server does the same automatically when the phase leaves LOBBY. */
export interface RolesLockPayload {
}

/** `roles.set` — host → server. The host assigns roles explicitly (teacher override, manual fix after players leave). Allowed in any phase. Sets `locked = true`. Spent abilities stay spent because they are tracked per role. */
export interface RolesSetPayload {
  /** One entry per player who receives roles. */
  assignments: Array<{
      /** Player. */
      playerId: PlayerId;
      /** Roles for that player; may be empty. */
      roles: RoleId[];
    }>;
}

/** `roles.rotate` — host → server. Campaign rotation between missions. The server recomputes the role groups for the current player count and gives group *i* (table order) to the player who is next in slot order after the previous holder of group *i*; with unchanged membership every player moves on by one group. Sets `locked = true` and broadcasts `roles.state`. */
export interface RolesRotatePayload {
}

/** `roles.state` — server → host and clients. Complete role assignment. Sent in every snapshot and after every change (pick, vote, lock, set, rotate, rebalance after a leave or a promotion, ability spent, new mission). `groups` always covers all ten roles exactly once. */
export interface RolesStatePayload {
  /** Active assignment mode. */
  mode: RoleAssignMode;
  /** False in the lobby until roles are locked; true afterwards. */
  locked: boolean;
  /** Role groups for the current player count, in table order. */
  groups: RoleGroup[];
  /** VOTE mode before lock: current votes per candidate (candidates with at least one vote). Empty otherwise. */
  flightVotes: Array<{
      /** Candidate. */
      playerId: PlayerId;
      /** Votes received. */
      n: number;
    }>;
  /** Roles whose once-per-mission ability is spent in the current mission. */
  abilitiesUsed: RoleId[];
}

/** `ability.use` — client → server. The holder of a role uses its once-per-mission ability. FLIGHT (Decision Time) is resolved by the server: it ends the current VOTE or RUNOFF stage at once, or, during a tie-break, makes `optionId` win. Every other ability changes the simulation, so the server asks the host with `ability.requested` and spends the ability only when the host accepts. On success everyone receives `ability.used`. */
export interface AbilityUsePayload {
  /** Role whose ability is used. */
  role: RoleId;
  /** FLIGHT only, required: the active vote round. */
  roundId?: RoundId;
  /** FLIGHT only. Required during TIEBREAK_TRIVIA / TIEBREAK_PICK (must be a tied option; it wins). Optional during VOTE / RUNOFF: if the close produces a tie that includes it, it wins. */
  optionId?: OptionId;
  /** STRUCT only, required: stage to reinforce (1 = first stage, 2 = upper stage, …). */
  stageIndex?: number;
}

/** `ability.requested` — server → host. Asks the host to apply a simulation ability (every role except FLIGHT). The host must answer `ability.resolve` within 5 s; no answer, or a host disconnect before the answer, counts as declined with reason NOT_APPLICABLE. */
export interface AbilityRequestedPayload {
  /** Server-chosen id to quote in `ability.resolve`. */
  requestId: RequestId;
  /** Player who used the ability. */
  playerId: PlayerId;
  /** Role whose ability is requested (never FLIGHT). */
  role: RoleId;
  /** STRUCT: stage to reinforce; null for other roles. */
  stageIndex: number | null;
}

/** `ability.resolve` — host → server. The host accepts or declines an `ability.requested`. On accept the server marks the ability spent and broadcasts `ability.used` and `roles.state`; on decline it sends `error` ABILITY_REJECTED to the player and the ability stays available. */
export interface AbilityResolvePayload {
  /** Id from `ability.requested`. */
  requestId: RequestId;
  /** True when the host applied the ability effect. */
  accepted: boolean;
  /** Why it was declined; null when accepted. */
  reason: AbilityRejectReason | null;
}

/** `ability.consume` — host → server. The host spends a role ability through a game event, without a player request. The server marks it spent and broadcasts `ability.used` (trigger HOST) and `roles.state`. */
export interface AbilityConsumePayload {
  /** Role whose ability is spent. */
  role: RoleId;
  /** What spent it. */
  reason: AbilityConsumeReason;
}

/** `ability.used` — server → host and clients. Announces that a role ability is now spent for this mission. An outcome-log message: the host applies its effect (for trigger OVER_BUDGET_WIN the host adds the +10 % budget). */
export interface AbilityUsedPayload {
  /** Position in the room outcome log. */
  outcomeSeq: OutcomeSeq;
  /** Role whose ability was spent. */
  role: RoleId;
  /** Current holder of the role; null if nobody holds it. */
  playerId: PlayerId | null;
  /** What spent it. */
  trigger: AbilityTrigger;
  /** Vote round concerned (FLIGHT Decision Time, PM over-budget win); null otherwise. */
  roundId: RoundId | null;
  /** STRUCT Reinforce: stage; null otherwise. */
  stageIndex: number | null;
}

/** `phase.set` — host → server → client (relayed unchanged). The host announces the current position in the game state machine. The server checks the transition against the phase graph, stores the message, applies the server-side effects of the phase (join rules, role lock, new-mission reset) and relays it unchanged. Sent on every change of any field. */
export interface PhaseSetPayload {
  /** Mission counter. 0 before the first mission. The host increases it by 1 when a new mission or a retry starts; the server then performs the new-mission reset. */
  missionSeq: number;
  /** Game mode, for client UI. */
  mode: GameMode;
  /** Top-level phase. */
  phase: Phase;
  /** Sub-state; NONE when the phase has none. */
  sub: SubPhase;
  /** PDR or CDR when `sub` = REVIEW; FRR when `phase` = FRR; null otherwise. */
  review: ReviewId | null;
  /** F0 or F1 in COUNTDOWN, F2–F13 in FLIGHT, null otherwise. */
  flightPhase: FlightPhase | null;
  /** Flight segment in FLIGHT; null otherwise. */
  segment: FlightSegment | null;
  /** True while the parallel booster-return track F7b is running. */
  boosterTrack: boolean;
  /** Chosen contract; null until one is chosen. */
  contractId: DataId | null;
  /** Build progress for the phase tracker; null outside BUILD. */
  step: {
      /** Current build step, 1-based. */
      index: number;
      /** Planned number of build steps. */
      total: number;
    } | null;
}

/** `game.pause` — host → server. The host pauses the game. The server freezes every server timer and slot-hold countdown and broadcasts `game.paused`. */
export interface GamePausePayload {
}

/** `game.paused` — server → host and clients. The game is paused. While paused: all server timers and slot-hold countdowns are frozen, phones freeze local minigame clocks, and the server rejects pause-blocked messages with PAUSED. Sent on `game.pause`, when the host connection drops, and in snapshots taken while paused. */
export interface GamePausedPayload {
  /** Why the game is paused. HOST_DISCONNECTED takes precedence when both apply. */
  reason: PauseReason;
  /** Server clock when the pause began. */
  atMs: TimeMs;
  /** HOST_DISCONNECTED: when the room is destroyed if the host does not return (pause start + 10 min); null for HOST_REQUEST. */
  roomExpiresAtMs: TimeMs | null;
}

/** `game.resume` — host → server. The host resumes the game. Required after `game.pause` and also after a host reconnect: the room stays paused after `room.resumed` until the host, having restored its state, sends this. */
export interface GameResumePayload {
}

/** `game.resumed` — server → host and clients. The game continues. Every deadline issued before the pause (`…AtMs` fields of `vote.stage`, `poll.call`, `mg.start`, `console.alert` windows, `blackout.set`, `room.state.players[].slotExpiresAtMs`) moves later by `pausedForMs`; receivers shift their local copies and the server does not resend them. */
export interface GameResumedPayload {
  /** Server clock when the game resumed. */
  atMs: TimeMs;
  /** Length of the pause in milliseconds. */
  pausedForMs: number;
}

/** `notice.show` — host → server → client (relayed unchanged). The host shows a short text on phones: CAPCOM subtitle, hint, "what just happened" summary, classroom discussion prompt, fact moment or warning. Text is always a string-table reference. */
export interface NoticeShowPayload {
  /** What kind of notice. */
  kind: NoticeKind;
  /** Text to show (≤ 25 words on screen, §12.1). */
  text: TextRef;
  /** Fact shown (kind FACT), so the phone can link to the Codex; null otherwise. */
  factId: DataId | null;
  /** How long to show it; 0 = until dismissed by the user. */
  durationMs: number;
  /** Players to show it to; null = every player and spectator. */
  to: PlayerId[] | null;
}

/** `build.state` — host → server → client (relayed unchanged). Current build as computed by the host: chosen parts, Readiness Dashboard, budget, schedule and open validation issues. Sent after every commit, test, anomaly resolution and rework. Phones show it on the "our rocket" and design-review screens; they never recompute it. */
export interface BuildStatePayload {
  /** Contract being built for. */
  contractId: DataId;
  /** Parts committed so far, in vote order. */
  parts: Array<{
      /** Part category id (e.g. "first_stage_engine"). */
      category: DataId;
      /** Chosen part id. */
      partId: DataId;
      /** Quantity (engine count, redundancy level); 1 when not applicable. */
      count: number;
    }>;
  /** Readiness Dashboard values. */
  metrics: Array<{
      /** Metric (unit in the id). */
      metric: MetricId;
      /** Current value. */
      value: number;
      /** Contract requirement or limit for this metric, same unit; null when none. */
      required: number | null;
      /** Colour class. */
      rating: Rating;
    }>;
  /** Contract budget in $M (game value), including Emergency Funding once triggered. */
  budgetTotalM: number;
  /** Spent so far in $M (game value). */
  budgetSpentM: number;
  /** Contract deadline in days (game value). */
  scheduleLimitDays: number;
  /** Schedule used so far in days (game value). */
  scheduleUsedDays: number;
  /** Open validation issues, most severe first. */
  issues: Array<{
      /** Validation rule id (§6.11). */
      ruleId: DataId;
      /** Severity. */
      severity: Severity;
      /** Explanation shown to players. */
      text: TextRef;
    }>;
}

/** `build.event` — host → server → client (relayed unchanged). One build-phase event for the phone feed: a test result, a revealed flaw, a drawn anomaly card, a review opening or passing, a rework, a deadline slip, a Lessons Learned bonus. The decision itself, if any, is a separate vote. */
export interface BuildEventPayload {
  /** What happened. */
  kind: BuildEventKind;
  /** Test id, anomaly card id, review id, part category id or lesson id; null when none. */
  subjectId: DataId | null;
  /** One-line description. */
  text: TextRef;
  /** Dashboard changes caused by the event; empty when none. */
  deltas: Delta[];
  /** Related fact to show; null when none. */
  factId: DataId | null;
}

/** `flight.event` — host → server → client (relayed unchanged). One flight event for the phone feed: lift-off, Max Q, staging, engine-out, abort, touchdown and so on, with its fact moment. */
export interface FlightEventPayload {
  /** Event id from the game data (e.g. "engine_out", "meco"). */
  eventId: DataId;
  /** Flight phase in which it happened. */
  flightPhase: FlightPhase;
  /** Mission elapsed time in seconds (negative before lift-off). */
  metS: number;
  /** Severity. */
  severity: EventSeverity;
  /** One-line description. */
  text: TextRef;
  /** Fact moment to show; null when none. */
  factId: DataId | null;
}

/** `flight.hud` — host → server → client (relayed unchanged). Compact copy of the host HUD for every phone header and for spectators. At most 5 Hz. Not sent during a blackout. */
export interface FlightHudPayload {
  /** Mission elapsed time, s (negative before lift-off). */
  metS: number;
  /** Altitude above the surface, km. */
  altitudeKm: number;
  /** Speed, m/s (surface-relative below 70 km, orbital above). */
  velocityMs: number;
  /** Vertical speed, m/s (positive up). */
  verticalSpeedMs: number;
  /** Dynamic pressure, kPa. */
  qKpa: number;
  /** Acceleration felt, in g. */
  gLoad: number;
  /** Throttle, percent. */
  throttlePct: number;
  /** Propellant left in the active stage, percent. */
  propellantPct: number;
  /** Δv remaining in the vehicle, m/s. */
  dvRemainingMs: number;
  /** Apoapsis altitude, km; null when not defined. */
  apoapsisKm: number | null;
  /** Periapsis altitude, km; null when not defined. */
  periapsisKm: number | null;
  /** Heat load as percent of heat-shield capacity. */
  heatLoadPct: number;
  /** Simulation time factor: 0.1 during minigame bullet-time, 1 normal, up to 1000 in coasts (§9.7, §10.1). */
  warp: number;
}

/** `vote.open` — host → server. The host opens a vote round of any kind and hands the server everything needed to run and resolve it without the host: options with host-computed "if chosen" numbers and flags, the role area, the optional Predict question and trivia tie-break question with their answers, and the seed of the coin flip. The server promotes pending players, fixes the electorate, builds the stage plan for `kind` (see Vote profiles) and broadcasts `vote.opened` then `vote.stage`. Answers, the default option and the coin seed are never forwarded to phones. */
export interface VoteOpenPayload {
  /** New round id, never used before in this room. */
  roundId: RoundId;
  /** Vote kind; selects the profile. */
  kind: VoteKind;
  /** What is being decided: part category id (PART), test id (TEST), anomaly card id (ANOMALY), review id (REVIEW, REWORK_CATEGORY), abort mode id (ABORT), decision id (FLIGHT_DECISION), flight segment (PILOT); null for CONTRACT, LIVERY, PATCH, MCM. */
  subjectId: DataId | null;
  /** Title shown on every device (category name, card title, question). */
  title: TextRef;
  /** One sentence on why it matters (§4.1 step 1); null when none. */
  why: TextRef | null;
  /** Roles whose area this is, most relevant first. Their holders may tag options, receive `vote.insight`, and their Recommended tag decides an all-abstain round. Empty when no role owns it. */
  ownerRoles: RoleId[];
  /** Options in display order, unique ids. PART: 3–5 (§6.2). Quick kinds: 2–3. */
  options: VoteOption[];
  /** Option that wins when nobody votes and no Recommended tag applies (e.g. SKIP, CONTINUE, PASS). Must be null for PART so that the cheapest option wins (§4.2 Abstain). */
  defaultOptionId: OptionId | null;
  /** Solo hint (§3.2, §4.2 Solo play); null in multiplayer. */
  hint: {
      /** Option the AI Flight Director suggests. */
      optionId: OptionId;
      /** Reason shown with the hint. */
      reason: TextRef;
    } | null;
  /** Predict question (§4.1 step 4, about 1 round in 3); null for none. PART only. */
  predict: Question | null;
  /** Trivia sudden-death question used if the vote ties (§4.2 tie-breaker 2); null to skip straight to the coin flip. Its `id` is a fact id. */
  trivia: Question | null;
  /** Seed of the visible coin flip, drawn by the host from its `tiebreak` random stream (§17.6). Winner = tied options in display order, index `coinSeed mod count`. */
  coinSeed: Uint32;
  /** Stage duration overrides; null for profile defaults. */
  timers: VoteTimers | null;
}

/** `vote.opened` — server → host and clients. Public description of the round for every device, including the host as confirmation. Contains the options with their "if chosen" numbers, the electorate, the rules in force and the stage plan. `vote.stage` follows immediately. */
export interface VoteOpenedPayload {
  /** Round id. */
  roundId: RoundId;
  /** Vote kind. */
  kind: VoteKind;
  /** As in `vote.open`. */
  subjectId: DataId | null;
  /** Title. */
  title: TextRef;
  /** Why it matters; null when none. */
  why: TextRef | null;
  /** Roles whose holders may tag options. */
  ownerRoles: RoleId[];
  /** Options in display order. */
  options: VoteOption[];
  /** Solo hint; null in multiplayer. */
  hint: {
      /** Suggested option. */
      optionId: OptionId;
      /** Reason shown with the hint. */
      reason: TextRef;
    } | null;
  /** Predict question without its answer; null for none. */
  predict: QuestionPublic | null;
  /** Electorate: every player in the room when the round opened, connected or not. Fixed for the round, except that players who leave or are kicked are removed. */
  voters: PlayerId[];
  /** True when the room has exactly one player: no INSPECT stage, untimed VOTE, first ballot decides (§4.2 Solo play). */
  solo: boolean;
  /** True when this kind allows vetoes (PART). */
  vetoAllowed: boolean;
  /** True when this kind allows role tags (PART). */
  tagsAllowed: boolean;
  /** True when a runoff is possible in this round (setting on and kind is PART or CHOICE profile). */
  strictMajority: boolean;
  /** Tally visibility in force for this round. */
  tallyVisibility: TallyVisibility;
  /** Audience weight in force for this round. */
  audienceVoteWeight: number;
  /** Stages that will run in order, with planned durations. Conditional stages (RUNOFF, TIEBREAK_TRIVIA, TIEBREAK_PICK) are not listed; they are announced by `vote.stage` if they happen. */
  plan: StagePlan[];
}

/** `vote.stage` — server → host and clients. The round entered a stage. The server is the only clock for vote stages. CLOSED ends the round: after it the host may open the next vote. */
export interface VoteStagePayload {
  /** Round id. */
  roundId: RoundId;
  /** Stage that just began. */
  stage: VoteStage;
  /** Server clock when the stage began. */
  startedAtMs: TimeMs;
  /** Server clock when the stage ends; null for untimed stages (solo VOTE, CLOSED). A stage can end earlier (early close, Decision Time, host close, trivia answered). */
  endsAtMs: TimeMs | null;
  /** Options that can be chosen in this stage: all winnable options (VOTE), the two runoff options (RUNOFF), the tied options (TIEBREAK_TRIVIA, TIEBREAK_PICK). For REVEAL, PREDICT, INSPECT, RESULT and CLOSED: all options not vetoed. */
  candidateIds: OptionId[];
  /** TIEBREAK_PICK only: the trivia winner who must send `vote.trivia.pick`; null otherwise. */
  pickerId: PlayerId | null;
}

/** `vote.insight` — host → server → client (relayed unchanged). Extra information for the holder of one role about the options of the current round (for example reliability ranges for BOOSTER). Computed by the host and delivered only to the player(s) holding `role`. Send it right after `vote.opened`. */
export interface VoteInsightPayload {
  /** Round id. */
  roundId: RoundId;
  /** Role whose holder receives the insight (routing key). */
  role: RoleId;
  /** Insight lines. */
  lines: Array<{
      /** Option the line is about. */
      optionId: OptionId;
      /** Insight line with its numbers in `args`. */
      text: TextRef;
    }>;
}

/** `vote.predict` — client → server. The sender's answer to the Predict question. The first answer is final ("commit to a prediction"). Spectator answers only feed the audience histogram. */
export interface VotePredictPayload {
  /** Round id. */
  roundId: RoundId;
  /** Zero-based index into `vote.opened.predict.choices`. */
  choiceIndex: number;
}

/** `vote.predict.result` — server → host and clients. Sent when the PREDICT stage ends: the correct answer and who got it right. An outcome-log message: the host awards Knowledge Points (50 per correct prediction) and announces them with `kp.awarded`. The PREDICT stage ends early when every connected voter has answered. */
export interface VotePredictResultPayload {
  /** Position in the room outcome log. */
  outcomeSeq: OutcomeSeq;
  /** Round id. */
  roundId: RoundId;
  /** Index of the correct choice. */
  correctIndex: number;
  /** One entry per voter. */
  results: Array<{
      /** Voter. */
      playerId: PlayerId;
      /** Their answer; null when they did not answer. */
      choiceIndex: number | null;
      /** True when the answer is correct. */
      correct: boolean;
    }>;
  /** Spectator answers per choice, in choice order. */
  audienceCounts: number[];
}

/** `vote.tag` — client → server. A role-holder puts a Recommended or Concern badge on an option in their area, or removes it with null. Each holder has at most one tag per option and at most one RECOMMENDED per round: recommending another option moves the badge. The server broadcasts `vote.tags`. */
export interface VoteTagPayload {
  /** Round id. */
  roundId: RoundId;
  /** Option to tag. */
  optionId: OptionId;
  /** Badge to set, or null to remove the sender's badge from this option. */
  tag: TagKind | null;
}

/** `vote.tags` — server → host and clients. All role tags of the round. Sent after every accepted `vote.tag`, after a veto that removed tags, and in snapshots. */
export interface VoteTagsPayload {
  /** Round id. */
  roundId: RoundId;
  /** Current tags. */
  tags: Array<{
      /** Tagged option. */
      optionId: OptionId;
      /** Role-holder who tagged it. */
      playerId: PlayerId;
      /** The first role in `ownerRoles` that this player holds. */
      role: RoleId;
      /** Badge. */
      tag: TagKind;
    }>;
}

/** `vote.cast` — client → server. Casts or changes the sender's ballot. The last accepted ballot counts; ballots can be changed until the stage ends. A spectator's ballot goes to the separate audience tally. The server answers `vote.ack` and updates `vote.tally`. */
export interface VoteCastPayload {
  /** Round id. */
  roundId: RoundId;
  /** Option voted for. */
  optionId: OptionId;
}

/** `vote.ack` — server → client. Tells one player or spectator what their own ballot currently is. Sent after an accepted `vote.cast`, when their ballot is emptied (veto, option no longer winnable, runoff), and in snapshots. Needed because tallies may be hidden. */
export interface VoteAckPayload {
  /** Round id. */
  roundId: RoundId;
  /** The receiver's current ballot; null when empty. */
  optionId: OptionId | null;
  /** Why this is being sent. */
  reason: BallotChange;
}

/** `vote.tally` — server → host and clients. Live tally during VOTE and RUNOFF. Sent at most every 200 ms when something changed, and once at the start of each of those stages. With hidden tallies the counts, the audience counts and the leader are null for everyone, including the host; only who has voted is shown. */
export interface VoteTallyPayload {
  /** Round id. */
  roundId: RoundId;
  /** VOTE or RUNOFF. */
  stage: VoteStage;
  /** Player ballots per candidate option in display order; null when tallies are hidden. */
  counts: OptionCount[] | null;
  /** Players who currently have a ballot. */
  votedIds: PlayerId[];
  /** Spectator ballots per candidate option; null when tallies are hidden. */
  audienceCounts: OptionCount[] | null;
  /** Number of spectators who currently have a ballot. */
  audienceTotal: number;
  /** Option with the most player ballots (first in display order among equals) for the ghost preview; null when nobody has voted or tallies are hidden. */
  leadingOptionId: OptionId | null;
}

/** `vote.veto` — client → server. Uses the sender's one veto of the mission to remove an option before voting closes. Ballots and tags on the option are cleared. The server broadcasts `vote.vetoed`, `room.state` (veto spent) and updated tags and tally. */
export interface VoteVetoPayload {
  /** Round id. */
  roundId: RoundId;
  /** Option to remove. */
  optionId: OptionId;
}

/** `vote.vetoed` — server → host and clients. An option was vetoed. The host plays the veto animation naming the vetoer's role. Replayed in snapshots for every veto of the active round. */
export interface VoteVetoedPayload {
  /** Round id. */
  roundId: RoundId;
  /** Removed option. */
  optionId: OptionId;
  /** Player who spent the veto. */
  playerId: PlayerId;
  /** Players whose ballot was on the removed option and is now empty (each also receives `vote.ack` OPTION_REMOVED). */
  clearedVoterIds: PlayerId[];
  /** Options still in the round, in display order. */
  remainingOptionIds: OptionId[];
}

/** `vote.close` — host → server. The host ends the current stage now (skip button, teacher control). REVEAL, PREDICT and INSPECT move to the next stage; VOTE and RUNOFF close and resolve with the ballots present (`closedBy` = HOST); TIEBREAK stages fall through to the next tie-breaker; RESULT moves to CLOSED. */
export interface VoteClosePayload {
  /** Round id. */
  roundId: RoundId;
}

/** `vote.cancel` — host → server. The host abandons the round without a result. No veto is refunded. The server broadcasts `vote.cancelled`. */
export interface VoteCancelPayload {
  /** Round id. */
  roundId: RoundId;
}

/** `vote.cancelled` — server → host and clients. The round ended without a result. Devices leave the vote screen. No `vote.stage` CLOSED follows. */
export interface VoteCancelledPayload {
  /** Round id. */
  roundId: RoundId;
  /** Why it was cancelled. */
  reason: CancelReason;
}

/** `vote.trivia.open` — server → host and clients. The vote is tied and FLIGHT's ballot did not decide it: a single fact question is asked. Sent together with `vote.stage` TIEBREAK_TRIVIA. The first correct answer, in order of arrival at the server, wins the right to pick among the tied options. */
export interface VoteTriviaOpenPayload {
  /** Round id. */
  roundId: RoundId;
  /** The question without its answer; `id` is the fact id. */
  question: QuestionPublic;
  /** The tied options, in display order. */
  tiedOptionIds: OptionId[];
}

/** `vote.trivia.answer` — client → server. The sender's single answer to the trivia question. The stage ends at the first correct answer, or when every connected voter has answered, or on the timer. */
export interface VoteTriviaAnswerPayload {
  /** Round id. */
  roundId: RoundId;
  /** Zero-based index into the question's choices. */
  choiceIndex: number;
}

/** `vote.trivia.result` — server → host and clients. Outcome of the trivia sudden-death. With a winner, `vote.stage` TIEBREAK_PICK follows; without one, the coin flip decides and `vote.result` follows. An outcome-log message: the host awards the 30 knowledge score points to the winner. */
export interface VoteTriviaResultPayload {
  /** Position in the room outcome log. */
  outcomeSeq: OutcomeSeq;
  /** Round id. */
  roundId: RoundId;
  /** Fact the question was about. */
  factId: DataId;
  /** Index of the correct choice. */
  correctIndex: number;
  /** First player to answer correctly; null when nobody did. */
  winnerId: PlayerId | null;
  /** Answers in order of arrival. */
  answers: Array<{
      /** Player who answered. */
      playerId: PlayerId;
      /** Their answer. */
      choiceIndex: number;
      /** True when correct. */
      correct: boolean;
    }>;
}

/** `vote.trivia.pick` — client → server. The trivia winner picks the winning option among the tied ones. If no pick arrives before the stage ends, the winner's own ballot is used when it is on a tied option; otherwise the coin flip decides. */
export interface VoteTriviaPickPayload {
  /** Round id. */
  roundId: RoundId;
  /** One of the tied options. */
  optionId: OptionId;
}

/** `vote.result` — server → host and clients. The resolved outcome of the round, sent with `vote.stage` RESULT. Resolved entirely by the server (see Vote resolution). An outcome-log message: the host applies the winner to the simulation and answers `vote.commit`. If `emergencyFunding` is true an `ability.used` (PM, OVER_BUDGET_WIN) follows. */
export interface VoteResultPayload {
  /** Position in the room outcome log. */
  outcomeSeq: OutcomeSeq;
  /** Round id. */
  roundId: RoundId;
  /** Vote kind. */
  kind: VoteKind;
  /** As in `vote.open`. */
  subjectId: DataId | null;
  /** Winning option. */
  winnerId: OptionId;
  /** Rule that decided the winner. */
  method: ResolveMethod;
  /** Why the deciding voting stage ended. */
  closedBy: CloseCause;
  /** Final ballots per candidate of the deciding stage (the runoff if one was held), in display order, including the audience ballot when it counted. */
  counts: OptionCount[];
  /** One entry per voter. */
  ballots: Array<{
      /** Voter. */
      playerId: PlayerId;
      /** Their final ballot in the deciding stage; null = abstained (did not vote, or disconnected at close). */
      optionId: OptionId | null;
    }>;
  /** Spectator ballots per candidate of the deciding stage ("Audience says"). */
  audienceCounts: OptionCount[];
  /** Option that received the audience's one extra ballot (weight 1 and a unique audience favourite); null otherwise. */
  audienceBallot: OptionId | null;
  /** When a runoff was held: the first-round counts; null otherwise. */
  firstRoundCounts: OptionCount[] | null;
  /** Options that tied for first place before tie-breaking; empty when there was no tie. */
  tiedOptionIds: OptionId[];
  /** Trivia sudden-death winner when `method` = TRIVIA; null otherwise. */
  triviaWinnerId: PlayerId | null;
  /** Vetoes used in this round. */
  vetoes: Array<{
      /** Vetoed option. */
      optionId: OptionId;
      /** Player who vetoed it. */
      playerId: PlayerId;
    }>;
  /** True when the winner has `afford` = EMERGENCY_FUNDING: PM's Emergency Funding is now spent (§4.2 Affordability). */
  emergencyFunding: boolean;
}

/** `vote.commit` — host → server → client (relayed unchanged). The host has applied the result to the simulation. Carries the dashboard changes actually applied and the Codex entries unlocked. It is also the host's acknowledgement of `vote.result`. Send it during the RESULT stage; a fresh `build.state` follows for build votes. */
export interface VoteCommitPayload {
  /** Round id of the applied result. */
  roundId: RoundId;
  /** Option that was applied. */
  winnerId: OptionId;
  /** Dashboard changes applied (green/red); empty for votes that do not change the build. */
  deltas: Delta[];
  /** Codex entries unlocked for everyone by this commit. */
  codexIds: DataId[];
}

/** `ping.send` — client → server. A player sends one of the eight enumerated quick pings, optionally pointing at an option of the active vote round. Allowed in every phase and while paused. */
export interface PingSendPayload {
  /** Which ping. */
  pingId: PingId;
  /** Option of the active round the ping points at; null for none. */
  optionId: OptionId | null;
}

/** `ping.event` — server → host and clients. A player pinged. The host shows it next to the player's avatar; phones show it in the vote screen. */
export interface PingEventPayload {
  /** Player who pinged. */
  playerId: PlayerId;
  /** Which ping. */
  pingId: PingId;
  /** Active vote round when the ping was sent; null when none. */
  roundId: RoundId | null;
  /** Option pointed at; null for none. */
  optionId: OptionId | null;
}

/** `react.send` — client → server. An emoji reaction from a player or a spectator. Allowed in every phase and while paused. */
export interface ReactSendPayload {
  /** Which emoji. */
  emoji: ReactionId;
}

/** `react.event` — server → host and clients. A player reacted. Shown next to the player's avatar. */
export interface ReactEventPayload {
  /** Player who reacted. */
  playerId: PlayerId;
  /** Which emoji. */
  emoji: ReactionId;
}

/** `react.audience` — server → host and clients. Spectator reactions, aggregated: one message per second in which at least one spectator reacted. Spectators are anonymous. */
export interface ReactAudiencePayload {
  /** Length of the aggregation window. Always 1000. */
  windowMs: number;
  /** Reactions received in the window, per emoji. */
  counts: ReactionCounts;
}

/** `poll.open` — host → server. The host starts one round of the GO/NO-GO polling ritual. The server calls the consoles one at a time in the given order: each connected player is called once, at the position of the first of their roles in `order`, and answers for all their roles. The host owns the surrounding flow: after a round with any NO-GO it shows the 15 s discussion and opens round 2; after two NO-GO rounds it opens a REVIEW vote offering Rework (§6.9). */
export interface PollOpenPayload {
  /** New poll id, never used before in this room. */
  pollId: PollId;
  /** FRR or final launch poll. */
  context: PollContext;
  /** Round number of this poll within the review (1 = first poll, 2 = re-poll). */
  round: number;
  /** Consoles in call order. Roles not listed are not called. */
  order: RoleId[];
  /** Answer window per call in milliseconds. Use 5000 (scaled by the server ×1.5 when `a11y.slowTimers`). */
  perCallMs: number;
}

/** `poll.call` — server → host and clients. FLIGHT calls one console. The called player's phone shows GO / NO-GO buttons; the host shows who is being called. The next call follows as soon as the answer arrives or the window ends. Disconnected players are not called; they are recorded as NO_ANSWER. */
export interface PollCallPayload {
  /** Poll id. */
  pollId: PollId;
  /** FRR or final launch poll. */
  context: PollContext;
  /** Round number. */
  round: number;
  /** Position of this call, 1-based. */
  index: number;
  /** Number of calls in this poll. */
  total: number;
  /** Player being called. */
  playerId: PlayerId;
  /** Roles from `order` that this player answers for. */
  roles: RoleId[];
  /** Server clock when the answer window ends. */
  endsAtMs: TimeMs;
}

/** `poll.answer` — client → server. The called player answers GO or NO-GO. */
export interface PollAnswerPayload {
  /** Poll id. */
  pollId: PollId;
  /** The answer. */
  answer: GoNoGo;
}

/** `poll.answered` — server → host and clients. One console answered (or its window ended). The host plays the callout ("GUIDO: GO"). */
export interface PollAnsweredPayload {
  /** Poll id. */
  pollId: PollId;
  /** The recorded answer. */
  entry: PollEntry;
}

/** `poll.result` — server → host and clients. All consoles have been polled. An outcome-log message: the host decides what follows (proceed, discussion and re-poll, or Rework vote). */
export interface PollResultPayload {
  /** Position in the room outcome log. */
  outcomeSeq: OutcomeSeq;
  /** Poll id. */
  pollId: PollId;
  /** FRR or final launch poll. */
  context: PollContext;
  /** Round number. */
  round: number;
  /** All answers in call order, followed by disconnected players as NO_ANSWER. */
  answers: PollEntry[];
  /** True when no answer is NO_GO. */
  allGo: boolean;
  /** Number of NO_GO answers. */
  noGoCount: number;
}

/** `pilot.assign` — host → server → client (relayed unchanged). The host names who sits in the pilot, co-pilot and booster-pilot seats and where each seat reads its input. The server stores it to authorise `pilot.input`, `pilot.action` and `copilot.action`. Sent at every seat change (each flight segment by default). */
export interface PilotAssignPayload {
  /** Segment the assignment is for; null before flight. */
  segment: FlightSegment | null;
  /** Pilot of the main vehicle; null when nobody is named (host operator flies). */
  pilotId: PlayerId | null;
  /** Input source of the pilot seat. PHONE requires `pilotId`. */
  pilotInput: InputSource;
  /** Co-pilot handling staging and deploys on their phone; null for none. */
  copilotId: PlayerId | null;
  /** Second pilot flying the returning booster; null for none. */
  boosterPilotId: PlayerId | null;
  /** Input source of the booster seat; null when there is no booster pilot. */
  boosterInput: InputSource | null;
}

/** `pilot.input` — client → server → host (relayed inside relay). Analogue state of a phone used as a virtual gamepad. Sent on change at up to 30 Hz, and at 5 Hz while unchanged as a keep-alive; if the host receives none for 500 ms it centres pitch, yaw and roll and holds throttle. The server may drop all but the newest queued input. */
export interface PilotInputPayload {
  /** Seat: VEHICLE for the pilot, BOOSTER for the booster pilot. */
  craft: Craft;
  /** Input counter, increasing; the host ignores inputs older than the last applied. */
  n: number;
  /** Throttle position, 0 = closed, 1 = full. */
  throttle: number;
  /** Pitch axis. */
  pitch: number;
  /** Yaw axis. */
  yaw: number;
  /** Roll axis. */
  roll: number;
}

/** `pilot.action` — client → server → host (relayed inside relay). A discrete pilot action from a phone used as a virtual gamepad. Hold gestures are completed on the phone before sending. ABORT is a request: the host opens an ABORT vote unless the escape system fires on its own. */
export interface PilotActionPayload {
  /** Seat: VEHICLE or BOOSTER. */
  craft: Craft;
  /** Action counter, increasing; the host ignores duplicates. */
  n: number;
  /** Which action. */
  action: PilotAction;
  /** Required when `action` = ATT_HOLD. */
  attMode?: AttMode;
  /** Required when `action` = DEPLOY. */
  deploy?: DeployTarget;
}

/** `copilot.action` — client → server → host (relayed inside relay). The co-pilot stages or deploys from their phone while the pilot flies. The co-pilot seat always reads from the phone. */
export interface CopilotActionPayload {
  /** Action counter, increasing; the host ignores duplicates. */
  n: number;
  /** STAGE or DEPLOY. */
  action: CopilotAction;
  /** Required when `action` = DEPLOY. */
  deploy?: DeployTarget;
}

/** `pilot.hud` — host → server → client (relayed unchanged). State the virtual gamepad needs to draw itself: throttle read-back, modes, what STAGE and DEPLOY would do now, pending console requests and the guidance cue. Sent to the phones in pilot seats at up to 10 Hz. */
export interface PilotHudPayload {
  /** Phones to deliver to (pilot, co-pilot, booster pilot). */
  to: PlayerId[];
  /** Vehicle the state is about. */
  craft: Craft;
  /** Actual throttle, percent. */
  throttlePct: number;
  /** Active attitude hold mode. */
  attMode: AttMode;
  /** RCS enabled. */
  rcsOn: boolean;
  /** True when STAGE would do something now. */
  canStage: boolean;
  /** What the context deploy button would deploy now; null for nothing. */
  deployTarget: DeployTarget | null;
  /** Simulation time factor. */
  warp: number;
  /** Open console requests, oldest first. */
  prompts: Array<{
      /** Console request id. */
      requestId: DataId;
      /** Console that asked. */
      role: RoleId;
    }>;
  /** Guidance cue for the current assist level; null for none. */
  cue: TextRef | null;
}

/** `console.config` — host → server → client (relayed unchanged). Layout of one role console for the current flight phase: gauge ranges and limits, and which callout and request buttons to show. Sent when the flight starts and whenever the set changes. Delivered to the holder(s) of `role`. */
export interface ConsoleConfigPayload {
  /** Console (routing key). */
  role: RoleId;
  /** Channels shown on this console. */
  channels: Array<{
      /** Channel. */
      id: TelemetryChannel;
      /** Gauge minimum, channel unit. */
      min: number;
      /** Gauge maximum, channel unit. */
      max: number;
      /** Lower limit; below it the value is out of limits. Null for none. */
      warnLow: number | null;
      /** Upper limit; above it the value is out of limits. Null for none. */
      warnHigh: number | null;
    }>;
  /** Callout buttons available now. */
  calloutIds: DataId[];
  /** Request buttons available now. */
  requestIds: DataId[];
}

/** `console.telemetry` — host → server → client (relayed unchanged). Live telemetry for one role console, computed by the host and delivered only to the holder(s) of `role`. At most 10 messages per second per role; the server drops the excess. Not sent during a blackout. */
export interface ConsoleTelemetryPayload {
  /** Console (routing key). */
  role: RoleId;
  /** Mission elapsed time of the sample, s. */
  metS: number;
  /** Values of this role's channels. */
  v: TelemetryValues;
}

/** `console.alert` — host → server → client (relayed unchanged). A parameter of one console went out of limits. Opens the window in which the matching callout earns a Good Call. Delivered only to the holder(s) of `role`. */
export interface ConsoleAlertPayload {
  /** New alert id. */
  alertId: AlertId;
  /** Console (routing key). */
  role: RoleId;
  /** Callout that matches this alert. */
  calloutId: DataId;
  /** Number that is part of the callout (e.g. engine 3); null when none. */
  arg: number | null;
  /** Severity. */
  severity: AlertSeverity;
  /** Server clock when the Good Call window closes. */
  endsAtMs: TimeMs;
}

/** `console.callout` — client → server → host (relayed inside relay). A role-holder pressed a callout button. The host shows the voice/text callout, and awards a Good Call when it matches an open alert inside its window. False or late callouts have no penalty. */
export interface ConsoleCalloutPayload {
  /** Console the callout comes from. */
  role: RoleId;
  /** Which callout. */
  calloutId: DataId;
  /** Number that is part of the callout (e.g. engine 3); null when none. */
  arg: number | null;
  /** Alert the player is answering, if the phone showed one; null otherwise. */
  alertId: AlertId | null;
  /** Sender's estimate of the server clock at the press; the host uses it, bounded to at most 300 ms before arrival, to judge the window (§17.7). */
  atMs: TimeMs;
}

/** `console.request` — client → server → host (relayed inside relay). A role-holder asks the pilot for an action (for example INCO: "point antenna"). The host shows it as a HUD prompt and includes it in `pilot.hud.prompts`. */
export interface ConsoleRequestPayload {
  /** Console the request comes from. */
  role: RoleId;
  /** Which request. */
  requestId: DataId;
}

/** `console.goodcall` — host → server → client (relayed unchanged). Good Call acknowledgement: a callout matched an alert inside its window. Only good calls are announced; missed or false callouts produce nothing. */
export interface ConsoleGoodcallPayload {
  /** Player who made the call. */
  playerId: PlayerId;
  /** Console. */
  role: RoleId;
  /** Which callout. */
  calloutId: DataId;
  /** Number that is part of the callout; null when none. */
  arg: number | null;
  /** Alert that was answered. */
  alertId: AlertId;
  /** Team Sync gained. 3 by design. */
  syncDelta: number;
  /** Teamwork score gained. 20 by design. */
  points: number;
}

/** `blackout.set` — host → server → client (relayed unchanged). Starts or ends a communications blackout. While active, phones show static instead of consoles and HUD, the host sends no `console.telemetry`, `flight.hud` or `pilot.hud`, and the server discards any that arrive. Minigames (MG-25) still run. */
export interface BlackoutSetPayload {
  /** True while the blackout lasts. */
  active: boolean;
  /** Cause while active; null when not active. */
  cause: BlackoutCause | null;
  /** Server clock when the host expects it to end, for the phone countdown; null when unknown or not active. The real end is the next `blackout.set`. */
  expectedEndAtMs: TimeMs | null;
}

/** `haptic.cue` — host → server → client (relayed unchanged). Asks phones to vibrate with a named pattern. Phones ignore it when the device preference `haptics` is false or the device has no vibration. */
export interface HapticCuePayload {
  /** Which pattern. */
  cue: HapticCue;
  /** Players to cue; null = every player (spectators never). */
  to: PlayerId[] | null;
}

/** `sync.meter` — host → server → client (relayed unchanged). Current Team Sync meter. Sent on every change. At 100 the host opens an MCM vote (5 s) and afterwards resets the meter with reason MOMENT_SPENT. */
export interface SyncMeterPayload {
  /** Meter value after the change. */
  value: number;
  /** Change that produced it. */
  delta: number;
  /** Why it changed. */
  reason: SyncReason;
  /** True when the meter is at 100 and a Mission Control Moment is waiting to be chosen. */
  momentReady: boolean;
}

/** `boost.applied` — host → server → client (relayed unchanged). A boost was applied outside a minigame summary (ability, Mission Control Moment, Lessons Learned, anomaly). Minigame boosts are carried by `mg.summary`. */
export interface BoostAppliedPayload {
  /** The boost that was applied. */
  grant: BoostGrant;
}

/** `boost.state` — host → server → client (relayed unchanged). All boosts currently in force, for the active-boost icons. Sent after every change, including a Reliability Shield being consumed. */
export interface BoostStatePayload {
  /** One entry per boost type in force. */
  boosts: Array<{
      /** Boost type. */
      boost: BoostId;
      /** Mission total in `unit` (for RELIABILITY_SHIELD: shields currently held). */
      total: number;
      /** Unit of `total`. */
      unit: BoostUnit;
    }>;
}

/** `mg.start` — host → server → client (relayed unchanged). The host starts a minigame run on every player phone. Phones load the minigame, answer `mg.ready`, show the one-sentence instruction and demo until `startAtMs`, then run it locally from `seed` and `params` and report one `mg.result`. The host is in bullet-time meanwhile. When `audience` is true spectators receive it too and may play for fun; they report nothing. */
export interface MgStartPayload {
  /** New run id, never used before in this room. */
  runId: RunId;
  /** Minigame id (e.g. "MG-08"). */
  minigameId: DataId;
  /** Minigame type. */
  type: MinigameType;
  /** Seed for the local random generator; the same on every phone. */
  seed: Uint32;
  /** Server clock when play begins. Must be at least 3000 ms after sending, for the instruction and demo (§10.1 rule 4). */
  startAtMs: TimeMs;
  /** Length of play in milliseconds (15–45 s by design). */
  durationMs: number;
  /** Difficulty the minigame scales with (§10.1 rule 6). */
  assistLevel: AssistLevel;
  /** Flight phase it belongs to; null for build-phase and debrief minigames. */
  flightPhase: FlightPhase | null;
  /** True to deliver the run to spectators as well. */
  audience: boolean;
  /** Parameters common to all players. */
  params: MgMap;
  /** Per-player pieces for COOP_SPLIT, RELAY and TEAM_SYNC; empty for PARALLEL_SOLO. Players not listed play with `params` only. */
  assignments: Array<{
      /** Player. */
      playerId: PlayerId;
      /** Position of the player in the task split or relay order, 0-based. RELAY: the player's turn starts at `startAtMs + index × params.turnMs`. */
      index: number;
      /** Parameters for this player only (their piece of the task). */
      params: MgMap;
    }>;
}

/** `mg.ready` — client → server → host (relayed inside relay). The phone has loaded the minigame and will play. A player counts as active in the completion fraction only if this arrived and the player is still connected when the host closes the run. */
export interface MgReadyPayload {
  /** Run id. */
  runId: RunId;
}

/** `mg.progress` — client → server → host (relayed inside relay). Optional coarse progress of one player for the team progress meter on the host. At most 2 Hz. It never affects the result. */
export interface MgProgressPayload {
  /** Run id. */
  runId: RunId;
  /** Progress 0–1 as defined by the minigame. */
  p: number;
}

/** `mg.action` — client → server → host (relayed inside relay). A player's move in a minigame with shared state (placing a part in a slot, playing an evidence card, contributing a patch element, a synchronised tap). The host keeps the shared state and broadcasts it with `mg.state`. Not used by PARALLEL_SOLO minigames. */
export interface MgActionPayload {
  /** Run id. */
  runId: RunId;
  /** Action counter per player, increasing. */
  n: number;
  /** Action name defined by the minigame (e.g. "place", "tap"). */
  a: string;
  /** Numeric arguments defined by the minigame (slot index, local timestamp offset in ms, …). */
  x: number[];
}

/** `mg.state` — host → server → client (relayed unchanged). Shared state of a running minigame, kept by the host: for cooperative minigames the common board, for all minigames the team progress. At most 10 Hz. Delivered to spectators only when the run has `audience` = true. */
export interface MgStatePayload {
  /** Run id. */
  runId: RunId;
  /** State counter, increasing; phones ignore older states. */
  n: number;
  /** Shared state defined by the minigame. */
  shared: MgMap;
  /** Progress per active player. */
  progress: Array<{
      /** Player. */
      playerId: PlayerId;
      /** Progress 0–1. */
      p: number;
    }>;
}

/** `mg.result` — client → server → host (relayed inside relay). The compact result of one player's local minigame run. Exactly one per player and run, sent when play ends on the phone. The host accepts results until `startAtMs + durationMs + 2000 ms` on the server clock, then computes fraction, tier and boosts. Accepted while paused so that a result finished just before a pause is not lost. */
export interface MgResultPayload {
  /** Run id. */
  runId: RunId;
  /** Minigame id, as in `mg.start`. */
  minigameId: DataId;
  /** True when the player met the minigame's success condition. */
  success: boolean;
  /** True when the player met the minigame's "perfect" condition (needed by everyone for Platinum). Implies `success`. */
  perfect: boolean;
  /** Performance quality 0–1. Solo rooms: this is the completion fraction (§10.3 Solo). Otherwise it only adds individual score points. */
  score: number;
  /** Raw measurement for minigames whose team median or average steers the flight (MG-09, MG-16, MG-20, MG-22, MG-24), in the unit defined by the minigame; null otherwise. */
  value: number | null;
  /** Local play time in milliseconds. */
  elapsedMs: number;
  /** Sender's estimate of the server clock when play ended. */
  finishedAtMs: TimeMs;
  /** Input mode used. */
  mode: MinigameMode;
}

/** `mg.summary` — host → server → client (relayed unchanged). The host closes the run: completion fraction, tier, boosts applied, Team Sync and score gained, and the fact for the result screen. Ends the run and clears the sticky `mg.start`. Individual failures are not listed (no shaming, §16). */
export interface MgSummaryPayload {
  /** Run id. */
  runId: RunId;
  /** Minigame id. */
  minigameId: DataId;
  /** Active players (connected and loaded). */
  active: number;
  /** Active players who succeeded. */
  succeeded: number;
  /** Completion fraction f = succeeded / active; in solo rooms the player's `score`; 0 when nobody was active. */
  fraction: number;
  /** Tier reached. */
  tier: Tier;
  /** Players who succeeded. */
  succeededIds: PlayerId[];
  /** Players who were perfect. */
  perfectIds: PlayerId[];
  /** True when the tier is NONE but at least one player succeeded (cosmetic sparkle only). */
  sparkle: boolean;
  /** Boosts applied for this run; empty for tier NONE. */
  boosts: BoostGrant[];
  /** Team Sync gained: Gold/Platinum 25, Silver 15, Bronze 8, none 0. */
  syncDelta: number;
  /** Teamwork score gained: Platinum 250, Gold 200, Silver 120, Bronze 60, none 0. */
  points: number;
  /** Fact shown on the result screen; null for none. */
  factId: DataId | null;
}

/** `mg.cancel` — host → server → client (relayed unchanged). The host abandons the run without a summary (abort, phase jump). Phones leave the minigame screen; no boost, no penalty. */
export interface MgCancelPayload {
  /** Run id. */
  runId: RunId;
  /** Why it was cancelled. */
  reason: MgCancelReason;
}

/** `kp.awarded` — host → server → client (relayed unchanged). Knowledge Points awarded by the host (correct predictions, trivia tiebreak, bonus rounds). */
export interface KpAwardedPayload {
  /** Awards. */
  entries: Array<{
      /** Player who earned them. */
      playerId: PlayerId;
      /** Knowledge Points earned. */
      kp: number;
      /** Why. */
      reason: KpReason;
    }>;
  /** Team Knowledge Points total after the awards. */
  teamKp: number;
}

/** `codex.unlock` — host → server → client (relayed unchanged). Codex entries unlocked by an event other than a vote commit. Each phone adds them to its personal collection (kept on the device). */
export interface CodexUnlockPayload {
  /** Codex entries unlocked. */
  codexIds: DataId[];
  /** What unlocked them. */
  source: CodexSource;
  /** True when the unlock comes with a Codex badge (Platinum, Gold investigation). */
  badge: boolean;
  /** Players who receive the unlock; null = every player and spectator. */
  to: PlayerId[] | null;
}

/** `debrief.score` — host → server → client (relayed unchanged). Mission result for the debrief screens: outcome, score breakdown per the scoring formula, grade and objectives. */
export interface DebriefScorePayload {
  /** Mission the score is for. */
  missionSeq: number;
  /** Contract flown. */
  contractId: DataId;
  /** Mission outcome. */
  outcome: MissionOutcome;
  /** Crewed contracts: whether the crew returned safely; null for uncrewed missions. */
  crewSafe: boolean | null;
  /** Mission Score after multipliers. */
  total: number;
  /** Grade (S ≥ 9,000; A ≥ 7,500; B ≥ 6,000; C ≥ 4,000; D otherwise or crew lost). */
  grade: Grade;
  /** Grade title text. */
  title: TextRef;
  /** Terms of the scoring formula (§11.3). */
  breakdown: {
      /** Objective points. */
      objectives: number;
      /** Efficiency points. */
      efficiency: number;
      /** Safety & recovery points. */
      safetyRecovery: number;
      /** Science / data points. */
      scienceData: number;
      /** Teamwork points. */
      teamwork: number;
      /** Knowledge points (score, not KP). */
      knowledge: number;
      /** Difficulty multiplier (0.8, 1.0 or 1.25). */
      difficultyMult: number;
      /** Score boost multiplier (1.0–1.5). */
      boostMult: number;
    };
  /** Contract objectives. */
  objectives: Array<{
      /** Objective id. */
      id: DataId;
      /** Objective kind. */
      kind: ObjectiveKind;
      /** Whether it was achieved. */
      met: boolean;
      /** Points earned for it. */
      points: number;
    }>;
  /** True when the host offers the retry option (§9.9). */
  retryAvailable: boolean;
}

/** `debrief.awards` — host → server → client (relayed unchanged). Individual recognition. Every player appears and has at least one award. Only positive statistics are carried; there is no ranking. */
export interface DebriefAwardsPayload {
  /** One entry per player. */
  players: Array<{
      /** Player. */
      playerId: PlayerId;
      /** Awards (e.g. "best_callout", "budget_hawk", "fact_finder", "steady_hands", "team_player", "veto_visionary", "rocket_scientist", "calm_under_pressure"). */
      awardIds: DataId[];
      /** Knowledge Points earned this mission. */
      kp: number;
      /** Good Calls made. */
      goodCalls: number;
      /** Minigames succeeded. */
      minigameSuccesses: number;
      /** Correct predictions. */
      predictionsCorrect: number;
    }>;
}

/** `debrief.facts` — host → server → client (relayed unchanged). What the team learned: facts collected during the mission, Codex entries unlocked, the Lessons Learned card after a failure, and the "your rocket vs. a real one" comparison. */
export interface DebriefFactsPayload {
  /** Facts shown during the mission. */
  factIds: DataId[];
  /** Codex entries unlocked during the mission. */
  codexIds: DataId[];
  /** Lessons Learned card earned; null when none. */
  lessonId: DataId | null;
  /** Comparison with a real rocket; null when not available. */
  comparison: {
      /** Name of the real vehicle compared with. */
      twin: TextRef;
      /** Lift-off mass of the team's rocket, t. */
      yourMassT: number;
      /** Lift-off mass of the real vehicle, t (real-world approximate). */
      twinMassT: number;
      /** Total Δv of the team's rocket, m/s. */
      yourDvMs: number;
      /** Total Δv of the real vehicle, m/s (real-world approximate). */
      twinDvMs: number;
    } | null;
}

// ───────────────────────────── Envelope and union ─────────────────────────────

/** Payload type of every message type. */
export interface PayloadMap {
  'hello': HelloPayload;
  'hello.ok': HelloOkPayload;
  'clock.ping': ClockPingPayload;
  'clock.pong': ClockPongPayload;
  'error': ErrorPayload;
  'bye': ByePayload;
  'relay': RelayPayload;
  'snapshot.end': SnapshotEndPayload;
  'room.create': RoomCreatePayload;
  'room.created': RoomCreatedPayload;
  'room.join': RoomJoinPayload;
  'room.joined': RoomJoinedPayload;
  'room.resume': RoomResumePayload;
  'room.resumed': RoomResumedPayload;
  'room.state': RoomStatePayload;
  'room.leave': RoomLeavePayload;
  'room.kick': RoomKickPayload;
  'room.close': RoomClosePayload;
  'room.promoted': RoomPromotedPayload;
  'player.profile': PlayerProfilePayload;
  'player.prefs': PlayerPrefsPayload;
  'settings.set': SettingsSetPayload;
  'settings.state': SettingsStatePayload;
  'roles.pick': RolesPickPayload;
  'roles.vote': RolesVotePayload;
  'roles.lock': RolesLockPayload;
  'roles.set': RolesSetPayload;
  'roles.rotate': RolesRotatePayload;
  'roles.state': RolesStatePayload;
  'ability.use': AbilityUsePayload;
  'ability.requested': AbilityRequestedPayload;
  'ability.resolve': AbilityResolvePayload;
  'ability.consume': AbilityConsumePayload;
  'ability.used': AbilityUsedPayload;
  'phase.set': PhaseSetPayload;
  'game.pause': GamePausePayload;
  'game.paused': GamePausedPayload;
  'game.resume': GameResumePayload;
  'game.resumed': GameResumedPayload;
  'notice.show': NoticeShowPayload;
  'build.state': BuildStatePayload;
  'build.event': BuildEventPayload;
  'flight.event': FlightEventPayload;
  'flight.hud': FlightHudPayload;
  'vote.open': VoteOpenPayload;
  'vote.opened': VoteOpenedPayload;
  'vote.stage': VoteStagePayload;
  'vote.insight': VoteInsightPayload;
  'vote.predict': VotePredictPayload;
  'vote.predict.result': VotePredictResultPayload;
  'vote.tag': VoteTagPayload;
  'vote.tags': VoteTagsPayload;
  'vote.cast': VoteCastPayload;
  'vote.ack': VoteAckPayload;
  'vote.tally': VoteTallyPayload;
  'vote.veto': VoteVetoPayload;
  'vote.vetoed': VoteVetoedPayload;
  'vote.close': VoteClosePayload;
  'vote.cancel': VoteCancelPayload;
  'vote.cancelled': VoteCancelledPayload;
  'vote.trivia.open': VoteTriviaOpenPayload;
  'vote.trivia.answer': VoteTriviaAnswerPayload;
  'vote.trivia.result': VoteTriviaResultPayload;
  'vote.trivia.pick': VoteTriviaPickPayload;
  'vote.result': VoteResultPayload;
  'vote.commit': VoteCommitPayload;
  'ping.send': PingSendPayload;
  'ping.event': PingEventPayload;
  'react.send': ReactSendPayload;
  'react.event': ReactEventPayload;
  'react.audience': ReactAudiencePayload;
  'poll.open': PollOpenPayload;
  'poll.call': PollCallPayload;
  'poll.answer': PollAnswerPayload;
  'poll.answered': PollAnsweredPayload;
  'poll.result': PollResultPayload;
  'pilot.assign': PilotAssignPayload;
  'pilot.input': PilotInputPayload;
  'pilot.action': PilotActionPayload;
  'copilot.action': CopilotActionPayload;
  'pilot.hud': PilotHudPayload;
  'console.config': ConsoleConfigPayload;
  'console.telemetry': ConsoleTelemetryPayload;
  'console.alert': ConsoleAlertPayload;
  'console.callout': ConsoleCalloutPayload;
  'console.request': ConsoleRequestPayload;
  'console.goodcall': ConsoleGoodcallPayload;
  'blackout.set': BlackoutSetPayload;
  'haptic.cue': HapticCuePayload;
  'sync.meter': SyncMeterPayload;
  'boost.applied': BoostAppliedPayload;
  'boost.state': BoostStatePayload;
  'mg.start': MgStartPayload;
  'mg.ready': MgReadyPayload;
  'mg.progress': MgProgressPayload;
  'mg.action': MgActionPayload;
  'mg.state': MgStatePayload;
  'mg.result': MgResultPayload;
  'mg.summary': MgSummaryPayload;
  'mg.cancel': MgCancelPayload;
  'kp.awarded': KpAwardedPayload;
  'codex.unlock': CodexUnlockPayload;
  'debrief.score': DebriefScorePayload;
  'debrief.awards': DebriefAwardsPayload;
  'debrief.facts': DebriefFactsPayload;
}

/** Every message type string. */
export type MessageType = keyof PayloadMap;

/** The wire envelope: one JSON text frame per message. */
export interface Envelope<T extends MessageType = MessageType> {
  /** Message type. */
  t: T;
  /** Sender-assigned sequence number: starts at 1 on each connection and direction, +1 per message. */
  seq: number;
  /** Payload. */
  d: PayloadMap[T];
}

/** Discriminated union of all messages; narrow on `t`. */
export type Message = { [T in MessageType]: Envelope<T> }[MessageType];

/** A `relay` payload narrowed to one inner type. */
export type RelayOf<T extends RelayedType = RelayedType> = { [K in T]: { from: PlayerId; t: K; d: PayloadMap[K] } }[T];

/** Direction classes used in messages.md. */
export type Direction = 'A2S' | 'C2S' | 'H2S' | 'S2C' | 'S2H' | 'S2A' | 'RELAY_H2C' | 'RELAY_C2H';
export type Sender = 'HOST' | 'PLAYER' | 'SPECTATOR' | 'UNJOINED' | 'SERVER';
export type Route = 'SERVER' | 'SENDER' | 'HOST' | 'EVERYONE' | 'CLIENTS' | 'PLAYERS' | 'ROLE' | 'TO' | 'TO_OR_CLIENTS' | 'TO_OR_PLAYERS' | 'PLAYERS_PLUS_AUDIENCE' | 'TARGET';

/** Routing metadata per message type (who may send it, where the server delivers it). */
export interface MessageMeta {
  dir: Direction;
  from: readonly Sender[];
  to: Route;
  /** The server caches the latest one and replays it in snapshots. */
  sticky: boolean;
  /** May be dropped under load; only the newest matters. */
  droppable: boolean;
  /** Rejected with PAUSED while the game is paused. */
  pauseBlocked: boolean;
  /** Carries `outcomeSeq`; replayed to a resuming host. */
  outcome: boolean;
}

export const MESSAGE_META: { readonly [T in MessageType]: MessageMeta } = {
  'hello': { dir: 'A2S', from: ['UNJOINED'], to: 'SERVER', sticky: false, droppable: false, pauseBlocked: false, outcome: false },
  'hello.ok': { dir: 'S2A', from: ['SERVER'], to: 'SENDER', sticky: false, droppable: false, pauseBlocked: false, outcome: false },
  'clock.ping': { dir: 'A2S', from: ['HOST', 'PLAYER', 'SPECTATOR', 'UNJOINED'], to: 'SERVER', sticky: false, droppable: false, pauseBlocked: false, outcome: false },
  'clock.pong': { dir: 'S2A', from: ['SERVER'], to: 'SENDER', sticky: false, droppable: false, pauseBlocked: false, outcome: false },
  'error': { dir: 'S2A', from: ['SERVER'], to: 'SENDER', sticky: false, droppable: false, pauseBlocked: false, outcome: false },
  'bye': { dir: 'S2A', from: ['SERVER'], to: 'SENDER', sticky: false, droppable: false, pauseBlocked: false, outcome: false },
  'relay': { dir: 'S2H', from: ['SERVER'], to: 'HOST', sticky: false, droppable: false, pauseBlocked: false, outcome: false },
  'snapshot.end': { dir: 'S2A', from: ['SERVER'], to: 'SENDER', sticky: false, droppable: false, pauseBlocked: false, outcome: false },
  'room.create': { dir: 'H2S', from: ['UNJOINED'], to: 'SERVER', sticky: false, droppable: false, pauseBlocked: false, outcome: false },
  'room.created': { dir: 'S2H', from: ['SERVER'], to: 'HOST', sticky: false, droppable: false, pauseBlocked: false, outcome: false },
  'room.join': { dir: 'C2S', from: ['UNJOINED'], to: 'SERVER', sticky: false, droppable: false, pauseBlocked: false, outcome: false },
  'room.joined': { dir: 'S2C', from: ['SERVER'], to: 'SENDER', sticky: false, droppable: false, pauseBlocked: false, outcome: false },
  'room.resume': { dir: 'A2S', from: ['UNJOINED'], to: 'SERVER', sticky: false, droppable: false, pauseBlocked: false, outcome: false },
  'room.resumed': { dir: 'S2A', from: ['SERVER'], to: 'SENDER', sticky: false, droppable: false, pauseBlocked: false, outcome: false },
  'room.state': { dir: 'S2A', from: ['SERVER'], to: 'EVERYONE', sticky: false, droppable: false, pauseBlocked: false, outcome: false },
  'room.leave': { dir: 'C2S', from: ['PLAYER', 'SPECTATOR'], to: 'SERVER', sticky: false, droppable: false, pauseBlocked: false, outcome: false },
  'room.kick': { dir: 'H2S', from: ['HOST'], to: 'SERVER', sticky: false, droppable: false, pauseBlocked: false, outcome: false },
  'room.close': { dir: 'H2S', from: ['HOST'], to: 'SERVER', sticky: false, droppable: false, pauseBlocked: false, outcome: false },
  'room.promoted': { dir: 'S2C', from: ['SERVER'], to: 'TARGET', sticky: false, droppable: false, pauseBlocked: false, outcome: false },
  'player.profile': { dir: 'C2S', from: ['PLAYER'], to: 'SERVER', sticky: false, droppable: false, pauseBlocked: false, outcome: false },
  'player.prefs': { dir: 'C2S', from: ['PLAYER', 'SPECTATOR'], to: 'SERVER', sticky: false, droppable: false, pauseBlocked: false, outcome: false },
  'settings.set': { dir: 'H2S', from: ['HOST'], to: 'SERVER', sticky: false, droppable: false, pauseBlocked: false, outcome: false },
  'settings.state': { dir: 'S2A', from: ['SERVER'], to: 'EVERYONE', sticky: false, droppable: false, pauseBlocked: false, outcome: false },
  'roles.pick': { dir: 'C2S', from: ['PLAYER'], to: 'SERVER', sticky: false, droppable: false, pauseBlocked: false, outcome: false },
  'roles.vote': { dir: 'C2S', from: ['PLAYER'], to: 'SERVER', sticky: false, droppable: false, pauseBlocked: false, outcome: false },
  'roles.lock': { dir: 'H2S', from: ['HOST'], to: 'SERVER', sticky: false, droppable: false, pauseBlocked: false, outcome: false },
  'roles.set': { dir: 'H2S', from: ['HOST'], to: 'SERVER', sticky: false, droppable: false, pauseBlocked: false, outcome: false },
  'roles.rotate': { dir: 'H2S', from: ['HOST'], to: 'SERVER', sticky: false, droppable: false, pauseBlocked: false, outcome: false },
  'roles.state': { dir: 'S2A', from: ['SERVER'], to: 'EVERYONE', sticky: false, droppable: false, pauseBlocked: false, outcome: false },
  'ability.use': { dir: 'C2S', from: ['PLAYER'], to: 'SERVER', sticky: false, droppable: false, pauseBlocked: true, outcome: false },
  'ability.requested': { dir: 'S2H', from: ['SERVER'], to: 'HOST', sticky: false, droppable: false, pauseBlocked: false, outcome: false },
  'ability.resolve': { dir: 'H2S', from: ['HOST'], to: 'SERVER', sticky: false, droppable: false, pauseBlocked: false, outcome: false },
  'ability.consume': { dir: 'H2S', from: ['HOST'], to: 'SERVER', sticky: false, droppable: false, pauseBlocked: false, outcome: false },
  'ability.used': { dir: 'S2A', from: ['SERVER'], to: 'EVERYONE', sticky: false, droppable: false, pauseBlocked: false, outcome: true },
  'phase.set': { dir: 'RELAY_H2C', from: ['HOST'], to: 'CLIENTS', sticky: true, droppable: false, pauseBlocked: false, outcome: false },
  'game.pause': { dir: 'H2S', from: ['HOST'], to: 'SERVER', sticky: false, droppable: false, pauseBlocked: false, outcome: false },
  'game.paused': { dir: 'S2A', from: ['SERVER'], to: 'EVERYONE', sticky: false, droppable: false, pauseBlocked: false, outcome: false },
  'game.resume': { dir: 'H2S', from: ['HOST'], to: 'SERVER', sticky: false, droppable: false, pauseBlocked: false, outcome: false },
  'game.resumed': { dir: 'S2A', from: ['SERVER'], to: 'EVERYONE', sticky: false, droppable: false, pauseBlocked: false, outcome: false },
  'notice.show': { dir: 'RELAY_H2C', from: ['HOST'], to: 'TO_OR_CLIENTS', sticky: false, droppable: false, pauseBlocked: false, outcome: false },
  'build.state': { dir: 'RELAY_H2C', from: ['HOST'], to: 'CLIENTS', sticky: true, droppable: false, pauseBlocked: false, outcome: false },
  'build.event': { dir: 'RELAY_H2C', from: ['HOST'], to: 'CLIENTS', sticky: false, droppable: false, pauseBlocked: false, outcome: false },
  'flight.event': { dir: 'RELAY_H2C', from: ['HOST'], to: 'CLIENTS', sticky: false, droppable: false, pauseBlocked: false, outcome: false },
  'flight.hud': { dir: 'RELAY_H2C', from: ['HOST'], to: 'CLIENTS', sticky: false, droppable: true, pauseBlocked: false, outcome: false },
  'vote.open': { dir: 'H2S', from: ['HOST'], to: 'SERVER', sticky: false, droppable: false, pauseBlocked: true, outcome: false },
  'vote.opened': { dir: 'S2A', from: ['SERVER'], to: 'EVERYONE', sticky: false, droppable: false, pauseBlocked: false, outcome: false },
  'vote.stage': { dir: 'S2A', from: ['SERVER'], to: 'EVERYONE', sticky: false, droppable: false, pauseBlocked: false, outcome: false },
  'vote.insight': { dir: 'RELAY_H2C', from: ['HOST'], to: 'ROLE', sticky: true, droppable: false, pauseBlocked: false, outcome: false },
  'vote.predict': { dir: 'C2S', from: ['PLAYER', 'SPECTATOR'], to: 'SERVER', sticky: false, droppable: false, pauseBlocked: true, outcome: false },
  'vote.predict.result': { dir: 'S2A', from: ['SERVER'], to: 'EVERYONE', sticky: false, droppable: false, pauseBlocked: false, outcome: true },
  'vote.tag': { dir: 'C2S', from: ['PLAYER'], to: 'SERVER', sticky: false, droppable: false, pauseBlocked: true, outcome: false },
  'vote.tags': { dir: 'S2A', from: ['SERVER'], to: 'EVERYONE', sticky: false, droppable: false, pauseBlocked: false, outcome: false },
  'vote.cast': { dir: 'C2S', from: ['PLAYER', 'SPECTATOR'], to: 'SERVER', sticky: false, droppable: false, pauseBlocked: true, outcome: false },
  'vote.ack': { dir: 'S2C', from: ['SERVER'], to: 'SENDER', sticky: false, droppable: false, pauseBlocked: false, outcome: false },
  'vote.tally': { dir: 'S2A', from: ['SERVER'], to: 'EVERYONE', sticky: false, droppable: true, pauseBlocked: false, outcome: false },
  'vote.veto': { dir: 'C2S', from: ['PLAYER'], to: 'SERVER', sticky: false, droppable: false, pauseBlocked: true, outcome: false },
  'vote.vetoed': { dir: 'S2A', from: ['SERVER'], to: 'EVERYONE', sticky: false, droppable: false, pauseBlocked: false, outcome: false },
  'vote.close': { dir: 'H2S', from: ['HOST'], to: 'SERVER', sticky: false, droppable: false, pauseBlocked: false, outcome: false },
  'vote.cancel': { dir: 'H2S', from: ['HOST'], to: 'SERVER', sticky: false, droppable: false, pauseBlocked: false, outcome: false },
  'vote.cancelled': { dir: 'S2A', from: ['SERVER'], to: 'EVERYONE', sticky: false, droppable: false, pauseBlocked: false, outcome: false },
  'vote.trivia.open': { dir: 'S2A', from: ['SERVER'], to: 'EVERYONE', sticky: false, droppable: false, pauseBlocked: false, outcome: false },
  'vote.trivia.answer': { dir: 'C2S', from: ['PLAYER'], to: 'SERVER', sticky: false, droppable: false, pauseBlocked: true, outcome: false },
  'vote.trivia.result': { dir: 'S2A', from: ['SERVER'], to: 'EVERYONE', sticky: false, droppable: false, pauseBlocked: false, outcome: true },
  'vote.trivia.pick': { dir: 'C2S', from: ['PLAYER'], to: 'SERVER', sticky: false, droppable: false, pauseBlocked: true, outcome: false },
  'vote.result': { dir: 'S2A', from: ['SERVER'], to: 'EVERYONE', sticky: false, droppable: false, pauseBlocked: false, outcome: true },
  'vote.commit': { dir: 'RELAY_H2C', from: ['HOST'], to: 'CLIENTS', sticky: false, droppable: false, pauseBlocked: false, outcome: false },
  'ping.send': { dir: 'C2S', from: ['PLAYER'], to: 'SERVER', sticky: false, droppable: false, pauseBlocked: false, outcome: false },
  'ping.event': { dir: 'S2A', from: ['SERVER'], to: 'EVERYONE', sticky: false, droppable: false, pauseBlocked: false, outcome: false },
  'react.send': { dir: 'C2S', from: ['PLAYER', 'SPECTATOR'], to: 'SERVER', sticky: false, droppable: false, pauseBlocked: false, outcome: false },
  'react.event': { dir: 'S2A', from: ['SERVER'], to: 'EVERYONE', sticky: false, droppable: false, pauseBlocked: false, outcome: false },
  'react.audience': { dir: 'S2A', from: ['SERVER'], to: 'EVERYONE', sticky: false, droppable: true, pauseBlocked: false, outcome: false },
  'poll.open': { dir: 'H2S', from: ['HOST'], to: 'SERVER', sticky: false, droppable: false, pauseBlocked: true, outcome: false },
  'poll.call': { dir: 'S2A', from: ['SERVER'], to: 'EVERYONE', sticky: false, droppable: false, pauseBlocked: false, outcome: false },
  'poll.answer': { dir: 'C2S', from: ['PLAYER'], to: 'SERVER', sticky: false, droppable: false, pauseBlocked: true, outcome: false },
  'poll.answered': { dir: 'S2A', from: ['SERVER'], to: 'EVERYONE', sticky: false, droppable: false, pauseBlocked: false, outcome: false },
  'poll.result': { dir: 'S2A', from: ['SERVER'], to: 'EVERYONE', sticky: false, droppable: false, pauseBlocked: false, outcome: true },
  'pilot.assign': { dir: 'RELAY_H2C', from: ['HOST'], to: 'CLIENTS', sticky: true, droppable: false, pauseBlocked: false, outcome: false },
  'pilot.input': { dir: 'RELAY_C2H', from: ['PLAYER'], to: 'HOST', sticky: false, droppable: true, pauseBlocked: true, outcome: false },
  'pilot.action': { dir: 'RELAY_C2H', from: ['PLAYER'], to: 'HOST', sticky: false, droppable: false, pauseBlocked: true, outcome: false },
  'copilot.action': { dir: 'RELAY_C2H', from: ['PLAYER'], to: 'HOST', sticky: false, droppable: false, pauseBlocked: true, outcome: false },
  'pilot.hud': { dir: 'RELAY_H2C', from: ['HOST'], to: 'TO', sticky: false, droppable: true, pauseBlocked: false, outcome: false },
  'console.config': { dir: 'RELAY_H2C', from: ['HOST'], to: 'ROLE', sticky: true, droppable: false, pauseBlocked: false, outcome: false },
  'console.telemetry': { dir: 'RELAY_H2C', from: ['HOST'], to: 'ROLE', sticky: false, droppable: true, pauseBlocked: false, outcome: false },
  'console.alert': { dir: 'RELAY_H2C', from: ['HOST'], to: 'ROLE', sticky: false, droppable: false, pauseBlocked: false, outcome: false },
  'console.callout': { dir: 'RELAY_C2H', from: ['PLAYER'], to: 'HOST', sticky: false, droppable: false, pauseBlocked: true, outcome: false },
  'console.request': { dir: 'RELAY_C2H', from: ['PLAYER'], to: 'HOST', sticky: false, droppable: false, pauseBlocked: true, outcome: false },
  'console.goodcall': { dir: 'RELAY_H2C', from: ['HOST'], to: 'CLIENTS', sticky: false, droppable: false, pauseBlocked: false, outcome: false },
  'blackout.set': { dir: 'RELAY_H2C', from: ['HOST'], to: 'CLIENTS', sticky: true, droppable: false, pauseBlocked: false, outcome: false },
  'haptic.cue': { dir: 'RELAY_H2C', from: ['HOST'], to: 'TO_OR_PLAYERS', sticky: false, droppable: false, pauseBlocked: false, outcome: false },
  'sync.meter': { dir: 'RELAY_H2C', from: ['HOST'], to: 'CLIENTS', sticky: true, droppable: false, pauseBlocked: false, outcome: false },
  'boost.applied': { dir: 'RELAY_H2C', from: ['HOST'], to: 'CLIENTS', sticky: false, droppable: false, pauseBlocked: false, outcome: false },
  'boost.state': { dir: 'RELAY_H2C', from: ['HOST'], to: 'CLIENTS', sticky: true, droppable: false, pauseBlocked: false, outcome: false },
  'mg.start': { dir: 'RELAY_H2C', from: ['HOST'], to: 'PLAYERS_PLUS_AUDIENCE', sticky: true, droppable: false, pauseBlocked: true, outcome: false },
  'mg.ready': { dir: 'RELAY_C2H', from: ['PLAYER'], to: 'HOST', sticky: false, droppable: false, pauseBlocked: false, outcome: false },
  'mg.progress': { dir: 'RELAY_C2H', from: ['PLAYER'], to: 'HOST', sticky: false, droppable: true, pauseBlocked: true, outcome: false },
  'mg.action': { dir: 'RELAY_C2H', from: ['PLAYER'], to: 'HOST', sticky: false, droppable: false, pauseBlocked: true, outcome: false },
  'mg.state': { dir: 'RELAY_H2C', from: ['HOST'], to: 'PLAYERS_PLUS_AUDIENCE', sticky: false, droppable: true, pauseBlocked: false, outcome: false },
  'mg.result': { dir: 'RELAY_C2H', from: ['PLAYER'], to: 'HOST', sticky: false, droppable: false, pauseBlocked: false, outcome: false },
  'mg.summary': { dir: 'RELAY_H2C', from: ['HOST'], to: 'CLIENTS', sticky: false, droppable: false, pauseBlocked: false, outcome: false },
  'mg.cancel': { dir: 'RELAY_H2C', from: ['HOST'], to: 'CLIENTS', sticky: false, droppable: false, pauseBlocked: false, outcome: false },
  'kp.awarded': { dir: 'RELAY_H2C', from: ['HOST'], to: 'CLIENTS', sticky: false, droppable: false, pauseBlocked: false, outcome: false },
  'codex.unlock': { dir: 'RELAY_H2C', from: ['HOST'], to: 'TO_OR_CLIENTS', sticky: false, droppable: false, pauseBlocked: false, outcome: false },
  'debrief.score': { dir: 'RELAY_H2C', from: ['HOST'], to: 'CLIENTS', sticky: true, droppable: false, pauseBlocked: false, outcome: false },
  'debrief.awards': { dir: 'RELAY_H2C', from: ['HOST'], to: 'CLIENTS', sticky: true, droppable: false, pauseBlocked: false, outcome: false },
  'debrief.facts': { dir: 'RELAY_H2C', from: ['HOST'], to: 'CLIENTS', sticky: true, droppable: false, pauseBlocked: false, outcome: false },
};

/** Every message type, in the order of messages.md. */
export const MESSAGE_TYPES = Object.keys(MESSAGE_META) as MessageType[];
