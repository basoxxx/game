// Circuit race simulation (Formula & Endurance) driven by the physics lap model
import { CATEGORIES, COMPOUNDS } from '../data/categories.js';
import { pointsFor } from './season.js';
import { physicsLap } from './trackphys.js';
import { tyreModel, degPenalty, tempPenalty, weatherFactor, strategyOptions } from './tyres.js';
import { rand, randInt, chance, clamp, gauss, pick } from './rng.js';
import { hasPerk } from './progress.js';

export const RACE_LENGTHS = { short: 0.25, normal: 0.4, long: 0.66, full: 1 };

export function realLaps(state, track) {
  if (track.laps) return track.laps;
  // endurance: laps in the real race
  return Math.round((track.hours * 3600) / (track.lap * 1.07));
}

export function raceLaps(state, track) {
  if (state.category === 'endurance') {
    const base = { short: 26, normal: 40, long: 64, full: 90 }[state.raceLength] || 40;
    return track.double ? Math.round(base * 1.6) : track.hours >= 8 ? Math.round(base * 1.2) : base;
  }
  const f = RACE_LENGTHS[state.raceLength] ?? 0.4;
  return Math.max(8, Math.round(track.laps * f));
}

export function makeWeatherPlan(track, laps, forcedRain) {
  const plan = new Array(laps + 2).fill(0);
  const isRain = forcedRain ?? chance(track.rain);
  let summary = 'Sereno';
  if (isRain) {
    const type = forcedRain === true ? pick(['start', 'full', 'full', 'shower']) : pick(['shower', 'start', 'late', 'full']);
    let s, e, peak;
    if (type === 'shower') { s = randInt(2, Math.floor(laps * 0.6)); e = s + randInt(3, Math.max(4, Math.floor(laps * 0.35))); peak = rand(0.35, 0.8); }
    else if (type === 'start') { s = 0; e = randInt(Math.floor(laps * 0.25), Math.floor(laps * 0.6)); peak = rand(0.5, 0.95); }
    else if (type === 'late') { s = randInt(Math.floor(laps * 0.5), Math.floor(laps * 0.8)); e = laps + 1; peak = rand(0.4, 0.9); }
    else { s = 0; e = laps + 1; peak = rand(0.4, 0.75); }
    for (let i = 0; i <= laps + 1; i++) {
      if (i >= s && i <= e) {
        const ramp = Math.min(1, (i - s + 1) / 2.5, (e - i + 1) / 2.5);
        plan[i] = clamp(peak * ramp + rand(-0.07, 0.07), 0, 1);
      }
    }
    summary = type === 'full' ? 'Pioggia per tutta la gara' : type === 'start' ? 'Pioggia iniziale, poi in asciugatura' : type === 'late' ? 'Pioggia attesa nel finale' : 'Possibili rovesci a metà gara';
  }
  const trackTemp = Math.round(isRain ? rand(16, 24) : rand(24, 48) + (track.night ? -8 : 0));
  return { plan, isRain, summary, trackTemp };
}

export function buildEntries(state) {
  const C = CATEGORIES[state.category];
  const entries = [];
  for (const team of Object.values(state.teams)) {
    for (let k = 0; k < C.cars; k++) {
      const driverIds = team.drivers.slice(k * C.driversPerCar, (k + 1) * C.driversPerCar);
      if (!driverIds.length) continue;
      entries.push({ key: `${team.id}#${k}`, teamId: team.id, carIdx: k, driverIds, isPlayer: !!team.isPlayer });
    }
  }
  return entries;
}

export function aiSetupQuality(state, team) {
  const eng = state.staff[team.staff.engineer]?.rating || 65;
  return clamp(0.42 + eng / 100 * 0.38 + (team.facilities.simulator - 3) * 0.03 + rand(-0.12, 0.12), 0.2, 0.97);
}

const aiSmart = (state) => ({ easy: 0.55, normal: 0.8, hard: 0.97 }[state.difficulty] ?? 0.8);

// Base dry lap (s) for a team car on a track: physics from parts, calibrated to real laps
export function teamBaseLap(state, team, track) {
  // track affinity: small, consistent per team/track/season (car "likes" some circuits)
  let h = 0; for (const ch of team.id + track.id + state.season) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const aff = ((h % 1000) / 1000 - 0.5) * 0.006;
  return physicsLap(state.category, track, team.car.parts) * (1 + aff);
}

// weekend form: each driver/car has a small random form for the event (same in quali and race)
export function weekendForm(state, d) {
  const key = `${state.season}-${state.round}`;
  if (!d._form || d._form.k !== key) d._form = { k: key, v: gauss(0, 0.0026) };
  return d._form.v;
}
function driverFactor(d, rain, state) {
  const pace = d.attrs.pace * (1 - rain) + d.attrs.wet * rain;
  return 1 - (pace - 80) * 0.00048 - (d.morale - 70) * 0.00005 + (state ? weekendForm(state, d) : 0);
}

