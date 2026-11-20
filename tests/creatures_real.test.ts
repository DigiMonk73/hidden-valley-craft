// The creatures on the generated land (docs/REVIEW.md, N5). Every test here runs on real columns: the
// review's faults (born across the sanctuary's line, born in a tree, a sentry against a truck, a jaguar
// against a shed, a cut warning before a blow) showed only among real blocks, never on flat test ground.

import { describe, it, expect, vi } from 'vitest';
import { load } from './load.ts';
import { World } from '../src/world/world.ts';
import { runJob, type GenResult } from '../src/jobs/tasks.ts';
import { makeRng } from '../src/core/noise.ts';
import { B_SOLID, AIR, blockName, blockId } from '../src/world/blocks.ts';
import { blockOf } from '../src/world/light.ts';
import { inSanctuary, roadZ, VALLEY, HOME_GROUNDS, GARDEN, ZONE1, ZONE1FAR, ZONE3 } from '../src/gen/layout.ts';
import { makeCreature, think, KINDS, RAIDER_KINDS, FACTION_KINDS, TAME_LEASH, type Creature, type Kind, type Senses, type Mind } from '../src/entity/creatures.ts';
import { trySpawn, denPack, groundAt, DEN_SIZE } from '../src/entity/spawner.ts';
import { Wild, floorNear, stepArrow, type WildSenses } from '../src/entity/wild.ts';
import { manFaction, newFaction, SQUADS } from '../src/entity/faction.ts';
import { manOutpost, thinkRaider, raiderSees, ALL_RAIDERS, type OutpostState } from '../src/entity/outpost.ts';
import { manAshen, newAshen } from '../src/entity/ashen.ts';
import { makeJaguar } from '../src/entity/jaguar.ts';
import { DEN, YARD, MARCO_SPOT } from '../src/gen/zone1.ts';
import { POSTS, OUTPOST_AT } from '../src/gen/zone1far.ts';
import { syncTameHens, COOP } from '../src/sim/livestock.ts';
import { itemId } from '../src/world/items.ts';
import { Inventory } from '../src/sim/inventory.ts';
import { sow } from '../src/sim/farming.ts';
import { placeBlock, breakBlock } from '../src/sim/interact.ts';

type BlockAt = (x: number, y: number, z: number) => number;
const STEP = 1 / 20;
const blocksOf = (w: World): BlockAt => (x, y, z) => w.blockAt(x, y, z);
// Whichever test runs first makes its land (some seconds of generation): none is held to the usual five.
vi.setConfig({ testTimeout: 120000 });

// ---- The land, loaded once for the file ---------------------------------------------------------------
const lands = new Map<string, World>();
const land = (name: string, x0: number, z0: number, x1: number, z1: number): World => {
  let w = lands.get(name);
  if (!w) { w = load(x0, z0, x1, z1); lands.set(name, w); }
  return w;
};
/** The buffer forest west of the valley, up to and over the bowl's west rim. */
const forest = () => land('forest', 1440, 928, 1663, 1151);
/** The plateau east of the builder's home, whose grounds are sanctuary too. */
const eastOfHome = () => land('east', 1824, 960, 1951, 1087);
/** The farmstead in the near band: the den, the yard, Marco's shelter. */
const farm = () => land('farm', 1000, 980, 1151, 1119);
/** The hunting camp and the raiders' outpost. */
const camp = () => land('camp', 736, 928, 959, 1087);
/** Zone-2: the highway from the border to the gate, the lot, the exchange, the towers. */
const zone2 = () => land('zone2', 736, 576, 863, 799);
/** Zone-3's nests: the powerhouse, the shop, the foundry, the engine shed, the mine's drift. */
const zone3 = () => land('zone3', 488, 780, 610, 980);

// ---- What "fits" means, measured here and not by the code under test ---------------------------------------
const corners = (c: Creature, x = c.x, z = c.z): [number, number][] => { const h = KINDS[c.kind].width / 2; return [[x - h, z - h], [x + h, z - h], [x - h, z + h], [x + h, z + h], [x, z]]; };
const acrossTheLine = (c: Creature): boolean => corners(c).some(([x, z]) => inSanctuary(x, z));
/** The first solid block any part of the body is in, or ''. */
const inBlock = (c: Creature, blockAt: BlockAt): string => {
  const d = KINDS[c.kind], h = d.width / 2;
  for (let y = Math.floor(c.y); y <= Math.floor(c.y + d.height - 1e-6); y++)
    for (let z = Math.floor(c.z - h); z <= Math.floor(c.z + h - 1e-6); z++)
      for (let x = Math.floor(c.x - h); x <= Math.floor(c.x + h - 1e-6); x++) if (B_SOLID[blockAt(x, y, z)]) return `${blockName(blockAt(x, y, z))} at ${x},${y},${z}`;
  return '';
};
/** Something solid under some part of the body: it stands, it does not hang in the air. */
const stands = (c: Creature, blockAt: BlockAt): boolean => corners(c).some(([x, z]) => B_SOLID[blockAt(Math.floor(x), Math.floor(c.y - 0.01), Math.floor(z))]);
/**
 * What it is perched on, or '': a body whose middle is over air stands on what is under its flank, and that
 * must be the land, never a fence, a roof, a wreck or a tree (the lead, 2026-11-18: nothing stands on those).
 */
