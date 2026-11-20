# Fixes — the independent review's "worth doing now" list

_Branch `fixes`, from `main` after Phase 7. The findings are in [REVIEW.md](REVIEW.md) (N1–N10)._
_Each item below says what was wrong, what was done, the calls made and why, and the tests that hold it._

The owner handed over the finish (AGENTS.md, "Finishing the game"): each gameplay call here was made from the
script (the Unity repo's `docs/DESIGN.md`), the review's recommendation and the owner's standing critiques,
and is written down with its reason.

---

## 1. Saves are safe (N1)

**What was wrong.** Four ways to lose a valley, and most play was never saved:

- a slow storage open quietly started a new valley, which then overwrote the real one;
- the hand-over between page versions could hand on a blank game;
- a save with the right header and missing fields stopped the page for good ("couldn't start");
- with two tabs open, the stale one won;
- position, health, hunger, the hour and the dose were saved only when a block or item changed.

**What was done.**

- **One place for what a save holds** (`src/save/state.ts`). `newSave()` is a new game; `normaliseSave()` checks
  every save before the game touches it. Loading, New game and the hand-over all go through `applySave`, so they
  cannot drift apart: a new game is a fresh save applied. (New game used to reset 16 fields by hand and miss
  several: Zone-2's dead men survived it.)
- **Every save is checked.** The player, the pack and the edits must be there in the right shape or the save is
  refused; every number is made finite and kept in range; the player is kept inside the world; unknown items
  and broken entries are dropped. A refused save is never stored.
- **The keeper** (`src/save/keeper.ts`) decides which copy opens and who may write:
  - each valley has an **id** and each write a **counter**. The copy made as the page closes replaces the
    stored save only as a later write of the same valley. A fresh valley started while the real one could not
    be reached has another id, so it can never replace it;
  - a **backup** (`save:backup`): the valley left behind by New game, a load or "Open the backup", written
    before the new one takes its place and never touched by a page load. The menu has **Open the backup**,
    which swaps the two, so it can be undone. Beside it, `save:previous` keeps the save as each session found
    it (item 9 tells why they are two);
  - a save that **cannot be read** is kept aside (`save:bad`), and the close-time copy, then the copy kept as
    the last session found it, then the backup, then a fresh valley is opened, with a plain line in the menu and on screen when play begins;
  - a save from a **newer build** is never written over by an older page: it says "reload the page";
  - a **failed read** is not taken for "no save": the page stops saving rather than write over what it could
    not read;
  - a **failed write** is said on screen and in the menu.
- **Storage opens patiently** (`src/platform/storage.ts`). Once the browser's storage has opened here, a later
  slow open is waited for (up to 20 s, with "Opening your save…") instead of giving up after 1.5 s. If it still
  does not open, the game says the saved valley can't be reached and keeps what is done meanwhile apart. Each
  kind of storage has its own close-time copy, so a copy made beside one can never replace a save in another.
- **Two tabs.** The first tab holds a browser lock (`src/platform/tablock.ts`); a second says the game is open
  elsewhere and holds Play back, then opens the valley as the first left it. Where a page may not use locks,
  the write counter does the job: a tab that finds another has saved since stops saving, pauses and says why.
- **Saved on a timer:** every minute of play, on pause, and as the page is hidden or closed, whether or not a
  block changed.
- **The hand-over** returns nothing until a valley is open, and a hand-over that is not a whole save is ignored.
- **Versioned.** `SAVE_VERSION` is 2. `migrate()` brings an older save up one step at a time; alias tables
  (`BLOCK_ALIASES`, `ITEM_ALIASES`) are ready for the first renamed block or item. Version-1 saves still open.
- **Small ones from the review:** the save code after New game or a load is the new valley at once; "Save now"
  before the store opens no longer switches autosave off; a save that throws no longer leaves autosave dead; a
  pack is 36 or 45 slots, and what it could not hold when saved is put down in a sack at your feet; a chest set
  where a hutch stood is a chest, not nine slots; the menu no longer counts "blocks changed" (crop growth was
  counted).

**Calls made.**

- *A second tab cannot play at all.* Two tabs playing one valley can only end with one of them losing work.
  Holding the second back with a plain line is simpler to understand than a tab that plays and cannot save.
- *An unreadable save opens the backup by itself,* rather than asking. The owner is not a developer; the right
  answer is almost always "give me my valley back", and the menu says what happened.
- *New game keeps the old valley as the backup.* One wrong double-click should not cost a valley.
- *The owner's test saves still open* (version 1 is upgraded), because it cost nothing. The home rebuild on
  branch `home` starts a fresh valley by its own rule; that is its call, not this one's.

**Tests.** `tests/saves_safe.test.ts` (32): the check, the keeper, the storage open, and the real `Game` built in
Node (`tests/game/harness.ts`, with the picture, screens, sound and mouse stubbed): a full round-trip, play with
no edit saved on a timer, on pause and at close, malformed saves at boot and at import, a hand-over before
boot, New game, two tabs with and without locks. `tests/e2e/saves.mjs` runs the same cases in a real browser
(16 checks), with a real IndexedDB made slow and made to never answer.

---

## 2. Creatures on the real land (N5, what remained)

_Phase 7 had already fixed the fed player who could not die. This is the rest._

**What was wrong.** Every creature test ran on flat stub ground. On the generated land creatures were born
across the sanctuary's line or inside trees and walls and stood rooted for good; Zone-2's sentry marched on the
spot against a truck; the jaguar walked into the shed and blinked out; a blow's warning was cut to a quarter of a
second near any obstacle; at dawn the night's hunters were deleted in plain view.

**What was done** (old → new, each measured on generated land):

- **Births.** Every spawner and `Wild.add` now requires the whole body to fit: wholly outside the sanctuary and
  wholly out of blocks. Across the sanctuary's line: 302 of 137,604 births straddled it → 0. In forest: 82 of
  1,500 never moved in a minute → 0. In the near band: 1,142 born with a flank in a block → 0. Tame hens still
  walk round their coops in the valley.
- **The sentry** completed 0 of his legs in 132 s → walks all five. His beat has a new shape (up the car park's
  lane, across the exchange's front, back), because the review's suggested line still met a street light and
  his old way back could not climb the highway's bank. Every patrol, sentry and guard beat is now walked in a test.
- **The jaguar** vanished in the clearing at the shed, 23 m from the player → it leaves along its path, up the
  bank and down behind it, and is gone only once out of sight or 60 m off. Tested from over 80 places to stand.
- **The warning before a blow** was cut to 0.25 s near obstacles (boar: 101 of 1,949 blows) → never shorter than
  designed. The cut now applies only while wandering.
- **Dawn.** The night's hunters (a puma, five coyotes) vanished in plain view → they run from the player and go
  only when unseen or 80 m off.
- **Other scenes, each given a real-ground test:** the farm den (281 of 765 dogs were born in a wall → 0), the
  outpost's machete man (reaches the player and returns to his post), coyote packs and the puma (on real hills
  they ignored the player; they now react up or down a slope), Marco's spot, the raiders' posts, the tower
  guards, the placed Ashen. A new test holds the sanctuary rule on the real rim for all twelve hostile kinds.
- **Extras from the same list:** a dimmer light no longer goes dark when a brighter one beside it is removed
  (N5i); the bow can be loosed inside the valley, and an arrow from outside still stops at the line (N5h);
  right-clicking a crop with a block in hand no longer replaces the crop.

**Calls made.**

- *Hunters come for you up or down a slope:* within 3 blocks of height or half the distance. A player straight
  above on a ledge is still out of reach, and a blow still needs a clear line.
- *Once the jaguar turns to go, only a shot or a blow provokes it.* Its way out passes the rusted trap, where
  the game sends the player.
- *A man whose post has been built over is not placed* until it is clear, instead of standing inside the block.
- *The bow can be shot from inside the valley at things outside.* Guns already could.

**Left undone.**

- **The valley can be walked into over its rim** (the fresh review's finding 6; it is so on `main` too). From
  the canyon a walker climbs the valley's outer slope, crosses the line at about (1734, 115, 1125) and comes down
  the south cliff by falls that do no harm: 146 seconds from the tunnel's canyon mouth to the middle of the floor.
  The premise is that the tunnel is the only way in. Closing it means making the valley's cliff sheer all round
  for at least a deadly fall, which reshapes the most looked-at land in the game and the land near the home that
  branch `home` is also changing; it wants its own pass, with pictures for the owner. The check is written and
  skipped in `tests/review_land.test.ts`. No hostile can use it (the sanctuary rule is in code), and M1 no longer
  ticks by it.
- **The outpost's stealth route does not hide the player from the lookout** on its west leg (x 889–879, z 1046):
  the brush there stands on lower ground than the trail and he sees over it. It needs taller brush, which is
  blocks, not a post. The check is written and skipped in `tests/creatures_real.test.ts`.
- N5j (a slab or stair across a chunk border darkening its neighbour) was not touched.

**Tests.** `tests/creatures_real.test.ts` (32, one skipped): 22 fail on the code before this, 10 passed there.

---

## 3. Places to get stuck, and a test that walks every route (N3)

**What was wrong.** One step east of the top of the home path was a slot seven blocks deep with no way out. A
cave shaft opened in the valley floor at the cliff's foot, and ran past the sanctuary's line. The "impassable"
ravine could be walked round. Nothing in the repo walked the generated world.

**The test** (`tests/walk.test.ts`, helpers in `tests/walk.ts`; 59 tests, about a minute):

- **The step rules are measured** on the real `Player` in small made worlds: what it steps up, jumps, leaps,
  swims up, and what fall is safe or deadly.
- **The valley:** every floor column is reached; the garden, the creek's end, the pool, the tunnel mouth and the
  balcony are reached; the flood never leaves the sanctuary; no place can be entered alive and not left; no
  still water stands beside open air; no single rock hangs off the cliffs.
- **Fourteen routes,** each walked on its own cells with no jump, then by the real `Player` out and back, then
  searched for pits within 16 blocks: the home path, the canyon ramp, the old road to the broken bridge, the
  bridge deck, the farm track, the brush trail, the camp trail, the highway to Las Cruces' gate, the hot-spring
  cave trail, the dam road, the dam's crest, the avenue, the mine trail, the far road. One more test checks
  that they join up.
- **The tunnel:** shut to a walker while the gate is shut; swum both ways by the real `Player` on one breath.
- **The gorge:** flooded from every place that can be stood on along its east edge, the whole length of the
  world, with leaps and swimming and the dam's deck barred: the far bank is not reached. With the deck, it is.
- **On the land as it was, 12 of these fail,** covering every case the review named.

**The land, before and after** (117 columns of 32 × 32 changed, and no others: `tests/fixtures/before-n3.json`
holds a hash of every column as it was, and two tests check that only the listed ones differ):

| | Before | After |
|---|---|---|
| The slot by the home path | 3 places to be stuck at (1798, 75, 1010–1012) | filled level with the paving (3 cells) |
| The cave shaft and pits at the cliff's foot | 47 stuck places at (1634, 64, 1103); 22 places outside the sanctuary | none (the valley's ring, 38 columns) |
| Pits in the brush by the outpost | 13 | none: bushes raised, not cleared (4 columns) |
| The gorge | the far bank reached from 28,926 places | none (75 columns) |
| The pool and the creek | 21 water cells standing proud of the bank | none |
| Hanging rocks; the bridge deck | 24 rocks; holes in the deck at (649, 1022–1023) | none; the deck is whole to its broken end |
| Found by the walk itself | a dead end between the dam's penstocks | a block to step out on |

**Calls made.**

- *Only the gorge's west wall is made sheer:* a step of six blocks under the west rim for the whole length of
  the world. The east wall stays as it was, so the land east of the gorge stays pinned. You can climb down the
  east side in places and back up, but never up the west: the far bank is reached by the dam, or by building.
- *No trees stand within 20 blocks of the west wall near the world's ends, and no cave is cut within four blocks
  of the rim line.* Without these the wall was crossed over the treetops and under the rock.
- *The reservoir's west shore stands two above the water, and the dam's downstream face is a full wall with the
  tailrace in a culvert.* Each was a ladder to the far bank.
- *Cave mouths in the valley's cliff are sealed about two blocks deep,* because cave roofs are now kept under
  the lowest open ground near them.

**The wake point** (N3e; `src/sim/wake.ts`). Blocks stacked on the place you wake used to leave you inside them
after a death or hold H; a shaft dug under it killed you over and over; a bed carried out of the valley and slept
in moved "home" to the road. Now, once the land there is in, you stand at the wake point if it is free with
ground under it; else at the nearest place within three blocks that is ("Something stands where you wake: you
are set down beside it"); else on the balcony, which becomes the wake point until you sleep again. A wake point
outside the valley is not one: hold H and death bring you to the balcony. *Call:* sleeping still works in a bed
anywhere (a night's sleep on the road is the player's own risk); only "home" stays in the valley.

**Not done.** The review's one pit far off the road in the buffer's hills, at (1261, 130, 1153), is outside the
16-block search and was left. Columns in the valley's ring take about 6 ms longer to generate.

---

## 4. Failures that are not handled (N8)

_Built before items 2 and 3 landed (they were being worked on in parallel), so its commit comes first._

**What was wrong.** A crashed worker, a failed generation or mesh job, a lost picture (the browser taking the
graphics context away) and a type error in the build were each either silent or for ever.

**What was done.**

- **Workers** (`src/jobs/pool.ts`): a worker that errors, sends an unreadable answer or never says it is ready is
  replaced, and its job goes once more to another; a job lost twice is refused, so the streamer can back off. With
  no worker left, the work moves to the main thread, as in a sandboxed frame that never had workers.
- **The streamer** (`src/world/streamer.ts`): a column that fails is asked for again after 0.5 s, 2 s and 8 s, then
  left out until the player comes back to it (it was asked for every frame, for ever). A mesh that fails is built
  once more. The loading screen no longer waits for ever on a column that was given up, and the game now says so
  on screen once ("Part of the land could not be built here…") rather than leave a silent hole.
- **The picture** (`src/platform/context.ts`, `src/render/renderer.ts`): when the browser takes the picture away
  the game pauses and says "The picture was lost. It will come back in a moment…"; when it returns, it says so.
  If it has not returned in 15 s, it says to save and reload. three.js rebuilds its own buffers and textures; the
  renderer puts back the two things it does not (the sky colour behind everything and the picture's size).
- **The shared index buffer** (`src/render/chunkGeometry.ts`): every chunk shares one 3.1 MB list of corners, and
  three.js deleted and re-sent it each time any chunk was rebuilt or unloaded. It is now taken off a chunk before
  the chunk is thrown away. (Read in three.js r187's source and shown in a test with its own bookkeeping.)
- **The file picker:** a file that cannot be read answers "no file" where it used to wait for ever.
- **Checks on push:** `npm run build` type-checks first and stops on a type error; a GitHub Action
  (`.github/workflows/checks.yml`) runs the type check, the unit tests and the build on every push and pull
  request; `playwright` is declared in `package.json` (installing it downloads no browser).

**Not done, on purpose.**

- No watchdog for a worker that hangs without an error: a timeout would kill healthy workers after the computer
  sleeps.
- A lost and restored picture has been tested with a stand-in, not in a real browser on a real graphics card.
  To try it: in the browser's console, `__hv.game.renderer.gl.forceContextLoss()`, then `forceContextRestore()`.
- `AGENTS.md`'s publishing steps are unchanged: `npm run build` is already step 1 there, and it now type-checks.

**Tests.** `tests/failures.test.ts` (26): a stand-in `Worker` that dies mid-job, fails twice, sends rubbish or never
starts; a failing column not asked for every frame; a mesh retried and drawn; healthy walks over real and flat
land that still draw every chunk and remove meshes on unload; three.js's own geometry bookkeeping; context loss.

---

## 5. Survival and Builder's mode (N2)

**What was wrong.** Flying (`F`), endless blocks (`G`) and the time of day (`[` and `]`) were ordinary keys, listed
in the menu, so any fight could be skipped. One press of `[` paid a rig nearly a full day's Bitcoin, and before
six in the morning each press was a new dawn: eggs, rabbits and Zone-2's dead men came round again. With
endless blocks on, mining the raiders' one forge gave nothing and M2's forge could never be made. The menu still
said "Phase 0".

**What was done.**

- **One choice, made before play first begins in a valley:** Survival or Builder's mode. It is shown as two
  buttons above Play on a new valley (the first one, and after New game), saved with the valley, and shown in
  Settings afterwards as "chosen when this valley was begun". It cannot be changed later.
- **Survival:** `F`, `G`, `[` and `]` do nothing, and are not in the list of controls. Nobody flies or has
  endless blocks in Survival, whatever a save says.
- **Builder's mode:** the keys work and are listed. The clock keys turn the sky and the hour only: no power is
  made or used, the rig is paid nothing, and no new day begins. A small "Builder's mode" label shows in the
  corner while playing.
- **Quest blocks:** with endless blocks on, a block still gives whatever is not the block itself (the forge's
  parts, a lathe's, the crucible, ore, a caught rabbit). If the pack is full, the block stays where it is.
- **The menu:** the subtitle no longer says "Phase 0"; the list of controls is by mode, and right-click now says
  what it does (use, eat and drink, place, aim).
- **The test path:** the play-through and the screenshot tool never used the player's keys for these. They set
  flying, the hour and the pack through `window.__hv` (`__hv.test.fly/endless/hour`, `setCamera`, `setHour`, or
  straight on `__hv.game`), which works in any mode and is said so in `src/main.ts`.

**Calls made.**

- *Survival keeps none of the four keys.* The review left this to the owner. The script's whole idea is that the
  valley is safe and outside is not; a key that lifts you over a fight or skips the night undoes it. Hold H to go
  home, which the owner asked for, stays in both modes.
- *The mode cannot be changed after play begins.* Otherwise Survival is one menu click from Builder's mode and
  nothing is at stake. New game offers the choice again, and the valley left behind is kept as the backup.
- *The first game starts in Survival unless Builder's mode is picked.* Survival is the game; Builder's mode is for
  building and looking round.
- *In Builder's mode the hour really moves* (night creatures, Marco's hours and sleep follow the sky you turned
  to). Only pay, power and the new day are held back. A sky that said night while the rules said day would be
  more confusing than useful.
- *Milestones still count in Builder's mode.* It is a sandbox on the same world; nothing is gained by switching
  them off, and quest blocks giving their parts keeps every milestone possible there.
- *Valleys made before the choice existed are Survival*, and count as already begun.

**Tests.** `tests/modes.test.ts` (10), on the real `Game` in Node: the choice and its fixing, saving and reload,
New game, an older save; the four keys in each mode; a rig paid nothing over 100 presses of `[` (and the old
behaviour shown paying, for contrast); no new day from `[` before six; the forge's parts with endless blocks on,
and with a full pack.

---

## 6. Money and milestones have weight (N4)

**What was wrong.** The wallet started at 5,000,000 sats, more than everything Marco sells. A rig earned less in
a day than two iron ingots sold for, and the home's own rock held over a thousand iron ore. Marco would buy the
one pump in the world, after which M3 could never be finished. Milestone steps ticked without the real step
(any pistol; "home" was anywhere east of the gate, or a press of H), and M3 could be completed with M1 and M2
undone. Dying at home filled your stomach. A jug of cold water took its jug with it.

**What was done.**

- **Marco's purse.** He can pay out 250,000 sats (10 units) in a day; it is whole again each dawn, and it is saved
  with the valley. The trade screen says how much he can still pay today, and he says why when it runs out.
  This is what brings Phase 7's loot into line: the gallery's iron and coal and the yard's rails are worth about
  310 units at his prices, which is now a month of trips to the shelter, not one afternoon.
- **Parts he will not take.** A part that a milestone step still needs (`keep` in `data/trade.json`: the pump
  and fridge units, battery cells, roof panels, rig boards, GPUs and PSUs, bowstrings, primers, casings,
  saltpeter, sulfur, gunpowder) shows in his list greyed, with the step it is for, and he says to keep it. Once
  the step is done, what is left over is his to buy.
- **Rows stay put.** What he is offered is fixed while the screen is open. A row that sells out stays in its
  place, greyed ("none left"), so quick clicks never sell the next thing down.
- **Real steps.**
  - M1's "back home" is inside the valley, after having been out through the gate.
  - The pistol step is the dead scout's pistol, taken from his pockets; a bought or looted one does not count.
  - Hold H still brings you home from anywhere, but M1's two "come home" steps wait for a run you swim and walk
    yourself. The toast says so.
  - A milestone is done only after the one before it.
- **Each milestone's recipes need the one before** (`after` in `data/recipes.json`). M2's (coop, bow, smoker,
  jerky rack, forge, leghold trap, raised bed) need M1; M3's (solar array to water pump, powder mill, bullets,
  rounds, the rain awning) need M2; M4's (crucible furnace, steel, lathe, hydro generator, gun mods, plate
  armour, the planter box) need M3. What waits is listed at its station, greyed, with what it waits for, and each
  milestone's toast says what can be made now. The computer shows "after M1" beside a milestone not yet open.
- **Numbers** (`data/trade.json`, in the script's units of one wound care = 4):

  | | Was | Now | Why |
  |---|---|---|---|
  | Starting wallet | 5,000,000 (200 units) | 1,000,000 (40) | The script: "a small starter balance". The review's number. |
  | Marco's purse, a day | no limit | 250,000 (10) | The review's number. |
  | One rig, a day | 50,000 (2) | 100,000 (4) | One wound care a day. A farm of three (12) now out-earns any day of selling. |
  | Ray's plans | 12 | 24 | The script: Ray is "premium". With a third rig's board (7 → 14), M4 costs about the whole starting wallet, so it has to be earned. |
  | Ray's steel, GPU, PSU, wiring | 6, 10, 4, 8 | 10, 16, 8, 12 | The same premium. |
  | Marco pays for a pistol, a raider's rifle | 600,000, 1,000,000 | 100,000, 150,000 | He sells guns dear and buys them cheap; they were the best loot in the game. |
  | Primers | 40 ever | Marco sells 10 for 3 units at trust 2 | The review's number: rounds of your own no longer run out for good. |
  | Pantry | 32 tins, 16 rice, 16 beans | 8, 6, 6 | About ten days of food, as `docs/PLAN.md` always said; it was forty. |

- **Coal and better ores are outside.** The ore rule now covers the whole sanctuary, the home's rock as well as
  the bowl: it held 1,309 coal ore and 396 copper ore, and now holds none (the valley's own iron, flint and clay
  stay). Four columns of land changed for it (56:31–32, 57:31–32), listed in the fixtures.
- **Waking after a death at home** keeps the hunger and thirst you had, never below 15. (Outside, where you lose
  your pack, you still wake at 50.)
- **The jug comes back** from cold water as from a jug of water; with no room for the empty jug the drink waits
  and says so, where the jug used to be destroyed.

**Calls made.**

- *Marco refuses milestone parts rather than selling them back.* A refusal with the reason on the row is one
  rule the player can see; a buy-back list would be a second catalogue to keep in step with the first.
- *Hold H does not tick M1, but still ticks "come home alive" for Zone 2 and Zone 3.* The review asked for M1
  only. The first run is the lesson in the way home; after that H is the owner's own request ("lost? hold H"),
  and voiding a long run for using it would punish getting lost.
- *The hutch stays makeable from the start.* It has been since Phase 3, rabbits come from the buffer, and
  "animals can be caught and raised" is one of the owner's standing notes.
- *The rig at 100,000 a day, not the review's unchanged 50,000.* The review named the problem ("the rig is the
  worst earner in the game") but only cut the wallet and capped Marco. At 50,000 a rig would still be a fifth of
  a day's selling. At 100,000 one rig is steady pay worth having and a farm is the best income there is, which
  is the script's M3 and M4.
- *Hunger's pace, raiders' health and the armory's rounds are unchanged.* The review would halve the time
  hunger takes, raise raiders to two rifle shots and halve the starting rounds. Those change how every fight
  and every day feels, and the play-through is built round the present numbers; food is made to matter here by
  the smaller pantry and by death at home no longer feeding you. They are listed under "Left undone" for the
  owner's play to decide.

**Tests.** `tests/money.test.ts` (19): the numbers; the purse over a day and across dawn, on the real `Game`;
kept parts (and that every one is a real item waiting on a real step); rows that stay put under four quick
clicks; M1's real steps, with H; milestones in order; every gated recipe before and after its milestone; waking
after a death at home and outside; the jug. Older tests that pinned the old numbers or made M2–M4's things with no
milestone done were brought in line (`tests/phase5`, `phase6`, `phase7`, `nearband`, `chests`).

---

## 7. The first ten minutes (N6)

**What was wrong.** A new player met a menu that said "Phase 0", then the balcony, with no word of who they are,
what happened, what to do first, or how to eat.

**What was done.**

- **An opening**, shown once, when play first begins in a new valley: three short cards in the script's voice
  (who you are, how you came here, where you are). Each is three lines; "Go on" shows the next, the last
  begins, and "Skip" ends them at any point. The words are in `data/guide.json`.
- **One goal on screen at a time**, small, at the top: "Next: …". First the six things a new arrival should
  do, in order: eat, drink, read the journal, find the armory, sleep, the way out. Each is ticked by doing it,
  in any order. After them the line shows the next unticked step of the milestone in hand ("M1 · Meet Marco
  and trade with him"), and so on through M4. A valley already past M1 skips the first six.
- **Eating and drinking.**
  - You arrive unhurt but hungry and thirsty (Food 55, Water 45), with two tins and a jug of water on the
    hotbar, so the first two goals can be done where you stand and teach the one thing the controls never said.
  - Choosing any food or drink shows its name with "right-click to eat" (or "to drink").
  - Later, the first time you run low, one line says how, and that the pantry and the garden hold more.
  - The list of controls now says what right-click does.
- **Small things that were hard to find** (from the review's list):
  - Once Marco trusts you, he keeps the shelter every day from seven to six; the phone call is for the first
    meeting only. His daily purse (item 6) keeps this from being a money tap.
  - A wrong code on the safe says where the code is written (the journal: four digits, the month first), and the
    keypad takes typed digits, Enter and Backspace as well as clicks.
  - A solar array under rock or a roof says so when used, instead of reporting the others' power.
  - Setting down a smoker, a jerky rack or a hutch says, once, what goes in it and when it acts.

**Calls made.**

- *The opening is three cards, not a scene.* The script's opening is a chase and a dive, played. That is a
  phase of work by itself; three cards carry the same facts in fifteen seconds, and the tunnel is still there
  to be swum as the way out.
- *The player arrives hungry and thirsty.* It is true to the script (years of drifting, a run through the
  canyon), and it turns "how do I eat?" from a mystery into the first thing done.
- *Marco is there every day after the first deal.* The review left this to the owner. Calling from the cave and
  walking back for every trade is a chore, not a danger, and the owner's standard is "simple, short, easy to
  find". The first meeting keeps the call, because finding his number at the shelter is the story.
- *Doc stays on the home phone.* The script heals at home ("injured: retreat to the valley"); a phone in the
  pocket would make Doc a field medic.

**Not done from the review's list:** Esc on the pause menu does not resume (a browser will not give the mouse
back to a page straight after Esc took it away); holding H while drowning; digging beside water letting the
water in; dropping things on the ground.

**Tests.** `tests/first_minutes.test.ts` (9): the cards' length and what they say; shown once per valley and not to
an older one; the six goals in order and the milestone steps after them; arriving hungry with food and water in
reach, and each act moving the goal on, on the real `Game`; the low-food and low-water lines said once; the
"right-click to eat" label; Marco at the shelter by day once trusted. The play-through's first check is now the
opening card and its "Skip".

---

## 8. Splitting `src/game.ts` (N10)

**What it was.** One class of about 2,000 lines that ran everything and could not be built outside a browser,
so the wiring between the tested parts (saving, dying, trading, milestones) had no tests, and that is where most
of the review's bugs were.

**What was done** (no change in behaviour):

| New module | What moved there | Tests |
|---|---|---|
| `src/save/state.ts` | What a save holds: a new game, the check every save goes through, upgrades (item 1) | `tests/saves_safe.test.ts` |
| `src/save/keeper.ts` | Which copy opens, the backup, who may write (item 1) | `tests/saves_safe.test.ts` |
| `src/platform/tablock.ts`, `src/platform/context.ts` | The browser's tab lock and the lost picture, behind fallbacks (items 1, 4) | `saves_safe`, `failures` |
| `src/game/people.ts` | Marco's trade, Doc's services, Ray's catalogue and plans, from a narrow view of the game | `tests/money.test.ts`, `tests/people.test.ts` |
| `src/game/computer.ts` | What the builder's terminal shows | `tests/people.test.ts` |
| `src/sim/weapons.ts` | The guns, the bows, the blades | `tests/people.test.ts` |
| `src/sim/guide.ts` | The first goals and the next milestone step (item 7) | `tests/first_minutes.test.ts` |
| `src/sim/wake.ts` | Where you wake and stand (item 3) | `tests/wake.test.ts` |
| `src/sim/power.ts` (`chillJugs`) | The fridge's rule | `tests/wake.test.ts` |

- **The real `Game` now runs in Node** (`tests/game/harness.ts`, `tests/game/stubs.ts`): the picture, the
  screens, sound and the mouse are stood in for, the store and the close-time copy are in memory, and a test
  can open a page, play frames, press keys, close the page and open it again. Five test files use it (saves,
  modes, money, the first ten minutes, the wake point): about 80 tests on the class that had none.
- `src/game.ts` is 2,172 lines, against 1,999 before this branch: items 1–7 added to it, and the trade screens,
  the terminal, the weapons and the fridge's rule moved out. It is still the largest file by far; the list below is
  what would bring it down.

**Left for the next pass, in the review's order** (each mergeable by itself; none was started, so that the home
makeover on branch `home`, which edits the same functions, merges cleanly first):

1. `game/interactions.ts`: the right-click chain (`placeBlock`, `useFurniture`, `usePhase6`, `usePhase7`) as a
   table keyed by block name, with `usableTarget` derived from it. The home branch edits these.
2. `game/places.ts`: the "near X, once" toasts of `tickPlaces`, `tickFarPlaces`, `tickZone2` and `tickZone3` as
   data, and Marco's comings and goings and the jaguar's crossing into `src/sim/`.
3. `game/combat.ts`: `strike`, `aim`, `loose`, `takeDrops`; the guns' numbers into `data/items.json`.
4. `platform/input.ts`: the key and mouse bindings, so `Game` no longer touches `window` and `document`.
5. The save methods still on `Game` (`save`, `saveNow`, `swapValley`, `openValley`): the home branch edits
   `boot`, `snapshot` and `restart` beside them.
6. Flags as a typed union, so a typo fails to compile.

---

## 9. The fresh review, and its fixes

A reviewer that did not write the code checked `git diff origin/main...fixes` by running things: probes on the
real `Game` in Node and on the built page in a browser, told to break the saves and to find new ways to cheat the
economy and the milestones. It proved twelve faults with 22 failing probes. Eleven are fixed, each held by a test
(the probes themselves, kept as `tests/review_saves.test.ts`, `tests/review_money.test.ts` and
`tests/review_land.test.ts`); one is not, and says so.

1. **The one backup slot was written over by the next thing that happened.** Every page load copied the stored
   save over it, and so did any second swap: New game by mistake, then a reload, and both slots held the blank
   valley. *Fix:* two slots. `save:backup` is the valley left by New game, a load or "Open the backup", and only
   those write it. `save:previous` is the save as each session found it, used by itself only when the save
   cannot be read. A valley never begun is not put in the backup (two New games in a row kept nothing). One swap
   at a time: a second click while the first is being stored does nothing. The New game button disarms after it
   fires.
2. **The hand-over between page versions was taken without asking whose it was.** A tab told "another tab has
   saved since" handed its stale valley on over the newer save; so did a valley begun while storage would not
   open. *Fix:* a hand-over takes the stored save's place only as the same valley, written no earlier; a page
   that has stopped saving, or whose valley is such a stand-in, hands nothing on.
3. **Two one-of-a-kind desks could be mined for planks before they were read:** the pharmacy counter (Doc's
   card, and with it M3) and the engineer's desk (Ray's number, and with it M4). *Fix:* neither can be broken.
4. **A swap went ahead when the valley being left could not be kept.** *Fix:* the backup is written first; if
   that fails nothing else is written, the valley is put back, and a line says so.
5. **A valley first kept in the browser's simpler storage was left behind** the day the main storage opened in
   time, and a fresh one started without a word. *Fix:* it is moved across the first time the main storage opens
   empty.
6. **The valley can be reached on foot from the canyon, over the rim** and down the south cliff by harmless
   falls, with the gate shut. It is so on `main` too. **Not fixed** (see "Left undone"). What it let a player
   cheat is fixed: M1's "swim out through the gate, and back home" now needs the player to have been seen in the
   tunnel on the valley side of the gate; standing inside the valley is no longer enough.
7. **The address bar flew and turned the clock in Survival:** `?cam=…` set the player flying, and `?hour=5.99`
   made every reload a new dawn (Marco's purse whole again a minute after it was emptied). *Fix:* the camera is
   honoured only with `?test`; the hour only with `?test` or on a valley not yet begun.
8. **A version-1 valley got a new random id at every read,** so its own close-time copy never matched it. *Fix:*
   the id is made from the save itself.
9. **With a screen open the clock ran but hunger, the wild and Marco's hours did not:** a day in the pack screen
   cost no food and paid the rig in full, and Marco's trade held open overnight got a second purse. *Fix:* the
   day stands still while a screen is open, as the body already did.
10. **A write that never answered stopped autosave for the session and nothing said so.** *Fix:* a write has 30
    seconds to answer, then counts as failed, with the toast and the menu line a failed write has.
11. **The home phone, mined and set down anywhere, was Doc in the field.** *Fix:* the phone may be moved, as
    furniture is, but outside the valley it says "No signal out here".
12. **One failed read at the start, and the page later said another tab had the valley.** *Fix:* a head that
    could not be read is unknown, not absent; the first one read later is taken as found.

Also from its reading: New game from the pause menu with the pack screen open carried the cursor's item into the
new valley; a swap now closes open screens first.

*Suspected by the reviewer and not addressed:* if the main storage opens but will not take a write (a full
disk), the page says the valley "can't be reached" though it could be read; and a valley saved by a newer build
has no way out but waiting for that build if the published page is ever rolled back.

**It looked for and did not find:** a buy, make and sell loop that gains sats; a kept part made sellable; the
purse dodged by reload, New game then the backup, death, hold H or midnight; rig pay without power or more than a
day's for a day; any key that flies, makes blocks endless or moves the hour in Survival, or the mode picked again
after play begins; a step needing a recipe gated behind its own milestone; a lost or doubled item across New game
during an autosave or a close mid-swap; and fourteen kinds of hostile save, each of which starts, plays through a
dawn and saves whole.

---

## Left undone, in one place

- **The valley can be walked into over its rim** (the fresh review's finding 6; it is so on `main` too). From
  the canyon a walker climbs the valley's outer slope, crosses the line at about (1734, 115, 1125) and comes down
  the south cliff by falls that do no harm: 146 seconds from the tunnel's canyon mouth to the middle of the floor.
  The premise is that the tunnel is the only way in. Closing it means making the valley's cliff sheer all round
  for at least a deadly fall, which reshapes the most looked-at land in the game and the land near the home that
  branch `home` is also changing; it wants its own pass, with pictures for the owner. The check is written and
  skipped in `tests/review_land.test.ts`. No hostile can use it (the sanctuary rule is in code), and M1 no longer
  ticks by it.
- **The outpost's stealth route does not hide the player from the lookout** on two stretches (he sees over the
  brush at (906, 1028–1029) and along x 889–883, z 1046). It needs taller brush there, which is land. The check
  is written and skipped in `tests/creatures_real.test.ts`.
- **Fight and hunger numbers the review would change** and this branch did not: hunger emptying in 20 minutes
  instead of 40, raiders at 60–70 health so the rifle needs two shots, the armory's rounds from 40 to 20. See
  item 6's calls.
- **From the first-ten-minutes list:** Esc resuming from the pause menu, hold H while drowning, digging beside
  water, dropping things, Doc on a carried phone.
- **N5j** (a slab or stair across a chunk border darkens its neighbour) and **N9** (path-finding) were not in
  this branch's list.
- **A lost and restored picture** has been tested with a stand-in only (item 4).
- **The rest of the split** (item 8's list).
- **Prices still read as `0.00025000 BTC`.** The review would show thousands of sats; the play-through reads the
  present form.
