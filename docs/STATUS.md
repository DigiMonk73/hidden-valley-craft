# Status

_The page to resume from. Keep it short; history lives in git._

## Now (2026-11-17)

- **The owner passed Phase 0** after a walkabout ("It looks great… we should finish it out"). Mining was not tried.
- **Phase 1 ("The valley looks right") is built.** It goes to review, then publish.
- **The published page:** https://claude.ai/artifact/596gciq89ZDYLMHEeE8XWa, private to the owner, with `capabilities: {downloads: true}` and `source-bundle.json` beside it. To update it, republish `out/page/hidden-valley.html` to that URL.
- **Where the code lives:** this machine only, in `/home/user/hidden-valley-blocks`, with local git history and no remote yet. The owner will make the repo "when I get home": attach it and push everything.

## What Phase 1 adds

**Water and air**
- Falling water: two blocks thick, with its texture pouring downward, and spray and mist where it lands.
- The pool and creek mirror the sky and catch a glint of the sun.
- Morning mist lies in the valley from about 4 to 9:30 and burns off.
- Fireflies come out at dusk over the valley floor.
- At night there are a moon, stars and readable moonlight.
- Faces looking at the sun take its warm light, so the cave cliff glows at sunset.

**Distance**
- A textured coarse landscape (8 m cells) is drawn beyond the loaded chunks, so the world never ends in haze.
- The world's edge is a range of forested mountains with rocky tops.
- Block clouds drift over the rim.
- One long atmospheric fog is shared by everything.
- View distance is at least 224 m from the menu, so the whole valley is always at full detail.

**Sound, all made in code**
- The waterfall's roar comes from where it falls.
- The creek, wind (stronger up high and outside), a cave hum, and outdoor sound that fades inside the cave.
- Birds with a dawn chorus, and doves; crickets and tree frogs at night.
- Footsteps by surface; digging, breaking, placing and splashes.
- Volume in Settings; M mutes.

**Mining:** crack stages on the block being mined, chips of block flying off, and clearer ore textures.

## What Phase 0 has

**The world**
- A bounded 2,048 × 2,048 world, generated from the layout:
  - the sinkhole valley with cliffs
  - the builder's cave, facing west: mouth, living room, hall, workshop, pantry with an iron vein, vault, and lanterns
  - the paved balcony and the S-curve path down
  - the pool, creek, waterfall and drowned tunnel
  - the canyon and its pool
  - the rough outside zones
- Workers generate the world, with a main-thread fallback.
- Light uses flood fill, sunlight plus lantern light, and stays correct across chunks and after edits.
- Meshing gives every face corner shading and smooth light.
- A sky with a 20-minute day; the sun sets behind the waterfall.

**Playing**
- Walking, sprinting, auto-stepping up single blocks, swimming with breath, flying (F).
- Mining by holding the mouse, placing, a 9-slot hotbar, and builder's mode (G).

**Saves and settings**
- Saves go to IndexedDB, then localStorage, then memory.
- Download a save file or copy a save code, and load either back.
- Settings: view distance, mouse sensitivity, invert Y.

**Checks**
- Unit tests and a headless play-through pass (`tests/e2e/play.mjs`).
- Screenshots: `tools/shot.mjs`.

## Phase 0's known gaps (now fixed by Phase 1, except where noted)

- The waterfall is a static column of water blocks; it should flow, foam and mist.
- The far valley wall is the edge of what is drawn (256 m). Distant terrain beyond that, and the ridge tower, need the low-detail far ring.
- No sound yet, no clouds or valley mist, no block-crack texture (a ring shows mining progress), no particles.
- Textures are first drafts; bromeliads and ore read weakly.
- Water doesn't flow; breaking a block next to water fills it with still water.

## Next

1. Review Phase 1, fix what the review finds, publish, and send the owner a few pictures.
2. Phase 2: living in the valley, plus the billionaire's inheritance (docs/PLAN.md).
3. Still open from before:
   - Water doesn't flow; breaking a block next to water fills it with still water.
   - Cross-device saves through the page's `db` capability.
