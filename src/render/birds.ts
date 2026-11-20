// The valley's birds (docs/PHASE9A.md, 6; the script: "hummingbirds, doves … and the rare quetzal on one tree every
// few days"). They are scenery, not creatures: they have no health, cannot be hit, hunt nothing and are hunted by
// nothing; they live only in the valley's bowl, by day, near the player, and are not saved.
//
// - Hummingbirds work the flowers nearest the player (orchids, bromeliads, the garden's crops and the coffee): hover
//   at one, dart to the next, and are gone if you reach for them.
// - Doves walk and peck on the valley floor in a loose group, and burst up and away when you come close (sooner if
//   you run), to settle again further off.
// - The quetzal sits on one tree, some mornings (the first morning, then every third), calls now and then, and
//   leaves if you come under its tree; it is back another day.
//
// Cheap by design: at most a dozen birds, each a few boxes, one draw call a kind; no minds, no paths, a handful of
// block look-ups a frame. `Flock` is the whole of what they do (plain arithmetic, tested without a graphics card);
// `Birds` draws it.

import * as THREE from 'three';
import { Shape } from './hand.ts';
import { SKY_COLOR_GLSL, type SkyState } from './sky.ts';
import { BLOCK_DEFS, B_SOLID, isWaterId } from '../world/blocks.ts';
import { VALLEY, inValleyBowl, valleyFloorHeight } from '../gen/layout.ts';

export type BirdKind = 'hummingbird' | 'dove' | 'quetzal';
export const BIRD_KINDS: BirdKind[] = ['hummingbird', 'dove', 'quetzal'];

export interface Bird {
  kind: BirdKind;
  x: number; y: number; z: number;
  /** Heading (0 looks north, as the player's), nose up or down, and the wings' angle (0 level, + raised, FOLDED at rest). */
  yaw: number; pitch: number; flap: number;
  mode: 'hover' | 'dart' | 'peck' | 'fly' | 'perch' | 'leave';
  /** Seconds left in this mode, where it has an end. */
  t: number;
  /** Where it is going, or (hovering, pecking, perched) where it keeps to. */
  tx: number; ty: number; tz: number;
  /** Its own number, so no two move in step. */
  seed: number;
}

export const FOLDED = -1.5;
/** A bird of this kind is never nearer the eye than this while it can help it (it leaves first). */
export const SHY: Record<BirdKind, number> = { hummingbird: 1.4, dove: 5.5, quetzal: 9 };
const DAY: Record<BirdKind, [number, number]> = { hummingbird: [6.2, 17.8], dove: [5.6, 18.4], quetzal: [5.75, 10.5] };
const WANT: Record<BirdKind, number> = { hummingbird: 3, dove: 4, quetzal: 1 };

/** Is this a morning the quetzal comes? The first morning of a valley (day 1 follows the first night), then every third. */
export function quetzalDay(day: number): boolean { return day % 3 === 1; }

/** What a hummingbird feeds at. */
const FLOWER = new Uint8Array(BLOCK_DEFS.length);
BLOCK_DEFS.forEach((d, id) => { if (/^(orchid|bromeliad|coffee_bush_|crop_(beans|squash|tomato|pepper|herbs|apple)_[1-9])/.test(d.name)) FLOWER[id] = 1; });
/** What the quetzal's perch must still be (its tree may have been felled). */
const CROWN = new Uint8Array(BLOCK_DEFS.length);
BLOCK_DEFS.forEach((d, id) => { if (/^(leaves|leaves_pale|log)$/.test(d.name)) CROWN[id] = 1; });

export interface BirdFrame {
  /** The player's eye. */
  px: number; py: number; pz: number;
  hour: number; day: number; time: number;
  sprinting: boolean;
  blockAt: (x: number, y: number, z: number) => number;
  /** The trunk of the quetzal's tree (src/gen/terrain.ts, quetzalTree), or null. */
  tree: { x: number; z: number } | null;
}

export interface BirdEvent { kind: 'quetzal_call' | 'quetzal_seen' | 'flush'; x: number; y: number; z: number }