const NOT_LAND = /^(log|leaves|tree_fern_trunk|fern_fronds|banana_trunk|tin_roof|slab_|coop|hutch|chest|fence_|truck_|scrap_heap|bench|table|stone_railing|sandbags|supply_crate|oil_drum|concrete_slab)/;
const perchedOn = (c: Creature, blockAt: BlockAt): string => {
  const y = Math.floor(c.y - 0.01);
  if (B_SOLID[blockAt(Math.floor(c.x), y, Math.floor(c.z))]) return '';
  for (const [x, z] of corners(c)) { const id = blockAt(Math.floor(x), y, Math.floor(z)); if (B_SOLID[id] && NOT_LAND.test(blockName(id))) return blockName(id); }
  return '';
};
const where = (c: Creature) => `${c.kind} at ${c.x.toFixed(2)}, ${c.y}, ${c.z.toFixed(2)}`;
/** Is the straight line between two points clear of solid blocks (looked at every 0.2 m, as the game's sight lines are)? */
const clear = (blockAt: BlockAt, ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean => {
  const n = Math.ceil(Math.hypot(bx - ax, by - ay, bz - az) / 0.2);
  for (let k = 1; k < n; k++) { const t = k / n; if (B_SOLID[blockAt(Math.floor(ax + (bx - ax) * t), Math.floor(ay + (by - ay) * t), Math.floor(az + (bz - az) * t))]) return false; }
  return true;
};
/** Can a player standing at (px, py, pz) see any of the creature: its head, its middle or its feet? */
const inView = (blockAt: BlockAt, px: number, py: number, pz: number, c: { kind: Kind; x: number; y: number; z: number }): boolean =>
  [0.95, 0.5, 0.1].some((f) => clear(blockAt, px, py + 1.6, pz, c.x, c.y + KINDS[c.kind].height * f, c.z));
const away: Senses = { px: 300, py: 100, pz: 300, playerInSanctuary: false, night: false, shot: false };
/** Lets a creature live for a while with nobody near; returns how far it got from where it began. */
const roams = (c: Creature, blockAt: BlockAt, rand: () => number, seconds = 60, night = false): number => {
  const x0 = c.x, z0 = c.z;
  let far = 0;
  for (let k = 0; k < seconds * 20 && far < 0.3; k++) { think(c, STEP, { ...away, night }, blockAt, rand); far = Math.max(far, Math.hypot(c.x - x0, c.z - z0)); }
  return far;
};

// ---- N5b, N5c: births ------------------------------------------------------------------------------------
describe('N5b/c: every creature is born wholly outside the sanctuary and wholly out of the blocks', () => {
  it('along the sanctuary’s line (the bowl’s west rim, the east side of the home’s grounds): no body lies across it', () => {
    const rand = makeRng(5);
    let born = 0;
    const across: string[] = [];
    const sample = (w: World, tries: number, player: () => [number, number]) => {
      const blockAt = blocksOf(w), loaded = (x: number, z: number) => w.isLoaded(x, z);
      for (let i = 0; i < tries; i++) {
        const [px, pz] = player();
        for (const c of trySpawn([], px, pz, i % 2 === 0, rand, blockAt, loaded)) {
          born++;
          expect(inSanctuary(c.x, c.z), where(c)).toBe(false);
          if (acrossTheLine(c)) across.push(where(c));
        }
      }
    };
    // Players 26 to 46 m outside the line, so the ring they spawn in crosses it.
    sample(forest(), 30000, () => { const a = Math.PI + (rand() - 0.5) * 0.8, r = VALLEY.radius + 8 + 26 + rand() * 20; return [VALLEY.cx + Math.cos(a) * r, VALLEY.cz + Math.sin(a) * r]; });
    sample(eastOfHome(), 15000, () => [HOME_GROUNDS.x1 + 26 + rand() * 20, HOME_GROUNDS.z0 + rand() * (HOME_GROUNDS.z1 - HOME_GROUNDS.z0)]);
    expect(born).toBeGreaterThan(50000);
    expect(across.length, `${across.length} of ${born} born across the line, the first: ${across.slice(0, 3).join('; ')}`).toBe(0);
  }, 120000);

  it('in the real forest: none is born in a tree, a bank or a rock, and every one of them can walk', () => {
    const w = forest(), blockAt = blocksOf(w), loaded = (x: number, z: number) => w.isLoaded(x, z);
    const rand = makeRng(6);
    let born = 0, floating = 0, onSlope = 0;
    const stuckIn: string[] = [], rooted: string[] = [], perched: string[] = [];
    const walkers: Creature[] = [];
    for (let i = 0; i < 12000; i++) {
      const px = 1500 + rand() * 60, pz = 990 + rand() * 100;
      for (const c of trySpawn([], px, pz, i % 2 === 0, rand, blockAt, loaded)) {
        born++;
        const b = inBlock(c, blockAt);
        if (b) stuckIn.push(`${where(c)}: in ${b}`);
        if (!stands(c, blockAt)) floating++;
        if (c.y !== groundAt(c.x, c.z, blockAt)) onSlope++;
        const on = perchedOn(c, blockAt);
        if (on) perched.push(`${where(c)}: on ${on}`);
        if (walkers.length < 1500 && rand() < 0.1) walkers.push(c);
      }
    }
    for (const c of walkers) { const at = where(c); if (roams(c, blockAt, rand, 60, c.kind === 'puma') < 0.3) rooted.push(at); }
    expect(born).toBeGreaterThan(15000);
    expect(walkers.length).toBe(1500);
    expect(floating).toBe(0);
    expect(rooted.length, `${rooted.length} of ${walkers.length} never moved 0.3 m in a minute, the first: ${rooted.slice(0, 3).join('; ')}`).toBe(0);
    expect(stuckIn.length, `${stuckIn.length} of ${born} born with part of the body in a block, the first: ${stuckIn.slice(0, 3).join('; ')}`).toBe(0);
    // On a slope the ground under a flank is a block higher than under the middle: it is born standing on that,
    // but never lifted onto a tree.
    expect(onSlope, 'born on a slope, a block up').toBeGreaterThan(1000);
    expect(perched.length, `${perched.length} born perched on a tree, the first: ${perched.slice(0, 3).join('; ')}`).toBe(0);
  }, 120000);

  it('in the near band: coyotes by night and the farm’s flock by day, the same', () => {
    const w = farm(), blockAt = blocksOf(w), loaded = (x: number, z: number) => w.isLoaded(x, z);
    const rand = makeRng(7);
    const stuckIn: string[] = [], rooted: string[] = [], perched: string[] = [];
    const seen: Partial<Record<Kind, number>> = {};
    const walkers: Creature[] = [];
    for (let i = 0; i < 6000; i++) {
      const px = YARD[0] - 15 + rand() * 30, pz = YARD[1] - 15 + rand() * 30;
      for (const c of trySpawn([], px, pz, i % 2 === 0, rand, blockAt, loaded, { chicken: 6 })) {
        seen[c.kind] = (seen[c.kind] ?? 0) + 1;
        const b = inBlock(c, blockAt);
        if (b) stuckIn.push(`${where(c)}: in ${b}`);
        const on = perchedOn(c, blockAt);
        if (on) perched.push(`${where(c)}: on ${on}`);
        if (walkers.length < 600 && rand() < 0.1) walkers.push(c);
      }
    }
    expect(seen.coyote ?? 0).toBeGreaterThan(1000);
    expect(seen.chicken ?? 0).toBeGreaterThan(1000);
    expect(stuckIn.length, `${stuckIn.length} born inside a block, the first: ${stuckIn.slice(0, 3).join('; ')}`).toBe(0);
    // Nor on top of the yard's fence, the coop's slabs or the fallen roof (a flank in one of them is no reason to be lifted onto it).
    expect(perched.length, `${perched.length} born perched on something built, the first: ${perched.slice(0, 3).join('; ')}`).toBe(0);
    for (const c of walkers) { const at = where(c); if (roams(c, blockAt, rand, 60, c.kind === 'coyote') < 0.3) rooted.push(at); }
    expect(rooted.length, `${rooted.length} of ${walkers.length} never moved, the first: ${rooted.slice(0, 3).join('; ')}`).toBe(0);
  }, 120000);

  it('the wild takes in no body that lies across the line or in a block (Wild.add: the game’s own way of placing Marco, the jaguar and a test’s creature)', () => {
    const w = forest(), blockAt = blocksOf(w);
    const wild = new Wild();
    const lineX = VALLEY.cx - VALLEY.radius - 8; // the bowl's west edge at the valley's own latitude
    const y = groundAt(lineX - 1, VALLEY.cz, blockAt)!;
    expect(y).not.toBeNull();
    // Its middle is outside; its east flank is 0.2 m over the line.
    const boar = makeCreature('boar', lineX - 0.25, y, VALLEY.cz);
    expect(inSanctuary(boar.x, boar.z)).toBe(false);
    expect(acrossTheLine(boar)).toBe(true);
    expect(wild.add(boar, blockAt)).toBe(false);
    // And one whose flank is in a tree's trunk.
    let trunk: [number, number, number] | null = null;
    for (let x = 1500; x < 1560 && !trunk; x++) for (let z = 1000; z < 1080 && !trunk; z++) {
      const g = groundAt(x - 0.5, z + 0.5, blockAt);
      if (g !== null && blockName(blockAt(x, g, z)) === 'log' && blockName(blockAt(x, g + 1, z)) === 'log') trunk = [x, g, z];
    }
    expect(trunk).not.toBeNull();
    const deer = makeCreature('deer', trunk![0] - 0.3, trunk![1], trunk![2] + 0.5);
    expect(inBlock(deer, blockAt)).toContain('log');
    expect(wild.add(deer, blockAt)).toBe(false);
    // On open ground it is taken as before.
    const ok = makeCreature('deer', trunk![0] - 1.5, groundAt(trunk![0] - 1.5, trunk![2] + 0.5, blockAt)!, trunk![2] + 0.5);
    if (!inBlock(ok, blockAt)) expect(wild.add(ok, blockAt)).toBe(true);
    expect(wild.creatures.every((c) => !inBlock(c, blockAt) && !acrossTheLine(c))).toBe(true);
  });
});

// ---- N5f: beats ---------------------------------------------------------------------------------------------
describe('N5f: every beat in the game is walked, on the real land', () => {
  it('each patrol and the sentry are born on their beat clear of every block, and walk it all the way round (the sentry marched on the spot against the wrecked truck)', () => {
    const w = zone2(), blockAt = blocksOf(w), loaded = (x: number, z: number) => w.isLoaded(x, z);
    const beats = SQUADS.filter((q) => q.route);
    expect(beats.map((q) => q.kind).sort()).toEqual(['patrol', 'patrol', 'sentry']);
    for (const q of beats) {
      // Every point of the beat is somewhere a man can stand.
      for (const [x, z] of q.route!) {
        const y = groundAt(x, z, blockAt);
        expect(y, `${q.kind}'s beat at ${x.toFixed(1)}, ${z}`).not.toBeNull();
        const c = makeCreature(q.kind, x, y!, z);
        expect(inBlock(c, blockAt), `${q.kind}'s beat at ${x.toFixed(1)}, ${z}`).toBe('');
        expect(inSanctuary(x, z)).toBe(false);
      }
      const st = newFaction();
      st.down = ~q.bit;
      const [c] = manFaction([], st, q.anchor[0], q.anchor[1], loaded, (x, z) => groundAt(x, z, blockAt), blockAt);
      expect(c, `${q.kind} ${q.bit}`).toBeDefined();
      expect(inBlock(c, blockAt), where(c)).toBe('');
      // Round the beat once, with a half again of the time a walk needs. The player is nowhere near.
      let length = 0;
      q.route!.forEach(([x, z], i) => { const [nx, nz] = q.route![(i + 1) % q.route!.length]; length += Math.hypot(nx - x, nz - z); });
      const seconds = (length / KINDS[q.kind].walk) * 1.5;
      let legs = 0, last = c.leg ?? 0, worst = '';
      for (let k = 0; k < seconds * 20 && legs < q.route!.length; k++) {
        thinkRaider(c, STEP, away, st, blockAt, () => 0.5);
        if ((c.leg ?? 0) !== last) { legs++; last = c.leg ?? 0; }
        const b = inBlock(c, blockAt);
        if (b) worst = `in ${b}`;
        if (acrossTheLine(c)) worst = 'across the sanctuary’s line';
      }
      expect(worst, `${q.kind} ${q.bit}`).toBe('');
      expect(legs, `${q.kind} ${q.bit}: legs of his beat walked in ${Math.round(seconds)} s, stopped at ${c.x.toFixed(1)}, ${c.y}, ${c.z.toFixed(1)}`).toBe(q.route!.length);
    }
  }, 120000);

  it('the two tower guards stand on their platforms, clear of every block, and see the highway below', () => {
    const w = zone2(), blockAt = blocksOf(w), loaded = (x: number, z: number) => w.isLoaded(x, z);
    const posts = SQUADS.filter((q) => q.post);
    expect(posts.length).toBe(2);
    for (const q of posts) {
      const st = newFaction();
      st.down = ~q.bit;
      const [c] = manFaction([], st, q.anchor[0], q.anchor[1], loaded, (x, z) => groundAt(x, z, blockAt), blockAt);
      expect(c).toBeDefined();
      expect(c.kind).toBe('guard');
      expect(inBlock(c, blockAt), where(c)).toBe('');
      expect(stands(c, blockAt), where(c)).toBe(true);
      // He does not fall off it or get pushed from it while he watches.
      for (let k = 0; k < 20 * 30; k++) thinkRaider(c, STEP, away, st, blockAt, () => 0.5);
      expect([c.x, c.y, c.z]).toEqual([q.post!.x, q.post!.y, q.post!.z]);
      // Someone walking up the highway 30 m south of the gate is in his line of sight.
      const px = SQUADS[0].route!.find(([, z]) => z < q.post!.z + 40)![0], pz = q.post!.z + 30;
      const py = groundAt(px, pz, blockAt)!;
      expect(clear(blockAt, c.x, c.y + 1.5, c.z, px, py + 1.2, pz), `guard at ${c.x} sees the highway`).toBe(true);
    }
  });
});

// ---- N5e: the jaguar ----------------------------------------------------------------------------------------
describe('N5e: the jaguar’s one crossing, on the generated camp', () => {
  const F = ZONE1FAR;
  /** Runs the crossing with the player standing at (px, pz); returns where it went and where it was last. */
  const crossing = (px: number, pz: number) => {
    const w = camp(), blockAt = blocksOf(w);
    const wild = new Wild();
    wild.spawning = false;
    const j = makeJaguar((x, z) => groundAt(x, z, blockAt), blockAt)!;
    expect(j).not.toBeNull();
    expect(wild.add(j, blockAt)).toBe(true);
    const py = groundAt(px, pz, blockAt)!;
    const s: WildSenses = { px, py, pz, night: false, shot: false, blockAt, loaded: (x, z) => w.isLoaded(x, z), rand: () => 0.5 };
    const minds = new Set<Mind>();
    let gone = -1, provoked = false, worst = '', last = { kind: j.kind, x: j.x, y: j.y, z: j.z };
    /** Was it in the player's view, or within 60 m of them, at each of its last ten steps (half a second)? */
    const shown: boolean[] = [];
    for (let k = 0; k < 20 * 90 && gone < 0; k++) {
      last = { kind: j.kind, x: j.x, y: j.y, z: j.z };
      shown.push(inView(blockAt, px, py, pz, last));
      const ev = wild.update(STEP, s);
      minds.add(j.mind);
      if (ev.jaguar.includes('provoked')) provoked = true;
      if (ev.jaguar.includes('gone')) gone = k / 20;
      const b = inBlock(j, blockAt);
      if (b) worst = `in ${b}`;
      expect(ev.hits).toEqual([]);
    }
    return { blockAt, px, py, pz, minds, gone, provoked, worst, last, shown: shown.slice(-10), dist: Math.hypot(last.x - px, last.z - pz) };
  };
  /** How near the body is to anything built at the camp: the lodge's and the shed's boxes. */
  const toBuilt = (x: number, z: number) => Math.min(...[F.lodge, F.shed].map((b) => Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.z0 - z, 0, z - b.z1))));

  it('crosses, stops and looks, then leaves along its path into the trees and is gone only where the player cannot see it (it walked into the shed and blinked out at its post, 19 m away in plain view)', () => {
    // Where a player comes into the clearing and where they might stand to watch: the trail's mouth, the
    // clearing's south side, the lodge's door, the clearing's north-east corner.
    for (const [px, pz] of [[F.campHead.x + 0.5, F.camp.z1 + 2.5], [790.5, 982.5], [809.5, 984.5], [F.lodge.x1 + 2.5, F.lodge.z0 + 3.5], [814.5, 961.5]]) {
      const r = crossing(px, pz), at = `player at ${px}, ${pz}: last seen at ${r.last.x.toFixed(1)}, ${r.last.y}, ${r.last.z.toFixed(1)}, ${r.dist.toFixed(0)} m off`;
      expect(r.provoked, at).toBe(false);
      expect([...r.minds].sort(), at).toEqual(['cross', 'leave', 'stare']);
      expect(r.worst, at).toBe('');
      expect(r.gone, at).toBeGreaterThan(0);
      expect(r.gone, at).toBeLessThan(45);
      // Gone into the trees: out of the clearing, well away from the lodge and the shed.
      const out = r.last.x < F.camp.x0 || r.last.x > F.camp.x1 || r.last.z < F.camp.z0 || r.last.z > F.camp.z1;
      expect(out, `${at}: still in the clearing`).toBe(true);
      expect(toBuilt(r.last.x, r.last.z), `${at}: against the camp's buildings`).toBeGreaterThan(4);
      // And out of sight when it went, and for the half second before: hidden by the land or the trees
      // (not for an instant by a lamp post it passed behind), or too far off to make out.
      expect(r.shown.every((v) => !v) || r.dist >= 60, `${at}: it vanished in plain view`).toBe(true);
    }
  }, 120000);

  it('wherever the player stands in or round the clearing (every five metres), it is the same: out of the clearing, clear of the buildings, never stopped, gone out of sight', () => {
    const blockAt = blocksOf(camp());
    let stood = 0, longest = 0;
    for (let px = F.camp.x0 - 7.5; px < F.camp.x1 + 30; px += 5) for (let pz = F.camp.z0 - 7.5; pz < F.camp.z1 + 9; pz += 5) {
      // Not within reach of its crossing and its stare (that is picking a fight), and somewhere one can stand.
      if (Math.hypot(px - Math.max(F.jaguarPath[0][0], Math.min(F.jaguarPath[1][0], px)), pz - F.jaguarPath[0][1]) < 6.5 || groundAt(px, pz, blockAt) === null) continue;
      const r = crossing(px, pz), at = `player at ${px}, ${pz}: last seen at ${r.last.x.toFixed(1)}, ${r.last.y}, ${r.last.z.toFixed(1)}, ${r.dist.toFixed(0)} m off, after ${r.gone} s`;
      stood++;
      longest = Math.max(longest, r.gone);
      expect(r.provoked, at).toBe(false);
      expect(r.worst, at).toBe('');
      expect(r.gone, at).toBeGreaterThan(0);
      expect(r.last.x < F.camp.x0 || r.last.x > F.camp.x1 || r.last.z < F.camp.z0 || r.last.z > F.camp.z1, `${at}: still in the clearing`).toBe(true);
      expect(toBuilt(r.last.x, r.last.z), at).toBeGreaterThan(4);
      expect(r.shown.every((v) => !v) || r.dist >= 60, `${at}: it vanished in plain view`).toBe(true);
    }
    expect(stood).toBeGreaterThan(80);
    expect(longest, 'the longest it took to be gone, seconds').toBeLessThan(45);
  }, 120000);

  it('passes the shed and the rusted trap without a fight: only a blow or a shot turns it once it is leaving', () => {
    // The player waits by the rusted trap, where the game sends them: the way out passes within two metres.
    const r = crossing(F.shed.x0 - 0.5, F.shed.z1 + 2.5);
    expect(r.provoked).toBe(false);
    expect(r.gone).toBeGreaterThan(0);
  }, 120000);
});

