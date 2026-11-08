const pool = require("../config/db");

async function insertDraft({ joinCode, question, options, organizerTokenHash }) {
  const client = await pool.connect();
  let rollbackError;

  try {
    await client.query("BEGIN");

    const { rows: [poll] } = await client.query(
      `INSERT INTO polls (join_code, question, status, organizer_token_hash)
       VALUES ($1, $2, 'draft', $3)
       ON CONFLICT (join_code) DO NOTHING
       RETURNING id, join_code AS "joinCode", question, status`,
      [joinCode, question, organizerTokenHash],
    );

    if (!poll) {
      await client.query("ROLLBACK");
      return null;
    }

    await client.query(
      `INSERT INTO poll_options (poll_id, option_text, display_order)
       SELECT $1, option_text, display_order::integer
       FROM unnest($2::text[]) WITH ORDINALITY AS options(option_text, display_order)`,
      [poll.id, options],
    );

    await client.query("COMMIT");
    return { ...poll, options };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (error) {
      rollbackError = error;
    }
    throw error;
  } finally {
    client.release(rollbackError);
  }
}

async function findPublicByCode(joinCode) {
  const { rows: [poll] } = await pool.query(
    `SELECT p.id, p.question, p.status,
            COALESCE(
              json_agg(json_build_object('id', o.id::text, 'text', o.option_text)
                       ORDER BY o.display_order) FILTER (WHERE o.id IS NOT NULL),
              '[]'::json
            ) AS options
     FROM polls p
     LEFT JOIN poll_options o ON o.poll_id = p.id
     WHERE p.join_code = $1
     GROUP BY p.id`,
    [joinCode],
  );
  return poll ?? null;
}

async function insertParticipant({ joinCode, displayName, participantToken }) {
  // The shared row lock lets joins run concurrently and serializes them with status updates.
  const { rows: [result] } = await pool.query(
    `WITH matched_poll AS (
       SELECT id, status FROM polls WHERE join_code = $1 FOR SHARE
     ), participant AS (
       INSERT INTO participants (poll_id, display_name, participant_token)
       SELECT id, $2, $3 FROM matched_poll WHERE status = 'active'
       RETURNING id AS "participantId", participant_token AS "participantToken"
     )
     SELECT matched_poll.status, participant."participantId", participant."participantToken"
     FROM matched_poll LEFT JOIN participant ON true`,
    [joinCode, displayName, participantToken],
  );
  return result ?? null;
}

async function findLifecycleById(id) {
  const { rows: [poll] } = await pool.query(
    'SELECT status, organizer_token_hash AS "organizerTokenHash" FROM polls WHERE id = $1',
    [id],
  );
  return poll ?? null;
}

async function updatePollStatus({ id, previousStatus, nextStatus, organizerTokenHash }) {
  // Recheck the authorized state and hash in the write to handle concurrent changes.
  const { rows: [poll] } = await pool.query(
    `UPDATE polls SET status = $1
     WHERE id = $2 AND status = $3 AND organizer_token_hash = $4
     RETURNING id, status`,
    [nextStatus, id, previousStatus, organizerTokenHash],
  );
  return poll ?? null;
}

module.exports = { insertDraft, findPublicByCode, insertParticipant, findLifecycleById, updatePollStatus };
