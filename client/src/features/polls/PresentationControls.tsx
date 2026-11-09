import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Icon } from "../../components/Icon";
import { Notice } from "../../components/PollUi";
import { CopyJoinLink } from "./CopyJoinLink";
import { getPublicJoinLink } from "./publicLinks";

export function FullscreenControl() {
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

export function JoinCard({ joinCode, closed, session = false }: { joinCode: string; closed: boolean; session?: boolean }) {
  const { href, invalidConfiguration, localOnly } = getPublicJoinLink(joinCode, session ? "/sessions/join" : "/join");

  return (
    <aside className="panel grid min-w-0 justify-items-center gap-3 p-5 text-center 2xl:gap-4 2xl:p-6" aria-labelledby="join-heading">
      <h2 id="join-heading" className="text-xl font-extrabold sm:text-2xl">{closed ? (session ? "Session link" : "Poll link") : (session ? "Join the session" : "Join the poll")}</h2>
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
