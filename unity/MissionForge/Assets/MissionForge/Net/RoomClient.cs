using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;
using Newtonsoft.Json.Linq;

namespace MissionForge.Net
{
    /// <summary>Connection state of a <see cref="RoomClient"/>.</summary>
    public enum ConnectionState
    {
        /// <summary>Not connected and not trying to connect.</summary>
        Disconnected,

        /// <summary>The first connection attempt after <see cref="RoomClient.Connect"/> (socket or <c>hello</c> handshake) is in progress.</summary>
        Connecting,

        /// <summary>The handshake completed (<c>hello.ok</c> received); messages go out immediately.</summary>
        Connected,

        /// <summary>The connection was lost (or could not be made) and the client is retrying with backoff.</summary>
        Reconnecting,
    }

    /// <summary>
    /// Host-side client of the MissionForge room server, speaking protocol version 1
    /// (<c>protocol/messages.md</c>). Plain C# with no Unity types: it is driven by
    /// <see cref="Tick"/> and talks through an <see cref="IWebSocketTransport"/>, so it can be
    /// tested with a fake transport and a manual clock.
    /// </summary>
    /// <remarks>
    /// <para>
    /// Lifecycle (messages.md 3): on every socket open it sends <c>hello</c> (client HOST); on
    /// <c>hello.ok</c> it becomes <see cref="ConnectionState.Connected"/>, sends <c>room.resume</c>
    /// with the host token when it owns a room, flushes queued messages and starts the
    /// <c>clock.ping</c> heartbeat (three probes 200 ms apart, then every <c>heartbeatMs</c>).
    /// Without a <c>clock.pong</c> (or <c>hello.ok</c>) for 10 s it drops the socket and reconnects.
    /// </para>
    /// <para>
    /// <c>seq</c> restarts at 1 on every connection, so queued messages get their number when they
    /// are actually sent. The room is forgotten (no more resume attempts) on <c>error</c>
    /// TOKEN_INVALID / ROOM_NOT_FOUND and on <c>bye</c> with <c>canResume = false</c>. After
    /// <c>bye</c> VERSION_MISMATCH or REPLACED it stops reconnecting; after any other close it
    /// reconnects with backoff.
    /// </para>
    /// <para>Not thread-safe; use it from one thread. Bad incoming frames are reported through <see cref="ProtocolError"/> and never thrown.</para>
    /// </remarks>
    public sealed class RoomClient
    {
        /// <summary>Maximum number of messages held while not connected; the oldest is dropped beyond this.</summary>
        public const int MaxQueuedMessages = 64;

        /// <summary>Value of <see cref="LastRoundTripMs"/> before the first pong arrives.</summary>
        public const double UnknownRoundTripMs = -1.0;

        /// <summary>Return value of <see cref="Send"/> for a message that was queued; its seq is assigned when it is sent.</summary>
        public const int QueuedSeq = 0;

        /// <summary>Seconds without <c>hello.ok</c> / <c>clock.pong</c> after which the socket is dropped (messages.md 3.4).</summary>
        public const double ResponseTimeoutSeconds = ProtocolNames.Defaults.PongTimeoutMs / MillisecondsPerSecond;

        /// <summary>App version sent in <c>hello</c> when none (or an invalid one) is given.</summary>
        public const string DefaultAppVersion = "0.0.0";

        private const double MillisecondsPerSecond = 1000.0;
        private const double ClockProbeSpacingSeconds = ProtocolNames.Defaults.ClockProbeSpacingMs / MillisecondsPerSecond;
        private const int FirstSeq = 1;
        private const string DisconnectReason = "client disconnect";
        private static readonly Regex AppVersionPattern = new Regex("^[0-9A-Za-z][0-9A-Za-z.+_-]{0,31}$");

        private readonly Func<IWebSocketTransport> _transportFactory;
        private readonly BackoffPolicy _backoff;
        private readonly Queue<PendingMessage> _queued = new Queue<PendingMessage>();

        private IWebSocketTransport _transport;
        private ConnectionState _state = ConnectionState.Disconnected;
        private string _hostToken;
        private int _nextSeq = FirstSeq;
        private double _now;
        private double _reconnectAt;
        private bool _isReconnectScheduled;
        private bool _isTransportOpen;
        private bool _isHandshakeComplete;
        private bool _stopAfterClose;
        private double _lastResponseAt;
        private double _nextPingAt;
        private int _probesLeft;
        private double _heartbeatSeconds = ProtocolNames.Defaults.HeartbeatMs / MillisecondsPerSecond;
        private double _bestRoundTripMs = double.MaxValue;

