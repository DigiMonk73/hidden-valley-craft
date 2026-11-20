// The closing card (docs/PHASE8.md, 7): white on black, a paragraph at a time, one button back to the valley.
// The words are in data/ending.json.

import data from '../../data/ending.json' with { type: 'json' };

const CSS = `
.end-wrap[hidden] { display: none; }
.end-wrap { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: auto; background: #000; color: #ece8df; z-index: 50;
  font-family: Georgia, 'Iowan Old Style', serif; animation: end-in 1.6s ease both; }
.end-card { width: min(620px, 88vw); text-align: center; }
.end-card p { margin: 0 0 26px; font-size: 19px; line-height: 1.7; opacity: 0; animation: end-in 1.8s ease forwards; }
.end-card p:first-child { font-size: 26px; letter-spacing: .5px; }
.end-btn { cursor: pointer; margin-top: 10px; border: 1px solid rgba(236,232,223,.5); border-radius: 6px; padding: 10px 22px; background: transparent; color: inherit; font: inherit; font-size: 16px; opacity: 0; animation: end-in 1.6s ease forwards; }
.end-btn:hover { background: rgba(236,232,223,.1); }
@keyframes end-in { from { opacity: 0; } to { opacity: 1; } }
`;

/** The card's paragraphs, each a list of lines. */
export const ENDING: string[][] = data.card;
export const ENDING_AGAIN: string = data.again;

export class EndingCard {
  private wrap: HTMLDivElement;
  /** Seconds between paragraphs; the play-through sets it to 0. */
  pace = 2.6;

  constructor(root: HTMLElement) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.wrap = document.createElement('div');
    this.wrap.className = 'end-wrap';
    this.wrap.hidden = true;
    root.appendChild(this.wrap);
  }

  get isOpen(): boolean { return !this.wrap.hidden; }

  /** Shows the card; `done` runs when the button is pressed. */
  show(done: () => void): void {
    this.wrap.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'end-card';
    ENDING.forEach((lines, i) => {
      const p = document.createElement('p');
      lines.forEach((line, k) => { if (k) p.append(document.createElement('br')); p.append(line); });
      p.style.animationDelay = `${1 + i * this.pace}s`;
      card.append(p);
    });
    const b = document.createElement('button');
    b.className = 'end-btn';
    b.textContent = data.button;
    b.style.animationDelay = `${1 + ENDING.length * this.pace}s`;
    b.onclick = () => { this.wrap.hidden = true; this.wrap.innerHTML = ''; done(); };
    card.append(b);
    this.wrap.append(card);
    this.wrap.hidden = false;
  }
}
