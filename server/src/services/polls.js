const { createHash, randomBytes, randomUUID, timingSafeEqual } = require("node:crypto");
const pollRepository = require("../repositories/polls");

const MAX_JOIN_CODE_ATTEMPTS = 5;
const PREVIOUS_STATUS = new Map([
  ["active", "draft"],
  ["closed", "active"],
]);

class InvalidPollError extends Error {}
class PollNotActiveError extends Error {}
class OrganizerForbiddenError extends Error {}
class PollTransitionError extends Error {}

function hashOrganizerToken(token) {
  return createHash("sha256").update(token).digest();
}

function validateText(value, maxLength, message) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.includes("\0") || !text.isWellFormed() || [...text].length > maxLength) {
    throw new InvalidPollError(message);
  }
  return text;
}

async function createPoll(input) {
  const question = validateText(
    input?.question,
    300,
    "Question must be a string containing 1 to 300 characters",
  );

  const rawOptions = input.options;
  if (!Array.isArray(rawOptions) || rawOptions.length < 2 || rawOptions.length > 6) {
    throw new InvalidPollError("Provide 2 to 6 options");
  }

  const options = rawOptions.map((option) =>
    validateText(option, 150, "Each option must be a string containing 1 to 150 characters"),
  );
  if (new Set(options).size !== options.length) {
    throw new InvalidPollError("Options must be distinct");
  }

  const organizerToken = randomBytes(32).toString("base64url");
  const organizerTokenHash = hashOrganizerToken(organizerToken);
  for (let attempt = 0; attempt < MAX_JOIN_CODE_ATTEMPTS; attempt += 1) {
    const joinCode = randomBytes(5).toString("hex").toUpperCase();
    const poll = await pollRepository.insertDraft({ joinCode, question, options, organizerTokenHash });
    if (poll) return { ...poll, organizerToken };
  }

  return null;
}

function getPollByCode(joinCode) {
  if (joinCode.includes("\0")) return null;
  return pollRepository.findPublicByCode(joinCode);
}

async function joinPoll(joinCode, input) {
  const displayName = validateText(
    input?.displayName,
    100,
    "Display name must be a string containing 1 to 100 characters",
  );
  if (joinCode.includes("\0")) return null;

  const result = await pollRepository.insertParticipant({
    joinCode,
    displayName,
    participantToken: randomUUID(),
  });
  if (!result) return null;

  const { status, participantId, participantToken } = result;
  if (status !== "active") {
    throw new PollNotActiveError(`This poll is ${status}. Only active polls can be joined.`);
  }
  return { participantId, participantToken };
}

async function changePollStatus(id, organizerToken, nextStatus) {
  if (!/^[1-9]\d{0,18}$/.test(id) || BigInt(id) > 9223372036854775807n) return null;

  const poll = await pollRepository.findLifecycleById(id);
  if (!poll) return null;

  const { organizerTokenHash } = poll;
  const suppliedHash = hashOrganizerToken(organizerToken);
  if (organizerTokenHash?.length !== suppliedHash.length ||
      !timingSafeEqual(organizerTokenHash, suppliedHash)) {
    throw new OrganizerForbiddenError("Organizer access denied");
  }

  const previousStatus = PREVIOUS_STATUS.get(nextStatus);
  if (!previousStatus) throw new PollTransitionError("Unsupported poll transition");
  const conflictMessage = `Poll must be ${previousStatus} to become ${nextStatus}`;
  if (poll.status !== previousStatus) throw new PollTransitionError(conflictMessage);

  const updated = await pollRepository.updatePollStatus({
    id, previousStatus, nextStatus, organizerTokenHash,
  });
  if (!updated) throw new PollTransitionError(conflictMessage);
  return updated;
}

module.exports = {
  createPoll, getPollByCode, joinPoll, changePollStatus,
  InvalidPollError, PollNotActiveError, OrganizerForbiddenError, PollTransitionError,
};