// ---- N5d: the warning before a blow -------------------------------------------------------------------------
describe('N5d: among the trees the warning before a blow keeps its length', () => {
  /** Trunks in the forest: where a player might stand with their back to a tree. */
  const trunks = (blockAt: BlockAt): [number, number][] => {
    const out: [number, number][] = [];
    for (let x = 1450; x < 1590; x++) for (let z = 940; z < 1140; z++) {
      const g = groundAt(x + 1.5, z + 0.5, blockAt);
      if (g !== null && blockName(blockAt(x, g, z)) === 'log' && blockName(blockAt(x, g + 1, z)) === 'log') out.push([x, z]);
    }
    return out;
  };
  /**
   * A hostile comes at a player who stands still close by a trunk, from anywhere round them, so that many
   * of them brush the tree as they come in to strike. Returns the length of every wind-up and of every
   * pause after a blow.
   */
  const fights = (kind: Kind, step: (c: Creature, s: Senses) => void, ready: (c: Creature) => void, night = false) => {
    const w = forest(), blockAt = blocksOf(w), rand = makeRng(9);
    const windups: number[] = [], pauses: number[] = [];
    for (const [tx, tz] of trunks(blockAt)) for (let trial = 0; trial < 6; trial++) {
      // The player within a step or two of the trunk, on ground where it stands as tall as they do.
      const pa = rand() * Math.PI * 2, pr = 1.2 + rand();
      const px = tx + 0.5 + Math.cos(pa) * pr, pz = tz + 0.5 + Math.sin(pa) * pr, py = groundAt(px, pz, blockAt);
      if (py === null || blockName(blockAt(tx, py, tz)) !== 'log' || blockName(blockAt(tx, py + 1, tz)) !== 'log') continue;
      // The hostile seven metres from them, on any side.
      const ca = rand() * Math.PI * 2;
      const cx = px + Math.cos(ca) * 7, cz = pz + Math.sin(ca) * 7, cy = groundAt(cx, cz, blockAt);
      if (cy === null || Math.abs(cy - py) > 2) continue;
      const c = makeCreature(kind, cx, cy, cz);
      if (inBlock(c, blockAt)) continue;
      ready(c);
      const s: Senses = { px, py, pz, playerInSanctuary: false, night, shot: false };
      let since = 0;
      for (let k = 0; k < 20 * 25; k++) {
        const before = c.mind;
        step(c, s);
        if (c.mind !== before) {
          if (before === 'windup') windups.push(since);
          if (before === 'recover') pauses.push(since);
          since = 0;
        }
        since += STEP;
      }
    }
    return { windups, pauses };
  };
  const shortest = (xs: number[]) => xs.reduce((m, x) => Math.min(m, x), Infinity);

  it('boar, puma, jaguar, dog and coyote: no wind-up is shorter than the designed one, and no pause after a blow shorter than 1.4 s (they were cut to 0.25 s where the body touched a trunk)', () => {
    const w = forest(), blockAt = blocksOf(w), rand = makeRng(8);
    const animals: [Kind, (c: Creature) => void, boolean][] = [
      ['boar', (c) => { c.mind = 'charge'; c.timer = 8; }, false],
      ['puma', (c) => { c.mind = 'stalk'; c.timer = 30; }, true],
      ['jaguar', (c) => { c.mind = 'charge'; c.timer = 10; c.angry = 60; }, false],
      ['dog', (c) => { c.mind = 'charge'; c.timer = 8; c.angry = 20; c.pack = 0; }, false],
      ['coyote', (c) => { c.mind = 'charge'; c.timer = 8; c.angry = 20; c.pack = 1; }, true],
    ];
    for (const [kind, ready, night] of animals) {
      const r = fights(kind, (c, s) => { think(c, STEP, s, blockAt, rand); }, ready, night);
      expect(r.windups.length, `${kind}: wind-ups seen`).toBeGreaterThan(100);
      const cut = r.windups.filter((t) => t < KINDS[kind].windup - 0.051).length;
      expect(shortest(r.windups), `${kind}: ${cut} of ${r.windups.length} wind-ups cut short`).toBeGreaterThanOrEqual(KINDS[kind].windup - 0.051);
      expect(shortest(r.pauses), `${kind}: shortest pause after a blow, of ${r.pauses.length}`).toBeGreaterThanOrEqual(1.4 - 0.051);
    }
  }, 120000);

  it('the machete men (the outpost’s rusher, Zone-2’s sentry): the raised blade is held its 0.7 s, and 1.2 s pass before the next', () => {
    const w = forest(), blockAt = blocksOf(w);
    for (const kind of ['rusher', 'sentry'] as const) {
      const st: OutpostState = { left: ALL_RAIDERS, alert: true };
      const r = fights(kind, (c, s) => { thinkRaider(c, STEP, s, st, blockAt, () => 0.5); }, (c) => { c.mind = 'charge'; c.timer = 10; c.post = { x: c.x, y: c.y, z: c.z, yaw: 0 }; });
      expect(r.windups.length, `${kind}: wind-ups seen`).toBeGreaterThan(100);
      const cut = r.windups.filter((t) => t < KINDS[kind].windup - 0.051).length;
      expect(shortest(r.windups), `${kind}: ${cut} of ${r.windups.length} wind-ups cut short`).toBeGreaterThanOrEqual(KINDS[kind].windup - 0.051);
      expect(shortest(r.pauses), `${kind}: shortest pause after a blow, of ${r.pauses.length}`).toBeGreaterThanOrEqual(1.2 - 0.051);
    }
  }, 120000);
});

