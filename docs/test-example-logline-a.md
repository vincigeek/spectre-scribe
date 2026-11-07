# Test Example — Logline A: Pirate Anime Broadcast (TEST ONLY)

> **This is test/example content, not part of the specification.** The demo plot,
> character names, and sample passage in the specification remain user-provided
> and are not hardcoded there. This document exists so the demo flow can be
> smoke-tested (tasks T-10, T-23, T-27) with concrete content.
>
> Status: logline confirmed by the owner on 2026-11-07. Character names and all
> other details below are DRAFT and pending owner confirmation.

## Logline (Snowflake Step 1, confirmed)

> Three strangers decode a pirate anime broadcast to stop a satellite countdown.

三个陌生人破解一档盗播动画，阻止一场卫星倒计时。

- At most 15 words: yes (12 words).
- No character names: yes.

## Five-sentence synopsis (Snowflake Step 2)

PENDING — deferred by the owner on 2026-11-07 (to be drafted after the agent
definitions). Do not treat the chapter arc below as the synopsis; it is a
structural sketch only.

## Characters (Snowflake Step 3, DRAFT — names pending confirmation)

| Name | Role | Goal | Motivation | Conflict | Epiphany |
| --- | --- | --- | --- | --- | --- |
| 林晓 Lin Xiao (China) | Protagonist — cryptographer, ham radio operator | Prove his shortwave theory is not obsolete | He believes an old, dismissed signal holds a real message | Academia dismisses his unorthodox methods | Codes are not for winning; they are for hearing others |
| 星野葵 Aoi Hoshino (Japan) | Protagonist — anime illustrator / doujin author | Find her missing brother, the original author of the pirated anime | Her brother vanished leaving only the broadcast behind | She cannot tell whether his clues are a trail or a trap | What her brother left was not a puzzle, but a farewell |
| 利奥·卡特 Leo Carter (USA) | Protagonist — satellite communications engineer | Redeem the military satellite project he worked on | He helped build the satellite now counting down | His first instinct is to hand the signal to the authorities | Some signals can only be caught by ordinary people |

All three start with status `alive`. International cast: China, Japan, USA.
Pop-culture elements: shortwave / ham radio, anime (pirated broadcast, key
frames, ending theme), numbers stations, satellite communications.

## Chapter arc (P0 structural roles)

- **Chapter 1 — setup + hook.** The three each intercept the same mysterious
  shortwave signal. Aoi notices the signal's rhythm matches the storyboard of
  one episode of an old anime exactly. Plants at least one open foreshadowing
  item; ends on a hook.
- **Chapter 2 — escalation.** The first layer decodes: the signal is a
  countdown from a runaway satellite. Trust breaks down; Leo almost hands the
  coordinates to the authorities. Midpoint disaster / reversal; ends on raised
  stakes.
- **Chapter 3 — payoff.** The final layer of the code hides in the anime's
  ending theme; Aoi recognises her brother's hand in it. The three use the dead
  radio station's frequency to broadcast in reverse, turning the countdown into
  a disarm code. Every open foreshadowing item is paid off; the logline is
  resolved; the protagonist's epiphany is shown.

## Foreshadowing ledger (example)

| ID | Description | Planted | Paid off |
| --- | --- | --- | --- |
| F1 | The signal's rhythm matches an old anime episode's storyboard | Ch 1 | Ch 3 |
| F2 | Aoi's missing brother authored the pirated anime | Ch 1 | Ch 3 |
| F3 | Leo's past military satellite project | Ch 2 | Ch 3 |
| F4 | The satellite countdown | Ch 2 | Ch 3 |

## Beat sheet sketch (example, at most 8 beats per chapter)

- **Chapter 1 (setup-hook):** (1) Lin Xiao intercepts the signal on his
  shortwave rig; (2) Aoi spots the storyboard match; (3) Leo traces the
  signal to a satellite uplink; (4) the three make first contact and agree to
  work together — hook: the signal repeats on a schedule.
- **Chapter 2 (escalation):** (1) first layer decodes into a countdown;
  (2) the countdown's target is identified; (3) Leo moves to report it and
  trust breaks; (4) a second layer reveals the anime connection is deliberate.
- **Chapter 3 (payoff):** (1) the ending theme hides the final key;
  (2) Aoi recognises her brother's hand; (3) the three broadcast the disarm
  code on the dead station's frequency; (4) the countdown stops and the
  epiphany lands.

## Sample passage

TBD — the demo needs a user-owned or public-domain sample passage of at least
200 words. This document is NOT the sample passage. Do not use copyrighted
novel text as the sample.

## Story bible sketch (example JSON, schema per requirements REQ-06)

```json
{
  "genre": "science fiction",
  "tone": "hopeful, tense",
  "logline": "Three strangers decode a pirate anime broadcast to stop a satellite countdown.",
  "synopsis": "PENDING — Snowflake Step 2 not yet drafted.",
  "setting": {
    "timePeriod": "near future",
    "locations": ["a shortwave radio shack", "an anime studio archive", "a satellite ground station"],
    "worldRules": ["Shortwave signals can carry hidden data in their timing.", "The satellite obeys only a broadcast on its original frequency."]
  },
  "characters": [
    {"id": "lin-xiao", "name": "林晓", "role": "protagonist", "status": "alive", "description": "Cryptography graduate student and ham radio operator.", "goal": "Prove his shortwave theory.", "motivation": "He believes an old signal holds a real message.", "conflict": "Academia dismisses his methods.", "epiphany": "Codes are for hearing others."},
    {"id": "aoi-hoshino", "name": "星野葵", "role": "protagonist", "status": "alive", "description": "Anime illustrator and doujin author.", "goal": "Find her missing brother.", "motivation": "Her brother left only the broadcast behind.", "conflict": "She cannot tell trail from trap.", "epiphany": "Her brother left a farewell, not a puzzle."},
    {"id": "leo-carter", "name": "Leo Carter", "role": "protagonist", "status": "alive", "description": "Satellite communications engineer.", "goal": "Redeem his military satellite project.", "motivation": "He helped build the satellite now counting down.", "conflict": "His instinct is to hand the signal to the authorities.", "epiphany": "Some signals can only be caught by ordinary people."}
  ],
  "foreshadowing": [
    {"id": "F1", "description": "Signal rhythm matches an old anime storyboard.", "status": "open"},
    {"id": "F2", "description": "Aoi's missing brother authored the pirated anime.", "status": "open"},
    {"id": "F3", "description": "Leo's past military satellite project.", "status": "open"},
    {"id": "F4", "description": "The satellite countdown.", "status": "open"}
  ],
  "timeline": [
    {"chapterNumber": 1, "event": "The three intercept the same shortwave signal."},
    {"chapterNumber": 2, "event": "The countdown is decoded; trust breaks."},
    {"chapterNumber": 3, "event": "The disarm code is broadcast; the countdown stops."}
  ],
  "beatSheet": [
    {"chapterNumber": 1, "title": "The Signal", "premise": "Three strangers intercept the same broadcast.", "characterStates": {"lin-xiao": "alive", "aoi-hoshino": "alive", "leo-carter": "alive"}},
    {"chapterNumber": 2, "title": "The Countdown", "premise": "The signal is a satellite countdown; trust breaks.", "characterStates": {"lin-xiao": "alive", "aoi-hoshino": "alive", "leo-carter": "alive"}},
    {"chapterNumber": 3, "title": "The Last Broadcast", "premise": "The ending theme hides the disarm code.", "characterStates": {"lin-xiao": "alive", "aoi-hoshino": "alive", "leo-carter": "alive"}}
  ]
}
```
