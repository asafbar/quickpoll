import { useEffect, useState } from "react";
import { ApiError, getOwnedPolls } from "../../services/api";
import type { OwnedPoll } from "../../services/api";

export function useOwnedPolls(onSignedOut: () => void) {
  const [polls, setPolls] = useState<OwnedPoll[]>();
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);

  function retry() {
    setError("");
    setVersion((value) => value + 1);
  }

  useEffect(() => {
    const controller = new AbortController();
    getOwnedPolls(controller.signal).then(({ polls }) => {
      if (!controller.signal.aborted) setPolls(polls);
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      if (error instanceof ApiError && error.status === 401) onSignedOut();
      else setError(error instanceof Error ? error.message : "Could not load your polls.");
    });
    return () => controller.abort();
  }, [onSignedOut, version]);

  return { polls, error, retry };
}
