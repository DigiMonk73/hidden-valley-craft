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
(Zone-2 and power) and `play-zone3.mjs` (Zone-3, the Ashen and hydro). `play.mjs` runs them one after another and sums the checks; `PARTS=zone2 node
tests/e2e/play.mjs` runs only some, and `node tests/e2e/play-zone2.mjs` runs one directly.

The saves have their own short browser check (about two minutes): a walk with no edit surviving a reload, a second
tab, a slow storage open, a broken save (docs/FIXES.md, 1).

```bash
node tests/e2e/saves.mjs
```

```bash
RD=8 node tools/shot.mjs
```

A picture can be taken from any camera (`name=x,y,z,yawDeg,pitchDeg,hour`), and `EVAL` runs a script in
the page first, to place creatures. For example, the outpost's raiders at their posts, the lookout aiming:

```bash
EVAL="window.__hv.manOutpost(); window.__hv.game.wild.creatures.find(c => c.kind === 'lookout').mind = 'aim'" \
  DSF=1 RD=7 node tools/shot.mjs outpost=872,112,1012,180,-45,15
```

Two more drawing tools write into `out/`:

```bash
npm run map
```

```bash
node --experimental-strip-types tools/texsheet.ts
```

`npm run map` draws the world layout as a picture (and `node --experimental-strip-types --no-warnings
tools/zone2map.ts` draws Zone-2's, labelled, into `docs/phase6-map.png`, and `tools/zone3map.ts` Zone-3's into
`docs/phase7-map.png`); the second command draws every block texture side by side.

`node --experimental-strip-types --no-warnings tools/worldhash.ts out/now.json 21 63 0 63` hashes every generated
column east of the river's gorge, and `tools/worldhash.ts --diff tests/fixtures/east-of-ravine.json out/now.json` lists
those that differ from the land as it was before Phase 7. Run it after any change to the generator: only the
dam road's five columns may differ. The gorge's east rim west of those columns is hashed row by row
(`tools/worldhash.ts --rim out/rim.json`, baseline `tests/fixtures/east-rim.json`): a unit test checks that only
the reservoir's shore and the dam's east end differ.

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
| Rendering and sky | `src/render/` |
| Player, raycast and hotbar | `src/sim/` |
| Browser-only code (storage, files, mouse) | `src/platform/` |
| Saves | `src/save/` |
| HUD and menus | `src/ui/` |
| The game loop | `src/game.ts` |
| Block definitions | `data/blocks.json` |

Textures are original 16×16 pixel art drawn by code (`src/render/textures.ts`).
