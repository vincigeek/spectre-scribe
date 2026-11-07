# Snowflake steering

This document defines how the outline agent expands a story idea into a draftable
plan. It adapts the Snowflake Method (Randy Ingermanson) to a 3-chapter short
story. Attribution: the method is Ingermanson's, from his published Snowflake
Method article; this project uses it as a planning method, not as copied text.

## Why this method fits

The Snowflake Method grows a story in layers: one sentence, then a paragraph,
then a page, then a scene list, then a draft. Each layer must agree with the
one before it. That is the same shape as this project's relay: a bad early
layer poisons everything downstream, so each layer is produced, checked, and
approved before the next one starts.

## Snowflake Lite: the compressed layer sequence

The full method is designed for novels. This demo is exactly 3 chapters, each within
the chapter limit (800 words, or 1,500 字 in Chinese), so the sequence is compressed. Do not restore the steps
that were cut without an owner decision.

### Step 0: Style profile (project-specific, before the Snowflake starts)

Compute the eight style metrics from the user-supplied sample passage first.
The named style profile is an input to every expansion layer below. The
Snowflake Method has no style step; this one is the Frankenstein addition, and
it must not be dropped: a logline, synopsis, or beat that contradicts the
measured style is a failed layer.

### Step 1: Logline

One sentence, at most 15 words (30 字 in Chinese), no character names. It states the core story:
who wants what, against what, at what stake. If it needs a name to make sense,
it is not finished yet.

### Step 2: Five-sentence paragraph

Expand the logline into exactly five sentences with fixed roles:

1. Setup and backdrop.
2. First major turning point (disaster 1).
3. Midpoint disaster or reversal.
4. Second major turning point (disaster 2).
5. Resolution (how the story ends).

Chapter mapping for this demo: sentence 1 seeds Chapter 1, sentences 2-4 seed
Chapter 2, sentence 5 seeds Chapter 3.

### Step 3: Character summaries

For each major character, one summary covering goal, motivation, conflict,
epiphany (what the character learns by the end), and a one-paragraph storyline.
These four fields are part of the story bible character entries (see
`design.md` section 2.3). A character without a goal and a conflict is not
ready for the synopsis step.

### Step 4: One-page synopsis

Expand each sentence of the Step 2 paragraph into its own paragraph. The
result is a one-page synopsis of five paragraphs. Every paragraph except the
last ends in a disaster (a turning point that complicates the protagonist's
situation); the last paragraph resolves the story.

The original method's Step 6 (expand the one-page synopsis to four pages) is
deliberately cut for this demo: a 3-chapter short story does not need it.

### Step 5: Character synopses (optional for the demo)

One page per major character, half a page per minor character, telling the
story from that character's point of view. Optional in the demo: the Step 3
fields already carry the information the relay needs. Include it only if a
chapter's continuity failures trace back to a character's point of view.

### Step 6: Scene list (the beatSheet)

Turn the one-page synopsis into a scene list with one row per scene. In this
project the scene list IS the story bible `beatSheet`: each beat has a chapter
number, title, premise, and the character states that hold during it. Every
beat must name the characters in it and any foreshadowing it plants or pays
off. A beat that no character and no foreshadowing touches is a candidate for
deletion.

### Step 7: First draft

The continuation agent writes the chapter draft from the beat list, within
the chapter limit. It does not invent new plot turns, characters, or
foreshadowing beyond the approved beats. Anything the draft needs that is not
in the beats goes back to Step 4 or Step 6 first; it is never smuggled into
the prose.

## How the app runs the layers (decided 2026-11-07)

The layers run in two places:

| Where | Snowflake steps | Calls | User approval |
| --- | --- | --- | --- |
| Plan mode, layer `core` | 1 logline, 2 paragraph, 3 characters | 1 | Yes, before `structure` |
| Plan mode, layer `structure` | 4 synopsis, 6 scene list | 1 | Yes, before drafting |
| Chapter mode, per chapter | beats from the scene list | 1 per chapter pass | No; continuity judges |
| Continuation | 7 draft | 1 per chapter pass | Via VETO review |

The one-page synopsis (Step 4) is stored as the three `beatSheet` premises, one
paragraph per chapter, not as a separate field. Step 5 stays optional and is
not generated. Rule 3 below applies per plan layer: two bounded calls, not one
call for the whole stack.

## Rules that apply to every layer

1. **No contradiction downward.** A later layer may add detail but must not
   contradict an earlier layer. The continuity agent enforces this: a synopsis
   that breaks the logline, or a beat that breaks the synopsis, is a VETO.
2. **Approve each layer before expanding it.** The user approves or edits the
   logline, then the paragraph, then the synopsis, then the scene list. A
   defect is fixed at the layer where it appears, never patched in a later
   layer.
3. **One layer, one bounded call.** Each expansion layer is a separate outline
   call under the outline output cap. Do not ask one call to produce the whole
   stack; the layers exist precisely so a failure is small and local.
4. **TBD stays TBD.** The logline contains no character names by definition.
   The demo plot, character names, locations, title, and sample passage remain
   user-provided/TBD. No layer invents them.
5. **Style travels with every layer.** Each expansion receives the named style
   profile alongside the previous layer. A layer that drifts from the measured
   style is reworked at that layer.

## Snowflake view (UI)

The workspace shows the layers as a collapsible stack: logline, paragraph,
synopsis, character summaries, scene list, draft. Each layer shows its status
(approved, edited, pending) and, when a later layer is vetoed, which earlier
layer it contradicted. The view is a read of the story bible and relay
checkpoints; it is not a second store.

## References

- Randy Ingermanson, "How to Write a Novel Using the Snowflake Method"
  (snowflakemethod.com) — the ten-step method this document adapts.
- `design.md` section 2.3 (story bible schema: logline, synopsis, character
  goal/motivation/conflict/epiphany, beatSheet) and section 2.4 (outline agent
  produces the layers in order).