        private struct PendingMessage
        {
            public string Type;
            public JObject Data;
        }

        /// <summary>Creates a client.</summary>
        /// <param name="transportFactory">Creates a fresh transport for every connection attempt.</param>
        /// <param name="backoff">Reconnect delay policy; a default policy is used when null.</param>
        /// <param name="appVersion">Sent as <c>hello.appVersion</c>; <see cref="DefaultAppVersion"/> when null or not matching the contract pattern.</param>
        /// <exception cref="ArgumentNullException"><paramref name="transportFactory"/> is null.</exception>
        public RoomClient(Func<IWebSocketTransport> transportFactory, BackoffPolicy backoff = null, string appVersion = null)
        {
            if (transportFactory == null)
            {
                throw new ArgumentNullException(nameof(transportFactory));
            }

            _transportFactory = transportFactory;
            _backoff = backoff ?? new BackoffPolicy();
            AppVersion = appVersion != null && AppVersionPattern.IsMatch(appVersion) ? appVersion : DefaultAppVersion;
            LastRoundTripMs = UnknownRoundTripMs;
        }

        /// <summary>Raised whenever <see cref="State"/> changes.</summary>
        public event Action<ConnectionState> StateChanged;

        /// <summary>Raised for every valid envelope received, after the typed events for that message.</summary>
        public event Action<Envelope> MessageReceived;

        /// <summary>Raised when the server confirms <see cref="CreateRoom"/> (<c>room.created</c>). The snapshot follows.</summary>
        public event Action<RoomCreatedDto> RoomCreated;

        /// <summary>Raised on <c>room.resumed</c> after a reconnect. The snapshot follows; the room stays paused until <see cref="ResumeGame"/>.</summary>
        public event Action<RoomResumedDto> RoomResumed;

        /// <summary>Raised for every <c>room.state</c> (membership).</summary>
        public event Action<RoomStateDto> RoomStateChanged;

        /// <summary>Raised for every <c>settings.state</c>.</summary>
        public event Action<RoomSettingsDto> SettingsChanged;

        /// <summary>Raised for every <c>roles.state</c>.</summary>
        public event Action<RolesStateDto> RolesStateChanged;

        /// <summary>Raised on <c>snapshot.end</c>.</summary>
        public event Action<SnapshotEndDto> SnapshotEnded;

        /// <summary>Raised on <c>game.paused</c>.</summary>
        public event Action<GamePausedDto> GamePaused;

        /// <summary>Raised on <c>game.resumed</c>.</summary>
        public event Action<GameResumedDto> GameResumed;

        /// <summary>Raised for every player message forwarded inside <c>relay</c>.</summary>
        public event Action<RelayDto> RelayReceived;

        /// <summary>Raised when the server sends an <c>error</c> message.</summary>
        public event Action<ErrorDto> ServerError;

        /// <summary>Raised when the server announces that it is closing the connection (<c>bye</c>).</summary>
        public event Action<ByeDto> ByeReceived;

        /// <summary>
        /// Raised for frames that are not valid protocol messages, when a queued outgoing message
        /// had to be dropped because the queue was full, and when the server stopped answering.
        /// </summary>
        public event Action<string> ProtocolError;

        /// <summary>Raised with the description of a transport fault (connection refused, socket error...).</summary>
        public event Action<string> TransportError;

        /// <summary>Current connection state.</summary>
        public ConnectionState State
        {
            get { return _state; }
        }

        /// <summary>Version sent in <c>hello.appVersion</c>.</summary>
        public string AppVersion { get; }

        /// <summary>URL passed to the last <see cref="Connect"/>, or null.</summary>
        public string Url { get; private set; }

        /// <summary>Code of the room this host owns, or null when there is none.</summary>
        public string RoomCode { get; private set; }

        /// <summary>Player join URL from <c>room.created</c> (QR content), or null.</summary>
        public string JoinUrl { get; private set; }

        /// <summary>Audience join URL from <c>room.created</c>, or null.</summary>
        public string SpectateUrl { get; private set; }

        /// <summary>The most recent <c>room.state</c> for the current room, or null.</summary>
        public RoomStateDto LastRoomState { get; private set; }

