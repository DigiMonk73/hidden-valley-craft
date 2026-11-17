# AGENTS.md

Context for AI assistants working on Hidden Valley — Block Edition.

## What this is

This is a browser voxel game built from the *Hidden Valley* script. The script is the Unity
project's `docs/DESIGN.md`, in the private repository `DigiMonk73/hidden-valley`.

- It is a **separate game**. Read the Unity repository for the design; never change it from here.
- The owner decides what the game is. Claude builds it and brings decisions only when they change the vision.
- The owner is not a developer. Explain in plain words, with one recommendation.

## Read first

- **[docs/PLAN.md](docs/PLAN.md):** the approved plan. It covers the zones, danger levels, the inheritance and phases 0–9.
- **[docs/STATUS.md](docs/STATUS.md):** where things stand and what is next. Update it at the end of every session.
- **[README.md](README.md):** how to build, test, take screenshots and draw the map.

## Rules

- **The owner is the gate.** A phase is done when the owner has played its link and said so. Passing checks never mean "looks right".
- **The sanctuary rule is enforced in code.** Hostiles never spawn, path, target or get knocked inside the valley at any depth (`inSanctuary` in `src/gen/layout.ts`).
- **Free assets only**, each listed in [LICENSES.md](LICENSES.md).
- **Nothing from Minecraft:** no name, textures, sounds, creatures or interface look.
- **Browser-only code lives in `src/platform/`**, behind fallbacks. The published page runs in a sandboxed frame where mouse capture, workers, storage or downloads may be blocked.
- **Design data stays plain data** (`data/*.json`). Saves store block *names*, so ids may change between builds.
- **A bug fix gets a test that fails on the old code.**

## Sessions (the owner, 2026-11-17)

- **One lead session** owns `main`, the published page and the reviews. It writes each phase's plan into `docs/PHASEn.md` and starts a **phase session** to build it, so no one conversation grows too long.
- **A phase session** works only on its own branch (`phase3`, `phase4`…). It:
  - commits each finished step there with its tests and pushes the branch;
  - never pushes to `main` and never publishes the page;
  - ends by having a fresh reviewer check its work, fixing what it finds, and messaging the lead with what was built, the test results and what it saw in its screenshots (the lead takes the pictures the owner gets).
- **The lead** reads the diff, runs the checks again, merges the branch into `main`, publishes and reports to the owner.

## Where it lives

- **The repository:** https://github.com/DigiMonk73/hidden-valley-craft, branch `main`. The owner made it for this game and asked for everything to be pushed there.
- **Commits:** each finished step is committed and pushed.

## Publishing a build

1. Run `npm run build` and `npm test`. With `npx vite preview --port 4173` running, also run `node tests/e2e/play.mjs`.
2. Run `node tools/bundle-source.mjs`. It writes `out/source-bundle.json`, every tracked text file in one place.
3. Publish `dist/index.html` as the claude.ai page, with `source-bundle.json` as a supporting file. The source then survives even if this container is wiped.
4. Before publishing, a fresh reviewer that did not write the change checks it.
5. Send the owner the link, at most 5 screenshots and at most 10 lines.

To rebuild a source tree from a published bundle, run `node tools/restore-source.mjs bundle.json target-dir`.
