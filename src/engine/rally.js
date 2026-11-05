// Rally event simulation: stages, splits, incidents, service park
import { CATEGORIES, RALLY_TYRES, SURFACES, POINTS_STD } from '../data/categories.js';
import { buildEntries, aiSetupQuality } from './race.js';
import { carPerf } from './season.js';
import { rand, randInt, chance, clamp, gauss, pick } from './rng.js';

export const PACE_MODES = {
  safe: { name: 'Prudente', speed: -0.013, risk: 0.45 },
  normal: { name: 'Equilibrato', speed: 0, risk: 1 },
  push: { name: 'Attacco', speed: 0.013, risk: 2.1 },
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

export const DECISIONS = [
  { id: 'cut', text: 'Dosso cieco e sinistra stretta. Il copilota: «Taglio con pietre, attento!»', a: { label: 'Taglia la corda', desc: '−2.5s, rischio foratura', gain: -2.5, risk: 0.24, fail: 'puncture' }, b: { label: 'Linea pulita', desc: 'Nessun rischio', gain: 0, risk: 0 } },
  { id: 'jump', text: 'Salto lungo in arrivo dopo la cresta!', a: { label: 'Gas a fondo', desc: '−2s, rischio danni sospensioni', gain: -2, risk: 0.22, fail: 'suspension' }, b: { label: 'Alza il piede', desc: '+1s, sicuro', gain: 1, risk: 0 } },
  { id: 'turbo', text: 'La temperatura del turbo sta salendo pericolosamente!', a: { label: 'Continua a spingere', desc: 'Nessuna perdita, rischio guasto', gain: 0, risk: 0.18, fail: 'engine' }, b: { label: 'Mappa protezione', desc: '+4s, motore salvo', gain: 4, risk: 0 } },
  { id: 'grip', text: 'Tratto a bassa aderenza: fango e acqua sulla traiettoria.', a: { label: 'Attacca', desc: '−3s, rischio uscita', gain: -3, risk: 0.2, fail: 'off' }, b: { label: 'Prudenza', desc: '+2s', gain: 2, risk: 0.02, fail: 'off' } },
  { id: 'slow', text: 'Foratura lenta! La pressione posteriore sinistra scende.', a: { label: 'Continua così', desc: '+15s, rischio di perdere la ruota', gain: 15, risk: 0.38, fail: 'wheel' }, b: { label: 'Cambia la ruota', desc: '+70s, sicuro', gain: 70, risk: 0 } },
  { id: 'dust', text: 'Polvere sospesa dall’auto partita prima di voi: visibilità ridotta.', a: { label: 'Rischia nel polverone', desc: '−2s, rischio uscita', gain: -2, risk: 0.16, fail: 'off' }, b: { label: 'Rallenta', desc: '+3s', gain: 3, risk: 0 } },
  { id: 'hairpin', text: 'Tornante stretto in discesa: freno a mano o traiettoria larga?', a: { label: 'Freno a mano', desc: '−1.5s, rischio stallo', gain: -1.5, risk: 0.15, fail: 'stall' }, b: { label: 'Traiettoria larga', desc: '+0.5s', gain: 0.5, risk: 0 } },
  { id: 'brakes', text: 'I freni stanno surriscaldando nella lunga discesa.', a: { label: 'Ignora', desc: 'Rischio lungo in curva', gain: 0, risk: 0.2, fail: 'off' }, b: { label: 'Raffredda', desc: '+3s', gain: 3, risk: 0 } },
];

export class RallyEvent {
  constructor(state, ev, track, setups) {
    this.state = state; this.ev = ev; this.track = track;
    this.C = CATEGORIES.rally;
    this.stages = ev.stages.map((s, i) => ({ ...s, idx: i, wet: s.surface !== 'snow' && chance(track.rain) }));
    this.stageIdx = 0;
    this.fast = track.fast || 1;
    this.crews = buildEntries(state).map((e) => {
      const team = state.teams[e.teamId];
      return {
        ...e, team, total: 0, stageTimes: [], status: 'running', retiredLeg: false, superRally: 0,
        damage: { engine: 0, suspension: 0, gearbox: 0, body: 0 }, setupQ: setups[e.key] ?? aiSetupQuality(state, team),
        incidents: [], penalty: 0, psPoints: 0,
      };
    });
    this.log = [];
  }
  driver(c) { return this.state.drivers[c.driverIds[0]]; }
  get stage() { return this.stages[this.stageIdx]; }
  isServiceAfter(i) { return i % 2 === 1 && i < this.stages.length - 1; }

  perfOn(c, stage) {
    const w = SURFACES[stage.surface].weights;
    return carPerf(this.state, c.team, { w });
  }

  // Build a run plan for this stage
  planStage(choices = {}) {
    const st = this.stage;
    const surf = SURFACES[st.surface];
    const res = [];
    for (const c of this.crews) {
      if (c.status === 'out') continue;
      const d = this.driver(c);
      const ch = choices[c.key] || this.aiChoice(c, st);
      c.choice = ch;
      if (c.retiredLeg) { c.plan = null; continue; }
      const pm = PACE_MODES[ch.pace];
      const pace = d.attrs.pace * (st.wet ? 0.7 : 1) + d.attrs.wet * (st.wet ? 0.3 : 0);
      let f = 1 + (this.perfOn(c, st) - 80) * 0.0034 + (pace - 80) * 0.0031 + c.setupQ * 0.012 + tyreFit(ch.tyre, st, st.wet) + pm.speed;
      f -= c.damage.engine * 0.025 + c.damage.suspension * 0.03 + c.damage.gearbox * 0.022 + c.damage.body * 0.006;
      if (st.wet) f -= 0.05;
      f += gauss(0, 0.0045 * (1.5 - d.attrs.cons / 100));
      const speed = surf.speed * this.fast * f;
      const base = st.km / speed * 3600;
      const pieces = [];
      const stops = [];
      // random incidents
      const surfRisk = { rough: 1.45, snow: 1.15, gravel: 1, tarmac: 0.9 }[st.surface] * (st.wet ? 1.35 : 1);
      const offP = 0.032 * pm.risk * (1.38 - d.attrs.cons / 100) * surfRisk * (1 + c.damage.suspension * 0.6);
      if (chance(offP)) {
        const r = Math.random();
        if (r < 0.63) stops.push({ p: rand(0.1, 0.95), dur: rand(4, 16), text: `${d.name} va lungo e perde qualche secondo`, kind: 'minor' });
        else if (r < 0.9) stops.push({ p: rand(0.1, 0.95), dur: rand(25, 85), text: `${d.name} esce di strada! Gli spettatori aiutano a rimetterla in carreggiata`, kind: 'major', dmg: { body: rand(0.2, 0.5), suspension: rand(0, 0.4) } });
        else stops.push({ p: rand(0.1, 0.95), dur: 9999, text: `💥 ${d.name} si cappotta! Equipaggio OK, ma la gara finisce qui per oggi`, kind: 'crash' });
      }
      const puncP = 0.018 * ({ rough: 2.2, gravel: 1.2, snow: 0.6, tarmac: 0.7 }[st.surface]) * (ch.tyre.endsWith('soft') ? 1.5 : 1) * (st.km > 18 ? 1.3 : 1);
      if (chance(puncP)) stops.push({ p: rand(0.15, 0.95), dur: rand(40, 95), text: `${d.name} fora! Cambio ruota in prova`, kind: 'puncture' });
      const rel = c.team.car.parts.reliability;
      if (chance(0.016 * ((100 - rel) / 20) ** 2 * (pm.risk > 1 ? 1.3 : 1))) {
        const comp = pick(['engine', 'gearbox', 'suspension']);
        const terminal = chance(0.18);
        stops.push({ p: rand(0.1, 0.95), dur: terminal ? 9999 : rand(8, 30), text: terminal ? `🔧 Guasto fatale per ${d.name}: ${comp === 'engine' ? 'motore' : comp === 'gearbox' ? 'cambio' : 'sospensione'} KO` : `🔧 ${d.name} ha un problema meccanico, rallenta`, kind: terminal ? 'terminal' : 'mech', dmg: terminal ? null : { [comp]: rand(0.3, 0.6) } });
      }
      // decision for player crews
      let decision = null;
      if (c.isPlayer && chance(0.8)) {
        const opts = DECISIONS.filter((x) => (x.id !== 'dust' || st.surface !== 'tarmac') && (x.id !== 'jump' || st.surface !== 'snow'));
        decision = { p: rand(0.25, 0.75), t: pick(opts), done: false };
      }
      stops.sort((a, b) => a.p - b.p);
      c.plan = { base, stops, decision, elapsedFinal: null };
      res.push(c);
    }
    this.buildPieces();
    return res;
  }

  aiChoice(c, st) {
    const tyre = chance(0.85) ? bestTyreFor(st, st.wet) : pick(Object.keys(RALLY_TYRES).filter((t) => RALLY_TYRES[t].surf === (st.surface === 'rough' ? 'gravel' : st.surface) || (st.wet && t === 'wet'))) || bestTyreFor(st, st.wet);
    const d = this.driver(c);
    const sorted = this.overall();
    const myPos = sorted.indexOf(c);
    let pace = 'normal';
    if (myPos > 2 && myPos < 7 && chance(0.35)) pace = 'push';
    if (myPos === 0 && chance(0.35)) pace = 'safe';
    if (d.attrs.cons < 78 && chance(0.2)) pace = 'push';
    return { tyre, pace };
  }

  buildPieces() {
    for (const c of this.crews) {
      if (!c.plan) { c.stageResult = null; c.progress = 0; c.splitTimes = {}; continue; }
      const pieces = [];
      let p = 0;
      const marks = c.plan.stops.map((s) => ({ ...s, type: 'stop' }));
      if (c.plan.decision && !c.plan.decision.done) marks.push({ p: c.plan.decision.p, type: 'decision' });
      marks.sort((a, b) => a.p - b.p);
      for (const m of marks) {
        pieces.push({ type: 'move', p0: p, p1: m.p, dur: c.plan.base * (m.p - p) });
        p = m.p;
        if (m.type === 'stop') pieces.push({ type: 'stop', p, dur: m.dur, stop: m });
        else pieces.push({ type: 'decision', p, dur: 0 });
        if (m.type === 'stop' && m.dur >= 9999) break;
      }
      if (!pieces.length || pieces[pieces.length - 1].stop?.dur < 9999 || !pieces.some((x) => x.stop?.dur >= 9999)) {
        if (p < 1) pieces.push({ type: 'move', p0: p, p1: 1, dur: c.plan.base * (1 - p) });
      }
      c.pieces = pieces;
      c.pieceIdx = 0; c.pieceT = 0; c.progress = 0; c.stageT = 0; c.done = false; c.splits = []; c.splitTimes = {}; c.stageResult = null;
    }
  }

  // advance animation by dt seconds (stage time). returns decision request if any
  advance(dt) {
    let req = null;
    for (const c of this.crews) {
      if (!c.plan || c.done) continue;
      let left = dt;
      while (left > 0 && !c.done) {
        const pc = c.pieces[c.pieceIdx];
        if (!pc) { this.finishCrew(c); break; }
        if (pc.type === 'decision') {
          if (c.plan.decision && !c.plan.decision.done) { req = req || c; break; }
          c.pieceIdx++; continue;
        }
        const remain = pc.dur - c.pieceT;
        const use = Math.min(left, remain);
        c.pieceT += use; c.stageT += use; left -= use;
        if (pc.type === 'move') c.progress = pc.p0 + (pc.p1 - pc.p0) * (pc.dur ? c.pieceT / pc.dur : 1);
        if (pc.type === 'stop' && !pc.logged) {
          pc.logged = true;
          this.pushLog(pc.stop.text, pc.stop.kind, c);
          if (pc.stop.dmg) for (const [k, v] of Object.entries(pc.stop.dmg)) c.damage[k] = clamp(c.damage[k] + v, 0, 1);
          if (pc.stop.dur >= 9999) {
            c.done = true;
            if (pc.stop.kind === 'terminal' || (pc.stop.kind === 'crash' && chance(0.35))) { c.status = 'out'; this.pushLog(`${this.driver(c).name} è definitivamente ritirato dal rally.`, 'out', c); }
            else { c.retiredLeg = true; this.pushLog(`${this.driver(c).name} potrà ripartire con il Super Rally dopo l’assistenza.`, 'info', c); }
            c.stageResult = null;
            break;
          }
        }
        for (const sp of [0.33, 0.66]) if (c.progress >= sp && !c.splits.includes(sp)) { c.splits.push(sp); (c.splitTimes ||= {})[sp] = c.stageT; }
        if (c.pieceT >= pc.dur - 1e-9) { c.pieceIdx++; c.pieceT = 0; if (c.pieceIdx >= c.pieces.length) this.finishCrew(c); }
      }
    }
    return req;
  }

  resolveDecision(c, choice) {
    const dec = c.plan.decision; dec.done = true;
    const opt = dec.t[choice];
    const d = this.driver(c);
    const risk = opt.risk * (1.4 - d.attrs.cons / 100) * (dec.t.id === 'slow' ? 1 : 1);
    let text = '';
    const pi = c.pieceIdx;
    let extra = opt.gain;
    let dmg = null;
    if (opt.risk && chance(risk)) {
      if (opt.fail === 'puncture') { extra += rand(45, 80); text = `Foratura! ${d.name} perde tempo cambiando la ruota.`; }
      if (opt.fail === 'suspension') { extra += rand(5, 15); dmg = { suspension: rand(0.3, 0.6) }; text = `Atterraggio violento: sospensione danneggiata!`; }
      if (opt.fail === 'engine') { extra += rand(10, 30); dmg = { engine: rand(0.35, 0.7) }; text = `Il turbo cede parzialmente: potenza ridotta!`; }
      if (opt.fail === 'off') { extra += rand(10, 45); dmg = { body: rand(0.2, 0.5) }; text = `${d.name} finisce in un fosso! Tempo perso.`; }
      if (opt.fail === 'wheel') { extra += rand(60, 110); dmg = { suspension: rand(0.3, 0.5) }; text = `La gomma si stacca dal cerchio! Danni e minuti persi.`; }
      if (opt.fail === 'stall') { extra += rand(4, 9); text = `Motore spento nel tornante, ripartenza lenta.`; }
    } else text = opt.gain < 0 ? `Mossa riuscita! ${d.name} guadagna ${Math.abs(opt.gain)}s.` : `Scelta prudente di ${d.name}.`;
    if (dmg) for (const [k, v] of Object.entries(dmg)) c.damage[k] = clamp(c.damage[k] + v, 0, 1);
    // insert a time adjustment: positive -> stop; negative -> speed up next move piece
    const next = c.pieces[pi + 1];
    if (extra > 0) c.pieces.splice(pi + 1, 0, { type: 'stop', p: c.progress, dur: extra, stop: { text: '', kind: 'adj' }, logged: true });
    else if (next && next.type === 'move') next.dur = Math.max(1, next.dur + extra);
    c.pieceIdx++;
    this.pushLog(text, extra > 5 ? 'warn' : 'good', c);
    return { text, good: extra <= 0 };
  }

  finishCrew(c) {
    c.done = true;
    c.stageResult = c.stageT;
  }

  allDone() { return this.crews.every((c) => !c.plan || c.done); }

  pushLog(text, kind, c) { if (text) this.log.unshift({ text, kind, key: c?.key, stage: this.stageIdx, player: c?.isPlayer }); if (this.log.length > 120) this.log.pop(); }

  // finalize stage times
  completeStage() {
    const st = this.stage;
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
    st.results = ranking.map((c) => ({ key: c.key, time: c.stageResult }));
    if (st.power) {
      const ps = [5, 4, 3, 2, 1];
      ranking.slice(0, 5).forEach((c, i) => (c.psPoints = ps[i]));
    }
    // wear damage on rough
    for (const c of this.crews) {
      if (st.surface === 'rough' && c.plan && chance(0.2)) c.damage.suspension = clamp(c.damage.suspension + rand(0.05, 0.15), 0, 1);
      c.plan = null; c.choice = null;
    }
    this.stageIdx++;
    return ranking;
  }

  service(repairs = {}) {
    // repairs: key -> array of components to fix (player); AI fix everything
    const notes = [];
    for (const c of this.crews) {
      if (c.status === 'out') continue;
      const mech = this.state.staff[c.team.staff.mechanic]?.rating || 65;
      const comps = c.isPlayer ? (repairs[c.key] || []) : Object.keys(c.damage).filter((k) => c.damage[k] > 0.05);
      let minutes = 0;
      for (const k of comps) { minutes += repairMinutes(c.damage[k], mech, c.team.facilities.pitcrew); c.damage[k] = 0; }
      const over = Math.max(0, minutes - 45);
      if (over > 0) { const pen = Math.ceil(over) * 10; c.penalty += pen; notes.push(`${this.driver(c).name}: ritardo in assistenza, penalità ${pen}s`); }
      c.retiredLeg = false;
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

export function repairMinutes(dmg, mech, crew) {
  return dmg <= 0.02 ? 0 : Math.round(dmg * 40 * (1.3 - mech / 200) * (1.15 - crew * 0.05));
}
