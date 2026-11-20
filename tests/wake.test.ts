// N3e (docs/REVIEW.md; docs/FIXES.md, 3): the wake point is checked. Blocks stacked on it used to leave you inside
// them after a death or hold H; a shaft dug under it killed you over and over; a bed carried out of the valley
// and slept in moved "home" to the road. And the fridge's rule, split out of src/game.ts (docs/FIXES.md, 8).

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

import { openPage, play, type Page } from './game/harness.ts';
import { standable, findStand, settleWake, wakeFrom, type Spot } from '../src/sim/wake.ts';
import { chillJugs } from '../src/sim/power.ts';
import { START } from '../src/save/state.ts';
import { blockId } from '../src/world/blocks.ts';
import { itemId } from '../src/world/items.ts';
import { inSanctuary } from '../src/gen/layout.ts';
import type { Stack } from '../src/sim/inventory.ts';

vi.setConfig({ testTimeout: 60_000 });

const ROCK = blockId('limestone');
/** A flat floor at y 81 (so feet stand at 82), with whatever `extra` says on top of or cut into it. */
const floor = (extra: (x: number, y: number, z: number) => number | undefined = () => undefined) =>
  (x: number, y: number, z: number) => extra(x, y, z) ?? (y <= 81 ? ROCK : 0);
const balcony: Spot = { x: START.x, y: START.y, z: START.z, yaw: START.yaw };
const bed: Spot = { x: 1810.5, y: 82, z: 1018.5, yaw: 0 };

describe('a place to stand', () => {
  it('is two free cells with ground within a short drop', () => {
    expect(standable(floor(), 1810, 82, 1018)).toBe(true);
    expect(standable(floor(), 1810, 81, 1018)).toBe(false); // in the floor
    expect(standable(floor((x, y, z) => (x === 1810 && z === 1018 && y === 83 ? ROCK : undefined)), 1810, 82, 1018)).toBe(false); // no headroom
    expect(standable(floor((x, y, z) => (x === 1810 && z === 1018 && y <= 81 ? 0 : undefined)), 1810, 82, 1018)).toBe(false); // a shaft under it
    expect(findStand(floor(), 1810.5, 82, 1018.5, 3)).toEqual([1810.5, 82, 1018.5]);
  });
});

describe('where you wake', () => {
  it('is where you slept, as it was, when nothing has changed there', () => {
    expect(settleWake(floor(), bed, balcony)).toEqual({ x: bed.x, y: bed.y, z: bed.z, moved: null });
  });

  it('slept standing on a slab (feet half-way up a solid cell): that is a fine place to wake', () => {
    const slab = floor((x, y, z) => (x === 1810 && z === 1018 && y === 82 ? ROCK : undefined));
    expect(settleWake(slab, { ...bed, y: 82.5 }, balcony).moved).toBeNull();
  });

  it('three blocks stacked on it: you are set down beside them, not left inside', () => {
    const stacked = floor((x, y, z) => (x === 1810 && z === 1018 && y >= 82 && y <= 84 ? ROCK : undefined));
    const at = settleWake(stacked, bed, balcony);
    expect(at.moved).toBe('near');
    expect(standable(stacked, Math.floor(at.x), Math.floor(at.y), Math.floor(at.z))).toBe(true);
    expect(Math.hypot(at.x - bed.x, at.z - bed.z)).toBeLessThanOrEqual(1.5);
    expect(at.y).toBe(82);
  });

  it('a 22-deep shaft dug under it: you stand at its edge, not in it', () => {
    const shaft = floor((x, y, z) => (x === 1810 && z === 1018 && y <= 81 && y >= 60 ? 0 : undefined));
    const at = settleWake(shaft, bed, balcony);
    expect(at.moved).toBe('near');
    expect([Math.floor(at.x), Math.floor(at.z)]).not.toEqual([1810, 1018]);
    expect(at.y).toBe(82);
  });

  it('walled in for good (rock for five blocks all round): the balcony', () => {
    const tomb = floor((x, y, z) => (Math.abs(x - 1810) <= 5 && Math.abs(z - 1018) <= 5 && y >= 82 && y <= 90 ? ROCK : undefined));
    const at = settleWake(tomb, bed, balcony);
    expect(at.moved).toBe('balcony');
    expect(Math.hypot(at.x - balcony.x, at.z - balcony.z)).toBeLessThan(1);
  });

  it('a wake point outside the valley is not one: a bed slept in on the road does not move home there', () => {
    const road: Spot = { x: 1392.5, y: 99, z: 1028.5, yaw: 0 };
    expect(inSanctuary(road.x, road.z)).toBe(false);
    expect(wakeFrom(road, balcony)).toBe(balcony);
    expect(wakeFrom(bed, balcony)).toBe(bed);
  });
});

