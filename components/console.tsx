/** Signal-console building blocks on top of shadcn/ui (ux.md "Visual style"). */
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Page header for one of the five workspace pages. */
export function Section({ id, number, title, subtitle, children, aside }: { id: string; number: string; title: string; subtitle?: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h2 id={`${id}-h`} className="flex items-baseline gap-3 text-lg">
            <span className="label-pixel text-signal">{number}</span>
            <span className="label-pixel text-foreground">{title}</span>
          </h2>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {aside}
      </div>
      <div className="px-divider" aria-hidden />
      {children}
    </section>
  );
}

const TONE = {
  signal: "border-signal-dim",
  amber: "border-amber-dim",
  veto: "border-veto-dim bg-veto-dim/20",
  replay: "border-[#4b3d80] bg-[#4b3d80]/25",
} as const;

/** A shadcn Card with a 2px console border and stepped pixel corners. */
export function Panel({ children, tone, className }: { children: ReactNode; tone?: keyof typeof TONE; className?: string }) {
  return (
    <Card className={cn("px-corners gap-0 border-2 border-line px-4 py-4 text-sm ring-0", tone && TONE[tone], className)}>
      {children}
    </Card>
  );
}

export type Status = "waiting" | "running" | "approved" | "veto" | "failed" | "interrupted";

const BADGE: Record<Status, { icon: string; cls: string }> = {
  waiting: { icon: "○", cls: "border-line text-muted-foreground" },
  running: { icon: "◐", cls: "border-amber text-amber" },
  approved: { icon: "✓", cls: "border-signal text-signal" },
  veto: { icon: "✕", cls: "border-veto text-veto" },
  failed: { icon: "!", cls: "border-veto text-veto" },
  interrupted: { icon: "‖", cls: "border-amber text-amber" },
};

/** Status is text plus a shape, never colour alone. */
export function StatusBadge({ status, label }: { status: Status; label: string }) {
  const b = BADGE[status];
  return (
    <Badge variant="outline" className={cn("h-6 border-2 bg-transparent font-mono", b.cls)}>
      <span aria-hidden>{b.icon}</span>
      {label}
    </Badge>
  );
}

export function MonoLabel({ children }: { children: ReactNode }) {
  return <span className="font-mono text-xs tracking-wider text-muted-foreground uppercase">{children}</span>;
}
