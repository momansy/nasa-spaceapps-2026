using System.Collections.Generic;
using MissionForge.Net;
using Newtonsoft.Json.Linq;
using NUnit.Framework;

namespace MissionForge.Tests.Net
{
    public sealed class RoomClientTests
    {
        private const string Url = "ws://test.invalid:8787";
        private const double BackoffBaseSeconds = 0.5;
        private const double Epsilon = 0.001;

        private const string RoomCreatedFrame =
            "{\"t\":\"room.created\",\"seq\":1,\"d\":{\"code\":\"QRST\",\"hostToken\":\"tok-123\",\"joinUrl\":\"https://join.example/QRST\"}}";

        private const string RoomStateFrame =
            "{\"t\":\"room.state\",\"seq\":2,\"d\":{\"code\":\"QRST\",\"phase\":\"LOBBY\",\"players\":["
            + "{\"id\":\"p1\",\"nickname\":\"Nova\",\"avatar\":\"astro_03\",\"role\":\"FLIGHT\",\"connected\":true,\"spectator\":false},"
            + "{\"id\":\"p2\",\"nickname\":\"Orion\",\"avatar\":\"astro_01\",\"role\":null,\"connected\":false,\"spectator\":true}],"
            + "\"settings\":{\"roleMode\":\"pick\",\"assist\":\"engineer\",\"voteTimerS\":45,\"hiddenTallies\":true}}}";

        private List<FakeTransport> _transports;
        private List<ConnectionState> _states;
        private List<string> _protocolErrors;
        private RoomClient _client;

        [SetUp]
        public void SetUp()
        {
            _transports = new List<FakeTransport>();
            _states = new List<ConnectionState>();
            _protocolErrors = new List<string>();
            // No jitter, so reconnect delays are exactly 0.5 s, 1 s, 2 s...
            var backoff = new BackoffPolicy(baseSeconds: BackoffBaseSeconds, maxSeconds: 15, factor: 2, jitterFraction: 0);
            _client = new RoomClient(CreateTransport, backoff);
            _client.StateChanged += _states.Add;
            _client.ProtocolError += _protocolErrors.Add;
        }

        private IWebSocketTransport CreateTransport()
        {
            var transport = new FakeTransport();
            _transports.Add(transport);
            return transport;
        }

        private FakeTransport Latest
        {
            get { return _transports[_transports.Count - 1]; }
        }

        private FakeTransport ConnectAndOpen()
        {
            _client.Tick(0);
            _client.Connect(Url);
            Latest.RaiseOpened();
            return Latest;
        }

        private static Envelope Decode(string frame)
        {
            Envelope envelope;
            string error;
            Assert.IsTrue(EnvelopeCodec.TryDecode(frame, out envelope, out error), error);
            return envelope;
        }

        [Test]
        public void Connect_CreatesATransportAndReportsConnectingThenConnected()
        {
            Assert.AreEqual(ConnectionState.Disconnected, _client.State);

            _client.Connect(Url);

            Assert.AreEqual(1, _transports.Count);
            Assert.AreEqual(Url, Latest.ConnectedUrl);
            Assert.AreEqual(Url, _client.Url);
            Assert.AreEqual(ConnectionState.Connecting, _client.State);

            Latest.RaiseOpened();

            Assert.AreEqual(ConnectionState.Connected, _client.State);
            CollectionAssert.AreEqual(new[] { ConnectionState.Connecting, ConnectionState.Connected }, _states);
            Assert.AreEqual(0, Latest.Sent.Count, "nothing is sent just by connecting");
        }

        [Test]
        public void Tick_PumpsTheCurrentTransport()
        {
            FakeTransport transport = ConnectAndOpen();
            int before = transport.PumpCount;

            _client.Tick(0.1);
            _client.Tick(0.2);

            Assert.AreEqual(before + 2, transport.PumpCount);
        }

        [Test]
        public void CreateRoom_SendsRoomCreateEnvelopeWithSeqOne()
        {
            FakeTransport transport = ConnectAndOpen();

            _client.CreateRoom();

            Assert.AreEqual(1, transport.Sent.Count);
            Assert.AreEqual("{\"t\":\"room.create\",\"seq\":1,\"d\":{\"client\":\"host\",\"version\":1}}", transport.Sent[0]);
        }

