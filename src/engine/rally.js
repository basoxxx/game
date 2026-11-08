// Rally event simulation: loops of stages, sector pace notes, tyres per loop with spares,
// live split times, co-driver calls, incidents and a timed service park.
import { CATEGORIES, RALLY_TYRES, SURFACES, POINTS_STD } from '../data/categories.js';
import { buildEntries, aiSetupQuality } from './race.js';
import { carPerf } from './season.js';
import { rand, randInt, chance, clamp, gauss, pick, mulberry32 } from './rng.js';

export const PACE_MODES = {
  safe: { name: 'Prudente', speed: -0.013, risk: 0.45 },
  normal: { name: 'Equilibrato', speed: 0, risk: 1 },
  push: { name: 'Attacco', speed: 0.013, risk: 2.3 },
};

// Sector characters the co-driver reads from the pace notes. gain: how much attacking pays,
// risk: off-road risk, punc: puncture risk, susp: chance an off hurts the suspension
export const SECTOR_TYPES = {
  fast: { name: 'Veloce', note: 'Rettilinei e curve in pieno, dossi ciechi', gain: 1.25, risk: 1.15, punc: 0.9 },
  twisty: { name: 'Tornanti', note: 'Tornanti stretti, si guadagna poco', gain: 0.75, risk: 0.75, punc: 0.8 },
  rough: { name: 'Pietre', note: 'Solchi profondi e pietre smosse', gain: 0.9, risk: 1.0, punc: 2.1 },
  jumps: { name: 'Salti', note: 'Creste e salti lunghi', gain: 1.05, risk: 1.3, punc: 1, susp: 1 },
  narrow: { name: 'Stretta', note: 'Stretta tra alberi e muretti', gain: 1.1, risk: 1.55, punc: 0.9 },
  slippery: { name: 'Scivolosa', note: 'Fango, ghiaccio o ghiaia sciolta', gain: 0.95, risk: 1.4, punc: 0.8 },
};
const SECTOR_POOL = {
  gravel: ['fast', 'fast', 'rough', 'jumps', 'twisty', 'narrow', 'slippery'],
  rough: ['rough', 'rough', 'jumps', 'twisty', 'narrow'],
  tarmac: ['fast', 'twisty', 'twisty', 'narrow', 'narrow', 'slippery'],
  snow: ['fast', 'slippery', 'slippery', 'narrow', 'twisty'],
};

export function bestTyreFor(stage, wet) {
  if (stage.surface === 'snow') return 'snow';
  if (stage.surface === 'tarmac') return wet ? 'wet' : stage.km > 18 ? 'tarmac_hard' : 'tarmac_soft';
  return stage.km > 18 || stage.surface === 'rough' ? 'gravel_hard' : 'gravel_soft';
}

export function tyreFit(tyreId, stage, wet) {
  const t = RALLY_TYRES[tyreId];
  const surf = stage.surface === 'rough' ? 'gravel' : stage.surface;
  let f = 0;
  if (surf === 'snow') f = t.surf === 'snow' ? 0 : -0.07;
  else if (surf === 'tarmac') {
    if (t.surf === 'tarmac') f = wet ? -0.025 : 0; else if (t.surf === 'wet') f = wet ? 0.005 : -0.02; else if (t.surf === 'snow') f = -0.05; else f = -0.06;
  } else {
    if (t.surf === 'gravel') f = 0; else if (t.surf === 'snow') f = -0.03; else f = -0.07;
  }
  if (tyreId.endsWith('soft')) f += stage.km > 18 ? -0.006 : 0.006;
  if (tyreId.endsWith('hard')) f += stage.km > 18 ? 0.003 : -0.002;
  return f;
}
// pace lost to a worn set (wear 0..1+)
export const wearPenalty = (w) => 0.028 * Math.pow(Math.max(0, w - 0.25), 1.6) / 0.6;
// tyre wear produced by one stage
export function stageWear(tyreId, stage) {
  const sf = { rough: 1.5, gravel: 1.1, tarmac: 1, snow: 0.7 }[stage.surface] || 1;
  return (stage.km / 34) * (RALLY_TYRES[tyreId]?.wear || 1) * sf;
}

