// Bastione — the live game: three.js map + units, HTML HUD, build/upgrade menus, controls (tap/click,
// drag to pan, pinch/wheel zoom, keyboard, gamepad cursor) and effects. The rules live in sim.js.
//
//   const g = new BastioneGame(root, opts); await g.start(); g.togglePause(); g.destroy();
//   g.step(dt) advances the game deterministically (sim in fixed 1/60 steps × speed) and refreshes the
//   HUD; the browser loop calls it every frame, tests call it directly (window.__bastione.step).
//   opts = { level, mode: 'level'|'endless'|'daily', diff, tree, hero, heroLvl, spells, seed, label,
//            tier, volume, shake, numbers, ranges, speed, seen: {type: 1}, onSeen(type),
//            onEnd(result), onQuit(), onRestart() }
import * as THREE from 'three';
import { pixelRatio } from '../ui/quality.js';
import { FrameGuard } from '../ui/perfguard.js';
import { osfx, sfx } from '../ui/audio.js';
import { figureGeometry, figureMaterial, Crowd } from '../orda/game.js';
import { Sim, TARGET_MODES } from './sim.js';
import { Autopilot } from './autopilot.js';
import { TOWERS, towerById, ENEMIES, HEROES, SPELLS, WORLDS, SELL_BACK } from './data.js';
import { endlessWave, MAP_W, MAP_H } from './levels.js';
import { towerModel, keepModel, gateModel, padModel, ACC, mat, disposeMats } from './models.js';
import { TOWER_ICON, ENEMY_ICON, HERO_ICON, SPELL_ICON, ABILITY_ICON, ICON_COIN, ICON_HEART, ICON_WAVE } from './icons.js';

const STEP = 1 / 60;
const FIG = 1.25;
const TC = new THREE.Color();
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fmt = (n) => Math.round(n).toLocaleString('it-IT');
const lerpAng = (a, b, k) => { let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI; if (d < -Math.PI) d += Math.PI * 2; return a + d * k; };
const PCOL = { arrow: '#f5e6c8', firearrow: '#ff7a1a', bullet: '#fde68a', ball: '#2f3542', bigball: '#1f2430', shell: '#3a2c22', bigshell: '#2a1f18', frost: '#9be7ff', goo: '#9be15d', fireball: '#ff8a1f', meteor: '#ff5a1f', comet: '#ffb020' };

// soft round particles, CPU simulated
class Particles {
  constructor(scene, n) {
    this.n = n; this.i = 0;
    this.pos = new Float32Array(n * 3).fill(-999); this.vel = new Float32Array(n * 3); this.col = new Float32Array(n * 3);
    this.size = new Float32Array(n); this.alpha = new Float32Array(n); this.life = new Float32Array(n); this.max = new Float32Array(n); this.grav = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    for (const [k, a, s] of [['position', this.pos, 3], ['color', this.col, 3], ['size', this.size, 1], ['alpha', this.alpha, 1]]) g.setAttribute(k, new THREE.BufferAttribute(a, s).setUsage(THREE.DynamicDrawUsage));
    this.uScale = { value: 400 };
    const m = new THREE.ShaderMaterial({
      uniforms: { uScale: this.uScale },
      vertexShader: 'attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA; uniform float uScale; void main(){ vC = color; vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = alpha > 0.0 ? clamp(size * uScale / max(1.0, -mv.z), 1.0, 80.0) : 0.0; }',
      fragmentShader: 'varying vec3 vC; varying float vA; void main(){ vec2 d = gl_PointCoord - 0.5; float r = dot(d, d) * 4.0; if (r > 1.0) discard; gl_FragColor = vec4(vC * (1.15 - r * 0.3), vA * (1.0 - r * r)); }',
      transparent: true, depthWrite: false,
    });
    this.pts = new THREE.Points(g, m); this.pts.frustumCulled = false; this.pts.renderOrder = 6; scene.add(this.pts);
  }
  emit(x, y, z, vx, vy, vz, c, size, life, grav = 9) {
    const i = this.i = (this.i + 1) % this.n, j = i * 3;
    this.pos[j] = x; this.pos[j + 1] = y; this.pos[j + 2] = z; this.vel[j] = vx; this.vel[j + 1] = vy; this.vel[j + 2] = vz;
    this.col[j] = c.r; this.col[j + 1] = c.g; this.col[j + 2] = c.b; this.size[i] = size; this.life[i] = this.max[i] = life; this.grav[i] = grav; this.alpha[i] = 1;
    this.dirty = true;
  }
  burst(x, y, z, n, col, { sp = 3, up = 3, size = 0.35, life = 0.7, grav = 9 } = {}) {
    TC.set(col);
    for (let k = 0; k < n; k++) { const a = Math.random() * 6.283, s = sp * (0.4 + Math.random() * 0.6); this.emit(x, y, z, Math.cos(a) * s, up * (0.4 + Math.random()), Math.sin(a) * s, TC, size * (0.6 + Math.random() * 0.7), life * (0.6 + Math.random() * 0.6), grav); }
  }
  update(dt) {
    if (!this.dirty) return;
    let any = false;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt; const j = i * 3;
      if (this.life[i] <= 0) { this.alpha[i] = 0; this.pos[j + 1] = -999; continue; }
      any = true;
      const d = Math.exp(-1.8 * dt);
      this.vel[j] *= d; this.vel[j + 2] *= d; this.vel[j + 1] = this.vel[j + 1] * d - this.grav[i] * dt;
      this.pos[j] += this.vel[j] * dt; this.pos[j + 1] += this.vel[j + 1] * dt; this.pos[j + 2] += this.vel[j + 2] * dt;
      if (this.pos[j + 1] < 0.05 && this.grav[i] > 0) { this.pos[j + 1] = 0.05; this.vel[j + 1] *= -0.3; }
      this.alpha[i] = Math.min(1, (this.life[i] / this.max[i]) * 2);
    }
    const a = this.pts.geometry.attributes;
    a.position.needsUpdate = a.alpha.needsUpdate = a.color.needsUpdate = a.size.needsUpdate = true;
    this.dirty = any;
  }
}
// an instanced accessory layer that follows the figures
class Layer {
  constructor(scene, geo, material, cap, color) {
    this.m = new THREE.InstancedMesh(geo, material, cap); this.m.count = 0; this.m.frustumCulled = false; this.cap = cap;
    this.m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (color) { this.m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3); }
    scene.add(this.m); this.n = 0; this.M = new THREE.Matrix4(); this.Q = new THREE.Quaternion(); this.P = new THREE.Vector3(); this.S = new THREE.Vector3(); this.Y = new THREE.Vector3(0, 1, 0);
  }
  begin() { this.n = 0; }
  put(x, y, z, rot, s, col, sy = s) {
    if (this.n >= this.cap) return;
    this.Q.setFromAxisAngle(this.Y, rot); this.M.compose(this.P.set(x, y, z), this.Q, this.S.set(s, sy, s));
    this.m.setMatrixAt(this.n, this.M); if (col && this.m.instanceColor) this.m.setColorAt(this.n, col);
    this.n++;
  }
  end() { this.m.count = this.n; this.m.instanceMatrix.needsUpdate = true; if (this.m.instanceColor) this.m.instanceColor.needsUpdate = true; }
}

export class BastioneGame {
  constructor(root, opts = {}) {
    this.root = root;
    this.o = { mode: 'level', diff: 'normale', tier: 'high', volume: 0.5, shake: true, numbers: true, ranges: true, speed: 1, seen: {}, ...opts };
    this.level = this.o.level; if (!this.level) throw new Error('BastioneGame: opts.level mancante');
    this.world = WORLDS[this.level.world || 0] || WORLDS[0];
    this.paused = false; this.over = false; this.acc = 0; this.clock = 0; this.speed = this.o.speed || 1;
    this.sel = null; this.arm = null; this.menuKey = ''; this.keys = new Set(); this.ptrs = new Map(); this.sfxT = {}; this.pops = [];
    this.zaps = []; this.rings = []; this.dying = []; this.towerObjs = new Map(); this.shakeT = 0; this.hudKey = {};
    this.uTime = { value: 0 };
    this.view = { tx: 0, tz: 0, zoom: 1 };
    this.pad = { on: false, x: 0, z: 0, prev: {}, rep: 0, fi: 0 };
  }

  async start() {
    const o = this.o, L = this.level, root = this.root;
    const tier = this.tier = o.tier || 'high';
    this.sim = new Sim(L, { diff: o.diff, tree: o.tree, hero: o.hero, heroLvl: o.heroLvl, spells: o.spells, seed: o.seed });
    root.innerHTML = this.hudHtml();
    this.cv = root.querySelector('.bs-cv');
    this.$ = (id) => root.querySelector('#' + id);
    const r = this.renderer = new THREE.WebGLRenderer({ canvas: this.cv, antialias: tier !== 'low', powerPreference: 'high-performance' });
    r.setPixelRatio(pixelRatio(1.75));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.08;
    r.shadowMap.enabled = tier === 'high'; r.shadowMap.type = THREE.PCFSoftShadowMap;
    const setPR = (pr) => { if (Math.abs(r.getPixelRatio() - pr) < 0.01) return false; r.setPixelRatio(pr); this.resize(); };
    this.guard = new FrameGuard([
      { fps: 45, run: () => setPR(Math.min(r.getPixelRatio(), 1)) },
      { fps: 38, run: () => { if (!r.shadowMap.enabled) return false; r.shadowMap.enabled = false; this.scene.traverse((x) => { if (x.material) x.material.needsUpdate = true; }); } },
      { fps: 30, run: () => setPR(0.75) },
    ]);
    this.buildScene();
    this.bindInput();
    this.resize();
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(root);
    if (o.autoplay) this.autoplay(true);
    this.syncHud(true);
    this.last = performance.now();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
    document.activeElement?.blur?.();
    if (L.tip) this.banner(L.tip, 'note', 7);
    this._helpT = setTimeout(() => this.$('bs-help')?.classList.add('off'), 12000);
  }

  // ───────── DOM
  hudHtml() {
    const L = this.level, S = this.sim, H = S.hero?.def;
    const title = this.o.label || (this.o.mode === 'level' ? `Livello ${L.id}` : this.o.mode === 'endless' ? 'Infinita' : 'Sfida del giorno');
    return `<canvas class="bs-cv"></canvas><div class="bs-hud">
      <div class="bs-top">
        <div class="bs-stats">
          <span class="bs-pill" id="bs-lives" title="Vite">${ICON_HEART}<b>20</b></span>
          <span class="bs-pill gold" id="bs-gold" title="Oro">${ICON_COIN}<b>0</b></span>
          <span class="bs-pill" id="bs-wave" title="Ondata">${ICON_WAVE}<b>0</b></span>
        </div>
        <div class="bs-title"><b>${esc(title)}</b><span>${esc(L.name || '')}</span></div>
        <div class="bs-ctrl">
          <button class="bs-btn" id="bs-speed" aria-label="Velocità (F)" title="Velocità (F)">x1</button>
          <button class="bs-btn" id="bs-pause" aria-label="Pausa (Spazio)" title="Pausa e pianifica (Spazio)">II</button>
          <button class="bs-btn" id="bs-menu" aria-label="Menu (Esc)" title="Menu (Esc)">☰</button>
        </div>
      </div>
      <button class="bs-call" id="bs-call"><span class="bs-call-l" id="bs-call-l">Inizia!</span><span class="bs-call-p" id="bs-call-p"></span><i id="bs-call-ring"></i></button>
      <div class="bs-paused" id="bs-paused"><b>Pausa</b><span>Puoi costruire e pianificare</span><button class="bs-btn" data-g="resume">▶ Riprendi</button></div>
      ${H ? `<div class="bs-herobar" id="bs-herobar">
        <button class="bs-hero" id="bs-hero" title="Seleziona l’eroe (H), poi tocca la mappa">${HERO_ICON[H.id]}<i class="bs-hp"><em id="bs-hhp"></em></i><small id="bs-hres"></small></button>
        ${H.ab.map((a, i) => `<button class="bs-ab" id="bs-ab${i}" data-ab="${i}" title="${esc(a.name)}: ${esc(a.desc)} (${i ? 'X' : 'Z'})">${ABILITY_ICON[a.id]}<i class="bs-cd"></i><small>${i ? 'X' : 'Z'}</small></button>`).join('')}
      </div>` : ''}
      <div class="bs-spells" id="bs-spells">${S.spells.map((s) => `<button class="bs-sp" id="bs-sp-${s.def.id}" data-sp="${s.def.id}" title="${esc(s.def.name)}: ${esc(s.def.desc)} (${s.def.key})">${SPELL_ICON[s.def.id]}<i class="bs-cd"></i><small>${s.def.key}</small></button>`).join('')}</div>
      <div class="bs-banner" id="bs-banner"></div>
      <div class="bs-pops" id="bs-pops"></div>
      <div class="bs-flash" id="bs-flash"></div>
      <div class="bs-help" id="bs-help">Tocca una piazzola per costruire · trascina per spostare la vista, pizzica o rotella per lo zoom · tocca il sentiero per muovere l’eroe<span class="bs-keys"> · <span class="kbd">1</span>–<span class="kbd">9</span> torri · <span class="kbd">N</span> ondata · <span class="kbd">Spazio</span> pausa · <span class="kbd">F</span> velocità</span></div>
      <div class="bs-pop" id="bs-pop" role="dialog"></div>
      <div class="bs-modal" id="bs-modal"></div>
    </div>`;
  }

