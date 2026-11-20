// Draws the world: the sky, every chunk's mesh with the block shader, the water, and the outline
// of the block the player is looking at.

import * as THREE from 'three';
import { TEXTURE_NAMES } from '../world/blocks.ts';
import { buildTextureStack, buildCrackStages, TEX } from './textures.ts';
import { createSkyDome, applySky, SKY_COLOR_GLSL, type SkyState } from './sky.ts';
import type { ChunkMesh, MeshPart } from '../mesh/mesher.ts';
import { CS, COLS_X, COLS_Z } from '../world/constants.ts';
import { Particles } from './particles.ts';
import { FarLand } from './farland.ts';
import { Clouds } from './clouds.ts';
import { RidgeTower } from './tower.ts';
import { SmokeColumn, STEAM, CHIMNEY, FLUE } from './smoke.ts';
import { HOME_FIT } from '../gen/home.ts';
import { STEAM_AT } from '../gen/zone2.ts';
import { outsideHeight } from '../gen/layout.ts';
import { CreatureRenderer } from './creatures.ts';
import type { FarMesh } from '../gen/farland.ts';
import { disposeChunkGeometry } from './chunkGeometry.ts';
import { watchContext, type ContextWatch } from '../platform/context.ts';
import { HandView } from './hand.ts';
import { Glows } from './glow.ts';
import { hideFarLand } from './farmask.ts';
import { Birds } from './birds.ts';
import { Rain } from './rain.ts';

/** One atmosphere for everything: blocks, distant land and particles fade into the sky alike. */
const FOG_NEAR = 150;
const FOG_FAR = 1350;
/** Under water (docs/PHASE9A.md, 2): half gone at eight metres, all gone by eighteen. */
const WATER_FOG_NEAR = -2;
const WATER_FOG_FAR = 18;
/** What water does to light: the red goes first. */
const UNDERWATER_LIGHT = new THREE.Color(0.5, 0.86, 0.95);
/** Lamplight under water: greener, and hardly dimmer (the tunnel's rule is "well lit"). */
const UNDERWATER_LAMP = new THREE.Color(0.86, 1.08, 1.1);
/** The colour of lamplight and firelight on what they light. */
const BLOCK_LIGHT = new THREE.Color('#ffd08c');

