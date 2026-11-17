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
