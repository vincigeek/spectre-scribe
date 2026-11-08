"use client";
/** Style profile as a metric card grid (REQ-04, REQ-16b; ux.md §2). */
import { useI18n, type MessageKey } from "@/lib/i18n";
import type { StyleProfile } from "@/lib/style-profile";
import { Section } from "./ui";

const fmt = (n: number, d = 2) => (Number.isInteger(n) ? String(n) : n.toFixed(d));

function Card({ name, value, def, wide, children }: { name: string; value?: string; def: string; wide?: boolean; children?: React.ReactNode }) {
  return (
    <div className={`px-frame flex flex-col gap-2 p-4 ${wide ? "sm:col-span-2" : ""}`}>
      <span className="label-pixel text-[0.7rem] text-muted">{name}</span>
      {value && <span className="font-mono text-2xl text-signal">{value}</span>}
      {children}
      <span className="mt-auto text-xs leading-snug text-muted">{def}</span>
    </div>
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
        <span className="font-mono text-xs text-muted">
          {t("profile.line", { lang: t(`lang.${profile.language}`), unit: u })}
          {profile.segmentation === "char" && t("profile.approx")}
        </span>
      }
    >
      {notice === "unsupported-language" && <p className="text-sm text-amber">⚠ {t("profile.unsupported")}</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {simple.slice(0, 4).map(([k, v, d]) => <Card key={k} name={t(k)} value={v} def={d} />)}
        <Card name={t("m.pacing")} def={t("m.pacing.d", { unit: u })} wide>
          <dl className="grid grid-cols-3 gap-2 font-mono">
            {pacing.map(([k, v]) => (
              <div key={k}>
                <dt className="text-[0.7rem] text-muted">{t(k).split(/[:：]\s*/)[1]}</dt>
                <dd className="text-xl text-signal">{fmt(v)}</dd>
              </div>
            ))}
          </dl>
        </Card>
        {simple.slice(4).map(([k, v, d]) => <Card key={k} name={t(k)} value={v} def={d} />)}
      </div>
      <p className="text-xs text-muted">{t("profile.disclaimer")}</p>
    </Section>
  );
}
