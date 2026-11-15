// Browser WebSocket bridge for MissionForge.Net.WebGLWebSocketTransport.
//
// Sockets live in a JS map keyed by an integer id. Events are queued here and C# polls
// them once per frame with MFWS_PollEvent, so no C# callbacks (dynCall) are needed.
//
// Event encoding, one event per poll (first character is the kind):
//   "o"                  opened
//   "m<text>"            text message
//   "c<code>|<reason>"   closed (always the last event of a socket)
//   "e<message>"         error
// MFWS_PollEvent returns a null pointer when no event is queued.
//
// Keepalive (T040, defect D-103): a backgrounded browser tab stops animation frames, so the Unity
// frame loop (and RoomClient's clock.ping heartbeat) stalls, while the room server closes a
// connection that sends no frame for 15 s. After hello.ok this bridge therefore sends its own
// clock.ping from a Web Worker timer (browsers throttle workers far less than page timers; plain
// setInterval is the fallback). The bridge owns the wire "seq": the keepalive takes the next free
// number and later frames from C# are shifted up by the same amount, so seq stays strictly
// increasing. Keepalive pings carry clientTimeMs = KEEPALIVE_CLIENT_TIME_MS (fractional, never
// produced by C#), which RoomClient recognises in the pong as a liveness proof.
//
// Written in ES5 on purpose: the Unity jslib preprocessor is conservative.

