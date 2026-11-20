// A probe, not a check: the minute in which the lead's tab died (docs/PHASE7.md). On the outpost's roof with
// the rifle in hand, turned to face the gunman every 50 ms, for MINUTES (default 4). Run with MEM=1 to see
// what grows: LOCK=1 MEM=1 node tests/e2e/probe-roof.mjs
// (LOCK=1 captures the mouse as the play-through used to: that was the cause. Without it the page is quiet.)
import { start } from './lib.mjs';

const { page, g, P, standAt, hold, LONG } = await start();
const O = P.ZONE1FAR.outpost;
await g(() => { const h = window.__hv.game.hotbar, id = window.__hv.itemId; h.add(id('hunting_rifle'), 1); h.add(id('rifle_rounds'), 20); h.add(id('machete'), 1); });
await standAt(P.OUTPOST_AT[0] + 30, 1020.5, Math.PI / 2);
await g((O) => { const gm = window.__hv.game, p = gm.player; gm.wild.clear(); p.flying = false; p.setPosition(O.x0 + 1.5, O.floor + 4, (O.z0 + O.z1) / 2); p.yaw = -Math.PI / 2; p.pitch = 0; gm.vitals.hp = 100; }, O);
await page.waitForFunction(() => window.__hv.game.wild.creatures.some((c) => c.kind === 'lookout'), null, { timeout: LONG, polling: 200 }).catch(() => {});
// The lookout is taken as the play-through takes him (a blade from behind), by the game's own path.
await g(() => { const gm = window.__hv.game, l = gm.wild.creatures.find((c) => c.kind === 'lookout'); if (l) gm.damageCreature(l, 999); });
await hold('hunting_rifle');
console.log('on the roof, rifle in hand: ' + JSON.stringify(await g(() => window.__hv.game.wild.creatures.map((c) => `${c.kind}:${c.mind}`))));
// CPU=1: where the main thread's time goes in this state, over 40 s.
if (process.env.CPU) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 2000 });
  await cdp.send('Profiler.start');
  const f0 = await g(() => window.__hv.game.time);
  await page.waitForTimeout(40_000);
  const { profile } = await cdp.send('Profiler.stop');
  const f1 = await g(() => window.__hv.game.time);
  const self = new Map(), byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const dts = profile.timeDeltas, total = dts.reduce((a, b) => a + b, 0);
  profile.samples.forEach((id, i) => { const n = byId.get(id), k = `${n.callFrame.functionName || '(anonymous)'} :${n.callFrame.lineNumber}`; self.set(k, (self.get(k) ?? 0) + dts[i]); });
  console.log(`CPU over 40 s (${Math.round((f1 - f0) * 10)} game frames at most): ` + [...self].sort((a, b) => b[1] - a[1]).slice(0, 18).map(([k, v]) => `${Math.round((v / total) * 100)}% ${k}`).join(' | '));
}
const minutes = Number(process.env.MINUTES || 4), t0 = Date.now();
let polls = 0;
while (Date.now() - t0 < minutes * 60_000) {
  const seen = await page.waitForFunction((k) => { const gm = window.__hv.game, p = gm.player, c = gm.wild.creatures.find((o) => o.kind === k); if (!c) return true; const dx = c.x - p.x, dz = c.z - p.z; p.yaw = Math.atan2(-dx, -dz); p.pitch = -Math.atan2(p.eyeY - (c.y + 1.2), Math.hypot(dx, dz)); gm.vitals.hp = 100; window.__polls = (window.__polls ?? 0) + 1; return false && gm.creatureInSight(150); }, 'gunman', { timeout: 20_000, polling: 50 }).then(() => true, () => false);
  polls = await g(() => window.__polls).catch(() => -1);
  if (polls < 0) { console.log('the page is gone'); break; }
  void seen;
}
console.log(`done: ${polls} polls, game time ${await g(() => Math.round(window.__hv.game.time)).catch(() => '?')} s`);
process.exit(0);
