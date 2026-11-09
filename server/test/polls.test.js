const assert = require("node:assert/strict");
const { createHash, randomBytes, randomUUID } = require("node:crypto");
const { test } = require("node:test");
const pool = require("../src/config/db");
const { pollEvents } = require("../src/services/polls");
const {
  createPoll, getPollByCode, joinPoll, activatePoll, closePoll, castVote, getResults,
} = require("../src/controllers/polls");

async function callController(controller, request) {
  const response = {
    statusCode: 200,
    headers: {},
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
    },
  };
  await controller(request, response);
  return response;
}

function postPoll(body) {
  return callController(createPoll, { body });
}

function mockDatabase(t, { collisions = 0, optionError } = {}) {
  const statements = [];
  const client = {
    async query(sql, params) {
      statements.push({ sql, params });
      if (sql.startsWith("INSERT INTO polls")) {
        const [joinCode, question] = params;
        const poll = { id: "9007199254740993", joinCode, question, status: "draft" };
        if (collisions > 0) {
          collisions -= 1;
          return { rows: [] };
        }
        return { rows: [poll] };
      }
      if (sql.startsWith("INSERT INTO poll_options") && optionError) throw optionError;
    },
    release: t.mock.fn(),
  };
  t.mock.method(pool, "connect", async () => client);
  return { statements, release: client.release };
}

test("trims input and creates a draft with ordered options in one transaction", async (t) => {
  const { statements, release } = mockDatabase(t);
  const question = "😀".repeat(300);
  const options = ["B".repeat(150), "A", "C", "D", "E", "F"];
  const response = await postPoll({
    question: ` ${question} `,
    options: options.map((option) => ` ${option} `),
  });

  assert.equal(response.statusCode, 201);
  assert.equal(response.headers["Cache-Control"], "no-store");
  assert.match(response.body.joinCode, /^[0-9A-F]{10}$/);
  const { organizerToken } = response.body;
  assert.match(organizerToken, /^[A-Za-z0-9_-]{43}$/);
  assert.deepEqual(response.body, {
    id: "9007199254740993",
    joinCode: response.body.joinCode,
    question,
    status: "draft",
    options,
    organizerToken,
  });
  assert.equal(statements.length, 4);
  assert.equal(statements[0].sql, "BEGIN");
  assert.deepEqual(statements[1].params, [
    response.body.joinCode, question, createHash("sha256").update(organizerToken).digest(), null,
  ]);
  assert.match(statements[2].sql, /WITH ORDINALITY/);
  assert.deepEqual(statements[2].params, [response.body.id, options]);
  assert.equal(statements[3].sql, "COMMIT");
  assert.equal(release.mock.callCount(), 1);
});

test("rejects invalid input before opening a database connection", async (t) => {
  const connect = t.mock.method(pool, "connect");
  for (const body of [
    undefined,
    { question: 4, options: ["A", "B"] },
    { question: "  ", options: ["A", "B"] },
    { question: "a".repeat(301), options: ["A", "B"] },
    { question: "Question", options: "A, B" },
    { question: "Question", options: ["A"] },
    { question: "Question", options: ["A", "B", "C", "D", "E", "F", "G"] },
    { question: "Question", options: ["A", " A "] },
    { question: "Question", options: ["A", " "] },
    { question: "Question", options: ["A", 2] },
    { question: "Question", options: ["A", "B".repeat(151)] },
    { question: "Question", options: ["A", "B\0"] },
    { question: "Question", options: ["A", "\ud800"] },
  ]) {
    const response = await postPoll(body);
    assert.equal(response.statusCode, 400, JSON.stringify(body));
    assert.equal(response.body.status, "error");
  }
  assert.equal(connect.mock.callCount(), 0);
});

test("retries a join-code collision before creating the poll", async (t) => {
  const { statements, release } = mockDatabase(t, { collisions: 1 });
  const response = await postPoll({ question: "Question", options: ["A", "B"] });

  assert.equal(response.statusCode, 201);
  assert.equal(statements[2].sql, "ROLLBACK");
  assert.equal(statements[3].sql, "BEGIN");
  assert.equal(statements[6].sql, "COMMIT");
  assert.equal(release.mock.callCount(), 2);
});

