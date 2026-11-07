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
  ├── ChapterWorkspace  ◄── POST /api/pipeline/stream (SSE)
  └── FinalStory        ── browser JSON/Markdown downloads
                                      │
Next.js server (Route Handlers and server-only lib/pipeline)
  │
  ├── request/schema validation
  ├── PipelineOrchestrator
  │     ├── OutlineAgent
  │     ├── StyleAgent
  │     ├── ContinuationAgent
  │     └── ContinuityAgent ── continuity-check.md contract
  ├── AgentDefinitionLoader ── /.kiro/agents/*.md (read-only)
  └── OpenAICompatibleClient ── LLM_API_KEY / LLM_BASE_URL / LLM_MODEL
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

`app/api/style/analyse/route.ts` accepts a validated `{ sampleText }` request,
rejects empty or sub-200-word samples, calls the pure analyser, and returns a
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
typed validation result. The Route Handler rejects input shorter than 200 words
before analysis, while direct callers also receive a finite, non-throwing result.

The profile keeps these eight fields and calculation rules:

| Field | Computation |
| --- | --- |
| `sentenceLenMean` | Mean words per sentence, with `.`, `!`, and `?` as sentence boundaries |
| `sentenceLenSD` | Population standard deviation of the sentence word-count list |
| `typeTokenRatio` | Unique normalized tokens divided by total normalized tokens; lowercased with punctuation removed |
| `dialogueRatio` | Word tokens inside paired straight or curly quotation marks divided by all word tokens |
| `pacingMarkers` | Counts per 100 words for em-dashes, ellipses, and sentence-final `.`, `!`, `?` |
| `paraLenMean` | Mean words per paragraph, splitting paragraphs on blank lines |
| `paraLenSD` | Population standard deviation of the paragraph word-count list |
| `avgWordLen` | Mean characters per word after the versioned local stopword set is excluded |

The token policy is shared by the minimum-word check and all calculations. It is
Unicode-aware, uses locale-independent lowercasing, keeps apostrophes inside
words from becoming dialogue delimiters, and does not reject non-English text.
The stopword set is local and versioned; no language list or language detector is
loaded at runtime. `pacingMarkers` is one metric with three named subcounts.

The analyser does not call an LLM and does not persist the sample. The style
profile is held in React session state and is sent as a named input to the style
agent on every relevant pipeline request. Tests cover empty and short input,
exactly 200 words, punctuation and quote edge cases, Unicode/non-English text,
zero variance, and finite numeric output.

### 2.3 Story bible schema and editor (`lib/story-bible.ts`)

The shared schema is validated in the client editor and again in the Route Handler.
The server passes a deep, read-only snapshot to agents. The schema is:

```ts
type CharacterStatus = "alive" | "dead" | "unknown";

type StoryBible = {
  genre: string;
  tone: string;
  logline: string; // Snowflake Step 1: one sentence, at most 15 words, no character names.
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
It reads `LLM_API_KEY`, `LLM_BASE_URL`, and `LLM_MODEL` only from the server
environment, normalizes the base URL in one place, sends the key only in the
outbound authorization header, and maps provider failures to safe internal errors.
It uses the Chat Completions-compatible request shape for arbitrary providers. A
provider-specific token-limit field or equivalent Responses API request is
translated inside this adapter, never in an agent wrapper. No provider response
body, prompt, key, or credential-bearing URL is sent to the browser.

`PipelineOrchestrator` assembles a bounded context for one chapter. Every relay
pass uses the following order:

1. **Outline agent** reads the named style profile, story bible snapshot, and
   accepted chapters, then produces a strict structured outline of at most eight
   beats. It does not write final prose. It expands the plan in Snowflake layers
   (see `steering/snowflake.md`): logline, then five-sentence paragraph, then
   one-page synopsis, then the beat list that becomes the `beatSheet`. Each
   layer is a separate bounded outline call, approved by the user before the
   next layer starts, and a later layer must not contradict an earlier one.
   The original Snowflake Step 6 (four-page synopsis) is cut for this demo.
2. **Style agent** reads those inputs plus the outline and produces a style anchor
   of at most 400 words. It targets the named quantitative metrics and does not
   need to complete the chapter.
3. **Continuation agent** reads all previous inputs plus the style anchor and
   produces a complete chapter draft of at most 800 words. Prose may be streamed
   upstream, but the server retains and validates the complete text.
4. **Continuity agent** reads all previous inputs plus the draft and returns
   `APPROVED` or `VETO` with structured failures. It does not rewrite the draft.

Initial output caps are constants: outline 600 tokens, style 900, continuation
1,600, and continuity 800. Strict JSON Schema is requested for outline and
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

The server accepts a chapter only after `APPROVED` and a server word-count check
of at most 800 words. It then returns the accepted chapter to the browser, which
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
event: error
data: {"runId":"...","code":"...","message":"...","retryable":false}

id: 8
event: done
data: {"runId":"...","status":"vetoed","nextAction":"retry"}
```

The exact payloads are typed shared data. `agent-delta` is optional for outline
and continuity; structured calls may emit only `agent-complete`. A successful run
ends with `done`. If the connection is still writable, an `error` event is followed
by terminal `done`. The client accepts a chapter only from a validated
`chapter-accepted` event, never from a delta or a continuity-looking string.

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
| `FinalStory` | Render the exactly three accepted chapters and expose downloads |

Tailwind CSS 4 supplies layout and visual tokens. shadcn/ui primitives supply
accessible inputs, buttons, tabs, alerts, dialogs, and progress indicators.
Client components own user interactions and synchronise a serialisable session
object to `localStorage`. The session contains the style profile, bible, pending
chapter result, accepted chapters, derived continuity ledger, retry count, and
pipeline status. It contains no model secret.

The chapter workspace shows a text-labelled `APPROVED` state or a text-labelled
`VETO` state with failing items and suggested fixes; color is supplementary only.
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

Set `LLM_API_KEY`, `LLM_BASE_URL`, and `LLM_MODEL` separately for Preview and
Production. They are server-only variables without a `NEXT_PUBLIC_` prefix. Vercel
environment changes apply to new deployments, so redeploy after changing them.
No secret value is committed or printed.

The performance target is the complete sample-analysis plus three-chapter flow
with no user-visible retries in under 3 minutes. Instrumentation measures each
Route Handler request, each provider call, output size, transport-retry count,
stream time, and browser end-to-end time. The orchestrator bounds context to the
required style profile, bible, accepted chapters, and current-pass outputs so a
slow or oversized prompt does not bypass the chapter word limit. If the measured
path misses 180 seconds, reduce context, output budgets, or provider latency
before changing any product invariant.

Before implementation is considered complete, run the project-local type check,
lint, Vitest suite, production build, and measured no-retry flow. The GitHub and
Vercel connection is documented here but is not performed by this design migration.

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
