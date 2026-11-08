const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { test } = require("node:test");
const pool = require("../src/config/db");
const { pollEvents } = require("../src/services/polls");
const { attachPollSockets } = require("../src/sockets/polls");

test("registers poll rooms once, isolates updates, and requires resubscription after reconnect", async (t) => {
  const io = new EventEmitter();
  const sockets = [];
  io.to = (room) => ({
    emit(event, payload) {
      for (const socket of sockets) {
        if (socket.connected && socket.rooms.has(room)) socket.received.push([event, payload]);
      }
    },
  });

  const polls = new Map([
    ["FIRST", { id: "21", status: "draft" }],
    ["SECOND", { id: "22", status: "active" }],
  ]);
  const query = t.mock.method(pool, "query", async (sql, [code]) => ({
    rows: polls.has(code) ? [polls.get(code)] : [],
  }));
  attachPollSockets(io);
  attachPollSockets(io);
  assert.equal(io.listenerCount("connection"), 1);

  function connect() {
    const socket = new EventEmitter();
    Object.assign(socket, {
      connected: true,
      received: [],
      rooms: new Set(),
      join(room) { this.rooms.add(room); },
      leave(room) { this.rooms.delete(room); },
      send(event, code) { return new Promise((ack) => this.emit(event, code, ack)); },
    });
    sockets.push(socket);
    io.emit("connection", socket);
    return socket;
  }

  const first = connect();
  const second = connect();
  assert.equal(first.listenerCount("join-poll"), 1);
  assert.equal((await first.send("join-poll", { joinCode: "FIRST" })).status, 400);
  assert.equal(query.mock.callCount(), 0);
  assert.equal((await first.send("join-poll", "UNKNOWN")).status, 404);
  assert.deepEqual(await first.send("join-poll", "FIRST"), { ok: true, pollId: "21" });
  assert.deepEqual(await first.send("join-poll", "FIRST"), { ok: true, pollId: "21" });
  assert.deepEqual(await second.send("join-poll", "SECOND"), { ok: true, pollId: "22" });
  assert.deepEqual([...first.rooms], ["poll:21"]);
  assert.equal(query.mock.callCount(), 3);

  const activation = { pollId: "21", status: "active" };
  const result = { pollId: "22" };
  pollEvents.emit("poll-status-updated", activation);
  pollEvents.emit("results-updated", result);
  assert.deepEqual(first.received, [["poll-status-updated", activation]]);
  assert.deepEqual(second.received, [["results-updated", result]]);

  const leaving = connect();
  await Promise.all([leaving.send("join-poll", "FIRST"), leaving.send("leave-poll", "FIRST")]);
  assert.equal(leaving.rooms.size, 0);
  await first.send("leave-poll", "FIRST");
  pollEvents.emit("results-updated", { pollId: "21" });
  assert.equal(first.received.length, 1);
  assert.equal(leaving.received.length, 0);

  second.connected = false;
  second.rooms.clear();
  const reconnected = connect();
  pollEvents.emit("results-updated", result);
  assert.equal(reconnected.received.length, 0);
  await reconnected.send("join-poll", "SECOND");
  pollEvents.emit("results-updated", result);
  assert.deepEqual(reconnected.received, [["results-updated", result]]);
  assert.equal(second.received.length, 1);
});
