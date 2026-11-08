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

const apiBase = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");
export const apiOrigin = new URL(apiBase, window.location.origin).origin;

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
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

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(response.status, typeof data?.message === "string" ? data.message : "The request failed. Please try again.");
  }
  if (data === null) throw new Error("QuickPoll returned an unexpected response.");
  return data as T;
}

function postJson<T>(path: string, body: object, token?: string) {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (token) headers.set("Authorization", "Bearer " + token);
  return request<T>(path, {
    method: "POST",
    headers,
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
  return postJson<CreatedPoll>("/polls", input);
}

export function getPoll(joinCode: string, signal: AbortSignal) {
  return request<PublicPoll>(publicPollPath(joinCode), { signal });
}

export function changePollStatus(id: string, action: "activate" | "close", organizerToken: string) {
  return request<Pick<PublicPoll, "id" | "status">>("/polls/" + encodeURIComponent(id) + "/" + action, {
    method: "POST",
    headers: { Authorization: "Bearer " + organizerToken },
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
