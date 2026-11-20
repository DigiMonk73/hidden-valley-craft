// Entry point: reads test options from the address, starts the game, and exposes a small hook
// for automated checks (window.__hv).

import { Game, type BootOptions } from './game.ts';
import { SAVE_FORMAT, type SaveData } from './save/save.ts';
import { itemId, toolOf, toolFor } from './world/items.ts';
import { blockName } from './world/blocks.ts';
import { GARDEN, VALLEY, ZONE1, SADDLE, ZONE1FAR, HOME } from './gen/layout.ts';
import { HOME_FIT } from './gen/home.ts';
import { SCOUT_AT, MARCO_SPOT, YARD, DEN, BARN_CRATES, APPLE_TREE } from './gen/zone1.ts';
import { POSTS, OUTPOST_AT, DECK_END, CAMP_MARKER, RAIDER_CRATE, RAIDER_FORGE, RUSTED_TRAP, LODGE_CHEST, CAMP_AT } from './gen/zone1far.ts';
import { manOutpost } from './entity/outpost.ts';
import { ZONE2 } from './gen/layout.ts';
import * as Z2 from './gen/zone2.ts';
import { ZONE3 } from './gen/layout.ts';
import * as Z3 from './gen/zone3.ts';
import { manAshen } from './entity/ashen.ts';
import { floorNear } from './entity/wild.ts';
import { makeJaguar } from './entity/jaguar.ts';
import { groundAt } from './entity/spawner.ts';
import type { Kind } from './entity/creatures.ts';

const q = new URLSearchParams(location.search);
const opts: BootOptions = {};
if (q.has('hour')) opts.hour = Number(q.get('hour'));
if (q.has('rd')) opts.renderChunks = Number(q.get('rd'));
if (q.has('test')) opts.test = true;
if (q.has('fx')) opts.effects = true; // particles even in test mode, for screenshots
if (q.has('cam')) {
  const v = q.get('cam')!.split(',').map(Number);
  if (v.length === 5 && v.every(Number.isFinite)) opts.cam = v as BootOptions['cam'];
}

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;

function fail(err: unknown): void {
  console.error(err);
  ui.innerHTML = '';
  const box = document.createElement('div');
  box.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;pointer-events:auto';
  box.textContent = `Hidden Valley couldn't start here: ${err instanceof Error ? err.message : String(err)}. It needs a browser with WebGL 2 (current Chrome, Safari, Firefox or Edge).`;
  ui.appendChild(box);
}

// When a new version is published while the page is open, claude.ai hands the old page's state
// to the new one (window.claude.hot). The state handed over is an ordinary save.
type Hot = { ready?: (start: (data: unknown) => void) => void; data?: unknown; snapshot?: (fn: () => unknown) => void };
const hot = (window as unknown as { claude?: { hot?: Hot } }).claude?.hot;

function start(data: unknown): void {
  try {
    const d = data as SaveData | undefined;
    if (d && d.format === SAVE_FORMAT) opts.handover = d;
    const game = new Game(canvas, ui, opts);
    (window as unknown as { __hv: unknown }).__hv = {
      game,
      idle: () => game.isIdle(),
      setCamera: (x: number, y: number, z: number, yaw: number, pitch: number) => game.setCamera(x, y, z, yaw, pitch),
      setHour: (h: number) => { game.hour = h; },
      spawn: (kind: Kind, x: number, z: number) => game.spawnCreature(kind, x, z),
      /** Zone-1's places (docs/PHASE4.md, docs/PHASE5.md), for setting scenes. */
      places: { ZONE1, SADDLE, SCOUT_AT, MARCO_SPOT, YARD, DEN, BARN_CRATES, ZONE1FAR, POSTS, OUTPOST_AT, DECK_END, CAMP_MARKER, CAMP_AT, RAIDER_CRATE, RAIDER_FORGE, RUSTED_TRAP, LODGE_CHEST, APPLE_TREE,
        ZONE2, Z2: { GATE_X: Z2.GATE_X, TOWER_POSTS: Z2.TOWER_POSTS, PHARMACY_COUNTER: Z2.PHARMACY_COUNTER, HARDWARE_CRATE: Z2.HARDWARE_CRATE, SERVER_RACKS: Z2.SERVER_RACKS, UPS_CABINETS: Z2.UPS_CABINETS, DISPLAY_FRIDGES: Z2.DISPLAY_FRIDGES, HOT_POOL: Z2.HOT_POOL, CAVE_FLOOR: Z2.CAVE_FLOOR, COMPOUND_FLOOR: Z2.COMPOUND_FLOOR },
        ZONE3, Z3: { LOGBOOK_DESK: Z3.LOGBOOK_DESK, PARTS_CRATE: Z3.PARTS_CRATE, TOOL_LOCKER: Z3.TOOL_LOCKER, CONTROL_CABINETS: Z3.CONTROL_CABINETS, OLD_LATHES: Z3.OLD_LATHES, STEEL_RACKS: Z3.STEEL_RACKS, SHOP_CRATE: Z3.SHOP_CRATE,
          FOUNDRY_CRUCIBLE: Z3.FOUNDRY_CRUCIBLE, BOXCAR_CRATE: Z3.BOXCAR_CRATE, GALLERY_FLOOR: Z3.GALLERY_FLOOR, CROSSING_LIGHTS: Z3.CROSSING_LIGHTS } },
      /** Puts the outpost's living raiders at their posts now (screenshots and checks run with spawning off). */
      manOutpost: () => {
        const w = game.wild, p = game.player;
        const made = manOutpost(w.creatures, w.outpost, p.x, p.z, () => true);
        w.creatures.push(...made);
        return made.length;
      },
      /** Puts Zone-3's Ashen in their nests now (and, by day the first time, one out in the road): for screenshots and checks with spawning off. */
      manAshen: (night = false) => {
        const w = game.wild, p = game.player;
        const made = manAshen(w.creatures, w.ashen, p.x, p.z, night, () => true, (x, y, z) => floorNear(x, y, z, (bx, by, bz) => game.world.blockAt(bx, by, bz)));
        w.creatures.push(...made);
        return made.length;
      },
      /** Starts the jaguar's crossing of the camp's clearing. */
      jaguar: () => {
        const j = makeJaguar((x, z) => groundAt(x, z, (bx, by, bz) => game.world.blockAt(bx, by, bz)));
        return j && game.wild.add(j) ? j : null;
      },
      /** The home's layout (docs/HOME.md), for the play-through. */
      HOME, HOME_FIT,
      rifleId: itemId('hunting_rifle'),
      itemId,
      blockName,
      /** The hotbar slot holding the right tool for a block, or -1. */
      bestTool: (block: number) => game.hotbar.slots.findIndex((st) => st && toolOf(st.id)?.kind === toolFor(block)),
      gardenStages: () => {
        let n = 0;
        for (let z = GARDEN.z0; z < GARDEN.z1; z++) for (let x = GARDEN.x0; x < GARDEN.x1; x++) {
          const m = blockName(game.world.blockAt(x, VALLEY.floor, z)).match(/^crop_\w+_(\d)$/);
          if (m) n += Number(m[1]);
        }
        return n;
      },
    };
    try { hot?.snapshot?.(() => game.snapshot()); } catch { /* an older viewer without hand-over */ }
    game.boot().catch(fail);
  } catch (e) {
    fail(e);
  }
}

if (hot?.ready) hot.ready(start);
else start(hot?.data ?? {});