        [Test]
        public void Send_ReturnsMonotonicSeqStartingAtOne()
        {
            FakeTransport transport = ConnectAndOpen();

            int first = _client.Send("vote.open", new JObject { { "id", "v1" } });
            int second = _client.Send("vote.open", null);
            _client.SetPhase("BRIEFING");
            _client.UpdateSettings(new JObject { { "voteTimerS", 45 } });

            Assert.AreEqual(1, first);
            Assert.AreEqual(2, second);
            Assert.AreEqual("{\"t\":\"vote.open\",\"seq\":1,\"d\":{\"id\":\"v1\"}}", transport.Sent[0]);
            Assert.AreEqual("{\"t\":\"vote.open\",\"seq\":2,\"d\":{}}", transport.Sent[1]);
            Assert.AreEqual("{\"t\":\"phase.set\",\"seq\":3,\"d\":{\"phase\":\"BRIEFING\"}}", transport.Sent[2]);
            Assert.AreEqual("{\"t\":\"room.settings\",\"seq\":4,\"d\":{\"voteTimerS\":45}}", transport.Sent[3]);
        }

        [Test]
        public void RoomCreatedAndRoomState_RaiseEventsAndSetRoomCode()
        {
            FakeTransport transport = ConnectAndOpen();
            RoomCreatedDto created = null;
            RoomStateDto state = null;
            var received = new List<string>();
            _client.RoomCreated += dto => created = dto;
            _client.RoomStateChanged += dto => state = dto;
            _client.MessageReceived += envelope => received.Add(envelope.Type);
            _client.CreateRoom();

            transport.RaiseText(RoomCreatedFrame);

            Assert.IsNotNull(created);
            Assert.AreEqual("QRST", created.Code);
            Assert.AreEqual("tok-123", created.HostToken);
            Assert.AreEqual("https://join.example/QRST", created.JoinUrl);
            Assert.AreEqual("QRST", _client.RoomCode);
            Assert.IsNull(_client.LastRoomState);

            transport.RaiseText(RoomStateFrame);

            Assert.IsNotNull(state);
            Assert.AreSame(state, _client.LastRoomState);
            Assert.AreEqual("QRST", state.Code);
            Assert.AreEqual("LOBBY", state.Phase);
            Assert.AreEqual(2, state.Players.Count);
            Assert.AreEqual("p1", state.Players[0].Id);
            Assert.AreEqual("Nova", state.Players[0].Nickname);
            Assert.AreEqual("astro_03", state.Players[0].Avatar);
            Assert.AreEqual("FLIGHT", state.Players[0].Role);
            Assert.IsTrue(state.Players[0].Connected);
            Assert.IsFalse(state.Players[0].Spectator);
            Assert.IsNull(state.Players[1].Role);
            Assert.IsFalse(state.Players[1].Connected);
            Assert.IsTrue(state.Players[1].Spectator);
            Assert.AreEqual("pick", state.Settings.RoleMode);
            Assert.AreEqual("engineer", state.Settings.Assist);
            Assert.AreEqual(45, state.Settings.VoteTimerS);
            Assert.IsTrue(state.Settings.HiddenTallies);
            CollectionAssert.AreEqual(new[] { "room.created", "room.state" }, received);
            Assert.AreEqual(0, _protocolErrors.Count);
        }

        [Test]
        public void RoomState_ToleratesUnknownMissingAndNullFields()
        {
            FakeTransport transport = ConnectAndOpen();
            RoomStateDto state = null;
            _client.RoomStateChanged += dto => state = dto;

            transport.RaiseText(
                "{\"t\":\"room.state\",\"seq\":1,\"d\":{\"code\":\"QRST\",\"futureField\":{\"x\":1},\"players\":[null,{\"nickname\":\"Vega\",\"badge\":7}],\"settings\":null}}");

            Assert.IsNotNull(state);
            Assert.AreEqual(0, _protocolErrors.Count);
            Assert.AreEqual("LOBBY", state.Phase, "a missing phase keeps the default");
            Assert.AreEqual(1, state.Players.Count, "null entries are removed");
            Assert.AreEqual("Vega", state.Players[0].Nickname);
            Assert.IsTrue(state.Players[0].Connected, "connected defaults to true");
            Assert.IsNotNull(state.Settings);
            Assert.AreEqual(30, state.Settings.VoteTimerS);

            transport.RaiseText("{\"t\":\"room.state\",\"seq\":2,\"d\":{}}");

            Assert.IsNotNull(state.Players);
            Assert.AreEqual(0, state.Players.Count);
        }

