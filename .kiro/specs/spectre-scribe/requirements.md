# Requirements — Spectre Scribe

## 1. Overview

Spectre Scribe is a Next.js 15 full-stack Web app. The user supplies a sample
passage through the browser, the app derives quantitative style statistics, the
user edits a story bible, and a server-side pipeline orchestrates four agents in
relay to draft a 3-chapter science-fiction short story. A continuity check runs
before every chapter is accepted.

The browser and server live in the same repository. The browser uses React 19,
TypeScript, Tailwind CSS 4, and shadcn/ui. Next.js App Router Route Handlers are
the backend boundary. The Kiroween 2026 track is Frankenstein: quantitative style
analysis is combined with a narrative AI relay pipeline. The app supports
English and Chinese: the story language is the language of the sample (section
2.8).

The demo plot, character names, and sample passage are TBD. They SHALL NOT be
invented or hardcoded in this specification.

## 2. Functional Requirements

### 2.1 Sample ingestion

REQ-01: The user SHALL be able to paste or import a text passage through the Web
        UI. The passage SHALL be the user's own writing or public-domain text only.

REQ-02: The system SHALL reject empty input and input shorter than the minimum
        sample length for the detected language (200 words for English, 400 字
        for Chinese; REQ-24) with a clear validation message shown in the Web UI.

REQ-03: The system SHALL NOT crawl, fetch, or store text from commercial novel
        sites or other copyrighted sources. The sample input is supplied by the
        user and is not retrieved by the application.

### 2.2 Style statistics

REQ-04: Given a valid sample passage, the system SHALL compute exactly these eight
        quantitative style metrics and expose them as a structured style profile.
        In the definitions below, "word" means the length unit of the detected
        language (a word for English, a character (字) for Chinese), and the
        language-specific rules of REQ-26 apply. The eight metrics and their
        field names are identical in both languages:

        a. Sentence-length mean: the mean number of words in each sentence, using
           `.`, `!`, and `?` as sentence-final boundaries.
        b. Sentence-length standard deviation: the standard deviation of the same
           sentence word-count values.
        c. Vocabulary richness: type-token ratio over the full sample, calculated
           as unique normalized tokens divided by total normalized tokens. Tokens
           are lowercased and punctuation is removed.
        d. Dialogue ratio: the proportion of all word tokens that occurs inside
           quotation marks.
        e. Pacing markers: the count per 100 words of em-dashes, ellipses, and
           sentence-final punctuation (`.`, `!`, `?`). These three counts are the
           subfields of one pacing-marker metric.
        f. Paragraph-length mean: the mean number of words in each paragraph,
           with paragraphs split on blank lines.
        g. Paragraph-length standard deviation: the standard deviation of the same
           paragraph word-count values.
        h. Average word length: mean characters per word after stopwords are
           excluded.

        The implementation SHALL retain these definitions when serialising and
        displaying the profile; it SHALL NOT replace them with an unquantified
        style description.

REQ-05: Style analysis SHALL run in the pure TypeScript module
        `lib/style-analyser.ts`, with no network or file I/O. The resulting style
        profile SHALL be held in React session state and passed to the style agent
        as a named input. The module SHALL be unit-tested with Vitest.

### 2.3 Story bible

