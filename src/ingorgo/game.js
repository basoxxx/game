// Ingorgo — the live puzzle: a cartoon 3D parking lot in a low-poly city, vehicles with eyes that you
// drag, flick or tap out of the jam, undo / restart / solver hints, timer, lights, ferry and juice.
//
// API
//   const g = new IngorgoGame(root, opts); await g.start(); g.togglePause(on); g.destroy();
//   opts = { level (level JSON, see core.js), title, sub, mode: 'campaign'|'pack'|'daily'|'zen',
//            paint, model, horn, theme (cosmetic ids, meta.js), tier: 'high'|'med'|'low', volume,
//            onEnd(result), onPause(on) }
//   result = { win, moves, opt, time, stars, hinted, hints, undos, restarts, fail? }
//   Test hooks (window.__ingorgo in the screen): info(), cellScreen(x, y), carScreen(i), doMove(m),
//   step(dt) (advance the animations without frames: headless WebGL crawls), solveNow().
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { pixelRatio } from '../ui/quality.js';
import { FrameGuard } from '../ui/perfguard.js';
import { icon } from '../ui/icons.js';
import { compile, initState, occupancy, carRange, ferryFree, apply, isGoal, legal, solve, EXITED, starsFor, starLimits, isRed } from './core.js';
import { snd, setVolume } from './sound.js';
import { PAINTS, THEMES, MECH_RULE } from './meta.js';
import { job } from './jobs.js';

