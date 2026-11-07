// Live practice and qualifying sessions. Every car runs its own programme on track
// (out lap → timed laps → in lap), with a session clock, sectors, traffic, flags and
// track evolution. Laps here are REAL laps (real lap times, tyre age in real laps).
import { CATEGORIES, COMPOUNDS } from '../data/categories.js';
import { tyreModel, degPenalty, weatherFactor } from './tyres.js';
import { buildEntries, teamBaseLap, driverFactor, setupBias, SETUP_BIAS, TYRE_ALLOC, aiSetupQuality, realLaps } from './race.js';
import { compLapFactor } from './components.js';
import { referenceProfile, sampleAtTimeFrac, trackGeometry } from './trackphys.js';
import { hasPerk } from './progress.js';
import { rand, randInt, chance, clamp, gauss, pick } from './rng.js';

export const PRACTICE_DUR = 60 * 60;
const DRY = ['soft', 'medium', 'hard'];

// Qualifying format: knock-out Q1/Q2/Q3 for single-seaters, a single Hyperpole for endurance
export function qualiFormat(state) {
  const n = buildEntries(state).length;
  const cat = state.category;
  if (cat === 'endurance') return [{ name: 'Hyperpole', dur: 20 * 60 }];
  if ((cat === 'formula' || cat === 'junior') && n > 14) {
    const j = cat === 'junior';
    return [
      { name: 'Q1', dur: (j ? 15 : 18) * 60, adv: n - Math.round(n * 0.27) },
      { name: 'Q2', dur: (j ? 12 : 15) * 60, adv: 10 },
      { name: 'Q3', dur: (j ? 10 : 12) * 60 },
    ];
  }
  return [{ name: 'Qualifica', dur: 20 * 60 }];
}

// ---------- tyre sets of the weekend ----------
export function initSets(state) {
  const alloc = TYRE_ALLOC[state.category];
  const out = {};
  for (const e of buildEntries(state)) {
    const list = []; let n = 0;
    if (alloc) for (const c of DRY) for (let i = 0; i < alloc[c]; i++) list.push({ id: ++n, c, age: 0, used: false });
    out[e.key] = list;
  }
  return out;
}
export const limitedComp = (state, c) => !!TYRE_ALLOC[state.category] && DRY.includes(c);
export function newSetsLeft(state, list, c) {
  if (!limitedComp(state, c)) return Infinity;
  return (list || []).filter((x) => x.c === c && !x.used).length;
}
export function usedSets(list, c) { return (list || []).filter((x) => x.c === c && x.used && x.age < 40).sort((a, b) => a.age - b.age); }

// Fraction of lap TIME at which each sector (1/3, 2/3 of the distance) ends
const tfCache = {};
export function sectorFracs(cat, track) {
  const k = cat + track.cid + track.lap;
  if (tfCache[k]) return tfCache[k];
  const g = trackGeometry(track.cid);
  let out = [1 / 3, 2 / 3];
  try {
    const prof = referenceProfile(cat, track.cid, track.lap);
    const at = (tf) => sampleAtTimeFrac(prof, tf) / g.N;
    out = [1 / 3, 2 / 3].map((target) => { let lo = 0, hi = 1; for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (at(m) < target) lo = m; else hi = m; } return (lo + hi) / 2; });
  } catch { /* fallback to thirds */ }
  return (tfCache[k] = [out[0], out[1] - out[0], 1 - out[1]]);
}

// fuel model shared with the strategy tools
export function fuelModel(state, track) {
  const ls = track.lap / 90;
  const C = CATEGORIES[state.category];
  if (C.refuel) { const stint = 2700 / track.lap; return { perLap: (1.6 * ls) / stint, tank: stint, kgPerLap: 90 / stint }; }
  const rl = realLaps(state, track);
  return { perLap: (3.1 * ls) / rl, tank: rl + 3, kgPerLap: 100 / rl };
}

