// Kart Baso — browser end-to-end checks on a running preview (headless WebGL is ~1 fps, so the race is
// advanced with the deterministic window.__kart.step(n) and human karts are driven by the AI):
//   menu at 4 viewports · single race to the results · Grand Prix (4 races → trophy, unlocks, coins)
//   · time trial (ghost saved and replayed) · battle · items fired from the keyboard · split screen
//   2 and 4 players with separate inputs · touch controls · no console errors.
//   node tools/kart-e2e.mjs [baseUrl] [shotsDir]
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const BASE = (process.argv[2] || 'http://127.0.0.1:4660/').replace(/\/?$/, '/');
const OUT = (process.argv[3] || 'kart-shots').replace(/\/?$/, '/');
mkdirSync(OUT, { recursive: true });
const ONLY = new Set((process.env.KART_ONLY || 'menu,race,items,gp,tt,battle,split,touch').split(','));
const IGNORE = /GPU stall|GL Driver|WebGL|AudioContext|favicon/i;
const errors = []; let fails = 0;
const ok = (c, msg) => { console.log(`${c ? 'ok' : '!!'} ${msg}`); if (!c) fails++; };
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist'] });
async function page(w, h, opt = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: !!opt.touch, isMobile: !!opt.touch, deviceScaleFactor: 1 });
  const p = await ctx.newPage(); p.setDefaultTimeout(240000);
  p.on('console', (m) => { if (m.type() === 'error' && !IGNORE.test(m.text())) errors.push(`[${w}x${h}] ${m.text()}`); });
  p.on('pageerror', (e) => errors.push(`[${w}x${h}] pageerror ${e.message}`));
  await p.addInitScript((s) => { if (!sessionStorage.getItem('kt-init')) { sessionStorage.setItem('kt-init', '1'); localStorage.clear(); localStorage.setItem('apexdynasty_settings', s); } }, JSON.stringify({ gfxTier: opt.tier || 'med', gfx: 'high', sound: false, music: false }));
  await p.goto(BASE + '?game=kart' + (opt.touch ? '&touch' : ''));
  await p.waitForSelector('.kt-menu', { timeout: 60000 });
  return p;
}
// stop the rAF loop and drive the race by hand
const manual = (p) => p.evaluate(() => { const g = window.__kart.game; cancelAnimationFrame(g.raf); g.raf = 0; g.o.manual = true; });
const waitGame = (p) => p.waitForFunction(() => window.__kart?.game?.hud && window.__kart.game.raf, null, { timeout: 90000 });
const autoHumans = (p) => p.evaluate(() => { const g = window.__kart.game; for (const pl of g.players) g.sim.karts[pl.kart].auto = true; });
async function runToEnd(p, maxSteps = 60 * 400) {
  return p.evaluate((max) => { const g = window.__kart.game; let n = 0; while (!g.over && n < max) { g.step(600); n += 600; } return { over: g.over, t: g.sim.t, state: g.sim.state }; }, maxSteps);
}
async function frames(p, n = 10, dt = 0.05) { await p.evaluate(({ n, dt }) => { const g = window.__kart.game; for (let i = 0; i < n; i++) { g.tick(); g.tick(); g.tick(); g.render(dt); } }, { n, dt }); }
const store = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('sala_kart_v1') || '{}'));

// ───────── menu at 4 viewports
if (ONLY.has('menu')) for (const [w, h] of [[1440, 900], [1024, 768], [390, 844], [844, 390]]) {
  const p = await page(w, h, { touch: w < 900 });
  await p.waitForTimeout(1200);
  await p.screenshot({ path: `${OUT}menu-${w}x${h}.png` });
  const over = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  ok(over <= 1, `menu ${w}x${h}: no horizontal overflow (${over})`);
  for (const tab of ['garage', 'coppe', 'comandi']) { await p.click(`.kt-tabs [data-id=${tab}]`); await p.waitForTimeout(400); if (w === 1440 || w === 390) await p.screenshot({ path: `${OUT}menu-${tab}-${w}x${h}.png` }); }
  await p.click('.kt-tabs [data-id=gioca]');
  for (const pg of ['gp', 'race', 'tt', 'battle', 'multi']) { await p.click(`.kt-mode[data-id=${pg}]`); await p.waitForTimeout(250); if (w === 1440 || w === 390) await p.screenshot({ path: `${OUT}menu-${pg}-${w}x${h}.png` }); await p.click('.kt-setup-h [data-a=kt-page]'); }
  await p.context().close();
}

