// Renders the Baso Hub cover of Ingorgo from the game itself: node tools/ingorgo-cover.mjs [baseUrl]
// Needs a running preview (npx vite preview). Writes public/covers/ingorgo.webp (1600x900).
// The scene: a busy lot at sunset, the red hero car bursting through the exit barrier, confetti,
// the other cars hopping and honking; a low three-quarter camera instead of the play view.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }
const BASE = process.argv[2] || 'http://127.0.0.1:4661/';
const LEVEL = +(process.env.COVER_LEVEL || 9);
mkdirSync('public/covers', { recursive: true });
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist'] });
const W = 1600, H = 900;
const page = await browser.newPage({ viewport: { width: W, height: H } });
const settings = JSON.stringify({ gfxTier: 'high', gfx: 'high', sound: false, music: false, reduceMotion: false });
const store = { stars: Object.fromEntries(Array.from({ length: LEVEL - 1 }, (_, i) => [`c${i + 1}`, 3])), theme: process.env.COVER_THEME || 'giorno', owned: { theme: ['giorno', 'tramonto', 'notte', 'neve'], paint: ['rosso'], model: ['utilitaria'], horn: ['classico'] } };
await page.addInitScript(([s, st]) => { localStorage.setItem('apexdynasty_settings', s); localStorage.setItem('sala_ingorgo_v1', st); }, [settings, JSON.stringify(store)]);
await page.goto(BASE + '?game=ingorgo');
await page.click('[data-a=ig-next]');
await page.waitForFunction(() => window.__ingorgo?.renderer, null, { timeout: 90000 });
await page.waitForTimeout(1500);
const env = { yaw: +(process.env.COVER_YAW || 0.55), pitch: +(process.env.COVER_PITCH || 0.62), dist: +(process.env.COVER_DIST || 9.2), fov: +(process.env.COVER_FOV || 38), after: +(process.env.COVER_AFTER || 0.32) };
await page.evaluate((E) => {
  const g = window.__ingorgo;
  document.querySelector('.ig-hud').style.display = 'none';
  // play the solution up to the hero's exit, then freeze it bursting through the gate
  const sol = g.solveNow();
  for (const m of sol.slice(0, -1)) g.doMove(m);
  for (let i = 0; i < 60; i++) g.step(1 / 30);
  g.o.onEnd = () => {};
  g.doMove(sol[sol.length - 1]);
  for (let t = 0; t < E.after; t += 1 / 60) g.step(1 / 60);
  // a little extra life: confetti burst and a couple of cars hopping, eyes wide
  const B = g.B, hc = B.cars[B.hero];
  g.confetti(hc.ax === 0 ? B.w / 2 : 0, hc.ax === 0 ? hc.fix - B.h / 2 + 0.5 : -B.h / 2, 200);
  for (let i = 0; i < 12; i++) g.step(1 / 60);
  g.vs.forEach((v, k) => { if (k % 3 === 1) v.hop = 0.2; v.blink = 3; });
  g.step(1 / 60);
  g.paused = true;
  const hp = g.vs[B.hero].g.position;
  g.camOverride = (cam) => {
    cam.clearViewOffset(); cam.aspect = innerWidth / innerHeight; cam.fov = E.fov; cam.updateProjectionMatrix();
    const tx = hp.x * 0.3, tz = hp.z * 0.4;
    cam.position.set(tx + Math.sin(E.yaw) * Math.cos(E.pitch) * E.dist, Math.sin(E.pitch) * E.dist, tz + Math.cos(E.yaw) * Math.cos(E.pitch) * E.dist);
    cam.lookAt(tx, 0.2, tz);
  };
  g.step(0);
}, env);
await page.waitForTimeout(4000);
const buf = await page.screenshot({ type: 'png', timeout: 240000 });
const out = await page.evaluate(async (b64) => {
  const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').drawImage(img, 0, 0);
  return c.toDataURL('image/webp', 0.86).split(',')[1];
}, buf.toString('base64'));
writeFileSync('public/covers/ingorgo.webp', Buffer.from(out, 'base64'));
console.log('cover ingorgo', Math.round(out.length * 0.75 / 1024), 'KB');
await browser.close();
