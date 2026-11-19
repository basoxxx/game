// Officina — the 3D garage: a grid of lift pads (the merge board) inside a test-track loop where the best
// cars lap and earn. Pointer drag & drop (mouse, touch, pen) with lift, glide, merge flash, sparks and pop
// animations; DOM badges over every slot (tier, parts, "in pista"). The renderer is shared with the race view.
//   const g = new Garage3D(root, { tier, canDrop(from, to) → 'merge'|'install'|'move'|'swap'|'reject', onDrop, onTap, onLap })
//   g.setRegion(r, grid) · g.sync(grid) · g.applyMove(from, to, res, grid) · g.setTrack(tiers) · g.destroy()
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { pixelRatio } from '../ui/quality.js';
import { FrameGuard } from '../ui/perfguard.js';
import { REGIONS, TIER_COLORS, PART_IDS, partKind } from './data.js';
import { itemModel, carModel, disposeModels } from './models.js';

export const CELL = 2.4;
const sigOf = (it) => (!it ? '' : it.k === 'car' ? `c${it.t}:${PART_IDS.map((p) => it.parts[p] || 0).join('.')}` : it.k === 'part' ? `p${it.p}${it.t}` : `x${it.c}${it.t}${it.p || ''}`);
const ease = (t) => 1 - Math.pow(1 - t, 3);
const back = (t) => { const c = 2.2; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

export class Garage3D {
  constructor(root, opts = {}) {
    this.root = root; this.o = opts; this.tier = opts.tier || 'high';
    this.objs = []; this.pads = []; this.tweens = []; this.fx = []; this.trackCars = []; this.sel = -1; this.cursor = -1; this.hover = -1;
    this.paused = false; this.dead = false; this.portrait = false; this.region = -1;
    const cv = this.cv = document.createElement('canvas'); cv.className = 'of-canvas'; cv.setAttribute('aria-label', 'Officina: griglia di montaggio'); cv.tabIndex = -1;
    root.appendChild(cv);
    this.labels = document.createElement('div'); this.labels.className = 'of-labels'; root.appendChild(this.labels);
    const r = this.renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: this.tier !== 'low', powerPreference: 'high-performance' });
    r.setPixelRatio(pixelRatio(1.75));
    r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = this.tier === 'high'; r.shadowMap.type = THREE.PCFSoftShadowMap;
    cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; });
    cv.addEventListener('webglcontextrestored', () => { this.lost = false; });
    const scene = this.scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(r); this.env = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose();
    scene.environment = this.env;
    this.cam = new THREE.PerspectiveCamera(36, 1, 0.5, 400);
    scene.add(new THREE.HemisphereLight(0xdfeaff, 0x3a3226, 0.9));
    const sun = this.sun = new THREE.DirectionalLight(0xfff2dc, 2.1); sun.position.set(-10, 22, 14); sun.castShadow = r.shadowMap.enabled;
    sun.shadow.mapSize.set(this.tier === 'high' ? 2048 : 1024, this.tier === 'high' ? 2048 : 1024); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
    const sc = sun.shadow.camera; sc.left = -20; sc.right = 20; sc.top = 20; sc.bottom = -20; sc.near = 1; sc.far = 70;
    scene.add(sun); scene.add(sun.target);
    this.world = new THREE.Group(); scene.add(this.world);
    this.items = new THREE.Group(); scene.add(this.items);
    this.ray = new THREE.Raycaster(); this.floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.guard = new FrameGuard([
      { fps: 42, run: () => { const pr = r.getPixelRatio(); if (pr <= 1) return false; r.setPixelRatio(Math.max(1, pr * 0.75)); this.resize(); } },
      { fps: 30, run: () => { if (!r.shadowMap.enabled) return false; r.shadowMap.enabled = false; sun.castShadow = false; this.scene.traverse((m) => { if (m.material) m.material.needsUpdate = true; }); } },
      { fps: 24, run: () => { const pr = r.getPixelRatio(); if (pr <= 0.75) return false; r.setPixelRatio(0.75); this.resize(); } },
    ]);
    this.bindInput();
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(root);
    this.last = performance.now();
    this.loop = this.loop.bind(this); this.raf = requestAnimationFrame(this.loop);
  }

  // ───────── layout
  dims() { const d = REGIONS[this.region].dims; return this.portrait ? [d[1], d[0]] : d; }
  pos(i, y = 0) {
    const [c0, r0] = REGIONS[this.region].dims, c = i % c0, rw = Math.floor(i / c0);
    const [W, H] = this.dims();
    const dc = this.portrait ? rw : c, dr = this.portrait ? c : rw;
    return new THREE.Vector3((dc - (W - 1) / 2) * CELL, y, (dr - (H - 1) / 2) * CELL);
  }
  slotAt(p) {
    const [W, H] = this.dims();
    const dc = Math.round(p.x / CELL + (W - 1) / 2), dr = Math.round(p.z / CELL + (H - 1) / 2);
    if (dc < 0 || dr < 0 || dc >= W || dr >= H) return -1;
    if (Math.abs(p.x - (dc - (W - 1) / 2) * CELL) > CELL * 0.52 || Math.abs(p.z - (dr - (H - 1) / 2) * CELL) > CELL * 0.52) return -1;
    const c0 = REGIONS[this.region].dims[0];
    return this.portrait ? dc * c0 + dr : dr * c0 + dc;
  }
  // neighbour on screen for keyboard navigation
  neighbor(i, dir) {
    const p = this.pos(i), d = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[dir];
    if (!d) return i;
    const j = this.slotAt(new THREE.Vector3(p.x + d[0] * CELL, 0, p.z + d[1] * CELL));
    return j < 0 ? i : j;
  }
  setRegion(r, grid) {
    const portrait = this.root.clientHeight > this.root.clientWidth * 1.05;
    if (r === this.region && portrait === this.portrait && this.pads.length === grid.length) return this.sync(grid);
    this.region = r; this.portrait = portrait;
    this.buildWorld();
    for (const o of this.objs) if (o) this.items.remove(o.o);
    this.objs = [];
    this.sync(grid, true);
    this.resize();
  }
  buildWorld() {
    const w = this.world;
    for (const c of [...w.children]) { w.remove(c); c.traverse((m) => { if (m.isMesh || m.isLine) { m.geometry?.dispose?.(); if (!m.material?.userData?.keep) m.material?.dispose?.(); } }); }
    const R = REGIONS[this.region], [W, H] = this.dims();
    this.scene.background = new THREE.Color(R.sky);
    this.scene.fog = new THREE.Fog(R.sky, 60, 140);
    const gw = W * CELL, gh = H * CELL;
    // grass, concrete platform with painted lines, pads
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: R.grass, roughness: 1 }));
    grass.rotation.x = -Math.PI / 2; grass.position.y = -0.06; grass.receiveShadow = true; w.add(grass);
    const plat = new THREE.Mesh(new THREE.BoxGeometry(gw + 1.2, 0.2, gh + 1.2), new THREE.MeshStandardMaterial({ color: R.floor, roughness: 0.75, metalness: 0.05 }));
    plat.position.y = -0.1; plat.receiveShadow = true; w.add(plat);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(gw + 1.5, 0.12, gh + 1.5), new THREE.MeshStandardMaterial({ color: R.accent, roughness: 0.5, emissive: new THREE.Color(R.accent).multiplyScalar(0.25) }));
    edge.position.y = -0.1; w.add(edge);
    const padTex = this.padTex ||= (() => {
      const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
      g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(0, 0, 128, 128);
      g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 6; g.beginPath(); g.roundRect(8, 8, 112, 112, 18); g.stroke();
      g.strokeStyle = 'rgba(255,214,64,0.9)'; g.lineWidth = 6; for (const [x, y, dx, dy] of [[8, 30, 0, -22], [30, 8, -22, 0], [120, 30, 0, -22], [98, 8, 22, 0], [8, 98, 0, 22], [30, 120, -22, 0], [120, 98, 0, 22], [98, 120, 22, 0]]) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + dx, y + dy); g.stroke(); }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    const padGeo = new THREE.PlaneGeometry(CELL * 0.94, CELL * 0.94); padGeo.rotateX(-Math.PI / 2);
    this.pads = [];
    for (let i = 0; i < W * H; i++) {
      const m = new THREE.Mesh(padGeo, new THREE.MeshStandardMaterial({ map: padTex, transparent: true, color: 0xffffff, emissive: 0x000000, roughness: 0.6, depthWrite: false }));
      m.position.copy(this.pos(i, 0.012)); m.receiveShadow = true; m.renderOrder = 1; w.add(m); this.pads.push(m);
    }
    // the test track: a rounded rectangle around the platform, kerbs, start line
    const hx = gw / 2 + 2.3, hz = gh / 2 + 2.3, rad = 1.9;
    this.ring = ringPath(hx, hz, rad);
    w.add(ribbon(this.ring, 1.5, new THREE.MeshStandardMaterial({ color: 0x2c2e33, roughness: 0.9 }), 0.0));
    const kerbTex = this.kerbTex ||= (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 8; const g = c.getContext('2d'); for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#ffffff' : '#e3262f'; g.fillRect(i * 8, 0, 8, 8); } const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t; })();
    for (const off of [-1.62, 1.62]) { const m = new THREE.MeshStandardMaterial({ map: kerbTex.clone(), roughness: 0.6 }); m.map.needsUpdate = true; m.map.repeat.set(this.ring.len / 2, 1); w.add(ribbon(this.ring, 0.24, m, off, 0.015)); }
    const sl = this.ring.at(0);
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 3.0), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 })); line.rotation.x = -Math.PI / 2; line.position.set(sl.x, 0.02, sl.z); line.rotation.z = -sl.h; w.add(line);
    // back building: the garage with the team colours and a sign
    const by = -hz - 3.4, bw = gw + 7;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(bw, 4.4, 2.2), new THREE.MeshStandardMaterial({ color: R.wall, roughness: 0.8 }));
    const bp = this.portrait ? new THREE.Vector3(0, 2.2, by) : new THREE.Vector3(0, 2.2, by);
    wall.position.copy(bp); wall.castShadow = true; wall.receiveShadow = true; w.add(wall);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(bw + 0.05, 0.35, 2.25), new THREE.MeshStandardMaterial({ color: R.accent, emissive: new THREE.Color(R.accent).multiplyScalar(0.4) })); stripe.position.set(0, 3.6, by); w.add(stripe);
    const doors = Math.max(3, Math.round(bw / 4));
    for (let k = 0; k < doors; k++) { const d = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshStandardMaterial({ color: 0x15171b, emissive: 0x3a3022, roughness: 0.9 })); d.position.set((k - (doors - 1) / 2) * (bw / doors), 1.35, by + 1.11); w.add(d); }
    const sign = signMesh(R.name.toUpperCase(), R.accent); sign.position.set(0, 5.1, by + 0.4); w.add(sign);
    // floodlight poles at the corners
    for (const [x, z] of [[-hx - 1.2, -hz - 1.2], [hx + 1.2, -hz - 1.2], [-hx - 1.2, hz + 1.2], [hx + 1.2, hz + 1.2]]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 6, 8), new THREE.MeshStandardMaterial({ color: 0x8a9099, metalness: 0.6, roughness: 0.4 })); pole.position.set(x, 3, z); pole.castShadow = true; w.add(pole);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 0.5), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4cc, emissiveIntensity: 1.2 })); lamp.position.set(x, 6, z); w.add(lamp);
    }
    // a few trees / cones outside the loop
    const treeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(R.grass).multiplyScalar(0.7), roughness: 0.9 }), trunkMat = new THREE.MeshStandardMaterial({ color: 0x5b4632 });
    const rng = mulberry(this.region * 977 + 3);
    for (let k = 0; k < 26; k++) {
      const a = rng() * Math.PI * 2, d = 1 + rng() * 0.8, x = Math.cos(a) * (hx + 5) * d, z = Math.sin(a) * (hz + 5) * d;
      if (z < -hz - 1 && Math.abs(x) < bw / 2 + 2) continue;
      const s = 0.8 + rng() * 0.9, t = new THREE.Group();
      const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * s, 0.16 * s, 1.1 * s, 6), trunkMat); tr.position.y = 0.55 * s; t.add(tr);
      const cr = new THREE.Mesh(new THREE.ConeGeometry(0.9 * s, 2.4 * s, 8), treeMat); cr.position.y = 2.1 * s; cr.castShadow = true; t.add(cr);
      t.position.set(x, 0, z); w.add(t);
    }
    this.bounds = { hx: hx + 1.2, hz0: by - 1.4, hz1: hz + 1.0, top: 5.6 };
    this.sun.target.position.set(0, 0, 0);
    this.setTrack(this.trackTiers || []);
  }

  // ───────── items
  sync(grid, instant = false) {
    for (let i = 0; i < grid.length; i++) {
      const it = grid[i], sg = sigOf(it), cur = this.objs[i];
      if (cur && cur.sig === sg) continue;
      if (cur) { this.items.remove(cur.o); this.objs[i] = null; }
      if (it) this.objs[i] = this.spawn(i, it, instant ? null : 'drop');
    }
    for (let i = grid.length; i < this.objs.length; i++) if (this.objs[i]) { this.items.remove(this.objs[i].o); this.objs[i] = null; }
    this.objs.length = grid.length;
    this.grid = grid;
    this.drawLabels();
  }
  spawn(i, it, anim) {
    const o = itemModel(it, CELL);
    const p = this.pos(i);
    o.position.copy(p); o.rotation.y = it.k === 'car' ? (this.portrait ? -Math.PI / 2 + 0.5 : -0.5) : 0.3;
    o.userData.base = o.scale.x; o.userData.rotY = o.rotation.y;
    this.items.add(o);
    const rec = { o, sig: sigOf(it), k: it.k };
    if (anim === 'drop') { o.position.y = 5; this.tween(o, { y: 0 }, 0.45, 'bounce'); }
    else if (anim === 'pop') { o.scale.setScalar(o.userData.base * 0.1); this.tween(o, { s: 1 }, 0.42, 'back'); }
    return rec;
  }
  // animate the outcome of a drop (or an automatic merge) — res from core.move
  applyMove(from, to, res, grid, dragged = false) {
    const A = this.objs[from], B = this.objs[to];
    const pTo = this.pos(to), pFrom = this.pos(from);
    const flyThen = (rec, p, done) => { if (!rec) { done?.(); return; } this.tween(rec.o, { x: p.x, y: 0.15, z: p.z }, dragged ? 0.14 : 0.32, 'ease', done); };
    switch (res.type) {
      case 'move': this.objs[to] = A; this.objs[from] = null; flyThen(A, pTo, () => { A.o.position.y = 0; }); A.sig = sigOf(grid[to]); break;
      case 'swap': this.objs[to] = A; this.objs[from] = B; flyThen(A, pTo, () => { A.o.position.y = 0; }); flyThen(B, pFrom, () => { B.o.position.y = 0; }); break;
      case 'merge': {
        this.objs[from] = null; this.objs[to] = null;
        flyThen(A, pTo, () => {
          for (const r of [A, B]) if (r) this.tween(r.o, { s: 0.05 }, 0.14, 'ease', () => this.items.remove(r.o));
          setTimeout(() => {
            if (this.dead) return;
            if (this.objs[to]) this.items.remove(this.objs[to].o);
            this.objs[to] = this.spawn(to, grid[to], 'pop'); this.burst(pTo, grid[to]); this.drawLabels();
          }, 150);
        });
        break;
      }
      case 'install': {
        this.objs[from] = null;
        flyThen(A, pTo, () => {
          this.tween(A.o, { s: 0.05, y: 0.6 }, 0.18, 'ease', () => this.items.remove(A.o));
          if (B) { B.sig = sigOf(grid[to]); this.tween(B.o, { s: 1.12 }, 0.12, 'ease', () => this.tween(B.o, { s: 1 }, 0.2, 'back')); }
          this.burst(pTo, grid[to], 0.5);
          if (grid[from]) { this.objs[from] = this.spawn(from, grid[from], 'pop'); }
          this.drawLabels();
        });
        break;
      }
      default: if (A) this.tween(A.o, { x: pFrom.x, y: 0, z: pFrom.z }, 0.25, 'ease');
    }
    this.grid = grid;
    this.drawLabels();
  }
  // bump an item (tap feedback, rejected drop)
  nudge(i) { const r = this.objs[i]; if (!r) return; this.tween(r.o, { s: 1.12 }, 0.1, 'ease', () => this.tween(r.o, { s: 1 }, 0.25, 'back')); }
  shake(i) { const r = this.objs[i]; if (!r) return; const x = r.o.position.x; let k = 0; const step = () => { if (k++ > 6 || this.dead) { r.o.position.x = x; return; } r.o.position.x = x + (k % 2 ? 0.12 : -0.12); setTimeout(step, 40); }; step(); }

  // ───────── test track: tiers of the cars lapping (best first)
  setTrack(tiers) {
    this.trackTiers = tiers.slice();
    if (!this.ring) return;
    const sig = tiers.join(',');
    if (this._trackSig === sig && this.trackCars.length) return;
    this._trackSig = sig;
    for (const c of this.trackCars) this.scene.remove(c.o);
    const keep = this.trackCars;
    this.trackCars = tiers.map((t, k) => {
      const old = keep.find((c) => c.t === t && !c.used); if (old) old.used = true;
      const o = carModel(t, 1.35, { shadow: this.tier === 'high' });
      this.scene.add(o);
      return { o, t, u: old ? old.u : k / Math.max(1, tiers.length), lane: k % 2 ? -0.42 : 0.42, laps: 0 };
    });
  }
  lapTimeOf(t) { return this.o.lapTime ? this.o.lapTime(t) : 20; }
  updateTrack(dt) {
    const L = this.ring.len;
    for (const c of this.trackCars) {
      const prev = c.u; c.u = (c.u + dt / this.lapTimeOf(c.t)) % 1;
      if (c.u < prev) { c.laps++; const p = this.ring.at(0); this.o.onLap?.(c.t, this.project(new THREE.Vector3(p.x, 0.8, p.z))); }
      const p = this.ring.at(c.u * L), q = this.ring.at((c.u * L + 0.6) % L);
      const nx = -Math.sin(p.h), nz = Math.cos(p.h);
      c.o.position.set(p.x + nx * c.lane, 0.02, p.z + nz * c.lane);
      c.o.rotation.y = -Math.atan2(q.z - p.z, q.x - p.x);
    }
  }

  // ───────── fx: flash, shock ring, sparks
  burst(p, it, k = 1) {
    const col = new THREE.Color(it?.k === 'car' ? '#ffd23f' : TIER_COLORS[((it?.t || 1) - 1) % TIER_COLORS.length]);
    const flash = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    flash.position.set(p.x, 0.6, p.z); this.scene.add(flash);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.06, 6, 40), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    ring.rotation.x = Math.PI / 2; ring.position.set(p.x, 0.08, p.z); this.scene.add(ring);
    const n = this.tier === 'low' ? 24 : 60, pos = new Float32Array(n * 3), vel = [];
    for (let i = 0; i < n; i++) { pos[i * 3] = p.x; pos[i * 3 + 1] = 0.5; pos[i * 3 + 2] = p.z; const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 4 * k; vel.push([Math.cos(a) * s, 3 + Math.random() * 5 * k, Math.sin(a) * s]); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: col.clone().lerp(new THREE.Color('#ffffff'), 0.4), size: 0.16, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.scene.add(pts);
    this.fx.push({ t: 0, dur: 0.75, flash, ring, pts, vel, k });
    this.kick = 0.12 * k;
  }
  updateFx(dt) {
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i]; f.t += dt; const u = f.t / f.dur;
      f.flash.scale.setScalar(1 + u * 3 * f.k); f.flash.material.opacity = Math.max(0, 0.9 * (1 - u * 1.6));
      f.ring.scale.setScalar(1 + u * 4 * f.k); f.ring.material.opacity = Math.max(0, 0.9 * (1 - u));
      const a = f.pts.geometry.attributes.position;
      for (let k = 0; k < f.vel.length; k++) { const v = f.vel[k]; v[1] -= 14 * dt; a.array[k * 3] += v[0] * dt; a.array[k * 3 + 1] = Math.max(0.05, a.array[k * 3 + 1] + v[1] * dt); a.array[k * 3 + 2] += v[2] * dt; }
      a.needsUpdate = true; f.pts.material.opacity = Math.max(0, 1 - u);
      if (u >= 1) { for (const o of [f.flash, f.ring, f.pts]) { this.scene.remove(o); o.geometry.dispose(); o.material.dispose(); } this.fx.splice(i, 1); }
    }
  }

  // ───────── tweens (real time: they finish even when the frame rate crawls)
  tween(o, to, dur, kind = 'ease', done) {
    this.tweens = this.tweens.filter((t) => !(t.o === o && Object.keys(t.to).some((k) => k in to)));
    const from = { x: o.position.x, y: o.position.y, z: o.position.z, s: o.scale.x / (o.userData.base || 1) };
    this.tweens.push({ o, from, to, dur, t: 0, kind, done });
  }
  updateTweens(dt) {
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const w = this.tweens[i]; w.t += dt; const u = Math.min(1, w.t / w.dur);
      const e = w.kind === 'back' ? back(u) : w.kind === 'bounce' ? bounce(u) : ease(u);
      for (const k of ['x', 'y', 'z']) if (k in w.to) w.o.position[k] = w.from[k] + (w.to[k] - w.from[k]) * e;
      if ('s' in w.to) w.o.scale.setScalar((w.o.userData.base || 1) * (w.from.s + (w.to.s - w.from.s) * e));
      if (u >= 1) { this.tweens.splice(i, 1); w.done?.(); }
    }
  }

  // ───────── DOM badges over the slots
  project(v) {
    const p = v.clone().project(this.cam), w = this.root.clientWidth, h = this.root.clientHeight;
    return { x: (p.x * 0.5 + 0.5) * w, y: (-p.y * 0.5 + 0.5) * h };
  }
  drawLabels() {
    if (!this.grid || this.region < 0) return;
    const onTrack = new Set(this.o.trackIdx?.() || []);
    const html = [];
    for (let i = 0; i < this.grid.length; i++) {
      const it = this.grid[i]; if (!it) continue;
      const q = this.project(this.pos(i).add(new THREE.Vector3(0, 0, CELL * 0.36)));
      let inner = '';
      if (it.k === 'car') {
        const pips = PART_IDS.map((p) => `<i style="--c:${it.parts[p] ? TIER_COLORS[(it.parts[p] - 1) % TIER_COLORS.length] : 'transparent'}" title="${partKind(p).name} ${it.parts[p] || '–'}"></i>`).join('');
        inner = `${onTrack.has(i) ? '<em title="In pista">●</em>' : ''}<b>${it.t}</b><span class="of-pips">${pips}</span>`;
      } else if (it.k === 'part') inner = `<b style="--c:${TIER_COLORS[(it.t - 1) % TIER_COLORS.length]}">${partKind(it.p).short} ${it.t}</b>`;
      else inner = `<b class="of-q">?</b>`;
      html.push(`<div class="of-lab ${it.k} ${i === this.sel ? 'sel' : ''}" style="transform:translate(${q.x.toFixed(1)}px,${q.y.toFixed(1)}px)">${inner}</div>`);
    }
    this.labels.innerHTML = html.join('');
  }
  setSelected(i) { this.sel = i; this.paint(); this.drawLabels(); }
  setCursor(i) { this.cursor = i; this.paint(); }
  paint(dragFrom = -1) {
    for (let i = 0; i < this.pads.length; i++) {
      const m = this.pads[i].material;
      let c = 0x000000, k = 0;
      if (dragFrom >= 0 && i !== dragFrom) { const v = this.o.canDrop?.(dragFrom, i); if (v === 'merge' || v === 'install') { c = 0x33ff88; k = 0.7; } }
      if (i === this.hover && dragFrom >= 0) { const v = this.o.canDrop?.(dragFrom, i); c = v === 'merge' || v === 'install' ? 0x33ff88 : v === 'reject' ? 0xff3355 : 0xffd23f; k = 1.2; }
      if (i === this.sel) { c = 0x40b4ff; k = 1; }
      if (i === this.cursor && dragFrom < 0) { c = i === this.sel ? 0x40b4ff : 0xffffff; k = Math.max(k, 0.6); }
      m.emissive.setHex(c); m.emissiveIntensity = k;
    }
  }

  // ───────── input: drag & drop, tap
  floorAt(cx, cy) {
    const b = this.cv.getBoundingClientRect();
    const v = new THREE.Vector2(((cx - b.left) / b.width) * 2 - 1, -((cy - b.top) / b.height) * 2 + 1);
    this.ray.setFromCamera(v, this.cam);
    const p = new THREE.Vector3(); return this.ray.ray.intersectPlane(this.floor, p) ? p : null;
  }
  bindInput() {
    const cv = this.cv;
    let down = null;
    const onDown = (e) => {
      if (this.paused || (e.button !== undefined && e.button > 0)) return;
      const p = this.floorAt(e.clientX, e.clientY); const i = p ? this.slotAt(p) : -1;
      down = { id: e.pointerId, x: e.clientX, y: e.clientY, i, drag: false };
      try { cv.setPointerCapture(e.pointerId); } catch {}
    };
    const onMove = (e) => {
      if (!down || e.pointerId !== down.id) {
        if (e.pointerType === 'mouse' && !this.paused) { const p = this.floorAt(e.clientX, e.clientY); const i = p ? this.slotAt(p) : -1; cv.style.cursor = i >= 0 && this.grid?.[i] ? 'grab' : ''; }
        return;
      }
      const it = this.grid?.[down.i];
      if (!down.drag && it && it.k !== 'crate' && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 7) { down.drag = true; this.dragging = down.i; this.o.onDragStart?.(down.i); cv.style.cursor = 'grabbing'; }
      if (!down.drag) return;
      const p = this.floorAt(e.clientX, e.clientY), rec = this.objs[down.i];
      if (p && rec) {
        const [W, H] = this.dims(), mx = W * CELL / 2 + 3, mz = H * CELL / 2 + 3;
        rec.o.position.set(Math.max(-mx, Math.min(mx, p.x)), 0.9, Math.max(-mz, Math.min(mz, p.z)));
        this.tweens = this.tweens.filter((t) => t.o !== rec.o);
        const h = this.slotAt(p); if (h !== this.hover) { this.hover = h; this.paint(down.i); }
      }
      this.o.onDragMove?.(down.i, e.clientX, e.clientY);
    };
    const onUp = (e) => {
      if (!down || e.pointerId !== down.id) return;
      const d = down; down = null; this.dragging = -1; cv.style.cursor = '';
      if (d.drag) {
        const p = this.floorAt(e.clientX, e.clientY); const to = p ? this.slotAt(p) : -1;
        this.hover = -1; this.paint();
        this.o.onDrop?.(d.i, to, e.clientX, e.clientY);
      } else if (d.i >= 0 || d.i === -1) this.o.onTap?.(d.i);
    };
    const onCancel = (e) => { if (!down || e.pointerId !== down.id) return; const d = down; down = null; this.dragging = -1; this.hover = -1; this.paint(); if (d.drag) this.o.onDrop?.(d.i, -1, -1e5, -1e5); };
    cv.addEventListener('pointerdown', onDown); cv.addEventListener('pointermove', onMove); cv.addEventListener('pointerup', onUp); cv.addEventListener('pointercancel', onCancel);
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    this.unbind = () => { cv.removeEventListener('pointerdown', onDown); cv.removeEventListener('pointermove', onMove); cv.removeEventListener('pointerup', onUp); cv.removeEventListener('pointercancel', onCancel); };
  }

  // ───────── camera fit: the whole loop and the building fit between the HUD bars
  resize() {
    if (this.dead) return;
    const w = Math.max(1, this.root.clientWidth), h = Math.max(1, this.root.clientHeight);
    const portrait = h > w * 1.05;
    if (this.region >= 0 && portrait !== this.portrait && this.grid) { this.portrait = portrait; this.buildWorld(); for (const o of this.objs) if (o) this.items.remove(o.o); this.objs = []; this.sync(this.grid, true); }
    this.renderer.setSize(w, h, false);
    this.cam.aspect = w / h;
    this.cam.fov = portrait ? 42 : 34;
    this.cam.clearViewOffset();
    this.cam.updateProjectionMatrix();
    if (!this.bounds) return;
    const top = (this.o.hudTop?.() ?? 70) / h * 2, bot = (this.o.hudBottom?.() ?? 100) / h * 2;
    const B = this.bounds, tilt = portrait ? 0.98 : 0.9;
    const dir = new THREE.Vector3(0, Math.sin(tilt), Math.cos(tilt));
    const corners = [];
    for (const x of [-B.hx, B.hx]) for (const z of [B.hz0, B.hz1]) for (const y of [0, z < 0 ? B.top : 0.5]) corners.push(new THREE.Vector3(x, y, z));
    const cz = (B.hz0 + B.hz1) / 2 * 0.35;
    const target = new THREE.Vector3(0, 0, cz);
    let lo = 5, hi = 200;
    for (let k = 0; k < 28; k++) {
      const d = (lo + hi) / 2;
      this.cam.position.copy(target).addScaledVector(dir, d); this.cam.lookAt(target); this.cam.updateMatrixWorld();
      let ok = true, minY = 1, maxY = -1;
      for (const c of corners) { const p = c.clone().project(this.cam); if (Math.abs(p.x) > 0.96) ok = false; minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
      if (maxY - minY > 2 - top - bot - 0.04) ok = false;
      if (ok) hi = d; else lo = d;
    }
    this.cam.position.copy(target).addScaledVector(dir, hi); this.cam.lookAt(target); this.cam.updateMatrixWorld();
    // centre the content vertically between the bars
    let minY = 1, maxY = -1; for (const c of corners) { const p = c.clone().project(this.cam); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
    const want = ((1 - top) + (-1 + bot)) / 2, have = (minY + maxY) / 2;
    this.cam.setViewOffset(w, h, 0, -(have - want) * h / 2, w, h);
    this.cam.updateProjectionMatrix(); this.cam.updateMatrixWorld();
    this.baseCam = this.cam.position.clone();
    this.drawLabels();
  }

  loop(now) {
    if (this.dead) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.1, (now - this.last) / 1000); this.last = now;
    if (this.paused || this.lost || document.hidden) return;
    this.updateTweens(dt); this.updateFx(dt);
    if (this.ring) this.updateTrack(dt);
    // idle life: crates wiggle, the selected item bobs
    const t = now / 1000;
    for (let i = 0; i < this.objs.length; i++) {
      const r = this.objs[i]; if (!r || i === this.dragging || this.tweens.some((w) => w.o === r.o)) continue;
      if (r.k === 'crate') { r.o.rotation.z = Math.sin(t * 9 + i) * 0.05 * (Math.sin(t * 1.3 + i) > 0.6 ? 1 : 0); }
      r.o.position.y = i === this.sel ? 0.18 + Math.sin(t * 4) * 0.08 : 0;
      if (r.k === 'part') r.o.rotation.y = r.o.userData.rotY + t * 0.6;
    }
    if (this.kick > 0 && this.baseCam) { this.kick = Math.max(0, this.kick - dt * 0.6); this.cam.position.copy(this.baseCam).add(new THREE.Vector3((Math.random() - 0.5) * this.kick, (Math.random() - 0.5) * this.kick, 0)); }
    else if (this.baseCam) this.cam.position.copy(this.baseCam);
    this.renderer.render(this.scene, this.cam);
    this.guard.tick();
  }
  destroy() {
    this.dead = true; cancelAnimationFrame(this.raf); this.ro?.disconnect(); this.unbind?.();
    for (const c of [...this.world.children]) c.traverse((m) => { if (m.isMesh) { m.geometry?.dispose?.(); m.material?.map?.dispose?.(); m.material?.dispose?.(); } });
    for (const f of this.fx) for (const o of [f.flash, f.ring, f.pts]) { o.geometry.dispose(); o.material.dispose(); }
    this.padTex?.dispose(); this.kerbTex?.dispose(); this.env?.dispose();
    disposeModels();
    this.renderer.dispose(); this.renderer.forceContextLoss?.();
    this.cv.remove(); this.labels.remove();
  }
}

