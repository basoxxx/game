// Rally highlights check: node tools/hl-rally.mjs [events]
globalThis.localStorage ??= { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } };
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const { createWorld, getTrack } = await import(ROOT + '/src/engine/world.js');
const { setState } = await import(ROOT + '/src/engine/state.js');
const { TEAMS } = await import(ROOT + '/src/data/teams.js');
const { RallyEvent } = await import(ROOT + '/src/engine/rally.js');
const { encodeReel, kfAt } = await import(ROOT + '/src/engine/highlights.js');
const st = createWorld({ playerName: 'T', category: 'rally', teamId: TEAMS.rally[2].id, difficulty: 'normal', seasonLength: 'short', raceLength: 'normal' });
setState(st);
const bad = [];
for (let r = 0; r < Math.min(+(process.argv[2] || 4), st.calendar.length); r++) {
  st.round = r; const ev = st.calendar[r]; const tr = getTrack('rally', ev.trackId);
  const R = new RallyEvent(st, ev, tr, {});
  while (!R.finished()) { R.planStage({}); let g = 0; while (!R.allDone() && g++ < 1e5) { const q = R.advance(r % 2 ? 2 : 0.5); if (q) R.resolveDecision(q, 'b'); } R.completeStage(); if (R.isServiceAfter(R.stageIdx - 1)) R.service({}); }
  const reel = R.hl.finalize({ title: tr.name });
  for (const c of reel.clips) {
    const f = c.kf[c.focus]; if (!f) bad.push(`${tr.id}: clip ${c.type} senza keyframe per ${c.focus}`);
    for (const [k, kf] of Object.entries(c.kf)) for (let i = 1; i < kf.length; i++) if (kf[i][0] < kf[i - 1][0] - 1e-6 || kf[i][1] < kf[i - 1][1] - 1e-4) bad.push(`${tr.id}: keyframe non monotoni ${k} ${JSON.stringify(kf.slice(i - 1, i + 1))}`);
    const p = kfAt(f, c.tc);
    if (!p) bad.push('kfAt null');
  }
  console.log(tr.id, 'clips', reel.clips.length, reel.clips.map((c) => `PS${c.stage.idx + 1}:${c.type}(${c.score.toFixed(1)})`).join(' '), 'KB', (JSON.stringify(encodeReel(reel)).length / 1024).toFixed(1), 'inc', R.incidents.length);
}
console.log(bad.length ? 'FAIL\n  ' + [...new Set(bad)].slice(0, 20).join('\n  ') : 'rally highlights: ok');
if (bad.length) process.exitCode = 1;
