const assert = require("node:assert/strict");
const { test } = require("node:test");
const { cliOptions, localConfig } = require("../scripts/seed-demo");

const source = ["--create-demo-session", "--source-session-id", "42", "--owner-id", "7"];
const local = {
  DB_HOST: "localhost", DB_PORT: "5434", DB_NAME: "quickpoll", DB_USER: "quickpoll", DB_PASSWORD: "test-only",
};

test("requires an explicit source, owner and exactly one preview or confirmation mode", () => {
  for (const args of [[], source, [...source, "--dry-run", "--confirm"],
    ["--create-demo-session", "--source-session-id", "9223372036854775808", "--owner-id", "7", "--confirm"]]) {
    assert.throws(() => cliOptions(args), /Use --create-demo-session/);
  }
  assert.deepEqual(cliOptions([...source, "--dry-run"]), { sourceId: "42", ownerId: "7", dryRun: true });
  assert.deepEqual(cliOptions([...source, "--confirm"]), { sourceId: "42", ownerId: "7", dryRun: false });
});

test("restricts seeding to the expected local Compose identity and rejects production", () => {
  assert.equal(localConfig(local, {}).host, "127.0.0.1");
  assert.throws(() => localConfig(local, { NODE_ENV: "production" }), /local development or test/);
  assert.throws(() => localConfig({ ...local, NODE_ENV: "production" }, { NODE_ENV: "development" }), /local development or test/);
  for (const env of [{ DB_HOST: "db.example.test" }, { DB_PORT: "5432" }, { DB_NAME: "postgres" },
    { DB_USER: "postgres" }, { DB_PASSWORD: "" }]) {
    assert.throws(() => localConfig(local, env), /Expected the local Compose database/);
  }
});
