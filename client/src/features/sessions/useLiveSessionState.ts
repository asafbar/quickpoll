import { useCallback } from "react";
import { getPublicSession } from "../../services/api";
import { useSessionLive } from "../polls/usePollLive";
import { useSessionResource } from "./useSessionResource";

export function useLiveSessionState(code: string) {
  const load = useCallback((signal: AbortSignal) => getPublicSession(code, signal), [code]);
  const resource = useSessionResource(load);
  const live = useSessionLive(resource.data ? code : "", resource.reload);
  return { ...resource, ...live, session: resource.data?.session };
}
