const service = require("../services/liveSessions");

function bearerToken(req) {
  return /^Bearer +(\S+)$/i.exec(req.get("Authorization"))?.[1];
}

function transition(action) {
  return async (req, res) => {
    const change = await service.transition(req.organizer.id, req.params.id, action, req.params.questionId);
    res.json(change);
  };
}

async function joinSession(req, res) {
  const participant = await service.joinSession(req.params.joinCode, req.body);
  res.set("Cache-Control", "no-store").status(201).json(participant);
}

async function getQuestion(req, res) {
  res.set("Cache-Control", "no-store");
  const question = await service.getQuestion(req.params.joinCode, req.params.questionId, bearerToken(req));
  res.json({ question });
}

async function castVote(req, res) {
  const vote = await service.castVote(req.params.joinCode, req.params.questionId, bearerToken(req), req.body);
  res.status(201).json(vote);
}

async function getResults(req, res) {
  const results = await service.getResults(req.params.joinCode, req.params.questionId);
  res.json({ results });
}

async function getSummary(req, res) {
  const summary = await service.getSummary(req.params.joinCode);
  res.json({ summary });
}

module.exports = { transition, joinSession, getQuestion, castVote, getResults, getSummary };
