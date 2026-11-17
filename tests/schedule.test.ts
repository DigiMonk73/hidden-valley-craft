import { describe, it, expect } from 'vitest';
import { shouldAutosave, type SaveClock } from '../src/save/schedule.ts';

const base: SaveClock = { unsaved: true, saving: false, now: 100, lastEdit: 99, lastSave: 90, lastFailure: -Infinity };

describe('autosave timing', () => {
  it('waits for a quiet moment after edits, then saves', () => {
    expect(shouldAutosave(base)).toBe(false);
    expect(shouldAutosave({ ...base, lastEdit: 97 })).toBe(true);
  });
  it('saves at least once a minute during steady building', () => {
    expect(shouldAutosave({ ...base, lastEdit: 99.9, lastSave: 39 })).toBe(true);
  });
  it('never overlaps a save in progress, and has nothing to do without changes', () => {
    expect(shouldAutosave({ ...base, lastEdit: 0, saving: true })).toBe(false);
    expect(shouldAutosave({ ...base, lastEdit: 0, unsaved: false })).toBe(false);
  });
  it('after a failed write, waits a minute instead of retrying every frame', () => {
    const failed = { ...base, lastEdit: 0, lastSave: 99, lastFailure: 99 };
    expect(shouldAutosave(failed)).toBe(false);
    expect(shouldAutosave({ ...failed, now: 160 })).toBe(true);
  });
});
