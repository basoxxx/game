// Tavolo Baso — menus (the four games, setup per game, puzzles of the day, practice puzzles, tables and
// piece sets shop, stats) and the full-screen match (src/tavolo/play/*.js own the board, the HUD and the AI).
import { App, registerScreen } from '../app.js';
import { icon } from '../ui/icons.js';
import { esc, pageHead } from '../ui/dom.js';
import { sfx, music } from '../ui/audio.js';
import { gfxTier } from '../ui/quality.js';
import { tvLoad, tvSave, daily, dayNumber } from '../tavolo/store.js';
import { BOARDS, PIECES, boardById, piecesById } from '../tavolo/sets.js';
import { LEVELS } from '../tavolo/chess/ai.js';
import { DAMA_LEVELS } from '../tavolo/dama/core.js';
import { FOUR_LEVELS } from '../tavolo/four/core.js';
import { NAV_LEVELS } from '../tavolo/navale/core.js';
import { MATE2 } from '../tavolo/chess/puzzles.js';
import { pieceIcon, damaIcon } from '../tavolo/play/icons.js';
import '../tavolo/tavolo.css';

const V = { page: 'home', from: 'launcher', playing: false, game: null, cfg: null, ctl: null };
const fmt = (n) => Math.round(n || 0).toLocaleString('it-IT');
export const GAMES = {
  chess: { name: 'Scacchi', ic: 'board', color: '#d9a441', desc: 'Regole complete: arrocco, en passant, promozione, patte per stallo, 50 mosse, ripetizione e materiale. Motore a 6 livelli, suggerimenti, annulla, orologi, PGN e FEN.' },
  dama: { name: 'Dama italiana', ic: 'target', color: '#c0583a', desc: 'Regole italiane: le pedine non mangiano la dama, presa obbligatoria con le priorità (più pezzi, con la dama, più dame, la dama prima). Dama che muove di una casa.' },
  four: { name: 'Quattro in fila', ic: 'chart', color: '#3d7fd9', desc: 'Griglia 7×6: lascia cadere i dischi e allinea quattro in orizzontale, verticale o diagonale prima dell’avversario.' },
  navale: { name: 'Battaglia navale', ic: 'compass', color: '#2aa6a1', desc: 'Schiera cinque navi su 10×10 (trascina e ruota), poi spara a turno. In due: schermo nascosto e passaggio del dispositivo.' },
};
const LV = { chess: LEVELS, dama: DAMA_LEVELS, four: FOUR_LEVELS, navale: NAV_LEVELS };
const isTouch = () => { try { return matchMedia('(pointer: coarse)').matches; } catch { return false; } };

