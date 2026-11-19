// Minigolf Baso — three.js view of a hole: the course built from the same world as the physics,
// moving pieces drawn from the physics shapes (what you see is what the ball hits), themed props
// around the course, the ball with its hat and trail, and the aiming helpers.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { LV, BALL_R, CUP_R, DIRS, isHaz, cornerY } from './holes.js';
import { THEMES } from './courses.js';

const rnd = (seed) => { let s = seed >>> 0 || 1; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9 >>> 0) / 4294967296); };
const col = (c) => new THREE.Color(c);

function geo(arr) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
  g.computeVertexNormals();
  return g;
}
function canvasTex(w, h, draw, repeat = false) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 4;
  return t;
}

let DOT = {};
function dotTex(ring) {
  return (DOT[ring ? 1 : 0] ||= canvasTex(32, 32, (g) => { const gr = g.createRadialGradient(16, 16, 0, 16, 16, 15); if (ring) { gr.addColorStop(0, 'rgba(255,255,255,0.1)'); gr.addColorStop(0.75, 'rgba(255,255,255,0.35)'); gr.addColorStop(0.9, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); } else { gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); } g.fillStyle = gr; g.fillRect(0, 0, 32, 32); }));
}
// ---------- ball skins
export function ballMaterial(id, color) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.32, metalness: 0 });
  const tex = (draw) => { m.map = canvasTex(128, 64, draw); };
  switch (id) {
    case 'arancio': m.color = col('#ff8a1f'); break;
    case 'menta': m.color = col('#4fe0b0'); break;
    case 'rossa': m.color = col('#ff5a5f'); break;
    case 'blu': m.color = col('#3fa7ff'); break;
    case 'gialla': m.color = col('#ffd23f'); break;
    case 'anguria': tex((g, w, h) => { g.fillStyle = '#8ce99a'; g.fillRect(0, 0, w, h); g.fillStyle = '#2f9e44'; for (let i = 0; i < 8; i++) g.fillRect(i * 16, 0, 9, h); }); break;
    case 'calcio': tex((g, w, h) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.fillStyle = '#111'; for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) { g.beginPath(); const x = i * 22 + (j % 2) * 11, y = 10 + j * 22; for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; g.lineTo(x + Math.cos(a) * 6, y + Math.sin(a) * 6); } g.fill(); } }); break;
    case 'pianeta': tex((g, w, h) => { const c = ['#f2d0a4', '#d9a066', '#b5651d', '#e8c39e', '#8a4b1a']; for (let y = 0; y < h; y += 4) { g.fillStyle = c[(y / 4 + (y > 30 ? 1 : 0)) % c.length]; g.fillRect(0, y, w, 4); } g.fillStyle = '#c0392b'; g.beginPath(); g.ellipse(80, 40, 10, 5, 0, 0, 7); g.fill(); }); break;
    case 'arcobaleno': tex((g, w, h) => { for (let x = 0; x < w; x++) { g.fillStyle = `hsl(${(x / w) * 360},90%,60%)`; g.fillRect(x, 0, 1, h); } }); break;
    case 'disco': m.metalness = 0.5; m.roughness = 0.2; m.flatShading = true; m.color = col('#dfe6f2'); m.emissive = col('#223'); break;
    case 'oro': m.metalness = 0.55; m.roughness = 0.25; m.color = col('#f5c542'); m.emissive = col('#5a3d00'); break;
    default: if (color) m.color = col(color);
  }
  return m;
}

