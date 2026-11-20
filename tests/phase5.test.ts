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

// ---- Steps 4–7: the raiders, stealth, focus, the jaguar, M2 ------------------------------------------------
import { makeCreature, KINDS, fits, type Creature, type Senses } from '../src/entity/creatures.ts';
import { thinkRaider, raiderSees, manOutpost, alertOutpost, silentTakedown, hitChance, ALL_RAIDERS, RAIDER_BIT, NOTICE, type OutpostState, type RaiderEvent } from '../src/entity/outpost.ts';
import { thinkJaguar, makeJaguar, STARE } from '../src/entity/jaguar.ts';
import { Wild } from '../src/entity/wild.ts';
import { Focus, FOCUS_SECONDS, FOCUS_RECHARGE, FOCUS_SCALE } from '../src/sim/focus.ts';
import { smokeMeat, cureJerky, newWatch, LEGHOLD, HOLD_SECONDS } from '../src/sim/preserve.ts';
import { trackM2, M2_STEPS } from '../src/sim/milestones.ts';
import { RECIPES, recipesAt, make, stationOf } from '../src/sim/crafting.ts';
import { sow, grow, pickApple, cropDrops } from '../src/sim/farming.ts';
import { itemId } from '../src/world/items.ts';
import { Inventory } from '../src/sim/inventory.ts';
import { inSanctuary, VALLEY } from '../src/gen/layout.ts';
import { encodeSave, decodeSave } from '../src/save/save.ts';
import { makeRng } from '../src/core/noise.ts';
import { tradeNamesValid } from '../src/sim/trade.ts';

const STONE = blockId('limestone');
/** A flat world at y 100, with a pillar the lookout stands on (x 0, z 0, up to y 104) and optional walls. */
function arena(walls: [number, number, number][] = []) {
  const set = new Set(walls.map(([x, y, z]) => `${x},${y},${z}`));
  return (x: number, y: number, z: number) => (y < 100 || (x === 0 && z === 0 && y < 104) || set.has(`${x},${y},${z}`) ? STONE : 0);
}
const lookoutAt = () => {
  const c = makeCreature('lookout', 0.5, 104, 0.5);
  c.post = { x: 0.5, y: 104, z: 0.5, yaw: -Math.PI / 2 }; // watching east (+x)
  c.mind = 'watch';
  return c;
};
const sense = (px: number, pz: number, extra: Partial<Senses> = {}): Senses => ({ px, py: 100, pz, playerInSanctuary: inSanctuary(px, pz), night: false, shot: false, ...extra });
const run = (c: Creature, s: Senses, st: OutpostState, blockAt: (x: number, y: number, z: number) => number, secs: number, rand: () => number = () => 0) => {
  const ev: { t: number; e: RaiderEvent }[] = [];
  for (let t = 0; t < secs; t += 0.05) for (const e of thinkRaider(c, 0.05, s, st, blockAt, rand)) ev.push({ t, e });
  return ev;
};

