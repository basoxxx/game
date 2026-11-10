// Particles (dust, smoke, fire, sparks, glass, mud, water) and tyre marks for the demolition mode.
import * as THREE from 'three';

function softTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
}
// billowy puff: several overlapping soft blobs with a darker underside (alpha in A, shading in RGB)
function puffTex() {
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  let s = 7; const R = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 26; i++) {
    const a = R() * 6.283, r = R() * S * 0.22, x = S / 2 + Math.cos(a) * r, y = S / 2 + Math.sin(a) * r * 0.85, rad = S * (0.12 + R() * 0.16);
    const sh = 0.72 + 0.28 * (1 - y / S); const v = Math.round(255 * sh);
    const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, `rgba(${v},${v},${v},0.55)`); gr.addColorStop(1, `rgba(${v},${v},${v},0)`);
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill();
  }
  const t = new THREE.CanvasTexture(c); return t;
}
function chipTex() {
  const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.beginPath(); g.moveTo(16, 3); g.lineTo(29, 13); g.lineTo(21, 29); g.lineTo(5, 24); g.lineTo(3, 9); g.closePath(); g.fill();
  return new THREE.CanvasTexture(c);
}
const TEX = { soft: softTex(), puff: puffTex(), chip: chipTex() };
// shared lighting of the non-additive particles: view-space sun direction, light colour and
// ambient level (DerbyGame updates them every frame), so dust and smoke have a lit and a shaded side
export const FXENV = { sunV: { value: new THREE.Vector3(0.3, 0.8, 0.5) }, light: { value: new THREE.Color(0.62, 0.6, 0.56) }, amb: { value: 0.6 } };

// One pooled particle system. tex: 'soft' | 'puff' | 'chip'
export class Particles {
  constructor(scene, max, { additive = false, gravity = 0, drag = 1, grow = 1, sizeScale = 1, tex = 'soft', spin = 0, fog = true } = {}) {
    this.max = max; this.head = 0; this.gravity = gravity; this.drag = drag; this.grow = grow; this.spin = spin;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 4); this.size = new Float32Array(max); this.rot = new Float32Array(max);
    this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.life0 = new Float32Array(max); this.alpha0 = new Float32Array(max); this.size0 = new Float32Array(max); this.rv = new Float32Array(max);
    for (let i = 0; i < max; i++) this.pos[i * 3 + 1] = -9999;
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(this.col, 4)); g.setAttribute('size', new THREE.BufferAttribute(this.size, 1)); g.setAttribute('rot', new THREE.BufferAttribute(this.rot, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: TEX[tex] }, scale: { value: 600 * sizeScale }, fogColor: { value: new THREE.Color() }, fogDensity: { value: 0 }, light: { value: 1 }, sunV: FXENV.sunV, lcol: FXENV.light, amb: FXENV.amb },
      vertexShader: 'attribute float size; attribute float rot; attribute vec4 color; varying vec4 vC; varying float vR; varying float vFog; uniform float scale; uniform float fogDensity; void main(){ vC=color; vR=rot; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=min(512.0, size*scale/max(0.5,-mv.z)); gl_Position=projectionMatrix*mv; float fd = fogDensity * length(mv.xyz); vFog = 1.0 - exp(-fd*fd); }',
      fragmentShader: `uniform sampler2D map; uniform vec3 fogColor; uniform float light; uniform vec3 sunV; uniform vec3 lcol; uniform float amb; varying vec4 vC; varying float vR; varying float vFog; void main(){ vec2 p = gl_PointCoord - 0.5; float c = cos(vR), s = sin(vR); p = vec2(c*p.x - s*p.y, s*p.x + c*p.y) + 0.5; vec4 t=texture2D(map,p); vec3 col = vC.rgb * ${additive ? '1.0' : 'mix(0.55, 1.15, t.r) * light * (amb + lcol * clamp(dot(normalize(vec3((gl_PointCoord.x - 0.5) * 2.0, (0.5 - gl_PointCoord.y) * 2.0, 0.6)), sunV) * 0.65 + 0.45, 0.0, 1.4))'}; ${fog && !additive ? 'col = mix(col, fogColor, vFog);' : ''} gl_FragColor=vec4(col, vC.a*t.a${additive ? ' * (1.0 - vFog)' : ''}); if(gl_FragColor.a<0.01) discard; }`,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, mat); this.points.frustumCulled = false; this.points.renderOrder = additive ? 3 : 2; scene.add(this.points);
    this.scene = scene; this.active = 0;
  }
  emit(x, y, z, vx, vy, vz, life, size, r, gC, b, a) {
    const i = this.head; this.head = (this.head + 1) % this.max;
    const k = i * 3; this.pos[k] = x; this.pos[k + 1] = y; this.pos[k + 2] = z; this.vel[k] = vx; this.vel[k + 1] = vy; this.vel[k + 2] = vz;
    this.life[i] = this.life0[i] = life; this.size[i] = this.size0[i] = size; this.rot[i] = Math.random() * 6.28; this.rv[i] = (Math.random() - 0.5) * this.spin;
    const c = i * 4; this.col[c] = r; this.col[c + 1] = gC; this.col[c + 2] = b; this.col[c + 3] = 0; this.alpha0[i] = a;
    this.active = this.max;
  }
  update(dt) {
    if (!this.active) return;
    const fog = this.scene.fog; const u = this.points.material.uniforms; if (fog) { u.fogColor.value.copy(fog.color); u.fogDensity.value = fog.density || 0; }
    const dr = Math.max(0, 1 - this.drag * dt); let alive = 0;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -9999; this.col[i * 4 + 3] = 0; continue; }
      alive++;
      const k = i * 3; this.vel[k + 1] -= this.gravity * dt; this.vel[k] *= dr; this.vel[k + 1] *= dr; this.vel[k + 2] *= dr;
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
      this.rot[i] += this.rv[i] * dt;
      const t = 1 - this.life[i] / this.life0[i];
      this.size[i] = this.size0[i] * (1 + t * this.grow);
      this.col[i * 4 + 3] = this.alpha0[i] * (t < 0.12 ? t / 0.12 : 1 - (t - 0.12) / 0.88);
    }
    if (!alive) this.active = 0;
    const g = this.points.geometry; g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true; g.attributes.size.needsUpdate = true; g.attributes.rot.needsUpdate = true;
  }
}

