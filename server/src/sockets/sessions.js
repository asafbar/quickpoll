const { attachRoomSockets } = require("./polls");
const { findSessionRoom } = require("../repositories/sessions");
const { sessionEvents } = require("../services/liveSessions");

function attachSessionSockets(io) {
  attachRoomSockets(io, {
    kind: "session",
    idKey: "sessionId",
    lookup: findSessionRoom,
    events: sessionEvents,
    eventNames: ["session-state-updated", "session-results-updated", "session-completed"],
  });
}

module.exports = { attachSessionSockets };
