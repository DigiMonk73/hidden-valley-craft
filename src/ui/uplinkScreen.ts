// The uplink page of the builder's computer (docs/PHASE8.md, 6). A query screen, not a chat: a list of what
// the link needs, then a list of queries; each answer is printed as rows in a fixed-width face. The page's own
// few words are the builder's software's. What answers never speaks: it only fills the rows.

import type { Answer, QueryId } from '../sim/uplink.ts';

export const UPLINK_CSS = `
.pp-panel.up-panel { width: min(760px, 96vw); max-height: 92vh; padding: 18px 22px; border-radius: 8px; background: #050c08; color: #9df0b4; border: 2px solid #1d3a2a;
  font: 14px/1.45 ui-monospace, Menlo, Consolas, monospace; box-shadow: 0 20px 60px rgba(0,0,0,.6), inset 0 0 60px rgba(40,120,70,.08); }
.up-panel h2 { margin: 0 0 10px; font-size: 15px; letter-spacing: 2px; color: #d6ffe2; font-weight: 600; }
.up-need { display: flex; gap: 12px; padding: 5px 0; border-bottom: 1px dashed rgba(157,240,180,.14); }
.up-need b { width: 96px; letter-spacing: 1px; font-weight: 600; }
.up-need .ok { color: #6dff9a; } .up-need .no { color: #ffb45a; }
.up-need span.how { opacity: .7; font-family: Georgia, serif; font-size: 13px; }
.up-btn { cursor: pointer; border: 1px solid #2d5a40; border-radius: 4px; padding: 6px 12px; margin: 4px 6px 4px 0; font: inherit; background: #0b1f14; color: #c8ffd8; letter-spacing: 1px; }
.up-btn:hover:not(:disabled) { background: #123321; }
.up-btn:disabled { opacity: .35; cursor: default; }
.up-btn small { opacity: .6; letter-spacing: 0; margin-left: 8px; font-family: Georgia, serif; }
.up-out { white-space: pre; overflow-x: auto; margin: 12px 0 6px; padding: 10px 12px; background: #020604; border: 1px solid #14301f; min-height: 120px; color: #b6ffc8; font-size: 13px; line-height: 1.35; }
.up-head { color: #6dff9a; letter-spacing: 1px; }
.up-foot { margin-top: 10px; font-size: 12px; opacity: .55; text-align: center; font-family: Georgia, serif; }
.up-note { color: #ffb45a; min-height: 18px; margin-top: 6px; font-size: 13px; }
`;

export interface UplinkView {
  /** What the link needs, each with a tick. */
  needs: { label: string; ok: boolean; how: string }[];
  ready: boolean;
  /** Has the link been opened before? Then the queries show at once. */
  live: boolean;
  queries: { id: QueryId; note: string }[];
  /** The drawings, for the buttons under the index. */
  drawings: () => { flag: string; code: string; held: boolean }[];
  /** Opens the link the first time: the handshake's lines and the first answer. */
  open: () => { handshake: string[]; first: Answer };
  ask: (q: QueryId) => Answer;
  /** Pulls a drawing; null if the window is shut or it is held. */
  pull: (flag: string) => Answer | null;
  /** The first answer has been read and the page put down. */
  firstRead: () => void;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '', cls = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (text) e.textContent = text;
  if (cls) e.className = cls;
  return e;
};

/**
 * Fills a panel with the uplink page. `pace`: ms between the handshake's lines (0 in the play-through).
 * Returns what to do when the page is put down: stop the handshake's timers and, if the first answer was on
 * the page, count it as read.
 */
export function fillUplink(p: HTMLElement, v: UplinkView, pace = 450): () => void {
  let pendingFirst: (() => void) | null = null;
  const timers: ReturnType<typeof setTimeout>[] = [];
  const later = (f: () => void, ms: number) => { if (ms <= 0) f(); else timers.push(setTimeout(f, ms)); };
  const title = el('h2', v.live ? 'UPLINK · LINK UP' : 'UPLINK');
  p.append(title);
  const out = el('div', '', 'up-out');
  const note = el('div', '', 'up-note');
  const print = (a: Answer) => { out.textContent = ''; out.append(el('div', a.head, 'up-head'), document.createTextNode('\n' + a.rows.join('\n'))); note.textContent = ''; };

  const queries = el('div');
  const drawings = el('div');
  const fillDrawings = () => {
    drawings.innerHTML = '';
    for (const d of v.drawings()) {
      const b = el('button', d.code, 'up-btn');
      b.dataset.pull = d.flag;
      b.disabled = d.held;
      b.onclick = () => {
        const a = v.pull(d.flag);
        if (a) { print(a); note.textContent = 'DRAWING HELD · RECIPE AT STATION'; }
        else { print(v.ask('SCH')); note.textContent = 'WINDOW SHUT · ONE DRAWING A PASS'; }
        fillDrawings();
      };
      drawings.append(b);
    }
  };
  const fillQueries = () => {
    queries.innerHTML = '';
    for (const q of v.queries) {
      const b = el('button', q.id, 'up-btn');
      b.dataset.query = q.id;
      b.append(el('small', q.note));
      b.onclick = () => { print(v.ask(q.id)); drawings.hidden = q.id !== 'SCH'; if (q.id === 'SCH') fillDrawings(); };
      queries.append(b);
    }
  };

  if (v.live) { fillQueries(); p.append(queries, out, drawings, note); drawings.hidden = true; }
  else {
    for (const n of v.needs) {
      const r = el('div', '', 'up-need');
      r.append(el('b', n.label), el('span', n.ok ? 'OK' : '--', n.ok ? 'ok' : 'no'), el('span', n.ok ? '' : n.how, 'how'));
      p.append(r);
    }
    const go = el('button', 'OPEN LINK', 'up-btn');
    go.dataset.open = '1';
    go.disabled = !v.ready;
    go.style.marginTop = '12px';
    p.append(go, out, note);
    if (!v.ready) note.textContent = 'LINK DOWN';
    go.onclick = () => {
      go.disabled = true;
      const { handshake, first } = v.open();
      // From here the first answer is owed: a page put down during the handshake still counts as read.
      pendingFirst = v.firstRead;
      out.textContent = '';
      handshake.forEach((line, i) => later(() => { out.textContent += (i ? '\n' : '') + line; }, pace * (i + 1)));
      later(() => {
        print(first);
        title.textContent = 'UPLINK · LINK UP';
      }, pace * (handshake.length + 2));
    };
  }
  p.append(el('div', 'E or Esc to step back from the screen', 'up-foot'));
  return () => {
    for (const t of timers) clearTimeout(t);
    const first = pendingFirst;
    pendingFirst = null;
    first?.();
  };
}
