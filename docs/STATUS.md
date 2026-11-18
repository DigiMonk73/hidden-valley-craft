# Status

_The page to resume from. Keep it short; history lives in git._

## Now (2026-11-18)

- **Review fixes (Silas)** were published as version 7. The sanctuary now covers the whole home, F3 hides the panel, and a full pack keeps the block. Checks: 193 unit tests and all 51 play-through checks. The play-through now takes about 30 minutes here; give it an hour's timeout.

- **Phase 4 ("Zone-1 near band")** was merged into `main` (branch `phase4`) and published as version 6. It has the saddle, Marco's bus shelter and trading in Bitcoin, the dead scout and the pistol, the farmstead with its feral dogs and chickens, the coop, salvage, and M1. Details are in docs/PHASE4.md. Checks: 188 unit tests and all 50 play-through checks.
  - The play-through's safe step failed once on mouse capture; it passed on the rerun.
  - The swimmer pauses at the floor near each tunnel mouth until they swim up with Space. Make that rise smooth next.

- **Phase 4 ("Zone-1 near") is built on branch `phase4`**, waiting for the lead's review. Details and progress are in docs/PHASE4.md.
  - **Places:** the road runs on to x 940. Along it: the saddle (a crest between two knolls, a farm sign and a cattle grid), Marco's bus shelter with its lantern lit, the dead raider scout with his lamp still burning, the farmstead off a track south, and a rusted truck. The mid band's smoke column rises far off.
  - **Creatures:** the farmhouse den's 3 feral dogs, coyote packs at night, and chickens round the yard. Each pack member flanks from its own side, and every blow is wound up first.
  - **Marco:** his number is on the shelter's timetable; call him from the phone and he waits at the shelter by day. Trade both ways in Bitcoin from the hot wallet; he pays half. The first deal is trust 1.
  - **The scout's pistol, map scrap and armband**, the lore in your own notes, the coop with eggs, and **M1** on the computer and the map table.

- **The hidden river** (branch `river`, merged) was published as version 5. Changes:
  - One underground river bursts from both faces of the canyon–valley ridge as twin waterfalls.
  - The way in and out is simple: a lit tunnel mouth under each waterfall, a short tunnel lit throughout, and a gate that opens by itself as you swim up. There are no levers and no air pocket.
  - Checks: 150 unit tests, and all 33 play-through checks.
  - A diver at the very edge of a curtain meets rock beside the mouth and steers toward the lamps.

- **The owner passed Phase 0** after a walkabout ("It looks great… we should finish it out"). Mining was not tried.
- **Phase 1 ("The valley looks right")** was published as version 2.
- **Phase 2 ("Living in the valley")** was published as version 3 (commit 8b3f41f), after a review and a re-check whose findings are fixed. It waits for the owner's look. Step 7, structure export, is deferred.
  - **The inheritance:** inventory, chests holding the builder's things (armory, expedition kit, pantry, seeds, tools, stores) and the safe.
  - **The home:** furnished, with the railing, stove and pipe, fireplace and chimney, bed, bookshelves, computer, phone, map table, workshop stations and the vault door.
  - **Living:** survival (health, hunger, thirst), crafting at five stations and by hand, farming and the builder's garden, coffee, fishing.
  - **The builder's things:** sleep; the journal, computer, phone, map table and safe.
  - **Builder's mode:** a block palette.
- **Phase 3 ("The way out")** was merged into `main` and published as version 4, after the phase session's fresh review and the lead's own checks: 127 unit tests, and every step of the play-through. Details are in docs/PHASE3.md.
  - **The way out:** the gate ritual and the air pocket, the canyon ramp, and the old road.
  - **The buffer:** the toppled ranger sign, the warren, the morpho tree with its butterflies, and the radio tower faint on the skyline.
  - **Wildlife:** rabbits, deer, wild boar and the night puma. Hunting with blows, the bow and the rifle; meat, hides and leather.
  - **Snares, the hutch, and the lost pack** when you die outside.

  Left open on purpose: the puma has no "from cover" stalking yet, and a hutch only breeds while its chunk is loaded.
- **The published page:** https://claude.ai/artifact/596gciq89ZDYLMHEeE8XWa, private to the owner, with `capabilities: {downloads: true}` and `source-bundle.json` beside it. To update it, republish `out/page/hidden-valley.html` to that URL.
- **Where the code lives:** https://github.com/DigiMonk73/hidden-valley-craft (public), branch `main`, pushed 2026-11-17. The working copy is `/home/user/hidden-valley-blocks`. Push after every finished step.

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

