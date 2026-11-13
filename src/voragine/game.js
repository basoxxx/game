// Voragine — you are a sinkhole opening in a city. Swallow anything smaller than you, grow,
// swallow the smaller rival sinkholes. Three.js; the hole is cut out of the ground with the stencil
// buffer so whatever falls in is really seen going down.
import * as THREE from 'three';
import { KINDS, MILESTONES, CITIES, layoutCity, HALF, ROAD, BLOCK, NB, roadC, rng } from './city.js';

export const MODES = {
  classica: { name: 'Classica', sub: '2 minuti contro 7 voragini rivali. Vince la più grande.', time: 120, rivals: 7, respawn: true },
  battaglia: { name: 'Battaglia', sub: 'Nessuna seconda possibilità: chi viene inghiottito è fuori. Resta l’ultima.', time: 150, rivals: 7, respawn: false },
  solitaria: { name: 'Solitaria', sub: 'Solo tu e la città: inghiottisci più che puoi in 2 minuti.', time: 120, rivals: 0, respawn: false },
};
export const DIFFS = {
  facile: { name: 'Facile', speed: 0.82, smart: 0.45, aggro: 0.35 },
  normale: { name: 'Normale', speed: 0.94, smart: 0.75, aggro: 0.65 },
  difficile: { name: 'Difficile', speed: 1.02, smart: 1, aggro: 1 },
};
export const SKINS = [
  { id: 'notte', name: 'Notte Viola', color: '#8b5cff', cost: 0 },
  { id: 'menta', name: 'Menta', color: '#2ee6a6', cost: 80 },
  { id: 'lava', name: 'Lava', color: '#ff5a1f', cost: 160 },
  { id: 'abisso', name: 'Abisso', color: '#1e90ff', cost: 260 },
  { id: 'oro', name: 'Oro Zecchino', color: '#ffc928', cost: 400 },
  { id: 'arcobaleno', name: 'Arcobaleno', color: '#ff3d7f', cost: 700, rainbow: true },
];
const RIVAL_NAMES = ['Tombino', 'Crepa', 'Pozzanghera', 'Cratere', 'Gorgo', 'Risucchio', 'Fogna Reale', 'Tana', 'Abissino', 'Buca 47', 'Mulinello', 'Sprofondo'];
const RIVAL_COLORS = ['#ff4d6d', '#ffb000', '#2ec4b6', '#3a86ff', '#c77dff', '#80ed99', '#ff7b00', '#f15bb5', '#00bbf9', '#fee440'];

const R0 = 1.6, GROW = 0.25, EAT = 0.92;
const radiusOf = (pts) => R0 + GROW * Math.sqrt(Math.max(0, pts));
const BOUND = HALF + 4;
const CELL = 14;

// ---------- tiny procedural sound kit (own context: works even when the menu music is off)
class Sfx {
  constructor(vol) {
    try { this.c = new (window.AudioContext || window.webkitAudioContext)(); this.g = this.c.createGain(); this.g.gain.value = vol; this.g.connect(this.c.destination); } catch { this.c = null; }
    this.last = 0;
  }
  tone(f, dur, type = 'sine', peak = 0.2, slide = 0.5, delay = 0) {
    const c = this.c; if (!c) return;
    const t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.g); o.start(t); o.stop(t + dur + 0.05);
  }
  noise(dur, peak = 0.2, f = 400) {
    const c = this.c; if (!c) return;
    const n = Math.floor(c.sampleRate * dur), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 2;
    const s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
    s.buffer = b; fl.type = 'lowpass'; fl.frequency.value = f; g.gain.value = peak;
    s.connect(fl); fl.connect(g); g.connect(this.g); s.start();
  }
  gulp(size) { // size 0..1: bigger things, deeper gulp
    const now = performance.now(); if (now - this.last < 45 && size < 0.3) return; this.last = now;
    this.tone(900 - size * 700 + Math.random() * 120, 0.12 + size * 0.25, 'sine', 0.12 + size * 0.12, 0.35);
    if (size > 0.35) this.noise(0.35 + size * 0.5, 0.18 * size, 300 + 500 * (1 - size));
  }
  level() { [0, 4, 7, 12].forEach((s, i) => this.tone(440 * 2 ** (s / 12), 0.18, 'triangle', 0.12, 1, i * 0.07)); }
  eatHole() { this.noise(0.6, 0.3, 900); this.tone(220, 0.5, 'sawtooth', 0.08, 0.25); }
  lost() { this.tone(330, 0.6, 'triangle', 0.14, 0.4); }
  beep(hi) { this.tone(hi ? 880 : 520, hi ? 0.35 : 0.14, 'square', 0.06, 1); }
  close() { try { this.c?.close(); } catch {} }
}