var MissionForgeWebSocketLibrary = {
  $MFWS: {
    nextId: 1,
    sockets: {},
    READY_STATE_OPEN: 1,
    READY_STATE_CLOSED: 3,
    CLOSE_NORMAL: 1000,
    CLOSE_ABNORMAL: 1006,
    CLOSE_APP_MIN: 3000,
    CLOSE_APP_MAX: 4999,

    // Must equal RoomClient.KeepaliveClientTimeMs.
    KEEPALIVE_CLIENT_TIME_MS: 0.25,
    DEFAULT_HEARTBEAT_MS: 5000,
    MIN_HEARTBEAT_MS: 1000,
    // The keepalive only sends when nothing was sent for this multiple of heartbeatMs, so it stays
    // silent while the Unity frame loop runs its own heartbeat.
    KEEPALIVE_IDLE_FACTOR: 1.2,
    MIN_KEEPALIVE_TICK_MS: 500,
    // Envelope frames are encoded as {"t":"...","seq":N,"d":...} (EnvelopeCodec), t first.
    // No RegExp objects in this table: Unity's jslib serializer turns them into empty objects.
    SEQ_MARKER: '","seq":',
    SEQ_SEARCH_LIMIT: 120,
    HELLO_OK_MARKER: '"hello.ok"',
    CLOCK_PONG_MARKER: '"clock.pong"',
    MARKER_WINDOW: 40,

    // Tracks the seq of a frame from C# and shifts it by the keepalive offset (0 until the first
    // keepalive). Frames that do not match the envelope layout are passed through unchanged.
    renumber: function (entry, text) {
      var markerAt = text.indexOf(MFWS.SEQ_MARKER);
      if (markerAt < 0 || markerAt > MFWS.SEQ_SEARCH_LIMIT || text.charAt(0) !== '{') {
        return text;
      }
      var digitsStart = markerAt + MFWS.SEQ_MARKER.length;
      var digitsEnd = digitsStart;
      while (digitsEnd < text.length && text.charCodeAt(digitsEnd) >= 48 && text.charCodeAt(digitsEnd) <= 57) {
        digitsEnd++;
      }
      if (digitsEnd === digitsStart) {
        return text;
      }
      var clientSeq = parseInt(text.substring(digitsStart, digitsEnd), 10);
      var wireSeq = clientSeq + entry.seqOffset;
      entry.lastClientSeq = clientSeq;
      entry.lastWireSeq = wireSeq;
      if (entry.seqOffset === 0) {
        return text;
      }
      return text.substring(0, digitsStart) + wireSeq + text.substring(digitsEnd);
    },

    // Stops the keepalive timer of a socket entry. Safe to call repeatedly.
    stopKeepalive: function (entry) {
      if (entry.worker) {
        try {
          entry.worker.terminate();
        } catch (error) {
          // The worker is already gone.
        }
        entry.worker = null;
      }
      if (entry.timerId !== null) {
        clearInterval(entry.timerId);
        entry.timerId = null;
      }
    },

    // Sends one keepalive clock.ping when the socket has been silent long enough.
    keepaliveTick: function (entry) {
      var socket = entry.socket;
      if (!socket || socket.readyState !== MFWS.READY_STATE_OPEN) {
        return;
      }
      if (Date.now() - entry.lastSendAtMs < entry.heartbeatMs * MFWS.KEEPALIVE_IDLE_FACTOR) {
        return;
      }
      var seq = entry.lastWireSeq + 1;
      var frame = '{"t":"clock.ping","seq":' + seq + ',"d":{"clientTimeMs":' + MFWS.KEEPALIVE_CLIENT_TIME_MS + '}}';
      try {
        socket.send(frame);
      } catch (error) {
        entry.events.push('eKeepalive send failed: ' + error);
        return;
      }
      // Later C# frames shift up so that their wire seq stays above the keepalive's.
      entry.lastWireSeq = seq;
      entry.seqOffset = seq - entry.lastClientSeq;
      entry.lastSendAtMs = Date.now();
    },

    // Starts the keepalive timer once the handshake is done (a ping before hello is a protocol violation).
    startKeepalive: function (entry, heartbeatMs) {
      MFWS.stopKeepalive(entry);
      entry.heartbeatMs = Math.max(MFWS.MIN_HEARTBEAT_MS, heartbeatMs);
      var tickMs = Math.max(MFWS.MIN_KEEPALIVE_TICK_MS, Math.floor(entry.heartbeatMs / 2));
      var onTick = function () {
        MFWS.keepaliveTick(entry);
      };
      var startFallback = function () {
        if (entry.timerId === null) {
          entry.timerId = setInterval(onTick, tickMs);
        }
      };
      try {
        var source = 'setInterval(function () { postMessage(0); }, ' + tickMs + ');';
        var blobUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
        var worker = new Worker(blobUrl);
        URL.revokeObjectURL(blobUrl);
        worker.onmessage = onTick;
        worker.onerror = function () {
          MFWS.stopKeepalive(entry);
          if (entry.socket && entry.socket.readyState === MFWS.READY_STATE_OPEN) {
            startFallback();
          }
        };
        entry.worker = worker;
      } catch (error) {
        // No Worker or blob: workers (for example blocked by a CSP); use the page timer.
        startFallback();
      }
    },

    // True for the server's answer to a keepalive ping (clock.pong echoing KEEPALIVE_CLIENT_TIME_MS).
    isKeepalivePong: function (text) {
      var head = text.substring(0, MFWS.MARKER_WINDOW);
      return head.indexOf(MFWS.CLOCK_PONG_MARKER) >= 0 && text.indexOf('"clientTimeMs":' + MFWS.KEEPALIVE_CLIENT_TIME_MS + ',') >= 0;
    },

    // Reads heartbeatMs from a hello.ok frame and starts the keepalive; ignores other frames.
    onServerText: function (entry, text) {
      var head = text.substring(0, MFWS.MARKER_WINDOW);
      if (entry.worker || entry.timerId !== null || head.indexOf(MFWS.HELLO_OK_MARKER) < 0) {
        return;
      }
      var heartbeatMs = MFWS.DEFAULT_HEARTBEAT_MS;
      try {
        var envelope = JSON.parse(text);
        if (envelope && envelope.d && typeof envelope.d.heartbeatMs === 'number') {
          heartbeatMs = envelope.d.heartbeatMs;
        }
      } catch (error) {
        // Keep the default interval.
      }
      MFWS.startKeepalive(entry, heartbeatMs);
    },

    // Returns a malloc'd UTF-8 copy; Unity's string marshaller frees it.
    allocString: function (text) {
      var size = lengthBytesUTF8(text) + 1;
      var pointer = _malloc(size);
      stringToUTF8(text, pointer, size);
      return pointer;
    },
  },

  // Creates a socket and starts connecting. Returns its id (always > 0).
  MFWS_Create: function (urlPointer) {
    var url = UTF8ToString(urlPointer);
    var id = MFWS.nextId++;
    var entry = {
      socket: null,
      events: [],
      keepalivePong: null,
      worker: null,
      timerId: null,
      heartbeatMs: MFWS.DEFAULT_HEARTBEAT_MS,
      lastClientSeq: 0,
      lastWireSeq: 0,
      seqOffset: 0,
      lastSendAtMs: Date.now(),
    };
    MFWS.sockets[id] = entry;

    try {
      var socket = new WebSocket(url);
      entry.socket = socket;
      socket.onopen = function () {
        entry.events.push('o');
      };
      socket.onmessage = function (event) {
        if (typeof event.data === 'string') {
          MFWS.onServerText(entry, event.data);
          if (MFWS.isKeepalivePong(event.data)) {
            // One pending keepalive pong at most, delivered ahead of the backlog: a hidden tab queues
            // every room broadcast, and the C# side reads a bounded number of events per frame.
            entry.keepalivePong = 'm' + event.data;
          } else {
            entry.events.push('m' + event.data);
          }
        } else {
          entry.events.push('eIgnored a binary message.');
        }
      };
      socket.onerror = function () {
        entry.events.push('eWebSocket error (the browser gives no details).');
      };
      socket.onclose = function (event) {
        MFWS.stopKeepalive(entry);
        entry.events.push('c' + event.code + '|' + event.reason);
      };
    } catch (error) {
      entry.events.push('eWebSocket could not be created: ' + error);
      entry.events.push('c' + MFWS.CLOSE_ABNORMAL + '|' + error);
    }
    return id;
  },

  // Sends a text message. Returns 1 when handed to the browser, 0 when the socket is not open.
  MFWS_Send: function (id, textPointer) {
    var entry = MFWS.sockets[id];
    if (!entry || !entry.socket || entry.socket.readyState !== MFWS.READY_STATE_OPEN) {
      return 0;
    }
    try {
      var frame = MFWS.renumber(entry, UTF8ToString(textPointer));
      entry.socket.send(frame);
      entry.lastSendAtMs = Date.now();
      return 1;
    } catch (error) {
      entry.events.push('eSend failed: ' + error);
      return 0;
    }
  },

  // Starts the closing handshake. Browsers only accept code 1000 or 3000-4999; other codes
  // fall back to a close without a code.
  MFWS_Close: function (id, code, reasonPointer) {
    var entry = MFWS.sockets[id];
    if (!entry || !entry.socket) {
      return;
    }
    MFWS.stopKeepalive(entry);
    var codeAllowed = code === MFWS.CLOSE_NORMAL || (code >= MFWS.CLOSE_APP_MIN && code <= MFWS.CLOSE_APP_MAX);
    try {
      if (codeAllowed) {
        entry.socket.close(code, UTF8ToString(reasonPointer));
      } else {
        entry.socket.close();
      }
    } catch (error) {
      entry.events.push('eClose failed: ' + error);
    }
  },

  // Returns the browser readyState: 0 connecting, 1 open, 2 closing, 3 closed (also for unknown ids).
  MFWS_State: function (id) {
    var entry = MFWS.sockets[id];
    if (!entry || !entry.socket) {
      return MFWS.READY_STATE_CLOSED;
    }
    return entry.socket.readyState;
  },

  // Returns the next queued event as a malloc'd UTF-8 string, or a null pointer when none.
  MFWS_PollEvent: function (id) {
    var entry = MFWS.sockets[id];
    if (!entry) {
      return 0;
    }
    if (entry.keepalivePong !== null) {
      var pong = entry.keepalivePong;
      entry.keepalivePong = null;
      return MFWS.allocString(pong);
    }
    if (entry.events.length === 0) {
      return 0;
    }
    return MFWS.allocString(entry.events.shift());
  },

  // Forgets a socket: detaches its handlers, closes it if needed and drops queued events.
  MFWS_Destroy: function (id) {
    var entry = MFWS.sockets[id];
    if (!entry) {
      return;
    }
    delete MFWS.sockets[id];
    MFWS.stopKeepalive(entry);
    var socket = entry.socket;
    if (!socket) {
      return;
    }
    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
    if (socket.readyState !== MFWS.READY_STATE_CLOSED) {
      try {
        socket.close();
      } catch (error) {
        console.warn('[MissionForge] WebSocket close failed while destroying socket ' + id + ': ' + error);
      }
    }
  },
};

autoAddDeps(MissionForgeWebSocketLibrary, '$MFWS');
mergeInto(LibraryManager.library, MissionForgeWebSocketLibrary);