REQ-06: Before chapter drafting begins, the system SHALL create a story bible
        with this schema. Field names and nested relationships are part of the
        contract:

        ```ts
        type StoryBible = {
          genre: string;
          tone: string;
          logline: string; // Snowflake Step 1: one sentence, at most 15 words (30 字 for Chinese; REQ-24), no character names.
          synopsis: string; // Snowflake Step 2: exactly five sentences (setup, disaster 1, midpoint, disaster 2, resolution).
          setting: {
            timePeriod: string;
            locations: string[];
            worldRules: string[];
          };
          characters: Array<{
            id: string;
            name: string;
            role: "protagonist" | "antagonist" | "supporting";
            status: "alive" | "dead" | "unknown";
            description: string;
            goal: string; // Snowflake Step 3: what the character wants.
            motivation: string; // Snowflake Step 3: why the character wants it.
            conflict: string; // Snowflake Step 3: what stands in the way.
            epiphany: string; // Snowflake Step 3: what the character learns by the end.
          }>;
          foreshadowing: Array<{
            id: string;
            description: string;
            status: "open" | "paidOff" | "deferred";
            deferredToChapter?: number;
          }>;
          timeline: Array<{
            chapterNumber: number;
            event: string;
          }>;
          beatSheet: Array<{
            chapterNumber: number;
            title: string;
            premise: string;
            characterStates: Record<
              string,
              "alive" | "dead" | "unknown"
            >;
          }>;
        };
        ```

        The setting SHALL record a time period, locations, and world rules, with
        each world rule represented as one paragraph. The bible SHALL record a
        logline of at most 15 words (30 字 for Chinese) with no character names and a five-sentence
        synopsis (setup, disaster 1, midpoint, disaster 2, resolution), per the
        Snowflake Method in `steering/snowflake.md`. The character roster SHALL
        record each character's name, role, initial status (alive for a new
        character), and one-sentence description, plus goal, motivation,
        conflict, and epiphany. The roster SHALL contain at least one
        `protagonist`; there is no upper limit on protagonists, antagonists, or
        supporting characters beyond the drafting range of REQ-30. The foreshadowing list SHALL
        identify each planted element and its status. `deferred` entries SHALL
        include `deferredToChapter`; a silently dropped item is invalid. The
        beat sheet SHALL contain one entry for each demo chapter and SHALL record
        a character state for each major character by ID. Successive chapter
        entries make the entry/exit transition explicit without changing the
        `characterStates` map shape.

REQ-07: The story bible SHALL be editable by the user in the Web UI before
        chapter drafting begins. Agents SHALL receive a validated snapshot of the
        current bible as read-only context.

REQ-08: The exact plot, character names, and sample passage for the demo are NOT
        fixed in this specification. They remain TBD at demo time, while the
        schema in REQ-06 is mandatory.

### 2.4 Four-agent relay pipeline

REQ-09: Chapters SHALL be produced one at a time through four server-side agents
        in this fixed order:

        1. outline agent — produces a structured beat outline for the chapter.
        2. style agent — writes or rewrites prose to match the style profile.
        3. continuation agent — extends or polishes the prose into a complete
           chapter draft.
        4. continuity agent — audits the draft against the story bible and either
           APPROVES or returns a VETO with specific fixes.

        The definitions are the existing files in `/.kiro/agents/outline.md`,
        `style.md`, `continuation.md`, and `continuity.md`. The server SHALL load
        and call those definitions through an OpenAI-compatible interface. The
        files are read-only inputs: application code SHALL NOT modify them;
        their contents change only by deliberate owner edit. They carry full role prompts and output
        contracts (authored by the owner on 2026-11-07, T-29); any later change
        to them is a deliberate owner edit. Language-specific limits reach the
        agents through the run-parameters block of REQ-27, which takes
        precedence over a length stated in an agent file.

REQ-10: If the continuity agent vetoes a draft, the server pipeline SHALL loop
        back to the outline agent, or to the continuation agent when the user has
        selected that retry option, with the veto notes appended as context. A
        continuation retry SHALL reuse the valid outline and style outputs from
        the vetoed pass; if either is missing or invalid, it SHALL restart at
        outline. The first execution is not a retry. Each chapter SHALL have at
        most 3 retries after that first execution. A fourth failed pass SHALL end the chapter
        with a surfaced error rather than start another retry.

REQ-11: Every agent in the relay SHALL receive the following read-only context:
        - the style profile;
        - the full story bible snapshot;
        - all previously accepted chapter texts, read-only;
        - outputs from earlier agents in the current chapter relay pass; and
        - veto notes when the pass is a retry.

REQ-12: Agents SHALL NOT have write access to the story bible. Only the user edit
        flow may replace the active client-side bible, and each pipeline pass uses
        a snapshot of it. A bible draft from the outline agent (REQ-30) is a
        proposal; it enters the bible only through the user's accept action.

### 2.5 Continuity checks

