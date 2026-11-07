// 3D race view: circuit built from real geometry, broadcast-style cameras
import * as THREE from 'three';
import { makeForest, makeTreeShadows, vegOfKind } from './vegetation.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { trackGeometry, speedProfile, sampleAtTimeFrac } from '../engine/trackphys.js';
import { genStage, STAGE_STYLE } from './trackview.js';
import { getSettings } from '../engine/state.js';
import { passBy } from './audio.js';
import { buildCar, setTyreColor, MAT } from './cars3d.js';
import { pbr, applyHDRI, makeComposer, detailPatch, hdriSun, hdriHorizon, WET, updateSunFlare } from './gfx.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Tree geometry (origin at the base, height 1) with vertex colours: trunk + layered foliage
function colorize(g, hex) { const c = new THREE.Color(hex); const n = g.attributes.position.count; const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const k = 0.85 + Math.random() * 0.3; a[i * 3] = c.r * k; a[i * 3 + 1] = c.g * k; a[i * 3 + 2] = c.b * k; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; }
let _treeGeo = null, _bushGeo = null;
function treeGeo() {
  if (_treeGeo) return _treeGeo;
  const parts = [colorize(new THREE.CylinderGeometry(0.05, 0.08, 0.3, 6).translate(0, 0.15, 0), '#5a3d25')];
  for (let i = 0; i < 4; i++) { const r = 0.48 - i * 0.1, y = 0.25 + i * 0.18; parts.push(colorize(new THREE.ConeGeometry(r, 0.36, 8).translate(0, y + 0.18, 0), i % 2 ? '#2f5d2a' : '#27502a')); }
  _treeGeo = mergeGeometries(parts.map((g) => g.toNonIndexed()));
  _treeGeo.computeVertexNormals();
  return _treeGeo;
}
function bushGeo() {
  if (_bushGeo) return _bushGeo;
  const parts = [colorize(new THREE.CylinderGeometry(0.05, 0.07, 0.35, 6).translate(0, 0.17, 0), '#5a3d25')];
  for (const [x, y, z, r] of [[0, 0.55, 0, 0.32], [0.18, 0.48, 0.1, 0.24], [-0.16, 0.5, -0.08, 0.25], [0.02, 0.72, 0.05, 0.22]]) parts.push(colorize(new THREE.IcosahedronGeometry(r, 1).translate(x, y, z), '#3f6b2e'));
  _bushGeo = mergeGeometries(parts.map((g) => g.toNonIndexed()));
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
// crowd material: people bob, stand up and wave (per seat cell), driven by TIME
function crowdPatch(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = TIME;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uTime;\nfloat chash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }')
      .replace('#include <map_fragment>', `
        vec2 cuv = vMapUv; vec2 cell = floor(cuv * vec2(73.0, 16.0)); float hh = chash(cell);
        float act = step(0.8, hh) * max(0.0, sin(uTime * (3.0 + hh * 5.0) + hh * 40.0));
        float wave = step(0.5, sin(uTime * 0.9 - cell.x * 0.35 + cell.y * 0.2)) * step(0.93, chash(vec2(floor(cell.x / 9.0), 3.0)));
        cuv.y -= (act * 0.22 + wave * 0.3) / 16.0 * step(0.5, fract(cuv.y * 16.0));
        vec4 sampledDiffuseColor = texture2D(map, cuv);
        diffuseColor *= sampledDiffuseColor;`);
  };
  mat.customProgramCacheKey = () => 'crowd';
  return mat;
}

export function webglAvailable() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}

export class Race3D {
  constructor(container, { cid, geo, street = 0, night = false, cars = [], category = 'formula', surface = null, wet = false }) {
    this.container = container;
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
    this.night = night;
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
    this.labels = document.createElement('div');
    Object.assign(this.labels.style, { position: 'absolute', inset: '0', pointerEvents: 'none', overflow: 'hidden' });
    container.appendChild(this.labels);
    this.buildEnv(street);
    this.street = street;
    if (this.open) this.buildStage(); else { this.buildTrack(street); this.buildScenery(street); }
    this.buildRacingLine();
    WET.value = 0;
    // twilight sky: low warm sun
    this.skyKind = night ? 'night' : category === 'endurance' && DUSK_TRACKS.includes(this.geo.cid) ? 'dusk' : 'day';
    if (this.skyKind === 'dusk') { this.sun.color.setHex(0xffb27a); this.sun.intensity = 1.7; this.hemi.color.setHex(0xffd2b0); this.renderer.toneMappingExposure = 1.12; }
    applyHDRI(this.renderer, this.scene, this.skyKind, { intensity: night ? 0.35 : 0.9 }).then((ok) => {
      if (ok && this.skyDome) { this.skyDome.visible = false; if (this.clouds) this.clouds.visible = false; this.hdr = true; }
      // align the key light with the sun painted in the HDRI (elevation clamped for readable shadows)
      const sd = !night && hdriSun(this.skyKind);
      const hz = !night && hdriHorizon(this.skyKind);
      if (hz && this.scene.fog) { this.scene.fog.color.copy(hz); this.fogDay = hz.clone(); this._wetApplied = -1; }
      if (sd) { const el = Math.min(0.95, Math.max(this.skyKind === 'dusk' ? 0.22 : 0.45, Math.asin(sd.y))); const az = Math.atan2(sd.z, sd.x); this.sunDir.set(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)); }
    });
    this.composer = makeComposer(this.renderer, this.scene, this.camera, { bloom: night ? 0.45 : 0.18, low: this.low, ao: true, flare: !night });
    this.cars = new Map();
    for (const c of cars) this.addCar(c);
    this.camPos = new THREE.Vector3(0, 50, 0);
    this.camLook = new THREE.Vector3();
    this.tvCams ||= this.makeTvCams();
    this.rain = null;
    if (this.open && wet) this.setRain(0.6);
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

