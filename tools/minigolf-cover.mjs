// Renders the Baso Hub cover of Minigolf Baso from the game itself: node tools/minigolf-cover.mjs [baseUrl]
// Needs a running preview (npx vite preview). Writes public/covers/minigolf.webp (1600x900).
// A crowned ball with a rainbow trail rolls towards the windmill of «Gran prato», shot low and wide.
// Tweak with COVER_HOLE (course-n), COVER_T (seconds into the shot), COVER_YAW, COVER_DIST, COVER_H.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const BASE = (process.argv[2] || 'http://127.0.0.1:4666/').replace(/\/?$/, '/');
const W = 1600, H = 900;
const env = { hole: process.env.COVER_HOLE || 'giardino-9', t: +(process.env.COVER_T || 0.55), yaw: +(process.env.COVER_YAW || 0.5), dist: +(process.env.COVER_DIST || 2.3), h: +(process.env.COVER_H || 0.75) };
mkdirSync('public/covers', { recursive: true });
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.addInitScript(() => {
  localStorage.setItem('apexdynasty_settings', JSON.stringify({ gfxTier: 'high', gfx: 'high', sound: false, music: false, reduceMotion: true }));
  localStorage.setItem('sala_minigolf_v1', JSON.stringify({ ball: 'bianca', hat: 'corona', trail: 'arcobaleno', owned: { hat: ['corona'], trail: ['arcobaleno'] }, courses: { giardino: { done: true }, spiaggia: { done: true }, castello: { done: true }, lunapark: { done: true } } }));
});
await page.goto(BASE + '?nointro&game=minigolf');
await page.waitForSelector('.mg-menu');
const [c, n] = env.hole.split('-');
await page.evaluate(() => window.__apex.App.go('minigolf', { tab: 'percorsi' }));
await page.click(`[data-a=mg-single][data-c=${c}][data-h="${+n - 1}"]`);
await page.waitForFunction(() => window.__minigolf?.state?.().phase, null, { timeout: 120000 });
await page.evaluate((E) => {
  const m = window.__minigolf, g = m.game; m.manual = true; m.step(2);
  document.querySelector('.mg-hud').style.display = 'none'; document.querySelector('.mg-msg').style.display = 'none';
  g.shoot(0.02, 0.62);
  m.step(E.t);
  const b = g.cur.p;
  g.camOverride = (cam) => { cam.fov = 42; cam.updateProjectionMatrix(); cam.position.set(b[0] - Math.sin(E.yaw) * E.dist, b[1] + E.h, b[2] + Math.cos(E.yaw) * E.dist); cam.lookAt(b[0] + Math.sin(-0.15) * 1.6, b[1] + 0.12, b[2] - 1.9); };
  m.render();
}, env);
await page.waitForTimeout(1500);
const buf = await page.screenshot({ type: 'png', timeout: 240000 });
const out = await page.evaluate(async (b64) => {
  const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
  const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height; cv.getContext('2d').drawImage(img, 0, 0);
  return cv.toDataURL('image/webp', 0.86).split(',')[1];
}, buf.toString('base64'));
writeFileSync('public/covers/minigolf.webp', Buffer.from(out, 'base64'));
console.log('cover minigolf', Math.round(out.length * 0.75 / 1024), 'KB');
await browser.close();
