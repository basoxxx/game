// Race highlights: key moments recorded during circuit races and rally stages (start, passes, crashes,
// spins, pit drama, fastest lap, finish), the maths that turns a recorded incident into a car that
// spins, slides off line and stops (used by the live replay and by the highlights reel), and a small
// bounded store of the last races' reels. Node-safe: the headless race tests run the recorder too.

export const HL_DT = 0.5; // seconds of race time between two position samples
const RING = 26; // seconds of history kept for clips that open "in the past" (pre-roll) and the live replay
const MAX_CLIPS = 40; // finished clips kept during a race (lowest scores dropped first)
const MAX_LEN = 30; // a merged clip never grows past this (seconds)

// broadcast tag, colour and icon of every highlight type (Italian UI)
export const HL_TYPES = {
  start: { tag: 'Partenza', col: '#22d37a', ic: 'flag' },
  crash: { tag: 'Incidente', col: '#ff3b3b', ic: 'burst' },
  multi: { tag: 'Carambola', col: '#ff3b3b', ic: 'burst' },
  spin: { tag: 'Testacoda', col: '#ff9f1a', ic: 'replay' },
  contact: { tag: 'Contatto', col: '#ff6b2b', ic: 'burst' },
  off: { tag: 'Fuori pista', col: '#ff9f1a', ic: 'alert' },
  damage: { tag: 'Ala danneggiata', col: '#ff9f1a', ic: 'wrench' },
  pass: { tag: 'Sorpasso', col: '#3aa0ff', ic: 'right' },
  lead: { tag: 'Nuovo leader', col: '#ffcc33', ic: 'trophy' },
  pit: { tag: 'Pit stop', col: '#b06bff', ic: 'wrench' },
  fastest: { tag: 'Giro più veloce', col: '#b06bff', ic: 'hourglass' },
  sc: { tag: 'Safety car', col: '#ffd23a', ic: 'alert' },
  red: { tag: 'Bandiera rossa', col: '#ff2d2d', ic: 'flag' },
  restart: { tag: 'Ripartenza', col: '#22d37a', ic: 'flag' },
  finish: { tag: 'Arrivo', col: '#ffffff', ic: 'chequered' },
  puncture: { tag: 'Foratura', col: '#ff9f1a', ic: 'alert' },
  issue: { tag: 'Guasto', col: '#ff9f1a', ic: 'wrench' },
  stage: { tag: 'Miglior tempo', col: '#ffcc33', ic: 'hourglass' },
};

// ---------------- incident pose: recorded positions -> spinning / stopping car ----------------
// inc: { kind, t0, u0, v, side } — u is the race engine's position unit (laps of time for circuits,
// stage progress for rallies), v the car's speed in u per second just before the incident.
// uAt(t) returns the recorded position at time t (null when unknown: the live view cannot see the future).
// Returns null when the incident does not affect the car at time t, else { u, lat, yaw, roll, lift }.
const K = {
  spin: { pre: 0.35, slide: 1.9, lat: 2.6, yaw: Math.PI * 2, rejoin: true },
  crash: { pre: 0.35, slide: 1.7, lat: 7.5, yaw: Math.PI * 1.15, rejoin: false },
  roll: { pre: 0.3, slide: 2.2, lat: 5.5, yaw: Math.PI * 0.75, roll: Math.PI * 3, rejoin: false },
  off: { pre: 0.3, slide: 1.5, lat: 4.2, yaw: 1.0, rejoin: true },
  park: { pre: 3.2, slide: 0.8, lat: 2.4, yaw: 0.18, rejoin: true },
  wide: { creep: 0.55, lat: 1.8, wob: 0.32 },
  contact: { creep: 0.6, lat: 1.2, wob: 0.55 },
  limp: { creep: 0.42, lat: -0.55, wob: 0 },
};
const sm = (x) => { const k = Math.max(0, Math.min(1, x)); return k * k * (3 - 2 * k); };
const easeOut = (x) => { const k = Math.max(0, Math.min(1, x)); return 1 - (1 - k) ** 3; };
// cubic Hermite position between (p0, v0) and (p1, v1) over T seconds
const herm = (p0, v0, p1, v1, T, s) => { const k = Math.max(0, Math.min(1, s / T)); const k2 = k * k, k3 = k2 * k; return (2 * k3 - 3 * k2 + 1) * p0 + (k3 - 2 * k2 + k) * T * v0 + (-2 * k3 + 3 * k2) * p1 + (k3 - k2) * T * v1; };

