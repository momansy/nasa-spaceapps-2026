using System;
using System.IO;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace MissionForge.Net
{
    /// <summary>One protocol message: <c>{"t":"&lt;type&gt;","seq":&lt;int&gt;,"d":{...}}</c>.</summary>
    public sealed class Envelope
    {
        /// <summary>Message type, for example <c>room.state</c>.</summary>
        public string Type;

        /// <summary>Sender-assigned sequence number.</summary>
        public int Seq;

        /// <summary>Payload object. Never null after a successful decode.</summary>
        public JObject Data;
    }

    /// <summary>Encodes and decodes <see cref="Envelope"/> JSON text frames.</summary>
    public static class EnvelopeCodec
    {
        /// <summary>Encodes an envelope as compact JSON with properties in the order t, seq, d.</summary>
        /// <exception cref="ArgumentNullException"><paramref name="envelope"/> is null.</exception>
        /// <exception cref="ArgumentException">The envelope has no type.</exception>
        public static string Encode(Envelope envelope)
        {
            if (envelope == null)
            {
                throw new ArgumentNullException(nameof(envelope));
            }

            return Encode(envelope.Type, envelope.Seq, envelope.Data);
        }

        /// <summary>
        /// Encodes a message as compact JSON with properties in the order t, seq, d.
        /// </summary>
        /// <param name="type">Message type; must not be empty.</param>
        /// <param name="seq">Sequence number.</param>
        /// <param name="payload">
        /// Null (encoded as <c>{}</c>), a <see cref="JObject"/>, or any object that Json.NET
        /// serializes to a JSON object.
        /// </param>
        /// <exception cref="ArgumentException">
        /// <paramref name="type"/> is empty or <paramref name="payload"/> does not serialize to a JSON object.
        /// </exception>
        public static string Encode(string type, int seq, object payload)
        {
            if (string.IsNullOrEmpty(type))
            {
                throw new ArgumentException("Envelope type must not be empty.", nameof(type));
            }

            var root = new JObject
            {
                { ProtocolNames.EnvelopeFields.Type, type },
                { ProtocolNames.EnvelopeFields.Seq, seq },
                { ProtocolNames.EnvelopeFields.Data, ToDataObject(payload) },
            };
            return root.ToString(Formatting.None);
        }

        /// <summary>
        /// Decodes a text frame. Rejects non-object JSON, a missing or non-string <c>t</c>, a missing
        /// or non-integer <c>seq</c> and a <c>d</c> that is not an object. A missing or null
        /// <c>d</c> becomes an empty object.
        /// </summary>
        /// <returns>True when <paramref name="envelope"/> was produced; otherwise <paramref name="error"/> says why not.</returns>
        public static bool TryDecode(string json, out Envelope envelope, out string error)
        {
            envelope = null;
            error = null;

            if (string.IsNullOrEmpty(json))
            {
                error = "Frame is empty.";
                return false;
            }

            JToken root;
            try
            {
                root = Parse(json);
            }
            catch (JsonException ex)
            {
                error = "Frame is not valid JSON: " + ex.Message;
                return false;
            }

            var obj = root as JObject;
            if (obj == null)
            {
                error = "Frame must be a JSON object but was " + root.Type + ".";
                return false;
            }

            JToken typeToken = obj[ProtocolNames.EnvelopeFields.Type];
            if (typeToken == null || typeToken.Type != JTokenType.String)
            {
                error = "Envelope is missing the string property \"" + ProtocolNames.EnvelopeFields.Type + "\".";
                return false;
            }

            var type = (string)typeToken;
            if (type.Length == 0)
            {
                error = "Envelope property \"" + ProtocolNames.EnvelopeFields.Type + "\" must not be empty.";
                return false;
            }

            int seq;
            if (!TryReadSeq(obj[ProtocolNames.EnvelopeFields.Seq], out seq))
            {
                error = "Envelope is missing the 32-bit integer property \"" + ProtocolNames.EnvelopeFields.Seq + "\".";
                return false;
            }

            JObject data;
            JToken dataToken = obj[ProtocolNames.EnvelopeFields.Data];
            if (dataToken == null || dataToken.Type == JTokenType.Null)
            {
                data = new JObject();
            }
            else if (dataToken.Type == JTokenType.Object)
            {
                data = (JObject)dataToken;
            }
            else
            {
                error = "Envelope property \"" + ProtocolNames.EnvelopeFields.Data + "\" must be an object but was " + dataToken.Type + ".";
                return false;
            }

            envelope = new Envelope { Type = type, Seq = seq, Data = data };
            return true;
        }

        private static JToken Parse(string json)
        {
            // DateParseHandling.None keeps ISO-date-looking strings as plain strings.
            using (var reader = new JsonTextReader(new StringReader(json)) { DateParseHandling = DateParseHandling.None })
            {
                JToken root = JToken.ReadFrom(reader);
                while (reader.Read())
                {
                    if (reader.TokenType != JsonToken.Comment)
                    {
                        throw new JsonReaderException("Additional text found after the JSON value.");
                    }
                }

                return root;
            }
        }

        private static bool TryReadSeq(JToken token, out int seq)
        {
            seq = 0;
            if (token == null || token.Type != JTokenType.Integer)
            {
                return false;
            }

            // Integers that do not fit in a long are parsed as BigInteger; treat them as invalid.
            object raw = ((JValue)token).Value;
            if (!(raw is long))
            {
                return false;
            }

            var value = (long)raw;
            if (value < int.MinValue || value > int.MaxValue)
            {
                return false;
            }

            seq = (int)value;
            return true;
        }

        private static JObject ToDataObject(object payload)
        {
            if (payload == null)
            {
                return new JObject();
            }

            var existing = payload as JObject;
            if (existing != null)
            {
                return existing;
            }

            JToken token;
            try
            {
                token = JToken.FromObject(payload);
            }
            catch (JsonException ex)
            {
                throw new ArgumentException("Payload could not be serialized: " + ex.Message, nameof(payload), ex);
            }

            var obj = token as JObject;
            if (obj == null)
            {
                throw new ArgumentException("Payload must serialize to a JSON object but was " + token.Type + ".", nameof(payload));
            }

            return obj;
        }
    }
}
