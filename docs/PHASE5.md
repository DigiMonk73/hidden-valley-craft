# Phase 5 — Zone-1 mid and deep bands

The aim: this is DESIGN.md's MVP, in blocks. The old road runs on past the farm, downhill into shadow:
- **The outpost:** the raiders' outpost, where the smoke seen from the saddle rises. Three raiders hold it: the game's first human fight, small and slow. Clear it once and it stays clear. Its back room holds the rifle, the ammunition, the bowstring, the arrowheads and the forge.
- **The hunting camp:** off a marked trail to the north, a jaguar crosses the clearing once and looks at you.
- **The old mine:** better iron and coal.
- **The road's end:** the road dies at a broken bridge over a ravine. On the far bank lies a body that no raider made. On your side are prints that are neither paws nor boots.

Bringing home what these places give completes **M2, the homestead expansion**.

Each step is committed with its tests and marked DONE here.

## What the owner taught us

Simple, short, well lit, easy to find. So in this phase:
- Every place is on the road or at the end of a short, clear trail, with a landmark you can see from the road and a light at night.
- A toast says what can be done there, the first time.
- Nothing is hidden in the dark or made to look like everything round it.

DESIGN.md says the hunting camp is "easy to miss". The owner wants it findable, so it keeps its own trail off the road, but the trail head has a marker you can't miss.

Distances are about half DESIGN.md's walking times (docs/PLAN.md, "Feel numbers"). The outpost stays where Phase 4 put its smoke (x 860).

| From the saddle (x 1150) | Distance |
|---|---|
| The outpost | 290 m |
| The old mine | 320 m |
| The camp's trail head | 350 m, then 45 m north |
| The broken bridge | 490 m |

## 0. First: the swim out of each mouth (DONE)

A swimmer reaching either mouth stopped at the floor until they swam up with Space.
- **The cause:** the water in front of each mouth was 4 blocks deep, then met a 2-block step up to the pool's bed. The swimmer could only step up one block at a time, so they stuck there with their head under water.
- **The fix:** under the two curtain columns the water stays deep, down to the tunnel floor. Beyond them the gravel floor climbs one block per block to a ledge just under the surface (`basinFloor` in `src/gen/layout.ts`). Holding forward now carries the swimmer up step by step until their head is out. Both ways stay well inside one breath (`tests/river.test.ts`).
- **The lead's extra:** `groundAt` now takes the lowest open spot that is not below the land's own height. It never uses the top of a roof, coop, chest, fence or wreck, so Marco can't be put on the bus shelter's roof again (`tests/phase5.test.ts`).

## 1. Places (layout: `src/gen/layout.ts`; blocks: `src/gen/zone1far.ts`)

The road now runs from x 940 on to **x 660**, where it dies at the bridge (DESIGN.md: "the spine dies at the crumbled bridge"). Positions are along the road.

| Place | Where | What is there |
|---|---|---|
| **The raider outpost** | x 852–868, south of the road | A one-storey cinder-block shop (*tienda*): front room, back room, flat roof and a lookout platform on it. Out front: sandbags, an oil-drum cookfire (the smoke column), a faction flag, and a stripped pickup on the road's north shoulder as cover. Tin sheets over the windows. A sign "TIENDA" faded above the door. Two lanterns at the door, lit. |
| **The brush** | a band of thick, low bushes from the road at x 900, curving south and round to the outpost's back | The stealth flank. It hides you from the lookout, who watches the road to the east. At the back wall, supply crates are stacked as steps up to the roof. |
| **The old mine** | x 830, south of the road | A timbered adit with a "MINA" board and a lantern. A lit shaft slopes down about 16 blocks to a chamber whose walls are thick with iron and coal. |
| **The hunting camp's trail head** | x 800, north side | A tall post with antlers, a lantern and a board ("COTO DE CAZA", a hunting reserve). A dirt trail, two wide, runs 45 m north to the clearing. |
| **The hunting camp** | clearing x 780–816, z 958–988 | A log lodge (two rooms, a lantern in the window) with the framed photo inside. An open drying shed with cured hides on racks. A skinning rack, an archery butt, snares along the edge, a rusted leghold trap by the shed, and jaguar tracks in the mud. |
| **The deep band** | x 760 → 660 | Dense, dark forest close round the road, moss and mud, pools of standing water by the road near the bridge. |
| **The broken bridge** | the ravine at x ≈ 615–657 | A sheer gorge 42 m wide and about 40 deep. On the near side, the concrete abutment and two deck sections stick out over the drop, ending in rebar. On the far side, the far abutment and a stub of deck. |
| **The body** | far bank, 18 m past the drop, in the natural line of sight from the deck's end | Pale clothes, twisted, a wide patchy pale stain round it. No wound. |
| **The tracks** | near bank, crossing soft ground 10–20 m north of the road's end | Two-legged prints, neither paws nor boots, half under leaf litter. Never near the body. |