export function incidentPose(inc, t, uAt, W = 6, memo = null) {
  const P = K[inc.kind]; if (!P) return null;
  const v = Math.max(1e-5, inc.v || 0.011), side = inc.side || 1;
  if (P.creep != null) {
    if (t < inc.t0) return null;
    // the car drops to a fraction of its pace until the (time-jumped) recorded car catches up
    const cr = inc.u0 + (t - inc.t0) * v * P.creep;
    const ur = uAt(t);
    const dur = Math.max(1.5, Math.min(5, (inc.loss || 2) / (1 - P.creep)));
    const k = (t - inc.t0) / dur;
    const caught = ur != null && ur >= cr;
    if ((caught && k >= 1) || (ur == null && t - inc.t0 > 30) || t - inc.t0 > 90) return null;
    // wobble out towards the kerb and back (limping cars just keep to the side)
    const lat = P.lat > 0 ? side * (W + P.lat) * Math.sin(Math.PI * Math.min(1, k)) : caught ? 0 : side * W * -P.lat;
    const yaw = P.wob ? side * P.wob * Math.sin(2 * Math.PI * Math.min(1, k)) * (1 - Math.min(1, k)) : 0;
    return { u: caught ? ur : cr, lat, yaw, roll: 0, lift: 0 };
  }
  const tA = inc.t0 - P.pre, tS = inc.t0 + P.slide;
  if (t < tA) return null;
  const uA = memo?.uA ?? uAt(tA) ?? inc.u0 - v * P.pre;
  if (memo) memo.uA = uA;
  const T = tS - tA, uStop = uA + v * T * 0.5;
  const latEnd = side * (W + P.lat), yawEnd = side * P.yaw, rollEnd = P.roll ? side * P.roll : 0;
  if (t <= tS) {
    const k = (t - tA) / T;
    return { u: herm(uA, v, uStop, 0, T, t - tA), lat: latEnd * sm(k), yaw: yawEnd * easeOut(k), roll: rollEnd * easeOut(k), lift: P.roll ? Math.abs(Math.sin(rollEnd * easeOut(k))) * 0.9 : 0 };
  }
  // stopped: wait until the recorded car has moved on past the stop point, then drive back on line
  let tJ = null;
  if (P.rejoin) {
    if (memo && memo.tJ !== undefined) tJ = memo.tJ;
    else {
      for (let x = tS + 0.5; x < tS + 400; x += 0.25) { const ur = uAt(x); if (ur == null) break; if (ur >= uStop + 1.5 * v) { tJ = x; break; } if (x > t + 6 && !memo) break; }
      if (memo && tJ != null) memo.tJ = tJ;
    }
  }
  const finalRoll = P.roll ? side * Math.PI : 0;
  const hold = { u: uStop, lat: latEnd, yaw: yawEnd, roll: P.roll ? finalRoll : 0, lift: P.roll ? 0.95 : 0 };
  if (tJ == null) return hold;
  const tR = Math.max(tS + 0.3, tJ - 3);
  if (t < tR) return hold;
  if (t > tJ) return null;
  const k = (t - tR) / (tJ - tR);
  const yawRound = Math.round(yawEnd / (2 * Math.PI)) * 2 * Math.PI;
  return { u: herm(uStop, 0, uAt(tJ), v, tJ - tR, t - tR), lat: latEnd * (1 - sm(k)), yaw: yawEnd + (yawRound - yawEnd) * sm(k), roll: 0, lift: 0 };
}
// how long after t0 an incident keeps a retired car on screen in the live view
export const PARKED_LIVE = 45;

