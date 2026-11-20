// Phase 9A's parts of the game loop (docs/PHASE9A.md), run on the real Game with the browser's parts stubbed.
import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/render/renderer.ts', async () => (await import('./game/stubs.ts')).rendererModule);
vi.mock('../src/ui/hud.ts', async () => (await import('./game/stubs.ts')).hudModule);
vi.mock('../src/ui/inventoryScreen.ts', async () => (await import('./game/stubs.ts')).screenModule);
vi.mock('../src/ui/paperScreen.ts', async () => (await import('./game/stubs.ts')).paperModule);
vi.mock('../src/audio/audio.ts', async () => (await import('./game/stubs.ts')).audioModule);
vi.mock('../src/platform/look.ts', async () => (await import('./game/stubs.ts')).lookModule);
vi.mock('../src/ui/icons.ts', async () => (await import('./game/stubs.ts')).iconsModule);
vi.mock('../src/ui/mapView.ts', async () => (await import('./game/stubs.ts')).mapModule);
vi.mock('../src/platform/tablock.ts', async () => (await import('./game/stubs.ts')).tablockModule);

import { openPage, fire, play, browserStore, settle, type Page } from './game/harness.ts';
const SETTINGS_KEY = 'settings'; // (src/game.ts)
import { runJob, type GenResult } from '../src/jobs/tasks.ts';
import { blockId, blockName, BLOCK_DEFS } from '../src/world/blocks.ts';
import { CS } from '../src/world/constants.ts';
import { HOME } from '../src/gen/layout.ts';
import { EYE } from '../src/sim/player.ts';
import { SEATS } from '../src/game.ts';

vi.setConfig({ testTimeout: 120_000 });

interface In9 { target: unknown; placeBlock(): void; seat: unknown; breakBlock(x: number, y: number, z: number): void; wildEvents(ev: unknown): void; tick(dt: number): void }
const inside = (p: Page) => p.game as unknown as In9;

async function begun(): Promise<Page> {
  const p = await openPage();
  p.in.ready = true;
  p.in.resume();
  return p;
}
function land(p: Page, x0: number, z0: number, x1: number, z1: number): void {
  for (let cz = Math.floor(z0 / CS); cz <= Math.floor(z1 / CS); cz++)
    for (let cx = Math.floor(x0 / CS); cx <= Math.floor(x1 / CS); cx++)
      if (!p.game.world.column(cx, cz)) p.game.world.addColumn(cx, cz, (runJob({ kind: 'gen', cx, cz, edits: [] }).result as GenResult).chunks);
}
/** Every seat in the home, as generated. */
function seatsAtHome(p: Page): { x: number; y: number; z: number; id: number; name: string }[] {
  const out = [];
  for (let x = 1788; x < 1832; x++) for (let z = 1004; z < 1042; z++) for (let y = HOME.floor; y < HOME.floor + 2; y++) {
    const id = p.game.world.blockAt(x, y, z), name = BLOCK_DEFS[id]?.base ?? blockName(id);
    if (SEATS.has(name)) out.push({ x, y, z, id, name });
  }
  return out;
}
/** Stands the player a step from a seat and right-clicks it. */
function useSeat(p: Page, s: { x: number; y: number; z: number; id: number }, from: [number, number, number]): void {
  p.game.player.setPosition(...from);
  inside(p).target = { x: s.x, y: s.y, z: s.z, id: s.id, nx: 0, ny: 1, nz: 0, dist: 1.5 };
  inside(p).placeBlock();
}

