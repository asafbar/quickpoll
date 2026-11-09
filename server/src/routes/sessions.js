const express = require("express");
const { createSession, listSessions, getSession, addQuestion, getPublicSession } = require("../controllers/sessions");
const { requireOrganizer, requireAllowedOrigin } = require("../middleware/organizerAuth");
const { InvalidPollError } = require("../services/polls");
const { SessionNotDraftError, SessionCodeUnavailableError } = require("../services/sessions");
const live = require("../controllers/liveSessions");
const { LiveSessionError } = require("../services/liveSessions");

function handleError(error, req, res, _next) {
  if (error instanceof LiveSessionError) {
    if (error.status === 401) res.set("WWW-Authenticate", "Bearer");
    return res.status(error.status).json({ status: "error", code: error.code, message: error.message });
  }
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
organizerSessions.post("/:id/start", requireAllowedOrigin, live.transition("start"));
organizerSessions.post("/:id/questions/:questionId/open", requireAllowedOrigin, live.transition("open"));
organizerSessions.post("/:id/questions/:questionId/close", requireAllowedOrigin, live.transition("close"));
organizerSessions.use(handleError);

publicSessions.get("/code/:joinCode", getPublicSession);
publicSessions.post("/code/:joinCode/join", parseJson, live.joinSession);
publicSessions.get("/code/:joinCode/questions/:questionId", live.getQuestion);
publicSessions.post("/code/:joinCode/questions/:questionId/vote", parseJson, live.castVote);
publicSessions.get("/code/:joinCode/questions/:questionId/results", live.getResults);
publicSessions.get("/code/:joinCode/summary", live.getSummary);
publicSessions.use(handleError);

module.exports = { organizerSessions, publicSessions };