function wallet(d) { return `<div class="tv-wallet"><div class="w-k">Monete</div><b>${icon('coin')} ${fmt(d.coins)}</b><div class="w-s">${d.stats.puzzles} puzzle · serie ${d.stats.streak} giorni</div></div>`; }
function gameArt(id, d) {
  const set = piecesById(d.pieces), th = boardById(d.board);
  if (id === 'chess') return `<div class="tv-art chk" style="--l:${th.light};--d:${th.dark}">${['K', 'Q', 'N'].map((t, i) => pieceIcon(t, i === 1 ? 1 : 0, set)).join('')}</div>`;
  if (id === 'dama') return `<div class="tv-art chk" style="--l:${th.light};--d:${th.dark}">${damaIcon(true, 0, set)}${damaIcon(false, 1, set)}${damaIcon(false, 0, set)}</div>`;
  if (id === 'four') return `<div class="tv-art four">${Array.from({ length: 12 }, (_, i) => `<i style="background:${[set.discs[0], set.discs[1], 'transparent'][(i * 7) % 3]}"></i>`).join('')}</div>`;
  return `<div class="tv-art sea">${'<i></i>'.repeat(16)}<b></b><b class="h"></b></div>`;
}
function home(d) {
  const dl = daily(d), solved = ['chess', 'four', 'navale'].filter((k) => dl[k]?.done).length;
  return `<div class="full-screen tv-menu">
    ${pageHead({ back: V.from, eyebrow: 'Baso Hub · Tavolo', title: 'Tavolo Baso', sub: 'Quattro classici da tavolo su scacchiere 3D di legno e marmo: contro il computer o in due sullo stesso dispositivo, anche con il tablet appoggiato sul tavolo.', right: wallet(d) })}
    <div class="tv-games">${Object.entries(GAMES).map(([id, g]) => { const s = d.stats[id]; return `<button class="tv-game" data-a="tv-game" data-id="${id}" style="--c:${g.color}">${gameArt(id, d)}<b>${g.name}</b><span>${s.played ? `${s.played} partite · ${s.won} vinte` : esc(g.desc.split(':')[0])}</span></button>`; }).join('')}</div>
    <div class="tv-row">
      <button class="tv-wide" data-a="tv-page" data-id="daily" style="--c:#ffd23f">${icon('calendar')}<div><b>Puzzle del giorno</b><span>${solved}/3 risolti oggi · matto in 2, vinci in 3 mosse, flotta nascosta</span></div></button>
      <button class="tv-wide" data-a="tv-page" data-id="shop" style="--c:#b38cff">${icon('palette')}<div><b>Tavoli e pezzi</b><span>${d.owned.boards.length}/${BOARDS.length} scacchiere · ${d.owned.pieces.length}/${PIECES.length} set di pezzi</span></div></button>
    </div>
    <section class="tv-sec"><h3>Le tue statistiche</h3><div class="tv-stats">${Object.entries(GAMES).map(([id, g]) => { const s = d.stats[id], lv = LV[id][s.best]; return `<div><b>${g.name}</b><span>${s.played} partite · ${s.won} V · ${s.drawn} P · ${s.lost} S</span><em>${lv ? `battuto: ${esc(lv.name)}` : 'nessuna vittoria contro il computer'}</em></div>`; }).join('')}</div></section>
    <section class="tv-sec"><h3>Comandi</h3><div class="tv-keys"><span><kbd>Tocco</kbd> / <kbd>clic</kbd> un pezzo poi la casa, oppure trascinalo</span><span><kbd>Frecce</kbd> muovi il cursore · <kbd>Invio</kbd> scegli</span><span><kbd>Controller</kbd> croce o stick + <kbd>A</kbd>, <kbd>B</kbd> menu</span><span><kbd>U</kbd> annulla · <kbd>H</kbd> suggerimento · <kbd>V</kbd> vista · <kbd>Esc</kbd> pausa</span></div></section>
  </div>`;
}
const seg = (a, val, list) => `<div class="tv-seg">${list.map(([v, l, tip]) => `<button class="${String(val) === String(v) ? 'on' : ''}" data-a="${a}" data-v="${v}" ${tip ? `title="${esc(tip)}"` : ''}>${l}</button>`).join('')}</div>`;
function setup(d, id) {
  const g = GAMES[id], o = d.opts[id], cpu = o.mode === 'cpu', saved = d.saved?.[id];
  const levels = LV[id];
  let extra = '';
  if (id === 'chess') extra = `${cpu ? `<div><h3>Colore</h3>${seg('tv-o', o.color, [['w', 'Bianco'], ['b', 'Nero'], ['r', 'A caso']].map(([v, l]) => [v, l]))}</div>` : ''}
    <div><h3>Orologio</h3>${seg('tv-o-clock', o.clock, [[0, 'No'], [1, '3+2'], [2, '5′'], [3, '10′'], [4, '15+10']])}</div>
    ${cpu ? `<div><h3>Suggerimenti</h3>${seg('tv-o-hints', o.hints ? 1 : 0, [[1, 'Sì'], [0, 'No']])}</div>` : ''}`;
  if (id === 'dama' && cpu) extra = `<div><h3>Colore</h3>${seg('tv-o', o.color, [['w', 'Bianco (muove per primo)'], ['b', 'Nero']])}</div>`;
  if (id === 'four' && cpu) extra = `<div><h3>Chi inizia</h3>${seg('tv-o-first', o.first, [[1, 'Tu'], [2, 'Il computer'], [0, 'A caso']])}</div>`;
  if (id === 'navale') extra = `<div><h3>Navi</h3>${seg('tv-o-touch', o.noTouch ? 1 : 0, [[1, 'Non si toccano'], [0, 'Possono toccarsi']])}</div><div><h3>Dopo un colpo a segno</h3>${seg('tv-o-again', o.again ? 1 : 0, [[0, 'Tocca all’altro'], [1, 'Spari ancora']])}</div>`;
  const two = id === 'navale' ? 'Due giocatori · schermo nascosto' : 'Due giocatori · stesso dispositivo';
  return `<div class="full-screen tv-menu">
    ${pageHead({ backAction: 'tv-home', eyebrow: 'Tavolo Baso', title: g.name, sub: g.desc, right: wallet(d) })}
    <section class="tv-sec tv-setup">
      <div><h3>Avversario</h3>${seg('tv-mode', o.mode, [['cpu', 'Computer'], ['2p', two]])}</div>
      ${cpu ? `<div class="tv-full"><h3>Livello</h3><div class="tv-levels">${levels.map((l) => `<button class="tv-lv ${o.level === l.id ? 'on' : ''}" data-a="tv-level" data-v="${l.id}"><b>${esc(l.name)}</b><span>${esc(l.elo ? `Elo ${l.elo}` : l.sub || ['pochi calcoli, qualche distrazione', 'vede le minacce vicine', 'calcola in profondità', 'gioca quasi perfetto'][l.id] || '')}</span>${d.stats[id].best >= l.id ? `<em>${icon('check')} battuto</em>` : ''}</button>`).join('')}</div></div>` : ''}
      ${extra}
      ${!cpu && id !== 'navale' ? `<div><h3>Tablet sul tavolo</h3>${seg('tv-o-flat', d.opts.flat ? 1 : 0, [[0, 'No'], [1, 'Sì: vista dall’alto, lato avversario capovolto']])}</div>` : ''}
      ${!cpu && (id === 'chess' || id === 'dama') && !d.opts.flat ? `<div><h3>Ruota la scacchiera</h3>${seg('tv-o-rotate', o.rotate === false ? 0 : 1, [[1, 'A ogni turno'], [0, 'Mai']])}</div>` : ''}
      <div><h3>Grafica</h3>${seg('tv-o-view', d.opts.view, [['3d', '3D'], ['2d', '2D']])}${gfxTier() === 'low' && d.opts.view === '3d' ? '<small class="tv-note">Qualità Bassa: si gioca in 2D.</small>' : ''}</div>
    </section>
    <div class="tv-go">${saved ? `<button class="btn" data-a="tv-resume">${icon('replay')} Riprendi la partita (${saved.moves?.length || 0} mosse)</button>` : ''}<button class="btn primary big" data-a="tv-start">${icon('play')} Gioca</button></div>
  </div>`;
}
function dailyPage(d) {
  const dl = daily(d), n = dayNumber();
  const p = MATE2[n % MATE2.length], side = / w /.test(p.fen) ? 'Il Bianco' : 'Il Nero';
  const card = (k, title, sub, st, act, c) => `<div class="tv-dcard2" style="--c:${c}"><div class="tv-dk">${icon(GAMES[k].ic)} ${GAMES[k].name}</div><b>${title}</b><span>${sub}</span>${st}<button class="btn ${dl[k]?.done ? '' : 'primary'}" data-a="${act}">${icon('play')} ${dl[k]?.done ? 'Rigioca' : 'Risolvi'}</button></div>`;
  const dt = new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
  return `<div class="full-screen tv-menu">
    ${pageHead({ backAction: 'tv-home', eyebrow: `Tavolo Baso · ${esc(dt)}`, title: 'Puzzle del giorno', sub: 'Tre sfide nuove ogni giorno, uguali per tutti. Il primo successo della giornata vale monete e allunga la serie.', right: wallet(d) })}
    <div class="tv-dailies">
      ${card('chess', `${side} muove e dà matto in 2`, 'Posizione originale verificata dal risolutore: una sola prima mossa vince.', dl.chess?.done ? `<em>${icon('check')} risolto</em>` : '<em>+60 monete</em>', 'tv-daily-chess', GAMES.chess.color)}
      ${card('four', 'Vinci in 3 mosse', 'Una posizione di Quattro in fila: trova la sequenza che costringe alla vittoria, qualunque cosa faccia l’avversario.', dl.four?.done ? `<em>${icon('check')} risolto</em>` : '<em>+40 monete</em>', 'tv-daily-four', GAMES.four.color)}
      ${card('navale', 'La flotta nascosta', 'Stessa flotta per tutti: affondala con meno colpi possibile.', dl.navale?.done ? `<em>${icon('check')} ${dl.navale.best} colpi</em>` : '<em>fino a +60 monete</em>', 'tv-daily-navale', GAMES.navale.color)}
    </div>
    <section class="tv-sec"><h3>Allenamento: matti in 2</h3><p class="tv-note">${MATE2.length} posizioni originali. Ogni puzzle risolto vale 10 monete.</p><div class="tv-plist">${MATE2.slice(0, 48).map((q, i) => `<button class="tv-pz" data-a="tv-pz" data-v="${i}">${i + 1}</button>`).join('')}</div></section>
  </div>`;
}
function shop(d) {
  const set = piecesById(d.pieces);
  return `<div class="full-screen tv-menu">
    ${pageHead({ backAction: 'tv-home', eyebrow: 'Tavolo Baso', title: 'Tavoli e pezzi', sub: 'Le monete si guadagnano solo giocando: vittorie, puzzle e sfide del giorno. Niente pubblicità, niente acquisti.', right: wallet(d) })}
    <section class="tv-sec"><h3>Scacchiere e tavoli</h3><div class="tv-shop">${BOARDS.map((b) => { const own = d.owned.boards.includes(b.id); return `<button class="tv-item ${d.board === b.id ? 'on' : ''} ${own ? '' : 'locked'}" data-a="tv-buy" data-k="boards" data-id="${b.id}"><i class="tv-sw" style="--l:${b.light};--d:${b.dark};--f:${b.frame}"></i><b>${esc(b.name)}</b><small>${esc(b.sub)}</small><span>${own ? (d.board === b.id ? 'In uso' : 'Tuo') : `${icon('coin')} ${b.cost}`}</span></button>`; }).join('')}</div></section>
    <section class="tv-sec"><h3>Set di pezzi</h3><div class="tv-shop">${PIECES.map((p) => { const own = d.owned.pieces.includes(p.id); return `<button class="tv-item ${d.pieces === p.id ? 'on' : ''} ${own ? '' : 'locked'}" data-a="tv-buy" data-k="pieces" data-id="${p.id}"><i class="tv-sw p">${pieceIcon('K', 0, p)}${pieceIcon('Q', 1, p)}<u style="background:${p.discs[0]}"></u><u style="background:${p.discs[1]}"></u></i><b>${esc(p.name)}</b><small>${esc(p.sub)}</small><span>${own ? (d.pieces === p.id ? 'In uso' : 'Tuo') : `${icon('coin')} ${p.cost}`}</span></button>`; }).join('')}</div></section>
    <p class="tv-note">In uso: ${esc(boardById(d.board).name)} · ${esc(set.name)}. I set valgono per tutti e quattro i giochi (i dischi di Quattro in fila prendono i colori del set).</p>
  </div>`;
}

