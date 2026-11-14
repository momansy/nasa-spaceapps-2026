#if UNITY_WEBGL && !UNITY_EDITOR
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Runtime.InteropServices;

namespace MissionForge.Net
{
    /// <summary>
    /// <see cref="IWebSocketTransport"/> for WebGL player builds. It drives the browser
    /// WebSocket through Plugins/MissionForgeWebSocket.jslib and polls queued events in
    /// <see cref="Pump"/> (no JS-to-C# callbacks).
    /// </summary>
    public sealed class WebGLWebSocketTransport : IWebSocketTransport
    {
        private const int NoSocket = 0;

        /// <summary>Upper bound of events handled per frame so a flood cannot stall the frame.</summary>
        private const int MaxEventsPerPump = 256;

        private const char EventOpened = 'o';
        private const char EventMessage = 'm';
        private const char EventClosed = 'c';
        private const char EventError = 'e';
        private const char CloseCodeSeparator = '|';

        [DllImport("__Internal")]
        private static extern int MFWS_Create(string url);

        [DllImport("__Internal")]
        private static extern int MFWS_Send(int id, string text);

        [DllImport("__Internal")]
        private static extern void MFWS_Close(int id, int code, string reason);

        [DllImport("__Internal")]
        private static extern string MFWS_PollEvent(int id);

        [DllImport("__Internal")]
        private static extern void MFWS_Destroy(int id);

        private readonly Queue<string> _localErrors = new Queue<string>();
        private int _id = NoSocket;
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
                throw new ObjectDisposedException(nameof(WebGLWebSocketTransport));
            }

            if (State != TransportState.Closed)
            {
                _localErrors.Enqueue("Connect was called while the transport is " + State + ".");
                return;
            }

            // The jslib reports an invalid URL as an error event followed by a close event.
            _id = MFWS_Create(url ?? "");
            State = TransportState.Connecting;
        }

        /// <inheritdoc />
        public void Send(string text)
        {
            if (_disposed || _id == NoSocket || State != TransportState.Open)
            {
                _localErrors.Enqueue("Send was called while the transport is " + State + ".");
                return;
            }

            if (text == null)
            {
                _localErrors.Enqueue("Send was called with a null message.");
                return;
            }

            if (MFWS_Send(_id, text) == 0)
            {
                _localErrors.Enqueue("Send failed: the browser socket is not open.");
            }
        }

        /// <inheritdoc />
        public void Close(int code = WebSocketCloseCodes.Normal, string reason = "")
        {
            if (_disposed || _id == NoSocket)
            {
                return;
            }

            if (State != TransportState.Connecting && State != TransportState.Open)
            {
                return;
            }

            State = TransportState.Closing;
            MFWS_Close(_id, code, WebSocketCloseCodes.TruncateReason(reason));
        }

        /// <inheritdoc />
        public void Pump()
        {
            while (!_disposed && _localErrors.Count > 0)
            {
                Error?.Invoke(_localErrors.Dequeue());
            }

            for (int handled = 0; handled < MaxEventsPerPump && !_disposed && _id != NoSocket; handled++)
            {
                string encoded = MFWS_PollEvent(_id);
                if (string.IsNullOrEmpty(encoded))
                {
                    break;
                }

                Dispatch(encoded);
            }
        }

        /// <summary>Closes the browser socket without raising further events.</summary>
        public void Dispose()
        {
            if (_disposed)
            {
                return;
            }

            _disposed = true;
            ReleaseSocket();
            State = TransportState.Closed;
            _localErrors.Clear();
        }

        private void Dispatch(string encoded)
        {
            char kind = encoded[0];
            string body = encoded.Substring(1);
            switch (kind)
            {
                case EventOpened:
                    // Skipped when Close() was called before the handshake completed.
                    if (State == TransportState.Connecting)
                    {
                        State = TransportState.Open;
                        Opened?.Invoke();
                    }

                    break;

                case EventMessage:
                    TextReceived?.Invoke(body);
                    break;

                case EventError:
                    Error?.Invoke(body);
                    break;

                case EventClosed:
                    int code;
                    string reason;
                    ParseClose(body, out code, out reason);
                    ReleaseSocket();
                    State = TransportState.Closed;
                    Closed?.Invoke(code, reason);
                    break;

                default:
                    Error?.Invoke("Unknown event from the WebSocket bridge: \"" + encoded + "\".");
                    break;
            }
        }

        private void ReleaseSocket()
        {
            if (_id == NoSocket)
            {
                return;
            }

            MFWS_Destroy(_id);
            _id = NoSocket;
        }

        /// <summary>Parses the body of a close event, <c>&lt;code&gt;|&lt;reason&gt;</c>.</summary>
        private static void ParseClose(string body, out int code, out string reason)
        {
            int separator = body.IndexOf(CloseCodeSeparator);
            string codeText = separator >= 0 ? body.Substring(0, separator) : body;
            reason = separator >= 0 ? body.Substring(separator + 1) : "";
            if (!int.TryParse(codeText, NumberStyles.Integer, CultureInfo.InvariantCulture, out code))
            {
                code = WebSocketCloseCodes.Abnormal;
            }
        }
    }
}
#endif
