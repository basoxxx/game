// Browser smoke test: walks the main flows of the built game and reports runtime errors and mobile overflow.
//   npx vite build && npx vite preview --port 4173   then   node tools/smoke.mjs [baseUrl]   (needs playwright + chromium)
// Collects pageerror, console.error, unhandled rejections and the app's own crash dialog ("Bandiera rossa").
// Exit code 1 when anything was caught.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
// playwright is not a dependency of the game: take it from node_modules or from the global install
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const { chromium } = pw;

const BASE = (process.argv[2] || process.env.SMOKE_URL || 'http://127.0.0.1:4173/').replace(/\/?$/, '/');
const URL = BASE + '?nointro';
// SMOKE_ONLY=desktop,saves,deep,mobile picks phases (deep is the slow one: ~10 min); SMOKE_CATS=formula,rally limits deep
const PHASES = new Set((process.env.SMOKE_ONLY || 'desktop,saves,deep,mobile').split(','));
const SIDEBAR = ['hub', 'inbox', 'car', 'drivers', 'market', 'staff', 'finance', 'paddock', 'standings', 'calendar', 'career', 'halloffame'];
const MOBILE = ['menu', 'hub', 'inbox', 'car', 'drivers', 'market', 'staff', 'finance', 'paddock', 'standings', 'calendar', 'career', 'halloffame', 'settings', 'howto', 'quickrace', 'challenges', 'mode-champ', 'mode-tp', 'mode-daily', 'derby', 'newgame', 'weekend'];
const TAB_SEL = '[data-a="tab"], [data-a="ctab"], [data-a="ptab"], [data-a="set-tab"], [data-a="ss-tab"], [data-a="dz-tab"], [data-a="an-tab"], [data-a="tele-tab"]';
// noise that is not a game bug in a headless browser
const IGNORE = /WebGL|GPU stall|THREE\.WebGLRenderer|AudioContext|Failed to load resource.*favicon/i;

const issues = [];
const visited = new Set();
let where = 'boot';
const note = (kind, text) => { text = String(text).slice(0, 600); if (IGNORE.test(text)) return; if (!issues.some((i) => i.kind === kind && i.text === text && i.where === where)) issues.push({ kind, where, text }); };

function hook(page, tag) {
  page.on('pageerror', (e) => note(`${tag}:pageerror`, e.stack || e.message));
  page.on('requestfailed', (r) => note(`${tag}:requestfailed`, `${r.url()} ${r.failure()?.errorText || ''}`));
  page.on('console', (m) => {
    if (m.type() === 'error') note(`${tag}:console.error`, m.text());
    if (m.type() === 'warning' && /errore intercettato/.test(m.text())) note(`${tag}:crash`, m.text());
  });
}
async function checkCrash(page, tag) {
  const cur = await page.evaluate(() => window.__apex?.App?.cur).catch(() => null); if (cur) visited.add(`${tag}:${cur}`);
  const txt = await page.evaluate(() => { const c = document.querySelector('.crash'); return c ? (c.querySelector('pre')?.textContent || c.textContent) : null; });
  if (txt) {
    note(`${tag}:crash-dialog`, txt.trim());
    await page.evaluate(() => document.querySelector('[data-a="crash-retry"]') && window.__apex.App.closeModal());
    await page.evaluate(() => { window.__apex.App.crashed = false; });
  }
}
async function settle(page, ms = 450) { await page.waitForTimeout(ms); }
async function go(page, id, params) {
  where = id;
  await page.evaluate(([i, p]) => window.__apex.App.go(i, p || {}), [id, params]);
  await page.waitForFunction((i) => window.__apex.App.cur === i, id, { timeout: 15000 }).catch(() => note('nav', `non raggiunta: ${id}`));
  await settle(page);
}
async function closeOverlays(page) {
  await page.evaluate(() => {
    document.querySelector('.tour-mask')?.remove(); document.querySelector('.coach')?.remove();
    if (document.querySelector('.modal-wrap') && !document.querySelector('.crash')) window.__apex.App.closeModal();
  });
}
async function clickAll(page, sel, tag) {
  const n = await page.locator(sel).count();
  for (let i = 0; i < Math.min(n, 12); i++) {
    const el = page.locator(sel).nth(i);
    if (!(await el.isVisible().catch(() => false))) continue;
    await el.click({ timeout: 3000 }).catch(() => {});
    await settle(page, 250); await checkCrash(page, tag); await closeOverlays(page);
  }
}

