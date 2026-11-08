"use client";
/** Final story: three chapter slots, receipts, download row (ux.md §5; T-23). */
import { bibleJson, chapterMarkdown, safeFileName, storyMarkdown, triggerDownload } from "@/lib/downloads";
import { useI18n } from "@/lib/i18n";
import type { AcceptedChapter } from "@/lib/pipeline-types";
import type { StoryBible } from "@/lib/story-bible";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { RelayReceiptView } from "./relay-receipt";
import { Panel, Section } from "./console";

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
      {title && <p className="prose-story text-lg italic text-muted-foreground">{title}</p>}
      {([1, 2, 3] as const).map((n) => {
        const c = byNumber.get(n);
        if (!c) {
          return (
            <Panel key={n}>
              <p className="font-mono text-sm text-muted-foreground">{t("final.missing", { n })}</p>
            </Panel>
          );
        }
        return (
          <Panel key={n} className="space-y-3 p-5"><article className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-foreground">{t("final.chapter", { n: c.chapterNumber, title: c.title, count: c.wordCount })}</h3>
              <Button variant="outline" size="sm" onClick={() => dlChapter(c)}>{t("final.downloadMd")}</Button>
            </div>
            <div className="prose-story">{c.prose}</div>
            <Collapsible className="text-sm">
              <CollapsibleTrigger className="font-mono text-xs text-muted-foreground hover:text-foreground">▸ {t("final.receipt")}</CollapsibleTrigger>
              <CollapsibleContent><div className="mt-2"><RelayReceiptView receipt={c.relayReceipt} /></div>
              </CollapsibleContent>
            </Collapsible>
          </article></Panel>
        );
      })}
      <div className="flex flex-wrap gap-2">
        {sorted.map((c) => (
          <Button key={c.chapterNumber} variant="outline" size="sm" onClick={() => dlChapter(c)}>
            {t("final.downloadChapter", { n: c.chapterNumber })}
          </Button>
        ))}
        {chapters.length === 3 && (
          <Button size="sm" onClick={() => triggerDownload(safeFileName(title || "story", "md"), storyMarkdown(title, sorted, { replay }), "text/markdown")}>
            {t("final.download")}
          </Button>
        )}
        {bible && (
          <Button variant="outline" size="sm" onClick={() => triggerDownload(safeFileName(bible.logline || "story-bible", "json"), bibleJson(bible), "application/json")}>
            {t("final.downloadBible")}
          </Button>
        )}
      </div>
    </Section>
  );
}
