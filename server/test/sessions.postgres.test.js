const assert = require("node:assert/strict");
const { randomBytes, randomUUID } = require("node:crypto");
const { once } = require("node:events");
const { readFile } = require("node:fs/promises");
const path = require("node:path");
const { test } = require("node:test");
const express = require("express");
const { Pool } = require("pg");
const pool = require("../src/config/db");
const { sessionCookieName } = require("../src/config/auth");
const { publicSessions } = require("../src/routes/sessions");
const pollRoutes = require("../src/routes/polls");
const organizerRoutes = require("../src/routes/organizer");
const { appendQuestion } = require("../src/repositories/sessions");

const connectionString = process.env.QUICKPOLL_TEST_DATABASE_URL;

test("PostgreSQL enforces session ownership, ordered concurrent writes, and question isolation", {
  skip: !connectionString && "Set QUICKPOLL_TEST_DATABASE_URL to a disposable PostgreSQL database",
  timeout: 30000,
}, async (t) => {
  const schema = "quickpoll_test_" + randomBytes(8).toString("hex");
  const bootstrap = new Pool({ connectionString });
  const database = new Pool({ connectionString, options: "-c search_path=" + schema });
  await bootstrap.query(`CREATE SCHEMA ${schema}`);
  t.after(async () => {
    await database.end();
    try {
      await bootstrap.query(`DROP SCHEMA ${schema} CASCADE`);
    } finally {
      await bootstrap.end();
    }
  });
  const migrations = ["001_init", "002_organizer_auth", "003_organizer_accounts", "004_multi_question_sessions"];
  const migrate = async (name) => database.query(await readFile(path.join(__dirname, "../../db", name + ".sql"), "utf8"));
  for (const name of migrations.slice(0, 3)) await migrate(name);

  const legacyToken = "legacy-organizer-test-token";
  await database.query(
    `INSERT INTO polls (join_code, question, status, organizer_token_hash)
     VALUES ('LEGACY', 'Legacy poll', 'active', sha256(convert_to($1, 'UTF8')))`,
    [legacyToken],
  );
  await database.query("INSERT INTO poll_options (poll_id, option_text, display_order) VALUES (1, 'Legacy answer', 1)");
  await database.query("INSERT INTO participants (poll_id, display_name, participant_token) VALUES (1, 'Legacy voter', $1)", [randomUUID()]);
  await database.query("INSERT INTO votes (poll_id, participant_id, option_id) VALUES (1, 1, 1)");
  await migrate(migrations[3]);
  const legacy = await database.query("SELECT session_id, session_position FROM polls WHERE join_code = 'LEGACY'");
  assert.deepEqual(legacy.rows, [{ session_id: null, session_position: null }]);

  const { rows: [alice, bob] } = await database.query(
    `INSERT INTO organizers (email, password_salt, password_hash)
     VALUES ('alice@example.test', $1, $2), ('bob@example.test', $1, $2) RETURNING id`,
    [Buffer.alloc(16), Buffer.alloc(64)],
  );
  async function sessionCookie(organizerId) {
    const token = randomBytes(32).toString("base64url");
    await database.query(
      "INSERT INTO organizer_sessions (token_hash, organizer_id, expires_at) VALUES (sha256(convert_to($1, 'UTF8')), $2, NOW() + INTERVAL '1 hour')",
      [token, organizerId],
    );
    return sessionCookieName + "=" + token;
  }
  const aliceCookie = await sessionCookie(alice.id);
  const bobCookie = await sessionCookie(bob.id);

  t.mock.method(pool, "query", database.query.bind(database));
  t.mock.method(pool, "connect", database.connect.bind(database));
  const app = express();
  app.use("/api/organizer", organizerRoutes);
  app.use("/api/sessions", publicSessions);
  app.use("/api/polls", pollRoutes);
  const server = app.listen(0, "127.0.0.1");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await once(server, "listening");
  const base = "http://127.0.0.1:" + server.address().port;
  const organizerPath = "/api/organizer/sessions";

  async function request(route, { cookie, body, method = body ? "POST" : "GET", origin = "http://localhost:5173", bearer } = {}) {
    const headers = { Origin: origin };
    if (cookie) headers.Cookie = cookie;
    if (body) headers["Content-Type"] = "application/json";
    if (bearer) headers.Authorization = "Bearer " + bearer;
    const response = await fetch(base + route, { method, headers, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  }

  assert.equal((await request(organizerPath)).status, 401);
  assert.equal((await request(organizerPath, { body: { title: "Private" } })).status, 401);
  assert.equal((await request(organizerPath, { cookie: aliceCookie, origin: "https://untrusted.test", body: { title: "Private" } })).status, 403);
  assert.equal((await request(organizerPath, { cookie: aliceCookie, body: { title: " " } })).status, 400);
  const created = await request(organizerPath, { cookie: aliceCookie, body: { title: " Workshop ", organizerId: bob.id } });
  assert.equal(created.status, 201);
  const { id, joinCode } = created.body.session;
  assert.deepEqual(Object.keys(created.body.session).sort(), ["activeQuestionId", "createdAt", "id", "joinCode", "status", "title", "updatedAt"]);
  assert.equal(created.body.session.activeQuestionId, null);
  const detailsPath = organizerPath + "/" + id;
  const questionsPath = detailsPath + "/questions";
  assert.equal((await request(detailsPath, { cookie: bobCookie })).status, 404);
  assert.equal((await request(questionsPath, { cookie: bobCookie, body: { question: "Foreign", options: ["A", "B"] } })).status, 404);
  assert.deepEqual((await request(organizerPath, { cookie: bobCookie })).body, { sessions: [] });
  assert.deepEqual((await request(organizerPath, { cookie: aliceCookie })).body.sessions.map((session) => session.id), [id]);
  assert.equal((await request(questionsPath, { cookie: aliceCookie, body: { question: "Duplicates", options: ["A", " A "] } })).status, 400);

  const concurrent = await Promise.all(Array.from({ length: 6 }, (_, i) => request(questionsPath, {
    cookie: aliceCookie, body: { question: "Question " + (i + 1), options: [" Second ", "First"] },
  })));
  assert.ok(concurrent.every(({ status }) => status === 201));
  assert.deepEqual(concurrent.map(({ body }) => body.question.position).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6]);
  const owned = (await request(detailsPath, { cookie: aliceCookie })).body.session;
  assert.deepEqual(owned.questions, concurrent.map(({ body }) => body.question).sort((a, b) => a.position - b.position));
  assert.deepEqual(owned.questions[0].options.map(({ text }) => text), ["Second", "First"]);

  await assert.rejects(appendQuestion({ organizerId: alice.id, sessionId: id, joinCode: "ROLLBACK",
    question: "Broken", options: ["A", "B\0"] }), { code: "22021" });
  assert.equal((await database.query("SELECT id FROM polls WHERE join_code = 'ROLLBACK'")).rowCount, 0);
  const [first, second] = owned.questions;
  const { rows: [internal] } = await database.query("SELECT join_code, organizer_token_hash FROM polls WHERE id = $1", [first.id]);
  assert.equal(internal.organizer_token_hash, null);
  assert.equal((await request("/api/polls/" + first.id + "/activate", { method: "POST", cookie: aliceCookie })).status, 404);
  assert.equal((await request("/api/polls/code/" + internal.join_code)).status, 404);
  assert.deepEqual((await request("/api/organizer/polls", { cookie: aliceCookie })).body, { polls: [] });
  assert.deepEqual((await request("/api/polls/code/LEGACY")).body.options, [{ id: "1", text: "Legacy answer" }]);
  assert.equal((await request("/api/polls/code/LEGACY/results")).body.totalVotes, 1);
  assert.equal((await request("/api/polls/1/close", { method: "POST", bearer: legacyToken })).status, 200);

  const publicPath = "/api/sessions/code/" + joinCode;
  assert.deepEqual((await request(publicPath)).body, {
    session: { title: "Workshop", joinCode, status: "draft", activeQuestionId: null },
  });
  assert.equal((await request("/api/sessions/code/UNKNOWN")).status, 404);
  const insertPoll = "INSERT INTO polls (join_code, question, organizer_id, session_id, session_position) VALUES ($1, 'Constraint check', $2, $3, $4)";
  await assert.rejects(database.query(insertPoll, ["BADSLOT", alice.id, id, 1]), { code: "23505", constraint: "uq_poll_session_position" });
  await assert.rejects(database.query(insertPoll, ["MISMATCH", bob.id, id, 10]), { code: "23503", constraint: "fk_poll_session_owner" });
  await assert.rejects(database.query(insertPoll, ["NOPOS", alice.id, id, null]), { code: "23514", constraint: "chk_poll_session_membership" });
  await database.query("UPDATE poll_sessions SET status = 'active' WHERE id = $1", [id]);
  const activate = (pollId) => database.query("UPDATE polls SET status = 'active' WHERE id = $1", [pollId]);
  const active = await Promise.allSettled([activate(first.id), activate(second.id)]);
  assert.equal(active.filter(({ status }) => status === "fulfilled").length, 1);
  assert.equal(active.find(({ status }) => status === "rejected").reason.constraint, "uq_poll_session_active_question");
  const current = active[0].status === "fulfilled" ? first.id : second.id;
  assert.equal((await request(publicPath)).body.session.activeQuestionId, current);
  assert.equal((await request(questionsPath, { cookie: aliceCookie, body: { question: "Late", options: ["A", "B"] } })).status, 409);

  const participant = randomUUID();
  const insertParticipant = "INSERT INTO session_participants (session_id, display_name, participant_token) VALUES ($1, 'Pat', $2)";
  await database.query(insertParticipant, [id, participant]);
  await assert.rejects(database.query(insertParticipant, [id, participant]), { code: "23505" });
  await assert.rejects(database.query(insertParticipant, ["99999", randomUUID()]), { code: "23503" });
  assert.equal((await request("/api/polls/code/" + internal.join_code + "/join", { body: { displayName: "Pat" } })).status, 404);
  assert.equal((await request("/api/polls/code/" + internal.join_code + "/vote", { bearer: participant, body: { optionId: first.options[0].id } })).status, 404);
  assert.equal((await request("/api/polls/code/" + internal.join_code + "/results")).status, 404);

  const standalone = (await request("/api/polls", { body: { question: "Standalone", options: ["A", "B"] } })).body;
  assert.equal((await request("/api/polls/" + standalone.id + "/activate", { method: "POST", bearer: standalone.organizerToken })).status, 200);
  const publicPollPath = "/api/polls/code/" + standalone.joinCode;
  const standalonePoll = (await request(publicPollPath)).body;
  const voter = (await request(publicPollPath + "/join", { body: { displayName: "Pat" } })).body;
  assert.equal((await request(publicPollPath + "/vote", { bearer: voter.participantToken, body: { optionId: standalonePoll.options[0].id } })).status, 201);
  assert.equal((await request(publicPollPath + "/results")).body.totalVotes, 1);
});
