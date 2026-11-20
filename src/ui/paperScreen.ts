// Screens for the builder's things: reading the journal, his computer, the phone, the map table,
// and the safe's keypad. One overlay, filled with whichever is open.

import { fillUplink, UPLINK_CSS, type UplinkView } from './uplinkScreen.ts';
import { fillEnding, ENDING_CSS } from './endingCard.ts';

const CSS = `
.pp-wrap[hidden] { display: none; }
.pp-wrap { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: auto; background: rgba(5, 8, 6, .6); }
.pp-panel { width: min(640px, 94vw); max-height: 90vh; overflow: auto; padding: 22px 26px; border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,.5); }
.pp-paper { background: #efe4c8; color: #2b2116; font-family: Georgia, 'Iowan Old Style', serif; }
.pp-paper h2 { margin: 0 0 4px; font-size: 22px; }
.pp-paper .pp-meta { font-size: 12px; letter-spacing: .6px; text-transform: uppercase; opacity: .6; margin-bottom: 14px; }
.pp-paper p { font-size: 16px; line-height: 1.6; margin: 0; }
.pp-screen { background: #0e1a24; color: #b9f3c8; font-family: ui-monospace, Menlo, monospace; border: 2px solid #2b3b48; }
.pp-screen h2 { margin: 0 0 10px; font-size: 16px; color: #e6f7ea; }
.pp-screen .row { display: flex; justify-content: space-between; gap: 12px; padding: 6px 0; border-bottom: 1px dashed rgba(185,243,200,.15); font-size: 14px; }
.pp-screen .dim { opacity: .55; }
.pp-screen .btc { color: #f7b24a; }
.pp-nav { display: flex; justify-content: space-between; align-items: center; margin-top: 18px; }
.pp-btn { cursor: pointer; border: 0; border-radius: 8px; padding: 8px 14px; font: inherit; font-weight: 600; background: rgba(0,0,0,.12); color: inherit; }
.pp-btn:disabled { opacity: .35; cursor: default; }
.pp-keypad { display: grid; grid-template-columns: repeat(3, 64px); gap: 8px; justify-content: center; margin-top: 12px; }
.pp-keypad button { height: 52px; font-size: 20px; }
.pp-code { text-align: center; font-size: 30px; letter-spacing: 12px; margin: 6px 0; min-height: 40px; }
.pp-map canvas { width: 100%; image-rendering: pixelated; border-radius: 6px; display: block; }
.pp-close { margin-top: 14px; font-size: 12px; opacity: .6; text-align: center; }
.pp-screen .pp-call { background: #2e6b3e; color: #e6f7ea; padding: 4px 12px; }
.pp-screen .pp-say { font-family: Georgia, serif; font-style: italic; color: #f1e6c8; margin: 4px 0 12px; line-height: 1.5; }
.pp-screen .pp-status { min-height: 18px; color: #f7b24a; margin: 6px 0; font-size: 13px; }
.pp-trade { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.pp-trade h3 { margin: 6px 0; font-size: 13px; color: #e6f7ea; text-transform: uppercase; letter-spacing: .6px; }
.pp-trade .row { align-items: center; font-size: 13px; }
.pp-trade img { width: 24px; height: 24px; image-rendering: pixelated; vertical-align: middle; margin-right: 6px; }
.pp-trade .pp-btn { background: rgba(185,243,200,.14); padding: 4px 10px; }
@media (max-width: 560px) { .pp-trade { grid-template-columns: 1fr; } }
`;

export interface TradeRow { icon: string; label: string; price: string; button: string; can: boolean; act: () => string }
/** buyHead / sellHead: the columns' headings (Doc sells services: his column is his, and there is no selling: null hides it). */
export interface TradeView { title: string; say: string; wallet: string; buy: TradeRow[]; sell: TradeRow[]; buyHead?: string; sellHead?: string | null }

export class PaperScreen {
  private wrap: HTMLDivElement;
  private panel: HTMLDivElement;
  onClose: () => void = () => {};

