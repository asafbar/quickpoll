# QuickPoll organizer authentication

Apply [database migrations 001 through 005](../db/README.md) before running this server.

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
| `GET /api/sessions/code/:joinCode` | Public join code | `200 { session: { title, joinCode, status, activeQuestionId, currentQuestion } }` |

Organizer session metadata includes `id`, `title`, `joinCode`, `status`, `createdAt`, `updatedAt`, and `activeQuestionId`. A question includes `id`, `question`, `status`, `position` starting at 1, and ordered `options` with `id` and `text`. IDs are strings. `activeQuestionId` is null when there is no active question.

Titles are trimmed and require 1–150 characters. Questions and their 2–6 distinct answers use the existing poll validation. Invalid input returns `400`, missing authentication `401`, and a disallowed write origin `403`. Missing or unowned sessions return `404`. Adding a question outside draft returns `409`. Exhausting join-code retries returns `503`.

Sessions and their questions start as drafts. Session questions are isolated from the standalone poll APIs. Session joining, lifecycle, voting, and results are available through the routes below. The client builder still prepares drafts.

### Live organizer actions

These POST requests require the owner's organizer cookie and an exact allowed `Origin`. Success returns `200 { sessionId, status, questionId, questionStatus }`. IDs are strings. The question fields are null for start.

| Route | Transition |
| --- | --- |
| `POST /api/organizer/sessions/:id/start` | Starts a draft session with questions. The session is active and accepts joins. The first question stays draft until explicitly opened. |
| `POST /api/organizer/sessions/:id/questions/:questionId/open` | Opens only the first unfinished question in an active session, if that question is draft. |
| `POST /api/organizer/sessions/:id/questions/:questionId/close` | Closes only the current active question. Closing the final question completes the session and sets its status to `closed`. |

Between questions the session stays active, with no active question. Organizers can review results before opening the next question. Public `currentQuestion` contains `id`, `question`, `status`, and `position` for the active or most recently closed question, or null before the first question opens. `activeQuestionId` is null during review and after completion.

Invalid lifecycle transitions return `409`, including attempts to skip, reopen, or repeat an action. Missing or unowned sessions return `404`. Missing organizer authentication returns `401` and a disallowed write origin returns `403`.

### Live participant and public routes

Use the prefix `/api/sessions/code/:joinCode`.

| Method and path suffix | Request | Success |
| --- | --- | --- |
| `POST /join` | JSON `{ displayName }`, 1–100 characters after trimming | `201 { participantId, participantToken }` |
| `GET /questions/:questionId` | Session participant bearer token | `200 { question: { id, question, status, position, options, hasVoted } }` for the active question |
| `POST /questions/:questionId/vote` | Session participant bearer token and JSON `{ optionId }` | `201 { voteId, optionId }` |
| `GET /questions/:questionId/results` | Public | `200 { results }` for active or closed questions |
| `GET /summary` | Public | `200 { summary: { title, status, questions } }` with completed question results in order |

Joining is allowed while the session is active, including before the first question and during review. The participant reuses the issued bearer token across questions. Display names are labels. Anonymous joining cannot enforce one credential per person, and each credential can vote once per question. A missing bearer token returns `401`, and invalid or cross-session credentials return `403`. Missing sessions or questions return `404`. Invalid options return `400`. Draft or completed sessions reject new joins with `409`. Votes on inactive questions return `409 QUESTION_NOT_ACTIVE`, and repeat votes return `409 ALREADY_VOTED`.

Result entries contain `id`, `question`, `status`, `position`, `totalVotes`, and ordered `options` containing `id`, `text`, `voteCount`, and `percentage`. Draft results return `409`. Public aggregates follow the standalone results policy. Participant credentials are issued only by join and stored as hashes.

### Live Socket.IO

Emit `join-session` or `leave-session` with the public join-code string. Join acknowledges with `{ ok: true, sessionId }`, and leave acknowledges with `{ ok: true }`. Failures include `ok: false`, `status`, and `message`. After reconnecting, join again and fetch the current HTTP state and results.

- `session-state-updated` emits `{ sessionId }` after start, open, and close.
- `session-results-updated` emits `{ sessionId, questionId }` after a committed vote.
- `session-completed` emits `{ sessionId }` in addition to the state update when the final question closes.

The standard Node suite skips PostgreSQL integration unless `QUICKPOLL_TEST_DATABASE_URL` is set to a disposable PostgreSQL database. With that variable set, run `npm --prefix server test`. The integration test creates and removes a dedicated scratch schema in that database.