async function desktop(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage(); hook(page, 'desktop');
  await page.addInitScript(() => window.addEventListener('unhandledrejection', (e) => console.error('unhandledrejection: ' + (e.reason?.stack || e.reason))));
  await page.goto(URL); await page.waitForFunction(() => window.__apex?.App?.cur === 'menu', null, { timeout: 20000 });
  await settle(page, 800); await checkCrash(page, 'desktop');

  // new career through the real buttons, defaults everywhere
  where = 'newgame';
  await page.click('[data-a="nav"][data-to="newgame"]');
  await page.waitForFunction(() => window.__apex.App.cur === 'newgame', null, { timeout: 15000 });
  await settle(page);
  await page.click('[data-a="next"]'); await settle(page);
  await page.locator('[data-a="pick-team"]').first().click(); await settle(page);
  await page.click('[data-a="next"]'); await settle(page);
  await page.click('[data-a="start"]');
  await page.waitForFunction(() => window.__apex.App.cur === 'hub', null, { timeout: 20000 }).catch(() => note('nav', 'carriera non avviata'));
  await settle(page, 1200); await checkCrash(page, 'desktop'); await closeOverlays(page);

  for (const id of SIDEBAR) {
    where = id;
    const link = page.locator(`.sidebar [data-a="nav"][data-to="${id}"], nav [data-a="nav"][data-to="${id}"]`).first();
    if (await link.count()) await link.click().catch(() => {}); else await go(page, id);
    await page.waitForFunction((i) => window.__apex.App.cur === i, id, { timeout: 15000 }).catch(() => note('nav', `non raggiunta: ${id}`));
    await settle(page); await checkCrash(page, 'desktop'); await closeOverlays(page);
    await clickAll(page, TAB_SEL, 'desktop');
  }
  for (const id of ['settings', 'howto']) { await go(page, id, { back: 'hub' }); await checkCrash(page, 'desktop'); await clickAll(page, TAB_SEL, 'desktop'); }
  for (const id of ['quickrace', 'challenges', 'mode-champ', 'mode-daily', 'mode-tp', 'derby']) { await go(page, id); await settle(page, 600); await checkCrash(page, 'desktop'); await closeOverlays(page); await clickAll(page, TAB_SEL, 'desktop'); }
  await go(page, 'menu'); await checkCrash(page, 'desktop');
  await ctx.close();
}

// every category: career with defaults, a couple of AI rounds (devtools.simRound), results, the pre-race screen,
// the management screens again with data in them, then the rest of the season and the season end
async function newCareer(page, cat) {
  where = `newgame:${cat}`;
  await go(page, 'newgame');
  for (let i = 0; i < 3 && await page.locator('[data-a="back"]').count() && await page.locator('[data-a="pick-cat"]').count() === 0; i++) { await page.click('[data-a="back"]'); await settle(page, 200); }
  await page.click(`[data-a="pick-cat"][data-id="${cat}"]`); await settle(page, 200);
  await page.click('[data-a="next"]'); await settle(page);
  await page.locator('[data-a="pick-team"]').nth(2).click(); await page.click('[data-a="next"]'); await settle(page);
  await page.click('[data-a="start"]');
  await page.waitForFunction(() => window.__apex.App.cur === 'hub', null, { timeout: 20000 }).catch(() => note('nav', `carriera ${cat} non avviata`));
  await settle(page, 800); await checkCrash(page, cat); await closeOverlays(page);
}
// play one weekend through the UI by pressing whatever moves it on, until the results screen
const ADVANCE = ['yes', 'ss-simq', 'ss-next', 'ss-simulate', 'to-quali', 'to-race', 'finish-race', 'sim-end',
  'start-rally', 'go-stage', 'sim-rest', 'stage-done', 'end-service', 'next', 'finish-rally', 'skip-stage', 'run'];
