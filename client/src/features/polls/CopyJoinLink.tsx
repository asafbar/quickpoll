import { useState } from "react";
import { Icon } from "../../components/Icon";

export function CopyJoinLink({ href }: { href: string }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "manual">("idle");

  async function copyJoinLink() {
    try {
      await navigator.clipboard.writeText(href);
      setCopyState("copied");
    } catch {
      setCopyState("manual");
    }
  }

  return (
    <>
      <button type="button" className="btn btn-secondary w-full" onClick={() => void copyJoinLink()}>
        <Icon name={copyState === "copied" ? "check" : "link"} className="size-4" />
        {copyState === "copied" ? "Link copied" : "Copy join link"}
      </button>
      {copyState === "copied" && <span role="status" className="sr-only">Public join link copied.</span>}
      {copyState === "manual" && (
        <label className="mt-3 block text-sm text-muted">Select and copy this link
          <input className="field mt-1" value={href} readOnly onFocus={(event) => event.target.select()} />
        </label>
      )}
    </>
  );
}
