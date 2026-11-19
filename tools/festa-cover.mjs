// Renders the Baso Hub cover for Festa Baso from the game itself: node tools/festa-cover.mjs [baseUrl]
// Needs a running preview (npx vite preview --port 4670 --strictPort). Writes public/covers/festa.webp (1600x900).
// A staged moment on the party board: four guests in their hats gathered by the spinning star, confetti
// in the air, Bastione's castle behind them; low camera, HUD hidden.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const BASE = (process.argv[2] || 'http://127.0.0.1:4670/').replace(/\/?$/, '/');
const W = 1600, H = 900;
mkdirSync('public/covers', { recursive: true });
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on('pageerror', (e) => console.error('pageerror', e.message));
await page.addInitScript(() => {
  localStorage.setItem('apexdynasty_settings', JSON.stringify({ gfxTier: 'high', gfx: 'high', sound: false, music: false }));
  localStorage.setItem('baso_festa_v1', JSON.stringify({ v: 1, coins: 0, seats: [['baso', 'corona'], ['lella', 'festa'], ['pina', 'elica'], ['tito', 'vichingo']].map(([char, hat]) => ({ char, hat, dev: 'cpu' })), opts: { n: 4, rounds: 8, target: 3, diff: 1, flat: false, minis: null } }));
});
await page.goto(BASE + '?game=festa&page=board');
await page.waitForSelector('[data-a=fz-mode]', { timeout: 30000 });
await page.click('[data-a=fz-mode][data-id=board]');
await page.click('[data-a=fz-start]');
await page.waitForFunction(() => window.__festa?.bview, null, { timeout: 60000 });
await page.evaluate(() => {
  const f = window.__festa; f.hold = true;
  f.timers.length = 0; f.ui.innerHTML = ''; f.hud.style.display = 'none'; document.querySelector('.fz-labs').style.display = 'none'; document.querySelector('.fz-pause').style.display = 'none';
  const B = f.B; B.star = 6; [1, 2, 3, 4].forEach((p, i) => { B.players[i].pos = p; });
  for (let k = 0; k < 90; k++) f.view.update(1 / 30);
  const v = f.view;
  for (let k = 0; k < 6; k++) v.burst(k % 4, ['#ff4d6d', '#ffd23f', '#2ec4ff', '#7ddc1f'][k % 4]);
  for (let k = 0; k < 14; k++) v.update(1 / 30);
  f.stage.camera.fov = 38; f.stage.camera.updateProjectionMatrix(); f.stage.uTime.value = 1.3;
});
await page.evaluate(() => {
  const f = window.__festa, cam = f.stage.camera;
  // board spaces 1..5 sit on the right-hand side of the loop
  const pts = f.view.tags(); const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cz = pts.reduce((a, p) => a + p[2], 0) / pts.length;
  cam.position.set(cx - 9, 7.5, cz + 13); cam.lookAt(cx - 1.5, 1.4, cz - 2.5);
  f.stage.renderer.render(f.view.scene, cam);
});
await page.waitForTimeout(1200);
await page.evaluate(() => { const f = window.__festa, cam = f.stage.camera; f.stage.renderer.render(f.view.scene, cam); });
await page.waitForTimeout(800);
const buf = await page.screenshot({ type: 'png', timeout: 240000 });
const out = await page.evaluate(async (b64) => {
  const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').drawImage(img, 0, 0);
  return c.toDataURL('image/webp', 0.86).split(',')[1];
}, buf.toString('base64'));
writeFileSync('public/covers/festa.webp', Buffer.from(out, 'base64'));
console.log('cover festa', Math.round(out.length * 0.75 / 1024), 'KB');
await browser.close();
