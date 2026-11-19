// Labirinto Goloso — three.js view: the pastry-shop maze seen from a tilted top camera. Walls are
// instanced blocks with neon strips on every edge facing a corridor; almonds and chili peppers are
// instanced; Gnam and the wasps are small procedural models.
import { THREE, Pool, Sparks, glowMat, litMat } from './stage.js';
import { LabirintoSim, MW, MH, ENEMIES, BONUSES } from './labirinto.js';
import { skinOf, trailColor } from './meta.js';

export const createSim = (o) => new LabirintoSim(o);
export const STAGE = { bg: '#0b0614', fov: 34, bloom: [0.55, 0.4, 0.78] };
const T = 5, fmt = (n) => Math.round(n).toLocaleString('it-IT');
const X = (x) => x * T + T / 2, Y = (y) => (MH - 1 - y) * T + T / 2;
const PAL = [['#ff5fa2', '#36e0ff'], ['#36e0ff', '#ffd23f'], ['#a65bff', '#3dffb0'], ['#ff8a3d', '#ff5fa2'], ['#3dffb0', '#a65bff']];
const DOTC = ['#ffd1e8', '#fff3c4', '#c8f7ff', '#e2d4ff', '#d4ffe2'];
const BONUSC = { bigne: '#f5d29a', cannolo: '#ffb35a', cassata: '#7dff9a', gelato: '#ff9ad5', torta: '#ffffff', 'babà': '#d08a3a', panettone: '#ffd25a', tiramisu: '#a0703a' };

