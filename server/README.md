# QuickPoll organizer authentication

Apply [database migrations 001 through 004](../db/README.md) before running this server.

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

## Multi-question poll sessions

Management requires an organizer cookie. POST requests also require an exact allowed `Origin`. A join code gives access to the public lookup only.

| Method and route | Request | Success |
| --- | --- | --- |
| `POST /api/organizer/sessions` | JSON `{ title }` | `201 { session }` |
| `GET /api/organizer/sessions` | Organizer cookie | `200 { sessions }`, newest first |
| `GET /api/organizer/sessions/:id` | Organizer cookie | `200 { session }`, including ordered `questions` |
| `POST /api/organizer/sessions/:id/questions` | JSON `{ question, options }` | `201 { question }`, appended to a draft session |
| `GET /api/sessions/code/:joinCode` | Public join code | `200 { session: { title, joinCode, status, activeQuestionId } }` |

Organizer session metadata includes `id`, `title`, `joinCode`, `status`, `createdAt`, `updatedAt`, and `activeQuestionId`. A question includes `id`, `question`, `status`, `position` starting at 1, and ordered `options` with `id` and `text`. IDs are strings. `activeQuestionId` is null when there is no active question.

Titles are trimmed and require 1–150 characters. Questions and their 2–6 distinct answers use the existing poll validation. Invalid input returns `400`, missing authentication `401`, and a disallowed write origin `403`. Missing or unowned sessions return `404`. Adding a question outside draft returns `409`. Exhausting join-code retries returns `503`.

Sessions and their questions start as drafts. The database stores session questions and their options in the existing poll tables, with owner-matched membership and at most one active question per session. Session questions are isolated from the standalone poll APIs. The session participant table establishes participant identity within a session. Joining, session activation and progression, voting, session Socket.IO events, and frontend integration are reserved for later tasks.

The standard Node suite skips PostgreSQL integration unless `QUICKPOLL_TEST_DATABASE_URL` is set to a disposable PostgreSQL database. With that variable set, run `npm --prefix server test`. The integration test creates and removes a dedicated scratch schema in that database.
