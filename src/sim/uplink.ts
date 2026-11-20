// The uplink (docs/PHASE8.md, 6): what the builder's computer asks of the thing that still runs the satellites,
// and what comes back. It never speaks. Every answer is rows of capitals, numbers, coordinates and times, and
// diagrams drawn in characters: no sentence, no name for itself, no greeting. Each answer sets a flag, and the
// flag changes something in the game (the map table, a warning chip, the clock, a recipe). Pure.

import { ZONE3, ZONE4, VALLEY, PLACES, falloutAt, ridgeRoadLength, ridgeRoadPoint, inFallout } from '../gen/layout.ts';
import { NESTS } from '../entity/ashen.ts';
import { RECIPES, STATION_LABEL } from './crafting.ts';
import { itemLabel } from '../world/items.ts';

export type QueryId = 'END' | 'RAD' | 'BIO' | 'EPH' | 'SCH';

/** What the link needs, each a thing the player has built and can see. */
export interface LinkNeeds { antenna: boolean; telescope: boolean; hydro: boolean; terminal: boolean }

/** The uplink page's list: each need in the builder's own software's words, with a tick. */
export function linkStatus(n: LinkNeeds): { label: string; ok: boolean; how: string }[] {
  return [
    { label: 'ANTENNA', ok: n.antenna, how: 'The satellite antenna, hoisted to the cliff from the balcony.' },
    { label: 'OPTICS', ok: n.telescope, how: 'A telescope standing under open sky at home.' },
    { label: 'POWER', ok: n.hydro, how: 'A hydro generator turning in the creek: the link needs power day and night.' },
    { label: 'TERMINAL', ok: n.terminal, how: 'The uplink terminal, fitted to this computer.' },
  ];
}
export const linkReady = (n: LinkNeeds): boolean => n.antenna && n.telescope && n.hydro && n.terminal;

/** One answer: a heading, rows of fixed-width text, and the flags it sets. */
export interface Answer { head: string; rows: string[]; sets: string[] }