  constructor(root: HTMLElement) {
    const style = document.createElement('style');
    style.textContent = CSS + UPLINK_CSS + ENDING_CSS;
    document.head.appendChild(style);
    this.wrap = document.createElement('div');
    this.wrap.className = 'pp-wrap';
    this.wrap.hidden = true;
    this.panel = document.createElement('div');
    this.panel.className = 'pp-panel';
    this.wrap.appendChild(this.panel);
    root.appendChild(this.wrap);
  }

  get isOpen(): boolean { return !this.wrap.hidden; }

  close(): void {
    this.wrap.hidden = true;
    this.wrap.classList.remove('pp-dark');
    this.panel.innerHTML = '';
    this.onKey = null;
    // Putting a screen down can count for something (the uplink's first answer is read): it may open another.
    const f = this.onPutDown;
    this.onPutDown = null;
    f?.();
  }

  /** Runs once when the open screen is put down. */
  private onPutDown: (() => void) | null = null;
  /** How fast the uplink's handshake and the closing card run: 1 as written, 0 at once (the play-through). */
  pace = 1;

  /** What the open screen does with a typed key, if anything (the keypad takes digits). */
  private onKey: ((code: string) => void) | null = null;
  /** A key pressed while a screen is open (the game passes them on): true if the screen used it. */
  key(code: string): boolean {
    if (!this.onKey || !this.isOpen) return false;
    this.onKey(code);
    return true;
  }

  private open(kind: 'pp-paper' | 'pp-screen' | 'up-panel' | 'end-card'): HTMLDivElement {
    this.onPutDown = null;
    this.wrap.classList.toggle('pp-dark', kind === 'end-card');
    this.panel.className = `pp-panel ${kind}`;
    this.panel.innerHTML = '';
    this.wrap.hidden = false;
    return this.panel;
  }

  private el<K extends keyof HTMLElementTagNameMap>(tag: K, text = '', cls = ''): HTMLElementTagNameMap[K] {
    const e = document.createElement(tag);
    if (text) e.textContent = text;
    if (cls) e.className = cls;
    return e;
  }

  private footer(p: HTMLElement): void { p.append(this.el('div', 'E or Esc to put it down', 'pp-close')); }

  /** The builder's journal, one entry at a time; the player's own notes follow his (`by` names whose they are). */
  journal(entries: { title: string; text: string; by?: string }[], start = 0): void {
    let i = start;
    const show = () => {
      const p = this.open('pp-paper');
      p.append(this.el('div', `${entries[i].by ?? "The builder's journal"} · ${i + 1} of ${entries.length}`, 'pp-meta'), this.el('h2', entries[i].title), this.el('p', entries[i].text));
      const nav = this.el('div', '', 'pp-nav');
      const prev = this.el('button', '← Earlier', 'pp-btn'), next = this.el('button', 'Later →', 'pp-btn');
      prev.disabled = i === 0; next.disabled = i === entries.length - 1;
      prev.onclick = () => { i--; show(); };
      next.onclick = () => { i++; show(); };
      nav.append(prev, next);
      p.append(nav);
      this.footer(p);
    };
    show();
  }

  /** The uplink page of the builder's computer (docs/PHASE8.md, 6). */
  uplink(v: UplinkView): void {
    const p = this.open('up-panel');
    this.onPutDown = fillUplink(p, v, 450 * this.pace);
  }

  /** The closing card (docs/PHASE8.md, 7). `back`: its one button. */
  ending(back: () => void): void {
    fillEnding(this.open('end-card'), back, 2.6 * this.pace);
  }

  computer(rows: [string, string, string?][], title: string, actions: { label: string; act: () => void }[] = []): void {
    const p = this.open('pp-screen');
    p.append(this.el('h2', title));
    if (actions.length) {
      const bar = this.el('div', '', 'pp-nav');
      bar.style.cssText = 'justify-content:flex-start;gap:8px;margin:0 0 10px';
      for (const a of actions) {
        const b = this.el('button', a.label, 'pp-btn pp-call');
        b.dataset.action = a.label;
        b.onclick = a.act;
        bar.append(b);
      }
      p.append(bar);
    }
    for (const [k, v, cls] of rows) {
      const r = this.el('div', '', 'row');
      r.append(this.el('span', k), this.el('span', v, cls ?? ''));
      p.append(r);
    }
    this.footer(p);
  }

