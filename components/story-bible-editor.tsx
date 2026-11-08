"use client";
/** Page 3 — story bible editor for every REQ-06 field (REQ-07, REQ-16c; ux.md §3; T-10). */
import { useId, useMemo, type ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { bibleJson, safeFileName, triggerDownload } from "@/lib/downloads";
import { useI18n } from "@/lib/i18n";
import {
  parseStoryBible,
  type BeatSheetEntry,
  type Character,
  type CharacterStatus,
  type ForeshadowingEntry,
  type StoryBible,
} from "@/lib/story-bible";
import { countUnits, LANGUAGE_LIMITS, splitSentences, type Language } from "@/lib/text-units";
import { Panel, Section } from "./console";

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

function Field({ label, value, onChange, area, hint }: { label: string; value: string; onChange: (v: string) => void; area?: boolean; hint?: string }) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="flex flex-wrap items-baseline gap-x-2 text-sm text-foreground">
        {label}
        {hint && <span className="font-mono text-xs font-normal text-muted-foreground">{hint}</span>}
      </Label>
      {area
        ? <Textarea id={id} rows={3} value={value} onChange={(e) => onChange(e.target.value)} className="border-2 text-sm" />
        : <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} className="border-2 text-sm" />}
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Panel className="space-y-3">
      <fieldset className="min-w-0 space-y-3">
        <legend className="label-pixel mb-1 text-xs text-signal">{title}</legend>
        {children}
      </fieldset>
    </Panel>
  );
}

function StringList({ label, items, onChange }: { label: string; items: string[]; onChange: (v: string[]) => void }) {
  const { t } = useI18n();
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-sm text-foreground">{label}</legend>
      {items.map((v, i) => (
        <div key={i} className="flex gap-2">
          <Input aria-label={`${label} ${i + 1}`} value={v} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} className="border-2 text-sm" />
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(items.filter((_, j) => j !== i))}>{t("bible.remove")}</Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...items, ""])}>+ {t("bible.add")}</Button>
    </fieldset>
  );
}

const STATUSES: CharacterStatus[] = ["alive", "dead", "unknown"];

type Props = { bible: StoryBible; language: Language; onChange: (b: StoryBible) => void; readOnly?: boolean; footer?: ReactNode };

