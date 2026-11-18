# Phase 3 — The way out, and the wilderness buffer

The aim: the first steps outside. Swim the drowned tunnel through the hidden gate, climb out of the canyon onto the old road, and walk a cloud forest that is wild but not hostile: rabbits, deer, wild boar, and a puma at night. Hunt, trap, cook and tan; bring rabbits home to a hutch. Dying outside costs what you carried, which waits in a lost pack where you fell. Build order as below; each step is committed with tests and marked DONE here.

## 1. The tunnel, the gate, the canyon and the road

- **The tunnel's midpoint:** an air pocket, a small chamber above the water, so the swim is two breaths, not one.
- **The builder's hidden gate:** it is set in the tunnel and looks like rock.
  - A lever disguised as mossy stone, on each side, opens it.
  - **The ritual:** a grinding sound and a rumble, the gate sliding open, and light from the far side. It closes itself a few seconds after you pass.
  - It runs on every trip, both ways (DESIGN.md: the sealed tunnel). The builder installed it in this version, the billionaire's money, so it works from day one.
- **The canyon:** a switchback ramp climbs the canyon's west wall from the canyon pool up to the buffer.
- **The old road:** cracked asphalt, 4 wide, from the ramp's top west through the buffer to the saddle at x ≈ 1150. Trees are cleared off it.

## 2. The buffer's places (DESIGN.md: wilderness buffer)

All of these are linear-with-pockets off the road:
- **A toppled ranger sign** (wood and a painted board) beside the road.
- **The morpho tree:** a great broadleaf where blue morpho butterflies gather in daylight.
- **The rabbit warren:** a bank with burrow holes.
- **The ridge tower:** a ruined radio tower on a far ridge (Zone-4), drawn in the distant land as a silhouette. It is not reachable yet.

## 3. Creatures

- **An entity system:** creatures, arrows and lost packs, updated at 20 Hz and drawn as box models (body, head, legs swinging as they walk).
- **The sanctuary rule, enforced in code** (docs/PLAN.md): no hostile creature spawns, walks or attacks inside the valley at any depth. A test samples 100,000 spawns and must find zero inside.
- **Spawning:** by zone and time of day, in a ring 24–80 m from the player; creatures despawn beyond 128 m.

| Creature | Where and when | Behaviour | HP | Gives |
|---|---|---|---|---|
| Rabbit | Buffer, by day, most near the warren | Grazes; flees at 7 m; can be snared | 6 | Rabbit meat, a small hide, or a live rabbit from a snare |
| White-tailed deer | Buffer and canyon | Grazes in groups of 2–3; bolts at 14 m or at a gunshot | 30 | Venison ×3, deer hide, bone |
| Wild boar | Buffer | Wanders; charges when hurt or approached within 4 m | 45 | Pork ×3, boar hide, bone |
| Puma | Buffer, at night only | Stalks from cover and lunges with a wind-up | 60 | Pelt |

- The puma is rare: one at most.
- The owl's call at dusk is the warning that night is coming (DESIGN.md).

## 4. Hunting and fighting

The pace stays slow and deliberate, with small encounters (DESIGN.md).

- **Melee damage:** fist 2, knife 5, spear 8, axe 7, machete 9.
- **The bow:** hold to draw, release to shoot. The arrow flies with gravity, deals 12–22 by draw, and can be picked up again.
- **The rifle:** a hitscan shot for 45, using one round each. It is loud: deer bolt and nearby creatures notice.
- **Creature attacks:** they telegraph with a short wind-up you can step back from. Boar does 10, puma 16.
- **The pack system** gains `hide`, `bone`, `leather`, `rabbit_raw`, `venison_raw`, `pork_raw` and their cooked forms, and `live_rabbit`.
- **New recipes:**
  - stove: cooked meats;
  - tannery: leather from hide;
  - workbench: a snare, a hutch, leather armour;
  - anvil: arrowheads.

## 5. Rabbits home, and the hutch

