// The builder's field guide (data/fieldguide.json): a book apart from the journal, on a reading stand in the study and
// as a copy carried. Its pages appear by flags; a page not yet seen is marked; a valley that opened the wardrobe before
// the guide was in it is given one copy, once. And the facts its pages quote are checked against the code.

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

import { openPage, memoryPending, loadLand, play, settle, browserStore, type Page } from './game/harness.ts';
import { FakePaper } from './game/stubs.ts';
import { newSave, BEGUN } from '../src/save/state.ts';
import { encodeSave, type SaveData } from '../src/save/save.ts';
import { SAVE_KEY } from '../src/save/keeper.ts';
import { blockId, blockName, BLOCK_DEFS } from '../src/world/blocks.ts';
import { itemId, hasItem } from '../src/world/items.ts';
import { HOME_FIT } from '../src/gen/home.ts';
import { HOME_CHESTS } from '../src/gen/inheritance.ts';
import { generateColumn } from '../src/gen/terrain.ts';
import { CS } from '../src/world/constants.ts';
import { GUIDE_PAGES, GUIDE_GIVEN, guidePages, markGuideRead, owesGuideCopy } from '../src/sim/fieldGuide.ts';
import { M1_STEPS, M2_STEPS, M3_STEPS, M4_STEPS } from '../src/sim/milestones.ts';
import { M5_STEPS } from '../src/sim/m5.ts';
import { nextGoal } from '../src/sim/guide.ts';
import { MARCO_HOURS } from '../src/game/people.ts';
import { BASE_SLOTS, BACKPACK_SLOTS } from '../src/sim/inventory.ts';
import { FOCUS_SECONDS, FOCUS_RECHARGE } from '../src/sim/focus.ts';
import { HOME_HOLD } from '../src/sim/home.ts';
import { STRIKE_HEIGHT } from '../src/entity/creatures.ts';
import { EGGS_MAX } from '../src/sim/livestock.ts';
import recipes from '../data/recipes.json' with { type: 'json' };
import { readdirSync, readFileSync } from 'node:fs';
import { PER_FUEL } from '../src/sim/preserve.ts';
import { HINTS } from '../src/sim/guide.ts';

vi.setConfig({ testTimeout: 180_000 });

const page = (id: string) => GUIDE_PAGES.find((p) => p.id === id)!;
const F = 82;

describe('the field guide’s pages', () => {
  it('a new valley has the first pages, and nothing ahead: Marco after the gate, the coop after M1', () => {
    const ids = (flags: string[]) => guidePages(new Set(flags)).map((p) => p.id);
    const first = ids([]);
    expect(first).toEqual(expect.arrayContaining(['home', 'water', 'garden', 'coffee', 'food', 'carry']));
    expect(first).not.toContain('marco');
    expect(first).not.toContain('chickens');
    expect(ids(['left_valley'])).toContain('marco');
    expect(ids(['armory_found'])).toContain('hunting');
    expect(ids(['m1_done'])).toEqual(expect.arrayContaining(['chickens', 'keeping']));
    expect(ids(['m1_done'])).not.toContain('power');
    expect(ids(['m2_done'])).toContain('power');
    expect(ids(['ashen_seen'])).toContain('ashen');
    // Every page has an id of its own, and every page's flag is one the game sets somewhere.
    expect(new Set(GUIDE_PAGES.map((p) => p.id)).size).toBe(GUIDE_PAGES.length);
    const src = readdirSync('src', { recursive: true }).filter((f) => String(f).endsWith('.ts')).map((f) => readFileSync(`src/${f}`, 'utf8')).join('\n');
    for (const p of GUIDE_PAGES) if (p.after) expect(src.includes(`'${p.after}'`) || p.after === 'books_read', `${p.id}: ${p.after}`).toBe(true);
    // A brand-new player is told nothing of what lies past the valley's first trip.
    for (const p of guidePages(new Set())) expect(p.text, p.id).not.toMatch(/grey ones|Ashen|Las Cruces|Ray|Zone 2|Zone 3|ridge/);
  });

  it('a page not yet read is marked new; once read, it is not; a page reached later is new again', () => {
    const flags = new Set<string>();
    expect(guidePages(flags).every((p) => p.fresh)).toBe(true);
    expect(markGuideRead(flags)).toBe(true);
    expect(guidePages(flags).some((p) => p.fresh)).toBe(false);
    expect(markGuideRead(flags)).toBe(false); // nothing new: nothing for the save
    flags.add('left_valley');
    expect(guidePages(flags).filter((p) => p.fresh).map((p) => p.id)).toEqual(expect.arrayContaining(['marco', 'falling']));
    expect(guidePages(flags).filter((p) => p.fresh).map((p) => p.id)).not.toContain('home');
  });

  it('a copy is owed once, and only to a valley whose wardrobe was opened before', () => {
    const fresh = new Set<string>();
    expect(owesGuideCopy(fresh, false)).toBe(false); // the wardrobe will give it
    expect(fresh.size).toBe(0); // and a valley's flags are left alone
    fresh.add(GUIDE_GIVEN); // opening the wardrobe in this build sets it
    expect(owesGuideCopy(fresh, true)).toBe(false); // so later, opened, nothing more
    const old = new Set<string>();
    expect(owesGuideCopy(old, true)).toBe(true);
    expect(owesGuideCopy(old, true)).toBe(false);
    expect(old.has(GUIDE_GIVEN)).toBe(true);
  });

  it('pages are short, plain and in the builder’s voice, never a manual’s', () => {
    for (const p of GUIDE_PAGES) {
      expect(p.text.length, p.id).toBeLessThan(1100);
      expect(p.text, p.id).not.toMatch(/\bpress\b/i);
      expect(p.title.length, p.id).toBeLessThan(40);
    }
  });
});

