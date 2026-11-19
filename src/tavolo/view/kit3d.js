// Tavolo Baso — shared 3D kit: the stage (renderer, soft lights, room reflections, table, camera framing and
// tweens, render-on-demand), procedural canvas textures (wood grain, marble veins, the board top with its
// inlaid frame and coordinates) and the turned piece geometry (lathe profiles: chess set, draughts men).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { pixelRatio } from '../../ui/quality.js';
import { FrameGuard } from '../../ui/perfguard.js';

export { THREE };
export const ease = { io: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2), out: (t) => 1 - Math.pow(1 - t, 3), lin: (t) => t,
  bounce: (t) => { const n = 7.5625, d = 2.75; if (t < 1 / d) return n * t * t; if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75; if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375; return n * (t -= 2.625 / d) * t + 0.984375; } };
const reduce = () => document.documentElement.classList.contains('reduce-motion');

// ───────── procedural textures (cached by key)
const texCache = new Map();
function cached(key, make) { if (!texCache.has(key)) texCache.set(key, make()); return texCache.get(key); }
let ns = 1;
const nrand = () => { ns = (ns * 16807) % 2147483647; return ns / 2147483647; };
// smooth value noise on a 64 grid
const NG = 64, NV = new Float32Array(NG * NG);
for (let i = 0; i < NV.length; i++) NV[i] = nrand();
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const a = NV[((yi & 63) * NG) + (xi & 63)], b = NV[((yi & 63) * NG) + ((xi + 1) & 63)], c = NV[(((yi + 1) & 63) * NG) + (xi & 63)], d = NV[(((yi + 1) & 63) * NG) + ((xi + 1) & 63)];
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const turb = (x, y) => vnoise(x, y) * 0.5 + vnoise(x * 2, y * 2) * 0.25 + vnoise(x * 4, y * 4) * 0.125 + vnoise(x * 8, y * 8) * 0.0625;
const hexRGB = (h) => { const c = new THREE.Color(h); return [c.r * 255, c.g * 255, c.b * 255]; };
// paint wood grain or marble into a 2D context region
export function paintMaterial(g, x0, y0, w, h, color, kind, seed = 0, rot = false) {
  const img = g.getImageData(x0, y0, w, h), d = img.data, [r, gg, b] = hexRGB(color);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = (rot ? y : x) / 64 + seed * 7.3, v = (rot ? x : y) / 64 + seed * 3.1;
    let k;
    if (kind === 'wood') { const t = turb(u * 0.6, v * 4) * 2.2; const ring = Math.sin((v * 10 + t * 6) * 1.7) * 0.5 + 0.5; k = 0.86 + ring * 0.12 + (turb(u * 8, v * 30) - 0.5) * 0.12; }
    else if (kind === 'marble') { const t = turb(u * 1.3, v * 1.3); const vein = Math.abs(Math.sin((u + v) * 3.2 + t * 9)); k = 0.93 + (turb(u * 6, v * 6) - 0.5) * 0.08 - Math.pow(1 - vein, 10) * 0.35; }
    else k = 0.97 + (turb(u * 10, v * 10) - 0.5) * 0.06;
    const i = (y * w + x) * 4; d[i] = Math.min(255, r * k); d[i + 1] = Math.min(255, gg * k); d[i + 2] = Math.min(255, b * k); d[i + 3] = 255;
  }
  g.putImageData(img, x0, y0);
}
export function materialTexture(color, kind, size = 256, seed = 0) {
  return cached(`m:${color}:${kind}:${size}:${seed}`, () => {
    const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d', { willReadFrequently: true });
    paintMaterial(g, 0, 0, size, size, color, kind, seed);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
  });
}
// the board top: n x n squares + frame border, optional coordinates (files/ranks or a custom label fn)
export function boardTopTexture(theme, { n = 8, border = 0.6, coords = true, files = 'abcdefgh', size = 1024, darkOnly = false } = {}) {
  return cached(`b:${theme.id}:${n}:${border}:${coords}:${size}:${darkOnly}`, () => {
    const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d', { willReadFrequently: true });
    const tot = n + border * 2, u = size / tot, kind = theme.mat === 'flat' ? 'flat' : theme.mat;
    paintMaterial(g, 0, 0, size, size, theme.frame, kind === 'flat' ? 'wood' : kind, 3);
    const o = Math.round(border * u);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const dark = ((x + y) & 1) === (darkOnly ? 0 : 1); // texture (0,0) = a8 (far left): light in chess, dark in Italian draughts
      const px = Math.round(o + x * u), py = Math.round(o + y * u), pw = Math.round(o + (x + 1) * u) - px, ph = Math.round(o + (y + 1) * u) - py;
      paintMaterial(g, px, py, pw, ph, dark ? theme.dark : theme.light, kind, x * 1.7 + y * 3.3, theme.mat === 'wood' && dark);
    }
    // inlay lines
    g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = Math.max(2, u * 0.03); g.strokeRect(o - 1, o - 1, n * u + 2, n * u + 2);
    g.strokeStyle = theme.ink; g.globalAlpha = 0.5; g.lineWidth = Math.max(1, u * 0.02); g.strokeRect(o - u * 0.12, o - u * 0.12, n * u + u * 0.24, n * u + u * 0.24); g.globalAlpha = 1;
    if (coords) {
      g.fillStyle = theme.ink; g.globalAlpha = 0.85; g.font = `600 ${Math.round(u * 0.3)}px Georgia, 'Times New Roman', serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      for (let i = 0; i < n; i++) {
        const cx = o + (i + 0.5) * u;
        g.fillText(files[i], cx, size - o / 2); g.save(); g.translate(cx, o / 2); g.rotate(Math.PI); g.fillText(files[i], 0, 0); g.restore();
        const cy = o + (i + 0.5) * u, lab = String(n - i);
        g.fillText(lab, o / 2, cy); g.save(); g.translate(size - o / 2, cy); g.rotate(Math.PI); g.fillText(lab, 0, 0); g.restore();
      }
      g.globalAlpha = 1;
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
  });
}
export function radialTexture(inner = 'rgba(0,0,0,.55)', outer = 'rgba(0,0,0,0)', size = 128) {
  return cached(`r:${inner}:${outer}`, () => {
    const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d');
    const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2); gr.addColorStop(0, inner); gr.addColorStop(1, outer);
    g.fillStyle = gr; g.fillRect(0, 0, size, size); const t = new THREE.CanvasTexture(c); return t;
  });
}
export function ringTexture(color = '#ffffff', size = 128) {
  return cached(`ring:${color}`, () => {
    const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d');
    g.strokeStyle = color; g.lineWidth = size * 0.09; g.beginPath(); g.arc(size / 2, size / 2, size * 0.4, 0, Math.PI * 2); g.stroke();
    return new THREE.CanvasTexture(c);
  });
}

// ───────── piece materials for a set (side 0 white, 1 black)
export function pieceMaterial(set, side, tier) {
  const s = side ? set.b : set.w;
  const o = { color: s.c, roughness: s.r, metalness: s.m };
  if (s.grain) { o.map = materialTexture(s.c, 'wood', 256, side * 5 + 1); o.color = '#ffffff'; }
  if (s.marble) { o.map = materialTexture(s.c, 'marble', 256, side * 5 + 2); o.color = '#ffffff'; }
  if (s.glass && tier === 'high') return new THREE.MeshPhysicalMaterial({ ...o, transmission: 0.55, thickness: 0.6, ior: 1.45, clearcoat: 1, clearcoatRoughness: 0.05 });
  if (s.glass) return new THREE.MeshPhysicalMaterial({ ...o, transparent: true, opacity: 0.82, clearcoat: 1, clearcoatRoughness: 0.05 });
  if (s.cc || s.m) return new THREE.MeshPhysicalMaterial({ ...o, clearcoat: s.cc || 0.3, clearcoatRoughness: 0.12 });
  return new THREE.MeshStandardMaterial(o);
}

// ───────── turned geometry (unit: one square)
const V2 = (r, y) => new THREE.Vector2(r, y);
function lathe(pts, seg) { return new THREE.LatheGeometry(pts.map(([r, y]) => V2(r, y)), seg).toNonIndexed(); }
function base(seg, r = 0.36, h = 0.14) { return [[0, 0], [r, 0], [r, h * 0.45], [r * 0.9, h * 0.6], [r * 0.82, h], [r * 0.7, h * 1.15]]; }
const ni = (g) => { const x = g.index ? g.toNonIndexed() : g; if (!x.attributes.normal) x.computeVertexNormals(); return x; };
const merge = (list) => { const g = mergeGeometries(list.map(ni)); g.computeBoundingBox(); return g; };
export function chessGeometry(type, seg = 32) {
  if (type === 'P') return merge([lathe([...base(seg, 0.3, 0.12), [0.18, 0.2], [0.12, 0.36], [0.1, 0.42], [0.17, 0.45], [0.17, 0.48], [0.1, 0.5], [0.14, 0.52], [0.16, 0.58], [0.15, 0.64], [0.11, 0.69], [0.05, 0.715], [0, 0.72]], seg)]);
  if (type === 'R') {
    const body = lathe([...base(seg, 0.34, 0.14), [0.22, 0.22], [0.2, 0.5], [0.21, 0.56], [0.26, 0.6], [0.26, 0.76], [0.19, 0.76], [0.19, 0.7], [0, 0.7]], seg);
    const merl = []; for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const b = new THREE.BoxGeometry(0.1, 0.09, 0.08); b.translate(0, 0.805, 0.215); b.rotateY(a); merl.push(b); }
    return merge([body, ...merl]);
  }
  if (type === 'B') {
    const body = lathe([...base(seg, 0.33, 0.14), [0.18, 0.22], [0.12, 0.44], [0.11, 0.52], [0.2, 0.55], [0.2, 0.58], [0.11, 0.6], [0.15, 0.66], [0.17, 0.74], [0.15, 0.82], [0.1, 0.88], [0.05, 0.92], [0.06, 0.94], [0.065, 0.97], [0.04, 1.0], [0, 1.01]], seg);
    return merge([body]);
  }
  if (type === 'Q') {
    const body = lathe([...base(seg, 0.36, 0.15), [0.2, 0.24], [0.13, 0.52], [0.12, 0.66], [0.22, 0.7], [0.22, 0.73], [0.14, 0.75], [0.17, 0.82], [0.22, 0.96], [0.15, 0.98], [0.1, 1.0], [0, 1.02]], seg);
    const balls = []; for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; const s = new THREE.SphereGeometry(0.035, 8, 6); s.translate(Math.cos(a) * 0.2, 0.985, Math.sin(a) * 0.2); balls.push(s); }
    const top = new THREE.SphereGeometry(0.06, 14, 10); top.translate(0, 1.07, 0);
    return merge([body, ...balls, top]);
  }
  if (type === 'K') {
    const body = lathe([...base(seg, 0.37, 0.15), [0.21, 0.24], [0.14, 0.56], [0.13, 0.7], [0.23, 0.74], [0.23, 0.77], [0.15, 0.79], [0.18, 0.88], [0.21, 1.0], [0.12, 1.03], [0.06, 1.05], [0, 1.05]], seg);
    const v = new THREE.BoxGeometry(0.06, 0.22, 0.06); v.translate(0, 1.15, 0);
    const h = new THREE.BoxGeometry(0.17, 0.06, 0.06); h.translate(0, 1.17, 0);
    return merge([body, v, h]);
  }
  if (type === 'N') {
    const body = lathe([...base(seg, 0.34, 0.14), [0.22, 0.22], [0.2, 0.3], [0, 0.3]], seg);
    // the head: a side silhouette, extruded and bevelled; looks towards -z
    const s = new THREE.Shape();
    const P_ = [[-0.17, 0.27], [0.19, 0.27], [0.16, 0.42], [0.1, 0.56], [0.06, 0.66], [0.05, 0.74], [0.07, 0.82], [0.02, 0.88], [-0.04, 0.84], [-0.1, 0.8], [-0.2, 0.72], [-0.28, 0.62], [-0.3, 0.56], [-0.25, 0.52], [-0.18, 0.55], [-0.1, 0.56], [-0.05, 0.5], [-0.12, 0.42], [-0.17, 0.33]];
    s.moveTo(P_[0][0], P_[0][1]); for (let i = 1; i < P_.length; i++) s.lineTo(P_[i][0], P_[i][1]); s.closePath();
    const head = new THREE.ExtrudeGeometry(s, { depth: 0.2, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.035, bevelSegments: 3, curveSegments: 4 });
    head.translate(0, 0, -0.1); head.rotateY(Math.PI / 2);
    // ears and eyes
    const e1 = new THREE.ConeGeometry(0.035, 0.09, 6); e1.translate(0.05, 0.9, 0.03);
    const e2 = new THREE.ConeGeometry(0.035, 0.09, 6); e2.translate(-0.05, 0.9, 0.03);
    return merge([body, head, e1, e2]);
  }
  throw new Error('pezzo ' + type);
}
// draughts man (a coin with grooves); a king is two stacked
export function damaGeometry(seg = 40) {
  return merge([lathe([[0, 0], [0.37, 0], [0.4, 0.02], [0.4, 0.1], [0.37, 0.12], [0.33, 0.12], [0.32, 0.11], [0.28, 0.11], [0.27, 0.125], [0.12, 0.125], [0.11, 0.115], [0, 0.115]], seg)]);
}
export function discGeometry(seg = 40) {
  // four-in-a-row disc lying on its side later (axis = y here)
  return merge([lathe([[0, -0.15], [0.36, -0.15], [0.4, -0.12], [0.41, -0.06], [0.37, -0.05], [0.37, 0.05], [0.41, 0.06], [0.4, 0.12], [0.36, 0.15], [0, 0.15]], seg)]);
}

// ───────── the stage
export class Stage3D {
  constructor(canvas, { tier = 'high', theme } = {}) {
    this.canvas = canvas; this.tier = tier; this.anims = []; this.dirty = true; this.raf = 0; this.views = [];
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: tier !== 'low', alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    r.setPixelRatio(pixelRatio(tier === 'high' ? 2 : 1.5)); r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = tier === 'high'; r.shadowMap.type = THREE.PCFSoftShadowMap;
    const sc = this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.1, 200);
    this.cam = { tx: 0, ty: 0, tz: 0, yaw: 0, pitch: 0.95, dist: 14 };
    this.camTo = null;
    if (tier !== 'low') {
      const pm = new THREE.PMREMGenerator(r); this.envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose();
      sc.environment = this.envTex; sc.environmentIntensity = 0.55;
    }
    sc.add(this.hemi = new THREE.HemisphereLight('#fff4e6', '#3a2a20', tier === 'low' ? 1.6 : 0.9));
    const key = this.key = new THREE.DirectionalLight('#fff1dc', tier === 'low' ? 1.6 : 2.1);
    key.position.set(-6, 14, 8);
    if (r.shadowMap.enabled) { key.castShadow = true; key.shadow.mapSize.set(2048, 2048); const c = key.shadow.camera; c.left = c.bottom = -10; c.right = c.top = 10; c.near = 2; c.far = 40; key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02; key.shadow.radius = 4; }
    sc.add(key); sc.add(key.target);
    const fill = new THREE.DirectionalLight('#c9dcff', 0.45); fill.position.set(8, 6, -6); sc.add(fill);
    // the table
    this.table = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.7 }));
    this.table.rotation.x = -Math.PI / 2; this.table.position.y = -0.36; this.table.receiveShadow = true; sc.add(this.table);
    this.setTheme(theme);
    this.guard = new FrameGuard([
      { fps: 42, run: () => this.setPR(Math.min(1.25, r.getPixelRatio())) },
      { fps: 34, run: () => { if (!r.shadowMap.enabled) return false; r.shadowMap.enabled = false; this.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; }); } },
      { fps: 26, run: () => this.setPR(1) },
    ]);
    this.w = 0; this.h = 0; this.resize();
    this.loop = this.loop.bind(this); this.last = performance.now(); this.raf = requestAnimationFrame(this.loop);
  }
  setPR(pr) { const r = this.renderer; if (Math.abs(r.getPixelRatio() - pr) < 0.01) return false; r.setPixelRatio(pr); this.resize(true); }
  setTheme(theme) {
    if (!theme) return;
    this.theme = theme;
    const m = this.table.material; m.map = materialTexture(theme.table, 'wood', 512, 9); m.map.repeat.set(6, 6); m.needsUpdate = true;
    this.scene.background = new THREE.Color(theme.table).multiplyScalar(0.55);
    this.scene.fog = new THREE.Fog(this.scene.background, 26, 60);
    this.dirty = true;
  }
  resize(force) {
    const c = this.canvas, w = c.clientWidth || 1, h = c.clientHeight || 1;
    if (!force && w === this.w && h === this.h) return false;
    this.w = w; this.h = h; this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.dirty = true;
    for (const v of this.views) v.onResize?.();
    return true;
  }
  // camera from spherical coordinates around a target
  placeCamera(c = this.cam) {
    const cp = Math.cos(c.pitch), cam = this.camera;
    cam.position.set(c.tx + Math.sin(c.yaw) * cp * c.dist, c.ty + Math.sin(c.pitch) * c.dist, c.tz + Math.cos(c.yaw) * cp * c.dist);
    cam.up.set(0, 1, 0);
    if (c.pitch > 1.5) cam.up.set(-Math.sin(c.yaw), 0, -Math.cos(c.yaw));
    cam.lookAt(c.tx, c.ty, c.tz); cam.updateMatrixWorld();
  }
  // distance that fits the world points (array of Vector3) inside the view with a margin
  fitDist(c, pts, margin = 0.9) {
    let lo = 2, hi = 120;
    const cam = this.camera, v = new THREE.Vector3();
    for (let it = 0; it < 24; it++) {
      const mid = (lo + hi) / 2; this.placeCamera({ ...c, dist: mid });
      cam.updateMatrixWorld(); cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
      let ok = true;
      for (const p of pts) { v.copy(p).project(cam); if (Math.abs(v.x) > margin || Math.abs(v.y) > margin || v.z > 1) { ok = false; break; } }
      if (ok) hi = mid; else lo = mid;
    }
    return hi;
  }
  // frame: { target:[x,y,z], yaw, pitch, pts:[Vector3...], margin }
  frame(f, dur = 0) {
    const c = { tx: f.target[0], ty: f.target[1], tz: f.target[2], yaw: f.yaw, pitch: f.pitch, dist: 10 };
    c.dist = this.fitDist(c, f.pts, f.margin || 0.92);
    this.lastFrame = f;
    if (!dur || reduce()) { this.cam = c; this.camTo = null; this.placeCamera(); this.dirty = true; return; }
    const from = { ...this.cam };
    // shortest way round for the yaw
    let dy = c.yaw - from.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
    c.yaw = from.yaw + dy;
    this.animate(dur, (k) => { for (const key of Object.keys(c)) this.cam[key] = from[key] + (c[key] - from[key]) * k; this.placeCamera(); }, ease.io);
  }
  reframe() { if (this.lastFrame) this.frame(this.lastFrame, 0); }
  animate(dur, fn, e = ease.io) {
    if (reduce()) dur = Math.min(dur, 0.12);
    return new Promise((res) => { this.anims.push({ t: 0, dur: Math.max(0.001, dur), fn, e, res }); this.dirty = true; });
  }
  project(x, y, z) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    return [(v.x * 0.5 + 0.5) * this.w, (-v.y * 0.5 + 0.5) * this.h];
  }
  // world point on the horizontal plane y under the client pointer
  pointOnPlane(clientX, clientY, y = 0) {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, this.camera);
    const p = new THREE.Vector3(); ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -y), p);
    return p;
  }
  loop(now) {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    if (this.resize()) this.reframe();
    if (this.anims.length) {
      this.dirty = true;
      for (const a of this.anims.slice()) {
        a.t += dt; const k = Math.min(1, a.t / a.dur); a.fn(a.e(k), k);
        if (k >= 1) { this.anims.splice(this.anims.indexOf(a), 1); a.res(); }
      }
    }
    let live = false;
    for (const v of this.views) if (v.update?.(dt)) live = true;
    if (live) this.dirty = true;
    if (!this.dirty) return;
    this.dirty = false;
    this.placeCamera();
    this.renderer.render(this.scene, this.camera);
    for (const v of this.views) v.afterRender?.();
    if (this.anims.length || live) this.guard.tick();
  }
  // drive frames by hand (tests): finishes the running animations
  flush(steps = 60) { for (let i = 0; i < steps && this.anims.length; i++) { for (const a of this.anims.slice()) { a.t = a.dur; a.fn(a.e(1), 1); this.anims.splice(this.anims.indexOf(a), 1); a.res(); } } this.dirty = true; }
  dispose() {
    cancelAnimationFrame(this.raf);
    for (const v of this.views) v.dispose?.();
    this.scene.traverse((o) => { if (o.isMesh) { o.geometry?.dispose(); const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) m?.dispose?.(); } });
    this.envTex?.dispose();
    this.renderer.dispose(); this.renderer.forceContextLoss?.();
  }
}
export function disposeTextures() { for (const t of texCache.values()) t.dispose?.(); texCache.clear(); }
