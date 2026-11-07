# Tasks — Spectre Scribe

Implementation task list. Tasks are ordered by dependency; complete each phase before
starting the next. The task plan changes the Web application documents only. The
existing files in `/.kiro/agents/` and `/.kiro/hooks/` are read-only inputs and
must not be edited.

---

## Phase 1 — Next.js project and shared boundaries

- [ ] **T-01** Initialise or verify the project as a Next.js 15 App Router
      application with React 19 and TypeScript. Add Tailwind CSS 4 and the
      shadcn/ui component setup. Confirm `pnpm dev` starts the app.
      *(REQ-17, REQ-23)*

- [ ] **T-02** Create the App Router shell in `app/layout.tsx` and
      `app/page.tsx`. Add the workspace navigation for Sample Input, Style
      Profile, Story Bible, Chapter Workspace, and Final Story using accessible
      shadcn/ui primitives.
      *(REQ-16)*

- [ ] **T-03** Define shared TypeScript schemas in `lib/story-bible.ts` for
      `StyleProfile`, `StoryBible`, `Character`, `ForeshadowingEntry`, timeline
      events, beat-sheet entries, accepted chapters, and pipeline status. Validate
      the same schemas in the browser and at every Route Handler boundary.
      *(REQ-06, REQ-07, REQ-21)*

- [ ] **T-04** Add the client session model. Keep the style profile, editable
      bible, pending relay result, accepted chapters, derived continuity ledger,
      retry counters, and pipeline status in React state, and synchronise
      serialisable session data to `localStorage`. Do not create a database or
      server-side story store.
      *(REQ-21)*

- [ ] **T-05** Add server-only configuration loading for `LLM_API_KEY`,
      `LLM_BASE_URL`, `LLM_MODEL`, and the optional `LLM_MODEL_PREMIUM` (continuity
      only; falls back to `LLM_MODEL`, see design §2.4). Fail with a safe
      configuration error when a required value is absent. Ensure no value is imported by client components or
      emitted in logs, prompts, SSE events, or downloads.
      *(REQ-17, REQ-22)*

---

## Phase 2 — Pure style analysis

- [ ] **T-06** Implement `lib/style-analyser.ts` as a pure TypeScript module. Export
      a style-analysis function and compute all eight required metrics:
      sentence-length mean, sentence-length standard deviation, type-token ratio,
      dialogue ratio, pacing-marker counts per 100 words, paragraph-length mean,
      paragraph-length standard deviation, and stopword-excluded average word
      length. Keep the exact definitions in requirements §2.2.
      *(REQ-04, REQ-05)*

- [ ] **T-06a** Implement `lib/text-units.ts` as a pure module with
      `detectLanguage`, `countUnits`, `splitSentences`, `splitParagraphs`, and
      `LANGUAGE_LIMITS` (design §2.11). Use it from the analyser, the bible
      validator, both Route Handlers, the orchestrator, and the browser counter.
      Add Vitest cases for both languages, including the 199/200 word and 399/400
      字 boundaries.
      *(REQ-24, REQ-25, REQ-26)*

- [ ] **T-07** Implement `app/api/style/analyse/route.ts`. Validate the sample,
      reject empty or under-minimum input for the detected language (accept an
      optional language override), call the pure analyser, and return a
      structured JSON profile. The route must not fetch text or call a model.
      *(REQ-01, REQ-02, REQ-03, REQ-05)*

- [ ] **T-08** Add Vitest coverage in `tests/style-analyser.test.ts` for known
      sentence and paragraph lengths, standard deviations, vocabulary ratio,
      no-dialogue input, all-dialogue input, pacing-marker subcounts,
      stopword-excluded word length, the language-minimum validation errors (199/200 words, 399/400 字), and
      the Chinese cases listed in `testing.md`.
      *(REQ-04, REQ-05)*

