import assert from "node:assert/strict";
import { test } from "node:test";
import { hasConfirmedVote, rememberConfirmedVote, saveParticipantSession } from "../src/features/polls/session.ts";

function mockSessionStorage(t) {
  const items = new Map();
  t.mock.getter(globalThis, "sessionStorage", () => ({
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => items.set(key, value),
  }));
  return items;
}

test("joining does not create a vote receipt and confirmed votes are scoped to poll and participant", (t) => {
  const storage = mockSessionStorage(t);
  const participant = { participantId: "123", participantToken: "private-token" };

  saveParticipantSession("10", participant);
  assert.equal(hasConfirmedVote("10", "123"), false);

  rememberConfirmedVote("10", "123");
  assert.equal(hasConfirmedVote("10", "123"), true);
  assert.equal(hasConfirmedVote("20", "123"), false);
  assert.equal(hasConfirmedVote("10", "456"), false);
  assert.equal(storage.get("quickpoll:vote:10"), JSON.stringify("123"));
});

test("unavailable session storage cannot break a vote confirmed by the server", (t) => {
  t.mock.getter(globalThis, "sessionStorage", () => { throw new Error("Storage unavailable"); });
  assert.doesNotThrow(() => rememberConfirmedVote("10", "123"));
  assert.equal(hasConfirmedVote("10", "123"), false);
});