function stop() { try { V.ctl?.dispose(); } catch (e) { console.warn(e); } V.ctl = null; }
function buildCfg(game, extra = {}) {
  const d = tvLoad(), o = d.opts[game];
  return { game, ...o, flat: o.mode === '2p' && d.opts.flat, ...extra };
}
async function startGame(root) {
  const cfg = V.cfg, mods = { chess: () => import('../tavolo/play/chess.js'), dama: () => import('../tavolo/play/dama.js'), four: () => import('../tavolo/play/four.js'), navale: () => import('../tavolo/play/navale.js') };
  const m = await mods[cfg.game]();
  if (!V.playing || !root?.isConnected) return;
  const Ctl = m.ChessGame || m.DamaGame || m.FourGame || m.NavaleGame;
  const ctl = V.ctl = new Ctl(root, cfg, { onExit: (to) => exitGame(to) });
  try { await ctl.start(); } catch (e) { console.error(e); root.innerHTML = `<div class="tv-loading">Impossibile avviare il gioco: ${esc(e.message || String(e))}<br><button class="btn" data-a="tv-home">Indietro</button></div>`; }
}
function exitGame(to) {
  const cfg = V.cfg; stop();
  if (to === 'again') { App.refresh(); return; }
  if (to === 'next-puzzle' && cfg.game === 'chess') { const n = cfg.puzzle?.daily ? Math.floor(Math.random() * MATE2.length) : (cfg.puzzle.n + 1) % MATE2.length; V.cfg = puzzleCfg(n, false); App.refresh(); return; }
  if (to === 'next-puzzle' && cfg.game !== 'chess') { V.playing = false; V.page = 'daily'; App.refresh(); return; }
  V.playing = false;
  V.page = cfg.mode === 'puzzle' || cfg.daily ? 'daily' : cfg.game;
  if (to === 'hub') App.go('launcher'); else App.refresh();
}
function puzzleCfg(n, isDaily) { const p = MATE2[n]; return { game: 'chess', mode: 'puzzle', puzzle: { ...p, n, daily: isDaily }, coords: true }; }

