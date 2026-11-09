const { createHash, randomBytes } = require("node:crypto");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { parseArgs } = require("node:util");
const { parse } = require("dotenv");
const { Pool } = require("pg");

const participantCount = 64;
const profiles = [
  { total: 61, weights: [36, 12, 9, 4, 3, 2] },
  { total: 56, weights: [22, 15, 12, 7, 5, 3] },
  { total: 52, weights: [29, 10, 8, 5, 4, 2] },
  { total: 58, weights: [26, 8, 10, 14, 6, 3] },
];

class SeederError extends Error {}

function validId(value) {
  return typeof value === "string" && /^[1-9]\d{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n;
}

function cliOptions(args) {
  const { values } = parseArgs({
    args,
    options: {
      "create-demo-session": { type: "boolean" },
      "source-session-id": { type: "string" },
      "owner-id": { type: "string" },
      "dry-run": { type: "boolean" },
      confirm: { type: "boolean" },
    },
  });
  if (!values["create-demo-session"] || !validId(values["source-session-id"]) || !validId(values["owner-id"]) ||
      !!values["dry-run"] === !!values.confirm) {
    throw new SeederError("Use --create-demo-session --source-session-id ID --owner-id ID and exactly one of --dry-run or --confirm.");
  }
  return { sourceId: values["source-session-id"], ownerId: values["owner-id"], dryRun: !!values["dry-run"] };
}

function localConfig(file, env) {
  if ([file.NODE_ENV, env.NODE_ENV].some((value) => value && !["development", "test"].includes(value))) {
    throw new SeederError("Demo seeding requires a local development or test environment.");
  }

  const host = env.DB_HOST ?? file.DB_HOST;
  const port = env.DB_PORT ?? file.DB_PORT;
  const database = env.DB_NAME ?? file.DB_NAME;
  const user = env.DB_USER ?? file.DB_USER;
  const password = env.DB_PASSWORD ?? file.DB_PASSWORD;
  if (!["localhost", "127.0.0.1"].includes(host) || port !== "5434" || database !== "quickpoll" ||
      user !== "quickpoll" || !password) {
    throw new SeederError("Expected the local Compose database quickpoll on loopback port 5434 with the quickpoll role and a configured password.");
  }
  return { host: "127.0.0.1", port: 5434, database, user, password, ssl: false, connectionTimeoutMillis: 3000 };
}

async function verifyDatabase(client) {
  const { rows: [identity] } = await client.query(
    `SELECT current_database() AS database, current_user AS role,
            current_setting('server_version_num')::integer AS version`,
  );
  if (identity.database !== "quickpoll" || identity.role !== "quickpoll" ||
      identity.version < 180000 || identity.version >= 190000) {
    throw new SeederError("Connected database does not match the expected QuickPoll PostgreSQL 18 target.");
  }

  const expected = [
    ["polls", "fk_poll_session_owner"], ["polls", "uq_poll_session_position"],
    ["session_participants", "uq_session_participant_token_hash"],
    ["participants", "fk_participant_poll_session"], ["participants", "fk_participant_session_identity"],
    ["participants", "uq_poll_session_participant"], ["votes", "votes_participant_id_key"],
  ];
  const { rowCount } = await client.query(
    `SELECT 1 FROM unnest($1::text[], $2::text[]) AS expected(table_name, constraint_name)
     JOIN pg_constraint c ON c.conrelid = to_regclass('public.' || expected.table_name)
                         AND c.conname = expected.constraint_name AND c.convalidated`,
    [expected.map(([table]) => table), expected.map(([, constraint]) => constraint)],
  );
  if (rowCount !== expected.length) throw new SeederError("QuickPoll schema mismatch. Apply migrations 001 through 005 before seeding.");
}

async function readSource(client, sourceId, ownerId) {
  const { rows: [source] } = await client.query(
    `SELECT id, title, status FROM poll_sessions WHERE id = $1 AND organizer_id = $2`,
    [sourceId, ownerId],
  );
  if (!source) throw new SeederError("Source session not found for the specified organizer.");
  if (!["draft", "closed"].includes(source.status)) throw new SeederError("Use a draft or completed source session.");
  if (/ · Demo #\d+$/.test(source.title)) throw new SeederError("Choose the original session instead of a generated demo.");

  const { rows: questions } = await client.query(
    `SELECT p.question, p.session_position AS position,
            ARRAY(SELECT o.option_text FROM poll_options o WHERE o.poll_id = p.id ORDER BY o.display_order) AS options
     FROM polls p WHERE p.session_id = $1 ORDER BY p.session_position`,
    [sourceId],
  );
  if (questions.length !== profiles.length || questions.some(({ options }) => options.length < 2 || options.length > 6)) {
    throw new SeederError("The source needs exactly four questions, each with two to six options.");
  }
  return { source, questions };
}

function planQuestion(question, index) {
  const { total, weights } = profiles[index];
  const applicable = weights.slice(0, question.options.length);
  const weightTotal = applicable.reduce((sum, weight) => sum + weight, 0);
  const shares = applicable.map((weight) => total * weight / weightTotal);
  const counts = shares.map(Math.floor);
  const remaining = total - counts.reduce((sum, count) => sum + count, 0);
  const priorities = shares.map((share, index) => ({ index, remainder: share - counts[index] }));
  priorities.sort((a, b) => b.remainder - a.remainder);
  for (const { index } of priorities.slice(0, remaining)) counts[index]++;

  return { ...question, total, counts };
}

async function insertWithCode(client, sql, params) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const joinCode = randomBytes(5).toString("hex").toUpperCase();
    const { rows: [row] } = await client.query(sql, [joinCode, ...params]);
    if (row) return row;
  }
  throw new SeederError("Could not allocate a unique join code.");
}

