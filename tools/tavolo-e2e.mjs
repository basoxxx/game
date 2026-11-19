// Tavolo Baso browser test (Playwright): plays real moves through the UI (clicks/taps on the board cells, a
// drag, the keyboard cursor) in all four games at 1440x900, 1024x768, 390x844 and 844x390, plus 2-player
// hot-seat (tablet flat), the hidden-screen hand-over of Battaglia navale, the 2D fallback and the puzzles.
//   npx vite build && npx vite preview --port 4683 --strictPort
//   node tools/tavolo-e2e.mjs [baseUrl] [outDir]        (ONLY=desktop,tablet,phone,phone-land)
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const BASE = (process.argv[2] || 'http://127.0.0.1:4683/').replace(/\/?$/, '/');
const OUT = process.argv[3] || 'tavolo-shots';
mkdirSync(OUT, { recursive: true });
const IGNORE = /GPU stall|AudioContext|favicon|ReadPixels|WebGL: CONTEXT_LOST|WebGL: INVALID|GL_INVALID|Automatic fallback to software|GL Driver/i;
const issues = [];
const fail = (m) => { issues.push(m); console.log('  FAIL', m); };
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist'] });

const CASES = [
  { name: 'desktop', vp: [1440, 900], tier: 'high', keyboard: true, drag: true, puzzles: true },
  { name: 'tablet', vp: [1024, 768], tier: 'med', touch: true, twoP: true },
  { name: 'phone', vp: [390, 844], tier: 'low', touch: true, mobile: true },
  { name: 'phone-land', vp: [844, 390], tier: 'med', touch: true, mobile: true, navale2p: true },
];
const only = process.env.ONLY;
const T = (page) => page.evaluate(() => window.__tavolo?.state?.());

async function open(page, game, opts = {}) {
  await page.evaluate(([g, o]) => { const k = 'baso_tavolo_v1'; const d = JSON.parse(localStorage.getItem(k) || 'null') || { v: 1 }; d.opts = d.opts || {}; d.opts[g] = { ...(d.opts[g] || {}), ...o }; if (o.flat != null) d.opts.flat = o.flat; localStorage.setItem(k, JSON.stringify(d)); }, [game, opts]);
  await page.evaluate((g) => window.__apex.App.go('tavolo', { page: g }), game);
  await page.waitForSelector('[data-a=tv-start]', { timeout: 20000 });
  await page.click('[data-a=tv-start]');
  await page.waitForFunction(() => window.__tavolo?.view && window.__tavolo?.overlay, null, { timeout: 30000 });
  await page.waitForTimeout(600);
}
async function tapCell(page, C, id) {
  const sel = `.tv-cell[data-id="${id}"]`;
  await page.waitForSelector(sel, { timeout: 8000 });
  if (C.touch) await page.tap(sel); else await page.click(sel);
}
async function idle(page, ms = 60000) {
  await page.waitForFunction(() => { const s = window.__tavolo?.state?.(); return s && !s.busy; }, null, { timeout: ms }).catch(() => fail('timeout in attesa del turno'));
  await page.waitForTimeout(250);
}
async function backToMenu(page) { await page.evaluate(() => window.__apex.App.go('tavolo', { page: 'home' })); await page.waitForSelector('.tv-game', { timeout: 10000 }); }

