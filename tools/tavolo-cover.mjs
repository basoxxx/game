// Renders the Baso Hub cover for Tavolo Baso from the game itself: node tools/tavolo-cover.mjs [baseUrl]
// Needs a running preview (npx vite preview --port 4683 --strictPort). Writes public/covers/tavolo.webp (1600x900).
// A staged middle game on the walnut-and-maple board with boxwood and ebony pieces, low camera across the
// board from White's side, warm key light; HUD hidden.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const BASE = (process.argv[2] || 'http://127.0.0.1:4683/').replace(/\/?$/, '/');
const W = 1600, H = 900;
mkdirSync('public/covers', { recursive: true });
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on('pageerror', (e) => console.error('pageerror', e.message));
await page.addInitScript(() => {
  localStorage.setItem('apexdynasty_settings', JSON.stringify({ gfxTier: 'high', gfx: 'high', sound: false, music: false }));
  localStorage.setItem('baso_tavolo_v1', JSON.stringify({ v: 1, coins: 0, board: 'noce', pieces: 'bosso', opts: { view: '3d', chess: { mode: '2p', clock: 0, rotate: false, coords: true } } }));
});
await page.goto(BASE + '?game=tavolo&page=chess');
await page.waitForSelector('[data-a=tv-start]', { timeout: 30000 });
await page.click('[data-a=tv-start]');
await page.waitForFunction(() => window.__tavolo?.view?.stage, null, { timeout: 60000 });
await page.evaluate(() => {
  const t = window.__tavolo;
  t.setPosition('r2q1rk1/pp2bppp/2n1bn2/2pp4/3P4/2NBPN2/PP3PPP/R1BQ1RK1 w - - 0 9');
  t.view.setMarks({ last: [[4, 1], [4, 2]] });
  const S = t.view.stage;
  document.querySelector('.tv-play').style.gridTemplateColumns = '1fr 0px';
  for (const s of ['.tv-top', '.tv-bot', '.tv-tools', '.tv-side', '.tv-cells', '.tv-msg']) { const e = document.querySelector(s); if (e) e.style.display = 'none'; }
});
await page.waitForTimeout(600);
await page.evaluate(() => {
  const S = window.__tavolo.view.stage;
  S.flush(); S.resize(true);
  S.camera.fov = 30; S.camera.updateProjectionMatrix();
  S.cam = { tx: 0.6, ty: 0.3, tz: 0.2, yaw: -0.62, pitch: 0.42, dist: 13.2 };
  S.lastFrame = null; S.placeCamera(); S.dirty = true;
});
await page.waitForTimeout(1500);
const buf = await page.screenshot({ type: 'png', timeout: 240000 });
const out = await page.evaluate(async (b64) => {
  const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  const v = g.createRadialGradient(c.width / 2, c.height / 2, c.height * 0.35, c.width / 2, c.height / 2, c.width * 0.75); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.45)'); g.fillStyle = v; g.fillRect(0, 0, c.width, c.height);
  return c.toDataURL('image/webp', 0.86).split(',')[1];
}, buf.toString('base64'));
writeFileSync('public/covers/tavolo.webp', Buffer.from(out, 'base64'));
console.log('cover tavolo', Math.round(out.length * 0.75 / 1024), 'KB');
await browser.close();
