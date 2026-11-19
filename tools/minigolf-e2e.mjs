// Minigolf Baso — browser test: menus at 4 viewports, a hole played to the cup with solver shots
// (window.__minigolf drives the fixed physics clock: headless WebGL is slow), multiplayer turns,
// pause, the editor (paint, share code, import, test). Screenshots + console errors.
//   npx vite build && npx vite preview --port 4666 --strictPort
//   node tools/minigolf-e2e.mjs [baseUrl] [outDir]
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { solve } from './minigolf-check.mjs';
import { courseById } from '../src/minigolf/courses.js';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const BASE = (process.argv[2] || 'http://127.0.0.1:4666/').replace(/\/?$/, '/');
const OUT = process.argv[3] || 'test-results/minigolf';
mkdirSync(OUT, { recursive: true });
const VIEWS = [['desktop', 1440, 900], ['tablet', 1024, 768], ['phone', 390, 844], ['phone-land', 844, 390]];
const errors = [];
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist'] });
const settings = JSON.stringify({ gfxTier: 'low', gfx: 'low', sound: false, music: false });

async function page(w, h, touch = false) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch && w < 900, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`pageerror ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/WebGL|GPU stall|AudioContext|favicon/i.test(m.text())) errors.push(`console ${m.text()}`); });
  await p.addInitScript((s) => { localStorage.setItem('apexdynasty_settings', s); localStorage.setItem('sala_minigolf_v1', JSON.stringify({ coins: 260 })); }, settings);
  return p;
}
const shot = (p, n) => p.screenshot({ path: `${OUT}/${n}.png`, timeout: 120000 });
// play the current hole with solver shots (for holes without moving parts the timing does not matter)
async function playHole(p, holeId, tag) {
  const [cid, n] = holeId.split('-');
  const spec = courseById(cid).holes[+n - 1];
  const sol = solve(spec);
  if (!sol.strokes) throw new Error('no solution ' + holeId);
  await p.evaluate(() => { window.__minigolf.manual = true; window.__minigolf.step(2); });
  for (const s of sol.shots) {
    await p.waitForFunction(() => window.__minigolf.state().phase === 'aim', null, { timeout: 30000 }).catch(() => {});
    if (s.w) await p.evaluate((w) => window.__minigolf.step(w), s.w);
    await p.evaluate(([a, pw]) => window.__minigolf.aim(a, pw), [s.a, s.p]);
    if (tag) { await shot(p, `${tag}-aim`); tag = null; }
    await p.evaluate(([a, pw]) => window.__minigolf.shoot(a, pw), [s.a, s.p]);
    for (let i = 0; i < 40; i++) { const st = await p.evaluate(() => window.__minigolf.step(0.5)); if (st.phase === 'aim' || st.phase === 'card') break; }
  }
  return p.evaluate(() => window.__minigolf.state());
}

for (const [name, w, h] of VIEWS) {
  const touch = name.startsWith('phone') || name === 'tablet';
  const p = await page(w, h, touch);
  await p.goto(BASE + '?nointro&game=minigolf');
  await p.waitForSelector('.mg-menu', { timeout: 60000 });
  await shot(p, `${name}-menu`);
  for (const t of ['percorsi', 'multi', 'daily', 'armadietto']) { await p.click(`.mg-tabs [data-id=${t}]`); await p.waitForTimeout(250); if (name === 'desktop' || name === 'phone') await shot(p, `${name}-${t}`); }
  // overflow check
  const ov = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  if (ov > 2) errors.push(`${name}: horizontal overflow ${ov}px`);
  // a round
  await p.click('.mg-tabs [data-id=percorsi]');
  await p.click('[data-a=mg-round][data-c=giardino]');
  await p.waitForFunction(() => window.__minigolf?.state?.().phase, null, { timeout: 90000 });
  const st = await playHole(p, 'giardino-1', `${name}-game`);
  await p.evaluate(() => window.__minigolf.step(2.5));
  await shot(p, `${name}-card`);
  if (st.phase !== 'card' && !(await p.$('.mg-card'))) errors.push(`${name}: hole not finished (${JSON.stringify(st)})`);
  if (name === 'desktop') {
    await p.click('[data-mg=next]');
    await p.evaluate(() => window.__minigolf.step(2));
    // a real slingshot drag from the ball: pull back (down the screen) and release
    const bs = await p.evaluate(() => { const g = window.__minigolf.game, r = g.canvas.getBoundingClientRect(), b = g.ballScreen(); return [r.left + b[0], r.top + b[1]]; });
    await p.mouse.move(bs[0], bs[1]); await p.mouse.down();
    await p.mouse.move(bs[0] + 10, bs[1] + 60, { steps: 4 }); await p.mouse.move(bs[0] + 20, bs[1] + 140, { steps: 4 });
    await p.evaluate(() => window.__minigolf.render());
    await shot(p, `${name}-drag`);
    await p.mouse.up();
    const ds = await p.evaluate(() => window.__minigolf.state());
    if (ds.strokes !== 1 || ds.phase !== 'moving') errors.push(`drag shot did not fire: ${JSON.stringify(ds)}`);
    await p.evaluate(() => window.__minigolf.step(6));
    await p.evaluate(() => { window.__minigolf.overview(true); window.__minigolf.step(1); });
    await shot(p, `${name}-overview`);
    await p.keyboard.press('Escape'); await p.evaluate(() => window.__minigolf.step(0.1)); await shot(p, `${name}-pause`);
    await p.click('[data-mg=quit]');
    await p.waitForSelector('.mg-menu');
  }
  await p.context().close();
}

// a full 9-hole round with solver shots at the solver's exact clock (windmills included), replay,
// scorecard, coins and course unlock; then a water penalty and the daily hole
{
  const p = await page(1280, 800);
  await p.goto(BASE + '?nointro&game=minigolf');
  await p.waitForSelector('.mg-menu');
  await p.click('[data-a=mg-round][data-c=giardino]');
  await p.waitForFunction(() => window.__minigolf?.state?.().phase, null, { timeout: 90000 });
  await p.evaluate(() => { window.__minigolf.manual = true; });
  const course = courseById('giardino');
  for (let i = 0; i < 9; i++) {
    const sol = solve(course.holes[i]);
    await p.evaluate(() => window.__minigolf.step(2));
    for (const s of sol.shots) {
      for (let k = 0; k < 20; k++) { const st = await p.evaluate(() => window.__minigolf.state()); if (st.phase === 'aim') break; await p.evaluate(() => window.__minigolf.step(0.5)); }
      await p.evaluate((s) => { const g = window.__minigolf.game; g.sim.t = s.t; g.shoot(s.a, s.p); }, s);
      for (let k = 0; k < 60; k++) { const st = await p.evaluate(() => window.__minigolf.step(0.5)); if (st.phase === 'aim' || st.phase === 'card') break; }
    }
    const st = await p.evaluate(() => window.__minigolf.state());
    if (st.phase !== 'card') { errors.push(`round: hole ${i + 1} not holed with the solver shots (${JSON.stringify(st)})`); break; }
    if (i === 4) { // replay of the windmill hole must hole again
      await p.click('[data-mg=replay]');
      let holed = false;
      for (let k = 0; k < 40 && !holed; k++) { await p.evaluate(() => window.__minigolf.step(0.5)); holed = await p.evaluate(() => !window.__minigolf.game.replay); }
      const rs = await p.evaluate(() => window.__minigolf.game.view.sim === window.__minigolf.game.sim);
      if (!holed || !rs) errors.push('replay did not finish');
    }
    await p.click('[data-mg=next]');
  }
  await p.waitForSelector('.mg-res', { timeout: 20000 }).catch(() => errors.push('round: no results'));
  await shot(p, 'round-results');
  const store = await p.evaluate(() => JSON.parse(localStorage.getItem('sala_minigolf_v1')));
  if (!store.courses?.giardino?.done || Object.keys(store.best).length !== 9 || store.coins <= 260) errors.push('round: store not updated ' + JSON.stringify(store).slice(0, 200));
  await p.click('[data-a=mg-menu]');
  await p.click('.mg-tabs [data-id=percorsi]');
  if (await p.$('[data-a=mg-round][data-c=spiaggia]') === null) errors.push('spiaggia not unlocked');
  // penalty: straight into the pond of «Laghetto»
  await p.click('[data-a=mg-single][data-c=giardino][data-h="3"]');
  await p.waitForFunction(() => window.__minigolf?.state?.().phase, null, { timeout: 90000 });
  await p.evaluate(() => { window.__minigolf.manual = true; window.__minigolf.step(2); window.__minigolf.shoot(0, 0.42); });
  let pen = null;
  for (let k = 0; k < 20; k++) { const st = await p.evaluate(() => window.__minigolf.step(0.25)); if (st.phase === 'aim') { pen = st; break; } }
  if (!pen || pen.strokes !== 2 || Math.abs(pen.ball[2] - 6.5) > 0.01) errors.push('penalty: ' + JSON.stringify(pen));
  await p.evaluate(() => window.__minigolf.game.o.onQuit());
  // daily hole
  await p.click('.mg-tabs [data-id=daily]');
  await p.click('[data-a=mg-daily]');
  await p.waitForFunction(() => window.__minigolf?.state?.().phase, null, { timeout: 90000 });
  await p.evaluate(() => { window.__minigolf.manual = true; window.__minigolf.step(2); });
  await shot(p, 'daily');
  await p.evaluate(() => window.__minigolf.game.o.onQuit());
  await p.context().close();
}

// themed holes (one screenshot per course) + multiplayer
{
  const p = await page(1440, 900);
  await p.goto(BASE + '?nointro&game=minigolf');
  await p.waitForSelector('.mg-menu');
  for (const [c, k] of [['spiaggia', 2], ['castello', 8], ['lunapark', 0], ['spazio', 8], ['giardino', 4]]) {
    await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('sala_minigolf_v1') || '{}'); s.courses = { giardino: { done: true }, spiaggia: { done: true }, castello: { done: true }, lunapark: { done: true } }; localStorage.setItem('sala_minigolf_v1', JSON.stringify(s)); });
    await p.evaluate(() => window.__apex.App.go('minigolf', { tab: 'percorsi' }));
    await p.click(`[data-a=mg-single][data-c=${c}][data-h="${k}"]`);
    await p.waitForFunction(() => window.__minigolf?.state?.().phase, null, { timeout: 90000 });
    await p.evaluate(() => { window.__minigolf.manual = true; window.__minigolf.step(2.2); });
    await shot(p, `course-${c}`);
    await p.evaluate(() => { window.__minigolf.overview(true); window.__minigolf.step(1.2); });
    await shot(p, `course-${c}-overview`);
    await p.evaluate(() => window.__minigolf.game.o.onQuit());
    await p.waitForSelector('.mg-menu');
  }
  // multiplayer: 3 players alternate strokes
  await p.click('.mg-tabs [data-id=multi]');
  await p.click('[data-a=mg-np][data-n="3"]');
  await p.fill('.mg-pname[data-i="1"]', 'Bea');
  await p.click('[data-a=mg-multi-go][data-c=giardino]');
  await p.waitForFunction(() => window.__minigolf?.state?.().phase, null, { timeout: 90000 });
  await p.evaluate(() => { window.__minigolf.manual = true; window.__minigolf.step(2); });
  const order = [];
  for (let i = 0; i < 3; i++) {
    const s = await p.evaluate(() => window.__minigolf.state());
    order.push(s.player);
    await p.evaluate(() => window.__minigolf.shoot(0.02, 0.35));
    for (let j = 0; j < 30; j++) { const t = await p.evaluate(() => window.__minigolf.step(0.5)); if (t.phase === 'aim' || t.phase === 'card') break; }
  }
  if (order.join() !== '0,1,2') errors.push('multiplayer turn order ' + order.join());
  await shot(p, 'multi-turns');
  await p.evaluate(() => window.__minigolf.game.o.onQuit());
  // editor
  await p.evaluate(() => window.__apex.App.go('minigolf-editor', {}));
  await p.waitForSelector('#mge-cv');
  const box = await (await p.$('#mge-cv')).boundingBox();
  await p.click('[data-a=mge-tool][data-t=B]');
  await p.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.45);
  await p.click('[data-a=mge-tool][data-t=w]');
  await p.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.62); await p.mouse.down(); await p.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.62, { steps: 6 }); await p.mouse.up();
  await shot(p, 'editor');
  await p.click('[data-a=mge-share]');
  const code = await p.inputValue('.mge-code');
  if (!/^MG1-/.test(code)) errors.push('share code ' + code);
  await p.click('.modal [data-a=close-modal]');
  await p.click('[data-a=mge-save]');
  await p.click('[data-a=mge-test]');
  await p.waitForFunction(() => window.__minigolf?.state?.().phase, null, { timeout: 90000 });
  await p.evaluate(() => { window.__minigolf.manual = true; window.__minigolf.step(2); });
  await shot(p, 'editor-test');
  await p.evaluate(() => window.__minigolf.game.o.onQuit());
  await p.waitForSelector('#mge-cv');
  const n = await p.$$eval('.mge-list li b', (l) => l.length);
  if (n < 1) errors.push('editor save');
  await p.context().close();
}
await browser.close();
console.log(errors.length ? errors.join('\n') : 'nessun errore');
process.exit(errors.length ? 1 : 0);
