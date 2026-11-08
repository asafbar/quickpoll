import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Icon } from "../../components/Icon";
import { ConnectionStatus, Notice, StatusBadge } from "../../components/PollUi";
import { CopyJoinLink } from "./CopyJoinLink";
import { getPublicJoinLink } from "./publicLinks";
import { Results } from "./Results";
import { usePollLive } from "./usePollLive";
import { usePublicPoll } from "./usePublicPoll";
import { validText } from "./validation";

function FullscreenControl() {
  const [fullscreen, setFullscreen] = useState(() => !!document.fullscreenElement);
  const [error, setError] = useState("");
  const supported = document.fullscreenEnabled && typeof document.documentElement.requestFullscreen === "function";

  useEffect(() => {
    function onChange() {
      setFullscreen(!!document.fullscreenElement);
    }
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  async function toggle() {
    setError("");
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      setError("Could not change fullscreen mode. You can keep presenting in this tab.");
    }
  }

  return (
    <div className="grid justify-items-start gap-2 sm:justify-items-end">
      <button type="button" className="btn btn-secondary" disabled={!supported} onClick={() => void toggle()}
        aria-describedby={!supported || error ? "fullscreen-help" : undefined}>
        <Icon name={fullscreen ? "shrink" : "expand"} className="size-4" />
        {fullscreen ? "Exit fullscreen" : "Fullscreen"}
      </button>
      {(!supported || error) && <p id="fullscreen-help" role="status" className="max-w-xs text-sm text-warning">
        {error || "Fullscreen is unavailable in this browser. You can still present in this tab."}
      </p>}
    </div>
  );
}

function JoinCard({ joinCode, closed }: { joinCode: string; closed: boolean }) {
  const { href, invalidConfiguration, localOnly } = getPublicJoinLink(joinCode);

  return (
    <aside className="panel grid min-w-0 justify-items-center gap-3 p-5 text-center 2xl:gap-4 2xl:p-6" aria-labelledby="join-heading">
      <h2 id="join-heading" className="text-xl font-extrabold sm:text-2xl">{closed ? "Poll link" : "Join the poll"}</h2>
      <p className="text-sm text-muted sm:text-base">
        {closed ? "Voting has ended." : "Scan with your phone or enter the join code."}
      </p>
      {invalidConfiguration && <Notice warning>The public app URL is invalid. This link uses the current browser address.</Notice>}
      {localOnly && <Notice warning>Local-only QR. Use a LAN URL to scan from a phone.</Notice>}
      <QRCodeSVG value={href} level="M" marginSize={4} size={320}
        bgColor="#ffffff" fgColor="#000000" title="QR code for the public QuickPoll join link"
        className="h-auto w-full max-w-[17rem] shrink-0 lg:max-w-[clamp(12rem,28vh,17rem)]" />
      <div className="w-full rounded-xl border border-line bg-inset px-3 py-2.5">
        <p className="eyebrow mb-1">Join code</p>
        <p className="font-mono text-[clamp(1.25rem,2.6vw,2rem)] leading-tight font-bold tracking-wider text-accent-bright wrap-anywhere">{joinCode}</p>
      </div>
      <div className="min-w-0 text-sm">
        <a className="font-semibold text-accent-bright underline underline-offset-4 hover:text-ink"
          href={href} target="_blank" rel="noopener noreferrer">Open join link<span className="sr-only"> in a new tab</span></a>
        <p className="mt-1 text-muted wrap-anywhere">{href}</p>
      </div>
      <div className="w-full"><CopyJoinLink href={href} /></div>
    </aside>
  );
}

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
