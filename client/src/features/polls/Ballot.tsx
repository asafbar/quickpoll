import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Icon } from "../../components/Icon";
import { Notice } from "../../components/PollUi";
import { ApiError, castSessionVote, castVote } from "../../services/api";
import type { ParticipantCredentials, PublicPoll } from "../../services/api";
import { hasConfirmedVote, rememberConfirmedVote } from "./session";

export function Ballot({ poll, joinCode, participant, refreshPoll, sessionHasVoted, disabled = false }: {
  poll: PublicPoll;
  joinCode: string;
  participant: ParticipantCredentials;
  refreshPoll: () => void;
  sessionHasVoted?: boolean;
  disabled?: boolean;
}) {
  const isSession = sessionHasVoted !== undefined;
  const [selected, setSelected] = useState("");
  const [confirmation, setConfirmation] = useState<"restored" | "recorded" | null>(
    () => !isSession && hasConfirmedVote(poll.id, participant.participantId) ? "restored" : null,
  );
  const [blocked, setBlocked] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const confirmationMessage = useRef<HTMLDivElement>(null);
  const confirmed = confirmation || sessionHasVoted;
  const canVote = poll.status === "active" && !confirmed && !blocked;
  const validSelection = poll.options.some((option) => option.id === selected);

  useEffect(() => {
    if (confirmation === "recorded") confirmationMessage.current?.focus();
  }, [confirmation]);

  function confirmVote() {
    if (!isSession) rememberConfirmedVote(poll.id, participant.participantId);
    setConfirmation("recorded");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canVote || !validSelection || submitting.current || disabled) return;

    submitting.current = true;
    setPending(true);
    setError("");
    try {
      if (isSession) await castSessionVote(joinCode, poll.id, selected, participant.participantToken);
      else await castVote(joinCode, selected, participant.participantToken);
      confirmVote();
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 409 && (isSession ? error.code === "ALREADY_VOTED" : error.message === "This participant has already voted")) {
          confirmVote();
        } else if (error.status === 401 || error.status === 403) {
          setBlocked(true);
          setError(isSession ? "Your participant access is no longer valid for this session." : "Your participant access is no longer valid for this poll.");
        } else if (error.status === 404) {
          setBlocked(true);
          setError("This poll is no longer available.");
          refreshPoll();
        } else if (error.status === 409) {
          setBlocked(true);
          setError(isSession ? "This question is no longer accepting votes." : "This poll is no longer accepting votes.");
          refreshPoll();
        } else {
          setError(error.message);
        }
      } else {
        setError("Could not confirm your vote. You can retry safely. QuickPoll records at most one vote for your participant.");
      }
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <>
      {canVote ? (
        <form className="mt-6 border-t border-line pt-5" onSubmit={submit}>
          <fieldset className="min-w-0" disabled={pending || disabled}>
            <legend className="mb-3 text-sm font-semibold text-muted">Choose one answer, then submit your vote.</legend>
            <div className="grid gap-3">
              {poll.options.map((option) => (
                <label key={option.id} className="flex min-h-14 min-w-0 cursor-pointer items-center gap-3 rounded-xl border border-control bg-inset px-4 py-3 text-base font-semibold motion-safe:transition-colors hover:border-accent-bright has-checked:border-accent-bright has-checked:bg-accent-soft has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent-bright has-disabled:cursor-not-allowed has-disabled:text-muted">
                  <input type="radio" name="answer" value={option.id} checked={selected === option.id}
                    className="size-5 shrink-0 accent-accent-bright" onChange={() => setSelected(option.id)} />
                  <span className="min-w-0 wrap-anywhere">{option.text}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="mt-5 grid gap-3 border-t border-line pt-5 sm:justify-items-start">
            <button type="submit" className="btn btn-primary min-h-12" disabled={!validSelection || pending || disabled}>
              {pending ? "Submitting vote…" : "Submit vote"} <Icon name="arrow" className="size-4" />
            </button>
            <p className="text-xs text-muted">QuickPoll checks for a previous vote when you submit.</p>
          </div>
        </form>
      ) : null}
      {confirmed && (
        <div ref={confirmationMessage} tabIndex={-1} role="status"
          className="mt-6 flex items-start gap-3 rounded-xl border border-success/40 bg-success-soft p-4 text-success focus:outline-none">
          <Icon name="check" className="size-5 shrink-0" />
          <div>
            <p className="font-extrabold">Your vote was recorded.</p>
            <p className="mt-1 text-sm">{isSession ? "Stay here for the next question." : "Thanks for taking part."}</p>
          </div>
        </div>
      )}
      {poll.status === "closed" && <div className="mt-3"><Notice>This poll is closed. Voting has ended.</Notice></div>}
      {poll.status === "draft" && <div className="mt-3"><Notice warning>Voting opens when the organizer activates this poll.</Notice></div>}
      {error && <div className="mt-3"><Notice error>{error}</Notice></div>}
    </>
  );
}