// ---- N5g: dawn -----------------------------------------------------------------------------------------------
describe('N5g: at dawn the night hunters make off, and are gone only out of the player’s sight', () => {
  it('a puma and five coyotes in plain view 30 to 57 m off turn and run when day comes; none vanishes within 80 m while the player can see it (they were deleted where they stood)', () => {
    const w = forest(), blockAt = blocksOf(w);
    const px = 1500.5, pz = 1040.5, py = groundAt(px, pz, blockAt)!;
    const wild = new Wild();
    const hunters: Creature[] = [];
    for (let i = 0; i < 60 && hunters.length < 6; i++) {
      const a = i * 2.4, r = 30 + (i % 4) * 9; // on every side, near and far
      const x = px + Math.cos(a) * r, z = pz + Math.sin(a) * r, y = groundAt(x, z, blockAt);
      if (y === null) continue;
      const c = makeCreature(hunters.length === 0 ? 'puma' : 'coyote', x, y, z);
      if (inBlock(c, blockAt) || !inView(blockAt, px, py, pz, c)) continue;
      if (wild.add(c, blockAt)) hunters.push(c);
    }
    expect(hunters.length).toBe(6);
    const s: WildSenses = { px, py, pz, night: false, shot: false, blockAt, loaded: (x, z) => w.isLoaded(x, z), rand: makeRng(10) };
    const began = new Map(hunters.map((c) => [c, Math.hypot(c.x - px, c.z - pz)]));
    const last = new Map<Creature, { kind: Kind; x: number; y: number; z: number }>();
    const left = new Set<Creature>();
    const wrong: string[] = [];
    for (let k = 0; k < 20 * 30; k++) {
      for (const c of hunters) if (!left.has(c)) last.set(c, { kind: c.kind, x: c.x, y: c.y, z: c.z });
      const ev = wild.update(STEP, s);
      expect(ev.hits).toEqual([]);
      for (const c of hunters) {
        if (left.has(c)) continue;
        expect(acrossTheLine(c), where(c)).toBe(false);
        expect(inBlock(c, blockAt), where(c)).toBe('');
        if (wild.creatures.includes(c)) continue;
        left.add(c);
        const l = last.get(c)!, d = Math.hypot(l.x - px, l.z - pz);
        if (d < 80 && inView(blockAt, px, py, pz, l)) wrong.push(`the ${c.kind} that stood ${began.get(c)!.toFixed(0)} m off vanished ${d.toFixed(0)} m off, in plain view, after ${(k / 20).toFixed(1)} s`);
      }
    }
    expect(wrong).toEqual([]);
    // And they do go: half a minute into the day each is gone, or has run a good way further off.
    for (const c of hunters) if (!left.has(c)) expect(Math.hypot(c.x - px, c.z - pz), where(c)).toBeGreaterThan(began.get(c)! + 15);
    expect(left.size).toBeGreaterThanOrEqual(4);
  }, 120000);

  it('whatever runs from the player toward the valley, at dawn or at any hour, runs up to the sanctuary’s line on the real rim and stops: no part of any animal crosses it', () => {
    const w = forest(), blockAt = blocksOf(w), rand = makeRng(16);
    const edge = VALLEY.radius + 8;
    for (const kind of ['rabbit', 'deer', 'boar', 'puma', 'dog', 'coyote', 'chicken', 'jaguar'] as const) {
      let ran = 0, stopped = 0;
      // Along the west rim: the animal six metres outside the line, the player eight metres beyond it.
      for (let a = Math.PI - 0.5; a < Math.PI + 0.5 && ran < 6; a += 0.05) {
        const at = (r: number): [number, number] => [VALLEY.cx + Math.cos(a) * r, VALLEY.cz + Math.sin(a) * r];
        const [cx, cz] = at(edge + 6), [px, pz] = at(edge + 14);
        const cy = groundAt(cx, cz, blockAt), py = groundAt(px, pz, blockAt);
        if (cy === null || py === null) continue;
        const c = makeCreature(kind, cx, cy, cz);
        if (!new Wild().add(c, blockAt)) continue;
        ran++;
        const toLine = () => Math.hypot(c.x - VALLEY.cx, c.z - VALLEY.cz) - edge;
        for (let k = 0; k < 20 * 8; k++) {
          c.mind = 'flee'; c.timer = 3; // as the dawn's leaving sets it, each second
          think(c, STEP, { px, py, pz, playerInSanctuary: false, night: false, shot: false }, blockAt, rand);
          expect(acrossTheLine(c), where(c)).toBe(false);
          expect(inBlock(c, blockAt), where(c)).toBe('');
        }
        if (toLine() < KINDS[kind].width / 2 + 0.75) stopped++;
      }
      expect(ran, `${kind}: places tried`).toBe(6);
      expect(stopped, `${kind}: ran up to the line and stopped at it`).toBeGreaterThanOrEqual(2);
    }
  });
});

