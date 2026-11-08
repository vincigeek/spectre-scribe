/** Small presentational primitives for the signal-console theme (ux.md). */
import type { ReactNode } from "react";

export function Section({ id, number, title, subtitle, children, aside }: { id: string; number: string; title: string; subtitle?: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-28 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h2 id={`${id}-h`} className="flex items-baseline gap-3 text-lg">
            <span className="label-pixel text-signal">{number}</span>
            <span className="label-pixel text-text">{title}</span>
          </h2>
          {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
        </div>
        {aside}
      </div>
      <div className="px-divider" aria-hidden />
      {children}
    </section>
  );
}

export function Panel({ children, tone, className = "" }: { children: ReactNode; tone?: "signal" | "amber" | "veto" | "replay"; className?: string }) {
  return <div className={`px-frame ${tone ? `px-frame-${tone}` : ""} p-4 ${className}`}>{children}</div>;
}

export type Status = "waiting" | "running" | "approved" | "veto" | "failed" | "interrupted" | "done" | "locked" | "current";

const BADGE: Record<Status, { icon: string; cls: string }> = {
  waiting: { icon: "○", cls: "border-line text-muted" },
  locked: { icon: "▢", cls: "border-line text-muted" },
  current: { icon: "▶", cls: "border-amber text-amber" },
  running: { icon: "◐", cls: "border-amber text-amber" },
  approved: { icon: "✓", cls: "border-signal text-signal" },
  done: { icon: "✓", cls: "border-signal-dim text-signal" },
  veto: { icon: "✕", cls: "border-veto text-veto" },
  failed: { icon: "!", cls: "border-veto text-veto" },
  interrupted: { icon: "‖", cls: "border-amber text-amber" },
};

/** Status is text plus a shape, never colour alone. */
export function Badge({ status, label }: { status: Status; label: string }) {
  const b = BADGE[status];
  return (
    <span className={`inline-flex items-center gap-1.5 border-2 px-2 py-0.5 font-mono text-xs ${b.cls}`}>
      <span aria-hidden>{b.icon}</span>
      {label}
    </span>
  );
}

export function MonoLabel({ children }: { children: ReactNode }) {
  return <span className="font-mono text-xs uppercase tracking-wider text-muted">{children}</span>;
}
