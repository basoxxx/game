// Kart Baso — track sanity check: lap length, clearance between parts of the loop (walls must not
// overlap), shortcut joins, and an SVG/PNG plan of every track.
//   node tools/kart-tracks.mjs [outDir]
import { mkdirSync, writeFileSync } from 'node:fs';
import { TRACKS, ARENAS } from '../src/kart/data.js';
import { Track } from '../src/kart/track.js';

const OUT = process.argv[2] || 'kart-tracks';
mkdirSync(OUT, { recursive: true });
let bad = 0;
const svgs = [];
for (const def of TRACKS) for (const key of [def.id, def.id + ':r']) {
  const t = new Track(key), m = t.main;
  // clearance: nodes far apart along the loop must be further apart in space than both roads + shoulders
  let worst = Infinity, wi = null;
  const need = m.w[0] + 2 * (t.void ? 3 : t.shoulder) + 2;
  for (let i = 0; i < m.n; i += 2) for (let j = i + 2; j < m.n; j += 2) {
    let ds = Math.abs(m.s[i] - m.s[j]); ds = Math.min(ds, m.len - ds);
    if (ds < need * 2.2) continue;
    const d = Math.hypot(m.x[i] - m.x[j], m.z[i] - m.z[j]);
    if (d < worst) { worst = d; wi = [i, j]; }
  }
  const tight = Math.max(...Array.from(m.curv, Math.abs));
  const msg = `${key.padEnd(12)} len ${m.len.toFixed(0)} m  nodes ${m.n}  clearance ${worst.toFixed(1)} (need ${need.toFixed(1)})  tightest R ${(1 / tight).toFixed(1)} m  cuts ${t.paths.length - 1}  boxes ${t.F.boxes.length} coins ${t.F.coins.length}`;
  if (worst < need || 1 / tight < 8) { bad++; console.log('!!', msg, wi); } else console.log('ok', msg);
  if (key.endsWith(':r')) continue;
  // plan
  let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
  for (let i = 0; i < m.n; i++) { minx = Math.min(minx, m.x[i]); maxx = Math.max(maxx, m.x[i]); minz = Math.min(minz, m.z[i]); maxz = Math.max(maxz, m.z[i]); }
  const pad = 30, W = maxx - minx + pad * 2, H = maxz - minz + pad * 2;
  const pl = (p) => Array.from({ length: p.n }, (_, i) => `${(p.x[i] - minx + pad).toFixed(1)},${(p.z[i] - minz + pad).toFixed(1)}`).join(' ');
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W * 2}" height="${H * 2}" style="background:#24402a">`;
  for (const p of t.paths) s += `<polyline points="${pl(p)}${p.closed ? ' ' + pl(p).split(' ')[0] : ''}" fill="none" stroke="#3a6a3a" stroke-width="${p.w[0] + 2 * p.margin}" stroke-linejoin="round"/>`;
  for (const p of t.paths) s += `<polyline points="${pl(p)}${p.closed ? ' ' + pl(p).split(' ')[0] : ''}" fill="none" stroke="${p.isMain ? '#777' : '#a87a4a'}" stroke-width="${p.w[0]}" stroke-linejoin="round"/>`;
  const P = (x, z) => `${(x - minx + pad).toFixed(1)}" cy="${(z - minz + pad).toFixed(1)}`;
  for (const b of t.F.boxes) s += `<circle cx="${P(b.x, b.z)}" r="1.2" fill="#ff0"/>`;
  for (const c of t.F.coins) s += `<circle cx="${P(c.x, c.z)}" r="0.8" fill="#fc0"/>`;
  for (const b of t.F.boosts) s += `<circle cx="${P(b.x, b.z)}" r="2" fill="#0ff"/>`;
  for (const b of t.F.bumpers) s += `<circle cx="${P(b.cx, b.cz)}" r="2.5" fill="#f0f"/>`;
  for (const b of t.F.muds) s += `<circle cx="${P(b.x, b.z)}" r="${b.r}" fill="#630"/>`;
  for (const j of t.jumps) { const p = m.pointAt(j.s0); s += `<circle cx="${P(p.x, p.z)}" r="3" fill="#f80"/>`; }
  const st = m.pointAt(0); s += `<circle cx="${P(st.x, st.z)}" r="4" fill="#fff"/>`;
  const st2 = m.pointAt(25); s += `<circle cx="${P(st2.x, st2.z)}" r="2.5" fill="#f00"/>`;
  s += `<text x="6" y="16" font-size="14" fill="#fff">${def.name} ${m.len.toFixed(0)} m</text></svg>`;
  writeFileSync(`${OUT}/${def.id}.svg`, s); svgs.push(def.id);
}
for (const a of ARENAS) console.log('arena', a.id, a.size);
writeFileSync(`${OUT}/index.html`, `<body style="margin:0;background:#111;display:flex;flex-wrap:wrap;gap:4px">${svgs.map((id) => `<img src="${id}.svg" style="width:24%">`).join('')}</body>`);
console.log(bad ? `${bad} problem(s)` : 'all tracks ok');
process.exitCode = bad ? 1 : 0;
