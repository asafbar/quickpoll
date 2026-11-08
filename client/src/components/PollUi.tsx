import type { ReactNode } from "react";
import type { PollOption, PollStatus } from "../services/api";

const statusStyle: Record<PollStatus, string> = {
  draft: "bg-warning-soft text-warning",
  active: "bg-success-soft text-success",
  closed: "bg-raised text-muted",
};

export function StatusBadge({ status }: { status: PollStatus }) {
  return <span className={"inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold capitalize " + statusStyle[status]}>
    <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />{status}
  </span>;
}

export function Notice({ children, error = false, warning = false }: { children: ReactNode; error?: boolean; warning?: boolean }) {
  const tone = error ? "border-danger/40 bg-danger-soft text-danger"
    : warning ? "border-warning/40 bg-warning-soft text-warning"
    : "border-line bg-panel text-muted";

  return (
    <div role={error ? "alert" : "status"} className={"rounded-xl border px-4 py-3 text-sm leading-relaxed " + tone}>
      {children}
    </div>
  );
}

export function OptionList({ options }: { options: PollOption[] }) {
  return (
    <ol className="grid gap-2.5">
      {options.map((option, index) => (
        <li key={option.id} className="flex min-w-0 items-start gap-3 rounded-xl border border-line px-3 py-2.5">
          <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-lg bg-accent-soft text-xs font-bold text-accent-bright">{index + 1}</span>
          <span className="min-w-0 pt-0.5 text-sm font-semibold wrap-anywhere">{option.text}</span>
        </li>
      ))}
    </ol>
  );
}

export function PageIntro({ label, title, children }: { label: string; title: string; children: ReactNode }) {
  return (
    <div className="mb-7 max-w-2xl sm:mb-9">
      <p className="eyebrow mb-2.5">{label}</p>
      <h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl">{title}</h1>
      <p className="mt-3 text-base leading-relaxed text-muted sm:text-lg">{children}</p>
    </div>
  );
}
