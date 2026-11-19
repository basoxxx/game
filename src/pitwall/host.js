// Muretto box, game side: reads the live session the player is in (race, practice / qualifying, rally stage)
// and publishes a compact snapshot ~4 times a second to every pit wall screen; commands coming back are
// replayed through the screen's own action handlers (a hidden [data-a] button clicked on the page), so a
// call from the tablet does exactly what the same button does on the PC.
// Read-only towards the simulation: the only thing it adds is a sector / speed-trap recorder wrapped
// around the live CircuitSim instance (race.js has no sector times of its own).
import { App } from '../app.js';
import { createHost } from './link.js';
import { COMPOUNDS } from '../data/categories.js';
import { sectorFracs } from '../engine/session.js';
import { tyreModel } from '../engine/tyres.js';
import { referenceProfile, trackGeometry } from '../engine/trackphys.js';
import { STAGE_STYLE } from '../ui/trackview.js';

const RATE = 250; // ms between snapshots
let H = null, timer = 0, tick = 0, lastSid = null, sentEvt = new WeakSet(), listeners = new Set();
let viewersList = [], remoteStatus = { state: 'off' };
const r3 = (x) => (x == null || !isFinite(x) ? null : Math.round(x * 1000) / 1000);
const r1 = (x) => (x == null || !isFinite(x) ? null : Math.round(x * 10) / 10);

export function pitwallHost() { return H; }
export function onPitwall(fn) { listeners.add(fn); return () => listeners.delete(fn); }
const emit = () => { for (const f of listeners) { try { f({ viewers: viewersList, remote: remoteStatus }); } catch (e) { console.warn(e); } } badge(); };
function badge() {
  const n = viewersList.length;
  for (const b of document.querySelectorAll('[data-a="pitwall"]')) { b.classList.toggle('pw-on', n > 0); b.dataset.n = n ? String(n) : ''; }
}

export function startHost() {
  if (H) return H;
  H = createHost({
    getMeta: () => meta(),
    getHello: () => { const s = snapshot(true); return s ? [{ t: 'state', s }, { t: 'evt', list: recentEvents(40) }] : [{ t: 'state', s: { live: false } }]; },
    onCommand: (c) => command(c),
    onViewers: (list) => { const added = list.length > viewersList.length; viewersList = list; emit(); if (added) try { App.toast('Muretto box collegato', `${list[list.length - 1]?.name || 'Un nuovo schermo'} riceve i dati della sessione.`, 'good'); } catch { /* */ } },
    onRemote: (r) => { remoteStatus = r; emit(); },
  });
  clearInterval(timer);
  timer = setInterval(pump, RATE);
  window.addEventListener('pagehide', () => H?.close());
  return H;
}
export function stopHost() { clearInterval(timer); timer = 0; H?.close(); H = null; viewersList = []; remoteStatus = { state: 'off' }; emit(); }
export function hostState() { return { viewers: viewersList, remote: remoteStatus }; }
export function sendTab(tab) { H?.broadcast({ t: 'tab', tab }); }

// ---------------- what is live right now ----------------
function live() {
  if (App.cur === 'weekend') {
    const R = window.__race, P = window.__sess;
    if (R?.sim && R.raf && S()?.weekend?.phase === 'race') return { kind: 'race', R, sim: R.sim };
    if (P?.sim && P.raf) return { kind: P.sim.isQuali ? 'quali' : 'practice', P, sim: P.sim };
  }
  if (App.cur === 'rally') { const X = window.__rx; if (X?.ev && X.raf && X.ev.stage && !X.ev.finished()) return { kind: 'rally', X, sim: X.ev }; }
  return null;
}
const S = () => window.__apex?.S?.();

function pump() {
  if (!H || !H.count) return;
  tick++;
  const L = live();
  const s = snapshot(tick % 4 === 0, L);
  if (!s) { if (tick % 4 === 0) H.broadcast({ t: 'state', s: { live: false, at: Date.now() } }); lastSid = null; return; }
  if (s.sid !== lastSid) { lastSid = s.sid; H.broadcast({ t: 'meta', meta: meta(L) }); }
  else if (tick % 20 === 0) H.broadcast({ t: 'meta', meta: meta(L) });
  H.broadcast({ t: 'state', s });
  const ev = newEvents(L);
  if (ev.length) H.broadcast({ t: 'evt', list: ev });
}

