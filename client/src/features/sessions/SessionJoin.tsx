import { useCallback, useRef, useState } from "react";
import type { FormEvent } from "react";
import { ConnectionStatus, Notice, PageIntro, StatusBadge } from "../../components/PollUi";
import { ApiError, getSessionQuestion, joinSession } from "../../services/api";
import type { ParticipantCredentials } from "../../services/api";
import { Ballot } from "../polls/Ballot";
import { validText } from "../polls/validation";
import { sessionPublicPath } from "./publicPaths";
import { SessionQuestionResults } from "./SessionResults";
import { useLiveSessionState } from "./useLiveSessionState";
import { useSessionResource } from "./useSessionResource";

function participantKey(code: string) {
  return "quickpoll:session-participant:" + code;
}

function readParticipant(code: string): ParticipantCredentials | null {
  try {
    const stored = JSON.parse(sessionStorage.getItem(participantKey(code)) ?? "null");
    if (typeof stored?.participantId === "string" && typeof stored.participantToken === "string") return stored;
  } catch {
    // Storage is optional until the participant explicitly joins.
  }
  return null;
}

function SessionBallot({ code, id, participant, revision, syncing, refresh }: {
  code: string;
  id: string;
  participant: ParticipantCredentials;
  revision: number;
  syncing: boolean;
  refresh: () => void;
}) {
  const load = useCallback((signal: AbortSignal) => getSessionQuestion(code, id, participant.participantToken, signal),
    [code, id, participant.participantToken]);
  const { data, error, loading, reload } = useSessionResource(load, undefined, revision);

  return (
    <>
      {!data && loading && <Notice>Loading question…</Notice>}
      {error && <div className="grid justify-items-start gap-2">
        <Notice error>{error}</Notice>
        <button type="button" className="btn btn-secondary" onClick={() => { reload(); refresh(); }}>Retry question</button>
      </div>}
      {data && !error && <Ballot poll={data.question} participant={participant} joinCode={code}
        refreshPoll={refresh} sessionHasVoted={data.question.hasVoted} disabled={syncing || loading} />}
    </>
  );
}

function SessionParticipant({ code }: { code: string }) {
  const { session, connection, loading, error, reload, version, resultsVersion } = useLiveSessionState(code);
  const [participant, setParticipant] = useState(() => readParticipant(code));
  const [name, setName] = useState("");
  const [joinError, setJoinError] = useState("");
  const [storageWarning, setStorageWarning] = useState(false);
  const [pending, setPending] = useState(false);
  const joining = useRef(false);
  const question = session?.currentQuestion;

  async function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (joining.current || participant || loading || error || !validText(name, 100) || session?.status !== "active") return;
    joining.current = true;
    setPending(true);
    setJoinError("");
    try {
      const credentials = await joinSession(code, name.trim());
      setParticipant(credentials);
      try {
        sessionStorage.setItem(participantKey(code), JSON.stringify(credentials));
      } catch {
        setStorageWarning(true);
      }
    } catch (error) {
      setJoinError(error instanceof Error ? error.message : "Could not join the session.");
      if (error instanceof ApiError && error.status === 409) reload();
    } finally {
      joining.current = false;
      setPending(false);
    }
  }

  return (
    <section className="shell py-8 sm:py-12">
      <div className="mx-auto grid max-w-2xl gap-4">
        {!session && <h1 className="text-3xl font-extrabold">Join a session</h1>}
        {!session && loading && <Notice>Loading session…</Notice>}
        {error && <div className="grid justify-items-start gap-2">
          <Notice error>{error}</Notice>
          <button type="button" className="btn btn-secondary" onClick={reload}>Retry</button>
        </div>}
        {session && (
          <>
            <section className="panel p-5 sm:p-7">
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <span aria-live="polite"><StatusBadge status={session.status} /></span>
                <ConnectionStatus status={connection} />
                {connection !== "Live" && <button type="button" className="btn btn-secondary"
                  disabled={loading} onClick={reload}>Refresh session</button>}
              </div>
              <h1 className="mb-4 text-2xl font-extrabold wrap-anywhere sm:text-3xl">{session.title}</h1>
              {storageWarning && <div className="mb-4"><Notice warning>Access could not be saved in this tab. Keep this page open to continue voting.</Notice></div>}
              {session.status === "closed" ? (
                <>
                  <Notice>This session is complete. Thanks for taking part.</Notice>
                  <a href={sessionPublicPath("summary", code)} className="btn btn-primary mt-4">View session summary</a>
                </>
              ) : session.status === "draft" ? <Notice warning>Waiting for the host to start the session.</Notice>
                : !participant ? (
                  <form className="grid gap-3" onSubmit={join}>
                    <label htmlFor="session-display-name" className="font-bold">Display name</label>
                    <input id="session-display-name" className="field" autoComplete="nickname" value={name} required
                      aria-describedby="session-name-hint" onChange={(event) => setName(event.target.value)} disabled={pending} />
                    <p id="session-name-hint" className={"text-sm " + (name && !validText(name, 100) ? "text-danger" : "text-muted")}>Use 1 to 100 characters.</p>
                    {joinError && <Notice error>{joinError}</Notice>}
                    <button type="submit" className="btn btn-primary justify-self-start" disabled={pending || loading || !!error || !validText(name, 100)}>
                      {pending ? "Joining…" : "Join session"}
                    </button>
                  </form>
                ) : question ? (
                  <>
                    <p className="eyebrow mb-2">Question {question.position}</p>
                    <h2 className="mb-3 text-xl font-extrabold wrap-anywhere">{question.question}</h2>
                    {session.activeQuestionId === question.id ? (
                      <SessionBallot key={question.id} code={code} id={question.id} participant={participant}
                        revision={version} syncing={loading || !!error} refresh={reload} />
                    ) : <Notice>Results review. Stay on this page for the next question.</Notice>}
                  </>
                ) : <Notice>You’re joined. Waiting for the host to open the first question.</Notice>}
            </section>
            {participant && session.status === "active" && question?.status === "closed" && (
              <SessionQuestionResults key={question.id} code={code} question={question} version={resultsVersion} refresh={reload} />
            )}
          </>
        )}
      </div>
    </section>
  );
}

export function SessionJoin({ code }: { code: string }) {
  if (!validText(code, 10)) {
    return <section className="shell py-8"><PageIntro label="Participant access" title="Join a session">Open the session link shared by the organizer.</PageIntro>
      <Notice error>This session link has an invalid join code.</Notice></section>;
  }
  return <SessionParticipant code={code} />;
}
