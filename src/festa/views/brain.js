// Festa Baso — views of the skill / brain minigames. Golf draws Minigolf Baso's hole tiles in 3D; the puzzle
// and rhythm games draw one 2D panel per player over a 3D "party room" where the figures cheer.
import { THREE, partyScene, Figures, Confetti, mesh, lambert } from '../stage.js';
import { MEM_SYMS, OF_MAX } from '../mini/brain.js';
import { CARS, TIER_COLORS } from '../../officina/data.js';
import { EXITED } from '../../ingorgo/core.js';

const C = (c) => new THREE.Color(c);

// a festive backdrop: stage floor, bunting, the players' figures in a row (they hop when they score)
function room(stage, ctx, sky = '#ffd3e8') {
  const scene = partyScene(stage, { sky, ground: '#f5d7a8', size: 20 });
  const n = ctx.players.length;
  const st = mesh(new THREE.CylinderGeometry(9, 9, 0.5, 40), lambert('#ff7aa8'), 0, 0.25, 0); scene.add(st);
  const cols = ['#ff4d6d', '#ffd23f', '#2ec4ff', '#7ddc1f', '#9b5cff'];
  for (let k = 0; k < 22; k++) { const f = mesh(new THREE.ConeGeometry(0.35, 0.7, 3), lambert(cols[k % 5]), -11 + k, 5.4 - Math.sin((k / 21) * Math.PI) * 0.8, -6); f.rotation.x = Math.PI; scene.add(f); }
  const figs = new Figures(stage, scene, ctx.players, { scale: 2 });
  const hop = new Array(n).fill(0);
  const fx = new Confetti(scene);
  return {
    scene, figs, fx, hop,
    x: (i) => (i - (n - 1) / 2) * 3,
    tick(dt) {
      for (let i = 0; i < n; i++) { hop[i] = Math.max(0, hop[i] - dt * 2.2); figs.set(i, (i - (n - 1) / 2) * 3, 0.5 + Math.sin(hop[i] * Math.PI) * 1.2, 0, Math.sin(stage.uTime.value * 1.3 + i) * 0.3, hop[i] > 0 ? 1 : 0.15); }
      figs.commit(0); fx.update(dt);
      stage.frame(0, -1, 7.5, 5, 0.32, 1.2);
    },
    cheer(i, color) { hop[i] = 1; fx.burst((i - (n - 1) / 2) * 3, 3.2, 0, color || ctx.players[i].sc, 24, 5); },
  };
}
// one 2D canvas panel per player over the 3D view
function panels(ctx, cls = '') {
  const el = document.createElement('div'); el.className = `fz-panels n${ctx.players.length} ${cls}`;
  el.innerHTML = ctx.players.map((p, i) => `<div class="fz-panel" style="--c:${p.sc}"><canvas></canvas></div>`).join('');
  ctx.layer.appendChild(el);
  const cvs = [...el.querySelectorAll('canvas')];
  return {
    el, cvs,
    ctx2d(i) {
      const cv = cvs[i], r = cv.getBoundingClientRect(), d = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(r.width * d)), h = Math.max(1, Math.round(r.height * d));
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
      const g = cv.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, r.width, r.height);
      return { g, w: r.width, h: r.height };
    },
    dispose() { el.remove(); },
  };
}
const rr = (g, x, y, w, h, r) => { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); };

