export type PollStatus = "draft" | "active" | "closed";

export interface PollOption {
  id: string;
  text: string;
}

export interface PublicPoll {
  id: string;
  question: string;
  status: PollStatus;
  options: PollOption[];
}

interface CreatePollInput {
  question: string;
  options: string[];
}

export interface CreatedPoll extends CreatePollInput {
  id: string;
  joinCode: string;
  status: PollStatus;
  organizerToken: string;
}

export interface ParticipantCredentials {
  participantId: string;
  participantToken: string;
}

interface RecordedVote {
  voteId: string;
  optionId: string;
}

export interface PollResults extends Omit<PublicPoll, "options"> {
  totalVotes: number;
  options: (PollOption & { voteCount: number; percentage: number })[];
}

export interface OrganizerAccount {
  id: string;
  email: string;
}

export interface OwnedPoll extends Omit<PublicPoll, "options"> {
  joinCode: string;
  createdAt: string;
}

export interface OwnedSession {
  id: string;
  title: string;
  joinCode: string;
  status: PollStatus;
  createdAt: string;
  updatedAt: string;
  activeQuestionId: string | null;
  questionCount?: number;
}

export interface SessionQuestion extends PublicPoll {
  position: number;
}

export interface SessionDetails extends OwnedSession {
  questions: SessionQuestion[];
}

const apiBase = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");
export const apiOrigin = new URL(apiBase, window.location.origin).origin;

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(apiBase + path, init);
  } catch (error) {
    if (init?.signal?.aborted) throw error;
    throw new Error("Could not reach QuickPoll. Check your connection and try again.", { cause: error });
  }

  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(response.status, typeof data?.message === "string" ? data.message : "The request failed. Please try again.",
      typeof data?.code === "string" ? data.code : undefined);
  }
  if (data === null) throw new Error("QuickPoll returned an unexpected response.");
  return data as T;
}

function postJson<T>(path: string, body: object, token?: string, credentials?: RequestCredentials) {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (token) headers.set("Authorization", "Bearer " + token);
  return request<T>(path, {
    method: "POST",
    headers,
    credentials,
    body: JSON.stringify(body),
  });
}

function publicPollPath(joinCode: string) {
  return "/polls/code/" + encodeURIComponent(joinCode);
}

export function getServerHealth(signal: AbortSignal) {
  return request<{ status: string; service: string }>("/health", { signal });
}

export function createPoll(input: CreatePollInput) {
  return postJson<CreatedPoll>("/polls", input, undefined, "include");
}

export function getPoll(joinCode: string, signal: AbortSignal) {
  return request<PublicPoll>(publicPollPath(joinCode), { signal });
}

export function changePollStatus(id: string, action: "activate" | "close", organizerToken?: string) {
  return request<Pick<PublicPoll, "id" | "status">>("/polls/" + encodeURIComponent(id) + "/" + action, {
    method: "POST",
    credentials: organizerToken ? "omit" : "include",
    headers: organizerToken ? { Authorization: "Bearer " + organizerToken } : undefined,
  });
}

export function joinPoll(joinCode: string, displayName: string) {
  return postJson<ParticipantCredentials>(publicPollPath(joinCode) + "/join", { displayName });
}

export function castVote(joinCode: string, optionId: string, participantToken: string) {
  return postJson<RecordedVote>(publicPollPath(joinCode) + "/vote", { optionId }, participantToken);
}

export function getPollResults(joinCode: string, signal: AbortSignal) {
  return request<PollResults>(publicPollPath(joinCode) + "/results", { signal });
}

type AccountResponse = { organizer: OrganizerAccount };

export function registerOrganizer(email: string, password: string) {
  return postJson<AccountResponse>("/auth/register", { email, password }, undefined, "include");
}

export function loginOrganizer(email: string, password: string) {
  return postJson<AccountResponse>("/auth/login", { email, password }, undefined, "include");
}

export function logoutOrganizer() {
  return request<void>("/auth/logout", { method: "POST", credentials: "include" });
}

export function getCurrentOrganizer() {
  return request<AccountResponse>("/auth/me", { credentials: "include" });
}

export function getOwnedPolls(signal?: AbortSignal) {
  return request<{ polls: OwnedPoll[] }>("/organizer/polls", { credentials: "include", signal });
}

const sessionsPath = "/organizer/sessions";

export function getOwnedSessions(signal: AbortSignal) {
  return request<{ sessions: OwnedSession[] }>(sessionsPath, { credentials: "include", signal });
}

export function createSession(title: string) {
  return postJson<{ session: OwnedSession }>(sessionsPath, { title }, undefined, "include");
}

function sessionPath(id: string) {
  return sessionsPath + "/" + encodeURIComponent(id);
}

export function getSessionDetails(id: string, signal: AbortSignal) {
  return request<{ session: SessionDetails }>(sessionPath(id), { credentials: "include", signal });
}

export function addSessionQuestion(id: string, input: CreatePollInput) {
  return postJson<{ question: SessionQuestion }>(sessionPath(id) + "/questions", input, undefined, "include");
}

export interface PublicSession {
  title: string;
  joinCode: string;
  status: PollStatus;
  activeQuestionId: string | null;
  currentQuestion: Omit<SessionQuestion, "options"> | null;
}

export type SessionResults = PollResults & { position: number };

function publicSessionPath(code: string) {
  return "/sessions/code/" + encodeURIComponent(code);
}

function sessionQuestionPath(code: string, id: string) {
  return publicSessionPath(code) + "/questions/" + encodeURIComponent(id);
}

export function getPublicSession(code: string, signal: AbortSignal) {
  return request<{ session: PublicSession }>(publicSessionPath(code), { signal, credentials: "omit" });
}

export function changeSessionStatus(id: string, action: "start" | "open" | "close", questionId?: string) {
  const path = sessionPath(id) + (questionId ? "/questions/" + encodeURIComponent(questionId) : "");
  return request<{ status: PollStatus }>(path + "/" + action, { method: "POST", credentials: "include" });
}

export function joinSession(code: string, displayName: string) {
  return postJson<ParticipantCredentials>(publicSessionPath(code) + "/join", { displayName }, undefined, "omit");
}

export function getSessionQuestion(code: string, id: string, token: string, signal: AbortSignal) {
  return request<{ question: SessionQuestion & { hasVoted: boolean } }>(sessionQuestionPath(code, id), {
    signal, headers: { Authorization: "Bearer " + token }, credentials: "omit",
  });
}

export function castSessionVote(code: string, id: string, optionId: string, token: string) {
  return postJson<RecordedVote>(sessionQuestionPath(code, id) + "/vote", { optionId }, token, "omit");
}

export async function getSessionResults(code: string, id: string, signal: AbortSignal) {
  const { results } = await request<{ results: SessionResults }>(sessionQuestionPath(code, id) + "/results", { signal, credentials: "omit" });
  return results;
}

export function getSessionSummary(code: string, signal: AbortSignal) {
  return request<{ summary: { title: string; status: PollStatus; questions: SessionResults[] } }>(
    publicSessionPath(code) + "/summary", { signal, credentials: "omit" },
  );
}
