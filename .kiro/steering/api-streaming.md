# API and streaming steering

This document defines the browser-to-server pipeline contract. It complements `tech.md`;
it does not add a fourth agent, a new persistence layer, or a new product limit.

## Route contract

The pipeline endpoint is `POST /api/pipeline/stream`. The request body is JSON and must
contain a complete, versioned, validated session slice:

- `runId`, a client-generated opaque identifier with a bounded length;
- `chapterNumber`, restricted to 1, 2, or 3;
- `retryCount`, where 0 is the first attempt and 1 through 3 are user-visible retries;
- `restartAt`, restricted to `outline` or `continuation`;
- the style profile with exactly the eight metrics;
- the complete story-bible snapshot;
- accepted chapters in order;
- the derived continuity ledger;
- veto notes and valid relay checkpoints when this is a retry or transport resume.

The browser never sends a provider URL, model name, authorization header, or API key. The
Route Handler rejects unknown fields, an invalid content type, an oversized body, invalid
JSON, a fourth chapter, a fourth retry, and any nested schema violation before starting a
stream.

The style endpoint remains separate: `POST /api/style/analyse` validates the sample and
returns JSON. It does not call a model and does not use SSE.

## Runtime and Vercel limits

- The pipeline Route Handler uses the Node.js runtime. It needs the complete Node API to
  load the four fixed agent files and to cancel upstream fetches safely.
- Start with an explicit route `maxDuration` of 120 seconds and an internal pipeline
  deadline of 110 seconds. The value is a ceiling for one chapter request, not a promise
  that a run will take that long. It must remain below the 180-second end-to-end product
  target unless the owner approves a change.
- The initial per-agent deadlines are 15 seconds for outline, 20 seconds for style, 45
  seconds for continuation, and 20 seconds for continuity. Prompt assembly, validation,
  event framing, and one permitted transport retry share the remaining route budget.
  These constants are measured and revised only after the no-retry performance test.
- Vercel counts time spent sending a streamed response toward function duration. Current
  Fluid Compute limits are 300 seconds by default and maximum on Hobby, and 300 seconds
  default with an 800-second maximum on Pro and Enterprise. These limits are ceilings, not
  a substitute for the product test.
- Do not use the Edge runtime. Edge streaming has a 25-second first-byte requirement for
  extended streaming and does not help this filesystem-bound, Node-compatible route.
- The handler must stop work when the client aborts or its deadline expires. It passes one
  combined `AbortSignal` to every provider fetch and closes the stream in a `finally` path.

## Response headers and framing

A successful stream uses:

```text
Content-Type: text/event-stream; charset=utf-8
Cache-Control: no-cache, no-transform
X-Content-Type-Options: nosniff
```

The server emits UTF-8 SSE records. Each record ends with a blank line. Every non-comment
record has a monotonically increasing `id`, one `event` name, and one JSON `data` line. Raw
provider frames, prompts, authorization headers, stack traces, and full request payloads
never appear in the stream.

The server emits a comment heartbeat such as `: keep-alive` at least every 15 seconds while
waiting for a provider response. A heartbeat is transport noise, not a typed application
event. The client ignores comments and keeps its last complete checkpoint.

Every typed event includes `runId` so the client can ignore stale events. The
minimum typed events are:

| Event | Required data besides `runId` | Meaning |
| --- | --- | --- |
| `run-start` | `chapterNumber`, `retryCount` | A validated run began |
| `agent-start` | `agent`, `chapterNumber` | One fixed-order agent began |
| `agent-delta` | `agent`, bounded `text` | Incremental prose for a streaming agent |
| `agent-complete` | `agent`, typed `output` | A complete, server-validated intermediate output is available |
| `continuity` | `status`, structured failures when vetoed | The continuity decision is reviewable |
| `chapter-accepted` | `chapterNumber`, `wordCount`, chapter payload | Approval and the server word-count gate both passed |
| `relay-receipt` | per-agent step summaries and changes, foreshadowing transitions, continuity status | What the relay did, blocked, or fixed in this pass, for approved and vetoed passes alike |
| `error` | safe `code`, safe `message`, `retryable` | The run cannot continue |
| `done` | terminal status, next action | The client may close the stream |

`agent-delta` is optional for outline and continuity. The server may emit only
`agent-complete` for structured calls. The server emits one `relay-receipt` event
on every completed pass, approved or vetoed, before `done`. A `done` event is sent after success; an `error` event
is followed by a terminal `done` when the connection is still writable. The client never
accepts a chapter from a delta or from a continuity-looking string; it accepts only the
validated `chapter-accepted` event.

## Upstream provider translation

The server adapter handles the configured OpenAI-compatible endpoint, not the browser.