// ───────── single race: results, coins, store
if (ONLY.has('race')) {
  const p = await page(1440, 900, { tier: 'high' });
  await p.click('.kt-mode[data-id=race]'); await p.click('[data-a=kt-go-race]');
  await waitGame(p); await manual(p);
  const vp = await p.evaluate(() => document.querySelectorAll('.kt-vp').length);
  ok(vp === 1, 'race: one viewport');
  await autoHumans(p);
  await p.evaluate(() => window.__kart.step(60 * 20));
  await frames(p, 14);
  await p.screenshot({ path: `${OUT}race-1440x900.png` });
  const r = await runToEnd(p);
  ok(r.over, `race: finished (${r.t.toFixed(1)} s)`);
  await p.waitForSelector('.kt-res', { timeout: 10000 });
  await p.screenshot({ path: `${OUT}race-results-1440x900.png` });
  const s = await store(p);
  ok(s.games === 1 && s.coins > 0, `race: store updated (games ${s.games}, coins ${s.coins})`);
  await p.click('[data-a=kt-back]'); await p.waitForSelector('.kt-menu');
  await p.context().close();
}

// ───────── items from the keyboard
if (ONLY.has('items')) {
  const p = await page(1024, 768);
  await p.evaluate(() => window.__kartPlay({ mode: 'race', track: 'spiaggia', players: [{ char: 'lella', input: { kb: 'all', pad: 0 } }] }));
  await waitGame(p); await manual(p);
  await p.evaluate(() => window.__kart.step(60 * 6));
  const res = {};
  for (const it of ['ricciolo', 'bomba', 'olio', 'peperoncino', 'scudo', 'calamita', 'moka']) {
    res[it] = await p.evaluate((it) => { const g = window.__kart.game, k = g.sim.karts[g.players[0].kart]; k.item = it; k.uses = it === 'tris' ? 3 : 1; k.roul = 0; k.input.item = 0; k.prevItem = 0; const before = g.sim.proj.length + g.sim.oils.length; return before; }, it);
    await p.keyboard.down('KeyE'); await p.evaluate(() => window.__kart.step(2)); await p.keyboard.up('KeyE'); await p.evaluate(() => window.__kart.step(2));
    res[it] = await p.evaluate(({ it, before }) => { const g = window.__kart.game, k = g.sim.karts[g.players[0].kart]; const n = g.sim.proj.length + g.sim.oils.length; return { used: k.item === null, spawned: n > before, shield: k.shieldT > 0, mag: k.magT > 0, moka: k.mokaT > 0, boost: k.boostT > 0 }; }, { it, before: res[it] });
    await p.evaluate(() => window.__kart.step(30));
  }
  ok(res.ricciolo.used && res.ricciolo.spawned, 'items: Ricciolo fired with E');
  ok(res.bomba.used && res.bomba.spawned, 'items: Bomba thrown');
  ok(res.olio.used && res.olio.spawned, 'items: oil dropped');
  ok(res.peperoncino.used && res.peperoncino.boost, 'items: Peperoncino boost');
  ok(res.scudo.shield && res.calamita.mag && res.moka.moka, 'items: shield, magnet, Super Moka');
  await frames(p, 6);
  await p.screenshot({ path: `${OUT}items-1024x768.png` });
  await p.context().close();
}

