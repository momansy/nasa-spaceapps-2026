using System;
using System.Collections.Generic;
using MissionForge.Net;

namespace MissionForge.Tests.Net
{
    /// <summary>
    /// In-memory <see cref="IWebSocketTransport"/> for tests: records what the client does and
    /// lets a test raise the transport events by hand.
    /// </summary>
    public sealed class FakeTransport : IWebSocketTransport
    {
        /// <summary>Frames passed to <see cref="Send"/>, in order.</summary>
        public readonly List<string> Sent = new List<string>();

        private readonly Queue<string> _queuedForPump = new Queue<string>();

        public string ConnectedUrl { get; private set; }

        public int PumpCount { get; private set; }

        public int CloseCount { get; private set; }

        public int LastCloseCode { get; private set; }

        public bool IsDisposed { get; private set; }

        public TransportState State { get; private set; }

        public event Action Opened;

        public event Action<string> TextReceived;

        public event Action<int, string> Closed;

        public event Action<string> Error;

        public void Connect(string url)
        {
            ConnectedUrl = url;
            State = TransportState.Connecting;
        }

        public void Send(string text)
        {
            Sent.Add(text);
        }

        public void Close(int code = 1000, string reason = "")
        {
            CloseCount++;
            LastCloseCode = code;
            State = TransportState.Closing;
        }

        public void Pump()
        {
            PumpCount++;
            while (_queuedForPump.Count > 0)
            {
                TextReceived?.Invoke(_queuedForPump.Dequeue());
            }
        }

        /// <summary>
        /// Queues an incoming text frame that is delivered on the next <see cref="Pump"/>, like the
        /// WebGL bridge, whose events wait in JavaScript until the Unity frame loop polls them.
        /// </summary>
        public void QueueTextForPump(string text)
        {
            _queuedForPump.Enqueue(text);
        }

        public void Dispose()
        {
            IsDisposed = true;
        }

        /// <summary>Simulates a completed handshake.</summary>
        public void RaiseOpened()
        {
            State = TransportState.Open;
            Opened?.Invoke();
        }

        /// <summary>Simulates an incoming text frame.</summary>
        public void RaiseText(string text)
        {
            TextReceived?.Invoke(text);
        }

        /// <summary>Simulates the connection ending.</summary>
        public void RaiseClosed(int code, string reason)
        {
            State = TransportState.Closed;
            Closed?.Invoke(code, reason);
        }

        /// <summary>Simulates a transport fault; pass <paramref name="leaveClosed"/> to also drop the connection without a Closed event.</summary>
        public void RaiseError(string message, bool leaveClosed = false)
        {
            if (leaveClosed)
            {
                State = TransportState.Closed;
            }

            Error?.Invoke(message);
        }
    }
}
