# Spectre Scribe

Web-based multi-agent novel writing studio, built for Kiroween 2026.

- Main track: Frankenstein (combining things that do not normally go together)
- Also aiming at: Best Kiro Crew App, Best Demo
- Form: a web app, not a desktop app, not a million-word generator
- Demo scope: one short science-fiction story, 3 chapters only
- Pipeline: style statistics from a sample -> story bible spec in `/.kiro/specs/` -> Kiro Crew agents -> continuity hooks
- Inspiration only: the earlier OCNovel project. No code is copied from it; this repository is written fresh in the submission period.
- Copyrighted material is not crawled and not used as sample text.

## How Kiro was used

- `/.kiro/steering/` : product, tech and structure guidance for the agents
- `/.kiro/specs/spectre-scribe/` : requirements, design and tasks for the story bible and the 4-agent pipeline
- `/.kiro/agents/` : the four Crew agents (outline, style, continuation, continuity)
- `/.kiro/hooks/` : continuity checks (character alive/dead, timeline, foreshadowing payoff)

## Run

Web skeleton in `app/` is a placeholder for the next step. The `/.kiro` directory is the deliverable for this stage.
