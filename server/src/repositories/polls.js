const pool = require("../config/db");

function insertPollOptions(client, pollId, options) {
  return client.query(
    `INSERT INTO poll_options (poll_id, option_text, display_order)
     SELECT $1, option_text, display_order::integer
     FROM unnest($2::text[]) WITH ORDINALITY AS options(option_text, display_order)
     RETURNING id, option_text AS text, display_order`,
    [pollId, options],
  );
}

async function insertDraft({ joinCode, question, options, organizerTokenHash, organizerId }) {
  const client = await pool.connect();
  let rollbackError;

  try {
    await client.query("BEGIN");

    const { rows: [poll] } = await client.query(
      `INSERT INTO polls (join_code, question, status, organizer_token_hash, organizer_id)
       VALUES ($1, $2, 'draft', $3, $4)
       ON CONFLICT (join_code) DO NOTHING
       RETURNING id, join_code AS "joinCode", question, status`,
      [joinCode, question, organizerTokenHash, organizerId],
    );

    if (!poll) {
      await client.query("ROLLBACK");
      return null;
    }

    await insertPollOptions(client, poll.id, options);

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
     WHERE p.join_code = $1 AND p.session_id IS NULL
     GROUP BY p.id`,
    [joinCode],
  );
  return poll ?? null;
}

async function insertParticipant({ joinCode, displayName, participantToken }) {
  // The shared row lock lets joins run concurrently and serializes them with status updates.
  const { rows: [result] } = await pool.query(
    `WITH matched_poll AS (
       SELECT id, status FROM polls WHERE join_code = $1 AND session_id IS NULL FOR SHARE
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
    'SELECT status, organizer_token_hash AS "organizerTokenHash", organizer_id AS "organizerId" FROM polls WHERE id = $1 AND session_id IS NULL',
    [id],
  );
  return poll ?? null;
}

async function updatePollStatus({ id, previousStatus, nextStatus, organizerTokenHash, organizerId }) {
  // Recheck the authorized state and credential in the write to handle concurrent changes.
  const authorization = organizerId ? "organizer_id = $4" : "organizer_token_hash = $4";
  const { rows: [poll] } = await pool.query(
    `UPDATE polls SET status = $1
     WHERE id = $2 AND status = $3 AND ${authorization} AND session_id IS NULL
     RETURNING id, status`,
    [nextStatus, id, previousStatus, organizerId ?? organizerTokenHash],
  );
  return poll ?? null;
}

async function findOwnedPolls(organizerId) {
  const { rows } = await pool.query(
    `SELECT id, join_code AS "joinCode", question, status, created_at AS "createdAt"
     FROM polls WHERE organizer_id = $1 AND session_id IS NULL ORDER BY id DESC`,
    [organizerId],
  );
  return rows;
}

async function insertVote({ joinCode, participantToken, optionId }) {
  // The shared lock keeps the poll active until this statement commits, while allowing other votes.
  const { rows: [result] } = await pool.query(
    `WITH matched_poll AS (
       SELECT id, status FROM polls WHERE join_code = $1 AND session_id IS NULL FOR SHARE
     ), ballot AS (
       SELECT p.id AS poll_id, p.status, participant.id AS participant_id, o.id AS option_id
       FROM matched_poll p
       LEFT JOIN participants participant
         ON participant.poll_id = p.id AND participant.participant_token = $2
       LEFT JOIN poll_options o ON o.poll_id = p.id AND o.id = $3
     ), inserted AS (
       INSERT INTO votes (poll_id, participant_id, option_id)
       SELECT poll_id, participant_id, option_id FROM ballot
       WHERE status = 'active' AND participant_id IS NOT NULL AND option_id IS NOT NULL
       ON CONFLICT (participant_id) DO NOTHING
       RETURNING id
     )
     SELECT ballot.poll_id AS "pollId", ballot.status,
            ballot.participant_id IS NOT NULL AS "authorized",
            ballot.option_id AS "optionId", inserted.id AS "voteId"
     FROM ballot LEFT JOIN inserted ON true`,
    [joinCode, participantToken, optionId],
  );
  return result ?? null;
}

// Used with a poll aliased as p. Include options that have no votes.
const resultOptions = `COALESCE((
  SELECT json_agg(json_build_object('id', o.id::text, 'text', o.option_text, 'voteCount', o.vote_count)
                  ORDER BY o.display_order)
  FROM (
    SELECT o.id, o.option_text, o.display_order, count(v.option_id) AS vote_count
    FROM poll_options o
    LEFT JOIN votes v ON v.poll_id = o.poll_id AND v.option_id = o.id
    WHERE o.poll_id = p.id AND p.status <> 'draft'
    GROUP BY o.id
  ) o
), '[]'::json) AS options`;

async function findResultsByCode(joinCode) {
  const { rows: [poll] } = await pool.query(
    `SELECT p.id, p.question, p.status, ${resultOptions}
     FROM polls p WHERE p.join_code = $1 AND p.session_id IS NULL`,
    [joinCode],
  );
  return poll ?? null;
}

module.exports = {
  insertDraft, findPublicByCode, insertParticipant, findLifecycleById, updatePollStatus,
  insertVote, findResultsByCode, findOwnedPolls, insertPollOptions, resultOptions,
};
