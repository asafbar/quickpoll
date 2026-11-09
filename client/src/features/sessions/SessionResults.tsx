import { useCallback } from "react";
import { Notice, StatusBadge } from "../../components/PollUi";
import { getSessionResults, getSessionSummary } from "../../services/api";
import type { PublicSession } from "../../services/api";
import { ResultBars, ResultsPanel } from "../polls/Results";
import { useSessionResource } from "./useSessionResource";

export function SessionQuestionResults({ code, question, refresh, version, presentation }: {
  code: string;
  question: NonNullable<PublicSession["currentQuestion"]>;
  refresh: () => void;
  version: number;
  presentation?: boolean;
}) {
  const load = useCallback((signal: AbortSignal) => getSessionResults(code, question.id, signal), [code, question.id]);
  return <ResultsPanel load={load} status={question.status} refreshPoll={refresh} liveVersion={version} presentation={presentation} />;
}

export function SessionSummary({ code, version }: { code: string; version: number }) {
  const load = useCallback((signal: AbortSignal) => getSessionSummary(code, signal), [code]);
  const { data, loading, error, reload } = useSessionResource(load, undefined, version);

  return (
    <section className="grid min-w-0 gap-4" aria-labelledby="summary-heading">
      <div>
        <h2 id="summary-heading" className="text-2xl font-extrabold">Session summary</h2>
        {data && <p className="mt-1 text-sm text-muted">{data.summary.questions.length} completed questions</p>}
      </div>
      {loading && <Notice>Loading completed results…</Notice>}
      {error && <div className="grid justify-items-start gap-2">
        <Notice error>{error}</Notice>
        <button type="button" className="btn btn-secondary" onClick={reload}>Retry summary</button>
      </div>}
      {data?.summary.questions.length === 0 && <Notice>No questions have closed yet.</Notice>}
      <ol className="grid gap-4 sm:grid-cols-2">
        {data?.summary.questions.map((question) => (
          <li key={question.id} className="panel grid min-w-0 gap-4 p-5">
            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="eyebrow">Question {question.position}</p>
                <StatusBadge status={question.status} />
              </div>
              <h3 className="text-lg font-bold wrap-anywhere">{question.question}</h3>
              <p className="text-sm text-muted">{question.totalVotes} {question.totalVotes === 1 ? "vote" : "votes"}</p>
            </div>
            <ResultBars results={question} />
          </li>
        ))}
      </ol>
    </section>
  );
}
