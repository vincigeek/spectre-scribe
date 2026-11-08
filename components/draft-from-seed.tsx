"use client";
/** Draft the bible from a seed in two layers (REQ-30, REQ-31; T-11b). */
import { useState } from "react";
import { postJson } from "@/lib/client-api";
import type { StoryBible } from "@/lib/story-bible";
import type { StyleProfile } from "@/lib/style-profile";

type Core = Pick<StoryBible, "logline" | "synopsis" | "setting" | "characters">;
type Structure = Pick<StoryBible, "foreshadowing" | "timeline" | "beatSheet">;
type Layer = "core" | "structure";
const MAX_TRIES = 4; // first attempt + 3 retries

type Props = {
  profile: StyleProfile;
  bible: StoryBible;
  onApply: (next: StoryBible, undo: StoryBible) => void;
  onRefused: (code: string) => void;
};

const input = "w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm";

export function DraftFromSeed({ profile, bible, onApply, onRefused }: Props) {
  const [seed, setSeed] = useState({ genre: bible.genre, tone: bible.tone, idea: "", notes: "" });
  const [preview, setPreview] = useState<{ layer: Layer; draft: Core | Structure } | null>(null);
  const [coreAccepted, setCoreAccepted] = useState<Core | null>(null);
  const [tries, setTries] = useState<Record<Layer, number>>({ core: 0, structure: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; issues?: string[] } | null>(null);

  async function draft(layer: Layer) {
    if (tries[layer] >= MAX_TRIES) return;
    setBusy(true);
    setError(null);
    setTries((t) => ({ ...t, [layer]: t[layer] + 1 }));
    const r = await postJson<{ layer: Layer; draft: Core | Structure }>("/api/bible/draft", {
      layer,
      seed: { genre: seed.genre, tone: seed.tone, idea: seed.idea, ...(seed.notes.trim() ? { notes: seed.notes } : {}) },
      styleProfile: profile,
      ...(layer === "structure" ? { core: coreAccepted } : {}),
    });
    setBusy(false);
    if (!r.ok) {
      if (["access-required", "rate-limited", "live-unavailable"].includes(r.error.code)) onRefused(r.error.code);
      return setError({ message: r.error.message, issues: r.error.issues });
    }
    setPreview(r.data);
  }

  function accept() {
    if (!preview) return;
    const hasText = preview.layer === "core" ? Boolean(bible.logline || bible.synopsis || bible.characters.length) : Boolean(bible.foreshadowing.length || bible.timeline.length);
    if (hasText && !window.confirm("Replace the fields you already filled in? You can undo once.")) return;
    const next: StoryBible = { ...bible, genre: seed.genre, tone: seed.tone, ...preview.draft };
    onApply(next, bible);
    if (preview.layer === "core") setCoreAccepted(preview.draft as Core);
    setPreview(null);
  }

  const left = (l: Layer) => MAX_TRIES - tries[l];
  return (
    <section aria-labelledby="seed-h" className="space-y-3 rounded border border-neutral-800 p-3">
      <h3 id="seed-h" className="font-medium">Draft from a seed</h3>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-sm">Genre<input className={input} value={seed.genre} onChange={(e) => setSeed({ ...seed, genre: e.target.value })} /></label>
        <label className="text-sm">Tone<input className={input} value={seed.tone} onChange={(e) => setSeed({ ...seed, tone: e.target.value })} /></label>
      </div>
      <label className="block text-sm">Idea (at most two sentences)<textarea className={input} rows={2} value={seed.idea} onChange={(e) => setSeed({ ...seed, idea: e.target.value })} /></label>
      <label className="block text-sm">Notes (optional)<textarea className={input} rows={2} value={seed.notes} onChange={(e) => setSeed({ ...seed, notes: e.target.value })} /></label>
      <div className="flex flex-wrap gap-2 text-sm">
        <button type="button" className="rounded bg-sky-700 px-3 py-1 text-white disabled:opacity-40" disabled={busy || !seed.genre || !seed.tone || !seed.idea || left("core") <= 0} onClick={() => void draft("core")}>
          {tries.core ? `Redraft core (${left("core")} left)` : "Draft core"}
        </button>
        <button type="button" className="rounded bg-sky-700 px-3 py-1 text-white disabled:opacity-40" disabled={busy || !coreAccepted || left("structure") <= 0} onClick={() => void draft("structure")}>
          {tries.structure ? `Redraft structure (${left("structure")} left)` : "Draft structure"}
        </button>
        {busy && <span role="status" className="text-neutral-400">Drafting…</span>}
      </div>
      {error && (
        <div role="alert" className="text-sm text-red-400">
          {error.message}
          {error.issues && <ul className="list-disc pl-5 text-xs">{error.issues.map((i, k) => <li key={k}>{i}</li>)}</ul>}
        </div>
      )}
      {preview && (
        <div className="space-y-2 rounded border border-sky-800 bg-sky-950/30 p-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-300">Draft — not in your bible</p>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(preview.draft, null, 2)}</pre>
          <div className="flex gap-2">
            <button type="button" className="rounded bg-emerald-600 px-3 py-1 text-sm text-white" onClick={accept}>Accept {preview.layer}</button>
            <button type="button" className="rounded border border-neutral-600 px-3 py-1 text-sm" onClick={() => setPreview(null)}>Discard</button>
          </div>
        </div>
      )}
    </section>
  );
}
