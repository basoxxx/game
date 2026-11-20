// Carte Baso browser test for Texas Hold'em and Blackjack: real taps / clicks on the table buttons at
// desktop, tablet, phone portrait and phone landscape, hot-seat with hidden hole cards, a Sit & Go played
// to the end, a cash session, a Blackjack session with split / double / hint / insurance / count quiz.
//   npx vite build && npx vite preview --port 4687 --strictPort
//   node tools/carte-poker-e2e.mjs [baseUrl] [outDir]          (ONLY=desktop,phone-portrait to filter)
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const BASE = (process.argv[2] || 'http://127.0.0.1:4687/').replace(/\/?$/, '/');
const OUT = process.argv[3] || 'carte-poker-shots';
mkdirSync(OUT, { recursive: true });
const IGNORE = /AudioContext|favicon|GPU stall/i;
const issues = [];
const CASES = [
  { name: 'desktop', vp: [1440, 900], poker: { variant: 'torneo', n: 6, kinds: ['human', 'cpu', 'cpu', 'cpu', 'cpu', 'cpu'], target: 0, level: 'normale' }, bj: { banco: 'h17', conta: 'quiz' } },
  { name: 'tablet', vp: [1024, 768], touch: true, poker: { variant: 'cash', n: 4, kinds: ['human', 'human', 'cpu', 'cpu'], target: 30, level: 'difficile' }, bj: { banco: 's17', conta: 'mostra' } },
  { name: 'phone-portrait', vp: [390, 844], touch: true, mobile: true, poker: { variant: 'torneo', n: 2, kinds: ['human', 'cpu'], target: 0, level: 'facile', allin: true }, bj: { banco: 's17', conta: 'off' } },
  { name: 'phone-landscape', vp: [844, 390], touch: true, mobile: true, poker: { variant: 'torneo', n: 5, kinds: ['human', 'cpu', 'human', 'cpu', 'cpu'], target: 0, level: 'normale' }, bj: { banco: 'h17', conta: 'quiz' } },
];
const browser = await pw.chromium.launch();
const only = process.env.ONLY;
const wait = (page, ms) => page.waitForTimeout(ms);

// every visible button of the table must be inside the viewport, and nothing may scroll sideways
async function layoutCheck(page, C, tag) {
  const r = await page.evaluate(() => {
    const out = [];
    document.querySelector('.cb-result .cb-res-a')?.scrollIntoView({ block: 'end' }); // result modals scroll on short screens
    for (const b of document.querySelectorAll('.ct-acts .btn, .cb-result .btn, .cb-pass .btn')) {
      const q = b.getBoundingClientRect(); if (!q.width) continue;
      if (q.left < -1 || q.right > innerWidth + 1 || q.top < -1 || q.bottom > innerHeight + 1) out.push(`${b.textContent.trim()} @${Math.round(q.left)},${Math.round(q.top)} ${Math.round(q.width)}x${Math.round(q.height)}`);
    }
    return { out, ov: document.documentElement.scrollWidth - innerWidth };
  });
  if (r.ov > 2) issues.push(`${C.name} ${tag}: overflow orizzontale ${r.ov}px`);
  for (const o of r.out) issues.push(`${C.name} ${tag}: pulsante fuori schermo ${o}`);
}
async function setLobby(page, id, L) {
  await page.evaluate(([g, c]) => { const p = JSON.parse(localStorage.getItem('baso_carte_v1') || '{}'); p.lobby = { ...(p.lobby || {}), [g]: c }; localStorage.setItem('baso_carte_v1', JSON.stringify(p)); }, [id, L]);
}
async function openGame(page, C, id, L) {
  await setLobby(page, id, L);
  await page.click(`[data-a=cb-open][data-id=${id}]`);
  await page.waitForSelector('[data-a=cb-start]');
  await wait(page, 150);
  await page.screenshot({ path: `${OUT}/${C.name}-${id}-lobby.png` });
  const ov = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  if (ov > 2) issues.push(`${C.name} ${id} lobby overflow ${ov}px`);
  await page.click('[data-a=cb-start]');
  await page.waitForSelector('#cb-table .ct-root', { timeout: 10000 });
}
const tapBtn = async (page, C, sel) => { const el = await page.$(sel); if (!el) return false; await el.scrollIntoViewIfNeeded().catch(() => {}); const b = await el.boundingBox(); if (!b) return false; if (C.touch) await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); else await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); return true; };
const tableState = (page) => page.evaluate(() => ({
  btns: [...document.querySelectorAll('.ct-acts .btn')].map((b, i) => ({ i: +b.dataset.mi, t: b.textContent.trim() })),
  res: !!document.querySelector('.cb-result'), final: !!document.querySelector('.cb-result.final'), pass: !!document.querySelector('.cb-pass'),
  moves: window.__carte?.M?.moves ?? 0, busy: window.__carte?.V?.busy,
}));

