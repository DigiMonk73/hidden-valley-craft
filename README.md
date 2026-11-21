# Hidden Valley — Block Edition

A block-built, browser version of *Hidden Valley*. A hidden karst valley is a permanently safe
home to mine, build and grow in. Outside it, danger rises zone by zone. It follows the script in
the Unity project's `docs/DESIGN.md` and is a separate game; the Unity project is never changed
from here.

- **The plan:** [docs/PLAN.md](docs/PLAN.md) covers the zones, the billionaire's inheritance and the phases 0–9.
- **Where things stand:** [docs/STATUS.md](docs/STATUS.md).
- **Licences:** [LICENSES.md](LICENSES.md).

## Run it

```bash
npm install
```

```bash
npm run dev
```

The page that is played is one self-contained file. Build it with:

```bash
npm run build
```

The build checks the types first (`tsc --noEmit`) and stops on a type error. The result is
`dist/index.html`, under 14 MB; the build fails above that.

## Check it

```bash
npm test
```

```bash
npm run typecheck
```

Both run on GitHub for every push and pull request, with the build (`.github/workflows/checks.yml`).

The end-to-end play-through and the screenshot tool both use headless Chromium, through `playwright`
(a dev dependency; `npm install` does not download a browser: run `npx playwright install chromium` once
if the machine has none). Serve the build first, because workers can't start from a `file://` page:

```bash
npx vite preview --port 4173
```

Then, in a second terminal:

```bash
node tests/e2e/play.mjs
```

The play-through is in parts, each a standalone script that sets its own scene and runs in about 15–25
minutes here: `play-valley.mjs` (home and the way out), `play-near.mjs` and `play-mid.mjs` (Zone-1), `play-zone2.mjs`
(Zone-2 and power), `play-zone3.mjs` (Zone-3, the Ashen and hydro) and `play-zone4.mjs` (Zone-4, the ridge, the uplink and the ending). `play.mjs` runs them one after another and sums the checks; `PARTS=zone2 node
tests/e2e/play.mjs` runs only some, and `node tests/e2e/play-zone2.mjs` runs one directly.

The saves have their own short browser check (about two minutes): a walk with no edit surviving a reload, a second
tab, a slow storage open, a broken save (docs/FIXES.md, 1).

```bash
node tests/e2e/saves.mjs
```

The engine has its own browser check (about ten minutes): the page keeps no copy of vertices the card has, a lost
picture comes back whole, the picture's settings do what they say and survive a reload, the land comes in with
workers blocked, and the game runs inside a sandboxed frame (docs/PHASE9B.md). `MINUTES=5` leaves the game running
in the frame for five minutes of its own clock.

```bash
node tests/e2e/engine.mjs
```

`node tests/e2e/capture.mjs` plays for under a minute with the mouse really captured (the play-through refuses
capture: see below): capture on Play, the captured sensitivity, Esc and Resume, a screen opened and closed.

`node --experimental-strip-types --no-warnings tools/rimwalk.ts` lists every place where a walk from the canyon gets
below the valley's rim (`jumps` adds running jumps and falls that hurt): run it after any change to the valley's cliff.

`node tools/perf.mjs` measures the load at the balcony (draw calls, triangles, memory, the main thread's time on a
walk); `RD=4` and `SET='{"scale":0.5}'` try other settings, `NOWORKERS=1` the main-thread fallback.

```bash
RD=8 node tools/shot.mjs
```

A picture can be taken from any camera (`name=x,y,z,yawDeg,pitchDeg,hour`), and `EVAL` runs a script in
the page first, to place creatures. For example, the outpost's raiders at their posts, the lookout aiming:

```bash
EVAL="window.__hv.manOutpost(); window.__hv.game.wild.creatures.find(c => c.kind === 'lookout').mind = 'aim'" \
  DSF=1 RD=7 node tools/shot.mjs outpost=872,112,1012,180,-45,15
```

The game's icon is drawn by code in `tools/icon.ts`, in four designs (`scene`, `falls`, `doorway`, `pixel`).
`node --experimental-strip-types --no-warnings tools/icon-sheet.ts` compares them in
`docs/review/icon-options.png`. Once the owner picks one, `node --experimental-strip-types --no-warnings tools/icon.ts <design>`
writes `assets/icon/` (PNGs at 16, 32, 48, 180, 192, 256, 512 and 1024 px, and `icon.ico`) and the inline favicon
links in `index.html`. The PNGs are not in the source bundle; rerun that command after a restore.

Two more drawing tools write into `out/`:

```bash
npm run map
```

```bash
node --experimental-strip-types tools/texsheet.ts
```

`node --experimental-strip-types --no-warnings tools/homeslice.ts y=82` prints a level of the home as letters, and
`tools/landhash.ts` hashes the land outside the home, to show a change to the home changed nothing else (docs/HOME.md).
`node tools/showroom.mjs table chair@south` photographs pieces of furniture from where a player would stand.
`node tools/shots-phase8.mjs` photographs Phase 8's screens as they are played: the dose meter, the telescope, the uplink's answers, the closing card, the map table (`out/p8h_*.png`).

