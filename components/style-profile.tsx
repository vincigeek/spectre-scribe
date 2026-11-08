"use client";
/** Read-only style profile with definitions (REQ-04, REQ-16b; T-09). */
import { useI18n, type MessageKey } from "@/lib/i18n";
import type { StyleProfile } from "@/lib/style-profile";

const fmt = (n: number, d = 2) => (Number.isInteger(n) ? String(n) : n.toFixed(d));

export function StyleProfileView({ profile, notice }: { profile: StyleProfile; notice?: string | null }) {
  const { t } = useI18n();
  const u = t(`unit.${profile.lengthUnit}`);
  const rows: Array<[MessageKey, string, string]> = [
    ["m.sentMean", `${fmt(profile.sentenceLenMean)} ${u}`, t("m.sentMean.d")],
    ["m.sentSD", fmt(profile.sentenceLenSD), t("m.sentSD.d")],
    ["m.ttr", fmt(profile.typeTokenRatio, 3), t("m.ttr.d")],
    ["m.dialogue", fmt(profile.dialogueRatio, 3), t("m.dialogue.d")],
    ["m.dash", fmt(profile.pacingMarkers.emDash), t("m.dash.d", { unit: u })],
    ["m.ellipsis", fmt(profile.pacingMarkers.ellipsis), t("m.ellipsis.d", { unit: u })],
    ["m.final", fmt(profile.pacingMarkers.sentenceFinal), t("m.final.d", { unit: u })],
    ["m.paraMean", `${fmt(profile.paraLenMean)} ${u}`, t("m.paraMean.d")],
    ["m.paraSD", fmt(profile.paraLenSD), t("m.paraSD.d")],
    ["m.wordLen", fmt(profile.avgWordLen), t(profile.language === "zh" ? "m.wordLen.d.zh" : "m.wordLen.d.en")],
  ];
  return (
    <section aria-labelledby="profile-h" className="space-y-3">
      <h2 id="profile-h" className="text-lg font-semibold">{t("profile.title")}</h2>
      <p className="text-sm text-neutral-400">
        {t("profile.line", { lang: t(`lang.${profile.language}`), unit: u })}
        {profile.segmentation === "char" && t("profile.approx")}
      </p>
      {notice === "unsupported-language" && <p className="text-sm text-amber-400">{t("profile.unsupported")}</p>}
      <table className="w-full text-left text-sm">
        <thead className="text-neutral-400">
          <tr><th className="py-1">{t("profile.metric")}</th><th>{t("profile.value")}</th><th>{t("profile.definition")}</th></tr>
        </thead>
        <tbody>
          {rows.map(([name, value, def]) => (
            <tr key={name} className="border-t border-neutral-800">
              <td className="py-1 pr-3">{t(name)}</td>
              <td className="pr-3 font-mono">{value}</td>
              <td className="text-neutral-400">{def}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-neutral-500">{t("profile.disclaimer")}</p>
    </section>
  );
}