// ---------------- circuit recorder ----------------
export class CircuitRecorder {
  constructor(sim) {
    this.sim = sim; this.ring = []; this.open = []; this.done = []; this.nextT = 0; this.seq = 0;
    this.keys = [...sim.cars.map((c) => c.key), ...(sim.traffic || []).map((g) => g.key)];
  }
  carU(c) {
    const sim = this.sim;
    if (c.status !== 'finished') return c.dist;
    // cool-down lap: the car eases off after the flag
    const dt = Math.max(0, sim.time - (c.crossT ?? sim.time)); const v = 1 / (c.lapTarget || sim.track.lap);
    return c.finishLap + v * (dt * 0.35 + 1.3 * (1 - Math.exp(-dt / 2)));
  }
  sample(force = false) {
    const sim = this.sim;
    if (!force && sim.time < this.nextT) return;
    this.nextT = (Math.floor(sim.time / HL_DT) + 1) * HL_DT;
    const n = this.keys.length, u = new Float32Array(n), f = new Uint8Array(n);
    sim.cars.forEach((c, i) => { u[i] = this.carU(c); f[i] = (c.inPit > 0 ? 1 : 0) | (c.pitReq ? 2 : 0) | (c.status === 'dnf' ? 4 : 0) | (c.status === 'finished' ? 8 : 0); });
    (sim.traffic || []).forEach((g, j) => { u[sim.cars.length + j] = g.dist; });
    const fr = { t: sim.time, u, f, rain: sim.rain || 0 };
    this.ring.push(fr);
    while (this.ring.length && sim.time - this.ring[0].t > RING) this.ring.shift();
    for (const cl of this.open) cl.frames.push(fr);
    for (const cl of this.open.slice()) if (sim.time >= cl.t1) this.close(cl);
  }
  lap() { const s = this.sim; return Math.max(1, Math.min(s.laps, Math.floor(s.progress * s.laps) + 1)); }
  // a key moment: opens a clip [t - pre, t + post] (merged into an open clip about the same cars)
  mark({ type, keys = [], title = '', text = '', score = 3, pre = 7, post = 7, t = this.sim.time, quiet = false }) {
    keys = keys.filter(Boolean);
    const neutral = !keys.length;
    for (const cl of this.open) {
      if (t > cl.t1 - 0.5 || t - cl.tc > 12) continue;
      const share = keys.some((k) => cl.keys.includes(k));
      if (!share && !(neutral && cl.incident) && !(cl.type === 'start' && t - cl.t0 < 20)) continue;
      cl.events.push({ type, t, keys, title, text });
      if (score > cl.score && !(cl.type === 'start' || cl.type === 'finish')) { cl.type = type; cl.title = title || cl.title; cl.text = text || cl.text; cl.tc = t; cl.focus = keys[0] || cl.focus; }
      cl.score = Math.max(cl.score, score) + Math.min(score, cl.score) * 0.25;
      cl.t1 = Math.min(cl.t0 + MAX_LEN, Math.max(cl.t1, t + post));
      for (const k of keys) if (!cl.keys.includes(k)) cl.keys.push(k);
      if (/crash|multi|spin|contact|off|red/.test(type)) cl.incident = true;
      return cl;
    }
    if (quiet) return null;
    const frames = this.ring.filter((fr) => fr.t >= t - pre);
    const cl = { id: ++this.seq, type, title, text, score, tc: t, t0: frames[0]?.t ?? t, t1: t + post, lap: this.lap(), keys: keys.slice(), focus: keys[0] || null, events: [{ type, t, keys, title, text }], frames, incident: /crash|multi|spin|contact|off|red/.test(type) };
    this.open.push(cl);
    return cl;
  }
  close(cl) {
    this.open = this.open.filter((x) => x !== cl);
    if (cl.frames.length < 4) return;
    this.done.push(cl);
    while (this.done.length > MAX_CLIPS) { let k = -1; this.done.forEach((x, i) => { if (x.type !== 'start' && x.type !== 'finish' && (k < 0 || x.score < this.done[k].score)) k = i; }); if (k < 0) break; this.done.splice(k, 1); }
  }
  // the last `sec` seconds as a clip (live replay)
  recent(sec = 10) {
    const fr = this.ring.filter((x) => x.t >= this.sim.time - sec);
    if (fr.length < 3) return null;
    return this.pack({ id: 0, type: 'live', t0: fr[0].t, t1: fr[fr.length - 1].t, tc: fr[fr.length - 1].t - 3, keys: [], frames: fr, events: [] });
  }
  pack(cl) {
    const sim = this.sim;
    const T = cl.frames.map((x) => x.t);
    const lo = cl.frames[0]?.t ?? cl.t0, hi = cl.frames[cl.frames.length - 1]?.t ?? cl.t1;
    const inc = (sim.incidents || []).filter((i) => i.t0 <= hi + 0.5 && (i.t0 >= lo - 2 || ((i.kind === 'crash' || i.kind === 'park') && i.t0 >= lo - 90)));
    return {
      id: cl.id, type: cl.type, title: cl.title, text: cl.text, score: +(cl.score || 0).toFixed(2), tc: cl.tc, t0: lo, t1: hi, lap: cl.lap, focus: cl.focus, keys: cl.keys.slice(),
      events: cl.events.map((e) => ({ type: e.type, t: e.t, keys: e.keys, title: e.title })),
      rain: cl.frames.reduce((a, x) => a + (x.rain || 0), 0) / Math.max(1, cl.frames.length),
      T, U: this.keys.map((_, i) => cl.frames.map((x) => x.u[i])), F: this.keys.map((_, i) => cl.frames.map((x) => x.f[i])),
      inc: inc.map((i) => ({ key: i.key, kind: i.kind, t0: i.t0, u0: i.u0, v: i.v, side: i.side, loss: i.loss })),
    };
  }
  // end of the race: close everything still open, pick the reel
  finalize(meta = {}, max = 10) {
    for (const cl of this.open.slice()) { cl.t1 = this.sim.time; this.close(cl); }
    const clips = pickReel(this.done, max).map((cl) => this.pack(cl));
    return { ...this.meta(), clips, ...meta };
  }
  meta() {
    const sim = this.sim;
    return {
      v: 1, kind: 'circuit', cat: sim.cat, cid: sim.track.cid, lapRef: sim.track.lap, laps: sim.laps, street: sim.track.street || 0,
      night: !!sim.track.night && !sim.endurance, endurance: !!sim.endurance, trackName: sim.track.name || '',
      cars: this.keys.map((k) => carMeta(sim, k)),
    };
  }
  // recorded position of car i at time t from the live history (extrapolated a few seconds ahead)
  ringU(i, t) {
    const R = this.ring; if (!R.length) return null;
    const last = R[R.length - 1];
    if (t >= last.t) { if (t - last.t > 8) return null; const c = this.sim.cars[i]; const v = c && c.status === 'running' && c.inPit <= 0 ? 1 / (c.lapTarget || this.sim.track.lap) : 0; return last.u[i] + v * (t - last.t); }
    if (t <= R[0].t) return R[0].u[i];
    let lo = 0, hi = R.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (R[m].t <= t) lo = m; else hi = m; }
    const f = (t - R[lo].t) / ((R[hi].t - R[lo].t) || 1);
    return R[lo].u[i] + (R[hi].u[i] - R[lo].u[i]) * f;
  }
  // live view: the incident pose of car i right now (spinning, parked off line), or null
  livePose(i, W = 6) {
    const sim = this.sim, c = sim.cars[i]; if (!c || !sim.incidents?.length) return null;
    for (let k = sim.incidents.length - 1; k >= 0; k--) {
      const inc = sim.incidents[k]; if (inc.key !== c.key) continue;
      const age = sim.time - inc.t0;
      if (age > ((inc.kind === 'crash' || inc.kind === 'park') ? PARKED_LIVE : 40)) break;
      const p = incidentPose(inc, sim.time, (t) => this.ringU(i, t), W);
      if (p) return p;
    }
    return null;
  }
}
function carMeta(sim, key) {
  const c = sim.cars.find((x) => x.key === key);
  if (!c) { const g = (sim.traffic || []).find((x) => x.key === key); return { key, gt: 1, c1: g?.colors?.[0] || '#ccc', c2: g?.colors?.[1] || '#222', c3: '#111111', num: g?.num || 0, name: 'GT' }; }
  const d = sim.driver(c), L = c.team.car.livery || {};
  return { key, name: d?.name || key, team: c.team.short || c.team.name, c1: L.primary, c2: L.secondary, c3: L.accent, num: d?.number || 0, helmet: d?.helmet?.c1, sponsor: c.team.sponsors?.[0]?.name || c.team.short || '', me: c.isPlayer ? 1 : 0, tyre: c.tyre };
}
// best moments: the start and the finish always, then the highest scores, in race order
export function pickReel(clips, max = 10, maxDur = 190) {
  const fin = clips.find((c) => c.type === 'finish');
  const must = clips.filter((c) => c.type === 'start' || c === fin);
  // the reel ends with the chequered flag: what happens behind afterwards is not shown
  const rest = clips.filter((c) => !must.includes(c) && !(fin && c.tc > fin.tc + 1)).sort((a, b) => b.score - a.score);
  const out = must.slice(); let dur = must.reduce((a, c) => a + (c.t1 - c.t0), 0);
  const n = {};
  for (const c of rest) {
    if (out.length >= max) break;
    const len = c.t1 - c.t0;
    if (dur + len > maxDur) continue;
    // a second pass between the same two cars a few seconds later adds nothing; passes do not take over the reel
    if (c.type === 'pass' && out.some((o) => o.type === 'pass' && o.keys[0] === c.keys[0] && Math.abs(o.tc - c.tc) < 60)) continue;
    const g = c.type === 'pass' || c.type === 'lead' ? 'pass' : c.type;
    if ((n[g] = (n[g] || 0) + 1) > (g === 'pass' ? 4 : g === 'pit' || g === 'fastest' || g === 'sc' ? 1 : 6)) continue;
    out.push(c); dur += len;
  }
  return out.sort((a, b) => a.t0 - b.t0);
}
// recorded position of car i in a packed clip at time t (linear between samples, clamped at the ends)
export function clipU(clip, i, t) {
  const T = clip.T, U = clip.U[i]; if (!U || !U.length) return null;
  if (t <= T[0]) return U[0];
  const n = T.length - 1; if (t >= T[n]) return U[n];
  let lo = 0, hi = n; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T[m] <= t) lo = m; else hi = m; }
  const f = (t - T[lo]) / ((T[hi] - T[lo]) || 1);
  return U[lo] + (U[hi] - U[lo]) * f;
}
export function clipF(clip, i, t) {
  const T = clip.T, F = clip.F[i]; if (!F) return 0;
  let lo = 0, hi = T.length - 1; if (t >= T[hi]) return F[hi]; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T[m] <= t) lo = m; else hi = m; }
  return F[lo];
}