        /// <summary>The most recent <c>settings.state</c> settings for the current room, or null.</summary>
        public RoomSettingsDto LastSettings { get; private set; }

        /// <summary>The most recent <c>roles.state</c> for the current room, or null.</summary>
        public RolesStateDto LastRolesState { get; private set; }

        /// <summary>Limits from the last <c>hello.ok</c>, or null before the first handshake.</summary>
        public HelloOkDto LastHelloOk { get; private set; }

        /// <summary>The last <c>bye</c> received, or null.</summary>
        public ByeDto LastBye { get; private set; }

        /// <summary>True while the server reports the game as paused (<c>game.paused</c>, <c>room.state.paused</c>, <c>room.resumed.paused</c>).</summary>
        public bool IsPaused { get; private set; }

        /// <summary>True between <c>room.created</c> / <c>room.resumed</c> and <c>snapshot.end</c>: build state silently.</summary>
        public bool IsReceivingSnapshot { get; private set; }

        /// <summary>
        /// Last outcome (<c>outcomeSeq</c>) the host has durably applied. Sent as
        /// <c>room.resume.lastOutcomeSeq</c> so the server replays later outcomes. The game sets it.
        /// </summary>
        public int LastAppliedOutcomeSeq { get; set; }

        /// <summary>Consecutive reconnect attempts since the last successful handshake (0 while connected).</summary>
        public int ReconnectAttempts { get; private set; }

        /// <summary>Round-trip time of the last <c>clock.ping</c> in milliseconds, or <see cref="UnknownRoundTripMs"/>.</summary>
        public double LastRoundTripMs { get; private set; }

        /// <summary>True once a <c>clock.pong</c> gave a server clock estimate.</summary>
        public bool HasServerClock { get; private set; }

        /// <summary>
        /// Server clock minus the <see cref="Tick"/> clock, in milliseconds, from the sample with the
        /// smallest round trip of the current connection: <c>serverTimeMs − (clientTimeMs + rtt/2)</c>.
        /// </summary>
        public double ServerClockOffsetMs { get; private set; }

        /// <summary>Estimated server-clock time (ms since the Unix epoch) at the last <see cref="Tick"/>; 0 before <see cref="HasServerClock"/>.</summary>
        public long EstimateServerTimeMs()
        {
            return HasServerClock ? (long)Math.Round(_now * MillisecondsPerSecond + ServerClockOffsetMs) : 0;
        }

        /// <summary>
        /// Starts a fresh session with the server at <paramref name="url"/>. Any current connection
        /// and remembered room are dropped first. Failures lead to <see cref="ConnectionState.Reconnecting"/>.
        /// </summary>
        /// <exception cref="ArgumentException"><paramref name="url"/> is null or empty.</exception>
        public void Connect(string url)
        {
            if (string.IsNullOrEmpty(url))
            {
                throw new ArgumentException("Server URL must not be empty.", nameof(url));
            }

            ReleaseTransport(true);
            ForgetRoom();
            Url = url;
            ReconnectAttempts = 0;
            LastRoundTripMs = UnknownRoundTripMs;
            HasServerClock = false;
            _isReconnectScheduled = false;
            _backoff.Reset();
            OpenTransport(ConnectionState.Connecting);
        }

        /// <summary>
        /// Closes the connection and stops reconnecting. Queued messages and the remembered room
        /// are discarded. The room itself stays on the server (paused) until it expires; use
        /// <see cref="CloseRoom"/> first to end it.
        /// </summary>
        public void Disconnect()
        {
            _isReconnectScheduled = false;
            ReleaseTransport(true);
            _queued.Clear();
            ForgetRoom();
            ReconnectAttempts = 0;
            SetState(ConnectionState.Disconnected);
        }

        /// <summary>
        /// Advances the client: dispatches transport events, starts a due reconnect attempt, drops
        /// a silent connection and sends the <c>clock.ping</c> heartbeat. Call once per frame.
        /// </summary>
        /// <param name="nowSeconds">Monotonic time in seconds (for example <c>Time.realtimeSinceStartupAsDouble</c>).</param>
        public void Tick(double nowSeconds)
        {
            _now = nowSeconds;

            IWebSocketTransport transport = _transport;
            if (transport != null)
            {
                transport.Pump();
            }

            if (_state == ConnectionState.Reconnecting && _isReconnectScheduled && _now >= _reconnectAt)
            {
                _isReconnectScheduled = false;
                OpenTransport(ConnectionState.Reconnecting);
            }

            if (_transport != null && _isTransportOpen && _now - _lastResponseAt > ResponseTimeoutSeconds)
            {
                string waitingFor = _isHandshakeComplete ? ProtocolNames.Messages.ClockPong : ProtocolNames.Messages.HelloOk;
                ProtocolError?.Invoke("No " + waitingFor + " for " + ResponseTimeoutSeconds + " s; reconnecting.");
                HandleConnectionLost(true);
                return;
            }

            if (_state == ConnectionState.Connected && _now >= _nextPingAt)
            {
                SendClockPing();
            }
        }

