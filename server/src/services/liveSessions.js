const { randomBytes, createHash } = require("node:crypto");
const { EventEmitter } = require("node:events");
const repository = require("../repositories/liveSessions");
const { isJoinCode, isPositiveBigintId, validateText, formatPollResults } = require("./polls");

const sessionEvents = new EventEmitter();

class LiveSessionError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function requireJoinCode(joinCode) {
  if (!isJoinCode(joinCode)) throw new LiveSessionError(404, "SESSION_NOT_FOUND", "Session not found");
}

function requireQuestionId(id) {
  if (!isPositiveBigintId(id)) throw new LiveSessionError(404, "QUESTION_NOT_FOUND", "Question not found");
}

function hashToken(token) {
  return createHash("sha256").update(token).digest();
}

function requireParticipantToken(token) {
  if (!token) throw new LiveSessionError(401, "PARTICIPANT_TOKEN_REQUIRED", "Session participant bearer token required");
  if (/^[A-Za-z0-9_-]{43}$/.test(token)) return hashToken(token);
  if (/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(token)) return hashToken(token.toLowerCase());
  throw new LiveSessionError(403, "PARTICIPANT_FORBIDDEN", "Session participant access denied");
}

async function transition(organizerId, sessionId, action, questionId) {
  if (!isPositiveBigintId(sessionId)) throw new LiveSessionError(404, "SESSION_NOT_FOUND", "Session not found");
  if (action !== "start") requireQuestionId(questionId);

  const { outcome, change } = await repository.transition({ organizerId, sessionId, action, questionId });
  if (outcome === "not-found") throw new LiveSessionError(404, "SESSION_NOT_FOUND", "Session not found");
  if (outcome === "cannot-start") {
    throw new LiveSessionError(409, "CANNOT_START", "Only a draft session with questions can be started");
  }
  if (outcome !== "ok") {
    throw new LiveSessionError(409, "INVALID_QUESTION_TRANSITION", "This question cannot be changed in the current session state");
  }

  sessionEvents.emit("session-state-updated", { sessionId });
  if (change.status === "closed") sessionEvents.emit("session-completed", { sessionId });
  return change;
}

async function joinSession(joinCode, input) {
  requireJoinCode(joinCode);
  const name = validateText(input?.displayName, 100, "Display name must be a string containing 1 to 100 characters");
  const participantToken = randomBytes(32).toString("base64url");
  const joined = await repository.joinSession(joinCode, name, hashToken(participantToken));
  if (!joined) throw new LiveSessionError(404, "SESSION_NOT_FOUND", "Session not found");
  if (joined.status !== "active") throw new LiveSessionError(409, "SESSION_NOT_JOINABLE", "Only ongoing sessions accept participants");
  return { participantId: joined.participantId, participantToken };
}

async function getQuestion(joinCode, questionId, token) {
  requireJoinCode(joinCode);
  requireQuestionId(questionId);
  const question = await repository.findQuestion(joinCode, questionId, requireParticipantToken(token));
  if (!question) throw new LiveSessionError(404, "QUESTION_NOT_FOUND", "Question not found");
  if (!question.authorized) throw new LiveSessionError(403, "PARTICIPANT_FORBIDDEN", "Session participant access denied");
  if (question.status !== "active" || question.sessionStatus !== "active") {
    throw new LiveSessionError(409, "QUESTION_NOT_ACTIVE", "This question is not active");
  }
  const { id, question: text, status, position, options, hasVoted } = question;
  return { id, question: text, status, position, options, hasVoted };
}

const voteErrors = {
  "not-found": [404, "QUESTION_NOT_FOUND", "Question not found"],
  forbidden: [403, "PARTICIPANT_FORBIDDEN", "Session participant access denied"],
  "not-active": [409, "QUESTION_NOT_ACTIVE", "This question is not active"],
  "invalid-option": [400, "INVALID_OPTION", "Option does not belong to this question"],
  duplicate: [409, "ALREADY_VOTED", "This participant has already voted on this question"],
};

async function castVote(joinCode, questionId, token, input) {
  requireJoinCode(joinCode);
  requireQuestionId(questionId);
  const tokenHash = requireParticipantToken(token);
  const optionId = input?.optionId;
  if (!isPositiveBigintId(optionId)) throw new LiveSessionError(400, "INVALID_OPTION", "optionId must be a positive BIGINT ID string");

  const result = await repository.recordVote({ joinCode, questionId, optionId, tokenHash });
  if (result.outcome !== "ok") throw new LiveSessionError(...voteErrors[result.outcome]);
  sessionEvents.emit("session-results-updated", { sessionId: result.sessionId, questionId });
  return result.vote;
}

function formatResults(row) {
  const { id, question, status, position, options } = row;
  return formatPollResults({ id, question, status, position, options });
}

async function getResults(joinCode, questionId) {
  requireJoinCode(joinCode);
  requireQuestionId(questionId);
  const [row] = await repository.findResults(joinCode, questionId);
  if (!row?.id) throw new LiveSessionError(404, "QUESTION_NOT_FOUND", "Question not found");
  if (row.status === "draft") throw new LiveSessionError(409, "RESULTS_UNAVAILABLE", "Results are unavailable for draft questions");
  return formatResults(row);
}

async function getSummary(joinCode) {
  requireJoinCode(joinCode);
  const rows = await repository.findResults(joinCode);
  if (rows.length === 0) throw new LiveSessionError(404, "SESSION_NOT_FOUND", "Session not found");
  return {
    title: rows[0].title,
    status: rows[0].sessionStatus,
    questions: rows.filter((row) => row.id).map(formatResults),
  };
}

module.exports = { transition, joinSession, getQuestion, castVote, getResults, getSummary, sessionEvents, LiveSessionError };
