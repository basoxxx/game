// Incident effects for the 3D race view (replays / highlights): flying carbon debris, tyre smoke,
// gravel / snow dust and a waving yellow-flag marshal post. Lives next to Race3D and only uses its
// public scene, so the renderer itself stays untouched. Everything is pooled and bounded.
import * as THREE from 'three';

let smokeTex = null;
function smokeTexture() {
  if (smokeTex) return smokeTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  smokeTex = new THREE.CanvasTexture(c); smokeTex.colorSpace = THREE.SRGBColorSpace;
  return smokeTex;
}

const MAX_DEBRIS = 48, MAX_PUFF = 70;
export class IncidentFx {
  constructor(r3d) {
    this.r = r3d;
    this.group = new THREE.Group(); this.group.name = 'incident-fx';
    r3d.scene.add(this.group);
    this.debrisGeo = [new THREE.BoxGeometry(0.42, 0.04, 0.22), new THREE.BoxGeometry(0.22, 0.05, 0.16), new THREE.TetrahedronGeometry(0.16)];
    this.carbon = new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.35, metalness: 0.3 });
    this.debris = []; this.puffs = [];
    this.flags = [];
  }
  destroy() {
    this.clear();
    this.r.scene.remove(this.group);
    this.debrisGeo.forEach((g) => g.dispose()); this.carbon.dispose();
    for (const p of this._puffPool || []) p.material.dispose();
  }
  clear() {
    for (const d of this.debris) this.group.remove(d.m);
    for (const p of this.puffs) { p.s.visible = false; }
    for (const f of this.flags) this.group.remove(f.g);
    this.debris = []; this.puffs = []; this.flags = [];
  }
  // impact: carbon shards (some in the car colour) flying out of the car's direction of travel
  burst(pos, { color = '#e10600', n = 18, speed = 14, dir = null, dust = null } = {}) {
    const livery = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.4, metalness: 0.2 });
    for (let i = 0; i < n; i++) {
      if (this.debris.length >= MAX_DEBRIS) { const o = this.debris.shift(); this.group.remove(o.m); }
      const m = new THREE.Mesh(this.debrisGeo[i % 3], i % 3 === 0 ? livery : this.carbon);
      m.castShadow = false; m.position.set(pos.x, pos.y + 0.5, pos.z);
      const a = Math.random() * Math.PI * 2, up = 2 + Math.random() * 7, sp = speed * (0.3 + Math.random() * 0.8);
      const v = new THREE.Vector3(Math.cos(a) * sp, up, Math.sin(a) * sp);
      if (dir) v.addScaledVector(dir, speed * 0.6);
      this.group.add(m);
      this.debris.push({ m, v, w: new THREE.Vector3(Math.random() * 14 - 7, Math.random() * 14 - 7, Math.random() * 14 - 7), life: 8 + Math.random() * 6, rest: false });
    }
    this.smoke(pos, { n: 10, col: dust || '#d8d8d8', size: 3.2, rise: 1.4 });
  }
  // tyre smoke (white) or dust (surface colour) around a point
  smoke(pos, { n = 3, col = '#e6e6e6', size = 2.2, rise = 0.8, op = 0.55 } = {}) {
    const pool = (this._puffPool ||= []);
    for (let i = 0; i < n; i++) {
      let s = pool.find((x) => !x.visible);
      if (!s) {
        if (pool.length >= MAX_PUFF) { s = this.puffs.shift()?.s; if (!s) return; }
        else { s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTexture(), transparent: true, depthWrite: false, opacity: 0 })); pool.push(s); this.group.add(s); }
      }
      s.material.color.set(col); s.visible = true;
      s.position.set(pos.x + (Math.random() - 0.5) * 1.6, pos.y + 0.4 + Math.random() * 0.5, pos.z + (Math.random() - 0.5) * 1.6);
      const life = 2.2 + Math.random() * 2;
      this.puffs = this.puffs.filter((p) => p.s !== s);
      this.puffs.push({ s, age: 0, life, size: size * (0.7 + Math.random() * 0.6), rise: rise * (0.6 + Math.random() * 0.8), op, drift: new THREE.Vector3((Math.random() - 0.5) * 1.2, 0, (Math.random() - 0.5) * 1.2) });
    }
  }
  // marshal post with a waving yellow flag a little way ahead of the incident
  yellowFlag(pos, h = 0) {
    if (this.flags.length > 3) { const o = this.flags.shift(); this.group.remove(o.g); }
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.4, 6), new THREE.MeshStandardMaterial({ color: 0xdddddd }));
    pole.position.y = 1.2; g.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.6, 6, 1), new THREE.MeshStandardMaterial({ color: 0xffd400, side: THREE.DoubleSide, emissive: 0x332a00 }));
    flag.position.set(0.48, 2.05, 0); g.add(flag);
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.9, 3, 6), new THREE.MeshStandardMaterial({ color: 0xff7a00 }));
    body.position.set(-0.25, 0.75, 0); g.add(body);
    g.position.set(pos.x, pos.y || 0, pos.z); g.rotation.y = -h;
    this.group.add(g);
    this.flags.push({ g, flag, t: Math.random() * 3 });
  }
  update(dt) {
    if (!(dt > 0)) return;
    for (const d of this.debris) {
      d.life -= dt;
      if (d.rest) continue;
      d.v.y -= 22 * dt;
      d.m.position.addScaledVector(d.v, dt);
      d.m.rotation.x += d.w.x * dt; d.m.rotation.y += d.w.y * dt; d.m.rotation.z += d.w.z * dt;
      const floor = (d.y0 ??= d.m.position.y - 0.5) + 0.03;
      if (d.m.position.y < floor) { d.m.position.y = floor; d.v.y *= -0.32; d.v.x *= 0.55; d.v.z *= 0.55; d.w.multiplyScalar(0.5); if (Math.abs(d.v.y) < 0.6 && d.v.lengthSq() < 0.5) d.rest = true; }
    }
    for (const p of this.puffs) {
      p.age += dt; const k = p.age / p.life;
      if (k >= 1) { p.s.visible = false; continue; }
      p.s.position.y += p.rise * dt; p.s.position.addScaledVector(p.drift, dt);
      const sz = p.size * (0.6 + k * 1.8); p.s.scale.set(sz, sz, sz);
      p.s.material.opacity = p.op * Math.sin(Math.PI * Math.min(1, k * 1.3)) * (1 - k * 0.5);
    }
    this.puffs = this.puffs.filter((p) => p.s.visible);
    for (const f of this.flags) { f.t += dt; f.flag.rotation.z = Math.sin(f.t * 7) * 0.5; f.flag.rotation.y = Math.sin(f.t * 5.3) * 0.35; }
  }
}
