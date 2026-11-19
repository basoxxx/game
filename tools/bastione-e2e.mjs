// Bastione browser test: menus, building/upgrading through the real UI, a level played to the end
// (the simulation is stepped from outside: headless WebGL draws ~1 fps), store bookkeeping, modes,
// pause menu, keyboard, and screenshots at four viewports. No console errors allowed.
//   npx vite build && npx vite preview --port 4664 --strictPort
//   node tools/bastione-e2e.mjs [baseUrl] [screenshotDir]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }
const BASE = (process.argv[2] || 'http://127.0.0.1:4664/').replace(/\/?$/, '/');
const SHOTS = process.argv[3] || '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const IGNORE = /WebGL|GPU stall|AudioContext|favicon/i;
let fails = 0; const errors = [];
const ok = (c, msg) => { if (!c) { fails++; console.log('FAIL', msg); } else console.log('ok  ', msg); };
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist'] });
const SET = JSON.stringify({ gfxTier: 'high', gfx: 'high', sound: false, music: false });

async function newPage(w, h, mobile = false, store = null) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${w}x${h} pageerror ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !IGNORE.test(m.text())) errors.push(`${w}x${h} console ${m.text()}`); });
  await page.addInitScript(([s, st]) => { localStorage.setItem('apexdynasty_settings', s); if (!sessionStorage.getItem('bs-init')) { localStorage.removeItem('sala_bastione_v1'); if (st) localStorage.setItem('sala_bastione_v1', st); sessionStorage.setItem('bs-init', '1'); } }, [SET, store ? JSON.stringify(store) : null]);
  return page;
}
const shot = async (page, name) => { if (!SHOTS) return; for (let i = 0; i < 3; i++) { try { await page.screenshot({ path: `${SHOTS}/${name}.png`, timeout: 60000 }); return; } catch (e) { await page.waitForTimeout(1500); if (i === 2) console.log('screenshot skipped', name, e.message.split('\n')[0]); } } };
const waitGame = (page) => page.waitForFunction(() => window.__bastione?.game?.sim && window.__bastione.game.cam, null, { timeout: 90000 });
// step to the end with the autopilot
async function playOut(page, maxS = 1500) {
  await page.evaluate(() => window.__bastione.autoplay(true));
  let st;
  for (let k = 0; k < 60; k++) { st = await page.evaluate((n) => { let r; for (let i = 0; i < n; i++) { r = window.__bastione.step(1 / 30); if (r.state === 'won' || r.state === 'lost') break; } return r; }, 30 * 25); if (st.state === 'won' || st.state === 'lost' || st.t > maxS) break; }
  await page.waitForSelector('.bs-res', { timeout: 20000 });
  return { st, r: await page.evaluate(() => window.__bastione.result) };
}