// ---------- hats (sit on top of the ball, do not roll with it)
export function hatMesh(id) {
  const g = new THREE.Group();
  const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, ...o });
  const add = (geom, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geom, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  const r = BALL_R;
  switch (id) {
    case 'cappellino': add(new THREE.SphereGeometry(r * 0.75, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), M('#e63946'), 0, r * 0.7); add(new THREE.CylinderGeometry(r * 0.5, r * 0.5, 0.006, 16), M('#e63946'), 0, r * 0.72, -r * 0.55); break;
    case 'party': { const t = canvasTex(64, 64, (c) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#ffd23f' : '#ff3fa4'; c.fillRect(0, i * 8, 64, 8); } }); add(new THREE.ConeGeometry(r * 0.45, r * 1.5, 16), M('#fff', { map: t }), 0, r * 1.55); add(new THREE.SphereGeometry(r * 0.16, 8, 6), M('#5ff2ff'), 0, r * 2.35); break; }
    case 'cilindro': add(new THREE.CylinderGeometry(r * 0.75, r * 0.75, 0.008, 20), M('#1b1b22'), 0, r * 0.82); add(new THREE.CylinderGeometry(r * 0.48, r * 0.48, r * 1.1, 20), M('#1b1b22'), 0, r * 1.4); add(new THREE.CylinderGeometry(r * 0.49, r * 0.49, r * 0.2, 20), M('#c1121f'), 0, r * 1.0); break;
    case 'elica': { add(new THREE.SphereGeometry(r * 0.72, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), M('#3a86ff'), 0, r * 0.68); add(new THREE.CylinderGeometry(0.004, 0.004, r * 0.5, 6), M('#333'), 0, r * 1.5); const p = new THREE.Group(); p.position.y = r * 1.75; p.name = 'prop'; for (const [c, a] of [['#ffd23f', 0], ['#ff5a5f', Math.PI]]) { const b = new THREE.Mesh(new THREE.BoxGeometry(r * 1.1, 0.003, r * 0.22), M(c)); b.position.x = Math.cos(a) * r * 0.55; p.add(b); } g.add(p); break; }
    case 'vichingo': { add(new THREE.SphereGeometry(r * 0.78, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), M('#aab4c4', { metalness: 0.35, roughness: 0.4 }), 0, r * 0.62); for (const s of [-1, 1]) { const h = add(new THREE.ConeGeometry(r * 0.16, r * 0.8, 10), M('#f1e3c6'), s * r * 0.75, r * 1.05); h.rotation.z = -s * 0.9; } break; }
    case 'corona': { const mat = M('#f5c542', { metalness: 0.5, roughness: 0.3, emissive: '#5a3d00' }); add(new THREE.CylinderGeometry(r * 0.55, r * 0.5, r * 0.35, 20, 1, true), mat, 0, r * 1.0); for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; add(new THREE.ConeGeometry(r * 0.12, r * 0.35, 6), mat, Math.cos(a) * r * 0.52, r * 1.32, Math.sin(a) * r * 0.52); } add(new THREE.SphereGeometry(r * 0.1, 8, 6), M('#e63946', { emissive: '#600' }), 0, r * 1.05, r * 0.55); break; }
    case 'aureola': add(new THREE.TorusGeometry(r * 0.55, r * 0.09, 8, 28), new THREE.MeshBasicMaterial({ color: '#fff3a0' }), 0, r * 1.7).rotation.x = Math.PI / 2; break;
    default: break;
  }
  return g;
}

const TRAIL_N = 70;
function trailColor(id, i, out) {
  switch (id) {
    case 'bianca': return out.set('#ffffff');
    case 'neon': return out.set('#3fffd2');
    case 'fuoco': return out.setHSL(0.02 + (i / TRAIL_N) * 0.12, 1, 0.55);
    case 'bolle': return out.set('#8fd8ff');
    case 'stelle': return out.setHSL(0.13, 1, 0.6 + 0.3 * ((i * 7) % 3) / 3);
    case 'arcobaleno': return out.setHSL((i / TRAIL_N) % 1, 0.95, 0.6);
    default: return out.set('#ffffff');
  }
}

export class HoleView {
  constructor(renderer, sim, opts) {
    this.renderer = renderer; this.sim = sim; this.opts = opts;
    const th = this.th = THEMES[opts.theme] || THEMES.giardino;
    const hi = opts.tier === 'high', low = opts.tier === 'low';
    this.low = low;
    const scene = this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.03, 400);
    // sky
    scene.background = canvasTex(4, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, th.sky[0]); gr.addColorStop(1, th.sky[1]); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
    const night = opts.theme === 'lunapark' || opts.theme === 'spazio';
    scene.fog = new THREE.Fog(th.fog, 22, 70);
    scene.add(new THREE.HemisphereLight(night ? '#9fa8ff' : '#ffffff', night ? '#30205a' : '#6b8f4a', night ? 1.25 : 1.15));
    const sun = this.sun = new THREE.DirectionalLight(night ? '#d8d0ff' : '#fff4e0', 1.6 * th.sun);
    const W = sim.hole.W, Hh = sim.hole.H;
    this.center = new THREE.Vector3(W / 2, 0, Hh / 2);
    sun.position.set(W / 2 + 6, 12, Hh / 2 + 4); sun.target.position.copy(this.center);
    scene.add(sun, sun.target);
    if (!low) {
      renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      sun.castShadow = true; const S = Math.max(W, Hh) * 0.75 + 2;
      Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: 50 });
      sun.shadow.mapSize.set(hi ? 2048 : 1024, hi ? 2048 : 1024); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.01;
    } else renderer.shadowMap.enabled = false;
    // soft studio reflections for metals and shiny balls (not on the lowest tier)
    if (!low) { const pm = new THREE.PMREMGenerator(renderer); this.envTex = scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose(); scene.environmentIntensity = 0.3; }
    this.anim = [];
    this.buildCourse();
    this.buildProps();
    this.buildDecor(low ? 18 : hi ? 70 : 40);
    this.buildAim();
    this.balls = [];
  }
  mat(key) {
    const th = this.th;
    const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, side: THREE.DoubleSide, ...o });
    const felt = canvasTex(64, 64, (g, w, h) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); const r = rnd(7); for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.07})`; g.fillRect(r() * w, r() * h, 1.5, 1.5); } }, true);
    switch (key) {
      case 'felt': return M(th.felt, { map: felt });
      case 'felt2': return M(th.felt2, { map: felt });
      case 'ramp': return M(new THREE.Color(th.felt).offsetHSL(0, 0, 0.06), { map: felt });
      case 'grav': return M('#8e6cff', { emissive: '#3a1e9a', emissiveIntensity: 0.35, map: felt });
      case 'sand': return M('#f1d48a', { map: canvasTex(64, 64, (g, w, h) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); const r = rnd(3); for (let i = 0; i < 700; i++) { g.fillStyle = `rgba(120,80,20,${r() * 0.25})`; g.fillRect(r() * w, r() * h, 1, 1); } }, true) });
      case 'ice': return M('#cfefff', { roughness: 0.12, metalness: 0.05, emissive: '#7fc8ff', emissiveIntensity: 0.12 });
      case 'pool': return M('#16507a');
      case 'lavabed': return M('#3a0d05', { emissive: '#ff3a00', emissiveIntensity: 0.4 });
      case 'side': return M(th.side);
      case 'skirt': return M(th.skirt);
      case 'rail': return M(th.rail, { roughness: 0.55 });
      case 'railtop': return M(th.railtop, { roughness: 0.45 });
      case 'block': return M(this.opts.theme === 'spiaggia' ? '#ecd08f' : this.opts.theme === 'giardino' ? '#2e8b3e' : this.opts.theme === 'spazio' ? '#7c86b8' : this.opts.theme === 'lunapark' ? '#ffd23f' : '#9c98a8');
      case 'blockside': return M(this.opts.theme === 'spiaggia' ? '#d9b874' : this.opts.theme === 'giardino' ? '#256f32' : this.opts.theme === 'spazio' ? '#5a6390' : this.opts.theme === 'lunapark' ? '#ff9f1c' : '#7d7989');
      case 'mill': return M('#f7efe2');
      case 'loop': return M('#ff3fa4', { roughness: 0.4, transparent: true, opacity: 0.92 });
      case 'looprail': return M('#ffd23f', { roughness: 0.4 });
      default: return M('#ff00ff');
    }
  }
  buildCourse() {
    const w = this.sim.w;
    for (const [k, arr] of Object.entries(w.parts)) {
      if (!arr.length) continue;
      const m = new THREE.Mesh(geo(arr), this.mat(k));
      m.receiveShadow = true; m.castShadow = !/felt|ramp|sand|ice|pool|lavabed|grav|skirt/.test(k);
      this.scene.add(m);
    }
    const th = this.th, hole = this.sim.hole, scene = this.scene;
    // ground around (the space course floats)
    if (this.opts.theme !== 'spazio') {
      const gtex = canvasTex(128, 128, (g, W, H) => { g.fillStyle = th.ground; g.fillRect(0, 0, W, H); const r = rnd(11); for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${r() * 0.08})`; g.fillRect(r() * W, r() * H, 2, 2); } }, true);
      gtex.repeat.set(30, 30);
      const gr = new THREE.Mesh(new THREE.PlaneGeometry(220, 220), new THREE.MeshStandardMaterial({ color: '#fff', map: gtex, roughness: 1 }));
      gr.rotation.x = -Math.PI / 2; gr.position.set(hole.W / 2, w.baseY + 0.01, hole.H / 2); gr.receiveShadow = true; scene.add(gr);
    }
    // water and lava surfaces
    const wtex = canvasTex(128, 128, (g, W, H) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H); g.strokeStyle = 'rgba(255,255,255,.9)'; g.fillStyle = 'rgba(0,40,80,.18)'; const r = rnd(5); for (let i = 0; i < 40; i++) { const x = r() * W, y = r() * H, w = 10 + r() * 24; g.fillRect(x, y, w, 2); } g.globalAlpha = 0.5; for (let i = 0; i < 18; i++) { g.beginPath(); const x = r() * W, y = r() * H; g.arc(x, y, 4 + r() * 10, 0.2, 2.5); g.stroke(); } }, true);
    const ltex = canvasTex(128, 128, (g, W, H) => { g.fillStyle = '#ffb347'; g.fillRect(0, 0, W, H); const r = rnd(9); for (let i = 0; i < 26; i++) { g.fillStyle = r() < 0.5 ? '#ff4500' : '#c1121f'; g.beginPath(); g.ellipse(r() * W, r() * H, 8 + r() * 18, 5 + r() * 10, r() * 3, 0, 7); g.fill(); } g.strokeStyle = '#3a0d05'; g.lineWidth = 2; for (let i = 0; i < 12; i++) { g.beginPath(); let x = r() * W, y = r() * H; g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (r() - 0.5) * 30; y += (r() - 0.5) * 30; g.lineTo(x, y); } g.stroke(); } }, true);
    const wm = new THREE.MeshStandardMaterial({ color: th.water, map: wtex, transparent: true, opacity: 0.82, roughness: 0.1, metalness: 0.1, emissive: th.water, emissiveIntensity: 0.15 });
    const lm = new THREE.MeshStandardMaterial({ color: '#ffffff', map: ltex, emissive: '#ff3a00', emissiveMap: ltex, emissiveIntensity: 0.9, roughness: 0.6 });
    this.hazTex = [wtex, ltex];
    for (const c of hole.cells) {
      if (!isHaz(c.t)) continue;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), c.t === 'w' ? wm : lm);
      m.rotation.x = -Math.PI / 2; m.position.set(c.c + 0.5, c.lv * LV - 0.035, c.r + 0.5); scene.add(m);
    }
    this.lavaMat = lm; this.waterMat = wm;
    // cup tile: floor with the hole, the cup, the flag
    const cup = hole.cup;
    if (cup) {
      const y = cornerY(cup)[0], cx = cup.c + 0.5, cz = cup.r + 0.5;
      const ring = [];
      const N = 40;
      const sq = (a) => { const c = Math.cos(a), s = Math.sin(a), k = 0.5 / Math.max(Math.abs(c), Math.abs(s)); return [c * k, s * k]; };
      for (let i = 0; i < N; i++) {
        const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2;
        const p0 = [Math.cos(a0) * CUP_R, Math.sin(a0) * CUP_R], p1 = [Math.cos(a1) * CUP_R, Math.sin(a1) * CUP_R];
        const q0 = sq(a0), q1 = sq(a1);
        ring.push(cx + p0[0], y, cz + p0[1], cx + q0[0], y, cz + q0[1], cx + q1[0], y, cz + q1[1], cx + p0[0], y, cz + p0[1], cx + q1[0], y, cz + q1[1], cx + p1[0], y, cz + p1[1]);
      }
      const fm = new THREE.Mesh(geo(ring), this.mat((cup.c + cup.r) % 2 ? 'felt2' : 'felt')); fm.receiveShadow = true; scene.add(fm);
      const liner = new THREE.Mesh(new THREE.CylinderGeometry(CUP_R, CUP_R, 0.12, 32, 1, true), new THREE.MeshStandardMaterial({ color: '#f2f2f2', side: THREE.BackSide, roughness: 0.6 }));
      liner.position.set(cx, y - 0.06, cz); scene.add(liner);
      const bottom = new THREE.Mesh(new THREE.CircleGeometry(CUP_R, 32), new THREE.MeshStandardMaterial({ color: '#202020' }));
      bottom.rotation.x = -Math.PI / 2; bottom.position.set(cx, y - 0.115, cz); scene.add(bottom);
      const flag = this.flag = new THREE.Group(); flag.position.set(cx, y, cz);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.75, 8), new THREE.MeshStandardMaterial({ color: '#f5f5f5', metalness: 0.3, roughness: 0.4 }));
      pole.position.y = 0.375 - 0.1; pole.castShadow = true; flag.add(pole);
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.14, 8, 2), new THREE.MeshStandardMaterial({ color: th.accent === '#5ff2ff' ? '#ff5f9e' : '#ff3b30', side: THREE.DoubleSide, emissive: '#400', emissiveIntensity: 0.2 }));
      cloth.position.set(0.11, 0.57, 0); cloth.castShadow = true; flag.add(cloth); this.cloth = cloth; this.clothBase = cloth.geometry.attributes.position.array.slice();
      scene.add(flag);
      // a soft glow ring helps to find the cup from far away
      const glow = this.cupGlow = new THREE.Mesh(new THREE.RingGeometry(CUP_R * 1.05, CUP_R * 1.6, 40), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, depthWrite: false }));
      glow.rotation.x = -Math.PI / 2; glow.position.set(cx, y + 0.002, cz); scene.add(glow);
    }
    // tee mat
    const tee = hole.tee;
    if (tee) { const m = new THREE.Mesh(new THREE.CircleGeometry(0.16, 24), new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.35 })); m.rotation.x = -Math.PI / 2; m.position.set(tee.c + 0.5, cornerY(tee)[0] + 0.002, tee.r + 0.5); scene.add(m); }
  }
  buildProps() {
    const w = this.sim.w, scene = this.scene;
    // conveyor belts: scrolling chevrons
    const belt = canvasTex(64, 64, (g, W, H) => { g.fillStyle = '#2b2f3a'; g.fillRect(0, 0, W, H); g.strokeStyle = '#ffd23f'; g.lineWidth = 7; for (let i = 0; i < 2; i++) { g.beginPath(); g.moveTo(10, 30 + i * 32); g.lineTo(32, 10 + i * 32); g.lineTo(54, 30 + i * 32); g.stroke(); } }, true);
    this.beltTex = [];
    for (const b of w.belts) {
      const t = belt.clone(); t.needsUpdate = true; t.repeat.set(1, 1);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.98, 0.98), new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 }));
      m.rotation.x = -Math.PI / 2; m.rotation.z = -b.dir * Math.PI / 2; m.position.set(b.cell.c + 0.5, b.y + 0.003, b.cell.r + 0.5); m.receiveShadow = true;
      scene.add(m); this.beltTex.push(t);
    }
    // bumpers
    this.bumperMeshes = new Map();
    for (const b of w.bumpers) {
      const g = new THREE.Group(); g.position.set(b.x, b.y, b.z);
      const body = new THREE.Mesh(new THREE.CylinderGeometry(b.r, b.r * 1.05, b.h, 24), new THREE.MeshStandardMaterial({ color: '#ff3fa4', roughness: 0.35, emissive: '#5a0030', emissiveIntensity: 0.3 }));
      body.position.y = b.h / 2; body.castShadow = true; g.add(body);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(b.r * 0.8, b.r, 0.03, 24), new THREE.MeshStandardMaterial({ color: '#ffd23f', emissive: '#806000', emissiveIntensity: 0.4 }));
      cap.position.y = b.h + 0.015; g.add(cap);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(b.r * 1.02, 0.012, 8, 28), new THREE.MeshStandardMaterial({ color: '#ffffff' }));
      ring.rotation.x = Math.PI / 2; ring.position.y = b.h * 0.5; g.add(ring);
      scene.add(g); this.bumperMeshes.set(b, { g, hit: 0, cap });
    }
    // teleporter pads
    this.padMeshes = [];
    for (const p of w.pads) {
      const entry = p.kind === 'T' || p.kind === 'U';
      const c = p.kind.toLowerCase() === 't' ? '#5ff2ff' : '#ff8a1f';
      const g = new THREE.Group(); g.position.set(p.x, p.y + 0.004, p.z);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.3, 32), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: entry ? 0.5 : 0.25 }));
      disc.rotation.x = -Math.PI / 2; g.add(disc);
      for (let i = 0; i < (entry ? 3 : 1); i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.2 + i * 0.05, 0.012, 6, 32), new THREE.MeshBasicMaterial({ color: c })); r.rotation.x = Math.PI / 2; r.position.y = 0.01 + i * 0.03; g.add(r); }
      if (!entry) { const ar = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.12, 3), new THREE.MeshBasicMaterial({ color: c })); ar.rotation.x = -Math.PI / 2; ar.position.set(0, 0.02, -0.16); g.add(ar); const d = exitDirOf(this.sim, p); g.rotation.y = Math.atan2(-d[0], -d[1]); }
      scene.add(g); this.padMeshes.push({ g, entry });
    }
    // windmills: roof and decoration on the housing; sails and gates are drawn from the physics
    for (const d of w.decor) {
      if (d.type !== 'mill') continue;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.48, 0.42, 4), new THREE.MeshStandardMaterial({ color: this.opts.theme === 'lunapark' ? '#ff3fa4' : this.opts.theme === 'castello' ? '#3d5a80' : '#c1121f', roughness: 0.6 }));
      roof.position.set(d.cell.c + 0.5, d.y + 0.79, d.cell.r + 0.5); roof.rotation.y = Math.PI / 4; roof.castShadow = true; this.scene.add(roof);
      const hub = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), new THREE.MeshStandardMaterial({ color: '#333' })); hub.position.set(...d.hub); this.scene.add(hub);
    }
    this.kinMeshes = this.sim.w.kin.map((k) => {
      const geom = new THREE.BoxGeometry(k.half[0] * 2, k.half[1] * 2, k.half[2] * 2);
      const m = new THREE.Mesh(geom, k.type === 'blade'
        ? new THREE.MeshStandardMaterial({ color: '#fff', map: canvasTex(32, 128, (g, W, H) => { g.fillStyle = '#f7efe2'; g.fillRect(0, 0, W, H); g.strokeStyle = '#8a5a2b'; g.lineWidth = 3; for (let y = 0; y < H; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); } g.strokeRect(1, 1, W - 2, H - 2); }), roughness: 0.7 })
        : new THREE.MeshStandardMaterial({ color: this.opts.theme === 'castello' ? '#8a8fa0' : '#ff8a1f', map: this.opts.theme === 'castello' ? canvasTex(64, 32, (g, W, H) => { g.fillStyle = '#6d717e'; g.fillRect(0, 0, W, H); g.fillStyle = '#2d2f36'; for (let x = 4; x < W; x += 12) g.fillRect(x, 0, 4, H); for (let y = 6; y < H; y += 12) g.fillRect(0, y, W, 3); }) : null, metalness: this.opts.theme === 'castello' ? 0.3 : 0.1, roughness: 0.45, emissive: this.opts.theme === 'spazio' ? '#ff5f9e' : '#000', emissiveIntensity: 0.25 }));
      m.castShadow = true; this.scene.add(m); return m;
    });
  }
  buildDecor(n) {
    const hole = this.sim.hole, th = this.opts.theme, r = rnd(hole.W * 131 + hole.H * 7 + th.length);
    const scene = this.scene, base = this.sim.w.baseY;
    const occupied = (x, z) => { const c = hole.at(Math.floor(x), Math.floor(z)); return c && c.t !== '.'; };
    const near = (x, z, m) => { for (let dx = -m; dx <= m; dx += 0.5) for (let dz = -m; dz <= m; dz += 0.5) if (occupied(x + dx, z + dz)) return true; return false; };
    const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, ...o });
    const spots = [];
    for (let i = 0; i < n * 6 && spots.length < n; i++) {
      const x = -6 + r() * (hole.W + 12), z = -7 + r() * (hole.H + 12);
      if (near(x, z, 0.8)) continue;
      spots.push([x, z]);
    }
    const g = new THREE.Group(); scene.add(g);
    const add = (geom, mat, x, y, z, s = 1) => { const m = new THREE.Mesh(geom, mat); m.position.set(x, y, z); m.scale.setScalar(s); m.castShadow = !this.low; g.add(m); return m; };
    const shared = {};
    const S = (k, f) => (shared[k] ||= f());
    for (const [x, z] of spots) {
      const k = r(), s = 0.7 + r() * 0.8, y = base;
      if (th === 'giardino') {
        if (k < 0.55) { add(S('trunk', () => new THREE.CylinderGeometry(0.06, 0.09, 0.8, 6)), S('wood', () => M('#7a4a24')), x, y + 0.4 * s, z, s); add(S('crown', () => new THREE.IcosahedronGeometry(0.45, 0)), S('leaf' + (k < 0.3 ? 1 : 2), () => M(k < 0.3 ? '#2f9e44' : '#51cf66', { flatShading: true })), x, y + 1.0 * s, z, s); }
        else if (k < 0.8) add(S('bush', () => new THREE.IcosahedronGeometry(0.28, 0)), S('bushm', () => M('#40c057', { flatShading: true })), x, y + 0.18, z, s);
        else { const c = ['#ff6b6b', '#ffd43b', '#f783ac', '#ffffff'][Math.floor(r() * 4)]; add(S('stem', () => new THREE.CylinderGeometry(0.01, 0.01, 0.25, 4)), S('stemm', () => M('#2f9e44')), x, y + 0.12, z); add(S('flw', () => new THREE.SphereGeometry(0.06, 8, 6)), S('f' + c, () => M(c)), x, y + 0.26, z); }
      } else if (th === 'spiaggia') {
        if (k < 0.45) { const tr = add(S('ptrunk', () => new THREE.CylinderGeometry(0.05, 0.08, 1.4, 6)), S('pw', () => M('#a0703c')), x, y + 0.7 * s, z, s); tr.rotation.z = (r() - 0.5) * 0.3; for (let i = 0; i < 6; i++) { const l = add(S('pleaf', () => new THREE.BoxGeometry(0.7, 0.02, 0.16)), S('plm', () => M('#2b9348')), x + Math.cos(i) * 0.3 * s, y + 1.4 * s, z + Math.sin(i) * 0.3 * s, s); l.rotation.y = -i; l.rotation.z = -0.4; } }
        else if (k < 0.75) { add(S('upole', () => new THREE.CylinderGeometry(0.015, 0.015, 0.9, 6)), S('upm', () => M('#eee')), x, y + 0.45, z); add(S('ucan', () => new THREE.ConeGeometry(0.5, 0.25, 8)), S('uc' + (k < 0.6 ? 1 : 2), () => M(k < 0.6 ? '#ff6b6b' : '#4dabf7', { flatShading: true })), x, y + 0.92, z); }
        else add(S('shell', () => new THREE.SphereGeometry(0.12, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2)), S('shm', () => M('#ffc9c9')), x, y, z, s);
      } else if (th === 'castello') {
        if (k < 0.4) { add(S('tower', () => new THREE.CylinderGeometry(0.4, 0.45, 1.8, 10)), S('stone', () => M('#8d8a99', { flatShading: true })), x, y + 0.9 * s, z, s); add(S('troof', () => new THREE.ConeGeometry(0.5, 0.7, 10)), S('troofm', () => M('#3d5a80')), x, y + 2.15 * s, z, s); }
        else if (k < 0.7) add(S('rock', () => new THREE.DodecahedronGeometry(0.35, 0)), S('rockm', () => M('#6c6878', { flatShading: true })), x, y + 0.15, z, s);
        else { add(S('fpole', () => new THREE.CylinderGeometry(0.015, 0.015, 1.4, 6)), S('fpm', () => M('#ddd')), x, y + 0.7, z); add(S('banner', () => new THREE.BoxGeometry(0.02, 0.4, 0.3)), S('bn', () => M('#c23a4a')), x, y + 1.15, z + 0.15); }
      } else if (th === 'lunapark') {
        if (k < 0.35) { add(S('tent', () => new THREE.ConeGeometry(0.8, 1.2, 8)), S('tent' + (k < 0.18 ? 1 : 2), () => M('#fff', { map: canvasTex(64, 16, (c) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#ffffff' : (k < 0.18 ? '#ff3fa4' : '#3fa7ff'); c.fillRect(i * 8, 0, 8, 16); } }) })), x, y + 0.6 * s, z, s); }
        else if (k < 0.7) { const c = `hsl(${Math.floor(r() * 360)},90%,60%)`; add(S('bstr', () => new THREE.CylinderGeometry(0.004, 0.004, 1.2, 3)), S('bsm', () => M('#ddd')), x, y + 0.6, z); add(S('balloon', () => new THREE.SphereGeometry(0.16, 12, 10)), M(c, { emissive: c, emissiveIntensity: 0.25, roughness: 0.3 }), x, y + 1.3, z); }
        else add(S('lamp', () => new THREE.SphereGeometry(0.09, 10, 8)), S('lampm', () => new THREE.MeshBasicMaterial({ color: '#ffd23f' })), x, y + 0.6 + r() * 1.2, z);
      } else if (th === 'spazio') {
        if (k < 0.3) add(S('ast', () => new THREE.DodecahedronGeometry(0.4, 0)), S('astm', () => M('#6d6a80', { flatShading: true })), x, base - 0.5 + r() * 2.5, z, s * 1.4);
        else if (k < 0.45) { const c = ['#ff9f43', '#5ff2ff', '#ff5f9e', '#a29bfe'][Math.floor(r() * 4)]; const pl = add(S('planet', () => new THREE.SphereGeometry(1, 20, 14)), M(c, { emissive: c, emissiveIntensity: 0.15 }), x * 2.2 - hole.W * 0.6, base + 2 + r() * 4, z * 2.2 - hole.H * 0.6, 0.6 + r() * 1.3); if (r() < 0.5) { const ring = new THREE.Mesh(S('pring', () => new THREE.RingGeometry(1.3, 1.8, 32)), S('pringm', () => new THREE.MeshBasicMaterial({ color: '#ffe8a3', side: THREE.DoubleSide, transparent: true, opacity: 0.6 }))); ring.rotation.x = 1.2; pl.add(ring); } }
      }
    }
    if (th === 'spazio' || th === 'lunapark') {
      const N = this.low ? 300 : 900, pos = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) { const a = r() * Math.PI * 2, b = Math.acos(r() * 2 - 1), R = 80; pos.set([this.center.x + Math.cos(a) * Math.sin(b) * R, Math.abs(Math.cos(b)) * R * (th === 'lunapark' ? 1 : 0.9) - (th === 'spazio' ? 20 : 0), this.center.z + Math.sin(a) * Math.sin(b) * R], i * 3); }
      const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      scene.add(new THREE.Points(gg, new THREE.PointsMaterial({ color: '#ffffff', size: 0.35, sizeAttenuation: true, fog: false })));
      scene.fog.near = 40; scene.fog.far = 140;
    }
    if (th === 'lunapark') { // a ferris wheel on the horizon
      const fw = new THREE.Group(); fw.position.set(this.center.x + 9, base + 4.5, this.center.z - hole.H / 2 - 8);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(4, 0.08, 6, 48), new THREE.MeshBasicMaterial({ color: '#ff3fa4' })); fw.add(rim);
      for (let i = 0; i < 12; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.05, 8, 0.05), new THREE.MeshBasicMaterial({ color: '#ffd23f' })); s.rotation.z = (i / 12) * Math.PI; fw.add(s); const cab = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), new THREE.MeshBasicMaterial({ color: `hsl(${i * 30},90%,60%)` })); cab.position.set(Math.cos(i / 12 * Math.PI * 2) * 4, Math.sin(i / 12 * Math.PI * 2) * 4, 0); fw.add(cab); }
      scene.add(fw); this.anim.push((t) => { fw.rotation.z = t * 0.12; });
    }
  }
  buildAim() {
    const scene = this.scene;
    const arrow = this.arrow = new THREE.Group();
    const am = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthTest: false });
    const shaft = new THREE.Mesh(new THREE.PlaneGeometry(0.035, 1), am); shaft.rotation.x = -Math.PI / 2; shaft.position.z = -0.5; arrow.add(shaft);
    const head = new THREE.Mesh(new THREE.CircleGeometry(0.07, 3), am); head.rotation.x = -Math.PI / 2; head.rotation.z = Math.PI / 2; head.position.z = -1.02; arrow.add(head);
    this.shaft = shaft; this.head = head; this.arrowMat = am;
    arrow.renderOrder = 10; arrow.visible = false; scene.add(arrow);
    const N = 26;
    this.dots = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3)), new THREE.PointsMaterial({ color: '#ffffff', size: 0.045, transparent: true, opacity: 0.95, depthTest: false }));
    this.dots.renderOrder = 11; this.dots.visible = false; this.dots.frustumCulled = false; scene.add(this.dots);
    // ring under the active ball
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.085, 0.105, 32), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2; scene.add(this.ring);
  }
  addBall({ skin, color, hat, trail }) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 28, 18), ballMaterial(skin, color));
    m.castShadow = true;
    const g = new THREE.Group(); g.add(m);
    const h = hatMesh(hat || 'nessuno'); g.add(h);
    this.scene.add(g);
    let tr = null;
    if (trail && trail !== 'nessuna') {
      const pos = new Float32Array(TRAIL_N * 3), colr = new Float32Array(TRAIL_N * 3);
      const geom = new THREE.BufferGeometry(); geom.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geom.setAttribute('color', new THREE.BufferAttribute(colr, 3));
      const pts = new THREE.Points(geom, new THREE.PointsMaterial({ size: trail === 'bolle' ? 0.06 : 0.055, map: dotTex(trail === 'bolle'), vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false, alphaTest: 0.05, blending: trail === 'neon' || trail === 'fuoco' ? THREE.AdditiveBlending : THREE.NormalBlending }));
      pts.frustumCulled = false; this.scene.add(pts);
      tr = { pts, hist: [], id: trail };
    }
    const b = { g, m, hat: h, tr, q: new THREE.Quaternion(), last: null };
    this.balls.push(b);
    return b;
  }
  placeBall(b, p, { roll = true, ghost = false, visible = true } = {}) {
    b.g.visible = visible;
    if (!visible) return;
    if (b.last && roll) {
      const dx = p[0] - b.last[0], dz = p[2] - b.last[2], d = Math.hypot(dx, dz);
      if (d > 1e-5 && d < 1) { const ax = new THREE.Vector3(-dz / d, 0, dx / d); const q = new THREE.Quaternion().setFromAxisAngle(ax, d / BALL_R); b.m.quaternion.premultiply(q); }
    }
    b.last = [...p];
    b.g.position.set(p[0], p[1], p[2]);
    b.m.material.transparent = ghost; b.m.material.opacity = ghost ? 0.45 : 1;
    b.hat.visible = !ghost;
    if (b.tr) {
      const H = b.tr.hist;
      if (!ghost) { H.push([p[0], p[1], p[2]]); if (H.length > TRAIL_N) H.shift(); }
      const pos = b.tr.pts.geometry.attributes.position, cl = b.tr.pts.geometry.attributes.color, c = new THREE.Color();
      for (let i = 0; i < TRAIL_N; i++) {
        const h = H[Math.max(0, H.length - 1 - i)] || p;
        const jit = b.tr.id === 'stelle' || b.tr.id === 'bolle' ? 0.012 * Math.sin(i * 12.9 + H.length) : 0;
        pos.setXYZ(i, h[0] + jit, h[1] + jit * 0.5, h[2] - jit);
        trailColor(b.tr.id, i, c); const f = 1 - i / TRAIL_N; cl.setXYZ(i, c.r * f, c.g * f, c.b * f);
      }
      pos.needsUpdate = true; cl.needsUpdate = true;
      b.tr.pts.visible = !ghost;
    }
  }
  clearTrail(b) { if (b.tr) b.tr.hist.length = 0; }
  setAim(on, p, angle, power, preview) {
    this.arrow.visible = on; this.dots.visible = on && !!preview;
    if (!on) return;
    this.arrow.position.set(p[0], p[1] - BALL_R + 0.012, p[2]);
    this.arrow.rotation.y = -angle;
    const L = 0.25 + power * 0.9;
    this.shaft.scale.y = L; this.shaft.position.z = -0.1 - L / 2; this.head.position.z = -0.1 - L - 0.03;
    this.arrowMat.color.setHSL(0.33 - power * 0.33, 0.95, 0.58);
    if (preview) {
      const a = this.dots.geometry.attributes.position;
      for (let i = 0; i < a.count; i++) { const q = preview[Math.min(i, preview.length - 1)] || p; a.setXYZ(i, q[0], q[1], q[2]); }
      a.needsUpdate = true;
    }
  }
  update(t, dt) {
    // moving parts follow the physics clock exactly
    const boxes = this.sim.kinBoxes(this.sim.t);
    const m4 = new THREE.Matrix4();
    boxes.forEach((b, i) => {
      const m = this.kinMeshes[i]; if (!m) return;
      m4.makeBasis(new THREE.Vector3(...b.u[0]), new THREE.Vector3(...b.u[1]), new THREE.Vector3(...b.u[2]));
      m.quaternion.setFromRotationMatrix(m4); m.position.set(...b.c);
    });
    for (const tx of this.beltTex) tx.offset.y = (tx.offset.y + dt * 1.5) % 1;
    for (const [, v] of this.bumperMeshes) { v.hit = Math.max(0, v.hit - dt * 4); const s = 1 + v.hit * 0.25; v.g.scale.set(s, 1, s); v.cap.material.emissiveIntensity = 0.4 + v.hit * 2; }
    for (const p of this.padMeshes) p.g.children.forEach((c, i) => { if (c.geometry.type === 'TorusGeometry') c.position.y = 0.01 + ((t * 0.35 + i / 3) % 1) * 0.12 * (p.entry ? 1 : 0.2); });
    if (this.lavaMat) this.lavaMat.emissiveIntensity = 0.8 + Math.sin(t * 2) * 0.2;
    if (this.hazTex) { this.hazTex[0].offset.set(t * 0.03, t * 0.05); this.hazTex[1].offset.set(Math.sin(t * 0.3) * 0.05, t * 0.02); }
    if (this.cloth) {
      const a = this.cloth.geometry.attributes.position, b0 = this.clothBase;
      for (let i = 0; i < a.count; i++) { const x = b0[i * 3]; a.setZ(i, Math.sin(t * 4 + x * 25) * 0.02 * (x + 0.11) / 0.22); }
      a.needsUpdate = true; this.cloth.geometry.computeVertexNormals();
    }
    if (this.cupGlow) this.cupGlow.material.opacity = 0.25 + 0.15 * Math.sin(t * 3);
    for (const b of this.balls) { const p = b.hat.getObjectByName('prop'); if (p) p.rotation.y += dt * 14; }
    for (const f of this.anim) f(t);
  }
  bump(b) { const v = this.bumperMeshes.get(b); if (v) v.hit = 1; }
  dispose() {
    this.scene.traverse((o) => { o.geometry?.dispose?.(); const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []; for (const m of ms) { if (m.map && m.map !== DOT[0] && m.map !== DOT[1]) m.map.dispose(); m.dispose?.(); } });
    this.scene.background?.dispose?.(); this.envTex?.dispose();
  }
}
function exitDirOf(sim, pad) {
  for (const [dx, dz] of [[0, -1], [1, 0], [-1, 0], [0, 1]]) { const n = sim.hole.at(pad.cell.c + dx, pad.cell.r + dz); if (n && n.t !== '.' && n.t !== 'X' && !isHaz(n.t)) return [dx, dz]; }
  return [0, -1];
}
export { DIRS };
