// Voragine — you are a sinkhole opening in a city. Swallow anything smaller than you, grow,
// swallow the smaller rival sinkholes. Three.js; the hole is cut out of the ground with the stencil
// buffer so whatever falls in is really seen going down.
import * as THREE from 'three';
import { pixelRatio } from '../ui/quality.js';
import { FrameGuard } from '../ui/perfguard.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { KINDS, MILESTONES, CITIES, BIG, FAC, layoutCity, HALF, ROAD, BLOCK, NB, roadC, rng } from './city.js';
import { MODES, DIFFS, SKINS, TRAILS, pickMissions } from './meta.js';
import { vsfx, sfx as uisfx } from '../ui/audio.js';

export { MODES, DIFFS, SKINS };
const RIVAL_NAMES = ['Tombino', 'Crepa', 'Pozzanghera', 'Cratere', 'Gorgo', 'Risucchio', 'Fogna Reale', 'Tana', 'Abissino', 'Buca 47', 'Mulinello', 'Sprofondo'];
const RIVAL_COLORS = ['#ff4d6d', '#ffb000', '#2ec4b6', '#3a86ff', '#c77dff', '#80ed99', '#ff7b00', '#f15bb5', '#00bbf9', '#fee440'];
// the autopilot (tests, attract mode) plays like a strong human
const STRONG = { speed: 1, smart: 1, aggro: 0.9, react: 0.25 };

const R0 = 1.6, GROW = 0.25, EAT = 0.92;
const radiusOf = (pts) => R0 + GROW * Math.sqrt(Math.max(0, pts));
const BOUND = HALF + 4;
const CELL = 14;
const POWERS = {
  magnet: { name: 'Calamita', color: '#ff4d6d', dur: 8, icon: '🧲', desc: 'attira gli oggetti vicini' },
  speed: { name: 'Turbo', color: '#2ee6a6', dur: 7, icon: '⚡', desc: 'velocità +45%' },
  size: { name: 'Mega', color: '#ffc928', dur: 8, icon: '⬤', desc: 'voragine più grande' },
};
const ASSET = './assets/voragine/';

// ---------- sound: a thin bridge to the game-wide audio engine (shared context and effects bus,
// so it follows the volume settings and voice limits; works with the music turned off)
class Sfx {
  constructor(vol) { this.on = vol > 0; }
  gulp(size, k) { if (this.on) vsfx.gulp(size, k?.id || ''); }
  level() { if (this.on) vsfx.level(); }
  eatHole() { if (this.on) vsfx.rival(); }
  rivalGone() { if (this.on) vsfx.rivalGone(); }
  lost() { if (this.on) vsfx.lost(); }
  beep(hi) { if (this.on) vsfx.beep(hi); }
  tick(sec) { if (this.on) vsfx.tick(sec); }
  end(win) { if (this.on) vsfx.end(win); }
  coin() { if (this.on) try { uisfx.coin?.(); } catch {} }
  power() { if (this.on) try { uisfx.levelup?.(); } catch {} }
  whoosh() { if (this.on) try { uisfx.whoosh?.(); } catch {} }
  close() {}
}

// ---------- ground: one painted canvas for roads, kerbs, parks, plazas and docks
function groundTexture(city, renderer) {
  const { cfg, blocks } = city, E = HALF + ROAD / 2 + 8, S = 2048, k = S / (2 * E);
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const P = (v) => (v + E) * k;
  const col = cfg.pal;
  g.fillStyle = col.grass; g.fillRect(0, 0, S, S);
  g.fillStyle = col.asph;
  for (let i = 0; i <= NB; i++) { const c = roadC(i); g.fillRect(P(c - ROAD / 2), P(-HALF - ROAD / 2), ROAD * k, (2 * HALF + ROAD) * k); g.fillRect(P(-HALF - ROAD / 2), P(c - ROAD / 2), (2 * HALF + ROAD) * k, ROAD * k); }
  // worn asphalt: tyre tracks along the lanes, patches and cracks
  const rr = rng(cfg.seed + 3);
  g.globalAlpha = 0.09; g.fillStyle = '#000';
  for (let i = 0; i <= NB; i++) {
    const c = roadC(i);
    for (const o of [-3.4, -1.0, 1.0, 3.4]) { g.fillRect(P(c + o - 0.45), P(-HALF - ROAD / 2), 0.9 * k, (2 * HALF + ROAD) * k); g.fillRect(P(-HALF - ROAD / 2), P(c + o - 0.45), (2 * HALF + ROAD) * k, 0.9 * k); }
  }
  g.globalAlpha = 0.12;
  for (let i = 0; i < 260; i++) { const a = roadC((rr() * (NB + 1)) | 0) + (rr() - 0.5) * ROAD * 0.8, b = -HALF + rr() * 2 * HALF, w = 1 + rr() * 3, h = 1 + rr() * 2.5; g.fillStyle = rr() < 0.5 ? '#000' : '#fff'; if (rr() < 0.5) g.fillRect(P(a), P(b), w * k, h * k); else g.fillRect(P(b), P(a), h * k, w * k); }
  g.globalAlpha = 1;
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
  if (cfg.snow) { // snow banks along the kerbs
    g.fillStyle = 'rgba(240,245,250,.85)';
    for (let i = 0; i <= NB; i++) { const c = roadC(i); for (const o of [-ROAD / 2, ROAD / 2 - 1.1]) { g.fillRect(P(c + o), P(-HALF - ROAD / 2), 1.1 * k, (2 * HALF + ROAD) * k); g.fillRect(P(-HALF - ROAD / 2), P(c + o), (2 * HALF + ROAD) * k, 1.1 * k); } }
  }
  for (const b of blocks) {
    g.fillStyle = col.walk; g.fillRect(P(b.x0), P(b.z0), BLOCK * k, BLOCK * k);
    // kerb line
    g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 0.18 * k; g.strokeRect(P(b.x0) + 1, P(b.z0) + 1, BLOCK * k - 2, BLOCK * k - 2);
    const inner = b.type === 'park' || b.type === 'res' ? col.grass : b.type === 'plaza' || b.type === 'landmark' || b.type === 'rink' ? col.tile : b.type === 'parking' || b.type === 'yard' ? col.asph : b.type === 'dock' ? col.water : col.conc;
    g.fillStyle = inner; g.fillRect(P(b.x0 + 2.4), P(b.z0 + 2.4), (BLOCK - 4.8) * k, (BLOCK - 4.8) * k);
    // soft occlusion where the pavement meets the inner lot
    const grd = (x0, y0, x1, y1) => { const gg = g.createLinearGradient(P(x0), P(y0), P(x1), P(y1)); gg.addColorStop(0, 'rgba(0,0,0,.16)'); gg.addColorStop(1, 'rgba(0,0,0,0)'); return gg; };
    const i0 = b.x0 + 2.4, i1 = b.x0 + BLOCK - 2.4, j0 = b.z0 + 2.4, j1 = b.z0 + BLOCK - 2.4;
    if (b.type !== 'dock') {
      g.fillStyle = grd(i0, j0, i0, j0 + 1.2); g.fillRect(P(i0), P(j0), (i1 - i0) * k, 1.2 * k);
      g.fillStyle = grd(i0, j0, i0 + 1.2, j0); g.fillRect(P(i0), P(j0), 1.2 * k, (j1 - j0) * k);
    }
    if (b.type === 'plaza' || b.type === 'landmark') { g.strokeStyle = 'rgba(0,0,0,.08)'; g.lineWidth = 1; for (let t = 2.4; t < BLOCK - 2.4; t += 2) { g.beginPath(); g.moveTo(P(b.x0 + t), P(b.z0 + 2.4)); g.lineTo(P(b.x0 + t), P(b.z0 + BLOCK - 2.4)); g.stroke(); g.beginPath(); g.moveTo(P(b.x0 + 2.4), P(b.z0 + t)); g.lineTo(P(b.x0 + BLOCK - 2.4), P(b.z0 + t)); g.stroke(); } }
    if (b.type === 'park') { g.fillStyle = col.walk; g.beginPath(); g.arc(P(b.x0 + BLOCK / 2), P(b.z0 + BLOCK / 2), 6.5 * k, 0, Math.PI * 2); g.fill(); g.fillRect(P(b.x0 + BLOCK / 2 - 1), P(b.z0 + 2.4), 2 * k, (BLOCK - 4.8) * k); }
    if (b.type === 'parking') { g.strokeStyle = col.line; g.lineWidth = 0.15 * k; for (let r = 0; r < 4; r++) for (let c = 0; c <= 6; c++) { const x = b.x0 + 1.8 + c * 4.4, z = b.z0 + 2.6 + r * 6.6; g.beginPath(); g.moveTo(P(x), P(z)); g.lineTo(P(x), P(z + 4.8)); g.stroke(); } }
    if (b.type === 'yard') { g.strokeStyle = 'rgba(255,214,0,.55)'; g.lineWidth = 0.2 * k; for (const z of [-5.8, 0, 5.8]) { g.beginPath(); g.moveTo(P(b.x0 + 3), P(b.z0 + BLOCK / 2 + z)); g.lineTo(P(b.x0 + BLOCK - 3), P(b.z0 + BLOCK / 2 + z)); g.stroke(); } }
    if (b.type === 'res') { g.fillStyle = 'rgba(0,0,0,.07)'; for (let i = -1; i <= 1; i++) g.fillRect(P(b.x0 + BLOCK / 2 + i * 9 - 0.7), P(b.z0 + 2.4), 1.4 * k, (BLOCK - 4.8) * k); }
    if (b.type === 'rink') { g.fillStyle = '#cfe9f7'; const x = b.x0 + 4.5, z = b.z0 + 6, w = BLOCK - 9, h = BLOCK - 12; g.fillRect(P(x), P(z), w * k, h * k); g.strokeStyle = '#ffffff'; g.lineWidth = 0.5 * k; g.strokeRect(P(x), P(z), w * k, h * k); g.strokeStyle = 'rgba(80,140,200,.35)'; g.lineWidth = 0.12 * k; for (let i = 0; i < 18; i++) { g.beginPath(); g.ellipse(P(b.x0 + BLOCK / 2), P(b.z0 + BLOCK / 2), (3 + i * 0.5) * k, (2 + i * 0.32) * k, 0, 0, Math.PI * 2); g.stroke(); } }
    if (b.type === 'dock') { g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 0.12 * k; for (let i = 0; i < 26; i++) { const x = b.x0 + 3 + ((i * 7.3) % (BLOCK - 7)), z = b.z0 + 3 + ((i * 4.1) % (BLOCK - 7)); g.beginPath(); g.moveTo(P(x), P(z)); g.quadraticCurveTo(P(x + 1), P(z - 0.4), P(x + 2), P(z)); g.stroke(); } g.strokeStyle = '#6b6258'; g.lineWidth = 0.5 * k; g.strokeRect(P(b.x0 + 2.4), P(b.z0 + 2.4), (BLOCK - 4.8) * k, (BLOCK - 4.8) * k); }
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); t.generateMipmaps = true;
  return { tex: t, size: 2 * E, mini: cv };
}

