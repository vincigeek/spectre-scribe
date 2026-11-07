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
- Empty input and input shorter than 200 words are rejected before analysis. The same
  deterministic word-token policy is used for the minimum check and the profile.
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
  agent expands the plan layer by layer (logline -> paragraph -> one-page synopsis
  -> beat list), each layer approved before the next starts, and no later layer may
  contradict an earlier one.
- Chapters run through the fixed order `outline -> style -> continuation -> continuity`.
  No agent may be added, removed, reordered, or allowed to accept its own output.
- Continuity checks cover character alive/dead state, timeline order, and foreshadowing
  payoff. Foreshadowing status is `open`, `paidOff`, or `deferred`; a deferred item names
  its target chapter, and an open item must be paid off by chapter 3.
- The demo accepts exactly 3 chapters. A chapter is accepted only after a continuity
  `APPROVED` result and a server-side word count of at most 800 words.
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
stopword set. Do not fetch a language list at runtime. Do not auto-detect a language or
reject a non-English sample: non-English tokens remain analyzable, and only tokens in the
local stopword set are excluded from the final metric. Apostrophes inside words must not be
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
sent to model calls. The server keeps the four agent definitions unchanged and treats their
files as configuration, not as a place to store story data.

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
- more than three chapters, chapters over 800 words, or unbounded retries;
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
