// Renders the Baso Hub cover for Arcade Baso from the games themselves: node tools/arcade-cover.mjs [baseUrl]
// Needs a running preview (npx vite preview --port 4682). Writes public/covers/arcade.webp (1600x900).
// Four staged moments (the Astro boss fight, a multiball in Rimbalzo, the runner with the magnet, Gnam
// on fire chasing the wasps) rendered at 800x450, tiled 2x2 with neon seams and the logo in the middle.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const BASE = (process.argv[2] || 'http://127.0.0.1:4682/').replace(/\/?$/, '/');
mkdirSync('public/covers', { recursive: true });
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
page.on('pageerror', (e) => console.error('pageerror', e.message));
await page.addInitScript(() => {
  localStorage.setItem('apexdynasty_settings', JSON.stringify({ gfxTier: 'high', gfx: 'high', sound: false, music: false }));
  localStorage.setItem('baso_arcade_v1', JSON.stringify({ skin: 'neon', trail: 'prisma', owned: { skin: ['neon'], trail: ['prisma'] }, unlock: { astro: 2, rimbalzo: 12, labirinto: 2 } }));
});
const STAGE = {
  astro: (h) => { const s = h.sim; s.o.god = true; s.ships[0].auto = true; s.ships[0].weapon = 4; s.enemies.length = 0; s.queue.length = 0; s.state = 'warn'; s.stateT = 3; for (let i = 0; i < 60 * 9; i++) h.step(1 / 60); s.ships[0].laser = 0; s.ships[0].x = 38; for (let i = 0; i < 30; i++) h.step(1 / 60); const st = h.stage; st.camBase.lerp(st.look, 0.45); st.look.y += 22; st.camBase.y += 22; h.step(1 / 60); },
  rimbalzo: (h) => { const s = h.sim; s.auto = true; s.o.noLose = true; for (let i = 0; i < 60 * 5; i++) h.step(1 / 60); s.catchCap('multi'); s.catchCap('multi'); s.catchCap('largo'); for (let i = 0; i < 60 * 1.2; i++) h.step(1 / 60); const st = h.stage; st.camBase.lerp(st.look, 0.25); h.step(1 / 60); },
  corri: (h) => { const s = h.sim; s.auto = true; s.o.god = true; for (let i = 0; i < 60 * 9; i++) h.step(1 / 60); s.power('magnete'); s.act('up'); for (let i = 0; i < 16; i++) h.step(1 / 60); },
  labirinto: (h) => { const s = h.sim; s.auto = true; s.o.god = true; for (let i = 0; i < 60 * 11; i++) h.step(1 / 60); s.eat(1, 1); for (let i = 0; i < 60 * 1.4; i++) h.step(1 / 60); },
};
const shots = {};
for (const g of ['astro', 'rimbalzo', 'corri', 'labirinto']) {
  await page.goto(BASE + '?game=arcade');
  await page.waitForSelector(`[data-a=ar-open][data-id=${g}]`);
  await page.click(`[data-a=ar-open][data-id=${g}]`);
  if (g === 'rimbalzo') await page.click('[data-a=ar-opt][data-k=level][data-v="12"]');
  await page.click('[data-a=ar-play]');
  await page.waitForFunction(() => window.__arcade?.view && window.__arcade.sim, null, { timeout: 60000 });
  await page.evaluate((src) => { const h = window.__arcade; h.hold = true; h.count = 0; document.querySelector('.ar-hud').style.display = 'none'; new Function('h', `(${src})(h)`)(h); h.render(); }, STAGE[g].toString());
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__arcade.render());
  await page.waitForTimeout(300);
  shots[g] = (await page.screenshot({ type: 'png', timeout: 120000 })).toString('base64');
  console.log('shot', g);
}
await page.setViewportSize({ width: 1600, height: 900 });
await page.goto(BASE + '?game=arcade');
await page.waitForSelector('.ar-menu');
const out = await page.evaluate(async (S) => {
  const c = document.createElement('canvas'); c.width = 1600; c.height = 900; const g = c.getContext('2d');
  const font = getComputedStyle(document.documentElement).getPropertyValue('--display').trim() || 'sans-serif';
  const load = async (b) => { const i = new Image(); i.src = 'data:image/png;base64,' + b; await i.decode(); return i; };
  const pos = { astro: [0, 0], rimbalzo: [800, 0], corri: [0, 450], labirinto: [800, 450] };
  for (const k in pos) g.drawImage(await load(S[k]), pos[k][0], pos[k][1], 800, 450);
  // neon seams
  g.save(); g.shadowColor = '#ff4fd8'; g.shadowBlur = 24; g.fillStyle = '#ffc8f4'; g.fillRect(797, 0, 6, 900); g.shadowColor = '#36e0ff'; g.fillStyle = '#c8f6ff'; g.fillRect(0, 447, 1600, 6); g.restore();
  // logo plate
  g.save(); g.translate(800, 450); g.rotate(-0.05);
  g.fillStyle = 'rgba(6,4,20,.88)'; g.strokeStyle = '#36e0ff'; g.lineWidth = 5; g.shadowColor = '#36e0ff'; g.shadowBlur = 30;
  g.beginPath(); g.roundRect(-330, -100, 660, 200, 18); g.fill(); g.stroke(); g.shadowBlur = 0;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `italic 800 120px ${font}`; g.shadowColor = '#ff4fd8'; g.shadowBlur = 26; g.fillStyle = '#ffffff'; g.fillText('ARCADE', 0, -22);
  g.font = `italic 800 64px ${font}`; g.shadowColor = '#36e0ff'; g.fillStyle = '#7ff3ff'; g.fillText('B A S O', 0, 62);
  g.restore();
  return c.toDataURL('image/webp', 0.86).split(',')[1];
}, shots);
writeFileSync('public/covers/arcade.webp', Buffer.from(out, 'base64'));
console.log('cover arcade', Math.round(out.length * 0.75 / 1024), 'KB');
await browser.close();
