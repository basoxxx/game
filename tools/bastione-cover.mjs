// Renders the Baso Hub cover of Bastione from the game itself: node tools/bastione-cover.mjs [baseUrl]
// Needs a running preview (npx vite preview --port 4664). Writes public/covers/bastione.webp (1600x900).
// A campaign level is played by the autopilot until the road is crowded, every tower gets its
// specialisation, then a low three-quarter camera frames the towers firing at the red wave with the
// blue keep behind, the action on the right (the hub puts the title on the left).
// Tweak with COVER_LEVEL, COVER_T (seconds of play), COVER_YAW, COVER_DIST, COVER_PITCH, COVER_PAN.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }
const BASE = (process.argv[2] || 'http://127.0.0.1:4664/').replace(/\/?$/, '/');
mkdirSync('public/covers', { recursive: true });
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist'] });
const W = 1600, H = 900;
const page = await browser.newPage({ viewport: { width: W, height: H } });
const settings = JSON.stringify({ gfxTier: 'high', gfx: 'high', sound: false, music: false, reduceMotion: false });
const store = JSON.stringify({ stars: Object.fromEntries(Array.from({ length: 23 }, (_, i) => [i + 1, 3])), heroes: ['capitano'], hero: 'capitano', hlv: { capitano: 6 }, tree: { frecce: 3, polvere: 3, arcano: 3, reclute: 3 }, spells: ['meteore', 'rinforzi', 'glaciazione'], seen: Object.fromEntries(['fante', 'lesto', 'scudato', 'bruto', 'volante', 'gemello', 'mini', 'sciamano', 're', 'golem', 'drago', 'tiranno'].map((k) => [k, 1])) });
await page.addInitScript(([s, st]) => { localStorage.setItem('apexdynasty_settings', s); localStorage.setItem('sala_bastione_v1', st); }, [settings, store]);
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(BASE + '?game=bastione'); await page.waitForSelector('.bs-menu');
const env = { level: +(process.env.COVER_LEVEL || 4), t: +(process.env.COVER_T || 150), yaw: +(process.env.COVER_YAW || 0.5), dist: +(process.env.COVER_DIST || 25), pitch: +(process.env.COVER_PITCH || 0.62), pan: +(process.env.COVER_PAN || 0.3) };
await page.evaluate((id) => window.__bastione.play(id), env.level);
await page.waitForFunction(() => window.__bastione?.game?.sim && window.__bastione.game.cam, null, { timeout: 120000 });
await page.waitForTimeout(1500);
const info = await page.evaluate(async (E) => {
  const B = window.__bastione, g = B.game, S = g.sim;
  cancelAnimationFrame(g.raf); // drive frames ourselves
  g.sim.gold = 3000; B.autoplay(true);
  for (let i = 0; i < E.t * 30; i++) { g.step(1 / 30); if (i % 300 === 0) S.gold += 400; }
  // every tower specialised, the hero in the middle of the fight
  for (const t of S.towers) { S.gold += 2000; while (t.tier < 2) S.upgrade(t.slot); if (t.spec < 0) S.specialize(t.slot, t.id % 2); }
  for (let i = 0; i < 40; i++) g.step(1 / 30);
  // a dense wave on the road for the photo
  S.callWave?.();
  for (let i = 0; i < 30 * 40; i++) { g.step(1 / 30); if (S.enemies.length >= 28) break; }
  S.lives = Math.max(S.lives, 17);
  document.querySelector('.bs-hud').style.display = 'none';
  // frame: centre of the enemies near the towers, looking towards the keep
  const es = S.enemies.filter((e) => e.hp > 0); const c = es.length ? es.reduce((a, e) => ({ x: a.x + e.x / es.length, z: a.z + e.z / es.length }), { x: 0, z: 0 }) : { x: 0, z: 0 };
  const k = S.keep, ang = Math.atan2(k.x - c.x, k.z - c.z) + E.yaw;
  g.camOverride = (cam) => { cam.fov = 40; cam.updateProjectionMatrix(); const fx = c.x * 0.6 + k.x * 0.4, fz = c.z * 0.6 + k.z * 0.4; cam.position.set(fx - Math.sin(ang) * E.dist * Math.cos(E.pitch), E.dist * Math.sin(E.pitch), fz - Math.cos(ang) * E.dist * Math.cos(E.pitch)); cam.lookAt(fx, 0.5, fz); cam.rotateY(E.pan); };
  g.placeCamera(); for (let i = 0; i < 4; i++) g.render(0.3);
  return { enemies: es.length, towers: S.towers.map((t) => t.def.id + t.tier + ':' + t.spec).join(' '), wave: S.wave };
}, env);
console.log('scene', info);
await page.waitForTimeout(2500);
const buf = await page.screenshot({ type: 'png', timeout: 240000 });
const out = await page.evaluate(async (b64) => {
  const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').drawImage(img, 0, 0);
  return c.toDataURL('image/webp', 0.86).split(',')[1];
}, buf.toString('base64'));
writeFileSync('public/covers/bastione.webp', Buffer.from(out, 'base64'));
console.log('cover bastione', Math.round(out.length * 0.75 / 1024), 'KB');
await browser.close();
