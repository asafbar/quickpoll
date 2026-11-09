import { useEffect, useRef, useState } from "react";
import { Icon } from "../../components/Icon";
import { ConnectionStatus, Notice, OptionList, PageIntro, StatusBadge } from "../../components/PollUi";
import { ApiError, changePollStatus } from "../../services/api";
import type { PollStatus, PublicPoll } from "../../services/api";
import { AccountGate } from "../auth/AccountGate";
import type { AccountState } from "../auth/useOrganizerAccount";
import { CopyJoinLink } from "./CopyJoinLink";
import { getPublicJoinLink, presentationPath } from "./publicLinks";
import { Results } from "./Results";
import { getOrganizerSession } from "./session";
import { usePublicPoll } from "./usePublicPoll";
import { usePollLive } from "./usePollLive";
import { useOwnedPolls } from "./useOwnedPolls";

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

function Dashboard({ poll, joinCode, organizerToken, refreshPoll, applyStatus, onSignedOut }: {
  poll: PublicPoll;
  joinCode: string;
  organizerToken?: string;
  refreshPoll: () => void;
  applyStatus: (status: PollStatus) => void;
  onSignedOut: () => void;
}) {
  const { status } = poll;
  const { connection, resultsVersion } = usePollLive(joinCode, poll.id, refreshPoll, true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);
  const joinLink = getPublicJoinLink(joinCode);

  async function transition(action: "activate" | "close") {
    setConfirmClose(false);
    setPending(true);
    setError("");
    try {
      const updated = await changePollStatus(poll.id, action, organizerToken);
      applyStatus(updated.status);
    } catch (error) {
      if (!organizerToken && error instanceof ApiError && error.status === 401) {
        onSignedOut();
        return;
      }
      setError(error instanceof Error ? error.message : "Could not update the poll.");
      refreshPoll();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
      <div className="grid min-w-0 gap-5">
        <section className="panel p-4 sm:p-6" aria-labelledby="poll-question">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="eyebrow">Your poll</p>
            <div className="flex flex-wrap items-center gap-3">
              <ConnectionStatus status={connection} />
              <span aria-live="polite"><StatusBadge status={status} /></span>
            </div>
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
          <Results joinCode={joinCode} status={status} refreshPoll={refreshPoll} liveVersion={resultsVersion} />
        )}
      </div>
      <div className="grid min-w-0 gap-4">
        <section className="panel relative isolate overflow-hidden p-5 sm:p-6" aria-labelledby="share-poll">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_100%_0%,#39295f_0%,transparent_75%)]" />
          <h2 id="share-poll" className="font-extrabold">Invite participants</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">Share the join link or give your audience this code.</p>
          <p className="my-4 rounded-xl border border-line bg-inset px-3 py-3 text-center font-mono text-lg font-bold tracking-widest text-accent-bright wrap-anywhere">{joinCode}</p>
          <CopyJoinLink href={joinLink.href} />
          <a href={presentationPath(joinCode)} target="_blank" rel="noopener noreferrer" className="btn btn-primary mt-2.5 w-full">
            <Icon name="present" className="size-4" /> Open Presentation
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
          {joinLink.localOnly && <p className="mt-3 text-xs text-warning">This link works on this device only.</p>}
        </section>
        <aside className="panel p-4 text-sm leading-relaxed text-muted">
          <Icon name="lock" className="mb-2 size-4 text-accent-bright" />
          {organizerToken ? (
            <>
              <h2 className="font-extrabold text-ink">Organizer access is tab-specific</h2>
              <p className="mt-1">You can refresh this tab. Closing it or clearing browser storage can lose organizer access to this poll.</p>
            </>
          ) : (
            <>
              <h2 className="font-extrabold text-ink">Saved to your account</h2>
              <p className="mt-1">Sign in on any device and open <a className="font-bold text-accent-bright underline" href="/my-polls">My Polls</a> to manage this poll.</p>
            </>
          )}
        </aside>
      </div>
      {confirmClose && status === "active" && <CloseConfirmation onCancel={() => setConfirmClose(false)} onConfirm={() => void transition("close")} />}
    </div>
  );
}

function OrganizerPoll({ pollId, joinCode, organizerToken, onSignedOut }: {
  pollId: string;
  joinCode: string;
  organizerToken?: string;
  onSignedOut: () => void;
}) {
  const { poll, error, refresh, applyStatus } = usePublicPoll(joinCode);
  if ((!poll && error) || (poll && poll.id !== pollId)) {
    return (
      <div className="grid max-w-xl justify-items-start gap-3">
        <Notice error>{error ?? "The saved organizer access does not match this poll."}</Notice>
        <button type="button" className="btn btn-secondary" onClick={refresh}>Retry</button>
      </div>
    );
  }
  if (!poll) return <Notice>Loading your poll…</Notice>;

  return (
    <>
      {error && <div className="mb-4"><Notice error>{error}</Notice></div>}
      <Dashboard poll={poll} joinCode={joinCode} organizerToken={organizerToken}
        refreshPoll={refresh} applyStatus={applyStatus} onSignedOut={onSignedOut} />
    </>
  );
}

function OwnedOrganizer({ pollId, onSignedOut }: { pollId: string; onSignedOut: () => void }) {
  const { polls, error, retry } = useOwnedPolls(onSignedOut);
  if (error) {
    return (
      <div className="grid max-w-xl justify-items-start gap-3">
        <Notice error>{error}</Notice>
        <button type="button" className="btn btn-secondary" onClick={retry}>Retry</button>
      </div>
    );
  }
  if (!polls) return <Notice>Checking poll ownership…</Notice>;
  const owned = polls.find((poll) => poll.id === pollId);
  if (!owned) {
    return (
      <div className="grid max-w-xl justify-items-start gap-3">
        <Notice error>This poll is not saved to your account and this tab has no organizer access to it.</Notice>
        <a href="/my-polls" className="btn btn-secondary">Back to My Polls</a>
      </div>
    );
  }
  return <OrganizerPoll pollId={pollId} joinCode={owned.joinCode} onSignedOut={onSignedOut} />;
}

export function Organizer({ pollId, account, retryAccount, onSignedOut }: {
  pollId: string;
  account: AccountState;
  retryAccount: () => void;
  onSignedOut: () => void;
}) {
  const [legacy] = useState(() => getOrganizerSession(pollId));

  return (
    <section className="shell py-9 sm:py-14">
      <PageIntro label="Organizer dashboard" title="Manage your poll">
        Share access, control voting, and check the results.
      </PageIntro>
      {legacy ? (
        <OrganizerPoll pollId={pollId} joinCode={legacy.joinCode} organizerToken={legacy.organizerToken} onSignedOut={onSignedOut} />
      ) : (
        <AccountGate account={account} retry={retryAccount}>
          <OwnedOrganizer pollId={pollId} onSignedOut={onSignedOut} />
        </AccountGate>
      )}
    </section>
  );
}