- **The ravine** used to be a slope 16 m wide. At the road it is now a sheer gorge, so it reads as "past here is past this zone" (DESIGN.md: "no climbable descent"). It eases back into the old slope 80 m north and south.
- **The mid band** is shadowed and cleared round the outpost: no trees within 30 m of it but the brush. **The deep band** has the densest trees, so it is the darkest.
- **Ore:** the mid band's rock below y 72 has twice the coal and iron, and the mine's chamber is lined with both (DESIGN.md: "deeper caves with better iron and coal").

## 2. People and creatures (`src/entity/`)

| Kind | Where | Behaviour | HP | Gives |
|---|---|---|---|---|
| **Lookout** (rifle) | on the outpost's roof platform | Watches the road to the east (a 140° view, 45 m). Seeing you for 0.8 s, he shouts and the outpost is alerted. Then he aims: a **glint** at his scope and a bolt's click, **1.5 s** of aim, then the shot. 18 damage. He stays on the roof. | 40 | his rifle, rifle rounds ×10 |
| **Pistol** raider | behind the sandbags | Sees you within 25 m all round. Aims 1 s (a click and a raised arm), fires: 12 damage. Keeps behind his sandbags. | 40 | pistol, pistol rounds ×8 |
| **Machete** raider | in the doorway | Alerted, he runs at you. He raises the machete for 0.7 s before the blow: 14 damage. | 45 | machete |
| **Jaguar** | the hunting camp, once | Walks across the far end of the clearing, stops and looks at you for 2 s, then is gone into the trees with a sawing call. If you shoot it, strike it, or come within 8 m while it is there, it fights: like the puma, but stronger. | 90 | jaguar pelt |

**The fight's rules:**
- **Small, slow and telegraphed.** Every shot comes after an aim you can see and hear: the lookout's glint, a click, a raised arm. A shot lands only if the raider can still see you when it fires, and less often the farther you are and the faster you move. **Cover works:** a solid block between you and him stops the shot. The first time a lookout aims, a toast: *"A glint on the roof: he's aiming. Get behind something solid."*
- **Stealth works.** Raiders who haven't seen you don't know you are there. A blade blow (knife, machete or spear) on a raider who hasn't seen you is a **silent takedown**: he dies without a sound and the others are not told. An arrow in an unalerted raider does three times its damage. A gunshot alerts the whole outpost.
- **One time only.** Each raider killed stays dead (saved as `outpost`). When the last falls: *"The outpost is quiet. Search the back room."* The raiders never come back.
- **Their weapons:** 1 rifle and 1 pistol, as DESIGN.md says. The rifle is the lookout's own (`raider_rifle`): worn, no scope. With the inheritance's rifle and the scout's pistol, the player now has two of each. *Why:* DESIGN.md's loot list. The spares matter when a death outside leaves your pack lying where you fell.
- **The sanctuary rule** holds for both new kinds: no spawn, path, target or knock into the valley, at any depth, with a test for each.

