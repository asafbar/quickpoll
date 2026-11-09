const pool = require("../config/db");

async function insertOrganizer({ email, salt, hash }) {
  const { rows: [organizer] } = await pool.query(
    `INSERT INTO organizers (email, password_salt, password_hash) VALUES ($1, $2, $3)
     ON CONFLICT (email) DO NOTHING
     RETURNING id, email`,
    [email, salt, hash],
  );
  return organizer ?? null;
}

async function findCredentials(email) {
  const { rows: [organizer] } = await pool.query(
    'SELECT id, email, password_salt AS salt, password_hash AS hash FROM organizers WHERE email = $1',
    [email],
  );
  return organizer ?? null;
}

async function issueSession({ tokenHash, organizerId, ageSeconds, previousHash }) {
  // Rotation and issuance commit together. A failed insert preserves the previous session.
  await pool.query(
    `WITH revoked AS (DELETE FROM organizer_sessions WHERE token_hash = $4)
     INSERT INTO organizer_sessions (token_hash, organizer_id, expires_at)
     VALUES ($1, $2, NOW() + $3::integer * INTERVAL '1 second')`,
    [tokenHash, organizerId, ageSeconds, previousHash],
  );
}

async function findSession(tokenHash) {
  const { rows: [organizer] } = await pool.query(
    `SELECT o.id, o.email
     FROM organizer_sessions s JOIN organizers o ON o.id = s.organizer_id
     WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
    [tokenHash],
  );
  return organizer ?? null;
}

async function revokeSession(tokenHash) {
  await pool.query("DELETE FROM organizer_sessions WHERE token_hash = $1", [tokenHash]);
}

module.exports = { insertOrganizer, findCredentials, issueSession, findSession, revokeSession };
