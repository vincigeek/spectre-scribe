# Structure steering

The application uses the Next.js 15 App Router and keeps the browser and server in the same repository.

```text
app/
  layout.tsx
  page.tsx
  api/
    style/analyse/route.ts
    pipeline/stream/route.ts
components/
  sample-input.tsx
  style-profile.tsx
  story-bible-editor.tsx
  chapter-workspace.tsx
  final-story.tsx
  ui/                  # shadcn/ui primitives
lib/
  style-analyser.ts    # pure TypeScript functions
  pipeline/            # server-only orchestration and model client
  story-bible.ts       # shared schema and validation
  downloads.ts         # browser-side JSON/Markdown downloads
tests/
  style-analyser.test.ts
.kiro/
  agents/              # outline, style, continuation, continuity; unchanged
  hooks/               # continuity-check.md; unchanged
  steering/
  specs/spectre-scribe/
```

- `app/` contains the App Router pages and Route Handlers. Route Handlers are the only boundary for server-side model access.
- Client components own the editor, streamed chapter workspace, React session state, and `localStorage` synchronization.
- `lib/style-analyser.ts` owns all eight style calculations and remains pure and independently testable with Vitest.
- Server-only pipeline modules load the agent definitions, call the OpenAI-compatible model endpoint, enforce the fixed four-agent order, and emit SSE events.
- The story bible schema is shared for validation between the client editor and server request boundary. Agents receive a snapshot and cannot mutate the browser's bible.
- The browser creates JSON and Markdown download files. Runtime story data is not written into `/.kiro` and is not stored in a database.
- The `.kiro` directory stays at the repository root and is not ignored by Git. This migration changes only the seven documents named by the task; agent and hook definitions remain untouched.
