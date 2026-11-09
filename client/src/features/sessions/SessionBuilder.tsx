import { useCallback, useRef, useState } from "react";
import { ConnectionStatus, Notice, OptionList, PageIntro, StatusBadge } from "../../components/PollUi";
import { ApiError, changeSessionStatus, getSessionDetails } from "../../services/api";
import { CopyJoinLink } from "../polls/CopyJoinLink";
import { getPublicJoinLink } from "../polls/publicLinks";
import { useSessionLive } from "../polls/usePollLive";
import { sessionPublicPath } from "./publicPaths";
import { SessionQuestionForm } from "./SessionQuestionForm";
import { SessionQuestionResults } from "./SessionResults";
import { useSessionResource } from "./useSessionResource";

export function SessionBuilder({ id, onSignedOut }: { id: string; onSignedOut: () => void }) {
  const load = useCallback((signal: AbortSignal) => getSessionDetails(id, signal), [id]);
  const { data, error, loading, reload } = useSessionResource(load, onSignedOut);
  const [savedPosition, setSavedPosition] = useState<number>();
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState("");
  const submitting = useRef(false);
  const session = data?.session;
  const { connection, resultsVersion } = useSessionLive(session?.joinCode ?? "", reload);
  const active = session?.questions.find((question) => question.id === session.activeQuestionId);
  const lastClosed = session?.questions.findLast((question) => question.status === "closed");
  const next = session?.questions.find((question) => question.status === "draft");
  const current = active ?? lastClosed;
  const disabled = loading || pending || !!error;

  async function transition(action: "start" | "open" | "close", questionId?: string) {
    if (disabled || submitting.current) return;
    submitting.current = true;
    setPending(true);
    setActionError("");
    try {
      await changeSessionStatus(id, action, questionId);
      reload();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) onSignedOut();
      else {
        setActionError(error instanceof Error ? error.message : "Could not update the session.");
        reload();
      }
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <>
      <a className="mb-4 inline-block rounded-sm font-bold text-accent-bright hover:underline" href="/my-sessions">
        Back to My Sessions
      </a>
      <PageIntro label="Session builder" title={session?.title ?? "Session builder"}>
        Prepare questions, run the session and review results between questions.
      </PageIntro>
      {error && (
        <div className="mb-4 grid justify-items-start gap-3">
          <Notice error>{error}</Notice>
          <button type="button" className="btn btn-secondary" onClick={reload}>Retry loading session</button>
        </div>
      )}
      {!session && loading && <Notice>Loading your session…</Notice>}
      {session && (
        <>
          <div className="panel mb-5 flex flex-wrap items-center gap-x-5 gap-y-3 p-4 text-sm sm:p-5">
            <span aria-live="polite"><StatusBadge status={session.status} /></span>
            <ConnectionStatus status={connection} />
            <p className="text-muted">Join code <span className="font-mono font-bold text-accent-bright">{session.joinCode}</span></p>
            <p className="text-muted">{session.questions.length} {session.questions.length === 1 ? "question" : "questions"}</p>
          </div>
          <section className="panel mb-5 grid gap-4 p-5 sm:p-7" aria-labelledby="session-controls">
            <div>
              <h2 id="session-controls" className="text-xl font-extrabold">Live session controls</h2>
              <p className="mt-1 text-sm text-muted">
                {session.status === "closed" ? "Session complete."
                  : session.status === "draft" ? "Starting allows participants to join. Questions open when you choose."
                    : active ? "Voting is open."
                      : lastClosed ? "Results review. Open the next question when you’re ready."
                        : "Participants can join now. Open the first question when you’re ready."}
              </p>
              {current && <p className="mt-3 font-bold wrap-anywhere">Question {current.position} of {session.questions.length} · {current.question}</p>}
              {session.status === "active" && !active && next && <p className="mt-2 text-sm text-muted wrap-anywhere">Up next · {next.question}</p>}
            </div>
            {actionError && <Notice error>{actionError}</Notice>}
            <div className="flex flex-wrap gap-2">
              {session.status === "draft" && <button type="button" className="btn btn-primary"
                disabled={disabled || !next} onClick={() => void transition("start")}>{pending ? "Working…" : "Start session"}</button>}
              {session.status === "active" && (active ? <button type="button" className="btn btn-danger"
                disabled={disabled} onClick={() => void transition("close", active.id)}>{pending ? "Working…" : "Close current question"}</button>
                : next && <button type="button" className="btn btn-primary" disabled={disabled}
                  onClick={() => void transition("open", next.id)}>{pending ? "Working…" : "Open question " + next.position}</button>)}
              {session.status === "closed" && (
                <a className="btn btn-primary" href={sessionPublicPath("summary", session.joinCode)} target="_blank" rel="noopener noreferrer">
                  Open summary (new tab)
                </a>
              )}
              <a className="btn btn-secondary" href={sessionPublicPath("present", session.joinCode)} target="_blank" rel="noopener noreferrer">
                Open presentation (new tab)
              </a>
              <button type="button" className="btn btn-secondary" disabled={loading || pending} onClick={reload}>Refresh session</button>
            </div>
            <div className="max-w-sm">
              <CopyJoinLink href={getPublicJoinLink(session.joinCode, "/sessions/join").href} />
            </div>
          </section>
          <div className="grid items-start gap-5 lg:grid-cols-2">
            <section className="panel p-5 sm:p-7" aria-labelledby="session-questions">
              <h2 id="session-questions" className="mb-4 text-xl font-extrabold">Question order</h2>
              {loading && <p role="status" className="mb-3 text-sm text-muted">Refreshing questions…</p>}
              {session.questions.length === 0 ? <Notice>No questions yet. Add your first question to get started.</Notice> : (
                <ol className="grid gap-4">
                  {session.questions.map((question) => (
                    <li key={question.id} className="rounded-xl border border-line bg-inset p-4">
                      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                        <p className="eyebrow">Question {question.position}</p>
                        <StatusBadge status={question.status} />
                      </div>
                      <h3 className="mb-3 font-extrabold wrap-anywhere">{question.question}</h3>
                      <OptionList options={question.options} />
                    </li>
                  ))}
                </ol>
              )}
            </section>
            <div className={"grid min-w-0 gap-4 " + (session.status === "draft" ? "" : "order-first lg:order-none")}>
              {session.status === "draft" && savedPosition !== undefined && <Notice>Question {savedPosition} saved.</Notice>}
              {session.status === "draft" ? (
                <SessionQuestionForm id={id} disabled={disabled} onSignedOut={onSignedOut} reload={reload}
                  onSaved={(position) => { setSavedPosition(position); reload(); }} />
              ) : current ? <SessionQuestionResults key={current.id} code={session.joinCode} question={current}
                refresh={reload} version={resultsVersion} /> : <Notice>Vote activity will appear after a question opens.</Notice>}
            </div>
          </div>
        </>
      )}
    </>
  );
}