async function insertParticipants(client, sessionId) {
  const first = ["Aster", "Bramble", "Clover", "Dune", "Ember", "Fern", "Grove", "Harbor"];
  const last = ["Cloud", "Finch", "Glade", "Lantern", "Pebble", "Quill", "Sprout", "Wren"];
  const names = first.flatMap((given) => last.map((family) => "Demo · " + given + " " + family));
  const hashes = names.map(() => createHash("sha256").update(randomBytes(32)).digest("hex"));
  const { rows } = await client.query(
    `INSERT INTO session_participants (session_id, display_name, participant_token_hash)
     SELECT $1, name, decode(hash, 'hex') FROM unnest($2::text[], $3::text[]) AS demo(name, hash)
     RETURNING id, display_name`,
    [sessionId, names, hashes],
  );
  const byName = new Map(rows.map(({ id, display_name }) => [display_name, id]));
  if (byName.size !== participantCount) throw new SeederError("Participant count did not match the preview. Changes were rolled back.");
  return names.map((name) => byName.get(name));
}

async function insertQuestion(client, sessionId, ownerId, plan, participants, questionIndex) {
  const poll = await insertWithCode(client,
    `INSERT INTO polls (join_code, question, status, organizer_id, session_id, session_position)
     VALUES ($1, $2, 'closed', $3, $4, $5) ON CONFLICT (join_code) DO NOTHING RETURNING id`,
    [plan.question, ownerId, sessionId, plan.position],
  );
  const { rows: options } = await client.query(
    `INSERT INTO poll_options (poll_id, option_text, display_order)
     SELECT $1, text, position::integer FROM unnest($2::text[]) WITH ORDINALITY AS answers(text, position)
     RETURNING id, display_order`,
    [poll.id, plan.options],
  );
  options.sort((a, b) => a.display_order - b.display_order);

  const optionIds = plan.counts.flatMap((count, i) => Array(count).fill(options[i].id));
  const voterIds = optionIds.map((_, i) => participants[(i * 17 + questionIndex * 13) % participantCount]);
  const { rowCount } = await client.query(
    `WITH choices AS (
       SELECT * FROM unnest($2::bigint[], $3::bigint[]) AS choice(session_participant_id, option_id)
     ), voters AS (
       INSERT INTO participants (poll_id, display_name, session_id, session_participant_id)
       SELECT $1, p.display_name, p.session_id, p.id FROM choices c
       JOIN session_participants p ON p.id = c.session_participant_id
       RETURNING id, session_participant_id
     )
     INSERT INTO votes (poll_id, participant_id, option_id)
     SELECT $1, v.id, c.option_id FROM voters v JOIN choices c USING (session_participant_id)`,
    [poll.id, voterIds, optionIds],
  );
  if (rowCount !== plan.total) throw new SeederError("Vote count did not match the preview. Changes were rolled back.");
  return rowCount;
}