const CAR_COLORS = ['#3aa0ff', '#ff9f1c', '#3fe0b0', '#ff6b4a', '#9b5cff', '#ff7ac8', '#7ad14a', '#c9a0ff', '#4a5bff', '#22c3c3'];
const VAN_COLORS = ['#f2f2f2', '#ff8a3d', '#3aa0ff', '#7ad14a', '#ffc928'];
const fmtT = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hashI = (n) => { n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
function srng(seed) { let a = seed >>> 0 || 1; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---------- shared materials / geometries (per game instance, disposed with the scene)
class Kit {
  constructor() { this.mats = new Map(); this.geos = new Map(); }
  mat(color, o = {}) {
    const k = color + JSON.stringify(o);
    if (!this.mats.has(k)) this.mats.set(k, new THREE.MeshStandardMaterial({ color, roughness: o.r ?? 0.55, metalness: o.m ?? 0.05, emissive: o.e || '#000000', emissiveIntensity: o.ei ?? 1, transparent: !!o.t, opacity: o.t ?? 1, depthWrite: o.t ? false : true }));
    return this.mats.get(k);
  }
  geo(k, make) { if (!this.geos.has(k)) this.geos.set(k, make()); return this.geos.get(k); }
  rbox(x, y, z, r = 0.07) { return this.geo(`rb${x},${y},${z},${r}`, () => new RoundedBoxGeometry(x, y, z, 2, Math.min(r, x / 2 - 0.001, y / 2 - 0.001, z / 2 - 0.001))); }
}

export class IngorgoGame {
  constructor(root, o) {
    this.root = root; this.o = o; this.L = o.level;
    this.B = compile(this.L); this.s0 = initState(this.B, this.L); this.s = this.s0.slice();
    this.hist = []; this.moves = 0; this.time = 0; this.started = false; this.done = false; this.paused = false;
    this.hinted = false; this.hints = 0; this.undos = 0; this.restarts = 0;
    this.theme = THEMES.find((t) => t.id === o.theme) || THEMES[0];
    this.tier = o.tier || 'high';
    this.sel = -2; // selected vehicle (keyboard), -1 = ferry, -2 none
    this.pending = null; this.fx = []; this.clock = 0;
    setVolume(o.volume ?? 0.6);
  }

  async start() {
    const root = this.root, L = this.L;
    const [a3, b2] = starLimits(L.opt);
    root.innerHTML = `<canvas class="ig-cv" aria-label="Parcheggio: trascina i veicoli"></canvas>
    <div class="ig-hud">
      <div class="ig-top">
        <button class="ig-b" data-k="pause" aria-label="Pausa (Esc)">${icon('pause')}</button>
        <div class="ig-title"><b>${this.o.title || 'Ingorgo'}</b><span>${this.o.sub || ''}</span></div>
        <div class="ig-stats">
          <div class="ig-st"><b id="ig-mv">0</b><span>mosse</span></div>
          <div class="ig-st ig-par" title="Stelle: ★★★ entro ${a3} mosse, ★★ entro ${b2}"><b>${L.opt}</b><span>minimo</span></div>
          <div class="ig-st ${L.time ? 'ig-timed' : ''}" id="ig-tmw"><b id="ig-tm">${L.time ? fmtT(L.time) : '0:00'}</b><span>${L.time ? 'restano' : 'tempo'}</span></div>
          <div class="ig-stars" id="ig-stars" aria-label="Stelle"><i class="on">★</i><i class="on">★</i><i class="on">★</i></div>
        </div>
      </div>
      <div class="ig-rule" id="ig-rule">${this.ruleText()}</div>
      <div class="ig-bot">
        <button class="ig-b" data-k="undo" aria-label="Annulla (Z)">${icon('left')}<span>Annulla</span></button>
        <button class="ig-b" data-k="restart" aria-label="Ricomincia (R)">${icon('replay')}<span>Ricomincia</span></button>
        <button class="ig-b ig-hintb" data-k="hint" aria-label="Aiuto (H)">${icon('bulb')}<span>Aiuto</span></button>
      </div>
      <div class="ig-msg" id="ig-msg"></div>
      <div class="ig-keys">Trascina o tocca i veicoli · <span class="kbd">Tab</span> scegli · <span class="kbd">←↑↓→</span> sposta · <span class="kbd">Z</span> annulla · <span class="kbd">H</span> aiuto</div>
    </div>`;
    this.cv = root.querySelector('.ig-cv');
    this.$ = (id) => root.querySelector('#' + id);
    const r = this.renderer = new THREE.WebGLRenderer({ canvas: this.cv, antialias: this.tier !== 'low', powerPreference: 'high-performance' });
    r.setPixelRatio(pixelRatio(2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = this.tier === 'high'; r.shadowMap.type = THREE.PCFSoftShadowMap;
    const setPR = (pr) => { if (Math.abs(r.getPixelRatio() - pr) < 0.01) return false; r.setPixelRatio(pr); this.resize(); };
    this.guard = new FrameGuard([
      { fps: 45, run: () => setPR(Math.min(r.getPixelRatio(), 1.25)) },
      { fps: 38, run: () => { if (!r.shadowMap.enabled) return false; r.shadowMap.enabled = false; this.scene.traverse((x) => { if (x.material) x.material.needsUpdate = true; }); } },
      { fps: 32, run: () => setPR(1) },
      { fps: 24, run: () => { if (!this.city) return false; this.city.visible = false; } },
    ]);
    this.kit = new Kit();
    this.buildScene();
    this.bindInput();
    this.resize();
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(root);
    this.syncHud();
    this.last = performance.now();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
    setTimeout(() => this.$('ig-rule')?.classList.add('off'), 6500);
  }
  ruleText() {
    const L = this.L;
    const base = MECH_RULE[L.mech] || (L.goal === 'all' ? MECH_RULE.tutti : MECH_RULE.classico);
    const extra = [];
    if (L.goal === 'hero' && L.mech !== 'classico') extra.push('Porta fuori l’auto con la stella.');
    if (L.arrows?.length && L.mech !== 'sensi') extra.push('Frecce: senso unico.');
    if (L.lights?.length && L.mech !== 'semafori') extra.push('Semafori: cambiano a ogni mossa.');
    if (L.time) extra.push(`Hai ${fmtT(L.time)}.`);
    return `${base} ${extra.join(' ')}`;
  }

  // ---------------------------------------------------------------- scene
  cellPos(x, y) { return [x - this.B.w / 2 + 0.5, y - this.B.h / 2 + 0.5]; }
  buildScene() {
    const B = this.B, L = this.L, T = this.theme, kit = this.kit, tier = this.tier;
    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color(T.sky);
    scene.fog = new THREE.Fog(T.fog, 26, 70);
    this.cam = new THREE.PerspectiveCamera(36, 1, 0.5, 200);
    scene.add(new THREE.HemisphereLight(T.hemi[0], T.hemi[1], T.night ? 0.9 : 1.15));
    const sun = this.sun = new THREE.DirectionalLight(T.sunColor || '#ffffff', T.sun * 2.1);
    sun.position.set(-6, 14, 8);
    if (tier === 'high') { sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); const c = sun.shadow.camera; c.left = -9; c.right = 9; c.top = 9; c.bottom = -9; c.near = 1; c.far = 40; sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.02; }
    scene.add(sun);
    const W = B.w, H = B.h, R = 1.5; // ring road width
    // ground, ring road, sidewalk
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), kit.mat(T.ground, { r: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.06; ground.receiveShadow = true; scene.add(ground);
    const side = new THREE.Mesh(kit.rbox(W + 2 * R + 1.6, 0.12, H + 2 * R + 1.6, 0.3), kit.mat(T.snow ? '#e9eef5' : '#cfd3da', { r: 0.9 }));
    side.position.y = -0.04; side.receiveShadow = true; scene.add(side);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(W + 2 * R, H + 2 * R), kit.mat(T.snow ? '#6a7180' : '#4a505e', { r: 0.95 }));
    road.rotation.x = -Math.PI / 2; road.position.y = 0.025; road.receiveShadow = true; scene.add(road);
    // dashed centre line of the ring road
    const dashes = [];
    const dash = (x, z, rot) => { const g = new THREE.PlaneGeometry(0.42, 0.07); g.rotateX(-Math.PI / 2); g.rotateY(rot); g.translate(x, 0.03, z); dashes.push(g); };
    const rx = W / 2 + R / 2 + 0.05, rz = H / 2 + R / 2 + 0.05;
    for (let x = -rx; x <= rx; x += 0.8) { dash(x, -rz, 0); dash(x, rz, 0); }
    for (let z = -rz + 0.8; z < rz; z += 0.8) { dash(-rx, z, Math.PI / 2); dash(rx, z, Math.PI / 2); }
    scene.add(new THREE.Mesh(mergeGeometries(dashes), kit.mat('#ffe27a', { r: 0.8 })));
    // the lot: asphalt slab per column (the river column is water), parking lines
    const lot = new THREE.Group(); scene.add(lot); this.lot = lot;
    const slabs = [];
    for (let x = 0; x < W; x++) { if (x === B.rx) continue; const g = new THREE.BoxGeometry(1.0, 0.1, H + 0.24); const [cx] = this.cellPos(x, 0); g.translate(cx, 0.0, 0); slabs.push(g); }
    const slab = new THREE.Mesh(mergeGeometries(slabs), kit.mat(T.snow ? '#8a93a3' : '#5b6272', { r: 0.92 }));
    slab.receiveShadow = true; lot.add(slab);
    const lines = [];
    for (let x = 0; x <= W; x++) { if (x === B.rx || x === B.rx + 1) continue; const g = new THREE.PlaneGeometry(0.04, H); g.rotateX(-Math.PI / 2); g.translate(x - W / 2, 0.052, 0); lines.push(g); }
    for (let y = 0; y <= H; y++) for (let x = 0; x < W; x++) { if (x === B.rx) continue; const g = new THREE.PlaneGeometry(0.5, 0.04); g.rotateX(-Math.PI / 2); g.translate(x - W / 2 + 0.5, 0.052, y - H / 2); lines.push(g); }
    lot.add(new THREE.Mesh(mergeGeometries(lines), kit.mat('#ffffff', { t: 0.35 })));
    this.buildEdges();
    if (B.rx >= 0) this.buildRiver();
    // planters (walls)
    for (const [x, y] of L.walls || []) {
      const [cx, cz] = this.cellPos(x, y), g = new THREE.Group(); g.position.set(cx, 0.05, cz);
      const pot = new THREE.Mesh(kit.rbox(0.82, 0.34, 0.82, 0.08), kit.mat('#c96a3d', { r: 0.8 })); pot.position.y = 0.17; pot.castShadow = true; g.add(pot);
      const bush = new THREE.Mesh(kit.geo('bush', () => new THREE.IcosahedronGeometry(0.36, 1)), kit.mat(T.snow ? '#e8f0f6' : '#3fae4a', { r: 0.9 })); bush.position.y = 0.52; bush.scale.set(1, 0.8, 1); bush.castShadow = true; g.add(bush);
      const fl = new THREE.Mesh(kit.geo('flower', () => new THREE.IcosahedronGeometry(0.08, 0)), kit.mat('#ff6ab0')); fl.position.set(0.15, 0.78, 0.1); g.add(fl);
      lot.add(g);
    }
    // one-way arrows
    if (L.arrows?.length) {
      const sh = new THREE.Shape(); sh.moveTo(-0.3, -0.07); sh.lineTo(0.08, -0.07); sh.lineTo(0.08, -0.18); sh.lineTo(0.32, 0); sh.lineTo(0.08, 0.18); sh.lineTo(0.08, 0.07); sh.lineTo(-0.3, 0.07); sh.closePath();
      const gs = L.arrows.map(([x, y, d]) => { const g = new THREE.ShapeGeometry(sh); g.rotateX(-Math.PI / 2); g.rotateY(-d * Math.PI / 2); const [cx, cz] = this.cellPos(x, y); g.translate(cx, 0.056, cz); return g; });
      lot.add(new THREE.Mesh(mergeGeometries(gs), kit.mat('#ffffff', { t: 0.9 })));
      const tint = L.arrows.map(([x, y]) => { const g = new THREE.PlaneGeometry(0.96, 0.96); g.rotateX(-Math.PI / 2); const [cx, cz] = this.cellPos(x, y); g.translate(cx, 0.054, cz); return g; });
      lot.add(new THREE.Mesh(mergeGeometries(tint), kit.mat('#2fb5ff', { t: 0.22 })));
    }
    // traffic lights
    this.lightViews = [];
    for (const [x, y, gr] of L.lights || []) {
      const [cx, cz] = this.cellPos(x, y);
      const pad = new THREE.Mesh(kit.geo('lpad', () => { const g = new THREE.PlaneGeometry(0.94, 0.94); g.rotateX(-Math.PI / 2); return g; }), new THREE.MeshBasicMaterial({ color: '#ff3b3b', transparent: true, opacity: 0.4, depthWrite: false }));
      pad.position.set(cx, 0.058, cz); lot.add(pad);
      const post = new THREE.Group(); post.position.set(cx + 0.42, 0.05, cz - 0.42);
      const pole = new THREE.Mesh(kit.geo('pole', () => new THREE.CylinderGeometry(0.03, 0.03, 0.9, 6)), kit.mat('#3a3f4a')); pole.position.y = 0.45; post.add(pole);
      const head = new THREE.Mesh(kit.rbox(0.14, 0.3, 0.12, 0.03), kit.mat('#23262e')); head.position.y = 0.98; post.add(head);
      const lampR = new THREE.Mesh(kit.geo('lamp', () => new THREE.SphereGeometry(0.045, 10, 8)), new THREE.MeshBasicMaterial({ color: '#ff3b3b' })); lampR.position.set(0, 1.06, 0.06); post.add(lampR);
      const lampG = new THREE.Mesh(kit.geo('lamp', () => new THREE.SphereGeometry(0.045, 10, 8)), new THREE.MeshBasicMaterial({ color: '#3ee07a' })); lampG.position.set(0, 0.9, 0.06); post.add(lampG);
      lot.add(post);
      this.lightViews.push({ x, y, gr, pad, lampR, lampG, cell: y * B.w + x });
    }
    this.syncLights(true);
    // vehicles
    this.vs = B.cars.map((c, i) => this.buildVehicle(c, i));
    // fx pools
    this.buildFx();
    // the city around
    this.buildCity();
    // selection ring + hint ghost
    const ring = this.ring = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.0, depthWrite: false, map: this.ringTex() }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; ring.visible = false; scene.add(ring);
    const ghost = this.ghost = new THREE.Mesh(new THREE.BoxGeometry(1, 0.5, 0.8), new THREE.MeshBasicMaterial({ color: '#ffe14a', transparent: true, opacity: 0.35, depthWrite: false }));
    ghost.visible = false; scene.add(ghost);
  }
  ringTex() {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    g.strokeStyle = '#fff'; g.lineWidth = 10; g.beginPath(); g.roundRect(8, 8, 112, 112, 26); g.stroke();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  buildEdges() {
    const B = this.B, kit = this.kit, W = B.w, H = B.h, T = this.theme;
    const curbM = kit.mat(T.snow ? '#ffffff' : '#e7e2d6', { r: 0.8 }), parts = [];
    const gap = new Set(); // edge cells that are exits: `${side}:${i}` side 0 right 1 bottom 2 left 3 top
    if (B.goal === 'hero') { const c = B.cars[B.hero]; const side = c.ax === 0 ? (c.dir > 0 ? 0 : 2) : (c.dir > 0 ? 1 : 3); gap.add(`${side}:${c.fix}`); this.exitSide = side; }
    const seg = (side, i) => {
      if (B.goal === 'all') return; // open lot: everyone leaves through the side they face
      if (gap.has(`${side}:${i}`)) return;
      if ((side === 1 || side === 3) && i === B.rx) return;
      const g = side === 0 || side === 2 ? new THREE.BoxGeometry(0.14, 0.2, 1.0) : new THREE.BoxGeometry(1.0, 0.2, 0.14);
      const o = 0.5 + 0.12;
      if (side === 0) g.translate(W / 2 + 0.12, 0.08, i - H / 2 + 0.5); else if (side === 2) g.translate(-W / 2 - 0.12, 0.08, i - H / 2 + 0.5);
      else if (side === 1) g.translate(i - W / 2 + 0.5, 0.08, H / 2 + 0.12); else g.translate(i - W / 2 + 0.5, 0.08, -H / 2 - 0.12);
      void o; parts.push(g);
    };
    for (let i = 0; i < H; i++) { seg(0, i); seg(2, i); }
    for (let i = 0; i < W; i++) { seg(1, i); seg(3, i); }
    if (parts.length) { const m = new THREE.Mesh(mergeGeometries(parts), curbM); m.castShadow = true; m.receiveShadow = true; this.lot.add(m); }
    // 'all' lots: yellow dashed border
    if (B.goal === 'all') {
      const d = [];
      for (let i = 0; i < W; i++) for (const z of [-H / 2, H / 2]) { if (i === B.rx) continue; const g = new THREE.PlaneGeometry(0.5, 0.07); g.rotateX(-Math.PI / 2); g.translate(i - W / 2 + 0.5, 0.056, z); d.push(g); }
      for (let i = 0; i < H; i++) for (const x of [-W / 2, W / 2]) { const g = new THREE.PlaneGeometry(0.07, 0.5); g.rotateX(-Math.PI / 2); g.translate(x, 0.056, i - H / 2 + 0.5); d.push(g); }
      this.lot.add(new THREE.Mesh(mergeGeometries(d), kit.mat('#ffd23a')));
    }
    // hero exit: chequered strip, arrow and a barrier that lifts
    if (B.goal === 'hero') {
      const c = B.cars[B.hero], side = this.exitSide, ang = [0, -Math.PI / 2, Math.PI, Math.PI / 2][side];
      const ex = new THREE.Group(); this.lot.add(ex);
      const [cx, cz] = this.cellPos(c.ax === 0 ? (c.dir > 0 ? W - 1 : 0) : c.fix, c.ax === 1 ? (c.dir > 0 ? H - 1 : 0) : c.fix);
      ex.position.set(cx, 0, cz); ex.rotation.y = ang;
      const cv = document.createElement('canvas'); cv.width = 64; cv.height = 256; const g = cv.getContext('2d');
      for (let yy = 0; yy < 8; yy++) for (let xx = 0; xx < 2; xx++) { g.fillStyle = (xx + yy) % 2 ? '#111' : '#fff'; g.fillRect(xx * 32, yy * 32, 32, 32); }
      const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace;
      const chk = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.96), new THREE.MeshStandardMaterial({ map: tx, roughness: 0.8 }));
      chk.rotation.x = -Math.PI / 2; chk.position.set(0.62, 0.035, 0); ex.add(chk);
      const sh = new THREE.Shape(); sh.moveTo(0, -0.14); sh.lineTo(0.18, 0); sh.lineTo(0, 0.14); sh.lineTo(0, 0.06); sh.lineTo(-0.2, 0.06); sh.lineTo(-0.2, -0.06); sh.lineTo(0, -0.06); sh.closePath();
      for (let k = 0; k < 2; k++) { const a = new THREE.Mesh(new THREE.ShapeGeometry(sh), new THREE.MeshBasicMaterial({ color: '#ffe14a', transparent: true, opacity: 0.9 })); a.rotation.x = -Math.PI / 2; a.position.set(1.0 + k * 0.45, 0.04, 0); ex.add(a); (this.exitArrows ||= []).push(a); }
      const post = new THREE.Mesh(kit.rbox(0.14, 0.42, 0.14, 0.03), kit.mat('#f2f2f2')); post.position.set(0.66, 0.21, -0.56); post.castShadow = true; ex.add(post);
      const arm = this.barrier = new THREE.Group(); arm.position.set(0.66, 0.36, -0.56); ex.add(arm);
      const cvb = document.createElement('canvas'); cvb.width = 128; cvb.height = 16; const gb = cvb.getContext('2d'); for (let k = 0; k < 8; k++) { gb.fillStyle = k % 2 ? '#ffffff' : '#ff3b3b'; gb.fillRect(k * 16, 0, 16, 16); }
      const tb = new THREE.CanvasTexture(cvb); tb.colorSpace = THREE.SRGBColorSpace;
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 1.05), new THREE.MeshStandardMaterial({ map: tb })); bar.position.z = 0.53; bar.castShadow = true; arm.add(bar);
      this.barrierUp = 0;
    }
  }
  buildRiver() {
    const B = this.B, kit = this.kit, H = B.h;
    const [cx] = this.cellPos(B.rx, 0);
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64; const g = cv.getContext('2d');
    g.fillStyle = '#2f8fe0'; g.fillRect(0, 0, 64, 64); g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 3;
    for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(0, 8 + k * 16); g.bezierCurveTo(16, 2 + k * 16, 48, 14 + k * 16, 64, 8 + k * 16); g.stroke(); }
    const tx = this.waterTex = new THREE.CanvasTexture(cv); tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.repeat.set(1, H + 6); tx.colorSpace = THREE.SRGBColorSpace;
    const water = new THREE.Mesh(new THREE.PlaneGeometry(1.0, H + 6), new THREE.MeshStandardMaterial({ map: tx, roughness: 0.25, metalness: 0.1, color: '#9fd6ff' }));
    water.rotation.x = -Math.PI / 2; water.position.set(cx, -0.03, 0); this.scene.add(water);
    // quay walls on both banks
    const q = []; for (const s of [-1, 1]) { const gq = new THREE.BoxGeometry(0.06, 0.16, H + 6); gq.translate(cx + s * 0.5, 0.0, 0); q.push(gq); }
    this.scene.add(new THREE.Mesh(mergeGeometries(q), kit.mat('#a8a39a')));
    // ferry: deck flush with the lot, hull, bollards, a flag
    const f = this.ferry = new THREE.Group();
    const len = B.fl;
    const hull = new THREE.Mesh(kit.rbox(0.98, 0.22, len - 0.04, 0.06), kit.mat('#ff7a2e', { r: 0.6 })); hull.position.y = -0.06; hull.castShadow = true; f.add(hull);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.04, len - 0.12), kit.mat('#8a6a4a', { r: 0.9 })); deck.position.y = 0.04; deck.receiveShadow = true; f.add(deck);
    for (const sz of [-1, 1]) for (const sx of [-1, 1]) { const b = new THREE.Mesh(kit.geo('bol', () => new THREE.CylinderGeometry(0.035, 0.04, 0.12, 8)), kit.mat('#f2f2f2')); b.position.set(sx * 0.4, 0.1, sz * (len / 2 - 0.1)); f.add(b); }
    const mast = new THREE.Mesh(kit.geo('mast', () => new THREE.CylinderGeometry(0.015, 0.015, 0.6, 5)), kit.mat('#f2f2f2')); mast.position.set(0.42, 0.36, -len / 2 + 0.1); f.add(mast);
    const flag = this.flag = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.13), new THREE.MeshStandardMaterial({ color: '#3ecf6e', side: THREE.DoubleSide })); flag.position.set(0.42, 0.58, -len / 2 + 0.2); flag.rotation.y = Math.PI / 2; f.add(flag);
    const pick = new THREE.Mesh(new THREE.BoxGeometry(1, 0.4, len), new THREE.MeshBasicMaterial({ visible: false })); pick.userData.ferry = true; f.add(pick); this.ferryPick = pick;
    this.fvp = this.s[B.n]; this.fvel = 0;
    this.scene.add(f);
    this.placeFerry();
  }
  placeFerry() { const B = this.B; const [cx] = this.cellPos(B.rx, 0); this.ferry.position.set(cx, 0, this.fvp + B.fl / 2 - B.h / 2); }

  buildCity() {
    const B = this.B, kit = this.kit, T = this.theme;
    const r = srng((this.L.seed || 7) ^ 0x5bd1e995);
    const city = this.city = new THREE.Group(); this.scene.add(city);
    const W = B.w, H = B.h, R = 1.5, edgeX = W / 2 + R + 0.8, edgeZ = H / 2 + R + 0.8;
    // windows texture (also the emissive map at night)
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64; const g = cv.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 64, 64);
    for (let yy = 0; yy < 2; yy++) for (let xx = 0; xx < 2; xx++) { g.fillStyle = T.night ? (r() < 0.6 ? '#ffd27a' : '#2a3150') : '#5a7aa8'; g.fillRect(8 + xx * 32, 8 + yy * 32, 18, 20); }
    const tex = new THREE.CanvasTexture(cv); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace;
    const COLS = T.snow ? ['#f4e3d0', '#e8d8f0', '#d8e8f4', '#f6d6c8', '#eaeaea'] : ['#ffb07a', '#ffd36e', '#9fd9ff', '#ff8f8f', '#b9e88a', '#e0b8ff', '#f5efe0', '#ffc7d9'];
    const walls = [], roofs = [];
    const box = (x, z, w, d, h) => {
      const gg = new THREE.BoxGeometry(w, h, d); gg.translate(x, h / 2, z);
      const uv = gg.attributes.uv, pos = gg.attributes.position, nrm = gg.attributes.normal;
      for (let i = 0; i < uv.count; i++) { const ny = Math.abs(nrm.getY(i)); if (ny > 0.5) { uv.setXY(i, 0.02, 0.02); continue; } const horiz = Math.abs(nrm.getX(i)) > 0.5 ? pos.getZ(i) - z : pos.getX(i) - x; uv.setXY(i, (horiz + 50) * 1.6, pos.getY(i) * 1.4); }
      const col = new THREE.Color(COLS[Math.floor(r() * COLS.length)]); const c = new Float32Array(pos.count * 3); for (let i = 0; i < pos.count; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
      gg.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); walls.push(gg);
      const rf = new THREE.BoxGeometry(w + 0.12, 0.14, d + 0.12); rf.translate(x, h + 0.07, z); const rc = new THREE.Color(r() < 0.5 ? '#c85a4a' : '#5a6070'); const c2 = new Float32Array(rf.attributes.position.count * 3); for (let i = 0; i < c2.length / 3; i++) { c2[i * 3] = rc.r; c2[i * 3 + 1] = rc.g; c2[i * 3 + 2] = rc.b; } rf.setAttribute('color', new THREE.Float32BufferAttribute(c2, 3)); roofs.push(rf);
    };
    const trees = [];
    // blocks on the four sides
    for (const side of [0, 1, 2, 3]) {
      const along = side % 2 === 0 ? W + 2 * R + 6 : H + 2 * R + 6;
      for (let t = -along / 2; t < along / 2;) {
        const w = 1.2 + r() * 1.6, d = 1.4 + r() * 1.6, h = (side === 1 ? 0.7 : 1.2) + r() * (side === 1 ? 1.2 : 3.2);
        const off = side === 0 || side === 2 ? edgeZ : edgeX;
        const c = t + w / 2, depth = off + 0.3 + d / 2 + r() * 0.3;
        const [x, z] = side === 0 ? [c, -depth] : side === 1 ? [c, depth] : side === 2 ? [-depth, c] : [depth, c];
        const [bw, bd] = side % 2 === 0 ? [w, d] : [d, w];
        if (r() < 0.22) trees.push([x, z, 0.8 + r() * 0.5]); else box(x, z, bw, bd, h);
        if (r() < 0.5) { const tt = side % 2 === 0 ? [c, (side === 0 ? -1 : 1) * (off + 0.05)] : [(side === 2 ? -1 : 1) * (off + 0.05), c]; trees.push([side % 2 === 0 ? tt[0] : tt[0], tt[1], 0.55 + r() * 0.3]); }
        t += w + 0.15;
      }
    }
    // a second row of taller buildings behind (skyline)
    for (let k = 0; k < 18; k++) { const a = (k / 18) * Math.PI * 2, rad = Math.max(W, H) / 2 + R + 6 + r() * 3; box(Math.cos(a) * rad * 1.15, Math.sin(a) * rad, 1.8 + r() * 1.5, 1.8 + r() * 1.5, 2.5 + r() * 5); }
    const wallM = new THREE.MeshStandardMaterial({ vertexColors: true, map: tex, roughness: 0.85, emissive: T.night ? '#ffffff' : '#000000', emissiveMap: T.night ? tex : null, emissiveIntensity: T.night ? 0.35 : 0 });
    const wm = new THREE.Mesh(mergeGeometries(walls), wallM); wm.castShadow = this.tier === 'high'; wm.receiveShadow = true; city.add(wm);
    city.add(new THREE.Mesh(mergeGeometries(roofs), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 })));
    // trees: one instanced mesh (trunk + crown)
    const trunk = new THREE.CylinderGeometry(0.06, 0.08, 0.4, 6); trunk.translate(0, 0.2, 0);
    const crown = T.snow ? new THREE.ConeGeometry(0.42, 0.9, 7) : new THREE.IcosahedronGeometry(0.42, 0); crown.translate(0, T.snow ? 0.8 : 0.72, 0);
    const paint = (gg, col) => { gg = gg.toNonIndexed(); const c = new THREE.Color(col), a = new Float32Array(gg.attributes.position.count * 3); for (let i = 0; i < a.length / 3; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } gg.setAttribute('color', new THREE.Float32BufferAttribute(a, 3)); if (gg.attributes.uv) gg.deleteAttribute('uv'); return gg; };
    const tg = mergeGeometries([paint(trunk, '#8a5a3a'), paint(crown, T.snow ? '#e8f2ea' : T.night ? '#2f7a4a' : '#4cc35a')]);
    const tm = new THREE.InstancedMesh(tg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }), trees.length);
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3();
    trees.forEach(([x, z, s], i) => { S.set(s, s, s); P.set(x, 0, z); Q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 6); M.compose(P, Q, S); tm.setMatrixAt(i, M); });
    tm.castShadow = this.tier === 'high'; city.add(tm);
    // little parked props: street lamps at the lot corners
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const lp = new THREE.Group(); lp.position.set(sx * (W / 2 + R + 0.45), 0, sz * (H / 2 + R + 0.45));
      const p = new THREE.Mesh(kit.geo('lpole', () => new THREE.CylinderGeometry(0.035, 0.045, 1.5, 6)), kit.mat('#3a3f4a')); p.position.y = 0.75; lp.add(p);
      const bulb = new THREE.Mesh(kit.geo('bulb', () => new THREE.SphereGeometry(0.1, 10, 8)), new THREE.MeshBasicMaterial({ color: T.night ? '#ffe7a0' : '#f4f4f4' })); bulb.position.y = 1.55; lp.add(bulb);
      city.add(lp);
    }
  }

  // ---------------------------------------------------------------- vehicles
  buildVehicle(c, i) {
    const kit = this.kit, len = c.len, Lx = len - 0.16, Wd = 0.8;
    const seed = (this.L.seed || 1) * 31 + i * 7;
    // colours cycle through the palette so neighbours differ; at most one police car and one taxi
    const off = Math.floor(hashI((this.L.n || this.L.seed || 3) * 7919) * 10);
    const pick = (arr) => arr[(i * 3 + off) % arr.length];
    let kind = c.hero ? 'eroe' : c.kind || (len === 3 ? 'furgone' : 'auto');
    this._kinds ||= {};
    if ((kind === 'polizia' || kind === 'taxi' || kind === 'gelati') && this._kinds[kind]) kind = len === 3 ? 'furgone' : 'auto';
    this._kinds[kind] = 1;
    const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
    const add = (geo, mat, x, y, z, shadow = true) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); if (shadow) m.castShadow = true; body.add(m); return m; };
    const glass = kit.mat('#2b3a55', { r: 0.15, m: 0.3 });
    const dark = kit.mat('#1d2027', { r: 0.8 });
    let color, eyeX, eyeY, eyeZ = 0.15, eyeS = 1, topY;
    const paint = PAINTS.find((p) => p.id === this.o.paint) || PAINTS[0];
    const model = c.hero ? this.o.model || 'utilitaria' : null;
    const wheelsAt = (xs, r = 0.13) => { for (const x of xs) for (const s of [-1, 1]) { const w = add(kit.geo(`wh${r}`, () => { const gg = new THREE.CylinderGeometry(r, r, 0.12, 12); gg.rotateX(Math.PI / 2); return gg; }), dark, x, r, s * (Wd / 2 - 0.04)); (g.userData.wheels ||= []).push(w); } };
    if (len === 2) {
      color = c.hero ? paint.color : kind === 'taxi' ? '#ffc928' : kind === 'polizia' ? '#f4f6fa' : pick(CAR_COLORS);
      const bm = kit.mat(color, c.hero && paint.metal ? { r: 0.25, m: 0.7 } : { r: 0.45 });
      const low = kind === 'sport' || model === 'sportiva';
      if (model === 'ape') {
        add(kit.rbox(0.62, 0.5, 0.7, 0.12), bm, 0.48, 0.42, 0); // cab
        add(kit.rbox(0.62, 0.05, 0.62, 0.02), glass, 0.8, 0.52, 0, false).scale.set(0.05, 4, 1);
        add(kit.rbox(1.0, 0.26, Wd, 0.04), kit.mat('#8a96a8'), -0.32, 0.36, 0); // bed
        add(kit.rbox(0.9, 0.1, 0.7, 0.03), kit.mat('#ffcf6a'), -0.32, 0.53, 0); // crate
        wheelsAt([0.6, -0.5], 0.12); eyeX = 0.8; eyeY = 0.5; topY = 0.7;
      } else {
        const h0 = low ? 0.26 : model === 'bolla' || kind === 'mini' ? 0.36 : 0.32;
        add(kit.rbox(Lx, h0, Wd, model === 'bolla' || kind === 'mini' ? 0.15 : 0.09), bm, 0, 0.12 + h0 / 2, 0);
        const cl = model === 'bolla' || kind === 'mini' ? 0.95 : low ? 0.8 : 1.0, ch = low ? 0.2 : 0.3;
        add(kit.rbox(cl, ch, Wd - 0.14, model === 'bolla' || kind === 'mini' ? 0.13 : 0.08), bm, -0.08, 0.12 + h0 + ch / 2 - 0.02, 0);
        add(kit.rbox(cl + 0.03, ch * 0.5, Wd - 0.1, 0.05), glass, -0.08, 0.12 + h0 + ch * 0.48, 0, false);
        wheelsAt([Lx / 2 - 0.32, -Lx / 2 + 0.32]);
        eyeX = -0.08 + cl / 2 + 0.01; eyeY = 0.12 + h0 + ch * 0.5; topY = 0.12 + h0 + ch;
        if (low) add(kit.rbox(0.12, 0.05, Wd - 0.06, 0.02), dark, -Lx / 2 + 0.08, topY + 0.05, 0);
        if (kind === 'taxi') add(kit.rbox(0.26, 0.1, 0.18, 0.03), kit.mat('#ffffff', { e: '#fff3b0', ei: 0.4 }), -0.08, topY + 0.04, 0);
        if (kind === 'polizia') { add(kit.rbox(0.12, 0.08, 0.16, 0.02), kit.mat('#3a6bff', { e: '#3a6bff', ei: 0.8 }), -0.08, topY + 0.03, -0.09); add(kit.rbox(0.12, 0.08, 0.16, 0.02), kit.mat('#ff3b3b', { e: '#ff3b3b', ei: 0.8 }), -0.08, topY + 0.03, 0.09); add(kit.rbox(Lx - 0.1, 0.06, Wd + 0.01, 0.02), kit.mat('#2f4fd0'), 0, 0.3, 0, false); }
      }
      // headlights
      for (const s of [-1, 1]) add(kit.geo('hl', () => new THREE.SphereGeometry(0.05, 8, 6)), kit.mat('#fff6c8', { e: '#ffe9a0', ei: this.theme.night ? 1.6 : 0.3 }), Lx / 2 - 0.01, 0.3, s * 0.26, false);
    } else {
      // len 3: van, bus, truck, ice-cream van
      if (kind === 'bus') {
        color = pick(['#ff8a3d', '#3fbf6a', '#3aa0ff', '#ffc928']);
        const bm = kit.mat(color, { r: 0.45 });
        add(kit.rbox(Lx, 0.66, Wd, 0.1), bm, 0, 0.14 + 0.33, 0);
        add(kit.rbox(Lx + 0.02, 0.2, Wd + 0.02, 0.04), glass, 0, 0.62, 0, false);
        add(kit.rbox(Lx - 0.2, 0.06, Wd - 0.2, 0.03), kit.mat('#f2f2f2'), 0, 0.83, 0);
        wheelsAt([Lx / 2 - 0.4, -Lx / 2 + 0.4], 0.15); eyeX = Lx / 2 + 0.012; eyeY = 0.62; topY = 0.86; eyeS = 1.15;
      } else if (kind === 'camion') {
        color = pick(['#e53b3b', '#3a6bff', '#2fae6a', '#ff9a2e']);
        const cab = kit.mat(color, { r: 0.45 });
        add(kit.rbox(0.82, 0.62, Wd, 0.1), cab, Lx / 2 - 0.41, 0.14 + 0.31, 0);
        add(kit.rbox(0.84, 0.2, Wd - 0.1, 0.04), glass, Lx / 2 - 0.4, 0.58, 0, false);
        add(kit.rbox(Lx - 0.9, 0.78, Wd + 0.02, 0.05), kit.mat(pick(['#f2f2f2', '#d9dee6', '#ffd36e', '#bfe7ff']), { r: 0.7 }), -0.45, 0.14 + 0.39, 0);
        wheelsAt([Lx / 2 - 0.36, -Lx / 2 + 0.36, -Lx / 2 + 0.72], 0.15); eyeX = Lx / 2 + 0.012; eyeY = 0.58; topY = 0.92; eyeS = 1.1;
      } else {
        color = kind === 'gelati' ? '#ffd1e8' : pick(VAN_COLORS);
        const bm = kit.mat(color, { r: 0.5 });
        add(kit.rbox(Lx - 0.5, 0.7, Wd, 0.1), bm, -0.25, 0.14 + 0.35, 0);
        add(kit.rbox(0.62, 0.46, Wd, 0.1), bm, Lx / 2 - 0.31, 0.14 + 0.23, 0);
        add(kit.rbox(0.22, 0.24, Wd - 0.08, 0.04), glass, Lx / 2 - 0.5, 0.6, 0, false);
        wheelsAt([Lx / 2 - 0.36, -Lx / 2 + 0.4], 0.15); eyeX = Lx / 2 - 0.39; eyeY = 0.6; topY = 0.84;
        if (kind === 'gelati') {
          const cone = add(kit.geo('cone', () => new THREE.ConeGeometry(0.16, 0.36, 10)), kit.mat('#e2a45a'), -0.4, 1.02, 0); cone.rotation.z = Math.PI;
          add(kit.geo('scoop', () => new THREE.SphereGeometry(0.18, 12, 10)), kit.mat('#ff8ac0'), -0.4, 1.24, 0);
          add(kit.rbox(Lx - 0.6, 0.08, Wd + 0.01, 0.02), kit.mat('#7ad1ff'), -0.25, 0.42, 0, false);
        } else add(kit.rbox(Lx - 0.62, 0.08, Wd + 0.01, 0.02), kit.mat(pick(['#3aa0ff', '#ff5a4e', '#2fae6a'])), -0.25, 0.42, 0, false);
      }
      for (const s of [-1, 1]) add(kit.geo('hl', () => new THREE.SphereGeometry(0.05, 8, 6)), kit.mat('#fff6c8', { e: '#ffe9a0', ei: this.theme.night ? 1.6 : 0.3 }), Lx / 2 - 0.01, 0.3, s * 0.28, false);
    }
    // eyes on the windscreen: white, pupils that look where the car goes, lids that blink, brows when cross
    const eyes = new THREE.Group(); eyes.position.set(eyeX, eyeY, 0); eyes.scale.setScalar(eyeS); eyes.rotation.z = 0.7; body.add(eyes); // tilted up: readable from the camera
    const pupils = [], lids = [], brows = [];
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(kit.geo('eye', () => { const gg = new THREE.SphereGeometry(0.115, 14, 10); gg.scale(0.4, 1.15, 1); return gg; }), kit.mat('#ffffff', { r: 0.3 })); e.position.set(0, 0, s * eyeZ); eyes.add(e);
      const p = new THREE.Mesh(kit.geo('pup', () => { const gg = new THREE.SphereGeometry(0.058, 10, 8); gg.scale(0.45, 1.1, 1); return gg; }), kit.mat('#15171c', { r: 0.2 })); p.position.set(0.04, -0.01, s * eyeZ); eyes.add(p); pupils.push(p);
      const lid = new THREE.Mesh(kit.geo('lid', () => { const gg = new THREE.SphereGeometry(0.122, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2); gg.scale(0.45, 1.2, 1.05); return gg; }), kit.mat(color, { r: 0.45 })); lid.position.set(0.004, 0, s * eyeZ); lid.scale.y = 0.05; eyes.add(lid); lids.push(lid);
      const br = new THREE.Mesh(kit.geo('brow', () => new THREE.BoxGeometry(0.03, 0.035, 0.16)), kit.mat('#15171c')); br.position.set(0.03, 0.17, s * eyeZ); br.visible = false; eyes.add(br); brows.push([br, s]);
    }
    // 'all' puzzles: a chevron on the roof shows the way out
    if (this.B.goal === 'all' || c.hero) {
      const sh = new THREE.Shape(); sh.moveTo(-0.1, -0.13); sh.lineTo(0.08, 0); sh.lineTo(-0.1, 0.13); sh.lineTo(-0.03, 0); sh.closePath();
      const ch = new THREE.Mesh(kit.geo('chev', () => { const gg = new THREE.ShapeGeometry(sh); gg.rotateX(-Math.PI / 2); return gg; }), kit.mat(c.hero ? '#ffe14a' : '#ffffff', { e: c.hero ? '#ffcf00' : '#ffffff', ei: 0.3 }));
      ch.position.set(c.hero && model === 'ape' ? -0.32 : len === 3 ? -0.3 : -0.08, topY + 0.012, 0); ch.scale.setScalar(len === 3 ? 1.6 : 1.1); body.add(ch);
      if (c.hero) { const star = new THREE.Mesh(kit.geo('star', () => { const s2 = new THREE.Shape(); for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2, rr = k % 2 ? 0.06 : 0.14; s2[k ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr); } s2.closePath(); return new THREE.ShapeGeometry(s2); }), new THREE.MeshStandardMaterial({ color: '#ffe14a', emissive: '#ffcf00', emissiveIntensity: 0.7, side: THREE.DoubleSide })); star.position.set(-0.08, topY + 0.32, 0); star.scale.setScalar(1.3); body.add(star); g.userData.star = star; }
    }
    // soft shadow blob (all tiers: grounds the car even without shadow maps)
    const blob = new THREE.Mesh(kit.geo(`blob${len}`, () => { const gg = new THREE.PlaneGeometry(Lx + 0.16, Wd + 0.16); gg.rotateX(-Math.PI / 2); return gg; }), this.blobMat || (this.blobMat = new THREE.MeshBasicMaterial({ map: this.blobTex(), transparent: true, depthWrite: false, opacity: 0.55 })));
    blob.position.y = 0.057; g.add(blob);
    // picking uses the visible meshes (what the player sees on top), the ground blob never counts
    blob.raycast = () => {}; g.userData.car = i;
    // a slightly bigger low box helps fingers hit thin parts (wheels, bumpers), below the bodies
    const pick2 = new THREE.Mesh(kit.geo(`pick${len}`, () => new THREE.BoxGeometry(len - 0.06, 0.3, 0.9)), new THREE.MeshBasicMaterial({ visible: false })); pick2.position.y = 0.15; g.add(pick2);
    this.scene.add(g);
    const v = { i, c, g, body, eyes, eyeS, eyeZ, pupils, lids, brows, star: g.userData.star, wheels: g.userData.wheels || [], pick: pick2, vp: this.s[i], vel: 0, prevVel: 0, blink: 1 + hashI(seed + 3) * 4, angry: 0, hop: 0, exitT: -1, shake: 0, look: 0, color };
    g.rotation.y = c.ax === 0 ? (c.dir > 0 ? 0 : Math.PI) : (c.dir > 0 ? -Math.PI / 2 : Math.PI / 2);
    this.placeVehicle(v);
    return v;
  }
  blobTex() {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 6, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }
  // world position of a vehicle at (fractional) position p along its axis
  placeVehicle(v, p = v.vp) {
    const c = v.c, B = this.B;
    const centre = p + c.len / 2;
    if (c.ax === 0) v.g.position.set(centre - B.w / 2, 0.05, c.fix - B.h / 2 + 0.5);
    else v.g.position.set(c.fix - B.w / 2 + 0.5, 0.05, centre - B.h / 2);
  }

  buildFx() {
    const kit = this.kit;
    // puffs (exhaust / dust) and confetti
    this.puffs = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.16, 0), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, transparent: true, opacity: 0.85 }), 60);
    this.puffs.count = 0; this.puffs.frustumCulled = false; this.scene.add(this.puffs); this.puffL = [];
    this.conf = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.1, 0.06), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), 220);
    this.conf.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(220 * 3), 3);
    this.conf.count = 0; this.conf.frustumCulled = false; this.scene.add(this.conf); this.confL = [];
    void kit;
  }
  // comic speech bubble over a honking car
  bubble(v, text) {
    if (!this.bubbles) this.bubbles = [];
    const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.strokeStyle = '#15171c'; g.lineWidth = 8;
    g.beginPath(); g.roundRect(12, 12, 232, 82, 34); g.moveTo(110, 92); g.lineTo(128, 120); g.lineTo(146, 92); g.fill(); g.stroke();
    g.fillStyle = '#fff'; g.fillRect(104, 84, 48, 12);
    g.fillStyle = '#ff3b3b'; g.font = 'italic 900 52px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 56);
    const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, transparent: true, depthTest: false }));
    sp.renderOrder = 10; this.scene.add(sp);
    this.bubbles.push({ sp, v, t: 0 });
    while (this.bubbles.length > 4) { const b = this.bubbles.shift(); this.scene.remove(b.sp); b.sp.material.map.dispose(); b.sp.material.dispose(); }
  }
  puff(x, y, z, n = 6, spread = 0.3, up = 0.8) { for (let k = 0; k < n; k++) { if (this.puffL.length >= 60) this.puffL.shift(); this.puffL.push({ x: x + (Math.random() - 0.5) * spread, y, z: z + (Math.random() - 0.5) * spread, vx: (Math.random() - 0.5) * 0.8, vy: up * (0.5 + Math.random()), vz: (Math.random() - 0.5) * 0.8, t: 0, life: 0.5 + Math.random() * 0.4, s: 0.6 + Math.random() * 0.8 }); } }
  confetti(x, z, n = 160) {
    const cols = ['#ff3b3b', '#ffc928', '#3fe0b0', '#3aa0ff', '#9b5cff', '#ff7ac8'].map((c) => new THREE.Color(c));
    for (let k = 0; k < n; k++) { if (this.confL.length >= 220) this.confL.shift(); const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 3; this.confL.push({ x, y: 0.6, z, vx: Math.cos(a) * sp, vy: 4 + Math.random() * 4, vz: Math.sin(a) * sp, rx: Math.random() * 6, ry: Math.random() * 6, w: 4 + Math.random() * 8, t: 0, life: 2.4 + Math.random(), c: cols[k % cols.length] }); }
  }

  // ---------------------------------------------------------------- HUD + camera
  resize() {
    const r = this.root.getBoundingClientRect(); const W = Math.max(1, r.width), H = Math.max(1, r.height);
    this.renderer.setSize(W, H, false);
    this.vw = W; this.vh = H;
    this.fitCamera();
  }
  // fit the lot (plus the exit) into the part of the screen the HUD leaves free
  fitCamera() {
    const W = this.vw, H = this.vh, B = this.B, cam = this.cam;
    const root = this.root.getBoundingClientRect();
    const top = this.root.querySelector('.ig-top')?.getBoundingClientRect(), bot = this.root.querySelector('.ig-bot')?.getBoundingClientRect();
    let fx = 8, fy = 8, fw = W - 16, fh = H - 16;
    if (top && top.height > top.width) { fx = top.right - root.left + 6; fw = W - fx - 8; } // landscape phones: a side panel
    else if (top) { const t = top.bottom - root.top + 6; fy = Math.max(fy, t); fh = H - fy - 8; }
    if (bot) {
      const side = bot.height > bot.width; // landscape phones: the buttons stand in a column on the right
      if (side) fw = Math.min(fw, bot.left - root.left - 8 - fx); else fh = Math.min(fh, bot.top - root.top - 6 - fy);
    }
    fw = Math.max(80, fw); fh = Math.max(80, fh);
    const aspect = W / H, portrait = fw / fh < 0.9;
    cam.aspect = aspect; cam.fov = 36;
    const pitch = (portrait ? 62 : 54) * Math.PI / 180;
    this.camPitch = pitch;
    const ex = B.w / 2 + 0.45, ez = B.h / 2 + 0.45;
    let extraR = 0, extraL = 0, extraT = 0, extraB = 0;
    if (B.goal === 'hero') { const s = this.exitSide; if (s === 0) extraR = 1.1; if (s === 2) extraL = 1.1; if (s === 1) extraB = 1.1; if (s === 3) extraT = 1.1; }
    const pts = [];
    for (const x of [-ex - extraL, ex + extraR]) for (const z of [-ez - extraT, ez + extraB]) for (const y of [0, 0.9]) pts.push(new THREE.Vector3(x, y, z));
    const cx = fx + fw / 2, cy = fy + fh / 2;
    cam.setViewOffset(W, H, W / 2 - cx, H / 2 - cy, W, H);
    const v = new THREE.Vector3();
    const fits = (D) => {
      cam.position.set(0, Math.sin(pitch) * D, Math.cos(pitch) * D); cam.lookAt(0, 0, 0); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
      for (const p of pts) { v.copy(p).project(cam); const px = (v.x * 0.5 + 0.5) * W, py = (-v.y * 0.5 + 0.5) * H; if (px < fx || px > fx + fw || py < fy || py > fy + fh) return false; }
      return true;
    };
    let lo = 4, hi = 80;
    for (let k = 0; k < 24; k++) { const m = (lo + hi) / 2; if (fits(m)) hi = m; else lo = m; }
    this.camD = hi; fits(hi);
  }
  syncHud() {
    const mv = this.$('ig-mv'); if (mv) mv.textContent = this.moves;
    const st = starsFor(this.L, this.moves, this.L.time ? this.time : 0, this.hinted);
    const el = this.$('ig-stars'); if (el) el.innerHTML = [1, 2, 3].map((k) => `<i class="${k <= st ? 'on' : ''}">★</i>`).join('');
    this.syncTime();
  }
  syncTime() {
    const t = this.$('ig-tm'); if (!t) return;
    if (this.L.time) { const left = Math.max(0, this.L.time - this.time); t.textContent = fmtT(Math.ceil(left)); this.$('ig-tmw')?.classList.toggle('low', left < 15); }
    else t.textContent = fmtT(this.time);
  }
  msg(text, ms = 2200, cls = '') {
    const m = this.$('ig-msg'); if (!m) return;
    m.textContent = text; m.className = `ig-msg on ${cls}`;
    clearTimeout(this._msgT); this._msgT = setTimeout(() => { m.className = 'ig-msg'; }, ms);
  }
  syncLights(first = false) {
    if (!this.lightViews?.length) return;
    for (const l of this.lightViews) {
      const red = isRed(this.B, this.s, l.cell);
      l.pad.material.color.set(red ? '#ff3b3b' : '#3ee07a'); l.pad.material.opacity = red ? 0.45 : 0.28;
      l.lampR.material.color.set(red ? '#ff3b3b' : '#4a1515'); l.lampG.material.color.set(red ? '#123a1f' : '#3ee07a');
    }
    if (!first) snd.light();
  }

  // ---------------------------------------------------------------- input
  bindInput() {
    const cv = this.cv;
    this.ray = new THREE.Raycaster(); this.ndc = new THREE.Vector2();
    this.onPD = (e) => this.pointerDown(e); this.onPM = (e) => this.pointerMove(e); this.onPU = (e) => this.pointerUp(e);
    cv.addEventListener('pointerdown', this.onPD);
    window.addEventListener('pointermove', this.onPM); window.addEventListener('pointerup', this.onPU); window.addEventListener('pointercancel', this.onPU);
    this.onKD = (e) => this.keyDown(e);
    window.addEventListener('keydown', this.onKD, true);
    this.onBtn = (e) => {
      const b = e.target.closest('[data-k]'); if (!b) return;
      e.preventDefault(); e.stopPropagation();
      const k = b.dataset.k;
      if (k === 'pause') this.togglePause(true); else if (k === 'undo') this.undo(); else if (k === 'restart') this.restart(); else if (k === 'hint') this.hint();
      b.blur();
    };
    this.root.querySelector('.ig-hud').addEventListener('click', this.onBtn);
    this.onVis = () => { if (document.hidden && !this.done) this.togglePause(true); };
    document.addEventListener('visibilitychange', this.onVis);
  }
  rayAt(e) {
    const r = this.cv.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.cam);
    return this.ray;
  }
  planeAt(e, y = 0.3) { const ray = this.rayAt(e).ray; const t = (y - ray.origin.y) / ray.direction.y; return ray.origin.clone().addScaledVector(ray.direction, t); }
  pickAt(e) {
    const ray = this.rayAt(e);
    const objs = this.vs.filter((v) => v.g.visible && this.s[v.i] !== EXITED).map((v) => v.g);
    if (this.ferry) objs.push(this.ferry);
    const hit = ray.intersectObjects(objs, true)[0];
    this._hitY = hit ? clamp(hit.point.y, 0.05, 1.2) : 0.3;
    if (hit) { let o = hit.object; while (o && o.userData.car === undefined && o !== this.ferry) o = o.parent; if (o === this.ferry) return -1; if (o) return o.userData.car; }
    // fallback: the cell under the pointer
    const p = this.planeAt(e, 0.05), B = this.B;
    const x = Math.floor(p.x + B.w / 2), y = Math.floor(p.z + B.h / 2);
    if (x < 0 || y < 0 || x >= B.w || y >= B.h) return -2;
    const o = occupancy(B, this.s)[y * B.w + x];
    if (o && o !== 255) return o - 1;
    if (x === B.rx) return -1;
    return -2;
  }
  canPlay() { return !this.paused && !this.done && !this.busy; }
  pointerDown(e) {
    if (!this.canPlay() || this.drag) return;
    this.commitPending();
    const id = this.pickAt(e);
    if (id === -2) return;
    e.preventDefault();
    try { this.cv.setPointerCapture(e.pointerId); } catch {}
    const B = this.B, occ = occupancy(B, this.s);
    const hy = this._hitY ?? 0.3, p0 = this.planeAt(e, hy); // the grabbed point follows the finger
    if (id === -1) {
      if (B.rx < 0) return;
      this.drag = { ferry: true, hy, id: e.pointerId, start: this.fvp, p0, x0: e.clientX, y0: e.clientY, t0: performance.now(), free: ferryFree(B, this.s, occ), samples: [] };
    } else {
      const r = carRange(B, this.s, id, occ);
      this.drag = { car: id, hy, id: e.pointerId, start: this.s[id], p0, x0: e.clientX, y0: e.clientY, t0: performance.now(), r, samples: [] };
      this.vs[id].dragging = true;
    }
    this.sel = id; this.started = true;
    snd.pick();
  }
  pointerMove(e) {
    const d = this.drag; if (!d || e.pointerId !== d.id) return;
    const p = this.planeAt(e, d.hy), B = this.B;
    if (d.ferry) {
      const v = d.start + (p.z - d.p0.z);
      this.fvp = d.free ? clamp(v, -0.3, B.h - B.fl + 0.3) : d.start + clamp(v - d.start, -0.12, 0.12);
      d.samples.push([e.timeStamp, this.fvp]);
      return;
    }
    const v = this.vs[d.car], c = v.c;
    const raw = d.start + (c.ax === 0 ? p.x - d.p0.x : p.z - d.p0.z);
    const lo = d.r.lo, hi = d.r.hi;
    let x = raw;
    if (x > hi) x = d.r.outHi ? x : hi + Math.min(0.3, (x - hi) * 0.25);
    if (x < lo) x = d.r.outLo ? x : lo - Math.min(0.3, (lo - x) * 0.25);
    v.vp = x; v.vel = 0;
    d.samples.push([e.timeStamp, x]); if (d.samples.length > 8) d.samples.shift();
    d.pushed = raw > hi + 0.3 ? 1 : raw < lo - 0.3 ? -1 : 0;
  }
  pointerUp(e) {
    const d = this.drag; if (!d || e.pointerId !== d.id) return;
    this.drag = null;
    const tap = Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 9 && performance.now() - d.t0 < 1200;
    // release speed (cells / s) from the last samples
    let vel = 0; const sm = d.samples;
    if (sm.length >= 2) { const a = sm[0], b = sm[sm.length - 1]; const dt = (b[0] - a[0]) / 1000; if (dt > 0.03 && e.timeStamp - b[0] < 100) vel = (b[1] - a[1]) / dt; }
    if (d.ferry) {
      const B = this.B;
      if (tap) { this.tapFerry(); return; }
      if (!d.free) { this.blockedFerry(); return; }
      let y = Math.round(this.fvp);
      if (Math.abs(vel) > 7) y = vel > 0 ? B.h - B.fl : 0;
      y = clamp(y, 0, B.h - B.fl);
      if (y !== this.s[B.n]) this.commit([-1, y]);
      return;
    }
    const v = this.vs[d.car]; v.dragging = false;
    if (tap) { v.vp = this.s[d.car]; this.tapCar(d.car); return; }
    const r = d.r, c = v.c;
    let target = clamp(Math.round(v.vp), r.lo, r.hi);
    if (r.outHi && (v.vp > r.hi + 0.55 || (vel > 6))) target = EXITED;
    else if (r.outLo && (v.vp < r.lo - 0.55 || (vel < -6))) target = EXITED;
    else if (vel > 6) target = r.hi; else if (vel < -6) target = r.lo;
    if (target === EXITED) { this.commit([d.car, EXITED], vel > 0 || v.vp > r.hi ? 1 : -1); return; }
    if (target !== this.s[d.car]) this.commit([d.car, target]);
    else if (d.pushed) this.blocked(d.car, d.pushed);
    void c;
  }
  // tap: drive forward as far as possible (out if the way is clear), else back up; honk if stuck
  tapCar(i) {
    const B = this.B, r = carRange(B, this.s, i), c = B.cars[i], p = this.s[i];
    const fwd = c.dir;
    if (fwd > 0 ? r.outHi : r.outLo) { this.commit([i, EXITED], fwd); return; }
    const far = fwd > 0 ? r.hi : r.lo, back = fwd > 0 ? r.lo : r.hi;
    if (far !== p) { this.commit([i, far]); return; }
    if (back !== p) { this.commit([i, back]); return; }
    this.blocked(i, fwd);
  }
  tapFerry() {
    const B = this.B; if (!ferryFree(B, this.s)) { this.blockedFerry(); return; }
    const y = this.s[B.n], top = 0, bot = B.h - B.fl;
    this.commit([-1, y - top >= bot - y ? top : bot]);
  }
  blockedFerry() { snd.honk('camion', 1.2); this.msg('Il traghetto parte solo vuoto'); this.ferryShake = 0.4; }
  // pushing against a wall of traffic: the blocker honks back
  blocked(i, d) {
    const B = this.B, c = B.cars[i], p = this.s[i], occ = occupancy(B, this.s), size = c.ax === 0 ? B.w : B.h;
    const f = d > 0 ? p + c.len : p - 1;
    const v = this.vs[i]; v.shake = 0.35; v.angry = 1.2;
    snd.bump();
    if (f >= 0 && f < size) {
      const cell = c.ax === 0 ? c.fix * B.w + f : f * B.w + c.fix, o = occ[cell];
      if (o && o !== 255) { const w = this.vs[o - 1]; w.hop = 0.35; w.angry = 1.4; this.bubble(w, 'BIIP!'); setTimeout(() => snd.carHonk(w.c.len, 0.9 + Math.random() * 0.25), 90); }
      else if (isRed(B, this.s, cell)) this.msg('Rosso! Aspetta una mossa');
      else if (B.arrows[cell] >= 0) this.msg('Senso unico: non si entra contromano');
      else if (B.rx >= 0 && f === B.rx && c.ax === 0) this.msg('C’è il canale: serve il traghetto');
    } else if (!(B.goal === 'hero' && i !== B.hero)) this.msg(B.goal === 'all' ? 'Si esce solo dal muso' : 'Da qui non si esce');
    else this.msg('Solo l’auto con la stella può uscire');
  }

  keyDown(e) {
    if (!this.root.isConnected || document.querySelector('.modal-wrap')) return;
    if (e.ctrlKey && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); e.stopPropagation(); if (this.canPlay()) this.undo(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (this.done) return;
    if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') { e.preventDefault(); e.stopPropagation(); this.togglePause(!this.paused); return; }
    if (!this.canPlay()) return;
    const k = e.key;
    const B = this.B;
    const list = this.vs.filter((v) => this.s[v.i] !== EXITED).map((v) => v.i);
    if (B.rx >= 0) list.push(-1);
    const stop = () => { e.preventDefault(); e.stopPropagation(); };
    if (k === 'Tab' || k === 'q' || k === 'Q' || k === 'e' || k === 'E') {
      stop(); this.commitPending();
      if (!list.length) return;
      const back = e.shiftKey || k === 'q' || k === 'Q';
      const order = this.sortedForKeys(list);
      const at = order.indexOf(this.sel);
      this.sel = order[(at < 0 ? (back ? order.length - 1 : 0) : at + (back ? -1 : 1) + order.length) % order.length];
      snd.pick(); this.started = true; return;
    }
    if (k === 'z' || k === 'Z' || k === 'Backspace') { stop(); this.undo(); return; }
    if (k === 'r' || k === 'R') { stop(); this.restart(); return; }
    if (k === 'h' || k === 'H') { stop(); this.hint(); return; }
    const AR = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1], d: [1, 0], a: [-1, 0], s: [0, 1], w: [0, -1], D: [1, 0], A: [-1, 0], S: [0, 1], W: [0, -1] }[k];
    if (AR) {
      stop(); this.started = true;
      if (this.sel === -2 || (this.sel >= 0 && this.s[this.sel] === EXITED)) { this.sel = this.sortedForKeys(list)[0] ?? -2; snd.pick(); return; }
      if (this.sel === -1) { // ferry: up / down
        if (AR[1] === 0) { this.selectToward(AR, list); return; }
        if (!ferryFree(B, this.s)) { this.blockedFerry(); return; }
        const y = clamp(this.s[B.n] + AR[1], 0, B.h - B.fl); if (y !== this.s[B.n]) this.commit([-1, y]); return;
      }
      const c = B.cars[this.sel], along = c.ax === 0 ? AR[0] : AR[1];
      if (!along) { this.selectToward(AR, list); return; }
      this.nudge(this.sel, along);
      return;
    }
    if (k === 'Enter' || k === ' ') {
      stop();
      if (this.pending) { this.commitPending(); return; }
      if (this.sel >= 0 && this.s[this.sel] !== EXITED) this.tapCar(this.sel); else if (this.sel === -1) this.tapFerry();
    }
  }
  sortedForKeys(list) { const pos = (i) => { if (i === -1) return [this.B.rx, this.s[this.B.n]]; const c = this.B.cars[i]; return c.ax === 0 ? [this.s[i], c.fix] : [c.fix, this.s[i]]; }; return list.slice().sort((a, b) => { const A = pos(a), Bp = pos(b); return A[1] - Bp[1] || A[0] - Bp[0]; }); }
  selectToward(d, list) {
    this.commitPending();
    const ctr = (i) => { if (i === -1) return [this.B.rx + 0.5, this.s[this.B.n] + this.B.fl / 2]; const c = this.B.cars[i], p = this.s[i]; return c.ax === 0 ? [p + c.len / 2, c.fix + 0.5] : [c.fix + 0.5, p + c.len / 2]; };
    const [x0, y0] = ctr(this.sel);
    let best = null, bd = Infinity;
    for (const i of list) { if (i === this.sel) continue; const [x, y] = ctr(i), dx = x - x0, dy = y - y0; const f = dx * d[0] + dy * d[1]; if (f <= 0.2) continue; const side = Math.abs(dx * d[1]) + Math.abs(dy * d[0]); const sc = f + side * 2; if (sc < bd) { bd = sc; best = i; } }
    if (best !== null) { this.sel = best; snd.pick(); }
  }
  // keyboard: one cell at a time; the slide is one move, committed after a short pause or on Enter
  nudge(i, d) {
    const B = this.B;
    if (this.pending && this.pending.i !== i) this.commitPending();
    if (!this.pending) this.pending = { i, start: this.s[i], pos: this.s[i], r: carRange(B, this.s, i) };
    const P = this.pending, np = P.pos + d;
    if (np > P.r.hi || np < P.r.lo) {
      if ((d > 0 && P.r.outHi && P.pos === P.r.hi) || (d < 0 && P.r.outLo && P.pos === P.r.lo)) { this.pending = null; this.vs[i].vp = P.pos; this.commit([i, EXITED], d, P.start); return; }
      if (P.pos === P.start) { this.pending = null; this.blocked(i, d); } else { this.vs[i].shake = 0.2; snd.bump(); }
      return;
    }
    P.pos = np; this.vs[i].kbTarget = np; snd.squeak();
    clearTimeout(this._pendT); this._pendT = setTimeout(() => this.commitPending(), 700);
  }
  commitPending() {
    clearTimeout(this._pendT);
    const P = this.pending; if (!P) return;
    this.pending = null; this.vs[P.i].kbTarget = undefined;
    if (P.pos !== P.start) this.commit([P.i, P.pos]);
  }

  // ---------------------------------------------------------------- moves
  commit(m, exitDir = 0) {
    const B = this.B;
    if (!legal(B, this.s, m)) { if (m[0] >= 0) this.vs[m[0]].dragging = false; return false; }
    this.hist.push(this.s.slice());
    const from = m[0] >= 0 ? this.s[m[0]] : this.s[B.n];
    this.s = apply(B, this.s, m);
    this.moves++; this.started = true;
    if (m[0] < 0) { snd.ferry(); }
    else {
      const v = this.vs[m[0]], c = v.c;
      if (m[1] === EXITED) {
        const r = carRange(B, this.hist[this.hist.length - 1], m[0]);
        v.exitDir = exitDir || (r.outHi ? 1 : -1); v.exitT = 0; v.exitV = Math.max(4, Math.abs(v.vel));
        snd.vroom(c.len === 3);
        if (c.hero) { this.barrierUp = 1; snd.honk(this.o.horn || 'classico'); this.bubble(v, 'EVVIVA!'); }
        else { setTimeout(() => snd.carHonk(c.len, 1.15), 120); this.bubble(v, c.len === 3 ? 'PÖÖ!' : 'BIP BIP!'); }
      } else snd.slide(Math.abs(m[1] - from), c.len === 3);
    }
    if (B.hasLights) this.syncLights();
    // hint followed?
    if (this.hintMove && this.hintMove[0] === m[0] && this.hintMove[1] === m[1]) this.clearHint(); else if (this.hintMove) this.clearHint();
    this.syncHud();
    if (isGoal(B, this.s)) this.win();
    return true;
  }
  undo() {
    if (!this.canPlay()) return;
    this.commitPending();
    if (!this.hist.length) { this.msg('Niente da annullare'); return; }
    const prev = this.hist.pop();
    for (let i = 0; i < this.B.n; i++) if (this.s[i] === EXITED && prev[i] !== EXITED) this.reenter(i, prev[i]);
    this.s = prev; this.moves--; this.undos++;
    if (this.B.hasLights) this.syncLights();
    this.clearHint(); snd.undo(); this.syncHud();
  }
  reenter(i, p) {
    const v = this.vs[i], c = v.c, B = this.B, size = c.ax === 0 ? B.w : B.h;
    v.exitT = -1; v.g.visible = true; v.g.scale.setScalar(1);
    v.vp = (v.exitDir || c.dir) > 0 ? size + 0.6 : -c.len - 0.6; v.vel = 0;
    if (c.hero) this.barrierUp = 0;
    void p;
  }
  restart() {
    if (!this.canPlay()) return;
    this.commitPending();
    if (!this.hist.length) return;
    for (let i = 0; i < this.B.n; i++) if (this.s[i] === EXITED) this.reenter(i, this.s0[i]);
    this.s = this.s0.slice(); this.hist = []; this.moves = 0; this.restarts++;
    if (this.L.time) { this.time = 0; this.started = false; }
    this.syncLights(); this.clearHint(); snd.undo(); this.syncHud();
    this.msg('Si ricomincia!', 1200);
  }
  async hint() {
    if (!this.canPlay()) return;
    this.commitPending();
    if (this.hintMove) { this.msg('Segui il suggerimento evidenziato'); return; }
    this.busy = true; this.root.querySelector('.ig-hintb')?.classList.add('wait');
    this.msg('Ci penso…', 4000);
    let res = null;
    try { res = await job('solve', { level: this.L, state: Array.from(this.s) }); } catch (e) { console.warn('hint', e); }
    this.busy = false; this.root.querySelector('.ig-hintb')?.classList.remove('wait');
    if (this.done || !this.root.isConnected) return;
    if (!res || !res.moves.length) {
      // dead end (one-way streets can trap a car): find how far back the way out is
      let back = 0;
      for (let k = this.hist.length - 1; k >= 0; k--) { back++; const r = solve(this.B, this.hist[k], 120000); if (r) break; }
      this.msg(back ? `Vicolo cieco: annulla ${back} mosse` : 'Nessuna uscita da qui: ricomincia', 3500, 'warn');
      this.root.querySelector('[data-k=undo]')?.classList.add('pulse'); setTimeout(() => this.root.querySelector('[data-k=undo]')?.classList.remove('pulse'), 3000);
      return;
    }
    this.hints++; this.hinted = true; this.syncHud();
    const m = this.hintMove = res.moves[0];
    snd.hint();
    this.msg(`Suggerimento: ${m[0] < 0 ? 'sposta il traghetto' : m[1] === EXITED ? 'fai uscire il veicolo evidenziato' : 'sposta il veicolo evidenziato'} · ancora ${res.n} mosse`, 3500);
    this.showGhost(m);
  }
  showGhost(m) {
    const B = this.B, gh = this.ghost;
    if (m[0] < 0) { const [cx] = this.cellPos(B.rx, 0); gh.scale.set(1, 0.4, B.fl); gh.position.set(cx, 0.2, m[1] + B.fl / 2 - B.h / 2); gh.rotation.y = 0; gh.visible = true; return; }
    const c = B.cars[m[0]];
    let p = m[1];
    if (p === EXITED) { const r = carRange(B, this.s, m[0]); const size = c.ax === 0 ? B.w : B.h; p = r.outHi ? size : -c.len; }
    gh.scale.set(c.len - 0.1, 0.6, 0.86);
    const centre = p + c.len / 2;
    if (c.ax === 0) { gh.position.set(centre - B.w / 2, 0.35, c.fix - B.h / 2 + 0.5); gh.rotation.y = 0; } else { gh.position.set(c.fix - B.w / 2 + 0.5, 0.35, centre - B.h / 2); gh.rotation.y = Math.PI / 2; }
    gh.visible = true;
    this.sel = m[0];
  }
  clearHint() { this.hintMove = null; if (this.ghost) this.ghost.visible = false; }

  win() {
    this.done = true;
    const B = this.B;
    const r = { win: true, moves: this.moves, opt: this.L.opt, time: Math.round(this.time * 10) / 10, hinted: this.hinted, hints: this.hints, undos: this.undos, restarts: this.restarts };
    r.stars = starsFor(this.L, this.moves, this.L.time ? this.time : 0, this.hinted);
    this.result = r;
    // celebration: every car left honks, confetti at the exit
    setTimeout(() => {
      if (!this.root.isConnected) return;
      let x = 0, z = 0;
      if (B.goal === 'hero') { const c = B.cars[B.hero], size = c.ax === 0 ? B.w : B.h; const edge = c.dir > 0 ? size : 0; if (c.ax === 0) { x = edge - B.w / 2; z = c.fix - B.h / 2 + 0.5; } else { z = edge - B.h / 2; x = c.fix - B.w / 2 + 0.5; } }
      this.confetti(x, z); this.confetti(0, 0, 60);
      snd.fanfare();
      this.vs.forEach((v, k) => { if (this.s[v.i] !== EXITED) { setTimeout(() => { v.hop = 0.4; }, 80 * k); } });
    }, 650);
    clearTimeout(this._endT);
    this._endT = setTimeout(() => this.o.onEnd?.(r), 1700);
  }
  timeUp() {
    if (this.done) return;
    this.done = true;
    this.vs.forEach((v) => { v.angry = 3; });
    snd.carHonk(3, 0.8); setTimeout(() => snd.carHonk(2, 1.1), 200);
    const r = { win: false, fail: 'time', moves: this.moves, opt: this.L.opt, time: this.L.time, stars: 0, hinted: this.hinted, hints: this.hints, undos: this.undos, restarts: this.restarts };
    this.result = r;
    this._endT = setTimeout(() => this.o.onEnd?.(r), 1100);
  }
  togglePause(on = !this.paused) {
    if (this.done && on) return;
    this.paused = on;
    if (on) { this.commitPending(); if (this.drag) { const v = this.vs[this.drag.car]; if (v) { v.dragging = false; } this.drag = null; } }
    this.o.onPause?.(on);
  }

  // ---------------------------------------------------------------- frame
  loop(now) {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.max(0, Math.min(0.1, (now - this.last) / 1000)); this.last = now;
    this.step(dt);
    this.renderer.render(this.scene, this.cam);
    if (!this.paused) this.guard.tick();
  }
  step(dt) {
    if (this.paused) dt = 0;
    this.clock += dt;
    const B = this.B;
    if (this.started && !this.done && dt > 0) {
      const before = Math.floor(this.time);
      this.time += dt;
      if (Math.floor(this.time) !== before) this.syncTime();
      if (this.L.time && this.time >= this.L.time) { this.time = this.L.time; this.syncTime(); this.timeUp(); }
      else if (this.L.time && this.L.time - this.time < 10 && Math.floor(this.time) !== before) snd.tick();
    }
    // vehicles
    for (const v of this.vs) this.animVehicle(v, dt);
    // ferry
    if (this.ferry) {
      const drag = this.drag?.ferry;
      if (!drag) { const target = this.s[B.n], k = 160; this.fvel += ((target - this.fvp) * k - this.fvel * 2 * Math.sqrt(k)) * dt; this.fvp += this.fvel * dt; if (Math.abs(target - this.fvp) < 0.001 && Math.abs(this.fvel) < 0.01) { this.fvp = target; this.fvel = 0; } }
      this.placeFerry();
      if (this.ferryShake > 0) { this.ferryShake -= dt; this.ferry.position.x += Math.sin(this.clock * 60) * 0.03 * this.ferryShake; }
      this.ferry.position.y = Math.sin(this.clock * 1.7) * 0.012;
      if (this.flag) this.flag.rotation.x = Math.sin(this.clock * 6) * 0.25;
      if (this.waterTex) this.waterTex.offset.y = (this.clock * 0.08) % 1;
    }
    // barrier & exit arrows
    if (this.barrier) { const up = this.barrierUp ? 1 : 0; this.barrier.rotation.x += ((up ? -1.35 : 0) - this.barrier.rotation.x) * Math.min(1, dt * 8); }
    if (this.exitArrows) this.exitArrows.forEach((a, k) => { a.material.opacity = 0.35 + 0.55 * (0.5 + 0.5 * Math.sin(this.clock * 4 - k * 1.2)); });
    // selection ring
    const sv = this.sel >= 0 ? this.vs[this.sel] : null;
    if (sv && this.s[sv.i] !== EXITED && !this.done) {
      const c = sv.c; this.ring.visible = true;
      this.ring.scale.set(c.ax === 0 ? c.len + 0.06 : 1.06, c.ax === 0 ? 1.06 : c.len + 0.06, 1);
      this.ring.position.set(sv.g.position.x, 0.06, sv.g.position.z);
      this.ring.material.opacity = 0.55 + 0.35 * Math.sin(this.clock * 6);
      this.ring.material.color.set(this.hintMove && this.hintMove[0] === this.sel ? '#ffe14a' : '#ffffff');
    } else if (this.sel === -1 && this.ferry && !this.done) {
      this.ring.visible = true; this.ring.scale.set(1.06, this.B.fl + 0.06, 1); this.ring.position.set(this.ferry.position.x, 0.08, this.ferry.position.z);
      this.ring.material.opacity = 0.55 + 0.35 * Math.sin(this.clock * 6);
    } else this.ring.visible = false;
    if (this.ghost.visible) this.ghost.material.opacity = 0.25 + 0.2 * Math.sin(this.clock * 5);
    this.animFx(dt);
    if (this.bubbles?.length) this.bubbles = this.bubbles.filter((b) => {
      b.t += dt; const p = b.v.g.position, k = Math.min(1, b.t / 0.12), out = Math.max(0, b.t - 0.9) / 0.3;
      b.sp.position.set(p.x, 1.25 + b.t * 0.25, p.z); const s = 0.9 * (k < 1 ? 0.4 + k * 0.7 : 1.1 - out * 0.3); b.sp.scale.set(s, s / 2, 1);
      b.sp.material.opacity = 1 - out;
      if (b.t > 1.2) { this.scene.remove(b.sp); b.sp.material.map.dispose(); b.sp.material.dispose(); return false; }
      return true;
    });
    const cam = this.cam;
    if (this.camOverride) this.camOverride(cam);
  }
  animVehicle(v, dt) {
    const c = v.c, B = this.B;
    const prev = v.vp;
    if (v.exitT >= 0) {
      // driving off: accelerate along the axis, out of the lot and down the street
      v.exitT += dt; v.exitV = Math.min(22, v.exitV + 26 * dt);
      v.vp += v.exitDir * v.exitV * dt;
      const size = c.ax === 0 ? B.w : B.h;
      const out = v.exitDir > 0 ? v.vp - size : -(v.vp + c.len);
      if (!v.puffed && out > -0.2) { v.puffed = true; const p = v.g.position; this.puff(p.x, 0.15, p.z, 7, 0.5, 0.6); }
      if (out > 9) { v.g.visible = false; v.exitT = -2; }
      v.g.scale.setScalar(out > 6 ? Math.max(0.01, 1 - (out - 6) / 3) : 1);
    } else if (v.exitT === -2) { /* gone */ }
    else if (!v.dragging) {
      const target = v.kbTarget ?? this.s[v.i];
      if (target !== EXITED) {
        const k = 190; v.vel += ((target - v.vp) * k - v.vel * 2 * Math.sqrt(k) * 0.9) * dt; v.vp += v.vel * dt;
        if (Math.abs(target - v.vp) < 0.0008 && Math.abs(v.vel) < 0.01) { v.vp = target; v.vel = 0; }
      }
    }
    this.placeVehicle(v);
    const moved = v.vp - prev, speed = dt > 0 ? moved / dt : 0;
    for (const w of v.wheels) w.rotation.z -= moved * c.dir * 7;
    // squash & tilt: lean back when accelerating, nose dive when braking
    const acc = dt > 0 ? (speed - (v.lastSpeed || 0)) / dt : 0; v.lastSpeed = speed;
    const lean = clamp(acc * 0.0009 * c.dir, -0.09, 0.09);
    v.body.rotation.z += (lean - v.body.rotation.z) * Math.min(1, dt * 14);
    // hop (honk back / celebration) and shake (bumped)
    let y = 0;
    if (v.hop > 0) { v.hop -= dt; y = Math.sin((1 - v.hop / 0.4) * Math.PI) * 0.18; }
    v.body.position.y = Math.max(0, y);
    if (v.shake > 0) { v.shake -= dt; v.body.position.z = Math.sin(this.clock * 70) * 0.04 * (v.shake / 0.35); } else v.body.position.z = 0;
    // eyes: blink, look where we go (or at the pointer target), angry brows
    v.blink -= dt;
    let lid = 0;
    if (v.blink < 0.14) lid = 1 - Math.abs(v.blink - 0.07) / 0.07;
    if (v.blink < 0) v.blink = 2 + hashI(v.i * 97 + Math.floor(this.clock * 3)) * 4;
    if (v.angry > 0) v.angry -= dt;
    v.eyes.scale.y = v.eyeS * (1 - lid * 0.92);
    for (const l of v.lids) l.scale.y = v.angry > 0 ? 1 : 0.05;
    for (const [br, s] of v.brows) { br.visible = v.angry > 0; br.rotation.x = s * 0.5; }
    const look = clamp(speed * c.dir * 0.02, -0.03, 0.03);
    const side = v.exitT >= 0 ? 0 : Math.sin(this.clock * 0.7 + v.i) * 0.012;
    v.look += (look - v.look) * Math.min(1, dt * 10);
    for (const [k, p] of v.pupils.entries()) { p.position.y = -0.01 + v.look * 0.4; p.position.z = (k ? 1 : -1) * 0.15 + side + (v.angry > 0 ? (k ? -0.012 : 0.012) : 0); }
    if (v.star) { v.star.rotation.y += dt * 2; v.star.position.y += (Math.sin(this.clock * 3) * 0.002); }
  }
  animFx(dt) {
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), E = new THREE.Euler();
    let n = 0;
    this.puffL = this.puffL.filter((p) => (p.t += dt) < p.life);
    for (const p of this.puffL) { p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vy *= 0.96; const k = p.t / p.life, s = p.s * (0.5 + k) * (1 - k * 0.6); S.set(s, s, s); P.set(p.x, p.y, p.z); M.compose(P, Q.identity(), S); this.puffs.setMatrixAt(n++, M); }
    this.puffs.count = n; this.puffs.instanceMatrix.needsUpdate = true;
    n = 0;
    this.confL = this.confL.filter((p) => (p.t += dt) < p.life);
    for (const p of this.confL) {
      p.vy -= 9 * dt; p.vx *= 0.99; p.vz *= 0.99; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.07) { p.y = 0.07; p.vy = 0; p.vx *= 0.8; p.vz *= 0.8; }
      else { p.rx += p.w * dt; p.ry += p.w * 0.7 * dt; }
      E.set(p.rx, p.ry, 0); Q.setFromEuler(E); S.set(1, 1, 1); P.set(p.x, p.y, p.z); M.compose(P, Q, S);
      this.conf.setMatrixAt(n, M); this.conf.setColorAt(n, p.c); n++;
    }
    this.conf.count = n; this.conf.instanceMatrix.needsUpdate = true; if (this.conf.instanceColor) this.conf.instanceColor.needsUpdate = true;
  }

  // ---------------------------------------------------------------- test / tools hooks
  info() { return { moves: this.moves, opt: this.L.opt, done: this.done, time: this.time, state: Array.from(this.s), goal: this.B.goal, n: this.B.n, hinted: this.hinted, pr: this.renderer.getPixelRatio(), guard: this.guard.log, sel: this.sel }; }
  toScreen(x, y, z) { const v = new THREE.Vector3(x, y, z).project(this.cam), r = this.cv.getBoundingClientRect(); return { x: r.left + (v.x * 0.5 + 0.5) * r.width, y: r.top + (-v.y * 0.5 + 0.5) * r.height }; }
  cellScreen(x, y) { const [cx, cz] = this.cellPos(x, y); return this.toScreen(cx, 0.3, cz); }
  carScreen(i) { const v = this.vs[i], g = v.g.position, top = new THREE.Box3().setFromObject(v.body).max.y; return this.toScreen(g.x, top - 0.03, g.z); }
  ferryScreen() { const p = this.ferry.position; return this.toScreen(p.x, 0.1, p.z); }
  // pixels per cell along a car's axis at its position (for drags in tests)
  axisScreen(i) { const c = this.B.cars[i], g = this.vs[i].g.position; const y = new THREE.Box3().setFromObject(this.vs[i].body).max.y - 0.03; const a = this.toScreen(g.x, y, g.z), b = this.toScreen(g.x + (c.ax === 0 ? 1 : 0), y, g.z + (c.ax === 1 ? 1 : 0)); return { x: b.x - a.x, y: b.y - a.y }; }
  doMove(m) { return this.commit(m); }
  solveNow() { const r = solve(this.B, this.s, 300000); return r ? r.moves : null; }

  destroy() {
    cancelAnimationFrame(this.raf); clearTimeout(this._endT); clearTimeout(this._msgT); clearTimeout(this._pendT);
    window.removeEventListener('keydown', this.onKD, true);
    window.removeEventListener('pointermove', this.onPM); window.removeEventListener('pointerup', this.onPU); window.removeEventListener('pointercancel', this.onPU);
    document.removeEventListener('visibilitychange', this.onVis);
    this.ro?.disconnect();
    this.scene?.traverse((x) => { x.geometry?.dispose?.(); const m = x.material; (Array.isArray(m) ? m : m ? [m] : []).forEach((y) => { y.map?.dispose?.(); y.emissiveMap?.dispose?.(); y.dispose?.(); }); });
    this.renderer?.dispose(); this.renderer?.forceContextLoss?.();
    this.root.innerHTML = '';
  }
}
