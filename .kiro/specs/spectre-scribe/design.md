# Design — Spectre Scribe

## 1. Architecture overview

Spectre Scribe is a native macOS app written in Swift with a SwiftUI interface. All
logic runs in-process on the developer's Mac. There is no embedded web server and no
external cloud dependency at runtime.

```
SpectreScribeApp  (SwiftUI @main)
  │
  ├── AppState  (ObservableObject, single source of truth)
  │     ├── StyleProfile
  │     ├── StoryBible
  │     ├── [ChapterResult]   (one per accepted chapter, max 3)
  │     └── PipelineState     (idle | running | vetoed | failed)
  │
  ├── StyleAnalyser            (Swift module, in-process)
  ├── PipelineOrchestrator     (async/await, in-process)
  │     ├── OutlineAgent       (Kiro Crew, called via Kiro SDK / CLI)
  │     ├── StyleAgent         (Kiro Crew)
  │     ├── ContinuationAgent  (Kiro Crew)
  │     └── ContinuityAgent    (Kiro Crew)  ◄─── continuity-check hook
  └── ChapterStore             (in-memory, session-scoped)
```

The Frankenstein angle: quantitative style statistics (a data-analysis technique)
are grafted onto a narrative AI relay pipeline. The style profile produced by the
analyser drives the prose agent as a first-class input, not just a vague prompt hint.

## 2. Module breakdown

### 2.1 Style analyser (`app/Sources/StyleAnalyser.swift`)

Input: `String` (user-supplied passage).
Output: `StyleProfile` struct.

Computed fields (all computed in-process, no external calls):

| Field                | Computation                                                  |
|----------------------|--------------------------------------------------------------|
| `sentenceLenMean`    | mean words per sentence (split on `.!?`)                    |
| `sentenceLenSD`      | standard deviation of the above                             |
| `typeTokenRatio`     | unique tokens / total tokens (lowercased, no punctuation)   |
| `dialogueRatio`      | words inside `"…"` / total words                            |
| `pacingMarkers`      | counts of `—`, `…`, `.`, `!`, `?` per 100 words            |
| `paraLenMean`        | mean words per paragraph (split on blank lines)             |
| `paraLenSD`          | SD of the above                                             |
| `avgWordLen`         | mean char count per token (stopwords excluded)              |

`StyleProfile` is `Codable`. It is serialised to JSON and written to
`/.kiro/specs/spectre-scribe/style-profile.json` as a generated artefact.

### 2.2 Story bible store (`app/Sources/StoryBible.swift`)

Holds the story bible as a `StoryBible` struct in the shared `AppState`.
Loaded from `/.kiro/specs/spectre-scribe/story-bible.json` if present; otherwise
initialised from a blank template when the user fills in the editor.

Story bible Swift struct (mirrored as JSON for persistence):

```swift
struct StoryBible: Codable {
    var genre: String
    var tone: String
    var setting: Setting
    var characters: [Character]
    var foreshadowing: [ForeshadowingEntry]
    var timeline: [TimelineEvent]
    var beatSheet: [ChapterBeat]

    struct Setting: Codable {
        var timePeriod: String
        var locations: [String]
        var worldRules: [String]
    }

    struct Character: Codable {
        var id: String            // e.g. "char-1"
        var name: String
        var role: Role            // protagonist | antagonist | supporting
        var status: Status        // alive | dead | unknown
        var description: String

        enum Role: String, Codable { case protagonist, antagonist, supporting }
        enum Status: String, Codable { case alive, dead, unknown }
    }

    struct ForeshadowingEntry: Codable {
        var id: String            // e.g. "fore-1"
        var description: String
        var status: Status        // open | paidOff | deferred
        var deferredToChapter: Int?

        enum Status: String, Codable { case open, paidOff, deferred }
    }

    struct TimelineEvent: Codable {
        var chapterNumber: Int
        var event: String
    }

    struct ChapterBeat: Codable {
        var chapterNumber: Int
        var title: String
        var premise: String
        var characterStates: [String: Character.Status]  // keyed by character id
    }
}
```

