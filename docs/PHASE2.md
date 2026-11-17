# Phase 2 — Living in the valley, and the billionaire's inheritance

The aim: the full peaceful sandbox. You walk into a furnished home, take the builder's things and live: mine, smelt, craft, farm, fish, cook, eat, drink and sleep. Built in the order below; each step is committed with tests before the next. Progress is marked DONE on each heading.

Step 1 also put the builder's chests in the home (`src/gen/inheritance.ts`), since the inventory needed something to open:
- linen chest with the journal
- tool wall
- stores
- three pantry chests: tins and dry goods, water and coffee, seeds
- armory
- expedition kit

The safe and the furniture follow in steps 2–3.

## 1. Items, inventory, chests — DONE (2026-11-17)

- `data/items.json` holds every item that isn't a placeable block:
  - tools: pickaxe, axe, shovel, hoe, machete, knife, hammer, saw, shears, fishing rod
  - weapons: hunting rifle, compound bow, arrows, rifle rounds. They can be carried now and are used from Phase 3.
  - food: canned goods, rice, beans, honey, coffee, produce, trout (raw and cooked), stew
  - materials: iron ingot, flint, charcoal, sticks, plant fiber, cordage, nails
  - medicine: first-aid kit, bandage, poultice
  - other gear: water jug, water filter, binoculars, headlamp, backpack upgrade, hardware wallet, journal pages
- Blocks are items too, so there is one id space for items.
- A slot holds `{item, count, wear}`. Saves store item *names*, like blocks.
- **The inventory, on E:** the 9-slot hotbar plus 27 backpack slots, or 36 with the vault's backpack upgrade. Click to pick up or put down, Shift-click to move a stack across.
- **Chests** are blocks that keep their contents. The game drops the "builder's books" idea for chests: their contents are just data. The opening screen shows two panels.
- **Tools set mining speed:** pickaxe for stone and ore, axe for wood, shovel for soil. Hand mining is slow. Tools wear out.

## 2. Furniture and shaped blocks

- The mesher gains a **box-model** render type. A block can be made of up to 6 axis-aligned boxes, in 1/16 units, with textures mapped from the box coordinates.
- Furniture is built from these: table, chair, bed, bookshelf, fireplace with chimney, stove, workbench, smelter, kiln, anvil, tannery rack, computer desk, phone, map table, chest, wall safe, steel door, stone railing, slab, stairs.
- **Facing:** the registry expands a `facing` block into four ids.
- **Collision** uses the boxes for slabs, stairs and railings. Furniture is a full block to stand against.
- **Doors** toggle between open (not solid) and closed.

## 3. The home, furnished

`buildHome` places the builder's things from DESIGN.md and docs/PLAN.md ("The billionaire's inheritance"):

| Room | What's in it |
|---|---|
| Balcony | Railing with the north gap, the big stove with its pipe, a solar panel, a bench |
| Living room | Fireplace and chimney, bed, bookshelves (journals), map table, computer, phone, table and chairs, rugs |
| Workshop | Workbench, smelter, kiln and flue, anvil, tannery; a tool wall as a chest of tools |
| Pantry | About 10 days of food in chests, a seed chest, water jugs; the iron vein |
| Vault | Steel door; armory chests (rifle and 40 rounds, compound bow and 30 arrows, machete, vest, 6 first-aid kits, filter, binoculars, headlamp, backpack upgrade); the wall safe (code in the journal) holding the hardware wallet |
| Garden | Planted rows at mixed stages, and the coffee grove |

## 4. Survival — DONE (2026-11-17)

- **Stats:** HP, hunger and thirst, out of 100.
  - Hunger empties in about 40 real minutes and thirst in about 25. They are a little gentler than the prototype's, because the valley is peaceful.
  - At zero, you lose 1 HP every 2 s.
  - HP regenerates when hunger and thirst are both above 60.
- **Drink** from the pool or creek (right-click water with an empty hand), or from a jug.
- **Eat** by holding food and right-clicking.
- **Fall damage** starts past 4 blocks.
- **Death in the valley** (falling, starving, drowning) respawns you at the bed and keeps your inventory. Losing what you carry starts outside, in Phase 3.
- **The HUD** gets three bars over the hotbar.

## 5. Farming, fishing, cooking, crafting

**Farming**
- A hoe turns grass or dirt into farmland; seeds go on it.
- **Crops:**

  | Crop | Stages |
  |---|---|
  | Corn | 4, cross-shaped |
  | Beans | 4, cross-shaped |
  | Squash | 4, cross-shaped |
  | Tomato | 4, cross-shaped |
  | Pepper | 4, cross-shaped |
  | Potato | 4, cross-shaped |
  | Herbs | 4, cross-shaped |
  | Coffee | A bush that ripens red cherries |

- Crops grow on random ticks within 128 m, and need light ≥ 9.
- Harvesting gives produce and seeds back.

**Fishing:** right-click water with the rod. A bobber floats; a bite comes in 4–10 s, and you have 2.5 s to reel in a trout.

**Stations:** recipes come from `data/recipes.json`, with at most 4 ingredients each. A station's menu lists what can be made there and what each recipe needs.

| Station | What it makes |
|---|---|
| Kiln | Charcoal from logs |
| Smelter | Iron ingots from iron ore and charcoal |
| Anvil | Nails, arrowheads and tool repairs |
| Workbench | Tools, planks, sticks, cordage, a spear, chests, a bed |
| Stove or fireplace | Cooked trout, stew, coffee (coffee gives a short speed boost) |
| Tannery | Leather (hides arrive in Phase 3) |

Stations take time to run.

## 6. The builder's life

- **Sleep:** the bed works from 17:00, skips to 06:00, sets your spawn and saves.
- **Bookshelves:** the builder's journal, about 8 entries in his voice. They tell how he found the valley, why he built here and what he left, and include the safe's code.
- **Computer:** a wallet screen showing the builder's balance and the hardware wallet's once found, plus his notes.
- **Phone:** a list of the builder's dead contacts. Marco appears in Phase 4.
- **The map table** shows the map, filled in as you explore.

## 7. Builder's tools

- Builder's mode (G) gets fly and infinite blocks.
- **Structure export:** mark two corners, then "Copy structure", which copies JSON in the format the generator stamps. This is for laying out rooms by hand.

## Checks

**Unit tests**
- Inventory moves and stacking.
- Crafting needs and gives the right items.
- Chests keep their contents through a save.
- Crop ticks.
- Hunger and thirst over time.
- The safe code matches the journal.
- The box-model mesher.
- The home holds every item on the inheritance list.

**Play-through:** open the pantry chest, eat, mine iron, smelt it, craft, plant, sleep, and check that the crop grew.
