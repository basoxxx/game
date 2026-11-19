// Carte Baso browser test: plays a whole Scopa match and a whole Briscola match through the UI (taps,
// drag-and-drop, keyboard) at desktop / tablet / phone portrait / phone landscape, with screenshots.
//   npx vite build && npx vite preview --port 4680 --strictPort
//   node tools/carte-e2e.mjs [baseUrl] [outDir]          (ONLY=desktop,phone-portrait to filter)
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const BASE = (process.argv[2] || 'http://127.0.0.1:4680/').replace(/\/?$/, '/');
const OUT = process.argv[3] || 'carte-shots';
mkdirSync(OUT, { recursive: true });
const IGNORE = /AudioContext|favicon|GPU stall/i;
const issues = [];
const CASES = [
  { name: 'desktop', vp: [1440, 900], scopa: { variant: 'classica', n: 2 }, briscola: { variant: 'due', n: 2 } },
  { name: 'tablet', vp: [1024, 768], touch: true, scopa: { variant: 'scopone', n: 4 }, briscola: { variant: 'coppie', n: 4 } },
  { name: 'phone-portrait', vp: [390, 844], touch: true, mobile: true, scopa: { variant: 'classica', n: 2, kinds: ['human', 'human'] }, briscola: { variant: 'due', n: 2 } },
  { name: 'phone-landscape', vp: [844, 390], touch: true, mobile: true, scopa: { variant: 'assi', n: 3 }, briscola: { variant: 'coppie', n: 4 } },
];
const browser = await pw.chromium.launch();
const only = process.env.ONLY;

