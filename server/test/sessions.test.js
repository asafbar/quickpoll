const assert = require("node:assert/strict");
const { test } = require("node:test");
const repository = require("../src/repositories/sessions");
const service = require("../src/services/sessions");
const { InvalidPollError } = require("../src/services/polls");

test("validates and trims session titles before writing, and retries join-code collisions", async (t) => {
  let attempts = 0;
  const insert = t.mock.method(repository, "insertSession", async (input) => {
    assert.equal(input.organizerId, "7");
    assert.equal(input.title, "Team session");
    assert.match(input.joinCode, /^[0-9A-F]{10}$/);
    return ++attempts === 1 ? null : { id: "1", ...input };
  });

  for (const title of [null, " ", "x".repeat(151), "Invalid\0title"]) {
    await assert.rejects(service.createSession("7", { title }), InvalidPollError);
  }
  assert.equal(insert.mock.callCount(), 0);
  assert.equal((await service.createSession("7", { title: " Team session " })).title, "Team session");
  assert.equal(insert.mock.callCount(), 2);
});

test("validates questions using standalone poll rules and preserves answer order", async (t) => {
  const append = t.mock.method(repository, "appendQuestion", async (input) => {
    assert.equal(input.organizerId, "7");
    assert.equal(input.sessionId, "9");
    assert.equal(input.question, "Pick one");
    assert.deepEqual(input.options, ["B", "A"]);
    return { outcome: "created", question: { id: "42", position: 1 } };
  });
  for (const options of [["A"], ["A", " A "], ["A", " "], ["A", "x".repeat(151)]]) {
    await assert.rejects(service.addQuestion("7", "9", { question: "Pick one", options }), InvalidPollError);
  }
  assert.equal(await service.addQuestion("7", "9223372036854775808", {}), null);
  assert.equal(append.mock.callCount(), 0);
  assert.deepEqual(await service.addQuestion("7", "9", { question: " Pick one ", options: [" B ", "A"] }), {
    id: "42", position: 1,
  });
});

test("keeps unavailable sessions indistinguishable and rejects changes to non-draft sessions", async (t) => {
  const append = t.mock.method(repository, "appendQuestion", async () => ({ outcome: "not-found" }));
  const input = { question: "Pick one", options: ["A", "B"] };
  assert.equal(await service.addQuestion("7", "9", input), null);

  append.mock.mockImplementation(async () => ({ outcome: "not-draft" }));
  await assert.rejects(service.addQuestion("7", "9", input), service.SessionNotDraftError);

  append.mock.mockImplementation(async () => ({ outcome: "collision" }));
  await assert.rejects(service.addQuestion("7", "9", input), service.SessionCodeUnavailableError);
});

test("rejects malformed lookup identifiers without querying the repository", (t) => {
  const owned = t.mock.method(repository, "findOwnedSession");
  const publicLookup = t.mock.method(repository, "findPublicSession");
  assert.equal(service.getSession("7", "abc"), null);
  assert.equal(service.getPublicSession("CODE\0"), null);
  assert.equal(owned.mock.callCount(), 0);
  assert.equal(publicLookup.mock.callCount(), 0);
});
