// 3D presentation layer of the management game.
//
// One shared WebGL renderer drives everything the menus show in 3D:
//   - mountStage(): the living pit-garage set (team-coloured walls, light rig, props) with the
//     car in it. Camera "modes": 'cine' (menu: slow cinematic cuts), 'hero' (hub: locked beauty
//     angle with pointer parallax), 'orbit' (technical centre / team preview: drag to rotate,
//     part hotspots with camera focus).
//   - carSnapshot()/helmetSnapshot(): cached still renders for cards and lists.
// The canvas survives App.refresh(): screens just call mountStage() again on the new container.
// The single GL context is kept for the whole session (the race view owns the only other one).
import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { buildCar } from './cars3d.js';
import { applyFilterSettings, makeComposer } from './gfx.js';
import { getSettings } from '../engine/state.js';
import { helmetSVG } from './art.js';

const FONT = '"Barlow Condensed", "Arial Narrow", sans-serif';
const AUTOMATED = typeof navigator !== 'undefined' && !!navigator.webdriver;
const reduceMotion = () => document.documentElement.classList.contains('reduce-motion');
const lowGfx = () => getSettings().gfx === 'low';
let _gl = null;
export function stageAvailable() {
  if (_gl == null) { try { const c = document.createElement('canvas'); _gl = !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch { _gl = false; } }
  return _gl;
}
// live 3D scenes follow the "Vista 3D" setting; still renders only need WebGL
export function stageEnabled() { return stageAvailable() && getSettings().view3d !== false; }

const lum = (hex) => { const c = new THREE.Color(hex); return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b; };
// a colour from the livery that reads as light on dark walls
function accentOf(colors, fallback = '#e5141b') {
  for (const c of colors || []) { if (!c) continue; const l = lum(c); if (l > 0.03 && l < 0.75) return c; }
  return fallback;
}

// ---------------------------------------------------------------- neutral studio env (snapshots)
function studioEnv(renderer) {
  const sc = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(30, 14, 30), new THREE.MeshBasicMaterial({ color: 0x15171c, side: THREE.BackSide }));
  room.position.y = 6; sc.add(room);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshBasicMaterial({ color: 0x0b0c0f })); floor.rotation.x = -Math.PI / 2; floor.position.y = -0.9; sc.add(floor);
  const glow = (w, h, d, x, y, z, k) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(k) })); m.position.set(x, y, z); sc.add(m); };
  for (const z of [-2.4, 0, 2.4]) glow(12, 0.12, 0.7, 0, 8, z, 9);
  for (const x of [-9, 9]) glow(0.2, 6, 1.2, x, 3.5, 0, 4);
  glow(0.2, 3, 8, -13, 4, 6, 1.6); glow(8, 3, 0.2, 4, 4, 13, 1.2);
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(sc, 0.02).texture; pm.dispose();
  sc.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
  return tex;
}

