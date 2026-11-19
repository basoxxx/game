// Quiz — Sfida: 2-4 players on one screen with buzzers. The first to "prenotare" answers (5 seconds);
// right = +100 and a speed bonus, wrong = -50 and out for that question, the others can still buzz.
// Buzzers: keyboard Q / P / Z / M, a controller each (any face button, then A B X Y to answer) or a touch pad.
// While playing nothing on screen is focusable, so the hub's controller-to-menu bridge stays out of the way.
import { qzLoad, qzSave } from '../store.js';
import { CATS, catById, loadCats, pickFrom, markSeen, dealQuestion } from '../bank.js';
import { head, bar, fmt, esc, play, coinBurst, updateWallet, countdown, vibrate } from '../ui.js';

const COLORS = ['#ff4d6d', '#2f8cff', '#2fd36b', '#ffc21a'];
const KEYS = ['KeyQ', 'KeyP', 'KeyZ', 'KeyM'], KEYL = ['Q', 'P', 'Z', 'M'];
const DEVS = ['tastiera', 'pad', 'touch'];
const isTouch = () => { try { return /[?&]touch\b/.test(location.search) || matchMedia('(pointer: coarse)').matches; } catch { return false; } };
const ANS_T = 6, BUZZ_T = 15;
let S = null, root = null, raf = 0, onDown = null, onKeyUp = null;
const setup = { n: 2, rounds: 10, devs: null };

function defaultDevs() { const t = isTouch(); return [0, 1, 2, 3].map(() => (t ? 'touch' : 'tastiera')); }
function devLabel(dev, i) { return dev === 'tastiera' ? `Tasto ${KEYL[i]}` : dev === 'pad' ? `Controller ${i + 1}` : 'Pulsante touch'; }

function renderSetup() {
  const d = qzLoad(); setup.devs ||= defaultDevs(); setup.n = d.opts.players || 2;
  const sel = d.opts.cats ? `${d.opts.cats.length} categorie` : 'tutte le categorie';
  return `<div class="qz-page">
    ${head({ title: 'Sfida', sub: 'Da 2 a 4 giocatori sullo stesso schermo. Appare la domanda: chi prenota per primo risponde. Giusto +100 punti (più un bonus velocità), sbagliato −50 e fuori per quel turno.', backDo: 'quizmenu' })}
    <section class="qz-sec"><h3>Giocatori</h3><div class="qz-seg">${[2, 3, 4].map((v) => `<button class="${setup.n === v ? 'on' : ''}" data-a="qz" data-do="n" data-v="${v}">${v}</button>`).join('')}</div>
      <div class="qz-seats">${[0, 1, 2, 3].map((i) => `<div class="qz-seat ${i < setup.n ? '' : 'off'}" style="--c:${COLORS[i]}">
        <b>G${i + 1}</b><input class="qz-name" data-i="${i}" maxlength="14" value="${esc(d.opts.names[i] || `Giocatore ${i + 1}`)}" aria-label="Nome giocatore ${i + 1}">
        <div class="qz-cyc"><button class="btn sm" data-a="qz" data-do="dev" data-i="${i}" data-d="-1" aria-label="Comando precedente">‹</button><span>${devLabel(setup.devs[i], i)}</span><button class="btn sm" data-a="qz" data-do="dev" data-i="${i}" data-d="1" aria-label="Comando successivo">›</button></div></div>`).join('')}</div></section>
    <section class="qz-sec qz-opts"><div><h3>Domande</h3><div class="qz-seg">${[10, 15, 20].map((v) => `<button class="${setup.rounds === v ? 'on' : ''}" data-a="qz" data-do="rounds" data-v="${v}">${v}</button>`).join('')}</div></div>
      <div><h3>Touch</h3><div class="qz-seg">${[[0, 'In mano'], [1, 'Tablet sul tavolo']].map(([v, l]) => `<button class="${(d.opts.flat ? 1 : 0) === v ? 'on' : ''}" data-a="qz" data-do="flat" data-v="${v}">${l}</button>`).join('')}</div></div>
      <div><h3>Argomenti</h3><p class="qz-note">${sel} · ${['difficoltà mista', 'facili', 'medie', 'difficili'][d.opts.diff]} (si cambiano nel menu del quiz)</p></div></section>
    <p class="qz-note">Tastiera: G1 <kbd>Q</kbd>, G2 <kbd>P</kbd>, G3 <kbd>Z</kbd>, G4 <kbd>M</kbd> per prenotarsi, poi <kbd>1</kbd>-<kbd>4</kbd> per rispondere. Controller: un tasto qualsiasi per prenotarsi, poi <kbd>A</kbd> <kbd>B</kbd> <kbd>X</kbd> <kbd>Y</kbd>. Touch: il proprio pulsante, poi si tocca la risposta.</p>
    <div class="qz-go"><button class="btn primary big" data-a="qz" data-do="start">Si comincia!</button></div>
  </div>`;
}

