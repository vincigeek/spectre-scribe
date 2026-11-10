/**
 * Canonical chapter-prose handling shared by the server and browser.
 *
 * A retry can deliver a prose string that has already had JSON string escaping
 * applied, leaving literal `\\"` in the value after the transport JSON has been
 * parsed. Story prose is plain text, so remove that one artifact at the server
 * and browser trust boundaries before it reaches prompts, React state, or a
 * download.
 */
export function canonicaliseChapterProse(prose: string): string {
  return prose.replaceAll('\\"', '"');
}