export class Flock {
  birds: Bird[] = [];
  /** Flowers found near the player: [x, y, z] of the block. */
  flowers: [number, number, number][] = [];
  /** The day the quetzal last flew off (it does not come back that morning). */
  private scared = -1;
  private nextCall = 0;
  private scan = 0;
  private rand: () => number;

  constructor(rand: () => number = Math.random) { this.rand = rand; }

  count(kind: BirdKind): number { let n = 0; for (const b of this.birds) if (b.kind === kind) n++; return n; }

  private add(kind: BirdKind, x: number, y: number, z: number, mode: Bird['mode']): Bird {
    const b: Bird = { kind, x, y, z, yaw: this.rand() * 6.283, pitch: 0, flap: FOLDED, mode, t: 0, tx: x, ty: y, tz: z, seed: this.rand() * 100 };
    this.birds.push(b);
    return b;
  }

  /** A place on the valley's floor a dove can stand: open grass or soil, not water, not under a roof of rock. */
  private ground(f: BirdFrame, near: number, far: number, fromX = f.px, fromZ = f.pz): [number, number, number] | null {
    for (let tries = 0; tries < 6; tries++) {
      const a = this.rand() * 6.283, r = near + this.rand() * (far - near);
      const x = fromX + Math.cos(a) * r, z = fromZ + Math.sin(a) * r;
      if (!inValleyBowl(x, z) || Math.hypot(x - VALLEY.cx, z - VALLEY.cz) > VALLEY.radius - 16) continue;
      if (Math.hypot(x - f.px, z - f.pz) < SHY.dove + 3) continue;
      const y = valleyFloorHeight(x, z), bx = Math.floor(x), bz = Math.floor(z);
      const under = f.blockAt(bx, y - 1, bz);
      if (!B_SOLID[under] || isWaterId(f.blockAt(bx, y, bz)) || B_SOLID[f.blockAt(bx, y, bz)] || B_SOLID[f.blockAt(bx, y + 1, bz)]) continue;
      return [x, y, z];
    }
    return null;
  }

  /** Looks at a few random blocks near the player for flowers, and forgets those left behind. */
  private findFlowers(dt: number, f: BirdFrame): void {
    this.flowers = this.flowers.filter(([x, y, z]) => Math.hypot(x - f.px, z - f.pz) < 34 && FLOWER[f.blockAt(x, y, z)]);
    this.scan += dt * 14;
    while (this.scan >= 1 && this.flowers.length < 14) {
      this.scan--;
      const a = this.rand() * 6.283, r = 3 + this.rand() * 24;
      const x = Math.floor(f.px + Math.cos(a) * r), z = Math.floor(f.pz + Math.sin(a) * r);
      if (!inValleyBowl(x, z)) continue;
      const g = valleyFloorHeight(x, z);
      for (let y = g; y < g + 14; y++) {
        if (!FLOWER[f.blockAt(x, y, z)]) continue;
        if (!this.flowers.some((q) => q[0] === x && q[1] === y && q[2] === z)) this.flowers.push([x, y, z]);
        break;
      }
    }
    if (this.scan > 4) this.scan = 4;
  }

