# Product steering

Spectre Scribe is a Next.js 15 full-stack Web app where four server-side agents write a short story in relay. The browser provides the workspace; Next.js Route Handlers run the model calls and pipeline orchestration in the same repository.

The user supplies a sample passage through the Web UI. The passage must be the user's own writing or public-domain text. The app rejects empty input and samples shorter than 200 words. It computes eight quantitative style metrics, lets the user edit a story bible, and then drafts one chapter at a time through the fixed outline -> style -> continuation -> continuity relay. The continuity step checks character alive/dead state, timeline order, and foreshadowing payoff before a chapter is accepted.

The style profile and story bible are inputs to every relevant agent. The story bible is user-editable and agents receive it as read-only context. The pipeline streams progress to the browser with SSE. React state and `localStorage` hold the session; there is no database or server-side story persistence. The story bible is downloadable as JSON, and accepted chapters are downloadable as Markdown.

Scope for the demo: one science-fiction short story with exactly 3 chapters, no chapter longer than 800 words, and no more than 3 retries after the first attempt for any chapter. A no-retry run of the full flow must finish within 3 minutes. The demo plot, character names, and sample passage are TBD and must not be invented in this specification.

The Kiroween 2026 track is Frankenstein: quantitative style analysis is combined with a narrative AI relay pipeline. Do not crawl commercial novel sites or use copyrighted text as a sample. The four definitions in `/.kiro/agents/` and the continuity definition in `/.kiro/hooks/` are existing configuration and are not changed as part of this product description.