// Tyre marks: ring buffer of quads laid on the ground
export class SkidMarks {
  constructor(scene, max = 3000, color = [0.06, 0.05, 0.04]) {
    this.max = max; this.head = 0;
    const pos = new Float32Array(max * 4 * 3), alpha = new Float32Array(max * 4), idx = [];
    for (let i = 0; i < max; i++) { const b = i * 4; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1)); g.setIndex(idx);
    const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4,
      vertexShader: 'attribute float alpha; varying float vA; void main(){ vA=alpha; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: `varying float vA; void main(){ gl_FragColor=vec4(${color.map((c) => c.toFixed(3)).join(',')},vA*0.55); }` });
    this.mesh = new THREE.Mesh(g, mat); this.mesh.frustumCulled = false; scene.add(this.mesh); this.last = new Map();
  }
  // key identifies one wheel; p = ground point, side = unit lateral vector, strength 0..1
  add(key, p, side, strength, w = 0.14) {
    const prev = this.last.get(key);
    if (prev && prev.p.distanceToSquared(p) < 0.36) return; // lay segments every ~0.6 m
    this.last.set(key, { p: p.clone(), side: side.clone() });
    if (!prev || prev.p.distanceToSquared(p) > 9 || strength <= 0.05) return;
    const i = this.head; this.head = (this.head + 1) % this.max;
    const P = this.mesh.geometry.attributes.position, A = this.mesh.geometry.attributes.alpha;
    const q = [prev.p.clone().addScaledVector(prev.side, w), prev.p.clone().addScaledVector(prev.side, -w), p.clone().addScaledVector(side, w), p.clone().addScaledVector(side, -w)];
    q.forEach((v, k) => { P.setXYZ(i * 4 + k, v.x, v.y + 0.03, v.z); A.setX(i * 4 + k, Math.min(1, strength)); });
    P.needsUpdate = true; A.needsUpdate = true;
  }
  break(key) { this.last.delete(key); }
}

