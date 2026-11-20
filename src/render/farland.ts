// Draws the coarse distant landscape beyond the loaded chunks, lit and fogged like the blocks,
// and hidden inside the loaded area so the real blocks show there.

import * as THREE from 'three';
import { SKY_COLOR_GLSL, type SkyState } from './sky.ts';
import type { FarMesh } from '../gen/farland.ts';
import { blockId, B_FACE_TEX } from '../world/blocks.ts';

const VERT = /* glsl */ `
in vec4 aColor;
in vec2 aMat;
out vec3 vColor;
out float vShade;
flat out float vLayer;
flat out float vFace;
out vec3 vWorld;
out float vDist;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vec4 view = viewMatrix * world;
  vDist = length(view.xyz);
  vColor = aColor.rgb / 128.0;
  vShade = aColor.a / 255.0;
  vLayer = aMat.x;
  vFace = aMat.y;
  gl_Position = projectionMatrix * view;
}`;

const FRAG = /* glsl */ `
precision highp float;
precision highp sampler2DArray;
in vec3 vColor;
in float vShade;
flat in float vLayer;
flat in float vFace;
uniform sampler2DArray uTex;
in vec3 vWorld;
in float vDist;
uniform sampler2D uDrawn; // 64 × 64: 1 where the real blocks are drawn
uniform float uDaylight;
uniform vec3 uSkyLight;
uniform float uFogNear, uFogFar;
uniform float uMossLayer; // mossy limestone, for the damp parts of a rock face
out vec4 outColor;
${SKY_COLOR_GLSL}
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float hash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
// Smooth noise from a grid of hashes, 0–1.
float noise3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
void main() {
  // Where the real blocks are drawn, they show instead. Sample the column's centre so the edge is exact.
  vec2 colUv = (floor(vWorld.xz / 32.0) + 0.5) / 64.0;
  if (texture(uDrawn, colUv).r > 0.5) discard;
  float kind = floor(vFace / 4.0 + 0.01), face = vFace - kind * 4.0;
  // The same block textures as near by, one texture per metre, laid on by world position.
  vec2 uv = face < 0.5 ? vWorld.xz : face < 1.5 ? vec2(vWorld.z, -vWorld.y) : vec2(vWorld.x, -vWorld.y);
  float layer = vLayer, shade = 1.0;
  // The block this fragment would be in, were the land real: everything below is decided block by block, so the
  // distant land has the near land's grain and not a smooth wash over flat slabs.
  vec3 cell = floor(vWorld + vec3(0.001));
  if (kind > 1.5 && kind < 2.5) {
    // Rock, as the near cliffs are: damp patches of moss, and beds a few metres thick, each a little lighter or
    // darker than the next, with a line of shadow under a ledge here and there.
    float damp = noise3(cell / 6.0) * 0.6 + noise3(vec3(cell.x, 0.0, cell.z) / 14.0);
    if (damp > 0.92) layer = uMossLayer;
    if (face > 0.5) {
      float along = face < 1.5 ? cell.z : cell.x;
      float bed = floor((cell.y + 2.0 * hash2(vec2(floor(along / 12.0), 7.0))) / 3.0);
      shade = 0.8 + 0.3 * hash2(vec2(bed, floor(along / 9.0)));
      // Under a ledge: a darker course of blocks, broken along its length.
      if (fract((cell.y + 2.0 * hash2(vec2(floor(along / 12.0), 7.0))) / 3.0) < 0.3 && hash2(vec2(bed, floor(along / 3.0))) > 0.62) shade *= 0.7;
      shade *= 0.93 + 0.14 * hash3(cell);
    } else shade = 0.9 + 0.2 * hash3(cell);
  } else if (kind < 0.5) {
    // Forest: crowns a few metres across, some in sun and some in shade, with the dark gaps between them.
    vec2 crown = floor(vWorld.xz / 4.0);
    float h = hash2(crown);
    shade = face < 0.5 ? 0.78 + 0.34 * h : 0.62 + 0.2 * h;
    if (face < 0.5 && hash2(crown + 31.0) < 0.14) shade *= 0.6;
  } else if (face < 0.5) shade = 0.92 + 0.16 * hash3(cell);
  vec3 tex = texture(uTex, vec3(uv, layer)).rgb;
  vec3 col = tex * vColor * vShade * shade * uSkyLight * uDaylight;
  float fog = pow(smoothstep(uFogNear, uFogFar, vDist), 0.8);
  col = mix(col, skyColor(normalize(vWorld - cameraPosition)), fog);
  outColor = vec4(col, 1.0);
}`;

export class FarLand {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;

  constructor(m: FarMesh, texture: THREE.Texture, drawn: THREE.Texture) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(m.colors, 4));
    g.setAttribute('aMat', new THREE.BufferAttribute(m.mats, 2));
    g.setIndex(new THREE.BufferAttribute(m.index, 1));
    const mat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: FRAG,
      // Drawn after the real blocks, and only where they left nothing (they mark a stencil bit): in a column where
      // both are drawn (src/render/farmask.ts) the distant land fills holes and never covers the real land.
      stencilWrite: true, stencilRef: 1, stencilFunc: THREE.NotEqualStencilFunc,
      stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp, stencilZPass: THREE.KeepStencilOp,
      uniforms: {
        uTex: { value: texture }, uDrawn: { value: drawn }, uDaylight: { value: 1 }, uSkyLight: { value: new THREE.Color(1, 1, 1) },
        uFogNear: { value: 300 }, uFogFar: { value: 1400 }, uMossLayer: { value: B_FACE_TEX[blockId('limestone_mossy') * 6] },
        uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
        uSunGlow: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      },
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1; // after every chunk's solid mesh (0), before anything see-through
  }

  sync(s: SkyState, fogNear: number, fogFar: number): void {
    const u = this.mesh.material.uniforms;
    u.uDaylight.value = s.daylight; u.uSkyLight.value.copy(s.skyLight);
    u.uFogNear.value = fogNear; u.uFogFar.value = fogFar;
    u.uZenith.value.copy(s.zenith); u.uHorizon.value.copy(s.horizon); u.uSunGlow.value.copy(s.sunGlow); u.uSunDir.value.copy(s.sunDir);
  }
}
