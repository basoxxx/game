// "Scontro Totale": drivable demolition racing with real rigid-body physics (Rapier).
// Arcade-tuned raycast vehicles, destructible props, deformable cars with parts that fly off,
// nitro earned by crashing, AI that races and rams, and a last-car-standing derby arena.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { pbr, applyHDRI, makeComposer, hdriSun, hdriHorizon } from '../ui/gfx.js';
import { makeForest, makeTreeShadows, vegOfKind } from '../ui/vegetation.js';
import { engineStart, engineSet, engineStop, sfx } from '../ui/audio.js';
import { getSettings } from '../engine/state.js';
import { buildTrack, buildTerrain } from './tracks.js';
import { buildBanger, dent, BANGERS, AI_COLORS } from './cars.js';
import { Particles, SkidMarks } from './fx.js';

let rapierReady = null;
export function initPhysics() { return (rapierReady ||= RAPIER.init()); }

const AI_NAMES = ['Brutto Bruno', 'Ivo Lamiera', 'Rosa Ruggine', 'Tino Testacoda', 'Gigi Guardrail', 'Nina Nitro', 'Sandro Sfascio', 'Carla Carburatore', 'Dario Derapata', 'Mirko Marmitta', 'Lea Lamierino'];
const tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0);

export class DerbyGame {
  constructor(container, opts) {
    this.c = container; this.o = { opponents: 7, laps: null, ...opts };
    this.venue = opts.venue; this.low = getSettings().gfx === 'low';
    this.keys = {}; this.time = 0; this.state = 'loading'; this.msgs = [];
    this.onEnd = opts.onEnd || (() => {});
  }

  async start() {
    await initPhysics();
    this.track = buildTrack(this.venue);
    this.terrain = buildTerrain(this.venue, this.track);
    this.setupRenderer();
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.events = new RAPIER.EventQueue(true);
    this.handles = new Map();
    this.buildGround();
    this.buildProps();
    this.buildCars();
    this.buildHud();
    this.bindInput();
    await this.envReady;
    this.state = 'countdown'; this.countdown = 3.6;
    try { engineStart('endurance'); } catch {}
    this.last = performance.now();
    const loop = (t) => { if (this.dead) return; this.raf = requestAnimationFrame(loop); this.frame(Math.min(0.05, (t - this.last) / 1000)); this.last = t; };
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
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0; r.outputColorSpace = THREE.SRGBColorSpace;
    this.c.appendChild(r.domElement); Object.assign(r.domElement.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' });
    const s = this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 3000);
    const kind = this.venue.sky || 'day';
    s.fog = new THREE.FogExp2(0xc9c2b2, 0.0026);
    this.hemi = new THREE.HemisphereLight(0xdde8ff, 0x6b5a40, 0.6); s.add(this.hemi);
    const sun = this.sun = new THREE.DirectionalLight(0xfff0d8, kind === 'dusk' ? 2.2 : 2.8);
    sun.castShadow = true; sun.shadow.mapSize.set(this.low ? 1024 : 2048, this.low ? 1024 : 2048);
    Object.assign(sun.shadow.camera, { left: -55, right: 55, top: 55, bottom: -55, near: 1, far: 400 }); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
    s.add(sun); s.add(sun.target);
    this.sunDir = new THREE.Vector3(0.5, 0.8, 0.35).normalize();
    this.envReady = applyHDRI(r, s, kind, { intensity: 0.9 }).then(() => {
      const sd = hdriSun(kind); if (sd) { this.sunDir.copy(sd); this.sunDir.y = Math.max(0.42, this.sunDir.y); this.sunDir.normalize(); }
      const hz = hdriHorizon(kind); if (hz) s.fog.color.copy(hz).lerp(new THREE.Color(0xcab89a), 0.35);
    }).catch(() => {});
    this.composer = makeComposer(r, s, this.camera, { bloom: 0.28, low: this.low, ao: !this.low });
    this._rs = () => this.resize(); window.addEventListener('resize', this._rs); this.resize();
    this.dust = new Particles(s, 2200, { gravity: -0.4, drag: 1.4, grow: 2.6 });
    this.smoke = new Particles(s, 900, { gravity: -2.2, drag: 0.8, grow: 3 });
    this.fire = new Particles(s, 600, { additive: true, gravity: -4, drag: 1.5, grow: -0.4 });
    this.sparks = new Particles(s, 900, { additive: true, gravity: 9, drag: 0.6, grow: -0.6, sizeScale: 0.5 });
    this.skids = new SkidMarks(s, 4000);
  }
  resize() { const w = this.c.clientWidth || 1280, h = this.c.clientHeight || 720; this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.composer?.setSize(w, h); }

