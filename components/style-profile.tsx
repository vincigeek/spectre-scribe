"use client";
/** Read-only style profile with definitions (REQ-04, REQ-16b; T-09). */
import type { StyleProfile } from "@/lib/style-profile";

const fmt = (n: number, d = 2) => (Number.isInteger(n) ? String(n) : n.toFixed(d));

export function StyleProfileView({ profile, notice }: { profile: StyleProfile; notice?: string | null }) {
  const u = profile.lengthUnit === "char" ? "字" : "words";
  const rows: Array<[string, string, string]> = [
    ["Sentence length mean", `${fmt(profile.sentenceLenMean)} ${u}`, "Mean length of each sentence."],
    ["Sentence length SD", fmt(profile.sentenceLenSD), "Population standard deviation of sentence lengths."],
    ["Vocabulary richness", fmt(profile.typeTokenRatio, 3), "Unique tokens divided by all tokens."],
    ["Dialogue ratio", fmt(profile.dialogueRatio, 3), "Share of text inside paired quotation marks."],
    ["Pacing: em-dash", fmt(profile.pacingMarkers.emDash), `Dash runs per 100 ${u}.`],
    ["Pacing: ellipsis", fmt(profile.pacingMarkers.ellipsis), `Ellipsis runs per 100 ${u}.`],
    ["Pacing: sentence end", fmt(profile.pacingMarkers.sentenceFinal), `Sentence-final marks per 100 ${u}.`],
    ["Paragraph length mean", `${fmt(profile.paraLenMean)} ${u}`, "Mean length of each paragraph."],
    ["Paragraph length SD", fmt(profile.paraLenSD), "Population standard deviation of paragraph lengths."],
    ["Average word length", fmt(profile.avgWordLen), profile.language === "zh" ? "字 per word, stopwords excluded." : "Letters per word, stopwords excluded."],
  ];
  return (
    <section aria-labelledby="profile-h" className="space-y-3">
      <h2 id="profile-h" className="text-lg font-semibold">02 / Style profile</h2>
      <p className="text-sm text-neutral-400">
        Language: {profile.language === "zh" ? "中文" : "English"} · unit: {u}
        {profile.segmentation === "char" && " · vocabulary metrics are approximate (no word segmenter)"}
      </p>
      {notice === "unsupported-language" && <p className="text-sm text-amber-400">Results are reliable only for English and Chinese.</p>}
      <table className="w-full text-left text-sm">
        <thead className="text-neutral-400">
          <tr><th className="py-1">Metric</th><th>Value</th><th>Definition</th></tr>
        </thead>
        <tbody>
          {rows.map(([name, value, def]) => (
            <tr key={name} className="border-t border-neutral-800">
              <td className="py-1 pr-3">{name}</td>
              <td className="pr-3 font-mono">{value}</td>
              <td className="text-neutral-400">{def}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-neutral-500">These numbers describe the sample. They do not prove literary quality.</p>
    </section>
  );
}