        [Test]
        public void MalformedFrames_RaiseProtocolErrorAndKeepTheConnection()
        {
            FakeTransport transport = ConnectAndOpen();
            int messages = 0;
            _client.MessageReceived += envelope => messages++;

            transport.RaiseText("this is not json");
            transport.RaiseText("{\"t\":\"room.state\"}");
            transport.RaiseText("{\"t\":\"room.state\",\"seq\":1,\"d\":{\"players\":\"oops\"}}");
            transport.RaiseText("{\"t\":\"room.created\",\"seq\":2,\"d\":{\"code\":\"\"}}");

            Assert.AreEqual(4, _protocolErrors.Count);
            Assert.AreEqual(ConnectionState.Connected, _client.State);
            Assert.AreEqual(1, _transports.Count);
            Assert.IsNull(_client.RoomCode);
            Assert.IsNull(_client.LastRoomState);
            Assert.AreEqual(2, messages, "structurally valid envelopes are still forwarded");

            transport.RaiseText(RoomStateFrame);

            Assert.IsNotNull(_client.LastRoomState, "the client keeps working after bad frames");
        }

        [Test]
        public void ServerError_RaisesServerErrorEvent()
        {
            FakeTransport transport = ConnectAndOpen();
            ErrorDto error = null;
            _client.ServerError += dto => error = dto;

            transport.RaiseText("{\"t\":\"error\",\"seq\":1,\"d\":{\"code\":\"not_host\",\"message\":\"only the room host may do that\"}}");

            Assert.IsNotNull(error);
            Assert.AreEqual("not_host", error.Code);
            Assert.AreEqual("only the room host may do that", error.Message);
            Assert.AreEqual(ConnectionState.Connected, _client.State);
        }

        [Test]
        public void UnexpectedClose_ReconnectsWithANewTransportOnlyAfterTheBackoffDelay()
        {
            FakeTransport first = ConnectAndOpen();
            _client.Tick(10);

            first.RaiseClosed(1006, "connection lost");

            Assert.AreEqual(ConnectionState.Reconnecting, _client.State);
            Assert.AreEqual(1, _client.ReconnectAttempts);
            Assert.IsTrue(first.IsDisposed);
            Assert.AreEqual(1, _transports.Count, "no new transport before the delay");

            _client.Tick(10 + BackoffBaseSeconds - Epsilon);
            Assert.AreEqual(1, _transports.Count, "still waiting just before the delay elapses");

            _client.Tick(10 + BackoffBaseSeconds + Epsilon);
            Assert.AreEqual(2, _transports.Count, "a new transport is created once the delay elapsed");
            Assert.AreNotSame(first, Latest);
            Assert.AreEqual(Url, Latest.ConnectedUrl);
            Assert.AreEqual(ConnectionState.Reconnecting, _client.State);

            Latest.RaiseOpened();

            Assert.AreEqual(ConnectionState.Connected, _client.State);
            Assert.AreEqual(0, _client.ReconnectAttempts);
            CollectionAssert.AreEqual(
                new[] { ConnectionState.Connecting, ConnectionState.Connected, ConnectionState.Reconnecting, ConnectionState.Connected },
                _states);
        }

        [Test]
        public void FailedReconnectAttempts_BackOffExponentiallyAndResetAfterSuccess()
        {
            FakeTransport first = ConnectAndOpen();
            first.RaiseClosed(1006, "");

            _client.Tick(0.5 + Epsilon); // attempt 1 starts after 0.5 s
            Assert.AreEqual(2, _transports.Count);
            Latest.RaiseClosed(1006, "refused");
            Assert.AreEqual(2, _client.ReconnectAttempts);

            _client.Tick(1.4); // the second delay is 1 s, counted from 0.501
            Assert.AreEqual(2, _transports.Count);
            _client.Tick(1.6);
            Assert.AreEqual(3, _transports.Count);

            Latest.RaiseOpened();
            Latest.RaiseClosed(1006, "");
            _client.Tick(1.6 + BackoffBaseSeconds - Epsilon);
            Assert.AreEqual(3, _transports.Count);
            _client.Tick(1.6 + BackoffBaseSeconds + Epsilon);
            Assert.AreEqual(4, _transports.Count, "the delay is back to the base after a successful connection");
        }