// ------------------ QUALIFYING ------------------
export function runQualifying(state, track, setups, rainLevel = 0, playerRisk = {}) {
  const entries = buildEntries(state);
  const C = CATEGORIES[state.category];
  const cat = state.category;
  const soft = tyreModel(cat, rainLevel > 0.55 ? 'wet' : rainLevel > 0.2 && C.compounds.includes('inter') ? 'inter' : 'soft');
  const laps = entries.map((e) => {
    const team = state.teams[e.teamId];
    const d = state.drivers[e.driverIds[0]];
    const sq = setups[e.key] ?? aiSetupQuality(state, team);
    const risk = playerRisk[e.key] || 'normal';
    const base = teamBaseLap(state, team, track) * driverFactor(d, rainLevel, state) * (1 - sq * 0.005) * (soft.wet ? weatherFactor(rainLevel > 0.55 ? 'wet' : 'inter', rainLevel) : weatherFactor('soft', rainLevel)) + soft.pace * track.lap / 90;
    const lap = () => {
      let t = base * (1 + gauss(0, 0.0022 * (1.45 - d.attrs.cons / 100)));
      if (risk === 'push') t -= 0.14 * track.lap / 90;
      if (risk === 'safe') t += 0.12 * track.lap / 90;
      const errP = (risk === 'push' ? 0.12 : risk === 'safe' ? 0.02 : 0.05) * (1.3 - d.attrs.cons / 100) * (1 + rainLevel);
      if (chance(errP)) t += rand(0.4, 2.5) * track.lap / 90;
      return t;
    };
    return { ...e, sq, lap };
  });
  const sessions = [];
  if (state.category === 'formula' && entries.length > 14) {
    let pool = laps.slice();
    const n = pool.length;
    const cut1 = n - Math.round(n * 0.27), cut2 = 10;
    const run = (list, name) => {
      const res = list.map((c) => ({ key: c.key, time: Math.min(c.lap(), c.lap()) })).sort((a, b) => a.time - b.time);
      sessions.push({ name, results: res });
      return res;
    };
    const r1 = run(pool, 'Q1');
    pool = pool.filter((c) => r1.slice(0, cut1).some((x) => x.key === c.key));
    const r2 = run(pool, 'Q2');
    pool = pool.filter((c) => r2.slice(0, cut2).some((x) => x.key === c.key));
    const r3 = run(pool, 'Q3');
    const fullGrid = [...r3, ...r2.slice(cut2), ...r1.slice(cut1)];
    return { sessions, grid: fullGrid.map((x) => x.key), times: Object.fromEntries(fullGrid.map((x) => [x.key, x.time])) };
  }
  const res = laps.map((c) => ({ key: c.key, time: Math.min(c.lap(), c.lap(), c.lap()) })).sort((a, b) => a.time - b.time);
  sessions.push({ name: C.id === 'endurance' ? 'Hyperpole' : 'Qualifica', results: res });
  return { sessions, grid: res.map((x) => x.key), times: Object.fromEntries(res.map((x) => [x.key, x.time])) };
}

// ------------------ RACE ------------------
const MIN_GAP = 0.0028;

export class CircuitSim {
  constructor(state, track, { grid, setups, weather, laps }) {
    this.state = state; this.track = track;
    this.C = CATEGORIES[state.category];
    this.cat = state.category;
    this.endurance = this.C.refuel;
    this.laps = laps; this.weather = weather;
    this.trackTemp = weather.trackTemp ?? 32;
    this.realLaps = realLaps(state, track);
    this.scale = this.realLaps / laps; // real laps per sim lap
    this.ls = track.lap / 90;
    this.pitLoss = track.pit || this.C.pitLoss;
    this.time = 0; this.finished = false; this.leaderFinished = false;
    this.events = []; this.sc = null; this.vsc = null; this.scCount = 0;
    this.fastest = { time: 999, key: null };
    this.history = {}; // key -> [{lap, time, pos, tyre, wear}]
    const entries = buildEntries(state);
    const byKey = Object.fromEntries(entries.map((e) => [e.key, e]));
    // endurance stint length: ~45 minutes of real running
    const stintReal = 2700 / track.lap;
    this.stintLaps = this.endurance ? Math.max(3, stintReal / this.scale) : 0;
    const smart = aiSmart(state);
    this.planCache = {};
    this.teamOrders = {}; this.radioQ = []; this.radioId = 0;
    this.cars = grid.map((key, i) => {
      const e = byKey[key];
      const team = state.teams[e.teamId];
      const effEff = this.endurance ? 0.86 + (team.car.parts.efficiency || 70) / 100 * 0.28 : 1;
      const car = {
        ...e, team, grid: i + 1, pos: i + 1,
        dist: -i * 0.0045 - 0.002, lap: 0, lapStart: 0, lastLap: null, bestLap: null,
        tyre: 'medium', age: 0, temp: 80, wear: 0, compoundsUsed: new Set(),
        fuelMax: this.endurance ? this.stintLaps * effEff : 1, fuel: this.endurance ? this.stintLaps * effEff : 1,
        baseLap: teamBaseLap(state, team, track), setupQ: setups[key] ?? aiSetupQuality(state, team),
        mode: 'normal', status: 'running', reason: null, inPit: 0, pitReq: null, pitStops: 0,
        driverIdx: 0, stintCount: 0, battleT: 0, damage: 0, penalty: 0, lapTarget: track.lap, finishTime: null,
        auto: !e.isPlayer, smart: e.isPlayer ? 0.9 : clamp(smart + rand(-0.12, 0.08), 0.3, 1), aiRainReact: rand(0, 0.15), gapAhead: 9, drs: false, dirty: false,
        stintLap: 0, plan: null, planIdx: 0, ers: 100, ersMode: 'balanced',
      };
      return car;
    });
    for (const c of this.cars) {
      c.plan = this.makePlan(c);
      c.tyre = c.plan ? c.plan[0].c : this.pickStartCompound();
      c.compoundsUsed.add(c.tyre);
      c.temp = this.endurance ? 85 : 82;
      c.lapTarget = this.computeLap(c);
      this.history[c.key] = [];
    }
    // Endurance: slower LMGT3 class traffic to lap
    this.traffic = [];
    if (this.endurance) {
      const GT = [['#0b6e4f', '#f2c14e'], ['#1d3557', '#e63946'], ['#ffffff', '#ff5400'], ['#2b2d42', '#8d99ae'], ['#ffb703', '#023047'], ['#6a040f', '#ffba08'], ['#3a86ff', '#ffbe0b'], ['#14213d', '#fca311'], ['#e9ecef', '#212529'], ['#7209b7', '#f72585'], ['#008000', '#ffffff'], ['#d00000', '#000000']];
      GT.forEach((col, i) => this.traffic.push({ key: `gt#${i}`, dist: -0.15 - i * 0.012, lt: track.lap * (1.115 + Math.random() * 0.03), colors: col, num: 20 + i * 7 }));
    }
    this.log(`Partenza! ${this.laps} giri a ${track.circuit}. Temperatura asfalto ${this.trackTemp}°C.`, 'start', null, true);
  }

