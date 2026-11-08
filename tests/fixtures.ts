/**
 * Neutral, programmatic fixtures (testing.md): no story, character, or real passage.
 */

const LETTERS = "bcdfghjklmnpqrstvwxz";

/** A 4-letter English-like token, unique per index below 8000, never a stopword. */
export function word(i: number): string {
  const a = LETTERS[i % 20]!;
  const b = LETTERS[Math.floor(i / 20) % 20]!;
  const c = LETTERS[Math.floor(i / 400) % 20]!;
  return `q${a}${b}${c}`;
}

/** A sentence of `n` words drawn from a cycle of `vocab` distinct words. */
export function sentence(n: number, start = 0, vocab = 8000): string {
  const ws = Array.from({ length: n }, (_, k) => word((start + k) % vocab));
  return `${ws.join(" ")}.`;
}

/** Neutral Han characters, none in the Chinese stopword list. */
export const HAN = "甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午未申酉戌亥";

/** A Chinese sentence of `n` 字 ending in 。 */
export function zhSentence(n: number, offset = 0): string {
  return `${Array.from({ length: n }, (_, k) => HAN[(offset + k) % HAN.length]).join("")}。`;
}

/**
 * A draft that clears the length minimum (640 words) and the 30% dialogue
 * minimum: 60 repeats of a two-line spoken exchange under a title heading
 * (662 words, ~99% dialogue). Reuse wherever a pass must accept.
 */
export function longDialogueDraft(title = "A Title"): string {
  const line = `"We must go now," she said. "The countdown is already running."`;
  return `# ${title}\n\n${Array.from({ length: 60 }, () => line).join(" ")}`;
}