export function StoryBibleEditor({ bible, language, onChange, readOnly, footer }: Props) {
  const { t } = useI18n();
  const limits = LANGUAGE_LIMITS[language];
  const unit = t(`unit.${limits.lengthUnit}`);
  const validation = useMemo(() => parseStoryBible(bible, language), [bible, language]);
  const set = <K extends keyof StoryBible>(k: K, v: StoryBible[K]) => onChange({ ...bible, [k]: v });
  const setChar = (i: number, c: Partial<Character>) => set("characters", bible.characters.map((x, j) => (j === i ? { ...x, ...c } : x)));
  const setFs = (i: number, f: Partial<ForeshadowingEntry>) => set("foreshadowing", bible.foreshadowing.map((x, j) => (j === i ? { ...x, ...f } : x)));
  const setBeat = (i: number, b: Partial<BeatSheetEntry>) => set("beatSheet", bible.beatSheet.map((x, j) => (j === i ? { ...x, ...b } : x)));
  const sentences = bible.synopsis.trim() ? splitSentences(bible.synopsis, language).length : 0;

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
    <Section
      id="bible"
      number="03"
      title={t("bible.title").replace(/^\d+ \/ /, "")}
      subtitle={t("bible.subtitle")}
      aside={<Button variant="outline" size="sm" onClick={() => triggerDownload(safeFileName(bible.logline || "story-bible", "json"), bibleJson(bible), "application/json")}>{t("bible.download")}</Button>}
    >
      {validation.ok ? (
        <Alert className="border-signal-dim"><AlertDescription className="text-signal">✓ {t("bible.ready")}</AlertDescription></Alert>
      ) : (
        <Alert role="status" className="border-amber-dim">
          <AlertTitle className="text-amber">⚠ {t("bible.issues", { n: validation.issues.length })}</AlertTitle>
          <AlertDescription>
            <ul className="list-disc space-y-0.5 pl-5 text-amber/90">
              {validation.issues.slice(0, 12).map((i, k) => <li key={k}><code className="font-mono">{i.path || "bible"}</code>: {i.message}</li>)}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <fieldset disabled={readOnly} className="grid min-w-0 gap-4 lg:grid-cols-2">
        <Group title={t("bible.basics")}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("bible.genre")} value={bible.genre} onChange={(v) => set("genre", v)} />
            <Field label={t("bible.tone")} value={bible.tone} onChange={(v) => set("tone", v)} />
          </div>
          <Field label={t("bible.logline")} hint={t("bible.loglineHint", { n: countUnits(bible.logline, language), max: limits.loglineMax, unit })} value={bible.logline} onChange={(v) => set("logline", v)} />
          <Field label={t("bible.synopsis")} hint={`${t("bible.sentences", { n: sentences })} · ${t("bible.synopsisHint")}`} area value={bible.synopsis} onChange={(v) => set("synopsis", v)} />
        </Group>

        <Group title={t("bible.setting")}>
          <Field label={t("bible.timePeriod")} value={bible.setting.timePeriod} onChange={(v) => set("setting", { ...bible.setting, timePeriod: v })} />
          <StringList label={t("bible.locations")} items={bible.setting.locations} onChange={(v) => set("setting", { ...bible.setting, locations: v })} />
          <StringList label={t("bible.worldRules")} items={bible.setting.worldRules} onChange={(v) => set("setting", { ...bible.setting, worldRules: v })} />
        </Group>

        <div className="lg:col-span-2">
          <Group title={t("bible.characters")}>
            <div className="grid gap-4 md:grid-cols-2">
              {bible.characters.map((c, i) => (
                <div key={c.id} className="space-y-3 border-2 border-dashed border-line p-3">
                  <div className="flex flex-wrap items-end gap-2">
                    <code className="font-mono text-xs text-muted-foreground">{c.id}</code>
                    <div className="min-w-32 flex-1"><Field label={t("bible.name")} value={c.name} onChange={(v) => setChar(i, { name: v })} /></div>
                    <Label className="flex-col items-start gap-1.5 text-sm">
                      {t("bible.role")}
                      <NativeSelect size="sm" value={c.role} onChange={(e) => setChar(i, { role: e.target.value as Character["role"] })}>
                        <NativeSelectOption value="protagonist">protagonist</NativeSelectOption>
                        <NativeSelectOption value="antagonist">antagonist</NativeSelectOption>
                        <NativeSelectOption value="supporting">supporting</NativeSelectOption>
                      </NativeSelect>
                    </Label>
                    <Button type="button" variant="ghost" size="sm" className="text-veto" onClick={() => removeCharacter(i)}>{t("bible.remove")}</Button>
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
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addCharacter}>+ {t("bible.addCharacter")}</Button>
          </Group>
        </div>

        <Group title={t("bible.foreshadowing")}>
          {bible.foreshadowing.map((f, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2">
              <code className="font-mono text-xs text-muted-foreground">{f.id}</code>
              <div className="min-w-40 flex-1"><Field label={t("bible.itemDescription")} value={f.description} onChange={(v) => setFs(i, { description: v })} /></div>
              <NativeSelect size="sm" aria-label={t("bible.status")} value={f.status} onChange={(e) => {
                const status = e.target.value as ForeshadowingEntry["status"];
                const { deferredToChapter: _d, ...rest } = f;
                setFs(i, status === "deferred" ? { status, deferredToChapter: 2 } : { ...rest, status, deferredToChapter: undefined });
              }}>
                <NativeSelectOption value="open">open</NativeSelectOption>
                <NativeSelectOption value="paidOff">paidOff</NativeSelectOption>
                <NativeSelectOption value="deferred">deferred</NativeSelectOption>
              </NativeSelect>
              {f.status === "deferred" && (
                <NativeSelect size="sm" aria-label={t("bible.deferredTo")} value={f.deferredToChapter ?? 2} onChange={(e) => setFs(i, { deferredToChapter: Number(e.target.value) })}>
                  {[1, 2, 3].map((n) => <NativeSelectOption key={n} value={n}>{t("bible.chapterN", { n })}</NativeSelectOption>)}
                </NativeSelect>
              )}
              <Button type="button" variant="ghost" size="sm" onClick={() => set("foreshadowing", bible.foreshadowing.filter((_, j) => j !== i))}>{t("bible.remove")}</Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => {
            const n = bible.foreshadowing.reduce((m, f) => Math.max(m, Number(/^fs-(\d+)$/.exec(f.id)?.[1] ?? 0)), 0) + 1;
            set("foreshadowing", [...bible.foreshadowing, { id: `fs-${n}`, description: "", status: "open" }]);
          }}>+ {t("bible.addItem")}</Button>
        </Group>

        <Group title={t("bible.timeline")}>
          {bible.timeline.map((ev, i) => (
            <div key={i} className="flex items-end gap-2">
              <NativeSelect size="sm" aria-label={t("bible.chapter")} value={ev.chapterNumber} onChange={(e) => set("timeline", bible.timeline.map((x, j) => (j === i ? { ...x, chapterNumber: Number(e.target.value) } : x)))}>
                {[1, 2, 3].map((n) => <NativeSelectOption key={n} value={n}>{t("bible.chShort", { n })}</NativeSelectOption>)}
              </NativeSelect>
              <div className="flex-1"><Field label={t("bible.event")} value={ev.event} onChange={(v) => set("timeline", bible.timeline.map((x, j) => (j === i ? { ...x, event: v } : x)))} /></div>
              <Button type="button" variant="ghost" size="sm" onClick={() => set("timeline", bible.timeline.filter((_, j) => j !== i))}>{t("bible.remove")}</Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => set("timeline", [...bible.timeline, { chapterNumber: 1, event: "" }])}>+ {t("bible.addEvent")}</Button>
        </Group>

        <div className="lg:col-span-2">
          <Group title={t("bible.beatSheet")}>
            <div className="grid gap-4 md:grid-cols-3">
              {bible.beatSheet.map((b, i) => (
                <div key={b.chapterNumber} className="space-y-3 border-2 border-dashed border-line p-3">
                  <p className="label-pixel text-xs text-amber">{t("bible.beatChapter", { n: b.chapterNumber })}</p>
                  <Field label={t("bible.beatTitle")} value={b.title} onChange={(v) => setBeat(i, { title: v })} />
                  <Field label={t("bible.premise")} area value={b.premise} onChange={(v) => setBeat(i, { premise: v })} />
                  <div className="flex flex-wrap gap-3 text-sm">
                    {bible.characters.map((c) => (
                      <Label key={c.id} className="gap-1.5 font-normal">
                        {c.name || c.id}
                        <NativeSelect size="sm" value={b.characterStates[c.id] ?? "alive"} onChange={(e) => setBeat(i, { characterStates: { ...b.characterStates, [c.id]: e.target.value as CharacterStatus } })}>
                          {STATUSES.map((s) => <NativeSelectOption key={s} value={s}>{s}</NativeSelectOption>)}
                        </NativeSelect>
                      </Label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Group>
        </div>
      </fieldset>
      {footer}
    </Section>
  );
}