// ---------------- session meta (changes rarely) ----------------
function sidOf(L) { const st = S(); return L ? `${L.kind}|${st?.season}|${st?.round}|${L.sim.track?.id || L.sim.ev?.trackId || ''}|${L.sim.name || ''}|${L.sim.laps || L.sim.duration || L.sim.stageIdx || ''}|${L.sim.isSprint ? 's' : ''}` : null; }
function meta(L = live()) {
  if (!L) return null;
  const st = S(); const sim = L.sim;
  if (L.kind === 'rally') {
    const stg = sim.stage;
    return {
      sid: sidOf(L), kind: 'rally', name: `${stg.name || 'Prova speciale'}`, sub: `PS ${sim.stageIdx + 1}/${sim.stages.length} · ${stg.km?.toFixed?.(1) ?? stg.km} km`,
      track: { name: sim.track.name, circuit: sim.track.circuit || '', nat: sim.track.nat, cid: null, cat: 'rally' },
      cars: sim.crews.map((c) => carMeta(st, c, sim.driver(c))), compounds: [], controls: ['dec', 'speed'], stages: sim.stages.length,
      // the stage road (same generator as the rally screen's map): the pit wall draws it and the crews on it
      route: { seed: (sim.track.seed || 0) + (stg.idx ?? sim.stageIdx) * 101, style: STAGE_STYLE[sim.track.id] || 'rough', surface: stg.surface },
    };
  }
  const tr = sim.track;
  const cars = (L.kind === 'race' ? sim.cars : sim.cars).map((c) => carMeta(st, c, sim.driver(c)));
  let trap = null; try { trap = trapFrac(sim.cat, tr); } catch { /* */ }
  return {
    sid: sidOf(L), kind: L.kind, name: L.kind === 'race' ? (sim.isSprint ? 'Sprint' : 'Gara') : sim.name, sub: tr.circuit,
    track: { name: tr.name, circuit: tr.circuit, nat: tr.nat, cid: tr.cid, cat: sim.cat, lap: tr.lap, street: tr.street || 0, night: !!tr.night && !sim.endurance, sprint: !!sim.isSprint },
    laps: sim.laps || null, duration: sim.duration || null, adv: sim.adv || 0,
    sectors: sectorFracs(sim.cat, tr), trap,
    cars, compounds: sim.C.compounds, endurance: !!sim.endurance, ers: L.kind === 'race',
    tyreWin: Object.fromEntries(sim.C.compounds.map((k) => [k, tyreModel(sim.cat, k)?.win ?? null])),
    controls: L.kind === 'race' ? ['dec', 'pit', 'mode', 'ers', 'eng', 'speed', 'orders', 'auto', 'radio', 'view'] : ['dec', 'ss-go', 'ss-callin', 'ss-abort', 'speed', 'view'],
  };
}
function carMeta(st, c, d) {
  const L = c.team.car?.livery || { primary: c.team.colors?.[0] || '#888', secondary: c.team.colors?.[1] || '#222', accent: '#111' };
  return { k: c.key, n: d?.number ?? '', name: d?.name || '', code: shortName(d?.name || ''), team: c.team.name, ts: c.team.short || c.team.name, c1: L.primary, c2: L.secondary, c3: L.accent || '#111111', helmet: d?.helmet?.c1 || L.secondary, me: !!c.isPlayer, sponsor: c.team.sponsors?.[0]?.name || c.team.short || '', crew: c.coName || null };
}
const shortName = (n) => { const p = String(n).split(' '); return (p[p.length - 1] || n).replace(/[^A-Za-zÀ-ÿ]/g, '').slice(0, 3).toUpperCase(); };
// speed trap: where the reference lap is fastest (time fraction of the lap) and the speed there
const trapCache = {};
function trapFrac(cat, tr) {
  const k = cat + tr.cid + tr.lap; if (trapCache[k]) return trapCache[k];
  const prof = referenceProfile(cat, tr.cid, tr.lap); const g = trackGeometry(tr.cid);
  let bi = 0; for (let i = 0; i < prof.v.length; i++) if (prof.v[i] > prof.v[bi]) bi = i;
  const T = prof.t; const TN = T[T.length - 1] || prof.lap;
  return (trapCache[k] = { f: (T[bi] ?? (bi / g.N) * TN) / TN, v: prof.v[bi] * 3.6, lap: prof.lap });
}