export class SessionSim {
  // o: { kind: 'practice'|'quali', name, duration, keys, rain, rubber, setups, sets, trackTemp, adv }
  constructor(state, track, o) {
    this.state = state; this.track = track; this.cat = state.category; this.C = CATEGORIES[this.cat];
    this.kind = o.kind; this.name = o.name; this.duration = o.duration; this.adv = o.adv || 0;
    this.isQuali = o.kind === 'quali';
    this.rain = o.rain || 0; this.rubber = o.rubber ?? 0; this.rubber0 = this.rubber;
    this.trackTemp = o.trackTemp ?? 32;
    this.ls = track.lap / 90;
    this.sets = o.sets;
    this.fm = fuelModel(state, track);
    this.tf = sectorFracs(this.cat, track);
    this.time = 0; this.clock = 0; this.flag = 'green'; this.yellow = null; this.red = null; this.chequered = false; this.finished = false;
    this.events = []; this.best = null; this.bestSec = [null, null, null]; this.reds = 0;
    const entries = buildEntries(state).filter((e) => !o.keys || o.keys.includes(e.key));
    this.cars = entries.map((e, i) => {
      const team = state.teams[e.teamId];
      return {
        ...e, team, driverIdx: 0, auto: !e.isPlayer, sq: o.setups?.[e.key] ?? aiSetupQuality(state, team), box: i,
        state: 'garage', lapBase: 0, dist: 0, lap: null, secIdx: 0, secT: 0, curSec: [null, null, null], secCls: [null, null, null],
        best: null, bestTyre: null, bestSec: [null, null, null], lastLap: null, lastCls: '', times: [], totalLaps: 0,
        tyre: null, set: null, fuel: 0, run: null, runs: [], workUntil: 0, prog: [], callIn: false, repairAt: null,
        smart: e.isPlayer ? 0.9 : clamp(0.55 + rand(-0.15, 0.3), 0.3, 1),
      };
    });
    if (!this.isQuali) for (const c of this.cars) if (c.auto) this.planPractice(c);
    if (this.isQuali) for (const c of this.cars) if (c.auto) this.planQuali(c);
  }

  driver(c) { return this.state.drivers[c.driverIds[c.driverIdx]] || this.state.drivers[c.driverIds[0]]; }
  car(key) { return this.cars.find((x) => x.key === key); }
  log(text, type = 'info', key = null, important = false) { this.events.push({ t: this.clock, text, type, key, important }); if (this.events.length > 300) this.events.shift(); }
  get remaining() { return Math.max(0, this.duration - this.clock); }
  onTrack(c) { return c.state === 'run'; }

  wearMult(c, mode = 'normal') {
    const d = this.driver(c);
    const tp = c.team.car.parts.tyre ?? 75;
    let w = (1.18 - tp / 420 - d.attrs.tyre / 520) * { push: 1.32, normal: 1, save: 0.72 }[mode];
    w *= 1 + (this.trackTemp - 32) * 0.008;
    if (c.isPlayer && hasPerk(this.state, 'tyre_reader')) w *= 0.94;
    w *= SETUP_BIAS[setupBias(this.state, c.key, this.track)]?.wear ?? 1;
    return w;
  }
  life(c, tyre = c.tyre) { return tyreModel(this.cat, tyre).life / (this.track.wear * this.wearMult(c, 'normal')); }
  wear(c) { return c.set ? c.set.age / this.life(c, c.set.c) : 0; }
  evoPen() { return Math.max(0, (1 - this.rubber) * 0.85 - 0.05) * this.ls; }
  base(c) {
    const d = this.driver(c);
    const bias = SETUP_BIAS[setupBias(this.state, c.key, this.track)];
    return teamBaseLap(this.state, c.team, this.track) * compLapFactor(this.state, d) * (1 + bias.q) * (1 - c.sq * 0.005);
  }
  // clean flying lap (no noise) for a car on a tyre/fuel/mode
  flying(c, mode = 'normal', tyre = c.tyre, age = c.set?.age ?? 0, fuel = c.fuel) {
    const d = this.driver(c);
    const m = tyreModel(this.cat, tyre);
    const life = this.life(c, tyre);
    let t = this.base(c) * driverFactor(d, this.rain, this.state) * weatherFactor(tyre, this.rain);
    t += m.pace * this.ls + degPenalty(m, age, life) * this.ls + Math.max(0, fuel) * this.fm.perLap + this.evoPen();
    t += { push: -0.14, normal: 0, save: 0.45 }[mode] * this.ls;
    return t;
  }