// ---- The sanctuary's rule, for every kind that can do harm, on the real rim ---------------------------------
describe('the sanctuary on the real rim: nothing that can do harm is born in it, steps or is pushed into it, or strikes into it', () => {
  const HARMFUL = (Object.keys(KINDS) as Kind[]).filter((k) => KINDS[k].hostile);
  const edge = VALLEY.radius + 8;
  const at = (a: number, r: number): [number, number] => [VALLEY.cx + Math.cos(a) * r, VALLEY.cz + Math.sin(a) * r];
  /** The top of the land at a column, sanctuary or not (groundAt gives nothing inside it). */
  const topAt = (blockAt: BlockAt, x: number, z: number): number => { let y = 190; while (y > 3 && !B_SOLID[blockAt(Math.floor(x), y - 1, Math.floor(z))]) y--; return y; };
  /** Each kind at its most dangerous: charging, alerted, hunting. */
  const roused = (c: Creature) => {
    c.mind = RAIDER_KINDS.has(c.kind) || c.squad !== undefined ? 'alerted' : 'charge'; c.timer = 10; c.angry = 60; c.pack = 0;
    if (c.kind === 'ashen') { c.nest = 0; c.leg = 1; }
  };

  it('covers every hostile kind there is', () => {
    expect(HARMFUL.sort()).toEqual(['ashen', 'boar', 'coyote', 'dog', 'guard', 'gunman', 'jaguar', 'lookout', 'patrol', 'puma', 'rusher', 'sentry']);
  });

  it('none is taken in with its middle inside the line, or with any part of it across the line', () => {
    const blockAt = blocksOf(forest());
    for (const kind of HARMFUL) for (const a of [Math.PI - 0.3, Math.PI, Math.PI + 0.3]) {
      const [ix, iz] = at(a, edge - 2), inside = makeCreature(kind, ix, topAt(blockAt, ix, iz), iz);
      expect(inSanctuary(ix, iz)).toBe(true);
      expect(new Wild().add(inside, blockAt), `${kind} inside`).toBe(false);
      const [sx, sz] = at(a, edge + KINDS[kind].width / 2 - 0.1), across = makeCreature(kind, sx, topAt(blockAt, sx, sz), sz);
      expect(inSanctuary(sx, sz)).toBe(false);
      expect(acrossTheLine(across)).toBe(true);
      expect(new Wild().add(across, blockAt), `${kind} across the line`).toBe(false);
    }
  });

  it('roused, shot at and shoved toward a player who stands three metres inside the line, each stays wholly outside it and lands no blow and no bullet', () => {
    const w = forest(), blockAt = blocksOf(w);
    for (const kind of HARMFUL) {
      let tried = 0;
      for (let a = Math.PI - 0.5; a < Math.PI + 0.5 && tried < 4; a += 0.04) {
        const [cx, cz] = at(a, edge + 2.5), [px, pz] = at(a, edge - 3);
        const cy = groundAt(cx, cz, blockAt);
        if (cy === null) continue;
        const c = makeCreature(kind, cx, cy, cz);
        if (RAIDER_KINDS.has(kind)) c.post = { x: cx, y: cy, z: cz, yaw: 0 };
        else if (FACTION_KINDS.has(kind)) { c.squad = 1; c.route = [[VALLEY.cx, VALLEY.cz], [cx, cz]]; c.leg = 0; } // a beat that runs into the valley
        const wild = new Wild();
        wild.spawning = false;
        if (!wild.add(c, blockAt)) continue;
        tried++;
        wild.outpost.alert = true; wild.faction.alert = true; wild.faction.blown = true;
        const py = topAt(blockAt, px, pz);
        expect(inSanctuary(px, pz)).toBe(true);
        for (let k = 0; k < 20 * 15; k++) {
          if (k % 40 === 0) roused(c);
          // Shoved at the valley, as a blow or a slope might.
          c.vx += (VALLEY.cx - c.x) * 0.05; c.vz += (VALLEY.cz - c.z) * 0.05;
          const ev = wild.update(STEP, { px, py, pz, pv: 5.6, sprint: true, night: true, shot: k === 3, blockAt, loaded: (x, z) => w.isLoaded(x, z), rand: () => 0, lightAt: () => 0 });
          expect(ev.hits, `${where(c)} struck a player in the sanctuary`).toEqual([]);
          expect(ev.raiders.filter((e) => (e.kind === 'shot' && e.hit) || e.kind === 'blow'), where(c)).toEqual([]);
          expect(ev.ashen.filter((e) => e.kind === 'hit' || e.kind === 'shriek'), where(c)).toEqual([]);
          expect(acrossTheLine(c), `${where(c)} is across the line`).toBe(false);
          expect(inBlock(c, blockAt), where(c)).toBe('');
        }
      }
      expect(tried, `${kind}: places tried`).toBe(4);
    }
  }, 120000);
});

