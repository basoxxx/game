// Orda browser test: plays the first campaign levels through the real UI (the simulation is stepped
// from outside — headless WebGL draws ~1 fps), checks results, coins/stars persistence, unlocks, the
// shop, a defeat, the champion button and the four viewports.
//   npx vite build && npx vite preview --port 4650 --strictPort
//   node tools/orda-e2e.mjs [baseUrl] [screenshotDir]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }
const BASE = (process.argv[2] || 'http://127.0.0.1:4650/').replace(/\/?$/, '/');
const SHOTS = process.argv[3] || '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const IGNORE = /WebGL|GPU stall|AudioContext|favicon/i;
let fails = 0; const errors = [];
const ok = (c, msg) => { if (!c) { fails++; console.log('FAIL', msg); } else console.log('ok  ', msg); };
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist'] });
const SET = JSON.stringify({ gfxTier: 'high', gfx: 'high', sound: false, music: false });

async function newPage(w, h, mobile = false, fresh = true) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${w}x${h} pageerror ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !IGNORE.test(m.text())) errors.push(`${w}x${h} console ${m.text()}`); });
  await page.addInitScript(([s, fr]) => { localStorage.setItem('apexdynasty_settings', s); if (fr && !sessionStorage.getItem('or-init')) { localStorage.setItem('sala_orda_v1', JSON.stringify({ opt: { autonext: false } })); sessionStorage.setItem('or-init', '1'); } }, [SET, fresh]);
  return page;
}
// software WebGL sometimes refuses a capture mid-frame: retry, never fail the run for a picture
const shot = async (page, name) => { if (!SHOTS) return; for (let i = 0; i < 3; i++) { try { await page.screenshot({ path: `${SHOTS}/${name}.png`, timeout: 60000 }); return; } catch (e) { await page.waitForTimeout(1500); if (i === 2) console.log('screenshot skipped', name, e.message.split('\n')[0]); } } };
// step the running game to its end with the autopilot; returns the result object
async function playOut(page, { auto = true, maxS = 260 } = {}) {
  await page.waitForFunction(() => window.__orda?.game?.sim && window.__orda.game.cam, null, { timeout: 60000 });
  await page.evaluate((a) => { window.__orda.game.autoplay = a; }, auto);
  const st = await page.evaluate((maxS) => { const o = window.__orda; let r; for (let i = 0; i < maxS * 30; i++) { r = o.step(1 / 30); if (r.state === 'won' || r.state === 'lost') break; } return r; }, maxS);
  await page.waitForSelector('.or-res', { timeout: 60000 });
  return { st, r: await page.evaluate(() => window.__orda.result) };
}