- Use a bounded Chat Completions-compatible request for arbitrary providers. Keep endpoint
  construction, authentication, the provider's token-limit field, structured-output option,
  and streaming parser inside `lib/pipeline/client.ts`. The initial adapter dialect uses
  `max_completion_tokens` and strict JSON Schema; a selected provider that needs another
  accepted field or JSON-object mode gets one adapter-only dialect setting plus a provider
  contract test. Do not infer a dialect from a model name or retry an unsupported-parameter
  400 response. An untested provider dialect is a configuration error.
- Stream prose only when incremental display helps. Translate provider deltas into
  `agent-delta` events and retain the complete final text for word counting and validation.
- Request strict JSON Schema output for the outline and continuity calls by default. A
  tested JSON-object-only provider mode may be used only with the same local schema
  validation; neither mode may create an approval shortcut. A refusal, incomplete response,
  malformed JSON, schema mismatch, or missing field is an agent failure and cannot become
  `APPROVED`.
- Treat only connection failures, 408, 429, 500, 502, 503, and 504 as transient. Honor a
  valid `Retry-After` value but cap its delay and allow at most one transport retry when the
  route deadline leaves room. Never retry authentication, permissions, malformed requests,
  unsupported schema, refusal, or word-limit failures.
- Provider error bodies are not forwarded. Map them to stable internal codes such as
  `configuration`, `provider-auth`, `provider-timeout`, `provider-rate-limit`,
  `provider-unavailable`, `invalid-agent-output`, `continuity-veto`, and `cancelled`.

## Client consumption and recovery

The endpoint is POST, so the browser uses `fetch()` and reads `response.body` with a
`ReadableStream` reader. It does not use `EventSource`, which cannot carry this JSON request
body. The parser must handle records split across chunks, multiple `data:` lines, comments,
unknown event names, malformed JSON, and a final partial chunk.

Each complete `agent-complete`, `continuity`, and `chapter-accepted` event is a client
checkpoint. The client stores the serialisable checkpoint in React state and the
versioned `localStorage` session. A checkpoint is an untrusted resume hint, not proof
of server approval. The server validates the checkpoint shape and output schema again,
deep-copies it, and never treats a client-supplied `APPROVED` value as sufficient to
accept a chapter.

The allowed suffixes are explicit: a validated outline checkpoint permits the
style/continuation/continuity suffix, a validated style checkpoint permits the
continuation/continuity suffix, and a validated continuation checkpoint permits a
continuity rerun. A continuity checkpoint never bypasses the continuity rerun or the
server word-count gate. If the accepted event may have been lost, the server reruns
continuity and emits a new `chapter-accepted` only after both gates pass. `Last-Event-ID`
may be sent as bookkeeping, but there is no server event log and no automatic replay
claim.

On a network drop:

1. Abort the current reader and preserve the last complete checkpoint and all accepted
   chapters.
2. Offer one transport recovery action. If a complete checkpoint exists, resend the same
   validated request with the checkpoint and resume the remaining fixed-order suffix. If no
   checkpoint exists, restart the current pass at outline.
3. Never treat partial text as a valid outline, style anchor, chapter, or continuity result.
4. If recovery fails, show an interrupted-run error and let the user choose a normal retry
   point. A transport recovery is not allowed to bypass the chapter's maximum of three
   user-visible retries.
5. If the connection drops after the server may have accepted a chapter but before the
   client receives `chapter-accepted`, do not silently add the chapter. Require a replay or
   user retry; statelessness means the server cannot claim durable idempotency.

This is best-effort resume, not durable background execution. Adding replay storage, a queue,
or a database would require an owner decision because those features are explicitly out of
scope.

## HTTP and error behavior

- Before headers are sent, invalid requests return a normal JSON error with an appropriate
  4xx status and a stable safe code.
- After a stream starts, errors are represented by the typed `error` event. The server does
  not attempt to change the HTTP status after streaming begins.
- Client aborts are not shown as provider failures. They cancel upstream work and leave the
  run in an interrupted state.
- The client disables duplicate start/retry actions while a run is active and ignores stale
  events whose `runId` does not match the active session.
- No event includes the raw sample unless a future owner explicitly changes the privacy
  model. No event includes a key, URL credentials, model configuration, or stack trace.

## References checked 2026-11-07

- [Next.js Route Handlers and Web Streams](https://nextjs.org/docs/app/api-reference/file-conventions/route)
- [Vercel streaming](https://vercel.com/docs/functions/streaming/quickstart)
- [Vercel Function limits](https://vercel.com/docs/functions/limitations)
- [Vercel Node.js runtime](https://vercel.com/docs/functions/runtimes/node-js)
- [OpenAI streaming responses](https://platform.openai.com/docs/guides/streaming-responses)
- [OpenAI Structured Outputs](https://platform.openai.com/docs/guides/structured-outputs)
- [OpenAI error codes](https://platform.openai.com/docs/guides/error-codes)
- [MDN: Using server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)
