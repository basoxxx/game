// Renders the Baso Hub cover of Territorio from the game itself: node tools/territorio-cover.mjs [baseUrl]
// Needs a running preview (npx vite preview --port 4662). Writes public/covers/territorio.webp (1600x900).
// The match is simulated without drawing (software WebGL is slow) until the hero is out of its land
// with a long trail, rivals around; then a low, wide photo camera frames it and one frame is shot.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }
const BASE = (process.argv[2] || 'http://127.0.0.1:4662/').replace(/\/?$/, '/');
const W = 1600, H = 900;
mkdirSync('public/covers', { recursive: true });
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on('pageerror', (e) => console.error('pageerror', e.message));
const settings = JSON.stringify({ gfxTier: 'high', gfx: 'high', sound: false, music: false });
const store = JSON.stringify({ mode: 'battaglia', map: process.env.COVER_MAP || 'prato', diff: 'normale', color: 'corallo', vehicle: 'cubo', trail: 'liscia' });
await page.addInitScript(([s, t]) => { localStorage.setItem('apexdynasty_settings', s); localStorage.setItem('sala_territorio_v1', t); }, [settings, store]);
await page.goto(BASE + '?game=territorio'); await page.waitForSelector('.tr-menu');
await page.click('[data-a=tr-play]');
await page.waitForFunction(() => window.__territorio?.sim && window.__territorio.views, null, { timeout: 60000 });
const info = await page.evaluate(() => {
  const g = window.__territorio, s = g.sim, me = g.me, W = s.W, H = s.H;
  g.hold = true; g.count = 0; g.step(1 / 30);
  // a hand-made scene: lands of every colour, the hero half way round a big loop, a rival closing in
  for (let c = 0; c < W * H; c++) { if (s.own[c] !== 255) s.own[c] = 0; s.trail[c] = 0; s.stamp[c] = -99; }
  const blob = (land, cx, cy, r, ph) => { for (let j = Math.floor(cy - r * 1.4); j <= cy + r * 1.4; j++) for (let i = Math.floor(cx - r * 1.4); i <= cx + r * 1.4; i++) { if (i < 0 || j < 0 || i >= W || j >= H) continue; const a = Math.atan2(j - cy, i - cx), d = Math.hypot(i - cx, j - cy); if (d < r * (1 + 0.22 * Math.sin(3 * a + ph) + 0.1 * Math.sin(7 * a + ph * 2)) && s.own[j * W + i] !== 255) s.own[j * W + i] = land; } };
  const P = s.players, cx = W / 2, cy = H / 2;
  blob(me.land, cx - 8, cy + 6, 9, 0.4);
  const spots = [[cx + 20, cy - 12, 7, 1.2], [cx - 22, cy - 18, 8, 2.1], [cx + 6, cy - 30, 7, 0.7], [cx + 26, cy + 22, 8, 2.9], [cx - 30, cy + 26, 7, 1.7], [cx + 34, cy - 34, 6, 0.2], [cx - 2, cy + 34, 6, 1.0]];
  P.filter((p) => p !== me).forEach((p, k) => { const [x, y, r, ph] = spots[k % spots.length]; blob(p.land, x, y, r, ph); p.x = x + 0.5; p.y = y + 0.5; p.alive = true; p.trail = []; p.out = false; p.ang = Math.atan2(cy - y, cx - x); p.respawnT = 0; });
  // hero trail: out east, up, back west (4-connected)
  const path = []; let x = Math.floor(cx + 1), y = Math.floor(cy + 4);
  const go = (dx, dy, n) => { for (let k = 0; k < n; k++) { x += dx; y += dy; path.push([x, y]); } };
  go(1, 0, 6); go(1, -1 / 1e9, 0); go(0, -1, 3); go(1, 0, 3); go(0, -1, 5); go(-1, 0, 4); go(0, -1, 2); go(-1, 0, 5);
  me.trail = path.map(([i, j]) => j * W + i).filter((c) => s.own[c] !== me.land);
  for (const c of me.trail) s.trail[c] = me.id;
  me.x = x + 0.5; me.y = y + 0.5; me.ang = Math.PI * 1.08; me.want = me.ang; me.alive = true; me.out = true; me.shield = 0;
  // a rival racing at the trail, another one leaving its land with a trail of its own
  const r1 = P.find((p) => p !== me), r2 = P.filter((p) => p !== me)[1];
  r1.x = cx + 9.5; r1.y = cy - 9.5; r1.ang = Math.PI * 0.62;
  const t2 = []; for (let k = 1; k <= 9; k++) t2.push([Math.floor(r2.x) + k, Math.floor(r2.y) + (k > 5 ? k - 5 : 0)]);
  r2.trail = t2.map(([i, j]) => j * W + i).filter((c) => s.own[c] !== r2.land); for (const c of r2.trail) s.trail[c] = r2.id;
  const e2 = t2[t2.length - 1]; r2.x = e2[0] + 0.5; r2.y = e2[1] + 0.5; r2.ang = 0.9;
  s.count.fill(0); for (const o of s.own) s.count[o]++;
  s.powers = [{ x: cx + 10.5, y: cy + 1.5, kind: 'turbo', life: 20, id: 901 }, { x: cx - 2.5, y: cy - 10.5, kind: 'scudo', life: 20, id: 902 }, { x: cx + 18.5, y: cy + 8.5, kind: 'gelo', life: 20, id: 903 }];
  for (const p of P) p.shield = 0;
  s.dirty = s.dirtyStamp = true; g.uploadGrid(true);
  g.labelsOff = true;
  document.querySelector('.tr-hud').style.display = 'none';
  g.camOverride = (cam) => {
    const hx = me.x - W / 2, hz = me.y - H / 2;
    cam.fov = 40;
    cam.position.set(hx - 13, 10.5, hz + 12);
    cam.lookAt(hx + 4.5, 0, hz - 0.5);
  };
  return { trail: me.trail.length };
});
console.log('staged', JSON.stringify(info));
await page.waitForTimeout(3500);
const buf = await page.screenshot({ type: 'png', timeout: 240000 });
const out = await page.evaluate(async (b64) => {
  const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').drawImage(img, 0, 0);
  return c.toDataURL('image/webp', 0.86).split(',')[1];
}, buf.toString('base64'));
writeFileSync('public/covers/territorio.webp', Buffer.from(out, 'base64'));
console.log('cover territorio', Math.round(out.length * 0.75 / 1024), 'KB');
await browser.close();