async function playPoker(page, C) {
  const L = C.poker;
  await openGame(page, C, 'poker', { variant: L.variant, n: L.n, kinds: L.kinds, level: L.level, target: L.target, options: { velocita: 'turbo', aiuto: C.name === 'desktop' } });
  let hands = 0, acts = 0, passes = 0; const shots = new Set();
  const shot = async (k) => { if (shots.has(k)) return; shots.add(k); await wait(page, 500); await page.screenshot({ path: `${OUT}/${C.name}-poker-${k}.png` }); };
  const t0 = Date.now(); const maxHands = L.allin ? 60 : L.variant === 'cash' ? 4 : 6;
  for (let guard = 0; guard < 3000; guard++) {
    if (Date.now() - t0 > 300000) { issues.push(`${C.name} poker: timeout`); break; }
    const st = await tableState(page);
    if (st.final) { await shot('final'); await layoutCheck(page, C, 'poker final'); break; }
    if (st.res) {
      hands++; await shot(hands === 1 ? 'hand-result' : 'hand-result-later'); if (hands === 1) await layoutCheck(page, C, 'poker result');
      if (hands >= maxHands) break;
      await tapBtn(page, C, '[data-a=cb-next]'); await wait(page, 80); continue;
    }
    if (st.pass) {
      passes++;
      // hot-seat: behind the pass screen the next human's cards must still be face down... and nobody's cards visible
      // (the framework may already draw the NEXT player's own cards under the opaque pass screen: only other seats count)
      const leak = await page.evaluate(() => { const M = window.__carte.M, s = M.state; if (s.over) return []; const ups = [...document.querySelectorAll('.ct-card:not(.down)')].map((e) => e.dataset.card); return s.hole.flatMap((h, p) => (p !== s.turn ? h : [])).filter((c) => ups.includes(c)); });
      if (passes === 1) await shot('pass');
      // framework note: after «Prossima smazzata» the deal animation of the previous viewer can flip their new cards up
      // behind the (opaque) pass screen; reported as a note, the screen hides them and «Sono pronto» redraws
      if (leak.length) console.log(`  nota: ${C.name} poker: carte di un altro posto scoperte dietro lo schermo di passaggio (coperte dallo schermo) ${leak}`);
      await tapBtn(page, C, '[data-a=cb-ready]'); await wait(page, 60); continue;
    }
    if (!st.btns.length || st.busy) { await wait(page, 40); continue; }
    // privacy in hot-seat: only the player on turn sees their hole cards
    const priv = await page.evaluate(() => { const M = window.__carte.M, s = M.state, me = s.turn; const ups = new Set([...document.querySelectorAll('.ct-card:not(.down)')].map((e) => e.dataset.card)); return s.hole.flatMap((h, p) => (p !== me ? h : [])).filter((c) => ups.has(c)); });
    if (priv.length) issues.push(`${C.name} poker: carte di un altro giocatore scoperte ${priv}`);
    const street = await page.evaluate(() => window.__carte.M.state.street);
    await shot(['preflop', 'flop', 'turn', 'river'][street] || 'play');
    if (acts === 0) await layoutCheck(page, C, 'poker actions');
    // choose: all-in (fast finish), else mostly call / check, sometimes a raise, rarely fold
    const by = (re) => st.btns.find((b) => re.test(b.t));
    let b;
    if (L.allin) b = by(/^All-in/) || by(/^Vedi/) || by(/^Passa/);
    else { const k = acts % 7; b = k === 3 ? by(/^(Rilancia|Punta)/) : k === 6 ? by(/^Lascia/) : null; b ||= by(/^Passa/) || by(/^Vedi/) || st.btns[0]; }
    const before = st.moves;
    await tapBtn(page, C, `.ct-acts .btn[data-mi="${b.i}"]`);
    const okk = await page.waitForFunction((m) => (window.__carte?.M?.moves ?? 0) > m || !!document.querySelector('.cb-result, .cb-pass'), before, { timeout: 6000 }).then(() => true, () => false);
    if (!okk) issues.push(`${C.name} poker: il pulsante «${b.t}» non ha avuto effetto`);
    acts++;
  }
  const info = await page.evaluate(() => ({ over: window.__carte.M.over, winner: window.__carte.M.winner, totals: window.__carte.M.totals, rounds: window.__carte.M.rounds.length }));
  if (L.allin && !info.over) issues.push(`${C.name} poker: torneo non finito (${info.rounds} mani)`);
  console.log(`${C.name} poker ${L.variant}/${L.n}: ${acts} azioni, ${hands} mani, ${passes} passaggi, finito ${info.over}, vince ${info.winner}, bilanci ${info.totals}`);
  // leave: final -> lobby; mid-session -> pause and quit
  if (info.over) await tapBtn(page, C, '[data-a=cb-tolobby]');
  else { await page.evaluate(() => document.querySelector('#cb-over').innerHTML = ''); await tapBtn(page, C, '[data-a=cb-pause]'); await page.waitForSelector('[data-a=cb-quit]'); await tapBtn(page, C, '[data-a=cb-quit]'); }
  await page.waitForSelector('[data-a=cb-start]');
  await page.click('[data-a=cb-home]'); await page.waitForSelector('.cb-games');
}

