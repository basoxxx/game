// Orda · 2 giocatori — local multiplayer on one screen.
//   versus: two cannons, two bases, each player's crowd marches on the other's base through a
//           symmetric arena with shared gates in the middle. Best of 3 rounds, round timer, sudden
//           death, handicap, a champion per player.
//   coop:   both cannons on the same side against an AI fortress that fires back.
// Self-contained on purpose: it shares the level JSON idea, the champion ids and the save file with
// the Orda core (src/orda/game.js) but runs its own small crowd simulation, so the core can change
// freely while this mode is developed in parallel. The sim is deterministic for a given seed and
// sequence of inputs: tests drive it with step(dt) and the input object (see versus-input.js).
//   const g = new OrdaVersus(root, { variant, level, seed, champions:[a,b], handicap:[0,0], bots,
//                                    rounds, roundTime, tier, volume, flat, onEnd, onPause, onRound })
//   await g.start(); … g.destroy();
import * as THREE from 'three';
import { pixelRatio } from '../ui/quality.js';
import { FrameGuard } from '../ui/perfguard.js';
import { sfx } from '../ui/audio.js';
import { VersusInput } from './versus-input.js';

import { VS_CHAMPIONS, VS_CHAMP_IDS, VS_ARENAS, VS_COOP, expandLevel } from './versus-data.js';
export { VS_CHAMPIONS, VS_CHAMP_IDS, VS_ARENAS, VS_COOP, expandLevel };

const TEAM = { 0: '#2f7bff', 1: '#ff3d3d', 2: '#ffb21a', ai: '#ff3d3d' };
const N = 900, CAP = 300, R_HIT = 0.55, CELL = 1.2, SPEED = 5.4, SUDDEN = 30;
const rng = (s) => () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const gateText = (g) => (g.type === 'mul' ? `×${g.value}` : g.type === 'add' ? `+${g.value}` : g.broken ? '✕' : `−${Math.max(0, Math.ceil(g.left ?? g.value))}`);
const fmtT = (s) => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

// ---------- tiny particle pool (hits, base sparks, confetti)
class Puffs {
  constructor(scene, n = 700) {
    this.n = n; this.i = 0;
    this.p = new Float32Array(n * 3).fill(-999); this.v = new Float32Array(n * 3); this.c = new Float32Array(n * 3); this.l = new Float32Array(n); this.s = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.p, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.c, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.s, 1).setUsage(THREE.DynamicDrawUsage));
    this.uScale = { value: 400 };
    const m = new THREE.ShaderMaterial({
      uniforms: { uScale: this.uScale },
      vertexShader: 'attribute float size; attribute vec3 color; varying vec3 vC; uniform float uScale; void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = size > 0.0 ? clamp(size * uScale / max(1.0, -mv.z), 1.0, 40.0) : 0.0; }',
      fragmentShader: 'varying vec3 vC; void main(){ vec2 d = gl_PointCoord - 0.5; if (dot(d, d) > 0.25) discard; gl_FragColor = vec4(vC, 1.0); }',
      depthWrite: false,
    });
    this.pts = new THREE.Points(g, m); this.pts.frustumCulled = false; scene.add(this.pts);
    this.tc = new THREE.Color();
  }
  burst(x, y, z, color, n, sp = 5, size = 0.35, life = 0.6, rnd = Math.random) {
    this.tc.set(color);
    for (let k = 0; k < n; k++) {
      const i = this.i = (this.i + 1) % this.n, j = i * 3, a = rnd() * Math.PI * 2, s = sp * (0.4 + rnd() * 0.6);
      this.p[j] = x; this.p[j + 1] = y; this.p[j + 2] = z;
      this.v[j] = Math.cos(a) * s; this.v[j + 1] = sp * (0.6 + rnd()); this.v[j + 2] = Math.sin(a) * s;
      this.c[j] = this.tc.r; this.c[j + 1] = this.tc.g; this.c[j + 2] = this.tc.b; this.l[i] = life * (0.6 + rnd() * 0.6); this.s[i] = size;
    }
    this.dirty = true;
  }
  update(dt) {
    if (!this.dirty) return;
    let any = false;
    for (let i = 0; i < this.n; i++) {
      if (this.l[i] <= 0) continue;
      this.l[i] -= dt; const j = i * 3;
      if (this.l[i] <= 0) { this.s[i] = 0; this.p[j + 1] = -999; continue; }
      any = true;
      this.v[j + 1] -= 18 * dt;
      this.p[j] += this.v[j] * dt; this.p[j + 1] += this.v[j + 1] * dt; this.p[j + 2] += this.v[j + 2] * dt;
      if (this.p[j + 1] < 0.05) { this.p[j + 1] = 0.05; this.v[j + 1] *= -0.35; this.v[j] *= 0.6; this.v[j + 2] *= 0.6; }
    }
    const a = this.pts.geometry.attributes; a.position.needsUpdate = a.color.needsUpdate = a.size.needsUpdate = true;
    this.dirty = any;
  }
}

