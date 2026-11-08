import type { AcceptedChapter } from "@/lib/pipeline-types";
import type { StoryBible } from "@/lib/story-bible";

export function validBible(): StoryBible {
  const ch = (id: string, role: "protagonist" | "antagonist" | "supporting") => ({
    id, name: `Zq ${id.toUpperCase()}`, role, status: "alive" as const,
    description: "Role summary placeholder.", goal: "Goal placeholder.", motivation: "Motivation placeholder.",
    conflict: "Conflict placeholder.", epiphany: "Epiphany placeholder.",
  });
  const states = { "char-1": "alive", "char-2": "alive" } as const;
  return {
    genre: "Genre placeholder",
    tone: "Tone placeholder",
    logline: "A placeholder wants a thing against a force at a stake.",
    synopsis: "Setup sentence. Disaster sentence. Midpoint sentence. Second disaster sentence. Resolution sentence.",
    setting: { timePeriod: "Period placeholder", locations: ["Place placeholder"], worldRules: ["Rule placeholder."] },
    characters: [ch("char-1", "protagonist"), ch("char-2", "antagonist"), ch("char-3", "supporting")],
    foreshadowing: [
      { id: "fs-1", description: "Item placeholder.", status: "open" },
      { id: "fs-2", description: "Item placeholder.", status: "open" },
    ],
    timeline: [1, 2, 3].map((n) => ({ chapterNumber: n, event: "Event placeholder." })),
    beatSheet: [1, 2, 3].map((n) => ({ chapterNumber: n, title: `Title ${n}`, premise: "Premise placeholder.", characterStates: { ...states } })),
  };
}

export function acceptedChapter(n: 1 | 2 | 3, transitions: AcceptedChapter["relayReceipt"]["foreshadowingTransitions"] = []): AcceptedChapter {
  return {
    chapterNumber: n,
    title: `Title ${n}`,
    prose: `Prose placeholder ${n}.`,
    wordCount: 3,
    relayReceipt: { runId: `run-${n}`, chapterNumber: n, retryCount: 0, steps: [], foreshadowingTransitions: transitions, continuity: { status: "APPROVED", failures: [] } },
  };
}
