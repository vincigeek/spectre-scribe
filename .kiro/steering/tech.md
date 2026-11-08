# Tech steering

This document defines the implementation baseline. It is intentionally more specific than
`README.md`; a rule here is actionable only when it can be checked in code, configuration,
or a test.

## Baseline and version policy

The repository currently contains specifications but no package manifest or lockfile. The
first implementation task must create both. Do not infer versions from a globally installed
CLI.

| Area | Decision | Rule when installing |
| --- | --- | --- |
| Framework | Next.js 15 App Router | Use the latest compatible 15.x patch available when scaffolding and record the exact resolved version in `package.json` and `pnpm-lock.yaml`. The versioned Next.js 15 documentation was `15.5.29` during this research. Do not silently move to Next.js 16. |
| UI runtime | React and `react-dom` 19.x | React 19 is the minimum for Next.js 15. React 19.3 was the current official release during this research; use the latest React 19 patch that passes the Next.js 15 peer and build checks. Do not reintroduce React 18 to silence a peer warning. |
| Language | TypeScript, project-local | TypeScript 7.0 was current upstream during this research, but compatibility with the pinned Next.js 15 line is not assumed. Select the newest compatible compiler, install it locally, and verify `tsc --noEmit`, `next build`, and React type checks before recording the decision. Never depend on a global `tsc`. |
| Runtime | Node.js 22.x, at least 22.12 | Vitest 5.1 requires Node 22.12 or newer. Use the same Node major locally and in Vercel. Vercel currently offers 22.x, 24.x, and 26.x; selecting 22.x avoids an unrequested runtime upgrade while satisfying Vitest. |
| Styling | Tailwind CSS 4.x | Tailwind documentation reported 4.3. Use the PostCSS integration with `@tailwindcss/postcss` and `@import "tailwindcss"`; do not copy a Tailwind 3 configuration into a v4 project. |
| Components | shadcn/ui, generated into the repository | Use the current `pnpm dlx shadcn@latest` CLI only during setup. Generated primitives live under `components/ui/`, are reviewed, and are committed like application code. The runtime never downloads a component. |
| Unit tests | Vitest 5.1.x | Keep Vitest project-local and use a lockfile. Vitest 5.1 requires Vite 6.4 or newer and Node 22.12 or newer. |
| Package manager | pnpm | Use `pnpm dev` locally and commit `pnpm-lock.yaml`. CI and Vercel must install from the lockfile rather than resolving a new graph. |

A dependency upgrade is a deliberate change. Check the pinned Next.js major, React peer
ranges, TypeScript compiler, Tailwind v4 CSS output, shadcn generated code, Vitest, and the
Node runtime together. A newer upstream release does not override the fixed Next.js 15
project requirement.

## Next.js and React boundaries

- Use the App Router. Server Components are the default; add `'use client'` only to files
  that need browser events, React session state, `localStorage`, file input, or streamed
  response handling.
- `app/api/` Route Handlers are the only browser-to-server API boundary. They use standard
  Web `Request` and `Response` objects and validate every JSON body before invoking a
  server-only module.
- Follow Next.js 15's asynchronous request APIs. Await `cookies`, `headers`, `params`, and
  `searchParams` when they are used. Do not copy synchronous examples from Next.js 14.
- Do not cache model calls, session payloads, or style-analysis responses. A Route Handler
  may opt into caching only for a future, explicitly reviewed static resource.
- Use the Node.js runtime for the pipeline Route Handler. The server reads fixed files under
  `/.kiro/agents/`, needs the complete Node runtime, and does not benefit from Edge's
  first-byte constraint. Do not move the pipeline to Edge to work around a performance test.
- Keep `layout.tsx` and the page shell small. Pipeline orchestration, model access, and
  file loading must not be imported into a client component.

## Styling and component rules

- Tailwind v4 is CSS-first. Put global imports and theme variables in the global CSS file;
  use utilities in markup. Do not add Sass, Less, a second CSS preprocessor, or scattered
  CSS Modules unless a documented component constraint requires it.
- Tailwind v4 targets modern browsers: Chrome 111+, Safari 16.4+, and Firefox 128+.
  Do not promise support for older browsers in the UI or deployment notes.
- Use shadcn/ui primitives for labels, controls, tabs, alerts, dialogs, and progress where
  they fit. Keep the generated code local so the accessibility behavior and styling can be
  reviewed. Do not add a component library merely to solve a one-off visual detail.
