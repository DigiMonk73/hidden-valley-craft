import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { load } from './load.ts';
import { HOME, HOME_GROUNDS, inSanctuary, WATERFALL } from '../src/gen/layout.ts';
import { HOME_FIT } from '../src/gen/home.ts';
import { HOME_CHESTS } from '../src/gen/inheritance.ts';
import { AIR, B_BOXES, B_BOX_GLOW, B_BOX_TEX, B_EMIT, B_SOLID, BLOCK_DEFS, BOX_FLAME, BOX_LIT, TEXTURE_NAMES, blockId, blockName } from '../src/world/blocks.ts';
import { hasTexture } from '../src/render/textures.ts';
import { stationOf } from '../src/sim/crafting.ts';
import { toggleDoor } from '../src/sim/interact.ts';
import { Player, EYE } from '../src/sim/player.ts';
import { meshChunk } from '../src/mesh/mesher.ts';
import { fromEarlierLayout, SAVE_FORMAT, SAVE_VERSION, WORLD_LAYOUT, type SaveData } from '../src/save/save.ts';
import { columnHash } from '../tools/landhash.ts';
import type { World } from '../src/world/world.ts';

// The home rebuilt (docs/HOME.md): the hearth, the range, the bedroom, the furniture, the patio.
const F = HOME.floor;
const home = () => load(1770, 990, 1850, 1060);
const name = (w: World, x: number, y: number, z: number) => blockName(w.blockAt(x, y, z));

/**
 * Everywhere a player can walk to from a starting cell, as "x,z" → the height they stand at there. Steps of up to
 * one block, drops of up to three, through open doors; the vault's steel door counts as open (it opens to a click).
 */
function walkable(w: World, sx: number, sz: number): Map<string, number> {
  const p = new Player();
  const at = (x: number, y: number, z: number) => { const id = w.blockAt(x, y, z); return /^steel_door/.test(blockName(id)) ? AIR : id; };
  const stand = (x: number, y: number, z: number): number | null => {
    // Step up (at most a block) until the body fits, then settle down onto what is below.
    let h = y, fits = false;
    for (let k = 0; k <= 16; k++) { if (p.fitsAt(x + 0.5, y + k / 16, z + 0.5, at)) { h = y + k / 16; fits = true; break; } }
    if (!fits) return null;
    for (let k = 0; k < 48 && p.fitsAt(x + 0.5, h - 1 / 16, z + 0.5, at); k++) h -= 1 / 16;
    return y - h > 3 ? null : h;
  };
  const seen = new Map<string, number>();
  const queue: [number, number, number][] = [[sx, stand(sx, F, sz)!, sz]];
  seen.set(`${sx},${sz}`, queue[0][1]);
  while (queue.length) {
    const [x, y, z] = queue.pop()!;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz, k = `${nx},${nz}`;
      if (seen.has(k) || nx < 1790 || nx > 1836 || nz < 1004 || nz > 1046) continue;
      const h = stand(nx, y, nz);
      if (h === null) continue;
      seen.set(k, h);
      queue.push([nx, h, nz]);
    }
  }
  return seen;
}

