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
      `LLM_BASE_URL`, and `LLM_MODEL`. Fail with a safe configuration error when
      a value is absent. Ensure no value is imported by client components or
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

- [ ] **T-07** Implement `app/api/style/analyse/route.ts`. Validate the sample,
      reject empty or under-200-word input, call the pure analyser, and return a
      structured JSON profile. The route must not fetch text or call a model.
      *(REQ-01, REQ-02, REQ-03, REQ-05)*

- [ ] **T-08** Add Vitest coverage in `tests/style-analyser.test.ts` for known
      sentence and paragraph lengths, standard deviations, vocabulary ratio,
      no-dialogue input, all-dialogue input, pacing-marker subcounts,
      stopword-excluded word length, and the 200-word validation error.
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
      `deferredToChapter` for deferred foreshadowing, and exactly three beat-sheet
      chapters. Keep the demo plot and character names as user-provided TBD
      content rather than adding examples to the specification.
      *(REQ-06, REQ-08, REQ-12)*

- [ ] **T-12** Implement browser-side download helpers in `lib/downloads.ts`.
      Download the story bible as JSON, each accepted chapter as Markdown, and
      the complete three-chapter story as an ordered Markdown file. Do not write
      runtime output under `/.kiro` or on the server filesystem.
      *(REQ-16, REQ-21, REQ-23)*

---

## Phase 4 — Agent access and server orchestration

- [ ] **T-13** Implement a server-only agent definition loader that reads the
      unchanged files `/.kiro/agents/outline.md`, `style.md`,
      `continuation.md`, and `continuity.md` from the repository root. Add an
      OpenAI-compatible client that uses only the three server environment
      variables and never exposes the key.
      *(REQ-09, REQ-17, REQ-22, REQ-23)*

- [ ] **T-14** Implement server-side wrappers for the outline, style,
      continuation, and continuity agents. Assemble each prompt from the named
      style profile, full read-only story bible, previously accepted chapters, and
      earlier outputs from the current relay pass. Include structured VETO notes
      on retries. Keep the fixed order outline -> style -> continuation ->
      continuity.
      *(REQ-09, REQ-11, REQ-12)*

- [ ] **T-15** Implement `lib/pipeline/orchestrator.ts` for one chapter pass.
      Enforce the outline, style, continuation, continuity order; keep the style
      anchor at most 400 words; enforce a final draft limit of 800 words; and
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

- [ ] **T-26** Verify that the server rejects any accepted draft over 800 words,
      a fourth chapter request, a fourth retry, an invalid story bible, and an
      unconfigured model endpoint. Verify that no sample retrieval, database
      write, credential log, or client-side secret exposure exists.
      *(REQ-03, REQ-18, REQ-20, REQ-21, REQ-22)*

- [ ] **T-27** Smoke-test the complete demo flow with a user-owned or
      public-domain sample of at least 200 words. Confirm all eight metrics, a
      user-provided TBD story bible, exactly three accepted chapters, continuity
      output, Markdown/JSON downloads, `localStorage` restoration, and the
      under-3-minute no-retry target.
      *(REQ-02, REQ-04, REQ-06, REQ-16, REQ-18, REQ-19, REQ-20, REQ-21)*

- [ ] **T-28** Connect the GitHub repository to Vercel and verify an automatic
      deployment from the configured branch. Set the three model variables only
      in the deployment environment. The Devpost submission must use the public
      Vercel URL. Do not commit, push, create a branch, or deploy as part of this
      document migration.
      *(REQ-17, REQ-22)*

---

## Phase 8 — Kiro configuration verification

- [ ] **T-29** Confirm that the four files in `/.kiro/agents/` are present and
      inspect whether each contains its required role prompt and output contract.
      The application must load them without modifying their contents. If a
      pre-existing file is a stub, record that as a configuration blocker for the
      implementation; do not edit it in this migration.
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
| AC-02 | Empty or under-200-word input is rejected with a Web UI message | T-07, T-09 |
| AC-03 | The editor validates and preserves every story bible field | T-10, T-11 |
| AC-04 | Each chapter uses the fixed outline -> style -> continuation -> continuity relay | T-14, T-17 |
| AC-05 | Continuity flags dead-character, timeline-order, and foreshadowing-payoff failures | T-18, T-19, T-20 |
| AC-06 | A chapter can use at most 3 retries after the first attempt, and a further retry is rejected | T-15, T-17, T-22 |
| AC-07 | The demo accepts exactly 3 chapters and blocks a fourth | T-22, T-23, T-26 |
| AC-08 | No accepted chapter exceeds 800 words | T-15, T-22, T-26 |
| AC-09 | A no-retry run of sample analysis plus 3 chapters completes within 3 minutes | T-25, T-27 |
| AC-10 | Progress and agent output stream through SSE while model access remains server-only | T-05, T-13, T-16, T-21 |
| AC-11 | The story bible downloads as JSON and chapters/full story download as Markdown | T-12, T-23, T-24 |
| AC-12 | React state and `localStorage` restore the session without a database | T-04, T-22, T-27 |
| AC-13 | No real key or password is in the repository or browser bundle | T-05, T-17, T-26, T-28 |
| AC-14 | The demo plot, character names, and sample remain TBD in the specification | T-10, T-23, T-27 |
| AC-15 | The existing agent and hook definitions remain unchanged and `.kiro` is not gitignored | T-13, T-18, T-29, T-30 |
