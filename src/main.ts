// Entry point: reads test options from the address, starts the game, and exposes a small hook
// for automated checks (window.__hv).

import { Game, type BootOptions } from './game.ts';
import { SAVE_FORMAT, type SaveData } from './save/save.ts';
import { itemId, toolOf, toolFor } from './world/items.ts';
import { blockName } from './world/blocks.ts';
import { GARDEN, VALLEY } from './gen/layout.ts';

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
      spawn: (kind: 'rabbit' | 'deer' | 'boar' | 'puma', x: number, z: number) => game.spawnCreature(kind, x, z),
      rifleId: itemId('hunting_rifle'),
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
