# UX steering

This document defines the user journey, state transitions, accessibility behavior, and
failure presentation. It does not add product scope or fictional demo content.

## Visual style (confirmed 2026-11-07)

Dark "signal console" theme with a pixel-art treatment, chosen to make the
product's subject visible: a late-night radio room where a broadcast is being
caught, decoded, and re-broadcast.

- **Base:** dark background, like a radio operator's room at night. Light
  mode is not required.
- **Accent:** phosphor green as the primary signal colour (spectrum,
  waveforms, live states); warm amber as the secondary highlight (warnings,
  the relay in progress). Exact hex values live as Tailwind 4 tokens in
  `globals.css` at implementation time, not in this document.
- **Pixel treatment:** chunky pixel corners and stepped borders on panels and
  buttons, pixel-style dividers, a blinking text cursor in the chapter
  workspace, and a pixel display font for short labels, section headings, and
  agent names. Pixel font is display-only: body prose, bible fields, and
  error messages always use a readable sans/serif face, never the pixel font.
- **Tech texture:** faint grid or scanline background, monospace for signal
  data (frequencies, word counts, attempt numbers, relay receipts), serif for
  generated prose — machine parts look like a machine, story parts look like
  a story.
- **Motion:** relay progress and streaming text animate subtly; all animation
  stops under reduced-motion preferences and nothing is communicated by motion
  alone.
- **Constraints that still bind:** status is never colour alone (text + icon
  or shape, per Accessibility requirements below); contrast must hold for the
  pixel font at its smallest used size; the pixel treatment must not make any
  control harder to hit or read.

## Page layouts (added 2026-11-07)

One scrolling workspace, five sections in order, one visible section header
each. Desktop is a centred column (`max-width` ~1100px) unless a section says
two-pane. Breakpoints: mobile <640px single column, stacked; tablet
640–1024px single column with wider cards; desktop >1024px two-pane where
specified. Pixel font is used for section numbers, panel labels, and agent
names only, never for body copy. Each layout below is sketched in
plain ASCII first, then specified in prose.

### Global shell

```
+--------------------------------------------------------------+
| SPECTRE SCRIBE  *                        Saved locally [Reset]|
+--------------------------------------------------------------+
| [1 SAMPLE v] -- [2 STYLE v] -- [3 BIBLE *] -- [4 CHAPTERS] -- |
| [5 FINAL]                                                    |
+--------------------------------------------------------------+
```

- **Header (sticky):** left — wordmark `SPECTRE SCRIBE` in pixel font with a
  small blinking signal dot; right — session status (`Saved locally` /
  `Restored` / `New session`) and a `Reset session` button. No navigation
  links; the workspace is the whole app.
- **Stepper:** directly under the header, five numbered steps (Sample,
  Style, Bible, Chapters 1–3, Final) with states `done` / `current` /
  `locked`. Steps are labels, not links — the user scrolls, the stepper
  reflects progress. Current step is text + icon, never colour alone.
- **Footer:** one line — sample stays local, no account, no server storage —
  plus the Kiroween demo note. Nothing else.

### 1. Sample input

```
+-- 01 / SAMPLE ------------------------------------------------+
| Paste your own writing or public-domain text (min 200 words).|
| +----------------------------------------------------------+ |
| |                                                          | |
| |   (textarea, monospace, min-height 240px)                | |
| |                                                          | |
| +----------------------------------------------------------+ |
| [Import .txt]        132 / 200 words        [Analyse style] |
| Sample is analysed locally and never sent to the model.      |
+--------------------------------------------------------------+
```

- **Section header:** `01 / SAMPLE` + one line: paste your own writing or
  public-domain text, at least 200 words.
- **Body (single column):** labelled textarea, minimum height ~240px,
  monospace, with a character/word counter that updates as the user types.
- **Control row (below the textarea, left to right):** `Import .txt` button
  (file input, labelled) · live word count `NNN / 200 words` · primary
  `Analyse style` button, disabled until the count reaches 200.
