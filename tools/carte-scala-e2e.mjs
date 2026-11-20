// Carte Baso — browser test of the rummy plug-ins: plays a whole ROUND of Scala 40 (and of Burraco with
// GAMES=burraco, see tools/carte-burraco-e2e.mjs) through the UI at desktop / tablet / phone portrait /
// phone landscape: taps on the stock, tap-card-then-pile, drag-and-drop to the tray / melds / discards,
// the "Cala" and suggestion buttons. The human's moves are chosen by the game's own AI, then performed
// with real pointer events. Screenshots of the lobby, the table, the tray, the round summary.
//   npx vite build && npx vite preview --port 4686 --strictPort
//   node tools/carte-scala-e2e.mjs [baseUrl] [outDir]       (ONLY=desktop,phone-portrait  GAMES=scala40,burraco)
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const BASE = (process.argv[2] || 'http://127.0.0.1:4686/').replace(/\/?$/, '/');
const OUT = process.argv[3] || 'carte-ramino-shots';
const GAMES = (process.env.GAMES || 'scala40').split(',');
mkdirSync(OUT, { recursive: true });
const IGNORE = /AudioContext|favicon|GPU stall/i;
const issues = [];
const CASES = [
  { name: 'desktop', vp: [1440, 900], scala40: { n: 3 }, burraco: { variant: 'coppie', n: 4 } },
  { name: 'tablet', vp: [1024, 768], touch: true, scala40: { n: 4 }, burraco: { variant: 'due', n: 2 } },
  { name: 'phone-portrait', vp: [390, 844], touch: true, mobile: true, scala40: { n: 2 }, burraco: { variant: 'due', n: 2 } },
  { name: 'phone-landscape', vp: [844, 390], touch: true, mobile: true, scala40: { n: 3 }, burraco: { variant: 'coppie', n: 4 } },
];
const only = process.env.ONLY;
const browser = await pw.chromium.launch();

async function point(page, sel) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel); if (!el) return null;
    const r = el.getBoundingClientRect();
    for (let fy = 0.25; fy < 0.95; fy += 0.1) for (let fx = 0.12; fx < 0.95; fx += 0.08) {
      const x = r.left + r.width * fx, y = r.top + r.height * fy;
      if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
      if (document.elementFromPoint(x, y)?.closest(sel.startsWith('.ct-pile') ? '.ct-pile, .ct-card' : '.ct-card') === el || (sel.startsWith('.ct-pile') && document.elementFromPoint(x, y)?.closest('.ct-layer'))) return { x, y };
    }
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, sel);
}
// the centre of a pile's cards (its hit box), for drops and taps on the destination
async function pileCenter(page, id) {
  return page.evaluate((id) => {
    const T = window.__carte.table, el = T.pileEls.get(id); if (!el?._hit) return null;
    const r = T.box.getBoundingClientRect();
    return { x: r.left + el._hit.x, y: r.top + el._hit.y };
  }, id);
}
async function tap(page, C, p) { if (C.touch) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y); }
async function drag(page, a, b) {
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 5 }); await page.mouse.move(b.x, b.y, { steps: 5 }); await page.mouse.up();
}
const ready = (page) => page.waitForFunction(() => {
  const c = window.__carte; if (!c?.M) return false;
  if (document.querySelector('.cb-result, .cb-pass, .cb-choose')) return true;
  return !c.V.busy && c.M.state.turn >= 0 && c.M.cfg.seats[c.M.state.turn]?.kind === 'human' && !document.querySelector('.ct-card.fly') && (document.querySelector('.ct-card.ok') || document.querySelector('.ct-acts .btn'));
}, null, { timeout: 30000 }).then(() => true, () => false);
const moves = (page) => page.evaluate(() => window.__carte.M.moves);
const waitMove = (page, before) => page.waitForFunction((b) => window.__carte.M.moves > b || !!document.querySelector('.cb-result, .cb-choose'), before, { timeout: 20000 }).then(() => true, () => false);

