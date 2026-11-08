import type { ReactNode } from "react";

const icons = {
  bars: <path d="M5 19v-5m7 5V5m7 14V9" />,
  arrow: <path d="M4 12h15m-6-6 6 6-6 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  join: <><path d="M14 4h5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-5M3 12h12m-5-5 5 5-5 5" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  link: <><path d="m10 13 4-4m-6 7-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m0 12a4 4 0 0 0 6 0l5-5a4 4 0 0 0-6-6l-1 1" transform="translate(2 2) scale(.83)" /></>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3" /></>,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  refresh: <><path d="M20 5v5h-5M4 19v-5h5" /><path d="M5 10a7 7 0 0 1 12-4l3 4M4 14l3 4a7 7 0 0 0 12-4" /></>,
  question: <><path d="M7 8a5 5 0 1 1 8 4c-2 1-3 2-3 4m0 4h.01" /><circle cx="12" cy="12" r="10" /></>,
  present: <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8m-4-4v4" /></>,
  expand: <path d="M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5" />,
  shrink: <path d="M4 9h5V4m11 5h-5V4M9 20v-5H4m11 5v-5h5" />,
} satisfies Record<string, ReactNode>;

export function Icon({ name, className = "size-5" }: { name: keyof typeof icons; className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {icons[name]}
    </svg>
  );
}
