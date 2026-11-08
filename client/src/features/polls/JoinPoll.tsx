import { useState } from "react";
import type { FormEvent } from "react";
import { Icon } from "../../components/Icon";
import { ConnectionStatus, Notice, OptionList, PageIntro, StatusBadge } from "../../components/PollUi";
import { joinPoll } from "../../services/api";
import type { ParticipantCredentials, PublicPoll } from "../../services/api";
import { Ballot } from "./Ballot";
import { getParticipantSession, saveParticipantSession } from "./session";
import { usePublicPoll } from "./usePublicPoll";
import { usePollLive } from "./usePollLive";
import { textLength, validText } from "./validation";

function JoinDetails({ poll, joinCode, refreshPoll }: { poll: PublicPoll; joinCode: string; refreshPoll: () => void }) {
  const { connection } = usePollLive(joinCode, poll.id, refreshPoll);
  const [participant, setParticipant] = useState(() => getParticipantSession(poll.id));
  const [displayName, setDisplayName] = useState("");
  const [pending, setPending] = useState(false);
  const [unsaved, setUnsaved] = useState<ParticipantCredentials | null>(null);
  const [error, setError] = useState("");
  const tooLong = textLength(displayName) > 100;

  function saveAccess(credentials: ParticipantCredentials) {
    try {
      saveParticipantSession(poll.id, credentials);
      setUnsaved(null);
      setError("");
      setParticipant(credentials);
    } catch {
      setUnsaved(credentials);
      setError("You joined the poll, but this tab could not save your access. Enable session storage and retry before leaving this page.");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validText(displayName, 100) || pending || unsaved || participant || poll.status !== "active") return;
    setPending(true);
    setError("");
    try {
      saveAccess(await joinPoll(joinCode, displayName.trim()));
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not join this poll.");
      refreshPoll();
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="panel p-4 sm:p-6" aria-labelledby="join-question">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="eyebrow">{participant ? "Your ballot" : "Poll preview"}</p>
        <div className="flex flex-wrap items-center gap-3">
          <ConnectionStatus status={connection} />
          <span aria-live="polite"><StatusBadge status={poll.status} /></span>
        </div>
      </div>
      <h2 id="join-question" className="mb-4 text-xl font-extrabold wrap-anywhere sm:text-2xl">{poll.question}</h2>
      {participant ? (
        <Ballot poll={poll} joinCode={joinCode} participant={participant} refreshPoll={refreshPoll} />
      ) : (
        <>
          <OptionList options={poll.options} />
          <div className="mt-5 border-t border-line pt-5">
            {poll.status === "draft" ? (
              <Notice warning>This poll hasn’t opened yet. Check back after the organizer activates it.</Notice>
            ) : poll.status === "closed" ? (
              <Notice>This poll is closed and no longer accepting participants.</Notice>
            ) : (
              <form className="grid max-w-sm gap-3" onSubmit={submit}>
                <div>
                  <label htmlFor="display-name" className="mb-1.5 block font-extrabold">Display name</label>
                  <input id="display-name" className="field" placeholder="Your name" value={displayName}
                    autoComplete="nickname" aria-describedby="name-hint" aria-invalid={tooLong}
                    onChange={(event) => setDisplayName(event.target.value)} disabled={pending || !!unsaved} required />
                  <p id="name-hint" className={"mt-1 text-xs " + (tooLong ? "font-bold text-danger" : "text-muted")}>
                    {tooLong ? "Use 100 characters or fewer." : "Use the name your group knows you by."}
                  </p>
                </div>
                {error && <Notice error>{error}</Notice>}
                {unsaved ? (
                  <button type="button" className="btn btn-primary justify-self-start" onClick={() => saveAccess(unsaved)}>Retry saving access</button>
                ) : (
                  <button type="submit" className="btn btn-primary justify-self-start" disabled={!validText(displayName, 100) || pending}>
                    {pending ? "Joining…" : "Join poll"} <Icon name="arrow" className="size-4" />
                  </button>
                )}
              </form>
            )}
          </div>
        </>
      )}
    </section>
  );
}

export function JoinPoll({ joinCode }: { joinCode: string }) {
  const [codeInput, setCodeInput] = useState(joinCode);
  const invalidCode = !!joinCode && !validText(joinCode, 10);
  const { poll, error, refresh } = usePublicPoll(invalidCode ? "" : joinCode);

  function findPoll(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validText(codeInput, 10)) return;
    window.location.assign("/join?code=" + encodeURIComponent(codeInput.trim()));
  }

  return (
    <section className="shell py-9 sm:py-14">
      <PageIntro label="Participant access" title="Join a poll">
        Use the code or link shared by your poll organizer.
      </PageIntro>
      <div className="grid max-w-3xl gap-5">
        <form className="panel p-4 sm:p-6" onSubmit={findPoll}>
          <label htmlFor="join-code" className="mb-2 block font-extrabold">Join code</label>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <input id="join-code" className="field font-mono tracking-wider sm:max-w-xs" value={codeInput}
              onChange={(event) => setCodeInput(event.target.value)} placeholder="e.g. A9B3C7D2E1"
              autoCapitalize="characters" autoComplete="off" spellCheck={false} required
              aria-describedby="code-hint" aria-invalid={!!codeInput && !validText(codeInput, 10)} />
            <button type="submit" className="btn btn-primary min-h-12" disabled={!validText(codeInput, 10)}>
              Find poll <Icon name="arrow" className="size-4" />
            </button>
          </div>
          <p id="code-hint" className="mt-2 text-xs text-muted">Enter the code exactly as shown by your organizer.</p>
        </form>
        {invalidCode && <Notice error>Enter a valid join code of up to 10 characters.</Notice>}
        {error && <Notice error>{error}</Notice>}
        {poll ? <JoinDetails key={poll.id} poll={poll} joinCode={joinCode} refreshPoll={refresh} />
          : joinCode && !invalidCode && !error ? <Notice>Looking up your poll…</Notice> : null}
      </div>
    </section>
  );
}
