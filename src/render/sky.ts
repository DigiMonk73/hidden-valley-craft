// Time of day: where the sun is, and the colours of sky, fog and daylight that follow from it.
// A day is 20 real minutes. The sun rises in the east and sets in the west, behind the waterfall
// as seen from the balcony.

import * as THREE from 'three';

export const DAY_SECONDS = 20 * 60;

export interface SkyState {
  sunDir: THREE.Vector3;
  daylight: number; // 0 (moonlit night) … 1 (full day)
  zenith: THREE.Color;
  horizon: THREE.Color;
  sunGlow: THREE.Color;
  skyLight: THREE.Color; // colour of light from the open sky
  fog: THREE.Color;
  mist: number; // 0–1: how thick the valley's morning mist is
  mistColor: THREE.Color;
}

const C = (h: string) => new THREE.Color(h);
const DAY = { zenith: C('#3f7fc4'), horizon: C('#a8cbe3'), light: C('#fffaf0') };
const GOLD = { zenith: C('#3b5e93'), horizon: C('#f2a15c'), light: C('#ffcf9a') };
const DUSK = { zenith: C('#1a2547'), horizon: C('#7a5a7a'), light: C('#a08cb8') };
// Moonlight is drawn brighter than its number (docs/PHASE9A.md, 3): the night's `daylight` stays 0.3, because the
// Ashen live by it (src/game.ts, lightAt), so the lift is in the light's colour, which only the picture reads.
const NIGHT = { zenith: C('#070c18'), horizon: C('#142236'), light: C('#a8bcf2').multiplyScalar(1.7) };

function lerp3(a: THREE.Color, b: THREE.Color, t: number): THREE.Color {
  return a.clone().lerp(b, Math.min(1, Math.max(0, t)));
}

/** hour: 0–24. */
export function skyAt(hour: number): SkyState {
  const a = ((hour - 6) / 24) * Math.PI * 2; // 06:00 east horizon, 12:00 overhead, 18:00 west horizon
  const sunDir = new THREE.Vector3(Math.cos(a), Math.sin(a), 0.22).normalize();
  const h = sunDir.y;
  // Pick the palette by the sun's height: night, dusk, golden hour, day.
  let pal;
  if (h > 0.35) pal = { ...DAY };
  else if (h > 0.05) {
    const t = (h - 0.05) / 0.3;
    pal = { zenith: lerp3(GOLD.zenith, DAY.zenith, t), horizon: lerp3(GOLD.horizon, DAY.horizon, t), light: lerp3(GOLD.light, DAY.light, t) };
  } else if (h > -0.12) {
    const t = (h + 0.12) / 0.17;
    pal = { zenith: lerp3(DUSK.zenith, GOLD.zenith, t), horizon: lerp3(DUSK.horizon, GOLD.horizon, t), light: lerp3(DUSK.light, GOLD.light, t) };
  } else {
    const t = Math.min(1, (h + 0.35) / 0.23);
    pal = { zenith: lerp3(NIGHT.zenith, DUSK.zenith, t), horizon: lerp3(NIGHT.horizon, DUSK.horizon, t), light: lerp3(NIGHT.light, DUSK.light, t) };
  }
  const daylight = 0.3 + 0.7 * THREE.MathUtils.smoothstep(h, -0.15, 0.3); // moonlit nights stay readable
  const sunGlow = h > -0.1 ? C('#ffd7a0').lerp(C('#fff6e0'), THREE.MathUtils.smoothstep(h, 0.05, 0.5)) : C('#000000');
  // Mist gathers before dawn and burns off by mid-morning (DESIGN.md: misty mornings).
  const mist = THREE.MathUtils.smoothstep(hour, 3.5, 5.5) * (1 - THREE.MathUtils.smoothstep(hour, 7.5, 9.8));
  const mistColor = pal.horizon.clone().lerp(new THREE.Color('#eef3f4'), 0.6).multiplyScalar(0.35 + 0.65 * daylight);
  return {
    sunDir, daylight, zenith: pal.zenith, horizon: pal.horizon, sunGlow,
    skyLight: pal.light, fog: pal.horizon.clone().lerp(pal.zenith, 0.25), mist, mistColor,
  };
}

const SKY_VERT = /* glsl */ `
out vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * mat4(mat3(viewMatrix)) * vec4(position, 1.0);
  gl_Position = p.xyww; // always at the far plane
}`;

/** The sky's colour in a direction, without stars. Shared with the block shader's fog, so distant
 * land fades into exactly the sky behind it. */
export const SKY_COLOR_GLSL = /* glsl */ `
uniform vec3 uZenith, uHorizon, uSunGlow, uSunDir;
vec3 skyColor(vec3 d) {
  float up = clamp(d.y, -0.2, 1.0);
  vec3 col = mix(uHorizon, uZenith, pow(max(up, 0.0), 0.55));
  col = mix(col, uHorizon * 0.55, clamp(-up * 4.0, 0.0, 1.0));
  float s = max(dot(d, uSunDir), 0.0);
  // Glow around the sun, wider near the horizon.
  col += uSunGlow * (pow(s, 8.0) * 0.35 + pow(s, 64.0) * 0.6) * (1.0 - 0.4 * max(uSunDir.y, 0.0));
  return col;
}`;

const SKY_FRAG = /* glsl */ `
precision highp float;
in vec3 vDir;
uniform float uDaylight;
out vec4 outColor;
${SKY_COLOR_GLSL}
float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
void main() {
  vec3 d = normalize(vDir);
  vec3 col = skyColor(d);
  // The sun's disc, and the moon opposite it with a faint halo at night.
  col += uSunGlow * smoothstep(0.9993, 0.9996, max(dot(d, uSunDir), 0.0)) * 2.0;
  float m = max(dot(d, -uSunDir), 0.0);
  float nightM = 1.0 - smoothstep(0.4, 0.7, uDaylight); // night daylight is 0.3, so full moon at night
  col += vec3(0.92, 0.94, 1.0) * (smoothstep(0.99955, 0.99975, m) * 0.9 + pow(m, 40.0) * 0.08) * nightM;
  // Stars, fading in as the day light goes.
  float night = 1.0 - smoothstep(0.35, 0.65, uDaylight);
  if (night > 0.0 && d.y > 0.0) {
    vec3 cell = floor(d * 280.0);
    float h = hash(cell);
    col += vec3(0.85, 0.9, 1.0) * step(0.9975, h) * night * smoothstep(0.0, 0.25, d.y);
  }
  outColor = vec4(col, 1.0);
}`;

export function createSkyDome(): THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial> {
  const mat = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    uniforms: {
      uZenith: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uSunGlow: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uDaylight: { value: 1 },
    },
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  return mesh;
}

export function applySky(dome: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>, s: SkyState): void {
  const u = dome.material.uniforms;
  u.uZenith.value.copy(s.zenith);
  u.uHorizon.value.copy(s.horizon);
  u.uSunGlow.value.copy(s.sunGlow);
  u.uSunDir.value.copy(s.sunDir);
  u.uDaylight.value = s.daylight;
}
