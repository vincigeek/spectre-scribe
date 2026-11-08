"use client";
/** Chapter workspace: header row, agent strip, prose pane + relay rail, veto panel (ux.md §4; T-21). */
import { useI18n, type MessageKey } from "@/lib/i18n";
import type { PassView } from "@/lib/pass-reducer";
import { AGENT_ORDER, MAX_RETRIES, type RestartPoint } from "@/lib/pipeline-types";
import { RelayReceiptView } from "./relay-receipt";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { MonoLabel, Panel, Section, StatusBadge, type Status } from "./console";

type Props = {
  chapterNumber: 1 | 2 | 3 | null;
  pass: PassView;
  retriesUsed: number;
  canStart: boolean;
  blockedReason: string | null;
  replay: boolean;
  onStart: (restartAt: RestartPoint) => void;
};

function passBadge(p: PassView): Status {
  if (p.status === "running") return "running";
  if (p.status === "approved") return "approved";
  if (p.status === "vetoed") return "veto";
  if (p.status === "failed") return "failed";
  if (p.status === "interrupted") return "interrupted";
  return "waiting";
}

export function ChapterWorkspace({ chapterNumber, pass, retriesUsed, canStart, blockedReason, replay, onStart }: Props) {
  const { t } = useI18n();
  const running = pass.status === "running";
  const retriesLeft = MAX_RETRIES - retriesUsed;
  const needsRetry = pass.status === "vetoed" || pass.status === "failed" || pass.status === "interrupted";
  const hasCheckpoints = Boolean(pass.outline && pass.style);
  const beats = (pass.outline as { beats?: Array<{ title: string; premise: string }> } | null)?.beats ?? [];
  const status = passBadge(pass);
  const attempt = pass.status === "idle" ? retriesUsed + 1 : pass.retryCount + 1;
  const veto = pass.continuity?.status === "VETO" ? pass.continuity : null;

  return (
    <Section id="chapters" number="04" title={t("ws.title").replace(/^\d+ \/ /, "")} subtitle={t("ws.subtitle")}>
      <Panel tone={status === "approved" ? "signal" : status === "veto" || status === "failed" ? "veto" : status === "running" ? "amber" : undefined}>
        <div className="flex flex-wrap items-center gap-3">
          {chapterNumber && <span className="label-pixel text-sm text-foreground">{t("ws.chapterOf", { n: chapterNumber })}</span>}
          <StatusBadge status={status} label={t(`badge.${status === "veto" ? "veto" : status === "approved" ? "approved" : status === "running" ? "running" : status === "failed" ? "failed" : status === "interrupted" ? "interrupted" : "waiting"}` as MessageKey)} />
          <span className="font-mono text-xs text-muted-foreground">{t("ws.attempt", { n: attempt, max: MAX_RETRIES + 1 })}</span>
        </div>

        <ol className="mt-4 flex flex-wrap items-center gap-2" aria-label={t("ws.progress")}>
          {AGENT_ORDER.map((a, i) => {
            const done = pass.completedAgents.includes(a);
            const now = pass.currentAgent === a;
            const failed = !now && !done && pass.status === "failed" && pass.completedAgents.length === i;
            const cls = now ? "chip-running" : done ? "chip-done" : failed ? "chip-failed" : "";
            const label = now ? t("agent.running") : done ? t("agent.done") : t("agent.pending");
            return (
              <li key={a} className="flex items-center gap-2">
                <span className={`chip ${cls}`}>
                  <span aria-hidden>{now ? "◐" : done ? "■" : failed ? "✕" : "□"}</span>
                  <span className="label-pixel">{a}</span>
                  <span className="opacity-80">{label}</span>
                </span>
                {i < AGENT_ORDER.length - 1 && <span aria-hidden className="text-muted-foreground">→</span>}
              </li>
            );
          })}
        </ol>
        <p role="status" aria-live="polite" className="sr-only">
          {running ? t("ws.running", { agent: pass.currentAgent ?? "relay" }) : pass.status === "idle" ? "" : t("ws.passStatus", { status: pass.status })}
        </p>
      </Panel>

      {pass.error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>✕ {t(`err.${pass.error.code}` as MessageKey)} <code className="font-mono opacity-70">({pass.error.code})</code></AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-5">
        <Panel className="lg:col-span-3">
          <div className="mb-3 flex items-center justify-between">
            <MonoLabel>{t("ws.prose")}</MonoLabel>
            {pass.wordCount !== null && <span className="font-mono text-xs text-muted-foreground">{t("ws.serverCount", { n: pass.wordCount }).replace(/^ · /, "")}</span>}
          </div>
          {pass.draft ? (
            <div className={`prose-story ${running ? "blink-cursor" : ""}`}>{pass.draft}</div>
          ) : (
            <p className={`text-sm text-muted-foreground ${running ? "blink-cursor" : ""}`}>{t("ws.proseEmpty")}</p>
          )}
        </Panel>
        <Panel className="space-y-4 lg:col-span-2">
          <MonoLabel>{t("ws.rail")}</MonoLabel>
          {beats.length > 0 && (
            <Collapsible defaultOpen className="text-sm">
              <CollapsibleTrigger className="font-mono text-xs text-muted-foreground hover:text-foreground">▾ {t("ws.beatOutline")}</CollapsibleTrigger>
              <CollapsibleContent>
              <ol className="mt-2 list-decimal space-y-1 pl-5">
                {beats.map((b, i) => <li key={i}><span className="font-medium text-foreground">{b.title}</span> <span className="text-muted-foreground">— {b.premise}</span></li>)}
              </ol>
              </CollapsibleContent>
            </Collapsible>
          )}
          {pass.receipt ? <RelayReceiptView receipt={pass.receipt} /> : <p className="text-sm text-muted-foreground">{t("ws.railEmpty")}</p>}
        </Panel>
      </div>

      {veto && (
        <Panel tone="veto">
          <p className="label-pixel mb-3 text-sm text-veto">✕ {t("ws.vetoTitle")}</p>
          <ul className="space-y-3">
            {veto.failures.map((f, i) => (
              <li key={i} className="grid gap-1 text-sm sm:grid-cols-[auto_1fr]">
                <code className="font-mono text-xs text-veto">{f.checkId} · {f.bibleField}</code>
                <span>{f.violation}</span>
                <span className="font-mono text-xs text-muted-foreground sm:col-start-2">{t("ws.fix")} {f.fix}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      {pass.continuity?.status === "APPROVED" && (
        <p className="text-sm text-signal">✓ {t("badge.approved")}</p>
      )}

      {!replay && chapterNumber && (
        <div className="flex flex-wrap items-center gap-3">
          {!needsRetry && pass.status !== "approved" && (
            <Button size="lg" className="px-corners-sm" disabled={!canStart || running} onClick={() => onStart("outline")}>
              ▶ {t("ws.write", { n: chapterNumber })}
            </Button>
          )}
          {needsRetry && retriesLeft > 0 && (
            <>
              <Button className="bg-amber text-black hover:bg-amber/80" disabled={!canStart || running} onClick={() => onStart("outline")}>{t("ws.retryOutline")}</Button>
              <Button variant="outline" disabled={!canStart || running || !hasCheckpoints} onClick={() => onStart("continuation")}>{t("ws.retryContinuation")}</Button>
              <span className="font-mono text-xs text-muted-foreground">{t("ws.retriesLeft", { n: retriesLeft, max: MAX_RETRIES })}</span>
            </>
          )}
          {needsRetry && retriesLeft <= 0 && <span className="text-sm text-veto">{t("ws.retriesExhausted", { max: MAX_RETRIES })}</span>}
          {blockedReason && <span className="text-sm text-amber">⚠ {blockedReason}</span>}
        </div>
      )}
    </Section>
  );
}
