// Kart Baso — deterministic simulation (no three.js, no DOM): kart physics with drift and mini-turbo,
// items and projectiles, track hazards, laps and standings, AI drivers, battle balloons.
// Fixed step (1/60 s) and a seeded RNG: the same inputs give the same race, so it runs headless in
// Node or in tests (window.__kart.step) exactly as on screen.
import { kartStats, CLASSES, ITEMS, ITEM_IDS, charById } from './data.js';
import { makeWorld, rng, hashStr } from './track.js';

const G = 24;               // cartoon gravity
const KR = 1.15;            // kart radius
const TAU = Math.PI * 2;
const wrapA = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const DRIFT_TIERS = [0.85, 1.85, 2.9];
const DRIFT_BOOST = [0, 0.75, 1.15, 1.6];
const SURF = { road: 1, dirt: 0.8, grass: 0.55, sand: 0.58, snow: 0.6, choco: 0.55, lava: 0.5, void: 1, mud: 0.45 };

export class Sim {
  // o: { mode: 'race'|'tt'|'battle', track, laps, cls, karts: [{ char, body, wheels, paint, human, name }], seed }
  constructor(o) {
    this.o = o;
    this.mode = o.mode || 'race';
    this.battle = this.mode === 'battle';
    this.world = makeWorld(o.track, this.battle);
    this.cls = CLASSES.find((c) => c.id === o.cls) || CLASSES[1];
    this.laps = o.laps || 3;
    this.rand = rng(o.seed ?? hashStr(String(o.track)));
    this.t = 0; this.countT = o.countdown ?? 3.6; this.state = 'count';
    this.timeLimit = this.battle ? (o.timeLimit || 150) : 0;
    this.events = [];
    this.proj = []; this.oils = [];
    this.F = this.world.F;
    this.lastCount = 4;
    this.frame = 0;
    const slots = this.battle ? this.world.spawns(o.karts.length) : this.world.grid(o.karts.length);
    this.karts = o.karts.map((d, i) => this.makeKart(d, i, slots[i]));
    this.humans = this.karts.filter((k) => k.human >= 0);
    // box/coin positions in track coordinates, for the AI
    if (!this.battle) {
      for (const b of this.F.boxes) { const q = this.world.main.nearest(b.x, b.z, -1, {}); b.s = q.s; b.lat = q.lat; }
      for (const c of this.F.coins) { const q = this.world.main.nearest(c.x, c.z, -1, {}); c.s = q.s; c.lat = q.lat; }
    }
    if (this.mode === 'tt') for (const k of this.karts) { k.item = 'tris'; k.uses = 3; }
  }
  makeKart(d, i, s) {
    const st = kartStats(d.char, d.body, d.wheels);
    const ch = charById(d.char);
    const skill = clamp(this.cls.ai + (this.rand() - 0.5) * 0.2, 0.1, 1);
    const k = {
      i, id: d.char, name: d.name || ch.name, human: d.human ?? -1, char: d.char, body: d.body || 'classico', wheels: d.wheels || 'standard', paint: d.paint || 'auto', color: d.color || ch.color,
      st, x: s.x, y: s.y, z: s.z, h: s.h, vx: 0, vz: 0, vy: 0, fwd: 0, air: false, airT: 0, vyG: 0, gy: s.y,
      drift: 0, dCharge: 0, dTier: 0, hopT: 0, trick: false, trickT: 0,
      boostT: 0, spinT: 0, tumbleT: 0, invT: 0, shieldT: 0, mokaT: 0, magT: 0, respawnT: 0, padT: 0, mudT: 0,
      item: null, uses: 0, roul: 0, coins: this.battle ? 0 : 0, coinsGot: 0, hits: 0, balloons: this.battle ? 3 : 0, out: false,
      dist: s.prog || 0, lastP: null, maxLap: 0, lap: 1, lapStart: 0, lapTimes: [], finished: false, finishT: 0, place: i + 1,
      ni: -1, surf: 'road', offT: 0, wrongT: 0, lavaT: 0, stuckT: 0, revT: 0, thrAt: -1,
      input: { steer: 0, thr: 0, brk: 0, drift: 0, item: 0, back: 0 }, prevDrift: 0, prevItem: 0,
      steerVis: 0, auto: (d.human ?? -1) < 0,
      ai: { skill, lane: (this.rand() - 0.5) * 0.9, laneT: 0, itemWait: 0.8 + this.rand() * 2.5, driftWant: 0, cut: null, target: null, noise: this.rand() * 10 },
      rubber: 1, stats: { items: 0, hitsGiven: 0, hitsTaken: 0, drifts: 0, boosts: 0 },
      probe: {},
    };
    if (!this.battle) { const p = this.world.probe(k.x, k.z, -1, k.probe); k.ni = p.ni; k.lastP = p.prog; }
    return k;
  }
  ev(e) { this.events.push(e); if (this.events.length > 400) this.events.splice(0, 100); }
  popEvents() { const e = this.events; this.events = []; return e; }

  // ───────── main step
  step(dt = 1 / 60) {
    this.frame++;
    if (this.state === 'count') {
      this.countT -= dt;
      const c = Math.ceil(this.countT);
      if (c < this.lastCount && c >= 1 && c <= 3) { this.lastCount = c; this.ev({ t: 'count', n: c }); }
      for (const k of this.karts) {
        if (k.human >= 0) { if (k.input.thr && k.thrAt < 0) k.thrAt = this.countT; if (!k.input.thr) k.thrAt = -1; }
        else if (k.thrAt < 0 && this.countT < 0.3 + k.ai.skill * 0.6 && this.rand() < 0.02 + k.ai.skill * 0.05) k.thrAt = this.countT;
      }
      if (this.countT <= 0) {
        this.state = 'race'; this.ev({ t: 'go' });
        for (const k of this.karts) {
          if (k.thrAt > 0.05 && k.thrAt < 1.15) { k.boostT = 1.1; k.fwd = k.st.top * 0.6; this.ev({ t: 'boost', k: k.i, start: true }); }
          else if (k.thrAt > 2.1) { k.stallT = 0.9; this.ev({ t: 'stall', k: k.i }); }
        }
      }
      return;
    }
    if (this.state === 'done') { this.t += dt; for (const k of this.karts) { if (k.auto || k.finished) this.ai(k, dt); this.kart(k, dt); } this.updateProj(dt); return; }
    this.t += dt;
    this.updateWorld(dt);
    if (!this.battle) this.rubberBand();
    for (const k of this.karts) {
      if (k.out) continue;
      if (k.auto || k.finished) this.ai(k, dt);
      this.kart(k, dt);
    }
    this.collideKarts();
    this.updateProj(dt);
    this.standings();
    this.checkEnd();
  }