## 3. Focus mode (`src/sim/focus.ts`)

- **What it does:** with a gun or bow in hand, press **Q**. For up to 4 s the world runs at a quarter speed while you aim at full speed, with a dark vignette and a low hum. Then focus needs 12 s to come back; the HUD shows a small bar.
- **The first time** you carry a gun or bow into the mid band, a toast explains it.
- **Why Q and not F:** F is flying (the builder's mode).
- **Why so simple:** DESIGN.md asks for "time-slow, pick shots" and keeps it optional. A slower world gives the pick without a targeting screen, and it fits the slow, deliberate pace.

## 4. Items, blocks and recipes (`data/*.json`)

**Found**
- From the outpost's crate: rifle rounds ×20, pistol rounds ×16, bowstring ×3, arrowheads ×24, nails ×24.
- `forge_parts`: forge-upgrade parts (a hand-crank blower, firebricks, a crucible). Mine the raiders' forge in the back room and you get them: *"the back-room forge comes too"*.
- From the camp: the lodge chest (arrows ×12, snares ×2, cordage ×6, a hunting knife) and cured hides (each rack mines to leather ×2).
- The leghold trap: right-click it to learn how it's made.
- From the farm: an old apple tree by the barn. Right-click it to take a grafting slip.
- From Marco: quinoa seed.

**M2's recipes** (DESIGN.md, "M2 recipes", in this game's terms)

| Station | Makes | From | Why |
|---|---|---|---|
| workbench | hunting bow | stick 3, bowstring 1 | DESIGN.md's bow: a stave and outside-sourced string. Cordage can't stand in. |
| workbench | smoker | cobble 6, planks 4, nails 6 | stone firebox, plank chamber, hardware |
| workbench | jerky rack | planks 3, cordage 2 | a light wooden frame |
| workbench | forge, and a tool rack with it | stone bricks 4, planks 6, nails 8, forge parts 1 | the workshop extension: 4 slots, outpost-gated |
| workbench | leghold trap | iron ingot 2, nails 4, cordage 1 | only once learned from the camp's trap |
| workbench | raised bed ×2 | planks 2, cordage 1 | the expanded garden: farmland you can place |
| forge | iron ingot ×2 | scrap metal 3, coal 1 | better heat: more iron from scrap |
| forge | arrowhead ×8 | iron ingot 1 | the anvil makes 6 |

