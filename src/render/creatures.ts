// Draws the wild's creatures as box models (a body, a head and four legs that swing as they walk) and
// the arrows in flight or stuck in the ground. They are lit like the blocks: by the sky and block
// light where they stand, faded into the same sky-coloured fog, and flash red when hurt.

import * as THREE from 'three';
import { SKY_COLOR_GLSL } from './sky.ts';
import type { Creature, Kind } from '../entity/creatures.ts';
import type { Arrow } from '../entity/wild.ts';

const VERT = /* glsl */ `
in vec3 aColor;
out vec3 vColor;
out float vShade;
out vec3 vWorld;
out float vDist;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vec4 view = viewMatrix * world;
  vDist = length(view.xyz);
  vec3 n = normalize(mat3(modelMatrix) * normal);
  // The blocks' fixed shading by face direction: top brightest, bottom darkest.
  vShade = n.y > 0.5 ? 1.0 : n.y < -0.5 ? 0.55 : abs(n.x) > 0.5 ? 0.72 : 0.84;
  vColor = aColor;
  gl_Position = projectionMatrix * view;
}`;

const FRAG = /* glsl */ `
precision highp float;
in vec3 vColor;
in float vShade;
in vec3 vWorld;
in float vDist;
uniform vec2 uLight; // sky and block light where the creature stands, 0–1
uniform float uHurt; // 1 just hurt … 0
uniform float uDaylight;
uniform vec3 uSkyLight;
uniform vec3 uBlockLight;
uniform float uFogNear, uFogFar;
out vec4 outColor;
${SKY_COLOR_GLSL}
float curve(float l) { return l / (2.2 - 1.2 * l); }
void main() {
  vec3 light = max(uSkyLight * curve(uLight.x) * uDaylight, uBlockLight * curve(uLight.y));
  light = max(light, vec3(0.035));
  vec3 col = vColor * light * vShade;
  col = mix(col, vec3(0.85, 0.12, 0.08) * max(light, vec3(0.4)), uHurt * 0.6);
  float fog = smoothstep(uFogNear, uFogFar, vDist);
  col = mix(col, skyColor(normalize(vWorld - cameraPosition)), fog);
  outColor = vec4(col, 1.0);
}`;

type Part = { size: [number, number, number]; at: [number, number, number]; color: string };

interface Model {
  body: Part[]; // body, head and the rest that do not move
  leg: { size: [number, number, number]; color: string; hips: [number, number, number][] }; // hips: where each leg hangs from
}

