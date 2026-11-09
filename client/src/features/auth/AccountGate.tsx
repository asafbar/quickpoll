import type { ReactNode } from "react";
import { Notice } from "../../components/PollUi";
import type { AccountState } from "./useOrganizerAccount";

export function AccountGate({ account, retry, children, description = "Sign in with the organizer account that saved the poll." }: {
  account: AccountState;
  retry: () => void;
  children: ReactNode;
  description?: string;
}) {
  if (account.status === "signed-in") return children;
  if (account.status === "loading") return <Notice>Checking your organizer session…</Notice>;

  return (
    <div className="panel grid max-w-xl justify-items-start gap-3 p-5 sm:p-7">
      {account.status === "unavailable" ? (
        <>
          <Notice error>{account.message}</Notice>
          <button className="btn btn-secondary" type="button" onClick={retry}>Retry session check</button>
        </>
      ) : (
        <>
          <h2 className="text-lg font-extrabold">Sign in to continue</h2>
          <p className="text-sm text-muted">{description}</p>
          <a className="btn btn-primary" href="/login">Sign in</a>
        </>
      )}
    </div>
  );
}