  /** The phone: contacts, each with a line of status and, for one who answers, a Call button. */
  phone(title: string, rows: { name: string; status: string; cls?: string; call?: () => string }[]): void {
    const p = this.open('pp-screen');
    p.append(this.el('h2', title));
    const said = this.el('div', '', 'pp-say');
    for (const r of rows) {
      const row = this.el('div', '', 'row');
      const right = this.el('span', r.status, r.cls ?? '');
      row.append(this.el('span', r.name), right);
      if (r.call) {
        const b = this.el('button', 'Call', 'pp-btn pp-call');
        b.onclick = () => { said.textContent = r.call!(); };
        right.append(' ', b);
      }
      p.append(row);
    }
    p.append(said);
    this.footer(p);
  }

  /**
   * Trading with a person: what they sell (Buy) and what you carry that they want (Sell). The view is
   * rebuilt after each deal from `view()`.
   */
  trade(view: () => TradeView): void {
    const draw = (status = '') => {
      const v = view();
      const p = this.open('pp-screen');
      p.append(this.el('h2', v.title), this.el('div', v.say, 'pp-say'));
      const wallet = this.el('div', '', 'row');
      wallet.append(this.el('span', 'Your wallet'), this.el('span', v.wallet, 'btc'));
      p.append(wallet, this.el('div', status, 'pp-status'));
      const grid = this.el('div', '', 'pp-trade');
      const col = (head: string, rows: TradeRow[], empty: string) => {
        const c = this.el('div');
        c.append(this.el('h3', head));
        if (!rows.length) c.append(this.el('div', empty, 'dim'));
        for (const r of rows) {
          const row = this.el('div', '', 'row');
          const left = this.el('span');
          const img = document.createElement('img');
          img.src = r.icon; img.alt = '';
          left.append(img, r.label);
          const b = this.el('button', r.button, 'pp-btn');
          b.disabled = !r.can;
          b.onclick = () => draw(r.act());
          const right = this.el('span');
          right.append(this.el('span', r.price, 'btc'), ' ', b);
          row.append(left, right);
          c.append(row);
        }
        grid.append(c);
      };
      col(v.buyHead ?? 'Buy from him', v.buy, 'Nothing today.');
      if (v.sellHead !== null) col(v.sellHead ?? 'Sell to him (half price)', v.sell, 'You carry nothing he wants.');
      p.append(grid);
      this.footer(p);
    };
    draw();
  }

  /** A four-digit keypad; `check` says whether the code opens it. */
  keypad(title: string, check: (code: string) => boolean): void {
    const p = this.open('pp-screen');
    p.append(this.el('h2', title));
    const code = this.el('div', '', 'pp-code');
    p.append(code);
    let entered = '';
    const pad = this.el('div', '', 'pp-keypad');
    const press = (k: string) => {
      if (k === 'C') entered = '';
      else if (k === '✓') { if (!check(entered)) { code.textContent = 'WRONG'; entered = ''; return; } }
      else if (entered.length < 4) entered += k;
      code.textContent = entered.replace(/./g, '•');
    };
    for (const k of ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '✓']) {
      const b = this.el('button', k, 'pp-btn');
      b.onclick = () => press(k);
      pad.append(b);
    }
    p.append(pad);
    this.footer(p);
    // Typed digits work too (they used to do nothing): Enter checks, Backspace clears.
    this.onKey = (c) => {
      const digit = /^(?:Digit|Numpad)(\d)$/.exec(c);
      if (digit) press(digit[1]);
      else if (c === 'Enter' || c === 'NumpadEnter') press('✓');
      else if (c === 'Backspace' || c === 'Delete') press('C');
    };
  }

  map(canvas: HTMLCanvasElement, caption: string): void {
    const p = this.open('pp-paper');
    p.classList.add('pp-map');
    p.append(this.el('div', caption, 'pp-meta'), canvas);
    this.footer(p);
  }
}
