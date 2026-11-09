import { useCallback, useState } from "react";
import { Notice, OptionList, PageIntro, StatusBadge } from "../../components/PollUi";
import { getSessionDetails } from "../../services/api";
import { SessionQuestionForm } from "./SessionQuestionForm";
import { useSessionResource } from "./useSessionResource";

export function SessionBuilder({ id, onSignedOut }: { id: string; onSignedOut: () => void }) {
  const load = useCallback((signal: AbortSignal) => getSessionDetails(id, signal), [id]);
  const { data, error, loading, reload } = useSessionResource(load, onSignedOut);
  const [savedPosition, setSavedPosition] = useState<number>();
  const session = data?.session;

  return (
    <>
      <a className="mb-4 inline-block rounded-sm font-bold text-accent-bright hover:underline" href="/my-sessions">
        Back to My Sessions
      </a>
      <PageIntro label="Session builder" title={session?.title ?? "Session builder"}>
        Review the question order and prepare your session.
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
            <StatusBadge status={session.status} />
            <p className="text-muted">Join code <span className="font-mono font-bold text-accent-bright">{session.joinCode}</span></p>
            <p className="text-muted">{session.questions.length} {session.questions.length === 1 ? "question" : "questions"}</p>
          </div>
          <div className="grid items-start gap-5 lg:grid-cols-2">
            <section className="panel p-5 sm:p-7" aria-labelledby="session-questions">
              <h2 id="session-questions" className="mb-4 text-xl font-extrabold">Question order</h2>
              {loading && <p role="status" className="mb-3 text-sm text-muted">Refreshing questions…</p>}
              {session.questions.length === 0 ? <Notice>No questions yet. Add your first question to get started.</Notice> : (
                <ol className="grid gap-4">
                  {session.questions.map((question) => (
                    <li key={question.id} className="rounded-xl border border-line bg-inset p-4">
                      <p className="eyebrow mb-1">Question {question.position}</p>
                      <h3 className="mb-3 font-extrabold wrap-anywhere">{question.question}</h3>
                      <OptionList options={question.options} />
                    </li>
                  ))}
                </ol>
              )}
            </section>
            <div className="grid min-w-0 gap-4">
              {savedPosition !== undefined && <Notice>Question {savedPosition} saved.</Notice>}
              {session.status === "draft" ? (
                <SessionQuestionForm id={id} title={session.title} count={session.questions.length}
                  disabled={loading || !!error} onSignedOut={onSignedOut} reload={reload}
                  onSaved={(position) => { setSavedPosition(position); reload(); }} />
              ) : <Notice>Questions can only be added to draft sessions.</Notice>}
            </div>
          </div>
        </>
      )}
    </>
  );
}