test("returns 503 after repeated join-code collisions", async (t) => {
  const { statements, release } = mockDatabase(t, { collisions: 5 });
  const response = await postPoll({ question: "Question", options: ["A", "B"] });

  assert.equal(response.statusCode, 503);
  assert.equal(statements.filter(({ sql }) => sql === "ROLLBACK").length, 5);
  assert.equal(release.mock.callCount(), 5);
});

test("rolls back an option insert failure and returns a generic error", async (t) => {
  const { statements, release } = mockDatabase(t, { optionError: new Error("private detail") });
  t.mock.method(console, "error", () => {});
  const response = await postPoll({ question: "Question", options: ["A", "B"] });

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { status: "error", message: "Could not create poll" });
  assert.equal(statements.at(-1).sql, "ROLLBACK");
  assert.equal(release.mock.callCount(), 1);
});

const params = { joinCode: "ABC123DEF4" };

test("looks up the public poll with option IDs in display order", async (t) => {
  const poll = {
    id: "9007199254740993",
    question: "Pick one",
    status: "draft",
    options: [{ id: "12", text: "B" }, { id: "11", text: "A" }],
  };
  const query = t.mock.method(pool, "query", async () => ({ rows: [poll] }));
  const response = await callController(getPollByCode, { params });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, poll);
  const [sql, values] = query.mock.calls[0].arguments;
  assert.match(sql, /ORDER BY o\.display_order/);
  assert.deepEqual(values, [params.joinCode]);
});

test("returns 404 for unknown codes on lookup and join", async (t) => {
  t.mock.method(pool, "query", async () => ({ rows: [] }));
  const lookup = await callController(getPollByCode, { params });
  const join = await callController(joinPoll, { params, body: { displayName: "Pat" } });

  for (const response of [lookup, join]) {
    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.body, { status: "error", message: "Poll not found" });
  }
});