// ---------------- sector + speed-trap recorder for the race ----------------
function recorder(sim) {
  if (sim.__pw) return sim.__pw;
  const tf = sectorFracs(sim.cat, sim.track);
  const B = [tf[0], tf[0] + tf[1], 1];
  let trap = null; try { trap = trapFrac(sim.cat, sim.track); } catch { /* */ }
  const rec = { best: [null, null, null], cars: {}, gh: [], ghLap: -1 };
  for (const c of sim.cars) rec.cars[c.key] = { cur: [null, null, null], cls: [null, null, null], last: [null, null, null], lcls: [null, null, null], pb: [null, null, null], t0: null, idx: secOf(c.dist, B), trap: null, trapBest: null, mini: [] };
  // a pit wall that joins mid-race: seed the sectors from what the race already knows (the lap in progress
  // since the line, the last and best laps split by the reference sector shares) instead of blank columns
  try {
    for (const c of sim.cars) {
      const r = rec.cars[c.key]; if (c.status !== 'running' || !(c.dist > 0)) continue;
      const split = (T) => (T > 0 ? tf.map((x) => x * T) : [null, null, null]);
      if (c.lastLap > 0) { r.last = split(c.lastLap); r.lcls = ['y', 'y', 'y']; }
      if (c.bestLap > 0) r.pb = split(c.bestLap);
      const f = c.dist - Math.floor(c.dist), el = sim.time - (c.lapStart ?? 0);
      if (c.inPit > 0 || f < 0.01 || !(el > 0)) continue;
      const rate = el / f; // seconds per lap at the pace of the lap in progress
      for (let k = 0; k < r.idx; k++) { r.cur[k] = tf[k] * rate; r.cls[k] = 'y'; }
      r.t0 = (c.lapStart ?? 0) + (r.idx ? B[r.idx - 1] : 0) * rate;
    }
    if (sim.fastest?.key && sim.fastest.time < Infinity) { rec.best = tf.map((x) => x * sim.fastest.time); rec.bestKey = [0, 1, 2].map(() => sim.fastest.key); }
  } catch { /* */ }
  // gaps chart: the laps run before the pit wall was connected, from the lap-time history
  try {
    const cum = {}; let maxL = 0;
    for (const c of sim.cars) { let t = 0; cum[c.key] = (sim.history?.[c.key] || []).map((h) => (t += h.time)); maxL = Math.max(maxL, cum[c.key].length); }
    for (let l = 1; l <= maxL; l++) {
      const row = { l }; let lead = Infinity;
      for (const k in cum) if (cum[k][l - 1] != null) lead = Math.min(lead, cum[k][l - 1]);
      for (const k in cum) if (cum[k][l - 1] != null) row[k] = r1(cum[k][l - 1] - lead);
      rec.gh.push(row);
    }
    rec.ghLap = maxL;
  } catch { /* */ }
  const step = sim.step.bind(sim);
  sim.__pw = rec;
  sim.step = (dt) => {
    const t0 = sim.time; const d0 = sim.cars.map((c) => c.dist);
    const out = step(dt);
    try { after(sim, rec, B, trap, t0, d0); } catch (e) { console.warn('pitwall sectors', e); }
    return out;
  };
  return rec;
}
function secOf(d, B) { const f = d - Math.floor(d); return f < B[0] ? 0 : f < B[1] ? 1 : 2; }
function after(sim, rec, B, trap, t0, d0) {
  const t1 = sim.time; const neutral = !!(sim.sc || sim.vsc);
  sim.cars.forEach((c, i) => {
    const a = d0[i], b = c.dist; if (!(b > a) || c.status === 'dnf') return;
    const r = rec.cars[c.key]; if (!r) return;
    // every sector boundary crossed during this step, in order
    for (let L = Math.floor(a); L <= Math.floor(b); L++) {
      for (let k = 0; k < 3; k++) {
        const x = L + B[k];
        if (x <= a || x > b) continue;
        const ct = t0 + (t1 - t0) * (x - a) / (b - a);
        if (r.t0 != null && r.idx === k) {
          const t = ct - r.t0;
          let cls = 'y';
          if (!neutral && c.inPit <= 0 && t > 3) {
            if (rec.best[k] == null || t < rec.best[k]) { rec.best[k] = t; rec.bestKey = rec.bestKey || []; rec.bestKey[k] = c.key; cls = 'p'; }
            if (r.pb[k] == null || t < r.pb[k]) { r.pb[k] = t; if (cls !== 'p') cls = 'g'; }
          }
          r.cur[k] = t; r.cls[k] = cls;
          if (k === 2) { r.last = r.cur.slice(); r.lcls = r.cls.slice(); r.cur = [null, null, null]; r.cls = [null, null, null]; }
        }
        r.t0 = ct; r.idx = (k + 1) % 3;
      }
      // speed trap at the fastest point of the lap
      if (trap) {
        const x = L + trap.f;
        if (x > a && x <= b) {
          const v = trap.v * (trap.lap / Math.max(1, c.lapTarget)) * (sim.rain > 0.3 ? 0.93 : 1) + (c.drs ? 11 : 0) + (c.dirty ? 4 : 0) + (c.ersMode === 'deploy' ? 5 : c.ersMode === 'harvest' ? -4 : 0) + ((c.key.length * 13 + c.lap * 7) % 5) - 2;
          r.trap = Math.round(v); if (!r.trapBest || r.trap > r.trapBest) r.trapBest = r.trap;
        }
      }
    }
  });
  // gaps to the leader once per leader lap (gaps chart)
  const lead = sim.classification()[0];
  const lap = Math.floor(lead?.dist ?? 0);
  if (lead && lap > rec.ghLap && lap >= 1) {
    rec.ghLap = lap;
    const row = { l: lap };
    for (const c of sim.cars) if (c.status !== 'dnf') { const g = sim.gapToLeader(c, lead); row[c.key] = typeof g === 'number' ? r1(g) : null; }
    rec.gh.push(row); if (rec.gh.length > 400) rec.gh.shift();
  }
}

