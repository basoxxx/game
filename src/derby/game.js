// "Scontro Totale": drivable demolition racing with real rigid-body physics (Rapier).
// Arcade-tuned raycast vehicles (gearbox, weight transfer, handbrake power-slides, counter-steer
// assist, air control), destructible props, deformable cars with parts and wheels that fly off,
// cracking windscreens, nitro and points earned by crashing, slow motion on big hits, a replay of
// the best crash, AI with personalities that races and rams, and a last-car-standing derby arena.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { applyHDRI, makeComposer, hdriSun, hdriHorizon, applyFilterSettings, FILTER_PRESETS, updateSunFlare, updateGodRays } from '../ui/gfx.js';
import { engineStart, engineSet, engineStop, sfx } from '../ui/audio.js';
import { getSettings, setSettings } from '../engine/state.js';
import { buildTrack, buildTerrain, buildRacingLine, buildWater, SURFACES } from './tracks.js';
import { buildBanger, dent, crackGlass, updateParts, scrape, BANGERS, AI_COLORS, LIVERIES, tuneSpec } from './cars.js';
import { DIFFICULTY, medalFor, payout, recordCareer, prog, saveProg, checkChallenges } from './career.js';
import { DerbySound } from './sound.js';
import { Particles, SkidMarks, Streaks, Chunks, Rain, LensFx, Shockwaves, FXENV } from './fx.js';
import { addDerbyPost } from './post.js';
import { venueLook } from './atmos.js';
import { buildExtras, headBeams } from './extras.js';
import { aiInput, initAI, PERSONALITIES } from './ai.js';
import { buildGround, buildWaterMeshes, buildScenery, buildTrees, buildScorch, CROWD } from './scenery.js';
import { buildHud, updateHud, message, showResults, showObjectivesHud } from './hud.js';
import { CHAMPIONSHIP, champRecord } from './champ.js';
import { driveOpts, handlingOf, surfaceAt, shapeSteer, PRESETS } from './handling.js';
const AI_H = PRESETS.normale;
import * as MODES5 from './modes.js';
import { ARENA_MODES } from './modes.js';
import { buildFurniture, PARK } from './park.js';
import { pickObjectives, evalObjectives } from './objectives.js';
import { rivalOfCup, rivalState, recordRival, portrait, cupPodium } from './rivals.js';
import { CUPS } from './career.js';

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
    this.diff = DIFFICULTY[opts.difficulty] || DIFFICULTY.normale;
    this.dopts = { ...driveOpts(), ...(opts.drive || {}) }; this.H = handlingOf(this.dopts);
  }

  async start() {
    if (!this.venue) { const { VENUES } = await import('./tracks.js'); this.venue = VENUES.find((v) => v.id === this.o.venue) || VENUES[0]; }
    await initPhysics();
    const kind = this.venue.kind;
    this.mode = kind === 'derby' ? (ARENA_MODES.includes(this.o.mode) ? this.o.mode : 'derby') : kind === 'stunt' ? 'stunt' : kind === 'park' ? 'parco' : (['race', 'elim', 'time', 'caccia', 'distruzione'].includes(this.o.mode) ? this.o.mode : 'race');
    if (this.mode === 'time' || this.mode === 'stunt' || this.mode === 'distruzione' || this.mode === 'parco') this.o.opponents = this.o.keepOpp ? this.o.opponents : 0;
    if (this.mode === 'squadre') this.o.opponents = Math.max(3, this.o.opponents | 1); // even teams: 4 v 4, 3 v 3, 2 v 2
    if (this.mode === 'ondate') this.o.opponents = 6;
    if (this.mode === 'elim') this.o.opponents = Math.max(2, this.o.opponents);
    if (this.mode === 'caccia') this.o.opponents = Math.max(1, Math.min(5, this.o.opponents));
    this.track = buildTrack(this.venue);
    this.water = buildWater(this.venue, this.track);
    this.terrain = buildTerrain(this.venue, this.track, this.water);
    this.line = this.track.arena || this.track.stunt ? null : buildRacingLine(this.track, this.venue);
    this.look = venueLook(this.venue, this.o.weather); this.night = !!this.look.night; this.wet = this.look.wet || 0;
    this.surfKind = this.o.surface || this.venue.surface;
    { const sf = SURFACES[this.surfKind] || SURFACES.dirt; this.surface = { ...sf, grip: sf.grip * (this.look.grip || 1) }; }
    this.setupRenderer();
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.events = new RAPIER.EventQueue(true);
    this.handles = new Map();
    // physics heightfield
    const T = this.terrain;
    const hf = RAPIER.ColliderDesc.heightfield(T.nr, T.nc, T.H, { x: T.sx, y: 1, z: T.sz }).setTranslation(T.cx, 0, T.cz).setFriction(1.0).setRestitution(0.05);
    this.groundCol = this.world.createCollider(hf); this.handles.set(this.groundCol.handle, { kind: 'ground' });
    buildGround(this); buildWaterMeshes(this); buildScenery(this);
    try { buildFurniture(this); } catch (e) { console.warn('furniture', e); }
    try { buildExtras(this, this.standsInfo || []); } catch (e) { console.warn('extras', e); }
    this.buildProps();
    buildTrees(this);
    this.buildCars();
    if (this.o.thumb) { await this.envReady; return; }
    this.setupMode();
    buildHud(this);
    this.rivalCard();
    this.bindInput();
    this.snd = new DerbySound(this);
    await this.envReady;
    // precompile every shader of the scene before the lights go out (no first-crash / first-fire hitch);
    // parallel compile where the driver supports it, never waiting more than 4 s
    try { this.updateCamera(0.016); const t0 = performance.now(); await Promise.race([this.renderer.compileAsync ? this.renderer.compileAsync(this.scene, this.camera) : Promise.resolve(this.renderer.compile(this.scene, this.camera)), new Promise((r) => setTimeout(r, 4000))]); this.compileMs = Math.round(performance.now() - t0); } catch (e) { console.warn('precompile', e); }
    this.state = 'countdown'; this.countdown = 3.6; this._lastCount = 4;
    try { engineStart(this.player.spec.engine || 'endurance'); } catch {}
    this.last = performance.now();
    const loop = (t) => { if (this.dead) return; this.raf = requestAnimationFrame(loop); const dt = Math.min(0.05, (t - this.last) / 1000); if (dt > 0) { this.frame(dt); this.last = t; } };
    this.raf = requestAnimationFrame(loop);
  }

  // one still of the venue for the menu cards (no HUD, no sound, no loop): returns a JPEG data URL
  static async thumbnail(venue, w = 480, h = 270) {
    const box = document.createElement('div'); Object.assign(box.style, { position: 'fixed', left: '-9999px', top: '0', width: w + 'px', height: h + 'px' }); document.body.appendChild(box);
    const g = new DerbyGame(box, { venue, opponents: venue.kind === 'stunt' ? 0 : 5, thumb: true, car: 'muscle', mode: 'race' });
    try {
      await g.start(); g.renderer.setPixelRatio(1); g.resize();
      const T = g.terrain, tr = g.track, cam = g.camera; let look;
      if (tr.arena) { cam.position.set(T.cx + tr.R * 0.95, 13, T.cz + tr.R * 0.5); look = new THREE.Vector3(T.cx, 0.5, T.cz); cam.fov = 52; }
      else if (tr.stunt) { cam.position.set(tr.lipX - 46, 9, -30); look = new THREE.Vector3(tr.lipX + 25, 2, 6); cam.fov = 50; }
      else { const p = tr.pts[tr.N - 34], q = tr.pts[tr.N - 6]; const nx = -Math.sin(p.h), nz = Math.cos(p.h); const x = p.x + nx * (tr.width * 0.5 + 3), z = p.z + nz * (tr.width * 0.5 + 3); cam.position.set(x, Math.max(p.y, T.heightAt(x, z)) + 4.2, z); look = new THREE.Vector3(q.x, q.y + 0.8, q.z); cam.fov = 46; }
      cam.updateProjectionMatrix(); cam.lookAt(look);
      for (const c of g.cars) g.syncCar(c, 0);
      for (const k of Object.keys(g.propTypes)) g.syncProps(k, true);
      g.look.rays = 0; g.look.flare = 0; g.scene.fog.density *= 0.7; g.sun.position.copy(look).addScaledVector(g.sunDir, 150); g.sun.target.position.copy(look); g.fxFrame(0, false);
      let url = '';
      for (let i = 0; i < 4; i++) { await new Promise((r) => setTimeout(r, i ? 350 : 60)); if (g.composer) g.composer.render(); else g.renderer.render(g.scene, g.camera); }
      url = g.renderer.domElement.toDataURL('image/jpeg', 0.82);
      return url;
    } finally { try { g.destroy(); } catch {} box.remove(); }
  }

  destroy() {
    this.dead = true; cancelAnimationFrame(this.raf); try { engineStop(); } catch {} try { this.snd?.stop(); } catch {}
    window.removeEventListener('keydown', this._kd); window.removeEventListener('keyup', this._ku); window.removeEventListener('resize', this._rs);
    this.renderer?.dispose(); this.world?.free?.();
    this.c.innerHTML = '';
  }

  // ---------------------------------------------------------------- rendering setup
  setupRenderer() {
    const look = this.look, night = this.night;
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: !this.low, powerPreference: 'high-performance', preserveDrawingBuffer: !!this.o.thumb });
    r.setPixelRatio(this.low ? 1 : Math.min(1.5, window.devicePixelRatio || 1));
    r.shadowMap.enabled = true; r.shadowMap.type = this.low ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = look.exposure; r.outputColorSpace = THREE.SRGBColorSpace;
    this.c.appendChild(r.domElement); Object.assign(r.domElement.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' });
    const s = this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 3000);
    s.fog = new THREE.FogExp2(look.fogCol, look.fog);
    this.hemi = new THREE.HemisphereLight(look.hemiSky, look.hemiGnd, look.hemi); s.add(this.hemi);
    const sun = this.sun = new THREE.DirectionalLight(look.sunCol, look.sun);
    // tighter shadow frustum on the high setting: the same 2048 map covers 80 m instead of 96 m
    sun.castShadow = true; const sm = this.low ? 1024 : 2048, sr = this.low ? 46 : 40; sun.shadow.mapSize.set(sm, sm);
    Object.assign(sun.shadow.camera, { left: -sr, right: sr, top: sr, bottom: -sr, near: 1, far: 400 }); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.035; sun.shadow.radius = 2.2;
    s.add(sun); s.add(sun.target);
    this.sunDir = night ? new THREE.Vector3(0.25, 0.9, 0.3).normalize() : look.rain ? new THREE.Vector3(0.3, 0.86, 0.4).normalize() : new THREE.Vector3(0.5, 0.8, 0.35).normalize();
    this.envReady = applyHDRI(r, s, look.sky, { intensity: look.env }).then(() => {
      const sd = hdriSun(look.sky); if (sd && !night && !look.rain) { this.sunDir.copy(sd); this.sunDir.y = Math.max(look.id === 'tramonto' ? 0.3 : 0.42, this.sunDir.y); this.sunDir.normalize(); }
      const hz = hdriHorizon(look.sky); if (hz && look.fogMix < 1) s.fog.color.copy(hz).lerp(new THREE.Color(look.fogCol), look.fogMix);
      if (look.flatSky != null) { s.background = new THREE.Color(look.flatSky).multiplyScalar(night ? 0.1 : 0.82); s.fog.color.copy(s.background); }
      else if (night && look.rain) { s.backgroundIntensity = 0.2; }
    }).catch(() => {});
    this.composer = makeComposer(r, s, this.camera, { bloom: look.bloom, low: this.low, ao: !this.low, flare: look.flare > 0, rays: !!look.rays });
    if (this.composer?.grade) { const u = this.composer.grade.uniforms; u.uCon.value = look.con; u.uSat.value = look.sat; u.uWarm.value = look.warm; }
    this.post = addDerbyPost(this.composer);
    if (this.post) { this.post.uniforms.uTintLo.value.set(...look.lo); this.post.uniforms.uTintHi.value.set(...look.hi); this.post.uniforms.uDirt.value = look.rain ? 0.9 : night ? 0.8 : 0.55; this.post.uniforms.uLift.value = look.rain ? 0.012 : 0; }
    this._rs = () => this.resize(); window.addEventListener('resize', this._rs); this.resize();
    const L = this.low ? 0.6 : 1;
    this.dust = new Particles(s, Math.round(2600 * L), { gravity: -0.25, drag: 1.1, grow: 3.2, tex: 'puff', spin: 0.6 });
    this.smoke = new Particles(s, Math.round(1300 * L), { gravity: -2.4, drag: 0.7, grow: 3.4, tex: 'puff', spin: 0.8 });
    this.fire = new Particles(s, 800, { additive: true, gravity: -4.5, drag: 1.5, grow: -0.35, tex: 'puff', spin: 2 });
    this.sparks = new Streaks(s, this.low ? 400 : 800);
    this.chips = new Particles(s, 700, { gravity: 14, drag: 0.4, grow: 0, sizeScale: 0.35, tex: 'chip', spin: 14, fog: true });
    this.chunks = new Chunks(s, this.low ? 90 : 200);
    this.splash = new Particles(s, 900, { gravity: 9.5, drag: 0.6, grow: 1.6, tex: 'puff', spin: 1 });
    this.shock = new Shockwaves(s);
    this.lens = new LensFx(this.c);
    if (look.rain) this.rain = new Rain(s, this.low ? 600 : 1500, look.rain);
    FXENV.amb.value = look.fxAmb; FXENV.light.value.set(look.sunCol).multiplyScalar(look.fxLight);
    // flickering lights for the two nearest fires (high setting)
    this.fireLights = this.low ? [] : [0, 1].map(() => { const l = new THREE.PointLight(0xff7a2a, 0, 26, 1.7); s.add(l); return l; });
    const wetMud = this.venue.surface === 'mud' || this.wet;
    this.skids = new SkidMarks(s, 4500, this.venue.surface === 'asphalt' ? [0.04, 0.04, 0.04] : wetMud ? [0.09, 0.065, 0.045] : [0.12, 0.09, 0.06]);
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
    if (tr.park) {
      // the playground: tyre ring, crate walls to blast through, barrel pyramids, a cone slalom, hay mazes
      for (let k = 0; k < 120; k++) { const a = (k / 120) * Math.PI * 2; place('tyres', T.cx + Math.cos(a) * (tr.R - 1), T.cz + Math.sin(a) * (tr.R - 1)); }
      const wall = (x, z, n, rows, yaw = 0) => { for (let r = 0; r < rows; r++) for (let k = 0; k < n - (r % 2); k++) { const u = (k - (n - 1) / 2) * 1.02 + (r % 2) * 0.51; place('crate', T.cx + x - Math.sin(yaw) * u, T.cz + z + Math.cos(yaw) * u, yaw, r * 1.0); } };
      const pyramid = (x, z, n) => { for (let row = 0; row < n; row++) for (let k = 0; k < n - row; k++) place('barrel', T.cx + x, T.cz + z - (n - 1) * 0.6 + k * 1.2 + row * 0.6, 0, row * 0.92); };
      wall(-62, 72, 8, 3, 0); wall(30, 40, 7, 3, 0); wall(-60, -60, 7, 2, Math.PI / 2);
      pyramid(-30, 72, 5); pyramid(80, -10, 4); pyramid(-90, 20, 4);
      for (let k = 0; k < 10; k++) place('cone', T.cx - 60 + k * 12, T.cz - 22 + (k % 2) * 3);
      for (let k = 0; k < 14; k++) place('hay', T.cx + 70 + (k % 7) * 1.6, T.cz + 70 + Math.floor(k / 7) * 6, 0);
      for (let k = 0; k < 10; k++) place('tyres', T.cx + 20 + k * 1.0, T.cz - 100, 0, 0);
    } else if (tr.arena) {
      for (let k = 0; k < 90; k++) { const a = (k / 90) * Math.PI * 2; place('tyres', T.cx + Math.cos(a) * (tr.R - 1), T.cz + Math.sin(a) * (tr.R - 1)); }
      for (let k = 0; k < (v.ramps ? 16 : 30); k++) { const a = Math.random() * 6.28, r = 8 + Math.random() * tr.R * 0.65; place(['barrel', 'crate', 'hay'][k % 3], T.cx + Math.cos(a) * r, T.cz + Math.sin(a) * r, Math.random() * 3); }
    } else if (tr.stunt) {
      // the run-out: a pyramid of barrels and walls of crates waiting for the long jumpers
      const x0 = tr.lipX;
      for (let row = 0; row < 5; row++) for (let k = 0; k <= 4 - row; k++) place('barrel', x0 + 168 + row * 0.02, -2.4 + k * 1.2 + row * 0.6, 0, row * 0.92);
      for (let k = 0; k < 9; k++) for (let h = 0; h < 2; h++) { place('crate', x0 + 185, -8 + k * 1.05 + (h ? 0.5 : 0), 0, h * 1.0); place('crate', x0 + 185, 3 + k * 1.05 + (h ? 0.5 : 0), 0, h * 1.0); }
      for (let k = 0; k < 24; k++) place('tyres', x0 + 205, -14 + k * 1.2);
      for (let k = -6; k <= 6; k++) place('cone', x0 - 40, k * 2.2);
      for (let x = tr.bbox[0] + 20; x < x0 - 25; x += 12) for (const z of [-15.5, 15.5]) place('fence', x, z, 0);
    } else {
      const hw = tr.width / 2;
      // barrels before every jump kicker; cones marking the crossings
      for (const jp of tr.jumps) { const i = Math.floor(jp * tr.N) - 14; const p = tr.pts[(i + tr.N) % tr.N]; const nx = -Math.sin(p.h), nz = Math.cos(p.h); for (const o of [-hw - 1.5, hw + 1.5]) for (let q = 0; q < 2; q++) place('barrel', p.x + nx * (o + Math.sign(o) * q * 0.7), p.z + nz * (o + Math.sign(o) * q * 0.7)); }
      // demolition time trial: crate walls (two rows, a gap you can thread) across the track every ~130 m
      if (this.mode === 'distruzione') {
        const step = Math.max(40, Math.round(130 / tr.ds));
        for (let i0 = 30; i0 < tr.N - 30; i0 += step) {
          if (this.near(tr.jumps, i0, 40) || tr.crossings.some((c) => Math.min(Math.abs(c - i0), tr.N - Math.abs(c - i0)) < 20)) continue;
          const p = tr.pts[i0], nx = -Math.sin(p.h), nz = Math.cos(p.h), gap = ((i0 * 7) % 3) - 1;
          for (let r = 0; r < 2; r++) for (let u = -hw + 0.6; u <= hw - 0.6; u += 1.05) { if (Math.abs(u - gap * hw * 0.5) < 1.2 && r === 0) continue; place(r ? 'barrel' : 'crate', p.x + nx * u + Math.cos(p.h) * r * 1.6, p.z + nz * u + Math.sin(p.h) * r * 1.6, p.h); }
        }
      }
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
    this.snd?.prop(b.userData.type, t);
    best.score = (best.score || 0) + 10; best.nitro = Math.min(100, best.nitro + 1.5); if (best.isPlayer && this.cmbN > 0 && this.time - this.cmbT < 4.5) this.cmbT = this.time; // smashing props keeps a combo alive
    if (best.isPlayer) { this.playerProps = (this.playerProps || 0) + 1; if (this.mode === 'distruzione' && this.state === 'race') this.smashBonus = (this.smashBonus || 0) + 0.35; this.propCombo = (this.time - (this.propComboT || -9) < 1.5 ? (this.propCombo || 0) : 0) + 1; this.propComboT = this.time; if (this.propCombo === 4 || this.propCombo === 10 || this.propCombo === 20) this.message(`Distruzione x${this.propCombo}!`, 'bonus', `+${this.propCombo * 10} punti`); }
    if (b.userData.type === 'barrel' || b.userData.type === 'crate') for (let k = 0; k < 6; k++) this.chips.emit(t.x, t.y + 0.3, t.z, (Math.random() - 0.5) * 6, 2 + Math.random() * 4, (Math.random() - 0.5) * 6, 1.2, 0.22, b.userData.type === 'crate' ? 0.55 : 0.7, b.userData.type === 'crate' ? 0.4 : 0.15, 0.2, 1);
    if (b.userData.type === 'crate' || b.userData.type === 'fence') for (let k = 0; k < 5; k++) this.chunks.emit(t.x, t.y + 0.4, t.z, (Math.random() - 0.5) * 8, 2 + Math.random() * 5, (Math.random() - 0.5) * 8, 0.25, ...(b.userData.type === 'crate' ? [0.5, 0.36, 0.2] : [0.85, 0.2, 0.15]), 5, 0.18);
    if (b.userData.type === 'hay') for (let k = 0; k < 10; k++) this.dust.emit(t.x, t.y + 0.5, t.z, (Math.random() - 0.5) * 4, 1 + Math.random() * 2, (Math.random() - 0.5) * 4, 1.6, 0.8, 0.82, 0.68, 0.36, 0.5);
  }

  // ---------------------------------------------------------------- cars
  buildCars() {
    const tr = this.track, T = this.terrain;
    const nAI = this.o.opponents;
    this.rivalDef = this.o.event ? rivalOfCup(this.o.event.cup) : null;
    const player = tuneSpec(BANGERS.find((b) => b.id === this.o.car) || BANGERS[0], this.o.tune);
    const look = this.o.look || {};
    this.cars = [];
    const grid = [];
    for (let k = 0; k <= nAI; k++) {
      if (tr.arena) { const a = (k / (nAI + 1)) * Math.PI * 2; grid.push({ x: T.cx + Math.cos(a) * tr.R * 0.75, z: T.cz + Math.sin(a) * tr.R * 0.75, yaw: a + Math.PI }); }
      else if (tr.stunt) { const p = tr.pts[6]; grid.push({ x: p.x, z: 0, yaw: 0, idx: 6 }); }
      else { const i = (tr.N - 8 - Math.floor(k / 2) * 4) % tr.N; const p = tr.pts[i], nx = -Math.sin(p.h), nz = Math.cos(p.h), lat = (k % 2 ? -1 : 1) * tr.width * 0.22; grid.push({ x: p.x + nx * lat, z: p.z + nz * lat, yaw: p.h, idx: i }); }
    }
    // player starts at the back of the grid in races (comeback drive), anywhere in the derby; the Lepre takes pole
    const order = tr.arena || tr.stunt ? [0, ...Array.from({ length: nAI }, (_, i) => i + 1)] : [nAI, ...Array.from({ length: nAI }, (_, i) => i)];
    for (let k = 0; k <= nAI; k++) {
      const isP = k === 0;
      const lepre = this.mode === 'caccia' && k === 1;
      const isRival = !isP && k === 2 && nAI >= 3 && !['caccia', 'ondate'].includes(this.mode);
      const rv = isRival ? this.rivalDef : null;
      let spec = isP ? player : rv ? BANGERS.find((b) => b.id === rv.car) || BANGERS[0] : BANGERS[(k * 3 + 1) % BANGERS.length];
      if (lepre) spec = { ...BANGERS.find((b) => b.id === 'muscle'), armor: 1.3, power: 1.2 };
      const cs = MODES5.carSetup(this, k, nAI);
      const color = isP ? (this.o.color || look.color || spec.color) : lepre ? '#ffcf3a' : cs.color || (rv ? rv.color : AI_COLORS[(k - 1) % AI_COLORS.length]);
      const aiLook = { livery: lepre ? 'saetta' : k % 3 === 0 ? 'classica' : LIVERIES[(k * 5) % LIVERIES.length].id, accent: lepre ? '#111' : ['#f2efe6', '#111', '#ffd400'][k % 3], clean: lepre };
      const g = grid[order[k]];
      const num = isP ? (look.num || 1) : k + 1 + (look.num && k + 1 >= look.num ? 1 : 0);
      const car = this.makeCar({ spec, color, num, name: isP ? (this.o.playerName || 'Tu') : lepre ? 'La Lepre' : rv ? rv.name : AI_NAMES.filter((n) => n !== this.rivalDef?.name)[(k - 1) % (AI_NAMES.length - 1)], isPlayer: isP, pos: g, skill: lepre ? 1 : 0.8 + ((k * 0.37) % 1) * 0.2, look: isP ? look : aiLook });
      if (!isP) { initAI(car, lepre ? 1 : k); car.paceMul = this.diff.aiPace * (this.o.aiBoost || 1) * (lepre ? 0.86 : 1); car.ai.P = { ...car.ai.P, ram: car.ai.P.ram * this.diff.aiAggr * (lepre ? 0 : 1), aggr: car.ai.P.aggr * this.diff.aiAggr }; }
      if (lepre) { car.lepre = true; this.lepre = car; }
      if (cs.team != null) car.team = cs.team;
      // one driver in every field is the player's rival: quicker than the rest and always looking for you
      if (isRival && !lepre) {
        // career rivals carry their grudge from event to event: every point of it makes them quicker and meaner
        const gr = rv ? rivalState(rv.id).grudge : 0, base = PERSONALITIES[rv?.pers === 'aggressivo' ? 'aggressivo' : 'rivale'];
        car.rival = true; car.ai.pers = 'rivale'; car.ai.P = { ...base, pace: base.pace + 0.004 * gr, ram: Math.max(base.ram, 0.5) * this.diff.aiAggr * (1 + 0.15 * gr), aggr: base.aggr * this.diff.aiAggr * (1 + 0.1 * gr) }; car.ai.nemesis = true; this.rival = car; car.grudge = gr;
      }
      this.cars.push(car);
    }
    this.player = this.cars[0];
    if (getSettings().dzMarker !== false) {
      const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(-0.55, 0.7); sh.lineTo(-0.2, 0.7); sh.lineTo(-0.2, 1.3); sh.lineTo(0.2, 1.3); sh.lineTo(0.2, 0.7); sh.lineTo(0.55, 0.7); sh.closePath();
      const arrow = new THREE.Mesh(new THREE.ShapeGeometry(sh), new THREE.MeshBasicMaterial({ color: 0xffd400, transparent: true, opacity: 0.9, depthTest: false, side: THREE.DoubleSide }));
      arrow.renderOrder = 10; this.marker = arrow; this.scene.add(arrow);
    }
    if (this.lepre) {
      // floating golden diamond over the Lepre, visible from afar
      const g = new THREE.OctahedronGeometry(0.55, 0); g.scale(1, 1.5, 1);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xffcf3a, transparent: true, opacity: 0.92, depthTest: false }));
      m.renderOrder = 10; this.lepreMark = m; this.scene.add(m);
    }
    this.rec = []; this.replay = null; this.bestCrash = null;
  }

  makeCar({ spec, color, num, name, isPlayer, pos, skill, look = {} }) {
    const mesh = buildBanger(spec.id, color, num, num * 31 + 7, look); this.scene.add(mesh);
    mesh.userData.shell.position.y = -0.12;
    if (this.night) {
      const ud = mesh.userData; ud.lights.head.emissiveIntensity = 3.2; ud.shell.add(headBeams(ud.dims.L, 0.66));
      if (isPlayer && !this.low) { const sp = new THREE.SpotLight(0xfff0d0, 420, 70, 0.5, 0.6, 1.5); sp.position.set(ud.dims.L, 0.8, 0); sp.target.position.set(ud.dims.L + 12, 0, 0); ud.shell.add(sp); ud.shell.add(sp.target); }
    } // the suspension settles: sit the body down over the wheels
    // low setting: ~35 meshes per car each casting a shadow doubled the draw calls; only the shell and the cab cast
    if (this.low) { const keep = new Set([mesh.userData.body, mesh.userData.cab]); mesh.traverse((o) => { if (o.isMesh && !keep.has(o)) o.castShadow = false; }); }
    const { L, W } = mesh.userData.dims; const T = this.terrain;
    const y = T.heightAt(pos.x, pos.z) + 0.45;
    const rot = new THREE.Quaternion().setFromAxisAngle(UP, -pos.yaw);
    const m = spec.mass;
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(pos.x, y, pos.z).setRotation(rot).setCanSleep(false).setLinearDamping(0.06).setAngularDamping(0.9).setCcdEnabled(true)
      .setAdditionalMassProperties(m, { x: 0, y: spec.comY ?? -0.25, z: 0 }, { x: m * 0.42, y: m * 2.1, z: m * 1.9 }, { x: 0, y: 0, z: 0, w: 1 }));
    const col = this.world.createCollider(RAPIER.ColliderDesc.cuboid(L - 0.05, 0.38, W - 0.03).setTranslation(0, 0.55, 0).setMass(60).setFriction(0.35).setRestitution(0.04)
      .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(9000).setCollisionGroups(GROUPS_CAR), body);
    const cab = this.world.createCollider(RAPIER.ColliderDesc.cuboid(0.9, 0.25, W - 0.18).setTranslation(-0.2, 1.15, 0).setMass(20).setFriction(0.3).setCollisionGroups(GROUPS_CAR)
      .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(12000), body);
    const vc = this.world.createVehicleController(body);
    const wrs = mesh.userData.wrs;
    mesh.userData.wheelPos.forEach(([x, z], i) => vc.addWheel({ x, y: wrs[i] + 0.12, z }, { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 1 }, 0.3, wrs[i]));
    const slip = (this.surfKind === 'asphalt' ? 1.35 : this.surfKind === 'mud' ? 0.88 : this.surfKind === 'gravel' ? 0.96 : 1.05) * spec.grip;
    // per-car springs: stiffness (Rapier scales it by the chassis mass), dampers near 30-40% of critical, travel
    const kS = spec.susp || 30, trv = spec.travel || 0.32;
    for (let i = 0; i < 4; i++) { const kk = kS * (i < 2 ? 1.04 : 0.96); vc.setWheelSuspensionStiffness(i, kk); vc.setWheelSuspensionCompression(i, 0.6 * Math.sqrt(kk)); vc.setWheelSuspensionRelaxation(i, 0.78 * Math.sqrt(kk)); vc.setWheelFrictionSlip(i, slip); vc.setWheelMaxSuspensionTravel(i, trv); vc.setWheelMaxSuspensionForce?.(i, 90000); vc.setWheelSideFrictionStiffness?.(i, 1.0); }
    const car = { mesh, body, col, cabCol: cab, vc, spec, name, isPlayer, color, num, skill, slip, hp: 100, nitro: Math.min(100, (isPlayer ? 35 : 30) + (spec.nitroStart || 0)), steer: 0, idx: pos.idx ?? 0, lap: 0, half: false, finished: false, time: 0, wrecks: 0, out: false, flipT: 0, airT: 0, wreckT: 0, lastHit: null, smokeT: 0,
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
    if (tr.arena) { const a = Math.random() * 6.28, r = (tr.island ? 0.45 + Math.random() * 0.3 : Math.random() * 0.5) * tr.R; x = T.cx + Math.cos(a) * r; z = T.cz + Math.sin(a) * r; yaw = Math.random() * 6.28; }
    else if (tr.stunt) { const p = tr.pts[6]; x = p.x; z = 0; yaw = 0; car.idx = 6; }
    else {
      // a little behind where we were, on a free spot across the track
      // fair reset: a little behind where we were, never on a jump kicker or its landing, never in a ford
      let i = (car.idx - 2 + tr.N) % tr.N;
      for (let n = 0; n < 40 && (this.near(tr.jumps, i, 26) || this.terrain.waterAt(tr.pts[i].x, tr.pts[i].z) > 0.2); n++) i = (i - 2 + tr.N) % tr.N;
      const p = tr.pts[i], hw = tr.width / 2 - 2; yaw = p.h;
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
    // rolling restart at a share of the local racing speed (a standing car in traffic is a sitting duck)
    const v0 = tr.stunt ? 0 : tr.arena ? 4 : Math.min(14, Math.max(6, (this.line?.spd[car.idx] || 10) * 0.45)); car.body.setLinvel({ x: Math.cos(yaw) * v0, y: 0, z: Math.sin(yaw) * v0 }, true); car.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
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
      if (this.state === 'replay') { if (e.code === 'Escape' || e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); this.stopReplay(); } return; }
      if (this.spectate && this.state === 'race' && (e.code === 'Enter' || e.code === 'Space')) { e.preventDefault(); this.endSpectate(); return; }
      if (this.state === 'photo') {
        if (e.code === 'Escape' || e.code === 'KeyO') this.photoMode(false);
        else if (e.code === 'Enter') this.photoShot();
        else if (e.code === 'KeyH') this.hud.root.classList.toggle('photo-clean');
        else if (e.code === 'KeyF') { const ks = Object.keys(FILTER_PRESETS); const cur = getSettings().gfxFilter || 'naturale'; const nx = ks[(ks.indexOf(cur) + 1) % ks.length]; setSettings({ gfxFilter: nx }); applyFilterSettings(); this.hud.photoF.textContent = FILTER_PRESETS[nx].label; }
        return;
      }
      if (e.code === 'KeyO' && (this.state === 'race' || this.state === 'paused' || this.state === 'finished')) { this.photoMode(true); return; }
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
  // ---------------------------------------------------------------- photo mode: frozen world, free orbit camera
  photoMode(on) {
    if (on) {
      if (this.state === 'photo') return;
      this._prePhoto = this.state === 'paused' ? this._pausedFrom || 'race' : this.state; this.state = 'photo';
      this.hud.pause.classList.remove('on'); this.hud.root.classList.add('photo'); this.snd?.pause(true); this.lens.c.style.display = 'none';
      const p = this.player.mesh.position, c = this.camera.position;
      this.photo = { tx: p.x, ty: p.y + 0.8, tz: p.z, yaw: Math.atan2(c.z - p.z, c.x - p.x), pitch: 0.25, dist: Math.max(5, Math.hypot(c.x - p.x, c.z - p.z)), fov: 50, roll: 0 };
      const el = this.renderer.domElement; let drag = null;
      this._pd = (e) => { drag = [e.clientX, e.clientY, e.button]; el.setPointerCapture?.(e.pointerId); };
      this._pm = (e) => { if (!drag) return; const dx = e.clientX - drag[0], dy = e.clientY - drag[1]; drag[0] = e.clientX; drag[1] = e.clientY; const P = this.photo;
        if (drag[2] === 2 || e.shiftKey) { const s = P.dist * 0.002, sx = -Math.sin(P.yaw), sz = Math.cos(P.yaw); P.tx += (sx * -dx) * s; P.tz += (sz * -dx) * s; P.ty += dy * s; }
        else { P.yaw += dx * 0.006; P.pitch = Math.max(-0.15, Math.min(1.4, P.pitch + dy * 0.005)); } };
      this._pu = () => { drag = null; };
      this._pw = (e) => { e.preventDefault(); this.photo.dist = Math.max(2.2, Math.min(60, this.photo.dist * (1 + Math.sign(e.deltaY) * 0.1))); };
      this._pc = (e) => e.preventDefault();
      el.addEventListener('pointerdown', this._pd); el.addEventListener('pointermove', this._pm); el.addEventListener('pointerup', this._pu); el.addEventListener('wheel', this._pw, { passive: false }); el.addEventListener('contextmenu', this._pc);
      this.hud.photoF.textContent = FILTER_PRESETS[getSettings().gfxFilter || 'naturale']?.label || '';
    } else {
      if (this.state !== 'photo') return;
      const el = this.renderer.domElement; el.removeEventListener('pointerdown', this._pd); el.removeEventListener('pointermove', this._pm); el.removeEventListener('pointerup', this._pu); el.removeEventListener('wheel', this._pw); el.removeEventListener('contextmenu', this._pc);
      this.state = this._prePhoto || 'race'; this.lens.c.style.display = ''; this.hud.root.classList.remove('photo', 'photo-clean'); this.camPos = null; this.camera.fov = 64; this.snd?.pause(false);
      if (this.state === 'race' || this.state === 'countdown') this.last = performance.now();
    }
  }
  photoFrame(dt) {
    const P = this.photo, k = this.keys, sp = dt * Math.max(4, P.dist);
    if (k.KeyA || k.ArrowLeft) P.yaw -= dt * 1.2; if (k.KeyD || k.ArrowRight) P.yaw += dt * 1.2;
    if (k.KeyW || k.ArrowUp) P.dist = Math.max(2.2, P.dist - sp * 0.6); if (k.KeyS || k.ArrowDown) P.dist = Math.min(60, P.dist + sp * 0.6);
    if (k.KeyQ) P.ty -= dt * 2; if (k.KeyE) P.ty += dt * 2;
    if (k.KeyZ) P.fov = Math.max(18, P.fov - dt * 20); if (k.KeyX) P.fov = Math.min(90, P.fov + dt * 20);
    if (k.KeyR) P.roll += dt * 0.5; if (k.KeyT) P.roll -= dt * 0.5;
    const cp = new THREE.Vector3(P.tx + Math.cos(P.yaw) * Math.cos(P.pitch) * P.dist, P.ty + Math.sin(P.pitch) * P.dist, P.tz + Math.sin(P.yaw) * Math.cos(P.pitch) * P.dist);
    cp.y = Math.max(cp.y, this.terrain.heightAt(cp.x, cp.z) + 0.4);
    this.camera.position.copy(cp); this.camera.up.set(Math.sin(P.roll), Math.cos(P.roll), 0).applyAxisAngle(UP, -P.yaw); this.camera.lookAt(P.tx, P.ty, P.tz); this.camera.up.set(0, 1, 0);
    this.camera.fov = P.fov; this.camera.updateProjectionMatrix();
    if (this.marker) this.marker.visible = false;
    this.sun.position.set(P.tx, P.ty, P.tz).addScaledVector(this.sunDir, 150); this.sun.target.position.set(P.tx, P.ty, P.tz);
    this.fxFrame(0, false);
    if (this.composer) this.composer.render(); else this.renderer.render(this.scene, this.camera);
  }
  photoShot() {
    try {
      if (this.composer) this.composer.render(); else this.renderer.render(this.scene, this.camera);
      const url = this.renderer.domElement.toDataURL('image/png');
      const a = document.createElement('a'); a.href = url; a.download = `scontro-totale-${this.venue.id}-${Date.now()}.png`; document.body.appendChild(a); a.click(); a.remove();
      this.hud.photoMsg.textContent = 'Foto salvata!'; clearTimeout(this._phT); this._phT = setTimeout(() => { if (this.hud) this.hud.photoMsg.textContent = ''; }, 1600);
      try { sfx.click(); } catch {}
    } catch (e) { console.warn(e); }
  }
  cycleCam() { this.camMode = (this.camMode + 1) % 4; this.camPos = null; this.message(['Camera: inseguimento', 'Camera: lontana', 'Camera: cofano', 'Camera: paraurti'][this.camMode], 'info'); }
  restart() { const b = this.hud?.root.querySelector('[data-a="dz-restart"]'); if (b) b.click(); }
  readInput() {
    const k = this.keys; let thr = (k.KeyW || k.ArrowUp) ? 1 : 0, brk = (k.KeyS || k.ArrowDown) ? 1 : 0, st = ((k.KeyA || k.ArrowLeft) ? 1 : 0) - ((k.KeyD || k.ArrowRight) ? 1 : 0);
    let hb = k.Space ? 1 : 0, nitro = (k.ShiftLeft || k.ShiftRight || k.KeyN) ? 1 : 0, analog = false, back = !!k.KeyQ;
    const pads = navigator.getGamepads?.() || [];
    st = shapeSteer(this, st, false, this._dt || 0.016);
    for (const gp of pads) {
      if (!gp) continue;
      this.pad = gp;
      const ax = gp.axes[0] || 0; if (Math.abs(ax) > (this.dopts.dead ?? 0.08)) { st = -shapeSteer(this, ax, true); analog = true; }
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
  // controller in the overlays (pause, results, replay, spectator): the global menu pad handler
  // stands aside while a derby canvas is on screen, so the game drives focus itself here
  menuPad() {
    const pads = navigator.getGamepads?.() || []; let gp = null; for (const p of pads) if (p) { gp = p; break; }
    if (!gp) return;
    const P = (this._mp ||= {}), now = performance.now();
    const btn = (i) => !!gp.buttons[i]?.pressed;
    const edge = (k, on) => { const was = P[k]; P[k] = on; return on && !was; };
    // one direction at a time, with hysteresis on the stick (on past 0.6, off under 0.3) so a d-pad
    // press or a wobbly stick never registers twice; a fresh press moves exactly one button
    const ay = gp.axes[1] || 0, ax = gp.axes[0] || 0;
    const stick = (v, neg, k) => { const was = P['ax' + k]; const on = was ? (neg ? v < -0.3 : v > 0.3) : (neg ? v < -0.6 : v > 0.6); P['ax' + k] = on; return on; };
    const raw = { up: btn(12) || stick(ay, true, 'u'), down: btn(13) || stick(ay, false, 'd'), left: btn(14) || stick(ax, true, 'l'), right: btn(15) || stick(ax, false, 'r') };
    const held = ['up', 'down', 'left', 'right'].filter((k) => raw[k]);
    if (P.dir && !raw[P.dir]) P.dir = null;
    if (!P.dir && held.length) P.dir = held[0];
    const dirs = { up: P.dir === 'up', down: P.dir === 'down', left: P.dir === 'left', right: P.dir === 'right' };
    const a = edge('a', btn(0)), b = edge('b', btn(1)), st = edge('st', btn(9));
    if (this.state === 'replay') { if (a || b || st) this.stopReplay(); return; }
    if (this.spectate && this.state === 'race') { if (a || st) this.endSpectate(); return; }
    const box = this.state === 'paused' ? this.hud?.pause : this.state === 'finished' && this.hud?.results.classList.contains('on') ? this.hud.results : null;
    if (!box) { for (const k of ['up', 'down', 'left', 'right']) P[k] = dirs[k]; return; }
    const list = [...box.querySelectorAll('button:not([disabled])')].filter((el) => el.offsetParent);
    if (!list.length) return;
    let cur = list.indexOf(document.activeElement);
    for (const d of ['up', 'down', 'left', 'right']) {
      const on = dirs[d]; const was = P[d]; let fresh = edge(d, on);
      if (was && !on) P[d + 'R'] = now;
      // contact bounce (re-press within 70 ms of the release) or a second edge right after a move: same press
      if (fresh) { P[d + 'T'] = now + 420; P[d + 'N'] = 0; if (now - (P[d + 'R'] || 0) < 70 || now - (P.last || 0) < 120) fresh = false; }
      if (on) P[d + 'N'] = (P[d + 'N'] || 0) + 1;
      // auto-repeat only on a real hold: long enough in time AND over several frames (a slow frame
      // while paused must not turn one press into two)
      if (fresh || (on && now > P[d + 'T'] && P[d + 'N'] >= 8 && now - (P.last || 0) > 160)) {
        P.last = now; const step = d === 'up' || d === 'left' ? -1 : 1;
        cur = cur < 0 ? 0 : (cur + step + list.length) % list.length; list[cur].focus({ preventScroll: false });
        document.documentElement.classList.add('pad-nav'); try { sfx.hover?.(); } catch {}
      }
    }
    if (a) { if (cur < 0) { list[0].focus(); document.documentElement.classList.add('pad-nav'); } else list[cur].click(); }
    if (b) { if (this.state === 'paused') this.togglePause(); else box.querySelector('[data-a="dz-quit"]')?.click(); }
    if (st && this.state === 'paused') this.togglePause();
  }
  rumble(strong, weak, ms) {
    const gp = this.pad; if (!gp?.vibrationActuator || this.dopts.rumble === false) return;
    try { gp.vibrationActuator.playEffect?.('dual-rumble', { startDelay: 0, duration: Math.round(ms), strongMagnitude: Math.min(1, strong), weakMagnitude: Math.min(1, weak) })?.catch?.(() => {}); } catch {}
  }
  togglePause() { if (this.state === 'countdown') { this._pausedFrom = 'countdown'; } this.state = this.state === 'paused' ? (this._pausedFrom || 'race') : (this._pausedFrom = this.state, 'paused'); this.hud.pause.classList.toggle('on', this.state === 'paused'); this.snd?.pause(this.state === 'paused'); if (this.state === 'paused') this.hud.pause.querySelector('.btn.primary')?.focus({ preventScroll: true }); else document.activeElement?.blur?.(); }
  message(text, kind, sub) { message(this, text, kind, sub); }
  showObjectives() { showObjectivesHud(this); }

  // ---------------------------------------------------------------- driving
  drive(car, inp, dt) {
    const b = car.body, vc = car.vc, s = car.spec;
    b.resetForces(true); b.resetTorques(true); // user forces persist in Rapier: rebuild them every frame
    const r = b.rotation(); const q = tmpQ.set(r.x, r.y, r.z, r.w);
    const fwd = new THREE.Vector3(1, 0, 0).applyQuaternion(q), up = new THREE.Vector3(0, 1, 0).applyQuaternion(q), side = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    const lv = b.linvel(); const vel = new THREE.Vector3(lv.x, lv.y, lv.z); car.preV = { x: lv.x, y: lv.y, z: lv.z };
    const vF = vel.dot(fwd), vLat = vel.dot(side), speed = vel.length();
    const dead = car.hp <= 0, mass = s.mass;
    // a smashed nose costs power and cooling: the engine loses up to 28%, overheats if it is flogged (limp mode until it cools) and misfires when the car is nearly gone
    { const eng = car.zoneDmg && !car.lepre ? Math.min(1, car.zoneDmg.front / 90) * (car.isPlayer ? 1 : 0.6) : 0;
      car.heat = Math.max(0, Math.min(1, (car.heat || 0) + dt * (eng > 0.25 ? (inp.thr || 0) * (0.012 + eng * 0.085) + (car.boost ? 0.07 : 0) : 0) - dt * 0.075 * (1 - (inp.thr || 0) * 0.85)));
      if (car.heat >= 0.97 && !(car.hotT > 0)) {
        car.hotT = 3; car.heat = 0.55; car.hotN = (car.hotN || 0) + 1;
        // a wrecked engine flogged into a second overheat catches fire: it eats the chassis until it burns out
        if (eng > 0.6 && car.hotN >= 2 && !(car.fireT > 0) && car.hp > 0) { car.fireT = 7; if (car.isPlayer) { this.message('MOTORE IN FIAMME!', 'wreck', 'il fuoco divora il telaio: vai al box o alza il piede'); this.callout('IN FIAMME!', 'red'); } }
        else if (car.isPlayer) this.message('MOTORE SURRISCALDATO!', 'wreck', 'radiatore sfondato: alza il piede');
      }
      if (car.hotT > 0) car.hotT -= dt;
      if (car.fireT > 0) { car.fireT -= dt * (inp.thr > 0.5 ? 0.7 : 1.4); const b0 = car.hp; car.hp = Math.max(0, car.hp - dt * 2.4); if (b0 > 0 && car.hp <= 0) this.wreck(car); }
      car.engDmg = eng; car.engK = (1 - 0.28 * eng) * (car.hotT > 0 ? 0.5 : 1) * (car.hp < 20 && car.hp > 0 && Math.sin(this.time * 31 + car.num) > 0.55 ? 0.55 : 1); }
    let grounded = 0; for (let i = 0; i < 4; i++) if (vc.wheelIsInContact(i)) grounded++;
    // weight transfer estimate (smoothed accelerations, used for grip and for the body lean)
    if (car.lastV && dt > 0) { const ax = (vF - car.lastV[0]) / dt, al = (vLat - car.lastV[1]) / dt; car.accF += (Math.max(-25, Math.min(25, ax)) - car.accF) * Math.min(1, dt * 8); const yawR = b.angvel().y; const latA = -yawR * vF; car.accL += (Math.max(-20, Math.min(20, latA + al * 0.3)) - car.accL) * Math.min(1, dt * 8); }
    car.lastV = [vF, vLat];
    // ---- steering: speed sensitive lock + counter-steer assist that aligns the front wheels with the slide
    const f = 1 / (1 + (speed / 24) ** 1.6);
    const lock = s.steer * (0.24 + 0.76 * f);
    const slideAng = speed > 3 && vF > 1.5 ? Math.atan2(vLat, vF) : 0;
    const H = car.isPlayer ? this.H : AI_H; car.H = H;
    const assist = car.isPlayer ? (inp.analog ? H.assistPad : H.assistKb) : 0.85;
    const wu = car.mesh.userData.wheels, pull = (wu[0].userData.toe + wu[1].userData.toe) * 0.45 * Math.min(1, speed / 12); // bent front wheels pull the car to one side
    // a bent front wheel also wobbles: the steering shimmies faster the quicker the car goes
    const bentF = Math.abs(wu[0].userData.bent) + Math.abs(wu[1].userData.bent);
    const wobble = bentF > 0.05 ? Math.sin(this.time * (5 + speed * 0.8) + car.num) * Math.min(0.06, bentF * 0.1) * Math.min(1, speed / 10) : 0;
    car.wobble = wobble;
    let tgt = dead ? 0 : inp.st * lock - slideAng * assist * (1 - 0.5 * Math.abs(inp.st)) + pull + wobble;
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
          force = inp.thr * 8200 * s.power * (mass / 1450) ** 0.3 * gm * tq * Math.max(0, Math.min(1, (1 - aF / vmax) * 7)) * (car.rubber || 1);
          if (car.shiftT > 0) force *= 0.3;
          force *= car.engK ?? 1;
          if (aF < 6 && car.gear === 1) rpmT = Math.max(rpmT, 0.35 + inp.thr * 0.35); // clutch slip at launch
        }
        if (inp.brk > 0) { brake = inp.brk * 7; car.brakeF = inp.brk; }
      }
      const wasBoost = car.boost;
      car.boost = inp.nitro && car.nitro > 0 && inp.thr > 0.2;
      if (car.boost) { force += 6200 * s.power * (s.nitroBoost || 1); car.nitro = Math.max(0, car.nitro - dt * 22 * (s.nitroDrain || 1)); }
      // nitro "kick": a short shove in the back when the bottle opens (felt in the seat and the camera)
      if (car.boost && !wasBoost && grounded >= 2) { car.boostKick = 0.35; if (car.isPlayer) { this.camPull = 1; this.rumble(0.25, 0.5, 220); } }
      if (car.boostKick > 0) { car.boostKick -= dt; if (grounded >= 2) force += 5200 * s.power * (car.boostKick / 0.35); }
      if (grounded < 2 && inp.thr > 0) rpmT = 0.95; // free revving in the air
    } else { brake = 8; rpmT = 0.05; }
    car.rpm += (rpmT - car.rpm) * Math.min(1, dt * (car.shiftT > 0 ? 18 : 7));
    // weight-transfer grip: braking loads the front, throttle unloads it (and can break the rear loose)
    const brakingLoad = Math.max(0, Math.min(1, -car.accF / 9)), accLoad = Math.max(0, Math.min(1, car.accF / 6));
    const drive = s.drive || (s.awd ? 'awd' : 'rwd');
    const hbOn = inp.hb && !dead;
    // the surface under each tyre: tarmac, dirt, gravel, mud, grass off the track, wet patches and fords
    const bp = b.translation(); car.surf ||= []; let dragS = 0, gSum = 0, nS = 0;
    for (let i = 0; i < 4; i++) { const cp = vc.wheelIsInContact(i) ? vc.wheelContactPoint?.(i) : null; const sf = surfaceAt(this, cp ? cp.x : bp.x, cp ? cp.z : bp.z); car.surf[i] = sf; if (cp) { dragS += sf.drag; gSum += sf.g; nS++; } }
    car.surfG = nS ? gSum / nS : (car.surfG || 1); dragS = nS ? dragS / nS : 0;
    car.surfK = car.surf[2]?.k;
    for (let i = 0; i < 4; i++) {
      const front = i < 2;
      const driven = drive === 'awd' || (drive === 'fwd' ? front : !front);
      // 4x4: 40/60 torque split front/rear (stable, but still lets the tail help on the throttle)
      const share = drive === 'awd' ? (front ? 0.2 : 0.3) : 0.5;
      vc.setWheelEngineForce(i, driven && !car.wheelLost[i] ? force * share : 0);
      vc.setWheelBrake(i, inp.hold ? brake : brake * (front ? 0.62 : 0.38) + (hbOn && !front ? 16 : 0));
      const sf = car.surf[i];
      let g = s.grip * sf.g * (front ? (s.frontGrip || 1) : (s.rearGrip || 1));
      g *= front ? 1 + brakingLoad * 0.2 - accLoad * 0.06 : 1 - brakingLoad * 0.14 + accLoad * 0.05;
      // lift-off: coming off the throttle mid-corner lets the tail step out a touch (trail-braking into a drift)
      if (!front && car.isPlayer && inp.thr < 0.1 && Math.abs(inp.st) > 0.5 && speed > 14) g *= 0.93;
      if (!front && drive !== 'fwd' && inp.thr > 0.5 && car.gear <= 2 && speed < 22) g *= 1 - (s.powerOver || 0) * inp.thr;
      if (front && drive === 'fwd' && inp.thr > 0.5) g *= 0.94;
      if (!front && hbOn) g *= 0.3;
      if (Math.abs(wu[i].userData.bent) > 0.12) g *= 0.9;
      if (dead) g *= 0.6;
      if (car.wheelLost[i]) g *= 0.35;
      vc.setWheelFrictionSlip(i, g);
      // loose surfaces let go progressively (lower lateral stiffness); the handbrake unloads the rear
      vc.setWheelSideFrictionStiffness?.(i, (!front && hbOn ? 0.55 : 1.0) * sf.side);
    }
    // aero drag, downforce (along the car's own down axis, so it also holds the car in a loop), surface drag (mud, water)
    const p = b.translation();
    const inWater = this.terrain.waterAt(p.x, p.z) > 0.35 && p.y < this.terrain.heightAt(p.x, p.z) + 1.0;
    const sd = dragS + (inWater ? 0.12 : 0), dfm = speed * speed * 0.9;
    b.addForce({ x: -vel.x * speed * 0.42 - vel.x * mass * sd - up.x * dfm, y: -up.y * dfm, z: -vel.z * speed * 0.42 - vel.z * mass * sd - up.z * dfm }, true);
    car.inWater = inWater;
    // slipstream: tucked in behind another car the air is thinner (a pull forward, and the player's nitro trickles back): the fair way to come back
    if (!dead && vF > 17 && grounded >= 3 && this.state === 'race' && !this.track.arena && !this.track.stunt) {
      let best = 0; for (const o of this.cars) { if (o === car || o.out || o.removed || !o.dyn || o.dyn.speed < 12) continue; const op = o.body.translation(), dx = op.x - p.x, dz = op.z - p.z, ah = dx * fwd.x + dz * fwd.z; if (ah < 3 || ah > 17) continue; const la = Math.abs(dx * side.x + dz * side.z); if (la > 1.7 || o.dyn.fwd.x * fwd.x + o.dyn.fwd.z * fwd.z < 0.8) continue; best = Math.max(best, (1 - ah / 17) * (1 - la / 1.7)); }
      if (best > 0.05) { const f = mass * 1.5 * best; b.addForce({ x: fwd.x * f, y: 0, z: fwd.z * f }, true); car.draftT = (car.draftT || 0) + dt; if (car.isPlayer) { this.draftUsed = (this.draftUsed || 0) + dt; car.nitro = Math.min(100, car.nitro + dt * 4 * best); if (car.draftT > 1.3 && this.time - (this._draftMsg ?? -99) > 12) { this._draftMsg = this.time; this.message('SCIA!', 'bonus', 'meno aria, più nitro'); } } } else car.draftT = 0;
    }
    // service brakes as a controlled deceleration (Rapier's wheel brake alone is far too grabby)
    if (car.brakeF > 0 && grounded >= 2 && vF > 0.5) { const dec = car.brakeF * mass * H.brake * Math.max(0.72, Math.min(1.15, car.surfG / 1.05 * (this.look.grip || 1))) * Math.min(1, vF / 3); b.addForce({ x: -fwd.x * dec, y: 0, z: -fwd.z * dec }, true); }
    const av = b.angvel();
    if (!grounded) {
      if (car.airT === 0) { const tp = b.translation(); car.takeoff = [tp.x, tp.z]; }
      car.airT += dt; car.airRot = (car.airT === dt ? 0 : car.airRot || 0) + Math.hypot(av.x, av.z) * dt;
      // heavier than real life so jumps do not float; light air control: steer yaws, throttle/brake pitch,
      // and a gentle self-levelling so most landings happen on the wheels
      b.addForce({ x: 0, y: -mass * 9.81 * 0.4, z: 0 }, true);
      const right = new THREE.Vector3().crossVectors(fwd, UP).normalize();
      const lvl = new THREE.Vector3().crossVectors(up, UP); // axis * sin(angle) towards upright
      const kL = mass * (up.y > 0 ? 2.2 : 0.6) * H.airCtl, sY = inp.st * mass * 0.7 * Math.min(1.2, H.airCtl);
      b.addTorque({ x: up.x * sY + lvl.x * kL - av.x * mass * 0.25, y: up.y * sY, z: up.z * sY + lvl.z * kL - av.z * mass * 0.25 }, true);
      const pitch = (inp.thr - inp.brk) * mass * 0.5 * Math.min(1.2, H.airCtl); b.addTorque({ x: right.x * pitch, y: 0, z: right.z * pitch }, true);
    } else {
      if (car.airT > 0.35) this.landed(car, car.airT, vel, up); car.airRot = 0;
      car.airT = 0;
      // drifting the player's car fills the nitro bottle and scores
      if (car.isPlayer && !dead && this.state === 'race') {
        const sa = Math.abs(slideAng);
        if (grounded >= 3 && speed > 11 && sa > 0.3 && sa < 1.5 && vF > 4) { car.driftT = (car.driftT || 0) + dt; car.driftEnd = 0; car.driftPts = (car.driftPts || 0) + dt * speed * sa * 2.2; car.nitro = Math.min(100, car.nitro + dt * 5 * Math.min(1.6, sa * 2)); }
        else if (car.driftT > 0) { car.driftEnd = (car.driftEnd || 0) + dt; if (car.driftEnd > 0.35) { this.longDrift = Math.max(this.longDrift || 0, car.driftT); if (car.driftT > 1.1) { const pts = this.combo(Math.round(car.driftPts / 10) * 10); car.score += pts; this.message(car.driftT > 2.6 ? 'SUPER DERAPATA!' : 'DERAPATA!', 'bonus', `${car.driftT.toFixed(1).replace('.', ',')} s · +${pts} punti`); } car.driftT = 0; car.driftPts = 0; } }
      }
      // handbrake helps rotate the car into a power slide; yaw rate is capped so slides stay catchable
      if (hbOn && speed > 6) { const tq = inp.st * (s.hbYaw || 1) * H.hbYaw * mass * 2.6 * Math.min(1, speed / 12); b.addTorque({ x: up.x * tq, y: up.y * tq, z: up.z * tq }, true); }
      const yawMax = H.yawMax + (hbOn ? 0.8 : 0);
      if (Math.abs(av.y) > yawMax) { const tq = -Math.sign(av.y) * (Math.abs(av.y) - yawMax) * mass * 6; b.addTorque({ x: 0, y: tq, z: 0 }, true); }
      // arcade grip: the velocity slowly follows the nose while sliding (keeps drifts predictable)
      if (grounded >= 3 && Math.abs(slideAng) > 0.06 && speed > 4) {
        const k = (hbOn ? 0.32 : H.latGrip) * mass * Math.min(1.25, car.surfG / 1.05) * (this.look.grip || 1);
        b.addForce({ x: -side.x * vLat * k, y: 0, z: -side.z * vLat * k }, true);
      }
    }
    // self-righting when nearly upside down and slow
    if (up.y < 0.25 && speed < 4) car.flipT += dt; else car.flipT = Math.max(0, car.flipT - dt);
    // anti-roll assist so the car does not tip over in normal cornering (tall vans lean more)
    const ar = 9000 * H.antiRoll * (s.roll > 1.2 ? 0.85 : 1);
    if (grounded >= 2 && up.y > 0.4) { const roll = side.y; b.addTorque({ x: fwd.x * roll * ar, y: fwd.y * roll * ar, z: fwd.z * roll * ar }, true); }
    // high-speed stabiliser: damp roll and pitch rates on the ground above ~70 km/h (berm kicks and kerbs
    // no longer launch the car into a random barrel roll), and pull a car on two wheels back down
    if (grounded >= 2 && speed > 19 && !dead) {
      const kS = mass * 0.9 * H.stab * Math.min(1, (speed - 19) / 14), rr = av.x * fwd.x + av.y * fwd.y + av.z * fwd.z;
      const rgt = side, pr = av.x * rgt.x + av.y * rgt.y + av.z * rgt.z;
      b.addTorque({ x: -(fwd.x * rr + rgt.x * pr * 0.5) * kS, y: -(fwd.y * rr + rgt.y * pr * 0.5) * kS, z: -(fwd.z * rr + rgt.z * pr * 0.5) * kS }, true);
    }
    if (grounded > 0 && grounded <= 2 && up.y > 0.35 && up.y < 0.93 && speed > 8 && !dead) { const lvl = new THREE.Vector3().crossVectors(up, UP), kL = mass * 3.2 * H.stab; b.addTorque({ x: lvl.x * kL, y: 0, z: lvl.z * kL }, true); car.twoWheelT = (car.twoWheelT || 0) + dt; } else car.twoWheelT = 0;
    return { fwd, up, side, speed, vF, vLat, grounded, slideAng };
  }
  landed(car, airT, vel, up) {
    const b = car.body, av = b.angvel(), L = (car.H || this.H).land;
    // touchdown: kill most of the tumble, soak up the vertical hit, keep the speed along the nose
    // (how much is absorbed depends on the handling preset: Arcade lands like a cat, Simulazione bounces)
    b.setAngvel({ x: av.x * (1 - L), y: av.y * (1 - L * 0.33), z: av.z * (1 - L) }, true);
    if (vel.y < -5) b.setLinvel({ x: vel.x, y: vel.y * (1 - L * 0.8), z: vel.z }, true);
    // a heavy landing on a damaged car hurts the suspension (and the chassis)
    if (vel.y < -11 && airT > 0.8) { const hit = Math.min(10, (-vel.y - 11) * 1.2) * (up && up.y < 0.8 ? 1.6 : 1); if (hit > 1) { car.hp = Math.max(car.hp > 0 ? 1 : 0, car.hp - hit * (car.isPlayer ? this.diff.dmgTaken : 1)); car.zoneDmg ||= { front: 0, rear: 0, left: 0, right: 0 }; car.zoneDmg.front += hit * 0.3; car.zoneDmg.rear += hit * 0.3; } }
    const p = b.translation();
    for (let k = 0; k < Math.min(26, airT * 18) * (this.low ? 0.6 : 1); k++) { const a = Math.random() * 6.28; this.dust.emit(p.x + Math.cos(a) * 1.5, p.y - 0.3, p.z + Math.sin(a) * 1.5, Math.cos(a) * 3, 0.8 + Math.random(), Math.sin(a) * 3, 1.6 + Math.random(), 1.4, ...(this.surface.dust || [0.5, 0.5, 0.5]), 0.35); }
    this.snd?.land(car, airT);
    const clean = up && up.y > 0.93;
    if (car.isPlayer && car.takeoff && this.mode !== 'stunt') {
      this.maxJump = Math.max(this.maxJump || 0, Math.hypot(p.x - car.takeoff[0], p.z - car.takeoff[1]));
      // a full roll or somersault in the air, landed on the wheels
      if ((car.airRot || 0) > 5.2 && up && up.y > 0.6 && this.state === 'race') { this.flips = (this.flips || 0) + 1; this.award(car, 25, 'CAPRIOLA!', 400); this.callout('CAPRIOLA!', 'gold'); }
    }
    if (airT > 0.7 && this.mode !== 'stunt') {
      const bonus = Math.min(20, airT * 9) + (clean ? 8 : 0);
      this.award(car, bonus, clean && airT > 1 ? 'ATTERRAGGIO PERFETTO!' : airT > 1.4 ? 'VOLO SPETTACOLARE!' : 'IN VOLO!', Math.round(airT * 60) + (clean ? 50 : 0));
      if (car.isPlayer && car.takeoff && airT > 0.9) { const d = Math.hypot(p.x - car.takeoff[0], p.z - car.takeoff[1]); if (d > 12) this.callout(`SALTO ${Math.round(d)} m`, clean ? 'gold' : 'air'); }
    }
    if (car.isPlayer) { this.shake = Math.min(1, this.shake + airT * (clean ? 0.22 : 0.4)); this.camDip = Math.min(0.9, Math.max(this.camDip || 0, -vel.y * 0.07)); this.rumble(airT * 0.5, airT * 0.6, 160); }
  }
  callout(text, kind = '') { const el = this.hud?.callout; if (!el) return; el.textContent = text; el.className = 'dzx-callout ' + kind; void el.offsetWidth; el.classList.add('on'); clearTimeout(this._coT); this._coT = setTimeout(() => el.classList.remove('on'), 1700); }
  feed(html) { const box = this.hud?.feed; if (!box) return; const el = document.createElement('div'); el.innerHTML = html; box.prepend(el); setTimeout(() => el.classList.add('out'), 4200); setTimeout(() => el.remove(), 4700); while (box.children.length > 5) box.lastChild.remove(); }

  aiInput(car, dt) { return aiInput(this, car, dt); }

  // ---------------------------------------------------------------- damage & events
  // chained actions (hits, wrecks, drifts, jumps within 4.5 s of each other) multiply the player's points
  combo(pts) {
    if (this.time - (this.cmbT ?? -99) > 4.5) { this.cmbN = 0; this.cmbShown = 1; }
    this.cmbN = Math.min(9, (this.cmbN || 0) + 1); this.cmbT = this.time;
    const mul = Math.min(4, 1 + Math.floor((this.cmbN - 1) / 2) * 0.5);
    if (mul > (this.cmbShown || 1)) { this.cmbShown = mul; this.maxCombo = Math.max(this.maxCombo || 1, mul); this.callout(`COMBO x${String(mul).replace('.', ',')}`, 'gold'); }
    return Math.round(pts * mul);
  }
  award(car, amt, text, pts = 0) { if (car.isPlayer && pts) pts = this.combo(pts); car.nitro = Math.min(100, car.nitro + amt * (this.cars?.length > 3 && this.state === 'race' && !this.track.arena && this.standings().indexOf(car) >= this.cars.length / 2 ? 1.25 : 1)); car.score = (car.score || 0) + pts; if (car.isPlayer && text) this.message(text, 'bonus', `+${Math.round(amt)} nitro${pts ? ` · +${pts} punti` : ''}`); }
  handleContacts(dt) {
    this.events.drainContactForceEvents((e) => {
      const A = this.handles.get(e.collider1()), B = this.handles.get(e.collider2()); if (!A || !B) return;
      const J = e.totalForceMagnitude() * dt;
      if (A.kind === 'car' && B.kind === 'car' && A.car !== B.car) this.carCrash(A.car, B.car, J);
      for (const [me, other] of [[A, B], [B, A]]) {
        if (me.kind !== 'car') continue; const car = me.car; if (car.out && car.hp <= 0 && this.track.arena) continue;
        if (other.kind === 'car' && other.car === car) continue;
        const scale = other.kind === 'ground' ? 0.22 : other.kind === 'prop' ? 0.3 : other.kind === 'wall' ? 0.7 : 1;
        const eff = J * scale;
        if (car.isPlayer && other.kind !== 'ground' && eff > 300) this.snd?.scrape(Math.min(0.5, eff / 6000));
        if (eff < 1500) continue;
        // one damage hit per pair every 0.15 s (locked-together cars would otherwise grind each other to death)
        if (other.kind === 'car') { const kk = car.num * 100 + other.car.num; this.pairDmg ||= new Map(); const pd = this.pairDmg.get(kk); if (pd && this.time - pd.t < 0.15 && eff < pd.eff * 1.6) continue; this.pairDmg.set(kk, { t: this.time, eff }); }
        // mass ratio: the same contact force crumples a light car more than a heavy one; team-mates go easy on each other
        const mr = other.kind === 'car' ? Math.max(0.65, Math.min(1.5, Math.sqrt(other.car.spec.mass / car.spec.mass))) * (car.team != null && car.team === other.car.team ? 0.35 : 1) : 1;
        const dmg = Math.min(42, (eff - 1500) / (400 * car.spec.armor)) * (this.track.arena ? 0.62 : 1) * mr;
        // impact point: contact manifold if available, else along the force direction
        // impact point: towards the other body (cars, props), along the motion (walls) or below/above (ground),
        // projected onto the car's box so dents land on the panel that was actually hit
        const bt = car.body.translation(), br = car.body.rotation(); const q = new THREE.Quaternion(br.x, br.y, br.z, br.w), qi = q.clone().invert();
        let dirW;
        if (other.kind === 'car' || other.kind === 'prop') { const ot = (other.kind === 'car' ? other.car.body : other.body).translation(); dirW = new THREE.Vector3(ot.x - bt.x, (ot.y - bt.y) * 0.3, ot.z - bt.z); }
        else if (other.kind === 'ground') { const up = car.dyn?.up || UP; dirW = up.y < 0 ? up.clone() : up.clone().negate(); const lv = car.preV || car.body.linvel(); dirW.addScaledVector(new THREE.Vector3(lv.x, 0, lv.z).normalize(), 0.6); }
        else { const lv = car.preV || car.body.linvel(); dirW = new THREE.Vector3(lv.x, 0, lv.z); if (dirW.lengthSq() < 1) dirW.set(1, 0, 0).applyQuaternion(q); }
        const dl = dirW.applyQuaternion(qi).normalize(); const { L: cL, W: cW } = car.mesh.userData.dims;
        const sc = Math.min(cL / Math.max(1e-3, Math.abs(dl.x)), cW / Math.max(1e-3, Math.abs(dl.z)), 0.6 / Math.max(1e-3, Math.abs(dl.y)));
        const local = new THREE.Vector3(dl.x * sc, 0.62 + dl.y * sc, dl.z * sc);
        const wp = local.clone().applyQuaternion(q).add(new THREE.Vector3(bt.x, bt.y, bt.z));
        const inward = new THREE.Vector3(-local.x, -local.y * 0.3, -local.z).normalize();
        car.lastImpactT = this.time; const ds = (this.simStats.dmgBy ||= {}); ds[other.kind] = Math.round((ds[other.kind] || 0) + dmg);
        this.applyDamage(car, dmg, local, inward, other.kind === 'car' ? other.car : null, wp);
        if (eff > 2400) for (let k = 0; k < Math.min(48, eff / 420) * (this.low ? 0.6 : 1); k++) { const sp = 6 + Math.min(10, eff / 2500); this.sparks.emit(wp.x, wp.y, wp.z, (Math.random() - 0.5) * sp, Math.random() * sp * 0.6, (Math.random() - 0.5) * sp, 0.25 + Math.random() * 0.45, 0.35, 1, 0.75 + Math.random() * 0.2, 0.35, 1); }
        if (eff > 9000 && other.kind === 'car') { this.crowdHype = Math.min(1, (this.crowdHype || 0) + eff / 40000); this.fire.emit(wp.x, wp.y, wp.z, 0, 0.5, 0, 0.12, 1.4, 1, 0.8, 0.5, 0.9); }
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
    const pa = a.body.translation(), pb = b.body.translation(), va = a.preV || a.body.linvel(), vb = b.preV || b.body.linvel();
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
    if (att.isPlayer && vic === this.rival) this.rivalHits = (this.rivalHits || 0) + 1;
    const pts = att.isPlayer ? this.combo(Math.round(K.pts * sev)) : Math.round(K.pts * sev);
    this.simStats.crashes++;
    att.score += pts; this.award(att, K.nitro * Math.min(1.4, sev), null);
    vic.lastHit = { by: att, t: this.time };
    if (att.isPlayer) this.message(K.label, closing > 15 ? 'big' : 'bonus', `+${pts} punti · +${Math.round(K.nitro * Math.min(1.4, sev))} nitro`);
    if (closing > 18 && (att.isPlayer || vic.isPlayer)) this.callout(K.label.replace('!', ''), kind === 'tbone' || kind === 'frontale' ? 'red' : '');
    if (att.isPlayer || vic.isPlayer) {
      if (closing > 15 && this.slowCool <= 0) this.slowmo(0.85);
      const desc = `${K.label.replace('!', '')} ${att.isPlayer ? 'su' : 'da'} ${att.isPlayer ? vic.name : att.name}`;
      this.crashCandidate(closing * (kind === 'tbone' ? 1.5 : kind === 'frontale' ? 1.3 : 1), [att, vic], desc);
    }
  }
  slowmo(t) { this.slowT = t; this.slowCool = 7; }
  // risky driving pays nitro: near misses, two wheels, the loop; also the run's stats for the objectives
  playerStunts(car, dt) {
    const d = car.dyn; if (!d) return;
    this.topSpeed = Math.max(this.topSpeed || 0, d.speed);
    // controller texture: rough verges buzz, a bent wheel shimmies, a burning engine shakes
    if (this.pad) { this._rbT = (this._rbT || 0) - dt; if (this._rbT <= 0) { this._rbT = 0.12; const s = Math.min(1, d.speed / 25), rough = ['grass', 'gravel', 'mud'].includes(car.surfK) ? 1 : 0; const weak = rough * 0.12 * s + Math.abs(car.wobble || 0) * 6 * s + (car.fireT > 0 ? 0.25 : 0); if (weak > 0.03) this.rumble(car.fireT > 0 ? 0.15 : 0, weak, 140); } }
    // near miss: another car passes within a hand's breadth (1.9-3.2 m centre to centre, side by side) without contact
    if (d.speed > 12 && car.hp > 0) {
      const p = car.body.translation(); car._nm ||= new Map();
      for (const o of this.cars) {
        if (o === car || o.out || o.removed || o.ghostT > 0 || (o.team != null && o.team === car.team)) continue;
        const q = o.body.translation(), dx = q.x - p.x, dz = q.z - p.z; if (dx * dx + dz * dz > 400) { car._nm.delete(o); continue; }
        const ax = dx * d.fwd.x + dz * d.fwd.z, la = Math.abs(dx * d.side.x + dz * d.side.z), prev = car._nm.get(o); car._nm.set(o, ax);
        if (prev != null && Math.sign(prev) !== Math.sign(ax) && la > 1.9 && la < 3.2 && this.time - (car.lastImpactT ?? -9) > 0.8 && this.time - (o.lastImpactT ?? -9) > 0.8) {
          const ov = o.body.linvel(), lv = car.body.linvel(), rel = Math.hypot(lv.x - ov.x, lv.z - ov.z);
          if (rel > 6 || d.speed > 22) { this.nearMiss = (this.nearMiss || 0) + 1; this.award(car, 6, 'AL PELO!', 80); }
        }
      }
    }
    if (car.twoWheelT > 0.9 && !car._twoDone) { car._twoDone = true; this.twoWheels = (this.twoWheels || 0) + 1; this.award(car, 10, 'SU DUE RUOTE!', 200); }
    if (!(car.twoWheelT > 0)) car._twoDone = false;
    // the park's loop: upside down with the wheels on the steel, then back upright
    if (d.grounded >= 2 && d.up.y < -0.7 && d.speed > 6) car._loopTop = this.time;
    if (car._loopTop && d.grounded >= 3 && d.up.y > 0.9 && this.time - car._loopTop < 2.5) { car._loopTop = 0; this.loops = (this.loops || 0) + 1; this.award(car, 30, 'GIRO DELLA MORTE!', 600); this.callout('GIRO DELLA MORTE!', 'gold'); }
  }
  applyDamage(car, dmg, local, dir, by, wp) {
    if (dmg <= 0.5) return;
    // the nose is the battering ram, flanks are soft, the boot is the derby driver's best shield
    const Lz = car.mesh.userData.dims.L;
    if (!car.lepre) dmg *= local.x > Lz * 0.45 ? 0.9 : local.x < -Lz * 0.45 ? 0.75 : 1.2;
    if (car.isPlayer) dmg *= this.diff.dmgTaken;
    if (car.lepre && by?.isPlayer) dmg *= 1.7; // the hunt: the golden car has no armoured boot, and every player hit counts more
    if (car.lepre && by?.isPlayer) { this.huntDmg = (this.huntDmg || 0) + dmg; if (dmg > 3) { this.huntHits = (this.huntHits || 0) + 1; car.stunT = 1.8; this.message(`Lepre colpita! ${Math.min(100, Math.round(this.huntDmg))}%`, 'bonus', 'è stordita: insisti!'); } }
    const before = car.hp; car.hp = Math.max(0, car.hp - dmg); if (car.isPlayer) car.minHp = Math.min(car.minHp ?? 100, car.hp);
    this.snd?.impact(car, dmg, by);
    dent(car.mesh, local, dir, Math.min(0.4, dmg * 0.015));
    const ud = car.mesh.userData, L = ud.dims.L;
    const zone = local.x > L * 0.45 ? 'front' : local.x < -L * 0.45 ? 'rear' : local.z > 0 ? 'left' : 'right';
    (car.zoneDmg ||= { front: 0, rear: 0, left: 0, right: 0 })[zone] += dmg;
    if (car.isPlayer && wp && dmg > 4) {
      // the camera is knocked away from the impact; a very short hit-stop sells the big ones
      const pp = car.body.translation(); this.camKick ||= new THREE.Vector3();
      this.camKick.add(new THREE.Vector3(pp.x - wp.x, 0.25, pp.z - wp.z).normalize().multiplyScalar(Math.min(0.7, dmg * 0.025)));
      if (dmg > 12) this.hitStop = Math.min(0.09, 0.03 + dmg * 0.002);
    } else if (by?.isPlayer && dmg > 10) this.hitStop = Math.min(0.07, 0.02 + dmg * 0.0015);
    if (wp && dmg > 14 && this.smoke) for (let k = 0; k < (this.low ? 4 : 8); k++) this.smoke.emit(wp.x, wp.y, wp.z, (Math.random() - 0.5) * 4, 0.5 + Math.random() * 2, (Math.random() - 0.5) * 4, 1.2 + Math.random(), 1.1, 0.35, 0.33, 0.3, 0.45);
    // panels in the hit zone work loose first (bonnet flutters, doors swing, bumpers hang), then fly off
    // windscreens crack, then shatter into glass chips
    if ((zone === 'front' || zone === 'rear') && dmg > 6) {
      if (crackGlass(car.mesh, zone, dmg / 12)) {
        this.snd?.glass(car.mesh.position);
        const q = car.mesh.quaternion, gp = new THREE.Vector3(zone === 'front' ? 0.9 : -1.2, ud.dims.beltY + 0.25, 0).applyQuaternion(q).add(car.mesh.position);
        for (let k = 0; k < 40; k++) this.chips.emit(gp.x, gp.y, gp.z, (Math.random() - 0.5) * 6, 1 + Math.random() * 4, (Math.random() - 0.5) * 6, 0.9 + Math.random() * 0.6, 0.12 + Math.random() * 0.1, 0.75, 0.86, 0.95, 0.9);
      }
    }
    if (wp && dmg > 7) { const rgb = this.paintRGB(car), lv = car.body.linvel(); for (let k = 0; k < Math.min(9, dmg * 0.3) * (this.low ? 0.5 : 1); k++) { const pc = Math.random() < 0.6 ? rgb : [0.45, 0.46, 0.48]; this.chunks.emit(wp.x, wp.y, wp.z, lv.x * 0.5 + (Math.random() - 0.5) * 7, 2 + Math.random() * 4, lv.z * 0.5 + (Math.random() - 0.5) * 7, 0.07 + Math.random() * 0.16, pc[0], pc[1], pc[2], 5); } }
    if (car.isPlayer && dmg > 6) this.hurt = Math.min(0.7, (this.hurt || 0) + dmg / 40);
    if (wp && dmg > 5) for (let k = 0; k < Math.min(22, dmg * 0.8); k++) this.chips.emit(wp.x, wp.y, wp.z, (Math.random() - 0.5) * 5, 1 + Math.random() * 3, (Math.random() - 0.5) * 5, 1 + Math.random(), 0.16, ...this.paintRGB(car), 1);
    // parts in the hit zone lose hit points and may fly off
    for (const pt of [...ud.parts]) if (pt.userData.zone === zone) { const u = pt.userData; u.hp -= dmg * (dmg > 16 ? 1.4 : 1); if (u.hp <= 0) this.detach(car, pt); else if (!u.loose && u.hp < u.hp0 * 0.6) { u.loose = true; if (car.isPlayer && (u.kind === 'bonnet' || u.kind === 'door')) this.snd?.prop?.('fence', car.mesh.position); } }
    // a huge hit near a wheel can tear it off
    if ((dmg > 22 || (dmg > 14 && car.hp < 45)) && Math.abs(local.z) > ud.dims.W * 0.45 && Math.random() < 0.55) {
      let wi = -1, wd = 1.3; ud.wheelPos.forEach(([x, z], i) => { const d = Math.hypot(local.x - x, local.z - z); if (d < wd && !car.wheelLost[i]) { wd = d; wi = i; } });
      if (wi >= 0 && car.wheelLost.filter(Boolean).length < 2) this.detachWheel(car, wi);
    }
    if (dmg > 9 && Math.abs(local.z) > ud.dims.W * 0.4) { let wi = -1, wd = 1.2; ud.wheelPos.forEach(([x, z], i) => { const d = Math.hypot(local.x - x, local.z - z); if (d < wd) { wd = d; wi = i; } }); if (wi >= 0) { const w = ud.wheels[wi].userData, sg = ud.wheelPos[wi][1] > 0 ? 1 : -1; w.bent = Math.max(-0.3, Math.min(0.3, w.bent + sg * (0.03 + dmg * 0.004) * (Math.random() < 0.8 ? 1 : -1))); w.toe = Math.max(-0.12, Math.min(0.12, w.toe + (Math.random() - 0.5) * dmg * 0.006)); } }
    if (by && by !== car) { car.lastHit = { by, t: this.time }; by.score += Math.round(dmg * 3); if (car.ai && !car.ai.nemesis && dmg > 9) { car.ai.grudge = by; car.ai.grudgeT = 16 + Math.random() * 8; } }
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
    car.vc.setWheelRadius?.(i, ud.wrs[i] * 0.45);
    this.toDebris(car, clone, 18);
    this.snd?.wheelOff(car);
    if (car.isPlayer) this.message('HAI PERSO UNA RUOTA!', 'wreck');
    else if (car.lastHit?.by?.isPlayer) this.award(car.lastHit.by, 12, 'RUOTA VOLANTE!', 150);
  }
  repairWheels(car) { const ud = car.mesh.userData; for (let i = 0; i < 4; i++) if (car.wheelLost[i]) { car.wheelLost[i] = false; ud.wheels[i].visible = true; car.vc.setWheelRadius?.(i, ud.wrs[i]); } }
  wreck(car) {
    car.wrecks++; this.simStats.wrecks++; car.burnT = 12;
    const killer = car.lastHit && this.time - car.lastHit.t < 4 ? car.lastHit.by : null;
    if (killer) { killer.kills = (killer.kills || 0) + 1; this.award(killer, 35, killer.isPlayer ? `HAI DEMOLITO ${car.name.toUpperCase()}!` : null, 500); }
    if (car.isPlayer) { this.message('AUTO DISTRUTTA!', 'wreck'); this.callout('DISTRUTTO!', 'red'); this.slowmo(1.1); this.rumble(1, 1, 600); }
    else if (!killer?.isPlayer) this.message(`${car.name} è distrutto`, 'info', killer ? `da ${killer.name}` : '');
    if (killer?.isPlayer && car === this.rival) { this.rivalWrecked = true; this.message(`${car.name.toUpperCase()} È A PEZZI!`, 'big', 'il rivale non la prenderà bene'); }
    if (killer?.isPlayer) { this.callout('DEMOLITO!', 'red'); if (this.slowCool <= 0) this.slowmo(0.9); }
    const dot = (c) => `<i style="background:${c.color}"></i>${c.isPlayer ? '<b>' : ''}${String(c.name).replace(/[<>&]/g, '')}${c.isPlayer ? '</b>' : ''}`;
    this.feed(killer ? `${dot(killer)}<u>✖</u>${dot(car)}` : `${dot(car)}<u>✖</u><em>fuori uso</em>`);
    this.crowdHype = 1;
    // crumple the shell all round: a wreck has to look like one
    { const { L, W } = car.mesh.userData.dims; for (let k = 0; k < 3; k++) { const a = Math.random() * 6.28, loc = new THREE.Vector3(Math.cos(a) * L * 0.9, 0.7 + Math.random() * 0.5, Math.sin(a) * W * 0.9); dent(car.mesh, loc, loc.clone().setY(0.4).negate().normalize(), 0.22); } }
    if (killer?.isPlayer || car.isPlayer) this.crashCandidate(24, [car, killer].filter(Boolean), car.isPlayer ? 'La tua auto distrutta' : `Demolizione di ${car.name}`);
    // explosion
    const p = car.body.translation();
    for (let k = 0; k < 40; k++) this.fire.emit(p.x, p.y + 0.8, p.z, (Math.random() - 0.5) * 6, 2 + Math.random() * 5, (Math.random() - 0.5) * 6, 0.4 + Math.random() * 0.5, 1.1, 1, 0.35 + Math.random() * 0.3, 0.06, 0.9);
    for (let k = 0; k < 20; k++) this.smoke.emit(p.x, p.y + 1, p.z, (Math.random() - 0.5) * 3, 2 + Math.random() * 2, (Math.random() - 0.5) * 3, 3, 1.6, 0.08, 0.08, 0.08, 0.75);
    try { buildScorch(this, p.x, p.z); buildScorch(this, p.x + (Math.random() - 0.5) * 3, p.z + (Math.random() - 0.5) * 3, 2.2, 'oil'); } catch {}
    this.shock.fire(p.x, this.terrain.heightAt(p.x, p.z), p.z, 30); this.shockFx = { t: 0, p: new THREE.Vector3(p.x, p.y + 0.8, p.z) };
    { const rgb = this.paintRGB(car); for (let k = 0; k < (this.low ? 10 : 26); k++) { const a = Math.random() * 6.28, sp = 4 + Math.random() * 9; const pc = k % 3 === 0 ? [0.12, 0.12, 0.13] : k % 3 === 1 ? rgb : [0.5, 0.5, 0.52]; this.chunks.emit(p.x, p.y + 0.6, p.z, Math.cos(a) * sp, 4 + Math.random() * 8, Math.sin(a) * sp, 0.18 + Math.random() * 0.3, pc[0], pc[1], pc[2], 7); } for (let k = 0; k < 30; k++) this.sparks.emit(p.x, p.y + 0.8, p.z, (Math.random() - 0.5) * 22, 3 + Math.random() * 12, (Math.random() - 0.5) * 22, 0.5 + Math.random() * 0.6, 0.4); }
    if (this.camera.position.distanceTo(car.mesh.position) < 22) { this.lens.splat('mud', 5, 1.1); this.shake = Math.min(1.2, this.shake + 0.5); }
    this.snd?.explode(car);
    if (car.lepre && this.state === 'race') { this.huntWreck = (this.huntDmg || 0) >= 30; car.out = true; car.outT = this.time; this.message('LEPRE DEMOLITA!', 'big'); this.finishOrder = this.standings(); this.finish(); return; }
    if (this.track.arena && !this.track.park) {
      car.out = true; car.outT = this.time;
      if (this.spectate === car) { this._specSwapT = this.time + 1.4; if (killer && !killer.out) { const k = killer; setTimeout(() => { if (this.spectate === car && !k.out) { this.spectate = k; this.camPos = null; } }, 1400); } }
    }
    else if (this.mode !== 'stunt') car.wreckT = 4.5; // respawn after a pause, with patched-up car
  }

  // ---------------------------------------------------------------- rival card & end-of-cup podium
  rivalCard() {
    const rv = this.rivalDef, car = this.rival; if (!rv || !car || !this.hud) return;
    const el = document.createElement('div'); el.className = 'dzx-rival on';
    el.innerHTML = `${portrait(rv, 64)}<div><small>Il tuo rivale${car.grudge ? ` · rancore ${car.grudge}/5` : ''}</small><b>${rv.name}</b><em>«${rv.taunt[(rivalState(rv.id).beat + rivalState(rv.id).lost) % rv.taunt.length]}»</em></div>`;
    this.hud.root.appendChild(el); setTimeout(() => el.classList.remove('on'), 4200); setTimeout(() => el.remove(), 4800);
  }
  startPodium(pd) {
    this.state = 'podium'; this.hud.root.classList.add('replaying');
    const P = this.player, base = P.mesh.position.clone(), T = this.terrain; base.y = T.heightAt(base.x, base.z);
    const others = this.cars.filter((c) => c !== P && c !== this.rival);
    const meshOf = (row) => (row.me ? P.mesh : row.rv && this.rival ? this.rival.mesh : (others.shift() || this.cars[1])?.mesh);
    const H = [1.5, 1.0, 0.6], X = [0, -4.2, 4.2], mat = [0xffcf3a, 0xc9ced6, 0xc9803f].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.35, metalness: 0.6 }));
    for (const c of this.cars) c.mesh.visible = false;
    this.podium = { t: 0, base, items: [] };
    pd.rows.forEach((row, i) => {
      const blk = new THREE.Mesh(new THREE.BoxGeometry(3.8, H[i], 3.4), mat[i]); blk.position.set(base.x + X[i], base.y + H[i] / 2, base.z); blk.castShadow = blk.receiveShadow = true; this.scene.add(blk);
      const m = meshOf(row); if (m) { m.visible = true; m.position.set(base.x + X[i], base.y + H[i] + 0.55, base.z); m.quaternion.setFromAxisAngle(UP, Math.PI / 2); }
      this.podium.items.push(blk);
    });
    const el = document.createElement('div'); el.className = 'dzx-podium on';
    const rv = pd.rv, line = rv ? (pd.win ? rv.outroWin : rv.outroLose) : '';
    el.innerHTML = `<div class="pc"><div class="dzx-sub">${pd.cup.name} · classifica finale</div><h2>${pd.win ? 'HAI VINTO LA COPPA!' : 'COPPA CONCLUSA'}</h2><div class="pp">${pd.rows.map((r, i) => `<div>${r.rv ? portrait(r.rv, 52) : `<svg viewBox="0 0 64 64"><rect width="64" height="64" fill="${r.me ? '#ffd400' : '#555'}"/><text x="32" y="42" text-anchor="middle" font-size="26" font-weight="900" fill="#111">${r.me ? 'TU' : String(r.name)[0]}</text></svg>`}<b>${i + 1}° ${String(r.name).replace(/[<>&]/g, '')}</b><span>${r.pts} pt</span></div>`).join('')}</div><p>${line}</p><button class="btn primary lg" data-podium-ok>Continua · Invio / A</button></div>`;
    this.hud.root.appendChild(el); this.podiumEl = el;
    const ok = () => this.endPodium(); el.querySelector('[data-podium-ok]').addEventListener('click', ok); setTimeout(() => el.querySelector('[data-podium-ok]')?.focus?.({ preventScroll: true }), 400);
    this._podKey = (e) => { if (e.code === 'Enter' || e.code === 'Escape' || e.code === 'Space') { e.preventDefault(); ok(); } }; window.addEventListener('keydown', this._podKey);
    try { sfx.win(); } catch {} this.snd?.crowd?.(1);
  }
  endPodium() {
    if (this.state !== 'podium') return; window.removeEventListener('keydown', this._podKey); this.podiumEl?.remove(); this.hud.root.classList.remove('replaying');
    this.state = 'finished'; for (const c of this.cars) c.mesh.visible = !c.removed; this.camPos = null; this.hud.results.classList.add('on');
    setTimeout(() => this.hud?.results.querySelector('.btn.primary')?.focus?.({ preventScroll: true }), 300);
  }
  podiumFrame(dt) {
    const S = this.podium; S.t += dt; const b = S.base, a = S.t * 0.35;
    this.camera.position.set(b.x + Math.cos(a) * 12, b.y + 4.2, b.z + Math.sin(a) * 12); this.camera.lookAt(b.x, b.y + 1.6, b.z); this.camera.fov = 48; this.camera.updateProjectionMatrix();
    const gp = navigator.getGamepads?.()?.find?.((g) => g); if (gp?.buttons[0]?.pressed && S.t > 1) this.endPodium();
    for (let k = 0; k < 4; k++) { const c = [[1, 0.2, 0.2], [1, 0.85, 0.2], [0.2, 0.6, 1], [0.3, 1, 0.4]][k]; this.chips.emit(b.x + (Math.random() - 0.5) * 12, b.y + 9, b.z + (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 2, -1, (Math.random() - 0.5) * 2, 3, 0.18, c[0], c[1], c[2], 1); }
    this.chips.update(dt); this.smoke.update(dt); this.fire.update(dt); this.fxFrame(dt, false);
    this.sun.position.copy(b).addScaledVector(this.sunDir, 150); this.sun.target.position.copy(b);
    if (this.composer) this.composer.render(); else this.renderer.render(this.scene, this.camera);
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
    // flying debris (panels, wheels) is recorded too, so the replay shows the bonnet cartwheeling away
    const dbr = this.debris.length ? this.debris.map((d) => { const t = d.body.translation(), r = d.body.rotation(); return [d, t.x, t.y, t.z, r.x, r.y, r.z, r.w]; }) : null;
    this.rec.push({ t: this.time, f, dbr }); while (this.rec.length && this.rec[0].t < this.time - 6) this.rec.shift();
    const bc = this.bestCrash; if (bc && !bc.saved && this.time >= bc.until) { bc.saved = true; this.replay = { frames: this.rec.filter((r) => r.t >= bc.t - 3.2), focus: bc.focus, desc: bc.desc, hitT: bc.t, score: bc.score }; }
  }
  startReplay(auto = false) {
    if (!this.replay?.frames.length) return;
    this._preReplay = this.state === 'replay' ? this._preReplay : this.state; this.state = 'replay'; this.replayT = 0; this.replayAuto = auto; this.replayCut = -1;
    this.hud.root.classList.add('replaying'); this.hud.replay.classList.add('on');
    const d = this.hud.replay.querySelector('span'); if (d) d.textContent = this.replay.desc || 'Il botto più bello della gara';
  }
  stopReplay() {
    if (this.state !== 'replay') return; for (const d of this.debris) d.mesh.visible = true;
    this.state = this._preReplay || 'finished'; this.hud.root.classList.remove('replaying'); this.hud.replay.classList.remove('on'); this.camPos = null; this.camera.fov = 64;
    if (this.replayAuto) { this.replayAuto = false; this.hud.results.classList.add('on'); setTimeout(() => { if (this.hud?.results.classList.contains('on') && this.state !== 'replay') this.hud.results.querySelector('.btn.primary')?.focus?.({ preventScroll: true }); }, 700); }
  }
  replayFrame(dt) {
    const R = this.replay, F = R.frames, t0 = F[0].t, tEnd = F[F.length - 1].t;
    // slow motion around the impact, quicker before and after; three camera cuts
    const tHit = R.hitT ?? (t0 + 3.2), cur = t0 + this.replayT, near = Math.abs(cur - tHit) < 0.9;
    const rate = near ? 0.28 : 0.85; this.replayT += dt * rate;
    let t = t0 + this.replayT;
    if (t > tEnd) { if (this.replayAuto) { this.stopReplay(); return; } this.replayT = 0; t = t0; }
    let i = 0; while (i < F.length - 2 && F[i + 1].t < t) i++;
    const a = F[i], b = F[Math.min(F.length - 1, i + 1)], u = Math.max(0, Math.min(1, (t - a.t) / ((b.t - a.t) || 1)));
    const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
    { const seen = new Set(); const bm = new Map((b.dbr || []).map((e) => [e[0], e]));
      for (const e of a.dbr || []) { const d = e[0], e2 = bm.get(d) || e; seen.add(d); tmpQ.set(e[4], e[5], e[6], e[7]).slerp(qb.set(e2[4], e2[5], e2[6], e2[7]), u); d.mesh.quaternion.copy(tmpQ).multiply(d.q0); d.mesh.position.copy(d.off).applyQuaternion(tmpQ).add(tmpV.set(e[1] + (e2[1] - e[1]) * u, e[2] + (e2[2] - e[2]) * u, e[3] + (e2[3] - e[3]) * u)); d.mesh.visible = true; }
      for (const d of this.debris) if (!seen.has(d)) d.mesh.visible = false; }
    this.cars.forEach((c, k) => { const o = k * 7; c.mesh.position.set(a.f[o] + (b.f[o] - a.f[o]) * u, a.f[o + 1] + (b.f[o + 1] - a.f[o + 1]) * u, a.f[o + 2] + (b.f[o + 2] - a.f[o + 2]) * u); qa.set(a.f[o + 3], a.f[o + 4], a.f[o + 5], a.f[o + 6]); qb.set(b.f[o + 3], b.f[o + 4], b.f[o + 5], b.f[o + 6]); c.mesh.quaternion.copy(qa.slerp(qb, u)); });
    const foc = (this.cars[R.focus[0]]?.mesh.position || this.player.mesh.position).clone();
    const f2 = this.cars[R.focus[1]]?.mesh.position; if (f2 && f2.distanceTo(foc) < 25) foc.lerp(f2, 0.5);
    const cut = t < tHit - 1.2 ? 0 : t < tHit + 0.6 ? 1 : 2;
    if (cut !== this.replayCut) {
      // a new shot: pick a fixed vantage point for it (trackside, low, or high and wide)
      this.replayCut = cut; const ang = Math.random() * 6.28, dist = cut === 1 ? 7 : cut === 0 ? 14 : 18;
      this.replayCam = new THREE.Vector3(foc.x + Math.cos(ang) * dist, 0, foc.z + Math.sin(ang) * dist);
      this.replayCam.y = this.terrain.heightAt(this.replayCam.x, this.replayCam.z) + (cut === 1 ? 1.1 : cut === 0 ? 2.2 : 7);
      this.replayOff = this.replayCam.clone().sub(foc); this.replayFov = cut === 1 ? 50 : 42;
    }
    // the run-up and the aftermath travel with the cars (the second slowly orbits); the impact shot is a fixed trackside camera
    const cp = this.replayCam;
    if (cut !== 1) { if (cut === 2) this.replayOff.applyAxisAngle(UP, dt * rate * 0.35); cp.copy(foc).add(this.replayOff); cp.y = Math.max(cp.y, this.terrain.heightAt(cp.x, cp.z) + 1.2); }
    this.camera.position.copy(cp); this.camera.lookAt(foc.x, foc.y + 0.6, foc.z);
    this.camera.fov += (this.replayFov - this.camera.fov) * Math.min(1, dt * 3); this.camera.updateProjectionMatrix();
    this.dust.update(dt * rate); this.smoke.update(dt * rate); this.fire.update(dt * rate); this.sparks.update(dt * rate, this.terrain); this.chips.update(dt * rate); this.fxFrame(dt * rate, false);
    this.sun.position.copy(foc).addScaledVector(this.sunDir, 150); this.sun.target.position.copy(foc);
    if (this.composer) this.composer.render(); else this.renderer.render(this.scene, this.camera);
  }

  // ---------------------------------------------------------------- race logic
  updateProgress(car) {
    const tr = this.track; if (tr.arena || tr.stunt) return;
    const p = car.body.translation(); let best = car.idx, bd = 1e9;
    for (let k = -30; k <= 60; k++) { const i = (car.idx + k + tr.N) % tr.N; const q = tr.pts[i]; const d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2; if (d < bd) { bd = d; best = i; } }
    if (best < tr.N * 0.2 && car.idx > tr.N * 0.8) {
      if (car.half) {
        car.lap++; car.half = false;
        if (car.lapStart != null && this.state === 'race') { const lt = this.time - car.lapStart; car.lastLap = lt; if (!car.bestLap || lt < car.bestLap) { car.bestLap = lt; if (car.isPlayer && car.lap > 1) this.message('Giro più veloce!', 'info'); } }
        car.lapStart = this.time;
        if (car.isPlayer && car.lap < this.laps && this.mode !== 'elim') this.message(car.lap === this.laps - 1 ? 'ULTIMO GIRO!' : `Giro ${car.lap + 1}`, 'info');
        if (this.mode === 'elim' && this.state === 'race' && car.lap > (this.elimLap || 0)) { this.elimLap = car.lap; this.eliminateLast(); }
        else if (car.lap >= this.laps && !car.finished) { car.finished = true; car.time = this.time; this.finishOrder.push(car); if (car.isPlayer) this.finish(); }
      }
    }
    if (best > tr.N * 0.45 && best < tr.N * 0.6) car.half = true;
    car.idx = best; car.offTrack = Math.sqrt(bd);
    car.prog = car.lap * tr.N + best + (car.finished ? 1e6 - car.time : 0);
  }
  standings() {
    const ms = MODES5.standings(this); if (ms) return ms;
    if (this.mode === 'elim') return this.cars.slice().sort((a, b) => (a.out - b.out) || (a.out ? (b.outT || 0) - (a.outT || 0) : (b.prog || 0) - (a.prog || 0)));
    if (this.track.arena) return this.cars.slice().sort((a, b) => (a.out - b.out) || (b.outT || 0) - (a.outT || 0) || b.hp - a.hp);
    return this.cars.slice().sort((a, b) => (b.prog || 0) - (a.prog || 0));
  }
  // ---------------------------------------------------------------- event types
  setupMode() {
    this.laps = this.o.laps || this.venue.laps;
    if (this.mode === 'elim') this.laps = this.cars.length + 1; // the race ends by elimination
    if (this.mode === 'time' || this.mode === 'distruzione') {
      this.laps = this.o.laps || 2;
      // reference lap from the racing-line speed profile at a strong AI pace, scaled by the player's car
      let ref = 0; for (let i = 0; i < this.track.N; i++) ref += this.track.ds / Math.max(4, this.line.spd[i] * 0.958 * this.player.spec.top ** 0.5);
      const total = ref * this.laps + 2.5; // standing start
      this.targets = (this.mode === 'distruzione' ? [total * 1.22, total * 1.1, total * 1.02] : [total * 1.16, total * 1.06, total * 1.0]).map((t) => Math.round(t * 10) / 10);
    }
    MODES5.setup(this);
    if (['race', 'elim', 'caccia'].includes(this.mode) && this.laps >= 4 && this.dopts.pit !== false && !this.track.arena && !this.track.stunt) this.buildPit();
    this.objectives = pickObjectives(this);
    if (this.mode === 'time') this.loadGhost();
    if (this.mode === 'stunt') { this.targets = this.o.targets || [60, 80, 95]; this.stunt = { att: 1, max: 3, phase: 'hold', t: 0, best: 0, dists: [], hold: 1.6 }; }
    if (this.mode === 'caccia') { this.huntDmg = 0; this.player.nitro = 100; this.laps = this.o.laps || Math.max(4, this.venue.laps); }
  }
  // ---- pit box (v5): a drive-through repair lane on the straightest stretch, for races of 4+ laps
  buildPit() {
    const tr = this.track, N = tr.N, L = Math.round(55 / tr.ds); let best = -1, bs = 1e9;
    for (let i = Math.round(N * 0.15); i < N * 0.85; i += 2) {
      if (this.near(tr.jumps, i, 70) || tr.crossings.some((c) => Math.min(Math.abs(c - i), N - Math.abs(c - i)) < L + 20)) continue;
      let k = 0; for (let j = -6; j < L + 6; j++) k += Math.abs(tr.pts[(i + j) % N].k); if (k < bs) { bs = k; best = i; }
    }
    if (best < 0) return;
    const hw = tr.width / 2, lat = hw - 2.2, P = [], I = [], UV = [];
    for (let j = 0; j <= L; j++) { const p = tr.pts[(best + j) % N], nx = -Math.sin(p.h), nz = Math.cos(p.h); for (const o of [hw - 4.4, hw - 0.2]) { const x = p.x + nx * o, z = p.z + nz * o; P.push(x, this.terrain.heightAt(x, z) + 0.05, z); } UV.push(0, j / 2, 1, j / 2); }
    for (let j = 0; j < L; j++) { const a = j * 2; I.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const c = document.createElement('canvas'); c.width = 64; c.height = 64; const g = c.getContext('2d'); g.fillStyle = 'rgba(30,90,220,0.55)'; g.fillRect(0, 0, 64, 64); g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(0, 0, 5, 64); g.fillRect(59, 0, 5, 64); g.fillRect(28, 0, 8, 22);
    const t = new THREE.CanvasTexture(c); t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); geo.setIndex(I); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 })); m.receiveShadow = true; this.scene.add(m);
    // the sign: a blue board with BOX on a post at the lane entry
    const sc = document.createElement('canvas'); sc.width = 256; sc.height = 96; const sg = sc.getContext('2d'); sg.fillStyle = '#1e50c8'; sg.fillRect(0, 0, 256, 96); sg.strokeStyle = '#fff'; sg.lineWidth = 8; sg.strokeRect(6, 6, 244, 84); sg.fillStyle = '#fff'; sg.font = 'italic 900 64px Arial'; sg.textAlign = 'center'; sg.fillText('BOX', 128, 70);
    const st = new THREE.CanvasTexture(sc); st.colorSpace = THREE.SRGBColorSpace;
    const p0 = tr.pts[best], ox = p0.x - Math.sin(p0.h) * (hw + 1.6), oz = p0.z + Math.cos(p0.h) * (hw + 1.6), oy = this.terrain.heightAt(ox, oz);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.0), new THREE.MeshStandardMaterial({ map: st, side: THREE.DoubleSide, emissive: 0x2050ff, emissiveIntensity: this.night ? 0.8 : 0.1 })); board.position.set(ox, oy + 3.2, oz); board.rotation.y = -p0.h + Math.PI / 2; this.scene.add(board);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.2, 6), new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.7, roughness: 0.4 })); post.position.set(ox, oy + 1.6, oz); this.scene.add(post);
    this.pit = { i0: best, L, lat, lo: hw - 4.8, hi: hw + 0.8, near: false, inside: false };
  }
  pitTick(car, dt) {
    const S = this.pit, tr = this.track, rel = (car.idx - S.i0 + tr.N) % tr.N, la = this.lateralOf(car.body.translation().x, car.body.translation().z, car.idx);
    const inside = rel <= S.L && la > S.lo && la < S.hi;
    if (car.isPlayer) { S.near = car.hp < 70 && ((tr.N - rel) % tr.N < 60 || inside); S.inside = inside && (car.dyn?.speed || 0) < 14; }
    if (!inside || (car.dyn?.speed || 0) > 14 || car.hp <= 0 || this.state !== 'race') { car.pitT = 0; return; }
    car.pitT = (car.pitT || 0) + dt;
    car.hp = Math.min(100, car.hp + dt * 14); car.fireT = 0; car.heat = Math.max(0, (car.heat || 0) - dt * 0.4); car.hotN = 0;
    if (car.zoneDmg) for (const z in car.zoneDmg) car.zoneDmg[z] = Math.max(0, car.zoneDmg[z] - dt * 16);
    if (car.pitT > 1.6) { const ws = car.mesh.userData.wheels; for (const w of ws) { w.userData.bent *= 0.9; w.userData.toe *= 0.9; } if (car.wheelLost.some(Boolean)) { this.repairWheels(car); if (car.isPlayer) this.message('RUOTE NUOVE!', 'info'); } }
    if (car.isPlayer && !car._pitMsg) { car._pitMsg = true; this.message('AL BOX', 'info', 'resta sotto i 50 km/h per riparare'); setTimeout(() => { car._pitMsg = false; }, 6000); }
  }

  // ---- time-trial ghost: best run per venue and lap count, kept in its own localStorage key
  ghostKey() { return `${this.venue.id}:${this.laps}`; }
  loadGhost() {
    this.ghostRec = []; this.ghostRecT = 0;
    let all = {}; try { all = JSON.parse(localStorage.getItem('apexdynasty_derby_ghost') || '{}') || {}; } catch {}
    const G = all[this.ghostKey()]; if (!G?.frames) return;
    try {
      const bin = atob(G.frames), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const f = new Float32Array(u8.buffer); if (f.length < 16) return;
      const mesh = buildBanger(G.car || 'berlina', G.color || '#8fd3ff', 0, 5, { livery: 'classica', clean: true, stickers: false });
      mesh.traverse((o) => { if (o.isMesh) { o.material = (Array.isArray(o.material) ? o.material[0] : o.material).clone(); o.material.transparent = true; o.material.opacity = 0.32; o.material.depthWrite = false; o.material.emissive?.set?.(0x3a6aa0); o.castShadow = false; o.receiveShadow = false; } });
      this.scene.add(mesh); this.ghost = { mesh, f, time: G.time, n: f.length / 8 };
    } catch (e) { console.warn('ghost', e); }
  }
  recordGhost(dt) {
    if (this.state !== 'race') return; this.ghostRecT -= dt; if (this.ghostRecT > 0) return; this.ghostRecT = 0.1;
    const t = this.player.body.translation(), r = this.player.body.rotation(); this.ghostRec.push(this.time, t.x, t.y, t.z, r.x, r.y, r.z, r.w);
  }
  updateGhost() {
    const G = this.ghost; if (!G) return; const t = this.state === 'countdown' ? 0 : this.time, f = G.f;
    let lo = 0, hi = G.n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (f[m * 8] <= t) lo = m; else hi = m; }
    const a = lo * 8, b = hi * 8, u = Math.max(0, Math.min(1, (t - f[a]) / ((f[b] - f[a]) || 1)));
    G.mesh.position.set(f[a + 1] + (f[b + 1] - f[a + 1]) * u, f[a + 2] + (f[b + 2] - f[a + 2]) * u, f[a + 3] + (f[b + 3] - f[a + 3]) * u);
    tmpQ.set(f[a + 4], f[a + 5], f[a + 6], f[a + 7]).slerp(new THREE.Quaternion(f[b + 4], f[b + 5], f[b + 6], f[b + 7]), u); G.mesh.quaternion.copy(tmpQ);
    G.mesh.visible = t < f[(G.n - 1) * 8] + 2 && G.mesh.position.distanceToSquared(this.player.mesh.position) > 9;
  }
  saveGhost(time) {
    if (!this.ghostRec?.length || !time) return false;
    let all = {}; try { all = JSON.parse(localStorage.getItem('apexdynasty_derby_ghost') || '{}') || {}; } catch {}
    const k = this.ghostKey(); if (all[k]?.time && all[k].time <= time) return false;
    const u8 = new Uint8Array(new Float32Array(this.ghostRec).buffer); let bin = ''; for (let i = 0; i < u8.length; i += 8192) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 8192));
    all[k] = { time, car: this.player.spec.id, color: this.player.color, frames: btoa(bin) };
    try { localStorage.setItem('apexdynasty_derby_ghost', JSON.stringify(all)); } catch { return false; }
    return true;
  }
  eliminateLast() {
    const act = this.cars.filter((c) => !c.out); if (act.length <= 1) return;
    const last = act.reduce((a, b) => ((a.prog || 0) <= (b.prog || 0) ? a : b));
    last.out = true; last.outT = this.time; last.elimLap = this.elimLap;
    this.setGhost(last, 9999); last.removeT = 1.4;
    const left = act.length - 1;
    this.message(last.isPlayer ? 'SEI STATO ELIMINATO!' : `${last.name} eliminato!`, last.isPlayer ? 'wreck' : 'info', last.isPlayer ? '' : `${left} in gara`);
    this.feed(`<i style="background:${last.color}"></i>${last.isPlayer ? '<b>' : ''}${String(last.name).replace(/[<>&]/g, '')}${last.isPlayer ? '</b>' : ''}<u>⚑</u><em>eliminato · giro ${this.elimLap}</em>`);
    this.snd?.horn();
    if (left <= 1) { this.finishOrder = this.standings(); this.finish(); return; }
    if (last.isPlayer) {
      // out of the race: watch the leader until the end (or skip straight to the results)
      this.callout('ELIMINATO!', 'red');
      this.startSpectate(act.filter((c) => c !== last).reduce((a, b) => ((a.prog || 0) >= (b.prog || 0) ? a : b)), 'ELIMINATO');
    }
  }
  startSpectate(car, title) {
    if (!car) { this.finishOrder = this.standings(); this.finish(); return; }
    this.spectate = car; this.camPos = null;
    if (this.hud) { if (this.hud.specT) this.hud.specT.textContent = title || 'ELIMINATO'; this.hud.spec?.classList.add('on'); this.hud.root.classList.add('spectating'); }
  }
  // arena spectator target: the strongest survivor (kills first, then health)
  arenaFocus() { const act = this.cars.filter((c) => !c.out); return act.reduce((a, b) => (((b.kills || 0) * 30 + b.hp) > ((a.kills || 0) * 30 + a.hp) ? b : a), act[0]); }
  endSpectate() { if (!this.spectate || this.state !== 'race') return; this.finishOrder = this.standings(); this.finish(); }
  stuntTick(dt) {
    const S = this.stunt, c = this.player, p = c.body.translation(), tr = this.track;
    S.t += dt;
    if (S.phase === 'hold') { if (S.t > S.hold) { S.phase = 'run'; S.t = 0; this.message(`Tentativo ${S.att}/${S.max}`, 'go', 'Gas a tavoletta!'); } return; }
    const ground = c.dyn?.grounded || 0;
    if (S.phase === 'run') {
      if (p.x > tr.lipX + 0.5 && ground === 0) { S.phase = 'air'; S.t = 0; S.maxY = p.y; S.launchV = c.dyn.speed; S.rot = 0; }
      else if (S.t > 45 || (S.t > 4 && c.dyn.speed < 1 && p.x < tr.lipX)) this.stuntEnd(0, 'Tentativo nullo');
      return;
    }
    if (S.phase === 'air') {
      S.maxY = Math.max(S.maxY, p.y); S.rot += Math.abs(c.body.angvel().x) * dt + Math.abs(c.body.angvel().z) * dt;
      S.live = Math.max(0, p.x - tr.lipX);
      if (ground >= 2 || (S.t > 0.3 && c.lastImpactT > this.time - 0.05)) {
        const d = Math.round(Math.max(0, p.x - tr.lipX) * 10) / 10; S.air = S.t; S.phase = 'landed'; S.t = 0; S.cur = d;
        const flips = Math.floor(S.rot / (Math.PI * 1.6)); this.flips = (this.flips || 0) + flips;
        const best = d > S.best; if (best) S.best = d; this.callout(`SALTO ${d.toFixed(1).replace(".", ",")} m`, d >= this.targets[2] ? "gold" : d >= this.targets[0] ? "air" : "");
        this.message(`${d.toFixed(1).replace('.', ',')} m`, d >= this.targets[2] ? 'big' : 'bonus', `${best ? 'Nuovo record! ' : ''}${flips ? `${flips} capriol${flips > 1 ? 'e' : 'a'} · ` : ''}altezza ${Math.round(S.maxY - (tr.pts[tr.lipIdx]?.y || 0))} m`);
        this.player.score += Math.round(d * 4 + flips * 250); if (flips) this.award(c, 0, null, 0);
        this.crashCandidate(d, [c], `Salto di ${d.toFixed(1)} m`);
        this.shake = Math.min(1.2, this.shake + 0.6); this.snd?.crowd(1);
      }
      return;
    }
    if (S.phase === 'landed' && (S.t > 4.5 || (S.t > 1.5 && c.dyn.speed < 2))) this.stuntEnd(S.cur);
  }
  stuntEnd(d, why) {
    const S = this.stunt; S.dists.push(d); if (why) this.message(why, 'wreck');
    if (S.att >= S.max) { this.finishOrder = [this.player]; this.finish(); return; }
    S.att++; S.phase = 'hold'; S.t = 0; S.live = 0;
    this.respawn(this.player); this.player.hp = Math.max(this.player.hp, 60); this.repairWheels(this.player);
    for (let i = 0; i < 4; i++) this.skids.break(this.player.num * 10 + i);
  }
  finish() {
    if (this.state === 'finished') return;
    this.state = 'finished'; this.endT = this.time; this.hud?.spec?.classList.remove('on');
    if (this.bestCrash && !this.bestCrash.saved) { this.bestCrash.saved = true; this.replay = { frames: this.rec.filter((r) => r.t >= this.bestCrash.t - 3.2), focus: this.bestCrash.focus, desc: this.bestCrash.desc, hitT: this.bestCrash.t, score: this.bestCrash.score }; }
    setTimeout(() => this.endScreen(), this.track.arena ? 1500 : 300);
  }
  endScreen() {
    if (this.dead || this._ended) return; this._ended = true;
    this.result = this.computeResult();
    if (this.o.championship) {
      const res = this.finishOrder.length ? [...this.finishOrder, ...this.standings().filter((c) => !this.finishOrder.includes(c))] : this.standings();
      const fastest = this.track.arena ? null : res.filter((c) => c.bestLap).sort((a, b) => a.bestLap - b.bestLap)[0];
      this.champResult = champRecord(this.venue.id, res.map((c, i) => ({ name: c.name, isPlayer: c.isPlayer, pos: i + 1, kills: c.kills || 0, fastest: c === fastest })));
    }
    const r = showResults(this, this.result);
    if (this.result.podium) { this.hud.results.classList.remove('on'); this.startPodium(this.result.podium); this.onEnd(r); return; }
    this.onEnd(r);
    // the best crash of the race is shown once before the results (skip: Invio / Esc / A)
    if (this.replay?.frames?.length > 20 && this.state === 'finished' && this.o.autoReplay !== false) { this.hud.results.classList.remove('on'); this.startReplay(true); }
    else setTimeout(() => { if (this.hud?.results.classList.contains('on') && this.state !== 'replay') this.hud.results.querySelector('.btn.primary')?.focus?.({ preventScroll: true }); }, 700);
  }
  computeResult() {
    const res = this.finishOrder.length ? [...this.finishOrder, ...this.standings().filter((c) => !this.finishOrder.includes(c))] : this.standings();
    const P = this.player, pos = res.indexOf(P) + 1;
    const r = { mode: this.mode, pos, rows: res, venue: this.venue.id, kills: P.kills || 0, score: Math.round(P.score || 0), bestLap: P.bestLap || null, time: P.finished ? P.time : null, targets: this.targets || null };
    if (this.mode === 'stunt') { r.distance = this.stunt.best; r.dists = this.stunt.dists.slice(); }
    if (this.mode === 'time') { r.ghostPrev = this.ghost?.time || null; r.newGhost = this.saveGhost(r.time); }
    if (this.mode === 'caccia') { r.huntDmg = Math.min(100, Math.round(this.huntDmg || 0)); r.huntWreck = !!this.huntWreck; }
    MODES5.result(this, r);
    r.medal = medalFor(this.mode, r);
    const ev = this.o.event || null;
    r.prize = payout(ev, r.medal, r, this.o.difficulty);
    // free play pays less than the career (it used to pay twice a career win: the cups are the way to earn)
    if (!ev && ['race', 'derby', 'elim', 're'].includes(this.mode)) r.prize = Math.round(([5000, 3500, 2500, 1800, 1300, 1000, 800, 600][r.pos - 1] || 400) * (this.diff.prize || 1));
    if (this.mode === 'parco') r.prize = 0;
    // bonus objectives of the event (each pays once per run)
    r.objectives = evalObjectives(this, r); const objPay = r.objectives.reduce((s, o) => s + (o.done ? o.prize : 0), 0);
    r.bonus = Math.min(6000, (P.kills || 0) * 1000 + Math.round((P.score || 0) / 20) * 10) + objPay;
    if (this.mode === 'parco') r.bonus = Math.min(1500, r.bonus);
    if (this.o.championship) r.bonus = Math.round(r.bonus / 2);
    let career = null;
    if (ev) {
      const prev = prog().career.res[ev.id]?.medal || 0;
      if (r.medal <= prev && prev > 0) r.prize = Math.round(r.prize * 0.5 / 50) * 50; // replays pay half unless you improve
      career = recordCareer(ev.id, r.medal);
      // the cup rival remembers this one; a cup finished for the first time ends on the podium
      if (this.rivalDef && this.rival) {
        const rp = res.indexOf(this.rival) + 1, beat = ['time', 'stunt', 'distruzione'].includes(this.mode) ? r.medal >= 2 : this.mode === 'squadre' ? !!r.teamWon : pos < rp;
        const st = recordRival(this.rivalDef, { beat, wrecked: !!this.rivalWrecked, hits: this.rivalHits || 0 });
        r.rivalHtml = `<div class="dzx-rivres">${portrait(this.rivalDef, 40)}<span><b>${this.rivalDef.name}</b>: ${beat ? 'battuto' : 'ti è stato davanti'}${this.rivalWrecked ? ', e l’hai demolito' : ''} · tu ${st.beat} – ${st.lost} lui · rancore ${st.grudge}/5<br><i>«${this.rivalDef.taunt[(st.beat + st.lost) % this.rivalDef.taunt.length]}»</i></span></div>`;
      }
      { const cup = CUPS.find((c) => c.id === ev.cup), pp = prog(); pp.cupDone ||= {};
        if (cup && !pp.cupDone[cup.id] && cup.events.every((e) => (pp.career.res[e.id]?.medal || 0) >= 1)) { const rows = cupPodium(cup, pp); pp.cupDone[cup.id] = rows[0].me ? 1 : 2; saveProg(pp); r.podium = { cup, rows, rv: rivalOfCup(cup.id), win: rows[0].me }; } }
    }
    r.career = career;
    // credits, wins, records
    const p = prog(); p.money += r.prize + r.bonus; p.races++; if (r.pos === 1 && !['time', 'stunt', 'caccia', 'ondate', 'distruzione', 'parco'].includes(this.mode)) p.wins++; if (r.medal === 3) p.golds = (p.golds || 0) + 1;
    if (!['time', 'stunt', 'caccia', 'ondate', 'distruzione', 'parco'].includes(this.mode)) p.best[this.venue.id] = Math.min(p.best[this.venue.id] || 99, r.pos);
    p.stats.wrecks = (p.stats.wrecks || 0) + (P.kills || 0);
    if (this.mode === 'stunt') p.stats.jump = Math.max(p.stats.jump || 0, r.distance || 0);
    if (this.mode === 'time' && r.time) { const k = this.venue.id + ':' + this.laps; p.stats.tt ||= {}; p.stats.tt[k] = Math.min(p.stats.tt[k] || 1e9, r.time); }
    saveProg(p);
    r.car = P.spec.id; r.minHp = Math.round(P.minHp ?? P.hp); r.props = this.playerProps || 0;
    r.challenges = checkChallenges(r);
    r.money = prog().money;
    return r;
  }

  // ---------------------------------------------------------------- frame
  frame(dtReal) {
    if (!(dtReal > 0)) return; // timestamps can go backwards on the first frame
    this.menuPad();
    if (this.state === 'replay') { this.replayFrame(dtReal); return; }
    if (this.state === 'photo') { this.photoFrame(dtReal); return; }
    if (this.state === 'podium') { this.podiumFrame(dtReal); return; }
    if (this.state === 'paused' || this.state === 'loading') { this.render(dtReal, true); return; }
    // slow motion on big impacts, and a few frames of hit-stop on the heaviest blows
    this.slowCool -= dtReal; this._dt = dtReal;
    if (this.slowT > 0) { this.slowT -= dtReal; this.timeScale += (0.28 - this.timeScale) * Math.min(1, dtReal * 12); } else this.timeScale += (1 - this.timeScale) * Math.min(1, dtReal * 5);
    let ts = this.timeScale; if (this.hitStop > 0) { this.hitStop -= dtReal; ts = Math.min(ts, 0.12); }
    const dt = dtReal * ts;
    this.crowdHype = Math.max(0, (this.crowdHype || 0) - dtReal * 0.18);
    if (this.spectate && this.track.arena) {
      if (this.spectate.out && this.time >= (this._specSwapT || 0)) { const nx = this.arenaFocus(); if (nx) { this.spectate = nx; this.camPos = null; } }
    } else if (this.spectate) {
      const act = this.cars.filter((c) => !c.out); const lead = act.reduce((a, b) => ((a.prog || 0) >= (b.prog || 0) ? a : b), act[0]);
      if (lead && lead !== this.spectate) this.spectate = lead;
    }
    this.time += dt;
    if (this.state === 'countdown') {
      this.countdown -= dt; const n = Math.ceil(this.countdown - 0.6);
      if (n !== this._lastCount) { this._lastCount = n; try { n > 0 ? sfx.beep() : sfx.go(); } catch {} }
      if (this.countdown <= 0) { this.state = 'race'; this.time = 0; this.message('VIA!', 'go'); this.startPos = this.standings().indexOf(this.player) + 1; this.showObjectives?.(); for (const c of this.cars) c.lapStart = 0; if (this.rival) { this.rival.ai.grudge = this.player; this.rival.ai.grudgeT = 1e9; this.feed(`<i style="background:${this.rival.color}"></i><b>${this.rival.name}</b><u>⚔</u><em>il tuo rivale</em>`); } }
    }
    this.finishOrder ||= [];
    const racing = this.state === 'race' || this.state === 'finished';
    const pin = this.readInput();
    for (const car of this.cars) {
      if (car.removed) continue;
      if (car.removeT > 0) { car.removeT -= dt; if (car.removeT <= 0) { car.removed = true; car.mesh.visible = false; car.body.setEnabled?.(false); const q = car.body.translation(); for (let k = 0; k < 14; k++) this.smoke.emit(q.x, q.y + 0.6, q.z, (Math.random() - 0.5) * 3, 1 + Math.random() * 2, (Math.random() - 0.5) * 3, 1.6, 1.4, 0.75, 0.73, 0.7, 0.5); } }
      if (car.out) { car.dyn = this.drive(car, { thr: 0, brk: 0, st: 0, hb: 0, nitro: 0 }, dt); continue; }
      const stuntHold = this.mode === 'stunt' && this.stunt.phase === 'hold';
      let inp = !racing || stuntHold ? { thr: (this.state === 'countdown' || stuntHold) && car.isPlayer ? pin.thr : Math.random() < 0.02 ? 1 : 0, brk: 0, st: 0, hb: 0, nitro: 0, hold: 1 } : car.isPlayer && !(this.state === 'finished') ? pin : this.aiInput(car, dt);
      if (car.stunT > 0) car.stunT -= dt;
      if (car.wreckT > 0) { car.wreckT -= dt; inp = { thr: 0, brk: 1, st: 0, hb: 0, nitro: 0 }; if (car.wreckT <= 0) { car.hp = 45; car.burnT = 0; car.zoneDmg = null; car.heat = 0; car.hotT = 0; car.fireT = 0; car.hotN = 0; for (const w of car.mesh.userData.wheels) { w.userData.bent = 0; w.userData.toe = 0; w.rotation.x = 0; } this.repairWheels(car); this.respawn(car); } }
      car.dyn = this.drive(car, inp, dt);
      if (car.ghostT > 0) {
        car.ghostT -= dt;
        if (car.ghostT <= 0) {
          // stay a ghost while still overlapping another car
          const p = car.body.translation(); const busy = this.cars.some((o) => o !== car && !o.out && (() => { const q = o.body.translation(); return (q.x - p.x) ** 2 + (q.z - p.z) ** 2 < 25 && Math.abs(q.y - p.y) < 2.5; })());
          if (busy) car.ghostT = 0.3; else { car.col.setCollisionGroups(GROUPS_CAR); car.cabCol.setCollisionGroups(GROUPS_CAR); }
        }
      }
      if (car.flipT > (car.isPlayer ? 3.5 : 2.2) && this.state !== 'countdown' && this.mode !== 'stunt') { this.requestRespawn(car, 'flip'); }
      // fell into the sea (port quay) or below the world: back on the track
      if (this.venue.port) { const cp = car.body.translation(); if (cp.y < this.terrain.heightAt(cp.x, cp.z) - 1.5 || cp.y < -2.6) { car.seaT = (car.seaT || 0) + dt; if (car.seaT > 1.2) { car.seaT = 0; this.requestRespawn(car, 'sea'); } } else car.seaT = 0; }
      // flipping a rival earns a bonus
      if (car.dyn.up.y < -0.2 && !car.flipCredited && car.lastHit && this.time - car.lastHit.t < 3) { car.flipCredited = true; this.award(car.lastHit.by, 18, car.lastHit.by.isPlayer ? 'RIBALTATO!' : null, 250); }
      if (car.dyn.up.y > 0.6) car.flipCredited = false;
      if (racing) this.updateProgress(car);
      if (car.isPlayer && this.state === 'race') this.playerStunts(car, dt);
      if (this.pit) this.pitTick(car, dt);
      if (car.isPlayer && racing && !this.track.arena && !this.track.stunt) {
        const tg = this.track.pts[car.idx].h, hd = Math.abs(wrap(Math.atan2(car.dyn.fwd.z, car.dyn.fwd.x) - tg));
        car.wrongWayT = hd > 2.3 && car.dyn.vF > 3 ? car.wrongWayT + dt : 0;
        car.stuckHintT = car.dyn.speed < 1 && pin.thr > 0.5 ? car.stuckHintT + dt : 0;
      }
    }
    // physics: fixed-size substeps (<= 1/100 s) for stable high-speed contacts
    const sub = Math.max(1, Math.ceil(dt / 0.01));
    for (let s = 0; s < sub; s++) { for (const car of this.cars) if (!car.removed) car.vc.updateVehicle(dt / sub); this.world.timestep = dt / sub; this.world.step(this.events); this.handleContacts(dt / sub); }
    // numerical safety net: a body that exploded (NaN / absurd speed) is put back on the track
    for (const car of this.cars) { if (car.removed) continue; const v = car.body.linvel(), t = car.body.translation(); if (!Number.isFinite(v.x + v.y + v.z + t.x + t.y + t.z) || v.x * v.x + v.y * v.y + v.z * v.z > 150 * 150) { (this.simStats.nan ||= []).push([car.name, car.wheelLost.join(''), Math.round(car.hp), +this.time.toFixed(1), car.ghostT > 0, Math.round(v.y)]); car.body.setLinvel({ x: 0, y: 0, z: 0 }, true); car.body.setAngvel({ x: 0, y: 0, z: 0 }, true); if (!Number.isFinite(t.x + t.y + t.z)) car.body.setTranslation({ x: this.track.pts[car.idx]?.x ?? this.terrain.cx, y: 50, z: this.track.pts[car.idx]?.z ?? this.terrain.cz }, true); car.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true); this.respawn(car); } }
    // derby end condition (time limit: 4 minutes, then the healthiest car wins)
    if (MODES5.tick(this, dt)) { /* v5 modes handle their own end */ }
    else if (this.track.arena && this.state === 'race') {
      const alive = this.cars.filter((c) => !c.out);
      if (alive.length <= 1 || this.time > 240) { this.finishOrder = this.standings(); this.finish(); }
      // wrecked: after a beat on the burning shell, follow the survivors (Invio / A skips to the results)
      else if (this.player.out && !this.spectate) { this._specAt ??= this.time + 1.8; if (this.time >= this._specAt) this.startSpectate(this.arenaFocus(), 'DISTRUTTO'); }
    }
    if (!this.track.arena && this.state === 'race' && this.player.finished) this.finish();
    if (this.mode === 'stunt' && this.state === 'race') this.stuntTick(dt);
    if (this.mode === 'time') this.recordGhost(dt);
    if (this.mode === 'caccia' && this.state === 'race' && this.lepre?.finished) { this.message('La Lepre è scappata!', 'wreck'); this.finish(); }
    if (this.state === 'race') this.record();
    this.render(dt, false, pin, dtReal);
  }

  syncCar(car, dt) {
    const t = car.body.translation(), r = car.body.rotation();
    car.mesh.position.set(t.x, t.y, t.z); car.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    const vc = car.vc, ud = car.mesh.userData;
    for (let i = 0; i < 4; i++) {
      const w = ud.wheels[i]; const susp = vc.wheelSuspensionLength?.(i) ?? 0.3;
      const [x, z] = ud.wheelPos[i]; w.position.set(x, ud.wrs[i] + 0.12 - susp, z);
      w.rotation.y = i < 2 ? car.steer : 0;
      const rot = vc.wheelRotation?.(i); if (rot != null) w.userData.spin.rotation.z = -rot;
    }
    // body lean from weight transfer (visual only)
    const s = car.spec, roll = s.roll || 1;
    const pitchT = Math.max(-0.09, Math.min(0.09, car.accF * 0.0055 * roll)), rollT = Math.max(-0.1, Math.min(0.1, -car.accL * 0.0072 * roll));
    ud.shell.rotation.z += (pitchT - ud.shell.rotation.z) * Math.min(1, dt * 10); ud.shell.rotation.x += (rollT - ud.shell.rotation.x) * Math.min(1, dt * 10);
    for (let i = 0; i < 4; i++) { const w = ud.wheels[i], b = w.userData.bent; if (b) { w.rotation.x = b; w.rotation.y += w.userData.toe; } }
    if (dt) updateParts(car.mesh, dt, { speed: car.dyn?.speed || 0, accF: car.accF, accL: car.accL, t: this.time });
    ud.lights.tail.emissiveIntensity = car.brakeF > 0.1 ? 2.6 : car.gearLabel === 'R' ? 1.2 : this.night ? 0.9 : 0.45;
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
        if (!dustC && slideAmt > 0.45 && Math.random() < Math.min(0.9, 0.35 + slideAmt * 0.4)) this.smoke.emit(P.x, P.y + 0.15, P.z, -lv.x * 0.08 + (Math.random() - 0.5) * 1.5, 0.5 + Math.random() * 0.6, -lv.z * 0.08 + (Math.random() - 0.5) * 1.5, 1.5 + Math.random(), 0.7 + slideAmt * 0.5, 0.86, 0.86, 0.88, Math.min(0.4, 0.14 + slideAmt * 0.12)); // tyre smoke on asphalt
      }
      this.skids.add(car.num * 10 + i, P, side, rear ? (lat > 3 || spin || (car.isPlayer && this.keys.Space) ? Math.min(1, slideAmt + 0.25) : dustC ? 0.12 : 0) : (lat > 5 ? Math.min(1, lat / 12) : 0), car.wheelLost[i] ? 0.06 : 0.14);
      if (car.wheelLost[i] && speed > 3 && Math.random() < 0.6) this.sparks.emit(P.x, P.y + 0.05, P.z, -lv.x * 0.3 + (Math.random() - 0.5) * 3, Math.random() * 2, -lv.z * 0.3 + (Math.random() - 0.5) * 3, 0.25, 0.3, 1, 0.7, 0.3, 1);
    }
    // roof scraping sparks when upside down and sliding
    if (car.dyn?.up.y < -0.3 && speed > 3 && Math.random() < 0.7) { const rp = new THREE.Vector3(0, ud.dims.H, 0).applyQuaternion(q).add(car.mesh.position); for (let k = 0; k < 3; k++) this.sparks.emit(rp.x, rp.y, rp.z, -lv.x * 0.3 + (Math.random() - 0.5) * 4, Math.random() * 3, -lv.z * 0.3 + (Math.random() - 0.5) * 4, 0.3, 0.35, 1, 0.75, 0.35, 1); if (Math.random() < 0.2) scrape(car.mesh, { x: (Math.random() - 0.5) * 2, y: ud.dims.H, z: (Math.random() - 0.5) }, 0.12, 0.9); }
    // smoke and fire from damaged engines, burning wrecks, nitro flames
    car.smokeT -= dt; car.burnT = Math.max(0, car.burnT - dt);
    if ((car.hp < 55 || car.burnT > 0 || car.fireT > 0 || (car.engDmg || 0) > 0.5) && car.smokeT <= 0 && near) {
      const burning = car.hp <= 15 || car.burnT > 0 || car.fireT > 0;
      car.smokeT = burning ? 0.02 : car.hp < 30 ? 0.04 : 0.09;
      const hp = ud.dims.L - 0.4; const ep = new THREE.Vector3(hp, 0.95, 0).applyQuaternion(q).add(car.mesh.position);
      const k = burning ? 0.06 : car.hp < 30 ? 0.16 : 0.45; this.smoke.emit(ep.x, ep.y + 0.2, ep.z, (Math.random() - 0.5) * 1.5 - lv.x * 0.2, 1.8 + Math.random(), (Math.random() - 0.5) * 1.5 - lv.z * 0.2, burning ? 3.2 : 2, burning ? 1.3 : 0.9, k, k * 0.95, k * 0.9, burning ? 0.7 : 0.5);
      if (burning) for (let n = 0; n < 2; n++) this.fire.emit(ep.x + (Math.random() - 0.5) * 0.7, ep.y, ep.z + (Math.random() - 0.5) * 0.7, (Math.random() - 0.5) - lv.x * 0.1, 1.6 + Math.random() * 2.2, (Math.random() - 0.5) - lv.z * 0.1, 0.35 + Math.random() * 0.35, car.burnT > 0 ? 0.8 : 0.55, 1, 0.3 + Math.random() * 0.25, 0.04, 0.75);
    }
    if (car.hotT > 0 && near && Math.random() < 0.6) { const ep = new THREE.Vector3(ud.dims.L - 0.5, 0.9, 0).applyQuaternion(q).add(car.mesh.position); this.smoke.emit(ep.x, ep.y, ep.z, (Math.random() - 0.5) * 2 - lv.x * 0.15, 2.5 + Math.random() * 2, (Math.random() - 0.5) * 2 - lv.z * 0.15, 1.6, 0.9, 0.95, 0.95, 0.97, 0.5); }
    if (car.boost && near) { const ey = ud.shape.y0 - 0.1; for (const ez of (ud.shape.scoop || ud.shape.hotrod ? [-0.5, 0.5] : [-0.5])) { const ep = new THREE.Vector3(-ud.dims.L - 0.25, ey, ez).applyQuaternion(q).add(car.mesh.position); for (let k = 0; k < 3; k++) { const u = Math.random(); this.fire.emit(ep.x - fwd.x * u * 0.5, ep.y, ep.z - fwd.z * u * 0.5, -fwd.x * (6 + u * 8) + lv.x, 0.2 + Math.random() * 0.5, -fwd.z * (6 + u * 8) + lv.z, 0.07 + u * 0.1, 0.42 - u * 0.15, k ? 0.3 + Math.random() * 0.3 : 1, k ? 0.5 : 0.55, k ? 1 : 0.2, 0.9); } if (Math.random() < 0.3) this.sparks.emit(ep.x, ep.y, ep.z, -fwd.x * 8 + lv.x + (Math.random() - 0.5) * 3, Math.random() * 2, -fwd.z * 8 + lv.z + (Math.random() - 0.5) * 3, 0.3, 0.3, 0.5, 0.7, 1); } }
  }

  render(dt, frozen, pin, dtReal = dt) {
    for (const car of this.cars) if (!car.removed) this.syncCar(car, frozen ? 0 : dt);
    for (const k of Object.keys(this.propTypes)) this.syncProps(k);
    for (const d of this.debris) { const t = d.body.translation(), r = d.body.rotation(); tmpQ.set(r.x, r.y, r.z, r.w); d.mesh.quaternion.copy(tmpQ).multiply(d.q0); d.mesh.position.copy(d.off).applyQuaternion(tmpQ).add(tmpV.set(t.x, t.y, t.z)); }
    if (!frozen) { this.dust.update(dt); this.smoke.update(dt); this.fire.update(dt); this.sparks.update(dt, this.terrain); this.chips.update(dt); this.splash.update(dt); }
    this.updateCamera(dtReal);
    if (this.marker) { const p = this.player.mesh.position; this.marker.position.set(p.x, p.y + 2.4 + Math.sin(this.time * 4) * 0.1, p.z); this.marker.quaternion.copy(this.camera.quaternion); this.marker.visible = this.camMode < 2 && !this.lookBack && this.state !== 'finished'; }
    this.fxFrame(frozen ? 0 : dtReal, true);
    if (this.ghost) this.updateGhost();
    if (this.lepreMark) { const p = this.lepre.mesh.position; this.lepreMark.position.set(p.x, p.y + 3.2 + Math.sin(this.time * 3) * 0.2, p.z); this.lepreMark.rotation.y = this.time * 2; this.lepreMark.visible = !this.lepre.out && this.camMode < 3; }
    // shadow camera follows the player
    const pp = (this.spectate || this.player).mesh.position; this.sun.position.copy(pp).addScaledVector(this.sunDir, 150); this.sun.target.position.copy(pp);
    if (this.composer) this.composer.render(); else this.renderer.render(this.scene, this.camera);
    CROWD.time.value += dtReal * (frozen ? 0 : 1); CROWD.hype.value += (Math.min(1, (this.crowdHype || 0) + (this.state === 'countdown' ? 0.35 : 0)) - CROWD.hype.value) * Math.min(1, dtReal * 4);
    updateHud(this, dtReal);
    this.snd?.update(dtReal);
    const P = this.player, eg = ENGINE_GEARS[P.spec.engine] || 7;
    try { engineSet(P.rpm < 0.09 && (pin?.thr || 0) < 0.05 ? 0 : Math.min(0.995, Math.max(0.02, P.rpm)) / eg, { crowd: 0.25 }); } catch {}
  }

  // per-frame update of the screen effects, lens, weather and effect lights (all camera modes)
  fxFrame(dt, driving) {
    const cam = this.camera, P = this.spectate || this.player, pu = this.post?.uniforms;
    cam.updateMatrixWorld(); FXENV.sunV.value.copy(this.sunDir).transformDirection(cam.matrixWorldInverse);
    this.chunks.update(dt, this.terrain); this.shock.update(dt);
    this.rain?.update(dt, cam.position, driving ? P.body.linvel() : null);
    this.hurt = Math.max(0, (this.hurt || 0) - dt * 1.6);
    const sp = P.dyn?.speed || 0, chase = driving && this.state !== 'finished';
    if (pu) {
      const blurT = chase ? Math.max(0, Math.min(1, (sp - 28) / 32)) * 0.022 * (this.camMode >= 2 ? 1.6 : 1) + (P.boost ? 0.03 : 0) : 0;
      pu.uBlur.value += (blurT - pu.uBlur.value) * Math.min(1, dt * 5);
      pu.uCA.value += (((chase && P.boost) ? 0.45 : 0) + Math.min(1, this.shake || 0) * 0.35 - pu.uCA.value) * Math.min(1, dt * 6);
      pu.uTime.value = (performance.now() / 1000) % 600; pu.uAspect.value = cam.aspect; pu.uHurt.value = Math.min(0.6, this.hurt || 0);
      // heat haze behind the nitro flames
      let heat = 0;
      if (chase && P.boost && this.camMode < 2 && !this.lookBack) { const ud = P.mesh.userData; tmpV.set(-ud.dims.L - 0.6, 0.5, 0).applyQuaternion(P.mesh.quaternion).add(P.mesh.position).project(cam); if (tmpV.z < 1) { pu.uHeatPos.value.set(tmpV.x * 0.5 + 0.5, tmpV.y * 0.5 + 0.5); heat = 1; } }
      pu.uHeat.value += (heat - pu.uHeat.value) * Math.min(1, dt * 8);
      const sf = this.shockFx; if (sf && sf.t < 1) { sf.t += dt * 1.5; tmpV.copy(sf.p).project(cam); pu.uShockPos.value.set(tmpV.x * 0.5 + 0.5, tmpV.y * 0.5 + 0.5); pu.uShockT.value = tmpV.z < 1 ? sf.t : 0; } else pu.uShockT.value = 0;
    }
    if (this.composer?.flare) updateSunFlare(this.composer, cam, this.sunDir, this.look.flare || 0);
    if (this.composer?.rays) updateGodRays(this.composer, cam, this.sunDir, 0.55 * (this.look.rays || 0));
    // camera lens: rain drops, mud thrown up by the car ahead, water from fords
    if (chase && dt > 0) {
      if (this.rain && Math.random() < dt * (1.5 + sp * 0.12) * this.look.rain) this.lens.splat('water', 1);
      if (this.camMode < 2 && (this.venue.surface === 'mud' || (this.wet && this.venue.surface !== 'asphalt')) && sp > 6) {
        const f = P.dyn.fwd, pp = P.mesh.position;
        for (const o of this.cars) { if (o === P || o.removed || (o.dyn?.speed || 0) < 7 || !o.dyn?.grounded) continue; const dx = o.mesh.position.x - pp.x, dz = o.mesh.position.z - pp.z, ah = dx * f.x + dz * f.z, la = Math.abs(-dx * f.z + dz * f.x); if (ah > 1 && ah < 13 && la < 3.5 && Math.random() < dt * 1.6 * (1 - ah / 14)) { this.lens.splat('mud', 1 + (Math.random() < 0.3 ? 1 : 0), 0.8); P.mesh.userData.dirt.value = Math.min(1, P.mesh.userData.dirt.value + 0.01); } }
      }
      if (P.inWater && sp > 7 && Math.random() < dt * 9) this.lens.splat('water', 2, 1.3);
    }
    this.lens.update(dt);
    if (this.flares) { const F = this.flares, tt = performance.now() / 1000; F.mat.size = F.base * (0.8 + 0.2 * Math.sin(tt * 31) * Math.sin(tt * 17)); if (dt > 0 && Math.random() < dt * 14) { const f = F.list[Math.floor(Math.random() * F.list.length)]; if (cam.position.distanceToSquared(tmpV.set(f[0], f[1], f[2])) < 170 * 170) this.smoke.emit(f[0], f[1] + 0.3, f[2], (Math.random() - 0.5) * 0.6, 1.2 + Math.random(), (Math.random() - 0.5) * 0.6, 3 + Math.random() * 2, 1.2, f[3] ? 0.5 : 1, f[3] ? 0.9 : 0.45, 0.4, 0.3); } }
    // fire light: the nearest burning cars get a flickering point light
    if (this.fireLights.length) {
      const burning = this.cars.filter((c) => !c.removed && (c.burnT > 0 || (c.hp <= 15 && c.hp > 0) || (c.out && c.hp <= 0 && this.time - (c.outT || 0) < 25))).sort((a, b) => a.mesh.position.distanceToSquared(cam.position) - b.mesh.position.distanceToSquared(cam.position));
      this.fireLights.forEach((l, i) => { const c = burning[i]; const tt = performance.now() / 1000; if (c) { const ud = c.mesh.userData; l.position.set(ud.dims.L - 0.5, 1.5, 0).applyQuaternion(c.mesh.quaternion).add(c.mesh.position); l.intensity = (c.burnT > 0 ? 260 : 140) * (0.7 + 0.3 * Math.sin(tt * 23 + i * 2) * Math.sin(tt * 37 + i) + 0.15 * Math.sin(tt * 61)); } else l.intensity = 0; });
    }
  }

  updateCamera(dt) {
    const c = this.spectate || this.player, q = c.mesh.quaternion, p = c.mesh.position;
    const fwd = c.dyn?.fwd || new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    const sp = c.dyn?.speed || 0, lv = c.body.linvel();
    let fov = 64 + Math.min(16, sp * 0.24) + (c.boost ? 10 : 0);
    const sh = this.shake; this.shake = Math.max(0, sh - dt * 2.2);
    const tt = performance.now() / 1000;
    const shk = new THREE.Vector3(Math.sin(tt * 37) + Math.sin(tt * 23.3) * 0.5, Math.sin(tt * 41.7) * 0.8, Math.sin(tt * 29.1) + Math.cos(tt * 17) * 0.5).multiplyScalar(sh * 0.16);
    if (this.camMode >= 2) {
      // hood / bumper cams: rigid, with the roll partially levelled out
      const ud = c.mesh.userData, L = ud.dims.L;
      const local = this.camMode === 2 ? new THREE.Vector3(L * 0.22, ud.dims.beltY + 0.5, 0) : new THREE.Vector3(L + 0.25, 0.55, 0);
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
    const far = this.camMode === 1 || !!this.spectate;
    // the camera lags on hard acceleration and nitro, closes in under braking; landings dip it
    const lagT = Math.max(-0.7, Math.min(1.0, (c.accF || 0) * 0.05)) + (this.camPull || 0) * 1.4;
    this.camLag = (this.camLag || 0) + (lagT - (this.camLag || 0)) * Math.min(1, dt * 3);
    this.camPull = Math.max(0, (this.camPull || 0) - dt * 1.6);
    this.camDip = Math.max(0, (this.camDip || 0) - dt * 2.5);
    const back = (far ? 10.5 : 6.6) + Math.min(2.5, sp * 0.05) + this.camLag, h = (far ? 3.9 : 2.3) + Math.min(0.6, sp * 0.012);
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
    // impact kick: a damped spring knocks the camera away from where the car was hit
    const K = this.camKick; if (K) { K.multiplyScalar(Math.exp(-dt * 6)); }
    this.camera.position.copy(this.camPos).add(shk); if (K) this.camera.position.add(K);
    this.camera.position.y -= this.camDip * 0.7;
    // slow motion zooms in a little on the action
    fov -= (1 - this.timeScale) * 12;
    this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 4); this.camera.updateProjectionMatrix();
    this.camera.lookAt(this.camLook.x, this.camLook.y - this.camDip * 0.35, this.camLook.z);
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