describe('the home, rebuilt', () => {
  const w = home();
  const reach = walkable(w, 1796, 1024); // from the balcony, where the game starts
  /** Can a walker stand within arm's reach of this block? */
  const reachable = (x: number, y: number, z: number) => {
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      const h = reach.get(`${x + dx},${z + dz}`);
      if (h !== undefined && Math.hypot(x + 0.5 - (x + dx + 0.5), y + 0.5 - (h + EYE), z + 0.5 - (z + dz + 0.5)) <= 3.2) return true;
    }
    return false;
  };

  it('changes nothing outside the home: the land round it is block for block what it was', () => {
    const before = readFileSync(new URL('./fixtures/land-near-home.txt', import.meta.url), 'utf8').trim().split('\n');
    expect(before.length).toBe(64);
    for (const line of before) {
      const [at, hash] = line.split(' ');
      const [cx, cz] = at.split(',').map(Number);
      expect(columnHash(cx, cz), `column ${at}`).toBe(hash);
    }
  });

  it('is all inside the sanctuary: the bedroom, its window, the range’s flue, the chimney', () => {
    const W = HOME_FIT.window;
    for (let z = W.z0; z < W.z1; z++) for (let x = W.x - 4; x <= W.x + 1; x++) expect(inSanctuary(x, z), `window ${x},${z}`).toBe(true);
    for (const [x, z] of [[HOME_FIT.chimney.x, HOME_FIT.chimney.z], [HOME_FIT.flueCap.x, HOME_FIT.flueCap.z], [HOME.wake.x, HOME.wake.z]]) expect(inSanctuary(x, z)).toBe(true);
    for (const r of HOME.rooms) {
      expect(r.x0).toBeGreaterThanOrEqual(HOME_GROUNDS.x0); expect(r.x1).toBeLessThanOrEqual(HOME_GROUNDS.x1);
      expect(r.z0).toBeGreaterThanOrEqual(HOME_GROUNDS.z0); expect(r.z1).toBeLessThanOrEqual(HOME_GROUNDS.z1);
    }
  });

  it('every chest of the inheritance can be walked to and opened', () => {
    for (const c of HOME_CHESTS) {
      expect(w.containerAt(c.x, c.y, c.z), c.title).not.toBeNull();
      expect(reachable(c.x, c.y, c.z), c.title).toBe(true);
    }
    // The wardrobe holds what the linen chest held, the journal among it; its top half is part of it.
    const [wx, wy, wz] = HOME_FIT.wardrobe;
    expect(name(w, wx, wy, wz)).toBe('wardrobe_lower');
    expect(name(w, wx, wy + 1, wz)).toBe('wardrobe_upper');
    expect(w.containerAt(wx, wy, wz)!.filter(Boolean).length).toBe(5);
  });

  it('everything that does something is where the game says, and can be reached', () => {
    const things: [string, number, number, number, RegExp][] = [
      ['the computer', ...HOME_FIT.desk.computer, /^computer/], ['the phone', ...HOME_FIT.desk.phone, /^phone/],
      ['the journal’s shelves', ...HOME_FIT.bookshelf, /^bookshelf/], ['the map table', ...HOME_FIT.mapTable, /^map_table/],
      ['the range', HOME_FIT.range.x, F, HOME_FIT.range.z, /^range_firebox/], ['the hearth', HOME_FIT.hearth.x, F, HOME_FIT.hearth.z, /^hearth_fire/],
      ['the workbench', 1820, F, 1007, /^workbench/], ['the smelter', 1823, F, 1006, /^smelter/], ['the kiln', 1826, F, 1006, /^kiln/],
      ['the anvil', 1820, F, 1012, /^anvil/], ['the tannery rack', 1817, F, 1012, /^tannery_rack/], ['the wall safe', 1829, F + 1, 1027, /^wall_safe/],
      ...HOME_FIT.bed.map(([x, y, z], k) => [`the bed (${k})`, x, y, z, /^bed_(head|foot)/] as [string, number, number, number, RegExp]),
    ];
    for (const [what, x, y, z, is] of things) {
      expect(name(w, x, y, z), what).toMatch(is);
      expect(reachable(x, y, z), what).toBe(true);
    }
    for (const z of [1023, 1024]) for (const y of [F, F + 1]) expect(name(w, 1826, y, z)).toBe('steel_door@east');
  });

  it('cooks at the range and at the hearth, whichever part is clicked', () => {
    for (const n of ['range_firebox@west', 'range_oven@west', 'range_tank@west', 'cook_pot', 'kettle', 'hearth_fire', 'hearth_flames', 'ember_bed', 'stove', 'fireplace'])
      expect(stationOf(blockId(n)), n).toBe('stove');
    expect(stationOf(blockId('range_hood@west'))).toBeNull();
  });

  it('the place you wake is free, at the foot of the bed, and looks straight out of the window at the valley', () => {
    const k = HOME.wake, p = new Player(), at = (x: number, y: number, z: number) => w.blockAt(x, y, z);
    expect(p.fitsAt(k.x, k.y, k.z, at)).toBe(true);
    expect(reach.has(`${Math.floor(k.x)},${Math.floor(k.z)}`)).toBe(true);
    expect(k.yaw).toBeCloseTo(Math.PI / 2); // west
    // West from the eye: open air, the glass, then open air out over the valley.
    const y = Math.floor(k.y + EYE), z = Math.floor(k.z);
    for (let x = Math.floor(k.x) - 1; x > HOME_FIT.window.x; x--) expect(name(w, x, y, z), `${x}`).toBe('air');
    expect(name(w, HOME_FIT.window.x, y, z)).toBe('glass');
    for (let x = HOME_FIT.window.x - 1; x > HOME_FIT.window.x - 12; x--) expect(B_SOLID[w.blockAt(x, y, z)], `${x}`).toBe(0);
  });

  it('is lit by its own lamps and fire: no floor a player can stand on indoors is dark at night', () => {
    let darkest = 15, where = '';
    for (const [k, h] of reach) {
      const [x, z] = k.split(',').map(Number);
      if (x < 1801) continue; // the balcony has the sky
      const blk = w.lightAt(x, Math.floor(h + 1), z) & 15;
      if (blk < darkest) { darkest = blk; where = k; }
    }
    expect(darkest, `darkest at ${where}`).toBeGreaterThanOrEqual(8);
  });

  it('every lantern hangs from something or stands on something', () => {
    let n = 0;
    for (let x = 1790; x <= 1836; x++) for (let z = 1004; z <= 1046; z++) for (let y = F; y < F + 8; y++) {
      if (name(w, x, y, z) !== 'lantern') continue;
      n++;
      expect(B_SOLID[w.blockAt(x, y + 1, z)] || B_SOLID[w.blockAt(x, y - 1, z)], `lantern ${x},${y},${z}`).toBeTruthy();
    }
    expect(n).toBeGreaterThanOrEqual(12);
  });

  it('opens to the outside only at the mouth: the window is glazed, and no hole leads out of the rock', () => {
    // Flood the air from the middle of the living room, through anything that is not solid.
    const open = (x: number, y: number, z: number) => !B_SOLID[w.blockAt(x, y, z)] || /^steel_door/.test(name(w, x, y, z));
    const seen = new Set<string>(), stack: [number, number, number][] = [[1808, F + 1, 1024]];
    while (stack.length) {
      const [x, y, z] = stack.pop()!;
      const k = `${x},${y},${z}`;
      if (seen.has(k) || !open(x, y, z)) continue;
      if (x <= 1800) continue; // out on the balcony: stop there
      expect(y, `open at ${k}`).toBeLessThan(F + 9);
      expect(y, `open at ${k}`).toBeGreaterThanOrEqual(F);
      if (x === 1801) { expect(z, `the mouth at ${k}`).toBeGreaterThanOrEqual(1017); expect(z, `the mouth at ${k}`).toBeLessThanOrEqual(1030); }
      seen.add(k);
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) stack.push([x + dx, y + dy, z + dz]);
    }
    expect(seen.has(`1808,${F},1038`)).toBe(true); // the bedroom is joined on, through its open door
    const W = HOME_FIT.window;
    for (let z = W.z0; z < W.z1; z++) for (let y = W.y0; y < W.y1; y++) expect(name(w, W.x, y, z)).toBe('glass');
  });

  it('the chimney comes out on the plateau under a pot, and the range’s flue ends in a cap in open air', () => {
    const C = HOME_FIT.chimney;
    expect(name(w, C.x, C.top, C.z)).toBe('chimney_pot');
    expect(name(w, C.x, C.top + 1, C.z)).toBe('air');
    expect(name(w, C.x, C.top - 1, C.z)).toBe('stone_bricks');
    let stack = 0;
    for (let y = C.top - 1; name(w, C.x, y, C.z) === 'stone_bricks'; y--) stack++;
    expect(stack).toBeGreaterThanOrEqual(2);
    for (let y = F + 3; y < C.top - stack; y++) expect(name(w, C.x, y, C.z), `flue at ${y}`).toBe('firebrick');
    // Beside the stack is open air: it stands clear of the ground.
    expect(name(w, C.x + 1, C.top - 1, C.z)).toBe('air');
    const cap = HOME_FIT.flueCap;
    expect(name(w, cap.x, cap.y, cap.z)).toBe('flue_cap');
    expect(name(w, cap.x, cap.y + 1, cap.z)).toBe('air');
    expect(name(w, cap.x, cap.y + 2, cap.z)).toBe('air');
    for (let y = F + 3; y < cap.y - 4; y++) expect(name(w, HOME_FIT.range.x, y, HOME_FIT.range.z)).toBe('stove_pipe');
    expect(name(w, HOME_FIT.range.x, cap.y - 4, HOME_FIT.range.z)).toBe('flue_elbow_low@west');
    expect(name(w, cap.x, cap.y - 4, cap.z)).toBe('flue_elbow_high@east');
  });

  it('the bedroom’s double door shuts and opens as one, and will not shut on someone standing in it', () => {
    const d = home();
    const [l, r] = HOME_FIT.door;
    expect(name(d, l[0], F, l[2])).toBe('door_wood_open');
    expect(name(d, r[0], F, r[2])).toBe('door_wood_r_open');
    expect(toggleDoor(d, l[0], F, l[2], (x, y, z) => x === r[0] && y === F && z === r[2])).toBe('blocked');
    expect(toggleDoor(d, l[0], F + 1, l[2])).toBe(true);
    for (const y of [F, F + 1]) { expect(name(d, l[0], y, l[2])).toBe('door_wood'); expect(name(d, r[0], y, r[2])).toBe('door_wood_r'); }
    expect(B_SOLID[d.blockAt(l[0], F, l[2])]).toBe(1);
    expect(toggleDoor(d, r[0], F, r[2])).toBe(true);
    for (const y of [F, F + 1]) { expect(name(d, l[0], y, l[2])).toBe('door_wood_open'); expect(name(d, r[0], y, r[2])).toBe('door_wood_r_open'); }
  });

  it('keeps the middle of the balcony clear, so nothing stands between the sofa and the falls', () => {
    // From the sofa's middle seat, at eye height, toward the waterfall: open air to the railing.
    const from = [1807.5, F + 1.3, 1020.5], to = [WATERFALL.x, 86, (WATERFALL.z0 + WATERFALL.z1) / 2];
    for (let x = 1805; x >= 1793; x--) {
      const t = (from[0] - (x + 0.5)) / (from[0] - to[0]);
      const y = Math.floor(from[1] + (to[1] - from[1]) * t), z = Math.floor(from[2] + (to[2] - from[2]) * t);
      expect(name(w, x, y, z), `${x},${y},${z}`).toBe('air');
    }
    // Nothing on the patio stands above the railing between the loungers and the dining table's end of the balcony.
    for (let x = 1793; x <= 1800; x++) for (let z = 1014; z <= 1027; z++) expect(name(w, x, F + 1, z), `${x},${z}`).toBe('air');
  });

  it('leaves the places for the awning, the planters and the telescope empty', () => {
    for (const [what, r] of Object.entries(HOME_FIT.reserved))
      for (let x = r.x0; x < r.x1; x++) for (let z = r.z0; z < r.z1; z++) {
        if (what === 'awning') { for (let y = F + 3; y <= F + 4; y++) if (x < 1800) expect(name(w, x, y, z), `${what} ${x},${y},${z}`).toBe('air'); }
        else expect(name(w, x, F, z), `${what} ${x},${z}`).toBe('air');
      }
  });

  it('the furniture is placed the right way round', () => {
    // The sofa and both armchairs look at the fire; the loungers at the falls; the range and the desk at their user.
    expect(name(w, 1806, F, 1020)).toBe('sofa_end'); expect(name(w, 1808, F, 1020)).toBe('sofa_end_r');
    expect(name(w, 1794, F, 1022)).toBe('lounger_head@west'); expect(name(w, 1793, F, 1022)).toBe('lounger_foot@west');
    expect(name(w, HOME_FIT.range.x, F, HOME_FIT.range.z)).toBe('range_firebox@west');
    expect(name(w, ...HOME_FIT.desk.computer)).toBe('computer@west');
    // A facing block's boxes turn with it: the sofa's back is to the south, the west-facing lounger's head-rest to the east.
    const tall = (n: string) => B_BOXES[blockId(n)]!.filter((b) => b[4] >= 13);
    for (const b of tall('sofa_mid')) expect(b[2]).toBeGreaterThanOrEqual(11);
    for (const b of tall('lounger_head@west')) expect(b[0]).toBeGreaterThanOrEqual(8);
  });
});

