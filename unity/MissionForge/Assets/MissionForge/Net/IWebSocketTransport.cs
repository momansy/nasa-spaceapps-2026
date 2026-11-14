using System;

namespace MissionForge.Net
{
    /// <summary>Lifecycle state of an <see cref="IWebSocketTransport"/>.</summary>
    public enum TransportState
    {
        /// <summary>Not connected. The initial state and the state after <see cref="IWebSocketTransport.Closed"/>.</summary>
        Closed,

        /// <summary><see cref="IWebSocketTransport.Connect"/> was called and the handshake is in progress.</summary>
        Connecting,

        /// <summary>Connected; text frames can be sent and received.</summary>
        Open,

        /// <summary><see cref="IWebSocketTransport.Close"/> was called and the closing handshake is in progress.</summary>
        Closing,
    }

    /// <summary>
    /// Text-only WebSocket connection. All events are raised on the thread that calls
    /// <see cref="Pump"/> (the Unity main thread), never on a background thread.
    /// </summary>
    public interface IWebSocketTransport : IDisposable
    {
        /// <summary>Current state. It only changes inside <see cref="Connect"/>, <see cref="Close"/> and <see cref="Pump"/>.</summary>
        TransportState State { get; }

        /// <summary>Raised once the connection is open.</summary>
        event Action Opened;

        /// <summary>Raised for every complete text message received.</summary>
        event Action<string> TextReceived;

        /// <summary>
        /// Raised exactly once per connection attempt when it ends, with the WebSocket close code
        /// (1006 when the connection failed or dropped without a close frame) and reason.
        /// </summary>
        event Action<int, string> Closed;

        /// <summary>Raised with a description of a transport fault. Fatal faults are followed by <see cref="Closed"/>.</summary>
        event Action<string> Error;

        /// <summary>
        /// Starts connecting to a ws:// or wss:// URL. Connection failures are reported through
        /// <see cref="Error"/> and <see cref="Closed"/>, never thrown.
        /// </summary>
        void Connect(string url);

        /// <summary>Queues a text message. Reports <see cref="Error"/> when the transport is not open.</summary>
        void Send(string text);

        /// <summary>Starts a graceful close. <see cref="Closed"/> follows from a later <see cref="Pump"/>.</summary>
        void Close(int code = 1000, string reason = "");

        /// <summary>Dispatches queued events on the calling (main) thread. Call once per frame.</summary>
        void Pump();
    }
}