        /// <summary>
        /// Sends a message, or queues it while the handshake is not complete (flushed in order,
        /// after <c>room.resume</c>, once <c>hello.ok</c> arrives).
        /// </summary>
        /// <param name="type">Message type, see <see cref="ProtocolNames.Messages"/>.</param>
        /// <param name="payload">Null, a <see cref="JObject"/>, or an object that serializes to a JSON object.</param>
        /// <returns>The <c>seq</c> used (1 for the first message of a connection), or <see cref="QueuedSeq"/> when queued.</returns>
        /// <exception cref="ArgumentException">The type is empty or the payload is not a JSON object.</exception>
        public int Send(string type, object payload = null)
        {
            if (string.IsNullOrEmpty(type))
            {
                throw new ArgumentException("Message type must not be empty.", nameof(type));
            }

            JObject data = EnvelopeCodec.ToDataObject(payload);
            if (_state == ConnectionState.Connected && _transport != null)
            {
                return SendNow(type, data);
            }

            Enqueue(type, data);
            return QueuedSeq;
        }

        /// <summary>
        /// Asks the server for a new room (<c>room.create</c>). The answer arrives through
        /// <see cref="RoomCreated"/>; code, join URLs and host token are remembered so the room is
        /// resumed after a reconnect.
        /// </summary>
        /// <param name="initialSettings">Optional initial settings; missing fields take their defaults.</param>
        public void CreateRoom(SettingsPatchDto initialSettings = null)
        {
            var payload = new JObject();
            if (initialSettings != null)
            {
                payload[ProtocolNames.Fields.Settings] = JObject.FromObject(initialSettings);
            }

            Send(ProtocolNames.Messages.RoomCreate, payload);
        }

        /// <summary>Announces the host's position in the phase state machine (<c>phase.set</c>, relayed to phones).</summary>
        /// <exception cref="ArgumentNullException"><paramref name="phase"/> is null.</exception>
        /// <exception cref="ArgumentException">The phase name is empty.</exception>
        public void SetPhase(PhaseSetDto phase)
        {
            if (phase == null)
            {
                throw new ArgumentNullException(nameof(phase));
            }

            if (string.IsNullOrEmpty(phase.Phase))
            {
                throw new ArgumentException("Phase must not be empty.", nameof(phase));
            }

            Send(ProtocolNames.Messages.PhaseSet, JObject.FromObject(phase));
        }

        /// <summary>Changes room settings (<c>settings.set</c>); only the non-null fields of <paramref name="patch"/> change. The server answers <c>settings.state</c>.</summary>
        /// <exception cref="ArgumentNullException"><paramref name="patch"/> is null.</exception>
        public void UpdateSettings(SettingsPatchDto patch)
        {
            if (patch == null)
            {
                throw new ArgumentNullException(nameof(patch));
            }

            Send(ProtocolNames.Messages.SettingsSet, new JObject { { ProtocolNames.Fields.Settings, JObject.FromObject(patch) } });
        }

        /// <summary>Finalises the lobby role assignment (<c>roles.lock</c>).</summary>
        public void LockRoles()
        {
            Send(ProtocolNames.Messages.RolesLock);
        }

        /// <summary>Removes a player (<c>room.kick</c>).</summary>
        /// <exception cref="ArgumentException"><paramref name="playerId"/> is null or empty.</exception>
        public void KickPlayer(string playerId)
        {
            if (string.IsNullOrEmpty(playerId))
            {
                throw new ArgumentException("Player id must not be empty.", nameof(playerId));
            }

            Send(ProtocolNames.Messages.RoomKick, new JObject { { ProtocolNames.Fields.PlayerId, playerId } });
        }

