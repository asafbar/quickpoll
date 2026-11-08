const assert = require("node:assert/strict");
const { test } = require("node:test");
const pool = require("../src/config/db");
const { createPoll, getPollByCode, joinPoll } = require("../src/controllers/polls");

async function callController(controller, request) {
  const response = {
    statusCode: 200,
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
  assert.match(response.body.joinCode, /^[0-9A-F]{10}$/);
  assert.deepEqual(response.body, {
    id: "9007199254740993",
    joinCode: response.body.joinCode,
    question,
    status: "draft",
    options,
  });
  assert.equal(statements.length, 4);
  assert.equal(statements[0].sql, "BEGIN");
  assert.deepEqual(statements[1].params, [response.body.joinCode, question]);
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