// mirror shader with a radial fade (mesh uv) so the reflection melts into the floor
const FadedReflector = {
  name: 'FadedReflector',
  uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null } },
  vertexShader: `uniform mat4 textureMatrix; varying vec4 vUv; varying vec2 vUv0;
    #include <common>
    #include <logdepthbuf_pars_vertex>
    void main() { vUv = textureMatrix * vec4(position, 1.0); vUv0 = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    #include <logdepthbuf_vertex>
    }`,
  fragmentShader: `uniform vec3 color; uniform sampler2D tDiffuse; varying vec4 vUv; varying vec2 vUv0;
    #include <logdepthbuf_pars_fragment>
    void main() {
      #include <logdepthbuf_fragment>
      vec4 base = texture2DProj(tDiffuse, vUv);
      float r = length(vUv0 - 0.5) * 2.0;
      gl_FragColor = vec4(base.rgb * color, (1.0 - smoothstep(0.3, 1.0, r)) * 0.34);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

// ---------------------------------------------------------------- canvas textures of the set
function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c, srgb = true) { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }
function panels(g, w, h, step) {
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#262a31'); gr.addColorStop(0.55, '#1c1f25'); gr.addColorStop(1, '#131519');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  for (let x = 0; x <= w; x += step) { g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(x - 2, 0, 4, h); g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(x + 2, 0, 2, h); }
  // brushed streaks so the wall is not a flat fill
  g.globalAlpha = 0.05;
  for (let i = 0; i < 260; i++) { const x = (i * 7919) % w, y = (i * 104729) % h; g.fillStyle = i % 2 ? '#fff' : '#000'; g.fillRect(x, y, 120 + (i % 5) * 60, 1); }
  g.globalAlpha = 1;
  // kick plate + hazard edge
  g.fillStyle = '#0c0d10'; g.fillRect(0, h * 0.9, w, h * 0.1);
  g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(0, h * 0.9, w, 2);
}
function fitText(g, text, maxW, size, weight = 800, italic = true) {
  let s = size;
  do { g.font = `${italic ? 'italic ' : ''}${weight} ${s}px ${FONT}`; s -= 4; } while (g.measureText(text).width > maxW && s > 24);
}
function backWallTex(th) {
  const W = 2048, H = 704; const [c, g] = cv(W, H);
  panels(g, W, H, 256);
  const a = th.accent, name = (th.name || 'Apex Dynasty').toUpperCase();
  // slanted livery slab behind the name
  g.save(); g.transform(1, 0, -0.22, 1, 0, 0);
  g.fillStyle = a; g.fillRect(300, H * 0.26, W * 0.62, H * 0.3);
  g.fillStyle = th.second; g.fillRect(300 + W * 0.62 + 14, H * 0.26, 46, H * 0.3);
  g.fillStyle = 'rgba(255,255,255,.14)'; g.fillRect(300 + W * 0.62 + 74, H * 0.26, 16, H * 0.3);
  g.restore();
  g.textBaseline = 'middle'; g.textAlign = 'left';
  fitText(g, name, W * 0.54, 190);
  g.fillStyle = lum(a) > 0.55 ? '#0b0c0f' : '#ffffff';
  g.fillText(name, 330, H * 0.415);
  // box number + small technical lettering
  g.font = `italic 800 150px ${FONT}`; g.textAlign = 'right'; g.fillStyle = 'rgba(255,255,255,.10)';
  g.fillText(String(th.box).padStart(2, '0'), W - 70, H * 0.4);
  g.font = `600 26px ${FONT}`; g.fillStyle = 'rgba(255,255,255,.34)'; g.textAlign = 'left';
  g.fillText(`BOX ${String(th.box).padStart(2, '0')}  ·  ${(th.series || 'APEX DYNASTY').toUpperCase()}  ·  PIT GARAGE`.split('').join(' '), 84, H * 0.66);
  g.fillStyle = a; g.fillRect(84, H * 0.7, 120, 5);
  return tex(c);
}
function sideWallTex(th, flip) {
  const W = 2048, H = 600; const [c, g] = cv(W, H);
  panels(g, W, H, 292);
  g.save(); g.transform(1, 0, -0.22, 1, 0, 0);
  g.fillStyle = th.accent; g.fillRect(flip ? 240 : W - 620, H * 0.34, 420, 16);
  g.fillStyle = 'rgba(255,255,255,.2)'; g.fillRect(flip ? 240 : W - 620, H * 0.34 + 26, 260, 5);
  g.restore();
  g.font = `italic 800 260px ${FONT}`; g.textBaseline = 'middle'; g.textAlign = 'center'; g.fillStyle = 'rgba(255,255,255,.07)';
  g.fillText((th.short || 'APX').toUpperCase(), flip ? W * 0.72 : W * 0.28, H * 0.42);
  return tex(c);
}
function doorTex() {
  const W = 1024, H = 512; const [c, g] = cv(W, H);
  g.fillStyle = '#15171b'; g.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += 22) { const gr = g.createLinearGradient(0, y, 0, y + 22); gr.addColorStop(0, '#22252b'); gr.addColorStop(0.7, '#17191d'); gr.addColorStop(1, '#0b0c0e'); g.fillStyle = gr; g.fillRect(0, y, W, 22); }
  g.fillStyle = '#0c0d10'; g.fillRect(0, H * 0.9, W, H * 0.1);
  for (let x = -H; x < W; x += 70) { g.fillStyle = '#c9a400'; g.beginPath(); g.moveTo(x, H); g.lineTo(x + 35, H); g.lineTo(x + 35 + 26, H * 0.95); g.lineTo(x + 26, H * 0.95); g.fill(); }
  return tex(c);
}
function floorDecalTex(th) {
  const W = 2048, H = 1024; const [c, g] = cv(W, H);
  const a = th.accent;
  g.lineWidth = 9; g.strokeStyle = 'rgba(235,238,242,.7)';
  // bay outline (the car sits in the middle, nose toward +x = right side of the canvas)
  const bx = 250, by = 200, bw = W - 500, bh = H - 400;
  g.strokeRect(bx, by, bw, bh);
  // corner brackets in livery colour
  g.strokeStyle = a; g.lineWidth = 22;
  for (const [x, y, sx, sy] of [[bx, by, 1, 1], [bx + bw, by, -1, 1], [bx, by + bh, 1, -1], [bx + bw, by + bh, -1, -1]]) { g.beginPath(); g.moveTo(x + sx * 130, y); g.lineTo(x, y); g.lineTo(x, y + sy * 130); g.stroke(); }
  // stop line + hazard chevrons at the garage mouth
  g.fillStyle = 'rgba(235,238,242,.7)'; g.fillRect(bx + bw + 60, by - 30, 12, bh + 60);
  g.save(); g.beginPath(); g.rect(bx + bw + 96, by - 30, 64, bh + 60); g.clip();
  for (let y = by - 120; y < by + bh + 120; y += 64) { g.fillStyle = '#d9b400'; g.beginPath(); g.moveTo(bx + bw + 96, y); g.lineTo(bx + bw + 160, y + 64); g.lineTo(bx + bw + 160, y + 96); g.lineTo(bx + bw + 96, y + 32); g.fill(); }
  g.restore();
  // stencilled lettering behind the car
  g.save(); g.translate(bx - 60, H / 2); g.rotate(-Math.PI / 2);
  g.font = `italic 800 120px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = 'rgba(235,238,242,.5)';
  g.fillText(`${(th.short || 'APX').toUpperCase()} ${String(th.box).padStart(2, '0')}`, 0, 0);
  g.restore();
  // scuffs: worn paint
  g.globalCompositeOperation = 'destination-out'; g.globalAlpha = 0.35;
  for (let i = 0; i < 420; i++) { const x = (i * 7919) % W, y = (i * 15485863) % H; g.fillRect(x, y, 30 + (i % 7) * 26, 2 + (i % 3)); }
  return tex(c);
}
function screenTex(th, kind) {
  const W = 512, H = 288; const [c, g] = cv(W, H);
  g.fillStyle = '#05070b'; g.fillRect(0, 0, W, H);
  g.fillStyle = th.accent; g.fillRect(0, 0, W, 30);
  g.font = `700 20px ${FONT}`; g.fillStyle = lum(th.accent) > 0.55 ? '#000' : '#fff'; g.textBaseline = 'middle';
  g.fillText(kind === 0 ? 'TIMING' : kind === 1 ? 'TELEMETRY' : 'WEATHER RADAR', 12, 16);
  if (kind === 0) {
    for (let i = 0; i < 9; i++) { const y = 44 + i * 26; g.fillStyle = i % 2 ? '#0d1118' : '#111722'; g.fillRect(8, y, W - 16, 22); g.fillStyle = ['#b46bff', '#3ddc84', '#f4c430', '#e8eaee'][i % 4]; g.fillRect(14, y + 4, 44, 14); g.fillStyle = '#c9ced6'; g.fillRect(70, y + 7, 120 + ((i * 37) % 90), 8); g.fillRect(W - 120, y + 7, 96, 8); }
  } else if (kind === 1) {
    for (const [col, ph, amp] of [['#3ddc84', 0.2, 50], ['#ff5a4f', 1.4, 34], ['#4aa8ff', 2.6, 60]]) { g.strokeStyle = col; g.lineWidth = 3; g.beginPath(); for (let x = 10; x < W - 10; x += 6) { const y = 170 + Math.sin(x * 0.03 + ph) * amp * Math.sin(x * 0.011 + ph) - (col === '#4aa8ff' ? 40 : 0); if (x === 10) g.moveTo(x, y); else g.lineTo(x, y); } g.stroke(); }
    g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 1; for (let y = 60; y < H; y += 44) { g.beginPath(); g.moveTo(8, y); g.lineTo(W - 8, y); g.stroke(); }
  } else {
    for (let i = 0; i < 26; i++) { const x = 60 + ((i * 97) % 400), y = 60 + ((i * 57) % 190), r = 20 + (i % 5) * 12; const gr = g.createRadialGradient(x, y, 2, x, y, r); gr.addColorStop(0, i % 4 ? 'rgba(60,200,120,.55)' : 'rgba(250,200,50,.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
    g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 2; g.beginPath(); g.arc(W / 2, H / 2 + 14, 70, 0, 7); g.stroke();
  }
  return tex(c);
}
function drawerTex(col) {
  const W = 256, H = 256; const [c, g] = cv(W, H);
  g.fillStyle = col; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 5; i++) { const y = 14 + i * 48; g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(8, y, W - 16, 40); g.fillStyle = col; g.fillRect(10, y + 2, W - 20, 36); g.fillStyle = 'rgba(255,255,255,.75)'; g.fillRect(40, y + 8, W - 80, 6); }
  return tex(c);
}
function blobTex() {
  const [c, g] = cv(256, 128);
  const gr = g.createRadialGradient(128, 64, 6, 128, 64, 128); gr.addColorStop(0, 'rgba(0,0,0,.85)'); gr.addColorStop(0.45, 'rgba(0,0,0,.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.save(); g.translate(0, 0); g.scale(1, 0.5); g.translate(0, 64); g.fillStyle = gr; g.fillRect(0, -64, 256, 256); g.restore();
  return tex(c);
}

// ---------------------------------------------------------------- the shared stage
// room: x -8 (back wall) .. +10 (shutter), z ±7.5, ceiling 5.2. The car sits at the origin, nose +x.
const ROOM = { x0: -8, x1: 10, z: 7.5, h: 5.2 };
const ST = { r: null, comp: null, scene: null, cam: null, set: null, themed: [], car: null, carKey: '', themeKey: '', host: null, raf: 0, low: false, cars: new Map(), view: null, release: 0, t: 0, snapDirty: false };

function ensureRenderer() {
  const low = lowGfx();
  if (ST.r && ST.low !== low) disposeStage();
  if (ST.r) return ST.r;
  ST.low = low;
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance', logarithmicDepthBuffer: true });
  r.setPixelRatio(low ? 1 : Math.min(2, window.devicePixelRatio || 1));
  r.shadowMap.enabled = !low; r.shadowMap.type = THREE.PCFSoftShadowMap;
  r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0;
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.setClearColor(0x000000, 0);
  Object.assign(r.domElement.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block' });
  r.domElement.className = 'stage-canvas';
  r.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); cancelAnimationFrame(ST.raf); ST.raf = 0; });
  ST.r = r;
  return r;
}

