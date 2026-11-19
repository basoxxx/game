// Serpentone — the live game: three.js view of the simulation (src/serpentone/sim.js), input (mouse,
// keys, controllers, touch stick / steering), HUD, split screen for two players, sounds.
//
// The bodies are thousands of instanced spheres drawn in ONE call: a custom attribute per instance
// (position + radius, colour + glow) written straight into a Float32Array each frame, no matrices.
// Shadows are flat blobs sharing the same buffer; the food is another instanced draw (+ additive halos).
import * as THREE from 'three';
import { pixelRatio } from '../ui/quality.js';
import { FrameGuard } from '../ui/perfguard.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Sim } from './sim.js';
import { ARENAS, MODES, POWERS, skinColors, patternColor, matchCoins, matchStars } from './meta.js';
import { buildArena } from './arena.js';
import { buildHead } from './looks.js';
import { vsfx, osfx, sfx as uisfx } from '../ui/audio.js';

const MAXI = 16000, MAXF = 6000;
const lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const hexRGB = (n) => [lin(((n >> 16) & 255) / 255), lin(((n >> 8) & 255) / 255), lin((n & 255) / 255)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Math.round(n).toLocaleString('it-IT');
const tv = new THREE.Vector3(), tc = new THREE.Color();
const POWER_ICON = { magnet: 'U', ghost: '~', speed: '»', double: 'x2' };

class Snd {
  constructor(on) { this.on = on; this.popT = 0; this.wT = 0; }
  p(f) { if (!this.on) return; try { f(); } catch {} }
  pop() { const t = performance.now(); if (t - this.popT < 55) return; this.popT = t; this.p(() => osfx.pop()); }
  combo(n) { this.p(() => osfx.gate(n)); }
  kill() { this.p(() => vsfx.rival()); }
  boom() { this.p(() => osfx.boom()); }
  far() { this.p(() => vsfx.rivalGone()); }
  lost() { this.p(() => vsfx.lost()); }
  power() { this.p(() => uisfx.levelup?.()); }
  coin() { this.p(() => uisfx.coin?.()); }
  beep(go) { this.p(() => vsfx.beep(go)); }
  tick(s) { this.p(() => vsfx.tick(s)); }
  end(win) { this.p(() => vsfx.end(win)); }
  whoosh() { const t = performance.now(); if (t - this.wT < 700) return; this.wT = t; this.p(() => uisfx.whoosh?.()); }
}

class Particles {
  constructor(scene, n) {
    this.n = n; this.i = 0;
    this.pos = new Float32Array(n * 3).fill(-999); this.vel = new Float32Array(n * 3); this.col = new Float32Array(n * 3); this.size = new Float32Array(n); this.life = new Float32Array(n); this.max = new Float32Array(n); this.alpha = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    for (const [k, a, s] of [['position', this.pos, 3], ['color', this.col, 3], ['size', this.size, 1], ['alpha', this.alpha, 1]]) g.setAttribute(k, new THREE.BufferAttribute(a, s).setUsage(THREE.DynamicDrawUsage));
    this.uScale = { value: 500 };
    this.pts = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: { uScale: this.uScale },
      vertexShader: 'attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA; uniform float uScale; void main(){ vC = color; vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = alpha > 0.0 ? clamp(size * uScale / max(1.0, -mv.z), 1.0, 64.0) : 0.0; }',
      fragmentShader: 'varying vec3 vC; varying float vA; void main(){ vec2 d = gl_PointCoord - 0.5; float r = dot(d, d) * 4.0; if (r > 1.0) discard; float a = vA * (1.0 - r); gl_FragColor = vec4(vC * a, 1.0); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.pts.frustumCulled = false; this.pts.renderOrder = 6; scene.add(this.pts);
  }
  emit(x, y, z, vx, vy, vz, r, g, b, size, life) {
    const i = this.i = (this.i + 1) % this.n, j = i * 3;
    this.pos[j] = x; this.pos[j + 1] = y; this.pos[j + 2] = z; this.vel[j] = vx; this.vel[j + 1] = vy; this.vel[j + 2] = vz;
    this.col[j] = r; this.col[j + 1] = g; this.col[j + 2] = b; this.size[i] = size; this.life[i] = this.max[i] = life; this.alpha[i] = 1; this.dirty = true;
  }
  update(dt) {
    if (!this.dirty) return;
    let any = false;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt; const j = i * 3;
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      any = true;
      const d = Math.exp(-2.2 * dt);
      this.vel[j] *= d; this.vel[j + 2] *= d; this.vel[j + 1] = this.vel[j + 1] * d - 9 * dt;
      this.pos[j] += this.vel[j] * dt; this.pos[j + 1] = Math.max(0.1, this.pos[j + 1] + this.vel[j + 1] * dt); this.pos[j + 2] += this.vel[j + 2] * dt;
      this.alpha[i] = Math.min(1, (this.life[i] / this.max[i]) * 2);
    }
    const a = this.pts.geometry.attributes; a.position.needsUpdate = a.alpha.needsUpdate = a.color.needsUpdate = a.size.needsUpdate = true;
    this.dirty = any;
  }
}