describe('what the pages say is what the code does', () => {
  const recipe = (out: string) => recipes.recipes.find((r) => r.out[0] === out)!;
  const ins = (out: string) => Object.fromEntries(recipe(out).in.map(([n, c]) => [n, c]));

  it('home, the hotbar and the dogs', () => {
    expect(HOME_HOLD).toBe(2);
    expect(page('hold_h').text).toMatch(/Hold the H key for two seconds/);
    expect(BACKPACK_SLOTS - BASE_SLOTS).toBe(9);
    expect(page('carry').text).toMatch(/nine more slots/);
    expect([FOCUS_SECONDS, FOCUS_RECHARGE]).toEqual([4, 12]);
    expect(page('carry').text).toMatch(/up to four seconds; it takes about twelve/);
    expect(STRIKE_HEIGHT).toBeLessThan(2);
    expect(page('zone1').text).toMatch(/cannot reach two blocks up/);
  });

  it('the smoker wants wood as well as meat, as the guide and the hint now say (the hint used to leave the wood out)', () => {
    expect(PER_FUEL).toBe(4);
    expect(page('keeping').text).toMatch(/each piece of fuel smokes four pieces of meat/);
    expect(HINTS.smoker).toMatch(/with some wood/);
    expect(HINTS.smoker).toMatch(/Each piece smokes four/);
  });

  it('the dose, the suit and the Ashen as the pages give them', () => {
    expect(page('radiation').text).toMatch(/never below forty/);
    expect(page('zone4').text).toMatch(/bind thirty/);
    expect(page('ashen').text).toMatch(/No more than three hunt at once/);
    expect(recipe('hazard_suit').in).toEqual([['canvas', 4], ['scrap_lead', 4], ['glass', 1], ['charcoal', 2]]);
    expect(ins('solar_array')).toEqual({ pv_panel: 4, wiring: 4, planks: 4, nails: 8 });
    expect(ins('battery_bank')).toEqual({ battery_cell: 6, wiring: 4, planks: 2, nails: 6 });
    expect(ins('mining_rig')).toEqual({ gpu: 2, psu: 1, mining_board: 1, wiring: 2 });
    expect(ins('powder_mill')).toEqual({ cobble: 4, planks: 4, nails: 6, iron_ingot: 2 });
    expect(ins('crucible_furnace')).toEqual({ crucible: 1, cobble: 8, clay: 4, iron_ingot: 2 });
    expect(ins('hydro_generator')).toEqual({ turbine_parts: 1, steel_ingot: 6, wiring: 4, sluice_tools: 0 });
    expect(ins('forge')).toEqual({ stone_bricks: 4, planks: 6, nails: 8, forge_parts: 1 });
    expect(ins('leghold_trap')).toEqual({ iron_ingot: 2, nails: 4, cordage: 1 });
    expect(ins('hunting_bow')).toEqual({ stick: 3, bowstring: 1 });
    expect(ins('raised_bed')).toEqual({ planks: 2, cordage: 1 });
    expect(ins('leather_armor')).toEqual({ leather: 6, cordage: 2 });
  });

  it('Marco keeps the hours the page gives', () => {
    expect(MARCO_HOURS).toEqual([7, 18]);
    expect(page('marco').text).toMatch(/from seven in the morning until six in the evening/);
  });

  it('the recipes it quotes', () => {
    expect(recipe('coffee')).toMatchObject({ station: 'stove', out: ['coffee', 3], in: [['coffee_beans', 3], ['water_jug', 1]], returns: [['empty_jug', 1]] });
    expect(page('coffee').text).toMatch(/three beans and a jug of water make three cups, and the jug comes back/);
    expect(ins('coop')).toEqual({ planks: 6, wire_mesh: 2, nails: 8 });
    expect(page('chickens').text).toMatch(/six planks, two wire mesh and eight nails/);
    expect(EGGS_MAX).toBe(8);
    expect(ins('hutch')).toEqual({ planks: 6, stick: 4, nails: 4 });
    expect(ins('snare')).toEqual({ stick: 2, cordage: 2 });
    expect(recipe('snare').out[1]).toBe(2);
    expect(ins('smoker')).toEqual({ cobble: 6, planks: 4, nails: 6 });
    expect(ins('jerky_rack')).toEqual({ planks: 3, cordage: 2 });
    expect(page('rabbits').text).toMatch(/six planks, four sticks and four nails/);
    expect(page('keeping').text).toMatch(/six cobble, four planks and six nails/);
    expect(page('keeping').text).toMatch(/three planks and two cordage/);
  });

  it('the kit it names is where it says', () => {
    const chest = (title: RegExp) => HOME_CHESTS.find((c) => title.test(c.title))!.items.map(([n]) => n);
    expect(chest(/^Expedition kit/)).toEqual(expect.arrayContaining(['water_filter', 'binoculars', 'headlamp', 'backpack_upgrade']));
    expect(chest(/^Armory/)).toEqual(expect.arrayContaining(['hunting_rifle', 'compound_bow', 'machete', 'armor_vest']));
    expect(chest(/^Tool wall/)).toContain('steel_hoe');
  });
});

