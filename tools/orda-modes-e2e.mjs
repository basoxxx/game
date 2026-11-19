// Orda extra modes — browser test: plays today's "Sfida del giorno" (official attempt + share text),
// three "Infinita" waves with perk picks, claims a mission, and takes screenshots at four sizes.
// Headless WebGL runs at ~1 fps, so matches are driven by stepping the game deterministically with the
// core autopilot (game.autoplay + game.step) instead of waiting for real time.
//   npx vite build && npx vite preview --port 4653 --strictPort
//   node tools/orda-modes-e2e.mjs [baseUrl] [outDir]
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const { chromium } = pw;

const BASE = (process.argv[2] || 'http://127.0.0.1:4653/').replace(/\/?$/, '/');
const OUT = process.argv[3] || './orda-modes-shots';
mkdirSync(OUT, { recursive: true });
const IGNORE = /GPU stall|WebGL|THREE\.WebGLRenderer|AudioContext|favicon|ReadPixels|GroupMarkerNotSet/i;
const errors = [];
const log = (...a) => console.log(...a);

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await ctx.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' && !IGNORE.test(m.text())) errors.push(`console: ${m.text()}`); });
page.setDefaultTimeout(60000);

const shot = async (name) => { await page.waitForTimeout(350); await page.screenshot({ path: `${OUT}/${name}.png` }); log('  📸', name); };
const click = async (sel) => { await page.locator(sel).first().click(); await page.waitForTimeout(250); };
// step the live match with the autopilot until it ends (or `max` sim-seconds pass)
async function autoplay(max = 400) {
  await page.waitForFunction(() => window.__ordaModes?.game?.sim, null, { timeout: 90000 });
  return page.evaluate(async (max) => {
    const g = window.__ordaModes.game; g.autoplay = true;
    let t = 0;
    while (t < max && !g.over) { for (let i = 0; i < 90; i++) g.step(1 / 30); t += 3; await new Promise((r) => setTimeout(r, 0)); }
    return { over: g.over, state: g.sim.state, t: g.sim.t, base: Math.round(g.sim.base.hp), cannon: g.sim.cannon.hp, blue: g.sim.blueUnits() };
  }, max);
}
// a few steps without ending, for an in-game screenshot
async function stepSome(n) { await page.evaluate((n) => { const g = window.__ordaModes.game; g.autoplay = true; for (let i = 0; i < n; i++) g.step(1 / 30); }, n); }

log('boot', BASE);
await page.goto(BASE + '?game=orda');
await page.evaluate(() => { localStorage.removeItem('sala_orda_modes_v1'); localStorage.removeItem('sala_orda_daily_cache'); });
await page.goto(BASE + '?game=orda');
await page.waitForSelector('.or-mode[data-id="sfida"]');
await shot('01-orda-menu-modes-1440');

