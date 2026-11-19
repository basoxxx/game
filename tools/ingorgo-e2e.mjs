// Ingorgo end-to-end: opens the game in a real browser, solves levels THROUGH THE UI (mouse drags /
// taps / keyboard computed from the solver's moves), checks the results, the daily, zen and the
// garage, and takes screenshots at several sizes. Needs a running preview:
//   npx vite preview --port 4661 --strictPort &   node tools/ingorgo-e2e.mjs [baseUrl] [outDir]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }
const BASE = process.argv[2] || 'http://127.0.0.1:4661/';
const OUT = process.argv[3] || 'tmp-ingorgo-shots';
const ONLY = process.env.ONLY || '';
mkdirSync(OUT, { recursive: true });
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist'] });
const errors = [];
const settings = JSON.stringify({ gfxTier: 'med', gfx: 'high', sound: false, music: false });
let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.log('FAIL', msg); } else console.log('ok  ', msg); };

async function newPage(w, h, store) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 900, isMobile: false });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${w}x${h}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[${w}x${h}] ${e.message}`));
  await page.addInitScript(([s, st]) => { localStorage.setItem('apexdynasty_settings', s); if (st) localStorage.setItem('sala_ingorgo_v1', st); }, [settings, store ? JSON.stringify(store) : null]);
  return page;
}
const game = (page) => page.waitForFunction(() => window.__ingorgo?.renderer, null, { timeout: 90000 });
const settle = (page, t = 1.5) => page.evaluate((t) => { for (let i = 0; i < 30; i++) window.__ingorgo?.step(t / 30); }, t);

// play one move through the UI: drag the vehicle along its axis (or tap to leave, or drag the ferry)
async function uiMove(page, m) {
  const info = await page.evaluate((m) => {
    const g = window.__ingorgo, B = g.B;
    if (m[0] < 0) { const a = g.ferryScreen(); const b = g.toScreen(g.ferry.position.x, 0.1, g.ferry.position.z + (m[1] - g.s[B.n])); return { a, b }; }
    const c = B.cars[m[0]], a = g.carScreen(m[0]), ax = g.axisScreen(m[0]);
    if (m[1] === -99) return { tap: true, a };
    const d = m[1] - g.s[m[0]];
    return { a, b: { x: a.x + ax.x * d, y: a.y + ax.y * d } };
  }, m);
  if (info.tap) { await page.mouse.click(info.a.x, info.a.y); }
  else {
    await page.mouse.move(info.a.x, info.a.y); await page.mouse.down();
    const N = 6; for (let k = 1; k <= N; k++) await page.mouse.move(info.a.x + (info.b.x - info.a.x) * k / N, info.a.y + (info.b.y - info.a.y) * k / N);
    await page.waitForTimeout(300); // no flick: let the release speed settle
    await page.mouse.up();
  }
  await settle(page, 1.2);
}
async function solveViaUI(page, max = 80) {
  let n = 0;
  for (; n < max; n++) {
    const st = await page.evaluate(() => { const g = window.__ingorgo; return g ? { done: g.done } : null; });
    if (!st || st.done) break;
    const moves = await page.evaluate(() => window.__ingorgo.solveNow());
    if (!moves?.length) { console.log('  solver gave no move', JSON.stringify(await page.evaluate(() => window.__ingorgo.info()))); break; }
    const before = await page.evaluate(() => window.__ingorgo.moves);
    await uiMove(page, moves[0]);
    const after = await page.evaluate(() => window.__ingorgo?.moves ?? -1);
    if (process.env.DEBUG) console.log('  move', JSON.stringify(moves[0]), 'moves', before, '->', after, JSON.stringify(await page.evaluate(() => window.__ingorgo && [window.__ingorgo.info().state, window.__ingorgo.done])));
    if (after === before) { // the drag missed: fall back to the hook so the run goes on, but count it
      console.log('  drag missed', JSON.stringify(moves[0]));
      fails++;
      await page.evaluate((m) => window.__ingorgo.doMove(m), moves[0]); await settle(page, 1);
    }
  }
  if (n >= max) console.log('  gave up after', n, 'moves');
  return n;
}
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png`, timeout: 120000 });

