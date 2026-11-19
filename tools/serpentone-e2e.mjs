// Serpentone browser test: setup screen, every arena/mode in game, results, at desktop / tablet / phone
// (portrait and landscape). Headless WebGL is slow, so the game loop is held and the test drives
// window.__serpentone.step(dt) deterministically, rendering only for screenshots.
//   npx vite build && npx vite preview --port 4663 --strictPort
//   node tools/serpentone-e2e.mjs [baseUrl] [outDir]
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const BASE = (process.argv[2] || 'http://127.0.0.1:4663/').replace(/\/?$/, '/');
const OUT = process.argv[3] || 'serpentone-shots';
mkdirSync(OUT, { recursive: true });
const IGNORE = /GPU stall|AudioContext|favicon|ReadPixels|WebGL: CONTEXT_LOST/i;
const issues = [];
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });

const CASES = [
  { name: 'desktop', tier: 'high', vp: [1440, 900], mode: 'classica', arena: 'giardino', diff: 'normale' },
  { name: 'tablet', vp: [1024, 768], mode: 'battaglia', arena: 'neon', diff: 'difficile', touch: true },
  { name: 'phone-portrait', tier: 'low', vp: [390, 844], mode: 'sopravvivenza', arena: 'spiaggia', diff: 'facile', touch: true, mobile: true },
  { name: 'phone-landscape', vp: [844, 390], mode: 'duo', arena: 'spazio', diff: 'normale', touch: true, mobile: true },
];
const only = process.env.ONLY;
for (const C of CASES) {
  if (only && !only.split(',').includes(C.name)) continue;
  const ctx = await browser.newContext({ viewport: { width: C.vp[0], height: C.vp[1] }, hasTouch: !!C.touch, isMobile: !!C.mobile, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => issues.push(`${C.name} pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !IGNORE.test(m.text())) issues.push(`${C.name} console: ${m.text()}`); });
  await page.addInitScript(([c]) => {
    localStorage.setItem('apexdynasty_settings', JSON.stringify({ gfxTier: c.tier || 'med', gfx: c.tier === 'low' ? 'low' : 'high', sound: false, music: false }));
    localStorage.setItem('baso_serpentone_v1', JSON.stringify({ mode: c.mode, arena: c.arena, diff: c.diff, coins: 900, skin: 'mango', pattern: 'anelli', hat: 'corona', owned: { skin: ['mango'], pattern: ['anelli'], hat: ['corona'] } }));
  }, [C]);
  await page.goto(BASE + '?game=serpentone');
  await page.waitForSelector('[data-a=sp-play]', { timeout: 30000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${C.name}-menu.png`, fullPage: false });
  // overflow check on the menu
  const ov = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  if (ov > 2) issues.push(`${C.name} menu overflows horizontally by ${ov}px`);
  // shop: buy something with the seeded coins
  await page.click('[data-a=sp-tab][data-id=hat]');
  await page.click('[data-a=sp-buy][data-k=hat][data-id=elica]');
  await page.waitForSelector('.modal-wrap', { timeout: 5000 }).catch(() => issues.push(`${C.name}: no purchase dialog`));
  await page.evaluate(() => document.querySelector('.modal-wrap .btn.primary, .modal-wrap [data-a="modal-yes"], .modal-wrap button.primary')?.click());
  await page.waitForTimeout(200);
  const bought = await page.evaluate(() => JSON.parse(localStorage.getItem('baso_serpentone_v1')).owned.hat.includes('elica'));
  if (!bought) issues.push(`${C.name}: hat purchase failed`);
  await page.evaluate(() => { const p = JSON.parse(localStorage.getItem('baso_serpentone_v1')); p.hat = 'corona'; localStorage.setItem('baso_serpentone_v1', JSON.stringify(p)); });
  await page.click('[data-a=sp-play]');
  await page.waitForFunction(() => window.__serpentone?.sim && window.__serpentone.views, null, { timeout: 60000 });
  const info = await page.evaluate(() => {
    const g = window.__serpentone; g.hold = true;
    for (const p of g.sim.players) g.sim.autopilot(p);
    const t0 = performance.now();
    for (let i = 0; i < 30 * 25; i++) g.step(1 / 30);
    const ms = performance.now() - t0;
    g.render();
    return { ms: Math.round(ms), inst: g.instances, food: g.foodShown, snakes: g.sim.snakes.length, alive: g.sim.snakes.filter((s) => s.alive).length, over: g.sim.over, len: Math.round(g.sim.players[0].m) };
  });
  console.log(C.name, JSON.stringify(info));
  // input: keys, mouse aim and the touch stick map to the player's target direction
  if (!info.over) {
    const inp = async () => page.evaluate(() => { const g = window.__serpentone, p = g.sim.players[0]; p.ai = false; g.readInput(); return { ta: p.input.ta, boost: p.input.boost }; });
    const near = (a, b) => a != null && Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) < 0.35;
    if (!C.touch) {
      await page.keyboard.down('KeyD'); let r = await inp(); await page.keyboard.up('KeyD');
      if (!near(r.ta, 0)) issues.push(`${C.name}: D key does not steer right (${r.ta})`);
      await page.keyboard.down('KeyW'); await page.keyboard.down('Space'); r = await inp(); await page.keyboard.up('KeyW'); await page.keyboard.up('Space');
      if (!near(r.ta, -Math.PI / 2) || !r.boost) issues.push(`${C.name}: W + Space wrong (${JSON.stringify(r)})`);
      const head = await page.evaluate(() => { const g = window.__serpentone, v = g.views[0], p = v.p; g.updateCamera(v, 0, true); const { Vector3 } = Object.getPrototypeOf(v.cam.position).constructor ? { Vector3: v.cam.position.constructor } : {}; const q = new Vector3(p.x, 0, p.z).project(v.cam); return [(q.x + 1) / 2 * innerWidth, (1 - q.y) / 2 * innerHeight]; });
      await page.mouse.move(head[0], head[1] + 200); r = await inp();
      if (!near(r.ta, Math.PI / 2)) issues.push(`${C.name}: mouse below the head should aim down (${r.ta})`);
      await page.mouse.down(); r = await inp(); await page.mouse.up();
      if (!r.boost) issues.push(`${C.name}: mouse button does not boost`);
      await page.keyboard.press('Escape'); await page.waitForTimeout(100);
      const paused = await page.evaluate(() => window.__serpentone.paused); if (!paused) issues.push(`${C.name}: Esc does not pause`);
      await page.evaluate(() => window.__serpentone.togglePause(false));
    } else if (!C.name.includes('landscape')) {
      const r = await page.evaluate(() => {
        const g = window.__serpentone, cv = g.cv, p = g.sim.players[0]; p.ai = false;
        const ev = (t, x, y) => cv.dispatchEvent(new PointerEvent(t, { pointerType: 'touch', pointerId: 7, clientX: x, clientY: y, bubbles: true }));
        ev('pointerdown', 200, 300); ev('pointermove', 200, 380); g.readInput(); const down = p.input.ta;
        ev('pointermove', 120, 300); g.readInput(); const left = p.input.ta;
        window.dispatchEvent(new PointerEvent('pointerup', { pointerType: 'touch', pointerId: 7 }));
        return { down, left, joy: !!document.querySelector('.sp-joy') };
      });
      if (!near(r.down, Math.PI / 2) || !near(Math.abs(r.left), Math.PI)) issues.push(`${C.name}: touch stick wrong (${JSON.stringify(r)})`);
    }
    await page.evaluate(() => window.__serpentone.sim.autopilot(window.__serpentone.sim.players[0]));
  }
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${C.name}-game.png` });
  // pause overlay
  if (!info.over) { // (a one-life mode can already be over: the autopilot may have crashed)
    await page.evaluate(() => window.__serpentone.togglePause(true));
    await page.waitForSelector('.sp-pause');
    await page.screenshot({ path: `${OUT}/${C.name}-pause.png` });
    await page.evaluate(() => window.__serpentone.togglePause(false));
  }
  // play to the end (time out, last survivor or death)
  const end = await page.evaluate(() => {
    const g = window.__serpentone;
    if (g.sim.modeId === 'sopravvivenza') { for (let i = 0; i < 30 * 20; i++) g.step(1 / 30); g.sim.kill(g.sim.players[0], g.sim.snakes[2], 'body'); }
    for (let i = 0; i < 30 * 600 && !g.over; i++) g.step(1 / 30);
    return { over: g.over, why: g.sim.result?.why, t: Math.round(g.sim.time) };
  });
  console.log('  end', JSON.stringify(end));
  if (!end.over) issues.push(`${C.name}: match did not end`);
  await page.waitForSelector('.sp-res', { timeout: 8000 }).catch(() => issues.push(`${C.name}: no results`));
  await page.evaluate(() => window.__serpentone?.render());
  await page.screenshot({ path: `${OUT}/${C.name}-results.png` });
  const coins = await page.evaluate(() => JSON.parse(localStorage.getItem('baso_serpentone_v1')).games);
  if (coins !== 1) issues.push(`${C.name}: match not saved (games=${coins})`);
  // rematch, then back to the menu and the hub
  const modal = await page.evaluate(() => document.querySelector('.modal-wrap')?.innerText);
  if (modal) { issues.push(`${C.name}: unexpected dialog: ${modal.slice(0, 400)}`); await page.evaluate(() => window.__apex.App.closeModal()); }
  await page.click('[data-a=sp-again]');
  await page.waitForFunction(() => window.__serpentone?.sim?.time === 0, null, { timeout: 30000 }).catch(() => issues.push(`${C.name}: rematch failed`));
  await page.evaluate(() => { window.__serpentone.hold = true; });
  await page.evaluate(() => window.__apex.App.go('launcher'));
  await page.waitForTimeout(500);
  if (C.name === 'desktop') {
    await page.evaluate(() => document.querySelector('[data-a=bh-game][data-id=serpentone]')?.click());
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/${C.name}-hub.png` });
  }
  await ctx.close();
}
await browser.close();
if (issues.length) { console.log('ISSUES:\n' + issues.join('\n')); process.exit(1); }
console.log('serpentone e2e ok');