// ---- Sfida del giorno
await click('.or-mode[data-id="sfida"]');
await page.waitForSelector('.om-menu');
await page.waitForSelector('.om-daily-hero h2:not(:has-text("Preparazione"))', { timeout: 60000 });
await page.waitForSelector('[data-a="om-daily"]:not([disabled])');
await shot('02-daily-tab-1440');
await click('[data-a="om-daily"]');
await page.waitForFunction(() => window.__ordaModes?.game?.sim);
await stepSome(30 * 14);
await shot('03-daily-ingame-1440');
let r = await autoplay();
log('  daily match:', JSON.stringify(r));
await page.waitForSelector('.om-res', { timeout: 30000 });
const share = await page.locator('#om-share').textContent();
log('  share:\n' + share.split('\n').map((l) => '    ' + l).join('\n'));
if (!/^Orda #\d+ /.test(share)) errors.push('share text malformed');
await click('[data-a="om-share"]');
await shot('04-daily-result-1440');
// practice run: must not overwrite the official result (also check the pause dialog on the way)
await click('.om-res [data-a="om-daily"]');
await page.waitForFunction(() => window.__ordaModes?.game?.sim);
await stepSome(30 * 5);
await page.evaluate(() => window.__ordaModes.game.togglePause(true));
await page.waitForSelector('.om-dlg [data-a="om-resume"]');
await shot('04b-pause-1440');
await click('.om-dlg [data-a="om-resume"]');
r = await autoplay();
await page.waitForSelector('.om-res');
const practice = await page.locator('.om-res .om-k').textContent();
if (!/allenamento/.test(practice)) errors.push(`practice not labelled: ${practice}`);
await click('.om-res [data-a="om-quit"]');
await page.waitForSelector('.om-daily-res');
const store = await page.evaluate(() => JSON.parse(localStorage.getItem('sala_orda_modes_v1')));
const today = Object.values(store.daily)[0];
log('  stored daily:', JSON.stringify(today), 'streak', store.streak);
if (!today?.official || today.practice !== 1 || store.streak !== 1) errors.push('daily bookkeeping wrong');
await shot('05-daily-done-1440');

// ---- Infinita: three waves with perk picks
await click('[data-a="om-tab"][data-id="infinita"]');
await shot('06-endless-tab-1440');
await click('[data-a="om-endless"]');
for (let w = 1; w <= 3; w++) {
  r = await autoplay(600);
  log(`  wave ${w}:`, JSON.stringify(r));
  if (r.state !== 'won') { errors.push(`endless wave ${w} not cleared (${r.state})`); break; }
  await page.waitForSelector('.om-pick', { timeout: 30000 });
  if (w === 1) await shot('07-endless-perks-1440');
  const perks = await page.locator('.om-perk').count();
  if (perks !== 3) errors.push(`perk pick shows ${perks} cards`);
  await page.keyboard.press(`Digit${((w - 1) % 3) + 1}`);
  await page.waitForFunction((w) => window.__ordaModes?.play?.run?.wave === w + 1 && window.__ordaModes?.game?.sim, w, { timeout: 90000 });
  if (w === 3) { await stepSome(30 * 16); await shot('08-endless-wave4-ingame-1440'); }
}
const run = await page.evaluate(() => JSON.parse(localStorage.getItem('sala_orda_modes_v1')).run);
log('  saved run:', JSON.stringify({ wave: run?.wave, cleared: run?.cleared, perks: run?.perks, line: run?.line }));
if (!run || run.cleared !== 3 || run.perks.length !== 3) errors.push('endless run not saved after 3 waves');
// lose the line on purpose: stop firing until the reds overrun the cannon
await page.evaluate(async () => { const g = window.__ordaModes.game; g.autoplay = false; let n = 0; while (!g.over && n < 30 * 900) { for (let i = 0; i < 300; i++) { g.sim.input.fire = false; g.step(1 / 30); } n += 300; await new Promise((r) => setTimeout(r, 0)); } });
await page.waitForSelector('.om-res', { timeout: 30000 });
await shot('09-endless-over-1440');
const hs = await page.evaluate(() => JSON.parse(localStorage.getItem('sala_orda_modes_v1')).endless);
log('  high scores:', JSON.stringify(hs));
if (!hs.length || hs[0].waves !== 3) errors.push('endless high score missing');
await click('.om-res [data-a="om-quit"]');
await shot('10-endless-table-1440');

// ---- Missioni
await click('[data-a="om-tab"][data-id="missioni"]');
await shot('11-missions-1440');
const ready = await page.locator('[data-a="om-claim"]').count();
log('  missions ready to claim:', ready);
if (ready) { const before = await page.evaluate(() => JSON.parse(localStorage.getItem('sala_orda_v1')).coins); await click('[data-a="om-claim"]'); const after = await page.evaluate(() => JSON.parse(localStorage.getItem('sala_orda_v1')).coins); log(`  coins ${before} → ${after}`); if (!(after > before)) errors.push('claim gave no coins'); }

// ---- other sizes
const SIZES = [[1024, 768], [390, 844], [844, 390]];
for (const [w, h] of SIZES) {
  await page.setViewportSize({ width: w, height: h });
  for (const tab of ['sfida', 'infinita', 'missioni']) {
    await click(`[data-a="om-tab"][data-id="${tab}"]`);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (over > 1) errors.push(`horizontal overflow ${over}px on ${tab} at ${w}x${h}`);
    await shot(`20-${tab}-${w}x${h}`);
  }
  await click('[data-a="om-tab"][data-id="infinita"]');
  await click('[data-a="om-endless"]');
  await page.waitForFunction(() => window.__ordaModes?.game?.sim, null, { timeout: 90000 });
  await stepSome(30 * 12);
  await shot(`21-ingame-${w}x${h}`);
  r = await autoplay(600);
  if (r.state === 'won') { await page.waitForSelector('.om-pick'); await shot(`22-perks-${w}x${h}`); }
  else { await page.waitForSelector('.om-res'); }
  await click('.om-dlg [data-a="om-quit"]');
  await page.waitForSelector('.om-menu');
}
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(BASE);
await page.locator('.bh-tab', { hasText: 'Orda' }).first().click();
await page.waitForSelector('.bh-mode[data-m="sfida"]');
await shot('30-hub-orda-tiles-1440');

await browser.close();
log(errors.length ? `\n${errors.length} PROBLEMS:\n- ${errors.join('\n- ')}` : '\nno console errors, all checks OK');
process.exit(errors.length ? 1 : 0);