  /**
   * Where the quetzal sits: on the very top of its tree's crown, clear of anything that grows there (a bromeliad
   * may), so it shows against the sky from all round; null if the tree is not there (or not loaded).
   */
  perch(f: BirdFrame): [number, number, number] | null {
    if (!f.tree) return null;
    let best: [number, number, number] | null = null;
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const x = f.tree.x + dx, z = f.tree.z + dz;
      const g = valleyFloorHeight(x, z);
      for (let y = g + 26; y > g + 3; y--) {
        const id = f.blockAt(x, y, z);
        if (!id) continue;
        // The highest wins; of equals, the one nearest the trunk.
        if (CROWN[id] && (!best || y + 1 > best[1] || (y + 1 === best[1] && Math.hypot(dx, dz) < Math.hypot(best[0] - 0.5 - f.tree.x, best[2] - 0.5 - f.tree.z)))) best = [x + 0.5, y + 1, z + 0.5];
        break; // (something else standing on the crown here: not this column)
      }
    }
    return best;
  }

  /** One frame. Returns what happened that the game may want to answer (a call to play, a first sighting). */
  update(dt: number, f: BirdFrame, lively: boolean): BirdEvent[] {
    const events: BirdEvent[] = [];
    const inValley = inValleyBowl(f.px, f.pz) && f.py > VALLEY.floor - 4;
    const on = (k: BirdKind) => lively && inValley && f.hour >= DAY[k][0] && f.hour < DAY[k][1];
    if (on('hummingbird')) this.findFlowers(dt, f);

    // Who should be here now, and who should go.
    if (on('hummingbird') && this.flowers.length && this.count('hummingbird') < Math.min(WANT.hummingbird, this.flowers.length)) {
      const fl = this.flowers[Math.floor(this.rand() * this.flowers.length)];
      const b = this.add('hummingbird', fl[0] + 0.5 + (this.rand() - 0.5) * 14, fl[1] + 6 + this.rand() * 5, fl[2] + 0.5 + (this.rand() - 0.5) * 14, 'dart');
      this.feedAt(b, fl);
    }
    if (on('dove') && this.count('dove') < WANT.dove) {
      const others = this.birds.filter((b) => b.kind === 'dove' && b.mode === 'peck');
      // Near another dove if there is one: they keep company.
      const at = others.length ? this.ground(f, 1, 5, others[0].x, others[0].z) : this.ground(f, 14, 30);
      if (at) { const b = this.add('dove', at[0], at[1], at[2], 'peck'); b.t = 1 + this.rand() * 2; }
    }
    if (on('quetzal') && quetzalDay(f.day) && this.scared !== f.day && !this.count('quetzal')) {
      const p = this.perch(f);
      if (p && Math.hypot(p[0] - f.px, p[1] - f.py, p[2] - f.pz) > SHY.quetzal + 6) {
        const b = this.add('quetzal', p[0], p[1], p[2], 'perch');
        b.yaw = Math.atan2(-(VALLEY.cx - p[0]), -(VALLEY.cz - p[2])); // looking out over the valley
        this.nextCall = f.time + 3;
      }
    }

    for (let i = this.birds.length - 1; i >= 0; i--) {
      const b = this.birds[i];
      const dist = Math.hypot(b.x - f.px, b.y - f.py, b.z - f.pz);
      if (!on(b.kind) && b.mode !== 'leave') this.leave(b);
      if (b.kind === 'hummingbird') this.hummingbird(b, dt, f, dist);
      else if (b.kind === 'dove') { if (this.dove(b, dt, f, dist)) events.push({ kind: 'flush', x: b.x, y: b.y, z: b.z }); }
      else this.quetzal(b, dt, f, dist, events);
      if (b.mode === 'leave') {
        this.flyTo(b, dt, 9, f.time);
        b.t -= dt;
        if (b.t <= 0 || dist > 90) this.birds.splice(i, 1);
      } else if (dist > 70) this.birds.splice(i, 1);
    }
    return events;
  }

  /** Up and away, over the rim; then it is gone. */
  private leave(b: Bird): void {
    const a = Math.atan2(b.z - VALLEY.cz, b.x - VALLEY.cx) + (this.rand() - 0.5);
    b.mode = 'leave'; b.t = 7;
    b.tx = b.x + Math.cos(a) * 60; b.ty = b.y + 30; b.tz = b.z + Math.sin(a) * 60;
  }

  /** Moves a flying bird toward its target; true when it is there. Its wings beat, its nose follows its way. */
  private flyTo(b: Bird, dt: number, speed: number, time: number): boolean {
    const dx = b.tx - b.x, dy = b.ty - b.y, dz = b.tz - b.z, d = Math.hypot(dx, dy, dz);
    const step = speed * dt;
    if (d <= step || d < 0.02) { b.x = b.tx; b.y = b.ty; b.z = b.tz; return true; }
    b.x += (dx / d) * step; b.y += (dy / d) * step; b.z += (dz / d) * step;
    b.yaw = Math.atan2(-dx, -dz);
    b.pitch = Math.max(-0.7, Math.min(0.7, Math.asin(dy / d))) * 0.6;
    b.flap = b.kind === 'hummingbird' ? Math.sin(time * 90 + b.seed) * 1.2 : Math.sin(time * (b.kind === 'dove' ? 50 : 26) + b.seed) * 0.95;
    return false;
  }

  private feedAt(b: Bird, fl: [number, number, number]): void {
    // Beside the flower, on a side of its own, bill toward it.
    const a = this.rand() * 6.283;
    b.tx = fl[0] + 0.5 + Math.cos(a) * 0.42; b.ty = fl[1] + 0.55; b.tz = fl[2] + 0.5 + Math.sin(a) * 0.42;
    b.mode = 'dart';
  }

  private hummingbird(b: Bird, dt: number, f: BirdFrame, dist: number): void {
    if (b.mode === 'leave') return;
    // Reached for: it is two metres off before the hand closes.
    if (dist < SHY.hummingbird && b.mode === 'hover') {
      const far = this.flowers.filter((q) => Math.hypot(q[0] - f.px, q[2] - f.pz) > 4);
      if (far.length) this.feedAt(b, far[Math.floor(this.rand() * far.length)]);
      else { b.tx = b.x + (b.x - f.px) * 3; b.ty = b.y + 2; b.tz = b.z + (b.z - f.pz) * 3; b.mode = 'dart'; }
    }
    if (b.mode === 'dart') {
      if (this.flyTo(b, dt, 9, f.time)) { b.mode = 'hover'; b.t = 1.4 + this.rand() * 2.8; }
      return;
    }
    // Hovering: still but for a tremble, wings a blur, bill to the flower (the middle of the block it keeps beside).
    b.t -= dt;
    b.flap = Math.sin(f.time * 90 + b.seed) * 1.2;
    b.pitch = 0.15;
    b.y = b.ty + Math.sin(f.time * 5 + b.seed) * 0.025;
    const fx = Math.floor(b.tx) + 0.5, fz = Math.floor(b.tz) + 0.5;
    if (Math.hypot(fx - b.tx, fz - b.tz) > 0.1) b.yaw = Math.atan2(-(fx - b.tx), -(fz - b.tz));
    if (b.t <= 0) {
      if (this.flowers.length) this.feedAt(b, this.flowers[Math.floor(this.rand() * this.flowers.length)]);
      else this.leave(b);
    }
  }

  /** True the moment it takes fright. */
  private dove(b: Bird, dt: number, f: BirdFrame, dist: number): boolean {
    if (b.mode === 'leave') return false;
    if (b.mode === 'fly') {
      // Up in an arc and down again: the height is over the straight line between take-off and landing.
      if (this.flyTo(b, dt, 8, f.time)) { b.mode = 'peck'; b.flap = FOLDED; b.pitch = 0; b.t = 1 + this.rand() * 2; }
      else { const left = Math.hypot(b.tx - b.x, b.tz - b.z); b.y += Math.min(4, left * 0.5) * dt * 1.6; }
      return false;
    }
    if (dist < (f.sprinting ? SHY.dove + 4 : SHY.dove)) {
      const to = this.ground(f, 22, 42);
      b.mode = 'fly';
      if (to) { b.tx = to[0]; b.ty = to[1]; b.tz = to[2]; }
      else this.leave(b);
      return true;
    }
    // On the ground: a few quick steps, a peck, a look about.
    b.flap = FOLDED;
    b.t -= dt;
    b.pitch = b.t < 0.5 ? -0.7 * Math.sin((0.5 - b.t) * 2 * Math.PI) ** 2 : 0; // the peck, at the end of each wait
    const dx = b.tx - b.x, dz = b.tz - b.z, d = Math.hypot(dx, dz);
    if (d > 0.03) { const s = Math.min(d, 0.5 * dt); b.x += (dx / d) * s; b.z += (dz / d) * s; b.yaw = Math.atan2(-dx, -dz); }
    if (b.t <= 0) {
      b.t = 1.2 + this.rand() * 2.6;
      const a = this.rand() * 6.283, r = 0.3 + this.rand() * 0.8;
      const nx = b.x + Math.cos(a) * r, nz = b.z + Math.sin(a) * r;
      // Only where the floor is level with where it stands, and open.
      if (valleyFloorHeight(nx, nz) === Math.round(b.y) && !B_SOLID[f.blockAt(Math.floor(nx), Math.round(b.y), Math.floor(nz))]) { b.tx = nx; b.tz = nz; }
    }
    return false;
  }

  private quetzal(b: Bird, dt: number, f: BirdFrame, dist: number, events: BirdEvent[]): void {
    if (b.mode === 'leave') return;
    b.flap = FOLDED;
    b.pitch = Math.sin(f.time * 0.7 + b.seed) > 0.96 ? 0.12 : 0; // now and then it bobs
    const p = this.perch(f);
    if (dist < SHY.quetzal || !p) { this.scared = f.day; this.leave(b); return; }
    if (dist < 48 && f.time >= this.nextCall) {
      this.nextCall = f.time + 7 + this.rand() * 6;
      events.push({ kind: 'quetzal_call', x: b.x, y: b.y, z: b.z });
    }
    if (dist < 40) events.push({ kind: 'quetzal_seen', x: b.x, y: b.y, z: b.z });
  }
}