function box(w, h, d, mat, x, y, z) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return m; }
function buildSet() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x06070a);
  const set = new THREE.Group(); scene.add(set);
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const R = ROOM, cx = (R.x0 + R.x1) / 2, lx = R.x1 - R.x0;
  // floor: sealed concrete, glossy enough to pick up the light rig
  const TL = new THREE.TextureLoader(), base = './assets/tex/concrete_floor_worn_001_';
  const ft = (n, srgb) => { const t = TL.load(base + n + '_1k.jpg'); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 5); t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  const fm = std({ map: ft('diff', true), normalMap: ft('nor_gl'), roughnessMap: ft('rough'), color: 0x7d838c, roughness: 0.62, metalness: 0, normalScale: new THREE.Vector2(0.5, 0.5) });
  fm.envMapIntensity = 0.9;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(lx, R.z * 2), fm); floor.rotation.x = -Math.PI / 2; floor.position.set(cx, 0, 0); floor.receiveShadow = true; set.add(floor);
  const decalM = std({ transparent: true, roughness: 0.5, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const decal = new THREE.Mesh(new THREE.PlaneGeometry(11, 5.5), decalM); decal.rotation.x = -Math.PI / 2; decal.position.set(0.2, 0.004, 0); decal.receiveShadow = true; decal.renderOrder = 1; set.add(decal);
  // soft contact shadow under the car
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 3.6), new THREE.MeshBasicMaterial({ map: blobTex(), transparent: true, depthWrite: false, opacity: 0.9 })); blob.rotation.x = -Math.PI / 2; blob.position.y = 0.006; blob.renderOrder = 2; set.add(blob);
  // walls (single sided: an orbiting camera that leaves the room looks straight through them)
  const wall = (w, h, mat, x, y, z, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.position.set(x, y, z); m.rotation.y = ry; m.receiveShadow = true; set.add(m); return m; };
  const backM = std({ roughness: 0.5, metalness: 0.25 }), sideLM = std({ roughness: 0.5, metalness: 0.25 }), sideRM = std({ roughness: 0.5, metalness: 0.25 }), doorM = std({ map: doorTex(), roughness: 0.45, metalness: 0.5 });
  wall(R.z * 2, R.h, backM, R.x0, R.h / 2, 0, Math.PI / 2);
  wall(R.z * 2, R.h, doorM, R.x1, R.h / 2, 0, -Math.PI / 2);
  wall(lx, R.h, sideLM, cx, R.h / 2, -R.z, 0);
  wall(lx, R.h, sideRM, cx, R.h / 2, R.z, Math.PI);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(lx, R.z * 2), std({ color: 0x0c0d10, roughness: 0.9 })); ceil.rotation.x = Math.PI / 2; ceil.position.set(cx, R.h, 0); set.add(ceil);
  // light rig: truss + softboxes (these are what the clear coat reflects)
  const dark = std({ color: 0x101216, roughness: 0.6, metalness: 0.6 });
  const soft = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(5.5) });
  const softDim = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.85, 0.92, 1).multiplyScalar(2.2) });
  for (const z of [-2.1, 0, 2.1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 0.62), soft); p.rotation.x = Math.PI / 2; p.position.set(0.2, 4.36, z); set.add(p);
    set.add(box(7.9, 0.14, 0.82, dark, 0.2, 4.44, z));
  }
  for (const x of [-4.2, 4.6]) set.add(box(0.12, 0.12, 6.4, dark, x, 4.56, 0));
  for (const z of [-3.2, 3.2]) set.add(box(lx - 1, 0.1, 0.1, dark, cx, 4.7, z));
  // cool wall-wash strips along the top of the side walls
  for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(lx - 2, 0.1), softDim); p.position.set(cx, 4.2, s * (R.z - 0.02)); p.rotation.y = s > 0 ? Math.PI : 0; set.add(p); }
  // livery-coloured LED lines (themed)
  const led = new THREE.MeshBasicMaterial({ color: 0xff2222 });
  for (const z of [-5.12, -2.56, 2.56, 5.12]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(0.07, R.h * 0.82), led); p.position.set(R.x0 + 0.02, R.h * 0.5, z); p.rotation.y = Math.PI / 2; set.add(p); }
  { const p = new THREE.Mesh(new THREE.PlaneGeometry(R.z * 2, 0.06), led); p.position.set(R.x0 + 0.02, 0.52, 0); p.rotation.y = Math.PI / 2; set.add(p); }
  for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(lx, 0.05), led); p.position.set(cx, 0.52, s * (R.z - 0.02)); p.rotation.y = s > 0 ? Math.PI : 0; set.add(p); }
  // wall monitors
  const screens = [];
  for (let i = 0; i < 3; i++) {
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.5, 1.5) });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.84), m); p.position.set(R.x0 + 0.09, 3.72, -5.3 + i * 1.62); p.rotation.y = Math.PI / 2; set.add(p); screens.push(m);
    set.add(box(0.06, 0.92, 1.58, dark, R.x0 + 0.04, 3.72, -5.3 + i * 1.62));
  }
  // props ---------------------------------------------------------------------------------
  const rubber = std({ color: 0x0c0d0f, roughness: 0.85 }), paintM = std({ color: 0xcc2222, roughness: 0.35, metalness: 0.3 }), steel = std({ color: 0x8b9099, roughness: 0.3, metalness: 0.9 });
  const tyreG = new THREE.CylinderGeometry(0.34, 0.34, 0.33, 28), bandG = new THREE.CylinderGeometry(0.345, 0.345, 0.05, 28, 1, true), hubG = new THREE.CylinderGeometry(0.2, 0.2, 0.335, 20);
  const stack = (x, z, n, band, blanket) => {
    for (let i = 0; i < n; i++) {
      const y = 0.17 + i * 0.335;
      const t = new THREE.Mesh(tyreG, blanket && i < n ? paintM : rubber); t.position.set(x, y, z); t.castShadow = true; set.add(t);
      if (!blanket) { const b = new THREE.Mesh(bandG, new THREE.MeshBasicMaterial({ color: band })); b.position.set(x, y, z); set.add(b); const h = new THREE.Mesh(hubG, steel); h.position.set(x, y, z); set.add(h); }
    }
  };
  stack(-7.1, 5.9, 4, 0xe03a3a); stack(-6.3, 6.3, 4, 0xf2c230); stack(-5.45, 6.0, 3, 0xe8eaee);
  stack(-7.1, -6.2, 4, 0, true); stack(-6.3, -6.5, 4, 0, true); stack(-7.0, -5.3, 3, 0, true);
  // tool chests along the side walls
  const chestM = std({ roughness: 0.4, metalness: 0.35 }); const chestTop = std({ color: 0x15171b, roughness: 0.5, metalness: 0.5 });
  for (const [x, z, ry] of [[-3.2, -6.95, 0], [-1.4, -6.95, 0], [2.6, 6.95, Math.PI], [4.4, 6.95, Math.PI]]) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry;
    const b = box(1.6, 0.92, 0.62, chestM, 0, 0.56, 0); b.castShadow = true; g.add(b);
    g.add(box(1.66, 0.05, 0.68, chestTop, 0, 1.045, 0));
    for (const wx of [-0.7, 0.7]) for (const wz of [-0.24, 0.24]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 12), rubber); w.rotation.x = Math.PI / 2; w.position.set(wx, 0.06, wz); g.add(w); }
    set.add(g);
  }
  // air bottles + stands
  for (const [x, z, col] of [[0.6, -6.9, 0x2b3038], [0.95, -6.9, 0x2b3038], [6.4, 6.9, 0xb9bdc4]]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 1.4, 18), std({ color: col, roughness: 0.35, metalness: 0.5 })); c.position.set(x, 0.7, z); c.castShadow = true; set.add(c); const cap = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 8, 0, 7, 0, Math.PI / 2), steel); cap.position.set(x, 1.4, z); set.add(cap); }
  // overhead boom with air lines above the bay (classic pit-garage silhouette)
  set.add(box(0.1, 0.1, 4.4, dark, 2.3, 3.5, 0));
  for (const z of [-2.2, 2.2]) set.add(box(0.07, 1.2, 0.07, dark, 2.3, 4.1, z));
  // lights ---------------------------------------------------------------------------------
  scene.add(new THREE.HemisphereLight(0xcfd8ee, 0x15161a, 0.3));
  const key = new THREE.SpotLight(0xfff4e6, 170, 40, 0.62, 0.7, 1.6); key.position.set(4.2, 4.9, 4.4); key.target.position.set(0, 0.3, 0);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0002; key.shadow.radius = 5; scene.add(key, key.target);
  const top = new THREE.DirectionalLight(0xffffff, 0.35); top.position.set(0.2, 8, 0.4); scene.add(top);
  const rim = new THREE.SpotLight(0xff2222, 60, 30, 0.42, 0.9, 1.5); rim.position.set(-6.5, 2.4, -4.6); rim.target.position.set(0, 0.9, 0); scene.add(rim, rim.target);
  const fill = new THREE.DirectionalLight(0x9fb8ff, 0.3); fill.position.set(5, 2.2, -6); scene.add(fill);
  const wash = new THREE.PointLight(0xff2222, 9, 10, 1.7); wash.position.set(R.x0 + 1.0, 1.0, 0); scene.add(wash);
  const washW = new THREE.PointLight(0xdfe8ff, 70, 16, 1.6); washW.position.set(R.x0 + 2.4, 4.2, 0); scene.add(washW);
  for (const z of [-5.6, 5.6]) { const w = new THREE.PointLight(0xdfe8ff, 34, 14, 1.6); w.position.set(1.5, 3.9, z); scene.add(w); }
  { const w = new THREE.PointLight(0xdfe8ff, 40, 14, 1.6); w.position.set(R.x1 - 2, 4.0, 0); scene.add(w); }
  scene.fog = new THREE.FogExp2(0x06070a, 0.012);
  ST.scene = scene; ST.set = set;
  ST.mats = { backM, sideLM, sideRM, decalM, led, paintM, chestM, screens, rim, wash, blob };
  // reflective floor overlay
  if (!ST.low) {
    try {
      const mirror = new Reflector(new THREE.CircleGeometry(5.4, 48), { textureWidth: 1024, textureHeight: 512, color: 0x8a8f99, multisample: 0, shader: FadedReflector });
      mirror.material.transparent = true; mirror.material.depthWrite = false;
      mirror.rotation.x = -Math.PI / 2; mirror.position.y = 0.002; mirror.renderOrder = 0; scene.add(mirror); ST.mirror = mirror;
    } catch (e) { console.warn('reflector', e); }
  }
  ST.cam = new THREE.PerspectiveCamera(30, 1, 0.1, 80);
}

