// Festa Baso — 3D views of the arena minigames. Reused art: Serpentone heads and hats, Bastione keep / gates /
// pads / towers (src/bastione/models.js + data.js), Orda bean figures for players and the red invaders.
import { THREE, partyScene, Figures, Confetti, mesh, lambert } from '../stage.js';
import { buildHead } from '../../serpentone/looks.js';
import { keepModel, gateModel, padModel, towerModel } from '../../bastione/models.js';
import { TOWERS } from '../../bastione/data.js';
import { VO_KINDS } from '../mini/arena.js';

const C = (c) => new THREE.Color(c);
const faceRot = (dx, dz) => Math.atan2(dx, dz);

// ───────── Mini voragine
export function voragine(stage, sim, ctx) {
  const scene = partyScene(stage, { sky: '#bfe4ff', ground: '#9aa3ad', size: 40 });
  const plaza = mesh(new THREE.BoxGeometry(sim.W * 2 + 2, 0.2, sim.H * 2 + 2), lambert('#d9d2c3'), 0, -0.08, 0, false); scene.add(plaza);
  const grid = new THREE.GridHelper(sim.W * 2, 22, '#bcb3a2', '#bcb3a2'); grid.scale.z = sim.H / sim.W; grid.position.y = 0.03; scene.add(grid);
  const geos = [new THREE.ConeGeometry(0.3, 0.7, 10).translate(0, 0.35, 0), new THREE.BoxGeometry(1.1, 0.45, 0.4).translate(0, 0.22, 0), new THREE.ConeGeometry(0.8, 2.2, 8).translate(0, 1.4, 0),
    new THREE.BoxGeometry(1.2, 0.8, 2.2).translate(0, 0.45, 0), new THREE.BoxGeometry(1.6, 1.5, 3).translate(0, 0.8, 0), new THREE.BoxGeometry(3.6, 2.8, 3.6).translate(0, 1.4, 0)];
  const cols = ['#ff8a1f', '#8a5a34', '#2f9a44', '#ff3b5c', '#f2f2f2', '#ffcf5a'];
  const inst = geos.map((g, k) => { const m = new THREE.InstancedMesh(g, lambert('#ffffff'), sim.o.length); m.castShadow = true; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(sim.o.length * 3), 3); scene.add(m); return m; });
  const holes = ctx.players.map((p) => {
    const g = new THREE.Group();
    const d = mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ color: '#08080c' }), 0, 0.05, 0, false); d.rotation.x = -Math.PI / 2; g.add(d);
    const r = mesh(new THREE.TorusGeometry(1, 0.08, 6, 40), new THREE.MeshBasicMaterial({ color: p.sc }), 0, 0.06, 0, false); r.rotation.x = Math.PI / 2; g.add(r);
    scene.add(g); return g;
  });
  const dm = new THREE.Object3D(), fx = new Confetti(scene), col = new THREE.Color();
  return {
    scene,
    update(dt) {
      const cnt = geos.map(() => 0);
      for (const o of sim.o) {
        let x = o.x, z = o.y, y = 0, s = 1;
        if (!o.alive) { const a = sim.t - o.t; if (a > 0.5) continue; const h = sim.h[o.by]; s = 1 - a * 1.8; x += (h.x - x) * a * 2; z += (h.y - z) * a * 2; y = -a * 6; }
        const k = o.k, i = cnt[k]++;
        dm.position.set(x, y, z); dm.rotation.set(0, o.rot, 0); dm.scale.setScalar(Math.max(0.01, s)); dm.updateMatrix(); inst[k].setMatrixAt(i, dm.matrix);
        col.set(k === 3 ? ['#ff3b5c', '#2f8cff', '#ffc21a', '#7ddc1f'][o.id % 4] : cols[k]); inst[k].setColorAt(i, col);
      }
      inst.forEach((m, k) => { m.count = cnt[k]; m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; });
      sim.h.forEach((h, i) => { holes[i].position.set(h.x, 0, h.y); holes[i].scale.setScalar(h.r); });
      for (const e of sim.events.splice(0)) if (e.type === 'gulp') { const h = sim.h[e.i]; fx.burst(h.x, 0.5, h.y, ctx.players[e.i].sc, 40, 6); }
      fx.update(dt);
      stage.frame(0, 0, sim.W + 1, sim.H + 1, 1.0);
    },
    tags: () => sim.h.map((h) => [h.x, 1.4, h.y]),
  };
}

