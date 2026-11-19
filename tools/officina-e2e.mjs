// Officina — browser test: opens the game from the Baso Hub deep link, drags kart onto kart (merge), buys,
// opens a crate, installs a part, runs a race to the end, checks panels, offline earnings and the hub
// entry; screenshots at 1440x900, 1024x768, 390x844 and 844x390. Fails on any console error.
//   npx vite build && npx vite preview --port 4665 --strictPort   then   node tools/officina-e2e.mjs [baseUrl] [outDir]
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const BASE = (process.argv[2] || 'http://127.0.0.1:4665/').replace(/\/?$/, '/');
const OUT = process.argv[3] || 'officina-shots';
mkdirSync(OUT, { recursive: true });
const IGNORE = /WebGL|GPU stall|THREE\.WebGLRenderer|AudioContext|favicon|ReadPixels/i;
const errors = [];
let fails = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'ok  ' : 'FAIL'}  ${msg}`); if (!cond) fails++; };
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const settings = JSON.stringify({ gfxTier: 'low', gfx: 'low', sound: false, music: false, reduceMotion: true });

async function open(vp, store) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, hasTouch: vp.width < 900 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[${vp.width}x${vp.height}] pageerror ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !IGNORE.test(m.text())) errors.push(`[${vp.width}x${vp.height}] console ${m.text()}`); });
  await page.addInitScript(([s, st]) => { localStorage.setItem('apexdynasty_settings', s); if (st && !sessionStorage.getItem('of-seeded')) { const d = JSON.parse(st); d.lastSeen = Date.now(); localStorage.setItem('sala_officina_v1', JSON.stringify(d)); sessionStorage.setItem('of-seeded', '1'); } }, [settings, store ? JSON.stringify(store) : null]);
  await page.goto(BASE + '?game=officina');
  await page.waitForFunction(() => window.__officina?.g?.pads?.length > 0, null, { timeout: 90000 });
  await page.waitForTimeout(800);
  return { ctx, page };
}
// screen position of a slot (centre of its pad)
const slotXY = (page, i) => page.evaluate((i) => { const g = window.__officina.g; const p = g.project(g.pos(i)); const b = g.cv.getBoundingClientRect(); return { x: b.left + p.x, y: b.top + p.y }; }, i);
async function drag(page, from, to) {
  const a = await slotXY(page, from), b = await slotXY(page, to);
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  for (let k = 1; k <= 8; k++) await page.mouse.move(a.x + (b.x - a.x) * k / 8, a.y + (b.y - a.y) * k / 8);
  await page.mouse.up();
  await page.waitForTimeout(700);
}
const grid = (page) => page.evaluate(() => window.__officina.s.grid.map((x) => (x ? `${x.k}${x.t}${x.p || ''}` : '')));
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png`, timeout: 120000 });

