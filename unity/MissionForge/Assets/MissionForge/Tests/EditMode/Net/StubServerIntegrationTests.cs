#if !UNITY_WEBGL || UNITY_EDITOR
using System;
using System.Diagnostics;
using System.IO;
using System.Net.WebSockets;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using MissionForge.Net;
using NUnit.Framework;

namespace MissionForge.Tests.Net
{
    /// <summary>
    /// End-to-end test of <see cref="RoomClient"/> over a real <see cref="ManagedWebSocketTransport"/>
    /// against the Node stub server in Tools~/stub-server. Ignored when Node.js is not installed.
    /// </summary>
    public sealed class StubServerIntegrationTests
    {
        /// <summary>Optional override of the stub script path (used on CI and outside the Editor).</summary>
        private const string StubPathEnvironmentVariable = "MISSIONFORGE_STUB_SERVER";

        private const string ListeningPrefix = "LISTENING ";
        private const string PhoneNickname = "Nova";
        private const string PhoneSuit = "suit_orange";
        private const int ServerStartTimeoutMs = 10000;
        private const int ProcessExitTimeoutMs = 5000;
        private const int PollIntervalMs = 10;
        private static readonly TimeSpan StepTimeout = TimeSpan.FromSeconds(10);

        private static readonly string[] StubRelativePath = { "Tools~", "stub-server", "server.mjs" };
        private static readonly string[] WellKnownNodePaths = { "/opt/homebrew/bin/node", "/usr/local/bin/node", "/usr/bin/node" };

        private readonly Stopwatch _clock = new Stopwatch();
        private Process _server;
        private RoomClient _client;
        private ClientWebSocket _phone;

        [TearDown]
        public void TearDown()
        {
            if (_client != null)
            {
                _client.Disconnect();
                _client = null;
            }

            if (_phone != null)
            {
                _phone.Dispose();
                _phone = null;
            }

            KillServer();
        }

        [Test, Category("Integration")]
        public void Host_CreatesRoom_SeesPhoneJoin_AndReconnectsWhenTheServerDies()
        {
            string script = LocateStubScript();
            if (script == null)
            {
                Assert.Ignore("Stub server script not found (looked for Tools~/stub-server/server.mjs above the project's Assets folder).");
            }

            string node = FindNode();
            if (node == null)
            {
                Assert.Ignore("Node.js was not found on PATH or in the usual install locations; install Node 22+ to run this test.");
            }

            int port = StartServer(node, script);
            _clock.Restart();

            // Host connects with the real transport.
            RoomCreatedDto created = null;
            RoomStateDto lastState = null;
            var faults = new StringBuilder();
            _client = new RoomClient(() => new ManagedWebSocketTransport(), new BackoffPolicy(baseSeconds: 0.2, maxSeconds: 1));
            _client.RoomCreated += dto => created = dto;
            _client.RoomStateChanged += dto => lastState = dto;
            _client.ProtocolError += message => faults.AppendLine("protocol: " + message);
            _client.TransportError += message => faults.AppendLine("transport: " + message);
            _client.Connect("ws://127.0.0.1:" + port);
            WaitUntil(() => _client.State == ConnectionState.Connected, "host to connect", faults);

            // Host creates a room; the snapshot (settings.state, room.state, roles.state, snapshot.end) follows.
            _client.CreateRoom();
            WaitUntil(() => created != null && lastState != null && !_client.IsReceivingSnapshot, "room.created and its snapshot", faults);
            string codePattern = "^[" + ProtocolNames.RoomCodeAlphabet + "]{" + ProtocolNames.RoomCodeLength + "}$";
            Assert.IsTrue(Regex.IsMatch(created.Room, codePattern), "unexpected room code \"" + created.Room + "\"");
            Assert.AreEqual(created.Room, _client.RoomCode);
            Assert.AreEqual(created.Room, lastState.Room);
            StringAssert.EndsWith("?room=" + created.Room, _client.JoinUrl);
            Assert.AreEqual(0, lastState.Players.Count);
            Assert.IsNotNull(_client.LastSettings);
            Assert.IsNotNull(_client.LastRolesState);

            // A phone joins through a second, raw WebSocket: hello, then room.join.
            string helloFrame = EnvelopeCodec.Encode(ProtocolNames.Messages.Hello, 1, new HelloDto
            {
                Client = ProtocolNames.ClientKinds.Phone,
                AppVersion = "test",
            });
            string joinFrame = EnvelopeCodec.Encode(ProtocolNames.Messages.RoomJoin, 2, new Newtonsoft.Json.Linq.JObject
            {
                { ProtocolNames.Fields.Room, created.Room },
                { ProtocolNames.Fields.As, ProtocolNames.ConnKinds.Player },
                { ProtocolNames.Fields.Nickname, PhoneNickname },
                { ProtocolNames.Fields.Avatar, Newtonsoft.Json.Linq.JObject.FromObject(new AvatarDto { SuitId = PhoneSuit, PatchId = "patch_comet" }) },
            });
            Task<ClientWebSocket> joining = Task.Run(() => JoinAsPhoneAsync(port, helloFrame, joinFrame));
            WaitUntil(() => joining.IsCompleted, "the phone to connect and send hello + room.join", faults);
            Assert.IsNull(joining.Exception, "phone failed: " + joining.Exception);
            _phone = joining.Result;

            WaitUntil(() => HasPlayer(lastState, PhoneNickname), "room.state containing the phone's nickname", faults);
            PlayerInfoDto player = lastState.Players.Find(p => p.Nickname == PhoneNickname);
            Assert.IsTrue(player.Connected);
            Assert.AreEqual(1, player.Slot);
            Assert.AreEqual(PhoneSuit, player.Avatar.SuitId);
            Assert.AreEqual(ConnectionState.Connected, _client.State);
            Assert.AreEqual(0, faults.Length, "unexpected faults before the server was killed:\n" + faults);

            // The server dies: the host must notice and start reconnecting.
            KillServer();
            WaitUntil(() => _client.State == ConnectionState.Reconnecting, "the host to enter Reconnecting", faults);
            Assert.GreaterOrEqual(_client.ReconnectAttempts, 1);
            Assert.AreEqual(created.Room, _client.RoomCode, "the room is remembered for room.resume");
        }

