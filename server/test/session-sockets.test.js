const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { test } = require("node:test");
const pool = require("../src/config/db");
const { attachPollSockets } = require("../src/sockets/polls");
const { attachSessionSockets } = require("../src/sockets/sessions");
const { pollEvents } = require("../src/services/polls");
const { sessionEvents } = require("../src/services/liveSessions");

test("isolates session and standalone socket rooms even when their IDs match", async (t) => {
  const io = new EventEmitter();
  const broadcasts = [];
  io.to = (room) => ({ emit: (event, payload) => broadcasts.push({ room, event, payload }) });
  t.mock.method(pool, "query", async (sql, [code]) => ({
    rows: code === "SHARED" ? [{ id: "7" }] : [],
  }));
  attachPollSockets(io);
  attachSessionSockets(io);
  attachSessionSockets(io);

  const socket = new EventEmitter();
  const rooms = new Set();
  Object.assign(socket, {
    connected: true,
    join: (room) => rooms.add(room),
    leave: (room) => rooms.delete(room),
  });
  io.emit("connection", socket);
  const command = (name, code) => new Promise((resolve) => socket.emit(name, code, resolve));

  assert.equal(socket.listenerCount("join-session"), 1);
  assert.equal((await command("join-session", "UNKNOWN")).status, 404);
  assert.deepEqual(await command("join-session", "SHARED"), { ok: true, sessionId: "7" });
  assert.deepEqual(await command("join-poll", "SHARED"), { ok: true, pollId: "7" });
  assert.deepEqual([...rooms], ["session:7", "poll:7"]);
  assert.deepEqual(await command("leave-session", "SHARED"), { ok: true });
  assert.deepEqual([...rooms], ["poll:7"]);

  const state = { sessionId: "7" };
  const vote = { sessionId: "7", questionId: "12" };
  sessionEvents.emit("session-state-updated", state);
  sessionEvents.emit("session-results-updated", vote);
  sessionEvents.emit("session-completed", state);
  pollEvents.emit("results-updated", { pollId: "7" });
  assert.deepEqual(broadcasts, [
    { room: "session:7", event: "session-state-updated", payload: state },
    { room: "session:7", event: "session-results-updated", payload: vote },
    { room: "session:7", event: "session-completed", payload: state },
    { room: "poll:7", event: "results-updated", payload: { pollId: "7" } },
  ]);
});
