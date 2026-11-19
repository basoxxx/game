// Festa Baso — the one WebGL renderer of a party session (board, every minigame, podium) and the shared
// 3D kit: Orda's bean figures (instanced, animated in the vertex shader) wearing Serpentone's hats, a soft
// sky/ground scene, confetti and floating labels. Each view builds its own THREE.Scene and disposes it;
// the renderer, the figure geometry and the shader programs stay alive until the party screen closes.
import * as THREE from 'three';
import { pixelRatio } from '../ui/quality.js';
import { FrameGuard } from '../ui/perfguard.js';
import { figureGeometry, figureMaterial, Crowd } from '../orda/game.js';
import { buildHat } from '../serpentone/looks.js';

export { THREE };
export class Stage {
  constructor(canvas, tier = 'high') {
    this.canvas = canvas; this.tier = tier;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: tier !== 'low', powerPreference: 'high-performance' });
    r.setPixelRatio(pixelRatio(tier === 'high' ? 1.75 : 1.4)); r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = tier === 'high'; r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.uTime = { value: 0 };
    this.figGeo = figureGeometry(); this.figMat = figureMaterial(this.uTime);
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 600);
    this.scene = null; this.w = 1; this.h = 1;
    const setPR = (pr) => { if (Math.abs(r.getPixelRatio() - pr) < 0.01) return false; r.setPixelRatio(pr); this.resize(true); };
    this.guard = new FrameGuard([
      { fps: 45, run: () => setPR(Math.min(1.25, r.getPixelRatio())) },
      { fps: 36, run: () => { if (!r.shadowMap.enabled) return false; r.shadowMap.enabled = false; this.scene?.traverse((o) => { if (o.material) o.material.needsUpdate = true; }); } },
      { fps: 30, run: () => setPR(1) },
      { fps: 22, run: () => setPR(0.75) },
    ]);
    this.resize();
  }
  resize(force) {
    const c = this.canvas, w = c.clientWidth || 1, h = c.clientHeight || 1;
    if (!force && w === this.w && h === this.h) return;
    this.w = w; this.h = h; this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }
  get portrait() { return this.h > this.w * 1.05; }
  // fit a world-space box (half sizes hx, hz) into the view from a tilted camera
  frame(cx, cz, hx, hz, tilt = 0.95, y0 = 0) {
    const cam = this.camera, a = cam.aspect, f = Math.tan((cam.fov * Math.PI) / 360);
    const dist = Math.max(hz * 1.15 / f, (hx * 1.12) / (f * a)) + hz * 0.35;
    cam.position.set(cx, y0 + Math.sin(tilt) * dist, cz + Math.cos(tilt) * dist); cam.lookAt(cx, y0, cz + hz * 0.06);
  }
  render(dt = 0) {
    this.uTime.value += dt; this.resize();
    if (this.scene) this.renderer.render(this.scene, this.camera);
    this.guard.tick();
  }
  dispose() { this.figGeo.dispose(); this.figMat.dispose(); this.renderer.dispose(); this.renderer.forceContextLoss?.(); }
}

// a bright party scene: sky gradient colour, hemisphere + sun (shadows on Alta), optional ground disc
export function partyScene(stage, { sky = '#8fd3ff', ground = '#7bd36b', fog = true, size = 60, sun = 1.7 } = {}) {
  const s = new THREE.Scene(); s.background = new THREE.Color(sky);
  if (fog) s.fog = new THREE.Fog(sky, size * 1.6, size * 4);
  s.add(new THREE.HemisphereLight('#ffffff', '#5a6a4a', 1.25));
  const l = new THREE.DirectionalLight('#fff3e0', sun); l.position.set(-size * 0.4, size, size * 0.6);
  if (stage.tier === 'high') { l.castShadow = true; l.shadow.mapSize.set(2048, 2048); const c = l.shadow.camera; c.left = c.bottom = -size * 0.75; c.right = c.top = size * 0.75; c.near = 1; c.far = size * 3; l.shadow.bias = -0.0006; }
  s.add(l); s.userData.sun = l;
  if (ground) { const g = new THREE.Mesh(new THREE.CircleGeometry(size * 3, 48), new THREE.MeshLambertMaterial({ color: ground })); g.rotation.x = -Math.PI / 2; g.position.y = -0.02; g.receiveShadow = true; s.add(g); }
  return s;
}
export function disposeScene(s) {
  if (!s) return;
  s.traverse((o) => { if (o.isMesh || o.isPoints || o.isLine || o.isInstancedMesh) { if (!o.userData.shared) o.geometry?.dispose?.(); const m = o.material; if (m && !o.userData.shared && !o.userData.keepMat) (Array.isArray(m) ? m : [m]).forEach((x) => { x.map?.dispose?.(); x.dispose?.(); }); } });
  s.clear();
}
export const lambert = (color, o = {}) => new THREE.MeshLambertMaterial({ color, ...o });
export function mesh(geo, mat, x = 0, y = 0, z = 0, cast = true) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = true; return m; }
const hex = (c) => new THREE.Color(c);

