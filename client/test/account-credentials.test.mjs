import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeEmail, validEmail, validPassword } from "../src/features/auth/credentials.ts";

test("matches the server's normalized email shape and limits", () => {
  assert.equal(normalizeEmail("  HOST+POLL@Example.TEST  "), "host+poll@example.test");
  assert.equal(validEmail("host+poll@example.test"), true);
  for (const email of ["a..b@example.test", "a@localhost", "a@-domain.test", "a@b@test.com", "a".repeat(65) + "@example.test"]) {
    assert.equal(validEmail(email), false);
  }
});

test("counts password code points without trimming and rejects invalid text", () => {
  assert.equal(validPassword("abcdefgh"), true);
  assert.equal(validPassword("a".repeat(7) + " "), true);
  assert.equal(validPassword("😀".repeat(128)), true);
  for (const password of ["x".repeat(7), "😀".repeat(129), "x".repeat(8) + "\0", "x".repeat(8) + "\uD800"]) {
    assert.equal(validPassword(password), false);
  }
});