function iconTexture(type, color) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 10, 64, 64, 62); grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.55, color); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ffffff'; g.strokeStyle = '#1a1030'; g.lineWidth = 7; g.lineJoin = 'round'; g.lineCap = 'round';
  if (type === 'magnet') { g.beginPath(); g.arc(64, 62, 24, Math.PI, 0); g.lineTo(88, 92); g.moveTo(40, 62); g.lineTo(40, 92); g.lineWidth = 16; g.strokeStyle = '#1a1030'; g.stroke(); g.lineWidth = 9; g.strokeStyle = '#ff4d6d'; g.stroke(); g.fillStyle = '#ffffff'; g.fillRect(32, 84, 16, 12); g.fillRect(80, 84, 16, 12); }
  else if (type === 'ghost') { g.beginPath(); g.moveTo(40, 96); g.lineTo(40, 58); g.arc(64, 58, 24, Math.PI, 0); g.lineTo(88, 96); for (let i = 0; i < 4; i++) g.lineTo(82 - i * 12, i & 1 ? 96 : 86); g.closePath(); g.stroke(); g.fill(); g.fillStyle = '#1a1030'; g.beginPath(); g.arc(55, 60, 5, 0, 7); g.arc(73, 60, 5, 0, 7); g.fill(); }
  else if (type === 'speed') { g.beginPath(); g.moveTo(70, 26); g.lineTo(42, 70); g.lineTo(62, 70); g.lineTo(56, 102); g.lineTo(88, 54); g.lineTo(68, 54); g.closePath(); g.stroke(); g.fillStyle = '#fff59a'; g.fill(); }
  else { g.font = '900 52px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.strokeText('x2', 64, 66); g.fillText('x2', 64, 66); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class SerpentoneGame {
  constructor(root, opts) {
    this.root = root;
    this.o = { mode: 'classica', arena: 'giardino', diff: 'normale', tier: 'high', volume: 0.5, touch: 'joy', daily: null, looks: [], seed: null, ...opts };
    this.mode = MODES[this.o.mode] || MODES.classica;
    this.cfg = ARENAS[this.o.arena] || ARENAS.giardino;
    this.seed = this.o.seed ?? this.o.daily?.seed ?? ((Date.now() & 0xffffff) + 11);
    this.paused = false; this.over = false; this.count = 3; this.clock = 0;
    this.keys = new Set(); this.mouse = null; this.mouseDown = false; this.mouseOn = false; this.touches = new Map(); this.steer = [0, 0]; this.boostBtn = false;
    this.detail = 1; this.vis = []; this.feed = [];
  }

  async start() {
    const o = this.o, root = this.root, duo = !!this.mode.duo;
    this.sim = new Sim({ mode: o.mode, arena: o.arena, diff: o.diff, seed: this.seed, twist: o.daily?.twist || null, playerLooks: o.looks });
    root.innerHTML = `<canvas class="sp-cv"></canvas><div class="sp-hud ${duo ? 'duo' : 'solo'} ${o.touchUI ? 'touch' : ''} ${o.touch === 'steer' ? 'steer' : ''}">
      <div class="sp-top" id="sp-top"><div class="sp-timer" id="sp-timer"></div><div class="sp-mode">${o.daily ? 'Arena del giorno · ' : ''}${esc(this.mode.name)} · ${esc(this.cfg.name)}</div></div>
      ${duo ? '' : '<ol class="sp-board" id="sp-board"></ol><ul class="sp-miss" id="sp-miss"></ul>'}
      <div class="sp-feed" id="sp-feed"></div>
      <div class="sp-views" id="sp-views"></div>
      ${duo ? '' : '<canvas class="sp-mini" id="sp-mini" width="200" height="200"></canvas>'}
      <button class="sp-pausebtn" id="sp-pausebtn" aria-label="Pausa">II</button>
      <div class="sp-count" id="sp-count"></div><div class="sp-toast" id="sp-toast"></div>
      ${duo ? '' : '<button class="sp-boost" id="sp-boost" aria-label="Scatto">Scatto</button><div class="sp-steer" id="sp-steer"><button data-s="-1" aria-label="Sinistra">‹</button><button data-s="1" aria-label="Destra">›</button></div>'}
    </div>`;
    this.cv = root.querySelector('.sp-cv'); this.$ = (id) => root.querySelector('#' + id);
    const tier = this.tier = o.tier;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas: this.cv, antialias: tier !== 'low', powerPreference: 'high-performance' });
    r.setPixelRatio(pixelRatio(1.75)); r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    const setPR = (pr) => { if (Math.abs(r.getPixelRatio() - pr) < 0.01) return false; r.setPixelRatio(pr); this.composer?.setPixelRatio?.(pr); this.resize(); };
    this.guard = new FrameGuard([
      { fps: 45, run: () => setPR(1) },
      { fps: 36, run: () => { if (!this.composer && !this.halo.visible) return false; this.composer?.dispose?.(); this.composer = null; this.halo.visible = false; } },
      { fps: 30, run: () => { if (this.detail > 1) return false; this.detail = 1.7; } },
      { fps: 24, run: () => setPR(0.75) },
    ]);
    this.snd = new Snd(o.volume > 0);
    const cfg = this.cfg, scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color(cfg.sky);
    scene.add(new THREE.HemisphereLight(cfg.night ? '#8a90ff' : '#ffffff', cfg.night ? '#201640' : '#6a7a4a', cfg.amb * 1.1));
    const sun = new THREE.DirectionalLight(cfg.sun, cfg.night ? 1.1 : 1.6); sun.position.set(-40, 100, 60); scene.add(sun);
    if (cfg.night) { const fill = new THREE.DirectionalLight(cfg.c, 0.6); fill.position.set(60, 40, -50); scene.add(fill); }
    this.arena = buildArena(scene, cfg, this.sim.R, tier, this.seed);
    this.buildBodies();
    this.buildFood();
    this.fx = new Particles(scene, tier === 'low' ? 600 : 1600);
    this.itemsVis = new Map(); this.iconTex = {};
    this.views = this.sim.players.map((p, i) => ({ i, p, cam: new THREE.PerspectiveCamera(50, 1, 0.5, 2600), x: p.x, z: p.z, h: 30, rect: { x: 0, y: 0, w: 1, h: 1 } }));
    const vroot = this.$('sp-views');
    for (const v of this.views) {
      const el = document.createElement('div'); el.className = 'sp-view'; el.dataset.p = v.i;
      el.innerHTML = `<div class="sp-me"><div class="sp-len"><small>Lunghezza</small><b>10</b></div><div class="sp-rank"></div><div class="sp-pw"></div></div><div class="sp-labels"></div><div class="sp-dead"></div><div class="sp-pops"></div>${duo ? `<div class="sp-tag" style="--c:${esc(skinColors(v.p.skin).c[0])}">G${v.i + 1}</div><div class="sp-joy"><i></i></div>` : '<div class="sp-joy"><i></i></div>'}`;
      vroot.appendChild(el); v.el = el; v.labels = [];
    }
    if (tier === 'high' && !duo) {
      const rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: 4 });
      this.composer = new EffectComposer(r, rt);
      this.composer.addPass(new RenderPass(scene, this.views[0].cam));
      this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), cfg.night ? 0.85 : 0.35, 0.4, cfg.night ? 0.55 : 0.82));
      this.composer.addPass(new OutputPass());
    }
    this.bindInput();
    this.resize();
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(root);
    this.renderMissions();
    for (const v of this.views) this.updateCamera(v, 1, true);
    this.syncVisuals(0);
    this.last = performance.now();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
    document.activeElement?.blur?.();
  }

  // ---------- instanced bodies, blob shadows, food
  buildBodies() {
    const hi = this.tier !== 'low';
    const sg = new THREE.SphereGeometry(1, hi ? 14 : 9, hi ? 10 : 6);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = sg.index; geo.setAttribute('position', sg.attributes.position); geo.setAttribute('normal', sg.attributes.normal);
    this.iPos = new THREE.InstancedBufferAttribute(new Float32Array(MAXI * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.iCol = new THREE.InstancedBufferAttribute(new Float32Array(MAXI * 4), 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iPos', this.iPos); geo.setAttribute('iCol', this.iCol); geo.instanceCount = 0;
    const m = new THREE.MeshPhongMaterial({ color: '#ffffff', shininess: 70, specular: '#4a4a4a' });
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 iPos; attribute vec4 iCol; varying vec4 vCol;')
        .replace('#include <begin_vertex>', 'vec3 transformed = position * iPos.w + iPos.xyz; vCol = iCol;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec4 vCol;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vCol.rgb;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vCol.rgb * vCol.a;');
    };
    this.bodyGeo = geo;
    this.body = new THREE.Mesh(geo, m); this.body.frustumCulled = false; this.scene.add(this.body);
    // blob shadows: same instance buffer, a flat quad per segment
    const pg = new THREE.PlaneGeometry(2, 2), sgeo = new THREE.InstancedBufferGeometry();
    sgeo.index = pg.index; sgeo.setAttribute('position', pg.attributes.position); sgeo.setAttribute('uv', pg.attributes.uv); sgeo.setAttribute('iPos', this.iPos); sgeo.instanceCount = 0;
    this.shadowGeo = sgeo;
    const sm = new THREE.ShaderMaterial({
      uniforms: { uA: { value: this.cfg.night ? 0.32 : 0.2 } },
      vertexShader: 'attribute vec4 iPos; varying vec2 vU; void main(){ vU = uv; float s = iPos.w * 1.25; vec3 w = vec3(iPos.x + position.x * s + iPos.w * 0.35, 0.03, iPos.z - position.y * s + iPos.w * 0.3); gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0); }',
      fragmentShader: 'uniform float uA; varying vec2 vU; void main(){ float d = length(vU - 0.5) * 2.0; float a = (1.0 - smoothstep(0.35, 1.0, d)) * uA; gl_FragColor = vec4(0.0, 0.0, 0.05, a); }',
      transparent: true, depthWrite: false,
    });
    this.shadow = new THREE.Mesh(sgeo, sm); this.shadow.frustumCulled = false; this.shadow.renderOrder = -1; this.scene.add(this.shadow);
  }
  buildFood() {
    const ig = new THREE.IcosahedronGeometry(1, this.tier === 'low' ? 0 : 1), geo = new THREE.InstancedBufferGeometry();
    geo.index = ig.index; geo.setAttribute('position', ig.attributes.position); geo.setAttribute('normal', ig.attributes.normal);
    this.fP = new THREE.InstancedBufferAttribute(new Float32Array(MAXF * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.fC = new THREE.InstancedBufferAttribute(new Float32Array(MAXF * 4), 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('fP', this.fP); geo.setAttribute('fC', this.fC); geo.instanceCount = 0;
    this.uTime = { value: 0 };
    const m = new THREE.MeshPhongMaterial({ color: '#ffffff', shininess: 90, specular: '#ffffff' });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.uTime;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 fP; attribute vec4 fC; varying vec4 vCol; uniform float uTime;')
        .replace('#include <begin_vertex>', 'float s = fP.z * (0.9 + 0.14 * sin(uTime * 5.0 + fP.w)); vec3 transformed = position * s + vec3(fP.x, s + 0.25 + sin(uTime * 3.0 + fP.w) * 0.14, fP.y); vCol = fC;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec4 vCol;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vCol.rgb;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vCol.rgb * vCol.a;');
    };
    this.foodGeo = geo;
    this.food = new THREE.Mesh(geo, m); this.food.frustumCulled = false; this.scene.add(this.food);
    // additive halos (billboards) around every pellet
    const pg = new THREE.PlaneGeometry(2, 2), hg = new THREE.InstancedBufferGeometry();
    hg.index = pg.index; hg.setAttribute('position', pg.attributes.position); hg.setAttribute('uv', pg.attributes.uv); hg.setAttribute('fP', this.fP); hg.setAttribute('fC', this.fC); hg.instanceCount = 0;
    this.haloGeo = hg;
    this.halo = new THREE.Mesh(hg, new THREE.ShaderMaterial({
      uniforms: { uTime: this.uTime, uK: { value: this.cfg.night ? 0.85 : 0.7 } },
      vertexShader: 'attribute vec4 fP; attribute vec4 fC; varying vec2 vU; varying vec4 vC; uniform float uTime; void main(){ vU = uv; vC = fC; vec4 mv = viewMatrix * vec4(fP.x, fP.z + 0.25, fP.y, 1.0); mv.xy += position.xy * fP.z * (2.6 + 0.4 * sin(uTime * 4.0 + fP.w)); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform float uK; varying vec2 vU; varying vec4 vC; void main(){ float d = length(vU - 0.5) * 2.0; float a = pow(max(0.0, 1.0 - d), 2.0) * uK * (0.5 + vC.a); gl_FragColor = vec4(vC.rgb * a, 1.0); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.halo.frustumCulled = false; this.halo.renderOrder = 3; this.halo.visible = this.tier !== 'low'; this.scene.add(this.halo);
  }
  visFor(s) {
    let v = this.vis[s.id];
    if (v) return v;
    const sk = skinColors(s.skin);
    const head = buildHead(sk.c[0], s.hat, sk.c[1]);
    this.scene.add(head.g);
    v = this.vis[s.id] = { s, sk, head, cols: new Float32Array(0), n: 0, blink: 1 + Math.random() * 3, tongue: 2 + Math.random() * 3, tongueT: 0, wasAlive: false };
    return v;
  }
  colorsFor(v, n) {
    if (v.n >= n) return v.cols;
    const N = Math.max(n, v.n * 2, 64), cols = new Float32Array(N * 3), c = [0, 0, 0];
    for (let i = 0; i < N; i++) { patternColor(v.sk, v.s.pattern, i, N, c); cols[i * 3] = lin(c[0]); cols[i * 3 + 1] = lin(c[1]); cols[i * 3 + 2] = lin(c[2]); }
    v.cols = cols; v.n = N; return cols;
  }

  // ---------- per frame: write the instance buffers from the simulation
  syncVisuals(dt) {
    const sim = this.sim, P = this.iPos.array, C = this.iCol.array, t = this.clock;
    const views = this.views.map((v) => [v.x, v.z, (v.h * 1.25 + 30) ** 2]);
    const seen = (x, z, pad) => { for (const [vx, vz, r2] of views) { const dx = x - vx, dz = z - vz; if (dx * dx + dz * dz < r2 + pad) return true; } return false; };
    let k = 0; const q = [0, 0];
    for (const s of sim.snakes) {
      const v = this.visFor(s);
      v.head.g.visible = s.alive;
      if (!s.alive) { v.wasAlive = false; continue; }
      if (!seen(s.x, s.z, (s.L + 20) ** 2 * 1.2)) { v.head.g.visible = false; continue; }
      const dv = Math.max(0.2, s.r * 0.36) * this.detail, n = Math.min(Math.ceil(s.L / dv), 2400);
      const cols = this.colorsFor(v, n + 1), pw = s.power?.type, blink = s.spawnT > 0 && Math.floor(s.spawnT * 8) % 2 === 0;
      const ghost = pw === 'ghost';
      for (let i = n; i >= 1 && k < MAXI; i--) {
        const d = i * dv; s.sample(d, q);
        if (!seen(q[0], q[1], 30)) continue;
        const rad = s.radAt(d), j = k * 4;
        P[j] = q[0]; P[j + 1] = rad * 0.82 + Math.sin(t * 7 - i * 0.45) * rad * 0.03; P[j + 2] = q[1]; P[j + 3] = rad;
        let cr = cols[i * 3], cg = cols[i * 3 + 1], cb = cols[i * 3 + 2], gl = 0;
        if (s.boosting) gl = 0.25 + 0.3 * Math.max(0, Math.sin(t * 16 - i * 0.5));
        if (ghost) { cr = cr * 0.35 + 0.55; cg = cg * 0.35 + 0.6; cb = cb * 0.35 + 0.75; gl = 0.15 + 0.15 * Math.sin(t * 9 + i * 0.3); }
        if (blink) gl = 0.7;
        if (this.cfg.night) gl += 0.12;
        C[j] = cr; C[j + 1] = cg; C[j + 2] = cb; C[j + 3] = gl;
        k++;
      }
      // the head
      const H = v.head, r = s.r * 1.12;
      H.g.position.set(s.x, s.r * 0.86, s.z); H.g.scale.setScalar(r); H.g.rotation.y = -s.a;
      const turn = Math.max(-1, Math.min(1, ((s.ta - s.a + Math.PI * 3) % (Math.PI * 2)) - Math.PI));
      for (const e of H.eyes) { e.p.position.z = turn * 0.12; e.p.position.y = 0.02 + Math.sin(t * 1.3 + s.id) * 0.03; }
      v.blink -= dt; if (v.blink < 0) { const k2 = v.blink > -0.12 ? 0.1 : 1; for (const e of H.eyes) e.e.scale.y = k2; if (v.blink < -0.12) v.blink = 2 + Math.random() * 4; }
      v.tongue -= dt;
      if (v.tongue < 0) { const u = -v.tongue / 0.35; H.tongue.scale.x = u < 1 ? Math.sin(u * Math.PI) + 0.001 : 0.001; if (u >= 1) v.tongue = 2 + Math.random() * 4; }
      const em = H.head.material.emissive;
      if (pw) { tc.set(POWERS[pw].color); em.copy(tc).multiplyScalar(0.35 + 0.25 * Math.sin(t * 8)); } else if (blink) em.setRGB(0.6, 0.6, 0.6); else if (s.boosting) em.setRGB(0.18, 0.18, 0.18); else em.setRGB(this.cfg.night ? 0.08 : 0, this.cfg.night ? 0.08 : 0, this.cfg.night ? 0.1 : 0);
      H.head.material.transparent = ghost; H.head.material.opacity = ghost ? 0.7 : 1;
      if (H.hat.userData.spin) H.hat.userData.spin.rotation.y = t * (s.boosting ? 30 : 12);
      if (H.hat.userData.bob) H.hat.userData.bob.position.y = 1.55 + Math.sin(t * 3) * 0.06;
      // boost trail sparkles
      if (s.boosting && Math.random() < 0.5) { s.sample(s.L * 0.95, q); const c = cols; this.fx.emit(q[0], s.r * 0.6, q[1], (Math.random() - 0.5) * 3, 2 + Math.random() * 2, (Math.random() - 0.5) * 3, c[3] * 1.5 + 0.2, c[4] * 1.5 + 0.2, c[5] * 1.5 + 0.2, 0.5 + s.r * 0.2, 0.5); }
    }
    this.bodyGeo.instanceCount = k; this.shadowGeo.instanceCount = k;
    this.iPos.addUpdateRange(0, k * 4); this.iCol.addUpdateRange(0, k * 4);
    this.iPos.needsUpdate = this.iCol.needsUpdate = true;
    this.instances = k;
    // food
    const FP = this.fP.array, FC = this.fC.array; let f = 0;
    if (!this.foodRGB) this.foodRGB = new Map();
    for (let i = 0; i < MAXF; i++) {
      if (!sim.fa[i]) continue;
      const x = sim.fx[i], z = sim.fz[i];
      if (!seen(x, z, 0)) continue;
      const j = f * 4, val = sim.fv[i];
      FP[j] = x; FP[j + 1] = z; FP[j + 2] = 0.34 + Math.sqrt(val) * 0.2; FP[j + 3] = (i * 1.618) % 6.283;
      let rgb = this.foodRGB.get(sim.fc[i]); if (!rgb) { rgb = hexRGB(sim.fc[i]); this.foodRGB.set(sim.fc[i], rgb); }
      FC[j] = rgb[0]; FC[j + 1] = rgb[1]; FC[j + 2] = rgb[2]; FC[j + 3] = 0.55 + sim.ft[i] * 0.6;
      f++;
    }
    this.foodGeo.instanceCount = f; this.haloGeo.instanceCount = f;
    this.fP.addUpdateRange(0, f * 4); this.fC.addUpdateRange(0, f * 4);
    this.fP.needsUpdate = this.fC.needsUpdate = true;
    this.foodShown = f;
    // power-ups
    const live = new Set();
    for (const it of sim.items) {
      live.add(it.id);
      let m = this.itemsVis.get(it.id);
      if (!m) {
        const P2 = POWERS[it.type];
        const tex = this.iconTex[it.type] || (this.iconTex[it.type] = iconTexture(it.type, P2.color));
        m = new THREE.Group();
        const bub = new THREE.Mesh(new THREE.SphereGeometry(1.5, 20, 14), new THREE.MeshPhongMaterial({ color: P2.color, emissive: P2.color, emissiveIntensity: 0.35, transparent: true, opacity: 0.35, shininess: 120, depthWrite: false }));
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false })); sp.scale.setScalar(2.6); sp.renderOrder = 7;
        m.add(bub, sp); this.scene.add(m); this.itemsVis.set(it.id, m);
      }
      const pop = Math.min(1, it.t * 3);
      m.position.set(it.x, 2 + Math.sin(t * 2.5 + it.id) * 0.4, it.z); m.scale.setScalar(pop * (1 + Math.sin(t * 4) * 0.06));
      m.children[0].rotation.y = t;
    }
    for (const [id, m] of this.itemsVis) if (!live.has(id)) { this.scene.remove(m); m.children[0].geometry.dispose(); m.children[0].material.dispose(); m.children[1].material.dispose(); this.itemsVis.delete(id); }
    this.arena.setRing(sim.ring || 0);
  }

  // ---------- input
  bindInput() {
    const duo = !!this.mode.duo;
    const GAME = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight', 'Enter', 'NumpadEnter', 'Numpad0', 'KeyF', 'Slash']);
    this.onKD = (e) => {
      if (this.over) return;
      if (e.code === 'Escape' || e.code === 'KeyP') { e.preventDefault(); e.stopPropagation(); this.togglePause(); return; }
      if (GAME.has(e.code)) { e.preventDefault(); e.stopPropagation(); this.keys.add(e.code); if (!['Space', 'ShiftLeft', 'ShiftRight'].includes(e.code)) this.mouseOn = false; }
    };
    this.onKU = (e) => this.keys.delete(e.code);
    window.addEventListener('keydown', this.onKD, true); window.addEventListener('keyup', this.onKU, true);
    const cv = this.cv;
    const viewAt = (x, y) => {
      if (!duo) return 0;
      const R = this.root.getBoundingClientRect(), u = (x - R.left) / R.width, w = (y - R.top) / R.height;
      return this.splitV ? (u < 0.5 ? 0 : 1) : (w < 0.5 ? 0 : 1);
    };
    this.onPD = (e) => {
      if (e.pointerType === 'mouse') { this.mouse = { x: e.clientX, y: e.clientY }; this.mouseOn = true; if (e.button === 0) this.mouseDown = true; return; }
      const vi = viewAt(e.clientX, e.clientY);
      if ([...this.touches.values()].some((t) => t.v === vi)) return;
      if (this.o.touch === 'steer' && !duo) return;
      this.touches.set(e.pointerId, { v: vi, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY });
      cv.setPointerCapture?.(e.pointerId); this.drawJoy();
    };
    this.onPM = (e) => {
      if (e.pointerType === 'mouse') { this.mouse = { x: e.clientX, y: e.clientY }; this.mouseOn = true; return; }
      const t = this.touches.get(e.pointerId); if (!t) return;
      t.x = e.clientX; t.y = e.clientY;
      const dx = t.x - t.ox, dy = t.y - t.oy, d = Math.hypot(dx, dy), m = 80;
      if (d > m) { t.ox += dx * (1 - m / d); t.oy += dy * (1 - m / d); }
      this.drawJoy();
    };
    this.onPU = (e) => { if (e.pointerType === 'mouse' && e.button === 0) this.mouseDown = false; if (this.touches.delete(e.pointerId)) this.drawJoy(); };
    this.onCtx = (e) => e.preventDefault();
    cv.addEventListener('pointerdown', this.onPD); cv.addEventListener('pointermove', this.onPM); cv.addEventListener('contextmenu', this.onCtx);
    window.addEventListener('pointerup', this.onPU); window.addEventListener('pointercancel', this.onPU);
    this.onVis = () => { if (document.hidden && !this.paused && !this.over) this.togglePause(true); };
    document.addEventListener('visibilitychange', this.onVis);
    this.$('sp-pausebtn').addEventListener('click', () => this.togglePause());
    const bb = this.$('sp-boost');
    if (bb) {
      const on = (e) => { e.preventDefault(); this.boostBtn = true; bb.classList.add('on'); }, off = () => { this.boostBtn = false; bb.classList.remove('on'); };
      bb.addEventListener('pointerdown', on); bb.addEventListener('pointerup', off); bb.addEventListener('pointercancel', off); bb.addEventListener('pointerleave', off);
    }
    for (const b of this.root.querySelectorAll('.sp-steer button')) {
      const s = +b.dataset.s;
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); this.steer[s > 0 ? 1 : 0] = 1; b.classList.add('on'); });
      const off = () => { this.steer[s > 0 ? 1 : 0] = 0; b.classList.remove('on'); };
      b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off);
    }
    this.padPrev = [];
  }
  drawJoy() {
    for (const v of this.views) {
      const el = v.el.querySelector('.sp-joy'); if (!el) continue;
      const t = [...this.touches.values()].find((x) => x.v === v.i);
      if (!t) { el.classList.remove('on'); continue; }
      const R = v.el.getBoundingClientRect();
      el.classList.add('on'); el.style.left = `${t.ox - R.left}px`; el.style.top = `${t.oy - R.top}px`;
      let dx = t.x - t.ox, dy = t.y - t.oy; const d = Math.hypot(dx, dy), m = 52; if (d > m) { dx *= m / d; dy *= m / d; }
      el.firstChild.style.transform = `translate(${dx}px, ${dy}px)`;
      el.classList.toggle('max', d > 74);
    }
  }
  readInput() {
    const duo = !!this.mode.duo, K = this.keys;
    const pads = [...(navigator.getGamepads?.() || [])].filter(Boolean);
    for (const v of this.views) {
      const p = v.p, inp = p.input;
      if (p.ai) continue;
      inp.ta = null; inp.turn = 0; inp.boost = false;
      // keyboard: absolute 8-way direction (the camera never rotates)
      const map = duo ? (v.i === 0 ? ['KeyW', 'KeyS', 'KeyA', 'KeyD'] : ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) : null;
      let x = 0, z = 0;
      if (map) { if (K.has(map[0])) z--; if (K.has(map[1])) z++; if (K.has(map[2])) x--; if (K.has(map[3])) x++; }
      else { if (K.has('KeyW') || K.has('ArrowUp')) z--; if (K.has('KeyS') || K.has('ArrowDown')) z++; if (K.has('KeyA') || K.has('ArrowLeft')) x--; if (K.has('KeyD') || K.has('ArrowRight')) x++; }
      if (x || z) inp.ta = Math.atan2(z, x);
      inp.boost = duo ? (v.i === 0 ? K.has('Space') || K.has('ShiftLeft') || K.has('KeyF') : K.has('Enter') || K.has('NumpadEnter') || K.has('ShiftRight') || K.has('Numpad0') || K.has('Slash')) : K.has('Space') || K.has('ShiftLeft') || K.has('ShiftRight');
      // controller: one per player (any controller in single player)
      const pad = duo ? pads[v.i] : pads.find((q) => Math.hypot(q.axes[0] || 0, q.axes[1] || 0) > 0.25 || q.buttons.some((b) => b.pressed)) || pads[0];
      if (pad) {
        const ax = pad.axes[0] || 0, az = pad.axes[1] || 0;
        if (Math.hypot(ax, az) > 0.3) inp.ta = Math.atan2(az, ax);
        if (pad.buttons[0]?.pressed || pad.buttons[7]?.pressed || pad.buttons[5]?.pressed) inp.boost = true;
        const st = !!pad.buttons[9]?.pressed, key = pad.index; if (st && !this.padPrev[key]) this.togglePause(); this.padPrev[key] = st;
      }
      // touch: floating stick in this player's half (pushed all the way = boost in split screen)
      const t = [...this.touches.values()].find((q) => q.v === v.i);
      if (t) { const dx = t.x - t.ox, dy = t.y - t.oy, l = Math.hypot(dx, dy); if (l > 8) inp.ta = Math.atan2(dy, dx); if (duo && l > 74) inp.boost = true; }
      if (!duo) {
        if (this.boostBtn) inp.boost = true;
        if (this.steer[0] || this.steer[1]) inp.turn = this.steer[1] - this.steer[0];
        // mouse: the head chases the pointer, left button boosts
        if (this.mouseOn && this.mouse && inp.ta == null && !t) {
          const g = this.groundAt(v, this.mouse.x, this.mouse.y);
          if (g && Math.hypot(g[0] - p.x, g[1] - p.z) > p.r * 0.6) inp.ta = Math.atan2(g[1] - p.z, g[0] - p.x);
          if (this.mouseDown) inp.boost = true;
        }
      }
    }
  }
  groundAt(v, cx, cy) {
    const R = this.root.getBoundingClientRect(), r = v.rect;
    const nx = ((cx - R.left) / R.width - r.x) / r.w * 2 - 1, ny = -(((cy - R.top) / R.height - r.y) / r.h * 2 - 1);
    tv.set(nx, ny, 0.5).unproject(v.cam).sub(v.cam.position).normalize();
    if (tv.y > -0.01) return null;
    const k = -v.cam.position.y / tv.y;
    return [v.cam.position.x + tv.x * k, v.cam.position.z + tv.z * k];
  }
  togglePause(force) {
    if (this.over) return;
    this.paused = force ?? !this.paused;
    this.keys.clear(); this.mouseDown = false; this.boostBtn = false;
    this.o.onPause?.(this.paused);
  }

  // ---------- layout and cameras
  resize() {
    const w = this.root.clientWidth || innerWidth, h = this.root.clientHeight || innerHeight;
    this.W = w; this.H = h;
    this.renderer.setSize(w, h, false); this.composer?.setSize(w, h);
    const duo = this.views.length > 1;
    this.splitV = duo && w >= h; // side by side in landscape, stacked in portrait
    this.views.forEach((v, i) => {
      v.rect = !duo ? { x: 0, y: 0, w: 1, h: 1 } : this.splitV ? { x: i * 0.5, y: 0, w: 0.5, h: 1 } : { x: 0, y: i * 0.5, w: 1, h: 0.5 };
      v.cam.aspect = (w * v.rect.w) / (h * v.rect.h); v.cam.updateProjectionMatrix();
      Object.assign(v.el.style, { left: `${v.rect.x * 100}%`, top: `${v.rect.y * 100}%`, width: `${v.rect.w * 100}%`, height: `${v.rect.h * 100}%` });
    });
    this.fx.uScale.value = (h * this.renderer.getPixelRatio()) / (2 * Math.tan((50 * Math.PI) / 360)) * (duo && !this.splitV ? 0.5 : 1);
    const hud = this.root.querySelector('.sp-hud');
    hud.classList.toggle('compact', w < 760 || h < 560); hud.classList.toggle('portrait', h > w); hud.classList.toggle('splitv', !!this.splitV);
  }
  updateCamera(v, dt, snap) {
    if (this.camOverride) { this.camOverride(v.cam, v); return; }
    const p = v.p;
    const asp = v.cam.aspect, wide = asp < 1 ? Math.pow(1 / asp, 0.55) : 1;
    const H = (24 + p.r * 9 + (p.boosting ? 3 : 0)) * wide * (this.views.length > 1 && asp > 1.6 ? 0.9 : 1);
    const k = snap ? 1 : 1 - Math.exp(-dt * 5);
    if (p.alive) { v.x += (p.x + Math.cos(p.a) * p.r * 2 - v.x) * k; v.z += (p.z + Math.sin(p.a) * p.r * 2 - v.z) * k; }
    v.h = snap ? H : v.h + (H - v.h) * (1 - Math.exp(-dt * 1.6));
    let sx = 0, sz = 0;
    if (v.shake > 0) { v.shake = Math.max(0, v.shake - dt * 2); const a = v.shake * v.shake * 1.2, tt = this.clock * 45; sx = Math.sin(tt * 1.1) * a; sz = Math.cos(tt * 1.3) * a; }
    v.cam.position.set(v.x + sx, v.h, v.z + v.h * 0.48 + sz);
    v.cam.lookAt(v.x + sx * 0.5, 0, v.z + sz * 0.5);
  }

  // ---------- frame
  loop(now) {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.max(0, Math.min(0.05, (now - this.last) / 1000)); this.last = Math.max(this.last, now);
    if (this.hold) return; // tests drive step() / render() themselves
    if (!this.paused) this.step(dt);
    else this.readInput();
    this.render();
    if (!this.paused) this.guard?.tick();
  }
  // one deterministic step of everything but drawing (tests drive this directly)
  step(dt) {
    this.clock += dt; this.uTime.value = this.clock; this.arena.uTime.value = this.clock;
    if (!this.over) {
      this.readInput();
      if (this.count > 0) {
        const b = Math.ceil(this.count); this.count -= dt; const a = Math.ceil(this.count);
        const el = this.$('sp-count');
        if (a !== b || !el.textContent) { el.textContent = a > 0 ? a : 'Via!'; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); this.snd.beep(a <= 0); }
        if (this.count <= 0) setTimeout(() => { if (el) el.textContent = ''; }, 700);
      } else {
        for (const v of this.views) { if (v.p.boosting && !v.wasB) this.snd.whoosh(); v.wasB = v.p.boosting; }
        this.sim.step(dt);
      }
      this.events();
    }
    this.fx.update(dt);
    for (const v of this.views) this.updateCamera(v, dt);
    this.syncVisuals(dt);
    this.hudT = (this.hudT || 0) - dt;
    if (this.hudT <= 0) { this.hudT = 0.2; this.updateHud(); }
    this.updateLabels();
  }
  render() {
    const r = this.renderer;
    if (this.views.length === 1) {
      if (this.composer) this.composer.render(); else r.render(this.scene, this.views[0].cam);
      return;
    }
    r.setScissorTest(true);
    for (const v of this.views) {
      const x = v.rect.x * this.W, w = v.rect.w * this.W, h = v.rect.h * this.H, y = (1 - v.rect.y - v.rect.h) * this.H;
      r.setViewport(x, y, w, h); r.setScissor(x, y, w, h); r.render(this.scene, v.cam);
    }
    r.setScissorTest(false);
  }

  // ---------- simulation events → sound, particles, HUD
  events() {
    const sim = this.sim, E = sim.events;
    const near = (x, z) => this.views.some((v) => (v.x - x) ** 2 + (v.z - z) ** 2 < (v.h * 1.6) ** 2);
    for (const e of E) {
      if (e.t === 'eat') {
        const s = sim.snakes[e.s];
        if (s.player >= 0) { this.snd.pop(); }
        if (near(e.x, e.z) && Math.random() < 0.5) { const c = hexRGB(e.c); for (let i = 0; i < 3; i++) this.fx.emit(e.x, 0.6, e.z, (Math.random() - 0.5) * 4, 3 + Math.random() * 3, (Math.random() - 0.5) * 4, c[0] + 0.3, c[1] + 0.3, c[2] + 0.3, 0.45, 0.45); }
      } else if (e.t === 'die') {
        const s = sim.snakes[e.s], by = e.by >= 0 ? sim.snakes[e.by] : null;
        if (near(e.x, e.z)) {
          const vis = this.vis[s.id], cols = vis?.cols || [1, 1, 1], q = [0, 0];
          for (let i = 0; i < 40; i++) { s.sample((i / 40) * s.L, q); const a = Math.random() * 6.28, sp = 3 + Math.random() * 6; this.fx.emit(q[0], s.r, q[1], Math.cos(a) * sp, 4 + Math.random() * 6, Math.sin(a) * sp, cols[(i % 6) * 3] + 0.3, cols[(i % 6) * 3 + 1] + 0.3, cols[(i % 6) * 3 + 2] + 0.3, 0.9 + s.r * 0.3, 0.9); }
          if (s.player < 0 && (!by || by.player < 0)) this.snd.far();
        }
        if (s.player >= 0) {
          const v = this.views[s.player]; v.shake = 1.2;
          this.snd.lost();
          const why = e.why === 'wall' ? 'Hai toccato il bordo dell’arena!' : e.why === 'ring' ? 'Sei rimasto fuori dalla zona sicura!' : e.why === 'head' ? `Testata persa contro ${by?.name}!` : `Ti sei schiantato contro ${by?.name}!`;
          this.deadMsg(v, why);
        }
        if (by && by.player >= 0 && by !== s) { this.snd.kill(); this.views[by.player].shake = 0.6; this.pop(this.views[by.player], `${s.name} K.O.!`, true); }
        this.addFeed(by ? `<b style="color:#${by.color.toString(16).padStart(6, '0')}">${esc(by.name)}</b> ✕ ${esc(s.name)}` : `${esc(s.name)} ${e.why === 'ring' ? 'travolto dalla tempesta' : 'contro il muro'}`);
      } else if (e.t === 'power') {
        const s = sim.snakes[e.s];
        if (s.player >= 0) { this.snd.power(); const P = POWERS[e.type]; this.pop(this.views[s.player], `${P.name}! ${P.desc}`, false, P.color); }
        if (near(e.x, e.z)) { tc.set(POWERS[e.type].color); for (let i = 0; i < 30; i++) { const a = Math.random() * 6.28; this.fx.emit(e.x, 2, e.z, Math.cos(a) * 8, 3 + Math.random() * 4, Math.sin(a) * 8, tc.r, tc.g, tc.b, 0.8, 0.7); } }
      } else if (e.t === 'mission') {
        this.snd.coin(); this.toast(`Missione: ${e.m.text} · +${e.m.coins}`); this.renderMissions();
      } else if (e.t === 'spawn') {
        const s = sim.snakes[e.s];
        if (s.player >= 0) { const v = this.views[s.player]; v.x = s.x; v.z = s.z; v.el.querySelector('.sp-dead').classList.remove('on'); }
      } else if (e.t === 'end') this.finish();
    }
    E.length = 0;
  }
  deadMsg(v, why) {
    const el = v.el.querySelector('.sp-dead');
    const again = this.sim.mode.respawn;
    el.innerHTML = `<b>${esc(why)}</b>${again ? '<span>Rinasci tra un attimo…</span>' : ''}`;
    el.classList.add('on');
  }
  pop(v, text, big, color) {
    const box = v?.el.querySelector('.sp-pops'); if (!box) return;
    const el = document.createElement('div'); el.className = 'sp-pop' + (big ? ' big' : ''); if (color) el.style.color = color; el.textContent = text;
    box.appendChild(el); setTimeout(() => el.remove(), 1300);
    while (box.children.length > 3) box.firstChild.remove();
  }
  toast(text) {
    const el = this.$('sp-toast'); if (!el) return;
    el.textContent = text; el.classList.add('on'); clearTimeout(this.toastT); this.toastT = setTimeout(() => el.classList.remove('on'), 2200);
  }
  addFeed(html) {
    this.feed.unshift(html); this.feed.length = Math.min(this.feed.length, 4);
    const el = this.$('sp-feed'); if (el) el.innerHTML = this.feed.map((h) => `<div>${h}</div>`).join('');
  }
  renderMissions() {
    const el = this.$('sp-miss'); if (!el) return;
    el.innerHTML = this.sim.missions.map((m) => `<li class="${m.done ? 'done' : ''}"><i>${m.done ? '✓' : ''}</i><span>${esc(m.text)}</span></li>`).join('');
  }
  updateHud() {
    const sim = this.sim;
    const tm = this.$('sp-timer');
    if (sim.mode.time) { const s = Math.ceil(sim.left); tm.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; tm.classList.toggle('hot', s <= 10 && this.count <= 0); if (s <= 5 && s > 0 && s !== this.lastTick && this.count <= 0) { this.lastTick = s; this.snd.tick(s); } }
    else if (sim.mode.ring) { const alive = sim.snakes.filter((s) => s.alive).length; tm.textContent = `${alive} in gara`; tm.classList.toggle('hot', sim.ringT < sim.ring - 0.5); }
    else { const s = Math.floor(sim.time); tm.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
    const rk = sim.ranking();
    for (const v of this.views) {
      const p = v.p, me = v.el.querySelector('.sp-me');
      me.querySelector('.sp-len b').textContent = p.alive ? fmt(p.m) : '—';
      me.querySelector('.sp-rank').innerHTML = p.alive ? `<b>${rk.indexOf(p) + 1}°</b> su ${sim.snakes.length}${p.kills ? ` · ${p.kills} K.O.` : ''}` : '';
      me.querySelector('.sp-pw').innerHTML = p.power ? `<span style="--c:${POWERS[p.power.type].color}"><b>${POWER_ICON[p.power.type]}</b>${esc(POWERS[p.power.type].name)} <em>${Math.ceil(p.power.t)}s</em><i style="width:${(p.power.t / p.power.dur) * 100}%"></i></span>` : '';
      me.classList.toggle('boost', p.boosting);
    }
    const bd = this.$('sp-board');
    if (bd) {
      const top = rk.slice(0, this.root.querySelector('.sp-hud').classList.contains('compact') ? 4 : 6);
      const p = this.views[0].p;
      if (!top.includes(p)) top.push(p);
      bd.innerHTML = top.map((s) => `<li class="${s.player >= 0 ? 'me' : ''} ${s.alive ? '' : 'out'}" style="--c:#${s.color.toString(16).padStart(6, '0')}"><span class="n">${rk.indexOf(s) + 1}</span><i></i><b>${esc(s.name)}</b><span class="p">${s.alive ? fmt(s.m) : sim.mode.ring ? 'fuori' : '…'}</span></li>`).join('');
    }
    this.drawMini();
    if (this.sim.missions.some((m) => !m.done && m.have !== m._shown)) { for (const m of this.sim.missions) m._shown = m.have; }
  }
  drawMini() {
    const cv = this.$('sp-mini'); if (!cv) return;
    const g = cv.getContext('2d'), S = cv.width, sim = this.sim, k = (S / 2 - 6) / sim.R;
    g.clearRect(0, 0, S, S);
    g.fillStyle = 'rgba(8,10,20,.55)'; g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 2, 0, 7); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 2; g.beginPath(); g.arc(S / 2, S / 2, sim.R * k, 0, 7); g.stroke();
    if (sim.ring) { g.strokeStyle = '#ff4d8d'; g.lineWidth = 3; g.beginPath(); g.arc(S / 2, S / 2, sim.ring * k, 0, 7); g.stroke(); }
    const q = [0, 0];
    for (const s of sim.snakes) {
      if (!s.alive) continue;
      g.strokeStyle = '#' + s.color.toString(16).padStart(6, '0'); g.lineWidth = Math.max(2, s.r * k * 2.2); g.lineCap = 'round'; g.beginPath();
      for (let i = 0; i <= 8; i++) { s.sample((i / 8) * s.L, q); const x = S / 2 + q[0] * k, y = S / 2 + q[1] * k; i ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke();
      if (s.player >= 0) { g.fillStyle = '#fff'; g.beginPath(); g.arc(S / 2 + s.x * k, S / 2 + s.z * k, 5, 0, 7); g.fill(); }
    }
    g.fillStyle = '#ffe14d'; for (const it of sim.items) g.fillRect(S / 2 + it.x * k - 2, S / 2 + it.z * k - 2, 4, 4);
  }
  updateLabels() {
    const sim = this.sim;
    for (const v of this.views) {
      const box = v.el.querySelector('.sp-labels'), w = v.el.clientWidth, h = v.el.clientHeight;
      let n = 0;
      const lead = sim.ranking()[0];
      for (const s of sim.snakes) {
        if (!s.alive || n >= 12) continue;
        if ((s.x - v.x) ** 2 + (s.z - v.z) ** 2 > (v.h * 1.4) ** 2) continue;
        tv.set(s.x, s.r * 1.6, s.z - s.r * 1.5).project(v.cam);
        if (tv.z > 1 || Math.abs(tv.x) > 1.05 || Math.abs(tv.y) > 1.05) continue;
        let el = v.labels[n]; if (!el) { el = v.labels[n] = document.createElement('div'); el.className = 'sp-lab'; box.appendChild(el); }
        const txt = (s === lead ? '♛ ' : '') + (s.player >= 0 ? (this.views.length > 1 ? `G${s.player + 1}` : 'Tu') : s.name);
        if (el._t !== txt) { el.textContent = txt; el._t = txt; }
        el.classList.toggle('me', s.player >= 0);
        el.style.transform = `translate(${((tv.x + 1) / 2) * w}px, ${((1 - tv.y) / 2) * h}px) translate(-50%, -100%)`; el.style.display = '';
        n++;
      }
      for (let i = n; i < v.labels.length; i++) v.labels[i].style.display = 'none';
    }
  }

  finish() {
    if (this.over) return;
    this.over = true;
    const sim = this.sim, R = sim.result, p = R.players[0];
    const r = {
      mode: sim.modeId, arena: this.o.arena, diff: this.o.diff, daily: this.o.daily?.key || null, why: R.why,
      pos: p.pos, of: R.of, len: p.len, best: p.best, kills: p.kills, eaten: p.eaten, deaths: p.deaths, time: Math.floor(sim.modeId === 'sopravvivenza' ? sim.time : p.aliveT),
      missions: sim.missions.map((m) => ({ ...m })), ranking: R.ranking.slice(0, 12), players: R.players,
    };
    r.stars = matchStars(r); r.coins = matchCoins(r);
    const win = sim.modeId === 'sopravvivenza' ? r.stars >= 2 : p.pos === 1;
    this.snd.end(win);
    this.o.onEnd?.(r);
  }
  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKD, true); window.removeEventListener('keyup', this.onKU, true);
    window.removeEventListener('pointerup', this.onPU); window.removeEventListener('pointercancel', this.onPU);
    document.removeEventListener('visibilitychange', this.onVis);
    this.ro?.disconnect();
    this.scene?.traverse((o) => { o.geometry?.dispose?.(); const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach((x) => { x.map?.dispose?.(); x.dispose?.(); }); });
    this.composer?.dispose?.();
    this.renderer?.dispose(); this.renderer?.forceContextLoss?.();
    this.root.innerHTML = '';
  }
}
