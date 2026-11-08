# Spectre Scribe

Spectre Scribe is a Next.js 15 full-stack Web app in which four server-side agents write a short story in relay. It is built for Kiroween 2026.

- Main track: Frankenstein (combining things that do not normally go together)
- Also aiming at: Best Kiro Crew App, Best Demo
- Form: a browser-based Web app, not a million-word generator
- Languages: English and Chinese; the story language follows the sample
- Demo scope: one short science-fiction story with exactly 3 chapters
- Pipeline: style statistics from a sample -> story bible (drafted from a seed, then edited) -> four-agent relay -> continuity checks
- Live mode needs a demo access code and is rate limited; anyone can watch a recorded replay
- Inspiration only: the earlier OCNovel project. No code is copied from it; this repository is written fresh in the submission period.
- Copyrighted material is not crawled, fetched, or used as sample text.
- Demo plot, character names, and sample passage remain TBD and are not hardcoded in the specification.

## Stack

- Next.js 15 App Router
- React 19 and TypeScript
- Tailwind CSS 4 and shadcn/ui
- Next.js API Routes through Route Handlers for the backend
- `lib/style-analyser.ts`: pure TypeScript style analysis with no network or file I/O
- Vitest for style-analyser unit tests
- React state plus `localStorage` for session data; no database
- Server-Sent Events (SSE) for pipeline progress and streamed agent output

The frontend and backend live in this repository. The server reads the four agent definitions from `/.kiro/agents/` as read-only files and calls them through an OpenAI-compatible interface. The base continuity contract remains in `/.kiro/hooks/continuity-check.md`; server-side validation adds the demo's structured result and retry rules.

## How Kiro was used

- `/.kiro/steering/` : product, technology, and repository structure guidance
- `/.kiro/specs/spectre-scribe/` : requirements, design, and implementation tasks
- `/.kiro/agents/` : the four Crew agents (outline, style, continuation, continuity); the app never modifies them
- `/.kiro/hooks/` : continuity checks for character status, timeline order, and foreshadowing payoff; the app never modifies them

The `.kiro` directory is at the repository root and must not be added to `.gitignore`.

## Run locally

```text
pnpm install
pnpm dev
```

Configure `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`, and optionally `LLM_MODEL_PREMIUM` (used only by the continuity agent) in the deployment environment or in a local environment file that is excluded from version control. Live mode in Production also needs `DEMO_ACCESS_CODE`, `RATE_LIMIT_SECRET`, `UPSTASH_REDIS_REST_URL`, and `UPSTASH_REDIS_REST_TOKEN`; without them the deployed site runs replay only. The values are read only by server-side Route Handlers. No real key or password belongs in this repository, the browser bundle, or the documentation.

The sample must contain at least 200 words (English) or 400 字 (Chinese) and must be the user's own writing or public-domain text. Style analysis is performed by the pure TypeScript function behind the style-analysis Route Handler, without external text retrieval or an LLM call. The pipeline sends the style profile, story bible, prior accepted chapters, and current relay outputs to the configured model service. A chapter is at most 800 words (1,500 字 in Chinese); after the first attempt, each chapter may have at most 3 retries. The demo accepts exactly 3 chapters.

The story bible can be downloaded as JSON. Accepted chapters and the complete story can be downloaded as Markdown files. Session state is restored from `localStorage`; the server does not persist story data.

## Test environment (mock model)

The repository ships a test-only mock model so the full flow runs without a real key.

```text
# 1. Settings (git-ignored). Use a mock key for the test environment.
cat > .env.local <<EOF
LLM_API_KEY=mock-not-a-secret
LLM_BASE_URL=http://127.0.0.1:8787/v1
LLM_MODEL=mock-standard
LLM_MODEL_PREMIUM=mock-premium
DEMO_ACCESS_CODE=<pick-a-code>
RATE_LIMIT_SECRET=<random-string>
LIVE_GATE_MEMORY_STORE=1
EOF

# 2. Build, then start the mock model and the app.
pnpm build
scripts/serve-test.sh

# 3. End-to-end check (English and Chinese).
set -a; . ./.env.local; set +a
BASE_URL=http://<host>:8000 node scripts/e2e-smoke.mjs en
BASE_URL=http://<host>:8000 node scripts/e2e-smoke.mjs zh
```

The mock vetoes chapter 2 once to exercise the retry path. Never record a demo replay from the mock; replays must come from real runs (REQ-33d). To use a real model, replace the four `LLM_*` lines and restart.

`LIVE_GATE_MEMORY_STORE=1` keeps rate-limit counters in memory. It is only for a single-server test deployment; on Vercel use Upstash (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`).

## Checks

```text
pnpm typecheck
pnpm test
pnpm build
```

## Deploy and submit

Connect the GitHub repository to Vercel. A push to the configured GitHub branch triggers the Vercel deployment. The Devpost submission should use the resulting public online URL, not a local development address. This documentation does not perform a commit, push, branch creation, or deployment.
