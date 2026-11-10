// 3D race view: circuit built from real geometry, broadcast-style cameras
import * as THREE from 'three';
import { makeForest, makeTreeShadows, vegOfKind } from './vegetation.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { trackGeometry, speedProfile, sampleAtTimeFrac } from '../engine/trackphys.js';
import { genStage, STAGE_STYLE } from './trackview.js';
import { getSettings } from '../engine/state.js';
import { passBy } from './audio.js';
import { buildCar, setTyreColor, setCarLOD, MAT } from './cars3d.js';
import { pbr, applyHDRI, makeComposer, detailPatch, hdriSun, hdriHorizon, WET, updateSunFlare, updateGodRays } from './gfx.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { biomeOf, RALLY_LOOK } from './env/biomes.js';
import { buildCoast, buildMidTerrain, buildDecals, buildLife, buildRallyExtras, buildGridSlots } from './env/scenery.js';

// Tree geometry (origin at the base, height 1) with vertex colours: trunk + layered foliage
function colorize(g, hex) { const c = new THREE.Color(hex); const n = g.attributes.position.count; const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const k = 0.85 + Math.random() * 0.3; a[i * 3] = c.r * k; a[i * 3 + 1] = c.g * k; a[i * 3 + 2] = c.b * k; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; }
let _treeGeo = null, _bushGeo = null;
function treeGeo() {
  if (_treeGeo) return _treeGeo;
  const parts = [colorize(new THREE.CylinderGeometry(0.05, 0.08, 0.3, 6).translate(0, 0.15, 0), '#5a3d25')];
  for (let i = 0; i < 4; i++) { const r = 0.48 - i * 0.1, y = 0.25 + i * 0.18; parts.push(colorize(new THREE.ConeGeometry(r, 0.36, 8).translate(0, y + 0.18, 0), i % 2 ? '#2f5d2a' : '#27502a')); }
  _treeGeo = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
  _treeGeo.computeVertexNormals();
  return _treeGeo;
}
function bushGeo() {
  if (_bushGeo) return _bushGeo;
  const parts = [colorize(new THREE.CylinderGeometry(0.05, 0.07, 0.35, 6).translate(0, 0.17, 0), '#5a3d25')];
  for (const [x, y, z, r] of [[0, 0.55, 0, 0.32], [0.18, 0.48, 0.1, 0.24], [-0.16, 0.5, -0.08, 0.25], [0.02, 0.72, 0.05, 0.22]]) parts.push(colorize(new THREE.IcosahedronGeometry(r, 1).translate(x, y, z), '#3f6b2e'));
  _bushGeo = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
  _bushGeo.computeVertexNormals();
  return _bushGeo;
}

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(...repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function noise(ctx, w, h, base, amp, n = 6000, size = 2) {
  ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) { const v = Math.random() * amp; ctx.fillStyle = `rgba(${v > amp / 2 ? 255 : 0},${v > amp / 2 ? 255 : 0},${v > amp / 2 ? 255 : 0},${Math.random() * 0.08})`; ctx.fillRect(Math.random() * w, Math.random() * h, size, size); }
}

// shared animation clock for crowd / flag shaders
const TIME = { value: 0 };
// endurance races at the night circuits start in the evening light
const DUSK_TRACKS = ['qat', 'bhr'];
// time-of-day presets (opts.timeOfDay): key light, sky fill, exposure / white balance of the
// grade, minimum shadow elevation, light-shaft strength, fallback sky gradient
const TOD = {
  day: { sun: 0xfff1dc, sunI: 2.3, hemi: 0xdfefff, hemiG: 0x4a6a3a, exp: 1.05, warm: 0.035, sat: 1.08, k: 1, el: 0.45, rays: 0.08, top: 0x3d7ad6, bot: 0xcfe3f7, disc: 0xfff6e6, bg: 1, fogK: 1 },
  afternoon: { sun: 0xffd9ae, sunI: 2.5, hemi: 0xffeedd, hemiG: 0x5a6a3a, exp: 1.0, warm: 0.055, sat: 1.1, k: 0.92, el: 0.3, rays: 0.2, top: 0x4a7fc9, bot: 0xf2dcc0, disc: 0xffe2b8, bg: 0.82, fogK: 0.95 },
  dusk: { sun: 0xffb27a, sunI: 1.75, hemi: 0xffd2b0, hemiG: 0x5a4a3a, exp: 1.0, warm: 0.07, sat: 1.06, k: 0.65, el: 0.22, rays: 0.32, top: 0x34507e, bot: 0xf2b27e, disc: 0xffb070, bg: 0.72, fogK: 0.72 },
};
// crowd material: people bob, stand up and wave (per seat cell), driven by TIME
function crowdPatch(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = TIME;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uTime;\nfloat chash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }')
      .replace('#include <map_fragment>', `
        vec2 cuv = vMapUv; vec2 cell = floor(cuv * vec2(28.0, 16.0)); float hh = chash(cell);
        float act = step(0.8, hh) * max(0.0, sin(uTime * (3.0 + hh * 5.0) + hh * 40.0));
        float wave = step(0.5, sin(uTime * 0.9 - cell.x * 0.35 + cell.y * 0.2)) * step(0.93, chash(vec2(floor(cell.x / 9.0), 3.0)));
        cuv.y -= (act * 0.22 + wave * 0.3) / 16.0 * step(0.5, fract(cuv.y * 16.0));
        vec4 sampledDiffuseColor = texture2D(map, cuv);
        diffuseColor *= sampledDiffuseColor;`);
  };
  mat.customProgramCacheKey = () => 'crowd';
  return mat;
}


// People (origin at the feet, facing +z), merged into one vertex-coloured geometry per pose.
// Pure white parts take the per-instance team colour (overalls / team shirt).
//   'crew'  : pit-crew mechanic in a fire suit and helmet with dark visor, standing ready
//   'kneel' : wheel-gunner down on one knee with the wheel gun raised
//   'staff' : engineer in team shirt, dark trousers, headset
//   'sit'   : seated engineer (pit-wall stand)
const _people = {};
function personGeo(kind = 'staff') {
  if (_people[kind]) return _people[kind];
  if (kind === 'spect') {
    // low-poly fan (~120 triangles): jeans, jacket (instance colour), head with a beanie
    const ps = [];
    const pt = (g, hex) => { g = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(g.attributes)) if (!['position', 'normal'].includes(k)) g.deleteAttribute(k); const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); ps.push(g); };
    for (const sx of [-0.1, 0.1]) pt(new THREE.CylinderGeometry(0.08, 0.065, 0.88, 5).translate(sx, 0.44, 0), '#2b3445');
    pt(new THREE.CylinderGeometry(0.2, 0.17, 0.62, 6).scale(1, 1, 0.65).translate(0, 1.18, 0), '#ffffff');
    for (const sx of [-0.25, 0.25]) pt(new THREE.CylinderGeometry(0.055, 0.05, 0.58, 4).translate(sx, 1.12, 0.02), '#ffffff');
    pt(new THREE.SphereGeometry(0.11, 6, 4).translate(0, 1.62, 0), '#c99a7a');
    pt(new THREE.SphereGeometry(0.115, 6, 3, 0, Math.PI * 2, 0, Math.PI * 0.45).translate(0, 1.64, 0), '#1c1f26');
    const g = mergeGeometries(ps); g.computeBoundingSphere(); _people[kind] = g; return g;
  }
  const parts = [];
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const paint = (g, hex) => { g = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(g.attributes)) if (!['position', 'normal'].includes(k)) g.deleteAttribute(k); const c = new THREE.Color(hex); const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); parts.push(g); return g; };
  // tapered limb between two points with rounded joints
  const limb = (a, b, r0, r1, hex, joint = true) => {
    const d = b.clone().sub(a), L = d.length();
    const g = new THREE.CylinderGeometry(r1, r0, L, 8, 1, true).translate(0, L / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize())); g.translate(a.x, a.y, a.z); paint(g, hex);
    if (joint) paint(new THREE.SphereGeometry(r1, 8, 6).translate(b.x, b.y, b.z), hex);
  };
  const ball = (p, r, hex, sx = 1, sy = 1, sz = 1) => paint(new THREE.SphereGeometry(r, 10, 8).scale(sx, sy, sz).translate(p.x, p.y, p.z), hex);
  const suit = '#ffffff', dark = '#15171b', glove = '#1b1d22', shoe = '#0c0d0f', skin = '#c99a7a';
  const crew = kind === 'crew' || kind === 'kneel';
  const legC = crew ? suit : '#23262d', shirt = '#ffffff';
  // torso: lathe profile (hips -> chest -> shoulders), flattened front-to-back
  const torso = (y0, lean = 0, zOff = 0) => {
    const pr = [[0.0, 0.12], [0.02, 0.165], [0.15, 0.16], [0.3, 0.175], [0.44, 0.195], [0.52, 0.185], [0.56, 0.12], [0.58, 0.0]].map(([y, r]) => new THREE.Vector2(r, y));
    const g = new THREE.LatheGeometry(pr, 12).scale(1, 1, 0.62).rotateX(lean).translate(0, y0, zOff);
    paint(g, crew ? suit : shirt);
    // belt / harness band
    paint(new THREE.CylinderGeometry(0.168, 0.168, 0.05, 12, 1, true).scale(1, 1, 0.62).translate(0, 0.07, 0).rotateX(lean).translate(0, y0, zOff), dark);
    const top = V(0, y0 + 0.56 * Math.cos(lean), zOff + 0.56 * Math.sin(lean));
    return top;
  };
  const head = (neck, lean = 0) => {
    const h = V(neck.x, neck.y + 0.16, neck.z + 0.03 + Math.sin(lean) * 0.08);
    limb(V(neck.x, neck.y - 0.02, neck.z), V(neck.x, neck.y + 0.06, neck.z + 0.01), 0.055, 0.05, crew ? dark : skin, false);
    if (crew) {
      ball(h, 0.135, suit, 1, 1.05, 1.08);                                   // helmet in team colour
      paint(new THREE.SphereGeometry(0.138, 12, 6, -0.9, 1.8, 1.15, 0.5).scale(1, 1.05, 1.08).translate(h.x, h.y, h.z), '#0a0c10'); // visor
      paint(new THREE.BoxGeometry(0.2, 0.05, 0.06).translate(h.x, h.y - 0.1, h.z + 0.09), dark); // chin bar
    } else {
      ball(h, 0.105, skin, 1, 1.1, 1.05);
      paint(new THREE.SphereGeometry(0.11, 10, 5, 0, Math.PI * 2, 0, Math.PI * 0.42).scale(1, 1.1, 1.05).translate(h.x, h.y + 0.012, h.z - 0.01), '#2a211b'); // hair
      paint(new THREE.TorusGeometry(0.115, 0.012, 4, 12, Math.PI).translate(h.x, h.y + 0.01, h.z), '#111');          // headset band
      for (const s of [-1, 1]) paint(new THREE.CylinderGeometry(0.045, 0.045, 0.035, 10).rotateZ(Math.PI / 2).translate(h.x + s * 0.115, h.y - 0.01, h.z), '#111');
    }
  };
  if (kind === 'kneel') {
    // right foot planted forward, left knee on the ground, leaning towards the wheel
    const hip = 0.52;
    for (const s of [-1, 1]) paint(new THREE.SphereGeometry(0.1, 8, 6).translate(s * 0.1, hip, 0), legC);
    limb(V(0.1, hip, 0), V(0.11, hip - 0.02, 0.42), 0.09, 0.075, legC); limb(V(0.11, hip - 0.02, 0.42), V(0.11, 0.09, 0.44), 0.07, 0.06, legC, false);
    paint(new THREE.BoxGeometry(0.11, 0.09, 0.27).translate(0.11, 0.045, 0.5), shoe);
    limb(V(-0.1, hip, 0), V(-0.1, 0.09, 0.12), 0.09, 0.075, legC); limb(V(-0.1, 0.09, 0.12), V(-0.1, 0.08, -0.36), 0.07, 0.06, legC, false);
    paint(new THREE.BoxGeometry(0.11, 0.08, 0.25).rotateX(0.9).translate(-0.1, 0.08, -0.44), shoe);
    const top = torso(hip - 0.02, 0.42, 0.0);
    head(top, 0.42);
    // arms forward holding the gun
    for (const s of [-1, 1]) { const sh = V(s * 0.2, top.y - 0.06, top.z - 0.02); const el = V(s * 0.17, top.y - 0.3, top.z + 0.22); const wr = V(s * 0.06, top.y - 0.3, top.z + 0.46); limb(sh, el, 0.06, 0.05, suit); limb(el, wr, 0.05, 0.045, suit); ball(wr, 0.055, glove); }
    paint(new THREE.CylinderGeometry(0.06, 0.06, 0.32, 10).rotateX(Math.PI / 2).translate(0, top.y - 0.3, top.z + 0.6), '#2b2f36'); // wheel gun
    paint(new THREE.BoxGeometry(0.06, 0.16, 0.06).translate(0, top.y - 0.39, top.z + 0.52), '#2b2f36');
  } else if (kind === 'sit') {
    const hip = 0.48;
    for (const s of [-1, 1]) { limb(V(s * 0.1, hip, 0), V(s * 0.11, hip, 0.42), 0.085, 0.07, legC); limb(V(s * 0.11, hip, 0.42), V(s * 0.11, 0.08, 0.45), 0.065, 0.055, legC, false); paint(new THREE.BoxGeometry(0.1, 0.08, 0.25).translate(s * 0.11, 0.04, 0.52), shoe); }
    const top = torso(hip - 0.04, -0.05);
    head(top);
    for (const s of [-1, 1]) { const sh = V(s * 0.21, top.y - 0.06, top.z); const el = V(s * 0.24, top.y - 0.32, top.z + 0.08); const wr = V(s * 0.12, top.y - 0.36, top.z + 0.34); limb(sh, el, 0.055, 0.048, shirt); limb(el, wr, 0.047, 0.04, skin); ball(wr, 0.045, skin); }
  } else {
    const hip = 0.92;
    for (const s of [-1, 1]) {
      paint(new THREE.SphereGeometry(0.105, 8, 6).translate(s * 0.1, hip, 0), legC);
      limb(V(s * 0.1, hip, 0), V(s * 0.105, 0.5, 0.02), 0.095, 0.075, legC); limb(V(s * 0.105, 0.5, 0.02), V(s * 0.11, 0.09, -0.01), 0.07, 0.055, legC, false);
      paint(new THREE.BoxGeometry(0.11, 0.09, 0.28).translate(s * 0.11, 0.045, 0.05), shoe);
    }
    const top = torso(hip - 0.04, 0.03);
    head(top);
    for (const s of [-1, 1]) {
      const sh = V(s * 0.215, top.y - 0.07, top.z); const el = V(s * 0.26, top.y - 0.36, top.z - 0.02); const wr = V(s * 0.24, top.y - 0.62, top.z + 0.06);
      limb(sh, el, 0.06, 0.05, crew ? suit : shirt); limb(el, wr, 0.05, 0.042, crew ? suit : skin); ball(wr, 0.05, crew ? glove : skin);
    }
    if (crew) for (const s of [-1, 1]) paint(new THREE.BoxGeometry(0.012, 0.5, 0.012).translate(s * 0.17, hip + 0.3, 0.108), dark); // suit piping
  }
  const g = mergeGeometries(parts); g.computeBoundingSphere();
  _people[kind] = g;
  return g;
}

export function webglAvailable() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}

export class Race3D {
  constructor(container, { cid, geo, street = 0, night = false, cars = [], category = 'formula', surface = null, wet = false, timeOfDay = null }) {
    this.container = container;
    if (typeof window !== 'undefined') window.__r3d = this; // latest view (debugging / screenshots)
    this.geo = geo || trackGeometry(cid);
    this.open = !!this.geo.open;
    if (!this.open && this.geo.cross?.length) {
      // figure-of-eight circuits: lift the second branch onto a bridge
      const N = this.geo.N, h = new Float64Array(N), R = 70;
      for (const [, j] of this.geo.cross) for (let k = -R; k <= R; k++) { const t = 1 - Math.abs(k) / R; const v = 8.5 * Math.min(1, t * 1.6) ** 2 * (3 - 2 * Math.min(1, t * 1.6)); const q = (j + k + N) % N; h[q] = Math.max(h[q], v); }
      this.geo = { ...this.geo, h, bridges: this.geo.cross };
    }
    this.surface = surface;
    this.category = category;
    this.night = night; this._wetStart = wet;
    // endurance races at these circuits run into the night (setNight): the lighting rigs are
    // built up front and faded in. Floodlit circuits light the whole lap, the others only the pits
    const nightCid = ['lem', 'qat', 'bhr'].includes(this.geo.cid);
    this.nightable = night || (category === 'endurance' && nightCid);
    this.floodlit = night || ['qat', 'bhr'].includes(this.geo.cid);
    this.camMode = 'tv';
    this.focusKey = null;
    this.low = getSettings().gfx === 'low';
    this.renderer = new THREE.WebGLRenderer({ antialias: !this.low, powerPreference: 'high-performance', logarithmicDepthBuffer: true });
    this.renderer.setPixelRatio(this.low ? 1 : Math.min(1.5, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = !this.low;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = night ? 1.0 : 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);
    Object.assign(this.renderer.domElement.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' });
    this.scene = new THREE.Scene();
    try { const pm = new THREE.PMREMGenerator(this.renderer); this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; this.scene.environmentIntensity = 0.45; } catch {}
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.3, 6000);
    // teams in entry order (first = nearest the pit exit): garages, stands and boxes
    this.teamList = []; this._boxes = new Map();
    for (const c of cars) {
      if (c.category === 'rally' && category !== 'rally') continue; // endurance GT traffic never pits
      const team = String(c.key).split('#')[0];
      if (!this._boxes.has(team)) { this._boxes.set(team, this.teamList.length); this.teamList.push({ team, livery: { primary: '#e10600', secondary: '#ffffff', accent: '#111111', ...c.livery }, sponsor: c.sponsor, n: 0 }); }
    }
    this.labels = document.createElement('div');
    Object.assign(this.labels.style, { position: 'absolute', inset: '0', pointerEvents: 'none', overflow: 'hidden' });
    container.appendChild(this.labels);
    this.biome = biomeOf(this.geo.cid); this._gridN = Math.max(10, cars.length);
    this.buildEnv(street);
    this.street = street;
    if (this.open) this.buildStage(); else { this.buildTrack(street); this.buildScenery(street); }
    this.buildRacingLine();
    // the two headlight spot lights of the night races exist (at intensity 0) from the very
    // first frame: adding / un-hiding a light later changes the light count of every lit
    // material and recompiles them all at once (a visible hitch at nightfall)
    if (!this.low && this.nightable) this.carSpots = [0, 1].map(() => { const s = new THREE.SpotLight(0xeef3ff, 0, 90, 0.42, 0.6, 1.7); this.scene.add(s); this.scene.add(s.target); return s; });
    WET.value = 0;
    // time of day: explicit opts.timeOfDay ('day' | 'afternoon' | 'dusk'), else endurance races at
    // the night circuits start in the evening light
    this.skyKind = night ? 'night' : TOD[timeOfDay] ? timeOfDay : category === 'endurance' && DUSK_TRACKS.includes(this.geo.cid) ? 'dusk' : (!this.open && TOD[this.biome.tod] ? this.biome.tod : 'day');
    this.tod = TOD[this.skyKind] || null;
    if (this.tod) {
      const T = this.tod;
      this.sun.color.setHex(T.sun); this.sun.intensity = T.sunI; this.hemi.color.setHex(T.hemi); this.hemi.groundColor.setHex(T.hemiG); this.renderer.toneMappingExposure = T.exp;
      this.skyMat.uniforms.top.value.setHex(T.top); this.skyMat.uniforms.bot.value.setHex(T.bot);
    }
    applyHDRI(this.renderer, this.scene, this.skyKind, { intensity: night ? 0.35 : 0.9 }).then((ok) => {
      if (ok && this.skyDome) { this.skyDome.visible = false; if (this.clouds) this.clouds.visible = false; this.hdr = true; }
      // align the key light with the sun painted in the HDRI (elevation clamped for readable shadows)
      const sd = !night && hdriSun(this.skyKind);
      const hz = !night && hdriHorizon(this.skyKind);
      if (hz && this.scene.fog) { this.scene.fog.color.copy(hz).multiplyScalar(this.tod?.fogK ?? 1); if (this.biome.fog && !this.open) this.scene.fog.color.lerp(new THREE.Color(this.biome.fog), 0.5); this.fogDay = this.scene.fog.color.clone(); this._wetApplied = -1; }
      if (ok && this.tod) { this.scene.backgroundIntensity = this.tod.bg; if (this._lit) this._lit.bg = this.tod.bg; }
      if (sd) { const el = Math.min(0.95, Math.max(this.tod?.el ?? 0.45, Math.asin(sd.y))); const az = Math.atan2(sd.z, sd.x); this.sunDir.set(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)); }
      if (sd) this.buildSunDisc(sd);
    });
    this.composer = makeComposer(this.renderer, this.scene, this.camera, { bloom: night ? 0.45 : 0.18, low: this.low, ao: true, flare: !night, rays: !night, dof: true });
    if (this.composer?.grade && this.tod) { this.composer.grade.uniforms.uWarm.value = this.tod.warm; this.composer.grade.uniforms.uSat.value = this.tod.sat; }
    if (this.composer?.rays && this.tod) this.composer.rays.uniforms.uTint.value.setHex(this.tod.disc);
    this.cars = new Map();
    for (const c of cars) this.addCar(c);
    this.camPos = new THREE.Vector3(0, 50, 0);
    this.camLook = new THREE.Vector3();
    this.tvCams ||= this.makeTvCams();
    this.rain = null;
    if (this.open && wet) this.setRain(0.6);
    if (!this.open && !this.low && this.asphaltMat?.userData.wetPatch) this.initWetReflect();
    this.resize();
    this._ro = new ResizeObserver(() => this.resize());
    this._ro.observe(container);
  }

  destroy() {
    this._ro?.disconnect();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labels.remove();
    this.scene.traverse((o) => { o.geometry?.dispose?.(); });
    MAT.light('#ff2020', 3).emissiveIntensity = 3;
    // livery materials are shared with the garage / menus: wash the race dirt off
    for (const c of this.cars.values()) if (c.dirtMat) c.dirtMat.userData.dirtU.value = 0;
  }

  resize() {
    const r = this.container.getBoundingClientRect();
    if (!r.width) return;
    this.renderer.setSize(r.width, r.height, false);
    this.composer?.setSize(r.width, r.height);
    this.camera.aspect = r.width / r.height;
    this.camera.updateProjectionMatrix();
    this.W = r.width; this.H = r.height;
  }