- **Helper text:** directly under the controls — what counts as an allowed
  sample, and that the text is analysed locally and never sent to the model.
- **Error state:** inline error under the textarea naming the problem
  (`Sample is 132 words — 68 more needed`) and the fix; the user's text is
  preserved.

### 2. Style profile

```
+-- 02 / STYLE PROFILE -----------------------------------------+
| +-----------+ +-----------+ +-----------+ +-----------+     |
| | SENTENCE  | | WORD      | | DIALOGUE  | | PACING    |     |
| | LENGTH    | | VARIETY   | | RATIO     | | --  ..  . |     |
| | 18.2 wds  | | 0.71      | | 34%       | | 12 / 3 / 8|     |
| +-----------+ +-----------+ +-----------+ +-----------+     |
| +-----------+ +-----------+ +-----------+ +-----------+     |
| | ...       | | ...       | | ...       | | ...       |     |
| +-----------+ +-----------+ +-----------+ +-----------+     |
+--------------------------------------------------------------+
```

- **Section header:** `02 / STYLE PROFILE` + one line: what the sample
  measures, in numbers — not a quality judgement.
- **Metric grid (desktop 4 columns × 2 rows; tablet 2 columns; mobile 1):**
  eight cards, one per metric. Each card: metric name (pixel label), large
  monospace value, one-line definition from `requirements.md`.
- **Pacing card** spans two columns on desktop and shows its three subcounts
  (em-dash, ellipsis, sentence-final punctuation) as a small list.
- **Availability rule:** once computed, the profile stays visible while the
  user edits the bible — on desktop as a collapsed summary strip pinned above
  the bible editor (`8 metrics · avg sentence NN words · …` + `Expand`);
  on mobile as a collapsed details block at the top of the bible section.

### 3. Story bible editor

```
+-- 03 / STORY BIBLE -------------------------------------------+
| [!] 3 errors -- logline over 15 words ... (summary on top)   |
| +-- Basics -------------------------------------------------+ |
| | Genre [______]  Tone [______________________]             | |
| | Logline [______________________________]  12 / 15 words  | |
| | Synopsis (5 sentences) [_______________]  5 / 5           | |
| +----------------------------------------------------------+ |
| +-- Setting ------------------------------------------------+ |
| | Time [______]  Locations [+ Add]  World rules [+ Add]     | |
| +----------------------------------------------------------+ |
| +-- Characters ---------------------------------------------+ |
| | [ Dawn Lin .......... ] [ Aoi Hoshino ....... ] [+ Add]   | |
| +----------------------------------------------------------+ |
| +-- Foreshadowing -- Timeline -- Beat sheet (Ch 1 / 2 / 3) -+ |
+--------------------------------------------------------------+
| [Validate bible]  [Download JSON]  [Start chapter 1 relay]   |
+--------------------------------------------------------------+
```

- **Section header:** `03 / STORY BIBLE` + one line: fill every required
  field; empty fields block drafting, nothing is pre-filled.
- **Form (single column, grouped fieldsets in order):**
  1. `Basics` — genre, tone, logline (with live `NN / 15 words` count),
     five-sentence synopsis (with live sentence count `N / 5`).
  2. `Setting` — time period, locations (repeatable rows), world rules
     (repeatable rows).
  3. `Characters` — one card per character: name, role (select), status
     (select), description, goal, motivation, conflict, epiphany; `Add
     character` / `Remove` buttons with accessible names; character ids are
     shown read-only.
  4. `Foreshadowing` — table-like rows: id (read-only), description, status
     (select), deferred-to-chapter (appears only when status is `deferred`).
  5. `Timeline` — repeatable rows: chapter number + event.
  6. `Beat sheet` — three fixed chapter cards (1, 2, 3): title, premise,
     per-character status selects.
- **Validation:** field errors inline under the field; a summary box at the
  top of the section lists all errors with links that move focus to the
  field. Validating runs locally on edit and again on the server before a
  relay starts.
- **Sticky action bar (bottom of the section):** `Validate bible` ·
  `Download JSON` (only for a validated/saved state) · primary `Start
  chapter 1 relay`, disabled until the bible validates.

