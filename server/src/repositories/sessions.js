const pool = require("../config/db");
const { insertPollOptions } = require("./polls");

const sessionFields = `s.id, s.title, s.join_code AS "joinCode", s.status,
  s.created_at AS "createdAt", s.updated_at AS "updatedAt"`;
const activeQuestion = `(SELECT id FROM polls
  WHERE session_id = s.id AND session_id IS NOT NULL AND status = 'active') AS "activeQuestionId"`;

async function insertSession({ organizerId, title, joinCode }) {
  const { rows: [session] } = await pool.query(
    `INSERT INTO poll_sessions AS s (organizer_id, title, join_code) VALUES ($1, $2, $3)
     ON CONFLICT (join_code) DO NOTHING
     RETURNING ${sessionFields}, NULL::bigint AS "activeQuestionId"`,
    [organizerId, title, joinCode],
  );
  return session ?? null;
}

async function findOwnedSessions(organizerId) {
  const { rows } = await pool.query(
    `SELECT ${sessionFields}, ${activeQuestion}
     FROM poll_sessions s WHERE s.organizer_id = $1 ORDER BY s.id DESC`,
    [organizerId],
  );
  return rows;
}

async function findOwnedSession(organizerId, sessionId) {
  const { rows: [session] } = await pool.query(
    `SELECT ${sessionFields}, ${activeQuestion},
       COALESCE((
         SELECT json_agg(
           json_build_object(
             'id', p.id::text, 'question', p.question, 'status', p.status, 'position', p.session_position,
             'options', COALESCE((
               SELECT json_agg(json_build_object('id', o.id::text, 'text', o.option_text) ORDER BY o.display_order)
               FROM poll_options o WHERE o.poll_id = p.id
             ), '[]'::json)
           ) ORDER BY p.session_position
         )
         FROM polls p WHERE p.session_id = s.id
       ), '[]'::json) AS questions
     FROM poll_sessions s WHERE s.organizer_id = $1 AND s.id = $2`,
    [organizerId, sessionId],
  );
  return session ?? null;
}

async function findPublicSession(joinCode) {
  const { rows: [session] } = await pool.query(
    `SELECT s.title, s.join_code AS "joinCode", s.status, ${activeQuestion},
       (SELECT json_build_object('id', p.id::text, 'question', p.question, 'status', p.status, 'position', p.session_position)
        FROM polls p WHERE p.session_id = s.id AND p.status IN ('active', 'closed')
        ORDER BY p.session_position DESC LIMIT 1) AS "currentQuestion"
     FROM poll_sessions s WHERE s.join_code = $1`,
    [joinCode],
  );
  return session ?? null;
}

async function findSessionRoom(joinCode) {
  const { rows: [session] } = await pool.query("SELECT id FROM poll_sessions WHERE join_code = $1", [joinCode]);
  return session ?? null;
}

async function appendQuestion({ organizerId, sessionId, joinCode, question, options }) {
  const client = await pool.connect();
  let rollbackError;
  try {
    await client.query("BEGIN");
    // Serialize position allocation and any future session lifecycle writes on the session row.
    const { rows: [session] } = await client.query(
      "SELECT status FROM poll_sessions WHERE organizer_id = $1 AND id = $2 FOR UPDATE",
      [organizerId, sessionId],
    );
    if (session?.status !== "draft") {
      await client.query("ROLLBACK");
      return { outcome: session ? "not-draft" : "not-found" };
    }

    const { rows: [poll] } = await client.query(
      `INSERT INTO polls (join_code, question, organizer_id, session_id, session_position)
       SELECT $1, $2, $3, $4, COALESCE(MAX(session_position), 0) + 1 FROM polls WHERE session_id = $4
       ON CONFLICT (join_code) DO NOTHING
       RETURNING id, question, status, session_position AS position`,
      [joinCode, question, organizerId, sessionId],
    );
    if (!poll) {
      await client.query("ROLLBACK");
      return { outcome: "collision" };
    }

    const { rows: pollOptions } = await insertPollOptions(client, poll.id, options);
    await client.query("UPDATE poll_sessions SET updated_at = clock_timestamp() WHERE id = $1", [sessionId]);
    await client.query("COMMIT");
    return {
      outcome: "created",
      question: {
        ...poll,
        options: pollOptions.sort((a, b) => a.display_order - b.display_order).map(({ id, text }) => ({ id, text })),
      },
    };
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

module.exports = { insertSession, findOwnedSessions, findOwnedSession, findPublicSession, findSessionRoom, appendQuestion };