// ---------- ground: one painted canvas for roads, kerbs, parks and plazas
function groundTexture(city, renderer) {
  const { cfg, blocks } = city, E = HALF + ROAD / 2 + 8, S = 2048, k = S / (2 * E);
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const P = (v) => (v + E) * k;
  const night = cfg.night, sunset = !night && cfg.sky === '#f7b98b';
  const col = night ? { grass: '#1f3a2a', asph: '#1d2028', walk: '#4a4c55', conc: '#3b3e48', line: '#c9c9a0', tile: '#454956' }
    : sunset ? { grass: '#7aa452', asph: '#4a4648', walk: '#d1c3b0', conc: '#b8aa98', line: '#f4ead2', tile: '#d9c4a8' }
      : { grass: '#6fae55', asph: '#41444c', walk: '#c9c4ba', conc: '#b3afa6', line: '#f4f1e6', tile: '#d8cfbf' };
  g.fillStyle = col.grass; g.fillRect(0, 0, S, S);
  g.fillStyle = col.asph;
  for (let i = 0; i <= NB; i++) { const c = roadC(i); g.fillRect(P(c - ROAD / 2), P(-HALF - ROAD / 2), ROAD * k, (2 * HALF + ROAD) * k); g.fillRect(P(-HALF - ROAD / 2), P(c - ROAD / 2), (2 * HALF + ROAD) * k, ROAD * k); }
  // lane markings and zebra crossings
  g.strokeStyle = col.line; g.lineWidth = 0.25 * k; g.setLineDash([2 * k, 2 * k]);
  for (let i = 0; i <= NB; i++) {
    const c = roadC(i);
    for (let s = 0; s < NB; s++) {
      const a = roadC(s) + ROAD / 2 + 3, b = roadC(s + 1) - ROAD / 2 - 3;
      g.beginPath(); g.moveTo(P(c), P(a)); g.lineTo(P(c), P(b)); g.stroke();
      g.beginPath(); g.moveTo(P(a), P(c)); g.lineTo(P(b), P(c)); g.stroke();
    }
  }
  g.setLineDash([]); g.fillStyle = col.line;
  for (let i = 0; i <= NB; i++) for (let j = 0; j <= NB; j++) {
    const x = roadC(i), z = roadC(j);
    for (let t = -ROAD / 2 + 0.6; t < ROAD / 2 - 0.5; t += 1.2) {
      g.fillRect(P(x + t), P(z - ROAD / 2 - 2.6), 0.6 * k, 2 * k); g.fillRect(P(x + t), P(z + ROAD / 2 + 0.6), 0.6 * k, 2 * k);
      g.fillRect(P(x - ROAD / 2 - 2.6), P(z + t), 2 * k, 0.6 * k); g.fillRect(P(x + ROAD / 2 + 0.6), P(z + t), 2 * k, 0.6 * k);
    }
  }
  for (const b of blocks) {
    g.fillStyle = col.walk; g.fillRect(P(b.x0), P(b.z0), BLOCK * k, BLOCK * k);
    const inner = b.type === 'park' || b.type === 'res' ? col.grass : b.type === 'plaza' || b.type === 'landmark' ? col.tile : b.type === 'parking' ? col.asph : col.conc;
    g.fillStyle = inner; g.fillRect(P(b.x0 + 2.4), P(b.z0 + 2.4), (BLOCK - 4.8) * k, (BLOCK - 4.8) * k);
    if (b.type === 'plaza' || b.type === 'landmark') { g.strokeStyle = 'rgba(0,0,0,.08)'; g.lineWidth = 1; for (let t = 2.4; t < BLOCK - 2.4; t += 2) { g.beginPath(); g.moveTo(P(b.x0 + t), P(b.z0 + 2.4)); g.lineTo(P(b.x0 + t), P(b.z0 + BLOCK - 2.4)); g.stroke(); g.beginPath(); g.moveTo(P(b.x0 + 2.4), P(b.z0 + t)); g.lineTo(P(b.x0 + BLOCK - 2.4), P(b.z0 + t)); g.stroke(); } }
    if (b.type === 'park') { g.fillStyle = col.walk; g.beginPath(); g.arc(P(b.x0 + BLOCK / 2), P(b.z0 + BLOCK / 2), 6.5 * k, 0, Math.PI * 2); g.fill(); g.fillRect(P(b.x0 + BLOCK / 2 - 1), P(b.z0 + 2.4), 2 * k, (BLOCK - 4.8) * k); }
    if (b.type === 'parking') { g.strokeStyle = col.line; g.lineWidth = 0.15 * k; for (let r = 0; r < 4; r++) for (let c = 0; c <= 6; c++) { const x = b.x0 + 1.8 + c * 4.4, z = b.z0 + 2.6 + r * 6.6; g.beginPath(); g.moveTo(P(x), P(z)); g.lineTo(P(x), P(z + 4.8)); g.stroke(); } }
    if (b.type === 'res') { g.fillStyle = 'rgba(0,0,0,.07)'; for (let i = -1; i <= 1; i++) g.fillRect(P(b.x0 + BLOCK / 2 + i * 9 - 0.7), P(b.z0 + 2.4), 1.4 * k, (BLOCK - 4.8) * k); }
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); t.generateMipmaps = true;
  return { tex: t, size: 2 * E, mini: cv };
}

// gradient used for the inside of the hole: rim colour at the top, black within a few metres
function wellTexture(color) {
  const cv = document.createElement('canvas'); cv.width = 4; cv.height = 256;
  const g = cv.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, color); gr.addColorStop(0.04, '#140a22'); gr.addColorStop(0.18, '#000'); gr.addColorStop(1, '#000');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(0, 0, 0, 'YXZ'), tmpP = new THREE.Vector3(), tmpS = new THREE.Vector3(), tmpV = new THREE.Vector3();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

export class VoragineGame {
  constructor(root, opts) {
    this.root = root;
    this.o = { mode: 'classica', city: 'centro', diff: 'normale', skin: 'notte', tier: 'high', volume: 0.5, ...opts };
    this.mode = MODES[this.o.mode] || MODES.classica;
    this.diff = DIFFS[this.o.diff] || DIFFS.normale;
    this.paused = false; this.over = false; this.time = this.mode.time; this.count = 3;
    this.keys = new Set(); this.pointer = null; this.joy = null;
    this.h = []; this.objs = []; this.movers = []; this.grid = new Map(); this.popAcc = 0; this.popT = 0;
    this.stats = { eaten: 0, holes: 0, biggest: '', start: 0 };
  }

