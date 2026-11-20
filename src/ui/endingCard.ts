// The closing card (docs/PHASE8.md, 7): white on black, a paragraph at a time, one button back to the valley.
// The words are in data/ending.json. The paper screen shows it (src/ui/paperScreen.ts).

import data from '../../data/ending.json' with { type: 'json' };

export const ENDING_CSS = `
.pp-wrap.pp-dark { background: #000; animation: end-in 1.6s ease both; }
/* Sized by the window's height, so the whole card and its button fit a small frame without scrolling. */
.pp-panel.end-card { width: min(640px, 92vw); max-height: 98vh; padding: 1vh 12px; text-align: center; background: transparent; box-shadow: none; color: #ece8df; font-family: Georgia, 'Iowan Old Style', serif; }
.end-card p { margin: 0 0 clamp(10px, 3.2vh, 26px); font-size: clamp(12px, 2.75vh, 19px); line-height: 1.6; opacity: 0; animation: end-in 1.8s ease forwards; }
.end-card p:first-child { font-size: clamp(17px, 3.9vh, 26px); letter-spacing: .5px; }
.end-btn { cursor: pointer; margin-top: 0; font-size: clamp(12px, 2.6vh, 16px) !important; border: 1px solid rgba(236,232,223,.5); border-radius: 6px; padding: 10px 22px; background: transparent; color: inherit; font: inherit; font-size: 16px; opacity: 0; animation: end-in 1.6s ease forwards; }
.end-btn:hover { background: rgba(236,232,223,.1); }
@keyframes end-in { from { opacity: 0; } to { opacity: 1; } }
`;

/** The card's paragraphs, each a list of lines. */
export const ENDING: string[][] = data.card;
export const ENDING_AGAIN: string = data.again;
export const ENDING_BUTTON: string = data.button;

/** Fills a panel with the card. `pace`: seconds between paragraphs (0 in the play-through); `back` runs on the button. */
export function fillEnding(card: HTMLElement, back: () => void, pace = 2.6): void {
  ENDING.forEach((lines, i) => {
    const p = document.createElement('p');
    lines.forEach((line, k) => { if (k) p.append(document.createElement('br')); p.append(line); });
    p.style.animationDelay = `${pace ? 1 + i * pace : 0}s`;
    card.append(p);
  });
  const b = document.createElement('button');
  b.className = 'end-btn';
  b.dataset.back = '1';
  b.textContent = ENDING_BUTTON;
  b.style.animationDelay = `${pace ? 1 + ENDING.length * pace : 0}s`;
  b.onclick = back;
  card.append(b);
}
