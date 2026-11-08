"use client";
/** Story bible editor for every REQ-06 field (REQ-07, REQ-16c; T-10). */
import { useMemo } from "react";
import { bibleJson, safeFileName, triggerDownload } from "@/lib/downloads";
import {
  parseStoryBible,
  type BeatSheetEntry,
  type Character,
  type CharacterStatus,
  type ForeshadowingEntry,
  type StoryBible,
} from "@/lib/story-bible";
import { useI18n } from "@/lib/i18n";
import { countUnits, LANGUAGE_LIMITS, type Language } from "@/lib/text-units";

export function emptyBible(): StoryBible {
  return {
    genre: "", tone: "", logline: "", synopsis: "",
    setting: { timePeriod: "", locations: [""], worldRules: [""] },
    characters: [],
    foreshadowing: [],
    timeline: [],
    beatSheet: [1, 2, 3].map((n) => ({ chapterNumber: n, title: "", premise: "", characterStates: {} })),
  };
}

const input = "w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm";
const small = "rounded border border-neutral-600 px-2 py-0.5 text-xs";

function Field({ label, value, onChange, area, hint }: { label: string; value: string; onChange: (v: string) => void; area?: boolean; hint?: string }) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="text-neutral-300">{label}{hint && <span className="ml-2 text-neutral-500">{hint}</span>}</span>
      {area ? <textarea className={input} rows={3} value={value} onChange={(e) => onChange(e.target.value)} /> : <input className={input} value={value} onChange={(e) => onChange(e.target.value)} />}
    </label>
  );
}

function StringList({ label, items, onChange }: { label: string; items: string[]; onChange: (v: string[]) => void }) {
  const { t } = useI18n();
  return (
    <fieldset className="space-y-1">
      <legend className="text-sm text-neutral-300">{label}</legend>
      {items.map((v, i) => (
        <div key={i} className="flex gap-2">
          <input className={input} aria-label={`${label} ${i + 1}`} value={v} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} />
          <button type="button" className={small} onClick={() => onChange(items.filter((_, j) => j !== i))}>{t("bible.remove")}</button>
        </div>
      ))}
      <button type="button" className={small} onClick={() => onChange([...items, ""])}>{t("bible.add")}</button>
    </fieldset>
  );
}

const STATUSES: CharacterStatus[] = ["alive", "dead", "unknown"];

type Props = { bible: StoryBible; language: Language; onChange: (b: StoryBible) => void; readOnly?: boolean };

