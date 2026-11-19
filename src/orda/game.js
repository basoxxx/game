// Orda — crowd-cannon tower assault. A blue cannon at the bottom of a lane fires a stream of little
// figures; gates multiply them, obstacles thin them out, red crowds come the other way and cancel
// out 1:1, and the red fortress at the top falls when its hit points reach zero.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// API (stable: other modules build on it)
//   const g = new OrdaGame(root, opts); await g.start(); … g.togglePause(); g.destroy();
//   g.step(dt)  advances the game by dt seconds with fixed sub-steps (deterministic for a given seed
//               and input) and updates the visuals; the browser loop calls it every frame, tests call
//               it directly (window.__orda.step) because headless WebGL crawls.
//   opts = {
//     level:     level JSON (shape documented in levels.js; generated levels work the same way)
//     mode:      'level' | 'endless' | 'daily' | 'raid' | 'versus'  (only labels/flow differ here)
//     seed, players: 1 | 2, upgrades: { rate, shot, hp, speed, charge, armor } (levels),
//     skin, cannon (cosmetic ids from meta.js), champion: id, champLvl, prevStars,
//     tier: 'high'|'med'|'low', volume, autofire, shake, numbers,
//     onEnd(result), onPause(on),
//     hooks: { onWave(sim, phase), onBaseHit(sim, dmg), onEnd(sim), onFrame(game, dt), onEvent(game, ev) }
//   }
//   result = { win, why, stars, coins, figuresSent, timeMs, kills, champions, mode, levelId, left,
//              towers, baseDmg, cannonHp, cannonMax, bricks: 0 }
//   g.sim is the live Sim (sim.js): crowds, gates, obstacles, base, champions, stats, input.
//
// EXTENSION POINTS (for later work)
//   · Base building & raids: a raid target is just a level whose `base` (hp, spawners, towers,
//     phases) and `obstacles` come from the player's/opponent's layout. Build it with the level shape
//     and pass mode 'raid'; `result.bricks` is reserved for the loot (fill it in hooks.onEnd).
//     buildBase() below draws `base.w` / `boss` / towers from data, so custom layouts render as is.
//   · Local 2-player split: opts.players = 2. The Sim keeps one cannon; a versus module can run two
//     Sims (one per half of the screen) or extend Sim.input to an array: moveCannon()/fire() are the
//     only places that read input. The renderer's camera fit (fitCamera) takes any viewport rect.
//   · Daily challenge & endless: generate level JSON (seeded) and pass it with mode 'daily' or
//     'endless'. For endless, hooks.onEnd can chain the next generated level; hooks.onWave/onBaseHit
//     allow score keeping without touching the game. opts.seed makes runs reproducible.
//   · New gate kinds / obstacles: gateApply() and Sim.obstacle() in sim.js, buildGate()/buildObstacle()
//     here. New champions: CHAMPIONS in meta.js, Sim.moveChamps() and champMesh() here.
// ─────────────────────────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { pixelRatio } from '../ui/quality.js';
import { FrameGuard } from '../ui/perfguard.js';
import { osfx } from '../ui/audio.js';
import { Sim, CANNON_Z, BASE_DEPTH, unitScale, gateLabel, gateGood, autopilot } from './sim.js';
import { WORLDS, SKINS, CANNONS, champById, starsFor, coinsFor } from './meta.js';

const STEP = 1 / 60;
const FIG = 1.3; // drawn size of a figure vs its collision size: chunkier reads better from afar
const CAPS = { high: 1600, med: 900, low: 450 };
const TC = new THREE.Color(), TC2 = new THREE.Color();
const RED = new THREE.Color('#ff3b4e'), RED_D = new THREE.Color('#c8102e');
const fmtT = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const CHAMP_ICON = { colosso: '💪', grillo: '🦗', matrioska: '🪆', testuggine: '🛡️' };

// ---------- the little figure: a squishy bean with eyes and two stubby legs, one geometry, animated
// in the vertex shader (run cycle from a per-instance phase), coloured per instance
function figureGeometry() {
  const parts = [];
  const tag = (g, part, col) => {
    g = g.index ? g.toNonIndexed() : g;
    const n = g.attributes.position.count;
    g.setAttribute('aPart', new THREE.Float32BufferAttribute(new Float32Array(n).fill(part), 1));
    const c = new Float32Array(n * 3); for (let i = 0; i < n; i++) { c[i * 3] = col[0]; c[i * 3 + 1] = col[1]; c[i * 3 + 2] = col[2]; }
    g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
    if (g.attributes.uv) g.deleteAttribute('uv');
    parts.push(g);
  };
  const body = new THREE.CapsuleGeometry(0.27, 0.3, 4, 10); body.translate(0, 0.56, 0); tag(body, 0, [1, 1, 1]);
  for (const s of [-1, 1]) {
    const eye = new THREE.SphereGeometry(0.085, 8, 6); eye.scale(1, 1.15, 0.6); eye.translate(s * 0.1, 0.72, 0.235); tag(eye, 1, [1, 1, 1]);
    const pup = new THREE.SphereGeometry(0.045, 6, 5); pup.translate(s * 0.1, 0.71, 0.282); tag(pup, 2, [0.05, 0.06, 0.1]);
    const leg = new THREE.CapsuleGeometry(0.075, 0.14, 2, 6); leg.translate(s * 0.12, 0.17, 0); tag(leg, s < 0 ? 3 : 4, [0.82, 0.82, 0.86]);
    const arm = new THREE.CapsuleGeometry(0.06, 0.12, 2, 5); arm.rotateZ(s * 0.5); arm.translate(s * 0.3, 0.5, 0); tag(arm, s < 0 ? 5 : 6, [1, 1, 1]);
  }
  return mergeGeometries(parts);
}
function figureMaterial(uTime) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aPart; attribute float aPh; attribute float aRun; uniform float uTime;')
      .replace('#include <color_vertex>', `vColor = color;
#ifdef USE_INSTANCING_COLOR
  if (aPart < 0.5 || aPart > 4.5) vColor *= instanceColor.xyz; else if (aPart > 2.5) vColor *= mix(instanceColor.xyz, vec3(1.0), 0.25) * 0.8;
#endif`)
      .replace('#include <begin_vertex>', `vec3 transformed = vec3(position);
{ float tt = uTime * 13.0 + aPh * 6.2831; float run = aRun;
  if (aPart > 2.5 && aPart < 4.5) { float side = aPart > 3.5 ? 1.0 : -1.0; float sw = sin(tt) * side * 0.75 * run; float y = transformed.y - 0.27;
    transformed = vec3(transformed.x, 0.27 + y * cos(sw) - transformed.z * sin(sw), y * sin(sw) + transformed.z * cos(sw)); }
  else { float b = abs(sin(tt)) * 0.1 * run; transformed.y += b; float sq = sin(tt * 2.0) * 0.07 * run; transformed.y *= 1.0 + sq; transformed.xz *= 1.0 - sq * 0.5;
    if (aPart > 4.5) { float side = aPart > 5.5 ? 1.0 : -1.0; transformed.z += sin(tt) * side * 0.12 * run; transformed.y += (1.0 - run) * 0.22 * abs(sin(uTime * 9.0 + aPh * 4.0)); } }
}`);
  };
  m.customProgramCacheKey = () => 'orda-fig';
  return m;
}

class Crowd {
  constructor(scene, geo, mat, cap, castShadow) {
    this.cap = cap;
    const g = geo.clone();
    this.aPh = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1).setUsage(THREE.DynamicDrawUsage);
    this.aRun = new THREE.InstancedBufferAttribute(new Float32Array(cap).fill(1), 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aPh', this.aPh); g.setAttribute('aRun', this.aRun);
    const m = this.mesh = new THREE.InstancedMesh(g, mat, cap);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false; m.castShadow = castShadow; m.count = 0;
    scene.add(m);
    this.M = m.instanceMatrix.array; this.C = m.instanceColor.array;
  }
  // write one instance: position, facing (rotY), uniform scale, colour, phase, running
  set(k, x, y, z, rot, s, r, g, b, ph, run) {
    const M = this.M, o = k * 16, c = Math.cos(rot) * s, sn = Math.sin(rot) * s;
    M[o] = c; M[o + 1] = 0; M[o + 2] = -sn; M[o + 3] = 0; M[o + 4] = 0; M[o + 5] = s; M[o + 6] = 0; M[o + 7] = 0;
    M[o + 8] = sn; M[o + 9] = 0; M[o + 10] = c; M[o + 11] = 0; M[o + 12] = x; M[o + 13] = y; M[o + 14] = z; M[o + 15] = 1;
    const C = this.C, j = k * 3; C[j] = r; C[j + 1] = g; C[j + 2] = b;
    this.aPh.array[k] = ph; this.aRun.array[k] = run;
  }
  commit(n) { const m = this.mesh; m.count = n; m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; this.aPh.needsUpdate = true; this.aRun.needsUpdate = true; }
}

