// Phase 5 (docs/PHASE5.md): Zone-1's mid and deep bands. This file starts with the lead's extra
// (creatures never put on roofs) and grows with each step.

import { describe, it, expect } from 'vitest';
import { groundAt } from '../src/entity/spawner.ts';
import { ZONE1 } from '../src/gen/layout.ts';
import { MARCO_SPOT } from '../src/gen/zone1.ts';
import { World } from '../src/world/world.ts';
import { runJob, type GenResult } from '../src/jobs/tasks.ts';
import { CS } from '../src/world/constants.ts';
import { blockId, blockName } from '../src/world/blocks.ts';

export function load(x0: number, z0: number, x1: number, z1: number): World {
  const w = new World();
  for (let cz = Math.floor(z0 / CS); cz <= Math.floor(z1 / CS); cz++)
    for (let cx = Math.floor(x0 / CS); cx <= Math.floor(x1 / CS); cx++)
      w.addColumn(cx, cz, (runJob({ kind: 'gen', cx, cz, edits: [] }).result as GenResult).chunks);
  return w;
}

describe('live spawns stand on the ground, never on a roof or a built thing (the lead, 2026-11-18)', () => {
  const w = load(1050, 1000, 1120, 1090);
  const at = (x: number, y: number, z: number) => w.blockAt(x, y, z);

  it('puts Marco under the bus shelter’s roof, not on it', () => {
    const s = ZONE1.shelter;
    // The lead's spawn, and every column under the roof.
    expect(groundAt(1112.5, 1022.5, at)).toBe(s.floor);
    for (let x = s.x0 + 1; x < s.x1 - 1; x++) for (let z = s.z0 + 1; z < s.z1; z++) {
      const y = groundAt(x + 0.5, z + 0.5, at);
      if (y !== null) expect(y, `${x},${z}`).toBeLessThanOrEqual(s.floor + 1);
    }
    expect(groundAt(MARCO_SPOT[0], MARCO_SPOT[2], at)).toBe(s.floor);
  });

  it('puts a creature on the barn’s floor, never its roof', () => {
    const b = ZONE1.barn, F = ZONE1.farm.floor;
    for (let x = b.x0 + 1; x < b.x1 - 1; x++) for (let z = b.z0 + 1; z < b.z1 - 1; z++) {
      const y = groundAt(x + 0.5, z + 0.5, at);
      if (y !== null) expect(y, `${x},${z}`).toBeLessThan(F + 2);
    }
    expect(groundAt(b.x0 + 3.5, b.z0 + 3.5, at)).toBe(F);
  });

  it('never stands one on a coop, a chest or a fence post', () => {
    const F = ZONE1.farm.floor, x = ZONE1.farm.x0 + 3, z = ZONE1.farm.z1 - 3;
    for (const name of ['coop', 'chest', 'fence_post']) {
      w.setBlock(x, F, z, blockId(name));
      expect(groundAt(x + 0.5, z + 0.5, at), name).toBeNull();
      w.setBlock(x, F, z, 0);
    }
    expect(groundAt(x + 0.5, z + 0.5, at)).toBe(F);
  });

  it('still finds the ground in open country and at the bottom of a dug pit', () => {
    const x = ZONE1.farm.x0 + 6, z = ZONE1.farm.z1 - 4, F = ZONE1.farm.floor;
    expect(blockName(at(x, F - 1, z))).not.toBe('air');
    expect(groundAt(x + 0.5, z + 0.5, at)).toBe(F);
    for (let y = F - 6; y < F; y++) w.setBlock(x, y, z, 0);
    expect(groundAt(x + 0.5, z + 0.5, at)).toBe(F - 6);
  });
});