function applyTheme(th) {
  const k = [th.accent, th.second, th.name, th.short, th.box, th.series, document.fonts?.status].join('|');
  if (k === ST.themeKey) return;
  ST.themeKey = k;
  const M = ST.mats;
  const swap = (mat, t) => { mat.map?.dispose(); mat.map = t; mat.needsUpdate = true; };
  swap(M.backM, backWallTex(th)); swap(M.sideLM, sideWallTex(th, false)); swap(M.sideRM, sideWallTex(th, true)); swap(M.decalM, floorDecalTex(th));
  M.screens.forEach((m, i) => swap(m, screenTex(th, i)));
  const a = new THREE.Color(th.accent);
  // LED lines: keep them bright whatever the hue (boost dark liveries)
  const hsl = {}; a.getHSL(hsl); const ledC = new THREE.Color().setHSL(hsl.h, Math.min(1, hsl.s * 1.1), Math.max(0.5, hsl.l));
  M.led.color.copy(ledC).multiplyScalar(2.6);
  M.rim.color.copy(ledC); M.wash.color.copy(ledC);
  M.paintM.color.copy(a); M.chestM.color.copy(a);
  swap(M.chestM, drawerTex('#' + a.getHexString()));
  // environment from the set itself: the car reflects its own garage
  try {
    const sc = ST.scene, car = ST.car, fog = sc.fog;
    if (car) car.visible = false; if (ST.mirror) ST.mirror.visible = false; M.blob.visible = false; sc.fog = null;
    const env0 = sc.environment; sc.environment = null;
    sc.position.y = -0.9; sc.updateMatrixWorld(true);
    const pm = new THREE.PMREMGenerator(ST.r);
    const env = pm.fromScene(sc, 0.025, 0.1, 60).texture; pm.dispose();
    sc.position.y = 0; sc.updateMatrixWorld(true);
    env0?.dispose(); sc.environment = env; sc.environmentIntensity = 1.15; sc.fog = fog;
    if (car) car.visible = true; if (ST.mirror) ST.mirror.visible = true; M.blob.visible = true;
  } catch (e) { console.warn('env', e); }
}