registerScreen({
  id: 'tavolo', full: true,
  render(params) {
    if (params?.from) V.from = params.from;
    if (!params?.page && !V.started) { const q = new URLSearchParams(location.search).get('page'); if (q) params = { ...params, page: q }; }
    V.started = true;
    if (params?.page) { const p = params.page; delete params.page; stop(); V.playing = false; V.page = GAMES[p] || p === 'daily' || p === 'shop' ? p : 'home'; }
    const d = tvLoad();
    if (V.playing) return '<div class="tv-root" id="tv-root"><div class="tv-loading">Si apparecchia il tavolo…</div></div>';
    if (GAMES[V.page]) return setup(d, V.page);
    if (V.page === 'daily') return dailyPage(d);
    if (V.page === 'shop') return shop(d);
    return home(d);
  },
  async mount() {
    try { music.setMood?.('manage'); } catch {}
    if (!V.playing) { requestAnimationFrame(() => document.querySelector('.tv-go .btn.primary, .tv-game, .tv-dcard2 .btn')?.focus({ preventScroll: true })); return; }
    await startGame(document.getElementById('tv-root'));
  },
  unmount() { stop(); V.playing = false; },
  actions: {
    'tv-home'() { stop(); V.playing = false; V.page = 'home'; App.refresh(); },
    'tv-game'(el) { V.page = el.dataset.id; sfx.select?.(); App.refresh(); },
    'tv-page'(el) { V.page = el.dataset.id; App.refresh(); },
    'tv-mode'(el) { const d = tvLoad(); d.opts[V.page].mode = el.dataset.v; tvSave(d); App.refresh(); },
    'tv-level'(el) { const d = tvLoad(); d.opts[V.page].level = +el.dataset.v; tvSave(d); App.refresh(); },
    'tv-o'(el) { const d = tvLoad(); d.opts[V.page].color = el.dataset.v; tvSave(d); App.refresh(); },
    'tv-o-clock'(el) { const d = tvLoad(); d.opts.chess.clock = +el.dataset.v; tvSave(d); App.refresh(); },
    'tv-o-hints'(el) { const d = tvLoad(); d.opts.chess.hints = el.dataset.v === '1'; tvSave(d); App.refresh(); },
    'tv-o-first'(el) { const d = tvLoad(); d.opts.four.first = +el.dataset.v; tvSave(d); App.refresh(); },
    'tv-o-touch'(el) { const d = tvLoad(); d.opts.navale.noTouch = el.dataset.v === '1'; tvSave(d); App.refresh(); },
    'tv-o-again'(el) { const d = tvLoad(); d.opts.navale.again = el.dataset.v === '1'; tvSave(d); App.refresh(); },
    'tv-o-flat'(el) { const d = tvLoad(); d.opts.flat = el.dataset.v === '1'; tvSave(d); App.refresh(); },
    'tv-o-rotate'(el) { const d = tvLoad(); d.opts[V.page].rotate = el.dataset.v === '1'; tvSave(d); App.refresh(); },
    'tv-o-view'(el) { const d = tvLoad(); d.opts.view = el.dataset.v; tvSave(d); App.refresh(); },
    'tv-start'() { const d = tvLoad(); if (d.saved?.[V.page]) { delete d.saved[V.page]; tvSave(d); } V.cfg = buildCfg(V.page); V.playing = true; sfx.ok?.(); App.refresh(); },
    'tv-resume'() { const d = tvLoad(); const s = d.saved?.[V.page]; if (!s) return; V.cfg = buildCfg(V.page, { resume: s }); V.playing = true; App.refresh(); },
    'tv-daily-chess'() { V.cfg = puzzleCfg(dayNumber() % MATE2.length, true); V.playing = true; App.refresh(); },
    'tv-daily-four'() { V.cfg = { game: 'four', mode: 'puzzle', daily: true }; V.playing = true; App.refresh(); },
    'tv-daily-navale'() { const d = tvLoad(); V.cfg = { game: 'navale', mode: 'daily', daily: true, noTouch: true, level: d.opts.navale.level }; V.playing = true; App.refresh(); },
    'tv-pz'(el) { V.cfg = puzzleCfg(+el.dataset.v, false); V.playing = true; App.refresh(); },
    'tv-buy'(el) {
      const k = el.dataset.k, id = el.dataset.id, d = tvLoad(), it = (k === 'boards' ? BOARDS : PIECES).find((x) => x.id === id); if (!it) return;
      const field = k === 'boards' ? 'board' : 'pieces';
      if (d.owned[k].includes(id)) { d[field] = id; tvSave(d); sfx.select?.(); App.refresh(); return; }
      if (d.coins < it.cost) { sfx.bad?.(); App.toast('Monete insufficienti', `Ti servono ancora ${it.cost - d.coins} monete per «${it.name}». Si guadagnano vincendo e risolvendo i puzzle.`, 'bad'); return; }
      App.confirm(`Sbloccare «${it.name}»?`, `Costa ${it.cost} monete (ne hai ${d.coins}).`, () => { const q = tvLoad(); if (q.coins < it.cost) return; q.coins -= it.cost; q.owned[k].push(id); q[field] = id; tvSave(q); try { sfx.coin?.(); } catch {} App.refresh(); });
    },
  },
});
void isTouch;