// ---- Step 2: the road on to the bridge, and the places beside it ----------------------------------------
import { ROAD, ZONE1FAR, roadZ, roadHeight, outsideHeight, zoneAt, ravineX, RAVINE_HALF, onRoad, onCampTrail } from '../src/gen/layout.ts';
import { RAIDER_CRATE, RAIDER_FORGE, LODGE_CHEST, PHOTO, RUSTED_TRAP, CAMP_MARKER, POSTS, DECK_END } from '../src/gen/zone1far.ts';
import { APPLE_TREE } from '../src/gen/zone1.ts';
import { B_SOLID, B_EMIT, BLOCK_DEFS, isWaterId } from '../src/world/blocks.ts';
import { hasTexture } from '../src/render/textures.ts';

describe('the road on through the mid band to the broken bridge', () => {
  it('runs from the near band to the ravine with no step over one block, and dies at the bridge', () => {
    let last = roadHeight(950);
    for (let x = 950; x >= ROAD.west; x--) {
      const h = outsideHeight(x, Math.floor(roadZ(x)));
      expect(Math.abs(h - last), `at ${x}`).toBeLessThanOrEqual(1);
      last = h;
      expect(onRoad(x, Math.floor(roadZ(x))), `x ${x}`).toBe(true);
    }
    expect(zoneAt(ROAD.west, roadZ(ROAD.west))).toBe('deep');
    expect(ROAD.west).toBeGreaterThanOrEqual(ZONE1FAR.bridge.near);
  });

  it('meets a sheer ravine at least 40 m wide at the road', () => {
    const b = ZONE1FAR.bridge, z = b.z;
    expect(b.near - b.far).toBeGreaterThanOrEqual(40);
    // Deep all the way across between the rims; the rims stand high on both sides.
    for (let x = b.far + 2; x <= b.near - 2; x++) expect(outsideHeight(x, z), `x ${x}`).toBeLessThan(50);
    expect(outsideHeight(b.near + 1, z)).toBeGreaterThan(75);
    expect(outsideHeight(b.far - 1, z)).toBeGreaterThan(70);
    // Sheer: from rim to floor within two blocks.
    expect(outsideHeight(b.near - 2, z)).toBeLessThan(50);
    expect(Math.abs(ravineX(z) - (b.near + b.far) / 2)).toBeLessThan(1.5);
    expect(RAVINE_HALF * 2).toBeGreaterThanOrEqual(40);
  });
});