describe('the outpost’s raiders: telegraphed, and cover works', () => {
  it('the lookout notices, shouts, aims for 1.5 s with a glint, then fires, and never before', () => {
    const c = lookoutAt(), st: OutpostState = { left: ALL_RAIDERS, alert: false };
    const ev = run(c, sense(30.5, 0.5), st, arena(), 8);
    const at = (k: string) => ev.find((x) => x.e.kind === k)?.t ?? Infinity;
    expect(at('notice')).toBeLessThan(0.2);
    expect(at('shout')).toBeGreaterThanOrEqual(NOTICE - 0.06);
    expect(st.alert).toBe(true);
    expect(at('aim')).toBeGreaterThan(at('shout'));
    expect(at('shot') - at('aim')).toBeGreaterThanOrEqual(KINDS.lookout.windup - 0.06);
    const shot = ev.find((x) => x.e.kind === 'shot')!.e as Extract<RaiderEvent, { kind: 'shot' }>;
    expect(shot.hit).toBe(true);
    expect(shot.damage).toBe(KINDS.lookout.damage);
  });

  it('a shot misses a player who has got behind something solid during the aim', () => {
    const c = lookoutAt(), st: OutpostState = { left: ALL_RAIDERS, alert: true };
    c.mind = 'aim'; c.timer = 0.5;
    // A wall between: the player crouches behind it (from his roof, the wall covers chest and head).
    const walls: [number, number, number][] = [];
    for (let z = -2; z <= 2; z++) for (let y = 100; y < 104; y++) walls.push([28, y, z]);
    // Hidden, he holds his shot (review fix 3); whatever he fires lands nowhere near.
    const ev = run(c, sense(29.5, 0.5), st, arena(walls), 4);
    expect(ev.some((x) => x.e.kind === 'shot' && x.e.hit)).toBe(false);
    expect(c.mind).toBe('aim');
  });

  it('hits less often far off and on the run', () => {
    expect(hitChance('lookout', 10, 0)).toBeGreaterThan(hitChance('lookout', 50, 0));
    expect(hitChance('lookout', 20, 5)).toBeLessThan(hitChance('lookout', 20, 0));
    expect(hitChance('gunman', 30, 0)).toBeLessThan(hitChance('lookout', 30, 0));
  });

  it('before the alarm the lookout watches the road east: from behind him he can’t see you', () => {
    const c = lookoutAt();
    expect(raiderSees(c, sense(30.5, 0.5), false, arena())).toBe(true);
    expect(raiderSees(c, sense(-20.5, 0.5), false, arena())).toBe(false);
    expect(raiderSees(c, sense(0.5, 25.5), false, arena())).toBe(false);
    // Once alerted, he looks every way.
    expect(raiderSees(c, sense(-20.5, 0.5), true, arena())).toBe(true);
  });

  it('a raider who loses sight of you before the moment is up does not shout', () => {
    const c = lookoutAt(), st: OutpostState = { left: ALL_RAIDERS, alert: false };
    run(c, sense(30.5, 0.5), st, arena(), 0.3);
    expect(c.mind).toBe('notice');
    const walls: [number, number, number][] = [];
    for (let z = -2; z <= 2; z++) for (let y = 100; y < 106; y++) walls.push([25, y, z]);
    const ev = run(c, sense(27.5, 0.5), st, arena(walls), 2);
    expect(ev.some((x) => x.e.kind === 'shout')).toBe(false);
    expect(st.alert).toBe(false);
    expect(c.mind).toBe('watch');
  });

  it('the rusher raises his machete before the blow; stepping back makes it miss', () => {
    const c = makeCreature('rusher', 0.5, 100, 6.5), st: OutpostState = { left: ALL_RAIDERS, alert: true };
    c.post = { x: 0.5, y: 100, z: 6.5, yaw: 0 }; c.mind = 'charge'; c.timer = 10;
    let swing = -1, blows = 0;
    for (let t = 0; t < 6 && swing < 0; t += 0.05) for (const e of thinkRaider(c, 0.05, sense(3.5, 0.5), st, arena(), () => 0)) if (e.kind === 'swing') swing = t;
    expect(swing).toBeGreaterThan(0);
    expect(c.mind).toBe('windup');
    // Step back out of reach during the wind-up.
    for (let t = 0; t < KINDS.rusher.windup + 0.1; t += 0.05) for (const e of thinkRaider(c, 0.05, sense(3.5, c.z - 6), st, arena(), () => 0)) if (e.kind === 'blow') blows++;
    expect(blows).toBe(0);
  });

  it('a blade on a raider who hasn’t seen you is silent; anything else, or an alerted raider, is a fight', () => {
    const c = lookoutAt();
    expect(silentTakedown(c, { left: 7, alert: false }, true)).toBe(true);
    expect(silentTakedown(c, { left: 7, alert: false }, false)).toBe(false);
    expect(silentTakedown(c, { left: 7, alert: true }, true)).toBe(false);
    c.mind = 'notice';
    expect(silentTakedown(c, { left: 7, alert: false }, true)).toBe(false);
  });

  it('an arrow in an unaware raider does triple harm; a kill so is silent, and the others are not told', () => {
    const w = new Wild();
    w.spawning = false;
    const c = lookoutAt(), other = makeCreature('gunman', 3.5, 100, 5.5);
    other.mind = 'watch'; other.post = { x: 3.5, y: 100, z: 5.5, yaw: 0 };
    w.creatures.push(c, other);
    w.shoot(10.5, 105.6, 0.5, -1, 0, 0, 1);
    let silent = 0, kills = 0;
    for (let t = 0; t < 1.5; t += 0.05) { const e = w.update(0.05, { px: 200, py: 100, pz: 200, night: false, shot: false, blockAt: arena(), loaded: () => true, rand: () => 0.5 }); silent += e.silent; kills += e.kills.length; }
    expect(kills).toBe(1);
    expect(silent).toBe(1);
    expect(w.outpost.alert).toBe(false);
    expect(other.mind).toBe('watch');
  });

  it('a gunshot near the outpost alerts all of it', () => {
    const w = new Wild();
    w.spawning = false;
    const g = makeCreature('gunman', POSTS.pistol.x, POSTS.pistol.y, POSTS.pistol.z);
    g.mind = 'watch'; g.post = { ...POSTS.pistol };
    w.creatures.push(g);
    const [ox, oz] = [ZONE1FAR.outpost.x0 + 40, ZONE1FAR.outpost.z0];
    w.update(0.06, { px: ox, py: 120, pz: oz, night: false, shot: true, blockAt: (_x, y) => (y < 89 ? STONE : 0), loaded: () => true, rand: () => 0.5 });
    expect(w.outpost.alert).toBe(true);
    expect(['alerted', 'aim']).toContain(g.mind as string);
  });

  it('mans only the raiders still alive, each exactly at his post (the lookout on the roof)', () => {
    const at = ZONE1FAR.outpost;
    const all = manOutpost([], { left: ALL_RAIDERS, alert: false }, at.x0, at.z0, () => true);
    expect(all.map((c) => c.kind).sort()).toEqual(['gunman', 'lookout', 'rusher']);
    expect(all.find((c) => c.kind === 'lookout')!.y).toBe(POSTS.lookout.y);
    const two = manOutpost([], { left: ALL_RAIDERS & ~RAIDER_BIT.lookout, alert: false }, at.x0, at.z0, () => true);
    expect(two.map((c) => c.kind).sort()).toEqual(['gunman', 'rusher']);
    expect(manOutpost([], { left: 0, alert: false }, at.x0, at.z0, () => true)).toHaveLength(0);
    expect(manOutpost([], { left: ALL_RAIDERS, alert: false }, at.x0 + 400, at.z0, () => true)).toHaveLength(0);
  });

  it('keeps which raiders are dead through a save; an old save has all three', async () => {
    const base: Record<string, unknown> = { format: 'hidden-valley-blocks-save', version: 1, savedAt: new Date().toISOString(), hour: 12, player: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, flying: false }, hotbar: [], selected: 0, palette: [], edits: [] };
    const d = await decodeSave(await encodeSave({ ...base, outpost: RAIDER_BIT.gunman } as never));
    expect(d!.outpost).toBe(RAIDER_BIT.gunman);
    const old = await decodeSave(await encodeSave(base as never));
    expect(old!.outpost ?? ALL_RAIDERS).toBe(ALL_RAIDERS);
  });
});

