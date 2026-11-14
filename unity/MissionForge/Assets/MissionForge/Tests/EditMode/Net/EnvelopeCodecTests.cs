using System;
using MissionForge.Net;
using Newtonsoft.Json.Linq;
using NUnit.Framework;

namespace MissionForge.Tests.Net
{
    public sealed class EnvelopeCodecTests
    {
        [Test]
        public void Encode_ProducesCompactJsonInTypeSeqDataOrder()
        {
            var payload = new JObject { { "code", "ABCD" }, { "players", 3 } };

            string json = EnvelopeCodec.Encode("room.state", 7, payload);

            Assert.AreEqual("{\"t\":\"room.state\",\"seq\":7,\"d\":{\"code\":\"ABCD\",\"players\":3}}", json);
        }

        [Test]
        public void Encode_NullPayload_WritesEmptyDataObject()
        {
            string json = EnvelopeCodec.Encode("ping", 1, null);

            Assert.AreEqual("{\"t\":\"ping\",\"seq\":1,\"d\":{}}", json);
        }

        [Test]
        public void Encode_PlainObjectPayload_IsSerializedAsJsonObject()
        {
            string json = EnvelopeCodec.Encode("phase.set", 2, new PhasePayload { phase = "BRIEFING" });

            Assert.AreEqual("{\"t\":\"phase.set\",\"seq\":2,\"d\":{\"phase\":\"BRIEFING\"}}", json);
        }

        [Test]
        public void Encode_Envelope_MatchesTheFieldOverload()
        {
            var envelope = new Envelope { Type = "vote.cast", Seq = 12, Data = new JObject { { "option", 2 } } };

            string json = EnvelopeCodec.Encode(envelope);

            Assert.AreEqual("{\"t\":\"vote.cast\",\"seq\":12,\"d\":{\"option\":2}}", json);
        }

        [Test]
        public void Encode_RejectsEmptyTypeAndNonObjectPayloads()
        {
            Assert.Throws<ArgumentException>(() => EnvelopeCodec.Encode("", 1, null));
            Assert.Throws<ArgumentException>(() => EnvelopeCodec.Encode(null, 1, null));
            Assert.Throws<ArgumentException>(() => EnvelopeCodec.Encode("x", 1, new[] { 1, 2, 3 }));
            Assert.Throws<ArgumentException>(() => EnvelopeCodec.Encode("x", 1, "just a string"));
            Assert.Throws<ArgumentNullException>(() => EnvelopeCodec.Encode(null));
        }

        [Test]
        public void EncodeThenDecode_RoundTripsTypeSeqAndNestedUnicodeData()
        {
            var data = new JObject
            {
                { "nickname", "Nóva ✓ 🚀 \"quoted\"" },
                { "when", "2026-11-14T12:00:00Z" },
                { "nested", new JObject { { "list", new JArray(1, 2.5, "three", null, true) }, { "deep", new JObject { { "k", -4 } } } } },
            };

            string json = EnvelopeCodec.Encode("room.join", 2147483647, data);
            Envelope decoded;
            string error;
            bool ok = EnvelopeCodec.TryDecode(json, out decoded, out error);

            Assert.IsTrue(ok, error);
            Assert.IsNull(error);
            Assert.AreEqual("room.join", decoded.Type);
            Assert.AreEqual(2147483647, decoded.Seq);
            Assert.IsTrue(JToken.DeepEquals(data, decoded.Data), "data changed in the round trip: " + decoded.Data);
            Assert.AreEqual(JTokenType.String, decoded.Data["when"].Type, "date-like strings must stay strings");
        }

        [Test]
        public void TryDecode_MissingData_BecomesEmptyObject()
        {
            Envelope decoded;
            string error;

            Assert.IsTrue(EnvelopeCodec.TryDecode("{\"t\":\"pong\",\"seq\":3}", out decoded, out error), error);

            Assert.IsNotNull(decoded.Data);
            Assert.AreEqual(0, decoded.Data.Count);
        }

        [Test]
        public void TryDecode_NullData_BecomesEmptyObject()
        {
            Envelope decoded;
            string error;

            Assert.IsTrue(EnvelopeCodec.TryDecode("{\"t\":\"pong\",\"seq\":3,\"d\":null}", out decoded, out error), error);

            Assert.AreEqual(0, decoded.Data.Count);
        }