// players' bean figures (one instanced draw) with their hats; plus an optional crowd of extras
export class Figures {
  constructor(stage, scene, players, { extras = 0, scale = 1.6 } = {}) {
    this.stage = stage; this.scale = scale; this.players = players;
    this.crowd = new Crowd(scene, stage.figGeo, stage.figMat, players.length + extras, stage.tier === 'high');
    this.crowd.mesh.userData.keepMat = true;
    this.cols = players.map((p) => hex(p.color));
    this.hats = players.map((p) => { const h = buildHat(p.hat, p.accent || '#ff3b5c'); h.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.userData.shared = true; } }); scene.add(h); return h; });
    this.n = players.length; this.extra = 0;
  }
  // x, y, z feet position, rot facing (0 = towards +z / camera), run 0..1, s extra scale
  set(i, x, y, z, rot, run = 0, s = 1, ph = i * 0.27) {
    const sc = this.scale * s, c = this.cols[i];
    this.crowd.set(i, x, y, z, rot, sc, c.r, c.g, c.b, ph, run);
    const h = this.hats[i]; if (!h) return;
    h.visible = s > 0.05;
    h.position.set(x, y + 0.7 * sc, z); h.rotation.set(0, rot - Math.PI / 2, 0); h.scale.setScalar(0.29 * sc);
  }
  extraSet(k, x, y, z, rot, col, run = 1, s = 1, ph = k * 0.13) { const c = col; this.crowd.set(this.n + k, x, y, z, rot, this.scale * s * 0.8, c.r, c.g, c.b, ph, run); this.extra = Math.max(this.extra, k + 1); }
  commit(extras = this.extra) { this.crowd.commit(this.n + extras); this.extra = 0; }
}

// confetti / bursts: one Points cloud, CPU simulated
export class Confetti {
  constructor(scene, n = 600) {
    this.n = n; this.i = 0; this.pos = new Float32Array(n * 3).fill(-999); this.vel = new Float32Array(n * 3); this.col = new Float32Array(n * 3); this.life = new Float32Array(n);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.35, vertexColors: true, sizeAttenuation: true, transparent: true, depthWrite: false }));
    this.pts.frustumCulled = false; scene.add(this.pts);
  }
  burst(x, y, z, color, k = 30, sp = 6) {
    const c = hex(color);
    for (let q = 0; q < k; q++) {
      const i = this.i = (this.i + 1) % this.n, j = i * 3, a = Math.random() * 6.283, u = Math.random();
      this.pos[j] = x; this.pos[j + 1] = y; this.pos[j + 2] = z;
      this.vel[j] = Math.cos(a) * sp * u; this.vel[j + 1] = sp * (0.6 + Math.random()); this.vel[j + 2] = Math.sin(a) * sp * u;
      const v = 0.7 + Math.random() * 0.3; this.col[j] = c.r * v; this.col[j + 1] = c.g * v; this.col[j + 2] = c.b * v; this.life[i] = 1.2 + Math.random();
    }
    this.dirty = true;
  }
  update(dt) {
    if (!this.dirty) return; let any = false;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue; this.life[i] -= dt; const j = i * 3;
      if (this.life[i] <= 0) { this.pos[j + 1] = -999; continue; }
      any = true; this.vel[j + 1] -= 12 * dt; this.vel[j] *= 0.985; this.vel[j + 2] *= 0.985;
      this.pos[j] += this.vel[j] * dt; this.pos[j + 1] = Math.max(0.05, this.pos[j + 1] + this.vel[j + 1] * dt); this.pos[j + 2] += this.vel[j + 2] * dt;
    }
    const a = this.pts.geometry.attributes; a.position.needsUpdate = a.color.needsUpdate = true; this.dirty = any;
  }
}

// floating HTML labels over 3D points (player tags)
export class Labels {
  constructor(root, stage) { this.root = root; this.stage = stage; this.els = new Map(); this.v = new THREE.Vector3(); }
  set(key, html, x, y, z, cls = '') {
    let el = this.els.get(key);
    if (!el) { el = document.createElement('div'); el.className = `fz-lab ${cls}`; this.root.appendChild(el); this.els.set(key, el); }
    if (el._h !== html) { el.innerHTML = html; el._h = html; }
    this.v.set(x, y, z).project(this.stage.camera);
    const vis = this.v.z < 1;
    el.style.transform = `translate(${((this.v.x + 1) / 2) * this.stage.w}px, ${((1 - this.v.y) / 2) * this.stage.h}px) translate(-50%, -100%)`;
    el.style.display = vis ? '' : 'none';
  }
  clear() { for (const el of this.els.values()) el.remove(); this.els.clear(); }
}