- [ ] **T-09** Build `components/sample-input.tsx` and
      `components/style-profile.tsx`. Support paste and `.txt` import, show the
      validation error, trigger analysis, and render all eight metrics with their
      definitions as read-only values.
      *(REQ-01, REQ-02, REQ-16a, REQ-16b)*

---

## Phase 3 — Story bible and downloads

- [ ] **T-10** Implement the story bible editor in
      `components/story-bible-editor.tsx`. Expose editable genre and tone;
      setting time period, locations, and world rules; character id/name/role/
      status/description; foreshadowing id/description/status/deferred chapter;
      ordered timeline events; and one beat-sheet entry for each of chapters 1–3
      with character states.
      *(REQ-06, REQ-07, REQ-08, REQ-16c)*

- [ ] **T-11** Validate story bible invariants before a pipeline request: required
      top-level fields, valid role and status values, non-empty one-paragraph world
      rules, one-sentence character descriptions, `alive` status for new
      characters, valid chapter numbers, a state entry for every major character in
      every beat, consistent transitions between adjacent beats,
      `deferredToChapter` for deferred foreshadowing, exactly three beat-sheet
      chapters, a logline within the language limit (15 words / 30 字), and a
      five-sentence synopsis counted with the shared sentence splitter. Keep the demo plot and character names as user-provided TBD
      content rather than adding examples to the specification.
      *(REQ-06, REQ-08, REQ-12)*

- [ ] **T-11a** Implement `app/api/bible/draft/route.ts` and the outline agent's
      `plan` mode (design §2.12). One request is one layer (`core` or
      `structure`) and one call on `LLM_MODEL`. Run every deterministic check in
      the §2.12 table before returning a draft. Return `schema-mismatch` or
      `model-refusal` on failure. Pass the live gate first.
      *(REQ-30, REQ-31, REQ-32)*

- [ ] **T-11b** Build `components/draft-from-seed.tsx`: seed form, `core`
      preview, accept, `structure` preview, accept, redraft with 3 tries per
      layer, the overwrite prompt with one undo, and the stale-structure notice.
      Manual entry stays available. Test with mocked responses, including a
      logline that contains a character name and a structure that changes a
      core field.
      *(REQ-12, REQ-30, REQ-31)*

- [ ] **T-12** Implement browser-side download helpers in `lib/downloads.ts`.
      Download the story bible as JSON, each accepted chapter as Markdown, and
      the complete three-chapter story as an ordered Markdown file. Do not write
      runtime output under `/.kiro` or on the server filesystem.
      *(REQ-16, REQ-21, REQ-23)*

---

## Phase 4 — Agent access and server orchestration

- [ ] **T-13** Implement a server-only agent definition loader that reads the
      read-only files `/.kiro/agents/outline.md`, `style.md`,
      `continuation.md`, and `continuity.md` from the repository root. Add an
      OpenAI-compatible client that uses only the server environment
      variables (`LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`, optional
      `LLM_MODEL_PREMIUM`) and never exposes the key.
      *(REQ-09, REQ-17, REQ-22, REQ-23)*

- [ ] **T-14** Implement server-side wrappers for the outline, style,
      continuation, and continuity agents. Assemble each prompt from the named
      style profile, full read-only story bible, previously accepted chapters, and
      earlier outputs from the current relay pass. Include structured VETO notes
      on retries. Keep the fixed order outline -> style -> continuation ->
      continuity. Append the run-parameters block (REQ-27) to every prompt and map
      the style agent's `targets` fields to the profile (design §2.11).
      *(REQ-09, REQ-11, REQ-12, REQ-27)*

- [ ] **T-15** Implement `lib/pipeline/orchestrator.ts` for one chapter pass.
      Enforce the outline, style, continuation, continuity order; keep the style
      anchor at most 400 words (700 字 in Chinese); enforce a final draft limit of
      800 words (1,500 字 in Chinese), recounted with `countUnits`; and
      accept a chapter only on `APPROVED`. On `VETO`, return structured failures
      without rewriting the draft. Permit the first attempt plus at most 3
      additional retries, and reject a fourth retry.
      *(REQ-09, REQ-10, REQ-14, REQ-20)*