// ───────── Arena dei serpenti
export function serpenti(stage, sim, ctx) {
  const scene = partyScene(stage, { sky: '#2a8a3a', ground: '#3f9a3a', size: 30 });
  const floor = mesh(new THREE.CircleGeometry(sim.RA, 64), lambert('#5fc04a'), 0, 0.02, 0, false); floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const rim = mesh(new THREE.TorusGeometry(sim.RA, 0.5, 8, 72), lambert('#ffd23f'), 0, 0.3, 0); rim.rotation.x = Math.PI / 2; scene.add(rim);
  const CAP = 4 * 160;
  const body = new THREE.InstancedMesh(new THREE.SphereGeometry(0.42, 10, 8), new THREE.MeshPhongMaterial({ color: '#ffffff', shininess: 60 }), CAP);
  body.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3), 3); body.castShadow = true; scene.add(body);
  const food = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.28, 1), new THREE.MeshBasicMaterial({ color: '#ffffff' }), sim.food.length);
  food.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(sim.food.length * 3), 3); scene.add(food);
  const heads = ctx.players.map((p) => { const h = buildHead(p.sc, p.hat, p.accent); h.g.scale.setScalar(0.55); scene.add(h.g); return h; });
  const pal = ['#ff4d6d', '#ffd23f', '#2ec4ff', '#9b5cff', '#ff9a1c', '#ffffff'].map(C);
  const dm = new THREE.Object3D(), fx = new Confetti(scene);
  return {
    scene,
    update(dt) {
      let k = 0; const t = stage.uTime.value;
      sim.s.forEach((s, i) => {
        const c = C(ctx.players[i].sc), c2 = c.clone().offsetHSL(0, 0, 0.12);
        heads[i].g.visible = s.dead <= 0;
        if (s.dead > 0) return;
        const n = s.pts.length;
        for (let j = 0; j < n - 1 && k < CAP; j += 1) { const p = s.pts[j]; const sc = 0.55 + 0.45 * Math.min(1, (j + 1) / 6); dm.position.set(p.x, 0.4 * sc, p.y); dm.scale.setScalar(sc); dm.updateMatrix(); body.setMatrixAt(k, dm.matrix); body.setColorAt(k, (j >> 1) % 2 ? c : c2); k++; }
        heads[i].g.position.set(s.x, 0.45, s.y); heads[i].g.rotation.y = -s.h;
        heads[i].g.visible = s.inv <= 0 || Math.floor(t * 10) % 2 === 0;
      });
      body.count = k; body.instanceMatrix.needsUpdate = true; body.instanceColor.needsUpdate = true;
      sim.food.forEach((f, j) => { dm.position.set(f.x, 0.35 + Math.sin(t * 3 + j) * 0.08, f.y); dm.scale.setScalar(f.alive ? 1 : 0.001); dm.rotation.set(t, t * 0.7, 0); dm.updateMatrix(); food.setMatrixAt(j, dm.matrix); food.setColorAt(j, pal[f.c]); });
      food.instanceMatrix.needsUpdate = true; food.instanceColor.needsUpdate = true; dm.rotation.set(0, 0, 0);
      for (const e of sim.events.splice(0)) if (e.type === 'crash') fx.burst(e.x, 0.8, e.y, ctx.players[e.i].sc, 40, 6);
      fx.update(dt);
      stage.frame(0, 0, sim.RA + 1, sim.RA + 1, 1.05);
    },
    tags: () => sim.s.map((s) => [s.x, 1.6, s.y]),
  };
}

// ───────── Pittura del territorio
export function territorio(stage, sim, ctx) {
  const scene = partyScene(stage, { sky: '#d6f0ff', ground: '#c9d6e6', size: 34 });
  const N = sim.GW * sim.GH, Cc = sim.C;
  const tiles = new THREE.InstancedMesh(new THREE.BoxGeometry(Cc * 0.94, 0.25, Cc * 0.94), lambert('#ffffff'), N); tiles.receiveShadow = true; scene.add(tiles);
  tiles.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
  const dm = new THREE.Object3D(), base = C('#f3f5f8'), wall = C('#3f8a3a'), pc = ctx.players.map((p) => C(p.sc));
  for (let c = 0; c < N; c++) { const x = ((c % sim.GW) - sim.GW / 2 + 0.5) * Cc, z = (Math.floor(c / sim.GW) - sim.GH / 2 + 0.5) * Cc; const wl = sim.own[c] === -2; dm.position.set(x, wl ? 0.6 : 0.12, z); dm.scale.set(1, wl ? 5 : 1, 1); dm.updateMatrix(); tiles.setMatrixAt(c, dm.matrix); }
  const figs = new Figures(stage, scene, ctx.players, { scale: 2.5 });
  const fx = new Confetti(scene); let ver = -1; const last = ctx.players.map(() => [0, 0]);
  return {
    scene,
    update(dt) {
      if (ver !== sim.ver) { ver = sim.ver; for (let c = 0; c < N; c++) { const o = sim.own[c]; tiles.setColorAt(c, o === -2 ? wall : o >= 0 ? pc[o] : base); } tiles.instanceColor.needsUpdate = true; }
      sim.p.forEach((p, i) => { const dx = p.x - last[i][0], dz = p.y - last[i][1], mv = Math.hypot(dx, dz) > 0.001; if (mv) last[i][2] = faceRot(dx, dz); last[i][0] = p.x; last[i][1] = p.y; figs.set(i, p.x, 0.25, p.y, last[i][2] || 0, mv ? 1 : 0); });
      figs.commit(0);
      for (const e of sim.events.splice(0)) if (e.type === 'splash') fx.burst(e.x, 0.6, e.y, ctx.players[e.i].sc, 60, 7);
      fx.update(dt);
      stage.frame(0, 0, sim.GW * Cc / 2 + 0.5, sim.GH * Cc / 2 + 0.5, 1.0);
    },
    tags: () => sim.p.map((p) => [p.x, 3.2, p.y]),
  };
}

