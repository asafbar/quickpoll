import { Notice, PageIntro, StatusBadge } from "../../components/PollUi";
import { getOwnedSessions } from "../../services/api";
import { useSessionResource } from "./useSessionResource";

const dateFormatter = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

export function MySessions({ onSignedOut }: { onSignedOut: () => void }) {
  const { data, error, loading, reload } = useSessionResource(getOwnedSessions, onSignedOut);

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-x-5">
        <PageIntro label="Organizer account" title="My Sessions">
          Prepare a set of questions for a presentation or event.
        </PageIntro>
        <a href="/sessions/new" className="btn btn-primary mb-4">Create session</a>
      </div>
      {error ? (
        <div className="grid justify-items-start gap-3">
          <Notice error>{error}</Notice>
          <button type="button" className="btn btn-secondary" onClick={reload}>Retry</button>
        </div>
      ) : loading || !data ? <Notice>Loading your sessions…</Notice>
        : data.sessions.length === 0 ? (
          <div className="panel p-5 sm:p-7">
            <h2 className="text-xl font-extrabold">No sessions yet</h2>
            <p className="mt-2 text-muted">Create a session to keep your event’s questions together in order.</p>
          </div>
        ) : (
          <ul className="grid gap-3">
            {data.sessions.map((session) => (
              <li key={session.id} className="panel flex flex-wrap items-center justify-between gap-4 p-5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-extrabold wrap-anywhere">{session.title}</h2>
                    <StatusBadge status={session.status} />
                  </div>
                  <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
                    <span>Code <span className="font-mono font-bold text-accent-bright">{session.joinCode}</span></span>
                    <span>Created <time dateTime={session.createdAt}>{dateFormatter.format(new Date(session.createdAt))}</time></span>
                    {typeof session.questionCount === "number" && <span>{session.questionCount} {session.questionCount === 1 ? "question" : "questions"}</span>}
                  </p>
                </div>
                <a href={"/sessions/" + encodeURIComponent(session.id)} className="btn btn-secondary"
                  aria-label={"Open session: " + session.title}>Open session</a>
              </li>
            ))}
          </ul>
        )}
    </>
  );
}
