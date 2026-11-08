import { useState } from "react";
import { Icon } from "../../components/Icon";

export function CopyJoinLink({ href }: { href: string }) {
  const [copyState, setCopyState] = useState<"idle" | "copying" | "copied" | "manual">("idle");

  async function copyJoinLink() {
    if (copyState === "copying") return;
    if (!navigator.clipboard?.writeText) {
      setCopyState("manual");
      return;
    }

    setCopyState("copying");
    try {
      await navigator.clipboard.writeText(href);
      setCopyState("copied");
    } catch {
      setCopyState("manual");
    }
  }

  return (
    <>
      <button type="button" className="btn btn-secondary w-full" disabled={copyState === "copying"}
        onClick={() => void copyJoinLink()}>
        <Icon name={copyState === "copied" ? "check" : "link"} className="size-4" />
        {copyState === "copied" ? "Link copied" : copyState === "copying" ? "Copying…" : "Copy join link"}
      </button>
      {copyState === "copied" && <span role="status" className="sr-only">Public join link copied.</span>}
      {copyState === "manual" && (
        <div className="mt-3 text-left text-sm">
          <p role="status" className="mb-2 text-warning">Automatic copy is unavailable. Select the link and use your device’s Copy command.</p>
          <label className="block font-semibold text-muted">Public join link
            <input className="field mt-1 font-normal" value={href} readOnly onFocus={(event) => event.currentTarget.select()} />
          </label>
        </div>
      )}
    </>
  );
}