  // ---------- tyre sets ----------
  setsOf(key) { return (this.sets[key] ||= []); }
  // takes a set: `setId` a specific (used) set, otherwise a new one (used one as fallback)
  takeSet(c, comp, setId = null) {
    const list = this.setsOf(c.key);
    if (setId != null) { const s = list.find((x) => x.id === setId && x.c === comp); if (s) return s; }
    let s = list.find((x) => x.c === comp && !x.used);
    if (!s && !limitedComp(this.state, comp)) { s = { id: list.reduce((a, x) => Math.max(a, x.id), 0) + 1, c: comp, age: 0, used: false }; list.push(s); }
    if (!s) s = usedSets(list, comp)[0];
    return s || null;
  }

  // ---------- running ----------
  canGo(c) {
    if (c.state !== 'garage') return 'L’auto è già in pista';
    if (this.chequered) return 'Bandiera a scacchi: sessione finita';
    if (this.red) return 'Bandiera rossa: pit lane chiusa';
    if (this.time < c.workUntil) return 'I meccanici stanno ancora lavorando';
    return null;
  }
  // spec: { c, setId, fuel (laps of fuel), laps (timed laps), mode, pattern: 'single'|'double' (quali), driverIdx }
  sendOut(key, spec) {
    const c = this.car(key); if (!c) return 'Auto non trovata';
    const err = this.canGo(c); if (err) return err;
    const set = this.takeSet(c, spec.c, spec.setId);
    if (!set) return `Nessun set di ${COMPOUNDS[spec.c].name} disponibile`;
    set.used = true;
    if (spec.driverIdx != null && c.driverIds[spec.driverIdx]) c.driverIdx = spec.driverIdx;
    c.tyre = spec.c; c.set = set;
    c.fuel = clamp(spec.fuel ?? 5, 1.5, this.fm.tank);
    const laps = clamp(Math.round(spec.laps || 1), 1, 40);
    const seq = ['out'];
    if (this.isQuali && spec.pattern === 'double') seq.push('timed', 'cool', 'timed');
    else for (let i = 0; i < laps; i++) seq.push('timed');
    seq.push('in');
    c.run = { spec: { ...spec, laps }, seq, i: 0, mode: spec.mode || (this.isQuali ? 'push' : 'normal'), times: [], start: this.clock, startAge: set.age, startFuel: c.fuel, comp: spec.c, kind: spec.kind || null };
    c.state = 'run'; c.callIn = false; c.lapBase = Math.ceil(c.dist - 1e-6);
    c.curSec = [null, null, null]; c.secCls = [null, null, null];
    this.planLap(c, 'out');
    if (c.isPlayer) this.log(`🟢 ${this.driver(c).name} esce dai box: ${COMPOUNDS[spec.c].name}${set.age > 0.5 ? ' usate' : ' nuove'}, ${c.fuel.toFixed(1)} giri di benzina.`, 'pit', c.key, true);
    return null;
  }
  // send the car out once the mechanics have finished (setup changes take session time)
  queueOut(key, spec, delay) {
    const c = this.car(key); if (!c) return 'Auto non trovata';
    if (c.state !== 'garage') return 'L’auto è già in pista';
    if (this.chequered) return 'Bandiera a scacchi: sessione finita';
    c.pending = { ...spec }; c.workUntil = Math.max(c.workUntil, this.time + delay);
    return null;
  }
  callIn(key) { const c = this.car(key); if (c && c.state === 'run') { c.callIn = true; if (c.isPlayer) this.log(`📻 Box, box: ${this.driver(c).name} rientra a fine giro.`, 'radio', key, true); } }
  abortLap(key) {
    const c = this.car(key); if (!c || c.state !== 'run' || !c.lap) return;
    if (c.lap.type === 'timed') {
      c.lap.type = 'cool'; c.lap.valid = false; c.lap.aborted = true;
      for (let k = c.secIdx; k < 3; k++) c.lap.sec[k] *= k === c.secIdx ? 1.15 : 1.3;
    }
    c.callIn = true;
    if (c.isPlayer) this.log(`📻 Giro abortito: ${this.driver(c).name} alza il piede e rientra.`, 'radio', key, true);
  }
  extendRun(key, delta) {
    const c = this.car(key); if (!c?.run) return;
    const seq = c.run.seq; const last = seq.length - 1;
    if (delta > 0) seq.splice(last, 0, 'timed');
    else { const idx = seq.lastIndexOf('timed'); if (idx > c.run.i) seq.splice(idx, 1); }
  }