### 4. Chapter workspace

```
+-- 04 / CHAPTERS ----------------------------------------------+
| Chapter 1 of 3 - The Signal   [APPROVED v]   attempt 1 of 4  |
| [outline v] -> [style v] -> [continuation v] -> [continuity v]|
| +-------------------------------+--------------------------+ |
| | PROSE (serif, streaming)      | RELAY RAIL (mono)        | |
| |                               | outline: beats set ...   | |
| | Dawn Lin posts the signal...  | style: anchor 320w ...   | |
| |                               | continuation: draft ...  | |
| |                               | continuity: APPROVED     | |
| | 742 words (server)            | F1 open -> paidOff       | |
| +-------------------------------+--------------------------+ |
| [Retry from outline] [Retry from continuation] [Next chapter] |
+--------------------------------------------------------------+
```

- **Section header:** `04 / CHAPTERS` + the current chapter's title once an
  outline exists.
- **Chapter header row:** `Chapter N of 3` · title (or `Untitled chapter`) ·
  status badge (text + icon: `WAITING` / `RUNNING` / `APPROVED` / `VETO`) ·
  `attempt N of 4`.
- **Agent progress strip:** four chips in relay order
  (`outline → style → continuation → continuity`), each showing `pending` /
  `running` / `done` / `failed` as text + shape. The running chip names the
  current agent and a one-line progress description.
- **Body (desktop two-pane, 60/40; mobile stacked):**
  - **Left — prose pane:** the draft in serif, streaming as it arrives; a
    blinking cursor while running; server word count under the prose once
    complete. A VETO does not hide the draft — it stays visible with the
    failure panel beside it.
  - **Right — relay rail:** the relay receipt for the latest pass (one entry
    per agent: what it did, what it changed) plus every foreshadowing status
    transition in that pass; shown for approved and vetoed passes alike.
- **VETO panel (full width, under the panes when present):** one row per
  failing check — check id, the violated bible field, plain-language
  message, minimal suggested fix.
- **Control row:** `Retry from outline` · `Retry from continuation` (only
  when that checkpoint is valid, otherwise disabled with a reason) ·
  `Next chapter` (only after `APPROVED`). All three disabled while a run is
  active. No automatic rewrite ever starts from a VETO.

### 5. Final story

```
+-- 05 / FINAL STORY -------------------------------------------+
| Three strangers decode a pirate anime broadcast...            |
| Total: 2,214 words                                            |
| +-- Chapter 1 - The Signal - 742 words ---------------------+ |
| | (prose)                                                    | |
| | [v] Relay receipt -- Chapter 1 (collapsed)                 | |
| +----------------------------------------------------------+ |
| +-- Chapter 2 - The Countdown - 781 words ------------------+ |
| +-- Chapter 3 - The Last Broadcast - 691 words -------------+ |
| [Ch1 .md] [Ch2 .md] [Ch3 .md] [Full story .md] [Bible .json] |
+--------------------------------------------------------------+
```

- **Section header:** `05 / FINAL STORY` + total word count across the three
  accepted chapters.
- **Body:** the three accepted chapters in order. Each chapter block: title,
  server word count, prose in serif, and a collapsible relay receipt
  (`Relay receipt — Chapter N`, collapsed by default).
- **Download row:** `Download chapter 1 (.md)` · `Download chapter 2 (.md)` ·
  `Download chapter 3 (.md)` · `Download full story (.md)` · `Download
  story bible (.json)`.
- **Incomplete state:** if a chapter is missing, that chapter's slot shows
  `Chapter N — not yet accepted` with a `Go to chapter N` action instead of
  invented text.

## Workspace flow

The primary flow is sequential, but completed sections remain reviewable:

```text
Sample input
  -> Style profile
  -> Story bible editor
  -> Chapter workspace (chapter 1, then 2, then 3)
  -> Final story
```

A user may return to an earlier section to correct input before starting the next gated
operation. Starting a relay pass is disabled until the sample is analyzed and the story
bible validates. Starting chapter 2 is disabled until chapter 1 is accepted. Chapter 4 has
no control or route.

