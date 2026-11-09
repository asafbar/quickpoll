BEGIN;

CREATE TABLE organizers (
    id BIGSERIAL PRIMARY KEY,
    email VARCHAR(254) NOT NULL UNIQUE CHECK (email = lower(email)),
    password_salt BYTEA NOT NULL CHECK (octet_length(password_salt) = 16),
    password_hash BYTEA NOT NULL CHECK (octet_length(password_hash) = 64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE organizer_sessions (
    token_hash BYTEA PRIMARY KEY CHECK (octet_length(token_hash) = 32),
    organizer_id BIGINT NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL CHECK (expires_at > created_at)
);

CREATE INDEX idx_organizer_sessions_organizer_id ON organizer_sessions (organizer_id);
CREATE INDEX idx_organizer_sessions_expires_at ON organizer_sessions (expires_at);

ALTER TABLE polls ADD COLUMN organizer_id BIGINT REFERENCES organizers(id) ON DELETE SET NULL;
CREATE INDEX idx_polls_organizer_id_id ON polls (organizer_id, id DESC) WHERE organizer_id IS NOT NULL;

COMMIT;
