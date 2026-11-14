using System;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;

namespace MissionForge.Net
{
    /// <summary>Connection state of a <see cref="RoomClient"/>.</summary>
    public enum ConnectionState
    {
        /// <summary>Not connected and not trying to connect.</summary>
        Disconnected,

        /// <summary>The first connection attempt after <see cref="RoomClient.Connect"/> is in progress.</summary>
        Connecting,

        /// <summary>Connected to the room server.</summary>
        Connected,

        /// <summary>The connection was lost (or could not be made) and the client is retrying with backoff.</summary>
        Reconnecting,
    }

    /// <summary>
    /// Host-side client of the MissionForge room server. Plain C# with no Unity types: it is
    /// driven by <see cref="Tick"/> and talks through an <see cref="IWebSocketTransport"/>, so it
    /// can be tested with a fake transport and a manual clock.
    /// </summary>
    /// <remarks>
    /// Not thread-safe; use it from one thread. Bad incoming frames are reported through
    /// <see cref="ProtocolError"/> and never thrown.
    /// </remarks>
    public sealed class RoomClient
    {
        /// <summary>Seconds between keepalive pings while connected.</summary>
        public const double KeepAliveIntervalSeconds = 10.0;

        /// <summary>Maximum number of messages held while not connected; the oldest is dropped beyond this.</summary>
        public const int MaxQueuedMessages = 64;

        /// <summary>Value of <see cref="LastRoundTripMs"/> before the first pong arrives.</summary>
        public const double UnknownRoundTripMs = -1.0;

        private const double MillisecondsPerSecond = 1000.0;
        private const int FirstSeq = 1;
        private const string DisconnectReason = "client disconnect";

        private readonly Func<IWebSocketTransport> _transportFactory;
        private readonly BackoffPolicy _backoff;
        private readonly Queue<string> _queuedFrames = new Queue<string>();

        private IWebSocketTransport _transport;
        private ConnectionState _state = ConnectionState.Disconnected;
        private string _hostToken;
        private int _nextSeq = FirstSeq;
        private double _now;
        private double _reconnectAt;
        private bool _isReconnectScheduled;
        private double _nextPingAt;

        /// <summary>Creates a client.</summary>
        /// <param name="transportFactory">Creates a fresh transport for every connection attempt.</param>
        /// <param name="backoff">Reconnect delay policy; a default policy is used when null.</param>
        /// <exception cref="ArgumentNullException"><paramref name="transportFactory"/> is null.</exception>
        public RoomClient(Func<IWebSocketTransport> transportFactory, BackoffPolicy backoff = null)
        {
            if (transportFactory == null)
            {
                throw new ArgumentNullException(nameof(transportFactory));
            }

            _transportFactory = transportFactory;
            _backoff = backoff ?? new BackoffPolicy();
            LastRoundTripMs = UnknownRoundTripMs;
        }

        /// <summary>Raised whenever <see cref="State"/> changes.</summary>
        public event Action<ConnectionState> StateChanged;

        /// <summary>Raised for every valid envelope received, after the typed events for that message.</summary>
        public event Action<Envelope> MessageReceived;

        /// <summary>Raised when the server confirms <see cref="CreateRoom"/>.</summary>
        public event Action<RoomCreatedDto> RoomCreated;

        /// <summary>Raised for every <c>room.state</c> broadcast.</summary>
        public event Action<RoomStateDto> RoomStateChanged;

        /// <summary>Raised when the server sends an <c>error</c> message.</summary>
        public event Action<ErrorDto> ServerError;

        /// <summary>
        /// Raised for frames that are not valid protocol messages, and when a queued outgoing
        /// message had to be dropped because the queue was full.
        /// </summary>
        public event Action<string> ProtocolError;

        /// <summary>Raised with the description of a transport fault (connection refused, socket error...).</summary>
        public event Action<string> TransportError;

        /// <summary>Current connection state.</summary>
        public ConnectionState State
        {
            get { return _state; }
        }

        /// <summary>URL passed to the last <see cref="Connect"/>, or null.</summary>
        public string Url { get; private set; }

        /// <summary>Code of the room this host owns, or null when there is none.</summary>
        public string RoomCode { get; private set; }

        /// <summary>The most recent <c>room.state</c>, or null when none was received for the current room.</summary>
        public RoomStateDto LastRoomState { get; private set; }