export const DECISIONS = [
  { id: 'cut', text: 'Dosso cieco e sinistra stretta. Il copilota: «Taglio con pietre, attento!»', a: { label: 'Taglia la corda', desc: '−2.5s, rischio foratura', gain: -2.5, risk: 0.24, fail: 'puncture' }, b: { label: 'Linea pulita', desc: 'Nessun rischio', gain: 0, risk: 0 } },
  { id: 'jump', text: 'Salto lungo in arrivo dopo la cresta!', a: { label: 'Gas a fondo', desc: '−2s, rischio danni sospensioni', gain: -2, risk: 0.22, fail: 'suspension' }, b: { label: 'Alza il piede', desc: '+1s, sicuro', gain: 1, risk: 0 } },
  { id: 'turbo', text: 'La temperatura del turbo sta salendo pericolosamente!', a: { label: 'Continua a spingere', desc: 'Nessuna perdita, rischio guasto', gain: 0, risk: 0.18, fail: 'engine' }, b: { label: 'Mappa protezione', desc: '+4s, motore salvo', gain: 4, risk: 0 } },
  { id: 'grip', text: 'Tratto a bassa aderenza: fango e acqua sulla traiettoria.', a: { label: 'Attacca', desc: '−3s, rischio uscita', gain: -3, risk: 0.2, fail: 'off' }, b: { label: 'Prudenza', desc: '+2s', gain: 2, risk: 0.02, fail: 'off' } },
  { id: 'slow', text: 'Foratura lenta! La pressione posteriore sinistra scende.', a: { label: 'Continua così', desc: '+15s, rischio di perdere la ruota', gain: 15, risk: 0.38, fail: 'wheel' }, b: { label: 'Cambia la ruota', desc: '+70s, usa una scorta', gain: 70, risk: 0, spare: true } },
  { id: 'dust', text: 'Polvere sospesa dall’auto partita prima di voi: visibilità ridotta.', a: { label: 'Rischia nel polverone', desc: '−2s, rischio uscita', gain: -2, risk: 0.16, fail: 'off' }, b: { label: 'Rallenta', desc: '+3s', gain: 3, risk: 0 }, not: ['tarmac', 'snow'] },
  { id: 'hairpin', text: 'Tornante stretto in discesa: freno a mano o traiettoria larga?', a: { label: 'Freno a mano', desc: '−1.5s, rischio stallo', gain: -1.5, risk: 0.15, fail: 'stall' }, b: { label: 'Traiettoria larga', desc: '+0.5s', gain: 0.5, risk: 0 } },
  { id: 'brakes', text: 'I freni stanno surriscaldando nella lunga discesa.', a: { label: 'Ignora', desc: 'Rischio lungo in curva', gain: 0, risk: 0.2, fail: 'off' }, b: { label: 'Raffredda', desc: '+3s', gain: 3, risk: 0 } },
  { id: 'notes', text: 'Il copilota perde il segno nelle note: «Aspetta… non so dove siamo!»', a: { label: 'Guida a vista', desc: 'Nessuna perdita, rischio uscita', gain: 0, risk: 0.22, fail: 'off' }, b: { label: 'Rallenta finché ritrova il punto', desc: '+4s', gain: 4, risk: 0 } },
  { id: 'bank', text: 'Muro di neve all’esterno della curva veloce: ci si può appoggiare.', a: { label: 'Appoggiati al muro', desc: '−2.5s, rischio di restare piantati', gain: -2.5, risk: 0.18, fail: 'stuck' }, b: { label: 'Stai al centro', desc: '+0.5s', gain: 0.5, risk: 0 }, only: ['snow'] },
  { id: 'splash', text: 'Guado profondo dopo il dosso: l’acqua arriva al cofano!', a: { label: 'Entra in pieno', desc: '−2s, rischio acqua nel motore', gain: -2, risk: 0.16, fail: 'engine' }, b: { label: 'Entra piano', desc: '+2s', gain: 2, risk: 0 }, only: ['gravel', 'rough'] },
  { id: 'mud', text: 'I tagli delle auto precedenti hanno portato fango sull’asfalto.', a: { label: 'Taglia anche tu', desc: '−1.5s, rischio foratura', gain: -1.5, risk: 0.2, fail: 'puncture' }, b: { label: 'Resta sull’asfalto pulito', desc: '+1s', gain: 1, risk: 0 }, only: ['tarmac'] },
  { id: 'crowd', text: 'Spettatori in traiettoria all’uscita del tornante!', a: { label: 'Clacson e avanti', desc: '−1s, rischio di dover frenare di colpo', gain: -1, risk: 0.2, fail: 'stall' }, b: { label: 'Rallenta, sicurezza prima di tutto', desc: '+2s', gain: 2, risk: 0 } },
];

const DMG_NAMES = { engine: 'motore', suspension: 'sospensioni', gearbox: 'cambio', body: 'carrozzeria' };

