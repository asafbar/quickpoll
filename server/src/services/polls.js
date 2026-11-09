const { createHash, randomBytes, randomUUID, timingSafeEqual } = require("node:crypto");
const { EventEmitter } = require("node:events");
const pollRepository = require("../repositories/polls");

const MAX_JOIN_CODE_ATTEMPTS = 5;
const pollEvents = new EventEmitter();
const PREVIOUS_STATUS = new Map([
  ["active", "draft"],
  ["closed", "active"],
]);

class InvalidPollError extends Error {}
class PollNotActiveError extends Error {}
class OrganizerForbiddenError extends Error {}
class PollTransitionError extends Error {}
class ParticipantForbiddenError extends Error {}
class DuplicateVoteError extends Error {}
class ResultsUnavailableError extends Error {}

function isPositiveBigintId(id) {
  return typeof id === "string" && /^[1-9]\d{0,18}$/.test(id) && BigInt(id) <= 9223372036854775807n;
}

function isJoinCode(joinCode) {
  return typeof joinCode === "string" && joinCode.length > 0 && joinCode.length <= 20 &&
    !joinCode.includes("\0") && joinCode.isWellFormed() && [...joinCode].length <= 10;
}

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

function validatePollInput(input) {
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
  return { question, options };
}

function generateJoinCode() {
  return randomBytes(5).toString("hex").toUpperCase();
}

async function createPoll(input, organizerId = null) {
  const { question, options } = validatePollInput(input);
  const organizerToken = randomBytes(32).toString("base64url");
  const organizerTokenHash = hashOrganizerToken(organizerToken);
  for (let attempt = 0; attempt < MAX_JOIN_CODE_ATTEMPTS; attempt += 1) {
    const joinCode = generateJoinCode();
    const poll = await pollRepository.insertDraft({ joinCode, question, options, organizerTokenHash, organizerId });
    if (poll) return { ...poll, organizerToken };
  }

  return null;
}

function getPollByCode(joinCode) {
  if (!isJoinCode(joinCode)) return null;
  return pollRepository.findPublicByCode(joinCode);
}

async function joinPoll(joinCode, input) {
  const displayName = validateText(
    input?.displayName,
    100,
    "Display name must be a string containing 1 to 100 characters",
  );
  if (!isJoinCode(joinCode)) return null;

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

async function changePollStatus(id, organizerToken, nextStatus, organizerId) {
  if (!isPositiveBigintId(id)) return null;

  const poll = await pollRepository.findLifecycleById(id);
  if (!poll) return null;

  const { organizerTokenHash } = poll;
  if (organizerId) {
    if (poll.organizerId !== organizerId) throw new OrganizerForbiddenError("Organizer access denied");
  } else {
    const suppliedHash = hashOrganizerToken(organizerToken);
    if (organizerTokenHash?.length !== suppliedHash.length ||
        !timingSafeEqual(organizerTokenHash, suppliedHash)) {
      throw new OrganizerForbiddenError("Organizer access denied");
    }
  }

  const previousStatus = PREVIOUS_STATUS.get(nextStatus);
  if (!previousStatus) throw new PollTransitionError("Unsupported poll transition");
  const conflictMessage = `Poll must be ${previousStatus} to become ${nextStatus}`;
  if (poll.status !== previousStatus) throw new PollTransitionError(conflictMessage);

  const updated = await pollRepository.updatePollStatus({
    id, previousStatus, nextStatus, organizerTokenHash, organizerId,
  });
  if (!updated) throw new PollTransitionError(conflictMessage);
  pollEvents.emit("poll-status-updated", { pollId: updated.id, status: updated.status });
  return updated;
}

function listOrganizerPolls(organizerId) {
  return pollRepository.findOwnedPolls(organizerId);
}

async function castVote(joinCode, participantToken, input) {
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(participantToken)) {
    throw new ParticipantForbiddenError("Participant access denied");
  }
  const optionId = input?.optionId;
  if (!isPositiveBigintId(optionId)) {
    throw new InvalidPollError("optionId must be a positive BIGINT ID string");
  }
  if (!isJoinCode(joinCode)) return null;

  const result = await pollRepository.insertVote({ joinCode, participantToken, optionId });
  if (!result) return null;
  if (!result.authorized) throw new ParticipantForbiddenError("Participant access denied");
  if (result.status !== "active") throw new PollNotActiveError("Only active polls accept votes");
  if (!result.optionId) throw new InvalidPollError("Option does not belong to this poll");
  if (!result.voteId) throw new DuplicateVoteError("This participant has already voted");

  pollEvents.emit("results-updated", { pollId: result.pollId });
  return { voteId: result.voteId, optionId: result.optionId };
}

async function getResults(joinCode) {
  if (!isJoinCode(joinCode)) return null;
  const poll = await pollRepository.findResultsByCode(joinCode);
  if (!poll) return null;
  if (poll.status === "draft") {
    throw new ResultsUnavailableError("Results are unavailable while the poll is a draft");
  }

  const totalVotes = poll.options.reduce((total, option) => total + option.voteCount, 0);
  const options = poll.options.map((option) => ({
    ...option,
    percentage: totalVotes === 0 ? 0 : Math.round(option.voteCount * 10000 / totalVotes) / 100,
  }));
  return { ...poll, totalVotes, options };
}

module.exports = {
  createPoll, getPollByCode, joinPoll, changePollStatus, castVote, getResults, listOrganizerPolls,
  isJoinCode, isPositiveBigintId, validateText, validatePollInput, generateJoinCode, MAX_JOIN_CODE_ATTEMPTS, pollEvents,
  InvalidPollError, PollNotActiveError, OrganizerForbiddenError, PollTransitionError,
  ParticipantForbiddenError, DuplicateVoteError, ResultsUnavailableError,
};
