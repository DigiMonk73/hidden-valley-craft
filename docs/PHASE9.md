# Phase 9 — the finish

_The lead's brief (2026-11-20). Not started: it waits for the owner's word on the weekly allowance, and is better begun after the owner has played version 13, so their critique goes into the same pass._

The game can be played from the first card to the ending. Phase 9 makes it feel finished and makes it sound: what the hand holds, what water and lamps look like, how it runs on a weaker computer, and the faults earlier phases found and left. Nothing here adds a place, an enemy or a milestone.

It is two tracks that touch different code, so two sessions can run side by side. Each ends as every phase does: a fresh reviewer, fixes with tests, a report to the lead.

## Track A — feel and look (render, sound, the home)

In the order of what a player notices first (docs/REVIEW.md, E2, has the reasons and the hours):

1. **A hand and the held tool on screen**, with a swing; the rifle when aiming. The largest gap in feel.
2. **Under water**: blue-green fog a few metres deep, dimmer light, bubbles. The signature swim has no water look.
3. **A glow round every lamp and fire**, and flicker on fires. Night in the valley is nearly black: the home should glow from the valley floor.
4. **Distant cliffs**: the far land gets the moss and strata of the near, and stays drawn until a column's own meshes are in (no flat beige slab, no holes of sky while loading). The owner's sunset is this view.
5. **Trees and plants**: three or four tree shapes, banana and tree fern, vines on the cliffs.
6. **Valley life the script promises**: hummingbirds, doves, the quetzal on one tree every few days.
7. **Water edges** and **afternoon rain**, if the six above are done and looked at.
8. **From the phases' own lists**: sitting in chairs; a gun rack in the vault; the jerky rack's stray texels; Zone-4's sump made to read as dangerous as it is; Ray's face at a distance; the thermal optic's glow photographed and judged; the dish seen from the far garden.

**The rule for this track:** every item is judged in pictures taken with `tools/shot.mjs` against the same camera before and after, and the report shows both. A passing check never means it looks right.

## Track B — soundness (engine, saves, land, tests)

1. **A path for weaker computers** (REVIEW.md, E1): a render-scale and anti-aliasing setting, an automatic drop below 30 fps, 4–5 chunks allowed, CPU arrays released after upload, column joins queued one a frame, the main-thread fallback kept light, the per-sound panner leak closed.
2. **Settings**: what E1 adds, mouse sensitivity, sound volume, view distance; all kept.
3. **Other browsers**: Safari and Firefox passes of the play-through where they can be run here (Playwright's WebKit and Firefox), and a list for the owner of what could only be checked on their Mac.
4. **Play with the mouse captured**: the play-through refuses capture (README), so losing capture (pause), re-capture on closing a screen and captured sensitivity are untested. Cover them in a headed or `LOCK=1` run that does not use the "quiet mouse" check, or say plainly that only the owner can.
5. **The faults found and left** (docs/STATUS.md has each with its place):
   - the valley can be walked into over its rim: mend only where the walk test finds a crossing, with pictures; un-skip `tests/review_land.test.ts`;
   - the outpost's stealth route does not hide you on two stretches: taller brush; un-skip its check;
   - saves: `save:earlier` overwritten and unchecked; a hand-over from an older page dropped when the store holds that valley; the "earlier build" line hiding other warnings;
   - Esc resuming, H while drowning, dropping things (docs/FIXES.md, "Left undone"); review items N5j and N9.
6. **What the script promises and is not there** (REVIEW.md, E3), cheapest first: sources for banana, avocado and papaya; the builder's books unlocking recipes; the headlamp, water filter, binoculars, hammer and handsaw doing something; the puma stalking from cover. Spoilage only if it is simple and the owner's play wants it.
7. **Tests** (REVIEW.md, E5): the streamer walk with a fake executor; seeded random light edits against a fresh recompute; a smoke test in a sandboxed frame; a mesh budget at fixed viewpoints.
8. **The rest of the `src/game.ts` split** (docs/FIXES.md, 8; docs/PHASE8.md: `tickZone4`, `usePhase8`, `useHoist`, the telescope).

## Left out, and why

- **The playable prologue** (the raider escape and dive; PLAN.md calls it optional). The three opening cards tell it. A played version is a new place, a chase and a one-off set of rules for five minutes of play.
- **Electron for Steam** (PLAN.md: optional). A separate job once version 1 is played and liked.
- **Real-time sun shadows, pathfinding for every creature** (REVIEW.md, "Not worth it").

## What ends it

Version 1: the owner has played the published build and said so. Until then every change in this phase ships as its own published build with its pictures, at most five and ten lines.
