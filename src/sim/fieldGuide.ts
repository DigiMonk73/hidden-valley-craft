// The builder's field guide (data/fieldguide.json): how things are done here, a book apart from his journal. Its
// pages appear as the player reaches each stage (a flag), and a page not yet seen is marked new. Read at the reading
// stand in the study, or from the copy carried. Pure.

import data from '../../data/fieldguide.json' with { type: 'json' };

/** `section`: the part of the book it is in (its contents are grouped by these, in the book's order). */
export interface GuidePage { id: string; section: string; title: string; text: string; after?: string }
export interface GuideView extends GuidePage { fresh: boolean }

export const GUIDE_PAGES: GuidePage[] = data.pages;

/** Set once a valley has had its copy of the guide: from the wardrobe, or (a valley that had opened it before) into the pack. */
export const GUIDE_GIVEN = 'guide_given';
/** Set the first time the guide is read. */
export const GUIDE_READ = 'guide_read';
/** A page seen is remembered as a flag: `guide:<id>`. */
const seenFlag = (id: string) => `guide:${id}`;

/** The pages the player has reached, in the book's order, each marked if not seen before. */
export function guidePages(flags: ReadonlySet<string>): GuideView[] {
  return GUIDE_PAGES.filter((p) => !p.after || flags.has(p.after)).map((p) => ({ ...p, fresh: !flags.has(seenFlag(p.id)) }));
}

/** Notes that every page reached has now been seen. True if anything changed (the save should hold it). */
export function markGuideRead(flags: Set<string>): boolean {
  let changed = !flags.has(GUIDE_READ);
  flags.add(GUIDE_READ);
  for (const p of guidePages(flags)) if (p.fresh) { flags.add(seenFlag(p.id)); changed = true; }
  return changed;
}

/**
 * Whether this valley is owed a copy of the guide in its pack, once (on load). The wardrobe holds one from this build
 * on, and opening it sets the flag (`GUIDE_GIVEN`); so a wardrobe found opened with no flag was opened before the guide
 * existed, and that valley is given a copy, and the flag. A valley that has not opened it is owed nothing (and its
 * flags are left alone). True: put one in the pack now.
 */
export function owesGuideCopy(flags: Set<string>, wardrobeOpened: boolean): boolean {
  if (flags.has(GUIDE_GIVEN) || !wardrobeOpened) return false;
  flags.add(GUIDE_GIVEN);
  return true;
}
