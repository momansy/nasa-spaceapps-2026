#if !UNITY_WEBGL || UNITY_EDITOR
using System;
using System.Collections.Concurrent;
using System.IO;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace MissionForge.Net
{
    /// <summary>
    /// <see cref="IWebSocketTransport"/> for the Editor and desktop players, built on
    /// <see cref="ClientWebSocket"/>. Network I/O runs on thread-pool threads; every event is
    /// queued and raised only from <see cref="Pump"/>.
    /// </summary>
    /// <remarks>
    /// Not available in WebGL player builds (browsers have no sockets); use
    /// <see cref="WebSocketTransportFactory.Create"/> to get the right transport per platform.
    /// The public members must be called from one thread (the Unity main thread).
    /// </remarks>
    public sealed class ManagedWebSocketTransport : IWebSocketTransport
    {
        private const int ReceiveBufferBytes = 8192;
        private const int MaxMessageBytes = 1 << 20;
        private const int CloseHandshakeTimeoutMs = 2000;

        private enum EventKind
        {
            Opened,
            Text,
            Error,
            Closed,
        }

        private struct TransportEvent
        {
            public EventKind Kind;
            public Session Session;
            public int Code;
            public string Text;
        }

        private struct Outgoing
        {
            public bool IsClose;
            public int Code;
            public string Text;
        }

        /// <summary>
        /// Everything owned by one connection attempt. The main thread and the background run
        /// loop each call <see cref="Release"/> exactly once when they stop using the session;
        /// the second call disposes the resources, so neither side can touch a disposed object.
        /// </summary>
        private sealed class Session
        {
            public readonly ClientWebSocket Socket = new ClientWebSocket();
            public readonly CancellationTokenSource Cancellation = new CancellationTokenSource();
            public readonly ConcurrentQueue<Outgoing> Outbox = new ConcurrentQueue<Outgoing>();
            public readonly SemaphoreSlim OutboxSignal = new SemaphoreSlim(0);

            /// <summary>Serializes every send-side socket call (data frames and close frames).</summary>
            public readonly SemaphoreSlim SendLock = new SemaphoreSlim(1, 1);

            public volatile bool LocalCloseRequested;
            public int LocalCloseCode;
            public string LocalCloseReason = "";

            public volatile bool RemoteCloseReceived;
            public int RemoteCloseCode;
            public string RemoteCloseReason = "";

            private int _releaseCount;

            public void Release()
            {
                if (Interlocked.Increment(ref _releaseCount) != 2)
                {
                    return;
                }

                Socket.Dispose();
                Cancellation.Dispose();
                OutboxSignal.Dispose();
                SendLock.Dispose();
            }
        }

        private readonly ConcurrentQueue<TransportEvent> _events = new ConcurrentQueue<TransportEvent>();
        private Session _session;
        private bool _disposed;

        /// <inheritdoc />
        public TransportState State { get; private set; }

        /// <inheritdoc />
        public event Action Opened;

        /// <inheritdoc />
        public event Action<string> TextReceived;

        /// <inheritdoc />
        public event Action<int, string> Closed;

        /// <inheritdoc />
        public event Action<string> Error;

        /// <inheritdoc />
        /// <exception cref="ObjectDisposedException">The transport was disposed.</exception>
        public void Connect(string url)
        {
            if (_disposed)
            {
                throw new ObjectDisposedException(nameof(ManagedWebSocketTransport));
            }

            if (State != TransportState.Closed)
            {
                EnqueueError(null, "Connect was called while the transport is " + State + ".");
                return;
            }

            Uri uri;
            bool isWebSocketUrl = Uri.TryCreate(url, UriKind.Absolute, out uri)
                && (uri.Scheme == "ws" || uri.Scheme == "wss");
            if (!isWebSocketUrl)
            {
                FailBeforeStart("Not a ws:// or wss:// URL: \"" + url + "\".");
                return;
            }

            Session session;
            try
            {
                session = new Session();
            }
            catch (Exception ex)
            {
                // ClientWebSocket is unsupported on some platforms; report instead of throwing.
                FailBeforeStart("WebSocket client could not be created: " + Describe(ex));
                return;
            }

            _session = session;
            State = TransportState.Connecting;
            Task.Run(() => RunAsync(session, uri));
        }

        /// <inheritdoc />
        public void Send(string text)
        {
            Session session = _session;
            if (_disposed || session == null || State != TransportState.Open)
            {
                EnqueueError(session, "Send was called while the transport is " + State + ".");
                return;
            }

            if (text == null)
            {
                EnqueueError(session, "Send was called with a null message.");
                return;
            }

            session.Outbox.Enqueue(new Outgoing { Text = text });
            session.OutboxSignal.Release();
        }

        /// <inheritdoc />
        public void Close(int code = WebSocketCloseCodes.Normal, string reason = "")
        {
            Session session = _session;
            if (_disposed || session == null)
            {
                return;
            }

            if (State == TransportState.Connecting)
            {
                // No handshake to finish yet: abandon the attempt.
                session.LocalCloseCode = code;
                session.LocalCloseReason = reason ?? "";
                session.LocalCloseRequested = true;
                State = TransportState.Closing;
                session.Cancellation.Cancel();
                return;
            }

            if (State != TransportState.Open)
            {
                return;
            }

            string safeReason = WebSocketCloseCodes.TruncateReason(reason);
            session.LocalCloseCode = code;
            session.LocalCloseReason = safeReason;
            session.LocalCloseRequested = true;
            State = TransportState.Closing;
            session.Outbox.Enqueue(new Outgoing { IsClose = true, Code = code, Text = safeReason });
            session.OutboxSignal.Release();

            // Bounds the wait for the server's close frame.
            session.Cancellation.CancelAfter(CloseHandshakeTimeoutMs);
        }

        /// <inheritdoc />
        public void Pump()
        {
            TransportEvent ev;
            while (!_disposed && _events.TryDequeue(out ev))
            {
                Dispatch(ev);
            }
        }

        /// <summary>
        /// Stops the connection without raising further events. A close handshake that is
        /// already in progress is allowed to finish in the background.
        /// </summary>
        public void Dispose()
        {
            if (_disposed)
            {
                return;
            }

            _disposed = true;
            Session session = _session;
            _session = null;
            if (session != null)
            {
                if (State != TransportState.Closing)
                {
                    session.Cancellation.Cancel();
                }

                session.Release();
            }

            State = TransportState.Closed;
            TransportEvent discarded;
            while (_events.TryDequeue(out discarded))
            {
                // Dropped on purpose: a disposed transport raises no events.
            }
        }

        private void Dispatch(TransportEvent ev)
        {
            switch (ev.Kind)
            {
                case EventKind.Opened:
                    // Skipped when Close() was called before the handshake completed.
                    if (State == TransportState.Connecting)
                    {
                        State = TransportState.Open;
                        Opened?.Invoke();
                    }

                    break;

                case EventKind.Text:
                    TextReceived?.Invoke(ev.Text);
                    break;

                case EventKind.Error:
                    Error?.Invoke(ev.Text);
                    break;

                case EventKind.Closed:
                    if (ev.Session != null && ev.Session == _session)
                    {
                        _session = null;
                        ev.Session.Release();
                    }

                    State = TransportState.Closed;
                    Closed?.Invoke(ev.Code, ev.Text);
                    break;
            }
        }

        private void FailBeforeStart(string message)
        {
            EnqueueError(null, message);
            _events.Enqueue(new TransportEvent { Kind = EventKind.Closed, Code = WebSocketCloseCodes.Abnormal, Text = message });
        }

        private void EnqueueError(Session session, string message)
        {
            _events.Enqueue(new TransportEvent { Kind = EventKind.Error, Session = session, Text = message });
        }

        /// <summary>
        /// Background lifetime of one connection: connect, run the send and receive loops, then
        /// queue exactly one Closed event as the session's last event. Never throws.
        /// </summary>
        private async Task RunAsync(Session session, Uri uri)
        {
            Task<string> sender = null;
            string failure = null;
            try
            {
                await session.Socket.ConnectAsync(uri, session.Cancellation.Token).ConfigureAwait(false);
                _events.Enqueue(new TransportEvent { Kind = EventKind.Opened, Session = session });
                sender = SendLoopAsync(session);
                await ReceiveLoopAsync(session).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                // Reported below through the Error and Closed events.
                failure = Describe(ex);
            }

            session.Cancellation.Cancel(); // stops the send loop
            if (sender != null)
            {
                string sendFailure = await sender.ConfigureAwait(false);
                if (sendFailure != null)
                {
                    failure = sendFailure;
                }
            }

            int code = WebSocketCloseCodes.Abnormal;
            string reason = failure ?? "";
            if (session.RemoteCloseReceived)
            {
                code = session.RemoteCloseCode;
                reason = session.RemoteCloseReason;
            }
            else if (session.LocalCloseRequested)
            {
                code = session.LocalCloseCode;
                reason = session.LocalCloseReason;
            }
            else
            {
                EnqueueError(session, failure ?? "Connection ended unexpectedly.");
            }

            _events.Enqueue(new TransportEvent { Kind = EventKind.Closed, Session = session, Code = code, Text = reason });
            session.Release();
        }

        private async Task ReceiveLoopAsync(Session session)
        {
            ClientWebSocket socket = session.Socket;
            CancellationToken token = session.Cancellation.Token;
            var buffer = new byte[ReceiveBufferBytes];
            var segment = new ArraySegment<byte>(buffer);

            using (var message = new MemoryStream())
            {
                while (true)
                {
                    WebSocketReceiveResult result = await socket.ReceiveAsync(segment, token).ConfigureAwait(false);
                    if (result.MessageType == WebSocketMessageType.Close)
                    {
                        session.RemoteCloseCode = result.CloseStatus.HasValue ? (int)result.CloseStatus.Value : WebSocketCloseCodes.NoStatus;
                        session.RemoteCloseReason = result.CloseStatusDescription ?? "";
                        session.RemoteCloseReceived = true;
                        await ReplyToCloseAsync(session).ConfigureAwait(false);
                        return;
                    }

                    message.Write(buffer, 0, result.Count);
                    if (message.Length > MaxMessageBytes)
                    {
                        throw new InvalidDataException("Incoming message exceeds " + MaxMessageBytes + " bytes.");
                    }

                    if (!result.EndOfMessage)
                    {
                        continue;
                    }

                    if (result.MessageType == WebSocketMessageType.Text)
                    {
                        string text = Encoding.UTF8.GetString(message.GetBuffer(), 0, (int)message.Length);
                        _events.Enqueue(new TransportEvent { Kind = EventKind.Text, Session = session, Text = text });
                    }
                    else
                    {
                        EnqueueError(session, "Ignored a binary message of " + message.Length + " bytes.");
                    }

                    message.SetLength(0);
                }
            }
        }

        /// <summary>Completes the closing handshake after the server sent its close frame.</summary>
        private static async Task ReplyToCloseAsync(Session session)
        {
            CancellationToken token = session.Cancellation.Token;
            await session.SendLock.WaitAsync(token).ConfigureAwait(false);
            try
            {
                if (session.Socket.State == WebSocketState.CloseReceived)
                {
                    await session.Socket.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, "", token).ConfigureAwait(false);
                }
            }
            finally
            {
                session.SendLock.Release();
            }
        }

        /// <summary>
        /// Sends queued frames one at a time, in order. Returns null on a normal stop or a
        /// description of the fault that stopped it.
        /// </summary>
        private static async Task<string> SendLoopAsync(Session session)
        {
            ClientWebSocket socket = session.Socket;
            CancellationToken token = session.Cancellation.Token;
            try
            {
                while (true)
                {
                    await session.OutboxSignal.WaitAsync(token).ConfigureAwait(false);
                    Outgoing item;
                    if (!session.Outbox.TryDequeue(out item))
                    {
                        continue;
                    }

                    await session.SendLock.WaitAsync(token).ConfigureAwait(false);
                    try
                    {
                        if (item.IsClose)
                        {
                            if (socket.State == WebSocketState.Open || socket.State == WebSocketState.CloseReceived)
                            {
                                await socket.CloseOutputAsync((WebSocketCloseStatus)item.Code, item.Text, token).ConfigureAwait(false);
                            }

                            return null;
                        }

                        if (socket.State != WebSocketState.Open)
                        {
                            return null;
                        }

                        byte[] bytes = Encoding.UTF8.GetBytes(item.Text);
                        await socket.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, token).ConfigureAwait(false);
                    }
                    finally
                    {
                        session.SendLock.Release();
                    }
                }
            }
            catch (OperationCanceledException)
            {
                // Normal stop: the run loop cancels the session when the connection ends.
                return null;
            }
            catch (Exception ex)
            {
                session.Cancellation.Cancel(); // wakes the receive loop so the connection ends
                return Describe(ex);
            }
        }

        private static string Describe(Exception ex)
        {
            var text = new StringBuilder();
            for (Exception current = ex; current != null; current = current.InnerException)
            {
                if (text.Length > 0)
                {
                    text.Append(" -> ");
                }

                text.Append(current.GetType().Name).Append(": ").Append(current.Message);
            }

            return text.ToString();
        }
    }
}
#endif