// gradient used for the inside of the hole: rim colour at the top, black within a few metres
function wellTexture(color) {
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 256;
  const g = cv.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, color); gr.addColorStop(0.03, '#3a2a30'); gr.addColorStop(0.06, '#140a22'); gr.addColorStop(0.2, '#000'); gr.addColorStop(1, '#000');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 256);
  // strata in the soil near the top
  g.globalAlpha = 0.35; for (let i = 0; i < 40; i++) { g.fillStyle = i % 2 ? '#5b4636' : '#2a1f19'; g.fillRect((i * 13) % 64, 6 + (i * 7) % 40, 6 + (i % 5) * 3, 2); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.repeat.set(4, 1); return t;
}

// ---------- shader patch shared by every city object: baked base occlusion, per-instance facade
// variety, animated water. Same code for every material, so programs are shared.
function patchObject(mat, uni) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uAo = uni.ao; sh.uniforms.uFac = uni.fac; sh.uniforms.uTime = uni.time; sh.uniforms.uCut = uni.cut; sh.uniforms.uCamP = uni.camP;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform vec2 uFac; varying vec3 vLocal; varying vec3 vWorld;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>
#if defined(USE_MAP) && defined(USE_INSTANCING)
  if (uFac.x > 0.0) { float hI = fract(sin(float(gl_InstanceID) * 12.9898 + 4.1) * 43758.5453); vec2 sh = vec2(floor(hI * uFac.x) / uFac.x, floor(fract(hI * 7.13) * uFac.y) / uFac.y); vMapUv += sh;
  #ifdef USE_EMISSIVEMAP
    vEmissiveMapUv += sh;
  #endif
  }
#endif`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocal = position;\n{ vec4 wp = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\n wp = instanceMatrix * wp;\n#endif\n vWorld = (modelMatrix * wp).xyz; }');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uAo; uniform float uTime; uniform vec4 uCut; uniform vec3 uCamP; varying vec3 vLocal; varying vec3 vWorld;')
      .replace('void main() {', `void main() {
  // see-through dither on whatever stands between the camera and the player's hole
  if (uCut.w > 0.0 && vWorld.y > 3.5 && length(vWorld.xz - uCut.xz) > uCut.w * 1.02) {
    vec3 a = uCamP, ab = vec3(uCut.x, 0.0, uCut.z) - a; float t = clamp(dot(vWorld - a, ab) / dot(ab, ab), 0.0, 1.0);
    float d = length(vWorld - (a + ab * t)), R = uCut.w * 1.15 + 3.0;
    if (t < 0.995 && d < R) { vec2 f = floor(mod(gl_FragCoord.xy, 4.0)); float b = mod(f.x * 2.0 + f.y * 3.0 + f.x * f.y, 4.0) / 4.0 + 0.125; if (smoothstep(R, R * 0.55, d) * 0.85 > b) discard; }
  }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  diffuseColor.rgb *= mix(uAo.y, 1.0, smoothstep(0.0, uAo.x, vLocal.y));
  if (uAo.z > 0.5) { float w = sin(length(vLocal.xz) * 7.0 - uTime * 4.0) * 0.5 + 0.5; float w2 = sin(vLocal.x * 5.0 + uTime * 2.3) * sin(vLocal.z * 4.0 - uTime * 1.7); diffuseColor.rgb += w * 0.16 + w2 * 0.07; }`);
  };
  mat.customProgramCacheKey = () => 'vg-obj';
  return mat;
}

// ---------- particles: one pool, CPU simulated, soft round points sized in world units
class Particles {
  constructor(scene, n, additive) {
    this.n = n; this.i = 0; this.alive = 0;
    this.pos = new Float32Array(n * 3).fill(-9999); this.vel = new Float32Array(n * 3); this.col = new Float32Array(n * 3);
    this.amax = new Float32Array(n); this.size = new Float32Array(n); this.alpha = new Float32Array(n); this.life = new Float32Array(n); this.max = new Float32Array(n); this.grav = new Float32Array(n); this.drag = new Float32Array(n); this.floor = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.uScale = { value: 400 };
    const m = new THREE.ShaderMaterial({
      uniforms: { uScale: this.uScale },
      vertexShader: 'attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA; uniform float uScale; void main(){ vC = color; vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = alpha > 0.0 ? clamp(size * uScale / max(1.0, -mv.z), 1.0, 48.0) : 0.0; }',
      fragmentShader: `varying vec3 vC; varying float vA; void main(){ vec2 d = gl_PointCoord - 0.5; float r = dot(d, d) * 4.0; if (r > 1.0) discard; float a = vA * (${additive ? '1.0 - r' : 'pow(1.0 - r, 1.3)'}); gl_FragColor = vec4(vC${additive ? ' * a' : ''}, ${additive ? '1.0' : 'a'}); }`,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.pts = new THREE.Points(g, m); this.pts.frustumCulled = false; this.pts.renderOrder = 5; scene.add(this.pts);
  }
  emit(x, y, z, vx, vy, vz, c, size, life, grav = 14, drag = 0.5, floor = 0.05, amax = 1) {
    const i = this.i = (this.i + 1) % this.n, j = i * 3;
    this.pos[j] = x; this.pos[j + 1] = y; this.pos[j + 2] = z; this.vel[j] = vx; this.vel[j + 1] = vy; this.vel[j + 2] = vz;
    this.col[j] = c.r; this.col[j + 1] = c.g; this.col[j + 2] = c.b; this.size[i] = size; this.life[i] = this.max[i] = life; this.grav[i] = grav; this.drag[i] = drag; this.floor[i] = floor; this.alpha[i] = amax; this.amax[i] = amax;
    this.dirty = true;
  }
  update(dt) {
    if (!this.dirty) return;
    let any = false;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt; const j = i * 3;
      if (this.life[i] <= 0) { this.alpha[i] = 0; this.pos[j + 1] = -9999; continue; }
      any = true;
      const d = Math.exp(-this.drag[i] * dt);
      this.vel[j] *= d; this.vel[j + 2] *= d; this.vel[j + 1] = this.vel[j + 1] * d - this.grav[i] * dt;
      this.pos[j] += this.vel[j] * dt; this.pos[j + 1] += this.vel[j + 1] * dt; this.pos[j + 2] += this.vel[j + 2] * dt;
      if (this.pos[j + 1] < this.floor[i] && this.floor[i] > -100) { this.pos[j + 1] = this.floor[i]; this.vel[j + 1] *= -0.3; this.vel[j] *= 0.7; this.vel[j + 2] *= 0.7; }
      const t = this.life[i] / this.max[i]; this.alpha[i] = Math.min(1, t * 2.5) * this.amax[i];
    }
    const a = this.pts.geometry.attributes;
    a.position.needsUpdate = a.alpha.needsUpdate = a.color.needsUpdate = a.size.needsUpdate = true;
    this.dirty = any;
  }
}

const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpQ2 = new THREE.Quaternion(), tmpE = new THREE.Euler(0, 0, 0, 'YXZ'), tmpP = new THREE.Vector3(), tmpS = new THREE.Vector3(), tmpV = new THREE.Vector3(), tmpA = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const TC = new THREE.Color();

export class VoragineGame {
  constructor(root, opts) {
    this.root = root;
    this.o = { mode: 'classica', city: 'centro', diff: 'normale', skin: 'notte', trail: 'nessuna', tier: 'high', volume: 0.5, daily: null, ...opts };
    this.mode = MODES[this.o.mode] || MODES.classica;
    this.diff = DIFFS[this.o.diff] || DIFFS.normale;
    this.seed = this.o.daily?.seed ?? ((Date.now() & 0xffffff) + 7);
    this.rand = rng(this.seed);
    this.paused = false; this.over = false; this.time = this.mode.time; this.count = 3;
    this.keys = new Set(); this.pointer = null; this.joy = null;
    this.h = []; this.objs = []; this.movers = []; this.grid = new Map(); this.popAcc = 0; this.popT = 0;
    this.stats = { eaten: 0, holes: 0, biggest: '', start: 0, powers: 0, kinds: {} };
    this.uTime = { value: 0 }; this.uCut = { value: new THREE.Vector4(0, 0, 0, 0) }; this.uCamP = { value: new THREE.Vector3() }; this.clock = 0; this.timers = []; this.waves = []; this.wobbling = new Set(); this.powers = []; this.powerT = 14;
    this.shake = 0; this.slow = null;
  }

