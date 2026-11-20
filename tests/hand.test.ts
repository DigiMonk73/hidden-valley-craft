import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { heldShape, armShape, handPose, strike, REST, HandView, type Grip, type HandFrame } from '../src/render/hand.ts';
import { ITEM_COUNT, itemId, itemName } from '../src/world/items.ts';
import { BLOCK_COUNT, B_RENDER, RENDER } from '../src/world/blocks.ts';

// Phase 9A, 1: the arm and what the hand holds. The shapes and poses are plain data, so they are checked here;
// how they look is judged in pictures (tools/handroom.mjs, tools/shots9a.mjs hand).

describe('what the hand holds', () => {
  it('every item and every block that can be carried has a shape of a sane size', () => {
    for (let id = 1; id < ITEM_COUNT; id++) {
      if (id < BLOCK_COUNT && (B_RENDER[id] === RENDER.none || B_RENDER[id] === RENDER.liquid)) continue;
      const h = heldShape(id);
      expect(h.shape.quads, itemName(id)).toBeGreaterThan(0);
      expect(h.shape.quads, itemName(id)).toBeLessThan(9000);
      expect(h.shape.pos.length, itemName(id)).toBe(h.shape.col.length);
      const b = h.shape.bounds().map((v) => v * h.scale);
      // Nothing held is longer than a rod or wider than a block: it must fit in front of the camera.
      for (let a = 0; a < 3; a++) expect(b[a + 3] - b[a], `${itemName(id)} axis ${a}`).toBeLessThan(1.3);
      expect(h.grip).not.toBe('none');
    }
  });

  it('tools and weapons are their own models, held as what they are', () => {
    const grips: Record<string, Grip> = {
      steel_pickaxe: 'tool', stone_pickaxe: 'tool', iron_pickaxe: 'tool', steel_axe: 'tool', steel_shovel: 'tool', steel_hoe: 'tool', machete: 'tool',
      hunting_knife: 'tool', hammer: 'tool', handsaw: 'tool', spear: 'tool', fishing_rod: 'rod',
      hunting_rifle: 'long', raider_rifle: 'long', rifle_rebuilt: 'long', pistol: 'pistol', pistol_suppressed: 'pistol', compound_bow: 'bow', hunting_bow: 'bow',
      limestone: 'block', planks: 'block', canned_food: 'flat', fern: 'flat',
    };
    for (const [name, grip] of Object.entries(grips)) expect(heldShape(itemId(name)).grip, name).toBe(grip);
    // The three rifles and the two pistols are told apart.
    const quads = (n: string) => heldShape(itemId(n)).shape.quads;
    expect(new Set([quads('hunting_rifle'), quads('raider_rifle'), quads('rifle_rebuilt')]).size).toBeGreaterThan(1);
    expect(quads('pistol_suppressed')).toBeGreaterThan(quads('pistol'));
  });

  it('an empty hand holds nothing, and the arm is there', () => {
    expect(heldShape(0).shape.quads).toBe(0);
    expect(heldShape(undefined).grip).toBe('none');
    expect(armShape(false).quads).toBeGreaterThan(20);
    expect(armShape(true).quads).toBeGreaterThan(20);
  });

  it('a cut-out block leaves its gaps open', () => {
    // Leaves have see-through texels: fewer quads than a whole cube's 6 × 256.
    expect(heldShape(itemId('leaves')).shape.quads).toBeLessThan(6 * 256);
    expect(heldShape(itemId('limestone')).shape.quads).toBe(6 * 256);
  });
});

describe('the hand\'s poses', () => {
  const GRIPS: Grip[] = ['none', 'tool', 'long', 'pistol', 'bow', 'rod', 'block', 'flat'];
  it('a swing starts and ends at rest, and strikes in between', () => {
    expect(strike(0)).toBe(0);
    expect(strike(1)).toBe(0);
    expect(strike(0.38)).toBeCloseTo(1, 5);
    for (let s = 0; s <= 1; s += 0.05) { expect(strike(s)).toBeGreaterThanOrEqual(0); expect(strike(s)).toBeLessThanOrEqual(1); }
    for (const grip of GRIPS) {
      const rest = handPose({ ...REST, grip }), mid = handPose({ ...REST, grip, swing: 0.38 });
      expect(handPose({ ...REST, grip, swing: 0 })).toEqual(rest);
      expect(mid.arm, grip).not.toEqual(rest.arm);
    }
  });

  it('every pose is a finite place in front of the camera', () => {
    for (const grip of GRIPS) for (const swing of [0, 0.2, 0.38, 0.8]) for (const aim of [0, 0.5, 1]) for (const recoil of [0, 1]) {
      const p = handPose({ ...REST, grip, swing, aim, recoil, draw: aim, step: 1.3, stride: 1, swayX: 0.03, swayY: -0.03 });
      for (const v of [...Object.values(p.arm), ...Object.values(p.item)]) expect(Number.isFinite(v)).toBe(true);
      expect(p.arm.z).toBeLessThan(-0.15); // never behind the eye
    }
  });

  it('a weapon raised to the eye comes toward the middle; a lowered hand is out of sight', () => {
    for (const grip of ['long', 'pistol', 'bow'] as Grip[]) {
      const hip = handPose({ ...REST, grip }).arm, up = handPose({ ...REST, grip, aim: 1 }).arm;
      expect(Math.abs(up.x), grip).toBeLessThan(Math.abs(hip.x));
      expect(up.y, grip).toBeGreaterThan(hip.y);
    }
    for (const grip of GRIPS) expect(handPose({ ...REST, grip, raised: 0 }).arm.y).toBeLessThan(-0.55);
  });
});

