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

## Finishing the game (the owner, 2026-11-19)

The owner has handed over the finish: "just finish building it to the best of your ability knowing my script, best practices, etc. … I do not want to micro manage and trust your ability to make an awesome game." They will test and critique when it is done.

- **Decide, don't ask.** Design and gameplay calls through Phase 9 are the lead's, made from the script (the Unity repo's `docs/DESIGN.md`), `docs/PLAN.md`, `docs/REVIEW.md` and the owner's critiques so far. Write each call and its reason in the phase's doc.
- **Approved in one go:** the home redesign in `docs/REVIEW.md` (sketch `docs/review/home-proposed.png`), and the review's gameplay changes: Survival against Builder's mode, money and milestones that matter, a proper first ten minutes.
- **Zone maps** no longer wait for the owner's look: build to the map and show it in the phase's report.
- **Still bring to the owner:** accounts, passwords and money; anything that would change the script's vision; and each published build, with its link, at most 5 pictures and at most 10 lines.
- **The owner's standing critiques:** simple, short, well lit, easy to find; nothing hidden that looks like everything around it; what you mine goes back matching; hold H to go home; animals can be caught and raised.
- **Sub-sessions** run on Fable 5.2 at High effort.
- **Models (the owner, 2026-11-20, later the same day):** every new session or agent runs on Opus 5.5 at **high** effort (Agent tool: `model: "opus"`, `effort: "high"`; a new session: `claude-opus-5-5`, `high`). This replaces the earlier "extra effort" rule.
- **Tweaks (the owner, 2026-11-20):** the lead stays open as the owner's one conversation. Each change the owner asks for is built in **its own new session** on its own branch (`tweak-<name>`), which reports back; the lead reads the diff, checks, merges, publishes and tells the owner. A question gets an answer and options; nothing is changed unless the owner says so.
- **Checks scaled to the change (the owner, 2026-11-20):** for each change the lead decides how much checking it needs and says so in the session's brief. A minor change (a text, a look, one place): `tsc`, the unit tests that cover it, then the whole `npm test`, and the one play-through part that walks that area (often `PARTS=valley`, about 10 minutes). The full six parts (about an hour) only for big merges, changes to saves or combat, anything that moves what the play-through itself walks to, and before version 1. A small tweak's session is told to keep it fast.
- **Publish first, check behind (the owner, 2026-11-20):** a small change that cannot touch a save (no save version, save format or world layout change) is published once its unit tests pass and its picture is looked at; its play-through part runs afterwards, and a failure is fixed forward or the previous version republished. A change to saves is checked fully **before** it is published: once the owner plays it, their valley is in the new format and an older page cannot open it, so a rollback would lock them out.
- **Every published version is pinned** in [docs/VERSIONS.md](docs/VERSIONS.md): its number, date, the commit its page and source bundle were built from, and its save version. (This session's git access pushes `main` only, so tags are kept there, not on GitHub.) To roll back: check out that commit, build, run `node tools/artifact-page.mjs` and `node tools/bundle-source.mjs`, and republish; never across a save-version change. Commit messages say what changed for the player and why, in plain words.

## Sessions (the owner, 2026-11-17)

- **2026-11-20, hand-over:** the lead is now session `session_01EXF2m7f6xMYiFcWXyCnS3G` ("lead, tweaks from the owner's play"). The owner plays and pastes screenshots; the lead makes each tweak, checks it, publishes it and reports. It also merges Phase 9's Track B (`phase9b`) when that reports.

- **One lead session** owns `main`, the published page and the reviews. It writes each phase's plan into `docs/PHASEn.md` and starts a **phase session** to build it, so no one conversation grows too long.
- **A phase session** works only on its own branch (`phase3`, `phase4`…). It:
  - commits each finished step there with its tests and pushes the branch;
  - never pushes to `main` and never publishes the page;
  - ends by having a fresh reviewer check its work, fixing what it finds, and messaging the lead with what was built, the test results and what it saw in its screenshots (the lead takes the pictures the owner gets).
- **The lead** reads the diff, runs the checks again, merges the branch into `main`, publishes and reports to the owner.

## Where it lives

- **The repository:** https://github.com/DigiMonk73/hidden-valley-blocks, branch `main` (renamed from `hidden-valley-craft` by the owner on 2026-11-21; GitHub redirects the old name). The owner made it for this game and asked for everything to be pushed there.
- **Commits:** each finished step is committed and pushed.

## Publishing a build

1. Run `npm run build` and `npm test`. With `npx vite preview --port 4173` running, also run `node tests/e2e/play.mjs`.
2. Run `node tools/bundle-source.mjs`. It writes `out/source-bundle.json`, every tracked text file in one place.
3. Publish `dist/index.html` as the claude.ai page, with `source-bundle.json` as a supporting file. The source then survives even if this container is wiped.
4. Before publishing, a fresh reviewer that did not write the change checks it.
5. Send the owner the link, at most 5 screenshots and at most 10 lines.

To rebuild a source tree from a published bundle, run `node tools/restore-source.mjs bundle.json target-dir`.