        /// <summary>Ends the session for everyone (<c>room.close</c>); the server answers with <c>bye</c> ROOM_CLOSED.</summary>
        public void CloseRoom()
        {
            Send(ProtocolNames.Messages.RoomClose);
        }

        /// <summary>Pauses the game (<c>game.pause</c>).</summary>
        public void PauseGame()
        {
            Send(ProtocolNames.Messages.GamePause);
        }

        /// <summary>Resumes the game (<c>game.resume</c>), required after <see cref="PauseGame"/> and after a host reconnect.</summary>
        public void ResumeGame()
        {
            Send(ProtocolNames.Messages.GameResume);
        }

        private static long ToMilliseconds(double seconds)
        {
            return Math.Max(0L, (long)Math.Round(seconds * MillisecondsPerSecond));
        }

        private int SendNow(string type, JObject data)
        {
            int seq = _nextSeq;
            string frame = EnvelopeCodec.Encode(type, seq, data);
            _nextSeq++;
            _transport.Send(frame);
            return seq;
        }

        private void SendClockPing()
        {
            if (_probesLeft > 0)
            {
                _probesLeft--;
            }

            _nextPingAt = _now + (_probesLeft > 0 ? ClockProbeSpacingSeconds : _heartbeatSeconds);
            SendNow(ProtocolNames.Messages.ClockPing, new JObject { { ProtocolNames.Fields.ClientTimeMs, ToMilliseconds(_now) } });
        }

        private void SetState(ConnectionState state)
        {
            if (_state == state)
            {
                return;
            }

            _state = state;
            StateChanged?.Invoke(state);
        }

        private void ForgetRoom()
        {
            RoomCode = null;
            JoinUrl = null;
            SpectateUrl = null;
            _hostToken = null;
            LastRoomState = null;
            LastSettings = null;
            LastRolesState = null;
            IsPaused = false;
            IsReceivingSnapshot = false;
        }

        private void Enqueue(string type, JObject data)
        {
            if (_queued.Count >= MaxQueuedMessages)
            {
                PendingMessage dropped = _queued.Dequeue();
                ProtocolError?.Invoke("Send queue is full (" + MaxQueuedMessages + " messages); dropped the oldest queued message (\"" + dropped.Type + "\") to make room for \"" + type + "\".");
            }

            _queued.Enqueue(new PendingMessage { Type = type, Data = data });
        }

        private void OpenTransport(ConnectionState stateWhileConnecting)
        {
            IWebSocketTransport transport = _transportFactory();
            if (transport == null)
            {
                throw new InvalidOperationException("The transport factory returned null.");
            }

            _transport = transport;
            _isTransportOpen = false;
            _isHandshakeComplete = false;
            _stopAfterClose = false;
            transport.Opened += OnOpened;
            transport.TextReceived += OnTextReceived;
            transport.Closed += OnClosed;
            transport.Error += OnError;
            SetState(stateWhileConnecting);
            transport.Connect(Url);
        }

        /// <summary>Detaches from the current transport and disposes it, optionally closing it politely first.</summary>
        private void ReleaseTransport(bool closeGracefully)
        {
            IWebSocketTransport transport = _transport;
            if (transport == null)
            {
                return;
            }

            _transport = null;
            _isTransportOpen = false;
            _isHandshakeComplete = false;
            transport.Opened -= OnOpened;
            transport.TextReceived -= OnTextReceived;
            transport.Closed -= OnClosed;
            transport.Error -= OnError;
            if (closeGracefully)
            {
                transport.Close(WebSocketCloseCodes.Normal, DisconnectReason);
            }

            transport.Dispose();
        }

        private void OnOpened()
        {
            // A new connection: seq starts again at 1 and hello must be the first frame.
            _isTransportOpen = true;
            _nextSeq = FirstSeq;
            _lastResponseAt = _now;
            _bestRoundTripMs = double.MaxValue;
            SendNow(ProtocolNames.Messages.Hello, JObject.FromObject(new HelloDto { AppVersion = AppVersion }));
        }

        private void OnClosed(int code, string reason)
        {
            if (_state == ConnectionState.Disconnected || _transport == null)
            {
                return;
            }

            // A close code that revokes the token works even when the bye frame was missed.
            if (WebSocketCloseCodes.RevokesToken(code))
            {
                ForgetRoom();
            }

            if (_stopAfterClose || code == WebSocketCloseCodes.VersionMismatch || code == WebSocketCloseCodes.Replaced)
            {
                ReleaseTransport(false);
                _isReconnectScheduled = false;
                _queued.Clear();
                ReconnectAttempts = 0;
                SetState(ConnectionState.Disconnected);
                return;
            }

            HandleConnectionLost(false);
        }