// ---------------- rally recorder: exact positions from the crews' piece keyframes ----------------
export class RallyRecorder {
  constructor(ev) { this.ev = ev; this.marks = []; this.clips = []; this.seq = 0; }
  // called by the event when a stage starts
  stageStart() { this.marks = []; }
  mark(m) { this.marks.push({ t: this.ev.clock || 0, score: 3, pre: 6, post: 6, ...m }); }
  // stage over: turn the marks into clips (keyframes of every crew inside the window)
  stageEnd(stg, geoInfo) {
    const ev = this.ev;
    // the actual stage winner's finish counts more, other "fastest so far" finishes less
    const win = stg.winner;
    const last = stg.idx === ev.stages.length - 1;
    for (const m of this.marks) if (m.type === 'stage') { if (m.keys[0] === win) { m.score = last ? 9 : 4.8; if (last) { m.type = 'finish'; m.title = `${ev.driver(ev.crews.find((c) => c.key === win)).name} vince la prova finale`; } } else m.score = ev.crews.find((c) => c.key === m.keys[0])?.isPlayer ? 3 : 2; }
    const used = [];
    for (const m of this.marks.sort((a, b) => b.score - a.score)) {
      if (used.some((u) => u.keys[0] === m.keys[0] && Math.abs(u.t - m.t) < 8)) continue;
      used.push(m);
    }
    for (const m of used) {
      const t0 = Math.max(0, m.t - m.pre), t1 = m.t + m.post;
      const kf = {};
      for (const c of ev.crews) {
        const k = c.kf || []; if (!k.length) continue;
        let a = 0; while (a + 1 < k.length && k[a + 1][0] <= t0) a++;
        let b = a; while (b < k.length - 1 && k[b][0] < t1) b++;
        const seg = k.slice(a, b + 1); if (!seg.length) continue;
        // skip crews still waiting at the start line or long finished for the whole window
        const p0 = seg[0][1], p1 = seg[seg.length - 1][1];
        if (p1 <= 0 && seg.every((x) => x[2])) continue;
        if (p0 >= 1 && k[a][0] < t0 - 8) continue;
        kf[c.key] = seg.map((x) => [+x[0].toFixed(2), +x[1].toFixed(5), x[2] ? 1 : 0]);
      }
      const inc = (ev.incidents || []).filter((i) => i.stage === stg.idx && i.t0 >= t0 - 60 && i.t0 <= t1).map((i) => ({ key: i.key, kind: i.kind, t0: i.t0, u0: i.u0, v: i.v, side: i.side }));
      this.clips.push({ id: ++this.seq, type: m.type, title: m.title, text: m.text, score: m.score, tc: m.t, t0, t1, keys: m.keys, focus: m.keys[0], stage: { idx: stg.idx, name: stg.name, km: stg.km, surface: stg.surface, wet: !!stg.wet, night: !!stg.night, ...geoInfo }, kf, inc, events: [] });
    }
    this.marks = [];
  }
  finalize(meta = {}, max = 10) {
    // rally reel: the best moments over all stages, at most 3 per stage, in stage order
    const byStage = {};
    const sorted = this.clips.slice().sort((a, b) => b.score - a.score);
    const out = [];
    let nStage = 0, nStart = 0;
    for (const c of sorted) { const n = byStage[c.stage.idx] || 0; if (n >= 3 || out.length >= max) continue; if (c.type === 'stage' && ++nStage > 4) continue; if (c.type === 'start' && ++nStart > 1) continue; byStage[c.stage.idx] = n + 1; out.push(c); }
    out.sort((a, b) => a.stage.idx - b.stage.idx || a.t0 - b.t0);
    const ev = this.ev;
    return { v: 1, kind: 'rally', cat: 'rally', cars: ev.crews.map((c) => { const d = ev.driver(c), L = c.team.car.livery || {}; return { key: c.key, name: d?.name || c.key, team: c.team.short || c.team.name, c1: L.primary, c2: L.secondary, c3: L.accent, num: d?.number || 0, helmet: d?.helmet?.c1, sponsor: c.team.sponsors?.[0]?.name || c.team.short || '', me: c.isPlayer ? 1 : 0 }; }), clips: out, ...meta };
  }
}
// rally: crew progress at time t from its keyframes ([t, p, waiting])
export function kfAt(kf, t) {
  if (!kf || !kf.length) return null;
  if (t <= kf[0][0]) return { p: kf[0][1], w: !!kf[0][2], moving: false };
  for (let i = 1; i < kf.length; i++) {
    if (t <= kf[i][0]) { const a = kf[i - 1], b = kf[i]; const f = (t - a[0]) / ((b[0] - a[0]) || 1); return { p: a[1] + (b[1] - a[1]) * f, w: !!a[2], moving: b[1] > a[1] + 1e-7, v: (b[1] - a[1]) / ((b[0] - a[0]) || 1) }; }
  }
  const l = kf[kf.length - 1]; return { p: l[1], w: !!l[2], moving: false, end: true, tEnd: l[0] };
}