  // ───────── scene
  buildScene() {
    const wd = this.world, tier = this.tier, S = this.sim;
    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color(wd.ground2);
    scene.fog = new THREE.Fog(wd.ground2, 70, 160);
    this.cam = new THREE.PerspectiveCamera(38, 1, 0.5, 300);
    scene.add(new THREE.HemisphereLight('#ffffff', wd.ground2, 1.3));
    const sun = new THREE.DirectionalLight('#fff4dc', 1.6);
    sun.position.set(-14, 30, 12); scene.add(sun, sun.target);
    if (tier === 'high') { sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); const c = sun.shadow.camera; c.left = -26; c.right = 26; c.top = 20; c.bottom = -20; c.near = 2; c.far = 90; sun.shadow.bias = -0.0006; }
    // ground: one big painted texture (grass, the road, puddles, flowers)
    const tex = this.paintMap();
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 40), new THREE.MeshLambertMaterial({ map: tex }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(320, 320), new THREE.MeshLambertMaterial({ color: wd.ground2 }));
    outer.rotation.x = -Math.PI / 2; outer.position.y = -0.03; outer.receiveShadow = true; scene.add(outer);
    this.ground = ground;
    // pads, keep, entry gates
    this.pads = S.slots.map((sl) => { const p = padModel(); p.position.set(sl.x, 0, sl.z); scene.add(p); return p; });
    const keep = this.keep = keepModel(); const kp = S.paths[0].pts, a = kp[kp.length - 2], b = kp[kp.length - 1];
    keep.position.set(S.keep.x, 0, S.keep.z); keep.rotation.y = Math.atan2(a[0] - b[0], a[1] - b[1]); keep.scale.setScalar(0.85); scene.add(keep);
    keep.traverse((x) => { if (x.isMesh) x.castShadow = tier === 'high'; });
    for (const p of S.paths) {
      const s = p.pts.find((q) => Math.abs(q[0]) <= MAP_W / 2 + 0.5 && Math.abs(q[1]) <= MAP_H / 2 + 0.5) ? p.pts[0] : p.pts[0];
      const n = p.pts[1], gx = Math.max(-19, Math.min(19, s[0])), gz = Math.max(-13, Math.min(13, s[1]));
      const g = gateModel(); g.position.set(gx, 0, gz); g.rotation.y = Math.atan2(n[0] - s[0], n[1] - s[1]); scene.add(g);
    }
    this.buildDeco();
    // figures
    const geo = this.figGeo = figureGeometry(), fm = this.figMat = figureMaterial(this.uTime);
    this.redC = new Crowd(scene, geo, fm, 320, tier === 'high');
    this.blueC = new Crowd(scene, geo, fm, 80, tier === 'high');
    this.dieC = new Crowd(scene, geo, fm, 80, false);
    const metal = new THREE.MeshLambertMaterial({ color: '#ffffff' }), gold = new THREE.MeshLambertMaterial({ color: '#ffd23f', emissive: '#b48a00', emissiveIntensity: 0.3 });
    const wingM = new THREE.MeshLambertMaterial({ color: '#ffffff', side: THREE.DoubleSide, transparent: true, opacity: 0.92 });
    this.lay = {
      helmet: new Layer(scene, ACC.helmet(), metal, 300, true), shield: new Layer(scene, ACC.shield(), metal, 200, true), wings: new Layer(scene, ACC.wings(), wingM, 120, true),
      crown: new Layer(scene, ACC.crown(), gold, 20), hood: new Layer(scene, ACC.hood(), metal, 120, true), band: new Layer(scene, ACC.band(), metal, 120, true),
      sword: new Layer(scene, ACC.sword(), metal, 100, true), dot: new Layer(scene, ACC.dot(), metal, 120, true),
    };
    // hp bars (billboards)
    const barG = new THREE.PlaneGeometry(1, 0.14);
    this.barBg = new Layer(scene, barG, new THREE.MeshBasicMaterial({ color: '#1b1b24', depthWrite: false, transparent: true, opacity: 0.75 }), 340);
    this.barFg = new Layer(scene, barG, new THREE.MeshBasicMaterial({ color: '#ffffff', depthWrite: false }), 340, true);
    this.barBg.m.renderOrder = 7; this.barFg.m.renderOrder = 8;
    // projectiles
    this.ballL = new Layer(scene, new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshLambertMaterial({ color: '#ffffff' }), 300, true);
    const arrowG = new THREE.BoxGeometry(0.06, 0.06, 0.7); this.arrowL = new Layer(scene, arrowG, new THREE.MeshBasicMaterial({ color: '#ffffff' }), 300, true);
    this.dummy = new THREE.Object3D();
    // lightning
    const zg = new THREE.BufferGeometry(); this.zapPos = new Float32Array(600 * 3); zg.setAttribute('position', new THREE.BufferAttribute(this.zapPos, 3).setUsage(THREE.DynamicDrawUsage)); zg.setDrawRange(0, 0);
    this.zapLines = new THREE.LineSegments(zg, new THREE.LineBasicMaterial({ color: '#e9d5ff', transparent: true, opacity: 0.95 })); this.zapLines.frustumCulled = false; this.zapLines.renderOrder = 9; scene.add(this.zapLines);
    // range ring + target marker + gamepad cursor
    const ring = this.range = new THREE.Group();
    const rf = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.12, depthWrite: false }));
    const rl = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 64), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7, depthWrite: false }));
    for (const m of [rf, rl]) { m.rotation.x = -Math.PI / 2; ring.add(m); }
    ring.position.y = 0.06; ring.visible = false; ring.renderOrder = 3; scene.add(ring);
    this.rangeMats = [rf.material, rl.material];
    const mk = this.marker = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.6, 24), new THREE.MeshBasicMaterial({ color: '#7dd3fc', transparent: true, opacity: 0.9, depthWrite: false }));
    mk.rotation.x = -Math.PI / 2; mk.position.y = 0.07; mk.visible = false; scene.add(mk);
    const cur = this.cursor = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.9, 4), new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.95, depthWrite: false }));
    cur.rotation.x = -Math.PI / 2; cur.position.y = 0.09; cur.visible = false; scene.add(cur);
    // boom rings
    for (let i = 0; i < 10; i++) { const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 32), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.y = 0.1; scene.add(m); this.rings.push({ m, t: 1, T: 1 }); }
    this.fx = new Particles(scene, tier === 'low' ? 900 : 2200);
    this.ray = new THREE.Raycaster(); this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  }
  paintMap() {
    const wd = this.world, S = this.sim, PX = this.tier === 'low' ? 24 : 40; // pixels per metre
    const W = 60, H = 40, cv = document.createElement('canvas'); cv.width = W * PX; cv.height = H * PX;
    const c = cv.getContext('2d'), X = (x) => (x + W / 2) * PX, Z = (z) => (z + H / 2) * PX;
    let seed = 11 + (+this.level.mapId || +this.level.id || 3) * 17; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    c.fillStyle = wd.ground2; c.fillRect(0, 0, cv.width, cv.height);
    // the playfield is lighter, with soft blobs of colour
    const gr = c.createRadialGradient(X(0), Z(0), 4 * PX, X(0), Z(0), 30 * PX); gr.addColorStop(0, wd.ground); gr.addColorStop(0.7, wd.ground); gr.addColorStop(1, wd.ground2);
    c.fillStyle = gr; c.fillRect(0, 0, cv.width, cv.height);
    for (let i = 0; i < 160; i++) { c.fillStyle = i % 2 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.04)'; c.beginPath(); c.ellipse(rnd() * cv.width, rnd() * cv.height, (1 + rnd() * 3) * PX, (0.7 + rnd() * 2) * PX, rnd() * 3, 0, 7); c.fill(); }
    // ponds (water / lava) away from the road
    this.ponds = [];
    for (let k = 0; k < 40 && this.ponds.length < 3; k++) {
      const x = (rnd() - 0.5) * 34, z = (rnd() - 0.5) * 22, r = 1.4 + rnd() * 1.6;
      if (S.paths.some((p) => p.samples.some((q) => (q.x - x) ** 2 + (q.z - z) ** 2 < (r + 2.2) ** 2)) || S.slots.some((s) => (s.x - x) ** 2 + (s.z - z) ** 2 < (r + 1.8) ** 2)) continue;
      this.ponds.push({ x, z, r });
      c.fillStyle = wd.pathEdge; c.beginPath(); c.ellipse(X(x), Z(z), (r + 0.35) * PX, (r * 0.8 + 0.35) * PX, 0, 0, 7); c.fill();
      c.fillStyle = wd.water; c.beginPath(); c.ellipse(X(x), Z(z), r * PX, r * 0.8 * PX, 0, 0, 7); c.fill();
      c.fillStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.ellipse(X(x - r * 0.3), Z(z - r * 0.25), r * 0.35 * PX, r * 0.12 * PX, -0.3, 0, 7); c.fill();
    }
    // the road: dark edge, light fill, dashed centre pebbles
    c.lineJoin = c.lineCap = 'round';
    const road = (w, col) => { c.strokeStyle = col; c.lineWidth = w * PX; for (const p of S.paths) { c.beginPath(); p.pts.forEach(([x, z], i) => (i ? c.lineTo(X(x), Z(z)) : c.moveTo(X(x), Z(z)))); c.stroke(); } };
    road(2.7, 'rgba(0,0,0,.12)'); road(2.45, wd.pathEdge); road(2.0, wd.path);
    c.fillStyle = 'rgba(0,0,0,.08)';
    for (const p of S.paths) for (const q of p.samples) if (rnd() < 0.5) { c.beginPath(); c.arc(X(q.x + (rnd() - 0.5) * 1.6), Z(q.z + (rnd() - 0.5) * 1.6), (0.05 + rnd() * 0.1) * PX, 0, 7); c.fill(); }
    // flowers / pebbles / snow sparkles
    const dots = ['#ffffff', '#ffe066', '#ff8fab', '#9ad1ff'];
    for (let i = 0; i < 500; i++) {
      const x = (rnd() - 0.5) * W, z = (rnd() - 0.5) * H;
      if (S.paths.some((p) => p.samples.some((q) => (q.x - x) ** 2 + (q.z - z) ** 2 < 2))) continue;
      c.fillStyle = this.level.world === 3 ? 'rgba(255,120,40,.5)' : this.level.world === 2 ? 'rgba(255,255,255,.8)' : dots[i % 4]; c.beginPath(); c.arc(X(x), Z(z), (0.06 + rnd() * 0.08) * PX, 0, 7); c.fill();
    }
    // fade the edges of the painted ground into the plain outer ground (no visible seam)
    const fade = 8 * PX;
    for (const [x0, y0, x1, y1, rx, ry, rw, rh] of [[0, 0, fade, 0, 0, 0, fade, cv.height], [cv.width, 0, cv.width - fade, 0, cv.width - fade, 0, fade, cv.height], [0, 0, 0, fade, 0, 0, cv.width, fade], [0, cv.height, 0, cv.height - fade, 0, cv.height - fade, cv.width, fade]]) {
      const g2 = c.createLinearGradient(x0, y0, x1, y1); g2.addColorStop(0, wd.ground2); g2.addColorStop(1, wd.ground2 + '00'); c.fillStyle = g2; c.fillRect(rx, ry, rw, rh);
    }
    // map border: a soft frame where the playfield ends
    c.strokeStyle = 'rgba(0,0,0,.08)'; c.lineWidth = 0.3 * PX; c.setLineDash([0.6 * PX, 0.6 * PX]); c.strokeRect(X(-MAP_W / 2), Z(-MAP_H / 2), MAP_W * PX, MAP_H * PX); c.setLineDash([]);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return t;
  }
  buildDeco() {
    const S = this.sim, wd = this.world, wi = this.level.world || 0, scene = this.scene;
    let seed = 5 + (+this.level.mapId || +this.level.id || 3) * 29; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const spots = [];
    const free = (x, z, r) => !S.paths.some((p) => p.samples.some((q) => (q.x - x) ** 2 + (q.z - z) ** 2 < (r + 1.6) ** 2)) && !S.slots.some((s) => (s.x - x) ** 2 + (s.z - z) ** 2 < (r + 1.3) ** 2) && (S.keep.x - x) ** 2 + (S.keep.z - z) ** 2 > 12 && !this.ponds.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < (p.r + r + 0.5) ** 2) && !spots.some((s) => (s[0] - x) ** 2 + (s[1] - z) ** 2 < (r + s[2]) ** 2);
    const N = this.tier === 'low' ? 70 : 140;
    for (let k = 0; k < N * 6 && spots.length < N; k++) {
      const x = (rnd() - 0.5) * 56, z = (rnd() - 0.5) * 38, inside = Math.abs(x) < MAP_W / 2 && Math.abs(z) < MAP_H / 2;
      if (inside && rnd() < 0.55) continue; // fewer props on the playfield
      const r = (0.6 + rnd() * 0.6) * (inside ? 0.75 : 1); if (free(x, z, r)) spots.push([x, z, r]);
    }
    const n = spots.length;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
    const shadow = this.tier === 'high';
    const mk = (geo, material, count) => { const im = new THREE.InstancedMesh(geo, material, count); im.castShadow = shadow; im.receiveShadow = true; scene.add(im); return im; };
    const trunk = mk(new THREE.CylinderGeometry(0.16, 0.24, 1, 6), mat(wi === 3 ? '#2a1d22' : '#8a5a3c'), n);
    const crownGeo = wi === 2 ? new THREE.ConeGeometry(0.9, 2.2, 7) : wi === 1 ? new THREE.CylinderGeometry(0.28, 0.32, 1.8, 8) : wi === 3 ? new THREE.DodecahedronGeometry(0.5, 0) : new THREE.IcosahedronGeometry(1, 0);
    const crown = mk(crownGeo, new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true }), n);
    const rocks = mk(new THREE.DodecahedronGeometry(0.6, 0), new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true }), n);
    let ti = 0, ri = 0;
    for (const [x, z, r] of spots) {
      const k = 0.7 + r * 0.6;
      if (rnd() < 0.68) {
        q.setFromAxisAngle(Y, rnd() * 6);
        if (wi === 1) { // cactus: a green column with an arm
          m4.compose(p.set(x, 0.05, z), q, s.set(0.01, 0.01, 0.01)); trunk.setMatrixAt(ti, m4);
          m4.compose(p.set(x, 0.9 * k, z), q, s.set(k, k, k)); crown.setMatrixAt(ti, m4); crown.setColorAt(ti, TC.set(wd.deco[ti % 3]));
        } else {
          m4.compose(p.set(x, 0.5 * k, z), q, s.set(k, k, k)); trunk.setMatrixAt(ti, m4);
          m4.compose(p.set(x, (wi === 2 ? 1.9 : 1.7) * k, z), q, s.set(k, k * (wi === 3 ? 1.6 : 1), k)); crown.setMatrixAt(ti, m4);
          crown.setColorAt(ti, TC.set(wi === 2 && rnd() < 0.5 ? '#f2f8ff' : wd.deco[ti % 3]));
        }
        ti++;
      } else {
        q.setFromEuler(new THREE.Euler(rnd(), rnd() * 6, rnd())); m4.compose(p.set(x, 0.2 * k, z), q, s.set(k * 0.9, k * 0.6, k * 0.8)); rocks.setMatrixAt(ri, m4); rocks.setColorAt(ri, TC.set(wd.rock).offsetHSL(0, 0, (rnd() - 0.5) * 0.12)); ri++;
      }
    }
    trunk.count = crown.count = ti; rocks.count = ri;
    // lava glows in the volcano
    if (wi === 3) for (const pd of this.ponds) { const l = new THREE.PointLight('#ff6a1f', 6, 7); l.position.set(pd.x, 1, pd.z); scene.add(l); }
  }

  // ───────── input
  bindInput() {
    const cv = this.cv, root = this.root;
    this.onPD = (e) => {
      if (this.over) return;
      cv.setPointerCapture?.(e.pointerId);
      this.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now(), moved: false });
      this.pad.on = false; this.cursor.visible = false;
      if (this.ptrs.size === 1) { this.grab = this.ground3(e.clientX, e.clientY); }
      if (this.ptrs.size === 2) { const [a, b] = [...this.ptrs.values()]; this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: this.view.zoom }; this.grab = null; }
      this.$('bs-help')?.classList.add('off');
    };
    this.onPM = (e) => {
      const p = this.ptrs.get(e.pointerId);
      if (!p) { if (e.pointerType === 'mouse') this.hover(e.clientX, e.clientY); return; }
      p.x = e.clientX; p.y = e.clientY;
      if (Math.hypot(p.x - p.x0, p.y - p.y0) > 9) p.moved = true;
      if (this.ptrs.size === 2 && this.pinch) {
        const [a, b] = [...this.ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); a.moved = b.moved = true;
        this.setZoom(this.pinch.zoom * (this.pinch.d / Math.max(20, d)));
      } else if (this.ptrs.size === 1 && this.grab && p.moved) {
        const now = this.ground3(e.clientX, e.clientY); if (!now) return;
        this.view.tx += this.grab.x - now.x; this.view.tz += this.grab.z - now.z; this.clampView(); this.placeCamera();
      }
    };
    this.onPU = (e) => {
      const p = this.ptrs.get(e.pointerId); if (!p) return;
      this.ptrs.delete(e.pointerId);
      if (this.ptrs.size < 2) this.pinch = null;
      if (!p.moved && this.ptrs.size === 0 && performance.now() - p.t0 < 700) { const w = this.ground3(e.clientX, e.clientY); if (w) this.tap(w.x, w.z); }
      if (this.ptrs.size === 1) { const q = [...this.ptrs.values()][0]; this.grab = this.ground3(q.x, q.y); }
    };
    this.onWheel = (e) => { e.preventDefault(); this.setZoom(this.view.zoom * Math.exp(e.deltaY * 0.0012)); };
    cv.addEventListener('pointerdown', this.onPD); cv.addEventListener('pointermove', this.onPM);
    window.addEventListener('pointerup', this.onPU); window.addEventListener('pointercancel', this.onPU);
    cv.addEventListener('wheel', this.onWheel, { passive: false });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    // keyboard (capture: the app's global shortcuts do not see the game keys)
    this.onKD = (e) => {
      if (e.target?.closest?.('input, textarea, select')) return;
      const k = e.code, menu = this.$('bs-pop').classList.contains('on'), modal = this.$('bs-modal').classList.contains('on');
      const eat = () => { e.preventDefault(); e.stopPropagation(); };
      if (k === 'Escape') { eat(); if (modal) this.closeModal(); else if (menu || this.arm || this.sel) this.deselect(); else this.openModal(); return; }
      if (modal || this.over) return;
      if (/^Digit[1-9]$/.test(k) || /^Numpad[1-9]$/.test(k)) { eat(); this.hotkey(+k.slice(-1)); return; }
      const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (arrows[k]) { if (menu) return; eat(); this.keys.add(k); return; }
      const act = {
        Space: () => this.togglePause(), KeyP: () => this.togglePause(), KeyF: () => this.cycleSpeed(), KeyN: () => this.callWave(), KeyU: () => this.upgradeSel(), KeyV: () => this.sellSel(), Delete: () => this.sellSel(), Backspace: () => this.sellSel(),
        KeyT: () => this.cycleMode(), KeyH: () => this.selectHero(), KeyZ: () => this.useAbility(0), KeyX: () => this.useAbility(1),
        KeyQ: () => this.armSpell(0), KeyW: () => this.armSpell(1), KeyE: () => this.armSpell(2), Equal: () => this.setZoom(this.view.zoom * 0.85), NumpadAdd: () => this.setZoom(this.view.zoom * 0.85), Minus: () => this.setZoom(this.view.zoom / 0.85), NumpadSubtract: () => this.setZoom(this.view.zoom / 0.85),
        Tab: () => this.cycleSlot(e.shiftKey ? -1 : 1), KeyR: () => { this.view.zoom = 1; this.view.tx = this.view.tz = 0; this.placeCamera(); },
      }[k];
      if (k === 'Enter' && !menu) { eat(); if (this.arm && this.kbCursor) this.tap(this.kbCursor.x, this.kbCursor.z); else if (this.sim.state === 'ready') this.callWave(); else if (this.kbSlot != null) this.openSlot(this.kbSlot); return; }
      if (act) { eat(); act(); }
    };
    this.onKU = (e) => this.keys.delete(e.code);
    window.addEventListener('keydown', this.onKD, true); window.addEventListener('keyup', this.onKU, true);
    this.onVis = () => { if (document.hidden && !this.paused && !this.over) this.togglePause(true); };
    document.addEventListener('visibilitychange', this.onVis);
    // HUD buttons
    root.querySelector('.bs-hud').addEventListener('click', (e) => this.hudClick(e));
    root.querySelector('.bs-hud').addEventListener('pointerover', (e) => { const b = e.target.closest?.('[data-prev]'); this.preview(b ? b.dataset.prev : null); });
    root.querySelector('.bs-hud').addEventListener('pointerout', (e) => { if (e.target.closest?.('[data-prev]')) this.preview(null); });
    root.querySelector('.bs-hud').addEventListener('focusin', (e) => { const b = e.target.closest?.('[data-prev]'); this.preview(b ? b.dataset.prev : null); });
  }
  hudClick(e) {
    const b = e.target.closest('button, [data-g]'); if (!b) return;
    e.stopPropagation();
    const id = b.id, d = b.dataset;
    if (id === 'bs-speed') return this.cycleSpeed();
    if (id === 'bs-pause') return this.togglePause();
    if (id === 'bs-menu') return this.openModal();
    if (id === 'bs-call') return this.callWave();
    if (id === 'bs-hero') return this.selectHero();
    if (d.ab != null) return this.useAbility(+d.ab);
    if (d.sp) return this.armSpell(this.sim.spells.findIndex((s) => s.def.id === d.sp));
    const g = d.g; if (!g) return;
    const S = this.sim, si = this.sel?.i;
    if (g === 'resume') { this.closeModal(); this.togglePause(false); }
    else if (g === 'restart') { this.closeModal(); this.o.onRestart?.(); }
    else if (g === 'quit') { this.closeModal(); this.o.onQuit?.(); }
    else if (g === 'close') this.closeModal();
    else if (g === 'opt-ranges') { this.o.ranges = !this.o.ranges; b.classList.toggle('on', this.o.ranges); }
    else if (g === 'build') { if (S.build(si, d.t)) { this.deselect(); } else this.nope(b); }
    else if (g === 'up') { if (S.upgrade(si)) this.openSlot(si); else this.nope(b); }
    else if (g === 'spec') { if (S.specialize(si, +d.k)) this.openSlot(si); else this.nope(b); }
    else if (g === 'sell') { if (b.classList.contains('sure')) { S.sell(si); this.deselect(); } else { b.classList.add('sure'); b.querySelector('span').textContent = 'Conferma vendita'; } }
    else if (g === 'mode') { this.cycleMode(); }
  }
  nope(b) { b.classList.add('nope'); setTimeout(() => b.classList.remove('nope'), 350); this.snd('bad', 120, () => sfx.bad?.()); }
  ground3(cx, cy) {
    const r = this.cv.getBoundingClientRect();
    const v = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(v, this.cam);
    const p = new THREE.Vector3(); return this.ray.ray.intersectPlane(this.plane, p) ? { x: p.x, z: p.z } : null;
  }
  toScreen(x, y, z) { const v = new THREE.Vector3(x, y, z).project(this.cam); return { x: (v.x * 0.5 + 0.5) * this.cv.clientWidth, y: (-v.y * 0.5 + 0.5) * this.cv.clientHeight }; }
  hover(cx, cy) {
    const w = this.ground3(cx, cy); if (!w) return;
    this.lastHover = w;
    const sl = this.slotAt(w.x, w.z);
    this.cv.style.cursor = sl || this.arm ? 'pointer' : 'grab';
    this.hoverSlot = sl ? sl.i : null;
  }
  slotAt(x, z, r = 1.5) { let best = null, bd = r * r; for (const s of this.sim.slots) { const d = (s.x - x) ** 2 + (s.z - z) ** 2; if (d < bd) { bd = d; best = s; } } return best; }
  // a tap / click / A button on the map at (x, z)
  tap(x, z) {
    if (this.over) return;
    const S = this.sim;
    if (this.arm) {
      if (this.arm === 'hero') { if (S.moveHero(x, z)) { this.markAt(x, z); this.snd('move', 80, () => sfx.select?.()); } this.arm = null; this.deselect(); return; }
      const ok = S.cast(this.arm, x, z); if (!ok) { this.snd('bad', 120, () => sfx.bad?.()); } this.arm = null; this.syncHud(true); this.range.visible = false; return;
    }
    const sl = this.slotAt(x, z);
    if (sl) { if (this.sel?.i === sl.i && this.$('bs-pop').classList.contains('on')) { this.deselect(); return; } this.openSlot(sl.i); return; }
    const h = S.hero;
    if (h && !h.dead && (h.x - x) ** 2 + (h.z - z) ** 2 < 2) { this.selectHero(); return; }
    if (this.$('bs-pop').classList.contains('on') || this.sel) { this.deselect(); return; }
    if (h && !h.dead && Math.abs(x) < MAP_W / 2 && Math.abs(z) < MAP_H / 2) { if (S.moveHero(x, z)) { this.markAt(x, z); this.snd('move', 80, () => sfx.select?.()); } }
  }
  markAt(x, z) { this.marker.position.set(x, 0.07, z); this.marker.visible = true; this.markT = 1.2; }
  selectHero() { const h = this.sim.hero; if (!h || h.dead) return; this.closePop(); this.sel = { kind: 'hero' }; this.arm = 'hero'; this.syncHud(true); this.banner('Tocca la mappa dove mandare l’eroe', 'hint', 2.2); }
  deselect() { this.sel = null; this.arm = null; this.closePop(); this.range.visible = false; this.syncHud(true); }
  closePop() { const p = this.$('bs-pop'); p.classList.remove('on'); p.innerHTML = ''; this.menuKey = ''; this.preview(null); }
  armSpell(i) {
    const s = this.sim.spells[i]; if (!s || this.over) return;
    if (s.cd > 0 || this.sim.state === 'ready') { this.nope(this.$('bs-sp-' + s.def.id)); if (this.sim.state === 'ready') this.banner('Gli incantesimi si usano durante le ondate', 'hint', 2); return; }
    if (this.arm === s.def.id) { this.arm = null; this.range.visible = false; this.syncHud(true); return; }
    this.closePop(); this.sel = null; this.arm = s.def.id; this.syncHud(true);
    this.banner(`${s.def.name}: tocca il punto della mappa`, 'hint', 2.2);
    if (this.pad.on) this.pad.x = this.cursor.position.x, this.pad.z = this.cursor.position.z;
  }
  useAbility(i) { const S = this.sim; if (!S.hero) return; if (!S.ability(i)) this.nope(this.$('bs-ab' + i)); this.syncHud(true); }
  callWave() { if (this.over) return; const S = this.sim; if (S.callWave()) { this.$('bs-help')?.classList.add('off'); this.syncHud(true); } }
  cycleSpeed() { this.speed = this.speed >= 3 ? 1 : this.speed + 1; this.syncHud(true); this.o.onSpeed?.(this.speed); }
  hotkey(n) {
    const sel = this.sel;
    if (sel?.kind === 'slot' && !this.sim.slots[sel.i].tower) { const t = TOWERS[n - 1]; if (t) this.hudClick({ target: this.$('bs-pop').querySelector(`[data-t="${t.id}"]`) || this.$('bs-pop'), stopPropagation() {} }); return; }
    if (sel?.kind === 'slot' && this.sim.slots[sel.i].tower) { const t = this.sim.slots[sel.i].tower; if (t.tier >= 2 && t.spec < 0 && n <= 2) { if (this.sim.specialize(sel.i, n - 1)) this.openSlot(sel.i); } else if (n === 1) this.upgradeSel(); return; }
    // nothing selected: pick the free spot under the cursor / the keyboard spot
    const si = this.kbSlot ?? this.hoverSlot;
    if (si != null && !this.sim.slots[si].tower) { this.openSlot(si); this.hotkey(n); }
  }
  upgradeSel() { const s = this.sel; if (s?.kind !== 'slot') return; const t = this.sim.slots[s.i].tower; if (!t) return; if (t.tier < 2 ? this.sim.upgrade(s.i) : false) this.openSlot(s.i); }
  sellSel() { const s = this.sel; if (s?.kind !== 'slot' || !this.sim.slots[s.i].tower) return; const b = this.$('bs-pop').querySelector('[data-g=sell]'); if (b) this.hudClick({ target: b, stopPropagation() {} }); }
  cycleMode() { const s = this.sel; if (s?.kind !== 'slot') return; const t = this.sim.slots[s.i].tower; if (!t || t.def.barracks || t.def.mine) return; const ks = Object.keys(TARGET_MODES); this.sim.setMode(s.i, ks[(ks.indexOf(t.mode) + 1) % ks.length]); this.openSlot(s.i); }
  cycleSlot(d) {
    const n = this.sim.slots.length; this.kbSlot = ((this.kbSlot ?? (d > 0 ? -1 : 0)) + d + n) % n;
    const s = this.sim.slots[this.kbSlot]; this.kbCursor = { x: s.x, z: s.z };
    this.cursor.visible = true; this.cursor.position.set(s.x, 0.09, s.z);
    this.focusOn(s.x, s.z);
  }
  focusOn(x, z) { if (this.view.zoom > 0.95) return; this.view.tx += (x - this.view.tx) * 0.5; this.view.tz += (z - this.view.tz) * 0.5; this.clampView(); this.placeCamera(); }

  // ───────── menus
  openSlot(i) {
    const S = this.sim, sl = S.slots[i], t = sl.tower;
    this.sel = { kind: 'slot', i }; this.arm = null;
    this.kbSlot = i; this.kbCursor = { x: sl.x, z: sl.z };
    const pop = this.$('bs-pop');
    let html;
    if (!t) {
      html = `<div class="bs-pop-h">Costruisci <small>${ICON_COIN} ${fmt(S.gold)}</small></div><div class="bs-grid">${TOWERS.map((d, k) => {
        const c = S.towerCost(d, 0), ok = S.canBuild(d.id);
        return `<button class="bs-tw ${S.gold < c ? 'poor' : ''}" data-g="build" data-t="${d.id}" data-prev="${d.id}:0" ${ok ? '' : 'disabled'} title="${esc(d.name)} — ${esc(d.short)}">${TOWER_ICON[d.id]}<b>${esc(d.name)}</b><span>${ok ? `${ICON_COIN}${c}` : 'Vietata'}</span><kbd>${k + 1}</kbd></button>`;
      }).join('')}</div><div class="bs-pop-f" id="bs-pop-f">${esc(TOWERS[0].short)}</div>`;
    } else {
      const d = t.def, st = S.stat(t), lv = t.spec >= 0 ? 4 : t.tier + 1;
      const rows = [];
      if (d.barracks) rows.push(['Difensori', st.men], ['Vita', fmt(st.hp)], ['Danni', fmt(st.dmg)], ['Armatura', `${Math.round(st.armor * 100)}%`]);
      else if (d.mine) rows.push(['Oro', `+${st.gold} ogni ${st.every}s`], ...(st.interest ? [['Interesse', `${st.interest * 100}% a ondata`]] : []), ...(st.buff ? [['Bonus vicine', '+20% danni']] : []));
      else rows.push(['Danni', st.poison ? `${fmt(st.dmg)} + ${fmt(st.poison.dps)}/s` : fmt(st.dmg)], ['Cadenza', `${st.rate.toFixed(2)}/s`], ['Gittata', `${st.range.toFixed(1)} m`], ...(st.splash ? [['Area', `${st.splash.toFixed(1)} m`]] : []), ['Abbattuti', fmt(t.kills)]);
      const next = t.tier < 2 ? { cost: S.towerCost(d, t.tier + 1), st: d.tiers[t.tier + 1] } : null;
      const sell = Math.round(t.invest * SELL_BACK);
      html = `<div class="bs-pop-h">${TOWER_ICON[d.id]}<div><b>${esc(t.spec >= 0 ? d.spec[t.spec].name : d.name)}</b><small>Livello ${lv}${t.spec >= 0 ? ' · specializzata' : ''}</small></div></div>
        <ul class="bs-st">${rows.map(([k, v]) => `<li><span>${k}</span><b>${v}</b></li>`).join('')}</ul>
        ${next ? `<button class="bs-act up ${S.gold < next.cost ? 'poor' : ''}" data-g="up" data-prev="${d.id}:${t.tier + 1}"><span>Potenzia al livello ${t.tier + 2}</span><em>${ICON_COIN}${next.cost}</em><kbd>U</kbd></button>` : ''}
        ${t.tier >= 2 && t.spec < 0 ? `<div class="bs-specs">${d.spec.map((s, k) => `<button class="bs-act spec ${S.gold < s.cost ? 'poor' : ''}" data-g="spec" data-k="${k}" data-prev="${d.id}:s${k}"><span><b>${esc(s.name)}</b><small>${esc(s.desc)}</small></span><em>${ICON_COIN}${s.cost}</em><kbd>${k + 1}</kbd></button>`).join('')}</div>` : ''}
        <div class="bs-row">${d.barracks || d.mine ? '' : `<button class="bs-act mode" data-g="mode" title="Cambia bersaglio (T)"><span>Mira: ${esc(TARGET_MODES[t.mode])}</span><kbd>T</kbd></button>`}
        <button class="bs-act sell" data-g="sell"><span>Vendi</span><em>+${sell}</em><kbd>V</kbd></button></div>`;
    }
    pop.innerHTML = html; pop.classList.add('on');
    this.menuKey = `${i}:${t ? `${t.tier}:${t.spec}:${t.mode}` : 'b'}`;
    this.placePop();
    this.showRange(t ? t : null, sl);
    this.syncPop(true);
    if (this.pad.on || this.kbNav) { this.pad.fi = 0; requestAnimationFrame(() => pop.querySelector('button:not([disabled])')?.focus({ preventScroll: true })); }
    this.snd('open', 60, () => sfx.select?.());
  }
  placePop() {
    const pop = this.$('bs-pop'), sel = this.sel; if (!pop.classList.contains('on') || sel?.kind !== 'slot') return;
    const sl = this.sim.slots[sel.i], p = this.toScreen(sl.x, 1, sl.z);
    const W = this.root.clientWidth, H = this.root.clientHeight;
    if (W < 560) { pop.classList.add('sheet'); pop.classList.remove('wide'); pop.style.left = ''; pop.style.top = ''; return; }
    pop.classList.remove('sheet'); pop.classList.toggle('wide', H < 560);
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    let x = p.x + 46, y = p.y - ph / 2;
    if (x + pw > W - 10) x = p.x - 46 - pw;
    x = Math.max(10, Math.min(W - pw - 10, x)); y = Math.max(H < 560 ? 52 : 64, Math.min(H - ph - 8, y));
    pop.style.left = `${x}px`; pop.style.top = `${y}px`;
  }
  // refresh affordability in the open menu (gold changes) without rebuilding it
  syncPop(force) {
    const pop = this.$('bs-pop'); if (!pop.classList.contains('on')) return;
    const S = this.sim, sel = this.sel; if (sel?.kind !== 'slot') return;
    const t = S.slots[sel.i].tower, key = `${sel.i}:${t ? `${t.tier}:${t.spec}:${t.mode}` : 'b'}`;
    if (key !== this.menuKey) { this.openSlot(sel.i); return; }
    if (!force && this._popGold === S.gold) return; this._popGold = S.gold;
    for (const b of pop.querySelectorAll('[data-g=build]')) b.classList.toggle('poor', S.gold < S.towerCost(towerById(b.dataset.t), 0));
    if (t) { const u = pop.querySelector('[data-g=up]'); if (u) u.classList.toggle('poor', S.gold < S.towerCost(t.def, t.tier + 1)); for (const b of pop.querySelectorAll('[data-g=spec]')) b.classList.toggle('poor', S.gold < t.def.spec[+b.dataset.k].cost); }
    const h = pop.querySelector('.bs-pop-h small'); if (h && !t) h.innerHTML = `${ICON_COIN} ${fmt(S.gold)}`;
  }
  // range preview for a build / upgrade option ("type:tier" or "type:sK")
  preview(code) {
    const sel = this.sel; if (sel?.kind !== 'slot') return;
    const sl = this.sim.slots[sel.i];
    if (!code) { this.showRange(sl.tower, sl); return; }
    const [id, lv] = code.split(':'), d = towerById(id);
    const st = lv[0] === 's' ? d.spec[+lv[1]] : d.tiers[+lv];
    const f = this.$('bs-pop-f'); if (f) f.textContent = `${d.name}: ${d.short}`;
    const r = st.range ? st.range * (this.sim.fx.range[id] || 1) : d.mine ? 0 : 0;
    if (r) { this.range.visible = true; this.range.position.set(sl.x, 0.06, sl.z); this.range.scale.setScalar(r); this.rangeMats[1].color.set(d.color); }
    else this.range.visible = false;
  }
  showRange(t, sl) {
    if (t && !t.def.mine) { const st = this.sim.stat(t); this.range.visible = true; this.range.position.set(t.x, 0.06, t.z); this.range.scale.setScalar(st.range); this.rangeMats[1].color.set(t.def.color); }
    else this.range.visible = false;
  }
  openModal() {
    if (this.over) return;
    const m = this.$('bs-modal'); this.togglePause(true); this.closePop();
    const L = this.level, S = this.sim;
    m.innerHTML = `<div class="bs-card"><h2>Pausa</h2><div class="bs-k">${esc(this.o.label || (this.o.mode === 'level' ? `Livello ${L.id}` : ''))} · ${esc(L.name || '')}</div>
      <p class="bs-goal">${this.o.mode === 'endless' ? `Ondata ${S.wave} · resisti il più a lungo possibile` : `★★★ perdendo al massimo 2 vite · ★★ con almeno ${S.maxLives / 2} vite`}</p>
      <button class="bs-btn big primary" data-g="resume">▶ Riprendi</button>
      <button class="bs-btn big" data-g="restart">↻ Ricomincia</button>
      <button class="bs-btn big toggle ${this.o.ranges ? 'on' : ''}" data-g="opt-ranges">◎ Mostra le gittate al passaggio</button>
      <button class="bs-btn big ghost" data-g="quit">✕ Esci dalla partita</button>
      <div class="bs-keyhelp"><span class="kbd">1</span>–<span class="kbd">9</span> costruisci · <span class="kbd">U</span> potenzia · <span class="kbd">V</span> vendi · <span class="kbd">T</span> bersaglio · <span class="kbd">Tab</span> piazzole · <span class="kbd">N</span> ondata · <span class="kbd">H</span> eroe · <span class="kbd">Z</span>/<span class="kbd">X</span> abilità · <span class="kbd">Q</span>/<span class="kbd">W</span>/<span class="kbd">E</span> incantesimi · <span class="kbd">F</span> velocità · frecce e <span class="kbd">+</span>/<span class="kbd">-</span> vista<br>Controller: levetta sinistra cursore · A azione · B annulla · X ondata · Y eroe · LB/RB incantesimi · grilletti zoom</div></div>`;
    m.classList.add('on');
    requestAnimationFrame(() => m.querySelector('.btn, .bs-btn')?.focus({ preventScroll: true }));
  }
  closeModal() { const m = this.$('bs-modal'); m.classList.remove('on'); m.innerHTML = ''; }

  togglePause(force) {
    if (this.over) return;
    this.paused = force ?? !this.paused;
    this.keys.clear();
    this.$('bs-paused').classList.toggle('on', this.paused && !this.$('bs-modal').classList.contains('on'));
    if (!this.paused) { this.closeModal(); this.$('bs-paused').classList.remove('on'); }
    this.syncHud(true);
  }
  autoplay(on) { this.auto = on ? new Autopilot(this.sim, { skill: 'good' }) : null; }

  // ───────── camera
  resize() {
    const w = this.root.clientWidth || innerWidth, h = this.root.clientHeight || innerHeight;
    this.renderer.setSize(w, h, false);
    this.cam.aspect = w / h;
    this.portrait = w < h * 0.9;
    this.root.classList.toggle('bs-portrait', this.portrait);
    this.root.classList.toggle('bs-narrow', w < 700);
    this.fitCamera(w, h);
    this.fx.uScale.value = (h * this.renderer.getPixelRatio()) / (2 * Math.tan((this.cam.fov * Math.PI) / 360));
    this.placePop();
  }
  fitCamera(w, h) {
    const cam = this.cam; cam.fov = this.portrait ? 44 : 38; cam.updateProjectionMatrix();
    this.pitch = this.portrait ? 1.05 : 0.98;
    const top = (64 / h) * 2, bot = ((this.portrait ? 120 : 84) / h) * 2;
    const pts = [[-MAP_W / 2, -MAP_H / 2], [MAP_W / 2, -MAP_H / 2], [-MAP_W / 2, MAP_H / 2], [MAP_W / 2, MAP_H / 2]];
    const v = new THREE.Vector3(); let lo = 5, hi = 200;
    const save = { ...this.view }; this.view.tx = 0; this.view.tz = 0;
    for (let k = 0; k < 24; k++) {
      const d = (lo + hi) / 2; this.dist = d; this.view.zoom = 1; this.placeCamera(true);
      let ok = true; for (const [x, z] of pts) { v.set(x, 0, z).project(cam); if (Math.abs(v.x) > 0.98 || v.y > 1 - top || v.y < -1 + bot) { ok = false; break; } }
      if (ok) hi = d; else lo = d;
    }
    this.dist = hi; Object.assign(this.view, save); this.clampView(); this.placeCamera();
  }
  setZoom(z) { this.view.zoom = Math.max(0.38, Math.min(1.15, z)); this.clampView(); this.placeCamera(); this.placePop(); }
  clampView() { const k = Math.max(0, 1.05 - this.view.zoom); const ex = MAP_W / 2 * k + 1.5, ez = MAP_H / 2 * k + 1.5; this.view.tx = Math.max(-ex, Math.min(ex, this.view.tx)); this.view.tz = Math.max(-ez, Math.min(ez, this.view.tz)); }
  placeCamera(raw) {
    const cam = this.cam, V = this.view, D = this.dist * V.zoom, p = this.pitch;
    let ox = 0, oz = 0;
    if (!raw && this.shakeT > 0 && this.o.shake !== false) { const k = this.shakeT * 0.6; ox = (Math.random() - 0.5) * k; oz = (Math.random() - 0.5) * k; }
    if (this.camOverride) { this.camOverride(cam); return; }
    // landscape: the camera looks "north" (−z); portrait: it looks along −x so the map's long side is vertical
    const ux = this.portrait ? -1 : 0, uz = this.portrait ? 0 : -1;
    // keep the map's centre a little lower on screen in portrait (HUD at the bottom)
    cam.position.set(V.tx - ux * D * Math.cos(p) + ox, D * Math.sin(p), V.tz - uz * D * Math.cos(p) + oz);
    cam.lookAt(V.tx + ox, 0, V.tz + oz);
    cam.updateMatrixWorld();
  }

  // ───────── frame
  loop(now) {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.max(0, Math.min(0.1, (now - this.last) / 1000)); this.last = now;
    this.pollPad(dt);
    this.panKeys(dt);
    if (!this.paused) this.step(dt * this.speed, true);
    this.render(dt);
    if (!this.paused) this.guard?.tick();
  }
  step(dt, live = false) {
    if (this.paused && live) return;
    this.clock += dt; this.uTime.value = this.clock;
    this.acc += dt;
    let n = 0;
    while (this.acc >= STEP && n < (live ? 12 : 1e9)) {
      this.acc -= STEP; n++;
      if (!this.sim.over()) { this.auto?.tick(STEP); this.sim.step(STEP); this.drain(); }
    }
    if (live && this.acc > STEP * 12) this.acc = 0;
    this.fx.update(dt);
    this.syncHud(false);
  }
  panKeys(dt) {
    if (!this.keys.size) return;
    let dx = 0, dz = 0;
    if (this.keys.has('ArrowLeft')) dx -= 1; if (this.keys.has('ArrowRight')) dx += 1; if (this.keys.has('ArrowUp')) dz -= 1; if (this.keys.has('ArrowDown')) dz += 1;
    if (this.portrait) [dx, dz] = [dz, -dx];
    const sp = 18 * this.view.zoom * dt;
    if (this.view.zoom > 0.98) this.setZoom(0.8);
    this.view.tx += dx * sp; this.view.tz += dz * sp; this.clampView(); this.placeCamera(); this.placePop();
  }
  drain() {
    const ev = this.sim.ev; if (!ev.length) return;
    for (const e of ev) { try { this.onEvent(e); } catch (er) { console.warn('bastione event', er); } }
    ev.length = 0;
  }
  snd(key, ms, fn) { const n = performance.now(); if (n - (this.sfxT[key] || 0) < ms) return; this.sfxT[key] = n; if ((this.o.volume ?? 0.5) > 0) try { fn(); } catch {} }
  onEvent(e) {
    const fx = this.fx;
    switch (e.k) {
      case 'build': case 'upgrade': this.rebuildTower(e.t); fx.burst(e.t.x, 0.6, e.t.z, 18, '#e8dcc0', { sp: 3, up: 3, size: 0.5, life: 0.7 }); this.snd('build', 80, () => (e.k === 'build' ? sfx.ok?.() : sfx.levelup?.())); break;
      case 'sell': this.removeTower(e.t); fx.burst(e.t.x, 0.6, e.t.z, 14, '#ffd23f', { sp: 2.5, up: 4, size: 0.35 }); this.popup(`+${e.gold}`, e.t.x, 1.5, e.t.z, 'gold'); this.snd('coin', 80, () => sfx.coin?.()); break;
      case 'shot': {
        const k = e.kind;
        if (k === 'arrow' || k === 'firearrow') this.snd('arrow', 70, () => osfx.shoot());
        else if (k === 'bullet') this.snd('bullet', 90, () => osfx.swat());
        else if (k === 'ball' || k === 'bigball') { this.snd('can', 90, () => osfx.hit()); fx.burst(e.t.x, 2.2, e.t.z, 5, '#d6d3d1', { sp: 1, up: 1.5, size: 0.5, life: 0.5, grav: -1 }); }
        else if (k === 'shell' || k === 'bigshell') { this.snd('mort', 120, () => osfx.slam()); fx.burst(e.t.x, 1.8, e.t.z, 7, '#e7e5e4', { sp: 1, up: 2, size: 0.6, life: 0.7, grav: -1 }); }
        else if (k === 'frost') this.snd('frost', 120, () => osfx.toggle());
        break;
      }
      case 'zap': this.zaps.push({ pts: e.pts, t: 0.18 }); this.snd('zap', 90, () => osfx.saw()); for (const p of e.pts.slice(1)) fx.burst(p[0], p[1], p[2], 3, '#e9d5ff', { sp: 2, up: 1, size: 0.3, life: 0.25, grav: 0 }); break;
      case 'boom': {
        const col = e.kind === 'frost' ? '#bff4ff' : e.kind === 'goo' ? '#a3e635' : e.kind === 'meteor' || e.kind === 'comet' || e.kind === 'fireball' ? '#ff8a1f' : '#ffcf8a';
        this.ring(e.x, e.z, e.r, col);
        const n = Math.min(30, Math.round(6 + e.r * 6));
        if (e.kind === 'goo') fx.burst(e.x, 0.3, e.z, n, '#9be15d', { sp: e.r * 1.6, up: 1.5, size: 0.55, life: 1.0, grav: 1 });
        else if (e.kind === 'frost') fx.burst(e.x, 0.6, e.z, n, '#e0f7ff', { sp: e.r * 2, up: 1.5, size: 0.3, life: 0.6, grav: 2 });
        else { fx.burst(e.x, 0.4, e.z, n, col, { sp: e.r * 2.2, up: 4, size: 0.55, life: 0.55 }); fx.burst(e.x, 0.3, e.z, Math.round(n / 2), '#57534e', { sp: e.r * 1.2, up: 2, size: 0.8, life: 0.9, grav: -0.5 }); }
        if (e.kind === 'meteor' || e.kind === 'comet' || e.kind === 'bigshell' || e.kind === 'bigball') { this.shake(0.5); this.snd('boom', 120, () => osfx.boom()); }
        else if (e.kind === 'shell' || e.kind === 'ball') this.snd('expl', 80, () => osfx.slam());
        break;
      }
      case 'hit': if (e.kind === 'bullet') fx.burst(e.x, e.y + 0.7, e.z, 4, '#fde68a', { sp: 2, up: 1, size: 0.22, life: 0.25 }); else if (e.kind === 'fireball') { fx.burst(e.x, e.y + 0.6, e.z, 8, '#ff8a1f', { sp: 2, up: 2, size: 0.4, life: 0.4 }); } break;
      case 'die': {
        const E = ENEMIES[e.type]; TC.set(E.color);
        this.dying.push({ x: e.x, y: e.y, z: e.z, vx: (Math.random() - 0.5) * 3, vy: 4 + Math.random() * 2, vz: (Math.random() - 0.5) * 3, r: Math.random() * 6, s: E.scale * FIG, c: TC.clone(), t: 0 });
        fx.burst(e.x, e.y + 0.6, e.z, e.boss ? 40 : 8, E.color, { sp: e.boss ? 5 : 2.5, up: 3, size: e.boss ? 0.7 : 0.35, life: 0.6 });
        if (this.o.numbers && e.gold) this.popup(`+${e.gold}`, e.x, e.y + 1.6, e.z, 'gold');
        this.snd('pop', 45, () => osfx.pop());
        if (e.boss) { this.shake(1); this.snd('crash', 200, () => osfx.collapse()); this.banner('Capo sconfitto!', 'win', 2.5); }
        if (e.type === 'gemello') fx.burst(e.x, 0.6, e.z, 12, '#ff6b8a', { sp: 3, up: 3, size: 0.3 });
        break;
      }
      case 'leak': {
        this.shake(e.boss ? 1.2 : 0.4);
        const f = this.$('bs-flash'); f.classList.remove('on'); void f.offsetWidth; f.classList.add('on');
        this.popup(`-${e.n} ❤`, this.sim.keep.x, 3, this.sim.keep.z, 'bad');
        this.snd('hurt', 120, () => osfx.hurt());
        break;
      }
      case 'wave': this.banner(e.boss ? `Ondata ${e.i} · arriva il capo!` : `Ondata ${e.i}`, e.boss ? 'boss' : 'wave', 1.8); this.snd('wave', 200, () => (e.boss ? osfx.alarm() : osfx.wave())); break;
      case 'early': this.popup(`+${e.gold} anticipo`, this.view.tx, 2, this.view.tz, 'gold'); this.snd('coin', 80, () => sfx.coin?.()); break;
      case 'gold': if (this.o.numbers) this.popup(`+${e.n}`, e.x, 2.2, e.z, 'gold'); fx.burst(e.x, 1.6, e.z, 6, '#ffd23f', { sp: 1.5, up: 3, size: 0.3, life: 0.6 }); this.snd('mine', 300, () => sfx.coin?.()); break;
      case 'boss': this.banner(`${ENEMIES[e.e.type].name}!`, 'boss', 2.5); break;
      case 'heal': fx.burst(e.x, 1.2, e.z, 5, '#86efac', { sp: 1.5, up: 2, size: 0.3, life: 0.6, grav: -1 }); break;
      case 'stomp': this.ring(e.x, e.z, e.r, '#ffd6a0'); fx.burst(e.x, 0.3, e.z, 16, '#a8a29e', { sp: e.r * 2, up: 1.5, size: 0.6, life: 0.7 }); this.shake(0.5); this.snd('stomp', 200, () => osfx.slam()); break;
      case 'summon': fx.burst(e.x, 0.8, e.z, 14, '#ff4256', { sp: 2.5, up: 2.5, size: 0.4 }); break;
      case 'fall': fx.burst(e.x, 0.6, e.z, 8, '#2f7cf6', { sp: 2, up: 3, size: 0.35, life: 0.5 }); break;
      case 'poof': fx.burst(e.x, 0.6, e.z, 8, '#e5e7eb', { sp: 1.5, up: 2, size: 0.45, life: 0.5, grav: -1 }); break;
      case 'respawn': fx.burst(e.x, 0.6, e.z, e.hero ? 18 : 6, '#93c5fd', { sp: 1.5, up: 3, size: 0.35, life: 0.6, grav: -1 }); if (e.hero) this.banner('L’eroe è tornato!', 'hint', 1.6); break;
      case 'herodown': fx.burst(e.x, 0.8, e.z, 20, '#2f7cf6', { sp: 3, up: 4, size: 0.4 }); this.banner('Eroe a terra: torna tra 14 s', 'bad', 2.2); this.snd('hd', 300, () => osfx.hurt()); break;
      case 'warp': fx.burst(e.x, 0.8, e.z, 10, '#c084fc', { sp: 2, up: 2, size: 0.35, life: 0.5, grav: 0 }); break;
      case 'ability': this.ring(e.x, e.z, e.r, '#93c5fd'); fx.burst(e.x, 0.5, e.z, 22, e.id === 'portale' ? '#c084fc' : e.id === 'stendardo' ? '#ffd23f' : '#93c5fd', { sp: e.r * 2, up: 3, size: 0.4 }); this.snd('ab', 150, () => osfx.champ()); break;
      case 'spell': if (e.id === 'glaciazione') { this.ring(e.x, e.z, e.r, '#bff4ff'); fx.burst(e.x, 0.6, e.z, 40, '#e0f7ff', { sp: e.r * 2, up: 2, size: 0.45, life: 1 }); this.snd('ice', 150, () => osfx.burst()); } else if (e.id === 'rinforzi') { fx.burst(e.x, 0.6, e.z, 20, '#93c5fd', { sp: 2, up: 3, size: 0.4 }); this.snd('rf', 150, () => osfx.ready()); } else this.snd('met', 150, () => osfx.champ()); break;
      case 'win': this.finish(true); break;
      case 'lose': this.finish(false); break;
    }
  }
  ring(x, z, r, col) { const g = this.rings.find((q) => q.t >= q.T) || this.rings[0]; g.t = 0; g.T = 0.45; g.r = r; g.m.position.set(x, 0.1, z); g.m.material.color.set(col); }
  shake(a) { if (this.o.shake === false) return; this.shakeT = Math.max(this.shakeT, a); }
  popup(text, x, y, z, cls = '') {
    if (this.pops.length > 40) return;
    const p = this.toScreen(x, y, z), el = document.createElement('div');
    el.className = `bs-popn ${cls}`; el.textContent = text; el.style.left = `${p.x}px`; el.style.top = `${p.y}px`;
    this.$('bs-pops').appendChild(el); this.pops.push(el);
    setTimeout(() => { el.remove(); this.pops.splice(this.pops.indexOf(el), 1); }, 950);
  }
  banner(text, cls = '', secs = 2) {
    const b = this.$('bs-banner'); if (!b) return;
    b.className = `bs-banner on ${cls}`; b.innerHTML = text;
    clearTimeout(this._bt); this._bt = setTimeout(() => b.classList.remove('on'), secs * 1000);
  }
  rebuildTower(t) {
    this.removeTower(t, true);
    const g = towerModel(t.def, t.tier, t.spec); g.position.set(t.x, 0, t.z);
    g.traverse((x) => { if (x.isMesh) x.castShadow = this.tier === 'high' && x.castShadow; });
    this.scene.add(g); this.towerObjs.set(t.id, { g, t, pop: 0.25 });
    this.pads[t.slot].visible = false;
  }
  removeTower(t, keepPad = false) {
    const o = this.towerObjs.get(t.id); if (o) { this.scene.remove(o.g); o.g.traverse((x) => x.geometry?.dispose?.()); this.towerObjs.delete(t.id); }
    if (!keepPad) this.pads[t.slot].visible = true;
  }
  // a new enemy type: introduce it once
  introduce(type) {
    if (this.o.seen[type]) return; this.o.seen[type] = 1; this.o.onSeen?.(type);
    const E = ENEMIES[type]; if (type === 'mini') return;
    this.banner(`<span class="bs-new">${ENEMY_ICON[type]}</span><span><b>Nuovo nemico: ${esc(E.name)}</b><small>${esc(E.desc)}</small></span>`, 'intro', 5);
  }

  render(dt) {
    const S = this.sim, t = this.clock;
    if (this.shakeT > 0) { this.shakeT = Math.max(0, this.shakeT - dt * 2.5); this.placeCamera(); }
    // enemies
    const R = this.redC, L = this.lay; let k = 0;
    for (const l of Object.values(L)) l.begin();
    this.barBg.begin(); this.barFg.begin();
    const camQ = this.cam.quaternion, bq = new THREE.Matrix4(), bp = new THREE.Vector3(), bs = new THREE.Vector3();
    const bar = (x, y, z, w, f, col) => {
      bq.compose(bp.set(x, y, z), camQ, bs.set(w, 1, 1)); this.barBg.m.setMatrixAt(this.barBg.n++, bq);
      const off = new THREE.Vector3((-(1 - f) * w) / 2, 0, 0).applyQuaternion(camQ);
      bq.compose(bp.set(x + off.x, y + off.y, z + off.z), camQ, bs.set(Math.max(0.001, w * f), 0.75, 1)); this.barFg.m.setMatrixAt(this.barFg.n, bq); this.barFg.m.setColorAt(this.barFg.n, TC.set(col)); this.barFg.n++;
    };
    const WHITE = new THREE.Color('#ffffff');
    for (const e of S.enemies) {
      if (e.hp <= 0 || k >= R.cap) continue;
      if (!this.o.seen[e.type]) this.introduce(e.type);
      const E = e.def, s = E.scale * FIG, moving = S.moving(e);
      TC.set(E.color);
      if (e.freeze > 0) TC.lerp(new THREE.Color('#bff4ff'), 0.7); else if (e.slowT > 0) TC.lerp(new THREE.Color('#7fd7ff'), 0.35);
      if (e.poison) TC.lerp(new THREE.Color('#9be15d'), 0.25);
      const y = e.fly ? e.y + Math.sin(t * 4 + e.id) * 0.18 : 0;
      R.set(k++, e.x, y, e.z, e.face, s, TC.r, TC.g, TC.b, e.id * 0.37, moving ? 1 : 0);
      const hat = E.hat;
      if (hat === 'helmet') L.helmet.put(e.x, y, e.z, e.face, s, TC.set('#9aa3b2'));
      if (hat === 'band') L.band.put(e.x, y, e.z, e.face, s, WHITE);
      if (hat === 'hood') L.hood.put(e.x, y, e.z, e.face, s, TC.set('#7c2d6b'));
      if (hat === 'dot') L.dot.put(e.x, y, e.z, e.face, s, WHITE);
      if (hat === 'crown') L.crown.put(e.x, y, e.z, e.face, s);
      if (E.shield) L.shield.put(e.x, y, e.z, e.face, s, TC.set('#b8c0cc'));
      if (e.fly) { const fl = 1 + Math.sin(t * 22 + e.id) * 0.25; L.wings.put(e.x, y, e.z, e.face, s * fl, TC.set(E.boss ? '#fbcfe8' : '#ffe0f0'), s); }
      if (e.hp < e.max || E.boss) { const f = Math.max(0, e.hp / e.max); bar(e.x, y + s * 1.2 + 0.25, e.z, E.boss ? 2.4 : 0.9, f, f > 0.5 ? '#4ade80' : f > 0.25 ? '#facc15' : '#ef4444'); }
    }
    R.commit(k);
    // blue units: soldiers + hero
    const B = this.blueC; let b = 0;
    for (const m of S.soldiers) {
      if (m.dead || m.life < 0 || b >= B.cap) continue;
      const lv = m.rank || 0; TC.set(m.tower ? (m.tower.spec === 0 ? '#1e40af' : '#2f7cf6') : '#60a5fa');
      if (m.hit > 0) TC.lerp(WHITE, 0.6);
      const s = FIG * (0.95 + lv * 0.05);
      const lunge = m.atkAnim > 0 ? Math.sin((m.atkAnim / 0.25) * Math.PI) * 0.25 : 0;
      const mx = m.x + Math.sin(m.face) * lunge, mz = m.z + Math.cos(m.face) * lunge;
      B.set(b++, mx, 0, mz, m.face, s, TC.r, TC.g, TC.b, m.id * 0.53, m.moving ? 1 : 0);
      L.helmet.put(mx, 0, mz, m.face, s, TC.set(lv >= 3 ? '#ffd23f' : '#d1d5db'));
      L.sword.put(mx, 0, mz, m.face, s, TC.set('#e5e7eb'));
      if (m.tower?.spec === 0) L.shield.put(mx, 0, mz, m.face, s, TC.set('#2f7cf6'));
      if (m.hp < m.max) bar(m.x, s * 1.2 + 0.2, m.z, 0.8, m.hp / m.max, '#60a5fa');
    }
    const h = S.hero;
    if (h && !h.dead && b < B.cap) {
      const H = h.def, s = FIG * (H.id === 'orso' ? 1.9 : 1.4); TC.set(H.id === 'orso' ? '#8b5a33' : H.color); if (h.hit > 0) TC.lerp(WHITE, 0.6);
      const lunge = h.atkAnim > 0 ? Math.sin((h.atkAnim / 0.3) * Math.PI) * 0.3 : 0, hx = h.x + Math.sin(h.face) * lunge, hz = h.z + Math.cos(h.face) * lunge;
      B.set(b++, hx, 0, hz, h.face, s, TC.r, TC.g, TC.b, 0.1, h.moving ? 1 : 0);
      if (H.id === 'capitano') { L.helmet.put(hx, 0, hz, h.face, s, TC.set('#e5e7eb')); L.sword.put(hx, 0, hz, h.face, s, TC.set('#fde047')); L.shield.put(hx, 0, hz, h.face, s, TC.set('#1d4ed8')); }
      else if (H.id === 'arciera') L.hood.put(hx, 0, hz, h.face, s, TC.set('#166534'));
      else if (H.id === 'mago') L.hood.put(hx, 0.1, hz, h.face, s, TC.set('#6b21a8'), s * 1.5);
      else { L.helmet.put(hx, 0, hz, h.face, s, TC.set('#1e40af')); }
      L.crown.put(hx, H.id === 'mago' ? 0.25 : 0, hz, h.face, s * 0.8);
      bar(h.x, s * 1.2 + 0.3, h.z, 1.3, h.hp / h.max, '#38bdf8');
      if (this.sel?.kind === 'hero' || this.arm === 'hero') { this.range.visible = true; this.range.position.set(h.x, 0.06, h.z); this.range.scale.setScalar(H.melee ? 2.8 : H.range); this.rangeMats[1].color.set('#7dd3fc'); }
    }
    B.commit(b);
    // dying figures fly off
    const D = this.dieC; let dn = 0;
    this.dying = this.dying.filter((d) => (d.t += dt) < 0.9);
    for (const d of this.dying) { d.vy -= 18 * dt; d.x += d.vx * dt; d.y = Math.max(0, d.y + d.vy * dt); d.z += d.vz * dt; d.r += dt * 9; if (dn < D.cap) D.set(dn++, d.x, d.y, d.z, d.r, d.s * (1 - d.t * 0.6), d.c.r, d.c.g, d.c.b, 0, 0); }
    D.commit(dn);
    for (const l of Object.values(L)) l.end();
    this.barBg.end(); this.barFg.end();
    // projectiles
    this.ballL.begin(); this.arrowL.begin();
    for (const p of S.projs) {
      const col = TC.set(PCOL[p.kind] || '#ffffff');
      if (p.kind === 'arrow' || p.kind === 'firearrow' || p.kind === 'bullet') {
        const dmy = this.dummy; dmy.position.set(p.x, p.y, p.z); dmy.lookAt(p.tx, (p.ty || 0) + 0.6, p.tz); dmy.scale.set(1, 1, p.kind === 'bullet' ? 1.4 : 1); dmy.updateMatrix();
        if (this.arrowL.n < this.arrowL.cap) { this.arrowL.m.setMatrixAt(this.arrowL.n, dmy.matrix); this.arrowL.m.setColorAt(this.arrowL.n, col); this.arrowL.n++; }
        if (p.kind === 'firearrow' && Math.random() < 0.4) this.fx.emit(p.x, p.y, p.z, 0, 0.5, 0, TC.set('#ff8a1f'), 0.3, 0.3, -1);
      } else {
        const s = p.kind === 'bigball' || p.kind === 'bigshell' ? 1.6 : p.kind === 'meteor' ? 3 : p.kind === 'comet' ? 4.5 : p.kind === 'frost' ? 0.9 : p.kind === 'fireball' ? 1.4 : 1.1;
        this.ballL.put(p.x, p.y, p.z, 0, s, col);
        if ((p.kind === 'meteor' || p.kind === 'comet' || p.kind === 'fireball') && Math.random() < 0.8) this.fx.emit(p.x, p.y, p.z, (Math.random() - 0.5), 1, (Math.random() - 0.5), TC.set(Math.random() < 0.5 ? '#ff5a1f' : '#ffd23f'), p.kind === 'fireball' ? 0.5 : 1.2, 0.5, -2);
        if (p.kind === 'goo' && Math.random() < 0.3) this.fx.emit(p.x, p.y, p.z, 0, 0, 0, TC.set('#bef264'), 0.3, 0.4, 2);
      }
    }
    this.ballL.end(); this.arrowL.end();
    // fields: fire and goo puddles emit particles
    for (const f of S.fields) if (Math.random() < (f.kind === 'fire' ? 0.7 : 0.35) * Math.min(1, dt * 60)) { const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * f.r; this.fx.emit(f.x + Math.cos(a) * r, 0.2, f.z + Math.sin(a) * r, 0, f.kind === 'fire' ? 2 : 0.6, 0, TC.set(f.kind === 'fire' ? (Math.random() < 0.5 ? '#ff7a1a' : '#ffd23f') : '#84cc16'), f.kind === 'fire' ? 0.6 : 0.5, 0.6, -1); }
    // poison bubbles on poisoned enemies, frost sparkles
    if (Math.random() < 0.5) for (const e of S.enemies) { if (e.poison && Math.random() < 0.08) this.fx.emit(e.x, e.y + 1, e.z, 0, 1, 0, TC.set('#a3e635'), 0.25, 0.5, -1); if (e.burn && Math.random() < 0.15) this.fx.emit(e.x, e.y + 0.9, e.z, 0, 1.4, 0, TC.set('#ff8a1f'), 0.3, 0.4, -1); }
    // lightning
    let zi = 0; const Z = this.zapPos;
    this.zaps = this.zaps.filter((z) => (z.t -= dt) > 0);
    for (const z of this.zaps) for (let i = 0; i < z.pts.length - 1 && zi < 590; i++) {
      const [ax, ay, az] = z.pts[i], [bx, by, bz] = z.pts[i + 1]; let px = ax, py = ay, pz = az;
      for (let s = 1; s <= 4; s++) { const f = s / 4, j = s < 4 ? 0.35 : 0; const nx = ax + (bx - ax) * f + (Math.random() - 0.5) * j, ny = ay + (by - ay) * f + (Math.random() - 0.5) * j, nz = az + (bz - az) * f + (Math.random() - 0.5) * j; Z.set([px, py, pz, nx, ny, nz], zi * 3); zi += 2; px = nx; py = ny; pz = nz; }
    }
    this.zapLines.geometry.setDrawRange(0, zi); this.zapLines.geometry.attributes.position.needsUpdate = true;
    // towers: aim, recoil, spin, glow
    for (const { g, t: tw, ...o } of this.towerObjs.values()) {
      const ud = g.userData, ob = this.towerObjs.get(tw.id);
      if (ob.pop > 0) { ob.pop -= dt; g.scale.setScalar((1 + tw.tier * 0.08 + (tw.spec >= 0 ? 0.14 : 0)) * 0.92 * (1 + Math.sin(Math.max(0, ob.pop) / 0.25 * Math.PI) * 0.15)); }
      if (ud.head && !ud.static) ud.head.rotation.y = lerpAng(ud.head.rotation.y, tw.aim, Math.min(1, dt * 12));
      if (ud.barrel) ud.barrel.position.z = tw.fireT > 0 ? -tw.fireT * 0.6 : 0;
      if (ud.spin) { ud.spin.rotation.y += dt * 1.2; ud.spin.position.y = (ud.spin.userData.y0 ??= ud.spin.position.y) + Math.sin(t * 2 + tw.id) * 0.12; }
      if (ud.glow) ud.glow.emissiveIntensity = 0.5 + Math.sin(t * 5 + tw.id) * 0.2 + (tw.fireT > 0 ? 0.8 : 0);
      if (ud.bubbles) for (const [i, c] of ud.bubbles.children.entries()) c.position.y = 1.5 + ((t * 0.7 + i * 0.27) % 1) * 0.8;
      if (ud.flag) ud.flag.rotation.y = Math.sin(t * 3 + tw.id) * 0.3;
    }
    if (this.keep.userData.flag) this.keep.userData.flag.rotation.y = Math.sin(t * 2.5) * 0.35;
    for (const r of this.rings) { if (r.t >= r.T) { r.m.material.opacity = 0; continue; } r.t += dt; const f = r.t / r.T; r.m.scale.setScalar(Math.max(0.01, r.r * (0.3 + f * 0.8))); r.m.material.opacity = (1 - f) * 0.8; }
    if (this.markT > 0) { this.markT -= dt; this.marker.material.opacity = Math.min(1, this.markT); this.marker.scale.setScalar(1 + (1.2 - this.markT) * 0.4); if (this.markT <= 0) this.marker.visible = false; }
    // pads pulse when you can afford something
    const cheap = Math.min(...TOWERS.filter((d) => S.canBuild(d.id)).map((d) => S.towerCost(d, 0)));
    for (const [i, p] of this.pads.entries()) { if (!p.visible) continue; const on = this.sel?.kind === 'slot' && this.sel.i === i, hv = this.hoverSlot === i || this.kbSlot === i; p.userData.ring.material.opacity = on ? 1 : S.gold >= cheap ? 0.45 + Math.sin(t * 3) * 0.25 : 0.25; p.scale.setScalar(on || hv ? 1.08 : 1); }
    if (this.arm && this.arm !== 'hero') { const sp = SPELLS.find((s) => s.id === this.arm); const c = this.pad.on ? this.cursor.position : this.lastHover; if (c && sp) { this.range.visible = true; this.range.position.set(c.x, 0.06, c.z); this.range.scale.setScalar(sp.r); this.rangeMats[1].color.set('#fca5a5'); } }
    this.renderer.render(this.scene, this.cam);
  }

  // ───────── HUD
  syncHud(force) {
    const S = this.sim, $ = this.$, K = this.hudKey;
    const set = (id, v, html = false) => { if (!force && K[id] === v) return; K[id] = v; const el = $(id); if (el) { if (html) el.innerHTML = v; else el.textContent = v; } };
    set('bs-lives', `${ICON_HEART}<b>${S.lives}</b>`, true);
    set('bs-gold', `${ICON_COIN}<b>${fmt(S.gold)}</b>`, true);
    set('bs-wave', `${ICON_WAVE}<b>${S.wave}${S.endless ? '' : `/${S.waveTotal}`}</b>`, true);
    set('bs-speed', `x${this.speed}`);
    $('bs-pause').classList.toggle('on', this.paused);
    $('bs-pause').textContent = this.paused ? '▶' : 'II';
    // next wave button
    const call = $('bs-call'), canCall = S.state === 'ready' || (S.wave < S.waveTotal && S.waveT <= 16.01 && !S.over());
    call.classList.toggle('off', !canCall || this.over); call.classList.toggle('first', S.state === 'ready');
    if (canCall) {
      const w = S.wave, groups = S.endless ? endlessWave(S.L, w).groups : S.L.waveList[w] || [];
      const cnt = {}; for (const g of groups) cnt[g.type] = (cnt[g.type] || 0) + g.n;
      const prev = Object.entries(cnt).map(([ty, n]) => `<i>${ENEMY_ICON[ty] || ''}<b>${n}</b></i>`).join('');
      set('bs-call-p', prev, true);
      const bonus = S.state === 'play' ? Math.round(Math.max(0, S.waveT) * 1.5) : 0;
      set('bs-call-l', S.state === 'ready' ? `▶ Inizia la battaglia` : `▶ Ondata ${w + 1}${bonus ? ` · +${bonus}` : ''}`, true);
      const ring = $('bs-call-ring'); if (ring) ring.style.setProperty('--p', S.state === 'ready' ? 1 : Math.max(0, Math.min(1, S.waveT / 16)));
    }
    // hero
    const h = S.hero;
    if (h) {
      const hp = $('bs-hhp'); if (hp) hp.style.width = `${(h.dead ? 0 : h.hp / h.max) * 100}%`;
      set('bs-hres', h.dead ? `${Math.ceil(h.respawn)}s` : '');
      $('bs-hero')?.classList.toggle('on', this.arm === 'hero');
      $('bs-hero')?.classList.toggle('dead', h.dead);
      for (let i = 0; i < 2; i++) { const b = $('bs-ab' + i); if (!b) continue; const max = h.def.ab[i].cd * S.fx.heroCd, f = h.cd[i] / max; b.style.setProperty('--cd', f.toFixed(3)); b.classList.toggle('ready', f <= 0 && !h.dead); b.disabled = h.dead; }
    }
    for (const s of S.spells) { const b = $('bs-sp-' + s.def.id); if (!b) continue; const f = s.cd / s.max; b.style.setProperty('--cd', f.toFixed(3)); b.classList.toggle('ready', f <= 0 && S.state !== 'ready'); b.classList.toggle('on', this.arm === s.def.id); }
    $('bs-paused').classList.toggle('on', this.paused && !$('bs-modal').classList.contains('on'));
    if (this.markT == null || true) this.syncPop(false);
  }

  // ───────── gamepad: a cursor on the map, A = tap, B = back, X = next wave, Y = hero, LB/RB spells
  pollPad(dt) {
    const pads = navigator.getGamepads?.() || []; let p = null; for (const q of pads) if (q) { p = q; break; }
    if (!p) return;
    const P = this.pad, B = (i) => !!p.buttons[i]?.pressed, prev = P.prev, now = {};
    for (const i of [0, 1, 2, 3, 4, 5, 8, 9, 12, 13, 14, 15]) now[i] = B(i);
    const edge = (i) => now[i] && !prev[i];
    const ax = p.axes[0] || 0, ay = p.axes[1] || 0, rx = p.axes[2] || 0, ry = p.axes[3] || 0;
    const any = Object.values(now).some(Boolean) || Math.hypot(ax, ay) > 0.3 || Math.hypot(rx, ry) > 0.3 || (p.buttons[6]?.value || 0) > 0.3 || (p.buttons[7]?.value || 0) > 0.3;
    if (any && !P.on) { P.on = true; P.x = this.view.tx; P.z = this.view.tz; this.cursor.visible = true; }
    P.prev = now;
    if (!P.on) return;
    const modal = this.$('bs-modal').classList.contains('on'), menu = this.$('bs-pop').classList.contains('on');
    if (edge(9)) { if (modal) this.closeModal(), this.togglePause(false); else this.openModal(); return; }
    if (edge(8)) this.cycleSpeed();
    // focus navigation inside menus
    if (modal || menu) {
      const box = modal ? this.$('bs-modal') : this.$('bs-pop'), btns = [...box.querySelectorAll('button:not([disabled])')];
      P.rep -= dt;
      const dir = edge(15) || edge(13) || (P.rep <= 0 && (ax > 0.6 || ay > 0.6)) ? 1 : edge(14) || edge(12) || (P.rep <= 0 && (ax < -0.6 || ay < -0.6)) ? -1 : 0;
      if (dir && btns.length) { P.rep = 0.22; const cur = btns.indexOf(document.activeElement); btns[(cur + dir + btns.length) % btns.length].focus({ preventScroll: true }); }
      if (edge(0)) { const f = document.activeElement; if (f && box.contains(f)) f.click(); else btns[0]?.focus(); }
      if (edge(1)) { if (modal) { this.closeModal(); this.togglePause(false); } else this.deselect(); }
      return;
    }
    // cursor
    const k = 14 * this.view.zoom * dt;
    let dx = Math.abs(ax) > 0.18 ? ax : 0, dz = Math.abs(ay) > 0.18 ? ay : 0;
    if (now[14]) dx = -1; if (now[15]) dx = 1; if (now[12]) dz = -1; if (now[13]) dz = 1;
    if (this.portrait) [dx, dz] = [dz, -dx];
    P.x = Math.max(-MAP_W / 2, Math.min(MAP_W / 2, P.x + dx * k)); P.z = Math.max(-MAP_H / 2, Math.min(MAP_H / 2, P.z + dz * k));
    const sl = this.slotAt(P.x, P.z, 1.6);
    const cx = sl ? sl.x : P.x, cz = sl ? sl.z : P.z;
    this.cursor.position.set(cx, 0.09, cz); this.cursor.rotation.z += dt * 2; this.cursor.visible = true; this.hoverSlot = sl ? sl.i : null;
    this.lastHover = { x: cx, z: cz };
    // camera: right stick pans, triggers zoom, and it follows the cursor near the edges
    let px = Math.abs(rx) > 0.2 ? rx : 0, pz = Math.abs(ry) > 0.2 ? ry : 0; if (this.portrait) [px, pz] = [pz, -px];
    const zt = (p.buttons[7]?.value || 0) - (p.buttons[6]?.value || 0);
    if (zt) this.setZoom(this.view.zoom * Math.exp(-zt * dt * 1.5));
    if (px || pz) { this.view.tx += px * 16 * this.view.zoom * dt; this.view.tz += pz * 16 * this.view.zoom * dt; this.clampView(); this.placeCamera(); }
    const sp = this.toScreen(cx, 0, cz), W = this.root.clientWidth, H = this.root.clientHeight;
    if (sp.x < W * 0.12 || sp.x > W * 0.88 || sp.y < H * 0.15 || sp.y > H * 0.85) { this.view.tx += (cx - this.view.tx) * dt * 2; this.view.tz += (cz - this.view.tz) * dt * 2; this.clampView(); this.placeCamera(); }
    if (edge(0)) this.tap(cx, cz);
    if (edge(1)) this.deselect();
    if (edge(2)) this.callWave();
    if (edge(3)) { if (this.arm === 'hero') this.tap(cx, cz); else this.selectHero(); }
    if (edge(4)) this.armSpell(0);
    if (edge(5)) this.armSpell(this.sim.spells.length > 2 && this.arm === this.sim.spells[1].def.id ? 2 : 1);
  }

  finish(win) {
    if (this.over) return;
    this.over = true; this.deselect();
    const S = this.sim;
    if (win) { for (let i = 0; i < 6; i++) setTimeout(() => this.fx?.burst(S.keep.x + (Math.random() - 0.5) * 4, 4 + Math.random() * 3, S.keep.z + (Math.random() - 0.5) * 4, 30, ['#ffd23f', '#60a5fa', '#f472b6', '#4ade80'][i % 4], { sp: 5, up: 6, size: 0.4, life: 1.2, grav: 5 }), i * 220); this.snd('win', 500, () => osfx.win()); }
    else { this.shake(1.5); this.snd('lose', 500, () => osfx.lose()); }
    const r = S.result();
    this._endT = setTimeout(() => this.o.onEnd?.(r), this.o.instantEnd ? 0 : 1600);
  }
  debugInfo() { return { ...this.sim.debug(), speed: this.speed, paused: this.paused, sel: this.sel, portrait: this.portrait, zoom: +this.view.zoom.toFixed(2), pr: this.renderer.getPixelRatio(), guard: this.guard?.log }; }
  destroy() {
    cancelAnimationFrame(this.raf); clearTimeout(this._endT); clearTimeout(this._bt); clearTimeout(this._helpT);
    window.removeEventListener('keydown', this.onKD, true); window.removeEventListener('keyup', this.onKU, true);
    window.removeEventListener('pointerup', this.onPU); window.removeEventListener('pointercancel', this.onPU);
    document.removeEventListener('visibilitychange', this.onVis);
    this.ro?.disconnect();
    this.scene?.traverse((x) => { x.geometry?.dispose?.(); const m = x.material; (Array.isArray(m) ? m : m ? [m] : []).forEach((y) => { y.map?.dispose?.(); y.dispose?.(); }); });
    disposeMats();
    this.renderer?.dispose(); this.renderer?.forceContextLoss?.();
    this.root.innerHTML = '';
    this.fx = null;
  }
}
export { HEROES };
