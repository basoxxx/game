// Quiz — single-player play: Partita (10 domande a tempo), Sopravvivenza (3 vite) and Quiz del giorno.
// Lifelines once per game: 50/50, Salta, +10 secondi. Every answer shows its explanation.
import { qzLoad, qzSave } from '../store.js';
import { CATS, catById, loadCats, loadAll, pickFrom, markSeen, dealQuestion } from '../bank.js';
import { dateKey, dayNumber, dailyQuestions, keyToDate } from '../daily.js';
import { bar, fmt, esc, play, coinBurst, updateWallet, share, countdown, vibrate } from '../ui.js';

const LETTERS = ['A', 'B', 'C', 'D'];
const TIME = { partita: 20, sopravvivenza: 15, daily: 20 };
const TITLE = { partita: 'Partita', sopravvivenza: 'Sopravvivenza', daily: 'Quiz del giorno' };
let G = null, raf = 0, root = null, onVis = null;

const stars = (d) => `<span class="qz-stars" aria-label="Difficoltà ${d} su 3">${'★'.repeat(d)}<i>${'★'.repeat(3 - d)}</i></span>`;
const yesterday = () => { const t = new Date(); t.setDate(t.getDate() - 1); return dateKey(t); };

function newGame(mode) {
  const d = qzLoad();
  return { mode, cats: mode === 'daily' ? CATS.map((c) => c.id) : d.opts.cats || CATS.map((c) => c.id), diff: mode === 'daily' ? 0 : d.opts.diff, bank: null, n: 0, total: mode === 'sopravvivenza' ? Infinity : 10,
    score: 0, streak: 0, bestStreak: 0, lives: 3, right: 0, log: [], used: new Set(), life: { fifty: 1, skip: 1, time: 1 }, ph: 'load', q: null, t0: 0, tTotal: TIME[mode], paused: 0, pauseAt: 0, coins: 0, plan: null };
}
function levelFor(i) {
  if (G.mode === 'sopravvivenza') return i < 4 ? 1 : i < 10 ? 2 : 3;
  if (G.diff) return G.diff;
  return [1, 1, 1, 2, 2, 2, 2, 3, 3, 3][i] || 2;
}
function nextQuestion() {
  let q;
  if (G.mode === 'daily') { const p = G.plan[G.n]; q = G.bank[p.cat].find((x) => x.id === p.id); }
  else {
    // rotate the categories so a game mixes them
    const cat = G.cats[(G.n + G.catOff) % G.cats.length];
    q = pickFrom(G.bank, cat, levelFor(G.n), G.used);
  }
  G.used.add(q.id);
  G.q = dealQuestion(q); G.hidden = new Set(); G.ph = 'ask'; G.t0 = performance.now(); G.paused = 0; G.tTotal = TIME[G.mode]; G.extra = 0;
  draw(); loop();
}
const left = () => Math.max(0, G.tTotal + G.extra - (performance.now() - G.t0 - G.paused) / 1000);

