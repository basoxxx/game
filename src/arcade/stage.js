// Arcade Baso — shared three.js toolkit for the four views: renderer + bloom + frame guard, a camera
// that frames a 2D playfield (x right, y up, z towards the viewer) with a slight 2.5D tilt, instanced
// pools with per-instance colours, additive spark particles and small procedural textures.
import * as THREE from 'three';
import { pixelRatio } from '../ui/quality.js';
import { FrameGuard } from '../ui/perfguard.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export { THREE };
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3(), tmpE = new THREE.Euler(), tmpC = new THREE.Color(), tv = new THREE.Vector3();

export class Stage {
  constructor(canvas, { tier = 'high', bg = '#05060f', fov = 38, bloom = [0.9, 0.5, 0.62] } = {}) {
    this.tier = tier; this.canvas = canvas;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: tier !== 'low', powerPreference: 'high-performance' });
    r.setPixelRatio(pixelRatio(1.75)); r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(bg);
    this.camera = new THREE.PerspectiveCamera(fov, 1, 0.5, 2000);
    this.W = 1; this.H = 1; this.shake = 0; this.clock = 0; this.field = null;
    if (tier !== 'low') {
      const rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: tier === 'high' ? 4 : 0 });
      this.composer = new EffectComposer(r, rt);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), bloom[0] * (tier === 'high' ? 1 : 0.8), bloom[1], bloom[2]);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    }
    const setPR = (pr) => { if (Math.abs(r.getPixelRatio() - pr) < 0.01) return false; r.setPixelRatio(pr); this.composer?.setPixelRatio?.(pr); this.resize(this.W, this.H); };
    this.guard = new FrameGuard([
      { fps: 48, run: () => setPR(1) },
      { fps: 38, run: () => { if (!this.composer) return false; this.composer.dispose?.(); this.composer = null; } },
      { fps: 28, run: () => setPR(0.75) },
    ]);
  }
  resize(w, h) {
    this.W = w; this.H = h;
    this.renderer.setSize(w, h, false); this.composer?.setSize(w, h);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    if (this.field) this.frame(this.field);
  }
  // fit the rect [0..fw] x [0..fh] (plus margins in field units) to the viewport, tilted by `tilt` rad
  frame(f) {
    this.field = f;
    const { w: fw, h: fh, tilt = 0.18, pad = 2, padTop = 0, padBottom = 0, padSide = 0, cx = fw / 2 } = f;
    const cam = this.camera, vf = THREE.MathUtils.degToRad(cam.fov), asp = this.W / this.H;
    const needH = fh + pad * 2 + padTop + padBottom, needW = fw + pad * 2 + padSide * 2;
    const dist = Math.max(needH / (2 * Math.tan(vf / 2)), needW / (2 * Math.tan(vf / 2) * asp)) * (1 + tilt * 0.35);
    const cy = fh / 2 + (padTop - padBottom) / 2;
    this.look = new THREE.Vector3(cx, cy, 0);
    this.camBase = new THREE.Vector3(cx, cy - Math.sin(tilt) * dist, Math.cos(tilt) * dist);
    cam.position.copy(this.camBase); cam.up.set(0, 1, 0); cam.lookAt(this.look);
    this.dist = dist;
  }
  kick(a = 0.6) { this.shake = Math.min(1.6, this.shake + a); }
  update(dt) {
    this.clock += dt;
    if (this.camBase && this.field) {
      const s = this.shake; this.shake = Math.max(0, s - dt * 2.6);
      const k = s * s * 0.9, t = this.clock * 50;
      this.camera.position.set(this.camBase.x + Math.sin(t * 1.1) * k, this.camBase.y + Math.cos(t * 1.37) * k, this.camBase.z);
      this.camera.lookAt(this.look.x + Math.sin(t * 0.9) * k * 0.5, this.look.y, 0);
    }
  }
  render() { if (this.composer) this.composer.render(); else this.renderer.render(this.scene, this.camera); this.guard.tick(); }
  // client px -> field point on the z=0 plane, and world -> client px
  toField(cx, cy, z = 0) {
    const R = this.canvas.getBoundingClientRect();
    tv.set(((cx - R.left) / R.width) * 2 - 1, -(((cy - R.top) / R.height) * 2 - 1), 0.5).unproject(this.camera).sub(this.camera.position).normalize();
    const k = (z - this.camera.position.z) / tv.z;
    return [this.camera.position.x + tv.x * k, this.camera.position.y + tv.y * k];
  }
  toScreen(x, y, z = 0) {
    tv.set(x, y, z).project(this.camera);
    return [(tv.x + 1) / 2 * this.W, (1 - tv.y) / 2 * this.H, tv.z < 1];
  }
  // field units per css pixel at the play plane (for touch drags)
  unitsPerPx() { const a = this.toField(this.W / 2, this.H / 2), b = this.toField(this.W / 2 + 100, this.H / 2); return Math.hypot(b[0] - a[0], b[1] - a[1]) / 100; }
  dispose() {
    this.scene.traverse((o) => { o.geometry?.dispose?.(); const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach((x) => { x.map?.dispose?.(); x.dispose?.(); }); });
    this.composer?.dispose?.(); this.renderer.dispose(); this.renderer.forceContextLoss?.();
  }
}