describe('the sanctuary rule, with the raiders and the jaguar', () => {
  const flat = (_x: number, y: number) => (y < 100 ? STONE : 0);
  it('none can stand, walk, see, shoot or strike into the valley', () => {
    const rand = makeRng(5);
    const edge = VALLEY.radius + 8;
    for (const kind of ['lookout', 'gunman', 'rusher', 'jaguar'] as const) {
      // Its body refuses the valley.
      expect(fits(makeCreature(kind, VALLEY.cx, 100, VALLEY.cz), VALLEY.cx, 100, VALLEY.cz, flat)).toBe(false);
      expect(new Wild().add(makeCreature(kind, VALLEY.cx + 10, 100, VALLEY.cz))).toBe(false);
      for (let trial = 0; trial < 30; trial++) {
        // The west half: the east edge at the home's latitude is the home, sanctuary too (main, bf57d3f).
        const a = Math.PI * (0.6 + rand() * 0.8);
        const c = makeCreature(kind, VALLEY.cx + Math.cos(a) * (edge + 0.6), 100, VALLEY.cz + Math.sin(a) * (edge + 0.6));
        c.post = { x: c.x, y: 100, z: c.z, yaw: 0 };
        c.mind = kind === 'jaguar' ? 'charge' : trial % 2 ? 'alerted' : 'charge'; c.timer = 10;
        const st: OutpostState = { left: ALL_RAIDERS, alert: true };
        const px = VALLEY.cx + Math.cos(a) * (edge - 5), pz = VALLEY.cz + Math.sin(a) * (edge - 5);
        let harm = 0;
        for (let t = 0; t < 300; t++) {
          c.vx += (VALLEY.cx - c.x) * 0.5; c.vz += (VALLEY.cz - c.z) * 0.5;
          const s = { px, py: 100, pz, playerInSanctuary: true, night: true, shot: t === 3 };
          if (kind === 'jaguar') { if (thinkJaguar(c, 0.05, s, flat, rand).hit) harm++; }
          else for (const e of thinkRaider(c, 0.05, s, st, flat, () => 0)) if ((e.kind === 'shot' && e.hit) || e.kind === 'blow') harm++;
          expect(inSanctuary(c.x, c.z), `${kind} at ${c.x.toFixed(1)},${c.z.toFixed(1)}`).toBe(false);
        }
        expect(harm, kind).toBe(0);
        if (kind !== 'jaguar') expect(raiderSees(c, sense(px, pz), true, flat)).toBe(false);
      }
    }
  });

  it('the outpost and the camp are far from the valley', () => {
    for (const p of Object.values(POSTS)) expect(inSanctuary(p.x, p.z)).toBe(false);
    for (const [x, z] of ZONE1FAR.jaguarPath) expect(inSanctuary(x, z)).toBe(false);
  });
});

