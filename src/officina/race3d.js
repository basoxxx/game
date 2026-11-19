// Officina — the race view: the merged car against a rival of the Apex Dynasty teams on a straight (drag)
// or a short circuit, drawn simply in 3D on the garage's renderer. The outcome comes from RaceRun (race.js):
// the player's only inputs are the gear shifts (drag) or the hybrid boost (circuits). Space / Enter / tap.
import * as THREE from 'three';
import { carModel } from './models.js';
import { carDef, classOf, RACE_TYPES, GRADES } from './data.js';
import { RaceRun, trackPos } from './race.js';
import { engineStart, engineSet, engineStop, sfx } from '../ui/audio.js';

const ENGINE = { kart: 'hatch', junior: 'junior', rally: 'rally', gt: 'gt', endurance: 'endurance', formula: 'formula' };
const fmtS = (t) => (isFinite(t) ? t.toFixed(2).replace('.', ',') + ' s' : '—');

export class RaceView {
  // garage: Garage3D (renderer, canvas, root); opts: { ev, grade, car, bonus, ers, ersDur, seed, hud (element), onEnd(result) }
  constructor(garage, opts) {
    this.g = garage; this.o = opts; this.r = garage.renderer; this.dead = false;
    this.run = new RaceRun({ ev: opts.ev, grade: opts.grade, car: opts.car, bonus: opts.bonus, ers: opts.ers, ersDur: opts.ersDur, seed: opts.seed, skill: 'auto' });
    garage.paused = true; garage.labels.style.display = 'none';
    this.scene = new THREE.Scene(); this.build();
    this.cam = new THREE.PerspectiveCamera(55, 1, 0.3, 1200);
    this.hud = opts.hud; this.drawHud();
    this.onKey = (e) => {
      if (e.repeat) return;
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowUp' || e.key.toLowerCase() === 'w' || e.key.toLowerCase() === 'b') { e.preventDefault(); e.stopPropagation(); this.action(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.skip(); }
    };
    window.addEventListener('keydown', this.onKey, true);
    this.onTap = (e) => { if (e.target.closest?.('[data-rk]')) return; this.action(); };
    garage.cv.addEventListener('pointerdown', this.onTap);
    try { engineStart(ENGINE[classOf(opts.car.t).id] || 'gt'); } catch {}
    this.last = performance.now(); this.loop = this.loop.bind(this); this.raf = requestAnimationFrame(this.loop);
    this.beeps = 0;
  }
  build() {
    const sc = this.scene, tr = this.run.tr, drag = !tr.loop;
    sc.background = new THREE.Color('#a8cdf0'); sc.fog = new THREE.Fog('#a8cdf0', 120, 520);
    sc.environment = this.g.env;
    sc.add(new THREE.HemisphereLight(0xe8f0ff, 0x4a5a35, 1.0));
    const sun = new THREE.DirectionalLight(0xfff1d8, 2.2); sun.position.set(-40, 80, 30); sc.add(sun);
    if (this.r.shadowMap.enabled) { sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); const s = sun.shadow.camera; s.left = -30; s.right = 30; s.top = 30; s.bottom = -30; s.far = 200; }
    this.sun = sun; sc.add(sun.target);
    let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
    for (let i = 0; i < tr.n; i++) { minx = Math.min(minx, tr.x[i]); maxx = Math.max(maxx, tr.x[i]); minz = Math.min(minz, tr.z[i]); maxz = Math.max(maxz, tr.z[i]); }
    const cx = (minx + maxx) / 2, cz = (minz + maxz) / 2;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshStandardMaterial({ color: '#5f9446', roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(cx, -0.03, cz); ground.receiveShadow = true; sc.add(ground);
    const W = drag ? 12 : 11;
    sc.add(strip(tr, W, new THREE.MeshStandardMaterial({ color: '#34363b', roughness: 0.92 }), 0, 0.0));
    const kt = kerbTex();
    for (const off of [-(W / 2 + 0.5), W / 2 + 0.5]) { const m = new THREE.MeshStandardMaterial({ map: kt, roughness: 0.6 }); sc.add(strip(tr, 1, m, off, 0.01, true)); }
    if (drag) {
      const lineM = new THREE.MeshBasicMaterial({ color: 0xffffff });
      for (let x = 0; x < tr.len; x += 8) { const d = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.2), lineM); d.rotation.x = -Math.PI / 2; d.position.set(x + 2, 0.02, 0); sc.add(d); }
      for (const z of [-(W / 2 + 2.2), W / 2 + 2.2]) { const wall = new THREE.Mesh(new THREE.BoxGeometry(tr.n, 1, 0.4), new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.7 })); wall.position.set(tr.n / 2 - 40, 0.5, z); sc.add(wall); }
    }
    // start / finish line and a gantry with the start lights
    const p0 = trackPos(tr, 0), pF = trackPos(tr, drag ? tr.len : 0);
    for (const [p, chk] of [[p0, !drag], [pF, true]]) {
      const ln = new THREE.Mesh(new THREE.PlaneGeometry(1.4, W), new THREE.MeshBasicMaterial({ map: chk ? checkTex() : null, color: chk ? 0xffffff : 0xffffff }));
      ln.rotation.x = -Math.PI / 2; ln.rotation.z = -p.h; ln.position.set(p.x, 0.02, p.z); sc.add(ln);
    }
    const gan = new THREE.Group(), gm = new THREE.MeshStandardMaterial({ color: 0x2a2d33, metalness: 0.5, roughness: 0.5 });
    for (const s of [-1, 1]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, 6, 0.4), gm); post.position.set(0, 3, s * (W / 2 + 1)); gan.add(post); }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, W + 2.4), gm); beam.position.y = 6; gan.add(beam);
    this.lights = [];
    for (let k = 0; k < 5; k++) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0x000000 })); l.position.set(0.35, 6, (k - 2) * 0.9); gan.add(l); this.lights.push(l); }
    gan.position.set(p0.x + Math.cos(p0.h) * 3, 0, p0.z + Math.sin(p0.h) * 3); gan.rotation.y = -p0.h; sc.add(gan);
    // grandstand by the start, trees around
    const stand = new THREE.Mesh(new THREE.BoxGeometry(30, 5, 8), new THREE.MeshStandardMaterial({ color: 0x4b5563, roughness: 0.8 }));
    stand.position.set(p0.x - Math.sin(p0.h) * (W / 2 + 12) + 5, 2.5, p0.z + Math.cos(p0.h) * (W / 2 + 12)); stand.rotation.y = -p0.h; sc.add(stand);
    const crowd = new THREE.Mesh(new THREE.BoxGeometry(29, 0.8, 7), new THREE.MeshStandardMaterial({ map: crowdTex(), roughness: 1 })); crowd.position.copy(stand.position).setY(5.3); crowd.rotation.y = stand.rotation.y; sc.add(crowd);
    const nT = this.g.tier === 'low' ? 60 : 160;
    const cone = new THREE.InstancedMesh(new THREE.ConeGeometry(2.2, 7, 7), new THREE.MeshStandardMaterial({ color: '#2f6b35', roughness: 0.9 }), nT);
    const m4 = new THREE.Matrix4(); let placed = 0, tries = 0;
    let seed = 1234; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    while (placed < nT && tries++ < nT * 20) {
      const x = cx + (rnd() - 0.5) * (maxx - minx + 220), z = cz + (rnd() - 0.5) * (maxz - minz + 220);
      let near = false; for (let i = 0; i < tr.n; i += 4) if (Math.hypot(tr.x[i] - x, tr.z[i] - z) < W / 2 + 9) { near = true; break; }
      if (near) continue;
      const s = 0.7 + rnd() * 0.8; m4.compose(new THREE.Vector3(x, 3.5 * s, z), new THREE.Quaternion(), new THREE.Vector3(s, s, s)); cone.setMatrixAt(placed++, m4);
    }
    cone.count = placed; cone.castShadow = this.r.shadowMap.enabled; sc.add(cone);
    // the cars
    const len = (t) => (classOf(t).id === 'kart' ? 2.2 : 4.6);
    this.meCar = carModel(this.o.car.t, len(this.o.car.t)); sc.add(this.meCar);
    this.rvCar = carModel(this.run.rivalCar.t, len(this.run.rivalCar.t));
    if (this.run.type === 'time') this.rvCar.traverse((m) => { if (m.isMesh) { m.material = m.material.clone(); m.material.transparent = true; m.material.opacity = 0.35; m.material.depthWrite = false; m.castShadow = false; } });
    sc.add(this.rvCar);
    this.flame = new THREE.Mesh(new THREE.ConeGeometry(0.25, 1.6, 10), new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.flame.rotation.z = Math.PI / 2; this.flame.visible = false; sc.add(this.flame);
    this.W = W;
  }
  laneOff(r) { return this.run.type === 'time' ? 0 : r.lane * (this.run.tr.loop ? 2.2 : 3); }
  place(car, r) {
    const p = trackPos(this.run.tr, r.s, this.laneOff(r)), q = trackPos(this.run.tr, r.s + 1.5, this.laneOff(r));
    car.position.set(p.x, 0.02, p.z); car.rotation.y = -Math.atan2(q.z - p.z, q.x - p.x);
  }
  action() {
    if (this.run.state === 'done') return;
    const r = this.run.input('action');
    if (!r) return;
    if (r === 'boost') { this.flash('BOOST!', 'boost'); try { sfx.go?.(); } catch {} }
    else { this.flash({ perfect: 'Cambio perfetto!', good: 'Buon cambio', early: 'Troppo presto!' }[r] || '', r); try { (r === 'early' ? sfx.bad : sfx.tick)?.(); } catch {} }
  }
  skip() { if (this.run.state !== 'done') { this.run.runToEnd(); } }
  flash(text, cls) { const el = this.hud.querySelector('.ofr-flash'); if (!el) return; el.textContent = text; el.className = 'ofr-flash on ' + (cls || ''); clearTimeout(this._ft); this._ft = setTimeout(() => { el.className = 'ofr-flash'; }, 700); }
  drawHud() {
    const ev = this.o.ev, T = RACE_TYPES[ev.type], G = GRADES[this.o.grade - 1], me = carDef(this.o.car.t), rv = carDef(this.run.rivalCar.t);
    this.hud.innerHTML = `<div class="ofr">
      <div class="ofr-top"><div class="ofr-ev"><b>${ev.name}</b><span>${T.name} · <i style="color:${G.color}">${G.name}</i> · ${this.run.tr.name}</span></div>
        <div class="ofr-t"><b class="ofr-time">0,00 s</b><span class="ofr-gap"></span></div>
        <button class="btn ghost ofr-skip" data-rk="skip" type="button">Salta ›</button></div>
      <div class="ofr-bar"><i class="me"></i><i class="rv"></i></div>
      <div class="ofr-names"><span class="me">${me.name}</span><span class="rv">${rv.name} · ${rv.team}</span></div>
      <div class="ofr-count"></div><div class="ofr-flash"></div>
      <div class="ofr-bottom">
        <div class="ofr-speed"><b>0</b><span>km/h</span></div>
        ${ev.type === 'drag' ? `<div class="ofr-rpm"><div class="ofr-rpm-bar"><i></i><em></em></div><div class="ofr-gear">Marcia <b>1</b></div></div>
          <button class="ofr-btn" data-rk="act" type="button"><b>CAMBIA</b><span>Spazio · tocca</span></button>`
        : `<div class="ofr-ers"><span>Boost ibrido</span><div class="ofr-ers-c"></div></div><button class="ofr-btn boost" data-rk="act" type="button"><b>BOOST</b><span>Spazio · tocca</span></button>`}
      </div></div>`;
    this.hud.querySelector('[data-rk=act]')?.addEventListener('pointerdown', (e) => { e.preventDefault(); this.action(); });
    this.hud.querySelector('[data-rk=skip]')?.addEventListener('click', () => this.skip());
    const q = (s) => this.hud.querySelector(s);
    this.el = { time: q('.ofr-time'), gap: q('.ofr-gap'), me: q('.ofr-bar .me'), rv: q('.ofr-bar .rv'), count: q('.ofr-count'), speed: q('.ofr-speed b'), rpm: q('.ofr-rpm-bar i'), zone: q('.ofr-rpm-bar em'), gear: q('.ofr-gear b'), ers: q('.ofr-ers-c'), btn: q('[data-rk=act]') };
  }
  updateHud() {
    const R = this.run, me = R.me, rv = R.rival, E = this.el;
    E.time.textContent = fmtS(R.state === 'done' && me.done ? me.finishT : R.t);
    E.me.style.left = `${Math.min(100, (me.s / me.total) * 100)}%`; E.rv.style.left = `${Math.min(100, (rv.s / rv.total) * 100)}%`;
    const d = me.s - rv.s; E.gap.textContent = R.state === 'race' ? (d >= 0 ? `+${d.toFixed(0)} m` : `${d.toFixed(0)} m`) : '';
    E.gap.className = 'ofr-gap ' + (d >= 0 ? 'ahead' : 'behind');
    E.speed.textContent = Math.round(me.v * 3.6);
    if (R.state === 'grid') {
      const c = R.countdown, n = Math.ceil(c / 0.6);
      E.count.textContent = R.type === 'time' ? 'Giro lanciato…' : n <= 4 ? '●'.repeat(Math.max(0, 5 - n)) : '';
      E.count.className = 'ofr-count on';
      const lit = R.type === 'time' ? 0 : Math.max(0, Math.min(5, 5 - n + 1));
      this.lights.forEach((l, k) => { l.material.emissive.setHex(k < lit ? 0xff1010 : 0x000000); l.material.emissiveIntensity = 2; });
      if (lit !== this.beeps && R.type !== 'time') { this.beeps = lit; try { sfx.beep?.(); } catch {} }
    } else if (R.state === 'race' && R.t < 0.9) { E.count.textContent = 'VIA!'; E.count.className = 'ofr-count on go'; this.lights.forEach((l) => l.material.emissive.setHex(0x000000)); if (!this._went) { this._went = true; try { sfx.go?.(); } catch {} } }
    else E.count.className = 'ofr-count';
    if (E.rpm) {
      const r = me.rpm(); E.rpm.style.width = `${Math.min(100, r * 100)}%`; E.rpm.className = r >= 0.86 ? 'hot' : '';
      E.gear.textContent = me.gear; E.btn.classList.toggle('ready', r >= 0.86 && me.gear < me.P.gears);
    }
    if (E.ers) { E.ers.innerHTML = Array.from({ length: Math.max(me.ers, 0) + (me.boostT > 0 ? 1 : 0) }, (_, k) => `<i class="${k === 0 && me.boostT > 0 ? 'live' : ''}"></i>`).join('') || '<small>esaurito</small>'; E.btn.classList.toggle('ready', me.ers > 0 && me.boostT <= 0 && R.state === 'race'); }
  }
  loop(now) {
    if (this.dead) return;
    this.raf = requestAnimationFrame(this.loop);
    let dt = Math.min(0.1, (now - this.last) / 1000); this.last = now;
    if (document.hidden) return;
    // fixed sub-steps: same physics whatever the frame rate
    this.acc = (this.acc || 0) + dt;
    while (this.acc >= 1 / 60) { this.run.step(1 / 60); this.acc -= 1 / 60; }
    const R = this.run;
    this.place(this.meCar, R.me); this.place(this.rvCar, R.rival);
    const boosting = R.me.boostT > 0; this.flame.visible = boosting;
    if (boosting) { const b = trackPos(R.tr, R.me.s - 2.6, this.laneOff(R.me)); this.flame.position.set(b.x, 0.6, b.z); this.flame.rotation.set(0, -b.h, Math.PI / 2); this.flame.scale.set(1, 0.8 + Math.random() * 0.5, 1); }
    // chase camera
    const me = R.me, p = trackPos(R.tr, me.s, this.laneOff(me)), ahead = trackPos(R.tr, me.s + 14, this.laneOff(me) * 0.5);
    const portrait = this.g.root.clientHeight > this.g.root.clientWidth;
    const back = R.tr.loop ? (portrait ? 13 : 10) : (portrait ? 16 : 12), up = R.tr.loop ? 4.2 : 4.8;
    const want = new THREE.Vector3(p.x - Math.cos(p.h) * back + (R.tr.loop ? 0 : -Math.sin(p.h) * -6), up, p.z - Math.sin(p.h) * back + (R.tr.loop ? 0 : Math.cos(p.h) * 6));
    if (!this.camInit) { this.cam.position.copy(want); this.camInit = true; } else this.cam.position.lerp(want, Math.min(1, dt * 4));
    this.cam.lookAt(ahead.x, 0.8, ahead.z);
    this.sun.position.set(p.x - 40, 80, p.z + 30); this.sun.target.position.set(p.x, 0, p.z);
    const w = this.g.root.clientWidth, h = this.g.root.clientHeight;
    if (w !== this._w || h !== this._h) { this._w = w; this._h = h; this.r.setSize(w, h, false); this.cam.aspect = w / h; this.cam.fov = portrait ? 70 : 55; this.cam.clearViewOffset(); this.cam.updateProjectionMatrix(); }
    try { engineSet(Math.min(1, me.v / Math.max(1, me.P.vtop)), R.type === 'drag' ? { rpm: R.state === 'race' ? me.rpm() : 0.1, throttle: R.state === 'race' && me.lag <= 0 ? 1 : 0.2 } : {}); } catch {}
    this.updateHud();
    this.r.render(this.scene, this.cam);
    if (R.state === 'done' && !this.ended) {
      this.ended = true; try { engineStop(); } catch {}
      setTimeout(() => { if (!this.dead) this.o.onEnd?.(R.result); }, 900);
    }
  }
  destroy() {
    if (this.dead) return; this.dead = true;
    cancelAnimationFrame(this.raf); window.removeEventListener('keydown', this.onKey, true); this.g.cv.removeEventListener('pointerdown', this.onTap);
    try { engineStop(); } catch {}
    this.scene.traverse((m) => { if ((m.isMesh || m.isInstancedMesh) && !m.parent?.isGroup) { m.geometry?.dispose?.(); } });
    for (const c of [this.meCar, this.rvCar]) this.scene.remove(c);
    this.hud.innerHTML = '';
    this.g.paused = false; this.g.labels.style.display = ''; this.g._w = 0; this.g.resize();
  }
}

