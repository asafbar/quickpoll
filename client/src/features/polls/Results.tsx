import { useEffect, useState } from "react";
import { Icon } from "../../components/Icon";
import { Notice } from "../../components/PollUi";
import { getPollResults } from "../../services/api";
import type { PollResults, PollStatus } from "../../services/api";

export function Results({ joinCode, status, refreshPoll, liveVersion, presentation = false }: {
  joinCode: string;
  status: PollStatus;
  refreshPoll: () => void;
  liveVersion: number;
  presentation?: boolean;
}) {
  const [version, setVersion] = useState(0);
  const requestVersion = version + liveVersion;
  const [state, setState] = useState<{ version: number; status?: PollStatus; results?: PollResults; error?: string }>({ version: -1 });
  const isLoading = state.version !== requestVersion || state.status !== status;

  useEffect(() => {
    const controller = new AbortController();
    getPollResults(joinCode, controller.signal).then((results) => {
      if (!controller.signal.aborted) setState({ version: requestVersion, status, results });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) {
        const message = error instanceof Error ? error.message : "Could not load results.";
        setState((current) => ({ ...current, version: requestVersion, status, error: message }));
      }
    });
    return () => controller.abort();
  }, [joinCode, status, requestVersion]);

  return (
    <section className={"panel p-4 " + (presentation ? "sm:p-6 xl:p-8" : "sm:p-6")} aria-labelledby="results-heading">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="results-heading" className={presentation ? "text-xl font-extrabold sm:text-2xl" : "text-lg font-extrabold"}>
            {presentation ? (status === "closed" ? "Final results" : "Live results") : "Results"}
          </h2>
          {state.results && <p className={presentation ? "text-lg font-semibold text-accent-bright" : "text-sm text-muted"}>{state.results.totalVotes} {state.results.totalVotes === 1 ? "vote" : "votes"} total</p>}
        </div>
        <button type="button" className="btn btn-secondary" disabled={isLoading} onClick={() => {
          refreshPoll();
          setVersion((value) => value + 1);
        }}>
          <Icon name="refresh" className="size-4" /> {isLoading ? "Refreshing…" : "Refresh results"}
        </button>
      </div>
      {isLoading && <p role="status" className="mb-3 text-sm text-muted">Loading results…</p>}
      {!isLoading && state.error && <Notice error>{state.error}</Notice>}
      {state.results && (
        <ol className={presentation ? "grid gap-5" : "grid gap-4"}>
          {state.results.options.map((option) => (
            <li key={option.id}>
              <div className={"mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 " + (presentation ? "text-base sm:text-xl" : "text-sm")}>
                <span className="min-w-0 font-bold wrap-anywhere">{option.text}</span>
                <span className="shrink-0 tabular-nums text-muted">
                  {option.voteCount} {option.voteCount === 1 ? "vote" : "votes"} · {option.percentage}%
                </span>
              </div>
              <div aria-hidden="true" className={"overflow-hidden rounded-full bg-line " + (presentation ? "h-3" : "h-2")}>
                <div className="h-full origin-left rounded-full bg-linear-to-r from-accent to-accent-bright motion-safe:transition-transform motion-safe:duration-500 motion-safe:ease-out"
                  style={{ transform: "scaleX(" + option.percentage / 100 + ")" }} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
