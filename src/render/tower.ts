// The ruined radio tower on Zone-4's far ridge (docs/PHASE3.md, step 2): a thin steel lattice seen
// only from afar, in the same haze as the distant land. It is not reachable yet, so it is a mesh,
// not blocks.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SKY_COLOR_GLSL, type SkyState } from './sky.ts';
import { PLACES, outsideHeight } from '../gen/layout.ts';

const VERT = /* glsl */ `
out vec3 vWorld;
out float vDist;
out float vShade;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vec4 view = viewMatrix * world;
  vDist = length(view.xyz);
  vec3 n = normalize(mat3(modelMatrix) * normal);
  vShade = 0.7 + 0.3 * abs(n.x) * 0.5 + 0.3 * max(n.y, 0.0);
  gl_Position = projectionMatrix * view;
}`;

const FRAG = /* glsl */ `
precision highp float;
in vec3 vWorld;
in float vDist;
in float vShade;
uniform float uDaylight;
uniform vec3 uSkyLight;
uniform float uFogNear, uFogFar;
out vec4 outColor;
${SKY_COLOR_GLSL}
void main() {
  vec3 col = vec3(0.30, 0.27, 0.25) * vShade * uSkyLight * uDaylight;
  // The same haze as the distant land, held back a little so the thin frame still reads as a shape.
  float fog = pow(smoothstep(uFogNear, uFogFar, vDist), 0.8) * 0.8;
  col = mix(col, skyColor(normalize(vWorld - cameraPosition)), fog);
  outColor = vec4(col, 1.0);
}`;

/** A square-section beam from a to b, `t` thick. */
function beam(a: THREE.Vector3, b: THREE.Vector3, t: number): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const g = new THREE.BoxGeometry(t, len, t);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  g.applyQuaternion(q);
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}

/** The tower's frame, standing at the origin: four tapering legs, X-braced, the top bent over by a storm. */
export function towerGeometry(height: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const base = 5, top = 0.9, levels = 10;
  const corner = (k: number, y: number): THREE.Vector3 => {
    const half = base + (top - base) * (y / height);
    const sx = k === 0 || k === 3 ? -1 : 1, sz = k < 2 ? -1 : 1;
    // Above three quarters of the height the frame leans away, buckled.
    const bend = Math.max(0, y - height * 0.75);
    return new THREE.Vector3(sx * half + bend * bend * 0.02, y, sz * half + bend * 0.12);
  };
  const broken = (k: number, y: number) => k === 2 && y > height * 0.86; // one leg snapped near the top
  for (let i = 0; i < levels; i++) {
    const y0 = (height * i) / levels, y1 = (height * (i + 1)) / levels;
    for (let k = 0; k < 4; k++) {
      const n = (k + 1) % 4;
      if (!broken(k, y1)) parts.push(beam(corner(k, y0), corner(k, y1), 0.45));
      if (broken(k, y1) || broken(n, y1)) continue;
      parts.push(beam(corner(k, y1), corner(n, y1), 0.25));
      if (i % 3 !== 2) { parts.push(beam(corner(k, y0), corner(n, y1), 0.2)); parts.push(beam(corner(n, y0), corner(k, y1), 0.2)); }
    }
  }
  // The mast at the top, and a dish hanging off one side.
  const tip = corner(0, height).add(corner(1, height)).multiplyScalar(0.5);
  parts.push(beam(tip, tip.clone().add(new THREE.Vector3(1.5, 7, 0.6)), 0.3));
  const dish = new THREE.CylinderGeometry(1.4, 1.4, 0.3, 10);
  dish.rotateZ(1.2);
  dish.translate(tip.x - 1.6, tip.y - 6, tip.z);
  parts.push(dish);
  return mergeGeometries(parts.map((g) => g.toNonIndexed()));
}

export class RidgeTower {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;

  constructor() {
    const t = PLACES.ridgeTower;
    const mat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: FRAG,
      uniforms: {
        uDaylight: { value: 1 }, uSkyLight: { value: new THREE.Color(1, 1, 1) }, uFogNear: { value: 300 }, uFogFar: { value: 1400 },
        uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
        uSunGlow: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      },
    });
    this.mesh = new THREE.Mesh(towerGeometry(t.height), mat);
    this.mesh.position.set(t.x + 0.5, outsideHeight(t.x, t.z) - 1, t.z + 0.5);
    this.mesh.rotation.y = 0.5;
    this.mesh.renderOrder = -9;
  }

  sync(s: SkyState, fogNear: number, fogFar: number): void {
    const u = this.mesh.material.uniforms;
    u.uDaylight.value = s.daylight; u.uSkyLight.value.copy(s.skyLight);
    u.uFogNear.value = fogNear; u.uFogFar.value = fogFar;
    u.uZenith.value.copy(s.zenith); u.uHorizon.value.copy(s.horizon); u.uSunGlow.value.copy(s.sunGlow); u.uSunDir.value.copy(s.sunDir);
  }
}
