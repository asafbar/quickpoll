# QuickPoll organizer authentication

Apply [database migration 003](../db/README.md) before running this server.

| Method and route | Request | Success |
| --- | --- | --- |
| `POST /api/auth/register` | JSON `{ email, password }` | `201 { organizer: { id, email } }` |
| `POST /api/auth/login` | JSON `{ email, password }` | `200 { organizer: { id, email } }` and a session cookie |
| `POST /api/auth/logout` | Session cookie if present | `204`, revokes the presented session and clears its cookie |
| `GET /api/auth/me` | Valid session cookie | `200 { organizer: { id, email } }` |
| `GET /api/organizer/polls` | Valid session cookie | `200 { polls: [{ id, joinCode, question, status, createdAt }] }` |

Registration trims and lowercases email and accepts passwords of 8 to 128 Unicode characters without trimming. A duplicate registration returns a generic `409`. Login returns the same `401` for an unknown email or incorrect password. Registration does not sign the organizer in.

Poll creation attaches the current account when a valid session cookie is supplied. Anonymous creation and the original Create Poll response still work. Activate and close accept either the original bearer token or the owner's session. An explicit Authorization header selects the bearer path. Historical polls can still be managed using their original bearer token if they have one.

The 30-day session is stored as a SHA-256 digest in PostgreSQL. The cookie is host-only, HttpOnly, SameSite=Lax, and scoped to `/api`. In `NODE_ENV=production` it is named `__Secure-quickpoll_session` and marked Secure, so the browser-facing origin must use HTTPS. Local HTTP development uses `quickpoll_session`. Login rotates the session presented by that browser. Sessions on other devices remain independent.

Protected POST requests require an exact allowed `Origin` header, including register, login, logout, and cookie-backed poll writes. The Vite proxy forwards requests to the API on the same browser origin. Development allows `http://localhost:5173` and `http://127.0.0.1:5173`. Set `QUICKPOLL_ALLOWED_ORIGINS` in the server environment to a comma-separated list of additional client origins, with no trailing slash. Production requires explicit HTTPS origins. HTTP CORS allows credentials only for these exact origins. Cross-site deployments must account for the browser's SameSite=Lax behavior.

Registration and login share a per-IP limit of 20 attempts per 15 minutes and a per-process limit of four simultaneous password derivations. Express uses the direct peer IP, so clients behind the same proxy may share a budget. The limit resets on process restart and is independent across server processes.