describe('in the game', () => {
  interface Hands { die(): void; goHome(): void }
  const hands = (p: Page) => p.game as unknown as Hands;
  /** Stands the game on a made floor instead of generated land. */
  function onFloor(p: Page, extra?: Parameters<typeof floor>[0]): void {
    const at = floor(extra);
    p.game.world.blockAt = at;
    p.game.world.isLoaded = () => true;
    p.in.ready = true;
  }

  it('hold H with blocks stacked on the wake point sets you beside them and says so', async () => {
    const p = await openPage();
    const g = p.game;
    g.spawn = { ...bed };
    onFloor(p, (x, y, z) => (x === 1810 && z === 1018 && y >= 82 && y <= 84 ? ROCK : undefined));
    hands(p).goHome();
    play(p, 0.3);
    expect(Math.floor(g.player.x) === 1810 && Math.floor(g.player.z) === 1018).toBe(false);
    expect(g.player.y).toBe(82);
    expect(p.hud.toasts.at(-1)).toContain('set down beside it');
  });

  it('a death with the wake point walled in wakes you on the balcony, and the wake point moves there', async () => {
    const p = await openPage();
    const g = p.game;
    g.spawn = { ...bed };
    onFloor(p, (x, y, z) => (Math.abs(x - 1810) <= 5 && Math.abs(z - 1018) <= 5 && y >= 82 && y <= 90 ? ROCK : undefined));
    g.vitals.hp = 0;
    hands(p).die();
    play(p, 0.3);
    expect(Math.hypot(g.player.x - START.x, g.player.z - START.z)).toBeLessThan(1);
    expect([g.spawn.x, g.spawn.z]).toEqual([START.x, START.z]);
    expect(p.hud.toasts.at(-1)).toContain('balcony');
  });

  it('a bed slept in outside the valley: hold H brings you to the balcony, not to the road', async () => {
    const p = await openPage();
    const g = p.game;
    g.spawn = { x: 1392.5, y: 99, z: 1028.5, yaw: 0 };
    onFloor(p);
    hands(p).goHome();
    play(p, 0.3);
    expect(Math.hypot(g.player.x - START.x, g.player.z - START.z)).toBeLessThan(1);
    expect(inSanctuary(g.spawn.x, g.spawn.z)).toBe(true);
  });
});

describe('the fridge', () => {
  const jug = itemId('water_jug'), cold = itemId('cold_water');
  it('chills one jug an hour, stacks cold water to eight, and leaves a full fridge as it is', () => {
    const slots: (Stack | null)[] = [{ id: jug, count: 3 }, null];
    expect(chillJugs(slots, 2, jug, cold)).toBe(2);
    expect(slots).toEqual([{ id: jug, count: 1 }, { id: cold, count: 2 }]);
    expect(chillJugs(slots, 5, jug, cold)).toBe(1); // only one jug left
    expect(slots).toEqual([null, { id: cold, count: 3 }]);
    const full: (Stack | null)[] = [{ id: jug, count: 2 }, { id: cold, count: 8 }];
    expect(chillJugs(full, 3, jug, cold)).toBe(0);
    expect(full).toEqual([{ id: jug, count: 2 }, { id: cold, count: 8 }]);
    expect(chillJugs([null, null], 4, jug, cold)).toBe(0);
  });
});
