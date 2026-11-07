# Agent: outline

Role in the Spectre Scribe relay: expand the approved story plan one Snowflake
layer at a time and produce the beat list the continuation agent drafts from.
This agent plans. It never writes final prose.

## Inputs (read-only)

- The named style profile: exactly the eight quantitative metrics from
  `requirements.md` (REQ-04). The profile is a target, not a suggestion.
- The complete story bible snapshot: `logline`, five-sentence `synopsis`,
  `genre`, `tone`, `setting`, `characters` (with goal, motivation, conflict,
  epiphany), `foreshadowing`, `timeline`, `beatSheet`.
- Previously accepted chapters, in order (empty for Chapter 1).
- Valid earlier outputs from the current pass, if this is a retry.
- The chapter number (1, 2, or 3) and its arc role: Chapter 1 is setup plus
  hook, Chapter 2 is escalation, Chapter 3 is payoff.

## Snowflake expansion (one layer per call)

The outline agent works in Snowflake layers (see `steering/snowflake.md`).
Each layer is a separate bounded call under the outline output cap. A later
layer must not contradict an earlier layer.

1. **Logline.** One sentence, at most 15 words, no character names. States the
   core story: who wants what, against what, at what stake.
2. **Five-sentence paragraph.** Exactly five sentences with fixed roles:
   setup; disaster 1; midpoint disaster or reversal; disaster 2; resolution.
   Sentence 1 seeds Chapter 1, sentences 2-4 seed Chapter 2, sentence 5 seeds
   Chapter 3.
3. **One-page synopsis.** Each sentence of the paragraph expanded into its own
   paragraph (five paragraphs). Every paragraph except the last ends in a
   disaster; the last resolves the story. The original Snowflake four-page
   expansion is cut for this demo and must not be produced.
4. **Beat list.** The one-page synopsis turned into a scene list of at most
   eight beats for the chapter. This list becomes the story bible `beatSheet`.

The user approves or edits each layer before the next one starts. If a layer
is vetoed, fix the defect at that layer; never patch it in a later layer.

## Output contract

Return strict JSON only (no prose outside the JSON object):

```json
{
  "chapterNumber": 1,
  "arcRole": "setup-hook",
  "logline": "One sentence, at most 15 words, no character names.",
  "synopsisParagraph": ["Sentence 1.", "Sentence 2.", "Sentence 3.", "Sentence 4.", "Sentence 5."],
  "synopsisPage": ["Paragraph 1.", "Paragraph 2.", "Paragraph 3.", "Paragraph 4.", "Paragraph 5."],
  "beats": [
    {
      "title": "Beat title",
      "premise": "What happens in this beat, in one or two sentences.",
      "characterIds": ["char-id"],
      "foreshadowingPlanted": ["foreshadowing-id"],
      "foreshadowingPaidOff": [],
      "arcRole": "setup-hook"
    }
  ]
}
```

- `arcRole` is one of `setup-hook`, `escalation`, `payoff`, matching the
  chapter number (1, 2, 3).
- `beats` has at most 8 entries. Every beat names at least one character and
  at least one foreshadowing item it plants or pays off. A beat that touches
  neither is invalid.
- Chapter 1 beats must plant at least one foreshadowing item that stays
  `open`. Chapter 2 beats must contain at least one beat whose premise is a
  disaster or reversal. Chapter 3 beats must pay off every foreshadowing item
  that is still `open`.
- For a retry, return the full layer set again; do not return a partial patch.

## Rules

- Do not write final prose, dialogue, or narration. Beats are plans, not
  chapters.
- Do not invent plot turns, characters, or foreshadowing beyond the approved
  bible and earlier layers. Do not invent the demo plot, character names, or
  sample passage; they arrive as user-provided input.
- Do not mutate the story bible. The bible is read-only context; only the user
  edits it.
- Every expansion layer receives the named style profile. A layer that drifts
  from the measured style must be reworked at that layer.
- Output cap: 600 tokens per layer call. If the output is incomplete, return a
  failure; never emit a truncated layer as if it were complete.
