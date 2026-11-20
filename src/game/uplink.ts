// The uplink page of the builder's computer, from the game's side (docs/PHASE8.md, 5 and 6): what the link
// needs and has, opening it, the queries and what each changes, the drawings and their window. The answers
// themselves are src/sim/uplink.ts; the page is src/ui/uplinkScreen.ts. This knows nothing of the picture: the
// game hands it a narrow view of itself (`LinkHost`), so it is tested without a browser.

import type { UplinkView } from '../ui/uplinkScreen.ts';
import { linkStatus, linkReady, endpoints, ask, pullSchematic, linkHours, HANDSHAKE, QUERIES, SCHEMATICS, type LinkNeeds, type Answer } from '../sim/uplink.ts';
import { BLOCK_DEFS, blockName } from '../world/blocks.ts';
import { CS, CHUNKS_Y, COLS_X } from '../world/constants.ts';

/** What the page reads and changes. */
export interface LinkHost {
  flags: Set<string>;
  /** Days since the valley was begun, and the hour of the day. */
  day: number;
  hour: number;
  /** When a drawing was last pulled, on the link's clock (hours); null: never. */
  lastPull: number | null;
  linkNeeds(): LinkNeeds;
  /** Something changed that a save should hold. */
  edited(): void;
  /** The link has just been opened for the first time (the handshake is heard). */
  linkOpened(): void;
  /** The first answer has been read and the page put down: the closing card. */
  firstRead(): void;
}

/** The page as it stands now. Asking anything beyond the first answer is M5's "ask it something". */
export function uplinkView(g: LinkHost): UplinkView {
  const needs = g.linkNeeds(), ready = linkReady(needs);
  const clock = () => ({ day: g.day, hour: g.hour });
  const take = (a: Answer, asked: boolean): Answer => {
    for (const f of a.sets) g.flags.add(f);
    if (asked) g.flags.add('agi_asked');
    g.edited();
    return a;
  };
  return {
    needs: linkStatus(needs), ready,
    // Once opened and its first answer read, the queries show at once, but only while everything the link needs
    // still holds. (A link opened and the page lost before the answer was read opens again, answer and all.)
    live: ready && g.flags.has('uplink_live') && g.flags.has('ending_seen'),
    queries: QUERIES,
    drawings: () => SCHEMATICS.map((s) => ({ flag: s.flag, code: s.code, held: g.flags.has(s.flag) })),
    open: () => {
      g.flags.add('uplink_live');
      g.linkOpened();
      // The first answer comes unasked: the endpoints heard. (It is not yet "asking it something".)
      return { handshake: HANDSHAKE, first: take(endpoints(clock()), false) };
    },
    ask: (q) => take(ask(q, clock(), g.flags, g.lastPull), true),
    pull: (flag) => {
      const a = pullSchematic(flag, g.flags, clock(), g.lastPull);
      if (!a) return null;
      g.lastPull = linkHours(clock());
      return take(a, true);
    },
    firstRead: () => g.firstRead(),
  };
}

/** Every block of one kind the player has set down (or the game has, as an edit), with where each stands. */
export function findPlaced(edits: Map<number, Map<number, number>>, name: string): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (const [key, e] of edits) {
    const cy = key % CHUNKS_Y, col = (key - cy) / CHUNKS_Y, cx = col % COLS_X, cz = Math.floor(col / COLS_X);
    for (const [i, id] of e) {
      if (!id || (BLOCK_DEFS[id]?.base ?? blockName(id)) !== name) continue;
      out.push([cx * CS + (i & 31), cy * CS + ((i >> 10) & 31), cz * CS + ((i >> 5) & 31)]);
    }
  }
  return out;
}
