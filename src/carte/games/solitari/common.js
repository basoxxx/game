// Solitari (Carte Baso) — shared plumbing for the one-player games (Klondike, Spider, FreeCell,
// Piramide). Each game is an ENGINE (pure rules over JSON state + solver + layout); makeSolitaire()
// turns it into a Carte Baso plug-in (src/carte/README.md):
//   - deal NUMBERS (1..1 000 000, our own numbering), "Solitario del giorno" (same deal for everyone,
//     from the date), "solo partite vincibili" (the solver vets the deal; deterministic budget);
//   - UNLIMITED undo by replay: the state keeps the move log, undo re-deals the number and replays;
//   - timer / moves / score, auto-complete (one move whose steps() animate card by card), safe
//     auto-moves to the foundations (FreeCell), resign, new deal, restart, deal by number;
//   - the browser controller (./ui.js, loaded lazily, never in node) adds the toolbar, hints,
//     tap-to-auto-move, double click, keyboard, stats and the win celebration.
import { clone, seedOf } from '../../core/cards.js';

export const MAXNO = 1000000;
// shared with ./ui.js (browser only): table size for the layout, a deal number requested from the UI
export const ui = { dims: null, pending: null, hook: null, loading: null };
const pad2 = (n) => String(n).padStart(2, '0');
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const dailyStart = (gameKey, key = dayKey()) => (seedOf(`baso-solitario-del-giorno|${gameKey}|${key}`) % MAXNO) + 1;
export const wrapNo = (n) => ((((n - 1) % MAXNO) + MAXNO) % MAXNO) + 1;
export const fmtClock = (ms) => { const s = Math.floor((ms || 0) / 1000); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}:${pad2(m)}:${pad2(s % 60)}` : `${m}:${pad2(s % 60)}`; };

// the framework's base card height (src/carte/core/table.js metrics) — only a fallback: the
// controller reads the real one from the table and stores it in ui.dims
function baseCh(W, H) {
  const portrait = H > W * 1.05;
  const ch = Math.min(H * (portrait ? 0.17 : H < 520 ? 0.25 : 0.215), (W / 0.7) * (portrait ? 0.25 : 0.15));
  return Math.max(64, Math.min(230, ch));
}
export function dims() {
  let d = ui.dims;
  if (typeof document !== 'undefined') { // measure now: the first render must already be right (deal animation)
    const box = document.getElementById('cb-table');
    if (box?.clientWidth && box.clientHeight && (!d || d.W !== box.clientWidth || d.H !== box.clientHeight)) d = ui.dims = { W: box.clientWidth, H: box.clientHeight, ch: baseCh(box.clientWidth, box.clientHeight) };
  }
  d ||= { W: 1180, H: 760 };
  return { W: d.W, H: d.H, ch: d.ch || baseCh(d.W, d.H), portrait: d.H > d.W * 1.05 };
}
// a free pile placed in table pixels; cw = wanted card width in px
export function pileAt(D, id, cards, x, y, cw, extra = {}) {
  return { id, cards, anchor: 'table', x: x / D.W, y: y / D.H, scale: cw / (D.ch * 0.7), ...extra };
}
const MOVE_KEYS = ['card', 'to', 'act', 'no', 'from'];
const slim = (m) => { const o = {}; for (const k of MOVE_KEYS) if (m[k] != null) o[k] = m[k]; return o; };

// E: engine. { key, name(eo), opts(o) -> eo, deal(no, eo) -> s, moves(s), apply(s, m) (may mutate s, returns s),
//   won(s), auto?(s) -> m|null (safe auto-move), canFinish?(s), finish?(s) -> m|null, pick?(no, eo) -> no (winnable),
//   bonus?(s) -> points at the win, view(s, D) -> { piles, hl }, hint?(s) -> { move, text }, scoreLabel }
export function makeSolitaire(E, meta, def = {}) {
  const now = () => Date.now();
  function fresh(no, eo, extra = {}) {
    const s = E.deal(no, eo);
    if (E.auto && eo.auto !== false) for (let g = 0; g < 60; g++) { const a = E.auto(s); if (!a) break; E.apply(s, a); }
    return Object.assign(s, { n: 1, turn: 0, teams: [[0]], no, eo, log: [], moves: 0, el: 0, ts: 0, t0: 0, over: null, ...extra });
  }
  // one human move + the safe auto-moves that follow it (FreeCell); returns the snapshots in between
  function step(s, m, snaps) {
    E.apply(s, m);
    s.moves++;
    if (E.auto && s.eo.auto !== false) {
      for (let g = 0; g < 60; g++) { const a = E.auto(s); if (!a) break; if (snaps) snaps.push(clone(s)); E.apply(s, a); }
    }
    if (E.won(s)) s.over = 'won';
    else if (E.dead?.(s)) s.dead = true;
    return s;
  }
  function replay(s, log) {
    const keep = { el: s.el, ts: s.ts, t0: s.t0, mode: s.mode, daily: s.daily, uid: s.uid };
    let r = fresh(s.no, s.eo, keep);
    for (const m of log) { step(r, m); r.log.push(m); }
    return r;
  }
  function tick(s) { // timer: wall time between moves, idle gaps capped at one minute
    const t = now();
    if (!s.t0) { s.t0 = t; s.ts = t; }
    s.el = (s.el || 0) + Math.max(0, Math.min(60000, t - (s.ts || t)));
    s.ts = t;
  }
  function nextNo(s) { return wrapNo(((seedOf(`${s.uid}|${s.no}|${s.moves}|${s.el}`)) % MAXNO) + 1); }
  function setup(seed, opts = {}) {
    const eo = E.opts({ ...opts });
    const mode = opts.partita || def.defaultMode || 'casuale';
    let no, daily = null;
    if (mode === 'giorno') { daily = dayKey(); no = dailyStart(`${E.key}|${E.variantKey?.(eo) || ''}`, daily); if (E.pick) no = E.pick(no, eo); }
    else { no = (seed % MAXNO) + 1; if (E.pick && (mode === 'vincibile' || def.alwaysPick)) no = E.pick(no, eo); }
    return fresh(no, eo, { mode, daily, uid: `${seed}` });
  }
  function legalMoves(s) {
    if (s.over) return [];
    const out = E.moves(s).slice();
    if (s.log.length) out.push({ act: 'undo' });
    out.push({ act: 'restart' }, { act: 'new' }, { act: 'resign' });
    if (E.canFinish?.(s)) out.push({ act: 'auto' });
    if (ui.pending) out.push({ act: 'deal', no: ui.pending.no, mode: ui.pending.mode || 'numero' });
    return out;
  }
  function apply(s0, m) {
    if (m.act === 'undo') { const r = replay(s0, s0.log.slice(0, -1)); r.undone = (s0.undone || 0) + 1; return r; }
    if (m.act === 'restart') return fresh(s0.no, s0.eo, { mode: s0.mode, daily: s0.daily, uid: `${s0.uid}r` });
    if (m.act === 'new') { const eo = s0.eo; let no = nextNo(s0); if (E.pick && (s0.mode === 'vincibile' || def.alwaysPick)) no = E.pick(no, eo); return fresh(no, eo, { mode: s0.mode === 'giorno' || s0.mode === 'numero' ? 'casuale' : s0.mode, uid: `${s0.uid}n` }); }
    if (m.act === 'deal') { const daily = m.mode === 'giorno' ? dayKey() : null; return fresh(wrapNo(m.no), s0.eo, { mode: m.mode || 'numero', daily, uid: `${s0.uid}d${m.no}` }); }
    const s = clone(s0);
    if (m.act === 'resign') { s.over = 'lost'; return s; }
    tick(s);
    if (m.act === 'auto') { autoFinish(s); return s; }
    step(s, m); s.log.push(slim(m));
    return s;
  }
  function autoFinish(s, snaps) {
    for (let g = 0; g < 200 && !E.won(s); g++) {
      const f = E.finish(s); if (!f) break;
      E.apply(s, f); s.log.push(slim(f)); s.moves++;
      if (snaps) { const c = clone(s); c.pause = 85; snaps.push(c); }
    }
    if (E.won(s)) s.over = 'won';
  }
  function steps(s0, m) {
    if (!m || m.act) {
      if (m?.act !== 'auto') return [];
      const s = clone(s0), snaps = []; autoFinish(s, snaps); snaps.pop(); return snaps;
    }
    const snaps = [];
    step(clone(s0), m, snaps);
    return snaps.map((x) => { x.pause = 150; return x; });
  }
  const finalScore = (s) => (s.score || 0) + (s.over === 'won' ? (E.bonus?.(s) || 0) : 0);
  function scores(s) {
    const won = s.over === 'won', sc = finalScore(s);
    return {
      points: [won ? 1 : 0],
      rows: [
        { label: 'Partita', values: [`n° ${s.no}${s.daily ? ' (del giorno)' : ''}`] },
        { label: 'Mosse', values: [s.moves] },
        { label: 'Tempo', values: [fmtClock(s.el)] },
        ...(E.scoreLabel ? [{ label: E.scoreLabel, values: [sc] }] : []),
      ],
      records: won ? { punti: sc, vittorie: 1 } : {},
      coins: won ? (def.coins || 20) : 0,
      note: won ? (s.daily ? 'Solitario del giorno completato!' : 'Tutte le carte sono al loro posto.') : 'Ti sei arreso: la prossima andrà meglio.',
    };
  }
  function view(s, viewer, ctx) {
    const D = dims(), v = E.view(s, D);
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      if (ui.hook) ui.hook(game, s);
      else if (!ui.loading) ui.loading = import('./ui.js').then((m) => { m.install(); ui.hook?.(game, s); }).catch((e) => console.warn('solitari ui', e));
    }
    return { size: 1, ...v };
  }
  function status(s) {
    const tag = s.daily ? 'Solitario del giorno' : `Partita n° ${s.no}`;
    return `${E.name(s.eo)} · ${tag}`;
  }
  const game = {
    ...meta,
    players: [1, 1], decks: ['fr52'], undo: false, solitaire: true,
    targets: [{ v: 1, label: 'Una partita' }], defaultTarget: 1,
    records: { punti: E.scoreLabel ? `${E.scoreLabel} migliore` : 'Punteggio migliore' },
    setup, legalMoves, apply, steps, isOver: (s) => !!s.over, scores, view, status,
    // CPU (only the framework's headless tests use it): the engine's quick greedy move, then gives up
    ai: (s, p, level, r) => (s.moves > (def.aiMoves || 350) ? { act: 'resign' } : (E.canFinish?.(s) ? { act: 'auto' } : E.ai?.(s, r) || { act: 'resign' })),
    matchOver: (totals) => (totals[0] > 0 ? 0 : 1),
    engine: E, fresh, step, replay, finalScore,
    ...def.extra,
  };
  return game;
}
// options shared by all the solitaires (lobby)
export const DEAL_OPTION = (winnable = true) => ({
  id: 'partita', name: 'Mescolata',
  values: [{ v: 'casuale', label: 'Casuale' }, ...(winnable ? [{ v: 'vincibile', label: 'Solo vincibili' }] : []), { v: 'giorno', label: 'Del giorno' }],
  default: 'casuale',
});
