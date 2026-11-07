# Testing steering

This document defines the verification strategy for the implementation. Tests must check
observable contracts and boundaries, not only that a component renders.

## Test layers

| Layer | Scope | External services |
| --- | --- | --- |
| Pure unit | Style metrics, token policy, word counts, schema helpers, SSE parser | None |
| Server unit | Route validation, model-client translation, orchestrator state machine, continuity results | Mocked `fetch` and filesystem reads |
| Component/integration | Workspace state, localStorage restore, downloads, retry controls, event application | Mocked Route Handler responses |
| End-to-end | The complete browser flow and deployment behavior | A configured test provider; no committed credentials |

Keep tests close to the contract they protect. A live model call is not a substitute for a
unit test because model output is nondeterministic, expensive, and unavailable in ordinary
CI.

## Pure style-analysis tests

`tests/style-analyser.test.ts` must prove that `lib/style-analyser.ts` is deterministic and
side-effect free.

- Call the same input repeatedly and compare the complete serialisable profile.
- Assert exactly the eight required metrics and the three named pacing subcounts.
- Use programmatically assembled neutral token fixtures rather than a story, a character
  name, a commercial passage, or a hardcoded demo plot.
- Cover sentence boundaries at `.`, `!`, and `?`, including repeated punctuation and a
  final sentence without a trailing boundary.
- Cover paragraph splitting on blank lines, consecutive blank lines, and a single paragraph.
- Assert population standard deviation, finite values, and stable handling of zero variance.
- Cover paired straight/curly dialogue delimiters, apostrophes inside words, unmatched
  delimiters, no dialogue, and dialogue containing punctuation.
- Cover em-dashes, ellipses, sentence-final punctuation, and punctuation that must not
  become a word token.
- Cover repeated tokens, punctuation-only differences, Unicode letters, non-English text,
  and locale-independent lowercasing. A non-English sample is analyzable; it is not rejected
  merely because the local stopword set does not contain its words.
- Test the empty, under-200-word, exactly-200-word, and over-200-word validation boundaries.
- Assert that direct invalid calls return a typed validation result and never `NaN` or
  `Infinity`.
- Verify through static review or module mocks that the analyser does not import `fetch`,
  filesystem APIs, React, environment variables, or persistence.

The minimum-word check and all profile calculations must use the same exported token policy.
If that policy changes, update its version marker, fixtures, and the design note together.

## Schema and session tests

`tests/story-bible.test.ts` must cover:

- every required top-level field and nested field in the story bible;
- valid role, character-status, and foreshadowing-status enums;
- unique IDs, known character IDs in beat-sheet maps, and exactly one beat entry for each
  chapter 1, 2, and 3;
- bounded required strings, one-paragraph world rules, one-sentence character descriptions,
  valid chapter numbers, and explicit adjacent character-state transitions;
- `deferredToChapter` on every deferred foreshadowing item and the final-chapter payoff rule;
- accepted-chapter order, word counts, retry counts, restart points, and run identifiers;
- rejection of unknown keys and malformed nested values;
- versioned localStorage restore, corrupted JSON, unsupported versions, and invalid nested
  values. Invalid stored data is discarded with a user-visible notice, never used silently.

Fixtures must contain only structural values. They must not introduce a sample passage,
fictional plot, character name, location, or title that could become a demo default.

## Model client and relay tests

Mock the standard `fetch` boundary and assert the outbound request without printing or
snapshotting authorization headers. Cover:

- URL normalization and the single fixed endpoint-construction path;
- missing or malformed configuration as a safe configuration error;
- server-only API-key placement, redaction, and absence from prompts, events, and errors;
- each agent's output-token cap and the provider-specific token-field translation;
- streaming prose delta parsing and complete-text accumulation;
- strict structured-output requests, local JSON parsing, schema validation, refusal handling,
  incomplete responses, and invalid JSON;
- one permitted transient transport retry with a bounded delay and `Retry-After` handling;
- no retry for authentication, permission, malformed-request, unsupported-schema, refusal,
  schema, and word-limit failures;
- abort propagation when the client disconnects or the route deadline expires.

Mock the four agent definitions as fixed file inputs. Assert that the orchestrator calls
exactly `outline -> style -> continuation -> continuity`, that every prompt receives the
named style profile, complete bible snapshot, accepted chapters, and prior outputs, and that
VETO notes are added only on a retry. Assert that no wrapper mutates the caller's bible,
accepted chapters, or continuity ledger.

Cover these relay outcomes:

- a first-pass approval;
- a continuity VETO with structured failures and a user-selected outline retry;
- a continuation retry that reuses valid outline and style checkpoints;
- missing or invalid checkpoints forcing an outline retry;
- a draft over 800 words being rejected before acceptance;
- a fourth retry being rejected before any model call;
- a fourth chapter being rejected before any model call;
- a provider/configuration failure becoming a safe terminal error.

## SSE parser and Route Handler tests

`tests/sse.test.ts` must feed the client parser arbitrary chunk boundaries. Cover:

- one record split between any two bytes;
- multiple records in one chunk;
- multiple `data:` lines joined according to the SSE format;
- comments and heartbeat records ignored;
- named events, event IDs, and `retry` fields;
- unknown event names ignored without stopping the stream;
- malformed JSON producing a safe parser error without accepting partial output;
- a final partial record treated as incomplete, not as a checkpoint;
- terminal `done` and `error` handling;
- stale `runId` events ignored;
- resume from the latest complete agent checkpoint only;
- client cancellation closing the reader and stopping duplicate actions.

Route tests must check normal JSON errors before headers and typed SSE errors after headers.
Assert the required response headers, monotonically increasing event IDs, heartbeat timing
contract, no raw provider frame forwarding, and no secret or full request payload in any
event.

## Accessibility and browser tests

Use browser tests for behavior that cannot be proven by pure unit tests:

- every input has a visible or programmatic label and an associated description;
- validation errors identify the field and are exposed in text;
- progress and terminal status are announced through an appropriate status/live region;
- focus moves to the first error or meaningful result without trapping the user;
- controls are keyboard reachable, visibly focused, and disabled while a run is active;
- status is not communicated by color alone;
- reduced-motion preferences do not hide progress or results;
- JSON and Markdown downloads use browser APIs and never call a server write endpoint.

Prefer semantic queries by role and accessible name over CSS selectors. Keep generated
shadcn primitives reviewable rather than testing their implementation details.

## Performance and delivery checks

The no-retry performance test must measure, separately:

- local style-analysis duration;
- each agent request duration and output size;
- each Route Handler duration and stream time;
- browser end-to-end time from analysis start through chapter 3 acceptance;
- transport-retry count and total model-call count.

The measured path must remain under 180 seconds with no user-visible chapter retries. If it
misses, reduce context, output budgets, or provider latency before changing any product
invariant. Record the environment, Node major, model identifier, deployment region, and test
sample provenance without recording the sample text or secret values.

Before implementation work is considered complete, run the project-local equivalents of:

```text
pnpm typecheck
pnpm lint
pnpm test --run
pnpm build
```

Vitest is project-local and runs on Node 22.12 or newer. Do not use a globally installed test
runner or compiler as evidence of correctness.
