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
  - a **backup** (`save:backup`): the save as each session found it. New game and "Load" make the valley
    being left the backup first. The menu has **Open the backup**, which swaps the two, so it can be undone;
  - a save that **cannot be read** is kept aside (`save:bad`), and the close-time copy, then the backup, then a
    fresh valley is opened, with a plain line in the menu and on screen when play begins;
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

**Tests.** `tests/saves_safe.test.ts` (31): the check, the keeper, the storage open, and the real `Game` built in
Node (`tests/game/harness.ts`, with the picture, screens, sound and mouse stubbed): a full round-trip, play with
no edit saved on a timer, on pause and at close, malformed saves at boot and at import, a hand-over before
boot, New game, two tabs with and without locks. `tests/e2e/saves.mjs` runs the same cases in a real browser
(14 checks), with a real IndexedDB made slow and made to never answer.

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
