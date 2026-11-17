// Entry point: reads test options from the address, starts the game, and exposes a small hook
// for automated checks (window.__hv).

import { Game, type BootOptions } from './game.ts';

const q = new URLSearchParams(location.search);
const opts: BootOptions = {};
if (q.has('hour')) opts.hour = Number(q.get('hour'));
if (q.has('rd')) opts.renderChunks = Number(q.get('rd'));
if (q.has('test')) opts.test = true;
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

try {
  const game = new Game(canvas, ui, opts);
  (window as unknown as { __hv: unknown }).__hv = {
    game,
    idle: () => game.isIdle(),
    setCamera: (x: number, y: number, z: number, yaw: number, pitch: number) => game.setCamera(x, y, z, yaw, pitch),
    setHour: (h: number) => { game.hour = h; },
  };
  game.boot().catch(fail);
} catch (e) {
  fail(e);
}