// ---------------- compact storage ----------------
const Q = 1e4;
function encCol(a) { const out = []; let prev = 0; for (const x of a) { const q = Math.round(x * Q); out.push(q - prev); prev = q; } return out; }
function decCol(a) { const out = new Array(a.length); let v = 0; for (let i = 0; i < a.length; i++) { v += a[i]; out[i] = v / Q; } return out; }
function rle(a) { const out = []; for (let i = 0; i < a.length;) { let j = i; while (j < a.length && a[j] === a[i]) j++; out.push(a[i], j - i); i = j; } return out; }
function unrle(a) { const out = []; for (let i = 0; i < a.length; i += 2) for (let k = 0; k < a[i + 1]; k++) out.push(a[i]); return out; }
export function encodeReel(reel) {
  return { ...reel, enc: 1, clips: reel.clips.map((c) => c.T ? { ...c, T: encCol(c.T.map((t) => t / 100)), U: c.U.map((u) => (u.every((x) => x === u[0]) ? [Math.round(u[0] * Q)] : encCol(u))), F: c.F.map(rle), n: c.T.length } : c) };
}
export function decodeReel(r) {
  if (!r?.enc) return r;
  return { ...r, enc: 0, clips: r.clips.map((c) => c.n ? { ...c, T: decCol(c.T).map((t) => t * 100), U: c.U.map((u) => (u.length === 1 && c.n > 1 ? new Array(c.n).fill(u[0] / Q) : decCol(u))), F: c.F.map(unrle) } : c) };
}

