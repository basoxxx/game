// AI drivers for "Scontro Totale".
// Race: follows a pre-computed racing line with a braking-aware speed profile, overtakes on the
// side with more room, races side by side, rubber-bands subtly and recovers from crashes.
// Personalities: 'prudente' (clean, brakes for traffic), 'equilibrato', 'aggressivo' (T-bones at
// crossings, pit-manoeuvres rivals into the scenery, leans on cars alongside).
// Derby: picks targets intelligently (spreads out, prefers weakened cars), circles to build speed,
// charges at flanks with nitro, backs off after impacts and keeps away from the walls.
import * as THREE from 'three';
import { canTarget, arenaGoal } from './modes.js';

const _q = new THREE.Quaternion();
const wrap = (d) => { while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

export const PERSONALITIES = {
  prudente: { aggr: 0.05, pace: 0.962, brakeTraffic: 1, ram: 0, lean: 0 },
  equilibrato: { aggr: 0.35, pace: 0.958, brakeTraffic: 0.5, ram: 0.3, lean: 0.55 },
  aggressivo: { aggr: 0.85, pace: 0.956, brakeTraffic: 0, ram: 1, lean: 1 },
  // the rival: quick, hard but not reckless, and it has it in for one driver (see grudge below)
  rivale: { aggr: 0.6, pace: 0.964, brakeTraffic: 0.2, ram: 0.6, lean: 0.85 },
  // the coward: quick when alone, lifts for any car alongside, never rams; in the arena it runs and picks off wrecks
  codardo: { aggr: 0, pace: 0.96, brakeTraffic: 1.3, ram: 0, lean: 0, coward: true },
};

export function initAI(car, idx) {
  const kinds = ['aggressivo', 'prudente', 'equilibrato', 'aggressivo', 'codardo', 'prudente', 'aggressivo', 'equilibrato', 'codardo', 'equilibrato', 'aggressivo'];
  const pers = kinds[idx % kinds.length];
  car.ai = { pers, P: PERSONALITIES[pers], lane: 0, laneT: 0, passT: 0, ramT: 0, ramCool: 2 + Math.random() * 4, ram: null, revT: 0, stuckT: 0, stuckN: 0, stuckClock: 0, offT: 0, wrongT: 0, mode: 'circle', modeT: 1 + Math.random(), target: null, retarget: 0, laneNoise: (Math.random() - 0.5) * 2 };
}

function kin(car) {
  const b = car.body, p = b.translation(), r = b.rotation(); _q.set(r.x, r.y, r.z, r.w);
  const fwd = new THREE.Vector3(1, 0, 0).applyQuaternion(_q); fwd.y = 0; fwd.normalize();
  const side = new THREE.Vector3(-fwd.z, 0, fwd.x); // local +z (right)
  const lv = b.linvel();
  return { p, fwd, side, v: lv, speed: Math.hypot(lv.x, lv.z), vF: lv.x * fwd.x + lv.z * fwd.z };
}
function steerTo(k, tx, tz, gain = 2.3) {
  const want = Math.atan2(tz - k.p.z, tx - k.p.x), cur = Math.atan2(k.fwd.z, k.fwd.x);
  const d = wrap(want - cur);
  return { d, st: Math.max(-1, Math.min(1, -d * gain)) };
}

// returns {thr, brk, st, hb, nitro}; may request a respawn through game.requestRespawn(car)
export function aiInput(game, car, dt) {
  if (!car.ai) initAI(car, car.isPlayer ? 0 : car.num);
  const A = car.ai, k = kin(car);
  A.stuckClock += dt; if (A.stuckClock > 15) { A.stuckClock = 0; A.stuckN = 0; }
  // grudges: whoever hit this driver hard is remembered for a while and gets paid back (DerbyGame.applyDamage sets it)
  if (A.grudgeT > 0) { A.grudgeT -= dt; if (A.grudgeT <= 0 || A.grudge?.out) A.grudge = null; }
  // reversing out of trouble
  if (A.revT > 0) { A.revT -= dt; return { thr: 0, brk: 1, st: A.revSt, hb: 0, nitro: 0 }; }
  const out = game.track.arena ? derbyAI(game, car, A, k, dt) : game.track.stunt ? stuntAI(game, car, A, k, dt) : raceAI(game, car, A, k, dt);
  // stuck detection: wants to go but does not move
  if (game.state === 'race' && !game.track.stunt && out.thr > 0.3 && k.speed < 1.4 && car.dyn?.grounded >= 2) {
    A.stuckT += dt;
    if (A.stuckT > 1.1) {
      A.stuckT = 0; A.stuckN++; game.stat?.('stuck', car); if ((game.simStats.stuckAt ||= []).length < 30) game.simStats.stuckAt.push([car.idx, Math.round(car.offTrack || 0), Math.round((car.dyn?.up?.y ?? 1) * 10) / 10, game.cars.some((o) => o !== car && (() => { const a = o.body.translation(), b = car.body.translation(); return (a.x - b.x) ** 2 + (a.z - b.z) ** 2 < 36; })()) ? 'car' : '-']);
      if (!game.track.arena && (A.stuckN >= 3 || (A.stuckN >= 2 && (car.offTrack || 0) > game.track.width / 2 - 1))) { A.stuckN = 0; game.requestRespawn(car, 'stuck'); }
      else { A.revT = 0.9 + Math.random() * 0.6; A.revSt = out.st > 0 ? -1 : 1; }
    }
  } else A.stuckT = Math.max(0, A.stuckT - dt * 2);
  return out;
}

function raceAI(game, car, A, k, dt) {
  const tr = game.track, line = game.line, N = tr.N, i = car.idx, hw = tr.width / 2;
  let P = car.isPlayer && game.lepre ? { ...A.P, ram: 0, lean: 0, brakeTraffic: 0 } : A.P; // autopilot hunter: only the Lepre matters
  // the first seconds: nobody rams or leans, everybody leaves room (no pile-up at the first corner)
  const calm = game.time < 9 && game.state === 'race';
  if (calm) P = { ...P, ram: 0, lean: 0, brakeTraffic: Math.max(0.7, P.brakeTraffic) };
  // ---- pace: personality, skill, class, subtle rubber band against the player
  let pace = P.pace * (0.94 + car.skill * 0.07) * (car.paceMul || 1) * (car.stunT > 0 ? 0.72 : 1); // a rammed Lepre is dazed for a moment
  const pl = game.player;
  if (pl && pl !== car && !pl.finished && !pl.out) {
    const gap = ((car.prog || 0) - (pl.prog || 0)) * tr.ds; // metres ahead of the player
    // rubber band: subtle, scaled by difficulty (Facile helps more, Spietato almost none) and switchable in the options
    const rk = (game.dopts?.rubber === false ? 0 : 1) * (game.diff?.rubber ?? 1);
    const rb = car.lepre ? (gap > 0 ? -Math.min(0.3, Math.max(0, gap - 15) / 200) : 0.03) : rk * (gap > 0 ? -Math.min(0.05, Math.max(0, gap - 80) / 3000) : Math.min(0.05, Math.max(0, -gap - 120) / 3000));
    pace *= 1 + rb; car.rubber = 1 + rb * 1.2;
  } else car.rubber = 1;
  // pack compression: runaway leaders ease off a little, stragglers push (keeps the field together)
  const med = game.packMedian?.() ?? car.prog ?? 0, pg = ((car.prog || 0) - med) * tr.ds;
  if (game.dopts?.rubber !== false) pace *= pg > 40 ? 1 - Math.min(0.035, (pg - 40) / 3000) : pg < -60 ? 1 + Math.min(0.03, (-pg - 60) / 3000) : 1;
  // ---- lane management: racing line + personal offset (+ overtaking / avoidance)
  A.passT -= dt; A.ramCool -= dt; A.ramT -= dt;
  let laneT = A.laneNoise * 0.8;
  let vCap = 99, ramTarget = null;
  const prog = car.prog || 0;
  for (const o of game.cars) {
    if (o === car || o.out || o.ghostT > 0) continue;
    const op = o.body.translation(), dx = op.x - k.p.x, dz = op.z - k.p.z;
    const ax = dx * k.fwd.x + dz * k.fwd.z, lat = dx * k.side.x + dz * k.side.z;
    if (Math.abs(ax) > 40 || Math.abs(lat) > 12) continue;
    const ov = o.body.linvel(), oSpeed = ov.x * k.fwd.x + ov.z * k.fwd.z;
    const ofwdDot = (o.dyn?.fwd ? o.dyn.fwd.x * k.fwd.x + o.dyn.fwd.z * k.fwd.z : 1);
    const gr = A.grudge === o && !car.isPlayer ? 2.6 : 1, ramP = gr > 1 ? Math.max(P.ram, 0.45) : P.ram;
    // T-bone opportunity: a car crossing our path (figure-eight crossing, spun cars)
    if (ramP > 0 && A.ramCool <= 0 && ax > 6 && ax < 30 && Math.abs(ofwdDot) < 0.55 && Math.random() < ramP * 0.25 * gr) {
      const t = Math.min(1.4, ax / Math.max(10, k.speed));
      const ix = op.x + ov.x * t, iz = op.z + ov.z * t;
      if (Math.abs(game.lateralOf(ix, iz, i)) < hw + 1) { A.ram = { o, kind: 'tbone' }; A.ramT = 1.6; A.ramCool = 9 + Math.random() * 6; }
    }
    // pit manoeuvre: tap the rear corner of the car just ahead and send it into the scenery
    if (ramP > 0 && A.ramCool <= 0 && ax > 3 && ax < 14 && Math.abs(lat) < 3.5 && ofwdDot > 0.7 && k.speed > oSpeed - 1 && Math.random() < ramP * gr * (o.isPlayer ? 0.3 : 0.15)) { A.ram = { o, kind: 'pit', sgn: lat > 0 ? 1 : -1 }; A.ramT = 1.4; A.ramCool = 7 + Math.random() * 6; }
    // car ahead in our lane
    if (ax > 2 && ax < 12 + k.speed * 0.45 && Math.abs(lat) < 2.6 && ofwdDot > 0.3) {
      if (k.speed > oSpeed + 0.5 || ax < 8) {
        // overtake: pick the side with more room on the track
        if (A.passT <= 0) {
          const oLat = game.lateralOf(op.x, op.z, i);
          const left = oLat - 3.8, right = oLat + 3.8;
          const roomL = left > -hw + 1.6, roomR = right < hw - 1.6;
          const lineOff = line.off[(i + 6) % N];
          A.passSide = roomL && roomR ? (Math.abs(left - lineOff) < Math.abs(right - lineOff) ? left : right) : roomL ? left : roomR ? right : null;
          A.passT = 2.2;
        }
        if (P.brakeTraffic > 0 && ax < 7 + k.speed * 0.2 && A.passSide == null) vCap = Math.min(vCap, oSpeed - 0.5 * P.brakeTraffic);
      }
    }
    // side by side: cautious drivers give room, aggressive ones lean on the other car
    if (Math.abs(ax) < 4.5 && Math.abs(lat) < 3.4 && ofwdDot > 0.5) {
      if (P.lean > 0.5 && Math.random() < 0.05 * P.lean && A.ramCool <= 0) { A.ram = { o, kind: 'lean' }; A.ramT = 0.8; A.ramCool = 5; }
      else laneT -= Math.sign(lat) * (1.3 - P.lean) * 1.6;
    }
  }
  // autopilot hunting the Lepre (used when the player's car is AI-driven)
  const lp = game.lepre;
  if (car.isPlayer && lp && !lp.out && A.ramCool <= 0) { const op = lp.body.translation(), ax = (op.x - k.p.x) * k.fwd.x + (op.z - k.p.z) * k.fwd.z; if (ax > -2 && ax < 18) { A.ram = { o: lp, kind: 'hunt' }; A.ramT = 0.6; } }
  // the Lepre jinks away from a hunter closing in behind and kicks in the nitro
  let flee = false;
  if (car.lepre && pl && !pl.out) { const op = pl.body.translation(), ax = (op.x - k.p.x) * k.fwd.x + (op.z - k.p.z) * k.fwd.z, lat = (op.x - k.p.x) * k.side.x + (op.z - k.p.z) * k.side.z; if (ax < -2 && ax > -16) { laneT = -Math.sign(lat || 1) * 3.2; flee = true; } }
  if (A.passT > 0 && A.passSide != null) laneT = A.passSide - line.off[(i + 6) % N];
  // damaged: dive into the pit lane (drive-through repair) when it comes up
  const pit = game.pit; let pitting = false;
  if (pit && !car.isPlayer && (car.hp < 42 || car.wheelLost.some(Boolean) || car.fireT > 0)) { const rel = (i - pit.i0 + N) % N, toGo = (pit.i0 - i + N) % N; if (toGo < 45 || rel <= pit.L) { pitting = true; laneT = pit.lat - line.off[(i + 4) % N]; A.passT = 0; } }
  else if (A.passT <= 0) A.passSide = null;
  A.lane += (laneT - A.lane) * Math.min(1, dt * 1.6);
  // ---- target point on the line ahead
  const look = Math.max(3, Math.round((5 + k.speed * 0.42) / tr.ds));
  const ti = (i + look) % N, tp = tr.pts[ti];
  const off = Math.max(-hw + 1.5, Math.min(hw - 1.5, line.off[ti] + A.lane));
  let tx = tp.x - Math.sin(tp.h) * off, tz = tp.z + Math.cos(tp.h) * off;
  // ---- speed: profile at a point slightly ahead (braking points are baked into the profile)
  let vT = Math.min(line.spd[(i + 2) % N], line.spd[(i + 4) % N]) * pace * car.spec.top ** 0.5;
  vT = Math.min(vT, vCap);
  if (pitting) { const toGo = (game.pit.i0 - i + N) % N; vT = Math.min(vT, toGo < 45 && toGo > 0 ? 12 + toGo * 0.35 : 11); }
  if (car.hp < 30) vT *= 0.94;
  // ---- ramming overrides the line while it lasts and the victim is still close
  if (A.ramT > 0 && A.ram) {
    const o = A.ram.o, op = o.body.translation(), ov = o.body.linvel();
    const d = Math.hypot(op.x - k.p.x, op.z - k.p.z);
    if (o.out || d > 35) A.ramT = 0;
    else {
      const t = Math.min(1.2, d / Math.max(8, k.speed));
      let rx = op.x + ov.x * t, rz = op.z + ov.z * t;
      if (A.ram.kind === 'pit' && o.dyn?.fwd) { const f = o.dyn.fwd; rx += -f.x * 1.6 + f.z * A.ram.sgn * 0.9; rz += -f.z * 1.6 - f.x * A.ram.sgn * 0.9; } // rear corner on our side
      if (Math.abs(game.lateralOf(rx, rz, i)) < hw + 1.5) { tx = rx; tz = rz; vT = Math.max(vT, Math.min(46, k.speed + 6)); ramTarget = o; }
    }
  }
  const { d, st } = steerTo(k, tx, tz, 2.3);
  let thr = 0, brk = 0;
  if (k.speed < vT) thr = Math.min(1, 0.35 + (vT - k.speed) * 0.35);
  else if (k.speed > vT + 1.2) brk = Math.min(1, (k.speed - vT) * 0.3);
  else thr = 0.25;
  if (k.vF < -1 && thr > 0) { thr = 1; brk = 0; }
  // hairpin: handbrake flick
  const hb = Math.abs(d) > 0.75 && k.speed > 11 && k.speed > vT ? 1 : 0;
  // nitro on straights, or to finish off a ram
  const ahead = line.spd[(i + 12) % N];
  const nitro = (car.nitro > 25 && thr > 0.9 && Math.abs(st) < 0.25 && (ahead > k.speed + 8 || ramTarget)) || (flee && car.nitro > 5 && Math.abs(st) < 0.4) ? 1 : 0;
  // ---- recovery: far off track for long, or driving the wrong way
  if (car.offTrack > hw + 14) A.offT += dt; else A.offT = 0;
  const tang = Math.atan2(Math.sin(tr.pts[i].h), Math.cos(tr.pts[i].h)), hd = Math.abs(wrap(Math.atan2(k.fwd.z, k.fwd.x) - tang));
  if (hd > 2.2 && k.speed > 3) A.wrongT += dt; else A.wrongT = 0;
  if (A.offT > 3.5 || A.wrongT > 5) { const why = A.offT > 3.5 ? 'off' : 'wrong'; A.offT = A.wrongT = 0; game.requestRespawn(car, why); }
  return { thr, brk, st, hb, nitro };
}

function derbyAI(game, car, A, k, dt) {
  const tr = game.track, T = game.terrain, cx = T.cx, cz = T.cz;
  A.modeT -= dt; A.retarget -= dt;
  const rx = k.p.x - cx, rz = k.p.z - cz, rDist = Math.hypot(rx, rz);
  // impact just happened: back off, then circle to gain speed
  if (car.lastImpactT != null && game.time - car.lastImpactT < 0.15 && A.mode === 'charge') { A.mode = 'back'; A.modeT = 0.7 + Math.random() * 0.5; A.backSt = Math.random() < 0.5 ? -1 : 1; }
  if (A.mode === 'back') {
    if (A.modeT <= 0) { A.mode = 'circle'; A.modeT = 1.2 + Math.random() * 1.6; }
    return { thr: 0, brk: 1, st: A.backSt, hb: 0, nitro: 0 };
  }
  // v5 arena goals: king of the hill (go to the ring, or knock the king out of it), survival waves (everybody hunts you)
  const goal = arenaGoal(game, car);
  if (goal && !goal.target) {
    let gx = goal.x, gz = goal.z, gv = 15;
    if (goal.orbit) {
      // holding the crown: circle inside the ring and ram whoever comes in
      let intr = null, idd = 14; for (const o of game.cars) { if (o === car || o.out) continue; const op = o.body.translation(), d = Math.hypot(op.x - gx, op.z - gz); if (d < idd) { idd = d; intr = o; } }
      if (intr) { const op = intr.body.translation(); gx = op.x; gz = op.z; gv = 16; } else { const a = Math.atan2(k.p.z - gz, k.p.x - gx) + 0.6; gx += Math.cos(a) * goal.orbit; gz += Math.sin(a) * goal.orbit; gv = 7; }
    }
    const { st } = steerTo(k, gx, gz, 2.4); let thr = k.speed < gv ? 1 : 0.15, brk = k.speed > gv + 4 ? 0.7 : 0; if (k.vF < -1 && thr > 0) { thr = 1; brk = 0; }
    return { thr, brk, st, hb: 0, nitro: 0 };
  }
  if (goal?.target && !goal.target.out) { A.target = goal.target; if (A.mode === 'circle') A.modeT = Math.min(A.modeT, 0.5); }
  // the coward keeps its distance, orbiting wide, and only picks on cars that are nearly wrecked
  const P = A.P || {};
  if (P.coward && !goal) {
    let prey = null; for (const o of game.cars) { if (o === car || o.out || o.hp > 35 || !canTarget(game, car, o)) continue; prey = o; break; }
    if (prey) { A.target = prey; if (A.mode === 'circle') A.mode = 'hunt'; }
    else { A.target = null; A.mode = 'circle'; A.modeT = 1; }
  }
  // choose a target: near, not already mobbed, preferably weakened
  if (!goal?.target && !(P.coward && A.target) && (A.retarget <= 0 || !A.target || A.target.out)) {
    A.retarget = 1.5 + Math.random();
    let best = null, bs = 1e9;
    for (const o of game.cars) {
      if (o === car || o.out || !canTarget(game, car, o)) continue;
      const op = o.body.translation(); let s = Math.hypot(op.x - k.p.x, op.z - k.p.z);
      const mob = game.cars.filter((c) => c !== car && c.ai?.target === o && !c.out).length;
      s += mob * 16 - (100 - o.hp) * 0.18 + (o === A.target ? -6 : 0) + Math.random() * 8 - (o === A.grudge ? 28 : 0);
      if (s < bs) { bs = s; best = o; }
    }
    A.target = best;
  }
  let tx = cx, tz = cz, vT = 20, nitro = 0, hb = 0;
  const o = A.target;
  if (A.mode === 'circle') {
    // orbit around the arena centre to build speed, then hunt
    const dir = A.orbit || (A.orbit = Math.random() < 0.5 ? 1 : -1);
    const a = Math.atan2(rz, rx) + dir * 0.6, R = tr.R * 0.5;
    tx = cx + Math.cos(a) * R; tz = cz + Math.sin(a) * R; vT = 18;
    if (A.modeT <= 0) A.mode = 'hunt';
  } else if (o) {
    const op = o.body.translation(), ov = o.body.linvel();
    const d = Math.hypot(op.x - k.p.x, op.z - k.p.z);
    const t = Math.min(1.2, d / Math.max(8, k.speed));
    tx = op.x + ov.x * t; tz = op.z + ov.z * t;
    // aim for the flank of the target (T-bone), not its armoured nose
    if (o.dyn?.fwd) { const sx = -o.dyn.fwd.z, sz = o.dyn.fwd.x, sd = Math.sign((k.p.x - op.x) * sx + (k.p.z - op.z) * sz) || 1; tx += sx * sd * 0.5; tz += sz * sd * 0.5; }
    const al = steerTo(k, tx, tz).d;
    // no suicide runs: a weaker car does not charge into a nose that is pointing at it; it circles for the flank
    const facing = o.dyn?.fwd ? (o.dyn.fwd.x * (k.p.x - op.x) + o.dyn.fwd.z * (k.p.z - op.z)) / Math.max(1, d) : 0;
    const suicidal = facing > 0.75 && (o.dyn?.speed || 0) > 5 && car.hp < o.hp - 10 && game.mode !== 'ondate';
    if (A.mode === 'hunt') { vT = d > 30 ? 22 : 16; if (d < 26 && Math.abs(al) < 0.35 && !suicidal) { A.mode = 'charge'; A.modeT = 2.5; } else if (suicidal && d < 20) { A.mode = 'circle'; A.modeT = 0.9; A.orbit = -(A.orbit || 1); } }
    if (A.mode === 'charge') { vT = 40; nitro = car.nitro > 15 && Math.abs(al) < 0.2 ? 1 : 0; if (A.modeT <= 0 || Math.abs(al) > 1.4) { A.mode = 'circle'; A.modeT = 1 + Math.random(); } }
    if (Math.abs(al) > 1.6 && k.speed > 9) hb = 1;
  }
  // wall avoidance: heading out near the edge
  const outV = (k.v.x * rx + k.v.z * rz) / Math.max(1, rDist);
  if (rDist > tr.R - 10 && outV > 1.5) { tx = cx; tz = cz; vT = Math.min(vT, 12); nitro = 0; }
  const { st } = steerTo(k, tx, tz, 2.4);
  let thr = k.speed < vT ? 1 : 0.2, brk = k.speed > vT + 4 ? 0.6 : 0;
  if (k.vF < -1 && thr > 0) { thr = 1; brk = 0; }
  return { thr, brk, st, hb, nitro };
}

// Ramp jump: straight down the runway, flat out, nitro from the bottom of the hill
function stuntAI(game, car, A, k) {
  const ahead = k.p.x + 25, { st } = steerTo(k, ahead, 0, 2.0);
  const nitro = k.p.x > -150 && k.p.x < game.track.lipX && car.nitro > 0 ? 1 : 0;
  return { thr: k.p.x < game.track.lipX + 2 ? 1 : 0, brk: 0, st: k.p.x < game.track.lipX + 2 ? st : 0, hb: 0, nitro };
}