describe('the jaguar at the hunters’ camp', () => {
  const flat = (_x: number, y: number) => (y < 86 ? STONE : 0);
  const far = (c: Creature) => sense(c.x + 30, c.z + 30);
  it('crosses the clearing, stops to look at you, then is gone', () => {
    const j = makeJaguar(() => 86)!;
    expect(j.mind).toBe('cross');
    let stared = 0, gone = false;
    for (let t = 0; t < 60 && !gone; t += 0.05) {
      const s = { ...sense(800.5, 990.5), py: 86 };
      const r = thinkJaguar(j, 0.05, s, flat, () => 0.5);
      if (j.mind === 'stare') stared += 0.05;
      if (r.event === 'gone') gone = true;
      expect(r.hit).toBeNull();
    }
    expect(stared).toBeGreaterThanOrEqual(STARE - 0.1);
    expect(gone).toBe(true);
    void far;
  });

  it('turns on you if you come close, shoot or strike: then the fight is real', () => {
    for (const how of ['close', 'shot', 'hurt'] as const) {
      const j = makeJaguar(() => 86)!;
      if (how === 'hurt') j.angry = 60;
      const s = { ...sense(how === 'close' ? j.x + 3 : 800.5, how === 'close' ? j.z : 990.5), py: 86, shot: how === 'shot' };
      const r = thinkJaguar(j, 0.05, s, flat, () => 0.5);
      expect(r.event, how).toBe('provoked');
      expect(j.mind).toBe('charge');
    }
  });
});

describe('focus mode', () => {
  it('slows the world to a quarter for at most four seconds, then needs twelve to come back', () => {
    const f = new Focus();
    expect(f.scale).toBe(1);
    expect(f.toggle()).toBe(true);
    expect(f.scale).toBe(FOCUS_SCALE);
    let t = 0;
    while (f.active && t < 10) { f.update(0.1); t += 0.1; }
    expect(t).toBeCloseTo(FOCUS_SECONDS, 0);
    expect(f.scale).toBe(1);
    expect(f.toggle()).toBe(false); // not yet back
    for (let k = 0; k < FOCUS_RECHARGE * 10 + 1; k++) f.update(0.1);
    expect(f.ready).toBe(true);
    expect(f.toggle()).toBe(true);
    f.stop();
    expect(f.active).toBe(false);
  });
});