describe('furniture made of several boxes', () => {
  it('every box of every block names a texture that is drawn', () => {
    for (const d of BLOCK_DEFS) for (const t of d.boxTex ?? []) {
      if (!t) continue;
      for (const n of typeof t === 'string' ? [t] : Object.values(t)) expect(hasTexture(n as string), `${d.name}: ${n}`).toBe(true);
    }
  });

  it('a box takes its own texture; a lamp’s shade and a flame are drawn by their own light', () => {
    const lamp = blockId('table_lamp');
    const names = [...B_BOX_TEX[lamp]!].map((l) => TEXTURE_NAMES[l]);
    expect(names.slice(0, 6).every((n) => n === 'brass')).toBe(true);
    expect(names.slice(12).every((n) => n === 'lit_shade')).toBe(true);
    expect([...B_BOX_GLOW[lamp]!]).toEqual([0, 0, BOX_LIT]);
    expect([...B_BOX_GLOW[blockId('hearth_flames')]!]).toEqual([BOX_FLAME, BOX_FLAME, BOX_FLAME]);
    // In the mesh a glowing face carries face 7 (lit from within), and a flame is a sheet of two faces.
    const w = load(1790, 1010, 1830, 1040);
    const [x, y, z] = [HOME_FIT.hearth.x, HOME.floor + 1, HOME_FIT.hearth.z];
    const c = w.chunkAtBlock(x, y, z)!;
    const { blocks, light } = w.padded(c);
    const m = meshChunk(blocks, light).solid;
    let flameQuads = 0;
    for (let q = 0; q < m.quads; q++) {
      const v = q * 4;
      const px = m.positions[v * 3] + c.cx * 32, py = m.positions[v * 3 + 1] + c.cy * 32, pz = m.positions[v * 3 + 2] + c.cz * 32;
      if (px >= x && px <= x + 1 && py >= y && py <= y + 1 && pz >= z && pz <= z + 1 && (m.pack[v * 4] & 7) === 7) flameQuads++;
    }
    expect(flameQuads).toBe(6); // three sheets, two faces each
  });

  it('gives off light where it should', () => {
    for (const [n, least] of [['hearth_fire', 14], ['ember_bed', 9], ['range_firebox', 9], ['table_lamp', 9], ['wall_lamp', 10], ['candlestick', 6]] as [string, number][])
      expect(B_EMIT[blockId(n)], n).toBeGreaterThanOrEqual(least);
  });
});