### Sample input

- Provide a labelled textarea for paste and a labelled `.txt` file input.
- Explain that the text must be the user's own writing or public-domain text. Do not offer
  retrieval, crawling, or commercial-text suggestions.
- Show a deterministic length count and the language's minimum threshold (200 words or
  400 字) before submitting analysis.
- Keep the sample transient by default. Do not put it in a prompt, event, download, log, or
  `localStorage` record unless an owner later changes the privacy decision.
- Show an inline error that names the problem and how to fix it. Preserve the user's input
  while the error is visible.

### Style profile

- Display all eight metrics as read-only values with the exact definitions from
  `requirements.md`.
- Present pacing markers as one metric with its em-dash, ellipsis, and sentence-final
  punctuation subcounts.
- Explain that the values describe the supplied sample quantitatively; they do not prove
  literary quality or guarantee that generated prose will match it.
- Keep the profile available while the user edits the story bible and reviews chapters.

### Story bible editor

- Expose every field in the required schema, including repeatable arrays, enums,
  relationships, deferred foreshadowing targets, and all three beat-sheet entries.
- Start with an empty/TBD editing state, not a fabricated title, plot, name, location, or
  passage. Empty fields may be edited but block drafting.
- Give add/remove controls clear accessible names. Preserve IDs and relationship errors
  when an array item is edited.
- Validate locally for immediate feedback, then validate the same snapshot on the server
  before a pipeline run.
- Offer the JSON bible download only for the current validated or explicitly saved editor
  state; the browser creates the file.

### Chapter workspace

For the active chapter, show the current state in text as well as visually:

- waiting for input;
- running, with the current agent and a short progress description;
- draft and structured checkpoints as they arrive;
- `APPROVED` with server word count;
- `VETO` with each failing continuity check, the violated bible field, and the minimal fix;
- a relay receipt for the pass: one entry per agent (what it did and changed),
  plus every foreshadowing status transition in that pass. Show it for approved
  and vetoed passes alike;
- interrupted, configuration, provider, validation, or terminal retry errors.

Show the retry number as `attempt 1 of 4`, `attempt 2 of 4`, and so on, where the first
attempt is not a retry. Disable duplicate start, retry, and next-chapter controls while a
run is active. A chapter is not added to accepted chapters until the client receives a
validated `chapter-accepted` event.

A VETO is reviewable output, not a hidden rewrite. Let the user choose `outline` or
`continuation` only when the corresponding checkpoint is valid. If it is not valid, explain
why the server will restart at outline. Transport recovery is presented separately from a
user-visible chapter retry.

### Final story

- Render exactly the accepted chapters in order, with their user/model-provided titles and
  server word counts.
- Show one relay receipt per accepted chapter (collapsible), so the final story carries
  its own audit trail: what each agent did and what foreshadowing changed in that chapter.
- Keep individual chapter Markdown downloads and the complete three-chapter Markdown
  download in the browser.
- Keep the JSON story-bible download available without adding runtime files to the server or
  repository.
- If the session is incomplete, show the missing chapter as a next action rather than
  inventing text.

## Session and restore behavior

The active state lives in React. A versioned serialisable session may contain the style
profile, editable bible, pending relay result, accepted chapters, continuity ledger, retry
counters, and pipeline status. It does not contain provider configuration, authorization
headers, raw diagnostic errors, or secrets.

On load:

1. Read the namespaced storage record only in a client component.
2. Parse JSON and check the session version.
3. Validate every nested object with the shared runtime validators.
4. Restore only valid data and show a non-blocking restoration notice.
5. Discard corrupted, unsupported, or invalid data with a visible explanation and a clean
   starting state.

A browser refresh must not create a second active model run. Abort or mark a stale run as
interrupted, preserve the latest complete checkpoint, and require an explicit resume or
retry action.

## Accessibility requirements

- Use semantic headings and landmarks for the five workflow sections. A user must be able
  to understand the current section without relying on color or animation.