- Prefer semantic HTML and the primitive's accessible name, description, focus, and disabled
  states over color-only status styling. Details belong in `ux.md`.

## Pure analysis and schemas

- `lib/style-analyser.ts` is a pure TypeScript module. It receives text and returns a
  serialisable profile or a validation result. It cannot import `fetch`, `fs`, environment
  variables, React, or a database client.
- Shared story-bible and request types must be usable by both browser and server code. Keep
  them free of Node-only imports. Runtime validation runs again at every Route Handler
  boundary; TypeScript types alone are not trust-boundary validation.
- Shared text rules live in `lib/text-units.ts` (pure): language detection, length-unit
  counting, sentence and paragraph splitting, and the per-language limits. Browser and server
  both import it, so a count never differs between them.
- Chinese word-level metrics (vocabulary richness, average word length) use the built-in
  `Intl.Segmenter("zh")`, only in the server route, on the pinned Node 22.x runtime with full
  ICU. Record `analyserVersion` in the profile and fall back to one character per token if
  the segmenter is missing. Add no segmentation dependency without a recorded reason.
- The profile always contains exactly the eight required metrics. The definitions in
  `requirements.md` are the contract; presentation may explain a metric but cannot replace
  it with an LLM-generated style description.

## Server model client

The server uses one small adapter around standard `fetch`, not a browser SDK and not a
provider-specific client in every agent wrapper.

1. Read only `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`, and
   `LLM_MODEL_PREMIUM` (optional; continuity only, falls back to `LLM_MODEL` when unset, see
   design §2.4) on the server. Missing or
   malformed configuration returns a safe configuration error.
2. Normalize the configured base URL in one module and construct the provider endpoint in
   one place. Do not accept a model endpoint from a browser request. Do not log the URL if it
   contains credentials or query parameters.
3. Send the API key only in the outbound server request. Never place it in a prompt, event,
   thrown error, downloaded file, client bundle, or debug log. Redact authorization headers
   in any test or diagnostic object.
4. Use the OpenAI-compatible Chat Completions request shape because arbitrary compatible
   servers commonly implement it. The adapter's initial dialect is the current
   `max_completion_tokens` field and strict `response_format` JSON Schema. A selected
   provider that requires another accepted field is handled by one adapter-only dialect
   setting and a contract test; the browser and agent wrappers never choose it. Do not
   guess a dialect from a model name or retry a 400 unsupported-parameter response. If the
   selected endpoint does not satisfy the tested dialect, return a safe configuration error.
   An equivalent Responses API may be added behind the same interface only after a provider
   contract test.
5. Use provider streaming only for prose where incremental display helps. Parse upstream
   events in the server and emit the project's typed events; never forward raw provider
   frames or provider error bodies to the browser.
6. Request strict JSON Schema output for outline and continuity by default. If the selected
   provider has a tested JSON-object-only mode, the adapter may use that mode only with the
   same local schema validation and no approval shortcut. If neither structured mode is
   supported, fail configuration rather than silently accepting unconstrained output.
   A refusal, incomplete result, invalid JSON, or missing field is a failed agent call,
   never an implicit approval.

Initial output budgets are deliberately bounded and must be constants covered by tests:

| Agent output | Initial cap | Additional server check |
| --- | ---: | --- |
| Outline | 600 output tokens | No more than eight beats; structured outline only |
| Style | 900 output tokens | Style anchor no more than 400 words |
| Continuation | 1,600 output tokens | Aim for the soft chapter guidance; enforce only the chapter minimum and dialogue floor |
| Continuity | 800 output tokens | `APPROVED` or structured `VETO`; no prose rewrite |

The table shows English values. Chinese runs use about 1.6 times the token caps (outline
1,000, style 1,500, continuation 2,600, continuity 1,300) and the Chinese length limits in
`requirements.md` REQ-24 (anchor 700 字, soft chapter guidance 1,800 字). These are starting values; tune them
in the performance task.

The compatible client must use the token-limit field accepted by the selected provider and
keep that translation inside the adapter. It must not silently omit a cap. The first provider
contract test must record the chosen token-limit field and structured-output mode; changing
either is an adapter change with new mocked coverage, not a browser option. Context is also
bounded: send the named style profile, full validated story bible snapshot, prior accepted
chapters, current-pass outputs, and retry notes, but do not send the raw sample passage to
model calls after local analysis.

