// Renders the Baso Hub cover of Rompicapo from the games themselves: node tools/rompicapo-cover.mjs [baseUrl]
// Needs a running preview (npx vite preview --port 4681). Writes public/covers/rompicapo.webp (1600x900).
// Each puzzle is staged in the real game (a sudoku half solved with notes, a big Unisci board, a
// Mattoncini well about to clear four lines, a Mahjong table with a pair lit up), captured, then laid
// out as tilted boards on a deep blue table with the title.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }
const BASE = process.argv[2] || 'http://127.0.0.1:4681/';
mkdirSync('public/covers', { recursive: true });
const browser = await pw.chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 2 });
await page.addInitScript(() => { localStorage.setItem('apexdynasty_settings', JSON.stringify({ sound: false, music: false, reduceMotion: true })); localStorage.setItem('sala_rompicapo_v1', JSON.stringify({ theme: 'notte', owned: ['notte'] })); });
await page.goto(BASE + '?game=rompicapo');
await page.waitForSelector('.rp-menu');
const start = async (g) => { await page.evaluate(() => window.__apex.App.go('rompicapo', { tab: 'home' })); await page.waitForSelector('.rp-menu'); await page.click(`[data-a="rp-quick"][data-g="${g}"]`); await page.waitForFunction(() => window.__rompicapo); await page.waitForTimeout(1200); };
const grab = async (sel) => (await page.locator(sel).screenshot({ omitBackground: true })).toString('base64');
const shots = {};
// sudoku: most digits in, a few notes, one row about to complete
await start('sudoku');
await page.evaluate(() => {
  const g = window.__rompicapo, s = g.solution;
  const empty = g.puzzle.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
  empty.forEach((i, k) => { if (k % 3 !== 0) g.v[i] = s[i]; else g.notes[i] = (1 << (s[i] - 1)) | (1 << ((s[i] % 9))) | (k % 2 ? 1 << ((s[i] + 3) % 9) : 0); });
  g.sel = empty[0]; g.render();
  document.querySelector('.rp-hud').style.visibility = 'hidden';
});
await page.waitForTimeout(300); shots.sudoku = await grab('.sd-board');
// unisci: a rich board
await start('unisci');
await page.evaluate(() => { const g = window.__rompicapo; const v = [2048, 1024, 512, 256, 8, 16, 64, 128, 4, 2, 32, 16, 2, 0, 4, 2]; g.b.cells = v.map((x) => (x ? { id: g.b.nextId++, v: x } : null)); g.b.max = 2048; g.sync(); });
await page.waitForTimeout(500); shots.unisci = await grab('.mg-board');
// mattoncini: a tidy stack with a gap for the long piece
await start('mattoncini');
await page.evaluate(() => {
  const g = window.__rompicapo, e = g.e; g.count = 0; e.board = e.board.map(() => new Array(10).fill(0));
  const rows = { 21: 'LLLZZTTOO.', 20: 'JLSSZZTOO.', 19: 'JJJSSTTII.', 18: 'TTZZJ.LL..', 17: '.T.ZZ..L..' };
  for (const [y, r] of Object.entries(rows)) [...r].forEach((c, x) => { if (c !== '.') e.board[y][x] = 'IJLOSTZ'.indexOf(c) + 1; });
  e.cur = { t: 'I', r: 1, x: 7, y: 6 }; e.hold = 'T'; g.sh.pause(true); g.sh.el.classList.remove('paused'); g.draw();
  document.getElementById('rp-over').innerHTML = '';
});
await page.waitForTimeout(300);
{ const b = await page.locator('.bk-cv').boundingBox(); shots.blocks = (await page.screenshot({ clip: { x: b.x, y: b.y + b.height * 0.3, width: b.width, height: b.height * 0.7 }, omitBackground: true })).toString('base64'); }
// mahjong: the pyramid with a few pairs gone and the hint on
await page.evaluate(() => { const p = JSON.parse(localStorage.getItem('sala_rompicapo_v1')); p.mahjong = { ...(p.mahjong || {}), layout: 'piramide', solved: {} }; localStorage.setItem('sala_rompicapo_v1', JSON.stringify(p)); });
await start('mahjong');
await page.evaluate(() => { const g = window.__rompicapo; for (let k = 0; k < 5; k++) { const p = g.solveStep(); g.present[p[0]] = g.present[p[1]] = false; g.plan = g.plan && g.plan.slice(1); } g.flying = []; g.hint(); g.sel = -1; });
await page.waitForTimeout(700); shots.mahjong = await grab('.mj-cv');
await page.close();

// layout
const W = 1600, H = 900;
const cover = await browser.newPage({ viewport: { width: W, height: H } });
await cover.setContent(`<!doctype html><html><head><style>
  body { margin: 0; width: ${W}px; height: ${H}px; overflow: hidden; font-family: 'Barlow Condensed', 'Arial Narrow', sans-serif; background: radial-gradient(1200px 700px at 50% 120%, #1f3a7a, transparent 60%), radial-gradient(900px 600px at 0% 0%, #2a1f5c, transparent 60%), linear-gradient(160deg, #0b1124, #121a36 60%, #0e1730); }
  .grid { position: absolute; inset: 0; background-image: linear-gradient(rgba(255,255,255,.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.04) 1px, transparent 1px); background-size: 48px 48px; }
  img { position: absolute; filter: drop-shadow(0 30px 40px rgba(0,0,0,.55)); }
  .sd { left: 50px; top: 320px; width: 460px; transform: rotate(-7deg); }
  .mg { left: 1120px; top: 390px; width: 420px; transform: rotate(6deg); }
  .bk { left: 520px; top: 330px; width: 620px; transform: rotate(-2deg); }
  .mj { left: 1000px; top: 36px; width: 540px; transform: rotate(4deg); }
  h1 { position: absolute; left: 66px; top: 50px; margin: 0; font-size: 138px; line-height: .9; font-style: italic; font-weight: 900; letter-spacing: -2px; color: #fff; text-transform: uppercase; text-shadow: 0 8px 0 #0a0f22, 0 18px 40px rgba(0,0,0,.6); }
  h1 b { color: #4cc3ff; }
  p { position: absolute; left: 74px; top: 200px; margin: 0; font-size: 30px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: #ffcf4a; }
  .spark { position: absolute; width: 10px; height: 10px; border-radius: 50%; background: #fff; box-shadow: 0 0 16px 4px rgba(255,255,255,.6); }
</style></head><body><div class="grid"></div>
  <img class="mj" src="data:image/png;base64,${shots.mahjong}">
  <img class="bk" src="data:image/png;base64,${shots.blocks}">
  <img class="sd" src="data:image/png;base64,${shots.sudoku}">
  <img class="mg" src="data:image/png;base64,${shots.unisci}">
  <h1>Rompi<b>capo</b></h1><p>Sudoku · Unisci · Mattoncini · Mahjong</p>
  ${[[520, 240], [1080, 300], [880, 820], [1530, 760], [430, 860], [1240, 70]].map(([x, y]) => `<i class="spark" style="left:${x}px;top:${y}px"></i>`).join('')}
</body></html>`);
await cover.waitForTimeout(400);
const buf = await cover.screenshot({ type: 'png' });
const out = await cover.evaluate(async (b64) => {
  const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').drawImage(img, 0, 0);
  return c.toDataURL('image/webp', 0.86).split(',')[1];
}, buf.toString('base64'));
writeFileSync('public/covers/rompicapo.webp', Buffer.from(out, 'base64'));
console.log('cover rompicapo', Math.round(out.length * 0.75 / 1024), 'KB');
await browser.close();