export class RallyEvent {
  constructor(state, ev, track, setups) {
    this.state = state; this.ev = ev; this.track = track;
    this.C = CATEGORIES.rally;
    this.stages = ev.stages.map((s, i) => ({ ...s, idx: i, wet: s.surface !== 'snow' && (state.forceRain === true ? true : state.forceRain === false ? false : chance(state.forceRain === 'mixed' ? 0.5 : track.rain)) }));
    // pace-note sectors and a weather forecast per stage (deterministic per event)
    let h = 5; for (const ch of `${track.id}|${state.season}|${state.round}`) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const r = mulberry32(h);
    for (const s of this.stages) {
      const pool = SECTOR_POOL[s.surface] || SECTOR_POOL.gravel;
      s.sectors = [0, 1, 2].map(() => pool[Math.floor(r() * pool.length)]);
      s.rainP = s.surface === 'snow' ? 0 : state.forceRain === true || state.forceRain === false ? (s.wet ? 95 : 3) : Math.round(clamp(s.wet ? 52 + r() * 40 : (track.rain || 0) * 60 + r() * 22, 2, 96));
    }
    this.stageIdx = 0;
    this.fast = track.fast || 1;
    this.tv = []; this.tvId = 0;
    this.crews = buildEntries(state).map((e) => {
      const team = state.teams[e.teamId];
      return {
        ...e, team, total: 0, stageTimes: [], status: 'running', retiredLeg: false, superRally: 0,
        damage: { engine: 0, suspension: 0, gearbox: 0, body: 0 }, setupQ: setups[e.key] ?? aiSetupQuality(state, team),
        incidents: [], penalty: 0, psPoints: 0, tyre: null, tyreWear: 0, spare: null, spares: 2, check: 0, posHist: [],
      };
    });
    this.log = [];
  }
  driver(c) { return this.state.drivers[c.driverIds[0]]; }
  get stage() { return this.stages[this.stageIdx]; }
  isServiceAfter(i) { return i % 2 === 1 && i < this.stages.length - 1; }
  // first stage of a loop: tyres are chosen here (start of the rally or right after a service)
  isLoopStart(i = this.stageIdx) { return i === 0 || this.isServiceAfter(i - 1); }
  loopStages(i = this.stageIdx) { let a = i; while (!this.isLoopStart(a)) a--; const out = [this.stages[a]]; let b = a; while (b + 1 < this.stages.length && !this.isLoopStart(b + 1)) out.push(this.stages[++b]); return out; }
  pushTV(g) { this.tv.push({ id: ++this.tvId, stage: this.stageIdx, ...g }); if (this.tv.length > 200) this.tv.shift(); }

  perfOn(c, stage) {
    const w = SURFACES[stage.surface].weights;
    return carPerf(this.state, c.team, { w });
  }

  // tyre that minimises the expected time loss over the loop (AI and co-driver advice)
  loopTyreAdvice(stages = this.loopStages()) {
    let best = null, bv = -1e9;
    for (const t of Object.keys(RALLY_TYRES)) {
      let v = 0, wear = 0;
      for (const s of stages) {
        const pw = s.idx === this.stageIdx ? (s.wet ? 1 : 0) : s.rainP / 100;
        v += s.km * ((1 - pw) * tyreFit(t, s, false) + pw * tyreFit(t, s, true) - wearPenalty(wear + stageWear(t, s) / 2));
        wear += stageWear(t, s);
      }
      if (v > bv) { bv = v; best = t; }
    }
    return best;
  }

  // expected stage time delta and off-road risk of a sector pace plan (shown in the prep screen)
  paceEstimate(c, paces, stage = this.stage) {
    const d = this.driver(c);
    const sectorT = this.nominalTime(c, stage) / 3;
    let dt = 0, safe = 1;
    paces.forEach((p, s) => {
      const T = SECTOR_TYPES[stage.sectors[s]]; const pm = PACE_MODES[p];
      dt += -sectorT * pm.speed * T.gain;
      safe *= 1 - this.offChance(c, stage, pm.risk * T.risk, d) / 3;
    });
    return { dt, risk: 1 - safe };
  }
  offChance(c, st, riskMult, d = this.driver(c)) {
    const surfRisk = { rough: 1.45, snow: 1.15, gravel: 1, tarmac: 0.9 }[st.surface] * (st.wet ? 1.35 : 1);
    return 0.032 * riskMult * (1.38 - d.attrs.cons / 100) * surfRisk * (1 + c.damage.suspension * 0.6);
  }
  nominalTime(c, st, tyre = c.tyre || bestTyreFor(st, st.wet)) {
    const d = this.driver(c); const surf = SURFACES[st.surface];
    const pace = d.attrs.pace * (st.wet ? 0.7 : 1) + d.attrs.wet * (st.wet ? 0.3 : 0);
    let f = 1 + (this.perfOn(c, st) - 80) * 0.0034 + (pace - 80) * 0.0031 + c.setupQ * 0.012 + tyreFit(tyre, st, st.wet) - wearPenalty(c.tyreWear);
    f -= c.damage.engine * 0.025 + c.damage.suspension * 0.03 + c.damage.gearbox * 0.022 + c.damage.body * 0.006;
    if (st.wet) f -= 0.05;
    if (c.spares > 1) f -= 0.0015;
    return st.km / (surf.speed * this.fast * f) * 3600;
  }