  wearMult(c, mode = c.mode) {
    const d = this.driver(c);
    const tp = c.team.car.parts.tyre ?? 75;
    let w = (1.18 - tp / 420 - d.attrs.tyre / 520) * { push: 1.32, normal: 1, save: 0.72 }[mode];
    w *= 1 + (this.trackTemp - 32) * 0.008;
    if (c.isPlayer && hasPerk(this.state, 'tyre_reader')) w *= 0.94;
    return w;
  }

  makePlan(c) {
    if (this.weather.plan[0] > 0.2) return null;
    if (this.endurance) return null;
    const key = c.teamId;
    if (!this.planCache[key]) this.planCache[key] = strategyOptions(this.cat, this.track, this.laps, this.scale, this.wearMult(c, 'normal'), this.pitLoss);
    const opts = this.planCache[key];
    // smarter AIs pick near-optimal strategies; weaker ones gamble
    const k = Math.min(opts.length - 1, Math.floor((1 - c.smart) * 6 * Math.random()));
    const o = opts[k];
    return o.stints.map((s) => ({ c: s.c, laps: Math.max(1, Math.round(s.laps + gauss(0, 1 - c.smart))) }));
  }

  pickStartCompound() {
    const r = this.weather.plan[0];
    if (r > 0.55) return 'wet';
    if (r > 0.2) return this.C.compounds.includes('inter') ? 'inter' : 'wet';
    return 'medium';
  }

  get rain() {
    const leader = this.cars.reduce((a, c) => (c.dist > a ? c.dist : a), 0);
    const l = clamp(Math.floor(leader), 0, this.weather.plan.length - 1);
    const f = leader - Math.floor(leader);
    const a = this.weather.plan[l] || 0, b = this.weather.plan[l + 1] ?? a;
    return a + (b - a) * f;
  }
  get night() {
    if (!this.track.night) return 0;
    if (!this.endurance) return 1;
    const p = this.progress;
    return p > 0.38 && p < 0.72 ? 1 : 0;
  }
  get progress() { const leader = Math.max(...this.cars.map((c) => c.dist)); return clamp(leader / this.laps, 0, 1); }

  driver(c) { return this.state.drivers[c.driverIds[c.driverIdx]] || this.state.drivers[c.driverIds[0]]; }
  life(c) { return tyreModel(this.cat, c.tyre).life / (this.track.wear * this.wearMult(c, 'normal')); }

  // breakdown used by telemetry
  lapBreakdown(c) {
    const d = this.driver(c);
    const rain = this.rain;
    const m = tyreModel(this.cat, c.tyre);
    const ls = this.ls;
    const base = c.baseLap * driverFactor(d, rain, this.state) * (1 - c.setupQ * 0.005);
    const out = { base };
    out.compound = m.pace * ls;
    out.deg = degPenalty(m, c.age, this.life(c)) * ls;
    out.temp = tempPenalty(m, c.temp) * ls;
    out.fuel = this.endurance ? (c.fuel / c.fuelMax) * 1.6 * ls : (1 - clamp(c.dist / this.laps, 0, 1)) * 3.1 * ls;
    out.evo = -Math.min(1, this.progress * 2.5) * 0.45 * ls;
    out.weather = base * (weatherFactor(c.tyre, rain) - 1) + (rain > 0.05 && !m.wet ? 0 : 0);
    out.mode = { push: -0.32, normal: 0, save: 0.45 }[c.mode] * ls;
    out.air = (c.drs ? -0.38 : 0) * ls + (c.dirty ? 0.28 * (1 - this.track.ovt * 0.5) : 0) * ls;
    out.night = this.night && this.endurance ? (0.35 - d.attrs.exp / 400) * ls : 0;
    out.ers = { deploy: -0.4, balanced: 0, harvest: 0.15 }[c.ersMode || 'balanced'] * ls * (this.cat === 'rally' ? 0 : 1);
    out.damage = c.damage * ls;
    out.fatigue = this.endurance && c.stintCount >= 3 ? 0.3 * (c.stintCount - 2) * ls : 0;
    return out;
  }

  computeLap(c) {
    if (this.sc) return this.track.lap * 1.38;
    if (this.vsc) return this.track.lap * 1.32;
    const b = this.lapBreakdown(c);
    let t = 0;
    for (const v of Object.values(b)) t += v;
    const d = this.driver(c);
    t += gauss(0, 0.0022 * (1.45 - d.attrs.cons / 100) * this.track.lap);
    return t;
  }

  log(text, type = 'info', key = null, important = false) {
    const lap = Math.max(1, Math.min(this.laps, Math.floor(Math.max(...(this.cars?.map?.((c) => c.dist) || [0]))) + 1));
    this.events.push({ t: this.time, lap, text, type, key, important });
    if (this.events.length > 400) this.events.shift();
  }