describe('the "Next" line', () => {
  it('says where Marco’s shelter is, and every milestone line fits', () => {
    expect(nextGoal(new Set(['ate', 'drank', 'journal_read', 'armory_found', 'slept', 'left_valley', 'gate_both']))).toMatch(/^M1 · Meet Marco.*bus shelter.*old road.*saddle/);
    for (const s of [...M1_STEPS, ...M2_STEPS, ...M3_STEPS, ...M4_STEPS, ...M5_STEPS]) expect(s.label.length, s.flag).toBeLessThan(140);
  });

  it('the first goals tell a new arrival the field guide is there', () => {
    expect(nextGoal(new Set(['ate', 'drank']))).toMatch(/field guide/);
  });
});

describe('the reading stand in the study', () => {
  const cols = new Map<string, Uint16Array>();
  const at = (x: number, y: number, z: number) => {
    const k = `${x >> 5},${z >> 5}`;
    let c = cols.get(k);
    if (!c) cols.set(k, (c = generateColumn(x >> 5, z >> 5)));
    return blockName(c[(y << 10) | ((z & (CS - 1)) << 5) | (x & (CS - 1))]);
  };

  it('stands against the south wall between the shelves and the bedroom doorway, under a lamp that pairs with the doorway’s other', () => {
    // The owner's spot (2026-11-21): the plain wall left of the bedroom's double door, the lamp over it level with the
    // one right of the door, so the two frame the doorway. (It stood first in front of the shelves.)
    const [x, y, z] = HOME_FIT.guideStand;
    expect(y).toBe(F);
    expect(at(x, y, z)).toBe('field_guide_stand'); // its front to the north: the reader stands at z − 1
    expect(at(x + 1, y, z)).toBe('bookshelf'); // the shelves end beside it
    expect(at(x, y, z + 1)).toMatch(/^planks|^plaster|^stone_bricks|^limestone/); // the wall behind (the bedroom's timber partition)
    for (const [dx, dz] of HOME_FIT.door.map(([dx, , dz]) => [dx, dz])) expect(dx === x && dz === z, 'not in the doorway').toBe(false);
    for (const yy of [F, F + 1]) expect(at(x, yy, z - 1), `the reader’s place, ${yy}`).toBe('air');
    for (const yy of [F, F + 1]) for (const [dx] of HOME_FIT.door) expect(at(dx, yy, z), `the way to the door, ${dx},${yy}`).toBe('air');
    expect(at(x, F + 1, z)).toBe('air');
    expect(at(x, F + 2, z)).toBe('wall_lamp');
    expect(at(1805, F + 2, z)).toBe('wall_lamp'); // its pair, right of the doorway
    expect(at(1811, F, 1031)).toBe('air'); // the old place, in front of the shelves, is clear
    expect(at(1811, F + 2, 1031)).toBe('air');
    expect(at(...HOME_FIT.bookshelf)).toBe('bookshelf');
    expect(at(...HOME_FIT.desk.computer)).toBe('computer@west');
    const def = BLOCK_DEFS[blockId('field_guide_stand')];
    expect(def.label).toMatch(/field guide.*right-click to read/);
    expect(hasItem('field_guide')).toBe(true);
  });
});

