# QuickPoll database migrations

For a fresh database, apply `001_init.sql` before `002_organizer_auth.sql`. For an existing QuickPoll database, apply only the new migration. Run this command from the repository root with the Compose `db` service running.

```sh
docker compose exec -T db psql -X -v ON_ERROR_STOP=1 -U quickpoll -d quickpoll -f - < db/002_organizer_auth.sql
```

Apply this migration before using the updated Create Poll API. It is safe to rerun. Existing poll data and statuses are preserved. Historical polls have a null organizer hash, so lifecycle requests for those polls are forbidden while their existing lookup and joining rules still apply.

New polls return an `organizerToken` in the Create Poll response. Keep it private and send it in the `Authorization: Bearer <organizerToken>` header when activating or closing the poll. The database stores its SHA-256 digest, and the API issues the raw token only at creation.