  // ---------------------------------------------------------------- terrain, track dressing
  buildGround() {
    const T = this.terrain, v = this.venue, tr = this.track;
    // physics heightfield
    const hf = RAPIER.ColliderDesc.heightfield(T.nr, T.nc, T.H, { x: T.sx, y: 1, z: T.sz }).setTranslation(T.cx, 0, T.cz).setFriction(1.0).setRestitution(0.05);
    this.groundCol = this.world.createCollider(hf); this.handles.set(this.groundCol.handle, { kind: 'ground' });
    // visual mesh (same grid)
    const n = (T.nc + 1) * (T.nr + 1), pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), bl = new Float32Array(n), idx = [];
    for (let c = 0; c <= T.nc; c++) for (let r = 0; r <= T.nr; r++) { const k = c * (T.nr + 1) + r, x = T.X(c), z = T.Z(r); pos.set([x, T.H[k], z], k * 3); uv.set([x / 7, z / 7], k * 2); bl[k] = T.B[k]; }
    for (let c = 0; c < T.nc; c++) for (let r = 0; r < T.nr; r++) { const a = c * (T.nr + 1) + r, b = a + T.nr + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setAttribute('blend', new THREE.BufferAttribute(bl, 1)); g.setIndex(idx); g.computeVertexNormals();
    const base = pbr(v.ground === 'rock' ? 'aerial_grass_rock' : 'aerial_grass_rock', { color: v.ground === 'rock' ? 0xd2c3a2 : 0xa9c48a, roughness: 1 });
    const surf = pbr(v.surface === 'asphalt' ? 'asphalt_02' : 'gravel_floor', { color: v.surface === 'asphalt' ? 0x7a7a7a : 0xcbb48e, roughness: 1 });
    const rock = pbr('rocky_trail', { color: 0xbfae94, roughness: 1 });
    const mat = base; mat.onBeforeCompile = (sh) => {
      sh.uniforms.mapB = { value: surf.map }; sh.uniforms.mapR = { value: rock.map };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float blend; varying float vBlend; varying float vSlope;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvBlend = blend; vSlope = normal.y;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D mapB; uniform sampler2D mapR; varying float vBlend; varying float vSlope;').replace('#include <map_fragment>', `#include <map_fragment>
        vec3 cB = texture2D(mapB, vMapUv * 1.3).rgb * vec3(${v.surface === 'asphalt' ? '0.62,0.62,0.62' : '0.95,0.82,0.62'});
        vec3 cR = texture2D(mapR, vMapUv * 0.6).rgb * vec3(0.85,0.76,0.62);
        float rk = smoothstep(0.9, 0.7, vSlope) * (1.0 - vBlend);
        diffuseColor.rgb = mix(diffuseColor.rgb, cR, rk);
        diffuseColor.rgb = mix(diffuseColor.rgb, cB, smoothstep(0.05, 0.95, vBlend));`);
    };
    const ground = new THREE.Mesh(g, mat); ground.receiveShadow = true; this.scene.add(ground);
    // far ground plane to the horizon
    const far = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshStandardMaterial({ color: v.ground === 'rock' ? 0x9c8e70 : 0x6f8a52, roughness: 1 }));
    far.rotation.x = -Math.PI / 2; far.position.set(T.cx, -2, T.cz); this.scene.add(far);
    // track-side: start/finish banner, tyre walls handled as props; trees outside the berms
    if (!tr.arena) this.buildDressing();
    else this.buildArena();
    this.buildTrees();
  }

  buildDressing() {
    const tr = this.track, s = this.scene, hw = tr.width / 2;
    const p0 = tr.pts[0], nx = -Math.sin(p0.h), nz = Math.cos(p0.h);
    const bannerTex = (() => { const c = document.createElement('canvas'); c.width = 1024; c.height = 128; const g = c.getContext('2d'); g.fillStyle = '#111'; g.fillRect(0, 0, 1024, 128); for (let i = 0; i < 32; i++) for (let j = 0; j < 4; j++) { g.fillStyle = (i + j) % 2 ? '#fff' : '#111'; g.fillRect(i * 32, j * 32, 32, 32); } g.fillStyle = '#e10600'; g.fillRect(256, 14, 512, 100); g.fillStyle = '#fff'; g.font = 'italic 900 70px "Exo 2", Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('SCONTRO TOTALE', 512, 66); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
    const pole = new THREE.MeshStandardMaterial({ color: 0x777b80, metalness: 0.7, roughness: 0.4 });
    for (const sd of [1, -1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 7.5, 10), pole); p.position.set(p0.x + nx * sd * (hw + 1.5), p0.y + 3.75, p0.z + nz * sd * (hw + 1.5)); p.castShadow = true; s.add(p); }
    const ban = new THREE.Mesh(new THREE.PlaneGeometry(tr.width + 3, 1.8), new THREE.MeshStandardMaterial({ map: bannerTex, side: THREE.DoubleSide, roughness: 0.6 }));
    ban.position.set(p0.x, p0.y + 6.6, p0.z); ban.rotation.y = -p0.h + Math.PI / 2; ban.castShadow = true; s.add(ban);
    // chequered line
    const chk = new THREE.Mesh(new THREE.PlaneGeometry(1.6, tr.width), new THREE.MeshStandardMaterial({ map: bannerTex, roughness: 0.8 }));
    chk.rotation.x = -Math.PI / 2; chk.rotation.z = -p0.h; chk.position.set(p0.x, this.terrain.heightAt(p0.x, p0.z) + 0.04, p0.z); s.add(chk);
    // spectator stands and parked wrecks for atmosphere
    const standMat = new THREE.MeshStandardMaterial({ color: 0x6c625a, roughness: 0.9 });
    const crowd = (() => { const c = document.createElement('canvas'); c.width = 512; c.height = 128; const g = c.getContext('2d'); g.fillStyle = '#3d3a37'; g.fillRect(0, 0, 512, 128); for (let i = 0; i < 1400; i++) { g.fillStyle = `hsl(${Math.random() * 360},${40 + Math.random() * 40}%,${35 + Math.random() * 35}%)`; g.fillRect(Math.random() * 512, Math.random() * 128, 3, 4); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.repeat.set(3, 1); return t; })();
    for (const fr of [0.02, 0.5]) {
      const i = Math.floor(fr * tr.N), p = tr.pts[i], ox = -Math.sin(p.h), oz = Math.cos(p.h), off = -(hw + 16);
      const g = new THREE.Group();
      const slope = new THREE.Mesh(new THREE.PlaneGeometry(40, 9), new THREE.MeshStandardMaterial({ map: crowd, roughness: 0.9 })); slope.rotation.x = -0.75; slope.position.set(0, 3.2, 0); g.add(slope);
      const back = new THREE.Mesh(new THREE.BoxGeometry(40, 7, 0.5), standMat); back.position.set(0, 3.5, -3.4); g.add(back);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(41, 0.3, 8), new THREE.MeshStandardMaterial({ color: 0xb33a2a, roughness: 0.6 })); roof.position.set(0, 7.6, -0.4); g.add(roof);
      g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      const x = p.x + ox * off, z = p.z + oz * off; g.position.set(x, this.terrain.heightAt(x, z), z); g.rotation.y = -p.h; s.add(g);
    }
  }

  buildArena() {
    const tr = this.track, s = this.scene, T = this.terrain;
    // concrete wall ring + tyre lining (tyres are props), floodlight masts
    const wallMat = pbr('concrete_floor_worn_001', { color: 0xb8b0a0, repeat: [20, 1] });
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(tr.R + 10.5, tr.R + 10.5, 3, 96, 1, true), wallMat); wall.position.set(T.cx, 7.6, T.cz); wall.material.side = THREE.DoubleSide; s.add(wall);
    const wc = RAPIER.ColliderDesc.cylinder(1, 1); // placeholder to keep API warm
    void wc;
    const mast = new THREE.MeshStandardMaterial({ color: 0x55595f, metalness: 0.6, roughness: 0.5 });
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; const m = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 26, 8), mast); m.position.set(T.cx + Math.cos(a) * (tr.R + 16), 13 + 7, T.cz + Math.sin(a) * (tr.R + 16)); m.castShadow = true; s.add(m); const lamp = new THREE.Mesh(new THREE.BoxGeometry(3, 1.4, 0.6), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2d0, emissiveIntensity: 2.5 })); lamp.position.set(m.position.x, 33.5, m.position.z); lamp.lookAt(T.cx, 0, T.cz); s.add(lamp); }
  }

  buildTrees() {
    const T = this.terrain, tr = this.track, v = this.venue;
    const pool = v.ground === 'rock' ? vegOfKind(['broad', 'bush', 'desert']) : vegOfKind(['conifer', 'broad', 'bush']);
    if (!pool.length) return;
    const items = []; const target = Math.round((v.forest ? 2600 : 1400) * (this.low ? 0.4 : 1));
    const clear = (x, z) => {
      if (tr.arena) return Math.hypot(x - T.cx, z - T.cz) > tr.R + 24;
      for (let i = 0; i < tr.N; i += 3) { const p = tr.pts[i]; if ((p.x - x) ** 2 + (p.z - z) ** 2 < (tr.width / 2 + 16) ** 2) return false; }
      return true;
    };
    let guard = 0;
    while (items.length < target && guard++ < target * 5) {
      const cx = T.cx + (Math.random() - 0.5) * T.sx * 0.94, cz = T.cz + (Math.random() - 0.5) * T.sz * 0.94;
      const n = 3 + Math.floor(Math.random() * 8);
      for (let q = 0; q < n; q++) {
        const x = cx + (Math.random() - 0.5) * 30, z = cz + (Math.random() - 0.5) * 30; if (!clear(x, z)) continue;
        const meta = pool[Math.floor(Math.random() * pool.length)];
        const h = { conifer: 11 + Math.random() * 9, broad: 6 + Math.random() * 5, bush: 1.8 + Math.random() * 1.5, desert: 4 + Math.random() * 3 }[meta.kind] || 6;
        const t = 0.82 + Math.random() * 0.25;
        items.push({ x, y: T.heightAt(x, z) - 0.2, z, h, meta, rot: Math.random() * 6.28, tint: [t, t, t * 0.95] });
      }
    }
    this.scene.add(makeTreeShadows(items)); this.scene.add(makeForest(items));
  }

  // ---------------------------------------------------------------- destructible props
  buildProps() {
    const tr = this.track, T = this.terrain, s = this.scene;
    const canvas = (draw, w = 256, h = 256) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
    const barrelTex = canvas((g, w, h) => { g.fillStyle = '#b3261e'; g.fillRect(0, 0, w, h); g.fillStyle = '#ddd'; g.fillRect(0, h * 0.2, w, 10); g.fillRect(0, h * 0.75, w, 10); for (let i = 0; i < 30; i++) { g.fillStyle = 'rgba(90,40,20,0.6)'; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 4 + Math.random() * 14, 0, 7); g.fill(); } });
    const woodTex = canvas((g, w, h) => { g.fillStyle = '#9a7247'; g.fillRect(0, 0, w, h); for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? '#8a6540' : '#a57b4d'; g.fillRect(0, i * h / 6, w, h / 6 - 3); } g.strokeStyle = '#5a4128'; g.lineWidth = 8; g.strokeRect(4, 4, w - 8, h - 8); g.beginPath(); g.moveTo(0, 0); g.lineTo(w, h); g.stroke(); });
    const hayTex = canvas((g, w, h) => { g.fillStyle = '#c8a34f'; g.fillRect(0, 0, w, h); for (let i = 0; i < 900; i++) { g.strokeStyle = `rgba(${150 + Math.random() * 80},${110 + Math.random() * 60},40,0.7)`; g.beginPath(); const x = Math.random() * w, y = Math.random() * h; g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 20, y + (Math.random() - 0.5) * 6); g.stroke(); } });
    const fenceTex = canvas((g, w, h) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#d22' : '#f2f2f2'; g.fillRect(i * w / 8, 0, w / 8, h); } g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(0, h - 20, w, 20); }, 256, 64);
    const tyreGeo = (() => { const parts = []; for (let k = 0; k < 3; k++) { const t = new THREE.TorusGeometry(0.3, 0.13, 8, 16); t.rotateX(Math.PI / 2); t.translate(0, -0.25 + k * 0.25, 0); parts.push(t); } return mergeGeos(parts); })();
    this.propTypes = {
      barrel: { geo: new THREE.CylinderGeometry(0.3, 0.3, 0.9, 16), mat: new THREE.MeshStandardMaterial({ map: barrelTex, roughness: 0.6, metalness: 0.4 }), col: () => RAPIER.ColliderDesc.cylinder(0.45, 0.3), mass: 30, list: [] },
      tyres: { geo: tyreGeo, mat: new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.95 }), col: () => RAPIER.ColliderDesc.cylinder(0.38, 0.43), mass: 45, list: [] },
      crate: { geo: new THREE.BoxGeometry(1, 1, 1), mat: new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.85 }), col: () => RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5), mass: 35, list: [] },
      hay: { geo: new THREE.CylinderGeometry(0.75, 0.75, 1.2, 18).rotateZ(Math.PI / 2), mat: new THREE.MeshStandardMaterial({ map: hayTex, roughness: 1 }), col: () => RAPIER.ColliderDesc.cylinder(0.6, 0.75).setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2)), mass: 140, list: [] },
      fence: { geo: new THREE.BoxGeometry(2.6, 0.9, 0.08), mat: new THREE.MeshStandardMaterial({ map: fenceTex, roughness: 0.7 }), col: () => RAPIER.ColliderDesc.cuboid(1.3, 0.45, 0.04), mass: 16, list: [] },
    };
    const place = (type, x, z, yaw = 0, dy = 0) => {
      const P = this.propTypes[type]; const y = T.heightAt(x, z);
      const half = type === 'hay' ? 0.75 : type === 'crate' ? 0.5 : type === 'fence' ? 0.45 : type === 'tyres' ? 0.38 : 0.45;
      const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y + half + 0.02 + dy, z).setRotation(new THREE.Quaternion().setFromAxisAngle(UP, yaw)).setLinearDamping(0.3).setAngularDamping(0.5).setCanSleep(true));
      const col = this.world.createCollider(P.col().setMass(P.mass).setFriction(0.8).setRestitution(0.15), body);
      body.sleep();
      P.list.push(body); this.handles.set(col.handle, { kind: 'prop', type, body });
    };
    if (tr.arena) {
      for (let k = 0; k < 90; k++) { const a = (k / 90) * Math.PI * 2; place('tyres', T.cx + Math.cos(a) * (tr.R - 1), T.cz + Math.sin(a) * (tr.R - 1)); }
      for (let k = 0; k < 24; k++) { const a = Math.random() * 6.28, r = Math.random() * tr.R * 0.7; place(['barrel', 'crate', 'hay'][k % 3], T.cx + Math.cos(a) * r, T.cz + Math.sin(a) * r, Math.random() * 3); }
    } else {
      const hw = tr.width / 2;
      for (let i = 0; i < tr.N; i += 2) {
        const p = tr.pts[i], k = p.k, nx = -Math.sin(p.h), nz = Math.cos(p.h);
        const outside = k > 0 ? -1 : 1;
        if (Math.abs(k) > 1 / 70 && i % 4 === 0) { const off = outside * (hw + 1.3); place('fence', p.x + nx * off, p.z + nz * off, -p.h); }
        if (Math.abs(k) > 1 / 45 && i % 6 === 0) { const off = -outside * (hw + 0.9); place('tyres', p.x + nx * off, p.z + nz * off); }
        if (i % 60 === 30) { const off = outside * (hw + 2.5); for (let q = 0; q < 3; q++) place(q === 1 ? 'hay' : 'barrel', p.x + nx * off + Math.cos(p.h) * q * 1.6, p.z + nz * off + Math.sin(p.h) * q * 1.6); }
        if (i % 90 === 45) { const off = (Math.random() - 0.5) * hw * 1.2; for (let q = 0; q < 4; q++) place('crate', p.x + nx * off + (q % 2) * 1.05, p.z + nz * off + Math.floor(q / 2) * 1.05, p.h, 0); place('crate', p.x + nx * off + 0.5, p.z + nz * off + 0.5, p.h, 1.0); }
      }
      // barrels before every jump kicker
      for (const jp of tr.jumps) { const i = Math.floor(jp * tr.N) - 14; const p = tr.pts[(i + tr.N) % tr.N]; const nx = -Math.sin(p.h), nz = Math.cos(p.h); for (const o of [-tr.width / 2 - 1.5, tr.width / 2 + 1.5]) for (let q = 0; q < 2; q++) place('barrel', p.x + nx * (o + Math.sign(o) * q * 0.7), p.z + nz * (o + Math.sign(o) * q * 0.7)); }
    }
    for (const [k, P] of Object.entries(this.propTypes)) {
      if (!P.list.length) continue;
      const inst = new THREE.InstancedMesh(P.geo, P.mat, P.list.length); inst.castShadow = true; inst.receiveShadow = true; inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      P.inst = inst; s.add(inst); this.syncProps(k, true);
    }
    this.debris = [];
  }
  syncProps(type, all = false) {
    const P = this.propTypes[type]; if (!P.inst) return; const m = new THREE.Matrix4(); let dirty = false;
    P.list.forEach((b, i) => { if (!all && b.isSleeping()) return; const t = b.translation(), r = b.rotation(); m.compose(tmpV.set(t.x, t.y, t.z), tmpQ.set(r.x, r.y, r.z, r.w), new THREE.Vector3(1, 1, 1)); P.inst.setMatrixAt(i, m); dirty = true; });
    if (dirty) P.inst.instanceMatrix.needsUpdate = true;
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
    // player starts at the back of the grid in races (FlatOut-style comeback), mid-pack in derby
    const order = tr.arena ? [0, ...Array.from({ length: nAI }, (_, i) => i + 1)] : [nAI, ...Array.from({ length: nAI }, (_, i) => i)];
    for (let k = 0; k <= nAI; k++) {
      const isP = k === 0;
      const spec = isP ? player : BANGERS[(k * 3 + 1) % BANGERS.length];
      const color = isP ? (this.o.color || spec.color) : AI_COLORS[(k - 1) % AI_COLORS.length];
      const g = grid[order[k]];
      this.cars.push(this.makeCar({ spec, color, num: isP ? 1 : k + 1, name: isP ? (this.o.playerName || 'Tu') : AI_NAMES[(k - 1) % AI_NAMES.length], isPlayer: isP, pos: g, skill: 0.78 + Math.random() * 0.2, aggr: 0.3 + Math.random() * 0.6 }));
    }
    this.player = this.cars[0];
  }

  makeCar({ spec, color, num, name, isPlayer, pos, skill, aggr }) {
    const mesh = buildBanger(spec.id, color, num, num * 31 + 7); this.scene.add(mesh);
    const { L, W } = mesh.userData.dims; const T = this.terrain;
    const y = T.heightAt(pos.x, pos.z) + 1.1;
    const rot = new THREE.Quaternion().setFromAxisAngle(UP, -pos.yaw);
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(pos.x, y, pos.z).setRotation(rot).setCanSleep(false).setLinearDamping(0.08).setAngularDamping(0.8).setCcdEnabled(true)
      .setAdditionalMassProperties(spec.mass, { x: 0, y: -0.25, z: 0 }, { x: spec.mass * 0.42, y: spec.mass * 2.1, z: spec.mass * 1.9 }, { x: 0, y: 0, z: 0, w: 1 }));
    const col = this.world.createCollider(RAPIER.ColliderDesc.cuboid(L - 0.05, 0.38, W - 0.03).setTranslation(0, 0.55, 0).setMass(60).setFriction(0.35).setRestitution(0.15)
      .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(9000), body);
    const cab = this.world.createCollider(RAPIER.ColliderDesc.cuboid(0.9, 0.25, W - 0.18).setTranslation(-0.2, 1.15, 0).setMass(20).setFriction(0.3), body);
    const vc = this.world.createVehicleController(body);
    const wr = mesh.userData.wr;
    mesh.userData.wheelPos.forEach(([x, z]) => vc.addWheel({ x, y: wr + 0.12, z }, { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 1 }, 0.3, wr));
    const slip = (this.venue.surface === 'asphalt' ? 2.6 : 1.9) * spec.grip;
    for (let i = 0; i < 4; i++) { vc.setWheelSuspensionStiffness(i, 26); vc.setWheelSuspensionCompression(i, 2.6); vc.setWheelSuspensionRelaxation(i, 3.4); vc.setWheelFrictionSlip(i, slip); vc.setWheelMaxSuspensionTravel(i, 0.32); vc.setWheelMaxSuspensionForce?.(i, 80000); vc.setWheelSideFrictionStiffness?.(i, 1.0); }
    const car = { mesh, body, col, vc, spec, name, isPlayer, color, num, skill, aggr, slip, hp: 100, nitro: isPlayer ? 35 : 30, steer: 0, idx: pos.idx ?? 0, lap: 0, half: false, finished: false, time: 0, wrecks: 0, out: false, stuckT: 0, flipT: 0, revT: 0, laneOff: (Math.random() - 0.5) * 5, airT: 0, wreckT: 0, lastHit: null, smokeT: 0 };
    this.handles.set(col.handle, { kind: 'car', car }); this.handles.set(cab.handle, { kind: 'car', car });
    return car;
  }

  respawn(car) {
    const tr = this.track, T = this.terrain;
    let x, z, yaw;
    if (tr.arena) { x = T.cx + (Math.random() - 0.5) * tr.R; z = T.cz + (Math.random() - 0.5) * tr.R; yaw = Math.random() * 6.28; }
    else { const p = tr.pts[car.idx]; x = p.x; z = p.z; yaw = p.h; }
    car.body.setTranslation({ x, y: T.heightAt(x, z) + 1.4, z }, true);
    const q = new THREE.Quaternion().setFromAxisAngle(UP, -yaw); car.body.setRotation(q, true);
    car.body.setLinvel({ x: 0, y: 0, z: 0 }, true); car.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    car.flipT = car.stuckT = 0; car.revT = 0;
  }

  // ---------------------------------------------------------------- input
  bindInput() {
    this._kd = (e) => { this.keys[e.code] = true; if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault(); if (e.code === 'KeyC') this.camMode = (this.camMode + 1) % 3; if (e.code === 'KeyR' && this.state === 'race' && this.player.hp > 0) this.respawn(this.player); if ((e.code === 'Escape' || e.code === 'KeyP') && (this.state === 'race' || this.state === 'paused')) this.togglePause(); };
    this._ku = (e) => { this.keys[e.code] = false; };
    window.addEventListener('keydown', this._kd); window.addEventListener('keyup', this._ku);
    this.camMode = 0;
  }
  readInput() {
    const k = this.keys; let thr = (k.KeyW || k.ArrowUp) ? 1 : 0, brk = (k.KeyS || k.ArrowDown) ? 1 : 0, st = ((k.KeyA || k.ArrowLeft) ? 1 : 0) - ((k.KeyD || k.ArrowRight) ? 1 : 0);
    let hb = k.Space ? 1 : 0, nitro = (k.ShiftLeft || k.ShiftRight || k.KeyN) ? 1 : 0, analog = false;
    const pads = navigator.getGamepads?.() || [];
    for (const gp of pads) {
      if (!gp) continue;
      const ax = gp.axes[0] || 0; if (Math.abs(ax) > 0.12) { st = -ax; analog = true; }
      thr = Math.max(thr, gp.buttons[7]?.value || 0); brk = Math.max(brk, gp.buttons[6]?.value || 0);
      if (gp.buttons[0]?.pressed) nitro = 1; if (gp.buttons[1]?.pressed) hb = 1;
      if (gp.buttons[3]?.pressed && !this._padY && this.state === 'race') this.respawn(this.player); this._padY = gp.buttons[3]?.pressed;
      if (gp.buttons[2]?.pressed && !this._padX) this.camMode = (this.camMode + 1) % 3; this._padX = gp.buttons[2]?.pressed;
      if (gp.buttons[9]?.pressed && !this._padS && (this.state === 'race' || this.state === 'paused')) this.togglePause(); this._padS = gp.buttons[9]?.pressed;
    }
    return { thr, brk, st, hb, nitro, analog };
  }
  togglePause() { this.state = this.state === 'paused' ? 'race' : 'paused'; this.hud.pause.classList.toggle('on', this.state === 'paused'); }

  // ---------------------------------------------------------------- driving
  drive(car, inp, dt) {
    const b = car.body, vc = car.vc;
    b.resetForces(true); b.resetTorques(true); // user forces persist in Rapier: rebuild them every frame
    const r = b.rotation(); const q = tmpQ.set(r.x, r.y, r.z, r.w);
    const fwd = new THREE.Vector3(1, 0, 0).applyQuaternion(q), up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    const lv = b.linvel(); const vel = new THREE.Vector3(lv.x, lv.y, lv.z);
    const vF = vel.dot(fwd), speed = vel.length();
    const dead = car.hp <= 0;
    // steering: rate-limited, less lock at speed
    const maxSt = 0.62 - Math.min(0.36, speed / 120);
    const tgt = dead ? 0 : inp.st * maxSt;
    car.steer += Math.max(-dt * (inp.analog ? 8 : 3.2), Math.min(dt * (inp.analog ? 8 : 3.2), tgt - car.steer));
    vc.setWheelSteering(0, car.steer); vc.setWheelSteering(1, car.steer);
    // engine / reverse / brakes
    const vmax = 46 * car.spec.top * (car.boost ? 1.18 : 1);
    let force = 0, brake = 0;
    if (!dead) {
      if (inp.thr > 0) force = inp.thr * 8800 * car.spec.power * Math.max(0, 1 - Math.max(0, vF) / vmax) ** 0.7;
      if (inp.brk > 0) { if (vF > 1.5) brake = inp.brk * 55; else force = -inp.brk * 3600 * Math.max(0, 1 - Math.max(0, -vF) / 14); }
      car.boost = inp.nitro && car.nitro > 0 && inp.thr > 0.2;
      if (car.boost) { force += 6000 * car.spec.power; car.nitro = Math.max(0, car.nitro - dt * 22); }
    } else brake = 8;
    const awd = car.spec.awd;
    for (let i = 0; i < 4; i++) {
      const driven = awd || i >= 2;
      vc.setWheelEngineForce(i, driven ? force / (awd ? 4 : 2) : 0);
      vc.setWheelBrake(i, brake * (i < 2 ? 0.6 : 0.4) + (inp.hb && i >= 2 ? 60 : 0));
      vc.setWheelFrictionSlip(i, car.slip * (inp.hb && i >= 2 ? 0.45 : 1) * (dead ? 0.6 : 1));
    }
    // aero drag + downforce-ish stability
    b.addForce({ x: -vel.x * speed * 0.42, y: -speed * speed * 0.9, z: -vel.z * speed * 0.42 }, true);
    const grounded = [0, 1, 2, 3].filter((i) => vc.wheelIsInContact(i)).length;
    if (!grounded) {
      car.airT += dt;
      // light air control: steer yaws, throttle/brake pitch
      b.addTorque({ x: up.x * inp.st * 900, y: up.y * inp.st * 900, z: up.z * inp.st * 900 }, true);
    } else {
      if (car.airT > 0.7) { const bonus = Math.min(20, car.airT * 9); this.award(car, bonus, car.airT > 1.4 ? 'Volo spettacolare!' : 'In volo!'); }
      car.airT = 0;
    }
    // self-righting when nearly upside down and slow
    if (up.y < 0.25 && speed < 4) { car.flipT += dt; } else car.flipT = 0;
    // anti-roll assist so the car does not tip over in normal cornering
    if (grounded >= 2 && up.y > 0.4) { const right = new THREE.Vector3(0, 0, 1).applyQuaternion(q); const roll = right.y; b.addTorque({ x: fwd.x * roll * 9000, y: fwd.y * roll * 9000, z: fwd.z * roll * 9000 }, true); }
    return { fwd, up, speed, vF, grounded };
  }

  aiInput(car, dt) {
    const tr = this.track, b = car.body, p = b.translation();
    const r = b.rotation(); const q = tmpQ.set(r.x, r.y, r.z, r.w);
    const fwd = new THREE.Vector3(1, 0, 0).applyQuaternion(q); const lv = b.linvel(); const speed = Math.hypot(lv.x, lv.z);
    let tx, tz, targetSpeed = 40;
    if (tr.arena) {
      // derby: hunt the nearest live car (sometimes prefer the player)
      let best = null, bd = 1e9;
      for (const o of this.cars) { if (o === car || o.out) continue; const op = o.body.translation(); let d = Math.hypot(op.x - p.x, op.z - p.z); if (o.isPlayer) d *= 0.75; if (d < bd) { bd = d; best = o; } }
      if (best) { const op = best.body.translation(); tx = op.x; tz = op.z; } else { tx = this.terrain.cx; tz = this.terrain.cz; }
      targetSpeed = 30;
    } else {
      const look = Math.round((7 + speed * 0.55) / tr.ds);
      const ti = (car.idx + look) % tr.N, tp = tr.pts[ti];
      const nx = -Math.sin(tp.h), nz = Math.cos(tp.h);
      car.laneOff += (Math.random() - 0.5) * dt * 0.8; car.laneOff = Math.max(-tr.width * 0.3, Math.min(tr.width * 0.3, car.laneOff));
      tx = tp.x + nx * car.laneOff; tz = tp.z + nz * car.laneOff;
      let kmax = 0; for (let k = 4; k < 30; k += 2) kmax = Math.max(kmax, Math.abs(tr.pts[(car.idx + k) % tr.N].k));
      targetSpeed = Math.min(46 * car.spec.top, Math.sqrt(9.5 * car.skill / Math.max(kmax, 0.002)));
      // ramming: aggressive drivers aim at a car just ahead
      for (const o of this.cars) {
        if (o === car || o.out) continue; const op = o.body.translation(); const dx = op.x - p.x, dz = op.z - p.z, d = Math.hypot(dx, dz);
        if (d < 22 && d > 3 && (dx * fwd.x + dz * fwd.z) / d > 0.86 && Math.random() < car.aggr * 0.08) { tx = op.x; tz = op.z; break; }
      }
    }
    const want = Math.atan2(tz - p.z, tx - p.x), cur = Math.atan2(fwd.z, fwd.x);
    let d = want - cur; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    let st = Math.max(-1, Math.min(1, -d * 2.4)); // positive steering turns left (+z is right in our frame)
    let thr = speed < targetSpeed ? 1 : 0, brk = speed > targetSpeed + 4 ? 1 : 0;
    // stuck / reverse recovery
    if (car.revT > 0) { car.revT -= dt; return { thr: 0, brk: 1, st: -st, hb: 0, nitro: 0 }; }
    if (speed < 1.2 && this.state === 'race') { car.stuckT += dt; if (car.stuckT > 1.8) { car.revT = 1.3; car.stuckT = 0; } } else car.stuckT = 0;
    const nitro = car.nitro > 25 && Math.abs(st) < 0.2 && speed > 15 && Math.random() < 0.7 ? 1 : 0;
    return { thr, brk, st, hb: Math.abs(d) > 1.2 && speed > 12 ? 1 : 0, nitro };
  }

  // ---------------------------------------------------------------- damage & events
  award(car, amt, text) { car.nitro = Math.min(100, car.nitro + amt); if (car.isPlayer && text) this.message(`${text} +${Math.round(amt)} nitro`, 'bonus'); }
  handleContacts(dt) {
    this.events.drainContactForceEvents((e) => {
      const A = this.handles.get(e.collider1()), B = this.handles.get(e.collider2()); if (!A || !B) return;
      const J = e.totalForceMagnitude() * dt;
      const pair = [[A, B], [B, A]];
      for (const [me, other] of pair) {
        if (me.kind !== 'car') continue; const car = me.car; if (car.out) continue;
        const scale = other.kind === 'ground' ? 0.25 : other.kind === 'prop' ? 0.35 : 1;
        const eff = J * scale; if (eff < 1600) continue;
        const dmg = Math.min(45, (eff - 1600) / (420 * car.spec.armor));
        // impact point: contact manifold if available, else along the force direction
        let wp = null;
        try { this.world.contactPair(e.collider1(), e.collider2(), (man) => { if (!wp && man.numSolverContacts?.() > 0) { const c = man.solverContactPoint(0); wp = new THREE.Vector3(c.x, c.y, c.z); } }); } catch {}
        const bt = car.body.translation(), br = car.body.rotation(); const q = new THREE.Quaternion(br.x, br.y, br.z, br.w);
        if (!wp) { const fd = e.maxForceDirection(); wp = new THREE.Vector3(bt.x - fd.x * 1.5, bt.y + 0.5, bt.z - fd.z * 1.5); }
        const local = wp.clone().sub(new THREE.Vector3(bt.x, bt.y, bt.z)).applyQuaternion(q.clone().invert());
        const inward = new THREE.Vector3(-local.x, 0, -local.z).normalize();
        this.applyDamage(car, dmg, local, inward, other.kind === 'car' ? other.car : null);
        if (eff > 2600) for (let k = 0; k < Math.min(30, eff / 600); k++) this.sparks.emit(wp.x, wp.y, wp.z, (Math.random() - 0.5) * 9, Math.random() * 5, (Math.random() - 0.5) * 9, 0.25 + Math.random() * 0.35, 0.35, 1, 0.75 + Math.random() * 0.2, 0.35, 1);
        if (car.isPlayer && dmg > 4) { this.shake = Math.min(1, (this.shake || 0) + dmg / 25); try { if (performance.now() - (this._crashSfx || 0) > 180) { this._crashSfx = performance.now(); sfx.crash(); } } catch {} }
      }
    });
  }
  applyDamage(car, dmg, local, dir, by) {
    if (dmg <= 0.5) return;
    const before = car.hp; car.hp = Math.max(0, car.hp - dmg);
    dent(car.mesh, local, dir, Math.min(0.22, dmg * 0.009));
    // parts in the hit zone lose hit points and may fly off
    const L = car.mesh.userData.dims.L;
    const zone = local.x > L * 0.45 ? 'front' : local.x < -L * 0.45 ? 'rear' : local.z > 0 ? 'left' : 'right';
    for (const pt of [...car.mesh.userData.parts]) if (pt.userData.zone === zone) { pt.userData.hp -= dmg; if (pt.userData.hp <= 0) this.detach(car, pt); }
    if (by && by !== car) { this.award(by, Math.min(18, dmg * 0.7), by.isPlayer ? (dmg > 14 ? 'Colpo devastante!' : 'Bella sportellata!') : null); car.lastHit = { by, t: this.time }; }
    if (before > 0 && car.hp <= 0) this.wreck(car);
  }
  detach(car, pt) {
    const parts = car.mesh.userData.parts; parts.splice(parts.indexOf(pt), 1);
    // recentre the part so its origin is the middle of its geometry (collider and visual line up)
    pt.geometry.computeBoundingBox(); const ctr = pt.geometry.boundingBox.getCenter(new THREE.Vector3());
    if (ctr.lengthSq() > 1e-6) { pt.geometry = pt.geometry.clone(); pt.geometry.translate(-ctr.x, -ctr.y, -ctr.z); pt.children.forEach((ch) => ch.position.sub(ctr)); pt.position.add(ctr.applyQuaternion(pt.quaternion)); }
    pt.updateWorldMatrix(true, false); const wp = new THREE.Vector3(), wq = new THREE.Quaternion(); pt.getWorldPosition(wp); pt.getWorldQuaternion(wq);
    car.mesh.remove(pt); this.scene.add(pt); pt.position.copy(wp); pt.quaternion.copy(wq);
    const bb = new THREE.Box3().setFromObject(pt); const sz = bb.getSize(new THREE.Vector3());
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(wp.x, wp.y, wp.z).setRotation(wq).setAngularDamping(0.4));
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(Math.max(0.05, sz.x / 2), Math.max(0.03, sz.y / 2), Math.max(0.05, sz.z / 2)).setMass(12).setFriction(0.6), body);
    const lv = car.body.linvel(); body.setLinvel({ x: lv.x * 0.8 + (Math.random() - 0.5) * 6, y: 3 + Math.random() * 4, z: lv.z * 0.8 + (Math.random() - 0.5) * 6 }, true);
    body.setAngvel({ x: (Math.random() - 0.5) * 12, y: (Math.random() - 0.5) * 12, z: (Math.random() - 0.5) * 12 }, true);
    // geometry centre offset: mesh origin may not be the box centre
    this.debris.push({ mesh: pt, body, t: 0 });
    if (this.debris.length > 50) { const o = this.debris.shift(); this.scene.remove(o.mesh); this.world.removeRigidBody(o.body); }
  }
  wreck(car) {
    car.wrecks++;
    if (car.lastHit && this.time - car.lastHit.t < 4 && car.lastHit.by) { car.lastHit.by.kills = (car.lastHit.by.kills || 0) + 1; this.award(car.lastHit.by, 35, car.lastHit.by.isPlayer ? `Hai demolito ${car.name}!` : null); }
    if (car.isPlayer) this.message('AUTO DISTRUTTA!', 'wreck');
    else this.message(`${car.name} è distrutto`, 'info');
    if (this.track.arena) { car.out = true; car.outT = this.time; }
    else car.wreckT = 4.5; // respawn after a pause, with patched-up car
  }

  // ---------------------------------------------------------------- race logic
  updateProgress(car) {
    const tr = this.track; if (tr.arena) return;
    const p = car.body.translation(); let best = car.idx, bd = 1e9;
    for (let k = -30; k <= 60; k++) { const i = (car.idx + k + tr.N) % tr.N; const q = tr.pts[i]; const d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2; if (d < bd) { bd = d; best = i; } }
    if (best < tr.N * 0.2 && car.idx > tr.N * 0.8) { if (car.half) { car.lap++; car.half = false; if (car.isPlayer && car.lap < this.laps) this.message(car.lap === this.laps - 1 ? 'ULTIMO GIRO!' : `Giro ${car.lap + 1}`, 'info'); if (car.lap >= this.laps && !car.finished) { car.finished = true; car.time = this.time; this.finishOrder.push(car); if (car.isPlayer) this.finish(); } } }
    else if (best > tr.N * 0.8 && car.idx < tr.N * 0.2) { /* went backwards over the line */ }
    if (best > tr.N * 0.45 && best < tr.N * 0.6) car.half = true;
    car.idx = best; car.offTrack = Math.sqrt(bd);
    car.prog = car.lap * tr.N + best + (car.finished ? 1e6 - car.time : 0);
  }
  standings() {
    if (this.track.arena) return this.cars.slice().sort((a, b) => (a.out - b.out) || (b.outT || 0) - (a.outT || 0) || b.hp - a.hp);
    return this.cars.slice().sort((a, b) => (b.prog || 0) - (a.prog || 0));
  }
  finish() { this.state = 'finished'; this.endT = this.time; this.showResults(); }

  // ---------------------------------------------------------------- frame
  frame(dt) {
    if (this.state === 'paused' || this.state === 'loading') { this.render(dt, true); return; }
    this.time += dt;
    if (this.state === 'countdown') { this.countdown -= dt; if (this.countdown <= 0) { this.state = 'race'; this.time = 0; this.message('VIA!', 'go'); } }
    this.laps = this.o.laps || this.venue.laps; this.finishOrder ||= [];
    const racing = this.state === 'race' || this.state === 'finished';
    const pin = this.readInput();
    for (const car of this.cars) {
      if (car.out) { this.drive(car, { thr: 0, brk: 0, st: 0, hb: 0, nitro: 0 }, dt); continue; }
      let inp = !racing ? { thr: 0, brk: 1, st: 0, hb: 1, nitro: 0 } : car.isPlayer && !(this.state === 'finished') ? pin : this.aiInput(car, dt);
      if (car.wreckT > 0) { car.wreckT -= dt; inp = { thr: 0, brk: 1, st: 0, hb: 0, nitro: 0 }; if (car.wreckT <= 0) { car.hp = 45; this.respawn(car); } }
      car.dyn = this.drive(car, inp, dt);
      if (car.flipT > 2.2) this.respawn(car);
      if (racing) this.updateProgress(car);
    }
    // physics: two substeps for stable high-speed contacts
    const sub = 2; for (let s = 0; s < sub; s++) { for (const car of this.cars) car.vc.updateVehicle(dt / sub); this.world.timestep = dt / sub; this.world.step(this.events); this.handleContacts(dt / sub); }
    // derby end condition
    if (this.track.arena && this.state === 'race') { const alive = this.cars.filter((c) => !c.out); if (this.player.out || alive.length <= 1) { this.finishOrder = this.standings(); this.finish(); } }
    if (!this.track.arena && this.state === 'race' && this.player.finished) this.finish();
    this.render(dt, false, pin);
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
    const lv = car.body.linvel(); const speed = Math.hypot(lv.x, lv.z);
    // dust from the wheels on dirt, tyre marks when sliding
    const q = car.mesh.quaternion, fwd = tmpV.set(1, 0, 0).applyQuaternion(q).clone(), side = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    const lat = Math.abs(lv.x * side.x + lv.z * side.z);
    for (let i = 2; i < 4; i++) {
      if (!vc.wheelIsInContact(i)) { this.skids.break(car.num * 10 + i); continue; }
      const cp = vc.wheelContactPoint?.(i); if (!cp) continue;
      const P = new THREE.Vector3(cp.x, cp.y, cp.z);
      if (this.venue.surface !== 'asphalt' && speed > 6 && Math.random() < 0.35) this.dust.emit(P.x, P.y + 0.3, P.z, -lv.x * 0.15 + (Math.random() - 0.5) * 2, 0.6 + Math.random(), -lv.z * 0.15 + (Math.random() - 0.5) * 2, 1.2 + Math.random() * 1.2, 0.8 + speed * 0.02, 0.66, 0.57, 0.45, 0.2);
      this.skids.add(car.num * 10 + i, P, side, lat > 3.5 || (car.isPlayer && this.keys.Space) ? Math.min(1, lat / 9 + 0.3) : 0);
    }
    // smoke and fire from damaged engines, nitro flames
    car.smokeT -= dt;
    if (car.hp < 55 && car.smokeT <= 0) {
      car.smokeT = car.hp < 25 ? 0.03 : 0.08;
      const hp = ud.dims.L - 0.4; const ep = new THREE.Vector3(hp, 0.95, 0).applyQuaternion(q).add(car.mesh.position);
      const k = car.hp < 25 ? 0.12 : 0.4; this.smoke.emit(ep.x, ep.y, ep.z, (Math.random() - 0.5) * 1.5, 1.5, (Math.random() - 0.5) * 1.5, 1.8, 0.9, k, k, k, 0.55);
      if (car.hp <= 15) this.fire.emit(ep.x, ep.y, ep.z, (Math.random() - 0.5), 2 + Math.random() * 2, (Math.random() - 0.5), 0.45, 0.7, 1, 0.45 + Math.random() * 0.3, 0.08, 0.9);
    }
    if (car.boost) { const ep = new THREE.Vector3(-ud.dims.L - 0.2, 0.33, -0.5).applyQuaternion(q).add(car.mesh.position); for (let k = 0; k < 3; k++) this.fire.emit(ep.x, ep.y, ep.z, -fwd.x * 8, 0.3, -fwd.z * 8, 0.12, 0.45, 0.4, 0.6, 1, 0.9); }
  }

  render(dt, frozen, pin) {
    for (const car of this.cars) this.syncCar(car, frozen ? 0 : dt);
    for (const k of Object.keys(this.propTypes)) this.syncProps(k);
    for (const d of this.debris) { const t = d.body.translation(), r = d.body.rotation(); d.mesh.position.set(t.x, t.y, t.z); d.mesh.quaternion.set(r.x, r.y, r.z, r.w); }
    if (!frozen) { this.dust.update(dt); this.smoke.update(dt); this.fire.update(dt); this.sparks.update(dt); }
    this.updateCamera(dt);
    // shadow follows the player
    const pp = this.player.mesh.position; this.sun.position.copy(pp).addScaledVector(this.sunDir, 150); this.sun.target.position.copy(pp);
    if (this.composer) this.composer.render(); else this.renderer.render(this.scene, this.camera);
    this.updateHud(dt, pin);
    const sp = this.player.dyn?.speed || 0; try { engineSet(Math.min(1, sp * 3.6 / 340 + (pin?.thr || 0) * 0.08), { crowd: 0.2 }); } catch {}
  }

  updateCamera(dt) {
    const c = this.player, q = c.mesh.quaternion, p = c.mesh.position;
    const fwd = new THREE.Vector3(1, 0, 0).applyQuaternion(q); fwd.y *= 0.3; fwd.normalize();
    const sp = c.dyn?.speed || 0;
    let pos, look, fov = 62 + Math.min(16, sp * 0.22) + (c.boost ? 8 : 0);
    if (this.camMode === 2) { pos = new THREE.Vector3(0.6, 1.25, 0).applyQuaternion(q).add(p); look = new THREE.Vector3(12, 0.9, 0).applyQuaternion(q).add(p); fov += 6; }
    else { const back = this.camMode === 1 ? 11 : 7.2, h = this.camMode === 1 ? 4.2 : 2.6; pos = p.clone().addScaledVector(fwd, -back); pos.y += h; look = p.clone().addScaledVector(fwd, 4); look.y += 0.9; }
    let gy = this.terrain.heightAt(pos.x, pos.z) + 1.3; for (let k = 1; k <= 3; k++) { const f = k / 4; gy = Math.max(gy, this.terrain.heightAt(p.x + (pos.x - p.x) * f, p.z + (pos.z - p.z) * f) + 1.0); } if (pos.y < gy) pos.y = gy;
    if (!this.camPos || this.camMode === 2) { this.camPos = pos.clone(); this.camLook = look.clone(); }
    else { this.camPos.lerp(pos, Math.min(1, dt * 6)); this.camLook.lerp(look, Math.min(1, dt * 10)); }
    const sh = this.shake || 0; this.shake = Math.max(0, sh - dt * 2.5);
    this.camera.position.copy(this.camPos).add(new THREE.Vector3((Math.random() - 0.5) * sh * 0.4, (Math.random() - 0.5) * sh * 0.4, (Math.random() - 0.5) * sh * 0.4));
    this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 4); this.camera.updateProjectionMatrix();
    this.camera.lookAt(this.camLook);
  }

  // ---------------------------------------------------------------- HUD
  buildHud() {
    const h = document.createElement('div'); h.className = 'dz-hud'; this.c.appendChild(h);
    h.innerHTML = `<div class="dz-top"><div class="dz-pos"><span id="dz-pos">1</span><small>/${this.cars.length}</small></div><div class="dz-lap" id="dz-lap"></div><div class="dz-time" id="dz-time">0:00.0</div></div>
      <div class="dz-board" id="dz-board"></div>
      <div class="dz-msgs" id="dz-msgs"></div>
      <div class="dz-count" id="dz-count"></div>
      <div class="dz-dash"><div class="dz-speed"><b id="dz-spd">0</b><small>km/h</small></div>
        <div class="dz-bar"><span>NITRO</span><div><i id="dz-nitro"></i></div></div>
        <div class="dz-bar dmg"><span>DANNI</span><div><i id="dz-hp"></i></div></div></div>
      <canvas class="dz-map" id="dz-map" width="220" height="220"></canvas>
      <div class="dz-help">W/S o ↑/↓ gas e freno · A/D sterzo · Spazio freno a mano · Shift nitro · R riposiziona · C camera · Esc pausa · Gamepad supportato</div>
      <div class="dz-pause" id="dz-pause"><h2>Pausa</h2><button class="btn primary lg" data-a="dz-resume">Riprendi</button><button class="btn lg" data-a="dz-restart">Ricomincia</button><button class="btn ghost lg" data-a="dz-quit">Esci</button></div>
      <div class="dz-results" id="dz-results"></div>`;
    this.hud = { root: h, pause: h.querySelector('#dz-pause') };
    // minimap
    const tr = this.track, T = this.terrain; const cv = h.querySelector('#dz-map'); const g = cv.getContext('2d');
    const [x0, z0, x1, z1] = tr.bbox; const s = 190 / Math.max(x1 - x0, z1 - z0);
    this.mapXY = (x, z) => [110 + (x - (x0 + x1) / 2) * s, 110 + (z - (z0 + z1) / 2) * s];
    this.mapBg = () => { g.clearRect(0, 0, 220, 220); g.lineWidth = 7; g.strokeStyle = 'rgba(255,255,255,0.25)'; g.beginPath(); if (tr.arena) { g.arc(110, 110, tr.R * s, 0, 7); } else tr.pts.forEach((p, i) => { const [x, y] = this.mapXY(p.x, p.z); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); g.stroke(); };
    this.mapCtx = g; void T;
  }
  message(text, kind = 'info') {
    const box = this.hud?.root.querySelector('#dz-msgs'); if (!box) return;
    const el = document.createElement('div'); el.className = 'dz-msg ' + kind; el.textContent = text; box.prepend(el);
    setTimeout(() => el.classList.add('out'), 1800); setTimeout(() => el.remove(), 2300);
    while (box.children.length > 4) box.lastChild.remove();
  }
  updateHud(dt) {
    const h = this.hud.root, P = this.player; this._hudT = (this._hudT || 0) + dt;
    const cnt = h.querySelector('#dz-count');
    if (this.state === 'countdown') { const n = Math.ceil(this.countdown - 0.6); cnt.textContent = n > 0 ? n : 'VIA!'; cnt.className = 'dz-count on'; }
    else if (this.time < 1) cnt.textContent = 'VIA!'; else cnt.className = 'dz-count';
    h.querySelector('#dz-spd').textContent = Math.round((P.dyn?.speed || 0) * 3.6);
    h.querySelector('#dz-nitro').style.width = P.nitro + '%';
    const hpEl = h.querySelector('#dz-hp'); hpEl.style.width = P.hp + '%'; hpEl.style.background = P.hp > 50 ? '#3ddc84' : P.hp > 25 ? '#ffb020' : '#ff3b3b';
    if (this._hudT < 0.12) return; this._hudT = 0;
    const st = this.standings(); const myPos = st.indexOf(P) + 1;
    h.querySelector('#dz-pos').textContent = myPos;
    h.querySelector('#dz-lap').textContent = this.track.arena ? `IN GARA ${this.cars.filter((c) => !c.out).length}/${this.cars.length}` : `GIRO ${Math.min(this.laps, P.lap + 1)}/${this.laps}`;
    const t = this.state === 'countdown' ? 0 : this.time; h.querySelector('#dz-time').textContent = `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
    h.querySelector('#dz-board').innerHTML = st.map((c, i) => `<div class="${c.isPlayer ? 'me' : ''} ${c.out ? 'out' : ''}"><b>${i + 1}</b><i style="background:${c.color}"></i><span>${c.name}</span><em style="width:${Math.max(0, c.hp) * 0.3}px;background:${c.hp > 50 ? '#3ddc84' : c.hp > 25 ? '#ffb020' : '#ff3b3b'}"></em></div>`).join('');
    this.mapBg(); const g = this.mapCtx;
    for (const c of this.cars) { if (c.out) continue; const p = c.body.translation(); const [x, y] = this.mapXY(p.x, p.z); g.fillStyle = c.isPlayer ? '#ffd400' : c.color; g.beginPath(); g.arc(x, y, c.isPlayer ? 6 : 4, 0, 7); g.fill(); if (c.isPlayer) { g.strokeStyle = '#000'; g.lineWidth = 2; g.stroke(); } }
  }
  showResults() {
    const res = this.finishOrder.length ? [...this.finishOrder, ...this.standings().filter((c) => !this.finishOrder.includes(c))] : this.standings();
    const myPos = res.indexOf(this.player) + 1;
    const prize = [12000, 8000, 5500, 4000, 3000, 2200, 1500, 1000][myPos - 1] || 500;
    const bonus = (this.player.kills || 0) * 1500;
    const el = this.hud.root.querySelector('#dz-results');
    el.innerHTML = `<div class="dz-res-card"><div class="tiny upper muted" style="letter-spacing:.3em">${this.track.arena ? 'Demolition derby' : 'Gara'} · ${this.venue.name}</div>
      <h2>${myPos === 1 ? '🏆 VITTORIA!' : `${myPos}° posto`}</h2>
      <table class="tbl"><thead><tr><th>Pos</th><th>Pilota</th><th>${this.track.arena ? 'Stato' : 'Tempo'}</th><th>Demolizioni</th></tr></thead><tbody>${res.map((c, i) => `<tr class="${c.isPlayer ? 'me' : ''}"><td>${i + 1}</td><td><i class="dz-dot" style="background:${c.color}"></i>${c.name}</td><td>${this.track.arena ? (c.out ? 'Distrutto' : 'In piedi') : c.finished ? `${Math.floor(c.time / 60)}:${(c.time % 60).toFixed(2).padStart(5, '0')}` : 'In pista'}</td><td>${c.kills || 0}</td></tr>`).join('')}</tbody></table>
      <div class="row between mt16"><span class="muted">Premio: <b>€ ${prize.toLocaleString('it-IT')}</b>${bonus ? ` + bonus demolizioni € ${bonus.toLocaleString('it-IT')}` : ''}</span>
      <div class="row gap6"><button class="btn lg" data-a="dz-restart">Rigioca</button><button class="btn primary lg" data-a="dz-quit">Continua</button></div></div></div>`;
    el.classList.add('on');
    this.onEnd({ pos: myPos, prize: prize + bonus, kills: this.player.kills || 0, venue: this.venue.id });
  }
}

function mergeGeos(list) {
  // tiny local merge (positions/normals/uvs), avoids importing BufferGeometryUtils
  let n = 0; for (const g of list) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), idx = []; let o = 0;
  for (const g of list) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); uv.set(g.attributes.uv.array, o * 2); const ix = g.index.array; for (let i = 0; i < ix.length; i++) idx.push(ix[i] + o); o += g.attributes.position.count; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx); return g;
}