**Preserving food** (DESIGN.md's timed processes, as containers like the coop):
- **Smoker:** put raw meat and wood (logs, planks or charcoal) in. Every 4 game hours, one piece of wood smokes up to 4 pieces of meat.
- **Jerky rack:** put raw meat in. At each dawn it has turned to jerky. No fuel.
- **Why bother:** smoked meat and jerky fill more and stack to 32. There is no spoilage in this game, so DESIGN.md's "preserved" means good trail food here.

**The garden** (DESIGN.md's expanded garden):
- **Quinoa** (from Marco) and the **apple slip** (from the farm) are new crops.
- The apple is a perennial: picked when ripe, it goes back a stage and fruits again, like coffee.
- **Raised beds** are placeable farmland.

**Traps:** the snare (Phase 3) and the leghold.
- A deer or boar that steps in a leghold is held for 60 s.
- Like the snare, a trap can't be set inside the valley (ADR-020). The refusal shows when you try to place it.

## 5. The deep band's signals

- **The body:** the player can't search it. If you build across and right-click it: *"You don't touch it."* It is drawn so that from the bridge it reads as human (pale clothes, a bone-white arm) and as "not shot": no wound, twisted, a wide patchy pale stain.
- **The stinger:** the first time each visit that the body comes into view, a distant, organic, wrong sound plays. It is one of 4 variations from the same family, picked at random.
- **The tracks:** on the near bank only, in mud with leaf litter half over them.
- **No enemies, no loot**, as DESIGN.md says. Toasts: *"The deep band. Danger 4. Nothing moves, and the birds have stopped."* At the bridge: *"The bridge is gone. Across the ravine, something pale lies in the undergrowth."*
- **The far side holds nothing more until Zone-3 (Phase 7).** It is dense forest, the body and a stub of road. Nothing spawns there yet, and the body can't be searched.
  - A player who builds across finds: *"Zone 3. The forest is silent here."*
  - *Why:* DESIGN.md keeps the deep band "signal, not content" and gives Zone-3 its own design pass. Putting the Ashen there now would spend Phase 7's reveal early. An empty far side keeps the dread without contradicting what Phase 7 builds.

## 6. M2: the homestead expansion (`src/sim/milestones.ts`)

The computer lists M2's steps with ticks under M1:

| DESIGN.md | Here: done when |
|---|---|
| Chicken coop | a coop has laid eggs |
| Rabbit hutch | a hutch has bred a rabbit |
| Workshop extension | you have made the forge |
| Food preservation | you have taken jerky or smoked meat from a rack or smoker |
| Bow (outside string + arrowheads) | you have made a hunting bow |
| Trap variants | you have learned the leghold from the camp |
| Expanded garden | you have planted quinoa or the apple slip |

- **Also tracked:** clearing the outpost, the run DESIGN.md's M2 hangs on, is listed as its own line.
- **When all are done:** a toast (*"M2 · the homestead expansion. The valley is bigger for what you brought home."*) and a page in your notes.
- **The balcony bench** (M2's drip) is already there from the inheritance, so it is not a step.

## 7. Sound (made in code)

- **Raiders:** a shout as they're alerted, a bolt's click as they aim, their shots (the rifle a deeper crack than the pistol), a bullet's zip past you and a ricochet off cover, a machete's swing.
- **The jaguar:** a sawing call.
- **The deep band:** the stingers.
- **Ambience by band** (DESIGN.md's audio gradient):
  - **Mid:** wind, a distant metal creak, and a raider's voice now and then while the outpost is held.
  - **Deep:** silence, thinner wind, the odd wrong noise far off.

## 8. The play-through (`tests/e2e/play.mjs`)

Set each scene with `window.__hv`, holding the view steady in each wait:
1. walk to the outpost; the alert, the glint, cover;
2. win the fight (a silent takedown of the lookout from the roof, then the other two); the outpost is cleared and stays so after a reload of the scene;
3. loot the crate and mine the forge parts; make the forge at the workbench;
4. find the camp from its marker; the jaguar crosses;
5. reach the broken bridge and see the body's toast.

## Checks

**Unit tests**
- Zero raider or jaguar spawns in the sanctuary, and none walks, aims or is knocked in.
- The road reaches the bridge with no step over one block. The ravine is sheer at the road and 40 m wide or more.
- The outpost, mine, camp and bridge are built. Each has a light, and the camp's trail is clear.
- **A shot:** lands only with a clear line of sight, misses through cover, and never fires before its aim time.
- **Stealth:** a silent takedown alerts no one; a shot alerts all.
- **One time:** the outpost stays cleared across a save.
- **Focus:** slows the world to a quarter for at most 4 s, then recharges.
- **M2:** the new recipes resolve. The smoker and jerky rack convert on time. The leghold is refused in the valley. Each of M2's steps ticks.
- Old saves load: new fields default.

**Screenshots** from a first-time player's eye, each with how they find it:
- the outpost from the road;
- the glint;
- the camp's marker;
- the jaguar;
- the bridge and the body.

## Build order

1. The plan (this file).
2. The road, the ravine and the places, with blocks and textures.
3. Items, recipes and icons.
4. Raiders and the fight, stealth and focus.
5. The camp and the jaguar.
6. The deep band's signals and the sounds.
7. M2: preservation, garden, traps, the forge and the milestone.
8. The play-through and screenshots.
9. A fresh review, with fixes and a test for each. Then message the lead.

## Progress

- **DONE: Step 0, and the lead's extra** (see 0 above).