// ── desktop: the main flows
{
  const { ctx, page } = await open({ width: 1440, height: 900 });
  let g = await grid(page);
  ok(g[0] === 'car1' && g[1] === 'car1', 'new game starts with two karts');
  await shot(page, 'officina-1440x900-start');
  await drag(page, 1, 0);
  g = await grid(page);
  ok(g[0] === 'car2' && g[1] === '', `drag kart onto kart merges into level 2 (${g.slice(0, 3)})`);
  // buy cars with plenty of coins, then merge two of them by drag
  await page.evaluate(() => { window.__officina.s.coins = 1e6; });
  for (let k = 0; k < 3; k++) await page.click('[data-a=of-buy]');
  g = await grid(page);
  const cars = g.map((x, i) => [x, i]).filter(([x]) => x === 'car1').map(([, i]) => i);
  ok(cars.length >= 2, `shop buys cars (${cars.length} karts level 1)`);
  await drag(page, cars[1], cars[0]);
  g = await grid(page);
  ok(g[cars[0]] === 'car2', 'second merge by drag');
  // tap-to-merge: select, then tap the twin
  await page.evaluate(() => { const s = window.__officina.s; s.grid[5] = { k: 'car', t: 2, parts: { motore: 0, aero: 0, gomme: 0, telaio: 0 } }; window.__officina.g.sync(s.grid); });
  const p5 = await slotXY(page, 5), p0 = await slotXY(page, cars[0]);
  await page.mouse.click(p5.x, p5.y); await page.waitForTimeout(200); await page.mouse.click(p0.x, p0.y); await page.waitForTimeout(700);
  g = await grid(page);
  ok(g[cars[0]] === 'car3' && g[5] === '', 'tap + tap merges too');
  // a crate: tap opens it
  await page.evaluate(() => { const s = window.__officina.s; s.grid[7] = { k: 'crate', c: 'car', t: 1 }; window.__officina.g.sync(s.grid); });
  await page.waitForTimeout(600);
  const p7 = await slotXY(page, 7); await page.mouse.click(p7.x, p7.y); await page.waitForTimeout(500);
  g = await grid(page);
  ok(g[7].startsWith('car'), 'tapping a crate opens it');
  // a part dragged on a car is installed
  await page.evaluate(() => { const s = window.__officina.s; s.grid[8] = { k: 'part', p: 'motore', t: 2 }; window.__officina.g.sync(s.grid); });
  await page.waitForTimeout(600);
  await drag(page, 8, cars[0]);
  const parts = await page.evaluate((i) => window.__officina.s.grid[i].parts.motore, cars[0]);
  ok(parts === 2, 'part dragged onto a car is installed');
  // drop on the scrap bin
  const sb = await page.evaluate(() => { const r = document.querySelector('.of-scrap').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
  const a = await slotXY(page, 7);
  const before = await page.evaluate(() => window.__officina.s.coins);
  await page.mouse.move(a.x, a.y); await page.mouse.down(); for (let k = 1; k <= 8; k++) await page.mouse.move(a.x + (sb.x + sb.width / 2 - a.x) * k / 8, a.y + (sb.y + sb.height / 2 - a.y) * k / 8); await page.mouse.up();
  await page.waitForTimeout(600);
  const after = await page.evaluate(() => window.__officina.s.coins);
  g = await grid(page);
  ok(g[7] === '' && after > before, 'dragging onto Rottama scraps the item');
  // keyboard: arrows + enter pick and drop
  await page.evaluate(() => { const s = window.__officina.s; s.grid.fill(null); s.grid[0] = { k: 'car', t: 4, parts: { motore: 0, aero: 0, gomme: 0, telaio: 0 } }; s.grid[1] = { k: 'car', t: 4, parts: { motore: 0, aero: 0, gomme: 0, telaio: 0 } }; window.__officina.g.sync(s.grid); window.__officina.V.cursor = 0; window.__officina.g.setCursor(0); document.activeElement?.blur(); });
  await page.keyboard.press('Enter'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter'); await page.waitForTimeout(700);
  g = await grid(page);
  ok(g[1] === 'car5', `keyboard merge (${g.slice(0, 2)})`);
  await shot(page, 'officina-1440x900-merged');
  // panels
  for (const id of ['gare', 'ricerca', 'missioni', 'stagione', 'collezione', 'aiuto']) {
    await page.click(`.of-nav [data-id=${id}]`); await page.waitForTimeout(250);
    ok(await page.locator('#of-panel.on .of-pbody').count() === 1, `panel ${id} opens`);
    if (id === 'gare') await shot(page, 'officina-1440x900-gare');
    if (id === 'ricerca') await shot(page, 'officina-1440x900-ricerca');
  }
  await page.click('[data-a=of-close]');
  // research purchase
  await page.evaluate(() => { window.__officina.s.rp = 500; });
  await page.click('.of-nav [data-id=ricerca]'); await page.waitForTimeout(200);
  await page.click('[data-a=of-research][data-id=sponsor]'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => window.__officina.s.research.sponsor === 1), 'research bought');
  await page.click('[data-a=of-close]');
  // a race: drag event, shift a few times, then skip to the end
  await page.click('.of-nav [data-id=gare]'); await page.waitForTimeout(300);
  await page.click('[data-a=of-race][data-id=brianza-1]');
  await page.waitForFunction(() => window.__officina?.V?.race, null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  await shot(page, 'officina-1440x900-race');
  for (let k = 0; k < 3; k++) { await page.keyboard.press('Space'); await page.waitForTimeout(150); }
  await page.evaluate(() => window.__officina.V.race.skip());
  await page.waitForSelector('#of-race .of-res', { timeout: 60000 });
  ok(true, 'race reaches the results card');
  await shot(page, 'officina-1440x900-result');
  const races = await page.evaluate(() => window.__officina.s.stats.races);
  ok(races === 1, 'race counted');
  await page.click('[data-a=of-race-close]'); await page.waitForTimeout(300);
  // a circuit race with the boost
  await page.evaluate(() => { const s = window.__officina.s; s.grid[2] = { k: 'car', t: 9, parts: { motore: 3, aero: 3, gomme: 3, telaio: 3 } }; window.__officina.g.sync(s.grid); window.__officina.V.raceCar = 2; });
  await page.click('[data-a=of-race][data-id=brianza-3]');
  await page.waitForFunction(() => window.__officina?.V?.race?.run?.state === 'race', null, { timeout: 60000 });
  await page.keyboard.press('Space');
  await page.waitForTimeout(400);
  await shot(page, 'officina-1440x900-race-circuit');
  await page.evaluate(() => window.__officina.V.race.skip());
  await page.waitForSelector('#of-race .of-res', { timeout: 60000 });
  const won = await page.evaluate(() => window.__officina.s.events['brianza-3'] || 0);
  ok(won >= 1, 'strong car wins the head-to-head and gets the medal');
  await page.click('[data-a=of-race-close]');
  // save → reload keeps progress, offline earnings shown
  // the page saves on the way out (pagehide): pretend 3 hours passed before the next load
  await page.addInitScript(() => { if (!sessionStorage.getItem('of-away')) return; sessionStorage.removeItem('of-away'); const d = JSON.parse(localStorage.getItem('sala_officina_v1')); d.lastSeen = Date.now() - 3 * 3600e3; localStorage.setItem('sala_officina_v1', JSON.stringify(d)); });
  await page.evaluate(() => sessionStorage.setItem('of-away', '1'));
  await page.reload();
  await page.waitForFunction(() => window.__officina?.g?.pads?.length > 0, null, { timeout: 90000 });
  await page.waitForTimeout(500);
  ok(await page.locator('.modal-wrap .of-modal').count() === 1, 'offline earnings dialog after 3 h away');
  await shot(page, 'officina-1440x900-offline');
  await page.click('.modal-wrap [data-a=close-modal]');
  ok((await grid(page))[1] === 'car5', 'progress kept after reload');
  // hub: the entry is listed under Gestionali with its modes
  await page.goto(BASE);
  await page.waitForTimeout(1500);
  const hub = await page.evaluate(() => document.body.innerText.includes('Officina'));
  ok(hub, 'Baso Hub lists Officina');
  await ctx.close();
}

// ── other sizes: a mid-game garage, screenshots, a drag merge on touch-sized screens
const mid = { v: 1, region: 2, season: 1, best: 13, bestEver: 13, coins: 5e6, rp: 120, tokens: 9, trophies: 18, trophiesAll: 18, seen: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
  grid: [{ k: 'car', t: 13, parts: { motore: 3, aero: 2, gomme: 0, telaio: 1 } }, { k: 'car', t: 12, parts: { motore: 2, aero: 0, gomme: 0, telaio: 0 } }, { k: 'car', t: 12, parts: { motore: 0, aero: 0, gomme: 0, telaio: 0 } }, { k: 'car', t: 10, parts: { motore: 0, aero: 0, gomme: 0, telaio: 0 } }, { k: 'part', p: 'gomme', t: 3 }, { k: 'crate', c: 'car', t: 8 }, null, { k: 'car', t: 9, parts: { motore: 0, aero: 0, gomme: 0, telaio: 0 } }, { k: 'car', t: 9, parts: { motore: 0, aero: 0, gomme: 0, telaio: 0 } }, { k: 'part', p: 'aero', t: 2 }, { k: 'part', p: 'aero', t: 2 }, null, null, { k: 'car', t: 11, parts: { motore: 1, aero: 1, gomme: 1, telaio: 1 } }],
  events: { 'brianza-1': 3, 'brianza-2': 3, 'brianza-3': 2, 'lago-1': 2, 'lago-2': 1 }, lastSeen: Date.now(), tut: 99 };
for (const vp of [{ width: 1024, height: 768 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
  const { ctx, page } = await open(vp, mid);
  const tag = `${vp.width}x${vp.height}`;
  await shot(page, `officina-${tag}-garage`);
  await drag(page, 8, 7);
  const g = await grid(page);
  ok(g[7] === 'car10' && g[8] !== 'car9', `[${tag}] drag merge`);
  const p1 = await slotXY(page, 0); await page.mouse.click(p1.x, p1.y); await page.waitForTimeout(400);
  await shot(page, `officina-${tag}-selected`);
  await page.click('.of-nav [data-id=gare]'); await page.waitForTimeout(400);
  await shot(page, `officina-${tag}-gare`);
  const over = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  ok(!over, `[${tag}] no horizontal overflow`);
  await page.click('[data-a=of-regtab][data-id="1"]'); await page.waitForTimeout(300);
  await page.click('[data-a=of-race][data-id=lago-1]');
  await page.waitForFunction(() => window.__officina?.V?.race?.run?.state === 'race', null, { timeout: 60000 });
  await page.waitForTimeout(600);
  await shot(page, `officina-${tag}-race`);
  await page.evaluate(() => window.__officina.V.race.skip());
  await page.waitForSelector('#of-race .of-res', { timeout: 60000 });
  await shot(page, `officina-${tag}-result`);
  await ctx.close();
}
await browser.close();
if (errors.length) { console.log('\nERRORI:\n' + errors.join('\n')); fails++; }
console.log(fails ? `\n${fails} problemi` : '\nTutto ok');
process.exit(fails ? 1 : 0);
