// Found by the fresh review of the fixes–home join (2026-11-20): a save that opens shut inside something was
// moved to the arrival spot and the land loaded again, with nothing checking that spot was free. Built over as
// well (a wall on the balcony), every pass found the player shut in again and the loading never ended.

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

import { openPage, loadLand, play } from './game/harness.ts';
import { START } from '../src/save/state.ts';
import { blockId } from '../src/world/blocks.ts';

vi.setConfig({ testTimeout: 120_000 });

describe('a save that opens shut inside something', () => {
  it('still opens when the arrival spot is built over too, and the player ends somewhere they can stand', async () => {
    const page = await openPage();
    await loadLand(page);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = page.game as any;
    const at = (x: number, y: number, z: number) => g.world.blockAt(x, y, z);
    // A wall on the arrival spot…
    const [sx, sy, sz] = [Math.floor(START.x), Math.floor(START.y), Math.floor(START.z)];
    for (let y = sy; y <= sy + 2; y++) g.world.setBlock(sx, y, sz, blockId('planks'));
    // …and the player saved inside the hill over the cave.
    g.player.setPosition(1820.5, 95, 1024.5);
    expect(g.player.shutIn(at)).toBe(true);
    g.ready = false;
    await loadLand(page, 1500); // on the old code: "the land never finished loading"
    play(page, 0.5);
    expect(g.player.shutIn(at)).toBe(false);
    expect(g.player.fitsAt(g.player.x, g.player.y, g.player.z, at)).toBe(true);
    expect(Math.hypot(g.player.x - START.x, g.player.z - START.z)).toBeLessThan(5);
  });
});
