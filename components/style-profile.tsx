"use client";
/** Page 2 — style profile as a metric card grid (REQ-04, REQ-16b; ux.md §2). */
import type { ReactNode } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CardDescription, CardTitle } from "@/components/ui/card";
import { useI18n, type MessageKey } from "@/lib/i18n";
import type { StyleProfile } from "@/lib/style-profile";
import { Panel, Section } from "./console";

const fmt = (n: number, d = 2) => (Number.isInteger(n) ? String(n) : n.toFixed(d));

function Metric({ name, value, def, wide, children }: { name: string; value?: string; def: string; wide?: boolean; children?: ReactNode }) {
  return (
    <Panel className={`flex flex-col gap-2 ${wide ? "sm:col-span-2" : ""}`}>
      <CardTitle className="label-pixel text-[0.7rem] font-normal text-muted-foreground">{name}</CardTitle>
      {value && <span className="font-mono text-2xl text-signal">{value}</span>}
      {children}
      <CardDescription className="mt-auto leading-snug">{def}</CardDescription>
    </Panel>
  );
}

export function StyleProfileView({ profile, notice }: { profile: StyleProfile; notice?: string | null }) {
  const { t } = useI18n();
  const u = t(`unit.${profile.lengthUnit}`);
  const simple: Array<[MessageKey, string, string]> = [
    ["m.sentMean", `${fmt(profile.sentenceLenMean, 1)} ${u}`, t("m.sentMean.d")],
    ["m.sentSD", fmt(profile.sentenceLenSD, 1), t("m.sentSD.d")],
    ["m.ttr", fmt(profile.typeTokenRatio, 3), t("m.ttr.d")],
    ["m.dialogue", `${fmt(profile.dialogueRatio * 100, 1)}%`, t("m.dialogue.d")],
    ["m.paraMean", `${fmt(profile.paraLenMean, 1)} ${u}`, t("m.paraMean.d")],
    ["m.paraSD", fmt(profile.paraLenSD, 1), t("m.paraSD.d")],
    ["m.wordLen", fmt(profile.avgWordLen), t(profile.language === "zh" ? "m.wordLen.d.zh" : "m.wordLen.d.en")],
  ];
  const pacing: Array<[MessageKey, number]> = [
    ["m.dash", profile.pacingMarkers.emDash],
    ["m.ellipsis", profile.pacingMarkers.ellipsis],
    ["m.final", profile.pacingMarkers.sentenceFinal],
  ];
  return (
    <Section
      id="profile"
      number="02"
      title={t("profile.title").replace(/^\d+ \/ /, "")}
      subtitle={t("profile.subtitle")}
      aside={
        <span className="font-mono text-xs text-muted-foreground">
          {t("profile.line", { lang: t(`lang.${profile.language}`), unit: u })}
          {profile.segmentation === "char" && t("profile.approx")}
        </span>
      }
    >
      {notice === "unsupported-language" && (
        <Alert className="border-amber-dim"><AlertDescription className="text-amber">⚠ {t("profile.unsupported")}</AlertDescription></Alert>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {simple.slice(0, 4).map(([k, v, d]) => <Metric key={k} name={t(k)} value={v} def={d} />)}
        <Metric name={t("m.pacing")} def={t("m.pacing.d", { unit: u })} wide>
          <dl className="grid grid-cols-3 gap-2 font-mono">
            {pacing.map(([k, v]) => (
              <div key={k}>
                <dt className="text-[0.7rem] text-muted-foreground">{t(k).split(/[:：]\s*/)[1]}</dt>
                <dd className="text-xl text-signal">{fmt(v)}</dd>
              </div>
            ))}
          </dl>
        </Metric>
        {simple.slice(4).map(([k, v, d]) => <Metric key={k} name={t(k)} value={v} def={d} />)}
      </div>
      <p className="text-xs text-muted-foreground">{t("profile.disclaimer")}</p>
    </Section>
  );
}
