import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../../services/api";

export function useSessionResource<T>(load: (signal: AbortSignal) => Promise<T>, onSignedOut?: () => void, revision = 0) {
  const [version, setVersion] = useState(0);
  const [snapshot, setSnapshot] = useState<{ data?: T; error?: string; version: number; revision: number }>({
    version: -1, revision: -1,
  });
  const request = useRef<AbortController | null>(null);
  const loading = snapshot.version !== version || snapshot.revision !== revision;

  const reload = useCallback(() => {
    request.current?.abort();
    setVersion((value) => value + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    request.current = controller;
    load(controller.signal).then((data) => {
      if (!controller.signal.aborted) setSnapshot({ data, version, revision });
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      if (onSignedOut && error instanceof ApiError && error.status === 401) onSignedOut();
      else {
        const message = error instanceof Error ? error.message : "Could not load your session data.";
        setSnapshot((previous) => ({ ...previous, version, revision, error: message }));
      }
    });
    return () => controller.abort();
  }, [load, onSignedOut, version, revision]);

  return { data: snapshot.data, error: loading ? undefined : snapshot.error, loading, reload, version };
}