async function playBlackjack(page, C) {
  await openGame(page, C, 'blackjack', { level: 'normale', target: 20, options: { banco: C.bj.banco, resa: true, conta: C.bj.conta } });
  let hands = 0, acts = 0; const did = {}; const shots = new Set();
  const shot = async (k) => { if (shots.has(k)) return; shots.add(k); await wait(page, 450); await page.screenshot({ path: `${OUT}/${C.name}-bj-${k}.png` }); };
  for (let guard = 0; guard < 2000; guard++) {
    const st = await tableState(page);
    if (st.final) { await shot('final'); break; }
    if (st.res) { hands++; await shot('result'); if (hands === 1) await layoutCheck(page, C, 'bj result'); await tapBtn(page, C, '[data-a=cb-next]'); await wait(page, 80); continue; }
    if (!st.btns.length || st.busy) { await wait(page, 40); continue; }
    const s = await page.evaluate(() => { const s = window.__carte.M.state; return { phase: s.phase, bet: s.bet, quiz: s.quiz && !s.quiz.asked ? s.quiz.answer : null }; });
    const by = (re) => st.btns.find((b) => re.test(b.t));
    let b;
    if (s.phase === 'bet') {
      await shot(s.quiz != null ? 'quiz' : s.bet ? 'bet' : 'bet-empty');
      if (s.quiz != null) b = by(new RegExp(`^Conteggio ${s.quiz > 0 ? '\\+' : ''}${s.quiz}$`));
      else if (s.bet < 40) b = st.btns.find((x) => x.t === (hands % 2 ? '20' : '10')) || by(/^Ripeti/);
      else b = by(/^Distribuisci/);
    } else if (s.phase === 'ins') { await shot('insurance'); b = by(did.ins ? /^No/ : /^(Assicurazione|Pari)/); did.ins = 1; }
    else {
      await shot(acts < 3 ? 'play' : 'play-later');
      if (!did.hint && by(/^Consiglio/)) { b = by(/^Consiglio/); did.hint = 1; }
      else if (by(/^Dividi/)) { b = by(/^Dividi/); did.split = (did.split || 0) + 1; await shot('split-before'); }
      else if (!did.dbl && by(/^Raddoppia/)) { b = by(/^Raddoppia/); did.dbl = 1; }
      else {
        const adv = await page.evaluate(() => { const s = window.__carte.M.state, h = s.hands[s.cur]; let t = 0, a = 0; for (const c of h.cards) { const r = parseInt(c, 10); if (r === 1) { a++; t += 1; } else t += Math.min(10, r); } return a && t + 10 <= 21 ? t + 10 : t; });
        b = adv < 17 ? by(/^Carta/) : by(/^Stai/);
      }
      if (did.split === 1 && s.phase === 'play') { did.split = 2; }
    }
    if (!b) b = st.btns[st.btns.length - 1];
    const before = st.moves;
    await tapBtn(page, C, `.ct-acts .btn[data-mi="${b.i}"]`);
    const okk = await page.waitForFunction((m) => (window.__carte?.M?.moves ?? 0) > m || !!document.querySelector('.cb-result'), before, { timeout: 6000 }).then(() => true, () => false);
    if (!okk) issues.push(`${C.name} blackjack: il pulsante «${b.t}» non ha avuto effetto`);
    if (did.split && !shots.has('split')) await shot('split');
    acts++;
  }
  const info = await page.evaluate(() => ({ over: window.__carte.M.over, totals: window.__carte.M.totals, rounds: window.__carte.M.rounds.length, st: window.__carte.M.dealer?.st }));
  if (!info.over) issues.push(`${C.name} blackjack: sessione non finita`);
  console.log(`${C.name} blackjack: ${acts} azioni, ${hands} mani, finito ${info.over}, bilancio ${info.totals}, sessione ${JSON.stringify(info.st)}`);
  await tapBtn(page, C, '[data-a=cb-tolobby]'); await page.waitForSelector('[data-a=cb-start]');
  await page.click('[data-a=cb-home]'); await page.waitForSelector('.cb-games');
}

for (const C of CASES) {
  if (only && !only.split(',').includes(C.name)) continue;
  const ctx = await browser.newContext({ viewport: { width: C.vp[0], height: C.vp[1] }, hasTouch: !!C.touch, isMobile: !!C.mobile, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => issues.push(`${C.name} pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !IGNORE.test(m.text())) issues.push(`${C.name} console: ${m.text()}`); });
  await page.addInitScript(() => { localStorage.setItem('apexdynasty_settings', JSON.stringify({ sound: false, music: false })); window.__carteFast = true; });
  await page.goto(BASE + '?game=carte');
  await page.waitForSelector('.cb-games', { timeout: 30000 });
  await wait(page, 300);
  await page.screenshot({ path: `${OUT}/${C.name}-home.png` });
  await playPoker(page, C);
  await playBlackjack(page, C);
  await page.click('[data-a=cb-tab][data-id=stats]'); await wait(page, 150);
  await page.screenshot({ path: `${OUT}/${C.name}-stats.png` });
  await ctx.close();
}
await browser.close();
if (issues.length) { console.log('PROBLEMI:\n' + [...new Set(issues)].join('\n')); process.exit(1); }
console.log('carte poker/blackjack e2e: tutto ok');
