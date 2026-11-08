-- A NULL hash leaves historical polls without organizer access.
ALTER TABLE polls
    ADD COLUMN IF NOT EXISTS organizer_token_hash BYTEA
    CHECK (octet_length(organizer_token_hash) = 32);
