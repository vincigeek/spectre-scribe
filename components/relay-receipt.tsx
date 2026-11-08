"use client";
/** Human-readable relay receipt, monospace rail style (design §2.6, P0). */
import { useI18n } from "@/lib/i18n";
import type { RelayReceipt } from "@/lib/pipeline-types";

export function RelayReceiptView({ receipt }: { receipt: RelayReceipt }) {
  const { t } = useI18n();
  return (
    <div className="space-y-3 text-sm">
      <p className="font-mono text-xs text-muted-foreground">{t("receipt.title", { n: receipt.retryCount + 1 })}</p>
      <ol className="space-y-2 border-l-2 border-line pl-3">
        {receipt.steps.map((s) => (
          <li key={s.agent}>
            <span className="label-pixel text-[0.7rem] text-signal">{s.agent}</span>
            <p className="text-foreground">{s.summary}</p>
            {s.changes.length > 0 && (
              <ul className="mt-1 space-y-0.5 font-mono text-xs text-muted-foreground">
                {s.changes.map((c, i) => <li key={i}>· {c}</li>)}
              </ul>
            )}
          </li>
        ))}
      </ol>
      {receipt.foreshadowingTransitions.length > 0 && (
        <p className="font-mono text-xs text-amber">
          {t("receipt.foreshadowing")} {receipt.foreshadowingTransitions.map((x) => `${x.id} ${x.from} → ${x.to}`).join(" · ")}
        </p>
      )}
    </div>
  );
}
