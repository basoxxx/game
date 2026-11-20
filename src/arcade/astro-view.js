// Astro Baso — three.js view: a tilted neon starfield, instanced enemies and bullets, procedural ships
// and bosses, sparks, shield bubbles, the electric columns of the Medusa and the ship's beam.
import { THREE, Pool, Sparks, Starfield, glowTex, glowMat, litMat, neonMat } from './stage.js';
import { AstroSim, W, H, SECTORS, ITEMS } from './astro.js';
import { skinOf, trailColor } from './meta.js';

export const createSim = (o) => new AstroSim(o);
export const STAGE = { bg: '#04040e', fov: 36, bloom: [0.7, 0.4, 0.72] };
const fmt = (n) => Math.round(n).toLocaleString('it-IT');
const EN_COL = { dardo: '#ff4f8b', ondina: '#ffb21f', corazza: '#7d8cff', girandola: '#3dffb0', cometa: '#ff6a3d', mina: '#ff3b3b' };
const EB_COL = ['#ff5f8f', '#ffb21f', '#ff3b3b', '#d36bff'];

function shipMesh(skin) {
  const s = skinOf(skin), g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.ConeGeometry(1.9, 7, 6), litMat({ color: s.c[0], emissive: s.c[0], emissiveIntensity: 0.25, flatShading: true }));
  body.position.y = 0.6; g.add(body);
  const wingM = litMat({ color: s.c[1], emissive: s.c[2], emissiveIntensity: 0.2, flatShading: true });
  for (const k of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.2, 0.5), wingM); w.position.set(k * 2.6, -1.6, 0); w.rotation.z = k * -0.35; g.add(w);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.6, 0.5), glowMat({ color: new THREE.Color(s.c[2]).multiplyScalar(2.5) })); tip.position.set(k * 4.5, -1.4, 0.2); g.add(tip);
  }
  const cock = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 8), litMat({ color: '#9fe8ff', emissive: '#2a7aa0', metalness: 0.6, roughness: 0.1 })); cock.position.set(0, 0.8, 0.9); cock.scale.set(1, 1.6, 0.8); g.add(cock);
  const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('#ffffff', 'rgba(255,120,40,0)'), color: s.c[2], blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  flame.scale.set(3.4, 6, 1); flame.position.set(0, -4.6, 0); g.add(flame); g.userData.flame = flame;
  const shield = new THREE.Mesh(new THREE.SphereGeometry(5.2, 20, 14), new THREE.MeshBasicMaterial({ color: '#36e0ff', transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }));
  shield.visible = false; g.add(shield); g.userData.shield = shield;
  g.rotation.x = 0.35; g.scale.setScalar(1.25);
  return g;
}
function bossMesh(kind) {
  const g = new THREE.Group(), parts = {};
  if (kind === 'granchio') {
    const m = litMat({ color: '#ff4f8b', emissive: '#5a0a2a', flatShading: true });
    const body = new THREE.Mesh(new THREE.SphereGeometry(10, 14, 10), m); body.scale.set(1.4, 0.8, 0.6); g.add(body);
    for (const k of [-1, 1]) {
      const arm = new THREE.Group(); arm.position.set(k * 13, -2, 0);
      const a1 = new THREE.Mesh(new THREE.BoxGeometry(6, 2.4, 2.4), m); a1.position.x = k * 2; arm.add(a1);
      const cl = new THREE.Mesh(new THREE.ConeGeometry(2.6, 7, 5), litMat({ color: '#ffb0c8', emissive: '#80203f', flatShading: true })); cl.position.set(k * 5, -3, 0); cl.rotation.z = k * 0.4 + Math.PI; arm.add(cl);
      g.add(arm); parts['arm' + k] = arm;
    }
    for (const k of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(1.8, 10, 8), glowMat({ color: new THREE.Color('#ffe14d').multiplyScalar(2.2) })); e.position.set(k * 4, 3, 5); g.add(e); }
  } else if (kind === 'medusa') {
    const dome = new THREE.Mesh(new THREE.SphereGeometry(10, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), new THREE.MeshStandardMaterial({ color: '#36e0ff', emissive: '#0a5070', transparent: true, opacity: 0.85, roughness: 0.2 }));
    dome.rotation.x = Math.PI / 2; g.add(dome);
    const core = new THREE.Mesh(new THREE.SphereGeometry(4, 14, 10), glowMat({ color: new THREE.Color('#bff6ff').multiplyScalar(2) })); g.add(core); parts.core = core;
    parts.tent = [];
    for (let i = 0; i < 8; i++) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.15, 14, 5), glowMat({ color: new THREE.Color('#7ff3ff').multiplyScalar(1.6) })); t.position.set((i - 3.5) * 2.4, -9, 0); g.add(t); parts.tent.push(t); }
  } else {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(10, 24, 16), litMat({ color: '#f2eaff', emissive: '#30204a', roughness: 0.3 })); g.add(eye);
    const iris = new THREE.Mesh(new THREE.CircleGeometry(5, 24), glowMat({ color: new THREE.Color('#a65bff').multiplyScalar(1.8) })); iris.position.z = 10.05; g.add(iris); parts.iris = iris;
    const pupil = new THREE.Mesh(new THREE.CircleGeometry(2.3, 20), new THREE.MeshBasicMaterial({ color: '#05020c' })); pupil.position.z = 10.1; g.add(pupil); parts.pupil = pupil;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(13, 0.5, 6, 40), glowMat({ color: new THREE.Color('#d36bff').multiplyScalar(1.6) })); g.add(ring); parts.ring = ring;
  }
  g.userData.parts = parts;
  return g;
}

