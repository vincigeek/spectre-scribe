# Tech steering

- Use Next.js 15 App Router with React 19 and TypeScript.
- Use Tailwind CSS 4 for layout and styling and shadcn/ui for accessible interface primitives.
- Keep frontend and backend in the same repository. Implement backend endpoints with Next.js API Routes through Route Handlers under `app/api/`.
- Implement style analysis as the pure TypeScript function module `lib/style-analyser.ts`. It must have no network or file I/O. Unit-test it with Vitest.
- Run the pipeline on the server. Load the four agent definitions from `/.kiro/agents/` without changing their contents, call them through an OpenAI-compatible interface, and stream progress and output to the browser with SSE.
- Read model configuration only from the server environment variables `LLM_API_KEY`, `LLM_BASE_URL`, and `LLM_MODEL`. Never expose these values to client code, write a real value in the repository, log the key, or put a key in prompts or downloaded files.
- Use React state for the active session and persist that state in `localStorage`. Do not add a database or server-side story store. Story bible downloads use JSON; chapter and full-story downloads use Markdown.
- Keep story data in request/session payloads and validate it at Route Handler boundaries. Do not make the server depend on a long-lived process or in-memory session for correctness.
- Use `pnpm dev` for local development. The intended deployment path is GitHub-connected automatic deployment to Vercel; the submitted artifact is the deployed online URL.
- Keep `/.kiro` at the repository root and ensure it is not gitignored. Do not modify `/.kiro/agents/` or `/.kiro/hooks/` for this document migration.