// ---------- particles: one pool of soft round points, CPU simulated
class Particles {
  constructor(scene, n) {
    this.n = n; this.i = 0;
    this.pos = new Float32Array(n * 3).fill(-999); this.vel = new Float32Array(n * 3); this.col = new Float32Array(n * 3);
    this.size = new Float32Array(n); this.alpha = new Float32Array(n); this.life = new Float32Array(n); this.max = new Float32Array(n); this.grav = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.uScale = { value: 400 };
    const m = new THREE.ShaderMaterial({
      uniforms: { uScale: this.uScale },
      vertexShader: 'attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA; uniform float uScale; void main(){ vC = color; vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = alpha > 0.0 ? clamp(size * uScale / max(1.0, -mv.z), 1.0, 64.0) : 0.0; }',
      fragmentShader: 'varying vec3 vC; varying float vA; void main(){ vec2 d = gl_PointCoord - 0.5; float r = dot(d, d) * 4.0; if (r > 1.0) discard; gl_FragColor = vec4(vC * (1.15 - r * 0.3), vA * (1.0 - r * r)); }',
      transparent: true, depthWrite: false,
    });
    this.pts = new THREE.Points(g, m); this.pts.frustumCulled = false; this.pts.renderOrder = 5; scene.add(this.pts);
  }
  emit(x, y, z, vx, vy, vz, c, size, life, grav = 12) {
    const i = this.i = (this.i + 1) % this.n, j = i * 3;
    this.pos[j] = x; this.pos[j + 1] = y; this.pos[j + 2] = z; this.vel[j] = vx; this.vel[j + 1] = vy; this.vel[j + 2] = vz;
    this.col[j] = c.r; this.col[j + 1] = c.g; this.col[j + 2] = c.b; this.size[i] = size; this.life[i] = this.max[i] = life; this.grav[i] = grav; this.alpha[i] = 1;
    this.dirty = true;
  }
  update(dt) {
    if (!this.dirty) return;
    let any = false;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt; const j = i * 3;
      if (this.life[i] <= 0) { this.alpha[i] = 0; this.pos[j + 1] = -999; continue; }
      any = true;
      const d = Math.exp(-1.6 * dt);
      this.vel[j] *= d; this.vel[j + 2] *= d; this.vel[j + 1] = this.vel[j + 1] * d - this.grav[i] * dt;
      this.pos[j] += this.vel[j] * dt; this.pos[j + 1] += this.vel[j + 1] * dt; this.pos[j + 2] += this.vel[j + 2] * dt;
      if (this.pos[j + 1] < 0.05 && this.grav[i] > 0) { this.pos[j + 1] = 0.05; this.vel[j + 1] *= -0.35; this.vel[j] *= 0.6; this.vel[j + 2] *= 0.6; }
      this.alpha[i] = Math.min(1, (this.life[i] / this.max[i]) * 2.2);
    }
    const a = this.pts.geometry.attributes;
    a.position.needsUpdate = a.alpha.needsUpdate = a.color.needsUpdate = a.size.needsUpdate = true;
    this.dirty = any;
  }
}

