# Requirements — Spectre Scribe

## 1. Overview

Spectre Scribe is a native macOS multi-agent novel writing studio. The user supplies
a sample passage (their own writing or public-domain text only). The app derives
style statistics from it, builds a story bible, then orchestrates four Kiro Crew
agents in relay to draft a 3-chapter science-fiction short story, with a continuity
hook enforcing consistency after every chapter draft.

Kiroween 2026 track: Frankenstein (combining things that do not normally go together —
namely, quantitative style analysis fused with narrative AI relay writing).

## 2. Functional Requirements

### 2.1 Sample ingestion

REQ-01: The user SHALL be able to paste or import a text passage (their own writing
        or public-domain text only) through the native macOS UI.

REQ-02: The system SHALL reject empty input and input shorter than 200 words with a
        clear validation message shown in the UI.

REQ-03: The system SHALL NOT crawl, fetch, or store any text from commercial novel
        sites or copyrighted sources.

### 2.2 Style statistics

REQ-04: Given the sample passage, the system SHALL compute the following style
        metrics and expose them as a structured document (the "style profile"):

        a. Mean and standard deviation of sentence length (words per sentence).
        b. Vocabulary richness: type-token ratio over the full sample.
        c. Dialogue ratio: percentage of word-count that is inside quotation marks.
        d. Pacing markers: count of em-dashes, ellipses, and sentence-final
           punctuation (`.`, `!`, `?`) per 100 words.
        e. Paragraph length distribution: mean and SD of words per paragraph.
        f. Average word length (characters per word, stopwords excluded).

REQ-05: The style profile SHALL be held in the app's in-memory session state and
        passed to the style agent as a named input.

### 2.3 Story bible

REQ-06: The system SHALL generate a story bible before chapter drafting begins. The
        story bible SHALL contain:

        a. Genre and tone statement.
        b. Setting: time period, location(s), world rules (one paragraph each).
        c. Character roster: name, role (protagonist / antagonist / supporting),
           initial status (alive), and one-sentence description for each character.
        d. Foreshadowing list: each entry has an ID, a brief description of the
           planted element, and a "status" field (open | paid-off | dropped).
           Dropped is invalid and will be caught by the continuity hook.
        e. Timeline: ordered list of story events with chapter numbers.
        f. Chapter-by-chapter beat sheet: chapter number, title, one-sentence
           premise, and entry/exit states for each major character.

REQ-07: The story bible SHALL be editable by the user in the native macOS UI before
        chapter drafting begins.

REQ-08: The exact plot and character names for the demo are NOT fixed in this spec
        (TBD at demo time). The schema above is mandatory; the content is TBD.

### 2.4 Four-agent relay pipeline

REQ-09: Chapters SHALL be produced one at a time through a relay of four Kiro Crew
        agents in the following fixed order:

        1. outline agent   — produces a structured beat outline for the chapter.
        2. style agent     — rewrites or produces prose matching the style profile.
        3. continuation agent — extends or polishes the prose into a complete draft.
        4. continuity agent   — audits the draft against the story bible and either
                                APPROVES or returns a VETO with specific fixes.

REQ-10: If the continuity agent vetoes a draft, the pipeline SHALL loop back to the
        outline agent (or the continuation agent, at the user's option) with the
        veto notes appended as additional context, and retry. The loop SHALL be
        capped at 3 retries per chapter.

REQ-11: Every agent in the relay SHALL receive as context:
        - the style profile,
        - the full story bible,
        - all previously accepted chapter texts (read-only),
        - the outputs of the earlier agents in the current chapter's relay pass.

REQ-12: Agents SHALL NOT have write access to the story bible. Only the user may
        edit it.

### 2.5 Continuity hook checks

REQ-13: The continuity hook SHALL run after every continuation agent draft, before
        the chapter is accepted. It SHALL check:

        a. Character alive/dead: no character who died in a prior accepted chapter
           appears as a speaking or acting participant in the new draft unless the
           story bible explicitly permits it (e.g., flashback, ghost).
        b. Timeline order: every event referenced in the draft is consistent with
           the timeline in the story bible; no effect precedes its cause.
        c. Foreshadowing payoff: every foreshadowing entry that was "open" in the
           previous chapter is either still open, paid off in this chapter, or
           explicitly deferred (new "deferred-to-chapter" field set). It MUST NOT
           simply disappear.

REQ-14: On a continuity failure, the hook SHALL return:
        - the specific failing items (not a full chapter rewrite),
        - the story bible fields that the items violate,
        - a minimal suggested fix for each item.

REQ-15: The hook result SHALL be displayed in the native macOS UI alongside the
        draft so the user can review before triggering a retry.

### 2.6 Native macOS UI

REQ-16: The app SHALL have the following screens / panels:
        a. Sample input — paste or open a .txt file, trigger style analysis.
        b. Style profile — display computed metrics; read-only.
        c. Story bible editor — display and allow editing of all story bible fields.
        d. Chapter workspace — show per-chapter: beat outline, prose draft, and
           continuity check result. Allow the user to approve or request a retry.
        e. Final story — render all accepted chapters in sequence; export to .txt.

REQ-17: The app SHALL run entirely on the local machine; no external API calls to
        third-party services SHALL be made at runtime.

REQ-18: The demo scope is exactly 3 chapters. The app SHALL enforce this limit.

### 2.7 Non-functional requirements

REQ-19: The full pipeline (sample analysis + 3 chapters, no retries) SHALL complete
        within 3 minutes on a developer Mac, measured end-to-end.

REQ-20: The app SHALL target macOS 14 (Sonoma) or later and SHALL be buildable with
        `swift build` or Xcode without additional toolchain installation.

REQ-21: All Kiro configuration (agents, hooks, specs, steering) SHALL live under
        `/.kiro` at the repo root and SHALL NOT be gitignored.

REQ-22: No generated story chapter SHALL exceed 800 words. This is not a
        million-word generator.

## 3. Constraints and Out-of-Scope

- No crawling of commercial novel sites or any third-party text source.
- No use of copyrighted text as sample input (enforced by terms, not code).
- No browser or web UI; native macOS delivery only.
- No persistent user accounts or server-side storage across sessions.
- Long-form generation (novellas, full novels) is out of scope.
- The demo plot and character names are TBD and SHALL NOT be hardcoded in the spec.
