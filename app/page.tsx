import { Workspace } from "@/components/workspace";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Spectre Scribe</h1>
        <p className="text-sm text-neutral-400">
          Style statistics from your sample, a story bible, and four agents writing three chapters in relay with a continuity check.
        </p>
      </header>
      <Workspace />
    </main>
  );
}
