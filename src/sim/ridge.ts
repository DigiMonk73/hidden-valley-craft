// The ridge's places as the player meets them (docs/PHASE8.md): which place a position is at, what is said the
// first time there, when Ray is at the refuge. Pure: the game asks once a second and shows what comes back.

import { ZONE4, ZONE3, PLACES, ridgeRoadAt, ridgeRoadMark, inFallout } from '../gen/layout.ts';

export type RidgePlace = 'bend' | 'gate' | 'edge' | 'pass' | 'sump' | 'dome' | 'yard';

/** The place of the ridge road a position is at, if any (the nearest of them when two are in reach). */
export function ridgePlaceAt(x: number, z: number): RidgePlace | null {
  const Z = ZONE4, T = PLACES.ridgeTower, r = ridgeRoadAt(x, z);
  if (Math.hypot(x - Z.clean.x, z - Z.clean.z) < Z.clean.r) return 'pass';
  if (x >= Z.yard.x0 - 4 && x < Z.yard.x1 + 4 && z >= Z.yard.z0 - 4 && z < Z.yard.z1 + 4) return 'yard';
  if (Math.hypot(x - T.x, z - T.z) < 24) return 'yard';
  if (Math.hypot(x - Z.observatory.x, z - Z.observatory.z) < 14) return 'dome';
  if (Math.hypot(x - Z.sump.x, z - Z.sump.z) < Z.sump.r + 8) return 'sump';
  if (Math.hypot(x - Z.gate.x, z - Z.gate.z) < 12) return 'gate';
  // The first stretch off the bend, in sight of the sign.
  if (r.dist < 5 && r.s < ridgeRoadMark(1) + 6 && z < ZONE3.dam.z - 3) return 'bend';
  if (inFallout(x, z)) return 'edge';
  return null;
}

/** What is said the first time at each place. `suited`: the player carries a hazard suit. */
export function ridgeToast(place: RidgePlace, suited: boolean): string {
  switch (place) {
    case 'bend': return 'The ridge road: TORRE · OBSERVATORIO. Its lamps are the dam’s own line to the relay tower, north along the water and up.';
    case 'gate': return suited
      ? 'The gate. Past the board the ground is poisoned. In the suit, keep to the lit road: asphalt sheds what the dead forest holds. The meter shows your dose the whole way.'
      : 'The gate. Past the board the ground is poisoned: without a suit the meter gives you seconds, and it is right. Ray knows this mountain. Call him from the cave.';
    case 'edge': return suited
      ? 'Zone 4 · danger 7: the ground itself. Stay on the lit road and watch the meter. At 100 it comes off your health.'
      : 'Zone 4 · danger 7: the ground itself. No suit: go back outside the signs, now.';
    case 'pass': return 'The pass. Inside the green boards the ground is clean: the meter stops. The refuge’s stove cooks, and its stores are yours.';
    case 'sump': return 'The sump: the hottest ground on the ridge. The tower is straight across it. The road goes round. Go round.';
    case 'dome': return 'The observatory. Its telescope’s optics come away with a pick: the pier inside, under the tube.';
    case 'yard': return 'The relay tower. The fallen dish’s panels are antenna sections; the station’s racks, through the lit door, hold rare components. Its west half is dark: leave it be.';
  }
}

/** Ray keeps the meeting by day: from six until six. */
export const RAY_FROM = 6, RAY_UNTIL = 18;

/** Is Ray at the refuge now? Once asked, by day, until he has been met. */
export function rayWaiting(flags: ReadonlySet<string>, hour: number): boolean {
  return flags.has('ray_coming') && !flags.has('ray_met') && hour >= RAY_FROM && hour < RAY_UNTIL;
}

/** Where Ray stands, and which way he looks (west, down the road he came up). */
export const RAY_SPOT = { x: ZONE4.ray.x, z: ZONE4.ray.z, yaw: Math.PI / 2 };

/**
 * What a call to Ray does next, after M4's part is over: his word on the ridge (once), then the meeting.
 * Returns which of his lines to say, and the flags to set.
 */
export function rayCall(flags: ReadonlySet<string>, hasSuit: boolean, wantMeeting: boolean): { line: 'ridge' | 'ridgeNotYet' | 'meetNoSuit' | 'meetDay' | 'meetWaiting' | 'afterLink' | null; sets: string[] } {
  if (!flags.has('uplink_plans')) return { line: null, sets: [] };
  // Each milestone waits for the one before (docs/FIXES.md, 6): his word on the ridge waits for M4.
  if (!flags.has('suit_word')) return flags.has('m4_done') ? { line: 'ridge', sets: ['suit_word'] } : { line: 'ridgeNotYet', sets: [] };
  if (wantMeeting && !flags.has('ray_met')) {
    if (flags.has('ray_coming')) return { line: 'meetWaiting', sets: [] };
    return hasSuit ? { line: 'meetDay', sets: ['ray_coming'] } : { line: 'meetNoSuit', sets: [] };
  }
  if (flags.has('uplink_live') && !flags.has('ray_told')) return { line: 'afterLink', sets: ['ray_told'] };
  return { line: null, sets: [] };
}

/** May the meeting be asked for? Once he has given his word, until it has happened. */
export function canAskMeeting(flags: ReadonlySet<string>): boolean {
  return flags.has('suit_word') && !flags.has('ray_met');
}
