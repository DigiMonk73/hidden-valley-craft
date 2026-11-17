import { describe, it, expect } from 'vitest';
import { World } from '../src/world/world.ts';
import { collectEdits, restoreEdits, encodeSave, decodeSave, SAVE_FORMAT, SAVE_VERSION, type SaveData } from '../src/save/save.ts';
import { saveToCode, codeToSave, fileToSave } from '../src/platform/fileio.ts';
import { blockId } from '../src/world/blocks.ts';
import { chunkKey } from '../src/world/constants.ts';

function worldWithEdits(): World {
  const w = new World();
  // Edits are kept by chunk even when the column isn't loaded, as after a column unloads.
  w.edits.set(chunkKey(56, 2, 32), new Map([[5, blockId('stone_bricks')], [6, 0], [1000, blockId('lantern')]]));
  w.edits.set(chunkKey(10, 0, 3), new Map([[42, blockId('glass')]]));
  return w;
}

function data(w: World): SaveData {
  const { palette, edits } = collectEdits(w);
  return {
    format: SAVE_FORMAT, version: SAVE_VERSION, savedAt: 'now', hour: 17.5,
    player: { x: 1, y: 2, z: 3, yaw: 0, pitch: 0, flying: false },
    hotbar: [{ name: 'planks', count: 3 }, null, null, null, null, null, null, null, null], selected: 0, palette, edits,
  };
}

describe('saves', () => {
  it('round-trips edits through bytes, a save code and a save file', async () => {
    const w = worldWithEdits();
    const bytes = await encodeSave(data(w));
    const code = saveToCode(bytes);
    expect(code.startsWith('HVB1:')).toBe(true);
    const fromCode = await decodeSave(codeToSave(code)!);
    const fromFile = await decodeSave(fileToSave(new TextEncoder().encode(code))!);
    for (const d of [fromCode, fromFile]) {
      expect(d).not.toBeNull();
      const w2 = new World();
      restoreEdits(w2, d!);
      expect([...w2.edits.entries()].map(([k, m]) => [k, [...m]])).toEqual([...w.edits.entries()].map(([k, m]) => [k, [...m]]));
    }
  });

  it('turns blocks that no longer exist into air instead of failing', async () => {
    const d = data(worldWithEdits());
    d.palette[0] = 'a_block_removed_in_a_later_build';
    const w2 = new World();
    restoreEdits(w2, (await decodeSave(await encodeSave(d)))!);
    const first = [...w2.edits.values()][0];
    expect([...first.values()][0]).toBe(0);
  });

  it('rejects things that are not saves', async () => {
    expect(codeToSave('hello')).toBeNull();
    expect(await decodeSave(new Uint8Array(0))).toBeNull();
    expect(await decodeSave(new TextEncoder().encode('{"format":"other"}'))).toBeNull();
  });
});