/** The four kinds, in metres from the feet. The head is toward −z (the way yaw 0 faces). */
const MODELS: Record<Kind, Model> = {
  rabbit: {
    body: [
      { size: [0.28, 0.24, 0.4], at: [0, 0.22, 0.02], color: '#8f7f6b' },
      { size: [0.2, 0.2, 0.2], at: [0, 0.34, -0.24], color: '#9c8c78' },
      { size: [0.05, 0.2, 0.05], at: [-0.06, 0.52, -0.22], color: '#8a7a66' },
      { size: [0.05, 0.2, 0.05], at: [0.06, 0.52, -0.22], color: '#8a7a66' },
      { size: [0.1, 0.1, 0.08], at: [0, 0.28, 0.24], color: '#efe9df' },
      { size: [0.04, 0.04, 0.02], at: [-0.07, 0.38, -0.34], color: '#1d1d1d' },
      { size: [0.04, 0.04, 0.02], at: [0.07, 0.38, -0.34], color: '#1d1d1d' },
    ],
    leg: { size: [0.07, 0.12, 0.08], color: '#7d6e5c', hips: [[-0.09, 0.12, -0.12], [0.09, 0.12, -0.12], [-0.09, 0.12, 0.14], [0.09, 0.12, 0.14]] },
  },
  deer: {
    body: [
      { size: [0.48, 0.5, 1.1], at: [0, 1.0, 0], color: '#9a6b43' },
      { size: [0.4, 0.1, 0.9], at: [0, 0.72, 0], color: '#cbb293' },
      { size: [0.2, 0.45, 0.22], at: [0, 1.35, -0.55], color: '#946640' },
      { size: [0.24, 0.26, 0.4], at: [0, 1.6, -0.68], color: '#9a6b43' },
      { size: [0.12, 0.1, 0.12], at: [0, 1.56, -0.92], color: '#3a2a20' },
      { size: [0.1, 0.16, 0.04], at: [-0.15, 1.8, -0.6], color: '#8a5d3a' },
      { size: [0.1, 0.16, 0.04], at: [0.15, 1.8, -0.6], color: '#8a5d3a' },
      { size: [0.14, 0.2, 0.06], at: [0, 1.15, 0.56], color: '#f2ece0' },
    ],
    leg: { size: [0.1, 0.75, 0.1], color: '#7d5534', hips: [[-0.16, 0.75, -0.42], [0.16, 0.75, -0.42], [-0.16, 0.75, 0.42], [0.16, 0.75, 0.42]] },
  },
  boar: {
    body: [
      { size: [0.62, 0.58, 1.0], at: [0, 0.58, 0.05], color: '#4a3b30' },
      { size: [0.3, 0.16, 0.8], at: [0, 0.92, 0.0], color: '#3a2e25' }, // the bristly ridge
      { size: [0.4, 0.4, 0.42], at: [0, 0.6, -0.62], color: '#4f4034' },
      { size: [0.24, 0.2, 0.16], at: [0, 0.5, -0.88], color: '#6b5546' },
      { size: [0.04, 0.12, 0.04], at: [-0.13, 0.5, -0.86], color: '#ece6d6' },
      { size: [0.04, 0.12, 0.04], at: [0.13, 0.5, -0.86], color: '#ece6d6' },
    ],
    leg: { size: [0.14, 0.3, 0.14], color: '#3a2e25', hips: [[-0.2, 0.3, -0.32], [0.2, 0.3, -0.32], [-0.2, 0.3, 0.36], [0.2, 0.3, 0.36]] },
  },
  puma: {
    body: [
      { size: [0.42, 0.42, 1.15], at: [0, 0.72, 0.05], color: '#b08a5a' },
      { size: [0.34, 0.08, 0.95], at: [0, 0.52, 0.05], color: '#d9c3a0' },
      { size: [0.32, 0.3, 0.34], at: [0, 0.86, -0.68], color: '#b48e5e' },
      { size: [0.2, 0.12, 0.12], at: [0, 0.8, -0.88], color: '#d9c3a0' },
      { size: [0.08, 0.1, 0.04], at: [-0.11, 1.04, -0.62], color: '#5a4630' },
      { size: [0.08, 0.1, 0.04], at: [0.11, 1.04, -0.62], color: '#5a4630' },
      { size: [0.08, 0.08, 0.8], at: [0, 0.62, 0.95], color: '#a07c4e' },
      { size: [0.1, 0.1, 0.12], at: [0, 0.6, 1.36], color: '#3a2e25' },
    ],
    leg: { size: [0.13, 0.5, 0.13], color: '#a38050', hips: [[-0.14, 0.5, -0.4], [0.14, 0.5, -0.4], [-0.14, 0.5, 0.42], [0.14, 0.5, 0.42]] },
  },
  // Zone-1's near band (docs/PHASE4.md).
  dog: { // a rangy, mangy farm dog gone feral: dark brown with a pale chest
    body: [
      { size: [0.34, 0.34, 0.72], at: [0, 0.56, 0.02], color: '#6e5438' },
      { size: [0.26, 0.2, 0.3], at: [0, 0.5, -0.24], color: '#c9b08a' },
      { size: [0.28, 0.27, 0.3], at: [0, 0.76, -0.46], color: '#74593c' },
      { size: [0.14, 0.12, 0.18], at: [0, 0.7, -0.66], color: '#3a2c20' },
      { size: [0.06, 0.04, 0.04], at: [0, 0.74, -0.76], color: '#141414' },
      { size: [0.08, 0.12, 0.05], at: [-0.1, 0.94, -0.42], color: '#3a2c20' },
      { size: [0.08, 0.12, 0.05], at: [0.1, 0.94, -0.42], color: '#3a2c20' },
      { size: [0.04, 0.04, 0.02], at: [-0.08, 0.8, -0.62], color: '#e0b040' },
      { size: [0.04, 0.04, 0.02], at: [0.08, 0.8, -0.62], color: '#e0b040' },
      { size: [0.07, 0.07, 0.34], at: [0, 0.7, 0.5], color: '#3f3122' },
    ],
    leg: { size: [0.1, 0.4, 0.1], color: '#5a4430', hips: [[-0.11, 0.4, -0.26], [0.11, 0.4, -0.26], [-0.11, 0.4, 0.28], [0.11, 0.4, 0.28]] },
  },
  coyote: { // grey-tan with a pale belly, big ears and a bushy, black-tipped tail
    body: [
      { size: [0.3, 0.3, 0.7], at: [0, 0.55, 0.02], color: '#93806a' },
      { size: [0.24, 0.08, 0.6], at: [0, 0.42, 0.02], color: '#d6c8b0' },
      { size: [0.24, 0.24, 0.28], at: [0, 0.72, -0.44], color: '#9a8770' },
      { size: [0.12, 0.1, 0.2], at: [0, 0.67, -0.64], color: '#b8a588' },
      { size: [0.06, 0.04, 0.04], at: [0, 0.7, -0.75], color: '#141414' },
      { size: [0.08, 0.16, 0.04], at: [-0.08, 0.92, -0.42], color: '#7a6852' },
      { size: [0.08, 0.16, 0.04], at: [0.08, 0.92, -0.42], color: '#7a6852' },
      { size: [0.12, 0.12, 0.4], at: [0, 0.5, 0.52], color: '#8a7760' },
      { size: [0.1, 0.1, 0.1], at: [0, 0.44, 0.75], color: '#2a2420' },
    ],
    leg: { size: [0.08, 0.4, 0.08], color: '#85735e', hips: [[-0.1, 0.4, -0.26], [0.1, 0.4, -0.26], [-0.1, 0.4, 0.28], [0.1, 0.4, 0.28]] },
  },
  chicken: { // a red-brown hen
    body: [
      { size: [0.24, 0.22, 0.32], at: [0, 0.27, 0.02], color: '#9a5230' },
      { size: [0.2, 0.08, 0.26], at: [0, 0.37, 0.02], color: '#b0673a' },
      { size: [0.13, 0.15, 0.13], at: [0, 0.43, -0.16], color: '#a85c34' },
      { size: [0.04, 0.06, 0.1], at: [0, 0.53, -0.16], color: '#c0392b' },
      { size: [0.05, 0.04, 0.07], at: [0, 0.43, -0.26], color: '#e0a526' },
      { size: [0.03, 0.06, 0.03], at: [0, 0.38, -0.24], color: '#c0392b' },
      { size: [0.16, 0.16, 0.08], at: [0, 0.38, 0.2], color: '#5a2e1a' },
    ],
    leg: { size: [0.03, 0.16, 0.03], color: '#e0a526', hips: [[-0.05, 0.16, 0.02], [0.05, 0.16, 0.02]] },
  },
  marco: { // a farmer-trader: straw hat, a woven poncho of brick red with ochre and cream bands, a canvas bag
    body: [
      { size: [0.42, 0.56, 0.24], at: [0, 1.1, 0], color: '#3d4a3a' }, // shirt under the poncho
      { size: [0.62, 0.5, 0.36], at: [0, 1.14, 0], color: '#9c3b2a' }, // the poncho
      { size: [0.63, 0.05, 0.37], at: [0, 1.02, 0], color: '#d39a3a' },
      { size: [0.63, 0.04, 0.37], at: [0, 1.1, 0], color: '#e8dcc0' },
      { size: [0.63, 0.05, 0.37], at: [0, 1.25, 0], color: '#d39a3a' },
      { size: [0.12, 0.16, 0.14], at: [-0.25, 0.83, 0], color: '#a77a55' }, // hands
      { size: [0.12, 0.16, 0.14], at: [0.25, 0.83, 0], color: '#a77a55' },
      { size: [0.12, 0.08, 0.12], at: [0, 1.43, 0], color: '#9a6e4c' }, // neck
      { size: [0.28, 0.3, 0.28], at: [0, 1.6, 0], color: '#a77a55' }, // head
      { size: [0.2, 0.05, 0.02], at: [0, 1.52, -0.145], color: '#3a2a20' }, // moustache
      { size: [0.04, 0.04, 0.02], at: [-0.07, 1.64, -0.145], color: '#1d1d1d' },
      { size: [0.04, 0.04, 0.02], at: [0.07, 1.64, -0.145], color: '#1d1d1d' },
      { size: [0.72, 0.04, 0.72], at: [0, 1.76, 0], color: '#d8bf7a' }, // hat brim
      { size: [0.32, 0.16, 0.32], at: [0, 1.85, 0], color: '#cdb26a' },
      { size: [0.33, 0.04, 0.33], at: [0, 1.8, 0], color: '#5a3a24' }, // hat band
      { size: [0.16, 0.24, 0.08], at: [0.36, 0.98, 0.04], color: '#b9a678' }, // the bag
      { size: [0.04, 0.5, 0.04], at: [0.18, 1.22, 0.14], color: '#8a6a40' }, // its strap
    ],
    leg: { size: [0.17, 0.82, 0.19], color: '#33363c', hips: [[-0.1, 0.82, 0], [0.1, 0.82, 0]] },
  },
};