function gnamMesh(skinId) {
  const s = skinOf(skinId), g = new THREE.Group(), parts = {};
  const bodyM = litMat({ color: s.c[0], emissive: s.c[0], emissiveIntensity: 0.25, roughness: 0.4 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(2.1, 20, 14), bodyM); g.add(body); parts.body = body;
  const belly = new THREE.Mesh(new THREE.SphereGeometry(1.5, 14, 10), litMat({ color: s.c[1], roughness: 0.5 })); belly.position.set(0, -0.6, 1.3); belly.scale.set(1, 0.8, 0.5); g.add(belly);
  for (const k of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.62, 12, 10), litMat({ color: '#ffffff', roughness: 0.2 })); eye.position.set(k * 0.8, 0.8, 1.6); g.add(eye);
    const pu = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), new THREE.MeshBasicMaterial({ color: '#10061a' })); pu.position.set(k * 0.85, 0.8, 2.1); g.add(pu);
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.38, 1.2, 8), litMat({ color: '#fff0c8' })); horn.position.set(k * 1.1, 2, 0); horn.rotation.z = -k * 0.4; g.add(horn);
  }
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.18, 6, 14, Math.PI), new THREE.MeshBasicMaterial({ color: '#40081a' })); mouth.position.set(0, -0.2, 2.0); mouth.rotation.z = Math.PI; g.add(mouth); parts.mouth = mouth;
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.6, 6), bodyM); tail.position.set(0, -0.8, -2.0); tail.rotation.x = -1.9; g.add(tail);
  g.userData.parts = parts; g.userData.bodyM = bodyM; g.userData.base = new THREE.Color(s.c[0]);
  return g;
}
function waspMesh(color) {
  const g = new THREE.Group(), parts = {};
  const bm = litMat({ color, emissive: color, emissiveIntensity: 0.3, roughness: 0.35 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(1.9, 16, 12), bm); body.scale.set(1, 1.15, 0.95); g.add(body);
  const stripeM = new THREE.MeshStandardMaterial({ color: '#16101e', roughness: 0.6 });
  for (const y of [-0.5, -1.3]) { const s = new THREE.Mesh(new THREE.TorusGeometry(1.75 - Math.abs(y) * 0.35, 0.28, 6, 18), stripeM); s.position.y = y; s.rotation.x = Math.PI / 2; g.add(s); }
  const sting = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.1, 6), stripeM); sting.position.y = -2.5; sting.rotation.z = Math.PI; g.add(sting);
  const eyes = new THREE.Group();
  for (const k of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffffff' })); e.position.set(k * 0.75, 0.9, 1.45); eyes.add(e); const p = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), new THREE.MeshBasicMaterial({ color: '#10061a' })); p.position.set(k * 0.8, 0.9, 1.95); eyes.add(p); parts['p' + k] = p; }
  g.add(eyes);
  const wm = new THREE.MeshBasicMaterial({ color: '#e8f6ff', transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
  parts.wings = [-1, 1].map((k) => { const w = new THREE.Mesh(new THREE.CircleGeometry(1.4, 12), wm); w.scale.set(1, 0.55, 1); w.position.set(k * 1.6, 0.6, 0.3); g.add(w); return w; });
  g.userData = { parts, bm, body, eyes, stripeM, base: new THREE.Color(color) };
  return g;
}

export class View {
  constructor(host) { this.h = host; this.st = host.stage; this.k = 0; this.lvl = -1; }
  get sim() { return this.h.sim; }
  build() {
    const sc = this.st.scene, tier = this.h.o.tier;
    sc.add(new THREE.HemisphereLight('#ffe8f4', '#2a1040', 1.25));
    const sun = new THREE.DirectionalLight('#ffffff', 1.7); sun.position.set(-40, -50, 120); sc.add(sun);
    this.floorMat = new THREE.ShaderMaterial({
      uniforms: { uA: { value: new THREE.Color('#2a0f2e') }, uB: { value: new THREE.Color('#1c0a24') } },
      vertexShader: 'varying vec2 vU; void main(){ vU = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 uA; uniform vec3 uB; varying vec2 vU; void main(){ vec2 q = floor(vU / ${T.toFixed(1)}); float c = mod(q.x + q.y, 2.0); vec3 col = mix(uA, uB, c); float d = length(vU - vec2(${(MW * T / 2).toFixed(1)}, ${(MH * T / 2).toFixed(1)})) / 90.0; gl_FragColor = vec4(col * (1.15 - d * 0.6), 1.0); }`,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(320, 320), this.floorMat); floor.position.set(MW * T / 2, MH * T / 2, -0.1); sc.add(floor);
    this.wall = new Pool(sc, new THREE.BoxGeometry(T, T, 3.4), litMat({ roughness: 0.5, emissive: '#0a0616' }), MW * MH);
    this.strip = new Pool(sc, new THREE.BoxGeometry(1, 1, 1), glowMat(), MW * MH * 2);
    this.door = new Pool(sc, new THREE.BoxGeometry(T, 0.8, 1), glowMat(), 2);
    this.dots = new Pool(sc, new THREE.IcosahedronGeometry(0.62, 0), litMat({ roughness: 0.3, emissive: '#3a2a3a' }), MW * MH);
    this.chili = new Pool(sc, new THREE.ConeGeometry(1.1, 3.4, 8), glowMat(), 4);
    this.chiliTop = new Pool(sc, new THREE.CylinderGeometry(0.4, 0.5, 0.8, 6), litMat({ color: '#2fb04a' }), 4);
    this.bonus = new Pool(sc, new THREE.CylinderGeometry(1.6, 2, 1.6, 16), litMat({ roughness: 0.4 }), 1);
    this.bonusTop = new Pool(sc, new THREE.SphereGeometry(1.1, 12, 8), litMat({ color: '#ff3b5c', emissive: '#801020' }), 1);
    this.hero = gnamMesh(this.h.o.skins[this.h.turn] || 'neon'); sc.add(this.hero);
    this.wasps = ENEMIES.map((d) => { const m = waspMesh(d.color); m.visible = false; sc.add(m); return m; });
    this.fx = new Sparks(sc, tier === 'low' ? 500 : 1200);
  }
  reset() { this.st.scene.remove(this.hero); this.hero = gnamMesh(this.h.o.skins[this.h.turn] || 'neon'); this.st.scene.add(this.hero); this.lvl = -1; }
  frame(w, h) { const port = h > w; return { w: MW * T, h: MH * T, tilt: 0.24, pad: 1, padTop: port ? 14 : 7, padBottom: port ? (this.h.o.dpad && this.h.o.touchUI ? 40 : 6) : 0, padSide: !port && this.h.o.dpad && this.h.o.touchUI ? 30 : 0 }; }
  resized() { this.fx.setScale(this.st); }
  touchHTML() { return this.h.o.dpad ? '<div class="ar-dpad">' + [['up', '▲'], ['left', '◀'], ['right', '▶'], ['down', '▼']].map(([d, s]) => `<button data-vb="${d}" class="d-${d}" aria-label="${d}">${s}</button>`).join('') + '</div>' : ''; }
  control(I) {
    const sim = this.sim, D = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    for (const a in D) if (I.hit(0, a) || (I.held(0, a) && !sim.input.want)) sim.input.want = D[a];
    // analog stick: the dominant axis
    const [ax, ay] = I.axis(0); if (Math.hypot(ax, ay) > 0.55) sim.input.want = Math.abs(ax) > Math.abs(ay) ? [Math.sign(ax), 0] : [0, -Math.sign(ay)];
    for (const s of I.swipes) sim.input.want = D[s];
  }
  buildMaze() {
    const sim = this.sim, g = sim.maze, pal = PAL[(sim.level - 1) % PAL.length];
    const open = (x, y) => x < 0 || x >= MW || y < 0 || y >= MH ? false : g[y * MW + x] !== 1;
    this.wall.begin(); this.strip.begin(); this.door.begin();
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      const v = g[y * MW + x];
      if (v === 3) { this.door.add(X(x), Y(y), 1, 1, 1, 1, 0, '#ffd1f0', 2); continue; }
      if (v !== 1) continue;
      this.wall.add(X(x), Y(y), 1.7, 0.96, 0.96, 1, 0, pal[1] === '#ffd23f' ? '#2a1c3a' : '#221640');
      if (open(x, y - 1)) this.strip.add(X(x), Y(y) + T / 2 - 0.25, 3.45, T, 0.45, 0.2, 0, pal[0], 1.3);
      if (open(x, y + 1)) this.strip.add(X(x), Y(y) - T / 2 + 0.25, 3.45, T, 0.45, 0.2, 0, pal[0], 1.3);
      if (open(x - 1, y)) this.strip.add(X(x) - T / 2 + 0.25, Y(y), 3.45, 0.45, T, 0.2, 0, pal[0], 1.3);
      if (open(x + 1, y)) this.strip.add(X(x) + T / 2 - 0.25, Y(y), 3.45, 0.45, T, 0.2, 0, pal[0], 1.3);
    }
    this.wall.end(); this.strip.end(); this.door.end();
    this.lvl = sim.level; this.mazeRef = g;
  }
  onEvent(e) {
    const h = this.h, fx = this.fx, sim = this.sim;
    switch (e.k) {
      case 'dot': if (this.k++ % 2 === 0) h.snd.play('pop', 0.06); break;
      case 'chili': fx.burst(X(e.x), Y(e.y), 2, '#ff3b1f', 40, 30, 1.6, 0.7); h.snd.play('power'); h.banner('Peperoncino!', 'Gnam sputa fuoco: brucia le vespe', 1.4, 'warn'); break;
      case 'toast': fx.burst(X(e.x), Y(e.y), 3, '#ffb21f', 40, 34, 1.8, 0.7); h.pop(X(e.x), Y(e.y), 4, `+${e.pts}`, 'big'); h.snd.play('gulp', 0, 2); this.st.kick(0.4); break;
      case 'bonusup': h.snd.play('ready'); break;
      case 'bonus': { const b = BONUSES.find((q) => q.id === e.id); fx.burst(X(e.x), Y(e.y), 3, '#ffe14d', 30, 30, 1.4, 0.6); h.pop(X(e.x), Y(e.y), 4, `${b?.name || ''} +${e.pts}`, 'item'); h.snd.play('coin'); break; }
      case 'alarm': h.banner('Sciame!', 'Tutte le vespe ti puntano', 1.6, 'bad'); h.snd.play('alarm'); break;
      case 'spot': h.snd.play('rival', 0.8); break;
      case 'die': fx.burst(X(e.x), Y(e.y), 3, skinOf(h.o.skins[h.turn] || 'neon').c[0], 50, 30, 1.6, 1); this.st.kick(0.9); h.snd.play('lost'); h.banner('Punto!', e.left > 0 ? `${e.left} ${e.left === 1 ? 'vita rimasta' : 'vite rimaste'}` : 'Fine partita', 1.5, 'bad'); break;
      case 'level': h.banner(`Livello ${e.n}`, 'Mangia tutti i confetti', 1.6); h.snd.play('ready'); break;
      case 'clear': h.banner('Labirinto ripulito!', `Bonus +${fmt(1000 + e.n * 200)}`, 1.8, 'good'); h.snd.play('level'); break;
      case 'extra': h.banner('Vita extra!', '10.000 punti', 1.5, 'good'); h.snd.play('power'); break;
      case 'cool': h.snd.play('minus'); break;
    }
  }
  sync(dt) {
    const sim = this.sim, t = this.st.clock;
    if (this.lvl !== sim.level || this.mazeRef !== sim.maze) this.buildMaze();
    // almonds and chilies
    this.dots.begin(); this.chili.begin(); this.chiliTop.begin();
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      const d = sim.dots[y * MW + x]; if (!d) continue;
      if (d === 1) this.dots.add(X(x), Y(y), 1.2, 1, 1, 1.25, t * 0.5 + x, DOTC[(x * 3 + y) % DOTC.length], 1.2, 0, x + y);
      else { const s = 1 + Math.sin(t * 6) * 0.12; this.chili.add(X(x), Y(y), 1.6, s, s, s, Math.PI + Math.sin(t * 2) * 0.3, '#ff3b1f', 1.8); this.chiliTop.add(X(x) - Math.sin(Math.sin(t * 2) * 0.3) * 1.8, Y(y) + 1.8, 1.6, 1, 1, 1, 0, '#2fb04a'); }
    }
    this.dots.end(); this.chili.end(); this.chiliTop.end();
    this.bonus.begin(); this.bonusTop.begin();
    if (sim.bonus) { const b = sim.bonus, c = BONUSC[b.id] || '#ffffff', bob = Math.sin(t * 4) * 0.4; this.bonus.add(X(b.x), Y(b.y) + bob, 2, 1, 1, 1, 0, c, b.t < 2 && Math.floor(t * 10) % 2 ? 2 : 1, Math.PI / 2, t); this.bonusTop.add(X(b.x), Y(b.y) + bob, 3.6, 1, 1, 1, 0, '#ff3b5c'); }
    this.bonus.end(); this.bonusTop.end();
    // Gnam
    const H = sim.hero, g = this.hero, P = g.userData.parts;
    g.position.set(X(H.x), Y(H.y), 2.4);
    // the face always looks at the camera; Gnam turns his head towards where he is going
    this.yaw = (this.yaw || 0) + (H.dx * 0.75 - (this.yaw || 0)) * Math.min(1, dt * 12);
    this.pitch = (this.pitch || 0) + (H.dy * 0.55 - (this.pitch || 0)) * Math.min(1, dt * 12);
    g.rotation.set(this.pitch, this.yaw, 0);
    const chomp = H.stopped ? 0 : Math.abs(Math.sin(H.mouth));
    P.mouth.scale.set(1, 0.5 + chomp, 1);
    P.body.scale.set(1 + chomp * 0.05, 1 - chomp * 0.06, 1);
    const fire = H.fire > 0;
    g.userData.bodyM.color.copy(fire ? new THREE.Color(H.fire < 2 && Math.floor(t * 8) % 2 ? '#ffffff' : '#ff5a1f') : g.userData.base);
    g.userData.bodyM.emissive.copy(g.userData.bodyM.color); g.userData.bodyM.emissiveIntensity = fire ? 0.8 : 0.25;
    g.visible = sim.state !== 'dying' || Math.floor(sim.stateT * 10) % 2 === 0;
    if (sim.state === 'dying') g.scale.setScalar(Math.max(0.05, 1 - sim.stateT / 1.4)); else g.scale.setScalar(1);
    if (fire && Math.random() < 0.9) this.fx.emit(X(H.x) + (Math.random() - 0.5) * 2, Y(H.y) + (Math.random() - 0.5) * 2, 4, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, 10, ['#ff3b1f', '#ff8a1f', '#ffd23f'][this.k++ % 3], 1.4, 0.4);
    else if (!H.stopped && sim.state === 'play' && Math.random() < 0.35) this.fx.emit(X(H.x), Y(H.y), 1, 0, 0, 3, trailColor(this.h.o.trail, this.h.o.skins[this.h.turn] || 'neon', this.k++), 0.9, 0.5);
    // wasps
    this.wasps.forEach((m, i) => {
      const e = sim.enemies[i]; m.visible = !!e && sim.state !== 'dying';
      if (!e) return;
      const U = m.userData, P2 = U.parts;
      m.position.set(X(e.x), Y(e.y), 3 + Math.sin(t * 5 + i) * 0.4);
      m.rotation.set(e.dy * 0.45, e.dx * 0.55, Math.sin(t * 3 + i) * 0.1);
      const eyes = e.state === 'eyes', sc = e.state === 'scared';
      U.body.visible = !eyes; P2.wings.forEach((w, k) => { w.visible = !eyes; w.rotation.y = (k ? 1 : -1) * (0.4 + Math.sin(t * 60 + i) * 0.5); });
      m.children.forEach((c) => { if (c !== U.eyes && c !== U.body && !P2.wings.includes(c)) c.visible = !eyes; });
      const blink = sc && H.fire < 2 && Math.floor(t * 8) % 2;
      U.bm.color.set(sc ? (blink ? '#ffffff' : '#5d6bff') : e.state === 'leave' || e.state === 'home' ? U.base.clone().multiplyScalar(0.7) : U.base);
      U.bm.emissive.copy(U.bm.color); U.bm.emissiveIntensity = sim.alarm > 0 && !sc ? 0.7 + Math.sin(t * 20) * 0.3 : 0.3;
      U.stripeM.color.set(sc ? '#c8d0ff' : '#16101e');
      for (const k of [-1, 1]) P2['p' + k].position.set(k * 0.8 + (sc ? 0 : e.dx * 0.25), 0.9 - (sc ? 0 : e.dy * 0.25), 1.95);
      m.scale.setScalar(sc ? 1.05 + Math.sin(t * 12 + i) * 0.05 : 1.15);
    });
    this.floorMat.uniforms.uA.value.set(sim.alarm > 0 ? '#3a0a18' : '#2a0f2e');
    this.fx.update(dt);
  }
  hud() {
    const sim = this.sim, best = this.h.o.best || 0;
    return { l1: fmt(sim.score), l2: sim.hero.fire > 0 ? `<span class="ar-tag hot">Peperoncino ${Math.ceil(sim.hero.fire)}</span>` : sim.alarm > 0 ? '<span class="ar-tag bad">Sciame!</span>' : '', c: `<small>Livello ${sim.level}</small><b>${sim.dotsLeft} confetti</b>`, r1: `<span class="ar-lives">${'●'.repeat(Math.max(0, sim.lives))}</span>`, r2: `Record ${fmt(Math.max(best, sim.score))}` };
  }
}