REQ-13: The base continuity check contract in `/.kiro/hooks/continuity-check.md`
        SHALL be applied after every continuation draft and before a chapter is
        accepted. Without modifying that file, the server-side continuity stage
        SHALL enforce the following complete contract:

        a. Character alive/dead: a character who died in a prior accepted chapter
           SHALL NOT appear as a speaking or acting participant in the new draft
           unless the story bible explicitly permits a flashback, memory, ghost,
           or equivalent exception.
        b. Timeline order: every event referenced in the draft SHALL be consistent
           with the ordered story bible timeline; no effect may precede its cause.
        c. Foreshadowing payoff: every foreshadowing entry that was `open` after
           the previous accepted chapter SHALL remain explicitly open, become
           `paidOff`, or become `deferred` with `deferredToChapter` set. It SHALL
           NOT silently disappear. By chapter 3, an open item SHALL be paid off.

REQ-14: On a continuity failure, the check SHALL return specific failing items,
        the story bible fields violated by those items, and a minimal suggested
        fix for each item. It SHALL NOT replace the full chapter automatically.
        A successful check SHALL return `APPROVED`; a failed check SHALL return
        `VETO` with structured failure data.

REQ-15: The continuity result SHALL be streamed to and displayed in the Web UI
        alongside the beat outline and draft so the user can review the result
        before requesting a retry.

### 2.6 Web UI and downloads

REQ-16: The app SHALL provide these browser views or panels:

        a. Sample input — paste or import a `.txt` file and trigger style
           analysis.
        b. Style profile — display all eight computed metrics and their
           definitions as read-only data.
        c. Story bible editor — display and edit every field in the REQ-06 schema.
        d. Chapter workspace — show the per-chapter beat outline, prose draft,
           streamed agent progress, and continuity result. Allow approval or a
           retry request.
        e. Final story — render all three accepted chapters in sequence.

        The interface SHALL use React components styled with Tailwind CSS 4 and
        accessible shadcn/ui primitives. The story bible SHALL be downloadable
        as JSON. Each accepted chapter and the complete story SHALL be
        downloadable as Markdown files.

REQ-17: The browser SHALL call the server only through Next.js App Router Route
        Handlers. The server SHALL call the configured OpenAI-compatible model
        endpoint; no model key or credential may be sent to the browser.
        Pipeline progress and agent output SHALL stream to the browser with
        Server-Sent Events (SSE).

### 2.7 Runtime, scope, and security

REQ-18: The demo scope SHALL be exactly 3 chapters. The application SHALL reject
        or disable any request for a fourth chapter.

REQ-19: The full flow, including sample analysis and all 3 chapters with no
        retries, SHALL complete within 3 minutes in the intended deployment
        environment. The time is machine time, measured from the style-analysis
        request to the terminal event of chapter 3; it excludes the time the
        user spends reading, editing the story bible, or choosing to start each
        chapter. The target applies to both English and Chinese runs.

REQ-20: No generated chapter SHALL exceed the chapter limit of REQ-24 (800 words
        for English, 1,500 字 for Chinese). The server SHALL validate this limit,
        counted in the language's length unit, before accepting a chapter.

REQ-21: Active session data SHALL live in React state and be restored from
        `localStorage`. The session SHALL include a derived continuity ledger
        beside accepted chapters so later checks can use the last accepted
        character and foreshadowing states. The ledger is not a story bible
        mutation. The application SHALL not use a database or a server-side
        story store. The server SHALL receive the style profile, story bible,
        accepted chapters, and ledger in validated request/session payloads rather
        than rely on a long-lived in-memory session.

REQ-22: The server SHALL read model configuration only from the environment
        variables `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`, and the optional
        `LLM_MODEL_PREMIUM`. `LLM_MODEL_PREMIUM` serves the continuity agent
        only; when it is unset, `LLM_MODEL` serves every agent. Both models use
        the same base URL and key. These values,
        especially the key, SHALL never be committed, placed in client code,
        logged, put in prompts, or included in downloaded files. No real API key
        or password SHALL appear in this repository.

REQ-23: All Kiro configuration SHALL remain under `/.kiro` at the repository root
        and SHALL NOT be gitignored. Application code SHALL NOT modify
        `/.kiro/agents/` or `/.kiro/hooks/` at runtime; their contents change
        only by deliberate owner edit.

### 2.8 Language support (English and Chinese)

