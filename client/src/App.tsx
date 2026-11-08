import { useEffect, useState } from "react";
import { Icon } from "./components/Icon";
import { PageIntro } from "./components/PollUi";
import { Home } from "./features/Home";
import { CreatePoll } from "./features/polls/CreatePoll";
import { JoinPoll } from "./features/polls/JoinPoll";
import { Organizer } from "./features/polls/Organizer";
import { getServerHealth } from "./services/api";

function Footer() {
  const [health, setHealth] = useState<"checking" | "online" | "unavailable">("checking");

  useEffect(() => {
    const controller = new AbortController();
    getServerHealth(controller.signal).then((data) => {
      if (!controller.signal.aborted) setHealth(data.status === "ok" ? "online" : "unavailable");
    }).catch(() => {
      if (!controller.signal.aborted) setHealth("unavailable");
    });
    return () => controller.abort();
  }, []);

  return (
    <footer className="mt-auto border-t border-line bg-inset">
      <div className="shell flex flex-wrap items-center justify-between gap-3 py-5 text-xs text-muted">
        <span><span className="font-extrabold text-ink">QuickPoll</span> · Simple polls for groups</span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className={"size-2 rounded-full " + (health === "online" ? "bg-success" : "bg-muted")} />
          {health === "checking" ? "Checking API…" : health === "online" ? "API online" : "API unavailable"}
        </span>
      </div>
    </footer>
  );
}

function App() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  const organizerId = /^\/organizer\/([1-9][0-9]{0,18})$/.exec(path)?.[1];
  const joinCode = new URLSearchParams(window.location.search).get("code")?.trim() ?? "";
  const createActive = path === "/create" || !!organizerId;
  const joinActive = path === "/join";
  const navClass = "rounded-lg px-2.5 py-2 text-sm font-bold hover:bg-accent-soft motion-safe:transition-colors sm:px-3";

  return (
    <div className="flex min-h-dvh flex-col">
      <a className="sr-only focus:not-sr-only focus:absolute focus:z-10 focus:rounded-md focus:bg-panel focus:p-2" href="#main">Skip to content</a>
      <header className="border-b border-line bg-inset">
        <div className="shell flex min-h-17 flex-wrap items-center justify-between gap-x-2 gap-y-2 py-2.5">
          <a href="/" className="inline-flex items-center gap-2 rounded-lg text-lg font-extrabold tracking-tight sm:gap-2.5 sm:text-xl">
            <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-accent text-white sm:size-9"><Icon name="bars" className="size-4.5 sm:size-5" /></span>
            QuickPoll
          </a>
          <nav aria-label="Main navigation" className="flex flex-wrap gap-1">
            <a className={navClass + (createActive ? " bg-accent-soft text-accent-bright" : " text-muted")}
              href="/create" aria-current={path === "/create" ? "page" : undefined}>Create <span className="hidden min-[420px]:inline">Poll</span></a>
            <a className={navClass + (joinActive ? " bg-accent-soft text-accent-bright" : " text-muted")}
              href="/join" aria-current={joinActive ? "page" : undefined}>Join <span className="hidden min-[420px]:inline">Poll</span></a>
          </nav>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="grow focus:outline-none">
        {path === "/" ? <Home />
          : path === "/create" ? <CreatePoll />
          : path === "/join" ? <JoinPoll joinCode={joinCode} />
          : organizerId ? <Organizer pollId={organizerId} />
          : (
            <section className="shell py-12">
              <PageIntro label="404" title="Page not found">This QuickPoll page doesn’t exist.</PageIntro>
              <a className="btn btn-primary" href="/">Back to home</a>
            </section>
          )}
      </main>
      <Footer />
    </div>
  );
}

export default App;
