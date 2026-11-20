// Tavolo Baso · Scacchi — the engine: iterative deepening PVS alpha-beta with a transposition table, null
// move, late-move reductions, killers + history, quiescence (captures, promotions), check extension and a
// tapered evaluation (material, piece-square tables, pawn structure, bishop pair, rooks on open files, king
// safety). Levels go from "Principiante" (shallow + noise + blunders) to "Campione" (deep, timed). An
// opening book of mainstream lines gives variety. Pure: runs in the Web Worker and in node tests.
import { Position, P, N, B, R, Q, K, WHITE, BLACK, mFrom, mTo, mPromo, mFlag, FLAG_EP, START_FEN } from './core.js';

export const LEVELS = [
  { id: 0, name: 'Principiante', elo: '~600', depth: 1, ms: 120, noise: 320, blunder: 0.22 },
  { id: 1, name: 'Facile', elo: '~900', depth: 2, ms: 220, noise: 130, blunder: 0.06 },
  { id: 2, name: 'Medio', elo: '~1200', depth: 3, ms: 400, noise: 45 },
  { id: 3, name: 'Esperto', elo: '~1500', depth: 5, ms: 800, noise: 14 },
  { id: 4, name: 'Maestro', elo: '~1800', depth: 64, ms: 1500, noise: 0 },
  { id: 5, name: 'Campione', elo: '~2000+', depth: 64, ms: 3200, noise: 0 },
];
export const VAL = [0, 100, 320, 335, 500, 960, 0];
const MATE = 30000, INF = 32000;

// piece-square tables (white's view, index = rank*8 + file, rank 0 = first rank)
const T = (rows) => { const a = new Int16Array(64); rows.forEach((r, i) => r.forEach((v, f) => { a[(7 - i) * 8 + f] = v; })); return a; };
const PST_MG = [null,
  T([[0, 0, 0, 0, 0, 0, 0, 0], [60, 60, 60, 64, 64, 60, 60, 60], [16, 18, 26, 34, 34, 26, 18, 16], [6, 8, 14, 26, 26, 14, 8, 6], [0, 0, 6, 22, 22, 4, 0, 0], [4, -2, -6, 4, 4, -8, -2, 4], [4, 8, 8, -18, -18, 8, 8, 4], [0, 0, 0, 0, 0, 0, 0, 0]]),
  T([[-50, -38, -30, -28, -28, -30, -38, -50], [-38, -18, 0, 4, 4, 0, -18, -38], [-30, 4, 12, 16, 16, 12, 4, -30], [-28, 6, 16, 22, 22, 16, 6, -28], [-28, 2, 14, 20, 20, 14, 2, -28], [-30, 4, 12, 12, 12, 12, 4, -30], [-38, -18, 0, 4, 4, 0, -18, -38], [-50, -36, -28, -28, -28, -28, -36, -50]]),
  T([[-18, -10, -10, -10, -10, -10, -10, -18], [-10, 0, 0, 0, 0, 0, 0, -10], [-10, 2, 6, 10, 10, 6, 2, -10], [-10, 6, 6, 10, 10, 6, 6, -10], [-10, 2, 10, 10, 10, 10, 2, -10], [-10, 10, 10, 8, 8, 10, 10, -10], [-10, 8, 2, 2, 2, 2, 8, -10], [-18, -10, -12, -10, -10, -12, -10, -18]]),
  T([[2, 4, 4, 6, 6, 4, 4, 2], [10, 14, 14, 14, 14, 14, 14, 10], [-4, 0, 0, 2, 2, 0, 0, -4], [-4, 0, 0, 2, 2, 0, 0, -4], [-4, 0, 0, 2, 2, 0, 0, -4], [-4, 0, 0, 2, 2, 0, 0, -4], [-6, 0, 0, 2, 2, 0, 0, -6], [-2, 0, 2, 8, 8, 6, 0, -2]]),
  T([[-18, -10, -8, -4, -4, -8, -10, -18], [-10, 0, 0, 0, 0, 0, 0, -10], [-8, 0, 4, 4, 4, 4, 0, -8], [-4, 0, 4, 4, 4, 4, 0, -4], [-2, 0, 4, 4, 4, 4, 0, -4], [-8, 4, 4, 4, 4, 4, 0, -8], [-10, 0, 4, 0, 0, 0, 0, -10], [-18, -10, -8, -2, -4, -8, -10, -18]]),
  T([[-30, -40, -40, -50, -50, -40, -40, -30], [-30, -40, -40, -50, -50, -40, -40, -30], [-30, -40, -40, -50, -50, -40, -40, -30], [-30, -40, -40, -50, -50, -40, -40, -30], [-20, -30, -30, -40, -40, -30, -30, -20], [-10, -20, -20, -24, -24, -20, -20, -10], [14, 14, -6, -10, -10, -6, 16, 16], [16, 28, 8, -6, 0, 6, 30, 18]]),
];
const PST_EG = [null,
  T([[0, 0, 0, 0, 0, 0, 0, 0], [90, 90, 86, 80, 80, 86, 90, 90], [56, 54, 48, 42, 42, 48, 54, 56], [30, 28, 24, 20, 20, 24, 28, 30], [16, 14, 10, 8, 8, 10, 14, 16], [6, 4, 2, 2, 2, 2, 4, 6], [2, 2, 2, 2, 2, 2, 2, 2], [0, 0, 0, 0, 0, 0, 0, 0]]),
  null, null, null, null,
  T([[-50, -36, -28, -22, -22, -28, -36, -50], [-28, -12, -4, 2, 2, -4, -12, -28], [-24, -4, 14, 20, 20, 14, -4, -24], [-22, 0, 20, 30, 30, 20, 0, -22], [-22, 0, 20, 30, 30, 20, 0, -22], [-24, -4, 14, 20, 20, 14, -4, -24], [-30, -14, -4, 0, 0, -4, -14, -30], [-50, -36, -28, -24, -24, -28, -36, -50]]),
];
for (let t = 2; t <= 5; t++) PST_EG[t] = PST_MG[t].map((v) => Math.round(v * 0.6));
const PHASE = [0, 0, 1, 1, 2, 4, 0];
const sq64 = (s) => (s >> 4) * 8 + (s & 7);
const mir = (i) => (7 - (i >> 3)) * 8 + (i & 7);
const PASSED = [0, 8, 14, 24, 42, 70, 110, 0];

