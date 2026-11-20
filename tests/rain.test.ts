import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Rain, rainAt } from '../src/render/rain.ts';
import { skyAt } from '../src/render/sky.ts';
import { blockId, AIR } from '../src/world/blocks.ts';

// Phase 9A, 7: afternoon rain. When it rains is plain arithmetic; how it looks is judged in pictures.

describe('when it rains', () => {
  it('in the afternoon only: never before two, never after four, and it comes on and goes off by degrees', () => {
    for (let day = 0; day < 60; day++) {
      for (const hour of [0, 6, 9, 12, 13.9, 16.5, 18, 22]) expect(rainAt(day, hour), `day ${day} at ${hour}`).toBe(0);
      let was = 0;
      for (let h = 13.5; h < 16.5; h += 0.01) { const r = rainAt(day, h); expect(r).toBeGreaterThanOrEqual(0); expect(r).toBeLessThanOrEqual(1); expect(Math.abs(r - was)).toBeLessThan(0.12); was = r; }
    }
  });

  it('most afternoons but not all, and not on a valley\'s first two days', () => {
    const rainy = (day: number) => { for (let h = 14; h < 16; h += 0.05) if (rainAt(day, h) > 0.9) return true; return false; };
    expect(rainy(0)).toBe(false);
    expect(rainy(1)).toBe(false);
    const n = Array.from({ length: 50 }, (_, d) => d + 2).filter(rainy).length;
    expect(n).toBeGreaterThan(20);
    expect(n).toBeLessThan(40);
    // A shower lasts between fifty minutes and an hour and a half.
    for (let day = 2; day < 40; day++) {
      if (!rainy(day)) continue;
      let minutes = 0;
      for (let h = 13.5; h < 17; h += 1 / 60) if (rainAt(day, h) > 0) minutes++;
      expect(minutes).toBeGreaterThanOrEqual(48);
      expect(minutes).toBeLessThanOrEqual(95);
    }
  });
});

describe('the rain drawn', () => {
  const STONE = blockId('limestone');
  it('is not drawn when it is not raining, and is one draw call when it is', () => {
    const rain = new Rain(), eye = new THREE.Vector3(100.5, 80, 100.5);
    rain.update(0, eye, 0, () => AIR);
    expect(rain.mesh.visible).toBe(false);
    rain.update(0.7, eye, 0, () => AIR);
    expect(rain.mesh.visible).toBe(true);
    expect(rain.mesh.geometry.instanceCount).toBeLessThanOrEqual(1000);
    expect(rain.mesh.material.uniforms.uLevel.value).toBe(0.7);
  });

  it('knows what is overhead: the ground under open sky, the roof under a roof', () => {
    const rain = new Rain(), eye = new THREE.Vector3(100.5, 80, 100.5);
    // Ground at 70 everywhere; a roof at 84 over x < 100.
    const blockAt = (x: number, y: number, _z: number) => (y < 70 || (y === 84 && x < 100) ? STONE : AIR);
    for (let k = 0; k < 32; k++) rain.update(1, eye, k, blockAt); // one row a frame: the whole map in 32
    const roof = (rain.mesh.material.uniforms.uRoof.value as THREE.DataTexture).image.data as Uint8Array;
    const at = (x: number, z: number) => roof[(((z % 32) + 32) % 32) * 32 + (((x % 32) + 32) % 32)];
    expect(at(104, 100)).toBe(70); // open: rain falls to the ground
    expect(at(96, 100)).toBe(85); // roofed: it stops on the roof
    expect(at(96, 110)).toBe(85);
    expect(at(110, 90)).toBe(70);
  });

  it('greys the sky and brings the haze in, by how hard it rains; no rain changes nothing', () => {
    const rain = new Rain(), eye = new THREE.Vector3(0, 80, 0);
    const dry = skyAt(15), wet = skyAt(15);
    rain.update(0, eye, 0, () => AIR);
    expect(rain.weather(dry, 1350)).toBe(1350);
    expect(dry.zenith.equals(skyAt(15).zenith)).toBe(true);
    rain.update(1, eye, 0, () => AIR);
    const far = rain.weather(wet, 1350);
    expect(far).toBeLessThan(600);
    expect(far).toBeGreaterThan(300);
    const blue = (c: THREE.Color) => c.b - (c.r + c.g) / 2;
    expect(blue(wet.zenith)).toBeLessThan(blue(dry.zenith) * 0.5); // the blue is gone from the sky
    expect(wet.skyLight.r).toBeLessThan(dry.skyLight.r);
    expect(wet.daylight).toBe(dry.daylight); // the number the Ashen live by is not the weather's to change
    // And the day after is as blue as ever: the sky's own palette was not touched (it is handed out by reference).
    expect(skyAt(15).zenith.equals(dry.zenith)).toBe(true);
    expect(blue(skyAt(12).zenith)).toBeGreaterThan(0.3);
  });
});