async function chess(page, C) {
  await open(page, 'chess', { mode: 'cpu', level: 0, color: 'w', clock: C.name === 'desktop' ? 3 : 0 });
  await page.screenshot({ path: `${OUT}/${C.name}-chess-start.png` });
  // 1. e4 by tapping
  await tapCell(page, C, '4,1'); await tapCell(page, C, '4,3');
  await idle(page);
  let s = await T(page); if (s.moves[0] !== 'e2e4' || s.moves.length < 2) fail(`${C.name} scacchi: e2e4 non giocata (${s.moves})`);
  // 2. a knight by drag (desktop) or keyboard cursor
  if (C.drag) {
    const a = await page.locator('.tv-cell[data-id="6,0"]').boundingBox(), b = await page.locator('.tv-cell[data-id="5,2"]').boundingBox();
    await page.mouse.move(a.x + a.width / 2, a.y + a.height * 0.7); await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(a.x + a.width / 2 + ((b.x - a.x) * i) / 8, a.y + a.height * 0.7 + ((b.y - a.y) * i) / 8);
    await page.screenshot({ path: `${OUT}/${C.name}-chess-drag.png` });
    await page.mouse.up(); await idle(page);
    s = await T(page); if (s.moves[2] !== 'g1f3') fail(`${C.name} scacchi: trascinamento Cf3 fallito (${s.moves})`);
  }
  if (C.keyboard) {
    // d2-d4 with the cursor: focus d2, Enter, Up Up, Enter
    await page.evaluate(() => window.__tavolo.overlay.focus('3,1'));
    await page.keyboard.press('Enter'); await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp'); await page.keyboard.press('Enter');
    await idle(page);
    s = await T(page); if (!s.moves.includes('d2d4')) fail(`${C.name} scacchi: d2d4 da tastiera fallita (${s.moves})`);
  }
  // two more legal moves picked from the position, played by taps
  for (let k = 0; k < 2; k++) {
    s = await T(page); if (s.over) break;
    const mv = await page.evaluate(() => { const t = window.__tavolo, l = t.pos.legal(); const m = l[Math.floor(l.length / 2)]; const f = m & 127, to = (m >> 7) & 127; return [`${f & 7},${f >> 4}`, `${to & 7},${to >> 4}`]; });
    await tapCell(page, C, mv[0]); await tapCell(page, C, mv[1]); await idle(page);
  }
  await page.click('[data-tv=hint]').catch(() => {}); await idle(page); await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${C.name}-chess-hint.png` });
  const n0 = (await T(page)).moves.length;
  await page.click('[data-tv=undo]'); await idle(page);
  const n1 = (await T(page)).moves.length; if (n1 !== n0 - 2) fail(`${C.name} scacchi: annulla ${n0}→${n1}`);
  await page.click('[data-tv=export]'); await page.waitForSelector('.tv-ta', { timeout: 5000 });
  const pgn = await page.inputValue('textarea.tv-ta'); if (!/1\. e4/.test(pgn)) fail(`${C.name} scacchi: PGN ${pgn.slice(0, 80)}`);
  await page.screenshot({ path: `${OUT}/${C.name}-chess-export.png` });
  await page.click('[data-tv=close]');
  await page.keyboard.press('Escape'); await page.waitForSelector('.tv-dcard [data-tv=resume]', { timeout: 5000 }); await page.click('[data-tv=resume]');
  await backToMenu(page);
}
async function chess2p(page, C) {
  await open(page, 'chess', { mode: '2p', clock: 0, flat: true });
  await tapCell(page, C, '4,1'); await tapCell(page, C, '4,3'); await page.waitForTimeout(900);
  await tapCell(page, C, '4,6'); await tapCell(page, C, '4,4'); await page.waitForTimeout(900);
  const s = await T(page); if (s.moves.join(' ') !== 'e2e4 e7e5') fail(`${C.name} scacchi a due: ${s.moves}`);
  const rot = await page.evaluate(() => getComputedStyle(document.querySelector('.tv-top')).transform);
  if (!rot || rot === 'none') fail(`${C.name}: barra avversaria non capovolta sul tavolo`);
  await page.screenshot({ path: `${OUT}/${C.name}-chess-2p-flat.png` });
  await backToMenu(page);
}
async function dama(page, C) {
  await open(page, 'dama', { mode: 'cpu', level: 0, color: 'w', flat: false });
  for (let k = 0; k < 3; k++) {
    const s = await T(page); if (s.over) break;
    const m = s.legal[k % s.legal.length]; if (!m) { fail(`${C.name} dama: nessuna mossa`); break; }
    await tapCell(page, C, `${m.from & 7},${m.from >> 3}`); await tapCell(page, C, `${m.to & 7},${m.to >> 3}`); await idle(page);
  }
  const s = await T(page); if (s.moves < 5) fail(`${C.name} dama: solo ${s.moves} mosse`);
  await page.screenshot({ path: `${OUT}/${C.name}-dama.png` });
  await backToMenu(page);
}
async function four(page, C) {
  await open(page, 'four', { mode: 'cpu', level: 1, first: 1, flat: false });
  for (const c of [3, 3, 2]) { const s = await T(page); if (s.over) break; await tapCell(page, C, String(c)); await idle(page); }
  const s = await T(page); if (s.moves.length < 5) fail(`${C.name} quattro: ${s.moves}`);
  await page.screenshot({ path: `${OUT}/${C.name}-four.png` });
  await backToMenu(page);
}
async function navale(page, C) {
  await open(page, 'navale', { mode: 'cpu', level: 3, noTouch: true, again: false });
  await page.screenshot({ path: `${OUT}/${C.name}-navale-place.png` });
  // select a ship, rotate it with the tool, shuffle, ready
  const shipCell = await page.evaluate(() => { const s = window.__tavolo.players[0].ships[0]; return `0:${s.x},${s.y}`; });
  await tapCell(page, C, shipCell);
  await page.click('[data-tv=rotate]'); await page.click('[data-tv=random]');
  await page.click('[data-tv=ready]'); await page.waitForTimeout(1200);
  let s = await T(page); if (s.phase !== 'battle') fail(`${C.name} navale: fase ${s.phase}`);
  for (const id of ['1:4,4', '1:5,4', '1:0,0']) { await idle(page); await tapCell(page, C, id); await page.waitForTimeout(400); }
  await idle(page);
  s = await T(page); if (s.shots[0] < 3 || s.shots[1] < 2) fail(`${C.name} navale: colpi ${s.shots}`);
  await page.screenshot({ path: `${OUT}/${C.name}-navale-battle.png` });
  await backToMenu(page);
}
async function navale2p(page, C) {
  await open(page, 'navale', { mode: '2p', noTouch: true, again: false });
  await page.click('[data-tv=ready]'); await page.waitForTimeout(300);
  let s = await T(page); if (!s.hidden) fail(`${C.name} navale a due: lo schermo non si nasconde`);
  await page.screenshot({ path: `${OUT}/${C.name}-navale-handover.png` });
  await page.click('[data-tv=go]'); await page.waitForTimeout(300); await page.click('[data-tv=ready]'); await page.waitForTimeout(300); await page.click('[data-tv=go]'); await page.waitForTimeout(900);
  s = await T(page); if (s.phase !== 'battle' || s.viewer !== 0) fail(`${C.name} navale a due: ${JSON.stringify(s)}`);
  await tapCell(page, C, '1:2,2'); await page.waitForTimeout(2200);
  s = await T(page); if (!s.hidden && s.turn === 1) fail(`${C.name} navale a due: manca il passaggio di mano`);
  await backToMenu(page);
}
async function puzzles(page, C) {
  // chess mate in 2 of the day: the key, then mate
  await page.evaluate(() => window.__apex.App.go('tavolo', { page: 'daily' }));
  await page.waitForSelector('[data-a=tv-daily-chess]'); await page.screenshot({ path: `${OUT}/${C.name}-daily.png` });
  await page.click('[data-a=tv-daily-chess]');
  await page.waitForFunction(() => window.__tavolo?.overlay, null, { timeout: 30000 }); await page.waitForTimeout(500);
  const key = await page.evaluate(() => window.__tavolo.puzzle.key);
  const id = (sq) => `${sq.charCodeAt(0) - 97},${+sq[1] - 1}`;
  await tapCell(page, C, id(key.slice(0, 2))); await tapCell(page, C, id(key.slice(2, 4)));
  await page.waitForFunction(() => window.__tavolo.state().moves.length >= 2 && !window.__tavolo.state().busy, null, { timeout: 15000 }).catch(() => fail('puzzle: nessuna difesa'));
  await page.waitForTimeout(400);
  const mate = await page.evaluate(() => { const p = window.__tavolo.pos; for (const m of p.legal()) { p.make(m); const ok = !p.hasLegal() && p.inCheck(); p.unmake(); if (ok) { const f = m & 127, t = (m >> 7) & 127; return [`${f & 7},${f >> 4}`, `${t & 7},${t >> 4}`]; } } return null; });
  if (!mate) fail('puzzle: nessun matto dopo la difesa'); else { await tapCell(page, C, mate[0]); await tapCell(page, C, mate[1]); }
  await page.waitForSelector('.tv-dcard [data-tv=next]', { timeout: 10000 }).catch(() => fail('puzzle scacchi non risolto'));
  await page.screenshot({ path: `${OUT}/${C.name}-puzzle-chess-solved.png` });
  // four in a row: win in 3 with the hint
  await page.evaluate(() => window.__apex.App.go('tavolo', { page: 'daily' })); await page.waitForSelector('[data-a=tv-daily-four]'); await page.click('[data-a=tv-daily-four]');
  await page.waitForFunction(() => window.__tavolo?.overlay, null, { timeout: 30000 }); await page.waitForTimeout(500);
  for (let k = 0; k < 3; k++) {
    await idle(page); const st = await T(page); if (st.over) break;
    await page.evaluate(() => window.__tavolo.tool('hint')); const c = await page.evaluate(() => window.__tavolo.hint);
    await tapCell(page, C, String(c)); await page.waitForTimeout(700);
  }
  await page.waitForSelector('.tv-dcard [data-tv=menu2]', { timeout: 15000 }).catch(() => fail('puzzle quattro non risolto'));
  await page.screenshot({ path: `${OUT}/${C.name}-puzzle-four-solved.png` });
  // the hidden fleet: a few shots
  await page.evaluate(() => window.__apex.App.go('tavolo', { page: 'daily' })); await page.waitForSelector('[data-a=tv-daily-navale]'); await page.click('[data-a=tv-daily-navale]');
  await page.waitForFunction(() => window.__tavolo?.overlay, null, { timeout: 30000 }); await page.waitForTimeout(500);
  for (const c of ['1:1,1', '1:3,3', '1:5,5']) { await idle(page); await tapCell(page, C, c); await page.waitForTimeout(300); }
  await idle(page); const st = await T(page); if (st.shots[0] !== 3) fail(`flotta del giorno: colpi ${st.shots}`);
  await page.screenshot({ path: `${OUT}/${C.name}-puzzle-navale.png` });
  // shop
  await page.evaluate(() => window.__apex.App.go('tavolo', { page: 'shop' })); await page.waitForSelector('.tv-item'); await page.screenshot({ path: `${OUT}/${C.name}-shop.png` });
  await backToMenu(page);
}

for (const C of CASES) {
  if (only && !only.split(',').includes(C.name)) continue;
  console.log(`▸ ${C.name} ${C.vp.join('x')} (${C.tier})`);
  const ctx = await browser.newContext({ viewport: { width: C.vp[0], height: C.vp[1] }, hasTouch: !!C.touch, isMobile: !!C.mobile, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => fail(`${C.name} pageerror: ${e.message}`));
  page.on('console', (m) => { if ((m.type() === 'error' || (m.type() === 'warning' && /errore intercettato/.test(m.text()))) && !IGNORE.test(m.text())) fail(`${C.name} console: ${m.text().slice(0, 300)}`); });
  await page.addInitScript((t) => { if (!sessionStorage.getItem('tv-init')) { sessionStorage.setItem('tv-init', '1'); localStorage.clear(); localStorage.setItem('apexdynasty_settings', JSON.stringify({ gfxTier: t, gfx: t === 'low' ? 'low' : 'high', sound: false, music: false })); } }, C.tier);
  await page.goto(BASE + '?game=tavolo');
  await page.waitForSelector('.tv-game', { timeout: 30000 });
  await page.screenshot({ path: `${OUT}/${C.name}-home.png` });
  const ov = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  if (ov) fail(`${C.name}: scorrimento orizzontale nel menu`);
  for (const [fn, on] of [[chess, true], [chess2p, C.twoP], [dama, true], [four, true], [navale, true], [navale2p, C.navale2p], [puzzles, C.puzzles]]) {
    if (!on) continue;
    const t0 = Date.now();
    try { await fn(page, C); } catch (e) { fail(`${C.name} ${fn.name}: ${e.message.split('\n')[0]}`); await page.screenshot({ path: `${OUT}/${C.name}-${fn.name}-error.png` }); await backToMenu(page).catch(() => {}); }
    console.log(`  ${fn.name} ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
  const crash = await page.evaluate(() => !!document.querySelector('.modal-wrap .crash'));
  if (crash) fail(`${C.name}: finestra di errore`);
  await ctx.close();
}
await browser.close();
console.log(issues.length ? `\n✗ ${issues.length} problemi` : '\n✓ e2e Tavolo Baso ok');
process.exit(issues.length ? 1 : 0);
