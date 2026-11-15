using System.IO;
using System.Globalization;
using System.Text.RegularExpressions;
using MissionForge.Net;
using NUnit.Framework;
using UnityEngine;

namespace MissionForge.Tests.Net
{
    /// <summary>
    /// The WebGL keepalive lives in browser JavaScript (T040); these tests pin the values that
    /// must agree between the jslib and <see cref="RoomClient"/> so the two cannot drift apart.
    /// </summary>
    public sealed class JsLibKeepaliveContractTests
    {
        private static string ReadJsLib()
        {
            string path = Path.Combine(Application.dataPath, "MissionForge", "Net", "Plugins", "MissionForgeWebSocket.jslib");
            Assert.IsTrue(File.Exists(path), "jslib not found at " + path);
            return File.ReadAllText(path);
        }

        [Test]
        public void JsKeepaliveClientTime_MatchesRoomClient()
        {
            string expected = "KEEPALIVE_CLIENT_TIME_MS: " + RoomClient.KeepaliveClientTimeMs.ToString(CultureInfo.InvariantCulture) + ",";

            StringAssert.Contains(expected, ReadJsLib());
        }

        [Test]
        public void JsKeepalive_StartsOnlyAfterHelloOk_AndRenumbersSeq()
        {
            string js = ReadJsLib();

            StringAssert.Contains("HELLO_OK_MARKER: '\"hello.ok\"'", js, "no ping before the handshake (HANDSHAKE_REQUIRED is fatal)");
            StringAssert.Contains("renumber: function", js, "C# frames must stay above the keepalive's seq");
            StringAssert.Contains("new Worker(", js, "the timer must run in a Web Worker, which browsers throttle less");
        }

        [Test]
        public void KeepaliveIdleThreshold_StaysBelowTheServerIdleTimeout()
        {
            // The keepalive ticks every heartbeat / 2 and sends once the socket was idle for
            // KEEPALIVE_IDLE_FACTOR x heartbeat, so the longest silence is (factor + 0.5) x heartbeat.
            const double idleTimeoutMs = 15000.0;
            Match factor = Regex.Match(ReadJsLib(), @"KEEPALIVE_IDLE_FACTOR:\s*([0-9.]+),");
            Assert.IsTrue(factor.Success, "KEEPALIVE_IDLE_FACTOR not found in the jslib");

            double idleFactor = double.Parse(factor.Groups[1].Value, CultureInfo.InvariantCulture);
            double worstGapMs = ProtocolNames.Defaults.HeartbeatMs * (idleFactor + 0.5);

            Assert.Less(worstGapMs, idleTimeoutMs);
        }
    }
}
