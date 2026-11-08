CREATE TABLE polls (
    id BIGSERIAL PRIMARY KEY,
    join_code VARCHAR(10) NOT NULL UNIQUE,
    question TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_poll_status
        CHECK (status IN ('draft', 'active', 'closed'))
);

CREATE TABLE poll_options (
    id BIGSERIAL PRIMARY KEY,
    poll_id BIGINT NOT NULL
        REFERENCES polls(id) ON DELETE CASCADE,
    option_text TEXT NOT NULL,
    display_order INTEGER NOT NULL,
    UNIQUE (poll_id, display_order),
    UNIQUE (poll_id, id)
);

CREATE TABLE participants (
    id BIGSERIAL PRIMARY KEY,
    poll_id BIGINT NOT NULL
        REFERENCES polls(id) ON DELETE CASCADE,
    display_name VARCHAR(100) NOT NULL,
    participant_token UUID NOT NULL UNIQUE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (poll_id, id)
);

CREATE TABLE votes (
    id BIGSERIAL PRIMARY KEY,
    poll_id BIGINT NOT NULL
        REFERENCES polls(id) ON DELETE CASCADE,
    participant_id BIGINT NOT NULL,
    option_id BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (participant_id),
    FOREIGN KEY (poll_id, participant_id)
        REFERENCES participants(poll_id, id),
    FOREIGN KEY (poll_id, option_id)
        REFERENCES poll_options(poll_id, id)
);

CREATE INDEX idx_poll_options_poll_id
    ON poll_options(poll_id);

CREATE INDEX idx_participants_poll_id
    ON participants(poll_id);

CREATE INDEX idx_votes_poll_id
    ON votes(poll_id);

CREATE INDEX idx_votes_option_id
    ON votes(option_id);