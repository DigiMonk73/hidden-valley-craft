# The home, rebuilt

The owner's notes (2026-11-19): "in the cave we need the fire place to be more grand, the stove to look more like a larger cooking stove, a bedroom section, better furniture, a true patio furniture situated correctly on the balcony". The plan was the review's ([REVIEW.md](REVIEW.md), "The home redesign"; sketch `review/home-proposed.png`), approved as a whole. This page says what was built, where it differs from that plan, and why.

Built on branch `home`. The code is `src/gen/home.ts` (what stands where), `data/blocks.json` (the new blocks) and `src/render/textures.ts` (their textures).

## What is there now

Positions are blocks (x east, z south); the floor is y 82.

**The mouth.** A dressed-stone pier stands either side (x 1801, z 1015–1016 and 1031–1032). The opening is now the mouth itself, 14 wide and 7 high, with the ends of the ceiling beams showing in it.

**The living room** (shell unchanged):
- **The hearth**, on the north wall, five wide:
  - a firebox three wide and two high, set one block back into the rock and lined with firebrick;
  - a log fire in the middle with a bed of embers either side;
  - stone jambs, a timber mantel with a shelf (a clock, two candles, a painting of the valley over it), a stone chimney breast to the ceiling;
  - a raised hearthstone two deep, and firewood stacked either side under a wall lamp.
- **The chimney** runs up through the rock as brick and comes out on the plateau as a stone stack with a clay pot, 4 blocks tall, with smoke.
- **By the fire:** a three-seat sofa facing it, a leather armchair either side, a low table (a book, a mug), on a fitted rug with a border.
- **Four ceiling beams** across the room, lanterns hung from them.
- **Dining:** a table for four by the mouth, and a sideboard on the south wall behind it.
- **The desk** on the east wall: a lamp, the computer, the phone, and a chair.
- **The library** in the south-east corner: bookshelves four high (the journal), and an armchair to read in.
- **The map table** by the hall.

**The bedroom** (new; 9 by 8, south of the living room, through a double wooden door at x 1806–1807):
- lime-plastered walls over a board skirting, two beams, a plank floor and a fitted blue rug;
- **a window four wide and two high** through the cliff at x 1801, in a dressed-stone surround, with a cushioned seat in its recess;
- **a double bed** (2 by 2), head to the east wall, a nightstand and lamp either side;
- **two wardrobes** on the south wall (the first holds what the linen chest held), and an empty blanket chest beside them;
- a washstand and mirror, and a reading chair by the window.
- **Sleeping** in any of the bed's four blocks works as before. You wake at the foot of the bed, facing the window and the valley, and that is where you wake from then on.

**The balcony** (footprint unchanged):
- **The kitchen** at the south end, back to the rock:
  - a cast-iron range three wide (oven, firebox, warming oven) with a brass rail, a pot and a kettle on it;
  - a copper hood over it and a flue up the cliff to a cap, with smoke;
  - a stone counter with a basin along the south railing, and firewood.
- **The patio table** and four chairs near the range.
- **Two deck loungers** at the railing facing the falls, a small table between them.
- **A bench** against the rock north of the mouth; **a lantern on a post** either side of the gap where the path leaves; **the solar panel** on a post in the south-west corner.
- **Left empty on purpose** (`HOME_FIT.reserved`): over the kitchen for the rain awning (M3), the north-west railing for the planter boxes (M4), and a spot by the south-west railing for the telescope (M5).

**Hall, workshop, pantry, vault** (shells unchanged):
- The hall has a runner and wall lamps.
- The workshop and pantry are lit: lanterns on chains, so the light reaches the floor of a tall room, and wall lamps.
- The vault is lined with dressed stone, so the iron vein no longer shows in its wall.
- Their chests and stations are where they were.

**Cooking** works at any part of the range and at the hearth (fire, embers or flames).

## What changed from the plan, and why

