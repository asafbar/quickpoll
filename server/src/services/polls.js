const { randomBytes, randomUUID } = require("node:crypto");
const pollRepository = require("../repositories/polls");

const MAX_JOIN_CODE_ATTEMPTS = 5;

class InvalidPollError extends Error {}
class PollNotActiveError extends Error {}

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

  for (let attempt = 0; attempt < MAX_JOIN_CODE_ATTEMPTS; attempt += 1) {
    const joinCode = randomBytes(5).toString("hex").toUpperCase();
    const poll = await pollRepository.insertDraft({ joinCode, question, options });
    if (poll) return poll;
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

module.exports = { createPoll, getPollByCode, joinPoll, InvalidPollError, PollNotActiveError };
