const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { createHash, randomBytes } = require("node:crypto");
const { test } = require("node:test");
const pool = require("../src/config/db");
const { sessionCookieName } = require("../src/config/auth");
const { register, login, logout, me } = require("../src/controllers/auth");
const { InvalidRegistrationError } = require("../src/services/auth");
const { createPoll, listOrganizerPolls, activatePoll } = require("../src/controllers/polls");
const { readSessionCookie, requireAllowedOrigin, requireOrganizer, optionalOrganizerWrite } = require("../src/middleware/organizerAuth");
const authRateLimit = require("../src/middleware/authRateLimit");

function request(body, headers = {}) {
  return { body, get: (name) => headers[name.toLowerCase()] };
}

function response() {
  return {
    statusCode: 200,
    headers: {},
    set(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    cookie(name, token, options) { this.session = { name, token, options }; return this; },
    clearCookie(name, options) { this.cleared = { name, options }; return this; },
    json(body) { this.body = body; return this; },
    end() {},
  };
}

const origin = "http://localhost:5173";
const credentials = { email: "  HOST@Example.test  ", password: "a private passphrase" };
const organizer = { id: "7", email: "host@example.test" };
const cookieHeader = (token) => sessionCookieName + "=" + token;
const digest = (token) => createHash("sha256").update(token).digest();

test("registers and signs in with an eight-character password and rejects duplicates", async (t) => {
  const minimumCredentials = { ...credentials, password: "abcdefgh" };
  let registered = false;
  const query = t.mock.method(pool, "query", async (sql, [email, salt, hash]) => {
    assert.match(sql, /ON CONFLICT \(email\) DO NOTHING/);
    assert.equal(email, organizer.email);
    assert.equal(salt.length, 16);
    assert.equal(hash.length, 64);
    const rows = registered ? [] : [organizer];
    registered = true;
    return { rows };
  });

  const created = response();
  await register(request(minimumCredentials), created);
  assert.equal(created.statusCode, 201);
  assert.deepEqual(created.body, { organizer });
  assert.equal(created.session, undefined);
  const duplicate = response();
  await register(request(minimumCredentials), duplicate);
  assert.equal(duplicate.statusCode, 409);
  const [first, second] = query.mock.calls.map(({ arguments: [, params] }) => params);
  assert.notDeepEqual(first[1], second[1]);
  assert.notDeepEqual(first[2], second[2]);

  query.mock.mockImplementation(async (sql) => {
    if (sql.includes("FROM organizers WHERE email")) {
      return { rows: [{ ...organizer, salt: first[1], hash: first[2] }] };
    }
    assert.match(sql, /INSERT INTO organizer_sessions/);
    return {};
  });
  const signedIn = response();
  await login(request(minimumCredentials), signedIn);
  assert.equal(signedIn.statusCode, 200);
  assert.deepEqual(signedIn.body, { organizer });
  assert.ok(signedIn.session);
});

test("invalid registration rejects malformed emails and short or oversized passwords before SQL", async (t) => {
  const query = t.mock.method(pool, "query");
  for (const body of [null, { ...credentials, email: "a..b@example.test" },
    { ...credentials, password: "abcdefg" }, { ...credentials, password: "😀".repeat(129) }]) {
    await assert.rejects(register(request(body), response()), InvalidRegistrationError);
  }
  assert.equal(query.mock.callCount(), 0);
});

test("login issues a hashed persistent session, rotates it, and supports expiration and logout", async (t) => {
  let record;
  const sessions = new Map();
  t.mock.method(pool, "query", async (sql, params) => {
    if (sql.startsWith("INSERT INTO organizers")) {
      record = { ...organizer, salt: params[1], hash: params[2] };
      return { rows: [organizer] };
    }
    if (sql.includes("FROM organizers WHERE email")) {
      return { rows: params[0] === organizer.email ? [record] : [] };
    }
    if (sql.startsWith("WITH revoked")) {
      const [hash, id, age, previous] = params;
      assert.equal(id, organizer.id);
      assert.equal(age, 30 * 86400);
      if (previous) sessions.delete(previous.toString("hex"));
      sessions.set(hash.toString("hex"), true);
      return {};
    }
    if (sql.startsWith("DELETE FROM organizer_sessions")) {
      sessions.delete(params[0].toString("hex"));
      return {};
    }
    assert.match(sql, /expires_at > NOW\(\)/);
    return { rows: sessions.get(params[0].toString("hex")) ? [organizer] : [] };
  });

  await register(request(credentials), response());
  for (const input of [{ ...credentials, password: "different passphrase" }, { ...credentials, email: "nobody@example.test" }]) {
    const denied = response();
    await login(request(input), denied);
    assert.equal(denied.statusCode, 401);
    assert.deepEqual(denied.body, { status: "error", message: "Invalid email or password" });
    assert.equal(denied.session, undefined);
  }

  const signedIn = response();
  await login(request(credentials), signedIn);
  assert.deepEqual(signedIn.body, { organizer });
  assert.match(signedIn.session.token, /^[A-Za-z0-9_-]{43}$/);
  assert.deepEqual(signedIn.session.options, {
    httpOnly: true, secure: false, sameSite: "lax", path: "/api", maxAge: 30 * 86400 * 1000,
  });
  assert.ok(sessions.has(digest(signedIn.session.token).toString("hex")));

  const identify = async (token) => {
    const req = request(null, { cookie: cookieHeader(token) });
    const res = response();
    await requireOrganizer(req, res, () => me(req, res));
    return res;
  };
  assert.deepEqual((await identify(signedIn.session.token)).body, { organizer });
  const rotated = response();
  await login(request(credentials, { cookie: cookieHeader(signedIn.session.token) }), rotated);
  assert.notEqual(rotated.session.token, signedIn.session.token);
  assert.equal((await identify(signedIn.session.token)).statusCode, 401);

  sessions.set(digest(rotated.session.token).toString("hex"), false);
  assert.equal((await identify(rotated.session.token)).statusCode, 401);
  sessions.set(digest(rotated.session.token).toString("hex"), true);
  const signedOut = response();
  await logout(request(null, { cookie: cookieHeader(rotated.session.token) }), signedOut);
  assert.equal(signedOut.statusCode, 204);
  assert.equal(signedOut.cleared.name, sessionCookieName);
  assert.equal((await identify(rotated.session.token)).statusCode, 401);
});

test("rejects cross-origin cookie writes and malformed or ambiguous session cookies", async (t) => {
  const query = t.mock.method(pool, "query");
  const token = randomBytes(32).toString("base64url");
  const next = t.mock.fn();
  for (const supplied of [undefined, "null", "http://localhost:5173.evil.test", "https://attacker.test"]) {
    const res = response();
    requireAllowedOrigin(request(null, { origin: supplied }), res, next);
    assert.equal(res.statusCode, 403);
    const mutation = response();
    await optionalOrganizerWrite(request(null, { origin: supplied, cookie: cookieHeader(token) }), mutation, next);
    assert.equal(mutation.statusCode, 403);
  }
  const duplicate = cookieHeader(token) + "; " + cookieHeader(token);
  assert.equal(readSessionCookie(request(null, { cookie: duplicate })), null);
  for (const cookie of [undefined, duplicate, cookieHeader("bad%20token")]) {
    const res = response();
    await requireOrganizer(request(null, { cookie }), res, next);
    assert.equal(res.statusCode, 401);
  }
  assert.equal(next.mock.callCount(), 0);
  assert.equal(query.mock.callCount(), 0);

  requireAllowedOrigin(request(null, { origin }), response(), next);
  await optionalOrganizerWrite(request(null, { origin: "https://attacker.test" }), response(), next);
  assert.equal(next.mock.callCount(), 2);
});

test("production cookie configuration requires HTTPS and allows only explicitly configured origins", () => {
  const config = require.resolve("../src/config/auth");
  const output = execFileSync(process.execPath, ["-e", `
    const auth = require(${JSON.stringify(config)});
    console.log(JSON.stringify({
      cookie: auth.sessionCookieName,
      options: auth.sessionCookieOptions,
      allowed: auth.isAllowedOrigin("https://poll.example.test"),
      local: auth.isAllowedOrigin("http://localhost:5173"),
    }));
  `], {
    env: { ...process.env, NODE_ENV: "production", QUICKPOLL_ALLOWED_ORIGINS: "https://poll.example.test" },
  });
  assert.deepEqual(JSON.parse(output), {
    cookie: "__Secure-quickpoll_session",
    options: { httpOnly: true, secure: true, sameSite: "lax", path: "/api" },
    allowed: true,
    local: false,
  });
});

test("bounds authentication attempts for a peer without trusting forwarded headers", (t) => {
  const next = t.mock.fn();
  for (let index = 0; index < 20; index++) authRateLimit({ ip: "192.0.2.1" }, response(), next);
  const blocked = response();
  authRateLimit({ ip: "192.0.2.1", get: () => "192.0.2.99" }, blocked, next);
  assert.equal(blocked.statusCode, 429);
  assert.ok(Number(blocked.headers["Retry-After"]) > 0);
  authRateLimit({ ip: "192.0.2.2" }, response(), next);
  assert.equal(next.mock.callCount(), 21);
});

test("uses only the verified account to own, list, and manage polls", async (t) => {
  const poll = { id: "5", joinCode: "ABCDE", question: "Question", status: "draft" };
  const client = {
    async query(sql, params) {
      if (sql.startsWith("INSERT INTO polls")) {
        assert.equal(params[3], organizer.id);
        return { rows: [poll] };
      }
    },
    release() {},
  };
  t.mock.method(pool, "connect", async () => client);
  const query = t.mock.method(pool, "query", async (sql, params) => {
    if (sql.includes("WHERE organizer_id = $1")) {
      assert.deepEqual(params, [organizer.id]);
      return { rows: [poll] };
    }
    if (sql.startsWith("SELECT status")) return { rows: [{ status: "draft", organizerId: organizer.id }] };
    assert.match(sql, /AND organizer_id = \$4/);
    assert.deepEqual(params, ["active", poll.id, "draft", organizer.id]);
    return { rows: [{ id: poll.id, status: "active" }] };
  });
  const req = { ...request({ question: "Question", options: ["A", "B"], organizerId: "999" }), organizer };
  const created = response();
  await createPoll(req, created);
  assert.equal(created.statusCode, 201);
  assert.equal(created.body.organizerId, undefined);
  const listed = response();
  await listOrganizerPolls({ ...req, query: { organizerId: "999" } }, listed);
  assert.deepEqual(listed.body, { polls: [poll] });

  const denied = response();
  await activatePoll({ ...req, organizer: { id: "999" }, params: { id: poll.id } }, denied);
  assert.equal(denied.statusCode, 403);
  const activated = response();
  await activatePoll({ ...req, params: { id: poll.id } }, activated);
  assert.deepEqual(activated.body, { id: poll.id, status: "active" });
  assert.equal(query.mock.callCount(), 4);
});