  async start() {
    const o = this.o, root = this.root;
    root.innerHTML = `<canvas class="vg-cv"></canvas><div class="vg-hud">
      <div class="vg-slow" id="vg-slow"><b id="vg-slow-t"></b></div><div class="vg-flash" id="vg-flash"></div>
      <div class="vg-top" id="vg-topbox"><div class="vg-timer" id="vg-timer">2:00</div><div class="vg-mode">${o.daily ? 'Sfida del giorno · ' : ''}${this.mode.name} · ${CITIES[o.city]?.name || ''}</div></div><div class="vg-pw" id="vg-pw"></div>
      <div class="vg-left" id="vg-left"><ol class="vg-board" id="vg-board"></ol><ul class="vg-miss" id="vg-miss"></ul></div>
      <div class="vg-score" id="vg-sc"><div class="vg-score-k">Punti</div><div class="vg-score-v" id="vg-score">0</div><div class="vg-eat" id="vg-eat"></div></div>
      <div class="vg-level" id="vg-levelbox"><div class="vg-level-row"><span id="vg-lvl">Livello 1</span><span id="vg-next"></span></div><div class="vg-bar"><i id="vg-bar"></i></div></div>
      <canvas class="vg-mini" id="vg-mini" width="160" height="160"></canvas>
      <button class="vg-pausebtn" id="vg-pausebtn" aria-label="Pausa">II</button>
      <div class="vg-labels" id="vg-labels"></div><div class="vg-pops" id="vg-pops"></div>
            <div class="vg-toast" id="vg-toast"></div><div class="vg-combo" id="vg-combo"></div><div class="vg-count" id="vg-count"></div>
      <div class="vg-joy" id="vg-joy"><i></i></div>
    </div>`;
    this.cv = root.querySelector('.vg-cv');
    this.$ = (id) => root.querySelector('#' + id);
    const tier = this.tier = o.tier;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas: this.cv, antialias: tier !== 'low', stencil: true, powerPreference: 'high-performance' });
    r.setPixelRatio(pixelRatio(1.75));
    // frame-time watchdog: resolution first, then bloom and shadows, then below 1x
    const setPR = (pr) => { if (Math.abs(r.getPixelRatio() - pr) < 0.01) return false; r.setPixelRatio(pr); this.composer?.setPixelRatio?.(pr); this.resize(); };
    this.guard = new FrameGuard([
      { fps: 40, run: () => setPR(1) },
      { fps: 34, run: () => { if (!this.composer && !r.shadowMap.enabled) return false; this.composer?.dispose?.(); this.composer = null; r.shadowMap.enabled = false; this.scene?.traverse((o) => { if (o.material) o.material.needsUpdate = true; }); } },
      { fps: 27, run: () => setPR(0.75) },
    ]);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = tier !== 'low'; r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.sfx = new Sfx(o.volume);
    this.texLoader = new THREE.TextureLoader();
    this.texCache = new Map();