// ---- Shapes -----------------------------------------------------------------------------------

/** A bird as coloured boxes, in metres, its nose toward −z; `wing` marks a box as the left (−1) or right (+1) wing. */
interface BirdModel { body: Shape; left: Shape; right: Shape; /** Where the wings hinge: half the body's width, and the height. */ hinge: [number, number] }

function model(kind: BirdKind): BirdModel {
  const body = new Shape(), left = new Shape(), right = new Shape();
  const wings = (x: number, y: number, z0: number, z1: number, span: number, thick: number, c: string, tip: string) => {
    left.box(-x - span, y - thick, z0, -x, y, z1, c).box(-x - span, y - thick, z0 + (z1 - z0) * 0.55, -x - span * 0.6, y + 0.001, z1, tip);
    right.box(x, y - thick, z0, x + span, y, z1, c).box(x + span * 0.6, y - thick, z0 + (z1 - z0) * 0.55, x + span, y + 0.001, z1, tip);
  };
  if (kind === 'hummingbird') {
    // Drawn half as big again as life (a real one is 9 cm): a jewel must be seen to be one.
    body.box(-0.022, -0.02, -0.04, 0.022, 0.022, 0.045, '#1fa56a').box(-0.02, -0.022, -0.035, 0.02, -0.005, 0.04, '#d9eee2'); // back, belly
    body.box(-0.018, 0.012, -0.075, 0.018, 0.045, -0.04, '#16905c').box(-0.016, 0.006, -0.072, 0.016, 0.02, -0.045, '#c8307a'); // head, throat
    body.box(-0.004, 0.022, -0.135, 0.004, 0.03, -0.075, '#16181a'); // the bill
    body.box(-0.014, -0.006, 0.045, 0.014, 0.004, 0.09, '#0f6e48'); // the tail
    wings(0.022, 0.018, -0.03, 0.02, 0.085, 0.004, '#b8c4c0', '#8e9a98');
    return { body, left, right, hinge: [0.022, 0.016] };
  }
  if (kind === 'dove') {
    body.box(-0.05, 0.03, -0.09, 0.05, 0.13, 0.1, '#b39c88').box(-0.045, 0.028, -0.085, 0.045, 0.06, 0.09, '#c9b5a2'); // body, paler beneath
    body.box(-0.032, 0.11, -0.15, 0.032, 0.18, -0.085, '#b8a491'); // head
    body.box(-0.008, 0.135, -0.18, 0.008, 0.15, -0.15, '#3a3230').box(-0.034, 0.15, -0.13, -0.03, 0.16, -0.12, '#1a1a1a').box(0.03, 0.15, -0.13, 0.034, 0.16, -0.12, '#1a1a1a'); // bill, eyes
    body.box(-0.03, 0.07, 0.1, 0.03, 0.095, 0.22, '#8f7b69').box(-0.03, 0.068, 0.2, 0.03, 0.072, 0.225, '#efe8dc'); // tail, its white tip
    body.box(-0.022, 0, -0.01, -0.012, 0.03, 0, '#b05a5a').box(0.012, 0, -0.01, 0.022, 0.03, 0, '#b05a5a'); // legs
    wings(0.05, 0.125, -0.07, 0.1, 0.17, 0.012, '#9c8876', '#5e5048');
    return { body, left, right, hinge: [0.05, 0.12] };
  }
  // The quetzal, perched upright: emerald, a red breast, a small crest, and two tail plumes as long again as the bird.
  body.box(-0.055, 0.02, -0.05, 0.055, 0.23, 0.06, '#12a362').box(-0.05, 0.02, -0.058, 0.05, 0.14, -0.045, '#c9222c'); // body, breast
  body.box(-0.045, 0.21, -0.075, 0.045, 0.3, 0.02, '#17b06c').box(-0.03, 0.3, -0.06, 0.03, 0.325, 0.0, '#2cc47c'); // head, crest
  body.box(-0.012, 0.24, -0.105, 0.012, 0.262, -0.075, '#e8c93a').box(-0.047, 0.262, -0.055, -0.043, 0.276, -0.04, '#101010').box(0.043, 0.262, -0.055, 0.047, 0.276, -0.04, '#101010'); // bill, eyes
  body.box(-0.04, -0.06, 0.03, 0.04, 0.03, 0.07, '#f0ede4'); // white under the tail
  body.box(-0.03, -0.62, 0.05, -0.008, 0.03, 0.075, '#0f9a7a').box(0.008, -0.7, 0.05, 0.03, 0.03, 0.075, '#12a888'); // the plumes
  wings(0.055, 0.2, -0.04, 0.06, 0.16, 0.014, '#0e8e56', '#1a1f1c');
  return { body, left, right, hinge: [0.055, 0.195] };
}

