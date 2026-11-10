// Validity checks for every circuit in src/data/circuits.js, run through the game's own
// track physics. Usage: node tools/check-tracks.mjs   (exit code 1 on any failure)
import { CIRCUITS } from '../src/data/circuits.js';
import { trackGeometry, trackGrip, referenceProfile, trackStats } from '../src/engine/trackphys.js';
import { checkGeo, lapTargets } from './redesign-tracks.mjs';

const bad = [];
const rows = [];
for (const cid of Object.keys(CIRCUITS)) {
  const C = CIRCUITS[cid];
  const geo = trackGeometry(cid);
  const c = checkGeo(geo);
  const fail = (m) => bad.push(`${cid}: ${m}`);
  if (C.name !== cid.toUpperCase()) fail('name is not the cid');
  if (c.issues.length) fail(c.issues.join(','));
  const want = cid === 'jpn' ? 1 : 0;
  if (c.crosses !== want) fail(`${c.crosses} crossings (want ${want})`);
  if (want && geo.cross.length === 0) fail('crossing not detected by trackphys (no bridge)');
  if (want && c.crossAng < 40) fail(`crossing angle ${c.crossAng.toFixed(0)}°`);
  if (c.minSep < 26) fail(`sections ${c.minSep.toFixed(1)} m apart`);
  if (c.minR < 12) fail(`radius ${c.minR.toFixed(1)} m`);
  if (c.maxDh > 0.45) fail(`cusp (heading step ${c.maxDh.toFixed(2)} rad)`);
  const minStart = cid === 'mon' ? 180 : 250;
  if (c.startStraight < minStart) fail(`start straight ${c.startStraight} m`);
  if (c.pitClr < 40) fail(`pit side clearance ${c.pitClr.toFixed(0)} m`);
  if (c.corners < 7 || c.corners > 26) fail(`${c.corners} corners`);
  // loop continuity: last point to first point gap comparable to the other gaps
  const n = geo.N; let gmax = 0; for (let i = 0; i < n; i++) gmax = Math.max(gmax, Math.hypot(geo.x[(i + 1) % n] - geo.x[i], geo.y[(i + 1) % n] - geo.y[i]));
  if (gmax > geo.ds * 1.6) fail(`discontinuity ${gmax.toFixed(1)} m`);
  // the spline length matches len (trackphys rescales the line to len)
  const used = [];
  for (const [cat, lap, id] of lapTargets(cid)) {
    const m = trackGrip(cat, cid, lap);
    if (m < 0.52 || m > 2.15) fail(`${cat}/${id}: grip fit at bound (${m.toFixed(3)})`);
    const pr = referenceProfile(cat, cid, lap);
    if (Math.abs(pr.lap - lap) > 0.05) fail(`${cat}/${id}: reference lap ${pr.lap.toFixed(2)} vs ${lap}`);
    const st = trackStats(cat, { cid, lap });
    used.push(`${cat}:${id} m=${m.toFixed(3)} vmax=${st.vmax.toFixed(0)} full=${(st.full * 100).toFixed(0)}%`);
  }
  rows.push(`${cid.padEnd(4)} len ${String(C.len).padStart(5)} pts ${String(C.pts.length).padStart(3)} corners ${String(c.corners).padStart(2)} minR ${c.minR.toFixed(0).padStart(3)} sep ${(isFinite(c.minSep) ? c.minSep.toFixed(0) : '-').padStart(3)} start ${String(c.startStraight).padStart(4)} pitClr ${(c.pitClr > 900 ? '-' : c.pitClr.toFixed(0)).padStart(3)} cross ${c.crosses}  ${used.join('  ')}`);
}
console.log(rows.join('\n'));
console.log(bad.length ? 'TRACK CHECK FAILURES:\n  ' + bad.join('\n  ') : `tracks: ok (${rows.length} circuits)`);
if (bad.length) process.exitCode = 1;