function disposeCar(car) { car.traverse((o) => { if (o.isMesh) o.geometry?.dispose(); }); }
function setCar(category, livery, opts) {
  const key = [category, livery.primary, livery.secondary, livery.accent, livery.pattern, opts.number, opts.sponsor, opts.helmet].join('|');
  if (key === ST.carKey && ST.car) return;
  if (ST.car) ST.scene.remove(ST.car);
  let car = ST.cars.get(key);
  if (!car) {
    car = buildCar(category, livery, { hq: true, number: opts.number, sponsor: opts.sponsor, helmet: opts.helmet });
    car.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    ST.cars.set(key, car);
    if (ST.cars.size > 5) { const [k0, c0] = ST.cars.entries().next().value; ST.cars.delete(k0); disposeCar(c0); }
  } else { ST.cars.delete(key); ST.cars.set(key, car); }
  ST.car = car; ST.carKey = key; ST.category = category;
  ST.scene.add(car);
  if (ST.view) ST.view.swapT = performance.now();
}

// where the R&D areas live on each car (x forward, y up, z right) and how far the camera sits
const PART_POS = {
  formula: { aero: [2.5, 0.28, 0.5], engine: [-1.15, 0.72, 0.2], chassis: [0.55, 0.62, 0.3], tyre: [1.8, 0.36, 0.86], reliability: [-2.05, 0.42, 0.25] },
  endurance: { aero: [-2.3, 1.0, 0.5], engine: [-1.3, 0.72, 0.3], efficiency: [0.2, 0.5, 0.95], tyre: [1.55, 0.36, 0.95], reliability: [-0.2, 0.95, 0.2] },
  rally: { engine: [1.45, 0.86, 0.3], suspension: [1.3, 0.42, 0.88], chassis: [0, 1.25, 0.3], gearbox: [-0.2, 0.3, 0.9], reliability: [-1.75, 0.8, 0.4] },
};
export function partPositions(category) { return PART_POS[category === 'junior' ? 'formula' : category] || PART_POS.formula; }

const SHOTS = [
  { p0: [6.6, 0.62, 4.3], p1: [5.3, 0.78, 5.5], l0: [0.4, 0.5, 0], l1: [0.2, 0.5, 0], fov: 27, dur: 13 },
  { p0: [-2.0, 0.8, 6.9], p1: [1.4, 0.8, 6.9], l0: [-1.0, 0.6, 0], l1: [0.6, 0.6, 0], fov: 31, dur: 12 },
  { p0: [4.9, 0.34, 1.5], p1: [4.3, 0.42, 2.5], l0: [2.3, 0.36, 0], l1: [2.1, 0.4, 0], fov: 21, dur: 10, near: true },
  { p0: [-6.2, 2.5, 4.2], p1: [-5.2, 2.1, 5.4], l0: [0, 0.4, 0], l1: [0.3, 0.4, 0], fov: 27, dur: 13 },
  { p0: [3.6, 4.3, 3.4], p1: [4.6, 3.6, 2.2], l0: [0, 0.2, 0], l1: [0.2, 0.3, 0], fov: 28, dur: 12 },
  { p0: [-5.2, 0.6, -2.2], p1: [-4.7, 0.85, -3.3], l0: [-1.5, 0.6, 0], l1: [-1.2, 0.6, 0], fov: 23, dur: 11, near: true },
];
const ease = (t) => t * t * (3 - 2 * t);
const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);