// instanced pool: write instances each frame with add(), then end()
export class Pool {
  constructor(scene, geo, mat, max) {
    this.mesh = new THREE.InstancedMesh(geo, mat, max); this.max = max;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false; this.mesh.count = 0; this.n = 0;
    scene.add(this.mesh);
  }
  begin() { this.n = 0; }
  add(x, y, z, sx, sy = sx, sz = sx, rz = 0, color = 0xffffff, k = 1, rx = 0, ry = 0) {
    if (this.n >= this.max) return;
    tmpP.set(x, y, z); tmpS.set(sx, sy, sz); tmpE.set(rx, ry, rz); tmpQ.setFromEuler(tmpE);
    tmpM.compose(tmpP, tmpQ, tmpS); this.mesh.setMatrixAt(this.n, tmpM);
    tmpC.set(color); this.mesh.instanceColor.setXYZ(this.n, tmpC.r * k, tmpC.g * k, tmpC.b * k);
    this.n++;
  }
  end() { this.mesh.count = this.n; this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor.needsUpdate = true; }
}

// additive particles (points), with drag and optional gravity along -y (field) or -z
export class Sparks {
  constructor(scene, n = 1200, { gravity = 0, axis = 1 } = {}) {
    this.n = n; this.i = 0; this.g = gravity; this.axis = axis;
    this.pos = new Float32Array(n * 3).fill(-9999); this.vel = new Float32Array(n * 3); this.col = new Float32Array(n * 3); this.size = new Float32Array(n); this.life = new Float32Array(n); this.max = new Float32Array(n); this.alpha = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    for (const [k, a, s] of [['position', this.pos, 3], ['color', this.col, 3], ['size', this.size, 1], ['alpha', this.alpha, 1]]) g.setAttribute(k, new THREE.BufferAttribute(a, s).setUsage(THREE.DynamicDrawUsage));
    this.uScale = { value: 600 };
    this.pts = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: { uScale: this.uScale },
      vertexShader: 'attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA; uniform float uScale; void main(){ vC = color; vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = alpha > 0.0 ? clamp(size * uScale / max(1.0, -mv.z), 1.0, 96.0) : 0.0; }',
      fragmentShader: 'varying vec3 vC; varying float vA; void main(){ vec2 d = gl_PointCoord - 0.5; float r = dot(d, d) * 4.0; if (r > 1.0) discard; float a = vA * (1.0 - r) * (1.0 - r); gl_FragColor = vec4(vC * a * 1.6, 1.0); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.pts.frustumCulled = false; this.pts.renderOrder = 8; scene.add(this.pts);
  }
  emit(x, y, z, vx, vy, vz, color, size = 1, life = 0.6) {
    const i = this.i = (this.i + 1) % this.n, j = i * 3; tmpC.set(color);
    this.pos[j] = x; this.pos[j + 1] = y; this.pos[j + 2] = z; this.vel[j] = vx; this.vel[j + 1] = vy; this.vel[j + 2] = vz;
    this.col[j] = tmpC.r; this.col[j + 1] = tmpC.g; this.col[j + 2] = tmpC.b; this.size[i] = size; this.life[i] = this.max[i] = life; this.alpha[i] = 1; this.dirty = true;
  }
  burst(x, y, z, color, n = 16, speed = 30, size = 1, life = 0.6, up = 0) {
    for (let k = 0; k < n; k++) { const a = Math.random() * Math.PI * 2, b = Math.random() * 2 - 1, s = speed * (0.35 + Math.random() * 0.65); this.emit(x, y, z, Math.cos(a) * s * Math.sqrt(1 - b * b), Math.sin(a) * s * Math.sqrt(1 - b * b) + up, b * s * 0.5, color, size * (0.6 + Math.random() * 0.8), life * (0.6 + Math.random() * 0.6)); }
  }
  update(dt) {
    if (!this.dirty) return;
    let any = false; const d = Math.exp(-2.4 * dt), ax = this.axis;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt; const j = i * 3;
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      any = true;
      this.vel[j] *= d; this.vel[j + 1] *= d; this.vel[j + 2] *= d; this.vel[j + ax] -= this.g * dt;
      this.pos[j] += this.vel[j] * dt; this.pos[j + 1] += this.vel[j + 1] * dt; this.pos[j + 2] += this.vel[j + 2] * dt;
      this.alpha[i] = Math.min(1, (this.life[i] / this.max[i]) * 2);
    }
    const a = this.pts.geometry.attributes; a.position.needsUpdate = a.alpha.needsUpdate = a.color.needsUpdate = a.size.needsUpdate = true;
    this.dirty = any;
  }
  setScale(stage) { this.uScale.value = (stage.H * stage.renderer.getPixelRatio()) / (2 * Math.tan(THREE.MathUtils.degToRad(stage.camera.fov) / 2)); }
}