// ───────── Più vicino alla buca (3D green built from Minigolf's tiles)
export function golf(stage, sim, ctx) {
  const scene = partyScene(stage, { sky: '#9ad8ff', ground: '#4f9a3a', size: 14 });
  const hole = sim.g[0].sim.hole, S = 1;
  for (let r = 0; r < hole.H; r++) for (let c = 0; c < hole.W; c++) {
    const cell = hole.at(c, r); if (!cell || cell.t === '.') continue;
    const sand = cell.t === 's', blk = cell.t === 'X';
    scene.add(mesh(new THREE.BoxGeometry(S, blk ? 0.5 : 0.1, S), lambert(blk ? '#8a8f99' : sand ? '#f1d9a0' : (r + c) % 2 ? '#3fbf5a' : '#38b354'), c + 0.5, blk ? 0.2 : -0.05, r + 0.5, blk));
    if (cell.t === 'B') scene.add(mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.2, 16), lambert('#ff3b6b'), c + 0.5, 0.1, r + 0.5));
  }
  for (const [x, z, w, d] of [[hole.W / 2, -0.05, hole.W + 0.2, 0.1], [hole.W / 2, hole.H + 0.05, hole.W + 0.2, 0.1], [-0.05, hole.H / 2, 0.1, hole.H], [hole.W + 0.05, hole.H / 2, 0.1, hole.H]]) scene.add(mesh(new THREE.BoxGeometry(w, 0.16, d), lambert('#8a5a34'), x, 0.05, z));
  const cup = mesh(new THREE.CircleGeometry(0.16, 20), new THREE.MeshBasicMaterial({ color: '#111' }), sim.cup.x, 0.006, sim.cup.z, false); cup.rotation.x = -Math.PI / 2; scene.add(cup);
  const pole = mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.4), lambert('#ffffff'), sim.cup.x, 0.7, sim.cup.z); scene.add(pole);
  const flag = mesh(new THREE.PlaneGeometry(0.5, 0.3), lambert('#ff3b5c', { side: THREE.DoubleSide }), sim.cup.x + 0.25, 1.25, sim.cup.z, false); scene.add(flag);
  const balls = ctx.players.map((p) => { const b = mesh(new THREE.SphereGeometry(0.11, 16, 12), new THREE.MeshPhongMaterial({ color: p.sc, shininess: 80 }), 0, 0, 0); scene.add(b); return b; });
  const arrows = ctx.players.map((p) => { const a = mesh(new THREE.BoxGeometry(0.06, 0.02, 1).translate(0, 0, -0.5), new THREE.MeshBasicMaterial({ color: p.sc, transparent: true, opacity: 0.85 }), 0, 0.05, 0, false); scene.add(a); return a; });
  const figs = new Figures(stage, scene, ctx.players, { scale: 0.75 });
  const fx = new Confetti(scene);
  const n = ctx.players.length;
  return {
    scene,
    update(dt) {
      sim.g.forEach((g, i) => {
        const p = g.sim.p, off = (i - (n - 1) / 2) * 0.08;
        balls[i].position.set(p[0] + (g.state === 'aim' ? off : 0), p[1] + 0.05, p[2]);
        const a = arrows[i]; a.visible = g.state === 'aim';
        if (a.visible) { a.position.set(p[0] + off, 0.06, p[2]); a.rotation.y = -g.ang; a.scale.z = 0.4 + g.pow * 2.6; }
        figs.set(i, sim.tee[0] - 1.6 + i * 0.5 + (i >= 2 ? 1.9 : 0), 0, sim.tee[2] + 0.5, Math.PI, g.state === 'roll' ? 1 : 0);
      });
      figs.commit(0);
      for (const e of sim.events.splice(0)) if (e.type === 'holed') fx.burst(sim.cup.x, 0.5, sim.cup.z, ctx.players[e.i].sc, 60, 4);
      fx.update(dt);
      stage.frame(hole.W / 2, hole.H / 2 - 0.3, hole.W / 2 + 0.3, hole.H / 2 + 0.4, 1.05);
    },
    tags: () => sim.g.map((g) => [g.sim.p[0], 0.7, g.sim.p[2]]),
  };
}