  // Build a run plan for this stage. choices[key] = { tyre, spare, spares, paces:[s0,s1,s2] | pace, useSpare }
  planStage(choices = {}) {
    const st = this.stage;
    const res = [];
    const loopStart = this.isLoopStart();
    for (const c of this.crews) {
      if (c.status === 'out') continue;
      const d = this.driver(c);
      const ch = { ...(this.aiChoice(c, st)), ...(choices[c.key] || {}) };
      if (!ch.paces) ch.paces = [ch.pace || 'normal', ch.pace || 'normal', ch.pace || 'normal'];
      // tyres: fitted at the start of a loop, otherwise only the spares can be swapped in
      if (loopStart || !c.tyre) { c.tyre = ch.tyre; c.tyreWear = 0; c.spare = ch.spare || ch.tyre; c.spares = ch.spares ?? 2; }
      else if (ch.useSpare && c.spares >= 2 && c.spare) { this.pushLog(`${d.name} monta le gomme di scorta (${RALLY_TYRES[c.spare].name}) nella zona di montaggio.`, 'info', c); c.tyre = c.spare; c.tyreWear *= 0.45; c.spares = 0; }
      ch.tyre = c.tyre;
      c.choice = ch;
      if (c.retiredLeg) { c.plan = null; continue; }
      const T0 = this.nominalTime(c, st) * (1 + gauss(0, 0.0045 * (1.5 - d.attrs.cons / 100)));
      const secT = ch.paces.map((p, s) => T0 / 3 / (1 + PACE_MODES[p].speed * SECTOR_TYPES[st.sectors[s]].gain));
      const stops = [];
      for (let s = 0; s < 3; s++) { const st2 = this.rollSector(c, st, s, ch.paces[s], 0); if (st2) stops.push(st2); }
      const rel = c.team.car.parts.reliability;
      if (chance(0.016 * ((100 - rel) / 20) ** 2 * (ch.paces.includes('push') ? 1.3 : 1) * (1 - c.check * 0.5))) {
        const comp = pick(['engine', 'gearbox', 'suspension']);
        const terminal = chance(0.18);
        stops.push({ p: rand(0.1, 0.95), dur: terminal ? 9999 : rand(8, 30), text: terminal ? `🔧 Guasto fatale per ${d.name}: ${comp === 'engine' ? 'motore' : comp === 'gearbox' ? 'cambio' : 'sospensione'} KO` : `🔧 ${d.name} ha un problema meccanico, rallenta`, kind: terminal ? 'terminal' : 'mech', dmg: terminal ? null : { [comp]: rand(0.3, 0.6) } });
      }
      c.check = 0;
      // co-driver calls for player crews (one, sometimes two per stage)
      const decisions = [];
      if (c.isPlayer) {
        const opts = DECISIONS.filter((x) => (!x.only || x.only.includes(st.surface)) && (!x.not || !x.not.includes(st.surface)));
        const n = chance(0.85) ? (chance(0.4) ? 2 : 1) : 0;
        const used = new Set();
        for (let k = 0; k < n; k++) { let t = pick(opts); if (used.has(t.id)) t = pick(opts); if (used.has(t.id)) continue; used.add(t.id); decisions.push({ p: k === 0 ? rand(0.2, 0.55) : rand(0.6, 0.88), t, done: false }); }
      }
      stops.sort((a, b) => a.p - b.p);
      c.plan = { secT, base: secT.reduce((a, b) => a + b, 0), stops, decisions, decision: decisions[0] || null, paces: ch.paces.slice() };
      res.push(c);
    }
    this.buildPieces();
    return res;
  }
  // random incident inside sector s (from progress pMin on)
  rollSector(c, st, s, pace, pMin = 0) {
    const d = this.driver(c);
    const T = SECTOR_TYPES[st.sectors[s]]; const pm = PACE_MODES[pace];
    const a = Math.max(s / 3, pMin), b = (s + 1) / 3; if (b - a < 0.01) return null;
    const frac = (b - a) * 3;
    const p = rand(a + 0.005, b - 0.005);
    if (chance(this.offChance(c, st, pm.risk * T.risk, d) / 3 * frac)) {
      const r = Math.random();
      const [m1, m2] = pace === 'push' ? [0.5, 0.85] : pace === 'safe' ? [0.72, 0.95] : [0.63, 0.9];
      if (r < m1) return { p, dur: rand(4, 16), text: `${d.name} va lungo e perde qualche secondo`, kind: 'minor', sec: s };
      if (r < m2) return { p, dur: rand(25, 85), text: `${d.name} esce di strada! Gli spettatori aiutano a rimetterla in carreggiata`, kind: 'major', dmg: { body: rand(0.2, 0.5), suspension: rand(0, 0.4) + (T.susp ? 0.15 : 0) }, sec: s };
      return { p, dur: 9999, text: `💥 ${d.name} si cappotta! Equipaggio OK, ma la gara finisce qui per oggi`, kind: 'crash', sec: s };
    }
    const tyre = c.tyre || 'gravel_hard';
    const puncP = 0.018 * ({ rough: 2.2, gravel: 1.2, snow: 0.6, tarmac: 0.7 }[st.surface]) * (tyre.endsWith('soft') ? 1.5 : 1) * (st.km > 18 ? 1.3 : 1) * T.punc * (1 + c.tyreWear * 1.2) * (pace === 'push' ? 1.3 : pace === 'safe' ? 0.8 : 1) / 3 * frac;
    if (chance(puncP)) return { p, dur: rand(40, 95), text: `${d.name} fora! Cambio ruota in prova`, kind: 'puncture', sec: s };
    return null;
  }

