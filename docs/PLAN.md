# Hidden Valley — Block Edition: the plan

## Context

The owner wants a second, separate version of Hidden Valley. It is block-built and plays like Minecraft, in a web browser on a Mac or PC with keyboard and mouse.

- **The script is shared.** The game follows the story and design of `/home/user/hidden-valley/docs/DESIGN.md`. That repo is only read, never written to; the Unity game is untouched.
- **What's different:** blocks replace the high-detail art. Mining is a core verb. The billionaire's inheritance is all there at the start: tech, weapons and food, so play starts at once.
- **The world:** the valley is a peaceful sandbox for mining and growing. Danger rises step by step outside it.
- **Where it lives:** it is built in this chat and lives in a new repo later. Working title: *Hidden Valley Blocks*.

**Honest bound on "as good as Minecraft":** the browser can match the *feel*: smooth chunk loading, no hitch when mining, soft lighting, water, a day/night sky, sound. That's the target, and it is achievable on the owner's M4 Mac. Matching Minecraft's 15 years of *content breadth* is not; the content is the Hidden Valley script.

## How it is built (fixed decisions)

**Stack**
- TypeScript + Vite + Three.js (WebGL2) + Web Workers.
- Each build is one self-contained HTML file under 14 MB, published as a private claude.ai page. The owner plays it from the link.
- Electron for Steam is possible later; the platform code is kept separate so that stays open.

**World**
- Bounded and designed, not endless: 2,048 × 2,048 blocks, 192 tall, 1 block = 1 m.
- Chunks are 32³ and stream around the player.
- Shapes and landmark positions come from a layout file written from DESIGN.md. Noise is used only for surface detail.
- The player's changes are saved as a diff over the generated world.

**Rendering**
- Every visible face is drawn with corner shading and soft lighting.
- Light uses Minecraft-style flood fill: sunlight plus lantern and torch light.
- Translucent water you can swim in, with a breath meter, and a real waterfall.
- Sky with sun, moon, stars, clouds and valley morning mist.
- Distant low-detail terrain, so the far cliffs and the ridge tower show from the balcony.

**Platform fallbacks** (the claude.ai page runs inside a sandboxed frame)
- If the mouse can't be captured, look by dragging.
- If storage is blocked, the game still runs and saves go to a file.
- If workers are blocked, the same jobs run on the main thread.
- Every storage call is guarded.
- Autosave every 60 s, plus *Export save* / *Import save* to a file.

**Look and sound**
- Original 16×16 pixel-art textures in a cloud-forest palette: limestone karst, tree ferns, bamboo, broadleaf canopy, bromeliads, moss.
- Sounds are CC0 or made in code.
- Nothing from Minecraft: no name, textures, sounds, creatures or interface look.
- Free assets only, each listed in `LICENSES.md`.

**Design data in plain JSON:** blocks, items, recipes, tech tree M0–M5, loot, creatures, spawns, dialogue and world layout. These are checked for broken references at build time.

**Feel numbers**
- A day is 20 minutes, the same as the prototype and Minecraft.
- Walk 4 m/s; sprint 5.6 m/s (costs hunger).
- Distances are about half DESIGN.md's walking times, because block games move faster and people stop to mine.

