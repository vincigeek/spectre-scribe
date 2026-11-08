"use client";
/** Sample input panel (REQ-01, REQ-02, REQ-25; ux.md §1; T-09). */
import { useId, useMemo, useState } from "react";
import { postJson } from "@/lib/client-api";
import { useI18n } from "@/lib/i18n";
import type { StyleProfile } from "@/lib/style-profile";
import { analysisLanguage, countUnits, detectLanguage, LANGUAGE_LIMITS, type Language } from "@/lib/text-units";
import { Panel, Section } from "./ui";

type Props = { onProfile: (p: StyleProfile, notice: string | null) => void; disabled?: boolean };

export function SampleInput({ onProfile, disabled }: Props) {
  const { t } = useI18n();
  const id = useId();
  const [text, setText] = useState("");
  const [override, setOverride] = useState<Language | "">("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const detected = useMemo(() => detectLanguage(text), [text]);
  const lang: Language = override || analysisLanguage(detected);
  const limits = LANGUAGE_LIMITS[lang];
  const unit = t(`unit.${limits.lengthUnit}`);
  const units = useMemo(() => countUnits(text, lang), [text, lang]);
  const enough = units >= limits.minSample;
  const pct = Math.min(100, Math.round((units / limits.minSample) * 100));

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 256 * 1024) return setError(t("sample.fileTooLarge"));
    setText(await file.text());
    setError(null);
  }

  async function analyse() {
    setBusy(true);
    setError(null);
    const r = await postJson<{ profile: StyleProfile; notice?: string }>("/api/style/analyse", { sampleText: text, ...(override ? { language: override } : {}) });
    setBusy(false);
    if (!r.ok) {
      const code = r.error.code;
      return setError(
        code === "sample-too-short" ? t("err.sample-too-short", { units, unit, min: limits.minSample })
        : code === "empty-sample" ? t("err.empty-sample")
        : r.error.message,
      );
    }
    onProfile(r.data.profile, r.data.notice ?? null);
  }

  return (
    <Section id="sample" number="01" title={t("sample.title").replace(/^\d+ \/ /, "")} subtitle={t("sample.intro", { min: limits.minSample, unit })}>
      <Panel className="space-y-3">
        <label htmlFor={`${id}-t`} className="sr-only">{t("sample.text")}</label>
        <textarea
          id={`${id}-t`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          disabled={disabled}
          aria-describedby={`${id}-c ${error ? `${id}-e` : ""}`}
          className="field min-h-60 font-mono"
        />
        <div className="h-1 w-full bg-line" aria-hidden>
          <div className={`h-1 ${enough ? "bg-signal" : "bg-amber"}`} style={{ width: `${pct}%` }} />
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="btn btn-ghost btn-sm cursor-pointer">
            {t("sample.import")}
            <input type="file" accept=".txt,text/plain" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} disabled={disabled} />
          </label>
          <span id={`${id}-c`} className={`font-mono ${enough ? "text-signal" : "text-muted"}`}>
            {enough ? "✓" : "…"} {units} / {limits.minSample} {unit}
          </span>
          <label className="flex items-center gap-2 text-muted">
            {t("sample.language")}
            <select value={override} onChange={(e) => setOverride(e.target.value as Language | "")} className="field" disabled={disabled}>
              <option value="">{t("sample.auto", { lang: t(`lang.${detected}`) })}</option>
              <option value="en">{t("lang.en")}</option>
              <option value="zh">{t("lang.zh")}</option>
            </select>
          </label>
          <button type="button" onClick={() => void analyse()} disabled={disabled || busy || !enough} className="btn btn-primary ml-auto">
            {busy ? t("sample.analysing") : t("sample.analyse")}
          </button>
        </div>
        <p className="text-xs text-muted">{t("sample.subtitle")}</p>
        {detected === "other" && text.trim() && !override && (
          <p role="status" className="text-sm text-amber">⚠ {t("sample.unsupported")}</p>
        )}
        {error && <p id={`${id}-e`} role="alert" className="text-sm text-veto">✕ {error}</p>}
      </Panel>
    </Section>
  );
}