        private static bool HasPlayer(RoomStateDto state, string nickname)
        {
            return state != null && state.Players.Exists(p => p.Nickname == nickname);
        }

        /// <summary>Ticks the client until the condition holds; fails the test on timeout.</summary>
        private void WaitUntil(Func<bool> condition, string description, StringBuilder faults)
        {
            TimeSpan deadline = _clock.Elapsed + StepTimeout;
            while (!condition() && _clock.Elapsed < deadline)
            {
                _client.Tick(_clock.Elapsed.TotalSeconds);
                Thread.Sleep(PollIntervalMs);
            }

            Assert.IsTrue(condition(), "Timed out waiting for " + description + ". State: " + _client.State + ". Faults:\n" + faults);
        }

        private static async Task<ClientWebSocket> JoinAsPhoneAsync(int port, params string[] frames)
        {
            var socket = new ClientWebSocket();
            try
            {
                using (var timeout = new CancellationTokenSource(StepTimeout))
                {
                    await socket.ConnectAsync(new Uri("ws://127.0.0.1:" + port), timeout.Token).ConfigureAwait(false);
                    foreach (string frame in frames)
                    {
                        byte[] bytes = Encoding.UTF8.GetBytes(frame);
                        await socket.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, timeout.Token).ConfigureAwait(false);
                    }
                }

                return socket;
            }
            catch
            {
                socket.Dispose();
                throw;
            }
        }

        private static string LocateStubScript()
        {
            string overridePath = Environment.GetEnvironmentVariable(StubPathEnvironmentVariable);
            if (!string.IsNullOrEmpty(overridePath))
            {
                return File.Exists(overridePath) ? overridePath : null;
            }

            for (var dir = new DirectoryInfo(UnityEngine.Application.dataPath); dir != null; dir = dir.Parent)
            {
                string candidate = Path.Combine(dir.FullName, Path.Combine(StubRelativePath));
                if (File.Exists(candidate))
                {
                    return candidate;
                }
            }

            return null;
        }

        private static string FindNode()
        {
            bool isWindows = Path.DirectorySeparatorChar == '\\';
            string executable = isWindows ? "node.exe" : "node";
            string pathVariable = Environment.GetEnvironmentVariable("PATH") ?? "";
            foreach (string dir in pathVariable.Split(new[] { Path.PathSeparator }, StringSplitOptions.RemoveEmptyEntries))
            {
                string candidate = Path.Combine(dir.Trim(), executable);
                if (File.Exists(candidate))
                {
                    return candidate;
                }
            }

            // The Editor is often launched without the shell's PATH (for example from Unity Hub on macOS).
            foreach (string candidate in WellKnownNodePaths)
            {
                if (File.Exists(candidate))
                {
                    return candidate;
                }
            }

            return null;
        }

        /// <summary>Starts the stub on a free port and returns the port it printed.</summary>
        private int StartServer(string node, string script)
        {
            var startInfo = new ProcessStartInfo
            {
                FileName = node,
                Arguments = "\"" + script + "\" --port 0",
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true,
            };

            int port = 0;
            var stderr = new StringBuilder();
            var listening = new ManualResetEventSlim(false);
            var process = new Process { StartInfo = startInfo };
            process.OutputDataReceived += (sender, args) =>
            {
                string line = args.Data;
                if (line == null || !line.StartsWith(ListeningPrefix, StringComparison.Ordinal))
                {
                    return;
                }

                if (int.TryParse(line.Substring(ListeningPrefix.Length).Trim(), out port))
                {
                    listening.Set();
                }
            };
            process.ErrorDataReceived += (sender, args) =>
            {
                if (args.Data != null)
                {
                    lock (stderr)
                    {
                        stderr.AppendLine(args.Data);
                    }
                }
            };

            _server = process;
            process.Start();
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();

            if (!listening.Wait(ServerStartTimeoutMs))
            {
                string errors;
                lock (stderr)
                {
                    errors = stderr.ToString();
                }

                Assert.Fail("The stub server did not print \"" + ListeningPrefix + "<port>\" within " + ServerStartTimeoutMs + " ms. stderr:\n" + errors);
            }

            return port;
        }

        private void KillServer()
        {
            Process process = _server;
            if (process == null)
            {
                return;
            }

            _server = null;
            try
            {
                if (!process.HasExited)
                {
                    process.Kill();
                    process.WaitForExit(ProcessExitTimeoutMs);
                }
            }
            catch (InvalidOperationException)
            {
                // The process exited between the HasExited check and Kill; nothing is left to stop.
            }
            finally
            {
                process.Dispose();
            }
        }
    }
}
#endif