// ── 1. desktop: menu, build through the UI, level 1 to the end, store, tree purchase, modes
{
  const page = await newPage(1440, 900);
  await page.goto(BASE + '?game=bastione'); await page.waitForSelector('.bs-menu'); await page.waitForTimeout(900);
  ok((await page.locator('.bs-hero-card h2').textContent()) === 'Il ponte del mulino', 'menu shows level 1');
  ok(await page.locator('.bs-node').count() === 24, '24 level nodes on the map');
  await shot(page, '1440x900-menu');
  for (const t of ['modalita', 'potenziamenti', 'eroi', 'guida', 'opzioni']) { await page.click(`[data-a=bs-tab][data-id=${t}]`); await page.waitForTimeout(700); if (t === 'eroi' || t === 'modalita') await shot(page, `1440x900-tab-${t}`); }
  await page.click('[data-a=bs-tab][data-id=campagna]');
  await page.click('.bs-hero-card .btn.primary');
  await waitGame(page);
  await page.waitForTimeout(1200);
  // open the build menu on the first spot by clicking it on screen
  const pt = await page.evaluate(() => { const g = window.__bastione.game, s = g.sim.slots[0]; return g.toScreen(s.x, 0.2, s.z); });
  await page.mouse.click(pt.x, pt.y); await page.waitForTimeout(300);
  ok(await page.locator('#bs-pop.on .bs-tw').count() === 9, 'tapping a build spot opens the menu with 9 towers');
  await shot(page, '1440x900-build');
  await page.click('#bs-pop [data-t=balestra]'); await page.waitForTimeout(200);
  let info = await page.evaluate(() => ({ t: window.__bastione.game.sim.towers.map((t) => t.def.id), gold: window.__bastione.game.sim.gold }));
  ok(info.t[0] === 'balestra', `built a crossbow through the UI (gold left ${info.gold})`);
  await page.mouse.click(pt.x, pt.y); await page.waitForTimeout(300);
  ok(await page.locator('#bs-pop [data-g=up]').count() === 1, 'tapping the tower opens the upgrade menu');
  await page.click('#bs-pop [data-g=up]'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => window.__bastione.game.sim.towers[0].tier) === 1, 'upgraded to tier 2');
  await page.keyboard.press('Escape');
  // keyboard: Tab to a spot, 8 builds a barracks
  await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Digit8'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => window.__bastione.game.sim.towers.some((t) => t.def.id === 'caserma')), 'keyboard: Tab + 8 builds a barracks');
  await page.keyboard.press('KeyN'); await page.waitForTimeout(100);
  ok(await page.evaluate(() => window.__bastione.game.sim.state) === 'play', 'N starts the first wave');
  await page.evaluate(() => window.__bastione.step(1 / 30, 30 * 25));
  await page.waitForTimeout(1500);
  await shot(page, '1440x900-play');
  await page.keyboard.press('KeyF'); ok((await page.locator('#bs-speed').textContent()) === 'x2', 'F switches to x2');
  await page.keyboard.press('Space'); await page.waitForTimeout(150); ok(await page.locator('#bs-paused.on').count() === 1, 'Space pauses (plan mode)');
  await page.keyboard.press('Space');
  await page.keyboard.press('Escape'); await page.waitForTimeout(200); ok(await page.locator('#bs-modal.on').count() === 1, 'Esc opens the pause menu');
  await shot(page, '1440x900-pause');
  await page.click('#bs-modal [data-g=resume]');
  const { r } = await playOut(page);
  ok(r.win && r.stars >= 1, `level 1 won with the autopilot: ★${r.stars}, lives ${r.lives}, kills ${r.kills}`);
  await page.waitForTimeout(800);
  await shot(page, '1440x900-results');
  const st = await page.evaluate(() => window.__bastione.store());
  ok(st.stars[1] === r.stars && st.coins > 0 && st.gems === r.stars, `store: ★${st.stars[1]}, ${st.coins} coins, ${st.gems} gems`);
  await page.click('[data-a=bs-back]'); await page.waitForSelector('.bs-menu');
  ok((await page.locator('.bs-hero-card h2').textContent()) === 'Campi di grano', 'level 2 is next');
  await page.click('[data-a=bs-tab][data-id=potenziamenti]');
  await page.click('[data-a=bs-tree][data-id=frecce]');
  ok((await page.evaluate(() => window.__bastione.store().tree.frecce)) === 1, 'bought a tree node');
  // endless + daily start and run a bit
  await page.click('[data-a=bs-tab][data-id=modalita]');
  await page.click('[data-a=bs-endless]'); await waitGame(page);
  const e1 = await page.evaluate(() => { window.__bastione.autoplay(true); return window.__bastione.step(1 / 30, 30 * 120); });
  ok(e1.state === 'play' && e1.wave >= 2, `endless runs (wave ${e1.wave}, ${e1.enemies} enemies)`);
  await page.keyboard.press('Escape'); await page.click('#bs-modal [data-g=quit]'); await page.waitForSelector('.bs-menu');
  await page.click('[data-a=bs-daily]'); await waitGame(page);
  const d1 = await page.evaluate(() => { window.__bastione.autoplay(true); return window.__bastione.step(1 / 30, 30 * 60); });
  ok(d1.state === 'play', `daily challenge runs (wave ${d1.wave})`);
  await page.close();
}
// ── 2. a later world with a boss, hero and spells (unlocked save), plus the four viewports in game
const late = { tree: { frecce: 3, mirino: 2, polvere: 3, schegge: 2, arcano: 3, brina: 2, reclute: 3, tesoro: 2, fuoco: 2, milizia: 2 }, hlv: { mago: 5, capitano: 5 }, stars: Object.fromEntries(Array.from({ length: 23 }, (_, i) => [i + 1, 3])), coins: 5000, gems: 80, heroes: ['capitano', 'arciera', 'mago', 'orso'], hero: 'mago', spells: ['meteore', 'rinforzi', 'glaciazione'], seen: { fante: 1, lesto: 1, scudato: 1, bruto: 1, volante: 1, gemello: 1, mini: 1, sciamano: 1 } };
for (const [w, h, mobile, lvl] of [[1440, 900, false, 18], [1024, 768, true, 12], [390, 844, true, 24], [844, 390, true, 15]]) {
  const page = await newPage(w, h, mobile, late);
  await page.goto(BASE + `?game=bastione`); await page.waitForSelector('.bs-menu'); await page.waitForTimeout(900);
  await shot(page, `${w}x${h}-menu`);
  await page.evaluate((id) => window.__bastione.play(id), lvl); await waitGame(page);
  await page.waitForTimeout(1000);
  await page.evaluate(() => { window.__bastione.autoplay(true); window.__bastione.step(1 / 30, 30 * 140); });
  // cast a spell and use the hero through the HUD
  const used = await page.evaluate(() => { const g = window.__bastione.game, S = g.sim; const e = S.enemies.find((x) => x.hp > 0); if (!e) return 'no enemy'; g.armSpell(0); g.tap(e.x, e.z); return S.spells[0].cd > 0 ? 'cast' : 'not cast'; });
  ok(used === 'cast' || used === 'no enemy', `${w}x${h} level ${lvl}: meteor spell via the HUD (${used})`);
  await page.waitForTimeout(1500);
  await shot(page, `${w}x${h}-play`);
  // open the build menu on a free spot
  await page.evaluate(() => { const g = window.__bastione.game, s = g.sim.slots.find((q) => !q.tower) || g.sim.slots[0]; g.openSlot(s.i); });
  await page.waitForTimeout(500);
  await shot(page, `${w}x${h}-menu-open`);
  const over = await page.evaluate(() => { const p = document.getElementById('bs-pop').getBoundingClientRect(); return p.right <= innerWidth + 1 && p.bottom <= innerHeight + 1 && p.left >= -1 && p.top >= -1; });
  ok(over, `${w}x${h}: the build menu fits on screen`);
  const scroll = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
  ok(scroll, `${w}x${h}: no horizontal overflow`);
  await page.evaluate(() => window.__bastione.game.deselect());
  const { r } = await playOut(page, 2400);
  ok(r.win || r.wave >= 4, `${w}x${h} level ${lvl}: ${r.win ? `won ★${r.stars}` : `lost at wave ${r.wave}`} (lives ${r.lives})`);
  await page.waitForTimeout(600);
  await shot(page, `${w}x${h}-results`);
  await page.close();
}
ok(errors.length === 0, `no console errors${errors.length ? ':\n  ' + errors.slice(0, 12).join('\n  ') : ''}`);
await browser.close();
console.log(fails ? `${fails} FAILED` : 'ALL OK');
process.exit(fails ? 1 : 0);