// ---- The scripted scenes that had no test on real ground ---------------------------------------------------
describe('the farmhouse den, on the generated farm', () => {
  const H = ZONE1.house;
  const outOfHouse = (c: Creature) => c.x < H.x0 - 0.5 || c.x > H.x1 + 0.5 || c.z < H.z0 - 0.5 || c.z > H.z1 + 0.5;
  /** A minute of the player standing at (px, pz) by day, the wild running as it does in the game. */
  const visit = (px: number, pz: number, seed: number) => {
    const w = farm(), blockAt = blocksOf(w);
    const wild = new Wild();
    const s: WildSenses = { px, py: groundAt(px, pz, blockAt)!, pz, night: false, shot: false, blockAt, loaded: (x, z) => w.isLoaded(x, z), rand: makeRng(seed) };
    const out = new Set<number>(), struck = new Set<number>();
    let barks = 0, first = -1, worst = '';
    for (let k = 0; k < 20 * 60; k++) {
      const ev = wild.update(STEP, s);
      barks += ev.sounds.filter((x) => x.kind === 'bark').length;
      for (const c of wild.creatures) if (c.kind === 'dog') {
        if (outOfHouse(c)) out.add(c.pack);
        if (c.mind === 'windup') { struck.add(c.pack); if (first < 0) first = k / 20; }
        const b = inBlock(c, blockAt);
        if (b) worst = `${where(c)} in ${b}`;
      }
    }
    return { dogs: wild.creatures.filter((c) => c.kind === 'dog').length, out: out.size, struck: struck.size, barks, first, worst };
  };

  it('its dogs are born clear of the ruin’s walls and its rubble (a third were born with a flank in a wall)', () => {
    const w = farm(), blockAt = blocksOf(w), rand = makeRng(11);
    let born = 0;
    const stuckIn: string[] = [], perched: string[] = [];
    for (let i = 0; i < 300; i++) for (const c of denPack([], DEN[0] + 40, DEN[2], DEN_SIZE, rand, blockAt, (x, z) => w.isLoaded(x, z))) {
      born++;
      const b = inBlock(c, blockAt);
      if (b) stuckIn.push(`${where(c)} in ${b}`);
      const on = perchedOn(c, blockAt);
      if (on) perched.push(`${where(c)} on ${on}`);
      expect(stands(c, blockAt), where(c)).toBe(true);
      expect(Math.hypot(c.x - DEN[0], c.z - DEN[2])).toBeLessThan(3);
    }
    expect(born).toBeGreaterThan(500);
    expect(stuckIn.length, `${stuckIn.length} of ${born} born in a block, the first: ${stuckIn.slice(0, 3).join('; ')}`).toBe(0);
    expect(perched.length, `${perched.length} of ${born} born up on the fallen roof, the first: ${perched.slice(0, 3).join('; ')}`).toBe(0);
  });

  it('from the yard to the east and the field to the west all three come out to the player, one bark each, not a hundred (a dog against a wall barked four times a second)', () => {
    for (const [px, pz] of [[DEN[0] + 10, DEN[2]], [DEN[0] - 10, DEN[2]]]) for (const seed of [1, 2, 3]) {
      const r = visit(px, pz, seed), at = `player at ${px}, ${pz}, seed ${seed}: ${JSON.stringify(r)}`;
      expect(r.dogs, at).toBe(3);
      expect(r.worst, at).toBe('');
      expect(r.out, at).toBe(3);
      expect(r.struck, at).toBeGreaterThanOrEqual(2);
      expect(r.first, at).toBeGreaterThan(0);
      expect(r.first, at).toBeLessThan(8);
      expect(r.barks, at).toBeLessThanOrEqual(6);
    }
  }, 120000);

  it('from the south, and from the north where the ruin’s wall still stands, the pack still reaches the player: two of them round the south, one round the north wall', () => {
    for (const [px, pz, want] of [[DEN[0], DEN[2] + 11, 2], [DEN[0], DEN[2] - 10, 1]]) for (const seed of [1, 2, 3]) {
      const r = visit(px, pz, seed), at = `player at ${px}, ${pz}, seed ${seed}: ${JSON.stringify(r)}`;
      expect(r.worst, at).toBe('');
      expect(r.out, at).toBeGreaterThanOrEqual(want);
      expect(r.struck, at).toBeGreaterThanOrEqual(1);
      expect(r.first, at).toBeLessThan(12);
      expect(r.barks, at).toBeLessThanOrEqual(14);
    }
  }, 120000);
});

describe('the raiders’ outpost, on the generated land', () => {
  const posted = () => {
    const w = camp(), blockAt = blocksOf(w);
    const st: OutpostState = { left: ALL_RAIDERS, alert: false };
    const men = manOutpost([], st, OUTPOST_AT[0] + 40, OUTPOST_AT[1], (x, z) => w.isLoaded(x, z), blockAt);
    return { w, blockAt, st, men };
  };

  it('the three stand at their posts, clear of every block: the lookout on the roof, the pistol behind the sandbags, the machete in the doorway', () => {
    const { blockAt, men } = posted();
    expect(men.map((c) => c.kind)).toEqual(['lookout', 'gunman', 'rusher']);
    const post = { lookout: POSTS.lookout, gunman: POSTS.pistol, rusher: POSTS.machete };
    for (const c of men) {
      expect(inBlock(c, blockAt), where(c)).toBe('');
      expect(stands(c, blockAt), where(c)).toBe(true);
      expect([c.x, c.y, c.z], c.kind).toEqual([post[c.kind as 'lookout'].x, post[c.kind as 'lookout'].y, post[c.kind as 'lookout'].z]);
    }
    expect(blockName(blockAt(Math.floor(POSTS.lookout.x), POSTS.lookout.y - 1, Math.floor(POSTS.lookout.z)))).toBe('cinder_block'); // the roof
  });

  it('the fight plays on the real blocks: seen from the road, a shout, an aimed shot, the machete out of the doorway to the player and back to his post when they have gone', () => {
    const w = camp(), blockAt = blocksOf(w);
    const wild = new Wild();
    // In front of the yard, on the road, east of the door.
    const px = OUTPOST_AT[0] + 6.5, pz = Math.floor(roadZ(OUTPOST_AT[0] + 6)) + 0.5;
    const s: WildSenses = { px, py: groundAt(px, pz, blockAt)!, pz, night: false, shot: false, blockAt, loaded: (x, z) => w.isLoaded(x, z), rand: makeRng(12) };
    const at: Record<string, number> = {};
    let worst = '';
    const run = (seconds: number, t0: number) => {
      for (let k = 0; k < seconds * 20; k++) {
        const ev = wild.update(STEP, s);
        for (const e of ev.raiders) at[`${e.c.kind} ${e.kind}`] ??= t0 + k / 20;
        for (const c of wild.creatures) if (RAIDER_KINDS.has(c.kind)) { const b = inBlock(c, blockAt); if (b) worst = `${where(c)} in ${b}`; }
      }
    };
    run(20, 0);
    expect(wild.creatures.filter((c) => RAIDER_KINDS.has(c.kind)).length).toBe(3);
    expect(wild.outpost.alert).toBe(true);
    expect(Object.keys(at).some((k) => k.endsWith('shout'))).toBe(true);
    expect(at['gunman shot'] - at['gunman aim']).toBeGreaterThanOrEqual(KINDS.gunman.windup - 0.051);
    expect(at['rusher swing'], 'the machete reaches the player').toBeLessThan(10);
    expect(at['rusher blow'] - at['rusher swing']).toBeGreaterThanOrEqual(KINDS.rusher.windup - 0.051);
    // The player goes off east down the road, out of their sight: he walks back to the doorway.
    s.px = OUTPOST_AT[0] + 80; s.pz = Math.floor(roadZ(s.px)) + 0.5; s.py = groundAt(s.px, s.pz, blockAt)!;
    run(60, 20);
    const rusher = wild.creatures.find((c) => c.kind === 'rusher')!;
    expect(Math.hypot(rusher.x - POSTS.machete.x, rusher.z - POSTS.machete.z), `the machete is back at his post: ${where(rusher)}`).toBeLessThan(1);
    expect(worst).toBe('');
  }, 120000);

  /** The brush trail walked at a walking pace from the road to the outpost's back: who sees the player, and where. */
  const walkTheTrail = () => {
    const { blockAt, men } = posted();
    const sightings: string[] = [];
    let maxStep = 0, holes = 0;
    const t = ZONE1FAR.brushTrail;
    let px = t[0][0] + 0.5, pz = t[0][1] + 0.5, py = groundAt(px, pz, blockAt)!;
    for (const [gx, gz] of t.slice(1)) for (let k = 0; k < 2000; k++) {
      const dx = gx + 0.5 - px, dz = gz + 0.5 - pz, d = Math.hypot(dx, dz);
      if (d < 0.25) break;
      px += (dx / d) * 0.2; pz += (dz / d) * 0.2;
      const y = groundAt(px, pz, blockAt);
      if (y === null) { holes++; continue; }
      maxStep = Math.max(maxStep, Math.abs(y - py));
      py = y;
      expect(inSanctuary(px, pz)).toBe(false);
      for (const c of men) if (raiderSees(c, { px, py, pz, playerInSanctuary: false, night: false, shot: false }, false, blockAt)) sightings.push(`${c.kind} at ${Math.round(px)}, ${Math.round(pz)}`);
    }
    return { sightings: [...new Set(sightings)], maxStep, holes, end: [px, py, pz] as [number, number, number] };
  };

  it('the stealth route can be walked: ground all the way, no step over one block, ending at the outpost’s back; the pistol and the machete never see a player on it', () => {
    const r = walkTheTrail(), o = ZONE1FAR.outpost;
    expect(r.holes).toBe(0);
    expect(r.maxStep).toBeLessThanOrEqual(1);
    expect(r.end[2]).toBeGreaterThan(o.z1);
    expect(r.end[1]).toBe(o.floor);
    expect(r.sightings.filter((x) => !x.startsWith('lookout'))).toEqual([]);
  });

  // NOT YET TRUE, and not fixable by moving a post or a path: the trail's west leg (x 889 down to 879, z 1046)
  // runs along a slope that falls toward the outpost, so its bushes stand on lower ground than the player and
  // the lookout on his roof sees over them (he notices at x 889 and shouts by x 880). It needs blocks: the
  // brush a block or two taller on that leg's north side (src/gen/zone1far.ts). Told to the lead.
  it('the stealth route hides the player from the lookout all the way (the brush on ground below the trail is grown taller: docs/PHASE9B.md, 3)', () => {
    expect(walkTheTrail().sightings).toEqual([]);
  });
});