- Every control has a visible label or an accessible name. Connect descriptions and errors
  with `aria-describedby`; do not use placeholder text as the only label.
- Validation messages identify the field, use plain text, and remain available to assistive
  technology. Move focus to the first invalid field or an error summary after a failed
  submit.
- Put progress and terminal run status in a small `role="status"` or equivalent live
  region. Do not announce every prose delta; announce agent transitions, vetoes, acceptance,
  interruption, and completion.
- Preserve a visible focus indicator and keyboard order. Do not trap focus in the workspace
  or make a modal the only way to dismiss a non-critical notice.
- Do not communicate status through color alone. Pair `APPROVED`, `VETO`, retry, and error
  colors with text and an icon or shape that has an accessible label.
- Respect reduced-motion preferences. Streaming text, progress, and results must remain
  available when animation is disabled.
- Use semantic buttons, labels, lists, tables, and headings before adding ARIA. Test with
  keyboard navigation and semantic browser queries.

## Empty, loading, and error states

Every panel has a defined state before data exists:

- no sample: explain the input and source requirement;
- sample too short: show the count and threshold;
- no profile: explain that analysis must finish first;
- empty bible: invite the user to fill the required fields without sample content;
- no accepted chapter: show the current chapter action;
- no provider configuration: show a safe configuration message without revealing which
  secret is missing beyond the stable error code selected by the server;
- interrupted stream: preserve complete checkpoints and offer one recovery action;
- terminal retry failure: explain the cap and offer editing or a new session, not an implicit
  fifth call.

Loading controls communicate what is happening and remain cancellable where the operation
supports cancellation. Error messages avoid raw provider bodies, URLs with credentials,
stack traces, prompts, and full request payloads.

## Bible drafting, live mode, and replay

- The Story Bible panel opens with two paths: `Draft from a seed` and `Fill in by hand`.
  The seed form has genre, tone, idea (counter: 2 sentences max), and optional notes.
- A draft layer shows beside the editor under a `DRAFT — not in your bible` label, with
  `Accept`, `Edit then accept`, and `Redraft (N of 3 left)`. Accepting over user text asks
  first and offers one undo.
- Live controls show a small `LIVE` badge. Without a code, they show a code field and a
  `Watch a recorded run` button. A refusal shows its plain message and the replay button,
  never a raw status code alone.
- Replay shows a fixed `REPLAY · recorded <date> · <models>` banner, speed controls (1x, 2x,
  skip to end), and an `Exit replay` button. Edit controls are disabled during replay.

## Language and CJK

The app handles English and Chinese (`requirements.md` REQ-24 to REQ-29).

- The wireframes in this file show English values. Wherever a wireframe shows `200 words` or
  `15 words`, the UI shows the active language's threshold and unit, for example
  `NNN / 400 字` and `NN / 30 字`. The counter uses `lib/text-units.ts`.
- The Sample Input panel shows the detected language (`English` or `中文`) next to the counter,
  with a switch to correct it before analysis.
- The pixel display font is for Latin labels and numbers only. Prose, data values, and any
  Chinese text use a font stack with a CJK-capable fallback (system sans or serif for `zh`).
- UI chrome is available in English and Simplified Chinese (P1). The UI language is independent
  of the story language. Both come from small string dictionaries, not an i18n framework.
- A story bible written in a different language from the sample shows a non-blocking warning.
- Downloads are UTF-8; file names stay ASCII.

## References checked 2026-11-07

- [WAI: text descriptions for required-field errors](https://www.w3.org/WAI/WCAG22/Techniques/general/G83)
- [WAI: text descriptions for input errors](https://www.w3.org/WAI/WCAG22/Techniques/general/G85)
- [WAI: `role=status` for status messages](https://www.w3.org/WAI/WCAG22/Techniques/aria/ARIA22)
- [WAI: live regions for errors](https://www.w3.org/WAI/WCAG22/Techniques/aria/ARIA19)
- [shadcn/ui Next.js installation](https://ui.shadcn.com/docs/installation/next)
