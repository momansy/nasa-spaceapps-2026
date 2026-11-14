using System.Text;

namespace MissionForge.Net
{
    /// <summary>WebSocket close codes (RFC 6455 section 7.4) used by the transports and the room client.</summary>
    public static class WebSocketCloseCodes
    {
        /// <summary>Normal, intentional closure.</summary>
        public const int Normal = 1000;

        /// <summary>The peer closed without giving a status code.</summary>
        public const int NoStatus = 1005;

        /// <summary>The connection failed or dropped without a close frame.</summary>
        public const int Abnormal = 1006;

        // Room-server close codes: each ByeReason has a fixed code (messages.md 15, ByeReason),
        // and the WebSocket close code equals bye.closeCode.

        /// <summary>ROOM_CLOSED: the host sent <c>room.close</c>.</summary>
        public const int RoomClosed = 4000;

        /// <summary>VERSION_MISMATCH.</summary>
        public const int VersionMismatch = 4001;

        /// <summary>KICKED (players only).</summary>
        public const int Kicked = 4002;

        /// <summary>REPLACED: the same token resumed on a newer connection.</summary>
        public const int Replaced = 4003;

        /// <summary>ROOM_EXPIRED: the host stayed away longer than the room hold time.</summary>
        public const int RoomExpired = 4004;

        /// <summary>HANDSHAKE_TIMEOUT: no hello within 5 s, or no room.create/join/resume within 30 s.</summary>
        public const int HandshakeTimeout = 4005;

        /// <summary>FLOOD.</summary>
        public const int Flood = 4006;

        /// <summary>PROTOCOL_VIOLATION: a fatal error.</summary>
        public const int ProtocolViolation = 4007;

        /// <summary>SERVER_SHUTDOWN.</summary>
        public const int ServerShutdown = 4008;

        /// <summary>LEFT: acknowledges <c>room.leave</c>.</summary>
        public const int Left = 4009;

        /// <summary>IDLE_TIMEOUT: no frame for 15 s.</summary>
        public const int IdleTimeout = 4010;

        /// <summary>
        /// True for room-server close codes whose <c>bye.canResume</c> is false (the token is no
        /// longer valid): 4000–4005 and 4009. Used when a close arrives without a readable <c>bye</c>.
        /// </summary>
        public static bool RevokesToken(int code)
        {
            return (code >= RoomClosed && code <= HandshakeTimeout) || code == Left;
        }

        /// <summary>A close frame's reason is limited to 123 UTF-8 bytes.</summary>
        internal const int MaxReasonBytes = 123;

        /// <summary>Shortens a close reason to the protocol limit without splitting a character.</summary>
        internal static string TruncateReason(string reason)
        {
            string value = reason ?? "";
            if (Encoding.UTF8.GetByteCount(value) <= MaxReasonBytes)
            {
                return value;
            }

            int length = value.Length;
            while (length > 0 && Encoding.UTF8.GetByteCount(value.Substring(0, length)) > MaxReasonBytes)
            {
                length--;
            }

            if (length > 0 && char.IsHighSurrogate(value[length - 1]))
            {
                length--;
            }

            return value.Substring(0, length);
        }
    }
}