- [ ] **T-16** Implement `app/api/pipeline/stream/route.ts` as an SSE Route
      Handler. Validate the chapter number, style profile, story bible, accepted
      chapters, derived continuity ledger, retry count, and veto context. Emit typed
      agent-start,
      agent-delta or agent-complete, continuity, chapter-accepted, error, and
      terminal done events. Keep all orchestration and model access on the server.
      *(REQ-15, REQ-17, REQ-18, REQ-21)*

- [ ] **T-17** Test the orchestration with mocked model responses: a first-pass
      approval, a VETO followed by a user-requested retry and approval, a retry
      from the continuation stage, and a chapter that fails after three retries.
      Verify that all prompts contain the required read-only context and that no
      secret appears in an event or error.
      *(REQ-09, REQ-10, REQ-11, REQ-12, REQ-22)*

---

## Phase 5 — Continuity checks

- [ ] **T-18** Load and apply `/.kiro/hooks/continuity-check.md` as the base
      continuity contract without changing it. Add the demo-specific deferred
      state, final-chapter payoff, and structured-result rules in the server-side
      continuity stage. Ensure the full continuity stage checks character
      alive/dead state, timeline order, and foreshadowing payoff after every
      continuation draft and before acceptance.
      *(REQ-13, REQ-23)*

- [ ] **T-19** Parse continuity output into `APPROVED` or structured `VETO`
      results. Every VETO item must identify the failing check, violated story
      bible field, specific violation, and minimal suggested fix. Preserve open
      items, require `deferredToChapter` for deferred items, and require all open
      foreshadowing to be paid off in chapter 3.
      *(REQ-13, REQ-14)*

- [ ] **T-20** Add tests for a dead character appearing after death, an event out
      of timeline order, an unaddressed open foreshadowing item, a valid deferred
      item, and a final-chapter payoff. Confirm the continuity code never rewrites
      a draft.
      *(REQ-13, REQ-14)*

- [ ] **T-20a** Enforce the chapter arc roles (P0): the outline agent tags each
      chapter setup-plus-hook / escalation / payoff, Chapter 2 beats contain at
      least one disaster-or-reversal beat, continuity requires at least one open
      foreshadowing item after Chapter 1 and all items paid off after Chapter 3.
      Arc roles are structural only; no plot, names, or sample content are
      invented here.
      *(REQ-13, REQ-14)*

- [ ] **T-20b** Emit one `relay-receipt` SSE event per completed pass (P0),
      approved or vetoed, before `done`: per-agent summary and concrete changes,
      every foreshadowing status transition in the pass, and the continuity
      status with failures. Store it as a client checkpoint and session record.
      The receipt contains no raw sample, prompt, key, or model configuration.
      *(REQ-15, REQ-16)*

---

## Phase 6 — Streaming workspace and final story

- [ ] **T-21** Build `components/chapter-workspace.tsx`. Start the SSE request for
      the current chapter, show agent progress, and render the beat outline,
      draft, and continuity result. Show a green `APPROVED` state or a red `VETO`
      state with failing items and fixes. Render the relay receipt for the pass
      (one entry per agent plus foreshadowing transitions) for approved and
      vetoed passes alike. Let the user choose a permitted retry
      point and send the VETO context back in the next request.
      *(REQ-10, REQ-15, REQ-16d)*

- [ ] **T-22** Enforce the chapter state machine in the client: do not add a
      chapter until the server sends `APPROVED` and the word-count check passes;
      keep retry count across reloads; allow no more than 3 retries after the
      first attempt; and disable the next-chapter action after chapter 3.
      *(REQ-10, REQ-18, REQ-20, REQ-21)*