describe('M2: the forge, the bow, preserving, the garden, traps', () => {
  it('every new recipe resolves; the leghold shows only once learned; the forge is a station', () => {
    expect(RECIPES.length).toBeGreaterThan(50);
    expect(tradeNamesValid()).toBe(true);
    // M2's recipes need M1 done (docs/FIXES.md, 6).
    const m1 = new Set(['m1_done']);
    expect(recipesAt('workbench').some((r) => r.out[0] === itemId('hunting_bow'))).toBe(false);
    const bow = recipesAt('workbench', m1).find((r) => r.out[0] === itemId('hunting_bow'))!;
    expect(bow.in.some(([id]) => id === itemId('bowstring'))).toBe(true);
    expect(recipesAt('workbench', m1).some((r) => r.out[0] === blockId('leghold_trap'))).toBe(false);
    expect(recipesAt('workbench', new Set(['leghold_learned', 'm1_done'])).some((r) => r.out[0] === blockId('leghold_trap'))).toBe(true);
    const forge = recipesAt('workbench', m1).find((r) => r.out[0] === blockId('forge'))!;
    expect(forge.in.some(([id]) => id === itemId('forge_parts'))).toBe(true);
    expect(forge.in.length).toBeLessThanOrEqual(4);
    expect(stationOf(blockId('forge'))).toBe('forge');
    // The forge gets more iron from scrap than the smelter.
    const better = recipesAt('forge').find((r) => r.in.some(([id]) => id === itemId('scrap_metal')))!;
    const smelter = recipesAt('smelter').find((r) => r.in.some(([id]) => id === itemId('scrap_metal')))!;
    expect(better.out[1] / better.in[0][1]).toBeGreaterThan(smelter.out[1] / smelter.in[0][1]);
    // Making the forge gives a tool rack too.
    const inv = new Inventory(18);
    for (const [id, n] of forge.in) inv.add(id, n);
    expect(make(inv, forge)).toBe('made');
    expect(inv.count(blockId('tool_rack'))).toBe(1);
  });

  it('a smoker with wood smokes up to four meat per piece every four hours; a jerky rack cures at dawn', () => {
    const w = new World();
    w.addColumn(0, 0, (runJob({ kind: 'gen', cx: 0, cz: 0, edits: [] }).result as GenResult).chunks);
    w.setBlock(5, 150, 5, blockId('smoker'));
    w.setBlock(7, 150, 5, blockId('jerky_rack'));
    const sm = w.containerAt(5, 150, 5)!, jr = w.containerAt(7, 150, 5)!;
    sm[0] = { id: itemId('venison_raw'), count: 6 }; sm[1] = { id: blockId('log'), count: 1 };
    jr[0] = { id: itemId('pork_raw'), count: 3 };
    expect(newWatch(7.9, 8.1)).toBe(true);
    expect(newWatch(8.1, 11.9)).toBe(false);
    expect(smokeMeat(w)).toBe(4);
    const count = (slots: typeof sm, n: string) => slots.reduce((k, s) => k + (s && s.id === itemId(n) ? s.count : 0), 0);
    expect(count(sm, 'smoked_meat')).toBe(4);
    expect(count(sm, 'venison_raw')).toBe(2);
    expect(smokeMeat(w)).toBe(0); // no wood left
    expect(cureJerky(w)).toBe(3);
    expect(count(jr, 'jerky')).toBe(3);
  });

  it('a raised bed takes seed like farmland; an apple tree fruits again after picking', () => {
    const w = new World();
    w.addColumn(0, 0, (runJob({ kind: 'gen', cx: 0, cz: 0, edits: [] }).result as GenResult).chunks);
    w.setBlock(4, 185, 4, blockId('raised_bed'));
    const inv = new Inventory(9);
    inv.add(itemId('seeds_quinoa'), 2);
    expect(sow(w, inv, 4, 185, 4)).toBe(true);
    expect(blockName(w.blockAt(4, 186, 4))).toBe('crop_quinoa_0');
    w.setBlock(6, 185, 6, blockId('raised_bed'));
    w.setBlock(6, 186, 6, blockId('crop_apple_3'));
    expect(pickApple(w, inv, 6, 186, 6)).toBe(true);
    expect(inv.count(itemId('apple'))).toBe(3);
    expect(blockName(w.blockAt(6, 186, 6))).toBe('crop_apple_2');
    expect(cropDrops(blockId('crop_apple_1'))![0][0]).toBe(itemId('apple_slip'));
    void grow;
  });

  it('a leghold holds a deer that steps in it, for a minute', () => {
    const w = new Wild();
    w.spawning = false;
    const d = makeCreature('deer', 0.5, 100, 0.5);
    w.creatures.push(d);
    const blockAt = (x: number, y: number, z: number) => (y < 100 ? STONE : x === 0 && y === 100 && z === 0 ? LEGHOLD : 0);
    w.update(0.1, { px: 30, py: 100, pz: 30, night: false, shot: false, blockAt, loaded: () => true, rand: () => 0.5 });
    expect(d.held).toBeGreaterThan(HOLD_SECONDS - 1);
    const x0 = d.x;
    for (let t = 0; t < 10; t += 0.1) w.update(0.1, { px: 5, py: 100, pz: 0.5, night: false, shot: false, blockAt, loaded: () => true, rand: () => 0.5 });
    expect(Math.abs(d.x - x0)).toBeLessThan(0.05); // it would have bolted from a player 5 m off
  });

  it('ticks each step of M2, then is done', () => {
    const f = new Set<string>();
    const have = new Map<string, number>();
    const count = (n: string) => have.get(n) ?? 0;
    expect(trackM2(f, count)).toEqual([]);
    have.set('hunting_bow', 1); have.set('jerky', 2);
    expect(trackM2(f, count)).toEqual(['bow_made', 'preserved']);
    for (const s of M2_STEPS) f.add(s.flag);
    expect(trackM2(f, count)).toEqual([]); // not before M1 is done
    f.add('m1_done');
    expect(trackM2(f, count)).toEqual(['m2_done']);
  });
});

// ---- The fresh review's findings (each fails on the code before its fix) ---------------------------------
import { outpostFromSave, SHOT_HEARD, REACQUIRE, LEASH } from '../src/entity/outpost.ts';
import { learnLeghold } from '../src/sim/preserve.ts';
import { consume } from '../src/sim/survival.ts';

