// Carte Baso — the card-games collection: home (every plug-in game in src/carte/games), lobby (players,
// CPU level, target, deck), the generic table that runs any plug-in, round and match results, stats,
// the shop (card backs and table felts for coins) and the rules. See src/carte/README.md.
import { App, registerScreen } from '../app.js';
import { icon } from '../ui/icons.js';
import { esc, pageHead } from '../ui/dom.js';
import { sfx } from '../ui/audio.js';
import { getSettings } from '../engine/state.js';
import { CARD_GAMES, gameById } from '../carte/core/registry.js';
import { cbLoad, cbSave, gameStats } from '../carte/core/store.js';
import { CardTable } from '../carte/core/table.js';
import { faceURL, backURL, BACKS, TABLES, tableOf } from '../carte/core/art.js';
import { DECKS, FACE_STYLES, clone } from '../carte/core/cards.js';
import { LEVELS, newMatch, legalFor, play, aiMove, endRound, nextRound, sideOf, sideName, humanSeats, variantOf, playersRange, usesTeams } from '../carte/core/match.js';
import { snd, setVolume } from '../carte/core/sound.js';
import '../carte/carte.css';

const CPU_NAMES = ['Nonna Pina', 'Zio Totò', 'Don Ciccio', 'Rosetta', 'Compare Alfio', 'Zia Concetta'];
const SIDE_COLORS = ['#ffd23f', '#5ec8ff', '#ff6b8a', '#7dff9a', '#c59bff', '#ffa94d'];
const V = { view: 'home', gameId: null, from: 'launcher', tab: 'giochi', M: null, table: null, viewer: 0, busy: false, timers: [], token: 0, choose: null, paused: false };
const fmt = (n) => Math.round(n || 0).toLocaleString('it-IT');
const levelOf = (id) => LEVELS.find((l) => l.id === id) || LEVELS[1];
const volume = () => { const s = getSettings(); return s.sound === false ? 0 : 0.7 * (s.volume ?? 0.5) / 0.5; };
const later = (fn, ms) => { const t = setTimeout(fn, ms); V.timers.push(t); return t; };
const clearTimers = () => { V.timers.forEach(clearTimeout); V.timers = []; };
const fast = () => !!window.__carteFast; // tests: no waits

// ------------------------------------------------------------------ lobby config
function lobbyCfg(game, p = cbLoad()) {
  const L = p.lobby[game.id] || {};
  const variant = variantOf(game, L.variant)?.id ?? null;
  const [lo, hi] = playersRange(game, variant);
  const n = Math.max(lo, Math.min(hi, L.n || lo));
  const kinds = Array.from({ length: n }, (_, i) => (i === 0 ? 'human' : L.kinds?.[i] === 'human' ? 'human' : 'cpu'));
  const targets = game.targets || [{ v: 11, label: '11 punti' }, { v: 21, label: '21 punti' }, { v: 31, label: '31 punti' }];
  const target = targets.some((t) => t.v === L.target) ? L.target : (game.defaultTarget ?? targets[0].v);
  const options = {};
  for (const o of game.options || []) options[o.id] = L.options && o.id in L.options ? L.options[o.id] : o.default;
  const deck = game.decks?.[0] || 'it40';
  return { variant, n, kinds, level: L.level || 'normale', target, targets, options, deck, style: p.style[deck] || DECKS[deck].styles[0] };
}
function saveLobby(game, patch) { const p = cbLoad(); p.lobby[game.id] = { ...(p.lobby[game.id] || {}), ...patch }; cbSave(p); }
function seatsFor(cfg) {
  let cpu = 0, hum = 1;
  return cfg.kinds.map((k, i) => (i === 0 ? { kind: 'human', name: cfg.kinds.filter((x) => x === 'human').length > 1 ? 'Giocatore 1' : 'Tu' } : k === 'human' ? { kind: 'human', name: `Giocatore ${++hum}` } : { kind: 'cpu', name: CPU_NAMES[cpu++ % CPU_NAMES.length], level: cfg.level }));
}

