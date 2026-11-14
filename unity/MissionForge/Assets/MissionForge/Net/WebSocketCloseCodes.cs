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
