// Solitari — browser controller, loaded lazily by common.js the first time a solitaire is drawn.
// The Carte Baso screen (src/screens/carte.js) is built for multiplayer card games; this module
// adds, from the outside and only on solitaire tables (#cb-play.sol):
//   HUD chips (time, moves, score), toolbar (undo, hint, new deal, menu: restart, deal number, daily
//   deal, statistics, give up), tap-to-auto-move and double click to the foundation, solver hints,
//   automatic finish, keyboard shortcuts, per-variant statistics and the win celebration.
// It talks to the framework only through what it exposes: window.__carte ({ M, game, table,
// legal(), play(move) }), the table's DOM (.ct-card[data-card], .ct-pile[data-pile]) and App.
import { App } from '../../../app.js';
import { icon } from '../../../ui/icons.js';
import { esc } from '../../../ui/dom.js';
import { ui, fmtClock, dayKey } from './common.js';
import { moveKey } from '../../core/match.js';
import { cardName } from '../../core/cards.js';

const STATS_KEY = 'baso_carte_solitari_v1';
const C = { game: null, s: null, timer: 0, ro: null, plan: null, hintT: 0, lastAuto: 0, lastTap: null, celebrated: new Set(), raf: 0, dimsKey: '' };
const W = () => window.__carte;
const reduced = () => document.documentElement.classList.contains('reduce-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches;

export function install() {
  ui.hook = (game, s) => sync(game, s);
  injectStyle();
  document.addEventListener('keydown', onKey);
  window.__solitari = { hint: () => hintMove(true), plan: () => C.plan, state: () => W()?.M?.state, tapPick, dims: () => ui.dims, stats: () => loadStats(), rerender };
}

// ------------------------------------------------------------------ stats (one localStorage key)
function loadStats() { try { return JSON.parse(localStorage.getItem(STATS_KEY) || '{}') || {}; } catch { return {}; } }
function saveStats(x) { try { localStorage.setItem(STATS_KEY, JSON.stringify(x)); } catch {} }
const vkey = (game, s) => `${game.id}|${game.engine.variantKey?.(s.eo) || ''}`;
function statRow(x, k) { return (x[k] ||= { played: 0, won: 0, streak: 0, best: 0, bestTime: null, bestMoves: null, bestScore: null, seen: [], daily: {} }); }
function track(game, s) {
  if (!s.log.length && !s.over) return;
  const x = loadStats(), r = statRow(x, vkey(game, s)), id = `${s.no}|${s.t0}`;
  if (!r.seen.includes(id)) { r.seen.push(id); if (r.seen.length > 40) r.seen.shift(); r.played++; if (!s.over) r.streak = r.streak > 0 ? r.streak : 0; }
  const doneId = `${id}|${s.over}`;
  if (s.over && !r.seen.includes(doneId)) {
    r.seen.push(doneId);
    if (s.over === 'won') {
      r.won++; r.streak = Math.max(0, r.streak) + 1; r.best = Math.max(r.best, r.streak);
      r.bestTime = r.bestTime == null ? s.el : Math.min(r.bestTime, s.el);
      r.bestMoves = r.bestMoves == null ? s.moves : Math.min(r.bestMoves, s.moves);
      const sc = game.finalScore(s); r.bestScore = r.bestScore == null ? sc : Math.max(r.bestScore, sc);
      if (s.daily) r.daily[s.daily] = { moves: s.moves, el: s.el };
    } else r.streak = 0;
  }
  saveStats(x);
}

// ------------------------------------------------------------------ sync with every render
function sync(game, s) {
  const play = document.getElementById('cb-play');
  C.game = game; C.s = s;
  if (!play) return;
  if (!play.classList.contains('sol')) decorate(play);
  measure();
  chips();
  clearHint();
  track(game, s);
  if (s.over === 'won') celebrate(s);
  // finish by itself when only foundation moves are left
  if (!s.over && game.engine.canFinish?.(s)) later(() => { const L = W()?.legal?.() || []; if (L.some((m) => m.act === 'auto') && !W().V.busy) W().play({ act: 'auto' }); }, 380);
  const dead = !s.over && s.dead;
  play.querySelector('.sol-dead')?.toggleAttribute('hidden', !dead);
}
const later = (fn, ms) => setTimeout(() => { try { fn(); } catch (e) { console.warn(e); } }, window.__carteFast ? 0 : ms);
// after each layout: if the table's real base card size differs from the one the view assumed, lay
// the view out again (instant)
function measure() {
  requestAnimationFrame(() => {
    const T = W()?.table, box = document.getElementById('cb-table');
    if (!T?.box?.isConnected || !T.M || !box) return;
    const d = { W: box.clientWidth, H: box.clientHeight, ch: T.M.ch };
    if (!d.W || !d.H) return;
    if (!ui.dims || d.W !== ui.dims.W || d.H !== ui.dims.H || Math.abs(d.ch - ui.dims.ch) > 0.5) { ui.dims = d; rerender(); }
  });
}
function rerender() {
  const T = W()?.table, M = W()?.M, g = C.game; if (!T?.box?.isConnected || !M || !g || !ui.dims) return;
  T.render({ size: 1, ...g.engine.view(M.state, ui.dims) }, { n: 1, viewer: 0, legal: T.legal, instant: true });
}
// ------------------------------------------------------------------ HUD + toolbar
function decorate(play) {
  play.classList.add('sol');
  const hud = play.querySelector('.cb-hud'), rules = hud?.querySelector('[data-a="cb-rules"]');
  const bar = document.createElement('div'); bar.className = 'sol-bar';
  bar.innerHTML = `<div class="sol-chips"><span class="sol-chip" title="Tempo">${icon('hourglass')}<b data-v="time">0:00</b></span><span class="sol-chip" title="Mosse"><i>Mosse</i><b data-v="moves">0</b></span><span class="sol-chip sc" title="Punteggio"><i data-v="slabel">Punti</i><b data-v="score">0</b></span></div>
    <button class="btn icon-btn ghost" data-sol="undo" aria-label="Annulla (U)" data-tip="Annulla (U)">${icon('replay')}</button>
    <button class="btn icon-btn ghost" data-sol="hint" aria-label="Suggerimento (H)" data-tip="Suggerimento (H)">${icon('bulb')}</button>
    <button class="btn icon-btn ghost" data-sol="new" aria-label="Nuova partita (N)" data-tip="Nuova partita (N)">${icon('plus')}</button>
    <button class="btn icon-btn ghost" data-sol="menu" aria-label="Altro" data-tip="Altro: rigioca, numero, del giorno, statistiche">${icon('sliders')}</button>`;
  if (rules) hud.insertBefore(bar, rules); else hud?.appendChild(bar);
  bar.addEventListener('click', (e) => { const b = e.target.closest('[data-sol]'); if (b) act(b.dataset.sol); });
  const tip = document.createElement('div'); tip.className = 'sol-tip'; tip.setAttribute('aria-live', 'polite'); play.appendChild(tip);
  const dead = document.createElement('div'); dead.className = 'sol-dead'; dead.hidden = true;
  dead.innerHTML = `<span>Nessuna mossa possibile.</span><button class="btn sm" data-sol="undo">${icon('replay')} Annulla</button><button class="btn sm" data-sol="restart">Rigioca</button><button class="btn sm primary" data-sol="resign">Chiudi la partita</button>`;
  dead.addEventListener('click', (e) => { const b = e.target.closest('[data-sol]'); if (b) act(b.dataset.sol); });
  play.appendChild(dead);
  const box = document.getElementById('cb-table');
  box.addEventListener('click', onTap, true);
  box.addEventListener('dblclick', onDbl, true);
  C.ro?.disconnect(); C.ro = new ResizeObserver(() => { clearTimeout(C.rsT); C.rsT = setTimeout(measure, 60); }); C.ro.observe(box);
  clearInterval(C.timer); C.timer = setInterval(() => { if (!document.getElementById('cb-play')) { clearInterval(C.timer); C.ro?.disconnect(); return; } chips(true); }, 1000);
}
function chips(clockOnly = false) {
  const s = W()?.M?.state || C.s, play = document.getElementById('cb-play'); if (!s || !play) return;
  const live = !s.over && s.t0 && !W()?.V?.paused && !document.hidden ? Math.min(60000, Date.now() - s.ts) : 0;
  const set = (k, v) => { const el = play.querySelector(`[data-v="${k}"]`); if (el && el.textContent !== String(v)) el.textContent = v; };
  set('time', fmtClock((s.el || 0) + live));
  if (clockOnly) return;
  set('moves', s.moves);
  set('score', C.game?.finalScore ? C.game.finalScore(s) : s.score || 0);
  set('slabel', C.game?.engine.scoreLabel || 'Punti');
  play.querySelector('[data-sol="undo"]')?.toggleAttribute('disabled', !s.log.length || !!s.over);
}
function say(text, ms = 2600) {
  const t = document.querySelector('#cb-play .sol-tip'); if (!t) return;
  t.innerHTML = text; t.classList.add('on'); clearTimeout(C.tipT); C.tipT = setTimeout(() => t.classList.remove('on'), ms);
}
function canPlay() { const w = W(); return w && w.M && !w.M.state.over && !w.V.busy && !w.V.paused && !document.querySelector('#cb-over > *'); }
function playAct(m) {
  const w = W(); if (!w) return false;
  const L = w.legal(); const k = moveKey(m);
  if (!L.some((x) => moveKey(x) === k)) return false;
  w.table?.fire ? w.table.fire(L.find((x) => moveKey(x) === k)) : w.play(m);
  return true;
}
function act(id) {
  const w = W(); if (!w) return;
  if (id === 'menu') { menu(); return; }
  if (id === 'stats') { statsModal(); return; }
  if (id === 'number') { numberModal(); return; }
  if (!canPlay() && id !== 'resign') { if (w.V.busy) later(() => act(id), 250); return; }
  if (id === 'hint') { hint(); return; }
  if (id === 'undo') { if (!playAct({ act: 'undo' })) say('Niente da annullare'); return; }
  if (id === 'new') { confirmLeave('Nuova partita?', () => playAct({ act: 'new' })); return; }
  if (id === 'restart') { confirmLeave('Rigiocare questa partita?', () => playAct({ act: 'restart' }), true); return; }
  if (id === 'daily') { const g = C.game; requestDeal(g.engine.pick ? null : null, 'giorno'); return; }
  if (id === 'resign') { if (canPlay() || w.M?.state?.dead) confirmLeave('Chiudere la partita?', () => playAct({ act: 'resign' }), true, 'Conta come partita persa.'); }
}
function confirmLeave(title, fn, force = false, text = '') {
  const s = W()?.M?.state; if (!s) return;
  if (!s.log.length && !force) { fn(); return; }
  if (!s.log.length && force && !text) { fn(); return; }
  App.confirm(title, text || 'La partita in corso conta come giocata e non vinta.', () => { later(fn, 30); }, 'Sì', false);
}
// a deal by number / the daily deal: the engine's legalMoves accepts { act: 'deal' } for ui.pending
function requestDeal(no, mode = 'numero') {
  const g = C.game, s = W()?.M?.state; if (!g || !s) return;
  let n = no;
  if (mode === 'giorno') {
    const tmp = g.setup(0, { ...s.eo, variant: W().M.cfg.variant, partita: 'giorno' });
    n = tmp.no;
  }
  const go = () => { ui.pending = { no: n, mode }; try { playAct({ act: 'deal', no: n, mode }); } finally { ui.pending = null; } };
  confirmLeave(mode === 'giorno' ? 'Giocare il Solitario del giorno?' : `Giocare la partita n° ${n}?`, go);
}
function menu() {
  const s = W()?.M?.state, g = C.game; if (!s || !g) return;
  const x = loadStats(), r = x[vkey(g, s)], today = dayKey();
  const dailyDone = r?.daily?.[today];
  App.modal(`<div class="cb-k">${esc(g.name)} · ${esc(g.engine.name(s.eo))}</div><h2>Partita n° ${s.no}${s.daily ? ' · del giorno' : ''}</h2>
    <div class="sol-menu">
      <button class="btn" data-a="sol-restart">${icon('replay')} Rigioca questa partita</button>
      <button class="btn" data-a="sol-new">${icon('plus')} Nuova partita</button>
      <button class="btn" data-a="sol-daily">${icon('calendar')} Solitario del giorno${dailyDone ? ' ✓' : ''}</button>
      <button class="btn" data-a="sol-number">${icon('target')} Scegli il numero della partita</button>
      <button class="btn" data-a="sol-stats">${icon('chart')} Statistiche</button>
      <button class="btn ghost" data-a="sol-resign">${icon('flag')} Arrenditi</button>
    </div>
    <p class="cb-note">Tasti: <b>U</b> annulla · <b>H</b> suggerimento · <b>N</b> nuova · <b>D</b> pesca · frecce e Invio per scegliere le carte.</p>
    <div class="row mt24" style="justify-content:flex-end"><button class="btn primary" data-a="close-modal">Chiudi</button></div>`, {
    'sol-restart': () => { App.closeModal(); act('restart'); },
    'sol-new': () => { App.closeModal(); act('new'); },
    'sol-daily': () => { App.closeModal(); requestDeal(null, 'giorno'); },
    'sol-number': () => { numberModal(); },
    'sol-stats': () => { statsModal(); },
    'sol-resign': () => { App.closeModal(); act('resign'); },
  });
}
function numberModal() {
  const s = W()?.M?.state; if (!s) return;
  App.modal(`<div class="cb-k">Partite numerate</div><h2>Scegli la partita</h2><p class="cb-note">Ogni numero da 1 a 1.000.000 è sempre la stessa mescolata: sfida gli amici sulla stessa partita.</p>
    <div class="sol-num"><input id="sol-no" type="number" min="1" max="1000000" inputmode="numeric" value="${s.no}" aria-label="Numero della partita"><button class="btn primary" data-a="sol-go">${icon('play')} Gioca</button></div>
    <div class="row mt24" style="justify-content:flex-end"><button class="btn ghost" data-a="close-modal">Annulla</button></div>`, {
    'sol-go': () => { const v = Math.round(+document.getElementById('sol-no')?.value || 0); if (!(v >= 1 && v <= 1000000)) { App.toast('Numero non valido', 'Scegli un numero da 1 a 1.000.000.', 'bad'); return; } App.closeModal(); later(() => requestDeal(v), 30); },
  });
  requestAnimationFrame(() => { const i = document.getElementById('sol-no'); i?.focus(); i?.select(); i?.addEventListener('keydown', (e) => { if (e.key === 'Enter') document.querySelector('[data-a="sol-go"]')?.click(); }); });
}
function statsModal() {
  const g = C.game, s = W()?.M?.state; if (!g) return;
  const x = loadStats();
  const rows = (g.variants?.length ? g.variants : [{ id: null, name: g.name }]).map((v) => {
    const eo = g.engine.opts({ variant: v.id }), r = x[`${g.id}|${g.engine.variantKey?.(eo) || ''}`] || {};
    const pct = r.played ? Math.round((r.won / r.played) * 100) : 0;
    return `<tr><td><b>${esc(v.name)}</b></td><td>${r.played || 0}</td><td>${r.won || 0}</td><td>${pct}%</td><td>${r.best || 0}</td><td>${r.bestTime != null ? fmtClock(r.bestTime) : '—'}</td><td>${r.bestMoves ?? '—'}</td><td>${r.bestScore ?? '—'}</td></tr>`;
  }).join('');
  const r = s ? x[vkey(g, s)] : null;
  const days = r ? Object.keys(r.daily || {}).sort().slice(-7).reverse() : [];
  App.modal(`<div class="cb-k">${esc(g.name)}</div><h2>Statistiche</h2>
    <div class="cb-tablewrap"><table class="cb-stats"><thead><tr><th>Variante</th><th>Giocate</th><th>Vinte</th><th>%</th><th>Serie</th><th>Tempo</th><th>Mosse</th><th>${esc(g.engine.scoreLabel || 'Punti')}</th></tr></thead><tbody>${rows}</tbody></table></div>
    ${r ? `<p class="cb-note">Serie in corso: <b>${Math.max(0, r.streak || 0)}</b> · Solitari del giorno vinti: <b>${Object.keys(r.daily || {}).length}</b>${days.length ? ` (ultimi: ${days.map(esc).join(', ')})` : ''}</p>` : ''}
    <div class="row mt24" style="justify-content:flex-end"><button class="btn ghost" data-a="sol-reset">${icon('trash')} Azzera</button><button class="btn primary" data-a="close-modal">Chiudi</button></div>`, {
    'sol-reset': () => App.confirm('Azzerare le statistiche?', `Tutte le statistiche di ${g.name} verranno cancellate.`, () => { const y = loadStats(); for (const k of Object.keys(y)) if (k.startsWith(`${g.id}|`)) delete y[k]; saveStats(y); statsModal(); }, 'Azzera', true),
  }, 'wide');
}

// ------------------------------------------------------------------ hints
const sig = (s) => `${s.no}|${s.uid}|${s.log.length}|${JSON.stringify(s.log[s.log.length - 1] || null)}`;
function planFor(s) {
  const E = C.game.engine;
  const p = C.plan;
  if (p && p.no === s.no && s.log.length >= p.base && s.log.length < p.base + p.moves.length) {
    let ok = true;
    for (let i = p.base; i < s.log.length && ok; i++) ok = moveKey(s.log[i]) === moveKey(p.moves[i - p.base]);
    if (ok && JSON.stringify(s.log.slice(0, p.base)) === p.prefix) return p.moves[s.log.length - p.base];
  }
  if (!E.plan) return null;
  const t0 = performance.now();
  const moves = E.plan(s);
  C.planMs = performance.now() - t0;
  if (!moves?.length) { C.plan = null; return null; }
  C.plan = { no: s.no, base: s.log.length, prefix: JSON.stringify(s.log), moves };
  return moves[0];
}
// -> { move, solved: bool } | null
function hintMove() {
  const w = W(), s = w?.M?.state; if (!s || s.over || !C.game) return null;
  const L = w.legal();
  let m = null, solved = false;
  try { m = planFor(s); solved = !!m; } catch (e) { console.warn(e); }
  if (m && !L.some((x) => moveKey(x) === moveKey(m))) { m = null; solved = false; C.plan = null; }
  if (!m) m = C.game.engine.heuristic?.(s) || null;
  if (m && !L.some((x) => moveKey(x) === moveKey(m))) m = null;
  return m ? { move: m, solved } : null;
}
function describe(m, s) {
  if (m.act === 'draw') return 'Gira una carta dal mazzo';
  if (m.act === 'recycle') return 'Rigira il mazzo';
  if (m.act === 'deal') return 'Distribuisci una nuova fila';
  if (m.act === 'pair') return 'Togli la coppia evidenziata';
  const to = m.to || '';
  const where = to[0] === 'f' ? 'in fondazione' : to.startsWith('cell') ? 'in una cella libera' : to[0] === 't' ? 'nella colonna evidenziata' : to === 'waste' ? 'sugli scarti' : '';
  return `${m.card ? cardName(m.card) : 'Mossa'} ${where}`.trim();
}
function hint() {
  const s = W()?.M?.state; if (!s) return;
  say('Ci penso…', 1500);
  later(() => {
    const h = hintMove();
    if (!h) { say('Nessuna mossa utile: annulla qualche mossa o ricomincia.', 3500); return; }
    showHint(h.move);
    say(`${h.solved ? '' : 'Il risolutore non trova una via sicura. Prova: '}${esc(describe(h.move, s))}`, 3200);
  }, 30);
}
function showHint(m) {
  clearHint();
  const T = W()?.table; if (!T) return;
  const els = [];
  const card = m.card || (m.act === 'recycle' ? null : null);
  if (card) els.push(T.els.get(card));
  const pile = m.to ? m.to : m.act === 'recycle' || m.act === 'draw' ? 'stock' : null;
  if (m.with) els.push(T.els.get(m.with));
  if (pile && pile !== 'deal') {
    const pv = T.view?.piles?.find((p) => p.id === pile);
    const topc = pv?.cards?.[pv.cards.length - 1];
    const tid = topc && (typeof topc === 'string' ? topc : topc.id);
    if (tid && tid !== card) els.push(T.els.get(tid)); else T.pileEls.get(pile)?.classList.add('sol-hint-to');
  }
  els.filter(Boolean).forEach((e, i) => e.classList.add(i ? 'sol-hint-to' : 'sol-hint'));
  C.hintT = setTimeout(clearHint, 3500);
}
function clearHint() {
  clearTimeout(C.hintT);
  document.querySelectorAll('#cb-play .sol-hint, #cb-play .sol-hint-to').forEach((e) => e.classList.remove('sol-hint', 'sol-hint-to'));
}

// ------------------------------------------------------------------ taps, double clicks, keys
function tapPick(id) {
  const T = W()?.table, s = W()?.M?.state; if (!T || !s || !C.game) return null;
  const ms = T.movesFor(id); if (!ms.length) return null;
  if (ms.length === 1) return ms[0];
  return C.game.engine.tapPick?.(s, ms) || null;
}
function onTap(e) {
  const T = W()?.table; if (!T || T._dragged || T.sel) return;
  const now = performance.now(), L = C.lastTap;
  if (L && now - L.t < 330 && Math.hypot(e.clientX - L.x, e.clientY - L.y) < 14) { e.stopPropagation(); e.preventDefault(); return; } // the 2nd click of a double click
  const cardEl = e.target.closest('.ct-card');
  if (!cardEl) {
    const pid = T.pileAt(e.clientX, e.clientY);
    if (pid === 'stock' && canPlay()) { const m = (W().legal() || []).find((x) => x.act === 'recycle' || x.act === 'draw' || x.act === 'deal'); if (m) { e.stopPropagation(); C.lastTap = { t: now, x: e.clientX, y: e.clientY }; T.fire(m); } }
    return;
  }
  if (!cardEl.classList.contains('ok')) return;
  const ms = T.movesFor(cardEl.dataset.card);
  if (ms.length < 2) { C.lastTap = { t: now, x: e.clientX, y: e.clientY }; return; }
  const m = tapPick(cardEl.dataset.card);
  if (!m) return; // the game prefers the framework's "pick the destination" selection
  e.stopPropagation(); e.preventDefault();
  C.lastTap = { t: now, x: e.clientX, y: e.clientY };
  T.fire(m);
}
function onDbl(e) { e.preventDefault(); }
function onKey(e) {
  if (!document.querySelector('#cb-play.sol') || document.querySelector('.modal-wrap') || document.querySelector('#cb-over > *') || e.defaultPrevented) return;
  if (e.target?.closest?.('input, textarea, select')) return;
  const k = e.key.toLowerCase();
  if (e.ctrlKey || e.metaKey) { if (k === 'z') { e.preventDefault(); act('undo'); } return; }
  if (k === 'u' || k === 'backspace') { e.preventDefault(); act('undo'); }
  else if (k === 'h') { e.preventDefault(); act('hint'); }
  else if (k === 'n') { e.preventDefault(); act('new'); }
  else if (k === 'd') { const m = (W()?.legal() || []).find((x) => x.act === 'draw' || x.act === 'recycle' || x.act === 'deal'); if (m && canPlay()) { e.preventDefault(); W().table.fire(m); } }
}

// ------------------------------------------------------------------ win celebration: bouncing cards
function celebrate(s) {
  const id = `${s.no}|${s.t0}|${s.moves}`;
  if (C.celebrated.has(id)) return; C.celebrated.add(id);
  try { W()?.table?.say('Vittoria!'); } catch {}
  if (reduced()) return;
  const play = document.getElementById('cb-play'), box = document.getElementById('cb-table'); if (!play || !box) return;
  later(() => {
    const T = W()?.table; if (!T) return;
    const imgs = [...box.querySelectorAll('.ct-card:not(.down) .ct-f')].filter((i) => i.src).slice(-52);
    if (!imgs.length) return;
    const cv = document.createElement('canvas'); cv.className = 'sol-party';
    const r = box.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    cv.width = r.width * dpr; cv.height = r.height * dpr; cv.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px`;
    play.appendChild(cv);
    const g = cv.getContext('2d'); g.scale(dpr, dpr);
    const cw = Math.min(110, (T.M?.cw || 80) * 0.8), chh = cw / 0.7;
    const list = imgs.reverse().map((img, i) => { const b = img.closest('.ct-card').getBoundingClientRect(); return { img, x: b.left - r.left, y: b.top - r.top, vx: (Math.random() * 4 + 2) * (Math.random() < 0.5 ? -1 : 1), vy: -Math.random() * 6 - 2, t: i * 7 }; });
    let f = 0; const stop = () => { cancelAnimationFrame(C.raf); cv.remove(); };
    cv.addEventListener('pointerdown', stop);
    const stepF = () => {
      f++;
      for (const c of list) {
        if (f < c.t) continue;
        c.vy += 0.42; c.x += c.vx; c.y += c.vy;
        if (c.y + chh > r.height) { c.y = r.height - chh; c.vy *= -0.72; }
        if (c.x > -cw && c.x < r.width) g.drawImage(c.img, c.x, c.y, cw, chh);
      }
      if (f < 420) C.raf = requestAnimationFrame(stepF); else { cv.style.transition = 'opacity .6s'; cv.style.opacity = '0'; setTimeout(stop, 700); }
    };
    C.raf = requestAnimationFrame(stepF);
  }, 250);
}

// ------------------------------------------------------------------ style (injected once)
function injectStyle() {
  if (document.getElementById('sol-style')) return;
  const st = document.createElement('style'); st.id = 'sol-style';
  st.textContent = `
.cb-play.sol .cb-score, .cb-play.sol .ct-seat, .cb-play.sol #cb-undo { display: none !important; }
.cb-play.sol .ct-card.ok .ct-f { box-shadow: 0 1px 2px rgba(0,0,0,.35), 0 3px 8px rgba(0,0,0,.28); }
.cb-play.sol .ct-card.ok:hover .ct-lift, .cb-play.sol .ct-card.ok:focus-visible .ct-lift { transform: translateY(-3%); }
.cb-play.sol .ct-card.ok:focus-visible .ct-f, .cb-play.sol .ct-card.sel .ct-f { box-shadow: 0 0 0 3px #fff, 0 0 14px 3px rgba(255,210,63,.8); }
.cb-play.sol .ct-card.sel .ct-lift { transform: translateY(-4%); }
.cb-play.sol .ct-card.sol-hint .ct-f { box-shadow: 0 0 0 3px #5ec8ff, 0 0 22px 6px rgba(94,200,255,.85) !important; animation: solPulse .9s ease-in-out infinite alternate; }
.cb-play.sol .ct-card.sol-hint-to .ct-f { box-shadow: 0 0 0 3px #7dff9a, 0 0 18px 4px rgba(125,255,154,.7) !important; }
.cb-play.sol .ct-pile.sol-hint-to { visibility: visible !important; border: 2px solid #7dff9a; box-shadow: 0 0 18px rgba(125,255,154,.6); }
@keyframes solPulse { to { filter: brightness(1.12); } }
.cb-play.sol .ct-pile.outline { border-color: rgba(255,255,255,.22); }
.cb-play.sol .ct-pile.sol-found::before { content: 'A'; position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font: 800 calc(var(--cw) * .42)/1 var(--display, serif); color: rgba(255,255,255,.16); }
.cb-play.sol .ct-acts { left: auto; right: 12px; bottom: 12px; transform: none; }
.cb-play.sol .ct-lbl { bottom: auto; top: 3px; transform: translate(-50%, 0); font-size: 11px; padding: 0 6px; opacity: .85; }
.sol-bar { display: flex; align-items: center; gap: 4px; flex: none; }
.sol-chips { display: flex; gap: 5px; margin-right: 4px; }
.sol-chip { display: inline-flex; align-items: center; gap: 5px; padding: 3px 8px; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.1); border-bottom: 2px solid #2f8a4e; }
.sol-chip .ico { width: 14px; height: 14px; opacity: .8; }
.sol-chip i { font-style: normal; font-size: 11px; color: var(--muted, #9aa); text-transform: uppercase; letter-spacing: .06em; }
.sol-chip b { font-family: var(--display, sans-serif); font-size: 17px; line-height: 1; font-variant-numeric: tabular-nums; }
.sol-bar .icon-btn[disabled] { opacity: .35; pointer-events: none; }
.sol-tip { position: absolute; left: 50%; bottom: 14px; transform: translate(-50%, 20px); z-index: 600; padding: 8px 14px; background: rgba(8,12,10,.92); border: 1px solid rgba(94,200,255,.6); color: #fff; font-size: 14px; max-width: calc(100vw - 24px); text-align: center; opacity: 0; pointer-events: none; transition: opacity .2s, transform .2s; }
.sol-tip.on { opacity: 1; transform: translate(-50%, 0); }
.sol-dead { position: absolute; left: 50%; top: 60px; transform: translateX(-50%); z-index: 610; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; justify-content: center; padding: 8px 12px; background: rgba(40,10,10,.92); border: 1px solid rgba(255,107,138,.6); max-width: calc(100vw - 24px); }
.sol-dead[hidden] { display: none; }
.sol-party { position: fixed; z-index: 900; cursor: pointer; }
.sol-menu { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 8px; margin-top: 12px; }
.sol-menu .btn { justify-content: flex-start; }
.sol-num { display: flex; gap: 8px; margin-top: 12px; }
.sol-num input { flex: 1; min-width: 0; font-size: 22px; padding: 8px 12px; background: var(--s2, #111); color: var(--text, #fff); border: 1px solid var(--line2, #333); }
@media (max-width: 760px) { .sol-chip i { display: none; } .sol-chip { padding: 3px 6px; } .sol-chip b { font-size: 15px; } .cb-play.sol .cb-hud-t span { display: none; } }
@media (max-width: 480px) { .cb-play.sol .cb-hud-t > * { display: none !important; } .sol-chip.sc { display: none; } .cb-play.sol .cb-hud { gap: 2px; padding: 0 4px; } .sol-bar .icon-btn { width: 38px; min-width: 38px; padding: 0; } .cb-play.sol .cb-hud-t b { font-size: 14px; } }
`;
  document.head.appendChild(st);
}
