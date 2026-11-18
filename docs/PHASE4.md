# Phase 4 — Zone-1 near band

The aim: the first real danger, and the first person. Walk the old road up to the saddle and see Zone-1 below: a farm roof, a smoke column far off, dark forest at the horizon. Past the saddle, meet Marco at a lit bus shelter and trade with him in Bitcoin; find a raider scout shot dead on the road and take his pistol; at the farmstead, face a pack of feral dogs, search the barn, and catch a pair of chickens for a coop at home. Coming home alive closes **M1, the first outside run**.

Each step is committed with its tests and marked DONE here.

## What the owner taught us in Phase 3

The owner found getting out "too complicated". So in this phase everything the player needs is **easy to find**:
- every place is on the road or on a short, visible track off it;
- the bus shelter is lit all night, and the dead scout's dropped lamp still burns beside him;
- a toast says what can be done at each place, the first time you arrive ("Right-click to search him", "Walk up and right-click to catch one");
- nothing is hidden: no levers, no searching in the dark, nothing that looks like everything around it.

Distances are about half DESIGN.md's walking times (docs/PLAN.md, "Feel numbers"). From the saddle: shelter 38 m, the scout 60 m, the farm's gate 72 m, the farmyard 85 m.

## 0. First: the floating rock cubes

The Phase 3 sessions saw a few floating rock cubes in the canyon-floor view. Find out why, fix it, with a test that fails on the old code. *(Investigated before this plan: a flood-fill scan of the whole canyon finds no unsupported block in the generated world, on `main` or at the Phase 3 merge; see step 1's notes for what was found.)*

## 1. Places (layout: `src/gen/layout.ts`, `src/gen/zone1.ts`; blocks: `src/gen/terrain.ts`)

Positions are along the old road, which now runs on from x 1100 to **x 940**, past the near band's west edge (`ZONES.nearX` = 950).

| Place | Where | What is there |
|---|---|---|
| **The saddle** | x 1150, on the road | The road tops out between two knolls (the "two small ridges"). A Spanish farm sign ("FINCA", faded) and a cattle grid across the road. The first time: a toast names the danger. |
| **Marco's bus shelter** | x 1112, north side of the road | A roof on four posts, a bench, a timetable sign ("PARADA") and **a lantern under the roof, lit all night**. Marco's number is scratched on the timetable. |
| **The M1 corpse** | x 1090, on the road | A raider scout lying face up, a bullet wound in his chest. His tipped-over lamp burns beside him. |
| **The farmstead** | south spur: gate at x 1078, yard at about (1070, road + 40) | A broken cattle gate and the family's name-board at the junction, a dirt track south. The collapsed house (the dogs' den), the barn, the collapsed coop, a sagging laundry line. |
| **Salvage** | the farm and the road on west | A rusted pickup truck on the shoulder at x 1036, a scrap heap by the barn, wire fences along the track and the yard. |
| **The smoke column** | x 860 (the mid band's outpost, Phase 5) | A thin grey column of smoke rising from the trees, drawn far off like the radio tower. Not reachable yet. |

- **Saddle shape:** a low crest across the road (+4 m at x 1150) and two knolls 34 m either side (+16 m). *Why:* the land there was flat; DESIGN.md wants a pass the road "curves through" and a reveal on topping out.
- **The near band is open, semi-feral farmland:** grass instead of forest floor, and a third of the buffer's trees, so the saddle's view reaches the farm roof. *Why:* DESIGN.md, "Near band — higher, brighter, more open".
- **Ore:** coal, iron and copper already occur underground outside the valley. In the near band their upper limits rise by 12 m, so road cuts and hollows show them. *Why:* "iron, coal and copper" must be findable here without a long dig.

## 2. Items, blocks and recipes (`data/*.json`, icons in `src/render/itemIcons.ts`)

**Found items**
- `pistol` and `pistol_rounds` (the scout has 6). A hitscan shot for 30, every 0.5 s, 60 m. Never crafted (ADR-019).
- `map_scrap`: right-click to read it. A ridgeline, a road curve, an arrow, and *Las Cruces* in pencil.
- `armband`: a red band with a small white broken circle. "The same mark will be on whoever sent him."
- From the barn: `wire_mesh`, `canvas`, nails (the "hardware"), planks (the "lumber"), and a shovel and a hammer.

**Salvage blocks**, mined with a pickaxe:
- `scrap_heap` and the truck (`truck_body`, `truck_cab`, `truck_wheel`) give `scrap_metal`.
- `fence_wire` gives `wire`.

**Livestock**
- `live_chicken`, `egg`, `feather`, `chicken_raw` / `chicken_cooked`, `egg_cooked`.
- The `coop` block: like the hutch, a box with 9 slots.

**Recipes**
| Station | Makes | From | Why |
|---|---|---|---|
| workbench | coop | planks 6, wire mesh 2, nails 8 | DESIGN.md: lumber + wire mesh + hardware |
| workbench | wire mesh 1 | wire 4 | salvage feeds the coop |
| smelter | iron ingot 1 | scrap metal 2, coal 1 | salvage feeds the forge |
| stove | roast chicken, cooked eggs (2) | chicken; 2 eggs | |
| workbench | arrow 4 | stick 2, arrowhead 4, feather 1 | DESIGN.md's arrow (shaft + head + feather) beside the old fibre recipe |

## 3. Creatures (`src/entity/`)

| Creature | Where and when | Behaviour | HP | Gives |
|---|---|---|---|---|
| Feral dog | The farmhouse den: a pack of 3 | Lie up in the house. When you enter the yard they bark and come out, then **flank**: each takes a side (left, right, behind) before closing. At night they range out to 30 m from the den instead of 12. | 22 | hide, bone |
| Coyote | Near band, at night only, packs of 2–3 | Roam; trot in on the player within 30 m and flank like the dogs. Gone by day. | 16 | hide |
| Chicken | Round the farmyard by day, up to 6 | Peck and scratch; run off at 4 m, but slower than you. **Walk up and right-click to catch one** (a `live_chicken`); a blow kills it. | 4 | chicken, feather |
| Marco | At his bus shelter, by day, once a meeting is arranged | Stands, turns to face you, never fights. | — | — |

- **Fights stay small (1–3) and telegraphed.** Every hostile blow comes after a wind-up you can step back from: the pose (head down, trembling) and a growl or snarl. Dogs do 8, coyotes 6.
- **The flank:** each pack member is given a side, a point 4 m from the player at its own angle. It circles to that point, then closes and winds up. So a pack comes from two or three directions, not in a line.
- **The den is one pack.** Dogs killed stay dead (saved). Once all 3 are dead the farm is quiet. *Why:* like the outpost (DESIGN.md: a cleared place stays cleared), and it keeps the farm a place you can come back to for chickens.
- **The sanctuary rule holds for all of them**: nothing spawns, walks, targets or is knocked into the valley. Marco is a person, not a hostile, but he also never enters the valley: nobody knows it is there. Tests cover every new kind.

## 4. People: Marco (`src/sim/trade.ts`, `data/people.json`, `data/trade.json`)

- **His look** (original, simple box model): a straw hat with a wide brim, a woven poncho in brick red with ochre and cream stripes, dark trousers, boots, a canvas shoulder bag.
- **How you meet him** (DESIGN.md left this open):
  1. Reach the bus shelter: a toast says Marco's number is scratched on the timetable, and **the builder's phone now has his contact**.
  2. At the phone, **Call Marco**: he agrees to meet at the shelter, by day.
  3. By day, he is there, under the lit roof. If you call at night he comes in the morning.
  4. Walk 60 m away and the meeting is over; call again for the next.

  *Why:* the phone and the shelter are the script's two halves of this (DESIGN.md: arrange meetups by phone; the shelter is the meetup point), and a toast at the shelter means nothing has to be found.
- **Talking:** right-click Marco. He says a line (first meeting, or later meetings), and the trade screen opens.
- **Trading** goes both ways, in Bitcoin, from the hot wallet (the computer's and phone's single wallet, DESIGN.md A1):
  - **buy** from his catalogue: salt, cordage, nails, rice, canned food, bandages, wire mesh, canvas, lantern and arrowheads. No guns or ammunition before M3 (DESIGN.md M3 row 8);
  - **sell** him anything in the price table at **half** its price (DESIGN.md A3): hides, pelts, leather, meat, eggs, feathers, scrap metal, wire, copper, coal, iron and more.
  - Prices live in `data/trade.json`, in satoshis. They are relative to one unit, the price of a bandage. *Why:* the script anchors every price to wound care, and a bandage is this game's wound care before Doc.
  - The hot wallet starts at 0.05 BTC and is saved. The computer shows the balance as it changes.
  - The cold wallet's 2.5 BTC stays cold: Marco is paid from the phone. *Why:* a fortune spendable on day one would end the economy. Moving coins from cold to hot is for later.
- **Trust 1:** the first trade (buy or sell) sets Marco's trust to 1 (DESIGN.md M1 row 2: "validated after real-world meetup"). The phone shows it.

## 5. The M1 corpse

- Right-click him: his pockets open like a chest, holding the **pistol**, **6 pistol rounds**, the **map scrap** and the **armband**.
- **The lore beat**, on first opening: a toast, and a new page in **your own notes** (the journal gains a second voice after the builder's entries):

  > *A raider scout, shot from the front, a day or two ago. He was walking out toward the saddle. A red armband with a white broken circle. Someone sent him, and someone out here shoots back. His map shows a ridge, a bend in a road and a name in pencil: Las Cruces.*

## 6. The farmstead, chickens and the coop

- Entering the yard: the dogs bark inside the house and come out. A toast: *"Dogs! Step back when one crouches to spring."*
- **Chickens:** a toast the first time you are near them: *"Feral chickens. Walk up close and right-click to catch one."* Catching needs a free slot.
- **The coop:** made at the workbench, placed anywhere (the valley floor, by the garden, is the script's place). Put chickens in it like a chest. Each morning a coop holding **two or more chickens** lays one egg per chicken, up to 8 eggs waiting, and now and then a feather. Like the hutch, it works while its chunk is loaded.
- **The barn:** two crates with the coop's materials and tools.

## 7. M1: the first outside run (`src/sim/milestones.ts`)

DESIGN.md's M1 has four unlocks, all narrative, with no new recipes. In this game:

| DESIGN.md | Here: done when |
|---|---|
| Gate ritual mastered | You have swum out through the gate and back in. |
| Marco trust 1 | You have traded with Marco. |
| Safe extraction route known | You have reached Zone-1 and come home to the valley alive. The road home is drawn on the map table from then on. |
| One looted firearm | You have taken the scout's pistol. |

- The computer lists the four with ticks, so the player can see what is left.
- When the last one ticks: a toast (*"M1 — the first outside run. You went out, and you came home."*) and a page in your notes.

## 8. Night and sound

- Danger 2 in the near band, 3 at night: the coyotes are the night's +1, and the dogs range wider.
- New sounds, all made in code: dog bark and snarl, coyote yips, chicken clucks, the pistol's shot, Marco's greeting whistle. The near band's thinner birdsong carries a far-off cluck or bark (DESIGN.md's audio gradient).

## 9. The play-through (`tests/e2e/play.mjs`)

Set each scene with `window.__hv`, as the earlier steps do, holding the view steady with a heading re-set in each wait:
1. walk the road to the saddle and get its toast;
2. reach the bus shelter: the phone gains Marco;
3. call Marco from the phone, go back by day, talk, buy one thing and sell one: the wallet changes;
4. search the scout: the pistol is in the pack, and the notes page is there;
5. catch two chickens at the farm, make a coop at the workbench, put them in, sleep: eggs in the morning;
6. home alive: M1 shows done.

## Checks

**Unit tests**
- Zero hostile spawns in the sanctuary over 100,000 samples, with the new kinds; dogs, coyotes and Marco never step in.
- The road reaches x 940; the shelter's lantern is lit; the scout and his lamp lie on the road.
- The flank: three dogs end up on different sides of the player.
- Trading: buying takes the price and gives the item; selling gives half; no sale beyond the wallet; prices all resolve.
- The corpse holds exactly the pistol, 6 rounds, the map scrap and the armband.
- Catching a chicken; a coop with two lays eggs on a new day; one with one does not.
- M1 ticks in each of its four ways.
- The floating-cube fix.

**Screenshots** from a first-time player's eye: the saddle's view, the shelter at night, the scout at night, the farm from its gate, Marco by day. Each with a step-by-step note of how a new player finds it.

## Progress

- **DONE: Places** (`src/gen/zone1.ts`, `tests/zone1.test.ts`). The saddle is a crest between two limestone knolls; the near band has grass and few trees, so from the saddle the barn's roof, the shelter and the smoke column all show at once. The tin roof sits on the posts as a bottom slab.
- **DONE: Items, recipes, icons.** Also a feather recipe for arrows. Smelting scrap takes coal or charcoal.
- **DONE: Creatures** (`src/entity/`, `tests/nearband.test.ts`). The 100,000-try sanctuary test now samples the whole road out to Zone-1 and the den, and finds none inside. The "driven toward the valley" test covers every kind, Marco included.
- **DONE: Marco, the phone and trading** (`src/sim/trade.ts`, `data/trade.json`, `data/people.json`). The hot wallet is saved (`wallet` in the save); the den's count too (`den`).
- **DONE: The corpse and the notes.** The journal opens at your newest notes once you have some.
- **DONE: Chickens and the coop** (`src/sim/livestock.ts`).
- **DONE: M1, toasts and the map** (`src/sim/milestones.ts`). The computer lists M1's four steps with ticks; the map table draws the road home in red once Zone-1 has been reached and left alive, and marks the shelter, the scout and the farm once found.
- **DONE: Sound and the smoke column** (`src/render/smoke.ts`): rising block puffs, drifting east with the wind.
- **Fixed on the way:** a creature behind tall grass or a fern could not be struck, shot or caught: the sight line stopped at the first plant. It now passes plants and stops only at solid blocks (`clearShot` in `src/sim/hunting.ts`, with a test).

## Build order

1. The floating cubes. 2. Places and blocks. 3. Items, recipes, icons. 4. Creatures. 5. Marco, the phone and trading. 6. The corpse and the notes. 7. Chickens and the coop. 8. M1, toasts and the map. 9. Sound and the smoke column. 10. The play-through and screenshots. 11. A fresh review; fixes, each with a test. Then message the lead.
