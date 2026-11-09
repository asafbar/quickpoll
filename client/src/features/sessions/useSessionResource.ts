import { useEffect, useState } from "react";
import { ApiError } from "../../services/api";

export function useSessionResource<T>(load: (signal: AbortSignal) => Promise<T>, onSignedOut: () => void) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);

  function reload() {
    setError("");
    setLoading(true);
    setVersion((value) => value + 1);
  }

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).then((result) => {
      if (!controller.signal.aborted) setData(result);
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      if (error instanceof ApiError && error.status === 401) onSignedOut();
      else setError(error instanceof Error ? error.message : "Could not load your session data.");
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [load, onSignedOut, version]);

  return { data, error, loading, reload };
}
