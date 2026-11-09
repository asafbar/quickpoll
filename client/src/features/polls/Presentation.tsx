import { FullscreenControl, JoinCard } from "./PresentationControls";
import { Icon } from "../../components/Icon";
import { ConnectionStatus, Notice, StatusBadge } from "../../components/PollUi";
import { Results } from "./Results";
import { usePollLive } from "./usePollLive";
import { usePublicPoll } from "./usePublicPoll";
import { validText } from "./validation";

export function Presentation({ joinCode }: { joinCode: string }) {
  const validCode = validText(joinCode, 10);
  const { poll, error, refresh } = usePublicPoll(validCode ? joinCode : "");
  const { connection, resultsVersion } = usePollLive(joinCode, poll?.id, refresh, true);

  return (
    <main className="mx-auto min-h-dvh max-w-[112rem] px-5 py-5 sm:px-8 lg:px-10 xl:px-14 xl:py-6 2xl:py-8">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-x-5 gap-y-3 border-b border-line pb-4 sm:mb-6 2xl:mb-7">
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-white"><Icon name="bars" /></span>
          <div>
            <p className="text-lg leading-tight font-extrabold tracking-tight">QuickPoll</p>
            <p className="eyebrow mt-0.5">Presentation</p>
          </div>
        </div>
        <FullscreenControl />
      </header>

      {!poll && <h1 className="sr-only">Poll presentation</h1>}
      {!validCode ? <Notice error>Open a presentation link with a valid poll code.</Notice>
        : !poll && !error ? <Notice>Loading the poll…</Notice>
        : null}
      {error && (
        <div className="mb-4 grid justify-items-start gap-2">
          <Notice error>{error}</Notice>
          <button type="button" className="btn btn-secondary" onClick={refresh}>Retry loading poll</button>
        </div>
      )}
      {poll && (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_clamp(17rem,28vw,24rem)] xl:gap-8">
          <div className="grid min-w-0 gap-4 sm:gap-5">
            <div className="flex flex-wrap items-center gap-3">
              <span aria-live="polite"><StatusBadge status={poll.status} /></span>
              <ConnectionStatus status={connection} />
            </div>
            <h1 className="max-w-[28ch] text-[clamp(2rem,4.1vw,4.25rem)] leading-[1.08] font-extrabold tracking-tight wrap-anywhere">
              {poll.question}
            </h1>
            {poll.status === "draft" ? (
              <section className="panel p-5 sm:p-8" aria-labelledby="waiting-heading">
                <h2 id="waiting-heading" className="text-xl font-extrabold text-accent-bright sm:text-3xl">Waiting for the host</h2>
                <p className="mt-2 text-base text-muted sm:text-lg">Keep the join page open. Voting starts when the host opens the poll.</p>
              </section>
            ) : (
              <Results joinCode={joinCode} status={poll.status} refreshPoll={refresh}
                liveVersion={resultsVersion} presentation />
            )}
          </div>
          <JoinCard joinCode={joinCode} closed={poll.status === "closed"} />
        </div>
      )}
    </main>
  );
}
