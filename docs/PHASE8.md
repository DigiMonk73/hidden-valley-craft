# Phase 8 — Zone-4 and the uplink (M5)

_The lead's brief (2026-11-20). The phase session turns it into the full plan below it, as docs/PHASE7.md did, and marks each step DONE._

The aim: the tower you have seen on the far ridge since your first walk in the buffer is finally reached. It stands in the mountains of the north-west corner (`zone4`: x < 450, z < 450; `PLACES.ridgeTower` at 360, 380). The ground on the way is poisoned. On the ridge are the things the uplink needs. Bringing them home completes **M5, the uplink**: the builder's computer asks the thing that still runs the satellites, and it answers. That answer is the end of the story this version tells.

## What the owner taught us

Simple, short, well lit, easy to find. Nothing hidden that looks like everything around it. So:
- **One road.** It leaves a place the player already knows, is signed there, and every place of the phase stands on it in the order walked.
- **Radiation is read at a glance.** Poisoned ground is marked the way Zone-2's rings are, and looks different from clean ground. The dose is shown the whole time you are in it.
- **Nothing needed is in the dark.** The dark holds only danger.
- **A toast** says what can be done at each place, the first time.

## Design calls (the lead's; the owner has handed these over)

- **The way in is from Zone-3**: a signed road from the avenue's bend by the dam's west end, north along the reservoir's west shore, then up a pass to the ridge. *Why:* PLAN.md's "mountain pass"; it starts where Phase 7 ended, and the reservoir is a guide rail nobody can lose. Keep the walk from the dam to the tower near 450 m.
- **The danger is the ground, not a crowd.** Danger 7 is radiation that kills a careless player in minutes, managed by three things the player can see and choose: a **suit**, **medicine**, and the **route** (the road is the least poisoned line; shortcuts cost dose). A few Ashen at most, in one dark place, by Phase 7's rules. No new kind of enemy. *Why:* the script's fights are small and slow, and a second new enemy this late would be learnt and never used again.
- **The suit is earned before the pass**, from what Zones 2 and 3 already give, on Ray's word. Without it the pass is a wall the player can read, never a surprise death.
- **Three places on the ridge**, each lit by what still runs there:
  1. **The relay station** at the tower's foot: the antenna sections, the rare components.
  2. **The observatory**, a small dome: the telescope's optics.
  3. **A refuge hut** on the pass, clean ground, a stove: the place to rest, and where **Ray** is met, once, by day. He hands over what his drawings could not.
- **M5 at home**, each a thing the player builds and sees:
  - the satellite antenna (on the cliff above the cave, seen from the valley floor);
  - the uplink terminal on the builder's computer (needs hydro running);
  - the telescope on the balcony: you look through it (the tower, the dam, the moon), and it is part of the uplink;
  - the medical bench and distiller, and rare medicines (never an Ashen cure);
  - from the AGI's schematics: a thermal optic, sonic and chemical means against the Ashen, engineer's armour.
- **The AGI never speaks.** A query screen, not a chat: you pick a query, and it returns coordinates, times, tables and diagrams. Each answer changes something in the game: radiation drawn on the map table, where the Ashen are tonight, a schematic unlocked. No sentences, no name, no personality.
- **The ending.** The first answer is the closing beat: a short, quiet card that says what the player has done, names what is still out there (Mira; the people on the phone), and returns them to the valley to play on. Phase 9 polishes it.
- **Infection stays out** (as in Phase 7). **The compound stays closed.**
- **Zone-4's land may change** inside the corner and along the new road. Everything east of the gorge stays as pinned by the fixtures.

## Order of work

1. This plan in full, with the map (`docs/phase8-map.png`, drawn from the layout), in the phase's first commit. Build to it without waiting for the owner.
2. Land and places (`src/gen/layout.ts`, a new `src/gen/zone4.ts`), with world-hash fixtures for what must not move.
3. **Then stop and merge `main`** before touching `src/game.ts`: the review's fixes are splitting that file (docs/REVIEW.md, N10) and the home makeover is changing the cave. The lead says when both are in.
4. Radiation, the suit and medicine; the places' salvage; Ray's meeting.
5. M5 at home; the AGI's query screen; the ending card.
6. The play-through part (`tests/e2e/play-zone4.mjs`), the fresh review, the report to the lead.
