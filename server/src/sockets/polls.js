const pollService = require("../services/polls");

const attachedServers = new WeakMap();

function attachRoomSockets(io, { kind, idKey, lookup, events, eventNames }) {
  const attached = attachedServers.get(io) ?? new Set();
  if (attached.has(kind)) return;
  attached.add(kind);
  attachedServers.set(io, attached);

  const label = kind === "poll" ? "Poll" : "Session";
  const roomName = (id) => `${kind}:${id}`;

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
            console.error(label + " room command failed:", error.code);
            result = { ok: false, status: 500, message: "Could not update " + kind + " subscription" };
          }
          if (socket.connected && typeof acknowledge === "function") acknowledge(result);
        });
      });
    }

    register("join-" + kind, async (joinCode) => {
      const existing = roomsByCode.get(joinCode);
      if (existing) return { ok: true, [idKey]: existing };

      const item = await lookup(joinCode);
      if (!item) return { ok: false, status: 404, message: label + " not found" };
      if (socket.connected) {
        await socket.join(roomName(item.id));
        roomsByCode.set(joinCode, item.id);
      }
      return { ok: true, [idKey]: item.id };
    });

    register("leave-" + kind, async (joinCode) => {
      const id = roomsByCode.get(joinCode);
      if (id) {
        await socket.leave(roomName(id));
        roomsByCode.delete(joinCode);
      }
      return { ok: true };
    });
  }

  io.on("connection", registerRoomCommands);
  for (const event of eventNames) {
    events.on(event, (payload) => {
      try {
        io.to(roomName(payload[idKey])).emit(event, payload);
      } catch (error) {
        console.error(label + " broadcast failed:", error.code);
      }
    });
  }
}

function attachPollSockets(io) {
  attachRoomSockets(io, {
    kind: "poll",
    idKey: "pollId",
    lookup: pollService.getPollByCode,
    events: pollService.pollEvents,
    eventNames: ["results-updated", "poll-status-updated"],
  });
}

module.exports = { attachPollSockets, attachRoomSockets };
