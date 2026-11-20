// Solitari (Carte Baso) browser test: wins a deal of Klondike (draw 1 and 3), FreeCell, Spider (1 suit)
// and Piramide THROUGH THE UI at desktop / tablet / phone portrait / phone landscape. Each move is the
// solver's hint, played the way a person would: a tap on the card when the game's tap-to-auto-move
// picks the same destination, otherwise a drag-and-drop; draws/recycles tap the stock. Also checks
// undo, the hint highlight, the HUD, layout overflow and console errors, and takes screenshots.
//   npx vite build && npx vite preview --port 4685 --strictPort
//   node tools/carte-solitari-e2e.mjs [baseUrl] [outDir]      (ONLY=desktop,phone-portrait to filter)
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const BASE = (process.argv[2] || 'http://127.0.0.1:4685/').replace(/\/?$/, '/');
const OUT = process.argv[3] || 'carte-solitari-shots';
mkdirSync(OUT, { recursive: true });
const IGNORE = /AudioContext|favicon|GPU stall/i;
const issues = [];
const CASES = [
  { name: 'desktop', vp: [1440, 900] },
  { name: 'tablet', vp: [1024, 768], touch: true },
  { name: 'phone-portrait', vp: [390, 844], touch: true, mobile: true },
  { name: 'phone-landscape', vp: [844, 390], touch: true, mobile: true },
];
const GAMES = [
  { id: 'klondike', lobby: (i) => ({ variant: i % 2 ? 'tre' : 'uno', options: { partita: 'vincibile' } }) },
  { id: 'freecell', lobby: () => ({ options: { partita: 'casuale', numeri: 'baso' } }) },
  { id: 'piramide', lobby: () => ({ options: { partita: 'vincibile', giri: 3 } }) },
  { id: 'spider', lobby: () => ({ variant: 'uno', options: { partita: 'casuale' } }), deal: 1 },
];
const only = process.env.ONLY;
const browser = await pw.chromium.launch();