function labelTexture(text, bg, fg = '#fff') {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = bg; g.beginPath(); g.roundRect(8, 8, 240, 112, 36); g.fill();
  g.lineWidth = 8; g.strokeStyle = 'rgba(255,255,255,.9)'; g.stroke();
  g.fillStyle = fg; g.font = '900 78px "Exo 2", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 10; g.strokeStyle = 'rgba(0,0,0,.35)'; g.strokeText(text, 128, 70); g.fillText(text, 128, 68);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function groundTexture(lv) {
  const A = lv.arena, S = 1024, cv = document.createElement('canvas'); cv.width = S / 2; cv.height = S;
  const g = cv.getContext('2d'), kx = cv.width / A.w, kz = cv.height / A.l;
  g.fillStyle = A.ground; g.fillRect(0, 0, cv.width, cv.height);
  // mowed stripes
  for (let i = 0; i < 20; i++) { g.fillStyle = i % 2 ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.05)'; g.fillRect(0, (i * cv.height) / 20, cv.width, cv.height / 20); }
  // the path between the bases
  g.fillStyle = A.path; g.globalAlpha = 0.55; g.beginPath(); g.roundRect(cv.width * 0.12, 0, cv.width * 0.76, cv.height, 40); g.fill(); g.globalAlpha = 1;
  // speckles
  const r = rng(7); for (let i = 0; i < 900; i++) { g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.07)'; g.fillRect(r() * cv.width, r() * cv.height, 2 + r() * 4, 2 + r() * 4); }
  // centre line and halves tinted by team
  g.fillStyle = 'rgba(47,123,255,.10)'; g.fillRect(0, cv.height / 2, cv.width, cv.height / 2);
  g.fillStyle = 'rgba(255,61,61,.10)'; g.fillRect(0, 0, cv.width, cv.height / 2);
  g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 6; g.setLineDash([22, 16]); g.beginPath(); g.moveTo(0, cv.height / 2); g.lineTo(cv.width, cv.height / 2); g.stroke(); g.setLineDash([]);
  g.beginPath(); g.arc(cv.width / 2, cv.height / 2, 3 * kx, 0, Math.PI * 2); g.stroke();
  void kz;
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

// ---------- the game
export class OrdaVersus {
  constructor(root, opts = {}) {
    this.root = root;
    this.o = { variant: 'versus', rounds: 3, tier: 'high', volume: 0.5, champions: ['colosso', 'grillo'], handicap: [0, 0], bots: [false, false], diff: 'normale', flat: true, ...opts };
    this.coop = this.o.variant === 'coop';
    this.lv = expandLevel(this.o.level || VS_ARENAS[0]);
    this.W = this.lv.arena.w; this.L = this.lv.arena.l;
    this.seed = this.o.seed ?? ((Date.now() & 0xffffff) + 11);
    this.rand = rng(this.seed);
    this.roundTime = this.o.roundTime || this.lv.timer || 90;
    if (this.coop) this.roundTime = this.o.roundTime || 150;
    this.needWins = Math.ceil((this.o.rounds || 3) / 2);
    this.wins = [0, 0]; this.round = 0; this.results = [];
    this.paused = false; this.over = false; this.clock = 0; this.acc = 0;
    // figure arrays
    this.f = {
      alive: new Uint8Array(N), side: new Uint8Array(N), own: new Uint8Array(N), ch: new Int8Array(N).fill(-1), hp: new Float32Array(N),
      aux: new Float32Array(N), t: new Float32Array(N), x: new Float32Array(N), z: new Float32Array(N), vx: new Float32Array(N), ph: new Float32Array(N), mask: new Uint32Array(N), sp: new Float32Array(N), sc: new Float32Array(N),
    };
    this.free = []; for (let i = N - 1; i >= 0; i--) this.free.push(i);
    this.count = [0, 0]; this.grid = new Map();
    this.stats = [this.blankStats(), this.blankStats(), this.blankStats()];
    this.total = [this.blankStats(), this.blankStats(), this.blankStats()];
  }
  blankStats() { return { sent: 0, kills: 0, dmg: 0, gates: 0, champs: 0, peak: 0, lost: 0 }; }

  // champion of player p (or the AI)
  champOf(p) { return VS_CHAMPIONS[(this.o.champions || [])[p]] ? (this.o.champions[p]) : p === 2 ? 'colosso' : VS_CHAMP_IDS[p % VS_CHAMP_IDS.length]; }
  hc(p) { return clamp(+(this.o.handicap?.[p] || 0), 0, 3); }

  async start() {
    const root = this.root, coop = this.coop;
    const names = this.names = this.o.names || (coop ? ['Giocatore 1', 'Giocatore 2'] : ['Blu', 'Rosso']);
    const pcol = this.pcol = coop ? [TEAM[0], TEAM[2]] : [TEAM[0], TEAM[1]];
    const champBtn = (p) => { const C = VS_CHAMPIONS[this.champOf(p)]; return `<button class="ovs-champ" id="ovs-ch${p}" data-p="${p}" aria-label="Campione ${C.name}"><i class="ovs-ring"></i><b>${C.icon}</b><span>${C.name}</span></button>`; };
    const panel = (p) => `<div class="ovs-p ovs-p${p + 1}" id="ovs-p${p}" style="--pc:${pcol[p]}">
        <div class="ovs-info"><div class="ovs-name"><i></i><b>${names[p]}</b>${coop ? '' : `<span class="ovs-pips" id="ovs-pips${p}"></span>`}</div>
        <div class="ovs-crowd"><b id="ovs-n${p}">0</b><span>in campo</span></div>
        ${coop ? '' : `<div class="ovs-hp"><i id="ovs-hp${p}"></i></div><div class="ovs-hpn" id="ovs-hpn${p}"></div>`}</div>
        ${champBtn(p)}<div class="ovs-touch" id="ovs-t${p}"><i></i></div></div>`;
    root.innerHTML = `<canvas class="ovs-cv"></canvas><div class="ovs-hud ${coop ? 'coop' : 'versus'}" id="ovs-hud">
      <div class="ovs-split"></div>
      ${panel(0)}${panel(1)}
      <div class="ovs-mid" id="ovs-mid"><div class="ovs-round" id="ovs-round"></div><div class="ovs-timer" id="ovs-timer">1:30</div></div>
      ${coop ? `<div class="ovs-boss" id="ovs-boss"><span>Fortezza</span><div class="ovs-hp"><i id="ovs-hp2"></i></div><span>Base</span><div class="ovs-hp ovs-hp-us"><i id="ovs-hp0"></i></div></div>` : ''}
      <button class="ovs-pause" id="ovs-pause" aria-label="Pausa">II</button>
      <div class="ovs-banner" id="ovs-banner"></div><div class="ovs-count" id="ovs-count"></div>
      <div class="ovs-help" id="ovs-help"></div>
    </div>`;
    this.$ = (id) => root.querySelector('#' + id);
    this.cv = root.querySelector('.ovs-cv');
    const tier = this.tier = this.o.tier;
    let r;
    try { r = this.renderer = new THREE.WebGLRenderer({ canvas: this.cv, antialias: tier !== 'low', powerPreference: 'high-performance' }); } catch (e) { throw new Error('WebGL non disponibile'); }
    r.setPixelRatio(pixelRatio(1.75));
    r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.08;
    r.shadowMap.enabled = tier !== 'low'; r.shadowMap.type = THREE.PCFSoftShadowMap;
    const setPR = (pr) => { if (Math.abs(r.getPixelRatio() - pr) < 0.01) return false; r.setPixelRatio(pr); this.resize(); };
    this.guard = new FrameGuard([{ fps: 40, run: () => setPR(1) }, { fps: 30, run: () => { if (!r.shadowMap.enabled) return false; r.shadowMap.enabled = false; this.scene.traverse((x) => { if (x.material) x.material.needsUpdate = true; }); } }, { fps: 24, run: () => setPR(0.75) }]);
    this.buildScene();
    this.input = new VersusInput(root, { onPause: () => this.togglePause(), players: 2 });
    this.input.onTouch = (p, T) => this.drawTouch(p, T);
    for (const p of [0, 1]) this.$('ovs-ch' + p).addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.champReq[p] = true; });
    this.$('ovs-pause').addEventListener('click', () => this.togglePause());
    this.onVis = () => { if (document.hidden && !this.paused && !this.over) this.togglePause(true); };
    document.addEventListener('visibilitychange', this.onVis);
    this.champReq = [false, false];
    this.resize();
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(root);
    this.newRound();
    this.last = performance.now();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
    document.activeElement?.blur?.();
  }

  buildScene() {
    const lv = this.lv, W = this.W, L = this.L;
    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color('#9fdcff');
    scene.fog = new THREE.Fog('#9fdcff', 120, 260);
    this.cam = new THREE.PerspectiveCamera(36, 1, 1, 600);
    scene.add(new THREE.HemisphereLight('#ffffff', '#6a8a50', 1.25));
    const sun = new THREE.DirectionalLight('#fff3dc', 2.1);
    sun.position.set(18, 40, 12); sun.castShadow = this.renderer.shadowMap.enabled;
    sun.shadow.mapSize.set(this.tier === 'high' ? 2048 : 1024, this.tier === 'high' ? 2048 : 1024);
    const sc = sun.shadow.camera; sc.left = -W / 2 - 6; sc.right = W / 2 + 6; sc.top = L / 2 + 8; sc.bottom = -L / 2 - 8; sc.near = 1; sc.far = 120; sun.shadow.bias = -0.0008;
    scene.add(sun, sun.target);
    // surroundings: a big soft island and some round trees, so the frame is never empty
    const out = new THREE.Mesh(new THREE.CircleGeometry(160, 48).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: lv.arena.water ? '#58b9e6' : '#8fd36c' }));
    out.position.y = -0.3; out.receiveShadow = true; scene.add(out);
    const gnd = new THREE.Mesh(new THREE.PlaneGeometry(W, L).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: groundTexture(lv) }));
    gnd.receiveShadow = true; scene.add(gnd);
    // raised kerbs along the sides
    const kerbM = new THREE.MeshLambertMaterial({ color: lv.arena.side });
    for (const s of [-1, 1]) { const k = new THREE.Mesh(new THREE.BoxGeometry(1, 0.9, L + 2), kerbM); k.position.set(s * (W / 2 + 0.5), 0.15, 0); k.castShadow = k.receiveShadow = true; scene.add(k); }
    const treeG = new THREE.IcosahedronGeometry(1, 1), trunkG = new THREE.CylinderGeometry(0.25, 0.35, 1.4, 6);
    const treeM = new THREE.MeshLambertMaterial({ color: '#3fae4a', flatShading: true }), trunkM = new THREE.MeshLambertMaterial({ color: '#8a5a33' });
    const tr = rng(3), nt = 46, trees = new THREE.InstancedMesh(treeG, treeM, nt), trunks = new THREE.InstancedMesh(trunkG, trunkM, nt), M = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S = new THREE.Vector3();
    for (let i = 0; i < nt; i++) {
      const side = i % 2 ? 1 : -1, x = side * (W / 2 + 3 + tr() * 12), z = (tr() - 0.5) * (L + 24), s = 1.4 + tr() * 1.4;
      M.compose(V.set(x, 1.3 + s * 0.8, z), Q.identity(), S.set(s, s * 1.1, s)); trees.setMatrixAt(i, M);
      M.compose(V.set(x, 0.6, z), Q.identity(), S.set(1, 1, 1)); trunks.setMatrixAt(i, M);
      trees.setColorAt(i, new THREE.Color().setHSL(0.28 + tr() * 0.08, 0.55, 0.38 + tr() * 0.12));
    }
    trees.castShadow = true; scene.add(trees, trunks);

    // bases: a wall across each end with two towers, a gate and a flag
    this.bases = [];
    const sides = this.coop ? [0, 1] : [0, 1];
    for (const s of sides) {
      const col = this.coop ? (s === 0 ? '#3a7bd5' : '#c8323a') : (s === 0 ? TEAM[0] : TEAM[1]);
      const g = new THREE.Group(), dz = s === 0 ? 1 : -1;
      const stone = new THREE.MeshLambertMaterial({ color: '#efe6d6' }), team = new THREE.MeshLambertMaterial({ color: col });
      const wall = new THREE.Mesh(new THREE.BoxGeometry(W + 1.6, 2.2, 1.6), stone); wall.position.y = 1.1; g.add(wall);
      for (let i = -4; i <= 4; i++) { const c = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.6, 1.7), i % 2 ? team : stone); c.position.set(i * 2.3, 2.5, 0); g.add(c); }
      for (const sx of [-1, 1]) {
        const tw = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.9, 4.2, 12), stone); tw.position.set(sx * (W / 2 - 0.4), 2.1, 0); g.add(tw);
        const roof = new THREE.Mesh(new THREE.ConeGeometry(2.1, 2.4, 12), team); roof.position.set(sx * (W / 2 - 0.4), 5.4, 0); g.add(roof);
      }
      const door = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.8, 0.4), team); door.position.set(0, 0.9, -0.75 * dz); g.add(door);
      const keep = new THREE.Mesh(new THREE.BoxGeometry(5, 3.2, 3), stone); keep.position.set(0, 1.6, 1.6 * dz); g.add(keep);
      const keepR = new THREE.Mesh(new THREE.ConeGeometry(3.4, 2.4, 4).rotateY(Math.PI / 4), team); keepR.position.set(0, 4.4, 1.6 * dz); g.add(keepR);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3), stone); pole.position.set(0, 6.6, 1.6 * dz); g.add(pole);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1), new THREE.MeshLambertMaterial({ color: col, side: THREE.DoubleSide })); flag.position.set(0.8, 7.5, 1.6 * dz); g.add(flag);
      g.traverse((x) => { if (x.isMesh) { x.castShadow = true; x.receiveShadow = true; } });
      g.position.set(0, 0, dz * (L / 2 + 0.6));
      scene.add(g);
      this.bases.push({ g, flag, z0: g.position.z, hp: 1, max: 1, shake: 0 });
    }
    // cannons: player 1 (and in co-op player 2) at the +z end; versus player 2 / the AI at -z
    this.cannons = [];
    const mkCannon = (col) => {
      const g = new THREE.Group(), body = new THREE.MeshLambertMaterial({ color: col }), dark = new THREE.MeshLambertMaterial({ color: '#2b2f3a' });
      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.4, 0.7, 16), body); base.position.y = 0.35; g.add(base);
      const barrel = new THREE.Group(); barrel.position.y = 1.0; g.add(barrel);
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.75, 2.4, 16).rotateX(Math.PI / 2), dark); tube.position.z = -0.7; barrel.add(tube);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.14, 8, 18), body); ring.position.z = -1.85; barrel.add(ring);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.7, 16, 12), body); ball.position.z = 0.4; barrel.add(ball);
      for (const sx of [-1, 1]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.3, 14).rotateZ(Math.PI / 2), dark); w.position.set(sx * 1.25, 0.6, 0.2); g.add(w); }
      // aim marker: a soft dot on the ground showing where the crowd will land
      const mk = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.75, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.8, depthWrite: false })); mk.position.set(0, 0.03, -3.2); g.add(mk);
      g.traverse((x) => { if (x.isMesh && x !== mk) x.castShadow = true; });
      scene.add(g); return { g, barrel, kick: 0 };
    };
    const zP = L / 2 - 3.6;
    const defs = this.coop
      ? [{ p: 0, side: 0, z: zP, x0: -W / 4, lo: -W / 2 + 1.4, hi: -0.6 }, { p: 1, side: 0, z: zP, x0: W / 4, lo: 0.6, hi: W / 2 - 1.4 }, { p: 2, side: 1, z: -zP, x0: 0, lo: -W / 2 + 1.4, hi: W / 2 - 1.4, ai: true }]
      : [{ p: 0, side: 0, z: zP, x0: 0, lo: -W / 2 + 1.4, hi: W / 2 - 1.4 }, { p: 1, side: 1, z: -zP, x0: 0, lo: -W / 2 + 1.4, hi: W / 2 - 1.4 }];
    for (const d of defs) {
      const c = mkCannon(d.p === 2 ? TEAM.ai : this.pcol[d.p]);
      c.g.position.set(d.x0, 0, d.z); c.g.rotation.y = d.side === 0 ? 0 : Math.PI;
      this.cannons.push({ ...d, ...c, x: d.x0, cd: 0, charge: 0, aiT: 0, aiX: d.x0, champCd: 0 });
    }
    // gates: two posts, a translucent panel, a label sprite that always faces the camera
    this.gateObjs = [];
    for (const gt of lv.gates) {
      const good = gt.type !== 'sub', col = good ? (gt.type === 'mul' ? '#2ad16f' : '#1fb8e0') : '#ff4060';
      const g = new THREE.Group();
      const post = new THREE.MeshLambertMaterial({ color: '#ffffff' });
      for (const sx of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 2.6, 8), post); p.position.set(sx * gt.w / 2, 1.3, 0); p.castShadow = true; g.add(p); }
      const bar = new THREE.Mesh(new THREE.BoxGeometry(gt.w, 0.3, 0.3), new THREE.MeshLambertMaterial({ color: col })); bar.position.y = 2.6; g.add(bar);
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(gt.w, 2.4), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false })); pane.position.y = 1.25; g.add(pane);
      // the floor strip says whose gate it is (team colour); shared centre gates keep the gate colour
      const own = gt.side < 0 ? col : gt.side === 0 ? this.pcol[0] : this.coop ? TEAM.ai : this.pcol[1];
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(gt.w, 1.2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: own, transparent: true, opacity: 0.45, depthWrite: false })); floor.position.y = 0.02; g.add(floor);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(gateText(gt), col), depthTest: false })); sp.scale.set(3.2, 1.6, 1); sp.position.y = 3.6; sp.renderOrder = 10; g.add(sp);
      g.position.set(gt.x, 0, gt.z); scene.add(g);
      this.gateObjs.push({ g, pane, sp, col, gt, flash: 0, txt: gateText(gt) });
    }
    // obstacles: striped bumpers (or rocks on the bridge)
    for (const ob of lv.obstacles) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(ob.r, ob.r * 1.08, 1.4, 20), new THREE.MeshLambertMaterial({ color: lv.arena.water ? '#9a8f80' : '#ffcf3a' }));
      m.position.set(ob.x, 0.7, ob.z); m.castShadow = m.receiveShadow = true; scene.add(m);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(ob.r * 0.7, ob.r, 0.4, 20), new THREE.MeshLambertMaterial({ color: lv.arena.water ? '#7c7266' : '#ff6a3d' })); cap.position.set(ob.x, 1.6, ob.z); scene.add(cap);
    }
    // the crowd: instanced bodies + heads + champions' crowns
    const bodyG = new THREE.CapsuleGeometry(0.3, 0.42, 4, 10); bodyG.translate(0, 0.52, 0);
    const headG = new THREE.SphereGeometry(0.26, 12, 10); headG.translate(0, 1.18, 0);
    this.bodies = new THREE.InstancedMesh(bodyG, new THREE.MeshLambertMaterial({ color: '#ffffff' }), N);
    this.heads = new THREE.InstancedMesh(headG, new THREE.MeshLambertMaterial({ color: '#ffffff' }), N);
    for (const m of [this.bodies, this.heads]) { m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.count = 0; m.castShadow = true; m.frustumCulled = false; scene.add(m); }
    // instance colours set once per owner slot (re-set when a slot is reused)
    const white = new THREE.Color('#ffffff');
    for (let i = 0; i < N; i++) { this.bodies.setColorAt(i, white); this.heads.setColorAt(i, white); }
    this.cols = [0, 1, 2].map((p) => { const c = new THREE.Color(p === 2 ? TEAM.ai : this.pcol[p]); return { body: c, head: c.clone().lerp(new THREE.Color('#ffe0c2'), 0.65), champ: c.clone().lerp(new THREE.Color('#ffd23a'), 0.45) }; });
    this.fx = new Puffs(scene);
    const domeG = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    this.domes = Array.from({ length: 6 }, () => { const d = new THREE.Mesh(domeG, new THREE.MeshBasicMaterial({ color: '#b79bff', transparent: true, opacity: 0.28, depthWrite: false })); d.visible = false; scene.add(d); return d; });
    this.tm = new THREE.Matrix4(); this.tq = new THREE.Quaternion(); this.tv = new THREE.Vector3(); this.ts = new THREE.Vector3(); this.te = new THREE.Euler();
  }

  // ---------- layout: camera framing and screen geometry for the HUD and the touch zones
  resize() {
    const w = this.root.clientWidth || innerWidth, h = this.root.clientHeight || innerHeight;
    this.renderer.setSize(w, h, false);
    this.cam.aspect = w / h;
    this.portrait = h > w * 1.05;
    const hud = this.$('ovs-hud');
    hud.classList.toggle('portrait', this.portrait); hud.classList.toggle('landscape', !this.portrait);
    hud.classList.toggle('flat', !!this.o.flat && this.portrait && !this.coop);
    hud.classList.toggle('compact', Math.min(w, h) < 520);
    this.frame();
    const s = (h * this.renderer.getPixelRatio()) / (2 * Math.tan((this.cam.fov * Math.PI) / 360));
    this.fx.uScale.value = s;
    // rails in screen space for the touch drag
    if (this.input) {
      const rail = this.cannons.slice(0, 2).map((c) => {
        const a = this.toScreen(c.x, c.z), b = this.toScreen(c.x + 1, c.z), dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
        return { x: dx / l, y: dy / l, px: l };
      });
      const fwd = this.cannons.slice(0, 2).map((c) => {
        const a = this.toScreen(c.x, c.z), b = this.toScreen(c.x, c.z + (c.side === 0 ? -1 : 1)), dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
        return { x: dx / l, y: dy / l };
      });
      this.input.setLayout({ split: this.portrait !== !!this.coop ? 'h' : 'v', swap: !!this.coop && !this.portrait, rail, fwd, px: (rail[0].px + rail[1].px) / 2 / 1.25 });
      this.showHelp();
    }
  }
  toScreen(x, z, y = 0) {
    const v = this.tv.set(x, y, z).project(this.cam), r = this.root.getBoundingClientRect();
    return { x: r.left + (v.x * 0.5 + 0.5) * r.width, y: r.top + (-v.y * 0.5 + 0.5) * r.height };
  }
  frame() {
    const cam = this.cam, W = this.W, L = this.L, coop = this.coop, portrait = this.portrait;
    // view direction and screen-up per layout
    let dir, up, target = new THREE.Vector3(0, 0, 0);
    if (coop && portrait) { const t = 0.95; dir = new THREE.Vector3(0, Math.cos(t), Math.sin(t)); up = new THREE.Vector3(0, 0, -1); target.set(0, 0, -1); } // behind the cannons
    else if (portrait) { const t = 0.42; dir = new THREE.Vector3(Math.sin(t), Math.cos(t), 0); up = new THREE.Vector3(0, 0, -1); } // P1 bottom, P2 top
    else { const t = 0.5; dir = new THREE.Vector3(Math.sin(t), Math.cos(t), 0); up = new THREE.Vector3(-1, 0, 0); } // P1 left, P2 right (co-op: both left, P1 above)
    cam.up.copy(up); cam.updateProjectionMatrix();
    // corners that must be in frame: the arena and the castles
    const pts = [];
    for (const x of [-W / 2 - 1.2, W / 2 + 1.2]) for (const z of [-L / 2 - 2.4, L / 2 + 2.4]) for (const y of [0, 3]) pts.push(new THREE.Vector3(x, y, z));
    const margin = coop && portrait ? [0.80, 0.84] : [0.86, 0.80]; // NDC x, y limits (room for the HUD)
    let lo = 10, hi = 400;
    for (let it = 0; it < 26; it++) {
      const d = (lo + hi) / 2;
      cam.position.copy(target).addScaledVector(dir, d); cam.lookAt(target); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
      let ok = true; for (const p of pts) { const v = p.clone().project(cam); if (Math.abs(v.x) > margin[0] || Math.abs(v.y) > margin[1] || v.z > 1) { ok = false; break; } }
      if (ok) hi = d; else lo = d;
    }
    cam.position.copy(target).addScaledVector(dir, hi); cam.lookAt(target); cam.updateMatrixWorld();
    this.camBase = cam.position.clone(); this.camTarget = target;
  }

  // ---------- rounds
  newRound() {
    this.round++;
    const f = this.f; f.alive.fill(0); this.free = []; for (let i = N - 1; i >= 0; i--) this.free.push(i);
    this.count = [0, 0]; this.sudden = false;
    this.stats = [this.blankStats(), this.blankStats(), this.blankStats()];
    const hpBase = this.lv.base?.hp || 160;
    for (const s of [0, 1]) {
      const B = this.bases[s];
      if (this.coop) B.max = s === 0 ? VS_COOP.hp[0] * (1 + 0.15 * (this.hc(0) + this.hc(1))) : VS_COOP.hp[1] * ({ facile: 0.8, normale: 1, difficile: 1.25 }[this.o.diff] || 1);
      else B.max = hpBase * (1 + 0.2 * this.hc(s));
      B.hp = B.max;
    }
    for (const c of this.cannons) { c.x = c.x0; c.cd = 0; c.charge = 0.15; c.champCd = 0; }
    for (const g of this.lv.gates) if (g.type === 'sub') { g.left = g.value; g.broken = false; }
    this.time = this.roundTime; this.countdown = 3; this.roundOver = 0; this.clock = 0;
    this.$('ovs-banner').className = 'ovs-banner';
    this.helpShown = this.round === 1 ? 6 : 0;
    this.showHelp();
    this.o.onRound?.({ round: this.round, wins: [...this.wins] });
    this.updateHud(0, true);
  }
  showHelp() {
    const el = this.$('ovs-help'); if (!el) return;
    if (this.helpShown > 0) {
      const touch = matchMedia?.('(pointer: coarse)').matches;
      el.innerHTML = touch
        ? '<div class="h1"><b>Giocatore 1</b>trascina per spostare il cannone · tieni premuto per sparare</div><div class="h2"><b>Giocatore 2</b>trascina per spostare il cannone · tieni premuto per sparare</div>'
        : [0, 1].map((p) => { const k = this.input?.describe(p) || {}; return `<div class="h${p + 1}"><b>${this.names[p]}</b><kbd>${k.left}</kbd><kbd>${k.right}</kbd> muovi · <kbd>${k.fire}</kbd> spara · <kbd>${k.champ}</kbd> campione</div>`; }).join('');
      el.classList.add('on');
    } else el.classList.remove('on');
  }
  endRound(winner, why) {
    if (this.roundOver) return;
    this.roundOver = 3.2;
    this.helpShown = 0; this.showHelp();
    const st = this.stats.map((s) => ({ ...s }));
    for (let p = 0; p < 3; p++) for (const k in st[p]) this.total[p][k] += st[p][k];
    const hp = this.bases.map((b) => Math.max(0, b.hp / b.max));
    this.results.push({ round: this.round, winner, why, hp, stats: st, time: this.roundTime - this.time });
    const ban = this.$('ovs-banner');
    if (this.coop) {
      this.finishMatch(winner === 0 ? 'win' : 'lose', why);
      ban.innerHTML = winner === 0 ? '<b>Fortezza espugnata!</b>' : `<b>${why === 'time' ? 'Tempo scaduto' : 'Base caduta'}</b>`;
      ban.className = 'ovs-banner on ' + (winner === 0 ? 'win' : 'lose');
      return;
    }
    if (winner >= 0) this.wins[winner]++;
    const whyT = { base: 'base distrutta', time: 'più punti base a fine tempo', sudden: 'morte improvvisa', draw: 'pareggio' }[why] || '';
    ban.style.setProperty('--wc', winner >= 0 ? this.pcol[winner] : '#fff');
    ban.innerHTML = winner >= 0 ? `<small>Round ${this.round}</small><b>${this.names[winner]} vince il round!</b><span>${whyT}</span>` : `<small>Round ${this.round}</small><b>Pareggio</b><span>si rigioca</span>`;
    ban.className = 'ovs-banner on';
    try { if (this.o.volume > 0) (winner >= 0 ? sfx.ok : sfx.bad)(); } catch {}
    const bw = winner >= 0 ? this.bases[1 - winner] : null;
    if (bw) for (let k = 0; k < 6; k++) this.fx.burst((this.rand() - 0.5) * this.W, 3, bw.z0, ['#ffd23a', '#ff6a3d', '#ffffff'][k % 3], 30, 8, 0.45, 1, this.rand);
    if (this.wins[0] >= this.needWins || this.wins[1] >= this.needWins || this.round >= (this.o.rounds || 3) + 2) this.matchDone = true; // draws replay the round, up to two extra
    this.updateHud(0, true);
  }
  finishMatch(outcome, why) {
    if (this.over) return;
    this.over = true;
    const res = {
      variant: this.o.variant, arena: this.lv.id, outcome, why, rounds: this.results, wins: [...this.wins],
      winner: this.coop ? (outcome === 'win' ? 0 : -1) : this.wins[0] === this.wins[1] ? -1 : this.wins[0] > this.wins[1] ? 0 : 1,
      names: this.names, colors: this.pcol, champions: [this.champOf(0), this.champOf(1)], handicap: [this.hc(0), this.hc(1)],
      stats: this.total.map((s) => ({ ...s })), time: this.results.reduce((a, r) => a + r.time, 0),
    };
    try { if (this.o.volume > 0) sfx.win(); } catch {}
    this.later = 1.4; this.result = res;
  }

  // ---------- simulation
  spawn(p, side, x, z, champ = -1, mask = 0) {
    if (!this.free.length || (champ < 0 && this.count[side] >= CAP)) return -1;
    const i = this.free.pop(), f = this.f;
    f.alive[i] = 1; f.side[i] = side; f.own[i] = p; f.ch[i] = champ; f.x[i] = clamp(x, -this.W / 2 + 0.4, this.W / 2 - 0.4); f.z[i] = z; f.vx[i] = 0; f.ph[i] = this.rand() * 6.28; f.mask[i] = mask;
    const C = champ >= 0 ? VS_CHAMPIONS[VS_CHAMP_IDS[champ]] : null;
    f.hp[i] = C ? C.hp : 1; f.aux[i] = C?.split || 0; f.t[i] = 0; f.sp[i] = SPEED * (C ? C.speed : 1) * (0.92 + this.rand() * 0.16); f.sc[i] = C ? C.scale : 1;
    this.count[side]++;
    const c = this.cols[p];
    this.bodies.setColorAt(i, C ? c.champ : c.body); this.heads.setColorAt(i, c.head);
    this.colorDirty = true;
    return i;
  }
  kill(i, by = -1) {
    const f = this.f; if (!f.alive[i]) return;
    f.alive[i] = 0; this.count[f.side[i]]--; this.free.push(i);
    const p = f.own[i], s = f.side[i];
    this.stats[p].lost++;
    if (by >= 0) this.stats[by].kills++;
    // the Matrioska opens up into a little crowd where she falls
    if (f.ch[i] >= 0 && f.aux[i] > 0) {
      const x = f.x[i], z = f.z[i], mask = f.mask[i], n = Math.min(80, Math.round(f.aux[i]));
      for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2, r = 0.6 + (k % 3) * 0.5; if (this.spawn(p, s, x + Math.cos(a) * r, z + Math.sin(a) * r, -1, mask) >= 0) this.stats[p].sent++; }
      this.fx.burst(x, 1.2, z, '#ff8a1f', 24, 6, 0.4, 0.6, this.rand);
    }
  }
  // champion powers: the Grillo's landing shockwave, the Testuggine's dome
  champTick(i, dt) {
    const f = this.f, C = VS_CHAMPIONS[VS_CHAMP_IDS[f.ch[i]]];
    if (C.slam) { f.t[i] += dt; if (f.t[i] >= 0.8) { f.t[i] -= 0.8; if (this.area(i, C.slam, 3)) this.shake = Math.max(this.shake || 0, 0.15); this.fx.burst(f.x[i], 0.3, f.z[i], '#21c7a8', 14, 5, 0.35, 0.4, this.rand); } }
    if (C.aura) this.area(i, C.aura, 99, 0.35);
  }
  area(i, R, dmg, cost = 0) {
    const f = this.f, s = f.side[i], p = f.own[i], x = f.x[i], z = f.z[i]; let hit = 0;
    for (let k = 0; k < N; k++) {
      if (!f.alive[k] || f.side[k] === s || (f.x[k] - x) ** 2 + (f.z[k] - z) ** 2 > R * R) continue;
      const take = Math.min(f.hp[k], dmg); f.hp[k] -= take; hit++;
      if (f.hp[k] <= 0.001) { this.kill(k, p); if (cost) this.fx.burst(f.x[k], 0.8, f.z[k], '#8b5cff', 3, 3, 0.3, 0.4, this.rand); }
      if (cost) { f.hp[i] -= cost * Math.max(1, take); if (f.hp[i] <= 0) { this.kill(i, f.own[k]); break; } }
    }
    return hit;
  }
  cannonFor(p) { return this.cannons.find((c) => c.p === p); }
  fire(c) {
    const p = c.p, dz = c.side === 0 ? -1 : 1, hc = p < 2 ? this.hc(p) : 0;
    const rate = p === 2 ? (VS_COOP.aiRate[this.o.diff] || 4.6) : 4.8 * (1 + 0.12 * hc);
    if (c.cd > 0) return;
    c.cd += 1 / rate;
    const i = this.spawn(p, c.side, c.x + (this.rand() - 0.5) * 0.6, c.z + dz * 2.2);
    if (i >= 0) { this.stats[p].sent++; c.kick = 1; this.sndFire(p); }
  }
  callChamp(c) {
    const p = c.p, C = VS_CHAMPIONS[this.champOf(p)];
    if (c.charge < 1) return false;
    c.charge = 0; this.stats[p].champs++;
    const dz = c.side === 0 ? -1 : 1, id = VS_CHAMP_IDS.indexOf(this.champOf(p));
    this.spawn(p, c.side, c.x, c.z + dz * 2.6, id);
    this.fx.burst(c.x, 1.5, c.z + dz * 2.6, '#ffd23a', 26, 6, 0.4, 0.7, this.rand);
    if (p < 2) { const b = this.$('ovs-ch' + p); b?.classList.remove('go'); void b?.offsetWidth; b?.classList.add('go'); }
    try { if (this.o.volume > 0) sfx.overtake(); } catch {}
    return true;
  }
  sndFire(p) {
    const t = this.clock; this._snd ||= [0, 0, 0];
    if (this.o.volume <= 0 || t - this._snd[p] < 0.22 || p === 2) return; this._snd[p] = t;
    try { sfx.tick(); } catch {}
  }

  // bots (AI fortress, attract mode and tests): slide toward a target, fire, call the champion
  botInput(c, dt) {
    c.aiT -= dt;
    if (c.aiT <= 0) {
      c.aiT = 1.4 + this.rand() * 1.8;
      // prefer the multiplying gates on our half, sometimes just aim where the enemy crowd is thin
      const mine = this.lv.gates.filter((g) => (g.side === c.side || g.z === 0) && g.type !== 'sub');
      const pick = mine.length && this.rand() < 0.75 ? mine[(this.rand() * mine.length) | 0] : null;
      c.aiX = pick ? pick.x : (this.rand() - 0.5) * (this.W - 4);
    }
    const dx = c.aiX - c.x;
    return { move: clamp(dx * 1.4, -1, 1), drag: 0, fire: true, champ: c.charge >= 1 && this.rand() < dt * 1.5 };
  }

  step(dt) {
    if (this.paused || this.over && !this.later) return;
    this.clock += dt;
    const f = this.f, W = this.W, L = this.L;
    this.input?.poll();
    const ins = [0, 1].map((p) => (this.o.bots?.[p] ? null : this.input?.state(p)) || null);
    this.input?.endFrame();
    if (this.later) { this.later -= dt; this.fx.update(dt); if (this.later <= 0) { this.later = 0; this.o.onEnd?.(this.result); } return; }
    if (this.helpShown > 0) { this.helpShown -= dt; if (this.helpShown <= 0 || ins.some((s) => s?.any)) { this.helpShown = 0; this.showHelp(); } }
    // round over: banner time, then next round or the end of the match
    if (this.roundOver) {
      this.roundOver -= dt; this.fx.update(dt); this.animate(dt);
      if (this.roundOver <= 0) { this.roundOver = 0; if (this.matchDone) this.finishMatch(this.wins[0] === this.wins[1] ? 'draw' : 'win', 'rounds'); else if (!this.coop) this.newRound(); }
      return;
    }
    if (this.countdown > 0) {
      const b = Math.ceil(this.countdown); this.countdown -= dt; const a = Math.ceil(this.countdown);
      const el = this.$('ovs-count');
      if (a !== b || !el.textContent) { el.textContent = a > 0 ? a : 'Via!'; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); try { if (this.o.volume > 0) (a > 0 ? sfx.beep : sfx.go)(); } catch {} }
      if (this.countdown <= 0) setTimeout(() => { if (el && this.countdown <= 0) el.textContent = ''; }, 700);
      // cannons can already be positioned
      for (const c of this.cannons) { const s = c.ai || this.o.bots?.[c.p] ? null : ins[c.p]; if (s) c.x = clamp(c.x + s.move * 15 * dt + s.drag, c.lo, c.hi); c.g.position.x = c.x; }
      this.animate(dt); this.updateHud(dt);
      return;
    }
    this.time -= dt;
    // gates slide
    for (const g of this.lv.gates) if (g.move) { const x = g.x0 + Math.sin(this.clock * g.move.speed + g.ph) * g.move.amp; g.x = clamp(x, -W / 2 + g.w / 2, W / 2 - g.w / 2); }
    // cannons
    for (const c of this.cannons) {
      const s = c.ai || this.o.bots?.[c.p] ? this.botInput(c, dt) : ins[c.p];
      c.cd = Math.max(0, c.cd - dt);
      const hc = c.p < 2 ? this.hc(c.p) : 0, C = VS_CHAMPIONS[this.champOf(c.p)];
      c.charge = Math.min(1, c.charge + dt / (C.charge / (1 + 0.15 * hc)) * (this.sudden ? 1.6 : 1));
      if (s) {
        c.x = clamp(c.x + s.move * 15 * dt + s.drag, c.lo, c.hi);
        if (s.fire) this.fire(c);
        if (s.champ || (c.p < 2 && this.champReq[c.p])) this.callChamp(c);
      }
      if (c.p < 2) this.champReq[c.p] = false;
    }
    // figures
    const enemyFront = [-(L / 2 - 0.4), L / 2 - 0.4]; // z where side s hits the enemy wall (side 0 marches to -z)
    const gates = this.lv.gates, obs = this.lv.obstacles;
    const grid = this.grid; grid.clear();
    for (let i = 0; i < N; i++) {
      if (!f.alive[i]) continue;
      const s = f.side[i], dz = s === 0 ? -1 : 1, z0 = f.z[i];
      f.ph[i] += dt * f.sp[i] * 2.2;
      // gentle wander + funnel toward the middle near the enemy wall + push back inside the field
      f.vx[i] = f.vx[i] * Math.exp(-3 * dt) + Math.sin(f.ph[i] * 0.37 + i) * 0.9 * dt;
      f.x[i] += f.vx[i] * dt * 6;
      f.z[i] += dz * f.sp[i] * dt;
      const z = f.z[i];
      if (f.x[i] < -W / 2 + 0.35) { f.x[i] = -W / 2 + 0.35; f.vx[i] = Math.abs(f.vx[i]); } else if (f.x[i] > W / 2 - 0.35) { f.x[i] = W / 2 - 0.35; f.vx[i] = -Math.abs(f.vx[i]); }
      for (const ob of obs) { const dx = f.x[i] - ob.x, dzz = z - ob.z, d = Math.hypot(dx, dzz), rr = ob.r + 0.3 * f.sc[i]; if (d < rr) { const k = rr / Math.max(0.001, d); f.x[i] = ob.x + dx * k; f.z[i] = ob.z + dzz * k; f.vx[i] += Math.sign(dx || 1) * 0.6; } }
      // gates: crossing the line inside the posts
      for (const g of gates) {
        if (((f.mask[i] >> g.i) & 1) || (g.side >= 0 && g.side !== s)) continue;
        if ((z0 - g.z) * (f.z[i] - g.z) > 0 && z0 !== g.z) continue;
        if (Math.abs(f.x[i] - g.x) > g.w / 2) continue;
        f.mask[i] |= 1 << g.i;
        const p = f.own[i];
        this.gateHit(g);
        if (g.type === 'sub') {
          if (g.broken) continue;
          if (f.ch[i] >= 0) { g.left = 0; } else { g.left -= 1; this.fx.burst(f.x[i], 0.6, f.z[i], '#ff4060', 4, 3, 0.25, 0.4, this.rand); this.kill(i); }
          if (g.left <= 0) { g.broken = true; this.fx.burst(g.x, 1.5, g.z, '#ff4060', 30, 6, 0.4, 0.6, this.rand); }
          if (!f.alive[i]) break; continue;
        }
        if (f.ch[i] >= 0) { // champions grow instead of cloning; the Matrioska gets more dolls inside
          const C = VS_CHAMPIONS[VS_CHAMP_IDS[f.ch[i]]];
          if (C.split) f.aux[i] += g.type === 'mul' ? f.aux[i] * (g.value - 1) : g.value; else f.hp[i] += g.type === 'mul' ? 4 * (g.value - 1) : 2;
          continue;
        }
        const extra = g.type === 'mul' ? (g.value - 1) * (this.sudden ? 2 : 1) : g.value;
        for (let k = 0; k < extra; k++) {
          const j = this.spawn(p, s, g.x + (this.rand() - 0.5) * (g.w - 0.8), f.z[i] - dz * (0.2 + this.rand() * 0.9), -1, f.mask[i]);
          if (j < 0) break; this.stats[p].sent++; this.stats[p].gates++;
        }
      }
      if (f.ch[i] >= 0) this.champTick(i, dt);
      if (!f.alive[i]) continue;
      // reached the enemy wall
      if ((s === 0 && f.z[i] <= enemyFront[0]) || (s === 1 && f.z[i] >= enemyFront[1])) {
        const C = f.ch[i] >= 0 ? VS_CHAMPIONS[VS_CHAMP_IDS[f.ch[i]]] : null;
        this.hitBase(1 - s, C ? C.dmg + Math.round(f.aux[i] * 0.5) : 1, f.own[i], f.x[i]);
        f.alive[i] = 0; this.count[s]--; this.free.push(i);
        continue;
      }
      // fill the collision grid with side 1 figures
      if (s === 1) { const key = ((Math.floor(f.x[i] / CELL) + 64) << 8) | (Math.floor(f.z[i] / CELL) + 128); let a = grid.get(key); if (!a) grid.set(key, (a = [])); a.push(i); }
    }
    // fights: every side 0 figure against side 1 figures in the neighbouring cells
    for (let i = 0; i < N; i++) {
      if (!f.alive[i] || f.side[i] !== 0) continue;
      const cx = Math.floor(f.x[i] / CELL) + 64, cz = Math.floor(f.z[i] / CELL) + 128, ri = R_HIT * (f.ch[i] >= 0 ? f.sc[i] * 0.75 : 1);
      for (let ax = -2; ax <= 2 && f.alive[i]; ax++) for (let az = -2; az <= 2 && f.alive[i]; az++) {
        const a = grid.get(((cx + ax) << 8) | (cz + az)); if (!a) continue;
        for (const j of a) {
          if (!f.alive[j]) continue;
          const rj = R_HIT * (f.ch[j] >= 0 ? f.sc[j] * 0.75 : 1), dx = f.x[i] - f.x[j], dz = f.z[i] - f.z[j];
          if (dx * dx + dz * dz > (ri + rj) * (ri + rj)) continue;
          this.clash(i, j);
          if (!f.alive[i]) break;
        }
      }
    }
    for (const s of [0, 1]) { const p = s; if (this.count[s] > this.stats[p].peak && !this.coop) this.stats[p].peak = this.count[s]; }
    // rules
    if (!this.roundOver) {
      if (this.coop) {
        if (this.bases[1].hp <= 0) this.endRound(0, 'base');
        else if (this.bases[0].hp <= 0) this.endRound(1, 'base');
        else if (this.time <= 0) this.endRound(1, 'time');
      } else {
        const dead = this.bases.map((b) => b.hp <= 0);
        if (dead[0] || dead[1]) this.endRound(dead[0] && dead[1] ? -1 : dead[1] ? 0 : 1, this.sudden ? 'sudden' : 'base');
        else if (this.time <= 0 && !this.sudden) {
          const a = this.bases[0].hp / this.bases[0].max, b = this.bases[1].hp / this.bases[1].max;
          if (Math.abs(a - b) > 0.02) this.endRound(a > b ? 0 : 1, 'time');
          else { this.sudden = true; this.time = SUDDEN; this.suddenHp = this.bases.map((x) => x.hp); this.banner('Morte improvvisa!', 'Il primo colpo alla base vince · porte raddoppiate'); try { if (this.o.volume > 0) sfx.notify(); } catch {} }
        } else if (this.sudden) {
          // first base to lose hit points in sudden death loses the round
          const l0 = this.bases[0].hp < this.suddenHp[0], l1 = this.bases[1].hp < this.suddenHp[1];
          if (l0 !== l1) this.endRound(l0 ? 1 : 0, 'sudden');
          else if (l0 && l1) { this.suddenHp = this.bases.map((x) => x.hp); }
          else if (this.time <= 0) this.endRound(-1, 'draw');
        }
      }
    }
    this.fx.update(dt);
    this.animate(dt);
    this.updateHud(dt);
  }
  clash(i, j) {
    const f = this.f, ci = f.ch[i] >= 0 ? VS_CHAMPIONS[VS_CHAMP_IDS[f.ch[i]]] : null, cj = f.ch[j] >= 0 ? VS_CHAMPIONS[VS_CHAMP_IDS[f.ch[j]]] : null;
    const x = (f.x[i] + f.x[j]) / 2, z = (f.z[i] + f.z[j]) / 2;
    const hi = f.hp[i], hj = f.hp[j], m = Math.min(hi, hj);
    f.hp[i] -= m; f.hp[j] -= m;
    const pi = f.own[i], pj = f.own[j];
    if (f.hp[i] <= 0.001) this.kill(i, pj);
    if (f.hp[j] <= 0.001) this.kill(j, pi);
    if (this.rand() < 0.5) this.fx.burst(x, 0.7, z, this.rand() < 0.5 ? this.cols[pi].body : this.cols[pj].body, 3, 3.5, 0.28, 0.45, this.rand);
  }
  gateHit(g) { const o = this.gateObjs[g.i]; if (o) o.flash = 0.25; }
  hitBase(s, dmg, p, x) {
    const B = this.bases[s]; if (!B || B.hp <= 0) return;
    B.hp = Math.max(0, B.hp - dmg); B.shake = Math.min(1, B.shake + 0.08 + dmg * 0.02);
    this.stats[p].dmg += dmg;
    this.fx.burst(x, 1.6, B.z0 + (s === 0 ? -1 : 1), dmg > 3 ? '#ffd23a' : this.cols[p].body, dmg > 3 ? 24 : 3, dmg > 3 ? 7 : 4, 0.32, 0.5, this.rand);
    if (dmg > 3) this.shake = Math.max(this.shake || 0, 0.35);
    const t = this.clock; this._hit ||= [0, 0];
    if (this.o.volume > 0 && t - this._hit[s] > 0.35) { this._hit[s] = t; try { sfx.click(); } catch {} }
  }
  banner(t, sub) {
    const el = this.$('ovs-banner'); el.style.setProperty('--wc', '#ffd23a');
    el.innerHTML = `<b>${t}</b>${sub ? `<span>${sub}</span>` : ''}`; el.className = 'ovs-banner on brief';
    clearTimeout(this._bt); this._bt = setTimeout(() => { if (el.classList.contains('brief')) el.className = 'ovs-banner'; }, 2200);
  }

  // ---------- visuals
  animate(dt) {
    const f = this.f, M = this.tm, Q = this.tq, V = this.tv, S = this.ts, E = this.te;
    let n = 0, nd = 0;
    // instanced meshes: draw slots 0..max alive index (count = highest used + 1; dead ones scaled to 0)
    let hiIdx = -1; for (let i = N - 1; i >= 0; i--) if (f.alive[i]) { hiIdx = i; break; }
    const zero = this.zeroM ||= new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i <= hiIdx; i++) {
      if (!f.alive[i]) { this.bodies.setMatrixAt(i, zero); this.heads.setMatrixAt(i, zero); continue; }
      const C = f.ch[i] >= 0 ? VS_CHAMPIONS[VS_CHAMP_IDS[f.ch[i]]] : null;
      if (C?.aura && nd < this.domes.length) { const d = this.domes[nd++]; d.visible = true; d.position.set(f.x[i], 0, f.z[i]); d.scale.setScalar(C.aura); }
      const sc = f.sc[i], bob = C?.slam ? Math.sin((f.t[i] / 0.8) * Math.PI) * 1.6 : Math.abs(Math.sin(f.ph[i])) * 0.16 * sc, dz = f.side[i] === 0 ? 0 : Math.PI;
      E.set(Math.sin(f.ph[i]) * 0.12 - 0.12, dz + f.vx[i] * 0.6, Math.sin(f.ph[i] * 2) * 0.05); Q.setFromEuler(E);
      M.compose(V.set(f.x[i], bob, f.z[i]), Q, S.set(sc, sc, sc));
      this.bodies.setMatrixAt(i, M); this.heads.setMatrixAt(i, M); n++;
    }
    for (let k = nd; k < this.domes.length; k++) this.domes[k].visible = false;
    this.bodies.count = this.heads.count = hiIdx + 1;
    this.bodies.instanceMatrix.needsUpdate = this.heads.instanceMatrix.needsUpdate = true;
    if (this.colorDirty) { this.bodies.instanceColor.needsUpdate = this.heads.instanceColor.needsUpdate = true; this.colorDirty = false; }
    // cannons
    for (const c of this.cannons) {
      c.g.position.x += (c.x - c.g.position.x) * Math.min(1, dt * 20);
      c.kick = Math.max(0, c.kick - dt * 8); c.barrel.position.z = c.kick * 0.25; c.barrel.scale.setScalar(1 + c.kick * 0.06);
    }
    for (const o of this.gateObjs) {
      if (o.gt.type === 'sub') { const t = gateText(o.gt); if (t !== o.txt) { o.txt = t; o.sp.material.map.dispose(); o.sp.material.map = labelTexture(t, o.gt.broken ? '#7a7f8c' : o.col); o.sp.material.needsUpdate = true; o.pane.visible = !o.gt.broken; } }
      o.g.position.x = o.gt.x; o.flash = Math.max(0, o.flash - dt); o.pane.material.opacity = 0.32 + o.flash * 1.6; }
    for (const B of this.bases) { B.shake = Math.max(0, B.shake - dt * 2.5); B.g.position.x = Math.sin(this.clock * 60) * B.shake * 0.15; B.flag.rotation.y = Math.sin(this.clock * 3 + B.z0) * 0.3; B.g.scale.y = B.hp <= 0 ? Math.max(0.35, B.g.scale.y - dt) : 1; }
    // camera shake
    this.shake = Math.max(0, (this.shake || 0) - dt * 1.6);
    if (this.camBase) { this.cam.position.copy(this.camBase); if (this.shake > 0) this.cam.position.add(this.tv.set((this.rand() - 0.5) * this.shake, 0, (this.rand() - 0.5) * this.shake)); }
    return n;
  }
  drawTouch(p, T) {
    const el = this.$('ovs-t' + p); if (!el) return;
    if (!T) { el.classList.remove('on'); return; }
    const r = this.root.getBoundingClientRect(), pr = el.parentElement.getBoundingClientRect();
    void r; el.classList.add('on'); el.style.left = `${T.x - pr.left}px`; el.style.top = `${T.y - pr.top}px`;
  }
  updateHud(dt, force) {
    this._hudT = (this._hudT || 0) - dt; if (this._hudT > 0 && !force) return; this._hudT = 0.08;
    for (const p of [0, 1]) {
      const c = this.cannonFor(p), n = this.coop ? this.countOwn(p) : this.count[p];
      this.$('ovs-n' + p).textContent = n;
      const btn = this.$('ovs-ch' + p); btn.style.setProperty('--k', c.charge.toFixed(3)); btn.classList.toggle('ready', c.charge >= 1);
      if (!this.coop) {
        const B = this.bases[p], k = Math.max(0, B.hp / B.max);
        this.$('ovs-hp' + p).style.width = `${k * 100}%`; this.$('ovs-hp' + p).classList.toggle('low', k < 0.3);
        this.$('ovs-hpn' + p).textContent = `Base ${Math.ceil(B.hp)}`;
        const pips = this.$('ovs-pips' + p); const want = Array.from({ length: this.needWins }, (_, i) => `<i class="${i < this.wins[p] ? 'on' : ''}"></i>`).join('');
        if (pips.innerHTML !== want) pips.innerHTML = want;
      }
    }
    if (this.coop) { this.$('ovs-hp2').style.width = `${Math.max(0, this.bases[1].hp / this.bases[1].max) * 100}%`; this.$('ovs-hp0').style.width = `${Math.max(0, this.bases[0].hp / this.bases[0].max) * 100}%`; }
    const tm = this.$('ovs-timer'); tm.textContent = this.sudden ? `⚡ ${fmtT(this.time)}` : fmtT(this.time); tm.classList.toggle('hot', this.time < 10 || this.sudden);
    this.$('ovs-round').textContent = this.coop ? 'Cooperativa' : this.sudden ? 'Morte improvvisa' : `Round ${this.round}`;
  }
  countOwn(p) { let n = 0; const f = this.f; for (let i = 0; i < N; i++) if (f.alive[i] && f.own[i] === p) n++; return n; }

  togglePause(force) {
    if (this.over) return;
    this.paused = force ?? !this.paused;
    this.input?.clear();
    this.o.onPause?.(this.paused);
  }
  loop(now) {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.max(0, Math.min(0.1, (now - this.last) / 1000)); this.last = now;
    if (this.paused && !this.over) this.input?.poll(); // the pad's Start resumes
    if (!this.paused && !this.manual) { this.acc += dt; let k = 0; while (this.acc >= 1 / 60 && k < 6) { this.step(1 / 60); this.acc -= 1 / 60; k++; } if (k >= 6) this.acc = 0; }
    this.renderer.render(this.scene, this.cam);
    if (!this.paused) this.guard?.tick();
  }
  // tests / tools
  debugInfo() {
    return { round: this.round, wins: [...this.wins], time: +this.time.toFixed(2), countdown: +this.countdown.toFixed(2), sudden: this.sudden, count: [...this.count], hp: this.bases.map((b) => Math.round(b.hp)), cannons: this.cannons.map((c) => ({ p: c.p, x: +c.x.toFixed(2), charge: +c.charge.toFixed(2) })), over: this.over, portrait: this.portrait, stats: this.stats };
  }
  destroy() {
    cancelAnimationFrame(this.raf);
    clearTimeout(this._bt);
    this.input?.destroy();
    document.removeEventListener('visibilitychange', this.onVis);
    this.ro?.disconnect();
    this.scene?.traverse((o) => { o.geometry?.dispose?.(); const m = o.material; (Array.isArray(m) ? m : m ? [m] : []).forEach((x) => { x.map?.dispose?.(); x.dispose?.(); }); });
    this.renderer?.dispose(); this.renderer?.forceContextLoss?.();
    this.root.innerHTML = '';
  }
}