// ---- 1. desktop: menu, level 1-1 solved via UI, results, next level
if (!ONLY || ONLY === 'desk') {
  const page = await newPage(1440, 900);
  await page.goto(BASE + '?game=ingorgo');
  await page.waitForSelector('.ig-menu', { timeout: 60000 });
  await shot(page, 'menu-1440x900');
  await page.click('[data-a=ig-next]');
  await game(page); await page.waitForTimeout(1500); await settle(page);
  await shot(page, 'level1-1440x900');
  const opt = await page.evaluate(() => window.__ingorgo.L.opt);
  const used = await solveViaUI(page);
  await page.waitForSelector('.ig-res', { timeout: 30000 });
  const res = await page.evaluate(() => ({ moves: window.__ingorgo?.result?.moves, stars: window.__ingorgo?.result?.stars, txt: document.querySelector('.ig-res h2')?.textContent }));
  ok(res.moves === opt && res.stars === 3, `1-1 solved via UI in ${used} moves (opt ${opt}), ${res.stars} stars, "${res.txt}"`);
  await page.waitForTimeout(600);
  await shot(page, 'results-1440x900');
  // next level + a hint + undo through the HUD buttons
  await page.click('[data-a=ig-go-next]'); await game(page); await page.waitForTimeout(800);
  await page.click('[data-k=hint]'); await page.waitForFunction(() => window.__ingorgo.hintMove, null, { timeout: 30000 });
  await settle(page, 0.5); await shot(page, 'hint-1440x900');
  const hm = await page.evaluate(() => window.__ingorgo.hintMove);
  await uiMove(page, hm);
  ok(await page.evaluate(() => window.__ingorgo.moves === 1 && !window.__ingorgo.hintMove), 'hint followed via drag');
  await page.click('[data-k=undo]'); await settle(page);
  ok(await page.evaluate(() => window.__ingorgo.moves === 0), 'undo button');
  // keyboard: Tab to select, arrows to slide
  await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
  const sel = await page.evaluate(() => window.__ingorgo.sel);
  ok(sel >= 0, `keyboard selection (${sel})`);
  await page.keyboard.press('Escape'); await page.waitForSelector('.ig-pause');
  await page.click('[data-a=ig-quit]'); await page.waitForSelector('.ig-world');
  await shot(page, 'levels-1440x900');
  await page.close();
}

// ---- 2. every world's first level via UI at phone portrait (+ ferry, lights, one-way)
if (!ONLY || ONLY === 'worlds') {
  const store = { stars: Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`c${i + 1}`, 3])), coins: 500 };
  const LV = (process.env.LEVELS || '11,21,31,41,51').split(',').map(Number);
  const SZ = { 11: [390, 844], 21: [844, 390], 31: [1024, 768], 41: [390, 844], 51: [1440, 900] };
  for (const n of LV) {
    const size = SZ[n] || [1024, 768];
    const page = await newPage(size[0], size[1], store);
    await page.goto(BASE + '?game=ingorgo');
    await page.waitForSelector('.ig-menu', { timeout: 60000 });
    await page.click('[data-a=ig-tab][data-v=livelli]');
    await page.click(`.ig-wt[data-w="${Math.floor((n - 1) / 10)}"]`);
    await page.click(`[data-a=ig-level][data-n="${n}"]`);
    await game(page); await page.waitForTimeout(1200); await settle(page);
    const tag = `w${Math.floor((n - 1) / 10) + 1}-${size[0]}x${size[1]}`;
    await shot(page, `${tag}-start`);
    const opt = await page.evaluate(() => window.__ingorgo.L.opt);
    await solveViaUI(page);
    await page.waitForSelector('.ig-res', { timeout: 30000 });
    const r = await page.evaluate(() => window.__ingorgo?.result);
    ok(r?.win && r.moves === opt, `level ${n} (${tag}) solved via UI: ${r?.moves}/${opt} moves`);
    await page.waitForTimeout(500);
    await shot(page, `${tag}-end`);
    await page.close();
  }
}

