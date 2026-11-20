# Phase 9, Track B — soundness

_The phase session's page (branch `phase9b`, begun 2026-11-20). The lead's brief is [PHASE9.md](PHASE9.md), Track B. Each step is marked DONE here when it is committed with its tests._

## The plan, in the order it is built

| # | Step | State |
|---|---|---|
| 1 | A path for weaker computers | DONE |
| 2 | Settings, kept across sessions | DONE |
| 3 | The faults found and left (the rim, the stealth route, the three save notes, Esc, H, dropping, N5j, N9) | |
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