async function idle(page, before) {
  for (let k = 0; k < 200; k++) {
    const st = await page.evaluate((b) => { const w = window.__carte; return { done: !!document.querySelector('.cb-result'), ready: w && !w.V.busy && w.M.moves !== b && (document.querySelectorAll('.ct-card.ok').length > 0 || w.legal().length > 0) }; }, before);
    if (st.done || st.ready) return st;
    await page.waitForTimeout(25);
  }
  return { stuck: true };
}
async function playGame(page, C, G, gi) {
  const tag = `${C.name}-${G.id}`;
  if (page.url() === 'about:blank') await page.goto(BASE + '?game=carte');
  await page.evaluate(([id, L]) => { const p = JSON.parse(localStorage.getItem('baso_carte_v1') || '{}'); p.lobby = { ...(p.lobby || {}), [id]: L }; localStorage.setItem('baso_carte_v1', JSON.stringify(p)); }, [G.id, G.lobby(gi)]);
  await page.goto(BASE + '?game=carte');
  await page.waitForSelector('.cb-games', { timeout: 30000 });
  await page.click(`[data-a=cb-open][data-id=${G.id}]`);
  await page.waitForSelector('[data-a=cb-start]');
  if (gi === 0 || C.name === 'phone-portrait') await page.screenshot({ path: `${OUT}/${tag}-lobby.png` });
  await page.click('[data-a=cb-start]');
  await page.waitForSelector('#cb-play.sol .ct-card', { timeout: 15000 });
  await page.waitForTimeout(300);
  if (G.deal) { await page.evaluate((no) => window.__solitari.deal(no), G.deal); await page.waitForTimeout(200); }
  await page.screenshot({ path: `${OUT}/${tag}-start.png` });
  const ov = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  if (ov > 2) issues.push(`${tag}: overflow ${ov}px`);
  // every card inside the table
  const off = await page.evaluate(() => { const b = document.getElementById('cb-table').getBoundingClientRect(); return [...document.querySelectorAll('.ct-card')].filter((c) => { const r = c.getBoundingClientRect(); return r.right > b.right + 2 || r.left < b.left - 2 || r.top < b.top - 2; }).length; });
  if (off) issues.push(`${tag}: ${off} cards outside the table`);
  const kinds = { tap: 0, drag: 0, stock: 0, undo: 0 };
  const t0 = Date.now();
  let won = false;
  for (let step = 0; step < 900; step++) {
    if (Date.now() - t0 > 240000) { issues.push(`${tag}: timeout`); break; }
    if (await page.$('.cb-result')) { won = true; break; }
    // wait until no card is flying (CSS transitions), so the rects we click are the final ones
    await page.evaluate(async () => { const snap = () => [...document.querySelectorAll('.ct-card')].map((c) => { const b = c.getBoundingClientRect(); return `${b.left | 0},${b.top | 0}`; }).join(';'); let a = snap(); for (let k = 0; k < 40; k++) { await new Promise((r) => setTimeout(r, 60)); const b = snap(); if (a === b) break; a = b; } });
    const info = await page.evaluate(() => {
      const h = window.__solitari.hint(); if (!h) return null;
      const m = h.move, T = window.__carte.table, rect = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; };
      const tap = m.card ? window.__solitari.tapPick(m.card) : null;
      const same = tap && tap.to === m.to && tap.act === m.act;
      let to = null;
      if (m.to) { const pv = T.view.piles.find((p) => p.id === m.to); const last = pv?.cards?.[pv.cards.length - 1]; const id = last && (typeof last === 'string' ? last : last.id); to = rect(id && id !== m.card ? T.els.get(id) : T.pileEls.get(m.to)); }
      return { m, solved: h.solved, same, card: rect(m.card && T.els.get(m.card)), to, stock: rect(T.pileEls.get('stock')), moves: window.__carte.M.moves };
    });
    if (!info) { // finished by the automatic completion?
      if (await page.waitForSelector('.cb-result', { timeout: 4000 }).catch(() => null)) { won = true; break; }
      issues.push(`${tag}: no hint at step ${step}`); break;
    }
    if (step === 3) { // show the hint highlight once
      await page.evaluate(() => document.querySelector('[data-sol=hint]').click());
      const lit = await page.waitForSelector('.sol-hint, .sol-hint-to', { timeout: 4000 }).catch(() => null);
      await page.screenshot({ path: `${OUT}/${tag}-hint.png` });
      if (!lit) issues.push(`${tag}: hint not highlighted`);
    }
    const { m } = info;
    const grab = (r) => [r.x + r.w / 2, r.y + Math.min(r.h * 0.12, 12)];
    if (!m.card && m.act) { // recycle: tap the empty stock
      await page.mouse.click(info.stock.x + info.stock.w / 2, info.stock.y + info.stock.h / 2); kinds.stock++;
    } else if (m.act || info.same) {
      const [x, y] = grab(info.card); await page.mouse.click(x, y); m.act ? kinds.stock++ : kinds.tap++;
    } else {
      const [x, y] = grab(info.card), tx = info.to.x + info.to.w / 2, ty = info.to.y + info.to.h / 2;
      await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 12, y + 12, { steps: 2 }); await page.mouse.move(tx, ty, { steps: 5 }); await page.mouse.up(); kinds.drag++;
    }
    const st = await idle(page, info.moves);
    if (st.stuck) {
      const after = await page.evaluate(() => window.__carte.M.moves);
      if (after === info.moves) {
        const dbg = await page.evaluate(([c, t]) => { const T = window.__carte.table; return { at: t && T.pileAt(t.x + t.w / 2, t.y + t.h / 2), hitCard: c && document.elementFromPoint(c.x + c.w / 2, c.y + Math.min(c.h * 0.12, 12))?.closest('.ct-card')?.dataset.card, busy: window.__carte.V.busy }; }, [info.card, info.to]);
        issues.push(`${tag}: move ${JSON.stringify(m)} not played (step ${step}) ${JSON.stringify(dbg)}`); break;
      }
    }
    if (step === 6 && !kinds.undo) { // undo once with the toolbar button, then go on from there
      const before = await page.evaluate(() => window.__carte.M.state.log.length);
      await page.click('[data-sol=undo]'); await idle(page, -1); kinds.undo++;
      const after = await page.evaluate(() => window.__carte.M.state.log.length);
      if (after !== before - 1) issues.push(`${tag}: undo ${before} -> ${after}`);
    }
    if (step === 25) await page.screenshot({ path: `${OUT}/${tag}-mid.png` });
  }
  if (!won) { issues.push(`${tag}: not won`); await page.screenshot({ path: `${OUT}/${tag}-fail.png` }); return; }
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${tag}-win.png` });
  const title = await page.textContent('.cb-result h2');
  if (!/vinto/i.test(title)) issues.push(`${tag}: result "${title}"`);
  const st = await page.evaluate((id) => JSON.parse(localStorage.getItem('baso_carte_solitari_v1') || '{}'), G.id);
  const row = Object.entries(st).find(([k]) => k.startsWith(`${G.id}|`));
  if (!row || !row[1].won) issues.push(`${tag}: stats not recorded`);
  console.log(`  ${tag}: won in ${((Date.now() - t0) / 1000).toFixed(1)} s · ${JSON.stringify(kinds)}`);
}

for (const C of CASES) {
  if (only && !only.split(',').includes(C.name)) continue;
  const ctx = await browser.newContext({ viewport: { width: C.vp[0], height: C.vp[1] }, hasTouch: !!C.touch, isMobile: !!C.mobile, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => issues.push(`${C.name} pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !IGNORE.test(m.text())) issues.push(`${C.name} console: ${m.text()}`); });
  await page.addInitScript(() => { localStorage.setItem('apexdynasty_settings', JSON.stringify({ sound: false, music: false })); window.__carteFast = true; });
  for (const [gi, G] of GAMES.entries()) {
    try { await playGame(page, C, G, CASES.indexOf(C) + gi); } catch (e) { issues.push(`${C.name}-${G.id}: ${e.message.split('\n')[0]}`); await page.screenshot({ path: `${OUT}/${C.name}-${G.id}-error.png` }).catch(() => {}); }
  }
  await ctx.close();
}
await browser.close();
if (issues.length) { console.log(`PROBLEMI (${issues.length}):\n - ${issues.join('\n - ')}`); process.exit(1); }
console.log('carte-solitari e2e: tutto ok');
