import { useCallback, useEffect, useRef, useState } from "react";
import { getPoll } from "../../services/api";
import type { PollStatus, PublicPoll } from "../../services/api";

export function usePublicPoll(joinCode: string) {
  const [result, setResult] = useState<{ poll?: PublicPoll; error?: string }>({});
  const [version, setVersion] = useState(0);
  const request = useRef<AbortController | null>(null);

  const refresh = useCallback(() => {
    request.current?.abort();
    setVersion((value) => value + 1);
  }, []);

  function applyStatus(status: PollStatus) {
    setResult((current) => current.poll ? { poll: { ...current.poll, status } } : current);
    refresh();
  }

  useEffect(() => {
    if (!joinCode) return;
    const controller = new AbortController();
    request.current = controller;
    getPoll(joinCode, controller.signal).then((poll) => {
      if (!controller.signal.aborted) setResult({ poll });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) {
        const message = error instanceof Error ? error.message : "Could not load the poll.";
        setResult((current) => ({ ...current, error: message }));
      }
    });
    return () => controller.abort();
  }, [joinCode, version]);

  return { ...result, refresh, applyStatus };
}