// flat strip along a race track (lateral offset off, width w); repeatU: kerb texture repeat along the length
function strip(tr, w, mat, off = 0, y = 0, repeatU = false) {
  const n = tr.n, closed = tr.loop, pos = [], uv = [], idx = [];
  const N = closed ? n + 1 : n;
  for (let k = 0; k < N; k++) {
    const i = k % n, h = tr.h[i], nx = -Math.sin(h), nz = Math.cos(h);
    for (const sd of [-1, 1]) { pos.push(tr.x[i] + nx * (off + sd * w / 2), y, tr.z[i] + nz * (off + sd * w / 2)); uv.push(repeatU ? k / 2 : k / 20, sd < 0 ? 0 : 1); }
    if (k < N - 1) { const a = k * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  mat.side = THREE.DoubleSide;
  const m = new THREE.Mesh(g, mat); m.receiveShadow = true; return m;
}
let _kt, _ct, _cr;
function kerbTex() { if (_kt) return _kt; const c = document.createElement('canvas'); c.width = 32; c.height = 8; const g = c.getContext('2d'); g.fillStyle = '#e3262f'; g.fillRect(0, 0, 16, 8); g.fillStyle = '#fff'; g.fillRect(16, 0, 16, 8); _kt = new THREE.CanvasTexture(c); _kt.wrapS = THREE.RepeatWrapping; _kt.colorSpace = THREE.SRGBColorSpace; return _kt; }
function checkTex() { if (_ct) return _ct; const c = document.createElement('canvas'); c.width = 16; c.height = 64; const g = c.getContext('2d'); for (let y = 0; y < 16; y++) for (let x = 0; x < 4; x++) { g.fillStyle = (x + y) % 2 ? '#111' : '#fff'; g.fillRect(x * 4, y * 4, 4, 4); } _ct = new THREE.CanvasTexture(c); _ct.colorSpace = THREE.SRGBColorSpace; _ct.magFilter = THREE.NearestFilter; return _ct; }
function crowdTex() { if (_cr) return _cr; const c = document.createElement('canvas'); c.width = 256; c.height = 32; const g = c.getContext('2d'); const cols = ['#e3262f', '#ffd23f', '#2f80ff', '#ffffff', '#1d1d1d', '#ff8a00', '#2ecc71']; for (let i = 0; i < 600; i++) { g.fillStyle = cols[i % cols.length]; g.fillRect((i * 37) % 256, (i * 13) % 32, 3, 3); } _cr = new THREE.CanvasTexture(c); _cr.colorSpace = THREE.SRGBColorSpace; return _cr; }
