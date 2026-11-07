// "Scontro Totale": drivable demolition racing with real rigid-body physics (Rapier).
// Arcade-tuned raycast vehicles (gearbox, weight transfer, handbrake power-slides, counter-steer
// assist, air control), destructible props, deformable cars with parts and wheels that fly off,
// cracking windscreens, nitro and points earned by crashing, slow motion on big hits, a replay of
// the best crash, AI with personalities that races and rams, and a last-car-standing derby arena.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { applyHDRI, makeComposer, hdriSun, hdriHorizon, applyFilterSettings, FILTER_PRESETS } from '../ui/gfx.js';
import { engineStart, engineSet, engineStop, sfx } from '../ui/audio.js';
import { getSettings, setSettings } from '../engine/state.js';
import { buildTrack, buildTerrain, buildRacingLine, buildWater, SURFACES } from './tracks.js';
import { buildBanger, dent, crackGlass, BANGERS, AI_COLORS } from './cars.js';
import { Particles, SkidMarks } from './fx.js';
import { aiInput, initAI } from './ai.js';
import { buildGround, buildWaterMeshes, buildScenery, buildTrees } from './scenery.js';
import { buildHud, updateHud, message, showResults } from './hud.js';
import { CHAMPIONSHIP, champRecord } from './champ.js';

let rapierReady = null;
export function initPhysics() { return (rapierReady ||= RAPIER.init()); }

