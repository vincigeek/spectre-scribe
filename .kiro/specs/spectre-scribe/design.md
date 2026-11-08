# Design — Spectre Scribe

## 1. Architecture overview

Spectre Scribe is a Next.js 15 App Router application. React 19 client components
provide the browser workspace, while server-only modules in the same repository
validate requests, call the four agent definitions, enforce the relay contract,
and stream results over Server-Sent Events (SSE).

```text
Browser (React 19)
  │
  ├── SampleInput       ── POST /api/style/analyse ──► style-analyser.ts
  ├── StyleProfile      ◄────── JSON StyleProfile ────┘
  ├── StoryBibleEditor  ── React state + localStorage
  │     └── DraftFromSeed ── POST /api/bible/draft ──► outline agent (plan mode)
  ├── ReplayPlayer      ── GET /replays/*.json (no model call)
  ├── ChapterWorkspace  ◄── POST /api/pipeline/stream (SSE)
  └── FinalStory        ── browser JSON/Markdown downloads
                                      │
Next.js server (Route Handlers and server-only lib/pipeline)
  │
  ├── request/schema validation
  ├── LiveGate ── access code + rate limits (counter store, §2.13)
  ├── PipelineOrchestrator
  │     ├── OutlineAgent
  │     ├── StyleAgent
  │     ├── ContinuationAgent
  │     └── ContinuityAgent ── continuity-check.md contract
  ├── AgentDefinitionLoader ── /.kiro/agents/*.md (read-only)
  └── OpenAICompatibleClient ── LLM_API_KEY / LLM_BASE_URL / LLM_MODEL
        (continuity only: LLM_MODEL_PREMIUM)
```

The browser never receives the model key and never calls the model endpoint
directly. `app/api/` Route Handlers are the only model-access boundary. There is no
database, no server-side story store, and no runtime story output written under
`/.kiro`.

The Frankenstein angle is the deliberate combination of quantitative style
statistics with a narrative relay. The style profile is structured data passed to
the agents, not a vague prose instruction.

## 2. Module breakdown

### 2.1 App Router and Route Handlers

`app/page.tsx` renders the workspace shell and composes the client components.
`app/layout.tsx` supplies the document shell and global Tailwind styles. The project
uses the pinned Next.js 15 App Router, React 19, TypeScript, Tailwind CSS 4, and
Node.js 22.x as described by the steering files.

`app/api/style/analyse/route.ts` accepts a validated `{ sampleText, language? }` request,
rejects empty or under-minimum samples (§2.11), calls the pure analyser, and returns a
JSON `StyleProfile`. The route performs no model call and does not fetch sample
text from another source.

`app/api/pipeline/stream/route.ts` is a Node.js Route Handler for
`POST /api/pipeline/stream`. It validates a complete versioned request before
starting work, sets the explicit stream headers, and returns a native
`ReadableStream` containing the typed SSE events described in `api-streaming.md`.
The payload contains the opaque `runId`, chapter number, style profile, story bible
snapshot, accepted chapters, continuity ledger, retry count, restart point, and
any valid relay checkpoints needed for a retry or best-effort transport resume.

The initial route ceiling is `maxDuration = 120` seconds with an internal
110-second deadline. The handler stops on client disconnect or deadline expiry,
passes one combined `AbortSignal` to provider calls, and never caches a model
request. Both Route Handlers validate data at the trust boundary and return
structured client errors without depending on an in-memory session surviving
another request.

### 2.2 Style analyser (`lib/style-analyser.ts`)

The analyser is a pure TypeScript module. It accepts the user-supplied string,
performs no network or file I/O, and returns a serialisable `StyleProfile` or a
typed validation result. The Route Handler rejects input shorter than the language minimum
(§2.11) before analysis, while direct callers also receive a finite, non-throwing result.

The profile holds four metadata fields (§2.11): `language` (`en` or `zh`),
`lengthUnit` (`word` or `char`), `segmentation` (`none` for `en`; `intl` or
`char` for `zh`), and `analyserVersion`, plus `detectedLanguage` (`en`, `zh`, or
`other`) so the UI can show the REQ-25 notice. It keeps these eight metric fields and calculation rules:

| Field | Computation |
| --- | --- |
| `sentenceLenMean` | Mean length units per sentence; boundaries per REQ-26a |
| `sentenceLenSD` | Population standard deviation of the sentence length-unit list |
| `typeTokenRatio` | Unique normalized tokens divided by total normalized tokens; lowercased with punctuation removed; `zh` tokens come from the segmenter (§2.11) |
| `dialogueRatio` | Length units inside paired quotation marks divided by all length units; delimiter set per REQ-26c |
| `pacingMarkers` | Counts per 100 length units for em-dash runs, ellipsis runs, and sentence-final mark runs |
| `paraLenMean` | Mean length units per paragraph; split rule per language (REQ-26e) |
| `paraLenSD` | Population standard deviation of the paragraph length-unit list |
| `avgWordLen` | Mean characters per token (`en`) or 字 per segmented word (`zh`) after the versioned local stopword set is excluded |

The token policy is shared by the minimum-length check and all calculations. It is
Unicode-aware, uses locale-independent lowercasing, and keeps apostrophes inside
words from becoming dialogue delimiters. The language (`en` or `zh`) is detected
locally from character scripts (REQ-25) and selects the length unit and the rules
in §2.11; no network language detector is used. Each language has its own local,
versioned stopword list. `pacingMarkers` is one metric with three named subcounts.

The analyser does not call an LLM and does not persist the sample. The style
profile is held in React session state and is sent as a named input to the style
agent on every relevant pipeline request. Tests cover empty and short input,
the exact minimum for each language, punctuation and quote edge cases, Chinese
fixtures (§2.11), zero variance, and finite numeric output.

### 2.3 Story bible schema and editor (`lib/story-bible.ts`)

The shared schema is validated in the client editor and again in the Route Handler.
The server passes a deep, read-only snapshot to agents. The schema is:

```ts
type CharacterStatus = "alive" | "dead" | "unknown";

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
    status: CharacterStatus;
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
    characterStates: Record<string, CharacterStatus>;
  }>;
};
```