class StageView {
  constructor(host, o) {
    this.host = host; this.o = o;
    this.mode = o.mode || 'orbit';
    this.shift = o.shift || 0;
    this.angle = o.angle ?? 0.72; this.pitch = o.pitch ?? 0.2; this.dist = o.dist || 10.5;
    this.target = V(o.target || [0, 0.55, 0]);
    this.fov = o.fov || 28;
    this.goal = null; this.vel = o.spin === false || reduceMotion() ? 0 : 0.0016;
    this.px = 0; this.py = 0; this.spx = 0; this.spy = 0;
    this.shot = Math.floor(Math.random() * SHOTS.length); this.shotT = 0;
    this.hot = []; this.focusId = null; this.swapT = 0; this.frame = 0;
    this.layer = document.createElement('div'); this.layer.className = 'stage-layer'; host.appendChild(this.layer);
    this.fade = document.createElement('div'); this.fade.className = 'stage-fade'; host.appendChild(this.fade);
    this.bind();
  }
  bind() {
    const host = this.host, el = ST.r.domElement;
    this.ac = new AbortController(); const sig = { signal: this.ac.signal };
    if (this.mode === 'orbit' && this.o.interactive !== false) {
      let drag = null;
      el.style.cursor = 'grab'; el.style.touchAction = 'none';
      el.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, a: this.angle, p: this.pitch }; try { el.setPointerCapture(e.pointerId); } catch {} el.style.cursor = 'grabbing'; this.goal = null; }, sig);
      el.addEventListener('pointermove', (e) => { if (!drag) return; this.angle = drag.a + (e.clientX - drag.x) * 0.008; this.pitch = Math.max(0.03, Math.min(1.15, drag.p + (e.clientY - drag.y) * 0.005)); this.vel = 0; }, sig);
      const up = () => { if (!drag) return; drag = null; el.style.cursor = 'grab'; if (!reduceMotion() && this.o.spin !== false && !this.focusId) this.vel = 0.0012; };
      el.addEventListener('pointerup', up, sig); el.addEventListener('pointercancel', up, sig);
      el.addEventListener('wheel', (e) => { e.preventDefault(); this.dist = Math.max(5.2, Math.min(14, this.dist + e.deltaY * 0.008)); if (this.goal) this.goal.dist = this.dist; }, { passive: false, signal: this.ac.signal });
    } else { el.style.cursor = ''; el.style.touchAction = ''; }
    if (this.mode === 'hero' || this.mode === 'cine') {
      window.addEventListener('pointermove', (e) => { const r = host.getBoundingClientRect(); if (!r.width) return; this.px = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1)); this.py = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1)); }, { passive: true, signal: this.ac.signal });
    }
  }
  setHotspots(list) {
    this.layer.innerHTML = '';
    this.hot = (list || []).map((h) => {
      const el = document.createElement('div'); el.className = `hs ${h.cls || ''}`; el.dataset.id = h.id;
      el.innerHTML = `<i></i><span><b>${h.label}</b>${h.value != null ? `<em>${h.value}</em>` : ''}</span>`;
      this.layer.appendChild(el);
      return { ...h, el, v: V(h.pos) };
    });
    if (this.focusId) this.focus(this.focusId, true);
  }
  focus(id, keep = false) {
    this.focusId = id || null;
    for (const h of this.hot) h.el.classList.toggle('on', h.id === id);
    this.layer.classList.toggle('has-focus', !!id);
    const h = this.hot.find((x) => x.id === id);
    if (!h) { if (!keep) { this.goal = { angle: this.o.angle ?? 0.72, pitch: this.o.pitch ?? 0.2, dist: this.o.dist || 10.5, target: V(this.o.target || [0, 0.55, 0]) }; if (!reduceMotion() && this.o.spin !== false) this.vel = 0.0012; } return; }
    const p = h.v, ang = Math.atan2(Math.abs(p.z) > 0.6 ? p.z * 1.6 : 1.5, p.x);
    // shortest way round
    let a = ang; while (a - this.angle > Math.PI) a -= Math.PI * 2; while (a - this.angle < -Math.PI) a += Math.PI * 2;
    this.goal = { angle: a, pitch: p.y > 0.9 ? 0.3 : 0.16, dist: (this.o.dist || 10.5) * 0.64, target: new THREE.Vector3(p.x * 0.62, 0.5, p.z * 0.3) };
    this.vel = 0;
  }
  update(dt, W, H) {
    const cam = ST.cam, rm = reduceMotion();
    let focusD = 10, near = 0.15;
    if (this.mode === 'cine') {
      const s = SHOTS[this.shot];
      this.shotT += rm ? 0 : dt;
      const k = Math.min(1, this.shotT / s.dur), e = rm ? 0.5 : k;
      const p = V(s.p0).lerp(V(s.p1), e), l = V(s.l0).lerp(V(s.l1), e);
      this.spx += (this.px - this.spx) * Math.min(1, dt * 2); this.spy += (this.py - this.spy) * Math.min(1, dt * 2);
      if (!rm) { p.z += this.spx * 0.25; p.y += -this.spy * 0.1; }
      cam.position.copy(p); cam.lookAt(l); cam.fov = s.fov;
      focusD = p.distanceTo(l); near = s.near ? 0.6 : 0.25;
      const edge = Math.min(this.shotT, s.dur - this.shotT);
      this.fade.style.opacity = rm ? 0 : Math.max(0, 1 - edge / 0.9).toFixed(3);
      if (this.shotT >= s.dur) { this.shot = (this.shot + 1) % SHOTS.length; this.shotT = 0; }
    } else {
      if (this.goal) {
        const g = this.goal, a = Math.min(1, dt * 3.2);
        this.angle += (g.angle - this.angle) * a; this.pitch += (g.pitch - this.pitch) * a; this.dist += (g.dist - this.dist) * a; this.target.lerp(g.target, a);
        if (!this.focusId && Math.abs(g.angle - this.angle) < 0.01 && Math.abs(g.dist - this.dist) < 0.05) this.goal = null;
      } else if (this.mode === 'orbit') this.angle += this.vel * dt * 60;
      let ang = this.angle, pit = this.pitch;
      if (this.mode === 'hero') {
        this.spx += (this.px - this.spx) * Math.min(1, dt * 2.5); this.spy += (this.py - this.spy) * Math.min(1, dt * 2.5);
        const t = rm ? 0 : ST.t;
        ang += Math.sin(t * 0.11) * 0.09 + (rm ? 0 : this.spx * 0.07); pit += Math.sin(t * 0.07 + 1) * 0.02 - (rm ? 0 : this.spy * 0.03);
      }
      const d = this.dist, cp = Math.cos(pit);
      cam.position.set(this.target.x + Math.cos(ang) * d * cp, this.target.y + Math.sin(pit) * d, this.target.z + Math.sin(ang) * d * cp);
      cam.position.y = Math.max(0.18, cam.position.y);
      cam.lookAt(this.target); cam.fov = this.fov;
      focusD = cam.position.distanceTo(this.focusId ? this.goal?.target || this.target : this.target);
      this.fade.style.opacity = 0;
    }
    // keep the subject off-centre when the UI covers one side
    if (this.shift) cam.setViewOffset(W, H, -W * this.shift, 0, W, H); else cam.clearViewOffset();
    cam.aspect = W / H; cam.updateProjectionMatrix();
    const dof = ST.comp?.dof;
    if (dof) {
      dof.enabled = true; const u = dof.uniforms, px = H / 720;
      u.uFocus.value = focusD; u.uRange.value = Math.max(3, focusD * (this.mode === 'cine' ? 0.55 : 0.8)); u.uMax.value = (this.mode === 'cine' ? 4.5 : 3) * px; u.uNear.value = near;
    }
    // new car: quick fade-in from black keeps swaps from popping
    if (this.swapT) { const k = (performance.now() - this.swapT) / 420; if (k >= 1) this.swapT = 0; else if (this.mode !== 'cine') this.fade.style.opacity = (1 - k).toFixed(3); }
    // hotspots
    if (this.hot.length) {
      cam.updateMatrixWorld();
      const v = new THREE.Vector3();
      for (const h of this.hot) {
        v.copy(h.v); if (cam.position.z < 0 && Math.abs(h.v.z) > 0.05) v.z = -v.z; // mirror to the visible side
        v.project(cam);
        const x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * H;
        h.el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
        h.el.classList.toggle('flip', x > W * 0.62);
        h.el.style.display = v.z < 1 && x > 8 && x < W - 8 && y > 8 && y < H - 8 ? '' : 'none';
      }
    }
  }
  destroy() { this.ac.abort(); this.layer.remove(); this.fade.remove(); }
}

function resizeStage() {
  const host = ST.host; if (!host || !ST.r) return [0, 0];
  const r = host.getBoundingClientRect(); const W = Math.round(r.width), H = Math.round(r.height);
  if (!W || !H) return [0, 0];
  if (W !== ST.W || H !== ST.H || ST.snapDirty) {
    ST.W = W; ST.H = H; ST.snapDirty = false;
    ST.r.setPixelRatio(ST.low ? 1 : Math.min(W * H > 2600000 ? 1.25 : 2, window.devicePixelRatio || 1));
    ST.r.setSize(W, H, false);
    if (ST.comp) { ST.comp.setPixelRatio(ST.r.getPixelRatio()); ST.comp.setSize(W, H); }
  }
  return [W, H];
}
function frame(now) {
  ST.raf = requestAnimationFrame(frame);
  const view = ST.view; if (!view || !ST.host?.isConnected) return;
  if (document.hidden || ST.frozen) return;
  // automated browsers render in software: a few frames per second keep the page responsive
  if (AUTOMATED && now - (ST.last || 0) < 450) return;
  // the hub hero idles at half rate: it is a backdrop, not the main act
  view.frame++;
  if (view.mode === 'hero' && view.frame % 2 && !view.goal) return;
  const dt = Math.min(0.1, (now - (ST.last || now)) / 1000); ST.last = now; ST.t += dt;
  const [W, H] = resizeStage(); if (!W) return;
  view.update(dt, W, H);
  if (ST.car?.userData.wheels && view.mode === 'orbit' && view.vel) for (const w of ST.car.userData.wheels) for (const sp of w.userData.spin || []) sp.rotation.z -= 0.012;
  try { if (ST.comp) ST.comp.render(dt); else ST.r.render(ST.scene, ST.cam); } catch (e) { console.warn('stage render', e); cancelAnimationFrame(ST.raf); ST.raf = 0; }
  if (!view.shown) { view.shown = true; view.host.classList.add('stage-on'); }
}