        [Test]
        public void TransportErrorThatLeavesTheTransportClosed_AlsoTriggersReconnect()
        {
            FakeTransport transport = ConnectAndOpen();
            var errors = new List<string>();
            _client.TransportError += errors.Add;

            transport.RaiseError("socket fault");

            Assert.AreEqual(ConnectionState.Connected, _client.State, "an error alone does not drop the connection");

            transport.RaiseError("socket died", leaveClosed: true);

            CollectionAssert.AreEqual(new[] { "socket fault", "socket died" }, errors);
            Assert.AreEqual(ConnectionState.Reconnecting, _client.State);
        }

        [Test]
        public void ReconnectWithKnownRoom_SendsRoomResumeFirst()
        {
            FakeTransport first = ConnectAndOpen();
            _client.CreateRoom();
            first.RaiseText(RoomCreatedFrame);
            first.RaiseClosed(1006, "");
            _client.Send("vote.open", new JObject { { "id", "v1" } }); // queued while reconnecting
            _client.Tick(BackoffBaseSeconds + Epsilon);
            FakeTransport second = Latest;
            _client.StateChanged += state =>
            {
                if (state == ConnectionState.Connected)
                {
                    _client.Send("from.handler", null);
                }
            };

            second.RaiseOpened();

            Assert.AreEqual(3, second.Sent.Count);
            Envelope resume = Decode(second.Sent[0]);
            Assert.AreEqual("room.resume", resume.Type);
            Assert.AreEqual("QRST", (string)resume.Data["code"]);
            Assert.AreEqual("tok-123", (string)resume.Data["hostToken"]);
            Assert.AreEqual("vote.open", Decode(second.Sent[1]).Type);
            Assert.AreEqual("from.handler", Decode(second.Sent[2]).Type);
        }

        [Test]
        public void ReconnectWithoutRoom_DoesNotSendRoomResume()
        {
            FakeTransport first = ConnectAndOpen();
            first.RaiseClosed(1006, "");
            _client.Tick(BackoffBaseSeconds + Epsilon);

            Latest.RaiseOpened();

            Assert.AreEqual(0, Latest.Sent.Count);
        }

        [Test]
        public void RoomNotFoundError_ForgetsTheRoomSoItIsNotResumedAgain()
        {
            FakeTransport first = ConnectAndOpen();
            first.RaiseText(RoomCreatedFrame);
            first.RaiseText(RoomStateFrame);

            first.RaiseText("{\"t\":\"error\",\"seq\":3,\"d\":{\"code\":\"room_not_found\",\"message\":\"room not found\"}}");

            Assert.IsNull(_client.RoomCode);
            Assert.IsNull(_client.LastRoomState);

            first.RaiseClosed(1006, "");
            _client.Tick(BackoffBaseSeconds + Epsilon);
            Latest.RaiseOpened();

            Assert.AreEqual(0, Latest.Sent.Count);
        }

        [Test]
        public void SendsWhileNotConnected_AreQueuedAndFlushedInOrderOnOpen()
        {
            int first = _client.Send("a.one", null);
            _client.Connect(Url);
            int second = _client.Send("a.two", null);
            _client.CreateRoom();
            Assert.AreEqual(0, Latest.Sent.Count, "nothing is sent before the transport opens");

            Latest.RaiseOpened();

            Assert.AreEqual(1, first);
            Assert.AreEqual(2, second);
            Assert.AreEqual(3, Latest.Sent.Count);
            Assert.AreEqual("{\"t\":\"a.one\",\"seq\":1,\"d\":{}}", Latest.Sent[0]);
            Assert.AreEqual("{\"t\":\"a.two\",\"seq\":2,\"d\":{}}", Latest.Sent[1]);
            Assert.AreEqual("room.create", Decode(Latest.Sent[2]).Type);

            _client.Send("a.four", null);
            Assert.AreEqual(4, Latest.Sent.Count, "once connected, messages go out immediately");
        }

