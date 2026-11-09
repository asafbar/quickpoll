import { Icon } from "../../components/Icon";
import { ConnectionStatus, Notice, StatusBadge } from "../../components/PollUi";
import { FullscreenControl, JoinCard } from "../polls/PresentationControls";
import { validText } from "../polls/validation";
import { SessionQuestionResults, SessionSummary } from "./SessionResults";
import { useLiveSessionState } from "./useLiveSessionState";

function LivePresentation({ code, summaryOnly }: { code: string; summaryOnly: boolean }) {
  const { session, loading, error, reload, connection, resultsVersion, version } = useLiveSessionState(code);
  const question = session?.currentQuestion;

  return (
    <>
      {!session && <h1 className="sr-only">Session presentation</h1>}
      {!session && loading && <Notice>Loading session…</Notice>}
      {error && <div className="mb-4 grid justify-items-start gap-2">
        <Notice error>{error}</Notice>
        <button className="btn btn-secondary" type="button" onClick={reload}>Retry loading session</button>
      </div>}
      {session && (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_clamp(17rem,28vw,24rem)] xl:gap-8">
          <div className="grid min-w-0 gap-5">
            <div className="flex flex-wrap items-center gap-3">
              <span aria-live="polite"><StatusBadge status={session.status} /></span>
              <ConnectionStatus status={connection} />
              {connection !== "Live" && <button className="btn btn-secondary" type="button" onClick={reload}>Refresh session</button>}
            </div>
            <h1 className="text-[clamp(2rem,3.8vw,4rem)] leading-tight font-extrabold tracking-tight wrap-anywhere">{session.title}</h1>
            {summaryOnly || session.status === "closed" ? (
              <>
                {session.status === "closed" && <Notice>This session is complete.</Notice>}
                <SessionSummary code={code} version={version} />
              </>
            ) : question ? (
              <>
                <div>
                  <p className="eyebrow mb-2">Question {question.position}{question.status === "closed" ? " · Results review" : ""}</p>
                  <h2 className="text-2xl font-extrabold wrap-anywhere sm:text-4xl">{question.question}</h2>
                </div>
                <SessionQuestionResults key={question.id} code={code} question={question} refresh={reload} version={resultsVersion} presentation />
              </>
            ) : (
              <section className="panel p-5 sm:p-8">
                <h2 className="text-xl font-extrabold text-accent-bright sm:text-3xl">Waiting for the host</h2>
                <p className="mt-2 text-muted">{session.status === "draft" ? "Joining opens when the host starts the session." : "Join now and keep the page open for the first question."}</p>
              </section>
            )}
          </div>
          <JoinCard joinCode={code} closed={session.status === "closed"} session />
        </div>
      )}
    </>
  );
}

export function SessionPresentation({ code, summaryOnly = false }: { code: string; summaryOnly?: boolean }) {
  return (
    <main className="mx-auto min-h-dvh max-w-[112rem] px-5 py-5 sm:px-8 lg:px-10 xl:px-14 xl:py-6">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-white"><Icon name="bars" /></span>
          <div>
            <p className="text-lg font-extrabold">QuickPoll</p>
            <p className="eyebrow">{summaryOnly ? "Session results" : "Session presentation"}</p>
          </div>
        </div>
        <FullscreenControl />
      </header>
      {validText(code, 10) ? <LivePresentation code={code} summaryOnly={summaryOnly} />
        : <Notice error>Open a link with a valid session code.</Notice>}
    </main>
  );
}
