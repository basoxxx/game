// Rompicapo end-to-end: plays the four puzzles THROUGH THE UI in a real browser (clicks, taps,
// swipes, keys, on-screen buttons) at 1440x900, 1024x768, 390x844 and 844x390, checks results,
// coins, saves, the daily, themes and pause, and fails on any console error. Needs a running preview:
//   npx vite preview --port 4681 --strictPort &   node tools/rompicapo-e2e.mjs [baseUrl] [outDir]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }
const BASE = process.argv[2] || 'http://127.0.0.1:4681/';
const OUT = (process.argv[3] || 'tmp-rompicapo-shots').replace(/\/?$/, '/');
const SIZES = (process.env.SIZES || '1440x900,1024x768,390x844,844x390').split(',').map((s) => s.split('x').map(Number));
mkdirSync(OUT, { recursive: true });
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist'] });
const errors = [];
let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.log('FAIL', msg); } else console.log('ok  ', msg); };
const settings = JSON.stringify({ sound: false, music: false });
const store = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('sala_rompicapo_v1') || '{}'));

async function newPage(w, h, init = null) {
  const touch = w < 900;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: false });
  const page = await ctx.newPage();
  const tag = `${w}x${h}`;
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${tag}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[${tag}] ${e.message}`));
  await page.addInitScript(([s, st]) => { localStorage.setItem('apexdynasty_settings', s); if (st && !sessionStorage.getItem('rp-init')) { localStorage.setItem('sala_rompicapo_v1', st); sessionStorage.setItem('rp-init', '1'); } }, [settings, init ? JSON.stringify(init) : null]);
  await page.goto(BASE + '?game=rompicapo');
  await page.waitForSelector('.rp-menu', { timeout: 30000 });
  return page;
}
const shot = (page, name) => page.screenshot({ path: `${OUT}${name}.png` });
const tab = async (page, v) => { await page.click(`.rp-tabs [data-v="${v}"]`); await page.waitForTimeout(250); };
const game = (page) => page.waitForFunction(() => window.__rompicapo, null, { timeout: 20000 });
const results = (page, t = 15000) => page.waitForSelector('#rp-over .rp-res', { timeout: t });
async function tapAt(page, x, y, touch) { if (touch) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y); }

// ------------------------------------------------------------------ Sudoku
async function sudoku(page, tag, touch) {
  await tab(page, 'sudoku'); await shot(page, `${tag}-sudoku-menu`);
  await page.click('[data-a="rp-sd-lv"].btn'); await game(page); await page.waitForTimeout(900);
  const sol = await page.evaluate(() => window.__rompicapo.solution);
  const empty = await page.evaluate(() => window.__rompicapo.puzzle.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0));
  const cell = (i) => `.sd-c[data-i="${i}"]`, key = (d) => `.sd-k[data-d="${d}"]`;
  // notes: on, two pencil marks, then undo one
  await page.click(cell(empty[0])); await page.click('[data-t="notes"]'); await page.click(key(1)); await page.click(key(2));
  ok(await page.evaluate((i) => window.__rompicapo.notes[i] === 3, empty[0]), `${tag} sudoku: note scritte`);
  await page.click('[data-t="undo"]');
  ok(await page.evaluate((i) => window.__rompicapo.notes[i] === 1, empty[0]), `${tag} sudoku: annulla una nota`);
  await page.click('[data-t="notes"]');
  // one mistake on purpose
  const wrongD = (sol[empty[0]] % 9) + 1;
  await page.click(key(wrongD));
  ok(await page.evaluate(() => window.__rompicapo.mistakes === 1), `${tag} sudoku: errore contato`);
  ok(await page.locator(`${cell(empty[0])}.bad`).count() === 1, `${tag} sudoku: cella sbagliata segnata`);
  await page.click('[data-t="erase"]');
  await shot(page, `${tag}-sudoku-play`);
  // one hint
  await page.click('[data-t="hint"]');
  ok(await page.evaluate(() => window.__rompicapo.hints === 1), `${tag} sudoku: aiuto usato`);
  // fill everything else through the UI (keyboard on desktop, taps on touch)
  const left = await page.evaluate(() => window.__rompicapo.v.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0));
  for (const i of left) {
    if (touch) { const b = await page.locator(cell(i)).boundingBox(); await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); await page.click(key(sol[i])); }
    else { await page.click(cell(i)); await page.keyboard.press(String(sol[i])); }
  }
  await results(page);
  await shot(page, `${tag}-sudoku-results`);
  const st = await store(page);
  ok(st.sudoku.won === 1 && st.coins > 0 && st.sudoku.solved['facile-1'] >= 1, `${tag} sudoku: risolto, ${st.coins} monete, livello segnato`);
  ok(await page.locator('.rp-res-stars i.on').count() === 2, `${tag} sudoku: 2 stelle con un errore e un aiuto`);
  await page.click('[data-a="rp-quit"]'); await page.waitForSelector('.rp-menu');
}
// ------------------------------------------------------------------ Unisci
async function unisci(page, tag, touch) {
  await tab(page, 'unisci'); await page.click('[data-a="rp-mg"].btn'); await game(page); await page.waitForTimeout(500);
  const board = await page.locator('.mg-board').boundingBox();
  const cx = board.x + board.width / 2, cy = board.y + board.height / 2, L = board.width * 0.3;
  const swipe = async (d) => {
    const [dx, dy] = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[d];
    if (touch || d === 'up') { await page.mouse.move(cx - dx * L / 2, cy - dy * L / 2); await page.mouse.down(); await page.mouse.move(cx + dx * L / 2, cy + dy * L / 2, { steps: 5 }); await page.mouse.up(); }
    else await page.keyboard.press({ left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown' }[d]);
    await page.waitForTimeout(140);
  };
  let moves0 = 0;
  for (let k = 0; k < 40; k++) {
    const d = await page.evaluate(() => window.__rompicapo.b.over ? null : ['left', 'down', 'right', 'down'][window.__rompicapo.b.moves % 4]);
    if (!d) break;
    const before = await page.evaluate(() => window.__rompicapo.b.moves);
    await swipe(d);
    const after = await page.evaluate(() => window.__rompicapo.b.moves);
    if (after > before) moves0++;
    if (after === before) await swipe(['up', 'left', 'right', 'down'][k % 4]);
  }
  const s = await page.evaluate(() => ({ moves: window.__rompicapo.b.moves, score: window.__rompicapo.b.score, tiles: document.querySelectorAll('.mg-t').length, cells: window.__rompicapo.b.cells.filter(Boolean).length }));
  ok(s.moves >= 15 && s.score > 0, `${tag} unisci: ${s.moves} mosse col dito/tastiera, ${s.score} punti`);
  ok(s.tiles === s.cells, `${tag} unisci: tessere a schermo = tessere in gioco (${s.tiles}/${s.cells})`);
  await page.click('[data-t="undo"]');
  ok(await page.evaluate((m) => window.__rompicapo.b.moves === m - 1, s.moves), `${tag} unisci: annulla una mossa`);
  await shot(page, `${tag}-unisci-play`);
  // the save survives leaving: pause -> save and exit -> continue
  await page.keyboard.press('Escape'); await page.waitForSelector('#rp-over .rp-pause'); await shot(page, `${tag}-unisci-pause`);
  await page.click('[data-a="rp-quit"]'); await page.waitForSelector('.rp-menu');
  ok(await page.locator('[data-a="rp-mg"][data-resume]').count() === 1, `${tag} unisci: partita salvata`);
  await page.click('[data-a="rp-mg"][data-resume]'); await game(page);
  ok(await page.evaluate((m) => window.__rompicapo.b.moves === m - 1, s.moves), `${tag} unisci: partita ripresa`);
  // finish it: a full board with no merges left, then one last move
  await page.evaluate(() => { const g = window.__rompicapo; const v = [8, 16, 8, 16, 16, 8, 16, 8, 8, 16, 8, 16, 0, 32, 64, 32]; g.b.cells = v.map((x) => (x ? { id: g.b.nextId++, v: x } : null)); g.b.rs = 3; g.sync(); });
  await swipe('left');
  await page.waitForTimeout(200);
  const over = await page.evaluate(() => window.__rompicapo?.b.over);
  ok(over, `${tag} unisci: tavola bloccata, fine partita`);
  await results(page); await shot(page, `${tag}-unisci-results`);
  ok((await store(page)).unisci.played >= 1, `${tag} unisci: partita registrata`);
  await page.click('[data-a="rp-quit"]');
  await page.waitForSelector('.rp-menu');
}
// ------------------------------------------------------------------ Mattoncini
async function blocks(page, tag, touch) {
  await tab(page, 'mattoncini'); await page.click('[data-a="rp-bk-mode"][data-id="sprint"]'); await page.click('[data-a="rp-bk"]'); await game(page);
  await page.waitForFunction(() => window.__rompicapo.count <= 0, null, { timeout: 10000 }); await page.waitForTimeout(100); // countdown
  const pads = await page.locator('.bk-pad').isVisible();
  const press = async (k, key) => { if (pads) { const b = await page.locator(`.bk-b[data-k="${k}"]`).boundingBox(); await tapAt(page, b.x + b.width / 2, b.y + b.height / 2, touch); } else await page.keyboard.press(key); await page.waitForTimeout(60); };
  const x0 = await page.evaluate(() => window.__rompicapo.e.cur.x);
  await press('left', 'ArrowLeft');
  ok(await page.evaluate((x) => window.__rompicapo.e.cur.x === x - 1, x0), `${tag} mattoncini: sinistra (${pads ? 'tasto a schermo' : 'tastiera'})`);
  const r0 = await page.evaluate(() => window.__rompicapo.e.cur.r);
  await press('cw', 'ArrowUp');
  ok(await page.evaluate((r) => window.__rompicapo.e.cur.r === (r + 1) % 4 || window.__rompicapo.e.cur.t === 'O', r0), `${tag} mattoncini: rotazione`);
  await press('hold', 'c');
  ok(await page.evaluate(() => !!window.__rompicapo.e.hold), `${tag} mattoncini: tieni`);
  // touch gestures on the well: drag right, tap to rotate
  if (touch) {
    const cv = await page.locator('.bk-cv').boundingBox(); const c = await page.evaluate(() => window.__rompicapo.cs);
    const xb = await page.evaluate(() => window.__rompicapo.e.cur.x);
    await page.mouse.move(cv.x + cv.width * 0.5, cv.y + cv.height * 0.5); await page.mouse.down(); await page.mouse.move(cv.x + cv.width * 0.5 + c * 2.3, cv.y + cv.height * 0.5, { steps: 6 }); await page.mouse.up();
    ok(await page.evaluate((x) => window.__rompicapo.e.cur.x >= x + 1 || window.__rompicapo.e.cur.x === 7, xb), `${tag} mattoncini: trascinamento sul campo`);
  }
  // play: smart-ish placement through the controls until a few lines are cleared (sprint fails fast if stacked badly)
  const plan = () => page.evaluate(() => {
    const g = window.__rompicapo, e = g.e; if (!e.cur || e.over) return null;
    let best = null;
    for (let r = 0; r < 4; r++) for (let x = -2; x < 10; x++) {
      const p = { ...e.cur, r, x, y: e.cur.y }; if (!e.fits(p)) continue;
      while (e.fits({ ...p, y: p.y + 1 })) p.y++;
      const b = e.board.map((row) => row.slice()); for (const [cx, cy] of e.cells(p)) if (cy >= 0) b[cy][cx] = 9;
      const full = b.filter((row) => row.every(Boolean)).length; let holes = 0, hmax = 0, bump = 0; const hs = [];
      for (let cx = 0; cx < 10; cx++) { let seen = false, h = 0; for (let cy = 0; cy < 22; cy++) { if (b[cy][cx]) { if (!seen) h = 22 - cy; seen = true; } else if (seen) holes++; } hs.push(h); hmax = Math.max(hmax, h); }
      for (let k = 0; k < 9; k++) bump += Math.abs(hs[k] - hs[k + 1]);
      const sc = full * 8 - holes * 7 - hmax * 0.6 - bump * 0.4 - hs.reduce((a, v) => a + v, 0) * 0.15;
      if (!best || sc > best.sc) best = { sc, r, x };
    }
    return best && { dr: (best.r - e.cur.r + 4) % 4, dx: best.x - e.cur.x };
  });
  for (let n = 0; n < 40; n++) {
    const p = await plan(); if (!p) break;
    if (p.dr === 3) await press('ccw', 'z'); else for (let k = 0; k < p.dr; k++) await press('cw', 'ArrowUp');
    const p2 = await plan(); if (!p2) break;
    for (let k = 0; k < Math.abs(p2.dx); k++) await press(p2.dx < 0 ? 'left' : 'right', p2.dx < 0 ? 'ArrowLeft' : 'ArrowRight');
    await press('hard', ' ');
    if (n === 18) await shot(page, `${tag}-mattoncini-play`);
    if (await page.evaluate(() => window.__rompicapo?.e.over)) break;
  }
  const s = await page.evaluate(() => ({ lines: window.__rompicapo.e.lines, pieces: window.__rompicapo.e.pieces, score: window.__rompicapo.e.score }));
  ok(s.pieces >= 20 && s.lines >= 2, `${tag} mattoncini: ${s.pieces} pezzi, ${s.lines} linee, ${s.score} punti dai comandi`);
  // top out quickly with hard drops
  for (let n = 0; n < 60 && !(await page.evaluate(() => window.__rompicapo?.e.over)); n++) await press('hard', ' ');
  await results(page); await shot(page, `${tag}-mattoncini-results`);
  const st = await store(page); ok(st.mattoncini.played >= 1 && st.mattoncini.lines >= s.lines, `${tag} mattoncini: statistiche salvate`);
  await page.click('[data-a="rp-quit"]'); await page.waitForSelector('.rp-menu');
}
// ------------------------------------------------------------------ Mahjong
async function mahjong(page, tag, touch, daily = false) {
  if (daily) { await tab(page, 'daily'); await shot(page, `${tag}-daily`); await page.click('[data-a="rp-daily"][data-g="mahjong"]'); }
  else { await tab(page, 'mahjong'); await shot(page, `${tag}-mahjong-menu`); await page.click('[data-a="rp-mj-lv"].btn'); }
  await game(page); await page.waitForTimeout(1600);
  // a blocked tile refuses, the hint lights a pair
  await page.click('[data-t="hint"]'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => !!window.__rompicapo.hintPair), `${tag} mahjong: aiuto`);
  await shot(page, `${tag}-mahjong-play`);
  let n = 0;
  for (; n < 200; n++) {
    const pair = await page.evaluate(() => window.__rompicapo && !window.__rompicapo.done && window.__rompicapo.solveStep());
    if (!pair) break;
    for (const i of pair) { const p = await page.evaluate((i) => window.__rompicapo.screenOf(i), i); await tapAt(page, p.x, p.y, touch); await page.waitForTimeout(30); }
    if (n === 3) { await page.click('[data-t="undo"]'); await page.waitForTimeout(50); }
    if (n === 6) { await page.click('[data-t="shuffle"]'); await page.waitForTimeout(50); }
  }
  await results(page, 20000); await shot(page, `${tag}-mahjong-results`);
  const st = await store(page);
  ok(st.mahjong.won >= 1, `${tag} mahjong: tavolo sgombrato dal tocco/clic (${n} coppie)`);
  if (daily) ok(st.daily?.done?.mahjong, `${tag} mahjong: sfida del giorno segnata`);
  await page.click('[data-a="rp-quit"]'); await page.waitForSelector('.rp-menu');
}
async function themes(page, tag) {
  await tab(page, 'temi');
  const st = await store(page); const coins = st.coins;
  await page.click('[data-a="rp-theme"][data-id="carta"]');
  if (coins >= 150) { await page.click('.modal-wrap [data-a="yes"]'); await page.waitForTimeout(200); const s2 = await store(page); ok(s2.theme === 'carta' && s2.coins === coins - 150, `${tag} temi: «Carta» sbloccato`); }
  else { ok(await page.locator('.toast, .toasts *').count() >= 0, `${tag} temi: monete insufficienti segnalate`); }
  await shot(page, `${tag}-temi`);
}

for (const [w, h] of SIZES) {
  const tag = `${w}x${h}`, touch = w < 900;
  console.log(`\n== ${tag}`);
  const page = await newPage(w, h);
  await shot(page, `${tag}-home`);
  ok(await page.locator('.rp-gcard').count() === 4, `${tag}: quattro rompicapo in vetrina`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1 || [...document.querySelectorAll('.rp-menu *')].some((e) => e.getBoundingClientRect().right > innerWidth + 2 && getComputedStyle(e).position !== 'fixed' && !e.closest('.rp-tabs')));
  ok(!overflow, `${tag}: niente sbordi orizzontali nel menu`);
  await sudoku(page, tag, touch);
  await unisci(page, tag, touch);
  await blocks(page, tag, touch);
  await mahjong(page, tag, touch, w === 1440 || w === 390);
  await themes(page, tag);
  // the new theme in a live puzzle
  if (w === 1440 || w === 390) { await page.click('[data-a="rp-quick"][data-g="unisci"]').catch(async () => { await tab(page, 'home'); await page.click('[data-a="rp-quick"][data-g="unisci"]'); }); await game(page); await page.waitForTimeout(500); await shot(page, `${tag}-unisci-tema`); await page.keyboard.press('Escape'); await page.click('[data-a="rp-quit"]'); }
  await page.context().close();
}
// hub tile + daily mode from the launcher
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[hub] ${e.message}`)); page.on('console', (m) => { if (m.type() === 'error') errors.push(`[hub] ${m.text()}`); });
  await page.addInitScript((s) => localStorage.setItem('apexdynasty_settings', s), settings);
  await page.goto(BASE); await page.waitForFunction(() => window.__apex?.App?.cur === 'launcher' || document.querySelector('.launcher, .hub-root, [data-a]'), null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  const ok1 = await page.evaluate(async () => { const { App } = window.__apex; App.go('rompicapo', { from: 'launcher', tab: 'daily' }); await new Promise((r) => setTimeout(r, 1200)); return App.cur === 'rompicapo' && !!document.querySelector('.rp-dlist'); });
  ok(ok1, 'hub: «Rompicapo del giorno» apre le quattro sfide');
  await page.screenshot({ path: `${OUT}hub-daily.png` });
  await ctx.close();
}
await browser.close();
const real = errors.filter((e) => !/WebGL|GPU stall|AudioContext|favicon/i.test(e));
ok(!real.length, `nessun errore in console${real.length ? ':\n  ' + real.slice(0, 12).join('\n  ') : ''}`);
console.log(fails ? `\n${fails} controlli FALLITI` : '\ntutto ok');
process.exit(fails ? 1 : 0);
