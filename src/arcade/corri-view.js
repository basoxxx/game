// Corri Baso — three.js view: a chase camera behind Baso running down a neon avenue at night. Instanced
// buildings and street lamps recycle along the road; barriers, beams, crates and trams are pooled.
// World: x = lane offset, y = up, z = -distance (the runner runs towards -z).
import { THREE, Pool, Sparks, glowMat, litMat, glowTex } from './stage.js';
import { CorriSim, LANE_W, POWERS } from './corri.js';
import { skinOf, trailColor } from './meta.js';

export const createSim = (o) => new CorriSim(o);
export const STAGE = { bg: '#0a0420', fov: 62, bloom: [0.8, 0.5, 0.62] };
const fmt = (n) => Math.round(n).toLocaleString('it-IT');
const BLD = ['#ff4fd8', '#36e0ff', '#ffb21f', '#7d8cff', '#3dffb0'];

function runnerMesh(skinId) {
  const s = skinOf(skinId), g = new THREE.Group(), parts = {};
  const mat = litMat({ color: s.c[0], emissive: s.c[0], emissiveIntensity: 0.18, roughness: 0.5 });
  const dark = litMat({ color: '#20203a', roughness: 0.7 }), skinM = litMat({ color: '#ffd2a8', roughness: 0.6 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.55, 4, 10), mat); torso.position.y = 1.25; g.add(torso); parts.torso = torso;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.4, 14, 10), skinM); head.position.y = 2.05; g.add(head); parts.head = head;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.43, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), litMat({ color: s.c[1], roughness: 0.4 })); cap.position.y = 2.1; g.add(cap);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.07, 0.4), litMat({ color: s.c[1] })); visor.position.set(0, 2.12, 0.42); g.add(visor);
  // limbs pivot at the shoulders / hips
  const limb = (x, y, len, m) => { const p = new THREE.Group(); p.position.set(x, y, 0); const l = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, len, 3, 6), m); l.position.y = -len / 2 - 0.1; p.add(l); g.add(p); return p; };
  parts.armL = limb(-0.55, 1.6, 0.5, mat); parts.armR = limb(0.55, 1.6, 0.5, mat);
  parts.legL = limb(-0.22, 0.85, 0.55, dark); parts.legR = limb(0.22, 0.85, 0.55, dark);
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.3), litMat({ color: s.c[1] })); pack.position.set(0, 1.35, 0.42); g.add(pack);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('#ffffff', 'rgba(255,255,255,0)'), color: s.c[2], blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.35 })); glow.scale.set(2.4, 2.4, 1); glow.position.set(0, 1.4, 0.6); g.add(glow);
  const shield = new THREE.Mesh(new THREE.SphereGeometry(1.4, 18, 12), new THREE.MeshBasicMaterial({ color: '#36e0ff', transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false })); shield.position.y = 1.2; shield.visible = false; g.add(shield); parts.shield = shield;
  g.userData.parts = parts;
  g.rotation.y = Math.PI; // faces -z
  return g;
}