1. The owner looks at Phase 3.
   - **Seen at publishing:** under water, the valley-side lever stone (north wall, just before the gate) is nearly black. Light dies within a few blocks in water. A player who doesn't know where it is will struggle to find it. Light it as part of the next step: the builder would have set a lamp by it. *Superseded on branch `river`:* the levers are gone (see below).
2. **Next: one hidden river, bursting out of the ridge both ways** (the owner, 2026-11-18). The valley's waterfall now pours from a notch at the rim with nothing feeding it. The fix is the karst answer: rain on the higher mountains soaks into the limestone, runs underground, and bursts out of both faces of the ridge between the canyon and the valley.
   - **Two waterfalls, mirrored:** one pours from a dark opening in the ridge's canyon face into the canyon pool, the other from its valley face into the valley pool. The rim above both stays dry rock.
   - **The canyon pool moves east** to the ridge's foot, so the outside falls land in it.
   - **The tunnel's mouth is under each curtain:** you dive through white water to find it, which hides it from anyone outside. The script says the hero "dove in" at a pool "beneath a waterfall".
   - **The current:** the canyon spring is the stronger, so a gentle current in the tunnel pulls toward the valley (the script's "lateral current").
   - **Where the water goes:** the valley pool drains by the creek sinking into the rock (it does already). The canyon pool drains down the canyon as a stream.
   - **Why not a river over the rim:** a river on the plateau would lead anyone straight to the hidden valley.
   - **When:** now that Phase 3 is merged, before Phase 4. Move the ramp's foot with the pool.
   - Changing the Unity game's script is the owner's call; this note is for the block edition.
   - **Built on branch `river`** (waiting for the lead's review; tests in `tests/river.test.ts`):
     - Both falls pour from a dark opening 4 high and 5 deep at y 105, about 8 below the ridge top; the old notch and spring pool on the rim are gone. The canyon curtain is 9 wide, the valley's 7.
     - The rock behind each curtain is whole down to the pool, so there is no gap to dive into: the dead end the owner found is gone.
     - The canyon's east wall is a sheer cliff band for about 60 m around the falls (`canyonHeadwall` in `src/gen/layout.ts`). A short sheer stretch looked like a spillway standing out of the slope. No caves may open in that band, the canyon pool or the stream.
     - `CANYON_POOL` moved to x 1573. `RAMP` gained a short flat lead-in from beside the pool to the old foot.
   - **Simplified way in and out** (the owner, after playing Phase 3: "make it simple and short and well lit"):
     - Each tunnel mouth is an opening in the cliff foot straight under its curtain, one block under the surface, in a basin of deep water. A sealed lamp sits over it at the waterline, and one more on either side.
     - The tunnel runs straight through the ridge, x 1582–1600, at y 66–68. Every block of it has a lamp in the roof or a wall, and the light on its centre line never drops below 7.
     - No levers and no air pocket. The gate, halfway along, opens by itself when a swimmer comes within 3 blocks of either face (`approaching` in `src/sim/gate.ts`). It closes behind them as before. The `gate_lever` block stays in the data so old saves load.
     - **Why no pocket:** the whole swim takes about 11 s of the 20 s breath going out and about 8 s coming home, so a second stop would only add a place to get lost.
     - No moss on the rock round the mouths or in the tunnel, so nothing there looks like something to click.
     - The current is 0.5 m/s toward the valley (`riverCurrent`, `Player.flow`).
     - Old saves: a player saved in the old tunnel, pocket or shafts (now rock) wakes afloat by the valley mouth (`rescueFromOldTunnel`). An open gate saved by version 4 leaves a few water cells sealed inside the rock below the new tunnel: unseen and harmless.
     - The gate stays open while a swimmer waits near it, and never lifts a row above the slab. Before this fix, waiting 3–4 blocks away made it reopen over and over and bore a water shaft up into the ridge.
     - The two falls' roars blend along the tunnel instead of flipping at the valley mouth.
     - Not done: the swim test starts on the tunnel's centre line only. A diver at the edge of a curtain has to steer toward the lamps.
   - The canyon stream runs about 90 m south along the floor and ends in a dry bed of gravel and mud.
   - Spray and a positioned roar at both falls; each falls is muffled when heard across the ridge. The journal's gate entry says: dive through the falls, see the lamp, swim to the gate: "it knows you".
3. Still open from before:
   - Water doesn't flow; breaking a block next to water fills it with still water.
   - Cross-device saves through the page's `db` capability.
