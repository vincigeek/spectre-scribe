# Tasks — Spectre Scribe

Implementation task list. Tasks are ordered by dependency; complete each phase
before starting the next. Each task references the requirement(s) it satisfies.

---

## Phase 1 — Project scaffold

- [ ] **T-01** Initialise `app/` as a Swift package (or Xcode project). Create
      `Package.swift` with a macOS 14 minimum deployment target and a single
      executable target `SpectreScribe`. No third-party dependencies required at
      this stage.
      *(REQ-20)*

- [ ] **T-02** Add `app/Sources/SpectreScribeApp.swift` — the `@main` SwiftUI
      `App` struct. Wire it to a `ContentView` that shows a placeholder sidebar
      with the five screen labels: Sample Input, Style Profile, Story Bible,
      Chapter Workspace, Final Story.
      *(REQ-16)*

- [ ] **T-03** Add `app/Sources/AppState.swift` — `ObservableObject` holding
      `styleProfile: StyleProfile?`, `bible: StoryBible`, `chapters: [ChapterResult]`,
      and `pipelineState: PipelineState`. Inject it as an `@EnvironmentObject`.
      *(design §2.1)*

---

## Phase 2 — Style analyser

- [ ] **T-04** Implement `app/Sources/StyleAnalyser.swift`. Export a
      `func analyseStyle(_ text: String) throws -> StyleProfile` function.
      Compute all eight metrics defined in design §2.1:
      `sentenceLenMean`, `sentenceLenSD`, `typeTokenRatio`, `dialogueRatio`,
      `pacingMarkers`, `paraLenMean`, `paraLenSD`, `avgWordLen`.
      `StyleProfile` must be `Codable`.
      *(REQ-04)*

- [ ] **T-05** Build `SampleInputView` (`app/Sources/Views/SampleInputView.swift`):
      - `TextEditor` for pasting sample text.
      - "Open file…" button using `fileImporter` to accept `.txt` files.
      - Validate: reject empty input or input < 200 words with an inline error
        label; on success call `analyseStyle` and store the result in `AppState`.
      - "Analyse" button triggers validation and analysis.
      *(REQ-01, REQ-02, REQ-05)*

- [ ] **T-06** Build `StyleProfileView` (`app/Sources/Views/StyleProfileView.swift`):
      read-only `List` or `Form` showing each of the eight metrics with its name,
      computed value, and a plain-English description of what it measures.
      *(REQ-16b)*

- [ ] **T-07** Write unit tests for `StyleAnalyser` in
      `app/Tests/StyleAnalyserTests.swift` covering:
      - a short passage with known sentence counts,
      - a passage with no dialogue (`dialogueRatio == 0`),
      - a passage that is 100 % dialogue (`dialogueRatio ≈ 1`),
      - input below 200 words (should throw `StyleAnalyserError.tooShort`).
      *(REQ-04)*

---

## Phase 3 — Story bible store and editor

- [ ] **T-08** Implement `app/Sources/StoryBible.swift`. Define the full
      `StoryBible` struct and all nested types (`Setting`, `Character`,
      `ForeshadowingEntry`, `TimelineEvent`, `ChapterBeat`) exactly as specified
      in design §2.2. All types must be `Codable` and `Identifiable` where used
      in SwiftUI `List`s.
      *(REQ-06, REQ-12)*

- [ ] **T-09** Build `StoryBibleEditorView` (`app/Sources/Views/StoryBibleEditorView.swift`):
      - `TextField` / `TextEditor` inputs for genre and tone.
      - Setting section: time period, repeatable location rows, repeatable world-rule rows.
      - Characters section: `List` with add/remove; each row edits id, name, role
        picker, status picker, description.
      - Foreshadowing section: `List` with add/remove; id, description, status picker,
        optional deferred-to-chapter stepper.
      - Timeline section: `List` with add/remove; chapter number + event text.
      - Beat sheet section: one row per chapter (1–3); chapter number, title, premise,
        per-character status pickers.
      - "Save" button calls `AppState.updateBible(_:)`.
      *(REQ-06, REQ-07)*

- [ ] **T-10** Add "Export JSON…" / "Import JSON…" buttons to `StoryBibleEditorView`
      using `fileExporter` / `fileImporter` to read and write `story-bible.json` so
      the user can persist their work across app launches.
      *(design §2.8)*

---

## Phase 4 — Kiro Crew agent integration

- [ ] **T-11** Implement agent wrappers in `app/Sources/Agents/`:
      `OutlineAgent.swift`, `StyleAgent.swift`, `ContinuationAgent.swift`,
      `ContinuityAgent.swift`. Each type exposes an `async throws` `run(…)`
      method that:
      - assembles the full prompt from its inputs (style profile, bible snapshot,
        previous chapters, prior agent outputs for this chapter),
      - invokes the corresponding Kiro Crew agent definition (via Kiro SDK or
        `Process`-based CLI subprocess),
      - returns the raw `String` response.
      *(REQ-09, REQ-11)*

- [ ] **T-12** Implement `app/Sources/PipelineOrchestrator.swift`. Expose
      `func runChapter(_ number: Int) async throws -> ChapterResult`.
      Implements the retry loop (max 3) as specified in design §2.3.
      On approval, appends the `ChapterResult` to `AppState.chapters`.
      On three consecutive vetoes, throws `PipelineError.maxRetriesExceeded`.
      *(REQ-09, REQ-10, REQ-13)*

