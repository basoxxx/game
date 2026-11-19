// Kart Baso — 3D view: renderer, split-screen cameras, karts and their effects, item boxes and
// coins, projectiles, hazards and a pooled particle system (drift sparks, flames, dust, blasts).
import * as THREE from 'three';
import { buildScene } from './scene.js';
import { makeKart, makeRicciolo, makeBomb, makeOilDecal, makeShield, makeMagnet, makeBalloon, makeBumper, itemBoxMaterial, toon, disposeModelCaches, flameMat } from './models.js';
import { charById, PAINTS } from './data.js';

const TIER_COL = [null, '#4ad6ff', '#ffb02e', '#ff4dd2'];
const PCOL = ['#ff3b6b', '#3b82f6', '#2fd77f', '#ffc928'];

// ───────── particles
class Particles {
  constructor(n, additive) {
    this.n = n; this.i = 0;
    const g = this.g = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 3); this.col = new Float32Array(n * 3); this.sz = new Float32Array(n); this.al = new Float32Array(n);
    this.vel = new Float32Array(n * 3); this.life = new Float32Array(n); this.max = new Float32Array(n); this.grav = new Float32Array(n); this.drag = new Float32Array(n); this.s0 = new Float32Array(n); this.grow = new Float32Array(n);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(this.col, 3)); g.setAttribute('size', new THREE.BufferAttribute(this.sz, 1)); g.setAttribute('alpha', new THREE.BufferAttribute(this.al, 1));
    for (const a of Object.values(g.attributes)) a.setUsage(THREE.DynamicDrawUsage);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 400 } }, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: 'attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA; uniform float uScale; void main(){ vC=color; vA=alpha; vec4 mv=modelViewMatrix*vec4(position,1.0); vA*=smoothstep(1.2,4.5,-mv.z); gl_PointSize=min(size*uScale/max(0.1,-mv.z),220.0); gl_Position=projectionMatrix*mv; }',
      fragmentShader: 'varying vec3 vC; varying float vA; void main(){ vec2 d=gl_PointCoord-0.5; float r=dot(d,d)*4.0; if(r>1.0) discard; gl_FragColor=vec4(vC, vA*(1.0-r*r)); }',
    });
    this.pts = new THREE.Points(g, this.mat); this.pts.frustumCulled = false;
    this.c = new THREE.Color();
  }
  spawn(x, y, z, vx, vy, vz, life, size, color, grav = 0, drag = 0, grow = 0) {
    const i = this.i; this.i = (this.i + 1) % this.n;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = this.max[i] = life; this.s0[i] = size; this.grav[i] = grav; this.drag[i] = drag; this.grow[i] = grow;
    this.c.set(color); this.col[i * 3] = this.c.r; this.col[i * 3 + 1] = this.c.g; this.col[i * 3 + 2] = this.c.b;
  }
  update(dt) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { if (this.al[i]) { this.al[i] = 0; this.sz[i] = 0; } continue; }
      this.life[i] -= dt;
      const k = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= k; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k - this.grav[i] * dt; this.vel[i * 3 + 2] *= k;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const f = Math.max(0, this.life[i] / this.max[i]);
      this.al[i] = Math.min(1, f * 1.6); this.sz[i] = this.s0[i] * (1 + this.grow[i] * (1 - f));
    }
    for (const a of Object.values(this.g.attributes)) a.needsUpdate = true;
  }
}