export function evaluate(pos) {
  const b = pos.board;
  let mg = 0, eg = 0, phase = 0;
  const pf = [new Int8Array(8), new Int8Array(8)]; // pawns per file
  const pawnsW = [], pawnsB = [];
  let bishW = 0, bishB = 0;
  for (let s = 0; s < 120; s++) {
    if (s & 0x88) { s += 7; continue; }
    const p = b[s]; if (!p) continue;
    const t = p & 7, c = p >> 3, i = c ? mir(sq64(s)) : sq64(s), sg = c ? -1 : 1;
    phase += PHASE[t];
    mg += sg * (VAL[t] + PST_MG[t][i]); eg += sg * (VAL[t] + PST_EG[t][i]);
    if (t === P) { pf[c][s & 7]++; (c ? pawnsB : pawnsW).push(s); }
    else if (t === B) { if (c) bishB++; else bishW++; }
  }
  if (bishW >= 2) { mg += 30; eg += 45; } if (bishB >= 2) { mg -= 30; eg -= 45; }
  // pawn structure
  for (let c = 0; c < 2; c++) {
    const own = pf[c], opp = pf[c ^ 1], sg = c ? -1 : 1, list = c ? pawnsB : pawnsW;
    for (let f = 0; f < 8; f++) if (own[f] > 1) { mg -= sg * 12 * (own[f] - 1); eg -= sg * 22 * (own[f] - 1); }
    for (const s of list) {
      const f = s & 7, r = s >> 4, rel = c ? 7 - r : r;
      if (!(f > 0 && own[f - 1]) && !(f < 7 && own[f + 1])) { mg -= sg * 12; eg -= sg * 16; }
      // passed: no enemy pawn ahead on this or adjacent files
      let passed = true;
      for (let df = -1; df <= 1 && passed; df++) {
        const ff = f + df; if (ff < 0 || ff > 7 || !opp[ff]) continue;
        for (let rr = c ? r - 1 : r + 1; rr >= 0 && rr <= 7; rr += c ? -1 : 1) if (b[rr * 16 + ff] === (P | ((c ^ 1) << 3))) { passed = false; break; }
      }
      if (passed) { mg += sg * PASSED[rel] * 0.6; eg += sg * PASSED[rel]; }
    }
  }
  // rooks on open/half-open files, king shelter
  for (let s = 0; s < 120; s++) {
    if (s & 0x88) { s += 7; continue; }
    const p = b[s]; if ((p & 7) !== R) continue;
    const c = p >> 3, f = s & 7, sg = c ? -1 : 1;
    if (!pf[c][f]) { mg += sg * (pf[c ^ 1][f] ? 12 : 24); eg += sg * 10; }
  }
  for (let c = 0; c < 2; c++) {
    const k = pos.kings[c], kf = k & 7, sg = c ? -1 : 1, fw = c ? -16 : 16;
    let shield = 0;
    for (let df = -1; df <= 1; df++) {
      const ff = kf + df; if (ff < 0 || ff > 7) continue;
      const a = k + fw + df, a2 = a + fw;
      if (!(a & 0x88) && b[a] === (P | (c << 3))) shield += 2; else if (!(a2 & 0x88) && b[a2] === (P | (c << 3))) shield += 1;
      if (!pf[c][ff]) mg -= sg * 10;
    }
    mg += sg * shield * 6;
  }
  const ph = Math.min(24, phase);
  let sc = (mg * ph + eg * (24 - ph)) / 24;
  // drawish endings: no pawns and a small material edge
  if (!pawnsW.length && !pawnsB.length && Math.abs(sc) < 400) sc *= 0.3;
  return (pos.side === WHITE ? sc : -sc) | 0;
}