REQ-24: The system SHALL support samples and generated stories in English (`en`)
        and Chinese (`zh`). The story language is the language of the sample.
        Every length rule uses one length unit: a word for `en`, a character
        (字) for `zh`. The language-dependent values are:

        | Rule | `en` | `zh` |
        | --- | --- | --- |
        | Length unit | word: each run of letters (with inner apostrophes or hyphens) counts 1; each run of digits counts 1; punctuation counts 0 | 字: each Han character counts 1; each run of Latin letters or digits counts 1; kana, hangul, other scripts, emoji, and punctuation count 0 |
        | Minimum sample | 200 | 400 |
        | Logline maximum | 15 | 30 |
        | Style anchor maximum | 400 | 700 |
        | Chapter maximum (REQ-20) | 800 | 1,500 |

        The `zh` values are initial values, to be tuned against measured output
        in T-25 and T-27.

REQ-25: Language detection SHALL be local and deterministic, with no network call
        and no LLM. Detection runs in this order:

        1. If hiragana, katakana, hangul, and Thai characters together are at
           least 5% of the letter characters, the sample is "other".
        2. Else, if the sample has no Han characters and no Latin word runs,
           it is "other".
        3. Else, the sample is `zh` when its Han characters are at least 50% of
           its Han characters plus its Latin word runs; otherwise it is `en`. The
        detected language SHALL be stored in the style profile and shown to the
        user, who MAY override it before analysis. An "other" sample is analysed
        with the `en` rules, and the Web UI SHALL show a notice that
        results are reliable only for English and Chinese.

REQ-26: The eight metrics SHALL follow these language-specific rules:

        a. Sentence boundaries (both languages): `.`, `!`, `?`, `。`, `！`, `？`.
           A closing quote or bracket directly after the mark stays in the same
           sentence. A period between two digits is not a boundary. An ellipsis
           is not a boundary: `…`, `……`, and three or more `.` in a row. Any other
           run of boundary marks (`?!`, `！？`, `。。`) is one boundary, so no
           empty sentence is created. Sentences never cross a paragraph break. A final fragment without
           a mark counts as one sentence.
        b. Vocabulary richness and average word length: `en` tokens are Unicode
           letter runs (apostrophes and hyphens inside a word stay in it); `zh`
           tokens are the word-like segments from `Intl.Segmenter("zh")` with
           word granularity. Stopwords come from a versioned local list for each
           language. If the segmenter is unavailable the `zh` path SHALL fall
           back to one character per token and set `segmentation: "char"` in the
           profile.
        c. Dialogue delimiters: `"…"` and `“…”` in both languages; `「…」` and
           `『…』` also in `zh`. Single curly quotes count only when nested inside
           a double-quote pair. An unmatched opening delimiter counts nothing
           beyond the end of its paragraph.
        d. Pacing markers, per 100 length units: a run of em-dashes (`—`, `——`)
           counts once; a run of ellipsis marks (`…`, `……`, `...`) counts once;
           sentence-final punctuation counts once per boundary mark run (`?!` and
           `。。` each count once).
        e. Paragraphs: `en` splits on blank lines; `zh` splits on any line
           break. Leading spaces and U+3000 are ignored.

REQ-27: Every agent call SHALL receive a run-parameters block that states the
        story language, the length unit, and the limits of REQ-24. Story prose and
        all free-text output fields (beats, style anchor, receipt summaries,
        failure violations and fixes) SHALL be in the story language. JSON keys,
        enum values, ids, and check ids stay in English. The server SHALL apply
        the same length unit and the same sentence splitter (REQ-26a) to its own
        validation: chapter limit, logline limit, the five-sentence synopsis, and
        one-sentence character descriptions. If the story bible is written in a
        different language from the sample, the Web UI SHALL warn and SHALL NOT
        block.

REQ-28: (P1; cut first if time is short) The Web UI chrome SHALL be available in
        English and Simplified Chinese, chosen from the browser language with a
        manual switch. The UI language is independent of the story language.
        Downloads SHALL be UTF-8. The UI font stack SHALL include a CJK-capable
        fallback.

REQ-29: The end-to-end acceptance run SHALL pass once with an English sample and
        once with a Chinese sample. Both samples SHALL be user-owned or public
        domain and SHALL NOT be hardcoded in the specification or the code.

### 2.9 Story bible drafting

