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
  const buf = await page.screenshot({ type: 'png', timeout: 240000 });
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
// ---- Flatout (Scontro Totale): the pack piling into each other on the dirt, low photo-mode camera
if (!ONLY || ONLY === 'derby') {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.addInitScript((s) => localStorage.setItem('apexdynasty_settings', s), settings);
  await page.goto(BASE + '?game=derby'); await page.waitForSelector('.dz-menu');
  await page.click('.dz-tab[data-id=libero]'); await page.waitForTimeout(400);
  await page.click('.dz-venue[data-id=cava]').catch(() => {}); await page.waitForTimeout(300);
  await page.click('[data-a=dz-go]');
  await page.waitForFunction(() => window.__derby?.state === 'countdown', null, { timeout: 120000 });
  // the game crawls in software WebGL: run the physics without drawing, then freeze it in photo mode
  await page.evaluate(() => {
    const g = window.__derby, render = g.render; g.render = () => {};
    g.countdown = 0.02;
    const keys = g.keys || g.input || null; void keys;
    for (let i = 0; i < 60 * 9; i++) g.frame(1 / 60);
    g.render = render;
    g.photoMode(true); g.hud.root.classList.add('photo-clean');
    const P = g.photo; P.pitch = 0.1; P.dist = 7.5; P.fov = 40; P.yaw += 2.4;
  });
  await page.waitForTimeout(4000);
  await shot(page, 'derby');
  await page.close();
}
// ---- Manager (Apex Dynasty): a TV shot from the highlights of a simulated Grand Prix
if (!ONLY || ONLY === 'apex') {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.addInitScript((s) => localStorage.setItem('apexdynasty_settings', s), settings);
  await page.goto(BASE + '?nointro&game=apex'); await page.waitForFunction(() => window.__apex?.App?.cur === 'menu', null, { timeout: 60000 });
  await page.evaluate(() => window.__apex.App.go('newgame')); await page.waitForTimeout(800);
  await page.click('[data-a="next"]'); await page.locator('[data-a="pick-team"]').first().click(); await page.click('[data-a="next"]'); await page.click('[data-a="start"]');
  await page.waitForFunction(() => window.__apex.App.cur === 'hub' && window.__apex.ready, null, { timeout: 60000 });
  await page.evaluate(() => { document.querySelector('.tour-mask')?.remove(); window.__apex.simRound(); });
  await page.evaluate(() => window.__apex.highlights(0, {}));
  await page.waitForSelector('.hl-wrap', { timeout: 400000 });
  // let the reel reach a racing moment, then hide the TV furniture
  await page.waitForTimeout(Number(process.env.COVER_WAIT || 70000));
  await page.evaluate(() => { for (const s of ['.hl-bug', '.hl-top-r', '.hl-tower', '.hl-replay', '.hl-lower', '.hl-letter', '.hl-ctrl', '.hl-bar', '.hl-chapters', '.hl-end', '.tip']) document.querySelectorAll(s).forEach((e) => (e.style.display = 'none')); });
  await page.waitForTimeout(3000);
  await shot(page, 'apex');
  await page.close();
}
await browser.close();
