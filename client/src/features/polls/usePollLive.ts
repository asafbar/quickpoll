import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import { apiOrigin } from "../../services/api";

export type LiveStatus = "Live" | "Reconnecting" | "Offline";

const pollRoom = { kind: "poll", idKey: "pollId", state: ["poll-status-updated"], results: "results-updated" } as const;
const sessionRoom = {
  kind: "session", idKey: "sessionId", state: ["session-state-updated", "session-completed"], results: "session-results-updated",
} as const;

type Room = typeof pollRoom | typeof sessionRoom;
type RoomEvent = { pollId?: string; sessionId?: string };
type JoinAck = ({ ok: true } & RoomEvent) | { ok: false; status: number };

function useLiveRoom(room: Room, joinCode: string, expectedId: string | undefined, refresh: () => void, watchResults: boolean) {
  const [connection, setConnection] = useState<LiveStatus>("Reconnecting");
  const [resultsVersion, setResultsVersion] = useState(0);

  useEffect(() => {
    if (!joinCode) return;

    const socket: Socket = io(apiOrigin, { autoConnect: false });
    let generation = 0;
    let roomId: string | undefined;
    let retry: number | undefined;
    let resultsTimer: number | undefined;

    function refreshResults() {
      window.clearTimeout(resultsTimer);
      resultsTimer = undefined;
      if (watchResults) setResultsVersion((version) => version + 1);
    }

    function joinRoom(current: number) {
      if (current !== generation || !socket.connected) return;
      setConnection("Reconnecting");
      socket.timeout(5000).emit("join-" + room.kind, joinCode, (error: Error | null, ack?: JoinAck) => {
        if (current !== generation || !socket.connected) return;
        if (error || !ack || (!ack.ok && ack.status >= 500)) {
          retry = window.setTimeout(() => joinRoom(current), 2000);
          return;
        }
        if (!ack.ok || !ack[room.idKey] || (expectedId && ack[room.idKey] !== expectedId)) {
          setConnection("Offline");
          refresh();
          return;
        }
        roomId = ack[room.idKey];
        setConnection("Live");
        refresh();
        refreshResults();
      });
    }

    function onConnect() {
      window.clearTimeout(retry);
      joinRoom(++generation);
    }

    function onDisconnect() {
      generation++;
      roomId = undefined;
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

    function onStatus(event: RoomEvent) {
      if (roomId && event[room.idKey] === roomId) refresh();
    }

    function onResults(event: RoomEvent) {
      if (roomId && event[room.idKey] === roomId && resultsTimer === undefined) {
        // A burst of votes only needs one fresh snapshot.
        resultsTimer = window.setTimeout(refreshResults, 150);
      }
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onDisconnect);
    for (const event of room.state) socket.on(event, onStatus);
    if (watchResults) socket.on(room.results, onResults);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    socket.connect();

    return () => {
      generation++;
      window.clearTimeout(retry);
      window.clearTimeout(resultsTimer);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onDisconnect);
      for (const event of room.state) socket.off(event, onStatus);
      socket.off(room.results, onResults);
      if (socket.connected) socket.emit("leave-" + room.kind, joinCode);
      socket.disconnect();
    };
  }, [room, joinCode, expectedId, refresh, watchResults]);

  return { connection, resultsVersion };
}

export function usePollLive(joinCode: string, pollId: string | undefined, refresh: () => void, watchResults = false) {
  return useLiveRoom(pollRoom, pollId ? joinCode : "", pollId, refresh, watchResults);
}

export function useSessionLive(joinCode: string, refresh: () => void, watchResults = true) {
  return useLiveRoom(sessionRoom, joinCode, undefined, refresh, watchResults);
}