A new character starts with `status: "alive"`. The editor supports all fields,
including logline, five-sentence synopsis, repeatable locations, world rules,
characters (with goal, motivation, conflict, and epiphany), foreshadowing entries,
timeline events, and the three chapter beat entries. `deferred` foreshadowing
requires `deferredToChapter`; an open item may not silently become dropped.

The active bible is React state. A client-side `localStorage` record may restore
the current session after a reload, but agents cannot mutate it. The browser
serialises the current bible to a JSON `Blob` for download. It does not write
runtime data to `.kiro`.

### 2.4 Server pipeline and model client (`lib/pipeline/`)

The pipeline is server-only. `AgentDefinitionLoader` reads the four existing
Markdown definitions from `/.kiro/agents/` at runtime without editing them. The
files are immutable configuration; if a required file is missing or too stub-like
to provide a usable role contract, the loader returns a safe configuration error
rather than inventing a replacement.

`OpenAICompatibleClient` is a small adapter around standard server-side `fetch`.
It reads `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`, and the optional
`LLM_MODEL_PREMIUM` only from the server environment, normalizes the base URL in one place, sends the key only in the
outbound authorization header, and maps provider failures to safe internal errors.
It uses the Chat Completions-compatible request shape for arbitrary providers. A
provider-specific token-limit field or equivalent Responses API request is
translated inside this adapter, never in an agent wrapper. No provider response
body, prompt, key, or credential-bearing URL is sent to the browser.

Two model tiers (decided 2026-11-07, revised 2026-11-08): the standard model
`LLM_MODEL` serves outline, style, and continuation; the premium model
`LLM_MODEL_PREMIUM` serves continuity only, because it is the judge and
benefits most from the stronger model. `LLM_MODEL_PREMIUM` is optional: when
it is unset, `LLM_MODEL` serves continuity too. Current values: standard
`gemini-3.5-flash-lite`, premium `gemini-3.5-flash`. Premium history: the seat
was first held by `gemini-4-argon` (half-price $2 input / $10 output per 1M
tokens to 2026-11-30, doubling 2026-12-01), retired 2026-11-08 after a real
continuity call measured over 180 s against the 110 s pass deadline; the
judge was briefly moved to the standard model, then `gemini-3.8-flash` was
measured at 162–171 s for a trivial call (`reasoning_effort: minimal`
rejected: "Thinking level MINIMAL is not supported for this model") and also
rejected; `gemini-3.5-flash` measured 2 s for the same call and took the seat.
Argon-specific notes, verified 2026-11-07, kept for reference: thinking
tokens bill as output; `temperature`, `top_p`, and `top_k` are ignored by
that model, so the adapter must not send them on premium calls.

`PipelineOrchestrator` assembles a bounded context for one chapter. Every relay
pass uses the following order:

1. **Outline agent** (chapter mode) reads the named style profile, story bible
   snapshot, and accepted chapters, then produces a strict structured list of at
   most eight beats for this chapter. One character carries the chapter (the
   point-of-view character named in the bible's `tone`); most beats follow
   that character and the others appear only when the scene needs them. It does not write final prose and does not
   restate the logline or synopsis. The Snowflake layers that build the logline,
   synopsis, characters, and beat sheet run earlier, in plan mode, when the bible
   is drafted (§2.12). A chapter pass starts with one outline call; if a
   deterministic outline check fails, the server may make up to three complete
   outline attempts total and feeds the latest check issues into the next
   attempt. These in-pass repair attempts do not increment the user-visible
   chapter retry count.
2. **Style agent** reads those inputs plus the outline and produces a style anchor
   of at most 400 words (700 字 in Chinese). It targets the named quantitative metrics and does not
   need to complete the chapter.
3. **Continuation agent** reads all previous inputs plus the style anchor and
   produces a complete chapter draft aimed at the soft generation target of 640
   words (1,200 字 in Chinese), while never exceeding the hard maximum of 800
   words (1,500 字 in Chinese), never falling below the 640-word (1,200 字)
   minimum, and never falling below the 25% dialogue
   minimum. Prose may be streamed upstream, but the server retains and
   validates the complete text. Rhythm is part of the draft: sentence length
   varies on purpose (short for urgency, longer for atmosphere), no three long
   paragraphs in a row without a break, and the chapter ends on its hook beat
   with nothing after it. A draft that fails a server-side count check
   (over the limit, under the length minimum, or under the dialogue minimum) is retried in-pass at most
   three continuation attempts total, feeding the exact measured numbers into
   the next attempt; these in-pass repair attempts do not increment the
   user-visible chapter retry count.
4. **Continuity agent** reads all previous inputs plus the draft and returns
   `APPROVED` or `VETO` with structured failures. It does not rewrite the draft.

Initial output caps are constants: outline 600 tokens, style 900, continuation
1,600, and continuity 800 (English; Chinese caps are in §2.11). Strict JSON Schema is requested for outline and
continuity when the configured provider supports it. The server still parses and
validates every result, and treats refusal, incomplete output, invalid JSON, and
schema mismatch as failures. A continuation result is never accepted from a
partial delta.

Every agent receives the full story bible, named style profile, previously
accepted chapter texts, and valid earlier outputs from the current pass as
read-only context. The raw sample is not sent after local analysis. The server
includes structured VETO notes only on a retry. Prompt values are delimited and
bounded as untrusted user/model data.

A single stream request runs one chapter relay pass. If continuity returns
`VETO`, the server emits the validated draft and failure details so the user can
review them. A retry request carries `retryCount + 1`, the VETO notes, and the
selected restart point. The default restart point is outline and runs the
complete order. A continuation restart is a suffix retry: it reuses the exact
validated outline and style-anchor outputs from the vetoed pass, then runs
`continuation -> continuity`. Missing or invalid checkpoints force an outline
restart. The server rejects a retry count greater than 3 before any model call.

Each outbound provider call has an `AbortSignal` and a deadline. Only connection
failures and statuses 408, 429, 500, 502, 503, and 504 may receive one bounded
transport retry, subject to the route deadline and `Retry-After`. Authentication,
permission, malformed-request, unsupported-schema, refusal, schema, and word-limit
failures are terminal for that call. Transport retries are measured separately
from user-visible chapter retries.

The server accepts a chapter only after `APPROVED` and a server length check
of at most the chapter limit of the story language (800 words or 1,500 字). It then returns the accepted chapter to the browser, which
adds it to React state and `localStorage`. The client stores a derived continuity
ledger next to accepted chapters. The ledger records the last accepted character
statuses and foreshadowing states used for the next check; it is session data,
not a story bible mutation, and agents cannot write it. The server does not retain
any of it for the next request; the browser sends accepted chapters and the ledger
again as validated request context.

### 2.5 Continuity contract (`/.kiro/hooks/continuity-check.md`)

The existing hook definition is read as a base contract and is not modified. The
server-side continuity stage applies its three checks and adds the demo-specific
exceptions, deferred state, final-chapter payoff rule, and structured output
described below.

**Check A — Character alive/dead**

For each character named as speaking or acting, compare the last accepted status
with the story bible and beat sheet. A character marked dead cannot act or speak
in a later chapter unless the bible explicitly identifies a flashback, memory,
ghost, or equivalent exception.

**Check B — Timeline order**

Map events in the draft to `bible.timeline`. Reject an effect that is presented
before its cause or any event that contradicts the ordered chapter timeline.

**Check C — Foreshadowing payoff**

Track every item that was `open` after the previous accepted chapter. In an
intermediate chapter it must stay explicitly open, become `paidOff`, or become
`deferred` with `deferredToChapter`. In chapter 3 it must be `paidOff`. It cannot
disappear from the draft without a result.

A VETO event contains the failing check ID, the violating story bible field, the
specific violation, and a minimal suggested fix. The continuity stage never
rewrites the prose.

**Chapter arc roles (P0)**

The outline agent tags each chapter with its arc role, and the beat sheet must
carry it: Chapter 1 is setup plus hook, Chapter 2 is escalation, Chapter 3 is
payoff. Beats alternate in tension (rising/falling, named in each beat's
premise, never two consecutive beats at the same level), and the last beat of
Chapters 1 and 2 is a hook beat — a concrete new danger, revelation, or
unanswered question, not a mood or summary. The hook is a new development of
an EXISTING foreshadowing item, not a new thread: like every beat, it must
name an existing foreshadowing id, and in Chapter 1 the hook beat must PLANT
an item and pay off none, so the planted item stays open for the next chapter.
Continuity enforces the mechanical
parts: after Chapter 1 at least one foreshadowing item must be `open`, and
after Chapter 3 every foreshadowing item must be `paidOff` (Check C); the
chapter ending on its hook is enforced by the arc checks in
`/.kiro/agents/continuity.md` (a chapter that ends on a summary, a mood, or a
resolved beat is vetoed). The Chapter 2 escalation (a disaster or reversal
beat) is enforced at outline validation: the Chapter 2 beats must contain at
least one beat whose premise is a disaster or reversal. These are structural
roles; they do not invent plot, names, or sample content, which remain TBD.

### 2.6 SSE event protocol

The pipeline response is UTF-8 SSE over a POST request. The route returns
`Content-Type: text/event-stream; charset=utf-8`, `Cache-Control: no-cache,
no-transform`, and `X-Content-Type-Options: nosniff`. Each non-comment record
contains a monotonically increasing `id`, one `event` name, one JSON `data:`
line, and a blank line. The server emits `: keep-alive` comments at least every
15 seconds while waiting for a provider response.

The minimum event set is:

```text
id: 1
event: run-start
data: {"runId":"...","chapterNumber":1,"retryCount":0}

id: 2
event: agent-start
data: {"runId":"...","agent":"outline","chapterNumber":1}

id: 3
event: agent-complete
data: {"runId":"...","agent":"outline","output":{...}}

id: 4
event: agent-delta
data: {"runId":"...","agent":"continuation","text":"..."}

id: 5
event: continuity
data: {"runId":"...","status":"VETO","failures":[...]}

id: 6
event: chapter-accepted
data: {"runId":"...","chapterNumber":1,"wordCount":...}

id: 7
event: relay-receipt
data: {"runId":"...","chapterNumber":1,"retryCount":0,"steps":[{"agent":"outline","summary":"...","changes":["..."]},{"agent":"style","summary":"...","changes":["..."]},{"agent":"continuation","summary":"...","changes":["..."]},{"agent":"continuity","summary":"...","changes":["..."]}],"foreshadowingTransitions":[{"id":"...","from":"open","to":"paidOff"}],"continuity":{"status":"APPROVED","failures":[]}}

id: 8
event: error
data: {"runId":"...","code":"...","message":"...","retryable":false}

id: 9
event: done
data: {"runId":"...","status":"vetoed","nextAction":"retry"}
```

The exact payloads are typed shared data. `agent-delta` is optional for outline
and continuity; structured calls may emit only `agent-complete`. A successful run
ends with `done`. If the connection is still writable, an `error` event is followed
by terminal `done`. The client accepts a chapter only from a validated
`chapter-accepted` event, never from a delta or a continuity-looking string.

**Relay receipt (P0).** The server emits one `relay-receipt` event on every
completed pass, approved or vetoed, before `done`. Each step names the agent, a
one-sentence summary of what it did, and a short list of concrete changes
(outline: beats added or changed; style: anchor produced and metric deltas
against the named profile; continuation: draft produced and server word count;
continuity: checks passed or failed and what was blocked or fixed). The receipt
also lists every foreshadowing status transition in the pass (`open` ->
`paidOff`, `open` -> `deferred`, and so on) and the continuity status with its
failures. The receipt is a client checkpoint like `agent-complete`: it is stored
in React state and the versioned session record, and the final story renders one
receipt per accepted chapter. It contains no raw sample, prompt, key, or model
configuration.

The receipt's `summary` and `changes` strings are built by the orchestrator
from fixed per-language templates (`en`, `zh`) filled with values from the
validated agent outputs (beat titles, word counts, metric deltas, check ids).
No extra model call writes them. Agent-written text that the receipt quotes,
such as a beat title or a failure `violation`, is already in the story language.

The browser cannot use `EventSource` because this endpoint is POST and carries a
JSON request body. A client component uses `fetch()` and a `ReadableStream`
reader. Its parser handles arbitrary chunk boundaries, multiple `data:` lines,
comments, unknown event names, malformed JSON, event IDs, and a final partial
record. Unknown events are ignored; malformed application data produces a safe
parser error without turning partial text into a checkpoint.

Each complete `agent-complete`, `continuity`, and `chapter-accepted` event is a
client checkpoint. The client stores the serialisable checkpoint in React state
and the versioned session record. A checkpoint is an untrusted resume hint, not
proof of server approval. The server validates the checkpoint shape and output
schema again, deep-copies it, and never treats a client-supplied `APPROVED` value
as sufficient to accept a chapter.

The allowed suffixes are explicit: an outline checkpoint permits the
style/continuation/continuity suffix, a style checkpoint permits the
continuation/continuity suffix, and a continuation checkpoint permits a
continuity rerun. A continuity checkpoint never bypasses the continuity rerun or
the server word-count gate. If the accepted event may have been lost, the server
reruns continuity and emits a new `chapter-accepted` only after both gates pass.
`Last-Event-ID` may be sent as bookkeeping, but there is no server event log and
no automatic replay claim.

On a network drop, the client aborts the reader and preserves the latest complete
checkpoint and accepted chapters. It offers one separate transport-recovery action:
with a valid checkpoint it resends the same validated request and the remaining
fixed-order suffix; without one it restarts the current pass at outline. Partial
outline, style, prose, or continuity text is never accepted. If recovery fails,
the UI shows an interrupted-run error and offers the normal outline or
continuation retry rules. A transport recovery cannot bypass the three
user-visible retries. If the server may have accepted a chapter before the client
saw `chapter-accepted`, the client does not silently add it; statelessness requires
a replay or explicit user retry.

Before headers are sent, invalid requests return normal JSON errors with stable
safe codes. After headers are sent, errors are typed SSE events and cannot change
the HTTP status. Client aborts cancel upstream fetches and are shown as
interrupted, not as provider failures. No event includes raw provider frames,
full prompts, full request payloads, the raw sample, credentials, model
configuration, or stack traces.

### 2.7 Web components and session state

The client workspace is split into focused components:

| Component | Responsibility |
| --- | --- |
| `SampleInput` | Paste/import `.txt`, validate, and request style analysis |
| `StyleProfile` | Read-only display of all eight metrics and definitions |
| `StoryBibleEditor` | Edit and validate the complete story bible |
| `ChapterWorkspace` | Start a chapter pass, render SSE progress, outline, draft, and continuity result |
| `FinalStory` | Render the exactly three accepted chapters and expose downloads, with one relay receipt per chapter |

Tailwind CSS 4 supplies layout and visual tokens. shadcn/ui primitives supply
accessible inputs, buttons, tabs, alerts, dialogs, and progress indicators.
Client components own user interactions and synchronise a serialisable session
object to `localStorage`. The session contains the style profile, bible, pending
chapter result, accepted chapters, derived continuity ledger, retry count, and
pipeline status. It contains no model secret.

The chapter workspace shows a text-labelled `APPROVED` state or a text-labelled
`VETO` state with failing items and suggested fixes; color is supplementary only.
It renders the relay receipt for the latest pass (one entry per agent plus the
foreshadowing transitions) under the draft, for approved and vetoed passes alike.
It disables a fourth chapter after chapter 3 is accepted. A final-story download
concatenates all three accepted chapters in order as Markdown; individual chapters
use Markdown as well. The bible download uses JSON. Progress and terminal status
use a polite status/live region without announcing every prose delta, and form
errors identify their fields in text.

### 2.8 Data flow and boundaries

```text
User sample
   │
   ▼
POST /api/style/analyse ──► lib/style-analyser.ts ──► StyleProfile in React state
                                                        │
User edits StoryBible ─────────────────────────────────┤
                                                        ▼
POST /api/pipeline/stream with validated session payload
                                                        │
                                                        ▼
Server loads definitions and calls
outline → style → continuation → continuity
                                                        │
                         ┌────────────── APPROVED ──────┴──────► accepted chapter
                         │
                         └────────────── VETO ──► SSE result → user review → retry request
```

Only request payloads and browser `localStorage` carry story data between
requests. The `.kiro` directory is configuration, not a runtime output folder.
The browser creates downloads with client-side `Blob` objects; no download is
written to the server filesystem.

### 2.9 Deployment and performance

Local development uses `pnpm dev` with the project-local Node 22.x runtime. A
GitHub-connected Vercel project builds the same Next.js application on pushes to
the configured branch. Non-production branches and pull requests receive preview
deployments; the configured production branch (normally `main`) updates the
production deployment. The intended submission is the public deployed URL, not a
local address.

The pipeline uses Vercel's Node.js runtime, not Edge. The initial route
configuration is `maxDuration = 120` seconds with an internal 110-second deadline;
stream time counts toward that function duration. Vercel's current Fluid Compute
ceilings are higher than this initial setting, but the ceiling does not replace a
product performance test. Configure Node 22.x in both `engines.node` and Vercel,
then verify the deployed build and function versions.

Set `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`, and `LLM_MODEL_PREMIUM`
separately for Preview and Production. They are server-only variables without a `NEXT_PUBLIC_` prefix. Vercel
environment changes apply to new deployments, so redeploy after changing them.
No secret value is committed or printed.

The performance target is the complete sample-analysis plus three-chapter flow
with no user-visible retries in under 3 minutes of machine time (REQ-19), for both English and Chinese runs.
Instrumentation measures each
Route Handler request, each provider call, output size, transport-retry count,
stream time, and browser end-to-end time. The orchestrator bounds context to the
required style profile, bible, accepted chapters, and current-pass outputs so a
slow or oversized prompt does not bypass the chapter word limit. If the measured
path misses 180 seconds, reduce context, output budgets, or provider latency
before changing any product invariant.

Before implementation is considered complete, run the project-local type check,
lint, Vitest suite, production build, and measured no-retry flow. The GitHub and
Vercel connection is documented here but is not performed by this design migration.

### 2.10 Entities and data dictionary

This section is the single consolidated reference for every data shape in the
system. `StoryBible` and `StyleProfile` are defined in §2.3 and §2.2 and are
referenced here, not redefined. All other entities are defined here. There is
no database: entities live in React state, `localStorage`, SSE payloads, or
downloads, as the "Lives in" column states. No entity carries a secret.

| Entity | Lives in | Defined in |
| --- | --- | --- |
| `Sample` | Client memory only (transient) | Below |
| `StyleProfile` | React state, session, pipeline request | §2.2 |
| `StoryBible` | React state, session, pipeline request, JSON download | §2.3 |
| `AcceptedChapter` | React state, session, Markdown download | Below |
| `RelayReceipt` | SSE event, React state, session | Below (§2.6 event shape) |
| `ContinuityResult` | SSE event, React state, session | Below |
| `PipelineRun` | Server memory for one request; mirrored in React state | Below |
| `Session` | `localStorage` (versioned), React state | Below (§2.7) |
| `ErrorCode` | SSE `error` event, UI message | Below |

```ts
// The user's pasted or imported text. Never persisted, never logged, never
// sent to the model after local analysis (see §2.2).
type Sample = {
  text: string;
  language: "en" | "zh"; // Detected locally (REQ-25); the user may override.
  wordCount: number; // Length units: words for en, 字 for zh. Deterministic local count.
  meetsThreshold: boolean; // wordCount >= 200 (en) or >= 400 (zh).
};

// One accepted chapter. Only a chapter that arrived via a validated
// `chapter-accepted` event becomes an AcceptedChapter; exactly three exist
// in a complete session, in chapter order.
type AcceptedChapter = {
  chapterNumber: 1 | 2 | 3;
  title: string; // User/model-provided chapter title.
  prose: string; // Full chapter text, within the chapter limit (800 words or 1,500 字) by server count.
  wordCount: number; // Server-side length-unit count, authoritative.
  relayReceipt: RelayReceipt; // The receipt of the pass that produced it.
};

// Emitted once per completed pass, approved or vetoed, before `done` (§2.6).
type RelayReceipt = {
  runId: string;
  chapterNumber: number;
  retryCount: number; // 0 on the first attempt, up to 3.
  steps: Array<{
    agent: "outline" | "style" | "continuation" | "continuity";
    summary: string; // One sentence: what this agent did.
    changes: string[]; // Concrete changes (beats, anchor, draft, verdict).
  }>;
  foreshadowingTransitions: Array<{
    id: string;
    from: "open" | "paidOff" | "deferred";
    to: "open" | "paidOff" | "deferred";
  }>;
  continuity: ContinuityResult;
};

// The continuity agent's verdict. A VETO never rewrites the draft; it lists
// what failed so the user can choose the retry point (§2.4, §2.7).
type ContinuityResult = {
  status: "APPROVED" | "VETO";
  failures: Array<{
    checkId: "A" | "B" | "C" | "ARC"; // A life/death, B timeline, C foreshadowing, ARC arc role.
    bibleField: string; // The violated StoryBible field, e.g. "characters[0].status".
    violation: string; // What specifically contradicts the bible, quoting the draft briefly. Same field name as the continuity agent's output contract.
    fix: string; // Minimal suggested fix; the user applies it, the server does not.
  }>;
};

// One chapter relay pass. The server holds it for a single stream request;
// the client mirrors its status for the chapter workspace UI.
type PipelineRun = {
  runId: string;
  chapterNumber: 1 | 2 | 3;
  retryCount: number; // 0..3; the server rejects a retry count above 3.
  currentAgent: "outline" | "style" | "continuation" | "continuity" | null;
  status: "running" | "approved" | "vetoed" | "interrupted" | "failed";
  nextAction: "retry" | "next-chapter" | "edit-bible" | "new-session" | null;
};

// The versioned, serialisable client session (§2.7). It contains no provider
// configuration, authorization headers, raw diagnostic errors, or secrets.
// The continuity ledger is derived session data (last accepted character
// statuses and foreshadowing states), not a story bible mutation.
type Session = {
  version: number;
  styleProfile: StyleProfile | null;
  bible: StoryBible;
  acceptedChapters: AcceptedChapter[]; // At most 3, in chapter order.
  continuityLedger: {
    characterStatuses: Record<string, CharacterStatus>;
    foreshadowing: Record<string, "open" | "paidOff" | "deferred">;
  };
  retryCounters: Record<number, number>; // chapterNumber -> retries used.
  pipelineStatus: "idle" | "running" | "awaiting-retry" | "complete";
};
```

**Error codes.** Every `error` event carries one stable code; the UI shows the
code's plain-language message, never a raw provider body. `retryable` tells the
client whether a retry control may be offered.

| Code | Meaning | Retryable |
| --- | --- | --- |
| `config-missing` | Server provider configuration or an agent definition file is missing/unusable | No |
| `provider-auth` | Authentication or permission failure at the provider | No |
| `provider-rate-limited` | Provider returned 429 (one bounded transport retry may already have been used) | No (transport-level only) |
| `provider-unavailable` | Provider returned 408/500/502/503/504 after the bounded transport retry | Yes, as a new run |
| `bad-request` | Malformed request payload or failed validation | No |
| `schema-mismatch` | Model output failed JSON/schema validation | Yes, as a chapter retry |
| `model-refusal` | Model refused the request | Yes, as a chapter retry |
| `word-limit` | Draft exceeded the server chapter limit (800 words or 1,500 字) | Yes, as a chapter retry |
| `chapter-short` | Draft below the chapter length minimum (640 words or 1,200 字) | Yes, as a chapter retry |
| `dialogue-share` | Draft dialogue below the 30% minimum (REQ-20) | Yes, as a chapter retry |
| `retry-exhausted` | Chapter retry cap (3) reached | No; edit or start a new session |
| `interrupted` | Stream aborted or stale run after reload | Yes, as resume/retry |
| `access-required` | Live mode needs a valid demo access code (HTTP 401) | No; enter the code or watch a replay |
| `rate-limited` | An app limit of REQ-32 was reached (HTTP 429, `retryAfterSeconds`) | Yes, after the wait |
| `live-unavailable` | Live mode is off, or the counter store is unreachable in Production | No; watch a replay |

Validation rules that cross entities: a `StoryBible` with an empty required
field blocks drafting; a `deferred` foreshadowing entry requires
`deferredToChapter`; an `AcceptedChapter` is only created from a validated
`chapter-accepted` event; a `PipelineRun` with `retryCount > 3` is rejected
before any model call; a `Session` with an unsupported version is discarded
with a visible explanation (§2.7).

### 2.11 Language support (English and Chinese)

This section implements REQ-24 to REQ-29. The product keeps one pipeline and one
set of eight metrics. Only the length unit and a few text rules depend on the
language.

**Shared module.** `lib/text-units.ts` is pure TypeScript with no I/O. It is
imported by the analyser, the story bible validator, both Route Handlers, the
orchestrator, and the browser word counter. It exports `detectLanguage`,
`countUnits`, `splitSentences`, `splitParagraphs`, and the constant
`LANGUAGE_LIMITS`. It never calls the segmenter, so the browser counter and the
server count always agree.

**Limits (initial values, tuned in T-25).**

| Item | `en` | `zh` |
| --- | ---: | ---: |
| Minimum sample | 200 words | 400 字 |
| Logline maximum | 15 words | 30 字 |
| Style anchor maximum | 400 words | 700 字 |
| Chapter generation target (soft) | 640 words | 1,200 字 |
| Chapter minimum (REQ-20) | 640 words | 1,200 字 |
| Dialogue minimum (REQ-20) | 25% | 25% |
| Dialogue target (soft) | 25–35% | 25–35% |
| Chapter maximum (REQ-20) | 800 words | 1,500 字 |
| Outline output cap | 600 tokens | 1,000 tokens |
| Style output cap | 900 tokens | 1,500 tokens |
| Continuation output cap | 1,600 tokens | 2,600 tokens |
| Continuity output cap | 800 tokens | 1,300 tokens |

The chapter generation target is 80% of the language-specific maximum, and the
same number is the enforced length minimum (`chapter_min`): a draft below it
is rejected with the `chapter-short` error code, retryable as a chapter retry.
The server enforces the hard maximum with the existing `word-limit` retry
behavior for over-limit drafts. The dialogue minimum is likewise a hard
acceptance check. The server recounts dialogue share with the same
paired-delimiter measure as the style profile (REQ-26c) and rejects a draft
below 30% with the `dialogue-share` error code, retryable as a chapter retry.

The `zh` token caps are about 1.6 times the `en` caps. They are a starting guess,
because tokens per 字 differ between model tokenizers.

**Language detection.** `detectLanguage` follows REQ-25 in order. First, if
hiragana, katakana, hangul, and Thai are at least 5% of letter characters, the
sample is "other"; this stops kanji-heavy Japanese from being read as Chinese.
Second, a sample with no Han and no Latin word runs is "other" (this also
avoids a 0/0 ratio). Otherwise, the sample is `zh` when Han characters are at
least 50% of Han plus Latin word runs. The
result is stored in the profile and shown in the Sample Input panel with a
switch, so a user can correct a wrong guess before analysis. Japanese, Korean,
and Thai text is not supported. An "other" sample gets the `en` rules and a
visible notice.

**Style profile metadata.** `StyleProfile` gains `language: "en" | "zh"`,
`detectedLanguage: "en" | "zh" | "other"`, `lengthUnit: "word" | "char"`,
`segmentation: "none" | "intl" | "char"` (`none` for English, which uses
regex tokens), and `analyserVersion: string`. The eight metric fields keep their names.

**Chinese word segmentation.** Only two metrics need words: `typeTokenRatio` and
`avgWordLen`. For `zh` they use `Intl.Segmenter("zh", { granularity: "word" })`,
keeping word-like segments. This runs only in the server route, on the pinned
Node 22.x runtime with full ICU. Segmentation can differ between ICU versions, so
the profile records `analyserVersion`. Tests assert exact values only for the
length-unit metrics. The two segmenter metrics are tested with fixed fixtures on
the pinned runtime plus range checks. If the segmenter is missing, the analyser
falls back to one character per token, sets `segmentation: "char"`, and the UI
notes that vocabulary richness is approximate. The other six metrics do not
depend on the segmenter.

**Metric rules that differ.** The normative list is REQ-26. In short: sentence
boundaries include `。！？`; dialogue also accepts `「」` and `『』`; a dash,
ellipsis, or `?!` run counts once; Chinese paragraphs split on any line break
because Chinese text rarely uses blank lines between paragraphs.

**Agent contract.** The four agent files are written in English. Each opens
with a `Run parameters` section saying the block below overrides any number or
language in the file; the numbers in the files are English defaults. The
orchestrator appends a run-parameters block to every agent prompt:

```text
RUN PARAMETERS
mode: chapter
chapter_number: 2
arc_role: escalation
story_language: zh
length_unit: 字
logline_max: 30
style_anchor_max: 700
chapter_target: 1200
chapter_min: 1200
dialogue_min: 25%
chapter_max: 1500
Write all prose and free-text fields in the story language.
Keep JSON keys, enum values, ids, and check ids in English.
```

This block takes precedence over a number written in an agent file, such as "at
most 800 words". The style agent reads the eight metrics in the profile's unit,
so a `zh` sentence-length mean of 28 means 28 字. Server validation does not trust
the model to count: the orchestrator recounts with `countUnits` and rejects an
over-limit draft with the `word-limit` error code, and recounts dialogue share
with the profile's paired-delimiter measure and rejects a draft below 25% with
the `dialogue-share` error code. The continuation prompt aims for a dialogue
share between 25% and 35%; the 35% end is a soft target, not an acceptance
check, so a draft above it is not rejected.

**Field mapping.** The style agent's `targets` object uses longer names than the
profile. The orchestrator maps them one to one:

| Profile field | Style agent `targets` field |
| --- | --- |
| `sentenceLenMean` | `sentenceLengthMean` |
| `sentenceLenSD` | `sentenceLengthStdDev` |
| `typeTokenRatio` | `vocabularyRichness` |
| `dialogueRatio` | `dialogueRatio` |
| `pacingMarkers` | `pacingMarkersPer100Words` |
| `paraLenMean` | `paragraphLengthMean` |
| `paraLenSD` | `paragraphLengthStdDev` |
| `avgWordLen` | `averageWordLength` |

**UI.** The sample counter shows `NNN / 200 words` or `NNN / 400 字` for the
detected language. The logline counter uses the same unit. The CJK-capable font
stack applies to prose and data; the pixel display font is used only for Latin
labels (see `ux.md`). Chrome strings come from a small `en` and `zh-CN`
dictionary (REQ-28, P1) and do not use an i18n framework. Downloads are UTF-8.

**Known limits.** Type-token ratio falls as text gets longer, in both
languages, so profiles of samples with very different lengths are not directly
comparable. Mixed-language text is treated as the dominant language. Metrics
describe the sample; they do not prove the generated prose will match.

**Tests.** Chinese fixtures are built programmatically from neutral characters
and punctuation, not from a story. They cover: 399 and 400 字 boundaries, text
with no spaces, full-width punctuation, `「」` and `“”` dialogue, nested quotes, a
`……` run, a `——` run, single-line-break paragraphs, Latin words inside Chinese
text, Traditional Chinese, the segmenter fallback, detection near the 50%
threshold, kanji-heavy Japanese with kana (must be "other"), and a sample with
no Han and no Latin runs (must be "other").

### 2.12 Story bible drafting (outline agent, plan mode)

This section implements REQ-30 and REQ-31. It adds no agent: the outline agent
runs in `plan` mode. The fixed four-agent order applies to chapter passes.

**Route.** `POST /api/bible/draft` is a Node.js Route Handler that returns JSON,
not SSE. One request is one layer and one model call on `LLM_MODEL`.
`maxDuration = 60`. It passes the same live gate as the pipeline (§2.13).

```ts
type BibleSeed = {
  genre: string;
  tone: string;
  idea: string; // At most two sentences (REQ-26a splitter).
  notes?: string; // Optional character or setting notes; at most 600 length units.
};

type BibleDraftRequest = {
  layer: "core" | "structure";
  seed: BibleSeed;
  styleProfile: StyleProfile; // Gives the language and unit.
  core?: BibleCore; // Required for "structure": the core layer the user accepted.
};

type BibleCore = Pick<StoryBible, "logline" | "synopsis" | "setting" | "characters">;
type BibleStructure = Pick<StoryBible, "foreshadowing" | "timeline" | "beatSheet">;

type BibleDraftResponse =
  | { layer: "core"; draft: BibleCore }
  | { layer: "structure"; draft: BibleStructure };
```

**Run parameters.** The block carries `mode: plan`, `layer`, and the language
fields of §2.11. Output caps: `core` 1,200 tokens (`zh` 2,000), `structure`
1,200 tokens (`zh` 2,000). These are starting values.

**Server checks.** The server never trusts the model's counts.

| Layer | Deterministic check |
| --- | --- |
| `core` | Schema; logline within `logline_max`; logline contains no character name from the same draft; synopsis is exactly 5 sentences; 2 to 4 characters, at least 1 protagonist (REQ-06), all `alive`; unique ids `char-N`; descriptions are 1 sentence |
| `structure` | Schema; exactly 3 beat-sheet entries for chapters 1 to 3; every `characterStates` map has every core id; 2 to 4 foreshadowing items, all `open`, unique ids `fs-N`; at least one timeline event per chapter; no core field echoed back changed |

A failed check returns `schema-mismatch`. The user may retry a layer at most 3
times. A seed that the model refuses returns `model-refusal`.

**Client flow.**

```text
seed form -> [Draft core] -> core preview -> user edits -> [Accept core]
          -> [Draft structure] -> structure preview -> user edits -> [Accept structure]
          -> bible complete -> chapter 1
```

- A preview is shown beside the editor, marked `DRAFT — not in your bible`. It
  is not sent to any agent until accepted.
- Accept replaces only that layer's fields. If those fields already hold user
  text, the UI asks first and keeps one undo step.
- After `core` is accepted, editing a core field marks an accepted `structure`
  as stale. The user may keep it or redraft it; validation still runs before
  chapter 1.
- The seed is session data. It is saved with the session and not sent with
  chapter passes.

**Snowflake mapping.** `core` covers Snowflake Steps 1 to 3. `structure` covers
Steps 4 and 6; the one-page synopsis is the three `beatSheet` premises. See
`steering/snowflake.md`.

### 2.13 Live gate: access code and rate limits

This section implements REQ-32. `lib/live-gate.ts` is server-only. Both live
routes call it before validation work that costs money and before any model call.

**Order of checks.**

```text
request
  -> live mode on?            no  -> 503 live-unavailable
  -> IP locked out?           yes -> 429 rate-limited (until lockout ends)
  -> access code valid?       no  -> 401 access-required (failure counted;
                                     the 10th starts a 10-min lockout)
  -> IP concurrency free?     no  -> 429 rate-limited
  -> IP window has room?      no  -> 429 rate-limited
  -> daily budget has room?   no  -> 429 rate-limited
  -> take slot, run, release slot
```

**Access code.** The user types the code once. The client keeps it in
`sessionStorage`, never in the `localStorage` session record, a download, or a
replay. It is sent as the `X-Demo-Access` header. The server compares SHA-256
digests with `crypto.timingSafeEqual`. Ten wrong codes from one IP in 10 minutes
lock that IP out for 10 minutes (REQ-32d). The lockout check runs before the code
check, so a locked-out IP gets 429 even with a valid code. The lock is the key
`ss:ban:<ipHash>` with a 10-minute expiry. Rotate the code after judging.

**Limits (server constants).**

| Limit | Value |
| --- | ---: |
| Live requests at a time, per IP | 1 |
| Chapter passes per IP per 10 min | 8 |
| Draft layers per IP per 10 min | 6 |
| Chapter passes per UTC day, all users | 60 |
| Draft layers per UTC day, all users | 60 |
| Wrong codes per IP per 10 min | 10 |

A chapter pass makes at most 6 agent calls (three outline attempts plus style,
continuation, and continuity) plus at most 1 transport retry each, so at most 12
provider calls. A draft layer makes 1 call plus at most 1 retry, so at most 2.
The daily budget bounds model calls at 60 × 12 + 60 × 2 = 840. Premium calls are
at most 2 per pass, so at most 120 per day (60 without transport retries).

**Counter store.** Serverless instances do not share memory, so Production uses
Upstash Redis through its REST API, added through the Vercel Marketplace
integration "Upstash for Redis". Verified 2026-11-08 on the Upstash pricing and
billing pages: the free tier gives 1 database, 250 MB, 500K commands per month,
and 10 GB bandwidth per month. A live request uses about 8 commands, so the daily
budget of 120 requests is about 1K commands per day, or 30K per month. Refused
requests also cost 2 to 4 commands each, so heavy abuse traffic could use up
the monthly quota; the gate then fails closed and the site falls back to replay.
Adding a payment method moves the account off the free tier, so do not add one
without a decision. If the Vercel-managed integration creates `KV_REST_API_URL`
and `KV_REST_API_TOKEN` instead, map them to the names below. Re-check these
numbers in T-31 before implementation. Variables:
`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, and `RATE_LIMIT_SECRET`,
all server-only. Keys:

| Key | Op | Expiry |
| --- | --- | --- |
| `ss:lock:<ipHash>` | `SET NX` | 130 s; deleted when the request ends |
| `ss:win:<kind>:<ipHash>:<10-min bucket>` | `INCR` | 10 min |
| `ss:day:<kind>:<UTC date>` | `INCR` | 36 h |
| `ss:bad:<ipHash>:<10-min bucket>` | `INCR` | 10 min |
| `ss:ban:<ipHash>` | `SET` when bad count reaches 10 | 10 min |

`ipHash` is HMAC-SHA256 of the client IP with `RATE_LIMIT_SECRET`. The client IP
is the first `x-forwarded-for` value that Vercel sets; this is trusted only on
Vercel. No key holds story data. Calls use plain `fetch`, like the model adapter.

**Failure modes.** In Production, a missing or unreachable store makes the gate
return `live-unavailable`: it fails closed, and replay still works. In local
development without a store, an in-memory counter applies per process.

**Provider side.** Also set a billing budget and alert in the provider console
for the premium model. This is a manual step (T-34), not code.

### 2.14 Replay mode

This section implements REQ-33. Replay plays a recorded live run through the
same UI with no model call. It is the fallback when live mode is refused and a
safe default for public visitors.

**File format.** Replay files live in `public/replays/` and are listed in
`public/replays/index.json`. They are static build assets, not runtime output.

```ts
type ReplayFile = {
  kind: "spectre-scribe-replay";
  version: 1;
  recordedAt: string; // ISO date.
  appVersion: string;
  language: "en" | "zh";
  models: { standard: string; premium: string };
  styleProfile: StyleProfile;
  bible: StoryBible;
  passes: Array<{
    chapterNumber: 1 | 2 | 3;
    retryCount: number;
    restartPoint: "outline" | "continuation";
    events: Array<{ tMs: number; event: string; data: unknown }>; // tMs from pass start.
  }>;
};
```

**Recording.** Only in `next dev` (`NODE_ENV === "development"`). The SSE parser
already yields typed events; a recorder appends each one with its time. Text
deltas are merged into 100 ms buckets to keep the file small. A `Download replay`
button saves the file after chapter 3. The recorder drops any field that
REQ-33a forbids and refuses to save a run with no `chapter-accepted` for each
chapter. Owners should record a run that includes one VETO and retry, so the
replay shows the continuity check working.

**Playback.** `ReplayPlayer` loads a file, validates it with the shared schemas,
and feeds its events into the same reducer as a live run, on the recorded clock.

- Speed: 1x, 2x, or skip to end. Gaps between passes shrink to 1.5 s.
- A `REPLAY · recorded <date> · <standard> / <premium>` banner stays visible.
- Replay state is separate from the live session: it never overwrites the
  `localStorage` record. Downloads work and their Markdown header says `Replay`.
- The 3-minute target does not apply to replay; replay shows the recorded times.

**Entry points.** A `Watch a recorded run` button on the first panel; the
`?replay=<name>` URL; and an automatic offer on `access-required`,
`rate-limited`, and `live-unavailable`.

## 3. Key design decisions

**Why four agents instead of one?**
Separating outline, style anchoring, continuation, and continuity gives each agent
a focused, bounded prompt. A single monolithic call is more likely to drift on
style or skip continuity checks.

**Why a style profile instead of only a style description?**
The eight quantitative metrics give the style agent a verifiable target. The same
metric definitions can be applied to output later to detect drift without making
style analysis depend on an external service.

**Why a same-repository Web architecture?**
The browser provides an accessible editing and streaming workspace while Route
Handlers keep model credentials and orchestration on the server. The App Router
keeps the UI and backend contract close together, and SSE exposes progress without
moving secrets into client code.

**Why native `fetch` and Web Streams instead of a provider SDK?**
The configured endpoint is arbitrary OpenAI-compatible infrastructure, while the
browser contract is a project-specific typed SSE protocol. One server adapter can
normalize endpoint construction, token caps, aborts, provider frames, and safe
errors without putting a vendor SDK in every wrapper or forwarding a provider's
wire format. Vercel's AI SDK remains an acceptable future implementation detail,
but it must preserve this route contract and the server-only boundary.

**Why best-effort checkpoint recovery instead of durable resume?**
The product explicitly has no database, queue, or server-side story store. Complete
agent outputs are safe client checkpoints, so a dropped stream can resume a
remaining suffix or restart the current pass. Partial text and a possibly accepted
chapter are not replayable without durable server state, so the UI must surface the
ambiguity rather than claim idempotency.

**Why React state and `localStorage`?**
The demo is a single three-chapter session. A database would add account and
lifecycle complexity without being needed for the demo. Client persistence also
makes the server stateless between stream requests; accepted chapters are sent
explicitly in each validated payload.

**Why cap retries at 3?**
Unbounded retry loops are unacceptable for a demo. Three retries after the first
attempt are enough to address continuity failures; after the cap, the UI surfaces
the failure and lets the user edit the story bible or start a new session.

**Why one length unit per language instead of a token count?**
Users and judges read words and 字, not tokens. A unit that the browser, the
server, and the user all compute the same way keeps the limits visible and
testable. Tokens are used only for output caps inside the model adapter.

**Why a segmenter for only two metrics?**
Character counting is stable and needs no dictionary, so it drives the six
length-based metrics and every validation limit. A word segmenter is needed only
where "word" is the point (vocabulary richness and average word length). Keeping
it out of the limits means a segmenter change cannot break acceptance rules.

**Why draft the bible with the outline agent instead of a fifth agent?**
The product fixes four agents. Planning is the outline agent's job, so plan mode
is the same role at an earlier stage. Two layers, each approved, keep the
Snowflake rule that a bad early layer is fixed early, at two calls instead of four.

**Why an access code plus a counter store?**
A public URL with a paid premium model can be drained by anyone. The access code
stops strangers. The counters cap what a judge or a leaked code can spend. A
counter store holds no story data, so the no-story-database rule still holds.

**Why replay instead of a hosted demo key?**
Replay costs nothing, never hits a rate limit, and still shows real output from
a real run. The banner keeps it honest. Live mode remains for judges who want to
try their own sample.
