"use client";
/** Draft the bible from a seed in two layers (REQ-30, REQ-31; T-11b). */
import { useId, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { postJson } from "@/lib/client-api";
import { useI18n, type MessageKey } from "@/lib/i18n";
import type { StoryBible } from "@/lib/story-bible";
import type { StyleProfile } from "@/lib/style-profile";
import { Panel } from "./console";

type Core = Pick<StoryBible, "logline" | "synopsis" | "setting" | "characters">;
type Structure = Pick<StoryBible, "foreshadowing" | "timeline" | "beatSheet">;
type Layer = "core" | "structure";
const MAX_TRIES = 4; // first attempt + 3 retries
const LOCALISED = new Set(["access-required", "rate-limited", "live-unavailable", "config-missing", "model-refusal", "schema-mismatch"]);

type Props = {
  profile: StyleProfile;
  bible: StoryBible;
  onApply: (next: StoryBible, undo: StoryBible) => void;
  onRefused: (code: string) => void;
};

export function DraftFromSeed({ profile, bible, onApply, onRefused }: Props) {
  const { t } = useI18n();
  const id = useId();
  const [seed, setSeed] = useState({ genre: bible.genre, tone: bible.tone, idea: "", notes: "" });
  const [preview, setPreview] = useState<{ layer: Layer; draft: Core | Structure } | null>(null);
  const [coreAccepted, setCoreAccepted] = useState<Core | null>(null);
  const [tries, setTries] = useState<Record<Layer, number>>({ core: 0, structure: 0 });
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<{ message: string; issues?: string[] } | null>(null);

  async function draft(layer: Layer) {
    if (tries[layer] >= MAX_TRIES) return;
    setBusy(true);
    setError(null);
    setTries((x) => ({ ...x, [layer]: x[layer] + 1 }));
    const r = await postJson<{ layer: Layer; draft: Core | Structure }>("/api/bible/draft", {
      layer,
      seed: { genre: seed.genre, tone: seed.tone, idea: seed.idea, ...(seed.notes.trim() ? { notes: seed.notes } : {}) },
      styleProfile: profile,
      ...(layer === "structure" ? { core: coreAccepted } : {}),
    });
    setBusy(false);
    if (!r.ok) {
      if (["access-required", "rate-limited", "live-unavailable"].includes(r.error.code)) onRefused(r.error.code);
      return setError({ message: LOCALISED.has(r.error.code) ? t(`err.${r.error.code}` as MessageKey) : r.error.message, issues: r.error.issues });
    }
    setPreview(r.data);
  }

  function apply() {
    if (!preview) return;
    onApply({ ...bible, genre: seed.genre, tone: seed.tone, ...preview.draft }, bible);
    if (preview.layer === "core") setCoreAccepted(preview.draft as Core);
    setPreview(null);
    setConfirmOpen(false);
  }
  function accept() {
    if (!preview) return;
    const hasText = preview.layer === "core" ? Boolean(bible.logline || bible.synopsis || bible.characters.length) : Boolean(bible.foreshadowing.length || bible.timeline.length);
    if (hasText) setConfirmOpen(true);
    else apply();
  }

  const left = (l: Layer) => MAX_TRIES - tries[l];
  return (
    <Panel tone="signal" className="space-y-4">
      <section aria-labelledby={`${id}-h`} className="space-y-4">
        <h3 id={`${id}-h`} className="label-pixel text-sm text-signal">{t("seed.title")}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor={`${id}-g`}>{t("bible.genre")}</Label><Input id={`${id}-g`} className="border-2" value={seed.genre} onChange={(e) => setSeed({ ...seed, genre: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor={`${id}-t`}>{t("bible.tone")}</Label><Input id={`${id}-t`} className="border-2" value={seed.tone} onChange={(e) => setSeed({ ...seed, tone: e.target.value })} /></div>
        </div>
        <div className="space-y-1.5"><Label htmlFor={`${id}-i`}>{t("seed.idea")}</Label><Textarea id={`${id}-i`} className="border-2" rows={2} value={seed.idea} onChange={(e) => setSeed({ ...seed, idea: e.target.value })} /></div>
        <div className="space-y-1.5"><Label htmlFor={`${id}-n`}>{t("seed.notes")}</Label><Textarea id={`${id}-n`} className="border-2" rows={2} value={seed.notes} onChange={(e) => setSeed({ ...seed, notes: e.target.value })} /></div>
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={busy || !seed.genre || !seed.tone || !seed.idea || left("core") <= 0} onClick={() => void draft("core")}>
            {tries.core ? t("seed.redraftCore", { n: left("core") }) : t("seed.draftCore")}
          </Button>
          <Button variant="secondary" disabled={busy || !coreAccepted || left("structure") <= 0} onClick={() => void draft("structure")}>
            {tries.structure ? t("seed.redraftStructure", { n: left("structure") }) : t("seed.draftStructure")}
          </Button>
          {busy && <span role="status" className="blink-cursor font-mono text-xs text-amber">{t("seed.drafting")}</span>}
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>
              ✕ {error.message}
              {error.issues && <ul className="mt-1 list-disc pl-5">{error.issues.map((i, k) => <li key={k}>{i}</li>)}</ul>}
            </AlertDescription>
          </Alert>
        )}
        {preview && (
          <Panel tone="amber" className="space-y-3">
            <p className="label-pixel text-xs text-amber">{t("seed.preview")}</p>
            <pre className="max-h-64 overflow-auto font-mono text-xs whitespace-pre-wrap text-foreground">{JSON.stringify(preview.draft, null, 2)}</pre>
            <div className="flex gap-2">
              <Button onClick={accept}>{t(preview.layer === "core" ? "seed.accept.core" : "seed.accept.structure")}</Button>
              <Button variant="ghost" onClick={() => setPreview(null)}>{t("seed.discard")}</Button>
            </div>
          </Panel>
        )}
      </section>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("seed.replaceTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("seed.replaceConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("dialog.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={apply}>{t("dialog.confirm")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Panel>
  );
}
