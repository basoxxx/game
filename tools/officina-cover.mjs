// Officina — renders the Baso Hub cover from the game itself: a late-game garage (Autodromo Reale) with
// Formula, hypercars and GTs on the lift pads, cars lapping the test track and a merge flash.
//   npx vite build && npx vite preview --port 4665 --strictPort   then   node tools/officina-cover.mjs [baseUrl]
// Writes public/covers/officina.webp (1600x900).
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const BASE = (process.argv[2] || 'http://127.0.0.1:4665/').replace(/\/?$/, '/');
mkdirSync('public/covers', { recursive: true });
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const W = 1600, H = 900;
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
const P = (m = 0, a = 0, g = 0, t = 0) => ({ motore: m, aero: a, gomme: g, telaio: t });
const car = (t, p = P()) => ({ k: 'car', t, parts: p });
const grid = [
  car(27, P(6, 5, 5, 4)), car(26, P(4, 4, 3, 3)), car(26, P(3, 2, 2, 2)), car(25, P(5, 5, 4, 3)), car(24, P(3, 3, 3, 2)), { k: 'part', p: 'aero', t: 7 },
  car(23, P(2, 2, 2, 2)), car(23), car(22, P(1, 1, 1, 1)), { k: 'part', p: 'motore', t: 6 }, car(21), car(20, P(2, 2, 1, 1)),
  car(19), car(21, P(2, 1, 1, 0)), car(18), car(18), { k: 'part', p: 'gomme', t: 5 }, car(17),
  car(16, P(1, 0, 1, 0)), null, car(15), { k: 'part', p: 'telaio', t: 4 }, null, car(13),
  car(14), { k: 'crate', c: 'car', t: 18 }, null, car(16), car(12), null,
];
const save = { v: 1, season: 2, region: 5, best: 27, bestEver: 27, coins: 4.2e13, rp: 1800, tokens: 12, trophies: 58, trophiesAll: 120, dp: 6, dpEarned: 14, seen: Array.from({ length: 27 }, (_, i) => i + 1), grid, tut: 99, lastSeen: 0, deliverT: 1e9 };
await page.addInitScript((s) => {
  localStorage.setItem('apexdynasty_settings', JSON.stringify({ gfxTier: 'high', gfx: 'high', sound: false, music: false, reduceMotion: false }));
  s.lastSeen = Date.now(); localStorage.setItem('sala_officina_v1', JSON.stringify(s));
}, save);
await page.goto(BASE + '?game=officina');
await page.waitForFunction(() => window.__officina?.g?.pads?.length === 30, null, { timeout: 120000 });
await page.waitForTimeout(3000);
await page.addStyleTag({ content: '.of-hud, .of-labels, .of-pops, .of-panel, .toast, .toasts, .save-pill { display: none !important; }' });
await page.evaluate(() => {
  const g = window.__officina.g, cam = g.cam;
  clearInterval(window.__officina.V.timer); // freeze the economy: no deliveries while we pose
  cam.clearViewOffset(); cam.fov = 30; cam.updateProjectionMatrix();
  cam.position.set(-4.5, 9.5, 16); cam.lookAt(0.8, 0, -0.2); cam.updateMatrixWorld();
  g.baseCam = cam.position.clone();
  // spread the lapping cars along the front straight
  g.trackCars.forEach((c, k) => { c.u = 0.02 + k * 0.045; });
  // a merge: the GT 18 + 18 → 19 flash
  const s = window.__officina.s;
  s.grid[14] = { k: 'car', t: 19, parts: { motore: 0, aero: 0, gomme: 0, telaio: 0 } }; s.grid[15] = null;
  g.applyMove(15, 14, { type: 'merge', item: s.grid[14] }, s.grid);
});
await page.waitForTimeout(260);
const buf = await page.screenshot({ type: 'png', timeout: 240000 });
const out = await page.evaluate(async (b64) => {
  const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').drawImage(img, 0, 0);
  return c.toDataURL('image/webp', 0.86).split(',')[1];
}, buf.toString('base64'));
writeFileSync('public/covers/officina.webp', Buffer.from(out, 'base64'));
console.log('cover officina', Math.round(out.length * 0.75 / 1024), 'KB');
await browser.close();