// Mount (or re-attach) the garage stage in `host`. Returns a handle:
//   { focus(partId|null), setHotspots(list), destroy() }
// opts: { category, livery, number, sponsor, helmet, team: { name, short, colors }, series, box,
//         mode: 'cine' | 'hero' | 'orbit', shift, angle, pitch, dist, fov, target, spin, interactive }
export function mountStage(host, opts = {}) {
  if (!host || !stageEnabled()) return null;
  try {
    clearTimeout(ST.release); ST.release = 0;
    const r = ensureRenderer();
    if (!ST.scene) buildSet();
    const L = { primary: '#e10600', secondary: '#ffffff', accent: '#111111', pattern: 1, ...opts.livery };
    const team = opts.team || {};
    const th = { accent: opts.accent || accentOf([L.primary, L.secondary, L.accent]), second: lum(L.secondary) > 0.04 ? L.secondary : '#ffffff', name: team.name || 'Apex Dynasty', short: team.short || 'APX', box: opts.box || opts.number || 1, series: opts.series || '' };
    setCar(opts.category || 'formula', L, opts);
    applyTheme(th);
    if (document.fonts?.status !== 'loaded') document.fonts?.ready.then(() => { if (ST.scene && ST.host) { applyTheme(th); } });
    if (!ST.comp && !ST.low) {
      r.setSize(Math.max(2, host.clientWidth), Math.max(2, host.clientHeight), false);
      ST.comp = makeComposer(r, ST.scene, ST.cam, { bloom: 0.12, low: false, ao: false, grade: true, filter: true, dof: true });
    }
    if (!ST.comp) applyFilterSettings(r.domElement); else applyFilterSettings(ST.comp);
    // same host kind + same mode: keep the camera where the player left it
    const prev = ST.view;
    const sameKind = prev && prev.o.id === opts.id && prev.mode === (opts.mode || 'orbit');
    prev?.destroy();
    host.classList.add('stage-host'); host.appendChild(r.domElement);
    ST.host = host; ST.W = 0;
    const view = new StageView(host, opts);
    if (sameKind) { view.angle = prev.angle; view.pitch = prev.pitch; view.dist = prev.dist; view.target.copy(prev.target); view.vel = prev.vel; view.shot = prev.shot; view.shotT = prev.shotT; view.shown = true; host.classList.add('stage-on'); view.swapT = prev.swapT; }
    ST.view = view;
    if (!ST.raf) { ST.last = 0; ST.raf = requestAnimationFrame(frame); }
    return {
      focus: (id) => ST.view === view && view.focus(id),
      setHotspots: (list) => ST.view === view && view.setHotspots(list),
      destroy: () => releaseStage(view),
    };
  } catch (e) { console.warn('stage', e); return null; }
}
export function releaseStage(view) {
  if (view && ST.view !== view) return;
  ST.view?.destroy(); ST.view = null;
  ST.r?.domElement.remove(); ST.host = null;
  cancelAnimationFrame(ST.raf); ST.raf = 0;
}
export function disposeStage() {
  clearTimeout(ST.release); cancelAnimationFrame(ST.raf); ST.raf = 0;
  ST.view?.destroy(); ST.view = null; ST.host = null;
  if (!ST.r) return;
  try {
    if (ST.car) ST.scene?.remove(ST.car); // car materials are shared with the race view: leave them alone
    for (const c of ST.cars.values()) disposeCar(c); ST.cars.clear();
    ST.scene?.traverse((o) => { if (o.isMesh) { o.geometry?.dispose(); const m = o.material; if (m && !m.userData?.keepFar) { m.map?.dispose?.(); m.dispose?.(); } } });
    ST.scene?.environment?.dispose(); ST.mirror?.dispose?.();
    ST.comp?.renderTarget1?.dispose(); ST.comp?.renderTarget2?.dispose();
    snapScene?.environment?.dispose(); snapScene = null; snapCam = null; helmetRig = null;
    ST.r.domElement.remove(); ST.r.dispose(); ST.r.forceContextLoss();
  } catch (e) { console.warn(e); }
  Object.assign(ST, { r: null, comp: null, scene: null, cam: null, set: null, car: null, carKey: '', themeKey: '', mirror: null, mats: null, W: 0, H: 0 });
}
export function stageInfo() { return { live: !!ST.r, view: ST.view?.mode || null }; }
// test / capture hook: freeze(true) stops the render loop after the current frame
if (typeof window !== 'undefined') window.__stage = { freeze: (v = true) => { ST.frozen = v; }, info: stageInfo, state: ST };

// Back-compat wrapper used by older call sites: an orbit stage
export class Garage3D {
  constructor(container, category, livery, opts = {}) { this.h = mountStage(container, { id: 'garage', mode: 'orbit', category, livery, ...opts }); }
  destroy() { this.h?.destroy(); }
}

// ---------------------------------------------------------------- still renders (cached data URLs)
let snapScene = null, snapCam = null, helmetRig = null;
const snapCache = new Map();
function snapSetup() {
  const r = ensureRenderer();
  if (!snapScene) {
    snapScene = new THREE.Scene();
    snapScene.environment = studioEnv(r); snapScene.environmentIntensity = 0.95;
    const key2 = new THREE.DirectionalLight(0xffffff, 2.2); key2.position.set(4, 8, 6); key2.castShadow = true; key2.shadow.mapSize.set(1024, 1024);
    const sc = key2.shadow.camera; sc.left = -5; sc.right = 5; sc.top = 5; sc.bottom = -5;
    snapScene.add(key2, new THREE.HemisphereLight(0xdde6ff, 0x222428, 0.5));
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.ShadowMaterial({ opacity: 0.45 })); sh.rotation.x = -Math.PI / 2; sh.receiveShadow = true; snapScene.add(sh); snapScene.userData.ground = sh;
    snapCam = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  }
  return r;
}
function snapRender(r, w, h) {
  const pr = r.getPixelRatio();
  r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  r.setSize(w, h, false);
  r.setRenderTarget(null); r.clear();
  r.render(snapScene, snapCam);
  const url = r.domElement.toDataURL('image/png');
  r.setPixelRatio(pr); ST.snapDirty = true; ST.W = 0;
  return url;
}
export function carSnapshot(category, livery, opts = {}, w = 640, h = 300) {
  const key = [category, livery.primary, livery.secondary, livery.accent, livery.pattern, opts.number, opts.sponsor, opts.helmet, w, h, opts.angle].join('|');
  if (snapCache.has(key)) return snapCache.get(key);
  if (!stageAvailable()) return null;
  try {
    const r = snapSetup();
    const car = buildCar(category, livery, opts);
    snapScene.add(car);
    const a = opts.angle ?? -0.75, d = (category === 'rally' ? 5.4 : category === 'endurance' ? 6.2 : 6.6) * (w / h < 1.8 ? 1.2 : 1);
    snapCam.fov = 30; snapCam.aspect = w / h; snapCam.updateProjectionMatrix();
    snapCam.position.set(Math.cos(a) * d, d * 0.26, Math.sin(a) * d * -1); snapCam.lookAt(0, 0.45, 0);
    const url = snapRender(r, w, h);
    snapScene.remove(car); disposeCar(car);
    snapCache.set(key, url);
    return url;
  } catch (e) { console.warn('snapshot', e); return null; }
}
export function carImg(category, livery, opts = {}, w = 640, h = 300, fallback = '') {
  const url = carSnapshot(category, livery, opts, w, h);
  return url ? `<img src="${url}" alt="" style="width:100%;display:block;position:relative;z-index:1;filter:drop-shadow(0 14px 16px rgba(0,0,0,.45))">` : fallback;
}

