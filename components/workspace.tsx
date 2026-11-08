"use client";
/**
 * Workspace container (T-02, T-04, T-21, T-22, T-33): session state and restore,
 * live pipeline streaming, the access code, the dev replay recorder, and replay.
 */
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { getAccessCode, setAccessCode, streamPipeline } from "@/lib/client-api";
import { LanguageSwitch, useI18n, type MessageKey } from "@/lib/i18n";
import { EMPTY_PASS, passReducer, type PassView } from "@/lib/pass-reducer";
import { MAX_RETRIES, type AcceptedChapter, type RestartPoint, type Session } from "@/lib/pipeline-types";
import { buildReplayFile, createPassRecorder, parseReplayFile, replaySchedule, type ReplayFile, type ReplayPass } from "@/lib/replay";
import { createEmptySession, deriveLedger, restoreSession, serialiseSession, SESSION_STORAGE_KEY } from "@/lib/session";
import { parseStoryBible, type StoryBible } from "@/lib/story-bible";
import type { StyleProfile } from "@/lib/style-profile";
import { ChapterWorkspace } from "./chapter-workspace";
import { DraftFromSeed } from "./draft-from-seed";
import { FinalStory } from "./final-story";
import { SampleInput } from "./sample-input";
import { StoryBibleEditor, emptyBible } from "./story-bible-editor";
import { StyleProfileView } from "./style-profile";
import { safeFileName, triggerDownload } from "@/lib/downloads";

const REFUSALS = new Set(["access-required", "rate-limited", "live-unavailable"]);
const IS_DEV = process.env.NODE_ENV === "development";

type ReplayState = { file: ReplayFile; pass: PassView; chapters: AcceptedChapter[]; speed: 1 | 2; playing: boolean; done: boolean };