        /// <summary>Consecutive reconnect attempts since the last successful connection (0 while connected).</summary>
        public int ReconnectAttempts { get; private set; }

        /// <summary>Round-trip time of the last keepalive ping in milliseconds, or <see cref="UnknownRoundTripMs"/>.</summary>
        public double LastRoundTripMs { get; private set; }

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
            _isReconnectScheduled = false;
            _backoff.Reset();
            OpenTransport(ConnectionState.Connecting);
        }

        /// <summary>
        /// Closes the connection and stops reconnecting. Queued messages and the remembered room
        /// are discarded.
        /// </summary>
        public void Disconnect()
        {
            _isReconnectScheduled = false;
            ReleaseTransport(true);
            _queuedFrames.Clear();
            ForgetRoom();
            ReconnectAttempts = 0;
            SetState(ConnectionState.Disconnected);
        }

        /// <summary>
        /// Advances the client: dispatches transport events, starts a due reconnect attempt and
        /// sends the keepalive ping. Call once per frame.
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

            if (_state == ConnectionState.Connected && _now >= _nextPingAt)
            {
                _nextPingAt = _now + KeepAliveIntervalSeconds;
                var payload = new JObject { { ProtocolNames.Fields.Time, ToMilliseconds(_now) } };
                Send(ProtocolNames.Messages.Ping, payload);
            }
        }

        /// <summary>
        /// Sends a message, or queues it when not connected (flushed in order once connected).
        /// </summary>
        /// <param name="type">Message type, see <see cref="ProtocolNames.Messages"/>.</param>
        /// <param name="payload">Null, a <see cref="JObject"/>, or an object that serializes to a JSON object.</param>
        /// <returns>The sequence number used; it starts at 1 and grows by one per message.</returns>
        /// <exception cref="ArgumentException">The type is empty or the payload is not a JSON object.</exception>
        public int Send(string type, object payload = null)
        {
            string frame = EnvelopeCodec.Encode(type, _nextSeq, payload);
            int seq = _nextSeq;
            _nextSeq++;

            if (_state == ConnectionState.Connected && _transport != null)
            {
                _transport.Send(frame);
            }
            else
            {
                Enqueue(frame, type);
            }

            return seq;
        }

        /// <summary>
        /// Asks the server for a new room. The answer arrives through <see cref="RoomCreated"/>;
        /// its code and host token are remembered so the room is resumed after a reconnect.
        /// </summary>
        public void CreateRoom()
        {
            var payload = new JObject
            {
                { ProtocolNames.Fields.Client, ProtocolNames.Values.ClientHost },
                { ProtocolNames.Fields.Version, ProtocolNames.ProtocolVersion },
            };
            Send(ProtocolNames.Messages.RoomCreate, payload);
        }

        /// <summary>Asks the server to change the room phase (for example <c>BRIEFING</c>).</summary>
        /// <exception cref="ArgumentException"><paramref name="phase"/> is null or empty.</exception>
        public void SetPhase(string phase)
        {
            if (string.IsNullOrEmpty(phase))
            {
                throw new ArgumentException("Phase must not be empty.", nameof(phase));
            }

            Send(ProtocolNames.Messages.PhaseSet, new JObject { { ProtocolNames.Fields.Phase, phase } });
        }

        /// <summary>
        /// Sends a partial settings update; only the given fields change. Build the object with
        /// the names in <see cref="ProtocolNames.Fields"/>.
        /// </summary>
        /// <exception cref="ArgumentNullException"><paramref name="partialSettings"/> is null.</exception>
        public void UpdateSettings(JObject partialSettings)
        {
            if (partialSettings == null)
            {
                throw new ArgumentNullException(nameof(partialSettings));
            }

            Send(ProtocolNames.Messages.RoomSettings, partialSettings);
        }

        private static long ToMilliseconds(double seconds)
        {
            return (long)Math.Round(seconds * MillisecondsPerSecond);
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
            _hostToken = null;
            LastRoomState = null;
        }

        private void Enqueue(string frame, string type)
        {
            if (_queuedFrames.Count >= MaxQueuedMessages)
            {
                _queuedFrames.Dequeue();
                ProtocolError?.Invoke("Send queue is full (" + MaxQueuedMessages + " messages); dropped the oldest queued message to make room for \"" + type + "\".");
            }

            _queuedFrames.Enqueue(frame);
        }

        private void OpenTransport(ConnectionState stateWhileConnecting)
        {
            IWebSocketTransport transport = _transportFactory();
            if (transport == null)
            {
                throw new InvalidOperationException("The transport factory returned null.");
            }

            _transport = transport;
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
            bool isReconnect = _state == ConnectionState.Reconnecting;
            _backoff.Reset();
            ReconnectAttempts = 0;
            _isReconnectScheduled = false;
            _nextPingAt = _now + KeepAliveIntervalSeconds;

            // The state field is set before the event is raised so that the resume frame and the
            // queued frames go out before anything a StateChanged handler sends.
            _state = ConnectionState.Connected;

            if (isReconnect && RoomCode != null && _hostToken != null)
            {
                var payload = new JObject
                {
                    { ProtocolNames.Fields.Code, RoomCode },
                    { ProtocolNames.Fields.HostToken, _hostToken },
                };
                Send(ProtocolNames.Messages.RoomResume, payload);
            }

            while (_queuedFrames.Count > 0 && _state == ConnectionState.Connected && _transport != null)
            {
                _transport.Send(_queuedFrames.Dequeue());
            }

            StateChanged?.Invoke(ConnectionState.Connected);
        }

        private void OnClosed(int code, string reason)
        {
            HandleConnectionLost();
        }

        private void OnError(string message)
        {
            TransportError?.Invoke(message);

            // A transport that reports an error and is already closed will not raise Closed.
            IWebSocketTransport transport = _transport;
            if (transport != null && transport.State == TransportState.Closed)
            {
                HandleConnectionLost();
            }
        }

        private void HandleConnectionLost()
        {
            if (_state == ConnectionState.Disconnected || _transport == null)
            {
                return;
            }

            ReleaseTransport(false);
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
                case ProtocolNames.Messages.RoomCreated:
                    HandleRoomCreated(envelope);
                    break;
                case ProtocolNames.Messages.RoomState:
                    HandleRoomState(envelope);
                    break;
                case ProtocolNames.Messages.Error:
                    HandleServerError(envelope);
                    break;
                case ProtocolNames.Messages.Pong:
                    HandlePong(envelope);
                    break;
            }

            MessageReceived?.Invoke(envelope);
        }

        private void HandleRoomCreated(Envelope envelope)
        {
            RoomCreatedDto created;
            string error;
            if (!ProtocolJson.TryRead(envelope.Data, out created, out error))
            {
                ProtocolError?.Invoke(envelope.Type + ": " + error);
                return;
            }

            if (string.IsNullOrEmpty(created.Code) || string.IsNullOrEmpty(created.HostToken))
            {
                ProtocolError?.Invoke(envelope.Type + ": the room code or host token is missing.");
                return;
            }

            RoomCode = created.Code;
            _hostToken = created.HostToken;
            LastRoomState = null;
            RoomCreated?.Invoke(created);
        }

        private void HandleRoomState(Envelope envelope)
        {
            RoomStateDto state;
            string error;
            if (!ProtocolJson.TryRead(envelope.Data, out state, out error))
            {
                ProtocolError?.Invoke(envelope.Type + ": " + error);
                return;
            }

            LastRoomState = state;
            RoomStateChanged?.Invoke(state);
        }

        private void HandleServerError(Envelope envelope)
        {
            ErrorDto serverError;
            string error;
            if (!ProtocolJson.TryRead(envelope.Data, out serverError, out error))
            {
                ProtocolError?.Invoke(envelope.Type + ": " + error);
                return;
            }

            // The room is gone (for example the server restarted): stop trying to resume it.
            if (serverError.Code == ProtocolNames.ErrorCodes.RoomNotFound)
            {
                ForgetRoom();
            }

            ServerError?.Invoke(serverError);
        }

        private void HandlePong(Envelope envelope)
        {
            JToken sentAt = envelope.Data[ProtocolNames.Fields.Time];
            if (sentAt == null || (sentAt.Type != JTokenType.Integer && sentAt.Type != JTokenType.Float))
            {
                ProtocolError?.Invoke(envelope.Type + ": the echoed timestamp \"" + ProtocolNames.Fields.Time + "\" is missing.");
                return;
            }

            double roundTripMs = _now * MillisecondsPerSecond - (double)sentAt;
            if (roundTripMs >= 0)
            {
                LastRoundTripMs = roundTripMs;
            }
        }
    }
}