  setMode(key, mode) { const c = this.cars.find((x) => x.key === key); if (c && c.status === 'running') { c.mode = mode; c.lapTarget = this.computeLap(c); } }
  setErs(key, m) { const c = this.cars.find((x) => x.key === key); if (c && c.status === 'running') { c.ersMode = m; c.lapTarget = this.computeLap(c); } }
  setOrders(teamId, o) { this.teamOrders[teamId] = o; if (o === 'swap') this.log('📻 Ordine di scuderia: scambio di posizioni.', 'radio', null, true); else if (o === 'hold') this.log('📻 Ordine di scuderia: mantenete le posizioni.', 'radio', null, true); }
  requestPit(key, req) { const c = this.cars.find((x) => x.key === key); if (c && c.status === 'running') c.pitReq = req; }
  cancelPit(key) { const c = this.cars.find((x) => x.key === key); if (c) c.pitReq = null; }

  aiThink(c) {
    const rain = this.rain;
    const lapsLeft = this.laps - c.dist;
    const comp = COMPOUNDS[c.tyre];
    const wetC = this.C.compounds.includes('inter') ? 'inter' : 'wet';
    const wantWet = rain > 0.62 ? 'wet' : rain > 0.22 + c.aiRainReact * (1.2 - c.smart) ? wetC : null;
    if (wantWet && c.tyre !== wantWet && lapsLeft > 1.5) return this.req(c, wantWet);
    if (!wantWet && comp.wet && rain < 0.12 - c.aiRainReact * 0.3 * (1.2 - c.smart) && lapsLeft > 2) {
      c.plan = null; return this.req(c, this.dryChoice(c, lapsLeft));
    }
    if (this.endurance) {
      if (c.fuel < 1.25 && lapsLeft > 0.9) {
        const wear = c.age / this.life(c);
        const tyre = wear > 0.55 ? (wantWet || this.dryChoice(c, lapsLeft)) : null;
        return { compound: tyre, fuel: true, swap: c.stintCount >= 2 };
      }
      return null;
    }
    const wear = c.age / this.life(c);
    // follow the plan
    if (c.plan && !comp.wet) {
      const st = c.plan[c.planIdx];
      const isLast = c.planIdx >= c.plan.length - 1;
      if (!isLast && (c.stintLap >= st.laps || wear > 0.98) && lapsLeft > 2) {
        c.planIdx++;
        return this.req(c, c.plan[c.planIdx].c);
      }
      // safety car opportunity
      if ((this.sc || this.vsc) && !isLast && c.stintLap >= st.laps * 0.65 && chance(0.4 + c.smart * 0.5)) { c.planIdx++; return this.req(c, c.plan[c.planIdx].c); }
      if (isLast && wear > 1.05 && lapsLeft > 4) return this.req(c, this.dryChoice(c, lapsLeft));
      return null;
    }
    if (!comp.wet && wear > 0.9 && lapsLeft > 2.5) return this.req(c, this.dryChoice(c, lapsLeft));
    if (comp.wet && wear > 0.95 && lapsLeft > 3) return this.req(c, c.tyre);
    if (!this.weather.isRain && c.compoundsUsed.size < 2 && lapsLeft < 4 && lapsLeft > 1.2 && !comp.wet) return this.req(c, c.tyre === 'medium' ? 'hard' : 'medium');
    return null;
  }
  req(c, compound) { return { compound, fuel: true, swap: this.endurance && c.stintCount >= 2 }; }

  dryChoice(c, lapsLeft) {
    const realLeft = lapsLeft * this.scale * this.track.wear * this.wearMult(c, 'normal');
    if (this.endurance) return lapsLeft < this.stintLaps * 1.2 ? 'soft' : 'medium';
    let comp = realLeft < 16 ? 'soft' : realLeft < 27 ? 'medium' : 'hard';
    const dryUsed = [...c.compoundsUsed].filter((x) => !COMPOUNDS[x].wet);
    if (!this.weather.isRain && dryUsed.length === 1 && dryUsed[0] === comp) comp = comp === 'medium' ? (realLeft < 20 ? 'soft' : 'hard') : 'medium';
    return comp;
  }

  maybeRadio(c) {
    if (this.radioQ.some((r) => r.key === c.key) || this.sc || c.lap < 2 || this.laps - c.dist < 2) return;
    if (this._lastRadio && this.time - this._lastRadio < 90) return;
    const d = this.driver(c); const first = d.name.split(' ')[0];
    const mate = this.cars.find((x) => x.teamId === c.teamId && x !== c && x.status === 'running');
    const opts = [];
    if (c.wear > 0.78 && !c.pitReq) opts.push({ type: 'pit', w: 3, text: `${first}: «Le gomme sono finite, mi fermo questo giro?»` });
    if (mate && mate.pos === c.pos - 1 && c.gapAhead < 1.3 && c.lapTarget < mate.lapTarget - 0.12) opts.push({ type: 'pass', w: 3, text: `${first}: «Sono più veloce di ${this.driver(mate).name.split(' ')[0]}, fatemi passare!»`, mate: mate.key });
    if (c.wear < 0.5 && c.mode !== 'push' && c.gapAhead < 2.5) opts.push({ type: 'push', w: 1, text: `${first}: «Ho gomme buone, posso attaccare?»` });
    const nextRain = (this.weather.plan[Math.min(this.weather.plan.length - 1, c.lap + 2)] || 0);
    if (!COMPOUNDS[c.tyre].wet && nextRain > 0.3 && this.rain < 0.2) opts.push({ type: 'rain', w: 3, text: `${first}: «Vedo nuvole nere, inizia a piovigginare in curva 1. Che facciamo?»` });
    if (c.ers < 15) opts.push({ type: 'ers', w: 1, text: `${first}: «Batteria a terra, la ricarico?»` });
    if (!opts.length || !chance(0.45)) return;
    const o = opts[Math.floor(Math.random() * opts.length)];
    this._lastRadio = this.time;
    this.radioQ.push({ id: ++this.radioId, key: c.key, ...o, until: this.time + 40 });
    this.log(`📻 ${o.text}`, 'radio', c.key, true);
  }

