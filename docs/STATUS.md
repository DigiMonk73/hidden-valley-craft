# Status

_The page to resume from. Keep it short; history lives in git._

## Now (2026-11-17)

- **The owner passed Phase 0** after a walkabout ("It looks great… we should finish it out"). Mining was not tried.
- **Phase 1 ("The valley looks right")** was published as version 2.
- **Phase 2 ("Living in the valley")** was published as version 3 (commit 8b3f41f), after a review and a re-check whose findings are fixed. It waits for the owner's look. Step 7, structure export, is deferred.
  - **The inheritance:** inventory, chests holding the builder's things (armory, expedition kit, pantry, seeds, tools, stores) and the safe.
  - **The home:** furnished, with the railing, stove and pipe, fireplace and chimney, bed, bookshelves, computer, phone, map table, workshop stations and the vault door.
  - **Living:** survival (health, hunger, thirst), crafting at five stations and by hand, farming and the builder's garden, coffee, fishing.
  - **The builder's things:** sleep; the journal, computer, phone, map table and safe.
  - **Builder's mode:** a block palette.
- **Phase 3 ("The way out")**: all nine handoff steps are built on branch `phase3`, reviewed by a fresh reviewer and fixed (docs/PHASE3.md, "Handoff"). Waiting for the lead to merge, publish and show the owner. Left open on purpose: the puma has no "from cover" stalking yet, and a hutch only breeds while its chunk is loaded.
- **The published page:** https://claude.ai/artifact/596gciq89ZDYLMHEeE8XWa, private to the owner, with `capabilities: {downloads: true}` and `source-bundle.json` beside it. To update it, republish `out/page/hidden-valley.html` to that URL.
- **Where the code lives:** https://github.com/DigiMonk73/hidden-valley-craft (private), branch `main`, pushed 2026-11-17. The working copy is `/home/user/hidden-valley-blocks`. Push after every finished step.

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

1. Phase 3 is in its phase session (branch `phase3`); the lead reviews, merges and publishes it.
2. **After Phase 3 merges: one hidden river, bursting out of the ridge both ways** (the owner, 2026-11-18). The valley's waterfall now pours from a notch at the rim with nothing feeding it. The fix is the karst answer: rain on the higher mountains soaks into the limestone, runs underground, and bursts out of both faces of the ridge between the canyon and the valley.
   - **Two waterfalls, mirrored:** one pours from a dark opening in the ridge's canyon face into the canyon pool, the other from its valley face into the valley pool. The rim above both stays dry rock.
   - **The canyon pool moves east** to the ridge's foot, so the outside falls land in it.
   - **The tunnel's mouth is under each curtain:** you dive through white water to find it, which hides it from anyone outside. The script says the hero "dove in" at a pool "beneath a waterfall".
   - **The current:** the canyon spring is the stronger, so a gentle current in the tunnel pulls toward the valley (the script's "lateral current").
   - **Where the water goes:** the valley pool drains by the creek sinking into the rock (it does already). The canyon pool drains down the canyon as a stream.
   - **Why not a river over the rim:** a river on the plateau would lead anyone straight to the hidden valley.
   - **When:** after Phase 3 merges, as Phase 3 is reworking that ground: the ramp starts beside the canyon pool.
   - Changing the Unity game's script is the owner's call; this note is for the block edition.
3. Still open from before:
   - Water doesn't flow; breaking a block next to water fills it with still water.
   - Cross-device saves through the page's `db` capability.
