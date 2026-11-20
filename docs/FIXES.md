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