// ───────── Bastione unito
export function bastione(stage, sim, ctx) {
  const scene = partyScene(stage, { sky: '#a6dcff', ground: '#7dbb55', size: 30 });
  const keep = keepModel(); keep.scale.setScalar(0.8); scene.add(keep);
  for (const [x, z] of sim.gates) { const g = gateModel(); g.position.set(x * 1.08, 0, z * 1.08); g.rotation.y = faceRot(-x, -z); scene.add(g); }
  const towers = sim.pads.map((q) => { const p = padModel(); p.position.set(q.x, 0, q.y); scene.add(p); return null; });
  const roads = mesh(new THREE.BoxGeometry(36, 0.04, 2.4), lambert('#d9c49a'), 0, 0.02, 0, false); scene.add(roads); const r2 = roads.clone(); r2.rotation.y = Math.PI / 2; scene.add(r2);
  const ECAP = 90, figs = new Figures(stage, scene, ctx.players, { extras: ECAP, scale: 2.1 });
  const red = C('#e0303f'), dark = C('#8a1020');
  const tr = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: '#fff27a' })); tr.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(200 * 6), 3)); scene.add(tr);
  const fx = new Confetti(scene); const last = ctx.players.map(() => [0, 0, 0]);
  return {
    scene,
    update(dt) {
      sim.pads.forEach((q, k) => { if (q.owner >= 0 && !towers[k]) { const def = TOWERS[(q.owner + k) % 4]; const t = towerModel(def, 0, -1); t.position.set(q.x, 0.2, q.y); t.scale.setScalar(0.8); scene.add(t); towers[k] = t; fx.burst(q.x, 2, q.y, ctx.players[q.owner].sc, 40, 5); } });
      sim.p.forEach((p, i) => { const dx = p.x - last[i][0], dz = p.y - last[i][1], mv = Math.hypot(dx, dz) > 0.001; if (mv) last[i][2] = faceRot(dx, dz); last[i][0] = p.x; last[i][1] = p.y; figs.set(i, p.x, 0, p.y, last[i][2], mv ? 1 : 0); });
      let k = 0;
      for (const e of sim.en) { if (e.dead || k >= ECAP) continue; figs.extraSet(k++, e.x, 0, e.y, faceRot(-e.x, -e.y), e.big ? dark : red, 1, e.big ? 1.5 : 1, e.id * 0.31); }
      figs.commit(k);
      const a = tr.geometry.attributes.position; let s = 0;
      for (const q of sim.shots) { if (s >= 200) break; a.array.set([q.x, 1.2, q.y, q.tx, 0.8, q.ty], s * 6); s++; }
      tr.geometry.setDrawRange(0, s * 2); a.needsUpdate = true;
      for (const e of sim.events.splice(0)) { if (e.type === 'kill') fx.burst(e.x, 0.6, e.y, '#ff5a5a', e.big ? 24 : 8, 4); if (e.type === 'blast') fx.burst(e.x, 0.5, e.y, ctx.players[e.i].sc, 60, 9); if (e.type === 'keep') fx.burst(e.x, 1, e.y, '#ffffff', 12, 3); }
      fx.update(dt);
      stage.frame(0, 0, sim.RA + 1, sim.RA + 1, 1.0);
    },
    tags: () => sim.p.map((p) => [p.x, 2.8, p.y]),
    top: () => `Castello ${Math.max(0, Math.round(sim.keep))}%`,
  };
}