- **The snare:** a block set on the ground outside. A rabbit that wanders into it is caught and becomes a live rabbit to carry home.
- **The hutch:** a block like a chest for rabbits. With two or more rabbits inside, it gains a rabbit every in-game day, up to 8.

## 6. Death outside

- In the valley nothing changes: you wake at the bed with everything.
- **Outside:** you wake at the bed with nothing carried. Everything you had waits in a lost pack where you fell, a sack block that opens like a chest. It never despawns. Find it to get your things back.

## 7. Sound for outside

- The buffer's dawn chorus, and the owl at dusk.
- Rustling when an animal bolts, a boar's grunt, the puma's low growl before it lunges.
- The bowstring, and the rifle's crack echoing off the canyon.

## Checks

**Unit tests**
- Zero hostile spawns in the sanctuary over 100k samples.
- Creatures never step into it.
- Arrow flight.
- Damage and drops.
- The gate opens and closes.
- Snare catches.
- Hutch breeding.
- A death outside makes a lost pack holding exactly what was carried.

**Play-through:** swim through the gate, climb to the road, shoot a deer with the bow, cook venison.

## Handoff (2026-11-17): what is built, what is left

Branch `phase3`. The lead session published Phase 2 and handed the rest of this phase to a phase session (AGENTS.md, "Sessions").