async function playMatch(page, C, game, tag) {
  const cfg = C[game];
  await page.evaluate(([g, c]) => { const p = JSON.parse(localStorage.getItem('baso_carte_v1') || '{}'); p.lobby = { ...(p.lobby || {}), [g]: { variant: c.variant, n: c.n, kinds: c.kinds, level: 'normale', target: g === 'briscola' ? 2 : 11 } }; localStorage.setItem('baso_carte_v1', JSON.stringify(p)); }, [game, cfg]);
  await page.click(`[data-a=cb-open][data-id=${game}]`);
  await page.waitForSelector('[data-a=cb-start]');
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${OUT}/${C.name}-${game}-lobby.png` });
  const ov = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  if (ov > 2) issues.push(`${C.name} ${game} lobby overflows by ${ov}px`);
  await page.click('[data-a=cb-start]');
  await page.waitForSelector('.ct-card', { timeout: 10000 });
  let moves = 0, rounds = 0, shot = 0, kinds = { tap: 0, drag: 0, key: 0, choose: 0, pass: 0 };
  const t0 = Date.now();
  for (let guard = 0; guard < 2000; guard++) {
    if (Date.now() - t0 > 420000) { issues.push(`${C.name} ${game}: match timeout`); break; }
    const st = await page.evaluate(() => ({
      ok: document.querySelectorAll('.ct-card.ok').length, choose: !!document.querySelector('.cb-choose'), res: !!document.querySelector('.cb-result'),
      final: !!document.querySelector('.cb-result.final'), pass: !!document.querySelector('.cb-pass'),
    }));
    if (st.final) {
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/${C.name}-${game}-final.png` });
      break;
    }
    if (st.res) {
      rounds++;
      if (rounds === 1) { await page.waitForTimeout(400); await page.screenshot({ path: `${OUT}/${C.name}-${game}-round.png` }); }
      await page.click('[data-a=cb-next]'); await page.waitForTimeout(60); continue;
    }
    if (st.pass) { if (!kinds.pass++) await page.screenshot({ path: `${OUT}/${C.name}-${game}-pass.png` }); await page.click('[data-a=cb-ready]'); await page.waitForTimeout(40); continue; }
    if (st.choose) {
      if (!kinds.choose++) await page.screenshot({ path: `${OUT}/${C.name}-${game}-choose.png` });
      await page.click('[data-a=cb-pick][data-i="0"]'); await page.waitForTimeout(40); continue;
    }
    if (!st.ok) { await page.waitForTimeout(40); continue; }
    // pick a playable card: rotate between tap, drag and keyboard
    const before = await page.evaluate(() => window.__carte.M.moves);
    const how = moves % 5 === 3 && !C.touch ? 'drag' : moves % 5 === 1 ? 'key' : 'tap';
    await page.waitForFunction(() => !document.querySelector('.ct-card.fly'), null, { timeout: 2000 }).catch(() => {});
    // a point where the card is really on top (fans overlap, cards are rotated)
    const pt = await page.evaluate((i) => {
      const cards = [...document.querySelectorAll('.ct-card.ok')]; const el = cards[i % cards.length];
      const r = el.getBoundingClientRect();
      for (let fy = 0.5; fy > 0.05; fy -= 0.1) for (let fx = 0.15; fx < 0.95; fx += 0.1) {
        const x = r.left + r.width * fx, y = r.top + r.height * fy;
        if (document.elementFromPoint(x, y)?.closest('.ct-card') === el) return { x, y, id: el.dataset.card };
      }
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, id: el.dataset.card };
    }, moves);
    if (how === 'tap') { if (C.touch) await page.touchscreen.tap(pt.x, pt.y); else await page.mouse.click(pt.x, pt.y); kinds.tap++; }
    else if (how === 'key') { await page.focus(`.ct-card[data-card="${pt.id}"]`); await page.keyboard.press('Enter'); kinds.key++; }
    else {
      const tx = C.vp[0] / 2, ty = C.vp[1] * 0.42;
      await page.mouse.move(pt.x, pt.y); await page.mouse.down(); await page.mouse.move((pt.x + tx) / 2, (pt.y + ty) / 2, { steps: 4 }); await page.mouse.move(tx, ty, { steps: 4 }); await page.mouse.up(); kinds.drag++;
    }
    const done = (b) => window.__carte.M.moves > b || !!document.querySelector('.cb-choose, .cb-result, .cb-pass');
    let reg = await page.waitForFunction(done, before, { timeout: 4000 }).then(() => true, () => false);
    if (!reg) { // a tap that landed while the hand was still settling: report it, retry from the keyboard
      const st2 = await page.evaluate((id) => ({ ok: [...document.querySelectorAll('.ct-card.ok')].map((e) => e.dataset.card), busy: window.__carte.V.busy, turn: window.__carte.M.state.turn, id }), pt.id);
      console.log(`  nota: ${C.name} ${game} ${how} su ${pt.id} non registrato`, JSON.stringify(st2));
      const el = await page.$('.ct-card.ok'); if (el) { await el.focus(); await page.keyboard.press('Enter'); }
      reg = await page.waitForFunction(done, before, { timeout: 15000 }).then(() => true, () => false);
      if (!reg) issues.push(`${C.name} ${game}: move ${how} on ${pt.id} did not register`);
    }
    moves++;
    if (moves === 4 && !shot++) { await page.waitForTimeout(450); await page.screenshot({ path: `${OUT}/${C.name}-${game}-play.png` }); }
  }
  const info = await page.evaluate(() => ({ over: window.__carte.M?.over, winner: window.__carte.M?.winner, totals: window.__carte.M?.totals, rounds: window.__carte.M?.rounds.length }));
  if (!info.over) issues.push(`${C.name} ${game}: match not finished`);
  console.log(`${C.name} ${game} ${cfg.variant}/${cfg.n}: ${moves} mosse (tap ${kinds.tap}, drag ${kinds.drag}, tastiera ${kinds.key}, scelte ${kinds.choose}, passaggi ${kinds.pass}), ${info.rounds} smazzate, totali ${info.totals}, vince ${info.winner}`);
  await page.click('[data-a=cb-tolobby]');
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
  await page.addInitScript(() => {
    localStorage.setItem('apexdynasty_settings', JSON.stringify({ sound: false, music: false }));
    window.__carteFast = true;
  });
  await page.goto(BASE + '?game=carte');
  await page.waitForSelector('.cb-games', { timeout: 30000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${C.name}-home.png` });
  const ov = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  if (ov > 2) issues.push(`${C.name} home overflows by ${ov}px`);
  await playMatch(page, C, 'scopa');
  await playMatch(page, C, 'briscola');
  // stats and shop
  await page.click('[data-a=cb-tab][data-id=stats]'); await page.waitForTimeout(150);
  await page.screenshot({ path: `${OUT}/${C.name}-stats.png` });
  const played = await page.evaluate(() => JSON.parse(localStorage.getItem('baso_carte_v1')).total.played);
  if (played < 2) issues.push(`${C.name}: stats not recorded (${played})`);
  await page.click('[data-a=cb-tab][data-id=negozio]'); await page.waitForTimeout(150);
  await page.screenshot({ path: `${OUT}/${C.name}-shop.png` });
  await ctx.close();
}
await browser.close();
if (issues.length) { console.log('PROBLEMI:\n' + issues.join('\n')); process.exit(1); }
console.log('carte e2e: tutto ok');
