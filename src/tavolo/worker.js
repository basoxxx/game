// Tavolo Baso — the computer opponents think here, off the main thread (chess engine, draughts, four in a row).
import { chooseMove, hintMove, positionFrom, mateKeys } from './chess/ai.js';
import { chooseDama, searchDama } from './dama/core.js';
import { chooseFour, searchFour } from './four/core.js';

export function solve(job) {
  const { kind } = job;
  if (kind === 'chess') return chooseMove(job);
  if (kind === 'chess-hint') return hintMove(job);
  if (kind === 'chess-mate') { const p = positionFrom(job.startFen, job.history); return mateKeys(p, job.n).map((m) => p.uci(m)); }
  if (kind === 'dama') { const st = { b: Int8Array.from(job.b), side: job.side, quiet: 0, hist: [] }; return job.hint ? searchDama(st, { depth: 30, ms: 600 }) : chooseDama(st, job.level); }
  if (kind === 'four') { const s = { cells: Int8Array.from(job.cells), h: Int8Array.from(job.h), turn: job.turn, moves: job.moves.slice() }; return job.hint ? searchFour(s, { depth: 42, ms: 600 }).col : chooseFour(s, job.level); }
  throw new Error('lavoro sconosciuto ' + kind);
}
if (typeof self !== 'undefined' && typeof window === 'undefined' && typeof self.postMessage === 'function') {
  self.onmessage = (e) => {
    const { id, job } = e.data || {};
    try { self.postMessage({ id, ok: true, r: solve(job) }); } catch (err) { self.postMessage({ id, ok: false, err: String(err?.message || err) }); }
  };
}
