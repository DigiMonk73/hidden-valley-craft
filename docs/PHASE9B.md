# Phase 9, Track B — soundness

_The phase session's page (branch `phase9b`, begun 2026-11-20). The lead's brief is [PHASE9.md](PHASE9.md), Track B. Each step is marked DONE here when it is committed with its tests._

## Resume here (second session, on Opus 5.5, begun 2026-11-20)

**Where it stands.** Steps 1 to 7 are built and pushed (the first session's checkpoint, `c2f3c1f`). Since then: saves record the world generator's version (`8823ca3`, step 3, "Generator version"), and the lead's two calls on the rim are written in step 3. The fresh review is done: findings 1, 2, 4, 5 fixed with tests, 3 and 6 answered ("The fresh review", at the end).

**Agents:** the owner's instruction, passed on by the lead (2026-11-20, 16:53): every agent this track opens runs on Opus 5.5 at extra effort (Agent tool: `model: "opus"`, `effort: "xhigh"`), a fresh reviewer included. (The review below was opened before this word, at the default.)

**The order of what is left** (the lead's brief to this session):

1. DONE: the fresh review's findings.
2. **When the lead says Track A is merged:** merge `origin/main` (what to expect is below); re-take the land fixtures from the merged generator and confirm only intended columns differ; then step 8 (the split), the headlamp's light, the `banana_bunch` pickable and regrowing on Track A's plant. Commit and push each.
3. **Then the checks, once, on the final tree:** `npx tsc --noEmit`, `npm test`, all six play-through parts (`npx vite preview --port 4173 --strictPort`, then `node tests/e2e/play.mjs`), `node tests/e2e/saves.mjs`, `node tests/e2e/engine.mjs` (and once `MINUTES=5 PARTS=sandbox`), `node tests/e2e/capture.mjs`. Never vitest and the browser together. None of the browser checks has been run on this branch since save version 5; notes on what may need a look: the parts set scenes by hand and none reads the bookshelf (add `books_read` to a scene's flags if a part needs the workshop's recipes); the water filter costs 6 health a drink outside with an empty hand.
4. **Report:** this page and docs/STATUS.md, push, message the lead (under 40 lines).

**At the merge with Track A, expect and keep** (the lead's message, 13:28):

- `src/render/renderer.ts`, the constructor: Track A asks `WebGLRenderer` for `stencil: true` and sets `gl.info.autoReset = false`. This branch's line there passes `antialias: opts.antialias ?? true`. Keep all three. With `autoReset` off, `tools/perf.mjs` and `tests/e2e/engine.mjs` read `gl.info.render.calls` and `.frame`: check they still mean a frame.
- **Settings.** Track A saves a checkbox as `fx` in the settings object and reads it in `loadSettings`/`saveSettings`. This branch moved settings into `src/game/settings.ts` (`Settings`, `readSettings`, `encodeSettings`) and `Game.settings`. An unknown key such as `fx` now survives a load and a save here (`others`, tested in `tests/settings.test.ts`), but Track A's own code will conflict in `Game.loadSettings`/`saveSettings` and `Hud.settingsInputs`: move `fx` into `Settings` as a known key (default true), add it to `Hud.showSettings`, and drop it from `others`.
- **Save version.** This branch is at 5 (`MIGRATIONS[4]`: a begun valley has read the handbooks). If Track A raised it too, put the two steps one after the other and make this one the later number or the earlier, whichever the dates of the published builds say; both steps are safe to run in either order.
- **`src/gen/terrain.ts`.** This branch turned `generateColumn` into a generator (`generateColumnSteps`, with `yield` between its seven parts) and changed three lines of `wallRadius` (the rim mends). Track A's trees and plants are in the last part: keep the `yield` lines.
- **Fixtures.** If Track A changes any land east of the gorge, `tests/fixtures/v13-land.json` (seven changed columns and their neighbours, against version 13) and the five budgets in `tests/e5.test.ts` will say so. Re-measure the budgets and write the new numbers with the reason; for the land fixture, the seven columns' `now` hashes are this branch's alone.

**Decided or measured and written only here**

- The anti-aliasing setting changes at the next opening of the page (a browser fixes it when the picture is made); the menu says so. Reason and the alternative weighed: step 1, "Calls".
- The engine's browser check found that **workers do start inside a sandboxed frame** in Chromium (`workers ×3` with storage blocked). So the published page most likely builds its land on workers; the owner can confirm with F3's first line.
- The play-through's valley part ran in 10 minutes on this branch, against the 15 to 25 the README gives. Not looked into; nothing was removed from it.

**Weak spots known**

- **The valley's rim is closed to a free walk only.** With falls that hurt, it is still come down (35 health at the cheapest place found), and a dive from the ridge over the falls into the pool costs nothing. **The lead decided (2026-11-20): both stay** (step 3, "The lead's calls").
- **Nothing here was judged on a real graphics card:** frame rate, the automatic drop happening by itself, smooth edges off, the look of Picture: Soft. The numbers that are fair on this machine are in step 1's table.
- **Safari and Firefox were not run** (not installed here). One fault was found by reading and fixed; step 5 has the owner's list.
- **The handbooks gate is new play.** It is one right-click on a bookshelf the goals already point at, but the owner has not seen it.
- **The water filter adds a cost outside** for a player who left it at home. It is said in plain words when it happens.
- **The taller brush** on the outpost's trail is a hedge 4 to 7 blocks high for about ten metres; it hides the walker and was judged from one picture pair (`docs/phase9b/brush.jpg`).

## The plan, in the order it is built

| # | Step | State |
|---|---|---|
| 1 | A path for weaker computers | DONE |
| 2 | Settings, kept across sessions | DONE |
| 3 | The faults found and left (the rim, the stealth route, the three save notes, Esc, H, dropping, N5j, N9) | DONE |
| 4 | Play with the mouse captured | DONE |
| 5 | Other browsers | DONE: none can be run here; what was read, one fault fixed, and a list for the owner |
| 6 | What the script promises and is not there | DONE, but for the headlamp's light (it needs the block shader: after Track A) and spoilage (not simple) |
| 7 | Tests (streamer walk, random light edits, sandboxed frame, mesh budget) | DONE |
| 8 | The rest of the `src/game.ts` split (last, once Track A is merged) | |

## Rules this track keeps

- A valley saved in version 13 opens and keeps everything (save version 4, world layout 2). The layout number is not raised.
- `src/render/` is Track A's. What this track touched there is listed under step 1, and is small.
- A bug fix gets a test that fails on the old code.

---

## 1. A path for weaker computers (DONE)

**What it was** (docs/REVIEW.md, E1). The menu could not go below 224 m. The picture was always drawn at the screen's full sharpness with smoothed edges. Every chunk's vertices were held twice, on the card and on the page. A column joining the world lit its seams on the main thread whenever it arrived, several in one frame. The land came in a fixed few milliseconds a frame, so a computer that drew slowly also loaded slowly. Where workers are blocked, one column held the page for 25–75 ms. Every placed sound left a panner wired to the mix for ever.

**What was built**

| What | Where | How it is checked |
|---|---|---|
| **Picture: Sharp / Softer / Soft** (render scale 1, 0.75, 0.5) | `Renderer.setScale`, Settings | `tests/e2e/engine.mjs` (the canvas really is smaller), `tests/settings.game.test.ts` |
| **Smooth edges on / off** | `Renderer` constructor, `src/platform/hints.ts` | `tests/e2e/engine.mjs`, `tests/settings.game.test.ts` |
| **128 m and 160 m** in the view-distance list | `src/game/settings.ts` (`VIEW_CHUNKS`) | `tests/settings.test.ts` |
| **The picture made lighter by itself** below 27 frames a second, and a tick box that stops it | `src/game/quality.ts`, `Game.watchFrames` | `tests/quality.test.ts`, `tests/settings.game.test.ts` |
| **The page's copy of a chunk's vertices let go** once the card has them | `Renderer.makePart` | `tools/perf.mjs`, `tests/e2e/engine.mjs` |
| **A lost picture**: every chunk meshed again when it comes back (the page no longer holds what it sent) | `Streamer.remeshAll`, `Game` | `tests/engine9.test.ts`, `tests/e2e/engine.mjs` (a real lost context) |
| **Columns joined one a frame**, nearest first | `Streamer.joinArrived` | `tests/engine9.test.ts` |
| **The mesher's padded chunk copied by rows** | `World.padded` | `tests/engine9.test.ts` (cell for cell the same as before) |
| **Loading no longer tied to the frame rate** | `Game.frame` (a share of each frame) | `tools/perf.mjs` |
| **Workers blocked**: a column built a part a frame; the view kept at 160 m unless the player chose one | `generateColumnSteps`, `stepJob`, `MainThreadExecutor`, `Game.boot` | `tests/engine9.test.ts`, `tests/settings.game.test.ts`, `tests/e2e/engine.mjs` |
| **Placed sounds let their panners go** | `Sound.placed`, `Sound.update` | `tests/audio_leak.test.ts` (fails on the old code: 1,002 panners left wired after 1,000 shots) |

**Calls, each with its reason**

- **Smooth edges change at the next opening of the page, and the menu says so.** A browser fixes anti-aliasing when the picture is first made. Changing it while playing means either a second copy of the picture drawn and copied every frame (a cost on exactly the computers this is for, and a rewrite of the renderer's drawing that Track A is working in) or rebuilding everything on the card. One line in the menu is the cheaper honesty. Because the choice is needed before the saved settings can be read (they may sit in a store that opens slowly), it is also kept as a hint in the browser's simplest storage (`hvb:hint:aa`); where that is blocked, smooth edges stay on.
- **The scale is the browser's stretch of a smaller picture**, not a second pass: one line in the renderer (`setPixelRatio`), nothing in the way of Track A.
- **"Below 30" is judged as below 27**, over two windows of four seconds, after six seconds' grace. A screen or a power-saving browser that holds exactly 30 must not trip it, and one hitch while land loads must not either. It only ever goes down: softer, then 224 m, then softer, then 160 m, then 128 m. Each step is said in plain words and shown in Settings, where it can be put back or the whole thing turned off. It never judges frames while paused, loading, hidden, or within six seconds of a change the player made.
- **It does not run on a test address that fixes the view** (`?rd=`, `?test`): the play-through draws 2–4 frames a second here and would have its view shortened under it.
- **The ladder stops at 224 m before going softer a second time** because 224 m is what keeps the whole valley at full detail from inside it: the look of the valley is given up last.
- **Joined "one a frame" means one, then more only while a budget lasts**; the budget is 2 ms at 60 frames a second (so: one) and grows with the frame time. At a slow frame rate the frame is already long and the land must still come in.
- **The main-thread fallback shortens the view for that page only.** The kept setting stays the player's, so a browser where workers do start is not left at 160 m. A view the player picks in the menu is always used.
- **Generation was split by wrapping, not rewriting**: `generateColumn` now drains a generator that yields between its seven parts. The land is the same block for block (the world-hash fixtures still pass, and `tests/engine9.test.ts` compares the two directly).
- **Cave culling was left** (REVIEW.md's own table: one to two days, medium risk). It is the next thing to do if real computers still struggle at 128 m and half scale.

**What was touched in `src/render/`** (Track A's): `renderer.ts` only. The constructor takes `{ antialias }`; `setScale`, `renderScale`, `antialias` were added; `makePart` gives each of a chunk's four attributes `onUpload(releaseArray)` and draws a new chunk once unculled so that upload happens; the comment on `restore()` now says who rebuilds the chunks. Nothing in the shaders, the scene or `render()`.

**In `src/audio/`**: `audio.ts`, the panner leak only (`placed`, the sweep at the top of `update`, three call sites).

**Measured** (`tools/perf.mjs`; the balcony, looking west, noon; headless Chromium drawing in software, 960×540)

| At the balcony | Version 13 | This branch | |
|---|---|---|---|
| **View 256 m (the default)** | | | |
| Draw calls a frame | 314 | 314 | the same: nothing is culled that was not before |
| Triangles a frame | 1.57 million | 1.57 million | |
| Chunks' vertices on the card | 161 MB | 161 MB | |
| The page's own copy of them | **169 MB** | **0** | let go once sent |
| The page's buffers in all | 293 MB | 124 MB | |
| Frame, drawn in software | 1,317 ms | 1,233 ms | noise: this machine cannot judge frame rate |
| Loaded enough to play | 40.7 s | 40.4 s | |
| Whole view loaded | 366 s | 371 s | no change here: see below |
| **View 128 m (new)** | | | |
| Draw calls a frame | 76 | 76 | a quarter of the default's |
| Triangles a frame | 0.68 million | 0.68 million | 43% of the default's |
| Chunks' vertices on the card | 39 MB | 39 MB | a quarter |
| The page's own copy | 41 MB | 0 | |
| Frame at full sharpness, 960×540 | not offered | 567 ms | |
| Frame at Picture: Soft, 480×270 | not offered | 400 ms | a quarter of the pixels |

- **Version 13 could not go below 224 m from the menu**; its 128 m row was measured through a test address, to compare like with like.
- **Memory.** The page-side saving is real everywhere. The card's share is unchanged. (In version 13 a chunk that had never been in view had not been sent to the card yet, so its card total grew as the player looked round; now every chunk is sent once when it arrives.)
- **Loading time did not change here, and the reason was looked for** (`s.pendingCols`, sampled while loading): the three workers finish about one and a half columns a second, because this machine's software drawing takes every core. The queues the frame budget governs (columns waiting to join, meshes waiting to be handed over) stayed at 0–3 throughout. So on this machine the workers are the limit, before and after. The budget now grows with the frame time for the case the review describes (a slow card, free cores); that case cannot be reproduced here.
- **Joining a column** costs 3.6–4.2 ms at the median, 12–16 ms at the 95th percentile and 25–53 ms at worst, per column, on the main thread (57 columns joined on a 96 m walk at 256 m). Version 13 joined each the moment it arrived: up to 3 in one frame on that walk. Now it is one a frame at 60 frames a second (`tests/engine9.test.ts`). At this machine's 1–3 frames a second the budget is larger by design, so the browser run itself shows up to 4 a frame.
- **Workers blocked** (`tests/e2e/engine.mjs`, in a real page): a frame's share of building overran its budget by 5.3 ms at the 95th percentile and 5.9 ms at worst over 60 frames. Before, a column was built in one go: 24 ms at the median and 74 ms at worst (timed in Node, 64 columns round the valley); in parts the longest part is about 10 ms at the median and 29 ms at worst.
- **Not measured:** smooth edges off (it needs a real card to mean anything), and sound over a long session in Safari or Firefox (the leak is closed by count, `tests/audio_leak.test.ts`; whether it was audible is for a real browser).

What the numbers mean on this machine: draw calls, triangles, bytes and the main thread's milliseconds are what a real computer would see. Frames a second are not (software drawing: 1–3 here where a laptop draws 60), so the gain from render scale and smooth edges is shown as pixels drawn, and the automatic drop was checked by feeding it frame times (`tests/settings.game.test.ts`), not by watching it happen.

## 2. Settings (DONE)

- **What there is now:** view distance (128, 160, 224, 256, 320, 384 m), picture (Sharp, Softer, Soft), smooth edges, "make the picture lighter by itself", mouse sensitivity, invert up/down, sound volume. All in the pause menu, all kept (`src/game/settings.ts`, key `settings` in the same store as the save).
- **Read safely:** a copy from version 13 (it has only view, sensitivity, invert, volume) keeps those and takes defaults for the rest. Anything missing, of the wrong kind or out of range takes its default or its limit; a copy that cannot be read at all gives the defaults; a store that refuses the write does not stop the game (`tests/settings.test.ts`, `tests/settings.game.test.ts`).
- **The game holds the settings, not the menu.** `Game.settings` is the one copy; the menu is shown it (`Hud.showSettings`) whenever it changes, including when the game changes one by itself.
- F3's panel has a line for the picture: its size in pixels, scale, view, smooth edges, auto.

## 3. The faults found and left (DONE)

### The valley walked into over its rim

**What it was.** From the canyon a walker climbed the valley's outer slope and came down its cliff to the floor by steps and falls that do no harm. `tools/rimwalk.ts` (new) floods the land from the tunnel's canyon mouth by the real player's step rules and lists every place the walk gets below the rim: there were two that led to the floor, both stairs of ledges that the cliff's noise happened to line up.

| | Where | The stair | The mend |
|---|---|---|---|
| South-east | bearing 50–59° from the valley's centre, about (1757, 94, 1107) | from the rim at (1734, 115, 1125) down to the creek's end | heights 86–97 made an overhang |
| North-east | bearing −32…−23°, about (1790, 104, 975), just north of the home | from the plateau at (1789, 120, 966) down to the floor at (1763, 69, 962) | heights 101–112 made an overhang |

**The mend** (`RIM_MENDS` in `src/gen/layout.ts`; one loop in `wallRadius`, `src/gen/terrain.ts`). In each band the face only ever steps back on the way down, never forward: it keeps its roughness as roofs and hollows and loses every ledge. Each band is 12 blocks high and about 16 m wide. A fall down one costs 56 health or more.

**Calls**

- **An overhang, not a flat wall.** The first try gave the band the outline of its top all the way down: sheer, and in the pictures it read as bare fluted pillars, plainly made. The overhang keeps the rock's own noise and is hard to pick out (pictures below).
- **12 high, not a deadly 21.** What the mends can honestly promise is "no free walk in" (next point), and 12 blocks does that with half the cliff changed. Tried at 24 and 21 first; the walk stops at the same place.
- **Only these two places**, as the brief says. The walk test finds no other way to the floor or the home. A third place, a dead-end ledge 26 below the plateau just south of the balcony at (1798, 101, 1044), was left: it leads nowhere by walking.
- **What "walked in" means, and what is still open.** The rule enforced is: steps, jumps and falls that do no harm. With falls that hurt, the cliff is still come down elsewhere: the least is five falls of 5 blocks (35 health in all) at bearing 130°, and with any fall short of a deadly one there are ways down most of the way round. Closing that needs a band with no ledge round the whole cliff, 20 blocks high: the mechanism is one line of data now (a `RIM_MENDS` entry from −180° to 180°), but it changes the upper cliff everywhere the owner looks, so it was not done. **For the lead to decide**; `tests/review_land.test.ts` prints these numbers on every run.
- **A dive is a third thing, found on the way.** Any water breaks any fall, so walking off the ridge above the valley's waterfall drops a player 48 blocks into the pool unharmed (tried with the real `Player`: 0–17 health lost). No mend of the rim closes that; only a change to what water does to a fall would, and that reaches every swim in the game. Left, pinned by a test, **for the lead to decide**. My recommendation: keep it. It is a one-way leap that echoes the script's own dive, it cannot be used to leave, hostiles cannot follow (the sanctuary rule is in code), and M1's steps still need the swim.
- **The reviewer's test asked for more than can be had** (no place inside the sanctuary's circle reached at all). The circle reaches 8 m onto the plateau, which is one piece with the land outside. The test now asserts what matters: nothing on the floor, nothing at the home, nothing more than 30 below the plateau, and nowhere to stand inside a mended band.
- **M1's "back from Zone 1" no longer ticks on the plateau.** Found while un-skipping the test: standing on the cliff's top edge counted as home. It now needs the player down in the valley or the home (`HOME_LEVEL`, `src/sim/milestones.ts`), below anywhere the top can be walked down to.
- **The sanctuary is untouched** (`inSanctuary` is not changed; generation asks `rimMendHeight`, which knows only the valley's centre and the bands).

**Saves.** The world layout number is not raised. A version 13 player saved standing on a ledge a mend took away is set down unhurt on the ground below, by the rule the ridge already had (`Player.setDown`), now also asked for inside a mended band (`inRimMend`). Tested on real version 13 saves made by version 13's own code (`tests/fixtures/v13/saves.json`; the script that made them is kept as `tools/make-v13-saves.test.ts.txt`): not in rock, not hurt, still in the valley, everything else kept, and hold H goes home.

**Only what was mended changed.** Every column east of the gorge (2,752) was hashed on `main` and here: seven differ. Two at each stair (55:30, 56:30; 54:34, 55:34) and three at the outpost's brush (27:32, 28:31, 28:32). `tests/faults9b.test.ts` pins those seven and every column next to them against version 13 (`tests/fixtures/v13-land.json`).

**Pictures** (`tools/shot.mjs`, `RD=5`, noon; before is version 13). Side by side in `docs/phase9b/`:

| Mend | From | Camera line (`name=x,y,z,yaw,pitch,hour`) | Picture |
|---|---|---|---|
| South-east | the valley floor | `rimA_floor=1725,72,1065,217,20,12` | [rimA_floor.jpg](phase9b/rimA_floor.jpg) |
| South-east | the balcony | `rimA_balcony=1796.5,83.62,1024.5,154,4,12` | [rimA_balcony.jpg](phase9b/rimA_balcony.jpg) |
| South-east | the floor's middle, wide | `rimA_wide=1700,72,1024,214,12,15` | |
| North-east | the valley floor | `rimB_floor=1745,72,1000,-60,33,12` | [rimB_floor.jpg](phase9b/rimB_floor.jpg) |
| North-east | the balcony | `rimB_balcony=1796.5,83.62,1024.5,9,23,12` | [rimB_balcony.jpg](phase9b/rimB_balcony.jpg) |
| North-east | the floor's middle, wide | `rimB_wide=1700,72,1024,-61,18,15` | |

What I saw in them: from the floor each mend is a patch of slightly smoother, shadowed rock about a sixth of the picture wide, with the cliff's ledges and moss unchanged round it; from the balcony the south-east one is lost in the middle distance and the north-east one is the cliff face a few metres past the balcony's north end, a little plainer than before. Neither reads as built.

**The lead's calls (2026-11-20), on the two questions above:**

- **The rim stays as mended:** closed to a free walk. Coming down it with falls that hurt (about 35 health at the cheapest place) is allowed: M1's "come home" already needs the swim, and no hostile can use the cliff (the sanctuary rule is in code).
- **The dive from the ridge over the valley's falls into the pool stays free:** it is the script's own entrance.

### The outpost's stealth route

- **What it was.** The lookout on his roof saw a walker on two stretches of the game trail. Not because the bushes stood on lower ground than the trail beside them (the first guess, tried: it changed nothing) but because the trail climbs as it leaves the outpost: a walker further up stood head and shoulders above the bushes lower down, and he looked along the slope.
- **The mend** (`src/gen/zone1far.ts`, `bushTop`). Each bush stands as tall over the highest ground of the trail within six metres as it stood over its own. On the slope that is bushes 4–7 high instead of 2–3, both sides of the trail; on level ground nothing changes. Gaps between bushes stay gaps, and the rule that no bush is a pit still holds (the walk tests pass).
- **Checked:** the skipped check in `tests/creatures_real.test.ts` runs and passes: nobody sees a walker anywhere on the trail. Camera for a look: `brush=893.5,96.7,1046.5,90,-6,12` (`RD=4`); before and after side by side: [brush.jpg](phase9b/brush.jpg).

### Saves: the three notes

| Note | What was done | Test (`tests/faults9b.test.ts`, `tests/faults9b.game.test.ts`) |
|---|---|---|
| `save:earlier` overwritten by a second old save, its write not checked | The first one kept is never written over: a second goes under `save:earlier:2`. The same bytes found again are not kept twice. If the write fails the player is told in plain words (`NOTES.earlierLost`) and play goes on. | 4 keeper tests, one with a store that takes no new keys and one that throws |
| A hand-over from a page from before valleys had names dropped when the store holds that valley | Two unnamed copies (names made from their own contents, `v-old-…`) are taken for the same valley and the later-saved one is used. A named valley is never replaced this way, and a stale hand-over still loses. | 3 game tests |
| "Made by an earlier build" hiding "can't keep saves" and "the last save failed" | The line about how the valley was opened and the warning the player can act on are both shown. The storage-did-not-open line stands alone, as it says the same itself. | 3 game tests |

### Generator version

The lead asked (2026-11-20, docs/STATUS.md) that before version 1 saves record the world generator's version, so that later land changes can keep old valleys whole. Built with the 4→5 upgrade: `WORLD_GEN` (src/save/save.ts, now 1: the land of Phase 9, rim mends and Track A's plants together), written into every save as `gen`. A save without it, which is every save from version 13, counts as today's (the lead's call: old valleys grow the new plants). The game keeps the number it loaded and writes it back unchanged; nothing reads it yet. A later build that changes land a valley has walked raises `WORLD_GEN`. Tests: `tests/faults9b.game.test.ts` ("the world generator's version…", and the version 13 round trip).

**Call:** when the old valley cannot be kept aside, the game says so and still saves the new one over it. Stopping all saving to protect a valley that this build cannot open anyway would cost the player the valley they are in. (The owner's rule: saves before version 1 need not be carried, only never crash or strand.)

### Esc, hold H, setting things down

- **Esc on the pause menu goes back to the game.** Not on a held key's repeats and not within 0.4 s of the pause, so the Esc that took the mouse cannot undo its own pause. A browser will not give the mouse back straight after Esc: play goes on with the mouse free and the game says "Click to look around" (the existing rule for a refused capture). Not on a valley not yet begun (that is Play's, with the opening). The controls list says "Esc: this menu, and back to the game".
- **Hold H works while starving, parched or out of air.** "Hurt" now means a loss from outside (a blow, a shot, a fall, the ridge's dose). What the body loses by itself is no longer "danger close". Before, a drowning or starving player was told "Not with danger this close", and died. A blow still refuses H for ten seconds and cancels a hold, also while starving.
- **Things can be set down.** In the pack, pick something up and click outside the window: it goes into a small sack at your feet (a new block, `sack`, drawn as the lost pack is; 9 slots). The next thing goes into the same sack while it has room. A sack opens like a chest; emptied, it is taken away when its screen closes. A click outside with nothing held closes the screen. The pack's help line says so. `src/sim/drop.ts`.
- **Call:** a sack, not loose items on the ground. There are no loose items anywhere in this game (a death leaves a sack too), and a sack cannot be walked past unseen or lost in grass: "nothing hidden that looks like everything around it".
- **Left:** digging beside water still lets the water in (the pool creeps inland). It needs a flow rule, which is Track A's "water edges". Doc on a carried phone is the owner's call (REVIEW.md, N6, 5).

### N5j and N9

- **N5j, a slab one block across a chunk's edge darkened the faces beside it.** `lightForDrawing` (`src/mesh/mesher.ts`) now corrects the padded chunk's border cells as well, from those of their neighbours the padded chunk holds. The test fails on the old code exactly as the review measured (corners 180, 180, 240, 240 against 240 all round).
- **N9, path-finding: answered, not built.** The review's own recommendation was to keep enemies outdoors or at posts, and Phases 7 and 8 did (the Ashen keep their designed doors; docs/PHASE7.md has the reason). Nothing since has needed an enemy to find its way indoors. What was false was a line of text: the old mine's toast promised "Underground, the danger is one higher", and nothing can spawn underground. The line is gone; the mine is lit all the way down and safe, which is what the owner asked of every such place.

## 4. Play with the mouse captured (DONE)

**It could be made stable.** `tests/e2e/capture.mjs` (new) captures the mouse for real in headless Chromium, for under a minute in all, on a small picture; the flood of empty moves that kills a long run (README) does no harm in that time. It passed each of the runs made here (three), 15 checks each:

| What | Checked |
|---|---|
| Play captures the mouse | the browser's lock is on the game's picture |
| Captured sensitivity | a move of 100 turns the view by exactly 100 × the sensitivity, without free-look's extra 1.4; sensitivity 2 turns twice as far; invert flips up and down |
| A screen takes the mouse and gives it back | E opens the pack: the mouse is free, the game not paused, the view does not turn; E again: captured again by itself |
| Esc | pauses, the menu up, the mouse free |
| Resume | plays with the mouse captured (at once, or after the one click the game asks for) |
| Esc on the menu | the Esc that paused does not also resume; a second one a moment later does |
| Capture lost with no key (another window in front) | the game pauses, nothing is left held down, and it stays paused |

**What only the owner can check, in a real window:**

1. After Esc, press Resume (or Esc again) at once. A real browser may refuse to take the mouse back for about a second: the game should then say "Click to look around", and one click should bring the look back. (Headless Chromium has no such pause, so this path is covered only by `tests/look.test.ts`.)
2. Whether mouse sensitivity 1 feels right on your mouse or trackpad, and whether the slider's ends (0.5 and 2.5) are useful.
3. Switch to another window with Cmd+Tab while playing, and come back: the game should be paused on the menu, and nothing should be moving by itself after Resume.

## 5. Other browsers (DONE, as far as it can be here)

**Neither WebKit nor Firefox can be run here.** Playwright 1.63 is installed with Chromium only (`/opt/pw-browsers` holds no `webkit-2359` or `firefox-1543`; both `launch()` calls answer "Executable doesn't exist"), and the brief says not to install another. So nothing below was run in Safari or Firefox: it is what reading the code against each browser's known differences found.

**One fault found and fixed**

- **Safari 15.0 to 15.3 refused every save.** `normaliseSave` copied a save with `structuredClone`, which those versions lack (they do have WebGL 2, so the game runs). The copy threw, the save was refused, and every reload began a fresh valley with the real one "kept aside". It now copies the save as the text it is where `structuredClone` is missing (`tests/faults9b.test.ts`, with the function taken away).

**Read and found sound**

| Thing | Safari | Firefox |
|---|---|---|
| WebGL 2, array textures, the block shader | 15 and later | yes |
| Workers made from the page's own script | yes | yes |
| Mouse capture | `requestPointerLock()` returns nothing there, not a promise: handled (`src/platform/look.ts`) | yes |
| Save compression (`CompressionStream`) | 16.4 and later; before that saves are plain text, and still read | 113 and later; the same |
| The tab lock (`navigator.locks`) | 15.4 and later; before that the save's own counter guards | yes |
| Sound | made on the first click; `AudioListener.positionX` and the older `setPosition` are both handled | the same |
| Placed sounds | panners are let go now (step 1): this was the review's Safari and Firefox risk | the same |

**For the owner to try in Safari on the Mac** (ten minutes):

1. Open the page, press Play: does the mouse look work, and does F3's first line say `workers ×N` and `store indexeddb`?
2. Play two minutes, press Esc, close the tab, open the page again: is the valley as you left it? **This is the one that matters most.** Safari keeps a page's storage apart, and sometimes for only a short time, when the page sits inside another site's frame, as the published page does. If the valley is gone, the save code and "Download save file" are the way to keep it, and the game should be saying so in the menu.
3. Open the pack with E and close it with E, then again with Esc: does the mouse look come back without a click each time? (If Safari wants a click, the game says "Click to look around".)
4. Play ten minutes outside the valley with sound on: does the sound stay clean (no crackle, no silence)?
5. Settings: set Picture to Soft and view distance to 128 m, reload: are both kept?

And in Firefox, if it is to hand: 1, 2 and 4.

## 6. What the script promises and is not there (DONE, with two things left)

| Promise | Before | Now |
|---|---|---|
| Builder's books unlock recipes | Everything known from the start | **The builder's handbooks stand on the bookshelves beside the journal.** A right-click on the shelves (already the third thing a new player is told to do) teaches the workshop: the kiln, the smelter, the anvil and the tannery show their recipes only after. Until then each says "How to work this is in the builder's handbooks: right-click the bookshelves in the cave." When the journal is put down the game says what was learned. |
| Banana, avocado, papaya | Items with no source | **Marco sells all three** (a lot of four bananas, three avocados or three papayas for one unit), and the builder's pantry holds the last of his. |
| Hammer | In the kit, did nothing | **Held, it takes apart anything built** (furniture, planks, brick, glass) twice as fast as any other tool; carried, the anvil makes twelve nails from an ingot instead of eight. |
| Handsaw | In the kit, did nothing | **Carried, a log gives six planks by hand** instead of four. |
| Water filter | In the kit, did nothing | **Water outside the valley is safe only with the filter in the pack.** Without it a drink still quenches but costs 6 health and says why (never the last of it), and a jug is not filled. In the valley water is clean as before. |
| Binoculars | In the kit, did nothing | **Hold the right mouse button with them in hand:** four times nearer, the hand as much finer. Let go, choose something else, open a screen or pause, and they come down. |
| The puma stalks from cover | It walked in, then ran | **It comes round behind you, and stops while you look at it.** Facing it holds it still (from 7 m in it rushes whatever you do); watched for 8 seconds it gives the hunt up and goes. A turned back is what it waits for. |
| Headlamp | In the kit, did nothing | **Not built yet.** Its light has to be drawn by the block shader, which is Track A's this phase. It is one uniform and two lines there; to do with step 8, once Track A is merged. A right-click with it in hand already says what it will do. |
| Spoilage | Nothing spoils | **Left.** It is not simple here: a stack has no age, so spoiling means a date on every stack, in every chest, through every save. The fridge and the smoker keep their present uses. |

A right-click with the hammer, the saw, the filter or the headlamp in hand says what it is for, as M5's things already did.

**Calls**

- **One flag for the handbooks, and the workshop only.** Nothing made by hand, at the workbench or on the stove waits for a book: the first day plays as it did. The bookshelf is steps from the bed and is the third goal on screen, so the gate is felt as "that is what those books are", not as a wall.
- **Save version 5, by the upgrade chain.** A valley begun before the handbooks existed has been using the workshop all along, so the upgrade from version 4 marks them read (`MIGRATIONS[4]`, `src/save/state.ts`). A valley not yet begun is left to read them. Tested on the real version 13 save: it opens knowing the workshop and is saved from then on as version 5. The world layout stays 2. (If Track A also raised the save version, the two steps go one after the other when the branches meet.)
- **The fruit is sold, not grown.** Growing it needs plants, and plants and their textures are Track A's (banana is on its list). When those plants exist, picking from them is a small step; until then the items have a source and a price.
- **The filter makes thirst matter outside without making it deadly.** Refusing the drink outright would kill a careless player beside a river. A cost of 6 health a drink, said in plain words, teaches the same thing. The filter is in the armory chest the fourth goal sends every player to, so a player who follows the goals carries it and sees no change.
- **The hammer is as good as it is on built things only.** On rock, earth and wood it is a fist: it does not replace the pickaxe, the shovel or the axe.
- **The puma's new rule is the script's, and it is fair.** The player is given a defence that costs nothing but attention, and a tell (it stops when seen). Where the game does not say which way the player faces, it stalks as before, so every older test of it stands.

## 7. Tests the review asked for (DONE)

| The review's item (E5) | What there is now | Where |
|---|---|---|
| 1. A streamer walk with a fake executor | The fixes branch had a healthy one-kilometre walk. Added: **two kilometres** across the whole world on an executor that answers one to four frames late and out of order, as a pool of workers does. Every chunk drawn at eight stops, every mesh belonging to a loaded column near the player, no column built twice, the loaded land never past what the view keeps. Then with **one job in ten failing**: each asked for once more and no hole left. Then **a column that never builds**: asked for four times, then left, the rest drawn, the place still "settled". And the player's edits outliving the land's unloading. | `tests/e5.test.ts` |
| 2. Seeded random edits against light lit from scratch | **Three seeds, 240 edits each**, on the real land of the home's cliff: lamps of every strength, glass, leaves, water, slabs, rock, and one edit in four undoing an earlier one; half of them within two blocks of a seam between columns, a third at the seams between chunks in height. After every 40 the middle column and a block into each neighbour are compared, cell for cell, with the same edits lit from scratch. **No difference found.** | `tests/e5.test.ts` |
| 3. A smoke test in a sandboxed frame | The game inside `<iframe sandbox="allow-scripts">` in a real browser: storage is blocked and the game starts, keeps the valley in memory and says so in the menu; the mouse cannot be captured and the game looks with the free mouse and says so; walk, pack, pause, resume; then left running. One minute of the game's clock by default, **five with `MINUTES=5`** (about half an hour here). No error. | `tests/e2e/engine.mjs` (part `sandbox`) |
| 4. A mesh budget at fixed viewpoints | The quads within 96 m of five places (the balcony 424,000; the valley floor's middle 359,000; the outpost 390,000; the dam's crest 332,000; the relay tower's yard 330,000), generated, lit and meshed as the game does it. More than a tenth off either way fails. | `tests/e5.test.ts` |
| 5. `playwright` declared | Done before this phase (it is a dev dependency in `package.json`). | |

**Found by them:** nothing in the engine. (Chromium will not let a page from another address hold a frame of this machine's page, so the sandbox test's holding page is served from the same address; the frame is sandboxed all the same and its origin is opaque.)

**What they showed about the sandboxed frame:** workers do start there (`workers ×3`), so the main-thread fallback is for pages that block workers outright, which `tests/e2e/engine.mjs` (part `fallback`) checks by taking `Worker` away.

## The fresh review (2026-11-20, second session)

_A read-only agent that wrote none of this went through `git diff origin/main...phase9b` at `c2f3c1f` (and read the generator-version commits after it), told to attack saves, settings, the mended land and the weaker-computer path with its own probes. Each finding, and what became of it._

| # | Finding | What became of it |
|---|---|---|
| 1 | **A hand-over could overwrite a newer save, or another valley.** The step 3 rule took two `v-old-…` copies for the same valley and used the later-dated one, but every hand-over is dated the moment it is made, and a valley born nameless keeps its `v-old-` name for ever (likely the owner's: version 11 wrote save version 1). So a stale page, or another nameless-born valley, passed. | **Fixed** (`src/game.ts`, `openValley`): the rule applies only when the hand-over itself carried no name and the store's copy has never been written by a build that counts its writes (seq 0). Test: `tests/faults9b.game.test.ts`, "a valley born nameless and written since…" (fails on the old code: wallet 250 for 100). |
| 2 | **The automatic drop saved over the player's choice,** including where the page had shortened the view by itself (workers blocked): the last step wrote 128 m over the player's 256 m. | **Fixed for the fallback page:** a view the page chose for itself is shortened for that page only; the kept view stays the player's. Test: `tests/settings.game.test.ts`, "…a shorter view is for that page only" (fails on the old code). **Kept as built otherwise:** on a page drawing the player's own view, a drop is kept, so a weak computer does not live through a minute of stutter at the start of every session. It is said each time, shown in Settings, can be put back, and the whole thing turned off. |
| 3 | **Possibly a way down the rim by running jumps and harmless falls** (the flood with `jumps: true`, about 40% sure: the flood's long leap is generous). | **Answered: not with the real Player.** The same flood was run with every leap longer than the level leap (3 blocks) tried by the real `Player` before it counts: a run-up of 0–3 blocks where there is ground for it, the jump taken at five points of the edge, the run let go at five points before the landing, and any fall that hurts refused. Of 496,436 long leaps it made 478,634; the flood reached 370,136 places and 7,143 within the bowl's circle, **none on the valley's floor and none at the home** (below the balcony's level + 12); the lowest it stands in the bowl is y 94, 24 above the floor. Along the reviewer's own way down, all of the 140 steps but one were made by the real Player; the one it cannot make (4 blocks across and 3 down, from (1691, 102, 926)) is what holds. The probe takes 16 minutes, so it is kept as `tools/rimjump-real.test.ts.txt`, not in the suite. |
| 4 | **Old stored view distances changed meaning:** a 4 or 6 kept by a build before version 13 opened there as 224 m, and would now be 128 m or 160 m. | **Fixed** (`src/game/settings.ts`): a settings copy without `rdOwn` (every one written before this build) is read as version 13 read it. Test: `tests/settings.test.ts` (fails on the old code). |
| 5 | **Smooth edges could not be turned off where only the browser's simplest storage is blocked,** yet the menu showed them off and promised it. | **Fixed:** the box goes back on and the player is told this page can't keep that choice. Test: `tests/settings.game.test.ts` (fails on the old code). |
| 6 | **Blocks a player put on a ledge the mend took away now hang in the air,** and paths cut through the outpost's brush have leaves over them again. | **Answered, left:** nothing is lost (edits are kept cell for cell; the reviewer confirmed only the 7 intended columns differ from version 13). A hanging block is mined away like any other. The same is true of Track A's new trees, by the lead's call. |

**Held up (verified by the reviewer):** the three real version-13 saves read the same here as on `main` but for the version and `books_read`; a made-up version-4 save with every field round-trips; an unbegun save gets no `books_read`; the upgrade run twice changes nothing; without `structuredClone` the save opens (on `main` it was refused); exactly 7 columns of 710 round the valley and the brush differ from version 13; `inSanctuary` is unchanged and no generation reads it; version-13 settings keep their values; the frame watch never trips at a steady 30 or 27.5 and trips at 26 after 14 s; nothing reads a chunk's released vertex arrays; a lost picture remeshes everything with no leak; every placed sound is shorter than its panner is kept; the handbooks gate covers the workshop's four stations and nothing else.