describe('Marco, the coyotes and the puma, on the generated land', () => {
  it('Marco stands under his shelter’s roof on its floor, clear of every block, and only turns to whoever comes', () => {
    const w = farm(), blockAt = blocksOf(w);
    const wild = new Wild();
    wild.spawning = false;
    const m = makeCreature('marco', MARCO_SPOT[0], MARCO_SPOT[1], MARCO_SPOT[2]);
    expect(wild.add(m, blockAt)).toBe(true);
    expect([m.x, m.y, m.z]).toEqual(MARCO_SPOT);
    expect(inBlock(m, blockAt)).toBe('');
    expect(stands(m, blockAt)).toBe(true);
    expect(blockName(blockAt(Math.floor(m.x), m.y + 3, Math.floor(m.z)))).toBe('tin_roof'); // under the roof, not on it
    const px = m.x + 3, pz = m.z + 5;
    const s: WildSenses = { px, py: groundAt(px, pz, blockAt)!, pz, night: false, shot: false, blockAt, loaded: (x, z) => w.isLoaded(x, z), rand: makeRng(13) };
    for (let k = 0; k < 20 * 20; k++) expect(wild.update(STEP, s).hits).toEqual([]);
    expect([m.x, m.y, m.z]).toEqual(MARCO_SPOT);
    expect(m.yaw).toBeCloseTo(Math.atan2(-(px - m.x), -(pz - m.z)), 5); // facing the player
  });

  it('a coyote pack the spawner makes within 30 m of a player at night (where they take notice) gives itself away, and at least two of it close in and strike (on real slopes most such packs just wandered)', () => {
    const w = farm(), blockAt = blocksOf(w), loaded = (x: number, z: number) => w.isLoaded(x, z);
    let packs = 0, reached = 0, flanked = 0;
    const lost: string[] = [];
    for (const [px, pz] of [[1030.5, 1050.5], [1070.5, 1010.5], [1085.5, 1040.5]]) {
      const py = groundAt(px, pz, blockAt)!;
      for (let seed = 1; seed <= 60; seed++) {
        const rand = makeRng(seed);
        let pack: Creature[] = [];
        for (let k = 0; k < 400 && !pack.length; k++) pack = trySpawn([], px, pz, true, rand, blockAt, loaded).filter((c) => c.kind === 'coyote');
        if (pack.length < 2 || pack.some((c) => Math.hypot(c.x - px, c.z - pz) > 29.5)) continue;
        packs++;
        const wild = new Wild();
        wild.spawning = false;
        for (const c of pack) expect(wild.add(c, blockAt), where(c)).toBe(true);
        const s: WildSenses = { px, py, pz, night: true, shot: false, blockAt, loaded, rand };
        const struck = new Set<number>();
        let yips = 0, first = -1;
        for (let k = 0; k < 20 * 60; k++) {
          yips += wild.update(STEP, s).sounds.filter((x) => x.kind === 'yip').length;
          for (const c of pack) {
            if (c.mind === 'windup') { struck.add(c.pack); if (first < 0) first = k / 20; }
            expect(inBlock(c, blockAt), where(c)).toBe('');
          }
        }
        const at = `player at ${px}, ${pz}, seed ${seed}: a pack of ${pack.length}, ${struck.size} struck, first after ${first} s, ${yips} yips`;
        expect(yips, at).toBeGreaterThanOrEqual(1);
        expect(yips, at).toBeLessThanOrEqual(12); // not a yip at every step against a bank
        if (first >= 0 && first < 40) reached++; else lost.push(at);
        if (struck.size >= 2) flanked++;
      }
    }
    expect(packs).toBeGreaterThanOrEqual(12);
    // Every such pack reaches the player (they have no path-finding: allow one in ten a bank they cannot round),
    // and in most of them two or more get their blow in.
    expect(reached, `${reached} of ${packs} packs reached the player; not: ${lost.join('; ')}`).toBeGreaterThanOrEqual(Math.ceil(packs * 0.9));
    expect(flanked, `${flanked} of ${packs} packs struck with two or more`).toBeGreaterThanOrEqual(Math.ceil(packs * 0.7));
  }, 120000);

  it('the puma at night stalks a player 35 m off through the real forest, uphill or down, and reaches them to strike (a puma four blocks up or down the slope took no notice)', () => {
    const w = forest(), blockAt = blocksOf(w);
    for (const [px, pz] of [[1500.5, 1040.5], [1490.5, 1000.5]]) {
      const py = groundAt(px, pz, blockAt)!;
      let tried = 0, reached = 0, slopes = 0;
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2, x = px + Math.cos(a) * 35, z = pz + Math.sin(a) * 35, y = groundAt(x, z, blockAt);
        if (y === null) continue;
        const c = makeCreature('puma', x, y, z);
        const wild = new Wild();
        wild.spawning = false;
        if (!wild.add(c, blockAt)) continue;
        tried++;
        if (Math.abs(c.y - py) >= 3) slopes++;
        const s: WildSenses = { px, py, pz, night: true, shot: false, blockAt, loaded: (bx, bz) => w.isLoaded(bx, bz), rand: makeRng(i) };
        let struck = false;
        for (let k = 0; k < 20 * 60 && !struck; k++) {
          wild.update(STEP, s);
          struck = c.mind === 'windup';
          expect(inBlock(c, blockAt), where(c)).toBe('');
          expect(acrossTheLine(c)).toBe(false);
        }
        if (struck) reached++;
      }
      expect(tried).toBeGreaterThanOrEqual(12);
      expect(slopes, 'some of them start three blocks or more above or below the player').toBeGreaterThanOrEqual(3);
      expect(reached, `round ${px}, ${pz}: ${reached} of ${tried} pumas reached the player`).toBeGreaterThanOrEqual(tried - 2);
    }
  }, 120000);
});

describe('the ones that are placed, not spawned, on the generated land', () => {
  it('Zone-3’s nine Ashen in their nests and the first one out in the road, and the jaguar at the clearing’s edge: each clear of every block, each standing on something', () => {
    const w = zone3(), blockAt = blocksOf(w);
    const st = newAshen();
    const all: Creature[] = [];
    for (const n of ZONE3.nests) all.push(...manAshen(all, st, n.x, n.z, false, (x, z) => w.isLoaded(x, z), (x, y, z) => floorNear(x, y, z, blockAt), blockAt));
    expect(all.length).toBe(9);
    expect(all.filter((c) => c.post).length).toBe(1); // the first one, out in the road by day
    for (const c of all) {
      expect(inBlock(c, blockAt), where(c)).toBe('');
      expect(stands(c, blockAt), where(c)).toBe(true);
      expect(inSanctuary(c.x, c.z)).toBe(false);
    }
    const cb = blocksOf(camp());
    const j = makeJaguar((x, z) => groundAt(x, z, cb), cb)!;
    expect(j).not.toBeNull();
    expect(inBlock(j, cb)).toBe('');
    expect(stands(j, cb)).toBe(true);
  });

  it('a coop’s tame hens in the valley: born beside it clear of every block, taken in by the wild though they are in the sanctuary, and they walk', () => {
    const w = load(GARDEN.x0, GARDEN.z0, GARDEN.x1, GARDEN.z1), blockAt = blocksOf(w);
    // A coop on open ground in the garden, three hens in it.
    const x = GARDEN.x0 + 20, z = GARDEN.z0 + 20;
    let y = 190;
    while (!B_SOLID[blockAt(x, y - 1, z)]) y--;
    expect(inSanctuary(x, z)).toBe(true);
    expect(w.setBlock(x, y, z, COOP)).toBe(true);
    w.containerAt(x, y, z)![0] = { id: itemId('live_chicken'), count: 3 };
    const hens = syncTameHens(w, [], x, z);
    expect(hens.length).toBe(3);
    const wild = new Wild(), rand = makeRng(14);
    for (const c of hens) {
      expect(inBlock(c, blockAt), where(c)).toBe('');
      expect(stands(c, blockAt), where(c)).toBe(true);
      expect(inSanctuary(c.x, c.z)).toBe(true);
      expect(wild.add(c, blockAt)).toBe(true);
      const from = [c.x, c.z];
      let far = 0;
      for (let k = 0; k < 20 * 120; k++) {
        think(c, STEP, { px: x + 30, py: y, pz: z, playerInSanctuary: true, night: false, shot: false }, blockAt, rand);
        far = Math.max(far, Math.hypot(c.x - from[0], c.z - from[1]));
        expect(Math.hypot(c.x - (x + 0.5), c.z - (z + 0.5))).toBeLessThanOrEqual(TAME_LEASH + 0.01);
        expect(inBlock(c, blockAt), where(c)).toBe('');
      }
      expect(far, `${where(c)} walked`).toBeGreaterThan(0.5);
    }
    // And nothing wild is taken in there.
    const stray = makeCreature('coyote', x + 2.5, y, z + 0.5);
    expect(wild.add(stray, blockAt)).toBe(false);
  }, 120000);
});