**Code layout** (new repo; the Plan agent's design)
- `src/platform/`: the only code that touches browser APIs (fallbacks above).
- `src/world/`: chunks, light, fluids, zones and edits.
- `src/gen/`: layout → terrain, structure placing.
- `src/mesh/` and `src/jobs/`: workers.
- `src/render/`: sky, LOD, particles.
- `src/sim/`: loop, physics, raycast, survival, combat, farming.
- `src/entity/`: creatures, A* pathfinding, spawner.
- `src/inventory/`: crafting, tech tree, loot.
- `src/ui/`: DOM/Preact screens, including phone and computer.
- `src/save/`, `src/creative/` (build mode + structure export), `src/debug/`.
- `data/`, `tools/` (texture generator, map-to-PNG).
- `tests/`: vitest unit tests, plus Playwright pages that mimic the sandboxed frame.

**The sanctuary rule is enforced in code, not in data.** Hostiles can never:
1. Spawn inside the valley's rim, at any depth, including the caves under the valley floor.
2. Path into it.
3. Target anyone inside it.
4. Be knocked into it.

A test samples 100,000 spawns and must find zero inside.

## Danger scale (applies to every zone)

Each zone has a danger level:

| Zone | Level |
|---|---|
| Valley | 0, always |
| Wilderness buffer | 1 |
| Zone-1 near band | 2 |
| Zone-1 mid band | 3 |
| Zone-1 deep band | 4 |
| Zone-2 | 5 |
| Zone-3 | 6 |
| Zone-4 | 7 |

- **Night adds +1** outside the valley. The owl call at dusk is the warning.
- **Deep underground adds +1** outside the valley.

The level picks spawn tables, creature strength, ore tier and loot quality. Fights stay small (1–3 enemies) and slow, as in the script; attacks are telegraphed so you can dodge.

## The map (drawn as an image for the owner in Phase 0)

```
   [ZONE-4  radiation edge · ridge tower]   (far north-west)
                ^ mountain pass (M4+)
   [ZONE-2  faction compound · commercial ruins]  <- old highway north from the hunting camp
                |
[ZONE-3 industrial river · dam]||ravine||[Z1 DEEP]-[Z1 MID]-[Z1 NEAR]-saddle-[BUFFER]-[canyon pool]=tunnel=[VALLEY]
  (crossed at the dam from Zone-2, or build across)                                                        east
```
The valley sits on the east side of the world; the way out runs west from the valley pool, so the outside opens behind the waterfall the balcony looks at.

## The billionaire's inheritance (all there on day one)

The builder is a reclusive tech **billionaire**, not the millionaire of DESIGN.md. His body is never found; his journals on the bookshelves tell his story.

The cave keeps DESIGN.md's 4-room layout and adds a **vault-armory** behind a steel door in the hallway.

- **Balcony**
  - Stone railing, solid, with one gap on the north side where the path leaves.
  - Big stove with its back to the rock and a real smoke pipe.
  - Solar panel and battery for the lights and phone.
  - Bench.
  - Coffee grove and planted garden below.
- **Living room**
  - Fireplace with a chimney.
  - Bed: sleeping sets your respawn point and works from 17:00.
  - Bookshelves: the journals, plus "builder's books" that unlock recipes.
  - A map table that fills in as you explore.
  - Computer: a Bitcoin wallet with a real starting balance; later the mining software and the AGI terminal.
  - Phone: the builder's dead contacts. Marco appears once you reach the bus shelter.
- **Workshop**
  - Workbench, smelter, anvil, tannery, and a kiln with a flue.
  - A tool wall: steel pickaxe, shovel, axe, hoe, hammer, saw, knife, machete, fishing rod and shears.
- **Pantry / cold store**
  - About 10 in-game days of food: canned goods, rice, beans, honey, coffee, salt.
  - A seed chest.
  - Water jugs.
  - The back wall is a **rich iron vein**.
- **Vault-armory**
  - Bolt-action hunting rifle with a scope and 40 rounds.
  - Compound bow with 30 arrows.
  - Machete.
  - Light armour vest.
  - 6 first-aid kits.
  - Water filter, binoculars, headlamp, a backpack upgrade.
  - A wall safe whose code is in the journal. It holds a hardware wallet: a bonus Bitcoin balance and a lore beat.

**Why you still go outside** (DESIGN.md's rule that you're pulled out to progress, not forced out): ammo, medicine, fuel and spare parts are **finite**. Better ores, salvage, livestock and every tech step past M1 are **outside only**. Firearms are still never crafted from scratch; you find them or buy them. Ammo crafting comes at M3.

## The zones

### 1. The Valley: sanctuary, danger 0

- **Shape:** a karst sinkhole about 200 m across with cliffs about 50 m high.
- **Layout:** the cave is high on the east wall and faces west, across the valley to the waterfall and pool on the west wall. The sun sets behind the waterfall, seen from the balcony (DESIGN.md: "west-facing" cave). A creek winds off-centre across the valley and sinks into the rock. The path down is an S-curve.
- **Mining:** all of it can be mined: limestone, clay and sand at the creek, gravel, sparse iron pockets plus the pantry's rich vein, and flint. Caves under the valley are safe and dark; carry a lantern. Coal and better ores are outside, keeping the tier-1-inside rule.
- **Growing:**
  - Corn, beans, squash, tomato, pepper, potato, herbs, coffee, banana and plantain, wild avocado and papaya.
  - Crops grow on random ticks and keep growing while you're away.
- **Food and drink:**
  - Trout fishing in the pool and creek.
  - Cooking at the fireplace and stove.
  - Water from the pool, the creek or a filter.
- **Life:** hummingbirds, doves, morpho butterflies by day, fireflies at dusk, frogs at night, and the rare quetzal on one tree every few days.
- **Never:** attacked, hostile spawns, perimeter walls needed.

### 2. The tunnel and canyon pool: the threshold

- **The swim:** an underwater tunnel from the valley pool to the canyon pool outside, swum on one breath. The breath meter matters.
- **The hidden gate** halfway along looks like rock. Opening it is a short ritual: a lever sequence, a grinding sound, light. It runs on every trip, both ways.
- **The canyon pool:** a cliff-backed pool under an outside waterfall, where the story began. The old road starts nearby.

### 3. Wilderness buffer: danger 1, wildlife only

- **Terrain:** cloud forest along a crumbled old road, about 350 m to the saddle. Side pockets hold the rabbit warren, the morpho tree and a toppled ranger sign. The ridge tower shows as a distant silhouette.
- **Creatures:**
  - Rabbits and deer, to hunt.
  - Wild boar: charges if provoked.
  - A puma: heard rarely; at night it may stalk.
  - The rules: no humans, no Ashen, no radiation, ever.
- **Mining:** coal outcrops, copper, flint and clay. Shallow caves hold only bats. The buffer *can* be mined and built in, unlike DESIGN.md: a block game needs that.
- **What you bring home:** meat, hide, bone, and a rabbit breeding pair once a hutch exists. A spear, bow and traps are enough to work it forever.

### 4. Zone-1 near band: danger 2, abandoned farmland

- **The saddle:** a raised pass with a view of the farmstead roof, the outpost's smoke column and the dark deep band. Past here the danger is real.
- **Marco's bus shelter** (neutral ground)
  - Marco comes here by day; you arrange meetups by phone.
  - You trade both ways in Bitcoin; he buys at half price.
  - This is trust level 1.
- **M1 corpse**
  - A raider scout with a clear bullet wound.
  - He carries a **pistol** (a second gun, since you already have the rifle), a map scrap and the faction armband.
- **Farmstead** (south spur)
  - A collapsed house with a den of **3 feral dogs** that flank as a pack.
  - The barn holds wire mesh, hardware, lumber, canvas and tools.
  - Feral chickens. Catch a pair → build a coop.
- **Mining:** iron, coal and copper. Salvage blocks (scrap metal, a wrecked truck, fence wire) can be mined for parts.
- **Night:** coyote packs roam and the dogs range wider.

### 5. Zone-1 mid band: danger 3, occupied

- **Raider outpost** (cinder-block shop on the road)
  - **3 raiders:** a rooftop rifle lookout, a pistol behind cover, and a machete rusher.
  - A stealth flank through the brush is possible.
  - A **one-time fight**: they never come back.
  - Loot: rifle, pistol, ammo stash, forge-upgrade parts, bowstring and arrowheads. The back-room forge comes too.
- **Hunting camp** (north spur, easy to miss)
  - A lodge, drying racks, a trap line, cured hides.
  - A **jaguar** crosses the clearing once, makes eye contact and vanishes. Its tracks stay; provoke it and the fight is real.
- **Mining:** deeper caves with better iron and coal. Underground danger is the mid band's +1.
- **Focus mode** arrives with this zone: an optional slow-time aim for deliberate shots.

### 6. Zone-1 deep band: danger 4, signal only

- **Crumbled bridge:** the middle span is gone over a ravine about 40 m wide.
- **The deep-band corpse on the far bank:** intact, no bullet wound, twisted, with a wide pale stain. It reads as "not raiders".
- **Tracks:** two-legged prints that are neither paws nor boots, on your side, never near the corpse.
- **Rules:** no enemies to fight, no loot. Sound and sight only: the first hint of the Ashen.
- **Block-game freedom:** you *can* build across the ravine. The far side is Zone-3, and it is deadly early on.

### 7. Zone-2: faction territory, danger 5 (M3 gate)

Zones 2–4 are drawn from DESIGN.md's one-line notes; their exact layout will be shown before they are built.

- **Getting there:** an old highway north from the hunting camp's spur.
- **What's there:** the raiders' fortified compound, where the armband pays off. Its patrols come in groups of 1–3, never hordes.
- **Commercial ruins** to mine for salvage:
  - roof solar panels
  - wiring and copper
  - battery cells
  - server racks (GPU, PSU, mining boards)
  - fridge and pump units
  - plumbing
  - scrap lead
- **Underground:** caves with saltpeter on the walls and sulfur by a hot spring (for gunpowder).
- **Radiation:** first met as small, marked hotspots, and your dose climbs while you stand in them. Doc sells treatment.
- **Unlocks (M3):**
  - solar array and battery bank, for power around the clock
  - the first Bitcoin mining rig
  - Doc, by phone
  - fridge and water pump
  - ammo crafting
  - Marco selling guns

### 8. Zone-3: industrial river, danger 6 (M4 gate)

- **Getting there:** cross at the dam from Zone-2, or build across the ravine.
- **What's there:** machine shops, a rail yard, a river and dam, rich iron and coal deep down.
- **Ashen:** the main threat here. Packs of 1–3 that are much worse at night and in the dark underground.
- **Unlocks (M4):**
  - hydro generator on the valley creek
  - a multi-rig Bitcoin farm
  - advanced smelting (steel)
  - workshop tier 2
  - Ray, by phone, with the uplink plans
  - mods for found guns
  - tier-2 armour

### 9. Zone-4: radiation edge, danger 7 (M5 gate)

- **Getting there:** a mountain pass to the ridge tower seen from the buffer since day one.
- **What's there:** heavy radiation, managed by suit, meds and route. Rare components and antenna sections, and the tower itself.
- **Unlocks (M5):**
  - Satellite antenna.
  - **AGI terminal** on the builder's computer. You query it; it never chats. It answers with weather, radiation maps, Ashen movements and schematics.
  - Telescope on the balcony.
  - Thermal optics and anti-Ashen munitions, chemical or sonic.
  - Medical fabricator.
- **After M5:** soft goals such as rescuing Mira come later.

## Phases (each ends with a link the owner plays; the owner's "good" closes it)

Each phase ends the same way:
- A fresh Claude reviewer checks the work.
- Then the owner gets the link, up to 5 screenshots and up to 10 lines.

| # | Phase | Playable at the end | Rough size |
|---|---|---|---|
| 0 | **Foundations** | A first step tests a tiny page inside a real claude.ai page: mouse capture, workers, storage, file download. Then the build pipeline, map-to-PNG of the layout for the owner, chunk engine, valley shape, walk/mine/place, hotbar, save/export. | 1–2 sessions |
| 1 | **The valley looks right** | Soft light, lanterns, day/night sky, sunset from the balcony, mist, water + waterfall + swimming, far terrain, crack stages, particles, ambient and positional sound | 2–3 |
| 2 | **Living in the valley + the inheritance** | All of zone 1: the furnished cave with vault and safe, inventory/crafting/chests, tools and ores, farming, fishing, cooking, hunger/thirst/HP, sleep, journals, computer and phone screens, build mode with structure export. **The full peaceful sandbox.** | 3–5 |
| 3 | **The way out + buffer** | Tunnel swim and gate ritual, canyon pool, buffer wildlife, hunting and traps, death means losing what you carried and respawning at the bed, the owl dusk cue, rabbits → hutch | 2–3 |
| 4 | **Zone-1 near** | Saddle, Marco and trading, M1 corpse and pistol, farmstead with dogs, chickens → coop, salvage mining (M1 done) | 2–3 |
| 5 | **Zone-1 mid + deep** | Outpost fight and stealth, focus mode, hunting camp and jaguar, the bridge and deep-band signals, M2 complete (bow, smoker, jerky, expansions). *This is DESIGN.md's MVP, in blocks.* | 3–4 |
| 6 | **Zone-2 + power (M3)** | Faction territory, salvage ruins, radiation hotspots, solar/battery, Bitcoin rig, Doc, ammo crafting | 3–5 |
| 7 | **Zone-3 + hydro (M4)** | Industrial river, Ashen, hydro, multi-rig farm, steel, Ray, tier-2 armour | 3–5 |
| 8 | **Zone-4 + uplink (M5)** | Radiation edge, tower, antenna, AGI terminal, telescope, late weapons | 3–5 |
| 9 | **Finish** | Optional prologue (the raider escape and dive) for new games, settings, Safari pass, performance pass on the owner's Mac, save upgrades between versions, optional Electron test for Steam | 3–5 |

**Rough calendar:**
- Phases 0–2 (a full peaceful valley with the inheritance): about 2–3 weeks.
- Through Phase 5: about 2–3 months.
- Phases 6–9 come after.

## Deliberate differences from DESIGN.md (the owner asked for these, or a block game needs them)

1. A billionaire, a richer inheritance, and a vault-armory: weapons, ammo and food from day one.
2. Mining works everywhere, including the valley rock and the buffer. DESIGN.md has one finite vein and a buffer you can't change.
3. The game starts in the valley. The escape prologue is optional and comes in Phase 9.
4. The ravine can be bridged by building; the far side is simply deadly.
5. Distances are about half and walking is faster (4 m/s instead of 3).

## Where the work lives until the repo exists

- **The risk:** the container already restarted once while this plan was being made. Anything only in it can be lost.
- **Code:** in `/home/user/hidden-valley-blocks/`, with a local git history and no remote.
- **Every published build also carries a source bundle** as a supporting file of the page, so the code survives a wiped container.
- **When the owner creates the empty repo:** I attach it and push everything, history included. Creating it before Phase 1 is recommended.
- **Phase 0 also checks** whether claude.ai's page storage can hold saves across devices, beyond the browser's own storage.

## Verification

- **Unit tests (vitest in Node):**
  - meshing and corner shading
  - light: an incremental update must equal a full recompute after random edits
  - save round-trip and diff
  - crafting and tech-tree gating
  - loot with a fixed seed
  - spawn rules, including zero hostiles in the sanctuary over 100k samples
  - A* never entering the valley
  - crop catch-up
  - all JSON references resolving
- **Playwright in the container:**
  - The built file loads inside test pages that copy claude.ai's sandboxed frame (with and without mouse capture, storage and downloads), and the fallbacks are checked.
  - Fixed-seed, fixed-time, fixed-camera screenshots: the balcony at noon and at sunset, the cave at night by lantern, underwater, the inventory. They catch regressions only.
  - Every phase is also scripted end to end through a test hook. Example: walk to the pantry, mine iron, smelt it, craft, plant, sleep, check the crop grew.
- **Frame rate** is measured only on the owner's Mac, using a built-in performance overlay and a scripted fly-through.
- **The owner is the gate:** a passing check never means "looks right" or "plays right".