describe('a valley saved before the home was rebuilt', () => {
  const save = (layout?: number) => ({ format: SAVE_FORMAT, version: SAVE_VERSION, layout } as SaveData);
  it('is known as from an earlier build, and one saved now is not', () => {
    expect(fromEarlierLayout(save())).toBe(true);
    expect(fromEarlierLayout(save(1))).toBe(true);
    expect(fromEarlierLayout(save(WORLD_LAYOUT))).toBe(false);
  });

  it('a player saved where a wall or furniture now stands is known to be shut in; one in the open is not', () => {
    const w = home(), at = (x: number, y: number, z: number) => w.blockAt(x, y, z);
    const p = new Player();
    p.setPosition(1813.5, F, 1016.5); // where the linen chest stood: open floor now
    expect(p.shutIn(at)).toBe(false);
    p.setPosition(1807.5, F + 3, 1012.5); // deep in the rock behind the hearth
    expect(p.shutIn(at)).toBe(true);
    p.setPosition(1806.5, F, 1041.5); // inside the wardrobe, two blocks high, under the plaster
    expect(p.shutIn(at)).toBe(false); // …rises onto it, as the game's own step does
    p.setPosition(1809.5, F - 4, 1038.5); // under the bedroom floor
    expect(p.shutIn(at)).toBe(true);
    // The balcony, where a rescued player is put, is free.
    expect(p.fitsAt(HOME.wallX - 3.5, F, 1024.5, at)).toBe(true);
  });
});
