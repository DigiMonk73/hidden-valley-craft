// Zone-2's faction (docs/PHASE6.md, 2): the men of Las Cruces. A pair of patrols walks the highway between the
// border and the gate, a sentry walks round the ruins, and a guard stands on each gate tower. They fight as the
// outpost's raiders do (src/entity/outpost.ts): seen first, every shot telegraphed, cover works. Unlike the
// outpost they are a standing force: one killed stays down only until the next dawn. Never more than three
// in a group. With the scout's armband carried, an unalerted man takes you for one of his own beyond PASS m.
// The sanctuary rule holds: their beats and posts are far outside it, and they never see or shoot into it.

import { ZONE2, highwayX, inSanctuary } from '../gen/layout.ts';
import { TOWER_POSTS } from '../gen/zone2.ts';
import { makeCreature, FACTION_KINDS, type Creature, type Kind } from './creatures.ts';
import type { OutpostState } from './outpost.ts';

/** With the armband, a man takes you for one of his own beyond this distance (m). */
export const PASS = 14;
/** The faction's men are about while the player is this near their beat. */
export const FACTION_NEAR = 150;
/** They go back inside once the player is this far from their beat. */
export const FACTION_FAR = 210;

export interface FactionState extends OutpostState {
  /** Which men are down until dawn (bits of each squad). */
  down: number;
  /** Has a man seen through the armband (or been shot at) this visit? Then it hides nothing. */
  blown: boolean;
}

export function newFaction(): FactionState { return { left: 0, alert: false, down: 0, blown: false }; }

interface Squad { bit: number; kind: Kind; anchor: [number, number]; route?: [number, number][]; start?: number; post?: { x: number; y: number; z: number; yaw: number } }

const Z = ZONE2;
const hx = (z: number) => highwayX(z);
/** The highway beat, there and back, on the east lane: from just inside the border to before the gate. */
const highwayBeat: [number, number][] = [];
for (let z = Z.border.z - 6; z >= Z.highway.z1 + 14; z -= 12) highwayBeat.push([hx(z) + 1.5, z]);
for (let k = highwayBeat.length - 2; k > 0; k--) highwayBeat.push([highwayBeat[k][0] - 3, highwayBeat[k][1]]);
/** The sentry's beat: round the parking lot and the exchange's front. */
const ruinsBeat: [number, number][] = [[Z.lot.x1 - 2, Z.lot.z1 - 2], [Z.lot.x1 - 2, Z.lot.z0 + 11], [Z.exchange.x1 + 3, Z.lot.z0 + 8], [Z.exchange.x1 + 3, Z.lot.z1 - 2]]; // clear of the van's ring

export const SQUADS: Squad[] = [
  { bit: 1, kind: 'patrol', anchor: [hx(680), 680], route: highwayBeat, start: 0 },
  { bit: 2, kind: 'patrol', anchor: [hx(680), 680], route: highwayBeat, start: 1 },
  { bit: 4, kind: 'sentry', anchor: [(Z.lot.x0 + Z.exchange.x1) / 2, (Z.lot.z0 + Z.lot.z1) / 2], route: ruinsBeat, start: 0 },
  { bit: 8, kind: 'guard', anchor: [TOWER_POSTS[0].x, TOWER_POSTS[0].z], post: TOWER_POSTS[0] },
  { bit: 16, kind: 'guard', anchor: [TOWER_POSTS[1].x, TOWER_POSTS[1].z], post: TOWER_POSTS[1] },
];
export const ALL_SQUADS = SQUADS.reduce((n, s) => n | s.bit, 0);

/** The men who should be about and aren't: each on his beat or post, if the land there is loaded. */
export function manFaction(creatures: Creature[], st: FactionState, px: number, pz: number, loaded: (x: number, z: number) => boolean, ground: (x: number, z: number) => number | null): Creature[] {
  const made: Creature[] = [];
  for (const q of SQUADS) {
    if (st.down & q.bit || creatures.some((c) => c.squad === q.bit)) continue;
    if (Math.hypot(px - q.anchor[0], pz - q.anchor[1]) > FACTION_NEAR) continue;
    let at: { x: number; y: number; z: number; yaw: number };
    if (q.route) {
      // On his beat, at the point farthest from the player that is loaded: nobody appears in plain sight.
      let best = -1, bestD = -1;
      q.route.forEach(([x, z], i) => { const d = Math.hypot(x - px, z - pz); if (loaded(x, z) && d > bestD && (i % 2) === (q.start ?? 0) % 2) { bestD = d; best = i; } });
      if (best < 0) continue;
      const [x, z] = q.route[best];
      const y = ground(x, z);
      if (y === null) continue;
      at = { x, y, z, yaw: 0 };
    } else {
      if (!loaded(q.post!.x, q.post!.z)) continue;
      at = { ...q.post! };
    }
    if (inSanctuary(at.x, at.z)) continue;
    const c = makeCreature(q.kind, at.x, at.y, at.z);
    c.squad = q.bit;
    c.yaw = at.yaw;
    c.mind = st.alert ? 'alerted' : 'watch';
    if (q.route) { c.route = q.route; c.leg = (q.route.findIndex(([x, z]) => x === at.x && z === at.z) + 1) % q.route.length; }
    else c.post = { ...q.post! };
    made.push(c);
  }
  return made;
}

/** The men far from the player go back inside (not killed: they come out again when the player returns). */
export function standDown(creatures: Creature[], st: FactionState, px: number, pz: number): Creature[] {
  const keep = creatures.filter((c) => {
    if (!FACTION_KINDS.has(c.kind)) return true;
    const q = SQUADS.find((s) => s.bit === c.squad);
    return !q || Math.hypot(px - q.anchor[0], pz - q.anchor[1]) < FACTION_FAR;
  });
  if (!keep.some((c) => FACTION_KINDS.has(c.kind))) { st.alert = false; st.blown = false; }
  return keep;
}

/** A new day: the men killed come back. */
export function factionDawn(st: FactionState): void { st.down = 0; }