  aiChoice(c, st) {
    const tyre = this.isLoopStart() || !c.tyre ? (chance(0.85) ? this.loopTyreAdvice() : bestTyreFor(st, st.wet)) : c.tyre;
    const d = this.driver(c);
    const sorted = this.overall();
    const myPos = sorted.indexOf(c);
    let pace = 'normal';
    if (myPos > 2 && myPos < 7 && chance(0.35)) pace = 'push';
    if (myPos === 0 && chance(0.35)) pace = 'safe';
    if (d.attrs.cons < 78 && chance(0.2)) pace = 'push';
    // AIs read the notes too: back off in the most dangerous sector
    const paces = st.sectors.map((s) => (pace === 'push' && SECTOR_TYPES[s].risk > 1.35 && !c.isPlayer && chance(0.5) ? 'normal' : pace));
    const useSpare = !this.isLoopStart() && c.spares >= 2 && c.spare && c.spare !== c.tyre && tyreFit(c.spare, st, st.wet) > tyreFit(c.tyre, st, st.wet) + 0.02;
    return { tyre, spare: tyre, spares: 2, pace, paces, useSpare };
  }

  // duration of a move between two progress points, using the per-sector times
  moveDur(c, a, b) {
    let t = 0;
    for (let s = 0; s < 3; s++) { const lo = Math.max(a, s / 3), hi = Math.min(b, (s + 1) / 3); if (hi > lo) t += (hi - lo) * 3 * c.plan.secT[s]; }
    return t;
  }
  // build the piece list from progress p0 (moves split at sector lines, stops, decisions)
  piecesFrom(c, p0, lead = []) {
    const pieces = lead.slice();
    let p = p0;
    const marks = c.plan.stops.filter((s) => s.p >= p0 && !s.used).map((s) => ({ ...s, type: 'stop', ref: s }));
    for (const dc of c.plan.decisions) if (!dc.done && dc.p >= p0) marks.push({ p: dc.p, type: 'decision', dc });
    for (const sp of [1 / 3, 2 / 3]) if (sp > p0 + 1e-6) marks.push({ p: sp, type: 'sector' });
    marks.sort((a, b) => a.p - b.p);
    for (const m of marks) {
      if (m.p > p) { pieces.push({ type: 'move', p0: p, p1: m.p, dur: this.moveDur(c, p, m.p) }); p = m.p; }
      if (m.type === 'stop') { pieces.push({ type: 'stop', p, dur: m.dur, stop: m.ref }); if (m.dur >= 9999) return pieces; }
      else if (m.type === 'decision') pieces.push({ type: 'decision', p, dur: 0, dc: m.dc });
    }
    if (p < 1) pieces.push({ type: 'move', p0: p, p1: 1, dur: this.moveDur(c, p, 1) });
    return pieces;
  }
  buildPieces() {
    // start order (visual only, does not affect stage times), 20s apart: the leaders run last so they
    // can chase the split times; on the first stage, by seeding (team reputation)
    const order = this.stageIdx === 0 ? this.crews.filter((c) => c.plan).sort((a, b) => (a.team.rep || 0) - (b.team.rep || 0) || a.carIdx - b.carIdx) : this.overall().filter((c) => c.plan).reverse();
    const startIdx = new Map(order.map((c, i) => [c, i]));
    for (const c of this.crews) {
      if (!c.plan) { c.stageResult = null; c.progress = 0; c.splitTimes = {}; c.pieces = []; continue; }
      const delay = (startIdx.get(c) || 0) * 20;
      c.pieces = this.piecesFrom(c, 0, delay ? [{ type: 'wait', p0: 0, p1: 0, dur: delay }] : []);
      c.pieceIdx = 0; c.pieceT = 0; c.progress = 0; c.stageT = 0; c.done = false; c.splits = []; c.splitTimes = {}; c.stageResult = null; c.waiting = !!delay;
    }
  }
  sectorAt(p) { return Math.min(2, Math.floor(p * 3 + 1e-9)); }

  // Live pace change from the current sector on: re-times the rest of the stage and re-rolls the risk
  setLivePace(c, pace) {
    if (!c.plan || c.done) return false;
    const st = this.stage;
    const p0 = c.progress || 0;
    const cur = this.sectorAt(p0);
    const pc = c.pieces[c.pieceIdx];
    if (pc?.type === 'decision') return false;
    const T0 = this.nominalTime(c, st);
    for (let s = cur; s < 3; s++) {
      const old = c.plan.paces[s]; if (old === pace) continue;
      c.plan.paces[s] = pace;
      c.plan.secT[s] = T0 / 3 / (1 + PACE_MODES[pace].speed * SECTOR_TYPES[st.sectors[s]].gain);
      const ratio = PACE_MODES[pace].risk / PACE_MODES[old].risk;
      // future incidents in the sector: fewer if calmer, extra rolls if braver
      for (const so of c.plan.stops) if (so.sec === s && so.p > p0 && ['minor', 'major', 'crash'].includes(so.kind) && ratio < 1 && !chance(ratio)) so.used = true;
      if (ratio > 1 && chance(Math.min(1, ratio - 1))) { const x = this.rollSector(c, st, s, pace, p0); if (x) c.plan.stops.push(x); }
    }
    c.plan.stops.sort((a, b) => a.p - b.p);
    c.plan.base = c.plan.secT.reduce((a, b) => a + b, 0);
    // keep what is in progress: waiting at the start or stuck in a stop
    const lead = [];
    if (pc?.type === 'wait') lead.push({ type: 'wait', p0: 0, p1: 0, dur: pc.dur - c.pieceT });
    else if (pc?.type === 'stop') { lead.push({ type: 'stop', p: p0, dur: pc.dur - c.pieceT, stop: pc.stop, logged: true }); if (pc.stop) pc.stop.used = true; }
    // stops already behind the car never come back
    for (const so of c.plan.stops) if (so.p < p0) so.used = true;
    c.pieces = this.piecesFrom(c, p0 + 1e-6, lead);
    c.pieceIdx = 0; c.pieceT = 0;
    return true;
  }