// ── 1. campaign: levels 1-5 through the UI on a desktop
{
  const page = await newPage(1440, 900);
  await page.goto(BASE + '?game=orda'); await page.waitForSelector('.or-menu');
  await shot(page, '1440x900-menu');
  ok(await page.locator('.or-hero h2').textContent() === 'Primi passi', 'menu shows level 1 as the next level');
  await page.click('.or-hero .btn');
  let coins = 0;
  for (let id = 1; id <= 5; id++) {
    let res, tries = 0;
    do { tries++; res = await playOut(page); if (!res.r.win) { await page.click('[data-a=or-again]'); } } while (!res.r.win && tries < 3);
    const st = await page.evaluate(() => window.__orda.store());
    coins += res.r.coins;
    ok(res.r.win && res.r.levelId === id && res.r.stars >= 1, `level ${id} won in ${(res.r.timeMs / 1000).toFixed(1)}s · ★${res.r.stars} · ${res.r.left} left · +${res.r.coins} coins · peak ${res.r.peak} bodies${tries > 1 ? ` (try ${tries})` : ''}`);
    ok(st.next === id + 1 && st.stars[id] === res.r.stars && st.coins === coins, `store: next ${st.next}, stars ${st.stars[id]}, coins ${st.coins}`);
    if (id === 1) await shot(page, '1440x900-results');
    if (id === 5) ok(st.champs.includes('grillo') && (await page.locator('.or-res-unl').count()) === 1, 'boss 5 unlocks the champion Grillo');
    if (id === 2) { // spend in the shop between levels
      await page.click('[data-a=or-back]'); await page.click('[data-a=or-tab][data-id=potenziamenti]');
      const before = (await page.evaluate(() => window.__orda.store())).coins;
      await page.click('[data-a=or-buy][data-id=rate]');
      const after = await page.evaluate(() => window.__orda.store());
      ok(after.up.rate === 1 && after.coins < before, `bought Cadenza 1 (${before} → ${after.coins} coins)`);
      coins = after.coins;
      await shot(page, '1440x900-shop');
      await page.click('[data-a=or-tab][data-id=livelli]'); await shot(page, '1440x900-map');
      await page.click('.or-node.cur');
    } else if (id < 5) await page.click('.or-res [data-a=or-play]');
  }
  // persistence across a reload
  await page.reload(); await page.waitForSelector('.or-menu');
  const st = await page.evaluate(() => window.__orda.store());
  ok(st.next === 6 && st.coins === coins && await page.locator('.or-hero h2').textContent() === 'Muri di sabbia', `after reload: next level 6, ${st.coins} coins kept`);
  await page.click('[data-a=or-tab][data-id=campioni]'); await page.click('[data-a=or-champ][data-id=grillo]');
  ok((await page.evaluate(() => window.__orda.store())).champ === 'grillo', 'Grillo chosen as champion');
  await shot(page, '1440x900-champions');
  // the champion button: fill the meter, press it, the jumper hops to the base
  await page.click('[data-a=or-tab][data-id=gioca]'); await page.click('.or-hero .btn');
  await page.waitForFunction(() => window.__orda?.game?.sim && window.__orda.game.cam, null, { timeout: 60000 });
  const champ = await page.evaluate(() => { const o = window.__orda, g = o.game; o.step(1 / 30, 100); g.sim.charge = g.sim.chargeNeed; o.step(1 / 30, 2); return g.sim.ready(); });
  await page.waitForTimeout(1200);
  await page.locator('#or-champ').dispatchEvent('pointerdown');
  const launched = await page.evaluate(() => { const o = window.__orda, g = o.game; o.step(1 / 60, 3); const n = g.sim.stats.champs; let dmg = 0; for (let i = 0; i < 600 && !g.sim.stats.champDmg; i++) o.step(1 / 30); dmg = g.sim.stats.champDmg; return { n, dmg, kind: g.sim.champDef.id }; });
  ok(champ && launched.n === 1 && launched.kind === 'grillo' && launched.dmg > 0, `champion button launches Grillo (hit the base for ${launched.dmg})`);
  // pause and quit
  await page.keyboard.press('Escape'); await page.waitForSelector('.or-pause');
  ok(true, 'Esc pauses');
  await page.click('[data-a=or-quit]'); await page.waitForSelector('.or-menu');
  await page.context().close();
}
// ── 2. a defeat does not advance the campaign
{
  const page = await newPage(1024, 768);
  await page.goto(BASE + '?game=orda'); await page.waitForSelector('.or-menu');
  await page.click('.or-hero .btn');
  const { r } = await playOut(page, { auto: false });
  const st = await page.evaluate(() => window.__orda.store());
  ok(!r.win && st.next === 1 && st.coins === r.coins && r.coins > 0, `idle player loses (${r.why}), consolation ${r.coins} coins, still on level 1`);
  await page.context().close();
}
// ── 3. the four viewports: menu, map and a busy moment of play
for (const [w, h, mob] of [[1440, 900, false], [1024, 768, false], [390, 844, true], [844, 390, true]]) {
  const page = await newPage(w, h, mob, false);
  await page.addInitScript(() => localStorage.setItem('sala_orda_v1', JSON.stringify({ next: 13, coins: 1234, stars: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 1, 1 + (i % 3)])), up: { rate: 4, shot: 3, hp: 2, speed: 3, charge: 2, armor: 2 }, champs: ['colosso', 'grillo', 'matrioska'], champ: 'matrioska' })));
  await page.goto(BASE + '?game=orda'); await page.waitForSelector('.or-menu'); await page.waitForTimeout(900);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  ok(over <= 0, `${w}x${h}: menu has no horizontal overflow`);
  await shot(page, `${w}x${h}-menu`);
  await page.click('[data-a=or-tab][data-id=livelli]'); await shot(page, `${w}x${h}-map`);
  ok(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 0, `${w}x${h}: map has no horizontal overflow`);
  await page.click('.or-node.cur');
  await page.waitForFunction(() => window.__orda?.game?.sim && window.__orda.game.cam, null, { timeout: 60000 });
  const info = await page.evaluate(() => { const o = window.__orda; o.game.autoplay = true; return o.step(1 / 30, 30 * 12); }); // levels last ~25 s now: catch the middle of the fight
  await page.waitForTimeout(2600);
  await shot(page, `${w}x${h}-play`);
  ok(info.state === 'play' && info.bodies > 100, `${w}x${h}: level 13 in play, ${info.blue} blue units in ${info.bodies} bodies, ${info.red} red`);
  await page.context().close();
}
await browser.close();
console.log(errors.length ? `\nErrors:\n${errors.join('\n')}` : '\nno console errors');
if (errors.length) fails++;
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
