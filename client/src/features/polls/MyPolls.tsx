import { Notice, PageIntro, StatusBadge } from "../../components/PollUi";
import { useOwnedPolls } from "./useOwnedPolls";

const dateFormatter = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

export function MyPolls({ onSignedOut }: { onSignedOut: () => void }) {
  const { polls, error, retry } = useOwnedPolls(onSignedOut);

  return (
    <section className="shell py-9 sm:py-14">
      <PageIntro label="Organizer account" title="My Polls">Find and manage the polls saved to your account.</PageIntro>
      {error ? (
        <div className="grid justify-items-start gap-3">
          <Notice error>{error}</Notice>
          <button type="button" className="btn btn-secondary" onClick={retry}>Retry</button>
        </div>
      ) : !polls ? <Notice>Loading your polls…</Notice>
        : polls.length === 0 ? (
          <div className="panel p-5 sm:p-7">
            <h2 className="text-xl font-extrabold">No saved polls yet</h2>
            <p className="mt-2 text-muted">Polls you create while signed in will appear here.</p>
            <a href="/create" className="btn btn-primary mt-4">Create a poll</a>
          </div>
        ) : (
          <>
            <a className="btn btn-primary mb-4" href="/create">Create a poll</a>
            <ul className="grid gap-3">
              {polls.map((poll) => (
                <li key={poll.id} className="panel flex flex-wrap items-center justify-between gap-4 p-5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-extrabold wrap-anywhere">{poll.question}</h2>
                      <StatusBadge status={poll.status} />
                    </div>
                    <p className="mt-2 text-sm text-muted">
                      Code <span className="font-mono font-bold text-accent-bright">{poll.joinCode}</span>
                      <span aria-hidden="true"> · </span>Created <time dateTime={poll.createdAt}>{dateFormatter.format(new Date(poll.createdAt))}</time>
                    </p>
                  </div>
                  <a className="btn btn-secondary" href={"/organizer/" + encodeURIComponent(poll.id)}
                    aria-label={"Manage poll: " + poll.question}>Manage poll</a>
                </li>
              ))}
            </ul>
          </>
        )}
    </section>
  );
}