`node tools/shots9a.mjs <tag> valley water road far life rain sump sit hand` takes Phase 9A's pictures (docs/PHASE9A.md): the same
cameras before and after a change, many to a page load (`out/9a/<tag>-<name>.png`); `BASE=` points it at another served build, `ONLY=`
picks views by name. `node tools/handroom.mjs name item[:swing[:aim[:draw]]] …` photographs the hand and what it holds without loading
the world, and `/tools/birdroom.html` shows the three birds; both need the dev server (`npx vite --port 5173`).

`npm run map` draws the world layout as a picture (and `node --experimental-strip-types --no-warnings
tools/zone2map.ts` draws Zone-2's, labelled, into `docs/phase6-map.png`, `tools/zone3map.ts` Zone-3's into
`docs/phase7-map.png`, and `tools/zone4map.ts` Zone-4's into `docs/phase8-map.png`); the second command draws every block texture side by side.

`node --experimental-strip-types --no-warnings tools/worldhash.ts out/now.json 21 63 0 63` hashes every generated
column east of the river's gorge, and `tools/worldhash.ts --diff tests/fixtures/east-of-ravine.json out/now.json` lists
those that differ from the land as it was before Phase 7. Run it after any change to the generator: only the
dam road's five columns may differ. (These hashes are taken with version 13's plants, `generateColumn(cx, cz, 'v13')`: Phase 9A's
trees, bananas and vines differ from them only where a plant or open air was, which `tests/plants.test.ts` checks.) The gorge's east rim west of those columns is hashed row by row
(`tools/worldhash.ts --rim out/rim.json`, baseline `tests/fixtures/east-rim.json`): a unit test checks that only
the reservoir's shore and the dam's east end differ.

`tests/fixtures/before-n3.json` is the whole world (`… tools/worldhash.ts out/now.json 0 63 0 63`) as it was before
the fixes to the review's finding N3 (the pit by the home path, the cave under the valley's cliff, the gorge's west
wall). `tests/walk.test.ts` lists the 117 columns that differ and checks that their neighbours do not; it also
walks every named route on the generated land with the real `Player`'s step rules (about 50 s). The 42 of those
columns east of the gorge have their new hashes in `east-of-ravine.json`.

### When the play-through's browser tab dies, or memory is in question

`MEM=1 PARTS=mid node tests/e2e/play.mjs` prints a `MEM` line every ten seconds: the browser processes' sizes, the
main thread's heap and buffers, each worker's heap and buffers, and the counts of everything that could pile up
(creatures, arrows, loaded columns, the streamer's queues, meshes, page elements). Every thirty seconds it names the
functions that allocated most since, on the main thread and in the workers. Build with `npx vite build --minify false`
first so the names can be read, and rebuild normally afterwards. A tab that crashes is reported as a failed check.
**The play-through does not capture the mouse.** Headless Chromium answers a pointer lock with an endless stream of
mouse moves that move nothing, 60,000 to 85,000 folded into each frame's event: about 30 MB a second of the
browser's own memory, half the frame rate, and when a frame stalls, a dead tab. So `tests/e2e/lib.mjs` tells the page
capture is not allowed and the game uses its free-look fallback; a check at the start of every part fails if the
page hears from a mouse nobody touched. `LOCK=1` captures the mouse as before, to see it.

`HC=8` makes the page believe the machine has eight cores (the game starts up to six workers by it), and `DSF=0.2`
draws a twenty-fifth of the pixels, to try what happens on a different machine.

## How it is built

The stack is TypeScript, Vite and Three.js (WebGL 2), with Web Workers.

**The world**
- It is bounded and designed: 2,048 × 2,048 × 192 blocks, 1 block = 1 m.
- It is generated from `src/gen/layout.ts`, so the same layout always gives the same world.
- Saves store only the player's edits.

**Main parts**

| Part | Path |
|---|---|
| Generation | `src/gen/` |
| Light (flood fill, sky and block) | `src/world/light.ts` |
| Chunk store and edits | `src/world/world.ts` |
| Streaming | `src/world/streamer.ts` |
| Meshing (per-face, corner shading, smooth light) | `src/mesh/mesher.ts` |
| Workers, with a main-thread fallback | `src/jobs/` |
| Rendering and sky (the hand, glow, birds, rain, the far land) | `src/render/` |
| Player, raycast and hotbar | `src/sim/` |
| Browser-only code (storage, files, mouse) | `src/platform/` |
| Saves | `src/save/` |
| HUD and menus | `src/ui/` |
| The game loop | `src/game.ts` |
| Block definitions | `data/blocks.json` |

Textures are original 16×16 pixel art drawn by code (`src/render/textures.ts`).