// ───────── Ingorgo lampo
const KIND_COL = { eroe: '#ff3b3b', auto: '#2f8cff', camion: '#ffb02e', bus: '#7ddc1f' };
export function ingorgo(stage, sim, ctx) {
  const R = room(stage, ctx, '#ffe7b0'), P = panels(ctx);
  const cols = ['#2f8cff', '#ffb02e', '#7ddc1f', '#9b5cff', '#2ec4ff', '#ff7ab8', '#f0f0f0'];
  return {
    scene: R.scene,
    update(dt) {
      for (const e of sim.events.splice(0)) if (e.type === 'solved') R.cheer(e.i);
      R.tick(dt);
      sim.p.forEach((p, i) => {
        const { g, w, h } = P.ctx2d(i), { B } = sim.levels[p.k];
        const cs = Math.min((w - 20) / (B.w + 1.2), (h - 48) / (B.h + 0.6)), ox = (w - cs * B.w) / 2, oy = 34 + (h - 40 - cs * B.h) / 2;
        g.fillStyle = 'rgba(20,24,36,.82)'; rr(g, ox - 8, oy - 8, cs * B.w + 16, cs * B.h + 16, 12); g.fill();
        const hero = B.cars[B.hero], ex = hero.ax === 0 ? (hero.dir > 0 ? ox + cs * B.w + 2 : ox - 10) : ox + hero.fix * cs, ey = hero.ax === 0 ? oy + hero.fix * cs : (hero.dir > 0 ? oy + cs * B.h + 2 : oy - 10);
        g.fillStyle = '#ffd23f'; g.fillRect(ex, ey, hero.ax === 0 ? 8 : cs, hero.ax === 0 ? cs : 8);
        for (let y = 0; y < B.h; y++) for (let x = 0; x < B.w; x++) { g.fillStyle = B.walls[y * B.w + x] ? '#3f8a3a' : (x + y) % 2 ? '#3a4152' : '#424a5d'; g.fillRect(ox + x * cs + 1, oy + y * cs + 1, cs - 2, cs - 2); }
        B.cars.forEach((c, k) => {
          const pos = p.s[k]; if (pos === EXITED) return;
          const x = c.ax === 0 ? pos : c.fix, y = c.ax === 0 ? c.fix : pos, ww = c.ax === 0 ? c.len : 1, hh = c.ax === 0 ? 1 : c.len;
          g.fillStyle = c.hero ? '#ff3b3b' : cols[k % cols.length]; rr(g, ox + x * cs + 4, oy + y * cs + 4, ww * cs - 8, hh * cs - 8, cs * 0.22); g.fill();
          g.fillStyle = 'rgba(255,255,255,.55)'; const fx = c.ax === 0 ? (c.dir > 0 ? x + ww - 0.32 : x + 0.12) : x + 0.25, fy = c.ax === 0 ? y + 0.25 : (c.dir > 0 ? y + hh - 0.32 : y + 0.12);
          g.fillRect(ox + fx * cs, oy + fy * cs, cs * (c.ax === 0 ? 0.2 : 0.5), cs * (c.ax === 0 ? 0.5 : 0.2));
        });
        if (!ctx.players[i].cpu || true) { g.strokeStyle = ctx.players[i].sc; g.lineWidth = 4; rr(g, ox + p.cx * cs + 1, oy + p.cy * cs + 1, cs - 2, cs - 2, 6); g.stroke(); }
        g.fillStyle = '#fff'; g.font = '800 15px system-ui, sans-serif'; g.textAlign = 'center';
        g.fillText(`Ingorgo ${p.k + 1} · liberati ${p.solved}`, w / 2, 22);
        if (p.flash > 0) { g.fillStyle = `rgba(255,210,63,${p.flash})`; g.font = '900 28px system-ui, sans-serif'; g.fillText('Libero!', w / 2, oy + cs * B.h / 2); }
      });
    },
    dispose() { P.dispose(); },
  };
}