The `AppState` exposes a read-only snapshot (`bible` property) to agents and a
mutating setter reachable only from the story bible editor view. Agents receive a
deep copy.

### 2.3 Pipeline orchestrator (`app/Sources/PipelineOrchestrator.swift`)

The orchestrator runs the four-agent relay for one chapter at a time using
Swift structured concurrency (`async/await`).

```swift
func runChapter(_ chapterNumber: Int) async throws -> ChapterResult {
    var retries = 0
    while retries <= 3 {
        let beatOutline = try await outlineAgent.run(bible, previousChapters, styleProfile)
        let styledProse = try await styleAgent.run(bible, previousChapters, styleProfile,
                                                    beatOutline)
        let draft       = try await continuationAgent.run(bible, previousChapters,
                                                           styleProfile, beatOutline,
                                                           styledProse)
        let result      = try await continuityAgent.run(bible, previousChapters, draft)
        if result.approved {
            return ChapterResult(number: chapterNumber, draft: draft,
                                 beatOutline: beatOutline)
        }
        retries += 1
        // append veto context for next pass
    }
    throw PipelineError.maxRetriesExceeded(chapterNumber)
}
```

All inter-agent messages are plain text strings passed as prompt context. Each agent
call is a single Kiro Crew invocation; the orchestrator assembles the full prompt
context before each call.

### 2.4 Kiro Crew agents (`app/Sources/Agents/`)

Each agent is defined in `/.kiro/agents/`. Swift wrapper types in
`app/Sources/Agents/` assemble the prompt and invoke the Kiro Crew agent via the
Kiro SDK or CLI subprocess, then return the plain-text response.

**OutlineAgent**
- Reads: style profile, story bible, previous chapters.
- Produces: a numbered beat outline (≤ 8 beats) for the chapter.
- Must not produce prose; bullets and short phrases only.

**StyleAgent**
- Reads: style profile, story bible, previous chapters, beat outline.
- Produces: a prose passage (≤ 400 words) demonstrating the target style metrics.
  This is a style anchor, not a complete chapter.
- Must cite which style metrics it is targeting in a trailing comment block.

**ContinuationAgent**
- Reads: all of the above plus the style anchor passage.
- Produces: a complete chapter draft (≤ 800 words) that follows the beat outline
  and matches the style anchor's register.

**ContinuityAgent**
- Reads: all of the above plus the continuation draft.
- Produces: either `APPROVED` on the first line, or `VETO` on the first line
  followed by a structured list of failing items (see §2.5).
- Must NOT rewrite the draft.

### 2.5 Continuity hook (`/.kiro/hooks/continuity-check.md`)

Runs as a Kiro hook after every continuation draft.

Three checks:

**Check A — Character alive/dead**
For every character named in the draft:
1. Look up the character's last recorded status in the accepted chapters and the
   story bible beat sheet.
2. If status is `dead` and the character appears as a speaking or acting participant,
   flag it unless the story bible beat sheet explicitly marks the chapter as
   flashback or the character's role is `ghost`.

Failure output:
```
FAIL character-status
  character: <id>
  violation: <character> died in chapter <N> but acts/speaks in chapter <M>
  fix: remove or attribute to memory/flashback
```

**Check B — Timeline order**
For every event referenced in the draft:
1. Find its corresponding entry in `bible.timeline`.
2. Check that no event in the draft is referenced as happening before an event
   that the timeline places after it.

Failure output:
```
FAIL timeline-order
  violation: <description>
  fix: <minimal reorder or removal>
```

**Check C — Foreshadowing payoff**
For every foreshadowing entry with status `open` as of the previous accepted chapter:
1. If the current chapter is the final chapter (chapter 3), it MUST be `paidOff`.
2. In earlier chapters, it must be `open`, `paidOff`, or `deferred` (with
   `deferredToChapter` set). It MUST NOT be silently absent from the draft.

Failure output:
```
FAIL foreshadowing
  item: <id>
  violation: open foreshadowing <description> not addressed
  fix: add a sentence keeping it open or paying it off
```