// ---------------------------------------------------------------------------------------------
// Sparks with trails: each spark is a short additive line from its position back along its
// velocity; they bounce once on the ground.
export class Streaks {
  constructor(scene, max = 700) {
    this.max = max; this.head = 0; this.active = 0;
    this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3); this.life = new Float32Array(max); this.life0 = new Float32Array(max); this.c = new Float32Array(max * 3);
    this.pos = new Float32Array(max * 6); this.col = new Float32Array(max * 6);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.mesh = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 4; scene.add(this.mesh);
  }
  emit(x, y, z, vx, vy, vz, life, size, r = 1, g = 0.75, b = 0.35) {
    const i = this.head; this.head = (this.head + 1) % this.max; const k = i * 3;
    this.p[k] = x; this.p[k + 1] = y; this.p[k + 2] = z; this.v[k] = vx; this.v[k + 1] = vy; this.v[k + 2] = vz; this.life[i] = this.life0[i] = life * 1.6; this.c[k] = r * 2.2; this.c[k + 1] = g * 1.7; this.c[k + 2] = b * 1.2; this.active = 1;
  }
  update(dt, terrain) {
    if (!this.active) return; let alive = 0; const dr = Math.max(0, 1 - 0.9 * dt);
    for (let i = 0; i < this.max; i++) {
      const k = i * 3, o = i * 6;
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.pos[o + 1] = this.pos[o + 4] = -9999; continue; }
      alive++;
      this.v[k + 1] -= 13 * dt; this.v[k] *= dr; this.v[k + 2] *= dr;
      this.p[k] += this.v[k] * dt; this.p[k + 1] += this.v[k + 1] * dt; this.p[k + 2] += this.v[k + 2] * dt;
      if (terrain && this.v[k + 1] < 0) { const gy = terrain.heightAt(this.p[k], this.p[k + 2]) + 0.03; if (this.p[k + 1] < gy) { this.p[k + 1] = gy; this.v[k + 1] *= -0.38; this.v[k] *= 0.7; this.v[k + 2] *= 0.7; } }
      const f = Math.min(1, this.life[i] / this.life0[i] * 1.6), tl = 0.045;
      this.pos[o] = this.p[k]; this.pos[o + 1] = this.p[k + 1]; this.pos[o + 2] = this.p[k + 2];
      this.pos[o + 3] = this.p[k] - this.v[k] * tl; this.pos[o + 4] = this.p[k + 1] - this.v[k + 1] * tl; this.pos[o + 5] = this.p[k + 2] - this.v[k + 2] * tl;
      this.col[o] = this.c[k] * f; this.col[o + 1] = this.c[k + 1] * f; this.col[o + 2] = this.c[k + 2] * f;
      this.col[o + 3] = this.c[k] * f * 0.15; this.col[o + 4] = this.c[k + 1] * f * 0.08; this.col[o + 5] = 0;
    }
    if (!alive) this.active = 0;
    this.mesh.geometry.attributes.position.needsUpdate = true; this.mesh.geometry.attributes.color.needsUpdate = true;
  }
}