export class View {
  constructor(host) { this.h = host; this.st = host.stage; this.trailK = 0; }
  get sim() { return this.h.sim; }
  build() {
    const sc = this.st.scene, tier = this.h.o.tier;
    sc.add(new THREE.HemisphereLight('#9fb4ff', '#200a30', 1.1));
    const sun = new THREE.DirectionalLight('#ffffff', 1.6); sun.position.set(-30, -40, 80); sc.add(sun);
    this.stars = [new Starfield(sc, tier === 'low' ? 150 : 320, [-60, W + 60, -40, H + 60, -30, -5], '#ffffff', 0.7), new Starfield(sc, tier === 'low' ? 60 : 140, [-60, W + 60, -40, H + 60, -60, -30], '#9fc8ff', 1.4)];
    // nebula clouds: big additive sprites drifting down, tinted per sector
    this.neb = [];
    const tex = glowTex('rgba(255,255,255,0.55)', 'rgba(255,255,255,0)');
    for (let i = 0; i < 7; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: '#ff4f8b', transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false })); s.scale.set(60 + i * 8, 44 + i * 6, 1); s.position.set((i * 37) % (W + 40) - 20, i * 40, -70); sc.add(s); this.neb.push(s); }
    // field border rails
    const rail = glowMat({ color: new THREE.Color('#36e0ff').multiplyScalar(1.2), transparent: true, opacity: 0.5 });
    for (const x of [-0.6, W + 0.6]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.35, H + 30, 0.35), rail); m.position.set(x, H / 2, -1); sc.add(m); }
    this.rail = rail;
    this.ships = this.sim.ships.map((s, i) => { const m = shipMesh(this.h.o.skins[i] || 'neon'); sc.add(m); return m; });
    const lit = neonMat(0.55, { flatShading: true });
    this.pools = {
      dardo: new Pool(sc, new THREE.OctahedronGeometry(3, 0), lit, 120),
      ondina: new Pool(sc, new THREE.TorusGeometry(2.4, 1, 6, 12), lit, 120),
      corazza: new Pool(sc, new THREE.BoxGeometry(9, 7, 4), lit, 20),
      girandola: new Pool(sc, new THREE.TorusKnotGeometry(2.6, 0.9, 40, 6), lit, 20),
      cometa: new Pool(sc, new THREE.ConeGeometry(2.4, 6, 5), lit, 60),
      mina: new Pool(sc, new THREE.DodecahedronGeometry(2.8, 0), lit, 60),
      core: new Pool(sc, new THREE.SphereGeometry(1, 10, 8), glowMat(), 60),
    };
    this.pb = new Pool(sc, new THREE.BoxGeometry(0.7, 3.4, 0.7), glowMat(), 700);
    this.eb = new Pool(sc, new THREE.SphereGeometry(1, 10, 8), glowMat(), 700);
    this.ebHalo = new Pool(sc, new THREE.SphereGeometry(1, 10, 8), glowMat({ transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }), 700);
    this.gemP = new Pool(sc, new THREE.OctahedronGeometry(1.1, 0), glowMat(), 300);
    this.itemP = new Pool(sc, new THREE.TorusGeometry(2.6, 0.45, 6, 18), glowMat(), 20);
    this.itemCore = new Pool(sc, new THREE.IcosahedronGeometry(1.5, 0), litMat({ flatShading: true }), 20);
    this.orbP = new Pool(sc, new THREE.IcosahedronGeometry(3, 1), litMat({ color: '#ffffff', emissive: '#40205a', flatShading: true }), 8);
    this.colP = new Pool(sc, new THREE.BoxGeometry(1, 1, 0.4), glowMat({ transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }), 6);
    this.beam = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1, 0.6), glowMat({ color: new THREE.Color('#7dff5a').multiplyScalar(2.2), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.beam.visible = false; sc.add(this.beam);
    this.beam2 = this.beam.clone(); sc.add(this.beam2);
    this.fx = new Sparks(sc, tier === 'low' ? 700 : 1800);
    this.bossG = null; this.lastSector = -1;
  }
  reset() { for (const m of this.ships) this.st.scene.remove(m); this.ships = this.sim.ships.map((s, i) => { const m = shipMesh(this.h.o.skins[i] || 'neon'); this.st.scene.add(m); return m; }); if (this.bossG) { this.st.scene.remove(this.bossG); this.bossG = null; } }
  frame(w, h) { const port = h > w; return { w: W, h: H, tilt: 0.2, pad: 1, padTop: port ? 16 : 8, padBottom: port ? 6 : 2 }; }
  resized() { this.fx.setScale(this.st); }
  touchHTML() { return '<button class="ar-vb big" data-vb="b" aria-label="Bomba">Bomba</button>'; }
  control(I, dt) {
    const sim = this.sim, upp = this.st.unitsPerPx();
    sim.ships.forEach((s, i) => {
      const inp = s.input;
      const [ax, ay] = I.axis(i); inp.ax = ax; inp.ay = ay;
      if (I.hit(i, 'b')) inp.bomb = true;
      if (i === 0) {
        // touch: relative drag (the finger never covers the ship), mouse: hold to fly to the pointer
        if (I.touch != null) { inp.mx += I.drag[0] * upp * 1.25; inp.my += -I.drag[1] * upp * 1.25; }
        if (I.mouse.down && I.mouse.on) { const [fx, fy] = this.st.toField(I.mouse.x, I.mouse.y); const dx = fx - s.x, dy = fy + 6 - s.y, l = Math.hypot(dx, dy); if (l > 0.5) { const k = Math.min(1, l / 6); inp.ax = (dx / l) * k; inp.ay = (dy / l) * k; } }
        if (I.taps) { const now = this.st.clock; if (now - (this.lastTap ?? -9) < 0.35) inp.bomb = true; this.lastTap = now; } // double tap = bomb
      }
    });
  }
  onEvent(e) {
    const h = this.h, fx = this.fx, sim = this.sim;
    switch (e.k) {
      case 'shot': if (Math.random() < 0.35) h.snd.play('shoot', 0.07); break;
      case 'hit': fx.burst(e.x, e.y, 2, '#ffffff', 2, 18, 0.8, 0.25); break;
      case 'kill': {
        const c = e.type === 'orb' ? '#d36bff' : EN_COL[e.type] || '#ffffff';
        fx.burst(e.x, e.y, 2, c, e.big ? 46 : 18, e.big ? 46 : 30, e.big ? 2 : 1.3, 0.7); fx.burst(e.x, e.y, 2, '#ffffff', 6, 14, 1.6, 0.25);
        h.snd.play(e.big ? 'boom' : 'pop', e.big ? 0.1 : 0.03); if (e.big) this.st.kick(0.35);
        break;
      }
      case 'score': if (e.pts >= 300 || e.big) h.pop(e.x, e.y, 4, `+${fmt(e.pts)}`, e.big ? 'big' : ''); break;
      case 'gem': h.snd.play('tick', 0.06); break;
      case 'pick': fx.burst(e.x, e.y, 2, ITEMS[e.item].color, 24, 30, 1.4, 0.5); h.pop(e.x, e.y + 6, 4, ITEMS[e.item].name, 'item'); h.snd.play('power', 0.1); break;
      case 'bomb': this.st.kick(1.2); for (let i = 0; i < 4; i++) fx.burst(e.x, e.y, 2, ['#ffffff', '#ffb21f', '#ff4fd8', '#36e0ff'][i], 50, 90 + i * 20, 2.4, 0.9); h.snd.play('burst'); h.snd.play('boom', 0); break;
      case 'shield': fx.burst(e.x, e.y, 2, '#36e0ff', 40, 40, 1.6, 0.6); h.snd.play('slam'); this.st.kick(0.4); break;
      case 'die': fx.burst(e.x, e.y, 2, '#ffffff', 30, 50, 2, 0.9); fx.burst(e.x, e.y, 2, skinOf(h.o.skins[e.p] || 'neon').c[0], 60, 40, 2, 1.1); this.st.kick(1); h.snd.play('crash'); h.banner(e.left > 0 ? 'Nave abbattuta!' : 'Ultima nave persa', e.left > 0 ? `${e.left} ${e.left === 1 ? 'nave rimasta' : 'navi rimaste'}` : '', 1.4, 'bad'); break;
      case 'wave': h.banner(`Ondata ${e.n}/8`, SECTORS[sim.sector].name, 1.2, 'small'); h.snd.play('wave'); break;
      case 'warning': h.banner('Attenzione!', `${SECTORS[sim.sector].bossName} in arrivo`, 2.4, 'warn'); h.snd.play('alarm'); break;
      case 'boss': h.snd.play('rival'); break;
      case 'bossdown': for (let i = 0; i < 6; i++) setTimeout(() => { fx.burst(e.x + (Math.random() - 0.5) * 24, e.y + (Math.random() - 0.5) * 16, 3, ['#ffffff', '#ffe14d', SECTORS[Math.min(2, sim.sector)].tint][i % 3], 60, 70, 2.6, 1.2); this.st.kick(0.7); h.snd.play('boom', 0); }, i * 160); h.banner('Boss distrutto!', 'Settore completato', 3, 'good'); break;
      case 'sector': h.banner(`Settore ${e.n + 1}`, SECTORS[e.n].name, 2.2); h.snd.play('level'); break;
      case 'mine': fx.burst(e.x, e.y, 2, '#ff3b3b', 20, 30, 1.4, 0.5); h.snd.play('pop'); break;
      case 'dash': h.snd.play('whoosh', 0.3); break;
    }
  }
  sync(dt) {
    const sim = this.sim, t = this.st.clock;
    // background: stars and nebulae scroll with the sector tint
    const tint = SECTORS[Math.min(2, sim.sector)].tint;
    const speed = sim.state === 'clear' ? 120 : 26;
    for (const s of this.stars) s.scroll(speed * dt);
    for (const n of this.neb) { n.position.y -= speed * 0.25 * dt; if (n.position.y < -60) { n.position.y += H + 120; n.position.x = Math.random() * (W + 40) - 20; } n.material.color.lerp(new THREE.Color(tint), Math.min(1, dt * 2)); }
    this.rail.color.copy(new THREE.Color(tint)).multiplyScalar(1.4);
    // ships
    sim.ships.forEach((s, i) => {
      const m = this.ships[i]; if (!m) return;
      m.visible = s.alive && !(s.inv > 0 && Math.floor(t * 14) % 2 === 0 && s.inv < 2.4);
      m.position.set(s.x, s.y, 2); m.rotation.y = -s.tilt * 0.6;
      m.userData.shield.visible = s.shield > 0; m.userData.shield.scale.setScalar(1 + Math.sin(t * 8) * 0.04);
      m.userData.flame.scale.set(3.4, 5 + Math.sin(t * 40) * 1.2 + Math.max(0, s.input.ay) * 3, 1);
      if (s.alive && Math.random() < 0.8) { const c = trailColor(this.h.o.trail, this.h.o.skins[i] || 'neon', this.trailK++); this.fx.emit(s.x + (Math.random() - 0.5) * 1.5, s.y - 5, 1, (Math.random() - 0.5) * 6, -30 - Math.random() * 20, 0, c, 1.1, 0.35); }
      const beam = i ? this.beam2 : this.beam;
      beam.visible = s.alive && s.laser > 0;
      if (beam.visible) { const len = H + 10 - s.y; beam.scale.set(1 + Math.sin(t * 50) * 0.15, len, 1); beam.position.set(s.x, s.y + 4 + len / 2, 2); }
    });
    // enemies
    for (const k in this.pools) this.pools[k].begin();
    for (const e of sim.enemies) {
      const c = e.flash > 0 ? '#ffffff' : EN_COL[e.type], k = e.flash > 0 ? 3 : 1, P = this.pools[e.type];
      if (e.type === 'cometa') { const a = e.locked ? Math.atan2(e.vy, e.vx) + Math.PI / 2 : Math.PI; P.add(e.x, e.y, 2, 1, 1, 1, a, c, k); }
      else if (e.type === 'corazza') { P.add(e.x, e.y, 2, 1, 1, 1, Math.sin(e.t * 2) * 0.08, c, k); this.pools.core.add(e.x, e.y - 1, 4.2, 2.2, 2.2, 1, 0, '#bfc8ff', 2.4); }
      else if (e.type === 'girandola') P.add(e.x, e.y, 2, 1, 1, 1, e.rot * 2, c, k, 0.4, 0);
      else if (e.type === 'ondina') P.add(e.x, e.y, 2, 1, 1, 1, 0, c, k, 0.6 + Math.sin(e.t * 3) * 0.3, e.rot);
      else P.add(e.x, e.y, 2, 1, 1, 1, e.rot, c, k, e.rot * 0.7, 0);
      if (e.type === 'mina') this.pools.core.add(e.x, e.y, 2, 1.4, 1.4, 1.4, 0, '#ff3b3b', 1.5 + Math.sin(e.t * 10) * 1.2);
    }
    for (const k in this.pools) this.pools[k].end();
    // bullets, gems, items
    this.pb.begin(); for (const b of sim.bullets) this.pb.add(b.x, b.y, 2, b.dmg >= 1.2 ? 1.1 : 0.9, 0.9, 1, -Math.atan2(b.vx, b.vy), skinOf(this.h.o.skins[b.p] || 'neon').c[2], 1.5); this.pb.end();
    this.eb.begin(); this.ebHalo.begin();
    for (const b of sim.ebullets) { this.eb.add(b.x, b.y, 2.2, b.r * 0.85, b.r * 0.85, b.r * 0.85, 0, '#ffffff', 2); this.ebHalo.add(b.x, b.y, 2, b.r * 1.9, b.r * 1.9, b.r * 1.9, 0, EB_COL[b.kind || 0], 2.4); }
    this.eb.end(); this.ebHalo.end();
    this.gemP.begin(); for (const g of sim.gems) this.gemP.add(g.x, g.y, 2, 0.8, 1.1, 0.8, g.t * 4, '#3dffd0', 1.2, 0, g.t * 3); this.gemP.end();
    this.itemP.begin(); this.itemCore.begin();
    for (const it of sim.items) { const c = ITEMS[it.type].color; this.itemP.add(it.x, it.y, 3, 1, 1, 1, 0, c, 2.2, 0, it.t * 3); this.itemCore.add(it.x, it.y, 3, 1, 1, 1, it.t * 2, c, 1.2, it.t * 3); }
    this.itemP.end(); this.itemCore.end();
    // boss
    const B = sim.boss;
    if (B && !this.bossG) { this.bossG = bossMesh(B.kind); this.st.scene.add(this.bossG); }
    if (!B && this.bossG) { this.st.scene.remove(this.bossG); this.bossG = null; }
    this.orbP.begin();
    if (B && this.bossG) {
      const g = this.bossG, P = g.userData.parts;
      g.position.set(B.x, B.y, 3); g.scale.setScalar(B.flash > 0 ? 1.04 : 1);
      if (B.kind === 'granchio') { P['arm-1'].rotation.z = Math.sin(t * 2) * 0.3; P.arm1.rotation.z = -Math.sin(t * 2) * 0.3; g.rotation.z = Math.sin(t * 1.3) * 0.05; }
      else if (B.kind === 'medusa') { P.tent.forEach((m, i) => { m.rotation.z = Math.sin(t * 3 + i) * 0.35; }); P.core.scale.setScalar(1 + Math.sin(t * 6) * 0.1 + B.phase * 0.1); }
      else {
        const tg = sim.ships.find((s) => s.alive) || sim.ships[0];
        const dx = Math.max(-1, Math.min(1, (tg.x - B.x) / 30)), dy = Math.max(-1, Math.min(1, (tg.y - B.y) / 60));
        P.iris.position.set(dx * 3.5, dy * 3.5, 9.6 - (dx * dx + dy * dy)); P.pupil.position.set(dx * 3.9, dy * 3.9, 9.7 - (dx * dx + dy * dy)); P.ring.rotation.z = t; P.ring.rotation.x = Math.sin(t) * 0.4;
        for (const o of B.orbs) if (o.alive) this.orbP.add(B.x + Math.cos(o.a) * 18, B.y + Math.sin(o.a) * 18, 3, 1, 1, 1, t * 2, '#d36bff', 1.4, t);
      }
      g.traverse((o) => { if (o.material?.emissive) o.material.emissiveIntensity = B.flash > 0 ? 3 : 1; });
    }
    this.orbP.end();
    this.colP.begin();
    for (const c of sim.columns) { const on = c.t > c.warn; this.colP.add(c.x, H / 2, 1.5, on ? c.w * (1 + Math.sin(t * 60) * 0.1) : 0.6 + (c.t / c.warn) * 1.2, H + 20, 1, 0, on ? '#bff6ff' : '#36e0ff', on ? 2.4 : 0.8); }
    this.colP.end();
    this.fx.update(dt);
  }
  hud() {
    const sim = this.sim, best = this.h.o.best || 0;
    const lives = sim.ships.map((s, i) => `<span class="ar-lives p${i}">${'▲'.repeat(Math.max(0, s.lives))}</span>`).join('');
    const bombs = sim.ships.map((s) => `<span class="ar-bombs">${'●'.repeat(s.bombs)}</span>`).join(' ');
    const B = sim.boss;
    return {
      l1: fmt(sim.score), l2: `<span class="ar-mult m${sim.mult}">x${sim.mult}</span> <span class="ar-chain"><i style="width:${Math.round(Math.max(0, sim.chainT / 2) * 100)}%"></i></span>`,
      c: B ? `<div class="ar-boss"><b>${SECTORS[sim.sector].bossName}</b><span><i style="width:${Math.max(0, (B.hp / B.max) * 100).toFixed(1)}%"></i></span></div>` : `<small>Settore ${sim.sector + 1} · ${SECTORS[sim.sector].name}</small><b>Ondata ${Math.min(8, sim.wave)}/8</b>`,
      r1: `${lives} ${bombs}`, r2: `Record ${fmt(Math.max(best, sim.score))}`,
    };
  }
}