describe('review fixes', () => {
  it('1. the pistol and the machete don’t see a player right behind them before the alarm', () => {
    for (const kind of ['gunman', 'rusher'] as const) {
      const c = makeCreature(kind, 0.5, 100, 10.5);
      c.post = { x: 0.5, y: 100, z: 10.5, yaw: 0 }; c.mind = 'watch'; // facing north, the road
      expect(raiderSees(c, sense(0.5, 12), false, arena()), `${kind} behind`).toBe(false);
      expect(raiderSees(c, sense(0.5, 4.5), false, arena()), `${kind} in front`).toBe(true);
      // So a blade from behind can take him.
      expect(silentTakedown(c, { left: 7, alert: false }, true)).toBe(true);
    }
  });

  it('2. a gunshot alerts the outpost from as far as its raiders are posted', () => {
    expect(SHOT_HEARD).toBeGreaterThanOrEqual(110);
    const w = new Wild();
    w.spawning = false;
    const g = makeCreature('gunman', POSTS.pistol.x, POSTS.pistol.y, POSTS.pistol.z);
    g.mind = 'watch'; g.post = { ...POSTS.pistol };
    w.creatures.push(g);
    w.update(0.06, { px: POSTS.pistol.x + 95, py: 120, pz: POSTS.pistol.z, night: false, shot: true, blockAt: (_x, y) => (y < 89 ? STONE : 0), loaded: () => true, rand: () => 0.5 });
    expect(w.outpost.alert).toBe(true);
  });

  it('3. a raider who loses you mid-aim holds his shot a moment after you step back out', () => {
    const c = makeCreature('gunman', 2.5, 100, 0.5), st: OutpostState = { left: 7, alert: true };
    c.post = { x: 2.5, y: 100, z: 0.5, yaw: -Math.PI / 2 }; c.mind = 'alerted';
    const walls: [number, number, number][] = [];
    for (let z = -2; z <= 2; z++) for (let y = 100; y < 104; y++) walls.push([8, y, z]);
    let t = 0, shotAt = -1;
    const step = (px: number, blocks: ReturnType<typeof arena>) => { for (const e of thinkRaider(c, 0.05, sense(px, 0.5), st, blocks, () => 0)) if (e.kind === 'shot') shotAt = t; t += 0.05; };
    step(10.5, arena()); // seen: he aims
    expect(c.mind).toBe('aim');
    while (t < 0.9) step(10.5, arena(walls)); // behind the wall
    const back = t;
    while (t < 3 && shotAt < 0) step(10.5, arena()); // out again
    expect(shotAt - back).toBeGreaterThanOrEqual(REACQUIRE - 0.06);
  });

  it('4. the machete gives up a chase far from his post and walks back', () => {
    const c = makeCreature('rusher', 0.5, 100, 0.5), st: OutpostState = { left: 7, alert: true };
    c.post = { x: 0.5, y: 100, z: 0.5, yaw: 0 }; c.mind = 'charge'; c.timer = 10;
    let px = 3.5;
    for (let t = 0; t < 60; t += 0.05) { px += 4.3 * 0.05; thinkRaider(c, 0.05, sense(px, 0.5), st, (_x, y) => (y < 100 ? STONE : 0), () => 0); }
    expect(c.x).toBeLessThan(LEASH + 6);
    expect(px - c.x).toBeGreaterThan(100);
  });

  it('5. jerky is not eaten on a full stomach just because it is salty', () => {
    const v = { hp: 100, hunger: 100, thirst: 60 };
    expect(consume(v, { hunger: 28, thirst: -4 })).toBe(false);
    expect(v.thirst).toBe(60);
  });

  it('6. walking into the camp to the shed or the lodge door doesn’t provoke the jaguar', () => {
    const flat = (_x: number, y: number) => (y < 86 ? STONE : 0);
    for (const goal of [[RUSTED_TRAP[0] + 0.5, RUSTED_TRAP[2] + 0.5], [ZONE1FAR.lodge.x1 + 0.5, ZONE1FAR.lodge.z0 + 3.5]]) {
      const j = makeJaguar(() => 86)!;
      let px = ZONE1FAR.campHead.x + 0.5, pz = ZONE1FAR.camp.z1 + 3;
      let provoked = false;
      for (let t = 0; t < 40; t += 0.05) {
        const dx = goal[0] - px, dz = goal[1] - pz, d = Math.hypot(dx, dz);
        if (d > 0.3) { px += (dx / d) * 4 * 0.05; pz += (dz / d) * 4 * 0.05; }
        if (thinkJaguar(j, 0.05, { ...sense(px, pz), py: 86 }, flat, () => 0.5).event === 'provoked') provoked = true;
        if (j.mind === 'leave' && j.timer < 7) break;
      }
      expect(provoked, `toward ${goal}`).toBe(false);
    }
  });

  it('7. taking up the rusted trap teaches it too, once', () => {
    const f = new Set<string>();
    expect(learnLeghold(f)).toBe(true);
    expect(f.has('leghold_learned')).toBe(true);
    expect(learnLeghold(f)).toBe(false);
  });

  it('8. the outpost restores from a save: dead raiders stay dead; an old save has all three', () => {
    expect(outpostFromSave(undefined)).toEqual({ left: ALL_RAIDERS, alert: false });
    expect(outpostFromSave(0)).toEqual({ left: 0, alert: false });
    expect(outpostFromSave(RAIDER_BIT.rusher).left).toBe(RAIDER_BIT.rusher);
  });
});