    const city = this.city = layoutCity(o.city, o.daily?.seed);
    const cfg = this.cfg = city.cfg;
    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color(cfg.sky);
    scene.fog = new THREE.Fog(cfg.fog, 140, 520);
    // gradient sky dome: deep zenith, glowing horizon (fog colour), so the horizon never looks flat
    {
      const zen = new THREE.Color(cfg.sky).multiplyScalar(cfg.night ? 0.55 : 0.82), hor = new THREE.Color(cfg.fog).lerp(new THREE.Color(cfg.sun), 0.25);
      const g = new THREE.SphereGeometry(1300, 24, 16), col = [], pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) { const t = Math.max(0, pos.getY(i) / 1300); const c = hor.clone().lerp(zen, Math.pow(t, 0.55)); col.push(c.r, c.g, c.b); }
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      const sky = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
      sky.renderOrder = -10; this.sky = sky; scene.add(sky);
    }
    this.cam = new THREE.PerspectiveCamera(48, 1, 1, 1600);
    scene.add(new THREE.HemisphereLight(cfg.night ? '#6d7bd6' : cfg.snow ? '#e8f0ff' : '#dfeeff', cfg.night ? '#1a1c2a' : cfg.snow ? '#9aa6b8' : '#5a6b4a', cfg.amb));
    const sun = this.sun = new THREE.DirectionalLight(cfg.sun, cfg.night ? 0.55 : cfg.snow ? 1.55 : 1.9);
    sun.castShadow = r.shadowMap.enabled; sun.shadow.mapSize.set(tier === 'high' ? 2048 : 1024, tier === 'high' ? 2048 : 1024); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.4;
    scene.add(sun, sun.target);
    if (cfg.night) scene.add(new THREE.AmbientLight('#3b3f7a', 0.5));

    // ground (+ the stencil cut for every hole); a tiling asphalt grain on top of the painted map
    const gt = groundTexture(city, r);
    this.miniBase = gt.mini;
    const stencilOut = { stencilWrite: true, stencilRef: 1, stencilFunc: THREE.NotEqualStencilFunc, stencilZPass: THREE.KeepStencilOp, stencilFail: THREE.KeepStencilOp };
    const gmat = new THREE.MeshLambertMaterial({ map: gt.tex, ...stencilOut });
    if (tier !== 'low') {
      const det = this.tex('../tex/asphalt_02_diff_1k.jpg', false);
      gmat.onBeforeCompile = (sh) => {
        sh.uniforms.uDet = { value: det };
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vG;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvG = position.xz;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D uDet; varying vec2 vG;')
          .replace('#include <map_fragment>', '#include <map_fragment>\n{ vec3 d = texture2D(uDet, vG * 0.11).rgb; vec3 d2 = texture2D(uDet, vG * 0.027 + 0.37).rgb; float l = dot(d, vec3(0.333)) * 0.65 + dot(d2, vec3(0.333)) * 0.35; diffuseColor.rgb *= mix(1.0, l * 2.1, 0.42); }');
      };
    }
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(gt.size, gt.size).rotateX(-Math.PI / 2), gmat);
    ground.receiveShadow = true; ground.renderOrder = -2; scene.add(ground);
    const outer = new THREE.Mesh(new THREE.RingGeometry(gt.size * 0.5, 1400, 4, 1).rotateX(-Math.PI / 2).rotateY(Math.PI / 4), new THREE.MeshLambertMaterial({ color: cfg.outer, ...stencilOut }));
    outer.position.y = -0.02; outer.renderOrder = -2; scene.add(outer);
    // a ring of non-edible hills beyond the city so the horizon is not empty (the port opens on the sea)
    const hillG = new THREE.ConeGeometry(1, 1, 7); const hillM = new THREE.MeshLambertMaterial({ color: cfg.hill, flatShading: true });
    const hills = new THREE.InstancedMesh(hillG, hillM, 60); const hr = rng(cfg.seed + 5); let nh = 0;
    for (let i = 0; i < 60; i++) { const a = (i / 60) * Math.PI * 2, d = 230 + hr() * 120, s = 30 + hr() * 50, sy = 0.6 + hr() * 0.8; if (cfg.docks && Math.sin(a) > -0.2) continue; tmpM.compose(tmpP.set(Math.cos(a) * d, s * 0.45, Math.sin(a) * d), tmpQ.identity(), tmpS.set(s, s * sy, s)); hills.setMatrixAt(nh++, tmpM); }
    hills.count = nh; scene.add(hills);

    if (tier === 'high') {
      const rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, stencilBuffer: true, depthBuffer: true, samples: 4 });
      this.composer = new EffectComposer(r, rt);
      this.composer.addPass(new RenderPass(scene, this.cam));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), cfg.night ? 0.5 : 0.18, 0.35, cfg.night ? 0.85 : 0.97);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    }
    this.buildObjects();
    this.buildHoles();
    this.buildFx();
    this.missions = pickMissions(this.rand, this.kindCounts, this.o.mode, cfg.landmark);
    this.renderMissions();
    this.bindInput();
    this.resize();
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(root);
    this.last = performance.now(); this.stats.start = Date.now();
    this.updateCamera(1, true);
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
    document.activeElement?.blur?.();
  }
  tex(name, srgb = true) {
    if (this.texCache.has(name)) return this.texCache.get(name);
    const t = this.texLoader.load(ASSET + name);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = this.tier === 'low' ? 1 : 4;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    this.texCache.set(name, t); return t;
  }

  // ---------- city objects as instanced meshes
  matFor(role, k, fac) {
    const cfg = this.cfg, night = cfg.night;
    const uni = { ao: { value: new THREE.Vector3(k.ao, 0.5, role === 'water' ? 1 : 0) }, fac: { value: new THREE.Vector2(0, 0) }, time: this.uTime, cut: this.uCut, camP: this.uCamP };
    if (role === 'glow') return night ? new THREE.MeshBasicMaterial({ vertexColors: true, color: '#d8d0bc' }) : new THREE.MeshLambertMaterial({ vertexColors: true, color: cfg.sunset ? '#c7b9a0' : '#8fa3b8', emissive: cfg.sunset ? '#3a2a14' : '#000000' });
    if (role === 'beam' || role === 'pool') return new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    if (role === 'water') return patchObject(new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.88, emissive: night ? '#0d2a44' : '#123c58' }), uni);
    if (role === 'facade') {
      const F = FAC[fac]; uni.fac.value.set(F.c, F.r);
      const lit = night ? 1.05 : cfg.sunset ? 0.3 : 0;
      const m = new THREE.MeshLambertMaterial({ map: this.tex(`f_${fac}.webp`), color: night ? '#9aa0b8' : '#ffffff', ...(lit ? { emissiveMap: this.tex(`f_${fac}_e.webp`), emissive: '#ffffff', emissiveIntensity: lit } : {}) });
      uni.ao.value.y = 0.6;
      return patchObject(m, uni);
    }
    return patchObject(new THREE.MeshLambertMaterial({ vertexColors: true }), uni);
  }
  buildObjects() {
    const { items, movers, cfg } = this.city;
    const counts = {};
    for (const it of items) counts[it.kind] = (counts[it.kind] || 0) + 1;
    for (const m of movers) counts[m.kind] = (counts[m.kind] || 0) + 1;
    this.kindCounts = counts;
    this.meshes = {};
    const tr = rng(cfg.seed + 99), tc = new THREE.Color();
    const big = (k) => k.r >= 1.2;
    for (const [id, n] of Object.entries(counts)) {
      const k = KINDS[id], parts = k.build();
      const list = [];
      parts.forEach((p, pi) => {
        const geom = p.isBufferGeometry ? p : p.g;
        const role = p.isBufferGeometry ? (pi === 0 ? 'base' : k.glow ? 'glow' : 'detail') : p.role;
        if ((role === 'beam' || role === 'pool') && !cfg.night) return;
        const m = new THREE.InstancedMesh(geom, this.matFor(role, k, p.fac), n);
        m.castShadow = big(k) && (role === 'base' || role === 'facade' || role === 'detail') && this.renderer.shadowMap.enabled; m.receiveShadow = false;
        m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        if (role === 'beam' || role === 'pool' || role === 'water') m.renderOrder = 2;
        this.scene.add(m);
        list.push({ m, role, pi, pick: !!k.pick?.includes(pi) });
      });
      this.meshes[id] = { list, n: 0 };
    }
    const place = (kind, x, z, rot, s, mover = null) => {
      const k = KINDS[kind], M = this.meshes[kind], i = M.n++;
      const ob = { k, i, x, z, y: 0, rot, s, r: k.r * s, h: k.h * s, pts: k.pts * s * s, st: 0, lean: 0, mover, ox: x, oz: z, pick: k.pick ? k.pick[(tr() * k.pick.length) | 0] : -1 };
      tc.set(k.tint[(tr() * k.tint.length) | 0]); if (k.tint.length > 1) tc.offsetHSL(0, 0, (tr() - 0.5) * 0.06);
      for (const e of M.list) {
        if (e.role === 'base') e.m.setColorAt(i, tc);
        else if (e.role === 'facade') { TC.copy(tc).lerp(new THREE.Color('#ffffff'), 0.55); e.m.setColorAt(i, TC); }
      }
      this.objs.push(ob); this.setMatrix(ob);
      return ob;
    };
    for (const it of items) { const ob = place(it.kind, it.x, it.z, it.rot, it.s); this.gridAdd(ob); if (ob.k.id === 'boat' || ob.k.id === 'yacht') (this.bobbers || (this.bobbers = [])).push(ob); }
    for (const m of movers) {
      const x = m.axis === 'x' ? m.t : m.line, z = m.axis === 'x' ? m.line : m.t;
      const rot = m.axis === 'x' ? (m.dir > 0 ? 0 : Math.PI) : (m.dir > 0 ? -Math.PI / 2 : Math.PI / 2);
      this.movers.push(place(m.kind, x, z, rot, m.s, m));
    }
    for (const { list } of Object.values(this.meshes)) for (const e of list) { e.m.instanceMatrix.needsUpdate = true; if (e.m.instanceColor) e.m.instanceColor.needsUpdate = true; }
    this.totalPts = this.objs.reduce((a, b) => a + b.pts, 0);
    this.eatenPts = 0; this.myPts = 0;
  }
  setMatrix(ob) {
    const M = this.meshes[ob.k.id];
    if (ob.st === 2) { for (const e of M.list) e.m.setMatrixAt(ob.i, ZERO); M.dirty = true; return; }
    if (ob.q) { // falling: the orientation turns around the centre of mass
      tmpQ.copy(ob.q);
      tmpV.set(0, ob.h * 0.45, 0).applyQuaternion(tmpQ);
      tmpP.set(ob.x - tmpV.x, ob.cy - tmpV.y, ob.z - tmpV.z);
    } else {
      tmpE.set(0, ob.rot, 0); tmpQ.setFromEuler(tmpE);
      if (ob.lean) { tmpQ2.setFromAxisAngle(tmpA.set(ob.lax, 0, ob.laz), ob.lean); tmpQ.premultiply(tmpQ2); }
      tmpP.set(ob.x, ob.y, ob.z);
    }
    tmpM.compose(tmpP, tmpQ, tmpS.set(ob.s, ob.s, ob.s));
    for (const e of M.list) e.m.setMatrixAt(ob.i, (e.pick && e.pi !== ob.pick) || (e.role === 'beam' && !ob.mover) ? ZERO : tmpM);
    M.dirty = true;
  }
  gridKey(cx, cz) { return cx * 1000 + cz; }
  gridAdd(ob) { const k = ob.gk = this.gridKey(Math.floor(ob.x / CELL), Math.floor(ob.z / CELL)); let a = this.grid.get(k); if (!a) this.grid.set(k, (a = [])); a.push(ob); }
  gridMove(ob) { const k = this.gridKey(Math.floor(ob.x / CELL), Math.floor(ob.z / CELL)); if (k === ob.gk) return; const a = this.grid.get(ob.gk); if (a) { const j = a.indexOf(ob); if (j >= 0) a.splice(j, 1); } this.gridAdd(ob); }
  query(x, z, rad, out) {
    out.length = 0;
    const x0 = Math.floor((x - rad) / CELL), x1 = Math.floor((x + rad) / CELL), z0 = Math.floor((z - rad) / CELL), z1 = Math.floor((z + rad) / CELL);
    for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) { const a = this.grid.get(this.gridKey(i, j)); if (a) for (const ob of a) if (ob.st === 0) out.push(ob); }
    return out;
  }

  // ---------- effects: dust and debris, confetti, sparks, shock rings, trail, snowfall
  buildFx() {
    const low = this.tier === 'low';
    this.fx = new Particles(this.scene, low ? 400 : 1400, false);
    this.glow = new Particles(this.scene, low ? 300 : 1100, true);
    this.trail = TRAILS.find((t) => t.id === this.o.trail && t.colors.length) || null;
    this.trailT = 0;
    if (this.cfg.snow) {
      const N = low ? 350 : 1100, g = new THREE.BufferGeometry(), p = new Float32Array(N * 3), r = rng(5);
      for (let i = 0; i < N; i++) { p[i * 3] = (r() - 0.5) * 160; p[i * 3 + 1] = r() * 70; p[i * 3 + 2] = (r() - 0.5) * 160; }
      g.setAttribute('position', new THREE.BufferAttribute(p, 3).setUsage(THREE.DynamicDrawUsage));
      this.snow = new THREE.Points(g, new THREE.PointsMaterial({ color: '#ffffff', size: 0.45, transparent: true, opacity: 0.85, depthWrite: false }));
      this.snow.frustumCulled = false; this.snowSeed = p.slice(); this.scene.add(this.snow);
    }
  }
  puff(x, z, r, color) {
    const n = Math.min(this.tier === 'low' ? 24 : 60, Math.round(4 + r * 5)), c = new THREE.Color(color);
    for (let k = 0; k < n; k++) {
      const a = this.rand() * Math.PI * 2, rr = r * (0.4 + this.rand() * 0.8), sp = 2 + this.rand() * (3 + r * 0.6), l = 0.55 + this.rand() * 0.35;
      TC.setRGB(c.r * l + 0.25, c.g * l + 0.23, c.b * l + 0.2);
      this.fx.emit(x + Math.cos(a) * rr, 0.3 + this.rand() * r * 0.4, z + Math.sin(a) * rr, Math.cos(a) * sp * 0.6, 3 + this.rand() * (4 + r * 0.5), Math.sin(a) * sp * 0.6, TC, 0.45 + Math.min(1.2, r * 0.09) + this.rand() * 0.4, 0.6 + this.rand() * 0.7, 14, 0.9, 0.05, 0.6);
    }
  }
  confetti(x, z, r, n = 110) {
    const cols = ['#ff3d7f', '#ffc928', '#2ee6a6', '#1e90ff', '#8b5cff', '#ffffff', '#ff7b00'];
    for (let i = 0; i < n; i++) {
      const a = this.rand() * Math.PI * 2, sp = 4 + this.rand() * 6 + r * 0.4;
      TC.set(cols[i % cols.length]);
      this.fx.emit(x + Math.cos(a) * r, 0.5, z + Math.sin(a) * r, Math.cos(a) * sp * 0.5, 10 + this.rand() * 10 + r * 0.6, Math.sin(a) * sp * 0.5, TC, 0.45 + r * 0.035, 2 + this.rand() * 1.2, 7, 1.6);
    }
  }
  firework(x, y, z, color, n = 70, sp = 13) {
    const c = new THREE.Color(color);
    for (let i = 0; i < n; i++) {
      const u = this.rand() * 2 - 1, t = this.rand() * Math.PI * 2, s = Math.sqrt(1 - u * u), v = sp * (0.75 + this.rand() * 0.3);
      TC.copy(c).lerp(new THREE.Color('#ffffff'), this.rand() * 0.4);
      this.glow.emit(x, y, z, s * Math.cos(t) * v, u * v, s * Math.sin(t) * v, TC, 0.45 + sp * 0.025, 1 + this.rand() * 0.6, 6, 1.4, -1e9);
    }
  }
  shockwave(x, z, r, color) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    m.position.set(x, 0.3, z); m.scale.setScalar(r); this.scene.add(m);
    this.waves.push({ m, t: 0, r });
  }
  later(t, fn) { this.timers.push({ t, fn }); }
  updateFx(dt) {
    for (let i = this.timers.length - 1; i >= 0; i--) { const T = this.timers[i]; T.t -= dt; if (T.t <= 0) { this.timers.splice(i, 1); T.fn(); } }
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i]; w.t += dt;
      const k = w.t / 0.8; w.m.scale.setScalar(w.r * (1 + k * 3.2)); w.m.material.opacity = 0.9 * (1 - k);
      if (k >= 1) { this.scene.remove(w.m); w.m.geometry.dispose(); w.m.material.dispose(); this.waves.splice(i, 1); }
    }
    // trail behind the player's hole
    const me = this.me, v = Math.hypot(me.vx, me.vz);
    if (this.trail && me.alive && v > 2) {
      this.trailT -= dt;
      while (this.trailT <= 0) {
        this.trailT += this.tier === 'low' ? 0.05 : 0.022;
        const T = this.trail, a = this.rand() * Math.PI * 2, back = me.r * 0.95;
        const x = me.x - (me.vx / v) * back + Math.cos(a) * me.r * 0.35, z = me.z - (me.vz / v) * back + Math.sin(a) * me.r * 0.35;
        if (T.id === 'arcobaleno') TC.setHSL((this.clock * 0.6) % 1, 0.95, 0.6); else TC.set(T.colors[(this.rand() * T.colors.length) | 0]);
        const sys = T.add ? this.glow : this.fx, s = (0.35 + me.r * 0.05) * (T.twinkle ? 0.8 + this.rand() * 0.9 : 1);
        sys.emit(x, 0.25, z, (this.rand() - 0.5) * 1.5, T.float ? 1.5 + this.rand() * 2.5 : 0.6 + this.rand(), (this.rand() - 0.5) * 1.5, TC, s, 0.55 + this.rand() * 0.5, T.float ? -1.5 : 3, 1.2);
      }
    }
    this.fx.update(dt); this.glow.update(dt);
  }
  updateSnow(dt) {
    if (!this.snow) return;
    const p = this.snow.geometry.attributes.position, a = p.array, cx = this.camT?.x || 0, cz = this.camT?.z || 0, t = this.clock;
    for (let i = 0; i < p.count; i++) {
      const j = i * 3;
      const top = Math.max(12, (this.camH || 40) * 0.65);
      a[j + 1] -= dt * (3.2 + (i % 7) * 0.25);
      if (a[j + 1] < 0) a[j + 1] += top; else if (a[j + 1] > top) a[j + 1] -= top;
      let x = this.snowSeed[j] + Math.sin(t * 0.7 + i) * 1.4, z = this.snowSeed[j + 2] + Math.cos(t * 0.5 + i * 1.3) * 1.4;
      x = ((x - cx + 80) % 160 + 160) % 160 - 80 + cx; z = ((z - cz + 80) % 160 + 160) % 160 - 80 + cz;
      a[j] = x; a[j + 2] = z;
    }
    p.needsUpdate = true;
  }

  // ---------- holes
  buildHoles() {
    const o = this.o, skin = SKINS.find((s) => s.id === o.skin) || SKINS[0];
    const spots = [];
    for (let i = 1; i < NB; i++) for (let j = 1; j < NB; j++) spots.push([roadC(i), roadC(j)]);
    for (let i = 0; i < NB; i++) for (const j of [0, NB]) { spots.push([roadC(i) + 21, roadC(j)]); spots.push([roadC(j), roadC(i) + 21]); }
    const sr = this.rand;
    for (let i = spots.length - 1; i > 0; i--) { const j = (sr() * (i + 1)) | 0; [spots[i], spots[j]] = [spots[j], spots[i]]; }
    // the player starts on an inner crossroad
    const inner = spots.findIndex(([x, z]) => Math.abs(x) < HALF * 0.6 && Math.abs(z) < HALF * 0.6);
    if (inner > 0) [spots[0], spots[inner]] = [spots[inner], spots[0]];
    const names = [...RIVAL_NAMES].sort(() => sr() - 0.5);
    const cols = RIVAL_COLORS.filter((c) => c.toLowerCase() !== skin.color.toLowerCase());
    this.h.push(this.makeHole({ name: 'Tu', color: skin.color, rainbow: skin.rainbow, hue: skin.hue, player: true, x: spots[0][0], z: spots[0][1] }));
    for (let i = 0; i < this.mode.rivals; i++) this.h.push(this.makeHole({ name: names[i], color: cols[i % cols.length], x: spots[i + 1][0], z: spots[i + 1][1] }));
    this.me = this.h[0];
    this.spots = spots;
  }
  makeHole({ name, color, rainbow, hue, player, x, z }) {
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
    const band = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.1, 64, 1, 0, Math.PI * 0.6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.55), transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
    // cracked ground around the rim: darker asphalt ring that fades out
    const crackCv = document.createElement('canvas'); crackCv.width = 256; crackCv.height = 8;
    { const c = crackCv.getContext('2d'), gr = c.createLinearGradient(0, 0, 256, 0); gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = gr; c.fillRect(0, 0, 256, 8); }
    const crackTex = new THREE.CanvasTexture(crackCv);
    const ringG = new THREE.RingGeometry(1.0, 1.6, 64, 1); const uv = ringG.attributes.uv, pp = ringG.attributes.position;
    for (let i = 0; i < uv.count; i++) { const d = Math.hypot(pp.getX(i), pp.getY(i)); uv.setXY(i, (d - 1) / 0.6, 0.5); }
    const shade = new THREE.Mesh(ringG.rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: crackTex, transparent: true, depthWrite: false, opacity: 0.8 }));
    shade.position.y = 0.045;
    g.add(mask, well, bottom, shade, rim, glow, band);
    this.scene.add(g);
    const lab = document.createElement('div'); lab.className = 'vg-lab' + (player ? ' me' : ''); lab.style.setProperty('--c', color); lab.innerHTML = `<b>${name}</b>`;
    this.$('vg-labels').appendChild(lab);
    const h = { name, color, rainbow, hue, player: !!player, x, z, vx: 0, vz: 0, pts: 0, r: R0, alive: true, out: false, respawn: 0, g, well, bottom, rim, glow, band, shade, lab, kills: 0, eaten: 0, ai: { t: 0, tx: x, tz: z, wob: this.rand() * 10 }, lvl: 0, depth: 0, pw: null, pulse: 0 };
    this.applyHoleSize(h);
    return h;
  }
  applyHoleSize(h) {
    const r = h.r, depth = Math.max(26, r * 5);
    h.depth = depth;
    h.g.position.set(h.x, 0, h.z);
    const pr = r * (1 + (h.pulse || 0) * 0.06);
    h.g.children[0].scale.setScalar(r);
    h.well.scale.set(r, depth, r);
    h.bottom.scale.setScalar(r); h.bottom.position.y = -depth;
    h.rim.scale.setScalar(pr); h.glow.scale.setScalar(pr);
    h.shade?.scale.setScalar(r);
  }

  // ---------- power-ups: rare pick-ups on the crossroads
  spawnPower() {
    const types = Object.keys(POWERS), type = types[(this.rand() * types.length) | 0];
    const free = this.spots.filter(([x, z]) => this.h.every((h) => !h.alive || Math.hypot(h.x - x, h.z - z) > h.r + 22) && this.powers.every((p) => Math.hypot(p.x - x, p.z - z) > 40));
    if (!free.length) return;
    const [x, z] = free[(this.rand() * free.length) | 0], P = POWERS[type];
    const g = new THREE.Group();
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(1.1, 0), new THREE.MeshBasicMaterial({ color: P.color }));
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.62, 0), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.5, 2.1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: P.color, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
    ring.position.y = 0.1;
    const beamM = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 30, 12, 1, true).translate(0, 15, 0), new THREE.MeshBasicMaterial({ color: P.color, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
    g.add(gem, core, ring, beamM); g.position.set(x, 0, z); this.scene.add(g);
    this.powers.push({ type, x, z, g, gem, core, ring, t: 0, life: 30 });
  }
  updatePowers(dt) {
    this.powerT -= dt;
    if (this.powerT <= 0) { this.powerT = 17 + this.rand() * 9; if (this.powers.length < 2) this.spawnPower(); }
    for (let i = this.powers.length - 1; i >= 0; i--) {
      const p = this.powers[i]; p.t += dt; p.life -= dt;
      p.gem.position.y = p.core.position.y = 2.4 + Math.sin(p.t * 2.5) * 0.4; p.gem.rotation.y = p.t * 1.8; p.core.rotation.y = -p.t * 2.4;
      const s = Math.min(1, p.t * 3) * (p.life < 3 ? 0.5 + 0.5 * Math.abs(Math.sin(p.t * 8)) : 1); p.g.scale.setScalar(Math.max(0.01, s));
      p.ring.scale.setScalar(1 + Math.sin(p.t * 4) * 0.12);
      let taker = null;
      for (const h of this.h) if (h.alive && !h.out && Math.hypot(h.x - p.x, h.z - p.z) < h.r + 1.2) { taker = h; break; }
      if (taker || p.life <= 0) {
        this.scene.remove(p.g); p.g.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); }); this.powers.splice(i, 1);
        if (taker) this.takePower(taker, p);
      }
    }
    for (const h of this.h) if (h.pw) { h.pw.t -= dt; if (h.pw.t <= 0) { h.pw = null; if (h.player) this.sfx.whoosh(); } }
  }
  takePower(h, p) {
    const P = POWERS[p.type];
    h.pw = { type: p.type, t: P.dur, dur: P.dur };
    if (Math.hypot(h.x - this.me.x, h.z - this.me.z) < 120) { this.firework(p.x, 2.5, p.z, P.color, 40, 9); this.shockwave(p.x, p.z, 2, P.color); }
    if (h.player) { this.stats.powers++; this.sfx.power(); this.toast(`${P.icon} ${P.name}! ${P.desc}`); this.progress('power', 1); }
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
      if (this.joy && e.pointerId === this.joy.id) {
        this.joy.x = e.clientX; this.joy.y = e.clientY;
        // a floating stick: drag far and the base follows the finger
        const dx = this.joy.x - this.joy.ox, dy = this.joy.y - this.joy.oy, d = Math.hypot(dx, dy), m = 70;
        if (d > m) { this.joy.ox += dx * (1 - m / d); this.joy.oy += dy * (1 - m / d); }
        this.drawJoy();
      }
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

  // the rim breathes and a light band runs around it
  animateRims(t) {
    for (const h of this.h) {
      if (!h.alive) continue;
      h.glow.material.opacity = 0.18 + Math.sin(t * 3 + h.r) * 0.06 + (h.player ? 0.06 : 0) + (h.pw ? 0.2 + Math.sin(t * 12) * 0.08 : 0);
      if (h.band) { h.band.rotation.y = -t * (h.pw ? 4.5 : 1.6); h.band.scale.setScalar(h.r); h.band.position.set(0, 0.07, 0); }
      if (h.pw) { const c = POWERS[h.pw.type].color; h.band.material.color.set(c); } else if (h.bandC !== false) { h.band.material.color.set(h.color).lerp(TC.set('#ffffff'), 0.55); }
    }
  }
  resize() {
    const w = this.root.clientWidth || innerWidth, h = this.root.clientHeight || innerHeight;
    this.composer?.setSize(w, h);
    this.renderer.setSize(w, h, false);
    this.cam.aspect = w / h; this.cam.updateProjectionMatrix();
    const s = (h * this.renderer.getPixelRatio()) / (2 * Math.tan((this.cam.fov * Math.PI) / 360));
    if (this.fx) { this.fx.uScale.value = s; this.glow.uScale.value = s; }
    this.compact = w < 700 || h < 560;
  }

  // ---------- frame
  loop(now) {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.max(0, Math.min(0.05, (now - this.last) / 1000)); this.last = Math.max(this.last, now);
    if (!this.paused && !this.over) this.step(dt);
    else if (this.paused) { this.inputDir(); }
    else if (this.over) this.updateFx(dt);
    this.updateCamera(dt);
    this.flush();
    if (this.sky) this.sky.position.copy(this.cam.position);
    if (this.me?.alive && !this.camOverride) this.uCut.value.set(this.me.x, 0, this.me.z, this.me.r); else this.uCut.value.w = 0;
    this.uCamP.value.copy(this.cam.position);
    this.animateRims(now / 1000);
    this.updateSnow(dt);
    if (this.composer) this.composer.render(); else this.renderer.render(this.scene, this.cam);
    if (!this.paused) this.guard?.tick();
    this.updateLabels();
  }
  flush() { for (const M of Object.values(this.meshes)) if (M.dirty) { for (const e of M.list) e.m.instanceMatrix.needsUpdate = true; M.dirty = false; } }
  step(dt) {
    const real = dt;
    this.clock += real; this.uTime.value = this.clock;
    // slow motion for the big moments (a skyscraper going down)
    if (this.slow) {
      this.slow.t -= real;
      const k = this.slow.t > 0.45 ? 0.28 : 0.28 + (1 - this.slow.t / 0.45) * 0.72;
      dt *= Math.min(1, k);
      if (this.slow.t <= 0) { this.slow = null; this.$('vg-slow')?.classList.remove('on'); }
    }
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
    this.suction(dt);
    this.eat(dt);
    this.updateFalling(dt);
    this.updatePowers(dt);
    this.updateFx(dt);
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
    if (this.bobbers) for (const ob of this.bobbers) if (ob.st === 0 && !ob.lean) { ob.y = -0.35 + Math.sin(this.clock * 1.3 + ob.i) * 0.12; this.setMatrix(ob); }
  }
  moveHoles(dt) {
    for (const h of this.h) {
      if (h.out) continue;
      if (!h.alive) { h.respawn -= dt; if (h.respawn <= 0) this.respawn(h); continue; }
      let dx = 0, dz = 0, amt = 0;
      if (h.player && !this.autopilot) [dx, dz, amt] = this.inputDir();
      else[dx, dz, amt] = this.think(h, dt, h.player ? STRONG : this.diff);
      const sp = (7.8 + h.r * 0.3) * (h.player ? 1 : this.diff.speed) * (h.pw?.type === 'speed' ? 1.45 : 1);
      const k = 1 - Math.exp(-dt * 7);
      h.vx += (dx * amt * sp - h.vx) * k; h.vz += (dz * amt * sp - h.vz) * k;
      h.x = Math.max(-BOUND, Math.min(BOUND, h.x + h.vx * dt)); h.z = Math.max(-BOUND, Math.min(BOUND, h.z + h.vz * dt));
      const target = radiusOf(h.pts) * (h.pw?.type === 'size' ? 1.3 : 1);
      h.r += (target - h.r) * (1 - Math.exp(-dt * 3.5));
      h.pulse = Math.max(0, (h.pulse || 0) - dt * 4);
      if (h.shield > 0) { h.shield -= dt; h.g.visible = h.shield <= 0 || Math.sin(this.clock * 18) > -0.3; }
      this.applyHoleSize(h);
      if (h.rainbow) { const [a, b] = h.hue || [0, 1]; const c = TC.setHSL(a + (((performance.now() / 4000) % 1) * (b - a)), 0.9, 0.6); h.rim.material.color.copy(c); h.glow.material.color.copy(c); }
      // magnet: pull the edible things around into the hole
      if (h.pw?.type === 'magnet') {
        const near = this.query(h.x, h.z, h.r * 2.6 + 5, this._m || (this._m = [])), lim = h.r * EAT;
        for (const ob of near) {
          if (ob.r >= lim || ob.mover) continue;
          const ddx = h.x - ob.x, ddz = h.z - ob.z, d = Math.hypot(ddx, ddz) || 1;
          if (d > h.r * 2.6 + 5) continue;
          const pull = Math.min(d, (6 + 14 / (ob.r + 1)) * dt);
          ob.x += (ddx / d) * pull; ob.z += (ddz / d) * pull; this.gridMove(ob); this.setMatrix(ob);
        }
      }
    }
  }
  respawn(h) {
    const free = this.spots.map(([x, z]) => ({ x, z, d: Math.min(...this.h.filter((o) => o !== h && o.alive).map((o) => Math.hypot(o.x - x, o.z - z) - o.r)) })).sort((a, b) => b.d - a.d)[0];
    h.x = free.x; h.z = free.z; h.vx = h.vz = 0; h.alive = true; h.r = radiusOf(h.pts) * 0.6; h.g.visible = true; h.lab.style.display = ''; h.pw = null;
    h.ai.t = 0; h.shield = 3; this.applyHoleSize(h);
    if (h.player) this.toast('Sei di nuovo in gioco! Protetto per 3 secondi');
  }

  // AI: go for the best food nearby, hunt smaller holes, run from bigger ones, grab power-ups
  think(h, dt, D) {
    const ai = h.ai, R = this.rand; ai.t -= dt;
    if (ai.t <= 0) {
      ai.t = D.react * (0.7 + R() * 0.6);
      let flee = null, fd = Infinity;
      for (const o of this.h) {
        if (o === h || !o.alive || o.out) continue;
        const d = Math.hypot(o.x - h.x, o.z - h.z);
        if (o.r > h.r * 1.18 && d < o.r * 2.2 + 14 && d < fd) { fd = d; flee = o; }
      }
      ai.flee = flee && R() < 0.4 + D.smart * 0.6 ? flee : null;
      let best = null, bs = 0;
      if (R() < D.aggro) for (const o of this.h) {
        if (o === h || !o.alive || o.out || o.shield > 0 || !(h.r > o.r * 1.25)) continue;
        const d = Math.hypot(o.x - h.x, o.z - h.z);
        if (d < 45 + h.r * 2) { const s = (o.pts * 0.5 + 6) / (d + 10) * 1.6; if (s > bs) { bs = s; best = { x: o.x, z: o.z, hole: o }; } }
      }
      const near = this.query(h.x, h.z, 34 + h.r * 1.5, this._q || (this._q = []));
      const lim = h.r * EAT, smart = D.smart;
      // value of a spot = the object plus what is packed around it (clusters beat lone props)
      for (let i = 0; i < near.length; i++) {
        const ob = near[i]; if (ob.r >= lim) continue;
        if (smart < 1 && R() > smart + 0.2) continue;
        const d = Math.hypot(ob.x - h.x, ob.z - h.z), s = (ob.pts * (1 + 0.6 * smart)) / (d + 6);
        if (s > bs) { bs = s; best = { x: ob.x, z: ob.z }; }
      }
      for (const p of this.powers) { const d = Math.hypot(p.x - h.x, p.z - h.z); if (d < 60 && R() < 0.4 + smart * 0.5) { const s = (6 + h.r * 2) / (d + 6); if (s > bs) { bs = s; best = { x: p.x, z: p.z }; } } }
      if (!best) { if (Math.hypot(ai.tx - h.x, ai.tz - h.z) < 6 || ai.wander === undefined) { const s = this.spots[(R() * this.spots.length) | 0]; ai.tx = s[0]; ai.tz = s[1]; ai.wander = 1; } }
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

  // things about to fall tremble and lean towards the hole
  suction() {
    const q = this._s || (this._s = []), seen = this._seen || (this._seen = new Set());
    seen.clear();
    const t = this.clock;
    for (const h of this.h) {
      if (!h.alive || h.out) continue;
      if (!h.player && Math.hypot(h.x - this.me.x, h.z - this.me.z) > 90) continue;
      const lim = h.r * EAT;
      this.query(h.x, h.z, h.r + 6, q);
      for (const ob of q) {
        if (ob.mover) continue;
        const dx = h.x - ob.x, dz = h.z - ob.z, d = Math.hypot(dx, dz) || 1, edge = d - h.r;
        const reach = ob.r + 2.5;
        if (edge > reach) continue;
        const k = Math.max(0, Math.min(1, 1 - edge / reach));
        const edible = ob.r < lim;
        ob.lax = dz / d; ob.laz = -dx / d;
        ob.lean = edible ? k * (0.16 + Math.sin(t * 26 + ob.i) * 0.06) : k * Math.sin(t * 31 + ob.i) * 0.025;
        seen.add(ob); this.wobbling.add(ob); this.setMatrix(ob);
      }
    }
    for (const ob of this.wobbling) if (!seen.has(ob)) { this.wobbling.delete(ob); if (ob.st === 0) { ob.lean = 0; this.setMatrix(ob); } }
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
        if (a === b || !b.alive || b.out || !(a.r > b.r * 1.2) || a.shield > 0 || b.shield > 0) continue;
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
    ob.st = 1; ob.hole = h; ob.ft = 0; ob.hits = 0;
    // start the tumble from the current pose: it keeps leaning in and spins as it drops
    tmpE.set(0, ob.rot, 0); ob.q = new THREE.Quaternion().setFromEuler(tmpE);
    if (ob.lean) ob.q.premultiply(tmpQ2.setFromAxisAngle(tmpA.set(ob.lax, 0, ob.laz), ob.lean));
    ob.cy = ob.y + ob.h * 0.45;
    const m = ob.mover, mv = m ? m.dir * m.speed : 0;
    ob.vx = m && m.axis === 'x' ? mv : 0; ob.vz = m && m.axis === 'z' ? mv : 0;
    ob.vy = ob.h < 3 ? 1.5 + this.rand() * 2 : 0; // small things pop up as they get sucked in
    const dl = d || 1, toX = -dx / dl, toZ = -dz / dl;
    const spin = (1.6 + 4 / (ob.h + 1)) * (0.8 + this.rand() * 0.5);
    ob.w = new THREE.Vector3(toZ * spin + (this.rand() - 0.5) * 0.8, (this.rand() - 0.5) * 2.5, -toX * spin + (this.rand() - 0.5) * 0.8);
    this.wobbling.delete(ob); ob.lean = 0;
    // combo: a quick string of gulps is worth a little more
    const now = this.mode.time - this.time;
    // combo: a quick string of real bites (pedestrians and props keep it alive but don't count)
    if (h.player) { const alive = now - (this.lastEat ?? -9) < 1.1; if (ob.pts >= 1) this.combo = alive ? (this.combo || 0) + 1 : 1; else if (!alive) this.combo = 0; this.lastEat = now; }
    const bonus = h.player ? 1 + Math.min(25, (this.combo || 1) - 1) * 0.01 : 1;
    h.pts += ob.pts * bonus; h.eaten++;
    this.eatenPts += ob.pts;
    h.pulse = Math.min(1, (h.pulse || 0) + Math.min(1, ob.r / (h.r * 0.6)));
    if (ob.r >= 1.2 && Math.hypot(ob.x - this.me.x, ob.z - this.me.z) < 90) this.puff(ob.x, ob.z, Math.min(ob.r, 14), ob.k.r > 4 ? '#b8ad9c' : '#8f8678');
    if (h.player) {
      this.myPts += ob.pts;
      this.stats.bestCombo = Math.max(this.stats.bestCombo || 0, this.combo);
      this.stats.eaten++;
      this.stats.kinds[ob.k.id] = (this.stats.kinds[ob.k.id] || 0) + 1;
      if (!this.stats.big || ob.pts > this.stats.big.pts) this.stats.big = ob;
      this.popAcc += ob.pts * 10;
      this.sfx.gulp(Math.min(1, ob.r / 12), ob.k);
      // screen shake scaled by how big the bite is for this hole
      const rel = ob.r / Math.max(1, h.r);
      if (rel > 0.3) this.shake = Math.min(1.2, this.shake + rel * 0.55 * Math.min(1.6, ob.r / 4));
      if ((BIG.has(ob.k.id) || ob.r >= 9) && !this.slow) this.bigMoment(ob);
      this.progress('eat', 1, ob.k.id);
      this.progress('combo', this.combo);
      this.progress('pct', (this.myPts / this.totalPts) * 100);
    }
  }
  bigMoment(ob) {
    this.slow = { t: 1.7, ob };
    const el = this.$('vg-slow'), tt = this.$('vg-slow-t');
    if (tt) tt.textContent = ob.k.id === 'landmark' || ob.k.id === 'ship' || ob.k.id === 'bell' ? 'Colossale!' : ob.k.id === 'tower' ? 'Grattacielo giù!' : ob.k.id === 'crane' ? 'Gru inghiottita!' : 'Boccone enorme!';
    el?.classList.remove('on'); void el?.offsetWidth; el?.classList.add('on');
    this.shake = Math.min(1.4, this.shake + 0.9);
    this.puff(ob.x, ob.z, Math.min(ob.r * 1.3, 18), '#c9bca6');
    this.later(0.35, () => this.puff(ob.x, ob.z, Math.min(ob.r, 16), '#a89c88'));
  }
  swallowHole(a, b) {
    a.pts += b.pts * 0.5 + 8; a.kills++;
    b.alive = false; b.g.visible = false; b.lab.style.display = 'none'; b.pw = null;
    if (this.mode.respawn) { b.respawn = 3; b.pts *= 0.5; }
    else { b.out = true; b.outAt = this.mode.time - this.time; }
    const near = Math.hypot(b.x - this.me.x, b.z - this.me.z) < 110;
    if (near) { this.shockwave(b.x, b.z, b.r, b.color); this.firework(b.x, 1.5, b.z, b.color, a.player ? 120 : 50, 10 + b.r); this.puff(b.x, b.z, b.r + 2, '#9a8f7e'); }
    if (a.player) {
      this.stats.holes++; this.sfx.eatHole(); this.toast(`Hai divorato ${b.name}!`); this.popAcc += (b.pts * 0.5 + 8) * 10; this.shake = 1.2; this.flash(b.color);
      this.later(0.25, () => this.firework(b.x + 4, 14 + a.r, b.z - 3, '#ffffff', 60, 12));
      this.progress('rival', 1);
    } else if (b.player) { this.stats.deaths = (this.stats.deaths || 0) + 1; this.sfx.lost(); this.flash('#ff2040'); this.shake = 1; this.toast(this.mode.respawn ? `${a.name} ti ha inghiottito! Riparti tra 3 secondi…` : `${a.name} ti ha inghiottito!`, true); }
    else this.sfx.rivalGone();
    if (b.player && !this.mode.respawn) setTimeout(() => this.finish('eaten'), 1400);
  }
  flash(color) { const el = this.$('vg-flash'); if (!el) return; el.style.setProperty('--c', color); el.classList.remove('on'); void el.offsetWidth; el.classList.add('on'); }
  updateFalling(dt) {
    for (const ob of this.objs) {
      if (ob.st !== 1) continue;
      const h = ob.hole;
      ob.ft += dt;
      // pulled towards the middle and down; big things topple over the rim first, then drop
      const dx = h.x - ob.x, dz = h.z - ob.z, d = Math.hypot(dx, dz);
      const pull = 5 + 12 / (ob.r + 1);
      ob.vx += (dx * pull - ob.vx * 2.2) * dt + h.vx * dt * 2; ob.vz += (dz * pull - ob.vz * 2.2) * dt + h.vz * dt * 2;
      const g = (24 + ob.h * 0.5) * (ob.h > 3 ? Math.min(1, 0.25 + ob.ft * 3.2) : 1);
      ob.vy -= g * dt;
      ob.x += ob.vx * dt; ob.z += ob.vz * dt; ob.cy += ob.vy * dt;
      // bounce off the wall of the well
      const ext = ob.r * 0.55;
      if (ob.cy < ob.h * 0.3 && d + ext > h.r && ob.hits < 3 && ob.ft > 0.08) {
        const nx = -dx / (d || 1), nz = -dz / (d || 1), vn = ob.vx * nx + ob.vz * nz;
        if (vn > 0) {
          ob.vx -= vn * nx * 1.45; ob.vz -= vn * nz * 1.45; ob.vy *= 0.6; ob.hits++;
          ob.w.x += (this.rand() - 0.5) * 6; ob.w.z += (this.rand() - 0.5) * 6; ob.w.y += (this.rand() - 0.5) * 3;
        }
        const k = (h.r - ext) / (d || 1); if (k < 1 && k > 0) { ob.x = h.x - dx * k; ob.z = h.z - dz * k; }
      }
      const wl = ob.w.length();
      if (wl > 1e-4) { tmpQ2.setFromAxisAngle(tmpA.copy(ob.w).divideScalar(wl), wl * dt); ob.q.premultiply(tmpQ2); }
      ob.w.multiplyScalar(Math.exp(-dt * 0.4));
      if (ob.cy < -(Math.min(h.depth - 1, ob.h * 1.15 + 5))) { ob.st = 2; ob.q = null; }
      this.setMatrix(ob);
    }
  }

  // ---------- missions
  progress(type, v, kind) {
    if (!this.missions) return;
    for (const m of this.missions) {
      if (m.done || m.type !== type) continue;
      if (type === 'eat') { if (!m.kinds.includes(kind)) continue; m.have += v; }
      else if (type === 'rival' || type === 'power') m.have += v;
      else m.have = Math.max(m.have, v);
      if (m.have >= m.n) {
        m.done = true; m.have = m.n;
        this.sfx.coin(); this.toast(`Missione compiuta: ${m.text} · +${m.coins} monete`);
        if (this.me.alive) this.confetti(this.me.x, this.me.z, this.me.r, 60);
      }
      this.missionsDirty = true;
    }
  }
  renderMissions() {
    const el = this.$('vg-miss'); if (!el || !this.missions) return;
    el.innerHTML = this.missions.map((m) => `<li class="${m.done ? 'done' : ''}"><i>${m.done ? '✓' : ''}</i><span>${m.text}</span><em>${m.type === 'pct' ? `${Math.floor(m.have)}%` : m.type === 'combo' || m.type === 'level' ? '' : `${Math.floor(m.have)}/${m.n}`}</em></li>`).join('');
    this.missionsDirty = false;
  }

  // ---------- camera, HUD, labels
  updateCamera(dt, snap) {
    if (this.camOverride) { this.camOverride(this.cam); return; } // key art / photo tools
    const me = this.me, r = me.r;
    const portrait = this.cam.aspect < 0.9 ? 1.35 : 1;
    const zoom = this.slow ? 0.93 : 1;
    const H = (21 + r * 3.3) * portrait * zoom;
    let sx = 0, sz = 0, sy = 0;
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 1.8);
      const a = this.shake * this.shake * (0.5 + this.camH * 0.025), t = this.clock * 40;
      sx = (Math.sin(t * 1.1) + Math.sin(t * 2.3) * 0.5) * a * 0.6; sz = (Math.cos(t * 1.3) + Math.sin(t * 1.9) * 0.5) * a * 0.6; sy = Math.sin(t * 1.7) * a * 0.3;
    }
    const k = snap ? 1 : 1 - Math.exp(-dt * 4);
    this.camT = this.camT || new THREE.Vector3(me.x, 0, me.z);
    this.camT.x += (me.x - this.camT.x) * k; this.camT.z += (me.z - this.camT.z) * k;
    this.camH = snap ? H : this.camH + (H - this.camH) * (1 - Math.exp(-dt * (this.slow ? 3 : 2)));
    this.cam.position.set(this.camT.x + sx, this.camH + sy, this.camT.z + this.camH * 0.62 + sz);
    this.cam.lookAt(this.camT.x + sx * 0.5, 0, this.camT.z - r * 0.15 + sz * 0.5);
    // shadows follow the action
    const sh = this.sun.shadow.camera, ext = 40 + this.camH * 1.3;
    this.sun.position.set(this.camT.x + 70, 120, this.camT.z + 40); this.sun.target.position.set(this.camT.x, 0, this.camT.z);
    if (Math.abs(sh.right - ext) > 4) { sh.left = -ext; sh.right = ext; sh.top = ext; sh.bottom = -ext; sh.near = 1; sh.far = 400; sh.updateProjectionMatrix(); }
    this.scene.fog.near = 120 + this.camH * 1.2; this.scene.fog.far = 420 + this.camH * 3;
  }
  updateLabels() {
    const w = this.root.clientWidth, hgt = this.root.clientHeight, m = 34;
    const root = this.root.getBoundingClientRect();
    if (!this._rects || (this._rectT = (this._rectT || 0) - 1) <= 0) { this._rectT = 30; this._rects = ['vg-mini', 'vg-left', 'vg-sc', 'vg-topbox', 'vg-pw', 'vg-pausebtn', 'vg-levelbox'].map((id) => this.$(id)?.getBoundingClientRect()).filter((r) => r && r.width).map((r) => ({ l: r.left - root.left - 50, r: r.right - root.left + 50, t: r.top - root.top - 14, b: r.bottom - root.top + 14 })); }
    for (const h of this.h) {
      if (!h.alive || h.out) { h.lab.style.opacity = 0; continue; }
      tmpV.set(h.x, 0, h.z + h.r * 1.05).project(this.cam);
      const vis = tmpV.z < 1 && Math.abs(tmpV.x) < 1.02 && Math.abs(tmpV.y) < 1.02;
      if (vis) { h.lab.classList.remove('edge'); h.lab.style.opacity = 1; h.lab.style.transform = `translate(${((tmpV.x + 1) / 2) * w}px, ${((1 - tmpV.y) / 2) * hgt + 4}px) translate(-50%, 0)`; continue; }
      if (h.player) { h.lab.style.opacity = 0; continue; }
      // off screen: pin to the edge, pointing towards it (danger if bigger, prey if smaller)
      let x = tmpV.x, y = tmpV.y; if (tmpV.z > 1) { x = -x; y = -y; }
      const k = 1 / Math.max(Math.abs(x), Math.abs(y), 1e-3);
      let px = Math.min(w - m - 20, Math.max(m + 20, ((x * k + 1) / 2) * w)), py = Math.min(hgt - m - 30, Math.max(m + 70, ((1 - y * k) / 2) * hgt));
      // keep clear of the minimap and the leaderboard
      for (const R of this._rects) if (px > R.l && px < R.r && py > R.t && py < R.b) py = R.t > hgt / 2 ? R.t : R.b;
      const d = Math.hypot(h.x - this.me.x, h.z - this.me.z);
      if (d > 140) { h.lab.style.opacity = 0; continue; }
      h.lab.classList.add('edge'); h.lab.classList.toggle('danger', h.r > this.me.r * 1.2); h.lab.classList.toggle('prey', this.me.r > h.r * 1.2);
      h.lab.style.opacity = 0.9; h.lab.style.transform = `translate(${px}px, ${py}px) translate(-50%, -50%)`;
    }
  }
  updateHud(dt) {
    const me = this.me;
    const ce = this.$('vg-combo');
    if (ce) {
      const live = this.combo >= 5 && (this.mode.time - this.time) - (this.lastEat ?? -9) < 0.9;
      if (live) { const t = `Combo x${this.combo}`; if (ce.textContent !== t) { ce.textContent = t; ce.classList.remove('pop'); void ce.offsetWidth; ce.classList.add('pop'); } }
      ce.classList.toggle('on', live);
    }
    const t = Math.max(0, Math.ceil(this.time));
    const te = this.$('vg-timer'); te.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; te.classList.toggle('hot', t <= 10 && this.count <= 0);
    if (t <= 5 && t !== this._lastBeep && this.count <= 0) { this._lastBeep = t; this.sfx.tick(t); }
    this.$('vg-score').textContent = Math.round(me.pts * 10).toLocaleString('it-IT');
    if (this.o.mode === 'solitaria') this.$('vg-eat').textContent = `${((this.eatenPts / this.totalPts) * 100).toFixed(1)}% della città`;
    else this.$('vg-eat').textContent = `${this.stats.eaten} oggetti · ${this.stats.holes} voragini`;
    // active power-up
    const pe = this.$('vg-pw');
    if (pe) {
      const pw = me.pw;
      if (pw) { const P = POWERS[pw.type]; const html = `<span>${P.icon} ${P.name}</span><i style="--p:${(pw.t / pw.dur) * 100}%"></i>`; pe.style.setProperty('--c', P.color); if (pe._t !== pw.type) { pe._t = pw.type; pe.innerHTML = html; } else pe.lastChild.style.setProperty('--p', `${(pw.t / pw.dur) * 100}%`); pe.classList.add('on'); }
      else if (pe._t) { pe._t = null; pe.classList.remove('on'); }
    }
    // what can I swallow now / next
    const lim = me.r * EAT; let lvl = 0, next = null;
    for (const id of MILESTONES) { if (KINDS[id].r < lim) lvl++; else { next = KINDS[id]; break; } }
    if (lvl > me.lvl && this.count <= 0 && me.pw?.type !== 'size') {
      if (me.lvl > 0) {
        this.sfx.level(); this.toast(`Livello ${lvl}! Ora puoi inghiottire: ${KINDS[MILESTONES[lvl - 1]].label}`);
        // celebration: confetti from the rim and a few fireworks above the hole
        this.confetti(me.x, me.z, me.r);
        const cols = ['#ffc928', '#ff3d7f', '#2ee6a6', '#1e90ff'];
        for (let i = 0; i < 3; i++) this.later(0.15 + i * 0.22, () => { const a = this.rand() * Math.PI * 2; this.firework(this.me.x + Math.cos(a) * this.me.r * 1.2, 12 + this.me.r * 1.6 + this.rand() * 6, this.me.z + Math.sin(a) * this.me.r * 1.2 - this.me.r * 0.5, cols[(i + lvl) % cols.length], 60, 9 + this.me.r * 0.3); });
      }
      me.lvl = lvl;
      this.progress('level', lvl);
    }
    this.$('vg-lvl').textContent = `Livello ${Math.max(1, me.lvl)}`;
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
    // leaderboard + minimap + missions a few times a second
    this.hudT = (this.hudT || 0) - dt;
    if (this.hudT > 0) return;
    this.hudT = 0.25;
    if (this.missionsDirty) this.renderMissions();
    const rank = this.ranking();
    const myI = rank.indexOf(me);
    const n = this.compact ? 3 : 5;
    const show = rank.slice(0, n); if (myI >= n) show.push(me);
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
    for (const p of this.powers) { g.beginPath(); g.arc((p.x + E) * k, (p.z + E) * k, 3.5, 0, Math.PI * 2); g.fillStyle = POWERS[p.type].color; g.fill(); g.lineWidth = 1; g.strokeStyle = '#fff'; g.stroke(); }
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
    const pct = (this.eatenPts / this.totalPts) * 100, mine = (this.myPts / this.totalPts) * 100;
    const solo = this.o.mode === 'solitaria';
    const stars = solo ? (pct >= 70 ? 3 : pct >= 45 ? 2 : pct >= 20 ? 1 : 0) : pos === 1 ? 3 : pos <= 3 ? 2 : pos <= 5 ? 1 : 0;
    const missions = (this.missions || []).map((m) => ({ text: m.text, done: !!m.done, coins: m.coins, have: m.have, n: m.n, type: m.type }));
    const mCoins = missions.filter((m) => m.done).reduce((a, m) => a + m.coins, 0);
    const coins = Math.round(Math.sqrt(score) / 2) + stars * 8 + this.stats.holes * 5 + mCoins;
    this.sfx.end(pos === 1 || stars >= 2);
    if (pos === 1 || stars >= 3) { this.confetti(me.x, me.z, me.r, 160); for (let i = 0; i < 5; i++) this.later(i * 0.2, () => this.firework(me.x + (this.rand() - 0.5) * 30, 18 + me.r * 1.5, me.z - 10 + (this.rand() - 0.5) * 20, ['#ffc928', '#ff3d7f', '#2ee6a6', '#1e90ff', '#ffffff'][i], 80, 12)); }
    this.o.onEnd?.({
      why, pos, of: this.h.length, score, stars, coins, mCoins, pct, mine, mode: this.o.mode, city: this.o.city, daily: this.o.daily?.key || null,
      eaten: this.stats.eaten, holes: this.stats.holes, combo: this.stats.bestCombo || 0, big: this.stats.big?.k?.label || '', radius: me.r, missions, powers: this.stats.powers,
      ranking: rank.map((h) => ({ name: h.name, color: h.color, score: Math.round(h.pts * 10), player: h.player, out: h.out })),
    });
  }
  // test / tools hook: how the match is going
  debugInfo() { return { mine: +((this.myPts / this.totalPts) * 100).toFixed(1), city: +((this.eatenPts / this.totalPts) * 100).toFixed(1), r: +this.me.r.toFixed(1), lvl: this.me.lvl, missions: this.missions?.map((m) => `${m.done ? 'OK' : '..'} ${m.text} ${Math.floor(m.have)}/${m.n}`), powers: this.stats.powers, holes: this.stats.holes, deaths: this.stats.deaths || 0 }; }
  // older tools call these names
  updateDust(dt) { this.updateFx(dt); }

  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKD, true); window.removeEventListener('keyup', this.onKU, true);
    window.removeEventListener('pointerup', this.onPU); window.removeEventListener('pointercancel', this.onPU);
    document.removeEventListener('visibilitychange', this.onVis);
    this.ro?.disconnect();
    this.sfx?.close();
    this.timers = [];
    this.scene?.traverse((o) => { o.geometry?.dispose?.(); const m = o.material; (Array.isArray(m) ? m : m ? [m] : []).forEach((x) => { x.map?.dispose?.(); x.emissiveMap?.dispose?.(); x.dispose?.(); }); });
    for (const t of this.texCache?.values() || []) t.dispose();
    this.composer?.dispose?.(); this.renderer?.dispose(); this.renderer?.forceContextLoss?.();
    this.root.innerHTML = '';
  }
}
