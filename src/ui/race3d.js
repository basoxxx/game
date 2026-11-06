// 3D race view: circuit built from real geometry, broadcast-style cameras
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { trackGeometry, speedProfile, sampleAtTimeFrac } from '../engine/trackphys.js';
import { genStage, STAGE_STYLE } from './trackview.js';
import { getSettings } from '../engine/state.js';
import { passBy } from './audio.js';
import { buildCar, setTyreColor } from './cars3d.js';

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
    this.surface = surface;
    this.category = category;
    this.night = night;
    this.camMode = 'tv';
    this.focusKey = null;
    this.low = getSettings().gfx === 'low';
    this.renderer = new THREE.WebGLRenderer({ antialias: !this.low, powerPreference: 'high-performance' });
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
    if (this.open) this.buildStage(); else { this.buildTrack(street); this.buildScenery(street); }
    this.buildRacingLine();
    this.cars = new Map();
    for (const c of cars) this.addCar(c);
    this.camPos = new THREE.Vector3(0, 50, 0);
    this.camLook = new THREE.Vector3();
    this.tvCams = this.makeTvCams();
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
    this.camera.aspect = r.width / r.height;
    this.camera.updateProjectionMatrix();
    this.W = r.width; this.H = r.height;
  }

  buildEnv() {
    const night = this.night;
    const sky = night ? 0x070b18 : 0x8fc2ff;
    this.scene.background = new THREE.Color(sky);
    this.scene.fog = new THREE.Fog(night ? 0x070b18 : 0xb8d4f0, 400, 2600);
    const hemi = new THREE.HemisphereLight(night ? 0x334466 : 0xdfefff, night ? 0x0b0d10 : 0x4a6a3a, night ? 0.9 : 1.1);
    this.scene.add(hemi); this.hemi = hemi;
    const sun = new THREE.DirectionalLight(night ? 0xbfd4ff : 0xfff1dc, night ? 0.9 : 2.6);
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
  ribbon(a, b, y, material, vScale = 0.05, step = 1, uSpan = 1, flat = false) {
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
      if (n < count - 1) { const k = n * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
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

  buildTrack(street) {
    const W = street > 0.7 ? 11 : 13;
    this.TW = W;
    const asphalt = canvasTex(256, 256, (c, w, h) => {
      noise(c, w, h, '#3b3e44', 255, 9000, 2);
      c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(w * 0.38, 0, w * 0.24, h); // racing line rubber
      c.fillStyle = '#f2f2f2'; c.fillRect(0, 0, 6, h); c.fillRect(w - 6, 0, 6, h);
    });
    this.asphaltMat = new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.82, metalness: 0.05 });
    const runoffMat = new THREE.MeshStandardMaterial({ map: canvasTex(128, 128, (c, w, h) => noise(c, w, h, street > 0.7 ? '#55585e' : '#7c7f86', 255, 3000, 2)), roughness: 0.9 });
    const grass = canvasTex(256, 256, (c, w, h) => { noise(c, w, h, '#3f7a34', 255, 12000, 3); for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.03)'; c.fillRect(0, i * h / 8, w, h / 8); } }, [400, 400]);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(12000, 12000), new THREE.MeshStandardMaterial({ map: grass, roughness: 1, color: street > 0.7 ? 0x9a9a9a : 0xffffff }));
    ground.rotation.x = -Math.PI / 2; ground.position.set((this.geo.bbox[0] + this.geo.bbox[2]) / 2, -0.05, (this.geo.bbox[1] + this.geo.bbox[3]) / 2);
    ground.receiveShadow = true;
    if (street > 0.7) ground.material.map = canvasTex(256, 256, (c, w, h) => noise(c, w, h, '#5d6066', 255, 8000, 2), [600, 600]);
    this.scene.add(ground);
    const runoff = street > 0.7 ? 3 : 16;
    this.scene.add(this.ribbon(W / 2, W / 2 + runoff, 0.01, runoffMat, 0.05));
    this.scene.add(this.ribbon(-W / 2 - runoff, -W / 2, 0.01, runoffMat, 0.05));
    this.scene.add(this.ribbon(-W / 2, W / 2, 0.03, this.asphaltMat, 0.06));
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
          pos.push(this.geo.x[i] + nx * a, 0.06, this.geo.y[i] + nz * a, this.geo.x[i] + nx * b, 0.09, this.geo.y[i] + nz * b);
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
    for (const side of [1, -1]) {
      const off = side * (W / 2 + runoff + (street > 0.7 ? 0.5 : 4));
      const pos = [], uv = [], idx = [];
      const step = 2; let v = 0; const count = Math.ceil(N / step) + 1;
      for (let n = 0; n < count; n++) {
        const i = (n * step) % N; const nx = -Math.sin(this.geo.hdg[i]), nz = Math.cos(this.geo.hdg[i]);
        const px = this.geo.x[i] + nx * off, pz = this.geo.y[i] + nz * off;
        pos.push(px, 0, pz, px, 1.1, pz); uv.push(v, 0, v, 1); v += this.geo.ds * step / 20;
        if (n < count - 1) { const k = n * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
      const m = new THREE.Mesh(g, wallMat); m.castShadow = true; this.scene.add(m);
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
    this.asphaltMat = new THREE.MeshStandardMaterial({ map: road, roughness: surf === 'snow' ? 0.5 : 0.95 });
    const vergeMat = new THREE.MeshStandardMaterial({ map: canvasTex(128, 128, (c, w, h) => noise(c, w, h, cols[1], 255, 5000, 3)), roughness: 1 });
    const groundCol = surf === 'snow' ? '#dfe9f1' : surf === 'tarmac' ? '#4f6b3a' : '#5d6b38';
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(30000, 30000), new THREE.MeshStandardMaterial({ map: canvasTex(256, 256, (c, w, h) => noise(c, w, h, groundCol, 255, 12000, 3), [600, 600]), roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.set((this.geo.bbox[0] + this.geo.bbox[2]) / 2, -0.05, (this.geo.bbox[1] + this.geo.bbox[3]) / 2); ground.receiveShadow = true;
    this.scene.add(ground);
    this.scene.add(this.ribbon(W / 2, W / 2 + 2.5, 0.01, vergeMat, 0.05));
    this.scene.add(this.ribbon(-W / 2 - 2.5, -W / 2, 0.01, vergeMat, 0.05));
    this.scene.add(this.ribbon(-W / 2, W / 2, 0.03, this.asphaltMat, 0.08));
    if (surf === 'snow') {
      const bankMat = new THREE.MeshStandardMaterial({ color: 0xf4f8fb, roughness: 0.6 });
      for (const side of [1, -1]) { const m = this.ribbon(side * (W / 2 + 2.4), side * (W / 2 + 3.4), 0.5, bankMat, 0.05, 2); this.scene.add(m); }
    }
    // dense forest along the road
    const N = this.geo.N;
    const count = this.low ? 600 : 1800;
    const cone = new THREE.ConeGeometry(1, 1, 7);
    const treeMat = new THREE.MeshStandardMaterial({ color: surf === 'snow' ? 0x2c4a36 : surf === 'rough' ? 0x6f7d3a : 0x2d5527, roughness: 0.9 });
    const inst = new THREE.InstancedMesh(cone, treeMat, count);
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
      dummy.position.set(px, baseH + h / 2, pz); dummy.scale.set(wd, h, wd); dummy.rotation.y = Math.random() * 3; dummy.updateMatrix();
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
    const standMat = new THREE.MeshStandardMaterial({ map: canvasTex(256, 64, (c, w, h) => { c.fillStyle = '#3b4252'; c.fillRect(0, 0, w, h); for (let i = 0; i < 1600; i++) { c.fillStyle = `hsl(${Math.random() * 360},60%,${40 + Math.random() * 30}%)`; c.fillRect(Math.random() * w, Math.random() * h, 2, 2); } }, [4, 1]), roughness: 0.9 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0xdedede, roughness: 0.5, metalness: 0.3 });
    for (let k = -3; k <= 3; k++) {
      const st = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(38, 12, 14), standMat); body.position.y = 6; body.rotation.x = 0; st.add(body);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(40, 0.6, 16), roofMat); roof.position.y = 13; st.add(roof);
      body.castShadow = true;
      this.placeAt(st, k * 9, -(W / 2 + (street > 0.7 ? 14 : 34)), 0);
      this.scene.add(st);
    }
    const big = this.geo.corners.slice().sort((a, b) => a.r - b.r).slice(0, 4);
    for (const cn of big) {
      const st = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(30, 9, 10), standMat); body.position.y = 4.5; body.castShadow = true; st.add(body);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(32, 0.5, 12), roofMat); roof.position.y = 10; st.add(roof);
      this.placeAt(st, cn.i, -cn.dir * (W / 2 + (street > 0.7 ? 12 : 30)), 0);
      this.scene.add(st);
    }
    const pit = new THREE.Mesh(new THREE.BoxGeometry(260, 9, 18), new THREE.MeshStandardMaterial({ color: 0xc9ced6, roughness: 0.5, metalness: 0.2 }));
    pit.castShadow = true; pit.receiveShadow = true;
    this.placeAt(pit, 0, W / 2 + (street > 0.7 ? 16 : 40), 4.5);
    this.scene.add(pit);
    // trees / buildings instanced
    const count = Math.round((street > 0.7 ? 260 : 700) * (this.low ? 0.35 : 1));
    const geo = street > 0.7 ? new THREE.BoxGeometry(1, 1, 1) : new THREE.ConeGeometry(1, 1, 7);
    const m = street > 0.7 ? new THREE.MeshStandardMaterial({ color: 0xb0b4bc, roughness: 0.8 }) : new THREE.MeshStandardMaterial({ color: 0x2f5e2a, roughness: 0.9 });
    const inst = new THREE.InstancedMesh(geo, m, count);
    const dummy = new THREE.Object3D();
    for (let k = 0; k < count; k++) {
      const i = Math.floor(Math.random() * N);
      const side = Math.random() < 0.5 ? 1 : -1;
      const off = side * (W / 2 + (street > 0.7 ? 14 : 40) + Math.random() * (street > 0.7 ? 60 : 160));
      // keep away from the track (other parts)
      const nx = -Math.sin(this.geo.hdg[i]), nz = Math.cos(this.geo.hdg[i]);
      const px = this.geo.x[i] + nx * off, pz = this.geo.y[i] + nz * off;
      let ok = true;
      for (let j = 0; j < N; j += 6) { const dx = this.geo.x[j] - px, dz = this.geo.y[j] - pz; if (dx * dx + dz * dz < (street > 0.7 ? 18 * 18 : 30 * 30)) { ok = false; break; } }
      if (!ok) continue;
      const h = street > 0.7 ? 12 + Math.random() * 50 : 8 + Math.random() * 12;
      const wd = street > 0.7 ? 10 + Math.random() * 18 : 3 + Math.random() * 2.5;
      dummy.position.set(px, h / 2, pz); dummy.scale.set(wd, h, wd); dummy.rotation.y = Math.random() * 3; dummy.updateMatrix();
      inst.setMatrixAt(k, dummy.matrix);
    }
    inst.castShadow = true;
    this.scene.add(inst);
    // trackside sponsor billboards
    const brands = ['PETRONIX', 'ORACLO', 'ARAMCORE', 'ROLEXA', 'HEINEKAN 0.0', 'DHX', 'PIRELLO', 'LENOVA', 'SANTANDOR', 'MONSTRO', 'PUMO', 'BREMBI', 'CRYPTO.CAM', 'LAVAZZO', 'TAG HEUERR', 'APEX DYNASTY'];
    const bcols = ['#e10600', '#111111', '#0a2a66', '#ffd400', '#00594f', '#ffffff', '#ff8000', '#1d4ec2'];
    const bmats = brands.map((b, i) => { const t = canvasTex(512, 96, (c, w, h) => { const bg = bcols[i % bcols.length]; c.fillStyle = bg; c.fillRect(0, 0, w, h); c.fillStyle = bg === '#ffffff' || bg === '#ffd400' ? '#111' : '#fff'; c.font = 'italic 900 60px "Exo 2", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(b, w / 2, h / 2 + 3); }); return new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: this.night ? 0.6 : 0.08 }); });
    const bstep = Math.max(30, Math.round(N / 34));
    for (let i = 10, k = 0; i < N; i += bstep, k++) {
      if (Math.abs(this.geo.k[i]) > 1 / 300) continue;
      const side = k % 2 ? 1 : -1;
      const bb = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.4, 12), bmats[k % bmats.length]);
      this.placeAt(bb, i, side * (W / 2 + (street > 0.7 ? 4.2 : 6.5)), 1.4);
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
      const side = (cams.length % 2 ? 1 : -1);
      const nx = -Math.sin(this.geo.hdg[i]), nz = Math.cos(this.geo.hdg[i]);
      cams.push({ i, pos: new THREE.Vector3(this.geo.x[i] + nx * side * (this.TW / 2 + 26), 7 + (cams.length % 3) * 3, this.geo.y[i] + nz * side * (this.TW / 2 + 26)) });
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
    this.cars.set(c.key, { mesh: m, label, lane: ((c.key.charCodeAt(0) + c.key.length * 7) % 5 - 2) * 0.9, lastS: 0, tyre: c.tyreColor, isPlayer: c.isPlayer });
  }

  setNight(n) {
    if (this._night === n) return; this._night = n;
    const day = { top: new THREE.Color(0x3d7ad6), bot: new THREE.Color(0xcfe3f7), fog: new THREE.Color(0xb8d4f0) };
    const nite = { top: new THREE.Color(0x02040c), bot: new THREE.Color(0x141c33), fog: new THREE.Color(0x070b18) };
    this.skyMat.uniforms.top.value.copy(day.top).lerp(nite.top, n);
    this.skyMat.uniforms.bot.value.copy(day.bot).lerp(nite.bot, n);
    this.scene.fog.color.copy(day.fog).lerp(nite.fog, n);
    this.scene.background = this.scene.fog.color.clone();
    this.hemi.intensity = 1.1 - n * 0.55; this.sun.intensity = 2.6 - n * 2.0;
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
    this.asphaltMat.roughness = 0.82 - wet * 0.55; this.asphaltMat.metalness = 0.05 + wet * 0.35;
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
        this._degraded = true; this.renderer.setPixelRatio(1); this.renderer.shadowMap.enabled = false;
        this.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
        this.resize();
      }
    }
    let focus = null;
    for (const st of states) {
      const car = this.cars.get(st.key); if (!car) continue;
      const m = car.mesh;
      if (st.hidden) { m.visible = false; car.label.style.display = 'none'; continue; }
      m.visible = true;
      let s = st.s;
      const i0 = this.open ? Math.min(N - 2, Math.max(0, Math.floor(s))) : Math.floor(s) % N, i1 = this.open ? i0 + 1 : (i0 + 1) % N, f = this.open ? Math.min(1, Math.max(0, s - i0)) : s - Math.floor(s);
      let hd = this.geo.hdg[i1] - this.geo.hdg[i0]; while (hd > Math.PI) hd -= 2 * Math.PI; while (hd < -Math.PI) hd += 2 * Math.PI;
      const h = this.geo.hdg[i0] + hd * f;
      let lane = st.inPit ? this.TW / 2 + 10 : (this.line ? this.line[i0] * (st.close ? 0.4 : 1) : 0) + (st.close && st.pos ? (st.pos % 2 ? 2.4 : -2.4) : car.lane * 0.25);
      car.laneCur = car.laneCur == null ? lane : car.laneCur + (lane - car.laneCur) * Math.min(1, dt * 6);
      const nx = -Math.sin(h), nz = Math.cos(h);
      const x = this.geo.x[i0] + (this.geo.x[i1] - this.geo.x[i0]) * f + nx * car.laneCur;
      const z = this.geo.y[i0] + (this.geo.y[i1] - this.geo.y[i0]) * f + nz * car.laneCur;
      let yy = 0.02;
      if (this.geo.h) {
        const h0 = this.geo.h[i0], h1 = this.geo.h[i1]; yy += h0 + (h1 - h0) * f;
        // airborne over crests: ballistic arc proportional to speed
        for (const ci of this.geo.crests || []) { const dd = s - ci; if (dd > 0 && dd < 10 && (st.speed || 0) > 22) { yy += Math.sin((dd / 10) * Math.PI) * Math.min(1.6, (st.speed - 22) / 14); } }
        m.rotation.z = Math.atan2(h1 - h0, this.geo.ds) * 0.9;
      }
      m.position.set(x, yy, z);
      m.rotation.y = -h;
      // body roll/pitch from curvature and acceleration
      const k = this.geo.k[i0];
      m.rotation.x = Math.max(-0.04, Math.min(0.04, k * (st.speed || 0) ** 2 * 0.0012));
      const spin = (st.speed || 0) * dt / 0.34;
      for (const w of m.userData.wheels) for (const sp of w.userData.spin) sp.rotation.y += spin;
      if (st.tyreColor && st.tyreColor !== car.tyre) { car.tyre = st.tyreColor; setTyreColor(m, st.tyreColor); }
      car.state = st;
      if (st.key === this.focusKey) focus = car;
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
    this.renderer.render(this.scene, this.camera);
    this.updateLabels();
  }

  startIntro(sec = 5) { this.introT = sec; this.introDur = sec; }

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
      this.introT -= dt;
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
    } else if (this.camMode === 'onboard') {
      pos = target.clone().addScaledVector(fwd, this.category === 'formula' ? -1.25 : 0.2).add(new THREE.Vector3(0, this.category === 'formula' ? 1.55 : 1.3, 0));
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
    const k = this.camMode === 'heli' ? Math.min(1, dt * 3) : 1;
    if (this._cut || this.camMode === 'onboard') { this.camPos.copy(pos); this.camLook.copy(look); this._cut = false; }
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
      if (v.z > 1 || v.z < -1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1 || (dist > 260 && !car.isPlayer) || (this.camMode === 'onboard' && dist < 3)) { car.label.style.display = 'none'; continue; }
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