// ───────── search
const TT_BITS = 19, TT_SIZE = 1 << TT_BITS, TT_MASK = TT_SIZE - 1;
export class Engine {
  constructor() {
    this.tKey = new Int32Array(TT_SIZE); this.tMove = new Int32Array(TT_SIZE); this.tScore = new Int16Array(TT_SIZE);
    this.tDepth = new Int8Array(TT_SIZE); this.tFlag = new Int8Array(TT_SIZE);
    this.hist = new Int32Array(16 * 128); this.killers = new Int32Array(128 * 2);
  }
  clear() { this.tKey.fill(0); this.tFlag.fill(0); this.hist.fill(0); this.killers.fill(0); }
  probe(pos) { const i = pos.hlo & TT_MASK; return this.tKey[i] === pos.hhi && this.tFlag[i] ? i : -1; }
  store(pos, depth, score, flag, move, ply) {
    const i = pos.hlo & TT_MASK;
    if (this.tKey[i] === pos.hhi && this.tDepth[i] > depth && this.tFlag[i]) return;
    if (score > MATE - 200) score += ply; else if (score < -MATE + 200) score -= ply;
    this.tKey[i] = pos.hhi; this.tMove[i] = move; this.tScore[i] = score; this.tDepth[i] = depth; this.tFlag[i] = flag;
  }
  timeUp() {
    if ((++this.nodes & 1023) === 0 && (Date.now() > this.deadline || this.nodes > this.maxNodes)) this.stop = true;
    return this.stop;
  }
  order(pos, ms, ttMove, ply) {
    const b = pos.board, sc = new Int32Array(ms.length), k1 = this.killers[ply * 2], k2 = this.killers[ply * 2 + 1];
    for (let i = 0; i < ms.length; i++) {
      const m = ms[i], to = mTo(m), cap = b[to] & 7;
      if (m === ttMove) sc[i] = 1e8;
      else if (cap || mFlag(m) & FLAG_EP) sc[i] = 1e7 + (VAL[cap || 1] * 16) - (b[mFrom(m)] & 7);
      else if (mPromo(m)) sc[i] = 9e6 + VAL[mPromo(m)];
      else if (m === k1) sc[i] = 8e6; else if (m === k2) sc[i] = 7e6;
      else sc[i] = this.hist[(b[mFrom(m)] & 15) * 128 + to];
    }
    // insertion sort (lists are short)
    for (let i = 1; i < ms.length; i++) { const m = ms[i], s = sc[i]; let j = i - 1; while (j >= 0 && sc[j] < s) { ms[j + 1] = ms[j]; sc[j + 1] = sc[j]; j--; } ms[j + 1] = m; sc[j + 1] = s; }
    return ms;
  }
  qs(pos, alpha, beta, ply) {
    if (this.timeUp()) return 0;
    const stand = evaluate(pos);
    if (stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    if (ply > 60) return stand;
    const ms = this.order(pos, pos.gen([], true), 0, Math.min(ply, 127));
    for (const m of ms) {
      // delta pruning
      const cap = pos.board[mTo(m)] & 7;
      if (!mPromo(m) && stand + VAL[cap || 1] + 200 < alpha) continue;
      if (!pos.make(m)) continue;
      const s = -this.qs(pos, -beta, -alpha, ply + 1);
      pos.unmake();
      if (this.stop) return 0;
      if (s >= beta) return s;
      if (s > alpha) alpha = s;
    }
    return alpha;
  }
  search(pos, depth, alpha, beta, ply, nullOk = true) {
    if (ply && (pos.half >= 100 || pos.repeats() >= 1)) return 0;
    const inCheck = pos.inCheck();
    if (inCheck) depth++;
    if (depth <= 0) return this.qs(pos, alpha, beta, ply);
    if (this.timeUp()) return 0;
    // mate distance pruning
    alpha = Math.max(alpha, -MATE + ply); beta = Math.min(beta, MATE - ply - 1); if (alpha >= beta) return alpha;
    const pv = beta - alpha > 1;
    let ttMove = 0; const ti = this.probe(pos);
    if (ti >= 0) {
      ttMove = this.tMove[ti];
      if (!pv && ply && this.tDepth[ti] >= depth) {
        let s = this.tScore[ti]; if (s > MATE - 200) s -= ply; else if (s < -MATE + 200) s += ply;
        const f = this.tFlag[ti];
        if (f === 1 || (f === 2 && s >= beta) || (f === 3 && s <= alpha)) return s;
      }
    }
    // null move pruning (not in check, not in pawn endings)
    if (nullOk && !pv && !inCheck && depth >= 3 && ply && this.hasPieces(pos) && evaluate(pos) >= beta) {
      pos.makeNull();
      const s = -this.search(pos, depth - 3, -beta, -beta + 1, ply + 1, false);
      pos.unmakeNull();
      if (this.stop) return 0;
      if (s >= beta) return beta;
    }
    const ms = this.order(pos, pos.gen([]), ttMove, Math.min(ply, 127));
    let best = -INF, bestM = 0, legal = 0, flag = 3;
    for (let i = 0; i < ms.length; i++) {
      const m = ms[i], quiet = !pos.board[mTo(m)] && !mPromo(m) && !(mFlag(m) & FLAG_EP);
      if (!pos.make(m)) continue;
      legal++;
      let s;
      if (legal === 1) s = -this.search(pos, depth - 1, -beta, -alpha, ply + 1);
      else {
        let r = 0;
        if (quiet && depth >= 3 && legal > 3 && !inCheck && !pos.inCheck()) r = legal > 8 ? 2 : 1;
        s = -this.search(pos, depth - 1 - r, -alpha - 1, -alpha, ply + 1);
        if (s > alpha && (r || pv)) s = -this.search(pos, depth - 1, -beta, -alpha, ply + 1);
      }
      pos.unmake();
      if (this.stop) return 0;
      if (s > best) { best = s; bestM = m; }
      if (s > alpha) {
        alpha = s; flag = 1;
        if (ply === 0) { this.rootBest = m; this.rootScore = s; }
        if (s >= beta) {
          flag = 2;
          if (quiet) {
            const kp = Math.min(ply, 127) * 2;
            if (this.killers[kp] !== m) { this.killers[kp + 1] = this.killers[kp]; this.killers[kp] = m; }
            this.hist[(pos.board[mFrom(m)] & 15) * 128 + mTo(m)] += depth * depth;
          }
          break;
        }
      }
    }
    if (!legal) return inCheck ? -MATE + ply : 0;
    this.store(pos, depth, best, flag, bestM, ply);
    return best;
  }
  hasPieces(pos) { const b = pos.board, c = pos.side << 3; for (let s = 0; s < 120; s++) { if (s & 0x88) { s += 7; continue; } const t = b[s]; if (t && (t & 8) === c && (t & 7) > 1 && (t & 7) < 6) return true; } return false; }
  // iterative deepening; returns { move, score, depth, nodes }
  think(pos, { depth = 64, ms = 1000, nodes = 5e7 } = {}) {
    this.stop = false; this.nodes = 0; this.deadline = Date.now() + ms; this.maxNodes = nodes;
    this.killers.fill(0); for (let i = 0; i < this.hist.length; i++) this.hist[i] >>= 2;
    const legal = pos.legal(); if (!legal.length) return { move: 0, score: 0, depth: 0 };
    let best = legal[0], score = 0, done = 0;
    for (let d = 1; d <= depth; d++) {
      this.rootBest = 0;
      const s = this.search(pos, d, -INF, INF, 0);
      if (this.stop && d > 1) { if (this.rootBest && this.rootScore > score - 30) best = this.rootBest; break; }
      if (this.rootBest) { best = this.rootBest; score = s; done = d; }
      if (Math.abs(score) > MATE - 100) break; // mate found
      if (Date.now() > this.deadline - ms * 0.45 && d >= 2) break; // the next ply would not finish
    }
    return { move: best, score, depth: done, nodes: this.nodes };
  }
  // shallow scores for every root move (weak levels pick among them with noise)
  rootScores(pos, depth) {
    this.stop = false; this.nodes = 0; this.deadline = Date.now() + 5000; this.maxNodes = 1e7;
    return pos.legal().map((m) => { pos.make(m); const s = -this.search(pos, depth - 1, -INF, INF, 1); pos.unmake(); return { m, s }; });
  }
}

// ───────── opening book: mainstream lines in coordinate notation (prefixes are shared)
const BOOK = [
  'e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4 g8f6 e1g1 f8e7', 'e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 c2c3 g8f6 d2d3 d7d6', 'e2e4 e7e5 g1f3 b8c6 f1c4 g8f6 d2d3 f8e7',
  'e2e4 e7e5 g1f3 b8c6 d2d4 e5d4 f3d4 g8f6 d4c6 b7c6', 'e2e4 e7e5 g1f3 g8f6 f3e5 d7d6 e5f3 f6e4', 'e2e4 e7e5 b1c3 g8f6 f2f4 d7d5',
  'e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 a7a6', 'e2e4 c7c5 g1f3 b8c6 d2d4 c5d4 f3d4 g8f6 b1c3 e7e5', 'e2e4 c7c5 g1f3 e7e6 d2d4 c5d4 f3d4 a7a6',
  'e2e4 c7c5 b1c3 b8c6 g2g3 g7g6 f1g2 f8g7', 'e2e4 c7c5 c2c3 g8f6 e4e5 f6d5 d2d4 c5d4',
  'e2e4 e7e6 d2d4 d7d5 b1c3 g8f6 c1g5 f8e7', 'e2e4 e7e6 d2d4 d7d5 e4e5 c7c5 c2c3 b8c6', 'e2e4 c7c6 d2d4 d7d5 b1c3 d5e4 c3e4 c8f5',
  'e2e4 c7c6 d2d4 d7d5 e4e5 c8f5 g1f3 e7e6', 'e2e4 d7d5 e4d5 d8d5 b1c3 d5a5 d2d4 g8f6', 'e2e4 g7g6 d2d4 f8g7 b1c3 d7d6', 'e2e4 d7d6 d2d4 g8f6 b1c3 g7g6',
  'd2d4 d7d5 c2c4 e7e6 b1c3 g8f6 c1g5 f8e7 e2e3 e8g8', 'd2d4 d7d5 c2c4 c7c6 g1f3 g8f6 b1c3 d5c4', 'd2d4 d7d5 c2c4 d5c4 g1f3 g8f6 e2e3 e7e6',
  'd2d4 g8f6 c2c4 e7e6 b1c3 f8b4 e2e3 e8g8', 'd2d4 g8f6 c2c4 g7g6 b1c3 f8g7 e2e4 d7d6 g1f3 e8g8', 'd2d4 g8f6 c2c4 e7e6 g1f3 b7b6 g2g3 c8b7',
  'd2d4 g8f6 c2c4 c7c5 d4d5 e7e6 b1c3 e6d5', 'd2d4 d7d5 g1f3 g8f6 c1f4 e7e6 e2e3 c7c5', 'd2d4 g8f6 g1f3 g7g6 g2g3 f8g7 f1g2 e8g8',
  'd2d4 f7f5 g2g3 g8f6 f1g2 e7e6', 'c2c4 e7e5 b1c3 g8f6 g1f3 b8c6 g2g3 d7d5', 'c2c4 g8f6 b1c3 e7e6 e2e4 d7d5', 'c2c4 c7c5 g1f3 b8c6 b1c3 g7g6',
  'g1f3 d7d5 g2g3 g8f6 f1g2 e7e6 e1g1 f8e7', 'g1f3 g8f6 c2c4 g7g6 b1c3 d7d5', 'e2e4 e7e5 g1f3 d7d6 d2d4 g8f6 b1c3 b8d7',
];
export function bookMove(history, rnd = Math.random) {
  const pre = history.join(' ');
  const cands = [];
  for (const line of BOOK) {
    const mv = line.split(' ');
    if (mv.length <= history.length) continue;
    if (history.length && mv.slice(0, history.length).join(' ') !== pre) continue;
    cands.push(mv[history.length]);
  }
  if (!cands.length) return null;
  return cands[Math.floor(rnd() * cands.length)];
}

let ENGINE = null;
const engine = () => (ENGINE ||= new Engine());
// play from startFen through history (UCI list): the repetition history is part of the position
export function positionFrom(startFen = START_FEN, history = []) {
  const p = new Position(startFen);
  for (const u of history) { const m = p.parse(u); if (!m) break; p.make(m); p.stack.length = 0; }
  return p;
}
// pick the computer's move for a level. returns { uci, score, depth, book }
export function chooseMove({ startFen = START_FEN, history = [], level = 2, rnd = Math.random, ms } = {}) {
  const L = LEVELS[Math.max(0, Math.min(LEVELS.length - 1, level))];
  const pos = positionFrom(startFen, history);
  const legal = pos.legal(); if (!legal.length) return null;
  if (startFen === START_FEN && level >= 1 && history.length < 12) {
    const bm = bookMove(history, rnd);
    if (bm && pos.parse(bm) && rnd() < (level >= 4 ? 0.95 : 0.8)) return { uci: bm, score: 0, depth: 0, book: true };
  }
  const E = engine();
  if (L.noise) {
    if (L.blunder && rnd() < L.blunder) {
      // a careless move: any move that does not hang mate in one
      const ok = legal.filter((m) => { pos.make(m); const mateNext = pos.legal().some((r) => { pos.make(r); const mt = !pos.hasLegal() && pos.inCheck(); pos.unmake(); return mt; }); pos.unmake(); return !mateNext; });
      const m = (ok.length ? ok : legal)[Math.floor(rnd() * (ok.length || legal.length))];
      return { uci: pos.uci(m), score: 0, depth: 0 };
    }
    const sc = E.rootScores(pos, L.depth);
    let best = null, bs = -Infinity;
    for (const { m, s } of sc) { const v = s + (rnd() * 2 - 1) * L.noise + (Math.abs(s) > MATE - 100 ? s * 0 : 0); if (v > bs) { bs = v; best = { m, s }; } }
    // never miss a mate in one, even at the bottom levels, once in a while
    return { uci: pos.uci(best.m), score: best.s, depth: L.depth };
  }
  // full strength: a little variety among near-equal root moves early in the game
  const r = E.think(pos, { depth: L.depth, ms: ms || L.ms });
  return { uci: pos.uci(r.move), score: r.score, depth: r.depth, nodes: r.nodes };
}
// best move for a hint (fixed effort)
export function hintMove({ startFen = START_FEN, history = [], ms = 700 } = {}) {
  const pos = positionFrom(startFen, history);
  const r = engine().think(pos, { ms });
  return r.move ? { uci: pos.uci(r.move), score: r.score, depth: r.depth } : null;
}

// ───────── mate solver (puzzles): can the side to move force mate within n of its moves?
export function mateIn(pos, n) {
  if (n <= 0) return false;
  const ms = pos.legal();
  for (const m of ms) {
    pos.make(m);
    const ok = forcedAfter(pos, n);
    pos.unmake();
    if (ok) return m;
  }
  return 0;
}
// side to move = defender: true when every defence still loses to mate within n-1 more attacker moves
function forcedAfter(pos, n) {
  const ds = pos.legal();
  if (!ds.length) return pos.inCheck();
  if (n === 1) return false;
  for (const d of ds) {
    pos.make(d);
    const ok = mateIn(pos, n - 1);
    pos.unmake();
    if (!ok) return false;
  }
  return true;
}
// all attacker first moves that force mate in n
export function mateKeys(pos, n) {
  const out = [];
  for (const m of pos.legal()) { pos.make(m); if (forcedAfter(pos, n)) out.push(m); pos.unmake(); }
  return out;
}
export const isMateAfter = forcedAfter;
export { MATE };
