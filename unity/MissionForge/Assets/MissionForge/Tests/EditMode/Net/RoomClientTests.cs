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
        private const string HostToken = "hT_5uJ2m9Qe7LwXc1Vb8Nz0A";

        private const string HelloFrame = "{\"t\":\"hello\",\"seq\":1,\"d\":{\"protocolVersion\":1,\"client\":\"HOST\",\"appVersion\":\"0.0.0\"}}";

        private const string HelloOkFrame =
            "{\"t\":\"hello.ok\",\"seq\":1,\"d\":{\"protocolVersion\":1,\"serverTimeMs\":1794650000000,\"heartbeatMs\":5000,"
            + "\"idleTimeoutMs\":15000,\"maxFrameBytes\":65536,\"maxMsgsPerSec\":400,\"maxBytesPerSec\":262144}}";

        private const string RoomCreatedFrame =
            "{\"t\":\"room.created\",\"seq\":2,\"d\":{\"room\":\"QRST\",\"hostToken\":\"" + HostToken + "\","
            + "\"joinUrl\":\"https://play.example.org/?room=QRST\",\"spectateUrl\":\"https://play.example.org/?room=QRST&watch=1\","
            + "\"maxPlayers\":10,\"slotHoldMs\":180000,\"roomHoldMs\":600000}}";

        private const string SettingsStateFrame =
            "{\"t\":\"settings.state\",\"seq\":3,\"d\":{\"settings\":{\"roleAssignMode\":\"PICK\",\"voteTimerS\":45,\"inspectTimerS\":20,"
            + "\"tallyVisibility\":\"HIDDEN\",\"strictMajority\":false,\"assistLevel\":\"CADET\",\"audienceVoteWeight\":0,"
            + "\"pilotRotation\":\"PER_SEGMENT\",\"pilotSelect\":\"ROTATION\",\"passTheControls\":false,\"lang\":\"en\","
            + "\"a11y\":{\"slowTimers\":true,\"relaxedMinigames\":false,\"reducedMotion\":false,\"highContrast\":false,\"subtitles\":true,\"explainTooltips\":false}}}}";

        private const string PrefsJson =
            "{\"lang\":\"en\",\"relaxed\":false,\"oneButton\":false,\"holdToToggle\":false,\"reducedMotion\":false,"
            + "\"highContrast\":false,\"textScalePct\":150,\"screenReader\":false,\"haptics\":true}";

        private const string RoomStateFrame =
            "{\"t\":\"room.state\",\"seq\":4,\"d\":{\"room\":\"QRST\",\"hostConnected\":true,\"paused\":false,\"players\":["
            + "{\"id\":\"p1\",\"slot\":1,\"nickname\":\"Ada\",\"avatar\":{\"suitId\":\"suit_white\",\"patchId\":\"patch_orbit\"},"
            + "\"connected\":true,\"slotExpiresAtMs\":null,\"vetoAvailable\":true,\"prefs\":" + PrefsJson + "},"
            + "{\"id\":\"p3\",\"slot\":3,\"nickname\":\"Nova\",\"avatar\":{\"suitId\":\"suit_orange\",\"patchId\":\"patch_comet\"},"
            + "\"connected\":false,\"slotExpiresAtMs\":1794650180000,\"vetoAvailable\":false,\"prefs\":" + PrefsJson + "}],"
            + "\"spectatorCount\":4,\"pendingPlayerCount\":1}}";

        private const string RolesStateFrame =
            "{\"t\":\"roles.state\",\"seq\":5,\"d\":{\"mode\":\"PICK\",\"locked\":true,\"groups\":["
            + "{\"lead\":\"FLIGHT\",\"roles\":[\"FLIGHT\",\"PM\",\"BOOSTER\",\"STRUCT\",\"GUIDO\"],\"playerId\":\"p1\"},"
            + "{\"lead\":\"FIDO\",\"roles\":[\"FIDO\",\"EECOM\",\"INCO\",\"PAYLOAD\",\"RETRO\"],\"playerId\":\"p3\"}],"
            + "\"flightVotes\":[],\"abilitiesUsed\":[\"PM\"]}}";

        private const string SnapshotEndFrame = "{\"t\":\"snapshot.end\",\"seq\":6,\"d\":{\"serverTimeMs\":1794650000300,\"lastOutcomeSeq\":0}}";

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

        /// <summary>Opens the latest transport and completes the hello handshake.</summary>
        private static void OpenAndHandshake(FakeTransport transport)
        {
            transport.RaiseOpened();
            transport.RaiseText(HelloOkFrame);
        }

        private FakeTransport ConnectAndHandshake()
        {
            _client.Tick(0);
            _client.Connect(Url);
            OpenAndHandshake(Latest);
            return Latest;
        }

        private FakeTransport ConnectWithRoom()
        {
            FakeTransport transport = ConnectAndHandshake();
            transport.RaiseText(RoomCreatedFrame);
            return transport;
        }

        private static Envelope Decode(string frame)
        {
            Envelope envelope;
            string error;
            Assert.IsTrue(EnvelopeCodec.TryDecode(frame, out envelope, out error), error);
            return envelope;
        }

        private static List<string> Types(FakeTransport transport)
        {
            return transport.Sent.ConvertAll(frame => Decode(frame).Type);
        }

        // ───────────────────────── handshake ─────────────────────────

        [Test]
        public void Connect_SendsHelloFirst_AndIsConnectedOnlyAfterHelloOk()
        {
            Assert.AreEqual(ConnectionState.Disconnected, _client.State);

            _client.Connect(Url);

            Assert.AreEqual(1, _transports.Count);
            Assert.AreEqual(Url, Latest.ConnectedUrl);
            Assert.AreEqual(ConnectionState.Connecting, _client.State);

            Latest.RaiseOpened();

            Assert.AreEqual(ConnectionState.Connecting, _client.State, "the socket is open but the handshake is not done");
            CollectionAssert.AreEqual(new[] { HelloFrame }, Latest.Sent);

            Latest.RaiseText(HelloOkFrame);

            Assert.AreEqual(ConnectionState.Connected, _client.State);
            CollectionAssert.AreEqual(new[] { ConnectionState.Connecting, ConnectionState.Connected }, _states);
            Assert.AreEqual(5000, _client.LastHelloOk.HeartbeatMs);
            Assert.AreEqual(65536, _client.LastHelloOk.MaxFrameBytes);
            Assert.AreEqual(1, Latest.Sent.Count, "nothing else is sent by connecting");
        }

        [Test]
        public void AppVersion_IsSentWhenValid_AndFallsBackOtherwise()
        {
            Assert.AreEqual("0.3.1", new RoomClient(CreateTransport, null, "0.3.1").AppVersion);
            Assert.AreEqual(RoomClient.DefaultAppVersion, new RoomClient(CreateTransport, null, "not valid!").AppVersion);
            Assert.AreEqual(RoomClient.DefaultAppVersion, new RoomClient(CreateTransport).AppVersion);
        }

        [Test]
        public void DuplicateHelloOk_IsAProtocolError()
        {
            FakeTransport transport = ConnectAndHandshake();

            transport.RaiseText(HelloOkFrame);

            Assert.AreEqual(1, _protocolErrors.Count);
            Assert.AreEqual(ConnectionState.Connected, _client.State);
        }

        [Test]
        public void Tick_PumpsTheCurrentTransport()
        {
            FakeTransport transport = ConnectAndHandshake();
            int before = transport.PumpCount;

            _client.Tick(0.01);
            _client.Tick(0.02);

            Assert.AreEqual(before + 2, transport.PumpCount);
        }

        // ───────────────────────── sending ─────────────────────────

        [Test]
        public void CreateRoom_SendsRoomCreate_WithOptionalSettingsPatch()
        {
            FakeTransport transport = ConnectAndHandshake();

            _client.CreateRoom();
            _client.CreateRoom(new SettingsPatchDto { VoteTimerS = 30, StrictMajority = true });

            Assert.AreEqual("{\"t\":\"room.create\",\"seq\":2,\"d\":{}}", transport.Sent[1]);
            Assert.AreEqual("{\"t\":\"room.create\",\"seq\":3,\"d\":{\"settings\":{\"voteTimerS\":30,\"strictMajority\":true}}}", transport.Sent[2]);
        }

        [Test]
        public void Send_ReturnsSeqPerConnection_AndHostMessagesUseContractShapes()
        {
            FakeTransport transport = ConnectAndHandshake();

            int first = _client.Send(ProtocolNames.Messages.VoteClose, new JObject { { "roundId", "m1.r07" } });
            int second = _client.Send(ProtocolNames.Messages.RolesLock, null);
            _client.SetPhase(PhaseSetDto.ForPhase(ProtocolNames.Phases.Briefing, 1));
            _client.UpdateSettings(new SettingsPatchDto { VoteTimerS = 45, TallyVisibility = ProtocolNames.TallyVisibilities.Hidden });
            _client.KickPlayer("p7");
            _client.PauseGame();
            _client.ResumeGame();
            _client.CloseRoom();

            Assert.AreEqual(2, first, "hello used seq 1");
            Assert.AreEqual(3, second);
            CollectionAssert.AreEqual(
                new[]
                {
                    HelloFrame,
                    "{\"t\":\"vote.close\",\"seq\":2,\"d\":{\"roundId\":\"m1.r07\"}}",
                    "{\"t\":\"roles.lock\",\"seq\":3,\"d\":{}}",
                    "{\"t\":\"phase.set\",\"seq\":4,\"d\":{\"missionSeq\":1,\"mode\":\"QUICK\",\"phase\":\"BRIEFING\",\"sub\":\"NONE\","
                    + "\"review\":null,\"flightPhase\":null,\"segment\":null,\"boosterTrack\":false,\"contractId\":null,\"step\":null}}",
                    "{\"t\":\"settings.set\",\"seq\":5,\"d\":{\"settings\":{\"voteTimerS\":45,\"tallyVisibility\":\"HIDDEN\"}}}",
                    "{\"t\":\"room.kick\",\"seq\":6,\"d\":{\"playerId\":\"p7\"}}",
                    "{\"t\":\"game.pause\",\"seq\":7,\"d\":{}}",
                    "{\"t\":\"game.resume\",\"seq\":8,\"d\":{}}",
                    "{\"t\":\"room.close\",\"seq\":9,\"d\":{}}",
                },
                transport.Sent);
        }

        [Test]
        public void PhaseSetForPhase_UsesAnAllowedFieldCombination()
        {
            PhaseSetDto frr = PhaseSetDto.ForPhase(ProtocolNames.Phases.Frr, 2);
            PhaseSetDto countdown = PhaseSetDto.ForPhase(ProtocolNames.Phases.Countdown, 2);
            PhaseSetDto flight = PhaseSetDto.ForPhase(ProtocolNames.Phases.Flight, 2);
            PhaseSetDto debrief = PhaseSetDto.ForPhase(ProtocolNames.Phases.Debrief, 2);
            PhaseSetDto lobby = PhaseSetDto.ForPhase(ProtocolNames.Phases.Lobby, 0);

            Assert.AreEqual(new[] { "NONE", "FRR" }, new[] { frr.Sub, frr.Review });
            Assert.AreEqual(new[] { "NONE", "F0" }, new[] { countdown.Sub, countdown.FlightPhase });
            Assert.AreEqual(new[] { "FLYING", "F2", "ASCENT" }, new[] { flight.Sub, flight.FlightPhase, flight.Segment });
            Assert.AreEqual("SUMMARY", debrief.Sub);
            Assert.AreEqual(new object[] { "NONE", null, null, null, null }, new object[] { lobby.Sub, lobby.Review, lobby.FlightPhase, lobby.Segment, lobby.Step });
            Assert.AreEqual(2, flight.MissionSeq);
        }

        [Test]
        public void SendsBeforeTheHandshake_AreQueuedAndFlushedAfterHelloWithFreshSeqs()
        {
            int first = _client.Send("a.one", null);
            _client.Connect(Url);
            int second = _client.Send("a.two", null);
            _client.CreateRoom();
            Latest.RaiseOpened();
            Assert.AreEqual(1, Latest.Sent.Count, "only hello before hello.ok");

            Latest.RaiseText(HelloOkFrame);

            Assert.AreEqual(RoomClient.QueuedSeq, first);
            Assert.AreEqual(RoomClient.QueuedSeq, second);
            CollectionAssert.AreEqual(
                new[] { HelloFrame, "{\"t\":\"a.one\",\"seq\":2,\"d\":{}}", "{\"t\":\"a.two\",\"seq\":3,\"d\":{}}", "{\"t\":\"room.create\",\"seq\":4,\"d\":{}}" },
                Latest.Sent);

            Assert.AreEqual(5, _client.Send("a.five", null), "once connected, messages go out immediately");
        }

        [Test]
        public void SendQueue_IsBoundedAndDropsTheOldest()
        {
            _client.Connect(Url);
            for (int i = 0; i < RoomClient.MaxQueuedMessages + 2; i++)
            {
                _client.Send("queued.m" + i, null);
            }

            OpenAndHandshake(Latest);

            Assert.AreEqual(1 + RoomClient.MaxQueuedMessages, Latest.Sent.Count);
            Assert.AreEqual("queued.m2", Decode(Latest.Sent[1]).Type, "the two oldest messages were dropped");
            Assert.AreEqual(2, Decode(Latest.Sent[1]).Seq);
            Assert.AreEqual(2, _protocolErrors.Count, "every drop is reported");
        }

        // ───────────────────────── receiving ─────────────────────────

        [Test]
        public void RoomCreatedAndSnapshot_FillTheRoomModel()
        {
            FakeTransport transport = ConnectAndHandshake();
            RoomCreatedDto created = null;
            RoomStateDto state = null;
            RoomSettingsDto settings = null;
            RolesStateDto roles = null;
            SnapshotEndDto end = null;
            var received = new List<string>();
            _client.RoomCreated += dto => created = dto;
            _client.RoomStateChanged += dto => state = dto;
            _client.SettingsChanged += dto => settings = dto;
            _client.RolesStateChanged += dto => roles = dto;
            _client.SnapshotEnded += dto => end = dto;
            _client.MessageReceived += envelope => received.Add(envelope.Type);

            transport.RaiseText(RoomCreatedFrame);

            Assert.AreEqual("QRST", created.Room);
            Assert.AreEqual(HostToken, created.HostToken);
            Assert.AreEqual("QRST", _client.RoomCode);
            Assert.AreEqual("https://play.example.org/?room=QRST", _client.JoinUrl);
            Assert.AreEqual("https://play.example.org/?room=QRST&watch=1", _client.SpectateUrl);
            Assert.IsTrue(_client.IsReceivingSnapshot);
            Assert.IsNull(_client.LastRoomState);

            transport.RaiseText(SettingsStateFrame);
            transport.RaiseText(RoomStateFrame);
            transport.RaiseText(RolesStateFrame);
            transport.RaiseText(SnapshotEndFrame);

            Assert.IsFalse(_client.IsReceivingSnapshot);
            Assert.IsNotNull(end);
            Assert.AreSame(settings, _client.LastSettings);
            Assert.AreEqual(ProtocolNames.RoleAssignModes.Pick, settings.RoleAssignMode);
            Assert.AreEqual(ProtocolNames.AssistLevels.Cadet, settings.AssistLevel);
            Assert.AreEqual(45, settings.VoteTimerS);
            Assert.AreEqual(ProtocolNames.TallyVisibilities.Hidden, settings.TallyVisibility);
            Assert.IsTrue(settings.A11y.SlowTimers);

            Assert.AreSame(state, _client.LastRoomState);
            Assert.AreEqual("QRST", state.Room);
            Assert.AreEqual(4, state.SpectatorCount);
            Assert.AreEqual(1, state.PendingPlayerCount);
            Assert.AreEqual(2, state.Players.Count);
            PlayerInfoDto ada = state.Players[0];
            Assert.AreEqual(new object[] { "p1", 1, "Ada", "suit_white", "patch_orbit", true, null, 150 },
                new object[] { ada.Id, ada.Slot, ada.Nickname, ada.Avatar.SuitId, ada.Avatar.PatchId, ada.Connected, ada.SlotExpiresAtMs, ada.Prefs.TextScalePct });
            PlayerInfoDto nova = state.FindPlayer("p3");
            Assert.IsFalse(nova.Connected);
            Assert.AreEqual(1794650180000L, nova.SlotExpiresAtMs);
            Assert.IsFalse(nova.VetoAvailable);

            Assert.AreSame(roles, _client.LastRolesState);
            Assert.IsTrue(roles.Locked);
            CollectionAssert.AreEqual(new[] { "FLIGHT", "PM", "BOOSTER", "STRUCT", "GUIDO" }, roles.RolesOf("p1"));
            CollectionAssert.AreEqual(new[] { "PM" }, roles.AbilitiesUsed);
            Assert.IsEmpty(roles.RolesOf("p9"));

            CollectionAssert.AreEqual(new[] { "room.created", "settings.state", "room.state", "roles.state", "snapshot.end" }, received);
            Assert.AreEqual(0, _protocolErrors.Count);
        }

        [Test]
        public void RoomState_ToleratesUnknownMissingAndNullFields_AndSortsBySlot()
        {
            FakeTransport transport = ConnectAndHandshake();
            RoomStateDto state = null;
            _client.RoomStateChanged += dto => state = dto;

            transport.RaiseText(
                "{\"t\":\"room.state\",\"seq\":2,\"d\":{\"room\":\"QRST\",\"futureField\":{\"x\":1},"
                + "\"players\":[null,{\"id\":\"p2\",\"slot\":2,\"nickname\":\"Vega\",\"badge\":7,\"avatar\":null},{\"id\":\"p1\",\"slot\":1}]}}");

            Assert.IsNotNull(state);
            Assert.AreEqual(0, _protocolErrors.Count);
            Assert.IsTrue(state.HostConnected, "a missing hostConnected keeps the default");
            Assert.AreEqual(2, state.Players.Count, "null entries are removed");
            Assert.AreEqual("p1", state.Players[0].Id, "players are ordered by slot");
            PlayerInfoDto vega = state.Players[1];
            Assert.AreEqual("Vega", vega.Nickname);
            Assert.IsTrue(vega.Connected, "connected defaults to true");
            Assert.IsNotNull(vega.Avatar);
            Assert.IsNotNull(vega.Prefs);

            transport.RaiseText("{\"t\":\"room.state\",\"seq\":3,\"d\":{}}");

            Assert.IsNotNull(state.Players);
            Assert.AreEqual(0, state.Players.Count);
        }

        [Test]
        public void MalformedFrames_RaiseProtocolErrorAndKeepTheConnection()
        {
            FakeTransport transport = ConnectAndHandshake();
            int messages = 0;
            _client.MessageReceived += envelope => messages++;

            transport.RaiseText("this is not json");
            transport.RaiseText("{\"t\":\"room.state\"}");
            transport.RaiseText("{\"t\":\"room.state\",\"seq\":2,\"d\":{\"players\":\"oops\"}}");
            transport.RaiseText("{\"t\":\"room.created\",\"seq\":3,\"d\":{\"room\":\"\"}}");

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
            FakeTransport transport = ConnectAndHandshake();
            ErrorDto error = null;
            _client.ServerError += dto => error = dto;

            transport.RaiseText("{\"t\":\"error\",\"seq\":2,\"d\":{\"code\":\"BAD_PAYLOAD\",\"fatal\":false,\"re\":41,\"reT\":\"settings.set\",\"field\":\"settings.voteTimerS\"}}");

            Assert.AreEqual(ProtocolNames.ErrorCodes.BadPayload, error.Code);
            Assert.IsFalse(error.Fatal);
            Assert.AreEqual(41, error.Re);
            Assert.AreEqual("settings.set", error.ReT);
            Assert.AreEqual("settings.voteTimerS", error.Field);
            Assert.IsNull(error.RetryAfterMs);
            Assert.AreEqual(ConnectionState.Connected, _client.State);
        }

        [Test]
        public void PauseAndResume_AreTracked()
        {
            FakeTransport transport = ConnectWithRoom();
            GamePausedDto paused = null;
            GameResumedDto resumed = null;
            _client.GamePaused += dto => paused = dto;
            _client.GameResumed += dto => resumed = dto;

            transport.RaiseText("{\"t\":\"game.paused\",\"seq\":3,\"d\":{\"reason\":\"HOST_REQUEST\",\"atMs\":1794650400000,\"roomExpiresAtMs\":null}}");

            Assert.IsTrue(_client.IsPaused);
            Assert.AreEqual(ProtocolNames.PauseReasons.HostRequest, paused.Reason);
            Assert.IsNull(paused.RoomExpiresAtMs);

            transport.RaiseText("{\"t\":\"game.resumed\",\"seq\":4,\"d\":{\"atMs\":1794650460000,\"pausedForMs\":60000}}");

            Assert.IsFalse(_client.IsPaused);
            Assert.AreEqual(60000L, resumed.PausedForMs);
        }

        [Test]
        public void Relay_RaisesRelayReceivedWithTheInnerMessage()
        {
            FakeTransport transport = ConnectWithRoom();
            RelayDto relay = null;
            _client.RelayReceived += dto => relay = dto;

            transport.RaiseText("{\"t\":\"relay\",\"seq\":3,\"d\":{\"from\":\"p3\",\"t\":\"mg.ready\",\"d\":{\"runId\":\"m1.mg08\"}}}");

            Assert.AreEqual("p3", relay.From);
            Assert.AreEqual(ProtocolNames.Messages.MgReady, relay.Type);
            Assert.AreEqual("m1.mg08", (string)relay.Data["runId"]);
        }

        // ───────────────────────── clock ─────────────────────────

        [Test]
        public void Clock_SendsThreeProbesThenEveryHeartbeat_AndEstimatesTheServerClock()
        {
            FakeTransport transport = ConnectAndHandshake();
            Assert.AreEqual(RoomClient.UnknownRoundTripMs, _client.LastRoundTripMs);
            Assert.IsFalse(_client.HasServerClock);

            _client.Tick(0);
            _client.Tick(0.1);
            _client.Tick(0.2);
            _client.Tick(0.4);
            Assert.AreEqual(4, transport.Sent.Count, "hello + three probes 200 ms apart");
            Envelope probe = Decode(transport.Sent[1]);
            Assert.AreEqual(ProtocolNames.Messages.ClockPing, probe.Type);
            Assert.AreEqual(0L, (long)probe.Data[ProtocolNames.Fields.ClientTimeMs]);

            _client.Tick(5.4 - Epsilon);
            Assert.AreEqual(4, transport.Sent.Count, "next ping after heartbeatMs");
            _client.Tick(5.4);
            Assert.AreEqual(5, transport.Sent.Count);
            Assert.AreEqual(5400L, (long)Decode(transport.Sent[4]).Data[ProtocolNames.Fields.ClientTimeMs]);

            _client.Tick(5.45);
            transport.RaiseText("{\"t\":\"clock.pong\",\"seq\":2,\"d\":{\"clientTimeMs\":5400,\"serverTimeMs\":1794650005000}}");

            Assert.AreEqual(50.0, _client.LastRoundTripMs, 0.001);
            Assert.IsTrue(_client.HasServerClock);
            Assert.AreEqual(1794650005000.0 - (5400 + 25), _client.ServerClockOffsetMs, 0.001);
            Assert.AreEqual(1794650005025L, _client.EstimateServerTimeMs());
            Assert.AreEqual(0, _protocolErrors.Count);
        }

        [Test]
        public void NoPongForTenSeconds_DropsTheSocketAndReconnects()
        {
            FakeTransport transport = ConnectAndHandshake();

            _client.Tick(RoomClient.ResponseTimeoutSeconds);
            Assert.AreEqual(ConnectionState.Connected, _client.State, "exactly 10 s is still fine");

            _client.Tick(RoomClient.ResponseTimeoutSeconds + Epsilon);

            Assert.AreEqual(ConnectionState.Reconnecting, _client.State);
            Assert.AreEqual(1, transport.CloseCount, "the silent socket is closed");
            Assert.IsTrue(transport.IsDisposed);
            Assert.AreEqual(1, _protocolErrors.Count);
        }

        [Test]
        public void NoHelloOk_DropsTheSocketAndReconnects()
        {
            _client.Tick(0);
            _client.Connect(Url);
            Latest.RaiseOpened();

            _client.Tick(RoomClient.ResponseTimeoutSeconds + Epsilon);

            Assert.AreEqual(ConnectionState.Reconnecting, _client.State);
            Assert.AreEqual(1, _client.ReconnectAttempts);
        }

        // ───────────────────────── reconnect and resume ─────────────────────────

        [Test]
        public void UnexpectedClose_ReconnectsWithANewTransportOnlyAfterTheBackoffDelay()
        {
            FakeTransport first = ConnectAndHandshake();
            _client.Tick(9);

            first.RaiseClosed(1006, "connection lost");

            Assert.AreEqual(ConnectionState.Reconnecting, _client.State);
            Assert.AreEqual(1, _client.ReconnectAttempts);
            Assert.IsTrue(first.IsDisposed);
            Assert.AreEqual(1, _transports.Count, "no new transport before the delay");

            _client.Tick(9 + BackoffBaseSeconds - Epsilon);
            Assert.AreEqual(1, _transports.Count, "still waiting just before the delay elapses");

            _client.Tick(9 + BackoffBaseSeconds + Epsilon);
            Assert.AreEqual(2, _transports.Count, "a new transport is created once the delay elapsed");
            Assert.AreNotSame(first, Latest);
            Assert.AreEqual(Url, Latest.ConnectedUrl);
            Assert.AreEqual(ConnectionState.Reconnecting, _client.State);

            OpenAndHandshake(Latest);

            Assert.AreEqual(ConnectionState.Connected, _client.State);
            Assert.AreEqual(0, _client.ReconnectAttempts);
            CollectionAssert.AreEqual(
                new[] { ConnectionState.Connecting, ConnectionState.Connected, ConnectionState.Reconnecting, ConnectionState.Connected },
                _states);
        }

        [Test]
        public void FailedReconnectAttempts_BackOffExponentiallyAndResetAfterASuccessfulHandshake()
        {
            FakeTransport first = ConnectAndHandshake();
            first.RaiseClosed(1006, "");

            _client.Tick(0.5 + Epsilon); // attempt 1 starts after 0.5 s
            Assert.AreEqual(2, _transports.Count);
            Latest.RaiseClosed(1006, "refused");
            Assert.AreEqual(2, _client.ReconnectAttempts);

            _client.Tick(1.4); // the second delay is 1 s, counted from 0.501
            Assert.AreEqual(2, _transports.Count);
            _client.Tick(1.6);
            Assert.AreEqual(3, _transports.Count);

            OpenAndHandshake(Latest);
            Latest.RaiseClosed(1006, "");
            _client.Tick(1.6 + BackoffBaseSeconds - Epsilon);
            Assert.AreEqual(3, _transports.Count);
            _client.Tick(1.6 + BackoffBaseSeconds + Epsilon);
            Assert.AreEqual(4, _transports.Count, "the delay is back to the base after a successful handshake");
        }

        [Test]
        public void TransportErrorThatLeavesTheTransportClosed_AlsoTriggersReconnect()
        {
            FakeTransport transport = ConnectAndHandshake();
            var errors = new List<string>();
            _client.TransportError += errors.Add;

            transport.RaiseError("socket fault");

            Assert.AreEqual(ConnectionState.Connected, _client.State, "an error alone does not drop the connection");

            transport.RaiseError("socket died", leaveClosed: true);

            CollectionAssert.AreEqual(new[] { "socket fault", "socket died" }, errors);
            Assert.AreEqual(ConnectionState.Reconnecting, _client.State);
        }

        [Test]
        public void ReconnectWithKnownRoom_SendsHelloThenRoomResumeThenQueuedMessages()
        {
            FakeTransport first = ConnectWithRoom();
            _client.LastAppliedOutcomeSeq = 9;
            first.RaiseClosed(1006, "");
            _client.Send(ProtocolNames.Messages.VoteClose, new JObject { { "roundId", "m1.r07" } }); // queued while reconnecting
            _client.Tick(BackoffBaseSeconds + Epsilon);
            FakeTransport second = Latest;
            _client.StateChanged += state =>
            {
                if (state == ConnectionState.Connected)
                {
                    _client.Send("from.handler", null);
                }
            };

            OpenAndHandshake(second);

            CollectionAssert.AreEqual(
                new[]
                {
                    HelloFrame,
                    "{\"t\":\"room.resume\",\"seq\":2,\"d\":{\"room\":\"QRST\",\"token\":\"" + HostToken + "\",\"lastOutcomeSeq\":9}}",
                    "{\"t\":\"vote.close\",\"seq\":3,\"d\":{\"roundId\":\"m1.r07\"}}",
                    "{\"t\":\"from.handler\",\"seq\":4,\"d\":{}}",
                },
                second.Sent);
        }

        [Test]
        public void RoomResumed_ReportsThePauseAndStartsTheSnapshot()
        {
            FakeTransport transport = ConnectWithRoom();
            RoomResumedDto resumed = null;
            _client.RoomResumed += dto => resumed = dto;

            transport.RaiseText("{\"t\":\"room.resumed\",\"seq\":3,\"d\":{\"room\":\"QRST\",\"kind\":\"HOST\",\"id\":\"host\",\"slot\":null,\"pendingPlayer\":false,\"paused\":true}}");

            Assert.AreEqual(ProtocolNames.ConnKinds.Host, resumed.Kind);
            Assert.AreEqual(ProtocolNames.HostConnectionId, resumed.Id);
            Assert.IsNull(resumed.Slot);
            Assert.IsTrue(_client.IsPaused);
            Assert.IsTrue(_client.IsReceivingSnapshot);
        }

        [Test]
        public void ReconnectWithoutRoom_SendsOnlyHello()
        {
            FakeTransport first = ConnectAndHandshake();
            first.RaiseClosed(1006, "");
            _client.Tick(BackoffBaseSeconds + Epsilon);

            OpenAndHandshake(Latest);

            CollectionAssert.AreEqual(new[] { HelloFrame }, Latest.Sent);
        }

        [TestCase(ProtocolNames.ErrorCodes.TokenInvalid)]
        [TestCase(ProtocolNames.ErrorCodes.RoomNotFound)]
        public void ResumeRejected_ForgetsTheRoomSoItIsNotResumedAgain(string code)
        {
            FakeTransport first = ConnectWithRoom();
            first.RaiseText(RoomStateFrame);

            first.RaiseText("{\"t\":\"error\",\"seq\":5,\"d\":{\"code\":\"" + code + "\",\"fatal\":false,\"re\":2,\"reT\":\"room.resume\"}}");

            Assert.IsNull(_client.RoomCode);
            Assert.IsNull(_client.JoinUrl);
            Assert.IsNull(_client.LastRoomState);

            first.RaiseClosed(1006, "");
            _client.Tick(BackoffBaseSeconds + Epsilon);
            OpenAndHandshake(Latest);

            CollectionAssert.AreEqual(new[] { ProtocolNames.Messages.Hello }, Types(Latest));
        }

        [Test]
        public void ByeWithCanResumeFalse_ForgetsTheRoomButStillReconnects()
        {
            FakeTransport first = ConnectWithRoom();
            ByeDto bye = null;
            _client.ByeReceived += dto => bye = dto;

            first.RaiseText("{\"t\":\"bye\",\"seq\":3,\"d\":{\"reason\":\"ROOM_EXPIRED\",\"closeCode\":4004,\"canResume\":false}}");
            first.RaiseClosed(WebSocketCloseCodes.RoomExpired, "ROOM_EXPIRED");

            Assert.AreEqual(ProtocolNames.ByeReasons.RoomExpired, bye.Reason);
            Assert.AreSame(bye, _client.LastBye);
            Assert.IsNull(_client.RoomCode);
            Assert.AreEqual(ConnectionState.Reconnecting, _client.State);
        }

        [Test]
        public void ByeWithCanResumeTrue_KeepsTheRoomForResume()
        {
            FakeTransport first = ConnectWithRoom();

            first.RaiseText("{\"t\":\"bye\",\"seq\":3,\"d\":{\"reason\":\"SERVER_SHUTDOWN\",\"closeCode\":4008,\"canResume\":true}}");
            first.RaiseClosed(WebSocketCloseCodes.ServerShutdown, "SERVER_SHUTDOWN");
            _client.Tick(BackoffBaseSeconds + Epsilon);
            OpenAndHandshake(Latest);

            CollectionAssert.AreEqual(new[] { ProtocolNames.Messages.Hello, ProtocolNames.Messages.RoomResume }, Types(Latest));
        }

        [Test]
        public void ByeReplaced_StopsReconnecting()
        {
            FakeTransport first = ConnectWithRoom();

            first.RaiseText("{\"t\":\"bye\",\"seq\":3,\"d\":{\"reason\":\"REPLACED\",\"closeCode\":4003,\"canResume\":false}}");
            first.RaiseClosed(WebSocketCloseCodes.Replaced, "REPLACED");
            _client.Tick(100);

            Assert.AreEqual(ConnectionState.Disconnected, _client.State);
            Assert.AreEqual(1, _transports.Count, "another host connection owns the room now");
            Assert.IsNull(_client.RoomCode);
        }

        [Test]
        public void CloseCodeThatRevokesTheToken_ForgetsTheRoomEvenWithoutBye()
        {
            FakeTransport first = ConnectWithRoom();

            first.RaiseClosed(WebSocketCloseCodes.RoomClosed, "");

            Assert.IsNull(_client.RoomCode);
            Assert.AreEqual(ConnectionState.Reconnecting, _client.State);
        }

        // ───────────────────────── disconnect ─────────────────────────

        [Test]
        public void Disconnect_ClosesTheTransportAndStopsReconnecting()
        {
            FakeTransport transport = ConnectWithRoom();

            _client.Disconnect();

            Assert.AreEqual(ConnectionState.Disconnected, _client.State);
            Assert.AreEqual(1, transport.CloseCount);
            Assert.AreEqual(WebSocketCloseCodes.Normal, transport.LastCloseCode);
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
            FakeTransport transport = ConnectAndHandshake();
            transport.RaiseClosed(1006, "");
            Assert.AreEqual(ConnectionState.Reconnecting, _client.State);

            _client.Disconnect();
            _client.Tick(100);

            Assert.AreEqual(1, _transports.Count);
            Assert.AreEqual(ConnectionState.Disconnected, _client.State);
            Assert.AreEqual(0, _client.ReconnectAttempts);
        }

        [Test]
        public void Connect_WhileConnected_StartsAFreshSession()
        {
            FakeTransport first = ConnectWithRoom();

            _client.Connect("ws://other.invalid:9000");

            Assert.IsTrue(first.IsDisposed);
            Assert.AreEqual(2, _transports.Count);
            Assert.AreEqual("ws://other.invalid:9000", Latest.ConnectedUrl);
            Assert.AreEqual(ConnectionState.Connecting, _client.State);
            Assert.IsNull(_client.RoomCode);
        }
    }
}