- [ ] **T-13** Implement `app/Sources/ContinuityChecker.swift`. Expose
      `func run(bible: StoryBible, previousChapters: [ChapterResult], draft: String) -> HookResult`.
      Implements the three checks (character alive/dead, timeline order,
      foreshadowing payoff) as specified in design §2.5 and requirements §2.5.
      Returns `HookResult.approved` or `HookResult.vetoed([FailingItem])`.
      *(REQ-13, REQ-14)*

- [ ] **T-14** Write unit tests for `PipelineOrchestrator` in
      `app/Tests/PipelineOrchestratorTests.swift` using mock agent stubs:
      - Happy path: all four agents succeed on first pass; chapter is accepted.
      - One veto then approval: first continuity call returns veto; second returns
        approved; chapter is accepted on retry.
      - Three vetoes: all three retries fail; `runChapter` throws
        `PipelineError.maxRetriesExceeded`.
      *(REQ-10)*

---

## Phase 5 — Chapter workspace UI

- [ ] **T-15** Build `ChapterWorkspaceView` (`app/Sources/Views/ChapterWorkspaceView.swift`):
      - `HSplitView` with three panes: beat outline (read-only `TextEditor` or
        `ScrollView`), prose draft (read-only), continuity result.
      - Continuity pane shows a green "APPROVED" label or a red "VETO" with the
        structured `FailingItem` list and suggested fixes.
      - "Approve" button accepts the chapter and advances to the next.
      - "Retry" button re-runs `PipelineOrchestrator.runChapter` for the current
        chapter.
      *(REQ-15, REQ-16d)*

- [ ] **T-16** Wire `PipelineOrchestrator` to `ChapterWorkspaceView` so tapping
      "Run pipeline" for chapter N calls `runChapter(N)` and updates all three
      panes on completion. Show a `ProgressView` while the pipeline is running.
      *(REQ-09)*

- [ ] **T-17** Enforce the 3-chapter limit: after chapter 3 is accepted, disable
      "Run next chapter" and navigate the user to the final story screen.
      *(REQ-18)*

---

## Phase 6 — Final story screen

- [ ] **T-18** Build `FinalStoryView` (`app/Sources/Views/FinalStoryView.swift`).
      Render all three accepted chapters in sequence with chapter titles as
      headings inside a `ScrollView`. Add an "Export as .txt…" button that uses
      `fileExporter` to write the full story to a plain-text file.
      *(REQ-16e)*

---

## Phase 7 — Performance and polish

- [ ] **T-19** Measure end-to-end pipeline time (sample analysis + 3 chapters,
      no retries). If it exceeds 3 minutes on a developer Mac, profile with
      Instruments and optimise the bottleneck.
      *(REQ-19)*

- [ ] **T-20** Verify that no chapter draft exceeds 800 words. If the continuation
      agent consistently exceeds the limit, add a word-count constraint to its
      prompt and re-test.
      *(REQ-22)*

- [ ] **T-21** Smoke test the complete demo flow end-to-end:
      1. Paste or open a public-domain sample passage.
      2. Confirm style profile displays all 8 metrics correctly.
      3. Fill in a story bible (TBD plot, TBD character names).
      4. Run the pipeline for all 3 chapters.
      5. View the final story screen.
      6. Export the story to a .txt file.
      7. Confirm the total wall-clock time is under 3 minutes.
      *(REQ-19, REQ-22)*

- [ ] **T-22** Confirm the app builds cleanly from the repo with `swift build`
      (or `xcodebuild`) on a fresh checkout with no manual toolchain setup beyond
      Xcode 15+ / Swift 5.9+.
      *(REQ-20)*

---

## Phase 8 — Kiro configuration verification

- [ ] **T-23** Confirm that all four agent files (`/.kiro/agents/outline.md`,
      `style.md`, `continuation.md`, `continuity.md`) are non-stub and contain
      the full system prompts needed for production use.
      *(REQ-09)*

- [ ] **T-24** Confirm that `/.kiro/hooks/continuity-check.md` is non-stub and
      defines the three checks in enough detail for Kiro to execute them.
      *(REQ-13)*

- [ ] **T-25** Confirm that `/.kiro/` is not gitignored and that all Kiro
      configuration is committed to the repository.
      *(REQ-21)*

---

## Acceptance criteria summary

| ID    | Criterion                                                     | Verified by  |
|-------|---------------------------------------------------------------|--------------|
| AC-01 | Style profile displays 8 metrics for any valid sample         | T-07         |
| AC-02 | Invalid sample (< 200 words) is rejected with a message       | T-05, T-07   |
| AC-03 | Story bible editor saves all fields to session state          | T-09         |
| AC-04 | Pipeline produces an accepted chapter draft in ≤ 3 retries    | T-12, T-14   |
| AC-05 | Continuity hook flags dead characters, timeline breaks,       | T-13, T-14   |
|       | and dropped foreshadowing                                     |              |
| AC-06 | Three consecutive vetoes surface an error to the user         | T-12, T-14   |
| AC-07 | Full demo (3 chapters, no retries) completes in ≤ 3 minutes   | T-19, T-21   |
| AC-08 | No chapter exceeds 800 words                                  | T-20         |
| AC-09 | Final story screen renders all 3 chapters and offers export   | T-18         |
| AC-10 | App builds from `swift build` with no extra setup             | T-22         |
| AC-11 | Demo plot and character names are NOT hardcoded in the spec   | This file    |