const STORE = 'apex.hl.v1';
const PER_CAREER = 5, TOTAL = 8;
let memStore = []; // fallback when localStorage is full / unavailable (this session only)
function readStore() { try { const s = globalThis.localStorage?.getItem(STORE); const a = s ? JSON.parse(s) : null; return Array.isArray(a) ? a : memStore; } catch { return memStore; } }
function writeStore(a) {
  memStore = a;
  // drop the oldest reels until the store fits
  for (let n = a.length; n >= 1; n--) { try { globalThis.localStorage?.setItem(STORE, JSON.stringify(a.slice(-n))); return true; } catch { /* quota */ } }
  try { globalThis.localStorage?.removeItem(STORE); } catch {}
  return false;
}
export function hlId(st, round = st.round) { return `${st.created || 0}:${st.season}:${st.category}:${round}`; }
export function saveReel(st, reel, round) {
  if (!reel?.clips?.length) return null;
  const id = hlId(st, round);
  const entry = { id, career: st.created || 0, quick: !!st.quick, at: Date.now(), title: reel.title || '', sub: reel.sub || '', reel: encodeReel(reel) };
  let a = readStore().filter((x) => x.id !== id);
  a.push(entry);
  // bounded: the last few races per career, and a global cap
  const mine = a.filter((x) => x.career === entry.career);
  if (mine.length > PER_CAREER) { const drop = new Set(mine.slice(0, mine.length - PER_CAREER).map((x) => x.id)); a = a.filter((x) => !drop.has(x.id)); }
  if (a.length > TOTAL) a = a.slice(a.length - TOTAL);
  writeStore(a);
  return id;
}
export function loadReel(st, round) { const e = readStore().find((x) => x.id === hlId(st, round)); return e ? decodeReel(e.reel) : null; }
export function hasReel(st, round) { return readStore().some((x) => x.id === hlId(st, round)); }
export function listReels(st) { return readStore().filter((x) => x.career === (st.created || 0)).map((x) => ({ id: x.id, at: x.at, title: x.title, sub: x.sub, round: +x.id.split(':')[3] })); }
