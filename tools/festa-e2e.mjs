// Festa Baso browser test: menus, a short board game and a tournament at 1440x900, 1180x820, 820x1180 and
// 844x390 (touch on the last three, one with "tablet sul tavolo"), plus every minigame in Allenamento on
// desktop. Headless WebGL crawls, so the loop is held and the test drives window.__festa.step(dt).
//   npx vite build && npx vite preview --port 4670 --strictPort
//   node tools/festa-e2e.mjs [baseUrl] [outDir]      (ONLY=desktop,tablet,... MINIS=0 to skip the minigame tour)
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const BASE = (process.argv[2] || 'http://127.0.0.1:4670/').replace(/\/?$/, '/');
const OUT = process.argv[3] || 'festa-shots';
mkdirSync(OUT, { recursive: true });
const IGNORE = /GPU stall|AudioContext|favicon|ReadPixels|WebGL: CONTEXT_LOST|WebGL: INVALID|GL_INVALID|Automatic fallback to software/i;
const issues = [];
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });

const CASES = [
  { name: 'desktop', vp: [1440, 900], tier: 'high', devs: ['kb1', 'kb2', 'cpu', 'cpu'], n: 3, minis: true },
  { name: 'tablet-land', vp: [1180, 820], touch: true, devs: ['touch', 'touch', 'cpu', 'cpu'], n: 4 },
  { name: 'tablet-port', vp: [820, 1180], touch: true, devs: ['touch', 'touch', 'touch', 'cpu'], n: 3, flat: true },
  { name: 'phone-land', vp: [844, 390], touch: true, mobile: true, tier: 'low', devs: ['touch', 'cpu', 'cpu', 'cpu'], n: 2 },
];
const only = process.env.ONLY;
const shot = async (page, name) => { await page.evaluate(() => window.__festa?.step(0, true)); await page.waitForTimeout(120); await page.screenshot({ path: `${OUT}/${name}.png` }); };
const st = (page) => page.evaluate(() => window.__festa?.state());

async function playUntil(page, C, done, maxSec = 900, shots = {}) {
  let simT = 0, lastMini = null, introShot = false, playShot = 0;
  while (simT < maxSec) {
    const s = await st(page);
    if (!s) throw new Error('no session');
    if (done(s)) return s;
    if (s.ph === 'board' && s.board.phase === 'roll' && !s.waiting) await page.evaluate(() => { const f = window.__festa; if (!f.players[f.B.turn].cpu) f.press(f.B.turn); });
    if (s.waiting) await page.evaluate(() => window.__festa.next());
    if (s.ph === 'mini' && s.mini !== lastMini) { lastMini = s.mini; introShot = false; playShot = 0; }
    if (s.ph === 'mini' && s.mph === 'intro' && !introShot && shots.intro) { introShot = true; await shot(page, `${C.name}-${shots.intro}-${s.mini}-intro`); }
    if (s.ph === 'mini' && s.mph === 'play' && shots.play && playShot < 1) { await page.evaluate(() => window.__festa.run(4)); playShot++; await shot(page, `${C.name}-${shots.play}-${s.mini}`); }
    // the human seats wiggle and press now and then, so their inputs go through the real path
    await page.evaluate((t) => { const f = window.__festa; f.players.forEach((p) => { if (!p.cpu) { const v = f.input.virt[p.i]; v.x = Math.sin(t * 1.3 + p.i); v.y = Math.cos(t * 0.9 + p.i * 2); v.a = Math.sin(t * 7 + p.i) > 0.6; } }); f.run(0.5); }, simT);
    simT += 0.5;
  }
  throw new Error(`timeout: ${JSON.stringify(await st(page))}`);
}