test("joins an active poll using a trimmed name and returns only the participant credentials", async (t) => {
  const displayName = "😀".repeat(100);
  const participantId = "9007199254740993";
  const query = t.mock.method(pool, "query", async (sql, values) => ({
    rows: [{ status: "active", participantId, participantToken: values[2] }],
  }));
  const response = await callController(joinPoll, {
    params,
    body: { displayName: ` ${displayName} ` },
  });

  assert.equal(response.statusCode, 201);
  const [sql, values] = query.mock.calls[0].arguments;
  const participantToken = values[2];
  assert.deepEqual(values, [params.joinCode, displayName, participantToken]);
  assert.match(participantToken, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.match(sql, /FOR SHARE/);
  assert.match(sql, /FROM matched_poll WHERE status = 'active'/);
  assert.deepEqual(response.body, { participantId, participantToken });
});

test("returns 409 with the poll status for draft and closed polls", async (t) => {
  const states = ["draft", "closed"];
  t.mock.method(pool, "query", async () => ({
    rows: [{ status: states.shift(), participantId: null, participantToken: null }],
  }));

  for (const status of ["draft", "closed"]) {
    const response = await callController(joinPoll, { params, body: { displayName: "Pat" } });
    assert.equal(response.statusCode, 409);
    assert.deepEqual(response.body, {
      status: "error",
      message: `This poll is ${status}. Only active polls can be joined.`,
    });
  }
});

test("rejects invalid display names before querying the database", async (t) => {
  const query = t.mock.method(pool, "query");
  for (const displayName of [undefined, null, 4, "   ", "😀".repeat(101), "Pat\0", "\ud800"]) {
    const response = await callController(joinPoll, { params, body: { displayName } });
    assert.equal(response.statusCode, 400);
    assert.equal(response.body.message, "Display name must be a string containing 1 to 100 characters");
  }
  assert.equal(query.mock.callCount(), 0);
});

test("returns generic errors when poll lookup or joining fails", async (t) => {
  t.mock.method(pool, "query", async () => { throw new Error("private database details"); });
  t.mock.method(console, "error", () => {});

  const lookup = await callController(getPollByCode, { params });
  const join = await callController(joinPoll, { params, body: { displayName: "Pat" } });
  assert.equal(lookup.statusCode, 500);
  assert.deepEqual(lookup.body, { status: "error", message: "Could not look up poll" });
  assert.equal(join.statusCode, 500);
  assert.deepEqual(join.body, { status: "error", message: "Could not join poll" });
});

const pollId = "9007199254740993";
const organizerToken = randomBytes(32).toString("base64url");
const organizerTokenHash = createHash("sha256").update(organizerToken).digest();

function transition(controller, authorization, id = pollId) {
  return callController(controller, {
    params: { id },
    get: () => authorization,
  });
}

function mockLifecycle(t, initialStatus, { readBarrier } = {}) {
  let status = initialStatus;
  return t.mock.method(pool, "query", async (sql, values) => {
    if (sql.startsWith("SELECT")) {
      assert.deepEqual(values, [pollId]);
      const poll = { status, organizerTokenHash };
      if (readBarrier) await readBarrier();
      return { rows: [poll] };
    }

    const [nextStatus, id, previousStatus, hash] = values;
    assert.match(sql, /WHERE id = \$2 AND status = \$3 AND organizer_token_hash = \$4/);
    assert.equal(id, pollId);
    assert.deepEqual(hash, organizerTokenHash);
    if (status !== previousStatus) return { rows: [] };
    status = nextStatus;
    return { rows: [{ id, status }] };
  });
}

test("requires a bearer authorization header before reading the database", async (t) => {
  const query = t.mock.method(pool, "query");
  for (const header of [undefined, "Basic abc", "Bearer", "Bearer two tokens"]) {
    const response = await transition(activatePoll, header);
    assert.equal(response.statusCode, 401);
    assert.equal(response.headers["WWW-Authenticate"], "Bearer");
  }
  assert.equal(query.mock.callCount(), 0);
});

test("forbids an incorrect organizer token and denies access to historical polls", async (t) => {
  const hashes = [organizerTokenHash, null];
  const query = t.mock.method(pool, "query", async () => ({
    rows: [{ status: "draft", organizerTokenHash: hashes.shift() }],
  }));
  const wrongToken = await transition(activatePoll, "Bearer incorrect");
  const legacyPoll = await transition(activatePoll, `Bearer ${organizerToken}`);

  for (const response of [wrongToken, legacyPoll]) {
    assert.equal(response.statusCode, 403);
    assert.deepEqual(response.body, { status: "error", message: "Organizer access denied" });
  }
  assert.equal(query.mock.callCount(), 2);
  assert.ok(query.mock.calls.every(({ arguments: [sql] }) => sql.startsWith("SELECT")));
});

test("returns 404 for missing polls and IDs outside the PostgreSQL bigint range", async (t) => {
  const query = t.mock.method(pool, "query", async () => ({ rows: [] }));
  const header = `Bearer ${organizerToken}`;
  assert.equal((await transition(activatePoll, header)).statusCode, 404);
  assert.equal((await transition(activatePoll, header, "9223372036854775808")).statusCode, 404);
  assert.equal((await transition(activatePoll, header, "invalid")).statusCode, 404);
  assert.equal(query.mock.callCount(), 1);
});

test("permits draft to active to closed and rejects all other transitions", async (t) => {
  const query = mockLifecycle(t, "draft");
  const events = recordEvents(t, "poll-status-updated");
  const header = `bEaReR ${organizerToken}`;
  assert.equal((await transition(closePoll, header)).statusCode, 409);
  const activated = await transition(activatePoll, header);
  assert.equal(activated.statusCode, 200);
  assert.deepEqual(activated.body, { id: pollId, status: "active" });
  assert.equal((await transition(activatePoll, header)).statusCode, 409);
  const closed = await transition(closePoll, header);
  assert.equal(closed.statusCode, 200);
  assert.deepEqual(closed.body, { id: pollId, status: "closed" });
  assert.equal((await transition(closePoll, header)).statusCode, 409);
  assert.equal((await transition(activatePoll, header)).statusCode, 409);
  assert.equal(query.mock.calls.filter(({ arguments: [sql] }) => sql.startsWith("UPDATE")).length, 2);
  assert.deepEqual(events, [{ pollId, status: "active" }, { pollId, status: "closed" }]);
});

test("rejects the losing transition when two requests read the same draft state", async (t) => {
  const { promise: bothRead, resolve } = Promise.withResolvers();
  let reads = 0;
  const query = mockLifecycle(t, "draft", {
    readBarrier() {
      reads += 1;
      if (reads === 2) resolve();
      return bothRead;
    },
  });
  const header = `Bearer ${organizerToken}`;
  const results = await Promise.all([transition(activatePoll, header), transition(activatePoll, header)]);

  assert.deepEqual(results.map(({ statusCode }) => statusCode).sort(), [200, 409]);
  assert.equal(query.mock.callCount(), 4);
});

function recordEvents(t, name) {
  const events = [];
  const listener = (event) => events.push(event);
  pollEvents.on(name, listener);
  t.after(() => pollEvents.off(name, listener));
  return events;
}

const participantToken = randomUUID();
const optionId = "9223372036854775807";
const ballot = { pollId, status: "active", authorized: true, optionId, voteId: "22" };

function vote(body, authorization = `Bearer ${participantToken}`) {
  return callController(castVote, { params, body, get: () => authorization });
}

test("requires participant bearer credentials and validates the option ID before writing", async (t) => {
  const query = t.mock.method(pool, "query");
  assert.equal((await vote({ optionId, participantId: "3" }, null)).statusCode, 401);
  assert.equal((await vote({ optionId }, "Basic abc")).statusCode, 401);
  assert.equal((await vote({ optionId }, "Bearer incorrect")).statusCode, 403);
  for (const invalid of [undefined, 1, "0", "-1", " 1", "1.5", "9223372036854775808"]) {
    assert.equal((await vote({ optionId: invalid })).statusCode, 400);
  }
  assert.equal(query.mock.callCount(), 0);
});

test("uses the poll lock and participant uniqueness constraint and emits after a successful write", async (t) => {
  const events = recordEvents(t, "results-updated");
  const { promise: committed, resolve } = Promise.withResolvers();
  const query = t.mock.method(pool, "query", () => committed);
  const response = vote({ optionId });

  assert.equal(query.mock.callCount(), 1);
  assert.deepEqual(events, []);
  const [sql, values] = query.mock.calls[0].arguments;
  assert.match(sql, /FOR SHARE/);
  assert.match(sql, /participant\.poll_id = p\.id AND participant\.participant_token = \$2/);
  assert.match(sql, /o\.poll_id = p\.id AND o\.id = \$3/);
  assert.match(sql, /WHERE status = 'active'/);
  assert.match(sql, /ON CONFLICT \(participant_id\) DO NOTHING/);
  assert.deepEqual(values, [params.joinCode, participantToken, optionId]);
  resolve({ rows: [ballot] });
  const { statusCode, body } = await response;
  assert.equal(statusCode, 201);
  assert.deepEqual(body, { voteId: ballot.voteId, optionId });
  assert.deepEqual(events, [{ pollId }]);
});

test("rejects unknown polls, foreign credentials and options, and inactive polls without emitting", async (t) => {
  const events = recordEvents(t, "results-updated");
  const cases = [
    [[], 404],
    [[{ ...ballot, authorized: false, voteId: null }], 403],
    [[{ ...ballot, optionId: null, voteId: null }], 400],
    [[{ ...ballot, status: "draft", voteId: null }], 409],
    [[{ ...ballot, status: "closed", voteId: null }], 409],
  ];
  const query = t.mock.method(pool, "query");
  for (const [rows, status] of cases) {
    query.mock.mockImplementation(async () => ({ rows }));
    assert.equal((await vote({ optionId })).statusCode, status);
  }
  assert.deepEqual(events, []);
});

test("returns one success for concurrent votes and rejects further duplicate votes", async (t) => {
  const events = recordEvents(t, "results-updated");
  const { promise: bothSubmitted, resolve } = Promise.withResolvers();
  let attempts = 0;
  t.mock.method(pool, "query", async () => {
    const attempt = ++attempts;
    if (attempt === 2) resolve();
    await bothSubmitted;
    return { rows: [attempt === 1 ? ballot : { ...ballot, voteId: null }] };
  });

  const results = await Promise.all([vote({ optionId }), vote({ optionId })]);
  assert.deepEqual(results.map(({ statusCode }) => statusCode).sort(), [201, 409]);
  assert.equal((await vote({ optionId })).statusCode, 409);
  assert.deepEqual(events, [{ pollId }]);
});

test("returns a conflict when a pending vote observes a concurrent closure", async (t) => {
  const events = recordEvents(t, "results-updated");
  const { promise: pollLockReleased, resolve } = Promise.withResolvers();
  let status = "active";
  const query = t.mock.method(pool, "query", async () => {
    await pollLockReleased;
    return { rows: [{ ...ballot, status, voteId: null }] };
  });
  const pendingVote = vote({ optionId });
  assert.equal(query.mock.callCount(), 1);

  status = "closed";
  resolve();
  const response = await pendingVote;
  assert.equal(response.statusCode, 409);
  assert.equal(response.body.message, "Only active polls accept votes");
  assert.deepEqual(events, []);
});

test("does not emit or leak credentials when the vote write fails", async (t) => {
  const events = recordEvents(t, "results-updated");
  t.mock.method(pool, "query", async () => { throw new Error(participantToken); });
  const log = t.mock.method(console, "error", () => {});
  const { statusCode, body } = await vote({ optionId });
  assert.equal(statusCode, 500);
  assert.deepEqual(body, { status: "error", message: "Could not record vote" });
  assert.deepEqual(events, []);
  assert.equal(log.mock.calls.flatMap(({ arguments: args }) => args).includes(participantToken), false);
});

test("returns ordered aggregate results, including zero votes and rounded percentages", async (t) => {
  const options = [
    { id: "12", text: "B", voteCount: 0 },
    { id: "11", text: "A", voteCount: 0 },
    { id: "13", text: "C", voteCount: 0 },
  ];
  const poll = { id: pollId, question: "Pick one", status: "active", options };
  const query = t.mock.method(pool, "query", async () => ({ rows: [poll] }));
  const empty = await callController(getResults, { params });
  assert.equal(empty.statusCode, 200);
  assert.deepEqual(empty.body, {
    ...poll, totalVotes: 0, options: options.map((option) => ({ ...option, percentage: 0 })),
  });

  poll.status = "closed";
  options[1].voteCount = 1;
  options[2].voteCount = 2;
  const populated = await callController(getResults, { params });
  assert.equal(populated.statusCode, 200);
  assert.deepEqual(populated.body, {
    ...poll,
    totalVotes: 3,
    options: options.map((option, index) => ({ ...option, percentage: [0, 33.33, 66.67][index] })),
  });
  const [sql, values] = query.mock.calls[0].arguments;
  assert.match(sql, /LEFT JOIN votes/);
  assert.match(sql, /ORDER BY o\.display_order/);
  assert.deepEqual(values, [params.joinCode]);
});

test("hides draft results and returns 404 for unknown codes", async (t) => {
  const query = t.mock.method(pool, "query", async () => ({ rows: [{ status: "draft", options: [] }] }));
  const draft = await callController(getResults, { params });
  assert.equal(draft.statusCode, 409);
  assert.equal(draft.body.options, undefined);
  query.mock.mockImplementation(async () => ({ rows: [] }));
  assert.equal((await callController(getResults, { params })).statusCode, 404);
});