function coloured(g: THREE.BufferGeometry, hex: string): THREE.BufferGeometry {
  const c = new THREE.Color(hex);
  const n = g.getAttribute('position').count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('aColor', new THREE.BufferAttribute(a, 3));
  return g;
}

function box(p: Part): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(...p.size);
  g.translate(...p.at);
  return coloured(g, p.color);
}

const BODY_GEOMS = new Map<Kind, THREE.BufferGeometry[]>();
const LEG_GEOMS = new Map<Kind, THREE.BufferGeometry>();
for (const k of Object.keys(MODELS) as Kind[]) {
  BODY_GEOMS.set(k, MODELS[k].body.map(box));
  const l = MODELS[k].leg;
  const g = new THREE.BoxGeometry(...l.size);
  g.translate(0, -l.size[1] / 2, 0); // hangs from the hip, so it swings from there
  LEG_GEOMS.set(k, coloured(g, l.color));
}
const ARROW_GEOM = (() => {
  const g = new THREE.BoxGeometry(0.035, 0.035, 0.72);
  return coloured(g, '#8a5a32');
})();

export interface Shared { uniforms: Record<string, THREE.IUniform> }

interface View { group: THREE.Group; legs: THREE.Mesh[]; mat: THREE.ShaderMaterial }

export class CreatureRenderer {
  private views = new Map<number, View>();
  private arrows = new Map<Arrow, THREE.Mesh>();
  private arrowMat: THREE.ShaderMaterial;

