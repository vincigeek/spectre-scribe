# Product steering

Spectre Scribe is a Next.js 15 full-stack Web app where four server-side agents write a
short story in relay. The browser provides the workspace; Next.js Route Handlers run the
model calls and pipeline orchestration in the same repository.

The Kiroween 2026 track is Frankenstein: quantitative style analysis is combined with a
narrative AI relay pipeline. The product is a browser-based three-chapter demonstration,
not an account system, publishing platform, or long-form novel generator.

## Product invariants

These rules are product constraints, not suggestions:

- The user supplies a sample through paste or `.txt` import. The sample must be the user's
  own writing or public-domain text. The application never crawls, fetches, or recommends
  commercial novel text.
- The app supports English and Chinese. The story language is the language of the sample,
  detected locally (`requirements.md` REQ-24 to REQ-29). All length rules use one length
  unit: a word for English, a character (字) for Chinese.
- Empty input and input shorter than the minimum (200 words for English, 400 字 for
  Chinese) are rejected before analysis. The same deterministic length-unit policy is used
  for the minimum check and the profile.
- Analysis returns exactly the eight metrics in `requirements.md`: sentence-length mean,
  sentence-length standard deviation, vocabulary richness, dialogue ratio, pacing markers,
  paragraph-length mean, paragraph-length standard deviation, and stopword-excluded average
  word length. Pacing markers retain their three subcounts: em-dashes, ellipses, and
  sentence-final punctuation per 100 words.
- The style profile is quantitative, serialisable, read-only in the display, and named in
  every relevant style-agent context. It is not replaced by an LLM-written description.
- The story bible has the exact schema in `requirements.md`. It is editable by the user
  before drafting, and agents receive a validated snapshot that they cannot mutate.
  Its logline, five-sentence synopsis, and per-character goal/motivation/conflict/
  epiphany come from the Snowflake Method (`steering/snowflake.md`): the outline
  agent can draft them from a user seed in two plan layers (`core`, then `structure`),
  each approved or edited by the user before the next, and no later layer may
  contradict an earlier one.
- Chapters run through the fixed order `outline -> style -> continuation -> continuity`.
  No agent may be added, removed, reordered, or allowed to accept its own output.
- Continuity checks cover character alive/dead state, timeline order, and foreshadowing
  payoff. Foreshadowing status is `open`, `paidOff`, or `deferred`; a deferred item names
  its target chapter, and an open item must be paid off by chapter 3.
- The demo accepts exactly 3 chapters. A chapter is accepted only after a continuity
  `APPROVED` result and a server-side length count within the chapter limit (800 words
  for English, 1,500 字 for Chinese).
- Chapter arc roles are structural, not plot content (the plot, names, and sample
  remain TBD). Chapter 1 establishes the protagonist's goal and conflict, plants at
  least one open foreshadowing item, and ends on a hook or question. Chapter 2
  escalates with the midpoint disaster or reversal, advances or plants foreshadowing,
  and ends on raised stakes. Chapter 3 pays off every open foreshadowing item,
  resolves the logline, and shows the protagonist's epiphany. A reader who finishes
  in 3 minutes must be able to say what the hook was and how it paid off.
- Every chapter pass produces a human-readable relay receipt (see `design.md`
  section 2.6): what each of the four agents did or changed, what continuity
  blocked or fixed, and every foreshadowing status transition in that pass. The
  receipt is shown for approved and vetoed passes alike; the relay is never a
  black box.
- A chapter has one first attempt and at most 3 user-visible retries. A fourth retry is a
  terminal error, not an implicit extra model call.
- The complete no-retry flow, including analysis and all 3 chapters, must finish within 3
  minutes in the intended deployment environment.
- React state is the active session and `localStorage` is only a restore mechanism. There
  is no database, account system, queue, or server-side story store.
- The story bible downloads as JSON. Each accepted chapter and the complete story download
  as Markdown. The browser creates these files; the server does not write story output.
- `/.kiro` stays at the repository root and is not ignored by Git. The four agent files and
  the continuity hook are read-only inputs for this work.

## Style analysis contract

`lib/style-analyser.ts` is a pure, deterministic TypeScript module. It does not call an
LLM, fetch text, read files, inspect environment variables, use React, or persist input.
The Route Handler validates the minimum length before calling it, and the module may also
return a validation result so direct callers cannot receive `NaN` or `Infinity` silently.

The calculation policy is:

| Metric | Required calculation |
| --- | --- |
| Sentence-length mean | Mean word count for sentences split at `.`, `!`, and `?` |
| Sentence-length standard deviation | Population standard deviation of the same sentence counts |
| Vocabulary richness | Unique lowercased, punctuation-stripped tokens divided by all normalized tokens |
| Dialogue ratio | Word tokens inside paired quotation marks divided by all word tokens |
| Pacing markers | Counts per 100 words for em-dashes, ellipses, and sentence-final `.`, `!`, `?` |
| Paragraph-length mean | Mean word count after splitting paragraphs on blank lines |
| Paragraph-length standard deviation | Population standard deviation of the paragraph counts |
| Average word length | Mean characters per word after the fixed local stopword set is excluded |