// do one legal move `m` of the human through the UI; `how` alternates the input methods
async function perform(page, C, m, how) {
  // record the move the table actually sends, to check it is the one we meant
  await page.evaluate(() => { const T = window.__carte.table; if (!T._spy) { const f = T.o.onMove; T.o.onMove = (x) => { window.__lastMove = x; f(x); }; T._spy = 1; } window.__lastMove = null; });
  const r = await perform0(page, C, m, how);
  if (!r) return false;
  const got = await page.evaluate(() => window.__lastMove);
  const same = got && got.a === m.a && (m.card == null || got.card === m.card) && (m.to == null || got.to === m.to);
  if (!same) throw new Error(`mossa sbagliata: volevo ${JSON.stringify(m)}, fatto ${JSON.stringify(got)}`);
  return true;
}
async function perform0(page, C, m, how) {
  const before = await moves(page);
  const btn = async (pred) => {
    const i = await page.evaluate((src) => { const f = new Function('m', `return (${src})(m)`); return window.__carte.legal().findIndex((x) => f(x)); }, pred.toString());
    if (i < 0) return false;
    await page.click(`.ct-acts [data-mi="${i}"]`); return true;
  };
  if (!m.card) { // a button
    const ok = await btn(new Function('x', `return !!x.label && !x.card && x.a === ${JSON.stringify(m.a)} && JSON.stringify(x.keys || null) === ${JSON.stringify(JSON.stringify(m.keys || null))}`));
    if (!ok) throw new Error(`pulsante mancante per ${JSON.stringify(m)}`);
    return waitMove(page, before);
  }
  // let the hand settle (cards slide when one leaves it), then aim
  await page.waitForFunction(() => !document.querySelector('.ct-card.fly'), null, { timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(150);
  const cardSel = `.ct-card[data-card="${m.card}"]`;
  const nMoves = await page.evaluate((id) => window.__carte.legal().filter((x) => x.card === id).length, m.card);
  const a = await point(page, cardSel);
  if (!a) throw new Error(`carta ${m.card} non trovata`);
  if (nMoves === 1 || !m.to) { await tap(page, C, a); }
  else {
    const b = await pileCenter(page, m.to);
    if (!b) throw new Error(`pila ${m.to} non trovata`);
    if (how === 'drag' && !C.touch) await drag(page, a, b);
    else {
      await tap(page, C, a); await page.waitForTimeout(80);
      const t = await pileCenter(page, m.to);
      const what = await page.evaluate((t) => { const e = document.elementFromPoint(t.x, t.y); return { cls: e?.className, pile: e?.dataset?.pile, card: e?.closest?.('.ct-card')?.dataset.card, sel: window.__carte.table.sel }; }, t);
      if (what.pile !== m.to && !what.card) console.log(`  nota: sotto il punto di ${m.to} c'è ${JSON.stringify(what)}`);
      await tap(page, C, t);
    }
  }
  // two moves on the same card and pile (attach or swap the joker): pick in the chooser
  if (await page.$('.cb-choose')) {
    const i = await page.evaluate((m) => { const ms = window.__carte.legal().filter((x) => x.card === m.card); return ms.findIndex((x) => x.a === m.a && x.to === m.to); }, m);
    await page.click(`[data-a=cb-pick][data-i="${Math.max(0, i)}"]`);
  }
  return waitMove(page, before);
}

async function playRound(page, C, game) {
  const cfg = C[game];
  await page.evaluate(([g, c]) => { const p = JSON.parse(localStorage.getItem('baso_carte_v1') || '{}'); p.lobby = { ...(p.lobby || {}), [g]: { variant: c.variant, n: c.n, level: 'normale', target: g === 'burraco' ? 1 : 101 } }; localStorage.setItem('baso_carte_v1', JSON.stringify(p)); }, [game, cfg]);
  await page.click(`[data-a=cb-open][data-id=${game}]`);
  await page.waitForSelector('[data-a=cb-start]');
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/${C.name}-${game}-lobby.png` });
  const ov = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  if (ov > 2) issues.push(`${C.name} ${game} lobby overflows by ${ov}px`);
  await page.click('[data-a=cb-start]');
  await page.waitForSelector('.ct-card', { timeout: 10000 });
  const stats = { moves: 0, tap: 0, drag: 0, btn: 0, staged: 0, melds: 0, att: 0, disc: 0, take: 0, sugg: 0 };
  let shots = 0, usedSugg = false, roundNo = 0;
  const t0 = Date.now();
  for (let guard = 0; guard < 1500; guard++) {
    if (Date.now() - t0 > 360000) { issues.push(`${C.name} ${game}: round timeout`); break; }
    if (!(await ready(page))) { issues.push(`${C.name} ${game}: table stuck`); break; }
    if (await page.$('.cb-result')) {
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${OUT}/${C.name}-${game}-round${roundNo ? roundNo + 1 : ''}.png` });
      const rows = await page.evaluate(() => document.querySelectorAll('.cb-res tbody tr').length);
      if (rows < 4) issues.push(`${C.name} ${game}: round summary too short (${rows} rows)`);
      // one round is the test; play another (at most 3) if the human never built a meld in the tray
      if (stats.staged && stats.melds) break;
      if (++roundNo >= 3 || !(await page.$('[data-a=cb-next]'))) break;
      await page.click('[data-a=cb-next]');
      continue;
    }
    if (await page.$('.cb-choose')) { await page.click('[data-a=cb-pick][data-i="0"]'); continue; }
    // the move the "normale" AI would make for the human
    const st = await page.evaluate(() => {
      const c = window.__carte, s = c.M.state, p = s.turn;
      const m = c.game.ai(structuredClone(s), p, 'normale', Math.random);
      const legal = c.legal();
      const sugg = legal.find((x) => (x.a === 'open' || (x.a === 'meld' && x.label)) && !s.stage[p].length);
      return { m, phase: s.phase, sugg, hand: s.hands[p].slice(), stage: s.stage[p].length };
    });
    let m = st.m;
    const how = stats.moves % 3 === 1 ? 'drag' : 'tap';
    if (st.sugg && !usedSugg && stats.moves > 2) { m = st.sugg; usedSugg = true; stats.sugg++; }
    if (m.a === 'meld' && !m.label) {
      // build it in the tray card by card, then "Cala"
      const ids = await page.evaluate((keys) => { const s = window.__carte.M.state, pool = s.hands[s.turn].slice(), out = []; for (const k of keys) { const i = pool.findIndex((c) => (c.includes('J') ? 'J' : c.replace(/~\d+$/, '')) === k); out.push(pool[i]); pool.splice(i, 1); } return out; }, m.keys);
      for (const id of ids) {
        const okm = await perform(page, C, { a: 'stage', card: id, to: 'stage' }, stats.staged % 2 ? 'drag' : 'tap');
        if (!okm) { issues.push(`${C.name} ${game}: stage ${id} not registered`); break; }
        stats.staged++; await ready(page);
      }
      if (!shots++) { await page.waitForTimeout(450); await page.screenshot({ path: `${OUT}/${C.name}-${game}-tray.png` }); }
      const okc = await perform(page, C, { a: 'meldStage' }, 'tap');
      if (!okc) issues.push(`${C.name} ${game}: Cala not registered`);
      stats.melds++; stats.btn++; stats.moves++;
      continue;
    }
    const okm = await perform(page, C, m, how);
    if (!okm) { issues.push(`${C.name} ${game}: move ${JSON.stringify(m)} not registered`); break; }
    stats.moves++; if (!m.card) stats.btn++; else if (how === 'drag' && !C.touch && m.to) stats.drag++; else stats.tap++;
    if (m.a === 'att' || m.a === 'swap') stats.att++; if (m.a === 'disc') stats.disc++; if (m.a === 'take') stats.take++; if (m.a === 'open' || m.a === 'meld') stats.melds++;
    if (stats.moves === 6 || (stats.melds && shots === 1)) { shots++; await page.waitForTimeout(450); await page.screenshot({ path: `${OUT}/${C.name}-${game}-play${shots}.png` }); }
  }
  const info = await page.evaluate(() => ({ rounds: window.__carte.M?.rounds.length, totals: window.__carte.M?.totals, over: window.__carte.M?.over }));
  if (!info.rounds) issues.push(`${C.name} ${game}: round not finished`);
  console.log(`${C.name} ${game} ${cfg.variant || ''}/${cfg.n}: ${JSON.stringify(stats)} · totali ${info.totals}`);
  const next = await page.$('[data-a=cb-tolobby]');
  if (next) await next.click(); else { await page.click('[data-a=cb-pause]'); await page.click('[data-a=cb-quit]'); }
  await page.waitForSelector('[data-a=cb-start]');
  await page.click('[data-a=cb-home]');
  await page.waitForSelector('.cb-games');
}

for (const C of CASES) {
  if (only && !only.split(',').includes(C.name)) continue;
  const ctx = await browser.newContext({ viewport: { width: C.vp[0], height: C.vp[1] }, hasTouch: !!C.touch, isMobile: !!C.mobile, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => issues.push(`${C.name} pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !IGNORE.test(m.text())) issues.push(`${C.name} console: ${m.text()}`); });
  await page.addInitScript(() => { localStorage.setItem('apexdynasty_settings', JSON.stringify({ sound: false, music: false })); window.__carteFast = true; });
  await page.goto(BASE + '?game=carte');
  await page.waitForSelector('.cb-games', { timeout: 60000 });
  await page.waitForTimeout(300);
  for (const g of GAMES) {
    if (!(await page.$(`[data-a=cb-open][data-id=${g}]`))) { issues.push(`${C.name}: ${g} missing from the menu`); continue; }
    await playRound(page, C, g);
  }
  await page.screenshot({ path: `${OUT}/${C.name}-home.png` });
  await ctx.close();
}
await browser.close();
if (issues.length) { console.log('PROBLEMI:\n' + issues.join('\n')); process.exit(1); }
console.log(`carte ramino e2e (${GAMES.join(', ')}): tutto ok`);
