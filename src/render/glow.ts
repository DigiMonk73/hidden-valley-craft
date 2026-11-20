// A soft light round every lamp and every fire (docs/PHASE9A.md, 3): one square that faces the camera for each,
// all drawn in one call. Lamps were flat lit squares; nights and rooms gain most.
//
// Cheap by design: no pass of its own and no blur. Close to, a glow is about a metre across (ten lanterns in a
// room must not each paint the whole screen); from far off it is drawn larger than life, so the home's lamps
// show across the valley at night, the way a lit window carries.

import * as THREE from 'three';
import { CS } from '../world/constants.ts';
import { GLOW_OF, GLOW_STRIDE } from '../world/glow.ts';
import type { SkyState } from './sky.ts';

const VERT = /* glsl */ `
in vec3 iPos;
in vec4 iColor; // rgb, and how much of the sky's light reaches it (0–1)
in vec2 iShape; // reach in metres; a fire's own phase (0: steady)
uniform float uTime;
uniform float uDaylight;
uniform float uFogNear, uFogFar;
out vec2 vAt;
out vec4 vColor;
void main() {
  vec4 centre = viewMatrix * vec4(iPos, 1.0);
  float dist = length(centre.xyz);
  // Toward the eye a little, so a wall lamp's glow is not cut in half by its wall.
  centre.xyz -= normalize(centre.xyz) * min(0.3, dist * 0.4);
  float flick = 1.0;
  if (iShape.y > 0.0) {
    float t = uTime * 9.0 + iShape.y;
    flick = 0.86 + 0.09 * sin(t) + 0.05 * sin(t * 2.3 + 1.7) + 0.04 * sin(t * 0.37);
  }
  // Larger than life from afar: by 60 m a lamp is three times its size, and never smaller than a point of light.
  float reach = iShape.x * flick * (1.0 + 2.0 * smoothstep(14.0, 60.0, dist) * (iShape.x > 1.5 ? 0.25 : 1.0)); // (a street light is big already: at 80 m it was a puffball wider than its post)
  reach = max(reach, dist * 0.0045);
  centre.xy += position.xy * reach;
  vAt = position.xy;
  // Faint by day under the open sky, full in the dark; and it goes into the haze (or the water) like everything else.
  float lit = iColor.a * uDaylight;
  float strength = mix(1.0, 0.22, smoothstep(0.25, 0.85, lit)) * flick;
  float fog = smoothstep(uFogNear, uFogFar, dist);
  strength *= 1.0 - fog * fog; // a light carries further into haze (or water) than what it lights
  vColor = vec4(iColor.rgb, strength);
  gl_Position = projectionMatrix * centre;
}`;

const FRAG = /* glsl */ `
precision highp float;
in vec2 vAt;
in vec4 vColor;
out vec4 outColor;
void main() {
  float r = length(vAt);
  if (r > 1.0) discard;
  // A bright heart and a wide soft skirt.
  float a = 0.5 * exp(-r * r * 22.0) + 0.38 * (1.0 - r) * (1.0 - r);
  outColor = vec4(vColor.rgb * a * vColor.a, 1.0);
}`;

export class Glows {
  readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  private chunks = new Map<number, { x: number; y: number; z: number; data: Float32Array }>();
  private dirty = false;
  private capacity = 0;
  private pos = new Float32Array(0);
  private col = new Float32Array(0);
  private shape = new Float32Array(0);
  /** How many glows are drawn now. */
  count = 0;

  constructor() {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uDaylight: { value: 1 }, uFogNear: { value: 150 }, uFogFar: { value: 1350 } },
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 25; // after the water, so a lamp under water still glows through it
  }

  /** A chunk's lamps and fires, as the mesher listed them (none: the chunk has none now). */
  setChunk(key: number, cx: number, cy: number, cz: number, data: Float32Array | undefined): void {
    if (!data || !data.length) { this.removeChunk(key); return; }
    this.chunks.set(key, { x: cx * CS, y: cy * CS, z: cz * CS, data });
    this.dirty = true;
  }

  removeChunk(key: number): void {
    if (this.chunks.delete(key)) this.dirty = true;
  }

  private rebuild(): void {
    this.dirty = false;
    let n = 0;
    for (const c of this.chunks.values()) n += c.data.length / GLOW_STRIDE;
    const g = this.mesh.geometry;
    if (n > this.capacity) {
      this.capacity = Math.max(64, n * 2);
      this.pos = new Float32Array(this.capacity * 3);
      this.col = new Float32Array(this.capacity * 4);
      this.shape = new Float32Array(this.capacity * 2);
      g.setAttribute('iPos', new THREE.InstancedBufferAttribute(this.pos, 3));
      g.setAttribute('iColor', new THREE.InstancedBufferAttribute(this.col, 4));
      g.setAttribute('iShape', new THREE.InstancedBufferAttribute(this.shape, 2));
    }
    let i = 0;
    for (const c of this.chunks.values()) {
      for (let k = 0; k < c.data.length; k += GLOW_STRIDE) {
        const def = GLOW_OF[c.data[k + 3]];
        if (!def) continue;
        const x = c.x + c.data[k], y = c.y + c.data[k + 1], z = c.z + c.data[k + 2];
        this.pos.set([x, y, z], i * 3);
        this.col.set([def.r, def.g, def.b, c.data[k + 4] / 15], i * 4);
        // Each fire flickers to its own time (a phase from where it stands).
        this.shape.set([def.size, def.fire ? 1 + ((x * 12.9898 + y * 78.233 + z * 37.719) % 6.283 + 6.283) % 6.283 : 0], i * 2);
        i++;
      }
    }
    this.count = i;
    g.instanceCount = i;
    // (No attribute exists until the first glow has been seen: a chunk added and taken away before any frame leaves none.)
    if (this.capacity) for (const name of ['iPos', 'iColor', 'iShape']) (g.getAttribute(name) as THREE.InstancedBufferAttribute).needsUpdate = true;
  }

  /** `full`: every glow at its full strength whatever the daylight (under water: the lamps are what you swim to). */
  sync(s: SkyState, fogNear: number, fogFar: number, time: number, full = false): void {
    if (this.dirty) this.rebuild();
    const u = this.mesh.material.uniforms;
    u.uTime.value = time; u.uDaylight.value = full ? 0 : s.daylight; u.uFogNear.value = fogNear; u.uFogFar.value = fogFar;
  }
}