const BLOCK_VERT = /* glsl */ `
in vec4 aPack;
in float aLayer;
in vec2 aUv;
uniform float uTime;
out vec2 vUv;
flat out float vLayer;
out float vAo;
out vec2 vLight;
out float vShade;
out float vDist;
out vec3 vWorld;
out float vWaterTop;
out float vSun;
out float vFlicker;
out float vThin;
uniform vec3 uSunDirV;
void main() {
  int flags = int(aPack.x + 0.5);
  int face = flags & 7;
  int corner = (flags >> 3) & 3;
  bool wave = (flags & 32) != 0;
  bool liquid = (flags & 64) != 0;
  bool glow = face == 7; // lit from within: a lamp's shade, coals, a flame (which also wavers)
  vec2 uv = aUv / 16.0; // position on the texture, in sixteenths (v counts up)
  vUv = vec2(uv.x, 1.0 - uv.y);
  if ((flags & 128) != 0) vUv.y -= uTime * 1.6; // falling water pours downward (the texture repeats)
  vLayer = aLayer;
  vWaterTop = liquid && face == 2 ? 1.0 : 0.0;
  // How squarely this face looks at the sun (plants count as half-facing it).
  vec3 n = face == 0 ? vec3(1, 0, 0) : face == 1 ? vec3(-1, 0, 0) : face == 2 ? vec3(0, 1, 0)
         : face == 3 ? vec3(0, -1, 0) : face == 4 ? vec3(0, 0, 1) : face == 5 ? vec3(0, 0, -1) : vec3(0.0);
  vSun = face == 6 ? 0.5 : max(dot(n, uSunDirV), 0.0);
  // The corner's shading in the low two bits; a third bit marks a thin thing that is let go far off (a vine).
  int shade = int(aPack.y + 0.5);
  vAo = float(shade & 3) / 3.0;
  vThin = (shade & 4) != 0 ? 1.0 : 0.0;
  vLight = aPack.zw / 240.0;
  // Fixed shading per face direction gives blocks their form: top brightest, bottom darkest.
  vShade = glow ? 2.0 : face == 2 ? 1.0 : face == 3 ? 0.55 : (face == 0 || face == 1) ? 0.72 : face == 6 ? 0.92 : 0.84;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vFlicker = 0.9;
  if (glow && wave) {
    // A flame: its top licks about, quick and uneven, and its brightness flutters.
    float h = corner >= 2 ? 1.0 : 0.0; // the foot of a flame stays put
    float t = uTime * 7.0 + world.x * 3.1 + world.z * 2.3;
    world.x += h * (sin(t) * 0.035 + sin(t * 2.7 + 1.3) * 0.02);
    world.z += h * (cos(t * 1.3) * 0.035 + sin(t * 3.1) * 0.02);
    world.y += h * sin(t * 1.9) * 0.03;
    vFlicker = 0.88 + 0.12 * sin(uTime * 11.0 + world.x * 5.0) * sin(uTime * 6.3 + world.z * 4.0);
  } else if (wave) {
    world.x += sin(uTime * 1.6 + world.z * 0.45 + world.y * 0.3) * 0.045;
    world.z += cos(uTime * 1.25 + world.x * 0.45) * 0.045;
  }
  if (liquid && face == 2) world.y += sin(uTime * 1.1 + world.x * 0.6 + world.z * 0.45) * 0.035 - 0.035;
  vec4 view = viewMatrix * world;
  vDist = length(view.xyz);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * view;
}`;

const BLOCK_FRAG = /* glsl */ `
precision highp float;
precision highp sampler2DArray;
in vec2 vUv;
flat in float vLayer;
in float vAo;
in vec2 vLight;
in float vShade;
in float vDist;
in vec3 vWorld;
in float vWaterTop;
in float vSun;
in float vFlicker;
in float vThin;
uniform sampler2DArray uTex;
uniform float uMist;
uniform vec3 uMistColor;
uniform vec3 uValley; // centre x, centre z, radius
uniform float uDaylight;
uniform vec3 uSkyLight;
uniform vec3 uBlockLight;
uniform float uFogNear;
uniform float uFogFar;
uniform float uOpacity;
uniform bool uCutout;
out vec4 outColor;
${SKY_COLOR_GLSL}
float curve(float l) { return l / (2.2 - 1.2 * l); } // light level → brightness, like a lightmap
void main() {
  vec3 tc = vec3(vUv, vLayer);
  vec4 tex = texture(uTex, tc);
  if (uCutout) {
    // Test alpha on the sharpest level so leaves don't thin out with distance.
    if (textureLod(uTex, tc, 0.0).a < 0.5) discard;
    // Vines are let go with distance, strand by strand, between 60 and 140 m: close to they are leaves on rock,
    // far off they were dark specks on the cliffs of the balcony's view.
    if (vThin > 0.5 && vDist + 80.0 * fract(sin(dot(floor(vWorld.xz), vec2(12.9898, 78.233))) * 43758.5453) > 140.0) discard;
    tex.a = 1.0;
  }
  float sky = curve(vLight.x) * uDaylight;
  float blk = curve(vLight.y);
  // Faces in the open that look toward the sun take more of its light: warm cliffs at sunset.
  float sunUp = smoothstep(-0.04, 0.12, uSunDir.y);
  float direct = smoothstep(0.8, 1.0, vLight.x) * sunUp;
  vec3 light = max(uSkyLight * sky * (0.8 + 0.55 * vSun * direct), uBlockLight * blk);
  light = max(light, vec3(0.035));
  float ao = mix(0.42, 1.0, vAo);
  vec3 col = tex.rgb * light * ao * vShade;
  // Lit from within (a lamp's shade, coals, a flame): its own colour, whatever the light around it.
  if (vShade > 1.5) col = tex.rgb * (0.9 + 0.25 * vFlicker) * vFlicker;
  float alpha = tex.a * uOpacity;
  if (vWaterTop > 0.5) {
    // Still water mirrors the sky, more so at a glancing angle, and catches a glint of the sun.
    vec3 v = normalize(cameraPosition - vWorld);
    vec3 r = reflect(-v, vec3(0.0, 1.0, 0.0));
    float fresnel = pow(1.0 - max(v.y, 0.0), 4.0);
    vec3 sky = skyColor(r) * (0.35 + 0.65 * curve(vLight.x));
    col = mix(col, sky, 0.25 + 0.6 * fresnel);
    col += uSunGlow * pow(max(dot(r, uSunDir), 0.0), 220.0) * 1.5 * curve(vLight.x);
    alpha = mix(alpha, 1.0, fresnel * 0.7);
  }
  // Morning mist lies low in the valley and thickens with distance.
  if (uMist > 0.0) {
    float inValley = 1.0 - smoothstep(uValley.z - 10.0, uValley.z + 6.0, length(vWorld.xz - uValley.xy));
    float low = 1.0 - smoothstep(70.0, 84.0, vWorld.y);
    float m = uMist * inValley * low * (1.0 - exp(-vDist * 0.03));
    col = mix(col, uMistColor, m * 0.85);
  }
  float fog = smoothstep(uFogNear, uFogFar, vDist);
  // Fog takes the colour of the sky behind the fragment, so the edge of the world melts into it.
  col = mix(col, skyColor(normalize(vWorld - cameraPosition)), fog);
  outColor = vec4(col, alpha);
}`;

