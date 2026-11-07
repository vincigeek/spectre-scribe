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
`app/layout.tsx` supplies the document shell and global Tailwind styles.

`app/api/style/analyse/route.ts` accepts a validated `{ sampleText }` request,
rejects empty or sub-200-word samples, calls the pure analyser, and returns a
JSON `StyleProfile`. The route performs no model call.

`app/api/pipeline/stream/route.ts` accepts a validated pipeline payload and returns
an `text/event-stream` response. Its `ReadableStream` forwards server events from
the orchestrator to the browser. The payload contains the chapter number, style
profile, story bible snapshot, accepted chapters, current retry count, and any
veto notes or prior relay outputs needed for a retry.

Both Route Handlers validate data at the trust boundary. They return structured
client errors and do not depend on an in-memory session surviving another request.

### 2.2 Style analyser (`lib/style-analyser.ts`)

The analyser is a pure TypeScript module. It accepts the user-supplied string,
performs no network or file I/O, and returns a serialisable `StyleProfile`. A
small validation wrapper rejects input shorter than 200 words before analysis.

The profile keeps these eight fields and calculation rules:

| Field | Computation |
| --- | --- |
| `sentenceLenMean` | Mean words per sentence, with `.`, `!`, and `?` as sentence boundaries |
| `sentenceLenSD` | Standard deviation of the sentence word-count list |
| `typeTokenRatio` | Unique normalized tokens divided by total normalized tokens; lowercase and remove punctuation |
| `dialogueRatio` | Word tokens inside quotation marks divided by all word tokens |
| `pacingMarkers` | Counts per 100 words for em-dashes, ellipses, and sentence-final `.`, `!`, `?` |
| `paraLenMean` | Mean words per paragraph, splitting paragraphs on blank lines |
| `paraLenSD` | Standard deviation of the paragraph word-count list |
| `avgWordLen` | Mean characters per word after stopwords are excluded |

`pacingMarkers` is one metric with three named subcounts. The analyser does not
call an LLM and does not persist the sample. The style profile is held in React
session state and is sent as a named input to the style agent on every relevant
pipeline request.

A Vitest suite covers known sentence and paragraph counts, vocabulary ratio,
no-dialogue and all-dialogue samples, pacing markers, stopword-excluded word
length, and the 200-word validation boundary.

### 2.3 Story bible schema and editor (`lib/story-bible.ts`)

The shared schema is validated in the client editor and again in the Route Handler.
The server passes a deep, read-only snapshot to agents. The schema is:

```ts
type CharacterStatus = "alive" | "dead" | "unknown";

type StoryBible = {
  genre: string;
  tone: string;
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
including repeatable locations, world rules, characters, foreshadowing entries,
timeline events, and the three chapter beat entries. `deferred` foreshadowing
requires `deferredToChapter`; an open item may not silently become dropped.

The active bible is React state. A client-side `localStorage` record may restore
the current session after a reload, but agents cannot mutate it. The browser
serialises the current bible to a JSON `Blob` for download. It does not write
runtime data to `.kiro`.

### 2.4 Server pipeline and model client (`lib/pipeline/`)

The pipeline is server-only. `AgentDefinitionLoader` reads the four existing
Markdown definitions from `/.kiro/agents/` at runtime without editing them.
`OpenAICompatibleClient` reads `LLM_API_KEY`, `LLM_BASE_URL`, and `LLM_MODEL` from
server environment variables and sends the assembled prompt to the configured
OpenAI-compatible interface. Missing configuration is a structured server error.
The key is never returned in an event, prompt transcript, log, client bundle, or
download.

`PipelineOrchestrator` assembles a bounded context for one chapter. Every relay
pass uses the following order:

1. **Outline agent** reads the style profile, story bible snapshot, and accepted
   chapters, then produces a structured outline of at most eight beats. It does
   not write final prose.
2. **Style agent** reads those inputs plus the outline and produces a style anchor
   of at most 400 words. It targets the named quantitative metrics and does not
   need to complete the chapter.
3. **Continuation agent** reads all previous inputs plus the style anchor and
   produces a complete chapter draft of at most 800 words.
4. **Continuity agent** reads all previous inputs plus the draft and returns
   `APPROVED` or `VETO` with structured failures. It does not rewrite the draft.

Every agent receives the full story bible, the style profile, and previously
accepted chapter texts as read-only context. Later agents also receive earlier
outputs from the current pass. The server includes the previous VETO notes on a
retry.

A single stream request can run one full relay pass. If the continuity result is
`VETO`, the server emits the draft and failure details so the user can review
them. A retry request carries `retryCount + 1`, the VETO notes, and the selected
restart point. The default restart point is outline and runs the complete order.
A continuation
restart is a suffix retry: it MUST reuse the exact outline and style-anchor
outputs from the vetoed pass, then run continuation and continuity in that order.
If those outputs are absent or invalid, the server MUST fall back to an outline
restart. A suffix retry does not reorder the relay. The server rejects a retry
count greater than 3, so a chapter has one first attempt and at most three
additional retries.

The server accepts a chapter only after `APPROVED` and a word-count check of at
most 800 words. It then returns the accepted chapter to the browser, which adds
it to React state and `localStorage`. The client stores a derived continuity ledger
next to accepted chapters. The ledger records the last accepted character statuses
and foreshadowing states used for the next check; it is session data, not a story
bible mutation, and agents cannot write it. The server does not retain any of it
for the next request; the browser sends accepted chapters and the ledger again as
validated request context.

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

The stream uses standard SSE events with JSON data. The minimum event set is:

```text
event: agent-start
data: {"agent":"outline","chapter":1}

event: agent-delta
data: {"agent":"style","text":"..."}

event: agent-complete
data: {"agent":"continuation","output":"..."}
event: continuity
data: {"status":"VETO","failures":[...]}
event: chapter-accepted
data: {"chapterNumber":1,"wordCount":...}
event: error
data: {"code":"...","message":"..."}
event: done
data: {"retryCount":0}
```

The exact event payloads are typed shared data. Deltas are optional for agents
that do not stream from the model, but the route must still send progress and a
terminal `done` or `error` event. The client closes the fetch stream on terminal
events and preserves the latest partial output for review.

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

The chapter workspace shows a green `APPROVED` state or a red `VETO` state with
failing items and suggested fixes. It disables a fourth chapter after chapter 3
is accepted. A final-story download concatenates all three accepted chapters in
order as Markdown; individual chapters use Markdown as well. The bible download
uses JSON.

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

Local development uses `pnpm dev`. A GitHub-connected Vercel project builds the
same Next.js application on pushes to the configured branch. The intended
submission is the public deployed URL, not a local address.

The performance target is the complete sample-analysis plus three-chapter flow
with no retries in under 3 minutes. Instrumentation should measure each Route
Handler request, each model call, and end-to-end browser time. The orchestrator
must bound context to the required style profile, bible, accepted chapters, and
current-pass outputs so a slow or oversized prompt does not bypass the chapter
word limit.

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

**Why React state and `localStorage`?**
The demo is a single three-chapter session. A database would add account and
lifecycle complexity without being needed for the demo. Client persistence also
makes the server stateless between stream requests; accepted chapters are sent
explicitly in each validated payload.

**Why cap retries at 3?**
Unbounded retry loops are unacceptable for a demo. Three retries after the first
attempt are enough to address continuity failures; after the cap, the UI surfaces
the failure and lets the user edit the story bible or start a new session.
