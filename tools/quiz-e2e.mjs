// Quiz e Parole browser test: hub tile and modes, every game played through its real UI paths at
// 1440x900, 1024x768, 390x844 and 844x390 (the last two touch), screenshots of each screen, no console errors,
// no horizontal overflow.
//   npx vite build && npx vite preview --port 4684 --strictPort
//   node tools/quiz-e2e.mjs [baseUrl] [outDir]        (ONLY=desktop,tablet,phone,phone-land)
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const BASE = (process.argv[2] || 'http://127.0.0.1:4684/').replace(/\/?$/, '/');
const OUT = process.argv[3] || 'quiz-shots';
mkdirSync(OUT, { recursive: true });
const IGNORE = /GPU stall|AudioContext|favicon|WebGL|GL_INVALID|Automatic fallback to software/i;
const issues = [];
const CASES = [
  { name: 'desktop', vp: [1440, 900] },
  { name: 'tablet', vp: [1024, 768] },
  { name: 'phone', vp: [390, 844], touch: true, mobile: true },
  { name: 'phone-land', vp: [844, 390], touch: true, mobile: true },
];
const only = process.env.ONLY;
const browser = await pw.chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const wait = (p, ms = 250) => p.waitForTimeout(ms);
const view = (p) => p.evaluate(() => window.__quiz?.view);
const qs = (p) => p.evaluate(() => window.__quiz?.inst?.state);
async function overflow(page, tag) {
  const o = await page.evaluate(() => { const r = document.getElementById('qz-root'); if (!r) return 0; return Math.max(r.scrollWidth - r.clientWidth, document.documentElement.scrollWidth - innerWidth); });
  if (o > 2) issues.push(`${tag}: overflow orizzontale di ${o}px`);
}
async function shot(page, C, name) { await wait(page, 350); await overflow(page, `${C.name}/${name}`); await page.screenshot({ path: `${OUT}/${C.name}-${name}.png` }); }
async function tap(page, sel) { await page.locator(sel).first().click({ timeout: 8000 }); }
async function untilView(page, v) { await page.waitForFunction((x) => window.__quiz?.view === x, v, { timeout: 15000 }); await wait(page, 200); }

