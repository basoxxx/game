// Carte Baso — the match controller: a game plug-in plays ROUNDS (one deal / "smazzata"), the match
// adds up the points of each side until the target. Pure JS and JSON state: the screen saves it to
// resume later, and tools/carte-test.mjs drives it headless (AI vs AI).
import { clone, seedOf, rng, defaultTeams } from './cards.js';

export const LEVELS = [
  { id: 'facile', name: 'Facile', mult: 1 },
  { id: 'normale', name: 'Normale', mult: 1.5 },
  { id: 'difficile', name: 'Difficile', mult: 2.2 },
];
const NOISE = new Set(['label', 'show', 'primary', 'tail', 'hint']);
// canonical move key: two moves are the same if all their fields except the cosmetic ones match
export function moveKey(m) {
  if (!m || typeof m !== 'object') return String(m);
  return JSON.stringify(Object.keys(m).filter((k) => !NOISE.has(k) && m[k] !== undefined).sort().map((k) => [k, m[k]]));
}
export const findLegal = (legal, m) => { const k = moveKey(m); return legal.find((x) => moveKey(x) === k) || null; };

export const variantOf = (game, id) => game.variants?.find((v) => v.id === id) || game.variants?.[0] || null;
export function playersRange(game, variant) { const v = variantOf(game, variant); return v?.players || game.players || [2, 2]; }
export const usesTeams = (game, cfg) => { const v = variantOf(game, cfg.variant); return !!(typeof v?.teams === 'function' ? v.teams(cfg) : v?.teams ?? (typeof game.teams === 'function' ? game.teams(cfg) : game.teams && cfg.n === 4)); };

// cfg: { variant, n, seats: [{ kind: 'human'|'cpu', name, level }], target, deck, options: {}, seed }
export function newMatch(game, cfg) {
  const n = cfg.n || cfg.seats?.length || playersRange(game, cfg.variant)[0];
  const teams = defaultTeams(n, usesTeams(game, { ...cfg, n }));
  const M = {
    gameId: game.id, cfg: { ...cfg, n }, seed: seedOf(cfg.seed ?? Date.now()), round: 0,
    dealer: cfg.dealer ?? (seedOf(cfg.seed ?? 1) % n), teams, totals: teams.map(() => 0), rounds: [], state: null, undo: [], over: false, winner: -1, moves: 0,
  };
  startRound(game, M);
  return M;
}
export function roundOpts(game, M) {
  const c = M.cfg;
  return { ...(c.options || {}), n: c.n, variant: c.variant ?? game.variants?.[0]?.id, teams: M.teams.length < c.n, target: c.target, dealer: M.dealer, round: M.round, totals: M.totals.slice(), deck: c.deck };
}
export function startRound(game, M) {
  M.state = game.setup((M.seed + M.round * 7919) >>> 0, roundOpts(game, M));
  if (M.state.n == null) M.state.n = M.cfg.n;
  M.state.teams ||= M.teams;
  M.undo = []; M.roundDone = false;
  return M.state;
}
export const legalFor = (game, M, p = M.state.turn) => (p == null || p < 0 || game.isOver(M.state) ? [] : game.legalMoves(M.state, p) || []);
// play a move for the player whose turn it is; throws on an illegal one (tests rely on that)
export function play(game, M, move, { keepUndo = false } = {}) {
  const p = M.state.turn, legal = legalFor(game, M, p);
  const m = findLegal(legal, move);
  if (!m) throw new Error(`${game.id}: mossa illegale ${moveKey(move)} per il giocatore ${p}`);
  if (keepUndo) { M.undo.push(clone(M.state)); if (M.undo.length > 60) M.undo.shift(); }
  M.state = game.apply(M.state, m);
  M.moves++;
  return m;
}
// AI move for the player on turn (level: 'facile'|'normale'|'difficile')
export function aiMove(game, M, level, seed) {
  const p = M.state.turn;
  const r = rng(seed ?? ((M.seed ^ (M.moves * 2654435761)) >>> 0));
  const m = game.ai(clone(M.state), p, level, r);
  const legal = legalFor(game, M, p);
  return findLegal(legal, m) || legal[0];
}
// round over: add the points, decide if the match is over
export function endRound(game, M) {
  if (M.roundDone) return M.rounds[M.rounds.length - 1];
  const sc = game.scores(M.state) || {};
  const pts = (sc.points || []).map((x) => x || 0);
  pts.forEach((v, i) => { M.totals[i] = (M.totals[i] || 0) + v; });
  const res = { round: M.round, points: pts, rows: sc.rows || [], records: sc.records || {}, coins: sc.coins || 0, note: sc.note || '', totals: M.totals.slice() };
  M.rounds.push(res); M.roundDone = true;
  const w = matchWinner(game, M);
  if (w !== -1) { M.over = true; M.winner = w; }
  return res;
}
export function matchWinner(game, M) {
  if (game.matchOver) return game.matchOver(M.totals.slice(), M.cfg, M.rounds);
  const t = M.totals, target = M.cfg.target || 1, max = Math.max(...t);
  const leaders = t.map((v, i) => (v === max ? i : -1)).filter((i) => i >= 0);
  if (max >= target && leaders.length === 1) return leaders[0];
  if (M.rounds.length >= (M.cfg.maxRounds || 40)) return leaders.length === 1 ? leaders[0] : 'draw';
  return -1;
}
export function nextRound(game, M) {
  M.round++;
  M.dealer = game.nextDealer ? game.nextDealer(M.state, M.dealer) : (M.dealer + 1) % M.cfg.n;
  return startRound(game, M);
}
export const sideOf = (M, p) => M.teams.findIndex((t) => t.includes(p));
export const sideName = (M, i) => M.teams[i].map((p) => M.cfg.seats?.[p]?.name || `G${p + 1}`).join(' e ');
export const humanSeats = (M) => (M.cfg.seats || []).map((s, i) => (s.kind === 'human' ? i : -1)).filter((i) => i >= 0);

// a whole match between AIs (tests, balance): returns { M, steps }
export function simulate(game, cfg, levels = [], { maxSteps = 20000, check = true } = {}) {
  const M = newMatch(game, cfg); let steps = 0;
  while (!M.over && steps < maxSteps) {
    if (game.isOver(M.state)) { endRound(game, M); if (!M.over) nextRound(game, M); continue; }
    const p = M.state.turn;
    const lv = levels[p] || cfg.seats?.[p]?.level || 'normale';
    const m = aiMove(game, M, lv);
    if (check && !findLegal(game.legalMoves(M.state, p), m)) throw new Error(`${game.id}: l'IA ${lv} ha scelto una mossa illegale`);
    play(game, M, m); steps++;
  }
  return { M, steps };
}
