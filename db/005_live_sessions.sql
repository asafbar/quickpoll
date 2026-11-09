BEGIN;

ALTER TABLE session_participants ADD COLUMN participant_token_hash BYTEA;
UPDATE session_participants SET participant_token_hash = sha256(convert_to(participant_token::text, 'UTF8'));
ALTER TABLE session_participants
    ALTER COLUMN participant_token_hash SET NOT NULL,
    ADD CONSTRAINT uq_session_participant_token_hash UNIQUE (participant_token_hash),
    ADD CONSTRAINT chk_session_participant_token_hash CHECK (octet_length(participant_token_hash) = 32),
    DROP COLUMN participant_token;

ALTER TABLE polls ADD CONSTRAINT uq_poll_id_session UNIQUE (id, session_id);

-- Session voters use the existing per-poll participant and vote constraints.
ALTER TABLE participants
    ALTER COLUMN participant_token DROP NOT NULL,
    ADD COLUMN session_id BIGINT,
    ADD COLUMN session_participant_id BIGINT,
    ADD CONSTRAINT chk_participant_session_identity CHECK (
        (session_id IS NULL AND session_participant_id IS NULL AND participant_token IS NOT NULL) OR
        (session_id IS NOT NULL AND session_participant_id IS NOT NULL AND participant_token IS NULL)
    ),
    ADD CONSTRAINT fk_participant_poll_session FOREIGN KEY (poll_id, session_id) REFERENCES polls(id, session_id),
    ADD CONSTRAINT fk_participant_session_identity FOREIGN KEY (session_id, session_participant_id)
        REFERENCES session_participants(session_id, id),
    ADD CONSTRAINT uq_poll_session_participant UNIQUE (poll_id, session_participant_id);

CREATE INDEX idx_participants_session_identity ON participants (session_id, session_participant_id)
    WHERE session_id IS NOT NULL;

COMMIT;
