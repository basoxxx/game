// Arcade Baso browser test: hub tile, collection menu, shop, every game at desktop / tablet / phone
// portrait / phone landscape, inputs (keys, mouse, touch drag / swipe), pause, results, two players and
// the daily challenge. Headless WebGL is slow, so the loop is held and the test drives
// window.__arcade.step(dt) deterministically, rendering only for screenshots.
//   npx vite build && npx vite preview --port 4682 --strictPort
//   node tools/arcade-e2e.mjs [baseUrl] [outDir]
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const BASE = (process.argv[2] || 'http://127.0.0.1:4682/').replace(/\/?$/, '/');
const OUT = process.argv[3] || 'arcade-shots';
mkdirSync(OUT, { recursive: true });
const IGNORE = /GPU stall|AudioContext|favicon|ReadPixels|WebGL: CONTEXT_LOST|GL_CLOSE_PATH/i;
const issues = [];
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });

const VPS = [
  { name: 'desktop', vp: [1440, 900], tier: 'high' },
  { name: 'tablet', vp: [1024, 768], tier: 'med', touch: true },
  { name: 'phone-portrait', vp: [390, 844], tier: 'low', touch: true, mobile: true },
  { name: 'phone-landscape', vp: [844, 390], tier: 'med', touch: true, mobile: true },
];
const GAMES = (process.env.GAMES || 'astro,rimbalzo,corri,labirinto').split(',');
const only = process.env.ONLY;
for (const C of VPS) {
  if (only && !only.split(',').includes(C.name)) continue;
  const ctx = await browser.newContext({ viewport: { width: C.vp[0], height: C.vp[1] }, hasTouch: !!C.touch, isMobile: !!C.mobile, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => issues.push(`${C.name} pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !IGNORE.test(m.text())) issues.push(`${C.name} console: ${m.text()}`); });
  await page.addInitScript(([c]) => {
    localStorage.setItem('apexdynasty_settings', JSON.stringify({ gfxTier: c.tier, gfx: c.tier === 'low' ? 'low' : 'high', sound: false, music: false }));
    if (!localStorage.getItem('baso_arcade_v1')) localStorage.setItem('baso_arcade_v1', JSON.stringify({ coins: 1000, unlock: { astro: 2, rimbalzo: 12, labirinto: 3 } }));
  }, [C]);
  await page.goto(BASE + '?game=arcade');
  await page.waitForSelector('.ar-menu [data-a=ar-open]', { timeout: 30000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${C.name}-home.png`, fullPage: true });
  const ov = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  if (ov > 2) issues.push(`${C.name} menu overflows horizontally by ${ov}px`);
  if (C.name === 'desktop') {
    // shop: buy a colour with the seeded coins
    await page.click('[data-a=ar-buy][data-k=skin][data-id=menta]');
    await page.waitForSelector('.modal-wrap', { timeout: 5000 }).catch(() => issues.push(`${C.name}: no purchase dialog`));
    await page.evaluate(() => document.querySelector('.modal-wrap .btn.primary, .modal-wrap [data-a="modal-yes"], .modal-wrap button.primary')?.click());
    await page.waitForTimeout(200);
    const st = await page.evaluate(() => JSON.parse(localStorage.getItem('baso_arcade_v1')));
    if (!st.owned.skin.includes('menta') || st.skin !== 'menta' || st.coins !== 850) issues.push(`${C.name}: purchase failed (${JSON.stringify(st.owned)}, ${st.coins})`);
    await page.click('[data-a=ar-tab][data-id=trail]'); await page.click('[data-a=ar-buy][data-k=trail][data-id=stelle]');
    await page.evaluate(() => document.querySelector('.modal-wrap .btn.primary, .modal-wrap button.primary')?.click());
    await page.waitForTimeout(150);
  }
  for (const g of GAMES) {
    const two = (C.name === 'tablet' && g === 'astro') || (C.name === 'phone-landscape' && g === 'rimbalzo');
    await page.evaluate(() => window.__apex.App.go('arcade', { page: 'home' }));
    await page.waitForSelector(`[data-a=ar-open][data-id=${g}]`);
    await page.click(`[data-a=ar-open][data-id=${g}]`);
    await page.waitForSelector('.ar-go [data-a=ar-play]');
    if (two) await page.click('[data-a=ar-players][data-v="2"]');
    if (g === 'labirinto' && C.name === 'phone-portrait') await page.click('[data-a=ar-touch][data-v=dpad]');
    if (g === 'rimbalzo' && C.name === 'tablet') await page.click('[data-a=ar-opt][data-k=endless][data-v="1"]');
    await page.waitForTimeout(150);
    const ov2 = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    if (ov2 > 2) issues.push(`${C.name} ${g} setup overflows by ${ov2}px`);
    if (C.name !== 'desktop' || g === 'astro') await page.screenshot({ path: `${OUT}/${C.name}-${g}-setup.png`, fullPage: true });
    await page.click('[data-a=ar-play]');
    await page.waitForFunction(() => window.__arcade?.view && window.__arcade.sim, null, { timeout: 60000 });
    const info = await page.evaluate((game) => {
      const h = window.__arcade; h.hold = true;
      const auto = () => { const s = h.sim; if (game === 'astro') s.ships.forEach((q) => { q.auto = true; }); else s.auto = true; if (game === 'labirinto' || game === 'astro') s.o.god = true; };
      auto();
      const t0 = performance.now();
      for (let i = 0; i < 60 * 14; i++) h.step(1 / 60);
      const ms = performance.now() - t0;
      h.render();
      const s = h.sim;
      return { ms: Math.round(ms), score: s.score, over: s.over, n: game === 'astro' ? s.enemies.length + s.ebullets.length : game === 'rimbalzo' ? s.left : game === 'corri' ? Math.round(s.dist) : s.dotsLeft };
    }, g);
    console.log(C.name, g, JSON.stringify(info));
    if (!(info.score > 0)) issues.push(`${C.name} ${g}: no score after 14 s (${JSON.stringify(info)})`);
    // inputs
    const inp = await page.evaluate(async (a) => {
      const h = window.__arcade, s = h.sim, cv = h.cv, R = cv.getBoundingClientRect(), out = {};
      const key = (code, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true }));
      const touch = (type, x, y) => (type === 'pointerup' ? window : cv).dispatchEvent(new PointerEvent(type, { pointerType: 'touch', pointerId: 9, clientX: x, clientY: y, bubbles: true }));
      if (a.game === 'astro') { const q = s.ships[0]; q.auto = false; key('KeyD', true); h.step(1 / 60); out.ax = q.input.ax; key('KeyD', false); const x0 = q.x; if (a.touch) { touch('pointerdown', R.width / 2, R.height * 0.7); touch('pointermove', R.width / 2 + 60, R.height * 0.7); h.step(1 / 60); touch('pointerup', R.width / 2 + 60, R.height * 0.7); out.drag = q.x - x0; } q.auto = true; }
      if (a.game === 'rimbalzo') { s.auto = false; s.input.px = null; const x0 = s.paddle.x, k = x0 > 52 ? 'ArrowLeft' : 'ArrowRight'; key(k, true); for (let i = 0; i < 10; i++) h.step(1 / 60); key(k, false); out.left = (s.paddle.x - x0) * (k === 'ArrowLeft' ? 1 : -1); if (a.touch) { touch('pointerdown', R.width * 0.8, R.height * 0.8); h.step(1 / 60); h.step(1 / 60); out.px = s.input.px; touch('pointerup', R.width * 0.8, R.height * 0.8); } s.auto = true; }
      if (a.game === 'corri') { s.auto = false; s.o.god = true; const l0 = s.p.lane; key('ArrowLeft', true); h.step(1 / 60); key('ArrowLeft', false); out.lane = s.p.lane - l0; for (let i = 0; i < 20; i++) h.step(1 / 60); if (a.touch) { const l1 = s.p.lane; touch('pointerdown', R.width / 2, R.height / 2); touch('pointermove', R.width / 2 + 80, R.height / 2); h.step(1 / 60); touch('pointerup', R.width / 2 + 80, R.height / 2); out.swipe = s.p.lane - l1; } s.o.god = false; s.auto = true; }
      if (a.game === 'labirinto') { s.auto = false; key('ArrowUp', true); h.step(1 / 60); key('ArrowUp', false); out.want = s.input.want?.join(','); if (a.touch) { touch('pointerdown', R.width / 2, R.height / 2); touch('pointermove', R.width / 2 - 80, R.height / 2); h.step(1 / 60); touch('pointerup', R.width / 2 - 80, R.height / 2); out.swipe = s.input.want?.join(','); } s.auto = true; }
      return out;
    }, { game: g, touch: !!C.touch });
    if (g === 'astro' && (!(inp.ax > 0.5) || (C.touch && !(inp.drag > 1)))) issues.push(`${C.name} astro input ${JSON.stringify(inp)}`);
    if (g === 'rimbalzo' && (!(inp.left < -5) || (C.touch && !(inp.px > 60)))) issues.push(`${C.name} rimbalzo input ${JSON.stringify(inp)}`);
    if (g === 'corri' && (inp.lane !== -1 && inp.lane !== 0 || (C.touch && inp.swipe !== 1))) issues.push(`${C.name} corri input ${JSON.stringify(inp)}`);
    if (g === 'labirinto' && (inp.want !== '0,-1' || (C.touch && inp.swipe !== '-1,0'))) issues.push(`${C.name} labirinto input ${JSON.stringify(inp)}`);
    await page.evaluate(() => { const h = window.__arcade; for (let i = 0; i < 30; i++) h.step(1 / 60); h.render(); });
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${OUT}/${C.name}-${g}-game.png` });
    // pause
    if (C.name === 'desktop') { await page.keyboard.press('Escape'); await page.waitForTimeout(100); } else await page.evaluate(() => window.__arcade.togglePause(true));
    await page.waitForSelector('.ar-pause', { timeout: 3000 }).catch(() => issues.push(`${C.name} ${g}: no pause`));
    if (g === 'astro') await page.screenshot({ path: `${OUT}/${C.name}-${g}-pause.png` });
    await page.evaluate(() => window.__arcade.togglePause(false));
    // end the game (both turns when two players alternate)
    const end = await page.evaluate(() => {
      const h = window.__arcade;
      const kill = () => { const s = h.sim; s.o.god = false; if (s.crash) s.crash({ type: 'block' }); else s.finish(false); };
      kill(); for (let i = 0; i < 30; i++) h.step(1 / 60);
      if (h.mode2 === 'alt') { for (let i = 0; i < 60 * 4; i++) h.step(1 / 60); h.render(); for (let i = 0; i < 60 * 3; i++) h.step(1 / 60); kill(); for (let i = 0; i < 30; i++) h.step(1 / 60); }
      return { over: h.over, turns: h.results.length, mode2: h.mode2 };
    });
    if (!end.over) issues.push(`${C.name} ${g}: game did not end ${JSON.stringify(end)}`);
    if (two && g === 'rimbalzo' && end.turns !== 2) issues.push(`${C.name} ${g}: alternate turns ${JSON.stringify(end)}`);
    await page.waitForSelector('.ar-res', { timeout: 8000 }).catch(() => issues.push(`${C.name} ${g}: no results`));
    await page.evaluate(() => window.__arcade?.render());
    await page.screenshot({ path: `${OUT}/${C.name}-${g}-results.png` });
    const modal = await page.evaluate(() => document.querySelector('.modal-wrap')?.innerText);
    if (modal) { issues.push(`${C.name}: unexpected dialog: ${modal.slice(0, 300)}`); await page.evaluate(() => window.__apex.App.closeModal()); }
    // rematch then back
    await page.evaluate(() => { window.__prevHost = window.__arcade; });
    await page.click('[data-a=ar-again]');
    await page.waitForFunction(() => window.__arcade?.sim && window.__arcade !== window.__prevHost, null, { timeout: 30000 }).catch(() => issues.push(`${C.name} ${g}: rematch failed`));
    await page.evaluate(() => { window.__arcade.hold = true; });
  }
  const st = await page.evaluate(() => JSON.parse(localStorage.getItem('baso_arcade_v1')));
  if (GAMES.some((g) => !st.scores[g]?.length)) issues.push(`${C.name}: scores not saved ${JSON.stringify(st.scores)}`);
  if (C.name === 'desktop' && !(st.missions?.length === 3)) issues.push(`${C.name}: runner missions missing`);
  // daily challenge
  await page.evaluate(() => window.__apex.App.go('arcade', { daily: 1 }));
  await page.waitForFunction(() => window.__arcade?.sim, null, { timeout: 60000 });
  const daily = await page.evaluate(() => { const h = window.__arcade; h.hold = true; for (let i = 0; i < 200; i++) h.step(1 / 60); const s = h.sim; s.o.god = false; if (s.crash) s.crash({ type: 'block' }); else s.finish(false); for (let i = 0; i < 30; i++) h.step(1 / 60); return { game: h.o.game, over: h.over, daily: !!h.o.daily }; });
  if (!daily.over || !daily.daily) issues.push(`${C.name}: daily ${JSON.stringify(daily)}`);
  await page.waitForSelector('.ar-res', { timeout: 8000 }).catch(() => issues.push(`${C.name}: no daily results`));
  if (C.name === 'desktop') await page.screenshot({ path: `${OUT}/${C.name}-daily-results.png` });
  const d2 = await page.evaluate(() => JSON.parse(localStorage.getItem('baso_arcade_v1')).daily);
  if (!d2?.done) issues.push(`${C.name}: daily not saved`);
  await page.evaluate(() => window.__apex.App.go('launcher'));
  await page.waitForTimeout(600);
  if (C.name === 'desktop') {
    await page.evaluate(() => document.querySelector('[data-a=bh-game][data-id=arcade]')?.click());
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/${C.name}-hub.png` });
    const modes = await page.evaluate(() => document.body.textContent.includes('Sfida del giorno') && document.body.textContent.includes('Labirinto Goloso'));
    if (!modes) issues.push('hub: arcade modes not shown');
  }
  await ctx.close();
}
await browser.close();
if (issues.length) { console.log('ISSUES:\n' + issues.join('\n')); process.exit(1); }
console.log('arcade e2e ok');
