// Territorio — the live match: three.js board, vehicles, power-ups and effects around the pure
// simulation in sim.js, plus HUD, minimap, split-screen / shared-screen views for local multiplayer.
// The whole board is ONE plane drawn by a shader that reads the ownership grid from a small data
// texture (land, trail, capture time): thousands of cells cost one draw call and one tiny upload when
// something changes. Obstacles are instanced; there is no shadow map (blob shadows instead).
import * as THREE from 'three';
import { pixelRatio } from '../ui/quality.js';
import { FrameGuard } from '../ui/perfguard.js';
import { sfx as uisfx, vsfx } from '../ui/audio.js';
import { Sim, OBST, TEAM0, POWERS, rng } from './sim.js';
import { MODES, MAPS, buildObstacles, VEHICLES, TRAILS, makeRivals, pickMissions, missionValue, TEAM_COLORS, TEAM_NAMES, starsFor, matchCoins } from './meta.js';
import { TerrInput } from './input.js';

const PW_ICON = { turbo: '⚡', scudo: '🛡', gelo: '❄' };
const PW_TEXT = { turbo: 'Turbo! Più veloce per 5 secondi', scudo: 'Scudo! Nessuno può tagliarti', gelo: 'Gelo! Rivali congelati' };
const tmpV = new THREE.Vector3(), tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3(), tmpC = new THREE.Color();
const fmtT = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const hex = (c) => '#' + new THREE.Color(c).getHexString();