function renderPlay() {
  const flat = qzLoad().opts.flat;
  const touch = S.players.filter((p) => p.dev === 'touch');
  return `<div class="qz-play qz-sf ${flat ? 'flat' : ''}">
    <div class="qz-bar"><div class="qz-exit" role="button" aria-label="Esci" data-sf="exit">✕</div><div class="qz-bar-t">Sfida</div><div class="qz-bar-r"><span class="qz-num" data-sf-num></span></div></div>
    <div class="qz-sf-board">${S.players.map((p) => `<div class="qz-sf-p" data-p="${p.i}" style="--c:${p.color}"><b>${esc(p.name)}</b><span class="qz-sf-pts">${fmt(p.score)}</span><small>${p.dev === 'tastiera' ? `tasto ${KEYL[p.i]}` : p.dev === 'pad' ? `controller ${p.i + 1}` : 'touch'}</small></div>`).join('')}</div>
    <div class="qz-stage qz-sf-stage"></div>
    ${touch.length ? `<div class="qz-sf-pads n${touch.length}">${touch.map((p, k) => `<div class="qz-sf-pad ${flat && touch.length > 1 && k < Math.ceil(touch.length / 2) ? 'rot' : ''}" data-sf="buzz" data-p="${p.i}" style="--c:${p.color}"><b>${esc(p.name)}</b><span>PRENOTA</span></div>`).join('')}</div>` : ''}
  </div>`;
}

