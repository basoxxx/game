// Rimbalzo — three.js view: neon frame over a glowing grid floor, instanced bricks coloured by row and
// toughness, a capsule paddle in the player's colours, glowing balls with trails, falling capsules.
import { THREE, Pool, Sparks, glowMat, litMat, neonMat } from './stage.js';
import { RimbalzoSim, W, H, BW, BH, PADDLE_Y, CAPS, LEVEL_COUNT } from './rimbalzo.js';
import { skinOf, trailColor } from './meta.js';

export const createSim = (o) => new RimbalzoSim(o);
export const STAGE = { bg: '#07031a', fov: 34, bloom: [0.6, 0.4, 0.75] };
const fmt = (n) => Math.round(n).toLocaleString('it-IT');
const ROWC = ['#ff4f8b', '#ff7a3d', '#ffd23f', '#9dff3d', '#3dffb0', '#36e0ff', '#5d8cff', '#a65bff', '#ff5fd2'];
const tc = new THREE.Color(), wc = new THREE.Color('#ffffff');
const brickColor = (b) => {
  if (b.v === 8) return '#8a93a8';
  if (b.v === 9) return '#ff3030';
  if (b.v === 4) return '#ffcc1a';
  tc.set(ROWC[b.r % ROWC.length]); if (b.hp >= 2) tc.lerp(wc, b.hp >= 3 ? 0.3 : 0.12);
  return tc.getHex();
};

function gridFloor() {
  const m = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uC: { value: new THREE.Color('#ff4fd8') } },
    vertexShader: 'varying vec2 vU; void main(){ vU = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform float uT; uniform vec3 uC; varying vec2 vU; void main(){ vec2 g = abs(fract(vU / 8.0 + vec2(0.0, -uT * 0.05)) - 0.5); float l = smoothstep(0.47, 0.5, max(g.x, g.y)); float d = length(vU - vec2(52.0, 75.0)) / 120.0; vec3 c = mix(vec3(0.03, 0.01, 0.08), uC * 0.55, l) * (1.0 - d * 0.7); gl_FragColor = vec4(c, 1.0); }',
  });
  const p = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), m); p.position.set(W / 2, H / 2, -6);
  return p;
}

