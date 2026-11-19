// Festa Baso — 3D views of the action minigames. Reused art: Orda bean figures (stage.Figures), Kart Baso
// karts, balloons and curly shots (src/kart/models.js), Scontro Totale bangers (src/derby/cars.js).
import { THREE, partyScene, Figures, Confetti, mesh, lambert } from '../stage.js';
import { makeKart, makeBalloon, makeRicciolo } from '../../kart/models.js';
import { buildBanger } from '../../derby/cars.js';
import { gateText } from '../mini/action.js';

const C = (c) => new THREE.Color(c);
const faceRot = (dx, dz) => Math.atan2(dx, dz);
function textTex(text, bg, fg = '#fff', w = 256, h = 128) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = fg; g.font = `900 ${h * 0.62}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 4);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ───────── Tiro alla fune
export function tiro(stage, sim, ctx) {
  const scene = partyScene(stage, { sky: '#9fdcff', ground: '#86cf63', size: 30 });
  const mud = mesh(new THREE.CylinderGeometry(4, 4, 0.06, 32), lambert('#7a4a2a'), 0, 0.01, 0, false); mud.scale.z = 0.6; scene.add(mud);
  for (const s of [-1, 1]) { const l = mesh(new THREE.BoxGeometry(0.25, 0.04, 6), lambert('#ffffff'), s * 6, 0.03, 0, false); scene.add(l); }
  const rope = mesh(new THREE.CylinderGeometry(0.09, 0.09, 30, 8).rotateZ(Math.PI / 2), lambert('#d8b878'), 0, 0.75, 0); scene.add(rope);
  const flag = mesh(new THREE.ConeGeometry(0.35, 0.9, 4), lambert('#ff3b5c'), 0, 0.35, 0); scene.add(flag);
  const teamCol = [C('#ff5a5a'), C('#3f8cff')];
  const figs = new Figures(stage, scene, ctx.players, { extras: 16, scale: 2.2 });
  const slots = [[], []]; sim.team.forEach((t, i) => slots[t].push(i));
  const fx = new Confetti(scene);
  return {
    scene,
    update(dt) {
      const off = sim.rope * 6;
      rope.position.x = off; flag.position.x = off;
      for (let t = 0; t < 2; t++) {
        const s = t ? 1 : -1;
        slots[t].forEach((i, k) => figs.set(i, off + s * (2.6 + k * 1.9), 0, (k % 2 ? 0.35 : -0.35), faceRot(-s, 0) + s * 0.25, Math.min(1, sim.rate[i] / 3), 1));
        for (let k = 0; k < 8; k++) figs.extraSet(t * 8 + k, off + s * (2.6 + (slots[t].length + k) * 1.35), 0, (k % 2 ? 0.4 : -0.4), faceRot(-s, 0) + s * 0.3, teamCol[t], 0.6 + 0.4 * Math.sin(stage.uTime.value * 3 + k), 1);
      }
      figs.commit(16);
      for (const e of sim.events.splice(0)) if (e.type === 'end' && sim.win >= 0) fx.burst((sim.win ? 1 : -1) * 8, 2, 0, sim.win ? '#3f8cff' : '#ff5a5a', 80, 8);
      fx.update(dt);
      stage.frame(0, 0, 13, 4.5, 0.62, 0.5);
    },
    tags: () => ctx.players.map((p, i) => { const s = sim.team[i] ? 1 : -1, k = (sim.team[i] ? slots[1] : slots[0]).indexOf(i); return [sim.rope * 6 + s * (2.6 + k * 1.9), 3.4, k % 2 ? 0.35 : -0.35]; }),
  };
}

// ───────── Corsa delle porte
export function porte(stage, sim, ctx) {
  const n = sim.n, W = sim.W, gap = 2.2, laneX = (k) => (k - (n - 1) / 2) * (W + gap);
  const scene = partyScene(stage, { sky: '#a8e0ff', ground: '#6cc35a', size: 60 });
  for (let k = 0; k < n; k++) {
    const lane = mesh(new THREE.BoxGeometry(W, 0.2, sim.L + 20), lambert(k % 2 ? '#dfe7f2' : '#eef3f9'), laneX(k), 0.1, -sim.L / 2 + 5, false); scene.add(lane);
    for (const s of [-1, 1]) scene.add(mesh(new THREE.BoxGeometry(0.3, 0.5, sim.L + 20), lambert(ctx.players[k].sc), laneX(k) + s * (W / 2 + 0.15), 0.25, -sim.L / 2 + 5));
  }
  const goodM = (g) => (g.t === 'add' || g.t === 'mul' ? '#26c95a' : '#ff4d4d');
  const saws = [];
  for (const row of sim.rows) {
    for (let k = 0; k < n; k++) {
      if (row.kind === 'gate') row.g.forEach((g, s) => {
        const p = new THREE.Mesh(new THREE.PlaneGeometry(W / 2 - 0.3, 2.4), new THREE.MeshBasicMaterial({ map: textTex(gateText(g), goodM(g)), transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
        p.position.set(laneX(k) + (s ? W / 4 : -W / 4), 1.4, -row.z); scene.add(p);
      });
      else { const saw = mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.3, 14).rotateX(Math.PI / 2), lambert('#c0c4cc', { emissive: '#330000' }), laneX(k), 1.1, -row.z); scene.add(saw); saws.push({ m: saw, row, k }); }
    }
  }
  const fin = mesh(new THREE.BoxGeometry(n * (W + gap), 0.25, 1.4), new THREE.MeshLambertMaterial({ map: textTex('ARRIVO', '#111', '#fff', 512, 64) }), 0, 0.2, -sim.L, false); scene.add(fin);
  const per = 36, figs = new Figures(stage, scene, ctx.players, { extras: n * per, scale: 1.2 });
  const fx = new Confetti(scene);
  return {
    scene,
    update(dt) {
      const d = sim.d, t = stage.uTime.value;
      for (const s of saws) { s.m.position.x = laneX(s.k) + sim.sawX(s.row, sim.t); s.m.rotation.z += dt * 8; }
      for (let i = 0; i < n; i++) {
        const cx = laneX(i) + sim.x[i], cnt = Math.min(per, sim.count[i] - 1);
        figs.set(i, cx, 0.2, -d - 0.6, Math.PI, 1);
        const col = C(ctx.players[i].color);
        for (let k = 0; k < per; k++) {
          if (k >= cnt) { figs.extraSet(i * per + k, 0, -50, 0, 0, col, 0, 0.001); continue; }
          const a = k * 2.4, r = 0.45 * Math.sqrt(k + 1);
          figs.extraSet(i * per + k, cx + Math.cos(a) * Math.min(r, W / 2 - 1), 0.2, -d + 0.6 + Math.abs(Math.sin(a)) * r * 0.8, Math.PI, col, 1, 1, k * 0.37);
        }
      }
      figs.commit(n * per);
      for (const e of sim.events.splice(0)) {
        if (e.type === 'gate') fx.burst(laneX(e.i) + sim.x[e.i], 1.5, -d, e.good ? '#5dff8a' : '#ff5a5a', 14, 4);
        if (e.type === 'saw') fx.burst(laneX(e.i) + sim.x[e.i], 1, -d, '#ffffff', 20, 5);
      }
      fx.update(dt);
      const span = n * (W + gap) / 2;
      const cam = stage.camera, f = Math.tan((cam.fov * Math.PI) / 360), dist = Math.max(10, span * 1.15 / (f * cam.aspect));
      cam.position.set(0, dist * 0.62, -d + dist * 0.62); cam.lookAt(0, 0, -d - 10 - Math.sin(t * 0.2));
    },
    tags: () => ctx.players.map((p, i) => [laneX(i) + sim.x[i], 3, -sim.d]),
  };
}

// ───────── karts (shared by the sprint and the balloon battle)
function karts(scene, ctx, scale = 1) {
  return ctx.players.map((p, i) => { const k = makeKart(p.kart, { num: i + 1 }); k.scale.setScalar(scale); k.traverse((o) => { if (o.isMesh) o.castShadow = true; }); scene.add(k); return k; });
}
function trackRibbon(sim, w, y, color) {
  const pos = [], idx = [], N = 220;
  for (let k = 0; k <= N; k++) {
    const c = sim.at((k / N) * sim.P), nx = -Math.sin(c.h), nz = Math.cos(c.h);
    pos.push(c.x + nx * w / 2, y, c.y + nz * w / 2, c.x - nx * w / 2, y, c.y - nz * w / 2);
    if (k < N) { const a = k * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, lambert(color, { side: THREE.DoubleSide })); m.receiveShadow = true; return m;
}
export function kart(stage, sim, ctx) {
  const scene = partyScene(stage, { sky: '#7cc8ff', ground: '#5cc24a', size: 50 });
  scene.add(trackRibbon(sim, sim.TW + 1.2, 0.03, '#ffffff'), trackRibbon(sim, sim.TW + 0.6, 0.04, '#ff3b3b'), trackRibbon(sim, sim.TW, 0.05, '#5d6270'));
  const start = sim.at(0); const sl = mesh(new THREE.BoxGeometry(0.8, 0.02, sim.TW), new THREE.MeshLambertMaterial({ map: textTex('', '#fff') }), start.x, 0.07, start.y, false); sl.material.color = C('#ffffff'); scene.add(sl);
  for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2; const tr = mesh(new THREE.ConeGeometry(1.2, 3, 7), lambert('#2f8a3a'), Math.cos(a) * 46, 1.5, Math.sin(a) * 26); scene.add(tr); }
  const ks = karts(scene, ctx, 1);
  const fx = new Confetti(scene);
  return {
    scene,
    update(dt) {
      sim.k.forEach((k, i) => { const m = ks[i]; m.position.set(k.x, 0.05, k.y); m.rotation.y = faceRot(Math.cos(k.h), Math.sin(k.h)); const tl = m.getObjectByName('tilt'); if (tl) tl.position.y = k.turbo > 0 ? Math.abs(Math.sin(stage.uTime.value * 30)) * 0.06 : 0; });
      for (const e of sim.events.splice(0)) { if (e.type === 'finish') { const k = sim.k[e.i]; fx.burst(k.x, 1.5, k.y, ctx.players[e.i].sc, 50, 7); } if (e.type === 'turbo') { const k = sim.k[e.i]; fx.burst(k.x, 0.6, k.y, '#ffb02e', 12, 3); } }
      fx.update(dt);
      stage.frame(0, 0, sim.L / 2 + sim.R + sim.TW, sim.R + sim.TW, 0.95);
    },
    tags: () => sim.k.map((k) => [k.x, 2.4, k.y]),
  };
}

// ───────── Battaglia dei palloncini
export function palloncini(stage, sim, ctx) {
  const scene = partyScene(stage, { sky: '#ffcf8a', ground: '#e8b46a', size: 40 });
  const floor = mesh(new THREE.CircleGeometry(sim.RA, 48), lambert('#5d6270'), 0, 0.03, 0, false); floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const wall = mesh(new THREE.TorusGeometry(sim.RA, 0.45, 8, 64), lambert('#ff3b6b'), 0, 0.3, 0); wall.rotation.x = Math.PI / 2; scene.add(wall);
  for (let k = 0; k < 4; k++) { const r = mesh(new THREE.TorusGeometry(4 + k * 4, 0.06, 4, 48), lambert('#ffffff'), 0, 0.04, 0, false); r.rotation.x = Math.PI / 2; scene.add(r); }
  const ks = karts(scene, ctx, 1);
  const balloons = ctx.players.map((p, i) => [0, 1, 2].map((b) => { const m = makeBalloon(p.sc); m.scale.setScalar(1.1); scene.add(m); return m; }));
  const pool = []; const fx = new Confetti(scene);
  return {
    scene,
    update(dt) {
      const t = stage.uTime.value;
      sim.k.forEach((k, i) => {
        const m = ks[i]; m.position.set(k.x, k.b > 0 ? 0.05 : -0.2, k.y); m.rotation.y = faceRot(Math.cos(k.h), Math.sin(k.h));
        m.visible = k.inv <= 0 || Math.floor(t * 12) % 2 === 0;
        balloons[i].forEach((b, j) => { b.visible = j < k.b; const a = k.h + Math.PI + (j - 1) * 0.5; b.position.set(k.x + Math.cos(a) * 1.3, 2.4 + Math.sin(t * 2 + j) * 0.15, k.y + Math.sin(a) * 1.3); });
      });
      while (pool.length < sim.shots.length) { const r = makeRicciolo(); scene.add(r); pool.push(r); }
      pool.forEach((r, j) => { const s = sim.shots[j]; r.visible = !!s; if (s) { r.position.set(s.x, 0.7, s.y); r.rotation.y = faceRot(s.vx, s.vy); r.children[0].rotation.z += dt * 14; } });
      for (const e of sim.events.splice(0)) if (e.type === 'pop') fx.burst(e.x, 2.4, e.y, ctx.players[e.i].sc, 30, 6);
      fx.update(dt);
      stage.frame(0, 0, sim.RA + 1, sim.RA + 1, 1.0);
    },
    tags: () => sim.k.map((k) => [k.x, 3.6, k.y]),
  };
}

// ───────── Autoscontro
export function autoscontro(stage, sim, ctx) {
  const scene = partyScene(stage, { sky: '#ffb36b', ground: false, size: 30 });
  const sea = mesh(new THREE.CircleGeometry(200, 32), new THREE.MeshLambertMaterial({ color: '#ff6a1a', emissive: '#ff3a00', emissiveIntensity: 0.5 }), 0, -3, 0, false); sea.rotation.x = -Math.PI / 2; scene.add(sea);
  const plat = mesh(new THREE.CylinderGeometry(1, 1, 1.2, 64), lambert('#7d8590'), 0, -0.6, 0); scene.add(plat);
  const rim = mesh(new THREE.TorusGeometry(1, 0.012, 6, 64), lambert('#ffd23f'), 0, 0.01, 0, false); rim.rotation.x = Math.PI / 2; scene.add(rim);
  const types = ['berlina', 'muscle', 'utilitaria', 'rally'];
  const cars = ctx.players.map((p, i) => { const c = buildBanger(types[i % 4], p.sc, i + 1, 3 + i, { clean: true }); const g = new THREE.Group(); g.add(c); c.scale.setScalar(0.52); c.traverse((o) => { if (o.isMesh) o.castShadow = true; }); scene.add(g); return g; });
  const fx = new Confetti(scene);
  return {
    scene,
    update(dt) {
      plat.scale.set(sim.R + 0.6, 1, sim.R + 0.6); rim.scale.set(sim.R + 0.6, sim.R + 0.6, 1);
      sim.c.forEach((c, i) => {
        const g = cars[i]; const falling = c.fall > 0;
        g.position.set(c.x, falling ? -(1.6 - c.fall) * 3 : 0, c.y); g.rotation.y = faceRot(Math.cos(c.h), Math.sin(c.h));
        g.visible = !falling || c.fall > 0.3; if (c.inv > 0) g.visible = Math.floor(stage.uTime.value * 12) % 2 === 0;
      });
      for (const e of sim.events.splice(0)) { if (e.type === 'bump') fx.burst(e.x, 1, e.y, '#ffd23f', 10 + e.power * 20, 4 + e.power * 4); if (e.type === 'fall') fx.burst(e.x, 0, e.y, '#ff8a3a', 30, 6); }
      fx.update(dt);
      stage.frame(0, 0, sim.R0 + 1, sim.R0 + 1, 0.95);
    },
    tags: () => sim.c.map((c) => [c.x, 2.6, c.y]),
  };
}
