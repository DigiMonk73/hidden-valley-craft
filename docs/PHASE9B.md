# Phase 9, Track B — soundness

_The phase session's page (branch `phase9b`, begun 2026-11-20). The lead's brief is [PHASE9.md](PHASE9.md), Track B. Each step is marked DONE here when it is committed with its tests._

## The plan, in the order it is built

| # | Step | State |
|---|---|---|
| 1 | A path for weaker computers | DONE |
| 2 | Settings, kept across sessions | DONE |
| 3 | The faults found and left (the rim, the stealth route, the three save notes, Esc, H, dropping, N5j, N9) | DONE |
| 4 | Play with the mouse captured | |
| 5 | Other browsers | |
| 6 | What the script promises and is not there | |
| 7 | Tests (streamer walk, random light edits, sandboxed frame, mesh budget) | |
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
