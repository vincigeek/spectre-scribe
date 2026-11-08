"use client";
/** Final story: three accepted chapters, downloads, receipts (REQ-16e; T-23). */
import { chapterMarkdown, safeFileName, storyMarkdown, triggerDownload } from "@/lib/downloads";
import type { AcceptedChapter } from "@/lib/pipeline-types";
import { RelayReceiptView } from "./relay-receipt";

export function FinalStory({ title, chapters, replay }: { title: string; chapters: AcceptedChapter[]; replay: boolean }) {
  if (chapters.length === 0) return null;
  const total = chapters.reduce((n, c) => n + c.wordCount, 0);
  const sorted = [...chapters].sort((a, b) => a.chapterNumber - b.chapterNumber);
  return (
    <section aria-labelledby="final-h" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="final-h" className="text-lg font-semibold">05 / Final story · {total} total</h2>
        {chapters.length === 3 && (
          <button type="button" className="rounded border border-neutral-600 px-3 py-1 text-sm" onClick={() => triggerDownload(safeFileName(title || "story", "md"), storyMarkdown(title, sorted, { replay }), "text/markdown")}>
            Download story (.md)
          </button>
        )}
      </div>
      {sorted.map((c) => (
        <article key={c.chapterNumber} className="space-y-2 rounded border border-neutral-800 p-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">Chapter {c.chapterNumber} · {c.title} · {c.wordCount}</h3>
            <button type="button" className="rounded border border-neutral-600 px-2 py-0.5 text-xs" onClick={() => triggerDownload(safeFileName(`chapter-${c.chapterNumber}-${c.title}`, "md"), chapterMarkdown(c), "text/markdown")}>Download .md</button>
          </div>
          <div className="whitespace-pre-wrap font-serif leading-relaxed">{c.prose}</div>
          <details className="text-sm"><summary className="cursor-pointer text-neutral-400">Relay receipt</summary><RelayReceiptView receipt={c.relayReceipt} /></details>
        </article>
      ))}
    </section>
  );
}
