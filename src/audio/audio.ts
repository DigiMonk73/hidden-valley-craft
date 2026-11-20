// All sound, made in code with Web Audio (no recordings to license): the waterfall's roar from where
// it falls, the creek, wind, birds by day and insects and frogs by night, and the player's own
// footsteps, digging and building. Starts on the first click, as browsers require.

import { blockName } from '../world/blocks.ts';

export type Material = 'stone' | 'soil' | 'grass' | 'sand' | 'wood' | 'leaves' | 'glass';

export function materialOf(id: number): Material {
  const n = blockName(id);
  if (n === 'grass' || n === 'forest_floor' || n === 'moss' || n === 'tall_grass' || n === 'fern') return 'grass';
  if (n === 'dirt' || n === 'clay' || n === 'mud') return 'soil';
  if (n === 'sand' || n === 'gravel') return 'sand';
  if (n === 'log' || n === 'planks' || n === 'tree_fern_trunk' || n === 'bamboo' || n === 'banana_trunk') return 'wood';
  if (n === 'leaves' || n === 'fern_fronds' || n === 'bromeliad' || n === 'orchid' || n === 'leaves_pale' || n === 'banana_leaves' || n === 'banana_bunch' || n.startsWith('vine')) return 'leaves';
  if (n === 'glass' || n === 'lantern') return 'glass';
  return 'stone';
}

export interface Listener {
  x: number; y: number; z: number;
  fx: number; fy: number; fz: number; // facing
  hour: number;
  inValley: boolean;
  open: number; // 0 (enclosed, a cave) … 1 (under open sky)
  underwater: boolean;
  creekDist: number; // metres to the creek or pool edge
  /** Where each waterfall is (the valley's, then the canyon's), and how loud it is there. */
  falls: { pos: [number, number, number]; loudness: number }[];
  /** The band of Zone-1 the listener is in (docs/PHASE5.md: the audio gradient), and whether the outpost is held. */
  band?: 'near' | 'mid' | 'deep' | 'other';
  raiders?: boolean;
}

/** Seconds a placed one-shot sound keeps its panner: the longest of them (the deep band's stinger) lasts under four. */
export const PLACED_LIFE = 8;