function drawQ() {
  const st = root.querySelector('.qz-sf-stage'), q = S.q, c = catById(q.cat);
  st.innerHTML = `<div class="qz-qhead"><span class="qz-catpill" style="--c:${c.color}">${c.icon} ${c.name}</span><span class="qz-sf-msg" data-sf-msg></span></div>
    <div class="qz-timer"><i></i><b></b></div>
    <h2 class="qz-q">${esc(q.q)}</h2>
    <div class="qz-answers sf">${q.a.map((a, i) => `<div class="qz-ans" role="button" data-sf="ans" data-i="${i}" style="--d:${i * 60}ms"><kbd>${i + 1}</kbd><span>${esc(a)}</span><i class="qz-padk">${'ABXY'[i]}</i></div>`).join('')}</div>
    <div class="qz-explain" hidden></div>`;
  root.querySelector('[data-sf-num]').textContent = `${S.n + 1}/${S.rounds}`;
  status();
}
function status() {
  const m = root.querySelector('[data-sf-msg]'); if (!m) return;
  const st = root.querySelector('.qz-sf-stage');
  root.querySelectorAll('.qz-sf-p').forEach((el) => { const i = +el.dataset.p; el.classList.toggle('hold', S.holder === i); el.classList.toggle('out', S.out.has(i)); });
  root.querySelectorAll('.qz-sf-pad').forEach((el) => { const i = +el.dataset.p; el.classList.toggle('hold', S.holder === i); el.classList.toggle('out', S.out.has(i)); });
  if (S.ph === 'buzz') { m.textContent = 'Prenotati per rispondere!'; st.style.removeProperty('--hc'); st.classList.remove('holding'); }
  else if (S.ph === 'answer') { const p = S.players[S.holder]; m.innerHTML = `Risponde <b style="color:${p.color}">${esc(p.name)}</b>`; st.style.setProperty('--hc', p.color); st.classList.add('holding'); }
  else if (S.ph === 'reveal') { st.classList.remove('holding'); }
}
function newQuestion() {
  const cats = S.cats, cat = cats[S.n % cats.length];
  const diff = S.diff || [1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 2, 2, 3, 3, 3, 2, 3, 3, 3, 3][S.n] || 2;
  const q = pickFrom(S.bank, cat, diff, S.used); S.used.add(q.id);
  S.q = dealQuestion(q); S.holder = null; S.out = new Set(); S.ph = 'buzz'; S.t0 = performance.now(); S.buzzLeft = BUZZ_T; S.tA = 0;
  drawQ();
}
function buzz(i) {
  if (!S || S.ph !== 'buzz' || S.out.has(i) || i >= S.players.length) return;
  S.buzzLeft = Math.max(0, S.buzzLeft - (performance.now() - S.t0) / 1000);
  S.holder = i; S.ph = 'answer'; S.tA = performance.now();
  play('select'); vibrate(30);
  status();
}
function choose(i, who) {
  if (!S || S.ph !== 'answer') return;
  if (who != null && who !== S.holder) return;
  const p = S.players[S.holder], q = S.q, ok = i === q.c;
  const btn = root.querySelector(`.qz-ans[data-i="${i}"]`);
  if (ok) {
    const bonus = Math.round((S.buzzLeft / BUZZ_T) * 50);
    p.score += 100 + bonus; p.right++; play('ok');
    btn?.classList.add('right'); reveal(`<b style="color:${p.color}">${esc(p.name)}</b> ha risposto giusto! +${100 + bonus}`);
  } else {
    p.score -= 50; p.wrong++; play('bad'); vibrate([30, 40, 30]);
    btn?.classList.add('wrong'); S.out.add(S.holder); S.holder = null;
    if (S.out.size >= S.players.length) { reveal('Nessuno ha indovinato.'); }
    else { S.ph = 'buzz'; S.t0 = performance.now(); setTimeout(() => btn?.classList.remove('wrong'), 600); btn?.classList.add('dead'); status(); }
  }
  board();
}
function reveal(msg) {
  S.ph = 'reveal'; markSeen(S.q);
  root.querySelectorAll('.qz-ans').forEach((b, k) => { if (k === S.q.c) b.classList.add('right'); });
  const ex = root.querySelector('.qz-explain'); ex.hidden = false;
  ex.innerHTML = `<div class="qz-verdict">${msg}</div><div class="qz-right">Risposta: <b>${esc(S.q.a[S.q.c])}</b></div><p>${esc(S.q.e)}</p><small class="qz-note">Prossima domanda tra poco · Invio o un pulsante per continuare</small>`;
  S.tR = performance.now(); status(); board();
}
function board() { root.querySelectorAll('.qz-sf-p').forEach((el) => { const p = S.players[+el.dataset.p]; el.querySelector('.qz-sf-pts').textContent = fmt(p.score); }); }
function advance() {
  if (!S || S.ph !== 'reveal' || performance.now() - S.tR < 700) return;
  S.n++;
  if (S.n >= S.rounds) finish(); else newQuestion();
}