// ---------------- snapshots ----------------
function snapshot(slow, L = live()) {
  if (!L) return null;
  try {
    if (L.kind === 'race') return raceSnap(L, slow);
    if (L.kind === 'rally') return rallySnap(L, slow);
    return sessSnap(L, slow);
  } catch (e) { console.warn('pitwall snapshot', e); return null; }
}
function raceSnap(L, slow) {
  const { R, sim } = L; const rec = recorder(sim);
  const cls = sim.classification(); const leader = cls[0];
  let prevGap = 0;
  const lap = Math.min(sim.laps, Math.max(1, Math.floor(leader.status === 'finished' ? sim.laps : leader.dist) + 1));
  const cars = cls.map((c, i) => {
    const r = rec.cars[c.key] || {};
    const gl = i ? sim.gapToLeader(c, leader) : 0;
    let gap = null, int = null;
    if (typeof gl === 'number') { gap = r3(gl); if (typeof prevGap === 'number') int = r3(Math.max(0, gl - prevGap)); } else if (gl?.laps) { gap = `+${gl.laps}G`; int = null; }
    if (c.status !== 'dnf') prevGap = gl;
    const o = {
      k: c.key, p: i + 1, g: c.grid, st: c.status === 'dnf' ? 'dnf' : c.status === 'finished' ? 'fin' : c.inPit > 0 ? 'pit' : 'run',
      d: r3(c.status === 'finished' ? (sim.hl?.carU?.(c) ?? c.finishLap) : c.dist), lt: r3(c.lapTarget), gap, int, last: r3(c.lastLap), best: r3(c.bestLap), lap: c.lap,
      s: r.cur?.map(r3), sc: r.cls, ls: r.last?.map(r3), lsc: r.lcls, pb: r.pb?.map(r3), si: r.idx, trap: r.trap, trapB: r.trapBest,
      ty: c.tyre, age: c.stintLap ?? 0, w: r3(c.wear), stops: c.pitStops || 0, pen: c.penalty || 0, box: !!c.pitReq, drs: !!c.drs,
      dmg: r3((c.damage || 0) + (c.dmgFloor || 0)), iss: c.issue?.name || null, why: c.status === 'dnf' ? c.reason || 'Ritirato' : null,
      ers: c.isPlayer ? Math.round(c.ers) : null, mode: c.mode, em: c.ersMode, eng: c.eng || 'std',
    };
    if (c.isPlayer) Object.assign(o, myCar(sim, R, c, slow));
    return o;
  });
  const fk = sim.fastest?.key;
  const s = {
    live: true, sid: sidOf(L), kind: 'race', at: Date.now(), t: r3(sim.time), speed: R.speed, paused: !!R.paused || !!R.replay, fin: !!sim.finished,
    lap, laps: sim.laps, prog: r3(leader.status === 'finished' ? 1 : leader.dist / sim.laps),
    flag: sim.sc?.red ? 'red' : sim.sc ? 'sc' : sim.vsc ? (sim.endurance ? 'fcy' : 'vsc') : sim.finished ? 'end' : 'green',
    rain: r3(sim.rain), temp: sim.trackTemp, night: !!sim.night, fast: fk ? { k: fk, t: r3(sim.fastest.time) } : null,
    bs: rec.best.map(r3), bsk: rec.bestKey || [], focus: R.focus || null, view3d: R.view3d || null,
    orders: sim.teamOrders?.[cars.find((c) => c.me)?.teamId] || null,
    cars, dec: decisions(R.hub, sim), radio: (sim.radioQ || []).map((q) => ({ id: q.id, k: q.key, text: String(q.text || '').replace(/^[^:]+: /, '') })),
  };
  const mine = sim.cars.find((c) => c.isPlayer); if (mine) s.orders = sim.teamOrders?.[mine.teamId] || 'free';
  if (slow) {
    s.wx = (sim.weather?.plan || []).slice(0, sim.laps).map((x) => Math.round(x * 100) / 100);
    s.gh = rec.gh.slice(-120);
    s.stints = Object.fromEntries(sim.cars.map((c) => [c.key, (sim.history?.[c.key] || []).map((h) => COMPOUNDS[h.tyre]?.short || '?').join('')]));
    s.stops = (sim.stopsLog || []).slice(-60).map((x) => ({ k: x.key, l: x.lap, f: x.from, to: x.to, st: r1(x.stat), sc: !!x.sc }));
  }
  return s;
}
function myCar(sim, R, c, slow) {
  const o = { me: 1, teamId: c.teamId, auto: !!c.auto, temp: Math.round(c.temp), fuel: r3(sim.fuelMargin?.(c)), save: !!c.fuelSave, pitSel: R.pitSel?.[c.key] || null, planIdx: c.planIdx };
  o.plan = (c.plan || []).map((x) => ({ c: x.c, l: x.laps }));
  if (c.pitReq) o.pitReq = { c: c.pitReq.compound || null, lap: Math.min(sim.laps, Math.max(c.lap + 1, c.pitReq.minLap || 0)) };
  if (c.status === 'running') {
    try { const pi = sim.pitInfo(c); o.pi = { passed: pi.passed, this: Math.min(sim.laps, pi.thisLap), next: Math.min(sim.laps, pi.nextLap), toEntry: r1(pi.toEntry) }; } catch { /* */ }
    try { const sel = o.pitSel && o.pitSel !== 'none' && !COMPOUNDS[o.pitSel]?.wet ? o.pitSel : null; const pv = sim.pitPreview(c, sel); if (pv) o.pv = { pos: pv.pos, loss: r1(pv.loss), ahead: pv.ahead ? { k: pv.ahead.key, gap: r1(pv.ahead.gap) } : null, behind: pv.behind ? { k: pv.behind.key, gap: r1(pv.behind.gap) } : null, traffic: !!pv.traffic, stack: r1(pv.stack), uc: pv.undercut ? { k: pv.undercut.key, gap: r1(pv.undercut.gap), gain: r1(pv.undercut.gain), need: r1(pv.undercut.need), ok: !!pv.undercut.ok, c: pv.undercut.comp } : null }; } catch { /* */ }
    try { const f = sim.tyreForecast(c); if (f) o.fc = { laps: r1(f.laps), lo: f.lo, hi: f.hi, flag: !!f.toFlag }; } catch { /* */ }
    try { const rl = sim.reliability?.(c); if (rl) o.rel = r3(rl.risk); } catch { /* */ }
    try { const a = sim.advise?.(c); if (a?.text) o.adv = { text: String(a.text).replace(/<[^>]+>/g, ''), urgent: !!a.urgent }; } catch { /* */ }
    if (slow) {
      try { o.riv = sim.rivalGuess(c, 2).map((x) => ({ k: x.key, p: x.pos, gap: r1(x.gap), ty: x.tyre, age: x.age, w: r3(x.wear), stops: x.stops, inL: x.stopIn, pace: r3(x.pace) })); } catch { /* */ }
      try { const ah = sim.cars.find((x) => x.pos === c.pos - 1 && x.status === 'running'); const bh = sim.cars.find((x) => x.pos === c.pos + 1 && x.status === 'running'); o.oc = { ahead: ah ? { k: ah.key, gain: r1(sim.overcut(c, ah).gain) } : null, behind: bh ? { k: bh.key, gain: r1(sim.overcut(bh, c).gain) } : null }; } catch { /* */ }
      try { const rp = sim.remainingPlan(c); o.rest = rp.map((x) => ({ c: x.c, l: x.laps })); } catch { /* */ }
    }
  }
  if (slow) o.hist = (sim.history?.[c.key] || []).slice(-80).map((h) => [h.lap, r3(h.time), COMPOUNDS[h.tyre]?.short || '', Math.round((h.wear || 0) * 100), Math.round(h.temp || 0), h.pos, h.sc ? 1 : 0]);
  return o;
}
function sessSnap(L, slow) {
  const { P, sim } = L;
  const order = sim.order(); const best = order[0]?.best;
  const cars = order.map((c, i) => {
    const timed = c.state === 'run' && c.lap?.type === 'timed';
    const o = {
      k: c.key, p: i + 1, st: c.state === 'crashed' ? 'dnf' : c.state === 'garage' ? 'garage' : 'run', lapT: c.lap?.type || null,
      d: r3(c.dist), lt: r3(c.lap?.sec ? c.lap.sec[0] + c.lap.sec[1] + c.lap.sec[2] : sim.track.lap), best: r3(c.best), gap: c.best != null && i ? r3(c.best - best) : null,
      last: r3(c.lastLap), lcls: c.lastCls || '', s: (timed ? c.curSec : c.curSec).map(r3), sc: c.secCls, si: timed ? c.secIdx : null, pb: c.bestSec.map(r3),
      ty: c.tyre || c.bestTyre || null, age: c.set ? Math.round(c.set.age * 10) / 10 : null, w: c.set ? r3(sim.wear(c)) : null, laps: c.totalLaps, fuel: r1(c.fuel),
      box: !!c.callIn, pend: !!c.pending, work: c.workUntil > sim.time ? Math.round(c.workUntil - sim.time) : 0,
    };
    if (c.isPlayer) { o.me = 1; o.mode = c.run?.mode || null; o.hist = c.times.slice(-30).map((t) => [r3(t.t), COMPOUNDS[t.tyre]?.short || '', t.valid ? 1 : 0]); }
    return o;
  });
  return {
    live: true, sid: sidOf(L), kind: sim.isQuali ? 'quali' : 'practice', at: Date.now(), t: r3(sim.time), speed: P.speed, paused: !!P.paused, fin: !!sim.finished,
    clock: r1(sim.remaining), dur: sim.duration, prog: r3(sim.clock / sim.duration), adv: sim.adv || 0,
    flag: sim.red ? 'red' : sim.chequered ? 'end' : sim.yellow ? 'yellow' : 'green', yk: sim.yellow?.k ?? null,
    rain: r3(sim.rain), temp: Math.round(sim.trackTemp), rubber: r3(sim.rubber),
    fast: sim.best ? { k: sim.best.key, t: r3(sim.best.time) } : null, bs: sim.bestSec.map(r3), focus: P.focus || null, view3d: P.view3d || null,
    cars, dec: decisions(P.hub, sim),
  };
}
function rallySnap(L) {
  const { X, sim } = L; const stg = sim.stage;
  const crews = sim.crews.filter((c) => c.plan || c.done);
  const tOf = (c) => (c.done ? c.stageResult ?? c.stageT : null);
  const ranked = crews.slice().sort((a, b) => (b.done ? 1 : 0) - (a.done ? 1 : 0) || (a.done && b.done ? tOf(a) - tOf(b) : (b.progress || 0) - (a.progress || 0)));
  const done = ranked.filter((c) => c.done && tOf(c) != null);
  const bestT = done.length ? Math.min(...done.map(tOf)) : null;
  const spl = (c) => Object.entries(c.splitTimes || {}).filter(([k]) => +k < 1).sort((a, b) => +a[0] - +b[0]).map(([, v]) => r1(v));
  const cars = ranked.map((c, i) => ({
    k: c.key, p: i + 1, st: c.status === 'out' || c.retiredLeg ? 'dnf' : c.done ? 'fin' : 'run', d: r3(c.progress || 0), el: r1(c.stageT ?? null), time: r1(tOf(c)),
    gap: c.done && bestT != null ? r1(tOf(c) - bestT) : null, splits: spl(c), ty: c.tyre || null, me: c.isPlayer ? 1 : 0, total: r1(c.total ?? null), pace: c.pace || null,
    dmg: r3(Math.max(0, ...Object.values(c.damage || {}))), road: (c.roadPos ?? 0) + 1,
  }));
  return { live: true, sid: sidOf(L), kind: 'rally', at: Date.now(), t: r1(X.t), speed: X.speed, paused: !!X.paused, fin: false, prog: null, flag: null, rain: stg.wet ? 0.45 : 0, stage: sim.stageIdx + 1, stages: sim.stages.length, km: stg.km, cars, dec: decisions(X.hub, { time: X.t }) };
}
function decisions(hub, sim) {
  if (!hub) return [];
  const now = sim.time; const speed = hub.clock?.speed || 1; const paused = !!hub.clock?.paused;
  return hub.items.slice(0, 6).map((it) => ({
    id: it.id, prio: it.prio, title: it.title, text: it.text || '', eyebrow: it.eyebrow || '', color: it.color || null, who: it.who || null, focus: it.focus || null,
    options: (it.options || []).map((o) => ({ label: o.label, desc: o.desc || '' })), def: it.def ?? 0, modal: hub.cur === it,
    left: it.until != null ? r1(Math.max(0, it.until - now)) : null, real: it.until != null && !paused ? Math.ceil(Math.max(0, it.until - now) / Math.max(1, speed)) : null, span: r1(it.span || null),
  }));
}
// ---------------- feed ----------------
function evList(L) { if (!L) return []; if (L.kind === 'rally') return (L.sim.log || []).slice(0, 40).reverse(); return L.sim.events || []; }
function fmtEv(L, e) { return { t: r1(e.t ?? null), lap: e.lap ?? null, text: String(e.text || ''), type: e.type || e.kind || 'info', k: e.key || null, imp: !!(e.important || e.player) }; }
function newEvents(L) {
  const list = evList(L); const out = [];
  for (let i = list.length - 1; i >= 0 && out.length < 40; i--) { const e = list[i]; if (sentEvt.has(e)) break; sentEvt.add(e); if (e.type === 'comm' && !e.important) continue; out.unshift(fmtEv(L, e)); }
  return out;
}
function recentEvents(n) { const L = live(); const list = evList(L); for (const e of list) sentEvt.add(e); return list.filter((e) => e.type !== 'comm' || e.important).slice(-n).map((e) => fmtEv(L, e)); }