The token and quotation policies must be explicit in the implementation and tests. Use
Unicode-aware token matching, locale-independent lowercasing, and a versioned local
stopword list for each language. Do not fetch a language list at runtime. Detect the
language locally from character scripts (REQ-25), with a user override; never call a
network service or a model for it. Chinese uses the character-based length unit and the
rules in REQ-26 and `design.md` section 2.11. A sample in another language is analysed
with the English rules and a visible notice. Apostrophes inside words must not be
mistaken for dialogue delimiters. Punctuation used for pacing is counted separately from
normalized word tokens.

A short or empty direct call returns a typed validation result. A valid sample with no
stopwords, no dialogue, or no punctuation still returns finite numeric fields. The display
explains the definitions and does not imply that the numbers prove literary quality.

## Story bible and relay behavior

The editor must expose every field, array, enum, relationship, and one-entry-per-chapter
beat-sheet rule from the shared schema. It must not ship a fabricated plot, character,
location, sample passage, or story title. Empty/TBD user content is acceptable while the
user is editing but is invalid when the user starts drafting.

Before a pipeline request, validate at least these invariants:

- required strings are present and bounded;
- roles and statuses use the declared enums;
- a new character starts as `alive`, has an ID, and has a one-sentence description;
- each world rule is one paragraph;
- IDs are unique and beat-sheet state maps refer to known major-character IDs;
- timeline and beat-sheet chapter numbers are valid; the beat sheet covers exactly
  chapters 1, 2, and 3;
- adjacent beat entries make character-state transitions explicit;
- a `deferred` foreshadowing entry has `deferredToChapter` and is not silently dropped;
- the active snapshot is copied for the request so no agent can mutate browser state.

Each relay pass receives the named style profile, the complete story-bible snapshot, all
previously accepted chapters, outputs from earlier agents in the current pass, and any
structured veto notes. The raw sample passage is not needed after local analysis and is not
sent to model calls. The server never modifies the four agent definitions and treats their
files as read-only configuration, not as a place to store story data.

A continuity `VETO` returns specific failed checks, violated bible fields, and minimal fixes.
It never rewrites a chapter. The user chooses a permitted retry point. An outline retry
runs the full fixed order. A continuation retry reuses the valid outline and style output
from the vetoed pass; if either is missing or invalid, the server restarts at outline.
Retry counters are carried in the request and stored in the browser session.

## Session and privacy model

The serialisable session contains only data needed to restore the workflow: the derived
style profile, editable bible, pending relay result, accepted chapters, continuity ledger,
retry counters, and pipeline status. The raw sample is transient unless a later owner
explicitly decides that restoring it is necessary. Any restored value is parsed and
validated before it is used.

`localStorage` is not a security boundary. Do not put model configuration, authorization
headers, provider responses with secrets, or diagnostic stack traces in it. Do not log raw
samples or generated chapters by default. The server receives explicit validated context on
each request and must work correctly on a cold Vercel invocation.

## Functional boundaries

What the product does and does not do. Anything not listed under "Can do"
is out of scope unless the owner explicitly adds it. This section is the
authority when a feature request conflicts with it.

### Can do

- **Analyse a sample.** Paste or import a `.txt` sample of the user's own
  writing or public-domain text (at least 200 words, or 400 字 in Chinese) and compute exactly the
  eight deterministic style metrics. Analysis is local and uses no LLM.
- **Show the style profile.** Display all eight metrics with their definitions
  as read-only values while the user edits the bible and reviews chapters.
- **Edit a story bible.** Edit every field of the shared schema: logline,
  five-sentence synopsis, genre, tone, setting, characters (with goal,
  motivation, conflict, epiphany), foreshadowing, timeline, and one beat entry
  per chapter. The bible starts empty/TBD. The user fills it by hand, or asks
  for a draft from a short seed and then edits it (REQ-30). No agent writes it.
- **Draft the bible in Snowflake layers.** From the user's seed (genre, tone,
  idea, optional notes), the outline agent drafts two layers: `core` (logline,
  five-sentence synopsis, setting, characters) and `structure` (foreshadowing,
  timeline, beat sheet). The user approves or edits each layer before the next.
  No later layer contradicts an earlier one.
- **Watch a recorded run.** Replay a real recorded run with no model call and
  no access code, clearly labelled `REPLAY` (REQ-33).
- **Protect live mode.** Live model calls need a demo access code and are rate
  limited per IP and per day (REQ-32).
