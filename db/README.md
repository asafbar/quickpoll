# QuickPoll database migrations

For a fresh database, apply migrations 001 through 005 in order. On an existing database, apply only migrations that have not been applied. Run the commands from the repository root with the Compose `db` service running.

```sh
docker compose exec -T db psql -X -v ON_ERROR_STOP=1 -U quickpoll -d quickpoll -f - < db/002_organizer_auth.sql
```

Apply this migration before using the updated Create Poll API. It is safe to rerun. Existing poll data and statuses are preserved. Historical polls have a null organizer hash, so lifecycle requests for those polls are forbidden while their existing lookup and joining rules still apply.

New polls return an `organizerToken` in the Create Poll response. Keep it private and send it in the `Authorization: Bearer <organizerToken>` header when activating or closing the poll. The database stores its SHA-256 digest, and the API issues the raw token only at creation.

## Organizer accounts

If migrations 001 and 002 are already applied, run this command before starting the updated API.

```sh
docker compose exec -T db psql -X -v ON_ERROR_STOP=1 -U quickpoll -d quickpoll -f - < db/003_organizer_accounts.sql
```

Apply migration 003 once. It creates the organizer and session tables and adds nullable poll ownership in a single transaction. Existing polls remain unowned, with their organizer token hashes, questions, statuses, and associated data intact.

## Multi-question poll sessions

With migrations 001 through 003 already applied, run the following once before starting the updated API.

```sh
docker compose exec -T db psql -X -v ON_ERROR_STOP=1 -U quickpoll -d quickpoll -f - < db/004_multi_question_sessions.sql
```

Migration 004 adds poll sessions, nullable question membership, and a session participant table in one transaction. Existing polls remain standalone. Their questions, organizer credentials, options, participants, and votes are preserved.

## Live session voting

With migrations 001 through 004 already applied, run this once from the repository root before serving live session requests.

```sh
docker compose exec -T db psql -X -v ON_ERROR_STOP=1 -U quickpoll -d quickpoll -f - < db/005_live_sessions.sql
```

Migration 005 converts any existing session participant UUIDs to SHA-256 hashes and adds an optional session identity to per-poll participant records. It preserves existing sessions and their questions, standalone participants, and votes. New session votes use the existing votes table.