  planLap(c, type) {
    const mode = c.run?.mode || 'normal';
    let t = this.flying(c, type === 'timed' ? mode : 'normal');
    const d = this.driver(c);
    const L = { type, valid: true, sec: null, notes: [] };
    if (type === 'out') t = t * (this.isQuali ? 1.24 : 1.13) + 6;
    else if (type === 'in') t = t * 1.16 + 4;
    else if (type === 'cool') t = t * 1.3;
    else {
      t *= 1 + gauss(0, 0.0022 * (1.45 - d.attrs.cons / 100));
      const sec = this.tf.map((f) => f * t);
      const errP = { push: 0.11, normal: 0.045, save: 0.02 }[mode] * (1.3 - d.attrs.cons / 100) * (1 + this.rain * 1.5);
      if (chance(errP)) {
        const k = randInt(0, 2); const loss = rand(0.3, 2.6) * this.ls;
        sec[k] += loss; L.err = { k, loss };
        if (loss > 2.2 * this.ls && chance(0.6)) L.spin = k;
      }
      const tlP = (mode === 'push' ? 0.045 : 0.02) * (1.3 - d.attrs.cons / 100) * (1 - (this.track.street || 0) * 0.7);
      if (chance(tlP)) L.tl = true;
      const crashP = 0.0018 * { push: 1.8, normal: 1, save: 0.5 }[mode] * (1.35 - d.attrs.cons / 100) * (1 + this.rain * 3) * (this.wear(c) > 1 ? 3 : 1);
      if (chance(crashP)) L.crash = { k: randInt(0, 2), f: rand(0.2, 0.9) };
      L.sec = sec;
    }
    if (!L.sec) L.sec = this.tf.map((f) => f * t * (1 + gauss(0, 0.004)));
    c.lap = L; c.secIdx = 0; c.secT = 0;
    if (type === 'timed') { c.curSec = [null, null, null]; c.secCls = [null, null, null]; }
    this.enterSector(c, 0);
  }

  enterSector(c, k) {
    const L = c.lap;
    if (L.type === 'timed' && this.yellow && this.yellow.k === k) {
      const loss = rand(0.25, 0.7) * this.ls; L.sec[k] += loss;
      L.notes.push('yellow');
    }
  }

  sectorDone(c, k) {
    const L = c.lap; const t = L.sec[k];
    if (L.type === 'timed') {
      c.curSec[k] = t;
      let cls = 'y';
      if (L.valid) {
        if (this.bestSec[k] == null || t < this.bestSec[k]) { this.bestSec[k] = t; cls = 'p'; }
        if (c.bestSec[k] == null || t < c.bestSec[k]) { c.bestSec[k] = t; if (cls !== 'p') cls = 'g'; }
      }
      c.secCls[k] = cls;
    }
    if (k < 2) { c.secIdx = k + 1; c.secT = 0; this.enterSector(c, k + 1); return; }
    this.lapDone(c);
  }