// ───────── Grand Prix: 4 races, standings, trophy, unlocks
if (ONLY.has('gp')) {
  const p = await page(1440, 900);
  await p.click('.kt-mode[data-id=gp]'); await p.click('[data-a=kt-cls][data-id=facile]'); await p.click('[data-a=kt-go-gp]');
  for (let race = 1; race <= 4; race++) {
    await waitGame(p); await manual(p); await autoHumans(p);
    // the human gets a strong kart for the test so a trophy is likely
    await p.evaluate(() => { const g = window.__kart.game; const k = g.sim.karts[g.players[0].kart]; k.st.top += 4; k.ai.skill = 1; });
    const r = await runToEnd(p);
    ok(r.over, `gp: race ${race} finished`);
    await p.waitForSelector('.kt-res', { timeout: 10000 });
    if (race < 4) { if (race === 1) await p.screenshot({ path: `${OUT}gp-standings-1440x900.png` }); await p.click('[data-a=kt-gp-next]'); await p.waitForFunction(() => !document.querySelector('.kt-res'), null, { timeout: 30000 }); }
  }
  await p.screenshot({ path: `${OUT}gp-trophy-1440x900.png` });
  const s = await store(p);
  ok(s.gp === null && s.trophies?.basilico?.facile > 0, `gp: trophy ${JSON.stringify(s.trophies)}`);
  ok(s.chars.includes('gino'), 'gp: Gino Granito unlocked with the cup');
  await p.context().close();
}

// ───────── time trial with ghost
if (ONLY.has('tt')) {
  const p = await page(1440, 900);
  await p.click('.kt-mode[data-id=tt]'); await p.click('[data-a=kt-go-tt]');
  await waitGame(p); await manual(p); await autoHumans(p);
  const r = await runToEnd(p);
  ok(r.over, 'tt: finished');
  await p.waitForSelector('.kt-res');
  await p.screenshot({ path: `${OUT}tt-results-1440x900.png` });
  const g = await p.evaluate(() => (JSON.parse(localStorage.getItem('sala_kart_ghost_prato') || '[]')).length);
  ok(g > 500, `tt: ghost saved (${g / 5} samples)`);
  await p.click('[data-a=kt-again]');
  await waitGame(p); await manual(p); await autoHumans(p);
  await p.evaluate(() => window.__kart.step(60 * 10)); await frames(p, 4);
  const gv = await p.evaluate(() => !!window.__kart.game.view.ghost?.visible);
  ok(gv, 'tt: ghost kart replayed');
  await frames(p, 8);
  await p.screenshot({ path: `${OUT}tt-ghost-1440x900.png` });
  await p.context().close();
}

// ───────── battle
if (ONLY.has('battle')) {
  const p = await page(1024, 768);
  await p.click('.kt-mode[data-id=battle]'); await p.click('[data-a=kt-go-battle]');
  await waitGame(p); await manual(p); await autoHumans(p);
  await p.evaluate(() => window.__kart.step(60 * 25)); await frames(p, 10);
  await p.screenshot({ path: `${OUT}battle-1024x768.png` });
  const r = await runToEnd(p, 60 * 200);
  ok(r.over, `battle: ended at ${r.t.toFixed(0)} s`);
  await p.waitForSelector('.kt-res');
  await p.screenshot({ path: `${OUT}battle-results-1024x768.png` });
  await p.context().close();
}

