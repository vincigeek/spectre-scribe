/**
 * Reads the four fixed agent definitions (design §2.4, structure.md, task T-13).
 * Paths are constants; no user field ever builds a path. Nothing is written.
 */
import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AgentName } from "@/lib/pipeline-types";

export const AGENT_FILES: Readonly<Record<AgentName, string>> = Object.freeze({
  outline: ".kiro/agents/outline.md",
  style: ".kiro/agents/style.md",
  continuation: ".kiro/agents/continuation.md",
  continuity: ".kiro/agents/continuity.md",
});

export const HOOK_FILE = ".kiro/hooks/continuity-check.md";

/** A definition shorter than this, or without these sections, is a stub. */
const MIN_LENGTH = 400;
const REQUIRED_SECTIONS = ["## Run parameters", "## Inputs", "## Rules"];

export type AgentDefinitions = Readonly<Record<AgentName, string>>;
export type LoadResult = { ok: true; definitions: AgentDefinitions } | { ok: false; code: "config-missing"; agent: AgentName };

export function isUsableDefinition(text: string): boolean {
  return text.length >= MIN_LENGTH && REQUIRED_SECTIONS.every((s) => text.includes(s));
}

let cache: { root: string; defs: AgentDefinitions } | null = null;

export async function loadAgentDefinitions(root: string = process.cwd()): Promise<LoadResult> {
  if (cache && cache.root === root) return { ok: true, definitions: cache.defs };
  const defs: Partial<Record<AgentName, string>> = {};
  for (const agent of Object.keys(AGENT_FILES) as AgentName[]) {
    let text: string;
    try {
      text = await readFile(path.join(root, AGENT_FILES[agent]), "utf8");
    } catch {
      return { ok: false, code: "config-missing", agent };
    }
    if (!isUsableDefinition(text)) return { ok: false, code: "config-missing", agent };
    defs[agent] = text;
  }
  // The continuity hook is the base contract for the continuity stage (T-18).
  let hook: string;
  try {
    hook = await readFile(path.join(root, HOOK_FILE), "utf8");
  } catch {
    return { ok: false, code: "config-missing", agent: "continuity" };
  }
  defs.continuity = `${defs.continuity}\n\n## Base continuity contract (${HOOK_FILE})\n\n${hook.trim()}\n`;
  const frozen = Object.freeze(defs as Record<AgentName, string>);
  cache = { root, defs: frozen };
  return { ok: true, definitions: frozen };
}

export function clearAgentCache(): void {
  cache = null;
}