// gate panel art: a big glowing number on a candy-coloured board
function drawGate(cv, g) {
  const c = cv.getContext('2d'), W = cv.width, H = cv.height;
  const good = gateGood(g.type);
  c.clearRect(0, 0, W, H);
  const gr = c.createLinearGradient(0, 0, 0, H);
  if (good) { gr.addColorStop(0, 'rgba(90,200,255,.85)'); gr.addColorStop(1, 'rgba(40,110,255,.55)'); } else { gr.addColorStop(0, 'rgba(255,110,120,.85)'); gr.addColorStop(1, 'rgba(220,30,60,.55)'); }
  c.fillStyle = gr; c.beginPath(); c.roundRect(6, 6, W - 12, H - 12, 26); c.fill();
  c.lineWidth = 8; c.strokeStyle = 'rgba(255,255,255,.9)'; c.stroke();
  c.font = `900 ${Math.round(H * 0.62)}px "Exo 2", system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
  const txt = gateLabel(g.type, g.value, g);
  c.lineWidth = 14; c.strokeStyle = good ? '#0b3a8f' : '#7a0618'; c.strokeText(txt, W / 2, H * 0.55);
  c.shadowColor = good ? '#bff4ff' : '#ffd0d6'; c.shadowBlur = 24; c.fillStyle = '#fff'; c.fillText(txt, W / 2, H * 0.55); c.shadowBlur = 0;
  if (g.toggle) { // the swap countdown: a small pie in the corner
    const f = Math.max(0, Math.min(1, g.tt / (g.toggle.every || 3)));
    c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.arc(W - 40, 40, 24, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ffe066'; c.beginPath(); c.moveTo(W - 40, 40); c.arc(W - 40, 40, 22, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2); c.closePath(); c.fill();
  }
}
function stripes(a, b, n = 8, w = 128, h = 32) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const c = cv.getContext('2d');
  for (let i = -1; i < n + 1; i++) { c.fillStyle = i % 2 ? a : b; c.beginPath(); const x = (i * w) / n; c.moveTo(x, h); c.lineTo(x + w / n, h); c.lineTo(x + (2 * w) / n, 0); c.lineTo(x + w / n, 0); c.fill(); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class OrdaGame {
  constructor(root, opts = {}) {
    this.root = root;
    this.o = { mode: 'level', players: 1, upgrades: {}, skin: 'azzurro', cannon: 'classico', champion: 'colosso', champLvl: 0, tier: 'high', volume: 0.5, autofire: false, shake: true, numbers: true, prevStars: 0, hooks: {}, ...opts };
    this.level = this.o.level;
    if (!this.level) throw new Error('OrdaGame: opts.level mancante');
    this.world = WORLDS[this.level.world || 0] || WORLDS[0];
    this.paused = false; this.over = false; this.acc = 0; this.freeze = 0; this.shakeT = 0; this.clock = 0;
    this.keys = new Set(); this.ptr = null; this.firing = false; this.auto = false;
    this.popAgg = new Map(); this.sfxT = {};
    this.uTime = { value: 0 };
  }

  async start() {
    const o = this.o, root = this.root, L = this.level;
    const tier = this.tier = o.tier || 'high';
    const cap = Math.round(CAPS[tier] || 900);
    this.sim = new Sim(L, { up: o.upgrades, champ: o.champion, champLvl: o.champLvl, seed: o.seed, cap, autofire: o.autofire, hooks: { onWave: o.hooks?.onWave, onBaseHit: o.hooks?.onBaseHit } });
    const C = champById(o.champion);
    root.innerHTML = `<canvas class="or-cv"></canvas><div class="or-hud">
      <div class="or-top">
        <button class="or-pausebtn" id="or-pausebtn" aria-label="Pausa">II</button>
        <div class="or-boss"><div class="or-boss-n"><span id="or-bname">${L.base?.boss ? '👑 ' : ''}${L.base?.name || 'Base rossa'}</span><b id="or-bhp"></b></div><div class="or-bar"><i id="or-bbar"></i><em id="or-bshield"></em></div></div>
        <div class="or-timer" id="or-timer">0:00</div>
      </div>
      <div class="or-goals" id="or-goals"><span id="or-g1">⏱ ${L.stars?.par ?? 60}s</span><span id="or-g2">👥 ${L.stars?.crowd ?? 30}</span><span class="or-lv">${o.label || (o.mode === 'level' ? `Livello ${L.id}` : ({ raid: 'Razzia', endless: 'Infinita', daily: 'Sfida del giorno', versus: '2 giocatori' })[o.mode] || o.mode)} · ${L.name || ''}</span></div>
      <div class="or-crowd" id="or-crowd"><b id="or-cn">0</b><span>in campo</span></div>
      <div class="or-can" id="or-can"><span>Cannone</span><div class="or-bar or-bar-s"><i id="or-cbar"></i></div></div>
      <button class="or-champ" id="or-champ" aria-label="Lancia il campione" style="--c:${C.color}"><i id="or-ring"></i><span class="or-champ-ic">${CHAMP_ICON[C.id] || '★'}</span><b>${C.name}</b><small id="or-champ-t">Carica…</small></button>
      <div class="or-pops" id="or-pops"></div>
      <div class="or-banner" id="or-banner"></div>
      <div class="or-count" id="or-count"></div>
      <div class="or-hurt" id="or-hurt"></div>
      ${L.tip ? `<div class="or-tip" id="or-tip">${L.tip}</div>` : ''}
      <div class="or-help" id="or-help">Tieni premuto e trascina · <span class="kbd">←</span><span class="kbd">→</span> + <span class="kbd">Spazio</span> · <span class="kbd">E</span> campione</div>
    </div>`;
    this.cv = root.querySelector('.or-cv');
    this.$ = (id) => root.querySelector('#' + id);
    const r = this.renderer = new THREE.WebGLRenderer({ canvas: this.cv, antialias: tier !== 'low', powerPreference: 'high-performance' });
    r.setPixelRatio(pixelRatio(1.75));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.1;
    r.shadowMap.enabled = tier === 'high'; r.shadowMap.type = THREE.PCFSoftShadowMap;
    const setPR = (pr) => { if (Math.abs(r.getPixelRatio() - pr) < 0.01) return false; r.setPixelRatio(pr); this.resize(); };
    // frame-time watchdog: resolution first, then shadows, then fewer bodies (the maths is unchanged)
    this.guard = new FrameGuard([
      { fps: 45, run: () => setPR(Math.min(r.getPixelRatio(), 1)) },
      { fps: 38, run: () => { if (!r.shadowMap.enabled) return false; r.shadowMap.enabled = false; this.scene.traverse((x) => { if (x.material) x.material.needsUpdate = true; }); } },
      { fps: 32, run: () => { const c = Math.round(this.sim.blue.cap * 0.6); if (c < 300) return false; this.sim.blue.cap = c; this.sim.red.cap = Math.max(200, Math.round(this.sim.red.cap * 0.6)); } },
      { fps: 26, run: () => setPR(0.75) },
    ]);
    this.buildScene();
    this.bindInput();
    this.resize();
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(root);
    this.syncHud(true);
    this.last = performance.now();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
    document.activeElement?.blur?.();
    setTimeout(() => this.$('or-tip')?.classList.add('off'), 7000);
    setTimeout(() => this.$('or-help')?.classList.add('off'), 9000);
  }

  // ---------- scene
  buildScene() {
    const W = this.sim.W, L = this.sim.L, wd = this.world, tier = this.tier;
    const scene = this.scene = new THREE.Scene();
    // sky: vertical gradient
    const sk = document.createElement('canvas'); sk.width = 4; sk.height = 256; const sg = sk.getContext('2d'); const gr = sg.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, wd.sky); gr.addColorStop(0.7, wd.fog); gr.addColorStop(1, wd.fog); sg.fillStyle = gr; sg.fillRect(0, 0, 4, 256);
    const skyT = new THREE.CanvasTexture(sk); skyT.colorSpace = THREE.SRGBColorSpace; scene.background = skyT;
    scene.fog = new THREE.Fog(wd.fog, 90, 220);
    this.cam = new THREE.PerspectiveCamera(42, 1, 0.5, 400);
    scene.add(new THREE.HemisphereLight('#ffffff', wd.ground2, 1.25));
    const sun = this.sun = new THREE.DirectionalLight('#fff6e0', 1.7);
    sun.position.set(-18, 40, -6); sun.target.position.set(0, 0, L * 0.5); scene.add(sun, sun.target);
    if (tier === 'high') {
      sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
      const sc = sun.shadow.camera; sc.left = -W; sc.right = W; sc.top = L * 0.62; sc.bottom = -L * 0.62; sc.near = 5; sc.far = 120; sun.shadow.bias = -0.0008;
    }
    // ground around the arena, the arena floor (painted lanes), side rails
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ color: wd.ground2 }));
    outer.rotation.x = -Math.PI / 2; outer.position.set(0, -0.02, L / 2); outer.receiveShadow = true; scene.add(outer);
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 1024; const c = cv.getContext('2d');
    c.fillStyle = wd.ground; c.fillRect(0, 0, 256, 1024);
    for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.035)'; c.fillRect(i * 32, 0, 32, 1024); }
    c.globalAlpha = 0.5; c.fillStyle = wd.lane; for (let z = 0; z < 1024; z += 64) c.fillRect(126, z, 4, 34); c.globalAlpha = 1;
    for (let i = 0; i < 140; i++) { c.fillStyle = `rgba(255,255,255,${0.05 + Math.random() * 0.06})`; c.beginPath(); c.arc(Math.random() * 256, Math.random() * 1024, 1 + Math.random() * 3, 0, 7); c.fill(); }
    const ft = new THREE.CanvasTexture(cv); ft.colorSpace = THREE.SRGBColorSpace; ft.anisotropy = 4;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, L + BASE_DEPTH + 4), new THREE.MeshLambertMaterial({ map: ft }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, (L + BASE_DEPTH) / 2); floor.receiveShadow = true; scene.add(floor);
    const railM = new THREE.MeshLambertMaterial({ color: wd.rim });
    for (const s of [-1, 1]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, L + BASE_DEPTH + 4), railM); rail.position.set(s * (W / 2 + 0.25), 0.3, (L + BASE_DEPTH) / 2); rail.castShadow = rail.receiveShadow = true; scene.add(rail); }
    this.buildScenery();
    this.buildGates();
    this.buildObstacles();
    this.buildBase();
    this.buildCannon();
    // crowds and flyers
    const geo = this.figGeo = figureGeometry(); const mat = this.figMat = figureMaterial(this.uTime);
    this.blueC = new Crowd(scene, geo, mat, this.sim.blue.cap, tier === 'high');
    this.redC = new Crowd(scene, geo, mat, this.sim.red.cap, tier === 'high');
    this.flyC = new Crowd(scene, geo, mat, 160, false);
    this.flyers = [];
    const sk2 = SKINS.find((s) => s.id === this.o.skin) || SKINS[0];
    this.skin = sk2; this.blueCol = new THREE.Color(sk2.color);
    this.fx = new Particles(scene, tier === 'low' ? 700 : 1600);
    this.champMeshes = new Map();
  }
  buildScenery() {
    const W = this.sim.W, L = this.sim.L, wd = this.world, scene = this.scene;
    let seed = 7 + (this.level.id || 1) * 13; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    // trees / props on both sides: instanced cones + spheres, coloured by world
    const n = this.tier === 'low' ? 40 : 90;
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.35, 1.6, 6), new THREE.MeshLambertMaterial({ color: '#8a5a3c' }), n);
    const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.4, 0), new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true }), n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    const cols = [wd.deco[0], wd.deco[1], wd.ground2, '#5fbf4f'];
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? 1 : -1, x = side * (W / 2 + 3 + rnd() * 26), z = -10 + rnd() * (L + 40), k = 0.7 + rnd() * 1.1;
      m.compose(p.set(x, 0.8 * k, z), q.identity(), s.set(k, k, k)); trunk.setMatrixAt(i, m);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6); m.compose(p.set(x, (2.2 + rnd() * 0.6) * k, z), q, s.set(k, k * (0.9 + rnd() * 0.5), k)); crown.setMatrixAt(i, m);
      crown.setColorAt(i, TC.set(cols[(rnd() * cols.length) | 0]));
    }
    trunk.castShadow = crown.castShadow = this.tier === 'high';
    scene.add(trunk, crown);
    // soft clouds
    const cl = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, fog: false }), 30);
    for (let i = 0; i < 30; i++) { const cx = (rnd() - 0.5) * 160, cz = L + 30 + rnd() * 70, cy = 22 + rnd() * 18, k = 3 + rnd() * 5; m.compose(p.set(cx + (i % 3) * k * 0.9, cy, cz), q.identity(), s.set(k * 1.3, k * 0.7, k)); cl.setMatrixAt(i, m); }
    scene.add(cl);
    // start pad behind the cannon
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.6, 0.2, 28), new THREE.MeshLambertMaterial({ color: '#ffffff' })); pad.position.set(0, 0.06, CANNON_Z - 0.4); pad.receiveShadow = true; scene.add(pad);
  }
  buildGates() {
    this.gateObjs = this.sim.gates.map((g) => {
      const grp = new THREE.Group();
      const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
      drawGate(cv, g);
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false }));
      panel.scale.set(g.w, g.w * 0.5, 1); panel.position.y = 1.15 + g.w * 0.25; panel.rotation.set(0.22, Math.PI, 0, 'YXZ'); panel.renderOrder = 4;
      const postM = new THREE.MeshLambertMaterial({ color: '#ffffff' });
      const posts = [-1, 1].map((s) => { const pst = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 1.3 + g.w * 0.5, 10), postM); pst.position.set(s * g.w / 2, (1.3 + g.w * 0.5) / 2, 0); pst.castShadow = true; return pst; });
      // a glowing strip on the ground where the gate counts
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(g.w, 0.5), new THREE.MeshBasicMaterial({ color: gateGood(g.type) ? '#5ad1ff' : '#ff5a6e', transparent: true, opacity: 0.55, depthWrite: false }));
      strip.rotation.x = -Math.PI / 2; strip.position.y = 0.03;
      grp.add(panel, ...posts, strip); grp.position.set(g.cx, 0, g.z);
      this.scene.add(grp);
      return { g, grp, panel, cv, tex, strip, posts, label: '', pulse: 0 };
    });
  }
  buildObstacles() {
    const wd = this.world;
    this.obsObjs = this.sim.obs.map((ob) => {
      let mesh;
      if (ob.type === 'wall') {
        mesh = new THREE.Mesh(new THREE.BoxGeometry(ob.w, 1.6, ob.d), new THREE.MeshLambertMaterial({ color: wd.rim })); mesh.position.set(ob.x, 0.8, ob.z);
        const cap = new THREE.Mesh(new THREE.BoxGeometry(ob.w + 0.15, 0.2, ob.d + 0.15), new THREE.MeshLambertMaterial({ color: '#ffffff' })); cap.position.y = 0.85; mesh.add(cap);
      } else if (ob.type === 'barrier') {
        mesh = new THREE.Mesh(new THREE.BoxGeometry(ob.w, 1.1, ob.d), new THREE.MeshLambertMaterial({ map: stripes('#ffd23f', '#2a2a33') })); mesh.position.set(ob.x, 0.55, ob.z);
      } else if (ob.type === 'pit') {
        mesh = new THREE.Group(); mesh.position.set(ob.x, 0, ob.z);
        const hole = new THREE.Mesh(new THREE.PlaneGeometry(ob.w, ob.d), new THREE.MeshBasicMaterial({ color: this.level.world === 5 ? '#ff5a1f' : '#1a1020' })); hole.rotation.x = -Math.PI / 2; hole.position.y = 0.025; mesh.add(hole);
        const rimM = new THREE.MeshLambertMaterial({ color: wd.rim });
        for (const [w, d, x, z] of [[ob.w + 0.4, 0.2, 0, -ob.d / 2], [ob.w + 0.4, 0.2, 0, ob.d / 2], [0.2, ob.d, -ob.w / 2, 0], [0.2, ob.d, ob.w / 2, 0]]) { const e = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, d), rimM); e.position.set(x, 0.06, z); mesh.add(e); }
        if (this.level.world === 5) mesh.userData.lava = hole;
      } else if (ob.type === 'spin') {
        mesh = new THREE.Group(); mesh.position.set(ob.x, 0, ob.z);
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 1.2, 12), new THREE.MeshLambertMaterial({ color: '#5d6878' })); post.position.y = 0.6; post.castShadow = true;
        const bar = new THREE.Mesh(new THREE.BoxGeometry((ob.len || 3.5) * 2, 0.35, 0.35), new THREE.MeshLambertMaterial({ map: stripes('#ff4d6d', '#ffffff', 12) })); bar.position.y = 0.75; bar.castShadow = true;
        const knob = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), new THREE.MeshLambertMaterial({ color: '#ffd23f' })); knob.position.y = 1.3;
        mesh.add(post, bar, knob); mesh.userData.spin = bar;
      } else if (ob.type === 'saw') {
        const r = ob.r || 1.1, sh = new THREE.Shape(), teeth = 14;
        for (let i = 0; i <= teeth * 2; i++) { const a = (i / (teeth * 2)) * Math.PI * 2, rr = i % 2 ? r * 0.8 : r; if (i) sh.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else sh.moveTo(rr, 0); }
        const g = new THREE.ExtrudeGeometry(sh, { depth: 0.12, bevelEnabled: false }); g.rotateX(Math.PI / 2);
        mesh = new THREE.Group(); mesh.position.set(ob.x, 0, ob.z);
        const blade = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: '#d7dde6' })); blade.position.y = 0.5; blade.castShadow = true;
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.3, 10), new THREE.MeshLambertMaterial({ color: '#ff4d6d' })); hub.position.y = 0.5;
        const track = new THREE.Mesh(new THREE.PlaneGeometry(2 * (ob.amp ?? 3) + 2 * r, 0.3), new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.18, depthWrite: false })); track.rotation.x = -Math.PI / 2; track.position.set(0, 0.025, 0);
        mesh.add(blade, hub); mesh.userData.blade = blade; mesh.userData.track = track; this.scene.add(track); track.position.set(ob.x, 0.025, ob.z);
      }
      if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; }
      this.scene.add(mesh);
      return { ob, mesh };
    });
  }
  buildBase() {
    const b = this.sim.base, L = this.sim.L, boss = b.boss, bw = b.w;
    const grp = this.baseG = new THREE.Group(); grp.position.set(0, 0, L);
    const red = new THREE.MeshLambertMaterial({ color: '#ff4058' }), redD = new THREE.MeshLambertMaterial({ color: '#c8243a' }), white = new THREE.MeshLambertMaterial({ color: '#fff2f2' }), dark = new THREE.MeshLambertMaterial({ color: '#3a1420' });
    this.baseMats = [red, redD];
    const parts = this.baseParts = [];
    const add = (geo, mat, x, y, z, ry = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = m.receiveShadow = true; grp.add(m); parts.push(m); return m; };
    const h = boss ? 4.6 : 3.4;
    add(new THREE.BoxGeometry(bw, h, BASE_DEPTH - 1), red, 0, h / 2, BASE_DEPTH / 2);
    add(new THREE.BoxGeometry(bw + 0.3, 0.35, BASE_DEPTH - 0.7), white, 0, h + 0.17, BASE_DEPTH / 2);
    for (let i = 0; i < Math.round(bw / 1.2); i++) add(new THREE.BoxGeometry(0.6, 0.6, 0.6), redD, -bw / 2 + 0.6 + i * ((bw - 1.2) / Math.max(1, Math.round(bw / 1.2) - 1)), h + 0.6, 0.9);
    add(new THREE.CylinderGeometry(1.4, 1.4, 0.2, 18, 1, false, 0, Math.PI), dark, 0, 0.1, 0.45).rotation.x = Math.PI / 2;
    const door = add(new THREE.BoxGeometry(2.6, 2.2, 0.3), dark, 0, 1.1, 0.4);
    door.userData.door = true;
    const tH = h + (boss ? 3 : 2);
    for (const s of [-1, 1]) {
      add(new THREE.CylinderGeometry(1.15, 1.3, tH, 14), red, s * (bw / 2), tH / 2, 1.2);
      add(new THREE.ConeGeometry(1.5, 1.8, 14), white, s * (bw / 2), tH + 0.9, 1.2);
      add(new THREE.BoxGeometry(0.5, 0.5, 0.8), dark, s * (bw / 2 - 0.2), tH * 0.62, 0.1); // the spawner cannons
    }
    if (boss) {
      add(new THREE.CylinderGeometry(1.6, 1.8, h + 4.5, 16), redD, 0, (h + 4.5) / 2, BASE_DEPTH - 1.6);
      const crown = add(new THREE.CylinderGeometry(1.9, 1.6, 0.9, 8, 1, true), new THREE.MeshLambertMaterial({ color: '#ffd23f', side: THREE.DoubleSide }), 0, h + 5.1, BASE_DEPTH - 1.6);
      crown.userData.crown = true;
    }
    // flag
    const pole = add(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 6), white, 0, h + (boss ? 6.6 : 1.6), boss ? BASE_DEPTH - 1.6 : BASE_DEPTH / 2);
    const flag = this.flag = add(new THREE.PlaneGeometry(1.4, 0.8, 6, 1), new THREE.MeshLambertMaterial({ color: '#ff2b44', side: THREE.DoubleSide }), 0.72, pole.position.y + 0.8, pole.position.z);
    flag.castShadow = false;
    // shield dome (boss phases)
    this.shield = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ff9fb0', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    this.shield.scale.set(bw * 0.75, h + 3, BASE_DEPTH * 0.8); this.shield.position.set(0, 0, BASE_DEPTH / 2); grp.add(this.shield);
    this.scene.add(grp);
    // towers on the field
    this.towerObjs = this.sim.towers.map((tw) => {
      const g = new THREE.Group(); g.position.set(tw.x, 0, tw.z);
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.15, 2.6, 12), red); body.position.y = 1.3; body.castShadow = true;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(1.3, 1.3, 12), white); roof.position.y = 3.25; roof.castShadow = true;
      const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.9, 8), dark); gun.rotation.x = Math.PI / 2; gun.position.set(0, 1.6, -1.1);
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.22), new THREE.MeshBasicMaterial({ color: '#ff3b4e', depthTest: false, fog: false })); bar.position.y = 4.4; bar.renderOrder = 6;
      const bg = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.32), new THREE.MeshBasicMaterial({ color: '#1a1020', depthTest: false, fog: false, transparent: true, opacity: 0.7 })); bg.position.y = 4.4; bg.renderOrder = 5;
      g.add(body, roof, gun, bg, bar); this.scene.add(g);
      return { tw, g, body, bar, bg, gone: 0 };
    });
  }
  buildCannon() {
    const cs = CANNONS.find((c) => c.id === this.o.cannon) || CANNONS[0];
    const g = this.cannonG = new THREE.Group();
    const body = new THREE.MeshLambertMaterial({ color: cs.body }), trim = new THREE.MeshLambertMaterial({ color: cs.trim }), barrelM = new THREE.MeshLambertMaterial({ color: cs.barrel });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.2, 0.7, 20), body); base.position.y = 0.45;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.12, 8, 24), trim); ring.rotation.x = Math.PI / 2; ring.position.y = 0.8;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.85, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), body); dome.position.y = 0.8;
    const barrel = this.barrel = new THREE.Group(); barrel.position.set(0, 1.25, 0.1); barrel.rotation.x = -0.25;
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 1.9, 16), barrelM); tube.rotation.x = Math.PI / 2; tube.position.z = 0.7;
    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.1, 8, 18), trim); lip.position.z = 1.65;
    barrel.add(tube, lip);
    for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.3, 16), trim); w.rotation.z = Math.PI / 2; w.position.set(s * 1.15, 0.55, 0); g.add(w); }
    g.add(base, ring, dome, barrel);
    g.traverse((m) => { if (m.isMesh) { m.castShadow = true; } });
    g.position.set(0, 0, CANNON_Z - 0.5);
    this.scene.add(g);
  }
  champMesh(id) {
    const C = champById(id), g = new THREE.Group(), col = new THREE.Color(C.color);
    const mat = new THREE.MeshLambertMaterial({ color: col }), white = new THREE.MeshLambertMaterial({ color: '#ffffff' }), dark = new THREE.MeshLambertMaterial({ color: '#141824' });
    const eyes = (y, z, s) => { for (const k of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.16 * s, 10, 8), white); e.position.set(k * 0.22 * s, y, z); const p = new THREE.Mesh(new THREE.SphereGeometry(0.08 * s, 8, 6), dark); p.position.set(k * 0.22 * s, y, z + 0.1 * s); g.add(e, p); } };
    if (id === 'colosso') {
      const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.95, 0.9, 6, 16), mat); b.position.y = 1.5; g.add(b);
      const helm = new THREE.Mesh(new THREE.SphereGeometry(0.98, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2.3), new THREE.MeshLambertMaterial({ color: '#ffd23f' })); helm.position.y = 2.1; g.add(helm);
      for (const k of [-1, 1]) { const fist = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 10), mat); fist.position.set(k * 1.15, 1.2, 0.35); g.add(fist); }
      eyes(1.95, 0.85, 1.4);
    } else if (id === 'grillo') {
      const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 0.5, 6, 14), mat); b.position.y = 1.1; g.add(b);
      for (const k of [-1, 1]) { const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.9, 4, 8), mat); leg.position.set(k * 0.5, 0.55, -0.2); leg.rotation.x = 0.6; g.add(leg); const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 5), dark); ant.position.set(k * 0.2, 1.95, 0.1); ant.rotation.z = -k * 0.4; g.add(ant); }
      eyes(1.35, 0.5, 1.1);
    } else if (id === 'matrioska') {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.95, 18, 14), mat); b.scale.set(1, 1.15, 1); b.position.y = 1.05; g.add(b);
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.62, 16, 12), mat); h.position.y = 2.25; g.add(h);
      const face = new THREE.Mesh(new THREE.CircleGeometry(0.42, 18), new THREE.MeshLambertMaterial({ color: '#ffe3c8' })); face.position.set(0, 2.25, 0.6); g.add(face);
      const belly = new THREE.Mesh(new THREE.CircleGeometry(0.5, 18), new THREE.MeshLambertMaterial({ color: '#ffd23f' })); belly.position.set(0, 1.0, 0.93); g.add(belly);
      eyes(2.3, 0.62, 0.8);
      g.userData.label = true;
    } else {
      const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.7, 0.6, 6, 14), mat); b.position.y = 1.2; g.add(b);
      const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.18, 20), new THREE.MeshLambertMaterial({ color: '#ffd23f' })); sh.rotation.x = Math.PI / 2; sh.position.set(0, 1.2, 0.85); g.add(sh);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: C.color, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }));
      g.add(dome); g.userData.dome = dome;
      eyes(1.7, 0.62, 1.1);
    }
    g.traverse((m) => { if (m.isMesh && m.material.opacity === 1) m.castShadow = true; });
    this.scene.add(g);
    return g;
  }

  // ---------- input
  bindInput() {
    const cv = this.cv;
    const game = new Set(['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD', 'Space', 'ArrowUp', 'KeyW', 'KeyE', 'KeyQ', 'ShiftLeft', 'ShiftRight', 'Enter']);
    this.onKD = (e) => {
      if (this.over) return;
      if (e.code === 'Escape' || e.code === 'KeyP') { e.preventDefault(); e.stopPropagation(); this.togglePause(); return; }
      if (!game.has(e.code)) return;
      e.preventDefault(); e.stopPropagation();
      if (e.code === 'KeyE' || e.code === 'KeyQ' || e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'Enter') { this.launchChampion(); return; }
      this.keys.add(e.code); this.ptr = null;
    };
    this.onKU = (e) => this.keys.delete(e.code);
    window.addEventListener('keydown', this.onKD, true); window.addEventListener('keyup', this.onKU, true);
    // mouse: the cannon follows the pointer, hold to fire · touch: drag (relative) while holding fires
    this.onPD = (e) => {
      if (this.paused || this.over) return;
      cv.setPointerCapture?.(e.pointerId);
      this.ptr = { id: e.pointerId, type: e.pointerType, x0: e.clientX, cx0: this.sim.cannon.x, x: e.clientX, down: true };
      if (e.pointerType === 'mouse') this.ptr.abs = true;
      this.firing = true;
      this.$('or-help')?.classList.add('off');
    };
    this.onPM = (e) => {
      if (this.ptr && this.ptr.id === e.pointerId) { this.ptr.x = e.clientX; return; }
      if (e.pointerType === 'mouse' && !this.keys.size) this.ptr = { id: e.pointerId, type: 'mouse', abs: true, x: e.clientX, down: false };
    };
    this.onPU = (e) => { if (this.ptr && this.ptr.id === e.pointerId) { this.ptr.down = false; this.firing = false; if (this.ptr.type !== 'mouse') this.ptr = null; } };
    cv.addEventListener('pointerdown', this.onPD); cv.addEventListener('pointermove', this.onPM);
    window.addEventListener('pointerup', this.onPU); window.addEventListener('pointercancel', this.onPU);
    this.onVis = () => { if (document.hidden && !this.paused && !this.over) this.togglePause(true); };
    document.addEventListener('visibilitychange', this.onVis);
    this.$('or-pausebtn').addEventListener('click', () => this.togglePause());
    const cb = this.$('or-champ');
    cb.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); this.launchChampion(); });
    this.padPrev = {};
  }
  // screen x → arena x at the cannon line
  screenToArena(px) {
    const rect = this.cv.getBoundingClientRect();
    const a = this.projX(-this.sim.W / 2), b = this.projX(this.sim.W / 2);
    const d = b - a; // negative when the view mirrors the arena (camera looking down +z): handled both ways
    const t = (px - rect.left - a) / (Math.abs(d) < 1 ? 1 : d);
    return -this.sim.W / 2 + t * this.sim.W;
  }
  projX(x) { const v = new THREE.Vector3(x, 0, CANNON_Z + 2).project(this.cam); return (v.x * 0.5 + 0.5) * this.cv.clientWidth; }
  readInput() {
    const inp = this.sim.input, K = this.keys;
    inp.x = null; inp.dx = 0;
    let fire = this.firing || this.o.autofire || this.auto;
    if (K.has('ArrowLeft') || K.has('KeyA')) inp.dx -= 1;
    if (K.has('ArrowRight') || K.has('KeyD')) inp.dx += 1;
    if (K.has('Space') || K.has('ArrowUp') || K.has('KeyW')) fire = true;
    for (const p of navigator.getGamepads?.() || []) {
      if (!p) continue;
      const ax = p.axes[0] || 0; if (Math.abs(ax) > 0.18) inp.dx = Math.sign(ax) * Math.min(1, (Math.abs(ax) - 0.18) / 0.7);
      if (p.buttons[14]?.pressed) inp.dx = -1; if (p.buttons[15]?.pressed) inp.dx = 1;
      if (p.buttons[0]?.pressed || p.buttons[7]?.pressed) fire = true;
      const ch = !!(p.buttons[1]?.pressed || p.buttons[2]?.pressed || p.buttons[3]?.pressed), st = !!p.buttons[9]?.pressed;
      if (ch && !this.padPrev.ch) this.launchChampion();
      if (st && !this.padPrev.st) this.togglePause();
      this.padPrev = { ch, st };
      break;
    }
    // screen-relative controls: "right" always moves the cannon to the right of the SCREEN
    const mir = Math.sign(this.projX(this.sim.W / 2) - this.projX(-this.sim.W / 2)) || 1;
    inp.dx *= mir;
    if (this.ptr && !inp.dx) {
      if (this.ptr.abs) inp.x = this.screenToArena(this.ptr.x);
      else { const span = this.projX(this.sim.W / 2) - this.projX(-this.sim.W / 2); const k = this.sim.W / Math.max(80, Math.abs(span)) * mir; inp.x = this.ptr.cx0 + (this.ptr.x - this.ptr.x0) * k * 1.25; }
    }
    if (this.autoplay) { const a = autopilot(this.sim); inp.x = a.x; fire = true; if (a.champ) this.launchChampion(); }
    inp.fire = fire;
  }
  launchChampion() {
    if (this.paused || this.over || !this.sim.ready() || this.sim.state !== 'play') { if (!this.sim.ready() && this.sim.state === 'play') this.$('or-champ')?.classList.add('nope'), setTimeout(() => this.$('or-champ')?.classList.remove('nope'), 300); return false; }
    this.sim.input.champ = true;
    return true;
  }
  togglePause(force) {
    if (this.over) return;
    this.paused = force ?? !this.paused;
    this.keys.clear(); this.firing = false; if (this.ptr) this.ptr.down = false;
    this.o.onPause?.(this.paused);
  }

  resize() {
    const w = this.root.clientWidth || innerWidth, h = this.root.clientHeight || innerHeight;
    this.renderer.setSize(w, h, false);
    this.cam.aspect = w / h;
    this.fitCamera(w, h);
    const s = (h * this.renderer.getPixelRatio()) / (2 * Math.tan((this.cam.fov * Math.PI) / 360));
    if (this.fx) this.fx.uScale.value = s;
    this.root.classList.toggle('or-wide', w > h * 1.15);
  }
  // frame the whole lane: cannon at the bottom, the base at the top. Portrait looks down the lane,
  // landscape looks from higher up (the lane fills the height, the scenery the sides).
  fitCamera(w, h) {
    const cam = this.cam, W = this.sim.W, L = this.sim.L, asp = w / h;
    const wide = asp > 1.15;
    cam.fov = wide ? 40 : 46; cam.updateProjectionMatrix();
    const pitch = wide ? 0.66 : 0.8; // radians above the horizon
    const tz = L * (wide ? 0.5 : 0.47);
    const pts = [[-W / 2 - 0.5, 0, CANNON_Z - 2.6], [W / 2 + 0.5, 0, CANNON_Z - 2.6], [-W / 2, 0, L + BASE_DEPTH], [W / 2, 0, L + BASE_DEPTH], [0, 8, L + BASE_DEPTH * 0.6]];
    const v = new THREE.Vector3();
    let lo = 10, hi = 260;
    for (let k = 0; k < 26; k++) {
      const d = (lo + hi) / 2;
      cam.position.set(0, Math.sin(pitch) * d, tz - Math.cos(pitch) * d); cam.lookAt(0, 0, tz); cam.updateMatrixWorld();
      let ok = true;
      for (const p of pts) { v.set(p[0], p[1], p[2]).project(cam); if (Math.abs(v.x) > 0.97 || v.y < -0.93 || v.y > (wide ? 0.82 : 0.74)) { ok = false; break; } }
      if (ok) hi = d; else lo = d;
    }
    this.camBase = { d: hi, pitch, tz };
    this.placeCamera(0);
  }
  placeCamera(dt) {
    const B = this.camBase; if (!B) return;
    const cam = this.cam;
    if (this.camOverride) { this.camOverride(cam); return; } // photo mode for tools (covers)
    const sx = (this.sim.cannon.x || 0) * 0.08;
    let ox = 0, oy = 0;
    if (this.shakeT > 0 && this.o.shake !== false) { this.shakeT = Math.max(0, this.shakeT - dt); const k = this.shakeT * this.shakeAmp; ox = (Math.random() - 0.5) * k; oy = (Math.random() - 0.5) * k; }
    cam.position.set(sx + ox, Math.sin(B.pitch) * B.d + oy, B.tz - Math.cos(B.pitch) * B.d);
    cam.lookAt(sx * 0.5 + ox * 0.5, 0, B.tz);
  }
  shake(amp, t = 0.35) { if (this.o.shake === false) return; this.shakeAmp = Math.max(this.shakeAmp || 0, amp); this.shakeT = Math.max(this.shakeT, t); if (this.shakeT === t) this.shakeAmp = amp; }

  // ---------- frame
  loop(now) {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.max(0, Math.min(0.1, (now - this.last) / 1000)); this.last = now;
    if (!this.paused) this.step(dt, true);
    this.render(dt);
    if (!this.paused) this.guard?.tick();
  }
  // advance the game (simulation in fixed steps + effects). Deterministic for the simulation part.
  step(dt, live = false) {
    if (this.paused) return;
    this.clock += dt; this.uTime.value = this.clock;
    if (this.freeze > 0) { this.freeze -= dt; dt = 0; } // hit-stop
    this.acc += dt;
    let n = 0;
    while (this.acc >= STEP && n < (live ? 6 : 1e9)) {
      this.acc -= STEP; n++;
      if (this.sim.state !== 'won' && this.sim.state !== 'lost') { this.readInput(); this.sim.step(STEP); this.drain(); }
    }
    if (live && this.acc > STEP * 6) this.acc = 0;
    this.updateFlyers(dt); this.fx.update(dt);
    this.o.hooks?.onFrame?.(this, dt);
    this.syncHud(false, dt);
  }
  drain() {
    const ev = this.sim.ev; if (!ev.length) return;
    for (const e of ev) { this.onEvent(e); this.o.hooks?.onEvent?.(this, e); }
    ev.length = 0;
  }
  snd(key, ms, fn) { const n = performance.now(); if (n - (this.sfxT[key] || 0) < ms) return; this.sfxT[key] = n; if ((this.o.volume ?? 0.5) > 0) try { fn(); } catch {} }
  onEvent(e) {
    const fx = this.fx, blue = this.blueCol;
    switch (e.t) {
      case 'go': this.banner('Via!', 'go'); this.snd('go', 0, () => osfx.go()); this.$('or-count').textContent = ''; break;
      case 'fire': this.cannonKick = 1; this.snd('fire', 70, () => osfx.shoot()); for (let i = 0; i < 3; i++) fx.emit(e.x, 1.4, CANNON_Z + 1.2, (Math.random() - 0.5) * 2, 1 + Math.random(), 2 + Math.random() * 2, TC.set('#ffffff'), 0.35, 0.35, 2); break;
      case 'clone': {
        const go = this.gateObjs[e.g]; if (go) go.pulse = 1;
        const k = `g${e.g}`, a = this.popAgg.get(k) || { n: 0, x: e.x, z: e.z, t: 0 }; a.n += e.n; a.x = e.x; a.z = e.z; this.popAgg.set(k, a);
        for (let i = 0; i < Math.min(6, 1 + e.n); i++) fx.emit(e.x + (Math.random() - 0.5) * 1.2, 0.8, e.z, (Math.random() - 0.5) * 3, 3 + Math.random() * 3, Math.random() * 2, TC.copy(blue).lerp(TC2.set('#ffffff'), 0.5), 0.3, 0.5);
        const g = this.sim.gates[e.g];
        this.snd('gate', 55, () => osfx.gate(g?.type === 'mul' ? g.value : 1.5));
        break;
      }
      case 'eaten': for (let i = 0; i < 4; i++) fx.emit(e.x, 0.6, e.z, (Math.random() - 0.5) * 3, 2 + Math.random() * 2, (Math.random() - 0.5) * 2, RED, 0.35, 0.5); this.snd('eaten', 90, () => osfx.minus()); break;
      case 'clash': case 'squash':
        for (let i = 0; i < 3; i++) fx.emit(e.x, 0.5, e.z, (Math.random() - 0.5) * 4, 1.5 + Math.random() * 3, (Math.random() - 0.5) * 4, i ? RED : blue, 0.32, 0.45);
        if (e.t === 'squash') this.fling(e.x, e.z, 1, (Math.random() - 0.5) * 8, 8 + Math.random() * 4, 4);
        this.snd('clash', 45, () => osfx.pop());
        break;
      case 'fall': this.fling(e.x, e.z, e.team, 0, -1, 0, true); this.snd('fall', 120, () => osfx.fall()); break;
      case 'fling': this.fling(e.x, e.z, e.team, e.vx, 7, e.vz); this.snd('fling', 90, () => osfx.swat()); break;
      case 'swat': this.snd('swat', 140, () => osfx.swat()); break;
      case 'saw': this.fling(e.x, e.z, e.team, (Math.random() - 0.5) * 6, 6, -2); for (let i = 0; i < 3; i++) fx.emit(e.x, 0.6, e.z, (Math.random() - 0.5) * 6, 2 + Math.random() * 3, (Math.random() - 0.5) * 6, TC.set('#ffe066'), 0.18, 0.35); this.snd('saw', 90, () => osfx.saw()); break;
      case 'hit': {
        this.baseFlash = 1;
        const a = this.popAgg.get('base') || { n: 0, x: 0, z: this.sim.L, t: 0 }; a.n += e.n; this.popAgg.set('base', a);
        for (let i = 0; i < (e.champ ? 30 : 2); i++) fx.emit(e.x, 1 + Math.random() * 2, this.sim.L, (Math.random() - 0.5) * 6, 3 + Math.random() * 5, -Math.random() * 4, i % 2 ? TC.set('#ffffff') : RED, e.champ ? 0.6 : 0.35, 0.7);
        this.snd('hit', 70, () => osfx.hit());
        if (!e.champ) this.shake(0.12, 0.08);
        break;
      }
      case 'shield': this.shieldFlash = 1; break;
      case 'tower': {
        this.freeze = 0.07; this.shake(0.7, 0.4);
        for (let i = 0; i < 40; i++) fx.emit(e.x, 1 + Math.random() * 3, e.z, (Math.random() - 0.5) * 10, 3 + Math.random() * 8, (Math.random() - 0.5) * 10, i % 3 ? RED_D : TC.set('#ffffff'), 0.5, 1.2);
        this.popup('Torre giù!', e.x, 3, e.z, 'big');
        this.snd('tower', 0, () => osfx.crash());
        break;
      }
      case 'champ': this.banner(`${champById(e.id).name}!`, 'champ'); this.snd('champ', 0, () => osfx.champ()); break;
      case 'champHit': this.freeze = 0.12; this.shake(1.2, 0.5); this.popup(`-${Math.round(e.n)}`, e.x, 4, this.sim.L, 'huge'); this.snd('champHit', 0, () => osfx.boom()); for (let i = 0; i < 50; i++) fx.emit(e.x, 1.5, this.sim.L - 0.5, (Math.random() - 0.5) * 14, 4 + Math.random() * 9, -Math.random() * 8, i % 2 ? TC.set('#ffd23f') : TC.set('#ffffff'), 0.55, 1.1); break;
      case 'champDown': this.popup('K.O.', e.x, 2.5, e.z, 'bad'); this.snd('champDown', 0, () => osfx.minus()); for (let i = 0; i < 24; i++) fx.emit(e.x, 1.2, e.z, (Math.random() - 0.5) * 8, 3 + Math.random() * 5, (Math.random() - 0.5) * 8, TC.set(champById(e.id).color), 0.5, 0.9); break;
      case 'slam': this.shake(0.35, 0.18); for (let i = 0; i < 26; i++) { const a = (i / 26) * Math.PI * 2; fx.emit(e.x + Math.cos(a) * 0.5, 0.3, e.z + Math.sin(a) * 0.5, Math.cos(a) * e.r * 4, 1.5, Math.sin(a) * e.r * 4, TC.set('#d9fff4'), 0.45, 0.45, 2); } this.snd('slam', 100, () => osfx.slam()); break;
      case 'burst': this.popup(`×${e.n}!`, e.x, 3.5, e.z, 'big'); for (let i = 0; i < 40; i++) fx.emit(e.x, 2, e.z, (Math.random() - 0.5) * 9, 4 + Math.random() * 6, (Math.random() - 0.5) * 9, i % 2 ? TC.set('#ff8a1f') : blue, 0.45, 1); this.snd('burst', 0, () => osfx.burst()); break;
      case 'phase': this.banner(`Fase ${e.n + 1}!`, 'phase'); this.shake(0.6, 0.6); this.snd('phase', 0, () => osfx.alarm()); break;
      case 'wave': this.snd('wave', 400, () => osfx.wave()); break;
      case 'hurt': this.hurtFlash = 1; this.shake(0.4, 0.2); this.snd('hurt', 120, () => osfx.hurt()); break;
      case 'toggle': { const go = this.gateObjs[e.g]; if (go) go.pulse = 1; this.snd('toggle', 200, () => osfx.toggle()); break; }
      case 'win': this.finish(true); break;
      case 'lose': this.finish(false); break;
    }
  }
  // a figure thrown out of the crowd (blades, bars, pits, champion swats): ballistic, spinning
  fling(x, z, team, vx, vy, vz, fall = false) {
    if (this.flyers.length >= 150) this.flyers.shift();
    this.flyers.push({ x, y: fall ? 0 : 0.3, z, vx, vy, vz, team, t: 0, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 14, fall });
  }
  updateFlyers(dt) {
    const F = this.flyers; let k = 0;
    for (let i = 0; i < F.length; i++) {
      const f = F[i]; f.t += dt;
      if (f.fall) { f.y -= (1.5 + f.t * 9) * dt; f.rot += dt * 6; }
      else { f.vy -= 22 * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt; f.rot += f.spin * dt; }
      if (f.t < (f.fall ? 0.6 : 1.4) && f.y > -3) F[k++] = f;
    }
    F.length = k;
  }
  popup(text, x, y, z, cls = '') {
    if (this.o.numbers === false && /^[+-]/.test(text)) return;
    const el = document.createElement('div'); el.className = `or-pop ${cls}`; el.textContent = text;
    const v = new THREE.Vector3(x, y, z).project(this.cam);
    el.style.left = `${(v.x * 0.5 + 0.5) * 100}%`; el.style.top = `${(-v.y * 0.5 + 0.5) * 100}%`;
    const box = this.$('or-pops'); if (!box) return;
    if (box.childElementCount > 18) box.firstChild.remove();
    box.appendChild(el); setTimeout(() => el.remove(), 1100);
  }
  banner(text, cls = '') {
    const el = this.$('or-banner'); if (!el) return;
    el.textContent = text; el.className = `or-banner ${cls}`; void el.offsetWidth; el.classList.add('on');
    clearTimeout(this._bt); this._bt = setTimeout(() => el.classList.remove('on'), 1300);
  }

  // ---------- drawing
  render(dt) {
    const S = this.sim, t = this.clock;
    if (!this.paused) this.placeCamera(dt); else this.placeCamera(0);
    // crowds
    const B = S.blue, R = S.red, bc = this.blueCol, rainbow = this.skin.rainbow, won = S.state === 'won';
    let n = 0;
    for (let i = 0; i < B.n && n < this.blueC.cap; i++) {
      const s = unitScale(B.u[i]) * FIG, a = B.age[i], pop = a < 0.3 ? 1 + Math.sin((a / 0.3) * Math.PI) * 0.55 : 1;
      if (rainbow) TC.setHSL(((B.ph[i] + t * 0.1) % 1), 0.75, 0.55); else TC.copy(bc);
      if (a < 0.12) TC.lerp(TC2.set('#ffffff'), 0.7);
      this.blueC.set(n++, B.x[i], won ? Math.abs(Math.sin(t * 8 + B.ph[i] * 6)) * 0.5 : 0, B.z[i], 0, s * pop, TC.r, TC.g, TC.b, B.ph[i], won ? 0 : 1);
    }
    this.blueC.commit(n);
    n = 0;
    for (let i = 0; i < R.n && n < this.redC.cap; i++) {
      const s = unitScale(R.u[i]) * FIG * (R.kind[i] ? 1.15 : 1), a = R.age[i], pop = a < 0.25 ? 0.4 + (a / 0.25) * 0.6 : 1;
      TC.copy(R.kind[i] ? RED_D : RED);
      this.redC.set(n++, R.x[i], 0, R.z[i], Math.PI, s * pop, TC.r, TC.g, TC.b, R.ph[i], R.kind[i] ? 0.6 : 1);
    }
    this.redC.commit(n);
    n = 0;
    for (const f of this.flyers) { TC.copy(f.team ? RED : bc); const s = (f.fall ? Math.max(0.05, 1 - f.t * 1.4) : 1) * FIG; this.flyC.set(n++, f.x, f.y, f.z, f.rot, s, TC.r, TC.g, TC.b, 0, 0); }
    this.flyC.commit(n);
    // gates
    for (const go of this.gateObjs) {
      const g = go.g;
      go.grp.position.x = g.cx;
      go.grp.visible = !g.broken || go.pulse > 0;
      const lab = gateLabel(g.type, g.value, g) + (g.toggle ? `:${Math.ceil(g.tt * 4)}` : '');
      if (lab !== go.label) { go.label = lab; drawGate(go.cv, g); go.tex.needsUpdate = true; go.strip.material.color.set(gateGood(g.type) ? '#5ad1ff' : '#ff5a6e'); }
      go.pulse = Math.max(0, go.pulse - dt * 4);
      const k = 1 + go.pulse * 0.12; go.panel.scale.set(g.w * k, g.w * 0.5 * k, 1);
      go.strip.material.opacity = 0.4 + go.pulse * 0.5 + Math.sin(t * 4) * 0.08;
      if (g.broken) { go.grp.scale.setScalar(Math.max(0.01, go.pulse)); }
    }
    // gate number pop-ups, aggregated
    for (const [k, a] of this.popAgg) { a.t += dt; if (a.t > 0.28 || k === 'base' && a.t > 0.2) { if (a.n) this.popup(k === 'base' ? `-${Math.round(a.n)}` : (a.n > 0 ? `+${a.n}` : `${a.n}`), a.x, k === 'base' ? 5 : 2.6, a.z, k === 'base' ? 'dmg' : 'gain'); this.popAgg.delete(k); } }
    // obstacles
    for (const { ob, mesh } of this.obsObjs) {
      if (ob.type === 'barrier') mesh.position.x = ob.cx;
      else if (ob.type === 'spin') mesh.userData.spin.rotation.y = -ob.ang;
      else if (ob.type === 'saw') { mesh.position.x = ob.cx; mesh.userData.blade.rotation.y = ob.ang; }
      if (mesh.userData.lava) mesh.userData.lava.material.color.setHSL(0.04 + Math.sin(t * 2 + ob.x) * 0.015, 1, 0.5 + Math.sin(t * 3 + ob.z) * 0.06);
    }
    // base: hit flash, shield dome, waving flag, the collapse
    const base = S.base;
    this.baseFlash = Math.max(0, (this.baseFlash || 0) - dt * 6);
    const f = this.baseFlash;
    this.baseMats[0].emissive.setRGB(f * 0.5, f * 0.35, f * 0.35);
    if (this.flag) this.flag.rotation.y = Math.sin(t * 3) * 0.25;
    const shieldOn = base.shieldT > 0;
    this.shieldFlash = Math.max(0, (this.shieldFlash || 0) - dt * 3);
    this.shield.material.opacity = shieldOn ? 0.22 + Math.sin(t * 8) * 0.05 + this.shieldFlash * 0.2 : Math.max(0, this.shield.material.opacity - dt);
    if (!this.collapse && !won) this.baseG.position.x = f * (Math.random() - 0.5) * 0.12;
    if (this.collapse) this.animateCollapse(dt);
    // towers
    for (const to of this.towerObjs) {
      const tw = to.tw;
      if (tw.dead) { to.gone += dt; to.g.position.y = -to.gone * 6; to.g.rotation.z = to.gone * 0.8; to.g.visible = to.gone < 0.8; continue; }
      to.bar.scale.x = Math.max(0.001, tw.hp / tw.max); to.bar.position.x = -(1 - to.bar.scale.x) * 0.9;
      to.bar.quaternion.copy(this.cam.quaternion); to.bg.quaternion.copy(this.cam.quaternion);
      to.body.scale.setScalar(1 + tw.hit * 0.06);
    }
    // cannon
    const c = S.cannon;
    this.cannonG.position.x = c.x;
    this.cannonKick = Math.max(0, (this.cannonKick || 0) - dt * 9);
    this.barrel.position.z = 0.1 - this.cannonKick * 0.35; this.barrel.scale.set(1 + this.cannonKick * 0.08, 1 + this.cannonKick * 0.08, 1 - this.cannonKick * 0.1);
    // champions
    const seen = new Set();
    for (const ch of S.champs) {
      let m = this.champMeshes.get(ch); if (!m) { m = this.champMesh(ch.id); this.champMeshes.set(ch, m); }
      seen.add(ch);
      const sc = ch.alive ? 1 + ch.hit * 0.08 : Math.max(0.01, ch.fade / 0.6);
      m.position.set(ch.x, ch.air || Math.abs(Math.sin(t * 7)) * 0.15, ch.z); m.scale.setScalar(1.35 * sc * (ch.age < 0.3 ? 0.4 + ch.age * 2 : 1));
      m.rotation.z = Math.sin(t * 7) * 0.06;
      if (m.userData.dome) { const a = ch.st.aura / 1.35; m.userData.dome.scale.set(a, a * 0.8, a); m.userData.dome.material.opacity = 0.14 + ch.hit * 0.2; }
    }
    for (const [ch, m] of this.champMeshes) if (!seen.has(ch)) { this.scene.remove(m); m.traverse((x) => { x.geometry?.dispose(); }); this.champMeshes.delete(ch); }
    this.renderer.render(this.scene, this.cam);
  }
  syncHud(force, dt = 0) {
    const S = this.sim, $ = this.$;
    this._hudT = (this._hudT || 0) + dt;
    if (!force && this._hudT < 0.066) return;
    this._hudT = 0;
    const b = S.base, pct = Math.max(0, b.hp / b.max);
    $('or-bbar').style.width = `${pct * 100}%`;
    $('or-bhp').textContent = Math.max(0, Math.ceil(b.hp)).toLocaleString('it-IT');
    $('or-bshield').classList.toggle('on', b.shieldT > 0);
    const tl = Math.max(0, S.time);
    const te = $('or-timer'); te.textContent = fmtT(tl); te.classList.toggle('hot', tl < 15 && S.state === 'play');
    $('or-cn').textContent = S.blueUnits().toLocaleString('it-IT');
    $('or-cbar').style.width = `${Math.max(0, S.cannon.hp / S.cannon.max) * 100}%`;
    $('or-can').classList.toggle('low', S.cannon.hp / S.cannon.max < 0.35);
    const ch = Math.min(1, S.charge / S.chargeNeed), btn = $('or-champ');
    btn.style.setProperty('--p', `${ch * 100}%`); btn.classList.toggle('ready', ch >= 1);
    $('or-champ-t').textContent = ch >= 1 ? 'Pronto! (E)' : `${Math.floor(ch * 100)}%`;
    if (ch >= 1 && !this._readyOnce) { this._readyOnce = true; this.snd('ready', 0, () => osfx.ready()); }
    if (ch < 1) this._readyOnce = false;
    $('or-g1').classList.toggle('miss', S.t > (this.level.stars?.par ?? 60));
    $('or-g2').classList.toggle('ok', S.blueUnits() >= (this.level.stars?.crowd ?? 30));
    if (S.state === 'count') { const k = Math.ceil(S.count), el = $('or-count'); if (String(k) !== el.textContent && k > 0) { el.textContent = k; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); this.snd('beep', 0, () => osfx.beep()); } }
    this.hurtFlash = Math.max(0, (this.hurtFlash || 0) - 0.066 * 3);
    $('or-hurt').style.opacity = this.hurtFlash;
  }

  // ---------- the end
  finish(win) {
    if (this.over) return;
    this.over = true; this.firing = false;
    const S = this.sim, r = S.result(), L = this.level;
    const stars = starsFor(L, r);
    const coins = coinsFor(L, stars, this.o.prevStars || 0, win);
    if (win) {
      this.collapse = { t: 0, parts: this.baseParts.map((m) => ({ m, vx: (Math.random() - 0.5) * 6, vy: 4 + Math.random() * 8, vz: (Math.random() - 0.3) * 6, rx: (Math.random() - 0.5) * 5, rz: (Math.random() - 0.5) * 5 })) };
      this.freeze = 0.25; this.shake(1.6, 1.1);
      this.banner(L.base?.boss ? 'Fortezza espugnata!' : 'Base distrutta!', 'win');
      this.snd('win', 0, () => { osfx.collapse(); setTimeout(() => osfx.win(), 500); });
      for (let i = 0; i < 160; i++) this.fx.emit((Math.random() - 0.5) * S.base.w, 2 + Math.random() * 4, S.L + Math.random() * BASE_DEPTH, (Math.random() - 0.5) * 16, 6 + Math.random() * 12, (Math.random() - 0.5) * 12, TC.setHSL(Math.random(), 0.85, 0.6), 0.45, 2.4, 9);
    } else {
      this.banner(r.why === 'time' ? 'Tempo scaduto' : 'Cannone travolto!', 'lose');
      this.snd('lose', 0, () => osfx.lose());
    }
    const result = {
      win, why: r.why, stars, coins, figuresSent: r.sent, timeMs: Math.round(r.time * 1000), kills: Math.round(r.kills), champions: r.champs, mode: this.o.mode, levelId: L.id ?? null,
      left: r.left, towers: r.towers, baseDmg: Math.round(r.baseDmg), baseHp: r.baseHp, baseMax: r.baseMax, cannonHp: Math.max(0, Math.round(r.cannonHp)), cannonMax: r.cannonMax, cloned: r.cloned, peak: r.peak, bricks: 0,
    };
    this.result = result;
    this.o.hooks?.onEnd?.(S, result);
    this._endT = setTimeout(() => this.o.onEnd?.(result), win ? 1900 : 1400);
  }
  animateCollapse(dt) {
    const C = this.collapse; C.t += dt;
    for (const p of C.parts) { p.vy -= 20 * dt; p.m.position.x += p.vx * dt; p.m.position.y = Math.max(-2, p.m.position.y + p.vy * dt); p.m.position.z += p.vz * dt; p.m.rotation.x += p.rx * dt; p.m.rotation.z += p.rz * dt; }
    this.baseG.position.y = -Math.min(3, C.t * 1.2);
    if (C.t < 1.2 && Math.random() < 0.6) this.fx.emit((Math.random() - 0.5) * this.sim.base.w, 0.5, this.sim.L + Math.random() * 5, (Math.random() - 0.5) * 4, 2 + Math.random() * 3, (Math.random() - 0.5) * 4, TC.set('#d8c8c0'), 0.9, 1.4, 1);
  }
  // test / tools hook
  debugInfo() { const S = this.sim; return { state: S.state, t: +S.t.toFixed(2), blue: S.blueUnits(), bodies: S.blue.n, red: S.redUnits(), base: Math.round(S.base.hp), cannon: S.cannon.hp, charge: +S.charge.toFixed(1), need: S.chargeNeed, champs: S.champs.length, guard: this.guard?.log, pr: this.renderer.getPixelRatio() }; }

  destroy() {
    cancelAnimationFrame(this.raf); clearTimeout(this._endT); clearTimeout(this._bt);
    window.removeEventListener('keydown', this.onKD, true); window.removeEventListener('keyup', this.onKU, true);
    window.removeEventListener('pointerup', this.onPU); window.removeEventListener('pointercancel', this.onPU);
    document.removeEventListener('visibilitychange', this.onVis);
    this.ro?.disconnect();
    this.scene?.traverse((x) => { x.geometry?.dispose?.(); const m = x.material; (Array.isArray(m) ? m : m ? [m] : []).forEach((y) => { y.map?.dispose?.(); y.dispose?.(); }); });
    this.scene?.background?.dispose?.();
    this.renderer?.dispose(); this.renderer?.forceContextLoss?.();
    this.root.innerHTML = '';
  }
}
// shared with the 2-player mode (src/orda/versus.js): same bean figures and champion models
export { figureGeometry, figureMaterial, Crowd };
