// Kart Baso — renders the Baso Hub cover (public/covers/kart.webp, 1600x900) from the game itself:
// an all-AI pack on Spiaggia Bassa is raced into the first bend, frozen, dressed up (drift sparks,
// turbo flames, a Super Moka, a Ricciolo on its way and a bomb going off) and framed low in front of
// the leaders. Needs a running preview:  npx vite preview --port 4660   then   node tools/kart-cover.mjs [baseUrl]
// Tweak with KC_TRACK, KC_T (seconds of racing), KC_DIST, KC_SIDE, KC_UP, KC_FOV.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const BASE = (process.argv[2] || 'http://127.0.0.1:4660/').replace(/\/?$/, '/');
const W = 1600, H = 900;
const E = { track: process.env.KC_TRACK || 'prato', t: +(process.env.KC_T || 7.2), dist: +(process.env.KC_DIST || 10), side: +(process.env.KC_SIDE || 3.4), up: +(process.env.KC_UP || 1.5), fov: +(process.env.KC_FOV || 46) };
mkdirSync('public/covers', { recursive: true });
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.setDefaultTimeout(300000);
await page.addInitScript(() => { localStorage.setItem('apexdynasty_settings', JSON.stringify({ gfxTier: 'high', gfx: 'high', sound: false, music: false })); });
await page.goto(BASE + '?game=kart');
await page.waitForSelector('.kt-menu');
await page.evaluate((track) => window.__kartPlay({ mode: 'race', track, players: [], cls: 'esperto', seed: 11, preserve: true }), E.track);
await page.waitForFunction(() => window.__kart?.game?.hud && window.__kart.game.raf, null, { timeout: 120000 });
await page.waitForTimeout(1500);
const info = await page.evaluate((E) => {
  const g = window.__kart.game, S = g.sim, v = g.view;
  cancelAnimationFrame(g.raf); g.raf = 0; g.o.manual = true;
  document.querySelector('.kt-hud').style.display = 'none';
  document.querySelectorAll('.kt-pausebtn, .ktt').forEach((x) => { x.style.display = 'none'; });
  while (S.state === 'count') S.step(1 / 60);
  for (let i = 0; i < E.t * 60; i++) { S.step(1 / 60); S.popEvents(); }
  const order = S.karts.slice().sort((a, b) => b.dist - a.dist);
  const L = order[0];
  // dress the pack: drifting with purple sparks, turbo flames, a Super Moka, shield, a ricciolo and a bomb
  order.forEach((k, i) => { if (i % 2 === 0) { k.drift = i % 4 ? 1 : -1; k.dTier = 1 + (i % 3); } if (i < 4) k.boostT = 1; });
  order[1].mokaT = 3; order[2].shieldT = 3;
  const fx = Math.sin(L.h), fz = Math.cos(L.h), rx = -fz, rz = fx;
  S.proj.push({ type: 'ricciolo', x: L.x - fx * 6 + rx * 2.6, y: L.y + 0.6, z: L.z - fz * 6 + rz * 2.6, vx: 0, vy: 0, vz: 0, h: L.h, sp: 30, owner: order[3].i, target: L.i, life: 5, age: 1, ni: L.ni, homing: true });
  const B = order[Math.min(5, order.length - 1)];
  for (let i = 0; i < 6; i++) v.update(1 / 30, [L.i]);
  v.onEvent({ t: 'explode', x: B.x + 1.5, y: B.y + 0.5, z: B.z });
  v.onEvent({ t: 'box', x: order[2].x + fx * 3, y: order[2].y + 1.2, z: order[2].z + fz * 3 });
  for (let i = 0; i < 4; i++) v.update(1 / 30, [L.i]);
  const cx = L.x + fx * E.dist + rx * E.side, cz = L.z + fz * E.dist + rz * E.side;
  const q = S.world.probe(cx, cz, -1, {});
  const cy = Math.max(L.y, q.gy > -1e6 ? q.gy : L.y) + E.up;
  g.camOverride = (view) => view.lookFrom(0, cx, cy, cz, L.x - fx * 6 - rx * 0.8, L.y + 1.3, L.z - fz * 6 - rz * 0.8, E.fov);
  g.render(0); g.render(0);
  return { leader: L.name, t: S.t.toFixed(1), x: L.x.toFixed(1), z: L.z.toFixed(1) };
}, E);
console.log('cover frame', JSON.stringify(info));
await page.waitForTimeout(1500);
const buf = await page.screenshot({ type: 'png' });
const out = await page.evaluate(async (b64) => {
  const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').drawImage(img, 0, 0);
  return c.toDataURL('image/webp', 0.86).split(',')[1];
}, buf.toString('base64'));
writeFileSync('public/covers/kart.webp', Buffer.from(out, 'base64'));
console.log('cover kart', Math.round(out.length * 0.75 / 1024), 'KB');
await browser.close();
