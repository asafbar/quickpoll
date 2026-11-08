const assert = require("node:assert/strict");
const { test } = require("node:test");
const pool = require("../src/config/db");
const { createPoll } = require("../src/controllers/polls");

async function postPoll(body) {
  const response = {
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
    },
  };
  await createPoll({ body }, response);
  return response;
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
