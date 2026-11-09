const express = require("express");
const { createSession, listSessions, getSession, addQuestion, getPublicSession } = require("../controllers/sessions");
const { requireOrganizer, requireAllowedOrigin } = require("../middleware/organizerAuth");
const { InvalidPollError } = require("../services/polls");
const { SessionNotDraftError, SessionCodeUnavailableError } = require("../services/sessions");

function handleError(error, req, res, _next) {
  if (error instanceof InvalidPollError) return res.status(400).json({ status: "error", message: error.message });
  if (error instanceof SessionNotDraftError) return res.status(409).json({ status: "error", message: error.message });
  if (error instanceof SessionCodeUnavailableError) {
    return res.status(503).json({ status: "error", message: "Could not allocate a join code. Please try again." });
  }
  if ([400, 413, 415].includes(error.status)) {
    return res.status(error.status).json({ status: "error", message: "Invalid session request" });
  }
  console.error("Poll session request failed:", error.code);
  res.status(500).json({ status: "error", message: "Poll session request failed" });
}

const organizerSessions = express.Router();
const publicSessions = express.Router();
const parseJson = express.json();

organizerSessions.use(requireOrganizer);
organizerSessions.get("/", listSessions);
organizerSessions.get("/:id", getSession);
organizerSessions.post("/", requireAllowedOrigin, parseJson, createSession);
organizerSessions.post("/:id/questions", requireAllowedOrigin, parseJson, addQuestion);
organizerSessions.use(handleError);

publicSessions.get("/code/:joinCode", getPublicSession);
publicSessions.use(handleError);

module.exports = { organizerSessions, publicSessions };
