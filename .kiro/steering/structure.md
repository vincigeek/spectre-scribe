# Structure steering

The application uses the Next.js 15 App Router and keeps the browser and server in the same
repository. The repository currently has no scaffold; this is the planned boundary map, not
permission to create application code during this document migration.

## Planned repository map

```text
app/
  layout.tsx
  page.tsx
  globals.css
  api/
    style/analyse/route.ts
    pipeline/stream/route.ts
components/
  sample-input.tsx
  style-profile.tsx
  story-bible-editor.tsx
  chapter-workspace.tsx
  final-story.tsx
  ui/                  # reviewed shadcn/ui primitives
lib/
  style-analyser.ts    # pure TypeScript functions
  story-bible.ts       # shared schema and validation
  downloads.ts         # browser-side JSON/Markdown downloads
  pipeline/            # server-only orchestration and model access
    agent-loader.ts
    client.ts
    orchestrator.ts
    prompts.ts
    sse.ts
tests/
  style-analyser.test.ts
  story-bible.test.ts
  pipeline.test.ts
  sse.test.ts
.kiro/
  agents/              # outline, style, continuation, continuity; unchanged
  hooks/               # continuity-check.md; unchanged
  steering/
  specs/spectre-scribe/
```

The exact file split may be adjusted when implementation starts, but the boundaries below
must remain true.

## Dependency direction

- `app/page.tsx` composes the workspace. It does not load files, read environment
  variables, call a model, or own server orchestration.
- `app/api/style/analyse/route.ts` validates the request and calls only the pure analyser.
  It never calls a model or reads a sample from a URL.
- `app/api/pipeline/stream/route.ts` validates a complete request, selects the Node.js
  runtime, and delegates to the server-only pipeline. It is the only browser-facing model
  boundary.
- Client components own event handlers, active React session state, the fetch-based SSE
  reader, and browser downloads. They may import shared serialisable types and validation
  helpers but never import `lib/pipeline/*`.
- `lib/story-bible.ts` contains shared types and runtime validation that work in both browser
  and server environments. It must not import `node:fs`, `process.env`, or a provider SDK.
- `lib/style-analyser.ts` contains only deterministic calculations and typed validation. It
  must not import React, filesystem APIs, network APIs, environment variables, or a database.
- `lib/pipeline/*` is server-only. It may use Node filesystem APIs to read the four fixed
  agent files and standard `fetch` to call the configured provider. Add a server-only import
  guard or equivalent build check when the scaffold supports it.
- `lib/downloads.ts` is browser-only. It creates JSON and Markdown `Blob` downloads and never
  writes to the repository or a server filesystem.
- `components/ui/*` contains generated, reviewed shadcn/ui primitives. Product-specific
  behavior belongs in the feature components, not in generated primitives.

## Server file access

The loader resolves the repository root and reads only these immutable paths:

- `/.kiro/agents/outline.md`
- `/.kiro/agents/style.md`
- `/.kiro/agents/continuation.md`
- `/.kiro/agents/continuity.md`

Do not build a filesystem path from a user field. Do not allow an agent or request to write
under `/.kiro`. If a required file is missing or is only a stub without a usable output
contract, return a safe configuration error and record the blocker; do not edit it or invent
a replacement in application code.

## Request and state boundaries

Every Route Handler validates at least:

- JSON shape, content type, body size, and allowed fields;
- the eight-metric style profile and finite numeric values;
- every story-bible enum, ID relationship, chapter number, beat entry, and deferred
  foreshadowing target;
- accepted chapter word counts and chapter ordering;
- retry count, restart point, run identifier, and any resume checkpoint.

The browser sends the validated style profile, bible snapshot, accepted chapters, continuity
ledger, retry counter, and the current relay checkpoint on each pipeline request. A request
gets a fresh deep copy. The server never depends on a warm process or mutates a client-owned
object.

The serialisable session is versioned. On restore, parse JSON, check the version, validate
every nested value, and discard invalid or incompatible data with a visible notice. Keep raw
sample text transient by default; the derived profile is sufficient for later pipeline calls.

## Relay context and immutability

A single chapter pass is an explicit state machine:

```text
validated request
  -> outline
  -> style
  -> continuation
  -> continuity
  -> APPROVED + <=800 words
  -> accepted chapter
```

Every agent receives the named style profile, the full story-bible snapshot, all previously
accepted chapters, and the outputs from earlier agents in the same pass. A retry also gets
structured veto notes. The raw sample is not in this context. The current pass may hold
intermediate outputs in memory, but no agent may mutate the bible, accepted chapters, or
continuity ledger.

An outline retry starts at outline. A continuation retry is allowed only when the prior
outline and style outputs pass validation; it reuses those exact outputs and runs the fixed
suffix `continuation -> continuity`. Missing or invalid checkpoints force an outline retry.
A retry after the fourth user-visible failure is rejected before any model call.

## Protected configuration and repository rules

- `/.kiro` remains at the repository root and remains tracked, not ignored.
- `/.kiro/agents/` and `/.kiro/hooks/` are read-only inputs for this work.
- Runtime story data never goes into `/.kiro`, `public/`, logs, a database, or a server-side
  session store.
- `.env` and `.env.local` remain ignored and contain no committed values.
- The demo plot, names, locations, title, and sample passage remain user-provided/TBD. No
  placeholder story is allowed in component defaults, fixtures, steering, or design.

## Conflict resolution

1. `requirements.md`, privacy rules, protected files, and the fixed relay order override this
   map.
2. A server/client boundary protects secrets even if a component library or framework
   shortcut would make a feature faster.
3. Keep shared modules runtime-neutral. If a feature needs Node or browser APIs, move it to
   the correct side rather than widening a shared dependency.
4. If a new dependency would blur a boundary, prefer a small local adapter or document an
   owner decision before adding it.
5. This map describes implementation structure only. It does not add chapters, agents,
   persistence, content, or user-facing requirements.