  // ribbon over a sample range [i0, i1] (wraps), offsets a..b, edges faded in over 4 samples
  segRibbon(i0, i1, a, b, y, material, vScale = 0.1) {
    const { N, x, y: Y, hdg } = this.geo;
    const pos = [], uv = [], idx = [];
    const n = i1 - i0;
    for (let q = 0; q <= n; q++) {
      const i = (((i0 + q) % N) + N) % N;
      const nx = -Math.sin(hdg[i]), nz = Math.cos(hdg[i]);
      const t = Math.min(1, Math.min(q, n - q) / 4);
      const inner = Math.abs(a) < Math.abs(b) ? a : b;
      const outer = inner === a ? b : a;
      const o2 = inner + (outer - inner) * t;
      const A = inner === a ? a : o2, B = inner === a ? o2 : b;
      pos.push(x[i] + nx * A, y, Y[i] + nz * A, x[i] + nx * B, y, Y[i] + nz * B);
      uv.push(0, q * this.geo.ds * vScale, Math.abs(B - A) * vScale, q * this.geo.ds * vScale);
      if (q < n) { const k = q * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, material); m.receiveShadow = true; return m;
  }

  buildTrack(street) {
    const W = street > 0.7 ? 11 : 13;
    this.TW = W;
    const D = (m, o) => (this.low ? m : detailPatch(m, o));
    this.desert = ['bhr', 'qat', 'abu', 'ksa'].includes(this.geo.cid);
    this.computeLine();
    this.asphaltMat = this.low ? new THREE.MeshStandardMaterial({ color: 0x3b3e44, roughness: 0.85 }) : D(pbr('asphalt_02', { color: 0x75757a, roughness: 1, normalScale: 0.8 }), { macro: 0.1, macroScale: 0.06, wet: true, rough: [0.62, 1.0], key: 'asph', track: { halfW: W / 2, uScale: 6 } });
    const runoffMat = this.low ? new THREE.MeshStandardMaterial({ color: 0x777b82, roughness: 0.9 }) : D(pbr('concrete_floor_worn_001', { color: street > 0.7 ? 0x8a8a8a : 0xb8b8b8 }), { macro: 0.12, macroScale: 0.05, wet: true });
    const grassCol = this.desert ? 0xc9b98a : 0x8db86a;
    const groundMat = this.low ? new THREE.MeshStandardMaterial({ color: street > 0.7 ? 0x5d6066 : 0x3f7a34, roughness: 1 }) : D(pbr(street > 0.7 ? 'concrete_floor_worn_001' : 'aerial_grass_rock', { repeat: [1400, 1400], color: street > 0.7 ? 0x67696d : grassCol }), { macro: street > 0.7 ? 0.3 : 0.22, macroScale: 0.012, tint: 0xd8c27a, tintAmt: street > 0.7 ? 0 : 0.45 });
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
      const grass = this.low ? new THREE.MeshStandardMaterial({ color: 0x4f8a3c, roughness: 1 }) : D(pbr('aerial_grass_rock', { color: this.desert ? 0xcfc08f : 0x9cc27a, roughness: 1 }), { macro: 0.2, macroScale: 0.03, tint: 0xd8c27a, tintAmt: 0.35, mow: this.desert ? null : { uScale: 14 }, key: 'verge' });
      this.scene.add(this.ribbon(W / 2, W / 2 + 2.2, 0.012, shoulder, 1 / 6, 1, 2.2 / 6));
      this.scene.add(this.ribbon(-W / 2 - 2.2, -W / 2, 0.012, shoulder, 1 / 6, 1, 2.2 / 6));
      this.scene.add(this.ribbon(W / 2 + 2.2, W / 2 + runoff + 6, 0.0, grass, 1 / 14, 2, (runoff + 4) / 14, false, true));
      this.scene.add(this.ribbon(-W / 2 - runoff - 6, -W / 2 - 2.2, 0.0, grass, 1 / 14, 2, (runoff + 4) / 14, false, true));
      const gravel = this.low ? new THREE.MeshStandardMaterial({ color: 0xc9b48a, roughness: 1 }) : D(pbr('gravel_floor', { color: 0xe6d2a8, roughness: 1 }), { macro: 0.14, macroScale: 0.08 });
      for (const cn of this.geo.corners) {
        if (cn.r > 220) continue;
        const span = Math.min(40, Math.max(14, Math.round(cn.r / 6)));
        const side = -cn.dir;
        const g0 = W / 2 + 5.5;
        const a = side > 0 ? g0 : -(W / 2 + runoff - 1), b = side > 0 ? W / 2 + runoff - 1 : -g0;
        this.scene.add(this.segRibbon(cn.i - Math.round(span * 0.6), cn.i + span, a, b, 0.02, gravel, 1 / 3.5));
      }
      // painted asphalt run-off (track-limit zone) outside every corner, between kerb and gravel
      const paint = this.low ? new THREE.MeshStandardMaterial({ color: 0x2c7a52, roughness: 0.8 }) : D(new THREE.MeshStandardMaterial({ color: 0x25603f, roughness: 0.62 }), { antiTile: false, macro: 0.12, macroScale: 0.08, wet: true, key: 'paint' });
      const stripe = new THREE.MeshStandardMaterial({ color: 0xe9ecef, roughness: 0.6 });
      for (const cn of this.geo.corners) {
        if (cn.r > 260) continue;
        const span = Math.min(34, Math.max(12, Math.round(cn.r / 7)));
        const side = -cn.dir;
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
    // pit lane: dedicated lane on the + side around the start line, inside the barriers
    this.pitSpan = 44; this.pitOff = W / 2 + (street > 0.7 ? 6.5 : 9);
    const pitW = (i) => { const d = Math.min(i, N - i); return d <= this.pitSpan ? 1 : d >= this.pitSpan + 14 ? 0 : 1 - (d - this.pitSpan) / 14; };
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
    const rawWall = (i, side) => side > 0 ? Math.max(baseWall, baseWall + (this.pitOff + 4.2 - baseWall) * pitW(i)) : baseWall;
    this.wallOff = (i, side) => { i = ((i % N) + N) % N; return Math.max(W / 2 + 1.4, Math.min(rawWall(i, side), clr[side > 0 ? 0 : 1][i] / 2)); };
    {
      const pos = [], idx = [], uv = [];
      const pm = this.low ? new THREE.MeshStandardMaterial({ color: 0x45484e, roughness: 0.85 }) : detailPatch(pbr('asphalt_02', { color: 0x76767a, roughness: 0.9, repeat: [1, 1] }), { macro: 0.14, macroScale: 0.05, wet: true, rough: [0.6, 1.0], key: 'pitlane' });
      let n = 0;
      for (let q = -this.pitSpan - 10; q <= this.pitSpan + 10; q++, n++) {
        const i = (q + N) % N; const nx = -Math.sin(this.geo.hdg[i]), nz = Math.cos(this.geo.hdg[i]);
        const t = Math.min(1, (this.pitSpan + 10 - Math.abs(q)) / 12);
        const a = W / 2 + 0.2, b = W / 2 + 0.2 + (this.pitOff + 2.6 - W / 2) * t;
        pos.push(this.geo.x[i] + nx * a, 0.025, this.geo.y[i] + nz * a, this.geo.x[i] + nx * b, 0.025, this.geo.y[i] + nz * b);
        uv.push(0, n * this.geo.ds / 6, (b - a) / 6, n * this.geo.ds / 6);
        if (q < this.pitSpan + 10) { const k = n * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
      const pl = new THREE.Mesh(g, pm); pl.receiveShadow = true; this.scene.add(pl);
      // pit lane white line + box markings
      const ln = []; const li = [];
      for (let q = -this.pitSpan + 4, k = 0; q <= this.pitSpan - 4; q++, k++) {
        const i = (q + N) % N; const nx = -Math.sin(this.geo.hdg[i]), nz = Math.cos(this.geo.hdg[i]);
        const a = this.pitOff - 2.9, b = this.pitOff - 2.7;
        ln.push(this.geo.x[i] + nx * a, 0.04, this.geo.y[i] + nz * a, this.geo.x[i] + nx * b, 0.04, this.geo.y[i] + nz * b);
        if (q < this.pitSpan - 4) { const j = k * 2; li.push(j, j + 1, j + 2, j + 1, j + 3, j + 2); }
      }
      const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(ln, 3)); lg.setIndex(li); lg.computeVertexNormals();
      this.scene.add(new THREE.Mesh(lg, lineMat));
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
    this.scene.add(sl);
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
      for (const side of [1, -1]) strip(cn.i - span, span * 2, side, prof, 1.8, 3);
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
    this.asphaltMat = this.low ? new THREE.MeshStandardMaterial({ map: road, roughness: surf === 'snow' ? 0.5 : 0.95 }) : detailPatch(pbr(roadId, { color: surf === 'tarmac' ? 0x8a8a8a : surf === 'gravel' ? 0xd0b998 : 0xffffff, roughness: surf === 'snow' ? 0.6 : 1 }), { macro: 0.12, macroScale: 0.05, wet: surf !== 'snow', key: 'stage-road' });
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
    const ph = [0, 1, 2, 3].map(() => Math.random() * 6.283);
    const [bx0, bz0, bx1, bz1] = this.geo.bbox; const M = 320;
    const X0 = bx0 - M, Z0 = bz0 - M, X1 = bx1 + M, Z1 = bz1 + M;
    const G = this.low ? 110 : 220; const cellW = Math.max((X1 - X0) / G, (Z1 - Z0) / Math.max(20, Math.round(G * (Z1 - Z0) / (X1 - X0))));
    const sm = (a, b, t) => { const u = Math.max(0, Math.min(1, (t - a) / (b - a))); return u * u * (3 - 2 * u); };
    const terrH = (x, z) => {
      const edge = Math.max(sm(X0 + M * 0.8, X0, x), sm(X1 - M * 0.8, X1, x), sm(Z0 + M * 0.8, Z0, z), sm(Z1 - M * 0.8, Z1, z));
      let T = hAvg + 7 * Math.sin(x * 0.004 + ph[0]) * Math.cos(z * 0.0035 + ph[1]) + 3 * Math.sin(x * 0.011 + z * 0.009 + ph[2]);
      T = T + (hMin - 2.5 - T) * edge;
      const [d2, i] = near(x, z); if (i < 0) return T;
      const d = Math.sqrt(d2); const w = sm(W / 2 + 2.5 + cellW * 1.3, 90, d);
      return gh[i] - 0.3 + (T + 2.5 * sm(10, 40, d) * (1 - edge) - (gh[i] - 0.3)) * w;
    };
    this.terrH = terrH;
    {
      const nx = G, nz = Math.max(20, Math.round(G * (Z1 - Z0) / (X1 - X0)));
      const pos = new Float32Array((nx + 1) * (nz + 1) * 3), uv = new Float32Array((nx + 1) * (nz + 1) * 2), idx = [];
      for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
        const x = X0 + (X1 - X0) * i / nx, z = Z0 + (Z1 - Z0) * j / nz, k = j * (nx + 1) + i;
        pos[k * 3] = x; pos[k * 3 + 1] = terrH(x, z); pos[k * 3 + 2] = z; uv[k * 2] = x / 9; uv[k * 2 + 1] = z / 9;
        if (i < nx && j < nz) idx.push(k, k + nx + 1, k + 1, k + 1, k + nx + 1, k + nx + 2);
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
      const tm = this.low ? new THREE.MeshStandardMaterial({ map: canvasTex(256, 256, (c, w, h) => noise(c, w, h, groundCol, 255, 12000, 3), [1, 1]), roughness: 1 })
        : detailPatch(pbr(surf === 'snow' ? 'snow_02' : 'aerial_grass_rock', { color: surf === 'snow' ? 0xffffff : 0xb5c99a }), { macro: 0.2, macroScale: 0.01, tint: surf === 'snow' ? 0xdfe8f0 : 0xc9b27a, tintAmt: 0.35, key: 'stage' });
      const terr = new THREE.Mesh(g, tm); terr.receiveShadow = true; this.scene.add(terr);
    }
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(30000, 30000), this.low ? new THREE.MeshStandardMaterial({ map: canvasTex(256, 256, (c, w, h) => noise(c, w, h, groundCol, 255, 12000, 3), [600, 600]), roughness: 1 }) : detailPatch(pbr(surf === 'snow' ? 'snow_02' : 'aerial_grass_rock', { repeat: [3000, 3000], color: surf === 'snow' ? 0xffffff : 0xb5c99a }), { macro: 0.2, macroScale: 0.01 }));
    ground.rotation.x = -Math.PI / 2; ground.position.set((bx0 + bx1) / 2, hMin - 3, (bz0 + bz1) / 2); ground.receiveShadow = true;
    this.scene.add(ground);
    this.scene.add(this.ribbon(W / 2, W / 2 + 2.5, 0.01, vergeMat, 1 / 2, 1, 1.25));
    this.scene.add(this.ribbon(-W / 2 - 2.5, -W / 2, 0.01, vergeMat, 1 / 2, 1, 1.25));
    this.scene.add(this.ribbon(-W / 2, W / 2, 0.03, this.asphaltMat, surf === 'tarmac' ? 1 / 5 : 1 / 2.5, 1, surf === 'tarmac' ? W / 5 : W / 2.5));
    if (surf === 'snow') {
      const bankMat = new THREE.MeshStandardMaterial({ color: 0xf4f8fb, roughness: 0.6 });
      for (const side of [1, -1]) { const m = this.ribbon(side * (W / 2 + 2.4), side * (W / 2 + 3.4), 0.5, bankMat, 0.05, 2); this.scene.add(m); }
    }
    // dense forest along the road (photoreal impostors standing on the terrain)
    const kinds = surf === 'rough' ? [['bush', 0.4], ['broad', 0.35], ['desert', 0.25]] : surf === 'snow' ? [['conifer', 1]] : [['conifer', 0.7], ['broad', 0.3]];
    const pool = vegOfKind(kinds.map((k) => k[0]));
    const pick = () => { let r = Math.random(); for (const [k, w] of kinds) { if ((r -= w) <= 0) return k; } return kinds[0][0]; };
    const items = []; const target = this.low ? 800 : 2600;
    for (let k = 0; k < target * 3 && items.length < target; k++) {
      const i = Math.floor(Math.random() * N); const side = Math.random() < 0.5 ? 1 : -1;
      const off = side * (W / 2 + 7 + Math.random() ** 1.5 * 120);
      const nx = -Math.sin(this.geo.hdg[i]), nz = Math.cos(this.geo.hdg[i]);
      const cx = gx[i] + nx * off, cz = gz[i] + nz * off;
      const kind = pick(); const opts = pool.filter((m) => m.kind === kind); if (!opts.length) continue;
      for (let q = 0; q < 3 && items.length < target; q++) {
        const px = cx + (Math.random() - 0.5) * 16, pz = cz + (Math.random() - 0.5) * 16;
        const [d2] = near(px, pz); if (d2 < (W / 2 + 5.5) ** 2) continue;
        const meta = opts[Math.floor(Math.random() * opts.length)];
        const h = { conifer: 11 + Math.random() * 10, broad: 6 + Math.random() * 6, bush: 1.8 + Math.random() * 2, desert: 4 + Math.random() * 3 }[meta.kind];
        const v = (0.82 + Math.random() * 0.26) * (meta.kind === 'bush' ? 1.25 : 1);
        items.push({ x: px, y: terrH(px, pz) - 0.2, z: pz, h, meta, rot: Math.random() * 6.283, tint: surf === 'snow' ? [v * 0.9, v * 0.95, v] : [v * (0.95 + Math.random() * 0.1), v, v * 0.9] });
      }
    }
    if (items.length) { this.scene.add(makeTreeShadows(items)); this.forest = makeForest(items); this.scene.add(this.forest); }
    // start & finish arches
    for (const [i, col] of [[2, 0x22d37a], [N - 3, 0xffffff]]) {
      const g = new THREE.Group(); const m = new THREE.MeshStandardMaterial({ color: col, roughness: 0.5 });
      for (const zz of [W / 2 + 1, -W / 2 - 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.4, 5, 0.4), m); p.position.set(0, 2.5, zz); g.add(p); }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, W + 2.8), m); beam.position.y = 5; g.add(beam);
      this.placeAt(g, i, 0, this.geo.h ? this.geo.h[i] : 0); this.scene.add(g);
    }
    if (this.scene.fog) { this.scene.fog = new THREE.FogExp2(this.scene.fog.color, 0.0011); this.fogDensity = this.scene.fog.density; }
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
      const ok = !filter || filter(i);
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
    const amp = street > 0.7 ? 1.25 : this.desert ? 0.7 : 1;
    const hillH = (x, z) => {
      const r = Math.hypot(x - cx, z - cz); if (r < R0) return 0;
      const a = Math.atan2(z - cz, x - cx);
      const t = Math.min(1, (r - R0) / 900); const e = t * t * (3 - 2 * t);
      const n = 0.55 + 0.45 * Math.sin(a * 2 + ph[0]) * Math.sin(a * 5 + ph[1]) + 0.25 * Math.sin(a * 11 + ph[2] + r * 0.002) + 0.12 * Math.sin(a * 23 + ph[3]);
      const far = 1 + Math.min(1.6, (r - R0) / 1800);
      return e * Math.max(0.15, n) * 120 * far * amp + e * 10 * Math.sin(r * 0.006 + ph[4]);
    };
    this.hillH = hillH; this.hillR0 = R0; this.hillC = [cx, cz];
    const A = this.low ? 96 : 180, J = this.low ? 14 : 26;
    const pos = [], col = [], uv = [], idx = [];
    const c = new THREE.Color();
    const forest = new THREE.Color(this.desert ? 0x9a7650 : 0x2c4424), rock = new THREE.Color(this.desert ? 0x8c6a4a : 0x8a8478);
    for (let i = 0; i <= A; i++) {
      const a = (i / A) * Math.PI * 2;
      for (let j = 0; j <= J; j++) {
        const r = R0 - 20 + (R1 - R0 + 20) * (j / J) ** 1.7;
        const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r; const h = hillH(x, z);
        pos.push(x, h - 0.3, z);
        uv.push((x - (cx - 6000)) / 12000 * 1400, (-(z - cz) + 6000) / 12000 * 1400);
        const f = Math.min(1, h / 18) * Math.min(1, Math.max(0, 0.55 + 0.35 * Math.sin(a * 13 + r * 0.004 + ph[5]) + 0.25 * Math.sin(a * 31 - r * 0.009)));
        c.setRGB(1, 1, 1).lerp(forest, f * 0.9).lerp(rock, Math.max(0, Math.min(1, (h - 190) / 140)) * 0.7);
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
    // exponential haze: crisp near the track, blue-grey aerial perspective on the hills
    if (this.scene.fog) { this.scene.fog = new THREE.FogExp2(this.scene.fog.color, this.night ? 0.0009 : 0.00025); this.fogDensity = this.scene.fog.density; }
  }

  // photoreal vegetation (Poly Haven CC0 trees rendered into impostors)
  buildForest(street) {
    const N = this.geo.N, W = this.TW;
    const cid = this.geo.cid;
    const desert = ['bhr', 'qat', 'abu', 'ksa'].includes(cid);
    const pool = desert ? vegOfKind(['desert', 'bush', 'broad']) : street > 0.7 ? vegOfKind(['broad']) : vegOfKind(['conifer', 'broad', 'bush']);
    const byKind = (k) => pool.filter((m) => m.kind === k);
    const weights = desert ? [['desert', 0.35], ['bush', 0.35], ['broad', 0.3]] : street > 0.7 ? [['broad', 1]] : [['conifer', 0.5], ['broad', 0.35], ['bush', 0.15]];
    const pickKind = () => { let r = Math.random(); for (const [k, w] of weights) { if ((r -= w) <= 0) return k; } return weights[0][0]; };
    const target = Math.round((street > 0.7 ? 260 : desert ? 900 : 3000) * (this.low ? 0.35 : 1));
    const items = [];
    // keep a clear line of sight between every TV camera and the track
    const N0 = this.geo.N; const sight = (this.tvCams || []).flatMap((c) => [0, -15, -30].map((d) => { const j = (c.i + d + N0) % N0; return { x0: c.pos.x, z0: c.pos.z, x1: this.geo.x[j], z1: this.geo.y[j] }; }));
    const blocksCam = (px, pz) => sight.some((v) => { const dx = v.x1 - v.x0, dz = v.z1 - v.z0; const L2 = dx * dx + dz * dz || 1; const t = Math.max(-0.4, Math.min(1, ((px - v.x0) * dx + (pz - v.z0) * dz) / L2)); const qx = v.x0 + dx * t, qz = v.z0 + dz * t; return (px - qx) ** 2 + (pz - qz) ** 2 < 26 * 26; });
    const ok = (px, pz, r) => this.clearOfTrack(px, pz, W / 2 + 7 + r) && !blocksCam(px, pz) && !this.obstacles.some((o) => (o.x - px) ** 2 + (o.z - pz) ** 2 < (o.r + r) ** 2);
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
        items.push({ x: px, y: 0, z: pz, h, meta, rot: Math.random() * 6.283, tint: [v * (0.95 + Math.random() * 0.1), v, v * (0.9 + Math.random() * 0.1)] });
        if (meta.kind !== 'bush') this.obstacles.push({ x: px, z: pz, r: 3, h: h * 0.9 });
      }
    }
    // forest on the surrounding hills
    if (this.hillH) {
      const [cx, cz] = this.hillC; const nH = Math.round((desert ? 300 : street > 0.7 ? 900 : 2600) * (this.low ? 0.3 : 1));
      const conif = byKind(desert ? 'desert' : 'conifer').concat(desert ? [] : byKind('broad'));
      for (let k = 0, guard2 = 0; k < nH && conif.length && guard2 < nH * 3; guard2++) {
        const a = Math.random() * 6.283; const r = this.hillR0 + 30 + Math.random() ** 1.8 * 900;
        const cl = 0.5 + 0.5 * Math.sin(a * 9 + r * 0.004) * Math.cos(a * 4 - r * 0.002); if (Math.random() > cl * cl * cl) continue;
        const px = cx + Math.cos(a) * r, pz = cz + Math.sin(a) * r;
        const meta = conif[Math.floor(Math.random() * conif.length)];
        const h = (meta.kind === 'conifer' ? 14 : 9) * (0.8 + Math.random() * 0.6);
        const v = 0.8 + Math.random() * 0.25;
        items.push({ x: px, y: this.hillH(px, pz) - 0.5, z: pz, h, meta, rot: Math.random() * 6.283, tint: [v * 0.92, v, v * 0.9], far: true }); k++;
      }
    }
    if (!items.length) return;
    this.scene.add(makeTreeShadows(items.filter((it) => !it.far)));
    this.forest = makeForest(items);
    if (this.night) this.forest.material.uniforms.light.value = 0.42;
    this.scene.add(this.forest);
  }

