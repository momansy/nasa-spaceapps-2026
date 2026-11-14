// Shape of the single client state. Everything here is derived from protocol messages by the
// reducer (`reducer.ts`), plus a few local-only fields (optimistic ballot, dismissed screens).
import type {
  BallotChange,
  BlackoutSetPayload,
  BoostStatePayload,
  BuildEventPayload,
  BuildStatePayload,
  ConsoleAlertPayload,
  ConsoleConfigPayload,
  ConsoleGoodcallPayload,
  DebriefAwardsPayload,
  DebriefFactsPayload,
  DebriefScorePayload,
  ErrorCode,
  FlightEventPayload,
  FlightHudPayload,
  GamePausedPayload,
  GoNoGo,
  KpReason,
  MemberKind,
  Message,
  MgCancelReason,
  MgStartPayload,
  MgStatePayload,
  MgSummaryPayload,
  MinigameMode,
  NoticeShowPayload,
  OptionId,
  PhaseSetPayload,
  PilotAssignPayload,
  PilotHudPayload,
  PingEventPayload,
  PlayerPrefs,
  PollCallPayload,
  PollEntry,
  PollResultPayload,
  ReactionCounts,
  ReactionId,
  RoleId,
  RolesStatePayload,
  RoomSettings,
  RoomStatePayload,
  SpectatorReason,
  SyncMeterPayload,
  TelemetryChannel,
  TelemetryValues,
  VoteCommitPayload,
  VoteInsightPayload,
  VoteOpenedPayload,
  VotePredictResultPayload,
  VoteResultPayload,
  VoteStagePayload,
  VoteTagsPayload,
  VoteTallyPayload,
  VoteTriviaOpenPayload,
  VoteTriviaResultPayload,
  VoteVetoedPayload,
} from '@protocol';
import type { ConnStatus } from '../net/connection';

export interface Me {
  room: string;
  kind: MemberKind;
  /** PlayerId or SpectatorId. */
  id: string;
  slot: number | null;
  pendingPlayer: boolean;
  spectatorReason: SpectatorReason | null;
}

export interface VoteRound {
  opened: VoteOpenedPayload;
  stage: VoteStagePayload | null;
  vetoes: VoteVetoedPayload[];
  tags: VoteTagsPayload['tags'];
  /** Insight lines for the roles this player holds. */
  insight: VoteInsightPayload['lines'];
  tally: VoteTallyPayload | null;
  /** Ballot confirmed by the server (`vote.ack`). */
  myBallot: OptionId | null;
  /** Why the server last reported the ballot (shows "your vote was removed"). */
  ballotNote: BallotChange | null;
  /** Ballot sent but not yet acknowledged; shown at once so the tap feels instant. */
  pendingBallot: OptionId | null;
  predict: { myChoice: number | null; result: VotePredictResultPayload | null };
  trivia: { open: VoteTriviaOpenPayload | null; myChoice: number | null; myPick: OptionId | null; result: VoteTriviaResultPayload | null };
  result: VoteResultPayload | null;
  commit: VoteCommitPayload | null;
  pings: PingEventPayload[];
  /** Set while a reconnect snapshot is replayed; a round not replayed is dropped at snapshot.end. */
  stale: boolean;
}

export interface PollState {
  pollId: string;
  call: PollCallPayload;
  /** Server time at which the current call arrived (start of its answer window). */
  callAtMs: number;
  answered: PollEntry[];
  myAnswer: GoNoGo | null;
  result: PollResultPayload | null;
  stale: boolean;
}

export interface ConsoleState {
  config: ConsoleConfigPayload;
  values: TelemetryValues;
  metS: number | null;
  /** Recent samples per channel for the trend lines (newest last). */
  history: Partial<Record<TelemetryChannel, number[]>>;
}

export interface ActiveAlert extends ConsoleAlertPayload {
  /** Server-clock time at which this player pressed the matching callout; null if not yet. */
  calledAtMs: number | null;
  good: boolean;
}

export interface FlightState {
  hud: FlightHudPayload | null;
  events: FlightEventPayload[];
  consoles: Partial<Record<RoleId, ConsoleState>>;
  alerts: ActiveAlert[];
  goodCalls: ConsoleGoodcallPayload[];
  blackout: BlackoutSetPayload | null;
  pilot: PilotAssignPayload | null;
  /** Requests this player sent to the pilot, newest last. */
  requests: Array<{ role: RoleId; requestId: string; atMs: number }>;
}

/** What a minigame reports when play ends (ARCHITECTURE section 7). */
export interface MinigameOutcome {
  success: boolean;
  perfect: boolean;
  /** Performance quality 0–1. */
  score: number;
  /** Raw measurement for minigames that steer the flight; null otherwise. */
  value: number | null;
  elapsedMs: number;
  mode: MinigameMode;
}

