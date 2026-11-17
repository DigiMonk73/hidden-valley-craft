# Status

_The page to resume from. Keep it short; history lives in git._

## Now (2026-11-17)

- **The phase:** Phase 0, Foundations, is built and waiting for the owner to play its link and pass it.
- **The published page:** https://claude.ai/artifact/596gciq89ZDYLMHEeE8XWa, version 1, private to the owner, with `capabilities: {downloads: true}` and `source-bundle.json` beside it. To update it, republish `out/page/hidden-valley.html` to that URL.
- **Where the code lives:** this machine only, in `/home/user/hidden-valley-blocks`, with local git history and no remote yet. Every published build carries `source-bundle.json`.
- **The repo:** the owner will create an empty private repo later; attach it and push everything.

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

## Known gaps, planned for Phase 1

- The waterfall is a static column of water blocks; it should flow, foam and mist.
- The far valley wall is the edge of what is drawn (256 m). Distant terrain beyond that, and the ridge tower, need the low-detail far ring.
- No sound yet, no clouds or valley mist, no block-crack texture (a ring shows mining progress), no particles.
- Textures are first drafts; bromeliads and ore read weakly.
- Water doesn't flow; breaking a block next to water fills it with still water.

## Next

1. The owner plays the Phase 0 link.
2. Phase 1, "The valley looks right" (docs/PLAN.md).