**Built and tested** (`tests/wayout.test.ts`):
- **Layout:** `src/gen/layout.ts` has `POCKET`, `GATE`, `GATE_LEVERS`, `TUNNEL_LAMPS`, `POCKET_LANTERN`, `RAMP`, `ROAD`, `PLACES`, and `roadZ`, `roadHeight`, `rampAt`, `onRoad`. `outsideHeight` now cuts the ramp, the road and the warren's bank into `naturalHeight`.
- **Terrain:** `src/gen/terrain.ts` has `buildGate` (air pocket, gate stones, levers, sealed lamps, the pocket lantern), `paveRoad`, `placeBufferPlaces` (the ranger sign and post, the warren's burrows) and the morpho tree at the end of `placeTrees`. Trees stay off the road and out of the clearings.
- **The gate:** `src/sim/gate.ts`, wired into `src/game.ts`:
  - the lever opens it on right-click;
  - `tickGate` handles sound, a camera shake and saving;
  - it closes behind the swimmer, never onto them, and a gate saved open closes on load.
- **Blocks** (`data/blocks.json`, with textures in `src/render/textures.ts`): `gate_stone`, `gate_lever`, `sealed_lamp`, `ranger_sign`, `sign_post`, `snare`, `snare_caught`, `hutch`, `lost_pack`.
  - A block holds things when it has a `container` slot count; `World.containerAt` reads it.
- **Sounds** (`src/audio/audio.ts`): `gate`, `thud`, `bowDraw`, `bowRelease`, `rifle`, `hit`, `rustle`, `grunt`, `growl`, `hurt`.
  - The owl at dusk plays from `update`.
  - The others are written but not yet called.
- **Creatures, logic only** (`src/entity/creatures.ts`, `src/entity/spawner.ts`):
  - kinds, minds, bodies that never enter the sanctuary, `think`, `hurt`, `rayHitCreature`;
  - the spawn table, `trySpawn`, `despawnFar`.
  - They have no tests yet and are not in the game.

**Left to build, in this order:**
1. **DONE: Check the way out by eye.** Take screenshots of:
   - the tunnel at the gate and in the pocket;
   - the ramp from the canyon pool;
   - the road with the ranger sign, the warren and the morpho tree.

   Fix what looks wrong; for example, leg 1 of the ramp leaves a small gully against the wall. Add a journal entry (`data/journal.json`) in the builder's voice that tells where the two marked stones are.

   *Done:* the ramp is now a ledge: between it and the rising wall the ground is filled up to it, so no gully opens on its inner side (test: "is a ledge cut into the wall"). The journal's "The gate" entry tells where both marked stones are. The gate, pocket, road, sign, warren and morpho tree looked right in the screenshots.
2. **DONE: Morpho butterflies and the tower.**
   - Blue morpho particles around the morpho tree by day (`src/render/particles.ts`, like the fireflies).
   - The ridge tower's silhouette in the distant land, at `PLACES.ridgeTower`: a thin lattice mesh with the same fog as `src/render/farland.ts`.

   *Done:* up to 14 morphos circle under the tree's crown from 07:30 to 17:00, flashing blue and brown as they flap (`KIND.morpho`). The tower (`src/render/tower.ts`) is a buckled, X-braced frame with a mast and a hanging dish; its haze is held to 80% so the thin frame still shows from the buffer, where it is a faint mark on the north-west skyline.
3. **DONE: Items, icons and recipes:**
   - Items: `hide`, `bone`, `leather`, `rabbit_raw` / `rabbit_cooked`, `venison_raw` / `venison_cooked`, `pork_raw` / `pork_cooked`, `puma_pelt`, `live_rabbit`, `arrowhead`, `leather_armor`.
   - Icons go in `src/render/itemIcons.ts`.
   - Recipes as in step 4 above. The `drops` in `KINDS` use these names.

   *Done* (`tests/hunting_items.test.ts`). Also: tanning takes a salt with each hide (the pantry has 16); arrows can be made at the workbench from arrowheads, and a bone gives 2 arrowheads there too.
4. **Creatures in the game:**
   - A `Wild` system (`src/entity/wild.ts`) owns creatures and arrows. It runs at 20 Hz from `Game.tick`, spawns and despawns, and calls `think`. A hit on the player applies armour: the vest ×0.7, leather ×0.85, the best one carried. It also plays the sounds.
   - A creature renderer (`src/render/creatures.ts`) draws box models: body, head and four legs that swing with `stride`. It shades them with the block shader's sky, block light and fog uniforms (copy them from `solidMat`), and gives a red flash when hurt.
   - Tests: zero hostile spawns in the sanctuary over 100,000 samples, and a creature pushed toward the valley never enters it.
5. **Hunting.** All shots and blows also check `rayHitCreature` before blocks.
   - **Melee:** a left-click on a creature in reach hits with the held item's damage (fist 2, knife 5, spear 8, axe 7, machete 9). Give a short cooldown.
   - **Bow:** hold the right button to draw (up to 1 s), release to shoot an arrow entity with gravity for 12–22 damage. It uses an `arrow`; an arrow that hits a block stays there, and walking over it picks it up.
   - **Rifle:** right-click fires a hitscan shot for 45 and uses a `rifle_round`. Creatures within 60 m hear it.
   - **Drops:** a kill puts the drops in the pack, or tells you if the pack is full.
   - **Tests:** arrow flight, damage and drops.
6. **Snare and hutch.**
   - A rabbit whose cell is a `snare` turns it into `snare_caught` and is removed. Right-clicking gives a `live_rabbit` and resets the snare.
   - The hutch: on each new in-game day (06:00, or waking), a loaded hutch with 2 or more `live_rabbit` gains one, up to 8.
   - Tests for both.
7. **Death outside.** At 0 HP outside the sanctuary:
   - Everything carried goes into a `lost_pack` placed at the nearest free cell where you fell (its container gets exactly the slots). The pack is emptied and you wake at the bed.
   - Inside the valley nothing changes.
   - Test: the pack holds exactly what was carried.
8. **The play-through.** Extend `tests/e2e/play.mjs`:
   - swim from the valley pool to the gate, pull the lever and pass;
   - reach the road;
   - shoot a deer with the bow (set the scene with `window.__hv`, as the other steps do);
   - cook venison at the stove.
9. **Review.** A fresh reviewer agent that did not write the code checks the branch. Fix what it finds, each bug with a test that fails on the old code. Then message the lead.

**Checks before every push:** `npx tsc --noEmit`, `npx vitest run`, `npx vite build`, and with `npx vite preview --port 4173` running, `node tests/e2e/play.mjs`. Run vitest and the play-through one after the other, never together: the container runs out of memory.
