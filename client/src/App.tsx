import { useEffect, useState } from "react";
import { Icon } from "./components/Icon";
import { Notice, PageIntro } from "./components/PollUi";
import { AccountGate } from "./features/auth/AccountGate";
import { AuthForm } from "./features/auth/AuthForm";
import { useOrganizerAccount } from "./features/auth/useOrganizerAccount";
import { Home } from "./features/Home";
import { CreatePoll } from "./features/polls/CreatePoll";
import { JoinPoll } from "./features/polls/JoinPoll";
import { MyPolls } from "./features/polls/MyPolls";
import { Organizer } from "./features/polls/Organizer";
import { Presentation } from "./features/polls/Presentation";
import { CreateSession } from "./features/sessions/CreateSession";
import { MySessions } from "./features/sessions/MySessions";
import { SessionBuilder } from "./features/sessions/SessionBuilder";
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
  const sessionId = /^\/sessions\/([1-9][0-9]{0,18})$/.exec(path)?.[1];
  const sessionPage = path === "/my-sessions" || path === "/sessions/new" || !!sessionId;
  const joinCode = new URLSearchParams(window.location.search).get("code")?.trim();
  const createActive = path === "/create" || !!organizerId;
  const joinActive = path === "/join";
  const navClass = "rounded-lg px-2.5 py-2 text-sm font-bold hover:bg-accent-soft motion-safe:transition-colors sm:px-3";
  const { account, retry, logout, signedOut } = useOrganizerAccount(path !== "/present");
  const [leaving, setLeaving] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const signedIn = account.status === "signed-in";

  if (path === "/present") return <Presentation joinCode={joinCode ?? ""} />;

  async function signOut() {
    if (leaving) return;
    setLeaving(true);
    setLogoutError("");
    try {
      await logout();
    } catch (error) {
      setLogoutError(error instanceof Error ? error.message : "Could not log out. Try again.");
    } finally {
      setLeaving(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <a className="sr-only focus:not-sr-only focus:absolute focus:z-10 focus:rounded-md focus:bg-panel focus:p-2" href="#main">Skip to content</a>
      <header className="border-b border-line bg-inset">
        <div className="shell flex min-h-17 flex-wrap items-center justify-between gap-x-2 gap-y-2 py-2.5">
          <a href="/" className="inline-flex items-center gap-2 rounded-lg text-lg font-extrabold tracking-tight sm:gap-2.5 sm:text-xl">
            <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-accent text-white sm:size-9"><Icon name="bars" className="size-4.5 sm:size-5" /></span>
            QuickPoll
          </a>
          <nav aria-label="Main navigation" className="flex flex-wrap items-center gap-1">
            <a className={navClass + (createActive ? " bg-accent-soft text-accent-bright" : " text-muted")}
              href="/create" aria-current={path === "/create" ? "page" : undefined}>Create <span className="hidden min-[420px]:inline">Poll</span></a>
            <a className={navClass + (joinActive ? " bg-accent-soft text-accent-bright" : " text-muted")}
              href="/join" aria-current={joinActive ? "page" : undefined}>Join <span className="hidden min-[420px]:inline">Poll</span></a>
            {signedIn ? (
              <>
                <a className={navClass + (path === "/my-polls" ? " bg-accent-soft text-accent-bright" : " text-muted")}
                  href="/my-polls" aria-current={path === "/my-polls" ? "page" : undefined}>My Polls</a>
                <a className={navClass + (sessionPage ? " bg-accent-soft text-accent-bright" : " text-muted")}
                  href="/my-sessions" aria-current={path === "/my-sessions" ? "page" : undefined}>My Sessions</a>
                <button type="button" className={navClass + " text-muted disabled:opacity-60"}
                  disabled={leaving} onClick={() => void signOut()}>{leaving ? "Logging out…" : "Logout"}</button>
              </>
            ) : account.status !== "loading" && (
              <>
                <a className={navClass + " text-muted"} href="/login" aria-current={path === "/login" ? "page" : undefined}>Login</a>
                <a className={navClass + " text-accent-bright"} href="/register" aria-current={path === "/register" ? "page" : undefined}>Register</a>
              </>
            )}
          </nav>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="grow focus:outline-none">
        {logoutError && <div className="shell pt-4"><Notice error>{logoutError}</Notice></div>}
        {path === "/" ? <Home />
          : path === "/create" ? <CreatePoll account={account} retryAccount={retry} onSignedOut={signedOut} />
          : path === "/join" ? <JoinPoll joinCode={joinCode} />
          : organizerId ? <Organizer pollId={organizerId} account={account} retryAccount={retry} onSignedOut={signedOut} />
          : sessionPage ? (
            <section className="shell py-9 wrap-anywhere sm:py-14">
              {!signedIn && <PageIntro label="Organizer account" title="My Sessions">Sign in to prepare your sessions.</PageIntro>}
              <AccountGate account={account} retry={retry} description="Use your organizer account to create and manage sessions.">
                {sessionId ? <SessionBuilder id={sessionId} onSignedOut={signedOut} />
                  : path === "/sessions/new" ? <CreateSession onSignedOut={signedOut} />
                  : <MySessions onSignedOut={signedOut} />}
              </AccountGate>
            </section>
          )
          : path === "/my-polls" ? (account.status === "signed-in"
            ? <MyPolls key={account.organizer.id} onSignedOut={signedOut} />
            : <section className="shell py-9 sm:py-14">
              <PageIntro label="Organizer account" title="My Polls">Find the polls saved to your account.</PageIntro>
              <AccountGate account={account} retry={retry}>{null}</AccountGate>
            </section>)
          : path === "/login" || path === "/register" ? (
            account.status === "loading" ? <div className="shell py-9"><Notice>Checking your organizer session…</Notice></div>
              : signedIn ? <section className="shell py-9">
                <PageIntro label="Organizer account" title="You’re signed in">Open My Polls to manage your account’s polls.</PageIntro>
                <a href="/my-polls" className="btn btn-primary">My Polls</a>
              </section>
                : <AuthForm key={path} register={path === "/register"} />
          )
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