Each outbound call has an `AbortSignal` and a deadline. Retry only a transient connection,
408, 429, 500, 502, 503, or 504 failure, honor `Retry-After` when present, cap the wait, and
allow at most one transport retry when the route budget permits it. Do not retry
authentication, permission, malformed-request, schema, refusal, or legacy word-limit failures.
Transport retries are separate from the user-visible chapter retry count, but both are
included in performance and cost measurements.

## Statelessness and security

- React state is the active session. `localStorage` stores only serialisable session data
  needed to restore the workflow; it is not a server-side store and is not a security
  boundary.
- There is no database, account system, queue, or long-lived in-memory session. A request
  carries the validated story bible, style profile, accepted chapters, and continuity ledger
  it needs. Correctness must not depend on a warm Vercel instance.
- Treat samples, bible fields, chapter text, and veto notes as untrusted user/model data.
  Delimit them in prompts, validate lengths and enums, and do not execute or interpret them
  as paths, code, or configuration.
- The server may read only the four fixed agent paths. It must not write runtime story data
  into `/.kiro`; the browser creates JSON and Markdown downloads with `Blob` objects.
- Keep `.env` and `.env.local` out of version control. Documentation may contain the three
  variable names, never their values.

## Deployment and checks

- Vercel is the intended deployment. Use the Node.js runtime and configure the pipeline
  function's duration explicitly below the three-minute end-to-end target; the exact route
  contract is in `api-streaming.md`.
- Vercel's current Fluid Compute limits are 300 seconds default and maximum on Hobby, and
  300 seconds default with an 800-second maximum on Pro and Enterprise. Streamed response
  time counts toward function duration. These are ceilings, not a reason to skip the
  180-second product test.
- Set `engines.node` to the selected Node 22 major and select the matching Vercel project
  runtime. Vercel may update minor and patch versions within a major, so the lockfile and
  build output remain the reproducibility boundary.
- Configure `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`, and
  `LLM_MODEL_PREMIUM` separately for Preview and
  Production in Vercel. Also configure the live-gate variables `DEMO_ACCESS_CODE`,
  `RATE_LIMIT_SECRET`, `UPSTASH_REDIS_REST_URL`, and `UPSTASH_REDIS_REST_TOKEN`
  (design §2.13). Without them, Production runs replay only. Environment changes apply to new deployments, so redeploy after a
  change. None receives a `NEXT_PUBLIC_` prefix.
- Before an implementation change is considered ready, run the local type check, lint,
  Vitest suite, production build, and the measured no-retry flow. The repository currently
  has no scaffold, so these commands become available only after Phase 1.

## Conflict resolution

1. Hard requirements, protected paths, privacy rules, and the fixed four-agent order win.
2. A Route Handler must preserve server-only secrets and request validation even if a
   convenience library suggests a client-side shortcut.
3. The pinned Next.js 15 requirement wins over current Next.js 16 documentation. Record a
   compatibility issue and ask the owner before changing the major version.
4. Platform limits constrain implementation but do not change product limits. If the measured
   flow cannot meet three minutes, reduce context, output budgets, or provider latency before
   changing chapter count, word cap, retry cap, or persistence rules.
5. When these documents and the requirements disagree, stop and record the contradiction;
   do not silently expand scope or alter `requirements.md`.

## Verified references

Checked 2026-11-07:

- [Next.js 15 documentation index](https://nextjs.org/docs/15/llms.txt) and [Next.js 15 upgrade notes](https://nextjs.org/docs/app/guides/upgrading/version-15)
- [Next.js Route Handlers](https://nextjs.org/docs/app/api-reference/file-conventions/route)
- [React 19.3 release](https://react.dev/blog/2026/09/09/react-19-3)
- [TypeScript project installation](https://www.typescriptlang.org/download/)
- [Tailwind CSS Next.js installation](https://tailwindcss.com/docs/guides/nextjs) and [compatibility](https://tailwindcss.com/docs/compatibility)
- [shadcn/ui Next.js installation](https://ui.shadcn.com/docs/installation/next) and [Tailwind v4 support](https://ui.shadcn.com/docs/tailwind-v4)
- [Vitest getting started](https://vitest.dev/guide/)
- [Vercel streaming](https://vercel.com/docs/functions/streaming/quickstart), [limits](https://vercel.com/docs/functions/limitations), and [Node versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)
- [OpenAI text generation](https://platform.openai.com/docs/guides/text-generation), [streaming](https://platform.openai.com/docs/guides/streaming-responses), [Structured Outputs](https://platform.openai.com/docs/guides/structured-outputs), and [error codes](https://platform.openai.com/docs/guides/error-codes)