        [Test]
        public void TryDecode_AcceptsWhitespaceAnyPropertyOrderAndUnknownProperties()
        {
            Envelope decoded;
            string error;
            const string json = " { \"d\" : { \"a\" : 1 } , \"extra\" : [1] , \"seq\" : -5 , \"t\" : \"x.y\" } ";

            Assert.IsTrue(EnvelopeCodec.TryDecode(json, out decoded, out error), error);

            Assert.AreEqual("x.y", decoded.Type);
            Assert.AreEqual(-5, decoded.Seq);
            Assert.AreEqual(1, (int)decoded.Data["a"]);
        }

        [TestCase(null, TestName = "TryDecode_Rejects_Null")]
        [TestCase("", TestName = "TryDecode_Rejects_EmptyString")]
        [TestCase("not json at all", TestName = "TryDecode_Rejects_Garbage")]
        [TestCase("{\"t\":\"a\",\"seq\":1", TestName = "TryDecode_Rejects_TruncatedJson")]
        [TestCase("{\"t\":\"a\",\"seq\":1} trailing", TestName = "TryDecode_Rejects_TrailingText")]
        [TestCase("[1,2,3]", TestName = "TryDecode_Rejects_ArrayRoot")]
        [TestCase("\"text\"", TestName = "TryDecode_Rejects_StringRoot")]
        [TestCase("42", TestName = "TryDecode_Rejects_NumberRoot")]
        [TestCase("null", TestName = "TryDecode_Rejects_NullRoot")]
        [TestCase("{\"seq\":1,\"d\":{}}", TestName = "TryDecode_Rejects_MissingType")]
        [TestCase("{\"t\":5,\"seq\":1,\"d\":{}}", TestName = "TryDecode_Rejects_NumericType")]
        [TestCase("{\"t\":null,\"seq\":1,\"d\":{}}", TestName = "TryDecode_Rejects_NullType")]
        [TestCase("{\"t\":\"\",\"seq\":1,\"d\":{}}", TestName = "TryDecode_Rejects_EmptyType")]
        [TestCase("{\"t\":\"a\",\"d\":{}}", TestName = "TryDecode_Rejects_MissingSeq")]
        [TestCase("{\"t\":\"a\",\"seq\":\"1\",\"d\":{}}", TestName = "TryDecode_Rejects_StringSeq")]
        [TestCase("{\"t\":\"a\",\"seq\":1.5,\"d\":{}}", TestName = "TryDecode_Rejects_FractionalSeq")]
        [TestCase("{\"t\":\"a\",\"seq\":1.0,\"d\":{}}", TestName = "TryDecode_Rejects_FloatSeq")]
        [TestCase("{\"t\":\"a\",\"seq\":null,\"d\":{}}", TestName = "TryDecode_Rejects_NullSeq")]
        [TestCase("{\"t\":\"a\",\"seq\":true,\"d\":{}}", TestName = "TryDecode_Rejects_BooleanSeq")]
        [TestCase("{\"t\":\"a\",\"seq\":2147483648,\"d\":{}}", TestName = "TryDecode_Rejects_SeqAboveInt32")]
        [TestCase("{\"t\":\"a\",\"seq\":99999999999999999999999,\"d\":{}}", TestName = "TryDecode_Rejects_HugeSeq")]
        [TestCase("{\"t\":\"a\",\"seq\":1,\"d\":[1]}", TestName = "TryDecode_Rejects_ArrayData")]
        [TestCase("{\"t\":\"a\",\"seq\":1,\"d\":\"text\"}", TestName = "TryDecode_Rejects_StringData")]
        public void TryDecode_RejectsInvalidFrames(string json)
        {
            Envelope decoded;
            string error;

            bool ok = EnvelopeCodec.TryDecode(json, out decoded, out error);

            Assert.IsFalse(ok);
            Assert.IsNull(decoded);
            Assert.IsFalse(string.IsNullOrEmpty(error), "a rejection must explain itself");
        }

        private sealed class PhasePayload
        {
            public string phase;
        }
    }
}