  constructor(private scene: THREE.Scene, private shared: Shared) {
    this.arrowMat = this.material();
  }

  private material(): THREE.ShaderMaterial {
    const s = this.shared.uniforms;
    // The world's lighting and fog uniforms are shared by reference with the block material.
    return new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: FRAG,
      uniforms: {
        uLight: { value: new THREE.Vector2(1, 0) }, uHurt: { value: 0 },
        uDaylight: s.uDaylight, uSkyLight: s.uSkyLight, uBlockLight: s.uBlockLight, uFogNear: s.uFogNear, uFogFar: s.uFogFar,
        uZenith: s.uZenith, uHorizon: s.uHorizon, uSunGlow: s.uSunGlow, uSunDir: s.uSunDir,
      },
    });
  }

  private make(c: Creature): View {
    const mat = this.material();
    const group = new THREE.Group();
    for (const g of BODY_GEOMS.get(c.kind)!) group.add(new THREE.Mesh(g, mat));
    const legs = MODELS[c.kind].leg.hips.map((h) => {
      const m = new THREE.Mesh(LEG_GEOMS.get(c.kind)!, mat);
      m.position.set(...h);
      group.add(m);
      return m;
    });
    this.scene.add(group);
    return { group, legs, mat };
  }

  /** Brings the drawn creatures and arrows in step with the wild. `lightAt` gives a block's packed light. */
  sync(creatures: Creature[], arrows: Arrow[], lightAt: (x: number, y: number, z: number) => number, eye: THREE.Vector3): void {
    const alive = new Set<number>();
    for (const c of creatures) {
      alive.add(c.id);
      let v = this.views.get(c.id);
      if (!v) { v = this.make(c); this.views.set(c.id, v); }
      // Winding up to strike: head down, body tensed and trembling. That is the warning to step back.
      const windup = c.mind === 'windup';
      const tremble = windup ? Math.sin(c.timer * 60) * 0.03 : 0;
      v.group.position.set(c.x + tremble, c.y, c.z);
      v.group.rotation.set(windup ? -0.22 : 0, c.yaw, 0, 'YXZ');
      // Legs swing in diagonal pairs, front-left with back-right.
      const swing = Math.sin(c.stride) * Math.min(0.6, Math.hypot(c.vx, c.vz) * 0.25);
      v.legs.forEach((m, i) => { m.rotation.x = i === 0 || i === 3 ? swing : -swing; });
      const l = lightAt(Math.floor(c.x), Math.floor(c.y + 0.5), Math.floor(c.z));
      v.mat.uniforms.uLight.value.set((l >> 4) / 15, (l & 15) / 15);
      v.mat.uniforms.uHurt.value = Math.max(0, 1 - c.hurt / 0.35);
      v.group.visible = Math.hypot(c.x - eye.x, c.z - eye.z) < 160;
    }
    for (const [id, v] of this.views) {
      if (alive.has(id)) continue;
      this.scene.remove(v.group);
      v.mat.dispose();
      this.views.delete(id);
    }
    // Arrows point along their flight, and keep that angle once stuck.
    const seen = new Set<Arrow>();
    for (const a of arrows) {
      seen.add(a);
      let m = this.arrows.get(a);
      if (!m) { m = new THREE.Mesh(ARROW_GEOM, this.arrowMat); this.scene.add(m); this.arrows.set(a, m); }
      m.position.set(a.x, a.y, a.z);
      if (!a.stuck) m.lookAt(a.x + a.vx, a.y + a.vy, a.z + a.vz);
    }
    for (const [a, m] of this.arrows) if (!seen.has(a)) { this.scene.remove(m); this.arrows.delete(a); }
    const l = lightAt(Math.floor(eye.x), Math.floor(eye.y), Math.floor(eye.z));
    this.arrowMat.uniforms.uLight.value.set(Math.max(0.5, (l >> 4) / 15), (l & 15) / 15);
  }
}
