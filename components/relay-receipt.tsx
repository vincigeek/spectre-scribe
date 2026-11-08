"use client";
/** Human-readable relay receipt (design §2.6, P0). */
import type { RelayReceipt } from "@/lib/pipeline-types";

export function RelayReceiptView({ receipt }: { receipt: RelayReceipt }) {
  return (
    <div className="space-y-2 text-sm">
      <p className="text-xs uppercase tracking-wide text-neutral-400">Relay receipt · attempt {receipt.retryCount + 1}</p>
      <ol className="space-y-1">
        {receipt.steps.map((s) => (
          <li key={s.agent} className="rounded border border-neutral-800 p-2">
            <span className="font-mono text-xs text-neutral-400">{s.agent}</span> {s.summary}
            {s.changes.length > 0 && <ul className="list-disc pl-5 text-xs text-neutral-400">{s.changes.map((c, i) => <li key={i}>{c}</li>)}</ul>}
          </li>
        ))}
      </ol>
      {receipt.foreshadowingTransitions.length > 0 && (
        <p className="text-xs">Foreshadowing: {receipt.foreshadowingTransitions.map((t) => `${t.id} ${t.from} → ${t.to}`).join(" · ")}</p>
      )}
    </div>
  );
}