- **Run the four-agent relay.** Draft exactly 3 chapters, one at a time, in
  the fixed order `outline -> style -> continuation -> continuity`, streamed
  over SSE with visible progress. Each chapter is at most 800 words (1,500 字 in
  Chinese).
- **Check continuity.** Enforce the three checks (character alive/dead,
  timeline order, foreshadowing payoff) plus the chapter arc roles, before any
  chapter is accepted. A `VETO` names the failing check, the violated bible
  field, and a minimal fix; it never rewrites the chapter.
- **Retry within limits.** One first attempt plus at most 3 user-visible
  retries per chapter, restarting at `outline` or at `continuation` when a
  valid checkpoint exists.
- **Show the relay receipt.** Every pass produces a human-readable receipt:
  what each agent did or changed, what continuity blocked or fixed, and every
  foreshadowing status transition in that pass, for approved and vetoed passes
  alike.
- **Restore the session.** Keep the active session in React state and restore
  it from `localStorage` after a reload, without a database or an account.
- **Download the work.** Story bible as JSON; each accepted chapter and the
  complete three-chapter story as Markdown. The browser creates the files.
- **Deploy on Vercel.** GitHub-connected deployment; the submitted artifact is
  the public deployed URL.

### Cannot do

- **No accounts, billing, or server storage.** No sign-up, login, user
  accounts, authentication, billing, database, queue, background job, or
  server-side story store. There is nothing to log into and no story is kept
  on the server after a request ends. The only server state is rate-limit
  counters keyed by hashed IP (REQ-32); the demo access code is a shared
  code, not an account.
- **No text retrieval.** No crawling, fetching, or recommending of commercial
  novel text or any third-party literary text. The sample comes only from the
  user. The raw sample is not sent to model calls after local analysis and is
  not stored on the server.
- **No long-form writing.** No more than 3 chapters, no chapter over the 800-word (1,500 字 in Chinese)
  limit, no fourth chapter, no series, no multi-book bible, no novel-length
  manuscript.
- **No open-ended assistant.** No general chatbot, no free-form writing
  companion, no brainstorming chat, no editing of arbitrary user text outside
  the relay. The four agents only do their one relay job, in the fixed order;
  no agent may be added, removed, reordered, or allowed to accept its own
  output.
- **No automatic rewrite after a veto.** A vetoed draft is never silently
  rewritten. The user reviews the failure and chooses a permitted retry point.
- **No invented content.** No fabricated plot, character, location, sample
  passage, or story title in specifications, defaults, or empty states. Empty
  fields stay empty until the user fills them.
- **No model choice in the UI.** The model is server configuration
  (`LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`, and the optional `LLM_MODEL_PREMIUM`) only. The UI offers no model
  picker, no bring-your-own-key field, and no provider switching.
- **No media generation.** No image, audio, or video generation. No
  translation, no summarisation of other books, no plagiarism checking.
- **No collaboration.** No multi-user editing, comments, sharing links, or
  publishing. One browser session, one story.
- **No quality guarantee.** The eight metrics describe the sample
  quantitatively; they do not prove literary quality and do not guarantee the
  generated prose will match the sample's style. The 3-minute no-retry target
  is a performance target in the intended deployment environment, not a
  guarantee on every network.

### Explicitly deferred (not in this submission)

Decided by the owner on 2026-11-07, recorded here so a later request does not
silently revive them:

- a human approval checkpoint with single-agent rerun between chapters
  (beyond the existing accept/retry flow);
- tunable style sliders mapping to metric targets;
- a foreshadowing / character-state wall;
- two draft versions per chapter for the user to choose between.

## Scope and non-goals

In scope:

- one science-fiction short story with exactly three chapters;
- local, deterministic style statistics;
- an editable story bible;
- the four-agent relay and three continuity checks;
- streamed progress and reviewable vetoes;
- session restoration and browser downloads;
- GitHub-connected Vercel deployment.

Out of scope:

- invented demo content in specifications or defaults;
- crawling or retrieval of third-party literary text;
- user accounts, authentication, billing, database storage, queues, or background jobs;
- more than three chapters, chapters over the language chapter limit (800 words or 1,500 字), or unbounded retries;
- languages other than English and Chinese;
- automatic full-chapter rewriting after a veto;
- a general-purpose agent marketplace or provider-specific client in each wrapper.

## Product conflict resolution

1. Requirements, privacy rules, protected paths, and the fixed relay order override all other
   documents.
2. A security or data-loss concern overrides a convenience or visual preference.
3. Current framework guidance informs implementation, but does not authorize changing the
   pinned Next.js 15 major or any fixed product limit.
4. If a platform limit threatens the three-minute target, first reduce prompt context,
   provider latency, or output budgets. Do not change chapter count, word cap, retry cap,
   continuity checks, or statelessness without an owner decision.
5. If a document conflicts with `requirements.md`, stop, record the conflict, and make the
   smallest safe correction. Do not invent a plot or silently expand the demo.