function pads() { try { return [...(navigator.getGamepads?.() || [])].filter(Boolean); } catch { return []; } }
function pollPads() {
  const list = pads();
  S.players.forEach((p) => {
    if (p.dev !== 'pad') return;
    const gp = list.find((g) => g.index === p.padIndex) || list[p.padIndex]; if (!gp) return;
    const b = [0, 1, 2, 3, 4, 5].map((k) => !!gp.buttons[k]?.pressed), prev = p.prev || [];
    const edge = (k) => b[k] && !prev[k];
    if (S.ph === 'buzz' && b.some((x, k) => x && !prev[k])) buzz(p.i);
    else if (S.ph === 'answer' && S.holder === p.i && p.released) { for (let k = 0; k < 4; k++) if (edge(k)) { choose(k, p.i); break; } }
    else if (S.ph === 'reveal' && (edge(0) || edge(9))) advance();
    p.released = S.ph === 'answer' && S.holder === p.i ? (p.released || !b.some(Boolean)) : false;
    p.prev = b;
  });
}
function loop() {
  cancelAnimationFrame(raf);
  const tick = () => {
    if (!S || !root?.isConnected) return;
    if (S.ph === 'end') return;
    if (document.querySelector('.modal-wrap')) { S.t0 += 16; S.tA += 16; raf = requestAnimationFrame(tick); return; }
    pollPads();
    const now = performance.now();
    const tb = root.querySelector('.qz-timer i'), tn = root.querySelector('.qz-timer b');
    if (S.ph === 'buzz') {
      const l = Math.max(0, S.buzzLeft - (now - S.t0) / 1000);
      if (tb) { tb.style.transform = `scaleX(${l / BUZZ_T})`; tb.parentElement.classList.toggle('low', l < 4); }
      if (tn) tn.textContent = Math.ceil(l);
      if (l <= 0) { play('bad'); reveal('Tempo scaduto!'); }
    } else if (S.ph === 'answer') {
      const l = Math.max(0, ANS_T - (now - S.tA) / 1000);
      if (tb) { tb.style.transform = `scaleX(${l / ANS_T})`; tb.parentElement.classList.add('low'); }
      if (tn) tn.textContent = Math.ceil(l);
      if (l <= 0) choose(-1, null);
    } else if (S.ph === 'reveal' && now - S.tR > 4200) advance();
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
}
function finish() {
  S.ph = 'end'; cancelAnimationFrame(raf);
  const rank = S.players.slice().sort((a, b) => b.score - a.score);
  const d = qzLoad(); d.quiz.sfide++; const coins = 5 + S.players.reduce((n, p) => n + p.right, 0) * 2; d.coins += coins; qzSave(d);
  play('win');
  const st = root.querySelector('.qz-sf-stage');
  root.querySelector('.qz-sf-pads')?.remove();
  const tie = rank.length > 1 && rank[0].score === rank[1].score;
  st.innerHTML = `<div class="qz-end"><div class="qz-end-h"><small>Sfida · ${S.rounds} domande</small><h2>${tie ? 'Pareggio in vetta!' : `Vince ${esc(rank[0].name)}!`}</h2></div>
    <div class="qz-podium">${rank.map((p, k) => `<div class="qz-pod p${k + 1}" style="--c:${p.color}"><span class="qz-pod-n">${k + 1}°</span><b>${esc(p.name)}</b><em>${fmt(p.score)}</em><small>${p.right} giuste · ${p.wrong} sbagliate</small></div>`).join('')}</div>
    <div class="qz-end-row"><span class="qz-gain"><span class="qz-coin"></span> +${coins} monete</span></div>
    <div class="qz-end-btns"><button class="btn primary" data-a="qz" data-do="again">Rivincita</button><button class="btn" data-a="qz" data-do="setup">Cambia giocatori</button><button class="btn" data-a="qz" data-do="menu">Menu del quiz</button></div></div>`;
  coinBurst(root, coins); updateWallet(root);
  requestAnimationFrame(() => st.querySelector('.btn.primary')?.focus({ preventScroll: true }));
}

async function start() {
  const d = qzLoad();
  const players = Array.from({ length: setup.n }, (_, i) => ({ i, name: d.opts.names[i] || `Giocatore ${i + 1}`, color: COLORS[i], dev: setup.devs[i], score: 0, right: 0, wrong: 0 }));
  let padN = 0; players.forEach((p) => { if (p.dev === 'pad') p.padIndex = padN++; });
  const cats = (d.opts.cats || CATS.map((c) => c.id)).slice().sort(() => Math.random() - 0.5);
  S = { players, rounds: setup.rounds, n: 0, cats, diff: d.opts.diff, used: new Set(), ph: 'load', bank: null };
  root.innerHTML = renderPlay();
  root.querySelector('.qz-sf-stage').innerHTML = '<div class="qz-ready"><b>Carico le domande…</b></div>';
  document.activeElement?.blur?.();
  S.bank = await loadCats(cats);
  if (!S || !root?.isConnected) return;
  root.querySelector('.qz-sf-stage').innerHTML = `<div class="qz-ready"><b>Pronti?</b><span>${players.map((p) => `<i style="color:${p.color}">${esc(p.name)}</i>`).join(' · ')}</span></div>`;
  await countdown(root);
  if (!S || !root?.isConnected) return;
  newQuestion(); loop();
}
function stop() { cancelAnimationFrame(raf); S = null; }

export default {
  render() { S = null; return `<div class="qz-sf-wrap">${renderSetup()}</div>`; },
  mount(r, params, ctx) {
    root = r;
    r.querySelectorAll('.qz-name').forEach((inp) => inp.addEventListener('change', () => { const d = qzLoad(); d.opts.names[+inp.dataset.i] = inp.value.trim().slice(0, 14) || `Giocatore ${+inp.dataset.i + 1}`; qzSave(d); }));
    onDown = (e) => {
      const t = e.target.closest?.('[data-sf]'); if (!t || !S) return;
      e.preventDefault();
      const k = t.dataset.sf;
      if (k === 'exit') { this.act('exit', null, ctx); return; }
      if (k === 'buzz') { const i = +t.dataset.p; if (S.ph === 'reveal') advance(); else buzz(i); return; }
      if (k === 'ans') {
        // a tap on an answer counts for the player holding the buzzer (touch players and mouse users)
        if (S.ph === 'answer') choose(+t.dataset.i, null);
        else if (S.ph === 'reveal') advance();
      }
    };
    r.addEventListener('pointerdown', onDown);
    requestAnimationFrame(() => r.querySelector('.qz-go .btn')?.focus({ preventScroll: true }));
  },
  unmount() { if (root && onDown) root.removeEventListener('pointerdown', onDown); stop(); },
  onKey(e, ctx) {
    if (!S || S.ph === 'end' || S.ph === 'load') return;
    // the controller bridge sends synthetic keys: ignore them, real controllers are read directly
    if (!e.isTrusted) { e.preventDefault(); return; }
    if (e.key === 'Escape') { e.preventDefault(); this.act('exit', null, ctx); return; }
    const bi = KEYS.indexOf(e.code);
    if (bi >= 0) { e.preventDefault(); const p = S.players[bi]; if (p && (p.dev === 'tastiera' || !S.players.some((x) => x.dev === 'tastiera'))) { if (S.ph === 'reveal') advance(); else buzz(bi); } return; }
    const n = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Numpad1: 0, Numpad2: 1, Numpad3: 2, Numpad4: 3 }[e.code];
    if (n != null) { e.preventDefault(); choose(n, null); return; }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); advance(); }
  },
  act(n, el, ctx) {
    const d = qzLoad();
    if (n === 'n') { d.opts.players = +el.dataset.v; qzSave(d); ctx.refresh(); return; }
    if (n === 'rounds') { setup.rounds = +el.dataset.v; ctx.refresh(); return; }
    if (n === 'flat') { d.opts.flat = el.dataset.v === '1'; qzSave(d); ctx.refresh(); return; }
    if (n === 'dev') { const i = +el.dataset.i, k = DEVS.indexOf(setup.devs[i]); setup.devs[i] = DEVS[(k + +el.dataset.d + DEVS.length) % DEVS.length]; ctx.refresh(); requestAnimationFrame(() => document.querySelector(`[data-do="dev"][data-i="${i}"][data-d="${el.dataset.d}"]`)?.focus()); return; }
    if (n === 'start') { start(); return; }
    if (n === 'again') { start(); return; }
    if (n === 'setup') { stop(); ctx.refresh(); return; }
    if (n === 'menu') { stop(); ctx.back('quizmenu'); return; }
    if (n === 'exit') {
      if (!S || S.ph === 'end') { stop(); ctx.back('quizmenu'); return; }
      ctx.App.confirm('Interrompere la sfida?', 'Il punteggio di questa sfida andrà perso.', () => { stop(); ctx.back('quizmenu'); }, 'Esci', true);
    }
  },
  get state() { return S && { ph: S.ph, n: S.n, holder: S.holder, c: S.q?.c, scores: S.players.map((p) => p.score), out: S.out ? [...S.out] : [] }; },
  test: { buzz: (i) => buzz(i), choose: (i) => choose(i, null), advance: () => { if (S) S.tR = 0; advance(); }, right: () => S && choose(S.q.c, null), wrong: () => S && choose((S.q.c + 1) % 4, null) },
};