  async start() {
    const o = this.o, root = this.root;
    root.innerHTML = `<canvas class="vg-cv"></canvas><div class="vg-hud">
      <div class="vg-top"><div class="vg-timer" id="vg-timer">2:00</div><div class="vg-mode">${this.mode.name} · ${CITIES[o.city]?.name || ''}</div></div>
      <ol class="vg-board" id="vg-board"></ol>
      <div class="vg-score"><div class="vg-score-k">Punti</div><div class="vg-score-v" id="vg-score">0</div><div class="vg-eat" id="vg-eat"></div></div>
      <div class="vg-level"><div class="vg-level-row"><span id="vg-lvl">Livello 1</span><span id="vg-next"></span></div><div class="vg-bar"><i id="vg-bar"></i></div></div>
      <canvas class="vg-mini" id="vg-mini" width="160" height="160"></canvas>
      <button class="vg-pausebtn" id="vg-pausebtn" aria-label="Pausa">II</button>
      <div class="vg-labels" id="vg-labels"></div><div class="vg-pops" id="vg-pops"></div>
      <div class="vg-toast" id="vg-toast"></div><div class="vg-count" id="vg-count"></div>
      <div class="vg-joy" id="vg-joy"><i></i></div>
    </div>`;
    this.cv = root.querySelector('.vg-cv');
    this.$ = (id) => root.querySelector('#' + id);
    const tier = o.tier;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas: this.cv, antialias: tier !== 'low', stencil: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio || 1, tier === 'high' ? 2 : tier === 'low' ? 1 : 1.5));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = tier !== 'low'; r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.sfx = new Sfx(o.volume);

    const city = this.city = layoutCity(o.city);
    const cfg = city.cfg;
    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color(cfg.sky);
    scene.fog = new THREE.Fog(cfg.fog, 140, 520);
    this.cam = new THREE.PerspectiveCamera(48, 1, 1, 1600);
    scene.add(new THREE.HemisphereLight(cfg.night ? '#6d7bd6' : '#dfeeff', cfg.night ? '#1a1c2a' : '#5a6b4a', cfg.amb));
    const sun = this.sun = new THREE.DirectionalLight(cfg.sun, cfg.night ? 0.55 : 1.9);
    sun.castShadow = r.shadowMap.enabled; sun.shadow.mapSize.set(tier === 'high' ? 2048 : 1024, tier === 'high' ? 2048 : 1024); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.4;
    scene.add(sun, sun.target);
    if (cfg.night) scene.add(new THREE.AmbientLight('#3b3f7a', 0.5));

    // ground (+ the stencil cut for every hole)
    const gt = groundTexture(city, r);
    this.miniBase = gt.mini;
    const stencilOut = { stencilWrite: true, stencilRef: 1, stencilFunc: THREE.NotEqualStencilFunc, stencilZPass: THREE.KeepStencilOp, stencilFail: THREE.KeepStencilOp };
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(gt.size, gt.size).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: gt.tex, ...stencilOut }));
    ground.receiveShadow = true; ground.renderOrder = -2; scene.add(ground);
    const outer = new THREE.Mesh(new THREE.RingGeometry(gt.size * 0.5, 1400, 4, 1).rotateX(-Math.PI / 2).rotateY(Math.PI / 4), new THREE.MeshLambertMaterial({ color: cfg.night ? '#16261d' : '#5f9a4a', ...stencilOut }));
    outer.position.y = -0.02; outer.renderOrder = -2; scene.add(outer);
    // a ring of non-edible hills beyond the city so the horizon is not empty
    const hillG = new THREE.ConeGeometry(1, 1, 7); const hillM = new THREE.MeshLambertMaterial({ color: cfg.night ? '#1a2a26' : '#4f8b45', flatShading: true });
    const hills = new THREE.InstancedMesh(hillG, hillM, 60); const hr = rng(cfg.seed + 5);
    for (let i = 0; i < 60; i++) { const a = (i / 60) * Math.PI * 2, d = 230 + hr() * 120, s = 30 + hr() * 50; tmpM.compose(tmpP.set(Math.cos(a) * d, s * 0.45, Math.sin(a) * d), tmpQ.identity(), tmpS.set(s, s * (0.6 + hr() * 0.8), s)); hills.setMatrixAt(i, tmpM); }
    scene.add(hills);

    this.buildObjects();
    this.buildHoles();
    this.bindInput();
    this.resize();
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(root);
    this.last = performance.now(); this.stats.start = Date.now();
    this.updateCamera(1, true);
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
    document.activeElement?.blur?.();
  }

  // ---------- city objects as instanced meshes
  buildObjects() {
    const { items, movers, cfg } = this.city;
    const counts = {};
    for (const it of items) counts[it.kind] = (counts[it.kind] || 0) + 1;
    for (const m of movers) counts[m.kind] = (counts[m.kind] || 0) + 1;
    this.meshes = {};
    const tr = rng(cfg.seed + 99), tc = new THREE.Color();
    const big = (k) => k.r >= 1.2;
    for (const [id, n] of Object.entries(counts)) {
      const k = KINDS[id], parts = k.build();
      const list = parts.map((geom, pi) => {
        const glow = pi > 0 && k.glow;
        const mat = glow && cfg.night ? new THREE.MeshBasicMaterial({ vertexColors: true, color: '#ffffff' }) : new THREE.MeshLambertMaterial({ vertexColors: true, ...(glow ? { color: cfg.night ? '#fff' : '#8fa3b8' } : {}) });
        const m = new THREE.InstancedMesh(geom, mat, n);
        m.castShadow = big(k) && pi === 0 && this.renderer.shadowMap.enabled; m.receiveShadow = false;
        m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(m); return m;
      });
      this.meshes[id] = { list, n: 0 };
    }
    const place = (kind, x, z, rot, s, mover = null) => {
      const k = KINDS[kind], M = this.meshes[kind], i = M.n++;
      const ob = { k, i, x, z, y: 0, rot, s, r: k.r * s, h: k.h * s, pts: k.pts * s * s, st: 0, tx: 0, tz: 0, mover };
      tc.set(k.tint[(tr() * k.tint.length) | 0]); if (k.tint.length > 1) tc.offsetHSL(0, 0, (tr() - 0.5) * 0.06);
      M.list[0].setColorAt(i, tc);
      this.objs.push(ob); this.setMatrix(ob);
      return ob;
    };
    for (const it of items) { const ob = place(it.kind, it.x, it.z, it.rot, it.s); this.gridAdd(ob); }
    for (const m of movers) {
      const x = m.axis === 'x' ? m.t : m.line, z = m.axis === 'x' ? m.line : m.t;
      const rot = m.axis === 'x' ? (m.dir > 0 ? 0 : Math.PI) : (m.dir > 0 ? -Math.PI / 2 : Math.PI / 2);
      this.movers.push(place(m.kind, x, z, rot, m.s, m));
    }
    for (const { list } of Object.values(this.meshes)) for (const m of list) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    this.totalPts = this.objs.reduce((a, b) => a + b.pts, 0);
    this.eatenPts = 0;
  }
  setMatrix(ob) {
    const M = this.meshes[ob.k.id];
    if (ob.st === 2) { for (const m of M.list) m.setMatrixAt(ob.i, ZERO); }
    else {
      tmpE.set(ob.tx || 0, ob.rot, ob.tz || 0); tmpQ.setFromEuler(tmpE);
      tmpM.compose(tmpP.set(ob.x, ob.y, ob.z), tmpQ, tmpS.set(ob.s, ob.s, ob.s));
      for (const m of M.list) m.setMatrixAt(ob.i, tmpM);
    }
    M.dirty = true;
  }
  gridKey(cx, cz) { return cx * 1000 + cz; }
  gridAdd(ob) { const k = this.gridKey(Math.floor(ob.x / CELL), Math.floor(ob.z / CELL)); let a = this.grid.get(k); if (!a) this.grid.set(k, (a = [])); a.push(ob); }
  query(x, z, rad, out) {
    out.length = 0;
    const x0 = Math.floor((x - rad) / CELL), x1 = Math.floor((x + rad) / CELL), z0 = Math.floor((z - rad) / CELL), z1 = Math.floor((z + rad) / CELL);
    for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) { const a = this.grid.get(this.gridKey(i, j)); if (a) for (const ob of a) if (ob.st === 0) out.push(ob); }
    return out;
  }

  // ---------- holes
  buildHoles() {
    const o = this.o, skin = SKINS.find((s) => s.id === o.skin) || SKINS[0];
    const spots = [];
    for (let i = 1; i < NB; i++) for (let j = 1; j < NB; j++) spots.push([roadC(i), roadC(j)]);
    for (let i = 0; i < NB; i++) for (const j of [0, NB]) { spots.push([roadC(i) + 21, roadC(j)]); spots.push([roadC(j), roadC(i) + 21]); }
    const sr = rng((Date.now() & 0xffff) + 7);
    for (let i = spots.length - 1; i > 0; i--) { const j = (sr() * (i + 1)) | 0; [spots[i], spots[j]] = [spots[j], spots[i]]; }
    // the player starts on an inner crossroad
    const inner = spots.findIndex(([x, z]) => Math.abs(x) < HALF * 0.6 && Math.abs(z) < HALF * 0.6);
    if (inner > 0) [spots[0], spots[inner]] = [spots[inner], spots[0]];
    const names = [...RIVAL_NAMES].sort(() => sr() - 0.5);
    const cols = RIVAL_COLORS.filter((c) => c.toLowerCase() !== skin.color.toLowerCase());
    this.h.push(this.makeHole({ name: 'Tu', color: skin.color, rainbow: skin.rainbow, player: true, x: spots[0][0], z: spots[0][1] }));
    for (let i = 0; i < this.mode.rivals; i++) this.h.push(this.makeHole({ name: names[i], color: cols[i % cols.length], x: spots[i + 1][0], z: spots[i + 1][1] }));
    this.me = this.h[0];
    this.spots = spots;
  }
  makeHole({ name, color, rainbow, player, x, z }) {
    const g = new THREE.Group();
    const mask = new THREE.Mesh(new THREE.CircleGeometry(1, 56).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, stencilWrite: true, stencilRef: 1, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp }));
    mask.position.y = 0.04; mask.renderOrder = -3;
    const stencilIn = { stencilWrite: true, stencilRef: 1, stencilFunc: THREE.EqualStencilFunc, stencilZPass: THREE.KeepStencilOp };
    const wt = wellTexture(color);
    const well = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 56, 1, true).translate(0, -0.5, 0), new THREE.MeshBasicMaterial({ map: wt, side: THREE.BackSide, ...stencilIn, fog: false }));
    well.renderOrder = -1;
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#000', ...stencilIn, fog: false }));
    bottom.position.y = -1; bottom.renderOrder = -1;
    const rim = new THREE.Mesh(new THREE.RingGeometry(1, 1.07, 72).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false }));
    rim.position.y = 0.06;
    const glow = new THREE.Mesh(new THREE.RingGeometry(1.07, 1.35, 72).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false }));
    glow.position.y = 0.05;
    g.add(mask, well, bottom, rim, glow);
    this.scene.add(g);
    const lab = document.createElement('div'); lab.className = 'vg-lab' + (player ? ' me' : ''); lab.style.setProperty('--c', color); lab.innerHTML = `<b>${name}</b>`;
    this.$('vg-labels').appendChild(lab);
    const h = { name, color, rainbow, player: !!player, x, z, vx: 0, vz: 0, pts: 0, r: R0, alive: true, out: false, respawn: 0, g, well, bottom, rim, glow, lab, kills: 0, eaten: 0, ai: { t: 0, tx: x, tz: z, wob: Math.random() * 10 }, lvl: 0, depth: 0 };
    this.applyHoleSize(h);
    return h;
  }
  applyHoleSize(h) {
    const r = h.r, depth = Math.max(26, r * 5);
    h.depth = depth;
    h.g.position.set(h.x, 0, h.z);
    h.g.children[0].scale.setScalar(r);
    h.well.scale.set(r, depth, r);
    h.bottom.scale.setScalar(r); h.bottom.position.y = -depth;
    h.rim.scale.setScalar(r); h.glow.scale.setScalar(r);
  }

  // ---------- input
  bindInput() {
    const game = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);
    this.onKD = (e) => {
      if (this.over) return;
      if (e.code === 'Escape' || e.code === 'KeyP') { e.preventDefault(); e.stopPropagation(); this.togglePause(); return; }
      if (game.has(e.code)) { e.preventDefault(); e.stopPropagation(); this.keys.add(e.code); this.pointer = null; }
    };
    this.onKU = (e) => { this.keys.delete(e.code); };
    window.addEventListener('keydown', this.onKD, true);
    window.addEventListener('keyup', this.onKU, true);
    const cv = this.cv;
    // mouse: the hole chases the point under the cursor · touch: virtual stick from where you press
    this.onPM = (e) => {
      if (e.pointerType === 'mouse') { this.pointer = { x: e.clientX, y: e.clientY }; return; }
      if (this.joy && e.pointerId === this.joy.id) { this.joy.x = e.clientX; this.joy.y = e.clientY; this.drawJoy(); }
    };
    this.onPD = (e) => {
      if (e.pointerType !== 'mouse' && !this.joy) { this.joy = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY }; cv.setPointerCapture?.(e.pointerId); this.drawJoy(); }
      if (e.pointerType === 'mouse') this.pointer = { x: e.clientX, y: e.clientY };
    };
    this.onPU = (e) => { if (this.joy && e.pointerId === this.joy.id) { this.joy = null; this.drawJoy(); } };
    this.onLeave = (e) => { if (e.pointerType === 'mouse') this.pointer = null; };
    cv.addEventListener('pointermove', this.onPM); cv.addEventListener('pointerdown', this.onPD);
    window.addEventListener('pointerup', this.onPU); window.addEventListener('pointercancel', this.onPU); cv.addEventListener('pointerleave', this.onLeave);
    this.onVis = () => { if (document.hidden && !this.paused && !this.over) this.togglePause(true); };
    document.addEventListener('visibilitychange', this.onVis);
    this.$('vg-pausebtn').addEventListener('click', () => this.togglePause());
    this.padStart = false;
  }
  drawJoy() {
    const el = this.$('vg-joy'); if (!el) return;
    if (!this.joy) { el.classList.remove('on'); return; }
    const rect = this.root.getBoundingClientRect();
    el.classList.add('on'); el.style.left = `${this.joy.ox - rect.left}px`; el.style.top = `${this.joy.oy - rect.top}px`;
    let dx = this.joy.x - this.joy.ox, dy = this.joy.y - this.joy.oy; const d = Math.hypot(dx, dy), m = 46; if (d > m) { dx *= m / d; dy *= m / d; }
    el.firstChild.style.transform = `translate(${dx}px, ${dy}px)`;
  }
  inputDir() {
    let x = 0, z = 0;
    const K = this.keys;
    if (K.has('KeyW') || K.has('ArrowUp')) z -= 1; if (K.has('KeyS') || K.has('ArrowDown')) z += 1;
    if (K.has('KeyA') || K.has('ArrowLeft')) x -= 1; if (K.has('KeyD') || K.has('ArrowRight')) x += 1;
    if (x || z) { const l = Math.hypot(x, z); return [x / l, z / l, 1]; }
    for (const p of navigator.getGamepads?.() || []) {
      if (!p) continue;
      const st = !!p.buttons[9]?.pressed; if (st && !this.padStart) this.togglePause(); this.padStart = st;
      const ax = p.axes[0] || 0, az = p.axes[1] || 0, l = Math.hypot(ax, az);
      if (l > 0.18) return [ax / Math.max(1, l), az / Math.max(1, l), Math.min(1, (l - 0.18) / 0.7)];
    }
    if (this.joy) { const dx = this.joy.x - this.joy.ox, dy = this.joy.y - this.joy.oy, l = Math.hypot(dx, dy); if (l > 6) return [dx / l, dy / l, Math.min(1, l / 46)]; return [0, 0, 0]; }
    if (this.pointer) {
      const rect = this.cv.getBoundingClientRect();
      const nx = ((this.pointer.x - rect.left) / rect.width) * 2 - 1, ny = -((this.pointer.y - rect.top) / rect.height) * 2 + 1;
      tmpV.set(nx, ny, 0.5).unproject(this.cam).sub(this.cam.position).normalize();
      if (tmpV.y < -0.01) {
        const t = -this.cam.position.y / tmpV.y, gx = this.cam.position.x + tmpV.x * t, gz = this.cam.position.z + tmpV.z * t;
        const dx = gx - this.me.x, dz = gz - this.me.z, l = Math.hypot(dx, dz);
        if (l > this.me.r * 0.25) return [dx / l, dz / l, Math.min(1, l / (this.me.r * 1.6 + 2))];
      }
    }
    return [0, 0, 0];
  }
  togglePause(force) {
    if (this.over) return;
    this.paused = force ?? !this.paused;
    this.keys.clear();
    this.o.onPause?.(this.paused);
  }

  resize() {
    const w = this.root.clientWidth || innerWidth, h = this.root.clientHeight || innerHeight;
    this.renderer.setSize(w, h, false);
    this.cam.aspect = w / h; this.cam.updateProjectionMatrix();
  }

  // ---------- frame
  loop(now) {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.max(0, Math.min(0.05, (now - this.last) / 1000)); this.last = Math.max(this.last, now);
    if (!this.paused && !this.over) this.step(dt);
    else if (this.paused) { this.inputDir(); }
    this.updateCamera(dt);
    for (const M of Object.values(this.meshes)) if (M.dirty) { for (const m of M.list) m.instanceMatrix.needsUpdate = true; M.dirty = false; }
    this.renderer.render(this.scene, this.cam);
    this.updateLabels();
  }
  step(dt) {
    // countdown
    if (this.count > 0) {
      const before = Math.ceil(this.count); this.count -= dt; const after = Math.ceil(this.count);
      const el = this.$('vg-count');
      if (after !== before || !el.textContent) { el.textContent = after > 0 ? after : 'Via!'; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); this.sfx.beep(after <= 0); }
      if (this.count <= 0) setTimeout(() => { if (el) el.textContent = ''; }, 700);
      this.animateMovers(dt);
      this.updateHud(dt);
      return;
    }
    this.time -= dt;
    this.animateMovers(dt);
    this.moveHoles(dt);
    this.eat(dt);
    this.updateFalling(dt);
    this.updateHud(dt);
    if (this.time <= 0) this.finish('time');
    else if (this.o.mode === 'battaglia' && this.h.filter((h) => !h.out).length <= 1) this.finish('last');
    else if (this.o.mode === 'solitaria' && this.eatenPts >= this.totalPts * 0.985) this.finish('all');
  }
  animateMovers(dt) {
    for (const ob of this.movers) {
      if (ob.st !== 0) continue;
      const m = ob.mover;
      m.t += m.dir * m.speed * dt;
      const lim = HALF + ROAD / 2 + 4;
      if (m.t > lim) m.t = -lim; else if (m.t < -lim) m.t = lim;
      if (m.axis === 'x') { ob.x = m.t; ob.z = m.line; } else { ob.x = m.line; ob.z = m.t; }
      if (ob.k.id === 'person') ob.y = Math.abs(Math.sin(m.t * 3.2)) * 0.08;
      this.setMatrix(ob);
    }
  }
  moveHoles(dt) {
    for (const h of this.h) {
      if (h.out) continue;
      if (!h.alive) { h.respawn -= dt; if (h.respawn <= 0) this.respawn(h); continue; }
      let dx = 0, dz = 0, amt = 0;
      if (h.player) [dx, dz, amt] = this.inputDir();
      else[dx, dz, amt] = this.think(h, dt);
      const sp = (6.6 + h.r * 0.26) * (h.player ? 1 : this.diff.speed);
      const k = 1 - Math.exp(-dt * 7);
      h.vx += (dx * amt * sp - h.vx) * k; h.vz += (dz * amt * sp - h.vz) * k;
      h.x = Math.max(-BOUND, Math.min(BOUND, h.x + h.vx * dt)); h.z = Math.max(-BOUND, Math.min(BOUND, h.z + h.vz * dt));
      const target = radiusOf(h.pts);
      h.r += (target - h.r) * (1 - Math.exp(-dt * 3.5));
      this.applyHoleSize(h);
      if (h.rainbow) { const c = new THREE.Color().setHSL((performance.now() / 4000) % 1, 0.9, 0.6); h.rim.material.color.copy(c); h.glow.material.color.copy(c); }
    }
  }
  respawn(h) {
    const free = this.spots.map(([x, z]) => ({ x, z, d: Math.min(...this.h.filter((o) => o !== h && o.alive).map((o) => Math.hypot(o.x - x, o.z - z) - o.r)) })).sort((a, b) => b.d - a.d)[0];
    h.x = free.x; h.z = free.z; h.vx = h.vz = 0; h.alive = true; h.r = radiusOf(h.pts) * 0.6; h.g.visible = true; h.lab.style.display = '';
    h.ai.t = 0; this.applyHoleSize(h);
    if (h.player) this.toast('Sei di nuovo in gioco!');
  }

  // AI: go for the best food nearby, hunt smaller holes, run from bigger ones
  think(h, dt) {
    const ai = h.ai; ai.t -= dt;
    if (ai.t <= 0) {
      ai.t = 0.35 + Math.random() * 0.35;
      let flee = null, fd = Infinity;
      for (const o of this.h) {
        if (o === h || !o.alive || o.out) continue;
        const d = Math.hypot(o.x - h.x, o.z - h.z);
        if (o.r > h.r * 1.18 && d < o.r * 2.2 + 14 && d < fd) { fd = d; flee = o; }
      }
      ai.flee = flee && Math.random() < 0.4 + this.diff.smart * 0.6 ? flee : null;
      let best = null, bs = 0;
      if (Math.random() < this.diff.aggro) for (const o of this.h) {
        if (o === h || !o.alive || o.out || !(h.r > o.r * 1.25)) continue;
        const d = Math.hypot(o.x - h.x, o.z - h.z);
        if (d < 45 + h.r * 2) { const s = (o.pts * 0.5 + 6) / (d + 10) * 1.6; if (s > bs) { bs = s; best = { x: o.x, z: o.z, hole: o }; } }
      }
      const near = this.query(h.x, h.z, 34 + h.r * 1.5, this._q || (this._q = []));
      const lim = h.r * EAT, smart = this.diff.smart;
      for (let i = 0; i < near.length; i++) {
        const ob = near[i]; if (ob.r >= lim) continue;
        if (smart < 1 && Math.random() > smart + 0.2) continue;
        const d = Math.hypot(ob.x - h.x, ob.z - h.z), s = ob.pts / (d + 6);
        if (s > bs) { bs = s; best = { x: ob.x, z: ob.z }; }
      }
      if (!best) { if (Math.hypot(ai.tx - h.x, ai.tz - h.z) < 6 || ai.wander === undefined) { const s = this.spots[(Math.random() * this.spots.length) | 0]; ai.tx = s[0]; ai.tz = s[1]; ai.wander = 1; } }
      else { ai.tx = best.x; ai.tz = best.z; ai.prey = best.hole || null; ai.wander = undefined; }
    }
    if (ai.prey && ai.prey.alive) { ai.tx = ai.prey.x; ai.tz = ai.prey.z; }
    let dx = ai.tx - h.x, dz = ai.tz - h.z; let l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    if (ai.flee && ai.flee.alive) {
      let fx = h.x - ai.flee.x, fz = h.z - ai.flee.z; const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
      const w = Math.min(1, (ai.flee.r * 2.2 + 14) / fl);
      dx = dx * (1 - w) + fx * w * 1.6; dz = dz * (1 - w) + fz * w * 1.6;
      // walls: slide along instead of getting cornered
      if (Math.abs(h.x) > BOUND - 8) dx -= Math.sign(h.x) * 0.8; if (Math.abs(h.z) > BOUND - 8) dz -= Math.sign(h.z) * 0.8;
      l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    }
    ai.wob += dt;
    const wob = Math.sin(ai.wob * 1.7) * 0.18;
    return [dx - dz * wob, dz + dx * wob, Math.min(1, l / 2 + 0.25)];
  }

  eat() {
    const q = this._e || (this._e = []);
    for (const h of this.h) {
      if (!h.alive || h.out) continue;
      const lim = h.r * EAT;
      this.query(h.x, h.z, h.r + 1, q);
      for (let i = 0; i < q.length; i++) this.tryEat(h, q[i], lim);
      for (const ob of this.movers) if (ob.st === 0) this.tryEat(h, ob, lim);
    }
    // holes swallowing holes
    for (const a of this.h) {
      if (!a.alive || a.out) continue;
      for (const b of this.h) {
        if (a === b || !b.alive || b.out || !(a.r > b.r * 1.2)) continue;
        const d = Math.hypot(a.x - b.x, a.z - b.z);
        if (d < a.r - b.r * 0.45) this.swallowHole(a, b);
      }
    }
  }
  tryEat(h, ob, lim) {
    if (ob.r >= lim) return;
    const dx = ob.x - h.x, dz = ob.z - h.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d + ob.r * 0.4 > h.r) return;
    ob.st = 1; ob.hole = h; ob.vy = 0; ob.ft = 0;
    // fall away from the edge it was closest to: tilt into the hole
    ob.tiltDir = Math.atan2(dz, dx);
    h.pts += ob.pts; h.eaten++;
    this.eatenPts += ob.pts;
    if (h.player) {
      this.stats.eaten++;
      if (!this.stats.big || ob.pts > this.stats.big.pts) this.stats.big = ob;
      this.popAcc += ob.pts * 10;
      this.sfx.gulp(Math.min(1, ob.r / 12));
      if (ob.r > 5) this.shake = Math.min(1, (this.shake || 0) + ob.r / 20);
    }
  }
  swallowHole(a, b) {
    a.pts += b.pts * 0.5 + 8; a.kills++;
    b.alive = false; b.g.visible = false; b.lab.style.display = 'none';
    if (this.mode.respawn) { b.respawn = 3; b.pts *= 0.35; }
    else { b.out = true; b.outAt = this.mode.time - this.time; }
    if (a.player) { this.stats.holes++; this.sfx.eatHole(); this.toast(`Hai inghiottito ${b.name}!`); this.popAcc += (b.pts * 0.5 + 8) * 10; this.shake = 1; }
    else if (b.player) { this.sfx.lost(); this.toast(this.mode.respawn ? `${a.name} ti ha inghiottito! Riparti tra 3 secondi…` : `${a.name} ti ha inghiottito!`, true); }
    if (b.player && !this.mode.respawn) setTimeout(() => this.finish('eaten'), 1400);
  }
  updateFalling(dt) {
    for (const ob of this.objs) {
      if (ob.st !== 1) continue;
      const h = ob.hole;
      ob.ft += dt;
      const k = 1 - Math.exp(-dt * (2.4 + 4 / (ob.r + 1)));
      ob.x += (h.x - ob.x) * k; ob.z += (h.z - ob.z) * k;
      ob.vy += (16 + ob.h * 0.9) * dt; ob.y -= ob.vy * dt;
      const tilt = Math.min(1.25, ob.ft * (2.6 - Math.min(1.8, ob.h / 30)));
      // rotate the topple axis into the object's frame
      const a = ob.tiltDir + ob.rot;
      ob.tx = -Math.sin(a) * tilt; ob.tz = Math.cos(a) * tilt;
      if (ob.y < -(Math.min(h.depth - 1, ob.h * 1.05 + 4))) { ob.st = 2; }
      this.setMatrix(ob);
    }
  }

  // ---------- camera, HUD, labels
  updateCamera(dt, snap) {
    const me = this.me, r = me.r;
    const portrait = this.cam.aspect < 0.9 ? 1.35 : 1;
    const H = (21 + r * 3.3) * portrait, back = H * 0.62;
    let sx = 0, sz = 0;
    if (this.shake > 0) { this.shake = Math.max(0, this.shake - dt * 2.2); sx = (Math.random() - 0.5) * this.shake * 0.8; sz = (Math.random() - 0.5) * this.shake * 0.8; }
    const k = snap ? 1 : 1 - Math.exp(-dt * 4);
    this.camT = this.camT || new THREE.Vector3(me.x, 0, me.z);
    this.camT.x += (me.x - this.camT.x) * k; this.camT.z += (me.z - this.camT.z) * k;
    this.camH = snap ? H : this.camH + (H - this.camH) * (1 - Math.exp(-dt * 2));
    this.cam.position.set(this.camT.x + sx, this.camH, this.camT.z + this.camH * 0.62 + sz);
    this.cam.lookAt(this.camT.x, 0, this.camT.z - r * 0.15);
    // shadows follow the action
    const sh = this.sun.shadow.camera, ext = 40 + this.camH * 1.3;
    this.sun.position.set(this.camT.x + 70, 120, this.camT.z + 40); this.sun.target.position.set(this.camT.x, 0, this.camT.z);
    if (Math.abs(sh.right - ext) > 4) { sh.left = -ext; sh.right = ext; sh.top = ext; sh.bottom = -ext; sh.near = 1; sh.far = 400; sh.updateProjectionMatrix(); }
    this.scene.fog.near = 120 + this.camH * 1.2; this.scene.fog.far = 420 + this.camH * 3;
  }
  updateLabels() {
    const w = this.root.clientWidth, hgt = this.root.clientHeight;
    for (const h of this.h) {
      if (!h.alive || h.out) continue;
      tmpV.set(h.x, 0, h.z + h.r * 1.05).project(this.cam);
      const vis = tmpV.z < 1 && Math.abs(tmpV.x) < 1.1 && Math.abs(tmpV.y) < 1.1;
      h.lab.style.opacity = vis ? 1 : 0;
      if (vis) h.lab.style.transform = `translate(${((tmpV.x + 1) / 2) * w}px, ${((1 - tmpV.y) / 2) * hgt + 4}px) translate(-50%, 0)`;
    }
  }
  updateHud(dt) {
    const me = this.me;
    const t = Math.max(0, Math.ceil(this.time));
    const te = this.$('vg-timer'); te.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; te.classList.toggle('hot', t <= 10 && this.count <= 0);
    if (t <= 5 && t !== this._lastBeep && this.count <= 0) { this._lastBeep = t; this.sfx.beep(false); }
    this.$('vg-score').textContent = Math.round(me.pts * 10).toLocaleString('it-IT');
    if (this.o.mode === 'solitaria') this.$('vg-eat').textContent = `${((this.eatenPts / this.totalPts) * 100).toFixed(1)}% della città`;
    else this.$('vg-eat').textContent = `${this.stats.eaten} oggetti · ${this.stats.holes} voragini`;
    // what can I swallow now / next
    const lim = me.r * EAT; let lvl = 0, next = null;
    for (const id of MILESTONES) { if (KINDS[id].r < lim) lvl++; else { next = KINDS[id]; break; } }
    if (lvl > me.lvl && this.count <= 0) { if (me.lvl > 0) { this.sfx.level(); this.toast(`Livello ${lvl}! Ora puoi inghiottire: ${KINDS[MILESTONES[lvl - 1]].label}`); } }
    me.lvl = Math.max(me.lvl, lvl);
    this.$('vg-lvl').textContent = `Livello ${Math.max(1, lvl)}`;
    this.$('vg-next').textContent = next ? `Prossimo: ${next.label}` : 'Puoi inghiottire tutto!';
    const prevR = lvl > 0 ? KINDS[MILESTONES[lvl - 1]].r / EAT : R0, nextR = next ? next.r / EAT : prevR + 1;
    this.$('vg-bar').style.width = `${next ? Math.max(0, Math.min(100, ((me.r - prevR) / (nextR - prevR)) * 100)) : 100}%`;
    // points popup, batched so a crowd of pedestrians reads as one gulp
    this.popT -= dt;
    if (this.popAcc > 0 && this.popT <= 0) {
      this.popT = 0.28;
      const el = document.createElement('div'); el.className = 'vg-pop'; el.textContent = `+${Math.round(this.popAcc)}`;
      if (this.popAcc > 400) el.classList.add('big');
      this.$('vg-pops').appendChild(el); setTimeout(() => el.remove(), 900);
      this.popAcc = 0;
    }
    // leaderboard + minimap a few times a second
    this.hudT = (this.hudT || 0) - dt;
    if (this.hudT > 0) return;
    this.hudT = 0.25;
    const rank = this.ranking();
    const myI = rank.indexOf(me);
    const show = rank.slice(0, 5); if (myI >= 5) show.push(me);
    this.$('vg-board').innerHTML = show.map((h) => `<li class="${h.player ? 'me' : ''} ${h.out ? 'out' : ''}" style="--c:${h.color}"><span class="n">${rank.indexOf(h) + 1}</span><i></i><b>${h.name}</b><span class="p">${h.out ? 'fuori' : Math.round(h.pts * 10).toLocaleString('it-IT')}</span></li>`).join('');
    this.drawMini();
  }
  ranking() {
    if (this.o.mode === 'battaglia') return [...this.h].sort((a, b) => (a.out - b.out) || (a.out ? (b.outAt || 0) - (a.outAt || 0) : b.pts - a.pts));
    return [...this.h].sort((a, b) => b.pts - a.pts);
  }
  drawMini() {
    const cv = this.$('vg-mini'); if (!cv) return;
    const g = cv.getContext('2d'), S = cv.width, E = HALF + ROAD / 2 + 8, k = S / (2 * E);
    g.globalAlpha = 0.92; g.drawImage(this.miniBase, 0, 0, S, S); g.globalAlpha = 1;
    for (const h of this.h) {
      if (!h.alive || h.out) continue;
      g.beginPath(); g.arc((h.x + E) * k, (h.z + E) * k, Math.max(2.5, h.r * k), 0, Math.PI * 2);
      g.fillStyle = '#000'; g.fill(); g.lineWidth = h.player ? 2.5 : 1.5; g.strokeStyle = h.player ? '#fff' : h.color; g.stroke();
    }
  }
  toast(text, bad) {
    const el = this.$('vg-toast'); if (!el) return;
    el.textContent = text; el.classList.toggle('bad', !!bad); el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
    clearTimeout(this._toastT); this._toastT = setTimeout(() => el.classList.remove('on'), 2400);
  }

  finish(why) {
    if (this.over) return;
    this.over = true;
    const rank = this.ranking(), me = this.me;
    const pos = rank.indexOf(me) + 1;
    const score = Math.round(me.pts * 10);
    const pct = (this.eatenPts / this.totalPts) * 100;
    const solo = this.o.mode === 'solitaria';
    const stars = solo ? (pct >= 70 ? 3 : pct >= 45 ? 2 : pct >= 20 ? 1 : 0) : pos === 1 ? 3 : pos <= 3 ? 2 : pos <= 5 ? 1 : 0;
    const coins = Math.round(Math.sqrt(score) / 2) + stars * 8 + this.stats.holes * 5;
    this.sfx[pos === 1 || stars >= 2 ? 'level' : 'lost']();
    this.o.onEnd?.({
      why, pos, of: this.h.length, score, stars, coins, pct, mode: this.o.mode, city: this.o.city,
      eaten: this.stats.eaten, holes: this.stats.holes, big: this.stats.big?.k?.label || '', radius: me.r,
      ranking: rank.map((h) => ({ name: h.name, color: h.color, score: Math.round(h.pts * 10), player: h.player, out: h.out })),
    });
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKD, true); window.removeEventListener('keyup', this.onKU, true);
    window.removeEventListener('pointerup', this.onPU); window.removeEventListener('pointercancel', this.onPU);
    document.removeEventListener('visibilitychange', this.onVis);
    this.ro?.disconnect();
    this.sfx?.close();
    this.scene?.traverse((o) => { o.geometry?.dispose?.(); const m = o.material; (Array.isArray(m) ? m : m ? [m] : []).forEach((x) => { x.map?.dispose?.(); x.dispose?.(); }); });
    this.renderer?.dispose(); this.renderer?.forceContextLoss?.();
    this.root.innerHTML = '';
  }
}
