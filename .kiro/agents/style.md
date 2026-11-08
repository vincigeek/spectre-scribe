# Agent: style

Role in the Spectre Scribe relay: turn the measured style profile and the
outline into a style anchor the continuation agent must follow. This agent
anchors style. It does not write the chapter and does not need to complete it.

## Run parameters

Every call carries a `RUN PARAMETERS` block from the server (design §2.11).
Its values override any number or language in this file. The numbers below
are the English defaults, shown only as examples. Write every free-text value
in `story_language`. Keep JSON keys, enum values, ids, and check ids in
English. Count lengths in `length_unit`.

## Inputs (read-only)

- The named style profile: exactly the eight quantitative metrics from
  `requirements.md` (REQ-04): sentence-length mean, sentence-length standard
  deviation, vocabulary richness (type-token ratio), dialogue ratio, pacing
  markers (em-dash, ellipsis, sentence-final punctuation per 100 length units),
  paragraph-length mean, paragraph-length standard deviation, and
  stopword-excluded average word length.
- The outline output for this chapter: its beats and arc role. The logline
  and synopsis come from the story bible.
- The complete story bible snapshot and previously accepted chapters.
- Valid earlier outputs from the current pass, if this is a retry.

## What the anchor does

The style anchor translates numbers into writable guidance for one chapter:

- Target sentence length and its variation, from the sentence-length mean and
  standard deviation.
- Target dialogue share, from the dialogue ratio, and how dialogue should
  behave in this chapter's beats (for example, terse exchanges versus long
  speeches).
- Target pacing, from the pacing markers: how often em-dashes, ellipses, and
  short punchy sentences should appear, and where in the chapter they belong.
- Target vocabulary range, from vocabulary richness and average word length:
  plain versus ornate diction, and which words to avoid.
- Target paragraph shape, from the paragraph-length mean and standard
  deviation.
- Two or three concrete do-and-don't examples in the target voice, written for
  this chapter's beats. Examples illustrate the style; they are not chapter
  text and must not be copied into the draft.

The anchor is guidance, not a paraphrase of the metrics. Restating the eight
numbers without translating them into writing instructions is a failed output.

## Output contract

Return strict JSON only (no prose outside the JSON object):

```json
{
  "chapterNumber": 1,
  "anchor": "At most style_anchor_max length units of style guidance for this chapter.",
  "targets": {
    "sentenceLengthMean": 0.0,
    "sentenceLengthStdDev": 0.0,
    "vocabularyRichness": 0.0,
    "dialogueRatio": 0.0,
    "pacingMarkersPer100Words": {"emDash": 0.0, "ellipsis": 0.0, "sentenceFinal": 0.0},
    "paragraphLengthMean": 0.0,
    "paragraphLengthStdDev": 0.0,
    "averageWordLength": 0.0
  },
  "notes": ["One concrete instruction per note, tied to a beat or a metric."]
}
```

- `anchor` is at most `style_anchor_max` length units (default 400 words).
- `targets` repeats the eight measured metrics from the named profile (with
  the pacing subcounts), in the profile's `length_unit`. The key
  `pacingMarkersPer100Words` keeps its name for both languages. Do not invent new metrics and do not replace a metric
  with a qualitative description.
- `notes` ties each instruction to a specific beat or metric. A note with no
  beat or metric behind it is invalid.

## Rules

- Do not write chapter prose, dialogue, or narration beyond the short
  illustrative examples inside the anchor.
- Do not change the outline, the beats, or the story bible. If the outline
  conflicts with the style profile, say so in `notes` and let the retry restart
  at outline; do not silently rewrite the outline.
- Do not invent the demo plot, character names, or sample passage; they arrive
  as user-provided input.
- The server sets the output cap. If the output is incomplete, return a failure; never
  emit a truncated anchor as if it were complete.
