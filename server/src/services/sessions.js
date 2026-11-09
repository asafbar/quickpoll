const repository = require("../repositories/sessions");
const {
  validateText, validatePollInput, isPositiveBigintId, isJoinCode, generateJoinCode, MAX_JOIN_CODE_ATTEMPTS,
} = require("./polls");

class SessionNotDraftError extends Error {}
class SessionCodeUnavailableError extends Error {}

async function createSession(organizerId, input) {
  const title = validateText(input?.title, 150, "Title must be a string containing 1 to 150 characters");
  for (let attempt = 0; attempt < MAX_JOIN_CODE_ATTEMPTS; attempt += 1) {
    const session = await repository.insertSession({ organizerId, title, joinCode: generateJoinCode() });
    if (session) return session;
  }
  throw new SessionCodeUnavailableError();
}

function listSessions(organizerId) {
  return repository.findOwnedSessions(organizerId);
}

function getSession(organizerId, sessionId) {
  if (!isPositiveBigintId(sessionId)) return null;
  return repository.findOwnedSession(organizerId, sessionId);
}

function getPublicSession(joinCode) {
  if (!isJoinCode(joinCode)) return null;
  return repository.findPublicSession(joinCode);
}

async function addQuestion(organizerId, sessionId, input) {
  if (!isPositiveBigintId(sessionId)) return null;
  const { question, options } = validatePollInput(input);
  for (let attempt = 0; attempt < MAX_JOIN_CODE_ATTEMPTS; attempt += 1) {
    const result = await repository.appendQuestion({ organizerId, sessionId, question, options, joinCode: generateJoinCode() });
    if (result.outcome === "created") return result.question;
    if (result.outcome === "not-found") return null;
    if (result.outcome === "not-draft") throw new SessionNotDraftError("Questions can only be added to draft sessions");
  }
  throw new SessionCodeUnavailableError();
}

module.exports = {
  createSession, listSessions, getSession, getPublicSession, addQuestion, SessionNotDraftError, SessionCodeUnavailableError,
};
