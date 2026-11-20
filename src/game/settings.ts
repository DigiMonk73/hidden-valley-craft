// The player's settings, kept across sessions: what they are, their limits, and reading a saved copy that may be
// from an older build, or damaged (docs/PHASE9B.md, 2). Pure: the game applies them and the menu shows them.

/** The view distances the menu offers, in chunks of 32 m. 224 m keeps the whole valley at full detail from inside it. */
export const VIEW_CHUNKS = [4, 5, 7, 8, 10, 12];
/** How much of the screen's own sharpness the picture is drawn at: full, three quarters, half (a quarter of the pixels). */
export const SCALES = [1, 0.75, 0.5];
/** The view where the page must build the land on its own thread (workers blocked), unless the player chose one. */
export const FALLBACK_VIEW = 5;

export interface Settings {
  /** View distance, in chunks. */
  rd: number;
  /** The player picked the view distance in this build's menu (so a blocked-workers page does not shorten it). */
  rdOwn: boolean;
  /** Mouse sensitivity, 0.5–2.5 (1 is the default). */
  sens: number;
  /** Mouse up looks down. */
  inv: boolean;
  /** Sound volume, 0–1. */
  vol: number;
  /** Render scale: one of SCALES. */
  scale: number;
  /** Smoothed edges (anti-aliasing). Takes effect when the page is next opened. */
  aa: boolean;
  /** Make the picture lighter by itself when the game runs slowly. */
  auto: boolean;
  /** Effects that are only for show: glow, rain, birds (docs/PHASE9A.md). */
  fx: boolean;
  /**
   * Settings this build does not know, kept as they were read and written back unchanged: another branch's
   * setting (Track A's `fx`), or a later build's, survives a load and a save here.
   */
  others?: Record<string, boolean | number | string | object>;
}

export const DEFAULT_SETTINGS: Settings = { rd: 8, rdOwn: false, sens: 1, inv: false, vol: 0.8, scale: 1, aa: true, auto: true, fx: true };

/** The offered value nearest a wanted one (the higher of two equally near). */
function nearest(offered: number[], n: number): number {
  return offered.reduce((a, b) => (Math.abs(b - n) <= Math.abs(a - n) ? b : a));
}
export const nearestViewChunks = (n: number): number => nearest(VIEW_CHUNKS, n);
/**
 * A view distance as version 13 and before read it: its menu began at 224 m, and it took the nearer of two equally
 * near (the lower). Builds before it wrote 4 and 6, which version 13 opened as 224 m; read with today's list they
 * would be 128 m and 160 m. Settings written by this build always carry `rdOwn`, so a copy without it is read this
 * way and keeps the meaning the player last saw (the fresh review, 4).
 */
const V13_VIEWS = [7, 8, 10, 12];
const nearestV13 = (n: number): number => V13_VIEWS.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a));
export const nearestScale = (n: number): number => nearest([...SCALES].reverse(), n);

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Settings from a saved copy: anything missing, of the wrong kind or out of range takes its default or its limit. */
export function readSettings(raw: unknown): Settings {
  const s = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== 'object') return s;
  const r = raw as Record<string, unknown>;
  if (num(r.rd)) s.rd = typeof r.rdOwn === 'boolean' ? nearestViewChunks(r.rd) : nearestV13(r.rd);
  if (typeof r.rdOwn === 'boolean') s.rdOwn = r.rdOwn;
  if (num(r.sens)) s.sens = clamp(r.sens, 0.5, 2.5);
  if (typeof r.inv === 'boolean') s.inv = r.inv;
  if (num(r.vol)) s.vol = clamp(r.vol, 0, 1);
  if (num(r.scale)) s.scale = nearestScale(r.scale);
  if (typeof r.aa === 'boolean') s.aa = r.aa;
  if (typeof r.auto === 'boolean') s.auto = r.auto;
  if (typeof r.fx === 'boolean') s.fx = r.fx;
  const others: Record<string, boolean | number | string | object> = {};
  for (const [k, v] of Object.entries(r)) {
    if (k in DEFAULT_SETTINGS || k === 'others' || k.length > 40) continue;
    if (typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))) others[k] = v;
    else if (typeof v === 'string') others[k] = v.slice(0, 200);
    // (A later build's setting may be more than one value: kept whole while it is small; Track A's test asks this.)
    else if (v && typeof v === 'object' && JSON.stringify(v).length <= 2000) others[k] = v as object;
  }
  if (Object.keys(others).length) s.others = others;
  return s;
}

export function parseSettings(bytes: Uint8Array | null): Settings {
  if (!bytes) return { ...DEFAULT_SETTINGS };
  try { return readSettings(JSON.parse(new TextDecoder().decode(bytes))); } catch { return { ...DEFAULT_SETTINGS }; }
}

export function encodeSettings(s: Settings): Uint8Array {
  const { others, ...known } = s;
  return new TextEncoder().encode(JSON.stringify({ ...(others ?? {}), ...known }));
}
