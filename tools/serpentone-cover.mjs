// Renders the Baso Hub cover for Serpentone from the game itself: node tools/serpentone-cover.mjs [baseUrl]
// Needs a running preview (npx vite preview --port 4663). Writes public/covers/serpentone.webp (1600x900).
// A staged moment in the garden arena: a long crowned snake coils around a smaller rival, two more
// snakes slither in, glowing food everywhere, a power-up bubble; low cinematic camera, HUD hidden.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const BASE = (process.argv[2] || 'http://127.0.0.1:4663/').replace(/\/?$/, '/');
const W = 1600, H = 900;
mkdirSync('public/covers', { recursive: true });
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on('pageerror', (e) => console.error('pageerror', e.message));
await page.addInitScript(() => {
  localStorage.setItem('apexdynasty_settings', JSON.stringify({ gfxTier: 'high', gfx: 'high', sound: false, music: false }));
  localStorage.setItem('baso_serpentone_v1', JSON.stringify({ mode: 'classica', arena: 'giardino', diff: 'normale', skin: 'lime', pattern: 'strisce', hat: 'corona', owned: { skin: ['lime'], pattern: ['strisce'], hat: ['corona'] } }));
});
await page.goto(BASE + '?game=serpentone');
await page.click('[data-a=sp-play]');
await page.waitForFunction(() => window.__serpentone?.views, null, { timeout: 60000 });
await page.evaluate(() => {
  const g = window.__serpentone, sim = g.sim; g.hold = true; g.count = -2;
  document.querySelector('.sp-hud').style.display = 'none';
  // everyone else far away
  sim.snakes.forEach((s, i) => { if (i > 4) { s.ai = false; s.spawn(150 * Math.cos(i), 150 * Math.sin(i), i, 20); s.input.turn = 0.4; } });
  const S = sim.snakes;
  const looks = [['lime', 'strisce', 'corona'], ['oceano', 'pois', 'elica'], ['fragola', 'anelli', 'festa'], ['uva', 'tigre', 'cilindro'], ['mango', 'scacchi', 'berretto']];
  looks.forEach(([sk, pa, h], i) => { const s = S[i]; s.skin = sk; s.pattern = pa; s.hat = h; s.color = parseInt({ lime: '7ddc1f', oceano: '1e88ff', fragola: 'ff3b5c', uva: '8e44ff', mango: 'ff9a1c' }[sk], 16); s.ai = false; });
  // hero: a long snake curling into a ring (steered by angular speed); then the others wiggle in
  const hero = S[0], others = S.slice(1, 5);
  const park = (s, i) => { s.spawn(160 + i * 12, -150, 0, 20); s.spawnT = 999; };
  others.forEach(park);
  hero.spawn(-10, 20, 0, 900); hero.spawnT = 999; hero.power = null;
  const w0 = 0.62, cxr = -10, czr = 20 + 11 / w0;
  const turn = (s, w) => { s.input.turn = 0; s.input.ta = s.a + w / 60; };
  for (let t = 0; t < 11.2; t += 1 / 60) { turn(hero, w0); for (const o of others) turn(o, 0); sim.tick(1 / 60); }
  const spots = [[cxr - 4, czr + 2, -0.3, 230], [cxr + 34, czr - 26, 2.6, 180], [cxr - 44, czr - 20, 0.5, 160], [cxr + 30, czr + 26, -2.5, 150]];
  others.forEach((s, i) => { const [x, z, a, m] = spots[i]; s.spawn(x, z, a, m); s.spawnT = 999; s.power = null; });
  for (let t = 0; t < 1.7; t += 1 / 60) { turn(hero, w0); others.forEach((s, i) => turn(s, Math.sin(t * 3 + i) * 2.4)); sim.tick(1 / 60); }
  for (const s of S.slice(0, 5)) s.spawnT = 0;
  // rebuild the heads with the new looks
  for (const v of g.vis) if (v) g.scene.remove(v.head.g);
  g.vis = [];
  // a feast of food around the action and a power-up bubble
  const pal = sim.pal;
  for (let i = 0; i < 380; i++) { const a = Math.random() * 6.283, d = 6 + Math.random() * 70; sim.spawnFood(cxr + Math.cos(a) * d, czr + Math.sin(a) * d * 0.8, Math.random() < 0.15 ? 3 : 1, pal[i % pal.length], Math.random() * 0.6); }
  sim.items.length = 0; sim.items.push({ x: cxr + 26, z: czr + 4, type: 'magnet', t: 5, id: 1 }, { x: cxr - 30, z: czr - 6, type: 'double', t: 5, id: 2 });
  S[1].boosting = true;
  const cx = cxr, cz = czr;
  g.camOverride = (cam) => { cam.fov = 42; cam.updateProjectionMatrix(); cam.position.set(cx - 8, 30, cz + 44); cam.lookAt(cx + 2, 0, cz - 2); };
  for (const v of g.views) { v.x = cx; v.z = cz; v.h = 60; g.updateCamera(v, 0); }
  g.syncVisuals(0.016); g.render();
});
await page.waitForTimeout(800);
await page.evaluate(() => { const g = window.__serpentone; g.syncVisuals(0.016); g.render(); });
await page.waitForTimeout(1500);
const buf = await page.screenshot({ type: 'png', timeout: 240000 });
const out = await page.evaluate(async (b64) => {
  const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').drawImage(img, 0, 0);
  return c.toDataURL('image/webp', 0.86).split(',')[1];
}, buf.toString('base64'));
writeFileSync('public/covers/serpentone.webp', Buffer.from(out, 'base64'));
console.log('cover serpentone', Math.round(out.length * 0.75 / 1024), 'KB');
await browser.close();