function bounce(u) { if (u < 0.6) return (u / 0.6) ** 2; const v = (u - 0.6) / 0.4; return 1 - Math.sin(v * Math.PI) * 0.18 * (1 - v); }
function mulberry(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// closed rounded-rectangle path sampled every ~0.25 m: at(s) → { x, z, h }
function ringPath(hx, hz, r) {
  const pts = [];
  const seg = (x0, z0, x1, z1) => { const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.25)); for (let i = 0; i < n; i++) pts.push([x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n]); };
  const arc = (cx, cz, a0) => { const n = 16; for (let i = 0; i < n; i++) { const a = a0 + (Math.PI / 2) * i / n; pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); } };
  // start in the middle of the front straight, run clockwise as seen from above (towards +x)
  seg(0, hz, -(hx - r), hz); arc(-(hx - r), hz - r, Math.PI / 2);
  seg(-hx, hz - r, -hx, -(hz - r)); arc(-(hx - r), -(hz - r), Math.PI);
  seg(-(hx - r), -hz, hx - r, -hz); arc(hx - r, -(hz - r), Math.PI * 1.5);
  seg(hx, -(hz - r), hx, hz - r); arc(hx - r, hz - r, 0);
  seg(hx - r, hz, 0, hz);
  const cum = [0]; for (let i = 1; i <= pts.length; i++) { const a = pts[i - 1], b = pts[i % pts.length]; cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const len = cum[pts.length];
  const at = (s) => {
    s = ((s % len) + len) % len;
    let lo = 0, hi = pts.length; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
    const a = pts[lo], b = pts[(lo + 1) % pts.length], u = (s - cum[lo]) / Math.max(1e-6, cum[lo + 1] - cum[lo]);
    return { x: a[0] + (b[0] - a[0]) * u, z: a[1] + (b[1] - a[1]) * u, h: Math.atan2(b[1] - a[1], b[0] - a[0]) };
  };
  return { pts, len, at };
}
// flat ribbon along a closed path (lateral offset off, half width w/2)
function ribbon(path, w, mat, off = 0, y = 0.005) {
  const n = path.pts.length, pos = [], uv = [], idx = [];
  let acc = 0;
  for (let i = 0; i <= n; i++) {
    const a = path.pts[i % n], b = path.pts[(i + 1) % n], h = Math.atan2(b[1] - a[1], b[0] - a[0]), nx = -Math.sin(h), nz = Math.cos(h);
    if (i > 0) { const p = path.pts[i - 1]; acc += Math.hypot(a[0] - p[0], a[1] - p[1]); }
    for (const sd of [-1, 1]) { pos.push(a[0] + nx * (off + sd * w / 2), y, a[1] + nz * (off + sd * w / 2)); uv.push(acc / path.len * (mat.map ? 1 : 1), sd < 0 ? 0 : 1); }
    if (i < n) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat); m.receiveShadow = true;
  // normals may face down depending on the winding: make the ribbon double sided
  mat.side = THREE.DoubleSide;
  return m;
}
function signMesh(text, accent) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#101216'; g.fillRect(0, 0, 1024, 128); g.fillStyle = accent; g.fillRect(0, 112, 1024, 16);
  g.font = 'italic 800 64px "Barlow Condensed", "Exo 2", Arial, sans-serif'; g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(`OFFICINA · ${text}`, 512, 58, 980);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.1), new THREE.MeshBasicMaterial({ map: t, toneMapped: false }));
  return m;
}