  // stepped grandstand in local frame: x along the track, track side towards +z
  makeStand(L, D, H, crowdMat, roofMat) {
    const g = new THREE.Group();
    const frame = this._standFrame ||= new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.6, metalness: 0.4 });
    const back = new THREE.Mesh(new THREE.BoxGeometry(L, H, 0.6), frame); back.position.set(0, H / 2, -D / 2); back.castShadow = true; g.add(back);
    for (const sx of [-1, 1]) { const side = new THREE.Mesh(new THREE.BoxGeometry(0.6, H, D), frame); side.position.set(sx * L / 2, H / 2, 0); g.add(side); }
    const slopeLen = Math.hypot(D, H - 1.6);
    const sl = new THREE.Mesh(new THREE.PlaneGeometry(L, slopeLen), crowdPatch(crowdMat.clone()));
    sl.material.map = crowdMat.map.clone(); sl.material.map.repeat.set(L / 14, 1); sl.material.map.offset.x = Math.random(); sl.material.map.needsUpdate = true;
    if (crowdMat.userData.tints) sl.material.color.set(crowdMat.userData.tints[Math.floor(Math.random() * crowdMat.userData.tints.length)]);
    sl.position.set(0, (H + 1.6) / 2, 0); sl.rotation.x = -Math.atan2(D, H - 1.6); sl.receiveShadow = true; g.add(sl);
    const front = new THREE.Mesh(new THREE.BoxGeometry(L, 1.6, 0.4), frame); front.position.set(0, 0.8, D / 2); g.add(front);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(L + 2, 0.4, D + 3), roofMat); roof.position.set(0, H + 3.2, -0.5); roof.rotation.x = 0.06; roof.castShadow = true; g.add(roof);
    for (let px = -L / 2; px <= L / 2 + 0.1; px += L / 4) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 3.4, 6), frame); post.position.set(px, H + 1.5, -D / 2 + 0.4); g.add(post); }
    return g;
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
    const span = W + 6;
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
    const crowd = canvasTex(512, 256, (c, w, h) => {
      const rows = 16; const rh = h / rows;
      for (let r = 0; r < rows; r++) {
        c.fillStyle = r % 2 ? '#2b3140' : '#343b4d'; c.fillRect(0, r * rh, w, rh);
        c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(0, r * rh + rh - 2, w, 2);
        for (let x = 2; x < w; x += 6 + Math.random() * 3) {
          if (Math.random() < 0.12) continue;
          const rr = Math.random(); const hue = rr < 0.3 ? [0, 355, 210, 45, 25][Math.floor(Math.random() * 5)] : Math.random() * 360;
          // mostly whites, darks and denim with some team colours
          c.fillStyle = rr < 0.3 ? `hsl(${hue},${60 + Math.random() * 30}%,${40 + Math.random() * 20}%)` : rr < 0.55 ? `hsl(0,0%,${80 + Math.random() * 18}%)` : rr < 0.75 ? `hsl(220,${10 + Math.random() * 25}%,${14 + Math.random() * 20}%)` : `hsl(${hue},${15 + Math.random() * 25}%,${35 + Math.random() * 30}%)`;
          c.fillRect(x, r * rh + rh * 0.35, 4.2, rh * 0.6);
          c.fillStyle = `hsl(25,${30 + Math.random() * 30}%,${45 + Math.random() * 35}%)`; c.fillRect(x + 0.7, r * rh + rh * 0.08, 2.8, rh * 0.32);
        }
      }
    }, [3, 1]);
    const standMat = new THREE.MeshStandardMaterial({ map: crowd, roughness: 0.95 });
    standMat.userData.tints = ['#ffffff', '#ffffff', '#fff0e6', '#ffe2c4', '#e6ecff', '#ffd2c8'];
    const roofMat = new THREE.MeshStandardMaterial({ color: 0xdedede, roughness: 0.5, metalness: 0.3 });
    this.obstacles = [];
    for (let k = -3; k <= 3; k++) {
      const st = this.makeStand(38, 14, 12, standMat, roofMat);
      this.placeAt(st, k * 9, -(this.wallOff(k * 9, -1) + 10), 0);
      if (this.boxClear(st, 19, 7, W / 2 + 3, k * 9)) { this.scene.add(st); this.obstacles.push({ x: st.position.x, z: st.position.z, r: 22, h: 16, hl: 20, hd: 8.5, rot: st.rotation.y }); }
    }
    const big = this.geo.corners.slice().sort((a, b) => a.r - b.r).slice(0, 5);
    for (const cn of big) {
      const side = -cn.dir;
      const st = this.makeStand(30, 10, 9, standMat, roofMat);
      this.placeAt(st, cn.i, side * (this.wallOff(cn.i, side) + 8), 0, side > 0 ? Math.PI : 0);
      if (this.boxClear(st, 15, 5, W / 2 + 3, cn.i)) { this.scene.add(st); this.obstacles.push({ x: st.position.x, z: st.position.z, r: 18, h: 13, hl: 16, hd: 6.5, rot: st.rotation.y }); }
    }
    const pitMat = new THREE.MeshStandardMaterial({ color: 0xc9ced6, roughness: 0.5, metalness: 0.2 });
    const garMat = new THREE.MeshStandardMaterial({ color: 0x15181d, roughness: 0.7 });
    // lit garage interiors (team-coloured back wall, white floor, light strips, tyre racks)
    const garCols = ['#c8102e', '#00a19c', '#1e41ff', '#ff8000', '#006f62', '#0067c6', '#5a5f66', '#8f1b2c', '#e8e8e8', '#2b4562'];
    const garInt = garCols.map((tc) => { const t = canvasTex(256, 128, (c, w, h) => {
      c.fillStyle = '#d9dde2'; c.fillRect(0, 0, w, h);
      c.fillStyle = tc; c.fillRect(0, h * 0.12, w, h * 0.5);
      c.fillStyle = 'rgba(255,255,255,0.85)'; c.font = 'italic 900 26px "Exo 2", sans-serif'; c.textAlign = 'center'; c.fillText('APEX', w / 2, h * 0.42);
      c.fillStyle = '#fffbe8'; for (let x = 10; x < w; x += 48) c.fillRect(x, 2, 30, 5);
      c.fillStyle = '#eceff2'; c.fillRect(0, h * 0.62, w, h * 0.38);
      c.fillStyle = '#16181b'; for (const x of [12, w - 44]) for (let y = 0; y < 3; y++) { c.beginPath(); c.arc(x + 16, h * 0.68 + y * 13, 6, 0, 7); c.fill(); }
      c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(w * 0.3, h * 0.8, w * 0.4, h * 0.12);
    }); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: this.night ? 0.6 : 0.35 }); });
    let garK = 0;
    const pitBack = (this.pitOff || W / 2 + 9) + 4.6;
    for (let q = -this.pitSpan + 2; q <= this.pitSpan - 2; q += 3) {
      const seg = new THREE.Group();
      const b = new THREE.Mesh(new THREE.BoxGeometry(this.geo.ds * 3 + 0.4, 5.2, 14), pitMat); b.position.set(0, 2.6, 7); b.castShadow = true; b.receiveShadow = true; seg.add(b);
      const glass = new THREE.Mesh(new THREE.BoxGeometry(this.geo.ds * 3 + 0.4, 3.4, 12), this._glass ||= new THREE.MeshStandardMaterial({ color: 0x1b2a3c, roughness: 0.08, metalness: 0.85 })); glass.position.set(0, 6.9, 7.6); seg.add(glass);
      const roofS = new THREE.Mesh(new THREE.BoxGeometry(this.geo.ds * 3 + 0.4, 0.5, 15), this._pitRoof ||= new THREE.MeshStandardMaterial({ map: canvasTex(256, 256, (c, w, h) => {
        c.fillStyle = '#7d848d'; c.fillRect(0, 0, w, h);
        c.fillStyle = 'rgba(0,0,0,0.18)'; for (let x = 0; x < w; x += 16) c.fillRect(x, 0, 2, h);
        c.fillStyle = '#c9ced4'; c.fillRect(30, 60, 40, 30); c.fillRect(150, 140, 50, 36); c.fillStyle = '#4a5058'; c.beginPath(); c.arc(50, 75, 11, 0, 7); c.arc(175, 158, 13, 0, 7); c.fill();
        c.fillStyle = '#e8e8e8'; c.fillRect(0, h - 14, w, 14); c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(0, h - 16, w, 2);
      }), roughness: 0.6, metalness: 0.3 })); roofS.position.set(0, 8.85, 6.8); roofS.castShadow = true; seg.add(roofS);
      const gd = new THREE.Mesh(new THREE.BoxGeometry(this.geo.ds * 3 - 2.5, 4.2, 0.2), [garMat, garMat, garMat, garMat, garMat, garInt[Math.floor(garK++ / 2) % garInt.length]]); gd.position.set(0, 2.1, -0.05); seg.add(gd);
      // local x = track tangent, local z = outward normal
      b.position.set(0, 2.6, 0); glass.position.set(0, 6.9, 0.6); roofS.position.set(0, 8.85, -0.2); gd.position.set(0, 2.1, -7.05);
      this.placeAt(seg, q, pitBack + 7, 0);
      if (this.clearOfTrack(seg.position.x, seg.position.z, W / 2 + 9, q)) { this.scene.add(seg); this.obstacles?.push({ x: seg.position.x, z: seg.position.z, r: 11, h: 9.5, hl: this.geo.ds * 1.5 + 0.3, hd: 7.6, rot: seg.rotation.y }); }
    }
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
    const glow = street > 0.7 && this.night ? canvasTex(256, 256, (c, w, h) => { c.fillStyle = '#000'; c.fillRect(0, 0, w, h); for (let k = 0; k < 4; k++) { c.fillStyle = k % 3 ? '#fff4d6' : '#ffe2a8'; c.fillRect(14 + k * 62, 26, 34, 80); } c.fillStyle = '#fff0d0'; c.fillRect(12, 174, 104, 72); c.fillRect(140, 174, 104, 72); }) : null;
    const m = street > 0.7 ? new THREE.MeshStandardMaterial({ map: facade, roughness: 0.85, ...(glow ? { emissive: 0xffffff, emissiveMap: glow, emissiveIntensity: 0.9 } : {}) }) : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
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
            float litW = step(0.55, fhash(vec2(floor(vFac.x * 4.0) + vFac.w * 17.0, floor((fy - 4.4) / 3.3) + vFac.w)));`)
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
    this.buildTrackside(street);
    this.buildDressing(street);
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
    if (this.night) {
      const poleMat = new THREE.MeshStandardMaterial({ color: 0xfff6dd, emissive: 0xfff3c8, emissiveIntensity: 2 });
      const heads = [], poles = [], pools = [], cones = [];
      this.nightLamps = [];
      const q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
      for (let i = 0; i < N; i += 24) {
        const side = (i / 24) % 2 ? 1 : -1;
        const lamp = new THREE.Object3D();
        this.placeAt(lamp, i, side * (W / 2 + 6), 16); lamp.updateMatrix(); heads.push(lamp.matrix.clone());
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
          void main() { vH = uv.y; vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
            vN = normalize(mat3(modelMatrix * instanceMatrix) * normal); vV = normalize(cameraPosition - wp.xyz); vD = distance(cameraPosition, wp.xyz);
            gl_Position = projectionMatrix * viewMatrix * wp; }`,
        fragmentShader: `uniform float uAmt; varying float vH; varying vec3 vN; varying vec3 vV; varying float vD;
          void main() { float f = abs(dot(normalize(vN), normalize(vV))); float a = pow(vH, 1.6) * f * f * 0.08 * uAmt * smoothstep(520.0, 80.0, vD);
            gl_FragColor = vec4(vec3(1.0, 0.92, 0.78) * a, 1.0); }`,
      });
      inst(coneGeo, beamMat, cones).renderOrder = 3;
      // a handful of real lights follow the camera from lamp to lamp: cars passing under the
      // floodlights pick up moving highlights on paint and wet asphalt
      if (!this.low) { this.lampLights = [0, 1, 2, 3].map(() => { const l = new THREE.PointLight(0xfff0d8, 0, 55, 2); this.scene.add(l); return l; }); }
      this.scene.add(new THREE.AmbientLight(0xfff0d8, 0.22));
    }
  }

  // true when the straight segment a->b (world points) passes no grandstand, building or tree
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
      const pitBack = (this.pitOff || W / 2 + 9) + 4.6;
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
        const tm = new THREE.InstancedMesh(mergeGeometries([tg.toNonIndexed(), sides.toNonIndexed()]), tentMat, tents.length); tents.forEach((m, k) => tm.setMatrixAt(k, m)); tm.castShadow = true; tm.receiveShadow = true; this.scene.add(tm);
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
        const lg = mergeGeometries([pole, arm, head, base].map((g) => g.toNonIndexed()));
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
    const free = (px, pz, r) => !(this.obstacles || []).some((o) => (o.x - px) ** 2 + (o.z - pz) ** 2 < (o.hl ? Math.max(o.hl, o.hd) : o.r) ** 2 * 0.8) && this.clearOfTrack(px, pz, r);
    for (let i = 0; i < N; i += step) {
      const k = cams.length;
      let side = (k % 2 ? 1 : -1);
      if (this.pitSpan && Math.min(i, N - i) < this.pitSpan + 14) side = -1; // never behind the pit building
      const nx = -Math.sin(this.geo.hdg[i]), nz = Math.cos(this.geo.hdg[i]);
      const hy = this.geo.h ? this.geo.h[i] : 0;
      const offs = st ? [this.wallOff(i, side) + 1.6, this.wallOff(i, side) + 1.2] : [W / 2 + 26, W / 2 + 18, W / 2 + 34, W / 2 + 12];
      const hs = st ? [6 + (k % 3) * 2, 11, 16, 24] : [7 + (k % 3) * 3, 12, 18, 26];
      let pick = null;
      for (const hgt of hs) {
        for (const sd of [side, -side]) for (const o0 of offs) {
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
    const dirt = this.open && this.surface !== 'tarmac' ? (this.surface === 'snow' ? 0.35 : 0.85) : 0;
    const m = buildCar(c.category === 'rally' ? 'gt' : this.category, c.livery, { helmet: c.helmet, tyre: c.tyreColor, number: c.number, sponsor: c.sponsor, dirt });
    m.traverse((o) => { if (o.isMesh) o.castShadow = true; });
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
    this.cars.set(c.key, { box: this._boxes.get(team), mesh: m, label, lane: ((c.key.charCodeAt(0) + c.key.length * 7) % 5 - 2) * 0.9, lastS: 0, tyre: c.tyreColor, isPlayer: c.isPlayer });
  }

  setNight(n) {
    if (this._night === n) return; this._night = n;
    const day = { top: new THREE.Color(0x3d7ad6), bot: new THREE.Color(0xcfe3f7), fog: new THREE.Color(0xb8d4f0) };
    const nite = { top: new THREE.Color(0x02040c), bot: new THREE.Color(0x141c33), fog: new THREE.Color(0x070b18) };
    this.skyMat.uniforms.top.value.copy(day.top).lerp(nite.top, n);
    this.skyMat.uniforms.bot.value.copy(day.bot).lerp(nite.bot, n);
    this.scene.fog.color.copy(this.fogDay || day.fog).lerp(nite.fog, n);
    if (!this.hdr) this.scene.background = this.scene.fog.color.clone(); else { this.scene.backgroundIntensity = 1 - n * 0.85; this.scene.environmentIntensity = 0.9 - n * 0.6; }
    const dk = this.skyKind === 'dusk' ? 0.65 : 1; this.hemi.intensity = (1.1 - n * 0.55) * (0.6 + 0.4 * dk); this.sun.intensity = (2.6 - n * 2.0) * dk;
    this._lit = { sun: this.sun.intensity, bg: this.hdr ? this.scene.backgroundIntensity : 1, fog: this.scene.fog.color.clone() }; this._wetApplied = -1;
    if (this.forest) this.forest.material.uniforms.light.value = 1 - n * 0.8;
    this.renderer.toneMappingExposure = 1.05 - n * 0.2;
  }

  setStartLights(n, go) {
    this.lights?.forEach((l, k) => { const on = !go && k < n; l.material.emissive.setHex(on ? 0xff0000 : 0x000000); l.material.color.setHex(on ? 0xff2020 : 0x220000); });
  }

  setRain(level) {
    this._rainLvl = level;
    if (level > 0.08 && !this.rain) {
      // falling streaks (line segments) around the camera
      const n = this.low ? 1200 : 3000; const g = new THREE.BufferGeometry(); const p = new Float32Array(n * 6);
      for (let i = 0; i < n; i++) { const x = (Math.random() - 0.5) * 110, y = Math.random() * 60, z = (Math.random() - 0.5) * 110; p.set([x, y, z, x + 0.05, y - 0.75, z + 0.03], i * 6); }
      g.setAttribute('position', new THREE.BufferAttribute(p, 3));
      this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xc4d2e0, transparent: true, opacity: 0.32, depthWrite: false }));
      this.rain.frustumCulled = false;
      this.scene.add(this.rain);
    }
    if (this.rain) this.rain.visible = level > 0.08;
    const wet = Math.min(1, level * 1.3);
    this.wet = wet;
    // overcast: weaker sun, duller sky, grey haze, less saturated grade
    if (Math.abs(wet - (this._wetApplied ?? -1)) > 0.01) {
      this._wetApplied = wet;
      const base = this._lit || { sun: this.night ? 1.55 : 2.2, bg: this.night ? 0.35 : 1, fog: (this.fogDay || this.scene.fog.color).clone() };
      if (!this._lit && this.fogDay) this._lit = base;
      this.sun.intensity = base.sun * (1 - 0.72 * wet);
      if (this.hdr) { this.scene.backgroundIntensity = base.bg * (1 - 0.55 * wet); this.scene.backgroundBlurriness = 0.12 * wet; }
      this.scene.fog.color.copy(base.fog).lerp(this._rainFog ||= new THREE.Color(this.night ? 0x0b0e14 : 0x7d858e), wet * 0.75);
      if (this.composer?.grade) this.composer.grade.uniforms.uSat.value = 1.08 - 0.28 * wet;
    }
    if (!this.asphaltMat.userData.wetPatch) { this.asphaltMat.roughness = 0.82 - wet * 0.5; this.asphaltMat.metalness = 0.04 + wet * 0.12; if (this.asphaltMat.color) { this._asphBase ??= this.asphaltMat.color.getHex(); this.asphaltMat.color.setHex(this._asphBase).multiplyScalar(1 - wet * 0.45); } }
    WET.value = wet;
    if (this.scene.fog.isFogExp2) this.scene.fog.density = this.fogDensity * (1 + wet * 2.6);
    else { this.scene.fog.near = 400 * (1 - wet * 0.75); this.scene.fog.far = 2600 * (1 - wet * 0.68); }
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
        this._degraded = true; this.renderer.setPixelRatio(1); this.renderer.shadowMap.enabled = false; if (this.composer?.ao) this.composer.ao.enabled = false;
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
      if (st.hidden) { car.mesh.visible = false; car.label.style.display = 'none'; car.pit = car.exit = null; continue; }
      let s = st.s, spd = st.speed || 0, lane, pit = false;
      const i0 = open ? Math.min(N - 2, Math.max(0, Math.floor(s))) : Math.floor(s) % N;
      const race = (this.line ? this.line[i0] * (st.close ? 0.45 : 1) : 0) + (st.close && st.pos ? (st.pos % 2 ? 2.6 : -2.6) : car.lane * 0.3);
      if (st.inPit && this.pitOff && !open) {
        // drive down the pit lane to the team box, stop, wait for the sim to release the car
        if (!car.pit) { car.pit = { adv: 0, box: 6 + (car.box || 0) * 2.6 }; car.exit = null; }
        const rel = dS(st.s, 0);
        const target = car.pit.box - rel;
        if (car.pit.adv < target) { car.pit.adv = Math.min(target, car.pit.adv + 21 * dt / ds); spd = 21; } else spd = 0;
        s = st.s + car.pit.adv; lane = this.pitOff; pit = true;
      } else {
        if (car.pit) { car.exit = { off: car.pit.adv, t: 0 }; car.pit = null; }
        lane = race;
        if (car.exit) {
          // leave the box at limiter speed and let the visual position fall back onto the sim one
          car.exit.t += dt;
          const vv = Math.min(spd, 21 + Math.max(0, car.exit.t - 1.2) * 16);
          car.exit.off -= Math.max(spd * 0.15, spd - vv) * dt / ds;
          if (car.exit.off <= 0) car.exit = null;
          else { s = st.s + car.exit.off; spd = vv; if (dS(s, 0) < this.pitSpan - 4 && dS(s, 0) > -4) { lane = this.pitOff; pit = true; } }
        }
        lane = Math.max(-maxLane, Math.min(maxLane, lane));
      }
      items.push({ st, car, s: wrap(s), spd, lane, pit });
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
      car.laneCur = car.laneCur == null ? tgt : car.laneCur + (tgt - car.laneCur) * Math.min(1, dt * (it.pit ? 2.2 : 4));
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
      this.placeCar(car, it.st, s, car.laneCur, it.spd, dt);
      if (it.st.key === this.focusKey) focus = car;
    }
    if (!focus) focus = [...this.cars.values()].find((c) => c.mesh.visible);
    this.updateCamera(focus, dt);
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
    this.updateFx(dt);
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
    if (this.composer?.flare) updateSunFlare(this.composer, this.camera, this.hdr && hdriSun(this.skyKind), (1 - (this._night || 0)) * (1 - 0.9 * (this.wet || 0)) * (this.camMode === 'cockpit' ? 1.2 : 1));
    if (this.composer) this.composer.render(); else this.renderer.render(this.scene, this.camera);
    this.updateLabels();
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
      if (!m.visible || sp < 45 || car.pit || m.position.distanceToSquared(cam) > 180 * 180) continue;
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

  // rooster-tail spray behind cars on a wet track: one shared particle system (soft sprites)
  updateSpray(dt) {
    const M = this.low ? 400 : 1400;
    if (!this.spray) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(M * 3).fill(-9999), 3));
      const tex = canvasTex(64, 64, (c, w, h) => { const gr = c.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, w, h); });
      this.spray = new THREE.Points(g, new THREE.PointsMaterial({ map: tex, color: this.night ? 0x5a6170 : 0xd5dbe2, size: 2.1, transparent: true, opacity: 0.3, depthWrite: false, sizeAttenuation: true }));
      this.spray.frustumCulled = false; this.sprayV = new Float32Array(M * 3); this.sprayL = new Float32Array(M); this.sprayI = 0;
      this.scene.add(this.spray);
    }
    this.spray.visible = true;
    const P = this.spray.geometry.attributes.position.array, V = this.sprayV, L = this.sprayL;
    const cam = this.camera.position;
    for (const car of this.cars.values()) {
      const m = car.mesh, sp = car.state?.speed || 0;
      if (!m.visible || sp < 18 || m.position.distanceToSquared(cam) > 260 * 260) continue;
      const fx = Math.cos(m.rotation.y), fz = -Math.sin(m.rotation.y);
      const n = Math.min(6, Math.ceil(sp * dt * 1.4 * this.wet));
      for (let q = 0; q < n; q++) {
        const k = this.sprayI = (this.sprayI + 1) % M; const side = Math.random() < 0.5 ? 1 : -1;
        P[k * 3] = m.position.x - fx * 2.3 + fz * side * 0.7; P[k * 3 + 1] = m.position.y + 0.35; P[k * 3 + 2] = m.position.z - fz * 2.3 - fx * side * 0.7;
        V[k * 3] = fx * sp * (0.55 + Math.random() * 0.2) + (Math.random() - 0.5) * 3; V[k * 3 + 1] = 2.2 + Math.random() * 2.8; V[k * 3 + 2] = fz * sp * (0.55 + Math.random() * 0.2) + (Math.random() - 0.5) * 3;
        L[k] = 0.45 + Math.random() * 0.4;
      }
    }
    // particles keep part of the car's speed (dragged along) and slow down quickly
    const drag = Math.exp(-dt * 2.5);
    for (let k = 0; k < M; k++) {
      if (L[k] <= 0) { if (P[k * 3 + 1] > -9000) P[k * 3 + 1] = -9999; continue; }
      L[k] -= dt; V[k * 3] *= drag; V[k * 3 + 2] *= drag; V[k * 3 + 1] -= dt * 2;
      P[k * 3] += V[k * 3] * dt; P[k * 3 + 1] += V[k * 3 + 1] * dt; P[k * 3 + 2] += V[k * 3 + 2] * dt;
      if (P[k * 3 + 1] < 0.35 && V[k * 3 + 1] < 0) { L[k] = 0; P[k * 3 + 1] = -9999; } // mist settles: never leave blobs lying on the asphalt
    }
    this.spray.geometry.attributes.position.needsUpdate = true;
  }

  pose(s, lane) {
    const N = this.geo.N;
    const i0 = this.open ? Math.min(N - 2, Math.max(0, Math.floor(s))) : Math.floor(s) % N, i1 = this.open ? i0 + 1 : (i0 + 1) % N, f = this.open ? Math.min(1, Math.max(0, s - i0)) : s - Math.floor(s);
    let hd = this.geo.hdg[i1] - this.geo.hdg[i0]; while (hd > Math.PI) hd -= 2 * Math.PI; while (hd < -Math.PI) hd += 2 * Math.PI;
    const h = this.geo.hdg[i0] + hd * f;
    const yy = this.geo.h ? this.geo.h[i0] + (this.geo.h[i1] - this.geo.h[i0]) * f : 0;
    return { x: this.geo.x[i0] + (this.geo.x[i1] - this.geo.x[i0]) * f - Math.sin(h) * lane, z: this.geo.y[i0] + (this.geo.y[i1] - this.geo.y[i0]) * f + Math.cos(h) * lane, h, y: yy };
  }

  placeCar(car, st, s, laneCur, speed, dt) {
    const N = this.geo.N, m = car.mesh;
    m.visible = true;
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
    m.rotation.y = -h - car._yaw;
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
    if (this.introT > 0) {
      this.introT = this.introDur - (performance.now() - this.introStart) / 1000;
      if (this.introT <= 0) { this.introT = 0; this._cut = true; }
      const k = 1 - this.introT / this.introDur;
      const [x0, y0, x1, y1] = this.geo.bbox; const cx = (x0 + x1) / 2, cz = (y0 + y1) / 2; const R = Math.max(x1 - x0, y1 - y0);
      const ang = k * 1.6 + 0.4;
      const tgt = focus ? focus.mesh.position : new THREE.Vector3(cx, 0, cz);
      const far = new THREE.Vector3(cx + Math.cos(ang) * R * 0.7, R * 0.45 * (1 - k) + 25, cz + Math.sin(ang) * R * 0.7);
      const near = tgt.clone().add(new THREE.Vector3(-30, 14, 22));
      const e = k * k * (3 - 2 * k);
      this.camera.position.copy(far.lerp(near, e));
      this.camera.fov = 50; this.camera.updateProjectionMatrix();
      this.camera.lookAt(new THREE.Vector3(cx, 0, cz).lerp(tgt, e));
      this.camPos.copy(this.camera.position);
      this.skyDome.position.copy(this.camera.position);
      return;
    }
    if (this.director) {
      this.dirT = (this.dirT || 0) - dt;
      if (this.dirT <= 0) {
        this.dirT = 7 + Math.random() * 6;
        const b = this.pickBattle();
        this.dirFocus = b || this.focusKey;
        const modes = ['tv', 'tv', 'chase', 'heli', 'tv', 'onboard'];
        this.camMode = modes[Math.floor(Math.random() * modes.length)];
        this._cut = true;
      }
      const df = this.cars.get(this.dirFocus);
      if (df && df.mesh.visible) focus = df;
    }
    if (!focus) return;
    const m = focus.mesh;
    const fwd = new THREE.Vector3(Math.cos(-m.rotation.y), 0, -Math.sin(-m.rotation.y));
    // car faces +x in local space; world forward = rotate (1,0,0) by rotation.y
    fwd.set(Math.cos(m.rotation.y), 0, -Math.sin(m.rotation.y));
    const target = m.position.clone();
    let pos, look = target.clone().add(new THREE.Vector3(0, 0.8, 0));
    let fov = 50;
    const spd = focus.state?.speed || 0;
    this._shT = (this._shT || 0) + dt;
    if (this.camMode === 'chase') {
      // camera on a soft spring: it lags behind the car's yaw so corners show the car turning
      if (!this._chaseFwd || this._cut) this._chaseFwd = fwd.clone();
      this._chaseFwd.lerp(fwd, Math.min(1, dt * 3.2)).normalize();
      pos = target.clone().addScaledVector(this._chaseFwd, -9.5).add(new THREE.Vector3(0, 3.0, 0));
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
      this._heliFwd.lerp(fwd, Math.min(1, dt * 0.5)).normalize();
      const side = new THREE.Vector3(-this._heliFwd.z, 0, this._heliFwd.x);
      const t = this._shT;
      pos = target.clone().addScaledVector(this._heliFwd, -48 + 6 * Math.sin(t * 0.13)).addScaledVector(side, 30 + 8 * Math.sin(t * 0.09)).add(new THREE.Vector3(0, 62 + 4 * Math.sin(t * 0.21), 0));
      if (!this._heliPos) this._heliPos = pos.clone();
      this._heliPos.lerp(pos, Math.min(1, dt * 1.2)); pos = this._heliPos.clone();
      look = target.clone().addScaledVector(fwd, Math.min(14, spd * 0.25));
      fov = 34;
    } else {
      // TV: nearest camera ahead of the car (within range) that actually sees it
      const s = focus.state?.s || 0, N = this.geo.N;
      const list = [];
      for (const c of this.tvCams) { let d = c.i - s; if (d < -N / 2) d += N; if (d > N / 2) d -= N; list.push([d >= -10 ? d : 999 + Math.abs(d), c]); }
      list.sort((a, b) => a[0] - b[0]);
      const tgt1 = target.clone(); tgt1.y += 0.9;
      let best = list[0][1];
      for (let q = 0; q < Math.min(4, list.length); q++) { if (this.losClear(list[q][1].pos, tgt1)) { best = list[q][1]; break; } }
      if (this._tv !== best) { this._tv = best; this.camPos.copy(best.pos); this._cut = true; }
      pos = best.pos.clone();
      const dist = pos.distanceTo(target);
      // operator leads the car slightly; framing tightens as it approaches
      look.addScaledVector(fwd, Math.min(4, spd * 0.035));
      fov = Math.max(5, Math.min(48, 2 * Math.atan(14 / dist) * 180 / Math.PI));
      // hand-held / tripod-head motion: slow drift plus a little shake, angular so a long lens
      // shows it as much as a real one would
      const t = this._shT + (best.ph || 0), aD = dist * Math.PI / 180;
      const jx = (Math.sin(t * 0.9) * 0.6 + Math.sin(t * 2.3 + 1.1) * 0.3 + Math.sin(t * 7.1) * 0.08) * 0.18 * aD;
      const jy = (Math.sin(t * 0.7 + 2.0) * 0.6 + Math.sin(t * 2.9) * 0.25 + Math.sin(t * 8.3 + 0.4) * 0.07) * 0.12 * aD;
      const rx = -fwd.z, rz = fwd.x;
      look.x += rx * jx; look.z += rz * jx; look.y += jy;
    }
    // never put the camera inside a building / grandstand: lift it above the roof
    if (this.obstacles && this.camMode !== 'onboard' && this.camMode !== 'cockpit') for (const o of this.obstacles) { const d2 = (o.x - pos.x) ** 2 + (o.z - pos.z) ** 2; if (d2 < o.r * o.r && pos.y < (o.h ?? 14) + 3) pos.y = (o.h ?? 14) + 3; }
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
    if (this._cut || this.camMode === 'onboard' || ck) { this.camPos.copy(pos); this.camLook.copy(look); this._cut = false; }
    else { this.camPos.lerp(pos, k); this.camLook.lerp(look, this.camMode === 'chase' ? 1 : this.camMode === 'heli' ? Math.min(1, dt * 3) : Math.min(1, dt * 7)); }
    this.camera.position.copy(this.camPos);
    this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 4);
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(this.camLook);
    // shadow frustum centred a little ahead of the camera, snapped to texels to avoid shimmering
    // the frustum is only as wide as the view needs: close cameras get ~3 cm shadow texels
    // (crisp self-shadowing on the cars), the helicopter keeps the wide one
    const half = this.camMode === 'heli' ? 70 : this.camMode === 'tv' ? 60 : this.camMode === 'chase' ? 40 : 46;
    const sc = this.sun.shadow.camera;
    if (sc.right !== half) { sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.updateProjectionMatrix(); this.sun.shadow.normalBias = 0.03 * Math.max(0.5, half / 70); }
    const fc = this.camMode === 'tv' || this.camMode === 'heli' ? target.clone() : this.camera.position.clone().lerp(target, 0.5).addScaledVector(fwd, half * 0.45);
    const tex = (2 * half) / this.sun.shadow.mapSize.x; fc.x = Math.round(fc.x / tex) * tex; fc.z = Math.round(fc.z / tex) * tex;
    this.sun.position.copy(fc).addScaledVector(this.sunDir, 400);
    this.sun.target.position.copy(fc);
    this.skyDome.position.copy(this.camera.position);
    if (this.clouds) this.clouds.position.set(this.camera.position.x, 0, this.camera.position.z);
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
