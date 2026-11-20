// The uplink page of the builder's computer (docs/PHASE8.md, 6). A query screen, not a chat: a list of what
// the link needs, then a list of queries; each answer is printed as rows in a fixed-width face. The page's own
// few words are the builder's software's. What answers never speaks: it only fills the rows.

import type { Answer, QueryId } from '../sim/uplink.ts';

const CSS = `
.up-wrap[hidden] { display: none; }
.up-wrap { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: auto; background: rgba(2, 5, 4, .78); }
.up-panel { width: min(760px, 96vw); max-height: 92vh; overflow: auto; padding: 18px 22px; border-radius: 8px; background: #050c08; color: #9df0b4; border: 2px solid #1d3a2a;
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

export class UplinkScreen {
  private wrap: HTMLDivElement;
  private panel: HTMLDivElement;
  private pendingFirst: (() => void) | null = null;
  private timers: ReturnType<typeof setTimeout>[] = [];
  /** How long each line of the handshake waits for the one before (ms); the play-through sets it to 0. */
  pace = 450;

  constructor(root: HTMLElement) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.wrap = document.createElement('div');
    this.wrap.className = 'up-wrap';
    this.wrap.hidden = true;
    this.panel = document.createElement('div');
    this.panel.className = 'up-panel';
    this.wrap.appendChild(this.panel);
    root.appendChild(this.wrap);
  }

  get isOpen(): boolean { return !this.wrap.hidden; }

  /** Puts the page down. If the first answer was on it, that is when it counts as read. */
  close(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    this.wrap.hidden = true;
    this.panel.innerHTML = '';
    const first = this.pendingFirst;
    this.pendingFirst = null;
    first?.();
  }

  private el<K extends keyof HTMLElementTagNameMap>(tag: K, text = '', cls = ''): HTMLElementTagNameMap[K] {
    const e = document.createElement(tag);
    if (text) e.textContent = text;
    if (cls) e.className = cls;
    return e;
  }

  show(v: UplinkView): void {
    const p = this.panel;
    p.innerHTML = '';
    this.wrap.hidden = false;
    p.append(this.el('h2', v.live ? 'UPLINK · LINK UP' : 'UPLINK'));
    const out = this.el('div', '', 'up-out');
    const note = this.el('div', '', 'up-note');
    const print = (a: Answer) => { out.textContent = ''; out.append(this.el('div', a.head, 'up-head'), document.createTextNode('\n' + a.rows.join('\n'))); note.textContent = ''; };

    const queries = this.el('div');
    const drawings = this.el('div');
    const fillDrawings = () => {
      drawings.innerHTML = '';
      for (const d of v.drawings()) {
        const b = this.el('button', d.code, 'up-btn');
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
        const b = this.el('button', q.id, 'up-btn');
        b.dataset.query = q.id;
        b.append(this.el('small', q.note));
        b.onclick = () => { print(v.ask(q.id)); drawings.hidden = q.id !== 'SCH'; if (q.id === 'SCH') fillDrawings(); };
        queries.append(b);
      }
    };

    if (v.live) { fillQueries(); p.append(queries, out, drawings, note); drawings.hidden = true; }
    else {
      for (const n of v.needs) {
        const r = this.el('div', '', 'up-need');
        r.append(this.el('b', n.label), this.el('span', n.ok ? 'OK' : '--', n.ok ? 'ok' : 'no'), this.el('span', n.ok ? '' : n.how, 'how'));
        p.append(r);
      }
      const go = this.el('button', 'OPEN LINK', 'up-btn');
      go.dataset.open = '1';
      go.disabled = !v.ready;
      go.style.marginTop = '12px';
      p.append(go, out, note);
      if (!v.ready) note.textContent = 'LINK DOWN';
      go.onclick = () => {
        go.disabled = true;
        const { handshake, first } = v.open();
        out.textContent = '';
        handshake.forEach((line, i) => this.timers.push(setTimeout(() => { out.textContent += (i ? '\n' : '') + line; }, this.pace * (i + 1))));
        this.timers.push(setTimeout(() => {
          print(first);
          this.pendingFirst = v.firstRead;
          (p.querySelector('h2') as HTMLElement).textContent = 'UPLINK · LINK UP';
        }, this.pace * (handshake.length + 2)));
      };
    }
    p.append(this.el('div', 'E or Esc to step back from the screen', 'up-foot'));
  }
}