// ───────── Corsa all'officina
export function officina(stage, sim, ctx) {
  const R = room(stage, ctx, '#ffe2c4'), P = panels(ctx);
  return {
    scene: R.scene,
    update(dt) {
      for (const e of sim.events.splice(0)) if (e.type === 'merge' && e.t >= 4) R.cheer(e.i, TIER_COLORS[e.t - 1]);
      R.tick(dt);
      sim.p.forEach((p, i) => {
        const { g, w, h } = P.ctx2d(i), cs = Math.min((w - 20) / 4, (h - 50) / 3), ox = (w - cs * 4) / 2, oy = 36 + (h - 42 - cs * 3) / 2;
        g.fillStyle = 'rgba(20,24,36,.82)'; rr(g, ox - 8, oy - 8, cs * 4 + 16, cs * 3 + 16, 12); g.fill();
        for (let k = 0; k < 12; k++) {
          const x = ox + (k % 4) * cs, y = oy + Math.floor(k / 4) * cs, t = p.grid[k];
          g.fillStyle = '#2c3242'; rr(g, x + 3, y + 3, cs - 6, cs - 6, 8); g.fill();
          if (!t) continue;
          const col = TIER_COLORS[t - 1], up = p.held === k ? -6 : 0;
          g.fillStyle = col; rr(g, x + cs * 0.14, y + cs * 0.38 + up, cs * 0.72, cs * 0.28, cs * 0.1); g.fill();
          g.fillStyle = '#111'; for (const fx of [0.3, 0.7]) { g.beginPath(); g.arc(x + cs * fx, y + cs * 0.68 + up, cs * 0.08, 0, 7); g.fill(); }
          g.fillStyle = '#fff'; g.font = `900 ${Math.round(cs * 0.26)}px system-ui, sans-serif`; g.textAlign = 'center'; g.fillText(String(t), x + cs / 2, y + cs * 0.3 + up);
        }
        g.strokeStyle = ctx.players[i].sc; g.lineWidth = 4; rr(g, ox + p.cx * cs + 1, oy + p.cy * cs + 1, cs - 2, cs - 2, 9); g.stroke();
        const car = CARS[Math.min(CARS.length, p.best) - 1];
        g.fillStyle = '#fff'; g.font = '800 15px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText(`Livello ${p.best}/${OF_MAX} · ${car?.name || ''}`, w / 2, 22);
      });
    },
    dispose() { P.dispose(); },
  };
}

// ───────── Semaforo (3D gantry, five red lights)
export function riflessi(stage, sim, ctx) {
  const R = room(stage, ctx, '#cfe8ff');
  const gantry = new THREE.Group(); gantry.position.set(0, 4.4, -2.5); R.scene.add(gantry);
  gantry.add(mesh(new THREE.BoxGeometry(9, 1.6, 0.6), lambert('#1b1e26')));
  const on = new THREE.MeshBasicMaterial({ color: '#ff2020' }), off = lambert('#3a0c0c'), go = new THREE.MeshBasicMaterial({ color: '#2fff6a' });
  const lights = [0, 1, 2, 3, 4].map((k) => { const m = mesh(new THREE.SphereGeometry(0.55, 16, 12), off, -3.4 + k * 1.7, 0, 0.35, false); gantry.add(m); return m; });
  return {
    scene: R.scene,
    update(dt) {
      lights.forEach((m, k) => { m.material = sim.ph === 'go' ? (sim.pt < 0.6 ? go : off) : k < sim.lit && sim.ph !== 'show' ? on : off; });
      for (const e of sim.events.splice(0)) { if (e.type === 'press') R.cheer(e.i); }
      R.tick(dt);
    },
    tags: () => ctx.players.map((p, i) => [R.x(i), 5, 0]),
    tagText: (i) => (sim.fs[i] ? '<em class="bad">Partenza anticipata!</em>' : sim.rt[i] != null ? `<em>${Math.round(sim.rt[i] * 1000)} ms</em>` : ''),
    top: () => `Partenza ${Math.min(sim.round + 1, sim.rounds)} di ${sim.rounds}${sim.ph === 'go' ? ' · VIA!' : ''}`,
  };
}