export function StoryBibleEditor({ bible, language, onChange, readOnly }: Props) {
  const { t } = useI18n();
  const limits = LANGUAGE_LIMITS[language];
  const unit = t(`unit.${limits.lengthUnit}`);
  const validation = useMemo(() => parseStoryBible(bible, language), [bible, language]);
  const set = <K extends keyof StoryBible>(k: K, v: StoryBible[K]) => onChange({ ...bible, [k]: v });
  const setChar = (i: number, c: Partial<Character>) => set("characters", bible.characters.map((x, j) => (j === i ? { ...x, ...c } : x)));
  const setFs = (i: number, f: Partial<ForeshadowingEntry>) => set("foreshadowing", bible.foreshadowing.map((x, j) => (j === i ? { ...x, ...f } : x)));
  const setBeat = (i: number, b: Partial<BeatSheetEntry>) => set("beatSheet", bible.beatSheet.map((x, j) => (j === i ? { ...x, ...b } : x)));

  function addCharacter() {
    const n = bible.characters.reduce((m, c) => Math.max(m, Number(/^char-(\d+)$/.exec(c.id)?.[1] ?? 0)), 0) + 1;
    const id = `char-${n}`;
    onChange({
      ...bible,
      characters: [...bible.characters, { id, name: "", role: bible.characters.length ? "supporting" : "protagonist", status: "alive", description: "", goal: "", motivation: "", conflict: "", epiphany: "" }],
      beatSheet: bible.beatSheet.map((b) => ({ ...b, characterStates: { ...b.characterStates, [id]: "alive" } })),
    });
  }
  function removeCharacter(i: number) {
    const id = bible.characters[i]!.id;
    onChange({
      ...bible,
      characters: bible.characters.filter((_, j) => j !== i),
      beatSheet: bible.beatSheet.map((b) => {
        const { [id]: _drop, ...rest } = b.characterStates;
        return { ...b, characterStates: rest };
      }),
    });
  }

  return (
    <section aria-labelledby="bible-h" className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 id="bible-h" className="text-lg font-semibold">{t("bible.title")}</h2>
        <button type="button" className={small} onClick={() => triggerDownload(safeFileName(bible.logline || "story-bible", "json"), bibleJson(bible), "application/json")}>{t("bible.download")}</button>
      </div>
      {!validation.ok && (
        <div role="status" className="rounded border border-amber-700 bg-amber-950/40 p-2 text-xs text-amber-300">
          <p className="font-medium">{t("bible.issues", { n: validation.issues.length })}</p>
          <ul className="list-disc pl-5">{validation.issues.slice(0, 12).map((i, k) => <li key={k}><code>{i.path || "bible"}</code>: {i.message}</li>)}</ul>
        </div>
      )}
      <fieldset disabled={readOnly} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("bible.genre")} value={bible.genre} onChange={(v) => set("genre", v)} />
          <Field label={t("bible.tone")} value={bible.tone} onChange={(v) => set("tone", v)} />
        </div>
        <Field label={t("bible.logline")} hint={t("bible.loglineHint", { n: countUnits(bible.logline, language), max: limits.loglineMax, unit })} value={bible.logline} onChange={(v) => set("logline", v)} />
        <Field label={t("bible.synopsis")} hint={t("bible.synopsisHint")} area value={bible.synopsis} onChange={(v) => set("synopsis", v)} />

        <fieldset className="space-y-2 rounded border border-neutral-800 p-3">
          <legend className="px-1 text-sm font-medium">{t("bible.setting")}</legend>
          <Field label={t("bible.timePeriod")} value={bible.setting.timePeriod} onChange={(v) => set("setting", { ...bible.setting, timePeriod: v })} />
          <StringList label={t("bible.locations")} items={bible.setting.locations} onChange={(v) => set("setting", { ...bible.setting, locations: v })} />
          <StringList label={t("bible.worldRules")} items={bible.setting.worldRules} onChange={(v) => set("setting", { ...bible.setting, worldRules: v })} />
        </fieldset>

        <fieldset className="space-y-2 rounded border border-neutral-800 p-3">
          <legend className="px-1 text-sm font-medium">{t("bible.characters")}</legend>
          {bible.characters.map((c, i) => (
            <div key={c.id} className="space-y-2 border-b border-neutral-800 pb-3">
              <div className="flex flex-wrap items-end gap-2">
                <code className="text-xs text-neutral-500">{c.id}</code>
                <div className="flex-1"><Field label={t("bible.name")} value={c.name} onChange={(v) => setChar(i, { name: v })} /></div>
                <label className="text-sm">{t("bible.role")}{" "}
                  <select className="rounded bg-neutral-900 px-2 py-1" value={c.role} onChange={(e) => setChar(i, { role: e.target.value as Character["role"] })}>
                    <option value="protagonist">protagonist</option><option value="antagonist">antagonist</option><option value="supporting">supporting</option>
                  </select>
                </label>
                <button type="button" className={small} onClick={() => removeCharacter(i)}>{t("bible.remove")}</button>
              </div>
              <Field label={t("bible.description")} value={c.description} onChange={(v) => setChar(i, { description: v })} />
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label={t("bible.goal")} value={c.goal} onChange={(v) => setChar(i, { goal: v })} />
                <Field label={t("bible.motivation")} value={c.motivation} onChange={(v) => setChar(i, { motivation: v })} />
                <Field label={t("bible.conflict")} value={c.conflict} onChange={(v) => setChar(i, { conflict: v })} />
                <Field label={t("bible.epiphany")} value={c.epiphany} onChange={(v) => setChar(i, { epiphany: v })} />
              </div>
            </div>
          ))}
          <button type="button" className={small} onClick={addCharacter}>{t("bible.addCharacter")}</button>
        </fieldset>

        <fieldset className="space-y-2 rounded border border-neutral-800 p-3">
          <legend className="px-1 text-sm font-medium">{t("bible.foreshadowing")}</legend>
          {bible.foreshadowing.map((f, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2">
              <code className="text-xs text-neutral-500">{f.id}</code>
              <div className="flex-1"><Field label={t("bible.itemDescription")} value={f.description} onChange={(v) => setFs(i, { description: v })} /></div>
              <select aria-label={t("bible.status")} className="rounded bg-neutral-900 px-2 py-1 text-sm" value={f.status} onChange={(e) => {
                const status = e.target.value as ForeshadowingEntry["status"];
                const { deferredToChapter: _d, ...rest } = f;
                setFs(i, status === "deferred" ? { status, deferredToChapter: 2 } : { ...rest, status, deferredToChapter: undefined });
              }}>
                <option value="open">open</option><option value="paidOff">paidOff</option><option value="deferred">deferred</option>
              </select>
              {f.status === "deferred" && (
                <select aria-label={t("bible.deferredTo")} className="rounded bg-neutral-900 px-2 py-1 text-sm" value={f.deferredToChapter ?? 2} onChange={(e) => setFs(i, { deferredToChapter: Number(e.target.value) })}>
                  {[1, 2, 3].map((n) => <option key={n} value={n}>{t("bible.chapterN", { n })}</option>)}
                </select>
              )}
              <button type="button" className={small} onClick={() => set("foreshadowing", bible.foreshadowing.filter((_, j) => j !== i))}>{t("bible.remove")}</button>
            </div>
          ))}
          <button type="button" className={small} onClick={() => {
            const n = bible.foreshadowing.reduce((m, f) => Math.max(m, Number(/^fs-(\d+)$/.exec(f.id)?.[1] ?? 0)), 0) + 1;
            set("foreshadowing", [...bible.foreshadowing, { id: `fs-${n}`, description: "", status: "open" }]);
          }}>{t("bible.addItem")}</button>
        </fieldset>

        <fieldset className="space-y-2 rounded border border-neutral-800 p-3">
          <legend className="px-1 text-sm font-medium">{t("bible.timeline")}</legend>
          {bible.timeline.map((ev, i) => (
            <div key={i} className="flex items-end gap-2">
              <select aria-label={t("bible.chapter")} className="rounded bg-neutral-900 px-2 py-1 text-sm" value={ev.chapterNumber} onChange={(e) => set("timeline", bible.timeline.map((x, j) => (j === i ? { ...x, chapterNumber: Number(e.target.value) } : x)))}>
                {[1, 2, 3].map((n) => <option key={n} value={n}>{t("bible.chShort", { n })}</option>)}
              </select>
              <div className="flex-1"><Field label={t("bible.event")} value={ev.event} onChange={(v) => set("timeline", bible.timeline.map((x, j) => (j === i ? { ...x, event: v } : x)))} /></div>
              <button type="button" className={small} onClick={() => set("timeline", bible.timeline.filter((_, j) => j !== i))}>{t("bible.remove")}</button>
            </div>
          ))}
          <button type="button" className={small} onClick={() => set("timeline", [...bible.timeline, { chapterNumber: 1, event: "" }])}>{t("bible.addEvent")}</button>
        </fieldset>

        <fieldset className="space-y-2 rounded border border-neutral-800 p-3">
          <legend className="px-1 text-sm font-medium">{t("bible.beatSheet")}</legend>
          {bible.beatSheet.map((b, i) => (
            <div key={b.chapterNumber} className="space-y-2 border-b border-neutral-800 pb-3">
              <p className="text-sm font-medium">{t("bible.beatChapter", { n: b.chapterNumber })}</p>
              <Field label={t("bible.beatTitle")} value={b.title} onChange={(v) => setBeat(i, { title: v })} />
              <Field label={t("bible.premise")} area value={b.premise} onChange={(v) => setBeat(i, { premise: v })} />
              <div className="flex flex-wrap gap-3 text-sm">
                {bible.characters.map((c) => (
                  <label key={c.id} className="flex items-center gap-1">
                    {c.name || c.id}
                    <select className="rounded bg-neutral-900 px-1" value={b.characterStates[c.id] ?? "alive"} onChange={(e) => setBeat(i, { characterStates: { ...b.characterStates, [c.id]: e.target.value as CharacterStatus } })}>
                      {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </fieldset>
      </fieldset>
    </section>
  );
}