describe('the mid and deep places, built and lit', () => {
  const w = load(580, 950, 915, 1070);
  const name = (x: number, y: number, z: number) => blockName(w.blockAt(x, y, z));
  const lightNear = (x: number, y: number, z: number, r: number) => {
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) for (let dy = -3; dy <= 6; dy++) if (B_EMIT[w.blockAt(x + dx, y + dy, z + dz)]) return true;
    return false;
  };

  it('has the outpost: walls, roof, the crate, the forge, the cookfire under the smoke, sandbags, lit', () => {
    const o = ZONE1FAR.outpost;
    expect(name(o.x0, o.floor, o.z0 + 1)).toBe('cinder_block');
    expect(name(o.x0 + 3, o.floor + 3, o.z0 + 3)).toBe('cinder_block');
    expect(name(...RAIDER_CRATE)).toBe('raiders_crate');
    expect(name(...RAIDER_FORGE)).toBe('raider_forge');
    expect(name(ZONE1FAR.fire.x, o.floor, ZONE1FAR.fire.z)).toBe('oil_drum_fire');
    expect(name(o.x1 - 1, o.floor + 4, o.z0 + 2)).toBe('sandbags');
    expect(lightNear(o.x0 + 7, o.floor, o.z0 - 1, 3)).toBe(true);
    // The door is open, two high, into the front room.
    expect(B_SOLID[w.blockAt(o.x0 + 7, o.floor, o.z0)]).toBe(0);
    expect(B_SOLID[w.blockAt(o.x0 + 7, o.floor + 1, o.z0)]).toBe(0);
  });

  it('puts the lookout on the roof and the others on the ground, each with room to stand', () => {
    for (const p of Object.values(POSTS)) {
      for (let y = p.y; y < p.y + 2; y++) expect(B_SOLID[w.blockAt(Math.floor(p.x), y, Math.floor(p.z))], `${p.x},${y},${p.z}`).toBe(0);
      expect(B_SOLID[w.blockAt(Math.floor(p.x), p.y - 1, Math.floor(p.z))]).toBe(1);
    }
    expect(POSTS.lookout.y).toBe(ZONE1FAR.outpost.floor + 4);
  });

  it('climbs to the roof from the back by steps of one block', () => {
    const o = ZONE1FAR.outpost;
    let last = o.floor;
    for (let k = 0; k < 3; k++) {
      let top = o.floor; while (B_SOLID[w.blockAt(o.x0 + 1 + k, top, o.z1)]) top++;
      expect(top - last).toBeLessThanOrEqual(1);
      last = top;
    }
    expect(o.floor + 4 - last).toBeLessThanOrEqual(1);
  });

  it('has a game trail through the brush, clear to walk, with thick bushes either side', () => {
    const t = ZONE1FAR.brushTrail;
    let bushes = 0;
    for (let i = 0; i < t.length - 1; i++) for (let k = 0; k <= 10; k++) {
      const x = Math.round(t[i][0] + ((t[i + 1][0] - t[i][0]) * k) / 10), z = Math.round(t[i][1] + ((t[i + 1][1] - t[i][1]) * k) / 10);
      const g = outsideHeight(x, z);
      expect(B_SOLID[w.blockAt(x, g, z)] + B_SOLID[w.blockAt(x, g + 1, z)], `${x},${z}`).toBe(0);
      if (name(x + 3, outsideHeight(x + 3, z), z) === 'leaves' || name(x, outsideHeight(x, z + 3), z + 3) === 'leaves') bushes++;
    }
    expect(bushes).toBeGreaterThan(10);
  });

  it('has the old mine, open and lit down to a chamber thick with iron and coal', () => {
    const m = ZONE1FAR.mine, ch = m.chamber;
    for (let k = 0; k < m.depth; k++) for (let x = m.x - 1; x <= m.x + 1; x++) for (let y = m.floor - k; y < m.floor - k + 2; y++)
      expect(B_SOLID[w.blockAt(x, y, m.z + k)], `${x},${y},${m.z + k}`).toBe(0);
    let ore = 0, lamps = 0;
    for (let x = ch.x0 - 1; x <= ch.x1; x++) for (let z = ch.z0 - 1; z <= ch.z1; z++) for (let y = ch.y0; y < ch.y1; y++) {
      const n = name(x, y, z);
      if (n === 'iron_ore' || n === 'coal_ore') ore++;
      if (n === 'lantern') lamps++;
    }
    expect(ore).toBeGreaterThan(60);
    expect(lamps).toBeGreaterThanOrEqual(4);
    expect(name(m.x, m.floor + 5, m.z)).toBe('mina_sign');
  });

  it('marks the camp’s trail head on the road, and its trail is clear to the clearing', () => {
    const [mx, , mz] = CAMP_MARKER, g = outsideHeight(mx, mz);
    expect(name(mx, g + 4, mz)).toBe('antlers');
    expect(lightNear(mx, g, mz, 1)).toBe(true);
    const h = ZONE1FAR.campHead;
    for (let z = ZONE1FAR.camp.z1; z <= h.z; z++) {
      expect(onCampTrail(h.x, z)).toBe(true);
      const y = outsideHeight(h.x, z);
      expect(B_SOLID[w.blockAt(h.x, y, z)] + B_SOLID[w.blockAt(h.x, y + 1, z)], `z ${z}`).toBe(0);
    }
  });

  it('has the camp: the lodge with its chest, photo and lamps; hides, the leghold, the jaguar’s tracks, snares', () => {
    expect(name(...LODGE_CHEST)).toBe('chest');
    expect(name(...PHOTO)).toMatch(/^photo_frame/);
    expect(name(...RUSTED_TRAP)).toBe('leghold_trap');
    const c = ZONE1FAR.camp;
    const count = (n: string) => { let k = 0; for (let x = c.x0; x < c.x1; x++) for (let z = c.z0; z < c.z1; z++) if (name(x, c.floor, z) === n) k++; return k; };
    expect(count('hide_rack')).toBeGreaterThan(0);
    expect(count('jaguar_tracks')).toBeGreaterThanOrEqual(4);
    expect(count('snare')).toBeGreaterThanOrEqual(3);
    expect(lightNear(ZONE1FAR.lodge.x0 + 2, c.floor, ZONE1FAR.lodge.z1 - 2, 1)).toBe(true);
  });

  it('has the broken bridge, the body on the far bank and the tracks on the near one, apart', () => {
    const b = ZONE1FAR.bridge, [dx, dy, dz] = DECK_END;
    expect(name(Math.floor(dx), dy - 1, Math.floor(dz))).toBe('concrete');
    // Nothing under the deck's end but air down into the gorge.
    expect(B_SOLID[w.blockAt(b.deckEnd - 1, dy - 1, b.z)]).toBe(0);
    let rebar = 0;
    for (let z = b.z - 3; z <= b.z + 3; z++) for (let y = dy - 5; y < dy; y++) if (name(b.deckEnd, y, z) === 'rebar' || name(b.deckEnd + 1, y, z) === 'rebar') rebar++;
    expect(rebar).toBeGreaterThan(0);
    const bd = ZONE1FAR.body;
    expect(name(bd.x, bd.y, bd.z)).toBe('pale_body');
    expect(b.far - bd.x).toBeGreaterThanOrEqual(15);
    expect(b.far - bd.x).toBeLessThanOrEqual(25);
    expect(zoneAt(bd.x, bd.z)).toBe('zone3');
    // The tracks: on the near side, nowhere near the body.
    let tracks = 0;
    for (let x = b.near; x < b.near + 25; x++) for (let z = b.z - 30; z < b.z; z++) for (let y = 78; y < 90; y++) if (name(x, y, z) === 'odd_tracks') {
      tracks++;
      expect(Math.hypot(x - bd.x, z - bd.z)).toBeGreaterThan(50);
    }
    expect(tracks).toBeGreaterThanOrEqual(4);
  });

  it('keeps a clear line of sight from the deck’s end to the body', () => {
    const [ex, ey, ez] = DECK_END, bd = ZONE1FAR.body, by = bd.y + 0.25;
    const n = 200;
    for (let k = 1; k < n; k++) {
      const t = k / n, x = ex + (bd.x + 0.5 - ex) * t, y = ey + 1.6 + (by - ey - 1.6) * t, z = ez + (bd.z + 0.5 - ez) * t;
      const id = w.blockAt(Math.floor(x), Math.floor(y), Math.floor(z));
      expect(B_SOLID[id] && !isWaterId(id) ? blockName(id) : 'clear', `${x.toFixed(1)},${y.toFixed(1)},${z.toFixed(1)}`).toBe('clear');
    }
  });

  it('has the old apple tree in the farmyard', () => {
    const w2 = load(APPLE_TREE[0] - 3, APPLE_TREE[2] - 3, APPLE_TREE[0] + 3, APPLE_TREE[2] + 3);
    expect(blockName(w2.blockAt(...APPLE_TREE))).toBe('apple_trunk');
  });

  it('draws every block texture (no magenta)', () => {
    for (const d of BLOCK_DEFS) {
      if (!d.tex) continue;
      const names = typeof d.tex === 'string' ? [d.tex] : Object.values(d.tex);
      for (const t of names) expect(hasTexture(t), `${d.name}: ${t}`).toBe(true);
    }
  });
});
