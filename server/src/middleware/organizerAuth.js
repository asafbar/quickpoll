const auth = require("../services/auth");
const { isAllowedOrigin, sessionCookieName, sessionCookieOptions } = require("../config/auth");

function readSessionCookie(req) {
  let token;
  for (const part of (req.get("Cookie") || "").split(";")) {
    const separator = part.indexOf("=");
    const name = (separator === -1 ? part : part.slice(0, separator)).trim();
    if (name !== sessionCookieName) continue;
    if (token !== undefined || separator === -1) return null;
    token = part.slice(separator + 1).trim();
  }
  return token;
}

function requireAllowedOrigin(req, res, next) {
  if (!isAllowedOrigin(req.get("Origin"))) {
    return res.status(403).json({ status: "error", message: "Request origin is not allowed" });
  }
  next();
}

async function loadOrganizer(req, res, next, token, clearInvalidCookie = false) {
  res.set("Cache-Control", "no-store");
  try {
    const organizer = await auth.authenticate(token);
    if (!organizer) {
      if (clearInvalidCookie) res.clearCookie(sessionCookieName, sessionCookieOptions);
      return res.status(401).json({ status: "error", message: "Organizer sign-in required" });
    }
    req.organizer = organizer;
    next();
  } catch (error) {
    console.error("Organizer session lookup failed:", error.code);
    res.status(500).json({ status: "error", message: "Could not verify organizer session" });
  }
}

function requireOrganizer(req, res, next) {
  return loadOrganizer(req, res, next, readSessionCookie(req));
}

function optionalOrganizerWrite(req, res, next) {
  const token = readSessionCookie(req);
  if (token === undefined) return next();
  return requireAllowedOrigin(req, res, () => loadOrganizer(req, res, next, token, true));
}

function lifecycleOrganizer(req, res, next) {
  // An explicit bearer header always uses the existing poll-token authorization path.
  if (req.get("Authorization") !== undefined) return next();
  return optionalOrganizerWrite(req, res, next);
}

module.exports = { readSessionCookie, requireAllowedOrigin, requireOrganizer, optionalOrganizerWrite, lifecycleOrganizer };