// ───────── Ritmo Baso
export function ritmo(stage, sim, ctx) {
  const R = room(stage, ctx, '#e3d1ff'), P = panels(ctx, 'tall');
  const QC = { perfetto: '#ffd23f', bene: '#7ddc1f', ok: '#2ec4ff', miss: '#ff5a5a', stray: '#ff5a5a' };
  return {
    scene: R.scene,
    update(dt) {
      for (const e of sim.events.splice(0)) if (e.type === 'hit' && e.q === 3) R.hop[e.i] = 1;
      R.tick(dt);
      const t = sim.t, span = 2.2;
      sim.p.forEach((p, i) => {
        const { g, w, h } = P.ctx2d(i), lw = Math.min(110, w * 0.4), lx = (w - lw) / 2, ly = h - 70;
        g.fillStyle = 'rgba(20,24,36,.78)'; rr(g, lx, 30, lw, h - 40, 14); g.fill();
        const beatF = (t / sim.beat) % 1; g.fillStyle = `rgba(255,255,255,${0.25 + (1 - beatF) * 0.35})`; g.fillRect(lx + 6, ly - 3, lw - 12, 6);
        for (let k = Math.max(0, p.ni - 2); k < sim.notes.length; k++) {
          const dtN = sim.notes[k] - t; if (dtN > span) break; if (dtN < -0.3) continue;
          const y = ly - (dtN / span) * (ly - 40), j = p.judged[k];
          if (j > 0) continue;
          g.fillStyle = j < 0 ? 'rgba(255,90,90,.5)' : ctx.players[i].sc; g.beginPath(); g.arc(w / 2, y, lw * 0.28, 0, 7); g.fill();
          g.strokeStyle = '#fff'; g.lineWidth = 3; g.stroke();
        }
        g.textAlign = 'center'; g.fillStyle = '#fff'; g.font = '800 15px system-ui, sans-serif'; g.fillText(`${sim.score[i]} pt · combo ${p.combo}`, w / 2, 20);
        if (p.last && t - p.lastT < 0.5) { g.fillStyle = QC[p.last] || '#fff'; g.font = '900 24px system-ui, sans-serif'; g.fillText(p.last === 'stray' ? 'a vuoto' : p.last, w / 2, ly + 40); }
      });
    },
    dispose() { P.dispose(); },
  };
}

// ───────── Memoria a colori
export function memoria(stage, sim, ctx) {
  const R = room(stage, ctx, '#c9f1ff'), P = panels(ctx);
  const SC = ['#ff4d6d', '#ffd23f', '#2fd36b', '#2f8cff'];
  return {
    scene: R.scene,
    update(dt) {
      for (const e of sim.events.splice(0)) if (e.type === 'done') R.cheer(e.i);
      R.tick(dt);
      sim.p.forEach((p, i) => {
        const { g, w, h } = P.ctx2d(i), cx = w / 2, cy = h / 2 + 10, s = Math.min(w, h - 50) * 0.3;
        g.fillStyle = 'rgba(20,24,36,.78)'; rr(g, cx - s * 1.6, cy - s * 1.6, s * 3.2, s * 3.2, 18); g.fill();
        const show = sim.shown(), active = sim.ph === 'show' && show >= 0 && show < sim.seq.length && (sim.pt % 0.62) < 0.48 ? sim.seq[show] : -1;
        const pos = [[0, -1], [1, 0], [0, 1], [-1, 0]];
        pos.forEach(([dx, dy], k) => {
          g.globalAlpha = active === k ? 1 : 0.32; g.fillStyle = SC[k];
          rr(g, cx + dx * s - s * 0.45, cy + dy * s - s * 0.45, s * 0.9, s * 0.9, 12); g.fill();
          g.globalAlpha = 1; g.fillStyle = '#fff'; g.font = `900 ${Math.round(s * 0.5)}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(MEM_SYMS[k], cx + dx * s, cy + dy * s + 2);
        });
        g.textBaseline = 'alphabetic'; g.fillStyle = '#fff'; g.font = '800 15px system-ui, sans-serif';
        const st = sim.ph === 'show' ? `Guarda! (${sim.seq.length} frecce)` : sim.ph === 'input' ? (p.ok === true ? 'Fatto!' : p.ok === false ? 'Sbagliato…' : `Ripeti: ${p.pos}/${sim.seq.length}`) : p.ok ? 'Giusto!' : 'Peccato';
        g.fillText(st, cx, 22);
        if (sim.ph === 'input' && p.ok == null) { g.fillStyle = ctx.players[i].sc; g.fillRect(cx - s * 1.4, cy + s * 1.45, (s * 2.8) * (p.pos / sim.seq.length), 6); }
        if (p.ok === false && sim.ph !== 'show') { g.fillStyle = 'rgba(255,60,60,.35)'; rr(g, cx - s * 1.6, cy - s * 1.6, s * 3.2, s * 3.2, 18); g.fill(); }
        if (p.ok === true && sim.ph !== 'show') { g.fillStyle = 'rgba(60,255,120,.25)'; rr(g, cx - s * 1.6, cy - s * 1.6, s * 3.2, s * 3.2, 18); g.fill(); }
      });
    },
    dispose() { P.dispose(); },
  };
}
