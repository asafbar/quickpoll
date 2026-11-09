import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { Notice } from "../../components/PollUi";
import { ApiError, addSessionQuestion } from "../../services/api";
import { textLength, validText } from "../polls/validation";
import { demoQuestions, demoTitle } from "./demo";

const emptyOptions = [{ id: 1, text: "" }, { id: 2, text: "" }];

export function SessionQuestionForm({ id, title, count, disabled, onSaved, onSignedOut, reload }: {
  id: string;
  title: string;
  count: number;
  disabled: boolean;
  onSaved: (position: number) => void;
  onSignedOut: () => void;
  reload: () => void;
}) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(emptyOptions);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const nextId = useRef(3);
  const trimmedOptions = options.map(({ text }) => text.trim());
  const valid = validText(question, 300) && options.every(({ text }) => validText(text, 150)) &&
    new Set(trimmedOptions).size === trimmedOptions.length;
  const demo = title === demoTitle ? demoQuestions[count] : undefined;
  const questionLength = textLength(question);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || submitting.current || !valid) return;
    submitting.current = true;
    setPending(true);
    setError("");
    try {
      const result = await addSessionQuestion(id, { question: question.trim(), options: trimmedOptions });
      setQuestion("");
      setOptions(emptyOptions);
      onSaved(result.question.position);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) onSignedOut();
      else {
        setError(error instanceof Error ? error.message : "Could not save the question.");
        if (error instanceof ApiError && (error.status === 404 || error.status === 409)) reload();
      }
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <form className="panel p-5 sm:p-7" onSubmit={submit} aria-labelledby="add-question">
      <h2 id="add-question" className="mb-4 text-xl font-extrabold">Add question</h2>
      <fieldset disabled={disabled || pending} className="min-w-0">
        {demo && (
          <button type="button" className="btn btn-secondary mb-4" disabled={!!question.trim() || trimmedOptions.some(Boolean)}
            onClick={() => {
              setQuestion(demo.question);
              setOptions(demo.options.map((text) => ({ id: nextId.current++, text })));
            }}>Use demo question {count + 1}</button>
        )}
        <label htmlFor="session-question" className="mb-2 block font-bold">Question</label>
        <textarea id="session-question" rows={3} className="field resize-y" value={question} required
          onChange={(event) => setQuestion(event.target.value)} aria-invalid={questionLength > 300}
          aria-describedby="session-question-count" placeholder="What would you like to ask?" />
        <p id="session-question-count" className={"text-right text-sm " + (questionLength > 300 ? "text-danger" : "text-muted")}>
          {questionLength} / 300 characters
        </p>
        <fieldset className="mt-4 min-w-0">
          <legend className="font-bold">Answer options</legend>
          <p className="mb-3 text-sm text-muted">Add 2 to 6 distinct answers, up to 150 characters each.</p>
          <div className="grid gap-3">
            {options.map(({ id, text }, index) => {
              const value = trimmedOptions[index];
              const duplicate = !!value && trimmedOptions.indexOf(value) !== trimmedOptions.lastIndexOf(value);
              const tooLong = textLength(text) > 150;
              const invalid = duplicate || tooLong;
              return (
                <div key={id}>
                  <div className="flex items-center gap-2">
                    <label className="sr-only" htmlFor={"session-answer-" + id}>Answer {index + 1}</label>
                    <input id={"session-answer-" + id} className="field" value={text} required
                      placeholder={"Answer " + (index + 1)} aria-invalid={invalid}
                      aria-describedby={invalid ? "session-answer-error-" + id : undefined}
                      onChange={(event) => {
                        const value = event.target.value;
                        setOptions((current) => current.map((option) => option.id === id ? { id, text: value } : option));
                      }} />
                    {options.length > 2 && (
                      <button type="button" className="btn btn-secondary" aria-label={"Remove answer " + (index + 1)}
                        onClick={() => setOptions((current) => current.filter((option) => option.id !== id))}>Remove</button>
                    )}
                  </div>
                  {invalid && <p id={"session-answer-error-" + id} className="mt-1 text-sm text-danger">
                    {tooLong ? "Use 150 characters or fewer." : "This answer is already listed."}
                  </p>}
                </div>
              );
            })}
          </div>
          <button type="button" className="btn btn-secondary mt-3" disabled={options.length >= 6} onClick={() => {
            const id = nextId.current++;
            setOptions((current) => [...current, { id, text: "" }]);
          }}>Add answer</button>
        </fieldset>
      </fieldset>
      {error && <div className="mt-4"><Notice error>{error}</Notice></div>}
      <div className="mt-5 border-t border-line pt-5">
        <button className="btn btn-primary" type="submit" disabled={disabled || pending || !valid}>
          {pending ? "Saving…" : "Save question"}
        </button>
      </div>
    </form>
  );
}