  buildEnv() {
    const night = this.night;
    const sky = night ? 0x070b18 : 0x8fc2ff;
    this.scene.background = new THREE.Color(sky);
    this.scene.fog = new THREE.Fog(night ? 0x070b18 : 0xc8d6e2, 500, 3200);
    const hemi = new THREE.HemisphereLight(night ? 0x334466 : 0xdfefff, night ? 0x0b0d10 : 0x4a6a3a, night ? 0.6 : 0.45);
    this.scene.add(hemi); this.hemi = hemi;
    // at night the key light stands in for the circuit floodlights (high, warm-white)
    const sun = new THREE.DirectionalLight(night ? 0xfff0dc : 0xfff1dc, night ? 1.55 : 2.2);
    this.sunDir = night ? new THREE.Vector3(0.22, 0.93, 0.3).normalize() : new THREE.Vector3(0.55, 0.62, 0.45).normalize();
    sun.position.copy(this.sunDir).multiplyScalar(400);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    // tight frustum that follows the camera target (see updateCamera)
    const sc = sun.shadow.camera; sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 50; sc.far = 900;
    sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.03;
    this.scene.add(sun); this.scene.add(sun.target);
    this.sun = sun;
    // sky dome gradient
    const g = new THREE.SphereGeometry(5000, 24, 12);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(night ? 0x02040c : 0x3d7ad6) }, bot: { value: new THREE.Color(night ? 0x141c33 : 0xcfe3f7) } },
      vertexShader: 'varying vec3 vp; void main(){ vp = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 bot; varying vec3 vp; void main(){ float h = normalize(vp).y; gl_FragColor = vec4(mix(bot, top, clamp(h*1.6,0.0,1.0)),1.0); }',
    });
    this.skyDome = new THREE.Mesh(g, skyMat); this.skyMat = skyMat;
    this.scene.add(this.skyDome);
    // clouds
    const cloudTex = canvasTex(256, 128, (c, w, h) => { c.clearRect(0, 0, w, h); for (let i = 0; i < 18; i++) { const x = w * (0.2 + Math.random() * 0.6), y = h * (0.4 + Math.random() * 0.25), r = 20 + Math.random() * 34; const g2 = c.createRadialGradient(x, y, 0, x, y, r); g2.addColorStop(0, 'rgba(255,255,255,0.85)'); g2.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g2; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); } });
    const cloudMat = new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: night ? 0.12 : 0.85, depthWrite: false, fog: false });
    this.clouds = new THREE.Group();
    for (let i = 0; i < 26; i++) { const sp = new THREE.Sprite(cloudMat); const a = Math.random() * Math.PI * 2, d = 900 + Math.random() * 1800; sp.position.set(Math.cos(a) * d, 260 + Math.random() * 260, Math.sin(a) * d); const sc = 500 + Math.random() * 700; sp.scale.set(sc, sc / 2, 1); this.clouds.add(sp); }
    this.scene.add(this.clouds);
  }

  // ribbon along the centerline from offset a to b (meters, + = left)
  ribbon(a, b, y, material, vScale = 0.05, step = 1, uSpan = 1, flat = false, skipRaised = false) {
    const { N, x, y: Y, hdg } = this.geo;
    const pos = [], uv = [], idx = [];
    let v = 0;
    const count = this.open ? Math.ceil(N / step) : Math.ceil(N / step) + 1;
    for (let n = 0; n < count; n++) {
      const i = this.open ? Math.min(N - 1, n * step) : (n * step) % N;
      const nx = -Math.sin(hdg[i]), nz = Math.cos(hdg[i]);
      const hh = this.geo.h ? this.geo.h[i] : 0;
      pos.push(x[i] + nx * a, y + hh, Y[i] + nz * a, x[i] + nx * b, y + hh, Y[i] + nz * b);
      uv.push(0, v, uSpan, v);
      v += this.geo.ds * step * vScale;
      if (n < count - 1) {
        const i2 = this.open ? Math.min(N - 1, (n + 1) * step) : ((n + 1) * step) % N;
        if (!(skipRaised && this.geo.h && (this.geo.h[i] > 0.3 || this.geo.h[i2] > 0.3))) { const k = n * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, material);
    m.receiveShadow = true;
    return m;
  }

  // flat strip over pit coordinates q0..q1 (samples from the line) between offsets a(q)..b(q)
  laneStrip(q0, q1, a, b, y, material, vScale = 1 / 6, uvFn = null) {
    const { N, x, y: Y, hdg } = this.geo;
    const pos = [], uv = [], idx = [];
    for (let q = q0, n = 0; q <= q1; q++, n++) {
      const i = ((q % N) + N) % N; const nx = -Math.sin(hdg[i]), nz = Math.cos(hdg[i]);
      const A = a(q), B = b(q), hh = this.geo.h ? this.geo.h[i] : 0;
      pos.push(x[i] + nx * A, y + hh, Y[i] + nz * A, x[i] + nx * B, y + hh, Y[i] + nz * B);
      if (uvFn) uv.push(...uvFn(q, 0), ...uvFn(q, 1)); else uv.push(0, n * this.geo.ds * vScale, (B - A) * vScale, n * this.geo.ds * vScale);
      if (q < q1) { const k = n * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, material); m.receiveShadow = true; return m;
  }

  // ribbon over a sample range [i0, i1] (wraps), offsets a..b, edges faded in over 4 samples
  // edge = true: no taper; instead an aEdge attribute (metres from the outer edge, metres from
  // the nearest end) lets edgeDissolve() break the outline up into a ragged natural border
  segRibbon(i0, i1, a, b, y, material, vScale = 0.1, edge = false) {
    const { N, x, y: Y, hdg } = this.geo;
    const pos = [], uv = [], idx = [], ed = [];
    const n = i1 - i0;
    for (let q = 0; q <= n; q++) {
      const i = (((i0 + q) % N) + N) % N;
      const nx = -Math.sin(hdg[i]), nz = Math.cos(hdg[i]);
      const t = edge ? 1 : Math.min(1, Math.min(q, n - q) / 4);
      const inner = Math.abs(a) < Math.abs(b) ? a : b;
      const outer = inner === a ? b : a;
      const o2 = inner + (outer - inner) * t;
      const A = inner === a ? a : o2, B = inner === a ? o2 : b;
      pos.push(x[i] + nx * A, y, Y[i] + nz * A, x[i] + nx * B, y, Y[i] + nz * B);
      uv.push(0, q * this.geo.ds * vScale, Math.abs(B - A) * vScale, q * this.geo.ds * vScale);
      if (edge) { const wd = Math.abs(B - A), dl = Math.min(q, n - q) * this.geo.ds; ed.push(inner === a ? wd : 0, dl, inner === a ? 0 : wd, dl); }
      if (q < n) { const k = q * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    if (edge) g.setAttribute('aEdge', new THREE.Float32BufferAttribute(ed, 2));
    const m = new THREE.Mesh(g, material); m.receiveShadow = true; return m;
  }

  // ragged, noisy outline for surfaces carrying aEdge (gravel traps, grass verges): fragments
  // closer to the border than a world-space noise threshold are discarded (no blending / sorting)
  edgeDissolve(mat, { lat = 1.8, lon = 3.0, scale = 0.7 } = {}) {
    const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey?.bind(mat);
    mat.onBeforeCompile = (sh, r) => {
      prev?.call(mat, sh, r);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aEdge; varying vec2 vEdge; varying vec2 vEW;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvEdge = aEdge; vEW = (modelMatrix * vec4(transformed, 1.0)).xz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        varying vec2 vEdge; varying vec2 vEW;
        float eh(vec2 p) { p = fract(p * vec2(127.1, 311.7)); p += dot(p, p + 19.19); return fract(p.x * p.y); }
        float en(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(eh(i), eh(i + vec2(1, 0)), f.x), mix(eh(i + vec2(0, 1)), eh(i + vec2(1, 1)), f.x), f.y); }`)
        .replace('#include <alphatest_fragment>', `#include <alphatest_fragment>
          { float e = min(vEdge.x / ${lat.toFixed(2)}, vEdge.y / ${lon.toFixed(2)});
            float nz = 0.55 * en(vEW * ${scale.toFixed(3)}) + 0.3 * en(vEW * ${(scale * 3.7).toFixed(3)}) + 0.15 * eh(floor(vEW * 9.0));
            if (e < nz * 0.98) discard; }`);
    };
    mat.customProgramCacheKey = () => (prevKey ? prevKey() : '') + '|edge' + lat + ',' + lon + ',' + scale;
    return mat;
  }
  // aEdge for a plain ribbon: distance from the outer border (vertex 0 = offset a, 1 = b)
  ribbonEdge(mesh, outerIsA, width) {
    const g = mesh.geometry, n = g.attributes.position.count, e = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { const isA = i % 2 === 0; e[i * 2] = isA === outerIsA ? 0 : width; e[i * 2 + 1] = 999; }
    g.setAttribute('aEdge', new THREE.BufferAttribute(e, 2));
    return mesh;
  }

  buildTrack(street) {
    const W = street > 0.7 ? 11 : 13;
    this.TW = W;
    { const N = this.geo.N; this.pitSpan = 44; this.inPitZone = (i, m = 0) => { const d = Math.min(((i % N) + N) % N, N - ((i % N) + N) % N); return d <= this.pitSpan + m; }; }
    const D = (m, o) => (this.low ? m : detailPatch(m, o));
    this.desert = ['bhr', 'qat', 'abu', 'ksa'].includes(this.geo.cid);
    this.computeLine();
    this.asphaltMat = this.low ? new THREE.MeshStandardMaterial({ color: 0x3b3e44, roughness: 0.85 }) : D(pbr('asphalt_02', { color: 0x75757a, roughness: 1, normalScale: 0.8 }), { macro: 0.1, macroScale: 0.06, wet: true, rough: [0.62, 1.0], key: 'asph', track: { halfW: W / 2, uScale: 6 } });
    const runoffMat = this.low ? new THREE.MeshStandardMaterial({ color: 0x777b82, roughness: 0.9 }) : D(pbr('concrete_floor_worn_001', { color: street > 0.7 ? 0x8a8a8a : 0xb8b8b8 }), { macro: 0.12, macroScale: 0.05, wet: true });
    const grassCol = this.biome.grass;
    const groundMat = this.low ? new THREE.MeshStandardMaterial({ color: street > 0.7 ? 0x84817b : 0x3f7a34, roughness: 1 }) : D(pbr(street > 0.7 ? 'concrete_floor_worn_001' : 'aerial_grass_rock', { repeat: [1400, 1400], color: street > 0.7 ? 0xb9b4aa : grassCol }), { macro: street > 0.7 ? 0.34 : 0.22, macroScale: street > 0.7 ? 0.03 : 0.012, tint: street > 0.7 ? 0x9a8f80 : this.biome.dry, tintAmt: street > 0.7 ? 0.5 : this.biome.dryAmt });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(12000, 12000), groundMat);
    ground.rotation.x = -Math.PI / 2; ground.position.set((this.geo.bbox[0] + this.geo.bbox[2]) / 2, -0.25, (this.geo.bbox[1] + this.geo.bbox[3]) / 2);
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.groundCol = street > 0.7 ? 0x4c4f54 : grassCol;
    const runoff = street > 0.7 ? 3 : 16;
    if (street > 0.7) {
      this.scene.add(this.ribbon(W / 2, W / 2 + runoff, 0.01, runoffMat, 1 / 5, 1, runoff / 5, false, true));
      this.scene.add(this.ribbon(-W / 2 - runoff, -W / 2, 0.01, runoffMat, 1 / 5, 1, runoff / 5, false, true));
    } else {
      // permanent circuit: narrow tarmac shoulder, then grass up to the barriers, gravel traps outside corners
      const shoulder = this.low ? new THREE.MeshStandardMaterial({ color: 0x55585e, roughness: 0.9 }) : D(pbr('asphalt_02', { color: 0x6c6c6c, roughness: 1 }), { macro: 0.14, macroScale: 0.05, wet: true, rough: [0.65, 1.0] });
      const grass = this.low ? new THREE.MeshStandardMaterial({ color: 0x4f8a3c, roughness: 1 }) : D(pbr('aerial_grass_rock', { color: new THREE.Color(grassCol).lerp(new THREE.Color(0xffffff), 0.1).getHex(), roughness: 1 }), { macro: 0.2, macroScale: 0.03, tint: this.biome.dry, tintAmt: 0.35, mow: this.desert ? null : { uScale: 14 }, key: 'verge' });
      this.scene.add(this.ribbon(W / 2, W / 2 + 2.2, 0.012, shoulder, 1 / 6, 1, 2.2 / 6));
      this.scene.add(this.ribbon(-W / 2 - 2.2, -W / 2, 0.012, shoulder, 1 / 6, 1, 2.2 / 6));
      // the mown verge frays into the rougher field grass
      this.edgeDissolve(grass, { lat: 6, lon: 1e-3, scale: 0.35 });
      this.scene.add(this.ribbonEdge(this.ribbon(W / 2 + 2.2, W / 2 + runoff + 6, 0.0, grass, 1 / 14, 2, (runoff + 4) / 14, false, true), false, runoff + 3.8));
      this.scene.add(this.ribbonEdge(this.ribbon(-W / 2 - runoff - 6, -W / 2 - 2.2, 0.0, grass, 1 / 14, 2, (runoff + 4) / 14, false, true), true, runoff + 3.8));
      const gravel = this.edgeDissolve(this.low ? new THREE.MeshStandardMaterial({ color: 0xc9b48a, roughness: 1 }) : D(pbr('gravel_floor', { color: 0xe6d2a8, roughness: 1 }), { macro: 0.14, macroScale: 0.08 }));
      for (const cn of this.geo.corners) {
        if (cn.r > 220) continue;
        const span = Math.min(40, Math.max(14, Math.round(cn.r / 6)));
        const side = -cn.dir;
        if (side > 0 && (this.inPitZone(cn.i - span, 6) || this.inPitZone(cn.i + span, 6))) continue;
        const g0 = W / 2 + 5.5;
        const a = side > 0 ? g0 : -(W / 2 + runoff - 1), b = side > 0 ? W / 2 + runoff - 1 : -g0;
        this.scene.add(this.segRibbon(cn.i - Math.round(span * 0.6), cn.i + span, a, b, 0.02, gravel, 1 / 3.5, true));
      }
      // painted asphalt run-off (track-limit zone) outside every corner, between kerb and gravel
      const paint = this.low ? new THREE.MeshStandardMaterial({ color: 0x2c7a52, roughness: 0.8 }) : D(new THREE.MeshStandardMaterial({ color: 0x25603f, roughness: 0.62 }), { antiTile: false, macro: 0.12, macroScale: 0.08, wet: true, key: 'paint' });
      const stripe = new THREE.MeshStandardMaterial({ color: 0xe9ecef, roughness: 0.6 });
      for (const cn of this.geo.corners) {
        if (cn.r > 260) continue;
        const span = Math.min(34, Math.max(12, Math.round(cn.r / 7)));
        const side = -cn.dir;
        if (side > 0 && (this.inPitZone(cn.i - span, 6) || this.inPitZone(cn.i + span, 6))) continue;
        const i0 = cn.i - Math.round(span * 0.7), i1 = cn.i + span;
        this.scene.add(side > 0 ? this.segRibbon(i0, i1, W / 2 + 1.3, W / 2 + 5.5, 0.026, paint, 1 / 6) : this.segRibbon(i0, i1, -(W / 2 + 5.5), -(W / 2 + 1.3), 0.026, paint, 1 / 6));
        this.scene.add(side > 0 ? this.segRibbon(i0 + 2, i1 - 2, W / 2 + 5.2, W / 2 + 5.45, 0.03, stripe, 1 / 6) : this.segRibbon(i0 + 2, i1 - 2, -(W / 2 + 5.45), -(W / 2 + 5.2), 0.03, stripe, 1 / 6));
      }
    }
    // white edge lines + rubbered racing line
    const lineMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6 });
    this.scene.add(this.ribbon(W / 2 - 0.35, W / 2 - 0.1, 0.045, lineMat, 0.05));
    this.scene.add(this.ribbon(-W / 2 + 0.1, -W / 2 + 0.35, 0.045, lineMat, 0.05));
    // rubbered-in racing line: two tyre tracks made of fine streaks
    const rubTex = canvasTex(256, 512, (c, w, h) => {
      c.clearRect(0, 0, w, h);
      for (const cu of [0.27, 0.73]) for (let k = 0; k < 140; k++) {
        const u = cu + (Math.random() + Math.random() + Math.random() - 1.5) * 0.16; const a = 0.05 + Math.random() * 0.12 * (1 - Math.abs(u - cu) * 4);
        c.fillStyle = `rgba(8,8,8,${Math.max(0, a)})`; c.fillRect(u * w, 0, 1 + Math.random() * 3, h);
      }
      for (let k = 0; k < 400; k++) { c.fillStyle = `rgba(8,8,8,${Math.random() * 0.08})`; c.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 8, 10 + Math.random() * 60); }
    });
    this.rubberMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: rubTex, roughness: 0.85, transparent: true, opacity: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
    if (!this.low) detailPatch(this.rubberMat, { antiTile: false, macro: 0, wet: true, key: 'rubber' });
    {
      // racing surface carries track-space data for the surface shader (racing line, marbles)
      const road = this.ribbon(-W / 2, W / 2, 0.03, this.asphaltMat, 1 / 6, 1, W / 6);
      const { N, k } = this.geo; const cnt = road.geometry.attributes.position.count / 2; const a = new Float32Array(cnt * 6);
      for (let n = 0; n < cnt; n++) {
        const i = n % N; let kk = 0; for (let q = -12; q <= 12; q += 3) kk = Math.max(kk, Math.abs(k[(i + q + N) % N]));
        const corner = Math.min(1, Math.max(0, (kk - 1 / 400) * 70));
        a.set([-W / 2, this.line[i], corner, W / 2, this.line[i], corner], n * 6);
      }
      road.geometry.setAttribute('aTrk', new THREE.BufferAttribute(a, 3));
      this.scene.add(road);
    }
    this.buildKerbs(W, street);
    const { N } = this.geo;
    // barriers
    const wallTex = canvasTex(256, 32, (c, w, h) => { const cols = street > 0.7 ? ['#e8e8e8', '#c81e1e'] : ['#d32f2f', '#f2f2f2']; for (let i = 0; i < 8; i++) { c.fillStyle = cols[i % 2]; c.fillRect(i * w / 8, 0, w / 8, h); } c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(0, h - 4, w, 4); });
    const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.7, side: THREE.DoubleSide });
    // pit lane on the + side around the start line. Cross-section (metres from the centre):
    // pit wall | team stands | fast lane (driving line pitOff) | white line | working lane with
    // the boxes (pitBoxOff) | garages (front at pitBack)
    this.pitSpan = 44;
    {
      const pw = W / 2 + (street > 0.7 ? 1.2 : 2.0), fl0 = pw + 2.1, fl1 = fl0 + 4.4, wl0 = fl1 + 0.2, wl1 = wl0 + 5.6;
      this.pit = { wall: pw, fl0, fl1, wl0, wl1 };
      this.pitOff = (fl0 + fl1) / 2; this.pitBoxOff = (wl0 + wl1) / 2; this.pitBack = wl1 + 0.4; this.pitGarage = this.pitBack + 4.2;
    }
    const pitW = (i) => { const d = Math.min(i, N - i); return d <= this.pitSpan + 2 ? 1 : d >= this.pitSpan + 16 ? 0 : 1 - (d - this.pitSpan - 2) / 14; };
    const baseWall = W / 2 + runoff + (street > 0.7 ? 0.5 : 4);
    // free space to each side before reaching another part of the circuit: barriers go halfway
    const clr = [new Float32Array(N).fill(999), new Float32Array(N).fill(999)];
    { const { x, y, hdg } = this.geo; const hh = this.geo.h;
      for (let i = 0; i < N; i++) { const c = Math.cos(hdg[i]), sn = Math.sin(hdg[i]);
        for (let j = 0; j < N; j++) { let d = Math.abs(i - j); d = Math.min(d, N - d); if (d < 16) continue; if (hh && Math.abs(hh[i] - hh[j]) > 3) continue;
          const vx = x[j] - x[i], vy = y[j] - y[i]; if (Math.abs(vx) > 90 || Math.abs(vy) > 90) continue;
          const lon = vx * c + vy * sn, lat = -vx * sn + vy * c; if (Math.abs(lon) > 14) continue;
          if (lat > 0) clr[0][i] = Math.min(clr[0][i], lat); else clr[1][i] = Math.min(clr[1][i], -lat); } }
      for (const a of clr) { const b = Float32Array.from(a); for (let i = 0; i < N; i++) { let m = 999; for (let q = -6; q <= 6; q++) m = Math.min(m, b[(i + q + N) % N]); a[i] = m; } } }
    this.sideClr = clr;
    const rawWall = (i, side) => side > 0 ? baseWall + (this.pitBack + 1.2 - baseWall) * pitW(i) : baseWall;
    this.wallOff = (i, side) => { i = ((i % N) + N) % N; return Math.max(W / 2 + 1.4, Math.min(rawWall(i, side), clr[side > 0 ? 0 : 1][i] / 2)); };
    // + side barriers stop where the garages close the pit lane
    this.inPitZone = (i, m = 0) => { const d = Math.min(((i % N) + N) % N, N - ((i % N) + N) % N); return d <= this.pitSpan + m; };
    {
      const pm = this.low ? new THREE.MeshStandardMaterial({ color: 0x55585e, roughness: 0.85 }) : detailPatch(pbr('concrete_floor_worn_001', { color: 0x9a9ca0, roughness: 0.85, repeat: [1, 1] }), { macro: 0.1, macroScale: 0.05, wet: true, rough: [0.5, 0.95], key: 'pitlane' });
      const P = this.pitSpan;
      // asphalt from the track edge to the garages, tapering into the track at entry and exit
      this.scene.add(this.laneStrip(-P - 15, P + 15, () => W / 2 + 0.2, (q) => { const t = Math.min(1, Math.max(0, (P + 15 - Math.abs(q)) / 13)); return W / 2 + 0.2 + (this.pitBack + 0.6 - W / 2 - 0.2) * t * t * (3 - 2 * t); }, 0.025, pm, 1 / 6));
      // lane lines: fast-lane edge by the pit wall, fast / working lane divider
      this.scene.add(this.laneStrip(-P + 1, P - 1, () => this.pit.fl0 - 0.1, () => this.pit.fl0 + 0.1, 0.04, lineMat));
      this.scene.add(this.laneStrip(-P + 1, P - 1, () => this.pit.fl1 + 0.0, () => this.pit.fl1 + 0.2, 0.04, lineMat));
    }
    this.buildBarriers(street, wallMat);
    // bridge decks and pillars for figure-of-eight crossings
    if (this.geo.bridges) {
      const deckMat = new THREE.MeshStandardMaterial({ color: 0x8d9095, roughness: 0.8 });
      for (const [i0, j] of this.geo.bridges) {
        for (let k = -16; k <= 16; k += 2) {
          const q = (j + k + N) % N; const hq = this.geo.h[q];
          const deck = new THREE.Mesh(new THREE.BoxGeometry(this.geo.ds * 2 + 0.3, 1.1, W + 4), deckMat);
          this.placeAt(deck, q, 0, hq - 0.6); deck.castShadow = true; deck.receiveShadow = true; this.scene.add(deck);
          if (k % 4 === 0) for (const sd of [1, -1]) {
            const nx = -Math.sin(this.geo.hdg[q]), nz = Math.cos(this.geo.hdg[q]);
            const px = this.geo.x[q] + nx * sd * (W / 2 + 1.2), pz = this.geo.y[q] + nz * sd * (W / 2 + 1.2);
            let ok = true; for (let t = -24; t <= 24; t++) { const r = (i0 + t + N) % N; if (Math.hypot(this.geo.x[r] - px, this.geo.y[r] - pz) < W / 2 + 2.5) { ok = false; break; } }
            if (!ok) continue;
            const pil = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, hq - 1, 10), deckMat); pil.position.set(px, (hq - 1) / 2, pz); pil.castShadow = true; this.scene.add(pil);
          }
        }
      }
    }
    // start line
    const chk = canvasTex(64, 16, (c, w, h) => { for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) { c.fillStyle = (i + j) % 2 ? '#fff' : '#111'; c.fillRect(i * 4, j * 4, 4, 4); } });
    const sl = new THREE.Mesh(new THREE.PlaneGeometry(1.6, W), new THREE.MeshStandardMaterial({ map: chk }));
    sl.rotation.x = -Math.PI / 2; sl.rotation.z = -this.geo.hdg[0];
    sl.position.set(this.geo.x[0], 0.05, this.geo.y[0]);
    void sl; // replaced by the chequered line in the track decals
    buildDecals(this, street);
  }

  // profiled kerbs (raised outer lip) with worn paint, plus yellow sausage kerbs at tight apexes
  buildKerbs(W, street) {
    const { N } = this.geo;
    const kerbTex = canvasTex(64, 256, (c, w, h) => {
      for (let i = 0; i < 2; i++) { c.fillStyle = i ? '#eef0f0' : '#c8141b'; c.fillRect(0, i * h / 2, w, h / 2); }
      // grooves across the kerb, rubber smears on the track side, dirt on the outer lip
      c.fillStyle = 'rgba(0,0,0,0.13)'; for (let y = 0; y < h; y += 16) c.fillRect(0, y, w, 3);
      for (let k = 0; k < 160; k++) { c.fillStyle = `rgba(18,18,18,${Math.random() * 0.16})`; c.fillRect(Math.random() ** 2 * w * 0.7, Math.random() * h, 1 + Math.random() * 5, 6 + Math.random() * 40); }
      for (let k = 0; k < 90; k++) { c.fillStyle = `rgba(90,80,60,${Math.random() * 0.12})`; c.fillRect(w * (0.75 + Math.random() * 0.25), Math.random() * h, 2 + Math.random() * 4, 4 + Math.random() * 14); }
      // worn paint: chips showing grey concrete, heavy black rubber where wheels ride the kerb
      for (let k = 0; k < 220; k++) { c.fillStyle = `rgba(120,118,112,${0.25 + Math.random() * 0.4})`; const r = 0.5 + Math.random() * 2.2; c.beginPath(); c.arc(Math.random() * w, Math.random() * h, r, 0, 7); c.fill(); }
      const rg = c.createLinearGradient(0, 0, w * 0.55, 0); rg.addColorStop(0, 'rgba(14,14,14,0.38)'); rg.addColorStop(1, 'rgba(14,14,14,0)'); c.fillStyle = rg; c.fillRect(0, 0, w * 0.55, h);
    });
    kerbTex.anisotropy = 8;
    const kerbMat = new THREE.MeshStandardMaterial({ map: kerbTex, roughness: 0.55 });
    if (!this.low) detailPatch(kerbMat, { antiTile: false, macro: 0.08, macroScale: 0.1, wet: true, key: 'kerb' });
    // cross-section: [distance from track edge (m), height (m)]
    const prof = [[0, 0.035], [0.25, 0.06], [0.95, 0.08], [1.05, 0.125], [1.28, 0.12], [1.32, 0.0]];
    const pos = [], uv = [], idx = [];
    const strip = (i0, n, side, profile, vRate, taper) => {
      const base = pos.length / 3, P = profile.length;
      for (let q = 0; q <= n; q++) {
        const i = (i0 + q + N) % N;
        const nx = -Math.sin(this.geo.hdg[i]), nz = Math.cos(this.geo.hdg[i]);
        const hk = this.geo.h ? this.geo.h[i] : 0;
        const t = taper ? Math.min(1, Math.min(q, n - q) / taper) : 1;
        for (const [d, y] of profile) {
          const o = side * (W / 2 + d0(profile) + d);
          pos.push(this.geo.x[i] + nx * o, hk + 0.03 + (y - 0.03) * t, this.geo.y[i] + nz * o);
          uv.push(d / profile[P - 1][0], q * vRate);
        }
        if (q < n) for (let k = 0; k < P - 1; k++) {
          const a = base + q * P + k, b = a + P;
          if (side > 0) idx.push(a, a + 1, b, a + 1, b + 1, b); else idx.push(a, b, a + 1, a + 1, b, b + 1);
        }
      }
    };
    const d0 = (profile) => profile.off || 0;
    for (const cn of this.geo.corners) {
      const span = Math.min(30, Math.max(10, Math.round(cn.r / 12)));
      // no kerb on the pit side where the pit wall / pit lane run alongside
      for (const side of [1, -1]) { if (side > 0 && this.inPitZone && (this.inPitZone(cn.i - span, 4) || this.inPitZone(cn.i + span, 4))) continue; strip(cn.i - span, span * 2, side, prof, 1.8, 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, kerbMat); m.receiveShadow = true; this.scene.add(m);
    // sausage kerbs behind the inside kerb of slow corners (permanent circuits)
    if (street > 0.7) return;
    pos.length = 0; uv.length = 0; idx.length = 0;
    const sProf = [[0, 0.0], [0.04, 0.07], [0.15, 0.13], [0.3, 0.15], [0.45, 0.13], [0.56, 0.07], [0.6, 0.0]]; sProf.off = 1.45;
    for (const cn of this.geo.corners) {
      if (cn.r > 90) continue;
      const side = cn.dir > 0 ? 1 : -1; // inside of the corner
      if (side > 0 && this.inPitZone && (this.inPitZone(cn.i - 5, 4) || this.inPitZone(cn.i + 5, 4))) continue;
      strip(cn.i - 5, 10, side, sProf, 1.2, 0);
    }
    if (!idx.length) return;
    const sTex = canvasTex(64, 128, (c, w, h) => { c.fillStyle = '#f2c400'; c.fillRect(0, 0, w, h); c.fillStyle = '#16181b'; for (let y = -h; y < h * 2; y += 64) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y + 32); c.lineTo(w, y + 56); c.lineTo(0, y + 24); c.fill(); } });
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); sg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); sg.setIndex(idx); sg.computeVertexNormals();
    const sm = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ map: sTex, roughness: 0.5 })); sm.castShadow = true; sm.receiveShadow = true; this.scene.add(sm);
  }

  buildStage() {
    const surf = this.surface || 'gravel';
    const W = surf === 'tarmac' ? 7 : 6;
    this.TW = W;
    const cols = { gravel: ['#8b6a43', '#6d5232'], rough: ['#7a5534', '#5a3d22'], tarmac: ['#3d4046', '#2e3035'], snow: ['#e9f2f8', '#c7d7e3'] }[surf];
    const road = canvasTex(256, 256, (c, w, h) => { noise(c, w, h, cols[0], 255, 14000, 3); c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(w * 0.25, 0, w * 0.12, h); c.fillRect(w * 0.63, 0, w * 0.12, h); if (surf === 'tarmac') { c.fillStyle = '#e8e8e8'; for (let y = 0; y < h; y += 64) c.fillRect(w / 2 - 2, y, 4, 32); } });
    const roadId = { tarmac: 'asphalt_02', gravel: 'gravel_floor', rough: 'rocky_trail', snow: 'snow_02' }[surf];
    this.asphaltMat = this.low ? new THREE.MeshStandardMaterial({ map: road, roughness: surf === 'snow' ? 0.5 : 0.95 }) : detailPatch(pbr(roadId, { color: surf === 'tarmac' ? 0x8a8a8a : surf === 'gravel' ? 0xbcab92 : surf === 'rough' ? 0xd6cbb8 : 0xffffff, roughness: surf === 'snow' ? 0.6 : 1 }), { macro: 0.16, macroScale: 0.05, wet: surf !== 'snow', key: 'stage-road', track: { halfW: W / 2, uScale: surf === 'tarmac' ? 5 : 2.5, ruts: surf !== 'tarmac', snow: surf === 'snow' } });
    const vergeMat = this.low ? new THREE.MeshStandardMaterial({ map: canvasTex(128, 128, (c, w, h) => noise(c, w, h, cols[1], 255, 5000, 3)), roughness: 1 }) : pbr(surf === 'snow' ? 'snow_02' : 'rocky_trail', { color: surf === 'snow' ? 0xffffff : 0xa89a80 });
    const groundCol = surf === 'snow' ? '#dfe9f1' : surf === 'tarmac' ? '#4f6b3a' : '#5d6b38';
    const N = this.geo.N, gx = this.geo.x, gz = this.geo.y, gh = this.geo.h || new Float64Array(N);
    let hAvg = 0, hMin = Infinity; for (let i = 0; i < N; i++) { hAvg += gh[i]; hMin = Math.min(hMin, gh[i]); } hAvg /= N;
    // terrain heightfield that hugs the road (road height near it, rolling ground further away)
    const C = 40, cells = new Map();
    for (let i = 0; i < N; i++) { const k = Math.floor(gx[i] / C) + ',' + Math.floor(gz[i] / C); if (!cells.has(k)) cells.set(k, []); cells.get(k).push(i); }
    const near = (x, z) => {
      const cx = Math.floor(x / C), cz = Math.floor(z / C); let bd = Infinity, bi = -1;
      for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) { const l = cells.get((cx + a) + ',' + (cz + b)); if (l) for (const i of l) { const d = (gx[i] - x) ** 2 + (gz[i] - z) ** 2; if (d < bd) { bd = d; bi = i; } } }
      return [bd, bi];
    };
    const ph = [0, 1, 2, 3, 4, 5].map(() => Math.random() * 6.283), RL = RALLY_LOOK[surf] || RALLY_LOOK.gravel;
    const [bx0, bz0, bx1, bz1] = this.geo.bbox; const M = 320;
    const X0 = bx0 - M, Z0 = bz0 - M, X1 = bx1 + M, Z1 = bz1 + M;
    const G = this.low ? 110 : 220; const cellW = Math.max((X1 - X0) / G, (Z1 - Z0) / Math.max(20, Math.round(G * (Z1 - Z0) / (X1 - X0))));
    const sm = (a, b, t) => { const u = Math.max(0, Math.min(1, (t - a) / (b - a))); return u * u * (3 - 2 * u); };
    const terrH = (x, z, hi = -1, hd = 0) => {
      const edge = Math.max(sm(X0 + M * 0.8, X0, x), sm(X1 - M * 0.8, X1, x), sm(Z0 + M * 0.8, Z0, z), sm(Z1 - M * 0.8, Z1, z));
      let T = hAvg + 7 * Math.sin(x * 0.004 + ph[0]) * Math.cos(z * 0.0035 + ph[1]) + 3 * Math.sin(x * 0.011 + z * 0.009 + ph[2]);
      T = T + (hMin - 2.5 - T) * edge;
      let [d2, i] = near(x, z); let d = Math.sqrt(d2);
      if (i < 0) { if (hi < 0) { i = nearFar(x, z); if (i < 0) return T; d = Math.hypot(gx[i] - x, gz[i] - z); } else { i = hi; d = hd; } }
      // the land follows the road's own height nearby and eases to the rolling ground far away;
      // beyond the verges it rises into ridges and drops into hollows (valley roads, hillsides)
      const w = sm(W / 2 + 2.5, 60, d), wf = sm(120, 520, d);
      const ridge = Math.sin(x * 0.0085 + ph[4]) * Math.cos(z * 0.0075 + ph[5]) + 0.45 * Math.sin((x - z) * 0.019 + ph[2]);
      const rel = RL.relief * sm(30, 220, d) * (0.25 + Math.max(-0.45, ridge)) * (1 - edge);
      const base = gh[i] - 0.3;
      return base + (rel + 2.5 * sm(10, 40, d)) * w + (T - base) * wf;
    };
    // coarse lookup for points far from the road (props on the hills, cameras)
    const nearFar = (x, z) => { let b = Infinity, bi = -1; for (let i = 0; i < N; i += 6) { const d = (gx[i] - x) ** 2 + (gz[i] - z) ** 2; if (d < b) { b = d; bi = i; } } return b < 1.2e6 ? bi : -1; };
    this.terrH = terrH;
    {
      // terrain corridor: cross-sections along the road (fine by the verges, coarse further out),
      // every vertex on the same height function, so the land hugs the road on stages of any
      // length (a uniform grid over a 20 km stage is far too coarse to follow it)
      const offs = [3.4, 6, 10, 17, 28, 45, 70, 105, 150, 210, 290, 420, 900], st = this.low ? 2 : 1;
      const lat = [...offs.slice().reverse().map((o) => -o), ...offs], P = lat.length, rows = Math.floor((N - 1) / st) + 1;
      const pos = new Float32Array(rows * P * 3), uv = new Float32Array(rows * P * 2), idx = [];
      for (let r = 0; r < rows; r++) {
        const i = Math.min(N - 1, r * st), nx = -Math.sin(this.geo.hdg[i]), nz = Math.cos(this.geo.hdg[i]);
        lat.forEach((o, q) => {
          const x = gx[i] + nx * o, z = gz[i] + nz * o, k = r * P + q;
          pos[k * 3] = x; pos[k * 3 + 1] = Math.abs(o) > 500 ? hMin - 3.2 : terrH(x, z, i, Math.abs(o)); pos[k * 3 + 2] = z; uv[k * 2] = x / 21; uv[k * 2 + 1] = z / 21;
          if (r < rows - 1 && q < P - 1 && !(o < 0 && lat[q + 1] > 0)) idx.push(k, k + 1, k + P, k + 1, k + P + 1, k + P);
        });
      }
      // under the road: one quad per row between the two inner edges, just below the verge
      for (let r = 0; r < rows - 1; r++) { const k = r * P + offs.length - 1; idx.push(k, k + 1, k + P, k + 1, k + P + 1, k + P); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
      const tm = this.low ? new THREE.MeshStandardMaterial({ map: canvasTex(256, 256, (c, w, h) => noise(c, w, h, groundCol, 255, 12000, 3), [1, 1]), roughness: 1 })
        : detailPatch(pbr(surf === 'snow' ? 'snow_02' : 'aerial_grass_rock', { color: RL.ground }), { macro: 0.32, macroScale: 0.018, tint: RL.tint, tintAmt: RL.tintAmt, key: 'stage' });
      const terr = new THREE.Mesh(g, tm); terr.receiveShadow = true; this.scene.add(terr);
      this.groundH = (x, z) => terrH(x, z);
    }
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(30000, 30000), this.low ? new THREE.MeshStandardMaterial({ map: canvasTex(256, 256, (c, w, h) => noise(c, w, h, groundCol, 255, 12000, 3), [600, 600]), roughness: 1 }) : detailPatch(pbr(surf === 'snow' ? 'snow_02' : 'aerial_grass_rock', { repeat: [3000, 3000], color: RL.ground }), { macro: 0.2, macroScale: 0.01 }));
    ground.rotation.x = -Math.PI / 2; ground.position.set((bx0 + bx1) / 2, hMin - 3, (bz0 + bz1) / 2); ground.receiveShadow = true;
    this.scene.add(ground);
    // verges fray into the terrain
    this.edgeDissolve(vergeMat, { lat: 1.4, lon: 1e-3, scale: 0.9 });
    this.scene.add(this.ribbonEdge(this.ribbon(W / 2, W / 2 + 2.5, 0.01, vergeMat, 1 / 2, 1, 1.25), false, 2.5));
    this.scene.add(this.ribbonEdge(this.ribbon(-W / 2 - 2.5, -W / 2, 0.01, vergeMat, 1 / 2, 1, 1.25), true, 2.5));
    {
      // the road carries track-space data (lateral offset, driving line, cornerness) for ruts / rubber
      this.computeLine();
      const road = this.ribbon(-W / 2, W / 2, 0.03, this.asphaltMat, surf === 'tarmac' ? 1 / 5 : 1 / 2.5, 1, surf === 'tarmac' ? W / 5 : W / 2.5);
      const cnt = road.geometry.attributes.position.count / 2, a = new Float32Array(cnt * 6);
      for (let n = 0; n < cnt; n++) { const i = Math.min(N - 1, n); const kk = Math.min(1, Math.abs(this.geo.k[i]) * 60); a.set([-W / 2, this.line[i], kk, W / 2, this.line[i], kk], n * 6); }
      road.geometry.setAttribute('aTrk', new THREE.BufferAttribute(a, 3));
      this.scene.add(road);
    }
    if (surf === 'snow') {
      const bankMat = new THREE.MeshStandardMaterial({ color: 0xf4f8fb, roughness: 0.6 });
      for (const side of [1, -1]) { const m = this.ribbon(side * (W / 2 + 2.4), side * (W / 2 + 3.4), 0.5, bankMat, 0.05, 2); this.scene.add(m); }
    }
    // dense forest along the road (photoreal impostors standing on the terrain)
    const kinds = surf === 'rough' ? [['bush', 0.4], ['broad', 0.35], ['desert', 0.25]] : surf === 'snow' ? [['conifer', 1]] : [['conifer', 0.7], ['broad', 0.3]];
    const pool = vegOfKind(kinds.map((k) => k[0]));
    const pick = () => { let r = Math.random(); for (const [k, w] of kinds) { if ((r -= w) <= 0) return k; } return kinds[0][0]; };
    const items = []; const target = Math.round(Math.min(9000, N * 7) * (this.low ? 0.35 : 1));
    this.tvCams = this.makeTvCams();
    const sight = this.tvCams.flatMap((c) => [0, -12, -24].map((dd) => { const j = Math.max(0, Math.min(N - 1, c.i + dd)); return [c.pos.x, c.pos.z, gx[j], gz[j]]; }));
    const blocks = (px, pz) => sight.some(([x0, z0, x1, z1]) => { const dx = x1 - x0, dz = z1 - z0, L2 = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((px - x0) * dx + (pz - z0) * dz) / L2)); return (px - x0 - dx * t) ** 2 + (pz - z0 - dz * t) ** 2 < 49; });
    for (let k = 0; k < target * 3 && items.length < target; k++) {
      const i = Math.floor(Math.random() * N); const side = Math.random() < 0.5 ? 1 : -1;
      // two thirds form a wall of trees close to the road, the rest the forest behind
      const off = side * (W / 2 + 7 + (Math.random() < 0.66 ? Math.random() * 30 : Math.random() ** 1.5 * 140));
      const nx = -Math.sin(this.geo.hdg[i]), nz = Math.cos(this.geo.hdg[i]);
      const cx = gx[i] + nx * off, cz = gz[i] + nz * off;
      const kind = pick(); const opts = pool.filter((m) => m.kind === kind); if (!opts.length) continue;
      for (let q = 0; q < 3 && items.length < target; q++) {
        const px = cx + (Math.random() - 0.5) * 16, pz = cz + (Math.random() - 0.5) * 16;
        const [d2] = near(px, pz); if (d2 < (W / 2 + 5.5) ** 2 || blocks(px, pz)) continue;
        const meta = opts[Math.floor(Math.random() * opts.length)];
        const h = { conifer: 11 + Math.random() * 10, broad: 6 + Math.random() * 6, bush: 1.8 + Math.random() * 2, desert: 4 + Math.random() * 3 }[meta.kind];
        const v = (0.82 + Math.random() * 0.26) * (meta.kind === 'bush' ? 1.25 : 1);
        items.push({ x: px, y: this.groundH(px, pz) - 0.2, z: pz, h, meta, rot: Math.random() * 6.283, tint: surf === 'snow' ? [v * 0.9, v * 0.95, v] : [v * (0.95 + Math.random() * 0.1), v, v * 0.9] });
      }
    }
    if (items.length) { this.scene.add(makeTreeShadows(items)); this.forest = makeForest(items); this.forest.material.uniforms.sunDir.value = this.sunDir; this.scene.add(this.forest); }
    this.buildRallyDressing(near, this.groundH, surf);
    buildRallyExtras(this, near, surf, RL);
    // start & finish arches
    for (const [i, col] of [[2, 0x22d37a], [N - 3, 0xffffff]]) {
      const g = new THREE.Group(); const m = new THREE.MeshStandardMaterial({ color: col, roughness: 0.5 });
      for (const zz of [W / 2 + 1, -W / 2 - 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.4, 5, 0.4), m); p.position.set(0, 2.5, zz); g.add(p); }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, W + 2.8), m); beam.position.y = 5; g.add(beam);
      this.placeAt(g, i, 0, this.geo.h ? this.geo.h[i] : 0); this.scene.add(g);
    }
    if (this.scene.fog) { this.scene.fog = new THREE.FogExp2(this.scene.fog.color, 0.0007); this.fogDensity = this.scene.fog.density; }
  }

  // rally stage dressing: spectator groups behind red/white tape on the outside of corners and
  // on crests, sponsor banners and flags, start / finish arches with sponsor boards
  buildRallyDressing(near, terrH, surf) {
    const N = this.geo.N, W = this.TW, g = this.geo;
    const spots = [];
    const minGap = Math.round(260 / g.ds);
    let last = -minGap;
    // candidates: tight corners (outside, where the action is) and crests, plus the start
    const cand = [];
    for (let i = 20; i < N - 20; i += 3) { const k = Math.abs(g.k[i]); if (k > 1 / 70) cand.push({ i, side: g.k[i] > 0 ? -1 : 1, w: k * 60 }); }
    for (const c of g.crests || []) cand.push({ i: c + 4, side: Math.random() < 0.5 ? 1 : -1, w: 2 });
    cand.sort((a, b) => b.w - a.w);
    for (const c of cand) { if (spots.some((s) => Math.abs(s.i - c.i) < minGap)) continue; spots.push(c); if (spots.length > (this.low ? 10 : 22)) break; }
    spots.push({ i: 12, side: 1, w: 1, start: true }, { i: 12, side: -1, w: 1, start: true });
    this.rallySpots = spots;
    void last;
    const people = [], tapes = [], posts = [], banners = [];
    const d = new THREE.Object3D(); const col = new THREE.Color();
    const jackets = ['#d8141b', '#1e41ff', '#f5c400', '#111418', '#2d6a3e', '#e8e8e8', '#ff7a00', '#5a2d82', '#0b7a8a', '#7a1f1f', '#3a4250'];
    for (const sp of spots) {
      const span = sp.start ? 10 : 9 + Math.floor(Math.random() * 8);
      const off0 = W / 2 + (sp.start ? 5 : 6.5 + Math.random() * 3);
      // tape line on posts, following the road at a fixed offset
      const tp = [];
      for (let q = -span; q <= span; q++) {
        const i = Math.max(0, Math.min(N - 1, sp.i + q));
        const nx = -Math.sin(g.hdg[i]), nz = Math.cos(g.hdg[i]);
        const px = g.x[i] + nx * sp.side * off0, pz = g.y[i] + nz * sp.side * off0, py = terrH(px, pz);
        tp.push([px, py, pz]);
        if (q % 2 === 0) { d.position.set(px, py, pz); d.rotation.set(0, 0, 0); d.scale.set(1, 1, 1); d.updateMatrix(); posts.push(d.matrix.clone()); }
      }
      tapes.push(tp);
      // spectators: a loose crowd behind the tape, some on higher ground further back
      const n = sp.start ? 26 : 14 + Math.floor(Math.random() * 26);
      for (let k = 0; k < n; k++) {
        const q = (Math.random() * 2 - 1) * span * 0.9;
        const i = Math.max(0, Math.min(N - 1, Math.round(sp.i + q)));
        const nx = -Math.sin(g.hdg[i]), nz = Math.cos(g.hdg[i]);
        const o = off0 + 1.2 + Math.random() ** 1.6 * 9;
        const px = g.x[i] + nx * sp.side * o + (Math.random() - 0.5) * 1.5, pz = g.y[i] + nz * sp.side * o + (Math.random() - 0.5) * 1.5;
        const [d2] = near(px, pz); if (d2 < (off0 + 0.8) ** 2) continue;
        d.position.set(px, terrH(px, pz) - 0.05, pz);
        d.rotation.set(0, Math.atan2(g.x[i] - px, g.y[i] - pz) + (Math.random() - 0.5) * 0.8, 0);
        const s = 0.92 + Math.random() * 0.16; d.scale.set(s, s, s); d.updateMatrix();
        people.push([d.matrix.clone(), jackets[Math.floor(Math.random() * jackets.length)]]);
      }
      // sponsor banner on two poles behind the crowd, flags waved by fans
      if (Math.random() < 0.8 || sp.start) {
        const i = Math.max(0, Math.min(N - 1, sp.i + Math.round((Math.random() - 0.5) * span)));
        const nx = -Math.sin(g.hdg[i]), nz = Math.cos(g.hdg[i]);
        const o = off0 + 11 + Math.random() * 3;
        const px = g.x[i] + nx * sp.side * o, pz = g.y[i] + nz * sp.side * o;
        d.position.set(px, terrH(px, pz), pz); d.rotation.set(0, -g.hdg[i] + (sp.side > 0 ? Math.PI : 0), 0); d.scale.set(1, 1, 1); d.updateMatrix();
        banners.push(d.matrix.clone());
      }
    }
    // people (simple low-poly spectators)
    if (people.length) {
      const pm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
      pm.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <color_vertex>', `vColor = vec3(1.0);
        #ifdef USE_COLOR
          vColor = color.rgb;
        #endif
        #ifdef USE_INSTANCING_COLOR
          if (color.r > 0.99 && color.g > 0.99 && color.b > 0.99) vColor = instanceColor.rgb;
        #endif`); };
      pm.customProgramCacheKey = () => 'spect';
      const im = new THREE.InstancedMesh(personGeo('spect'), pm, people.length);
      people.forEach(([m, c], k) => { im.setMatrixAt(k, m); im.setColorAt(k, col.set(c)); });
      im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); this.scene.add(im);
    }
    // tape posts + tape ribbons (two bands)
    if (posts.length) {
      const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.025, 0.025, 1.1, 5).translate(0, 0.55, 0), new THREE.MeshStandardMaterial({ color: 0xd9dde2, roughness: 0.6 }), posts.length);
      posts.forEach((m, k) => im.setMatrixAt(k, m)); im.computeBoundingSphere(); this.scene.add(im);
      const tex = canvasTex(64, 8, (c, w, h) => { for (let k = 0; k < 8; k++) { c.fillStyle = k % 2 ? '#f4f4f4' : '#d8141b'; c.beginPath(); c.moveTo(k * 8, 0); c.lineTo(k * 8 + 8, 0); c.lineTo(k * 8 + 4, h); c.lineTo(k * 8 - 4, h); c.fill(); } });
      const pos = [], uv = [], idx = [];
      for (const tp of tapes) for (const yb of [0.95, 0.55]) {
        let v = 0; const b0 = pos.length / 3;
        tp.forEach(([x, y, z], k) => {
          if (k) v += Math.hypot(x - tp[k - 1][0], z - tp[k - 1][2]) / 0.8;
          const sag = 0.05 * Math.abs(Math.sin(k * Math.PI / 2));
          pos.push(x, y + yb - sag, z, x, y + yb - sag + 0.07, z); uv.push(v, 0, v, 1);
          if (k < tp.length - 1) { const a = b0 + k * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
        });
      }
      const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); tg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); tg.setIndex(idx); tg.computeVertexNormals();
      const tm = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.5 })); this.scene.add(tm);
    }
    // banners: 4 m sponsor cloth between two poles
    if (banners.length) {
      const M = this.standMats(new THREE.MeshStandardMaterial());
      const pole = new THREE.CylinderGeometry(0.05, 0.05, 3.2, 6).translate(0, 1.6, 0);
      const pg = mergeGeometries([pole.clone().translate(-2.1, 0, 0), pole.clone().translate(2.1, 0, 0)].map((x) => (x.index ? x.toNonIndexed() : x)));
      const pi = new THREE.InstancedMesh(pg, M.steel, banners.length); banners.forEach((m, k) => pi.setMatrixAt(k, m)); pi.computeBoundingSphere(); this.scene.add(pi);
      // each banner shows one brand of the stand atlas (u range picked per instance by matrix hash in a tiny shader)
      const bg = new THREE.PlaneGeometry(4.1, 1.1).translate(0, 2.55, 0);
      const bm = M.ad.clone(); bm.side = THREE.DoubleSide;
      bm.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
        #ifdef USE_INSTANCING
          float bi = floor(fract(sin(instanceMatrix[3].x * 12.9898 + instanceMatrix[3].z * 78.233) * 43758.5453) * ${M.nBrands}.0);
          vMapUv = vec2((bi + uv.x) / ${M.nBrands}.0, uv.y);
          #ifdef USE_EMISSIVEMAP
            vEmissiveMapUv = vMapUv;
          #endif
        #endif`); };
      bm.customProgramCacheKey = () => 'banner';
      const bi = new THREE.InstancedMesh(bg, bm, banners.length); banners.forEach((m, k) => bi.setMatrixAt(k, m)); bi.castShadow = true; bi.computeBoundingSphere(); this.scene.add(bi);
    }
    // obstacles for the camera / tree placement
    this.obstacles ||= [];
  }

  buildRacingLine() {
    if (!this.line) this.computeLine();
    const N = this.geo.N; const sm = this.line;
    this.buildRubber(N, sm);
  }

  computeLine() {
    const { N, k } = this.geo; const half = this.TW / 2 - 1.6;
    const inside = new Float64Array(N);
    for (let i = 0; i < N; i++) inside[i] = Math.max(-1, Math.min(1, k[i] * 160));
    const at = (i) => this.open ? inside[Math.max(0, Math.min(N - 1, i))] : inside[(i + N) % N];
    const line = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      // inside at the apex, outside on entry and exit
      let v = at(i) - 0.55 * at(i - 24) - 0.55 * at(i + 24);
      line[i] = Math.max(-1, Math.min(1, v)) * half;
    }
    const sm = new Float64Array(N);
    for (let i = 0; i < N; i++) { let a = 0, n = 0; for (let q = -8; q <= 8; q++) { const j = this.open ? Math.max(0, Math.min(N - 1, i + q)) : (i + q + N) % N; a += line[j]; n++; } sm[i] = a / n; }
    this.line = sm;
  }

  buildRubber(N, sm) {
    if (this.rubberMat && !this.open) {
      const { x, y, hdg } = this.geo; const pos = [], idx = [], uv = [];
      for (let i = 0; i <= N; i++) { const j = i % N; const nx = -Math.sin(hdg[j]), nz = Math.cos(hdg[j]); const o = sm[j]; const hr = this.geo.h ? this.geo.h[j] : 0; pos.push(x[j] + nx * (o - 1.6), 0.04 + hr, y[j] + nz * (o - 1.6), x[j] + nx * (o + 1.6), 0.04 + hr, y[j] + nz * (o + 1.6)); uv.push(0, i * 0.12, 1, i * 0.12); if (i < N) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); } }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
      const rm = new THREE.Mesh(g, this.rubberMat); rm.receiveShadow = true; this.scene.add(rm);
      // braking marks: dark, slightly wavy lock-up streaks in the braking zones of slow corners
      const skTex = canvasTex(128, 512, (c, w, h) => {
        c.clearRect(0, 0, w, h);
        for (let k = 0; k < 14; k++) {
          const u0 = 0.12 + Math.random() * 0.76, v0 = Math.random() * 0.5, v1 = v0 + 0.25 + Math.random() * 0.5; const amp = (Math.random() - 0.5) * 0.06; const a = 0.12 + Math.random() * 0.22;
          const gr = c.createLinearGradient(0, v0 * h, 0, Math.min(1, v1) * h); gr.addColorStop(0, 'rgba(6,6,6,0)'); gr.addColorStop(0.25, `rgba(6,6,6,${a})`); gr.addColorStop(0.8, `rgba(6,6,6,${a})`); gr.addColorStop(1, 'rgba(6,6,6,0)');
          c.strokeStyle = gr; c.lineWidth = 3 + Math.random() * 4; c.beginPath();
          for (let t = 0; t <= 20; t++) { const v = v0 + (Math.min(1, v1) - v0) * t / 20; const u = u0 + Math.sin(t * 0.5 + k) * amp; t ? c.lineTo(u * w, v * h) : c.moveTo(u * w, v * h); }
          c.stroke();
        }
      });
      skTex.wrapT = THREE.ClampToEdgeWrapping;
      const sp = [], si = [], su = [];
      for (const cn of this.geo.corners) {
        if (cn.r > 180) continue;
        const L = Math.round(Math.min(36, Math.max(14, 10 + cn.r / 6))), i0 = cn.i - L - 4;
        const base = sp.length / 3;
        for (let q = 0; q <= L; q++) {
          const j = ((i0 + q) % N + N) % N; const nx = -Math.sin(hdg[j]), nz = Math.cos(hdg[j]); const o = sm[j]; const hr = this.geo.h ? this.geo.h[j] : 0;
          sp.push(x[j] + nx * (o - 2.4), 0.045 + hr, y[j] + nz * (o - 2.4), x[j] + nx * (o + 2.4), 0.045 + hr, y[j] + nz * (o + 2.4)); su.push(0, q / L, 1, q / L);
          if (q < L) { const k = base + q * 2; si.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
        }
      }
      if (si.length) {
        const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)); sg.setAttribute('uv', new THREE.Float32BufferAttribute(su, 2)); sg.setIndex(si); sg.computeVertexNormals();
        const skm = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ map: skTex, roughness: 0.5, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })); skm.receiveShadow = true; this.scene.add(skm);
      }
    }
  }

  // true if (px,pz) is at least r metres from every track sample not near index `near`
  clearOfTrack(px, pz, r, near = null) {
    const N = this.geo.N; const r2 = r * r;
    for (let j = 0; j < N; j += 2) {
      const dx = this.geo.x[j] - px, dz = this.geo.y[j] - pz; if (dx * dx + dz * dz < r2) return false;
    }
    return true;
  }

  // vertical strip following the barrier line on one side between heights y0..y1 (relative to road)
  barrierStrip(side, y0, y1, mat, { step = 2, vRepeat = 20, inset = 0, filter = null } = {}) {
    const N = this.geo.N; const pos = [], uv = [], idx = [];
    let v = 0; const count = Math.ceil(N / step) + 1; let prevOk = false;
    for (let n = 0; n < count; n++) {
      const i = (n * step) % N; const nx = -Math.sin(this.geo.hdg[i]), nz = Math.cos(this.geo.hdg[i]);
      const off = side * (this.wallOff(i, side) + inset);
      const px = this.geo.x[i] + nx * off, pz = this.geo.y[i] + nz * off;
      const hw = this.geo.h ? this.geo.h[i] : 0;
      pos.push(px, hw + y0 - (y0 === 0 && hw > 0.3 ? 1.2 : 0), pz, px, hw + y1, pz); uv.push(v, 0, v, 1); v += this.geo.ds * step / vRepeat;
      const ok = (!filter || filter(i)) && !(side > 0 && this.inPitZone?.(i, -1));
      if (n > 0 && ok && prevOk) { const k = (n - 1) * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
      prevOk = ok;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; this.scene.add(m); return m;
  }

  // realistic barriers: steel guard-rails, Tecpro blocks in braking zones, concrete walls on
  // street circuits, and catch-fences with posts everywhere
  buildBarriers(street, paintedMat) {
    const N = this.geo.N;
    const steel = new THREE.MeshStandardMaterial({ color: 0xb9c0c7, metalness: 0.92, roughness: 0.32, side: THREE.DoubleSide });
    const fenceTex = canvasTex(128, 128, (c, w, h) => { c.clearRect(0, 0, w, h); c.strokeStyle = 'rgba(205,210,214,0.95)'; c.lineWidth = 3; for (let k = -w; k < w * 2; k += 32) { c.beginPath(); c.moveTo(k, 0); c.lineTo(k + h, h); c.stroke(); c.beginPath(); c.moveTo(k, h); c.lineTo(k + h, 0); c.stroke(); } }, [1, 1]);
    fenceTex.wrapS = fenceTex.wrapT = THREE.RepeatWrapping; fenceTex.repeat.set(1, 2);
    const fence = new THREE.MeshStandardMaterial({ map: fenceTex, alphaTest: 0.35, transparent: false, metalness: 0.6, roughness: 0.5, side: THREE.DoubleSide });
    // Tecpro zones: outside of corners
    const tec = new Uint8Array(N);
    for (const cn of this.geo.corners) { if (cn.r > 260) continue; const span = Math.min(36, Math.max(12, Math.round(cn.r / 6))); for (let q = -Math.round(span * 0.8); q <= span; q++) tec[(cn.i + q + N) % N] = cn.dir > 0 ? 2 : 1; }
    const tecMatA = new THREE.MeshStandardMaterial({ map: canvasTex(256, 64, (c, w, h) => { const cols = ['#1f4fd1', '#d8262d']; for (let k = 0; k < 4; k++) { c.fillStyle = cols[k % 2]; c.fillRect(k * w / 4, 0, w / 4, h); c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(k * w / 4, 0, 3, h); } c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(0, h - 6, w, 6); }), roughness: 0.75 });
    for (const side of [1, -1]) {
      const tag = side > 0 ? 1 : 2; // a left-hand corner (dir>0) has its outside on the right (-)
      if (street > 0.7) {
        // concrete wall with painted band
        const conc = this.low ? new THREE.MeshStandardMaterial({ color: 0xbfbfbf, roughness: 0.9 }) : pbr('concrete_floor_worn_001', { color: 0xd0d0d0, repeat: [1, 1] });
        this.barrierStrip(side, 0, 0.75, conc, { vRepeat: 4 });
        this.barrierStrip(side, 0.75, 1.15, paintedMat, { vRepeat: 20 });
      } else {
        const isTec = (i) => tec[i] === (side > 0 ? 1 : 2);
        // guard-rail: two steel beams on posts
        this.barrierStrip(side, 0.42, 0.72, steel, { filter: (i) => !isTec(i), inset: 0.05 });
        this.barrierStrip(side, 0.82, 1.08, steel, { filter: (i) => !isTec(i), inset: 0.05 });
        // Tecpro blocks where cars arrive at speed
        this.barrierStrip(side, 0, 1.2, tecMatA, { filter: isTec, vRepeat: 8, inset: -0.4 });
      }
      // catch fence
      this.barrierStrip(side, 1.15, 4.4, fence, { vRepeat: 1.6, inset: 0.6 });
    }
    // posts (instanced): guard-rail posts every 5 m, fence posts every 10 m
    const postGeo = new THREE.CylinderGeometry(0.06, 0.06, 1, 6).translate(0, 0.5, 0);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x8a9096, metalness: 0.8, roughness: 0.45 });
    const posts = [];
    for (const side of [1, -1]) for (let i = 0; i < N; i++) {
      if (side > 0 && this.inPitZone?.(i, -1)) continue;
      const nx = -Math.sin(this.geo.hdg[i]), nz = Math.cos(this.geo.hdg[i]); const hw = this.geo.h ? this.geo.h[i] : 0;
      if (i % 2 === 0) { const o = side * (this.wallOff(i, side) + 0.6); posts.push([this.geo.x[i] + nx * o, hw, this.geo.y[i] + nz * o, 4.6]); }
      if (street <= 0.7 && tec[i] !== (side > 0 ? 1 : 2)) { const o = side * (this.wallOff(i, side) + 0.2); posts.push([this.geo.x[i] + nx * o, hw, this.geo.y[i] + nz * o, 1.1]); }
    }
    const inst = new THREE.InstancedMesh(postGeo, postMat, posts.length); const d = new THREE.Object3D();
    posts.forEach(([x, y, z, h], k) => { d.position.set(x, y, z); d.scale.set(1, h, 1); d.updateMatrix(); inst.setMatrixAt(k, d.matrix); });
    inst.castShadow = true; this.scene.add(inst);
  }

  // distant rolling hills around the circuit (replaces the flat horizon), textured like the
  // ground so the base blends seamlessly, darker forested slopes and rocky tops further up
  buildTerrain(street) {
    const [x0, y0, x1, y1] = this.geo.bbox; const cx = (x0 + x1) / 2, cz = (y0 + y1) / 2;
    const R0 = Math.hypot(x1 - x0, y1 - y0) / 2 + 380, R1 = 5900;
    const ph = Array.from({ length: 6 }, () => Math.random() * 6.283);
    buildCoast(this, this.biome, street);
    const amp = (street > 0.7 ? 1.25 : 1) * this.biome.hill, rockH = this.biome.rock ? 95 : 190;
    const hillH = (x, z) => {
      const r = Math.hypot(x - cx, z - cz); if (r < R0) return 0;
      const a = Math.atan2(z - cz, x - cx);
      const t = Math.min(1, (r - R0) / 900); const e = t * t * (3 - 2 * t);
      const n = 0.55 + 0.45 * Math.sin(a * 2 + ph[0]) * Math.sin(a * 5 + ph[1]) + 0.25 * Math.sin(a * 11 + ph[2] + r * 0.002) + 0.12 * Math.sin(a * 23 + ph[3]);
      const far = 1 + Math.min(1.6, (r - R0) / 1800);
      return (e * Math.max(0.15, n) * 120 * far * amp + e * 10 * Math.sin(r * 0.006 + ph[4])) * (this.coastK ? this.coastK(x, z) : 1);
    };
    this.hillH = hillH; this.hillR0 = R0; this.hillC = [cx, cz];
    const A = this.low ? 96 : 180, J = this.low ? 14 : 26;
    const pos = [], col = [], uv = [], idx = [];
    const c = new THREE.Color();
    const forest = new THREE.Color(this.biome.hillCol), rock = new THREE.Color(this.biome.rockCol);
    for (let i = 0; i <= A; i++) {
      const a = (i / A) * Math.PI * 2;
      for (let j = 0; j <= J; j++) {
        const r = R0 - 20 + (R1 - R0 + 20) * (j / J) ** 1.7;
        const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r; const h = hillH(x, z);
        pos.push(x, h - 0.3, z);
        uv.push((x - (cx - 6000)) / 12000 * 1400, (-(z - cz) + 6000) / 12000 * 1400);
        const f = Math.min(1, h / 18) * Math.min(1, Math.max(0, 0.55 + 0.35 * Math.sin(a * 13 + r * 0.004 + ph[5]) + 0.25 * Math.sin(a * 31 - r * 0.009)));
        c.setRGB(1, 1, 1).lerp(forest, Math.min(0.95, f * (0.9 + 0.5 * Math.min(1.2, this.biome.dens)))).lerp(rock, Math.max(0, Math.min(1, (h - rockH) / 140)) * (this.biome.rock ? 0.95 : 0.7));
        col.push(c.r, c.g, c.b);
        if (i < A && j < J) { const k = i * (J + 1) + j, k2 = k + J + 1; idx.push(k, k2, k + 1, k + 1, k2, k2 + 1); }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const mat = this.low ? new THREE.MeshStandardMaterial({ color: street > 0.7 ? 0x5d6a52 : 0x3f7a34, vertexColors: true, roughness: 1 })
      : detailPatch(pbr(street > 0.7 ? 'aerial_grass_rock' : 'aerial_grass_rock', { repeat: [1, 1], color: street > 0.7 ? 0x7f9a62 : this.groundCol }), { macro: 0.25, macroScale: 0.004, tint: 0xd8c27a, tintAmt: 0.3, key: 'hills' });
    mat.vertexColors = true;
    const hills = new THREE.Mesh(g, mat); hills.receiveShadow = false; this.scene.add(hills);
    if (street <= 0.7) buildMidTerrain(this, mat, this.biome, (x, z) => [(x - (cx - 6000)) / 12000 * 1400, (-(z - cz) + 6000) / 12000 * 1400]);
    // exponential haze: crisp near the track, blue-grey aerial perspective on the hills
    if (this.scene.fog) { this.scene.fog = new THREE.FogExp2(this.scene.fog.color, this.night ? 0.0009 : 0.00025 * this.biome.haze); this.fogDensity = this.scene.fog.density; }
  }

  // city skyline behind street circuits (and a distant downtown for park circuits): glass and
  // concrete towers in a few clusters, curtain-wall shader (floors, mullions, per-tower glass
  // tint) with random lit offices at night. One instanced mesh.
  buildSkyline(street) {
    if (!this.hillC || street < 0.4) return;
    const [cx, cz] = this.hillC, R0 = this.hillR0, full = street > 0.7;
    const n = Math.round((full ? 190 : 70) * (this.low ? 0.45 : 1));
    const clusters = Array.from({ length: full ? 3 : 1 }, (_, k) => ({ a: Math.random() * 6.283 + k * 2.1, w: full ? 0.5 + Math.random() * 0.4 : 0.32, peak: full ? 150 + Math.random() * 120 : 190 }));
    const items = []; const d = new THREE.Object3D(); const col = new THREE.Color();
    const tints = [0x9fb6cc, 0x7f99b3, 0x8fb0b0, 0xa9a49a, 0xb7bcc2, 0x6f8499, 0xc2b49a];
    for (let k = 0, guard = 0; k < n && guard < n * 8; guard++) {
      const c = clusters[guard % clusters.length];
      const da = (Math.random() + Math.random() + Math.random() - 1.5) * c.w;
      const a = c.a + da;
      const r = (full ? R0 - 260 : R0 + 300) + Math.pow(Math.random(), 0.8) * (full ? 1100 : 900);
      const px = cx + Math.cos(a) * r, pz = cz + Math.sin(a) * r;
      const wd = 22 + Math.random() * 30, dp = 18 + Math.random() * 26;
      if (this.seaMask?.(px, pz) || !this.clearOfTrack(px, pz, this.TW / 2 + 40 + wd)) continue;
      if ((this.obstacles || []).some((o) => (o.x - px) ** 2 + (o.z - pz) ** 2 < (o.r + wd) ** 2)) continue;
      if (items.some((it) => (it.x - px) ** 2 + (it.z - pz) ** 2 < ((it.w + wd) * 0.62) ** 2)) continue;
      const core = Math.exp(-((da / c.w) ** 2) * 2.2);
      const h = 35 + c.peak * core * (0.35 + Math.random() * 0.75) + Math.random() * 30;
      items.push({ x: px, z: pz, w: wd, dp, h, y: this.hillH ? this.hillH(px, pz) - 3 : -3, rot: Math.random() * 6.283, t: tints[Math.floor(Math.random() * tints.length)] });
      k++;
      // a stepped crown / podium on some towers
      if (h > 110 && Math.random() < 0.5) items.push({ x: px, z: pz, w: wd * 0.62, dp: dp * 0.62, h: h + 12 + Math.random() * 25, y: this.hillH ? this.hillH(px, pz) - 3 : -3, rot: items[items.length - 1].rot, t: items[items.length - 1].t });
    }
    // street circuits: low and mid-rise blocks fill the city between the circuit and the towers
    if (full) {
      const [bx0, bz0, bx1, bz1] = this.geo.bbox; const rIn = Math.hypot(bx1 - bx0, bz1 - bz0) * 0.2;
      const nf = Math.round(260 * (this.low ? 0.4 : 1));
      for (let k = 0, guard = 0; k < nf && guard < nf * 6; guard++) {
        const a = Math.random() * 6.283, r = rIn + Math.random() * (R0 + 200 - rIn);
        const px = cx + Math.cos(a) * r, pz = cz + Math.sin(a) * r;
        const wd = 16 + Math.random() * 22, dp = 14 + Math.random() * 20;
        if (this.seaMask?.(px, pz) || !this.clearOfTrack(px, pz, this.TW / 2 + 34 + wd * 0.7)) continue;
        if ((this.obstacles || []).some((o) => (o.x - px) ** 2 + (o.z - pz) ** 2 < (o.r + wd * 0.7) ** 2)) continue;
        if (items.some((it) => (it.x - px) ** 2 + (it.z - pz) ** 2 < ((it.w + wd) * 0.6) ** 2)) continue;
        items.push({ x: px, z: pz, w: wd, dp, h: 12 + Math.random() ** 2 * 40, y: (this.hillH ? this.hillH(px, pz) : 0) - 0.5, rot: Math.random() * 6.283, t: [0xd8cfc0, 0xc9c2b6, 0xb8bec6, 0xe0d6c4, 0x9fb6cc][Math.floor(Math.random() * 5)] });
        k++;
      }
    }
    if (!items.length) return;
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.55, roughness: 0.22, envMapIntensity: 1.2, ...(this.night ? { emissive: 0xffd9a0, emissiveIntensity: 2.1 } : {}) });
    const nightK = { value: this.night ? 1 : 0 }; this._skylineNight = nightK;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uNight = nightK;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec4 vTw;')
        .replace('#include <uv_vertex>', `#include <uv_vertex>
          vec3 tsc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
          vTw = vec4(uv.x * (abs(normal.x) > 0.5 ? tsc.z : tsc.x), position.y * tsc.y, normal.y, instanceMatrix[3].x * 0.011 + instanceMatrix[3].z * 0.017);`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec4 vTw; uniform float uNight;\nfloat th(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }')
        .replace('#include <map_fragment>', `#include <map_fragment>
          float roofT = step(0.5, vTw.z);
          float fl = fract(vTw.y / 3.8), cl = fract(vTw.x / 1.6);
          float spandrel = 1.0 - step(0.16, fl) * step(fl, 0.86);
          float mull = 1.0 - step(0.07, cl) * step(cl, 0.93);
          float win = (1.0 - spandrel) * (1.0 - mull) * (1.0 - roofT);
          float var = th(vec2(floor(vTw.x / 1.6), floor(vTw.y / 3.8)) + vTw.w);
          diffuseColor.rgb *= mix(vec3(0.42), vec3(0.55 + 0.25 * var), win);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.22), roofT);
          float lit = step(0.7, th(vec2(floor(vTw.x / 6.4) + vTw.w * 13.0, floor(vTw.y / 3.8)))) * win;`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.85, 0.12, win);')
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(0.05, 0.7, win);')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= lit * uNight * (0.6 + 0.8 * var);');
    };
    mat.customProgramCacheKey = () => 'skyline' + (this.night ? 'n' : '');
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), mat, items.length);
    items.forEach((it, k) => { d.position.set(it.x, it.y, it.z); d.rotation.set(0, it.rot, 0); d.scale.set(it.w, it.h, it.dp); d.updateMatrix(); im.setMatrixAt(k, d.matrix); im.setColorAt(k, col.setHex(it.t)); });
    im.castShadow = false; im.receiveShadow = false; im.computeBoundingSphere();
    this.scene.add(im); this.skyline = im; this.towers = items;
    // aircraft warning lights on the tallest towers at night
    if (this.night) {
      const tops = items.filter((it) => it.h > 120);
      if (tops.length) {
        const lm = new THREE.InstancedMesh(new THREE.SphereGeometry(1.4, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff2a1a, toneMapped: false }), tops.length);
        tops.forEach((it, k) => { d.position.set(it.x, it.y + it.h + 1.5, it.z); d.rotation.set(0, 0, 0); d.scale.set(1, 1, 1); d.updateMatrix(); lm.setMatrixAt(k, d.matrix); });
        lm.computeBoundingSphere(); this.scene.add(lm);
      }
    }
  }

  // photoreal vegetation (Poly Haven CC0 trees rendered into impostors)
  buildForest(street) {
    const N = this.geo.N, W = this.TW;
    const cid = this.geo.cid;
    const desert = ['bhr', 'qat', 'abu', 'ksa'].includes(cid);
    const B = this.biome, pool = vegOfKind(['desert', 'bush', 'broad', 'conifer']);
    const byKind = (k) => pool.filter((m) => m.kind === k);
    const weights = B.trees;
    const pickKind = () => { let r = Math.random(); for (const [k, w] of weights) { if ((r -= w) <= 0) return k; } return weights[0][0]; };
    const target = Math.round((street > 0.7 ? 260 : 4200 * B.dens) * (this.low ? 0.35 : 1));
    const items = [];
    // keep a clear line of sight between every TV camera and the track
    const N0 = this.geo.N; const sight = (this.tvCams || []).flatMap((c) => [0, -15, -30].map((d) => { const j = (c.i + d + N0) % N0; return { x0: c.pos.x, z0: c.pos.z, x1: this.geo.x[j], z1: this.geo.y[j] }; }));
    const blocksCam = (px, pz) => sight.some((v) => { const dx = v.x1 - v.x0, dz = v.z1 - v.z0; const L2 = dx * dx + dz * dz || 1; const t = Math.max(-0.4, Math.min(1, ((px - v.x0) * dx + (pz - v.z0) * dz) / L2)); const qx = v.x0 + dx * t, qz = v.z0 + dz * t; return (px - qx) ** 2 + (pz - qz) ** 2 < 26 * 26; });
    const ok = (px, pz, r) => !this.seaMask?.(px, pz) && this.clearOfTrack(px, pz, W / 2 + 7 + r) && !blocksCam(px, pz) && !this.obstacles.some((o) => (o.x - px) ** 2 + (o.z - pz) ** 2 < (o.r + r) ** 2);
    let guard = 0;
    while (items.length < target && guard++ < target * 6) {
      const i = Math.floor(Math.random() * N); const side = Math.random() < 0.5 ? 1 : -1;
      const nx = -Math.sin(this.geo.hdg[i]), nz = Math.cos(this.geo.hdg[i]);
      const base = (this.wallOff ? this.wallOff(i, side) : W / 2 + 10) + 6 + Math.random() ** 1.6 * (street > 0.7 ? 30 : 260);
      const cx = this.geo.x[i] + nx * side * base, cz = this.geo.y[i] + nz * side * base;
      const kind = pickKind(); const n = street > 0.7 ? 1 : 3 + Math.floor(Math.random() * 10);
      for (let q = 0; q < n && items.length < target; q++) {
        const px = cx + (Math.random() - 0.5) * 34, pz = cz + (Math.random() - 0.5) * 34;
        const opts = byKind(Math.random() < 0.85 ? kind : pickKind()); if (!opts.length) continue;
        const meta = opts[Math.floor(Math.random() * opts.length)];
        const h = { conifer: 10 + Math.random() * 9, broad: 5.5 + Math.random() * 5, bush: 1.6 + Math.random() * 1.6, desert: 4 + Math.random() * 3 }[meta.kind];
        if (!ok(px, pz, meta.kind === 'bush' ? 1 : 3)) continue;
        const v = (0.86 + Math.random() * 0.24) * (meta.kind === 'bush' ? 1.3 : 1);
        items.push({ x: px, y: this.envH ? this.envH(px, pz) - 0.35 : 0, z: pz, h, meta, rot: Math.random() * 6.283, tint: [v * (0.95 + Math.random() * 0.1), v, v * (0.9 + Math.random() * 0.1)] });
        if (meta.kind !== 'bush') this.obstacles.push({ x: px, z: pz, r: 3, h: h * 0.9 });
      }
    }
    // forest on the surrounding hills
    if (this.hillH) {
      const [cx, cz] = this.hillC; const nH = Math.round((street > 0.7 ? 900 : 4600 * Math.min(1.4, B.dens + (desert ? 0 : 0.2))) * (this.low ? 0.3 : 1));
      const conif = B.trees.filter(([k]) => k !== 'bush').flatMap(([k]) => byKind(k));
      for (let k = 0, guard2 = 0; k < nH && conif.length && guard2 < nH * 3; guard2++) {
        const a = Math.random() * 6.283; const r = this.hillR0 + 30 + Math.random() ** 1.8 * 900;
        const cl = 0.5 + 0.5 * Math.sin(a * 9 + r * 0.004) * Math.cos(a * 4 - r * 0.002); if (Math.random() > cl * cl * cl) continue;
        const px = cx + Math.cos(a) * r, pz = cz + Math.sin(a) * r;
        if (this.seaMask?.(px, pz) || (this.coastK && this.coastK(px, pz) < 0.4)) continue;
        const meta = conif[Math.floor(Math.random() * conif.length)];
        const h = (meta.kind === 'conifer' ? 14 : meta.kind === 'desert' ? 6 : 9) * (0.8 + Math.random() * 0.6);
        const v = 0.8 + Math.random() * 0.25;
        items.push({ x: px, y: this.hillH(px, pz) - 0.5, z: pz, h, meta, rot: Math.random() * 6.283, tint: [v * 0.92, v, v * 0.9], far: true }); k++;
      }
    }
    if (!items.length) return;
    this.scene.add(makeTreeShadows(items.filter((it) => !it.far)));
    this.forest = makeForest(items); this.forest.material.uniforms.sunDir.value = this.sunDir;
    if (this.night) this.forest.material.uniforms.light.value = 0.42;
    this.scene.add(this.forest);
  }

  // grandstand materials (shared by every stand; the stands are merged into ~6 draw calls)
  standMats(crowdMat) {
    if (this._sm) return this._sm;
    const brands = ['APEX DYNASTY', 'PIRELLO', 'ROLEXA', 'DHX', 'PETRONIX', 'HEINEKAN 0.0', 'LAVAZZO', 'ARAMCORE'];
    const cols = [['#e10600', '#fff'], ['#ffd400', '#111'], ['#0b5d3b', '#e8c55a'], ['#ffd400', '#d40511'], ['#0a2a66', '#fff'], ['#0b7a3a', '#fff'], ['#111', '#fff'], ['#00594f', '#fff']];
    const ad = canvasTex(2048, 128, (c, w, h) => {
      const bw = w / brands.length;
      brands.forEach((b, k) => {
        const [bg, fg] = cols[k]; c.fillStyle = bg; c.fillRect(k * bw, 0, bw, h);
        c.fillStyle = 'rgba(255,255,255,0.1)'; c.fillRect(k * bw, 0, bw, h * 0.45);
        c.fillStyle = fg; let size = 78; c.font = `italic 900 ${size}px "Exo 2", sans-serif`;
        while (c.measureText(b).width > bw * 0.82 && size > 24) { size -= 4; c.font = `italic 900 ${size}px "Exo 2", sans-serif`; }
        c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(b, k * bw + bw / 2, h / 2 + 4);
        c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(k * bw, 0, 2, h);
      });
    });
    ad.wrapS = ad.wrapT = THREE.ClampToEdgeWrapping; ad.anisotropy = 8;
    const conc = this.low ? new THREE.MeshStandardMaterial({ color: 0xb9bcbf, roughness: 0.9 }) : pbr('concrete_floor_worn_001', { color: 0xd4d6d8, repeat: [0.22, 0.22], roughness: 0.95 });
    this._sm = {
      crowd: crowdMat, conc,
      steel: new THREE.MeshStandardMaterial({ color: 0x8e979f, roughness: 0.45, metalness: 0.6 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x3a3e45, roughness: 0.8, metalness: 0.2 }),
      roof: new THREE.MeshStandardMaterial({ color: 0xe6e8ea, roughness: 0.42, metalness: 0.35 }),
      ad: new THREE.MeshStandardMaterial({ map: ad, roughness: 0.5, emissive: 0xffffff, emissiveMap: ad, emissiveIntensity: this.night ? 0.5 : 0.06 }),
      back: this.standBackMat(),
      nBrands: brands.length,
    };
    return this._sm;
  }

  // back of the grandstands (what the TV cameras on the far side see): a 16 m wide tile, full
  // height — ribbed metal cladding with panel joints, a sponsor band under the roof line, a
  // ground floor of concourse openings, kiosks and turnstiles (lit at night), grime streaks
  standBackMat() {
    const brands = ['APEX DYNASTY', 'PIRELLO', 'ROLEXA', 'PETRONIX', 'LAVAZZO'];
    const tex = canvasTex(1024, 512, (c, w, h) => {
      const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#b9bec4'); g.addColorStop(1, '#9ea3a9'); c.fillStyle = g; c.fillRect(0, 0, w, h);
      // vertical ribs
      for (let x = 0; x < w; x += 8) { c.fillStyle = 'rgba(255,255,255,0.16)'; c.fillRect(x, 0, 2, h); c.fillStyle = 'rgba(0,0,0,0.13)'; c.fillRect(x + 4, 0, 2, h); }
      // panel joints
      c.fillStyle = 'rgba(40,44,50,0.45)'; for (let y = 60; y < h * 0.72; y += 86) c.fillRect(0, y, w, 3);
      for (let x = 0; x < w; x += 128) c.fillRect(x, 0, 3, h * 0.72);
      // sponsor band near the top
      const b = brands[Math.floor(Math.random() * brands.length)];
      c.fillStyle = '#16191e'; c.fillRect(0, 10, w, 46); c.fillStyle = '#e10600'; c.fillRect(0, 54, w, 4);
      c.fillStyle = '#ffffff'; c.font = 'italic 900 38px "Exo 2", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(b, w * 0.25, 34); c.fillText(b, w * 0.75, 34);
      // ground floor (lowest ~3.5 m): concrete plinth, dark openings, kiosk shutters with awnings
      const gy = h * 0.78;
      c.fillStyle = '#8c8f93'; c.fillRect(0, gy, w, h - gy); c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(0, gy, w, 4);
      for (let k = 0; k < 4; k++) {
        const x0 = k * 256;
        // concourse opening with stair glimpse
        c.fillStyle = '#1b1d21'; c.fillRect(x0 + 18, gy + 18, 70, h - gy - 18);
        c.fillStyle = 'rgba(255,214,150,0.35)'; c.fillRect(x0 + 24, gy + 24, 58, 10);
        c.fillStyle = 'rgba(255,255,255,0.08)'; for (let s = 0; s < 6; s++) c.fillRect(x0 + 22, gy + 40 + s * 12, 62, 2);
        // kiosk: coloured awning, lit counter, menu board
        const aw = ['#c8102e', '#1e41ff', '#0b7a3a', '#f5a400'][k];
        c.fillStyle = '#d9d2c4'; c.fillRect(x0 + 112, gy + 28, 118, h - gy - 28);
        c.fillStyle = '#2b2a28'; c.fillRect(x0 + 120, gy + 46, 102, 40);
        c.fillStyle = '#ffe9b8'; c.fillRect(x0 + 124, gy + 50, 94, 6);
        c.fillStyle = aw; c.fillRect(x0 + 106, gy + 20, 130, 18); c.fillStyle = 'rgba(255,255,255,0.85)'; for (let s = 0; s < 130; s += 26) c.fillRect(x0 + 106 + s, gy + 20, 13, 18);
        c.fillStyle = '#ddd'; c.fillRect(x0 + 124, gy + 92, 94, 3);
      }
      // rain / grime streaks down the cladding
      for (let i = 0; i < 160; i++) { const x = Math.random() * w, y = Math.random() * h * 0.5, l = 30 + Math.random() * 160; const gr = c.createLinearGradient(0, y, 0, y + l); gr.addColorStop(0, 'rgba(60,55,50,0.16)'); gr.addColorStop(1, 'rgba(60,55,50,0)'); c.fillStyle = gr; c.fillRect(x, y, 2 + Math.random() * 3, l); }
    });
    // night: only the ground-floor openings / kiosk counters glow
    const glow = canvasTex(256, 128, (c, w, h) => {
      c.fillStyle = '#000'; c.fillRect(0, 0, w, h); const gy = h * 0.78;
      for (let k = 0; k < 4; k++) { const x0 = k * 64; c.fillStyle = '#7a5a30'; c.fillRect(x0 + 5, gy + 5, 17, h - gy - 5); c.fillStyle = '#ffe2a8'; c.fillRect(x0 + 30, gy + 11, 26, 10); }
    });
    tex.wrapT = glow.wrapT = THREE.ClampToEdgeWrapping;
    const nl = this.nightable;
    return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0.35, ...(nl ? { emissive: 0xffffff, emissiveMap: glow, emissiveIntensity: this.night ? 1.4 : 0 } : {}) });
  }

  // grandstand in local frame: x along the track, track side towards +z. Stepped concrete
  // side walls, raked seating with the animated crowd, steel raker structure underneath,
  // advertising front wall, cantilever roof on cable-stayed masts with a sponsor fascia.
  // Built as plain meshes; collectMerge() bakes every stand into shared per-material meshes.
  makeStand(L, D, H, crowdMat) {
    const M = this.standMats(crowdMat);
    const g = new THREE.Group();
    const add = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
    const yF = 1.6, rise = H - yF, slopeLen = Math.hypot(D, rise), ang = Math.atan2(rise, D);
    // crowd on the rake (uv in metres / 14 so every stand shows people at the same scale)
    {
      const p = new THREE.PlaneGeometry(L - 0.9, slopeLen); p.rotateX(-Math.PI / 2 + ang);
      const uv = p.attributes.uv, off = Math.random();
      for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * (L - 0.9) / 14 + off);
      const tints = crowdMat.userData.tints || ['#ffffff'];
      const tint = new THREE.Color(tints[Math.floor(Math.random() * tints.length)]);
      const n = p.attributes.position.count, col = new Float32Array(n * 3); for (let i = 0; i < n; i++) col.set([tint.r, tint.g, tint.b], i * 3);
      p.setAttribute('color', new THREE.BufferAttribute(col, 3));
      add(p, M.crowd, 0, (H + yF) / 2 + 0.05, 0);
      // seating slab (its underside shows from behind)
      const sl = new THREE.BoxGeometry(L - 0.9, 0.45, slopeLen); sl.rotateX(ang); add(sl, M.conc, 0, (H + yF) / 2 - 0.25, 0);
    }
    // stepped side walls
    {
      const n = Math.max(4, Math.round(rise / 1.1)); const s = new THREE.Shape();
      s.moveTo(D / 2 + 0.3, 0); s.lineTo(D / 2 + 0.3, yF + 0.45);
      for (let k = 0; k < n; k++) { const z1 = D / 2 - (k + 1) * D / n, y0 = yF + k * rise / n + 0.45, y1 = yF + (k + 1) * rise / n + 0.45; s.lineTo(z1, y0); s.lineTo(z1, y1); }
      s.lineTo(-D / 2 - 0.3, H + 0.45); s.lineTo(-D / 2 - 0.3, 0); s.lineTo(D / 2 + 0.3, 0);
      for (const sx of [-1, 1]) {
        const e = new THREE.ExtrudeGeometry(s, { depth: 0.45, bevelEnabled: false, curveSegments: 1 }); e.rotateY(-Math.PI / 2);
        e.translate(sx < 0 ? -L / 2 + 0.45 : L / 2, 0, 0); add(e, M.conc);
      }
    }
    // structure under the seats: columns on three lines, cross-bracing on the back
    {
      const nb = Math.max(2, Math.round(L / 7.5));
      for (let k = 0; k <= nb; k++) {
        const x = -L / 2 + 0.7 + (L - 1.4) * k / nb;
        for (const [z, h] of [[-D / 2 + 0.3, H - 0.4], [0, (H + yF) / 2 - 0.4], [D / 2 - 0.6, yF]]) add(new THREE.BoxGeometry(0.35, h, 0.35), M.steel, x, h / 2, z);
        if (k < nb) {
          const x2 = -L / 2 + 0.7 + (L - 1.4) * (k + 1) / nb, bwid = x2 - x, bh = H - 0.9, len = Math.hypot(bwid, bh), a = Math.atan2(bh, bwid);
          for (const sg of [1, -1]) { const b = new THREE.BoxGeometry(len, 0.14, 0.14); b.rotateZ(sg * a); add(b, M.steel, (x + x2) / 2, bh / 2 + 0.2, -D / 2 + 0.3); }
          add(new THREE.BoxGeometry(bwid, 0.25, 0.25), M.steel, (x + x2) / 2, 2.4, -D / 2 + 0.3);
        }
      }
    }
    // clad back wall (concourse, kiosks, sponsor band) and a paved apron behind it
    {
      const bh = H + 0.45, p = new THREE.PlaneGeometry(L, bh); p.rotateY(Math.PI);
      const uv = p.attributes.uv, u0 = Math.random(); for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * L / 16 + u0);
      add(p, M.back, 0, bh / 2, -D / 2 - 0.02);
      const ap = new THREE.PlaneGeometry(L + 3, 6).rotateX(-Math.PI / 2); add(ap, M.conc, 0, 0.05, -D / 2 - 3);
    }
    // front wall with advertising and a rail
    add(new THREE.BoxGeometry(L, yF, 0.3), M.conc, 0, yF / 2, D / 2 + 0.15);
    {
      const segs = Math.max(1, Math.round(L / 12)), pos = [], uv = [], idx = [], b0 = Math.floor(Math.random() * M.nBrands);
      for (let k = 0; k < segs; k++) {
        const x0 = -L / 2 + 0.2 + (L - 0.4) * k / segs, x1 = -L / 2 + 0.2 + (L - 0.4) * (k + 1) / segs, u0 = ((b0 + k) % M.nBrands) / M.nBrands, u1 = u0 + 1 / M.nBrands, q = pos.length / 3;
        pos.push(x0, 0.25, 0, x1, 0.25, 0, x1, 1.35, 0, x0, 1.35, 0); uv.push(u0, 0, u1, 0, u1, 1, u0, 1); idx.push(q, q + 1, q + 2, q, q + 2, q + 3);
      }
      const ag = new THREE.BufferGeometry(); ag.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); ag.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); ag.setIndex(idx); ag.computeVertexNormals();
      add(ag, M.ad, 0, 0, D / 2 + 0.31);
      add(new THREE.BoxGeometry(L, 0.06, 0.06), M.steel, 0, yF + 1.0, D / 2 + 0.05);
      // roof fascia: the same sponsor strip, larger
      const fg = ag.clone(); fg.translate(0, -0.8, 0); fg.scale(1.03, 1.0, 1);
      add(fg, M.ad, 0, H + 3.55 + 0.25, (D + 3.2) / 2 + 0.75);
    }
    // cantilever roof: thin slab rising towards the track, masts with stays at the back
    {
      const rd = D + 3.2, ry = H + 3.6;
      const r = new THREE.BoxGeometry(L + 1.2, 0.28, rd); r.rotateX(-0.06); add(r, M.roof, 0, ry + 0.2, 0.4);
      add(new THREE.BoxGeometry(L + 1.2, 1.25, 0.18), M.dark, 0, ry + 0.25, rd / 2 + 0.6);
      const nm = Math.max(2, Math.round(L / 10));
      for (let k = 0; k <= nm; k++) {
        const x = -L / 2 + 0.7 + (L - 1.4) * k / nm;
        add(new THREE.CylinderGeometry(0.16, 0.2, ry + 2.6 - H, 8), M.steel, x, (H + ry + 2.6) / 2, -D / 2 + 0.3);
        const a = new THREE.Vector3(x, ry + 2.5, -D / 2 + 0.3), b = new THREE.Vector3(x, ry + 0.5, rd / 2 + 0.2);
        const st = new THREE.CylinderGeometry(0.045, 0.045, a.distanceTo(b), 5);
        st.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
        add(st, M.steel, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      }
    }
    return g;
  }

  // bake the meshes of a placed group into world-space buckets per material; flushMerge()
  // adds one mesh per material (dozens of stands / buildings -> a handful of draw calls)
  collectMerge(group, shadow = true) {
    group.updateMatrixWorld(true);
    this._mb ||= new Map();
    group.traverse((o) => {
      if (!o.isMesh) return;
      const gg = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      for (const k of Object.keys(gg.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) gg.deleteAttribute(k);
      if (!gg.attributes.normal) gg.computeVertexNormals();
      if (!gg.attributes.uv) gg.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(gg.attributes.position.count * 2), 2));
      gg.applyMatrix4(o.matrixWorld);
      const key = o.material.uuid + (shadow ? 's' : '');
      if (!this._mb.has(key)) this._mb.set(key, { mat: o.material, list: [], shadow });
      this._mb.get(key).list.push(gg);
    });
  }
  flushMerge() {
    for (const { mat, list, shadow } of this._mb?.values() || []) {
      const withC = list.some((g) => g.attributes.color);
      if (withC) { for (const g of list) if (!g.attributes.color) g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3)); mat.vertexColors = true; }
      const geo = mergeGeometries(list); if (!geo) continue;
      geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, mat); m.castShadow = shadow; m.receiveShadow = true; this.scene.add(m);
    }
    this._mb = null;
  }

  // checks the footprint (half-length along local x, half-depth along local z) of a placed object
  boxClear(obj, hl, hd, r, near) {
    const c = Math.cos(obj.rotation.y), sn = Math.sin(obj.rotation.y);
    for (const [a, b] of [[0, 0], [hl, hd], [-hl, hd], [hl, -hd], [-hl, -hd]]) {
      const px = obj.position.x + a * c + b * sn, pz = obj.position.z - a * sn + b * c;
      if (!this.clearOfTrack(px, pz, r, near)) return false;
    }
    return true;
  }

  placeAt(obj, i, off, y = 0, rot = 0) {
    const N = this.geo.N; i = ((Math.round(i) % N) + N) % N;
    const nx = -Math.sin(this.geo.hdg[i]), nz = Math.cos(this.geo.hdg[i]);
    obj.position.set(this.geo.x[i] + nx * off, y, this.geo.y[i] + nz * off);
    obj.rotation.y = -this.geo.hdg[i] + rot;
    return obj;
  }

  // start gantry across the track: posts, sponsor beam and the five-column light box
  // (lamps face the grid; this.lights[k] shares its material with the whole column)
  buildGantry(W) {
    const g = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: 0x30343b, metalness: 0.75, roughness: 0.38 });
    const span = this.pit ? 2 * this.pit.wall : W + 6; // + side post stands on the pit wall
    for (const zz of [span / 2, -span / 2]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.9, 8.4, 0.9), steel); post.position.set(0, 4.2, zz); post.castShadow = true; g.add(post);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 1.6), steel); foot.position.set(0, 0.25, zz); g.add(foot);
    }
    const banner = canvasTex(1024, 96, (c, w, h) => { c.fillStyle = '#0d0f14'; c.fillRect(0, 0, w, h); c.fillStyle = '#e10600'; c.fillRect(0, h - 8, w, 8); c.fillStyle = '#ffffff'; c.font = 'italic 900 50px "Exo 2", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('APEX DYNASTY  ·  ROLEXA  ·  PIRELLO', w / 2, h / 2); });
    banner.wrapS = THREE.ClampToEdgeWrapping;
    const bMat = new THREE.MeshStandardMaterial({ map: banner, roughness: 0.5, emissive: 0xffffff, emissiveMap: banner, emissiveIntensity: this.night ? 0.5 : 0.05 });
    // BoxGeometry material order: +x, -x, +y, -y, +z, -z; the banner faces (+z/-z) are turned to face along the track
    const beam = new THREE.Mesh(new THREE.BoxGeometry(span + 0.9, 1.4, 1.1), [steel, steel, steel, steel, bMat, bMat]);
    beam.rotation.y = Math.PI / 2; beam.position.y = 8.1; beam.castShadow = true; g.add(beam);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.3, 3.6), new THREE.MeshStandardMaterial({ color: 0x08090b, roughness: 0.6 })); panel.position.set(-0.7, 6.75, 0); g.add(panel);
    const lampGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.08, 16).rotateZ(Math.PI / 2);
    this.lights = [];
    for (let k = 0; k < 5; k++) {
      const m = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0x000000, roughness: 0.3 });
      for (const y of [6.45, 7.05]) { const l = new THREE.Mesh(lampGeo, m); l.position.set(-0.95, y, -1.4 + k * 0.7); g.add(l); if (y === 6.45) this.lights.push(l); }
    }
    this.placeAt(g, 3, 0);
    this.scene.add(g);
  }

  // trackside furniture: braking-distance boards, marshal posts with light panels, TV camera
  // towers and a sponsor footbridge over the longest straight (all instanced / few draw calls)
  buildTrackside(street) {
    const N = this.geo.N, W = this.TW;
    const dummy = new THREE.Object3D();
    const instanced = (geo, mat, list, shadow = true) => {
      if (!list.length) return null;
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((m, k) => im.setMatrixAt(k, m)); im.castShadow = shadow; im.receiveShadow = true; this.scene.add(im); return im;
    };
    const mtx = (i, off, y, rot = 0) => { dummy.scale.set(1, 1, 1); this.placeAt(dummy, i, off, y, rot); dummy.updateMatrix(); return dummy.matrix.clone(); };
    const hAt = (i) => (this.geo.h ? this.geo.h[((Math.round(i) % N) + N) % N] : 0);
    // braking boards 150 / 100 / 50 m before slow corners, on the outside
    if (street <= 0.7) {
      const nums = [150, 100, 50];
      const boards = nums.map(() => []), posts = [];
      for (const cn of this.geo.corners) {
        if (cn.r > 160) continue;
        const side = -cn.dir;
        nums.forEach((d, k) => {
          const i = Math.round(cn.i - cn.r / 10 - d / this.geo.ds); const off = side * (this.wallOff(i, side) - 1.1);
          if (Math.abs(off) < W / 2 + 5) return;
          boards[k].push(mtx(i, off, hAt(i) + 1.25)); posts.push(mtx(i, off, hAt(i) + 0.4));
        });
      }
      nums.forEach((n, k) => {
        const t = canvasTex(128, 96, (c, w, h) => { c.fillStyle = '#f4f4f4'; c.fillRect(0, 0, w, h); c.strokeStyle = '#111'; c.lineWidth = 8; c.strokeRect(4, 4, w - 8, h - 8); c.fillStyle = '#111'; c.font = '900 58px "Exo 2", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(n), w / 2, h / 2 + 3); });
        t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
        instanced(new THREE.BoxGeometry(0.06, 0.95, 1.25), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 }), boards[k]);
      });
      instanced(new THREE.BoxGeometry(0.08, 0.8, 0.08), new THREE.MeshStandardMaterial({ color: 0x8b9096, metalness: 0.6, roughness: 0.4 }), posts);
    }
    // marshal posts behind the barrier, alternating sides
    {
      const huts = [], roofs = [], panels = [];
      const step = Math.max(40, Math.round(N / 18));
      for (let i = step / 2, k = 0; i < N; i += step, k++) {
        const ii = Math.round(i); if (Math.min(ii, N - ii) < this.pitSpan + 16) continue;
        for (const side of [k % 2 ? 1 : -1, k % 2 ? -1 : 1]) {
          const off = side * (this.wallOff(ii, side) + 3.2);
          this.placeAt(dummy, ii, off, 0);
          if (!this.clearOfTrack(dummy.position.x, dummy.position.z, W / 2 + 4.5) || (this.tvCams || []).some((c) => (c.pos.x - dummy.position.x) ** 2 + (c.pos.z - dummy.position.z) ** 2 < 49) || this.obstacles.some((o) => (o.x - dummy.position.x) ** 2 + (o.z - dummy.position.z) ** 2 < (o.r + 2) ** 2)) continue;
          const px = dummy.position.x, pz = dummy.position.z;
          const rot = side > 0 ? Math.PI : 0;
          huts.push(mtx(ii, off, hAt(ii), rot)); roofs.push(mtx(ii, off, hAt(ii) + 2.55, rot)); panels.push(mtx(ii, off - side * 1.16, hAt(ii) + 1.6, rot));
          this.obstacles.push({ x: px, z: pz, r: 2.5, h: 3 });
          break;
        }
      }
      instanced(new THREE.BoxGeometry(2.4, 2.4, 2.2).translate(0, 1.2, 0), new THREE.MeshStandardMaterial({ color: 0xe9e9e6, roughness: 0.7 }), huts);
      instanced(new THREE.BoxGeometry(2.9, 0.22, 2.7), new THREE.MeshStandardMaterial({ color: 0xf07d10, roughness: 0.6 }), roofs);
      const led = canvasTex(64, 64, (c, w, h) => { c.fillStyle = '#050607'; c.fillRect(0, 0, w, h); for (let y = 6; y < h - 4; y += 6) for (let x = 6; x < w - 4; x += 6) { c.fillStyle = 'rgba(40,255,90,0.95)'; c.fillRect(x, y, 3, 3); } });
      instanced(new THREE.BoxGeometry(1.2, 1.0, 0.12), new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffffff, emissiveMap: led, emissiveIntensity: 0.9, roughness: 0.4 }), panels, false);
    }
    // TV camera towers (scaffold + platform) under the elevated broadcast cameras
    if (street <= 0.7) {
      const legs = [], decks = [];
      for (const c of this.tvCams || []) {
        if (c.pos.y < 6.5 || c.pos.y > 20) continue;
        const top = c.pos.y - 1.7; const j = c.i;
        const rot = Math.atan2(this.geo.y[j] - c.pos.z, this.geo.x[j] - c.pos.x);
        for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { dummy.position.set(c.pos.x + dx * 1.1, top / 2, c.pos.z + dz * 1.1); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, top, 1); dummy.updateMatrix(); legs.push(dummy.matrix.clone()); }
        for (const yy of [top * 0.33, top * 0.66]) { dummy.position.set(c.pos.x, yy, c.pos.z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); decks.push(dummy.matrix.clone()); }
        dummy.position.set(c.pos.x, top, c.pos.z); dummy.rotation.set(0, -rot, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); decks.push(dummy.matrix.clone());
        this.obstacles.push({ x: c.pos.x, z: c.pos.z, r: 2.4, h: 0 });
      }
      instanced(new THREE.BoxGeometry(0.24, 1, 0.24), new THREE.MeshStandardMaterial({ color: 0x9aa1a8, metalness: 0.7, roughness: 0.45 }), legs);
      instanced(new THREE.BoxGeometry(2.6, 0.16, 2.6), new THREE.MeshStandardMaterial({ color: 0x5b6067, roughness: 0.8, metalness: 0.3 }), decks);
    }
    // sponsor footbridge over the middle of the longest straight (away from the start)
    {
      let best = null, run = 0, bestLen = 0;
      for (let q = 0; q < N * 2; q++) { const i = q % N; if (Math.abs(this.geo.k[i]) < 1 / 900 && (!this.geo.h || this.geo.h[i] < 0.3)) { run++; if (run > bestLen && run < N) { bestLen = run; best = q - Math.floor(run / 2); } } else run = 0; }
      if (best != null && bestLen > 50) {
        let i = best % N; if (Math.min(i, N - i) < this.pitSpan + 30) i = (i + Math.round(bestLen / 4)) % N;
        const g = new THREE.Group();
        const wl = this.wallOff(i, 1) + 2, wr = this.wallOff(i, -1) + 2, H = 7.2;
        const steelM = new THREE.MeshStandardMaterial({ color: 0x3a3f46, metalness: 0.7, roughness: 0.4 });
        for (const zz of [wl, -wr]) { const t = new THREE.Mesh(new THREE.BoxGeometry(2.2, H + 2.4, 2.2), steelM); t.position.set(0, (H + 2.4) / 2, zz); t.castShadow = true; g.add(t); }
        const brands = ['PIRELLO', 'LAVAZZO', 'DHX', 'ROLEXA']; const brand = brands[i % brands.length];
        const bt = canvasTex(1024, 128, (c, w, h) => { const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ffd400'); gr.addColorStop(1, '#f1b700'); c.fillStyle = gr; c.fillRect(0, 0, w, h); c.fillStyle = '#111'; c.font = 'italic 900 92px "Exo 2", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(brand, w / 2, h / 2 + 4); });
        bt.wrapS = THREE.ClampToEdgeWrapping;
        const bm = new THREE.MeshStandardMaterial({ map: bt, roughness: 0.55, emissive: 0xffffff, emissiveMap: bt, emissiveIntensity: this.night ? 0.45 : 0.04 });
        const deck = new THREE.Mesh(new THREE.BoxGeometry(wl + wr + 2.2, 2.2, 2.0), [steelM, steelM, steelM, steelM, bm, bm]);
        deck.rotation.y = Math.PI / 2; deck.position.set(0, H + 1.1, (wl - wr) / 2); deck.castShadow = true; g.add(deck);
        this.placeAt(g, i, 0, hAt(i)); this.bridgeI = i;
        this.scene.add(g);
      }
    }
  }

  buildScenery(street) {
    const N = this.geo.N, W = this.TW;
    // gantry
    this.buildGantry(W);
    // grandstands + pit building along start straight
    // one tile = 14 m of stand: 16 rows of seats, ~0.5 m per spectator, an aisle with steps
    const crowd = canvasTex(512, 256, (c, w, h) => {
      const rows = 16; const rh = h / rows, aisle = 30;
      const seat = ['#1d3f8f', '#20488f', '#9a1d22', '#1f2a36'][Math.floor(Math.random() * 4)];
      const shirt = () => {
        const r = Math.random();
        if (r < 0.26) return `hsl(0,0%,${82 + Math.random() * 16}%)`;
        if (r < 0.46) return `hsl(220,${8 + Math.random() * 20}%,${12 + Math.random() * 16}%)`;
        if (r < 0.62) return ['#d8141b', '#c8102e', '#e10600', '#ff8000', '#00a19c', '#1e41ff', '#f5c400'][Math.floor(Math.random() * 7)];
        if (r < 0.74) return `hsl(210,${30 + Math.random() * 25}%,${38 + Math.random() * 20}%)`;
        return `hsl(${Math.random() * 360},${18 + Math.random() * 30}%,${35 + Math.random() * 30}%)`;
      };
      for (let r = 0; r < rows; r++) {
        const y0 = r * rh;
        c.fillStyle = '#6f737a'; c.fillRect(0, y0, w, rh);
        c.fillStyle = seat; c.fillRect(aisle, y0 + rh * 0.2, w - aisle, rh * 0.55);
        c.fillStyle = 'rgba(0,0,0,0.4)'; c.fillRect(0, y0 + rh - 2, w, 2);
        c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(0, y0, w, 1);
        // aisle steps
        c.fillStyle = '#8b8f95'; c.fillRect(0, y0, aisle, rh); c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(0, y0 + rh / 2 - 1, aisle, 1.5); c.fillRect(0, y0 + rh - 2, aisle, 2);
        c.fillStyle = '#d9b22a'; c.fillRect(0, y0 + rh - 3, aisle, 1);
        for (let x = aisle + 3; x < w - 14; x += 17 + Math.random() * 3) {
          if (Math.random() < 0.08) continue; // empty seat
          const sx = x + (Math.random() - 0.5) * 2, tw = 11 + Math.random() * 3;
          c.fillStyle = shirt();
          c.beginPath(); c.roundRect ? c.roundRect(sx, y0 + rh * 0.42, tw, rh * 0.62, 3) : c.rect(sx, y0 + rh * 0.42, tw, rh * 0.62); c.fill();
          c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(sx + tw * 0.5 - 0.5, y0 + rh * 0.45, 1, rh * 0.5);
          // head (skin), hair or cap
          const hx = sx + tw / 2; c.fillStyle = `hsl(${20 + Math.random() * 12},${30 + Math.random() * 30}%,${30 + Math.random() * 45}%)`;
          c.beginPath(); c.ellipse(hx, y0 + rh * 0.3, 3.1, 3.5, 0, 0, 7); c.fill();
          const cap = Math.random();
          c.fillStyle = cap < 0.3 ? ['#e10600', '#111', '#fff', '#f5c400', '#1e41ff'][Math.floor(Math.random() * 5)] : `hsl(30,${20 + Math.random() * 30}%,${8 + Math.random() * 30}%)`;
          c.beginPath(); c.ellipse(hx, y0 + rh * 0.2, 3.3, cap < 0.3 ? 2.0 : 1.6, 0, 0, 7); c.fill();
          // the odd raised arm or flag
          if (Math.random() < 0.05) { c.fillStyle = shirt(); c.fillRect(sx + tw - 2, y0 - rh * 0.1, 2.5, rh * 0.55); }
        }
      }
    });
    crowd.repeat.set(1, 1);
    const standMat = crowdPatch(new THREE.MeshStandardMaterial({ map: crowd, roughness: 0.95 }));
    standMat.userData.tints = ['#ffffff', '#ffffff', '#fff0e6', '#ffe2c4', '#e6ecff', '#ffd2c8'];
    this.obstacles = [];
    for (let k = -3; k <= 3; k++) {
      const st = this.makeStand(38, 14, 12, standMat);
      this.placeAt(st, k * 9, -(this.wallOff(k * 9, -1) + 10), 0);
      if (this.boxClear(st, 19, 7, W / 2 + 3, k * 9)) { this.collectMerge(st); this.obstacles.push({ x: st.position.x, z: st.position.z, r: 22, h: 16, hl: 20, hd: 8.5, rot: st.rotation.y }); }
    }
    const big = this.geo.corners.slice().sort((a, b) => a.r - b.r).slice(0, 5);
    for (const cn of big) {
      const side = -cn.dir;
      const st = this.makeStand(30, 10, 9, standMat);
      this.placeAt(st, cn.i, side * (this.wallOff(cn.i, side) + 8), 0, side > 0 ? Math.PI : 0);
      if (this.boxClear(st, 15, 5, W / 2 + 3, cn.i)) { this.collectMerge(st); this.obstacles.push({ x: st.position.x, z: st.position.z, r: 18, h: 13, hl: 16, hd: 6.5, rot: st.rotation.y }); }
    }
    this.flushMerge();
    this.buildPitLane(street);
    // trees / buildings instanced
    const count = street > 0.7 ? Math.round(260 * (this.low ? 0.35 : 1)) : 0;
    const geo = street > 0.7 ? new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0) : Math.random() < 0.5 ? treeGeo() : bushGeo();
    // facade + matching night emissive map (lit windows glow, walls stay dark)
    // street facades: atlas with one shop-front storey (bottom half) and one repeating upper
    // storey (top half), mapped in metres per instance so windows keep their size on every
    // building; flat roofs; at night a per-window random subset is lit
    const facade = street > 0.7 ? canvasTex(256, 256, (c, w, h) => {
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
      // upper storey: 4 tall windows with sills, shutters on some
      for (let k = 0; k < 4; k++) { const x = 14 + k * 62; c.fillStyle = '#c8c8c8'; c.fillRect(x - 4, 22, 42, 92); c.fillStyle = '#2e3a4a'; c.fillRect(x, 26, 34, 80); c.fillStyle = 'rgba(170,200,225,0.35)'; c.fillRect(x + 2, 28, 14, 76); c.fillStyle = '#ffffff'; c.fillRect(x + 16, 26, 2, 80); c.fillRect(x, 64, 34, 2); c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(x - 6, 108, 46, 5); if (k % 2) { c.fillStyle = 'rgba(60,90,70,0.85)'; c.fillRect(x - 12, 26, 9, 80); c.fillRect(x + 37, 26, 9, 80); } }
      c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(0, 0, w, 6);
      // ground floor: shop windows, awnings, doors, dark plinth
      c.fillStyle = '#d9d4cc'; c.fillRect(0, 128, w, 128);
      const aw = ['#b3261e', '#1f5f8b', '#2f6b3a', '#7a3e8f'];
      for (let k = 0; k < 2; k++) { const x = 8 + k * 128; c.fillStyle = '#1a222c'; c.fillRect(x, 170, 112, 78); c.fillStyle = 'rgba(200,220,235,0.3)'; c.fillRect(x + 4, 174, 104, 40); c.fillStyle = aw[(k + 1) % 4]; c.fillRect(x - 4, 150, 120, 16); c.fillStyle = 'rgba(255,255,255,0.5)'; for (let q = 0; q < 120; q += 16) c.fillRect(x - 4 + q, 150, 8, 16); c.fillStyle = '#f2efe6'; c.fillRect(x + 10, 134, 92, 12); }
      c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(0, 246, w, 10);
    }) : null;
    if (facade) { facade.wrapS = THREE.RepeatWrapping; facade.wrapT = THREE.ClampToEdgeWrapping; }
    const glow = street > 0.7 && this.night ? canvasTex(256, 256, (c, w, h) => { c.fillStyle = '#000'; c.fillRect(0, 0, w, h); for (let k = 0; k < 4; k++) { const gw = c.createLinearGradient(0, 26, 0, 106); gw.addColorStop(0, k % 3 ? '#ffd9a0' : '#ffe6c2'); gw.addColorStop(1, k % 3 ? '#c98a4a' : '#d9b48a'); c.fillStyle = gw; c.fillRect(14 + k * 62, 26, 34, 80); } c.fillStyle = '#fff0d0'; c.fillRect(12, 174, 104, 72); c.fillRect(140, 174, 104, 72); }) : null;
    const m = street > 0.7 ? new THREE.MeshStandardMaterial({ map: facade, roughness: 0.85, ...(glow ? { emissive: 0xffffff, emissiveMap: glow, emissiveIntensity: 0.6 } : {}) }) : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
    if (street > 0.7) {
      m.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec4 vFac;')
          .replace('#include <uv_vertex>', `#include <uv_vertex>
            #ifdef USE_INSTANCING
              vec3 isc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
              vFac = vec4(uv.x * (abs(normal.x) > 0.5 ? isc.z : isc.x) / 12.0, position.y * isc.y, normal.y, instanceMatrix[3].x * 0.013 + instanceMatrix[3].z * 0.029);
            #else
              vFac = vec4(uv, normal.y, 0.0);
            #endif`);
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec4 vFac;\nfloat fhash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }')
          .replace('#include <map_fragment>', `
            float fy = vFac.y; float upper = step(4.4, fy);
            vec2 fuv = vec2(vFac.x, upper > 0.5 ? 0.5 + 0.5 * fract((fy - 4.4) / 3.3) : 0.5 * clamp(fy / 4.4, 0.0, 0.998));
            float roof = step(0.5, vFac.z);
            vec4 sampledDiffuseColor = mix(texture2D(map, fuv), vec4(0.36, 0.36, 0.37, 1.0), roof);
            diffuseColor *= sampledDiffuseColor;
            float litW = step(0.66, fhash(vec2(floor(vFac.x * 4.0) + vFac.w * 17.0, floor((fy - 4.4) / 3.3) + vFac.w))) * (0.35 + 0.65 * fhash(vec2(floor(vFac.x * 4.0) + 3.1, floor(fy / 3.3) + vFac.w * 7.0)));`)
          .replace('#include <emissivemap_fragment>', `
            #ifdef USE_EMISSIVEMAP
              totalEmissiveRadiance *= texture2D(emissiveMap, fuv).rgb * (1.0 - roof) * mix(0.25 + 0.75 * fhash(vec2(floor(vFac.x * 2.0), vFac.w)), litW, upper);
            #endif`);
      };
      m.customProgramCacheKey = () => 'facade' + (glow ? 'n' : '');
    }
    if (glow) m.color.setHex(0x8a8f99);
    const inst = new THREE.InstancedMesh(geo, m, count);
    const placedB = [];
    const tint = new THREE.Color();
    const dummy = new THREE.Object3D();
    for (let k = 0; k < count; k++) {
      const i = Math.floor(Math.random() * N);
      const side = Math.random() < 0.5 ? 1 : -1;
      const off = side * (W / 2 + (street > 0.7 ? 14 : 40) + Math.random() * (street > 0.7 ? 60 : 160));
      // keep away from the track (other parts)
      const nx = -Math.sin(this.geo.hdg[i]), nz = Math.cos(this.geo.hdg[i]);
      const px = this.geo.x[i] + nx * off, pz = this.geo.y[i] + nz * off;
      let h = street > 0.7 ? 12 + Math.random() * 50 : 9 + Math.random() * 13;
      const wd = street > 0.7 ? 10 + Math.random() * 18 : h * (0.75 + Math.random() * 0.35);
      // keep the whole footprint (not just the centre) away from every part of the track,
      // the pit building and the grandstands
      const clear = street > 0.7 ? W / 2 + 4 + wd * 0.72 : W / 2 + 10 + wd * 0.45;
      let ok = true, dmin = 1e9;
      for (let j = 0; j < N; j += 2) { const dx = this.geo.x[j] - px, dz = this.geo.y[j] - pz; const d2 = dx * dx + dz * dz; if (d2 < dmin) dmin = d2; if (d2 < clear * clear) { ok = false; break; } }
      if (ok && this.obstacles.some((o) => (o.x - px) ** 2 + (o.z - pz) ** 2 < (o.r + wd * 0.72) ** 2)) ok = false;
      if (ok && this.seaMask?.(px, pz)) ok = false;
      if (!ok) { inst.setMatrixAt(k, new THREE.Matrix4().makeScale(0, 0, 0)); continue; }
      // tall buildings only away from the circuit (cameras fly above the first row)
      if (street > 0.7) h = Math.min(h, 10 + (Math.sqrt(dmin) - clear) * 1.2 + 8);
      this.obstacles.push({ x: px, z: pz, r: wd * 0.72 + 2, h }); placedB.push([k, px, pz, wd * 0.72]);
      dummy.position.set(px, 0, pz); dummy.scale.set(wd, h, wd); dummy.rotation.y = Math.random() * 6; dummy.updateMatrix();
      inst.setMatrixAt(k, dummy.matrix);
      if (street <= 0.7) tint.setHSL(0.22 + Math.random() * 0.1, 0.35 + Math.random() * 0.25, 0.75 + Math.random() * 0.35);
      else tint.setHSL([0.08, 0.1, 0.05, 0.12, 0.0, 0.58][Math.floor(Math.random() * 6)], 0.25 + Math.random() * 0.35, 0.62 + Math.random() * 0.22);
      inst.setColorAt(k, tint);
    }
    inst.castShadow = true;
    if (count) this.scene.add(inst);
    // street circuits: drop buildings that stand between a TV camera and the track it films
    if (count && street > 0.7) {
      this.tvCams ||= this.makeTvCams();
      const Nn = this.geo.N; const zero = new THREE.Matrix4().makeScale(0, 0, 0);
      const sight = this.tvCams.flatMap((c) => [0, -12, -24, -36].map((d) => { const j = (c.i + d + Nn) % Nn; return [c.pos.x, c.pos.z, this.geo.x[j], this.geo.y[j]]; }));
      for (const [k, px, pz, r] of placedB) {
        const hit = sight.some(([x0, z0, x1, z1]) => { const dx = x1 - x0, dz = z1 - z0; const L2 = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((px - x0) * dx + (pz - z0) * dz) / L2)); return (px - x0 - dx * t) ** 2 + (pz - z0 - dz * t) ** 2 < (r + 1.5) ** 2; });
        if (hit) { inst.setMatrixAt(k, zero); const o = this.obstacles.findIndex((ob) => ob.x === px && ob.z === pz); if (o >= 0) this.obstacles.splice(o, 1); }
      }
      inst.instanceMatrix.needsUpdate = true;
    }
    this.tvCams ||= this.makeTvCams();
    this.buildTerrain(street);
    this.buildSkyline(street);
    this.buildTrackside(street);
    this.buildDressing(street);
    if (street > 0.7) this.buildStreetProps();
    this.buildForest(street);
    // trackside sponsor billboards
    const brands = ['PETRONIX', 'ORACLO', 'ARAMCORE', 'ROLEXA', 'HEINEKAN 0.0', 'DHX', 'PIRELLO', 'LENOVA', 'SANTANDOR', 'MONSTRO', 'PUMO', 'BREMBI', 'CRYPTO.CAM', 'LAVAZZO', 'TAG HEUERR', 'APEX DYNASTY'];
    const bcols = ['#e10600', '#111111', '#0a2a66', '#ffd400', '#00594f', '#ffffff', '#ff8000', '#1d4ec2'];
    const bmats = brands.map((b, i) => { const t = canvasTex(512, 96, (c, w, h) => { const bg = bcols[i % bcols.length]; c.fillStyle = bg; c.fillRect(0, 0, w, h); c.fillStyle = bg === '#ffffff' || bg === '#ffd400' ? '#111' : '#fff'; c.font = 'italic 900 60px "Exo 2", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(b, w / 2, h / 2 + 3); }); return new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: this.night ? 0.6 : 0.08 }); });
    const bstep = Math.max(30, Math.round(N / 34));
    for (let i = 10, k = 0; i < N; i += bstep, k++) {
      if (Math.abs(this.geo.k[i]) > 1 / 300) continue;
      const side = k % 2 ? 1 : -1;
      const bb = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.4, 12), bmats[k % bmats.length]);
      this.placeAt(bb, i, side * (this.wallOff(i, side) + 1.4), 1.4);
      if (!this.boxClear(bb, 6, 0.3, W / 2 + 2, i)) continue;
      bb.castShadow = true; this.scene.add(bb);
    }
    // night lighting poles
    if (this.nightable) {
      const poleMat = new THREE.MeshStandardMaterial({ color: 0xfff6dd, emissive: 0xfff3c8, emissiveIntensity: 2 });
      const heads = [], poles = [], pools = [], cones = [];
      this.nightLamps = [];
      const q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
      for (let i = 0; i < N; i += 24) {
        const side = (i / 24) % 2 ? 1 : -1;
        if (!this.floodlit && !(this.pit && this.inPitZone(i, 70))) continue; // unlit circuit: only the start/finish straight

        const lamp = new THREE.Object3D();
        this.placeAt(lamp, i, side * (side > 0 && this.pit && this.inPitZone(i, 16) ? this.pit.wall - 1.6 : W / 2 + 6), 16); lamp.updateMatrix(); heads.push(lamp.matrix.clone());
        const nx = -Math.sin(this.geo.hdg[i]), nz = Math.cos(this.geo.hdg[i]);
        const p = lamp.position;
        poles.push(new THREE.Matrix4().compose(new THREE.Vector3(p.x + nx * side * 1.6, 8, p.z + nz * side * 1.6), q, one));
        // pool of light on the asphalt and a faint beam in the night air, aimed at the track
        const gx = this.geo.x[i] + nx * side * (W / 2 - 2.5), gz = this.geo.y[i] + nz * side * (W / 2 - 2.5);
        const gy = this.geo.h ? this.geo.h[i] : 0;
        pools.push(new THREE.Matrix4().compose(new THREE.Vector3(gx, gy + 0.06, gz), q, new THREE.Vector3(26, 1, 26)));
        const top = new THREE.Vector3(p.x, 15.6, p.z), bot = new THREE.Vector3(gx, gy, gz), dir = bot.clone().sub(top);
        cones.push(new THREE.Matrix4().compose(top, new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.clone().normalize()), new THREE.Vector3(1, dir.length(), 1)));
        this.nightLamps.push(new THREE.Vector3(gx, gy + 9, gz));
      }
      const inst = (geo, mat, list, shadow = false) => { const im = new THREE.InstancedMesh(geo, mat, list.length); list.forEach((m, k) => im.setMatrixAt(k, m)); im.castShadow = shadow; im.computeBoundingSphere(); this.scene.add(im); return im; };
      inst(new THREE.BoxGeometry(0.8, 0.5, 3), poleMat, heads);
      inst(new THREE.CylinderGeometry(0.14, 0.2, 16, 8), new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.5, metalness: 0.7 }), poles, true);
      const poolTex = canvasTex(128, 128, (c, w, h) => { const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); g.addColorStop(0, 'rgba(255,240,215,1)'); g.addColorStop(0.35, 'rgba(255,236,205,0.55)'); g.addColorStop(1, 'rgba(255,230,200,0)'); c.clearRect(0, 0, w, h); c.fillStyle = g; c.fillRect(0, 0, w, h); });
      poolTex.wrapS = poolTex.wrapT = THREE.ClampToEdgeWrapping;
      this.poolMat = new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, fog: true });
      inst(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), this.poolMat, pools).renderOrder = 1;
      // beams: open cone (apex at the lamp), additive, brightest near the lamp, soft at the
      // silhouette (view-angle falloff) and faded with distance
      const coneGeo = new THREE.CylinderGeometry(0.4, 9, 1, 24, 1, true).translate(0, -0.5, 0);
      const beamMat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        uniforms: { uAmt: { value: this.low ? 0.6 : 1 } },
        vertexShader: `varying float vH; varying vec3 vN; varying vec3 vV; varying float vD;
          #include <common>
          #include <logdepthbuf_pars_vertex>
          void main() { vH = uv.y; vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
            vN = normalize(mat3(modelMatrix * instanceMatrix) * normal); vV = normalize(cameraPosition - wp.xyz); vD = distance(cameraPosition, wp.xyz);
            gl_Position = projectionMatrix * viewMatrix * wp;
            #include <logdepthbuf_vertex>
          }`,
        fragmentShader: `uniform float uAmt; varying float vH; varying vec3 vN; varying vec3 vV; varying float vD;
          #include <logdepthbuf_pars_fragment>
          void main() {
            #include <logdepthbuf_fragment>
            float f = abs(dot(normalize(vN), normalize(vV))); float a = pow(vH, 1.6) * f * f * 0.08 * uAmt * smoothstep(520.0, 80.0, vD);
            gl_FragColor = vec4(vec3(1.0, 0.92, 0.78) * a, 1.0); }`,
      });
      inst(coneGeo, beamMat, cones).renderOrder = 3;
      // a handful of real lights follow the camera from lamp to lamp: cars passing under the
      // floodlights pick up moving highlights on paint and wet asphalt
      if (!this.low) { this.lampLights = [0, 1, 2, 3].map(() => { const l = new THREE.PointLight(0xfff0d8, 0, 55, 2); this.scene.add(l); return l; }); }
      const amb = new THREE.AmbientLight(0xfff0d8, 0.22); this.scene.add(amb);
      this._lampRig = { poleMat, beamMat, amb, beam0: beamMat.uniforms.uAmt.value };
    }
    this.buildPitNight();
    this.setLampLevel(this.night ? 1 : 0);
    buildLife(this, street, this.biome);
  }

  // street circuits: the town between the buildings — paved plazas with stone paving, rows of
  // parked cars along the kerbs, planters with trees and bollards. Three instanced draws.
  buildStreetProps() {
    const N = this.geo.N, W = this.TW, obs = this.obstacles || [];
    const inObs = (px, pz, m) => this.seaMask?.(px, pz) || obs.some((o) => { const ex = px - o.x, ez = pz - o.z; if (!o.hl) return ex * ex + ez * ez < (o.r + m) ** 2; const c = Math.cos(o.rot), s = Math.sin(o.rot); return Math.abs(ex * c - ez * s) < o.hl + m && Math.abs(ex * s + ez * c) < o.hd + m; });
    const trackD2 = (px, pz) => { let b = 1e18; for (let j = 0; j < N; j += 2) { const d = (this.geo.x[j] - px) ** 2 + (this.geo.y[j] - pz) ** 2; if (d < b) b = d; } return b; };
    const cars = [], planters = [], plazas = [], houses = [], awnings = [], palms = [];
    const d = new THREE.Object3D(), col = new THREE.Color();
    const carCols = ['#e8e8e8', '#1c1d20', '#7d8288', '#2b3f66', '#8a1c1c', '#c9c2b0', '#3d4a3a', '#f1f1ee', '#5b6066'];
    const wallCols = ['#e9dcc0', '#f0e2c8', '#e8c9a0', '#f2d6b8', '#dcc7a8', '#efe8da', '#e7b98f', '#f3e3b0'];
    const awnCols = ['#a8282c', '#2b5c8a', '#2f6b3c', '#c9a227', '#7a2c5c', '#e8e4dc'];
    // the town fills the blocks between the barriers, grandstands and the tall buildings: a
    // dense first pass close to the circuit, then sparser further out
    const rows = this.low ? 90 : 420;
    for (let r = 0; r < rows; r++) {
      const i = Math.floor(Math.random() * N), side = Math.random() < 0.5 ? 1 : -1;
      const nx = -Math.sin(this.geo.hdg[i]), nz = Math.cos(this.geo.hdg[i]), tx = Math.cos(this.geo.hdg[i]), tz = Math.sin(this.geo.hdg[i]);
      const off = this.wallOff(i, side) + 5 + Math.random() * (r % 3 ? 40 : 90);
      const cx = this.geo.x[i] + nx * side * off, cz = this.geo.y[i] + nz * side * off;
      if (trackD2(cx, cz) < (W / 2 + 7) ** 2 || inObs(cx, cz, 4)) continue;
      const kind = Math.random();
      if (kind < 0.3 && off > this.wallOff(i, side) + 12) {
        // low town house / café: 2-4 storeys, a coloured awning over the ground floor
        const wdt = 8 + Math.random() * 10, dep = 7 + Math.random() * 6, h = 6.5 + Math.floor(Math.random() * 3) * 3.2;
        const rad = Math.hypot(wdt, dep) / 2 + 1;
        if (trackD2(cx, cz) < (W / 2 + 6 + rad) ** 2 || inObs(cx, cz, rad)) continue;
        const yaw = -this.geo.hdg[i] + (side > 0 ? Math.PI : 0);
        d.position.set(cx, 0, cz); d.rotation.set(0, yaw, 0); d.scale.set(wdt, h, dep); d.updateMatrix();
        houses.push([d.matrix.clone(), col.set(wallCols[Math.floor(Math.random() * wallCols.length)]).clone()]);
        // the awning faces the circuit (local -z side of the house = towards the track)
        d.position.set(cx + nx * side * -(dep / 2 + 0.9), 2.9, cz + nz * side * -(dep / 2 + 0.9)); d.scale.set(wdt * 0.85, 1, 1.8); d.updateMatrix();
        awnings.push([d.matrix.clone(), col.set(awnCols[Math.floor(Math.random() * awnCols.length)]).clone()]);
        (this.obstacles ||= []).push({ x: cx, z: cz, r: rad, h });
      } else if (kind < 0.42) {
        // a pair of palms
        for (let k = 0; k < 2; k++) {
          const px = cx + tx * k * 6, pz = cz + tz * k * 6;
          if (trackD2(px, pz) < (W / 2 + 6) ** 2 || inObs(px, pz, 1.5)) continue;
          d.position.set(px, 0, pz); d.rotation.set(0, Math.random() * 6, 0); d.scale.setScalar(0.8 + Math.random() * 0.45); d.updateMatrix(); palms.push(d.matrix.clone());
        }
      } else if (kind < 0.7) {
        // row of parked cars, nose to tail along the street
        const n = 3 + Math.floor(Math.random() * 5), yaw = -this.geo.hdg[i] + (Math.random() < 0.5 ? 0 : Math.PI);
        for (let k = 0; k < n; k++) {
          const px = cx + tx * (k - n / 2) * 5.2, pz = cz + tz * (k - n / 2) * 5.2;
          if (Math.random() < 0.15 || trackD2(px, pz) < (W / 2 + 6) ** 2 || inObs(px, pz, 2)) continue;
          d.position.set(px, 0, pz); d.rotation.set(0, yaw + (Math.random() - 0.5) * 0.05, 0); d.scale.setScalar(0.9 + Math.random() * 0.2); d.updateMatrix();
          cars.push([d.matrix.clone(), col.set(carCols[Math.floor(Math.random() * carCols.length)]).clone()]);
        }
      } else if (kind < 0.88) {
        // plaza: paving with planters at the corners
        const s = 12 + Math.random() * 18;
        if (inObs(cx, cz, s * 0.6)) continue;
        d.position.set(cx, -0.2, cz); d.rotation.set(0, -this.geo.hdg[i], 0); d.scale.set(s, 1, s); d.updateMatrix(); plazas.push(d.matrix.clone());
        for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          const px = cx + (tx * a + nx * b) * s * 0.38, pz = cz + (tz * a + nz * b) * s * 0.38;
          d.position.set(px, 0, pz); d.rotation.set(0, Math.random() * 6, 0); d.scale.setScalar(0.85 + Math.random() * 0.4); d.updateMatrix(); planters.push(d.matrix.clone());
        }
      } else {
        // a line of planters along the pavement
        for (let k = 0; k < 4; k++) {
          const px = cx + tx * k * 7, pz = cz + tz * k * 7;
          if (trackD2(px, pz) < (W / 2 + 6) ** 2 || inObs(px, pz, 2)) continue;
          d.position.set(px, 0, pz); d.rotation.set(0, Math.random() * 6, 0); d.scale.setScalar(0.85 + Math.random() * 0.4); d.updateMatrix(); planters.push(d.matrix.clone());
        }
      }
    }
    const vc = (g, hex) => { const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let k = 0; k < n; k++) a.set([c.r, c.g, c.b], k * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k); return g.index ? g.toNonIndexed() : g; };
    const add = (geo, mat, list, colors) => {
      if (!list.length) return;
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((m, k) => { im.setMatrixAt(k, colors ? m[0] : m); if (colors) im.setColorAt(k, m[1]); });
      im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); this.scene.add(im);
    };
    // parked car: body (instance colour, white vertex colour) + dark glasshouse, wheels, lamps
    {
      const parts = [
        vc(new THREE.BoxGeometry(4.3, 0.75, 1.75).translate(0, 0.55, 0), 0xffffff),
        vc(new THREE.BoxGeometry(2.3, 0.6, 1.55).translate(-0.25, 1.2, 0), 0x1a1f26),
        vc(new THREE.BoxGeometry(2.1, 0.08, 1.5).translate(-0.25, 1.52, 0), 0xffffff),
        ...[[1.35, 0.8], [1.35, -0.8], [-1.35, 0.8], [-1.35, -0.8]].map(([x, z]) => vc(new THREE.CylinderGeometry(0.33, 0.33, 0.24, 12).rotateX(Math.PI / 2).translate(x, 0.33, z), 0x111214)),
        vc(new THREE.BoxGeometry(0.05, 0.12, 1.4).translate(2.16, 0.7, 0), 0xe8e8e0), vc(new THREE.BoxGeometry(0.05, 0.12, 1.4).translate(-2.16, 0.72, 0), 0x8a1010),
      ];
      const g = mergeGeometries(parts, false);
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.45 });
      add(g, mat, cars, true);
    }
    // planter: stone tub, shrub crown
    {
      const g = mergeGeometries([vc(new THREE.CylinderGeometry(0.75, 0.65, 0.7, 10).translate(0, 0.35, 0), 0xb8b0a2), vc(new THREE.CylinderGeometry(0.08, 0.1, 1.4, 6).translate(0, 1.2, 0), 0x4a3a2a), vc(new THREE.IcosahedronGeometry(1.15, 1).scale(1, 0.85, 1).translate(0, 2.3, 0), 0x3d6a32)], false);
      add(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), planters);
    }
    // town house: wall block (instance colour) with window bands, a terracotta roof slab
    {
      const win = canvasTex(128, 128, (c, w, h) => {
        c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
        for (let y = 0; y < 3; y++) for (let x = 0; x < 4; x++) { const X = 10 + x * 30, Y = 14 + y * 40; c.fillStyle = '#3a3f46'; c.fillRect(X, Y, 16, 24); c.fillStyle = '#5b7a52'; c.fillRect(X - 3, Y, 3, 24); c.fillRect(X + 16, Y, 3, 24); }
      });
      win.wrapS = win.wrapT = THREE.RepeatWrapping;
      const wall = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
      // windows repeat with the size of the block (uv stretched in the vertex shader via scale)
      const roof = vc(new THREE.BoxGeometry(1.04, 0.06, 1.04).translate(0, 1.03, 0), 0xb0563a);
      const body = vc(wall, 0xffffff);
      const g = mergeGeometries([body, roof], false);
      const uvA = new Float32Array(g.attributes.position.count * 2);
      const P = g.attributes.position.array, Nn = g.attributes.normal.array;
      for (let k = 0; k < g.attributes.position.count; k++) { const ax = Math.abs(Nn[k * 3]) > 0.5; uvA[k * 2] = ax ? P[k * 3 + 2] + 0.5 : P[k * 3] + 0.5; uvA[k * 2 + 1] = Math.abs(Nn[k * 3 + 1]) > 0.5 || P[k * 3 + 1] > 1.0 ? 0.02 : P[k * 3 + 1]; }
      g.setAttribute('uv', new THREE.BufferAttribute(uvA, 2));
      const m = new THREE.MeshStandardMaterial({ vertexColors: true, map: win, roughness: 0.9 });
      add(g, m, houses, true);
      const aw = mergeGeometries([vc(new THREE.BoxGeometry(1, 0.08, 1).rotateX(-0.28).translate(0, 0.25, 0), 0xffffff), vc(new THREE.BoxGeometry(1, 0.35, 0.03).translate(0, 0.0, -0.5), 0xffffff)], false);
      add(aw, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }), awnings, true);
    }
    // palm: slim trunk, a crown of drooping fronds (flattened cones)
    {
      const parts = [vc(new THREE.CylinderGeometry(0.16, 0.26, 7.5, 6).translate(0, 3.75, 0), 0x8a7356)];
      for (let k = 0; k < 6; k++) parts.push(vc(new THREE.ConeGeometry(0.5, 3.6, 4).scale(1, 1, 0.25).rotateZ(-Math.PI / 2 - 0.35).translate(1.7, 7.2, 0).rotateY((k / 6) * Math.PI * 2), 0x3f6b2e));
      add(mergeGeometries(parts, false), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), palms);
    }
    // plaza paving: stone setts in a fan pattern with a darker border
    {
      const tex = canvasTex(256, 256, (c, w, h) => {
        c.fillStyle = '#a49b8d'; c.fillRect(0, 0, w, h);
        for (let y = 0; y < h; y += 8) for (let x = (y / 8) % 2 ? 4 : 0; x < w; x += 8) { const v = 140 + Math.random() * 40; c.fillStyle = `rgb(${v},${v - 8},${v - 20})`; c.fillRect(x + 0.5, y + 0.5, 7, 7); }
        c.strokeStyle = '#6e675d'; c.lineWidth = 14; c.strokeRect(7, 7, w - 14, h - 14);
      });
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      const g = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0.21, 0);
      const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -1 });
      add(g, m, plazas);
    }
  }

  // night level of the circuit lighting (0 = off by day, 1 = full night)
  setLampLevel(n) {
    this._lampN = n;
    const R = this._lampRig;
    if (R) {
      R.poleMat.emissiveIntensity = 2 * n; R.beamMat.uniforms.uAmt.value = R.beam0 * n; R.amb.intensity = 0.22 * n;
      if (this.poolMat) { this.poolMat.opacity = 0.22 * n; this.poolMat.visible = n > 0.02; }
      R.beamMat.visible = n > 0.02;
    }
    if (this._pitNight) {
      const P = this._pitNight;
      P.spill.opacity = 0.5 * n; P.spillMesh.visible = n > 0.02;
      if (this._pitGlow) this._pitGlow.value = 0.3 + 0.45 * n;
      if (P.glass) P.glass.emissiveIntensity = 0.8 * n;
      if (P.art) P.art.emissiveIntensity = 0.32 + 0.3 * n;
    }
    if (this._sm?.back?.emissiveMap) { this._sm.back.emissiveIntensity = 1.4 * n;
    }
  }

  // night pit lane: light spilling out of every lit garage onto the working lane, canopy
  // floodlights over the fast lane; the camera-following point lights also visit the pits
  buildPitNight() {
    if (!this.nightable || !this.pitBays?.length || this.open) return;
    const pools = [], q = new THREE.Quaternion(), d = new THREE.Object3D();
    const bw = this.geo.ds * 3;
    for (const b of this.pitBays) {
      const p = this.pose(b.q, (this.pitBack + this.pit.fl1) / 2 + 0.6);
      q.setFromEuler(new THREE.Euler(0, -p.h, 0));
      pools.push(new THREE.Matrix4().compose(new THREE.Vector3(p.x, (p.y || 0) + 0.07, p.z), q, new THREE.Vector3(bw * 1.05, 1, 9.5)));
    }
    for (let k = 0; k < this.pitBays.length; k += 3) {
      const b = this.pitBays[k], p = this.pose(b.q, this.pitBack - 1);
      (this.nightLamps ||= []).push(new THREE.Vector3(p.x, (p.y || 0) + 7, p.z));
    }
    // garage spill: bright at the door, fading out across the lane (warm white)
    const tex = canvasTex(64, 128, (c, w, h) => {
      const im = c.createImageData(w, h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const v = 1 - y / (h - 1), u = x / (w - 1); // v (uv): 0 = garage door .. 1 = fast lane
        const lat = Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, (u - 0.04) / 0.92))), 0.6 + v * 1.4);
        const a = Math.pow(1 - v, 1.7) * lat;
        const k = (y * w + x) * 4; im.data[k] = 255; im.data[k + 1] = 236; im.data[k + 2] = 206; im.data[k + 3] = Math.round(255 * a);
      }
      c.putImageData(im, 0, 0);
    });
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    const spill = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, fog: true });
    // plane: u along the building (x), v from the garage (+z local = away from the track) to the lane
    const g = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const im = new THREE.InstancedMesh(g, spill, pools.length);
    pools.forEach((m, k) => im.setMatrixAt(k, m)); im.computeBoundingSphere(); im.renderOrder = 1; this.scene.add(im);
    this._pitNight = { spill, spillMesh: im, glass: this._pitGlass, art: this._pitArt };
    if (!this.lampLights && !this.low) { this.lampLights = [0, 1, 2, 3].map(() => { const l = new THREE.PointLight(0xfff0d8, 0, 55, 2); this.scene.add(l); return l; }); }
  }

  // ---- pit lane ---------------------------------------------------------------------------
  // Pit wall with debris fence and team stands (monitors, seated engineers), garages with lit
  // team-coloured interiors (back-wall artwork, tyre stacks, trolleys, data station, staff),
  // name boards over the doors, box markings, pit exit light and speed-limit board.
  // Bays are 3 samples wide; team k owns bays 2k, 2k+1 counted from the pit exit. Everything
  // is merged into a few meshes (vertex colours + two texture atlases): ~12 draw calls.
  buildPitLane(street) {
    if (!this.pit || this.open) return;
    const N = this.geo.N, W = this.TW, P = this.pitSpan, pit = this.pit, ds = this.geo.ds;
    const teams = this.teamList || [];
    const F = this.pitBack, bw = ds * 3;
    const d = new THREE.Object3D();
    const frame = (q) => { const i = ((Math.round(q) % N) + N) % N; this.placeAt(d, q, 0, this.geo.h ? this.geo.h[i] : 0); d.updateMatrix(); return d.matrix.clone(); };
    const G = { shell: [], glass: [], roof: [], vc: [], glow: [], art: [], head: [], screen: [], mark: [] };
    const col = new THREE.Color();
    const put = (list, geo, M, color) => {
      for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
      if (color != null) { col.set(color); const n = geo.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; } geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); }
      geo.applyMatrix4(M); list.push(geo);
    };
    const box = (w, h, dd, x, y, z) => new THREE.BoxGeometry(w, h, dd).translate(x, y, z);
    // plane facing the pit lane (-z local) with its uv mapped onto an atlas tile
    const tilePlane = (w, h, x, y, z, tile, cols, rows, facePos = false) => {
      const g = new THREE.PlaneGeometry(w, h); if (!facePos) g.rotateY(Math.PI); g.translate(x, y, z);
      const uv = g.attributes.uv, cx = tile % cols, cy = Math.floor(tile / cols);
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (cx + uv.getX(i)) / cols, 1 - (cy + 1 - uv.getY(i)) / rows);
      return g;
    };
    // ---- texture atlases: garage back walls (4x4 tiles of 512x256), door name boards (4x8 of 256x64)
    const nT = Math.min(15, teams.length);
    const lumaOf = (hex) => { const c = new THREE.Color(hex); return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b; };
    const artTex = canvasTex(2048, 1024, (c) => {
      for (let t = 0; t < 16; t++) {
        const x0 = (t % 4) * 512, y0 = Math.floor(t / 4) * 256; c.save(); c.beginPath(); c.rect(x0, y0, 512, 256); c.clip(); c.translate(x0, y0);
        if (t === 15 || t >= nT) { // closed shutter
          c.fillStyle = '#b9bec4'; c.fillRect(0, 0, 512, 256); c.fillStyle = 'rgba(0,0,0,0.16)'; for (let y = 0; y < 256; y += 9) c.fillRect(0, y, 512, 2);
          c.fillStyle = 'rgba(255,255,255,0.25)'; for (let y = 4; y < 256; y += 9) c.fillRect(0, y, 512, 1); c.restore(); continue;
        }
        const T = teams[t], L = T.livery, name = String(T.sponsor || T.team).toUpperCase();
        c.fillStyle = '#dfe3e8'; c.fillRect(0, 0, 512, 256);
        c.fillStyle = 'rgba(0,0,0,0.08)'; for (let x = 0; x < 512; x += 64) c.fillRect(x, 0, 2, 140);
        c.fillStyle = L.primary; c.fillRect(0, 120, 512, 136);
        c.fillStyle = L.secondary; c.fillRect(0, 112, 512, 10); c.fillStyle = L.accent || '#111'; c.fillRect(0, 122, 512, 4);
        c.fillStyle = lumaOf(L.primary) > 0.6 ? '#111' : '#fff'; let size = 70; c.font = `italic 900 ${size}px "Exo 2", sans-serif`;
        while (c.measureText(name).width > 440 && size > 26) { size -= 4; c.font = `italic 900 ${size}px "Exo 2", sans-serif`; }
        c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(name, 256, 190);
        c.fillStyle = L.primary; c.font = 'italic 900 34px "Exo 2", sans-serif'; c.fillText(name, 256, 62);
        c.restore();
      }
    });
    artTex.wrapS = artTex.wrapT = THREE.ClampToEdgeWrapping;
    const headTex = canvasTex(1024, 512, (c) => {
      for (let t = 0; t < 32; t++) {
        const x0 = (t % 4) * 256, y0 = Math.floor(t / 4) * 64; c.save(); c.beginPath(); c.rect(x0, y0, 256, 64); c.clip(); c.translate(x0, y0);
        const T = t < nT ? teams[t] : null; const L = T ? T.livery : { primary: '#1b1e24', secondary: '#3a3f47', accent: '#e10600' };
        c.fillStyle = L.primary; c.fillRect(0, 0, 256, 64); c.fillStyle = L.accent || '#111'; c.fillRect(0, 56, 256, 8); c.fillStyle = L.secondary; c.fillRect(0, 0, 14, 64);
        const name = T ? String(T.sponsor || T.team).toUpperCase() : 'APEX TV';
        c.fillStyle = lumaOf(L.primary) > 0.6 ? '#111' : '#fff'; let size = 40; c.font = `italic 900 ${size}px "Exo 2", sans-serif`;
        while (c.measureText(name).width > 220 && size > 14) { size -= 2; c.font = `italic 900 ${size}px "Exo 2", sans-serif`; }
        c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(name, 135, 30); c.restore();
      }
    });
    headTex.wrapS = headTex.wrapT = THREE.ClampToEdgeWrapping;
    // timing / telemetry screens (one shared image)
    const scrTex = canvasTex(512, 256, (c, w, h) => {
      c.fillStyle = '#05080d'; c.fillRect(0, 0, w, h);
      for (let r = 0; r < 12; r++) { c.fillStyle = r % 2 ? '#0d1520' : '#0a1018'; c.fillRect(6, 8 + r * 19, 240, 18); c.fillStyle = '#e8eef5'; c.fillRect(12, 14 + r * 19, 14, 6); c.fillStyle = ['#ff3b30', '#00d2be', '#1e41ff', '#ff8700', '#ffffff', '#ffd400'][r % 6]; c.fillRect(32, 12 + r * 19, 4, 12); c.fillStyle = '#c9d4e0'; c.fillRect(42, 14 + r * 19, 60 + (r * 37) % 50, 6); c.fillStyle = r % 3 ? '#4cd964' : '#bf5af2'; c.fillRect(190, 14 + r * 19, 46, 6); }
      c.strokeStyle = '#00d2ff'; c.lineWidth = 3; c.beginPath(); for (let k = 0; k <= 60; k++) { const a = k / 60 * Math.PI * 2; const r = 70 + 18 * Math.sin(a * 3) + 10 * Math.cos(a * 5); const px = 380 + Math.cos(a) * r * 0.9, py = 90 + Math.sin(a) * r * 0.55; k ? c.lineTo(px, py) : c.moveTo(px, py); } c.stroke();
      c.strokeStyle = '#ffd400'; c.lineWidth = 2; c.beginPath(); for (let x = 260; x < 506; x += 4) { const y = 220 - 40 * Math.abs(Math.sin(x * 0.05)) - 10 * Math.sin(x * 0.21); x === 260 ? c.moveTo(x, y) : c.lineTo(x, y); } c.stroke();
    });
    scrTex.wrapS = scrTex.wrapT = THREE.ClampToEdgeWrapping;
    // ---- bays: team k gets bays 2k, 2k+1 from the exit end
    const bays = [];
    for (let q = P - 2; q >= -P + 2; q -= 3) {
      this.placeAt(d, q, F + 7);
      if (!this.clearOfTrack(d.position.x, d.position.z, W / 2 + 9)) continue;
      bays.push({ q, team: -1 });
    }
    bays.forEach((b, k) => { const t = Math.floor(k / 2); if (t < nT) b.team = t; });
    this.pitBays = bays;
    const staff = [];
    const person = (x, z, face, q, colr, sit = 0) => { staff.push({ q, x, z, face, color: colr, sit }); };
    for (const b of bays) {
      const M = frame(b.q), T = b.team >= 0 ? teams[b.team] : null;
      const tc = T ? T.livery.primary : '#4b5058', tc2 = T ? T.livery.secondary : '#8a9097';
      // building shell: pillars, lintel, first-floor slab, back wall
      put(G.shell, box(0.8, 5.0, 14, -bw / 2, 2.5, F + 7), M); put(G.shell, box(0.8, 5.0, 14, bw / 2, 2.5, F + 7), M);
      put(G.shell, box(bw, 1.0, 0.5, 0, 4.5, F + 0.25), M);
      put(G.shell, box(bw, 0.5, 14, 0, 5.2, F + 7), M);
      put(G.shell, box(bw, 5.0, 0.4, 0, 2.5, F + 13.8), M);
      put(G.glass, box(bw, 3.3, 12.4, 0, 7.1, F + 7.6), M);
      put(G.roof, box(bw + 0.05, 0.45, 15, 0, 8.95, F + 6.8), M);
      put(G.head, tilePlane(bw - 1.4, 0.72, 0, 4.5, F - 0.02, T ? b.team : 31, 4, 8), M);
      if (!T) { put(G.art, tilePlane(bw - 0.8, 4.0, 0, 2.0, F + 0.35, 15, 4, 4), M); continue; }
      // interior: epoxy floor with team stripe, white partitions, dark ceiling with light strips
      const iw = bw - 0.8;
      put(G.vc, box(iw, 0.04, 9.6, 0, 0.02, F + 4.8), M, '#c8ccd2');
      put(G.vc, box(iw, 0.045, 0.6, 0, 0.025, F + 0.8), M, tc);
      for (const sx of [-1, 1]) {
        const wx = sx * (bw / 2 - 0.42);
        put(G.vc, box(0.08, 4.0, 9.4, wx, 2.0, F + 4.9), M, '#aeb4bc');
        put(G.vc, box(0.1, 0.32, 9.4, wx - sx * 0.01, 2.75, F + 4.9), M, tc);             // team band
        put(G.vc, box(0.1, 0.18, 9.4, wx - sx * 0.01, 0.09, F + 4.9), M, '#2a2d33');       // skirting
        // tool cabinets with drawer fronts and a worktop
        const cx = sx * (bw / 2 - 0.8);
        put(G.vc, box(0.6, 0.95, 2.8, cx, 0.48, F + 3.2), M, '#1d2025');
        put(G.vc, box(0.64, 0.05, 2.84, cx, 0.98, F + 3.2), M, '#a9afb7');
        for (let dr = 0; dr < 4; dr++) put(G.vc, box(0.02, 0.025, 2.6, cx - sx * 0.31, 0.25 + dr * 0.2, F + 3.2), M, '#8c939b');
        put(G.vc, box(0.02, 0.9, 0.03, cx - sx * 0.31, 0.48, F + 3.2), M, tc);
        // wall-mounted monitor above the bench
        put(G.vc, box(0.06, 0.62, 1.0, wx - sx * 0.05, 1.85, F + 3.2), M, '#0c0d10');
      }
      // overhead gantry with timing screens facing the pit lane
      put(G.vc, box(iw - 1.2, 0.14, 0.35, 0, 3.35, F + 2.0), M, '#1a1c20');
      for (const sx of [-0.6, 0.6]) { put(G.vc, box(0.04, 0.3, 0.04, sx, 3.15, F + 2.0), M, '#1a1c20'); put(G.screen, tilePlane(1.05, 0.62, sx, 2.75, F + 1.9, 0, 1, 1), M); }
      put(G.vc, box(iw, 0.06, 9.6, 0, 4.0, F + 4.8), M, '#23262b');
      for (const z of [1.6, 4.6, 7.6]) put(G.glow, box(iw - 1.6, 0.05, 0.22, 0, 3.95, F + z), M);
      put(G.art, tilePlane(iw, 4.0, 0, 2.0, F + 9.6, b.team, 4, 4), M);
      // tyre sets in team-coloured blankets, trolleys, data station with screens
      for (const sx of [-1, 1]) for (const ox of [1.3, 2.2]) for (let k = 0; k < 4; k++) put(G.vc, new THREE.CylinderGeometry(0.34, 0.34, 0.3, 12).translate(sx * (bw / 2 - ox), 0.17 + k * 0.33, F + 8.7), M, k % 2 ? tc : tc2);
      for (const sx of [-1, 1]) { put(G.vc, box(1.1, 0.95, 0.6, sx * (bw / 2 - 1.3), 0.5, F + 5.6), M, tc); put(G.vc, box(1.14, 0.05, 0.64, sx * (bw / 2 - 1.3), 1.0, F + 5.6), M, '#1a1c20'); }
      put(G.vc, box(2.6, 1.6, 0.6, 0, 0.8, F + 9.1), M, '#1b1e23');
      for (const sx of [-0.55, 0.55]) put(G.screen, tilePlane(1.0, 0.6, sx, 2.05, F + 9.05, 0, 1, 1), M);
      // a car-cover rack / jacks by the door
      put(G.vc, box(0.25, 0.25, 1.4, -bw / 2 + 1.0, 0.13, F + 1.4), M, '#d8d8d8');
      // staff inside the garage
      person(-bw / 2 + 1.6, F + 7.0, 0, b.q, tc); person(bw / 2 - 2.0, F + 3.2, -0.6, b.q, tc); person(0.6, F + 8.3, 3.1, b.q, '#222831');
    }
    // ---- pit wall: concrete wall + debris fence; team stands with canopy, monitors, engineers
    {
      const concrete = new THREE.MeshStandardMaterial({ color: 0xd9dcdf, roughness: 0.8 });
      const wallG = [];
      const vs = (q0, q1, off, y0, y1, flip) => { const pos = [], uv = [], idx = []; for (let q = q0, n = 0; q <= q1; q++, n++) { const i = ((q % N) + N) % N; const nx = -Math.sin(this.geo.hdg[i]), nz = Math.cos(this.geo.hdg[i]); const hh = this.geo.h ? this.geo.h[i] : 0; const px = this.geo.x[i] + nx * off, pz = this.geo.y[i] + nz * off; pos.push(px, hh + y0, pz, px, hh + y1, pz); uv.push(n * ds / 3, 0, n * ds / 3, 1); if (q < q1) { const k = n * 2; flip ? idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2) : idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); } } const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g; };
      const q0 = -P - 3, q1 = P + 3, a = pit.wall - 0.3, b2 = pit.wall + 0.3;
      wallG.push(vs(q0, q1, a, 0, 1.05, false), vs(q0, q1, b2, 0, 1.05, true));
      { const pos = [], uv = [], idx = []; for (let q = q0, n = 0; q <= q1; q++, n++) { const i = ((q % N) + N) % N; const nx = -Math.sin(this.geo.hdg[i]), nz = Math.cos(this.geo.hdg[i]); for (const o of [a, b2]) pos.push(this.geo.x[i] + nx * o, 1.05, this.geo.y[i] + nz * o); uv.push(0, 0, 1, 0); if (q < q1) { const k = n * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); } } const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); wallG.push(g); }
      const wm = new THREE.Mesh(mergeGeometries(wallG), concrete); wm.castShadow = true; wm.receiveShadow = true; this.scene.add(wm);
      const fenceTex = canvasTex(128, 128, (c, w, h) => { c.clearRect(0, 0, w, h); c.strokeStyle = 'rgba(205,210,214,0.95)'; c.lineWidth = 3; for (let k = -w; k < w * 2; k += 32) { c.beginPath(); c.moveTo(k, 0); c.lineTo(k + h, h); c.stroke(); c.beginPath(); c.moveTo(k, h); c.lineTo(k + h, 0); c.stroke(); } });
      fenceTex.repeat.set(1, 2);
      const fm = new THREE.Mesh(vs(q0, q1, pit.wall - 0.15, 1.05, 3.9, false), new THREE.MeshStandardMaterial({ map: fenceTex, alphaTest: 0.35, metalness: 0.6, roughness: 0.5, side: THREE.DoubleSide }));
      fm.castShadow = true; this.scene.add(fm);
      // fence posts
      const posts = []; for (let q = q0; q <= q1; q += 2) { this.placeAt(d, q, pit.wall - 0.15, 1.05); d.scale.set(1, 1, 1); d.updateMatrix(); posts.push(d.matrix.clone()); }
      const pm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.05, 2.9, 6).translate(0, 1.45, 0), new THREE.MeshStandardMaterial({ color: 0x8a9096, metalness: 0.8, roughness: 0.45 }), posts.length);
      posts.forEach((m, k) => pm.setMatrixAt(k, m)); pm.castShadow = true; this.scene.add(pm);
      // team stands on the pit-lane side of the wall, centred on each team's pair of bays
      for (let t = 0; t < nT; t++) {
        const own = bays.filter((b) => b.team === t); if (!own.length) continue;
        const qc = own.reduce((s2, b) => s2 + b.q, 0) / own.length;
        const M = frame(qc), L = teams[t].livery, z0 = pit.wall + 0.3;
        put(G.vc, box(7.0, 1.05, 1.2, 0, 0.53, z0 + 0.6), M, '#2a2e35');
        put(G.vc, box(7.0, 0.05, 1.3, 0, 1.08, z0 + 0.62), M, '#e6e8eb');
        for (const sx of [-3.3, 3.3]) put(G.vc, box(0.12, 3.2, 0.12, sx, 1.6, z0 + 0.15), M, '#5a5f66');
        put(G.vc, box(7.6, 0.16, 2.1, 0, 3.25, z0 + 1.0), M, L.primary);
        put(G.vc, box(7.6, 0.3, 0.06, 0, 3.05, z0 + 2.04), M, L.secondary);
        put(G.head, tilePlane(4.2, 0.5, 0, 2.85, z0 + 2.08, t, 4, 8, true), M);
        put(G.head, tilePlane(4.2, 0.5, 0, 3.6, z0 - 0.02, t, 4, 8), M);
        for (let k = 0; k < 4; k++) { const x = -2.4 + k * 1.6; put(G.vc, box(0.06, 0.5, 0.06, x, 1.35, z0 + 0.35), M, '#202328'); put(G.screen, tilePlane(0.95, 0.55, x, 1.75, z0 + 0.4, 0, 1, 1, true), M); person(x, z0 + 1.55, Math.PI, qc, k % 2 ? L.primary : '#20242b', 1); }
      }
    }
    // ---- box markings in the working lane: yellow box outline + white stop T per bay
    {
      const mk = canvasTex(256, 512, (c, w, h) => {
        c.clearRect(0, 0, w, h); c.strokeStyle = 'rgba(255,214,10,0.95)'; c.lineWidth = 7; c.strokeRect(w * 0.12, h * 0.22, w * 0.76, h * 0.56);
        c.fillStyle = 'rgba(245,245,245,0.95)'; c.fillRect(w * 0.3, h * 0.26 - 10, w * 0.4, 10); c.fillRect(w * 0.48, h * 0.26, 10, h * 0.12);
        c.fillStyle = 'rgba(255,214,10,0.9)'; for (const y of [0.3, 0.7]) c.fillRect(w * 0.88, h * y, w * 0.12, 6);
      });
      mk.wrapS = THREE.ClampToEdgeWrapping; mk.wrapT = THREE.RepeatWrapping;
      const qa = Math.min(...bays.map((b) => b.q)) - 1.5, qb = Math.max(...bays.map((b) => b.q)) + 1.5;
      if (bays.length) {
        const m = this.laneStrip(Math.floor(qa), Math.ceil(qb), () => pit.wl0 + 0.1, () => pit.wl1, 0.042, new THREE.MeshStandardMaterial({ map: mk, transparent: true, depthWrite: false, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 }), 0, (q, side) => [side, (q - qa) / 3]);
        this.scene.add(m);
      }
    }
    // ---- merge and add
    const shellMat = new THREE.MeshStandardMaterial({ color: 0xd3d8de, roughness: 0.5, metalness: 0.2 });
    // first-floor glazing: tinted panes with mullions and transoms (lit offices at night)
    const glassTex = canvasTex(256, 128, (c, w, h) => {
      const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#2a3b52'); g.addColorStop(0.6, '#152233'); g.addColorStop(1, '#1d2c40'); c.fillStyle = g; c.fillRect(0, 0, w, h);
      c.fillStyle = 'rgba(255,255,255,0.06)'; for (let x = 0; x < w; x += 32) c.fillRect(x + 4, 0, 10, h);
      c.fillStyle = '#c9ced5'; for (let x = 0; x < w; x += 32) c.fillRect(x, 0, 3, h); c.fillRect(0, h * 0.62, w, 3); c.fillRect(0, 0, w, 4); c.fillRect(0, h - 4, w, 4);
    });
    const glassMat = new THREE.MeshStandardMaterial({ map: glassTex, roughness: 0.1, metalness: 0.7, ...(this.nightable ? { emissive: 0x6a5a40, emissiveMap: glassTex, emissiveIntensity: this.night ? 0.8 : 0 } : {}) }); this._pitGlass = this.nightable ? glassMat : null;
    // roof: ribbed panels, AC units and skylights, white parapet edge
    const roofTex = canvasTex(256, 256, (c, w, h) => {
      c.fillStyle = '#7d848d'; c.fillRect(0, 0, w, h);
      c.fillStyle = 'rgba(0,0,0,0.18)'; for (let x = 0; x < w; x += 16) c.fillRect(x, 0, 2, h);
      c.fillStyle = '#c9ced4'; c.fillRect(30, 60, 40, 30); c.fillRect(150, 140, 50, 36); c.fillStyle = '#4a5058'; c.beginPath(); c.arc(50, 75, 11, 0, 7); c.arc(175, 158, 13, 0, 7); c.fill();
      c.fillStyle = 'rgba(160,190,215,0.55)'; c.fillRect(96, 30, 28, 70); c.fillRect(96, 170, 28, 60);
      c.fillStyle = '#e8e8e8'; c.fillRect(0, h - 14, w, 14); c.fillRect(0, 0, w, 8); c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(0, h - 16, w, 2);
    });
    const roofMat = new THREE.MeshStandardMaterial({ map: roofTex, roughness: 0.6, metalness: 0.3 });
    const glowK = { value: this.night ? 0.55 : 0.3 }; this._pitGlow = glowK;
    const vcMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.05 });
    vcMat.onBeforeCompile = (sh) => { sh.uniforms.uGlow = glowK; sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uGlow;').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * uGlow;'); };
    vcMat.customProgramCacheKey = () => 'pitvc';
    const lit = (map, k) => new THREE.MeshStandardMaterial({ map, roughness: 0.55, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: k });
    const out = [
      [G.shell, shellMat, true], [G.glass, glassMat, false], [G.roof, roofMat, true], [G.vc, vcMat, true],
      [G.glow, new THREE.MeshBasicMaterial({ color: 0xfff7e8 }), false], [G.art, (this._pitArt = lit(artTex, this.night ? 0.55 : 0.32)), false],
      [G.head, lit(headTex, this.night ? 0.6 : 0.2), false], [G.screen, new THREE.MeshBasicMaterial({ map: scrTex }), false],
    ];
    for (const [list, mat, cast] of out) {
      if (!list.length) continue;
      const g = mergeGeometries(list); if (!g) continue;
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, mat); m.castShadow = cast; m.receiveShadow = true; this.scene.add(m);
    }
    // the building blocks camera placement / trees like the old segments did
    for (const b of bays) { this.placeAt(d, b.q, F + 7); this.obstacles?.push({ x: d.position.x, z: d.position.z, r: 11, h: 9.5, hl: bw / 2 + 0.3, hd: 7.6, rot: d.rotation.y }); }
    // ---- pit exit light (green, red when a car is about to be released into traffic) and the
    // speed-limit board at the entry
    {
      const g = new THREE.Group();
      const dark = new THREE.MeshStandardMaterial({ color: 0x1b1d21, roughness: 0.5, metalness: 0.4 });
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 3.2, 0.16).translate(0, 1.6, 0), dark));
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.0, 0.45).translate(0, 3.5, 0), dark));
      this.pitLightG = new THREE.MeshStandardMaterial({ color: 0x0a3a10, emissive: 0x22ff44, emissiveIntensity: 2.4 });
      this.pitLightR = new THREE.MeshStandardMaterial({ color: 0x3a0a0a, emissive: 0xff2020, emissiveIntensity: 0 });
      const lens = new THREE.CylinderGeometry(0.13, 0.13, 0.06, 16).rotateZ(Math.PI / 2);
      const r = new THREE.Mesh(lens, this.pitLightR); r.position.set(-0.17, 3.75, 0); g.add(r);
      const gr = new THREE.Mesh(lens, this.pitLightG); gr.position.set(-0.17, 3.3, 0); g.add(gr);
      this.placeAt(g, P + 3, pit.wall + 0.6, this.geo.h ? this.geo.h[(P + 3) % N] : 0); g.traverse((o) => { if (o.isMesh) o.castShadow = true; }); this.scene.add(g);
      const sign = canvasTex(128, 160, (c, w, h) => { c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); c.fillStyle = '#111'; c.font = '900 30px "Exo 2", sans-serif'; c.textAlign = 'center'; c.fillText('PIT', w / 2, 32); c.strokeStyle = '#d40000'; c.lineWidth = 12; c.beginPath(); c.arc(w / 2, 100, 44, 0, 7); c.stroke(); c.fillStyle = '#111'; c.font = '900 44px "Exo 2", sans-serif'; c.textBaseline = 'middle'; c.fillText('80', w / 2, 102); });
      sign.wrapS = sign.wrapT = THREE.ClampToEdgeWrapping;
      const sg = new THREE.Group();
      sg.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.2, 0.1).translate(0, 1.1, 0), dark));
      const face = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.1, 0.9), [dark, new THREE.MeshStandardMaterial({ map: sign, roughness: 0.5 }), dark, dark, dark, dark]); face.position.y = 2.6; sg.add(face);
      const qe = -P - 9; this.placeAt(sg, qe, this.pitBack - 1.5, this.geo.h ? this.geo.h[(qe + N) % N] : 0); this.scene.add(sg);
    }
    // ---- people: one instanced mesh for the static staff, one for the pit-stop crews
    const pMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });
    pMat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = TIME;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <color_vertex>', `vColor = vec3(1.0);
          #ifdef USE_COLOR
            vColor = color.rgb;
          #endif
          #ifdef USE_INSTANCING_COLOR
            if (color.r > 0.99 && color.g > 0.99 && color.b > 0.99) vColor = instanceColor.rgb;
          #endif`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float fid = float(gl_InstanceID);
          transformed.x += sin(uTime * (0.7 + fract(fid * 0.37)) + fid * 1.7) * 0.035 * max(0.0, position.y - 0.8);
          transformed.z += sin(uTime * 0.53 + fid * 2.3) * 0.02 * max(0.0, position.y - 0.8);`);
    };
    pMat.customProgramCacheKey = () => 'people';
    const ccol = new THREE.Color();
    for (const sit of [0, 1]) {
      const list = staff.filter((p) => !!p.sit === !!sit); if (!list.length) continue;
      const sm = new THREE.InstancedMesh(personGeo(sit ? 'sit' : 'staff'), pMat, list.length);
      list.forEach((p, k) => {
        const M = frame(p.q); d.position.set(p.x, sit ? 0.0 : 0, p.z); d.rotation.set(0, p.face, 0); d.scale.set(1, 1, 1); d.updateMatrix();
        sm.setMatrixAt(k, M.clone().multiply(d.matrix)); sm.setColorAt(k, ccol.set(p.color));
      });
      sm.castShadow = true; sm.receiveShadow = true; sm.computeBoundingSphere(); this.scene.add(sm);
    }
    const nCrew = Math.min(bays.length, 12) * 10;
    const crewMesh = (kind, n) => { const im = new THREE.InstancedMesh(personGeo(kind), pMat, n); im.count = 0; im.castShadow = true; im.frustumCulled = false; im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3); this.scene.add(im); return im; };
    this.crew = crewMesh('crew', nCrew); this.crewK = crewMesh('kneel', Math.ceil(nCrew / 2));
  }

  // pit crews around cars stopped in their box (wheel guns kneeling at each wheel, front and
  // rear jack, two stabilisers); crews stand ready at the box edge while their car comes in
  updatePitCrew() {
    if (!this.crew) return;
    const d = this._crewD ||= new THREE.Object3D(), col = this._crewC ||= new THREE.Color();
    let k = 0, kk = 0; const max = this.crew.instanceMatrix.count, maxK = this.crewK.instanceMatrix.count;
    const fm = this.category === 'formula' || this.category === 'junior';
    const L = fm ? 1.8 : 1.45, Wd = fm ? 1.45 : 1.35;
    for (const car of this.cars.values()) {
      const pc = car.pc; if (!pc || !car.mesh.visible || k + 10 > max || kk + 4 > maxK) continue;
      const ready = pc.phase === 'in' && pc.bayQ - pc.q < 8;
      if (!(pc.phase === 'stop' && (pc.g || 0) < 0.05) && !ready) continue;
      const m = car.mesh, tc = car.teamColor || '#dddddd';
      const h = ready ? -this.geo.hdg[((Math.round(pc.bayQ) % this.geo.N) + this.geo.N) % this.geo.N] : m.rotation.y;
      const c = Math.cos(h), s = Math.sin(h);
      const base = ready ? this.pose(((pc.bayQ % this.geo.N) + this.geo.N) % this.geo.N, this.pitBoxOff) : { x: m.position.x, z: m.position.z, y: m.position.y };
      const spots = ready
        ? [[-2.5, 2.4, 0], [-1.2, 2.5, 0], [0, 2.6, 0], [1.2, 2.5, 0], [2.4, 2.4, 0], [-2.5, -2.4, Math.PI], [-1.2, -2.5, Math.PI], [1.2, -2.5, Math.PI], [3.6, 0.8, 0], [-3.4, 0.8, 0]]
        : [[L, Wd + 0.55, 1], [-L, Wd + 0.55, 1], [L, -Wd - 0.55, 1], [-L, -Wd - 0.55, 1], [3.3, 0, 2], [-3.1, 0, 2], [0.2, 1.6, 0], [0.2, -1.6, 0], [L + 0.6, Wd + 0.5, 0], [-L - 0.6, Wd + 0.5, 0]];
      for (const [lx, lz, kind] of spots) {
        // local (lx along the car, lz to its left) -> world; figures face the car
        const wx = base.x + lx * c + lz * s, wz = base.z - lx * s + lz * c;
        d.position.set(wx, (base.y || 0) - 0.02, wz);
        const fx = base.x - wx, fz = base.z - wz; d.rotation.set(0, Math.atan2(fx, fz), 0);
        d.scale.set(1, 1, 1); d.updateMatrix();
        // wheel guns kneel at the wheels, everyone else stands
        if (kind === 1) { this.crewK.setMatrixAt(kk, d.matrix); this.crewK.setColorAt(kk, col.set(tc)); kk++; }
        else { this.crew.setMatrixAt(k, d.matrix); this.crew.setColorAt(k, col.set(tc)); k++; }
      }
    }
    for (const [im, n] of [[this.crew, k], [this.crewK, kk]]) { im.count = n; if (n) { im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; } }
  }

  // true when the straight segment a->b (world points) passes no grandstand, building or tree
  // line of sight for the airborne cameras: obstacles (stands, buildings) plus the skyline towers
  viewClear(a, b) {
    if (!this.losClear(a, b)) return false;
    const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1;
    for (const o of this.towers || []) {
      const t = Math.max(0, Math.min(1, ((o.x - a.x) * dx + (o.z - a.z) * dz) / L2)), r = Math.max(o.w, o.dp) * 0.75 + 4;
      if ((a.x + dx * t - o.x) ** 2 + (a.z + dz * t - o.z) ** 2 < r * r && a.y + (b.y - a.y) * t < o.y + o.h + 6) return false;
    }
    return true;
  }

  losClear(a, b) {
    const dx = b.x - a.x, dz = b.z - a.z, dy = b.y - a.y; const L2 = dx * dx + dz * dz || 1;
    for (const o of this.obstacles || []) {
      if (!o.h) continue;
      const t0 = Math.max(0, Math.min(1, ((o.x - a.x) * dx + (o.z - a.z) * dz) / L2));
      if ((a.x + dx * t0 - o.x) ** 2 + (a.z + dz * t0 - o.z) ** 2 > o.r * o.r) continue;
      const c = o.hl ? Math.cos(o.rot) : 0, sn = o.hl ? Math.sin(o.rot) : 0;
      for (let k = 1; k < 24; k++) {
        const t = k / 24, x = a.x + dx * t, y = a.y + dy * t, z = a.z + dz * t;
        if (y > o.h) continue;
        const ex = x - o.x, ez = z - o.z;
        if (o.hl) { if (Math.abs(ex * c - ez * sn) < o.hl && Math.abs(ex * sn + ez * c) < o.hd) return false; }
        else if (ex * ex + ez * ez < o.r * o.r * 0.7) return false;
      }
    }
    return true;
  }

  // circuit dressing: advertising hoardings on the debris fences / walls, paddock with team
  // motorhomes and hospitality behind the pits, flag poles with waving flags (all instanced
  // or merged strips: a handful of draw calls)
  buildDressing(street) {
    const N = this.geo.N, W = this.TW, st = street > 0.7;
    const brands = ['PETRONIX', 'ROLEXA', 'DHX', 'PIRELLO', 'ARAMCORE', 'HEINEKAN 0.0', 'LAVAZZO', 'ORACLO', 'MONSTRO', 'BREMBI', 'SANTANDOR', 'TAG HEUERR', 'PUMO', 'LENOVA', 'CRYPTO.CAM', 'APEX DYNASTY'];
    const cols = [['#e10600', '#fff'], ['#0b5d3b', '#e8c55a'], ['#ffd400', '#d40511'], ['#ffd400', '#111'], ['#00594f', '#fff'], ['#0b7a3a', '#fff'], ['#0a2a66', '#fff'], ['#c4161c', '#fff'], ['#111', '#7fff00'], ['#111', '#e10600'], ['#ec0000', '#fff'], ['#111', '#fff'], ['#fff', '#111'], ['#e1251b', '#fff'], ['#0b1b2b', '#fff'], ['#e10600', '#fff']];
    // atlas: 16 hoardings side by side; each spans 1/16 of u
    const adTex = canvasTex(4096, 128, (c, w, h) => {
      const bw = w / brands.length;
      brands.forEach((b, k) => {
        const [bg, fg] = cols[k % cols.length]; const x0 = k * bw;
        c.fillStyle = bg; c.fillRect(x0, 0, bw, h);
        if (k % 3 === 1) { c.fillStyle = 'rgba(255,255,255,0.12)'; c.beginPath(); c.moveTo(x0 + bw * 0.62, 0); c.lineTo(x0 + bw, 0); c.lineTo(x0 + bw, h); c.lineTo(x0 + bw * 0.5, h); c.fill(); }
        c.fillStyle = fg; let size = 82; c.font = `italic 900 ${size}px "Exo 2", sans-serif`;
        while (c.measureText(b).width > bw * 0.84 && size > 30) { size -= 4; c.font = `italic 900 ${size}px "Exo 2", sans-serif`; }
        c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(b, x0 + bw / 2, h / 2 + 4);
        c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(x0, 0, 3, h); c.fillRect(x0, h - 5, bw, 5);
      });
    });
    adTex.anisotropy = 8;
    const adMat = new THREE.MeshStandardMaterial({ map: adTex, roughness: 0.55, side: THREE.DoubleSide, emissive: 0xffffff, emissiveMap: adTex, emissiveIntensity: this.night ? 0.45 : 0.06 });
    // both faces read correctly: mirror u inside each hoarding on back faces
    adMat.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `
        vec2 auv = vMapUv; if (!gl_FrontFacing) { float cI = floor(auv.x * ${brands.length}.0); auv.x = (cI + 1.0 - fract(auv.x * ${brands.length}.0)) / ${brands.length}.0; }
        vec4 sampledDiffuseColor = texture2D(map, auv); diffuseColor *= sampledDiffuseColor;`).replace('#include <emissivemap_fragment>', '#ifdef USE_EMISSIVEMAP\n totalEmissiveRadiance *= texture2D(emissiveMap, auv).rgb;\n#endif');
    };
    adMat.customProgramCacheKey = () => 'ads';
    // hoardings run in long sections with gaps (marshal gates, access roads)
    const seg = (i) => { const b = Math.floor(i / 36); return ((b * 7919) % 5) !== 0; };
    for (const side of [1, -1]) {
      if (st) this.barrierStrip(side, 0.08, 0.72, adMat, { vRepeat: 12 * brands.length, inset: -0.04, filter: seg });
      else this.barrierStrip(side, 1.25, 2.25, adMat, { vRepeat: 11 * brands.length, inset: 0.5, filter: (i) => seg(i) && Math.min(i, N - i) > 6 });
    }
    // ---- paddock: motorhomes and hospitality units behind the pit building ----
    if (this.pitSpan && !this.open) {
      const pitBack = this.pitBack || W / 2 + 13.6;
      const teamCols = ['#dc0000', '#00d2be', '#1e41ff', '#ff8700', '#006f62', '#0090ff', '#2b4562', '#900000', '#f0f0f0', '#5e8faa'];
      const mhTex = canvasTex(256, 128, (c, w, h) => {
        c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
        c.fillStyle = '#1b2430'; c.fillRect(0, h * 0.12, w, h * 0.3); c.fillRect(0, h * 0.55, w, h * 0.3);
        c.fillStyle = 'rgba(160,200,230,0.35)'; for (let x = 0; x < w; x += 16) { c.fillRect(x, h * 0.12, 1, h * 0.3); c.fillRect(x, h * 0.55, 1, h * 0.3); }
        c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(0, h * 0.47, w, 3);
      });
      mhTex.wrapS = mhTex.wrapT = THREE.ClampToEdgeWrapping;
      const mhMat = new THREE.MeshStandardMaterial({ map: mhTex, roughness: 0.35, metalness: 0.2, ...(this.night ? { emissive: 0xfff0d0, emissiveMap: mhTex, emissiveIntensity: 0.25 } : {}) });
      const roofMat = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.5 });
      const tentMat = new THREE.MeshStandardMaterial({ color: 0xf4f4f2, roughness: 0.7, side: THREE.DoubleSide });
      const units = [], roofs = [], tents = []; const tint = []; const d = new THREE.Object3D();
      const qStep = Math.max(4, Math.round(19 / this.geo.ds));
      for (let row = 0; row < 2; row++) for (let q = -this.pitSpan + 4, k = 0; q <= this.pitSpan - 4; q += qStep, k++) {
        const off = pitBack + 14 + 9 + row * 24;
        this.placeAt(d, q, off, 0);
        if (!this.clearOfTrack(d.position.x, d.position.z, W / 2 + 10 + 8)) continue;
        if ((this.obstacles || []).some((o) => !o.hl && (o.x - d.position.x) ** 2 + (o.z - d.position.z) ** 2 < (o.r + 6) ** 2)) continue;
        const h = 7 + (k % 3 === 0 ? 3.5 : 0);
        const px = d.position.x, pz = d.position.z;
        d.scale.set(15, h, 8); d.position.y = h / 2; d.updateMatrix(); units.push(d.matrix.clone());
        tint.push(teamCols[(k + row * 5) % teamCols.length]);
        d.scale.set(15.6, 0.35, 9.2); d.position.y = h + 0.17; d.updateMatrix(); roofs.push(d.matrix.clone());
        this.obstacles.push({ x: px, z: pz, r: 10, h: h + 1 });
        if (row === 0 && k % 2 === 0) {
          this.placeAt(d, q + 1.5, off + 12, 0);
          if (this.clearOfTrack(d.position.x, d.position.z, W / 2 + 12)) { d.scale.set(7, 4.5, 7); d.position.y = 0; d.updateMatrix(); tents.push(d.matrix.clone()); }
        }
      }
      if (units.length) {
        const um = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mhMat, units.length); const cc = new THREE.Color(), wh = new THREE.Color(1, 1, 1);
        units.forEach((m, k) => { um.setMatrixAt(k, m); um.setColorAt(k, cc.set(tint[k]).lerp(wh, 0.2)); });
        um.castShadow = true; um.receiveShadow = true; this.scene.add(um);
        const rm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), roofMat, roofs.length); roofs.forEach((m, k) => rm.setMatrixAt(k, m)); rm.castShadow = true; this.scene.add(rm);
      }
      if (tents.length) {
        const tg = new THREE.ConeGeometry(0.72, 1, 4, 1, true).rotateY(Math.PI / 4).translate(0, 1.15, 0);
        const sides = new THREE.BoxGeometry(1, 0.62, 1).translate(0, 0.31, 0);
        const tm = new THREE.InstancedMesh(mergeGeometries([tg, sides].map((g) => (g.index ? g.toNonIndexed() : g))), tentMat, tents.length); tents.forEach((m, k) => tm.setMatrixAt(k, m)); tm.castShadow = true; tm.receiveShadow = true; this.scene.add(tm);
      }
    }
    // ---- street furniture: lamp posts on the pavement behind the walls, bollards ----
    if (st) {
      const lamps = [], bol = []; const d = new THREE.Object3D();
      for (let i = 0, k = 0; i < N; i += Math.max(6, Math.round(28 / this.geo.ds)), k++) {
        if (this.pitSpan && Math.min(i, N - i) < this.pitSpan + 4) continue;
        const side = k % 2 ? 1 : -1;
        const off = side * (this.wallOff(i, side) + 2.2);
        this.placeAt(d, i, off, 0, side > 0 ? 0 : Math.PI);
        if (!this.clearOfTrack(d.position.x, d.position.z, W / 2 + 2.5)) continue;
        if ((this.obstacles || []).some((o) => (o.x - d.position.x) ** 2 + (o.z - d.position.z) ** 2 < (o.hl ? 0 : o.r * o.r))) continue;
        const hy = this.geo.h ? this.geo.h[i] : 0; d.position.y = hy; d.updateMatrix(); lamps.push(d.matrix.clone());
        for (const q of [-1.2, 1.2]) { this.placeAt(d, i + q, side * (this.wallOff(i, side) + 1.1), hy); d.updateMatrix(); bol.push(d.matrix.clone()); }
      }
      if (lamps.length) {
        const pole = new THREE.CylinderGeometry(0.07, 0.11, 7, 8).translate(0, 3.5, 0);
        const arm = new THREE.CylinderGeometry(0.04, 0.04, 1.6, 6).rotateX(Math.PI / 2).translate(0, 6.9, -0.8);
        const head = new THREE.BoxGeometry(0.28, 0.14, 0.6).translate(0, 6.85, -1.55);
        const base = new THREE.CylinderGeometry(0.18, 0.22, 0.6, 8).translate(0, 0.3, 0);
        const lg = mergeGeometries([pole, arm, head, base].map((g) => (g.index ? g.toNonIndexed() : g)));
        const lm = new THREE.InstancedMesh(lg, new THREE.MeshStandardMaterial({ color: 0x2c3138, metalness: 0.7, roughness: 0.45 }), lamps.length);
        lamps.forEach((m, k) => lm.setMatrixAt(k, m)); lm.castShadow = true; this.scene.add(lm);
        const bm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.09, 0.11, 0.9, 8).translate(0, 0.45, 0), new THREE.MeshStandardMaterial({ color: 0x8a8f96, metalness: 0.6, roughness: 0.4 }), bol.length);
        bol.forEach((m, k) => bm.setMatrixAt(k, m)); this.scene.add(bm);
      }
    }
    // ---- flag poles with waving flags (grandstands, start straight, corner banks) ----
    {
      const spots = [];
      if (this.pitSpan) for (let q = -this.pitSpan; q <= this.pitSpan; q += 10) spots.push([q, -1, 4]);
      for (const cn of this.geo.corners.slice().sort((a, b) => a.r - b.r).slice(0, 6)) for (let q = -12; q <= 12; q += 6) spots.push([cn.i + q, -cn.dir, 2]);
      const poles = [], flags = [], fl = []; const d = new THREE.Object3D();
      for (const [i, side, extra] of spots) {
        const sd = side > 0 ? 1 : -1;
        const off = sd * (this.wallOff(i, sd) + extra);
        this.placeAt(d, i, off, 0);
        if (!this.clearOfTrack(d.position.x, d.position.z, W / 2 + 3)) continue;
        if ((this.obstacles || []).some((o) => (o.x - d.position.x) ** 2 + (o.z - d.position.z) ** 2 < 4)) continue;
        const hy = this.geo.h ? this.geo.h[((Math.round(i) % N) + N) % N] : 0;
        d.position.y = hy; d.scale.set(1, 1, 1); d.updateMatrix(); poles.push(d.matrix.clone());
        d.position.y = hy + 8.2; d.updateMatrix(); flags.push(d.matrix.clone()); fl.push(Math.floor(Math.random() * 8));
      }
      if (poles.length) {
        const pm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.07, 9, 6).translate(0, 4.5, 0), new THREE.MeshStandardMaterial({ color: 0xcfd3d8, metalness: 0.8, roughness: 0.35 }), poles.length);
        poles.forEach((m, k) => pm.setMatrixAt(k, m)); pm.castShadow = true; this.scene.add(pm);
        const flagTex = canvasTex(512, 64, (c, w, h) => {
          const F = [['#009246', '#fff', '#ce2b37', 'v'], ['#000', '#ffce00', '#dd0000', 'h'], ['#002395', '#fff', '#ed2939', 'v'], ['#ae1c28', '#fff', '#21468b', 'h'], ['#c60b1e', '#ffc400', '#c60b1e', 'h'], ['#ff8000', '#ff8000', '#fff', 'h'], ['#012169', '#fff', '#c8102e', 'h'], ['#ffd400', '#111', '#ffd400', 'v']];
          F.forEach(([a, b2, cc2, o], k) => { const x0 = k * 64; [a, b2, cc2].forEach((col, j) => { c.fillStyle = col; if (o === 'v') c.fillRect(x0 + j * 64 / 3, 0, 64 / 3 + 1, h); else c.fillRect(x0, j * h / 3, 64, h / 3 + 1); }); });
        });
        flagTex.wrapS = flagTex.wrapT = THREE.ClampToEdgeWrapping;
        const fg = new THREE.PlaneGeometry(2.2, 1.4, 10, 1).translate(1.1, 0, 0);
        fg.setAttribute('aFlag', new THREE.InstancedBufferAttribute(new Float32Array(fl), 1));
        const fm = new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide, roughness: 0.8 });
        fm.onBeforeCompile = (sh) => {
          sh.uniforms.uTime = TIME;
          sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime; attribute float aFlag;')
            .replace('#include <uv_vertex>', '#include <uv_vertex>\nvMapUv = vec2((aFlag + uv.x * 0.98 + 0.01) / 8.0, uv.y);')
            .replace('#include <begin_vertex>', `#include <begin_vertex>
              float ph = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.21;
              float a = position.x / 2.2;
              transformed.z += sin(uTime * 7.0 - position.x * 3.2 + ph) * 0.24 * a + sin(uTime * 11.0 - position.x * 5.0 + ph) * 0.06 * a;
              transformed.y -= a * a * 0.12;`);
        };
        fm.customProgramCacheKey = () => 'flag';
        const fmesh = new THREE.InstancedMesh(fg, fm, flags.length); flags.forEach((m, k) => fmesh.setMatrixAt(k, m)); fmesh.castShadow = true; this.scene.add(fmesh);
      }
    }
  }

  makeTvCams() {
    const cams = [];
    const N = this.geo.N, st = this.street > 0.7, W = this.TW;
    const step = Math.max(40, Math.round(N / 26));
    const tp = new THREE.Vector3(), cp = new THREE.Vector3();
    // a candidate must see the track where it films the cars (the sample itself and the
    // run-up to it) without a building, grandstand or the pit roof in between
    const sees = (i, pos) => [0, -10, -22, -34].every((d) => { const j = (i + d + N) % N; tp.set(this.geo.x[j], (this.geo.h ? this.geo.h[j] : 0) + 1, this.geo.y[j]); return this.losClear(pos, tp); });
    // oriented footprint (+4 m margin) for buildings / stands, radius for the rest
    const inObs = (o, px, pz) => { const ex = px - o.x, ez = pz - o.z; if (!o.hl) return ex * ex + ez * ez < o.r * o.r * 0.8; const c = Math.cos(o.rot), sn = Math.sin(o.rot); return Math.abs(ex * c - ez * sn) < o.hl + 4 && Math.abs(ex * sn + ez * c) < o.hd + 4; };
    const free = (px, pz, r) => !(this.obstacles || []).some((o) => inObs(o, px, pz)) && this.clearOfTrack(px, pz, r);
    for (let i = 0; i < N; i += step) {
      const k = cams.length;
      let side = (k % 2 ? 1 : -1);
      const nearPit = this.pitSpan && Math.min(i, N - i) < this.pitSpan + 22;
      if (nearPit) side = -1; // never behind / on top of the pit building
      const nx = -Math.sin(this.geo.hdg[i]), nz = Math.cos(this.geo.hdg[i]);
      const hy = this.geo.h ? this.geo.h[i] : 0;
      const offs = st ? [this.wallOff(i, side) + 1.6, this.wallOff(i, side) + 1.2] : [W / 2 + 26, W / 2 + 18, W / 2 + 34, W / 2 + 12];
      const hs = st ? [6 + (k % 3) * 2, 11, 16, 24] : [7 + (k % 3) * 3, 12, 18, 26];
      let pick = null;
      for (const hgt of hs) {
        for (const sd of nearPit ? [-1] : [side, -side]) for (const o0 of offs) {
          const off = st ? this.wallOff(i, sd) + (o0 - this.wallOff(i, side)) : o0;
          const px = this.geo.x[i] + nx * sd * off, pz = this.geo.y[i] + nz * sd * off;
          if (!free(px, pz, st ? W / 2 + 3.2 : W / 2 + 6)) continue;
          cp.set(px, hy + hgt, pz);
          if (sees(i, cp)) { pick = cp.clone(); break; }
        }
        if (pick) break;
      }
      if (!pick) { const off = st ? this.wallOff(i, side) + 1.2 : W / 2 + 14; pick = new THREE.Vector3(this.geo.x[i] + nx * side * off, hy + 26, this.geo.y[i] + nz * side * off); }
      cams.push({ i, pos: pick, ph: Math.random() * 100 });
    }
    return cams;
  }

  addCar(c) {
    // a light baked base coat (earlier stages / laps); the live layer (dirtPatch) grows on top
    const dirt = this.open && this.surface !== 'tarmac' ? (this.surface === 'snow' ? 0.15 : 0.3) : 0;
    if (!this._dirtCfg) {
      const s = this.surface, wetS = !!this._wetStart;
      this._dirtCfg = !this.open ? { base: 0.02, max: 0.32, dist: 90000, col: [0.13, 0.12, 0.11] }
        : s === 'snow' ? { base: 0.08, max: 0.55, dist: 9000, col: [0.6, 0.6, 0.62] }
        : s === 'tarmac' ? { base: 0.05, max: 0.4, dist: 12000, col: [0.2, 0.18, 0.16] }
        : { base: 0.1, max: 0.95, dist: 6000, col: wetS ? [0.2, 0.15, 0.1] : [0.5, 0.4, 0.28] };
    }
    const m = buildCar(c.category === 'rally' ? 'gt' : this.category, c.livery, { helmet: c.helmet, tyre: c.tyreColor, number: c.number, sponsor: c.sponsor, dirt, lod: true, hq: !!c.isPlayer && !this.low });
    m.traverse((o) => { if (o.isMesh) o.castShadow = true; o.layers.enable(2); });
    // soft contact shadow (ambient occlusion under the floor) — also grounds the car when shadows are off
    {
      const bb = new THREE.Box3().setFromObject(m); const sz = bb.getSize(new THREE.Vector3()); const ctr = bb.getCenter(new THREE.Vector3());
      this._blobMat ||= new THREE.MeshBasicMaterial({ map: canvasTex(128, 64, (c, w, h) => { c.clearRect(0, 0, w, h); c.filter = 'blur(9px)'; c.fillStyle = 'rgba(0,0,0,0.85)'; c.beginPath(); c.roundRect ? c.roundRect(18, 14, w - 36, h - 28, 12) : c.rect(18, 14, w - 36, h - 28); c.fill(); }), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, toneMapped: false });
      this._blobGeo ||= new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
      const blob = new THREE.Mesh(this._blobGeo, this._blobMat);
      blob.scale.set(sz.x * 1.25 / m.scale.x, 1, sz.z * 1.3 / m.scale.z); blob.position.set(ctr.x / m.scale.x, 0.03, 0); blob.renderOrder = 2;
      m.add(blob);
    }
    this.scene.add(m);
    const label = document.createElement('div');
    label.className = 'car3d-label';
    label.innerHTML = c.label || '';
    if (c.isPlayer) label.classList.add('me');
    label.style.setProperty('--lc', c.livery.primary);
    this.labels.appendChild(label);
    const team = String(c.key).split('#')[0]; this._boxes ||= new Map(); if (!this._boxes.has(team)) this._boxes.set(team, this._boxes.size);
    // each car gets its own garage bay: the team's first or second one
    const tIdx = this._boxes.get(team), tm = this.teamList?.[tIdx];
    const nth = tm ? tm.n++ : 0;
    const bay = this.pitBays?.length ? this.pitBays.find((b) => b.team === tIdx && !b.used) || this.pitBays.filter((b) => b.team === tIdx)[nth % 2] : null;
    if (bay) bay.used = true;
    const dirtMat = m.userData.dirtMat || null;
    if (dirtMat) { dirtMat.userData.dirtCol.value.setRGB(...this._dirtCfg.col); dirtMat.userData.dirtU.value = this._dirtCfg.base; }
    this.cars.set(c.key, { box: tIdx, bay, teamColor: c.livery?.primary, mesh: m, label, lane: ((c.key.charCodeAt(0) + c.key.length * 7) % 5 - 2) * 0.9, lastS: 0, tyre: c.tyreColor, isPlayer: c.isPlayer, dirtMat });
  }

  setNight(n) {
    if (this._night === n) return; this._night = n;
    const T = this.tod || TOD.day;
    const day = { top: new THREE.Color(T.top), bot: new THREE.Color(T.bot), fog: new THREE.Color(0xb8d4f0) };
    const nite = { top: new THREE.Color(0x02040c), bot: new THREE.Color(0x141c33), fog: new THREE.Color(0x070b18) };
    this.skyMat.uniforms.top.value.copy(day.top).lerp(nite.top, n);
    this.skyMat.uniforms.bot.value.copy(day.bot).lerp(nite.bot, n);
    this.scene.fog.color.copy(this.fogDay || day.fog).lerp(nite.fog, n);
    // deep night: the day sky is swapped for the moonless night sky (stars, no painted clouds)
    if (this.hdr && !this.night) {
      const want = n > 0.55;
      if (want !== !!this._nightSkyOn) {
        this._nightSkyOn = want;
        if (want) {
          const h = {};
          applyHDRI(this.renderer, h, 'night', { intensity: 0.35 }).then((ok) => {
            if (!ok || !this._nightSkyOn) return;
            this._daySky ||= { bg: this.scene.background, env: this.scene.environment };
            this.scene.background = h.background; this.scene.environment = h.environment; this._skyNight = true;
            const k = this._night || 0; this.scene.backgroundIntensity = 0.5 * k; this.scene.environmentIntensity = 0.45; if (this._lit) this._lit.bg = this.scene.backgroundIntensity; this._wetApplied = -1;
          });
        } else if (this._daySky) { this.scene.background = this._daySky.bg; this.scene.environment = this._daySky.env; this._skyNight = false; }
      }
    }
    if (!this.hdr) this.scene.background = this.scene.fog.color.clone();
    else if (this._skyNight) { this.scene.backgroundIntensity = 0.5 * n; this.scene.environmentIntensity = 0.45; }
    else { this.scene.backgroundIntensity = (T.bg ?? 1) * (1 - n * 0.85); this.scene.environmentIntensity = 0.9 - n * 0.6; }
    const dk = T.k;
    // floodlit circuits: the key light stands in for the floodlights; elsewhere it fades to a
    // dim, cold moonlight and the cars' headlights do the work
    const moon = !this.floodlit;
    this.hemi.intensity = this._hemiBase = (1.1 - n * (moon ? 0.85 : 0.55)) * (0.6 + 0.4 * dk);
    this.sun.intensity = (2.6 - n * (moon ? 2.38 : 2.0)) * dk;
    this.sun.color.setHex(T.sun).lerp(this._moonC ||= new THREE.Color(moon ? 0x8ea6d4 : 0xfff0dc), n);
    this.setLampLevel?.(n);
    this._lit = { sun: this.sun.intensity, bg: this.hdr ? this.scene.backgroundIntensity : 1, fog: this.scene.fog.color.clone() }; this._wetApplied = -1;
    if (this.forest) this.forest.material.uniforms.light.value = 1 - n * 0.8;
    this.renderer.toneMappingExposure = T.exp - n * 0.2;
  }

  // visible sun: soft disc + glow sprite on the sun painted in the HDRI (the 1k map clips it to
  // a pixel or two), coloured by the time of day; drawn behind everything, no fog
  buildSunDisc(dir) {
    if (this.sunDisc || this.night) return;
    const tex = canvasTex(256, 256, (c, w, h) => {
      c.clearRect(0, 0, w, h);
      const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.05, 'rgba(255,255,255,1)'); g.addColorStop(0.07, 'rgba(255,250,235,0.45)'); g.addColorStop(0.14, 'rgba(255,240,215,0.07)'); g.addColorStop(0.4, 'rgba(255,230,200,0.012)'); g.addColorStop(1, 'rgba(255,230,200,0)');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
    });
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    const mat = new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(this.tod?.disc ?? 0xfff6e6).multiplyScalar(this.skyKind === 'dusk' ? 1.4 : 1.8), blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true });
    this.sunDisc = new THREE.Sprite(mat); const sz = this.skyKind === 'day' ? 900 : 1300; this.sunDisc.scale.set(sz, sz, 1); this.sunDisc.renderOrder = -1;
    this._sunDiscDir = dir.clone().normalize();
    this.scene.add(this.sunDisc);
  }

  setStartLights(n, go) {
    this.lights?.forEach((l, k) => { const on = !go && k < n; l.material.emissive.setHex(on ? 0xff0000 : 0x000000); l.material.color.setHex(on ? 0xff2020 : 0x220000); });
  }

  // Optional: cloud cover 0..1 independent of rain (overcast dry race). setRain() derives the
  // cover from the rain level and uses whichever is larger.
  setOvercast(v) { this._ovcSet = Math.max(0, Math.min(1, v || 0)); this._wetApplied = -1; this.setRain(this._rainLvl || 0); }

  // procedural cloud layer drawn over the HDRI sky: thin broken cloud -> full overcast ->
  // dark storm deck with lightning. Transparent, depth-tested, so it only shows where the sky does.
  buildCloudDome() {
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false, side: THREE.BackSide,
      uniforms: { uCover: { value: 0 }, uStorm: { value: 0 }, uTime: TIME, uFlash: { value: 0 }, uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uSun: { value: new THREE.Vector3(0, 1, 0) } },
      vertexShader: /* glsl */`varying vec3 vDir;
        #include <common>
        #include <logdepthbuf_pars_vertex>
        void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
        }`,
      fragmentShader: /* glsl */`uniform float uCover, uStorm, uTime, uFlash; uniform vec3 uTop, uHor, uSun; varying vec3 vDir;
        #include <logdepthbuf_pars_fragment>
        float ch(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        float cn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(ch(i), ch(i + vec2(1, 0)), f.x), mix(ch(i + vec2(0, 1)), ch(i + vec2(1, 1)), f.x), f.y); }
        float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * cn(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }
        void main() {
          #include <logdepthbuf_fragment>
          vec3 d = normalize(vDir); float h = d.y;
          vec2 p = d.xz / (max(h, 0.0) + 0.1) * 0.9 + vec2(uTime * 0.012, uTime * 0.005);
          float n = fbm(p), n2 = fbm(p * 2.6 + 7.0 + uTime * 0.01);
          // coverage: low cover leaves gaps of clear sky, high cover a solid deck with darker lumps
          float thr = mix(0.75, 0.05, uCover);
          float dens = smoothstep(thr, thr + 0.28, n * 0.75 + n2 * 0.25);
          vec3 base = mix(uHor, uTop, smoothstep(-0.02, 0.55, h));
          // cloud bases are darker, tops catch light; storm cells are near-black
          float lump = smoothstep(0.35, 0.8, n2);
          vec3 col = base * mix(1.12, 0.62 - 0.22 * uStorm, lump);
          float sunG = pow(max(dot(d, normalize(uSun)), 0.0), 8.0) * (1.0 - uStorm) * (1.0 - dens * 0.7);
          col += uHor * sunG * 0.6;
          col += uFlash * vec3(0.75, 0.8, 1.0) * (0.35 + 0.9 * lump) * smoothstep(-0.05, 0.3, h);
          float a = clamp(max(dens, smoothstep(0.35, 0.85, uCover)) * smoothstep(0.0, 0.25, uCover), 0.0, 1.0);
          gl_FragColor = vec4(col, a);
        }`,
    });
    this.cloudDome = new THREE.Mesh(new THREE.SphereGeometry(5900, 32, 16), mat);
    this.cloudDome.renderOrder = -5; this.cloudDome.frustumCulled = false;
    this.scene.add(this.cloudDome);
    // overcast reflection environment: the cloud deck over a grey ground, rendered once
    try {
      const sc = new THREE.Scene(); const m2 = mat.clone(); m2.uniforms = THREE.UniformsUtils.clone(mat.uniforms); m2.uniforms.uTime = TIME;
      m2.uniforms.uCover.value = 1; m2.uniforms.uTop.value.setRGB(0.42, 0.45, 0.5); m2.uniforms.uHor.value.setRGB(0.62, 0.65, 0.7); m2.transparent = false;
      sc.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), m2));
      const gnd = new THREE.Mesh(new THREE.CircleGeometry(49, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x3c3f42 })); gnd.position.y = -2; sc.add(gnd);
      const pm = new THREE.PMREMGenerator(this.renderer); this._ovcEnv = pm.fromScene(sc, 0.03).texture; pm.dispose();
    } catch { this._ovcEnv = null; }
  }

  setRain(level) {
    this._rainLvl = level;
    if (level > 0.08 && !this.rain) {
      // falling streaks (line segments) around the camera, slanted by the wind
      const n = this.low ? 1500 : 4000; const g = new THREE.BufferGeometry(); const p = new Float32Array(n * 6);
      for (let i = 0; i < n; i++) { const x = (Math.random() - 0.5) * 110, y = Math.random() * 60, z = (Math.random() - 0.5) * 110; p.set([x, y, z, x + 0.12, y - 0.85, z + 0.05], i * 6); }
      g.setAttribute('position', new THREE.BufferAttribute(p, 3));
      this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xc4d2e0, transparent: true, opacity: 0.32, depthWrite: false }));
      this.rain.frustumCulled = false; this._rainN = n;
      this.scene.add(this.rain);
    }
    if (this.rain) {
      this.rain.visible = level > 0.08;
      // drizzle: few faint streaks; downpour: dense and brighter
      const k = Math.min(1, (level - 0.05) * 1.4);
      this.rain.geometry.setDrawRange(0, Math.round(this._rainN * Math.max(0.15, k)) * 2);
      this.rain.material.opacity = 0.16 + 0.24 * k;
    }
    const wet = Math.min(1, level * 1.3);
    this.wet = wet;
    const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const ovc = Math.max(this._ovcSet || 0, sm(0.02, 0.4, level));
    const storm = sm(0.55, 0.95, level);
    this.overcast = ovc; this.storm = storm;
    // overcast: cloud deck over the sky, weaker sun, grey haze, overcast reflections, flatter grade
    const key = wet + ovc * 3 + storm * 7 + (this._night || 0) * 13;
    if (Math.abs(key - (this._wetApplied ?? -1)) > 0.01) {
      this._wetApplied = key;
      const base = this._lit || { sun: this.night ? 1.55 : this.tod?.sunI ?? 2.2, bg: this.night ? 0.35 : this.tod?.bg ?? 1, fog: (this.fogDay || this.scene.fog.color).clone() };
      if (!this._lit && this.fogDay) this._lit = base;
      const nite = this.night ? 1 : (this._night || 0);
      if (ovc > 0.01 && !this.cloudDome) this.buildCloudDome();
      const hor = (this._wHor ||= new THREE.Color()), top = (this._wTop ||= new THREE.Color());
      // overcast greys -> slate storm deck; at night the deck is dark with a warm glow from the circuit lights
      hor.setRGB(0.6, 0.63, 0.68).lerp(this._c1 ||= new THREE.Color(0.2, 0.22, 0.25), storm);
      top.setRGB(0.4, 0.44, 0.5).lerp(this._c2 ||= new THREE.Color(0.07, 0.08, 0.1), storm);
      if (this.skyKind === 'dusk' || this.skyKind === 'afternoon') { hor.multiply(this._c3 ||= new THREE.Color(1.1, 0.95, 0.85)); }
      if (nite > 0) { hor.lerp(this._c4 ||= new THREE.Color(0.045, 0.04, 0.038), nite); top.lerp(this._c5 ||= new THREE.Color(0.008, 0.01, 0.014), nite); }
      if (this.cloudDome) {
        const u = this.cloudDome.material.uniforms; u.uCover.value = ovc; u.uStorm.value = storm; u.uTop.value.copy(top); u.uHor.value.copy(hor);
        if (this._sunDiscDir) u.uSun.value.copy(this._sunDiscDir);
        this.cloudDome.visible = ovc > 0.01;
      }
      this.sun.intensity = base.sun * (1 - 0.8 * ovc - 0.1 * storm);
      this.hemi.intensity = (this._hemiBase ??= this.hemi.intensity) * (1 + 0.35 * ovc * (1 - nite));
      if (this.hdr) { this.scene.backgroundIntensity = base.bg * (1 - 0.4 * ovc); this.scene.backgroundBlurriness = 0.1 * ovc; }
      // reflections: the overcast deck replaces the sunny HDRI under heavy cloud
      if (this._ovcEnv && !this.night) {
        if (ovc > 0.55 && this.scene.environment !== this._ovcEnv) { this._envSunny = this.scene.environment; this._envI = this.scene.environmentIntensity; this.scene.environment = this._ovcEnv; }
        else if (ovc < 0.45 && this.scene.environment === this._ovcEnv && this._envSunny) this.scene.environment = this._envSunny;
        if (this.scene.environment === this._ovcEnv) this.scene.environmentIntensity = (this._envI ?? 0.9) * (1.05 - 0.55 * storm);
        else if (this._envI != null) this.scene.environmentIntensity = this._envI;
      }
      const fogT = (this._rainFog ||= new THREE.Color());
      fogT.copy(hor).multiplyScalar(0.92);
      this.scene.fog.color.copy(base.fog).lerp(fogT, Math.min(1, ovc * 0.9 + wet * 0.1));
      if (this.composer?.grade) this.composer.grade.uniforms.uSat.value = (this.tod?.sat ?? 1.08) - 0.18 * ovc - 0.12 * wet;
      // moody overcast: cooler highlights, deeper contrast instead of a flat grey image
      if (this.composer?.grade) { const gu = this.composer.grade.uniforms; gu.uWarm.value = (this.tod?.warm ?? 0.035) * (1 - ovc) - 0.016 * ovc * (1 - nite); gu.uCon.value = 1.08 + 0.07 * ovc + 0.04 * storm; gu.uVig.value = 0.32 + 0.1 * ovc; }
    }
    if (!this.asphaltMat.userData.wetPatch) { this.asphaltMat.roughness = 0.82 - wet * 0.5; this.asphaltMat.metalness = 0.04 + wet * 0.12; if (this.asphaltMat.color) { this._asphBase ??= this.asphaltMat.color.getHex(); this.asphaltMat.color.setHex(this._asphBase).multiplyScalar(1 - wet * 0.45); } }
    WET.value = wet;
    if (this.scene.fog.isFogExp2) this.scene.fog.density = this.fogDensity * (1 + wet * 2.6 + ovc * 0.6);
    else { this.scene.fog.near = 400 * (1 - wet * 0.75); this.scene.fog.far = 2600 * (1 - wet * 0.68); }
  }

  // storm: occasional lightning (cloud flash + a brief cold fill light), called every frame
  updateWeather(dt) {
    if (!this.cloudDome || !this.cloudDome.visible) return;
    this.cloudDome.position.copy(this.camera.position);
    const u = this.cloudDome.material.uniforms;
    if ((this.storm || 0) > 0.5) {
      this._ltT = (this._ltT ?? 4 + Math.random() * 8) - dt;
      if (this._ltT <= 0) { this._lt = 0.45; this._ltT = 5 + Math.random() * 12; }
    }
    if (this._lt > 0) {
      this._lt -= dt; const t = 0.45 - this._lt;
      const f = Math.max(0, (t < 0.08 ? 1 : t < 0.14 ? 0.15 : t < 0.22 ? 0.8 : 0) * (0.6 + 0.4 * this.storm));
      u.uFlash.value = f * 1.6; this.hemi.intensity = (this._hemiBase ?? 0.45) * (1 + 0.35 * this.overcast) + f * 1.4;
      if (this._lt <= 0) { u.uFlash.value = 0; this.hemi.intensity = (this._hemiBase ?? 0.45) * (1 + 0.35 * this.overcast); }
    }
  }

  // states: [{key, s (0..N sample float), speed (m/s), inPit, tyreColor, label, show}]
  update(states, dt) {
    const N = this.geo.N;
    TIME.value = (performance.now() / 1000) % 1000;
    // adaptive quality: drop resolution/shadows when the framerate is low
    this._fpsT = (this._fpsT || 0) + dt; this._fpsN = (this._fpsN || 0) + 1;
    if (this._fpsT > 4) {
      const fps = this._fpsN / this._fpsT; this._fpsT = 0; this._fpsN = 0;
      if (fps < 26 && !this._degraded) {
        this._degraded = true; this._fxOff = true; this.renderer.setPixelRatio(1); this.renderer.shadowMap.enabled = false; if (this.composer?.ao) this.composer.ao.enabled = false;
        this.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
        this.resize();
      }
    }
    let focus = null;
    const ds = this.geo.ds, open = this.open;
    const dS = (a, b) => { let d = a - b; if (!open) { if (d > N / 2) d -= N; if (d < -N / 2) d += N; } return d; };
    const wrap = (v) => open ? Math.min(N - 1.001, Math.max(0, v)) : ((v % N) + N) % N;
    const maxLane = this.TW / 2 - 1.15;
    // pass 1: desired longitudinal position + lane for every car
    const items = [];
    for (const st of states) {
      const car = this.cars.get(st.key); if (!car) continue;
      if (st.hidden) { car.mesh.visible = false; car.label.style.display = 'none'; car.pc = null; continue; }
      let s = st.s, spd = st.speed || 0, lane, pit = false, yaw = 0;
      const i0 = open ? Math.min(N - 2, Math.max(0, Math.floor(s))) : Math.floor(s) % N;
      const race = (this.line ? this.line[i0] * (st.close ? 0.45 : 1) : 0) + (st.close && st.pos ? (st.pos % 2 ? 2.6 : -2.6) : car.lane * 0.3);
      if (this.pitOff && !open) { const r = this.pitStep(car, st, dt, race); if (r) { items.push({ st, car, ...r, s: wrap(r.s) }); continue; } }
      lane = Math.max(-maxLane, Math.min(maxLane, race));
      items.push({ st, car, s: wrap(s), spd, lane, pit, yaw });
    }
    // pass 2: resolve overlaps. Process cars from the front so the car behind yields
    // (moves aside if there is room, otherwise backs off) — no two bodies can intersect.
    if (items.length > 1) {
      const asc = items.slice().sort((a, b) => a.s - b.s);
      let cut = 0, gap = -1;
      for (let k = 0; k < asc.length; k++) { const nx = asc[(k + 1) % asc.length]; const g = k + 1 < asc.length ? nx.s - asc[k].s : (open ? -1 : nx.s + N - asc[k].s); if (g > gap) { gap = g; cut = k; } }
      const order = open ? asc.reverse() : [...asc.slice(cut + 1), ...asc.slice(0, cut + 1)].reverse();
      items.length = 0; items.push(...order);
    }
    const WID = 2.45;
    const placed = [];
    for (const it of items) {
      const car = it.car;
      car.latOff = (car.latOff || 0) * Math.max(0, 1 - dt * 0.7);
      const tgt = it.pit ? it.lane : Math.max(-maxLane, Math.min(maxLane, it.lane + car.latOff));
      car.laneCur = car.laneCur == null || it.exact ? tgt : car.laneCur + (tgt - car.laneCur) * Math.min(1, dt * (it.pit ? 3 : 4));
      if (!it.pit) car.laneCur = Math.max(-maxLane, Math.min(maxLane, car.laneCur));
      // visual longitudinal back-off memory so a yielding car does not snap
      let s = wrap(it.s - (car.sBack || 0));
      let back = 0;
      const hitAt = (ss, lane) => { const q = this.pose(ss, lane); for (const o of placed) { const dx = o.x - q.x, dz = o.z - q.z; if (dx * dx + dz * dz > 64 || Math.abs((o.y || 0) - (q.y || 0)) > 2) continue; const c = Math.cos(q.h), sn = Math.sin(q.h); const lon = dx * c + dz * sn, lat = -dx * sn + dz * c; if (Math.abs(lon) < 5.5 && Math.abs(lat) < 2.25) return o; } return null; };
      for (let iter = 0; iter < 24; iter++) {
        const hit = hitAt(s, car.laneCur);
        if (!hit) break;
        if (!it.pit && !hit.pit && iter < 3) {
          // steer aside (rate limited) towards the side with room, remember the offset
          const side = car.laneCur >= hit.lane ? 1 : -1;
          let want = hit.lane + side * WID;
          if (Math.abs(want) > maxLane || hitAt(s, want)) want = hit.lane - side * WID;
          if (Math.abs(want) <= maxLane && !hitAt(s, want)) {
            car.laneCur += Math.max(-dt * 6, Math.min(dt * 6, want - car.laneCur)); car.latOff = want - it.lane;
            continue;
          }
        }
        s = wrap(s - 0.3); back += 0.3;
      }
      car.sBack = Math.max(0, (car.sBack || 0) + back) * Math.max(0, 1 - dt * 1.5);
      if (car.sBack < 0.01) car.sBack = 0;
      s = wrap(s);
      placed.push({ ...this.pose(s, car.laneCur), s, lane: car.laneCur, pit: it.pit });
      this.placeCar(car, it.st, s, car.laneCur, it.spd, dt, it.yaw || 0);
      if (it.st.key === this.focusKey) focus = car;
    }
    if (!focus) focus = [...this.cars.values()].find((c) => c.mesh.visible);
    this._envTick?.(dt);
    if (!this._slots && !this.open) { this._slots = true; if (this.introT > 0) buildGridSlots(this); }
    this.updateCamera(focus, dt);
    this.updatePitCrew();
    // pass-by sounds for cars close to a fixed (TV) camera
    if (this.camMode === 'tv' && !this.introT) {
      for (const car of this.cars.values()) {
        if (!car.mesh.visible) continue;
        const d = car.mesh.position.distanceTo(this.camera.position);
        if (car._d != null && car._d < 45 && d > car._d && !car._passed) { car._passed = true; passBy(Math.max(0.3, 1 - car._d / 45), this.category === 'rally' ? 'rally' : this.category); }
        if (d > 70) car._passed = false;
        car._d = d;
      }
    }
    if (this.rain && this.rain.visible) {
      const p = this.rain.geometry.attributes.position, a = p.array;
      for (let i = 0; i < a.length; i += 6) { let y = a[i + 1] - dt * 38; if (y < 0) y += 60; a[i + 1] = y; a[i + 4] = y - 0.75; }
      p.needsUpdate = true;
      this.rain.position.set(this.camera.position.x, 0, this.camera.position.z);
    }
    this.updateWeather(dt);
    this.updateFx(dt);
    this.updateCarLights(dt);
    if (this.wet > 0.3 && !this.open) this.updateSpray(dt);
    else if (this.spray) this.spray.visible = false;
    if (this.lampLights && this.nightLamps?.length) {
      const c = this.camLook, near = this.nightLamps.map((p, k) => [p.distanceToSquared(c), k]).sort((a, b) => a[0] - b[0]);
      this.lampLights.forEach((l, j) => { const e = near[j]; if (!e) { l.intensity = 0; return; } const p = this.nightLamps[e[1]]; l.position.copy(p); const d = Math.sqrt(e[0]); l.intensity = 120 * THREE.MathUtils.smoothstep(150 - d, 0, 90); });
    }
    // formula cars flash their rain light on a wet track
    if (this.category === 'formula' || this.category === 'junior') {
      const rl = MAT.light('#ff2020', 3), on = (this.wet || 0) > 0.25 ? (Math.floor(performance.now() / 250) % 2 ? 4.5 : 0.25) : 3;
      if (rl.emissiveIntensity !== on) rl.emissiveIntensity = on;
    }
    this.updateLOD(focus);
    if (this.sunDisc) { this.sunDisc.position.copy(this.camera.position).addScaledVector(this._sunDiscDir, 4200); this.sunDisc.material.opacity = (1 - (this._night || 0)) * (1 - 0.95 * (this.wet || 0)); this.sunDisc.visible = this.sunDisc.material.opacity > 0.02; }
    if (this.composer?.rays) updateGodRays(this.composer, this.camera, this.hdr && hdriSun(this.skyKind), (this.tod?.rays ?? 0) * (1 - (this._night || 0)) * (1 - 0.9 * (this.wet || 0)));
    if (this.composer?.flare) updateSunFlare(this.composer, this.camera, this.hdr && hdriSun(this.skyKind), (1 - (this._night || 0)) * (1 - 0.9 * (this.wet || 0)) * (this.camMode === 'cockpit' ? 1.2 : 1));
    // per-frame draw statistics (renderer.info resets per pass inside the composer)
    const info = this.renderer.info; info.autoReset = false; info.reset();
    this.renderWetReflect();
    if (this.composer) this.composer.render(); else this.renderer.render(this.scene, this.camera);
    this._stats = { calls: info.render.calls, tris: info.render.triangles }; info.autoReset = true;
    this.updateLabels();
  }

  // distance LOD: cars smaller than ~120 px on screen draw their simplified version
  updateLOD(focus) {
    const tanF = Math.tan(this.camera.fov * Math.PI / 360), H = this.H || 720, cam = this.camera.position;
    const inCar = this.camMode === 'onboard' || this.camMode === 'cockpit';
    for (const car of this.cars.values()) {
      const m = car.mesh; if (!m.visible) continue;
      const px = 5.2 / (2 * Math.max(0.1, m.position.distanceTo(cam)) * tanF) * H;
      const far = !(inCar && car === focus) && px < (car.lodFar ? 135 : 115);
      if (far !== car.lodFar) { car.lodFar = far; setCarLOD(m, far); }
    }
  }

  // per-car effects: glowing brake discs (one instanced additive mesh for every wheel of every
  // car) and titanium-skid sparks from formula cars' planks in braking zones / at top speed
  updateFx(dt) {
    if (this.low || !dt) return;
    const cars = [...this.cars.values()];
    if (!this.brakeFx) {
      const n = cars.length * 4;
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 });
      this.brakeFx = new THREE.InstancedMesh(new THREE.RingGeometry(0.84, 1, 28, 1), mat, n);
      this.brakeFx.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
      this.brakeFx.frustumCulled = false; this.brakeFx.count = 0; this.scene.add(this.brakeFx);
      this._fxM = new THREE.Matrix4(); this._fxO = new THREE.Matrix4(); this._fxC = new THREE.Color();
    }
    const fm = this.category === 'formula' || this.category === 'junior';
    if (fm && !this.sparks) {
      const M = 700; const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(M * 6), 3));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(M * 6), 3));
      this.sparks = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      this.sparks.frustumCulled = false; this.scene.add(this.sparks);
      this.sparkV = new Float32Array(M * 3); this.sparkP = new Float32Array(M * 3); this.sparkL = new Float32Array(M); this.sparkI = 0; this.sparkM = M;
    }
    const cam = this.camera.position, night = this.night || (this._night || 0) > 0.5;
    let k = 0;
    const M4 = this._fxM, O = this._fxO, col = this._fxC;
    for (const car of cars) {
      const m = car.mesh; if (!m.visible) { car.heat = 0; continue; }
      const sp = car.state?.speed || 0, acc = car._acc || 0;
      // disc temperature: heats with braking power, cools with airflow
      car.heat = Math.max(0, Math.min(1, (car.heat || 0) + (acc < -12 && sp > 15 ? (-acc - 12) * 0.03 * dt : 0) - dt * (0.18 + sp * 0.004)));
      const d2 = m.position.distanceToSquared(cam);
      if (car.heat > 0.05 && d2 < 220 * 220) {
        const glow = Math.pow(car.heat, 1.4) * (night ? 1.6 : 0.9);
        m.updateMatrix();
        m.userData.wheels.forEach((w, wi) => {
          const { rimR = 0.22, w: ww = 0.3, kind } = w.userData; const front = wi < 2;
          w.updateMatrix(); M4.multiplyMatrices(m.matrix, w.matrix);
          const sgn = Math.sign(w.position.z) || 1;
          // formula: halo at the rim lip around the wheel cover; others: disc behind the spokes
          const f1 = kind === 'f1';
          O.makeScale(f1 ? rimR * 1.05 : rimR * 0.82, f1 ? rimR * 1.05 : rimR * 0.82, 1).setPosition(0, 0, sgn * (ww * 0.36 + (f1 ? 0.022 : 0.004)));
          M4.multiply(O);
          this.brakeFx.setMatrixAt(k, M4);
          const g = glow * (front ? 1 : 0.75);
          col.setRGB(1.0 * g * 2.2, 0.32 * g * 2.2 * (0.6 + 0.4 * car.heat), 0.06 * g * 2.2);
          this.brakeFx.setColorAt(k, col); k++;
        });
      }
    }
    this.brakeFx.count = k;
    if (k) { this.brakeFx.instanceMatrix.needsUpdate = true; this.brakeFx.instanceColor.needsUpdate = true; }
    if (!this.sparks) return;
    // emit
    const P = this.sparkP, V = this.sparkV, L = this.sparkL, Mx = this.sparkM;
    for (const car of cars) {
      const m = car.mesh, sp = car.state?.speed || 0, acc = car._acc || 0;
      if (!m.visible || sp < 45 || car.pc || m.position.distanceToSquared(cam) > 180 * 180) continue;
      const rate = (acc < -18 ? 40 : 0) + (sp > 75 ? 6 : 0) + (car._bump || 0);
      car._spk = (car._spk || 0) + rate * dt * (0.3 + Math.random());
      const fx = Math.cos(m.rotation.y), fz = -Math.sin(m.rotation.y);
      let n = Math.min(14, Math.floor(car._spk)); car._spk -= n;
      if (Math.random() < 0.02 * dt * 60 * (sp > 70 ? 1 : 0)) n += 12; // bottoming out on a bump
      for (let q = 0; q < n; q++) {
        const j = this.sparkI = (this.sparkI + 1) % Mx; const lat = (Math.random() - 0.5) * 0.7, back = -1.1 - Math.random() * 1.0;
        P[j * 3] = m.position.x + fx * back + fz * lat; P[j * 3 + 1] = m.position.y + 0.03; P[j * 3 + 2] = m.position.z + fz * back - fx * lat;
        const vf = sp * (0.35 + Math.random() * 0.4);
        V[j * 3] = fx * vf + (Math.random() - 0.5) * 9; V[j * 3 + 1] = 0.6 + Math.random() * 2.8; V[j * 3 + 2] = fz * vf + (Math.random() - 0.5) * 9;
        L[j] = 0.12 + Math.random() * 0.3;
      }
    }
    const pos = this.sparks.geometry.attributes.position.array, cl = this.sparks.geometry.attributes.color.array;
    const drag = Math.exp(-dt * 3.5); let live = 0;
    for (let j = 0; j < Mx; j++) {
      if (L[j] <= 0) { if (cl[j * 6] !== 0) { cl.fill(0, j * 6, j * 6 + 6); pos.fill(0, j * 6, j * 6 + 6); } continue; }
      live++;
      L[j] -= dt; V[j * 3] *= drag; V[j * 3 + 2] *= drag; V[j * 3 + 1] -= 9.8 * dt;
      P[j * 3] += V[j * 3] * dt; P[j * 3 + 1] += V[j * 3 + 1] * dt; P[j * 3 + 2] += V[j * 3 + 2] * dt;
      if (P[j * 3 + 1] < 0.02) { P[j * 3 + 1] = 0.02; V[j * 3 + 1] *= -0.3; }
      // streak = position and where it was ~25 ms ago (motion blur)
      const tl = 0.025;
      pos[j * 6] = P[j * 3]; pos[j * 6 + 1] = P[j * 3 + 1]; pos[j * 6 + 2] = P[j * 3 + 2];
      pos[j * 6 + 3] = P[j * 3] - V[j * 3] * tl; pos[j * 6 + 4] = P[j * 3 + 1] - V[j * 3 + 1] * tl; pos[j * 6 + 5] = P[j * 3 + 2] - V[j * 3 + 2] * tl;
      const e = Math.min(1, L[j] * 5) * 2.4;
      cl[j * 6] = e; cl[j * 6 + 1] = e * 0.78; cl[j * 6 + 2] = e * 0.42;
      cl[j * 6 + 3] = e * 0.9; cl[j * 6 + 4] = e * 0.4; cl[j * 6 + 5] = e * 0.08;
    }
    this.sparks.visible = live > 0;
    this.sparks.geometry.attributes.position.needsUpdate = true; this.sparks.geometry.attributes.color.needsUpdate = true;
  }

  // rooster-tail spray behind cars on a wet track: one shared particle system. Each puff grows
  // from a tight jet off the rear tyres / diffuser into a wide, thinning cloud of mist that the
  // car drags along for a moment; soft round sprites sized in metres, faded close to the lens
  updateSpray(dt) {
    const M = this.low ? 600 : 3200;
    if (!this.spray) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(M * 3).fill(-9999), 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('aAge', new THREE.BufferAttribute(new Float32Array(M * 2), 2).setUsage(THREE.DynamicDrawUsage));
      const mat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, fog: true,
        uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uPx: { value: 600 }, uCol: { value: new THREE.Color(0.75, 0.78, 0.82) }, uOp: { value: 0.32 } }]),
        vertexShader: `attribute vec2 aAge; uniform float uPx; varying float vA; varying float vS;
          #include <common>
          #include <fog_pars_vertex>
          #include <logdepthbuf_pars_vertex>
          void main() {
            float age = aAge.x; vS = aAge.y;
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
            float size = mix(0.5, 4.2, sqrt(age)) * (0.7 + 0.6 * aAge.y);
            float dz = -mvPosition.z;
            gl_PointSize = age > 0.0 ? clamp(size * uPx / max(0.5, dz), 1.0, 420.0) : 0.0;
            vA = pow(1.0 - age, 1.4) * smoothstep(0.0, 0.08, age) * smoothstep(3.0, 14.0, dz);
            // seen from afar (long-lens TV shots) dozens of puffs stack into the same few pixels:
            // thin them out with distance and let them spread a little wider, so the trail reads
            // as a low veil of mist instead of a bright cloud behind each car
            float far = smoothstep(25.0, 160.0, dz);
            vA *= mix(1.25, 0.3, far) / (1.0 + max(0.0, uPx - 900.0) * 0.0006 * far);
            gl_PointSize *= 1.0 + 0.5 * far;
            #include <logdepthbuf_vertex>
            #include <fog_vertex>
          }`,
        fragmentShader: `uniform vec3 uCol; uniform float uOp; varying float vA; varying float vS;
          #include <common>
          #include <fog_pars_fragment>
          #include <logdepthbuf_pars_fragment>
          void main() {
            #include <logdepthbuf_fragment>
            vec2 p = gl_PointCoord - 0.5; float d2 = dot(p, p) * 4.0; if (d2 > 1.0) discard;
            // a little lumpy: an offset lobe per puff
            vec2 q = p + vec2(sin(vS * 40.0), cos(vS * 31.0)) * 0.18; float l = 1.0 - smoothstep(0.0, 0.25, dot(q, q));
            float a = uOp * vA * exp(-d2 * 3.2) * (1.0 - d2) * (0.75 + 0.35 * l);
            gl_FragColor = vec4(uCol * (0.94 + 0.08 * l), a);
            #include <fog_fragment>
          }`,
      });
      this.spray = new THREE.Points(g, mat);
      this.spray.frustumCulled = false; this.spray.renderOrder = 5; this.sprayV = new Float32Array(M * 3); this.sprayL = new Float32Array(M); this.sprayL0 = new Float32Array(M).fill(1); this.sprayI = 0;
      this.scene.add(this.spray);
    }
    this.spray.visible = true;
    const u = this.spray.material.uniforms, nt = this.night ? 1 : (this._night || 0);
    u.uPx.value = (this.H || 720) / (2 * Math.tan(this.camera.fov * Math.PI / 360));
    // mist takes the colour of the light around it: grey daylight, near black at night (the
    // floodlit circuits keep a warm grey)
    u.uCol.value.setRGB(0.5, 0.53, 0.57).lerp(this._sprN ||= new THREE.Color(this.floodlit ? 0.3 : 0.06, this.floodlit ? 0.29 : 0.065, this.floodlit ? 0.28 : 0.075), nt);
    u.uOp.value = 0.1 + 0.12 * Math.min(1, this.wet);
    const P = this.spray.geometry.attributes.position.array, A = this.spray.geometry.attributes.aAge.array, V = this.sprayV, L = this.sprayL, L0 = this.sprayL0;
    const cam = this.camera.position;
    const fm = this.category === 'formula' || this.category === 'junior';
    // the view may run faster than real time (x8 broadcast): the mist lives in race time, so a
    // time-lapse keeps the same trail length; puffs are spread along the path driven this frame
    let sv = 0, ss = 0;
    for (const car of this.cars.values()) { const m = car.mesh, pp = car._sprP; const sp = car.state?.speed || 0; if (!pp || !m.visible || sp < 14 || !dt) continue; const d = Math.hypot(m.position.x - pp.x, m.position.z - pp.z); if (d < sp * dt * 60) { sv += d / dt; ss += sp; } }
    const tsT = ss > 0 ? Math.max(1, Math.min(40, sv / ss)) : 1;
    this._sprTs = this._sprTs ? this._sprTs + (tsT - this._sprTs) * Math.min(1, dt * 3) : tsT;
    const dts = dt * this._sprTs;
    for (const car of this.cars.values()) {
      const m = car.mesh, sp = car.state?.speed || 0;
      const pp = car._sprP ||= m.position.clone(), px0 = pp.x, pz0 = pp.z; pp.copy(m.position);
      if (!m.visible || sp < 14 || (car === this._camCar && (this.camMode === 'onboard' || this.camMode === 'cockpit')) || m.position.distanceToSquared(cam) > 280 * 280) continue;
      const fx = Math.cos(m.rotation.y), fz = -Math.sin(m.rotation.y);
      const moved = Math.hypot(m.position.x - px0, m.position.z - pz0);
      if (moved > 80) continue; // teleport (pit / replay jump)
      // one puff per ~0.7 m of track, scaled by how wet it is
      car._sprAcc = (car._sprAcc || 0) + moved * 1.5 * this.wet * (this.low ? 0.35 : 1);
      const n = Math.min(30, Math.floor(car._sprAcc)); car._sprAcc -= n;
      for (let q = 0; q < n; q++) {
        const k = this.sprayI = (this.sprayI + 1) % M; const r = Math.random(), t = Math.random();
        const lat = r < 0.4 ? 0.72 : r < 0.8 ? -0.72 : (Math.random() - 0.5) * 0.6, back = fm ? 1.75 + Math.random() * 0.5 : 2.0 + Math.random() * 0.5;
        const bx = px0 + (m.position.x - px0) * t, bz = pz0 + (m.position.z - pz0) * t;
        P[k * 3] = bx - fx * back + fz * lat; P[k * 3 + 1] = m.position.y + 0.3 + Math.random() * 0.25; P[k * 3 + 2] = bz - fz * back - fx * lat;
        const vf = sp * (0.45 + Math.random() * 0.3), vl = (Math.random() - 0.5) * 4 + Math.sign(lat) * 1.2;
        V[k * 3] = fx * vf + fz * vl; V[k * 3 + 1] = 1.2 + Math.random() * 2.6 + sp * 0.012; V[k * 3 + 2] = fz * vf - fx * vl;
        L0[k] = 0.7 + Math.random() * 0.7; L[k] = L0[k] - (1 - t) * dts; A[k * 2 + 1] = Math.random();
      }
    }
    // the mist keeps part of the car's speed for a moment, then hangs and thins out
    const drag = Math.exp(-dts * 2.3), dragY = Math.exp(-dts * 1.6);
    for (let k = 0; k < M; k++) {
      if (L[k] <= 0) { if (A[k * 2] !== 0) { A[k * 2] = 0; P[k * 3 + 1] = -9999; } continue; }
      L[k] -= dts; V[k * 3] *= drag; V[k * 3 + 2] *= drag; V[k * 3 + 1] = V[k * 3 + 1] * dragY - dts * 0.6;
      P[k * 3] += V[k * 3] * dts; P[k * 3 + 1] = Math.max(0.25, P[k * 3 + 1] + V[k * 3 + 1] * dts); P[k * 3 + 2] += V[k * 3 + 2] * dts;
      A[k * 2] = Math.min(1, Math.max(0.001, 1 - L[k] / L0[k]));
    }
    this.spray.geometry.attributes.position.needsUpdate = true; this.spray.geometry.attributes.aAge.needsUpdate = true;
  }

  // ---- wet-track reflections ----------------------------------------------------------------
  // Planar approximation: the cars (and their lamp glows) are rendered from a camera mirrored in
  // the road plane under the followed car into a half-resolution target; the asphalt shader
  // samples it projectively, smeared vertically (water film), weighted by wetness, puddles and
  // Fresnel. Only the cars' layer is drawn, the shadow maps are reused: ~+1 draw per car part.
  initWetReflect() {
    const rt = new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType, depthBuffer: true });
    rt.texture.generateMipmaps = false;
    const U = { uRefl: { value: rt.texture }, uReflM: { value: new THREE.Matrix4() }, uReflK: { value: 0 }, uReflB: { value: 0.004 } };
    this._refl = { rt, U, cam: new THREE.PerspectiveCamera(), n: new THREE.Vector3(0, 1, 0) };
    this._refl.cam.layers.set(2);
    const mat = this.asphaltMat, prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey;
    mat.onBeforeCompile = (sh, r) => {
      prev.call(mat, sh, r);
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform mat4 uReflM; varying vec4 vReflP;')
        .replace('#include <fog_vertex>', '#include <fog_vertex>\nvReflP = uReflM * vec4(vWPos, 1.0);');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D uRefl; uniform float uReflK, uReflB; varying vec4 vReflP;')
        .replace('#include <opaque_fragment>', `if (uReflK > 0.001) {
            vec2 ruv = vReflP.xy / vReflP.w;
            // water film: reflections stretch towards the viewer, less so in standing water
            float st = uReflB * (1.0 - 0.75 * pud);
            vec4 rc = texture2D(uRefl, ruv) * 0.3 + (texture2D(uRefl, ruv + vec2(0.0, st)) + texture2D(uRefl, ruv - vec2(0.0, st))) * 0.22
                    + (texture2D(uRefl, ruv + vec2(0.0, st * 2.6)) + texture2D(uRefl, ruv - vec2(0.0, st * 2.6))) * 0.13;
            vec3 Vr = normalize(cameraPosition - vWPos);
            float fres = 0.05 + 0.95 * pow(1.0 - clamp(Vr.y, 0.0, 1.0), 5.0);
            float kr = uReflK * mix(0.62 * wetL, 1.0, pud) * mix(0.55, 1.0, fres);
            outgoingLight = mix(outgoingLight, outgoingLight * 0.35 + rc.rgb * 0.9, kr * min(1.0, rc.a));
          }
          #include <opaque_fragment>`);
    };
    mat.customProgramCacheKey = () => prevKey.call(mat) + '|refl';
    mat.needsUpdate = true;
  }

  renderWetReflect() {
    const R = this._refl; if (!R) return;
    const k = this._fxOff ? 0 : Math.min(1, Math.max(0, ((this.wet || 0) - 0.12) * 1.6));
    R.U.uReflK.value = k;
    if (k <= 0) return;
    const rd = this.renderer, cam = this.camera, vc = R.cam;
    const w = Math.max(16, Math.round((this.W || 640) * 0.5)), h = Math.max(16, Math.round((this.H || 360) * 0.5));
    if (R.rt.width !== w || R.rt.height !== h) R.rt.setSize(w, h);
    // mirror plane: the road under the followed car
    const y0 = (this._camCar?.mesh.position.y ?? 0) - 0.02;
    const P = R.p ||= new THREE.Vector3(), V = R.v ||= new THREE.Vector3(), T = R.t ||= new THREE.Vector3(), M = R.m ||= new THREE.Matrix4(), n = R.n;
    cam.updateMatrixWorld();
    const cp = V.setFromMatrixPosition(cam.matrixWorld);
    P.set(cp.x, y0, cp.z);
    const view = T.subVectors(P, cp).reflect(n).negate().add(P);
    if (cp.y - y0 < 0.05) { R.U.uReflK.value = 0; return; }
    M.extractRotation(cam.matrixWorld);
    const look = (R.l ||= new THREE.Vector3()).set(0, 0, -1).applyMatrix4(M).add(cp);
    const tgt = (R.tg ||= new THREE.Vector3()).subVectors(P, look).reflect(n).negate().add(P);
    vc.position.copy(view);
    vc.up.set(0, 1, 0).applyMatrix4(M).reflect(n);
    vc.lookAt(tgt);
    vc.near = cam.near; vc.far = cam.far;
    vc.updateMatrixWorld(); vc.projectionMatrix.copy(cam.projectionMatrix); vc.projectionMatrixInverse.copy(cam.projectionMatrixInverse);
    R.U.uReflM.value.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(vc.projectionMatrix).multiply(vc.matrixWorldInverse);
    for (const o of this.scene.children) if (o.isLight && !o.layers.isEnabled(2)) o.layers.enable(2);
    // smear length in screen space: longer for a long lens (TV) than for a wide one
    R.U.uReflB.value = 0.0035 + 0.006 * Math.min(1, 30 / cam.fov);
    const bg = this.scene.background, au = rd.shadowMap.autoUpdate, prevRT = rd.getRenderTarget(), cc = rd.getClearColor(R.cc ||= new THREE.Color()), ca = rd.getClearAlpha();
    this.scene.background = null; rd.shadowMap.autoUpdate = false;
    rd.setRenderTarget(R.rt); rd.setClearColor(0x000000, 0); rd.clear(); rd.render(this.scene, vc);
    rd.setRenderTarget(prevRT); rd.setClearColor(cc, ca); rd.shadowMap.autoUpdate = au; this.scene.background = bg;
  }

  // ---- car lamps ----------------------------------------------------------------------------
  // Head / tail / brake / rain-light glows for every car in one point sprite draw (soft core,
  // halo and a short anamorphic streak, sized in metres with a minimum pixel size so distant
  // cars stay visible as points of light); headlight beams projected onto the asphalt and a
  // faint beam in the air (one instanced draw each); two real spot lights ride on the
  // headlights of the cars nearest the camera so they light up the cars and kerbs ahead.
  buildCarLights() {
    const cars = [...this.cars.values()];
    let nG = 0, nH = 0;
    for (const c of cars) { const L = c.mesh.userData.lamps; if (!L) continue; nG += L.head.length + L.tail.length; if (L.head.length) nH++; }
    this._cl = { nG, nH };
    if (!nG) return;
    const g = new THREE.BufferGeometry(), dyn = (n, k) => new THREE.BufferAttribute(new Float32Array(n * k), k).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', dyn(nG, 3)); g.setAttribute('color', dyn(nG, 3)); g.setAttribute('size', dyn(nG, 1));
    const glowMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uPx: { value: 600 } },
      vertexShader: `attribute float size; varying vec3 vC; uniform float uPx;
        #include <common>
        #include <logdepthbuf_pars_vertex>
        void main() { vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
          float ps = size * uPx / max(0.5, -mv.z); gl_PointSize = size > 0.0 ? clamp(ps, 5.0, 320.0) : 0.0;
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: `varying vec3 vC;
        #include <logdepthbuf_pars_fragment>
        void main() {
          #include <logdepthbuf_fragment>
          vec2 p = gl_PointCoord - 0.5; float d = length(p) * 2.0;
          float a = exp(-d * d * 30.0) * 1.4 + max(0.0, exp(-d * 4.5) * 0.3 * (1.0 - d)) + exp(-abs(p.y) * 90.0) * pow(max(0.0, 1.0 - abs(p.x) * 2.0), 3.0) * 0.4;
          if (a < 0.004) discard;
          gl_FragColor = vec4(vC * a, 1.0);
        }`,
      vertexColors: true,
    });
    this.carGlow = new THREE.Points(g, glowMat); this.carGlow.frustumCulled = false; this.carGlow.renderOrder = 4; this.carGlow.layers.enable(2); this.scene.add(this.carGlow);
    if (!nH) return;
    // beam on the road: bright close to the nose, spreading and fading ahead (two lamp lobes)
    const tex = canvasTex(64, 128, (c, w, h) => {
      const im = c.createImageData(w, h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const v = 1 - y / (h - 1), u = x / (w - 1) - 0.5; // v: 0 = nose .. 1 = far end
        const spread = 0.12 + 0.38 * Math.pow(v, 0.7);
        const lobes = Math.exp(-Math.pow((Math.abs(u) - 0.1 * (1 - v)) / spread, 2) * 1.6);
        const a = Math.min(1, v / 0.1) * Math.pow(1 - v, 1.1) * lobes * (0.55 + 0.45 * Math.min(1, v / 0.3));
        const k = (y * w + x) * 4; im.data[k] = 255; im.data[k + 1] = 255; im.data[k + 2] = 255; im.data[k + 3] = Math.round(255 * Math.min(1, a * 1.25));
      }
      c.putImageData(im, 0, 0);
    });
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    // plane spanning local +x (ahead of the nose, v 0..1) and z (u), origin at the nose
    const pg = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).rotateY(-Math.PI / 2).translate(0.5, 0, 0);
    const beamMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, fog: true });
    this.carBeam = new THREE.InstancedMesh(pg, beamMat, nH); this.carBeam.frustumCulled = false; this.carBeam.renderOrder = 2;
    this.carBeam.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(nH * 3), 3); this.scene.add(this.carBeam);
    // beam in the air: open cone from the nose, brightest near the lamps, soft at the edges
    const cg = new THREE.CylinderGeometry(0.25, 1, 1, 18, 1, true).translate(0, -0.5, 0).rotateZ(Math.PI / 2);
    const coneMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: `varying float vH; varying vec3 vN; varying vec3 vV; varying vec3 vI;
        #include <common>
        #include <logdepthbuf_pars_vertex>
        void main() { vH = uv.y; vI = vec3(1.0);
          #ifdef USE_INSTANCING_COLOR
            vI = instanceColor;
          #endif
          vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vN = normalize(mat3(modelMatrix * instanceMatrix) * normal); vV = normalize(cameraPosition - wp.xyz);
          gl_Position = projectionMatrix * viewMatrix * wp;
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: `varying float vH; varying vec3 vN; varying vec3 vV; varying vec3 vI;
        #include <logdepthbuf_pars_fragment>
        void main() {
          #include <logdepthbuf_fragment>
          float f = abs(dot(normalize(vN), normalize(vV))); float a = pow(vH, 2.2) * f * f;
          gl_FragColor = vec4(vI * a, 1.0); }`,
    });
    this.carCone = new THREE.InstancedMesh(cg, coneMat, nH); this.carCone.frustumCulled = false; this.carCone.renderOrder = 3;
    this.carCone.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(nH * 3), 3); this.scene.add(this.carCone);
    if (!this.low && this.nightable && !this.carSpots) {
      this.carSpots = [0, 1].map(() => { const s = new THREE.SpotLight(0xeef3ff, 0, 90, 0.42, 0.6, 1.7); this.scene.add(s); this.scene.add(s.target); return s; });
    }
    // precompile the lamp / beam shaders (and every material against the final light set) now,
    // instead of on the frame the headlights first switch on
    try {
      const hid = [this.carBeam, this.carCone, this.carGlow, this._pitNight?.spillMesh, this._lampRig?.beamMat, this.poolMat].filter((o) => o && !o.visible); hid.forEach((o) => { o.visible = true; });
      this.renderer.compile(this.scene, this.camera);
      hid.forEach((o) => { o.visible = false; });
    } catch {}
  }

  updateCarLights(dt) {
    const nt = this.night ? 1 : (this._night || 0), wet = this.wet || 0;
    const closed = this.category !== 'formula' && this.category !== 'junior';
    // headlights: on at dusk / night, and in the rain for closed cars
    const headOn = closed ? Math.max(Math.min(1, nt * 1.6), wet > 0.3 ? 0.6 : 0) : 0;
    if (!this.carGlow && this._cl) return;
    if (!this.carGlow) { if (!(closed || wet > 0.25 || nt > 0.05)) return; this.buildCarLights(); if (!this.carGlow) return; }
    const cam = this.camera.position, inCar = this.camMode === 'onboard' || this.camMode === 'cockpit';
    this.carGlow.material.uniforms.uPx.value = (this.H || 720) / (2 * Math.tan(this.camera.fov * Math.PI / 360));
    const G = this.carGlow.geometry.attributes, P = G.position.array, C = G.color.array, S = G.size.array;
    const v = this._clV ||= new THREE.Vector3(), M4 = this._clM ||= new THREE.Matrix4(), Q = this._clQ ||= new THREE.Quaternion(), E = this._clE ||= new THREE.Euler(), SC = this._clS ||= new THREE.Vector3(), col = this._clC ||= new THREE.Color();
    const rainBlink = Math.floor(performance.now() / 250) % 2;
    let k = 0, h = 0;
    const spotC = [];
    for (const car of this.cars.values()) {
      const m = car.mesh, L = m.userData.lamps; if (!L) continue;
      const vis = m.visible && !(inCar && car === this._camCar);
      m.updateMatrix();
      const ry = m.rotation.y, fx = Math.cos(ry), fz = -Math.sin(ry);
      const dx = cam.x - m.position.x, dz = cam.z - m.position.z, dist = Math.hypot(dx, dz) || 1;
      const face = (fx * dx + fz * dz) / dist; // +1: camera in front of the car
      // brake lamps: smoothed on decelerations
      car._brk = (car._brk || 0) + (((car._acc || 0) < -9 ? 1 : 0) - (car._brk || 0)) * Math.min(1, dt * 12);
      for (const p of L.head) {
        v.set(p[0] + 0.12, p[1], p[2]).applyMatrix4(m.matrix); P[k * 3] = v.x; P[k * 3 + 1] = v.y; P[k * 3 + 2] = v.z;
        const f = Math.max(0, face), I = vis ? headOn * (0.35 + 3.2 * f * f * f) : 0;
        C[k * 3] = I; C[k * 3 + 1] = I * 0.98; C[k * 3 + 2] = I * 0.93; S[k] = I > 0.001 ? 0.45 + 1.5 * f * f : 0; k++;
      }
      for (const p of L.tail) {
        v.set(p[0] - 0.06, p[1], p[2]).applyMatrix4(m.matrix); P[k * 3] = v.x; P[k * 3 + 1] = v.y; P[k * 3 + 2] = v.z;
        const b = Math.max(0, -face);
        let I = L.rain ? (wet > 0.25 ? (rainBlink ? 1.6 : 0.1) : 0) : (Math.max(headOn, 0.15 + 0.85 * nt) * 0.55 + car._brk * (1.4 + 0.8 * nt)) * (0.4 + 0.6 * b * b);
        if (!vis) I = 0;
        C[k * 3] = I; C[k * 3 + 1] = I * 0.06; C[k * 3 + 2] = I * 0.035; S[k] = I > 0.001 ? (L.rain ? 0.55 : 0.32 + 0.35 * car._brk) * (0.7 + 0.5 * b) : 0; k++;
      }
      if (L.head.length && this.carBeam) {
        const on = vis || (inCar && car === this._camCar) ? headOn : 0;
        if (on > 0.01 && m.visible) {
          v.set(L.head[0][0] + 0.1, 0, 0).applyMatrix4(m.matrix); v.y = m.position.y + 0.035;
          E.set(0, ry, m.rotation.z * 0.9); Q.setFromEuler(E);
          M4.compose(v, Q, SC.set(46, 1, 15)); this.carBeam.setMatrixAt(h, M4);
          const bi = on * (0.38 + 0.25 * wet) * (nt > 0.05 ? 1 : 0.35);
          this.carBeam.setColorAt(h, col.setRGB(bi, bi * 0.96, bi * 0.88));
          v.set(L.head[0][0] - 0.05, L.head[0][1], 0).applyMatrix4(m.matrix);
          E.set(0, ry, m.rotation.z - 0.05); Q.setFromEuler(E);
          M4.compose(v, Q, SC.set(26, 3.6, 3.6)); this.carCone.setMatrixAt(h, M4);
          const ci = on * (0.035 + 0.1 * wet) * Math.min(1, 0.3 + nt) * (0.25 + 0.75 * Math.sqrt(Math.max(0, 1 - face * face)));
          this.carCone.setColorAt(h, col.setRGB(ci, ci * 0.97, ci * 0.92));
          if (this.carSpots && nt > 0.05) spotC.push([m.position.distanceToSquared(this.camLook), car]);
        } else { this.carBeam.setMatrixAt(h, M4.makeScale(0, 0, 0)); this.carCone.setMatrixAt(h, M4); }
        h++;
      }
    }
    G.position.needsUpdate = true; G.color.needsUpdate = true; G.size.needsUpdate = true;
    if (this.carBeam) {
      this.carBeam.instanceMatrix.needsUpdate = true; this.carBeam.instanceColor.needsUpdate = true;
      this.carCone.instanceMatrix.needsUpdate = true; this.carCone.instanceColor.needsUpdate = true;
      this.carBeam.visible = this.carCone.visible = headOn > 0.01;
    }
    if (this.carSpots) {
      const on = nt > 0.08;
      spotC.sort((a, b) => a[0] - b[0]);
      this.carSpots.forEach((s, j) => {
        const e = spotC[j]; if (!on || !e) { s.intensity = 0; return; }
        const m = e[1].mesh, L = m.userData.lamps;
        s.position.set(L.head[0][0] + 0.2, L.head[0][1] + 0.1, 0).applyMatrix4(m.matrix);
        s.target.position.set(L.head[0][0] + 28, -1.2, 0).applyMatrix4(m.matrix);
        s.intensity = 420 * headOn * THREE.MathUtils.smoothstep(170 - Math.sqrt(e[0]), 0, 80);
      });
    }
  }

  // Visual pit-lane journey, decoupled from the sim (which freezes a pitting car on the line):
  // 'in' (entry -> own box at the limiter) -> 'stop' (in the box, or pushed back into the
  // garage nose-out while st.garage) -> 'out' (box -> exit at the limiter, rejoin, then hand
  // back to the sim position once it has caught up). Optional st.pitting (the car will pit at
  // the end of this lap) lets it take the pit entry road instead of appearing there.
  pitStep(car, st, dt, race) {
    const N = this.geo.N, ds = this.geo.ds, P = this.pitSpan, LIM = 22;
    const rel = (v) => { let d = ((v % N) + N) % N; if (d > N / 2) d -= N; return d; };
    const simQ = rel(st.s);
    const bayQ = car.bay ? car.bay.q : Math.min(P - 4, 6 + (car.box || 0) * 2.6);
    let pc = car.pc;
    if (!pc) {
      if (st.inPit) {
        if (!car._placed) pc = { q: bayQ, phase: 'stop', v: 0, g: st.garage ? 1 : 0 };
        else { pc = { q: -P - 14, phase: 'in', v: LIM, g: 0 }; if (this.focusKey === st.key || this.dirFocus === st.key) this._cut = true; }
      } else if (st.pitting && simQ > -P - 14 && simQ < -P - 2) pc = { q: simQ, phase: 'in', v: Math.max(LIM, st.speed || LIM), g: 0, approach: true };
      else return null;
      car.pc = pc;
    }
    pc.bayQ = bayQ;
    const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const laneAt = (q) => { const a = Math.abs(q); if (a <= P + 2) return this.pitOff; const rl = this.line ? this.line[((Math.round(q) % N) + N) % N] : race; return this.pitOff + (rl - this.pitOff) * sm(P + 2, P + 14, a); };
    let spd = 0, lane = this.pitOff, yaw = 0;
    if (pc.phase === 'in') {
      if (!st.inPit && !st.pitting) { if (pc.approach) { car.pc = null; return null; } pc.phase = 'out'; pc.q0 = pc.q - 10; }
      else {
        if (st.inPit) pc.approach = false;
        const dist = Math.max(0, (bayQ - pc.q) * ds);
        const vt = Math.min(LIM, Math.sqrt(2 * 7 * dist) + 0.5);
        pc.v = pc.v > vt ? Math.max(vt, pc.v - 30 * dt) : Math.min(vt, pc.v + 8 * dt);
        pc.q = Math.min(bayQ, pc.q + pc.v * dt / ds); spd = pc.v;
        if (bayQ - pc.q < 0.01) { pc.q = bayQ; spd = pc.v = 0; if (st.inPit) pc.phase = 'stop'; }
        lane = laneAt(pc.q) + (this.pitBoxOff - laneAt(pc.q)) * sm(5, 0.6, bayQ - pc.q);
      }
    }
    if (pc.phase === 'stop') {
      const gt = st.inPit && st.garage ? 1 : 0;
      pc.g = (pc.g || 0) + Math.sign(gt - (pc.g || 0)) * Math.min(Math.abs(gt - (pc.g || 0)), dt / 3.2);
      if (!st.inPit && pc.g <= 0.001) { pc.phase = 'out'; pc.v = 0; pc.q0 = pc.q; }
      const e = sm(0, 1, pc.g); lane = this.pitBoxOff + (this.pitGarage - this.pitBoxOff) * e; yaw = Math.PI / 2 * e;
    }
    if (pc.phase === 'out') {
      pc.q0 ??= pc.q;
      const gap = simQ - pc.q; // > 0: the sim car is ahead of the visual one
      const joined = pc.q > P + 2;
      const target = !joined ? LIM : gap > 0.5 ? (st.speed || LIM) * 1.25 : Math.max(LIM, st.speed || LIM);
      pc.v = Math.min(target, pc.v + (joined ? 15 : 9) * dt);
      pc.q += pc.v * dt / ds; spd = pc.v;
      lane = laneAt(pc.q) + (this.pitBoxOff - laneAt(pc.q)) * (1 - sm(0.6, 4.5, pc.q - pc.q0));
      if (pc.q > P + 14) {
        const vis = this._frustumHas?.(car.mesh);
        if ((gap > -0.25 && gap < 0.35) || (Math.abs(gap) > 30 && !vis)) { car.pc = null; return null; }
      }
    }
    return { s: pc.q, spd, lane, pit: true, yaw, exact: !pc.approach || pc.q > -P - 2 };
  }

  _frustumHas(o) {
    const f = this._frus ||= new THREE.Frustum(), m = this._frusM ||= new THREE.Matrix4();
    m.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse); f.setFromProjectionMatrix(m);
    return f.containsPoint(o.position);
  }

  pose(s, lane) {
    const N = this.geo.N;
    const i0 = this.open ? Math.min(N - 2, Math.max(0, Math.floor(s))) : Math.floor(s) % N, i1 = this.open ? i0 + 1 : (i0 + 1) % N, f = this.open ? Math.min(1, Math.max(0, s - i0)) : s - Math.floor(s);
    let hd = this.geo.hdg[i1] - this.geo.hdg[i0]; while (hd > Math.PI) hd -= 2 * Math.PI; while (hd < -Math.PI) hd += 2 * Math.PI;
    const h = this.geo.hdg[i0] + hd * f;
    const yy = this.geo.h ? this.geo.h[i0] + (this.geo.h[i1] - this.geo.h[i0]) * f : 0;
    return { x: this.geo.x[i0] + (this.geo.x[i1] - this.geo.x[i0]) * f - Math.sin(h) * lane, z: this.geo.y[i0] + (this.geo.y[i1] - this.geo.y[i0]) * f + Math.cos(h) * lane, h, y: yy };
  }

  placeCar(car, st, s, laneCur, speed, dt, yawX = 0) {
    const N = this.geo.N, m = car.mesh;
    m.visible = true; car._placed = true;
    const i0 = this.open ? Math.min(N - 2, Math.max(0, Math.floor(s))) : Math.floor(s) % N, i1 = this.open ? i0 + 1 : (i0 + 1) % N, f = this.open ? Math.min(1, Math.max(0, s - i0)) : s - Math.floor(s);
    let hd = this.geo.hdg[i1] - this.geo.hdg[i0]; while (hd > Math.PI) hd -= 2 * Math.PI; while (hd < -Math.PI) hd += 2 * Math.PI;
    const h = this.geo.hdg[i0] + hd * f;
    const nx = -Math.sin(h), nz = Math.cos(h);
    const x = this.geo.x[i0] + (this.geo.x[i1] - this.geo.x[i0]) * f + nx * laneCur;
    const z = this.geo.y[i0] + (this.geo.y[i1] - this.geo.y[i0]) * f + nz * laneCur;
    let yy = 0.02;
    if (this.geo.h) {
      const h0 = this.geo.h[i0], h1 = this.geo.h[i1]; yy += h0 + (h1 - h0) * f;
      for (const ci of this.geo.crests || []) { const dd = s - ci; if (dd > 0 && dd < 10 && speed > 22) { yy += Math.sin((dd / 10) * Math.PI) * Math.min(1.6, (speed - 22) / 14); } }
      m.rotation.z = Math.atan2(h1 - h0, this.geo.ds) * 0.9;
    }
    // yaw follows the direction of travel including lane changes
    const prevLane = car._pl ?? laneCur; car._pl = laneCur;
    const yawLat = speed > 2 && dt > 0 ? Math.atan2(laneCur - prevLane, speed * dt) : 0;
    car._yaw = (car._yaw || 0) + (Math.max(-0.35, Math.min(0.35, yawLat)) - (car._yaw || 0)) * Math.min(1, dt * 8);
    m.position.set(x, yy, z);
    m.rotation.y = -h - car._yaw + yawX;
    const k = this.geo.k[i0];
    // body roll towards the outside of the corner, pitch from braking / acceleration
    const stiff = this.category === 'rally' ? 2.2 : this.category === 'endurance' ? 1.3 : 1;
    car._roll = (car._roll || 0) + (Math.max(-0.05, Math.min(0.05, -k * speed ** 2 * 0.0011 * stiff)) - (car._roll || 0)) * Math.min(1, dt * 6);
    m.rotation.x = car._roll;
    if (dt > 0) { const acc = (speed - (car._v ?? speed)) / dt; car._v = speed; car._acc = (car._acc || 0) + (Math.max(-45, Math.min(15, acc)) - (car._acc || 0)) * Math.min(1, dt * 5); }
    m.rotation.z = (this.geo.h ? m.rotation.z : 0) + Math.max(-0.035, Math.min(0.02, (car._acc || 0) * 0.0009 * stiff));
    const spin = speed * dt / 0.34;
    const steer = Math.max(-0.42, Math.min(0.42, Math.atan(3.5 * (this.geo.k[(i0 + 3) % N] || k)) * 1.4));
    m.userData.wheels.forEach((w, wi) => { for (const sp of w.userData.spin) sp.rotation.z -= spin; if (wi < 2) w.rotation.y = -steer; });
    // wheel motion blur: past ~65 km/h the spokes smear into a disc (hysteresis, no flicker)
    const blur = !this.low && (car._blur ? speed > 15 : speed > 18);
    if (blur !== !!car._blur) { car._blur = blur; for (const w of m.userData.wheels) for (const b of w.userData.blur || []) b.visible = blur; }
    // dirt builds up with the distance driven (dust / mud on gravel, slush on snow, grime on tarmac)
    if (car.dirtMat && dt > 0) {
      car.odo = (car.odo || 0) + speed * dt;
      const D = this._dirtCfg, v = Math.min(D.max, D.base + (D.max - D.base) * (1 - Math.exp(-car.odo / D.dist)));
      if (Math.abs(v - car.dirtMat.userData.dirtU.value) > 0.004) car.dirtMat.userData.dirtU.value = v;
    }
    if (st.tyreColor && st.tyreColor !== car.tyre) { car.tyre = st.tyreColor; setTyreColor(m, st.tyreColor); }
    car.state = st;
  }

  startIntro(sec = 5) { this.introT = sec; this.introDur = sec; this.introStart = performance.now(); }

  pickBattle() {
    // auto director: find the closest fight among running cars, prefer player cars
    let best = null, bs = Infinity;
    for (const car of this.cars.values()) {
      const st = car.state; if (!st || !car.mesh.visible || st.gap == null) continue;
      const score = st.gap - (car.isPlayer ? 0.6 : 0) + (st.pos || 20) * 0.03;
      if (st.gap < 1.4 && score < bs) { bs = score; best = st.key; }
    }
    return best;
  }

  updateCamera(focus, dt) {
    dt = Number.isFinite(dt) ? Math.min(0.1, Math.max(0, dt)) : 0;
    if (this.introT > 0) {
      this.introT = this.introDur - (performance.now() - this.introStart) / 1000;
      // a camera button pressed during the establishing shot takes over at once (no dead clicks)
      const uiKey = this.camMode + '|' + !!this.director + '|' + this.focusKey;
      if (this._intro && this._intro.ui !== uiKey) this.introT = 0;
      if (this.introT <= 0) { this.introT = 0; this._cut = true; }
      const k = Math.min(1, 1 - this.introT / this.introDur);
      // helicopter establishing shot: a descending orbit around the grid that ends low in front
      // of the leading car, looking back down the field
      if (!this._intro) {
        const vis = [...this.cars.values()].filter((c) => c.mesh.visible);
        const gc = new THREE.Vector3(); vis.forEach((c) => gc.add(c.mesh.position)); if (vis.length) gc.divideScalar(vis.length); else gc.set(this.geo.x[0], this.geo.h ? this.geo.h[0] : 0, this.geo.y[0]);
        const lead = vis.reduce((b, c) => (!b || (c.state?.pos || 99) < (b.state?.pos || 99) ? c : b), null) || focus;
        const h0 = this.geo.hdg[0] || 0;
        this._intro = { gc, lead, ui: uiKey, aEnd: Math.atan2(Math.sin(h0) * 0.82 - Math.cos(h0) * 0.57, Math.cos(h0) * 0.82 + Math.sin(h0) * 0.57) };
      }
      const I = this._intro, e = k * k * (3 - 2 * k);
      const lp = I.lead ? I.lead.mesh.position : I.gc;
      const ctr = (this._iC ||= new THREE.Vector3()).copy(I.gc).lerp(lp, Math.pow(e, 1.5));
      const a = I.aEnd - 2.1 * (1 - e), r = 95 + (17 - 95) * Math.pow(e, 1.25), y = 52 + (3.2 - 52) * Math.pow(e, 1.15);
      this.camera.position.set(ctr.x + Math.cos(a) * r, (ctr.y || 0) + y, ctr.z + Math.sin(a) * r);
      const look = (this._iL ||= new THREE.Vector3()).copy(I.gc).lerp(lp, 0.6 * e); look.y += 0.8;
      this.camera.fov = 36 + 12 * e; this.camera.updateProjectionMatrix();
      this.camera.lookAt(look);
      this.camPos.copy(this.camera.position); this.camLook.copy(look);
      this.skyDome.position.copy(this.camera.position);
      const sc = this.sun.shadow.camera; if (sc.right !== 70) { sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.updateProjectionMatrix(); }
      this.sun.position.copy(look).addScaledVector(this.sunDir, 400); this.sun.target.position.copy(look);
      if (this.composer?.dof) this.composer.dof.enabled = false;
      if (this.introT <= 0) this._intro = null;
      this._camCar = null;
      return;
    }
    if (this.director) {
      this.dirT = (this.dirT || 0) - dt;
      const cur = this.cars.get(this.dirFocus);
      // the followed car goes into / leaves the pits: cut to / away from the garage camera soon
      if (cur && this.camMode !== 'garage' && cur.pc?.phase === 'stop') this.dirT = Math.min(this.dirT, 1.2);
      if (cur && this.camMode === 'garage' && !cur.pc) this.dirT = Math.min(this.dirT, 0.6);
      // the followed car retired / went into the garage: cut away now
      if (this.dirFocus && (!cur || !cur.mesh.visible)) this.dirT = 0;
      if (this.dirT <= 0) {
        const b = this.pickBattle();
        this.dirFocus = b || this.focusKey;
        const df = this.cars.get(this.dirFocus);
        const fast = (this._simK || 1) > 12; // fast-forward: only the steady wide shots are readable
        const pool = fast ? ['tv', 'heli'] : df?.pc ? ['garage', 'garage', 'tv'] : ['tv', 'tv', 'chase', 'heli', 'tv', 'onboard'];
        // never cut to the same shot type twice in a row unless nothing else fits
        const opts = pool.filter((m2) => m2 !== this.camMode);
        const mode = (opts.length ? opts : pool)[Math.floor(Math.random() * (opts.length || pool.length))];
        this.camMode = mode;
        this.dirT = mode === 'tv' ? 8 + Math.random() * 6 : mode === 'heli' ? 6 + Math.random() * 4 : mode === 'garage' ? 7 + Math.random() * 5 : 5 + Math.random() * 4;
        this._cut = true;
      }
      const df = this.cars.get(this.dirFocus);
      if (df && df.mesh.visible) focus = df;
    }
    if (!focus || !focus.mesh) return;
    // ---- robustness: apparent (sim-speed scaled) velocity of the followed car, cut on a new
    // car or on a jump, so every filter below works the same at 1x, 8x and 32x ----
    {
      const p = focus.mesh.position, lp = (this._camLP ||= new THREE.Vector3());
      const spd0 = focus.state?.speed || 0;
      if (this._camCar !== focus) { this._cut = true; this._tvHold = 99; }
      else if (dt > 0) {
        const mv = Math.hypot(p.x - lp.x, p.z - lp.z);
        // a jump is a move far beyond the previous frame's (steady fast-forward motion is not one)
        const jump = mv > 60 + 3 * (this._mvPrev || 0); this._mvPrev = mv;
        if (jump) { this._cut = true; this._tvHold = 99; }
        else { const v = mv / dt; this._vVis = (this._vVis || 0) + (v - (this._vVis || 0)) * 0.3; if (spd0 > 8) { const k = Math.max(1, Math.min(64, v / spd0)); this._simK = (this._simK || 1) + (k - (this._simK || 1)) * 0.2; } }
      }
      lp.copy(p);
    }
    const simK = this._simK || 1, vVis = this._vVis || 0;
    const ease = (rate) => 1 - Math.exp(-rate * dt * simK);
    this._camCar = focus;
    // garage camera falls back to the TV coverage while the car is out on track
    const mode = this.camMode === 'garage' && !focus.pc ? 'tv' : this.camMode;
    const wasCut = this._cut;
    const m = focus.mesh;
    const fwd = new THREE.Vector3(Math.cos(-m.rotation.y), 0, -Math.sin(-m.rotation.y));
    // car faces +x in local space; world forward = rotate (1,0,0) by rotation.y
    fwd.set(Math.cos(m.rotation.y), 0, -Math.sin(m.rotation.y));
    const target = m.position.clone();
    let pos, look = target.clone().add(new THREE.Vector3(0, 0.8, 0));
    let fov = 50;
    const spd = focus.state?.speed || 0;
    this._shT = (this._shT || 0) + dt;
    if (mode === 'garage') {
      // pit-lane camera at the team's box: low on the fast lane, looking into the box / garage
      const bq = focus.pc ? focus.pc.bayQ : focus.bay?.q ?? 0, N = this.geo.N, t = this._shT;
      const i = ((Math.round(bq) % N) + N) % N;
      // stand off along the building (towards its middle), on the box side of the fast lane
      const along = (bq > 0 ? -1 : 1) * (1.3 + Math.sin(t * 0.07) * 0.35);
      const p0 = this.pose((bq + along + N) % N, this.pit.fl0 + 1.4);
      pos = new THREE.Vector3(p0.x, (p0.y || 0) + 1.65 + 0.1 * Math.sin(t * 0.11), p0.z);
      const inG = (focus.pc?.g || 0) > 0.5;
      const tl = inG ? this.pose(i, this.pitGarage - 0.8) : null;
      look = inG ? new THREE.Vector3(tl.x, (tl.y || 0) + 0.9, tl.z) : target.clone().add(new THREE.Vector3(0, 0.6, 0));
      fov = inG ? 46 : 40;
      // the car is still far down the pit lane (long pit entries): follow it until it nears its box
      if (!inG && pos.distanceTo(target) > 110) { pos = target.clone().addScaledVector(fwd, -8).add(new THREE.Vector3(0, 3.4, 0)); fov = 55; }
    } else if (this.camMode === 'chase') {
      // camera on a soft spring: it lags behind the car's yaw so corners show the car turning
      if (!this._chaseFwd || this._cut) this._chaseFwd = fwd.clone();
      this._chaseFwd.lerp(fwd, focus.pc ? 1 : ease(3.2)); if (this._chaseFwd.lengthSq() < 1e-4) this._chaseFwd.copy(fwd); this._chaseFwd.normalize();
      pos = target.clone().addScaledVector(this._chaseFwd, focus.pc ? -8 : -9.5).add(new THREE.Vector3(0, focus.pc ? 3.4 : 3.0, 0));
      // the lagging camera never swings out through the barriers: clamp it to the road corridor
      if (!this.open && this.wallOff && !focus.pc) {
        const N = this.geo.N, i = (((Math.round((focus.state?.s || 0) - 9.5 / this.geo.ds)) % N) + N) % N;
        const nx = -Math.sin(this.geo.hdg[i]), nz = Math.cos(this.geo.hdg[i]);
        const lat = (pos.x - this.geo.x[i]) * nx + (pos.z - this.geo.y[i]) * nz;
        const lim = lat > 0 ? this.wallOff(i, 1) - 1.3 : -(this.wallOff(i, -1) - 1.3);
        if (Math.abs(lat) < 60 && (lat > 0 ? lat > lim : lat < lim)) { pos.x += nx * (lim - lat); pos.z += nz * (lim - lat); }
      }
      look = target.clone().addScaledVector(fwd, 6).add(new THREE.Vector3(0, 1, 0));
      fov = 58 + Math.min(10, spd * 0.11);
    } else if (this.camMode === 'cockpit') {
      m.updateMatrixWorld();
      const formula = this.category === 'formula' || this.category === 'junior';
      pos = m.localToWorld(new THREE.Vector3(formula ? -0.36 : 0.05, formula ? 0.9 : 1.05, formula ? 0 : 0.35));
      look = m.localToWorld(new THREE.Vector3(30, formula ? -0.6 : 0.8, formula ? 0 : 0.35));
      fov = 70 + Math.min(8, spd * 0.08);
    } else if (this.camMode === 'onboard') {
      // formula: T-cam above the airbox; closed cars: bonnet camera ahead of the windscreen
      const fm = this.category === 'formula' || this.category === 'junior', ra = this.category === 'rally';
      pos = target.clone().addScaledVector(fwd, fm ? -1.25 : ra ? 1.5 : 0.95).add(new THREE.Vector3(0, fm ? 1.55 : ra ? 1.36 : 1.08, 0));
      look = target.clone().addScaledVector(fwd, 35).add(new THREE.Vector3(0, fm ? 0.9 : 1.2, 0));
      fov = 62 + Math.min(10, spd * 0.1);
    } else if (this.camMode === 'heli') {
      // helicopter: flies a smoothed course (heading low-passed, no yaw snaps in corners),
      // offset to the side and slightly ahead, long lens with a slow drift
      if (!this._heliFwd || this._cut) { this._heliFwd = fwd.clone(); this._heliPos = null; }
      this._heliFwd.lerp(fwd, ease(0.5)); if (this._heliFwd.lengthSq() < 1e-4) this._heliFwd.copy(fwd); this._heliFwd.normalize();
      const side = new THREE.Vector3(-this._heliFwd.z, 0, this._heliFwd.x);
      const t = this._shT;
      if (simK > 12) {
        // fast-forward: steady high orbit locked on the car (no lag, never loses the pack)
        const a = t * 0.05; pos = target.clone().add(new THREE.Vector3(Math.cos(a) * 95, 150, Math.sin(a) * 95));
        this._heliPos = pos.clone(); look = target.clone(); fov = 38; this._snap = true;
      } else {
        // flight options: either side of the car, then higher, then overhead; the first one with a
        // clear view past the towers / stands is flown (cut when it has to change)
        const opt = (k) => { const [sd, bk, hh] = [[30, -48, 62], [-30, -48, 62], [16, -30, 125], [0, -6, 210]][k]; return target.clone().addScaledVector(this._heliFwd, bk + 6 * Math.sin(t * 0.13)).addScaledVector(side, sd + Math.sign(sd) * 8 * Math.sin(t * 0.09)).add(new THREE.Vector3(0, hh + 4 * Math.sin(t * 0.21), 0)); };
        const tl = target.clone(); tl.y += 1;
        let k = this._heliOpt || 0; this._heliClr = (this._heliClr || 0) + dt;
        if (!this.viewClear(opt(k), tl)) { for (k = 0; k < 3; k++) if (this.viewClear(opt(k), tl)) break; }
        else if (k > 0 && this._heliClr > 4 && this.viewClear(opt(0), tl)) k = 0;
        if (k !== (this._heliOpt || 0)) { this._heliOpt = k; this._heliPos = null; this._heliClr = 0; this._snap = true; }
        pos = opt(k);
        if (!this._heliPos) this._heliPos = pos.clone();
        this._heliPos.lerp(pos, ease(1.2)); pos = this._heliPos.clone();
        look = target.clone().addScaledVector(fwd, Math.min(14, spd * 0.25));
        fov = k === 3 ? 30 : k === 2 ? 26 : 34;
      }
    } else {
      // TV: nearest camera ahead of the car that actually sees it. A shot is held for a minimum
      // time and until the car has gone by; at high sim speed cameras further ahead are picked
      // so every shot still lasts; in fast-forward a steady high tracking shot takes over
      const s = focus.state?.s || 0, N = this.geo.N;
      const rel = (c) => { let d = c.i - s; if (!this.open) { if (d < -N / 2) d += N; if (d > N / 2) d -= N; } return d; };
      const tgt1 = target.clone(); tgt1.y += 0.9;
      if (simK > 12 || !this.tvCams?.length) {
        const a = this._shT * 0.04 + 1; pos = target.clone().add(new THREE.Vector3(Math.cos(a) * 120, 135, Math.sin(a) * 120));
        look = target.clone(); this._tv = null; this._snap = true; this._tvWide = true;
      } else {
        if (this._tvWide) { this._tvWide = false; this._cut = true; }
        const vS = vVis / this.geo.ds, lead = vS * 0.45, behindMax = 10 + vS * 0.35;
        this._tvHold = (this._tvHold || 0) + dt;
        let cur = this._tv && this.tvCams.includes(this._tv) ? this._tv : null;
        if (cur) {
          const d = rel(cur);
          this._tvBlind = this.losClear(cur.pos, tgt1) ? 0 : (this._tvBlind || 0) + dt;
          const gone = d < -behindMax || d > Math.max(90, lead * 3 + 40) || this._tvBlind > 0.35;
          if (gone && (this._tvHold > 0.9 || this._cut)) cur = null;
        }
        if (!cur) {
          const list = this.tvCams.map((c) => { const d = rel(c); return [d >= Math.min(lead * 0.5, 30) - 4 ? d : 999 + Math.abs(d), c]; }).sort((a, b) => a[0] - b[0]);
          let best = list[0][1];
          for (let q = 0; q < Math.min(5, list.length); q++) { if (this.losClear(list[q][1].pos, tgt1)) { best = list[q][1]; break; } }
          if (this._tv !== best) { this._tv = best; this._cut = true; }
          this._tvHold = 0; this._tvBlind = 0; cur = best;
        }
        pos = cur.pos.clone();
      }
      const best = this._tv || { ph: 0 };
      const dist = pos.distanceTo(target);
      // operator leads the car slightly; framing tightens as it approaches
      look.addScaledVector(fwd, Math.min(4, spd * 0.035));
      fov = Math.max(5, Math.min(48, 2 * Math.atan((this._tvWide ? 34 : 14) / Math.max(1, dist)) * 180 / Math.PI));
      // hand-held / tripod-head motion: slow drift plus a little shake, angular so a long lens
      // shows it as much as a real one would
      const t = this._shT + (best.ph || 0), aD = dist * Math.PI / 180;
      const jx = (Math.sin(t * 0.9) * 0.6 + Math.sin(t * 2.3 + 1.1) * 0.3 + Math.sin(t * 7.1) * 0.08) * 0.18 * aD;
      const jy = (Math.sin(t * 0.7 + 2.0) * 0.6 + Math.sin(t * 2.9) * 0.25 + Math.sin(t * 8.3 + 0.4) * 0.07) * 0.12 * aD;
      const rx = -fwd.z, rz = fwd.x;
      look.x += rx * jx; look.z += rz * jx; look.y += jy;
    }
    // never put the camera inside a building / grandstand (oriented footprint): lift it above
    // the roof; never below the terrain either
    if (this.obstacles && mode !== 'garage' && (this.camMode === 'tv' || this.camMode === 'heli' || mode === 'tv')) for (const o of this.obstacles) {
      if (!o.h) continue; const ex = pos.x - o.x, ez = pos.z - o.z; let ins;
      if (o.hl) { const c = Math.cos(o.rot), sn = Math.sin(o.rot); ins = Math.abs(ex * c - ez * sn) < o.hl + 1 && Math.abs(ex * sn + ez * c) < o.hd + 1; } else ins = ex * ex + ez * ez < o.r * o.r;
      if (ins && pos.y < o.h + 3) pos.y = o.h + 3;
    }
    if (this.camMode !== 'onboard' && this.camMode !== 'cockpit') {
      const gy = this.groundH ? this.groundH(pos.x, pos.z) : Math.max(this.envH ? this.envH(pos.x, pos.z) : -1e9, this.hillH ? this.hillH(pos.x, pos.z) : -1e9);
      if (Number.isFinite(gy) && pos.y < gy + 1.4) pos.y = gy + 1.4;
    }
    // validity: a broken position / target falls back to a plain shot of the car
    {
      const ok = (v) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
      if (!ok(target)) return;
      if (!ok(look)) look = target.clone().add(new THREE.Vector3(0, 0.8, 0));
      if (!ok(pos) || pos.distanceToSquared(look) < 1e-4) { pos = target.clone().add(new THREE.Vector3(-7, 3.5, -7)); this._cut = true; this._chaseFwd = null; this._heliFwd = null; this._heliPos = null; this._tv = null; this._camFaults = (this._camFaults || 0) + 1; }
      if (!Number.isFinite(fov)) fov = 50;
    }
    // on-board vibration: high-frequency buzz that grows with speed (kerbs/bumps feel)
    if (this.camMode === 'onboard' || this.camMode === 'cockpit') {
      const t = this._shT, a = Math.min(1, spd / 85) * (this.camMode === 'cockpit' ? 0.009 : 0.014);
      pos.y += (Math.sin(t * 43) + 0.6 * Math.sin(t * 71 + 1.3) + 0.3 * Math.sin(t * 13.7)) * a;
      const sx = -fwd.z, sz = fwd.x, lat = (Math.sin(t * 31 + 0.7) + 0.5 * Math.sin(t * 57)) * a * 0.6;
      pos.x += sx * lat; pos.z += sz * lat;
    }
    const k = 1;
    // driver's eye: hide our own helmet, allow very near geometry
    const ck = this.camMode === 'cockpit';
    if (this._ckCar && this._ckCar !== focus) { this._ckCar.mesh.userData.helmetParts?.forEach((h) => (h.visible = true)); this._ckCar = null; }
    if (ck) { focus.mesh.userData.helmetParts?.forEach((h) => (h.visible = false)); this._ckCar = focus; } else if (this._ckCar) { this._ckCar.mesh.userData.helmetParts?.forEach((h) => (h.visible = true)); this._ckCar = null; }
    if (this.camera.near !== (ck ? 0.05 : 0.3)) { this.camera.near = ck ? 0.05 : 0.3; }
    const cutNow = this._cut || wasCut || this._snap; this._snap = false;
    if (cutNow || this.camMode === 'onboard' || ck || !Number.isFinite(this.camLook.x + this.camLook.y + this.camLook.z)) { this.camPos.copy(pos); this.camLook.copy(look); this._cut = false; }
    else { this.camPos.lerp(pos, k); this.camLook.lerp(look, this.camMode === 'chase' ? 1 : this.camMode === 'heli' ? ease(3) : ease(7)); }
    this.camera.position.copy(this.camPos);
    // a cut lands on its framing at once; within a shot the zoom eases
    if (cutNow || !Number.isFinite(this.camera.fov)) this.camera.fov = fov; else this.camera.fov += (fov - this.camera.fov) * ease(4);
    // watchdog: the view has not changed for 2 s while the followed car is moving -> reset the
    // shot state
    {
      const q = this.camera.quaternion, sig = this.camPos.x + this.camPos.y * 3 + this.camPos.z * 7 + this.camLook.x * 11 + this.camLook.y * 13 + this.camLook.z * 17 + q.x;
      if (Math.abs(sig - (this._wdSig ?? 1e99)) > 1e-6 || vVis < 1 || dt === 0) this._wdT = 0; else this._wdT = (this._wdT || 0) + dt;
      this._wdSig = sig;
      if (this._wdT > 2) { this._wdT = 0; this._cut = true; this._tv = null; this._tvHold = 99; this._heliPos = null; this._heliFwd = null; this._chaseFwd = null; this._wdN = (this._wdN || 0) + 1; }
    }
    this._camDbg = { mode, cut: !!cutNow, simK, tv: this._tv ? this.tvCams.indexOf(this._tv) : -1 };
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(this.camLook);
    // shadow frustum centred a little ahead of the camera, snapped to texels to avoid shimmering
    // the frustum is only as wide as the view needs: close cameras get ~3 cm shadow texels
    // (crisp self-shadowing on the cars), the helicopter keeps the wide one
    const half = mode === 'heli' ? 70 : mode === 'tv' ? 60 : mode === 'chase' || mode === 'garage' ? 40 : 46;
    const sc = this.sun.shadow.camera;
    if (sc.right !== half) { sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.updateProjectionMatrix(); this.sun.shadow.normalBias = 0.03 * Math.max(0.5, half / 70); }
    const fc = mode === 'tv' || mode === 'heli' ? target.clone() : this.camera.position.clone().lerp(target, 0.5).addScaledVector(fwd, half * 0.45);
    const tex = (2 * half) / this.sun.shadow.mapSize.x; fc.x = Math.round(fc.x / tex) * tex; fc.z = Math.round(fc.z / tex) * tex;
    this.sun.position.copy(fc).addScaledVector(this.sunDir, 400);
    this.sun.target.position.copy(fc);
    this.skyDome.position.copy(this.camera.position);
    if (this.clouds) this.clouds.position.set(this.camera.position.x, 0, this.camera.position.z);
    // depth of field: shallow in the pit-lane camera, a hint of it on long TV lenses
    const dof = this.composer?.dof;
    if (dof) {
      const fd = this.camera.position.distanceTo(this.camLook), px = (this.H || 720) / 720;
      const on = !this._fxOff && (mode === 'garage' || (mode === 'tv' && this.camera.fov < 16));
      dof.enabled = on;
      if (on) {
        const u = dof.uniforms;
        if (mode === 'garage') { u.uFocus.value = fd; u.uRange.value = Math.max(2, fd * 0.35); u.uMax.value = 7 * px; u.uNear.value = 0.5; }
        else { u.uFocus.value = fd; u.uRange.value = fd * 0.25; u.uMax.value = 3.2 * px; u.uNear.value = 0.25; }
      }
    }
  }

  updateLabels() {
    const v = new THREE.Vector3();
    for (const car of this.cars.values()) {
      const st = car.state;
      if (!st || !car.mesh.visible || !st.label) { car.label.style.display = 'none'; continue; }
      v.copy(car.mesh.position); v.y += 2.2;
      v.project(this.camera);
      const dist = this.camera.position.distanceTo(car.mesh.position);
      if (v.z > 1 || v.z < -1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1 || (dist > 260 && !car.isPlayer) || ((this.camMode === 'onboard' || this.camMode === 'cockpit') && dist < 3)) { car.label.style.display = 'none'; continue; }
      car.label.style.display = 'block';
      if (car.label._t !== st.label) { car.label.innerHTML = st.label; car.label._t = st.label; }
      car.label.style.transform = `translate(${(v.x * 0.5 + 0.5) * this.W}px, ${(-v.y * 0.5 + 0.5) * this.H}px) translate(-50%, -100%)`;
    }
  }
}