export class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private muffle!: BiquadFilterNode;
  private ambience!: GainNode;
  private sfx!: GainNode;
  private noise!: AudioBuffer;
  private brown!: AudioBuffer;
  private falls: { gain: GainNode; panner: PannerNode }[] = [];
  private creek!: GainNode;
  private wind!: GainNode;
  private crickets!: GainNode;
  private cave!: GainNode;
  private nextBird = 0;
  private nextFrog = 0;
  private nextOwl = 0;
  private nextBand = 0;
  private hum: { osc: OscillatorNode; gain: GainNode } | null = null;
  /**
   * The panners of short placed sounds, each with the audio time after which it is silent for good. A panner left
   * connected is never freed (an HRTF one holds convolvers): they piled up by the thousand in an hour's play, which
   * Safari and Firefox answer with crackling and then silence (docs/REVIEW.md, E1). `update` lets the spent ones go.
   */
  private placedSounds: { node: PannerNode; until: number }[] = [];
  volume = 0.8;
  muted = false;

  get started(): boolean { return !!this.ctx; }

  /** Call from a click: creates the audio graph and starts the ambient loops. */
  start(): void {
    if (this.ctx) { void this.ctx.resume(); return; }
    let ctx: AudioContext;
    try { ctx = new AudioContext(); } catch { return; }
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 20000;
    this.master.connect(this.muffle).connect(ctx.destination);
    this.ambience = ctx.createGain();
    this.sfx = ctx.createGain();
    this.ambience.connect(this.master);
    this.sfx.connect(this.master);
    this.noise = this.makeNoise(false);
    this.brown = this.makeNoise(true);

    // The waterfalls (the valley's and the canyon's): deep rumbling noise, each placed where its water falls.
    for (let k = 0; k < 2; k++) {
      const fallSrc = this.loop(this.brown);
      const fallBand = ctx.createBiquadFilter();
      fallBand.type = 'lowpass';
      fallBand.frequency.value = 1400 - k * 150;
      const fallHiss = this.loop(this.noise);
      const hissBand = ctx.createBiquadFilter();
      hissBand.type = 'bandpass'; hissBand.frequency.value = 2200 - k * 200; hissBand.Q.value = 0.6;
      const hissGain = ctx.createGain(); hissGain.gain.value = 0.18;
      const fallGain = ctx.createGain(); fallGain.gain.value = 0;
      const panner = new PannerNode(ctx, { panningModel: 'HRTF', distanceModel: 'inverse', refDistance: 14, rolloffFactor: 1, maxDistance: 600 });
      fallSrc.connect(fallBand).connect(fallGain);
      fallHiss.connect(hissBand).connect(hissGain).connect(fallGain);
      fallGain.connect(panner).connect(this.ambience);
      this.falls.push({ gain: fallGain, panner });
    }

    // The creek: a bright babble whose filter wanders.
    const creekSrc = this.loop(this.noise);
    const creekBand = ctx.createBiquadFilter();
    creekBand.type = 'bandpass'; creekBand.frequency.value = 1800; creekBand.Q.value = 1.2;
    const wobble = ctx.createOscillator(); wobble.frequency.value = 3.1;
    const wobbleDepth = ctx.createGain(); wobbleDepth.gain.value = 500;
    wobble.connect(wobbleDepth).connect(creekBand.frequency);
    wobble.start();
    this.creek = ctx.createGain(); this.creek.gain.value = 0;
    creekSrc.connect(creekBand).connect(this.creek).connect(this.ambience);

    // Wind: low and slow, swelling now and then; stronger up high and outside the valley.
    const windSrc = this.loop(this.brown);
    const windLow = ctx.createBiquadFilter(); windLow.type = 'lowpass'; windLow.frequency.value = 380;
    const gust = ctx.createOscillator(); gust.frequency.value = 0.07;
    const gustDepth = ctx.createGain(); gustDepth.gain.value = 0.35;
    this.wind = ctx.createGain(); this.wind.gain.value = 0;
    const windSwell = ctx.createGain(); windSwell.gain.value = 0.65;
    gust.connect(gustDepth).connect(windSwell.gain);
    gust.start();
    windSrc.connect(windLow).connect(windSwell).connect(this.wind).connect(this.ambience);

    // Crickets at night: a high tone pulsed fast, in chirping groups.
    const cricket = ctx.createOscillator(); cricket.frequency.value = 4700;
    const pulse = ctx.createOscillator(); pulse.type = 'square'; pulse.frequency.value = 26;
    const pulseDepth = ctx.createGain(); pulseDepth.gain.value = 0.5;
    const pulsed = ctx.createGain(); pulsed.gain.value = 0.5;
    pulse.connect(pulseDepth).connect(pulsed.gain);
    const group = ctx.createOscillator(); group.type = 'square'; group.frequency.value = 1.3;
    const groupDepth = ctx.createGain(); groupDepth.gain.value = 0.5;
    const grouped = ctx.createGain(); grouped.gain.value = 0.5;
    group.connect(groupDepth).connect(grouped.gain);
    this.crickets = ctx.createGain(); this.crickets.gain.value = 0;
    cricket.connect(pulsed).connect(grouped).connect(this.crickets).connect(this.ambience);
    cricket.start(); pulse.start(); group.start();

    // A cave's low room tone.
    const caveSrc = this.loop(this.brown);
    const caveLow = ctx.createBiquadFilter(); caveLow.type = 'lowpass'; caveLow.frequency.value = 120;
    this.cave = ctx.createGain(); this.cave.gain.value = 0;
    caveSrc.connect(caveLow).connect(this.cave).connect(this.master);
  }

  private makeNoise(brown: boolean): AudioBuffer {
    const ctx = this.ctx!;
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
    return buf;
  }

  private loop(buf: AudioBuffer): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.start(0, Math.random() * buf.duration);
    return src;
  }

  /** Silences everything while the game is paused or the page is hidden. */
  suspend(): void { void this.ctx?.suspend(); }
  resume(): void { void this.ctx?.resume(); }

  /** A short placed sound's panner, to be let go once the sound is over. */
  private placed(node: PannerNode): PannerNode {
    this.placedSounds.push({ node, until: this.ctx!.currentTime + PLACED_LIFE });
    return node;
  }

  /** How many placed sounds are still wired in (for the checks). */
  get placedCount(): number { return this.placedSounds.length; }

  /** Every frame: where the player is and what is around them. */
  update(l: Listener): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    // Placed sounds that are over are unwired (the audio clock stands still while paused, as the sounds do).
    if (this.placedSounds.length && this.placedSounds[0].until <= t) {
      let n = 0;
      while (n < this.placedSounds.length && this.placedSounds[n].until <= t) { try { this.placedSounds[n].node.disconnect(); } catch { /* already gone */ } n++; }
      this.placedSounds.splice(0, n);
    }
    const set = (p: AudioParam, v: number, tc = 0.25) => p.setTargetAtTime(v, t, tc);
    set(this.master.gain, this.muted ? 0 : this.volume, 0.05);
    set(this.muffle.frequency, l.underwater ? 500 : 20000, 0.08);

    const lis = ctx.listener;
    if (lis.positionX) {
      lis.positionX.setValueAtTime(l.x, t); lis.positionY.setValueAtTime(l.y, t); lis.positionZ.setValueAtTime(l.z, t);
      lis.forwardX.setValueAtTime(l.fx, t); lis.forwardY.setValueAtTime(l.fy, t); lis.forwardZ.setValueAtTime(l.fz, t);
      lis.upX.setValueAtTime(0, t); lis.upY.setValueAtTime(1, t); lis.upZ.setValueAtTime(0, t);
    } else {
      (lis as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(l.x, l.y, l.z);
      (lis as unknown as { setOrientation(...a: number[]): void }).setOrientation(l.fx, l.fy, l.fz, 0, 1, 0);
    }
    this.falls.forEach((f, k) => {
      const at = l.falls[k];
      if (!at) { set(f.gain.gain, 0); return; }
      const [fx, fy, fz] = at.pos;
      if (f.panner.positionX) {
        f.panner.positionX.value = fx; f.panner.positionY.value = fy; f.panner.positionZ.value = fz;
      } else (f.panner as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(fx, fy, fz);
      set(f.gain.gain, at.loudness);
    });

    // Outdoor sound fades inside a cave; the cave's own hum comes up instead.
    const open = 0.15 + 0.85 * l.open;
    set(this.ambience.gain, open);
    set(this.cave.gain, (1 - l.open) * 0.05);
    set(this.creek.gain, l.inValley ? 0.06 / (1 + l.creekDist / 5) : 0);
    const high = Math.min(1, Math.max(0, (l.y - 88) / 40));
    set(this.wind.gain, 0.03 + 0.12 * high + (l.inValley ? 0 : 0.06), 1);
    const night = l.hour > 19 || l.hour < 5 ? 1 : l.hour > 18.2 ? (l.hour - 18.2) / 0.8 : l.hour < 5.8 ? (5.8 - l.hour) / 0.8 : 0;
    set(this.crickets.gain, 0.012 * night, 1);

    // Birds by day (a dawn chorus first thing), tree frogs by night.
    const dawn = l.hour > 5.3 && l.hour < 8.5;
    const day = l.hour > 5.3 && l.hour < 18.4;
    // The audio gradient: thinner birdsong in the near band, none past it (DESIGN.md, Zone-1 per band).
    const birds = l.band === 'mid' || l.band === 'deep' ? 0 : l.band === 'near' ? 0.5 : 1;
    if (day && t > this.nextBird && birds > 0) {
      if (Math.random() < birds) this.bird(l);
      this.nextBird = t + (dawn ? 0.6 + Math.random() * 1.6 : 1.8 + Math.random() * 5);
    }
    // The mid band: a distant metal creak, and a raider's voice now and then while the outpost is held.
    // The deep band: silence, and far off, now and then, something organic and wrong.
    if ((l.band === 'mid' || l.band === 'deep') && t > this.nextBand) {
      if (l.band === 'mid') { if (l.raiders && Math.random() < 0.5) this.murmur(l); else this.creak(l); }
      else if (Math.random() < 0.35) this.stinger(Math.floor(Math.random() * 4), l.x - 80, l.y, l.z + (Math.random() - 0.5) * 80, 0.25);
      this.nextBand = t + 9 + Math.random() * 14;
    }
    if (night > 0.5 && t > this.nextFrog && l.band !== 'deep') {
      this.frog(l);
      this.nextFrog = t + 0.8 + Math.random() * 3;
    }
    // The owl at dusk: night is coming, and outside the valley night is when the puma hunts.
    if (l.hour > 17.7 && l.hour < 18.7 && t > this.nextOwl) {
      this.owl(l);
      this.nextOwl = t + 14 + Math.random() * 12;
    }
  }

  private owl(l: Listener): void {
    const t = this.ctx!.currentTime + 0.05;
    const p = this.around(l, 25, 60, 15);
    // Hoo, hoo-hoo, hooooo: soft, low, a little breathy.
    [[0, 0.32], [0.62, 0.16], [0.84, 0.16], [1.14, 0.75]].forEach(([d, len]) => {
      this.chirp(p, t + d, 400, 360, len, 0.09, 'sine');
      this.chirp(p, t + d, 800, 720, len * 0.8, 0.012, 'sine');
    });
  }

  /** A short sound placed around the listener. */
  private around(l: Listener, near: number, far: number, height: number): PannerNode {
    const a = Math.random() * Math.PI * 2, r = near + Math.random() * (far - near);
    const p = new PannerNode(this.ctx!, { panningModel: 'HRTF', distanceModel: 'inverse', refDistance: 6, rolloffFactor: 1,
      positionX: l.x + Math.cos(a) * r, positionY: l.y + height * Math.random(), positionZ: l.z + Math.sin(a) * r });
    p.connect(this.ambience);
    return this.placed(p);
  }

  private chirp(dest: AudioNode, at: number, f0: number, f1: number, dur: number, gain: number, type: OscillatorType = 'sine'): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, at);
    o.frequency.exponentialRampToValueAtTime(f1, at + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(gain, at + Math.min(0.015, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(dest);
    o.start(at);
    o.stop(at + dur + 0.02);
  }

  private bird(l: Listener): void {
    const t = this.ctx!.currentTime + 0.05;
    const p = this.around(l, 8, 45, 12);
    const kind = Math.random();
    if (kind < 0.3) { // tweet-tweet
      const f = 2800 + Math.random() * 1600, n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) this.chirp(p, t + i * 0.13, f, f * 1.35, 0.07, 0.05);
    } else if (kind < 0.55) { // a falling whistle
      let f = 3400 + Math.random() * 600;
      for (let i = 0; i < 3; i++) { this.chirp(p, t + i * 0.2, f, f * 0.94, 0.17, 0.04); f *= 0.82; }
    } else if (kind < 0.8) { // a trill
      const f = 3600 + Math.random() * 900, n = 7 + Math.floor(Math.random() * 6);
      for (let i = 0; i < n; i++) this.chirp(p, t + i * 0.045, i % 2 ? f : f * 1.08, f * 0.9, 0.04, 0.03);
    } else { // a dove: low, soft coo-coo-cooo
      const f = 520 + Math.random() * 80;
      [0, 0.45, 0.85].forEach((d, i) => this.chirp(p, t + d, f * (i === 2 ? 0.95 : 1.05), f * 0.92, i === 2 ? 0.7 : 0.32, 0.05, 'triangle'));
    }
  }

  private frog(l: Listener): void {
    const t = this.ctx!.currentTime + 0.05;
    const p = this.around(l, 6, 30, 2);
    const f = 2100 + Math.random() * 700, n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) this.chirp(p, t + i * 0.16, f * 0.85, f, 0.05, 0.035, 'triangle');
  }

  // ---- The player's own sounds ---------------------------------------------------------------

  private burst(dur: number, type: BiquadFilterType, freq: number, q: number, gain: number, at = 0): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t, Math.random() * 3, dur + 0.05);
  }

  private thump(freq: number, dur: number, gain: number, at = 0): void {
    if (!this.ctx) return;
    this.chirp(this.sfx, this.ctx.currentTime + at, freq, freq * 0.6, dur, gain);
  }

  footstep(m: Material): void {
    const v = 0.8 + Math.random() * 0.4;
    switch (m) {
      case 'stone': this.burst(0.05, 'highpass', 1800 * v, 0.7, 0.12); this.thump(140, 0.06, 0.12); break;
      case 'wood': this.thump(190 * v, 0.07, 0.2); this.burst(0.03, 'bandpass', 900, 1, 0.06); break;
      case 'sand': this.burst(0.11, 'bandpass', 2600 * v, 0.8, 0.09); break;
      case 'soil': this.burst(0.08, 'lowpass', 700 * v, 0.7, 0.18); break;
      case 'leaves': this.burst(0.1, 'bandpass', 3400 * v, 0.6, 0.08); break;
      case 'glass': this.burst(0.04, 'highpass', 3500, 1, 0.08); this.thump(300, 0.04, 0.08); break;
      default: this.burst(0.09, 'bandpass', 3000 * v, 0.6, 0.06); this.burst(0.07, 'lowpass', 500, 0.7, 0.12); // grass
    }
  }

  dig(m: Material): void {
    const v = 0.85 + Math.random() * 0.3;
    if (m === 'stone' || m === 'glass') { this.burst(0.06, 'bandpass', 2400 * v, 1.2, 0.16); this.thump(220, 0.05, 0.08); }
    else if (m === 'wood') { this.thump(240 * v, 0.06, 0.18); this.burst(0.04, 'bandpass', 1200, 1, 0.08); }
    else this.burst(0.08, 'lowpass', 1000 * v, 0.8, 0.16);
  }

  breakBlock(m: Material): void {
    if (m === 'stone') { this.burst(0.18, 'bandpass', 1500, 0.8, 0.22); this.burst(0.12, 'highpass', 3000, 0.7, 0.1, 0.03); this.thump(110, 0.12, 0.14); }
    else if (m === 'glass') { this.burst(0.25, 'highpass', 4000, 0.8, 0.18); this.chirp(this.sfx, this.ctx!.currentTime, 5200, 3800, 0.15, 0.06); }
    else if (m === 'wood') { this.thump(170, 0.12, 0.24); this.burst(0.1, 'bandpass', 900, 0.9, 0.12); }
    else this.burst(0.16, 'lowpass', 900, 0.7, 0.24);
  }

  place(m: Material): void {
    if (m === 'stone') { this.thump(170, 0.07, 0.2); this.burst(0.04, 'bandpass', 2000, 1, 0.08); }
    else if (m === 'wood') this.thump(210, 0.08, 0.22);
    else this.burst(0.07, 'lowpass', 800, 0.7, 0.18);
  }

  // ---- Outside: the gate, weapons and animals ----------------------------------------------------

  /** A sound source at a point in the world. */
  private at(x: number, y: number, z: number): PannerNode {
    const p = new PannerNode(this.ctx!, { panningModel: 'HRTF', distanceModel: 'inverse', refDistance: 4, rolloffFactor: 1.2, positionX: x, positionY: y, positionZ: z });
    p.connect(this.sfx);
    return this.placed(p);
  }

  private noiseAt(dest: AudioNode, at: number, dur: number, type: BiquadFilterType, freq: number, q: number, gain: number, attack = 0.005): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(gain, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(at, Math.random() * 3, dur + 0.05);
  }

  /** The gate's ritual: stone grinding on stone over a deep rumble. */
  gate(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.brown;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 260; f.Q.value = 0.9;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.25);
    g.gain.setValueAtTime(0.5, t + 1.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.1);
    // The grinding judders.
    const jud = ctx.createOscillator(); jud.frequency.value = 11;
    const judDepth = ctx.createGain(); judDepth.gain.value = 0.25;
    jud.connect(judDepth).connect(g.gain);
    jud.start(t); jud.stop(t + 2.2);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t, Math.random() * 2, 2.2);
    this.chirp(this.sfx, t, 46, 38, 2.0, 0.35);
    this.noiseAt(this.sfx, t + 0.1, 1.8, 'highpass', 2600, 0.7, 0.05, 0.3);
  }

  /** The slab settling: a heavy thud. */
  thud(): void { this.thump(70, 0.35, 0.4); this.burst(0.2, 'lowpass', 400, 0.7, 0.2); }

  bowDraw(): void { if (this.ctx) this.chirp(this.sfx, this.ctx.currentTime, 180, 260, 0.35, 0.05, 'sawtooth'); }
  bowRelease(): void { this.thump(130, 0.12, 0.3); this.burst(0.08, 'bandpass', 1800, 2, 0.12); }

  /** The rifle: a sharp crack, then the canyon throwing it back. */
  rifle(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.noiseAt(this.sfx, t, 0.25, 'lowpass', 5000, 0.5, 0.9, 0.001);
    this.chirp(this.sfx, t, 120, 50, 0.3, 0.6);
    for (const [d, g] of [[0.35, 0.18], [0.7, 0.09], [1.2, 0.05]]) this.noiseAt(this.sfx, t + d, 0.5, 'lowpass', 900, 0.6, g, 0.02);
  }

  /** An arrow or a blow landing on an animal. */
  hit(x: number, y: number, z: number): void {
    if (!this.ctx) return;
    const p = this.at(x, y, z);
    this.chirp(p, this.ctx.currentTime, 160, 90, 0.09, 0.4);
    this.noiseAt(p, this.ctx.currentTime, 0.06, 'bandpass', 1200, 1, 0.2);
  }

  /** Leaves thrashing as an animal bolts. */
  rustle(x: number, y: number, z: number): void {
    if (!this.ctx) return;
    const p = this.at(x, y, z), t = this.ctx.currentTime;
    for (let i = 0; i < 4; i++) this.noiseAt(p, t + i * 0.09 + Math.random() * 0.04, 0.14, 'bandpass', 3000 + Math.random() * 1500, 0.7, 0.18);
  }

  /** A wild boar's grunt. */
  grunt(x: number, y: number, z: number): void {
    if (!this.ctx) return;
    const p = this.at(x, y, z), t = this.ctx.currentTime;
    for (let i = 0; i < 2; i++) {
      this.chirp(p, t + i * 0.22, 110, 80, 0.16, 0.5, 'sawtooth');
      this.noiseAt(p, t + i * 0.22, 0.15, 'lowpass', 500, 0.8, 0.3);
    }
  }

  /** The puma's low growl before it lunges. */
  growl(x: number, y: number, z: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const p = this.at(x, y, z), t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(70, t); o.frequency.linearRampToValueAtTime(95, t + 0.6);
    const trem = ctx.createOscillator(); trem.frequency.value = 23;
    const tremDepth = ctx.createGain(); tremDepth.gain.value = 0.3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.35, t + 0.1); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600;
    trem.connect(tremDepth).connect(g.gain);
    o.connect(lp).connect(g).connect(p);
    o.start(t); o.stop(t + 0.85); trem.start(t); trem.stop(t + 0.85);
  }

  // ---- Zone-1's near band (docs/PHASE4.md) ----------------------------------------------------

  /** A feral dog's bark: two or three short, rough, falling barks. */
  bark(x: number, y: number, z: number): void {
    if (!this.ctx) return;
    const p = this.at(x, y, z), t = this.ctx.currentTime;
    const n = 2 + Math.floor(Math.random() * 2), f = 420 + Math.random() * 120;
    for (let i = 0; i < n; i++) {
      this.chirp(p, t + i * 0.26, f, f * 0.55, 0.13, 0.35, 'sawtooth');
      this.noiseAt(p, t + i * 0.26, 0.1, 'bandpass', 900, 1.2, 0.25);
    }
  }

  /** A dog's or coyote's snarl as it crouches to spring: the warning to step back. */
  snarl(x: number, y: number, z: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const p = this.at(x, y, z), t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(140, t); o.frequency.linearRampToValueAtTime(190, t + 0.45);
    const trem = ctx.createOscillator(); trem.frequency.value = 31;
    const depth = ctx.createGain(); depth.gain.value = 0.25;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.3, t + 0.06); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 0.8;
    trem.connect(depth).connect(g.gain);
    o.connect(bp).connect(g).connect(p);
    o.start(t); o.stop(t + 0.6); trem.start(t); trem.stop(t + 0.6);
  }

  /** Coyotes: a run of high yips rising into a short howl. */
  yip(x: number, y: number, z: number): void {
    if (!this.ctx) return;
    const p = this.at(x, y, z), t = this.ctx.currentTime;
    for (let i = 0; i < 5; i++) this.chirp(p, t + i * 0.11, 900 + i * 60, 1300 + i * 80, 0.08, 0.12, 'triangle');
    this.chirp(p, t + 0.6, 700, 1150, 0.9, 0.1, 'triangle');
  }

  /** A hen's cluck: soft, low and broken. */
  cluck(x: number, y: number, z: number): void {
    if (!this.ctx) return;
    const p = this.at(x, y, z), t = this.ctx.currentTime;
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) this.chirp(p, t + i * 0.16, 520 + Math.random() * 80, 380, 0.07, 0.12, 'square');
  }

  /** The pistol: a flatter, shorter crack than the rifle. */
  pistol(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.noiseAt(this.sfx, t, 0.16, 'lowpass', 4200, 0.5, 0.7, 0.001);
    this.chirp(this.sfx, t, 180, 70, 0.18, 0.45);
    this.noiseAt(this.sfx, t + 0.3, 0.4, 'lowpass', 800, 0.6, 0.08, 0.02);
  }

  /** Marco's greeting: a two-note whistle. */
  whistle(x: number, y: number, z: number): void {
    if (!this.ctx) return;
    const p = this.at(x, y, z), t = this.ctx.currentTime;
    this.chirp(p, t, 1500, 1700, 0.18, 0.14);
    this.chirp(p, t + 0.24, 1900, 1250, 0.3, 0.14);
  }

  /**
   * Rain (docs/PHASE9A.md, 7): a steady hiss, by how hard it falls (0–1) and how open the place is (in the cave it is
   * a murmur from the mouth). Made the first time it rains; silent between showers.
   */
  rain(level: number, open: number): void {
    const ctx = this.ctx;
    if (!ctx || (!this.rainGain && level <= 0)) return;
    if (!this.rainGain) {
      const src = this.loop(this.noise);
      const band = ctx.createBiquadFilter(); band.type = 'bandpass'; band.frequency.value = 2600; band.Q.value = 0.45;
      this.rainGain = ctx.createGain(); this.rainGain.gain.value = 0;
      src.connect(band).connect(this.rainGain).connect(this.ambience);
    }
    // Only when it changes: a new target every frame would pile up on the gain's timeline for the whole session.
    const want = Math.round(level * (0.05 + 0.2 * open) * 200) / 200;
    if (want === this.rainWant) return;
    this.rainWant = want;
    this.rainGain.gain.setTargetAtTime(want, ctx.currentTime, 0.4);
  }
  private rainGain: GainNode | null = null;
  private rainWant = 0;

  /** The quetzal's call from its tree (docs/PHASE9A.md, 6): two soft whistles, each falling. */
  quetzal(x: number, y: number, z: number): void {
    if (!this.ctx) return;
    const p = this.at(x, y, z), t = this.ctx.currentTime;
    this.chirp(p, t, 1180, 840, 0.3, 0.16);
    this.chirp(p, t + 0.46, 1120, 790, 0.34, 0.14);
  }

  /** Doves bursting up off the ground: a clatter of wings. */
  flutter(x: number, y: number, z: number): void {
    if (!this.ctx) return;
    const p = this.at(x, y, z), t = this.ctx.currentTime;
    for (let k = 0; k < 6; k++) this.noiseAt(p, t + k * 0.07, 0.05, 'bandpass', 1300 + k * 90, 1.2, 0.1 - k * 0.012);
  }

  /** A blow landing on the player. */
  hurt(): void { this.thump(90, 0.18, 0.5); this.burst(0.12, 'lowpass', 700, 0.7, 0.3); }

  splash(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(3500, t);
    f.frequency.exponentialRampToValueAtTime(300, t + 0.4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.3, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t, Math.random() * 3, 0.5);
  }

  // ---- Zone-1's mid and deep bands (docs/PHASE5.md) --------------------------------------------------

  /** A raider shouting the alarm: two rough syllables. */
  shout(x: number, y: number, z: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const p = this.at(x, y, z), t = ctx.currentTime;
    for (const [d, f0, f1, len] of [[0, 230, 260, 0.16], [0.2, 260, 170, 0.3]]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(f0, t + d); o.frequency.linearRampToValueAtTime(f1, t + d + len);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t + d); g.gain.linearRampToValueAtTime(0.5, t + d + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + d + len);
      // Two formants make it a voice, not a horn.
      for (const [fq, q] of [[700, 6], [1150, 8]]) {
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = fq; bp.Q.value = q;
        o.connect(bp).connect(g);
      }
      g.connect(p);
      o.start(t + d); o.stop(t + d + len + 0.05);
    }
  }

  /** A rifle's bolt worked, or a pistol cocked: the warning that a shot is coming. */
  click(x: number, y: number, z: number): void {
    if (!this.ctx) return;
    const p = this.at(x, y, z), t = this.ctx.currentTime;
    this.noiseAt(p, t, 0.04, 'highpass', 3500, 1, 0.5);
    this.noiseAt(p, t + 0.12, 0.05, 'bandpass', 2400, 3, 0.45);
  }

  /** A raider's shot, from where he stands: the rifle a deep crack, the pistol a flatter bang. */
  enemyShot(x: number, y: number, z: number, heavy: boolean): void {
    if (!this.ctx) return;
    const p = this.at(x, y, z), t = this.ctx.currentTime;
    this.noiseAt(p, t, heavy ? 0.3 : 0.18, 'lowpass', heavy ? 4200 : 3000, 0.5, heavy ? 1.6 : 1.1, 0.001);
    this.chirp(p, t, heavy ? 110 : 160, 50, 0.25, heavy ? 0.9 : 0.6);
    for (const [d, g] of [[0.4, 0.15], [0.8, 0.07]]) this.noiseAt(this.sfx, t + d, 0.5, 'lowpass', 900, 0.6, g, 0.02);
  }

  /** A bullet passing close: a quick tearing zip. */
  zip(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.noiseAt(this.sfx, t, 0.09, 'highpass', 5000, 0.8, 0.35, 0.002);
    this.chirp(this.sfx, t, 2600, 900, 0.1, 0.06, 'sawtooth');
  }

  /** A bullet striking cover: a whine off the stone. */
  ricochet(x: number, y: number, z: number): void {
    if (!this.ctx) return;
    const p = this.at(x, y, z), t = this.ctx.currentTime;
    this.noiseAt(p, t, 0.05, 'bandpass', 1800, 1, 0.5);
    this.chirp(p, t + 0.02, 2600, 1300, 0.35, 0.12, 'sine');
  }

  /** A machete raised and swung: a rising whoosh. */
  swing(x: number, y: number, z: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const p = this.at(x, y, z), t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2;
    f.frequency.setValueAtTime(500, t); f.frequency.exponentialRampToValueAtTime(2600, t + 0.3);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.4, t + 0.25); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    src.connect(f).connect(g).connect(p);
    src.start(t, Math.random() * 2, 0.45);
  }

  /** The jaguar's call: a deep sawing cough, five or six strokes. */
  jaguarCall(x: number, y: number, z: number): void {
    if (!this.ctx) return;
    const p = this.at(x, y, z), t = this.ctx.currentTime;
    const n = 5 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
      const at = t + i * 0.42, f = 95 - i * 4;
      this.chirp(p, at, f, f * 0.7, 0.22, 0.55, 'sawtooth');
      this.noiseAt(p, at, 0.2, 'bandpass', 380, 1.5, 0.3, 0.02);
    }
  }

  /**
   * The deep band's stinger: distant, organic and wrong. Four variations of one family, differing in
   * pitch, distance and timbre (DESIGN.md: variations on a theme, not different things out there).
   */
  stinger(variant: number, x: number, y: number, z: number, gain = 0.5): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const p = new PannerNode(ctx, { panningModel: 'HRTF', distanceModel: 'inverse', refDistance: 12, rolloffFactor: 0.6, positionX: x, positionY: y, positionZ: z });
    p.connect(this.ambience);
    this.placed(p);
    const t = ctx.currentTime;
    const base = [70, 92, 58, 110][variant & 3], len = [2.2, 1.6, 2.8, 1.9][variant & 3];
    // A throat that isn't quite one: a low voice bending down and catching, with a wet rasp over it.
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(base * 1.6, t);
    o.frequency.exponentialRampToValueAtTime(base, t + len * 0.45);
    o.frequency.exponentialRampToValueAtTime(base * (variant === 2 ? 0.6 : 1.3), t + len);
    const wob = ctx.createOscillator(); wob.frequency.value = [7, 13, 4, 19][variant & 3];
    const wd = ctx.createGain(); wd.gain.value = base * 0.18;
    wob.connect(wd).connect(o.frequency);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = [420, 600, 300, 760][variant & 3]; bp.Q.value = 3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.4); g.gain.setValueAtTime(gain, t + len * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(bp).connect(g).connect(p);
    o.start(t); o.stop(t + len + 0.1); wob.start(t); wob.stop(t + len + 0.1);
    this.noiseAt(p, t + len * 0.3, len * 0.5, 'bandpass', 1400 + 300 * (variant & 3), 4, gain * 0.25, 0.2);
    if (variant === 1) for (let i = 0; i < 5; i++) this.noiseAt(p, t + len * 0.6 + i * 0.07, 0.03, 'highpass', 3000, 1, gain * 0.3);
  }

  /** Focus mode: a low hum under everything while time is slowed. */
  focus(on: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    if (on && !this.hum) {
      const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = 55;
      const gain = ctx.createGain(); gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(0.12, t + 0.3);
      osc.connect(gain).connect(this.sfx); osc.start(t);
      this.hum = { osc, gain };
      this.chirp(this.sfx, t, 600, 140, 0.4, 0.08);
    } else if (!on && this.hum) {
      const h = this.hum; this.hum = null;
      h.gain.gain.setTargetAtTime(0, t, 0.1); h.osc.stop(t + 0.6);
      this.chirp(this.sfx, t, 140, 500, 0.3, 0.05);
    }
  }

  /** A raider's voice from the outpost, too far to make out. */
  private murmur(l: Listener): void {
    const p = this.around(l, 30, 60, 3), t = this.ctx!.currentTime + 0.05;
    for (let i = 0; i < 4 + Math.floor(Math.random() * 4); i++) this.chirp(p, t + i * 0.18, 180 + Math.random() * 60, 150, 0.14, 0.05, 'sawtooth');
  }

  /** Corrugated metal creaking in the wind, somewhere off. */
  private creak(l: Listener): void {
    const p = this.around(l, 25, 70, 6), t = this.ctx!.currentTime + 0.05;
    this.chirp(p, t, 320, 260, 0.9, 0.035, 'sawtooth');
    this.chirp(p, t + 0.95, 280, 340, 0.6, 0.025, 'sawtooth');
  }

  /**
   * The Geiger counter (docs/PHASE6.md, 3): random dry clicks and a faint hiss, quickening with `rate`
   * (0 out of earshot … 1 at a hotspot's heart). Called every frame with the frame's seconds.
   */
  geiger(rate: number, dt: number): void {
    if (!this.ctx || rate <= 0) return;
    const clicks = rate * rate * 60 * dt + 1.5 * rate * dt; // clicks expected this frame
    for (let n = clicks; n > 0; n--) if (Math.random() < Math.min(1, n)) this.burst(0.012, 'highpass', 4200, 0.8, 0.22 + 0.2 * rate, Math.random() * dt);
    if (Math.random() < dt * 2) this.burst(0.5, 'highpass', 6000, 0.5, 0.025 * rate);
  }

  /** The modem's handshake when the link opens: a carrier, two warbling tones, a hiss, a settled note. */
  modem(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime, out = this.ambience;
    this.chirp(out, t, 1070, 1070, 0.5, 0.05);
    this.chirp(out, t + 0.5, 1270, 2025, 0.35, 0.05, 'square');
    this.chirp(out, t + 0.9, 2225, 1180, 0.4, 0.04, 'square');
    this.burst(0.7, 'bandpass', 2400, 1.2, 0.1, 1.3);
    this.chirp(out, t + 2.0, 1650, 1650, 0.9, 0.04);
  }

  /** A sonic lure's wail, from where it stands: two rising sweeps, a second apart. */
  lure(x: number, y: number, z: number): void {
    if (!this.ctx) return;
    const p = this.at(x, y, z), t = this.ctx.currentTime;
    this.chirp(p, t, 520, 1500, 0.8, 0.22, 'sawtooth');
    this.chirp(p, t + 0.9, 520, 1500, 0.8, 0.22, 'sawtooth');
  }

  /** A smoke pot catching: a hiss. */
  hiss(x: number, y: number, z: number): void {
    if (!this.ctx) return;
    this.noiseAt(this.at(x, y, z), this.ctx.currentTime, 1.4, 'highpass', 2600, 0.6, 0.25, 0.08);
  }

  /** The relay tower's beacon: a slow relay tick, from the top of the frame. */
  beacon(x: number, y: number, z: number): void {
    if (!this.ctx) return;
    const p = this.at(x, y, z), t = this.ctx.currentTime;
    this.noiseAt(p, t, 0.03, 'bandpass', 1800, 6, 0.5);
    this.chirp(p, t, 240, 236, 0.5, 0.05);
  }

  /** A machine at home: the rig's fans, the fridge's compressor, the pump. A short positioned hum. */
  machine(x: number, y: number, z: number, freq: number, gain: number): void {
    if (!this.ctx) return;
    this.chirp(this.at(x, y, z), this.ctx.currentTime, freq, freq * 1.02, 1.1, gain, 'sawtooth');
  }

  /** The hearth: a pop or two of burning wood, from where it is. */
  crackle(x: number, y: number, z: number): void {
    if (!this.ctx) return;
    const p = this.at(x, y, z), t = this.ctx.currentTime;
    const pops = Math.random() < 0.3 ? 3 : 1;
    for (let i = 0; i < pops; i++) this.noiseAt(p, t + i * (0.04 + Math.random() * 0.08), 0.02 + Math.random() * 0.03, 'highpass', 1800 + Math.random() * 2600, 1, 0.1 + Math.random() * 0.16, 0.002);
    if (Math.random() < 0.15) this.noiseAt(p, t, 0.5, 'lowpass', 500, 0.7, 0.05, 0.15); // a log settling
  }

  /** The hot spring: bubbling under steam, from where it is. */
  bubble(x: number, y: number, z: number): void {
    if (!this.ctx) return;
    const p = this.at(x, y, z), t = this.ctx.currentTime;
    for (let i = 0; i < 3 + Math.floor(Math.random() * 4); i++) this.chirp(p, t + i * 0.09 + Math.random() * 0.05, 300 + Math.random() * 500, 700 + Math.random() * 400, 0.05, 0.06);
    this.noiseAt(p, t, 0.9, 'highpass', 2500, 0.6, 0.05, 0.2);
  }

  // ---- Zone-3 (docs/PHASE7.md): the Ashen's voice, in the deep band's stinger's family ---------------------

  /** A throat that isn't quite one: a voice from `f0` to `f1` with a rattle through it, from where it is. */
  private ashenVoice(x: number, y: number, z: number, f0: number, f1: number, len: number, gain: number, rattle: number): void {
    const ctx = this.ctx!;
    const p = this.at(x, y, z), t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + len);
    const trem = ctx.createOscillator(); trem.type = 'square'; trem.frequency.setValueAtTime(rattle, t); trem.frequency.linearRampToValueAtTime(rattle * 1.8, t + len);
    const depth = ctx.createGain(); depth.gain.value = gain * 0.6;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.setValueAtTime(f0 * 3, t); bp.frequency.exponentialRampToValueAtTime(f1 * 3, t + len); bp.Q.value = 2.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + Math.min(0.08, len * 0.3)); g.gain.setValueAtTime(gain, t + len * 0.8); g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.1);
    trem.connect(depth).connect(g.gain);
    o.connect(bp).connect(g).connect(p);
    o.start(t); o.stop(t + len + 0.15); trem.start(t); trem.stop(t + len + 0.15);
    this.noiseAt(p, t, len, 'bandpass', 1500, 3, gain * 0.35, 0.05);
  }

  /** An Ashen standing unaware: a dry, rattling breath. The warning that one is near. */
  ashenBreath(x: number, y: number, z: number): void {
    if (!this.ctx) return;
    const p = this.at(x, y, z), t = this.ctx.currentTime;
    for (let i = 0; i < 9; i++) this.noiseAt(p, t + i * 0.075 + Math.random() * 0.02, 0.05, 'bandpass', 900 + i * 40, 3, 0.07 + 0.01 * i, 0.01);
    this.noiseAt(p, t + 0.75, 0.6, 'bandpass', 700, 1.5, 0.05, 0.2);
  }

  /** A bare foot on the road as it runs at you: a soft slap, quicker and harder when it is keen. */
  ashenStep(x: number, y: number, z: number, keen: boolean): void {
    if (!this.ctx) return;
    const p = this.at(x, y, z), t = this.ctx.currentTime;
    this.noiseAt(p, t, 0.05, 'lowpass', keen ? 520 : 340, 0.9, keen ? 0.2 : 0.12);
    this.noiseAt(p, t + 0.012, 0.03, 'bandpass', 1900, 2, keen ? 0.07 : 0.04);
  }

  /** It has noticed something: a short, climbing rattle. */
  ashenNotice(x: number, y: number, z: number): void {
    if (!this.ctx) return;
    this.ashenVoice(x, y, z, 95, 170, 0.5, 0.3, 14);
  }

  /** The lunge's warning: a rising, rattling shriek while it rears. Step back. */
  ashenShriek(x: number, y: number, z: number, keen: boolean): void {
    if (!this.ctx) return;
    this.ashenVoice(x, y, z, keen ? 240 : 190, keen ? 640 : 520, keen ? 0.55 : 0.75, 0.5, 22);
  }

  /** The lunge itself: a rush of air; and after a miss, the stumble. */
  ashenLunge(x: number, y: number, z: number): void {
    if (!this.ctx) return;
    this.noiseAt(this.at(x, y, z), this.ctx.currentTime, 0.28, 'bandpass', 800, 0.8, 0.35, 0.03);
  }
  ashenMiss(x: number, y: number, z: number): void {
    if (!this.ctx) return;
    const p = this.at(x, y, z), t = this.ctx.currentTime;
    this.chirp(p, t, 90, 55, 0.2, 0.4);
    this.noiseAt(p, t + 0.05, 0.3, 'lowpass', 500, 0.8, 0.2);
  }
}
