// Particles (dust, smoke, fire, sparks, debris chips) and tyre marks for the demolition mode.
import * as THREE from 'three';

function softTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); return t;
}
const TEX = softTex();

// One pooled particle system. kind: 'normal' | 'additive'
export class Particles {
  constructor(scene, max, { additive = false, gravity = 0, drag = 1, grow = 1, sizeScale = 1 } = {}) {
    this.max = max; this.head = 0; this.gravity = gravity; this.drag = drag; this.grow = grow;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3).fill(0); this.col = new Float32Array(max * 4); this.size = new Float32Array(max);
    this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.life0 = new Float32Array(max); this.alpha0 = new Float32Array(max); this.size0 = new Float32Array(max);
    for (let i = 0; i < max; i++) this.pos[i * 3 + 1] = -9999;
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(this.col, 4)); g.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: TEX }, scale: { value: 600 * sizeScale } },
      vertexShader: 'attribute float size; attribute vec4 color; varying vec4 vC; uniform float scale; void main(){ vC=color; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=size*scale/max(0.5,-mv.z); gl_Position=projectionMatrix*mv; }',
      fragmentShader: 'uniform sampler2D map; varying vec4 vC; void main(){ vec4 t=texture2D(map,gl_PointCoord); gl_FragColor=vec4(vC.rgb, vC.a*t.a); if(gl_FragColor.a<0.01) discard; }',
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, mat); this.points.frustumCulled = false; scene.add(this.points);
  }
  emit(x, y, z, vx, vy, vz, life, size, r, gC, b, a) {
    const i = this.head; this.head = (this.head + 1) % this.max;
    this.pos.set([x, y, z], i * 3); this.vel.set([vx, vy, vz], i * 3); this.life[i] = this.life0[i] = life; this.size[i] = this.size0[i] = size;
    this.col.set([r, gC, b, a], i * 4); this.alpha0[i] = a;
  }
  update(dt) {
    const dr = Math.max(0, 1 - this.drag * dt);
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -9999; this.col[i * 4 + 3] = 0; continue; }
      const k = i * 3; this.vel[k + 1] -= this.gravity * dt; this.vel[k] *= dr; this.vel[k + 1] *= dr; this.vel[k + 2] *= dr;
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
      const t = 1 - this.life[i] / this.life0[i];
      this.size[i] = this.size0[i] * (1 + t * this.grow);
      this.col[i * 4 + 3] = this.alpha0[i] * (t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85);
    }
    const g = this.points.geometry; g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true; g.attributes.size.needsUpdate = true;
  }
}

// Tyre marks: ring buffer of quads laid on the ground
export class SkidMarks {
  constructor(scene, max = 3000) {
    this.max = max; this.head = 0;
    const pos = new Float32Array(max * 4 * 3), alpha = new Float32Array(max * 4), idx = [];
    for (let i = 0; i < max; i++) { const b = i * 4; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1)); g.setIndex(idx);
    const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4,
      vertexShader: 'attribute float alpha; varying float vA; void main(){ vA=alpha; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: 'varying float vA; void main(){ gl_FragColor=vec4(0.06,0.05,0.04,vA*0.55); }' });
    this.mesh = new THREE.Mesh(g, mat); this.mesh.frustumCulled = false; scene.add(this.mesh); this.last = new Map();
  }
  // key identifies one wheel; p = ground point, side = unit lateral vector, strength 0..1
  add(key, p, side, strength) {
    const prev = this.last.get(key); this.last.set(key, { p: p.clone(), side: side.clone() });
    if (!prev || prev.p.distanceToSquared(p) > 9 || strength <= 0.05) return;
    const i = this.head; this.head = (this.head + 1) % this.max; const w = 0.14;
    const P = this.mesh.geometry.attributes.position, A = this.mesh.geometry.attributes.alpha;
    const q = [prev.p.clone().addScaledVector(prev.side, w), prev.p.clone().addScaledVector(prev.side, -w), p.clone().addScaledVector(side, w), p.clone().addScaledVector(side, -w)];
    q.forEach((v, k) => { P.setXYZ(i * 4 + k, v.x, v.y + 0.03, v.z); A.setX(i * 4 + k, Math.min(1, strength)); });
    P.needsUpdate = true; A.needsUpdate = true;
  }
  break(key) { this.last.delete(key); }
}
