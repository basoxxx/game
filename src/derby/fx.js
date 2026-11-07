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
      uniforms: { map: { value: TEX[tex] }, scale: { value: 600 * sizeScale }, fogColor: { value: new THREE.Color() }, fogDensity: { value: 0 }, light: { value: 1 } },
      vertexShader: 'attribute float size; attribute float rot; attribute vec4 color; varying vec4 vC; varying float vR; varying float vFog; uniform float scale; uniform float fogDensity; void main(){ vC=color; vR=rot; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=min(512.0, size*scale/max(0.5,-mv.z)); gl_Position=projectionMatrix*mv; float fd = fogDensity * length(mv.xyz); vFog = 1.0 - exp(-fd*fd); }',
      fragmentShader: `uniform sampler2D map; uniform vec3 fogColor; uniform float light; varying vec4 vC; varying float vR; varying float vFog; void main(){ vec2 p = gl_PointCoord - 0.5; float c = cos(vR), s = sin(vR); p = vec2(c*p.x - s*p.y, s*p.x + c*p.y) + 0.5; vec4 t=texture2D(map,p); vec3 col = vC.rgb * ${additive ? '1.0' : 'mix(0.55, 1.15, t.r) * light'}; ${fog && !additive ? 'col = mix(col, fogColor, vFog);' : ''} gl_FragColor=vec4(col, vC.a*t.a${additive ? ' * (1.0 - vFog)' : ''}); if(gl_FragColor.a<0.01) discard; }`,
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