  // ───────── kart physics
  kart(k, dt) {
    const W = this.world, inp = k.input, st = k.st;
    for (const key of ['stallT', 'boostT', 'spinT', 'tumbleT', 'invT', 'shieldT', 'mokaT', 'magT', 'padT', 'hopT', 'trickT']) if (k[key] > 0) k[key] = Math.max(0, k[key] - dt);
    if (k.roul > 0) { k.roul -= dt; if (k.roul <= 0) { k.roul = 0; this.ev({ t: 'got', k: k.i, item: k.item }); } }
    if (k.respawnT > 0) {
      k.respawnT -= dt;
      if (k.respawnT <= 0) { k.respawnT = 0; k.invT = 1.6; this.ev({ t: 'respawned', k: k.i }); }
      return;
    }
    const control = k.spinT <= 0 && k.tumbleT <= 0 && this.state !== 'count';
    let fx = Math.sin(k.h), fz = Math.cos(k.h), rx = -fz, rz = fx;
    let fwd = k.vx * fx + k.vz * fz, lat = k.vx * rx + k.vz * rz;
    // surface & top speed
    const surf = k.surf;
    let sf = SURF[surf] ?? 1;
    if (surf !== 'road' && surf !== 'dirt' && surf !== 'void') sf = Math.min(1, st.off * (sf / 0.55));
    if (k.mudT > 0) sf = Math.min(sf, k.ice ? 1 : SURF.mud);
    let top = st.top * this.cls.mult * (1 + 0.006 * Math.min(k.coins, 10)) * (k.human < 0 ? k.rubber : 1);
    if (k.boostT > 0) { top *= 1.3; sf = Math.max(sf, 0.92); }
    if (k.mokaT > 0) { top *= 1.16; sf = 1; }
    if (k.magT > 0) top *= 1.2;
    top *= sf;
    if (control) {
      if (k.boostT > 0 || k.mokaT > 0) fwd = Math.min(top, fwd + 34 * dt);
      else if (inp.thr && !inp.brk && !(k.stallT > 0)) { if (fwd < top) fwd += st.accel * (1 - 0.6 * clamp(fwd / top, 0, 1)) * dt * (fwd < 0 ? 2.5 : 1); }
      else if (inp.brk) { if (fwd > 0.5) fwd -= (inp.thr ? 12 : 24) * dt; else fwd = Math.max(fwd - 10 * dt, -8); }
      else fwd -= Math.sign(fwd) * Math.min(Math.abs(fwd), 5 * dt);
      if (fwd > top) fwd -= Math.min(fwd - top, (sf < 0.9 ? 28 : 9) * dt);
    } else fwd *= 1 - 1.8 * dt;
    // steering & drift
    const steer = control ? clamp(inp.steer, -1, 1) : 0;
    k.steerVis += (steer - k.steerVis) * Math.min(1, dt * 10);
    let yaw = 0;
    if (k.drift) {
      const kk = steer * k.drift;
      yaw = k.drift * st.turn * (0.78 + 0.42 * kk) * Math.min(1, Math.abs(fwd) / 10);
      if (!k.air) {
        k.dCharge += dt * (0.85 + 0.75 * Math.max(0, kk));
        const tier = k.dCharge > DRIFT_TIERS[2] ? 3 : k.dCharge > DRIFT_TIERS[1] ? 2 : k.dCharge > DRIFT_TIERS[0] ? 1 : 0;
        if (tier > k.dTier) { k.dTier = tier; this.ev({ t: 'tier', k: k.i, tier }); }
      }
      if (!inp.drift || fwd < 6 || !control) this.endDrift(k, control && fwd >= 6);
    } else {
      const sp = Math.abs(fwd);
      yaw = steer * st.turn * clamp(sp / 6, 0, 1) * (1 - 0.2 * clamp(sp / 32, 0, 1)) * (fwd < -0.5 ? -1 : 1);
    }
    if (k.air) yaw *= k.drift ? 0.6 : 0.4;
    if (k.spinT > 0) yaw = 11 * (k.spinDir || 1);
    k.h = wrapA(k.h - yaw * dt);
    // hop / start a drift / trick
    if (control && inp.drift && !k.prevDrift) {
      if (!k.air) { k.vy = 4.2; k.air = true; k.airT = 0; k.hopT = 0.35; this.ev({ t: 'hop', k: k.i }); if (Math.abs(steer) > 0.25 && fwd > 9) this.startDrift(k, Math.sign(steer)); }
      else if (k.rampAir && k.airT < 0.5 && !k.trick) { k.trick = true; k.trickT = 0.5; this.ev({ t: 'trick', k: k.i }); }
    }
    if (control && inp.drift && k.hopT > 0 && !k.drift && Math.abs(steer) > 0.3 && fwd > 9) this.startDrift(k, Math.sign(steer));
    k.prevDrift = inp.drift;
    // velocity: forward speed + decaying sideways slip (low grip in a drift, on ice and in the air)
    fx = Math.sin(k.h); fz = Math.cos(k.h); rx = -fz; rz = fx;
    let grip = st.grip * (k.drift ? 0.3 : 1) * (k.ice ? 0.22 : surf === 'snow' ? 0.7 : 1) * (k.air ? 0.06 : 1);
    if (k.spinT > 0) grip = 1.5;
    lat *= Math.exp(-grip * dt);
    if (k.drift && !k.air) lat -= k.drift * Math.abs(fwd) * 0.9 * dt; // the kart slides to the outside
    k.vx = fx * fwd + rx * lat; k.vz = fz * fwd + rz * lat;
    // magnet: pulled toward the target
    if (k.magT > 0) this.magnet(k, dt);
    k.fwd = fwd;
    // integrate
    k.x += k.vx * dt; k.z += k.vz * dt;
    const p = W.probe(k.x, k.z, k.ni, k.probe);
    k.ni = p.ni;
    let gy = p.gy;
    if (!k.air) {
      if (gy === -Infinity || gy < k.y - 0.35 || (k.lastRamp > 0.3 && k.vyG > 1 && gy < k.y - 0.02)) {
        k.air = true; k.airT = 0; k.vy = Math.max(-2, k.vyG) + (k.lastRamp ? 2.6 : 0); k.rampAir = k.lastRamp > 0.3; k.trick = false;
        if (k.rampAir) this.ev({ t: 'jump', k: k.i });
      } else { k.vyG = clamp((gy - k.y) / dt, -15, 14); k.y = gy; }
    }
    if (k.air) {
      k.vy -= G * dt; k.y += k.vy * dt; k.airT += dt;
      if (gy > -Infinity && k.y <= gy && k.vy <= 0) {
        k.y = gy; k.air = false; k.vyG = 0;
        if (k.airT > 0.35) this.ev({ t: 'land', k: k.i, pow: Math.min(1, -k.vy / 14) });
        if (k.trick) { k.boostT = Math.max(k.boostT, 0.75); this.ev({ t: 'boost', k: k.i, trick: true }); k.stats.boosts++; }
        k.trick = false; k.rampAir = false;
      }
      if (k.y < (k.gy ?? 0) - 14) this.respawn(k);
    } else k.gy = gy;
    if (!this.battle) { const q = p.path?.isMain ? W.main.ramp[p.ni] : 0; k.lastRamp = p.excess <= 0 ? q : 0; }
    else { k.lastRamp = gy > 0.2 ? gy : 0; }
    // surfaces
    k.surf = p.surf;
    if (p.surf === 'lava' && !k.air) { k.lavaT += dt; if (k.lavaT > 0.12) { this.ev({ t: 'burn', k: k.i }); this.respawn(k); return; } } else k.lavaT = 0;
    if (p.wall) this.wall(k, p.wall);
    // race progress
    if (!this.battle && k.lastP != null && k.respawnT <= 0) {
      let d = p.prog - k.lastP; const L = W.len;
      if (d < -L / 2) d += L; else if (d > L / 2) d -= L;
      k.dist += d; k.lastP = p.prog;
      const dot = fx * p.tx + fz * p.tz;
      if (dot < -0.35 && fwd > 4 && !k.finished) k.wrongT += dt; else k.wrongT = Math.max(0, k.wrongT - dt * 2);
      this.laps_(k);
    }
    this.pickups(k);
    // stuck guard (AI and auto-driven)
    if (k.auto && this.state === 'race') {
      if (Math.abs(fwd) < 2 && control) k.stuckT += dt; else k.stuckT = Math.max(0, k.stuckT - dt);
      if (k.stuckT > 5) { k.stuckT = 0; this.respawn(k); }
      if (!this.battle && !k.finished) { if (this.t - (k.progT || 0) > 6) { if (k.dist - (k.progD ?? -1e9) < 12 && k.respawnT <= 0) { k.ai.cut = null; this.respawn(k); } k.progT = this.t; k.progD = k.dist; } }
    }
    if (inp.item && !k.prevItem && control && !k.auto) this.useItem(k);
    k.prevItem = inp.item;
  }
  startDrift(k, dir) { k.drift = dir; k.dCharge = 0; k.dTier = 0; this.ev({ t: 'drift', k: k.i, dir }); }
  endDrift(k, reward) {
    if (reward && k.dTier > 0) { k.boostT = Math.max(k.boostT, DRIFT_BOOST[k.dTier]); k.stats.boosts++; k.stats.drifts++; this.ev({ t: 'boost', k: k.i, tier: k.dTier }); }
    k.drift = 0; k.dCharge = 0; k.dTier = 0;
  }
  wall(k, w) {
    let nx, nz, depth;
    if (w.circle) { nx = w.nx; nz = w.nz; depth = w.depth; }
    else { const sg = Math.sign(w.lat) || 1; nx = -w.tz * sg; nz = w.tx * sg; depth = Math.abs(w.lat) - w.edge; }
    if (depth <= 0) return;
    k.x -= nx * depth; k.z -= nz * depth;
    const vn = k.vx * nx + k.vz * nz;
    if (vn > 0) {
      k.vx -= nx * vn * 1.4; k.vz -= nz * vn * 1.4;
      k.vx *= 0.97; k.vz *= 0.97;
      if (vn > 5) { this.ev({ t: 'wall', k: k.i, pow: Math.min(1, vn / 18), x: k.x + nx * KR, y: k.y + 0.5, z: k.z + nz * KR }); if (k.drift && vn > 9) this.endDrift(k, false); }
    }
  }
  respawn(k) {
    if (k.respawnT > 0) return;
    const r = this.battle ? this.world.respawnAt(0, this.rand) : this.world.respawnAt(k.lastP ?? 0);
    k.x = r.x; k.z = r.z; k.y = r.y + 0.05; k.h = r.h; k.vx = k.vz = k.vy = 0; k.fwd = 0; k.air = false; k.gy = r.y;
    k.drift = 0; k.boostT = 0; k.spinT = 0; k.tumbleT = 0; k.mokaT = 0; k.magT = 0;
    k.respawnT = 1.2; k.coins = Math.max(0, k.coins - 2);
    k.ni = -1; const p = this.world.probe(k.x, k.z, -1, k.probe); k.ni = p.ni; k.surf = p.surf;
    if (!this.battle) { let d = p.prog - k.lastP; const L = this.world.len; if (d < -L / 2) d += L; else if (d > L / 2) d -= L; k.dist += d; k.lastP = p.prog; }
    this.ev({ t: 'respawn', k: k.i });
  }
  laps_(k) {
    const L = this.world.len;
    const lapsDone = Math.floor(k.dist / L);
    if (lapsDone > k.maxLap && !k.finished) {
      k.maxLap = lapsDone;
      const lt = this.t - k.lapStart; k.lapTimes.push(lt); k.lapStart = this.t;
      if (lapsDone >= this.laps) { k.finished = true; k.finishT = this.t; k.auto = true; this.ev({ t: 'finish', k: k.i }); }
      else { k.lap = lapsDone + 1; this.ev({ t: 'lap', k: k.i, lap: k.lap, final: k.lap === this.laps, time: lt }); }
    }
  }

