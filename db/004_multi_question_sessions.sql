BEGIN;

CREATE TABLE poll_sessions (
    id BIGSERIAL PRIMARY KEY,
    organizer_id BIGINT NOT NULL REFERENCES organizers(id),
    title VARCHAR(150) NOT NULL CHECK (length(btrim(title)) > 0),
    join_code VARCHAR(10) NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'closed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (id, organizer_id)
);

CREATE INDEX idx_poll_sessions_organizer_id_id ON poll_sessions (organizer_id, id DESC);

ALTER TABLE polls
    ADD COLUMN session_id BIGINT,
    ADD COLUMN session_position INTEGER,
    ADD CONSTRAINT chk_poll_session_membership CHECK (
        (session_id IS NULL AND session_position IS NULL) OR
        (session_id IS NOT NULL AND session_position IS NOT NULL AND session_position > 0 AND organizer_id IS NOT NULL)
    ),
    ADD CONSTRAINT fk_poll_session_owner FOREIGN KEY (session_id, organizer_id)
        REFERENCES poll_sessions (id, organizer_id),
    ADD CONSTRAINT uq_poll_session_position UNIQUE (session_id, session_position);

-- The active poll row is the source of truth for the current question.
CREATE UNIQUE INDEX uq_poll_session_active_question ON polls (session_id)
    WHERE session_id IS NOT NULL AND status = 'active';

CREATE TABLE session_participants (
    id BIGSERIAL PRIMARY KEY,
    session_id BIGINT NOT NULL REFERENCES poll_sessions(id) ON DELETE CASCADE,
    display_name VARCHAR(100) NOT NULL CHECK (length(btrim(display_name)) > 0),
    participant_token UUID NOT NULL UNIQUE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (session_id, id)
);

COMMIT;