- [ ] **T-23** Build `components/final-story.tsx`. Render the exactly three
      accepted chapters in order, show their titles, and expose individual and
      complete-story Markdown downloads. Show one collapsible relay receipt per
      accepted chapter. Do not invent demo plot or character
      content in the component defaults.
      *(REQ-08, REQ-16e, REQ-18)*

- [ ] **T-23a** (P1; cut first) Add `en` and `zh-CN` string dictionaries for the
      UI chrome, a language switch defaulting from the browser language, a
      CJK-capable font fallback, and UTF-8 downloads. The story language stays
      independent of the UI language.
      *(REQ-28)*

- [ ] **T-24** Run an end-to-end client test covering sample input, style profile,
      story bible editing, one streamed chapter pass, a VETO review, a permitted
      retry, acceptance of chapters 1–3, and final Markdown downloads.
      *(REQ-01, REQ-07, REQ-15, REQ-16, REQ-18)*

---

## Phase 7 — Performance, safety, and delivery

- [ ] **T-25** Measure sample analysis plus all three chapters with no retries from
      the browser. Record Route Handler, model-call, SSE, and end-to-end times;
      tune bounded prompts and stream handling until the complete flow is under
      3 minutes in the intended deployment environment.
      *(REQ-19)*

- [ ] **T-26** Verify that the server rejects any accepted draft over the chapter limit (800 words / 1,500 字),
      a fourth chapter request, a fourth retry, an invalid story bible, and an
      unconfigured model endpoint. Verify that no sample retrieval, database
      write, credential log, or client-side secret exposure exists.
      *(REQ-03, REQ-18, REQ-20, REQ-21, REQ-22)*

- [ ] **T-27** Smoke-test the complete demo flow with a user-owned or
      public-domain sample (at least 200 words, or 400 字 in Chinese). Run it once
      in English and once in Chinese. Confirm all eight metrics, a
      user-provided TBD story bible, exactly three accepted chapters, continuity
      output, Markdown/JSON downloads, `localStorage` restoration, and the
      under-3-minute no-retry target.
      *(REQ-02, REQ-04, REQ-06, REQ-16, REQ-18, REQ-19, REQ-20, REQ-21, REQ-29)*

- [ ] **T-28** Connect the GitHub repository to Vercel and verify an automatic
      deployment from the configured branch. Set the model variables only
      in the deployment environment. The Devpost submission must use the public
      Vercel URL. Do not commit, push, create a branch, or deploy as part of this
      document migration.
      *(REQ-17, REQ-22)*

- [ ] **T-31** Implement `lib/live-gate.ts` (design §2.13): live-mode switch,
      access code check with constant-time compare and wrong-code lockout,
      per-IP concurrency lock, per-IP 10-minute windows, and UTC daily budgets
      on Upstash Redis over REST. Fail closed in Production when the store is
      missing or unreachable; use an in-memory counter in local development.
      Hash IPs with `RATE_LIMIT_SECRET`. Wire it into both live routes before
      any model call.
      *(REQ-32)*

- [ ] **T-32** Test the live gate with a fake store: missing code, wrong code,
      lockout after 10 wrong codes, a second concurrent request, the 9th pass in
      10 minutes, the 61st pass in a day, store down in Production, lock
      released after an error and after a client abort. Assert that no model
      call happens on any refusal and that no raw IP or code reaches a log.
      *(REQ-32)*

- [ ] **T-33** Implement replay (design §2.14): the shared `ReplayFile` schema in
      `lib/replay.ts`, the dev-only recorder with 100 ms delta buckets and the
      forbidden-field filter, `components/replay-player.tsx` with 1x/2x/skip,
      the fixed banner, separate state from the live session, and the three
      entry points. Test that a replay never calls a Route Handler and never
      overwrites the `localStorage` session.
      *(REQ-33)*