| The plan | What was built | Why |
|---|---|---|
| The living room open to the balcony along its whole west side (18 wide) | A stone pier either side; the mouth is 14 wide | The range was drawn "against the rock", but that spot backed onto the open living room. The piers give the kitchen a wall, frame the view, and make the mouth read as built. |
| Jambs three high, mantel at y 85 | Jambs two high, mantel at y 84, breast above | The wall there is five high. A lower mantel leaves two rows of breast for the painting, and the shelf sits just above head height. |
| A raised hearth one deep | Two deep, running into the firebox opening | The fire sits behind it at the same height, so it is seen whole from the sofa. |
| A mantel as one block | A timber beam, a shelf in front of it, and things on the shelf | A shelf with a clock and candles is what makes it a mantelpiece. |
| Hood directly on the range (y 83) | Hood one block up (y 84), a pot and a kettle between | You see the cooktop and what is on it. |
| Flue to y 94 | Flue to a cap at y 91 | The rock overhangs the balcony from y 94. The cap stands two blocks clear of it and the smoke leans out west. |
| Counter x 1797–1799 and the range's oven at z 1033 | The oven is the north block (z 1031); the warming oven is at z 1033, beside the counter | The counter would have stood in front of the oven's door. |
| Bedroom 10 by 8, window 2 by 2, wall 2 thick | 9 by 8, window 4 by 2 | A bigger window is what "wake to the valley" needs: from the foot of the bed it fills a third of the view. A smaller room looks furnished. |
| Rock walls in the bedroom | Lime plaster over a board skirting | Plank or rock walls were dark and all one colour. Plaster is pale, takes the lamplight, and sets the built room apart from the cave. |
| A wooden door, shut | A double door, standing open | An open door shows the lit bedroom from the living room: easy to find. Right-click shuts it. |
| Wardrobe 2 by 2 holding the linen | Two wardrobes, each one wide and two high; the first holds the linen | Each is one container. Clicking either half opens it. |
| Loungers' table at the railing (x 1793) | Between the loungers' heads (x 1794) | Within reach of both, and lower in the sunset view. |
| Rug as thin blocks on the floor | Rugs fitted into the floor, nine pieces with a border | Furniture stands on the rug instead of in holes cut in it. |
| Six wall lamps | About thirty lamps and lanterns | A test now holds every indoor floor a player can stand on to light 8 or more at night; six lamps did not reach. |
| `fire` as a cut-out block | The fire is a block of logs and embers, with sheets of flame above | It needs no special drawing code beyond "this face is lit from within". |
| Old saves: bump the save version | The save carries a `layout` number instead (`WORLD_LAYOUT` in `src/save/save.ts`) | The version says how to read the file; the layout says which world it belongs to. A valley from before this starts fresh with one line: "This valley was made by an earlier build. A fresh one has been started." A save code or file from before is refused, and the valley in the browser is left alone. |
| Optional: tool rack, stone bench, shop shelves, a gun rack | Not built | The shop shelf is rusted metal from the ruins and looks wrong at home; the rest was left for Phase 9's dressing pass. The lighting and the vault's lining were done. |
| Optional: sitting in a chair | Not built | A change to the camera and the keys in `src/game.ts`, which the review's fixes are about to split. |

## How the furniture is made

- **A block can give each of its boxes its own texture** (`boxTex` in `data/blocks.json`, in the boxes' order; `null` means the block's own). So a sofa is a walnut frame with linen cushions, a lamp is brass with a shade. Before, every box of a block shared one texture.
- **A box shows the part of its texture that matches where it sits in the block.** Fronts such as the range's doors are drawn where their box is.
- **A texture named `lit_…` is drawn by its own light** (a lamp's shade, coals), and one named `flame_…` also wavers and flickers. The mesher marks those faces (face 7), and the shader does the rest.
- **A box with no thickness is a sheet** with two faces: the flames.
- **Collision is unchanged:** a solid block stops the body over its whole square, up to its tallest box. So nothing can be squeezed between or stuck in. Lamps, flames, the mantel's shelf and its ornaments are not solid.
- **Fitted rugs, beams, plaster, firebrick, the window seat and the wardrobe's halves** are whole cubes.

69 new blocks and about 70 textures, all drawn in code. Nothing was taken from anywhere.

## Kept true

- **Everything that does something still does it:** the bed, the journal at the bookshelves, the computer, the phone, the map table, the wall safe and its code, every chest with its contents, the stations, the vault's doors.
- **The sanctuary** covers the bedroom and its window (`HOME_GROUNDS` already did).
- **The land outside the home is unchanged.** `tests/home.test.ts` hashes the 64 columns round the home, by block name, leaving out the home's own box (x 1786–1842, z 998–1050), against a list made before the work (`tests/fixtures/land-near-home.txt`). `tools/landhash.ts` does the same for the whole world: all 4,096 columns matched.
- **The balcony's sunset view** (`1796.5,83.62,1024.5,90,-6,17.6`): the loungers now frame it, left and right; nothing stands in it.

## Checks

`tests/home.test.ts`:
- the land round the home is unchanged;
- every chest, station and thing to use can be walked to from the balcony and reached;
- the place you wake is free and looks out of the window;
- no indoor floor is darker than 8 at night;
- every lantern hangs from or stands on something;
- the rooms open to the outside only at the mouth;
- the chimney and the flue end in open air;
- the double door shuts and opens as one, and not on someone in it;
- the line from the sofa to the falls is clear;
- the reserved spots are empty;
- a save from the earlier layout is known as one, and a player saved inside a wall is known to be shut in.

The play-through (`tests/e2e/play-valley.mjs` and the others) now goes to the new bed, shelves, desk and range, opens the wardrobe by its top half, and checks where you wake.

## Tools

- `node --experimental-strip-types --no-warnings tools/homeslice.ts y=82` prints a level of the home as letters (or a cut: `x=1807`, `z=1024`).
- `node --experimental-strip-types --no-warnings tools/landhash.ts > out/landhash.txt` hashes every column of the world outside the home's box.