for (const C of CASES) {
  if (only && !only.split(',').includes(C.name)) continue;
  const ctx = await browser.newContext({ viewport: { width: C.vp[0], height: C.vp[1] }, hasTouch: !!C.touch, isMobile: !!C.mobile, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => issues.push(`${C.name} pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !IGNORE.test(m.text())) issues.push(`${C.name} console: ${m.text()}`); });
  await page.addInitScript(([c]) => {
    if (sessionStorage.getItem('fz-init')) return; sessionStorage.setItem('fz-init', '1');
    localStorage.setItem('apexdynasty_settings', JSON.stringify({ gfxTier: c.tier || 'med', gfx: c.tier === 'low' ? 'low' : 'high', sound: false, music: false }));
    localStorage.setItem('baso_festa_v1', JSON.stringify({ v: 1, coins: 500, seats: c.devs.map((d, i) => ({ char: ['baso', 'lella', 'pina', 'tito'][i], hat: ['festa', 'nessuno', 'nessuno', 'nessuno'][i], dev: d })), opts: { n: c.n, rounds: 2, target: 2, diff: 1, flat: !!c.flat, minis: null } }));
  }, [C]);
  try {
    await page.goto(BASE + '?game=festa');
    await page.waitForSelector('[data-a=fz-mode]', { timeout: 30000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/${C.name}-home.png` });
    const ov = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth); if (ov > 2) issues.push(`${C.name} home overflows by ${ov}px`);
    // characters: buy a hat with the seeded coins
    await page.click('[data-a=fz-mode][data-id=chars]');
    await page.click('[data-a=fz-buy][data-k=hats][data-id=cilindro]');
    await page.waitForSelector('.modal-wrap', { timeout: 5000 }).catch(() => issues.push(`${C.name}: no purchase dialog`));
    await page.evaluate(() => document.querySelector('.modal-wrap .btn.primary, .modal-wrap button.primary')?.click());
    await page.waitForTimeout(200);
    if (!(await page.evaluate(() => JSON.parse(localStorage.getItem('baso_festa_v1')).owned.hats.includes('cilindro')))) issues.push(`${C.name}: hat purchase failed`);
    await page.screenshot({ path: `${OUT}/${C.name}-chars.png` });
    // board game
    await page.click('[data-a=fz-home]');
    await page.click('[data-a=fz-mode][data-id=board]');
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUT}/${C.name}-setup.png` });
    const ov2 = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth); if (ov2 > 2) issues.push(`${C.name} setup overflows by ${ov2}px`);
    await page.click('[data-a=fz-start]');
    await page.waitForFunction(() => window.__festa?.stage, null, { timeout: 30000 });
    await page.evaluate(() => { window.__festa.hold = true; });
    await page.evaluate(() => window.__festa.run(0.3));
    await shot(page, `${C.name}-board`);
    await playUntil(page, C, (s) => s.ph === 'board' && s.board.phase === 'roll' && s.board.round === 2, 600, { intro: 'b', play: 'b' });
    await shot(page, `${C.name}-board-r2`);
    await playUntil(page, C, (s) => s.ph === 'end', 900);
    await page.evaluate(() => window.__festa.run(1.5));
    await shot(page, `${C.name}-podium`);
    // tournament (first to 2) on three minigames
    await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('baso_festa_v1')); d.opts.minis = ['riflessi', 'porte', 'memoria']; localStorage.setItem('baso_festa_v1', JSON.stringify(d)); });
    await page.click('[data-fz=quit]');
    await page.waitForSelector('[data-a=fz-start]', { timeout: 10000 });
    await page.click('[data-a=fz-home]'); await page.click('[data-a=fz-mode][data-id=torneo]');
    await page.click('[data-a=fz-start]');
    await page.waitForFunction(() => window.__festa?.stage, null, { timeout: 30000 });
    await page.evaluate(() => { window.__festa.hold = true; });
    const ts = await playUntil(page, C, (s) => s.ph === 'end', 900, { play: 't' });
    if (ts.tourney?.champion == null) issues.push(`${C.name}: tournament without champion`);
    await page.evaluate(() => window.__festa.run(1));
    await shot(page, `${C.name}-tourney-end`);
    await page.click('[data-fz=quit]');
    await page.waitForSelector('[data-a=fz-start]', { timeout: 10000 });
    // every minigame once in Allenamento (desktop), 1 human + CPUs
    if (C.minis && process.env.MINIS !== '0') {
      await page.click('[data-a=fz-home]'); await page.click('[data-a=fz-mode][data-id=train]');
      const ids = await page.evaluate(() => [...document.querySelectorAll('[data-a=fz-train]')].map((e) => e.dataset.id));
      for (const id of ids) {
        await page.click(`[data-a=fz-train][data-id=${id}]`);
        await page.waitForFunction(() => window.__festa?.stage, null, { timeout: 30000 });
        await page.evaluate(() => { window.__festa.hold = true; window.__festa.run(3.4); });
        if (id === 'porte') { // the real keyboard path: G1 holds D (WASD zone) and its crowd moves right
          await page.keyboard.down('d'); await page.evaluate(() => window.__festa.run(0.6)); await page.keyboard.up('d');
          const x = await page.evaluate(() => window.__festa.sim.x[0]); if (!(x > 1)) issues.push(`${C.name}: keyboard D did not steer (x=${x})`);
        }
        await page.evaluate((t) => { const f = window.__festa; const v = f.input.virt[0]; for (let k = 0; k < 120; k++) { v.x = Math.sin(k * 0.1); v.y = Math.cos(k * 0.07); v.a = k % 9 < 3; f.step(1 / 30, false); } v.x = v.y = 0; v.a = false; }, 0);
        await shot(page, `${C.name}-mini-${id}`);
        const s = await playUntil(page, C, (q) => q.ph === 'result', 200);
        if (s.ph !== 'result') issues.push(`${C.name}: ${id} did not reach the results`);
        await page.click('[data-fz=quit]');
        await page.waitForSelector('[data-a=fz-train]', { timeout: 10000 });
      }
    }
    const left = await page.evaluate(() => !!window.__festa); if (left) issues.push(`${C.name}: session not disposed`);
  } catch (e) { issues.push(`${C.name}: ${e.message}`); await page.screenshot({ path: `${OUT}/${C.name}-error.png` }).catch(() => {}); }
  console.log(`${C.name} done`);
  await ctx.close();
}
await browser.close();
console.log(issues.length ? `ISSUES (${issues.length}):\n` + issues.join('\n') : 'OK: no issues');
process.exit(issues.length ? 1 : 0);
