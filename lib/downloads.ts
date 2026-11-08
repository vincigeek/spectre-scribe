/**
 * Download builders (requirements REQ-16, design §2.7, task T-12). The builders are
 * pure; `triggerDownload` is browser-only and never touches a server filesystem.
 */
import type { AcceptedChapter } from "./pipeline-types";
import type { StoryBible } from "./story-bible";

export function bibleJson(bible: StoryBible): string {
  return `${JSON.stringify(bible, null, 2)}\n`;
}

export function chapterMarkdown(chapter: AcceptedChapter): string {
  const prose = chapter.prose.replace(/^#\s+.*\n+/, "").trim(); // drop a model-written H1
  return `# Chapter ${chapter.chapterNumber}: ${chapter.title}\n\n${prose}\n`;
}

export function storyMarkdown(title: string, chapters: readonly AcceptedChapter[], opts: { replay?: boolean } = {}): string {
  const ordered = [...chapters].sort((a, b) => a.chapterNumber - b.chapterNumber);
  const header = `# ${title || "Untitled story"}\n\n${opts.replay ? "_Replay of a recorded run._\n\n" : ""}`;
  return header + ordered.map((c) => chapterMarkdown(c).replace(/^# /, "## ")).join("\n");
}

/** ASCII-only file names (ux.md). */
export function safeFileName(base: string, ext: string): string {
  const slug = base.normalize("NFKD").replace(/[^\x20-\x7e]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
  return `${slug || "spectre-scribe"}.${ext}`;
}

export function triggerDownload(fileName: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
