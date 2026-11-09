const auth = require("../services/auth");
const { readSessionCookie } = require("../middleware/organizerAuth");
const { SESSION_AGE_SECONDS, sessionCookieName, sessionCookieOptions } = require("../config/auth");

async function register(req, res) {
  const organizer = await auth.register(req.body);
  if (!organizer) {
    return res.status(409).json({ status: "error", message: "Could not register with those credentials" });
  }
  res.status(201).json({ organizer });
}

async function login(req, res) {
  const result = await auth.login(req.body, readSessionCookie(req));
  if (!result) {
    return res.status(401).json({ status: "error", message: "Invalid email or password" });
  }
  res.cookie(sessionCookieName, result.sessionToken, {
    ...sessionCookieOptions,
    maxAge: SESSION_AGE_SECONDS * 1000,
  });
  res.json({ organizer: result.organizer });
}

async function logout(req, res) {
  await auth.logout(readSessionCookie(req));
  res.clearCookie(sessionCookieName, sessionCookieOptions).status(204).end();
}

function me(req, res) {
  res.json({ organizer: req.organizer });
}

module.exports = { register, login, logout, me };
