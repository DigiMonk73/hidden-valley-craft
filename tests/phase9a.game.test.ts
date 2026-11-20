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
import { itemId } from '../src/world/items.ts';
import { SEATS } from '../src/game.ts';

vi.setConfig({ testTimeout: 120_000 });

interface In9 { target: unknown; placeBlock(): void; seat: unknown; usableTarget(): boolean; breakBlock(x: number, y: number, z: number): void; wildEvents(ev: unknown): void; tick(dt: number): void }
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
  p.game.player.onGround = true; // standing there
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

describe('sitting: what the fresh review found (docs/PHASE9A.md)', () => {
  const from: [number, number, number] = [1806.5, HOME.floor, 1024.5];

  it('a window seat is a whole block: you sit on top of it, and not on one with a pot standing on it', async () => {
    const p = await begun();
    land(p, 1788, 1004, 1832, 1042);
    const w = p.game.world, id = blockId('window_seat');
    w.setBlock(1806, HOME.floor, 1022, id);
    w.setBlock(1806, HOME.floor + 1, 1022, 0);
    useSeat(p, { x: 1806, y: HOME.floor, z: 1022, id }, from);
    expect(inside(p).seat).not.toBeNull();
    expect(p.game.player.eyeY - HOME.floor).toBeGreaterThan(1.6); // above the cushion, as on a chair (it was 1.17: inside the block's top)
    fire('window', 'keydown', { code: 'Space' });
    w.setBlock(1806, HOME.floor + 1, 1022, blockId('potted_orchid'));
    useSeat(p, { x: 1806, y: HOME.floor, z: 1022, id }, from);
    expect(inside(p).seat).toBeNull();
    expect(p.hud.toasts.some((t) => t.includes('on that seat'))).toBe(true);
  });

  it('not from mid-air or from the water; and a key still held from walking up does not stand you up again', async () => {
    const p = await begun();
    land(p, 1788, 1004, 1832, 1042);
    const s = seatsAtHome(p).find((q) => q.name === 'armchair')!;
    const pl = p.game.player;
    useSeat(p, s, from); pl.onGround = false; // (useSeat stands the player; undo that: falling)
    fire('window', 'keydown', { code: 'Space' });
    pl.setPosition(...from); pl.onGround = false;
    inside(p).target = { x: s.x, y: s.y, z: s.z, id: s.id, nx: 0, ny: 1, nz: 0, dist: 1.5 };
    inside(p).placeBlock();
    expect(inside(p).seat).toBeNull();
    pl.onGround = true; pl.inWater = true;
    inside(p).placeBlock();
    expect(inside(p).seat).toBeNull();
    pl.inWater = false;
    inside(p).placeBlock();
    expect(inside(p).seat).not.toBeNull();
    fire('window', 'keydown', { code: 'KeyW', repeat: true }); // the W that walked you here, repeating
    expect(inside(p).seat).not.toBeNull();
    fire('window', 'keydown', { code: 'KeyW' });
    expect(inside(p).seat).toBeNull();
  });

  it('seated, the body is not left in the water it sat down beside: its water flags are cleared', async () => {
    const p = await begun();
    land(p, 1788, 1004, 1832, 1042);
    const s = seatsAtHome(p).find((q) => q.name === 'armchair')!;
    useSeat(p, s, from);
    p.game.player.inWater = p.game.player.headInWater = true; // as if they had been set when it sat
    play(p, 0.3);
    expect(p.game.player.inWater).toBe(false);
    expect(p.game.player.headInWater).toBe(false);
  });

  it('with a gun or a bow in hand a seat under the cross is not something to use: the click is the weapon\'s', async () => {
    const p = await begun();
    land(p, 1788, 1004, 1832, 1042);
    const s = seatsAtHome(p).find((q) => q.name === 'armchair')!;
    const slots = (p.game.hotbar as unknown as { slots: ({ id: number; count: number } | null)[] }).slots;
    p.game.player.setPosition(...from); p.game.player.onGround = true;
    inside(p).target = { x: s.x, y: s.y, z: s.z, id: s.id, nx: 0, ny: 1, nz: 0, dist: 1.5 };
    slots[0] = null; p.game.hotbar.select(0);
    expect(inside(p).usableTarget()).toBe(true); // empty-handed: a seat is used
    slots[0] = { id: itemId('hunting_rifle'), count: 1 };
    expect(inside(p).usableTarget()).toBe(false); // the rifle fires instead (it sat you down, and no round was spent)
    inside(p).placeBlock();
    expect(inside(p).seat).toBeNull();
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
    expect(second.hud.shownSettings).toMatchObject({ fx: false }); // the menu shows it (Hud.showSettings, since the tracks met)
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