// ---- The lead's requests for this phase (2026-11-18) -------------------------------------------------------
import { HomeKey, HOME_HOLD, HOME_DANGER } from '../src/sim/home.ts';
import { CATCH_REACH, hatchEggs, layEggs, syncTameHens, takeHen, hensIn, HENS_MAX, catchChicken } from '../src/sim/livestock.ts';
import { think, TAME_LEASH } from '../src/entity/creatures.ts';
import { healthBar, BAR_SECONDS } from '../src/render/creatures.ts';
import { quickMove } from '../src/sim/inventory.ts';

describe('hold H to head home', () => {
  const run = (k: HomeKey, secs: number, down = true, hurtAt = -1) => {
    let ev: string | null = null;
    for (let t = 0; t < secs && !ev; t += 0.05) ev = k.update(0.05, down, hurtAt >= 0 && t >= hurtAt);
    return ev;
  };
  it('goes home after two seconds held, not before; letting go cancels', () => {
    const k = new HomeKey();
    expect(k.press(60, false)).toBe('started');
    expect(run(k, HOME_HOLD - 0.2)).toBeNull();
    expect(k.progress).toBeGreaterThan(0.8);
    expect(run(k, 0.5)).toBe('go');
    expect(k.progress).toBeNull();
    k.press(60, false);
    expect(run(k, 1, false)).toBe('cancelled');
  });
  it('taking damage cancels it, and it won’t start within ten seconds of being hurt', () => {
    const k = new HomeKey();
    k.press(60, false);
    expect(run(k, 3, true, 1)).toBe('cancelled');
    expect(k.press(HOME_DANGER - 1, false)).toBe('danger');
    expect(k.progress).toBeNull();
    expect(k.press(HOME_DANGER + 0.1, false)).toBe('started');
  });
  it('flying in builder’s mode it is at once', () => {
    expect(new HomeKey().press(0, true)).toBe('go');
  });
});

describe('chickens can be caught by walking up (the owner, Phase 4)', () => {
  const flat = (_x: number, y: number) => (y < 100 ? STONE : 0);
  const approach = (sprint: boolean) => {
    const c = makeCreature('chicken', 0.5, 100, 0.5);
    let px = 12.5, closest = Infinity, fled = false;
    for (let t = 0; t < 6; t += 0.05) {
      const d = Math.hypot(px - c.x, 0.5 - c.z);
      closest = Math.min(closest, d);
      if (d > 1.2) px -= (sprint ? 5.6 : 4) * 0.05;
      think(c, 0.05, { ...sense(px, 0.5), sprint }, flat, () => 0.99);
      if (c.mind === 'flee') fled = true;
    }
    return { closest, fled };
  };
  it('a hen doesn’t run from a walking player, who gets within reach', () => {
    const r = approach(false);
    expect(r.fled).toBe(false);
    expect(r.closest).toBeLessThanOrEqual(CATCH_REACH);
    expect(CATCH_REACH).toBeGreaterThanOrEqual(3);
  });
  it('she does run from a sprinting one', () => {
    expect(approach(true).fled).toBe(true);
  });
  it('the right-click at reach catches her', () => {
    const inv = new Inventory(9);
    expect(catchChicken(inv, makeCreature('chicken', 0, 100, 0))).toBe('caught');
    expect(inv.count(itemId('live_chicken'))).toBe(1);
  });
});