// ------------------------------------------------------------------ menus
const fan = (cards, style) => `<span class="cb-fan">${cards.map((c, i) => `<img src="${faceURL(c, style)}" alt="" style="--i:${i - (cards.length - 1) / 2}">`).join('')}</span>`;
function wallet(p) { return `<div class="cb-wallet"><div class="w-k">Monete</div><b>${icon('coin')} ${fmt(p.coins)}</b><div class="w-s">${p.total.played} partite · ${p.total.won} vinte</div></div>`; }
const TABS = [['giochi', 'play', 'Giochi'], ['stats', 'chart', 'Statistiche'], ['negozio', 'palette', 'Dorsi e tavoli']];
function home(p) {
  const tabs = `<nav class="cb-tabs" role="tablist">${TABS.map(([id, ic, name]) => `<button class="cb-tab ${V.tab === id ? 'on' : ''}" role="tab" aria-selected="${V.tab === id}" data-a="cb-tab" data-id="${id}">${icon(ic)}<span>${name}</span></button>`).join('')}</nav>`;
  let body = '';
  if (V.tab === 'giochi') {
    const sv = p.saved && gameById(p.saved.gameId);
    body = `${sv ? `<section class="cb-resume"><div>${fan(sv.thumb || ['1d', '7d', '10c'], p.style[sv.decks?.[0] || 'it40'])}</div><div class="cb-resume-b"><div class="cb-k">Partita in sospeso</div><b>${esc(sv.name)}</b><span>${esc(p.saved.label || '')}</span></div><div class="cb-resume-a"><button class="btn primary" data-a="cb-resume">${icon('play')} Riprendi</button><button class="btn ghost" data-a="cb-drop">${icon('trash')} Abbandona</button></div></section>` : ''}
      <div class="cb-games">${CARD_GAMES.map((g) => { const st = p.stats[g.id]; return `<button class="cb-game" data-a="cb-open" data-id="${g.id}">
        <span class="cb-game-art">${fan(g.thumb || ['1d', '7d', '10c'], p.style[g.decks?.[0] || 'it40'])}</span>
        <span class="cb-game-b"><b>${esc(g.name)}</b><span>${esc(g.short || g.desc || '')}</span><small>${st?.played ? `${st.played} partite · ${st.won} vinte` : `${g.players[0] === g.players[1] ? g.players[0] : `${g.players[0]}-${g.players[1]}`} giocatori · ${esc(DECKS[g.decks?.[0] || 'it40'].name)}`}</small></span></button>`; }).join('')}</div>`;
  } else if (V.tab === 'stats') body = statsView(p);
  else body = shopView(p);
  return `<div class="full-screen cb-menu">${pageHead({ back: 'launcher', backAction: 'cb-hall', eyebrow: 'Baso Hub · Carte', title: 'Carte Baso', sub: 'Scopa, Briscola e gli altri classici da tavolo, contro la CPU o con gli amici sullo stesso schermo.', right: wallet(p) })}${tabs}<div class="cb-body">${body}</div></div>`;
}
function statsView(p) {
  const rows = CARD_GAMES.map((g) => {
    const s = p.stats[g.id]; if (!s?.played) return `<tr><td><b>${esc(g.name)}</b></td><td colspan="5" class="muted">Ancora nessuna partita</td></tr>`;
    const recs = Object.entries(g.records || {}).map(([k, name]) => (s.rec?.[k] != null ? `${esc(name)}: <b>${fmt(s.rec[k])}</b>` : '')).filter(Boolean).join(' · ');
    const lv = LEVELS.map((l) => (s.byLevel?.[l.id]?.played ? `${l.name} ${s.byLevel[l.id].won}/${s.byLevel[l.id].played}` : '')).filter(Boolean).join(' · ');
    return `<tr><td><b>${esc(g.name)}</b>${recs ? `<div class="small muted">${recs}</div>` : ''}</td><td>${s.played}</td><td>${s.won}</td><td>${s.played ? Math.round((s.won / s.played) * 100) : 0}%</td><td>${s.bestStreak || 0}</td><td class="small">${lv}</td></tr>`;
  }).join('');
  return `<div class="cb-statgrid">${[['Partite', p.total.played], ['Vittorie', p.total.won], ['Percentuale', `${p.total.played ? Math.round((p.total.won / p.total.played) * 100) : 0}%`], ['Monete', fmt(p.coins)]].map(([k, v]) => `<div><b>${v}</b><span>${k}</span></div>`).join('')}</div>
    <div class="cb-tablewrap"><table class="cb-stats"><thead><tr><th>Gioco</th><th>Partite</th><th>Vinte</th><th>%</th><th>Serie</th><th>Per livello (vinte/giocate)</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
function shopView(p) {
  const item = (k, it, prev) => { const own = p.owned[k].includes(it.id), on = p[k] === it.id; return `<button class="cb-item ${on ? 'on' : ''}" data-a="cb-buy" data-k="${k}" data-id="${it.id}">${prev}<b>${esc(it.name)}</b><small>${on ? 'In uso' : own ? 'Usa' : `${icon('coin')} ${it.cost}`}</small></button>`; };
  const styles = Object.values(FACE_STYLES).filter((s) => s.deck === 'it40').map((s) => `<button class="cb-item ${p.style.it40 === s.id ? 'on' : ''}" data-a="cb-style" data-id="${s.id}"><span class="cb-prev">${fan(['1d', '7c', '10s'], s.id)}</span><b>${esc(s.name)}</b><small>${p.style.it40 === s.id ? 'In uso' : 'Usa'}</small></button>`).join('');
  return `<h3 class="cb-h">Carte italiane</h3><div class="cb-shop">${styles}</div>
    <h3 class="cb-h">Dorsi</h3><div class="cb-shop">${BACKS.map((b) => item('back', b, `<span class="cb-prev back"><img src="${backURL(b.id, 0.62)}" alt=""></span>`)).join('')}</div>
    <h3 class="cb-h">Tavoli</h3><div class="cb-shop">${TABLES.map((t) => item('table', t, `<span class="cb-prev felt" style="background:${t.bg};border-color:${t.rim}"></span>`)).join('')}</div>
    <p class="cb-note">Le monete si guadagnano vincendo le partite (di più ai livelli alti). Nessun acquisto con soldi veri, nessuna pubblicità.</p>`;
}
function seg(action, list, cur, extra = '') { return `<div class="cb-seg" role="group">${list.map((x) => `<button class="${String(x.v) === String(cur) ? 'on' : ''}" data-a="${action}" data-v="${esc(String(x.v))}" ${extra}>${esc(x.label)}</button>`).join('')}</div>`; }
function lobby(p, game) {
  const c = lobbyCfg(game, p);
  const [lo, hi] = playersRange(game, c.variant);
  const teams = usesTeams(game, { variant: c.variant, n: c.n, options: c.options });
  const seats = seatsFor(c);
  const st = gameStats(p, game.id);
  const opts = (game.options || []).filter((o) => !o.when || o.when({ ...c.options, variant: c.variant, n: c.n })).map((o) => `<div class="cb-row"><label>${esc(o.name)}</label>${seg('cb-opt', o.values, c.options[o.id], `data-id="${o.id}"`)}</div>`).join('');
  const deckStyles = DECKS[c.deck].styles.length > 1 ? `<div class="cb-row"><label>Carte</label>${seg('cb-dstyle', DECKS[c.deck].styles.map((s) => ({ v: s, label: FACE_STYLES[s].name })), c.style)}</div>` : '';
  return `<div class="full-screen cb-menu cb-lobby">${pageHead({ backAction: 'cb-home', eyebrow: 'Carte Baso', title: esc(game.name), sub: esc(game.desc || ''), right: `<div class="cb-lobby-art">${fan(game.thumb || ['1d', '7d', '10c'], c.style)}</div>` })}
    <div class="cb-body cb-lobby-g">
      <section class="cb-panel">
        ${game.variants?.length > 1 ? `<div class="cb-row"><label>Variante</label><div class="cb-vars">${game.variants.map((v) => `<button class="cb-var ${v.id === c.variant ? 'on' : ''}" data-a="cb-variant" data-v="${v.id}"><b>${esc(v.name)}</b><span>${esc(v.desc || '')}</span></button>`).join('')}</div></div>` : ''}
        ${hi > lo ? `<div class="cb-row"><label>Giocatori</label>${seg('cb-n', Array.from({ length: hi - lo + 1 }, (_, i) => ({ v: lo + i, label: String(lo + i) })), c.n)}</div>` : ''}
        <div class="cb-row"><label>Al tavolo${teams ? ' <small>(a coppie: 1 e 3 contro 2 e 4)</small>' : ''}</label><div class="cb-seats">${seats.map((s, i) => `<button class="cb-seatb ${s.kind}" data-a="cb-seat" data-i="${i}" ${i === 0 ? 'aria-disabled="true"' : ''} style="--sc:${SIDE_COLORS[teams ? i % 2 : i]}"><i>${i + 1}</i><b>${esc(s.name)}</b><span>${i === 0 ? 'Tu' : s.kind === 'cpu' ? `CPU · ${levelOf(c.level).name}` : 'Umano (a turno)'}</span></button>`).join('')}</div>
          <p class="cb-note">Tocca un posto per passare da CPU a giocatore umano: con più umani il dispositivo passa di mano e le carte restano coperte finché non sei pronto.</p></div>
        <div class="cb-row"><label>Livello CPU</label>${seg('cb-level', LEVELS.map((l) => ({ v: l.id, label: l.name })), c.level)}</div>
        <div class="cb-row"><label>Partita</label>${seg('cb-target', c.targets, c.target)}</div>
        ${opts}${deckStyles}
        <div class="cb-go"><button class="btn primary lg" data-a="cb-start">${icon('play')} Gioca</button><button class="btn" data-a="cb-rules">${icon('book')} Regole</button></div>
      </section>
      <aside class="cb-panel cb-side"><h3 class="cb-h">I tuoi numeri</h3>
        <div class="cb-statgrid sm">${[['Partite', st.played], ['Vinte', st.won], ['Serie migliore', st.bestStreak || 0]].map(([k, v]) => `<div><b>${v}</b><span>${k}</span></div>`).join('')}</div>
        ${Object.entries(game.records || {}).map(([k, name]) => `<div class="cb-rec"><span>${esc(name)}</span><b>${st.rec?.[k] != null ? fmt(st.rec[k]) : '—'}</b></div>`).join('')}
        <div class="cb-rules-mini">${game.rules || ''}</div></aside>
    </div></div>`;
}

// ------------------------------------------------------------------ play
function playShell(game) {
  return `<div class="cb-play" id="cb-play"><header class="cb-hud">
      <button class="btn icon-btn ghost ph-back" data-a="cb-pause" aria-label="Pausa" data-tip="Pausa (Esc)">${icon('pause')}</button>
      <div class="cb-hud-t"><b>${esc(game.name)}</b><span id="cb-status"></span></div>
      <div class="cb-score" id="cb-score"></div>
      <button class="btn icon-btn ghost" data-a="cb-undo" id="cb-undo" aria-label="Annulla" data-tip="Annulla la mossa (U)" hidden>${icon('replay')}</button>
      <button class="btn icon-btn ghost" data-a="cb-rules" aria-label="Regole" data-tip="Regole">${icon('help')}</button>
    </header><div class="cb-tablebox"><div class="cb-tableroot" id="cb-table"></div></div><div class="cb-over" id="cb-over"></div></div>`;
}
const G = () => gameById(V.M?.gameId);
function hud() {
  const M = V.M, g = G(); if (!M || !g) return;
  const st = document.getElementById('cb-status'); if (st) st.textContent = g.status?.(M.state, V.viewer) || `Smazzata ${M.round + 1}`;
  const sc = document.getElementById('cb-score');
  if (sc) sc.innerHTML = M.teams.map((t, i) => `<span class="cb-chip" style="--sc:${SIDE_COLORS[i]}"><i></i><em>${esc(sideName(M, i))}</em><b>${fmt(M.totals[i])}</b></span>`).join('') + `<span class="cb-target">${esc((g.targets || []).find((x) => x.v === M.cfg.target)?.label || `a ${M.cfg.target}`)}</span>`;
  const u = document.getElementById('cb-undo'); if (u) u.hidden = !canUndo();
}
function canUndo() {
  const M = V.M, g = G(); if (!M || !g || !M.undo.length || V.busy) return false;
  if (humanSeats(M).length !== 1) return false;
  return g.undo === true || (g.undo === 'facile' && M.cfg.level === 'facile');
}
function seatInfo(M, view) {
  const s = M.state, teams = M.teams.length < M.cfg.n;
  return M.cfg.seats.map((seat, p) => ({
    name: esc(seat.name), color: SIDE_COLORS[teams ? sideOf(M, p) : p],
    active: s.turn === p && !G().isOver(s), think: s.turn === p && seat.kind === 'cpu' && V.thinking,
    sub: view?.seats?.[p]?.sub || '',
  }));
}
function draw(state = V.M.state, { instant = false, legal = [] } = {}) {
  const M = V.M, g = G(); if (!V.table || !M) return;
  const partnerOf = (p) => { const t = M.teams[sideOf(M, p)]; return t.find((q) => q !== p) ?? -1; };
  const view = g.view(state, V.viewer, { partnerOf, seats: M.cfg.seats, n: M.cfg.n, portrait: V.table.portrait() });
  view.seats = seatInfo({ ...M, state }, view);
  V.table.render(view, { n: M.cfg.n, viewer: V.viewer, legal, instant });
  hud();
}
function persist() {
  const M = V.M, g = G(); if (!M || !g) return;
  const p = cbLoad();
  p.saved = M.over ? null : { gameId: M.gameId, M, viewer: V.viewer, label: `${variantOf(g, M.cfg.variant)?.name || ''} · ${M.teams.map((_, i) => `${sideName(M, i)} ${M.totals[i]}`).join(' – ')}` };
  cbSave(p);
}
function startMatch(game, M) {
  V.M = M; V.view = 'play'; V.gameId = game.id; V.lastHuman = null;
  V.viewer = humanSeats(M)[0] ?? 0;
  App.refresh();
}
async function mountPlay() {
  const M = V.M, g = G(), box = document.getElementById('cb-table'); if (!M || !g || !box) return;
  const p = cbLoad(), deck = g.decks?.[0] || 'it40';
  setVolume(volume());
  V.table = new CardTable(box, {
    deck, style: M.cfg.style || p.style[deck], back: p.back, table: p.table,
    onMove: (m) => human(m), onChoose: (ms) => chooser(ms), sound: (k) => snd[k]?.(),
  });
  window.__carte = { V, game: g, get M() { return V.M; }, table: V.table, legal: () => legalFor(G(), V.M), play: (m) => human(m) };
  draw(M.state, { instant: false });
  try { snd.shuffle(); } catch {}
  const tk = ++V.token;
  later(() => { if (tk === V.token) loop(); }, fast() ? 0 : Math.min(1600, V.table.dealTime || 600));
}
function loop() {
  const M = V.M, g = G(); if (!M || !g || V.view !== 'play' || V.paused) return;
  const tk = V.token;
  if (g.isOver(M.state)) { roundOver(); return; }
  const p = M.state.turn, seat = M.cfg.seats[p];
  if (seat?.kind === 'cpu') {
    V.busy = true; V.thinking = true; draw(M.state, { instant: true });
    later(() => {
      if (tk !== V.token || V.paused) return;
      let m; try { m = aiMove(g, M, seat.level || M.cfg.level); } catch (e) { console.error(e); m = legalFor(g, M)[0]; }
      V.thinking = false;
      doMove(m);
    }, fast() ? 0 : 520 + Math.random() * 380);
    return;
  }
  // a human: hot-seat hands are hidden behind a pass screen when the device changes hands
  V.busy = false;
  if (humanSeats(M).length > 1 && V.lastHuman !== p) {
    V.viewer = p; V.lastHuman = p;
    passScreen(p); return;
  }
  V.viewer = p; V.lastHuman = p;
  const legal = legalFor(g, M, p);
  if (!legal.length) { console.warn('carte: nessuna mossa legale', g.id); return; }
  draw(M.state, { legal });
  V.table.focusFirst();
}
function passScreen(p) {
  const ov = document.getElementById('cb-over'); if (!ov) return;
  draw(V.M.state, { instant: true });
  ov.innerHTML = `<div class="cb-pass" role="dialog" aria-label="Cambio giocatore"><div class="cb-pass-c">${icon('users')}<div class="cb-k">Passa il dispositivo</div><h2>Tocca a ${esc(V.M.cfg.seats[p].name)}</h2><p>Gli altri non guardino! Le carte si scoprono quando sei pronto.</p><button class="btn primary lg" data-a="cb-ready">${icon('eye')} Sono pronto</button></div></div>`;
  requestAnimationFrame(() => ov.querySelector('.btn.primary')?.focus());
}
function human(m) {
  const M = V.M; if (!M || V.busy) return;
  const p = M.state.turn; if (M.cfg.seats[p]?.kind !== 'human') return;
  doMove(m, true);
}
function doMove(m, byHuman = false) {
  const M = V.M, g = G(); if (!M) return;
  const tk = V.token;
  const before = M.state;
  let stepStates = [];
  try { stepStates = g.steps?.(clone(before), m) || []; } catch (e) { console.warn(e); }
  try { play(g, M, m, { keepUndo: byHuman }); } catch (e) { console.error(e); snd.bad(); loop(); return; }
  V.busy = true;
  try { snd.play(); } catch {}
  const say = M.state.say || null;
  const showFinal = () => {
    if (tk !== V.token) return;
    draw(M.state);
    if (say) { V.table.say(esc(say.text || say), say.cls || ''); try { say.chime ? snd.chime() : snd.collect(); } catch {} }
    else if (stepStates.length) try { snd.collect(); } catch {}
    persist();
    later(() => { if (tk === V.token) { V.busy = false; loop(); } }, fast() ? 0 : say ? 900 : 380);
  };
  let t = 0;
  for (const s of stepStates) { later(() => { if (tk === V.token) draw(s); }, t); t += fast() ? 0 : (s.pause || 650); }
  if (t) later(showFinal, t); else showFinal();
}
function chooser(moves) {
  return new Promise((res) => {
    const ov = document.getElementById('cb-over'); if (!ov) { res(null); return; }
    V.choose = (i) => { ov.innerHTML = ''; V.table?.preview(null); V.choose = null; res(i == null ? null : moves[i]); };
    ov.innerHTML = `<div class="cb-choose" role="dialog" aria-label="Scegli la presa"><div class="cb-k">Scegli</div>${moves.map((m, i) => `<button class="btn ${i === 0 ? 'primary' : ''}" data-a="cb-pick" data-i="${i}" data-show="${esc((m.show || []).join(','))}">${esc(m.label || `Mossa ${i + 1}`)}</button>`).join('')}<button class="btn ghost" data-a="cb-pick" data-i="-1">${icon('x')} Annulla</button></div>`;
    ov.querySelectorAll('[data-show]').forEach((b) => { const f = () => V.table?.preview(b.dataset.show.split(',').filter(Boolean)); b.addEventListener('mouseenter', f); b.addEventListener('focus', f); });
    V.table?.preview(moves[0].show);
    requestAnimationFrame(() => ov.querySelector('.btn.primary')?.focus());
  });
}
function roundOver() {
  const M = V.M, g = G(); if (!M) return;
  const res = endRound(g, M);
  draw(M.state);
  const humanSide = sideOf(M, humanSeats(M)[0] ?? 0), solo = humanSeats(M).length === 1;
  const mult = solo ? levelOf(M.cfg.level).mult : 1;
  let coins = solo ? Math.round((res.coins || 0) * mult) : 0, matchCoins = 0;
  const p = cbLoad(), st = gameStats(p, g.id);
  st.rounds++;
  for (const [k, v] of Object.entries(res.records || {})) if (typeof v === 'number' && (st.rec[k] == null || v > st.rec[k])) st.rec[k] = v;
  if (M.over) {
    const won = M.winner === humanSide, draw2 = M.winner === 'draw';
    st.played++; p.total.played++;
    if (won) { st.won++; p.total.won++; st.streak++; st.bestStreak = Math.max(st.bestStreak, st.streak); } else { st.streak = 0; if (draw2) st.drawn++; else st.lost++; }
    if (solo) { const b = (st.byLevel[M.cfg.level] ||= { played: 0, won: 0 }); b.played++; if (won) b.won++; }
    matchCoins = solo ? Math.round((won ? 40 : draw2 ? 15 : 8) * mult) : 10;
    st.last = { at: Date.now(), won, score: M.totals.slice() };
    p.saved = null;
  }
  p.coins += coins + matchCoins; cbSave(p);
  if (!M.over) persist();
  const tk = V.token;
  later(() => {
    if (tk !== V.token) return;
    const ov = document.getElementById('cb-over'); if (!ov) return;
    const head = M.teams.map((_, i) => `<th style="--sc:${SIDE_COLORS[i]}">${esc(sideName(M, i))}</th>`).join('');
    const rows = res.rows.map((r) => `<tr><td>${esc(r.label)}</td>${r.values.map((v, i) => `<td class="${r.best === i ? 'best' : ''}">${esc(String(v))}</td>`).join('')}</tr>`).join('');
    const title = M.over ? (M.winner === 'draw' ? 'Pareggio' : M.winner === humanSide && solo ? 'Hai vinto la partita!' : solo ? 'Partita persa' : `Vince ${esc(sideName(M, M.winner))}!`) : `Fine smazzata ${M.round + 1}`;
    ov.innerHTML = `<div class="cb-result ${M.over ? 'final' : ''}" role="dialog" aria-label="${esc(title)}"><div class="cb-k">${esc(g.name)} · ${M.over ? 'Fine partita' : `Smazzata ${M.round + 1}`}</div><h2>${title}</h2>
      ${res.note ? `<p class="cb-note">${esc(res.note)}</p>` : ''}
      <div class="cb-tablewrap"><table class="cb-res"><thead><tr><th></th>${head}</tr></thead><tbody>${rows}
      <tr class="pts"><td>Punti della smazzata</td>${res.points.map((v) => `<td>+${v}</td>`).join('')}</tr>
      <tr class="tot"><td>Totale partita</td>${M.totals.map((v, i) => `<td class="${M.over && M.winner === i ? 'best' : ''}">${v}</td>`).join('')}</tr></tbody></table></div>
      ${coins + matchCoins ? `<div class="cb-coins">${icon('coin')} +${coins + matchCoins} monete</div>` : ''}
      <div class="cb-res-a">${M.over ? `<button class="btn primary lg" data-a="cb-again">${icon('replay')} Rivincita</button><button class="btn" data-a="cb-tolobby">${icon('left')} Cambia impostazioni</button>` : `<button class="btn primary lg" data-a="cb-next">${icon('right')} Prossima smazzata</button><button class="btn ghost" data-a="cb-tolobby">Esci</button>`}</div></div>`;
    try { if (M.over) (M.winner === humanSide ? sfx.win : sfx.bad)?.(); else snd.chime(); } catch {}
    requestAnimationFrame(() => ov.querySelector('.btn.primary')?.focus({ preventScroll: true }));
  }, fast() ? 0 : 1100);
}
function pause(on) {
  V.paused = on;
  const ov = document.getElementById('cb-over'); if (!ov) return;
  if (!on) { ov.innerHTML = ''; V.token++; V.busy = false; clearTimers(); loop(); return; }
  V.token++; clearTimers();
  ov.innerHTML = `<div class="cb-pause" role="dialog" aria-label="Pausa"><h2>Pausa</h2><p class="cb-note">La partita è salvata: puoi riprenderla anche più tardi dal menu Carte.</p>
    <button class="btn primary" data-a="cb-resume-play">${icon('play')} Riprendi</button><button class="btn" data-a="cb-rules">${icon('book')} Regole</button><button class="btn ghost" data-a="cb-quit">${icon('left')} Esci al menu</button></div>`;
  requestAnimationFrame(() => ov.querySelector('.btn.primary')?.focus());
}
function rulesModal(game) {
  App.modal(`<div class="cb-k">Regole</div><h2>${esc(game.name)}</h2><div class="cb-rules">${game.rules || '<p>Regole non disponibili.</p>'}</div><div class="row mt24" style="justify-content:flex-end"><button class="btn primary" data-a="close-modal">Ho capito</button></div>`, {}, 'wide');
}
function stopPlay() { V.token++; clearTimers(); V.table?.destroy(); V.table = null; V.busy = false; V.paused = false; V.thinking = false; }

registerScreen({
  id: 'carte', full: true,
  render(params) {
    if (params?.from) V.from = params.from;
    if (params?.game && !params._used) { params._used = 1; const g = gameById(params.game); if (g) { stopPlay(); V.view = 'lobby'; V.gameId = g.id; } }
    if (params?.page && !params._usedP) { params._usedP = 1; stopPlay(); V.view = 'home'; V.tab = params.page; }
    const p = cbLoad();
    if (V.view === 'play' && V.M && G()) return playShell(G());
    if (V.view === 'lobby' && gameById(V.gameId)) return lobby(p, gameById(V.gameId));
    V.view = 'home';
    return home(p);
  },
  mount() {
    if (V.view === 'play') { mountPlay(); return; }
    requestAnimationFrame(() => (document.querySelector('.cb-tab.on, .cb-lobby [data-a="cb-start"]'))?.focus({ preventScroll: true }));
  },
  unmount() { stopPlay(); },
  onKey(e) {
    if (V.view !== 'play' || !V.table || document.querySelector('#cb-over > *')) return;
    if (V.table.key(e)) { e.preventDefault(); return; }
    if ((e.key === 'u' || e.key === 'U' || ((e.ctrlKey || e.metaKey) && e.key === 'z')) && canUndo()) { e.preventDefault(); undo(); }
  },
  actions: {
    'cb-hall'() { stopPlay(); App.go('launcher'); },
    'cb-home'() { stopPlay(); V.view = 'home'; App.refresh(); },
    'cb-tab'(el) { V.tab = el.dataset.id; App.refresh(); },
    'cb-open'(el) { V.gameId = el.dataset.id; V.view = 'lobby'; App.refresh(); },
    'cb-variant'(el) { const g = gameById(V.gameId); const v = variantOf(g, el.dataset.v); const L = cbLoad().lobby[g.id] || {}; const [lo, hi] = v.players || g.players; saveLobby(g, { variant: v.id, n: Math.max(lo, Math.min(hi, L.n || lo)) }); App.refresh(); },
    'cb-n'(el) { saveLobby(gameById(V.gameId), { n: +el.dataset.v }); App.refresh(); },
    'cb-seat'(el) { const i = +el.dataset.i; if (!i) return; const g = gameById(V.gameId), c = lobbyCfg(g); const kinds = c.kinds.slice(); kinds[i] = kinds[i] === 'cpu' ? 'human' : 'cpu'; saveLobby(g, { kinds }); App.refresh(); },
    'cb-level'(el) { saveLobby(gameById(V.gameId), { level: el.dataset.v }); App.refresh(); },
    'cb-target'(el) { const g = gameById(V.gameId); const t = (lobbyCfg(g).targets.find((x) => String(x.v) === el.dataset.v) || {}).v; saveLobby(g, { target: t }); App.refresh(); },
    'cb-opt'(el) { const g = gameById(V.gameId), o = g.options.find((x) => x.id === el.dataset.id), v = o.values.find((x) => String(x.v) === el.dataset.v); saveLobby(g, { options: { ...(cbLoad().lobby[g.id]?.options || {}), [o.id]: v.v } }); App.refresh(); },
    'cb-dstyle'(el) { const p = cbLoad(); p.style.it40 = el.dataset.v; cbSave(p); App.refresh(); },
    'cb-style'(el) { const p = cbLoad(); p.style.it40 = el.dataset.id; cbSave(p); App.refresh(); },
    'cb-buy'(el) {
      const k = el.dataset.k, list = k === 'back' ? BACKS : TABLES, it = list.find((x) => x.id === el.dataset.id), p = cbLoad(); if (!it) return;
      if (p.owned[k].includes(it.id)) { p[k] = it.id; cbSave(p); App.refresh(); return; }
      if (p.coins < it.cost) { sfx.bad?.(); App.toast('Monete insufficienti', `Ti servono ancora ${it.cost - p.coins} monete per «${it.name}». Le guadagni vincendo le partite.`, 'bad'); return; }
      App.confirm(`Sbloccare «${it.name}»?`, `Costa ${it.cost} monete (ne hai ${p.coins}).`, () => { const q = cbLoad(); if (q.coins < it.cost) return; q.coins -= it.cost; q.owned[k].push(it.id); q[k] = it.id; cbSave(q); try { sfx.coin?.(); } catch {} App.refresh(); });
    },
    'cb-rules'() { const g = gameById(V.gameId) || G(); if (g) rulesModal(g); },
    'cb-start'() {
      const g = gameById(V.gameId), c = lobbyCfg(g), p = cbLoad();
      const M = newMatch(g, { variant: c.variant, n: c.n, seats: seatsFor(c), level: c.level, target: c.target, options: c.options, style: c.style, seed: (Date.now() ^ (Math.random() * 1e9)) >>> 0 });
      p.saved = null; cbSave(p);
      startMatch(g, M);
    },
    'cb-resume'() { const p = cbLoad(), s = p.saved, g = s && gameById(s.gameId); if (!g) return; V.gameId = g.id; startMatch(g, s.M); },
    'cb-drop'() { App.confirm('Abbandonare la partita?', 'La partita in sospeso verrà cancellata (non conta come sconfitta).', () => { const p = cbLoad(); p.saved = null; cbSave(p); App.refresh(); }, 'Abbandona', true); },
    'cb-ready'() { document.getElementById('cb-over').innerHTML = ''; loop(); },
    'cb-pick'(el) { V.choose?.(+el.dataset.i < 0 ? null : +el.dataset.i); },
    'cb-pause'() { if (V.view === 'play') pause(!V.paused); },
    'cb-resume-play'() { pause(false); },
    'cb-quit'() { persist(); stopPlay(); V.view = 'lobby'; V.M = null; App.refresh(); },
    'cb-undo'() { undo(); },
    'cb-next'() { const M = V.M, g = G(); document.getElementById('cb-over').innerHTML = ''; nextRound(g, M); V.lastHuman = null; persist(); const tk = ++V.token; clearTimers(); draw(M.state); try { snd.shuffle(); } catch {} later(() => { if (tk === V.token) loop(); }, fast() ? 0 : Math.min(1600, V.table?.dealTime || 600)); },
    'cb-again'() { const M = V.M, g = G(); stopPlay(); startMatch(g, newMatch(g, { ...M.cfg, seed: (Date.now() ^ (Math.random() * 1e9)) >>> 0, dealer: undefined })); },
    'cb-tolobby'() { stopPlay(); V.view = 'lobby'; V.M = null; App.refresh(); },
  },
});
function undo() {
  const M = V.M; if (!canUndo()) return;
  V.token++; clearTimers();
  M.state = M.undo.pop(); V.busy = false;
  persist(); snd.flip();
  loop();
}
