import type { ParticipantCredentials } from "../../services/api";

interface OrganizerSession {
  joinCode: string;
  organizerToken: string;
}

function sessionKey(role: "organizer" | "participant", pollId: string) {
  return "quickpoll:" + role + ":" + pollId;
}

function readSession(key: string): unknown {
  try {
    const value = sessionStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

export function getOrganizerSession(pollId: string): OrganizerSession | null {
  const value = readSession(sessionKey("organizer", pollId));
  return value && typeof value === "object" &&
    "joinCode" in value && typeof value.joinCode === "string" && value.joinCode &&
    "organizerToken" in value && typeof value.organizerToken === "string" && value.organizerToken
    ? { joinCode: value.joinCode, organizerToken: value.organizerToken }
    : null;
}

export function saveOrganizerSession(pollId: string, session: OrganizerSession) {
  const { joinCode, organizerToken } = session;
  sessionStorage.setItem(sessionKey("organizer", pollId), JSON.stringify({ joinCode, organizerToken }));
}

export function getParticipantSession(pollId: string): ParticipantCredentials | null {
  const value = readSession(sessionKey("participant", pollId));
  return value && typeof value === "object" &&
    "participantId" in value && typeof value.participantId === "string" && value.participantId &&
    "participantToken" in value && typeof value.participantToken === "string" && value.participantToken
    ? { participantId: value.participantId, participantToken: value.participantToken }
    : null;
}

export function saveParticipantSession(pollId: string, session: ParticipantCredentials) {
  sessionStorage.setItem(sessionKey("participant", pollId), JSON.stringify(session));
}
