// Renders the Baso Hub covers from the games themselves: node tools/covers.mjs [baseUrl] [only]
// Needs a running preview (npx vite preview). Writes public/covers/<game>.webp (1600x900).
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }
const BASE = process.argv[2] || 'http://127.0.0.1:4417/';
const ONLY = process.argv[3] || '';
mkdirSync('public/covers', { recursive: true });
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist'] });
const W = 1600, H = 900;
async function shot(page, name) {
  const buf = await page.screenshot({ type: 'png' });
  const out = await page.evaluate(async (b64) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').drawImage(img, 0, 0);
    return c.toDataURL('image/webp', 0.86).split(',')[1];
  }, buf.toString('base64'));
  writeFileSync(`public/covers/${name}.webp`, Buffer.from(out, 'base64'));
  console.log('cover', name, Math.round(out.length * 0.75 / 1024), 'KB');
}
const settings = JSON.stringify({ gfxTier: 'high', gfx: 'high', sound: false, music: false, reduceMotion: false });

// ---- Voragine: a big hole swallowing a downtown block at dusk
if (!ONLY || ONLY === 'voragine') {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.addInitScript((s) => { localStorage.setItem('apexdynasty_settings', s); localStorage.setItem('sala_voragine_v1', JSON.stringify({ mode: 'classica', city: 'notte', diff: 'normale', skin: 'notte', owned: ['notte'] })); }, settings);
  await page.goto(BASE + '?game=voragine'); await page.click('[data-a=vg-play]');
  await page.waitForFunction(() => window.__voragine?.me, null, { timeout: 60000 }); await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const g = window.__voragine; g.count = 0; g.paused = true; g.me.player = false;
    for (let i = 0; i < 30 * 30; i++) g.step(1 / 30);
    // park the hero hole next to the tallest thing around and let it start falling
    const tall = g.objs.filter((o) => o.st === 0 && (o.k.id === 'tower' || o.k.id === 'office')).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
    const me = g.me; me.pts = 1500; me.r = 1.6 + 0.25 * Math.sqrt(1500); me.x = tall.x + me.r * 0.15; me.z = tall.z + me.r * 0.1; g.applyHoleSize(me);
    for (let i = 0; i < 9; i++) { g.eat(); g.updateFalling(1 / 30); g.updateDust(1 / 30); g.animateMovers(1 / 30); }
    document.querySelector('.vg-hud').style.display = 'none';
    g.camOverride = (cam) => { cam.position.set(me.x - me.r * 2.6, me.r * 2.4 + 18, me.z + me.r * 3.4); cam.fov = 40; cam.updateProjectionMatrix(); cam.lookAt(me.x, me.r * 0.6, me.z); };
  });
  await page.waitForTimeout(2500);
  await shot(page, 'voragine');
  await page.close();
}
await browser.close();