  answerRadio(id, yes) {
    const r = this.radioQ.find((x) => x.id === id); if (!r) return;
    this.radioQ = this.radioQ.filter((x) => x.id !== id);
    const c = this.cars.find((x) => x.key === r.key); if (!c || c.status !== 'running') return;
    const d = this.driver(c);
    const mood = (v) => { d.morale = clamp(d.morale + v, 10, 100); };
    if (r.type === 'pit') { if (yes) { c.pitReq = { compound: this.dryChoice(c, this.laps - c.dist), fuel: true }; mood(2); } else { mood(-2); this.log(`📻 Muretto: «Resta fuori, ${d.name.split(' ')[0]}, ancora qualche giro.»`, 'radio', c.key, true); } }
    if (r.type === 'pass') { if (yes) { this.setOrders(c.teamId, 'swap'); mood(3); const m = this.cars.find((x) => x.key === r.mate); if (m) { const dm = this.driver(m); dm.morale = clamp(dm.morale - 4, 10, 100); } } else { mood(-4); this.log('📻 Muretto: «Negativo, mantenete le posizioni.»', 'radio', c.key, true); this.setOrders(c.teamId, 'hold'); } }
    if (r.type === 'push') { if (yes) { c.mode = 'push'; c.ersMode = 'deploy'; mood(2); } else mood(-1); }
    if (r.type === 'rain') { if (yes) { c.pitReq = { compound: this.C.compounds.includes('inter') ? 'inter' : 'wet', fuel: true }; } else this.log(`📻 Muretto: «Resta fuori, è solo una pioggerella.»`, 'radio', c.key, true); }
    if (r.type === 'ers') { if (yes) c.ersMode = 'harvest'; }
    c.lapTarget = this.computeLap(c);
  }

  enterPit(c) {
    const req = c.pitReq || {};
    const mech = this.state.staff[c.team.staff.mechanic]?.rating || 65;
    const crew = c.team.facilities.pitcrew;
    let stat = this.endurance ? 26 + rand(0, 6) - mech / 30 - crew * 0.6 : 2.15 + rand(0, 0.5) + (100 - mech) / 95 - crew * 0.08;
    let slow = '';
    if (chance(0.06 * (1.25 - mech / 100) * (1.2 - crew * 0.08))) { const x = rand(2.5, 8); stat += x; slow = ` (pit stop lento +${x.toFixed(1)}s!)`; }
    if (req.swap && this.endurance) stat += 4;
    if (c.isPlayer && hasPerk(this.state, 'fast_crew')) stat -= 0.3;
    if (!req.compound && this.endurance) stat -= 9;
    const loss = this.pitLoss * (this.sc ? 0.5 : this.vsc ? 0.65 : 1);
    if (c.damage > 0 && req.repair !== false) { stat += c.damage * 12; c.damage = 0; }
    c.inPit = loss + stat;
    c.pitStops++;
    if (c.isPlayer && !c.auto && c.plan && req.compound && c.plan[c.planIdx + 1]) c.planIdx++;
    if (req.compound) { c.tyre = req.compound; c.age = 0; c.temp = (this.endurance ? 72 : 70) + (c.isPlayer && hasPerk(this.state, 'outlap') ? 18 : 0); c.compoundsUsed.add(req.compound); c.stintLap = 0; }
    if (this.endurance) { c.fuel = c.fuelMax; c.stintCount++; }
    if (req.swap && c.driverIds.length > 1) { c.driverIdx = (c.driverIdx + 1) % c.driverIds.length; c.stintCount = 0; }
    const d = this.driver(c);
    const tyreTxt = req.compound ? `gomme ${COMPOUNDS[req.compound].name}` : 'solo carburante';
    if (c.isPlayer) this.log(`📻 Ingegnere a ${d.name.split(' ')[0]}: «${pick(['Box, box! Box questo giro.', 'Rientra, gomme pronte.', 'Box box, confermato.', 'Pit stop ora, ci siamo.'])}»`, 'radio', c.key, true);
    this.log(`BOX: ${d.name} si ferma – ${tyreTxt}${req.swap ? ', cambio pilota' : ''}. Sosta ${stat.toFixed(1)}s${slow}`, 'pit', c.key, c.isPlayer);
    c.pitReq = null;
    c.lastStop = stat;
    this.onPit?.(c, stat);
  }

  retire(c, reason, crash) {
    c.status = 'dnf'; c.reason = reason;
    const d = this.driver(c);
    this.log(`${crash ? '💥' : '🔧'} RITIRO: ${d.name} (${c.team.name}) – ${reason}`, crash ? 'crash' : 'fail', c.key, true);
    if (!this.sc && !this.vsc && c.dist < this.laps - 1.5) {
      if (crash && chance(0.6)) this.deploySC();
      else if (chance(crash ? 0.5 : 0.35)) this.deployVSC();
    }
  }
  deploySC() {
    this.sc = { laps: randInt(2, 4), startLap: Math.floor(this.progress * this.laps) };
    this.scCount++;
    this.log('🚨 SAFETY CAR in pista!', 'sc', null, true);
    for (const c of this.cars) c.lapTarget = this.computeLap(c);
  }
  deployVSC() {
    this.vsc = { until: this.time + rand(50, 110) };
    this.log('🟡 VIRTUAL SAFETY CAR', 'sc', null, true);
    for (const c of this.cars) c.lapTarget = this.computeLap(c);
  }

