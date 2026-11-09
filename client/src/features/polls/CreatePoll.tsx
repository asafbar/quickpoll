import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { Icon } from "../../components/Icon";
import { Notice, PageIntro } from "../../components/PollUi";
import { ApiError, createPoll, getOwnedPolls } from "../../services/api";
import type { CreatedPoll } from "../../services/api";
import type { AccountState } from "../auth/useOrganizerAccount";
import { saveOrganizerSession } from "./session";
import { textLength, validText } from "./validation";

export function CreatePoll({ account, retryAccount, onSignedOut }: {
  account: AccountState;
  retryAccount: () => void;
  onSignedOut: () => void;
}) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState([{ id: 1, text: "" }, { id: 2, text: "" }]);
  const nextId = useRef(3);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [pendingPoll, setPendingPoll] = useState<CreatedPoll | null>(null);
  const [checkingOwnership, setCheckingOwnership] = useState(false);
  const canCreate = account.status === "signed-in" || account.status === "signed-out";

  const trimmedOptions = options.map(({ text }) => text.trim());
  const nonemptyOptions = trimmedOptions.filter(Boolean);
  const hasDuplicates = new Set(nonemptyOptions).size !== nonemptyOptions.length;
  const valid = validText(question, 300) && options.every(({ text }) => validText(text, 150)) && !hasDuplicates;

  function saveAndOpen(poll: CreatedPoll) {
    try {
      saveOrganizerSession(poll.id, poll);
    } catch {
      setPendingPoll(poll);
      setCheckingOwnership(false);
      setError("Your poll was created, but this tab could not save organizer access. Enable session storage and retry before leaving this page.");
      return;
    }
    window.location.assign("/organizer/" + encodeURIComponent(poll.id));
  }

  async function openOwnedPoll(poll: CreatedPoll) {
    try {
      const { polls } = await getOwnedPolls();
      if (polls.some(({ id }) => id === poll.id)) {
        window.location.assign("/organizer/" + encodeURIComponent(poll.id));
        return;
      }
    } catch {
      // The create response does not identify the owner, so keep its access token in memory while verification is unavailable.
    }
    setPendingPoll(poll);
    setCheckingOwnership(true);
    setError("Your poll was created, but account ownership could not be verified. Retry the check or keep access in this tab.");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting || pendingPoll || !valid || !canCreate) return;

    setError("");
    setIsSubmitting(true);
    try {
      const poll = await createPoll({ question: question.trim(), options: trimmedOptions });
      if (account.status === "signed-in") {
        await openOwnedPoll(poll);
      } else {
        saveAndOpen(poll);
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onSignedOut();
        setError("Your organizer session ended. Sign in again to save this poll to your account.");
      } else {
        setError(error instanceof Error ? error.message : "Could not create your poll.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="shell py-9 sm:py-14">
      <PageIntro label="Organizer setup" title="Create a poll">
        Start with one question and give your audience a few clear choices.
      </PageIntro>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <form onSubmit={submit} className="panel p-4 sm:p-7">
          <fieldset disabled={isSubmitting || !!pendingPoll} className="min-w-0">
            <label htmlFor="question" className="mb-2 block font-extrabold">Poll question</label>
            <textarea id="question" rows={3} className="field resize-y" value={question}
              aria-describedby="question-count" aria-invalid={textLength(question) > 300}
              placeholder="What should we discuss at our next meetup?"
              onChange={(event) => setQuestion(event.target.value)} required />
            <p id="question-count" className={"mt-1 text-right text-xs " + (textLength(question) > 300 ? "font-bold text-danger" : "text-muted")}>
              {textLength(question)} / 300 characters
            </p>
            <fieldset className="mt-5 min-w-0">
              <legend className="font-extrabold">Answer options</legend>
              <p className="mt-1 mb-3 text-sm text-muted">Add 2 to 6 unique answers, up to 150 characters each.</p>
              <div className="grid gap-2.5">
                {options.map(({ id, text }, index) => {
                  const duplicate = !!text.trim() && trimmedOptions.indexOf(text.trim()) !== trimmedOptions.lastIndexOf(text.trim());
                  const tooLong = textLength(text) > 150;
                  return (
                    <div key={id}>
                      <label className="sr-only" htmlFor={"option-" + id}>Option {index + 1}</label>
                      <div className="flex items-center gap-2 sm:gap-3">
                        <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-lg bg-accent-soft text-xs font-bold text-accent-bright">{index + 1}</span>
                        <input id={"option-" + id} className="field" value={text} placeholder={"Option " + (index + 1)}
                          aria-invalid={tooLong || duplicate}
                          aria-describedby={tooLong || duplicate ? "option-error-" + id : undefined}
                          onChange={(event) => {
                            const value = event.target.value;
                            setOptions((current) => current.map((option) => option.id === id ? { id, text: value } : option));
                          }} required />
                        {options.length > 2 && (
                          <button type="button" className="btn btn-secondary min-w-11 px-2.5" aria-label={"Remove option " + (index + 1)}
                            onClick={() => setOptions((current) => current.filter((option) => option.id !== id))}>
                            <Icon name="close" className="size-4" />
                          </button>
                        )}
                      </div>
                      {(tooLong || duplicate) && <p id={"option-error-" + id} className="mt-1 pl-9 text-xs font-bold text-danger">
                        {tooLong ? "Use 150 characters or fewer." : "This answer is already listed."}
                      </p>}
                    </div>
                  );
                })}
              </div>
              <button type="button" className="btn btn-secondary mt-3" disabled={options.length === 6}
                onClick={() => {
                  const id = nextId.current++;
                  setOptions((current) => [...current, { id, text: "" }]);
                }}>
                <Icon name="plus" className="size-4" /> Add option
              </button>
            </fieldset>
          </fieldset>
          <div className="mt-6 border-t border-line pt-5">
            {account.status === "loading" && <div className="mb-3"><Notice>Checking your organizer session…</Notice></div>}
            {account.status === "unavailable" && (
              <div className="mb-3 grid justify-items-start gap-2">
                <Notice error>{account.message}</Notice>
                <button type="button" className="btn btn-secondary" onClick={retryAccount}>Retry session check</button>
              </div>
            )}
            {error && <div className="mb-3"><Notice error>{error}</Notice></div>}
            {pendingPoll && checkingOwnership ? (
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn btn-primary" disabled={isSubmitting} onClick={async () => {
                  setIsSubmitting(true);
                  await openOwnedPoll(pendingPoll);
                  setIsSubmitting(false);
                }}>Retry ownership check</button>
                <button type="button" className="btn btn-secondary" disabled={isSubmitting} onClick={() => saveAndOpen(pendingPoll)}>
                  Keep access in this tab
                </button>
              </div>
            ) : pendingPoll ? (
              <button type="button" className="btn btn-primary" onClick={() => saveAndOpen(pendingPoll)}>Retry saving access</button>
            ) : (
              <button className="btn btn-primary" type="submit" disabled={!valid || isSubmitting || !canCreate}>
                {isSubmitting ? "Creating poll…" : "Create poll"} <Icon name="arrow" className="size-4" />
              </button>
            )}
          </div>
        </form>
        <aside className="rounded-3xl border border-line bg-linear-to-br from-accent-soft to-panel p-5 sm:p-6">
          <Icon name="lock" className="mb-3 size-5 text-accent-bright" />
          <h2 className="font-extrabold">You decide when it opens</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">Your poll starts as a draft. Review it on the dashboard, then activate it when your group is ready.</p>
          {account.status === "signed-in" ? (
            <p className="mt-3 text-sm text-muted">This poll will be saved to <span className="font-semibold wrap-anywhere">{account.organizer.email}</span>.</p>
          ) : account.status === "signed-out" && (
            <p className="mt-3 text-sm text-muted">Creating anonymously? Keep this tab open to manage the poll, or <a href="/login" className="font-bold text-accent-bright underline">sign in</a> first.</p>
          )}
        </aside>
      </div>
    </section>
  );
}