async function seedDemo(client, { sourceId, ownerId, dryRun }) {
  await client.query(dryRun ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY" : "BEGIN ISOLATION LEVEL READ COMMITTED");
  try {
    await client.query("SET LOCAL search_path = pg_catalog, public");
    await verifyDatabase(client);
    if (!dryRun) {
      // Serialize reruns for this source without locking the source session itself.
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", ["quickpoll-local-demo:" + sourceId]);
    }
    const { source, questions } = await readSource(client, sourceId, ownerId);
    const marker = " · Demo #" + sourceId;
    const { rows: [prior] } = await client.query(
      "SELECT id FROM poll_sessions WHERE organizer_id = $1 AND right(title, char_length($2)) = $2",
      [ownerId, marker],
    );
    if (prior) throw new SeederError("A demo for this source already exists as session " + prior.id + ". No data was changed.");

    const title = [...source.title].slice(0, 150 - marker.length).join("") + marker;
    const plans = questions.map(planQuestion);
    const result = { title, participants: participantCount, plans, votes: plans.reduce((sum, plan) => sum + plan.total, 0) };
    if (dryRun) {
      await client.query("ROLLBACK");
      return result;
    }

    const session = await insertWithCode(client,
      `INSERT INTO poll_sessions (join_code, organizer_id, title, status)
       VALUES ($1, $2, $3, 'closed') ON CONFLICT (join_code) DO NOTHING
       RETURNING id, join_code AS "joinCode"`,
      [ownerId, title],
    );
    const participants = await insertParticipants(client, session.id);
    let votes = 0;
    for (const [index, plan] of plans.entries()) {
      votes += await insertQuestion(client, session.id, ownerId, plan, participants, index);
    }
    await client.query("COMMIT");
    return { ...result, session, votes };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  }
}

async function main() {
  const options = cliOptions(process.argv.slice(2));
  let file;
  try {
    file = parse(readFileSync(path.join(__dirname, "../.env")));
  } catch {
    throw new SeederError("Could not read server/.env.");
  }
  const pool = new Pool(localConfig(file, process.env));
  try {
    const client = await pool.connect();
    try {
      const result = await seedDemo(client, options);
      console.log(options.dryRun ? "Dry run. No rows written." : "Demo session created.");
      console.log(result.title);
      console.log(result.participants + " session participants, " + result.votes + " votes");
      for (const plan of result.plans) {
        console.log("Question " + plan.position + ": " + plan.total + " votes");
        for (const [index, count] of plan.counts.entries()) console.log("  " + plan.options[index] + " — " + count);
      }
      if (result.session) {
        console.log("Organizer: /sessions/" + result.session.id);
        console.log("Presentation: /sessions/present?code=" + result.session.joinCode);
        console.log("Summary: /sessions/summary?code=" + result.session.joinCode);
      }
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    const message = error instanceof SeederError ? error.message
      : error.code?.startsWith("ERR_PARSE_ARGS") ? "Invalid arguments. See the demo seeding commands in README.md."
      : ["42P01", "42703", "42883"].includes(error.code) ? "QuickPoll schema mismatch. Apply migrations 001 through 005."
      : ["ECONNREFUSED", "ETIMEDOUT", "28P01", "3D000"].includes(error.code) ? "Could not connect to the local QuickPoll database. Check Docker and server/.env."
      : "Demo seeding failed. Check the local database and schema.";
    console.error(message);
    process.exitCode = 1;
  });
}

module.exports = { cliOptions, localConfig, seedDemo };
