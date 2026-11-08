"use client";
/** Chapter workspace: progress, outline, draft, verdict, receipt, retry (REQ-15, REQ-16d; T-21). */
import { useI18n, type MessageKey } from "@/lib/i18n";
import type { PassView } from "@/lib/pass-reducer";
import { AGENT_ORDER, MAX_RETRIES, type RestartPoint } from "@/lib/pipeline-types";
import { RelayReceiptView } from "./relay-receipt";

type Props = {
  chapterNumber: 1 | 2 | 3 | null;
  pass: PassView;
  retriesUsed: number;
  canStart: boolean;
  blockedReason: string | null;
  replay: boolean;
  onStart: (restartAt: RestartPoint) => void;
};

export function ChapterWorkspace({ chapterNumber, pass, retriesUsed, canStart, blockedReason, replay, onStart }: Props) {
  const { t } = useI18n();
  const running = pass.status === "running";
  const retriesLeft = MAX_RETRIES - retriesUsed;
  const needsRetry = pass.status === "vetoed" || pass.status === "failed" || pass.status === "interrupted";
  const hasCheckpoints = Boolean(pass.outline && pass.style);
  const beats = (pass.outline as { beats?: Array<{ title: string; premise: string }> } | null)?.beats ?? [];

  return (
    <section aria-labelledby="ws-h" className="space-y-4">
      <h2 id="ws-h" className="text-lg font-semibold">{t("ws.title")}{chapterNumber ? t("ws.chapterSuffix", { n: chapterNumber }) : ""}</h2>

      <ol className="flex flex-wrap gap-2 text-xs" aria-label={t("ws.progress")}>
        {AGENT_ORDER.map((a) => {
          const done = pass.completedAgents.includes(a);
          const now = pass.currentAgent === a;
          return (
            <li key={a} className={`rounded px-2 py-1 ${now ? "bg-sky-700 text-white" : done ? "bg-emerald-900 text-emerald-200" : "bg-neutral-800 text-neutral-400"}`}>
              {a} {now ? t("ws.agentRunning") : done ? t("ws.agentDone") : ""}
            </li>
          );
        })}
      </ol>
      <p role="status" aria-live="polite" className="text-sm text-neutral-400">
        {running ? t("ws.running", { agent: pass.currentAgent ?? "relay" }) : pass.status === "idle" ? "" : t("ws.passStatus", { status: pass.status })}
      </p>

      {!replay && chapterNumber && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {!needsRetry && pass.status !== "approved" && (
            <button type="button" className="rounded bg-emerald-600 px-4 py-1 font-medium text-white disabled:opacity-40" disabled={!canStart || running} onClick={() => onStart("outline")}>
              {t("ws.write", { n: chapterNumber })}
            </button>
          )}
          {needsRetry && retriesLeft > 0 && (
            <>
              <button type="button" className="rounded bg-amber-600 px-3 py-1 text-white disabled:opacity-40" disabled={!canStart || running} onClick={() => onStart("outline")}>{t("ws.retryOutline")}</button>
              <button type="button" className="rounded bg-amber-700 px-3 py-1 text-white disabled:opacity-40" disabled={!canStart || running || !hasCheckpoints} onClick={() => onStart("continuation")}>{t("ws.retryContinuation")}</button>
              <span className="text-neutral-400">{t("ws.retriesLeft", { n: retriesLeft, max: MAX_RETRIES })}</span>
            </>
          )}
          {needsRetry && retriesLeft <= 0 && <span className="text-red-400">{t("ws.retriesExhausted", { max: MAX_RETRIES })}</span>}
          {blockedReason && <span className="text-amber-400">{blockedReason}</span>}
        </div>
      )}

      {pass.error && <p role="alert" className="text-sm text-red-400">{t(`err.${pass.error.code}` as MessageKey)} <code className="text-xs">({pass.error.code})</code></p>}

      {beats.length > 0 && (
        <details open className="rounded border border-neutral-800 p-2 text-sm">
          <summary className="cursor-pointer font-medium">{t("ws.beatOutline")}</summary>
          <ol className="list-decimal pl-5">{beats.map((b, i) => <li key={i}><span className="font-medium">{b.title}</span> — {b.premise}</li>)}</ol>
        </details>
      )}

      {pass.draft && (
        <article className="rounded border border-neutral-800 p-3">
          <p className="mb-2 text-xs text-neutral-400">{t("ws.draft")}{pass.wordCount !== null ? t("ws.serverCount", { n: pass.wordCount }) : ""}</p>
          <div className="whitespace-pre-wrap font-serif leading-relaxed">{pass.draft}</div>
        </article>
      )}

      {pass.continuity && (
        <div className={`rounded border p-3 text-sm ${pass.continuity.status === "APPROVED" ? "border-emerald-700" : "border-red-700"}`}>
          <p className="font-semibold">{pass.continuity.status === "APPROVED" ? "APPROVED" : "VETO"}</p>
          {pass.continuity.failures.length > 0 && (
            <ul className="mt-1 space-y-1">
              {pass.continuity.failures.map((f, i) => (
                <li key={i}><code className="text-xs">{f.checkId} · {f.bibleField}</code> {f.violation} <span className="text-neutral-400">{t("ws.fix")} {f.fix}</span></li>
              ))}
            </ul>
          )}
        </div>
      )}

      {pass.receipt && <RelayReceiptView receipt={pass.receipt} />}
    </section>
  );
}