const AI_NAMES = ['Brutto Bruno', 'Ivo Lamiera', 'Rosa Ruggine', 'Tino Testacoda', 'Gigi Guardrail', 'Nina Nitro', 'Sandro Sfascio', 'Carla Carburatore', 'Dario Derapata', 'Mirko Marmitta', 'Lea Lamierino'];
const ENGINE_GEARS = { formula: 8, endurance: 7, rally: 6 }; // gear count of the synth presets (see ui/audio.js)
const tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0);
const G_CAR = 0x0002, G_GHOST = 0x0004;
const GROUPS_CAR = (G_CAR << 16) | 0xffff, GROUPS_GHOST = (G_GHOST << 16) | (0xffff & ~G_CAR & ~G_GHOST);
const wrap = (d) => { while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
const CRASH_KINDS = {
  tbone: { label: 'T-BONE!', pts: 300, nitro: 22 },
  frontale: { label: 'FRONTALE!', pts: 220, nitro: 16 },
  tampon: { label: 'TAMPONAMENTO!', pts: 120, nitro: 10 },
  sportellata: { label: 'SPORTELLATA!', pts: 90, nitro: 8 },
  retro: { label: 'RETROMARCIA KILLER!', pts: 200, nitro: 14 },
};

export class DerbyGame {
  constructor(container, opts) {
    this.c = container; this.o = { opponents: 7, laps: null, ...opts };
    this.venue = typeof opts.venue === 'string' ? null : opts.venue; this.low = getSettings().gfx === 'low';
    this.keys = {}; this.time = 0; this.state = 'loading'; this.msgs = [];
    this.onEnd = opts.onEnd || (() => {});
    this.timeScale = 1; this.slowT = 0; this.slowCool = 0; this.shake = 0;
    this.simStats = { stuck: 0, respawn: 0, respawnWhy: {}, wrecks: 0, crashes: 0, props: 0 };
  }

  async start() {
    if (!this.venue) { const { VENUES } = await import('./tracks.js'); this.venue = VENUES.find((v) => v.id === this.o.venue) || VENUES[0]; }
    await initPhysics();
    this.track = buildTrack(this.venue);
    this.water = buildWater(this.venue, this.track);
    this.terrain = buildTerrain(this.venue, this.track, this.water);
    this.line = this.track.arena ? null : buildRacingLine(this.track, this.venue);
    this.surface = SURFACES[this.venue.surface] || SURFACES.dirt;
    this.setupRenderer();
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.events = new RAPIER.EventQueue(true);
    this.handles = new Map();
    // physics heightfield
    const T = this.terrain;
    const hf = RAPIER.ColliderDesc.heightfield(T.nr, T.nc, T.H, { x: T.sx, y: 1, z: T.sz }).setTranslation(T.cx, 0, T.cz).setFriction(1.0).setRestitution(0.05);
    this.groundCol = this.world.createCollider(hf); this.handles.set(this.groundCol.handle, { kind: 'ground' });
    buildGround(this); buildWaterMeshes(this); buildScenery(this);
    this.buildProps();
    buildTrees(this);
    this.buildCars();
    buildHud(this);
    this.bindInput();
    await this.envReady;
    this.state = 'countdown'; this.countdown = 3.6; this._lastCount = 4;
    try { engineStart(this.player.spec.engine || 'endurance'); } catch {}
    this.last = performance.now();
    const loop = (t) => { if (this.dead) return; this.raf = requestAnimationFrame(loop); const dt = Math.min(0.05, (t - this.last) / 1000); if (dt > 0) { this.frame(dt); this.last = t; } };
    this.raf = requestAnimationFrame(loop);
  }

  destroy() {
    this.dead = true; cancelAnimationFrame(this.raf); try { engineStop(); } catch {}
    window.removeEventListener('keydown', this._kd); window.removeEventListener('keyup', this._ku); window.removeEventListener('resize', this._rs);
    this.renderer?.dispose(); this.world?.free?.();
    this.c.innerHTML = '';
  }

  // ---------------------------------------------------------------- rendering setup
  setupRenderer() {
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: !this.low, powerPreference: 'high-performance' });
    r.setPixelRatio(this.low ? 1 : Math.min(1.5, window.devicePixelRatio || 1));
    r.shadowMap.enabled = true; r.shadowMap.type = this.low ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0; r.outputColorSpace = THREE.SRGBColorSpace;
    this.c.appendChild(r.domElement); Object.assign(r.domElement.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' });
    const s = this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 3000);
    const kind = this.venue.sky || 'day', night = kind === 'night';
    s.fog = new THREE.FogExp2(night ? 0x10141c : 0xc9c2b2, night ? 0.0032 : 0.0024);
    this.hemi = new THREE.HemisphereLight(night ? 0x8090b0 : 0xdde8ff, night ? 0x2a241c : 0x6b5a40, night ? 0.35 : 0.6); s.add(this.hemi);
    const sun = this.sun = new THREE.DirectionalLight(night ? 0xe8efff : 0xfff0d8, night ? 1.6 : kind === 'dusk' ? 2.2 : 2.8);
    sun.castShadow = true; const sm = this.low ? 1024 : 2048; sun.shadow.mapSize.set(sm, sm);
    Object.assign(sun.shadow.camera, { left: -48, right: 48, top: 48, bottom: -48, near: 1, far: 400 }); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
    s.add(sun); s.add(sun.target);
    this.sunDir = night ? new THREE.Vector3(0.25, 0.9, 0.3).normalize() : new THREE.Vector3(0.5, 0.8, 0.35).normalize();
    this.envReady = applyHDRI(r, s, kind, { intensity: night ? 0.6 : 0.9 }).then(() => {
      const sd = hdriSun(kind); if (sd && !night) { this.sunDir.copy(sd); this.sunDir.y = Math.max(0.42, this.sunDir.y); this.sunDir.normalize(); }
      const hz = hdriHorizon(kind); if (hz && !night) s.fog.color.copy(hz).lerp(new THREE.Color(0xcab89a), 0.35);
    }).catch(() => {});
    this.composer = makeComposer(r, s, this.camera, { bloom: night ? 0.45 : 0.28, low: this.low, ao: !this.low });
    this._rs = () => this.resize(); window.addEventListener('resize', this._rs); this.resize();
    const L = this.low ? 0.6 : 1;
    this.dust = new Particles(s, Math.round(2600 * L), { gravity: -0.25, drag: 1.1, grow: 3.2, tex: 'puff', spin: 0.6 });
    this.smoke = new Particles(s, Math.round(1100 * L), { gravity: -2.4, drag: 0.7, grow: 3.4, tex: 'puff', spin: 0.8 });
    this.fire = new Particles(s, 700, { additive: true, gravity: -4.5, drag: 1.5, grow: -0.35, tex: 'puff', spin: 2 });
    this.sparks = new Particles(s, 900, { additive: true, gravity: 9, drag: 0.6, grow: -0.6, sizeScale: 0.5 });
    this.chips = new Particles(s, 700, { gravity: 14, drag: 0.4, grow: 0, sizeScale: 0.35, tex: 'chip', spin: 14, fog: true });
    this.splash = new Particles(s, 900, { gravity: 9.5, drag: 0.6, grow: 1.6, tex: 'puff', spin: 1 });
    this.skids = new SkidMarks(s, 4500, this.venue.surface === 'asphalt' ? [0.04, 0.04, 0.04] : [0.12, 0.09, 0.06]);
  }
  resize() { const w = this.c.clientWidth || 1280, h = this.c.clientHeight || 720; this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.composer?.setSize(w, h); }

  // ---------------------------------------------------------------- destructible props
  buildProps() {
    const tr = this.track, T = this.terrain, s = this.scene, v = this.venue;
    const canvas = (draw, w = 256, h = 256) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
    const barrelTex = canvas((g, w, h) => { g.fillStyle = '#b3261e'; g.fillRect(0, 0, w, h); g.fillStyle = '#ddd'; g.fillRect(0, h * 0.2, w, 10); g.fillRect(0, h * 0.75, w, 10); for (let i = 0; i < 30; i++) { g.fillStyle = 'rgba(90,40,20,0.6)'; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 4 + Math.random() * 14, 0, 7); g.fill(); } });
    const woodTex = canvas((g, w, h) => { g.fillStyle = '#9a7247'; g.fillRect(0, 0, w, h); for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? '#8a6540' : '#a57b4d'; g.fillRect(0, i * h / 6, w, h / 6 - 3); } g.strokeStyle = '#5a4128'; g.lineWidth = 8; g.strokeRect(4, 4, w - 8, h - 8); g.beginPath(); g.moveTo(0, 0); g.lineTo(w, h); g.stroke(); });
    const hayTex = canvas((g, w, h) => { g.fillStyle = '#c8a34f'; g.fillRect(0, 0, w, h); for (let i = 0; i < 900; i++) { g.strokeStyle = `rgba(${150 + Math.random() * 80},${110 + Math.random() * 60},40,0.7)`; g.beginPath(); const x = Math.random() * w, y = Math.random() * h; g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 20, y + (Math.random() - 0.5) * 6); g.stroke(); } });
    const fenceTex = canvas((g, w, h) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#d22' : '#f2f2f2'; g.fillRect(i * w / 8, 0, w / 8, h); } g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(0, h - 20, w, 20); }, 256, 64);
    const tyreGeo = (() => { const parts = []; for (let k = 0; k < 3; k++) { const t = new THREE.TorusGeometry(0.3, 0.13, 8, 16); t.rotateX(Math.PI / 2); t.translate(0, -0.25 + k * 0.25, 0); parts.push(t); } return mergeGeos(parts); })();
    const coneGeo = mergeGeos([new THREE.ConeGeometry(0.22, 0.7, 12).translate(0, 0.05, 0), new THREE.BoxGeometry(0.5, 0.06, 0.5).translate(0, -0.3, 0)]);
    const coneTex = canvas((g, w, h) => { g.fillStyle = '#ff5a00'; g.fillRect(0, 0, w, h); g.fillStyle = '#f4f4f4'; g.fillRect(0, h * 0.35, w, h * 0.14); g.fillRect(0, h * 0.62, w, h * 0.1); }, 64, 64);
    this.propTypes = {
      barrel: { geo: new THREE.CylinderGeometry(0.3, 0.3, 0.9, 16), mat: new THREE.MeshStandardMaterial({ map: barrelTex, roughness: 0.6, metalness: 0.4 }), col: () => RAPIER.ColliderDesc.cylinder(0.45, 0.3), mass: 30, half: 0.45, list: [] },
      tyres: { geo: tyreGeo, mat: new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.95 }), col: () => RAPIER.ColliderDesc.cylinder(0.38, 0.43), mass: 45, half: 0.38, list: [] },
      crate: { geo: new THREE.BoxGeometry(1, 1, 1), mat: new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.85 }), col: () => RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5), mass: 35, half: 0.5, list: [] },
      hay: { geo: new THREE.CylinderGeometry(0.75, 0.75, 1.2, 18).rotateZ(Math.PI / 2), mat: new THREE.MeshStandardMaterial({ map: hayTex, roughness: 1 }), col: () => RAPIER.ColliderDesc.cylinder(0.6, 0.75).setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2)), mass: 140, half: 0.75, list: [] },
      fence: { geo: new THREE.BoxGeometry(2.6, 0.9, 0.08), mat: new THREE.MeshStandardMaterial({ map: fenceTex, roughness: 0.7 }), col: () => RAPIER.ColliderDesc.cuboid(1.3, 0.45, 0.04), mass: 16, half: 0.45, list: [] },
      cone: { geo: coneGeo, mat: new THREE.MeshStandardMaterial({ map: coneTex, roughness: 0.6 }), col: () => RAPIER.ColliderDesc.cone(0.36, 0.25), mass: 4, half: 0.36, list: [] },
    };
    const maxProps = this.low ? 300 : 460; let count = 0;
    const place = (type, x, z, yaw = 0, dy = 0) => {
      if (count >= maxProps) return; count++;
      const P = this.propTypes[type]; const y = T.heightAt(x, z);
      const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y + P.half + 0.02 + dy, z).setRotation(new THREE.Quaternion().setFromAxisAngle(UP, yaw)).setLinearDamping(0.3).setAngularDamping(0.5).setCanSleep(true));
      const col = this.world.createCollider(P.col().setMass(P.mass).setFriction(0.8).setRestitution(0.15), body);
      body.sleep(); body.userData = { type, hit: false };
      P.list.push(body); this.handles.set(col.handle, { kind: 'prop', type, body });
    };
    if (tr.arena) {
      for (let k = 0; k < 90; k++) { const a = (k / 90) * Math.PI * 2; place('tyres', T.cx + Math.cos(a) * (tr.R - 1), T.cz + Math.sin(a) * (tr.R - 1)); }
      for (let k = 0; k < 30; k++) { const a = Math.random() * 6.28, r = 8 + Math.random() * tr.R * 0.65; place(['barrel', 'crate', 'hay'][k % 3], T.cx + Math.cos(a) * r, T.cz + Math.sin(a) * r, Math.random() * 3); }
    } else {
      const hw = tr.width / 2;
      // barrels before every jump kicker; cones marking the crossings
      for (const jp of tr.jumps) { const i = Math.floor(jp * tr.N) - 14; const p = tr.pts[(i + tr.N) % tr.N]; const nx = -Math.sin(p.h), nz = Math.cos(p.h); for (const o of [-hw - 1.5, hw + 1.5]) for (let q = 0; q < 2; q++) place('barrel', p.x + nx * (o + Math.sign(o) * q * 0.7), p.z + nz * (o + Math.sign(o) * q * 0.7)); }
      for (const ci of tr.crossings) for (let q = -3; q <= 3; q++) { if (!q) continue; const p = tr.pts[(ci + q * 3 + tr.N) % tr.N]; for (const o of [-hw - 0.8, hw + 0.8]) place('cone', p.x - Math.sin(p.h) * o, p.z + Math.cos(p.h) * o); }
      for (let i = 0; i < tr.N; i += 2) {
        const p = tr.pts[i], k = p.k, nx = -Math.sin(p.h), nz = Math.cos(p.h);
        const outside = k > 0 ? -1 : 1;
        if (tr.crossings.some((c) => Math.min(Math.abs(c - i), tr.N - Math.abs(c - i)) < 14)) continue;
        // tyre walls on the outside of the sharpest corners, fences on the others
        const ak = Math.abs(k);
        if (ak > 1 / 70) { const off = outside * (hw + 1.6); place('tyres', p.x + nx * off, p.z + nz * off); }
        else if (ak > 1 / 200 && i % 4 === 0) { const off = outside * (hw + 1.3); place(v.farm ? 'hay' : 'fence', p.x + nx * off, p.z + nz * off, -p.h); }
        if (ak > 1 / 90 && i % 6 === 0) { const off = -outside * (hw + 0.9); place('tyres', p.x + nx * off, p.z + nz * off); }
        if (i % 60 === 30) { const off = outside * (hw + 2.5); for (let q = 0; q < 3; q++) place(q === 1 ? 'hay' : 'barrel', p.x + nx * off + Math.cos(p.h) * q * 1.6, p.z + nz * off + Math.sin(p.h) * q * 1.6); }
        if (i % 90 === 44 && !this.near(tr.jumps, i, 30)) { const off = (Math.random() - 0.5) * hw * 1.1; for (let q = 0; q < 4; q++) place('crate', p.x + nx * off + (q % 2) * 1.05, p.z + nz * off + Math.floor(q / 2) * 1.05, p.h, 0); place('crate', p.x + nx * off + 0.5, p.z + nz * off + 0.5, p.h, 1.0); }
        if (v.farm && i % 70 === 10) { const off = outside * (hw + 3.2); for (let q = 0; q < 3; q++) place('hay', p.x + nx * off + Math.cos(p.h) * q * 1.3, p.z + nz * off + Math.sin(p.h) * q * 1.3, -p.h, q === 1 ? 0 : 0); }
      }
    }
    for (const [k, P] of Object.entries(this.propTypes)) {
      if (!P.list.length) continue;
      const inst = new THREE.InstancedMesh(P.geo, P.mat, P.list.length); inst.castShadow = true; inst.receiveShadow = true; inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      P.inst = inst; s.add(inst); this.syncProps(k, true);
    }
    this.propCount = count;
    this.debris = [];
  }
  near(list, i, dist) { return (list || []).some((jp) => { const d = Math.abs(i - jp * this.track.N); return Math.min(d, this.track.N - d) * this.track.ds < dist; }); }
  syncProps(type, all = false) {
    const P = this.propTypes[type]; if (!P.inst) return; const m = new THREE.Matrix4(); let dirty = false; const one = new THREE.Vector3(1, 1, 1);
    P.list.forEach((b, i) => {
      if (!all && b.isSleeping()) return; const t = b.translation(), r = b.rotation(); m.compose(tmpV.set(t.x, t.y, t.z), tmpQ.set(r.x, r.y, r.z, r.w), one); P.inst.setMatrixAt(i, m); dirty = true;
      if (!all && !b.userData.hit) { const lv = b.linvel(); if (lv.x * lv.x + lv.z * lv.z > 9) { b.userData.hit = true; this.propHit(b, t); } }
    });
    if (dirty) P.inst.instanceMatrix.needsUpdate = true;
  }
  propHit(b, t) {
    this.simStats.props++;
    let best = null, bd = 30;
    for (const c of this.cars) { const p = c.body.translation(); const d = (p.x - t.x) ** 2 + (p.z - t.z) ** 2; if (d < bd) { bd = d; best = c; } }
    if (!best) return;
    best.score = (best.score || 0) + 10; best.nitro = Math.min(100, best.nitro + 1.5);
    if (best.isPlayer) { this.propCombo = (this.time - (this.propComboT || -9) < 1.5 ? (this.propCombo || 0) : 0) + 1; this.propComboT = this.time; if (this.propCombo === 4 || this.propCombo === 10 || this.propCombo === 20) this.message(`Distruzione x${this.propCombo}!`, 'bonus', `+${this.propCombo * 10} punti`); }
    if (b.userData.type === 'barrel' || b.userData.type === 'crate') for (let k = 0; k < 6; k++) this.chips.emit(t.x, t.y + 0.3, t.z, (Math.random() - 0.5) * 6, 2 + Math.random() * 4, (Math.random() - 0.5) * 6, 1.2, 0.22, b.userData.type === 'crate' ? 0.55 : 0.7, b.userData.type === 'crate' ? 0.4 : 0.15, 0.2, 1);
    if (b.userData.type === 'hay') for (let k = 0; k < 10; k++) this.dust.emit(t.x, t.y + 0.5, t.z, (Math.random() - 0.5) * 4, 1 + Math.random() * 2, (Math.random() - 0.5) * 4, 1.6, 0.8, 0.82, 0.68, 0.36, 0.5);
  }

  // ---------------------------------------------------------------- cars
  buildCars() {
    const tr = this.track, T = this.terrain;
    const nAI = this.o.opponents;
    const player = BANGERS.find((b) => b.id === this.o.car) || BANGERS[0];
    this.cars = [];
    const grid = [];
    for (let k = 0; k <= nAI; k++) {
      if (tr.arena) { const a = (k / (nAI + 1)) * Math.PI * 2; grid.push({ x: T.cx + Math.cos(a) * tr.R * 0.75, z: T.cz + Math.sin(a) * tr.R * 0.75, yaw: a + Math.PI }); }
      else { const i = (tr.N - 8 - Math.floor(k / 2) * 4) % tr.N; const p = tr.pts[i], nx = -Math.sin(p.h), nz = Math.cos(p.h), lat = (k % 2 ? -1 : 1) * tr.width * 0.22; grid.push({ x: p.x + nx * lat, z: p.z + nz * lat, yaw: p.h, idx: i }); }
    }
    // player starts at the back of the grid in races (comeback drive), anywhere in the derby
    const order = tr.arena ? [0, ...Array.from({ length: nAI }, (_, i) => i + 1)] : [nAI, ...Array.from({ length: nAI }, (_, i) => i)];
    for (let k = 0; k <= nAI; k++) {
      const isP = k === 0;
      const spec = isP ? player : BANGERS[(k * 3 + 1) % BANGERS.length];
      const color = isP ? (this.o.color || spec.color) : AI_COLORS[(k - 1) % AI_COLORS.length];
      const g = grid[order[k]];
      const car = this.makeCar({ spec, color, num: isP ? 1 : k + 1, name: isP ? (this.o.playerName || 'Tu') : AI_NAMES[(k - 1) % AI_NAMES.length], isPlayer: isP, pos: g, skill: 0.8 + ((k * 0.37) % 1) * 0.2 });
      if (!isP) initAI(car, k);
      this.cars.push(car);
    }
    this.player = this.cars[0];
    if (getSettings().dzMarker !== false) {
      const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(-0.55, 0.7); sh.lineTo(-0.2, 0.7); sh.lineTo(-0.2, 1.3); sh.lineTo(0.2, 1.3); sh.lineTo(0.2, 0.7); sh.lineTo(0.55, 0.7); sh.closePath();
      const arrow = new THREE.Mesh(new THREE.ShapeGeometry(sh), new THREE.MeshBasicMaterial({ color: 0xffd400, transparent: true, opacity: 0.9, depthTest: false, side: THREE.DoubleSide }));
      arrow.renderOrder = 10; this.marker = arrow; this.scene.add(arrow);
    }
    this.rec = []; this.replay = null; this.bestCrash = null;
  }

  makeCar({ spec, color, num, name, isPlayer, pos, skill }) {
    const mesh = buildBanger(spec.id, color, num, num * 31 + 7); this.scene.add(mesh);
    const { L, W } = mesh.userData.dims; const T = this.terrain;
    const y = T.heightAt(pos.x, pos.z) + 0.45;
    const rot = new THREE.Quaternion().setFromAxisAngle(UP, -pos.yaw);
    const m = spec.mass;
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(pos.x, y, pos.z).setRotation(rot).setCanSleep(false).setLinearDamping(0.06).setAngularDamping(0.9).setCcdEnabled(true)
      .setAdditionalMassProperties(m, { x: 0, y: spec.comY ?? -0.25, z: 0 }, { x: m * 0.42, y: m * 2.1, z: m * 1.9 }, { x: 0, y: 0, z: 0, w: 1 }));
    const col = this.world.createCollider(RAPIER.ColliderDesc.cuboid(L - 0.05, 0.38, W - 0.03).setTranslation(0, 0.55, 0).setMass(60).setFriction(0.35).setRestitution(0.12)
      .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(9000).setCollisionGroups(GROUPS_CAR), body);
    const cab = this.world.createCollider(RAPIER.ColliderDesc.cuboid(0.9, 0.25, W - 0.18).setTranslation(-0.2, 1.15, 0).setMass(20).setFriction(0.3).setCollisionGroups(GROUPS_CAR)
      .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(12000), body);
    const vc = this.world.createVehicleController(body);
    const wr = mesh.userData.wr;
    mesh.userData.wheelPos.forEach(([x, z]) => vc.addWheel({ x, y: wr + 0.12, z }, { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 1 }, 0.3, wr));
    const slip = (this.venue.surface === 'asphalt' ? 1.35 : this.venue.surface === 'mud' ? 0.88 : 1.05) * spec.grip;
    for (let i = 0; i < 4; i++) { vc.setWheelSuspensionStiffness(i, 30); vc.setWheelSuspensionCompression(i, 3.2); vc.setWheelSuspensionRelaxation(i, 3.8); vc.setWheelFrictionSlip(i, slip); vc.setWheelMaxSuspensionTravel(i, 0.32); vc.setWheelMaxSuspensionForce?.(i, 90000); vc.setWheelSideFrictionStiffness?.(i, 1.0); }
    const car = { mesh, body, col, cabCol: cab, vc, spec, name, isPlayer, color, num, skill, slip, hp: 100, nitro: isPlayer ? 35 : 30, steer: 0, idx: pos.idx ?? 0, lap: 0, half: false, finished: false, time: 0, wrecks: 0, out: false, flipT: 0, airT: 0, wreckT: 0, lastHit: null, smokeT: 0,
      gear: 1, rpm: 0.1, shiftT: 0, gearLabel: 'N', score: 0, kills: 0, lapStart: 0, lastLap: 0, bestLap: 0, wheelLost: [false, false, false, false], ghostT: 0, accF: 0, accL: 0, lastV: null, burnT: 0, wrongWayT: 0, stuckHintT: 0, rubber: 1, dirtRate: 0 };
    this.handles.set(col.handle, { kind: 'car', car }); this.handles.set(cab.handle, { kind: 'car', car });
    return car;
  }

  // nearest index around a hint, signed lateral offset from the centre line
  lateralOf(x, z, hint) {
    const tr = this.track; let best = hint, bd = 1e9;
    for (let k = -16; k <= 16; k++) { const i = (hint + k + tr.N) % tr.N, q = tr.pts[i]; const d = (q.x - x) ** 2 + (q.z - z) ** 2; if (d < bd) { bd = d; best = i; } }
    const p = tr.pts[best]; return (x - p.x) * -Math.sin(p.h) + (z - p.z) * Math.cos(p.h);
  }
  packMedian() {
    if (this._pmT === this.time) return this._pm; this._pmT = this.time;
    const v = this.cars.filter((c) => !c.finished).map((c) => c.prog || 0).sort((a, b) => a - b); this._pm = v.length ? v[v.length >> 1] : 0; return this._pm;
  }
  stat(kind, car) { this.simStats[kind] = (this.simStats[kind] || 0) + 1; if (car) { const pc = (this.simStats.perCar ||= {}); (pc[car.name] ||= {})[kind] = ((pc[car.name] || {})[kind] || 0) + 1; } }
  requestRespawn(car, why = 'manual') { this.stat('respawn', car); this.simStats.respawnWhy[why] = (this.simStats.respawnWhy[why] || 0) + 1; this.respawn(car); }

  respawn(car) {
    const tr = this.track, T = this.terrain;
    let x, z, yaw;
    if (tr.arena) { const a = Math.random() * 6.28, r = Math.random() * tr.R * 0.5; x = T.cx + Math.cos(a) * r; z = T.cz + Math.sin(a) * r; yaw = Math.random() * 6.28; }
    else {
      // a little behind where we were, on a free spot across the track
      const i = (car.idx - 2 + tr.N) % tr.N, p = tr.pts[i], hw = tr.width / 2 - 2; yaw = p.h;
      let lat = 0, bestFree = -1;
      for (const cand of [0, -hw * 0.5, hw * 0.5, -hw, hw]) {
        const cx = p.x - Math.sin(p.h) * cand, cz = p.z + Math.cos(p.h) * cand;
        let free = 99; for (const o of this.cars) { if (o === car) continue; const op = o.body.translation(); free = Math.min(free, Math.hypot(op.x - cx, op.z - cz)); }
        if (free > bestFree) { bestFree = free; lat = cand; } if (free > 8) break;
      }
      x = p.x - Math.sin(p.h) * lat; z = p.z + Math.cos(p.h) * lat; car.idx = i;
    }
    car.body.setTranslation({ x, y: T.heightAt(x, z) + 0.7, z }, true);
    const q = new THREE.Quaternion().setFromAxisAngle(UP, -yaw); car.body.setRotation(q, true);
    car.body.setLinvel({ x: Math.cos(yaw) * 5, y: 0, z: Math.sin(yaw) * 5 }, true); car.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    car.flipT = 0; car.stuckHintT = 0; car.wrongWayT = 0; if (car.ai) { car.ai.revT = 0; car.ai.stuckT = 0; }
    this.setGhost(car, 2.0);
    for (let i = 0; i < 4; i++) this.skids.break(car.num * 10 + i);
  }
  setGhost(car, t) { car.ghostT = t; car.col.setCollisionGroups(GROUPS_GHOST); car.cabCol.setCollisionGroups(GROUPS_GHOST); }

  // ---------------------------------------------------------------- input
  bindInput() {
    this._kd = (e) => {
      this.keys[e.code] = true;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Backspace'].includes(e.code)) e.preventDefault();
      if (this.state === 'replay') { if (e.code === 'Escape' || e.code === 'Enter') this.stopReplay(); return; }
      if (e.code === 'KeyC') this.cycleCam();
      if (e.code === 'KeyF') { const ks = Object.keys(FILTER_PRESETS); const cur = getSettings().gfxFilter || 'naturale'; const nx = ks[(ks.indexOf(cur) + 1) % ks.length]; setSettings({ gfxFilter: nx }); applyFilterSettings(); this.message(`Filtro: ${FILTER_PRESETS[nx].label}`, 'info'); }
      if (e.code === 'KeyR' && this.state === 'race' && this.player.hp > 0 && !this.player.finished) this.requestRespawn(this.player, 'player');
      if ((e.code === 'KeyT' || e.code === 'Backspace') && !e.repeat) this.restart();
      if ((e.code === 'Escape' || e.code === 'KeyP') && (this.state === 'race' || this.state === 'paused' || this.state === 'countdown')) this.togglePause();
    };
    this._ku = (e) => { this.keys[e.code] = false; };
    window.addEventListener('keydown', this._kd); window.addEventListener('keyup', this._ku);
    this.camMode = 0;
  }
  cycleCam() { this.camMode = (this.camMode + 1) % 4; this.camPos = null; this.message(['Camera: inseguimento', 'Camera: lontana', 'Camera: cofano', 'Camera: paraurti'][this.camMode], 'info'); }
  restart() { const b = this.hud?.root.querySelector('[data-a="dz-restart"]'); if (b) b.click(); }
  readInput() {
    const k = this.keys; let thr = (k.KeyW || k.ArrowUp) ? 1 : 0, brk = (k.KeyS || k.ArrowDown) ? 1 : 0, st = ((k.KeyA || k.ArrowLeft) ? 1 : 0) - ((k.KeyD || k.ArrowRight) ? 1 : 0);
    let hb = k.Space ? 1 : 0, nitro = (k.ShiftLeft || k.ShiftRight || k.KeyN) ? 1 : 0, analog = false, back = !!k.KeyQ;
    const pads = navigator.getGamepads?.() || [];
    for (const gp of pads) {
      if (!gp) continue;
      this.pad = gp;
      const ax = gp.axes[0] || 0; if (Math.abs(ax) > 0.1) { st = -Math.sign(ax) * ((Math.abs(ax) - 0.1) / 0.9) ** 1.3; analog = true; }
      thr = Math.max(thr, gp.buttons[7]?.value || 0); brk = Math.max(brk, gp.buttons[6]?.value || 0);
      if (gp.buttons[0]?.pressed) nitro = 1; if (gp.buttons[1]?.pressed) hb = 1; if (gp.buttons[4]?.pressed) back = true;
      if (gp.buttons[3]?.pressed && !this._padY && this.state === 'race' && this.player.hp > 0) this.requestRespawn(this.player, 'player'); this._padY = gp.buttons[3]?.pressed;
      if (gp.buttons[2]?.pressed && !this._padX) this.cycleCam(); this._padX = gp.buttons[2]?.pressed;
      if (gp.buttons[9]?.pressed && !this._padS && (this.state === 'race' || this.state === 'paused')) this.togglePause(); this._padS = gp.buttons[9]?.pressed;
      if (gp.buttons[8]?.pressed && !this._padB) this.restart(); this._padB = gp.buttons[8]?.pressed;
    }
    this.lookBack = back;
    return { thr, brk, st, hb, nitro, analog };
  }
  rumble(strong, weak, ms) {
    const gp = this.pad; if (!gp?.vibrationActuator) return;
    try { gp.vibrationActuator.playEffect?.('dual-rumble', { startDelay: 0, duration: Math.round(ms), strongMagnitude: Math.min(1, strong), weakMagnitude: Math.min(1, weak) })?.catch?.(() => {}); } catch {}
  }
  togglePause() { if (this.state === 'countdown') { this._pausedFrom = 'countdown'; } this.state = this.state === 'paused' ? (this._pausedFrom || 'race') : (this._pausedFrom = this.state, 'paused'); this.hud.pause.classList.toggle('on', this.state === 'paused'); }
  message(text, kind, sub) { message(this, text, kind, sub); }

  // ---------------------------------------------------------------- driving
  drive(car, inp, dt) {
    const b = car.body, vc = car.vc, s = car.spec;
    b.resetForces(true); b.resetTorques(true); // user forces persist in Rapier: rebuild them every frame
    const r = b.rotation(); const q = tmpQ.set(r.x, r.y, r.z, r.w);
    const fwd = new THREE.Vector3(1, 0, 0).applyQuaternion(q), up = new THREE.Vector3(0, 1, 0).applyQuaternion(q), side = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    const lv = b.linvel(); const vel = new THREE.Vector3(lv.x, lv.y, lv.z);
    const vF = vel.dot(fwd), vLat = vel.dot(side), speed = vel.length();
    const dead = car.hp <= 0, mass = s.mass;
    let grounded = 0; for (let i = 0; i < 4; i++) if (vc.wheelIsInContact(i)) grounded++;
    // weight transfer estimate (smoothed accelerations, used for grip and for the body lean)
    if (car.lastV && dt > 0) { const ax = (vF - car.lastV[0]) / dt, al = (vLat - car.lastV[1]) / dt; car.accF += (Math.max(-25, Math.min(25, ax)) - car.accF) * Math.min(1, dt * 8); const yawR = b.angvel().y; const latA = -yawR * vF; car.accL += (Math.max(-20, Math.min(20, latA + al * 0.3)) - car.accL) * Math.min(1, dt * 8); }
    car.lastV = [vF, vLat];
    // ---- steering: speed sensitive lock + counter-steer assist that aligns the front wheels with the slide
    const f = 1 / (1 + (speed / 24) ** 1.6);
    const lock = s.steer * (0.24 + 0.76 * f);
    const slideAng = speed > 3 && vF > 1.5 ? Math.atan2(vLat, vF) : 0;
    const assist = car.isPlayer ? (inp.analog ? 0.45 : 0.7) : 0.85;
    let tgt = dead ? 0 : inp.st * lock - slideAng * assist * (1 - 0.5 * Math.abs(inp.st));
    tgt = Math.max(-s.steer - 0.08, Math.min(s.steer + 0.08, tgt));
    const rate = (inp.analog ? 9 : s.steerRate) * (Math.abs(tgt) < Math.abs(car.steer) ? 1.7 : 1);
    car.steer += Math.max(-dt * rate, Math.min(dt * rate, tgt - car.steer));
    vc.setWheelSteering(0, car.steer); vc.setWheelSteering(1, car.steer);
    // ---- engine, gearbox, brakes
    const G = s.gears || 4, boost = car.boost;
    const vmax = 46 * s.top * (boost ? 1.16 : 1) * (car.rubber || 1);
    const gTop = (g) => vmax * (g / G) ** 0.8;
    car.shiftT -= dt;
    const aF = Math.abs(vF);
    let rpmT;
    let force = 0, brake = 0;
    car.brakeF = 0;
    if (inp.hold) {
      // on the grid: brakes on, revving allowed
      brake = 90; rpmT = 0.12 + inp.thr * 0.8; car.gearLabel = 'N'; car.boost = false;
    } else if (!dead) {
      if (inp.brk > 0 && (vF < -0.5 || (vF < 1.0 && speed < 2.5) || car.gearLabel === 'R' && vF < 1.5)) {
        // reverse gear
        car.gearLabel = 'R'; force = -inp.brk * 4200 * s.power * Math.max(0, 1 - Math.max(0, -vF) / 14); rpmT = 0.25 + inp.brk * 0.5 * Math.min(1, aF / 14);
      } else {
        while (car.gear < G && aF > gTop(car.gear) * 0.97) { car.gear++; car.shiftT = 0.18; }
        while (car.gear > 1 && aF < gTop(car.gear - 1) * 0.7) car.gear--;
        const lo = car.gear > 1 ? gTop(car.gear - 1) * 0.55 : 0;
        const frac = Math.max(0, Math.min(1, (aF - lo) / (gTop(car.gear) - lo)));
        rpmT = 0.12 + 0.86 * frac;
        car.gearLabel = aF < 0.6 && inp.thr < 0.05 ? 'N' : String(car.gear);
        if (inp.thr > 0) {
          const tq = 0.82 + 0.3 * Math.sin(Math.min(1, frac) * Math.PI * 0.85);
          const gm = 1.5 - 0.6 * (car.gear - 1) / Math.max(1, G - 1);
          force = inp.thr * 8200 * s.power * (mass / 1450) ** 0.6 * gm * tq * Math.max(0, Math.min(1, (1 - aF / vmax) * 7)) * (car.rubber || 1);
          if (car.shiftT > 0) force *= 0.3;
          if (aF < 6 && car.gear === 1) rpmT = Math.max(rpmT, 0.35 + inp.thr * 0.35); // clutch slip at launch
        }
        if (inp.brk > 0) { brake = inp.brk * 7; car.brakeF = inp.brk; }
      }
      car.boost = inp.nitro && car.nitro > 0 && inp.thr > 0.2;
      if (car.boost) { force += 6200 * s.power; car.nitro = Math.max(0, car.nitro - dt * 22); }
      if (grounded < 2 && inp.thr > 0) rpmT = 0.95; // free revving in the air
    } else { brake = 8; rpmT = 0.05; }
    car.rpm += (rpmT - car.rpm) * Math.min(1, dt * (car.shiftT > 0 ? 18 : 7));
    // weight-transfer grip: braking loads the front, throttle unloads it (and can break the rear loose)
    const brakingLoad = Math.max(0, Math.min(1, -car.accF / 9)), accLoad = Math.max(0, Math.min(1, car.accF / 6));
    const drive = s.drive || (s.awd ? 'awd' : 'rwd');
    const hbOn = inp.hb && !dead;
    for (let i = 0; i < 4; i++) {
      const front = i < 2;
      const driven = drive === 'awd' || (drive === 'fwd' ? front : !front);
      const nDriven = drive === 'awd' ? 4 : 2;
      vc.setWheelEngineForce(i, driven && !car.wheelLost[i] ? force / nDriven : 0);
      vc.setWheelBrake(i, inp.hold ? brake : brake * (front ? 0.62 : 0.38) + (hbOn && !front ? 75 : 0));
      let g = car.slip * (front ? (s.frontGrip || 1) : (s.rearGrip || 1));
      g *= front ? 1 + brakingLoad * 0.14 - accLoad * 0.06 : 1 - brakingLoad * 0.1 + accLoad * 0.04;
      if (!front && drive !== 'fwd' && inp.thr > 0.5 && car.gear <= 2 && speed < 22) g *= 1 - (s.powerOver || 0) * inp.thr;
      if (front && drive === 'fwd' && inp.thr > 0.5) g *= 0.94;
      if (!front && hbOn) g *= 0.36;
      if (dead) g *= 0.6;
      if (car.wheelLost[i]) g *= 0.35;
      vc.setWheelFrictionSlip(i, g);
      vc.setWheelSideFrictionStiffness?.(i, !front && hbOn ? 0.55 : 1.0);
    }
    // aero drag, downforce, surface drag (mud, water)
    const p = b.translation();
    const inWater = this.terrain.waterAt(p.x, p.z) > 0.35 && p.y < this.terrain.heightAt(p.x, p.z) + 1.0;
    const sd = (this.surface.drag || 0) * (this.terrain.trackAt(p.x, p.z) > 0.5 ? 1 : 1.6) + (inWater ? 0.12 : 0);
    b.addForce({ x: -vel.x * speed * 0.42 - vel.x * mass * sd, y: -speed * speed * 0.9, z: -vel.z * speed * 0.42 - vel.z * mass * sd }, true);
    car.inWater = inWater;
    // service brakes as a controlled deceleration (Rapier's wheel brake alone is far too grabby)
    if (car.brakeF > 0 && grounded >= 2 && vF > 0.5) { const dec = car.brakeF * mass * 8.6 * Math.min(1.15, this.surface.grip || 1) * Math.min(1, vF / 3); b.addForce({ x: -fwd.x * dec, y: 0, z: -fwd.z * dec }, true); }
    const av = b.angvel();
    if (!grounded) {
      car.airT += dt;
      // heavier than real life so jumps do not float; light air control: steer yaws, throttle/brake pitch,
      // and a gentle self-levelling so most landings happen on the wheels
      b.addForce({ x: 0, y: -mass * 9.81 * 0.4, z: 0 }, true);
      const right = new THREE.Vector3().crossVectors(fwd, UP).normalize();
      const lvl = new THREE.Vector3().crossVectors(up, UP); // axis * sin(angle) towards upright
      const kL = mass * (up.y > 0 ? 2.2 : 0.6);
      b.addTorque({ x: up.x * inp.st * mass * 0.7 + lvl.x * kL - av.x * mass * 0.25, y: up.y * inp.st * mass * 0.7, z: up.z * inp.st * mass * 0.7 + lvl.z * kL - av.z * mass * 0.25 }, true);
      const pitch = (inp.thr - inp.brk) * mass * 0.5; b.addTorque({ x: right.x * pitch, y: 0, z: right.z * pitch }, true);
    } else {
      if (car.airT > 0.35) this.landed(car, car.airT, vel);
      car.airT = 0;
      // handbrake helps rotate the car into a power slide; yaw rate is capped so slides stay catchable
      if (hbOn && speed > 6) { const tq = inp.st * (s.hbYaw || 1) * mass * 3.6 * Math.min(1, speed / 14); b.addTorque({ x: up.x * tq, y: up.y * tq, z: up.z * tq }, true); }
      const yawMax = 2.3 + (hbOn ? 0.8 : 0);
      if (Math.abs(av.y) > yawMax) { const tq = -Math.sign(av.y) * (Math.abs(av.y) - yawMax) * mass * 6; b.addTorque({ x: 0, y: tq, z: 0 }, true); }
      // arcade grip: the velocity slowly follows the nose while sliding (keeps drifts predictable)
      if (grounded >= 3 && Math.abs(slideAng) > 0.06 && speed > 4) {
        const k = (hbOn ? 0.35 : 1.1) * mass * (this.surface.grip || 1);
        b.addForce({ x: -side.x * vLat * k, y: 0, z: -side.z * vLat * k }, true);
      }
    }
    // self-righting when nearly upside down and slow
    if (up.y < 0.25 && speed < 4) car.flipT += dt; else car.flipT = Math.max(0, car.flipT - dt);
    // anti-roll assist so the car does not tip over in normal cornering
    if (grounded >= 2 && up.y > 0.4) { const roll = side.y; b.addTorque({ x: fwd.x * roll * 9000 * (s.roll > 1.2 ? 0.85 : 1), y: fwd.y * roll * 9000, z: fwd.z * roll * 9000 }, true); }
    return { fwd, up, side, speed, vF, vLat, grounded, slideAng };
  }
  landed(car, airT, vel) {
    const b = car.body, av = b.angvel();
    b.setAngvel({ x: av.x * 0.5, y: av.y, z: av.z * 0.5 }, true);
    if (vel.y < -5) b.setLinvel({ x: vel.x, y: vel.y * 0.55, z: vel.z }, true);
    const p = b.translation();
    for (let k = 0; k < Math.min(26, airT * 18); k++) { const a = Math.random() * 6.28; this.dust.emit(p.x + Math.cos(a) * 1.5, p.y - 0.3, p.z + Math.sin(a) * 1.5, Math.cos(a) * 3, 0.8 + Math.random(), Math.sin(a) * 3, 1.6 + Math.random(), 1.4, ...(this.surface.dust || [0.5, 0.5, 0.5]), 0.35); }
    if (airT > 0.7) { const bonus = Math.min(20, airT * 9); this.award(car, bonus, airT > 1.4 ? 'VOLO SPETTACOLARE!' : 'IN VOLO!', Math.round(airT * 60)); }
    if (car.isPlayer) { this.shake = Math.min(1, this.shake + airT * 0.35); this.rumble(airT * 0.5, airT * 0.6, 160); }
  }

  aiInput(car, dt) { return aiInput(this, car, dt); }

  // ---------------------------------------------------------------- damage & events
  award(car, amt, text, pts = 0) { car.nitro = Math.min(100, car.nitro + amt); car.score = (car.score || 0) + pts; if (car.isPlayer && text) this.message(text, 'bonus', `+${Math.round(amt)} nitro${pts ? ` · +${pts} punti` : ''}`); }
  handleContacts(dt) {
    this.events.drainContactForceEvents((e) => {
      const A = this.handles.get(e.collider1()), B = this.handles.get(e.collider2()); if (!A || !B) return;
      const J = e.totalForceMagnitude() * dt;
      if (A.kind === 'car' && B.kind === 'car' && A.car !== B.car) this.carCrash(A.car, B.car, J);
      for (const [me, other] of [[A, B], [B, A]]) {
        if (me.kind !== 'car') continue; const car = me.car; if (car.out && car.hp <= 0 && this.track.arena) continue;
        if (other.kind === 'car' && other.car === car) continue;
        const scale = other.kind === 'ground' ? 0.22 : other.kind === 'prop' ? 0.3 : other.kind === 'wall' ? 0.7 : 1;
        const eff = J * scale; if (eff < 1500) continue;
        const dmg = Math.min(42, (eff - 1500) / (400 * car.spec.armor)) * (this.track.arena ? 0.8 : 1);
        // impact point: contact manifold if available, else along the force direction
        let wp = null;
        try { this.world.contactPair(e.collider1(), e.collider2(), (man) => { if (!wp && man.numSolverContacts?.() > 0) { const c = man.solverContactPoint(0); wp = new THREE.Vector3(c.x, c.y, c.z); } }); } catch {}
        const bt = car.body.translation(), br = car.body.rotation(); const q = new THREE.Quaternion(br.x, br.y, br.z, br.w);
        if (!wp) { const fd = e.maxForceDirection(); wp = new THREE.Vector3(bt.x - fd.x * 1.5, bt.y + 0.5, bt.z - fd.z * 1.5); }
        const local = wp.clone().sub(new THREE.Vector3(bt.x, bt.y, bt.z)).applyQuaternion(q.clone().invert());
        const inward = new THREE.Vector3(-local.x, -local.y * 0.3, -local.z).normalize();
        car.lastImpactT = this.time; const ds = (this.simStats.dmgBy ||= {}); ds[other.kind] = Math.round((ds[other.kind] || 0) + dmg); if (other.kind === 'ground' && this.state === 'race' && this.time > 1 && (this.simStats.gl ||= []).length < 25) { const lv = car.body.linvel(); this.simStats.gl.push([car.name.slice(0, 4), Math.round(eff), Math.round(dmg), +lv.y.toFixed(1), +Math.hypot(lv.x, lv.z).toFixed(0), +(car.dyn?.up.y ?? 1).toFixed(2), car.dyn?.grounded, +this.time.toFixed(1), car.hp | 0]); }
        this.applyDamage(car, dmg, local, inward, other.kind === 'car' ? other.car : null, wp);
        if (eff > 2400) for (let k = 0; k < Math.min(34, eff / 500); k++) this.sparks.emit(wp.x, wp.y, wp.z, (Math.random() - 0.5) * 10, Math.random() * 5, (Math.random() - 0.5) * 10, 0.25 + Math.random() * 0.35, 0.35, 1, 0.75 + Math.random() * 0.2, 0.35, 1);
        if (car.isPlayer && dmg > 3) {
          this.shake = Math.min(1.2, this.shake + dmg / 22); this.rumble(dmg / 22, dmg / 14, 90 + dmg * 9);
          try { if (performance.now() - (this._crashSfx || 0) > 160) { this._crashSfx = performance.now(); sfx.crash(); } } catch {}
        }
      }
    });
  }
  // classify a car-vs-car hit (who hit whom, with which part) and reward the aggressor
  carCrash(a, b, J) {
    const key = a.num < b.num ? a.num * 100 + b.num : b.num * 100 + a.num;
    this.pairCool ||= new Map(); if (this.time - (this.pairCool.get(key) ?? -9) < 0.9) return;
    const pa = a.body.translation(), pb = b.body.translation(), va = a.body.linvel(), vb = b.body.linvel();
    const dx = pb.x - pa.x, dz = pb.z - pa.z, dl = Math.hypot(dx, dz) || 1, nx = dx / dl, nz = dz / dl;
    const ca = va.x * nx + va.z * nz, cb = -(vb.x * nx + vb.z * nz), closing = ca + cb;
    if (closing < 6 || J < 1800) return;
    this.pairCool.set(key, this.time);
    const [att, vic] = ca >= cb ? [a, b] : [b, a];
    const zone = (car, ox, oz) => { const f = car.dyn?.fwd; if (!f) return 'side'; const pc = car.body.translation(); const lx = (ox - pc.x) * f.x + (oz - pc.z) * f.z, lz = (ox - pc.x) * -f.z + (oz - pc.z) * f.x; const { L, W } = car.mesh.userData.dims; return Math.abs(lx) / L > Math.abs(lz) / W ? (lx > 0 ? 'front' : 'rear') : 'side'; };
    const pAtt = att.body.translation(), pVic = vic.body.translation();
    const za = zone(att, pVic.x, pVic.z), zv = zone(vic, pAtt.x, pAtt.z);
    let kind = 'sportellata';
    if (za === 'front' && zv === 'side') kind = 'tbone'; else if (za === 'front' && zv === 'front') kind = 'frontale'; else if (za === 'front' && zv === 'rear') kind = 'tampon'; else if (za === 'rear') kind = 'retro';
    const K = CRASH_KINDS[kind], sev = Math.min(2, closing / 14);
    const pts = Math.round(K.pts * sev);
    this.simStats.crashes++;
    att.score += pts; this.award(att, K.nitro * Math.min(1.4, sev), null);
    vic.lastHit = { by: att, t: this.time };
    if (att.isPlayer) this.message(K.label, closing > 15 ? 'big' : 'bonus', `+${pts} punti · +${Math.round(K.nitro * Math.min(1.4, sev))} nitro`);
    if (att.isPlayer || vic.isPlayer) {
      if (closing > 15 && this.slowCool <= 0) this.slowmo(0.85);
      const desc = `${K.label.replace('!', '')} ${att.isPlayer ? 'su' : 'da'} ${att.isPlayer ? vic.name : att.name}`;
      this.crashCandidate(closing * (kind === 'tbone' ? 1.5 : kind === 'frontale' ? 1.3 : 1), [att, vic], desc);
    }
  }
  slowmo(t) { this.slowT = t; this.slowCool = 7; }
  applyDamage(car, dmg, local, dir, by, wp) {
    if (dmg <= 0.5) return;
    const before = car.hp; car.hp = Math.max(0, car.hp - dmg);
    dent(car.mesh, local, dir, Math.min(0.32, dmg * 0.012));
    const ud = car.mesh.userData, L = ud.dims.L;
    const zone = local.x > L * 0.45 ? 'front' : local.x < -L * 0.45 ? 'rear' : local.z > 0 ? 'left' : 'right';
    // bonnet pops up when the nose is smashed
    if (zone === 'front') { const bn = ud.parts.find((p) => p.userData.bonnet); if (bn && !bn.userData.popped && car.hp < 60) { bn.userData.popped = true; bn.rotation.z = 0.18 + Math.random() * 0.15; bn.position.y += 0.05; } }
    // windscreens crack, then shatter into glass chips
    if ((zone === 'front' || zone === 'rear') && dmg > 6) {
      if (crackGlass(car.mesh, zone, dmg / 12)) {
        const q = car.mesh.quaternion, gp = new THREE.Vector3(zone === 'front' ? 0.9 : -1.2, ud.dims.beltY + 0.25, 0).applyQuaternion(q).add(car.mesh.position);
        for (let k = 0; k < 40; k++) this.chips.emit(gp.x, gp.y, gp.z, (Math.random() - 0.5) * 6, 1 + Math.random() * 4, (Math.random() - 0.5) * 6, 0.9 + Math.random() * 0.6, 0.12 + Math.random() * 0.1, 0.75, 0.86, 0.95, 0.9);
      }
    }
    if (wp && dmg > 5) for (let k = 0; k < Math.min(14, dmg * 0.6); k++) this.chips.emit(wp.x, wp.y, wp.z, (Math.random() - 0.5) * 5, 1 + Math.random() * 3, (Math.random() - 0.5) * 5, 1 + Math.random(), 0.16, ...this.paintRGB(car), 1);
    // parts in the hit zone lose hit points and may fly off
    for (const pt of [...ud.parts]) if (pt.userData.zone === zone) { pt.userData.hp -= dmg; if (pt.userData.hp <= 0) this.detach(car, pt); }
    // a huge hit near a wheel can tear it off
    if ((dmg > 22 || (dmg > 14 && car.hp < 45)) && Math.random() < 0.55) {
      let wi = -1, wd = 1.3; ud.wheelPos.forEach(([x, z], i) => { const d = Math.hypot(local.x - x, local.z - z); if (d < wd && !car.wheelLost[i]) { wd = d; wi = i; } });
      if (wi >= 0 && car.wheelLost.filter(Boolean).length < 2) this.detachWheel(car, wi);
    }
    if (by && by !== car) { car.lastHit = { by, t: this.time }; by.score += Math.round(dmg * 3); }
    if (before > 0 && car.hp <= 0) this.wreck(car);
  }
  paintRGB(car) { if (!car._rgb) { const c = new THREE.Color(car.color); car._rgb = [c.r, c.g, c.b]; } return car._rgb; }
  toDebris(car, obj, mass = 12) {
    obj.updateWorldMatrix(true, true); const wp = new THREE.Vector3(), wq = new THREE.Quaternion(); obj.getWorldPosition(wp); obj.getWorldQuaternion(wq);
    obj.parent.remove(obj); this.scene.add(obj); obj.position.copy(wp); obj.quaternion.copy(wq);
    const bb = new THREE.Box3().setFromObject(obj); const sz = bb.getSize(new THREE.Vector3()); const ctr = bb.getCenter(new THREE.Vector3());
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(ctr.x, ctr.y, ctr.z).setAngularDamping(0.4));
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(Math.max(0.05, sz.x / 2), Math.max(0.04, sz.y / 2), Math.max(0.05, sz.z / 2)).setMass(mass).setFriction(0.6), body);
    const lv = car.body.linvel(); body.setLinvel({ x: lv.x * 0.8 + (Math.random() - 0.5) * 6, y: 3 + Math.random() * 4, z: lv.z * 0.8 + (Math.random() - 0.5) * 6 }, true);
    body.setAngvel({ x: (Math.random() - 0.5) * 12, y: (Math.random() - 0.5) * 12, z: (Math.random() - 0.5) * 12 }, true);
    // the body is placed at the bounding-box centre: keep the visual offset from it (in body space)
    const off = wp.clone().sub(ctr);
    this.debris.push({ mesh: obj, body, off, q0: wq.clone(), t: 0 });
    if (this.debris.length > 60) { const o = this.debris.shift(); this.scene.remove(o.mesh); this.world.removeRigidBody(o.body); }
  }
  detach(car, pt) {
    const parts = car.mesh.userData.parts; parts.splice(parts.indexOf(pt), 1);
    this.toDebris(car, pt, 12);
  }
  detachWheel(car, i) {
    const ud = car.mesh.userData, w = ud.wheels[i];
    const clone = w.clone(true); w.parent.add(clone); clone.position.copy(w.position); clone.rotation.copy(w.rotation);
    w.visible = false; car.wheelLost[i] = true;
    car.vc.setWheelRadius?.(i, ud.wr * 0.45);
    this.toDebris(car, clone, 18);
    if (car.isPlayer) this.message('HAI PERSO UNA RUOTA!', 'wreck');
    else if (car.lastHit?.by?.isPlayer) this.award(car.lastHit.by, 12, 'RUOTA VOLANTE!', 150);
  }
  repairWheels(car) { const ud = car.mesh.userData; for (let i = 0; i < 4; i++) if (car.wheelLost[i]) { car.wheelLost[i] = false; ud.wheels[i].visible = true; car.vc.setWheelRadius?.(i, ud.wr); } }
  wreck(car) {
    car.wrecks++; this.simStats.wrecks++; car.burnT = 12;
    const killer = car.lastHit && this.time - car.lastHit.t < 4 ? car.lastHit.by : null;
    if (killer) { killer.kills = (killer.kills || 0) + 1; this.award(killer, 35, killer.isPlayer ? `HAI DEMOLITO ${car.name.toUpperCase()}!` : null, 500); }
    if (car.isPlayer) { this.message('AUTO DISTRUTTA!', 'wreck'); this.slowmo(1.1); this.rumble(1, 1, 600); }
    else this.message(`${car.name} è distrutto`, 'info', killer ? `da ${killer.name}` : '');
    if (killer?.isPlayer || car.isPlayer) this.crashCandidate(24, [car, killer].filter(Boolean), car.isPlayer ? 'La tua auto distrutta' : `Demolizione di ${car.name}`);
    // explosion
    const p = car.body.translation();
    for (let k = 0; k < 40; k++) this.fire.emit(p.x, p.y + 0.8, p.z, (Math.random() - 0.5) * 6, 2 + Math.random() * 5, (Math.random() - 0.5) * 6, 0.5 + Math.random() * 0.5, 1.4, 1, 0.5 + Math.random() * 0.3, 0.1, 1);
    for (let k = 0; k < 20; k++) this.smoke.emit(p.x, p.y + 1, p.z, (Math.random() - 0.5) * 3, 2 + Math.random() * 2, (Math.random() - 0.5) * 3, 3, 1.6, 0.08, 0.08, 0.08, 0.75);
    if (this.track.arena) { car.out = true; car.outT = this.time; }
    else car.wreckT = 4.5; // respawn after a pause, with patched-up car
  }

  // ---------------------------------------------------------------- crash replay
  crashCandidate(score, cars, desc) {
    if (this.state !== 'race') return;
    if (this.bestCrash && this.bestCrash.score >= score) return;
    this.bestCrash = { score, t: this.time, until: this.time + 1.6, focus: cars.map((c) => this.cars.indexOf(c)), desc };
    this.player.bestCrash = desc;
  }
  record() {
    const n = this.cars.length, f = new Float32Array(n * 7);
    this.cars.forEach((c, i) => { const t = c.body.translation(), r = c.body.rotation(); f.set([t.x, t.y, t.z, r.x, r.y, r.z, r.w], i * 7); });
    this.rec.push({ t: this.time, f }); while (this.rec.length && this.rec[0].t < this.time - 6) this.rec.shift();
    const bc = this.bestCrash; if (bc && !bc.saved && this.time >= bc.until) { bc.saved = true; this.replay = { frames: this.rec.filter((r) => r.t >= bc.t - 3.2), focus: bc.focus, desc: bc.desc }; }
  }
  startReplay() {
    if (!this.replay?.frames.length) return;
    this._preReplay = this.state; this.state = 'replay'; this.replayT = 0; this.hud.root.classList.add('replaying'); this.hud.replay.classList.add('on');
  }
  stopReplay() { if (this.state !== 'replay') return; this.state = this._preReplay || 'finished'; this.hud.root.classList.remove('replaying'); this.hud.replay.classList.remove('on'); this.camPos = null; }
  replayFrame(dt) {
    const R = this.replay, F = R.frames; this.replayT += dt * 0.5;
    const t0 = F[0].t, t = t0 + this.replayT; if (t > F[F.length - 1].t) { this.replayT = 0; }
    let i = 0; while (i < F.length - 2 && F[i + 1].t < t) i++;
    const a = F[i], b = F[Math.min(F.length - 1, i + 1)], u = Math.max(0, Math.min(1, (t - a.t) / ((b.t - a.t) || 1)));
    const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
    this.cars.forEach((c, k) => { const o = k * 7; c.mesh.position.set(a.f[o] + (b.f[o] - a.f[o]) * u, a.f[o + 1] + (b.f[o + 1] - a.f[o + 1]) * u, a.f[o + 2] + (b.f[o + 2] - a.f[o + 2]) * u); qa.set(a.f[o + 3], a.f[o + 4], a.f[o + 5], a.f[o + 6]); qb.set(b.f[o + 3], b.f[o + 4], b.f[o + 5], b.f[o + 6]); c.mesh.quaternion.copy(qa.slerp(qb, u)); });
    const foc = this.cars[R.focus[0]]?.mesh.position || this.player.mesh.position;
    const ang = this.replayT * 0.5 + 0.6, cp = new THREE.Vector3(foc.x + Math.cos(ang) * 9, 0, foc.z + Math.sin(ang) * 9); cp.y = Math.max(foc.y + 2.8, this.terrain.heightAt(cp.x, cp.z) + 1.5);
    this.camera.position.copy(cp); this.camera.lookAt(foc.x, foc.y + 0.6, foc.z); this.camera.fov = 55; this.camera.updateProjectionMatrix();
    this.dust.update(dt * 0.5); this.smoke.update(dt * 0.5); this.fire.update(dt * 0.5); this.sparks.update(dt * 0.5); this.chips.update(dt * 0.5);
    this.sun.position.copy(foc).addScaledVector(this.sunDir, 150); this.sun.target.position.copy(foc);
    if (this.composer) this.composer.render(); else this.renderer.render(this.scene, this.camera);
  }

  // ---------------------------------------------------------------- race logic
  updateProgress(car) {
    const tr = this.track; if (tr.arena) return;
    const p = car.body.translation(); let best = car.idx, bd = 1e9;
    for (let k = -30; k <= 60; k++) { const i = (car.idx + k + tr.N) % tr.N; const q = tr.pts[i]; const d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2; if (d < bd) { bd = d; best = i; } }
    if (best < tr.N * 0.2 && car.idx > tr.N * 0.8) {
      if (car.half) {
        car.lap++; car.half = false;
        if (car.lapStart != null && this.state === 'race') { const lt = this.time - car.lapStart; car.lastLap = lt; if (!car.bestLap || lt < car.bestLap) { car.bestLap = lt; if (car.isPlayer && car.lap > 1) this.message('Giro più veloce!', 'info'); } }
        car.lapStart = this.time;
        if (car.isPlayer && car.lap < this.laps) this.message(car.lap === this.laps - 1 ? 'ULTIMO GIRO!' : `Giro ${car.lap + 1}`, 'info');
        if (car.lap >= this.laps && !car.finished) { car.finished = true; car.time = this.time; this.finishOrder.push(car); if (car.isPlayer) this.finish(); }
      }
    }
    if (best > tr.N * 0.45 && best < tr.N * 0.6) car.half = true;
    car.idx = best; car.offTrack = Math.sqrt(bd);
    car.prog = car.lap * tr.N + best + (car.finished ? 1e6 - car.time : 0);
  }
  standings() {
    if (this.track.arena) return this.cars.slice().sort((a, b) => (a.out - b.out) || (b.outT || 0) - (a.outT || 0) || b.hp - a.hp);
    return this.cars.slice().sort((a, b) => (b.prog || 0) - (a.prog || 0));
  }
  finish() {
    this.state = 'finished'; this.endT = this.time;
    if (this.bestCrash && !this.bestCrash.saved) { this.bestCrash.saved = true; this.replay = { frames: this.rec.filter((r) => r.t >= this.bestCrash.t - 3.2), focus: this.bestCrash.focus, desc: this.bestCrash.desc }; }
    setTimeout(() => this.endScreen(), this.track.arena ? 1500 : 300);
  }
  endScreen() {
    if (this.dead || this._ended) return; this._ended = true;
    if (this.o.championship) {
      const res = this.finishOrder.length ? [...this.finishOrder, ...this.standings().filter((c) => !this.finishOrder.includes(c))] : this.standings();
      const fastest = this.track.arena ? null : res.filter((c) => c.bestLap).sort((a, b) => a.bestLap - b.bestLap)[0];
      this.champResult = champRecord(this.venue.id, res.map((c, i) => ({ name: c.name, isPlayer: c.isPlayer, pos: i + 1, kills: c.kills || 0, fastest: c === fastest })));
    }
    const r = showResults(this);
    this.onEnd(r);
  }

  // ---------------------------------------------------------------- frame
  frame(dtReal) {
    if (!(dtReal > 0)) return; // timestamps can go backwards on the first frame
    if (this.state === 'replay') { this.replayFrame(dtReal); return; }
    if (this.state === 'paused' || this.state === 'loading') { this.render(dtReal, true); return; }
    // slow motion on big impacts
    this.slowCool -= dtReal;
    if (this.slowT > 0) { this.slowT -= dtReal; this.timeScale += (0.28 - this.timeScale) * Math.min(1, dtReal * 12); } else this.timeScale += (1 - this.timeScale) * Math.min(1, dtReal * 5);
    const dt = dtReal * this.timeScale;
    this.time += dt;
    if (this.state === 'countdown') {
      this.countdown -= dt; const n = Math.ceil(this.countdown - 0.6);
      if (n !== this._lastCount) { this._lastCount = n; try { n > 0 ? sfx.beep() : sfx.go(); } catch {} }
      if (this.countdown <= 0) { this.state = 'race'; this.time = 0; this.message('VIA!', 'go'); for (const c of this.cars) c.lapStart = 0; }
    }
    this.laps = this.o.laps || this.venue.laps; this.finishOrder ||= [];
    const racing = this.state === 'race' || this.state === 'finished';
    const pin = this.readInput();
    for (const car of this.cars) {
      if (car.out) { car.dyn = this.drive(car, { thr: 0, brk: 0, st: 0, hb: 0, nitro: 0 }, dt); continue; }
      let inp = !racing ? { thr: this.state === 'countdown' && car.isPlayer ? pin.thr : Math.random() < 0.02 ? 1 : 0, brk: 0, st: 0, hb: 0, nitro: 0, hold: 1 } : car.isPlayer && !(this.state === 'finished') ? pin : this.aiInput(car, dt);
      if (car.wreckT > 0) { car.wreckT -= dt; inp = { thr: 0, brk: 1, st: 0, hb: 0, nitro: 0 }; if (car.wreckT <= 0) { car.hp = 45; car.burnT = 0; this.repairWheels(car); this.respawn(car); } }
      car.dyn = this.drive(car, inp, dt);
      if (car.ghostT > 0) { car.ghostT -= dt; if (car.ghostT <= 0) { car.col.setCollisionGroups(GROUPS_CAR); car.cabCol.setCollisionGroups(GROUPS_CAR); } }
      if (car.flipT > (car.isPlayer ? 3.5 : 2.2) && this.state !== 'countdown') { this.requestRespawn(car, 'flip'); }
      // flipping a rival earns a bonus
      if (car.dyn.up.y < -0.2 && !car.flipCredited && car.lastHit && this.time - car.lastHit.t < 3) { car.flipCredited = true; this.award(car.lastHit.by, 18, car.lastHit.by.isPlayer ? 'RIBALTATO!' : null, 250); }
      if (car.dyn.up.y > 0.6) car.flipCredited = false;
      if (racing) this.updateProgress(car);
      if (car.isPlayer && racing && !this.track.arena) {
        const tg = this.track.pts[car.idx].h, hd = Math.abs(wrap(Math.atan2(car.dyn.fwd.z, car.dyn.fwd.x) - tg));
        car.wrongWayT = hd > 2.3 && car.dyn.vF > 3 ? car.wrongWayT + dt : 0;
        car.stuckHintT = car.dyn.speed < 1 && pin.thr > 0.5 ? car.stuckHintT + dt : 0;
      }
    }
    // physics: fixed-size substeps (<= 1/100 s) for stable high-speed contacts
    const sub = Math.max(1, Math.ceil(dt / 0.01));
    for (let s = 0; s < sub; s++) { for (const car of this.cars) car.vc.updateVehicle(dt / sub); this.world.timestep = dt / sub; this.world.step(this.events); this.handleContacts(dt / sub); }
    // numerical safety net: a body that exploded (NaN / absurd speed) is put back on the track
    for (const car of this.cars) { const v = car.body.linvel(), t = car.body.translation(); if (!Number.isFinite(v.x + v.y + v.z + t.x + t.y + t.z) || v.x * v.x + v.y * v.y + v.z * v.z > 150 * 150) { (this.simStats.nan ||= []).push([car.name, car.wheelLost.join(''), Math.round(car.hp), +this.time.toFixed(1), car.ghostT > 0, Math.round(v.y)]); car.body.setLinvel({ x: 0, y: 0, z: 0 }, true); car.body.setAngvel({ x: 0, y: 0, z: 0 }, true); if (!Number.isFinite(t.x + t.y + t.z)) car.body.setTranslation({ x: this.track.pts[car.idx]?.x ?? this.terrain.cx, y: 50, z: this.track.pts[car.idx]?.z ?? this.terrain.cz }, true); car.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true); this.respawn(car); } }
    // derby end condition (time limit: 4 minutes, then the healthiest car wins)
    if (this.track.arena && this.state === 'race') { const alive = this.cars.filter((c) => !c.out); if (this.player.out || alive.length <= 1 || this.time > 240) { this.finishOrder = this.standings(); this.finish(); } }
    if (!this.track.arena && this.state === 'race' && this.player.finished) this.finish();
    if (this.state === 'race') this.record();
    this.render(dt, false, pin, dtReal);
  }

  syncCar(car, dt) {
    const t = car.body.translation(), r = car.body.rotation();
    car.mesh.position.set(t.x, t.y, t.z); car.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    const vc = car.vc, ud = car.mesh.userData;
    for (let i = 0; i < 4; i++) {
      const w = ud.wheels[i]; const susp = vc.wheelSuspensionLength?.(i) ?? 0.3;
      const [x, z] = ud.wheelPos[i]; w.position.set(x, ud.wr + 0.12 - susp, z);
      w.rotation.y = i < 2 ? car.steer : 0;
      const rot = vc.wheelRotation?.(i); if (rot != null) w.userData.spin.rotation.z = -rot;
    }
    // body lean from weight transfer (visual only)
    const s = car.spec, roll = s.roll || 1;
    const pitchT = Math.max(-0.07, Math.min(0.07, car.accF * 0.0045 * roll)), rollT = Math.max(-0.08, Math.min(0.08, -car.accL * 0.006 * roll));
    ud.shell.rotation.z += (pitchT - ud.shell.rotation.z) * Math.min(1, dt * 10); ud.shell.rotation.x += (rollT - ud.shell.rotation.x) * Math.min(1, dt * 10);
    if (car.ghostT > 0 && car.isPlayer) car.mesh.visible = Math.floor(this.time * 10) % 2 === 0; else car.mesh.visible = true;
    if (!dt) return;
    const lv = car.body.linvel(); const speed = Math.hypot(lv.x, lv.z);
    const q = car.mesh.quaternion, fwd = car.dyn?.fwd || tmpV.set(1, 0, 0).applyQuaternion(q).clone(), side = car.dyn?.side || new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    const lat = Math.abs(car.dyn?.vLat || 0);
    const dustC = this.surface.dust, mud = this.venue.surface === 'mud';
    const T = this.terrain;
    const camD = this.camera.position.distanceToSquared(car.mesh.position), near = camD < 120 * 120;
    // dirt build-up on the paint
    if (dustC && speed > 3) ud.dirt.value = Math.min(1, ud.dirt.value + dt * (mud ? 0.012 : 0.005) * Math.min(1, speed / 25));
    if (car.inWater && speed > 3) ud.dirt.value = Math.max(0.15, ud.dirt.value - dt * 0.05);
    for (let i = 0; i < 4; i++) {
      if (!vc.wheelIsInContact(i)) { this.skids.break(car.num * 10 + i); continue; }
      const cp = vc.wheelContactPoint?.(i); if (!cp) continue;
      const P = new THREE.Vector3(cp.x, cp.y, cp.z);
      const rear = i >= 2, spin = rear && car.rpm > 0.6 && speed < 8 && car.dyn?.grounded >= 3 && car.gear === 1;
      const slideAmt = lat / 9 + (car.isPlayer && this.keys.Space && rear ? 0.4 : 0) + (spin ? 0.6 : 0);
      const onTrack = T.trackAt(cp.x, cp.z) > 0.3;
      const wetHere = T.waterAt(cp.x, cp.z) > 0.3;
      // dust / mud spray, heavier when sliding; splashes in water
      if (near) {
        if (wetHere && speed > 3) { if (Math.random() < 0.8) for (let k = 0; k < 2; k++) this.splash.emit(P.x, P.y + 0.15, P.z, -lv.x * 0.15 + side.x * (Math.random() - 0.5) * 6, 2.5 + Math.random() * 3.5 * Math.min(1, speed / 15), -lv.z * 0.15 + side.z * (Math.random() - 0.5) * 6, 0.9 + Math.random() * 0.5, 0.7, 0.78, 0.84, 0.86, 0.55); }
        else if ((dustC || !onTrack) && (speed > 5 || spin) && Math.random() < (rear ? 0.4 : 0.15) * (1 + slideAmt) * (this.low ? 0.5 : 1)) {
          const c = onTrack ? (dustC || [0.4, 0.38, 0.33]) : [0.42, 0.38, 0.28];
          if (mud) this.chips.emit(P.x, P.y + 0.2, P.z, -fwd.x * speed * 0.25 + (Math.random() - 0.5) * 3, 1.5 + Math.random() * 3, -fwd.z * speed * 0.25 + (Math.random() - 0.5) * 3, 0.8, 0.2, 0.25, 0.19, 0.12, 1);
          this.dust.emit(P.x, P.y + 0.3, P.z, -lv.x * 0.12 + (Math.random() - 0.5) * 2, 0.5 + Math.random(), -lv.z * 0.12 + (Math.random() - 0.5) * 2, 1.6 + Math.random() * 1.6 * (mud ? 0.5 : 1), 0.8 + speed * 0.025 + slideAmt * 0.5, c[0], c[1], c[2], (mud ? 0.16 : 0.22) * Math.min(1.6, 0.6 + slideAmt));
        }
        if (!dustC && slideAmt > 0.5 && Math.random() < 0.3) this.smoke.emit(P.x, P.y + 0.2, P.z, (Math.random() - 0.5), 0.6, (Math.random() - 0.5), 1.4, 0.8, 0.8, 0.8, 0.8, 0.18); // tyre smoke on asphalt
      }
      this.skids.add(car.num * 10 + i, P, side, rear ? (lat > 3 || spin || (car.isPlayer && this.keys.Space) ? Math.min(1, slideAmt + 0.25) : dustC ? 0.12 : 0) : (lat > 5 ? Math.min(1, lat / 12) : 0), car.wheelLost[i] ? 0.06 : 0.14);
      if (car.wheelLost[i] && speed > 3 && Math.random() < 0.6) this.sparks.emit(P.x, P.y + 0.05, P.z, -lv.x * 0.3 + (Math.random() - 0.5) * 3, Math.random() * 2, -lv.z * 0.3 + (Math.random() - 0.5) * 3, 0.25, 0.3, 1, 0.7, 0.3, 1);
    }
    // roof scraping sparks when upside down and sliding
    if (car.dyn?.up.y < -0.3 && speed > 3 && Math.random() < 0.7) { const rp = new THREE.Vector3(0, ud.dims.H, 0).applyQuaternion(q).add(car.mesh.position); for (let k = 0; k < 3; k++) this.sparks.emit(rp.x, rp.y, rp.z, -lv.x * 0.3 + (Math.random() - 0.5) * 4, Math.random() * 3, -lv.z * 0.3 + (Math.random() - 0.5) * 4, 0.3, 0.35, 1, 0.75, 0.35, 1); }
    // smoke and fire from damaged engines, burning wrecks, nitro flames
    car.smokeT -= dt; car.burnT = Math.max(0, car.burnT - dt);
    if ((car.hp < 55 || car.burnT > 0) && car.smokeT <= 0 && near) {
      const burning = car.hp <= 15 || car.burnT > 0;
      car.smokeT = burning ? 0.02 : car.hp < 30 ? 0.04 : 0.09;
      const hp = ud.dims.L - 0.4; const ep = new THREE.Vector3(hp, 0.95, 0).applyQuaternion(q).add(car.mesh.position);
      const k = burning ? 0.06 : car.hp < 30 ? 0.16 : 0.45; this.smoke.emit(ep.x, ep.y + 0.2, ep.z, (Math.random() - 0.5) * 1.5 - lv.x * 0.2, 1.8 + Math.random(), (Math.random() - 0.5) * 1.5 - lv.z * 0.2, burning ? 3.2 : 2, burning ? 1.3 : 0.9, k, k * 0.95, k * 0.9, burning ? 0.7 : 0.5);
      if (burning) for (let n = 0; n < 2; n++) this.fire.emit(ep.x + (Math.random() - 0.5) * 0.6, ep.y, ep.z + (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) - lv.x * 0.1, 2 + Math.random() * 2.5, (Math.random() - 0.5) - lv.z * 0.1, 0.45 + Math.random() * 0.3, car.burnT > 0 ? 1.1 : 0.75, 1, 0.42 + Math.random() * 0.3, 0.08, 0.9);
    }
    if (car.boost) { const ep = new THREE.Vector3(-ud.dims.L - 0.2, 0.33, -0.5).applyQuaternion(q).add(car.mesh.position); for (let k = 0; k < 3; k++) this.fire.emit(ep.x, ep.y, ep.z, -fwd.x * 8, 0.3, -fwd.z * 8, 0.12, 0.45, 0.4, 0.6, 1, 0.9); }
  }

  render(dt, frozen, pin, dtReal = dt) {
    for (const car of this.cars) this.syncCar(car, frozen ? 0 : dt);
    for (const k of Object.keys(this.propTypes)) this.syncProps(k);
    for (const d of this.debris) { const t = d.body.translation(), r = d.body.rotation(); tmpQ.set(r.x, r.y, r.z, r.w); d.mesh.quaternion.copy(tmpQ).multiply(d.q0); d.mesh.position.copy(d.off).applyQuaternion(tmpQ).add(tmpV.set(t.x, t.y, t.z)); }
    if (!frozen) { this.dust.update(dt); this.smoke.update(dt); this.fire.update(dt); this.sparks.update(dt); this.chips.update(dt); this.splash.update(dt); }
    this.updateCamera(dtReal);
    if (this.marker) { const p = this.player.mesh.position; this.marker.position.set(p.x, p.y + 2.4 + Math.sin(this.time * 4) * 0.1, p.z); this.marker.quaternion.copy(this.camera.quaternion); this.marker.visible = this.camMode < 2 && !this.lookBack && this.state !== 'finished'; }
    // shadow camera follows the player
    const pp = this.player.mesh.position; this.sun.position.copy(pp).addScaledVector(this.sunDir, 150); this.sun.target.position.copy(pp);
    if (this.composer) this.composer.render(); else this.renderer.render(this.scene, this.camera);
    updateHud(this, dtReal);
    const P = this.player, eg = ENGINE_GEARS[P.spec.engine] || 7;
    try { engineSet(P.rpm < 0.09 && (pin?.thr || 0) < 0.05 ? 0 : Math.min(0.995, Math.max(0.02, P.rpm)) / eg, { crowd: 0.25 }); } catch {}
  }

  updateCamera(dt) {
    const c = this.player, q = c.mesh.quaternion, p = c.mesh.position;
    const fwd = c.dyn?.fwd || new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    const sp = c.dyn?.speed || 0, lv = c.body.linvel();
    let fov = 64 + Math.min(16, sp * 0.24) + (c.boost ? 8 : 0);
    const sh = this.shake; this.shake = Math.max(0, sh - dt * 2.2);
    const tt = performance.now() / 1000;
    const shk = new THREE.Vector3(Math.sin(tt * 37) + Math.sin(tt * 23.3) * 0.5, Math.sin(tt * 41.7) * 0.8, Math.sin(tt * 29.1) + Math.cos(tt * 17) * 0.5).multiplyScalar(sh * 0.16);
    if (this.camMode >= 2) {
      // hood / bumper cams: rigid, with the roll partially levelled out
      const ud = c.mesh.userData, L = ud.dims.L;
      const local = this.camMode === 2 ? new THREE.Vector3(L * 0.28, ud.dims.beltY + 0.36, 0) : new THREE.Vector3(L + 0.25, 0.55, 0);
      const dir = this.lookBack ? -1 : 1;
      if (this.lookBack) local.set(this.camMode === 2 ? -L * 0.5 : -L - 0.3, this.camMode === 2 ? ud.dims.H + 0.15 : 0.6, 0);
      const pos = local.applyQuaternion(q).add(p);
      const look = new THREE.Vector3(14 * dir, this.camMode === 2 ? 0.2 : 0.3, 0).applyQuaternion(q).add(p);
      this.camQ ||= new THREE.Quaternion();
      const upv = new THREE.Vector3(0, 1, 0).applyQuaternion(q).lerp(UP, 0.6).normalize();
      this.camera.position.copy(pos).add(shk.multiplyScalar(0.3)); this.camera.up.copy(upv); this.camera.lookAt(look); this.camera.up.set(0, 1, 0);
      fov += 6;
      this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 4); this.camera.updateProjectionMatrix();
      this.camPos = null; return;
    }
    // chase cams: smoothed yaw that leans into slides, distance grows with speed
    const head = Math.atan2(fwd.z, fwd.x);
    let tgtYaw = head;
    if (sp > 4 && (c.dyn?.vF || 0) > 0) tgtYaw = head + Math.max(-0.6, Math.min(0.6, wrap(Math.atan2(lv.z, lv.x) - head))) * 0.4;
    if (c.dyn?.up.y < 0.2) tgtYaw = this.camYaw ?? head; // tumbling: hold the view
    if (this.camYaw == null || !this.camPos) this.camYaw = tgtYaw;
    this.camYaw += wrap(tgtYaw - this.camYaw) * Math.min(1, dt * 4.5);
    const yaw = this.camYaw + (this.lookBack ? Math.PI : 0);
    const dir = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw));
    const far = this.camMode === 1;
    const back = (far ? 10.5 : 6.6) + Math.min(2.5, sp * 0.05), h = (far ? 3.9 : 2.3) + Math.min(0.6, sp * 0.012);
    const pos = p.clone().addScaledVector(dir, -back); pos.y = p.y + h;
    let gy = this.terrain.heightAt(pos.x, pos.z) + 1.2; for (let k = 1; k <= 3; k++) { const f = k / 4; gy = Math.max(gy, this.terrain.heightAt(p.x + (pos.x - p.x) * f, p.z + (pos.z - p.z) * f) + 0.9); } if (pos.y < gy) pos.y = gy;
    const look = p.clone().addScaledVector(dir, 4.5); look.y += 1.0;
    if (!this.camPos || this.camPos.distanceToSquared(pos) > 900) { this.camPos = pos.clone(); this.camLook = look.clone(); }
    else {
      // critically damped follow: stiff horizontally, softer vertically (absorbs bumps and landings)
      const kH = Math.min(1, dt * 9), kV = Math.min(1, dt * 5);
      this.camPos.x += (pos.x - this.camPos.x) * kH; this.camPos.z += (pos.z - this.camPos.z) * kH; this.camPos.y += (pos.y - this.camPos.y) * kV;
      if (this.lookBack !== this._lb) { this.camPos.copy(pos); this._lb = this.lookBack; }
      this.camLook.lerp(look, Math.min(1, dt * 12));
    }
    this.camera.position.copy(this.camPos).add(shk);
    this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 4); this.camera.updateProjectionMatrix();
    this.camera.lookAt(this.camLook);
  }
}

function mergeGeos(list) {
  // tiny local merge (positions/normals/uvs, indexed), avoids importing BufferGeometryUtils here
  let n = 0; for (const g of list) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), idx = []; let o = 0;
  for (const g of list) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); uv.set(g.attributes.uv.array, o * 2); const ix = g.index.array; for (let i = 0; i < ix.length; i++) idx.push(ix[i] + o); o += g.attributes.position.count; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx); return g;
}
export { CHAMPIONSHIP };
