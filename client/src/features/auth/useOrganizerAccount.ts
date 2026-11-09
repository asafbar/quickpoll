import { useCallback, useEffect, useState } from "react";
import { ApiError, getCurrentOrganizer, logoutOrganizer } from "../../services/api";
import type { OrganizerAccount } from "../../services/api";

export type AccountState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "signed-in"; organizer: OrganizerAccount }
  | { status: "unavailable"; message: string };

let pendingSession: ReturnType<typeof getCurrentOrganizer> | undefined;

function restoreSession() {
  pendingSession ??= getCurrentOrganizer().finally(() => { pendingSession = undefined; });
  return pendingSession;
}

export function useOrganizerAccount(enabled: boolean) {
  const [account, setAccount] = useState<AccountState>({ status: "loading" });
  const [version, setVersion] = useState(0);
  const signedOut = useCallback(() => setAccount({ status: "signed-out" }), []);

  function retry() {
    setAccount({ status: "loading" });
    setVersion((value) => value + 1);
  }

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    restoreSession().then(({ organizer }) => {
      if (active) setAccount({ status: "signed-in", organizer });
    }).catch((error: unknown) => {
      if (!active) return;
      if (error instanceof ApiError && error.status === 401) {
        signedOut();
      } else {
        setAccount({ status: "unavailable", message: "Could not check your organizer session. Try again." });
      }
    });
    return () => { active = false; };
  }, [enabled, signedOut, version]);

  async function logout() {
    await logoutOrganizer();
    signedOut();
  }

  return { account, retry, logout, signedOut };
}