        [Test]
        public void SendQueue_IsBoundedAndDropsTheOldest()
        {
            _client.Connect(Url);
            for (int i = 1; i <= RoomClient.MaxQueuedMessages + 2; i++)
            {
                _client.Send("queued.msg", null);
            }

            Latest.RaiseOpened();

            Assert.AreEqual(RoomClient.MaxQueuedMessages, Latest.Sent.Count);
            Assert.AreEqual(3, Decode(Latest.Sent[0]).Seq, "the two oldest messages were dropped");
            Assert.AreEqual(RoomClient.MaxQueuedMessages + 2, Decode(Latest.Sent[Latest.Sent.Count - 1]).Seq);
            Assert.AreEqual(2, _protocolErrors.Count, "every drop is reported");
        }

        [Test]
        public void Disconnect_ClosesTheTransportAndStopsReconnecting()
        {
            FakeTransport transport = ConnectAndOpen();
            transport.RaiseText(RoomCreatedFrame);

            _client.Disconnect();

            Assert.AreEqual(ConnectionState.Disconnected, _client.State);
            Assert.AreEqual(1, transport.CloseCount);
            Assert.AreEqual(1000, transport.LastCloseCode);
            Assert.IsTrue(transport.IsDisposed);
            Assert.IsNull(_client.RoomCode);

            transport.RaiseClosed(1000, "client disconnect");
            _client.Tick(100);

            Assert.AreEqual(1, _transports.Count, "no reconnect after an intentional disconnect");
            Assert.AreEqual(ConnectionState.Disconnected, _client.State);
        }

        [Test]
        public void Disconnect_WhileWaitingToReconnect_CancelsThePendingAttempt()
        {
            FakeTransport transport = ConnectAndOpen();
            transport.RaiseClosed(1006, "");
            Assert.AreEqual(ConnectionState.Reconnecting, _client.State);

            _client.Disconnect();
            _client.Tick(100);

            Assert.AreEqual(1, _transports.Count);
            Assert.AreEqual(ConnectionState.Disconnected, _client.State);
            Assert.AreEqual(0, _client.ReconnectAttempts);
        }

        [Test]
        public void KeepAlive_SendsPingEveryTenSecondsAndMeasuresRoundTrip()
        {
            FakeTransport transport = ConnectAndOpen();
            Assert.AreEqual(RoomClient.UnknownRoundTripMs, _client.LastRoundTripMs);

            _client.Tick(RoomClient.KeepAliveIntervalSeconds - Epsilon);
            Assert.AreEqual(0, transport.Sent.Count, "no ping before the interval elapses");

            _client.Tick(RoomClient.KeepAliveIntervalSeconds);
            Assert.AreEqual(1, transport.Sent.Count);
            Envelope ping = Decode(transport.Sent[0]);
            Assert.AreEqual("ping", ping.Type);
            Assert.AreEqual(10000L, (long)ping.Data["t"]);

            _client.Tick(RoomClient.KeepAliveIntervalSeconds + 0.05);
            Assert.AreEqual(1, transport.Sent.Count, "only one ping per interval");
            transport.RaiseText("{\"t\":\"pong\",\"seq\":9,\"d\":{\"t\":10000}}");

            Assert.AreEqual(50.0, _client.LastRoundTripMs, 0.001);

            _client.Tick(2 * RoomClient.KeepAliveIntervalSeconds);
            Assert.AreEqual(2, transport.Sent.Count);
            Assert.AreEqual(0, _protocolErrors.Count);
        }

        [Test]
        public void Connect_WhileConnected_StartsAFreshSession()
        {
            FakeTransport first = ConnectAndOpen();
            first.RaiseText(RoomCreatedFrame);

            _client.Connect("ws://other.invalid:9000");

            Assert.IsTrue(first.IsDisposed);
            Assert.AreEqual(2, _transports.Count);
            Assert.AreEqual("ws://other.invalid:9000", Latest.ConnectedUrl);
            Assert.AreEqual(ConnectionState.Connecting, _client.State);
            Assert.IsNull(_client.RoomCode);
        }
    }
}