  lapDone(c) {
    const L = c.lap; const t = L.sec[0] + L.sec[1] + L.sec[2];
    const d = this.driver(c);
    c.lapBase += 1; c.dist = c.lapBase; c.totalLaps++;
    // tyre and fuel
    const mode = L.type === 'timed' ? c.run.mode : 'normal';
    const tf = { out: 0.55, in: 0.5, cool: 0.4, timed: 1 }[L.type];
    if (c.set) c.set.age += this.track.wear * this.wearMult(c, mode) * tf;
    c.fuel = Math.max(0, c.fuel - ({ out: 0.7, in: 0.6, cool: 0.55, timed: { push: 1.05, normal: 1, save: 0.94 }[mode] }[L.type]));
    this.rubber = clamp(this.rubber + (1 - this.rubber) * (this.isQuali ? 0.005 : 0.0018) * (1 - this.rain * 0.8), 0, 1);
    if (L.type === 'timed') {
      if (L.tl) { L.valid = false; if (c.isPlayer || chance(0.3)) this.log(`⚠ Giro cancellato a ${d.name}: limiti della pista.`, 'warn', c.key, c.isPlayer); }
      c.lastLap = t; c.lastValid = L.valid;
      const rec = { t, tyre: c.tyre, age: c.set?.age ?? 0, fuel: c.fuel, mode, valid: L.valid, notes: L.notes.slice(), err: !!L.err };
      c.run.times.push(rec);
      if (L.valid) {
        c.times.push(rec);
        const pb = !c.best || t < c.best;
        const ob = !this.best || t < this.best.time;
        c.lastCls = ob ? 'p' : pb ? 'g' : 'y';
        if (pb) { c.best = t; c.bestTyre = c.tyre; c.bestAt = this.clock; }
        if (ob) { this.best = { time: t, key: c.key }; if (this.clock > 60) this.log(`🟣 ${d.name} è il più veloce: ${fmt(t)} (${COMPOUNDS[c.tyre].short}).`, 'fast', c.key, c.isPlayer); }
        else if (c.isPlayer && pb) this.log(`⏱ ${d.name}: ${fmt(t)} · P${this.position(c)}${this.best ? ` (+${(t - this.best.time).toFixed(3)})` : ''}`, 'lap', c.key, true);
      } else c.lastCls = 'x';
      if (L.notes.includes('yellow') && c.isPlayer) this.log(`🟡 ${d.name} ha dovuto alzare il piede per la bandiera gialla.`, 'warn', c.key, true);
    }
    // next lap
    const r = c.run;
    if (L.type === 'in') { this.toGarage(c); return; }
    r.i++;
    let next = r.seq[r.i] || 'in';
    const lapsNeeded = r.seq.slice(r.i).reduce((a, x) => a + (x === 'timed' ? 1 : 0.6), 0);
    if (c.callIn || this.red || this.chequered || this.clock >= this.duration) next = 'in';
    else if (next === 'timed' && c.fuel < 1.6) { next = 'in'; if (c.isPlayer) this.log(`⛽ ${d.name}: benzina finita per questo run, rientra.`, 'pit', c.key, true); }
    else if (next === 'timed' && c.auto && this.wear(c) > 1.02) next = 'in';
    else if (next === 'timed' && c.isPlayer && c.fuel < lapsNeeded && !r.fuelWarn) { r.fuelWarn = true; this.log(`📻 Ingegnere: «Benzina per ${c.fuel.toFixed(1)} giri, accorciamo il run.»`, 'radio', c.key, true); }
    if (next === 'in') r.i = r.seq.length - 1;
    this.planLap(c, next);
  }

  toGarage(c) {
    const r = c.run;
    c.state = 'garage'; c.lap = null; c.callIn = false;
    if (r) {
      const sum = { comp: r.comp, setId: c.set?.id, startAge: r.startAge, endAge: c.set?.age ?? 0, startFuel: r.startFuel, mode: r.mode, times: r.times, start: r.start, end: this.clock, kind: r.kind };
      c.runs.push(sum);
      c.run = null;
      this.onRunEnd?.(c, sum);
    }
    c.workUntil = this.time + (c.auto ? (this.isQuali ? rand(50, 110) : rand(100, 260)) : (this.isQuali ? 40 : 60));
    if (c.auto) this.aiNext(c);
  }

