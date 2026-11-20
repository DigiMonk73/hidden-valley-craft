# Phase 9A — the finish: feel and look

_Track A of [PHASE9.md](PHASE9.md), built on branch `phase9a` (2026-11-20). The plan, each call with its reason, and what is done. The owner's critiques, as the lead forwards them, outrank this list._

## The rule

Every item is judged by eye. Before anything was changed, one set of pictures was taken of every view this track touches (`node tools/shots9a.mjs before valley water road far`, the build of version 13); the same cameras are taken again after each step (`out/9a/<tag>-<name>.png`) and both are looked at. A passing check never means it looks right.

- `tools/shots9a.mjs` loads the page once per set and moves the camera, so twelve views cost little more than one (a page load is six minutes here). Its sets: `valley` (the owner's sunset, the home by night, the pool, the cliffs), `water`, `road`, `far` (the far land as itself, at a short view distance), `hand`.
- `tools/handroom.mjs` photographs the hand and what it holds without loading the world (seconds, not minutes): for shapes and poses.
- A copy of version 13's build is kept in `out/dist-v13` while this track runs, so a "before" can be taken of any new camera.

## The plan, in order

| # | What | State |
|---|---|---|
| 1 | A hand and the held tool on screen, with a swing; the rifle when aiming | built |
| 2 | Under water: blue-green fog a few metres deep, dimmer light, bubbles | |
| 3 | A glow round every lamp and fire, flicker on fires; the home glowing from the valley floor at night | |
| 4 | Distant cliffs: the far land with the near land's moss and strata, kept drawn until a column's own meshes are in | |
| 5 | Three or four tree shapes, banana and tree fern, vines on the cliffs | |
| 6 | Hummingbirds, doves, the quetzal | |
| 7 | Water edges and afternoon rain, if the six above are done and looked at | |
| 8 | From the phases' own lists (chairs, the gun rack, the jerky rack's texels, the sump, Ray's face, the thermal optic, the dish) | |

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
- **Off with one setting:** "Effects (glow, rain, birds)" in the menu (`fx` in the saved settings; default on).

### 4. The far land

- **Strata and moss, block by block** (`src/render/farland.ts`). The far land is still 8 m cells, but a rock face is now shaded per metre as the near cliffs are built: damp patches of mossy limestone from the same two scales of noise the generator uses, beds three metres thick each a little lighter or darker than the next, a line of shadow under a ledge here and there. Forest gets crowns four metres across, some in sun, with dark gaps. A bank more than a few metres high is rock whatever grows on top of it (it was the leaves' texture, stretched).
- **The treeless rim is no longer drawn as forest.** No tree grows within 22 m of the valley's edge (`treeSpot`), but the far land put a canopy there, seven metres too tall: the rim dropped when the real blocks came in. It is open forest floor at the ground's own height now; old farmland and the canyon's sides are open ground with scattered trees.
- **The two waterfalls are in the far land,** as a white ribbon down each cliff: the valley's landmark is there before its real blocks are.
- **Holes of sky, and why they were there.** The far land is coarse, a little lower than the real ground and set back from a real cliff's face. So a view line could pass through a column that was still far land, under where its rock would be, and on into a drawn column from inside the rock, where every face looks away: sky. It happened while loading, and in a steady view wherever the edge of the loaded land crossed a cliff (the "before" pictures of the far wall show it at 96 m).
- **The fix is two rules.** (1) A drawn column hides its far land only when it cannot be seen through one that is not drawn: all eight columns round it are drawn, and every column within two that is nearer the eye (`src/render/farmask.ts`). (2) Where both are drawn, the real blocks mark a stencil bit and the far land, drawn after them, fills only what they left. So the far land can never cover real land, and wherever real land has a gap the far land is behind it instead of sky.
- **What that costs:** one stencil buffer (`stencil: true` on the WebGL context) and no more triangles; the far land is now drawn after the chunks, so it shades fewer pixels than before.
- **The streamer is untouched:** the rule lives in the renderer, worked out from the mask the streamer already sends, again whenever the eye crosses into another column.