const VERT = /* glsl */ `
in vec3 aColor;
in float aWing;
in vec3 iPos;
in vec3 iPose; // heading, nose up, wings' angle
in vec3 iLight;
uniform vec2 uHinge;
out vec3 vColor;
out vec3 vWorld;
out float vDist;
void main() {
  vec3 p = position;
  if (aWing != 0.0) {
    vec2 h = vec2(aWing * uHinge.x, uHinge.y), q = p.xy - h;
    if (iPose.z < -1.4) {
      // Folded: the wing lies flat along the body's side, its tip at the tail.
      p.x = h.x + q.x * 0.1;
      p.y = h.y - abs(q.x) * 0.35 + q.y;
    } else {
      // Open: it turns about its root, along the body.
      float a = iPose.z * aWing;
      p.xy = h + vec2(q.x * cos(a) - q.y * sin(a), q.x * sin(a) + q.y * cos(a));
    }
  }
  float cp = cos(iPose.y), sp = sin(iPose.y), cy = cos(iPose.x), sy = sin(iPose.x);
  p = vec3(p.x, p.y * cp - p.z * sp, p.y * sp + p.z * cp);
  p = vec3(p.x * cy + p.z * sy, p.y, -p.x * sy + p.z * cy);
  vec4 world = vec4(p + iPos, 1.0);
  vWorld = world.xyz;
  vec4 view = viewMatrix * world;
  vDist = length(view.xyz);
  vColor = aColor / 255.0 * iLight;
  gl_Position = projectionMatrix * view;
}`;

