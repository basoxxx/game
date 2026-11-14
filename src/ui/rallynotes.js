// Co-driver pace notes read from the stage geometry (stageGeometry in race3d.js): corners graded on
// the 1-6 scale used by rally crews (6 = almost flat, 1 = slowest, plus hairpins), with the length
// ("lunga"), tightening / opening, crests and jumps, the distance to the next call and the surface
// warnings. Approximate recce notes get some grades wrong (the crew only finds out on the stage).
import { mulberry32 } from '../engine/rng.js';

const GRADE = [[25, 1], [45, 2], [70, 3], [105, 4], [170, 5], [380, 6]];
const gradeOf = (R) => { for (const [r, g] of GRADE) if (R < r) return g; return 7; };

const cache = new Map();
export function paceNotes(geo, { recce = 0.7, surface = 'gravel', seed = 1 } = {}) {
  const key = `${geo.N}|${geo.len}|${seed}|${Math.round(recce * 20)}|${surface}`;
  if (cache.has(key)) return cache.get(key);
  const { N, ds, k, hdg } = geo;
  // smoothed curvature over ~30 m
  const ks = new Float64Array(N); const W = Math.max(2, Math.round(15 / ds));
  for (let i = 0; i < N; i++) { let a = 0, n = 0; for (let q = -W; q <= W; q++) { const j = i + q; if (j < 0 || j >= N) continue; a += k[j]; n++; } ks[i] = a / n; }
  const notes = [];
  const TH = 1 / 420;
  for (let i = 0; i < N; i++) {
    if (Math.abs(ks[i]) < TH) continue;
    const dir = Math.sign(ks[i]); let j = i, kmax = 0, imax = i;
    while (j < N && Math.sign(ks[j]) === dir && Math.abs(ks[j]) > TH * 0.7) { if (Math.abs(ks[j]) > kmax) { kmax = Math.abs(ks[j]); imax = j; } j++; }
    let turn = hdg[Math.min(N - 1, j)] - hdg[i]; while (turn > Math.PI) turn -= 2 * Math.PI; while (turn < -Math.PI) turn += 2 * Math.PI;
    const len = (j - i) * ds;
    if (Math.abs(turn) > 0.18) {
      const R = 1 / kmax;
      // stageGeometry curvature: positive = heading turning from +x towards +z = a right-hander seen from above
      notes.push({ i, i1: j, kind: 'corner', dir: dir > 0 ? 'D' : 'S', R, grade: Math.abs(turn) > 2.4 && R < 30 ? 0 : gradeOf(R), len, turn: Math.abs(turn), tight: imax > i + (j - i) * 0.65, open: imax < i + (j - i) * 0.3 });
    }
    i = j;
  }
  for (const c of geo.crests || []) notes.push({ i: c, i1: c + 2, kind: 'crest', big: false });
  notes.sort((a, b) => a.i - b.i);
  // jumps: the steeper crests (largest drop just after)
  const h = geo.h;
  if (h) for (const n of notes) if (n.kind === 'crest') { const a = h[Math.max(0, n.i - 4)], b = h[n.i], c = h[Math.min(N - 1, n.i + 6)]; n.big = b - c > 1.4 && b - a > 0.6; }
  // approximate notes: some grades are off by one
  const r = mulberry32(seed * 7 + 13);
  const err = Math.max(0, 0.75 - recce) * 0.8;
  const out = [];
  let prevEnd = 0;
  for (const n of notes) {
    if (n.kind === 'corner' && n.grade === 7) continue; // flat: not called
    const gap = (n.i - prevEnd) * ds;
    const link = out.length && gap < 25 ? 'e' : out.length && gap < 70 ? '50' : out.length && gap < 130 ? '100' : out.length ? String(Math.round(gap / 50) * 50) : '';
    let text, cls;
    if (n.kind === 'crest') { text = n.big ? 'Salto' : 'Dosso'; cls = n.big ? 'jump' : 'crest'; }
    else {
      let g = n.grade; let wrong = false;
      if (g > 0 && r() < err) { g = Math.max(1, Math.min(6, g + (r() < 0.5 ? -1 : 1))); wrong = true; }
      const side = n.dir === 'D' ? 'destra' : 'sinistra';
      text = g === 0 ? `Tornante ${n.dir === 'D' ? 'destro' : 'sinistro'}` : `${g} ${side}`;
      if (n.len > 110 && g > 0) text += ' lunga';
      if (n.tight && g > 0 && g < 6) text += ' stringe'; else if (n.open && g > 0) text += ' apre';
      n.wrong = wrong; n.g = g;
      cls = g <= 2 ? 'slow' : g <= 4 ? 'mid' : 'fast';
    }
    // warnings the recce crew writes in
    let warn = '';
    if (n.kind === 'corner' && n.g != null && n.g <= 2 && surface !== 'tarmac') warn = 'non tagliare';
    else if (n.kind === 'corner' && surface === 'mixed' && n.g <= 3 && r() < 0.35) warn = 'ghiaccio';
    else if (n.kind === 'corner' && (surface === 'rough') && r() < 0.25) warn = 'pietre';
    else if (n.kind === 'crest' && n.big) warn = 'atterraggio a destra'.replace('destra', r() < 0.5 ? 'destra' : 'sinistra');
    out.push({ i: n.i, i1: n.i1 || n.i, km: n.i * ds / 1000, link, text, warn, cls, wrong: !!n.wrong, kind: n.kind });
    prevEnd = n.i1 || n.i;
  }
  cache.set(key, out);
  return out;
}

// the next calls for a car at sample index s (the co-driver reads ~2-3 notes ahead)
export function upcomingNotes(notes, s, n = 4) {
  let a = 0, b = notes.length;
  while (a < b) { const m = (a + b) >> 1; if (notes[m].i1 < s) a = m + 1; else b = m; }
  return notes.slice(a, a + n);
}
