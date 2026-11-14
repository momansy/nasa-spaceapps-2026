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
    var entry = { socket: null, events: [] };
    MFWS.sockets[id] = entry;

    try {
      var socket = new WebSocket(url);
      entry.socket = socket;
      socket.onopen = function () {
        entry.events.push('o');
      };
      socket.onmessage = function (event) {
        if (typeof event.data === 'string') {
          entry.events.push('m' + event.data);
        } else {
          entry.events.push('eIgnored a binary message.');
        }
      };
      socket.onerror = function () {
        entry.events.push('eWebSocket error (the browser gives no details).');
      };
      socket.onclose = function (event) {
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
      entry.socket.send(UTF8ToString(textPointer));
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
    if (!entry || entry.events.length === 0) {
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
