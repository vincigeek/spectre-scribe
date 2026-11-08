"use client";
/** Final story: three chapter slots, receipts, download row (ux.md §5; T-23). */
import { bibleJson, chapterMarkdown, safeFileName, storyMarkdown, triggerDownload } from "@/lib/downloads";
import { useI18n } from "@/lib/i18n";
import type { AcceptedChapter } from "@/lib/pipeline-types";
import type { StoryBible } from "@/lib/story-bible";
import { RelayReceiptView } from "./relay-receipt";
import { Panel, Section } from "./ui";

type Props = { title: string; chapters: AcceptedChapter[]; replay: boolean; bible?: StoryBible | null };

export function FinalStory({ title, chapters, replay, bible }: Props) {
  const { t } = useI18n();
  if (chapters.length === 0) return null;
  const total = chapters.reduce((n, c) => n + c.wordCount, 0);
  const byNumber = new Map(chapters.map((c) => [c.chapterNumber, c]));
  const sorted = [...chapters].sort((a, b) => a.chapterNumber - b.chapterNumber);
  const dlChapter = (c: AcceptedChapter) => triggerDownload(safeFileName(`chapter-${c.chapterNumber}-${c.title}`, "md"), chapterMarkdown(c), "text/markdown");

  return (
    <Section id="final" number="05" title={t("final.title", { n: total }).replace(/^\d+ \/ /, "")} subtitle={t("final.subtitle")}>
      {title && <p className="prose-story text-lg italic text-muted">{title}</p>}
      {([1, 2, 3] as const).map((n) => {
        const c = byNumber.get(n);
        if (!c) {
          return (
            <Panel key={n}>
              <p className="font-mono text-sm text-muted">{t("final.missing", { n })}</p>
            </Panel>
          );
        }
        return (
          <article key={n} className="px-frame space-y-3 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-text">{t("final.chapter", { n: c.chapterNumber, title: c.title, count: c.wordCount })}</h3>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => dlChapter(c)}>{t("final.downloadMd")}</button>
            </div>
            <div className="prose-story">{c.prose}</div>
            <details className="text-sm">
              <summary className="cursor-pointer font-mono text-xs text-muted">{t("final.receipt")}</summary>
              <div className="mt-2"><RelayReceiptView receipt={c.relayReceipt} /></div>
            </details>
          </article>
        );
      })}
      <div className="flex flex-wrap gap-2">
        {sorted.map((c) => (
          <button key={c.chapterNumber} type="button" className="btn btn-ghost btn-sm" onClick={() => dlChapter(c)}>
            {t("final.downloadChapter", { n: c.chapterNumber })}
          </button>
        ))}
        {chapters.length === 3 && (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => triggerDownload(safeFileName(title || "story", "md"), storyMarkdown(title, sorted, { replay }), "text/markdown")}>
            {t("final.download")}
          </button>
        )}
        {bible && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => triggerDownload(safeFileName(bible.logline || "story-bible", "json"), bibleJson(bible), "application/json")}>
            {t("final.downloadBible")}
          </button>
        )}
      </div>
    </Section>
  );
}
