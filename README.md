# Spectre Scribe

Spectre Scribe is a Next.js 15 full-stack Web app in which four server-side agents write a short story in relay. It is built for Kiroween 2026.

- Main track: Frankenstein (combining things that do not normally go together)
- Also aiming at: Best Kiro Crew App, Best Demo
- Form: a browser-based Web app, not a million-word generator
- Demo scope: one short science-fiction story with exactly 3 chapters
- Pipeline: style statistics from a sample -> editable story bible -> four-agent relay -> continuity checks
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

The frontend and backend live in this repository. The server reads the four unchanged agent definitions from `/.kiro/agents/` and calls them through an OpenAI-compatible interface. The base continuity contract remains in `/.kiro/hooks/continuity-check.md`; server-side validation adds the demo's structured result and retry rules.

## How Kiro was used

- `/.kiro/steering/` : product, technology, and repository structure guidance
- `/.kiro/specs/spectre-scribe/` : requirements, design, and implementation tasks
- `/.kiro/agents/` : the four Crew agents (outline, style, continuation, continuity); their contents are not changed
- `/.kiro/hooks/` : continuity checks for character status, timeline order, and foreshadowing payoff; their contents are not changed

The `.kiro` directory is at the repository root and must not be added to `.gitignore`.

## Run locally

```text
pnpm install
pnpm dev
```

Configure `LLM_API_KEY`, `LLM_BASE_URL`, and `LLM_MODEL` in the deployment environment or in a local environment file that is excluded from version control. The values are read only by server-side Route Handlers. No real key or password belongs in this repository, the browser bundle, or the documentation.

The sample must contain at least 200 words and must be the user's own writing or public-domain text. Style analysis is performed by the pure TypeScript function behind the style-analysis Route Handler, without external text retrieval or an LLM call. The pipeline sends the style profile, story bible, prior accepted chapters, and current relay outputs to the configured model service. A chapter is at most 800 words; after the first attempt, each chapter may have at most 3 retries. The demo accepts exactly 3 chapters.

The story bible can be downloaded as JSON. Accepted chapters and the complete story can be downloaded as Markdown files. Session state is restored from `localStorage`; the server does not persist story data.

## Deploy and submit

Connect the GitHub repository to Vercel. A push to the configured GitHub branch triggers the Vercel deployment. The Devpost submission should use the resulting public online URL, not a local development address. This documentation does not perform a commit, push, branch creation, or deployment.