export class View {
  constructor(host) { this.h = host; this.st = host.stage; this.k = 0; }
  get sim() { return this.h.sim; }
  build() {
    const sc = this.st.scene, tier = this.h.o.tier, skin = skinOf(this.h.o.skins[this.h.turn] || 'neon');
    sc.add(new THREE.HemisphereLight('#c8c0ff', '#1a0830', 1.2));
    const sun = new THREE.DirectionalLight('#ffffff', 1.8); sun.position.set(-40, -60, 120); sc.add(sun);
    this.floor = gridFloor(); sc.add(this.floor);
    // the frame: left, right and top neon walls
    const wm = glowMat({ color: new THREE.Color('#ff4fd8').multiplyScalar(1.6) });
    for (const [x, y, w, h] of [[-1.2, H / 2 + 2, 2, H + 6], [W + 1.2, H / 2 + 2, 2, H + 6], [W / 2, H + 1.2, W + 4.4, 2]]) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 3), wm); m.position.set(x, y, 0); sc.add(m); }
    this.wallMat = wm;
    const bg = new THREE.BoxGeometry(BW - 0.5, BH - 0.5, 3);
    this.bricks = new Pool(sc, bg, neonMat(0.35, { roughness: 0.3, metalness: 0.3 }), 260);
    this.glow = new Pool(sc, new THREE.BoxGeometry(BW - 3.2, 0.5, 0.4), glowMat(), 260);
    this.balls = new Pool(sc, new THREE.SphereGeometry(1, 16, 12), glowMat(), 16);
    this.caps = new Pool(sc, new THREE.CapsuleGeometry(1.6, 3.4, 4, 10), litMat({ emissive: '#222222' }), 20);
    this.capGlow = new Pool(sc, new THREE.TorusGeometry(1.9, 0.3, 6, 16), glowMat(), 20);
    this.shots = new Pool(sc, new THREE.BoxGeometry(0.6, 3, 0.6), glowMat(), 40);
    // paddle: a capsule with glowing tips and laser cannons
    const pg = new THREE.Group();
    this.padBody = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 1, 18), litMat({ color: skin.c[0], emissive: skin.c[0], emissiveIntensity: 0.3, metalness: 0.4, roughness: 0.25 }));
    this.padBody.rotation.z = Math.PI / 2; pg.add(this.padBody);
    this.tips = [-1, 1].map((k) => { const m = new THREE.Mesh(new THREE.SphereGeometry(1.45, 12, 10), glowMat({ color: new THREE.Color(skin.c[2]).multiplyScalar(1.6) })); pg.add(m); return { m, k }; });
    this.guns = [-1, 1].map(() => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 2.4, 8), litMat({ color: '#ff4fd8', emissive: '#ff4fd8', emissiveIntensity: 0.8 })); m.visible = false; pg.add(m); return m; });
    sc.add(pg); this.pad = pg;
    this.fx = new Sparks(sc, tier === 'low' ? 700 : 1600);
    this.danger = new THREE.Mesh(new THREE.BoxGeometry(W, 0.4, 0.4), glowMat({ color: new THREE.Color('#ff3b6b').multiplyScalar(1.3), transparent: true, opacity: 0.5 })); this.danger.position.set(W / 2, 1, 0); sc.add(this.danger);
  }
  reset() { const skin = skinOf(this.h.o.skins[this.h.turn] || 'neon'); this.padBody.material.color.set(skin.c[0]); this.padBody.material.emissive.set(skin.c[0]); for (const t of this.tips) t.m.material.color.set(skin.c[2]).multiplyScalar(1.6); }
  frame(w, h) { const port = h > w; return { w: W, h: H, tilt: 0.26, pad: 2, padTop: port ? 16 : 8, padBottom: port ? 4 : 0 }; }
  resized() { this.fx.setScale(this.st); }
  touchHTML() { return ''; }
  control(I, dt) {
    const sim = this.sim, inp = sim.input;
    const [ax] = I.axis(0); inp.ax = ax;
    if (ax) inp.px = null, this.mouseOwn = false;
    if (I.mouse.moved) this.mouseOwn = true;
    if (this.mouseOwn && I.mouse.on) inp.px = this.st.toField(I.mouse.x, I.mouse.y)[0];
    if (I.touch != null) { const t = I.ptrs.get(I.touch); if (t) inp.px = this.st.toField(t.x, t.y)[0]; }
    else if (!this.mouseOwn) inp.px = null;
    if (I.hit(0, 'a') || I.hit(0, 'up') || I.taps || I.mouse.click) inp.launch = true;
  }
  onEvent(e) {
    const h = this.h, fx = this.fx, sim = this.sim;
    switch (e.k) {
      case 'break': { const c = e.v === 9 ? '#ff5030' : e.v === 4 ? '#ffd23f' : ROWC[e.r % ROWC.length]; fx.burst(e.x, e.y, 1, c, 16, 34, 1.4, 0.6); fx.burst(e.x, e.y, 1, '#ffffff', 4, 14, 1.2, 0.2); h.snd.play('pop', 0.025); break; }
      case 'crack': fx.burst(e.x, e.y, 1, '#ffffff', 5, 18, 0.9, 0.25); h.snd.play('hit', 0.03); break;
      case 'metal': fx.burst(e.x, e.y, 1, '#c8d0e0', 4, 16, 0.8, 0.2); h.snd.play('toggle', 0.05); break;
      case 'explode': fx.burst(e.x, e.y, 2, '#ff8a3d', 50, 60, 2.4, 0.8); this.st.kick(0.6); h.snd.play('boom', 0.08); break;
      case 'paddle': fx.burst(e.x, e.y, 1, skinOf(h.o.skins[h.turn] || 'neon').c[2], 8, 20, 1, 0.3); h.snd.play('slam', 0.04); break;
      case 'wall': h.snd.play('tick', 0.05); break;
      case 'laser': h.snd.play('shoot', 0.1); break;
      case 'cap': fx.burst(e.x, e.y + 2, 2, CAPS[e.type].color, 26, 34, 1.4, 0.5); h.pop(e.x, e.y + 8, 2, CAPS[e.type].name, CAPS[e.type].good ? 'item' : 'bad'); h.snd.play(CAPS[e.type].good ? 'power' : 'minus'); break;
      case 'score': if (e.pts >= 300) h.pop(e.x, e.y, 3, `+${fmt(e.pts)}`, e.pts >= 1000 ? 'big' : ''); break;
      case 'drop': h.snd.play('fall'); break;
      case 'lose': this.st.kick(0.8); h.snd.play('lost'); h.banner(e.left > 0 ? 'Pallina persa!' : 'Fine partita', e.left > 0 ? `${e.left} ${e.left === 1 ? 'vita rimasta' : 'vite rimaste'}` : '', 1.4, 'bad'); break;
      case 'level': h.banner(sim.o.endless ? `Quadro ${sim.cleared + 1}` : sim.o.daily ? `Quadro ${sim.cleared + 1}/5` : `Livello ${e.n}/${LEVEL_COUNT}`, e.name, 1.8); h.snd.play('ready'); break;
      case 'clear': h.banner('Quadro completato!', `Bonus +${fmt(e.bonus)}`, 1.6, 'good'); h.snd.play('level'); for (let i = 0; i < 5; i++) fx.burst(10 + Math.random() * (W - 20), H - 20 - Math.random() * 50, 3, ROWC[i], 40, 50, 2, 1); break;
      case 'launch': h.snd.play('whoosh', 0.2); break;
    }
  }
  sync(dt) {
    const sim = this.sim, t = this.st.clock, P = sim.paddle;
    this.floor.material.uniforms.uT.value = t;
    const fire = sim.fire > 0;
    this.floor.material.uniforms.uC.value.set(fire ? '#ff7a2f' : sim.slow > 0 ? '#5d8cff' : '#ff4fd8');
    this.wallMat.color.set(fire ? '#ff8a3d' : '#ff4fd8').multiplyScalar(1.4 + Math.sin(t * 3) * 0.2);
    this.bricks.begin(); this.glow.begin();
    for (const b of sim.bricks) {
      if (!b.alive) continue;
      const c = brickColor(b), fl = b.flash > 0 ? 2.2 : 1;
      this.bricks.add(b.x, b.y, 0, 1, 1, b.v === 8 ? 1.2 : 1, 0, b.flash > 0 ? 0xffffff : c, fl);
      if (b.v !== 8) this.glow.add(b.x, b.y, 1.6, 1, 1, 1, 0, c, b.v === 9 ? 1.2 + Math.sin(t * 8) * 0.6 : b.v === 4 ? 1.6 : 0.9 + (b.hp - 1) * 0.35);
    }
    this.bricks.end(); this.glow.end();
    this.pad.position.set(P.x, PADDLE_Y, 0);
    this.padBody.scale.set(1, Math.max(0.5, P.w - 2.4), 1);
    for (const tp of this.tips) tp.m.position.set(tp.k * (P.w / 2 - 1.2), 0, 0);
    this.guns.forEach((g, i) => { g.visible = P.laserT > 0; g.position.set((i ? 1 : -1) * (P.w / 2 - 1.5), 1.6, 0); });
    this.padBody.material.emissiveIntensity = P.glue > 0 ? 0.9 + Math.sin(t * 6) * 0.3 : 0.3;
    const skin = this.h.o.skins[this.h.turn] || 'neon';
    this.balls.begin();
    for (const b of sim.balls) {
      this.balls.add(b.x, b.y, 0.6, b.r, b.r, b.r, 0, fire ? '#ffb070' : '#ffffff', 1.8);
      if (!b.stuck && Math.random() < 0.9) this.fx.emit(b.x, b.y, 0.6, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, 0, fire ? ['#ff3b1f', '#ff8a1f', '#ffd23f'][this.k++ % 3] : trailColor(this.h.o.trail, skin, this.k++), fire ? 1.8 : 1.1, 0.3);
    }
    this.balls.end();
    this.caps.begin(); this.capGlow.begin();
    for (const c of sim.caps) { const col = CAPS[c.type].color; this.caps.add(c.x, c.y, 1, 1, 1, 1, Math.PI / 2, col, 1.2, c.t * 3, 0); this.capGlow.add(c.x, c.y, 1, 1, 1, 1, 0, col, 2, 0, c.t * 4); }
    this.caps.end(); this.capGlow.end();
    this.shots.begin(); for (const s of sim.shots) this.shots.add(s.x, s.y, 0.5, 1, 1, 1, 0, '#ff4fd8', 3); this.shots.end();
    this.danger.material.opacity = 0.3 + Math.sin(t * 4) * 0.15;
    this.fx.update(dt);
  }
  hud() {
    const sim = this.sim, best = this.h.o.best || 0;
    const L = sim.o.endless ? `Infinito · quadro ${sim.cleared + 1}` : sim.o.daily ? `Sfida · quadro ${Math.min(5, sim.cleared + 1)}/5` : `Livello ${sim.level}/${LEVEL_COUNT}`;
    const fx = [sim.fire > 0 ? 'Fuoco' : '', sim.slow > 0 ? 'Lento' : '', sim.paddle.laserT > 0 ? 'Laser' : '', sim.paddle.glue > 0 ? 'Colla' : ''].filter(Boolean).map((x) => `<span class="ar-tag">${x}</span>`).join('');
    return { l1: fmt(sim.score), l2: sim.combo > 2 ? `<span class="ar-mult">Combo ${sim.combo}</span>` : '', c: `<small>${L}</small><b>${sim.levelName}</b>`, r1: `<span class="ar-lives">${'●'.repeat(Math.max(0, sim.lives))}</span>${fx}`, r2: `Record ${fmt(Math.max(best, sim.score))} · ${sim.left} mattoni` };
  }
}
