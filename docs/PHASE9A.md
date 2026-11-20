# Phase 9A — the finish: feel and look

_Track A of [PHASE9.md](PHASE9.md), built on branch `phase9a` (2026-11-20). The plan, each call with its reason, and what is done. The owner's critiques, as the lead forwards them, outrank this list._

## Resume here

_Kept current, in case the session that built this is cut off. Last written 2026-11-20 15:25 UTC._

- **Branch `phase9a` is pushed and whole** (draft pull request #11; GitHub's checks pass on 98b2652). Nothing is half-done in the working tree.
- **Built, pictured and pushed:** items 1 to 6, rain (7), and from item 8 sitting, the jerky rack's legs and the sump. Not built: water edges, the gun rack, Ray's face; the thermal optic and the dish were not photographed.
- **The fresh review is in** (15:25 UTC, at 98b2652): no blocker; its findings are listed in "The fresh review" at the end of this page, each marked FIXED, ANSWERED or OPEN. Work down the OPEN ones.
- **Still to do, in order:** (1) fix or answer the review's findings, each fix with a test, pushing after each; (2) `git merge origin/main` (it had not moved from 7e0d74d at 14:45); (3) `npm test` once (last full run: 890 passed, 2 skipped, before the bunch, the settings test and the CI fix; the files touched since pass on their own); (4) the play-through's six parts, once (**started 15:24 UTC on the build of 74d098b, before the review's fixes**; its result goes in "Checks" below); (5) the message to the lead (what the brief's "Ending" asks: what was built, test counts, draw calls and triangles before and after, eight camera lines, weak spots).
- **Numbers for the report:** the balcony sunset at 256 m, version 13 against this branch: 314 → 317 draw calls, 1,569k → 1,583k triangles (`tools/shots9a.mjs` prints them). A column near the valley builds in about 16 ms, as version 13's does.
- **Pictures** are in `out/9a/` on the machine that made them (not in git): `before-*` is version 13; the newest of each view is the highest of `a2`…`a7`. To take them again: `node tools/shots9a.mjs <tag> valley water road far life rain sump sit hand` against a served build.

## The rule

Every item is judged by eye. Before anything was changed, one set of pictures was taken of every view this track touches (`node tools/shots9a.mjs before valley water road far`, the build of version 13); the same cameras are taken again after each step (`out/9a/<tag>-<name>.png`) and both are looked at. A passing check never means it looks right.

- `tools/shots9a.mjs` loads the page once per set and moves the camera, so twelve views cost little more than one (a page load is six minutes here). Its sets: `valley` (the owner's sunset, the home by night, the pool, the cliffs), `water`, `road`, `far` (the far land as itself, at a short view distance), `hand`.
- `tools/handroom.mjs` photographs the hand and what it holds without loading the world (seconds, not minutes): for shapes and poses.
- A copy of version 13's build is kept in `out/dist-v13` while this track runs, so a "before" can be taken of any new camera.

## The plan, in order

| # | What | State |
|---|---|---|
| 1 | A hand and the held tool on screen, with a swing; the rifle when aiming | DONE |
| 2 | Under water: blue-green fog a few metres deep, dimmer light, bubbles | DONE |
| 3 | A glow round every lamp and fire, flicker on fires; the home glowing from the valley floor at night | DONE |
| 4 | Distant cliffs: the far land with the near land’s moss and strata, kept drawn until a column’s own meshes are in | DONE |
| 5 | Three or four tree shapes, banana and tree fern, vines on the cliffs | DONE |
| 6 | Hummingbirds, doves, the quetzal | DONE |
| 7 | Water edges and afternoon rain, if the six above are done and looked at | rain DONE; water edges not built |
| 8 | From the phases’ own lists (chairs, the gun rack, the jerky rack’s texels, the sump, Ray’s face, the thermal optic, the dish) | chairs, the rack, the sump DONE; the rest not |

## Calls, each with its reason

### 1. The hand

- **Its own drawings, as small models.** Tools and weapons are built from boxes in code (`src/render/hand.ts`): three pickaxes, the axe, shovel, hoe, hammer, machete, knife, saw, spear, rod, three rifles (the builder's with its scope, the raider's taped and iron-sighted, the rebuilt one), two pistols, two bows. A block is the block itself, texel for texel, on an open palm; furniture is its own boxes. Everything else (food, parts, papers) is its pack icon given a thickness, held up between the fingers. **Why models for the tools:** they are what is in hand nine minutes in ten, and a flat picture of a pickaxe is the look of another game.
- **The arm:** a field jacket's sleeve, a knitted cuff, a hand. No face, no body: the script's hero is "you".
- **What moves:** a chop while mining (again and again), one swing for a blow or a block set down, a kick on a shot, the bow bending as it is drawn with the arrow on the string, the hand riding the stride, trailing a quick turn a little, and going down and coming up with the new thing when the hotbar changes.
- **"The rifle when aiming":** a right-click with a gun fires at once in this game, so there is no aim button to hang a pose on. Focus (Q) is the careful shot: in focus a gun comes up from the hip toward the eye, and a bow comes up while it is drawn.
- **Cost:** two draw calls and one depth clear; under 6,000 triangles for the largest shape (a block, texel by texel), a few hundred for a tool. No texture, no second full-screen pass. It is lit like the blocks round the player (the sky's light by the hour, or the lamps').
- **Not drawn** through the telescope, on the menu, or in the picture tool's fixed cameras (so every other before-and-after pair is the same view).
- **Hooks in `src/game.ts`:** `updateHand` (called once in `frame`), and three lines in the mouse-down listener (a click swings, a shot kicks).
- **F3's draw calls** now count the whole frame: three.js zeroed its counts at every pass, so with a second pass the panel would have shown the hand's two calls only (`gl.info.autoReset = false`, reset once in `Renderer.render`).

### 2. Under water

- **What changes when the eye is in water** (`Renderer.setEye`, `underwaterSky`): the sky's colours are replaced by the water's own blue-green, the long haze by a fog that takes half of everything at eight metres and all of it by eighteen, and both daylight and lamplight lose their red. Bubbles rise round the swimmer and are gone at the surface. No pass of its own: the same shaders with other numbers, so it costs nothing.
- **Bright where there is light:** the water's colour follows the light at the eye. A pool at noon is bright blue-green; the tunnel is a lamp-lit green murk; a pool at night is nearly black.
- **The lamps still lead:** a lamp's glow (item 3) carries further into the murk than what it lights, so the next lamp down the tunnel shows before its walls do. The tunnel was "a dry brown corridor"; the owner's rule for it (simple, short, well lit) is why the fog was eased from thirteen metres to eighteen after the first picture.
- **By where the camera is, not the body:** so the picture tool's flying camera shows it too. One hook in `src/game.ts` (`setEye`, in `frame`).

### 3. Glow

- **One soft light for each lamp and fire, all in one draw call** (`src/render/glow.ts`). The mesher lists each chunk's lamps and fires as it builds the chunk (`ChunkMesh.glows`, from the table in `src/world/glow.ts`: 25 kinds of block, each with a colour and a reach); the renderer draws a camera-facing square for each, added to the picture. No blur and no extra pass.
- **About a metre across close to, larger than life from afar.** Ten lanterns in a room must not each paint the whole screen (overdraw is what a slow computer feels); but across the valley a metre is a pixel. So beyond 14 m a glow grows, to three times its size by 60 m, and is never smaller than a point of light: the home's lamps now carry to the pool.
- **Faint by day under the sky, full in the dark and indoors:** each glow knows how much sky light reaches its lamp.
- **Fires flicker,** each to its own time; lamps are steady. (The flames themselves already wavered; block light does not flicker: it is baked into the land's light, and one flickering uniform would make every lamp in the world pulse together.)
- **A lamp sealed in rock** (the tunnel's) puts its glow just in front of its open face, so the wall does not cut it in half and it is not seen through the rock from behind.
- **Moonlight is drawn 1.7 times brighter and bluer** (`src/render/sky.ts`, `NIGHT.light`). The night's `daylight` number stays 0.3: the Ashen live by it (`src/game.ts`, `lightAt`), so the lift is in the light's colour, which only the picture reads. Before, a moonlit cliff top came out at 7% grey: black on most screens.
- **Off with one setting:** "Effects (glow, rain, birds)" in the menu (`fx` in the saved settings; default on). Saving the settings no longer drops a key this build does not know (the lead's word, so Track B's new settings and this one survive each other's builds): what is saved is laid over what was read (`tests/phase9a.game.test.ts`).

### 4. The far land

- **Strata and moss, block by block** (`src/render/farland.ts`). The far land is still 8 m cells, but a rock face is now shaded per metre as the near cliffs are built: damp patches of mossy limestone from the same two scales of noise the generator uses, beds three metres thick each a little lighter or darker than the next, a line of shadow under a ledge here and there. Forest gets crowns four metres across, some in sun, with dark gaps. A bank more than a few metres high is rock whatever grows on top of it (it was the leaves' texture, stretched).
- **The treeless rim is no longer drawn as forest.** No tree grows within 22 m of the valley's edge (`treeSpot`), but the far land put a canopy there, seven metres too tall: the rim dropped when the real blocks came in. It is open forest floor at the ground's own height now; old farmland and the canyon's sides are open ground with scattered trees.
- **The two waterfalls are in the far land,** as a white ribbon down each cliff: the valley's landmark is there before its real blocks are.
- **Holes of sky, and why they were there.** The far land is coarse, a little lower than the real ground and set back from a real cliff's face. So a view line could pass through a column that was still far land, under where its rock would be, and on into a drawn column from inside the rock, where every face looks away: sky. It happened while loading, and in a steady view wherever the edge of the loaded land crossed a cliff (the "before" pictures of the far wall show it at 96 m).
- **The fix is two rules.** (1) A drawn column hides its far land only when it cannot be seen through one that is not drawn: all eight columns round it are drawn, and every column within two that is nearer the eye (`src/render/farmask.ts`). (2) Where both are drawn, the real blocks mark a stencil bit and the far land, drawn after them, fills only what they left. So the far land can never cover real land, and wherever real land has a gap the far land is behind it instead of sky.
- **What that costs:** one stencil buffer (`stencil: true` on the WebGL context) and no more triangles; the far land is now drawn after the chunks, so it shades fewer pixels than before.
- **The streamer is untouched:** the rule lives in the renderer, worked out from the mask the streamer already sends, again whenever the eye crosses into another column.

### 5. Trees and plants

- **Four broadleaf shapes where there was one** (`src/gen/terrain.ts`, `shapeOf`): the flat-topped canopy tree (version 13's); an **emergent**, a giant with a bare trunk on buttresses and a crown in three tiers; a low **round** tree, branching near the ground (the valley's fruit trees, old farmland); and the **guarumo**, a slender pioneer with a few bare limbs each ending in a hand of pale leaves (a new block, `leaves_pale`). Each zone has its own mix: round trees in the valley and on the farmland, emergents in the deep band.
- **Bananas** (`banana_trunk`, `banana_leaves`): clumps of stout green stems with broad leaves on crossed sheets, so they move in the wind like the ferns. They stand where a tree fern did: half of those in the valley and on the old farmland, a few along the buffer's road. The tree fern stays everywhere else. A tall stem carries a bunch (`banana_bunch`), two times in three, hanging beside its top under a leaf. All of it is scenery here: by the lead's word (2026-11-20) Track B makes the bunch something to pick once this branch is merged, and adds no second plant.
- **Vines on the valley's cliffs** (`vine`, a sheet against the rock, four facings): in curtains where the wall is damp, thick near the falls, hardly any between. Never by the home's face, the path, the falls' curtain or the tunnel's mouths, and never below three blocks above the floor: nothing that is used hides behind one.
- **Nothing built moves.** Plants are the generator's last step and only fill open air. `tests/plants.test.ts` proves it against version 13: the two worlds differ only where a plant or open air was (3.4 million cells in the whole world, none of them rock, water or anything built; none in the home or over the garden).
- **The fixtures still pin the land.** `generateColumn(cx, cz, 'v13')` grows exactly version 13's plants; the hashes of earlier phases (`tools/worldhash.ts`, `tools/landhash.ts`) are taken that way, so every old fixture still compares like with like and none was regenerated.
- **The game's fences keep their old trees.** A crown is something to walk on. The first build of the new shapes failed two of `tests/walk.test.ts`'s checks: an emergent's crown reached the world's ceiling in the southern mountains and the gorge was walked round. So along the gorge (90 m either side), in the mountains at the world's ends, and for 40 m outside the valley's treeless rim, the trees are version 13's block for block (`oldGrowth`), and the test that walks the gorge passes as it did. A round tree's lowest leaf is three blocks up in the valley and four outside it, as the flat crown's was.
- **Two lists learned the new names:** what a creature may not be born on (`src/entity/spawner.ts`), and what a footstep sounds like.

### 6. Birds

- **Scenery, not creatures** (`src/render/birds.ts`): no health, no minds, no paths; they cannot be hit and are not saved. In the valley's bowl only, by day, near the player. At most eight at once, a few boxes each, one draw call a kind.
- **Hummingbirds** (three) work the flowers nearest the player: orchids, bromeliads, the garden's crops in flower, the coffee. They hover beside one, bill toward it, dart to the next, and are two metres off before a hand closes. Drawn half as big again as life: a jewel must be seen to be one.
- **Doves** (four) walk and peck on the valley floor in a loose group, and burst up with a clatter of wings when you come within five or six metres (nine if you run), to settle again further off.
- **The quetzal** sits on top of one tree, the broadleaf by the garden's south-west corner where the home path comes down (`quetzalTree`), from dawn to mid-morning on the first morning of a valley and every third after ("every few days", in a game whose day is twenty minutes). It calls now and then (two soft falling whistles, from where it sits), and the first time you are near it a line says what it is and that it leaves if you walk under its tree. It does; it is back three days on. If the tree is felled it does not come.
- **Off with the Effects setting.** One hook in `src/game.ts` (`updateBirds`, in `frame`); two short sounds added to `src/audio/audio.ts` (`quetzal`, `flutter`).
- **Not built: anoles.** The review lists them; the script does not, and a lizard that reads at a metre is a creature's worth of work.

### 7. Rain (water edges were not built)

- **Afternoon rain** (`src/render/rain.ts`): three afternoons in five, for fifty minutes to an hour and a half from about two (`rainAt`), never on a valley's first two days. The sky greys, the haze comes in from 1,350 m to 420, and 700 streaks fall round the eye in one draw call, moved wholly in the vertex shader.
- **It stops at whatever is overhead:** a 32 × 32 map of roof heights round the eye, one row looked up again each frame. Under the cave's roof you are dry and the rain is a curtain across the mouth; under a tree's crown it does not reach you.
- **It is heard:** a steady hiss by how hard it falls, a murmur indoors.
- **It changes nothing in play.** Crops are not watered, nobody is slowed, and the night's `daylight` number (the Ashen's) is untouched: rain is weather to look at, as the script has it.
- **A fault the test caught:** the first version greyed the sky by changing the sky's colours in place; at midday those are the palette's own objects, so one shower would have left every later day grey. It gives new colours now (`tests/rain.test.ts`).
- **Off with the Effects setting,** and never in the picture tool's still pictures unless asked for (`?fx`).
- **Water edges (foam where water meets rock, a simple flow) were not built.** They are a change to the water's mesh and shader that wants a real graphics card to judge in motion; the six items above and the rain were judged first, as the brief orders, and the time went to them.

### 8. From the phases' own lists

- **Sitting.** A right-click on a chair, the sofa, a bench or a lounger sits you down: the eye at a sitter's height, the body still, the look free. A chair turns you the way it faces. A step or a jump stands you up where you stood; so does a blow, or the seat being mined from under you. (`src/game.ts`: `sit`, `keepSeat`, `stand`; `tests/phase9a.game.test.ts`.) The loungers on the balcony face the falls: the owner's sunset can be watched sitting down.
- **The jerky rack's stray texels.** Its four legs were drawn with the rack's own cut-out picture, of which two texels fall on each leg: the legs were invisible but for two dots apiece. They are oak posts now.
- **The sump reads as dangerous.** The black sludge gives off a dim, sick green light of its own (a glow, item 3: faint by day, plain at dusk; it lights nothing) and a slow yellow-green vapour rises off it. The signs said it; now the pond does.
- **Not done, and why:** a gun rack in the vault (a new piece of furniture inside the home, which the home's own fixtures pin: a job for a pass over the home, not this one); Ray's face at a distance (the people's models are Phase 8's; nothing in this track touches `src/render/creatures.ts`); the thermal optic's glow and the dish from the far garden were to be photographed and judged, and were not reached.

## Hooks in `src/game.ts` (each in one place)

| Hook | Where | What |
|---|---|---|
| `updateHand(dt)` | called once in `frame`, before `render` | tells the hand what is held and what the player is doing |
| three lines in the canvas's `mousedown` listener | `bindInput` | a click swings the hand, a shot kicks it |
| `renderer.setEye(...)` | `frame`, before `applySky` | is the eye in water, and the light there |
| `updateBirds(dt)` | called once in `frame`, before `render` | birds, rain, and the sounds and the one line they cause |
| the sump's vapour | `emitParticles` (7 lines) | |
| `sit`, `seatBody`, `keepSeat`, `stand`; `SEATS` | by `useFurniture`; one line each in `tick` (no step while seated), the hurt check, `useFurniture`, `usableTarget`, the key-down listener; `snapshot` saves where you stood | sitting |
| `setEffects`, and `fx` in `saveSettings` / `loadSettings` | with the other settings | the Effects setting |

Outside it: `src/audio/audio.ts` gained `rain`, `quetzal`, `flutter` and two names in `materialOf`; `src/entity/spawner.ts` three names in its list of what is not ground; `src/world/items.ts` three names in what an axe cuts.

## Merging with Track B

Track B's first push (`phase9b` at 16cb1a3, seen 2026-11-20) meets this branch in four files. None of it is a disagreement; each is two additions to the same lines.

- **`src/gen/terrain.ts`:** B made `generateColumn` a wrapper over a generator, `generateColumnSteps(cx, cz)`. Keep B's shape and carry the plants through: `generateColumn(cx, cz, plants = 'now')` calls `generateColumnSteps(cx, cz, plants)`, whose last part is `placeTrees(col, x0, z0, plants); placeGroundPlants(col, x0, z0); if (plants === 'now') placeVines(col, x0, z0);`.
- **`src/ui/hud.ts` and `src/game.ts` (settings):** B moved the settings into `src/game/settings.ts`. The Effects checkbox becomes one more field there (`fx: boolean`, default true), shown by `showSettings`, and its action `setEffects` sets `renderer.effects`.
- **`src/render/renderer.ts`:** B chooses anti-aliasing when the context is made. Keep `stencil: true` in the same options (the far land needs it: without a stencil buffer it would cover the real land in every column at the edge of what is loaded), and `gl.info.autoReset = false` after it.
- **`src/jobs/tasks.ts` / the mesher:** a chunk's mesh now carries `glows` (a small `Float32Array`); if B releases a mesh's CPU arrays after upload, `glows` is read once in `Renderer.setChunkMesh` and can go with them.

## The build machine

- **GitHub's checks failed once on this branch** (bf80e1f): `tests/plants.test.ts`, "version 13's plants have none of them", made one assertion for each of eight million cells and took 35 s there against the 30 s limit (it passed here). It counts and asserts once now. Nothing was skipped.

## The fresh review

_A read-only agent that wrote none of this (2026-11-20, at 98b2652): the diff, the pictures before and after, and this page's claims, verified by running things. It ran the whole suite (895 passed, 2 skipped) and took eleven pictures of its own (`out/9a/r1-*.png`). Each finding is marked as it stands._

**Held up (verified by the reviewer):** `'v13'` is name for name what `main` generates, in all 4,096 columns; the cheaper vines left the world identical; a column builds as fast as version 13's (ratio 1.00); save version 4 and world layout 2 unchanged, `src/save/` and `src/world/streamer.ts` untouched; the night's `daylight` is 0.300; the Effects setting stops glow, bubbles, rain and birds; no sky colour is changed in place; F3's counts are zeroed every frame; the hand pass leaves the stencil sane; the hand's cache never disposes a geometry in use; the vine's mark has no other reader; every banana stem stands on ground; birds import nothing from `src/entity`, are at most eight, and have no path to a NaN; the rain's roof map is right and costs nothing when dry; no 2D canvas in the new files.

### Bugs

1. OPEN (the lead's call) — **A version-13 save meets new growth in air the player never touched.** A save holds only edited cells; 70% of the valley's broadleaves changed shape, so where a tree was felled in version 13 the new shape's limbs and leaves stand in other cells, floating (416 cells in the bowl are solid now where version 13 had air), and anything hung on an old crown hangs on nothing. Nothing built is replaced. The fix is to grow a save without a marker with `'v13'` plants (the path exists) and new valleys with today's; that needs a field in the save, which is Track B's ground.
2. OPEN — **Night gets darker at dusk, then brighter.** Moonlight was lifted and dusk was not: the land at 18:30 is darker than at 19:30.
3. OPEN — **`Glows.rebuild` throws** if the first chunk with a lamp is removed before a frame is drawn.
4. OPEN — **A window seat is a whole block**: sitting on it puts the eye 0.17 m above the cushion, inside the potted orchid that stands on one.
5. OPEN — **Sitting:** a held move key stands you up at once; you can sit in mid-air and in water; while seated the body's water flags freeze.
6. OPEN — **A seat under the cross takes a gun's shot:** the right-click sits you down instead of firing.
7. OPEN — **F3's whole-frame count is lost when the WebGL context is restored.**
8. OPEN — **An emergent's buttresses float on a slope** (1,437 of 9,073 hang a block clear).
9. OPEN — **Smaller:** the crucible furnace's glow sits above it (it is a cube, treated as set in a wall); no vines on a column's two edge rows (a bare seam every 32 m); three ore blocks have a vine over them; the quetzal's line is said by distance alone; the under-water look starts 12 cm above the water.

### Pictures that are not improvements, or are doubtful

- OPEN — **Under water the tunnel mouth's lamps do not show across the pool** (a glow dies with the fog at 18 m): against "easy to find".
- OPEN — **The tunnel's gate, four metres ahead, is black murk** where it was a readable wall.
- OPEN — **The sump by day is a neon lime disc** (mostly the vapour).
- OPEN — **Street lights at 60 to 100 m are puffballs** wider than their posts.
- OPEN — **The quetzal cannot be made out** from the path, and leaves before you are close enough to see it.
- ANSWERED below, not changed: the balcony sunset is indistinguishable from version 13's (no loss, no gain: at 256 m the far wall is real blocks); sitting on the lounger hides the valley floor behind the parapet; the waterfall at night is the brightest thing in the valley; a limb's sawn end shows from below; the guarumo's leaves read close to as slabs; held food and parts are the pack icon given a thickness (the reviewer names it as another game's look, for the lead to weigh); no picture shows a fire.

### Claims on this page that did not hold

- OPEN — to be corrected in place: the cells that differ from version 13 (2,065,982, not 3.4 million); where the bananas are (635 of 732 stems are in the buffer, 10 in the valley); the largest held shape (a fireplace, 6,128 triangles); "a handful of block look-ups a frame" (the quetzal's perch was looked for every frame, about 575); "every lamp and fire" (the smoke pot and the lure have no glow); "block for block" in the old-growth strips (trunk for trunk: a crown's reach at a strip's edge differs); `glows` cannot be released after upload (the renderer keeps and re-reads it); the rain test's last line compared an object with itself.