const FRAG = /* glsl */ `
precision highp float;
in vec3 vColor;
in vec3 vWorld;
in float vDist;
uniform float uFogNear, uFogFar;
out vec4 outColor;
${SKY_COLOR_GLSL}
void main() {
  float fog = smoothstep(uFogNear, uFogFar, vDist);
  outColor = vec4(mix(vColor, skyColor(normalize(vWorld - cameraPosition)), fog), 1.0);
}`;

const MAX_EACH = 8;

export class Birds {
  readonly flock = new Flock();
  readonly meshes: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>[] = [];
  private pos: Float32Array[] = [];
  private pose: Float32Array[] = [];
  private light: Float32Array[] = [];

  constructor() {
    for (const kind of BIRD_KINDS) {
      const m = model(kind);
      const g = new THREE.InstancedBufferGeometry();
      const parts: [Shape, number][] = [[m.body, 0], [m.left, -1], [m.right, 1]];
      const n = parts.reduce((s, [p]) => s + p.quads, 0);
      const position = new Float32Array(n * 12), colour = new Uint8Array(n * 12), wing = new Float32Array(n * 4), index = new Uint16Array(n * 6);
      let v = 0;
      for (const [p, w] of parts) {
        position.set(p.pos, v * 3);
        colour.set(p.col.map((c) => Math.min(255, Math.round(c))), v * 3);
        wing.fill(w, v, v + p.quads * 4);
        v += p.quads * 4;
      }
      for (let q = 0, i = 0, k = 0; q < n; q++, k += 4) { index[i++] = k; index[i++] = k + 1; index[i++] = k + 2; index[i++] = k; index[i++] = k + 2; index[i++] = k + 3; }
      g.setAttribute('position', new THREE.BufferAttribute(position, 3));
      g.setAttribute('aColor', new THREE.BufferAttribute(colour, 3));
      g.setAttribute('aWing', new THREE.BufferAttribute(wing, 1));
      g.setIndex(new THREE.BufferAttribute(index, 1));
      const pos = new Float32Array(MAX_EACH * 3), pose = new Float32Array(MAX_EACH * 3), light = new Float32Array(MAX_EACH * 3);
      g.setAttribute('iPos', new THREE.InstancedBufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('iPose', new THREE.InstancedBufferAttribute(pose, 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('iLight', new THREE.InstancedBufferAttribute(light, 3).setUsage(THREE.DynamicDrawUsage));
      g.instanceCount = 0;
      const mat = new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide,
        uniforms: {
          uHinge: { value: new THREE.Vector2(m.hinge[0], m.hinge[1]) }, uFogNear: { value: 150 }, uFogFar: { value: 1350 },
          uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uSunGlow: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        },
      });
      const mesh = new THREE.Mesh(g, mat);
      mesh.frustumCulled = false;
      mesh.visible = false;
      this.meshes.push(mesh);
      this.pos.push(pos); this.pose.push(pose); this.light.push(light);
    }
  }

  /** Copies the flock into the meshes. `lightAt` gives the light on a bird where it is (a colour, 0–1). */
  draw(lightAt: (x: number, y: number, z: number, out: THREE.Color) => THREE.Color): void {
    const c = new THREE.Color();
    BIRD_KINDS.forEach((kind, k) => {
      let n = 0;
      for (const b of this.flock.birds) {
        if (b.kind !== kind || n >= MAX_EACH) continue;
        this.pos[k].set([b.x, b.y, b.z], n * 3);
        this.pose[k].set([b.yaw, b.pitch, b.flap], n * 3);
        lightAt(b.x, b.y + 0.1, b.z, c);
        this.light[k].set([c.r, c.g, c.b], n * 3);
        n++;
      }
      const g = this.meshes[k].geometry;
      g.instanceCount = n;
      this.meshes[k].visible = n > 0;
      if (n) for (const name of ['iPos', 'iPose', 'iLight']) (g.getAttribute(name) as THREE.InstancedBufferAttribute).needsUpdate = true;
    });
  }

  sync(s: SkyState, fogNear: number, fogFar: number): void {
    for (const m of this.meshes) {
      const u = m.material.uniforms;
      u.uFogNear.value = fogNear; u.uFogFar.value = fogFar;
      u.uZenith.value.copy(s.zenith); u.uHorizon.value.copy(s.horizon); u.uSunGlow.value.copy(s.sunGlow); u.uSunDir.value.copy(s.sunDir);
    }
  }
}