// ---------- board shader
const BOARD_VS = `
varying vec2 vG; varying vec3 vW;
uniform vec2 uSize;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz; vG = vec2(w.x + uSize.x * 0.5, w.z + uSize.y * 0.5);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const BOARD_FS = `
precision highp float;
uniform sampler2D uGrid; uniform sampler2D uStamp; uniform sampler2D uPal;
uniform vec2 uSize; uniform float uTime; uniform vec3 uA; uniform vec3 uB; uniform vec3 uLine; uniform vec3 uWater; uniform float uWaterOn; uniform float uNight;
varying vec2 vG; varying vec3 vW;
vec4 cellAt(ivec2 c) { if (c.x < 0 || c.y < 0 || c.x >= int(uSize.x) || c.y >= int(uSize.y)) return vec4(0.0); return texelFetch(uGrid, c, 0); }
int idOf(float v) { return int(v * 255.0 + 0.5); }
vec3 pal(int id) { return texelFetch(uPal, ivec2(id, 0), 0).rgb; }
vec4 sty(int id) { return texelFetch(uPal, ivec2(id, 1), 0); }
vec3 hue(float h) { return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
void main() {
  if (vG.x < 0.0 || vG.y < 0.0 || vG.x >= uSize.x || vG.y >= uSize.y) discard;
  ivec2 ci = ivec2(floor(vG)); vec2 f = fract(vG);
  vec4 g = texelFetch(uGrid, ci, 0);
  int land = idOf(g.r), tr = idOf(g.g);
  float chk = mod(float(ci.x + ci.y), 2.0);
  vec3 col = mix(uA, uB, chk);
  // soft grid lines on the neutral ground
  vec2 e = min(f, 1.0 - f); float gl = 1.0 - smoothstep(0.0, 0.06, min(e.x, e.y));
  col = mix(col, uLine, gl * 0.5);
  int nN = idOf(cellAt(ci + ivec2(0, -1)).r), nS = idOf(cellAt(ci + ivec2(0, 1)).r), nW = idOf(cellAt(ci + ivec2(-1, 0)).r), nE = idOf(cellAt(ci + ivec2(1, 0)).r);
  if (land == 255) {
    if (uWaterOn > 0.5) {
      float w = sin(vG.x * 1.7 + uTime * 1.6) * sin(vG.y * 1.3 - uTime * 1.2);
      float wave = smoothstep(0.82, 0.97, sin(vG.y * 2.4 + sin(vG.x * 0.9 + uTime) * 1.4 - uTime * 0.8));
      col = uWater * (0.8 + 0.12 * w) + vec3(0.55, 0.75, 0.8) * wave * 0.35;
      if (nN != 255) col *= 0.72 + 0.28 * smoothstep(0.0, 0.5, f.y); // the bank casts a shade on the water
      float shore = 0.0;
      if (nN != 255) shore = max(shore, smoothstep(0.25, 0.0, f.y));
      if (nS != 255) shore = max(shore, smoothstep(0.75, 1.0, f.y));
      if (nW != 255) shore = max(shore, smoothstep(0.25, 0.0, f.x));
      if (nE != 255) shore = max(shore, smoothstep(0.75, 1.0, f.x));
      col = mix(col, vec3(1.0), shore * 0.55);
    } else col *= 0.62;
  } else if (land > 0) {
    vec3 lc = pal(land);
    col = lc * (0.97 + 0.05 * chk) + 0.03;
    // raised tiles: bright rim on the far edges, a darker side facing the camera, shadow below
    float rim = 0.0;
    if (nN != land) rim = max(rim, smoothstep(0.14, 0.0, f.y));
    if (nW != land) rim = max(rim, smoothstep(0.12, 0.0, f.x));
    if (nE != land) rim = max(rim, smoothstep(0.88, 1.0, f.x));
    col = mix(col, mix(lc, vec3(1.0), 0.5), rim * 0.75);
    if (nS != land) col = mix(col, lc * 0.6, smoothstep(0.66, 0.72, f.y));
    float age = uTime - texelFetch(uStamp, ci, 0).r;
    if (age >= 0.0) col += vec3(1.0) * 0.6 * exp(-age * 3.5) * (0.6 + 0.4 * sin(float(ci.x + ci.y) * 0.7 - age * 12.0));
  } else {
    if (nN > 0 && nN < 255) col *= 1.0 - 0.28 * smoothstep(0.45, 0.0, f.y);
    if (nW > 0 && nW < 255) col *= 1.0 - 0.14 * smoothstep(0.3, 0.0, f.x);
    float age = uTime - texelFetch(uStamp, ci, 0).r;
    if (age >= 0.0 && age < 1.0) col = mix(col, vec3(0.1), 0.25 * (1.0 - age));
  }
  if (tr > 0) {
    vec3 tc = pal(tr); vec4 s = sty(tr);
    int style = idOf(s.r); int tl = idOf(s.b);
    float w = 0.33;
    vec2 q = abs(f - 0.5);
    bool cN = idOf(cellAt(ci + ivec2(0, -1)).g) == tr || nN == tl, cS = idOf(cellAt(ci + ivec2(0, 1)).g) == tr || nS == tl;
    bool cW = idOf(cellAt(ci + ivec2(-1, 0)).g) == tr || nW == tl, cE = idOf(cellAt(ci + ivec2(1, 0)).g) == tr || nE == tl;
    float d = length(f - 0.5);
    if (cN && f.y < 0.5) d = min(d, q.x); if (cS && f.y >= 0.5) d = min(d, q.x);
    if (cW && f.x < 0.5) d = min(d, q.y); if (cE && f.x >= 0.5) d = min(d, q.y);
    float m = 1.0 - smoothstep(w - 0.05, w, d);
    vec3 c = mix(tc, vec3(1.0), 0.28);
    float k = float(ci.x + ci.y);
    if (style == 1) { m = max(1.0 - smoothstep(0.3, 0.36, length(f - 0.5)), (1.0 - smoothstep(0.09, 0.13, d)) * 0.9); c = mix(tc, vec3(1.0), 0.15); }
    else if (style == 2) { c = mod(k, 2.0) < 1.0 ? mix(tc, vec3(1.0), 0.75) : tc * 0.75; }
    else if (style == 3) { float glow = 1.0 - smoothstep(0.0, 0.5, d); c = mix(tc, vec3(1.0), 0.55) * 1.25; col = mix(col, tc, glow * 0.45); }
    else if (style == 4) { c = hue(fract(k * 0.045 - uTime * 0.35)) * 0.85 + 0.15; }
    c *= 1.0 - 0.18 * smoothstep(w - 0.13, w - 0.04, d); // darker outline
    if (s.g > 0.5) c = mix(c, vec3(0.75, 0.9, 1.0), 0.45 + 0.35 * sin(uTime * 14.0 + k));
    col = mix(col, c, m);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

// ---------- vehicles: small toys from primitives, facing +x
const GEO = {};
const geo = (k, f) => (GEO[k] ||= f());
function lam(color, extra) { return new THREE.MeshLambertMaterial({ color, ...extra }); }
function buildVehicle(kind, color) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const c = new THREE.Color(color), dark = c.clone().multiplyScalar(0.6), light = c.clone().lerp(new THREE.Color('#fff'), 0.35);
  const M = lam(c), Md = lam(dark), Ml = lam(light), W = lam('#ffffff'), K = lam('#1b1b24');
  const eyes = (x, y, z, s = 1) => {
    for (const side of [-1, 1]) {
      const e = new THREE.Mesh(geo('eye', () => new THREE.SphereGeometry(0.13, 12, 8)), W); e.position.set(x, y, side * z); e.scale.setScalar(s); body.add(e);
      const p = new THREE.Mesh(geo('pup', () => new THREE.SphereGeometry(0.07, 10, 6)), K); p.position.set(x + 0.09 * s, y, side * z); p.scale.setScalar(s); body.add(p);
    }
  };
  const wheel = (x, z, r = 0.16) => { const w = new THREE.Mesh(geo('wh', () => new THREE.CylinderGeometry(1, 1, 0.12, 14).rotateX(Math.PI / 2)), K); w.scale.set(r, r, 1); w.position.set(x, r, z); body.add(w); return w; };
  if (kind === 'ape') {
    const cab = new THREE.Mesh(geo('apecab', () => new THREE.BoxGeometry(0.42, 0.5, 0.6)), M); cab.position.set(0.22, 0.42, 0); body.add(cab);
    const bed = new THREE.Mesh(geo('apebed', () => new THREE.BoxGeometry(0.55, 0.2, 0.66)), Md); bed.position.set(-0.28, 0.3, 0); body.add(bed);
    const win = new THREE.Mesh(geo('apewin', () => new THREE.BoxGeometry(0.05, 0.22, 0.48)), lam('#bfe8ff')); win.position.set(0.44, 0.52, 0); body.add(win);
    wheel(0.32, 0); wheel(-0.32, 0.3); wheel(-0.32, -0.3);
    eyes(0.45, 0.32, 0.17, 0.8);
  } else if (kind === 'ufo') {
    const disc = new THREE.Mesh(geo('ufo', () => new THREE.SphereGeometry(0.5, 20, 10).scale(1, 0.32, 1)), M); disc.position.y = 0.4; body.add(disc);
    const ring = new THREE.Mesh(geo('ufor', () => new THREE.TorusGeometry(0.5, 0.05, 6, 24).rotateX(Math.PI / 2)), Ml); ring.position.y = 0.4; body.add(ring);
    const dome = new THREE.Mesh(geo('ufod', () => new THREE.SphereGeometry(0.26, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2)), lam('#cfefff', { transparent: true, opacity: 0.8 })); dome.position.y = 0.5; body.add(dome);
    eyes(0.12, 0.62, 0.09, 0.7);
    g.userData.hover = true;
  } else if (kind === 'trottola') {
    const top = new THREE.Mesh(geo('trt', () => new THREE.ConeGeometry(0.42, 0.45, 18)), M); top.position.y = 0.6; body.add(top);
    const bot = new THREE.Mesh(geo('trb', () => new THREE.ConeGeometry(0.42, 0.42, 18).rotateX(Math.PI)), Ml); bot.position.y = 0.17; body.add(bot);
    const band = new THREE.Mesh(geo('trbd', () => new THREE.CylinderGeometry(0.44, 0.44, 0.08, 18)), Md); band.position.y = 0.39; body.add(band);
    eyes(0.3, 0.52, 0.12, 0.8);
    g.userData.spin = top;
  } else if (kind === 'razzo') {
    const tube = new THREE.Mesh(geo('rzt', () => new THREE.CylinderGeometry(0.22, 0.22, 0.7, 14).rotateZ(Math.PI / 2)), M); tube.position.y = 0.36; body.add(tube);
    const nose = new THREE.Mesh(geo('rzn', () => new THREE.ConeGeometry(0.22, 0.32, 14).rotateZ(-Math.PI / 2)), Ml); nose.position.set(0.5, 0.36, 0); body.add(nose);
    for (const s of [-1, 1]) { const fin = new THREE.Mesh(geo('rzf', () => new THREE.BoxGeometry(0.25, 0.04, 0.22)), Md); fin.position.set(-0.28, 0.3, s * 0.24); body.add(fin); }
    const fl = new THREE.Mesh(geo('rzfl', () => new THREE.ConeGeometry(0.15, 0.4, 10).rotateZ(Math.PI / 2)), new THREE.MeshBasicMaterial({ color: '#ffb02e' })); fl.position.set(-0.55, 0.36, 0); body.add(fl);
    g.userData.flame = fl;
    eyes(0.32, 0.48, 0.11, 0.7);
  } else if (kind === 'papera') {
    const b = new THREE.Mesh(geo('ppb', () => new THREE.SphereGeometry(0.4, 18, 12).scale(1.15, 0.8, 1)), M); b.position.y = 0.34; body.add(b);
    const h = new THREE.Mesh(geo('pph', () => new THREE.SphereGeometry(0.24, 16, 10)), M); h.position.set(0.3, 0.72, 0); body.add(h);
    const beak = new THREE.Mesh(geo('ppk', () => new THREE.ConeGeometry(0.1, 0.24, 10).rotateZ(-Math.PI / 2)), lam('#ff9f1c')); beak.position.set(0.56, 0.68, 0); body.add(beak);
    const tail = new THREE.Mesh(geo('ppt', () => new THREE.ConeGeometry(0.12, 0.25, 8).rotateZ(Math.PI / 2 + 0.6)), M); tail.position.set(-0.46, 0.48, 0); body.add(tail);
    eyes(0.43, 0.8, 0.12, 0.6);
  } else { // cubo
    const b = new THREE.Mesh(geo('cube', () => new THREE.BoxGeometry(0.8, 0.62, 0.8)), M); b.position.y = 0.4; body.add(b);
    const cap = new THREE.Mesh(geo('cubec', () => new THREE.BoxGeometry(0.84, 0.1, 0.84)), Ml); cap.position.y = 0.74; body.add(cap);
    const base = new THREE.Mesh(geo('cubeb', () => new THREE.BoxGeometry(0.86, 0.1, 0.86)), Md); base.position.y = 0.1; body.add(base);
    eyes(0.4, 0.5, 0.17);
  }
  g.userData.body = body;
  return g;
}

function blobTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(0.6, 'rgba(0,0,0,.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
}
function labelSprite(text, color) {
  const cv = document.createElement('canvas'), g = cv.getContext('2d'); const fs = 40;
  g.font = `800 ${fs}px "Barlow Condensed", "Exo 2", sans-serif`;
  const w = Math.ceil(g.measureText(text).width) + 30; cv.width = w; cv.height = 60;
  g.font = `800 ${fs}px "Barlow Condensed", "Exo 2", sans-serif`;
  g.fillStyle = 'rgba(10,12,20,.55)'; g.beginPath(); g.roundRect?.(0, 6, w, 48, 24); if (!g.roundRect) g.rect(0, 6, w, 48); g.fill();
  g.fillStyle = color; g.beginPath(); g.arc(20, 30, 9, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fff'; g.textBaseline = 'middle'; g.fillText(text, 34, 32);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.scale.set(w / 60 * 0.62, 0.62, 1); s.renderOrder = 10; s.center.set(0.5, 0);
  return s;
}

export class TerritorioGame {
  // opts: { mode, map, diff, daily, seed, humans: [{ name, color, vehicle, trail, control }], view, bots,
  //         tier, volume, onPause, onEnd }
  constructor(root, opts) {
    this.root = root;
    this.o = { mode: 'classica', map: 'prato', diff: 'normale', humans: [{ name: 'Tu', color: '#ff4d6d', vehicle: 'cubo', trail: 'liscia', control: 'all' }], view: 'diviso', tier: 'high', volume: 0.5, ...opts };
    this.mode = MODES[this.o.mode] || MODES.classica;
    this.mapCfg = MAPS[this.o.map] || MAPS.prato;
    this.seed = this.o.daily?.seed ?? this.o.seed ?? ((Date.now() & 0xffffff) + 11);
    this.rand = rng(this.seed);
    this.mp = this.o.humans.length > 1;
    this.paused = false; this.over = false; this.count = 3; this.clock = 0; this.hold = false;
    this.fx = []; this.pops = [];
    this.stats = this.o.humans.map(() => ({ bestPct: 0, bestLife: 0, life: 0 }));
  }

  // ---------- setup
  buildSim() {
    const o = this.o, M = this.mode, humans = o.humans;
    const teams = !!M.teams;
    let nBots = this.mp ? Math.max(0, o.bots ?? 3) : M.rivals;
    if (teams) { const tot = Math.max(4, humans.length + nBots); nBots = tot + (tot % 2) - humans.length; }
    const total = humans.length + nBots;
    const size = Math.round(M.size * Math.sqrt(Math.max(1, total) / 8) * 0.25 + M.size * 0.75);
    const W = size, H = size;
    const players = humans.map((h, i) => ({ name: h.name, human: true, slot: i, color: h.color, team: teams ? (this.mp ? i % 2 : 0) : -1 }));
    const rivals = makeRivals(this.rand, nBots, humans.map((h) => h.color));
    rivals.forEach((r, i) => {
      let team = -1;
      if (teams) { const t0 = players.filter((p) => p.team === 0).length, t1 = players.filter((p) => p.team === 1).length; team = t0 <= t1 ? 0 : 1; }
      players.push({ ...r, team });
    });
    if (teams) {
      // team mates share a hue: shades of the team colour
      const k = [0, 0];
      for (const p of players) { const base = new THREE.Color(TEAM_COLORS[p.team]); const n = k[p.team]++; p.color = hex(base.offsetHSL((n % 2 ? 0.03 : -0.02) * n, 0, (n % 3 - 1) * 0.08)); if (p.human && !this.mp) p.color = hex(TEAM_COLORS[0]); }
    }
    this.sim = new Sim({ w: W, h: H, seed: this.seed, obstacles: buildObstacles(o.map, W, H, this.seed), players, teams, respawn: M.respawn, time: M.time, ai: o.daily ? 'normale' : o.diff, target: this.mp ? (M.target || 0) * 0.9 : M.target, lastStanding: M.lastStanding });
    this.W = W; this.H = H;
    this.humans = this.sim.players.filter((p) => p.human);
    this.me = this.humans[0];
    this.humans.forEach((p, i) => { p.vehicle = humans[i].vehicle; p.trailStyle = TRAILS.find((t) => t.id === humans[i].trail)?.style || 0; });
    const vk = VEHICLES.map((v) => v.id);
    for (const p of this.sim.players) if (!p.human) { p.vehicle = vk[(this.rand() * vk.length) | 0]; p.trailStyle = this.rand() < 0.3 ? 1 + ((this.rand() * 3) | 0) : 0; }
    this.missions = this.mp ? null : pickMissions(this.rand, o.mode);
  }

  async start() {
    const o = this.o, root = this.root;
    this.buildSim();
    root.innerHTML = `<canvas class="tr-cv"></canvas><div class="tr-hud ${this.mp ? 'mp' : ''}">
      <div class="tr-top"><div class="tr-timer" id="tr-timer"></div><div class="tr-mode">${o.daily ? 'Arena del giorno · ' : ''}${esc(this.mode.name)} · ${esc(this.mapCfg.name)}</div></div>
      ${this.mp ? '' : `<div class="tr-left"><ol class="tr-board" id="tr-board"></ol><ul class="tr-miss" id="tr-miss"></ul></div>
      <div class="tr-me" id="tr-me"><div class="tr-me-k">Il tuo terreno</div><div class="tr-me-v" id="tr-pct">0%</div><div class="tr-me-s" id="tr-sub"></div></div>
      <canvas class="tr-mini" id="tr-mini" width="${this.W}" height="${this.H}"></canvas>`}
      <div class="tr-views" id="tr-views"></div>
      <div class="tr-pw" id="tr-pw"></div>
      <button class="tr-pausebtn" id="tr-pausebtn" aria-label="Pausa">II</button>
      <div class="tr-pops" id="tr-pops"></div><div class="tr-toast" id="tr-toast"></div><div class="tr-count" id="tr-count"></div>
      <div class="tr-sticks" id="tr-sticks"></div>
    </div>`;
    this.cv = root.querySelector('.tr-cv');
    this.$ = (id) => root.querySelector('#' + id);
    const tier = this.tier = o.tier;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas: this.cv, antialias: tier !== 'low', powerPreference: 'high-performance' });
    r.setPixelRatio(pixelRatio(tier === 'high' ? 1.75 : 1.5));
    r.outputColorSpace = THREE.SRGBColorSpace;
    const setPR = (pr) => { if (Math.abs(r.getPixelRatio() - pr) < 0.01) return false; r.setPixelRatio(pr); this.resize(); };
    this.guard = new FrameGuard([
      { fps: 45, run: () => setPR(1) },
      { fps: 34, run: () => { if (!this.decor) return false; this.decor.visible = false; this.labelsOff = true; } },
      { fps: 28, run: () => setPR(0.75) },
    ]);
    this.buildScene();
    this.sfxOn = o.volume > 0;
    const slots = this.mp ? o.humans.map((h) => h.control || 'touch') : ['all'];
    this.input = new TerrInput(this.cv, { slots, onPause: () => this.togglePause() });
    this.input.onStick = () => this.drawSticks();
    this.$('tr-pausebtn').addEventListener('click', () => this.togglePause());
    this.onVis = () => { if (document.hidden && !this.paused && !this.over) this.togglePause(true); };
    document.addEventListener('visibilitychange', this.onVis);
    this.renderMissions();
    this.resize();
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(root);
    this.views.forEach((v) => this.updateCamera(v, 1, true));
    this.last = performance.now();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
    document.activeElement?.blur?.();
  }

  buildScene() {
    const C = this.mapCfg, W = this.W, H = this.H, sim = this.sim;
    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color(C.sky);
    scene.fog = new THREE.Fog(C.fog, 60, 220);
    scene.add(new THREE.HemisphereLight(C.night ? '#8a90ff' : '#ffffff', C.night ? '#202040' : '#7a8a6a', C.night ? 1.1 : 1.5));
    const sun = new THREE.DirectionalLight('#fff4e0', C.night ? 0.6 : 1.6); sun.position.set(-30, 60, 40); scene.add(sun);
    // grid data textures
    this.gridData = new Uint8Array(W * H * 4);
    this.gridTex = new THREE.DataTexture(this.gridData, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.gridTex.magFilter = this.gridTex.minFilter = THREE.NearestFilter; this.gridTex.generateMipmaps = false; this.gridTex.flipY = false;
    this.stampTex = new THREE.DataTexture(sim.stamp, W, H, THREE.RedFormat, THREE.FloatType);
    this.stampTex.magFilter = this.stampTex.minFilter = THREE.NearestFilter; this.stampTex.generateMipmaps = false;
    this.palData = new Uint8Array(256 * 2 * 4);
    this.palTex = new THREE.DataTexture(this.palData, 256, 2, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.palTex.magFilter = this.palTex.minFilter = THREE.NearestFilter; this.palTex.generateMipmaps = false;
    const setPal = (id, color) => { tmpC.set(color); this.palData[id * 4] = Math.round(tmpC.r * 255); this.palData[id * 4 + 1] = Math.round(tmpC.g * 255); this.palData[id * 4 + 2] = Math.round(tmpC.b * 255); this.palData[id * 4 + 3] = 255; };
    // the land colour is a touch lighter than the vehicle, the trail uses the vehicle colour
    for (const p of sim.players) {
      tmpC.set(p.color); const land = tmpC.clone().lerp(new THREE.Color('#ffffff'), 0.12);
      setPal(p.id, p.color); if (!sim.o.teams) setPal(p.land, '#' + land.getHexString());
    }
    TEAM_COLORS.forEach((c, t) => setPal(TEAM0 + t, '#' + new THREE.Color(c).lerp(new THREE.Color('#fff'), 0.1).getHexString()));
    this.palTex.needsUpdate = true;
    const lin = (c) => new THREE.Color(c);
    this.uni = {
      uGrid: { value: this.gridTex }, uStamp: { value: this.stampTex }, uPal: { value: this.palTex }, uSize: { value: new THREE.Vector2(W, H) }, uTime: { value: 0 },
      uA: { value: lin(C.a) }, uB: { value: lin(C.b) }, uLine: { value: lin(C.line) }, uWater: { value: lin(C.obstC) }, uWaterOn: { value: C.obst === 'water' ? 1 : 0 }, uNight: { value: C.night ? 1 : 0 },
    };
    const board = new THREE.Mesh(new THREE.PlaneGeometry(W, H).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({ uniforms: this.uni, vertexShader: BOARD_VS, fragmentShader: BOARD_FS }));
    scene.add(board);
    // the ground around and a raised frame
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900).rotateX(-Math.PI / 2), lam(C.ground)); ground.position.y = -0.6; scene.add(ground);
    const frameM = lam(C.edge);
    for (const [x, z, w, d] of [[0, -H / 2 - 0.6, W + 2.4, 1.2], [0, H / 2 + 0.6, W + 2.4, 1.2], [-W / 2 - 0.6, 0, 1.2, H], [W / 2 + 0.6, 0, 1.2, H]]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 1.1, d), frameM); m.position.set(x, -0.05, z); scene.add(m);
    }
    const under = new THREE.Mesh(new THREE.BoxGeometry(W, 0.6, H), lam(new THREE.Color(C.ground).multiplyScalar(0.8))); under.position.y = -0.31; scene.add(under);
    // obstacles
    const cells = []; for (let c = 0; c < W * H; c++) if (sim.own[c] === OBST) cells.push(c);
    if (C.obst !== 'water' && cells.length) {
      let g, m;
      if (C.obst === 'rock') { g = new THREE.DodecahedronGeometry(0.62, 0); m = new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true }); }
      else if (C.obst === 'crate') { g = new THREE.BoxGeometry(0.94, 0.94, 0.94).translate(0, 0.47, 0); m = new THREE.MeshLambertMaterial({ color: '#ffffff', map: crateTexture() }); }
      else { g = new THREE.CylinderGeometry(0.4, 0.48, 1, 8).translate(0, 0.5, 0); m = new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: C.night ? new THREE.Color(C.obstC).multiplyScalar(0.35) : new THREE.Color(0) }); }
      const im = new THREE.InstancedMesh(g, m, cells.length), rr = rng(this.seed + 9), base = new THREE.Color(C.obstC);
      const cx = W / 2, cy = H / 2;
      cells.forEach((c, k) => {
        const i = c % W, j = (c / W) | 0, x = i + 0.5 - W / 2, z = j + 0.5 - H / 2;
        let sy = 1, y = 0;
        if (C.obst === 'rock') { sy = 0.7 + rr() * 0.6; y = 0.25; tmpQ.setFromEuler(new THREE.Euler(rr() * 3, rr() * 3, rr() * 3)); }
        else if (C.obst === 'crate') { sy = rr() < 0.3 ? 2 : 1; tmpQ.identity(); }
        else { const d = Math.hypot(i + 0.5 - cx, j + 0.5 - cy); sy = 1 + Math.max(0, 7 - d) * 0.45 + rr() * 0.4; tmpQ.identity(); }
        tmpM.compose(tmpP.set(x, y, z), tmpQ, tmpS.set(1, sy, 1)); im.setMatrixAt(k, tmpM);
        im.setColorAt(k, tmpC.copy(base).offsetHSL(0, 0, (rr() - 0.5) * 0.12));
      });
      scene.add(im);
    }
    // decoration around the board: low-poly trees (neon posts at night, traffic cones on the building site)
    {
      const n = 150, rr = rng(this.seed + 3), deco = new THREE.Group();
      const kind = C.night ? 'neon' : this.o.map === 'cantiere' ? 'cone' : 'tree';
      const crownG = kind === 'tree' ? new THREE.IcosahedronGeometry(1.3, 0).translate(0, 2.6, 0) : kind === 'cone' ? new THREE.ConeGeometry(0.7, 1.8, 10).translate(0, 0.9, 0) : new THREE.CylinderGeometry(0.22, 0.22, 4, 6).translate(0, 2, 0);
      const crown = new THREE.InstancedMesh(crownG, new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true, emissive: C.night ? '#55208a' : '#000000' }), n);
      const trunk = kind === 'tree' ? new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.26, 1.6, 6).translate(0, 0.8, 0), lam('#8a5a3c'), n) : null;
      const cols = (C.decor || ['#4caf50', '#7bc043', '#2e8b57', '#f4c430', '#ff8fab']).map((c) => new THREE.Color(c));
      let k = 0;
      for (let tries = 0; tries < n * 3 && k < n; tries++) {
        const a = rr() * Math.PI * 2, rad = Math.max(W, H) * (0.55 + rr() * 0.5);
        const x = Math.cos(a) * rad * 1.15, z = Math.sin(a) * rad;
        if (Math.abs(x) < W / 2 + 3 && Math.abs(z) < H / 2 + 3) continue;
        const sc = kind === 'tree' ? 0.8 + rr() * 1.1 : 0.8 + rr() * 0.6;
        tmpM.compose(tmpP.set(x, -0.6, z), tmpQ.setFromAxisAngle(tmpV.set(0, 1, 0), rr() * 6), tmpS.set(sc, sc * (0.85 + rr() * 0.4), sc));
        crown.setMatrixAt(k, tmpM); trunk?.setMatrixAt(k, tmpM);
        crown.setColorAt(k, tmpC.copy(cols[(rr() * cols.length) | 0]).offsetHSL(0, 0, (rr() - 0.5) * 0.1));
        k++;
      }
      crown.count = k; if (trunk) trunk.count = k;
      deco.add(crown); if (trunk) deco.add(trunk);
      this.decor = deco; scene.add(deco);
    }
    // sky: a gradient dome (deep zenith, light horizon)
    {
      const g = new THREE.SphereGeometry(500, 24, 12), pos = g.attributes.position, col = [];
      const zen = new THREE.Color(C.sky).multiplyScalar(C.night ? 0.6 : 0.85), hor = new THREE.Color(C.fog);
      for (let i = 0; i < pos.count; i++) { const t = Math.max(0, pos.getY(i) / 500); const c = hor.clone().lerp(zen, Math.pow(t, 0.6)); col.push(c.r, c.g, c.b); }
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      scene.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })));
    }
    // vehicles
    this.blobTex = blobTexture();
    const blobG = new THREE.PlaneGeometry(1.5, 1.5).rotateX(-Math.PI / 2);
    for (const p of sim.players) {
      const v = buildVehicle(p.vehicle, p.color); v.userData.body.scale.setScalar(1.35);
      const blob = new THREE.Mesh(blobG, new THREE.MeshBasicMaterial({ map: this.blobTex, transparent: true, depthWrite: false })); blob.position.y = 0.02; blob.renderOrder = 1;
      v.add(blob);
      const lab = labelSprite(p.human && !this.mp ? 'Tu' : p.name, p.color); lab.position.y = 1.6; v.add(lab); v.userData.label = lab;
      scene.add(v); p.mesh = v; v.visible = p.alive;
    }
    // shared shield / ice meshes
    this.shieldG = new THREE.SphereGeometry(0.85, 20, 14);
    this.iceG = new THREE.BoxGeometry(1.1, 1.1, 1.1);
    // power-ups
    this.pwMeshes = new Map();
    this.pwGeo = { turbo: new THREE.OctahedronGeometry(0.42), scudo: new THREE.IcosahedronGeometry(0.4), gelo: new THREE.TetrahedronGeometry(0.48) };
    // debris / confetti
    const N = 360;
    this.bits = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), new THREE.MeshLambertMaterial({ color: '#ffffff' }), N);
    this.bits.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.bits.count = 0; this.bits.frustumCulled = false;
    this.bits.setColorAt(0, tmpC.set('#fff')); scene.add(this.bits);
    this.bitList = [];
    // views
    this.views = this.makeViews();
    this.uploadGrid(true);
  }

  makeViews() {
    if (!this.mp) return [{ p: this.me, cam: new THREE.PerspectiveCamera(42, 1, 0.5, 600), x: 0, z: 0 }];
    if (this.o.view === 'condiviso') return [{ shared: true, cam: new THREE.PerspectiveCamera(40, 1, 0.5, 900) }];
    const v = this.humans.map((p) => ({ p, cam: new THREE.PerspectiveCamera(44, 1, 0.5, 600), x: 0, z: 0 }));
    if (v.length === 3) v.push({ shared: true, cam: new THREE.PerspectiveCamera(40, 1, 0.5, 900), overview: true });
    return v;
  }

  // ---------- grid upload (only when something changed)
  uploadGrid(force) {
    const s = this.sim;
    if (s.dirty || force) {
      const d = this.gridData, own = s.own, tr = s.trail;
      for (let c = 0, k = 0; c < own.length; c++, k += 4) { d[k] = own[c]; d[k + 1] = tr[c]; }
      this.gridTex.needsUpdate = true; s.dirty = false;
    }
    if (s.dirtyStamp || force) { this.stampTex.needsUpdate = true; s.dirtyStamp = false; }
    // style row: trail style, shield flag, land id
    let ch = false;
    for (const p of s.players) {
      const k = (256 + p.id) * 4, sh = p.shield > 0 && p.alive ? 255 : 0;
      if (this.palData[k] !== p.trailStyle || this.palData[k + 1] !== sh || this.palData[k + 2] !== p.land) { this.palData[k] = p.trailStyle; this.palData[k + 1] = sh; this.palData[k + 2] = p.land; this.palData[k + 3] = 255; ch = true; }
    }
    if (ch) this.palTex.needsUpdate = true;
  }

  // ---------- layout
  resize() {
    const w = this.root.clientWidth || innerWidth, h = this.root.clientHeight || innerHeight;
    this.renderer.setSize(w, h, false);
    this.cw = w; this.ch = h;
    const n = this.views.length, land = w >= h;
    let rects;
    if (n === 1) rects = [{ x: 0, y: 0, w, h }];
    else if (n === 2) rects = land ? [{ x: 0, y: 0, w: w / 2, h }, { x: w / 2, y: 0, w: w / 2, h }] : [{ x: 0, y: 0, w, h: h / 2 }, { x: 0, y: h / 2, w, h: h / 2 }];
    else rects = [{ x: 0, y: 0, w: w / 2, h: h / 2 }, { x: w / 2, y: 0, w: w / 2, h: h / 2 }, { x: 0, y: h / 2, w: w / 2, h: h / 2 }, { x: w / 2, y: h / 2, w: w / 2, h: h / 2 }];
    this.views.forEach((v, i) => { v.rect = rects[i]; v.cam.aspect = rects[i].w / rects[i].h; v.cam.updateProjectionMatrix(); });
    // touch zones: each player's view; one shared view → split the screen in equal zones
    if (this.mp) {
      let zones;
      if (this.o.view === 'condiviso') {
        const k = this.humans.length;
        zones = k === 2 ? (land ? [{ x: 0, y: 0, w: w / 2, h }, { x: w / 2, y: 0, w: w / 2, h }] : [{ x: 0, y: h / 2, w, h: h / 2 }, { x: 0, y: 0, w, h: h / 2 }]) : [{ x: 0, y: h / 2, w: w / 2, h: h / 2 }, { x: w / 2, y: 0, w: w / 2, h: h / 2 }, { x: w / 2, y: h / 2, w: w / 2, h: h / 2 }, { x: 0, y: 0, w: w / 2, h: h / 2 }];
      } else zones = this.views.filter((v) => v.p).map((v) => v.rect);
      this.input?.setZones(zones);
      this.zones = zones;
    }
    this.compact = w < 700 || h < 520;
    this.root.classList.toggle('tr-compact', this.compact);
    this.root.classList.toggle('tr-port', h > w * 1.15);
    this.renderViewHud();
  }
  renderViewHud() {
    const el = this.$('tr-views'); if (!el) return;
    if (!this.mp) { el.innerHTML = ''; return; }
    el.innerHTML = this.views.map((v, i) => {
      const r = v.rect, p = v.p;
      const style = `left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px`;
      if (!p) return v.overview ? `<div class="tr-view ov" style="${style}"><span class="tr-vtag">Panoramica</span></div>` : '';
      return `<div class="tr-view" style="${style};--c:${p.color}"><div class="tr-vbar"><i></i><b>${esc(p.name)}</b><span id="tr-vp${i}">0%</span><em id="tr-vk${i}"></em></div><div class="tr-vmsg" id="tr-vm${i}"></div></div>`;
    }).join('') + (this.o.view === 'condiviso' ? `<div class="tr-shared">${this.humans.map((p, i) => `<div class="tr-sh" style="--c:${p.color}"><i></i><b>${esc(p.name)}</b><span id="tr-vp${i}">0%</span><em id="tr-vk${i}"></em><small id="tr-vm${i}"></small></div>`).join('')}</div>` : '') + (this.views.length > 1 ? `<div class="tr-split ${this.cw >= this.ch ? 'v' : 'h'} n${this.views.length}"></div>` : '');
  }

  // ---------- frame
  loop(now) {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.max(0, Math.min(0.05, (now - this.last) / 1000)); this.last = Math.max(this.last, now);
    this.input.pollPause();
    if (!this.paused && !this.over && !this.hold) this.step(dt);
    else if (this.over) this.updateFx(dt);
    this.render(dt);
    if (!this.paused && !this.hold) this.guard.tick();
  }
  step(dt) {
    this.clock += dt;
    if (this.count > 0) {
      const before = Math.ceil(this.count); this.count -= dt; const after = Math.ceil(this.count);
      const el = this.$('tr-count');
      if (el && (after !== before || !el.textContent)) { el.textContent = after > 0 ? after : 'Via!'; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); if (this.sfxOn) try { vsfx.beep(after <= 0); } catch {} }
      if (this.count <= 0) this.countClear = this.clock + 0.7;
      this.readInput();
      this.updateHud(dt);
      return;
    }
    if (this.countClear && this.clock >= this.countClear) { this.countClear = 0; const el = this.$('tr-count'); if (el) el.textContent = ''; }
    else if (!this.countClear && this.clock < 0.1) { const el = this.$('tr-count'); if (el) el.textContent = ''; }
    this.readInput();
    const s = this.sim;
    s.step(dt);
    this.handleEvents();
    this.humans.forEach((p, i) => { const st = this.stats[i]; if (p.alive) { st.life += dt; st.bestLife = Math.max(st.bestLife, st.life); st.bestPct = Math.max(st.bestPct, s.pctOf(p)); } else st.life = 0; });
    this.updateMissions();
    this.updateFx(dt);
    this.updateHud(dt);
    if (s.time && s.time <= 10 && Math.ceil(s.time) !== this.lastTick) { this.lastTick = Math.ceil(s.time); if (this.sfxOn) try { vsfx.tick(this.lastTick); } catch {} }
    if (s.over && !this.over) this.finish();
  }
  readInput() {
    const v0 = this.views[0];
    const mouseAngle = (mx, my) => {
      if (!this.me?.alive) return null;
      const rect = this.cv.getBoundingClientRect(), r = v0.rect;
      const nx = ((mx - rect.left - r.x) / r.w) * 2 - 1, ny = -((my - rect.top - r.y) / r.h) * 2 + 1;
      tmpV.set(nx, ny, 0.5).unproject(v0.cam).sub(v0.cam.position).normalize();
      if (tmpV.y > -0.01) return null;
      const t = -v0.cam.position.y / tmpV.y, gx = v0.cam.position.x + tmpV.x * t + this.W / 2, gz = v0.cam.position.z + tmpV.z * t + this.H / 2;
      const dx = gx - this.me.x, dz = gz - this.me.y; if (Math.hypot(dx, dz) < 0.6) return null;
      return Math.atan2(dz, dx);
    };
    this.humans.forEach((p, i) => {
      if (!p.alive || p.auto) return;
      const h = this.input.heading(i, i === 0 && !this.mp ? mouseAngle : null);
      if (h !== null) p.want = h;
    });
  }
  handleEvents() {
    const s = this.sim;
    for (const e of s.events) {
      const p = e.p, mine = p?.human;
      if (e.type === 'capture') {
        if (e.n > 0) this.burst(p.x, p.y, p.color, Math.min(40, 6 + e.n / 6), 6);
        if (mine) { this.pop(p, `+${e.pct.toFixed(1)}%`, e.pct > 3); if (this.sfxOn) try { vsfx.gulp(Math.min(1, e.n / 200)); if (e.pct > 4) vsfx.burst(); } catch {} }
      } else if (e.type === 'kill') {
        this.burst(e.x, e.y, p.color, 46, 10); this.shakeAt(e.x, e.y, 0.6);
        const msg = e.why === 'self' ? 'si è tagliato la scia' : e.why === 'head' ? 'scontro frontale' : e.why === 'land' ? 'ha perso tutto il terreno' : `tagliato da ${e.by?.name}`;
        if (mine) {
          if (this.sfxOn) try { vsfx.lost(); } catch {}
          if (!this.mp) this.toast(e.why === 'self' ? 'Hai tagliato la tua scia!' : e.why === 'head' ? 'Scontro frontale!' : e.why === 'land' ? 'Ti hanno preso tutto il terreno!' : `Eliminato da ${e.by?.name}!`, true);
        } else if (e.by?.human) {
          if (this.sfxOn) try { vsfx.rival(); } catch {}
          if (!this.mp) this.toast(`Hai eliminato ${p.name}!`); else this.pop(e.by, `${p.name} fuori!`, true);
        } else if (!this.mp && Math.hypot(p.x - this.me.x, p.y - this.me.y) < 25) this.toastSmall(`${p.name}: ${msg}`);
      } else if (e.type === 'power') {
        this.burst(e.x, e.y, POWERS[e.kind].color, 24, 7);
        if (mine) { if (!this.mp) this.toast(`${PW_ICON[e.kind]} ${PW_TEXT[e.kind]}`); else this.pop(p, `${PW_ICON[e.kind]} ${POWERS[e.kind].name}`); if (this.sfxOn) try { uisfx.levelup?.(); } catch {} }
      } else if (e.type === 'bump' && mine) { if (this.sfxOn) try { vsfx.hit(); } catch {} }
      else if (e.type === 'spawn' && mine && this.clock > 1) { this.views.forEach((v) => { if (v.p === p) this.updateCamera(v, 1, true); }); }
    }
    s.events.length = 0;
  }

  // ---------- effects
  burst(gx, gy, color, n, sp) {
    const x = gx - this.W / 2, z = gy - this.H / 2, c = new THREE.Color(color);
    for (let i = 0; i < n && this.bitList.length < 360; i++) {
      const a = Math.random() * Math.PI * 2, v = sp * (0.3 + Math.random() * 0.7);
      this.bitList.push({ x, y: 0.5, z, vx: Math.cos(a) * v * 0.6, vy: 3 + Math.random() * sp * 0.7, vz: Math.sin(a) * v * 0.6, life: 0.8 + Math.random() * 0.6, rx: Math.random() * 6, c: c.clone().offsetHSL(0, 0, (Math.random() - 0.3) * 0.25) });
    }
  }
  shakeAt(gx, gy, k) { for (const v of this.views) if (v.p && Math.hypot(v.p.x - gx, v.p.y - gy) < 18) v.shake = Math.max(v.shake || 0, k); }
  updateFx(dt) {
    const L = this.bitList; let n = 0;
    for (let i = L.length - 1; i >= 0; i--) {
      const b = L[i]; b.life -= dt; if (b.life <= 0) { L.splice(i, 1); continue; }
      b.vy -= 18 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; if (b.y < 0.08) { b.y = 0.08; b.vy *= -0.35; b.vx *= 0.7; b.vz *= 0.7; }
      b.rx += dt * 8;
    }
    for (const b of L) {
      const s = Math.min(1, b.life * 2);
      tmpM.compose(tmpP.set(b.x, b.y, b.z), tmpQ.setFromAxisAngle(tmpV.set(0.6, 1, 0.3).normalize(), b.rx), tmpS.set(s, s, s));
      this.bits.setMatrixAt(n, tmpM); this.bits.setColorAt(n, b.c); n++;
    }
    this.bits.count = n; this.bits.instanceMatrix.needsUpdate = true; if (this.bits.instanceColor) this.bits.instanceColor.needsUpdate = true;
  }
  pop(p, text, big) {
    const el = this.$('tr-pops'); if (!el) return;
    const d = document.createElement('div'); d.className = 'tr-pop' + (big ? ' big' : ''); d.textContent = text; d.style.setProperty('--c', p.color);
    el.appendChild(d); this.pops.push({ el: d, p, t: 0 });
    setTimeout(() => d.remove(), 1100);
  }
  toast(text, bad) {
    const el = this.$('tr-toast'); if (!el) return;
    el.textContent = text; el.className = 'tr-toast on' + (bad ? ' bad' : '');
    clearTimeout(this.toastT); this.toastT = setTimeout(() => el.classList.remove('on'), 2200);
  }
  toastSmall(text) { if (this.$('tr-toast')?.classList.contains('on')) return; const el = this.$('tr-toast'); el.textContent = text; el.className = 'tr-toast on small'; clearTimeout(this.toastT); this.toastT = setTimeout(() => el.classList.remove('on'), 1600); }
  drawSticks() {
    const el = this.$('tr-sticks'); if (!el) return;
    const rect = this.root.getBoundingClientRect();
    el.innerHTML = this.input.sticks().map((t) => { let dx = t.x - t.ox, dy = t.y - t.oy; const d = Math.hypot(dx, dy), m = 40; if (d > m) { dx *= m / d; dy *= m / d; } return `<div class="tr-joy" style="left:${t.ox - rect.left}px;top:${t.oy - rect.top}px"><i style="transform:translate(${dx}px,${dy}px)"></i></div>`; }).join('');
  }

  // ---------- render
  updateCamera(v, dt, snap) {
    const cam = v.cam, W = this.W, H = this.H;
    if (v.shared) {
      // the whole board, a little tilted
      const pitch = 1.12, aspect = cam.aspect, t = Math.tan((cam.fov * Math.PI) / 360);
      const need = Math.max((H * 0.62) / t, (W * 0.56) / (t * aspect));
      cam.position.set(0, Math.sin(pitch) * need, Math.cos(pitch) * need + H * 0.04);
      cam.lookAt(0, 0, H * 0.04);
      return;
    }
    const p = v.p; if (!p) return;
    const k = snap ? 1 : 1 - Math.exp(-dt * 5);
    const ahead = p.alive ? 2.2 : 0;
    const tx = p.x - W / 2 + Math.cos(p.ang) * ahead, tz = p.y - H / 2 + Math.sin(p.ang) * ahead;
    v.x += (tx - v.x) * k; v.z += (tz - v.z) * k;
    // the narrow side of the view shows ~24 cells (more with a long trail)
    const zoom = (this.compact ? 19 : 24) + Math.min(12, p.trail.length * 0.1);
    v.zoom = v.zoom ? v.zoom + (zoom - v.zoom) * Math.min(1, dt * 2) : zoom;
    const t = Math.tan((cam.fov * Math.PI) / 360), D = cam.aspect < 1 ? (v.zoom / 2) / (t * cam.aspect) : (v.zoom / 2) / t;
    const pitch = 1.0;
    let sx = 0, sz = 0;
    if (v.shake > 0) { v.shake = Math.max(0, v.shake - dt * 2); sx = (Math.random() - 0.5) * v.shake; sz = (Math.random() - 0.5) * v.shake; }
    cam.position.set(v.x + sx, Math.sin(pitch) * D, v.z + Math.cos(pitch) * D + sz);
    cam.lookAt(v.x + sx, 0, v.z + sz);
  }
  render(dt) {
    const s = this.sim, W = this.W, H = this.H, t = this.clock;
    this.uni.uTime.value = s.t;
    this.uploadGrid();
    // vehicles
    for (const p of s.players) {
      const m = p.mesh; if (!m) continue;
      m.visible = p.alive;
      if (!p.alive) continue;
      m.position.set(p.x - W / 2, 0, p.y - H / 2);
      m.rotation.y = -p.ang;
      const b = m.userData.body;
      b.position.y = (m.userData.hover ? 0.25 + Math.sin(t * 4 + p.id) * 0.08 : Math.abs(Math.sin(t * 14 + p.id)) * 0.05) * (p.frozen > 0 ? 0 : 1);
      if (m.userData.spin) m.userData.spin.rotation.y += dt * 14;
      if (m.userData.flame) m.userData.flame.scale.set(1 + Math.sin(t * 30) * 0.2 + (p.turbo > 0 ? 0.8 : 0), 1, 1);
      m.userData.label.visible = !this.labelsOff && (this.mp || !p.human);
      // shield bubble and ice block
      if (p.shield > 0 && !m.userData.shield) { const sh = new THREE.Mesh(this.shieldG, new THREE.MeshBasicMaterial({ color: '#7cc8ff', transparent: true, opacity: 0.28, depthWrite: false })); sh.position.y = 0.45; m.add(sh); m.userData.shield = sh; }
      if (m.userData.shield) { m.userData.shield.visible = p.shield > 0; m.userData.shield.material.opacity = p.shield < 1.2 ? 0.28 * (Math.sin(t * 20) > 0 ? 1 : 0.3) : 0.28; m.userData.shield.scale.setScalar(1 + Math.sin(t * 6) * 0.05); }
      if (p.frozen > 0 && !m.userData.ice) { const ice = new THREE.Mesh(this.iceG, new THREE.MeshLambertMaterial({ color: '#cfefff', transparent: true, opacity: 0.55, depthWrite: false })); ice.position.y = 0.5; m.add(ice); m.userData.ice = ice; }
      if (m.userData.ice) m.userData.ice.visible = p.frozen > 0;
      if (p.turbo > 0 && Math.random() < 0.5) this.bitList.length < 360 && this.bitList.push({ x: m.position.x - Math.cos(p.ang) * 0.5, y: 0.3, z: m.position.z - Math.sin(p.ang) * 0.5, vx: 0, vy: 1, vz: 0, life: 0.3, rx: 0, c: new THREE.Color('#2ee6a6') });
    }
    // power-ups
    const alive = new Set();
    for (const pw of s.powers) {
      alive.add(pw.id);
      let m = this.pwMeshes.get(pw.id);
      if (!m) {
        m = new THREE.Group();
        const gem = new THREE.Mesh(this.pwGeo[pw.kind], new THREE.MeshLambertMaterial({ color: POWERS[pw.kind].color, emissive: new THREE.Color(POWERS[pw.kind].color).multiplyScalar(0.45), flatShading: true }));
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.7, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: POWERS[pw.kind].color, transparent: true, opacity: 0.7, depthWrite: false }));
        ring.position.y = 0.03; m.add(gem, ring); m.userData.gem = gem;
        m.position.set(pw.x - W / 2, 0, pw.y - H / 2); this.scene.add(m); this.pwMeshes.set(pw.id, m);
      }
      m.userData.gem.position.y = 0.7 + Math.sin(t * 3 + pw.id) * 0.15; m.userData.gem.rotation.y = t * 2; m.userData.gem.rotation.x = t * 0.7;
      m.visible = pw.life > 3 || Math.sin(t * 16) > 0;
    }
    for (const [id, m] of this.pwMeshes) if (!alive.has(id)) { this.scene.remove(m); m.children.forEach((c) => { if (c.geometry && !Object.values(this.pwGeo).includes(c.geometry)) c.geometry.dispose(); c.material.dispose(); }); this.pwMeshes.delete(id); }
    // views
    const r = this.renderer;
    if (this.camOverride) { // photo mode (cover script): one camera over the whole canvas
      const cam = this.photoCam ||= new THREE.PerspectiveCamera(40, 1, 0.3, 900);
      cam.aspect = this.cw / this.ch; this.camOverride(cam, this); cam.updateProjectionMatrix();
      r.setScissorTest(false); r.setViewport(0, 0, this.cw, this.ch); r.render(this.scene, cam);
      return;
    }
    if (this.views.length === 1) {
      this.updateCamera(this.views[0], dt);
      r.setScissorTest(false); r.setViewport(0, 0, this.cw, this.ch);
      r.render(this.scene, this.views[0].cam);
    } else {
      r.setScissorTest(true);
      for (const v of this.views) {
        this.updateCamera(v, dt);
        const R = v.rect, y = this.ch - R.y - R.h;
        r.setViewport(R.x, y, R.w, R.h); r.setScissor(R.x, y, R.w, R.h);
        r.render(this.scene, v.cam);
      }
      r.setScissorTest(false);
    }
    this.placePops();
  }
  placePops() {
    if (!this.pops.length) return;
    this.pops = this.pops.filter((q) => q.el.isConnected);
    for (const q of this.pops) {
      const v = this.views.find((x) => x.p === q.p) || this.views[0];
      tmpV.set(q.p.x - this.W / 2, 1.6, q.p.y - this.H / 2).project(v.cam);
      const R = v.rect; q.el.style.left = `${R.x + (tmpV.x * 0.5 + 0.5) * R.w}px`; q.el.style.top = `${R.y + (-tmpV.y * 0.5 + 0.5) * R.h}px`;
    }
  }

  // ---------- HUD
  updateHud(dt) {
    const s = this.sim;
    this.hudT = (this.hudT || 0) - dt; if (this.hudT > 0 && this.count <= 0) return; this.hudT = 0.12;
    const tm = this.$('tr-timer');
    if (tm) {
      if (this.mode.time) { tm.textContent = fmtT(s.time || this.mode.time); tm.classList.toggle('hot', s.time > 0 && s.time <= 10); }
      else if (this.mode.target) tm.textContent = `Obiettivo ${Math.round((s.o.target || 0) * 100)}%`;
      else tm.textContent = `${s.players.filter((p) => p.alive || p.respawnT > 0).length} in gioco`;
    }
    if (!this.mp) {
      const me = this.me, pct = s.pctOf(me);
      this.$('tr-pct').textContent = `${pct.toFixed(pct < 10 ? 1 : 0)}%`;
      this.$('tr-sub').textContent = me.alive ? `${me.kills} eliminazioni${me.trail.length ? ` · scia ${me.trail.length}` : ''}` : me.respawnT > 0 ? `Rientri tra ${Math.ceil(me.respawnT)}…` : 'Eliminato';
      const rk = s.ranking();
      const B = s.o.teams ? rk.map((t, i) => `<li class="${t.team === me.team ? 'me' : ''}" style="--c:${TEAM_COLORS[t.team]}"><span class="n">${i + 1}</span><i></i><b>${TEAM_NAMES[t.team]}</b><span class="p">${t.pct.toFixed(1)}%</span></li>`)
        : (() => { const i0 = rk.indexOf(me), show = rk.slice(0, this.compact ? 3 : 5); if (i0 >= show.length) show.push(me); return show.map((p) => `<li class="${p === me ? 'me' : ''} ${p.alive ? '' : 'out'}" style="--c:${p.color}"><span class="n">${rk.indexOf(p) + 1}</span><i></i><b>${esc(p === me ? 'Tu' : p.name)}</b><span class="p">${s.pctOf(p).toFixed(1)}%</span></li>`); })();
      const html = B.join(''); const bd = this.$('tr-board'); if (bd && bd._h !== html) { bd.innerHTML = html; bd._h = html; }
      this.drawMini();
      const pw = []; if (me.turbo > 0) pw.push(`<span style="--c:${POWERS.turbo.color}">⚡ ${me.turbo.toFixed(1)}</span>`); if (me.shield > 0 && this.clock > 2) pw.push(`<span style="--c:${POWERS.scudo.color}">🛡 ${me.shield.toFixed(1)}</span>`); if (me.frozen > 0) pw.push(`<span style="--c:${POWERS.gelo.color}">❄ ${me.frozen.toFixed(1)}</span>`);
      const ph = pw.join(''), pe = this.$('tr-pw'); if (pe._h !== ph) { pe.innerHTML = ph; pe._h = ph; }
    } else {
      const teams = s.o.teams;
      this.humans.forEach((p, i) => {
        const pe = this.$('tr-vp' + i); if (pe) pe.textContent = `${(teams ? s.share(p.land) * 100 : s.pctOf(p)).toFixed(1)}%${teams ? ' ' + TEAM_NAMES[p.team] : ''}`;
        const ke = this.$('tr-vk' + i); if (ke) ke.textContent = [p.kills ? `✖${p.kills}` : '', p.turbo > 0 ? '⚡' : '', p.shield > 0 && this.clock > 2 ? '🛡' : '', p.frozen > 0 ? '❄' : ''].join(' ');
        const me = this.$('tr-vm' + i); if (me) me.textContent = p.alive ? '' : p.respawnT > 0 ? `Eliminato! Rientri tra ${Math.ceil(p.respawnT)}…` : 'Fuori gioco';
      });
    }
  }
  drawMini() {
    const cv = this.$('tr-mini'); if (!cv) return;
    this.miniT = (this.miniT || 0) + 1; if (this.miniT % 2) return;
    const s = this.sim, W = this.W, H = this.H, g = cv.getContext('2d');
    if (!this.miniImg) { this.miniImg = g.createImageData(W, H); this.miniCol = new Uint8Array(256 * 3); for (let i = 0; i < 256; i++) { this.miniCol[i * 3] = this.palData[i * 4]; this.miniCol[i * 3 + 1] = this.palData[i * 4 + 1]; this.miniCol[i * 3 + 2] = this.palData[i * 4 + 2]; } tmpC.set(this.mapCfg.a); this.miniBg = [tmpC.r * 255 * 0.8, tmpC.g * 255 * 0.8, tmpC.b * 255 * 0.8]; tmpC.set(this.mapCfg.obstC); this.miniOb = [tmpC.r * 200, tmpC.g * 200, tmpC.b * 200]; }
    const d = this.miniImg.data, C = this.miniCol;
    for (let c = 0, k = 0; c < W * H; c++, k += 4) {
      const o = s.own[c], t = s.trail[c];
      if (t) { d[k] = 255; d[k + 1] = 255; d[k + 2] = 255; }
      else if (o === OBST) { d[k] = this.miniOb[0]; d[k + 1] = this.miniOb[1]; d[k + 2] = this.miniOb[2]; }
      else if (o) { d[k] = C[o * 3]; d[k + 1] = C[o * 3 + 1]; d[k + 2] = C[o * 3 + 2]; }
      else { d[k] = this.miniBg[0]; d[k + 1] = this.miniBg[1]; d[k + 2] = this.miniBg[2]; }
      d[k + 3] = 255;
    }
    g.putImageData(this.miniImg, 0, 0);
    for (const p of s.players) if (p.alive) { g.fillStyle = p === this.me ? '#ffffff' : '#111'; g.fillRect(p.x - 1.5, p.y - 1.5, 3, 3); }
  }
  renderMissions() {
    const el = this.$('tr-miss'); if (!el || !this.missions) return;
    el.innerHTML = this.missions.map((m) => `<li class="${m.done ? 'done' : ''}"><i>${m.done ? '✓' : ''}</i><span>${esc(m.text)}</span></li>`).join('');
  }
  updateMissions() {
    if (!this.missions) return;
    let ch = false;
    for (const m of this.missions) {
      if (m.done) continue;
      m.have = missionValue(m, this.me, this.stats[0]);
      if (m.have >= m.n) { m.done = true; ch = true; this.toast(`Missione: ${m.text} · +${m.coins}`); if (this.sfxOn) try { uisfx.coin?.(); } catch {} }
    }
    if (ch) this.renderMissions();
  }
  togglePause(force) {
    if (this.over) return;
    this.paused = force ?? !this.paused;
    this.o.onPause?.(this.paused);
  }

  // ---------- end
  finish() {
    if (this.over) return;
    this.over = true;
    const s = this.sim, M = this.mode, rk = s.ranking();
    const res = { mode: this.o.mode, map: this.o.map, daily: this.o.daily?.key || null, mp: this.mp, why: s.why, time: s.t };
    if (s.o.teams) {
      res.teams = rk.map((t) => ({ name: TEAM_NAMES[t.team], color: TEAM_COLORS[t.team], pct: t.pct, team: t.team, players: t.players.map((p) => ({ name: p.name, color: p.color, kills: p.kills, human: p.human })) }));
    }
    res.ranking = (s.o.teams ? [...s.players].sort((a, b) => b.captured - a.captured) : rk).map((p) => ({ name: p.human && !this.mp ? 'Tu' : p.name, color: p.color, pct: s.o.teams ? (p.captured / s.free) * 100 : s.pctOf(p), kills: p.kills, player: p.human, out: !p.alive, team: p.team }));
    if (!this.mp) {
      const me = this.me, st = this.stats[0];
      res.pct = s.pctOf(me); res.bestPct = st.bestPct; res.kills = me.kills; res.loops = me.loops; res.bigLoop = me.bigLoop; res.powers = me.powers;
      res.of = s.players.length;
      if (s.o.teams) { res.teamPct = s.share(me.land) * 100; res.win = rk[0].team === me.team; res.pos = res.win ? 1 : 2; res.of = 2; }
      else { res.pos = rk.indexOf(me) + 1; res.win = M.target ? s.why === 'target' && s.winnerP === me : res.pos === 1 && (me.alive || M.respawn?.human); }
      res.stars = starsFor(this.o.mode, res);
      res.missions = this.missions.map((m) => ({ ...m }));
      res.coins = matchCoins(res) + this.missions.filter((m) => m.done).reduce((a, m) => a + m.coins, 0);
      res.score = Math.round(res.bestPct * 100);
      if (this.sfxOn) try { vsfx.end(res.win); } catch {}
    } else {
      // local multiplayer: who won among everybody (and among the humans)
      if (s.o.teams) res.winner = res.teams[0].name;
      else { const w = rk[0]; res.winner = w.name; res.winnerHuman = w.human; }
      res.humans = this.humans.map((p, i) => ({ name: p.name, color: p.color, pct: s.o.teams ? s.share(p.land) * 100 : s.pctOf(p), best: this.stats[i].bestPct, kills: p.kills, team: p.team }));
      if (this.sfxOn) try { vsfx.end(true); } catch {}
    }
    this.result = res;
    setTimeout(() => this.o.onEnd?.(res), 1100);
  }
  destroy() {
    cancelAnimationFrame(this.raf); this.ro?.disconnect(); this.input?.destroy();
    document.removeEventListener('visibilitychange', this.onVis);
    clearTimeout(this.toastT);
    this.scene?.traverse((o) => { o.geometry?.dispose?.(); if (o.material) [].concat(o.material).forEach((m) => { m.map?.dispose?.(); m.dispose?.(); }); });
    for (const t of [this.gridTex, this.stampTex, this.palTex, this.blobTex]) t?.dispose?.();
    this.renderer?.dispose(); this.renderer?.forceContextLoss?.();
    this.root.innerHTML = '';
  }
}

function crateTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d');
  g.fillStyle = '#d99a3a'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#b97a24'; for (let i = 0; i < 4; i++) g.fillRect(0, i * 16 + 14, 64, 2);
  g.strokeStyle = '#8a5615'; g.lineWidth = 6; g.strokeRect(3, 3, 58, 58);
  g.beginPath(); g.moveTo(6, 6); g.lineTo(58, 58); g.stroke();
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