  // ───────── pickups and hazards
  pickups(k) {
    const F = this.F;
    for (const b of F.boxes) {
      if (b.t > 0) continue;
      const dx = b.x - k.x, dz = b.z - k.z;
      if (dx * dx + dz * dz < 5.3 && Math.abs(b.y - 1 - k.y) < 2.5) {
        b.t = 1.6; this.ev({ t: 'box', k: k.i, x: b.x, y: b.y, z: b.z });
        if (!k.item && k.roul <= 0 && this.mode !== 'tt') { k.item = this.rollItem(k); k.uses = ITEMS[k.item].uses || 1; k.roul = k.human >= 0 ? 1.1 : 0.6; }
      }
    }
    for (const c of F.coins) {
      if (c.t > 0) continue;
      const dx = c.x - k.x, dz = c.z - k.z;
      if (dx * dx + dz * dz < 3.2 && Math.abs(c.y - 0.9 - k.y) < 2) { c.t = this.battle ? 10 : 18; if (k.coins < 10) k.coins++; k.coinsGot++; this.ev({ t: 'coin', k: k.i }); }
    }
    if (k.padT <= 0) for (const b of F.boosts) {
      const dx = k.x - b.x, dz = k.z - b.z, a = dx * b.tx + dz * b.tz, l = -dx * b.tz + dz * b.tx;
      if (Math.abs(a) < b.hl && Math.abs(l) < b.hw && Math.abs(k.y - b.y) < 1.5) { k.boostT = Math.max(k.boostT, 1.05); k.padT = 0.4; this.ev({ t: 'boost', k: k.i, pad: true }); k.stats.boosts++; }
    }
    k.mudT = 0; k.ice = false;
    if (!k.air) for (const m of F.muds) { const dx = k.x - m.x, dz = k.z - m.z; if (dx * dx + dz * dz < m.r * m.r) { k.mudT = 1; k.ice = m.ice; if (!m.ice && k.boostT <= 0 && Math.abs(k.fwd) > 8 && this.frame % 8 === 0) this.ev({ t: 'splash', k: k.i, mesh: m.mesh }); } }
    if (k.invT <= 0 && k.mokaT <= 0) {
      for (const b of F.bumpers) {
        const dx = k.x - b.x, dz = k.z - b.z, d = Math.hypot(dx, dz), R = b.r + KR;
        if (d < R && Math.abs(k.y - b.y) < 3) {
          const nx = dx / (d || 1), nz = dz / (d || 1);
          k.x = b.x + nx * R; k.z = b.z + nz * R;
          const vn = (k.vx - b.vx) * nx + (k.vz - b.vz) * nz;
          if (vn < 0) { k.vx -= nx * vn * 1.6; k.vz -= nz * vn * 1.6; }
          k.vx += nx * 6; k.vz += nz * 6;
          this.hit(k, 'bump', null);
        }
      }
      for (const g of F.geysers) if (g.on) { const dx = k.x - g.x, dz = k.z - g.z; if (dx * dx + dz * dz < g.r * g.r && !k.air) { this.hit(k, 'geyser', null); } }
    } else if (k.mokaT > 0) {
      for (const b of F.bumpers) { const dx = k.x - b.x, dz = k.z - b.z, d = Math.hypot(dx, dz), R = b.r + KR; if (d < R) { const nx = dx / (d || 1), nz = dz / (d || 1); k.x = b.x + nx * R; k.z = b.z + nz * R; } }
    }
    for (let i = this.oils.length - 1; i >= 0; i--) {
      const o = this.oils[i]; const dx = k.x - o.x, dz = k.z - o.z;
      if (dx * dx + dz * dz < (o.r + 0.6) ** 2 && Math.abs(k.y - o.y) < 1.6 && !k.air && (o.owner !== k.i || o.age > 0.8)) {
        this.oils.splice(i, 1); this.ev({ t: 'oilhit', x: o.x, y: o.y, z: o.z }); this.hit(k, 'spin', o.owner);
      }
    }
    if (this.battle) for (const p of this.world.pillars) {
      const dx = k.x - p.x, dz = k.z - p.z, d = Math.hypot(dx, dz), R = p.r + KR;
      if (d < R) { const nx = dx / (d || 1), nz = dz / (d || 1); k.x = p.x + nx * R; k.z = p.z + nz * R; const vn = k.vx * nx + k.vz * nz; if (vn < 0) { k.vx -= nx * vn * 1.4; k.vz -= nz * vn * 1.4; if (vn < -6) this.ev({ t: 'wall', k: k.i, pow: Math.min(1, -vn / 18), x: k.x - nx * KR, y: k.y + 0.5, z: k.z - nz * KR }); } }
    }
  }
  rollItem(k) {
    let wts;
    if (this.battle) wts = ITEM_IDS.map((id) => ITEMS[id].bw);
    else {
      const n = this.karts.length, r = n > 1 ? (k.place - 1) / (n - 1) : 0;
      const band = r < 0.3 ? 0 : r < 0.7 ? 1 : 2;
      wts = ITEM_IDS.map((id) => ITEMS[id].w[band]);
      // one Super Moka on the track at a time
      if (this.karts.some((x) => x.mokaT > 0 || x.item === 'moka')) wts[ITEM_IDS.indexOf('moka')] = 0;
    }
    const tot = wts.reduce((a, b) => a + b, 0); let r = this.rand() * tot;
    for (let i = 0; i < wts.length; i++) { r -= wts[i]; if (r <= 0) return ITEM_IDS[i]; }
    return ITEM_IDS[0];
  }

