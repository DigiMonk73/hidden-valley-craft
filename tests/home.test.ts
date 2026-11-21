import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { load } from './load.ts';
import { HOME, HOME_GROUNDS, inSanctuary, WATERFALL } from '../src/gen/layout.ts';
import { HOME_FIT } from '../src/gen/home.ts';
import { HOME_CHESTS } from '../src/gen/inheritance.ts';
import { AIR, B_BOXES, B_BOX_GLOW, B_BOX_TEX, B_EMIT, B_SOLID, BLOCK_DEFS, BOX_FLAME, BOX_LIT, TEXTURE_NAMES, blockId, blockName } from '../src/world/blocks.ts';
import { hasTexture } from '../src/render/textures.ts';
import { stationOf, stationAt } from '../src/sim/crafting.ts';
import { raycast } from '../src/sim/raycast.ts';
import { modelIconPixels } from '../src/ui/modelIcon.ts';
import { toggleDoor, breakBlock, placeBlock } from '../src/sim/interact.ts';
import { Inventory } from '../src/sim/inventory.ts';
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

  // The list was made on `main` before the home's work. 27 of its 64 columns were since changed by the review's land
  // fixes (docs/FIXES.md 3: the valley's ring, the creek's banks; each is named in tests/walk.test.ts, MENDED) and the
  // list now holds those as mended. When the two were merged, all 4,096 columns outside the home's box were hashed
  // with tools/landhash.ts before and after: every one matched (docs/FIXES.md 10).
  // Phase 9B (docs/PHASE9B.md, 3) then mended the valley's cliff in two places, on purpose: columns 55,30 and 56,30
  // (the north-east stair) and 54,34 and 55,34 (the south-east stair) have their new hashes in the list. Which
  // columns changed, and that their neighbours did not, is pinned by tests/faults9b.test.ts against version 13's land.
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
    // The wardrobe holds what the linen chest held, the journal and the field guide among it; its top half is part of it.
    const [wx, wy, wz] = HOME_FIT.wardrobe;
    expect(name(w, wx, wy, wz)).toBe('wardrobe_lower');
    expect(name(w, wx, wy + 1, wz)).toBe('wardrobe_upper');
    expect(w.containerAt(wx, wy, wz)!.filter(Boolean).length).toBe(6); // the journal and, beside it, the field guide
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
    for (const n of ['range_firebox@west', 'range_oven@west', 'range_tank@west', 'hearth_fire', 'hearth_flames', 'ember_bed', 'stove', 'fireplace'])
      expect(stationOf(blockId(n)), n).toBe('stove');
    expect(stationOf(blockId('range_hood@west'))).toBeNull();
  });

  it('the pot and the kettle on the range cook; the kettle on the sideboard, or one carried off, does not', () => {
    const w = home(), at = (x: number, y: number, z: number) => w.blockAt(x, y, z), R = HOME_FIT.range;
    expect(name(w, R.x, F + 1, R.z)).toBe('cook_pot');
    expect(stationAt(at, R.x, F + 1, R.z)).toBe('stove');
    expect(name(w, R.x, F + 1, R.z + 1)).toBe('kettle');
    expect(stationAt(at, R.x, F + 1, R.z + 1)).toBe('stove');
    expect(name(w, 1804, F + 1, 1032)).toBe('kettle');
    expect(stationAt(at, 1804, F + 1, 1032)).toBeNull();
    expect(stationOf(blockId('kettle'))).toBeNull();
    expect(stationAt(at, R.x, F, R.z)).toBe('stove');
  });

  it('standing anywhere in front of the hearth, the hearthstone included, a click on the fire cooks', () => {
    // On the raised hearthstone the eye is at the height of the mantel's shelf, inside its block: the ray must look
    // out of the cell the eye is in, not hit it.
    const w = home(), at = (x: number, y: number, z: number) => w.blockAt(x, y, z), H = HOME_FIT.hearth;
    const walk = walkable(w, 1797, 1024);
    let stood = 0;
    for (let x = H.x - 2; x <= H.x + 2; x++) for (let z = H.z + 2; z <= H.z + 4; z++) {
      const y = walk.get(`${x},${z}`);
      if (y === undefined) continue;
      if (z === H.z + 2 && Math.abs(x - H.x) === 2) continue; // hard against a jamb, the jamb hides the fire
      stood++;
      const [ox, oy, oz] = [x + 0.5, y + EYE, z + 0.5];
      const [dx, dy, dz] = [H.x + 0.5 - ox, F + 1.4 - oy, H.z + 0.5 - oz];
      const len = Math.hypot(dx, dy, dz);
      const hit = raycast(at, ox, oy, oz, dx / len, dy / len, dz / len, 5);
      expect(hit && stationAt(at, hit.x, hit.y, hit.z), `from ${x},${z}: ${hit && blockName(hit.id)}`).toBe('stove');
    }
    expect(stood).toBeGreaterThanOrEqual(12);
    expect(walk.get(`${H.x},${H.z + 2}`)).toBe(F + 0.5); // the hearthstone itself is stood on
  });

  it('the ray looks out of the cell the eye is in, unless that cell is solid or water', () => {
    const shelf = blockId('mantel_shelf'), stone = blockId('stone_bricks'), water = blockId('water');
    const world = (inCell: number) => (x: number, y: number, z: number) => (x === 0 && y === 0 && z === 0 ? inCell : x === 2 && y === 0 && z === 0 ? stone : AIR);
    expect(raycast(world(shelf), 0.5, 0.5, 0.5, 1, 0, 0, 5)).toMatchObject({ x: 2, id: stone });
    expect(raycast(world(stone), 0.5, 0.5, 0.5, 1, 0, 0, 5)).toMatchObject({ x: 0, id: stone, dist: 0 });
    expect(raycast(world(water), 0.5, 0.5, 0.5, 1, 0, 0, 5, true)).toMatchObject({ x: 0, id: water, dist: 0 });
    // From outside, the shelf is hit like anything else.
    expect(raycast(world(shelf), -1.5, 0.5, 0.5, 1, 0, 0, 5)).toMatchObject({ x: 0, id: shelf });
  });

  it('no furniture beside the balcony’s railing gets you over it: walking, sprinting or jumping', () => {
    const w = home(), at = (x: number, y: number, z: number) => w.blockAt(x, y, z), b = HOME.balcony;
    const over: string[] = [];
    for (let x = b.x0; x <= b.x1; x++) for (let z = b.z0; z <= b.z1; z++) {
      const id = at(x, F, z);
      if (!B_SOLID[id] || /railing/.test(blockName(id))) continue;
      const p = new Player();
      let top = F + 1;
      while (top > F && p.fitsAt(x + 0.5, top - 1 / 16, z + 0.5, at)) top -= 1 / 16;
      if (!p.fitsAt(x + 0.5, top, z + 0.5, at)) continue; // something stands on it
      // Eight ways, jumping all the while. The one way off is north, through the gap between the lantern posts.
      for (let dir = 0; dir < 8; dir++) for (const sprint of [false, true]) {
        p.setPosition(x + 0.5, top, z + 0.5);
        p.yaw = dir * Math.PI / 4;
        let crossed = '';
        for (let i = 0; i < 60 * 5 && !crossed; i++) {
          const wasZ = p.z;
          p.step(1 / 60, { forward: 1, strafe: 0, jump: true, sprint, descend: false }, at);
          if (p.x < b.x0 && p.z >= b.z0) crossed = 'west';
          else if (p.z >= b.z1 && p.x < b.x1) crossed = 'south';
          else if (wasZ >= b.z0 && p.z < b.z0 && (p.x < 1795 || p.x >= 1798)) crossed = 'north';
        }
        if (crossed) over.push(`${blockName(id)} at ${x},${z}, yaw ${dir * 45}°${sprint ? ', sprinting' : ''}: over the ${crossed} railing`);
      }
    }
    expect(over).toEqual([]);
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
      // On a chain, the chain runs up to something solid.
      let top = y + 1;
      while (name(w, x, top, z) === 'lamp_chain') top++;
      expect(B_SOLID[w.blockAt(x, top, z)] || B_SOLID[w.blockAt(x, y - 1, z)], `lantern ${x},${y},${z}`).toBeTruthy();
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
    for (let y = F + 3; y < C.top - stack; y++) expect(name(w, C.x, y, C.z), `flue at ${y}`).toBe('hearth_brick');
    // Beside the stack is open air: it stands clear of the ground.
    expect(name(w, C.x + 1, C.top - 1, C.z)).toBe('air');
    const cap = HOME_FIT.flueCap;
    expect(name(w, cap.x, cap.y, cap.z)).toBe('flue_cap');
    expect(name(w, cap.x, cap.y + 1, cap.z)).toBe('air');
    expect(name(w, cap.x, cap.y + 2, cap.z)).toBe('air');
    expect(cap.x).toBe(HOME_FIT.range.x);
    for (let y = F + 3; y < cap.y; y++) expect(name(w, cap.x, y, cap.z)).toBe('stove_pipe');
    expect(name(w, cap.x, F + 2, cap.z)).toBe('range_hood_mid@west');
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

  it('nowhere a player can come to stand on the balcony is above the furniture, on the railing or beyond it', () => {
    // A flood of every standing place reached by walking, sprinting and jumping from the middle of the balcony. The
    // second review climbed bench → lantern post → the railing's (unseen) top, and walked it: two steps, which a
    // test of single jumps from pieces beside the rail could not find.
    const w = home(), at = (x: number, y: number, z: number) => w.blockAt(x, y, z), b = HOME.balcony;
    const Q = 0.5, key = (x: number, y: number, z: number) => `${Math.round(x / Q)},${Math.round(y * 4)},${Math.round(z / Q)}`;
    const seen = new Set<string>(), queue: [number, number, number][] = [];
    const push = (x: number, y: number, z: number) => { const k = key(x, y, z); if (!seen.has(k)) { seen.add(k); queue.push([x, y, z]); } };
    push(1796.5, F, 1024.5);
    const onBalcony = (x: number, z: number) => x > b.x0 - 2 && x < b.x1 && z > b.z0 - 0.8 && z < b.z1 + 1; // not through the gap, not indoors
    const wrong: string[] = [];
    const p = new Player();
    while (queue.length && wrong.length < 5) {
      const [sx, sy, sz] = queue.pop()!;
      for (let d = 0; d < 8; d++) for (const sprint of [false, true]) for (const jumpAt of [-1, 0, 12, 28]) {
        p.setPosition(sx, sy, sz);
        p.yaw = (d * Math.PI) / 4;
        p.onGround = true;
        for (let i = 0; i < 60; i++) {
          p.step(1 / 60, { forward: 1, strafe: 0, jump: jumpAt >= 0 && i >= jumpAt, sprint, descend: false }, at);
          if (p.y < F - 0.5 && p.z < b.z0 + 1) break; // down off the side of the path outside the gap: not the balcony's business
          if (!onBalcony(p.x, p.z)) { if (p.x <= b.x0 - 2 || p.z >= b.z1 + 1) wrong.push(`over the railing from ${sx},${sy},${sz}`); break; }
          if (!p.onGround) continue;
          if (p.y > F + 1.01) { wrong.push(`stands at ${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)} from ${sx},${sy},${sz}`); break; }
          push(p.x, p.y, p.z);
        }
      }
    }
    expect(wrong).toEqual([]);
    expect(seen.size).toBeGreaterThan(300);
  }, 120_000);

  it('a door leaf put back from either side of the wall, or along it, matches its pair', () => {
    const [l, r] = HOME_FIT.door;
    for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) for (const [leaf, x] of [['door_wood', l[0]], ['door_wood_r', r[0]]] as [string, number][]) {
      const d = home(), z = l[2], inv = new Inventory(), was = leaf + '_open';
      for (const y of [F + 1, F]) breakBlock(d, inv, x, y, z);
      inv.select(inv.slots.findIndex((s) => s && s.id === blockId('door_wood')));
      for (const y of [F, F + 1]) placeBlock(d, inv, { intersectsBlock: () => false, yaw }, { x, y: y - 1, z, nx: 0, ny: 1, nz: 0, id: d.blockAt(x, y - 1, z), dist: 1 });
      for (const y of [F, F + 1]) expect(name(d, x, y, z), `${was} put back facing ${yaw.toFixed(2)}`).toBe(was);
    }
  }, 120_000); // generated land: seconds on a slow machine, past the default five

  it('a double door built from nothing, in either order and from either side, is a left and a right leaf that open to the jambs', () => {
    const [l, r] = HOME_FIT.door, z = l[2];
    for (const yaw of [0, Math.PI]) for (const order of [[l[0], r[0]], [r[0], l[0]]]) {
      const d = home(), inv = new Inventory();
      for (const x of [l[0], r[0]]) for (const y of [F + 1, F]) breakBlock(d, inv, x, y, z);
      expect(inv.count(blockId('door_wood'))).toBe(4);
      inv.select(inv.slots.findIndex((s) => s && s.id === blockId('door_wood')));
      for (const x of order) for (const y of [F, F + 1]) placeBlock(d, inv, { intersectsBlock: () => false, yaw }, { x, y: y - 1, z, nx: 0, ny: 1, nz: 0, id: d.blockAt(x, y - 1, z), dist: 1 });
      const what = `yaw ${yaw.toFixed(2)}, ${order.join(' then ')}`;
      // Shut, both leaves are in one plane and one facing; one click opens all four halves.
      const shut = [l[0], r[0]].map((x) => name(d, x, F, z));
      expect(shut.map((n) => n.replace(/^door_wood(_r)?/, '')), what).toEqual([shut[0].replace(/^door_wood(_r)?/, ''), shut[0].replace(/^door_wood(_r)?/, '')]);
      expect(shut.filter((n) => /^door_wood_r/.test(n)).length, what).toBe(1);
      expect(toggleDoor(d, l[0], F, z)).toBe(true);
      // Open, the west leaf stands along the west jamb and the east leaf along the east: the doorway is clear.
      for (const y of [F, F + 1]) {
        const west = B_BOXES[d.blockAt(l[0], y, z)]![0], east = B_BOXES[d.blockAt(r[0], y, z)]![0];
        expect(name(d, l[0], y, z), what).toMatch(/_open/);
        expect([west[0], west[3]], `${what}: west leaf`).toEqual([0, 3]);
        expect([east[0], east[3]], `${what}: east leaf`).toEqual([13, 16]);
      }
    }
  }, 120_000);

  it('what stands on a piece of furniture comes up with it, a whole stack of it, and nothing is lost when the pack is full', () => {
    const d = home(), inv = new Inventory();
    // The sideboard's lamp, on its counter.
    expect(name(d, 1802, F + 1, 1032)).toBe('table_lamp');
    expect(breakBlock(d, inv, 1802, F, 1032).changed).toBe(true);
    expect(name(d, 1802, F + 1, 1032)).toBe('air');
    expect(inv.count(blockId('table_lamp'))).toBe(1);
    expect(inv.count(blockId('counter'))).toBe(1);
    // A storm lantern on the kettle on the next counter: all three.
    d.setBlock(1804, F + 2, 1032, blockId('storm_lantern'));
    expect(breakBlock(d, inv, 1804, F, 1032).changed).toBe(true);
    for (const y of [F, F + 1, F + 2]) expect(name(d, 1804, y, 1032)).toBe('air');
    expect(inv.count(blockId('kettle'))).toBe(1);
    expect(inv.count(blockId('storm_lantern'))).toBe(1);
    // With room for the desk but not for the computer on it, both stay.
    const full = new Inventory();
    for (let i = 0; i < full.slots.length; i++) full.slots[i] = { id: blockId('cobble'), count: 1 };
    full.slots[0] = null;
    const [cx, cy, cz] = HOME_FIT.desk.computer;
    expect(breakBlock(d, full, cx, cy - 1, cz)).toMatchObject({ changed: false, full: true });
    expect(name(d, cx, cy, cz)).toBe('computer@west');
    expect(name(d, cx, cy - 1, cz)).toBe('desk@west');
    // What hangs on a wall is not standing on anything: the lamp over the firewood stays when the firewood goes.
    const H = HOME_FIT.hearth;
    expect(breakBlock(d, inv, H.x - 3, F, H.z + 1).changed).toBe(true);
    expect(name(d, H.x - 3, F + 2, H.z + 1)).toBe('wall_lamp@south');
  });

  it('a door leaf taken out goes back matching: either leaf, either half, open or shut', () => {
    const [l, r] = HOME_FIT.door;
    for (const shut of [false, true]) for (const [leaf, x] of [['door_wood', l[0]], ['door_wood_r', r[0]]] as [string, number][]) {
      const d = home(), z = l[2], inv = new Inventory();
      if (shut) toggleDoor(d, l[0], F, z);
      const was = leaf + (shut ? '' : '_open');
      for (const y of [F + 1, F]) { expect(name(d, x, y, z)).toBe(was); expect(breakBlock(d, inv, x, y, z).changed).toBe(true); }
      expect(inv.count(blockId('door_wood'))).toBe(2); // both leaves come up as the one kind of door
      inv.select(inv.slots.findIndex((s) => s && s.id === blockId('door_wood')));
      // Put back from the living room, facing south, onto the floor and then onto the lower half.
      for (const y of [F, F + 1]) placeBlock(d, inv, { intersectsBlock: () => false, yaw: Math.PI }, { x, y: y - 1, z, nx: 0, ny: 1, nz: 0, id: d.blockAt(x, y - 1, z), dist: 1 });
      for (const y of [F, F + 1]) expect(name(d, x, y, z), `${was} put back`).toBe(was);
      // And the pair still shuts and opens as one.
      expect(toggleDoor(d, x, F, z)).toBe(true);
      for (const y of [F, F + 1]) { expect(name(d, l[0], y, z)).toBe(shut ? 'door_wood_open' : 'door_wood'); expect(name(d, r[0], y, z)).toBe(shut ? 'door_wood_r_open' : 'door_wood_r'); }
    }
  });

  it('the fire’s flames go out with it when it is taken up, and burn again where it is set down; they cannot be mined alone', () => {
    const d = home(), H = HOME_FIT.hearth;
    const inv = new Inventory();
    expect(BLOCK_DEFS[blockId('hearth_flames')].hardness).toBeLessThan(0); // the game mines nothing with a hardness below 0
    expect(breakBlock(d, inv, H.x, F, H.z).changed).toBe(true);
    expect(name(d, H.x, F + 1, H.z)).toBe('air');
    expect(inv.count(blockId('hearth_fire'))).toBe(1);
    inv.select(inv.slots.findIndex((s) => s && s.id === blockId('hearth_fire')));
    expect(placeBlock(d, inv, { intersectsBlock: () => false }, { x: H.x, y: F - 1, z: H.z, nx: 0, ny: 1, nz: 0, id: d.blockAt(H.x, F - 1, H.z), dist: 1 })).toEqual([H.x, F, H.z]);
    expect(name(d, H.x, F + 1, H.z)).toBe('hearth_flames');
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

  it('the desk stands against the east wall, with no shelf behind it, laid out as before', () => {
    // The owner (2026-11-20): the shelves behind the desk looked wrong; take them out and put the desk to the wall.
    const [cx, cy, cz] = HOME_FIT.desk.computer;
    expect([cx, cy, cz]).toEqual([1814, F + 1, 1028]);
    expect(HOME_FIT.desk.phone).toEqual([cx, cy, cz + 1]);
    expect(HOME_FIT.desk.chair).toEqual([cx - 1, F, cz]);
    // Drawers, desk, drawers; the lamp, the computer and the phone on top; the chair in front, facing it.
    expect([cz - 1, cz, cz + 1].map((z) => name(w, cx, F, z))).toEqual(['desk_drawers@west', 'desk@west', 'desk_drawers@west']);
    expect([cz - 1, cz, cz + 1].map((z) => name(w, cx, cy, z))).toEqual(['desk_lamp@west', 'computer@west', 'phone']);
    expect(name(w, ...HOME_FIT.desk.chair)).toBe('desk_chair@east');
    for (const z of [cz - 1, cz, cz + 1]) {
      // Behind it the room's own rock, floor to ceiling: no shelf, no hole, no ore.
      for (let y = F; y <= F + 4; y++) expect(name(w, cx + 1, y, z), `wall ${y},${z}`).toBe('limestone');
      // Nothing is left of the shelves that stood where the desk now is, nor above it.
      for (let y = F + 2; y <= F + 4; y++) expect(name(w, cx, y, z), `above ${y},${z}`).toBe('air');
    }
    // The shelves start south of the desk and stop there: none north of it, none between it and the chair.
    for (let y = F; y <= F + 3; y++) {
      expect(name(w, cx, y, cz + 2), `shelf ${y}`).toBe('bookshelf');
      expect(name(w, cx, y, cz - 2), `north ${y}`).not.toBe('bookshelf');
    }
    for (let x = 1809; x < cx; x++) for (let z = cz - 1; z <= cz + 1; z++) expect(name(w, x, F + 1, z), `${x},${z}`).not.toBe('bookshelf');
    // The study's rug runs under the chair to the desk.
    expect(name(w, cx, F - 1, cz)).toMatch(/^rug_blue_/);
    expect(name(w, cx - 1, F - 1, cz)).toMatch(/^rug_blue_/);
  });

  it('the furniture is placed the right way round', () => {
    // The sofa and both armchairs look at the fire; the loungers at the falls; the range and the desk at their user.
    expect(name(w, 1806, F, 1020)).toBe('sofa_end'); expect(name(w, 1808, F, 1020)).toBe('sofa_end_r');
    expect(name(w, 1794, F, 1022)).toBe('lounger_head@west'); expect(name(w, 1793, F, 1022)).toBe('lounger_foot@west');
    expect(name(w, HOME_FIT.range.x, F, HOME_FIT.range.z)).toBe('range_firebox@west');
    expect(name(w, ...HOME_FIT.desk.computer)).toBe('computer@west'); // its screen to the chair behind the desk
    expect(name(w, ...HOME_FIT.desk.chair)).toBe('desk_chair@east');
    // A facing block's boxes turn with it: the sofa's back is to the south, the west-facing lounger's head-rest to the east.
    const tall = (n: string) => B_BOXES[blockId(n)]!.filter((b) => b[4] >= 13);
    for (const b of tall('sofa_mid')) expect(b[2]).toBeGreaterThanOrEqual(11);
    for (const b of tall('lounger_head@west')) expect(b[0]).toBeGreaterThanOrEqual(8);
  });
});

describe('furniture made of several boxes', () => {
  it('no block name and no texture is defined twice (a second one silently replaces the first)', () => {
    // The home's counter top once redrew the pharmacy counter's, and two branches each added a "firebrick".
    const names = (JSON.parse(readFileSync(new URL('../data/blocks.json', import.meta.url), 'utf8')) as { blocks: { name: string }[] }).blocks.map((b) => b.name);
    expect(names.filter((n, i) => names.indexOf(n) !== i)).toEqual([]);
    const drawn = [...readFileSync(new URL('../src/render/textures.ts', import.meta.url), 'utf8').matchAll(/^DRAW\.(\w+) = /gm)].map((m) => m[1]);
    expect(drawn.filter((n, i) => drawn.indexOf(n) !== i)).toEqual([]);
  });

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
    expect(names.slice(12, 24).every((n) => n === 'lit_shade')).toBe(true);
    expect([...B_BOX_GLOW[lamp]!]).toEqual([0, 0, BOX_LIT, BOX_LIT, 0]);
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

  it('each piece of furniture has its own picture in the pack, not one shared swatch', () => {
    // Before, a model block's icon was one face of its first texture: every walnut piece was the same brown square.
    const pieces = ['low_table', 'dining_table', 'dining_chair', 'nightstand', 'sofa_mid', 'armchair', 'table_lamp', 'desk', 'desk_chair', 'computer', 'chest', 'lantern', 'barrel', 'kettle'];
    const seen = new Map<string, string>();
    for (const n of pieces) {
      const px = modelIconPixels(blockId(n));
      let filled = 0;
      for (let i = 3; i < px.length; i += 4) if (px[i]) filled++;
      expect(filled, `${n} is drawn`).toBeGreaterThan(60);
      expect(filled, `${n} is a shape, not a filled square`).toBeLessThan(48 * 48 * 0.8);
      const key = Array.from(px).join(',');
      expect(seen.get(key), `${n} looks like no other`).toBeUndefined();
      seen.set(key, n);
    }
    // A lamp's shade is in its picture in its own colour (the box's own texture, not the block's brass).
    const lamp = modelIconPixels(blockId('desk_lamp'));
    let green = 0;
    for (let i = 0; i < lamp.length; i += 4) if (lamp[i + 3] && lamp[i + 1] > lamp[i] * 1.3 && lamp[i + 1] > lamp[i + 2]) green++;
    expect(green).toBeGreaterThan(10);
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