  position(c) {
    const order = this.order();
    return order.indexOf(c) + 1;
  }
  order() {
    return this.cars.slice().sort((a, b) => (a.best ?? 1e9) - (b.best ?? 1e9) || (a.bestAt ?? 0) - (b.bestAt ?? 0));
  }

  // ---------- flags ----------
  redFlag(c) {
    this.red = { until: this.time + rand(200, 420), by: c?.key };
    this.flag = 'red'; this.reds++;
    this.log(`🟥 BANDIERA ROSSA${c ? `: incidente per ${this.driver(c).name}` : ''}. Sessione sospesa, tutti ai box.`, 'red', c?.key, true);
    for (const x of this.cars) {
      if (x.state !== 'run' || !x.lap) continue;
      if (x.lap.type !== 'in') { x.lap.type = 'in'; x.lap.valid = false; for (let k = x.secIdx; k < 3; k++) x.lap.sec[k] *= 1.6; }
      x.callIn = true;
    }
  }
  yellowFlag(c, k) {
    this.yellow = { k, until: this.time + rand(18, 45) };
    if (this.flag === 'green') this.flag = 'yellow';
    this.log(`🟡 Bandiera gialla nel settore ${k + 1}: testacoda di ${this.driver(c).name}.`, 'yellow', c.key, c.isPlayer);
  }

  step(dt) {
    if (this.finished) return;
    this.time += dt;
    if (!this.red) this.clock += dt;
    if (this.red && this.time >= this.red.until) {
      this.red = null; this.flag = this.yellow ? 'yellow' : 'green';
      this.log(`🟢 La sessione riprende. Restano ${Math.ceil(this.remaining / 60)} minuti.`, 'green', null, true);
      for (const c of this.cars) if (c.auto && c.state === 'garage') this.aiNext(c, true);
    }
    if (this.yellow && this.time > this.yellow.until) { this.yellow = null; if (!this.red && !this.chequered) this.flag = 'green'; }
    if (!this.chequered && this.clock >= this.duration) {
      this.chequered = true; this.flag = 'chequered';
      this.log('🏁 Bandiera a scacchi! Chi è già nel giro lanciato può completarlo.', 'finish', null, true);
    }
    for (const c of this.cars) {
      if (c.state === 'crashed') {
        if (!this.isQuali && c.repairAt != null && this.clock >= c.repairAt) { c.state = 'garage'; c.repairAt = null; c.dist = c.lapBase; this.log(`🔧 L’auto di ${this.driver(c).name} è riparata.`, 'pit', c.key, c.isPlayer); }
        continue;
      }
      if (c.state === 'garage') {
        if (c.pending && (this.chequered || c.auto)) c.pending = null;
        if (c.pending && !this.red && this.time >= c.workUntil) { const sp = c.pending; c.pending = null; const err = this.sendOut(c.key, sp); if (err) this.log(`⚠ ${this.driver(c).name}: ${err}.`, 'warn', c.key, true); }
        if (c.auto && c.prog.length && !this.chequered && !this.red && this.time >= c.workUntil && this.clock >= c.prog[0].at) this.aiStart(c);
        continue;
      }
      let rem = dt;
      while (rem > 0 && c.lap) {
        const k = c.secIdx, L = c.lap;
        if (L.crash && L.crash.k === k && c.secT + rem >= L.sec[k] * L.crash.f) { this.crash(c); break; }
        const need = L.sec[k] - c.secT;
        if (rem < need) { c.secT += rem; rem = 0; } else { rem -= need; c.secT = L.sec[k]; this.sectorDone(c, k); }
      }
      if (c.lap) {
        const f = this.tf; const k = c.secIdx;
        const cum = k === 0 ? 0 : k === 1 ? f[0] : f[0] + f[1];
        c.dist = c.lapBase + cum + f[k] * Math.min(1, c.secT / c.lap.sec[k]);
        if (c.lap.spin === k && c.secT > c.lap.sec[k] * 0.5) { c.lap.spin = null; this.yellowFlag(c, k); }
      }
    }
    this.traffic();
    if (this.chequered && this.cars.every((c) => c.state !== 'run')) { this.finished = true; this.log(`Fine della sessione ${this.name}.`, 'finish', null, true); }
    if (this.clock > this.duration + 900) this.finished = true;
  }