        private void OnError(string message)
        {
            TransportError?.Invoke(message);

            // A transport that reports an error and is already closed will not raise Closed.
            IWebSocketTransport transport = _transport;
            if (transport != null && transport.State == TransportState.Closed)
            {
                HandleConnectionLost(false);
            }
        }

        private void HandleConnectionLost(bool closeGracefully)
        {
            if (_state == ConnectionState.Disconnected || _transport == null)
            {
                return;
            }

            ReleaseTransport(closeGracefully);
            ReconnectAttempts++;
            _reconnectAt = _now + _backoff.NextDelaySeconds();
            _isReconnectScheduled = true;
            SetState(ConnectionState.Reconnecting);
        }

        private void OnTextReceived(string text)
        {
            Envelope envelope;
            string error;
            if (!EnvelopeCodec.TryDecode(text, out envelope, out error))
            {
                ProtocolError?.Invoke(error);
                return;
            }

            switch (envelope.Type)
            {
                case ProtocolNames.Messages.HelloOk:
                    HandleHelloOk(envelope);
                    break;
                case ProtocolNames.Messages.ClockPong:
                    HandleClockPong(envelope);
                    break;
                case ProtocolNames.Messages.Error:
                    HandleServerError(envelope);
                    break;
                case ProtocolNames.Messages.Bye:
                    HandleBye(envelope);
                    break;
                case ProtocolNames.Messages.RoomCreated:
                    HandleRoomCreated(envelope);
                    break;
                case ProtocolNames.Messages.RoomResumed:
                    HandleRoomResumed(envelope);
                    break;
                case ProtocolNames.Messages.RoomState:
                    if (TryRead(envelope, out RoomStateDto state))
                    {
                        LastRoomState = state;
                        IsPaused = state.Paused;
                        RoomStateChanged?.Invoke(state);
                    }

                    break;
                case ProtocolNames.Messages.SettingsState:
                    if (TryRead(envelope, out SettingsStateDto settings))
                    {
                        LastSettings = settings.Settings;
                        SettingsChanged?.Invoke(settings.Settings);
                    }

                    break;
                case ProtocolNames.Messages.RolesState:
                    if (TryRead(envelope, out RolesStateDto roles))
                    {
                        LastRolesState = roles;
                        RolesStateChanged?.Invoke(roles);
                    }

                    break;
                case ProtocolNames.Messages.SnapshotEnd:
                    if (TryRead(envelope, out SnapshotEndDto snapshotEnd))
                    {
                        IsReceivingSnapshot = false;
                        SnapshotEnded?.Invoke(snapshotEnd);
                    }

                    break;
                case ProtocolNames.Messages.GamePaused:
                    if (TryRead(envelope, out GamePausedDto paused))
                    {
                        IsPaused = true;
                        GamePaused?.Invoke(paused);
                    }

                    break;
                case ProtocolNames.Messages.GameResumed:
                    if (TryRead(envelope, out GameResumedDto resumed))
                    {
                        IsPaused = false;
                        GameResumed?.Invoke(resumed);
                    }

                    break;
                case ProtocolNames.Messages.Relay:
                    if (TryRead(envelope, out RelayDto relay))
                    {
                        RelayReceived?.Invoke(relay);
                    }

                    break;
            }

            MessageReceived?.Invoke(envelope);
        }

        private bool TryRead<T>(Envelope envelope, out T dto) where T : class
        {
            string error;
            if (ProtocolJson.TryRead(envelope.Data, out dto, out error))
            {
                return true;
            }

            ProtocolError?.Invoke(envelope.Type + ": " + error);
            return false;
        }