  onLapComplete(c, crossT = this.time) {
    const lapTime = crossT - c.lapStart;
    c.lapStart = crossT;
    c.lap++;
    c.stintLap++;
    if (c.lap > 0 && lapTime > 20) {
      c.lastLap = lapTime;
      if (!c.bestLap || lapTime < c.bestLap) c.bestLap = lapTime;
      if (lapTime < this.fastest.time && !this.sc && !this.vsc && c.lap > 1) { this.fastest = { time: lapTime, key: c.key }; }
      this.history[c.key].push({ lap: c.lap, time: lapTime, tyre: c.tyre, wear: c.age / this.life(c), temp: c.temp, pos: c.pos, sc: !!(this.sc || this.vsc) });
    }
    if (this.endurance) {
      c.fuel -= 1;
      if (c.fuel <= 0) { this.retire(c, 'Senza carburante', false); return; }
    }
    // finish
    if (this.leaderFinished || c.lap >= this.laps) {
      if (!this.leaderFinished) { this.leaderFinished = true; this.log(`🏁 ${this.driver(c).name} taglia per primo il traguardo!`, 'finish', c.key, true); }
      if (this.C.id === 'formula' && !this.weather.isRain && [...c.compoundsUsed].filter((x) => !COMPOUNDS[x].wet).length < 2) {
        c.penalty += 10; this.log(`⚖ ${this.driver(c).name}: +10s di penalità (una sola mescola utilizzata)`, 'warn', c.key, c.isPlayer);
      }
      c.status = 'finished'; c.finishTime = crossT + c.penalty; c.finishLap = c.lap;
      return;
    }
    // tyre temperature: approaches an equilibrium set by pace, track temp and compound
    const m = tyreModel(this.cat, c.tyre);
    const rain = this.rain;
    const teq = 92 + { push: 14, normal: 4, save: -8 }[c.mode] + (this.trackTemp - 32) * 0.55 - rain * 35 + (this.sc || this.vsc ? -18 : 0) + (c.dirty ? 4 : 0);
    c.temp += (teq - c.temp) * 0.45;
    // incidents
    const d = this.driver(c);
    const comp = COMPOUNDS[c.tyre];
    const wear = c.age / this.life(c);
    let crashP = 0.0011 * { push: 1.9, normal: 1, save: 0.6 }[c.mode] * (1.35 - d.attrs.cons / 100) * Math.max(0.4, this.scale * 0.6);
    if (!comp.wet && rain > 0.25) crashP *= 1 + rain * 14;
    if (rain > 0) crashP *= 1 + rain * 1.5;
    if (this.night && this.endurance) crashP *= 1.4;
    if (wear > 1.05) crashP *= 4;
    if (Math.abs(c.temp - m.win) > 25) crashP *= 1.8;
    if (this.sc || this.vsc) crashP *= 0.1;
    const rel = c.team.car.parts.reliability;
    let failP = 0.0012 * ((100 - rel) / 18) ** 2 * { push: 1.25, normal: 1, save: 0.8 }[c.mode] * Math.max(0.4, this.scale * 0.6);
    if (this.endurance) failP *= 0.55;
    if (c.isPlayer && hasPerk(this.state, 'reliable')) failP *= 0.8;
    if (chance(crashP)) {
      const r = Math.random();
      if (r < 0.42) this.retire(c, pick(['Incidente', 'Contatto alla staccata', 'Fuori pista contro le barriere', 'Testacoda e muro']), true);
      else if (r < 0.72) { c.damage = rand(0.4, 1.4); this.log(`⚠ ${d.name} tocca le barriere: danno all’ala!`, 'warn', c.key, c.isPlayer); }
      else { const loss = rand(4, 12); c.dist -= loss / this.track.lap; this.log(`↺ Testacoda di ${d.name}! Perde ${loss.toFixed(0)} secondi.`, 'warn', c.key, c.isPlayer); }
      if (c.status === 'dnf') return;
    }
    if (chance(failP)) {
      const r = Math.random();
      if (r < 0.55) { this.retire(c, pick(['Power unit', 'Cambio', 'Idraulica', 'Freni', 'Perdita olio', 'Elettronica', 'Sospensione']), false); return; }
      c.damage += rand(0.2, 0.7); this.log(`🔧 Problema tecnico per ${d.name}: perde potenza.`, 'warn', c.key, c.isPlayer);
    }
    if (wear > 1.12 && !comp.wet && chance(0.25)) { c.damage += 0.6; c.pitReq = c.pitReq || { compound: this.dryChoice(c, this.laps - c.dist), fuel: true }; this.log(`💥 Foratura per ${d.name}! Gomme oltre il limite.`, 'warn', c.key, true); c.dist -= 0.15; }
    if (c.auto) { const req = this.aiThink(c); if (req) c.pitReq = req; }
    if (c.isPlayer && !c.auto && this.endurance && c.fuel < 1.05 && !c.pitReq) { c.pitReq = { compound: null, fuel: true }; this.log(`⛽ Ingegnere: ${d.name} chiamato ai box per carburante (automatico).`, 'pit', c.key, true); }
    if (c.isPlayer && !c.auto && wear > 1.1 && !c.pitReq && this.laps - c.dist > 2) this.log(`📻 Ingegnere a ${d.name.split(' ')[0]}: «Le gomme sono finite, dobbiamo fermarci!»`, 'radio', c.key, true);
    if (c.isPlayer && !c.auto) this.maybeRadio(c);
    if (c.pitReq && c.lap < this.laps) this.enterPit(c);
    c.lapTarget = this.computeLap(c);
  }