  crash(c) {
    const d = this.driver(c);
    c.state = 'crashed'; c.lap = null;
    if (c.run) { c.runs.push({ comp: c.run.comp, times: c.run.times, start: c.run.start, end: this.clock, crashed: true, startAge: c.run.startAge, endAge: c.set?.age ?? 0, startFuel: c.run.startFuel, mode: c.run.mode }); c.run = null; }
    if (c.set) c.set.age = 99; // the set is ruined
    this.log(`💥 ${d.name} finisce contro le barriere!`, 'crash', c.key, true);
    if (!this.isQuali) c.repairAt = this.clock + 20 * 60;
    if (!this.red && !this.chequered) { if (chance(0.7)) this.redFlag(c); else this.yellowFlag(c, 1); }
    this.onCrash?.(c);
  }

  // slower cars (out/in/cool laps) in the way of a car on a timed lap
  traffic() {
    const run = this.cars.filter((c) => c.state === 'run' && c.lap);
    for (const c of run) {
      if (c.lap.type !== 'timed' || c.lap.trafficDone) continue;
      for (const o of run) {
        if (o === c || o.lap.type === 'timed') continue;
        let g = (o.dist - c.dist); g -= Math.floor(g); // laps ahead (0..1)
        const gs = g * this.track.lap;
        if (gs > 0 && gs < 1.1) {
          c.lap.trafficDone = true;
          const p = 0.3 * (1.25 - o.smart * 0.5);
          if (chance(p)) {
            const loss = rand(0.15, 0.85) * this.ls * (this.chequered || this.remaining < 150 ? 1.4 : 1);
            c.lap.sec[c.secIdx] += loss; c.lap.notes.push('traffic');
            if (c.isPlayer) this.log(`🚦 Traffico! ${this.driver(c).name} trova ${this.driver(o).name} in un giro lento: perde ${loss.toFixed(1)}s.`, 'warn', c.key, true);
          }
          break;
        }
      }
    }
  }

  runToEnd(max = 200000) { let n = 0; while (!this.finished && n++ < max) this.step(0.5); }

