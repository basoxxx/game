// 3D race view: circuit built from real geometry, broadcast-style cameras
import * as THREE from 'three';
import { makeForest, makeTreeShadows, vegOfKind } from './vegetation.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { trackGeometry, speedProfile, sampleAtTimeFrac } from '../engine/trackphys.js';
import { genStage, STAGE_STYLE } from './trackview.js';
import { getSettings } from '../engine/state.js';
import { passBy } from './audio.js';
import { buildCar, setTyreColor } from './cars3d.js';
import { pbr, applyHDRI, makeComposer } from './gfx.js';
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
    this.renderer.toneMappingExposure = night ? 0.9 : 1.05;
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
    applyHDRI(this.renderer, this.scene, night ? 'night' : (this.surface === 'snow' ? 'day' : 'day'), { intensity: night ? 0.35 : 0.9 }).then((ok) => { if (ok && this.skyDome) { this.skyDome.visible = false; if (this.clouds) this.clouds.visible = false; this.hdr = true; } });
    this.composer = makeComposer(this.renderer, this.scene, this.camera, { bloom: night ? 0.45 : 0.18, low: this.low, ao: true });
    this.cars = new Map();
    for (const c of cars) this.addCar(c);
    this.camPos = new THREE.Vector3(0, 50, 0);
    this.camLook = new THREE.Vector3();
    this.tvCams ||= this.makeTvCams();
    this.rain = null;
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
    const sun = new THREE.DirectionalLight(night ? 0xbfd4ff : 0xfff1dc, night ? 0.7 : 2.2);
    sun.position.set(300, 500, 200);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera; sc.left = -80; sc.right = 80; sc.top = 80; sc.bottom = -80; sc.near = 10; sc.far = 1500;
    sun.shadow.bias = -0.0004;
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
    this.asphaltMat = this.low ? new THREE.MeshStandardMaterial({ color: 0x3b3e44, roughness: 0.85 }) : pbr('asphalt_02', { color: 0x727272, roughness: 0.95, normalScale: 0.8 });
    const runoffMat = this.low ? new THREE.MeshStandardMaterial({ color: 0x777b82, roughness: 0.9 }) : pbr('concrete_floor_worn_001', { color: street > 0.7 ? 0x8a8a8a : 0xb8b8b8 });
    const groundMat = this.low ? new THREE.MeshStandardMaterial({ color: street > 0.7 ? 0x5d6066 : 0x3f7a34, roughness: 1 }) : pbr(street > 0.7 ? 'concrete_floor_worn_001' : 'aerial_grass_rock', { repeat: [1400, 1400], color: street > 0.7 ? 0x4c4f54 : 0x8db86a });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(12000, 12000), groundMat);
    ground.rotation.x = -Math.PI / 2; ground.position.set((this.geo.bbox[0] + this.geo.bbox[2]) / 2, -0.25, (this.geo.bbox[1] + this.geo.bbox[3]) / 2);
    ground.receiveShadow = true;
    this.scene.add(ground);
    const runoff = street > 0.7 ? 3 : 16;
    if (street > 0.7) {
      this.scene.add(this.ribbon(W / 2, W / 2 + runoff, 0.01, runoffMat, 1 / 5, 1, runoff / 5, false, true));
      this.scene.add(this.ribbon(-W / 2 - runoff, -W / 2, 0.01, runoffMat, 1 / 5, 1, runoff / 5, false, true));
    } else {
      // permanent circuit: narrow tarmac shoulder, then grass up to the barriers, gravel traps outside corners
      const shoulder = this.low ? new THREE.MeshStandardMaterial({ color: 0x55585e, roughness: 0.9 }) : pbr('asphalt_02', { color: 0x777777, roughness: 0.95 });
      const grass = this.low ? new THREE.MeshStandardMaterial({ color: 0x4f8a3c, roughness: 1 }) : pbr('aerial_grass_rock', { color: 0x9cc27a, roughness: 1 });
      this.scene.add(this.ribbon(W / 2, W / 2 + 2.2, 0.012, shoulder, 1 / 6, 1, 2.2 / 6));
      this.scene.add(this.ribbon(-W / 2 - 2.2, -W / 2, 0.012, shoulder, 1 / 6, 1, 2.2 / 6));
      this.scene.add(this.ribbon(W / 2 + 2.2, W / 2 + runoff + 6, 0.0, grass, 1 / 14, 2, (runoff + 4) / 14, false, true));
      this.scene.add(this.ribbon(-W / 2 - runoff - 6, -W / 2 - 2.2, 0.0, grass, 1 / 14, 2, (runoff + 4) / 14, false, true));
      const gravel = this.low ? new THREE.MeshStandardMaterial({ color: 0xc9b48a, roughness: 1 }) : pbr('gravel_floor', { color: 0xf0dcb0, roughness: 1 });
      for (const cn of this.geo.corners) {
        if (cn.r > 220) continue;
        const span = Math.min(40, Math.max(14, Math.round(cn.r / 6)));
        const side = -cn.dir;
        const a = side > 0 ? W / 2 + 2.2 : -(W / 2 + runoff - 1), b = side > 0 ? W / 2 + runoff - 1 : -(W / 2 + 2.2);
        this.scene.add(this.segRibbon(cn.i - Math.round(span * 0.6), cn.i + span, a, b, 0.02, gravel, 1 / 8));
      }
    }
    // white edge lines + rubbered racing line
    const lineMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6 });
    this.scene.add(this.ribbon(W / 2 - 0.35, W / 2 - 0.1, 0.045, lineMat, 0.05));
    this.scene.add(this.ribbon(-W / 2 + 0.1, -W / 2 + 0.35, 0.045, lineMat, 0.05));
    this.rubberMat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.6, transparent: true, opacity: 0.32, depthWrite: false });
    this.scene.add(this.ribbon(-W / 2, W / 2, 0.03, this.asphaltMat, 1 / 6, 1, W / 6));
    // kerbs on corners
    const kerbTex = canvasTex(64, 64, (c, w, h) => { for (let i = 0; i < 2; i++) { c.fillStyle = i ? '#f4f4f4' : '#d0161c'; c.fillRect(0, i * h / 2, w, h / 2); } });
    const kerbMat = new THREE.MeshStandardMaterial({ map: kerbTex, roughness: 0.6 });
    const { N } = this.geo;
    for (const cn of this.geo.corners) {
      const span = Math.min(30, Math.max(10, Math.round(cn.r / 12)));
      for (const side of [1, -1]) {
        const pos = [], uv = [], idx = [];
        const a = side * W / 2, b = side * (W / 2 + 1.3);
        for (let q = -span; q <= span; q++) {
          const i = (cn.i + q + N) % N;
          const nx = -Math.sin(this.geo.hdg[i]), nz = Math.cos(this.geo.hdg[i]);
          const hk = this.geo.h ? this.geo.h[i] : 0; pos.push(this.geo.x[i] + nx * a, 0.06 + hk, this.geo.y[i] + nz * a, this.geo.x[i] + nx * b, 0.09 + hk, this.geo.y[i] + nz * b);
          uv.push(0, (q + span) * 0.8, 1, (q + span) * 0.8);
          if (q < span) { const k = (q + span) * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
        const m = new THREE.Mesh(g, kerbMat); m.receiveShadow = true; this.scene.add(m);
      }
    }
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
      const pm = this.low ? new THREE.MeshStandardMaterial({ color: 0x45484e, roughness: 0.85 }) : pbr('asphalt_02', { color: 0x8a8a8a, roughness: 0.9, repeat: [1, 1] });
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

  buildStage() {
    const surf = this.surface || 'gravel';
    const W = surf === 'tarmac' ? 7 : 6;
    this.TW = W;
    const cols = { gravel: ['#8b6a43', '#6d5232'], rough: ['#7a5534', '#5a3d22'], tarmac: ['#3d4046', '#2e3035'], snow: ['#e9f2f8', '#c7d7e3'] }[surf];
    const road = canvasTex(256, 256, (c, w, h) => { noise(c, w, h, cols[0], 255, 14000, 3); c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(w * 0.25, 0, w * 0.12, h); c.fillRect(w * 0.63, 0, w * 0.12, h); if (surf === 'tarmac') { c.fillStyle = '#e8e8e8'; for (let y = 0; y < h; y += 64) c.fillRect(w / 2 - 2, y, 4, 32); } });
    const roadId = { tarmac: 'asphalt_02', gravel: 'gravel_floor', rough: 'rocky_trail', snow: 'snow_02' }[surf];
    this.asphaltMat = this.low ? new THREE.MeshStandardMaterial({ map: road, roughness: surf === 'snow' ? 0.5 : 0.95 }) : pbr(roadId, { color: surf === 'tarmac' ? 0x9a9a9a : surf === 'gravel' ? 0xd8c2a0 : 0xffffff, roughness: surf === 'snow' ? 0.6 : 1 });
    const vergeMat = this.low ? new THREE.MeshStandardMaterial({ map: canvasTex(128, 128, (c, w, h) => noise(c, w, h, cols[1], 255, 5000, 3)), roughness: 1 }) : pbr(surf === 'snow' ? 'snow_02' : 'rocky_trail', { color: surf === 'snow' ? 0xffffff : 0xa89a80 });
    const groundCol = surf === 'snow' ? '#dfe9f1' : surf === 'tarmac' ? '#4f6b3a' : '#5d6b38';
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(30000, 30000), this.low ? new THREE.MeshStandardMaterial({ map: canvasTex(256, 256, (c, w, h) => noise(c, w, h, groundCol, 255, 12000, 3), [600, 600]), roughness: 1 }) : pbr(surf === 'snow' ? 'snow_02' : 'aerial_grass_rock', { repeat: [3000, 3000], color: surf === 'snow' ? 0xffffff : 0xb5c99a }));
    ground.rotation.x = -Math.PI / 2; ground.position.set((this.geo.bbox[0] + this.geo.bbox[2]) / 2, -0.05, (this.geo.bbox[1] + this.geo.bbox[3]) / 2); ground.receiveShadow = true;
    this.scene.add(ground);
    this.scene.add(this.ribbon(W / 2, W / 2 + 2.5, 0.01, vergeMat, 1 / 4, 1, 0.6));
    this.scene.add(this.ribbon(-W / 2 - 2.5, -W / 2, 0.01, vergeMat, 1 / 4, 1, 0.6));
    this.scene.add(this.ribbon(-W / 2, W / 2, 0.03, this.asphaltMat, 1 / 5, 1, W / 5));
    if (surf === 'snow') {
      const bankMat = new THREE.MeshStandardMaterial({ color: 0xf4f8fb, roughness: 0.6 });
      for (const side of [1, -1]) { const m = this.ribbon(side * (W / 2 + 2.4), side * (W / 2 + 3.4), 0.5, bankMat, 0.05, 2); this.scene.add(m); }
    }
    // dense forest along the road
    const N = this.geo.N;
    const count = this.low ? 600 : 1800;
    const cone = surf === 'rough' ? bushGeo() : treeGeo();
    const treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
    const inst = new THREE.InstancedMesh(cone, treeMat, count);
    const tint = new THREE.Color();
    const dummy = new THREE.Object3D();
    let placed = 0;
    for (let k = 0; k < count * 3 && placed < count; k++) {
      const i = Math.floor(Math.random() * N); const side = Math.random() < 0.5 ? 1 : -1;
      const off = side * (W / 2 + 6 + Math.random() ** 1.5 * 90);
      const nx = -Math.sin(this.geo.hdg[i]), nz = Math.cos(this.geo.hdg[i]);
      const px = this.geo.x[i] + nx * off, pz = this.geo.y[i] + nz * off;
      let ok = true;
      for (let j = Math.max(0, i - 400); j < Math.min(N, i + 400); j += 5) { const dx = this.geo.x[j] - px, dz = this.geo.y[j] - pz; if (dx * dx + dz * dz < (W / 2 + 5) ** 2) { ok = false; break; } }
      if (!ok) continue;
      const h = surf === 'rough' ? 4 + Math.random() * 5 : 9 + Math.random() * 14; const wd = surf === 'rough' ? 3 + Math.random() * 3 : 2.2 + Math.random() * 2;
      const baseH = this.geo.h ? this.geo.h[i] * 0.85 : 0;
      dummy.position.set(px, baseH, pz); dummy.scale.set(wd * 2, h, wd * 2); dummy.rotation.y = Math.random() * 6; dummy.updateMatrix();
      tint.setHSL(surf === 'rough' ? 0.16 : 0.27, surf === 'snow' ? 0.15 : 0.35, surf === 'snow' ? 0.9 : 0.7 + Math.random() * 0.4); inst.setColorAt(placed, tint);
      inst.setMatrixAt(placed++, dummy.matrix);
    }
    inst.count = placed; inst.castShadow = true;
    this.scene.add(inst);
    // start & finish arches
    for (const [i, col] of [[2, 0x22d37a], [N - 3, 0xffffff]]) {
      const g = new THREE.Group(); const m = new THREE.MeshStandardMaterial({ color: col, roughness: 0.5 });
      for (const zz of [W / 2 + 1, -W / 2 - 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.4, 5, 0.4), m); p.position.set(0, 2.5, zz); g.add(p); }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, W + 2.8), m); beam.position.y = 5; g.add(beam);
      this.placeAt(g, i, 0, this.geo.h ? this.geo.h[i] : 0); this.scene.add(g);
    }
    // terrain skirt under the road so the hills look solid
    if (this.geo.h) for (const side of [1, -1]) { const m = this.ribbon(side * (W / 2 + 2.5), side * (W / 2 + 40), -0.3, new THREE.MeshStandardMaterial({ map: canvasTex(128, 128, (c, w, hgt) => noise(c, w, hgt, groundCol, 255, 4000, 3)), roughness: 1 }), 0.05, 2); this.scene.add(m); }
    if (this.scene.fog) { this.scene.fog.near = 150; this.scene.fog.far = 1400; }
  }

  buildRacingLine() {
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
    if (this.rubberMat && !this.open) {
      const { x, y, hdg } = this.geo; const pos = [], idx = [];
      for (let i = 0; i <= N; i++) { const j = i % N; const nx = -Math.sin(hdg[j]), nz = Math.cos(hdg[j]); const o = sm[j]; const hr = this.geo.h ? this.geo.h[j] : 0; pos.push(x[j] + nx * (o - 1.6), 0.04 + hr, y[j] + nz * (o - 1.6), x[j] + nx * (o + 1.6), 0.04 + hr, y[j] + nz * (o + 1.6)); if (i < N) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); } }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      this.scene.add(new THREE.Mesh(g, this.rubberMat));
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
        const v = 0.86 + Math.random() * 0.24;
        items.push({ x: px, y: 0, z: pz, h, meta, rot: Math.random() * 6.283, tint: [v * (0.95 + Math.random() * 0.1), v, v * (0.9 + Math.random() * 0.1)] });
        if (meta.kind !== 'bush') this.obstacles.push({ x: px, z: pz, r: 3, h: h * 0.9 });
      }
    }
    if (!items.length) return;
    this.scene.add(makeTreeShadows(items));
    this.forest = makeForest(items);
    this.scene.add(this.forest);
  }

  // stepped grandstand in local frame: x along the track, track side towards +z
  makeStand(L, D, H, crowdMat, roofMat) {
    const g = new THREE.Group();
    const frame = this._standFrame ||= new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.6, metalness: 0.4 });
    const back = new THREE.Mesh(new THREE.BoxGeometry(L, H, 0.6), frame); back.position.set(0, H / 2, -D / 2); back.castShadow = true; g.add(back);
    for (const sx of [-1, 1]) { const side = new THREE.Mesh(new THREE.BoxGeometry(0.6, H, D), frame); side.position.set(sx * L / 2, H / 2, 0); g.add(side); }
    const slopeLen = Math.hypot(D, H - 1.6);
    const sl = new THREE.Mesh(new THREE.PlaneGeometry(L, slopeLen), crowdMat.clone());
    sl.material.map = crowdMat.map.clone(); sl.material.map.repeat.set(L / 14, 1); sl.material.map.needsUpdate = true;
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

  buildScenery(street) {
    const N = this.geo.N, W = this.TW;
    // gantry
    const g = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: 0x2a2d33, metalness: 0.7, roughness: 0.4 });
    for (const zz of [W / 2 + 2, -W / 2 - 2]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.6, 7, 0.6), steel); post.position.set(0, 3.5, zz); g.add(post); }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, W + 5), steel); beam.position.y = 7; g.add(beam);
    this.lights = [];
    for (let k = 0; k < 5; k++) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0x000000 })); l.position.set(-0.65, 7, -2 + k); g.add(l); this.lights.push(l); }
    this.placeAt(g, 3, 0); g.rotation.y += Math.PI / 2;
    this.scene.add(g);
    // grandstands + pit building along start straight
    const crowd = canvasTex(512, 256, (c, w, h) => {
      const rows = 16; const rh = h / rows;
      for (let r = 0; r < rows; r++) {
        c.fillStyle = r % 2 ? '#2b3140' : '#343b4d'; c.fillRect(0, r * rh, w, rh);
        c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(0, r * rh + rh - 2, w, 2);
        for (let x = 2; x < w; x += 6 + Math.random() * 3) {
          if (Math.random() < 0.12) continue;
          const hue = Math.random() < 0.3 ? [0, 355, 210, 45][Math.floor(Math.random() * 4)] : Math.random() * 360;
          c.fillStyle = `hsl(${hue},${55 + Math.random() * 35}%,${38 + Math.random() * 30}%)`; c.fillRect(x, r * rh + rh * 0.35, 4.2, rh * 0.6);
          c.fillStyle = `hsl(25,${30 + Math.random() * 30}%,${45 + Math.random() * 35}%)`; c.fillRect(x + 0.7, r * rh + rh * 0.08, 2.8, rh * 0.32);
        }
      }
    }, [3, 1]);
    const standMat = new THREE.MeshStandardMaterial({ map: crowd, roughness: 0.95 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0xdedede, roughness: 0.5, metalness: 0.3 });
    this.obstacles = [];
    for (let k = -3; k <= 3; k++) {
      const st = this.makeStand(38, 14, 12, standMat, roofMat);
      this.placeAt(st, k * 9, -(this.wallOff(k * 9, -1) + 10), 0);
      if (this.boxClear(st, 19, 7, W / 2 + 3, k * 9)) { this.scene.add(st); this.obstacles.push({ x: st.position.x, z: st.position.z, r: 22, h: 16 }); }
    }
    const big = this.geo.corners.slice().sort((a, b) => a.r - b.r).slice(0, 5);
    for (const cn of big) {
      const side = -cn.dir;
      const st = this.makeStand(30, 10, 9, standMat, roofMat);
      this.placeAt(st, cn.i, side * (this.wallOff(cn.i, side) + 8), 0, side > 0 ? Math.PI : 0);
      if (this.boxClear(st, 15, 5, W / 2 + 3, cn.i)) { this.scene.add(st); this.obstacles.push({ x: st.position.x, z: st.position.z, r: 18, h: 13 }); }
    }
    const pitMat = new THREE.MeshStandardMaterial({ color: 0xc9ced6, roughness: 0.5, metalness: 0.2 });
    const garMat = new THREE.MeshStandardMaterial({ color: 0x15181d, roughness: 0.7 });
    const pitBack = (this.pitOff || W / 2 + 9) + 4.6;
    for (let q = -this.pitSpan + 2; q <= this.pitSpan - 2; q += 3) {
      const seg = new THREE.Group();
      const b = new THREE.Mesh(new THREE.BoxGeometry(this.geo.ds * 3 + 0.4, 5.2, 14), pitMat); b.position.set(0, 2.6, 7); b.castShadow = true; b.receiveShadow = true; seg.add(b);
      const glass = new THREE.Mesh(new THREE.BoxGeometry(this.geo.ds * 3 + 0.4, 3.4, 12), this._glass ||= new THREE.MeshStandardMaterial({ color: 0x1b2a3c, roughness: 0.08, metalness: 0.85 })); glass.position.set(0, 6.9, 7.6); seg.add(glass);
      const roofS = new THREE.Mesh(new THREE.BoxGeometry(this.geo.ds * 3 + 0.4, 0.5, 15), this._pitRoof ||= new THREE.MeshStandardMaterial({ color: 0x5c6470, roughness: 0.6, metalness: 0.3 })); roofS.position.set(0, 8.85, 6.8); roofS.castShadow = true; seg.add(roofS);
      const gd = new THREE.Mesh(new THREE.BoxGeometry(this.geo.ds * 3 - 2.5, 4.2, 0.2), garMat); gd.position.set(0, 2.1, -0.05); seg.add(gd);
      // local x = track tangent, local z = outward normal
      b.position.set(0, 2.6, 0); glass.position.set(0, 6.9, 0.6); roofS.position.set(0, 8.85, -0.2); gd.position.set(0, 2.1, -7.05);
      this.placeAt(seg, q, pitBack + 7, 0);
      if (this.clearOfTrack(seg.position.x, seg.position.z, W / 2 + 9, q)) { this.scene.add(seg); this.obstacles?.push({ x: seg.position.x, z: seg.position.z, r: 11, h: 9.5 }); }
    }
    // trees / buildings instanced
    const count = street > 0.7 ? Math.round(260 * (this.low ? 0.35 : 1)) : 0;
    const geo = street > 0.7 ? new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0) : Math.random() < 0.5 ? treeGeo() : bushGeo();
    const facade = street > 0.7 ? canvasTex(128, 256, (c, w, h) => { c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h); for (let y = 10; y < h - 8; y += 22) for (let x = 8; x < w - 8; x += 20) { c.fillStyle = Math.random() < 0.25 ? '#e8d9a8' : '#3a4658'; c.fillRect(x, y, 11, 14); c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(x, y + 14, 11, 2); } c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(0, h - 10, w, 10); }) : null;
    const m = street > 0.7 ? new THREE.MeshStandardMaterial({ map: facade, roughness: 0.85 }) : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
    const inst = new THREE.InstancedMesh(geo, m, count);
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
      this.obstacles.push({ x: px, z: pz, r: wd * 0.72 + 2, h });
      dummy.position.set(px, 0, pz); dummy.scale.set(wd, h, wd); dummy.rotation.y = Math.random() * 6; dummy.updateMatrix();
      inst.setMatrixAt(k, dummy.matrix);
      if (street <= 0.7) tint.setHSL(0.22 + Math.random() * 0.1, 0.35 + Math.random() * 0.25, 0.75 + Math.random() * 0.35);
      else tint.setHSL([0.08, 0.1, 0.05, 0.12, 0.0, 0.58][Math.floor(Math.random() * 6)], 0.25 + Math.random() * 0.35, 0.62 + Math.random() * 0.22);
      inst.setColorAt(k, tint);
    }
    inst.castShadow = true;
    if (count) this.scene.add(inst);
    this.tvCams ||= this.makeTvCams();
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
      for (let i = 0; i < N; i += 24) {
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 3), poleMat);
        this.placeAt(lamp, i, (i / 24) % 2 ? W / 2 + 6 : -W / 2 - 6, 16);
        this.scene.add(lamp);
      }
      this.scene.add(new THREE.AmbientLight(0xfff0d8, 0.55));
    }
  }

  makeTvCams() {
    const cams = [];
    const N = this.geo.N;
    const step = Math.max(40, Math.round(N / 26));
    for (let i = 0; i < N; i += step) {
      let side = (cams.length % 2 ? 1 : -1);
      if (this.pitSpan && Math.min(i, N - i) < this.pitSpan + 14) side = -1; // never behind the pit building
      const nx = -Math.sin(this.geo.hdg[i]), nz = Math.cos(this.geo.hdg[i]);
      const blocked = (sd, off) => { const px = this.geo.x[i] + nx * sd * off, pz = this.geo.y[i] + nz * sd * off; return (this.obstacles || []).some((o) => (o.x - px) ** 2 + (o.z - pz) ** 2 < o.r * o.r) || !this.clearOfTrack(px, pz, this.street > 0.7 ? this.TW / 2 + 3.4 : this.TW / 2 + 6); };
      let sd = side, off = this.street > 0.7 ? this.wallOff(i, side) + 1.6 : this.TW / 2 + 26, hgt = this.street > 0.7 ? 6 + (cams.length % 3) * 2 : 7 + (cams.length % 3) * 3;
      if (blocked(sd, off)) { sd = -side; if (this.street > 0.7) off = this.wallOff(i, sd) + 1.6; if (blocked(sd, off)) { off = this.street > 0.7 ? this.wallOff(i, sd) + 1.2 : this.TW / 2 + 14; if (blocked(sd, off)) { sd = side; hgt = 24; } } }
      cams.push({ i, pos: new THREE.Vector3(this.geo.x[i] + nx * sd * off, hgt, this.geo.y[i] + nz * sd * off) });
    }
    return cams;
  }

  addCar(c) {
    const m = buildCar(c.category === 'rally' ? 'endurance' : this.category, c.livery, { helmet: c.helmet, tyre: c.tyreColor, number: c.number, sponsor: c.sponsor });
    if (c.category === 'rally') m.scale.set(0.9, 0.95, 0.92);
    m.traverse((o) => { if (o.isMesh) o.castShadow = true; });
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
    this.scene.fog.color.copy(day.fog).lerp(nite.fog, n);
    if (!this.hdr) this.scene.background = this.scene.fog.color.clone(); else { this.scene.backgroundIntensity = 1 - n * 0.85; this.scene.environmentIntensity = 0.9 - n * 0.6; }
    this.hemi.intensity = 1.1 - n * 0.55; this.sun.intensity = 2.6 - n * 2.0;
    if (this.forest) this.forest.material.uniforms.light.value = 1 - n * 0.8;
    this.renderer.toneMappingExposure = 1.05 - n * 0.2;
  }

  setStartLights(n, go) {
    this.lights?.forEach((l, k) => { const on = !go && k < n; l.material.emissive.setHex(on ? 0xff0000 : 0x000000); l.material.color.setHex(on ? 0xff2020 : 0x220000); });
  }

  setRain(level) {
    if (level > 0.08 && !this.rain) {
      const n = 2500; const g = new THREE.BufferGeometry(); const p = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { p[i * 3] = (Math.random() - 0.5) * 120; p[i * 3 + 1] = Math.random() * 60; p[i * 3 + 2] = (Math.random() - 0.5) * 120; }
      g.setAttribute('position', new THREE.BufferAttribute(p, 3));
      this.rain = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xaaccff, size: 0.18, transparent: true, opacity: 0.6 }));
      this.scene.add(this.rain);
    }
    if (this.rain) this.rain.visible = level > 0.08;
    const wet = Math.min(1, level * 1.3);
    this.asphaltMat.roughness = 0.82 - wet * 0.5; this.asphaltMat.metalness = 0.04 + wet * 0.12; if (this.asphaltMat.color) this.asphaltMat.color.setHex(0x727272).multiplyScalar(1 - wet * 0.45);
    this.scene.fog.near = 400 - wet * 300; this.scene.fog.far = 2600 - wet * 1800;
  }

  // states: [{key, s (0..N sample float), speed (m/s), inPit, tyreColor, label, show}]
  update(states, dt) {
    const N = this.geo.N;
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
      const p = this.rain.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) { let y = p.getY(i) - dt * 40; if (y < 0) y += 60; p.setY(i, y); }
      p.needsUpdate = true;
      this.rain.position.set(this.camera.position.x, 0, this.camera.position.z);
    }
    if (this.composer) this.composer.render(); else this.renderer.render(this.scene, this.camera);
    this.updateLabels();
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
    m.rotation.x = Math.max(-0.04, Math.min(0.04, k * speed ** 2 * 0.0012));
    const spin = speed * dt / 0.34;
    for (const w of m.userData.wheels) for (const sp of w.userData.spin) sp.rotation.z -= spin;
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
    if (this.camMode === 'chase') {
      pos = target.clone().addScaledVector(fwd, -9.5).add(new THREE.Vector3(0, 3.2, 0));
      look = target.clone().addScaledVector(fwd, 6).add(new THREE.Vector3(0, 1, 0));
      fov = 62;
    } else if (this.camMode === 'cockpit') {
      m.updateMatrixWorld();
      const formula = this.category === 'formula' || this.category === 'junior';
      pos = m.localToWorld(new THREE.Vector3(formula ? -0.36 : 0.05, formula ? 0.9 : 1.05, formula ? 0 : 0.35));
      look = m.localToWorld(new THREE.Vector3(30, formula ? -0.6 : 0.8, formula ? 0 : 0.35));
      fov = 72;
    } else if (this.camMode === 'onboard') {
      pos = target.clone().addScaledVector(fwd, this.category === 'formula' || this.category === 'junior' ? -1.25 : 0.2).add(new THREE.Vector3(0, this.category === 'formula' || this.category === 'junior' ? 1.55 : 1.3, 0));
      look = target.clone().addScaledVector(fwd, 35).add(new THREE.Vector3(0, 0.9, 0));
      fov = 66;
    } else if (this.camMode === 'heli') {
      pos = target.clone().addScaledVector(fwd, -40).add(new THREE.Vector3(18, 55, 0));
      fov = 45;
    } else {
      // TV: nearest camera ahead of the car (within range)
      const s = focus.state?.s || 0, N = this.geo.N;
      let best = null, bd = Infinity;
      for (const c of this.tvCams) { let d = c.i - s; if (d < -N / 2) d += N; if (d > N / 2) d -= N; const score = d >= -10 ? d : 999 + Math.abs(d); if (score < bd) { bd = score; best = c; } }
      if (this._tv !== best) { this._tv = best; this.camPos.copy(best.pos); this._cut = true; }
      pos = best.pos.clone();
      const dist = pos.distanceTo(target);
      fov = Math.max(6, Math.min(48, 2 * Math.atan(16 / dist) * 180 / Math.PI));
    }
    // never put the camera inside a building / grandstand: lift it above the roof
    if (this.obstacles && this.camMode !== 'onboard' && this.camMode !== 'cockpit') for (const o of this.obstacles) { const d2 = (o.x - pos.x) ** 2 + (o.z - pos.z) ** 2; if (d2 < o.r * o.r && pos.y < (o.h ?? 14) + 3) pos.y = (o.h ?? 14) + 3; }
    const k = this.camMode === 'heli' ? Math.min(1, dt * 3) : 1;
    // driver's eye: hide our own helmet, allow very near geometry
    const ck = this.camMode === 'cockpit';
    if (this._ckCar && this._ckCar !== focus) { this._ckCar.mesh.userData.helmetParts?.forEach((h) => (h.visible = true)); this._ckCar = null; }
    if (ck) { focus.mesh.userData.helmetParts?.forEach((h) => (h.visible = false)); this._ckCar = focus; } else if (this._ckCar) { this._ckCar.mesh.userData.helmetParts?.forEach((h) => (h.visible = true)); this._ckCar = null; }
    if (this.camera.near !== (ck ? 0.05 : 0.3)) { this.camera.near = ck ? 0.05 : 0.3; }
    if (this._cut || this.camMode === 'onboard' || ck) { this.camPos.copy(pos); this.camLook.copy(look); this._cut = false; }
    else { this.camPos.lerp(pos, k); this.camLook.lerp(look, this.camMode === 'chase' ? 1 : Math.min(1, dt * 8)); }
    this.camera.position.copy(this.camPos);
    this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 4);
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(this.camLook);
    this.sun.position.copy(target).add(new THREE.Vector3(150, 300, 100));
    this.sun.target.position.copy(target);
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
