// Circuit race simulation (Formula & Endurance)
import { CATEGORIES, COMPOUNDS } from '../data/categories.js';
import { carPerf, pointsFor } from './season.js';
import { rand, randInt, chance, clamp, gauss, pick } from './rng.js';

export function raceLaps(state, track) {
  const C = CATEGORIES[state.category];
  const L = { short: 0.62, normal: 1, long: 1.6 }[state.raceLength] || 1;
  let laps = Math.round(C.lapsDefault * L);
  if (track.double) laps = Math.round(laps * 1.5);
  return laps;
}

export function makeWeatherPlan(track, laps, forcedRain) {
  const plan = new Array(laps + 2).fill(0);
  const isRain = forcedRain ?? chance(track.rain);
  let summary = 'Sereno';
  if (isRain) {
    const type = pick(['shower', 'start', 'late', 'full']);
    let s, e, peak;
    if (type === 'shower') { s = randInt(2, Math.floor(laps * 0.6)); e = s + randInt(3, Math.floor(laps * 0.35)); peak = rand(0.35, 0.8); }
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
  return { plan, isRain, summary };
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

// ------------------ QUALIFYING ------------------
export function runQualifying(state, track, setups, rainLevel = 0, playerRisk = {}) {
  const entries = buildEntries(state);
  const C = CATEGORIES[state.category];
  const laps = entries.map((e) => {
    const team = state.teams[e.teamId];
    const d = state.drivers[e.driverIds[0]];
    const perf = carPerf(state, team, track);
    const sq = setups[e.key] ?? aiSetupQuality(state, team);
    const pace = d.attrs.pace * (1 - rainLevel) + d.attrs.wet * rainLevel;
    const risk = playerRisk[e.key] || (e.isPlayer ? 'normal' : 'normal');
    const base = track.lap - (perf - 80) * 0.05 - (pace - 80) * 0.045 - sq * 0.4 + rainLevel * 9 - 0.8;
    const lap = () => {
      let t = base + gauss(0, 0.22 * (1.45 - d.attrs.cons / 100));
      if (risk === 'push') t -= 0.18;
      if (risk === 'safe') t += 0.15;
      const errP = (risk === 'push' ? 0.12 : risk === 'safe' ? 0.02 : 0.05) * (1.3 - d.attrs.cons / 100) * (1 + rainLevel);
      if (chance(errP)) t += rand(0.6, 3);
      return t;
    };
    return { ...e, perf, sq, lap };
  });
  const sessions = [];
  if (state.category === 'formula' && entries.length > 14) {
    let pool = laps.slice();
    const n = pool.length;
    const cut1 = n - Math.round(n * 0.27), cut2 = 10;
    const run = (list, name) => {
      const res = list.map((c) => { const t = Math.min(c.lap(), c.lap()); return { key: c.key, time: t }; }).sort((a, b) => a.time - b.time);
      sessions.push({ name, results: res });
      return res;
    };
    const r1 = run(pool, 'Q1');
    pool = pool.filter((c) => r1.slice(0, cut1).some((x) => x.key === c.key));
    const r2 = run(pool, 'Q2');
    pool = pool.filter((c) => r2.slice(0, cut2).some((x) => x.key === c.key));
    const r3 = run(pool, 'Q3');
    // grid: Q3 order, then Q2 eliminated by their Q2 time, then Q1 eliminated by Q1 time
    const q2el = r2.slice(cut2), q1el = r1.slice(cut1);
    const fullGrid = [...r3, ...q2el, ...q1el];
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
    this.endurance = this.C.refuel;
    this.laps = laps; this.weather = weather;
    this.time = 0; this.finished = false; this.leaderFinished = false;
    this.events = []; this.sc = null; this.scCount = 0;
    this.fastest = { time: 999, key: null };
    const entries = buildEntries(state);
    const byKey = Object.fromEntries(entries.map((e) => [e.key, e]));
    const stints = Math.max(2, Math.round((track.hours || 6) * (track.double ? 0.5 : 1) * 1.0));
    this.stintLaps = this.endurance ? Math.max(4, laps / (track.double ? 12 : stints)) : 0;
    this.cars = grid.map((key, i) => {
      const e = byKey[key];
      const team = state.teams[e.teamId];
      const startCompound = this.pickStartCompound(e.isPlayer);
      const effEff = this.endurance ? 0.85 + (team.car.parts.efficiency || 70) / 100 * 0.3 : 1;
      return {
        ...e, team, grid: i + 1, pos: i + 1,
        dist: -i * 0.0045 - 0.002, lap: 0, lapStart: 0, lastLap: null, bestLap: null,
        tyre: startCompound, wear: 0, compoundsUsed: new Set([startCompound]),
        fuelMax: this.endurance ? this.stintLaps * effEff : 1, fuel: this.endurance ? this.stintLaps * effEff : 1,
        perf: carPerf(state, team, track), setupQ: setups[key] ?? aiSetupQuality(state, team),
        mode: 'normal', status: 'running', reason: null, inPit: 0, pitReq: null, pitStops: 0,
        driverIdx: 0, stintCount: 0, battleT: 0, damage: 0, penalty: 0, lapTarget: track.lap, finishTime: null,
        auto: !e.isPlayer, aiPitWear: rand(0.6, 0.78), aiRainReact: rand(0, 0.15), lostTime: 0, totalStint: 0,
      };
    });
    for (const c of this.cars) c.lapTarget = this.computeLap(c);
    this.log(`Partenza! ${this.laps} giri al ${track.circuit}.`, 'start', null, true);
  }

  pickStartCompound(isPlayer) {
    const r = this.weather.plan[0];
    if (r > 0.55) return 'wet';
    if (r > 0.2) return this.C.compounds.includes('inter') ? 'inter' : 'wet';
    if (this.endurance) return 'medium';
    return pick(['soft', 'medium', 'medium', 'hard']);
  }

  get rain() {
    const leader = this.cars.reduce((a, c) => (c.dist > a ? c.dist : a), 0);
    const l = clamp(Math.floor(leader), 0, this.weather.plan.length - 1);
    const f = leader - Math.floor(leader);
    const a = this.weather.plan[l] || 0, b = this.weather.plan[l + 1] ?? a;
    return a + (b - a) * f;
  }
  get night() {
    if (!this.track.night || !this.endurance) return this.track.night && !this.endurance ? 0 : 0;
    const p = this.progress;
    // night segment roughly 40%-70% of race
    return p > 0.38 && p < 0.72 ? 1 : 0;
  }
  get progress() { const leader = Math.max(...this.cars.map((c) => c.dist)); return clamp(leader / this.laps, 0, 1); }

  driver(c) { return this.state.drivers[c.driverIds[c.driverIdx]] || this.state.drivers[c.driverIds[0]]; }

  computeLap(c) {
    const d = this.driver(c);
    const tr = this.track;
    const rain = this.rain;
    const comp = COMPOUNDS[c.tyre];
    let t = tr.lap;
    t -= (c.perf - 80) * 0.05;
    const pace = d.attrs.pace * (1 - rain) + d.attrs.wet * rain;
    t -= (pace - 80) * 0.04 + (d.morale - 70) * 0.004;
    t -= c.setupQ * 0.4;
    t += comp.pace * (this.endurance ? 0.7 : 1);
    t += c.wear * 1.5 + Math.max(0, c.wear - 0.72) * 10;
    if (this.endurance) t += (c.fuel / c.fuelMax) * 0.5;
    else t += (1 - clamp(c.dist / this.laps, 0, 1)) * 1.1;
    // weather vs tyre
    if (!comp.wet) t += rain * 14 + (rain > 0.3 ? rain * 6 : 0);
    else if (c.tyre === 'inter') t += rain > 0.75 ? (rain - 0.75) * 12 : rain < 0.25 ? (0.25 - rain) * 14 : 0;
    else t += rain < 0.5 ? (0.5 - rain) * 10 : 0;
    if (rain > 0) t += rain * 3.5;
    t += { push: -0.38, normal: 0, save: 0.5 }[c.mode];
    if (this.night) t += 0.3 - d.attrs.exp / 500;
    t += c.damage;
    if (this.endurance && c.stintCount >= 3) t += 0.35 * (c.stintCount - 2);
    t += gauss(0, 0.2 * (1.45 - d.attrs.cons / 100));
    if (this.sc) t = tr.lap * 1.38;
    return t;
  }

  log(text, type = 'info', key = null, important = false) {
    const lap = Math.max(1, Math.min(this.laps, Math.floor(Math.max(...this.cars?.map?.((c) => c.dist) || [0])) + 1));
    this.events.push({ t: this.time, lap, text, type, key, important });
    if (this.events.length > 300) this.events.shift();
  }

  setMode(key, mode) { const c = this.cars.find((x) => x.key === key); if (c && c.status === 'running') { c.mode = mode; c.lapTarget = this.computeLap(c); } }
  requestPit(key, req) { const c = this.cars.find((x) => x.key === key); if (c && c.status === 'running') c.pitReq = req; }
  cancelPit(key) { const c = this.cars.find((x) => x.key === key); if (c) c.pitReq = null; }

  aiThink(c) {
    const rain = this.rain;
    const lapsLeft = this.laps - c.dist;
    const comp = COMPOUNDS[c.tyre];
    let need = null;
    const wantWet = rain > 0.62 ? 'wet' : rain > 0.22 + c.aiRainReact * 0.5 ? (this.C.compounds.includes('inter') ? 'inter' : 'wet') : null;
    if (wantWet && c.tyre !== wantWet && lapsLeft > 1.5) need = wantWet;
    if (!wantWet && comp.wet && rain < 0.12 - c.aiRainReact * 0.3 && lapsLeft > 2) need = this.dryChoice(c, lapsLeft);
    if (!need && !comp.wet && c.wear > c.aiPitWear && lapsLeft > 2.5) need = this.dryChoice(c, lapsLeft);
    if (!need && comp.wet && c.wear > 0.82 && lapsLeft > 3) need = c.tyre;
    if (this.endurance) {
      if (c.fuel < 1.25 && lapsLeft > 0.9) {
        const tyre = c.wear > 0.5 ? (wantWet || this.dryChoice(c, lapsLeft)) : null;
        return { compound: tyre || need, fuel: true, swap: c.stintCount >= 2 };
      }
      if (need) return { compound: need, fuel: true, swap: c.stintCount >= 2 };
      return null;
    }
    if (need) return { compound: need };
    // mandatory compound rule (dry races)
    if (!this.weather.isRain && c.compoundsUsed.size < 2 && lapsLeft < 4 && lapsLeft > 1.2) return { compound: c.tyre === 'medium' ? 'hard' : 'medium' };
    if (this.sc && !comp.wet && c.wear > 0.42 && lapsLeft > 4 && chance(0.6)) return { compound: this.dryChoice(c, lapsLeft) };
    return null;
  }

  dryChoice(c, lapsLeft) {
    if (this.endurance) return lapsLeft < this.stintLaps * 1.2 ? 'soft' : c.wear > 0 && chance(0.5) ? 'hard' : 'medium';
    const frac = lapsLeft / this.laps;
    let comp = frac < 0.33 ? 'soft' : frac < 0.6 ? 'medium' : 'hard';
    if (!this.weather.isRain && c.compoundsUsed.size < 2 && c.compoundsUsed.has(comp)) comp = comp === 'medium' ? (frac < 0.45 ? 'soft' : 'hard') : 'medium';
    return comp;
  }

  wearRate(c) {
    const d = this.driver(c);
    const comp = COMPOUNDS[c.tyre];
    const base = this.endurance ? 0.72 / (this.stintLaps * 2.1) : 1.3 / this.laps;
    const tyrePart = c.team.car.parts.tyre ?? 70;
    let w = base * this.track.wear * comp.wear * (1.28 - tyrePart / 220 - d.attrs.tyre / 260);
    w *= { push: 1.4, normal: 1, save: 0.7 }[c.mode];
    if (comp.wet) w *= this.rain < 0.3 ? 2.2 : 0.8;
    if (this.sc) w *= 0.3;
    return w;
  }

  enterPit(c) {
    const req = c.pitReq || {};
    const mech = this.state.staff[c.team.staff.mechanic]?.rating || 65;
    const crew = c.team.facilities.pitcrew;
    let stat = this.endurance ? 26 + rand(0, 6) - mech / 30 - crew * 0.6 : 2.2 + rand(0, 0.6) + (100 - mech) / 90 - crew * 0.08;
    let slow = '';
    if (chance(0.06 * (1.25 - mech / 100) * (1.2 - crew * 0.08))) { const x = rand(2.5, 8); stat += x; slow = ` (pit stop lento +${x.toFixed(1)}s!)`; }
    if (req.swap && this.endurance) stat += 4;
    if (!req.compound && this.endurance) stat -= 9;
    let loss = this.C.pitLoss * (this.sc ? 0.5 : 1);
    if (c.damage > 0 && req.repair !== false) { stat += c.damage * 12; c.damage = 0; }
    c.inPit = loss + stat;
    c.pitStops++;
    if (req.compound) { c.tyre = req.compound; c.wear = 0; c.compoundsUsed.add(req.compound); }
    if (this.endurance) { c.fuel = c.fuelMax; c.stintCount++; }
    if (req.swap && c.driverIds.length > 1) { c.driverIdx = (c.driverIdx + 1) % c.driverIds.length; c.stintCount = 0; }
    const d = this.driver(c);
    const tyreTxt = req.compound ? `gomme ${COMPOUNDS[req.compound].name}` : 'solo carburante';
    this.log(`BOX: ${d.name} si ferma – ${tyreTxt}${req.swap ? ', cambio pilota' : ''}. Sosta ${stat.toFixed(1)}s${slow}`, 'pit', c.key, c.isPlayer);
    c.pitReq = null;
    c.lastStop = stat;
  }

  retire(c, reason, crash) {
    c.status = 'dnf'; c.reason = reason;
    const d = this.driver(c);
    this.log(`${crash ? '💥' : '🔧'} RITIRO: ${d.name} (${c.team.name}) – ${reason}`, crash ? 'crash' : 'fail', c.key, true);
    if (crash && !this.sc && chance(0.65) && c.dist < this.laps - 1.5) this.deploySC();
  }
  deploySC() {
    this.sc = { laps: randInt(2, 3), startLap: Math.floor(this.progress * this.laps) };
    this.scCount++;
    this.log('🚨 SAFETY CAR in pista!', 'sc', null, true);
    for (const c of this.cars) c.lapTarget = this.computeLap(c);
  }

  onLapComplete(c, crossT = this.time) {
    const lapTime = crossT - c.lapStart;
    c.lapStart = crossT;
    c.lap++;
    if (c.lap > 0 && lapTime > 20) {
      c.lastLap = lapTime;
      if (!c.bestLap || lapTime < c.bestLap) c.bestLap = lapTime;
      if (lapTime < this.fastest.time && !this.sc && c.lap > 1) { this.fastest = { time: lapTime, key: c.key }; }
    }
    if (this.endurance) {
      c.fuel -= 1;
      if (c.fuel <= 0) { this.retire(c, 'Senza carburante', false); return; }
    }
    // finish
    if (this.leaderFinished || c.lap >= this.laps) {
      if (!this.leaderFinished) { this.leaderFinished = true; this.log(`🏁 ${this.driver(c).name} vince il ${this.track.name}!`, 'finish', c.key, true); }
      c.status = 'finished'; c.finishTime = crossT + c.penalty; c.finishLap = c.lap;
      return;
    }
    // incidents
    const d = this.driver(c);
    const rain = this.rain;
    const comp = COMPOUNDS[c.tyre];
    let crashP = 0.0011 * { push: 1.9, normal: 1, save: 0.6 }[c.mode] * (1.35 - d.attrs.cons / 100);
    if (!comp.wet && rain > 0.25) crashP *= 1 + rain * 14;
    if (rain > 0) crashP *= 1 + rain * 1.5;
    if (this.night) crashP *= 1.4;
    if (c.wear > 0.9) crashP *= 4;
    if (this.sc) crashP *= 0.1;
    const rel = c.team.car.parts.reliability;
    let failP = 0.0012 * ((100 - rel) / 18) ** 2 * { push: 1.25, normal: 1, save: 0.8 }[c.mode];
    if (this.endurance) failP *= 0.55;
    if (chance(crashP)) {
      const r = Math.random();
      if (r < 0.45) this.retire(c, pick(['Incidente', 'Contatto alla prima curva', 'Fuori pista contro le barriere', 'Testacoda e muro']), true);
      else if (r < 0.75) { c.damage = rand(0.4, 1.4); this.log(`⚠ ${d.name} tocca le barriere: danno all’ala!`, 'warn', c.key, c.isPlayer); }
      else { const loss = rand(4, 12); c.dist -= loss / this.track.lap; this.log(`↺ Testacoda di ${d.name}! Perde ${loss.toFixed(0)} secondi.`, 'warn', c.key, c.isPlayer); }
      if (c.status === 'dnf') return;
    }
    if (chance(failP)) {
      const r = Math.random();
      if (r < 0.55) { this.retire(c, pick(['Power unit', 'Cambio', 'Idraulica', 'Freni', 'Perdita olio', 'Elettronica', 'Sospensione']), false); return; }
      c.damage += rand(0.2, 0.7); this.log(`🔧 Problema tecnico per ${d.name}: perde potenza.`, 'warn', c.key, c.isPlayer);
    }
    if (c.wear > 0.97 && !comp.wet) { c.damage += 0.6; c.pitReq = c.pitReq || { compound: this.dryChoice(c, this.laps - c.dist), fuel: true }; this.log(`💥 Foratura per ${d.name}! Rientra ai box lentamente.`, 'warn', c.key, true); c.dist -= 0.15; }
    // pit decision
    if (c.auto || !c.pitReq) {
      if (c.auto) { const req = this.aiThink(c); if (req) c.pitReq = req; }
    }
    if (c.isPlayer && !c.auto && this.endurance && c.fuel < 1.05 && !c.pitReq) { c.pitReq = { compound: null, fuel: true }; this.log(`⛽ Ingegnere: ${d.name} chiamato ai box per carburante (automatico).`, 'pit', c.key, true); }
    if (c.pitReq && c.lap < this.laps) this.enterPit(c);
    c.lapTarget = this.computeLap(c);
  }

  step(dt) {
    if (this.finished) return;
    this.time += dt;
    const running = this.cars.filter((c) => c.status === 'running');
    const rain = this.rain;
    if (!this._lastRain) this._lastRain = 0;
    if (rain > 0.2 && this._lastRain <= 0.2) this.log('🌧 Inizia a piovere!', 'weather', null, true);
    if (rain < 0.1 && this._lastRain >= 0.1) this.log('☀ La pioggia smette, pista in asciugatura.', 'weather', null, true);
    this._lastRain = rain;
    for (const c of running) {
      if (c.inPit > 0) { c.inPit -= dt; if (c.inPit <= 0) { c.inPit = 0; } continue; }
      const prev = c.dist;
      let lt = c.lapTarget;
      c.dist += dt / lt;
      c.wear = clamp(c.wear + this.wearRate(c) * dt / lt, 0, 1);
      if (Math.floor(c.dist) > c.lap && Math.floor(c.dist) >= 1) this.onLapComplete(c, this.time - (c.dist - Math.floor(c.dist)) * lt);
    }
    // interactions
    const order = this.cars.filter((c) => c.status === 'running' && c.inPit <= 0).sort((a, b) => b.dist - a.dist);
    for (let i = 1; i < order.length; i++) {
      const a = order[i - 1], b = order[i];
      const gap = a.dist - b.dist;
      if (gap > 0.4) continue;
      if (gap < MIN_GAP) {
        if (this.sc || b.dist < 0.3) { b.dist = a.dist - MIN_GAP * (this.sc ? 3 : 1.2); continue; }
        b.battleT += dt;
        if (b.battleT >= 2.2) {
          b.battleT = 0;
          const paceDiff = a.lapTarget - b.lapTarget;
          const da = this.driver(a), db = this.driver(b);
          const drs = this.C.id === 'formula' && rain < 0.2 ? 0.1 : 0;
          const p = clamp(0.06 + this.track.ovt * 0.42 + paceDiff * 0.32 + (db.attrs.race - da.attrs.race) / 110 + drs + (b.mode === 'push' ? 0.06 : 0) - (a.mode === 'push' ? 0.04 : 0), 0.02, 0.9);
          if (chance(p)) {
            b.dist = a.dist + 0.0012; a.dist -= 0.0012;
            [order[i - 1], order[i]] = [b, a];
            if (a.isPlayer || b.isPlayer || i <= 3) this.log(`⇄ ${db.name} sorpassa ${da.name} per la P${i}!`, 'overtake', b.key, b.isPlayer || a.isPlayer);
            // contact risk
            if (chance(0.012 * (1.5 - db.attrs.race / 100))) { this.retire(a, 'Contatto in duello', true); }
          } else b.dist = a.dist - MIN_GAP;
        } else b.dist = a.dist - MIN_GAP;
      } else b.battleT = Math.max(0, b.battleT - dt * 0.3);
    }
    // SC management
    if (this.sc) {
      const leaderLap = Math.floor(Math.max(...running.map((c) => c.dist)));
      if (leaderLap - this.sc.startLap >= this.sc.laps) { this.sc = null; this.log('🟢 Safety car rientra: si riparte!', 'sc', null, true); for (const c of this.cars) c.lapTarget = this.computeLap(c); }
      else {
        // bunch up
        const scStep = dt / (this.track.lap * 1.38);
        for (let i = 1; i < order.length; i++) {
          const a = order[i - 1], b = order[i];
          const g = a.dist - b.dist;
          if (g > MIN_GAP * 3.5 && g < 0.5) b.dist += Math.min(g - MIN_GAP * 3, scStep * 0.4);
        }
      }
    }
    // standings positions
    const all = this.classification();
    all.forEach((c, i) => (c.pos = i + 1));
    if (this.leaderFinished && this.cars.every((c) => c.status !== 'running')) { this.finished = true; this.log('Bandiera a scacchi. Gara conclusa.', 'finish', null, true); }
    // safety: if no one running
    if (!this.cars.some((c) => c.status === 'running')) this.finished = true;
  }

  classification() {
    return this.cars.slice().sort((a, b) => {
      const sa = a.status === 'dnf' ? 1 : 0, sb = b.status === 'dnf' ? 1 : 0;
      if (sa !== sb) return sa - sb;
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

  runToEnd(maxSteps = 200000) {
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
      return { key: c.key, teamId: c.teamId, driverIds: c.driverIds, pos, status: c.status === 'dnf' ? 'dnf' : 'fin', reason: c.reason, pts, gap, bestLap: c.bestLap, pitStops: c.pitStops, grid: c.grid, laps: c.status === 'finished' ? c.finishLap : Math.floor(Math.max(0, c.dist)) };
    });
    // fastest lap bonus? (not in 2026 rules) – just record
    return { classification: out, fastest: this.fastest, scCount: this.scCount };
  }
}
