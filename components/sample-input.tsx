"use client";
/** Page 1 — sample input (REQ-01, REQ-02, REQ-25; ux.md §1; T-09). */
import { useId, useMemo, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { postJson } from "@/lib/client-api";
import { useI18n } from "@/lib/i18n";
import type { StyleProfile } from "@/lib/style-profile";
import { analysisLanguage, countUnits, detectLanguage, LANGUAGE_LIMITS, type Language } from "@/lib/text-units";
import { Panel, Section } from "./console";

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
      <Panel className="space-y-4">
        <Label htmlFor={`${id}-t`} className="sr-only">{t("sample.text")}</Label>
        <Textarea
          id={`${id}-t`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={12}
          disabled={disabled}
          aria-describedby={`${id}-c ${error ? `${id}-e` : ""}`}
          className="min-h-64 border-2 font-mono text-sm leading-relaxed"
        />
        <Progress value={pct} aria-label={`${units} / ${limits.minSample} ${unit}`} className={enough ? "[&>*]:bg-signal" : "[&>*]:bg-amber"} />
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" size="sm" asChild disabled={disabled}>
            <label className="cursor-pointer">
              {t("sample.import")}
              <input type="file" accept=".txt,text/plain" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} disabled={disabled} />
            </label>
          </Button>
          <span id={`${id}-c`} className={`font-mono text-sm ${enough ? "text-signal" : "text-muted-foreground"}`}>
            {enough ? "✓" : "…"} {units} / {limits.minSample} {unit}
          </span>
          <Label className="gap-2 text-muted-foreground">
            {t("sample.language")}
            <NativeSelect size="sm" value={override} onChange={(e) => setOverride(e.target.value as Language | "")} disabled={disabled}>
              <NativeSelectOption value="">{t("sample.auto", { lang: t(`lang.${detected}`) })}</NativeSelectOption>
              <NativeSelectOption value="en">{t("lang.en")}</NativeSelectOption>
              <NativeSelectOption value="zh">{t("lang.zh")}</NativeSelectOption>
            </NativeSelect>
          </Label>
          <Button size="lg" className="px-corners-sm ml-auto" onClick={() => void analyse()} disabled={disabled || busy || !enough}>
            {busy ? t("sample.analysing") : t("sample.analyse")}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{t("sample.subtitle")}</p>
        {detected === "other" && text.trim() && !override && (
          <Alert className="border-amber-dim text-amber"><AlertDescription className="text-amber">⚠ {t("sample.unsupported")}</AlertDescription></Alert>
        )}
        {error && (
          <Alert variant="destructive" role="alert" id={`${id}-e`}><AlertDescription>✕ {error}</AlertDescription></Alert>
        )}
      </Panel>
    </Section>
  );
}
