// Territorio browser check: menus, a single-player match, split-screen and shared-screen local
// multiplayer, results, at 4 viewport sizes. Reports console errors; screenshots to OUT.
//   npx vite build && npx vite preview --port 4662 --strictPort
//   node tools/territorio-shots.mjs [baseUrl] [outDir]
// Headless WebGL renders ~1 fps, so the match is advanced with window.__territorio.step(dt).
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }
const BASE = (process.argv[2] || 'http://127.0.0.1:4662/').replace(/\/?$/, '/');
const OUT = process.argv[3] || 'territorio-shots';
mkdirSync(OUT, { recursive: true });
const SIZES = [[1440, 900], [1024, 768], [390, 844], [844, 390]];
const IGNORE = /WebGL|GPU stall|THREE\.WebGLRenderer|AudioContext|favicon/i;
const errors = [];
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist'] });
const settings = JSON.stringify({ gfxTier: 'med', gfx: 'high', sound: false, music: false });
const store = (extra = {}) => JSON.stringify({ coins: 500, games: 3, wins: 1, mode: 'battaglia', map: 'prato', ...extra });

async function page(w, h, touch, st) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`${w}x${h} pageerror ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !IGNORE.test(m.text())) errors.push(`${w}x${h} console ${m.text()}`); });
  await p.addInitScript(([s, t]) => { localStorage.setItem('apexdynasty_settings', s); localStorage.setItem('sala_territorio_v1', t); }, [settings, st]);
  return p;
}
async function play(p, steps, auto = true) {
  await p.waitForFunction(() => window.__territorio?.sim && window.__territorio.views, null, { timeout: 60000 });
  return p.evaluate(([n, a]) => {
    const g = window.__territorio; g.hold = true; g.count = 0;
    if (a) for (const h of g.humans) h.auto = true;
    for (let i = 0; i < n && !g.sim.over; i++) g.step(1 / 30);
    return { t: g.sim.t.toFixed(1), me: g.sim.pctOf(g.me).toFixed(1), alive: g.me.alive, over: g.sim.over, players: g.sim.players.length, W: g.W };
  }, [steps, auto]);
}
const frame = (p, ms = 2500) => p.waitForTimeout(ms);

for (const [w, h] of SIZES) {
  const touch = w < 900 && h < 900;
  const tag = `${w}x${h}`;
  // menu tabs
  let p = await page(w, h, touch, store());
  await p.goto(BASE + '?game=territorio'); await p.waitForSelector('.tr-menu'); await p.waitForTimeout(1200);
  await p.screenshot({ path: `${OUT}/${tag}-menu.png`, fullPage: false });
  await p.click('[data-a=tr-tab][data-id=multi]'); await p.waitForTimeout(1200);
  await p.screenshot({ path: `${OUT}/${tag}-multi.png` });
  await p.click('[data-a=tr-tab][data-id=garage]'); await p.waitForTimeout(1200);
  await p.screenshot({ path: `${OUT}/${tag}-garage.png` });
  // overflow check on the menu
  const ov = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  if (ov > 2) errors.push(`${tag} menu horizontal overflow ${ov}px`);
  // single player match
  await p.click('[data-a=tr-tab][data-id=gioca]'); await p.waitForTimeout(200);
  await p.click('[data-a=tr-play]');
  const r1 = await play(p, 30 * 25);
  await frame(p);
  await p.screenshot({ path: `${OUT}/${tag}-game.png` });
  console.log(tag, 'sp', JSON.stringify(r1));
  // finish → results
  await p.evaluate(() => { const g = window.__territorio; g.sim.finish('time'); g.step(1 / 30); });
  await p.waitForSelector('.tr-res', { timeout: 10000 }).catch(() => errors.push(`${tag} no results`));
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${OUT}/${tag}-results.png` });
  await p.close();
  // local multiplayer: split (4 players in landscape-ish, 2 in portrait) and shared
  for (const view of ['diviso', 'condiviso']) {
    const n = view === 'diviso' ? (w > h ? 4 : 2) : 3;
    p = await page(w, h, touch, store({ mp: { n, view, mode: view === 'diviso' ? 'battaglia' : 'squadre', bots: 3, map: view === 'diviso' ? 'laghi' : 'cantiere', controls: ['wasd', 'frecce', 'ijkl', 'numpad'], colors: ['#ff4d6d', '#2f9bff', '#7ad13a', '#ffd21f'] } }));
    await p.goto(BASE + '?game=territorio'); await p.waitForSelector('.tr-menu');
    await p.click('[data-a=tr-tab][data-id=multi]'); await p.waitForTimeout(200);
    await p.click('[data-a=tr-mpplay]');
    const r = await play(p, 30 * 20);
    await frame(p);
    await p.screenshot({ path: `${OUT}/${tag}-mp-${view}.png` });
    console.log(tag, view, JSON.stringify(r));
    await p.evaluate(() => { const g = window.__territorio; g.sim.finish('time'); g.step(1 / 30); });
    await p.waitForSelector('.tr-res', { timeout: 10000 }).catch(() => errors.push(`${tag} ${view} no results`));
    if (view === 'condiviso') await p.screenshot({ path: `${OUT}/${tag}-mp-results.png` });
    await p.close();
  }
}
// controls: keyboard heading, pause on Escape, touch drag on a phone
{
  const p = await page(1024, 768, false, store({ mode: 'battaglia' }));
  await p.goto(BASE + '?game=territorio'); await p.waitForSelector('.tr-menu');
  await p.click('[data-a=tr-play]');
  await p.waitForFunction(() => window.__territorio?.sim && window.__territorio.views, null, { timeout: 60000 });
  await p.evaluate(() => { const g = window.__territorio; g.hold = true; g.count = 0; });
  const heading = async (key) => { await p.keyboard.down(key); const a = await p.evaluate(() => { const g = window.__territorio; g.step(1 / 30); return g.me.want; }); await p.keyboard.up(key); return a; };
  const near = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) < 0.01;
  if (!near(await heading('KeyD'), 0)) errors.push('keyboard D does not steer right');
  if (!near(await heading('ArrowUp'), -Math.PI / 2)) errors.push('arrow up does not steer up');
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  if (!(await p.$('.tr-pause'))) errors.push('Escape does not pause');
  await p.click('[data-a=tr-resume]');
  await p.close();
  const q = await page(390, 844, true, store({ mode: 'battaglia' }));
  await q.goto(BASE + '?game=territorio'); await q.waitForSelector('.tr-menu');
  await q.click('[data-a=tr-play]');
  await q.waitForFunction(() => window.__territorio?.sim && window.__territorio.views, null, { timeout: 60000 });
  const a = await q.evaluate(() => {
    const g = window.__territorio; g.hold = true; g.count = 0;
    const cv = g.cv, ev = (type, x, y) => cv.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'touch', clientX: x, clientY: y, bubbles: true }));
    ev('pointerdown', 200, 500); ev('pointermove', 200, 440); g.step(1 / 30);
    const up = g.me.want; ev('pointermove', 260, 440); g.step(1 / 30); const right = g.me.want; window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, pointerType: 'touch' }));
    return [up, right];
  });
  if (!near(a[0], -Math.PI / 2)) errors.push(`touch drag up gives ${a[0]}`);
  if (!(a[1] > -Math.PI / 2 && a[1] < 0)) errors.push(`touch drag up-right gives ${a[1]}`);
  await q.close();
  console.log('controls checked');
}
// the night arena and the daily one, desktop only
{
  const p = await page(1440, 900, false, store({ map: 'notte', mode: 'classica', vehicle: 'razzo', vehicles: ['cubo', 'razzo'], trail: 'arcobaleno', trails: ['liscia', 'arcobaleno'] }));
  await p.goto(BASE + '?game=territorio'); await p.waitForSelector('.tr-menu');
  await p.click('[data-a=tr-play]');
  const r = await play(p, 30 * 30); await frame(p);
  await p.screenshot({ path: `${OUT}/1440x900-notte.png` }); console.log('notte', JSON.stringify(r));
  await p.close();
  const q = await page(1440, 900, false, store());
  await q.goto(BASE + '?game=territorio'); await q.waitForSelector('.tr-menu');
  await q.click('[data-a=tr-daily]');
  const r2 = await play(q, 30 * 15); await frame(q);
  await q.screenshot({ path: `${OUT}/1440x900-daily.png` }); console.log('daily', JSON.stringify(r2));
  await q.close();
  // the hub lists the game
  const h = await page(1440, 900, false, store());
  await h.goto(BASE + '?nointro'); await h.waitForSelector('.bh-tab', { timeout: 30000 });
  const has = await h.evaluate(() => !!document.querySelector('.bh-tab[data-id=territorio]'));
  if (!has) errors.push('hub: territorio tab missing');
  await h.click('.bh-tab[data-id=territorio]'); await h.waitForTimeout(500);
  await h.screenshot({ path: `${OUT}/1440x900-hub.png` });
  await h.close();
}
await browser.close();
console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'no errors');
process.exit(errors.length ? 1 : 0);