function draw() {
  const q = G.q, c = catById(q.cat);
  const st = root.querySelector('.qz-stage'); if (!st) return;
  st.innerHTML = `
    <div class="qz-qhead"><span class="qz-catpill" style="--c:${c.color}">${c.icon} ${c.name}</span>${stars(q.d)}<span class="qz-num">${G.mode === 'sopravvivenza' ? `Domanda ${G.n + 1}` : `${G.n + 1}/${G.total}`}</span></div>
    <div class="qz-timer" role="timer"><i style="transform:scaleX(1)"></i><b>${Math.ceil(G.tTotal)}</b></div>
    <h2 class="qz-q">${esc(q.q)}</h2>
    <div class="qz-answers">${q.a.map((a, i) => `<button class="qz-ans" data-a="qz" data-do="ans" data-i="${i}" style="--d:${i * 60}ms"><kbd>${LETTERS[i]}</kbd><span>${esc(a)}</span></button>`).join('')}</div>
    <div class="qz-life">
      <button class="qz-lf" data-a="qz" data-do="fifty" ${G.life.fifty ? '' : 'disabled'} title="Elimina due risposte sbagliate (tasto 5)"><b>50:50</b><span>Due in meno</span></button>
      <button class="qz-lf" data-a="qz" data-do="skip" ${G.life.skip ? '' : 'disabled'} title="Cambia domanda senza penalità (tasto 6)"><b>⏭</b><span>Salta</span></button>
      <button class="qz-lf" data-a="qz" data-do="time" ${G.life.time ? '' : 'disabled'} title="Dieci secondi in più (tasto 7)"><b>+10″</b><span>Tempo extra</span></button>
    </div>
    <div class="qz-explain" hidden></div>`;
  hud();
  requestAnimationFrame(() => st.querySelector('.qz-ans')?.focus({ preventScroll: true }));
}
function hud() {
  const r = root.querySelector('.qz-bar-r'); if (!r) return;
  r.innerHTML = `${G.mode === 'sopravvivenza' ? `<span class="qz-lives">${'❤️'.repeat(G.lives)}<i>${'🤍'.repeat(3 - G.lives)}</i></span>` : ''}<span class="qz-streak ${G.streak >= 2 ? 'on' : ''}">🔥 ${G.streak}</span><span class="qz-score"><b>${fmt(G.score)}</b> punti</span>`;
}
function loop() {
  cancelAnimationFrame(raf);
  const tick = () => {
    if (!G || G.ph !== 'ask' || !root?.isConnected) return;
    if (document.querySelector('.modal-wrap')) { if (!G.pauseAt) G.pauseAt = performance.now(); raf = requestAnimationFrame(tick); return; }
    if (G.pauseAt) { G.paused += performance.now() - G.pauseAt; G.pauseAt = 0; }
    const l = left(), tot = G.tTotal + G.extra;
    const bar = root.querySelector('.qz-timer i'), num = root.querySelector('.qz-timer b');
    if (bar) { bar.style.transform = `scaleX(${l / tot})`; bar.parentElement.classList.toggle('low', l < 5); }
    if (num) { const s = Math.ceil(l); if (num.textContent !== String(s)) { num.textContent = s; if (s <= 5 && s > 0) play('tick'); } }
    if (l <= 0) { answer(-1); return; }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
}

function answer(i) {
  if (!G || G.ph !== 'ask') return;
  if (i >= 0 && G.hidden.has(i)) return;
  cancelAnimationFrame(raf);
  const q = G.q, ok = i === q.c, l = left();
  G.ph = 'reveal';
  markSeen(q);
  let pts = 0;
  if (ok) {
    G.streak++; G.bestStreak = Math.max(G.bestStreak, G.streak); G.right++;
    const mult = 1 + Math.min(G.streak - 1, 5) * 0.1;
    pts = Math.round((100 * q.d + Math.round((l / (G.tTotal + G.extra)) * 50 * q.d)) * mult);
    G.score += pts; play('ok'); vibrate(20);
  } else {
    G.streak = 0; play('bad'); vibrate([30, 40, 30]);
    if (G.mode === 'sopravvivenza') G.lives--;
  }
  G.log.push({ id: q.id, cat: q.cat, q: q.q, a: q.a[q.c], pick: i >= 0 ? q.a[i] : null, ok, e: q.e, pts });
  const btns = [...root.querySelectorAll('.qz-ans')];
  btns.forEach((b, k) => { b.disabled = true; b.classList.toggle('right', k === q.c); b.classList.toggle('wrong', k === i && !ok); });
  root.querySelectorAll('.qz-lf').forEach((b) => { b.disabled = true; });
  root.querySelector('.qz-timer')?.classList.add('stop');
  const ex = root.querySelector('.qz-explain');
  const last = G.mode === 'sopravvivenza' ? G.lives <= 0 : G.n + 1 >= G.total;
  ex.hidden = false;
  ex.innerHTML = `<div class="qz-verdict ${ok ? 'ok' : 'ko'}">${ok ? `Giusto! <b>+${fmt(pts)}</b>${G.streak >= 2 ? ` · serie ${G.streak}` : ''}` : i < 0 ? 'Tempo scaduto!' : 'Sbagliato!'}</div>
    ${ok ? '' : `<div class="qz-right">Risposta giusta: <b>${esc(q.a[q.c])}</b></div>`}<p>${esc(q.e)}</p>
    <button class="btn primary qz-next" data-a="qz" data-do="next">${last ? 'Vedi il risultato' : 'Avanti'} <kbd>Invio</kbd></button>`;
  hud();
  requestAnimationFrame(() => ex.querySelector('.qz-next')?.focus({ preventScroll: true }));
}
function next() {
  if (!G || G.ph !== 'reveal') return;
  G.n++;
  const over = G.mode === 'sopravvivenza' ? G.lives <= 0 : G.n >= G.total;
  if (over) finish(); else nextQuestion();
}
function lifeline(k) {
  if (!G || G.ph !== 'ask' || !G.life[k]) return;
  G.life[k] = 0; play('select');
  if (k === 'fifty') {
    const wrong = [0, 1, 2, 3].filter((x) => x !== G.q.c).sort(() => Math.random() - 0.5).slice(0, 2);
    wrong.forEach((x) => { G.hidden.add(x); const b = root.querySelector(`.qz-ans[data-i="${x}"]`); if (b) { b.disabled = true; b.classList.add('gone'); } });
    root.querySelector('.qz-ans:not([disabled])')?.focus({ preventScroll: true });
  } else if (k === 'time') { G.extra += 10; root.querySelector('.qz-timer')?.classList.add('boost'); }
  else if (k === 'skip') {
    // the skipped question is neither right nor wrong; daily mode swaps it for another of the same level
    if (G.mode === 'daily') { const cur = G.plan[G.n]; const alt = G.bank[cur.cat].filter((x) => x.d === G.q.d && !G.used.has(x.id)).sort((a, b) => (a.id < b.id ? -1 : 1)); if (alt.length) G.plan[G.n] = { cat: cur.cat, id: alt[(dayNumber() * 7) % alt.length].id }; }
    nextQuestion(); return;
  }
  root.querySelectorAll(`.qz-lf[data-do="${k}"]`).forEach((b) => { b.disabled = true; });
}

function finish() {
  G.ph = 'end'; cancelAnimationFrame(raf);
  const d = qzLoad(), q = d.quiz;
  const answered = G.log.length;
  q.answered += answered; q.correct += G.right;
  for (const l of G.log) { const pc = (q.perCat[l.cat] ||= { a: 0, c: 0 }); pc.a++; if (l.ok) pc.c++; }
  let coins = 0, record = false;
  if (G.mode === 'partita') { q.games++; coins = G.right * 2 + (G.right === 10 ? 10 : 0); if (G.score > q.best) { q.best = G.score; record = true; } }
  if (G.mode === 'sopravvivenza') { q.games++; coins = G.right; if (G.right > q.survBest) { q.survBest = G.right; record = true; } }
  if (G.mode === 'daily') {
    const k = dateKey(), y = yesterday(), dd = d.daily;
    coins = 10 + G.right * 3;
    dd.streak = dd.lastKey === y ? dd.streak + 1 : dd.lastKey === k ? dd.streak : 1;
    dd.lastKey = k; dd.key = k; dd.score = G.score; dd.res = G.log.map((l) => (l.ok ? 1 : 0)); dd.ids = G.log.map((l) => `${l.cat}:${l.id}`); dd.played++; dd.best = Math.max(dd.best || 0, G.score);
  }
  d.coins += coins; G.coins = coins; G.record = record;
  qzSave(d);
  if (G.right >= (G.mode === 'sopravvivenza' ? 10 : 7)) play('win'); else play('notify');
  showEnd();
  coinBurst(root, coins); updateWallet(root);
}
function shareText(res, score, day) {
  return `Quiz e Parole · Quiz del giorno n° ${day}\n${res.map((r) => (r ? '🟩' : '🟥')).join('')}\n${res.filter(Boolean).length}/10 · ${fmt(score)} punti`;
}
function showEnd() {
  const st = root.querySelector('.qz-stage'); if (!st) return;
  root.querySelector('.qz-bar-r').innerHTML = '';
  const r = G.right, n = G.log.length;
  const title = G.mode === 'sopravvivenza' ? `${r} risposte giuste` : r === n ? 'Perfetto!' : r >= 7 ? 'Bravissimo!' : r >= 4 ? 'Niente male!' : 'Si può fare meglio!';
  st.innerHTML = `<div class="qz-end">
    <div class="qz-end-h"><small>${TITLE[G.mode]}${G.mode === 'daily' ? ` · n° ${dayNumber()}` : ''}</small><h2>${title}</h2>
      <div class="qz-end-score"><b class="qz-count-up">${fmt(G.score)}</b><span>punti</span></div>
      <div class="qz-end-row"><span>✅ ${r}/${n}</span><span>🔥 serie migliore ${G.bestStreak}</span><span class="qz-gain">${'<span class="qz-coin"></span>'} +${fmt(G.coins)}</span>${G.record ? '<span class="qz-rec">Nuovo record!</span>' : ''}</div>
      ${G.mode === 'daily' ? `<div class="qz-emoji" aria-label="Risultato">${G.log.map((l) => (l.ok ? '🟩' : '🟥')).join('')}</div>` : ''}
    </div>
    <div class="qz-end-btns">
      ${G.mode === 'daily' ? '<button class="btn primary" data-a="qz" data-do="share">Condividi il risultato</button>' : '<button class="btn primary" data-a="qz" data-do="again">Gioca ancora</button>'}
      <button class="btn" data-a="qz" data-do="menu">Menu del quiz</button>
    </div>
    <h3>Le domande</h3>
    <ol class="qz-review">${G.log.map((l) => `<li class="${l.ok ? 'ok' : 'ko'}"><b>${l.ok ? '✓' : '✗'} ${esc(l.q)}</b><span>Risposta: <em>${esc(l.a)}</em>${!l.ok && l.pick ? ` · tu: ${esc(l.pick)}` : ''}${!l.pick && !l.ok ? ' · tempo scaduto' : ''}</span><small>${esc(l.e)}</small></li>`).join('')}</ol>
  </div>`;
  requestAnimationFrame(() => st.querySelector('.qz-end-btns .btn')?.focus({ preventScroll: true }));
}

async function start(mode) {
  G = newGame(mode); G.catOff = Math.floor(Math.random() * 9);
  const d = qzLoad();
  if (mode === 'daily' && d.daily.key === dateKey()) { await showSavedDaily(); return; }
  try {
    G.bank = mode === 'daily' ? await loadAll() : await loadCats(G.cats);
  } catch (e) { const st = root?.querySelector('.qz-stage'); if (st) st.innerHTML = `<div class="qz-panel"><h2>Domande non disponibili</h2><p>${esc(e.message || e)}</p></div>`; return; }
  if (!root?.isConnected || G?.mode !== mode) return;
  if (mode === 'daily') G.plan = dailyQuestions(G.bank, dayNumber());
  G.cats = G.cats.slice().sort(() => Math.random() - 0.5);
  const st = root.querySelector('.qz-stage'); st.innerHTML = `<div class="qz-ready"><b>${TITLE[mode]}</b><span>${mode === 'sopravvivenza' ? 'Tre vite. Il livello sale a ogni risposta.' : `10 domande · ${TIME[mode]} secondi ciascuna`}</span></div>`;
  await countdown(root);
  if (!root?.isConnected || !G || G.mode !== mode) return;
  nextQuestion();
}
async function showSavedDaily() {
  const d = qzLoad(), dd = d.daily;
  G.ph = 'end'; G.score = dd.score; G.right = dd.res.filter(Boolean).length; G.coins = 0; G.bestStreak = 0;
  G.log = [];
  try {
    const bank = await loadAll();
    G.log = (dd.ids || []).map((s, i) => { const [cat, id] = s.split(':'); const q = bank[cat]?.find((x) => x.id === id); return q ? { q: q.q, a: q.a[q.c], ok: !!dd.res[i], e: q.e, pick: dd.res[i] ? q.a[q.c] : '—' } : null; }).filter(Boolean);
  } catch {}
  if (!G.log.length) G.log = dd.res.map((ok, i) => ({ q: `Domanda ${i + 1}`, a: '', ok: !!ok, e: '', pick: '' }));
  let s = 0, b = 0; for (const r of dd.res) { s = r ? s + 1 : 0; b = Math.max(b, s); } G.bestStreak = b;
  showEnd();
  const h = root.querySelector('.qz-end-h small'); if (h) h.textContent = `Quiz del giorno · n° ${dayNumber()} · già giocato oggi, torna domani`;
}
function stop() { cancelAnimationFrame(raf); if (onVis) document.removeEventListener('visibilitychange', onVis); onVis = null; }

export default {
  render(params) {
    const mode = TITLE[params.mode] ? params.mode : 'partita';
    return `<div class="qz-play">${bar(TITLE[mode])}<div class="qz-stage"><div class="qz-ready"><b>Carico le domande…</b></div></div></div>`;
  },
  mount(r, params) {
    root = r; const mode = TITLE[params.mode] ? params.mode : 'partita';
    // a refresh while playing (e.g. after a toast) keeps the game: only a new mount with no game starts one
    if (G && G.mode === mode && G.ph !== 'load' && G.keep) { G.keep = false; if (G.ph === 'end') showEnd(); else { draw(); if (G.ph === 'ask') loop(); } return; }
    onVis = () => { if (!G || G.ph !== 'ask') return; if (document.hidden) G.pauseAt = performance.now(); };
    document.addEventListener('visibilitychange', onVis);
    start(mode);
  },
  unmount() { stop(); },
  onKey(e, ctx) {
    if (!G) return;
    const k = e.key;
    if (k === 'Escape') { e.preventDefault(); this.act('exit', null, ctx); return; }
    if (G.ph === 'ask') {
      const i = { 1: 0, 2: 1, 3: 2, 4: 3, a: 0, b: 1, c: 2, d: 3 }[k.toLowerCase()];
      if (i != null) { e.preventDefault(); answer(i); return; }
      if (k === '5') { e.preventDefault(); lifeline('fifty'); } else if (k === '6') { e.preventDefault(); lifeline('skip'); } else if (k === '7') { e.preventDefault(); lifeline('time'); }
    } else if (G.ph === 'reveal' && (k === 'Enter' || k === ' ')) { e.preventDefault(); next(); }
  },
  act(n, el, ctx) {
    if (n === 'ans') { answer(+el.dataset.i); return; }
    if (n === 'next') { next(); return; }
    if (n === 'fifty' || n === 'skip' || n === 'time') { lifeline(n); return; }
    if (n === 'again') { const m = G.mode; G = null; ctx.go('quizplay', { mode: m }, { replace: true }); return; }
    if (n === 'menu') { G = null; ctx.back('quizmenu'); return; }
    if (n === 'share') { const dd = qzLoad().daily; share(ctx.App, 'Quiz del giorno', shareText(dd.res, dd.score, dayNumber(keyToDate(dd.key)))); return; }
    if (n === 'exit') {
      if (!G || G.ph === 'end' || G.ph === 'load') { G = null; ctx.back(); return; }
      ctx.App.confirm('Lasciare la partita?', G.mode === 'daily' ? 'Il Quiz del giorno non verrà registrato e potrai rifarlo.' : 'I punti di questa partita andranno persi.', () => { stop(); G = null; ctx.back(); }, 'Esci', true);
    }
  },
  get state() { return G && { mode: G.mode, ph: G.ph, n: G.n, score: G.score, right: G.right, lives: G.lives, c: G.q?.c, id: G.q?.id, life: { ...G.life }, hidden: G.hidden ? [...G.hidden] : [] }; },
  // e2e helpers: answer the current question right or wrong, skip the timer
  test: { answer: (ok) => G && answer(ok ? G.q.c : (G.q.c + 1) % 4), next: () => next(), timeout: () => { if (G) G.t0 -= 1e6; } },
};