  // ───────── items
  useItem(k) {
    if (!k.item || k.roul > 0 || k.respawnT > 0 || k.out) return false;
    const id = ITEMS[k.item].as || k.item;
    const back = !!k.input.back;
    const fx = Math.sin(k.h), fz = Math.cos(k.h);
    k.stats.items++;
    switch (id) {
      case 'peperoncino': k.boostT = Math.max(k.boostT, 1.3); k.stats.boosts++; this.ev({ t: 'boost', k: k.i, item: true }); break;
      case 'olio':
        if (back || k.human < 0 || !k.input.fwdAim) this.dropOil(k.x - fx * 2.6, k.y, k.z - fz * 2.6, k.i);
        else this.proj.push({ type: 'olio', x: k.x + fx * 2, y: k.y + 1, z: k.z + fz * 2, vx: k.vx + fx * 14, vy: 8, vz: k.vz + fz * 14, owner: k.i, life: 3, age: 0, ni: k.ni });
        break;
      case 'bomba':
        if (back) this.proj.push({ type: 'bomba', x: k.x - fx * 2.4, y: k.y + 0.6, z: k.z - fz * 2.4, vx: k.vx * 0.3, vy: 3, vz: k.vz * 0.3, owner: k.i, life: 2.2, age: 0, ni: k.ni, bounces: 0 });
        else this.proj.push({ type: 'bomba', x: k.x + fx * 2.2, y: k.y + 1, z: k.z + fz * 2.2, vx: k.vx + fx * 15, vy: 7.5, vz: k.vz + fz * 15, owner: k.i, life: 2.6, age: 0, ni: k.ni, bounces: 0 });
        break;
      case 'ricciolo': {
        const target = back ? null : this.targetAhead(k);
        const sp = back ? -30 : 36;
        this.proj.push({ type: 'ricciolo', x: k.x + fx * (back ? -2.4 : 2.4), y: k.y + 0.4, z: k.z + fz * (back ? -2.4 : 2.4), vx: fx * sp, vy: 0, vz: fz * sp, h: back ? k.h + Math.PI : k.h, sp: Math.abs(sp), owner: k.i, target: target ? target.i : -1, life: back ? 5 : 9, age: 0, ni: k.ni, homing: !back, dist: k.dist });
        break;
      }
      case 'scudo': k.shieldT = 10; break;
      case 'calamita': k.magT = 3.6; break;
      case 'moka': k.mokaT = 6.5; k.boostT = Math.max(k.boostT, 0.6); break;
      case 'monete': k.coins = Math.min(10, k.coins + 3); k.coinsGot += 3; break;
    }
    this.ev({ t: 'use', k: k.i, item: k.item, back });
    k.uses--;
    if (k.uses <= 0) { k.item = null; k.uses = 0; }
    return true;
  }
  dropOil(x, y, z, owner) {
    const p = this.world.probe(x, z, -1, {});
    this.oils.push({ x, y: p.gy > -Infinity ? p.gy : y, z, r: 1.7, owner, age: 0 });
    if (this.oils.length > 14) this.oils.shift();
    this.ev({ t: 'oil', x, y, z });
  }
  // next kart ahead in the race (or the nearest rival in front in battle)
  targetAhead(k, maxD = 1e9) {
    if (this.battle) {
      let best = null, bd = 1e9;
      for (const o of this.karts) { if (o === k || o.out) continue; const dx = o.x - k.x, dz = o.z - k.z, d = Math.hypot(dx, dz); const a = Math.abs(wrapA(Math.atan2(dx, dz) - k.h)); const sc = d * (1 + a); if (sc < bd && d < maxD) { bd = sc; best = o; } }
      return best;
    }
    let best = null, bd = 1e9;
    for (const o of this.karts) { if (o === k || o.finished) continue; const d = o.dist - k.dist; if (d > 0.5 && d < bd && d < maxD) { bd = d; best = o; } }
    return best;
  }
  magnet(k, dt) {
    const t = this.targetAhead(k, 70);
    if (!t) return;
    const dx = t.x - k.x, dz = t.z - k.z, d = Math.hypot(dx, dz);
    if (d < 2.8) {
      if (t.item && !k.item && t.roul <= 0) { k.item = t.item; k.uses = t.uses; t.item = null; t.uses = 0; this.ev({ t: 'steal', k: k.i, from: t.i }); }
      else this.ev({ t: 'steal', k: k.i, from: t.i, none: true });
      t.vx += (dx / d) * 4; t.vz += (dz / d) * 4; k.magT = 0; return;
    }
    // turn the nose toward the target (gentle auto-steer) and get pulled
    const want = Math.atan2(dx, dz), da = wrapA(want - k.h);
    k.h = wrapA(k.h + clamp(da, -1.6 * dt, 1.6 * dt));
    k.vx += (dx / d) * 9 * dt; k.vz += (dz / d) * 9 * dt;
  }
  hit(k, kind, by) {
    if (k.mokaT > 0 || k.respawnT > 0 || k.out) return false;
    if (k.invT > 0) return false;
    if (k.shieldT > 0 && kind !== 'bump') { k.shieldT = 0; k.invT = 0.5; this.ev({ t: 'shield', k: k.i }); return false; }
    k.drift = 0; k.dCharge = 0; k.dTier = 0; k.boostT = 0;
    if (kind === 'bump') { k.spinT = 0.6; k.spinDir = this.rand() < 0.5 ? -1 : 1; k.invT = 1.1; }
    else if (kind === 'spin') { k.spinT = 1.15; k.spinDir = this.rand() < 0.5 ? -1 : 1; k.invT = 1.8; }
    else { k.tumbleT = 1.3; k.vy = kind === 'geyser' ? 12 : 9; k.air = true; k.airT = 0; k.rampAir = false; k.invT = 2; k.vx *= 0.3; k.vz *= 0.3; }
    k.coins = Math.max(0, k.coins - (kind === 'bump' ? 1 : 2));
    k.stats.hitsTaken++;
    if (by != null && by !== k.i && this.karts[by]) { this.karts[by].stats.hitsGiven++; this.karts[by].hits++; }
    this.ev({ t: 'hit', k: k.i, kind, by });
    if (this.battle && kind !== 'bump') this.popBalloon(k, by);
    return true;
  }
  popBalloon(k, by) {
    k.balloons = Math.max(0, k.balloons - 1);
    this.ev({ t: 'balloon', k: k.i, left: k.balloons, by });
    if (k.balloons <= 0) { k.out = true; k.outT = this.t; this.ev({ t: 'out', k: k.i }); }
  }
  updateProj(dt) {
    const W = this.world;
    for (const o of this.oils) o.age += dt;
    for (let i = this.proj.length - 1; i >= 0; i--) {
      const p = this.proj[i]; p.age += dt; p.life -= dt;
      let dead = p.life <= 0;
      if (p.type === 'ricciolo') {
        let tgt = p.target >= 0 ? this.karts[p.target] : null;
        if (tgt && (tgt.out || tgt.respawnT > 0)) tgt = null;
        let wx, wz;
        if (p.homing && !this.battle) {
          // follow the road, then lock on when close
          const q = W.main.nearest(p.x, p.z, p.ni, {}); p.ni = q.i;
          if (tgt && Math.hypot(tgt.x - p.x, tgt.z - p.z) < 26) { wx = tgt.x; wz = tgt.z; }
          else { const a = W.main.pointAt(q.s + 12, tgt ? clamp(tgt.probe.mainLat ?? 0, -5, 5) : q.lat * 0.6); wx = a.x; wz = a.z; }
        } else if (p.homing && tgt) { wx = tgt.x; wz = tgt.z; }
        if (wx != null) { const want = Math.atan2(wx - p.x, wz - p.z); p.h = wrapA(p.h + clamp(wrapA(want - p.h), -5 * dt, 5 * dt)); }
        p.vx = Math.sin(p.h) * p.sp; p.vz = Math.cos(p.h) * p.sp;
        p.x += p.vx * dt; p.z += p.vz * dt;
        const g = W.probe(p.x, p.z, p.ni, {});
        if (!this.battle) p.ni = g.ni;
        if (g.gy === -Infinity) { p.y -= 12 * dt; if (p.y < -40) dead = true; } else p.y += (g.gy + 0.5 - p.y) * Math.min(1, dt * 12);
        if (g.wall) {
          if (p.homing) { const w = g.wall; if (w.circle) { p.x -= w.nx * w.depth; p.z -= w.nz * w.depth; p.h = wrapA(Math.atan2(-p.vx * (w.nz ? 1 : -1), p.vz * (w.nx ? 1 : -1))); } else { const sg = Math.sign(w.lat); const ex = Math.abs(w.lat) - w.edge; p.x -= -w.tz * sg * ex; p.z -= w.tx * sg * ex; } }
          else { dead = this.bounceProj(p, g.wall) || dead; }
        }
        if (this.battle) for (const pl of W.pillars) if (Math.hypot(p.x - pl.x, p.z - pl.z) < pl.r + 0.6) { p.h = wrapA(p.h + Math.PI * 0.7); p.x += Math.sin(p.h) * 1.5; p.z += Math.cos(p.h) * 1.5; if (++p.bounces > 3) dead = true; }
        p.bounces = p.bounces || 0;
        for (const k of this.karts) {
          if (k.out || k.respawnT > 0 || (k.i === p.owner && p.age < 0.6)) continue;
          const dx = k.x - p.x, dz = k.z - p.z;
          if (dx * dx + dz * dz < 3.6 && Math.abs(k.y + 0.5 - p.y) < 2) { this.ev({ t: 'pop', x: p.x, y: p.y, z: p.z, type: 'ricciolo' }); this.hit(k, 'spin', p.owner); dead = true; break; }
        }
      } else if (p.type === 'bomba' || p.type === 'olio') {
        p.vy -= G * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        const g = W.probe(p.x, p.z, p.ni, {}); if (!this.battle) p.ni = g.ni;
        if (g.wall) this.bounceProj(p, g.wall);
        if (this.battle) for (const pl of W.pillars) { const dx = p.x - pl.x, dz = p.z - pl.z, d = Math.hypot(dx, dz); if (d < pl.r + 0.5) { const nx = dx / d, nz = dz / d; p.x = pl.x + nx * (pl.r + 0.5); p.z = pl.z + nz * (pl.r + 0.5); const vn = p.vx * nx + p.vz * nz; p.vx -= 1.6 * vn * nx; p.vz -= 1.6 * vn * nz; } }
        if (g.gy > -Infinity && p.y < g.gy + 0.5) {
          p.y = g.gy + 0.5;
          if (p.type === 'olio') { this.dropOil(p.x, g.gy, p.z, p.owner); dead = true; p.life = 1; }
          else if (p.vy < 0) { p.vy = Math.abs(p.vy) > 2 ? -p.vy * 0.55 : 0; p.vx *= 0.9; p.vz *= 0.9; p.bounces++; this.ev({ t: 'bounce', x: p.x, y: p.y, z: p.z }); }
        }
        if (g.gy === -Infinity && p.y < -40) { dead = true; p.life = 1; }
        if (p.type === 'bomba') {
          let boom = p.life <= 0;
          if (!boom) for (const k of this.karts) { if (k.out || (k.i === p.owner && p.age < 0.7)) continue; const dx = k.x - p.x, dz = k.z - p.z; if (dx * dx + dz * dz < 4.4 && Math.abs(k.y + 0.5 - p.y) < 2.2) { boom = true; break; } }
          if (boom) { this.explode(p.x, p.y, p.z, p.owner); dead = true; }
        }
      }
      // projectiles cancel each other out
      if (!dead) for (let j = i - 1; j >= 0; j--) { const q = this.proj[j]; if (q.type === 'olio') continue; if ((p.x - q.x) ** 2 + (p.z - q.z) ** 2 < 2.2 && Math.abs(p.y - q.y) < 1.5) { if (q.type === 'bomba') this.explode(q.x, q.y, q.z, q.owner); else this.ev({ t: 'pop', x: q.x, y: q.y, z: q.z, type: q.type }); if (p.type === 'bomba') this.explode(p.x, p.y, p.z, p.owner); else this.ev({ t: 'pop', x: p.x, y: p.y, z: p.z, type: p.type }); this.proj.splice(i, 1); this.proj.splice(j, 1); i--; dead = false; p.gone = true; break; } }
      if (p.gone) continue;
      // oil slicks also stop a ricciolo
      if (!dead && p.type === 'ricciolo') for (let j = this.oils.length - 1; j >= 0; j--) { const o = this.oils[j]; if ((p.x - o.x) ** 2 + (p.z - o.z) ** 2 < 3) { this.oils.splice(j, 1); this.ev({ t: 'pop', x: p.x, y: p.y, z: p.z, type: 'ricciolo' }); dead = true; break; } }
      if (dead) { if (p.type === 'ricciolo' && p.life <= 0) this.ev({ t: 'pop', x: p.x, y: p.y, z: p.z, type: 'ricciolo' }); this.proj.splice(i, 1); }
    }
  }
  bounceProj(p, w) {
    let nx, nz, depth;
    if (w.circle) { nx = w.nx; nz = w.nz; depth = w.depth; } else { const sg = Math.sign(w.lat) || 1; nx = -w.tz * sg; nz = w.tx * sg; depth = Math.abs(w.lat) - w.edge; }
    p.x -= nx * depth; p.z -= nz * depth;
    const vn = p.vx * nx + p.vz * nz;
    if (vn > 0) { p.vx -= 2 * vn * nx; p.vz -= 2 * vn * nz; if (p.h != null) p.h = Math.atan2(p.vx, p.vz); }
    p.bounces = (p.bounces || 0) + 1;
    return p.type === 'ricciolo' && p.bounces > 6;
  }
  explode(x, y, z, owner) {
    this.ev({ t: 'explode', x, y, z });
    for (const k of this.karts) { if (k.out) continue; const d = Math.hypot(k.x - x, k.z - z, (k.y - y) * 0.6); if (d < 5.8) this.hit(k, 'blast', owner); }
    for (let i = this.oils.length - 1; i >= 0; i--) if (Math.hypot(this.oils[i].x - x, this.oils[i].z - z) < 5) this.oils.splice(i, 1);
  }

