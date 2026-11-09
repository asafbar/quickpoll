const production = process.env.NODE_ENV === "production";
const configuredOrigins = (process.env.QUICKPOLL_ALLOWED_ORIGINS || "").split(",");
const allowedOrigins = new Set(production ? [] : ["http://localhost:5173", "http://127.0.0.1:5173"]);

for (const entry of configuredOrigins) {
  const value = entry.trim();
  if (!value) continue;
  const url = new URL(value);
  if (url.origin !== value || !["https:", "http:"].includes(url.protocol) ||
      (production && url.protocol !== "https:")) {
    throw new Error("QUICKPOLL_ALLOWED_ORIGINS must contain exact HTTP(S) origins, HTTPS only in production");
  }
  allowedOrigins.add(value);
}

const SESSION_AGE_SECONDS = 30 * 24 * 60 * 60;
const sessionCookieName = production ? "__Secure-quickpoll_session" : "quickpoll_session";
const sessionCookieOptions = { httpOnly: true, secure: production, sameSite: "lax", path: "/api" };
const isAllowedOrigin = (origin) => allowedOrigins.has(origin);

const corsOptions = {
  origin(origin, callback) {
    callback(null, isAllowedOrigin(origin));
  },
  credentials: true,
};

module.exports = { SESSION_AGE_SECONDS, sessionCookieName, sessionCookieOptions, isAllowedOrigin, corsOptions };