export class KartView {
  constructor(canvas, sim, o) {
    this.sim = sim; this.o = o; this.canvas = canvas;
    const tier = this.tier = o.tier || 'high';
    const multi = (o.views || 1) > 1;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: tier !== 'low' && !multi, powerPreference: 'high-performance', preserveDrawingBuffer: !!o.preserve });
    r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.08;
    this.shadows = tier === 'high' && !multi;
    r.shadowMap.enabled = this.shadows; r.shadowMap.type = THREE.PCFSoftShadowMap;
    const built = this.built = buildScene(sim.world, { tier, shadows: this.shadows });
    this.scene = built.scene;
    this.fx = new Particles(tier === 'low' ? 700 : 1600, true);
    this.smoke = new Particles(tier === 'low' ? 400 : 900, false);
    this.scene.add(this.fx.pts, this.smoke.pts);
    this.buildDynamic();
    this.cams = [];
    this.shake = [0, 0, 0, 0];
    this.t = 0;
  }
  buildDynamic() {
    const S = this.sim, sc = this.scene;
    // karts
    this.K = S.karts.map((k, i) => {
      const ch = charById(k.char), paint = PAINTS.find((p) => p.id === k.paint && p.color);
      const m = makeKart(ch, { body: k.body, wheels: k.wheels, paint, num: i + 1 });
      sc.add(m);
      const blob = new THREE.Mesh(new THREE.CircleGeometry(1.5, 16).rotateX(-Math.PI / 2), blobMat()); sc.add(blob);
      const shield = makeShield(); shield.visible = false; m.add(shield); shield.position.y = 0.9;
      const mag = makeMagnet(); mag.visible = false; mag.position.set(0, 1.2, 1.9); m.add(mag);
      const tag = k.human >= 0 && (this.o.views || 1) > 1 ? tagSprite(`G${k.human + 1}`, PCOL[k.human]) : null; if (tag) { tag.position.y = 2.9; m.add(tag); }
      let balloons = null;
      if (S.battle) { balloons = []; for (let b = 0; b < 5; b++) { const bl = makeBalloon(k.human >= 0 ? PCOL[k.human] : ch.color); bl.position.set((b - 1) * 0.55, 2.6 + (b % 2) * 0.25, -1.1); m.add(bl); balloons.push(bl); } }
      return { m, blob, shield, mag, balloons, spin: 0, roll: 0, pitch: 0, wheelA: 0, sparkT: 0, crane: null, lastY: k.y };
    });
    // item boxes & coins (instanced)
    const F = S.F;
    this.boxes = new THREE.InstancedMesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), itemBoxMaterial(), Math.max(1, F.boxes.length)); this.boxes.count = F.boxes.length; sc.add(this.boxes);
    this.coins = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.55, 0.55, 0.14, 16).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#f5c542', metalness: 0.8, roughness: 0.25, emissive: '#5a3a00' }), Math.max(1, F.coins.length)); this.coins.count = F.coins.length; sc.add(this.coins);
    // bumpers & geysers
    this.bumpers = F.bumpers.map((b) => { const m = makeBumper(b.mesh); sc.add(m); return m; });
    this.geysers = F.geysers.map((g) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(g.r * 0.7, g.r, 9, 12, 1, true), new THREE.MeshBasicMaterial({ color: this.sim.world.theme.props === 'snow' ? '#bfe8ff' : '#ff7a2a', transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); m.position.set(g.x, g.y + 4.5, g.z); m.visible = false; sc.add(m); return m; });
    this.projM = []; this.oilM = [];
    this.ghost = null;
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(); this.v = new THREE.Vector3(); this.s = new THREE.Vector3();
  }
  setGhost(on) {
    if (!on) { if (this.ghost) this.ghost.visible = false; return; }
    if (!this.ghost) {
      const k = this.sim.karts[0];
      this.ghost = makeKart(charById(k.char), { body: k.body, wheels: k.wheels });
      const gm = new THREE.MeshBasicMaterial({ color: '#9ad8ff', transparent: true, opacity: 0.35, depthWrite: false });
      this.ghost.traverse((o) => { if (o.isMesh) { o.material = gm; o.castShadow = false; } });
      this.scene.add(this.ghost);
    }
    this.ghost.visible = true;
  }
  placeGhost(x, y, z, h) { if (!this.ghost) return; this.ghost.position.set(x, y, z); this.ghost.rotation.y = h; }

  // viewports: [{ x, y, w, h }] in CSS px, one per camera
  setViewports(vps, W, H, pr) {
    this.vps = vps; this.W = W; this.H = H;
    while (this.cams.length < vps.length) this.cams.push({ cam: new THREE.PerspectiveCamera(70, 1, 0.3, 1400), pos: null, look: new THREE.Vector3(), fov: 70, shake: 0 });
    vps.forEach((v, i) => { const c = this.cams[i].cam; c.aspect = v.w / v.h; c.updateProjectionMatrix(); });
    const scale = (H * pr) / (2 * Math.tan((70 * Math.PI) / 360)) / Math.sqrt(vps.length > 1 ? 2 : 1);
    this.fx.mat.uniforms.uScale.value = scale; this.smoke.mat.uniforms.uScale.value = scale;
  }

  // ───────── per frame
  update(dt, follow) {
    this.t += dt;
    const S = this.sim, t = this.t;
    for (const f of this.built.anim) f(t);
    // countdown lamps
    if (this.built.lamps) { const c = S.state === 'count' ? Math.ceil(S.countT) : 0; this.built.lamps.forEach((l, i) => l.material.color.set(S.state === 'count' ? (3 - i >= c && c <= 3 ? '#ff2a2a' : '#331111') : (S.t < 3 ? '#2aff6a' : '#113311'))); }
    // karts
    S.karts.forEach((k, i) => this.syncKart(k, this.K[i], dt));
    // boxes & coins
    const F = S.F, m4 = this.m4, q = this.q, e = this.e, v = this.v, s = this.s;
    F.boxes.forEach((b, i) => { const vis = b.t <= 0, pop = b.t > 1.3 ? (b.t - 1.3) / 0.3 : 0; const sc = vis ? 1 : pop * 1.4; e.set(t * 0.9 + i, t * 1.3 + i, 0.3); q.setFromEuler(e); m4.compose(v.set(b.x, b.y + Math.sin(t * 2 + i) * 0.15, b.z), q, s.setScalar(sc + (b.t > 0 && b.t < 0.3 ? 1 - b.t / 0.3 : 0))); this.boxes.setMatrixAt(i, m4); });
    this.boxes.instanceMatrix.needsUpdate = true;
    F.coins.forEach((c, i) => { e.set(0, t * 3 + i * 0.5, 0); q.setFromEuler(e); m4.compose(v.set(c.x, c.y + Math.sin(t * 3 + i) * 0.1, c.z), q, s.setScalar(c.t > 0 ? 0.0001 : 1)); this.coins.setMatrixAt(i, m4); });
    this.coins.instanceMatrix.needsUpdate = true;
    F.bumpers.forEach((b, i) => { const m = this.bumpers[i]; m.position.set(b.x, b.y, b.z); m.rotation.y = Math.atan2(b.tx, b.tz) + (b.vx * b.nx + b.vz * b.nz > 0 ? Math.PI / 2 : -Math.PI / 2); if (b.mesh === 'ball' || b.mesh === 'boulder' || b.mesh === 'snowball') { m.children[0].rotation.z += (b.vx * b.nx + b.vz * b.nz) * dt / 2; } if (b.mesh === 'press') m.children.forEach((c, j) => { if (j < 8) c.position.y = (j === 0 ? 1.2 : j === 1 ? 0.5 : 0.78) + Math.max(0, Math.sin(t * 3 + i)) * 0.5; }); if (b.mesh === 'cow') m.position.y = b.y + Math.abs(Math.sin(t * 6)) * 0.15; });
    F.geysers.forEach((g, i) => { const m = this.geysers[i]; m.visible = g.on; if (g.on) { m.scale.set(1 + Math.sin(t * 30) * 0.08, 1, 1 + Math.cos(t * 27) * 0.08); if (Math.random() < 0.6) this.smoke.spawn(g.x + (Math.random() - 0.5) * 2, g.y + 8, g.z + (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 3, 4, (Math.random() - 0.5) * 3, 1.2, 2.2, S.world.theme.props === 'snow' ? '#ffffff' : '#ffb070', -1, 0.6, 1.5); } else if (g.warn && Math.random() < 0.4) this.fx.spawn(g.x + (Math.random() - 0.5) * g.r, g.y + 0.3, g.z + (Math.random() - 0.5) * g.r, 0, 3 + Math.random() * 2, 0, 0.5, 0.5, S.world.theme.props === 'snow' ? '#bfe8ff' : '#ffb02e', 6); });
    this.syncProj(dt);
    this.fx.update(dt); this.smoke.update(dt);
    // sky follows
    const sky = this.scene.getObjectByName('sky'); const fk = follow?.[0] != null ? S.karts[follow[0]] : S.karts[0];
    if (sky && fk) sky.position.set(fk.x, 0, fk.z);
    const stars = this.scene.getObjectByName('stars'); if (stars && fk) stars.position.set(fk.x, 0, fk.z);
    // shadow follows the first followed kart
    if (this.shadows && fk) { const sun = this.built.sun; sun.position.set(fk.x + 60, fk.y + 110, fk.z + 40); sun.target.position.set(fk.x, fk.y, fk.z); }
  }
  syncKart(k, V, dt) {
    const m = V.m, u = m.userData, S = this.sim;
    m.visible = !k.out || (this.t % 0.3 < 0.15 && S.t - (k.outT || 0) < 1.5);
    if (k.out && S.t - (k.outT || 0) >= 1.5) { m.visible = false; V.blob.visible = false; return; }
    let y = k.y;
    if (k.respawnT > 0) { const f = k.respawnT / 1.2; y += f * f * 6; }
    m.position.set(k.x, y, k.z);
    // spin / tumble
    if (k.spinT > 0) V.spin += dt * 14 * (k.spinDir || 1); else V.spin *= Math.exp(-dt * 10);
    const tumble = k.tumbleT > 0 ? (1.3 - k.tumbleT) / 1.3 * Math.PI * 2 : 0;
    const driftA = k.drift ? k.drift * 0.42 : 0;
    V.da = (V.da || 0) + (driftA - (V.da || 0)) * Math.min(1, dt * 8);
    m.rotation.y = k.h - V.da + V.spin;
    const sp = Math.abs(k.fwd);
    const rollT = -k.steerVis * 0.06 * Math.min(1, sp / 20) + (k.drift ? -k.drift * 0.1 : 0);
    V.roll += (rollT - V.roll) * Math.min(1, dt * 8);
    const pitchT = k.air ? -Math.max(-0.35, Math.min(0.35, k.vy * 0.03)) : -Math.max(-0.25, Math.min(0.25, (k.vyG || 0) * 0.02));
    V.pitch += (pitchT - V.pitch) * Math.min(1, dt * 6);
    u.tilt.rotation.set(V.pitch, 0, V.roll + tumble, 'YXZ');
    if (k.tumbleT > 0) u.tilt.rotation.x = tumble;
    const sq = k.hopT > 0 ? 1 + Math.sin((0.35 - k.hopT) / 0.35 * Math.PI) * 0.08 : 1;
    u.tilt.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
    if (k.mokaT > 0) { const p = 1 + Math.sin(this.t * 20) * 0.05; u.tilt.scale.multiplyScalar(p * 1.12); }
    // wheels
    V.wheelA += (k.fwd * dt) / 0.35;
    for (const w of u.wheels) { w.w.rotation.x = V.wheelA; if (w.front) w.piv.rotation.y = -k.steerVis * 0.45; }
    if (u.sw) u.sw.rotation.z = k.steerVis * 0.9;
    if (u.head) u.head.rotation.y = -k.steerVis * 0.35 + (k.drift ? -k.drift * 0.2 : 0);
    // shields, magnet, flames
    V.shield.visible = k.shieldT > 0 || k.mokaT > 0;
    if (V.shield.visible) { V.shield.material.color.set(k.mokaT > 0 ? `hsl(${(this.t * 400) % 360},100%,60%)` : '#4ad6ff'); V.shield.scale.setScalar(1 + Math.sin(this.t * 8) * 0.04); V.shield.material.opacity = k.shieldT > 0 && k.shieldT < 2 && this.t % 0.2 < 0.1 ? 0.05 : 0.22; }
    V.mag.visible = k.magT > 0; if (V.mag.visible) V.mag.rotation.z = Math.sin(this.t * 25) * 0.15;
    const fl = u.flames; const boosting = k.boostT > 0 || k.mokaT > 0;
    fl.visible = boosting || (k.dTier > 0);
    if (fl.visible) { const s = boosting ? 1 + Math.random() * 0.5 : 0.5; fl.scale.set(boosting ? 1.3 : 0.8, boosting ? 1.3 : 0.8, s); fl.children.forEach((f) => { f.material = flameMat(); }); }
    if (V.balloons) V.balloons.forEach((b, i) => { b.visible = i < k.balloons; b.position.y = 2.6 + (i % 2) * 0.25 + Math.sin(this.t * 3 + i) * 0.08; });
    // blob shadow
    V.blob.visible = k.gy > -1e6 && !this.shadows || (k.air && k.gy > -1e6);
    if (V.blob.visible) { V.blob.position.set(k.x, (k.gy ?? k.y) + 0.07, k.z); const s = Math.max(0.3, 1 - (y - k.gy) * 0.08); V.blob.scale.setScalar(s); V.blob.material.opacity = 0.45 * s; }
    // particles
    const fx = Math.sin(k.h), fz = Math.cos(k.h), rx = -fz, rz = fx;
    const rearX = k.x - fx * 1.2, rearZ = k.z - fz * 1.2;
    if (k.drift && !k.air && sp > 6) {
      V.sparkT -= dt;
      if (V.sparkT <= 0) {
        V.sparkT = 0.016;
        const col = TIER_COL[k.dTier] || '#fff6d8';
        for (const sd of [-1, 1]) {
          const x = rearX + rx * sd * 0.8, z = rearZ + rz * sd * 0.8;
          if (k.dTier > 0) for (let n = 0; n < 2; n++) this.fx.spawn(x, k.y + 0.15, z, -fx * 3 + (Math.random() - 0.5) * 5 + rx * sd * 2, 2 + Math.random() * 3, -fz * 3 + (Math.random() - 0.5) * 5 + rz * sd * 2, 0.28, 0.22 + k.dTier * 0.06, col, 14, 2);
          if (Math.random() < 0.35) this.smoke.spawn(x, k.y + 0.2, z, (Math.random() - 0.5), 0.6, (Math.random() - 0.5), 0.5, 0.45, '#e8e8f0', -0.5, 1.5, 1.4);
        }
      }
    }
    if (boosting && Math.random() < 0.9) for (const sd of [-1, 1]) this.fx.spawn(rearX + rx * sd * 0.2 - fx * 0.4, k.y + 0.62, rearZ + rz * sd * 0.2 - fz * 0.4, -fx * 6 + k.vx * 0.6, 0.5, -fz * 6 + k.vz * 0.6, 0.18, 0.55, k.mokaT > 0 ? `hsl(${(this.t * 500) % 360},100%,60%)` : '#ff8a2a', 0, 3);
    if (!k.air && sp > 10 && k.surf !== 'road' && k.surf !== 'void' && Math.random() < 0.5) {
      const dc = { grass: '#8ad06a', sand: '#f3d99a', snow: '#ffffff', choco: '#7a4a2a', dirt: '#b8885a', lava: '#ff7a2a' }[k.surf] || '#cccccc';
      this.smoke.spawn(rearX + (Math.random() - 0.5) * 1.6, k.y + 0.3, rearZ + (Math.random() - 0.5) * 1.6, -fx * 2 + (Math.random() - 0.5) * 2, 1.2 + Math.random(), -fz * 2 + (Math.random() - 0.5) * 2, 0.6, 0.9, dc, 3, 1, 1.5);
    }
    if (k.spinT > 0 && Math.random() < 0.6) this.smoke.spawn(k.x, k.y + 0.4, k.z, (Math.random() - 0.5) * 2, 1, (Math.random() - 0.5) * 2, 0.8, 1.2, '#d8d8e0', -0.5, 1, 2);
    if ((k.tumbleT > 0 || k.spinT > 0) && Math.random() < 0.3) { const a = this.t * 8; this.fx.spawn(k.x + Math.cos(a) * 0.9, k.y + 2.3, k.z + Math.sin(a) * 0.9, 0, 0, 0, 0.25, 0.45, '#ffe14a'); }
    if (k.mokaT > 0 && Math.random() < 0.7) this.fx.spawn(k.x + (Math.random() - 0.5) * 2, k.y + Math.random() * 2, k.z + (Math.random() - 0.5) * 2, 0, 1, 0, 0.5, 0.4, `hsl(${(this.t * 400 + Math.random() * 120) % 360},100%,65%)`);
    // respawn crane hook
    if (k.respawnT > 0) {
      if (!V.crane) { V.crane = makeCrane(); this.scene.add(V.crane); }
      V.crane.visible = true; V.crane.position.set(k.x, y + 2.1, k.z);
    } else if (V.crane) V.crane.visible = false;
  }
  syncProj(dt) {
    const S = this.sim, P = S.proj;
    // match by type pools
    const want = { ricciolo: 0, bomba: 0, olio: 0 };
    for (const p of P) want[p.type]++;
    this.pool ||= { ricciolo: [], bomba: [], olio: [] };
    for (const type of Object.keys(want)) {
      const pool = this.pool[type];
      while (pool.length < want[type]) { const m = type === 'ricciolo' ? makeRicciolo() : type === 'bomba' ? makeBomb() : makeOilBlob(); this.scene.add(m); pool.push(m); }
      pool.forEach((m, i) => { m.visible = i < want[type]; });
    }
    const idx = { ricciolo: 0, bomba: 0, olio: 0 };
    for (const p of P) {
      const m = this.pool[p.type][idx[p.type]++];
      m.position.set(p.x, p.y + (p.type === 'ricciolo' ? 0.2 : 0), p.z);
      if (p.type === 'ricciolo') { m.rotation.y = p.h; m.children[0].rotation.z += dt * 20; if (Math.random() < 0.5) this.fx.spawn(p.x, p.y + 0.2, p.z, 0, 0.5, 0, 0.35, 0.4, '#ffe14a'); }
      if (p.type === 'bomba') { m.rotation.x += dt * 6; const sp = m.getObjectByName('spark'); if (sp) sp.scale.setScalar(0.8 + Math.random() * 0.8); if (p.life < 0.8) m.scale.setScalar(1 + Math.sin(this.t * 40) * 0.12); else m.scale.setScalar(1); }
    }
    // oils
    while (this.oilM.length < S.oils.length) { const d = makeOilDecal(); this.scene.add(d); this.oilM.push(d); }
    this.oilM.forEach((d, i) => { const o = S.oils[i]; d.visible = !!o; if (o) { d.position.set(o.x, o.y + 0.07, o.z); d.rotation.y = i * 1.7; d.scale.setScalar(Math.min(1, o.age * 4 + 0.3)); } });
  }

  // ───────── events → effects
  burst(x, y, z, n, col, sp = 6, life = 0.6, size = 0.5, grav = 8) { for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, e = Math.random() * 1.2, v = sp * (0.4 + Math.random() * 0.6); this.fx.spawn(x, y, z, Math.cos(a) * Math.cos(e) * v, Math.sin(e) * v + 2, Math.sin(a) * Math.cos(e) * v, life * (0.6 + Math.random() * 0.6), size, Array.isArray(col) ? col[i % col.length] : col, grav, 1); } }
  onEvent(e) {
    const S = this.sim, k = e.k != null ? S.karts[e.k] : null;
    switch (e.t) {
      case 'box': this.burst(e.x, e.y, e.z, 26, ['#ff4d6d', '#ffd23f', '#3ee6b0', '#49b6ff', '#b28bff'], 8, 0.6, 0.45); break;
      case 'coin': this.burst(k.x, k.y + 1, k.z, 8, '#ffd23f', 4, 0.4, 0.35); break;
      case 'explode': this.burst(e.x, e.y + 0.5, e.z, 44, ['#ffb02e', '#ff4a12', '#ffe14a', '#ffffff'], 14, 0.6, 0.7, 4); for (let i = 0; i < 12; i++) this.smoke.spawn(e.x + (Math.random() - 0.5) * 3, e.y + Math.random() * 2, e.z + (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 6, 3 + Math.random() * 3, (Math.random() - 0.5) * 6, 1, 1.3, '#9a94a0', -1, 1.2, 1.2); break;
      case 'pop': this.burst(e.x, e.y, e.z, 20, ['#ffd23f', '#ffffff'], 8, 0.5, 0.45); break;
      case 'hit': if (k) this.burst(k.x, k.y + 1, k.z, 22, ['#ffe14a', '#ffffff', '#ff4d6d'], 7, 0.55, 0.5); break;
      case 'shield': if (k) this.burst(k.x, k.y + 1, k.z, 30, '#4ad6ff', 9, 0.5, 0.45); break;
      case 'wall': this.burst(e.x, e.y, e.z, Math.round(6 + e.pow * 14), '#ffe9a0', 6, 0.35, 0.3, 14); break;
      case 'bump': this.burst(e.x, e.y, e.z, Math.round(5 + e.pow * 12), '#ffffff', 5, 0.3, 0.3, 10); break;
      case 'boost': if (k) this.burst(k.x - Math.sin(k.h) * 1.4, k.y + 0.6, k.z - Math.cos(k.h) * 1.4, e.tier ? 10 + e.tier * 8 : 14, e.tier ? TIER_COL[e.tier] : e.trick ? ['#ffd23f', '#ffffff'] : '#ff8a2a', 6, 0.4, 0.45); break;
      case 'land': if (k) for (let i = 0; i < 10; i++) this.smoke.spawn(k.x + (Math.random() - 0.5) * 2.4, k.y + 0.2, k.z + (Math.random() - 0.5) * 2.4, (Math.random() - 0.5) * 4, 0.8, (Math.random() - 0.5) * 4, 0.6, 1.1, '#e8e4dc', 0, 2, 1.6); break;
      case 'trick': if (k) this.burst(k.x, k.y + 1.2, k.z, 16, ['#ffd23f', '#ffffff', '#49b6ff'], 5, 0.5, 0.4, 2); break;
      case 'balloon': if (k) this.burst(k.x, k.y + 2.8, k.z, 26, k.human >= 0 ? PCOL[k.human] : charById(k.char).color, 9, 0.6, 0.5, 6); break;
      case 'respawn': if (k) this.burst(k.x, k.y + 1, k.z, 16, '#ffffff', 4, 0.5, 0.5, -2); break;
      case 'burn': if (k) this.burst(k.x, k.y + 0.5, k.z, 30, ['#ff4a12', '#ffb02e'], 7, 0.6, 0.7, -3); break;
      case 'oilhit': this.burst(e.x, e.y + 0.4, e.z, 14, '#6a4a9a', 5, 0.5, 0.4, 10); break;
      case 'splash': if (k) for (let i = 0; i < 3; i++) this.fx.spawn(k.x + (Math.random() - 0.5) * 2, k.y + 0.3, k.z + (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 3, 3 + Math.random() * 2, (Math.random() - 0.5) * 3, 0.5, 0.4, e.mesh === 'puddle' ? '#bfe8ff' : e.mesh === 'choco' ? '#7a4a2a' : '#8a6a4a', 12); break;
      case 'finish': if (k) this.burst(k.x, k.y + 2, k.z, 60, ['#ff4d6d', '#ffd23f', '#3ee6b0', '#49b6ff', '#b28bff', '#ffffff'], 10, 1.4, 0.45, 5); break;
      case 'steal': if (k) this.burst(k.x, k.y + 1.5, k.z, 18, '#ff4d6d', 6, 0.5, 0.4); break;
    }
  }

  // camera for a kart (chase) — i = viewport index
  updateCamera(i, k, dt, opt = {}) {
    const C = this.cams[i], cam = C.cam;
    const fx = Math.sin(k.h), fz = Math.cos(k.h);
    const sp = Math.max(0, k.fwd), boost = k.boostT > 0 || k.mokaT > 0 ? 1 : 0;
    const back = opt.rear ? -1 : 1;
    const dist = (6.1 + sp * 0.03 + boost * 0.6) * (C.portrait ? 1.15 : 1), up = (2.55 + (k.air ? 0.4 : 0)) * (C.portrait ? 1.25 : 1);
    const hOff = (k.drift ? k.drift * 0.25 : 0);
    const cx = Math.sin(k.h + hOff), cz = Math.cos(k.h + hOff);
    const tx = k.x - cx * dist * back, tz = k.z - cz * dist * back, ty = (k.respawnT > 0 ? k.y + 4 : Math.max(k.y, (k.gy > -1e6 ? k.gy : k.y))) + up;
    if (!C.pos || opt.snap) C.pos = new THREE.Vector3(tx, ty, tz);
    const a = 1 - Math.exp(-dt * (opt.snap ? 100 : 7.5)), ay = 1 - Math.exp(-dt * 4);
    C.pos.x += (tx - C.pos.x) * a; C.pos.z += (tz - C.pos.z) * a; C.pos.y += (ty - C.pos.y) * ay;
    // keep a minimum distance (sharp turns)
    const dx = C.pos.x - k.x, dz = C.pos.z - k.z, dd = Math.hypot(dx, dz);
    if (dd < 4) { C.pos.x = k.x + (dx / (dd || 1)) * 4; C.pos.z = k.z + (dz / (dd || 1)) * 4; }
    C.shake = Math.max(0, C.shake - dt * 2.5);
    const sh = C.shake * C.shake * 0.6;
    cam.position.set(C.pos.x + (Math.random() - 0.5) * sh, C.pos.y + (Math.random() - 0.5) * sh, C.pos.z + (Math.random() - 0.5) * sh);
    C.look.set(k.x + fx * 3.2 * back, k.y + 1.1, k.z + fz * 3.2 * back);
    cam.lookAt(C.look);
    const fovT = (C.fovBase ?? 68) + Math.min(1, sp / 30) * 6 + boost * 9;
    C.fov += (fovT - C.fov) * Math.min(1, dt * 4);
    if (Math.abs(cam.fov - C.fov) > 0.05) { cam.fov = C.fov; cam.updateProjectionMatrix(); }
  }
  // free camera (spectating / cover / title)
  lookFrom(i, px, py, pz, lx, ly, lz, fov = 55) { const cam = this.cams[i].cam; cam.position.set(px, py, pz); cam.lookAt(lx, ly, lz); if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); } }
  kick(i, amt) { if (this.cams[i]) this.cams[i].shake = Math.min(1.2, this.cams[i].shake + amt); }

  render() {
    const r = this.renderer, W = this.W, H = this.H;
    if (this.vps.length === 1) { r.setScissorTest(false); r.setViewport(0, 0, W, H); r.render(this.scene, this.cams[0].cam); return; }
    if (this.vps.length === 3) { r.setScissorTest(false); r.setViewport(0, 0, W, H); r.setClearColor(0x0a0b0e, 1); r.clear(); }
    r.setScissorTest(true);
    this.vps.forEach((v, i) => { const y = H - v.y - v.h; r.setViewport(v.x, y, v.w, v.h); r.setScissor(v.x, y, v.w, v.h); r.render(this.scene, this.cams[i].cam); });
    r.setScissorTest(false);
  }
  dispose() {
    this.scene.traverse((o) => { o.geometry?.dispose?.(); const m = o.material; (Array.isArray(m) ? m : m ? [m] : []).forEach((x) => { x.map?.dispose?.(); x.dispose?.(); }); });
    disposeModelCaches(); blobM?.dispose(); blobM = null;
    this.renderer.dispose(); this.renderer.forceContextLoss?.();
  }
}