  // reference time at progress p: fastest crew through the splits so far (for live deltas)
  refAt(p) {
    const pts = [[0, 0]];
    for (const sp of [1 / 3, 2 / 3]) { const ts = this.crews.map((c) => c.splitTimes?.[sp]).filter((x) => x != null); if (ts.length) pts.push([sp, Math.min(...ts)]); }
    const fin = this.crews.filter((c) => c.stageResult != null).map((c) => c.stageResult);
    if (fin.length) pts.push([1, Math.min(...fin)]);
    if (pts.length < 2) return null;
    for (let i = 1; i < pts.length; i++) if (p <= pts[i][0]) { const [a, ta] = pts[i - 1], [b, tb] = pts[i]; return ta + (tb - ta) * (p - a) / (b - a); }
    const [a, ta] = pts[pts.length - 2], [b, tb] = pts[pts.length - 1];
    if (p > b) return null;
    return ta + (tb - ta) * (p - a) / (b - a);
  }

  // advance animation by dt seconds (stage time). returns the crew waiting on a decision, if any
  advance(dt) {
    let req = null;
    for (const c of this.crews) {
      if (!c.plan || c.done) continue;
      let left = dt;
      while (left > 0 && !c.done) {
        const pc = c.pieces[c.pieceIdx];
        if (!pc) { this.finishCrew(c); break; }
        if (pc.type === 'decision') {
          if (pc.dc && !pc.dc.done) { c.plan.decision = pc.dc; req = req || c; break; }
          c.pieceIdx++; continue;
        }
        const remain = pc.dur - c.pieceT;
        const use = Math.min(left, remain);
        c.pieceT += use; if (pc.type !== 'wait') c.stageT += use; left -= use;
        c.waiting = pc.type === 'wait';
        if (pc.type === 'move') c.progress = pc.p0 + (pc.p1 - pc.p0) * (pc.dur ? c.pieceT / pc.dur : 1);
        if (pc.type === 'stop' && !pc.logged) {
          pc.logged = true; if (pc.stop) pc.stop.used = true;
          this.onStop(c, pc);
          if (pc.stop.dur >= 9999) {
            c.done = true;
            if (pc.stop.kind === 'terminal' || (pc.stop.kind === 'crash' && chance(0.35))) { c.status = 'out'; this.pushLog(`${this.driver(c).name} è definitivamente ritirato dal rally.`, 'out', c); }
            else { c.retiredLeg = true; this.pushLog(`${this.driver(c).name} potrà ripartire con il Super Rally dopo l’assistenza.`, 'info', c); }
            c.stageResult = null;
            break;
          }
        }
        for (const sp of [1 / 3, 2 / 3]) if (c.progress >= sp - 1e-9 && !c.splits.includes(sp)) { c.splits.push(sp); (c.splitTimes ||= {})[sp] = c.stageT; this.onSplit(c, sp); }
        if (c.pieceT >= pc.dur - 1e-9) { c.pieceIdx++; c.pieceT = 0; if (c.pieceIdx >= c.pieces.length) this.finishCrew(c); }
      }
    }
    return req;
  }
  onStop(c, pc) {
    const s = pc.stop;
    // punctures use a spare; without one the crew limps on the rim
    if (s.kind === 'puncture') {
      if (c.spares > 0) { c.spares--; this.pushLog(`${s.text} (scorte rimaste: ${c.spares})`, 'puncture', c); }
      else { pc.dur += 70; c.damage.suspension = clamp(c.damage.suspension + 0.25, 0, 1); this.pushLog(`${this.driver(c).name} fora senza ruote di scorta: chilometri sul cerchio!`, 'puncture', c); }
      if (c.isPlayer || this.overall().indexOf(c) < 5) this.pushTV({ kind: 'drama', key: c.key, title: 'Foratura', text: this.driver(c).name });
    } else this.pushLog(s.text, s.kind, c);
    if (s.dmg) for (const [k, v] of Object.entries(s.dmg)) c.damage[k] = clamp(c.damage[k] + v, 0, 1);
    if ((s.kind === 'major' || s.kind === 'crash' || s.kind === 'terminal') && (c.isPlayer || this.overall().indexOf(c) < 6)) this.pushTV({ kind: 'drama', key: c.key, title: s.kind === 'major' ? 'Uscita di strada' : s.kind === 'crash' ? 'Incidente' : 'Guasto', text: this.driver(c).name, big: s.dur >= 9999 });
  }
  onSplit(c, sp) {
    const idx = sp >= 1 ? 'F' : sp < 0.5 ? 1 : 2;
    const others = this.crews.filter((x) => x !== c && x.splitTimes?.[sp] != null);
    const best = others.length ? others.reduce((a, b) => (a.splitTimes[sp] < b.splitTimes[sp] ? a : b)) : null;
    const t = c.splitTimes[sp];
    const fastest = !best || t < best.splitTimes[sp];
    if (c.isPlayer || (fastest && others.length >= 2)) this.pushTV({ kind: 'split', key: c.key, idx, t, ref: best?.key || null, delta: best ? t - best.splitTimes[sp] : null, fastest });
  }