// Debris chunks: tumbling bits of bodywork, glass and wood (instanced boxes, cheap ballistic
// physics against the terrain heightfield; they come to rest and fade out by shrinking).
export class Chunks {
  constructor(scene, max = 180) {
    this.max = max; this.head = 0; this.active = 0;
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.35 });
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, max); this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = true; this.mesh.receiveShadow = true; this.mesh.frustumCulled = false;
    this.it = Array.from({ length: max }, () => ({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), q: new THREE.Quaternion(), ax: new THREE.Vector3(1, 0, 0), w: 0, s: new THREE.Vector3(1, 1, 1) }));
    const m = new THREE.Matrix4().makeScale(0, 0, 0); const c = new THREE.Color(1, 1, 1); for (let i = 0; i < max; i++) { this.mesh.setMatrixAt(i, m); this.mesh.setColorAt(i, c); }
    scene.add(this.mesh); this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._c = new THREE.Color();
  }
  emit(x, y, z, vx, vy, vz, size, r, g, b, life = 5, flat = 0.25) {
    const i = this.head; this.head = (this.head + 1) % this.max; const it = this.it[i];
    it.life = it.life0 = life * (0.7 + Math.random() * 0.6); it.p.set(x, y, z); it.v.set(vx, vy, vz); it.ax.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(); it.w = 6 + Math.random() * 14;
    it.s.set(size * (0.6 + Math.random()), size * flat * (0.5 + Math.random()), size * (0.4 + Math.random() * 0.8)); it.q.setFromAxisAngle(it.ax, Math.random() * 6.28);
    this.mesh.setColorAt(i, this._c.setRGB(r, g, b)); this.mesh.instanceColor.needsUpdate = true; this.active = 1;
  }
  update(dt, terrain) {
    if (!this.active) return; let alive = 0;
    for (let i = 0; i < this.max; i++) {
      const it = this.it[i]; if (it.life <= 0) continue;
      it.life -= dt; alive++;
      if (it.w > 0.05) {
        it.v.y -= 15 * dt; it.p.addScaledVector(it.v, dt);
        this._q.setFromAxisAngle(it.ax, it.w * dt); it.q.premultiply(this._q);
        const gy = (terrain ? terrain.heightAt(it.p.x, it.p.z) : 0) + it.s.y * 0.5 + 0.02;
        if (it.p.y < gy) { it.p.y = gy; if (it.v.y < -1.5) { it.v.y *= -0.35; it.v.x *= 0.6; it.v.z *= 0.6; it.w *= 0.6; } else { it.v.y = 0; it.v.x *= Math.max(0, 1 - 6 * dt); it.v.z *= Math.max(0, 1 - 6 * dt); it.w *= Math.max(0, 1 - 8 * dt); } }
      }
      const k = it.life <= 0 ? 0 : Math.min(1, it.life / 0.6);
      this._m.compose(it.p, it.q, this._s.copy(it.s).multiplyScalar(k)); this.mesh.setMatrixAt(i, this._m);
    }
    if (!alive) this.active = 0;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// Rain: streaks in a box that follows the camera (one draw call)
export class Rain {
  constructor(scene, n = 1400, heavy = 1) {
    this.n = n; this.box = [34, 22, 34]; this.off = new Float32Array(n * 3); this.pos = new Float32Array(n * 6);
    for (let i = 0; i < n * 3; i++) this.off[i] = Math.random();
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.mesh = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xaebccb, transparent: true, opacity: 0.32 * heavy, depthWrite: false, fog: false }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 5; scene.add(this.mesh); this.t = 0; this.wind = new THREE.Vector3(2.5, -24, 1.2);
  }
  update(dt, cam, vel) {
    this.t += dt; const [bx, by, bz] = this.box, w = this.wind, P = this.pos;
    // streak direction relative to the camera's own motion (driving into the rain slants it)
    const sx = (w.x - (vel?.x || 0) * 0.6) * 0.03, sy = w.y * 0.03, sz = (w.z - (vel?.z || 0) * 0.6) * 0.03;
    for (let i = 0; i < this.n; i++) {
      const k = i * 3, o = i * 6;
      const x = ((this.off[k] * bx + w.x * this.t - cam.x) % bx + bx) % bx - bx / 2 + cam.x;
      const y = ((this.off[k + 1] * by + w.y * this.t - cam.y) % by + by) % by - by / 2 + cam.y + 4;
      const z = ((this.off[k + 2] * bz + w.z * this.t - cam.z) % bz + bz) % bz - bz / 2 + cam.z;
      P[o] = x; P[o + 1] = y; P[o + 2] = z; P[o + 3] = x - sx; P[o + 4] = y - sy; P[o + 5] = z - sz;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
  }
}

// Camera lens: mud splats and water drops on a small 2D overlay (blurred by the upscale),
// they run down slowly and dry out. Only redrawn while something is on the glass.
export class LensFx {
  constructor(container) {
    const c = this.c = document.createElement('canvas'); c.width = 480; c.height = 270; c.className = 'dzx-lens';
    Object.assign(c.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', opacity: '0.92' });
    container.appendChild(c); this.g = c.getContext('2d'); this.list = []; this.dirty = false;
  }
  splat(kind = 'mud', n = 6, power = 1) {
    for (let i = 0; i < n && this.list.length < 70; i++) {
      const edge = Math.random() < 0.6; const x = edge ? (Math.random() < 0.5 ? Math.random() * 0.3 : 0.7 + Math.random() * 0.3) : Math.random(), y = Math.random() ** (kind === 'mud' ? 0.6 : 1);
      const life = kind === 'mud' ? 3.5 + Math.random() * 3 : 1.2 + Math.random() * 1.6;
      this.list.push({ kind, x: x * 480, y: y * 270, r: (kind === 'mud' ? 7 + Math.random() * 24 : 3 + Math.random() * 9) * power, life, life0: life, vy: kind === 'mud' ? 2 + Math.random() * 5 : 10 + Math.random() * 40, seed: Math.random() * 100, blobs: Array.from({ length: kind === 'mud' ? 5 : 1 }, () => [(Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 1.6, 0.35 + Math.random() * 0.6]) });
    }
  }
  update(dt) {
    const L = this.list, g = this.g; if (!L.length) { if (this.dirty) { g.clearRect(0, 0, 480, 270); this.dirty = false; } return; }
    g.clearRect(0, 0, 480, 270); this.dirty = true;
    for (let i = L.length - 1; i >= 0; i--) {
      const s = L[i]; s.life -= dt; if (s.life <= 0) { L.splice(i, 1); continue; }
      s.y += s.vy * dt; const a = Math.min(1, s.life / (s.life0 * 0.5));
      if (s.kind === 'mud') {
        for (const [ox, oy, k] of s.blobs) { const x = s.x + ox * s.r, y = s.y + oy * s.r, r = s.r * k; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(58,42,26,${0.9 * a})`); gr.addColorStop(0.7, `rgba(72,54,34,${0.75 * a})`); gr.addColorStop(1, 'rgba(72,54,34,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
        g.fillStyle = `rgba(62,46,28,${0.5 * a})`; g.fillRect(s.x - 1, s.y, 2.5, s.r * 1.4 * (1 - s.life / s.life0));
      } else {
        const gr = g.createRadialGradient(s.x - s.r * 0.3, s.y - s.r * 0.3, 0, s.x, s.y, s.r); gr.addColorStop(0, `rgba(255,255,255,${0.42 * a})`); gr.addColorStop(0.6, `rgba(190,205,220,${0.16 * a})`); gr.addColorStop(0.9, `rgba(40,50,60,${0.28 * a})`); gr.addColorStop(1, 'rgba(40,50,60,0)');
        g.fillStyle = gr; g.beginPath(); g.ellipse(s.x, s.y, s.r * 0.85, s.r * 1.15, 0, 0, 7); g.fill();
      }
    }
  }
  clear() { this.list.length = 0; }
}

// Shockwave ring on the ground (additive, expanding and fading)
let _ringTex = null;
export class Shockwaves {
  constructor(scene) {
    if (!_ringTex) { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 30, 64, 64, 63); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.75, 'rgba(255,220,170,0.15)'); gr.addColorStop(0.92, 'rgba(255,240,210,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); _ringTex = new THREE.CanvasTexture(c); }
    this.pool = Array.from({ length: 4 }, () => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: _ringTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); m.visible = false; m.renderOrder = 3; scene.add(m); return { m, t: 1 }; });
    this.k = 0;
  }
  fire(x, y, z, size = 26) { const o = this.pool[this.k++ % this.pool.length]; o.t = 0; o.size = size; o.m.position.set(x, y + 0.25, z); o.m.visible = true; }
  update(dt) { for (const o of this.pool) { if (!o.m.visible) continue; o.t += dt * 1.6; if (o.t >= 1) { o.m.visible = false; continue; } const e = 1 - (1 - o.t) ** 3; o.m.scale.setScalar(2 + e * o.size); o.m.material.opacity = (1 - o.t) ** 1.5 * 0.9; } }
}