// ───────── split screen: 2 and 4 players, separate keyboard layouts
if (ONLY.has('split')) {
  for (const n of [2, 4]) {
    const p = await page(1440, 900);
    await p.click('.kt-mode[data-id=multi]'); await p.click(`[data-a=kt-mp-n][data-id="${n}"]`);
    if (n === 4) await p.click('[data-a=kt-mp-mode][data-id=battle]');
    await p.screenshot({ path: `${OUT}multi-setup-${n}p-1440x900.png` });
    await p.click('[data-a=kt-go-mp]');
    await waitGame(p); await manual(p);
    const vps = await p.evaluate(() => document.querySelectorAll('.kt-vp').length);
    ok(vps === n, `split ${n}P: ${vps} viewports`);
    await p.evaluate(() => window.__kart.step(60 * 4));
    await p.keyboard.down('KeyW'); await p.keyboard.down('ArrowUp'); await p.keyboard.down('ArrowLeft');
    await p.evaluate(() => window.__kart.step(60 * 2));
    const inp = await p.evaluate(() => { const g = window.__kart.game; return g.players.map((pl) => ({ ...g.sim.karts[pl.kart].input, sp: g.sim.karts[pl.kart].fwd })); });
    await p.keyboard.up('ArrowLeft');
    ok(inp[0].thr === 1 && inp[0].steer === 0 && inp[1].thr === 1 && inp[1].steer === -1, `split ${n}P: W drives P1, arrows drive P2 (${inp.map((i) => `${i.thr}/${i.steer}`).join(' ')})`);
    if (n === 4) ok(inp[2].thr === 0 && inp[3].thr === 0, 'split 4P: P3/P4 wait for their controllers');
    await p.keyboard.up('KeyW'); await p.keyboard.up('ArrowUp');
    await autoHumans(p);
    await p.evaluate(() => window.__kart.step(60 * 6)); await frames(p, 12);
    await p.screenshot({ path: `${OUT}split-${n}p-1440x900.png` });
    if (n === 2) { await p.setViewportSize({ width: 390, height: 844 }); await frames(p, 6); await p.screenshot({ path: `${OUT}split-2p-390x844.png` }); }
    const r = await runToEnd(p, 60 * 400);
    ok(r.over, `split ${n}P: race ended`);
    await p.waitForSelector('.kt-res'); await p.screenshot({ path: `${OUT}split-${n}p-results.png` });
    await p.context().close();
  }
}

// ───────── touch (phone portrait and landscape)
if (ONLY.has('touch')) {
  for (const [w, h] of [[390, 844], [844, 390], [1024, 768]]) {
    const p = await page(w, h, { touch: true });
    await p.evaluate(() => window.__kartPlay({ mode: 'race', track: 'canyon', players: [{ char: 'pina', input: { kb: 'all', pad: 0 } }] }));
    await waitGame(p); await manual(p);
    const has = await p.evaluate(() => !!document.querySelector('.ktt-drift'));
    ok(has, `touch ${w}x${h}: on-screen controls`);
    await p.evaluate(() => window.__kart.step(60 * 4));
    // hold drift + steer with real touches on the stick and buttons
    const box = await p.locator('.ktt-base').boundingBox();
    await p.evaluate(() => window.__kart.step(60 * 3));
    const before = await p.evaluate(() => { const g = window.__kart.game; return g.sim.karts[g.players[0].kart].fwd; });
    await p.dispatchEvent('.ktt-zone', 'pointerdown', { pointerId: 5, clientX: box.x + box.width - 4, clientY: box.y + box.height / 2, isPrimary: true, pointerType: 'touch' });
    await p.evaluate(() => window.__kart.step(30));
    const st = await p.evaluate(() => { const g = window.__kart.game; const k = g.sim.karts[g.players[0].kart]; return { steer: k.input.steer, thr: k.input.thr, fwd: k.fwd }; });
    await p.dispatchEvent('.ktt-zone', 'pointerup', { pointerId: 5, pointerType: 'touch' });
    ok(st.thr === 1 && st.steer > 0.5 && before > 5, `touch ${w}x${h}: auto gas + steer right (${st.steer.toFixed(2)}, ${before.toFixed(1)} m/s)`);
    await autoHumans(p);
    await p.evaluate(() => window.__kart.step(60 * 14)); await frames(p, 12);
    await p.screenshot({ path: `${OUT}race-touch-${w}x${h}.png` });
    await p.context().close();
  }
}

await browser.close();
ok(!errors.length, `console errors: ${errors.length}`);
for (const e of errors.slice(0, 15)) console.log('   ', e);
console.log(fails ? `${fails} FAILED` : 'all ok');
process.exitCode = fails ? 1 : 0;
