import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { Notice, PageIntro } from "../../components/PollUi";
import { ApiError, createSession } from "../../services/api";
import { textLength, validText } from "../polls/validation";
import { demoTitle } from "./demo";

export function CreateSession({ onSignedOut }: { onSignedOut: () => void }) {
  const [title, setTitle] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const length = textLength(title);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || !validText(title, 150)) return;
    submitting.current = true;
    setPending(true);
    setError("");
    try {
      const { session } = await createSession(title.trim());
      window.location.assign("/sessions/" + encodeURIComponent(session.id));
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) onSignedOut();
      else setError(error instanceof Error ? error.message : "Could not create this session.");
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <>
      <PageIntro label="Session preparation" title="Create a session">
        Give your session a title. You’ll add questions in the builder.
      </PageIntro>
      <form className="panel max-w-2xl p-5 sm:p-7" onSubmit={submit}>
        <label htmlFor="session-title" className="mb-2 block font-bold">Session title</label>
        <input id="session-title" className="field" value={title} required disabled={pending}
          onChange={(event) => setTitle(event.target.value)} aria-invalid={length > 150}
          aria-describedby="session-title-count" placeholder="e.g. Team workshop" />
        <p id="session-title-count" className={"mt-1 text-sm " + (length > 150 ? "text-danger" : "text-muted")}>
          {length} / 150 characters
        </p>
        <button type="button" className="btn btn-secondary mt-3" disabled={pending || !!title.trim()}
          onClick={() => setTitle(demoTitle)}>Use demo title</button>
        {error && <div className="mt-4"><Notice error>{error}</Notice></div>}
        <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-5">
          <button type="submit" className="btn btn-primary" disabled={pending || !validText(title, 150)}>
            {pending ? "Creating…" : "Create session"}
          </button>
          <a href="/my-sessions" className="btn btn-secondary">Cancel</a>
        </div>
      </form>
    </>
  );
}