export class View {
  constructor(host) { this.h = host; this.st = host.stage; this.k = 0; this.camX = 0; }
  get sim() { return this.h.sim; }
  build() {
    const sc = this.st.scene, tier = this.h.o.tier;
    sc.fog = new THREE.Fog('#0a0420', 60, 190);
    sc.add(new THREE.HemisphereLight('#a8a0ff', '#201040', 1.3));
    const moon = new THREE.DirectionalLight('#ffe8ff', 1.5); moon.position.set(20, 40, 30); sc.add(moon);
    // road: a long plane with a scrolling lane shader
    this.roadMat = new THREE.ShaderMaterial({
      uniforms: { uZ: { value: 0 }, fogC: { value: new THREE.Color('#0a0420') } },
      vertexShader: 'varying vec2 vU; varying float vD; void main(){ vU = position.xy; vec4 mv = modelViewMatrix * vec4(position, 1.0); vD = -mv.z; gl_Position = projectionMatrix * mv; }',
      fragmentShader: `uniform float uZ; uniform vec3 fogC; varying vec2 vU; varying float vD;
        void main(){ float x = vU.x; float z = vU.y + uZ; vec3 c = vec3(0.06, 0.05, 0.12);
          float lane = abs(fract((x + ${(LANE_W * 1.5).toFixed(2)}) / ${LANE_W.toFixed(2)}) - 0.5); float dash = step(0.5, fract(z / 6.0));
          if (abs(x) < ${(LANE_W * 1.5).toFixed(2)}) c += vec3(0.85, 0.3, 1.0) * smoothstep(0.47, 0.5, lane) * dash * 0.9;
          float edge = smoothstep(0.08, 0.0, abs(abs(x) - ${(LANE_W * 1.5 + 0.2).toFixed(2)})); c += vec3(0.2, 0.9, 1.0) * edge * 1.6;
          c += vec3(0.03, 0.02, 0.06) * step(0.5, fract(z / 3.0 + x * 0.1));
          float side = step(${(LANE_W * 1.5 + 0.4).toFixed(2)}, abs(x)); c = mix(c, vec3(0.1, 0.08, 0.16) + vec3(0.05) * step(0.5, fract(z / 2.0)), side);
          float f = smoothstep(60.0, 190.0, vD); gl_FragColor = vec4(mix(c, fogC, f), 1.0); }`,
    });
    const road = new THREE.Mesh(new THREE.PlaneGeometry(30, 400), this.roadMat); road.rotation.x = -Math.PI / 2; road.position.z = -150; sc.add(road); this.road = road;
    // skyline and lamps, recycled along z
    this.blds = []; const bm = litMat({ roughness: 0.8, emissive: '#05030a' }), wm = glowMat();
    this.bPool = new Pool(sc, new THREE.BoxGeometry(1, 1, 1), bm, 80);
    this.wPool = new Pool(sc, new THREE.BoxGeometry(1, 1, 1), wm, 400);
    for (let i = 0; i < 40; i++) { const side = i % 2 ? 1 : -1; this.blds.push({ side, z: -(i >> 1) * 11, w: 6 + Math.random() * 6, h: 8 + Math.random() * 26, d: 7 + Math.random() * 4, off: 9 + Math.random() * 5, c: BLD[i % BLD.length], win: Math.random() }); }
    this.lampP = new Pool(sc, new THREE.CylinderGeometry(0.12, 0.16, 6, 6), litMat({ color: '#30304a' }), 30);
    this.lampG = new Pool(sc, new THREE.SphereGeometry(0.5, 8, 6), glowMat(), 30);
    // moon and distant glow
    const moonS = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('#fff6e0', 'rgba(255,120,220,0)'), blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); moonS.scale.set(60, 60, 1); moonS.position.set(30, 55, -260); sc.add(moonS); this.moon = moonS;
    // obstacles
    const om = litMat({ roughness: 0.4, metalness: 0.3, emissive: '#100818' });
    this.low = new Pool(sc, new THREE.BoxGeometry(LANE_W * 0.9, 1, 0.5), om, 40);
    this.lowStripe = new Pool(sc, new THREE.BoxGeometry(LANE_W * 0.92, 0.18, 0.55), glowMat(), 40);
    this.post = new Pool(sc, new THREE.BoxGeometry(0.22, 3.4, 0.22), om, 80);
    this.beam = new Pool(sc, new THREE.BoxGeometry(LANE_W * 0.95, 0.5, 0.4), glowMat(), 40);
    this.block = new Pool(sc, new THREE.BoxGeometry(LANE_W * 0.9, 2.6, 2.4), om, 40);
    this.blockG = new Pool(sc, new THREE.BoxGeometry(LANE_W * 0.94, 0.2, 2.45), glowMat(), 40);
    this.tram = new Pool(sc, new THREE.BoxGeometry(LANE_W * 0.92, 3, 1), litMat({ color: '#e8e8f8', roughness: 0.3, metalness: 0.5, emissive: '#101018' }), 20);
    this.tramW = new Pool(sc, new THREE.BoxGeometry(LANE_W * 0.96, 0.9, 1), glowMat(), 20);
    this.coins = new Pool(sc, new THREE.CylinderGeometry(0.42, 0.42, 0.12, 14), litMat({ color: '#ffd84d', emissive: '#ffb000', emissiveIntensity: 0.9, metalness: 0.6, roughness: 0.25 }), 300);
    this.pups = new Pool(sc, new THREE.IcosahedronGeometry(0.6, 1), glowMat(), 10);
    this.pupR = new Pool(sc, new THREE.TorusGeometry(0.95, 0.08, 6, 20), glowMat(), 10);
    this.runner = runnerMesh(this.h.o.skins[this.h.turn] || 'neon'); sc.add(this.runner);
    const sh = new THREE.Mesh(new THREE.CircleGeometry(0.7, 16), new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.45, depthWrite: false })); sh.rotation.x = -Math.PI / 2; sh.position.y = 0.02; sc.add(sh); this.shadow = sh;
    this.fx = new Sparks(sc, tier === 'low' ? 600 : 1400, { gravity: 9 });
  }
  reset() { this.st.scene.remove(this.runner); this.runner = runnerMesh(this.h.o.skins[this.h.turn] || 'neon'); this.st.scene.add(this.runner); }
  frame() { return null; }
  resized(w, h) { this.port = h > w; this.st.camera.fov = this.port ? 74 : 60; this.st.camera.updateProjectionMatrix(); this.fx.setScale(this.st); }
  touchHTML() { return ''; }
  control(I) {
    const sim = this.sim;
    for (const a of ['left', 'right', 'up', 'down']) if (I.hit(0, a)) sim.act(a); // (not co-op: player 0 reads every key)
    if (I.hit(0, 'a')) sim.act('up');
    if (I.hit(0, 'b')) sim.act('down');
    for (const s of I.swipes) sim.act(s);
    if (I.taps) sim.act('up');
    if (I.mouse.click) { const R = this.st.canvas.getBoundingClientRect(), u = (I.mouse.x - R.left) / R.width; sim.act(u < 0.33 ? 'left' : u > 0.66 ? 'right' : 'up'); }
  }
  onEvent(e) {
    const h = this.h, fx = this.fx, sim = this.sim, z = -sim.dist;
    switch (e.k) {
      case 'coin': fx.burst(e.lane * LANE_W, e.y, -e.z, '#ffd84d', 5, 5, 0.35, 0.35, 3); h.snd.play('coin', 0.05); break;
      case 'jump': h.snd.play('swat', 0.1); break;
      case 'slide': h.snd.play('whoosh', 0.1); break;
      case 'land': fx.burst(sim.p.x, 0.1, z, '#c8b8ff', 6, 4, 0.3, 0.3, 2); break;
      case 'lane': h.snd.play('tick', 0.03); break;
      case 'stumble': this.st.kick(0.4); h.snd.play('hurt'); h.banner('Attento!', 'Un altro urto e cadi', 1, 'bad'); break;
      case 'bump': h.snd.play('toggle', 0.1); break;
      case 'power': fx.burst(sim.p.x, 1.4, z, POWERS[e.type].color, 30, 7, 0.4, 0.6, 3); h.pop(sim.p.x, 2.6, z, POWERS[e.type].name, 'item'); h.snd.play('power'); break;
      case 'shieldbreak': fx.burst(sim.p.x, 1.2, z, '#36e0ff', 40, 8, 0.4, 0.6, 2); this.st.kick(0.6); h.snd.play('slam'); break;
      case 'crash': fx.burst(sim.p.x, 1.2, z, '#ffffff', 40, 9, 0.5, 0.8, 4); this.st.kick(1.2); h.snd.play('crash'); break;
    }
  }
  sync(dt) {
    const sim = this.sim, p = sim.p, d = sim.dist, t = this.st.clock, cam = this.st.camera;
    this.roadMat.uniforms.uZ.value = -d; this.road.position.z = -d - 150;
    // camera: behind and above, easing towards the runner's lane; wider and higher in portrait
    this.camX += (p.x * 0.7 - this.camX) * Math.min(1, dt * 6);
    const back = this.port ? 8.5 : 7, up = this.port ? 5.6 : 4.4, sk = this.st.shake; this.st.shake = Math.max(0, sk - dt * 2.5);
    cam.position.set(this.camX + Math.sin(t * 40) * sk * 0.15, up + p.y * 0.35 + Math.cos(t * 47) * sk * 0.15, -d + back);
    cam.lookAt(this.camX * 0.8, 1.6 + p.y * 0.25, -d - 14);
    this.moon.position.z = -d - 260;
    // runner pose
    const g = this.runner, P = g.userData.parts, sp = sim.v, ph = p.run * 0.9;
    g.position.set(p.x, p.y, -d);
    const sl = p.slide > 0 && !p.air, air = p.air;
    const sw = air ? 0.6 : Math.sin(ph) * Math.min(1.1, 0.5 + sp * 0.02);
    P.legL.rotation.x = sl ? -1.3 : air ? 0.7 : sw; P.legR.rotation.x = sl ? -1.3 : air ? -0.4 : -sw;
    P.armL.rotation.x = sl ? -0.4 : air ? -2.4 : -sw; P.armR.rotation.x = sl ? -0.4 : air ? -2.4 : sw;
    g.rotation.x = sl ? -1.05 : air ? 0.12 : 0.18;
    g.position.y = p.y + (sl ? 0.25 : Math.abs(Math.sin(ph)) * 0.12);
    g.rotation.z = (p.lane * LANE_W - p.x) * -0.12;
    g.visible = !(p.inv > 0 && Math.floor(t * 16) % 2 === 0);
    P.shield.visible = p.shield;
    this.shadow.position.set(p.x, 0.02, -d); this.shadow.scale.setScalar(1 / (1 + p.y * 0.3));
    if (!sim.over && Math.random() < 0.7) this.fx.emit(p.x + (Math.random() - 0.5) * 0.4, 0.3 + p.y, -d + 0.6, 0, 0.5, 3, trailColor(this.h.o.trail, this.h.o.skins[this.h.turn] || 'neon', this.k++), 0.22, 0.4);
    // city
    this.bPool.begin(); this.wPool.begin(); this.lampP.begin(); this.lampG.begin();
    for (const b of this.blds) {
      while (b.z > -d + 20) b.z -= 220;
      const x = b.side * (b.off + b.w / 2);
      this.bPool.add(x, b.h / 2, b.z, b.w, b.h, b.d, 0, '#191632');
      const rows = Math.floor(b.h / 3);
      for (let r = 0; r < rows; r++) if ((r * 7 + Math.floor(b.win * 10)) % 3) this.wPool.add(x - b.side * (b.w / 2 + 0.02), 2 + r * 3, b.z, 0.05, 0.8, b.d * 0.45, 0, b.c, 0.75);
      this.wPool.add(x - b.side * (b.w / 2 + 0.05), b.h - 0.4, b.z, 0.1, 0.25, b.d, 0, b.c, 1.6);
    }
    for (let i = 0; i < 15; i++) { const z = -d - ((i * 16 - (d % 16) + 320) % 240) + 20; for (const s of [-1, 1]) { this.lampP.add(s * 5.3, 3, z, 1, 1, 1, 0, '#30304a'); this.lampG.add(s * 5.0, 6, z, 1, 1, 1, 0, s > 0 ? '#ff4fd8' : '#36e0ff', 2.5); } }
    this.bPool.end(); this.wPool.end(); this.lampP.end(); this.lampG.end();
    // obstacles in view
    for (const P2 of [this.low, this.lowStripe, this.post, this.beam, this.block, this.blockG, this.tram, this.tramW]) P2.begin();
    for (const o of sim.obst) {
      if (o.z1 < d - 10 || o.z0 > d + 170) continue;
      const x = o.lane * LANE_W, zc = -(o.z0 + o.z1) / 2;
      if (o.type === 'low') { this.low.add(x, 0.5, zc, 1, 1, 1, 0, '#ffcc1a'); this.lowStripe.add(x, 0.75, zc, 1, 1, 1, 0, '#ff3b3b', 2); this.lowStripe.add(x, 0.3, zc, 1, 1, 1, 0, '#ff3b3b', 2); }
      else if (o.type === 'high') { for (const s of [-1, 1]) this.post.add(x + s * LANE_W * 0.45, 1.7, zc, 1, 1, 1, 0, '#40405a'); this.beam.add(x, 1.9, zc, 1, 1, 1, 0, '#ff4fd8', 2.2 + Math.sin(t * 8) * 0.4); this.beam.add(x, 2.9, zc, 1, 0.6, 1, 0, '#ff4fd8', 1.6); }
      else if (o.type === 'block') { this.block.add(x, 1.3, zc, 1, 1, 1, 0, '#6a4cff'); this.blockG.add(x, 2.62, zc, 1, 1, 1, 0, '#36e0ff', 2); this.blockG.add(x, 1.0, zc, 1, 1, 1, 0, '#36e0ff', 1.2); }
      else { const len = o.z1 - o.z0; this.tram.add(x, 1.6, zc, 1, 1, len, 0, '#dcdcf0'); this.tramW.add(x, 2.1, zc, 1, 1, len * 0.96, 0, '#ffe14d', 1.6); this.tramW.add(x, 0.4, zc, 1, 0.2, len, 0, '#ff3b6b', 2); }
    }
    for (const P2 of [this.low, this.lowStripe, this.post, this.beam, this.block, this.blockG, this.tram, this.tramW]) P2.end();
    // coins (pulled by the magnet), power-ups
    this.coins.begin();
    const mag = p.magnet > 0;
    for (const c of sim.coinsList) {
      if (c.got || c.z < d - 2 || c.z > d + 120) continue;
      let x = c.lane * LANE_W, y = c.y, z = -c.z;
      if (mag && c.z - d < 12) { const k = 1 - (c.z - d) / 12; x += (p.x - x) * k * k; y += (p.y + 1 - y) * k * k; }
      this.coins.add(x, y, z, 1, 1, 1, Math.PI / 2, 0xffffff, 1, 0, t * 4 + c.z);
    }
    this.coins.end();
    this.pups.begin(); this.pupR.begin();
    for (const u of sim.pups) { if (u.got || u.z < d - 2 || u.z > d + 120) continue; const c = POWERS[u.type].color; this.pups.add(u.lane * LANE_W, 1.2 + Math.sin(t * 3) * 0.2, -u.z, 1, 1, 1, t, c, 2); this.pupR.add(u.lane * LANE_W, 1.2, -u.z, 1, 1, 1, t * 2, c, 2.5, 0, t * 3); }
    this.pups.end(); this.pupR.end();
    this.fx.update(dt);
  }
  render() { this.st.render(); }
  hud() {
    const sim = this.sim, best = this.h.o.best || 0, p = sim.p;
    const pw = [p.magnet > 0 ? `Magnete ${Math.ceil(p.magnet)}` : '', p.dbl > 0 ? `x2 ${Math.ceil(p.dbl)}` : '', p.shield ? 'Scudo' : ''].filter(Boolean).map((x) => `<span class="ar-tag">${x}</span>`).join('');
    return { l1: fmt(sim.score), l2: `<span class="ar-mult">x${sim.mult}</span> ${pw}`, c: `<b>${fmt(sim.dist)} m</b><small>${Math.round(sim.v * 3.6)} km/h</small>`, r1: `<span class="ar-coin">● ${sim.coins}</span>`, r2: `Record ${fmt(Math.max(best, sim.score))}` };
  }
}
