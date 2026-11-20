// Pictures of Phase 8's screens and HUD (docs/PHASE8.md), played rather than from a fixed camera: the dose meter on
// the ridge road, the telescope aimed at the falls, the uplink's first answer, the closing card, each query's
// answer, a drawing, and the map table with what the answers add. Writes out/p8h_*.png.
// Needs the build served: npx vite preview --port 4173. Run: node tools/shots-phase8.mjs (about 10 minutes here).
// For checking the look by eye; not a pass/fail test.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
mkdirSync('out', { recursive: true });
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
await page.addInitScript(() => { Element.prototype.requestPointerLock = function () { return Promise.reject(new Error('no')); }; });
page.on('pageerror', (e) => console.log('[page error]', e.message));
await page.goto(`${process.env.BASE || 'http://localhost:4173/'}?rd=7&hour=11`);
const idle = () => page.waitForFunction(() => window.__hv && window.__hv.idle(), null, { timeout: 600_000, polling: 300 });
await idle();
await page.getByRole('button', { name: 'Play' }).click();
await page.locator('.hv-intro .skip').click().catch(() => {});
await page.waitForTimeout(800);
const g = (f, a) => page.evaluate(f, a);
const settle = async (ms = 9000) => { await idle(); await page.waitForTimeout(ms); };
const shot = async (n) => { await page.screenshot({ path: `out/p8h_${n}.png`, timeout: 180_000 }); console.log(n); };
await g(() => { const gm = window.__hv.game; for (const f of ['m1_done', 'm2_done', 'm3_done', 'm4_done', 'ate', 'drank', 'journal_read', 'armory_found', 'slept', 'left_valley', 'ridge_gate', 'ridge_edge', 'ridge_bend', 'dose_seen', 'uplink_plans', 'ray_met']) gm.flags.add(f); gm.vitals.hunger = 100; gm.vitals.thirst = 100; gm.paper.pace = 0; });
// 1. The meter on the road past the gate: no suit, then the suit (and what the uplink's answers add).
const p = await g(() => { const s = window.__hv.ridge.mark(5) + 14; const [x, z] = window.__hv.ridge.point(s); const [x2, z2] = window.__hv.ridge.point(s + 4); return [x, window.__hv.ridge.height(s) + 1, z, Math.atan2(-(x2 - x), -(z2 - z))]; });
await g((p) => { const gm = window.__hv.game; gm.hour = 11; gm.player.flying = true; gm.player.setPosition(p[0], 140, p[2]); }, p);
await settle();
await g((p) => { const gm = window.__hv.game; gm.player.flying = false; gm.player.setPosition(p[0], p[1], p[2]); gm.player.yaw = p[3]; gm.player.pitch = -0.05; gm.dose = 0; gm.vitals.hp = 100; }, p);
await page.waitForFunction(() => window.__hv.game.dose > 30, null, { timeout: 120_000, polling: 50 }).catch(() => {});
await shot('meter_nosuit');
await g(() => { const gm = window.__hv.game; gm.hotbar.add(window.__hv.itemId('hazard_suit'), 1); gm.dose = 21; gm.vitals.hp = 100; gm.flags.add('agi_rad'); gm.flags.add('agi_eph'); gm.flags.add('agi_bio'); });
await page.waitForTimeout(2500);
await shot('meter_suit');
// 2. Home: the telescope, the uplink page, the card, the map table.
await g(() => { const gm = window.__hv.game; gm.dose = 0; gm.player.flying = true; gm.player.setPosition(1797, 84, 1022.5); });
await settle(12000);
await g(() => { const gm = window.__hv.game, id = window.__hv.itemId; gm.world.setBlock(1795, 82, 1021, id('telescope')); gm.player.flying = false; gm.player.setPosition(1796.4, 82, 1022.6); gm.hotbar.slots[0] = { id: id('sat_antenna'), count: 1 }; gm.hotbar.selected = 0; gm.useHoist(); gm.startScope(1795, 82, 1021); const t = window.__hv.scopeTargets().find((q) => q.id === 'falls'); gm.player.yaw = t.yaw; gm.player.pitch = t.pitch; });
await page.waitForTimeout(6000);
await shot('scope_falls');
await g(() => { const gm = window.__hv.game; gm.endScope(); gm.flags.add('uplink_fitted'); gm.scopeOk = true; gm.devices.hydro_generator = [[0, 0, 0]]; gm.useComputer(); document.querySelector('[data-action="Uplink"]').click(); });
await page.waitForTimeout(300);
await g(() => { window.__hv.game.devices.hydro_generator = [[0, 0, 0]]; });
await page.locator('[data-open]').click();
await page.waitForTimeout(500);
await shot('uplink_first');
await page.keyboard.press('Escape');
await page.waitForTimeout(2500);
await shot('ending');
await page.locator('.end-btn').click({ force: true });
await page.waitForTimeout(400);
await g(() => { const gm = window.__hv.game; gm.devices.hydro_generator = [[0, 0, 0]]; gm.useComputer(); document.querySelector('[data-action="Uplink"]').click(); });
for (const q of ['RAD', 'BIO', 'EPH', 'SCH']) { await page.locator(`[data-query="${q}"]`).click(); await page.waitForTimeout(200); await shot(`uplink_${q.toLowerCase()}`); }
await page.locator('[data-pull="sch_thermal"]').click();
await page.waitForTimeout(200);
await shot('uplink_drawing');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
// The map table, with what the answers add (every column marked seen).
await g(() => { const gm = window.__hv.game; gm.explored.fill(1); const f = gm.flags; for (const k of ['extracted', 'dam_seen', 'zone3_entered', 'highway_seen']) f.add(k); const w = gm.world; for (let x = 1800; x < 1830; x++) for (let z = 1005; z < 1045; z++) for (let y = 80; y < 86; y++) if (window.__hv.blockName(w.blockAt(x, y, z)).startsWith('map_table')) { gm.useFurniture(x, y, z, w.blockAt(x, y, z)); return; } });
await page.waitForTimeout(600);
await shot('map');
await browser.close();
