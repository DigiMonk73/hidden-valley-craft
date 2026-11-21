// The game's own title is Under the Falls (the owner, 2026-11-21: "Hidden Valley" is a live trademark in video games).
// What the player sees changes; what a save is called inside does not, so every valley and save code keeps opening.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { SAVE_FORMAT, SAVE_VERSION } from '../src/save/save.ts';
import { SAVE_KEY } from '../src/save/keeper.ts';
import { SECOND_TAB } from '../src/game.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('the title', () => {
  it('is Under the Falls on the page, the menu and the messages that name the game', () => {
    expect(read('index.html')).toContain('<title>Under the Falls</title>');
    expect(read('src/ui/hud.ts')).toContain("textContent = 'Under the Falls'");
    expect(SECOND_TAB.startsWith('Under the Falls')).toBe(true);
    for (const f of ['index.html', 'src/ui/hud.ts', 'src/game.ts', 'src/main.ts']) expect(read(f), f).not.toMatch(/Hidden Valley/);
  });
  it('leaves the save format’s inside names as they were, so old saves and save codes still open', () => {
    expect(SAVE_FORMAT).toBe('hidden-valley-blocks-save');
    expect(SAVE_KEY).toBe('save:1');
    expect(SAVE_VERSION).toBe(5);
  });
});