  // ---------- AI programmes ----------
  wetComp() { return this.rain > 0.55 ? 'wet' : this.rain > 0.2 ? (this.C.compounds.includes('inter') ? 'inter' : 'wet') : null; }
  planPractice(c, from = 0) {
    const D = this.duration; const wet = this.wetComp();
    const hard = this.C.compounds.includes('hard') ? 'hard' : 'medium';
    const all = [
      { at: rand(0, 0.07) * D, c: wet || (chance(0.5) ? 'medium' : hard), laps: 1, mode: 'normal', fuel: 'mid', kind: 'install', used: true },
      { at: rand(0.14, 0.3) * D, c: wet || 'medium', laps: randInt(3, 5), mode: 'normal', fuel: 'mid', kind: 'setup', used: true },
      { at: rand(0.38, 0.55) * D, c: wet || 'soft', laps: randInt(1, 2), mode: 'push', fuel: 'low', kind: 'quali' },
      { at: rand(0.58, 0.74) * D, c: wet || (chance(0.55) ? 'medium' : hard), laps: randInt(7, 12), mode: chance(0.6) ? 'normal' : 'save', fuel: 'high', kind: 'long', used: chance(0.5) },
    ];
    if (this.cat === 'endurance' || chance(0.25)) all.push({ at: rand(0.82, 0.88) * D, c: wet || 'soft', laps: randInt(2, 4), mode: 'normal', fuel: 'mid', kind: 'setup', used: true });
    c.prog = all.filter((r) => r.at >= from - 60);
  }
  planQuali(c) {
    const D = this.duration; const est = this.track.lap * 1.02;
    const out = est * 1.24 + 6;
    const comp = this.wetComp() || 'soft';
    const p = [];
    const short = D < 14 * 60;
    const double = !short && chance(0.35);
    p.push({ at: rand(short ? 0.01 : 0.05, short ? 0.12 : 0.3) * D, c: comp, mode: 'push', pattern: double ? 'double' : 'single', fuel: 'low', kind: 'q1' });
    // the last timed lap only has to START before the chequered flag
    const t2 = D - out - rand(6, 70);
    const runLen = out + est * (double ? 2.3 + 1.3 : 1) + est * 1.16 + 4 + 85;
    if (t2 > p[0].at + runLen) p.push({ at: t2, c: comp, mode: 'push', pattern: 'single', fuel: 'low', kind: 'q2', last: true });
    c.prog = p;
  }
  aiNext(c, resumed = false) {
    if (this.isQuali && c.prog.length && c.prog[0].last && c.best && this.adv && !resumed) {
      // comfortably through? some top teams save a set of tyres
      const pos = this.position(c);
      if (pos <= 3 && chance(0.25 * c.smart)) { c.prog = []; return; }
    }
    if (this.isQuali && this.red == null && c.prog.length === 0 && !this.chequered) {
      // red flag ruined the plan: one more go if there's time
      const est = this.track.lap * 1.02;
      if (this.remaining > est * 2.4 + 30 && resumed) c.prog.push({ at: this.clock, c: this.wetComp() || 'soft', mode: 'push', pattern: 'single', fuel: 'low', kind: 'q2', last: true });
    }
  }
  aiStart(c) {
    const r = c.prog[0];
    const est = this.track.lap * 1.02;
    // not enough time for an out lap + a timed lap: forget it
    if (this.isQuali && this.remaining < est * 1.24 + 8) { c.prog.shift(); return; }
    c.prog.shift();
    const list = this.setsOf(c.key);
    let setId = null;
    if (r.used || (this.isQuali && r.kind === 'q1' && c.smart > 0.75 && chance(0.25))) { const u = usedSets(list, r.c).find((x) => x.age < 8); if (u) setId = u.id; }
    const laps = r.pattern === 'double' ? 2 : r.laps || 1;
    const fuel = r.fuel === 'low' ? laps + 2.2 : r.fuel === 'mid' ? laps + 6 : laps + Math.min(this.fm.tank * 0.75, 14);
    if (this.cat === 'endurance' && c.driverIds.length > 1) c.driverIdx = (c.runs.length % c.driverIds.length);
    const err = this.sendOut(c.key, { c: r.c, setId, fuel, laps, mode: r.mode, pattern: r.pattern, kind: r.kind });
    if (err) c.workUntil = this.time + 30;
  }
  // the engineer takes over a player car (simulate rest of the session)
  autoPilot(key) {
    const c = this.car(key); if (!c || c.auto) return;
    c.auto = true;
    if (this.isQuali) {
      this.planQuali(c);
      c.prog = c.prog.filter((r) => r.at >= this.clock - 30);
      if (!c.prog.length && !c.best) c.prog.push({ at: this.clock, c: this.wetComp() || 'soft', mode: 'push', pattern: 'single', fuel: 'low', kind: 'q2', last: true });
    } else this.planPractice(c, this.clock);
  }

  results() {
    return this.order().map((c) => ({ key: c.key, time: c.best ?? null, laps: c.totalLaps, tyre: c.bestTyre }));
  }
}

function fmt(t) { const m = Math.floor(t / 60); return `${m}:${(t - m * 60).toFixed(3).padStart(6, '0')}`; }