/** The view's angle, top to bottom, with nothing held to the eye. */
const BASE_FOV = 72;
/** The train of satellites: how many, and how far off they are drawn (inside the far plane). */
const SAT_COUNT = 4, SAT_FAR = 1700;

export class Renderer {
  readonly gl: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly solidMat: THREE.ShaderMaterial;
  readonly waterMat: THREE.ShaderMaterial;
  private sky = createSkyDome();
  private meshes = new Map<number, { solid?: THREE.Mesh; water?: THREE.Mesh }>();
  private index: THREE.BufferAttribute;
  private indexQuads: number;
  private outline: THREE.LineSegments;
  private crack: THREE.Mesh<THREE.BoxGeometry, THREE.ShaderMaterial>;
  /** The fishing bobber: red over white, bobbing on the water. */
  private bobber = (() => {
    const g = new THREE.Group();
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.16), new THREE.MeshBasicMaterial({ color: 0xd63031 }));
    const bottom = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.16), new THREE.MeshBasicMaterial({ color: 0xf2f2f2 }));
    top.position.y = 0.1;
    g.add(top, bottom);
    g.visible = false;
    return g;
  })();
  private fogDist = 256;
  stats = { chunks: 0, quads: 0 };
  readonly particles = new Particles();
  private farland: FarLand | null = null;
  private clouds = new Clouds();
  private tower = new RidgeTower();
  private smoke = new SmokeColumn();
  /** The hot spring's steam, rising from its vent in Zone-2 (docs/PHASE6.md). */
  private steam = new SmokeColumn([STEAM_AT[0], outsideHeight(Math.floor(STEAM_AT[0]), Math.floor(STEAM_AT[2])) - 1, STEAM_AT[2]], STEAM);
  /** The home's fires: the hearth's chimney on the plateau, and the range's flue up the cliff. */
  private chimney = new SmokeColumn([HOME_FIT.chimney.x + 0.5, HOME_FIT.chimney.top + 1, HOME_FIT.chimney.z + 0.5], CHIMNEY);
  private flue = new SmokeColumn([HOME_FIT.flueCap.x + 0.5, HOME_FIT.flueCap.y + 0.8, HOME_FIT.flueCap.z + 0.5], FLUE);
  /** The wild's creatures and arrows. */
  readonly creatures: CreatureRenderer;
  private scratchLight = new THREE.Color();
  /** A soft light round every lamp and fire (docs/PHASE9A.md, 3). */
  readonly glows = new Glows();
  /**
   * The effects that cost something and can be done without (docs/PHASE9A.md): the glow round lamps, bubbles,
   * rain, birds. One setting turns them all off.
   */
  private fx = true;
  get effects(): boolean { return this.fx; }
  set effects(on: boolean) { this.fx = on; this.glows.mesh.visible = on; }
  /** The valley's birds (docs/PHASE9A.md, 6): scenery. */
  readonly birds = new Birds();
  /** Afternoon rain (docs/PHASE9A.md, 7). */
  readonly rain = new Rain();
  /** Is the eye under water, and the light there (docs/PHASE9A.md, 2)? Set by the game each frame. */
  private under = false;
  private eyeLight = 0xf0;
  private waterSky: SkyState | null = null;
  /** The player's arm and what the hand holds, drawn over the world (docs/PHASE9A.md, 1). */
  readonly hand = new HandView();
  /** Which columns have real blocks drawn: the distant land stays out of them. */
  private drawnTex = (() => {
    const t = new THREE.DataTexture(new Uint8Array(64 * 64), 64, 64, THREE.RedFormat, THREE.UnsignedByteType);
    t.magFilter = t.minFilter = THREE.NearestFilter;
    t.needsUpdate = true;
    return t;
  })();

  /** Told when the browser takes the picture away (the WebGL context is lost): nothing can be drawn until it is back. */
  onContextLost: () => void = () => {};
  /** Told when the picture is back and drawing again. */
  onContextRestored: () => void = () => {};
  /** Told when the picture has stayed away so long that it may not come back without a reload. */
  onContextStuck: () => void = () => {};
  private context: ContextWatch;
  private clearColor = new THREE.Color();

  constructor(canvas: HTMLCanvasElement) {
    // A stencil bit marks where real blocks were drawn, so the distant land can fill what they left and nothing else
    // (docs/PHASE9A.md, 4).
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: true, stencil: true, powerPreference: 'high-performance' });
    // Listened for after three.js's own listeners (made with the renderer above), so on a restore
    // three has already set its new context up by the time restore() runs.
    this.context = watchContext(canvas, {
      onLost: () => this.onContextLost(),
      onRestored: () => { this.restore(); this.onContextRestored(); },
      onStuck: () => this.onContextStuck(),
    });
    this.gl.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    // A frame is more than one pass (the world, then the hand): its counts are zeroed once a frame, in render().
    this.gl.info.autoReset = false;
    this.gl.outputColorSpace = THREE.LinearSRGBColorSpace; // colours are authored for the screen as-is
    this.camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.08, 2000);
    this.scene.add(this.sky);

    const tex = new THREE.DataArrayTexture(buildTextureStack(TEXTURE_NAMES), TEX, TEX, TEXTURE_NAMES.length);
    tex.format = THREE.RGBAFormat;
    tex.type = THREE.UnsignedByteType;
    tex.magFilter = THREE.NearestFilter;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; // falling water scrolls its texture
    tex.minFilter = THREE.NearestMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = Math.min(8, this.gl.capabilities.getMaxAnisotropy());
    tex.colorSpace = THREE.NoColorSpace;
    tex.needsUpdate = true;

    const uniforms = () => ({
      uTex: { value: tex },
      uTime: { value: 0 },
      uDaylight: { value: 1 },
      uSkyLight: { value: new THREE.Color(1, 1, 1) },
      uBlockLight: { value: BLOCK_LIGHT.clone() },
      uZenith: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uSunGlow: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uFogNear: { value: 120 },
      uFogFar: { value: 250 },
      uOpacity: { value: 1 },
      uSunDirV: { value: new THREE.Vector3(0, 1, 0) },
      uMist: { value: 0 },
      uMistColor: { value: new THREE.Color('#dfe8ec') },
      uValley: { value: new THREE.Vector3(1700, 1024, 100) },
      uCutout: { value: true },
    });
    this.solidMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: BLOCK_VERT, fragmentShader: BLOCK_FRAG, uniforms: uniforms(),
      stencilWrite: true, stencilRef: 1, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp,
    });
    this.waterMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: BLOCK_VERT, fragmentShader: BLOCK_FRAG, uniforms: uniforms(),
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    this.waterMat.uniforms.uCutout.value = false;
    this.creatures = new CreatureRenderer(this.scene, this.solidMat);

    // One index buffer shared by every chunk: quad k uses vertices 4k…4k+3.
    this.indexQuads = 1 << 17;
    const idx = new Uint32Array(this.indexQuads * 6);
    for (let q = 0, v = 0, i = 0; q < this.indexQuads; q++, v += 4) {
      idx[i++] = v; idx[i++] = v + 1; idx[i++] = v + 2;
      idx[i++] = v; idx[i++] = v + 2; idx[i++] = v + 3;
    }
    this.index = new THREE.BufferAttribute(idx, 1);

    const box = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004));
    this.outline = new THREE.LineSegments(box, new THREE.LineBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.55 }));
    this.outline.visible = false;
    this.scene.add(this.outline);
    this.particles.addTo(this.scene);

    // Cracks spreading over the block being mined, darkening it stage by stage.
    const crackTex = new THREE.DataArrayTexture(buildCrackStages(), TEX, TEX, 10);
    crackTex.magFilter = THREE.NearestFilter;
    crackTex.minFilter = THREE.NearestFilter;
    crackTex.needsUpdate = true;
    this.crack = new THREE.Mesh(new THREE.BoxGeometry(1.006, 1.006, 1.006), new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
      uniforms: { uCracks: { value: crackTex }, uStage: { value: 0 } },
      vertexShader: 'out vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'precision highp float; precision highp sampler2DArray; in vec2 vUv; uniform sampler2DArray uCracks; uniform float uStage; out vec4 outColor;' +
        'void main() { vec4 c = texture(uCracks, vec3(vUv.x, 1.0 - vUv.y, uStage)); if (c.a < 0.1) discard; outColor = vec4(c.rgb, 0.75); }',
    }));
    this.crack.visible = false;
    this.crack.renderOrder = 15;
    this.scene.add(this.crack);
    this.scene.add(this.bobber);
    this.scene.add(this.clouds.mesh);
    this.scene.add(this.tower.mesh);
    this.scene.add(this.smoke.mesh);
    this.scene.add(this.steam.mesh);
    this.scene.add(this.chimney.mesh);
    this.scene.add(this.flue.mesh);
    this.scene.add(this.glows.mesh);
    for (const m of this.birds.meshes) this.scene.add(m);
    this.scene.add(this.rain.mesh);
  }

  /**
   * Where the eye is: under water or not, and the world's light byte there. Under water everything is seen through
   * a few metres of blue-green (applySky), and bubbles rise round the swimmer (`lively`: not in still pictures).
   */
  setEye(underwater: boolean, lv: number, dt: number, lively: boolean): void {
    this.under = underwater;
    this.eyeLight = lv;
    if (underwater && lively && this.fx) {
      const c = this.camera.position;
      this.bubbleDebt += dt * 5;
      while (this.bubbleDebt >= 1) { this.bubbleDebt--; this.particles.bubble(c.x + (Math.random() - 0.5) * 7, c.y - 0.6 - Math.random() * 1.6, c.z + (Math.random() - 0.5) * 7); }
    }
  }
  private bubbleDebt = 0;

  /**
   * The sky as seen from under water: no sky at all, only the water's own colour, brighter where there is more
   * light at the eye (a noon pool is bright blue-green, the tunnel a lamp-lit murk, a pool at night nearly black).
   */
  private underwaterSky(s: SkyState): SkyState {
    const w = (this.waterSky ??= { ...s, zenith: new THREE.Color(), horizon: new THREE.Color(), sunGlow: new THREE.Color(0, 0, 0), skyLight: new THREE.Color(), fog: new THREE.Color(), mistColor: new THREE.Color() });
    const l = this.lightColor(this.eyeLight);
    const b = 0.62 + 0.38 * Math.min(1, Math.max(l.r, l.g, l.b));
    w.zenith.setRGB(0.1 * b, 0.5 * b, 0.56 * b);
    w.horizon.copy(w.zenith); w.fog.copy(w.zenith);
    w.skyLight.copy(s.skyLight).multiply(UNDERWATER_LIGHT);
    w.sunDir = s.sunDir; w.daylight = s.daylight; w.mist = 0;
    return w;
  }

  /** True while the browser has taken the picture away. */
  get contextLost(): boolean { return this.context.lost; }

  /**
   * After the context comes back. three.js r187 (WebGLRenderer.onContextRestore → initGLContext)
   * starts again with empty caches, so every geometry buffer, texture and shader is sent again from
   * the data still held here the next time it is drawn: nothing of ours needs rebuilding. Two things
   * it does not carry over are put back here: the clear colour (its new WebGLBackground starts at
   * black) and the viewport (only ever applied by setViewport or setRenderTarget).
   */
  private restore(): void {
    this.gl.setClearColor(this.clearColor);
    this.gl.setViewport(this.gl.getViewport(new THREE.Vector4()));
    this.gl.info.autoReset = false; // three makes a new counter with the new context: F3 counts the whole frame again
  }

  /** Looking through a telescope (docs/PHASE8.md, 5): the view narrowed `zoom` times, nothing nearer than `near` drawn. 1 puts it back. */
  setZoom(zoom: number, near = 0.08): void {
    const fov = (2 * Math.atan(Math.tan((BASE_FOV * Math.PI) / 360) / zoom) * 180) / Math.PI;
    if (Math.abs(this.camera.fov - fov) < 1e-6 && this.camera.near === near) return;
    this.camera.fov = fov;
    this.camera.near = near;
    // Through the glass the satellites are discs, not specks.
    if (this.sats) (this.sats.material as THREE.PointsMaterial).size = zoom > 1 ? 7 : 2.5;
    this.zoomed = zoom > 1;
    this.camera.updateProjectionMatrix();
  }

  /** The satellites crossing the night sky, as directions from the eye (none: nothing drawn). */
  setSats(dirs: [number, number, number][]): void {
    if (!this.sats) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SAT_COUNT * 3), 3));
      this.sats = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xfff6dc, size: this.zoomed ? 7 : 2.5, sizeAttenuation: false, fog: false, transparent: true, depthWrite: false }));
      this.sats.frustumCulled = false;
      // After the clouds (drawn at 5), or the night's cloud would paint them out; the land still hides them.
      this.sats.renderOrder = 6;
      this.scene.add(this.sats);
    }
    this.sats.visible = dirs.length > 0;
    if (!dirs.length) return;
    const a = this.sats.geometry.getAttribute('position') as THREE.BufferAttribute, c = this.camera.position;
    for (let i = 0; i < SAT_COUNT; i++) { const d = dirs[Math.min(i, dirs.length - 1)]; a.setXYZ(i, c.x + d[0] * SAT_FAR, c.y + d[1] * SAT_FAR, c.z + d[2] * SAT_FAR); }
    a.needsUpdate = true;
  }
  private sats: THREE.Points | null = null;
  private zoomed = false;

  resize(w: number, h: number): void {
    this.gl.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  setRenderDistance(blocks: number): void {
    this.fogDist = blocks;
    for (const m of [this.solidMat, this.waterMat]) {
      m.uniforms.uFogNear.value = FOG_NEAR;
      m.uniforms.uFogFar.value = FOG_FAR;
    }
  }

  setDrawnColumns(mask: Uint8Array): void {
    this.drawnMask.set(mask);
    this.farMaskAt = -1; // worked out again at the next frame
  }

  /** Where the distant land hides (src/render/farmask.ts): worked out again when the drawn columns change or the eye crosses into another column. */
  private updateFarMask(): void {
    const c = this.camera.position;
    const ecx = Math.floor(c.x / CS), ecz = Math.floor(c.z / CS);
    const at = ecz * COLS_X + ecx;
    if (at === this.farMaskAt) return;
    this.farMaskAt = at;
    const data = this.drawnTex.image.data as Uint8Array;
    hideFarLand(this.drawnMask, ecx, ecz, data);
    this.drawnTex.needsUpdate = true;
  }
  private drawnMask = new Uint8Array(COLS_X * COLS_Z);
  private farMaskAt = -1;

  /** The distant landscape, once a worker has built it. */
  setFarLand(m: FarMesh): void {
    this.farland = new FarLand(m, this.solidMat.uniforms.uTex.value, this.drawnTex);
    this.scene.add(this.farland.mesh);
  }

  applySky(s: SkyState, time: number): void {
    // Under water: the water's colour in place of the sky's, and a fog a few metres deep in place of the long haze.
    let fogNear = FOG_NEAR, fogFar = FOG_FAR;
    // Rain greys the sky and brings the haze in.
    fogFar = this.rain.weather(s, fogFar);
    if (this.under) { s = this.underwaterSky(s); fogNear = WATER_FOG_NEAR; fogFar = WATER_FOG_FAR; }
    applySky(this.sky, s);
    if (this.under) this.sky.material.uniforms.uDaylight.value = 1; // no stars or moon through the water
    this.clouds.mesh.visible = !this.under;
    for (const m of [this.solidMat, this.waterMat]) {
      const u = m.uniforms;
      u.uTime.value = time;
      u.uDaylight.value = s.daylight;
      u.uSkyLight.value.copy(s.skyLight);
      // Lamplight too loses its red under water: the tunnel's walls go from warm brown to green.
      u.uBlockLight.value.copy(BLOCK_LIGHT);
      if (this.under) u.uBlockLight.value.multiply(UNDERWATER_LAMP);
      u.uZenith.value.copy(s.zenith);
      u.uHorizon.value.copy(s.horizon);
      u.uSunGlow.value.copy(s.sunGlow);
      u.uSunDir.value.copy(s.sunDir);
      u.uSunDirV.value.copy(s.sunDir);
      u.uMist.value = s.mist;
      u.uMistColor.value.copy(s.mistColor);
      u.uFogNear.value = fogNear;
      u.uFogFar.value = fogFar;
    }
    this.gl.setClearColor(this.clearColor.copy(s.fog));
    this.particles.sync(this.gl.domElement.height, this.camera.fov, fogNear, fogFar, s);
    this.farland?.sync(s, fogNear, fogFar);
    this.tower.sync(s, fogNear, fogFar);
    this.smoke.sync(s, fogNear, fogFar, time);
    this.steam.sync(s, fogNear, fogFar, time);
    this.chimney.sync(s, fogNear, fogFar, time);
    this.flue.sync(s, fogNear, fogFar, time);
    this.clouds.sync(s, this.camera.position.x, this.camera.position.z, time, this.rain.level);
    // Under water a lamp's glow carries two and a half times as far as what it lights: the tunnel mouth's lamps show
    // from across the pool, as they did before there was any fog ("easy to find").
    this.glows.sync(s, fogNear, this.under ? fogFar * 2.5 : fogFar, time);
    this.birds.sync(s, fogNear, fogFar);
  }

  private makePart(part: MeshPart, mat: THREE.Material, key: number, cx: number, cy: number, cz: number): THREE.Mesh | undefined {
    if (part.quads === 0) return undefined;
    if (part.quads > this.indexQuads) throw new Error(`chunk ${key} has ${part.quads} quads, over the index buffer`);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(part.positions, 3));
    g.setAttribute('aPack', new THREE.BufferAttribute(part.pack, 4));
    g.setAttribute('aLayer', new THREE.BufferAttribute(part.layers, 1));
    g.setAttribute('aUv', new THREE.BufferAttribute(part.uvs, 2));
    g.setIndex(this.index);
    g.setDrawRange(0, part.quads * 6);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(CS / 2, CS / 2, CS / 2), CS * 0.87);
    g.boundingBox = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(CS, CS, CS));
    const m = new THREE.Mesh(g, mat);
    m.position.set(cx * CS, cy * CS, cz * CS);
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    this.scene.add(m);
    return m;
  }

  setChunkMesh(key: number, cx: number, cy: number, cz: number, mesh: ChunkMesh): void {
    this.removeChunk(key);
    const solid = this.makePart(mesh.solid, this.solidMat, key, cx, cy, cz);
    const water = this.makePart(mesh.water, this.waterMat, key, cx, cy, cz);
    if (water) water.renderOrder = 10;
    if (solid || water) this.meshes.set(key, { solid, water });
    this.glows.setChunk(key, cx, cy, cz, mesh.glows);
  }

  removeChunk(key: number): void {
    this.glows.removeChunk(key);
    const old = this.meshes.get(key);
    if (!old) return;
    for (const m of [old.solid, old.water]) {
      if (!m) continue;
      this.scene.remove(m);
      disposeChunkGeometry(m.geometry); // a plain dispose would delete the index every chunk shares
    }
    this.meshes.delete(key);
  }

  showOutline(x: number, y: number, z: number): void {
    this.outline.position.set(x + 0.5, y + 0.5, z + 0.5);
    this.outline.visible = true;
  }
  hideOutline(): void { this.outline.visible = false; }

  /** Shows the bobber floating at a point; `dip` pulls it under when a fish bites. null hides it. */
  showBobber(at: [number, number, number] | null, dip: number, time: number): void {
    this.bobber.visible = !!at;
    if (at) this.bobber.position.set(at[0], at[1] + Math.sin(time * 2.4) * 0.03 - dip * 0.12, at[2]);
  }

  /** Shows mining progress (0–1) as cracks on a block; 0 hides them. */
  showCrack(x: number, y: number, z: number, progress: number): void {
    this.crack.visible = progress > 0.02;
    this.crack.position.set(x + 0.5, y + 0.5, z + 0.5);
    this.crack.material.uniforms.uStage.value = Math.min(9, Math.floor(progress * 10));
  }

  render(): void {
    this.sky.position.copy(this.camera.position);
    let quads = 0;
    for (const v of this.meshes.values()) quads += (v.solid?.geometry.drawRange.count ?? 0) / 6 + (v.water?.geometry.drawRange.count ?? 0) / 6;
    this.stats.chunks = this.meshes.size;
    this.stats.quads = quads;
    this.updateFarMask();
    this.gl.info.reset();
    this.gl.render(this.scene, this.camera);
    this.hand.render(this.gl, this.camera.aspect);
  }

  /**
   * The light on something at a place, as the block shader lights a face there: the sky's light by the hour, or
   * the lamps', whichever is brighter. `lv` is the world's light byte (sky in the high half, lamps in the low).
   */
  lightColor(lv: number, out = this.scratchLight): THREE.Color {
    const curve = (l: number) => l / (2.2 - 1.2 * l);
    const u = this.solidMat.uniforms;
    const sky = curve((lv >> 4) / 15) * u.uDaylight.value, blk = curve((lv & 15) / 15);
    const s = u.uSkyLight.value as THREE.Color, b = u.uBlockLight.value as THREE.Color;
    return out.setRGB(Math.max(s.r * sky, b.r * blk, 0.06), Math.max(s.g * sky, b.g * blk, 0.06), Math.max(s.b * sky, b.b * blk, 0.06));
  }

  get renderDistance(): number { return this.fogDist; }
}