export function glowTex(inner = '#ffffff', outer = 'rgba(255,255,255,0)') {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32); grd.addColorStop(0, inner); grd.addColorStop(0.25, inner); grd.addColorStop(1, outer);
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// a starfield / dust layer: points scrolling in y (wrap) — for space and night skies
export class Starfield {
  constructor(scene, n, box, color = '#ffffff', size = 0.6) {
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), c = new THREE.Color();
    this.box = box; this.speed = new Float32Array(n);
    for (let i = 0; i < n; i++) { pos[i * 3] = box[0] + Math.random() * (box[1] - box[0]); pos[i * 3 + 1] = box[2] + Math.random() * (box[3] - box[2]); pos[i * 3 + 2] = box[4] + Math.random() * (box[5] - box[4]); c.set(color).multiplyScalar(0.4 + Math.random() * 0.8); col.set([c.r, c.g, c.b], i * 3); this.speed[i] = 0.4 + Math.random() * 0.9; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.pts = new THREE.Points(g, new THREE.PointsMaterial({ size, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, map: glowTex(), sizeAttenuation: true }));
    this.pts.frustumCulled = false; scene.add(this.pts); this.pos = pos;
  }
  scroll(dy) {
    const b = this.box, p = this.pos, h = b[3] - b[2];
    for (let i = 0; i < this.speed.length; i++) { let y = p[i * 3 + 1] - dy * this.speed[i]; if (y < b[2]) y += h; if (y > b[3]) y -= h; p[i * 3 + 1] = y; }
    this.pts.geometry.attributes.position.needsUpdate = true;
  }
}
// unlit, tone-mapping-free material for glowing instanced parts (instance colour > 1 = bloom)
export const glowMat = (opts = {}) => new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false, ...opts });
export const litMat = (opts = {}) => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.45, metalness: 0.2, ...opts });
// lit material whose instance colour also glows (emissive = instance colour x k): neon solids
export function neonMat(k = 0.45, opts = {}) {
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4, metalness: 0.15, ...opts });
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      #ifdef USE_INSTANCING_COLOR
        totalEmissiveRadiance += vColor * ${k.toFixed(3)};
      #endif`);
  };
  m.customProgramCacheKey = () => 'neon' + k;
  return m;
}