REQ-30: The user SHALL be able to ask for a story bible draft instead of filling
        every field by hand. The user supplies a seed: genre, tone, an idea of at
        most two sentences, and optional notes on characters or setting. The
        outline agent in `plan` mode SHALL draft the bible in two layers, each one
        bounded call:

        The idea is at most two sentences; the notes are at most 600 length
        units.

        a. `core`: logline, five-sentence synopsis, setting, and two to four
           characters with goal, motivation, conflict, and epiphany.
        b. `structure`: two to four `open` foreshadowing items, the timeline, and
           exactly three beat-sheet entries whose premises form the one-page
           synopsis.

        The user SHALL review and may edit the `core` layer before `structure` is
        requested. The `structure` call SHALL receive the approved `core` layer
        and SHALL NOT change it. Every field stays editable after drafting. Manual
        entry without drafting SHALL remain possible.

REQ-31: Each draft layer SHALL be validated on the server against the REQ-06
        schema and the language limits of REQ-24 before it is returned. A layer
        that fails validation is a failed call. Each layer allows at most 3
        retries. Drafting uses the standard model (`LLM_MODEL`) and counts toward
        the limits of REQ-32. Drafting time is excluded from the 3-minute target
        of REQ-19, like the user's editing time.

REQ-32: Live model calls SHALL be protected against abuse on the public URL:

        a. Live mode SHALL require a demo access code. The code is held only in
           the server variable `DEMO_ACCESS_CODE`. A request without a valid code
           SHALL be refused before any model call. If `DEMO_ACCESS_CODE` is unset,
           live mode SHALL be off in Production and on in local development.
        b. Requests SHALL be limited per client IP: at most 1 live request at a
           time, 8 chapter passes and 6 draft layers per 10 minutes.
        c. All live requests together SHALL be limited per UTC day: at most 60
           chapter passes and 60 draft layers. Each chapter pass makes at most
           2 premium-model calls (1 continuity call plus 1 transport retry), so
           premium calls are capped at 120 per day (60 without retries). Draft
           layers use only the standard model.
        d. Ten wrong access codes from one IP within 10 minutes SHALL lock that
           IP out of live mode for 10 minutes. A locked-out request SHALL be
           refused with HTTP 429 `rate-limited`, even with a valid code.
        e. A refused request SHALL return HTTP 401, 429, or 503 with a stable
           error code and, for 429, a retry-after time. No model call SHALL
           happen.
        f. Limits are server constants. The counters hold no story data and no
           raw IP address; the IP is hashed with a server secret.

REQ-33: The app SHALL offer a replay mode that plays a recorded run with no model
        call and no access code:

        a. A replay file holds the style profile, the story bible, the full
           ordered pipeline event stream with relative times, and metadata
           (record date, language, standard and premium model names, app
           version). It holds the generated agent outputs as they appear in the
           app's own SSE events. It SHALL NOT hold the raw sample, prompts, keys,
           unprocessed provider payloads (raw response envelopes, token-usage
           records, request metadata), or IP data.
        b. The UI SHALL play a replay through the same components and state
           rules as a live run, at 1x, 2x, or skip-to-end. It SHALL be labelled
           `REPLAY` with the record date and model names at all times.
        c. The UI SHALL offer replay when live mode is off, when the access code
           is missing or wrong, and when a live request is refused by REQ-32.
        d. A replay file SHALL be recorded only from a real live run, in local
           development, by downloading the client's own event log. It SHALL NOT
           be edited by hand except to remove data that REQ-33a forbids.
        e. The app SHALL ship at least one English and one Chinese replay. Their
           story content comes from the owner's real demo runs; the specification
           still does not fix any plot, name, or sample (REQ-08).

## 3. Constraints and Out of Scope

- The four-agent order is fixed: outline -> style -> continuation -> continuity.
- No crawling of commercial novel sites or any third-party text source.
- No use of copyrighted text as sample input.
- No persistent user accounts, database, or server-side story storage across
  sessions. The rate-limit counter store of REQ-32 holds only counters and
  hashed IPs, never story data.
- Long-form generation beyond the exactly 3-chapter demo is out of scope.
- Languages other than English and Chinese are out of scope. Japanese, Korean,
  and Thai need their own segmentation and are not supported. Traditional
  Chinese is analysed like Simplified Chinese, with no conversion.
- The demo plot, character names, and sample passage are TBD and SHALL NOT be
  hardcoded in this specification.
- The intended local command is `pnpm dev`. The intended deployment path is a
  GitHub-connected automatic deployment to Vercel; Devpost receives the public
  deployed URL.