describe('the hand in play', () => {
  const frame = (over: Partial<HandFrame> = {}): HandFrame => ({ held: itemId('steel_pickaxe'), show: true, mining: false, aiming: false, draw: 0, walked: 0, turnX: 0, turnY: 0, light: new THREE.Color(1, 1, 1), ...over });
  const run = (v: HandView, f: HandFrame, seconds: number) => { for (let t = 0; t < seconds; t += 1 / 60) v.update(1 / 60, f); };

  it('changing what is held lowers the hand, changes it, and raises it again', () => {
    const v = new HandView();
    run(v, frame(), 1);
    expect(v.state.raised).toBe(1);
    expect(v.state.grip).toBe('tool');
    v.update(1 / 60, frame({ held: itemId('hunting_rifle') }));
    expect(v.state.raised).toBeLessThan(1);
    expect(v.state.grip).toBe('tool'); // still the pickaxe, going down
    run(v, frame({ held: itemId('hunting_rifle') }), 1);
    expect(v.state.grip).toBe('long');
    expect(v.state.raised).toBe(1);
    run(v, frame({ held: undefined }), 1);
    expect(v.state.grip).toBe('none');
  });

  it('mining swings again and again; one click swings once', () => {
    const v = new HandView();
    run(v, frame(), 1);
    let swings = 0, was = 0;
    for (let t = 0; t < 2; t += 1 / 60) { v.update(1 / 60, frame({ mining: true })); if (v.state.swing < was) swings++; was = v.state.swing; }
    expect(swings).toBeGreaterThanOrEqual(4);
    run(v, frame(), 1);
    expect(v.state.swing).toBe(0);
    v.swing();
    let moved = false;
    for (let t = 0; t < 1; t += 1 / 60) { v.update(1 / 60, frame()); if (v.state.swing > 0) moved = true; }
    expect(moved).toBe(true);
    expect(v.state.swing).toBe(0);
  });

  it('a shot kicks and the kick dies away; aiming comes up and goes down', () => {
    const v = new HandView();
    run(v, frame({ held: itemId('hunting_rifle') }), 1);
    v.kick();
    expect(v.state.recoil).toBe(1);
    run(v, frame({ held: itemId('hunting_rifle') }), 1);
    expect(v.state.recoil).toBe(0);
    run(v, frame({ held: itemId('hunting_rifle'), aiming: true }), 1);
    expect(v.state.aim).toBeGreaterThan(0.95);
    run(v, frame({ held: itemId('hunting_rifle') }), 1);
    expect(v.state.aim).toBeLessThan(0.05);
  });

  it('is not drawn when the game says so, and costs little when it is', () => {
    const v = new HandView();
    run(v, frame({ show: false }), 0.5);
    expect(v.quads).toBe(0);
    run(v, frame({ held: itemId('limestone') }), 1);
    expect(v.quads).toBeGreaterThan(0);
    expect(v.quads).toBeLessThan(6000); // a few thousand triangles: nothing beside a view of two million
  });
});

// The lead, publishing Phase 9A (2026-11-20): food, parts and plants were held upright as the pack picture given a
// thickness, which is another block game's look. They lie flat on the open palm.
describe('a held thing that is not a tool, a weapon or a block', () => {
  it('lies flat on the open palm, thin, not upright', () => {
    const held = heldShape(itemId('canned_food'));
    expect(held.grip).toBe('flat');
    const pose = handPose({ ...REST, grip: 'flat' });
    expect(Math.abs(pose.item.rx + Math.PI / 2)).toBeLessThan(1e-9); // the picture's plane turned to lie level
    // Thin: the shape's depth is a fraction of a pixel of its picture.
    const p = held.shape.pos;
    let zMin = Infinity, zMax = -Infinity;
    for (let i = 2; i < p.length; i += 3) { zMin = Math.min(zMin, p[i]); zMax = Math.max(zMax, p[i]); }
    expect(zMax - zMin).toBeLessThan(0.5);
  });
});