  // ───────── world: boxes, coins, bumpers, geysers
  updateWorld(dt) {
    const F = this.F;
    for (const b of F.boxes) if (b.t > 0) b.t -= dt;
    for (const c of F.coins) if (c.t > 0) c.t -= dt;
    for (const b of F.bumpers) {
      const w = (TAU / b.period), s = Math.sin(this.t * w + b.phase), off = b.amp * s, v = b.amp * Math.cos(this.t * w + b.phase) * w;
      b.x = b.cx + b.nx * off; b.z = b.cz + b.nz * off; b.vx = b.nx * v; b.vz = b.nz * v;
    }
    for (const g of F.geysers) { const ph = ((this.t + g.phase) % g.period) / g.period; g.warn = ph > 0.62 && ph < 0.8; const on = ph >= 0.8 && ph < 0.95; if (on && !g.on) this.ev({ t: 'geyser', x: g.x, y: g.y, z: g.z }); g.on = on; }
  }
  collideKarts() {
    const K = this.karts;
    for (let a = 0; a < K.length; a++) for (let b = a + 1; b < K.length; b++) {
      const A = K[a], B = K[b];
      if (A.out || B.out || A.respawnT > 0 || B.respawnT > 0) continue;
      const dx = B.x - A.x, dz = B.z - A.z, d2 = dx * dx + dz * dz;
      if (d2 > (2 * KR) ** 2 || Math.abs(A.y - B.y) > 1.6) continue;
      const d = Math.sqrt(d2) || 0.01, nx = dx / d, nz = dz / d, pen = 2 * KR - d;
      const ma = A.st.mass * (A.mokaT > 0 ? 5 : 1), mb = B.st.mass * (B.mokaT > 0 ? 5 : 1), tot = ma + mb;
      A.x -= nx * pen * (mb / tot); A.z -= nz * pen * (mb / tot); B.x += nx * pen * (ma / tot); B.z += nz * pen * (ma / tot);
      const rv = (B.vx - A.vx) * nx + (B.vz - A.vz) * nz;
      if (rv < 0) {
        const j = (-1.6 * rv) / (1 / ma + 1 / mb);
        A.vx -= (j / ma) * nx; A.vz -= (j / ma) * nz; B.vx += (j / mb) * nx; B.vz += (j / mb) * nz;
        if (-rv > 4) this.ev({ t: 'bump', a: A.i, b: B.i, pow: Math.min(1, -rv / 14), x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 + 0.5, z: (A.z + B.z) / 2 });
      }
      if (A.mokaT > 0 && B.mokaT <= 0) this.hit(B, 'spin', A.i);
      else if (B.mokaT > 0 && A.mokaT <= 0) this.hit(A, 'spin', B.i);
      else if (this.battle) {
        // ramming with a turbo steals a balloon
        if (A.boostT > 0 && B.boostT <= 0 && B.invT <= 0 && this.hit(B, 'spin', A.i)) { if (A.balloons < 5) { A.balloons++; this.ev({ t: 'steal', k: A.i, from: B.i, balloon: true }); } }
        else if (B.boostT > 0 && A.boostT <= 0 && A.invT <= 0 && this.hit(A, 'spin', B.i)) { if (B.balloons < 5) { B.balloons++; this.ev({ t: 'steal', k: B.i, from: A.i, balloon: true }); } }
      }
    }
  }
  rubberBand() {
    const H = this.humans.filter((k) => !k.finished);
    const ref = H.length ? Math.max(...H.map((k) => k.dist)) : null;
    for (const k of this.karts) {
      if (k.human >= 0) continue;
      const base = (this.cls.pace ?? 1) * (0.955 + 0.06 * k.ai.skill);
      if (ref == null) { k.rubber = base; continue; }
      const gap = (k.dist - ref) / 140; // + = AI ahead of the best human
      k.rubber = base * (1 - clamp(gap, -1, 1) * this.cls.rubber * (gap > 0 ? 1 : (this.cls.catchup ?? 1.4)));
    }
  }
  standings() {
    const K = this.karts.slice();
    if (this.battle) K.sort((a, b) => (a.out - b.out) || (b.balloons - a.balloons) || (b.hits - a.hits) || ((b.outT || 0) - (a.outT || 0)) || a.i - b.i);
    else K.sort((a, b) => (b.finished - a.finished) || (a.finished ? a.finishT - b.finishT : b.dist - a.dist) || a.i - b.i);
    K.forEach((k, i) => { if (k.place !== i + 1 && !this.battle && i < k.place - 1 && this.state === 'race') this.ev({ t: 'pass', k: k.i, place: i + 1 }); k.place = i + 1; });
    this.order = K;
  }
  checkEnd() {
    if (this.state !== 'race') return;
    const H = this.humans;
    if (this.battle) {
      const alive = this.karts.filter((k) => !k.out);
      const humansAlive = H.filter((k) => !k.out);
      if (alive.length <= 1 || this.t >= this.timeLimit || (H.length && !humansAlive.length) || (H.length > 1 && humansAlive.length === 1 && alive.length === 1)) this.finish();
      return;
    }
    const allFinished = this.karts.every((k) => k.finished);
    if (allFinished || (H.length && H.every((k) => k.finished)) || this.t > 900) this.finish();
  }
  finish() {
    this.state = 'done'; this.endT = this.t;
    if (!this.battle) {
      // karts still racing get an estimated time from their pace
      const L = this.world.len * this.laps;
      for (const k of this.karts) if (!k.finished) { const pace = Math.max(12, k.dist / Math.max(1, this.t)); k.estT = this.t + Math.max(0, L - k.dist) / pace; k.finishT = k.estT; k.finished = true; k.estimated = true; k.auto = true; }
      this.order = this.karts.slice().sort((a, b) => a.finishT - b.finishT || a.i - b.i);
      this.order.forEach((k, i) => { k.place = i + 1; });
    }
    this.ev({ t: 'done' });
  }