  resolveDecision(c, choice) {
    const dec = c.plan.decision || c.plan.decisions.find((x) => !x.done); dec.done = true;
    const opt = dec.t[choice];
    const d = this.driver(c);
    const risk = opt.risk * (1.4 - d.attrs.cons / 100);
    let text = '';
    const pi = c.pieceIdx;
    let extra = opt.gain;
    let dmg = null;
    if (opt.spare) { if (c.spares > 0) c.spares--; else { extra += 50; text = 'Nessuna scorta a bordo: sostituzione di fortuna. '; } }
    if (opt.risk && chance(risk)) {
      if (opt.fail === 'puncture') { if (c.spares > 0) { c.spares--; extra += rand(45, 80); } else extra += rand(100, 140); text = `Foratura! ${d.name} perde tempo cambiando la ruota.`; }
      if (opt.fail === 'suspension') { extra += rand(5, 15); dmg = { suspension: rand(0.3, 0.6) }; text = `Atterraggio violento: sospensione danneggiata!`; }
      if (opt.fail === 'engine') { extra += rand(10, 30); dmg = { engine: rand(0.35, 0.7) }; text = `Il motore protesta: potenza ridotta!`; }
      if (opt.fail === 'off') { extra += rand(10, 45); dmg = { body: rand(0.2, 0.5) }; text = `${d.name} finisce in un fosso! Tempo perso.`; }
      if (opt.fail === 'wheel') { extra += rand(60, 110); dmg = { suspension: rand(0.3, 0.5) }; text = `La gomma si stacca dal cerchio! Danni e minuti persi.`; }
      if (opt.fail === 'stall') { extra += rand(4, 9); text = `Motore spento nel tornante, ripartenza lenta.`; }
      if (opt.fail === 'stuck') { extra += rand(20, 60); dmg = { body: rand(0.1, 0.3) }; text = `${d.name} resta piantato nel muro di neve! Gli spettatori spingono.`; }
    } else text += opt.gain < 0 ? `Mossa riuscita! ${d.name} guadagna ${Math.abs(opt.gain)}s.` : `Scelta prudente di ${d.name}.`;
    if (dmg) for (const [k, v] of Object.entries(dmg)) c.damage[k] = clamp(c.damage[k] + v, 0, 1);
    // insert a time adjustment: positive -> stop; negative -> speed up next move piece
    const next = c.pieces[pi + 1];
    if (extra > 0) c.pieces.splice(pi + 1, 0, { type: 'stop', p: c.progress, dur: extra, stop: { text: '', kind: 'adj' }, logged: true });
    else if (next && next.type === 'move') next.dur = Math.max(1, next.dur + extra);
    c.pieceIdx++;
    c.plan.decision = c.plan.decisions.find((x) => !x.done) || null;
    this.pushLog(text, extra > 5 ? 'warn' : 'good', c);
    return { text, good: extra <= 0, gain: extra };
  }

  finishCrew(c) {
    c.done = true;
    c.stageResult = c.stageT;
    (c.splitTimes ||= {})[1] = c.stageT;
    this.onSplit(c, 1);
  }

  allDone() { return this.crews.every((c) => !c.plan || c.done); }

  pushLog(text, kind, c) { if (text) this.log.unshift({ text, kind, key: c?.key, stage: this.stageIdx, player: c?.isPlayer }); if (this.log.length > 160) this.log.pop(); }