async function playWeekend(page, tag) {
  const scr = await page.evaluate(() => (window.__apex.S().category === 'rally' ? 'rally' : 'weekend'));
  await go(page, scr); await settle(page, 900); await closeOverlays(page);
  let last = '';
  for (let i = 0; i < 80; i++) {
    where = `${tag}:${scr}#${i}`;
    await checkCrash(page, tag);
    const cur = await page.evaluate(() => window.__apex.App.cur);
    if (cur === 'results' || cur === 'hub' || cur === 'seasonend') return cur;
    await page.evaluate(() => { document.querySelector('.tour-mask')?.remove(); document.querySelector('.coach')?.remove(); });
    // a decision card waiting: take the first answer
    await page.evaluate(() => document.querySelector('[data-a="dec"]')?.click());
    const a = await page.evaluate((list) => { for (const a of list) { const b = [...document.querySelectorAll(`[data-a="${a}"]`)].find((x) => x.offsetParent && !x.disabled); if (b) { b.click(); return a; } } return null; }, ADVANCE);
    if (!a) { await page.evaluate(() => document.querySelector('.speed [data-v], [data-a="speed"][data-v="32"], [data-a="speed"]:last-of-type')?.click()); }
    last = a || last;
    await settle(page, a === 'sim-end' || a === 'sim-rest' || a === 'ss-simq' || a === 'ss-simulate' ? 1500 : 500);
  }
  note('flow', `${tag}: weekend non concluso, ultima azione ${last}`);
  return null;
}
async function deep(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage(); hook(page, 'deep');
  await page.addInitScript(() => window.addEventListener('unhandledrejection', (e) => console.error('unhandledrejection: ' + (e.reason?.stack || e.reason))));
  await page.goto(URL); await page.waitForFunction(() => window.__apex?.App?.cur === 'menu', null, { timeout: 20000 });
  await page.waitForFunction(() => window.__apex.ready, null, { timeout: 30000 }).catch(() => note('runner', 'devtools non installati'));
  for (const cat of (process.env.SMOKE_CATS || 'formula,junior,rally,endurance').split(',')) {
    await newCareer(page, cat);
    // the pre-race weekend screen (no live race)
    await go(page, cat === 'rally' ? 'rally' : 'weekend'); await settle(page, 900); await checkCrash(page, `deep-${cat}`); await closeOverlays(page);
    await go(page, 'hub');
    where = `${cat}:simRound`;
    const ok = await page.evaluate(() => { try { window.__apex.simRound(); window.__apex.simRound(); return true; } catch (e) { console.error('simRound: ' + (e.stack || e)); return false; } });
    if (ok) { await go(page, 'results', { idx: 1 }); await checkCrash(page, `deep-${cat}`); }
    if (cat === 'formula' || cat === 'rally') { const end = await playWeekend(page, `play-${cat}`); if (end === 'results') await clickAll(page, '[data-a="done"]', `play-${cat}`); }
    for (const id of SIDEBAR) { await go(page, id); await checkCrash(page, `deep-${cat}`); await closeOverlays(page); await clickAll(page, TAB_SEL, `deep-${cat}`); }
    where = `${cat}:season`;
    await page.evaluate(() => { try { let g = 0; while (window.__apex.simRound() && g++ < 40); } catch (e) { console.error('simRound: ' + (e.stack || e)); } });
    await go(page, 'hub'); await checkCrash(page, `deep-${cat}`); await closeOverlays(page);
    await go(page, 'seasonend'); await settle(page, 800); await checkCrash(page, `deep-${cat}`); await closeOverlays(page);
    await clickAll(page, TAB_SEL, `deep-${cat}`);
    // next season with the same team
    where = `${cat}:newSeason`;
    const stay = page.locator('[data-a="stay"]');
    if (await stay.count()) {
      await stay.first().click(); await settle(page, 1000); await checkCrash(page, `deep-${cat}`); await closeOverlays(page);
      for (const id of ['hub', 'inbox', 'car', 'drivers', 'market', 'finance', 'standings', 'calendar', 'career', 'halloffame']) { await go(page, id); await checkCrash(page, `s2-${cat}`); await closeOverlays(page); }
      await page.evaluate(() => { try { window.__apex.simRound(); } catch (e) { console.error('simRound s2: ' + (e.stack || e)); } });
      await go(page, 'hub'); await checkCrash(page, `s2-${cat}`);
    }
  }
  await ctx.close();
}

