const pool = require("../config/db");
const { resultOptions } = require("./polls");

async function transaction(operation) {
  const client = await pool.connect();
  let rollbackError;
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query(result.outcome === "ok" ? "COMMIT" : "ROLLBACK");
    return result;
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

function transition({ organizerId, sessionId, questionId, action }) {
  return transaction(async (client) => {
    const { rows: [session] } = await client.query(
      'SELECT id, status FROM poll_sessions WHERE id = $1 AND organizer_id = $2 FOR UPDATE',
      [sessionId, organizerId],
    );
    if (!session) return { outcome: "not-found" };

    // The first unfinished question is the only possible transition target.
    const { rows: [next] } = await client.query(
      "SELECT id, status FROM polls WHERE session_id = $1 AND status <> 'closed' ORDER BY session_position LIMIT 1",
      [sessionId],
    );
    let status = session.status;
    let questionStatus = null;
    if (action === "start") {
      if (status !== "draft" || next?.status !== "draft") return { outcome: "cannot-start" };
      status = "active";
    } else {
      if (status !== "active" || next?.id !== questionId) return { outcome: "wrong-question" };
      const previous = action === "open" ? "draft" : "active";
      if (next.status !== previous) return { outcome: "wrong-question" };
      questionStatus = action === "open" ? "active" : "closed";
      await client.query("UPDATE polls SET status = $1 WHERE id = $2", [questionStatus, questionId]);
      if (questionStatus === "closed") {
        const remaining = await client.query("SELECT 1 FROM polls WHERE session_id = $1 AND status <> 'closed' LIMIT 1", [sessionId]);
        if (remaining.rowCount === 0) status = "closed";
      }
    }

    await client.query("UPDATE poll_sessions SET status = $1, updated_at = clock_timestamp() WHERE id = $2", [status, sessionId]);
    return {
      outcome: "ok",
      change: { sessionId, status, questionId: questionId ?? null, questionStatus },
    };
  });
}

async function joinSession(joinCode, displayName, tokenHash) {
  const { rows: [result] } = await pool.query(
    `WITH matched AS (
       SELECT id, status FROM poll_sessions WHERE join_code = $1 FOR SHARE
     ), joined AS (
       INSERT INTO session_participants (session_id, display_name, participant_token_hash)
       SELECT id, $2, $3 FROM matched WHERE status = 'active'
       RETURNING id
     )
     SELECT matched.status, joined.id AS "participantId" FROM matched LEFT JOIN joined ON true`,
    [joinCode, displayName, tokenHash],
  );
  return result ?? null;
}

async function findQuestion(joinCode, questionId, tokenHash) {
  const { rows: [question] } = await pool.query(
    `SELECT p.id, p.question, p.status, p.session_position AS position, s.status AS "sessionStatus",
            participant.id IS NOT NULL AS authorized,
            EXISTS (
              SELECT 1 FROM participants voter JOIN votes v ON v.participant_id = voter.id
              WHERE voter.poll_id = p.id AND voter.session_participant_id = participant.id
            ) AS "hasVoted",
            CASE WHEN participant.id IS NOT NULL AND p.status = 'active' AND s.status = 'active'
              THEN COALESCE((
                SELECT json_agg(json_build_object('id', o.id::text, 'text', o.option_text) ORDER BY o.display_order)
                FROM poll_options o WHERE o.poll_id = p.id
              ), '[]'::json)
            END AS options
     FROM poll_sessions s JOIN polls p ON p.session_id = s.id AND p.id = $2
     LEFT JOIN session_participants participant ON participant.session_id = s.id AND participant.participant_token_hash = $3
     WHERE s.join_code = $1`,
    [joinCode, questionId, tokenHash],
  );
  return question ?? null;
}

function recordVote({ joinCode, questionId, optionId, tokenHash }) {
  return transaction(async (client) => {
    // Shared session locks let votes run concurrently but exclude lifecycle changes.
    const { rows: [session] } = await client.query(
      "SELECT id, status FROM poll_sessions WHERE join_code = $1 FOR SHARE",
      [joinCode],
    );
    if (!session) return { outcome: "not-found" };
    const { rows: [ballot] } = await client.query(
      `SELECT p.status, participant.id AS "participantId", o.id AS "optionId"
       FROM polls p
       LEFT JOIN session_participants participant ON participant.session_id = p.session_id AND participant.participant_token_hash = $3
       LEFT JOIN poll_options o ON o.poll_id = p.id AND o.id = $4
       WHERE p.session_id = $1 AND p.id = $2`,
      [session.id, questionId, tokenHash, optionId],
    );
    if (!ballot) return { outcome: "not-found" };
    if (!ballot.participantId) return { outcome: "forbidden" };
    if (session.status !== "active" || ballot.status !== "active") return { outcome: "not-active" };
    if (!ballot.optionId) return { outcome: "invalid-option" };

    // A concurrent insert for this identity waits for the first transaction.
    await client.query(
      `INSERT INTO participants (poll_id, display_name, session_id, session_participant_id)
       SELECT $1, display_name, session_id, id FROM session_participants WHERE id = $2
       ON CONFLICT (poll_id, session_participant_id) DO NOTHING`,
      [questionId, ballot.participantId],
    );
    const { rows: [vote] } = await client.query(
      `INSERT INTO votes (poll_id, participant_id, option_id)
       SELECT poll_id, id, $3 FROM participants WHERE poll_id = $1 AND session_participant_id = $2
       ON CONFLICT (participant_id) DO NOTHING
       RETURNING id AS "voteId", option_id AS "optionId"`,
      [questionId, ballot.participantId, optionId],
    );
    return vote ? { outcome: "ok", sessionId: session.id, vote } : { outcome: "duplicate" };
  });
}

async function findResults(joinCode, questionId = null) {
  const { rows } = await pool.query(
    `SELECT s.title, s.status AS "sessionStatus", p.id, p.question, p.status, p.session_position AS position,
            ${resultOptions}
     FROM poll_sessions s
     LEFT JOIN polls p ON p.session_id = s.id AND
       (($2::bigint IS NULL AND p.status = 'closed') OR p.id = $2)
     WHERE s.join_code = $1 ORDER BY p.session_position`,
    [joinCode, questionId],
  );
  return rows;
}

module.exports = { transition, joinSession, findQuestion, recordVote, findResults };