let blobM = null;
function blobMat() {
  if (blobM) return blobM;
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,.8)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  blobM = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, opacity: 0.45, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 });
  return blobM;
}
function tagSprite(text, col) {
  const c = document.createElement('canvas'); c.width = 96; c.height = 48; const g = c.getContext('2d');
  g.fillStyle = col; g.beginPath(); g.roundRect(4, 4, 88, 36, 12); g.fill(); g.beginPath(); g.moveTo(40, 40); g.lineTo(56, 40); g.lineTo(48, 47); g.fill();
  g.fillStyle = '#fff'; g.font = 'italic 900 28px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 48, 23);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true })); s.scale.set(1.6, 0.8, 1); s.renderOrder = 10; return s;
}
function makeCrane() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 30), toon('#22252b')).translateY(15));
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.08, 6, 12, Math.PI * 1.4), toon('#ffd23f', { metal: true })); hook.rotation.z = Math.PI * 0.8; g.add(hook);
  const drone = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 1.6), toon('#ff3b6b')); drone.position.y = 3.2; g.add(drone);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.05, 10), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5 })); r.position.set(x * 0.95, 3.55, z * 0.95); g.add(r); }
  g.children[0].position.y = 3.2 + 0.3; g.children[0].scale.y = 0.0001; // no long cable: a little drone carries the kart
  return g;
}
function makeOilBlob() { const m = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), toon('#3a2f4a')); return m; }