  // ───────── AI
  ai(k, dt) {
    const inp = k.input, A = k.ai;
    if (this.state === 'count') { inp.thr = k.thrAt >= 0 ? 1 : 0; return; }
    if (this.battle) return this.aiBattle(k, dt);
    const W = this.world, main = W.main, skill = A.skill;
    const prog = k.lastP ?? 0, sp = Math.max(0, k.fwd);
    // lane: own preference, item boxes when empty-handed, dodge oil and bumpers
    A.laneT -= dt;
    let lane = A.lane;
    if (!k.item && k.roul <= 0) {
      let bd = 45, bl = null;
      for (const b of this.F.boxes) { if (b.t > 0 || b.s == null) continue; let d = b.s - prog; if (d < 0) d += W.len; if (d > 6 && d < bd) { bd = d; bl = b.lat; } }
      if (bl != null) lane = bl / (main.w[k.ni] / 2);
    }
    for (const o of this.oils) { const q = main.nearest(o.x, o.z, k.ni, {}); let d = q.s - prog; if (d < 0) d += W.len; if (d > 2 && d < 26) { const ol = q.lat / (main.w[k.ni] / 2); if (Math.abs(ol - lane) < 0.35) lane = ol > 0 ? ol - 0.5 : ol + 0.5; } }
    for (const b of this.F.bumpers) { let d = b.s - prog; if (d < 0) d += W.len; if (d > 0 && d < 22) { const q = main.nearest(b.x, b.z, k.ni, {}); const bl = q.lat / (main.w[k.ni] / 2); if (Math.abs(bl - lane) < 0.5) lane = bl > 0 ? bl - 0.6 : bl + 0.6; } }
    for (const m of this.F.muds) { if (m.ice) continue; const q = main.nearest(m.x, m.z, k.ni, {}); let d = q.s - prog; if (d < 0) d += W.len; if (d > 0 && d < 30) { const ml = q.lat / (main.w[k.ni] / 2); if (Math.abs(ml - lane) < 0.55) lane = ml > 0 ? ml - 0.7 : ml + 0.7; } }
    lane = clamp(lane, -0.75, 0.75);
    // take a shortcut? skilled drivers do, and anyone with a turbo in hand
    const look = 6 + sp * 0.5;
    let tx, tz;
    if (A.cut == null && W.paths.length > 1) {
      for (let c = 1; c < W.paths.length; c++) {
        const P = W.paths[c]; let d = P.sFrom % W.len - prog; if (d < -W.len / 2) d += W.len;
        if (d > 0 && d < 18 + sp * 0.4 && !A.cutSkip?.[c]) {
          const want = (skill > 0.55 && P.surf === 'dirt' && this.rand() < skill) || (k.item && (ITEMS[k.item].as || k.item) === 'peperoncino');
          if (want) A.cut = c; else { A.cutSkip = { ...(A.cutSkip || {}), [c]: true }; A.cutClear = this.t + 6; }
        }
      }
    }
    if (A.cutClear && this.t > A.cutClear) { A.cutSkip = null; A.cutClear = 0; }
    if (A.cut != null) {
      const P = W.paths[A.cut], q = P.nearest(k.x, k.z, -1, {});
      if (q.s > P.len - 6 || Math.abs(q.lat) > P.w[0] / 2 + 2.5) { A.cut = null; A.cutSkip = { ...(A.cutSkip || {}), [W.paths.indexOf(P)]: true }; A.cutClear = this.t + 8; }
      else { const a = q.s + look > P.len ? main.pointAt(P.sTo + (q.s + look - P.len)) : P.pointAt(q.s + look); tx = a.x; tz = a.z; if (k.item && (ITEMS[k.item].as || k.item) === 'peperoncino' && k.roul <= 0 && P.surf !== 'road' && k.boostT <= 0) this.aiUse(k); }
    }
    if (tx == null) {
      const wob = Math.sin(this.t * 0.7 + A.noise) * (1 - skill) * 0.25;
      const a = main.pointAt(prog + look, (lane + wob) * main.w[k.ni] / 2 * 0.9); tx = a.x; tz = a.z;
    }
    const ang = wrapA(Math.atan2(tx - k.x, tz - k.z) - k.h);
    let steer = clamp(-ang * 2.6, -1, 1);
    inp.thr = 1; inp.brk = 0;
    if (Math.abs(ang) > 1.7 && sp < 12) { inp.brk = 1; inp.thr = 0; steer = -steer; }
    // drift through long bends
    const bend = W.bendAhead(prog, 4, 30), now = W.bendAhead(prog, 0, 14);
    if (!k.drift && !k.air && Math.abs(bend) > 0.62 - skill * 0.15 && sp > 15 && A.driftCool <= 0 && Math.sign(-bend) === Math.sign(steer || -bend)) { inp.drift = 1; if (!k.prevDrift) steer = -Math.sign(bend); }
    else if (k.drift) {
      const want = skill > 0.75 ? 2 : skill > 0.4 ? 1 : 1;
      inp.drift = (Math.abs(now) > 0.22 && (k.dTier < want || Math.abs(now) > 0.4)) ? 1 : 0;
      if (Math.sign(-now) !== k.drift && Math.abs(now) > 0.2) inp.drift = 0;
      if (!inp.drift) A.driftCool = 0.6;
    } else inp.drift = 0;
    A.driftCool = (A.driftCool || 0) - dt;
    // mistakes on low skill
    if (this.rand() < (1 - skill) * 0.004) A.wobbleT = 0.4;
    if (A.wobbleT > 0) { A.wobbleT -= dt; steer += Math.sin(this.t * 13) * 0.6; }
    inp.steer = clamp(steer, -1, 1);
    // stuck: back up
    if (k.stuckT > 1.4) { A.revT = 0.9; k.stuckT = 0.5; }
    if (A.revT > 0) { A.revT -= dt; inp.thr = 0; inp.brk = 1; inp.steer = -inp.steer; inp.drift = 0; }
    // items
    if (k.item && k.roul <= 0) { A.itemWait -= dt; if (A.itemWait <= 0) this.aiItems(k); }
    inp.item = 0;
  }
  aiUse(k, back = false) { k.input.back = back ? 1 : 0; this.useItem(k); k.input.back = 0; k.ai.itemWait = 0.5 + this.rand() * (2.5 - k.ai.skill * 1.5); }
  aiItems(k) {
    const id = ITEMS[k.item].as || k.item, A = k.ai;
    const ahead = this.targetAhead(k, 60);
    const behind = this.karts.find((o) => o !== k && !o.out && (this.battle ? Math.hypot(o.x - k.x, o.z - k.z) < 14 && Math.abs(wrapA(Math.atan2(o.x - k.x, o.z - k.z) - k.h)) > 2.2 : k.dist - o.dist > 1 && k.dist - o.dist < 18));
    const aim = (o) => o && Math.abs(wrapA(Math.atan2(o.x - k.x, o.z - k.z) - k.h)) < 0.25 && Math.hypot(o.x - k.x, o.z - k.z) < 32;
    const incoming = this.proj.some((p) => p.type === 'ricciolo' && p.target === k.i && Math.hypot(p.x - k.x, p.z - k.z) < 25);
    switch (id) {
      case 'peperoncino': if (k.surf !== 'road' || (Math.abs(this.battle ? 0 : this.world.bendAhead(k.lastP, 0, 30)) < 0.25)) this.aiUse(k); break;
      case 'olio': if (behind || A.itemWait < -6) this.aiUse(k, true); break;
      case 'bomba': if (aim(ahead)) this.aiUse(k); else if (behind && this.rand() < 0.3) this.aiUse(k, true); else if (A.itemWait < -8) this.aiUse(k); break;
      case 'ricciolo': if (ahead && (this.battle ? aim(ahead) || Math.hypot(ahead.x - k.x, ahead.z - k.z) < 40 : true)) this.aiUse(k); else if (behind && this.rand() < 0.4) this.aiUse(k, true); else if (A.itemWait < -10) this.aiUse(k); break;
      case 'scudo': if (incoming || A.itemWait < -4 || this.battle) this.aiUse(k); break;
      case 'calamita': if (ahead && Math.hypot(ahead.x - k.x, ahead.z - k.z) < 45) this.aiUse(k); break;
      default: this.aiUse(k);
    }
  }
  aiBattle(k, dt) {
    const inp = k.input, A = k.ai;
    if (k.out) { inp.thr = 0; return; }
    A.retarget = (A.retarget || 0) - dt;
    if (A.retarget <= 0 || !A.target || A.target.out) {
      A.retarget = 2 + this.rand() * 2;
      let best = null, bd = 1e9;
      for (const o of this.karts) { if (o === k || o.out) continue; const d = Math.hypot(o.x - k.x, o.z - k.z) * (o.human >= 0 ? 0.8 : 1); if (d < bd) { bd = d; best = o; } }
      A.target = best;
    }
    let tx, tz;
    const wantBox = !k.item && k.roul <= 0;
    if (wantBox) {
      let bd = 1e9; for (const b of this.F.boxes) { if (b.t > 0) continue; const d = Math.hypot(b.x - k.x, b.z - k.z); if (d < bd) { bd = d; tx = b.x; tz = b.z; } }
    }
    if (tx == null && A.target) {
      const o = A.target; const id = k.item ? (ITEMS[k.item].as || k.item) : null;
      if (id === 'olio' || (k.balloons <= 1 && !id)) { tx = k.x + (k.x - o.x); tz = k.z + (k.z - o.z); } // run away
      else { tx = o.x + o.vx * 0.4; tz = o.z + o.vz * 0.4; }
    }
    if (tx == null) { tx = 0; tz = 0; }
    // keep away from walls and pillars
    const W = this.world, S = W.size;
    let ax = tx - k.x, az = tz - k.z; const al = Math.hypot(ax, az) || 1; ax /= al; az /= al;
    const fx = Math.sin(k.h), fz = Math.cos(k.h);
    for (const p of W.pillars) { const dx = p.x - k.x, dz = p.z - k.z, d = Math.hypot(dx, dz); const fwdD = dx * fx + dz * fz; if (fwdD > 0 && d < p.r + 9) { const side = -dx * fz + dz * fx; const push = (p.r + 9 - d) / 9; ax += -fz * Math.sign(side || 1) * push * 1.6; az += fx * Math.sign(side || 1) * push * 1.6; } }
    const edge = W.round ? S - Math.hypot(k.x, k.z) : S - Math.max(Math.abs(k.x), Math.abs(k.z));
    if (edge < 10) { ax += -k.x / S * (10 - edge) * 0.25; az += -k.z / S * (10 - edge) * 0.25; }
    const ang = wrapA(Math.atan2(ax, az) - k.h);
    inp.steer = clamp(-ang * 2.4, -1, 1); inp.thr = 1; inp.brk = 0; inp.drift = 0;
    if (Math.abs(ang) > 2.2 && Math.abs(k.fwd) < 6) { inp.thr = 0; inp.brk = 1; inp.steer = -inp.steer; }
    if (k.stuckT > 1.2) { A.revT = 0.8; k.stuckT = 0.3; }
    if (A.revT > 0) { A.revT -= dt; inp.thr = 0; inp.brk = 1; inp.steer = -inp.steer; }
    if (k.item && k.roul <= 0) { A.itemWait -= dt; if (A.itemWait <= 0) this.aiItems(k); }
  }

  // ───────── info for HUD / tests
  summary() {
    return {
      state: this.state, t: +this.t.toFixed(2), count: this.countT,
      karts: this.karts.map((k) => ({ i: k.i, name: k.name, human: k.human, place: k.place, lap: Math.min(k.lap, this.laps), dist: +k.dist.toFixed(1), finished: k.finished, finishT: k.finishT ? +k.finishT.toFixed(2) : 0, item: k.item, coins: k.coins, balloons: k.balloons, out: k.out, x: +k.x.toFixed(1), z: +k.z.toFixed(1), y: +k.y.toFixed(2), sp: +k.fwd.toFixed(1) })),
    };
  }
}
