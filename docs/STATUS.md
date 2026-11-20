# Status

_The page to resume from. Keep it short; history lives in git._

## Now (2026-11-20)

- **The home is rebuilt on branch `home`** (with `main` and Phase 7 merged in), waiting for the lead's review. What was built, what differs from the review's plan and why: [HOME.md](HOME.md).
  - **Built:** the hearth and its chimney; the cast-iron range, hood and flue; the bedroom with its window, double bed and wardrobes; the living room's sofa, armchairs and dining table; a study with a real computer desk against the bookshelves; the patio table, loungers and lanterns; lamps so every room is lit at night; the workshop and pantry dressed; the vault lined.
  - **The furniture pass** (the owner's later notes): every piece set out and judged by eye, 25 redrawn, pack icons drawn from each piece's boxes.
  - **Changed from the plan:** stone piers either side of the mouth (it is 14 wide now); the bedroom is 9 by 8 with a window 4 by 2 and plastered walls; the linen is in a wardrobe; the door stands open.
  - **Saves:** a valley from before starts fresh and says so (`WORLD_LAYOUT` in `src/save/save.ts`).
  - **Engine changes others will meet:** the ray looks out of the cell the eye is in; a railing's collision is 2.5 blocks; a block flagged `rests` comes up with what it stands on; a pot or kettle is a stove only on a stove (`stationAt`).
  - **Not built:** sitting in chairs.

- **The review's fixes are built on branch `fixes`** (2026-11-20), waiting for the lead's review and merge: saves
  (N1), creatures on the real land (N5), traps and a test that walks every route (N3), failures (N8), Survival
  and Builder's mode (N2), money and milestones (N4), the first ten minutes (N6) and a first part of the split of
  `src/game.ts` (N10). What was done, each call made and why, the tests, and what was left are in
  [FIXES.md](FIXES.md). The home makeover (`main` at 71d9e3d) is merged into it: the home's rule that a valley
  from before the rebuild is not opened is kept, and is now held by the save keeper for every copy of a save
  (FIXES.md, 10). The land outside the home is the same, column for column, before and after that merge.

- **The owner has handed over the finish** (2026-11-19; AGENTS.md, "Finishing the game"). The road to version 1, with no stops for approval:
  1. Phase 7: merged into `main` (2026-11-19) and **published as version 10** (2026-11-20).
  2. The home makeover: merged into `main` and **published as version 11** (2026-11-20). What was built, what changed from the plan and what was left undone: docs/HOME.md.
  3. The review's fixes, on `main` after Phase 7, one session after another because they share `src/game.ts`: saves (N1), stakes (N2, N4), traps and the world-walk test (N3), creatures (N5), the first ten minutes (N6), failures (N8), splitting `src/game.ts` (N10).
  4. Phase 8 (Zone-4, the tower, M5): the lead's brief is docs/PHASE8.md; its session is running on branch `phase8` (plan, map and land first; it stays out of `src/game.ts` until the home makeover and the fixes are merged, and the lead tells it when).
  5. Phase 9 (finish), with the review's "worth doing at the end" list.

- **The fixes are merged into `main`** (2026-11-20; docs/FIXES.md). A fresh review of the join with the home makeover found no blocker and one fault, fixed with a test (`tests/settle_loop.test.ts`): a save opened shut inside something, with its wake point built over as well, loaded for ever. Loading and waking now use the same wake-point rule. **Left for Phase 9:**
  - **The valley can be walked into over its rim** (from the canyon up the outer slope, across at about (1734, 115, 1125), down the south cliff by harmless falls). No hostile can use it and M1 no longer counts it. To mend only where the walk test finds a crossing, with pictures for the owner; the check is written and skipped in `tests/review_land.test.ts`.
  - **The outpost's stealth route does not hide you from the lookout** on two stretches (he sees over the brush at (906, 1028) and along x 889–883, z 1046): taller brush. Check written and skipped.
  - **Saves, from the join's review:** `save:earlier` is overwritten by a second old save and its write is not checked (`src/save/keeper.ts`); a hand-over from the version 11 page is dropped when the store already holds that valley (ids made from a version-1 save never match: play since the last autosave is lost, once); the "earlier build" line sits above "can't keep saves" and "last save failed" all session.
  - **From the fixes session:** the rest of the `src/game.ts` split; review items N5j and N9; Esc resuming, H while drowning, dropping things.
- **Version 11's checks** (2026-11-20, `main`): 427 unit tests; all 161 play-through checks (valley 41, near 23, mid 20, Zone-2 34, Zone-3 43).
  - **Old saves:** a valley saved before the home was rebuilt is not opened; a fresh one starts and says so (`WORLD_LAYOUT` in `src/save/save.ts`). The owner has been told.
  - **For Phase 9, from the home session:** sitting in chairs; a gun rack in the vault; about 30 lanterns in the home sell for 1 each (the money pass); stray texels on the jerky rack; nothing was judged on a real graphics card (motion, flicker, sound).
  - The way out's breath check is "more than 6 of 20" (it reads 8.0–8.3 on every run; the bar stood on the measured value).
- **Version 10's checks** (2026-11-20, `main`): 396 unit tests; all 157 checks of the five play-through parts (valley 37, near 23, mid 20, Zone-2 34, Zone-3 43), about 27 minutes here.
  - Publishing it found two faults in how the game is tested and one in the game, all fixed (docs/PHASE7.md, "After the merge"): item icons and the map are drawn on CPU canvases (`src/platform/canvas.ts`); the play-through no longer captures the mouse; and it waits on the game's clock, not the wall's (`gameWait`), because a busy machine draws 2–4 frames a second.
  - **For Phase 9:** the play-through now never plays with the mouse captured, so losing capture (pause), re-capture on closing a screen and captured sensitivity are covered only by `tests/look.test.ts`. Check them by hand in a real browser window, or with a headed browser, before version 1.
- **Phase 7 ("Zone-3 and hydro", M4) was built on branch `phase7`** and has had its fresh review (twelve findings, each fixed with a test: docs/PHASE7.md, "The fresh review"). The owner approved the map. Three findings from the review of Phases 0–6 are in it too: a fed player can now be killed (a blow that takes the last health kills), the Ashen keep their designed doors rather than path-finding (the reason is in docs/PHASE7.md), and they are tested on the generated land. 394 unit tests and all 152 play-through checks pass. It waits for the lead's merge and the owner's play. Details and progress are in docs/PHASE7.md; the map is docs/phase7-map.png.
  - **Places:** the ravine is the gorge of a river. A lit side road leaves the highway 10 m inside Zone-2 ("PRESA RÍO SECO") for a dam across it; the faction's barricade stops short of it. Over the dam, one lit avenue runs south past the control house, the powerhouse, the machine shop and the foundry, the rail yard and its mine, to the old road's far side at the broken bridge, where Phase 5's body lies.
  - **The Ashen:** nine, in five nests in the dark halves of the buildings, the engine shed and the mine's unlit drift. Dull in daylight and lamplight (slow, half blind), keen in the dark (fast). From the dark they see someone in light only from 6 m. They hear running and shots through walls, a walk or a pick only with nothing between. One attack, a telegraphed lunge you step out of. Never more than three hunt; never on the dam, east of the gorge or in the sanctuary. Hold H does nothing with one hunting close by.
  - **M4:** steel (the crucible furnace), the lathe, a hydro generator in the creek (2 kW day and night), a farm of rigs (beyond the first only on hydro), the suppressed pistol, the rebuilt rifle, plate armour, Ray by phone with his plans and then the uplink plans.
  - **Small fixes:** hutches, coops, smokers and jerky racks work while their land is not loaded; the strip mall's lot no longer stands above the highway.
  - **The land east of the gorge** is unchanged but for the dam road's five columns (`tools/worldhash.ts`, `tests/fixtures/east-of-ravine.json`), the reservoir's east shore and the dam's east end (`tests/fixtures/east-rim.json`).
- **The owner's notes on the home** (2026-11-19), to do as its own job after Phase 7 merges, using the review's redesign proposal:
  - a grander fireplace;
  - a stove that looks like a larger cooking stove;
  - a bedroom section;
  - better furniture;
  - true patio furniture, placed properly on the balcony.
- **The independent review is in: `docs/REVIEW.md`** (2026-11-19). Verdict: mostly sound, and it can be greatly improved. Grades: bugs C+, code B− (engine B+), graphics B− (outdoors B+), gameplay against the script C+ (places and story A−, systems C).
  - **Being fixed in Phase 7:** a fed player cannot be killed by a hit (review N5).
  - **After Phase 7 merges, before Phase 8:** a fixes session for the review's "worth doing now" list (N1 saves, N3 traps, N5 creatures, N8 failures, N10 splitting `src/game.ts`), and a session for the home makeover (N7, sketch `docs/review/home-proposed.png`).
  - **Approved by the owner** (2026-11-19): the home redesign, Survival against Builder's mode (N2), money and milestones (N4), the first ten minutes (N6).
- **Mined walls go back matching** (the owner, 2026-11-19): limestone and mossy limestone now drop themselves, and break down to rubble by hand. On `main`; it ships with the next publish.
- **Saves before version 1 don't matter** (the owner, 2026-11-19: "they are all just test runs"). Changes needn't carry old saves across: an older save must never crash the game or strand the player, and that is all. Saving and loading within a build must still work and stay tested.
- **The repo rename** to hidden-valley-blocks: the owner does it after Phase 7 or when home; then point the remote and the docs at the new name.

- **Phase 6 ("Zone-2 and power, M3")** was merged into `main` (branch `phase6`) and published as version 9.
  - It was built to the map shown to the owner (docs/phase6-map.png); no changes came back before it was done.
  - Checks: 302 unit tests, and all 110 checks in the four play-through parts (`tests/e2e/play.mjs` runs them in turn; `PARTS=` picks some), about an hour here.
  - Next: the owner can rename the repo to hidden-valley-blocks now that no session is pushing; then point the remote and the docs at the new name.
- **Phase 6 ("Zone-2 and power", M3) is built on branch `phase6`**, waiting for the lead's review and the owner's look at the map. Details and progress are in docs/PHASE6.md; the map is docs/phase6-map.png.
  - **Places:** the old highway north from the hunting camp, lit; the border; the ruins (a strip mall with a pharmacy, a hardware store and a supermarket, and a telephone exchange with a red-lit mast); two marked radiation rings; the hot-spring cave (saltpeter, sulfur, a steam plume); Las Cruces, the faction's walled compound, which can't be taken yet. Zone-2 now begins at z 760 west of the saddle.
  - **People:** patrols, a sentry and two tower guards (1–3 a group, back each dawn); the scout's armband passes you at a distance. Doc, by phone, treats wounds and radiation.
  - **M3:** solar arrays, battery banks, the mining rig (its hashrate and earnings on the computer), the fridge and the pump, gunpowder and rounds, Marco's trust 2 and guns.
  - **The outpost** is lit at night now. **The play-through** is in four parts run by `tests/e2e/play.mjs`.

- **Phase 5 ("Zone-1 mid and deep")** was merged into `main` (branch `phase5`) and published as version 8. It has the raider outpost (telegraphed shots, cover, stealth takedowns), focus mode (Q), the old mine, the hunting camp and the jaguar, the broken bridge with the body and the tracks, M2, hold H to go home, and chickens raised in coops. Details are in docs/PHASE5.md.
  - Checks: 251 unit tests and 70 of 71 play-through checks. The one miss, F3, was the test's timing: it now waits for a drawn frame, and F3 was checked directly in the browser.
  - The play-through takes about 45 minutes here.
  - Weak spots: the outpost is dim at night from 40 m, and the body across the ravine is small (the binoculars are in the kit).

- **Phase 5 ("Zone-1 mid and deep", DESIGN.md's MVP in blocks) is built on branch `phase5`**, waiting for the lead's review. Details and progress are in docs/PHASE5.md.
  - **Step 0:** a swimmer holding forward now comes up out of each tunnel mouth by itself: the water climbs a block at a time to a ledge under the surface. Creatures are never put on roofs or built things (`groundAt`).
  - **Places:** the road runs on to the broken bridge at x 659, past:
    - the raiders' outpost at x 860, under the smoke;
    - the brush and its game trail round to the back;
    - the old mine;
    - the hunting camp's marked trail;
    - the sheer ravine, 42 m across. On the far bank lies the body; on the near bank are the two-legged tracks.
  - **The fight:** three raiders, a first human fight, small and telegraphed. A glint and a click before every shot; cover works. A blade from behind is a silent takedown. Once cleared, the outpost stays clear.
  - **Focus mode** (Q), and the **jaguar** that crosses the camp's clearing once.
  - **M2** on the computer: the forge from the raiders' parts, the hunting bow, the smoker and jerky rack, the leghold, raised beds, quinoa and the apple slip, the coop and the hutch, the cleared outpost.
  - **The lead's requests:** hold H to head home; chickens caught by walking up; a health bar after a hit; coops hatch hens that walk round them.
  - **Checks:** 251 unit tests and all 71 play-through checks. The play-through now takes about 45 minutes here: in software rendering the game runs several times slower than the clock, so its Phase 5 waits are for conditions, with long limits.
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
