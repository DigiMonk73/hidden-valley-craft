// The garden's failures said in words, on the real Game with the browser's parts stubbed (the owner, 2026-11-20:
// beans right-clicked on plain dirt, and a hoe on the valley's grass, did nothing and said nothing).
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

import { openPage, fire, type Page } from './game/harness.ts';
import { HAND } from '../src/sim/inventory.ts';
import { runJob, type GenResult } from '../src/jobs/tasks.ts';
import { blockId, blockName } from '../src/world/blocks.ts';
import { CS } from '../src/world/constants.ts';
import { VALLEY } from '../src/gen/layout.ts';
import { itemId } from '../src/world/items.ts';

vi.setConfig({ testTimeout: 120_000 });

interface Inner { target: unknown; placeBlock(): void; breakBlock(x: number, y: number, z: number): void }
const inside = (p: Page) => p.game as unknown as Inner;
type Slots = ({ id: number; count: number } | null)[];

async function garden(): Promise<Page> {
  const p = await openPage();
  p.in.ready = true;
  p.in.resume();
  for (let cz = Math.floor(980 / CS); cz <= Math.floor(1000 / CS); cz++)
    for (let cx = Math.floor(1690 / CS); cx <= Math.floor(1710 / CS); cx++)
      if (!p.game.world.column(cx, cz)) p.game.world.addColumn(cx, cz, (runJob({ kind: 'gen', cx, cz, edits: [] }).result as GenResult).chunks);
  p.game.player.setPosition(1701.5, VALLEY.floor, 991.5);
  return p;
}
function hold(p: Page, item: string, count = 1): void {
  (p.game.hotbar as unknown as { slots: Slots }).slots[0] = { id: itemId(item), count };
  p.game.hotbar.select(0);
}
function rightClick(p: Page, x: number, y: number, z: number): void {
  inside(p).target = { x, y, z, id: p.game.world.blockAt(x, y, z), nx: 0, ny: 1, nz: 0, dist: 2 };
  inside(p).placeBlock();
}

describe('the garden says what to do', () => {
  it('beans on plain dirt say to till it first; the hoe tills grass through its tall grass; then the bean is planted', async () => {
    const p = await garden(), w = p.game.world;
    const x = 1700, z = 990, y = VALLEY.floor - 1;
    w.setBlock(x, y, z, blockId('dirt'));
    w.setBlock(x, y + 1, z, blockId('air'));
    hold(p, 'coffee_beans', 5);
    rightClick(p, x, y, z);
    expect(p.hud.toasts.at(-1)).toContain('with the hoe first');
    expect(p.game.hotbar.count(itemId('coffee_beans'))).toBe(5);

    w.setBlock(x, y, z, blockId('grass'));
    w.setBlock(x, y + 1, z, blockId('tall_grass'));
    hold(p, 'steel_hoe');
    rightClick(p, x, y + 1, z); // the eye's ray stops on the tall grass
    expect(blockName(w.blockAt(x, y, z))).toBe('farmland');

    hold(p, 'coffee_beans', 5);
    rightClick(p, x, y, z);
    expect(blockName(w.blockAt(x, y + 1, z))).toBe('coffee_bush_0');
    expect(p.game.hotbar.count(itemId('coffee_beans'))).toBe(4);
    rightClick(p, x, y, z);
    expect(p.hud.toasts.at(-1)).toContain('already grows there');
  });

  it('the hoe on stone says what it tills', async () => {
    const p = await garden(), w = p.game.world;
    const x = 1700, z = 990, y = VALLEY.floor - 1;
    w.setBlock(x, y, z, blockId('limestone'));
    w.setBlock(x, y + 1, z, blockId('air'));
    hold(p, 'steel_hoe');
    rightClick(p, x, y, z);
    expect(p.hud.toasts.at(-1)).toContain('The hoe tills');
  });

  it('digging up a coffee bush says to right-click a ripe one instead', async () => {
    const p = await garden(), w = p.game.world;
    const x = 1700, z = 990, y = VALLEY.floor;
    w.setBlock(x, y - 1, z, blockId('grass'));
    w.setBlock(x, y, z, blockId('coffee_bush_2'));
    p.game.hotbar.select(8);
    inside(p).breakBlock(x, y, z);
    expect(blockName(w.blockAt(x, y, z))).toBe('air');
    expect(p.hud.toasts.at(-1)).toContain('right-click a ripe bush');
  });
});

describe('the bare hand (the owner, 2026-11-20)', () => {
  it('the key left of 1 empties the hand with a full pack; 1 takes slot 1 back', async () => {
    const p = await garden();
    const slots = (p.game.hotbar as unknown as { slots: Slots }).slots;
    for (let i = 0; i < slots.length; i++) slots[i] = { id: itemId('canned_food'), count: 1 };
    for (const code of ['Backquote', 'IntlBackslash']) {
      p.game.hotbar.select(3);
      fire('window', 'keydown', { code });
      fire('window', 'keyup', { code });
      expect(p.game.hotbar.selected, code).toBe(HAND);
      expect(p.game.hotbar.current).toBeNull();
    }
    fire('window', 'keydown', { code: 'Digit1' });
    fire('window', 'keyup', { code: 'Digit1' });
    expect(p.game.hotbar.selected).toBe(0);
  });
});