/** The clock the uplink keeps: whole game days since the save began, and the hour of the day. */
export interface LinkClock { day: number; hour: number }
const hours = (c: LinkClock) => c.day * 24 + c.hour;
const hhmm = (h: number) => { const m = Math.round((((h % 24) + 24) % 24) * 60) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
const pad = (v: string | number, w: number) => String(v).padStart(w);
const col = (v: string, w: number) => v.padEnd(w);

/** The handshake's lines, shown one after another the first time the link opens. */
export const HANDSHAKE = ['CARRIER      ....  FOUND', 'LOCK         ....  3 OF 3', 'KEY          ....  ACCEPTED', 'LINK         ....  UP'];

/** The Event, in days before the save began: eight years. */
const EVENT_DAYS = 2922;
/** The valley, from where every bearing and range is taken. */
const HERE = { x: VALLEY.cx, z: VALLEY.cz };
/** Bearing (degrees from north, clockwise) and range (km) from the valley to a point in the world. */
export function bearingTo(x: number, z: number, from = HERE): { brg: number; km: number } {
  const dx = x - from.x, dz = z - from.z;
  return { brg: (Math.round((Math.atan2(dx, -dz) * 180) / Math.PI) + 360) % 360, km: Math.hypot(dx, dz) / 1000 };
}

interface Endpoint { id: string; brg: number; km: number; last: number; state: 'LINK' | 'ACTIVE' | 'SILENT' | 'BEACON REPEATING' }
/**
 * Every handset the satellites have heard, as rows. Three answer (the trader's, the doctor's, the
 * engineer's); this one; five that stopped within days of each other at the Event, two of them at one
 * place on the coast road two days apart (Lucía's, and the builder's own second handset); and one nobody
 * has on the phone, far to the north, a beacon repeating. `last`: days since the last fix.
 */
export function endpointList(c: LinkClock): Endpoint[] {
  const since = (d: number) => EVENT_DAYS + c.day - d;
  const marco = bearingTo(1112, 1020), ray = bearingTo(-5200, -900), doc = bearingTo(-1300, -13400);
  return [
    { id: 'HV-01', brg: 0, km: 0, last: 0, state: 'LINK' },
    { id: 'SP-4471 MARCO', ...marco, last: 0, state: 'ACTIVE' },
    { id: 'SP-2210 IBANEZ-DR', ...doc, last: 0, state: 'ACTIVE' },
    { id: 'SP-0932 QUISPE-R', ...ray, last: 0, state: 'ACTIVE' },
    { id: 'MIRA-7', brg: 4, km: 212.4, last: 0, state: 'BEACON REPEATING' },
    { id: 'SP-1180 MAMA', brg: 151, km: 388.0, last: since(-3), state: 'SILENT' },
    { id: 'SP-1204 ALVAREZ-DR', brg: 139, km: 402.7, last: since(-2), state: 'SILENT' },
    { id: 'SP-1377 RAUL-P', brg: 97, km: 74.9, last: since(-1), state: 'SILENT' },
    { id: 'SP-1002 LUCIA', brg: 96, km: 61.3, last: since(0), state: 'SILENT' },
    { id: 'HV-02', brg: 96, km: 61.3, last: since(2), state: 'SILENT' },
  ];
}

/** The first answer, which comes unasked when the link opens, and again for the query END. */
export function endpoints(c: LinkClock): Answer {
  const rows = [`${col('ID', 20)}${pad('BRG', 5)}${pad('RNG KM', 9)}${pad('LAST FIX D', 12)}  STATE`];
  for (const e of endpointList(c)) rows.push(`${col(e.id, 20)}${pad(e.km ? String(e.brg).padStart(3, '0') : '---', 5)}${pad(e.km.toFixed(1), 9)}${pad(e.last, 12)}  ${e.state}`);
  return { head: 'ENDPOINTS HEARD · LAST 3000 D', rows, sets: ['agi_end'] };
}

/** The dose over the ridge on a 25 m grid (dose a second, no suit), and the least-dose line as coordinates. */
export function radMap(): Answer {
  const X0 = 330, Z0 = 350, CELL = 25, NX = 12, NZ = 10;
  const rows = [`GRID ${CELL} M · ORIGIN ${X0}E ${Z0}N · DOSE/S UNSHIELDED`, `${col('N\\E', 6)}${Array.from({ length: NX }, (_, i) => pad(X0 + i * CELL, 5)).join('')}`];
  for (let j = 0; j < NZ; j++) {
    let r = col(String(Z0 + j * CELL), 6);
    for (let i = 0; i < NX; i++) r += pad(Math.round(falloutAt(X0 + i * CELL + CELL / 2, Z0 + j * CELL + CELL / 2)), 5);
    rows.push(r);
  }
  // The road, where it lies under the fallout: its points, a row of four at a time.
  const path: string[] = [];
  for (let s = 0; s <= ridgeRoadLength(); s += 30) { const [x, z] = ridgeRoadPoint(s); if (inFallout(x, z)) path.push(`${Math.round(x)}E ${Math.round(z)}N`); }
  const [ex, ez] = ridgeRoadPoint(ridgeRoadLength());
  path.push(`${Math.round(ex)}E ${Math.round(ez)}N`);
  rows.push('MIN PATH · DOSE/S 12 · SHIELDED 0.3');
  for (let i = 0; i < path.length; i += 4) rows.push('  ' + path.slice(i, i + 4).join('  >  '));
  rows.push(`MAX  ${ZONE4.sump.x}E ${ZONE4.sump.z}N  DOSE/S ${ZONE4.sump.rate}`, `NIL  ${ZONE4.clean.x}E ${ZONE4.clean.z}N  R ${ZONE4.clean.r} M`);
  return { head: 'RAD · SURFACE DOSE', rows, sets: ['agi_rad'] };
}

/** The hours the Ashen are out of their dark places: from dusk to dawn. */
export const DUSK = 18, DAWN = 6;

/** Where the Ashen keep: each nest's position, how many, whether it is under ground, the hours they are out. */
export function bioMap(): Answer {
  const rows = [`${col('CLUSTER', 10)}${pad('E', 6)}${pad('N', 6)}${pad('N', 4)}  ${col('SITE', 12)}ACTIVE`];
  NESTS.forEach((n, i) => rows.push(`${col('B' + String(i + 1).padStart(2, '0'), 10)}${pad(Math.round(n.x), 6)}${pad(Math.round(n.z), 6)}${pad(n.n, 4)}  ${col(n.under ? 'SUBSURFACE' : 'STRUCTURE', 12)}${n.under ? '00:00-24:00' : `${hhmm(DUSK)}-${hhmm(DAWN)}`}`));
  rows.push(`TOTAL ${NESTS.reduce((s, n) => s + n.n, 0)} · ROAM 14 M · NIL EAST ${ZONE3.dam.x0}E`);
  return { head: 'BIO · THERMAL ANOMALY CLUSTERS', rows, sets: ['agi_bio'] };
}

/** Three days of the sun, the moon and the valley's mist. */
export function ephemeris(c: LinkClock): Answer {
  const rows = [`${col('DAY', 6)}${col('SUNRISE', 9)}${col('SUNSET', 9)}${col('MOONRISE', 10)}${col('MOONSET', 9)}MIST`];
  for (let d = 0; d < 3; d++) rows.push(`${col('D+' + d, 6)}${col(hhmm(DAWN), 9)}${col(hhmm(DUSK), 9)}${col(hhmm(DUSK), 10)}${col(hhmm(DAWN), 9)}04:00-09:30`);
  const toDusk = c.hour >= DAWN && c.hour < DUSK ? DUSK - c.hour : 0;
  rows.push(`NOW ${hhmm(c.hour)} · DUSK T-${hhmm(toDusk)}`);
  return { head: 'EPH · LOCAL', rows, sets: ['agi_eph'] };
}

/** Hours to dusk at `hour`, or 0 by night: what the clock shows once EPH has answered. */
export function hoursToDusk(hour: number): number { return hour >= DAWN && hour < DUSK ? DUSK - hour : 0; }

// ---- The drawings ---------------------------------------------------------------------------------------

export interface Schematic { flag: string; code: string; title: string; item: string; diagram: string[] }
/** The four drawings it holds that this workshop can build. Each sets a flag a recipe waits on (data/recipes.json). */
export const SCHEMATICS: Schematic[] = [
  { flag: 'sch_sonic', code: 'AC-EM-2', title: 'ACOUSTIC EMITTER', item: 'sonic_lure', diagram: [
    '      .-----.      ', '   ))) | O O | (((   ', '      |  ^  |      ', '   .--+-----+--.   ', '   | CELL  OSC |   ', "   '-----------'   "] },
  { flag: 'sch_smoke', code: 'CH-OB-1', title: 'OBSCURANT · IRRITANT', item: 'smoke_pot', diagram: [
    '     ~  ~   ~      ', '      ~ ~  ~       ', '    .--====--.     ', '    | S  KNO3 |    ', '    |  C  CLAY|    ', "    '---------'    "] },
  { flag: 'sch_thermal', code: 'TH-OPT-4', title: 'THERMAL OPTIC', item: 'thermal_optic', diagram: [
    '  .------------.   ', ' (| GE ) ( FPA |=] ', "  '-----+------'   ", '        | CELL     ', '      [8-14 UM]    '] },
  { flag: 'sch_armor', code: 'AR-CP-3', title: 'COMPOSITE PLATE CARRIER', item: 'engineer_armor', diagram: [
    '    .--.  .--.     ', '   /####\\/####\\    ', '   |##[PLATE]##|   ', '   |###[WEAVE]#|   ', "    '---------'    "] },
];

/** A new drawing can be pulled once every link window. */
export const WINDOW_HOURS = 6;

/** When the next window opens (hours on the uplink's clock), given when the last drawing was pulled. */
export function nextWindow(lastPull: number | null): number { return lastPull === null ? -Infinity : lastPull + WINDOW_HOURS; }

/** The parts table for a drawing, from the recipe that waits on it: rows of PART and QTY, and where it is made. */
function partsOf(s: Schematic): string[] {
  const r = RECIPES.find((q) => q.learn === s.flag);
  if (!r) return [];
  return [`${col('PART', 26)}QTY`, ...r.in.map(([id, n]) => `${col(itemLabel(id).replace(/\s*\(.*$/, '').toUpperCase(), 26)}${n}`), `YIELD ${r.out[1]} · STATION ${STATION_LABEL[r.station].toUpperCase()}`];
}

/** The index of drawings: which are held, and when the next can be pulled. */
export function schematicIndex(flags: ReadonlySet<string>, c: LinkClock, lastPull: number | null): Answer {
  const rows = [`${col('CODE', 10)}${col('TITLE', 28)}STATE`];
  for (const s of SCHEMATICS) rows.push(`${col(s.code, 10)}${col(s.title, 28)}${flags.has(s.flag) ? 'HELD' : '----'}`);
  const open = nextWindow(lastPull);
  rows.push(SCHEMATICS.every((s) => flags.has(s.flag)) ? 'INDEX COMPLETE' : hours(c) >= open ? 'WINDOW OPEN' : `NEXT WINDOW ${hhmm(open)}`);
  return { head: 'SCH · INDEX', rows, sets: [] };
}

/**
 * Pulls one drawing: its diagram and parts table, and the flag that shows its recipe. Null when it is held
 * already or the window is shut (the index says when it opens).
 */
export function pullSchematic(flag: string, flags: ReadonlySet<string>, c: LinkClock, lastPull: number | null): Answer | null {
  const s = SCHEMATICS.find((q) => q.flag === flag);
  if (!s || flags.has(flag) || hours(c) < nextWindow(lastPull)) return null;
  return { head: `SCH · ${s.code} · ${s.title}`, rows: [...s.diagram, ...partsOf(s)], sets: [s.flag] };
}

/** The hour on the uplink's clock, for remembering when a drawing was pulled. */
export const linkHours = hours;

/** One of the plain queries. (END is the endpoints table again; SCH is the index.) */
export function ask(q: QueryId, c: LinkClock, flags: ReadonlySet<string>, lastPull: number | null): Answer {
  switch (q) {
    case 'END': return endpoints(c);
    case 'RAD': return radMap();
    case 'BIO': return bioMap();
    case 'EPH': return ephemeris(c);
    case 'SCH': return schematicIndex(flags, c, lastPull);
  }
}

/** The queries, in the order the page lists them: a code, and the builder's own note beside it (his software, not its voice). */
export const QUERIES: { id: QueryId; note: string }[] = [
  { id: 'RAD', note: 'surface dose' },
  { id: 'BIO', note: 'thermal anomaly clusters' },
  { id: 'EPH', note: 'sun, moon, mist' },
  { id: 'SCH', note: 'drawings held' },
  { id: 'END', note: 'endpoints heard' },
];

// ---- It never speaks --------------------------------------------------------------------------------------

/** Words that would make a row a sentence. None may appear in anything it returns. */
const SPOKEN = new Set(['I', 'ME', 'MY', 'WE', 'US', 'OUR', 'YOU', 'YOUR', 'AM', 'IS', 'ARE', 'WAS', 'WERE', 'BE', 'THE', 'A', 'AN', 'AND', 'BUT', 'THIS', 'THAT', 'HELLO', 'PLEASE', 'SORRY', 'THANK', 'THANKS', 'WELCOME', 'CAN', 'WILL', 'SHOULD', 'MUST', 'HAVE', 'HAS', 'DO', 'NOT', 'YES', 'NO', 'TO', 'WITH', 'FOR']);

/**
 * Why a row reads as speech, or null if it does not: a lower-case letter, sentence punctuation, or a word
 * only a speaker uses. Every row of every answer must pass (the tests hold it to this).
 */
export function spoken(row: string): string | null {
  if (/[a-z]/.test(row)) return 'lower case';
  if (/[!?]/.test(row) || /\.\s+[A-Z]/.test(row) && !/\.\.\./.test(row)) return 'sentence punctuation';
  // (Single letters stand as column heads and units: E, N, D, M, R, S.)
  for (const w of row.split(/[^A-Z']+/)) if (w.length > 1 && SPOKEN.has(w)) return `the word ${w}`;
  if (/(^|[^A-Z0-9-])I([^A-Z0-9-]|$)/.test(row)) return 'the word I';
  return null;
}

/** The tower and the dam as the map's far marks, for the END answer's change: Mira's bearing on the map table's edge. */
export const MIRA = { id: 'MIRA-7', brg: 4, km: 212.4 };
export const TOWER_AT = PLACES.ridgeTower;