// ---- 3D driver helmets ----
function helmetTex(h) {
  const W = 512, H = 256; const [c, g] = cv(W, H);
  const c1 = h?.c1 || '#ff2d2d', c2 = h?.c2 || '#ffffff', c3 = h?.c3 || '#111111', pat = h?.pattern ?? 0;
  g.fillStyle = c1; g.fillRect(0, 0, W, H);
  // u: 0.5 = visor (front), 0 / 1 = back of the head. v: 0 = crown.
  const side = (fn) => { for (const s of [0, 1]) { g.save(); if (s) { g.translate(W, 0); g.scale(-1, 1); } fn(); g.restore(); } };
  if (pat === 0) { g.fillStyle = c2; g.fillRect(0, H * 0.3, W, H * 0.13); g.fillStyle = c3; g.fillRect(0, H * 0.45, W, H * 0.025); }
  if (pat === 1) side(() => { g.fillStyle = c2; g.beginPath(); g.moveTo(0, H * 0.72); g.bezierCurveTo(W * 0.15, H * 0.5, W * 0.3, H * 0.34, W * 0.5, H * 0.24); g.lineTo(W * 0.5, H * 0.36); g.bezierCurveTo(W * 0.3, H * 0.46, W * 0.15, H * 0.66, 0, H * 0.9); g.fill(); g.fillStyle = c3; g.beginPath(); g.moveTo(0, H * 0.66); g.bezierCurveTo(W * 0.15, H * 0.45, W * 0.3, H * 0.3, W * 0.5, H * 0.2); g.lineTo(W * 0.5, H * 0.23); g.bezierCurveTo(W * 0.3, H * 0.33, W * 0.15, H * 0.49, 0, H * 0.7); g.fill(); });
  if (pat === 2) side(() => { g.fillStyle = c2; g.beginPath(); g.ellipse(W * 0.25, H * 0.5, W * 0.085, H * 0.2, 0, 0, 7); g.fill(); g.fillStyle = c3; g.beginPath(); g.ellipse(W * 0.25, H * 0.5, W * 0.045, H * 0.105, 0, 0, 7); g.fill(); });
  if (pat === 3) { g.fillStyle = c2; g.fillRect(0, 0, W, H * 0.2); side(() => { g.fillStyle = c2; g.fillRect(W * 0.17, 0, W * 0.05, H); g.fillStyle = c3; g.fillRect(W * 0.235, 0, W * 0.02, H); }); }
  if (pat === 4) { g.fillStyle = c2; g.fillRect(0, 0, W, H * 0.3); g.fillStyle = c3; g.fillRect(0, H * 0.3, W, H * 0.035); }
  if (pat === 5) side(() => { g.fillStyle = c2; g.beginPath(); g.moveTo(W * 0.06, H * 0.2); g.lineTo(W * 0.24, H * 0.5); g.lineTo(W * 0.06, H * 0.8); g.lineTo(W * 0.12, H * 0.5); g.fill(); g.fillStyle = c3; g.beginPath(); g.moveTo(W * 0.2, H * 0.2); g.lineTo(W * 0.38, H * 0.5); g.lineTo(W * 0.2, H * 0.8); g.lineTo(W * 0.26, H * 0.5); g.fill(); });
  // crown cap ring gives every design a finished look
  g.fillStyle = c3; g.fillRect(0, H * 0.085, W, H * 0.012);
  return tex(c);
}
function helmetBuild() {
  const grp = new THREE.Group();
  const shellM = new THREE.MeshPhysicalMaterial({ roughness: 0.28, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05 });
  const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32, 0, Math.PI * 2, 0, Math.PI * 0.8), shellM); shell.scale.set(1.16, 1.03, 1.0);
  const visorM = new THREE.MeshPhysicalMaterial({ color: 0x0a0c12, roughness: 0.06, metalness: 0.9, clearcoat: 1, clearcoatRoughness: 0.02, iridescence: 1, iridescenceIOR: 1.6 });
  const visor = new THREE.Mesh(new THREE.SphereGeometry(1.012, 40, 14, Math.PI - 1.12, 2.24, 1.13, 0.52), visorM); visor.scale.copy(shell.scale);
  const trimM = new THREE.MeshStandardMaterial({ color: 0x0b0c0f, roughness: 0.55 });
  const trim = new THREE.Mesh(new THREE.TorusGeometry(0.588, 0.06, 10, 40), trimM); trim.rotation.x = Math.PI / 2; trim.position.y = -0.83; trim.scale.set(1.16, 1, 1.0);
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.5, 0.16, 32), trimM); pad.position.y = -0.9; pad.scale.set(1.16, 1, 1);
  const vent = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.42), trimM); vent.position.set(1.1, -0.47, 0);
  grp.add(shell, visor, trim, pad, vent);
  grp.userData.shellM = shellM;
  return grp;
}
export function helmetSnapshot(h, size = 96) {
  const key = ['helm', h?.c1, h?.c2, h?.c3, h?.pattern, size].join('|');
  if (snapCache.has(key)) return snapCache.get(key);
  if (!stageAvailable()) return null;
  try {
    const r = snapSetup();
    if (!helmetRig) helmetRig = helmetBuild();
    const m = helmetRig.userData.shellM; m.map?.dispose(); m.map = helmetTex(h); m.needsUpdate = true;
    snapScene.add(helmetRig); snapScene.userData.ground.visible = false;
    snapCam.fov = 24; snapCam.aspect = 1; snapCam.updateProjectionMatrix();
    snapCam.position.set(4.4, 0.9, 3.6); snapCam.lookAt(0, -0.06, 0);
    const url = snapRender(r, size, size);
    snapScene.remove(helmetRig); snapScene.userData.ground.visible = true;
    snapCache.set(key, url);
    return url;
  } catch (e) { console.warn('helmet', e); return null; }
}
// <img> of the 3D helmet (same class as the SVG one, so layouts do not change)
export function helmetImg(h, size = 40, fallback = '') {
  const url = helmetSnapshot(h, size <= 48 ? 96 : 160);
  return url ? `<img class="helmet helmet-3d" src="${url}" width="${size}" height="${size}" alt="" draggable="false">` : fallback;
}
// drop-in replacement for art.js helmetSVG(): 3D render when WebGL is there, SVG otherwise
export function helmet3D(h, size = 40) { return helmetImg(h, size, helmetSVG(h, size)); }