On full pass the hook emits `APPROVED` with no additional output.

### 2.6 Native macOS UI (`app/Sources/Views/`)

SwiftUI app with five screens navigated by a sidebar or tab bar. No web view;
all UI is native SwiftUI.

| Screen               | SwiftUI View              | Description                                      |
|----------------------|---------------------------|--------------------------------------------------|
| Sample input         | `SampleInputView`         | TextEditor + file importer + Analyse button      |
| Style profile        | `StyleProfileView`        | Read-only table of StyleProfile metrics          |
| Story bible editor   | `StoryBibleEditorView`    | Editable form for the full story bible struct    |
| Chapter workspace    | `ChapterWorkspaceView`    | Beat outline, draft prose, continuity result     |
| Final story          | `FinalStoryView`          | All 3 accepted chapters; export to .txt          |

The chapter workspace screen shows three panels in an `HSplitView` (or stacked in
narrow windows):
1. Beat outline (read-only, from outline agent).
2. Prose draft (read-only, from continuation agent).
3. Continuity result: green `APPROVED` label or red `VETO` with the failing items
   and suggested fixes. Approve button / Retry button.

### 2.7 Data flow diagram

```
User paste / file open
      │
      ▼
StyleAnalyser ──► StyleProfile ───────────────────────────┐
                                                           │
User fills story bible editor                             │
      │                                                    │
      ▼                                                    │
StoryBible (AppState) ───────────────────────────────────┤
      │                                                    │
      ▼                                                    │
PipelineOrchestrator ◄────────────────────────────────── ┘
      │
      ├─► OutlineAgent ─────────────────────┐
      │                                     ▼
      ├─► StyleAgent ───────────────────────┤
      │                                     ▼
      ├─► ContinuationAgent ────────────────┤
      │                                     ▼
      └─► ContinuityAgent ─── APPROVED ──► ChapterStore (AppState)
                          └─── VETO ──────► retry (max 3)
                                              │
                                              ▼
                                         surface error in UI
```

### 2.8 Generated artefact files

These files are written by the app at runtime and live under
`/.kiro/specs/spectre-scribe/`. They are outputs, not hand-edited spec files.

| File                    | Written by          | Contents                        |
|-------------------------|---------------------|---------------------------------|
| `style-profile.json`    | StyleAnalyser       | StyleProfile struct (JSON)      |
| `story-bible.json`      | StoryBibleEditorView| StoryBible struct (JSON)        |
| `chapters/ch-1.md`      | PipelineOrchestrator| Accepted chapter 1 text         |
| `chapters/ch-2.md`      | PipelineOrchestrator| Accepted chapter 2 text         |
| `chapters/ch-3.md`      | PipelineOrchestrator| Accepted chapter 3 text         |

## 3. Key design decisions

**Why four agents instead of one?**
Separating outline, style anchoring, continuation, and continuity into discrete
agents lets each agent be given a focused, bounded prompt. A single monolithic agent
juggling all concerns tends to drift on style or skip continuity checks.

**Why a style profile instead of just a style description?**
Quantitative metrics give the style agent a verifiable target. After the chapter is
drafted, the same metrics can be recomputed on the output and compared to the sample
to detect significant drift.

**Why native macOS (SwiftUI) instead of a web app?**
The Frankenstein angle is quantitative style analysis fused with an AI relay pipeline.
A native app keeps all processing in-process (no HTTP round-trips between browser and
server), simplifies concurrency with Swift's `async/await`, and produces a shippable
.app bundle rather than a localhost server the user must remember to start.

**Why in-memory session state (`AppState`)?**
The demo scope is a single 3-chapter session. Persistent storage adds complexity
with no demo benefit. The generated artefact files (§2.8) serve as the durable
record if the user wants to reload.

**Why cap retries at 3?**
Infinite retry loops are unacceptable UX for a demo. Three retries are enough to
handle minor continuity issues; if three passes still fail, surfacing the error and
letting the user adjust the story bible is the right recovery path.