// ---- 3. daily (share), zen, garage at the four sizes
if (!ONLY || ONLY === 'modes') {
  for (const [w, h] of [[390, 844], [844, 390], [1024, 768], [1440, 900]]) {
    const page = await newPage(w, h, { coins: 300, solved: 3, stars: { c1: 3, c2: 2, c3: 1 } });
    await page.goto(BASE + '?game=ingorgo');
    await page.waitForSelector('.ig-menu', { timeout: 60000 });
    await shot(page, `menu-${w}x${h}`);
    await page.click('[data-a=ig-tab][data-v=garage]'); await page.waitForSelector('.ig-items');
    await shot(page, `garage-${w}x${h}`);
    if (w === 390) {
      await page.click('[data-a=ig-buy][data-k=paint][data-id=giallo]'); await page.click('.modal-wrap [data-a=yes]');
      ok(await page.evaluate(() => JSON.parse(localStorage.getItem('sala_ingorgo_v1')).paint === 'giallo'), 'garage: bought a paint');
    }
    await page.click('[data-a=ig-tab][data-v=daily]'); await page.waitForSelector('.ig-daily');
    await shot(page, `daily-menu-${w}x${h}`);
    if (w === 390 || w === 1440) {
      await page.click('[data-a=ig-daily]'); await game(page); await page.waitForTimeout(800); await settle(page);
      await shot(page, `daily-play-${w}x${h}`);
      await solveViaUI(page);
      await page.waitForSelector('.ig-res .ig-share', { timeout: 30000 });
      const share = await page.evaluate(() => document.querySelector('.ig-share').textContent);
      ok(/Ingorgo #\d+/.test(share), `daily solved via UI, share text:\n${share}`);
      await page.waitForTimeout(500); await shot(page, `daily-res-${w}x${h}`);
      await page.click('[data-a=ig-quit]');
      await page.click('[data-a=ig-tab][data-v=zen]'); await page.click('[data-a=ig-zen]');
      await game(page); await page.waitForTimeout(800); await settle(page);
      await shot(page, `zen-${w}x${h}`);
      await solveViaUI(page);
      await page.waitForSelector('.ig-res', { timeout: 30000 });
      ok(true, `zen puzzle solved via UI (${w}x${h})`);
      await page.click('[data-a=ig-go-next]'); await game(page); await page.waitForTimeout(500);
      ok(await page.evaluate(() => !!window.__ingorgo.L.opt), 'zen: next puzzle');
    }
    await page.close();
  }
}
// ---- 4. hub entry
if (!ONLY || ONLY === 'hub') {
  const page = await newPage(1440, 900);
  await page.goto(BASE);
  await page.waitForSelector('.bh-tab[data-id=ingorgo]', { timeout: 60000 });
  await page.click('.bh-tab[data-id=ingorgo]'); await page.waitForTimeout(500);
  await shot(page, 'hub-1440x900');
  const modes = await page.evaluate(() => [...document.querySelectorAll('.bh-mode b')].map((b) => b.textContent));
  ok(modes.join('|') === 'Gioca|Livelli|Puzzle del giorno|Zen', `hub modes: ${modes.join(', ')}`);
  await page.click('.bh-mode[data-m=gioca]'); await game(page);
  ok(true, 'hub: Gioca opens a level');
  await page.close();
}
await browser.close();
console.log(errors.length ? `console errors:\n${errors.join('\n')}` : 'no console errors');
console.log(fails ? `${fails} FAILURES` : 'ALL OK');
process.exit(fails || errors.length ? 1 : 0);
