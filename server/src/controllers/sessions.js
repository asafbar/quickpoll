const service = require("../services/sessions");

function sendSessionNotFound(res) {
  return res.status(404).json({ status: "error", message: "Session not found" });
}

async function createSession(req, res) {
  const session = await service.createSession(req.organizer.id, req.body);
  res.status(201).json({ session });
}

async function listSessions(req, res) {
  res.json({ sessions: await service.listSessions(req.organizer.id) });
}

async function getSession(req, res) {
  const session = await service.getSession(req.organizer.id, req.params.id);
  if (!session) return sendSessionNotFound(res);
  res.json({ session });
}

async function addQuestion(req, res) {
  const question = await service.addQuestion(req.organizer.id, req.params.id, req.body);
  if (!question) return sendSessionNotFound(res);
  res.status(201).json({ question });
}

async function getPublicSession(req, res) {
  const session = await service.getPublicSession(req.params.joinCode);
  if (!session) return sendSessionNotFound(res);
  res.json({ session });
}

module.exports = { createSession, listSessions, getSession, addQuestion, getPublicSession };
