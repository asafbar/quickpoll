const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 20;
const MAX_IPS = 10000;
const attempts = new Map();
let windowEnd = 0;

function authRateLimit(req, res, next) {
  const now = Date.now();
  if (now >= windowEnd) {
    attempts.clear();
    windowEnd = now + WINDOW_MS;
  }

  const count = attempts.get(req.ip);
  if (count >= MAX_ATTEMPTS || (count === undefined && attempts.size >= MAX_IPS)) {
    return res.set("Retry-After", String(Math.ceil((windowEnd - now) / 1000))).status(429)
      .json({ status: "error", message: "Too many authentication attempts. Try again later." });
  }
  attempts.set(req.ip, (count ?? 0) + 1);
  next();
}

module.exports = authRateLimit;
