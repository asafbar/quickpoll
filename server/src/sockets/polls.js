const pollService = require("../services/polls");

const attachedServers = new WeakSet();
const roomName = (pollId) => `poll:${pollId}`;

function registerRoomCommands(socket) {
  const roomsByCode = new Map();
  let pending = Promise.resolve();

  function register(event, command) {
    socket.on(event, (joinCode, acknowledge) => {
      // Process join and leave in arrival order, including while lookup is pending.
      pending = pending.then(async () => {
        if (!socket.connected) return;
        let result;
        try {
          result = pollService.isJoinCode(joinCode)
            ? await command(joinCode)
            : { ok: false, status: 400, message: "Invalid join code" };
        } catch (error) {
          console.error("Poll room command failed:", error.code);
          result = { ok: false, status: 500, message: "Could not update poll subscription" };
        }
        if (socket.connected && typeof acknowledge === "function") acknowledge(result);
      });
    });
  }

  register("join-poll", async (joinCode) => {
    const existing = roomsByCode.get(joinCode);
    if (existing) return { ok: true, pollId: existing };

    const poll = await pollService.getPollByCode(joinCode);
    if (!poll) return { ok: false, status: 404, message: "Poll not found" };
    if (socket.connected) {
      await socket.join(roomName(poll.id));
      roomsByCode.set(joinCode, poll.id);
    }
    return { ok: true, pollId: poll.id };
  });

  register("leave-poll", async (joinCode) => {
    const pollId = roomsByCode.get(joinCode);
    if (pollId) {
      await socket.leave(roomName(pollId));
      roomsByCode.delete(joinCode);
    }
    return { ok: true };
  });
}

function attachPollSockets(io) {
  if (attachedServers.has(io)) return;
  attachedServers.add(io);

  io.on("connection", registerRoomCommands);
  for (const event of ["results-updated", "poll-status-updated"]) {
    pollService.pollEvents.on(event, (payload) => {
      try {
        io.to(roomName(payload.pollId)).emit(event, payload);
      } catch (error) {
        console.error("Poll broadcast failed:", error.code);
      }
    });
  }
}

module.exports = { attachPollSockets };
