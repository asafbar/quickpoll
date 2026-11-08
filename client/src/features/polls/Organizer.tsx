import { useEffect, useRef, useState } from "react";
import { Icon } from "../../components/Icon";
import { Notice, OptionList, PageIntro, StatusBadge } from "../../components/PollUi";
import { changePollStatus, getPollResults } from "../../services/api";
import type { PollResults, PollStatus, PublicPoll } from "../../services/api";
import { getOrganizerSession } from "./session";
import { usePublicPoll } from "./usePublicPoll";

function Results({ joinCode }: { joinCode: string }) {
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<{ version: number; results?: PollResults; error?: string }>({ version: -1 });
  const isLoading = state.version !== version;

  useEffect(() => {
    const controller = new AbortController();
    getPollResults(joinCode, controller.signal).then((results) => {
      if (!controller.signal.aborted) setState({ version, results });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) {
        setState({ version, error: error instanceof Error ? error.message : "Could not load results." });
      }
    });
    return () => controller.abort();
  }, [joinCode, version]);

  return (
    <section className="panel p-4 sm:p-6" aria-labelledby="results-heading">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="results-heading" className="text-lg font-extrabold">Results</h2>
          {state.results && <p className="text-sm text-muted">{state.results.totalVotes} {state.results.totalVotes === 1 ? "vote" : "votes"} total</p>}
        </div>
        <button type="button" className="btn btn-secondary" disabled={isLoading} onClick={() => setVersion((value) => value + 1)}>
          <Icon name="refresh" className="size-4" /> {isLoading ? "Refreshing…" : "Refresh results"}
        </button>
      </div>
      {isLoading && <p role="status" className="mb-3 text-sm text-muted">Loading results…</p>}
      {!isLoading && state.error && <Notice error>{state.error}</Notice>}
      {state.results && (
        <ol className="grid gap-4">
          {state.results.options.map((option) => (
            <li key={option.id}>
              <div className="mb-1.5 flex items-start justify-between gap-3 text-sm">
                <span className="min-w-0 font-bold wrap-anywhere">{option.text}</span>
                <span className="shrink-0 tabular-nums text-muted">{option.voteCount} · {option.percentage}%</span>
              </div>
              <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-line">
                <div className="h-full rounded-full bg-linear-to-r from-accent to-accent-bright" style={{ width: option.percentage + "%" }} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function CloseConfirmation({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  return (
    <dialog ref={dialog} aria-labelledby="confirm-title" aria-describedby="confirm-description"
      onCancel={onCancel} className="panel m-auto w-[calc(100%-2rem)] max-w-md p-6 text-ink backdrop:bg-black/70">
      <h2 id="confirm-title" className="text-xl font-extrabold">Close this poll?</h2>
      <p id="confirm-description" className="mt-2 text-sm leading-relaxed text-muted">
        Closing ends voting immediately. You can still view the final results, but the poll can’t be reopened.
      </p>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn btn-danger" onClick={onConfirm}>Close poll</button>
      </div>
    </dialog>
  );
}

function Dashboard({ poll, joinCode, organizerToken }: { poll: PublicPoll; joinCode: string; organizerToken: string }) {
  const [status, setStatus] = useState<PollStatus>(poll.status);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "manual">("idle");
  const joinUrl = new URL("/join", window.location.origin);
  joinUrl.searchParams.set("code", joinCode);

  async function transition(action: "activate" | "close") {
    setConfirmClose(false);
    setPending(true);
    setError("");
    try {
      const updated = await changePollStatus(poll.id, action, organizerToken);
      setStatus(updated.status);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not update the poll.");
    } finally {
      setPending(false);
    }
  }

  async function copyJoinLink() {
    try {
      await navigator.clipboard.writeText(joinUrl.href);
      setCopyState("copied");
    } catch {
      setCopyState("manual");
    }
  }

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
      <div className="grid min-w-0 gap-5">
        <section className="panel p-4 sm:p-6" aria-labelledby="poll-question">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="eyebrow">Your poll</p>
            <span aria-live="polite"><StatusBadge status={status} /></span>
          </div>
          <h2 id="poll-question" className="mb-4 text-xl font-extrabold wrap-anywhere sm:text-2xl">{poll.question}</h2>
          <OptionList options={poll.options} />
          {error && <div className="mt-4"><Notice error>{error}</Notice></div>}
          {status !== "closed" && (
            <div className="mt-5 border-t border-line pt-4">
              {status === "draft" ? (
                <button type="button" className="btn btn-primary" disabled={pending} onClick={() => void transition("activate")}>
                  {pending ? "Activating…" : "Activate poll"} <Icon name="arrow" className="size-4" />
                </button>
              ) : (
                <button type="button" className="btn btn-secondary text-danger" disabled={pending} onClick={() => setConfirmClose(true)}>
                  {pending ? "Closing…" : "Close poll"}
                </button>
              )}
            </div>
          )}
        </section>
        {status === "draft" ? (
          <Notice>Results appear here after you activate your poll.</Notice>
        ) : (
          <Results key={status} joinCode={joinCode} />
        )}
      </div>
      <div className="grid min-w-0 gap-4">
        <section className="panel relative isolate overflow-hidden p-5 sm:p-6" aria-labelledby="share-poll">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_100%_0%,#39295f_0%,transparent_75%)]" />
          <h2 id="share-poll" className="font-extrabold">Invite participants</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">Share the join link or give your audience this code.</p>
          <p className="my-4 rounded-xl border border-line bg-inset px-3 py-3 text-center font-mono text-lg font-bold tracking-widest text-accent-bright wrap-anywhere">{joinCode}</p>
          <button type="button" className="btn btn-secondary w-full" onClick={() => void copyJoinLink()}>
            <Icon name={copyState === "copied" ? "check" : "link"} className="size-4" />
            {copyState === "copied" ? "Link copied" : "Copy join link"}
          </button>
          {copyState === "copied" && <span role="status" className="sr-only">Public join link copied.</span>}
          {copyState === "manual" && (
            <label className="mt-3 block text-sm text-muted">Select and copy this link
              <input className="field mt-1" value={joinUrl.href} readOnly onFocus={(event) => event.target.select()} />
            </label>
          )}
        </section>
        <aside className="panel p-4 text-sm leading-relaxed text-muted">
          <Icon name="lock" className="mb-2 size-4 text-accent-bright" />
          <h2 className="font-extrabold text-ink">Organizer access is tab-specific</h2>
          <p className="mt-1">You can refresh this tab. Closing it or clearing browser storage can lose organizer access to this poll.</p>
        </aside>
      </div>
      {confirmClose && <CloseConfirmation onCancel={() => setConfirmClose(false)} onConfirm={() => void transition("close")} />}
    </div>
  );
}

export function Organizer({ pollId }: { pollId: string }) {
  const [session] = useState(() => getOrganizerSession(pollId));
  const { poll, error } = usePublicPoll(session?.joinCode ?? "");

  return (
    <section className="shell py-9 sm:py-14">
      <PageIntro label="Organizer dashboard" title="Manage your poll">
        Share access, control voting, and check the results.
      </PageIntro>
      {!session ? (
        <div className="panel max-w-xl p-5 sm:p-7">
          <h2 className="text-lg font-extrabold">Organizer access is unavailable</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">This tab has no organizer credentials for this poll. Return to the original tab if it’s still open.</p>
          <a href="/create" className="btn btn-primary mt-4">Create another poll</a>
        </div>
      ) : error || (poll && poll.id !== pollId) ? (
        <div className="grid max-w-xl justify-items-start gap-3">
          <Notice error>{error ?? "The saved organizer access does not match this poll."}</Notice>
          <button type="button" className="btn btn-secondary" onClick={() => window.location.reload()}>Retry</button>
        </div>
      ) : poll ? (
        <Dashboard poll={poll} joinCode={session.joinCode} organizerToken={session.organizerToken} />
      ) : (
        <Notice>Loading your poll…</Notice>
      )}
    </section>
  );
}
