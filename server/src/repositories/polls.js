const pool = require("../config/db");

async function insertDraft({ joinCode, question, options }) {
  const client = await pool.connect();
  let rollbackError;

  try {
    await client.query("BEGIN");

    const { rows: [poll] } = await client.query(
      `INSERT INTO polls (join_code, question, status)
       VALUES ($1, $2, 'draft')
       ON CONFLICT (join_code) DO NOTHING
       RETURNING id, join_code AS "joinCode", question, status`,
      [joinCode, question],
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

module.exports = { insertDraft };