  // finalize stage times
  completeStage() {
    const st = this.stage;
    const before = this.overall().filter((c) => c.status !== 'out').map((c) => c.key);
    const finishers = this.crews.filter((c) => c.plan && c.stageResult != null);
    const best = Math.min(...finishers.map((c) => c.stageResult));
    const slowest = Math.max(...finishers.map((c) => c.stageResult));
    for (const c of this.crews) {
      if (c.status === 'out') { if (c.stageTimes.length <= this.stageIdx) c.stageTimes.push(null); continue; }
      if (c.plan && c.stageResult != null) c.stageTimes.push(c.stageResult);
      else {
        // super rally nominal time
        const t = slowest + 60;
        c.stageTimes.push(t);
        if (!c.superRally) { c.penalty += 300; c.superRally = 1; }
      }
      c.total = c.stageTimes.reduce((s, x) => s + (x || 0), 0) + c.penalty;
    }
    const ranking = finishers.slice().sort((a, b) => a.stageResult - b.stageResult);
    st.winner = ranking[0]?.key; st.best = best;
    st.results = ranking.map((c) => ({ key: c.key, time: c.stageResult, s1: c.splitTimes?.[1 / 3] ?? null, s2: c.splitTimes?.[2 / 3] ?? null }));
    st.before = before;
    if (st.power) {
      const ps = [5, 4, 3, 2, 1];
      ranking.slice(0, 5).forEach((c, i) => (c.psPoints = ps[i]));
    }
    // tyre wear for the stage just run, rough-road suspension wear
    for (const c of this.crews) {
      if (c.plan && c.tyre) c.tyreWear += stageWear(c.tyre, st) * (c.plan.paces?.includes('push') ? 1.12 : 1);
      if (st.surface === 'rough' && c.plan && chance(0.2)) c.damage.suspension = clamp(c.damage.suspension + rand(0.05, 0.15), 0, 1);
      c.plan = null; c.choice = null;
    }
    const ov = this.overall();
    ov.forEach((c, i) => c.posHist.push(c.status === 'out' ? null : i + 1));
    st.gapsAfter = Object.fromEntries(ov.filter((c) => c.status !== 'out').map((c) => [c.key, c.total - ov[0].total]));
    this.stageIdx++;
    return ranking;
  }

  // Service park. repairs: key -> [components] fully repaired.
  // opts[key]: { quick: [components patched], setup: bool, check: bool } (player only; AIs fix everything)
  service(repairs = {}, opts = {}) {
    const notes = [];
    for (const c of this.crews) {
      if (c.status === 'out') continue;
      const mech = this.state.staff[c.team.staff.mechanic]?.rating || 65;
      const crew = c.team.facilities.pitcrew;
      const o = c.isPlayer ? (opts[c.key] || {}) : {};
      const comps = c.isPlayer ? (repairs[c.key] || []) : Object.keys(c.damage).filter((k) => c.damage[k] > 0.05);
      let minutes = SERVICE_BASE;
      for (const k of comps) { minutes += repairMinutes(c.damage[k], mech, crew); c.damage[k] = 0; }
      for (const k of o.quick || []) { if (comps.includes(k)) continue; minutes += quickMinutes(c.damage[k], mech, crew); c.damage[k] = clamp(c.damage[k] * 0.4, 0, 1); }
      if (o.setup) { minutes += SERVICE_SETUP; c.setupQ = clamp(c.setupQ + (0.95 - c.setupQ) * 0.55, 0, 0.97); }
      if (o.check) { minutes += SERVICE_CHECK; c.check = 1; }
      if (!c.isPlayer && c.setupQ < 0.6 && chance(0.4)) c.setupQ += 0.08;
      const over = Math.max(0, minutes - SERVICE_TIME);
      if (over > 0) { const pen = Math.ceil(over) * 10; c.penalty += pen; notes.push(`${this.driver(c).name}: ${Math.ceil(over)} min di ritardo al controllo orario, penalità ${pen}s`); }
      c.retiredLeg = false;
      c.tyreWear = 0; c.spares = 2;
    }
    for (const c of this.crews) c.total = c.stageTimes.reduce((s, x) => s + (x || 0), 0) + c.penalty;
    return notes;
  }

  overall() {
    return this.crews.slice().sort((a, b) => {
      if ((a.status === 'out') !== (b.status === 'out')) return a.status === 'out' ? 1 : -1;
      return a.total - b.total;
    });
  }

  finished() { return this.stageIdx >= this.stages.length; }

  results() {
    const cls = this.overall();
    const leader = cls[0];
    return {
      classification: cls.map((c, i) => ({
        key: c.key, teamId: c.teamId, driverIds: c.driverIds, pos: i + 1,
        status: c.status === 'out' ? 'dnf' : 'fin', reason: c.status === 'out' ? 'Ritirato' : null,
        pts: c.status === 'out' ? c.psPoints : (POINTS_STD[i] || 0) + c.psPoints, ps: c.psPoints,
        gap: c.status === 'out' ? null : c.total - leader.total, time: c.total,
        stageWins: this.stages.filter((s) => s.winner === c.key).length,
      })),
      stages: this.stages.map((s) => ({ name: s.name, surface: s.surface, km: s.km, winner: s.winner, best: s.best, wet: s.wet, power: s.power })),
      pole: null,
    };
  }
}

export const SERVICE_TIME = 45, SERVICE_BASE = 6, SERVICE_SETUP = 12, SERVICE_CHECK = 8;
export function repairMinutes(dmg, mech, crew) {
  return dmg <= 0.02 ? 0 : Math.round(dmg * 40 * (1.3 - mech / 200) * (1.15 - crew * 0.05));
}
export function quickMinutes(dmg, mech, crew) { const f = repairMinutes(dmg, mech, crew); return dmg <= 0.02 ? 0 : Math.min(f, Math.max(1, Math.round(f * 0.35))); }
export { DMG_NAMES };
