"use client";
/** Sample input panel (REQ-01, REQ-02, REQ-25; T-09). */
import { useId, useMemo, useState } from "react";
import { postJson } from "@/lib/client-api";
import { useI18n } from "@/lib/i18n";
import type { StyleProfile } from "@/lib/style-profile";
import { analysisLanguage, countUnits, detectLanguage, LANGUAGE_LIMITS, type Language } from "@/lib/text-units";

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
    <section aria-labelledby={`${id}-h`} className="space-y-3">
      <h2 id={`${id}-h`} className="text-lg font-semibold">{t("sample.title")}</h2>
      <p className="text-sm text-neutral-400">{t("sample.intro", { min: limits.minSample, unit })}</p>
      <label htmlFor={`${id}-t`} className="sr-only">{t("sample.text")}</label>
      <textarea
        id={`${id}-t`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={10}
        disabled={disabled}
        aria-describedby={`${id}-c ${error ? `${id}-e` : ""}`}
        className="w-full rounded border border-neutral-700 bg-neutral-900 p-3 font-mono text-sm"
      />
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="cursor-pointer rounded border border-neutral-600 px-3 py-1">
          {t("sample.import")}
          <input type="file" accept=".txt,text/plain" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} disabled={disabled} />
        </label>
        <span id={`${id}-c`} className={enough ? "text-emerald-400" : "text-neutral-400"}>
          {units} / {limits.minSample} {unit}
        </span>
        <label className="flex items-center gap-2">
          {t("sample.language")}
          <select value={override} onChange={(e) => setOverride(e.target.value as Language | "")} className="rounded bg-neutral-900 px-2 py-1" disabled={disabled}>
            <option value="">{t("sample.auto", { lang: t(`lang.${detected}`) })}</option>
            <option value="en">{t("lang.en")}</option>
            <option value="zh">{t("lang.zh")}</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => void analyse()}
          disabled={disabled || busy || !enough}
          className="rounded bg-emerald-600 px-4 py-1 font-medium text-white disabled:opacity-40"
        >
          {busy ? t("sample.analysing") : t("sample.analyse")}
        </button>
      </div>
      {detected === "other" && text.trim() && !override && (
        <p role="status" className="text-sm text-amber-400">{t("sample.unsupported")}</p>
      )}
      {error && <p id={`${id}-e`} role="alert" className="text-sm text-red-400">{error}</p>}
    </section>
  );
}