async function mobile(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage(); hook(page, 'mobile');
  await page.goto(URL); await page.waitForFunction(() => window.__apex?.App?.cur === 'menu', null, { timeout: 20000 });
  await settle(page, 800);
  // quick career straight through the engine so the management screens have a state
  where = 'mobile-newgame';
  await go(page, 'newgame'); await page.click('[data-a="next"]'); await settle(page);
  await page.locator('[data-a="pick-team"]').first().click(); await page.click('[data-a="next"]'); await settle(page);
  await page.click('[data-a="start"]'); await page.waitForFunction(() => window.__apex.App.cur === 'hub', null, { timeout: 20000 }).catch(() => {});
  await settle(page, 1000); await closeOverlays(page);
  const over = [];
  for (const id of MOBILE) {
    await go(page, id, id === 'settings' ? { back: 'hub' } : undefined); await closeOverlays(page); await settle(page, 300);
    await checkCrash(page, 'mobile');
    const r = await page.evaluate(() => {
      const iw = window.innerWidth, sw = document.documentElement.scrollWidth;
      // the widest offenders, to point at the culprit
      const wide = sw > iw ? [...document.querySelectorAll('body *')].filter((e) => { const b = e.getBoundingClientRect(); return b.right > iw + 1 && b.width > 0 && getComputedStyle(e).position !== 'fixed'; })
        .filter((e) => !e.parentElement || e.parentElement.getBoundingClientRect().right <= iw + 1).slice(0, 4).map((e) => `${e.tagName.toLowerCase()}.${[...e.classList].join('.')} → ${Math.round(e.getBoundingClientRect().right)}px`) : [];
      return { iw, sw, wide };
    });
    if (r.sw > r.iw) over.push(`${id}: scrollWidth ${r.sw} > ${r.iw}  [${r.wide.join(', ')}]`);
  }
  await ctx.close();
  return over;
}

// damaged saves: valid JSON that is not a career, and a truncated file, next to a good one
async function saves(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage(); hook(page, 'saves');
  await page.goto(URL); await page.waitForFunction(() => window.__apex?.App?.cur === 'menu', null, { timeout: 20000 });
  await newCareer(page, 'formula');
  await page.evaluate(() => { localStorage.setItem('apexdynasty_save_4', '{"season":2025,"round":3}'); localStorage.setItem('apexdynasty_save_5', '{"teams":'); });
  await page.reload(); await page.waitForFunction(() => window.__apex?.App?.cur === 'menu', null, { timeout: 20000 }); await settle(page, 600);
  where = 'saves:load';
  for (const slot of ['4', '5']) {
    await page.click('[data-a="load"]'); await settle(page);
    const btn = page.locator(`.modal-wrap [data-a="load-slot"][data-slot="${slot}"]`);
    if (await btn.count()) { await btn.click(); await settle(page, 800); }
    await checkCrash(page, 'saves'); await closeOverlays(page);
    await go(page, 'menu'); await checkCrash(page, 'saves');
  }
  where = 'saves:continue';
  await page.click('[data-a="continue-last"]'); await page.waitForFunction(() => window.__apex.App.cur === 'hub', null, { timeout: 15000 }).catch(() => note('nav', 'continua: hub non raggiunto'));
  await settle(page); await checkCrash(page, 'saves');
  await ctx.close();
}

const browser = await chromium.launch();
let over = [];
try {
  if (PHASES.has('desktop')) await desktop(browser);
  if (PHASES.has('saves')) await saves(browser);
  if (PHASES.has('deep')) await deep(browser);
  if (PHASES.has('mobile')) over = await mobile(browser);
} catch (e) { note('runner', e.stack || e.message); }
await browser.close();

console.log(`\n== Apex smoke @ ${URL}`);
console.log(`Schermate visitate (${visited.size}): ${[...visited].join(' ')}`);
if (!issues.length) console.log('Errori runtime: nessuno');
else { console.log(`Errori runtime: ${issues.length}`); for (const i of issues) console.log(`- [${i.kind}] @${i.where}\n    ${i.text.replace(/\n/g, '\n    ')}`); }
if (!over.length) console.log('Overflow 390px: nessuno');
else { console.log(`Overflow 390px: ${over.length}`); for (const o of over) console.log(`- ${o}`); }
process.exit(issues.length || over.length ? 1 : 0);