  step(dt) {
    if (this.finished) return;
    this.time += dt;
    const running = this.cars.filter((c) => c.status === 'running');
    const rain = this.rain;
    if (this._lastRain == null) this._lastRain = 0;
    if (rain > 0.2 && this._lastRain <= 0.2) this.log('🌧 Inizia a piovere!', 'weather', null, true);
    if (rain < 0.1 && this._lastRain >= 0.1) this.log('☀ La pioggia smette, pista in asciugatura.', 'weather', null, true);
    this._lastRain = rain;
    if (this.radioQ.length) for (const r of this.radioQ.filter((x) => this.time > x.until)) this.answerRadio(r.id, r.type === 'ers' || r.type === 'pit');
    if (this.vsc && this.time > this.vsc.until) { this.vsc = null; this.log('🟢 Fine Virtual Safety Car', 'sc', null, true); for (const c of this.cars) c.lapTarget = this.computeLap(c); }
    for (const c of running) {
      if (c.inPit > 0) { c.inPit -= dt; if (c.inPit <= 0) c.inPit = 0; continue; }
      const prev = c.dist;
      const lt = c.lapTarget;
      c.dist += dt / lt;
      c.age += (dt / lt) * this.scale * this.track.wear * this.wearMult(c) * (this.sc || this.vsc ? 0.35 : 1) * (Math.abs(c.temp - tyreModel(this.cat, c.tyre).win) > 12 ? 1.25 : 1) * (COMPOUNDS[c.tyre].wet && rain < 0.3 ? 2.2 : 1);
      c.wear = c.age / this.life(c);
      const lapFrac = dt / lt;
      const rate = { deploy: -32, balanced: 3, harvest: 26 }[c.ersMode] * (this.sc || this.vsc ? 0 : 1) + (this.sc || this.vsc ? 30 : 0);
      const before = c.ersMode;
      c.ers = clamp(c.ers + rate * lapFrac, 0, 100);
      if (c.ers <= 0 && c.ersMode === 'deploy') c.ersMode = 'balanced';
      if (c.ers >= 100 && c.ersMode === 'harvest' && c.auto) c.ersMode = 'balanced';
      if (c.ersMode !== before) c.lapTarget = this.computeLap(c);
      if (Math.floor(c.dist) > c.lap && Math.floor(c.dist) >= 1) this.onLapComplete(c, this.time - (c.dist - Math.floor(c.dist)) * lt);
    }
    // GT traffic
    if (this.traffic.length) {
      const slow = this.sc ? 1.38 : this.vsc ? 1.32 : 1;
      for (const g of this.traffic) g.dist += dt / (g.lt * (slow > 1 ? slow / 1.12 : 1));
      if (!this.sc && !this.vsc) for (const c of running) {
        if (c.inPit > 0) continue;
        const cf = ((c.dist % 1) + 1) % 1;
        for (const g of this.traffic) {
          const gf = ((g.dist % 1) + 1) % 1;
          let d = gf - cf; if (d < -0.5) d += 1;
          if (d > 0 && d < 0.0022) {
            const tag = g.key + ':' + Math.floor(c.dist);
            if (c._tr === tag) continue;
            c._tr = tag;
            const dr = this.driver(c);
            const loss = (0.15 + Math.random() * 0.9) * (1.35 - dr.attrs.race / 100) * (this.night ? 1.4 : 1) * (this.rain > 0.3 ? 1.5 : 1);
            c.dist -= loss / this.track.lap;
            if (c.isPlayer && loss > 0.7 && chance(0.35)) this.log(`🚦 Traffico GT: ${dr.name} perde ${loss.toFixed(1)}s nel doppiaggio.`, 'warn', c.key, true);
            if (chance(0.0025 * (1.4 - dr.attrs.cons / 100))) { c.damage += rand(0.3, 0.8); this.log(`⚠ Contatto con una GT per ${dr.name}: danni!`, 'warn', c.key, true); }
          }
        }
      }
    }
    // interactions
    const order = this.cars.filter((c) => c.status === 'running' && c.inPit <= 0).sort((a, b) => b.dist - a.dist);
    if (order[0]) { order[0].gapAhead = 9; order[0].drs = false; order[0].dirty = false; }
    for (let i = 1; i < order.length; i++) {
      const a = order[i - 1], b = order[i];
      const gap = a.dist - b.dist;
      const gapS = gap * this.track.lap;
      b.gapAhead = gapS;
      const wasDrs = b.drs, wasDirty = b.dirty;
      b.drs = this.C.id === 'formula' && gapS < 1 && b.lap >= 2 && rain < 0.2 && !this.sc && !this.vsc;
      b.dirty = gapS < 1.6 && !this.sc && !this.vsc;
      if (b.auto && !b.noErs && !this.sc && !this.vsc) {
        const want = (gapS < 0.7 && b.ers > 35) ? 'deploy' : b.ers < 20 ? 'harvest' : (gapS > 4 && b.ers < 45) ? 'harvest' : 'balanced';
        if (want !== b.ersMode) { b.ersMode = want; b.lapTarget = this.computeLap(b); }
      }
      if (a.auto && !a.noErs && gapS < 0.4 && a.ers > 45 && a.ersMode !== 'deploy' && !this.sc && !this.vsc) { a.ersMode = 'deploy'; a.lapTarget = this.computeLap(a); }
      // team orders
      if (a.teamId === b.teamId && gapS < 1.6 && !this.sc && !this.vsc) {
        const ord = this.teamOrders[a.teamId] || 'free';
        if (ord === 'swap' && a.status === 'running' && b.status === 'running') {
          b.dist = a.dist + 0.0008; a.dist -= 0.006;
          [order[i - 1], order[i]] = [b, a];
          this.log(`🔁 ${this.driver(a).name} lascia passare il compagno ${this.driver(b).name}.`, 'radio', b.key, a.isPlayer);
          this.teamOrders[a.teamId] = 'free';
          if (a.isPlayer) { const da = this.driver(a); da.morale = clamp(da.morale - 3, 10, 100); }
          continue;
        }
        if (ord === 'hold' && gap < MIN_GAP * 1.5) { b.dist = a.dist - MIN_GAP * 1.5; b.battleT = 0; continue; }
      }
      if (b.drs !== wasDrs || b.dirty !== wasDirty) b.lapTarget = this.computeLap(b);
      if (gap > 0.4) continue;
      if (gap < MIN_GAP) {
        if (this.sc || this.vsc || b.dist < 0.3) { if (this.sc || b.dist < 0.3) b.dist = a.dist - MIN_GAP * (this.sc ? 3 : 1.2); continue; }
        b.battleT += dt;
        if (b.battleT >= 2.2) {
          b.battleT = 0;
          const paceDiff = a.lapTarget - b.lapTarget;
          const da = this.driver(a), db = this.driver(b);
          const p = clamp(0.05 + this.track.ovt * 0.42 + (paceDiff / this.ls) * 0.3 + (db.attrs.race - da.attrs.race) / 110 + (b.drs ? 0.1 : 0) + (b.mode === 'push' ? 0.06 : 0) - (a.mode === 'push' ? 0.04 : 0) + (b.ersMode === 'deploy' ? 0.16 : 0) - (a.ersMode === 'deploy' ? 0.1 : 0), 0.02, 0.9);
          if (chance(p)) {
            b.dist = a.dist + 0.0012; a.dist -= 0.0012;
            [order[i - 1], order[i]] = [b, a];
            if (a.isPlayer || b.isPlayer || i <= 3) this.log(`⇄ ${db.name} sorpassa ${da.name} per la P${i}!`, 'overtake', b.key, b.isPlayer || a.isPlayer);
            if (b.isPlayer && chance(0.35)) this.log(`📻 ${db.name.split(' ')[0]}: «${pick(['Sììì! Che sorpasso!', 'Fatto! Avanti il prossimo.', 'Era mio, era mio!', 'Ho più passo, continuo così.'])}»`, 'radio', b.key, true);
            else if (a.isPlayer && chance(0.3)) this.log(`📻 ${da.name.split(' ')[0]}: «${pick(['Non ho grip, le gomme sono andate!', 'Mi ha sorpreso alla staccata...', 'Non riesco a difendermi!'])}»`, 'radio', a.key, true);
            this.onOvertake?.(b, a);
            if (chance(0.006 * (1.5 - db.attrs.race / 100))) {
              if (chance(0.3)) this.retire(a, 'Contatto in duello', true);
              else { a.damage += rand(0.3, 0.9); this.log(`⚠ Contatto tra ${db.name} e ${da.name}: ala danneggiata!`, 'warn', a.key, a.isPlayer || b.isPlayer); a.lapTarget = this.computeLap(a); }
            }
          } else b.dist = a.dist - MIN_GAP;
        } else b.dist = a.dist - MIN_GAP;
      } else b.battleT = Math.max(0, b.battleT - dt * 0.3);
    }
    if (this.sc) {
      const leaderLap = Math.floor(Math.max(...running.map((c) => c.dist)));
      if (leaderLap - this.sc.startLap >= this.sc.laps) { this.sc = null; this.log('🟢 Safety car rientra: si riparte!', 'sc', null, true); for (const c of this.cars) c.lapTarget = this.computeLap(c); }
      else {
        const scStep = dt / (this.track.lap * 1.38);
        for (let i = 1; i < order.length; i++) {
          const a = order[i - 1], b = order[i];
          const g = a.dist - b.dist;
          if (g > MIN_GAP * 3.5 && g < 0.5) b.dist += Math.min(g - MIN_GAP * 3, scStep * 0.4);
        }
      }
    }
    const all = this.classification();
    all.forEach((c, i) => (c.pos = i + 1));
    if (this.leaderFinished && this.cars.every((c) => c.status !== 'running')) { this.finished = true; this.log('Bandiera a scacchi. Gara conclusa.', 'finish', null, true); }
    if (!this.cars.some((c) => c.status === 'running')) this.finished = true;
  }