for (const C of CASES) {
  if (only && !only.split(',').includes(C.name)) continue;
  const ctx = await browser.newContext({ viewport: { width: C.vp[0], height: C.vp[1] }, hasTouch: !!C.touch, isMobile: !!C.mobile, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => issues.push(`${C.name} pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !IGNORE.test(m.text())) issues.push(`${C.name} console.error: ${m.text()}`); if (/errore intercettato/.test(m.text())) issues.push(`${C.name} crash: ${m.text()}`); });
  await page.addInitScript(() => { try { localStorage.setItem('apexdynasty_settings', JSON.stringify({ sound: false, music: false, reduceMotion: false })); sessionStorage.setItem('qz-pr-help', '1'); } catch {} });
  // Baso Hub: the Quiz e Parole tile and its modes
  await page.goto(BASE);
  await page.waitForSelector('[data-a="bh-game"]', { timeout: 30000 }).catch(() => {});
  await wait(page, 600);
  const hub = await page.evaluate(() => { const t = [...document.querySelectorAll('[data-a="bh-game"][data-id="quiz"]')]; t[0]?.click(); return t.length; });
  if (!hub) issues.push(`${C.name}: tessera Quiz e Parole non trovata nel Baso Hub`);
  await wait(page, 500);
  await page.screenshot({ path: `${OUT}/${C.name}-hub.png` });
  const modes = await page.evaluate(() => [...document.querySelectorAll('[data-a="bh-mode"][data-g="quiz"]')].map((b) => b.dataset.m));
  for (const m of ['quiz', 'daily', 'parola', 'impiccato', 'anagrammi']) if (!modes.includes(m)) issues.push(`${C.name}: modalità hub mancante ${m} (trovate: ${modes.join(',')})`);
  // open the collection through the hub mode "Quiz"
  await page.evaluate(() => document.querySelector('[data-a="bh-mode"][data-g="quiz"][data-m="quiz"]')?.click());
  await untilView(page, 'quizmenu').catch(async () => { issues.push(`${C.name}: modalità hub Quiz non apre il menu`); await page.goto(BASE + '?game=quiz'); });
  await shot(page, C, 'quizmenu');
  // back to the collection home
  await page.keyboard.press('Escape'); await untilView(page, 'home');
  await shot(page, C, 'home');

  // ── Partita: answer through the UI (click right / wrong), use the three lifelines
  await page.evaluate(() => window.__quiz.ctx.go('quizplay', { mode: 'partita' }));
  await page.waitForFunction(() => window.__quiz.inst.state?.ph === 'ask', null, { timeout: 20000 });
  await shot(page, C, 'partita-domanda');
  await tap(page, '.qz-lf[data-do="fifty"]');
  let s = await qs(page); if (s.hidden.length !== 2 || s.hidden.includes(s.c)) issues.push(`${C.name}: 50/50 non valido ${JSON.stringify(s.hidden)}`);
  await tap(page, '.qz-lf[data-do="time"]');
  const before = (await qs(page)).id; await tap(page, '.qz-lf[data-do="skip"]'); await wait(page, 150);
  if ((await qs(page)).id === before) issues.push(`${C.name}: Salta non cambia domanda`);
  const seen = new Set();
  for (let i = 0; i < 10; i++) {
    await page.waitForFunction(() => window.__quiz.inst.state?.ph === 'ask', null, { timeout: 10000 });
    s = await qs(page); if (seen.has(s.id)) issues.push(`${C.name}: domanda ripetuta ${s.id}`); seen.add(s.id);
    const pick = i % 3 === 2 ? (s.c + 1) % 4 : s.c;
    if (C.name === 'desktop' && i === 1) await page.keyboard.press(String(pick + 1)); else await tap(page, `.qz-ans[data-i="${pick}"]`);
    await page.waitForSelector('.qz-next', { timeout: 5000 });
    if (i === 0) await shot(page, C, 'partita-risposta');
    if (C.name === 'desktop') await page.keyboard.press('Enter'); else await tap(page, '.qz-next');
  }
  await page.waitForSelector('.qz-end', { timeout: 8000 });
  await shot(page, C, 'partita-fine');
  s = await qs(page); if (s.ph !== 'end' || s.right !== 7) issues.push(`${C.name}: fine partita inattesa ${JSON.stringify(s)}`);

  // ── Sopravvivenza: three wrong answers end it
  await page.evaluate(() => window.__quiz.ctx.go('quizplay', { mode: 'sopravvivenza' }, { replace: true }));
  await page.waitForFunction(() => window.__quiz.inst.state?.ph === 'ask', null, { timeout: 20000 });
  for (let i = 0; i < 6; i++) {
    s = await qs(page); if (s.ph === 'end') break;
    await tap(page, `.qz-ans[data-i="${i < 3 ? s.c : (s.c + 1) % 4}"]`); await tap(page, '.qz-next');
    await page.waitForFunction(() => ['ask', 'end'].includes(window.__quiz.inst.state?.ph), null, { timeout: 8000 });
  }
  s = await qs(page); if (s.ph !== 'end' || s.lives !== 0) issues.push(`${C.name}: sopravvivenza non finita ${JSON.stringify(s)}`);
  await shot(page, C, 'sopravvivenza-fine');

  // ── Quiz del giorno (desktop plays it, the others see the saved result) + timeout path
  if (C.name === 'desktop') {
    await page.evaluate(() => window.__quiz.ctx.go('quizplay', { mode: 'daily' }, { replace: true }));
    await page.waitForFunction(() => window.__quiz.inst.state?.ph === 'ask', null, { timeout: 20000 });
    const ids = [];
    for (let i = 0; i < 10; i++) {
      await page.waitForFunction(() => window.__quiz.inst.state?.ph === 'ask', null, { timeout: 8000 });
      s = await qs(page); ids.push(s.id);
      if (i === 4) { await page.evaluate(() => window.__quiz.inst.test.timeout()); await page.waitForSelector('.qz-next', { timeout: 4000 }); }
      else await tap(page, `.qz-ans[data-i="${s.c}"]`);
      await tap(page, '.qz-next');
    }
    await page.waitForSelector('.qz-emoji', { timeout: 8000 });
    await shot(page, C, 'daily-fine');
    // same day = same questions: reload and check the saved list
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('baso_quiz_v1')).daily.ids.map((x) => x.split(':')[1]));
    if (saved.join() !== ids.join()) issues.push(`${C.name}: quiz del giorno salvato diverso`);
  }

  // ── Sfida: 3 players on keyboard (desktop) or touch pads, play 10 questions
  await page.evaluate(() => window.__quiz.ctx.go('sfida'));
  await untilView(page, 'sfida');
  await tap(page, '[data-do="n"][data-v="3"]'); await wait(page, 150);
  await shot(page, C, 'sfida-setup');
  if (C.touch) { const devs = await page.locator('.qz-seat:not(.off) .qz-cyc span').allTextContents(); if (!devs.every((t) => /touch/i.test(t))) issues.push(`${C.name}: sfida touch non predefinito ${devs}`); }
  await tap(page, '[data-do="start"]');
  await page.waitForFunction(() => window.__quiz.inst.state?.ph === 'buzz', null, { timeout: 20000 });
  for (let i = 0; i < 10; i++) {
    await page.waitForFunction(() => window.__quiz.inst.state?.ph === 'buzz', null, { timeout: 8000 });
    const p = i % 3;
    if (C.touch) await page.locator(`.qz-sf-pad[data-p="${p}"]`).dispatchEvent('pointerdown');
    else await page.keyboard.press(['q', 'p', 'z'][p]);
    await page.waitForFunction(() => window.__quiz.inst.state?.ph === 'answer', null, { timeout: 4000 });
    if (i === 0) await shot(page, C, 'sfida-prenotato');
    s = await qs(page);
    const pick = i === 3 ? (s.c + 1) % 4 : s.c;
    if (C.touch) await page.locator(`.qz-ans[data-i="${pick}"]`).dispatchEvent('pointerdown'); else await page.keyboard.press(String(pick + 1));
    if (i === 3) { // wrong: the second player gets a go
      await page.waitForFunction(() => window.__quiz.inst.state?.ph === 'buzz', null, { timeout: 4000 });
      await page.evaluate(() => { const t = window.__quiz.inst.test; t.buzz(1); t.right(); });
    }
    await page.waitForFunction(() => window.__quiz.inst.state?.ph === 'reveal', null, { timeout: 4000 });
    if (i === 0) await shot(page, C, 'sfida-risposta');
    await page.evaluate(() => window.__quiz.inst.test.advance());
  }
  await page.waitForSelector('.qz-podium', { timeout: 8000 });
  await shot(page, C, 'sfida-podio');
  s = await qs(page); if (s.scores.filter((x) => x > 0).length < 3) issues.push(`${C.name}: punteggi sfida ${s.scores}`);

  // ── Parolina: daily word through the on-screen keyboard (an invalid word, then the answer)
  await page.evaluate(() => window.__quiz.ctx.go('parola', { mode: 'daily' }));
  await page.waitForFunction(() => window.__quiz.inst.state?.answer, null, { timeout: 20000 });
  s = await qs(page);
  const pressWord = async (w) => { for (const ch of w) await tap(page, `.qz-key[data-k="${ch}"]`); await tap(page, '.qz-key[data-do="enter"]'); };
  await pressWord('qqqqq'); await wait(page, 300);
  if ((await qs(page)).guesses.length) issues.push(`${C.name}: parolina accetta parole non valide`);
  for (let k = 0; k < 5; k++) await tap(page, '.qz-key[data-do="del"]');
  const other = await page.evaluate(() => { const s = window.__quiz.inst.state; return ['carta', 'porta', 'mondo', 'tempo'].find((w) => w !== s.answer); });
  if (C.name === 'desktop') { await page.keyboard.type(other); await page.keyboard.press('Enter'); } else await pressWord(other);
  await wait(page, 1700);
  await shot(page, C, 'parolina-tentativo');
  await pressWord(s.answer);
  await page.waitForSelector('.qz-pr-res', { timeout: 6000 });
  await wait(page, 1800);
  await page.screenshot({ path: `${OUT}/${C.name}-parolina-statistiche.png` });
  await page.evaluate(() => window.__apex.App.closeModal());
  await shot(page, C, 'parolina-vinta');
  s = await qs(page); if (!s.won || s.guesses.length !== 2) issues.push(`${C.name}: parolina ${JSON.stringify(s)}`);
  // free play, hard mode on (desktop)
  await tap(page, '.qz-pr-tabs [data-do="free"]');
  await page.waitForFunction(() => window.__quiz.inst.state?.mode === 'free', null, { timeout: 8000 });
  if (C.name === 'desktop') { await tap(page, '.qz-pr-hard'); if (!(await qs(page)).hard) issues.push('desktop: modalità difficile non attiva'); }
  await shot(page, C, 'parolina-libera');

  // ── Impiccato: guess wrong letters first (sandbags fall), then the word
  await page.evaluate(() => window.__quiz.ctx.go('impiccato'));
  await page.waitForFunction(() => window.__quiz.inst.state?.word, null, { timeout: 8000 });
  s = await qs(page);
  const wrong = 'QWJKXYZHVBFG'.split('').filter((l) => !s.word.includes(l)).slice(0, 3);
  for (const l of wrong) await tap(page, `.qz-key[data-k="${l}"]`);
  await tap(page, '[data-do="hint"]');
  await shot(page, C, 'impiccato-gioco');
  for (const l of [...new Set(s.word.replace(/[^A-Z]/g, ''))]) { const st = await qs(page); if (st.done) break; if (!st.guessed.includes(l)) await tap(page, `.qz-key[data-k="${l}"]`); }
  await wait(page, 1700);
  await shot(page, C, 'impiccato-vinto');
  s = await qs(page); if (!s.won || s.wrong !== 3) issues.push(`${C.name}: impiccato ${JSON.stringify(s)}`);
  // lose one: the balloon flies away
  await tap(page, '[data-do="next"]'); s = await qs(page);
  for (const l of 'QWJKXYZHVBFGPDMCSTLRNUIOAE'.split('').filter((x) => !s.word.includes(x)).slice(0, 7)) await tap(page, `.qz-key[data-k="${l}"]`);
  await wait(page, 2800);
  await shot(page, C, 'impiccato-perso');
  s = await qs(page); if (!s.done || s.won) issues.push(`${C.name}: impiccato perso ${JSON.stringify(s)}`);

  // ── Anagrammi: intro, a round with right / wrong / repeated words, the end
  await page.evaluate(() => window.__quiz.ctx.go('anagrammi'));
  await page.waitForSelector('.qz-an-intro', { timeout: 20000 });
  await shot(page, C, 'anagrammi-intro');
  await tap(page, '.qz-an-intro .btn.primary');
  await page.waitForFunction(() => window.__quiz.inst.state?.ph === 'play', null, { timeout: 8000 });
  const words = await page.evaluate(() => window.__quiz.inst.test.words());
  const letters = (await qs(page)).letters;
  const tapWord = async (w) => { const used = []; for (const ch of w) { const i = [...letters].findIndex((c, k) => c === ch && !used.includes(k)); used.push(i); await tap(page, `.qz-an-tile[data-i="${i}"]`); } await tap(page, '[data-do="send"]'); };
  await tapWord(words[words.length - 1]); await tapWord(words[words.length - 2]);
  if (C.name === 'desktop') { await page.keyboard.type(words[words.length - 3]); await page.keyboard.press('Enter'); await page.keyboard.type(words[words.length - 3]); await page.keyboard.press('Enter'); }
  const bad = [0, 1, 2, 3, 4].map((k) => letters.slice(k, k + 3)).find((x) => !words.includes(x)); if (bad) { await tapWord(bad); const st = await qs(page); if (st.found.includes(bad)) issues.push(`${C.name}: anagrammi accetta ${bad}`); }
  await shot(page, C, 'anagrammi-gioco');
  s = await qs(page); if (s.found.length < 2) issues.push(`${C.name}: anagrammi trovate ${s.found}`);
  await page.evaluate(() => window.__quiz.inst.test.end());
  await page.waitForSelector('.qz-an-play .qz-end', { timeout: 4000 });
  await shot(page, C, 'anagrammi-fine');

  // ── Themes: earned coins buy one
  await page.evaluate(() => window.__quiz.ctx.go('shop'));
  await untilView(page, 'shop');
  const coins = await page.evaluate(() => JSON.parse(localStorage.getItem('baso_quiz_v1')).coins);
  if (coins < 30) issues.push(`${C.name}: poche monete guadagnate (${coins})`);
  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('baso_quiz_v1')); d.coins = 999; localStorage.setItem('baso_quiz_v1', JSON.stringify(d)); });
  await page.evaluate(() => { window.__quiz.ctx.App.refresh(); });
  await page.reload(); await page.waitForFunction(() => !!window.__quiz, null, { timeout: 20000 }).catch(() => {});
  await page.evaluate(() => window.__apex.App.go('quiz', { page: 'shop' })); await untilView(page, 'shop');
  await tap(page, '.qz-theme[data-v="pista"]'); await wait(page, 200); await tap(page, '.modal-wrap [data-a="yes"]'); await wait(page, 300);
  const th = await page.evaluate(() => JSON.parse(localStorage.getItem('baso_quiz_v1')).theme);
  if (th !== 'pista') issues.push(`${C.name}: tema non acquistato (${th})`);
  await shot(page, C, 'temi');
  await page.evaluate(() => window.__quiz.ctx.go('parola', { mode: 'daily' })); await page.waitForSelector('.qz-pr-res', { timeout: 15000 });
  await shot(page, C, 'parolina-tema-pista');
  await ctx.close();
  console.log(`${C.name} ok`);
}
await browser.close();
if (issues.length) { console.log(`\n${issues.length} problemi:`); for (const i of issues) console.log(' - ' + i); process.exit(1); }
console.log('Quiz e Parole e2e: tutto ok');