// ---- The same finding's small ones: the bow at home (N5h), a dimmer lamp (N5i), a block on a crop ----------
describe('N5h: the bow can be loosed inside the valley, and no arrow from outside flies into it', () => {
  const fly = (blockAt: BlockAt, x: number, y: number, z: number, dx: number, dy: number, dz: number) => {
    const wild = new Wild();
    const a = wild.shoot(x, y, z, dx, dy, dz, 1);
    let inside = 0;
    for (let k = 0; k < 20 * 8 && !a.stuck; k++) { stepArrow(a, STEP, blockAt); if (inSanctuary(a.x, a.z)) inside++; }
    return { a, flew: Math.hypot(a.x - x, a.z - z), inside };
  };

  it('from the valley floor a full draw flies its 20 m and more (it dropped at the archer’s feet: flew 0 m)', () => {
    const w = land('valley', VALLEY.cx - 40, VALLEY.cz - 40, VALLEY.cx + 40, VALLEY.cz + 40), blockAt = blocksOf(w);
    // Open ground on the valley floor with 30 m clear to the west of it at eye height.
    let from: [number, number, number] | null = null;
    for (let x = VALLEY.cx + 30; x > VALLEY.cx && !from; x--) for (let z = VALLEY.cz - 20; z < VALLEY.cz + 20 && !from; z++) {
      let y = 120;
      while (y > 60 && !B_SOLID[blockAt(x, y - 1, z)]) y--;
      if (clear(blockAt, x + 0.5, y + 1.6, z + 0.5, x - 29.5, y + 1.6, z + 0.5) && !B_SOLID[blockAt(x, y, z)]) from = [x + 0.5, y, z + 0.5];
    }
    expect(from).not.toBeNull();
    expect(inSanctuary(from![0], from![2])).toBe(true);
    const r = fly(blockAt, from![0], from![1] + 1.5, from![2], -0.98, 0.2, 0);
    expect(r.flew, 'metres flown from the valley floor').toBeGreaterThan(20);
  });

  it('an arrow loosed outside at the valley is still stopped at the sanctuary’s line, on the real rim', () => {
    const w = forest(), blockAt = blocksOf(w);
    const lineX = VALLEY.cx - VALLEY.radius - 8;
    for (const back of [3, 8, 15]) for (const rise of [0.1, 0.4, 0.8]) {
      const x = lineX - back, z = VALLEY.cz + 0.5, y = groundAt(x, z, blockAt)!;
      const len = Math.hypot(1, rise);
      const r = fly(blockAt, x, y + 1.5, z, 1 / len, rise / len, 0);
      expect(r.inside, `loosed ${back} m outside, rising ${rise}`).toBe(0);
      expect(r.a.x).toBeLessThan(lineX);
    }
  });
});

describe('N5i: a dimmer light keeps its glow when a brighter one beside it is taken away', () => {
  const COLS: [number, number][] = [];
  for (let cz = 30; cz <= 32; cz++) for (let cx = 55; cx <= 57; cx++) COLS.push([cx, cz]);
  const build = (edits: World['edits'] = new Map()): World => {
    const w = new World();
    w.edits = edits;
    for (const [cx, cz] of COLS) w.addColumn(cx, cz, (runJob({ kind: 'gen', cx, cz, edits: w.columnEdits(cx, cz) }).result as GenResult).chunks);
    return w;
  };
  /** Cells of the middle column and its seams whose light differs from the same edits lit from scratch. */
  const mismatches = (edited: World): number => {
    const fresh = build(edited.edits);
    let bad = 0;
    for (let y = 60; y < 140; y++) for (let z = 31 * 32 - 8; z < 32 * 32 + 8; z++) for (let x = 56 * 32 - 8; x < 57 * 32 + 8; x++) if (edited.lightAt(x, y, z) !== fresh.lightAt(x, y, z)) bad++;
    return bad;
  };
  /** A room cut in the plateau's rock (no daylight), spanning the seam between two columns at x 1824. */
  const room = (w: World) => { for (let x = 1814; x < 1834; x++) for (let z = 1002; z < 1012; z++) for (let y = 100; y < 104; y++) w.setBlock(x, y, z, AIR); };

  it('a smelter beside a lantern: take the lantern and the smelter still glows (the cell beside it read 0, should be 8)', () => {
    const w = build();
    room(w);
    w.setBlock(1820, 100, 1006, blockId('smelter'));
    w.setBlock(1822, 100, 1006, blockId('lantern'));
    expect(blockOf(w.lightAt(1821, 100, 1006))).toBe(14);
    w.setBlock(1822, 100, 1006, AIR);
    expect(blockOf(w.lightAt(1820, 100, 1006)), 'the smelter’s own cell').toBe(9);
    expect(blockOf(w.lightAt(1819, 100, 1006)), 'the cell beside the smelter').toBe(8);
    expect(mismatches(w)).toBe(0);
  });

  it('sources of every strength set down and taken up in any order, across a seam: the light is what lighting from scratch gives', () => {
    const w = build(), rand = makeRng(15);
    room(w);
    const lamps = ['lantern', 'fireplace', 'stove', 'smelter', 'kiln', 'forge', 'mining_rig', 'sealed_lamp'].map(blockId);
    const put: [number, number, number][] = [];
    for (let i = 0; i < 60; i++) {
      if (put.length > 3 && rand() < 0.45) {
        const [x, y, z] = put.splice(Math.floor(rand() * put.length), 1)[0];
        w.setBlock(x, y, z, AIR);
      } else {
        const x = 1814 + Math.floor(rand() * 20), y = 100 + Math.floor(rand() * 4), z = 1002 + Math.floor(rand() * 10);
        if (w.blockAt(x, y, z) !== AIR) continue;
        w.setBlock(x, y, z, lamps[Math.floor(rand() * lamps.length)]);
        put.push([x, y, z]);
      }
      if (i % 10 === 9) expect(mismatches(w), `after ${i + 1} edits`).toBe(0);
    }
    expect(put.length).toBeGreaterThan(3);
  }, 120000);
});

describe('a block in hand never wipes out a crop', () => {
  it('right-clicking a growing crop with planks places nothing and costs nothing; grass still gives way; the crop still gives its seed when dug', () => {
    const w = load(GARDEN.x0, GARDEN.z0, GARDEN.x1, GARDEN.z1);
    const x = GARDEN.x0 + 10, z = GARDEN.z0 + 10;
    let y = 190;
    while (!B_SOLID[w.blockAt(x, y - 1, z)]) y--;
    w.setBlock(x, y - 1, z, blockId('farmland'));
    w.setBlock(x, y, z, AIR);
    const seeds = new Inventory();
    seeds.slots[0] = { id: itemId('seeds_corn'), count: 1 };
    expect(sow(w, seeds, x, y - 1, z)).toBe(true);
    const crop = w.blockAt(x, y, z);
    expect(blockName(crop)).toBe('crop_corn_0');
    const hand = new Inventory();
    hand.slots[0] = { id: blockId('planks'), count: 5 };
    const nobody = { intersectsBlock: () => false };
    expect(placeBlock(w, hand, nobody, { x, y, z, nx: 0, ny: 1, nz: 0, id: crop, dist: 1 })).toBeNull();
    expect(w.blockAt(x, y, z)).toBe(crop);
    expect(hand.current!.count).toBe(5);
    // Nor from the side: a click on the face of a block that stands against the crop.
    w.setBlock(x - 1, y, z, blockId('planks'));
    expect(placeBlock(w, hand, nobody, { x: x - 1, y, z, nx: 1, ny: 0, nz: 0, id: blockId('planks'), dist: 1 })).toBeNull();
    expect(w.blockAt(x, y, z)).toBe(crop);
    expect(hand.current!.count).toBe(5);
    // Wild grass is not a crop: a block set into it takes its place, as before.
    w.setBlock(x + 2, y - 1, z, blockId('dirt'));
    w.setBlock(x + 2, y, z, blockId('tall_grass'));
    expect(placeBlock(w, hand, nobody, { x: x + 2, y, z, nx: 0, ny: 1, nz: 0, id: blockId('tall_grass'), dist: 1 })).toEqual([x + 2, y, z]);
    expect(hand.current!.count).toBe(4);
    // And the crop, dug up, gives its seed back.
    const pack = new Inventory();
    expect(breakBlock(w, pack, x, y, z).changed).toBe(true);
    expect(pack.count(itemId('seeds_corn'))).toBe(1);
  });
});