describe('damage you can read', () => {
  it('a hurt creature shows a health bar for a few seconds, filled to its health', () => {
    const c = makeCreature('dog', 0, 100, 0);
    expect(healthBar(c).show).toBe(false);
    c.hp = 11; c.hurt = 0.1;
    expect(healthBar(c)).toEqual({ show: true, fill: 0.5 });
    c.hurt = BAR_SECONDS + 0.1;
    expect(healthBar(c).show).toBe(false);
    expect(healthBar(Object.assign(makeCreature('marco', 0, 100, 0), { hurt: 0 })).show).toBe(false);
  });
  it('a weapon Shift-clicked out of a chest goes into a free hotbar slot', () => {
    const inv = Inventory.starter();
    const chest: ({ id: number; count: number } | null)[] = [{ id: itemId('hunting_rifle'), count: 1 }];
    quickMove(chest, 0, inv.slots, 0, inv.size);
    expect(inv.slots.findIndex((s) => s && s.id === itemId('hunting_rifle'))).toBeLessThan(9);
  });
});

describe('raising chickens in the valley', () => {
  // A level patch of stone at y 180 at the world's corner, with a coop on it.
  const setup = () => {
    const w = new World();
    w.addColumn(0, 0, (runJob({ kind: 'gen', cx: 0, cz: 0, edits: [] }).result as GenResult).chunks);
    for (let x = 0; x < 32; x++) for (let z = 0; z < 32; z++) { w.setBlock(x, 179, z, STONE); for (let y = 180; y < 192; y++) w.setBlock(x, y, z, 0); }
    w.setBlock(15, 180, 15, blockId('coop'));
    const slots = w.containerAt(15, 180, 15)!;
    return { w, slots };
  };
  const hen = () => itemId('live_chicken'), egg = () => itemId('egg');
  const n = (slots: ({ id: number; count: number } | null)[], id: number) => slots.reduce((k, s) => k + (s && s.id === id ? s.count : 0), 0);

  it('a pair with an egg left in hatches one hen a morning, up to eight; no egg, no chick', () => {
    const { w, slots } = setup();
    slots[0] = { id: hen(), count: 2 };
    expect(hatchEggs(w)).toBe(0); // no egg left in
    layEggs(w); // this morning's two eggs, left in
    expect(hatchEggs(w)).toBe(1);
    expect(n(slots, hen())).toBe(3);
    expect(n(slots, egg())).toBe(1);
    slots[0] = { id: hen(), count: HENS_MAX }; slots[1] = { id: egg(), count: 4 };
    expect(hatchEggs(w)).toBe(0);
    slots[0] = { id: hen(), count: 1 };
    expect(hatchEggs(w)).toBe(0); // one hen alone hatches nothing
  });

  it('her hens walk round the coop, as many as it holds; picking one up takes her from its count', () => {
    const { w, slots } = setup();
    slots[0] = { id: hen(), count: 3 };
    let cs = syncTameHens(w, [], 15, 15);
    expect(cs.filter((c) => c.tame).length).toBe(3);
    slots[0] = { id: hen(), count: 2 };
    cs = syncTameHens(w, cs, 15, 15);
    expect(cs.length).toBe(2);
    expect(takeHen(w, cs[0].tame!)).toBe(true);
    expect(hensIn(w, 15, 180, 15)).toBe(1);
    expect(syncTameHens(w, cs, 15, 15).length).toBe(1);
    // A tame hen may live in the valley: the wild takes her.
    const tame = makeCreature('chicken', VALLEY.cx, 70, VALLEY.cz);
    tame.tame = [Math.floor(VALLEY.cx), 70, Math.floor(VALLEY.cz)];
    expect(new Wild().add(tame)).toBe(true);
  });

  it('they never wander past their leash, nor over a fence round the coop', () => {
    const { w, slots } = setup();
    slots[0] = { id: hen(), count: 4 };
    const blockAt = (x: number, y: number, z: number) => w.blockAt(x, y, z);
    const rand = makeRng(9);
    const walk = (cs: Creature[]) => { for (let t = 0; t < 120; t += 0.05) for (const c of cs) { think(c, 0.05, { ...sense(40, 40), py: 180, playerInSanctuary: false }, blockAt, rand); expect(Math.hypot(c.x - 15.5, c.z - 15.5)).toBeLessThanOrEqual(TAME_LEASH + 0.01); } };
    walk(syncTameHens(w, [], 15, 15));
    // A fence ring two blocks out: they stay inside it.
    for (let d = -2; d <= 2; d++) for (const [x, z] of [[15 + d, 13], [15 + d, 17], [13, 15 + d], [17, 15 + d]]) w.setBlock(x, 180, z, blockId('fence_post'));
    const inside = syncTameHens(w, [], 15, 15);
    walk(inside);
    for (const c of inside) expect(Math.max(Math.abs(c.x - 15.5), Math.abs(c.z - 15.5))).toBeLessThan(2);
  });
});