export function Workspace() {
  const { t } = useI18n();
  const [session, setSession] = useState<Session>(createEmptySession);
  const [restoreNotice, setRestoreNotice] = useState<string | null>(null);
  const [profileNotice, setProfileNotice] = useState<string | null>(null);
  const [pass, dispatch] = useReducer(passReducer, EMPTY_PASS);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [undo, setUndo] = useState<StoryBible | null>(null);
  const [recorded, setRecorded] = useState<ReplayPass[]>([]);
  const [replay, setReplay] = useState<ReplayState | null>(null);
  const [replayList, setReplayList] = useState<Array<{ name: string; title: string; language: string }>>([]);
  const abortRef = useRef<AbortController | null>(null);
  const timers = useRef<number[]>([]);

  // Restore once, then persist on every change.
  useEffect(() => {
    const r = restoreSession(localStorage.getItem(SESSION_STORAGE_KEY));
    setSession(r.session);
    if (r.notice === "restored") setRestoreNotice(t("top.restored"));
    if (r.notice?.startsWith("discarded")) setRestoreNotice(t("top.restoreDiscarded"));
    setCode(getAccessCode());
    fetch("/replays/index.json").then((res) => (res.ok ? res.json() : [])).then((l) => setReplayList(Array.isArray(l) ? l : [])).catch(() => undefined);
    const q = new URLSearchParams(window.location.search).get("replay");
    if (q) void loadReplay(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const hydrated = useRef(false);
  useEffect(() => {
    if (!hydrated.current) { hydrated.current = true; return; }
    localStorage.setItem(SESSION_STORAGE_KEY, serialiseSession(session));
  }, [session]);

  // Accept a chapter only from the reducer's validated `accepted` value.
  useEffect(() => {
    const ch = pass.accepted;
    if (!ch || !session.bible) return;
    setSession((s) => {
      if (s.acceptedChapters.some((c) => c.chapterNumber === ch.chapterNumber) || !s.bible) return s;
      const acceptedChapters = [...s.acceptedChapters, ch].sort((a, b) => a.chapterNumber - b.chapterNumber);
      return { ...s, acceptedChapters, continuityLedger: deriveLedger(s.bible, acceptedChapters), pipelineStatus: acceptedChapters.length === 3 ? "complete" : "idle" };
    });
  }, [pass.accepted, session.bible]);

  const language = session.styleProfile?.language ?? "en";
  const bible = session.bible ?? emptyBible();
  const bibleValid = session.styleProfile ? parseStoryBible(bible, language).ok : false;
  const nextChapter = session.acceptedChapters.length < 3 ? ((session.acceptedChapters.length + 1) as 1 | 2 | 3) : null;
  const passIsForNext = pass.chapterNumber === nextChapter;
  const retriesUsed = nextChapter ? session.retryCounters[nextChapter] ?? 0 : 0;
  const locked = session.acceptedChapters.length > 0;

  function setProfile(p: StyleProfile, notice: string | null) {
    setProfileNotice(notice);
    setSession((s) => ({ ...s, styleProfile: p, bible: s.bible ?? emptyBible() }));
  }

  const start = useCallback(async (restartAt: RestartPoint) => {
    if (!nextChapter || !session.styleProfile || !session.bible) return;
    const isRetry = passIsForNext && ["vetoed", "failed", "interrupted"].includes(pass.status);
    const retryCount = isRetry ? retriesUsed + 1 : 0;
    if (retryCount > MAX_RETRIES) return;
    if (isRetry) setSession((s) => ({ ...s, retryCounters: { ...s.retryCounters, [nextChapter]: retryCount } }));
    setRefusal(null);
    const ac = new AbortController();
    abortRef.current = ac;
    const runId = crypto.randomUUID();
    const recorder = IS_DEV ? createPassRecorder({ chapterNumber: nextChapter, retryCount, restartPoint: restartAt }) : null;
    const body = {
      runId, chapterNumber: nextChapter, retryCount, restartAt,
      styleProfile: session.styleProfile, bible: session.bible, acceptedChapters: session.acceptedChapters,
      continuityLedger: session.continuityLedger,
      ...(isRetry && pass.continuity?.failures.length ? { vetoNotes: pass.continuity.failures } : {}),
      ...(restartAt === "continuation" && pass.outline && pass.style ? { checkpoints: { outline: pass.outline, style: pass.style } } : {}),
    };
    setSession((s) => ({ ...s, pipelineStatus: "running" }));
    const r = await streamPipeline(body, (event, data) => {
      recorder?.add(event, data);
      dispatch({ type: "event", event, data });
    }, ac.signal);
    if (recorder) setRecorded((p) => [...p, recorder.finish()]);
    if (!r.ok) {
      if (REFUSALS.has(r.error.code)) setRefusal(r.error.code);
      else dispatch({ type: "event", event: "error", data: { code: r.error.code, message: r.error.message, retryable: true } });
      dispatch({ type: "interrupted" });
    }
    setSession((s) => ({ ...s, pipelineStatus: s.acceptedChapters.length === 3 ? "complete" : "awaiting-retry" }));
  }, [nextChapter, session, pass, passIsForNext, retriesUsed]);

  function newSession() {
    if (!window.confirm(t("top.newSessionConfirm"))) return;
    abortRef.current?.abort();
    dispatch({ type: "reset" });
    setRecorded([]);
    setSession(createEmptySession());
  }

  async function downloadReplay() {
    if (!session.styleProfile || !session.bible) return;
    let models = { standard: "unknown", premium: "unknown" };
    try {
      const res = await fetch("/api/dev/replay-meta");
      if (res.ok) models = (await res.json()).models;
    } catch { /* keep unknown */ }
    const b = buildReplayFile({ recordedAt: new Date().toISOString(), appVersion: "0.1.0", language, models, styleProfile: session.styleProfile, bible: session.bible, passes: recorded });
    if (!b.ok) return window.alert(t("top.replaySaveFail", { reason: b.reason }));
    triggerDownload(safeFileName(`replay-${language}-${b.file.recordedAt.slice(0, 10)}`, "json"), JSON.stringify(b.file), "application/json");
  }

  // ---------- replay ----------
  function stopTimers() {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  }
  async function loadReplay(name: string) {
    if (!/^[\w-]{1,64}$/.test(name)) return;
    try {
      const res = await fetch(`/replays/${name}.json`);
      const parsed = parseReplayFile(await res.json());
      if (!parsed.ok) return window.alert(t("top.replayInvalid"));
      play({ file: parsed.file, pass: EMPTY_PASS, chapters: [], speed: 1, playing: true, done: false }, 1);
    } catch {
      window.alert(t("top.replayLoadFail"));
    }
  }
  function play(base: ReplayState, speed: 1 | 2 | "skip") {
    stopTimers();
    const schedule = replaySchedule(base.file, speed);
    let state: ReplayState = { ...base, pass: EMPTY_PASS, chapters: [], speed: speed === "skip" ? base.speed : speed, playing: true, done: false };
    setReplay(state);
    const step = (i: number) => {
      const e = schedule[i]!;
      const pass = passReducer(state.pass, { type: "event", event: e.event, data: e.data });
      const chapters = pass.accepted && !state.chapters.some((c) => c.chapterNumber === pass.accepted!.chapterNumber) ? [...state.chapters, pass.accepted] : state.chapters;
      state = { ...state, pass, chapters, done: i === schedule.length - 1, playing: i !== schedule.length - 1 };
      setReplay(state);
    };
    if (speed === "skip") schedule.forEach((_, i) => step(i));
    else schedule.forEach((e, i) => timers.current.push(window.setTimeout(() => step(i), e.atMs)));
  }
  function exitReplay() {
    stopTimers();
    setReplay(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("replay");
    window.history.replaceState(null, "", url);
  }

  const replayButtons = replayList.length > 0 && (
    <div className="flex flex-wrap gap-2 text-sm">
      {replayList.map((r) => (
        <button key={r.name} type="button" className="rounded border border-violet-600 px-3 py-1 text-violet-200" onClick={() => void loadReplay(r.name)}>
          {t("top.watch", { title: r.title, language: r.language })}
        </button>
      ))}
    </div>
  );

  if (replay) {
    const f = replay.file;
    return (
      <div className="space-y-6">
        <div role="status" className="sticky top-0 z-10 flex flex-wrap items-center gap-3 rounded border border-violet-600 bg-violet-950 p-2 text-sm text-violet-100">
          <strong>REPLAY</strong> · {t("replay.recorded", { date: f.recordedAt.slice(0, 10) })} · {f.models.standard} / {f.models.premium}
          <span className="ml-auto flex gap-2">
            <button type="button" className="rounded border border-violet-400 px-2" onClick={() => play(replay, 1)}>1x</button>
            <button type="button" className="rounded border border-violet-400 px-2" onClick={() => play(replay, 2)}>2x</button>
            <button type="button" className="rounded border border-violet-400 px-2" onClick={() => play(replay, "skip")}>{t("replay.skip")}</button>
            <button type="button" className="rounded bg-violet-700 px-2" onClick={exitReplay}>{t("replay.exit")}</button>
          </span>
        </div>
        <StyleProfileView profile={f.styleProfile} />
        <StoryBibleEditor bible={f.bible} language={f.language} onChange={() => undefined} readOnly />
        <ChapterWorkspace chapterNumber={(replay.pass.chapterNumber as 1 | 2 | 3) ?? null} pass={replay.pass} retriesUsed={replay.pass.retryCount} canStart={false} blockedReason={null} replay onStart={() => undefined} />
        <FinalStory title={f.bible.logline} chapters={replay.chapters} replay />
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="rounded bg-emerald-900 px-2 py-0.5 text-xs font-semibold text-emerald-200">{t("top.live")}</span>
        <label className="flex items-center gap-2">
          {t("top.accessCode")}
          <input type="password" autoComplete="off" value={code} onChange={(e) => { setCode(e.target.value); setAccessCode(e.target.value); }} className="rounded border border-neutral-700 bg-neutral-900 px-2 py-0.5" />
        </label>
        <LanguageSwitch />
        <button type="button" className="ml-auto rounded border border-neutral-600 px-3 py-1" onClick={newSession}>{t("top.newSession")}</button>
      </div>
      {restoreNotice && <p role="status" className="text-sm text-sky-300">{restoreNotice}</p>}
      {replayButtons}

      <SampleInput onProfile={setProfile} disabled={locked} />
      {session.styleProfile && <StyleProfileView profile={session.styleProfile} notice={profileNotice} />}

      {session.styleProfile && (
        <div className="space-y-4">
          {!locked && (
            <DraftFromSeed
              profile={session.styleProfile}
              bible={bible}
              onApply={(next, prev) => { setUndo(prev); setSession((s) => ({ ...s, bible: next })); }}
              onRefused={(c) => setRefusal(c)}
            />
          )}
          {undo && !locked && (
            <button type="button" className="rounded border border-neutral-600 px-3 py-1 text-sm" onClick={() => { setSession((s) => ({ ...s, bible: undo })); setUndo(null); }}>{t("top.undo")}</button>
          )}
          <StoryBibleEditor bible={bible} language={language} onChange={(b) => setSession((s) => ({ ...s, bible: b }))} readOnly={locked} />
          {locked && <p className="text-xs text-neutral-500">{t("top.bibleLocked")}</p>}
        </div>
      )}

      {refusal && (
        <div role="alert" className="rounded border border-amber-700 p-3 text-sm text-amber-300">
          {t(`err.${refusal}` as MessageKey)} {replayList.length > 0 ? t("top.watchInstead") : ""}
          {replayButtons}
        </div>
      )}

      {session.styleProfile && (
        <ChapterWorkspace
          chapterNumber={nextChapter ?? (pass.chapterNumber as 1 | 2 | 3 | null)}
          pass={passIsForNext || !nextChapter ? pass : EMPTY_PASS}
          retriesUsed={retriesUsed}
          canStart={bibleValid && session.pipelineStatus !== "running"}
          blockedReason={!bibleValid ? t("ws.fixBible") : null}
          replay={false}
          onStart={(r) => void start(r)}
        />
      )}
      {!nextChapter && <p className="text-sm text-neutral-400">{t("top.allAccepted")}</p>}

      <FinalStory title={bible.logline} chapters={session.acceptedChapters} replay={false} />
      {IS_DEV && session.acceptedChapters.length === 3 && (
        <button type="button" className="rounded border border-violet-600 px-3 py-1 text-sm text-violet-200" onClick={() => void downloadReplay()}>{t("top.downloadReplay")}</button>
      )}
    </div>
  );
}