const valley = (extra: Partial<SaveData> = {}): SaveData => ({ ...newSave(), flags: [BEGUN], ...extra });
const inner = (p: Page) => p.game as unknown as { target: unknown; placeBlock(): void; useHeldItem(): boolean; aim(): boolean };
async function onLand(save: SaveData): Promise<Page> {
  const store = browserStore();
  await store.set(SAVE_KEY, await encodeSave(save));
  const p = await openPage(store, memoryPending());
  await loadLand(p);
  p.in.resume();
  play(p, 2);
  return p;
}
const paper = () => FakePaper.last!;

describe('reading it in the game', () => {
  it('the stand opens the field guide, a bookshelf still opens the journal, and the copy in hand opens the guide', async () => {
    const p = await onLand(valley());
    const g = p.game;
    const [x, y, z] = HOME_FIT.guideStand;
    expect(g.world.blockAt(x, y, z)).toBe(blockId('field_guide_stand'));
    inner(p).target = { x, y, z, id: g.world.blockAt(x, y, z), nx: 0, ny: 0, nz: -1 };
    inner(p).placeBlock();
    expect(paper().shown.at(-1)).toBe('guide');
    expect(paper().guidePages[0].title).toBe('Getting out, and home');
    expect(paper().guidePages.every((pg) => pg.fresh)).toBe(true);
    expect(g.flags.has('journal_read')).toBe(false); // the guide is not the journal
    paper().close();
    // Read again: nothing is new.
    inner(p).placeBlock();
    expect(paper().guidePages.some((pg) => pg.fresh)).toBe(false);
    paper().close();
    const [sx, sy, sz] = HOME_FIT.bookshelf;
    inner(p).target = { x: sx, y: sy, z: sz, id: g.world.blockAt(sx, sy, sz), nx: -1, ny: 0, nz: 0 };
    inner(p).placeBlock();
    expect(paper().shown.at(-1)).toBe('journal');
    expect(g.flags.has('journal_read')).toBe(true);
    paper().close();
    // The copy, held, opens it anywhere.
    g.hotbar.slots[0] = { id: itemId('field_guide'), count: 1 };
    g.hotbar.selected = 0;
    inner(p).target = null;
    inner(p).useHeldItem();
    expect(paper().shown.at(-1)).toBe('guide');
  });

  it('a new valley finds the guide in the wardrobe, beside the journal, and none in the pack', async () => {
    const w = HOME_CHESTS.find((c) => c.block === 'wardrobe_lower')!;
    expect(w.items.map(([n]) => n)).toEqual(expect.arrayContaining(['builders_journal', 'field_guide']));
    const p = await onLand(valley());
    const g = p.game;
    expect(g.hotbar.count(itemId('field_guide'))).toBe(0);
    expect(g.flags.has(GUIDE_GIVEN)).toBe(false);
    // Opening it (its top half, as a player would) gives the guide with the journal, and marks the copy had.
    inner(p).target = { x: w.x, y: w.y + 1, z: w.z, id: g.world.blockAt(w.x, w.y + 1, w.z), nx: 1, ny: 0, nz: 0 };
    inner(p).placeBlock();
    const slots = g.world.containers.get(Array.from(g.world.containers.keys()).find((k) => g.world.containers.get(k)!.some((s) => s?.id === itemId('builders_journal')))!)!;
    expect(slots.some((s) => s?.id === itemId('field_guide'))).toBe(true);
    expect(g.flags.has(GUIDE_GIVEN)).toBe(true);
    // Saved and opened again: no second copy in the pack.
    await p.in.save(false);
    await settle(p);
    const q = await openPage(p.store, p.pending);
    await loadLand(q);
    expect(q.game.hotbar.count(itemId('field_guide'))).toBe(0);
  });

  it('a valley that opened the wardrobe before is given one copy into the pack, says so, and never a second', async () => {
    const w = HOME_CHESTS.find((c) => c.block === 'wardrobe_lower')!;
    const opened = valley({ containers: [[w.x, w.y, w.z, [{ name: 'bandage', count: 8 }, null, null]]] });
    const p = await onLand(opened);
    expect(p.game.hotbar.count(itemId('field_guide'))).toBe(1);
    expect(p.hud.toasts.join(' ')).toMatch(/field guide too.*in your pack/);
    // Saved and opened again: still one.
    await p.in.save(false);
    await settle(p);
    const q = await openPage(p.store, p.pending);
    await loadLand(q);
    expect(q.game.hotbar.count(itemId('field_guide'))).toBe(1);
    expect(q.game.flags.has(GUIDE_GIVEN)).toBe(true);
  });

  it('with a full pack the copy is put down in a sack at the player’s feet, and the message says so', async () => {
    const w = HOME_CHESTS.find((c) => c.block === 'wardrobe_lower')!;
    const full = Array.from({ length: BASE_SLOTS }, () => ({ name: 'cobble', count: 64 }));
    const p = await onLand(valley({ hotbar: full, containers: [[w.x, w.y, w.z, [null, null]]] }));
    expect(p.game.hotbar.count(itemId('field_guide'))).toBe(0);
    const sack = Array.from(p.game.world.containers.values()).find((c) => c.some((s) => s?.id === itemId('field_guide')));
    expect(sack).toBeTruthy();
    expect(p.hud.toasts.join(' ')).toMatch(/pack is full, so it is in a sack at your feet/);
  });

  it('with a bow in hand, a right-click on the stand still opens the guide, as on the shelves (it used to draw the bow)', async () => {
    const p = await onLand(valley());
    const g = p.game;
    const [x, y, z] = HOME_FIT.guideStand;
    g.hotbar.slots[0] = { id: itemId('compound_bow'), count: 1 };
    g.hotbar.slots[1] = { id: itemId('arrow'), count: 10 };
    g.hotbar.selected = 0;
    inner(p).target = { x, y, z, id: g.world.blockAt(x, y, z), nx: 0, ny: 0, nz: -1 };
    // The right button: the bow is not drawn at the stand (aim declines), so the click uses the stand.
    expect(inner(p).aim()).toBe(false);
    inner(p).placeBlock();
    expect(paper().shown.at(-1)).toBe('guide');
  });
});
