import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import { apiOrigin } from "../../services/api";
import type { PollStatus } from "../../services/api";

export type LiveStatus = "Live" | "Reconnecting" | "Offline";

interface PollEvent {
  pollId: string;
}

type JoinAck = { ok: true; pollId: string } | { ok: false; status: number };

interface ServerEvents {
  "results-updated": (event: PollEvent) => void;
  "poll-status-updated": (event: PollEvent & { status: PollStatus }) => void;
}

interface ClientEvents {
  "join-poll": (joinCode: string, acknowledge: (ack: JoinAck) => void) => void;
  "leave-poll": (joinCode: string) => void;
}

export function usePollLive(joinCode: string, pollId: string | undefined, refreshPoll: () => void, watchResults = false) {
  const [connection, setConnection] = useState<LiveStatus>("Reconnecting");
  const [resultsVersion, setResultsVersion] = useState(0);

  useEffect(() => {
    if (!pollId || !joinCode) return;

    const socket: Socket<ServerEvents, ClientEvents> = io(apiOrigin, { autoConnect: false });
    let generation = 0;
    let retry: number | undefined;

    function refreshResults() {
      if (watchResults) setResultsVersion((version) => version + 1);
    }

    function joinRoom(current: number) {
      if (current !== generation || !socket.connected) return;
      setConnection("Reconnecting");
      socket.timeout(5000).emit("join-poll", joinCode, (error, ack) => {
        if (current !== generation || !socket.connected) return;
        if (error || (!ack.ok && ack.status >= 500)) {
          retry = window.setTimeout(() => joinRoom(current), 2000);
          return;
        }
        if (!ack.ok || ack.pollId !== pollId) {
          setConnection("Offline");
          refreshPoll();
          return;
        }
        setConnection("Live");
        refreshPoll();
        refreshResults();
      });
    }

    function onConnect() {
      window.clearTimeout(retry);
      joinRoom(++generation);
    }

    function onDisconnect() {
      generation++;
      window.clearTimeout(retry);
      setConnection(socket.active && navigator.onLine ? "Reconnecting" : "Offline");
    }

    function onOffline() {
      setConnection("Offline");
    }

    function onOnline() {
      if (socket.connected) onConnect();
      else if (socket.active) setConnection("Reconnecting");
    }

    function onStatus(event: PollEvent) {
      if (event.pollId === pollId) refreshPoll();
    }

    function onResults(event: PollEvent) {
      if (event.pollId === pollId) refreshResults();
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onDisconnect);
    socket.on("poll-status-updated", onStatus);
    if (watchResults) socket.on("results-updated", onResults);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    socket.connect();

    return () => {
      generation++;
      window.clearTimeout(retry);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onDisconnect);
      socket.off("poll-status-updated", onStatus);
      socket.off("results-updated", onResults);
      if (socket.connected) socket.emit("leave-poll", joinCode);
      socket.disconnect();
    };
  }, [joinCode, pollId, refreshPoll, watchResults]);

  return { connection, resultsVersion };
}