describe('sitting (docs/PHASE9A.md, 8)', () => {
  it('the home has seats of every kind to sit on: chairs, the sofa, the balcony\'s loungers', async () => {
    const p = await begun();
    land(p, 1788, 1004, 1832, 1042);
    const names = new Set(seatsAtHome(p).map((s) => s.name));
    expect(seatsAtHome(p).length).toBeGreaterThan(8);
    for (const n of ['armchair', 'dining_chair', 'sofa_mid', 'lounger_head']) expect(names.has(n), n).toBe(true);
  });

  it('a right-click sits you down: the eye lower, the body still; a step stands you up where you stood', async () => {
    const p = await begun();
    land(p, 1788, 1004, 1832, 1042);
    const s = seatsAtHome(p).find((q) => q.name === 'armchair')!;
    const from: [number, number, number] = [1806.5, HOME.floor, 1024.5];
    useSeat(p, s, from);
    const pl = p.game.player;
    expect(inside(p).seat).not.toBeNull();
    expect(pl.x).toBeCloseTo(s.x + 0.5, 5);
    expect(pl.z).toBeCloseTo(s.z + 0.5, 5);
    // A sitter's eye: about 1.2 above the floor, not a stander's 1.62.
    expect(pl.eyeY - s.y).toBeGreaterThan(1.0);
    expect(pl.eyeY - s.y).toBeLessThan(1.3);
    expect(p.hud.toasts.some((t) => t.startsWith('Sitting'))).toBe(true);
    // Time passes: nothing moves the body, and the look is free.
    pl.yaw = 1.1; pl.pitch = -0.3;
    play(p, 2);
    expect(pl.x).toBeCloseTo(s.x + 0.5, 5);
    expect(pl.eyeY - s.y).toBeLessThan(1.3);
    expect(pl.yaw).toBeCloseTo(1.1, 5);
    // W: up, and back where you stood, looking the same way.
    fire('window', 'keydown', { code: 'KeyW' });
    expect(inside(p).seat).toBeNull();
    expect([pl.x, pl.y, pl.z]).toEqual(from);
    expect(pl.eyeY).toBeCloseTo(from[1] + EYE, 5);
    expect(pl.yaw).toBeCloseTo(1.1, 5);
    fire('window', 'keyup', { code: 'KeyW' });
  });

  it('a chair turns you the way it faces; clicking the seat you are on stands you up', async () => {
    const p = await begun();
    land(p, 1788, 1004, 1832, 1042);
    const s = seatsAtHome(p).find((q) => q.name === 'dining_chair')!;
    const from: [number, number, number] = [1806.5, HOME.floor, 1024.5];
    p.game.player.yaw = 0.37;
    useSeat(p, s, from);
    const facing = BLOCK_DEFS[s.id].facingIndex!;
    expect(p.game.player.yaw).toBeCloseTo([0, -Math.PI / 2, Math.PI, Math.PI / 2][facing], 5);
    inside(p).placeBlock(); // the same seat again
    expect(inside(p).seat).toBeNull();
    expect([p.game.player.x, p.game.player.y, p.game.player.z]).toEqual(from);
  });

  it('a save made while sitting records where you stood, not the seated body under the chair', async () => {
    const p = await begun();
    land(p, 1788, 1004, 1832, 1042);
    const s = seatsAtHome(p).find((q) => q.name === 'armchair')!;
    const from: [number, number, number] = [1806.5, HOME.floor, 1024.5];
    useSeat(p, s, from);
    expect(p.game.player.y).toBeLessThan(HOME.floor); // the seated body's feet are under the seat…
    const saved = p.game.snapshot().player;
    expect([saved.x, saved.y, saved.z]).toEqual(from); // …and the save does not say so
    fire('window', 'keydown', { code: 'Space' });
    fire('window', 'keyup', { code: 'Space' });
    const after = p.game.snapshot().player;
    expect([after.x, after.y, after.z]).toEqual(from);
  });

  it('a blow stands you up; so does the seat being mined from under you; and being moved (the way home) just leaves it', async () => {
    const p = await begun();
    land(p, 1788, 1004, 1832, 1042);
    const s = seatsAtHome(p).find((q) => q.name === 'armchair')!;
    const from: [number, number, number] = [1806.5, HOME.floor, 1024.5];
    useSeat(p, s, from);
    inside(p).wildEvents({ hits: [{ damage: 5, by: 'dog' }], sounds: [], kills: [], picked: 0, snared: [], raiders: [], jaguar: [], silent: [], ashen: [], caught: [], hens: [] });
    play(p, 0.2);
    expect(inside(p).seat).toBeNull();
    expect([p.game.player.x, p.game.player.z]).toEqual([from[0], from[2]]);

    useSeat(p, s, from);
    expect(inside(p).seat).not.toBeNull();
    p.game.world.setBlock(s.x, s.y, s.z, 0);
    play(p, 0.2);
    expect(inside(p).seat).toBeNull();
    expect(p.game.player.y).toBeGreaterThanOrEqual(HOME.floor - 0.01); // on the floor, not under it
    p.game.world.setBlock(s.x, s.y, s.z, s.id);

    useSeat(p, s, from);
    p.game.player.setPosition(1798.5, HOME.floor, 1024.5); // something else moved the body
    play(p, 0.2);
    expect(inside(p).seat).toBeNull();
    expect(p.game.player.x).toBeCloseTo(1798.5, 1); // and it was not pulled back to the chair
  });
});

describe('the Effects setting (docs/PHASE9A.md)', () => {
  const read = async (store: ReturnType<typeof browserStore>) => JSON.parse(new TextDecoder().decode((await store.get(SETTINGS_KEY))!));
  const renderer = (p: Page) => (p.game as unknown as { renderer: { effects: boolean } }).renderer;

  it('is on unless it was turned off; it is kept, and it turns the renderer\'s effects off and on', async () => {
    const store = browserStore();
    const first = await openPage(store);
    expect(renderer(first).effects).toBe(true);
    (first.hud.actions.setEffects as unknown as (on: boolean) => void)(false);
    await settle();
    expect(renderer(first).effects).toBe(false);
    expect((await read(store)).fx).toBe(false);
    const second = await openPage(store); // the page opened again
    expect(renderer(second).effects).toBe(false);
    expect((second.hud.settingsInputs as unknown as { fx: { checked: boolean } }).fx.checked).toBe(false);
  });

  it('a setting this build does not know is kept across a load and a save, not dropped', async () => {
    const store = browserStore();
    await store.set(SETTINGS_KEY, new TextEncoder().encode(JSON.stringify({ rd: 8, vol: 0.3, scale: 0.75, somethingNew: { a: 1 } })));
    const p = await openPage(store);
    (p.hud.actions.setVolume as unknown as (v: number) => void)(0.6);
    await settle();
    const kept = await read(store);
    expect(kept.vol).toBe(0.6);
    expect(kept.scale).toBe(0.75);
    expect(kept.somethingNew).toEqual({ a: 1 });
    expect(kept.fx).toBe(true);
  });
});