        private void HandleHelloOk(Envelope envelope)
        {
            if (_isHandshakeComplete || _transport == null)
            {
                ProtocolError?.Invoke(envelope.Type + ": unexpected; the handshake is already complete.");
                return;
            }

            HelloOkDto helloOk;
            if (!TryRead(envelope, out helloOk))
            {
                return;
            }

            LastHelloOk = helloOk;
            _heartbeatSeconds = Math.Max(helloOk.HeartbeatMs, (int)MillisecondsPerSecond) / MillisecondsPerSecond;
            _isHandshakeComplete = true;
            _lastResponseAt = _now;
            _probesLeft = ProtocolNames.Defaults.ClockProbeCount;
            _nextPingAt = _now;
            _backoff.Reset();
            ReconnectAttempts = 0;
            _isReconnectScheduled = false;

            // The state field is set before the event is raised so that the resume frame and the
            // queued frames go out before anything a StateChanged handler sends.
            _state = ConnectionState.Connected;

            if (RoomCode != null && _hostToken != null)
            {
                var resume = new RoomResumeDto { Room = RoomCode, Token = _hostToken, LastOutcomeSeq = Math.Max(0, LastAppliedOutcomeSeq) };
                SendNow(ProtocolNames.Messages.RoomResume, JObject.FromObject(resume));
            }

            while (_queued.Count > 0 && _state == ConnectionState.Connected && _transport != null)
            {
                PendingMessage message = _queued.Dequeue();
                SendNow(message.Type, message.Data);
            }

            StateChanged?.Invoke(ConnectionState.Connected);
        }

        private void HandleClockPong(Envelope envelope)
        {
            ClockPongDto pong;
            if (!TryRead(envelope, out pong))
            {
                return;
            }

            if (pong.ClientTimeMs < 0)
            {
                ProtocolError?.Invoke(envelope.Type + ": the echoed \"" + ProtocolNames.Fields.ClientTimeMs + "\" is missing.");
                return;
            }

            double roundTripMs = _now * MillisecondsPerSecond - pong.ClientTimeMs;
            if (roundTripMs < 0)
            {
                return;
            }

            _lastResponseAt = _now;
            LastRoundTripMs = roundTripMs;
            if (roundTripMs <= _bestRoundTripMs)
            {
                _bestRoundTripMs = roundTripMs;
                ServerClockOffsetMs = pong.ServerTimeMs - (pong.ClientTimeMs + roundTripMs / 2.0);
                HasServerClock = true;
            }
        }

        private void HandleServerError(Envelope envelope)
        {
            ErrorDto serverError;
            if (!TryRead(envelope, out serverError))
            {
                return;
            }

            switch (serverError.Code)
            {
                // The room or the token is gone (server restart, room expired): stop resuming it.
                case ProtocolNames.ErrorCodes.RoomNotFound:
                case ProtocolNames.ErrorCodes.TokenInvalid:
                    ForgetRoom();
                    break;

                // Retrying with the same version cannot succeed.
                case ProtocolNames.ErrorCodes.VersionMismatch:
                    _stopAfterClose = true;
                    break;
            }

            ServerError?.Invoke(serverError);
        }

        private void HandleBye(Envelope envelope)
        {
            ByeDto bye;
            if (!TryRead(envelope, out bye))
            {
                return;
            }

            LastBye = bye;
            if (!bye.CanResume)
            {
                ForgetRoom();
            }

            if (bye.Reason == ProtocolNames.ByeReasons.VersionMismatch || bye.Reason == ProtocolNames.ByeReasons.Replaced)
            {
                _stopAfterClose = true;
            }

            ByeReceived?.Invoke(bye);
        }

        private void HandleRoomCreated(Envelope envelope)
        {
            RoomCreatedDto created;
            if (!TryRead(envelope, out created))
            {
                return;
            }

            if (string.IsNullOrEmpty(created.Room) || string.IsNullOrEmpty(created.HostToken))
            {
                ProtocolError?.Invoke(envelope.Type + ": the room code or host token is missing.");
                return;
            }

            ForgetRoom();
            RoomCode = created.Room;
            JoinUrl = string.IsNullOrEmpty(created.JoinUrl) ? null : created.JoinUrl;
            SpectateUrl = string.IsNullOrEmpty(created.SpectateUrl) ? null : created.SpectateUrl;
            _hostToken = created.HostToken;
            IsReceivingSnapshot = true;
            RoomCreated?.Invoke(created);
        }

        private void HandleRoomResumed(Envelope envelope)
        {
            RoomResumedDto resumed;
            if (!TryRead(envelope, out resumed))
            {
                return;
            }

            if (!string.IsNullOrEmpty(resumed.Room))
            {
                RoomCode = resumed.Room;
            }

            IsPaused = resumed.Paused;
            IsReceivingSnapshot = true;
            RoomResumed?.Invoke(resumed);
        }
    }
}
