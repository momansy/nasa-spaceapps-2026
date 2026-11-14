using System;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace MissionForge.Net
{
    /// <summary>Tolerant conversion of envelope payloads into the DTOs of RoomModels.cs.</summary>
    public static class ProtocolJson
    {
        private static readonly JsonSerializer Serializer = JsonSerializer.Create(new JsonSerializerSettings
        {
            MissingMemberHandling = MissingMemberHandling.Ignore,
            NullValueHandling = NullValueHandling.Ignore,
            DateParseHandling = DateParseHandling.None,
        });

        /// <summary>
        /// Converts a payload into <typeparamref name="T"/>. Unknown fields and JSON nulls are
        /// ignored and missing fields keep the DTO defaults (messages.md 2: receivers must ignore
        /// unknown fields). Wrongly typed fields fail the read.
        /// </summary>
        /// <returns>True when <paramref name="dto"/> was produced; otherwise <paramref name="error"/> says why not.</returns>
        public static bool TryRead<T>(JObject data, out T dto, out string error) where T : class
        {
            dto = null;
            error = null;

            if (data == null)
            {
                error = "Payload is missing.";
                return false;
            }

            try
            {
                dto = data.ToObject<T>(Serializer);
            }
            catch (Exception ex) when (ex is JsonException || ex is FormatException || ex is InvalidCastException || ex is OverflowException)
            {
                dto = null;
                error = "Payload does not match " + typeof(T).Name + ": " + ex.Message;
                return false;
            }

            if (dto == null)
            {
                error = "Payload does not match " + typeof(T).Name + ".";
                return false;
            }

            var normalizable = dto as INormalizable;
            if (normalizable != null)
            {
                normalizable.Normalize();
            }

            return true;
        }
    }
}