- [ ] **T-34** Owner tasks before submission: record one English and one Chinese
      run (each with at least one VETO and retry) into `public/replays/`; set
      the live-gate variables in Vercel Production; set a provider billing
      budget and alert for the premium model; put the access code in the
      Devpost testing notes (confirm they are visible to judges only); rotate
      the code after judging.
      *(REQ-32, REQ-33)*

---

## Phase 8 — Kiro configuration verification

- [x] **T-29** Confirm that the four files in `/.kiro/agents/` are present and
      inspect whether each contains its required role prompt and output contract.
      The application must load them without modifying their contents. Completed
      2026-11-07 on the owner's instruction: the four 4-line placeholders were
      replaced with full role prompts and output contracts (outline, style,
      continuation, continuity). The hook file was not changed. Updated
      2026-11-07 on the owner's instruction: each agent file now opens with a
      `Run parameters` section, so the server's limits and language override
      the English defaults in the file; the outline agent gained `plan` and
      `chapter` modes.
      *(REQ-09, REQ-23)*

- [ ] **T-30** Confirm that `/.kiro/hooks/continuity-check.md` is present and
      defines the character-status, timeline-order, and foreshadowing-payoff
      checks. Confirm that `/.kiro` is at the repository root and is not
      gitignored.
      *(REQ-13, REQ-23)*

---

## Acceptance criteria summary

| ID | Criterion | Verified by |
| --- | --- | --- |
| AC-01 | A valid sample produces the eight defined style metrics with the documented calculations | T-06, T-08, T-09 |
| AC-02 | Empty or under-minimum input (200 words / 400 字) is rejected with a Web UI message | T-07, T-09 |
| AC-03 | The editor validates and preserves every story bible field | T-10, T-11 |
| AC-04 | Each chapter uses the fixed outline -> style -> continuation -> continuity relay | T-14, T-17 |
| AC-05 | Continuity flags dead-character, timeline-order, and foreshadowing-payoff failures | T-18, T-19, T-20 |
| AC-06 | A chapter can use at most 3 retries after the first attempt, and a further retry is rejected | T-15, T-17, T-22 |
| AC-07 | The demo accepts exactly 3 chapters and blocks a fourth | T-22, T-23, T-26 |
| AC-08 | No accepted chapter exceeds its language limit (800 words / 1,500 字) | T-15, T-22, T-26 |
| AC-09 | A no-retry run of sample analysis plus 3 chapters completes within 3 minutes | T-25, T-27 |
| AC-10 | Progress and agent output stream through SSE while model access remains server-only | T-05, T-13, T-16, T-21 |
| AC-11 | The story bible downloads as JSON and chapters/full story download as Markdown | T-12, T-23, T-24 |
| AC-12 | React state and `localStorage` restore the session without a database | T-04, T-22, T-27 |
| AC-13 | No real key or password is in the repository or browser bundle | T-05, T-17, T-26, T-28 |
| AC-14 | The demo plot, character names, and sample remain TBD in the specification | T-10, T-23, T-27 |
| AC-15 | The four agent definitions carry full role prompts and output contracts (completed 2026-11-07; the hook definition is unchanged) and `.kiro` is not gitignored | T-13, T-18, T-29, T-30 |
| AC-16 | English and Chinese samples are detected locally, analysed with the right length unit, and both complete the full flow | T-06a, T-08, T-14, T-27 |
| AC-17 | Agent calls carry the run-parameters block and story-language output; server limits use the same unit | T-14, T-15, T-26 |
| AC-19 | A seed produces a validated `core` then `structure` draft that the user accepts into the bible; manual entry still works | T-11a, T-11b |
| AC-20 | Live calls without a valid code, over a limit, or with the store down in Production are refused before any model call | T-31, T-32 |
| AC-21 | A labelled replay plays the full three-chapter run with no model call and leaves the live session untouched | T-33, T-34 |
| AC-18 | The model variables are `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`, and optional `LLM_MODEL_PREMIUM` everywhere in the docs | T-05, T-13 |
