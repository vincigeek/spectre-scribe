# UX steering

This document defines the user journey, state transitions, accessibility behavior, and
failure presentation. It does not add product scope or fictional demo content.

## Workspace flow

The primary flow is sequential, but completed sections remain reviewable:

```text
Sample input
  -> Style profile
  -> Story bible editor
  -> Chapter workspace (chapter 1, then 2, then 3)
  -> Final story
```

A user may return to an earlier section to correct input before starting the next gated
operation. Starting a relay pass is disabled until the sample is analyzed and the story
bible validates. Starting chapter 2 is disabled until chapter 1 is accepted. Chapter 4 has
no control or route.

### Sample input

- Provide a labelled textarea for paste and a labelled `.txt` file input.
- Explain that the text must be the user's own writing or public-domain text. Do not offer
  retrieval, crawling, or commercial-text suggestions.
- Show a deterministic word count and the 200-word threshold before submitting analysis.
- Keep the sample transient by default. Do not put it in a prompt, event, download, log, or
  `localStorage` record unless an owner later changes the privacy decision.
- Show an inline error that names the problem and how to fix it. Preserve the user's input
  while the error is visible.

### Style profile

- Display all eight metrics as read-only values with the exact definitions from
  `requirements.md`.
- Present pacing markers as one metric with its em-dash, ellipsis, and sentence-final
  punctuation subcounts.
- Explain that the values describe the supplied sample quantitatively; they do not prove
  literary quality or guarantee that generated prose will match it.
- Keep the profile available while the user edits the story bible and reviews chapters.

### Story bible editor

- Expose every field in the required schema, including repeatable arrays, enums,
  relationships, deferred foreshadowing targets, and all three beat-sheet entries.
- Start with an empty/TBD editing state, not a fabricated title, plot, name, location, or
  passage. Empty fields may be edited but block drafting.
- Give add/remove controls clear accessible names. Preserve IDs and relationship errors
  when an array item is edited.
- Validate locally for immediate feedback, then validate the same snapshot on the server
  before a pipeline run.
- Offer the JSON bible download only for the current validated or explicitly saved editor
  state; the browser creates the file.

### Chapter workspace

For the active chapter, show the current state in text as well as visually:

- waiting for input;
- running, with the current agent and a short progress description;
- draft and structured checkpoints as they arrive;
- `APPROVED` with server word count;
- `VETO` with each failing continuity check, the violated bible field, and the minimal fix;
- a relay receipt for the pass: one entry per agent (what it did and changed),
  plus every foreshadowing status transition in that pass. Show it for approved
  and vetoed passes alike;
- interrupted, configuration, provider, validation, or terminal retry errors.

Show the retry number as `attempt 1 of 4`, `attempt 2 of 4`, and so on, where the first
attempt is not a retry. Disable duplicate start, retry, and next-chapter controls while a
run is active. A chapter is not added to accepted chapters until the client receives a
validated `chapter-accepted` event.

A VETO is reviewable output, not a hidden rewrite. Let the user choose `outline` or
`continuation` only when the corresponding checkpoint is valid. If it is not valid, explain
why the server will restart at outline. Transport recovery is presented separately from a
user-visible chapter retry.

### Final story

- Render exactly the accepted chapters in order, with their user/model-provided titles and
  server word counts.
- Show one relay receipt per accepted chapter (collapsible), so the final story carries
  its own audit trail: what each agent did and what foreshadowing changed in that chapter.
- Keep individual chapter Markdown downloads and the complete three-chapter Markdown
  download in the browser.
- Keep the JSON story-bible download available without adding runtime files to the server or
  repository.
- If the session is incomplete, show the missing chapter as a next action rather than
  inventing text.

## Session and restore behavior

The active state lives in React. A versioned serialisable session may contain the style
profile, editable bible, pending relay result, accepted chapters, continuity ledger, retry
counters, and pipeline status. It does not contain provider configuration, authorization
headers, raw diagnostic errors, or secrets.

On load:

1. Read the namespaced storage record only in a client component.
2. Parse JSON and check the session version.
3. Validate every nested object with the shared runtime validators.
4. Restore only valid data and show a non-blocking restoration notice.
5. Discard corrupted, unsupported, or invalid data with a visible explanation and a clean
   starting state.

A browser refresh must not create a second active model run. Abort or mark a stale run as
interrupted, preserve the latest complete checkpoint, and require an explicit resume or
retry action.

## Accessibility requirements

- Use semantic headings and landmarks for the five workflow sections. A user must be able
  to understand the current section without relying on color or animation.
- Every control has a visible label or an accessible name. Connect descriptions and errors
  with `aria-describedby`; do not use placeholder text as the only label.
- Validation messages identify the field, use plain text, and remain available to assistive
  technology. Move focus to the first invalid field or an error summary after a failed
  submit.
- Put progress and terminal run status in a small `role="status"` or equivalent live
  region. Do not announce every prose delta; announce agent transitions, vetoes, acceptance,
  interruption, and completion.
- Preserve a visible focus indicator and keyboard order. Do not trap focus in the workspace
  or make a modal the only way to dismiss a non-critical notice.
- Do not communicate status through color alone. Pair `APPROVED`, `VETO`, retry, and error
  colors with text and an icon or shape that has an accessible label.
- Respect reduced-motion preferences. Streaming text, progress, and results must remain
  available when animation is disabled.
- Use semantic buttons, labels, lists, tables, and headings before adding ARIA. Test with
  keyboard navigation and semantic browser queries.

## Empty, loading, and error states

Every panel has a defined state before data exists:

- no sample: explain the input and source requirement;
- sample too short: show the count and threshold;
- no profile: explain that analysis must finish first;
- empty bible: invite the user to fill the required fields without sample content;
- no accepted chapter: show the current chapter action;
- no provider configuration: show a safe configuration message without revealing which
  secret is missing beyond the stable error code selected by the server;
- interrupted stream: preserve complete checkpoints and offer one recovery action;
- terminal retry failure: explain the cap and offer editing or a new session, not an implicit
  fifth call.

Loading controls communicate what is happening and remain cancellable where the operation
supports cancellation. Error messages avoid raw provider bodies, URLs with credentials,
stack traces, prompts, and full request payloads.

## References checked 2026-11-07

- [WAI: text descriptions for required-field errors](https://www.w3.org/WAI/WCAG22/Techniques/general/G83)
- [WAI: text descriptions for input errors](https://www.w3.org/WAI/WCAG22/Techniques/general/G85)
- [WAI: `role=status` for status messages](https://www.w3.org/WAI/WCAG22/Techniques/aria/ARIA22)
- [WAI: live regions for errors](https://www.w3.org/WAI/WCAG22/Techniques/aria/ARIA19)
- [shadcn/ui Next.js installation](https://ui.shadcn.com/docs/installation/next)