export interface MinigameState {
  start: MgStartPayload;
  shared: MgStatePayload | null;
  outcome: MinigameOutcome | null;
  summary: MgSummaryPayload | null;
  cancelled: MgCancelReason | null;
  /** The player left the result screen (or something more urgent arrived). */
  dismissed: boolean;
  stale: boolean;
}

export type FeedItem =
  | { kind: 'build'; id: number; atMs: number; event: BuildEventPayload }
  | { kind: 'flight'; id: number; atMs: number; event: FlightEventPayload }
  | { kind: 'notice'; id: number; atMs: number; notice: NoticeShowPayload };

export interface SocialItem {
  id: number;
  atMs: number;
  playerId: string;
  ping: PingEventPayload | null;
  emoji: ReactionId | null;
}

/** One `react.audience` window (spectator reactions of one second, anonymous). */
export interface AudienceWindow {
  id: number;
  atMs: number;
  windowMs: number;
  counts: ReactionCounts;
}

export interface AppError {
  id: number;
  code: ErrorCode;
  reT: string | null;
  retryAfterMs: number | null;
}

export interface AppState {
  conn: ConnStatus & { kind: 'ws' | 'mock' };
  /** True from room.joined / room.resumed until snapshot.end: build state without effects. */
  snapshotting: boolean;
  me: Me | null;
  /** Refused join (nickname, room code): shown on the Join screen. */
  joinError: { code: ErrorCode; suggestion: string | null } | null;
  /** Last non-join error, for a toast. */
  error: AppError | null;
  settings: RoomSettings | null;
  room: RoomStatePayload | null;
  roles: RolesStatePayload | null;
  phase: PhaseSetPayload | null;
  paused: GamePausedPayload | null;
  build: BuildStatePayload | null;
  feed: FeedItem[];
  /** Notice currently on screen. */
  notice: { id: number; atMs: number; notice: NoticeShowPayload } | null;
  vote: VoteRound | null;
  /** The last finished round, for the "latest decision" card. */
  lastVote: VoteRound | null;
  poll: PollState | null;
  flight: FlightState;
  mg: MinigameState | null;
  boosts: BoostStatePayload['boosts'];
  sync: SyncMeterPayload | null;
  kp: { mine: number; team: number; last: { id: number; kp: number; reason: KpReason } | null };
  codex: { unlocked: string[]; fresh: string[]; badges: string[] };
  debrief: { score: DebriefScorePayload | null; awards: DebriefAwardsPayload | null; facts: DebriefFactsPayload | null };
  social: SocialItem[];
  /** Latest `pilot.hud` for this phone's pilot seat (T030). */
  pilotHud: PilotHudPayload | null;
  /** The `pilot.assign` that was current when `pilotHud` arrived (a newer assignment makes the hud stale). */
  pilotHudFor: PilotAssignPayload | null;
  /** Recent `react.audience` windows, newest last (T030). */
  audience: AudienceWindow[];
  prefs: PlayerPrefs;
  /** Roles signature for which the role card was acknowledged ("" = never). */
  roleCardSeen: string;
  /** Monotonic counter for ids of feed items, toasts and errors. */
  nextId: number;
}

export type Action =
  | { type: 'msg'; msg: Message; nowMs: number }
  | { type: 'conn'; status: ConnStatus; kind: 'ws' | 'mock' }
  | { type: 'local.cast'; roundId: string; optionId: OptionId }
  | { type: 'local.predict'; roundId: string; choiceIndex: number }
  | { type: 'local.trivia'; roundId: string; choiceIndex: number }
  | { type: 'local.triviaPick'; roundId: string; optionId: OptionId }
  | { type: 'local.pollAnswer'; pollId: string; answer: GoNoGo }
  | { type: 'local.callout'; alertId: string; atMs: number }
  | { type: 'local.request'; role: RoleId; requestId: string; atMs: number }
  | { type: 'local.roleCardSeen'; signature: string }
  | { type: 'local.prefs'; prefs: PlayerPrefs }
  | { type: 'local.mgOutcome'; runId: string; outcome: MinigameOutcome }
  | { type: 'local.mgDismiss'; runId: string }
  | { type: 'local.dismissError' }
  | { type: 'local.dismissNotice' }
  | { type: 'local.dismissJoinError' }
  | { type: 'local.codexSeen' }
  | { type: 'local.codexLoad'; unlocked: string[]; badges: string[] }
  | { type: 'local.leave' };

export type Screen = 'join' | 'lobby' | 'role' | 'vote' | 'poll' | 'build' | 'console' | 'minigame' | 'debrief' | 'pilot' | 'watch';
