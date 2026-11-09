import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPublicJoinLink, presentationPath } from "../src/features/polls/publicLinks.ts";
import { sessionPublicPath } from "../src/features/sessions/publicPaths.ts";

test("presentation and participant links carry only the encoded public join code", () => {
  const code = "A & B/?";
  const browser = "http://localhost:5173";
  const presentation = new URL(presentationPath(code), browser);
  const participant = buildPublicJoinLink(code, browser, "http://192.168.1.42:5173");
  assert.equal(presentation.pathname, "/present");
  assert.deepEqual([...presentation.searchParams], [["code", code]]);
  assert.equal(new URL(participant.href).origin, "http://192.168.1.42:5173");
  assert.equal(new URL(participant.href).pathname, "/join");
  assert.deepEqual([...new URL(participant.href).searchParams], [["code", code]]);
  assert.equal(participant.localOnly, false);
});

test("session join, presentation, and summary links share only the public session code", () => {
  const code = "A & B";
  const origin = "http://192.168.1.42:5173";
  const link = buildPublicJoinLink(code, "http://localhost:5173", origin, "/sessions/join");
  assert.equal(link.href, new URL(sessionPublicPath("join", code), origin).href);
  for (const view of ["join", "present", "summary"]) {
    const url = new URL(sessionPublicPath(view, code), origin);
    assert.equal(url.pathname, "/sessions/" + view);
    assert.deepEqual([...url.searchParams], [["code", code]]);
  }
});

test("rejects unsafe configuration and warns on loopback or unspecified fallback addresses", () => {
  for (const configured of ["javascript:alert(1)", "https://user:password@example.test", "https://example.test/subpath", "https://example.test/?extra=1"]) {
    const link = buildPublicJoinLink("AB12", "http://localhost:5173", configured);
    assert.deepEqual(link, {
      href: "http://localhost:5173/join?code=AB12",
      invalidConfiguration: true,
      localOnly: true,
    });
  }

  for (const host of ["localhost", "test.localhost", "127.1.2.3", "[::1]", "0.0.0.0", "[::]"]) {
    assert.equal(buildPublicJoinLink("AB12", "http://" + host).localOnly, true);
  }
});