// Rally stage geometry (open road), length in meters, with a rally-car speed profile
const stageCache = {};
export function stageGeometry(seed, km, style) {
  const key = seed + ':' + km + ':' + style;
  if (stageCache[key]) return stageCache[key];
  const path = genStage(seed, style);
  const total = km * 1000;
  const raw = path.len[path.len.length - 1];
  const sx = path.aspect, sy = 1;
  const scale = total / raw;
  const N = Math.round(total / 5);
  const x = new Float64Array(N), y = new Float64Array(N);
  let j = 0;
  for (let i = 0; i < N; i++) {
    const target = (i / (N - 1)) * raw;
    while (j < path.len.length - 2 && path.len[j + 1] < target) j++;
    const f = (target - path.len[j]) / ((path.len[j + 1] - path.len[j]) || 1);
    const a = path.pts[j], b = path.pts[Math.min(j + 1, path.pts.length - 1)];
    x[i] = (a[0] + (b[0] - a[0]) * f) * sx * scale; y[i] = (a[1] + (b[1] - a[1]) * f) * sy * scale;
  }
  const ds = total / N;
  const hdg = new Float64Array(N), k = new Float64Array(N);
  for (let i = 0; i < N; i++) { const a = Math.max(0, i - 1), b = Math.min(N - 1, i + 1); hdg[i] = Math.atan2(y[b] - y[a], x[b] - x[a]); }
  for (let i = 0; i < N; i++) { const a = Math.max(0, i - 3), b = Math.min(N - 1, i + 3); let d = hdg[b] - hdg[a]; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; k[i] = d / ((b - a) * ds || 1); }
  let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
  for (let i = 0; i < N; i++) { minx = Math.min(minx, x[i]); maxx = Math.max(maxx, x[i]); miny = Math.min(miny, y[i]); maxy = Math.max(maxy, y[i]); }
  // elevation: rolling hills plus a few sharp crests (jumps)
  const h = new Float64Array(N);
  let rs = seed * 9301 + 49297; const rnd = () => { rs = (rs * 9301 + 49297) % 233280; return rs / 233280; };
  const waves = [0, 1, 2].map(() => ({ a: 6 + rnd() * 14, f: (1 + rnd() * 3) * 2 * Math.PI / total, p: rnd() * 6 }));
  const crests = Array.from({ length: style === 'fast' ? 6 : 3 }, () => ({ c: (0.08 + rnd() * 0.84) * total, w: 18 + rnd() * 14, a: 1.6 + rnd() * 1.6 }));
  const w0 = waves.reduce((a, w) => a + w.a * Math.sin(w.p), 0);
  for (let i = 0; i < N; i++) { const d = i * (total / N); let v = -w0; for (const w of waves) v += w.a * Math.sin(d * w.f + w.p); for (const c of crests) { const t = (d - c.c) / c.w; if (Math.abs(t) < 1) v += c.a * (1 - t * t) * (t < 0 ? 1 : 0.3); } h[i] = v; }
  const geo = { open: true, N, ds, len: total, x, y, hdg, k, h, crests: crests.map((c) => Math.round(c.c / (total / N))), corners: [], bbox: [minx, miny, maxx, maxy] };
  geo.profile = speedProfile(geo, { mu: 1.1, kA: 0.00006, P: 420, cd: 0.0009, brakeMu: 1.15 });
  stageCache[key] = geo;
  return geo;
}
export function stageSampleAt(geo, progressTimeFrac) {
  return Math.min(geo.N - 1, sampleAtTimeFrac(geo.profile, Math.min(0.9999, Math.max(0, progressTimeFrac))));
}
