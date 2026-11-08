import { useEffect, useState } from "react";
import { getPoll } from "../../services/api";
import type { PublicPoll } from "../../services/api";

export function usePublicPoll(joinCode: string) {
  const [result, setResult] = useState<{ poll?: PublicPoll; error?: string }>({});

  useEffect(() => {
    if (!joinCode) return;
    const controller = new AbortController();
    getPoll(joinCode, controller.signal).then((poll) => {
      if (!controller.signal.aborted) setResult({ poll });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) {
        setResult({ error: error instanceof Error ? error.message : "Could not load the poll." });
      }
    });
    return () => controller.abort();
  }, [joinCode]);

  return result;
}