// ---------------- commands from the pit wall ----------------
const RACE_CMDS = new Set(['dec', 'pit', 'pitsel', 'mode', 'ers', 'eng', 'orders', 'speed', 'pause', 'radio', 'auto', 'rs-lift', 'rs-accept', 'view2d', 'cam', 'focus']);
const SESS_CMDS = new Set(['dec', 'ss-go', 'ss-callin', 'ss-abort', 'ss-speed', 'ss-pause', 'ss-focus', 'ss-view2d', 'ss-cam']);
const RALLY_CMDS = new Set(['dec', 'speed', 'pause']);
const KEYED = new Set(['pit', 'pitsel', 'mode', 'ers', 'eng', 'auto', 'rs-lift', 'rs-accept', 'ss-go', 'ss-callin', 'ss-abort']);
function command(c) {
  if (!c || typeof c.a !== 'string') return { ok: false, msg: 'Comando non valido' };
  const L = live();
  if (!L) return { ok: false, msg: 'Nessuna sessione in corso sul computer' };
  let a = c.a; const d = { ...(c.d || {}) };
  // the pit wall speaks one language: session screens have their own action names
  if (L.kind === 'practice' || L.kind === 'quali') a = { speed: 'ss-speed', pause: 'ss-pause', focus: 'ss-focus', view2d: 'ss-view2d', cam: 'ss-cam' }[a] || a;
  const allowed = L.kind === 'race' ? RACE_CMDS : L.kind === 'rally' ? RALLY_CMDS : SESS_CMDS;
  if (!allowed.has(a)) return { ok: false, msg: 'Comando non disponibile in questa sessione' };
  if (KEYED.has(a)) { const car = L.sim.cars.find((x) => x.key === d.key); if (!car?.isPlayer) return { ok: false, msg: 'Puoi dare ordini solo alle tue auto' }; }
  if (a === 'speed' || a === 'ss-speed') { const v = +d.v; if (![1, 2, 4, 8, 16, 32, 64].includes(v)) return { ok: false }; }
  if (a === 'pit' && d.cancel) { const car = L.sim.cars.find((x) => x.key === d.key); if (!car?.pitReq) return { ok: true }; delete d.when; delete d.cancel; }
  else if (a === 'pit') { const car = L.sim.cars.find((x) => x.key === d.key); if (car?.pitReq && !d.when) d.when = 'this'; if (d.c) { run('pitsel', { key: d.key, c: d.c }); } delete d.c; }
  if (a === 'dec') { const h = L.R?.hub || L.P?.hub || L.X?.hub; if (!h?.has?.(d.id) && !h?.items?.some((x) => String(x.id) === String(d.id))) return { ok: false, msg: 'Decisione già presa o scaduta' }; }
  run(a, d);
  return { ok: true };
}
// replay a UI action: a hidden button with the same data-* attributes, clicked on the page
function run(a, d) {
  let box = document.getElementById('pw-cmd');
  if (!box) { box = document.createElement('div'); box.id = 'pw-cmd'; box.hidden = true; document.body.appendChild(box); }
  const b = document.createElement('button');
  b.setAttribute('data-a', a);
  for (const [k, v] of Object.entries(d)) if (v != null && /^[a-z][a-zA-Z0-9]*$/.test(k)) b.dataset[k] = String(v);
  box.appendChild(b);
  try { b.click(); } finally { b.remove(); }
}