  classification() {
    return this.cars.slice().sort((a, b) => {
      const sa = a.status === 'dnf' ? 1 : 0, sb = b.status === 'dnf' ? 1 : 0;
      if (sa !== sb) return sa - sb;
      if (sa && sb) return b.dist - a.dist;
      if (a.status === 'finished' && b.status === 'finished') return (b.finishLap - a.finishLap) || (a.finishTime - b.finishTime);
      if (a.status === 'finished') return b.dist >= a.finishLap ? 1 : -1;
      if (b.status === 'finished') return a.dist >= b.finishLap ? -1 : 1;
      return b.dist - a.dist;
    });
  }

  gapToLeader(c, leader) {
    if (c === leader) return 0;
    if (c.status === 'finished' && leader.status === 'finished') {
      if (c.finishLap < leader.finishLap) return { laps: leader.finishLap - c.finishLap };
      return c.finishTime - leader.finishTime;
    }
    const d = leader.dist - c.dist;
    if (d >= 1) return { laps: Math.floor(d) };
    return d * this.track.lap;
  }

  runToEnd(maxSteps = 400000) {
    let n = 0;
    while (!this.finished && n++ < maxSteps) this.step(0.5);
  }

  results() {
    const cls = this.classification();
    const leader = cls[0];
    const double = !!this.track.double;
    const out = cls.map((c, i) => {
      const pos = i + 1;
      const pts = c.status === 'dnf' ? 0 : pointsFor(pos, double);
      const gap = this.gapToLeader(c, leader);
      return { key: c.key, teamId: c.teamId, driverIds: c.driverIds, pos, status: c.status === 'dnf' ? 'dnf' : 'fin', reason: c.reason, pts, gap, bestLap: c.bestLap, pitStops: c.pitStops, grid: c.grid, laps: c.status === 'finished' ? c.finishLap : Math.floor(Math.max(0, c.dist)), tyres: [...c.compoundsUsed] };
    });
    return { classification: out, fastest: this.fastest, scCount: this.scCount };
  }
}
