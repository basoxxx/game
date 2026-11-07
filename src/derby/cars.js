// Demolition "bangers": old saloons, muscle cars, pick-ups and hatchbacks with rusty, dirty paint.
// Bodies are unique (non-shared) geometries so they can be dented vertex by vertex; bumpers,
// bonnet, boot lid and spoiler are separate meshes that can be torn off and thrown into the world.
// The visible body sits in a "shell" group that leans with weight transfer; wheels stay on the root.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mergeStatic } from './merge.js';

// Handling fields (all optional for the menu): steer = max lock (rad), steerRate (rad/s),
// drive = 'rwd'|'fwd'|'awd', gears, engine (synth preset), comY (centre of mass height), roll (visual lean),
// rearGrip / frontGrip (balance), powerOver (rear grip lost under throttle), hbYaw (handbrake rotation help).
export const BANGERS = [
  { id: 'berlina', name: 'Torpedo 78', desc: 'Berlina anni ’70: pesante, robusta, prevedibile.', mass: 1450, power: 1.0, top: 1.0, armor: 1.25, grip: 1.0, color: '#7a1f1f',
    cls: 'Berlina · trazione posteriore', drive: 'rwd', steer: 0.58, steerRate: 3.0, gears: 4, engine: 'endurance', comY: -0.28, roll: 1.0, frontGrip: 1.0, rearGrip: 1.0, powerOver: 0.04, hbYaw: 1.0 },
  { id: 'muscle', name: 'Bisonte V8', desc: 'Muscle car: tanta potenza, coda nervosa.', mass: 1500, power: 1.28, top: 1.12, armor: 1.0, grip: 0.92, color: '#1f3f7a',
    cls: 'Muscle · V8 posteriore', drive: 'rwd', steer: 0.56, steerRate: 3.2, gears: 4, engine: 'endurance', comY: -0.3, roll: 1.1, frontGrip: 1.04, rearGrip: 0.93, powerOver: 0.12, hbYaw: 1.2 },
  { id: 'pickup', name: 'Mulo 4x4', desc: 'Pick-up a trazione integrale: un ariete.', mass: 1750, power: 1.08, top: 0.92, armor: 1.5, grip: 1.08, awd: true, color: '#5b6b2b',
    cls: 'Pick-up · integrale', drive: 'awd', steer: 0.52, steerRate: 2.6, gears: 5, engine: 'endurance', comY: -0.18, roll: 1.45, frontGrip: 0.97, rearGrip: 1.05, powerOver: 0.05, hbYaw: 0.8 },
  { id: 'utilitaria', name: 'Grillo GT', desc: 'Utilitaria leggera e agile, ma fragile.', mass: 1050, power: 0.9, top: 0.98, armor: 0.75, grip: 1.12, color: '#c99a12',
    cls: 'Utilitaria · trazione anteriore', drive: 'fwd', steer: 0.66, steerRate: 4.0, gears: 5, engine: 'rally', comY: -0.26, roll: 0.9, frontGrip: 1.0, rearGrip: 0.97, powerOver: 0, hbYaw: 1.35 },
];
export const AI_COLORS = ['#9b2c2c', '#2c5d9b', '#3d7a3a', '#b8761c', '#6b3d8f', '#2b8a8a', '#8f8f8f', '#c7c2b0', '#3a3a3a', '#a33b6b', '#47602b'];

// ---------- materials ----------
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.userData.ctx = g; return t; }
function rand(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const PRIMERS = ['#8a8d90', '#6d6f66', '#9a9283', '#4f5a62'];
const SPONSORS = ['RICAMBI RUGGINE', 'OLIO GRASSINI', 'GOMME TONDE', 'BIRRA SCHIUMA', 'PNEUS POLPO', 'FERRAMENTA FULMINE', 'AUTODEMOLIZIONI ZANZA', 'CARROZZERIA BOTTA'];

// Dirt build-up shader patch: mud rises from the sills as uDirt grows (0..1). Uses object-space height.
function dirtPatch(mat, uni) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uDirt = uni;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vOP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvOP = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vOP; uniform float uDirt;
      float dh(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }
      float dn(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(mix(dh(i),dh(i+vec3(1,0,0)),f.x),mix(dh(i+vec3(0,1,0)),dh(i+vec3(1,1,0)),f.x),f.y),mix(mix(dh(i+vec3(0,0,1)),dh(i+vec3(1,0,1)),f.x),mix(dh(i+vec3(0,1,1)),dh(i+vec3(1,1,1)),f.x),f.y),f.z); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        float dN = dn(vOP * 3.1) * 0.6 + dn(vOP * 9.0) * 0.4;
        float dLine = 0.35 + uDirt * 1.25 + dN * 0.35;
        float dAmt = smoothstep(dLine, dLine - 0.35, vOP.y) * clamp(uDirt * 1.6, 0.0, 1.0);
        dAmt = max(dAmt, uDirt * 0.35 * smoothstep(0.55, 0.85, dN));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.30, 0.235, 0.16) * (0.75 + dN * 0.4), clamp(dAmt, 0.0, 0.92));`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 1.0, clamp(dAmt, 0.0, 1.0));');
  };
  mat.customProgramCacheKey = () => 'dirt';
  return mat;
}

// u along the car (rear->front), v around (0 right side, .25 top, .5 left, .75 bottom)
function bangerPaint(color, number, seed) {
  const R = rand(seed * 977 + 13);
  return canvasTex(1024, 512, (g, W, H) => {
    g.fillStyle = color; g.fillRect(0, 0, W, H);
    // faded / sun-bleached top
    const gr = g.createLinearGradient(0, H * 0.5, 0, H * 0.75); gr.addColorStop(0, 'rgba(255,255,255,0.08)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, H * 0.5, W, H * 0.25);
    // replacement panels from the scrapyard: primer grey or another car's colour (door / wing)
    for (let i = 0; i < 1 + Math.floor(R() * 2); i++) {
      const side = R() < 0.5 ? 0 : 0.5, u0 = [0.12, 0.38, 0.66][Math.floor(R() * 3)], u1 = u0 + 0.2;
      g.fillStyle = R() < 0.65 ? PRIMERS[Math.floor(R() * PRIMERS.length)] : `hsl(${Math.floor(R() * 360)},45%,${30 + R() * 20}%)`;
      g.fillRect(u0 * W, H - (side + 0.2) * H, (u1 - u0) * W, 0.19 * H);
      g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 3; g.strokeRect(u0 * W, H - (side + 0.2) * H, (u1 - u0) * W, 0.19 * H);
    }
    // panel gaps (doors)
    g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 2;
    for (const vb of [0, 0.5]) for (const u of [0.36, 0.62]) { g.beginPath(); g.moveTo(u * W, H - vb * H); g.lineTo(u * W, H - (vb + 0.2) * H); g.stroke(); }
    // racing stripe over the top
    if (R() < 0.6) { g.fillStyle = R() < 0.5 ? '#f2efe6' : '#141414'; g.fillRect(0, H * 0.72, W, H * 0.06); }
    // rust and primer patches
    for (let i = 0; i < 30; i++) {
      const x = R() * W, y = R() * H, r = 8 + R() * 46;
      const rg = g.createRadialGradient(x, y, 0, x, y, r);
      const rust = R() < 0.7; rg.addColorStop(0, rust ? 'rgba(122,58,22,0.95)' : 'rgba(120,124,128,0.9)'); rg.addColorStop(0.6, rust ? 'rgba(92,44,18,0.7)' : 'rgba(110,112,116,0.5)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rg; g.beginPath(); g.ellipse(x, y, r, r * (0.4 + R() * 0.8), R() * 3, 0, 7); g.fill();
    }
    // sponsor stickers on the rear wings
    g.font = '900 22px "Exo 2", Arial, sans-serif'; g.textBaseline = 'middle';
    for (const [vc, flip] of [[0.1, false], [0.4, true]]) {
      const sp = SPONSORS[Math.floor(R() * SPONSORS.length)];
      g.save(); g.translate(W * 0.22, H - vc * H); if (flip) g.rotate(Math.PI);
      const tw = g.measureText(sp).width + 16; g.fillStyle = R() < 0.5 ? '#f3e14a' : '#f4f1e8'; g.fillRect(-tw / 2, -15, tw, 30); g.fillStyle = '#111'; g.textAlign = 'center'; g.fillText(sp, 0, 1); g.restore();
    }
    // mud along the bottom of the sides
    for (const v0 of [0.0, 0.5]) { const y0 = H - v0 * H; const m = g.createLinearGradient(0, y0, 0, y0 - H * 0.12); m.addColorStop(0, 'rgba(70,52,34,0.95)'); m.addColorStop(1, 'rgba(70,52,34,0)'); g.fillStyle = m; g.fillRect(0, y0 - H * 0.12, W, H * 0.12); }
    g.fillStyle = 'rgba(60,44,30,0.9)'; g.fillRect(0, H * 0.12, W, H * 0.13);
    // door roundel with number (both sides)
    for (const [vc, flip] of [[0.08, false], [0.42, true]]) {
      g.save(); g.translate(W * 0.5, H - vc * H); if (flip) g.rotate(Math.PI);
      g.fillStyle = '#f4f1e8'; g.beginPath(); g.arc(0, 0, 44, 0, 7); g.fill(); g.lineWidth = 6; g.strokeStyle = '#111'; g.stroke();
      g.fillStyle = '#111'; g.font = '900 56px "Exo 2", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(number), 0, 3); g.restore();
    }
    // big number painted on the bonnet (top, front)
    g.save(); g.translate(W * 0.8, H - 0.25 * H); g.rotate(Math.PI / 2); g.fillStyle = 'rgba(244,241,232,0.92)'; g.font = '900 120px "Exo 2", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(number), 0, 6); g.restore();
    // scratches
    g.strokeStyle = 'rgba(230,230,230,0.35)'; g.lineWidth = 1.5; for (let i = 0; i < 50; i++) { const x = R() * W, y = R() * H; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (R() - 0.5) * 90, y + (R() - 0.5) * 10); g.stroke(); }
  });
}
const M = {
  dark: new THREE.MeshStandardMaterial({ color: 0x16171a, roughness: 0.85 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xd4d7dc, roughness: 0.18, metalness: 1 }),
  rubber: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.95 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x6d7076, roughness: 0.5, metalness: 0.8 }),
  head: new THREE.MeshStandardMaterial({ color: 0xfff4d8, emissive: 0xfff0c8, emissiveIntensity: 0.6, roughness: 0.3 }),
  tail: new THREE.MeshStandardMaterial({ color: 0xff2a1a, emissive: 0xff1a0a, emissiveIntensity: 0.9, roughness: 0.3 }),
  cage: new THREE.MeshStandardMaterial({ color: 0xd8d8d8, roughness: 0.45, metalness: 0.7 }),
  interior: new THREE.MeshStandardMaterial({ color: 0x232120, roughness: 0.9, side: THREE.DoubleSide }),
  seat: new THREE.MeshStandardMaterial({ color: 0x1b1c22, roughness: 0.7 }),
  net: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
};
const HELMETS = ['#f2f2f2', '#e10600', '#ffd400', '#1e90ff', '#2e2e2e', '#ff7a00'];

// ---------- shaped loft (same idea as the race cars, unique geometry per car) ----------
function hull(sections, { seg = 36, Q = 8, u0 = 0, u1 = 1 } = {}) {
  const S = sections.slice().sort((a, b) => a.x - b.x).map((q) => ({ belt: (q.top + q.bot) / 2, wt: q.w, wb: q.w, n: 4, ...q }));
  const keys = ['top', 'bot', 'belt', 'w', 'wt', 'wb', 'n'];
  const sample = (x) => { let i = 0; while (i < S.length - 2 && S[i + 1].x < x) i++; const a = S[Math.max(0, i - 1)], b = S[i], c = S[i + 1], d = S[Math.min(S.length - 1, i + 2)]; const t = Math.max(0, Math.min(1, (x - b.x) / ((c.x - b.x) || 1))); const o = {}; for (const k of keys) { const p0 = a[k], p1 = b[k], p2 = c[k], p3 = d[k], t2 = t * t, t3 = t2 * t; o[k] = 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3); } o.n = Math.max(1.6, o.n); o.top = Math.max(o.top, o.belt + 0.002); o.bot = Math.min(o.bot, o.belt - 0.002); return o; };
  const pt = (s, th) => { const cs = Math.cos(th), sn = Math.sin(th), e = 2 / s.n; const uz = Math.sign(cs) * Math.abs(cs) ** e, uy = Math.sign(sn) * Math.abs(sn) ** e; const hw = uy >= 0 ? s.w + (s.wt - s.w) * uy * uy : s.w + (s.wb - s.w) * uy * uy; return [uz * hw, uy >= 0 ? s.belt + uy * (s.top - s.belt) : s.belt + uy * (s.belt - s.bot)]; };
  const x0 = S[0].x, x1 = S[S.length - 1].x, around = Q * 4, R = around + 1, pos = [], uv = [], idx = [];
  for (let i = 0; i <= seg; i++) {
    const x = x0 + (x1 - x0) * (i / seg), s = sample(x);
    for (let q = 0; q < 4; q++) {
      const dense = [], len = [0]; for (let k = 0; k <= 32; k++) { const p = pt(s, (q + k / 32) * Math.PI / 2); dense.push(p); if (k) len.push(len[k - 1] + Math.hypot(p[0] - dense[k - 1][0], p[1] - dense[k - 1][1])); }
      let k = 0; for (let j = 0; j < Q + (q === 3 ? 1 : 0); j++) { const tg = (j / Q) * len[32]; while (k < 31 && len[k + 1] < tg) k++; const f = Math.min(1, (tg - len[k]) / ((len[k + 1] - len[k]) || 1)); pos.push(x, dense[k][1] + (dense[k + 1][1] - dense[k][1]) * f, dense[k][0] + (dense[k + 1][0] - dense[k][0]) * f); uv.push(u0 + (u1 - u0) * (i / seg), (q * Q + j) / around); }
    }
  }
  for (let i = 0; i < seg; i++) for (let j = 0; j < around; j++) { const a = i * R + j, b = a + R; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const cap = (i, front) => { const s = sample(x0 + (x1 - x0) * (i / seg)); const ci = pos.length / 3; pos.push(x0 + (x1 - x0) * (i / seg), s.belt, 0); uv.push(front ? u1 : u0, 0.25); for (let j = 0; j < around; j++) { const a = i * R + j; front ? idx.push(ci, a + 1, a) : idx.push(ci, a, a + 1); } };
  cap(0, false); cap(seg, true);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  g.userData.sample = sample;
  return g;
}
function mesh(g, m) { const o = new THREE.Mesh(g, m); o.castShadow = true; o.receiveShadow = true; return o; }
function box(w, h, d, m, x, y, z) { const o = mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); return o; }
function tube(a, b, r, m) { const d = new THREE.Vector3().subVectors(b, a); const o = mesh(new THREE.CylinderGeometry(r, r, d.length(), 6), m); o.position.copy(a).addScaledVector(d, 0.5); o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); return o; }

const _wheelCache = new Map();
function wheel(r, w) {
  const grp = new THREE.Group(), spin = new THREE.Group(); grp.add(spin);
  const key = r + ':' + w;
  if (!_wheelCache.has(key)) {
    const prof = []; const rr = w * 0.25, rimR = r * 0.58;
    prof.push(new THREE.Vector2(rimR, -w / 2));
    for (let k = 0; k <= 5; k++) { const a = -Math.PI / 2 + (k / 5) * (Math.PI / 2); prof.push(new THREE.Vector2(r - rr + Math.cos(a) * rr, -w / 2 + rr + Math.sin(a) * rr)); }
    for (let k = 0; k <= 5; k++) { const a = (k / 5) * (Math.PI / 2); prof.push(new THREE.Vector2(r - rr + Math.cos(a) * rr, w / 2 - rr + Math.sin(a) * rr)); }
    prof.push(new THREE.Vector2(rimR, w / 2));
    const tg = new THREE.LatheGeometry(prof, 24); tg.rotateX(Math.PI / 2);
    // steel rims with hub nuts, merged into one geometry (one draw call)
    const bits = [];
    for (const sg of [1, -1]) {
      const d = new THREE.CylinderGeometry(rimR, rimR * 0.9, 0.04, 18); d.rotateX(Math.PI / 2); d.translate(0, 0, sg * w * 0.32); bits.push(d.toNonIndexed());
      for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; const n = new THREE.CylinderGeometry(0.035, 0.035, 0.05, 6); n.rotateX(Math.PI / 2); n.translate(Math.cos(a) * rimR * 0.55, Math.sin(a) * rimR * 0.55, sg * w * 0.35); bits.push(n.toNonIndexed()); }
      const hub = new THREE.CylinderGeometry(rimR * 0.22, rimR * 0.22, 0.06, 10); hub.rotateX(Math.PI / 2); hub.translate(0, 0, sg * w * 0.34); bits.push(hub.toNonIndexed());
    }
    _wheelCache.set(key, { tg, rim: mergeGeometries(bits) });
  }
  const { tg, rim } = _wheelCache.get(key);
  spin.add(mesh(tg, M.rubber)); spin.add(mesh(rim, M.steel));
  grp.userData.spin = spin; grp.userData.r = r; grp.userData.w = w; return grp;
}
export function makeWheel(r, w) { return wheel(r, w); }

// returns THREE.Group with userData { wheels[], shell, body (deformable mesh), cab, parts[] (detachables), wheelPos[], dims, dirt, glass }
export function buildBanger(type, color, number = 7, seed = 1) {
  const car = new THREE.Group(), shell = new THREE.Group(); car.add(shell);
  const R = rand(seed * 131 + 7);
  const dirt = { value: 0 };
  const paintTex = bangerPaint(color, number, seed);
  const paint = dirtPatch(new THREE.MeshPhysicalMaterial({ map: paintTex, roughness: 0.62, metalness: 0.25, clearcoat: 0.3, clearcoatRoughness: 0.45 }), dirt);
  const pm = dirtPatch(new THREE.MeshPhysicalMaterial({ color, roughness: 0.6, metalness: 0.25, clearcoat: 0.2 }), dirt);
  const L = type === 'utilitaria' ? 1.8 : type === 'pickup' ? 2.45 : 2.3; // half length
  const Wd = type === 'utilitaria' ? 0.82 : 0.92;
  const roofY = type === 'utilitaria' ? 1.45 : type === 'muscle' ? 1.28 : type === 'pickup' ? 1.62 : 1.42;
  const beltY = type === 'pickup' ? 1.02 : 0.92;
  const lower = [
    { x: -L, top: beltY - 0.05, bot: 0.34, belt: 0.5, w: Wd - 0.06, wt: Wd - 0.1, wb: Wd - 0.1, n: 5 },
    { x: -L + 0.25, top: beltY, bot: 0.28, belt: 0.48, w: Wd, wt: Wd - 0.04, wb: Wd - 0.06, n: 6 },
    { x: 0, top: beltY + 0.02, bot: 0.27, belt: 0.48, w: Wd, wt: Wd - 0.04, wb: Wd - 0.06, n: 6 },
    { x: L - 0.55, top: beltY - (type === 'muscle' ? 0.02 : 0.06), bot: 0.28, belt: 0.48, w: Wd, wt: Wd - 0.06, wb: Wd - 0.06, n: 6 },
    { x: L, top: beltY - 0.2, bot: 0.34, belt: 0.5, w: Wd - 0.1, wt: Wd - 0.16, wb: Wd - 0.12, n: 5 },
  ];
  const body = mesh(hull(lower, { seg: 44, Q: 10 }), paint); shell.add(body);
  // greenhouse: cabin over the middle (pick-up: short cab, then bed). Side glass is removed
  // (derby rules): alpha holes show the interior, cage and driver; windscreens can crack.
  const cabRear = type === 'pickup' ? -0.15 : type === 'utilitaria' ? -L + 0.15 : -L + 0.7, cabFront = type === 'utilitaria' ? 0.75 : type === 'pickup' ? 1.0 : 0.85;
  const WIN = { side: [[0.1, 0.47], [0.53, 0.88]], sideV: [[0.015, 0.1], [0.4, 0.485]], front: [0.86, 0.995, 0.12, 0.38], rear: [0.005, 0.12, 0.12, 0.38] };
  const winTex = canvasTex(512, 256, (g, W, H) => {
    g.fillStyle = color; g.fillRect(0, 0, W, H); g.fillStyle = 'rgba(60,44,30,0.35)'; g.fillRect(0, 0, W, H);
    const glass = (u0, u1, v0, v1) => { g.fillStyle = '#0d1218'; g.fillRect(u0 * W, H - v1 * H, (u1 - u0) * W, (v1 - v0) * H); g.strokeStyle = 'rgba(200,220,240,0.25)'; g.lineWidth = 3; g.beginPath(); g.moveTo(u0 * W + 20, H - v1 * H + 10); g.lineTo(u0 * W + 70, H - v0 * H - 10); g.stroke(); };
    for (const [a, b] of WIN.sideV) for (const [u0, u1] of WIN.side) g.clearRect(u0 * W, H - b * H, (u1 - u0) * W, (b - a) * H);
    glass(...WIN.front); glass(...WIN.rear);
  });
  const gm = dirtPatch(new THREE.MeshPhysicalMaterial({ map: winTex, roughness: 0.4, metalness: 0.2, clearcoat: 0.5, alphaTest: 0.5, side: THREE.DoubleSide }), dirt);
  const cab = mesh(hull([
    { x: cabRear, top: beltY + 0.08, bot: beltY - 0.02, belt: beltY, w: Wd - 0.08, wt: Wd - 0.18, n: 5 },
    { x: cabRear + 0.3, top: roofY, bot: beltY - 0.02, belt: beltY + 0.02, w: Wd - 0.1, wt: Wd - 0.24, n: 5 },
    { x: cabFront - 0.45, top: roofY - 0.02, bot: beltY - 0.02, belt: beltY + 0.02, w: Wd - 0.1, wt: Wd - 0.26, n: 5 },
    { x: cabFront, top: beltY + 0.06, bot: beltY - 0.04, belt: beltY, w: Wd - 0.1, wt: Wd - 0.2, n: 5 },
  ], { seg: 18, Q: 7 }), gm); shell.add(cab);
  // interior: floor, seat, driver with helmet, roll cage, window nets
  const midX = (cabRear + cabFront) / 2, cw = Wd - 0.2;
  shell.add(box(cabFront - cabRear - 0.2, 0.04, cw * 2, M.interior, midX, beltY - 0.25, 0));
  const dX = midX - 0.05, dZ = -0.33;
  shell.add(box(0.12, 0.62, 0.46, M.seat, dX - 0.32, beltY + 0.05, dZ));
  shell.add(box(0.4, 0.14, 0.46, M.seat, dX - 0.1, beltY - 0.18, dZ));
  const suit = new THREE.MeshStandardMaterial({ color: HELMETS[Math.floor(R() * HELMETS.length)], roughness: 0.6 });
  shell.add(box(0.26, 0.42, 0.36, suit, dX - 0.15, beltY + 0.04, dZ));
  const helmet = mesh(new THREE.SphereGeometry(0.15, 14, 10), new THREE.MeshPhysicalMaterial({ color: HELMETS[Math.floor(R() * HELMETS.length)], roughness: 0.25, clearcoat: 1 })); helmet.position.set(dX - 0.1, beltY + 0.38, dZ); shell.add(helmet);
  const visor = mesh(new THREE.SphereGeometry(0.152, 12, 6, -0.9, 1.8, 1.2, 0.6), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.1, metalness: 0.8 })); visor.position.copy(helmet.position); shell.add(visor);
  shell.add(tube(new THREE.Vector3(dX + 0.35, beltY + 0.12, dZ - 0.05), new THREE.Vector3(dX + 0.35, beltY + 0.28, dZ + 0.05), 0.17, M.dark)); // wheel rim stand-in
  const cy0 = beltY - 0.2, cy1 = roofY - 0.08, cr = 0.025;
  for (const z of [cw - 0.04, -cw + 0.04]) {
    const zt = z * 0.78;
    shell.add(tube(new THREE.Vector3(cabRear + 0.32, cy0, z), new THREE.Vector3(cabRear + 0.38, cy1, zt), cr, M.cage));
    shell.add(tube(new THREE.Vector3(cabFront - 0.35, cy0, z), new THREE.Vector3(cabFront - 0.5, cy1, zt), cr, M.cage));
    shell.add(tube(new THREE.Vector3(cabRear + 0.38, cy1, zt), new THREE.Vector3(cabFront - 0.5, cy1, zt), cr, M.cage));
    shell.add(tube(new THREE.Vector3(cabRear + 0.32, beltY + 0.05, z), new THREE.Vector3(cabFront - 0.35, beltY + 0.05, z), cr, M.cage)); // door bar
  }
  shell.add(tube(new THREE.Vector3(cabRear + 0.38, cy1, -cw * 0.78), new THREE.Vector3(cabRear + 0.38, cy1, cw * 0.78), cr, M.cage));
  shell.add(tube(new THREE.Vector3(cabRear + 0.32, cy0, cw - 0.04), new THREE.Vector3(cabRear + 0.38, cy1, -cw * 0.78), cr, M.cage)); // diagonal
  const net = new THREE.Mesh(new THREE.PlaneGeometry((cabFront - cabRear) * 0.42, (roofY - beltY) * 0.7), M.net); net.position.set(midX - 0.12, (beltY + roofY) / 2, -Wd + 0.1); shell.add(net);
  // roof sign with the race number (both faces)
  const signTex = canvasTex(256, 128, (g, W, H) => { g.fillStyle = '#f4f1e8'; g.fillRect(0, 0, W, H); g.lineWidth = 10; g.strokeStyle = '#111'; g.strokeRect(5, 5, W - 10, H - 10); g.fillStyle = '#111'; g.font = '900 96px "Exo 2", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(number), W / 2, H / 2 + 6); });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.36), new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.7, side: THREE.DoubleSide })); sign.position.set(midX - 0.05, roofY + 0.22, 0); sign.castShadow = true; shell.add(sign);
  shell.add(box(0.05, 0.06, 0.6, M.steel, midX - 0.05, roofY + 0.02, 0));
  const parts = [];
  const part = (o, zone, hp) => { o.userData.zone = zone; o.userData.hp = hp; shell.add(o); parts.push(o); return o; };
  // chrome trim: side mouldings at the belt line, window drip rails
  for (const z of [1, -1]) {
    shell.add(box(L * 2 - 0.7, 0.035, 0.03, M.chrome, 0.05, 0.62, z * (Wd + 0.003)));
    shell.add(box(cabFront - cabRear - 0.2, 0.03, 0.03, M.chrome, midX, beltY + 0.06, z * (Wd - 0.08)));
  }
  // bumpers (chrome, dented), bonnet, boot, spoiler, mirrors, grille, bull bar
  part(box(0.16, 0.18, Wd * 2 - 0.05, M.chrome, L + 0.04, 0.42, 0), 'front', 26);
  part(box(0.16, 0.18, Wd * 2 - 0.05, M.chrome, -L - 0.04, 0.42, 0), 'rear', 26);
  const grille = box(0.03, 0.2, Wd * 1.1, M.dark, L - 0.005, 0.6, 0); shell.add(grille);
  for (let k = -2; k <= 2; k++) shell.add(box(0.035, 0.18, 0.02, M.chrome, L, 0.6, k * Wd * 0.2));
  const bonnet = part(mesh(hull([{ x: cabFront + 0.05, top: beltY + 0.035, bot: beltY - 0.01, w: Wd - 0.12, n: 6 }, { x: L - 0.12, top: beltY - 0.12, bot: beltY - 0.17, w: Wd - 0.18, n: 6 }], { seg: 6, Q: 5, u0: 0.62, u1: 0.95 }), paint), 'front', 34);
  bonnet.userData.hinge = cabFront + 0.05; bonnet.userData.bonnet = true;
  if (type === 'muscle') { const sc = box(0.5, 0.12, 0.4, M.dark, 1.15, beltY + 0.08, 0); bonnet.add(sc); }
  if (type !== 'pickup') part(mesh(hull([{ x: -L + 0.12, top: beltY - 0.03, bot: beltY - 0.08, w: Wd - 0.16, n: 6 }, { x: cabRear + 0.02, top: beltY + 0.04, bot: beltY - 0.01, w: Wd - 0.12, n: 6 }], { seg: 6, Q: 5, u0: 0.05, u1: 0.3 }), paint), 'rear', 30);
  else {
    shell.add(box(1.7, 0.05, Wd * 2 - 0.2, M.dark, -1.25, beltY - 0.02, 0));
    part(box(0.06, 0.38, Wd * 2 - 0.1, pm, -L + 0.03, beltY - 0.18, 0), 'rear', 30);
    const spare = wheel(0.36, 0.24); spare.rotation.x = Math.PI / 2; spare.position.set(-1.2, beltY + 0.12, 0.2); shell.add(spare);
    // bull bar
    const bb = new THREE.Group(); bb.add(tube(new THREE.Vector3(L + 0.18, 0.35, -0.55), new THREE.Vector3(L + 0.18, 0.95, -0.4), 0.04, M.steel)); bb.add(tube(new THREE.Vector3(L + 0.18, 0.35, 0.55), new THREE.Vector3(L + 0.18, 0.95, 0.4), 0.04, M.steel)); bb.add(tube(new THREE.Vector3(L + 0.18, 0.95, -0.4), new THREE.Vector3(L + 0.18, 0.95, 0.4), 0.04, M.steel)); bb.add(tube(new THREE.Vector3(L + 0.18, 0.62, -0.62), new THREE.Vector3(L + 0.18, 0.62, 0.62), 0.04, M.steel));
    bb.traverse((o) => { if (o.isMesh) o.castShadow = true; }); part(bb, 'front', 60);
  }
  if (type === 'muscle' || type === 'utilitaria') part(box(0.32, 0.04, Wd * 2 - 0.25, M.dark, -L + 0.2, beltY + 0.18, 0), 'rear', 14);
  for (const z of [Wd + 0.05, -Wd - 0.05]) part(box(0.12, 0.09, 0.08, M.chrome, cabFront - 0.15, beltY + 0.15, z), z > 0 ? 'left' : 'right', 8);
  for (const z of [0.55, -0.55]) {
    const hl = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 14), M.head); hl.rotation.z = Math.PI / 2; hl.position.set(L - 0.01, 0.66, z); shell.add(hl);
    const ring = mesh(new THREE.TorusGeometry(0.105, 0.018, 6, 16), M.chrome); ring.rotation.y = Math.PI / 2; ring.position.set(L + 0.005, 0.66, z); shell.add(ring);
    shell.add(box(0.04, 0.1, 0.24, M.tail, -L + 0.01, 0.7, z));
  }
  // mud flaps
  for (const z of [Wd - 0.12, -Wd + 0.12]) shell.add(box(0.02, 0.22, 0.24, M.rubber, -L + 0.62, 0.3, z));
  const ex = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 10), M.chrome); ex.rotation.z = Math.PI / 2; ex.position.set(-L - 0.1, 0.32, -0.5); shell.add(ex);
  // underbody shadow plate
  shell.add(box(L * 2 - 0.4, 0.04, Wd * 2 - 0.3, M.dark, 0, 0.27, 0));
  // wheels (on the root, not the shell)
  const wr = type === 'pickup' ? 0.4 : 0.34, ww = type === 'pickup' ? 0.3 : 0.24, wx = L - 0.72, wz = Wd - 0.12;
  const wheels = [], wheelPos = [];
  for (const [x, z] of [[wx, wz], [wx, -wz], [-wx + 0.05, wz], [-wx + 0.05, -wz]]) { const w = wheel(wr, ww); w.position.set(x, wr, z); car.add(w); wheels.push(w); wheelPos.push([x, z]); }
  // keep the original body vertices for deformation
  body.geometry.userData.orig = Float32Array.from(body.geometry.attributes.position.array);
  cab.geometry.userData.orig = Float32Array.from(cab.geometry.attributes.position.array);
  // one mesh per material for everything that never moves on its own (cage, trims, interior, lights...)
  mergeStatic(shell, new Set([body, cab, ...parts]));
  car.userData = { wheels, wheelPos, wr, ww, shell, body, cab, parts, dims: { L, W: Wd, H: roofY, beltY }, paint, dirt, glass: { tex: winTex, WIN, cracked: {} }, sign };
  return car;
}

// Dent the body around a local-space point. dir: local direction of the push. amount in metres.
// Tight falloff for a localised crater, plus a slight crease noise so panels look crumpled.
export function dent(car, local, dir, amount) {
  const geos = [car.userData.body.geometry, car.userData.cab.geometry];
  const R = 0.38 + amount * 1.5, R2 = R * R;
  for (const g of geos) {
    const P = g.attributes.position, A = P.array, O = g.userData.orig;
    let touched = false;
    for (let i = 0; i < P.count; i++) {
      const ix = i * 3, dx = A[ix] - local.x, dy = A[ix + 1] - local.y, dz = A[ix + 2] - local.z;
      const d2 = dx * dx + dy * dy + dz * dz; if (d2 > R2) continue;
      const d = Math.sqrt(d2), fo = 1 - d / R;
      const crease = 0.75 + 0.5 * Math.sin(A[ix] * 23.1 + A[ix + 1] * 17.3 + A[ix + 2] * 11.7);
      const f = fo * fo * (3 - 2 * fo) * amount * crease;
      let nx = A[ix] + dir.x * f, ny = A[ix + 1] + dir.y * f * 0.6 - f * 0.1, nz = A[ix + 2] + dir.z * f;
      if (O) { const ox = O[ix], oy = O[ix + 1], oz = O[ix + 2]; const dd = Math.hypot(nx - ox, ny - oy, nz - oz); if (dd > 0.62) { const k = 0.62 / dd; nx = ox + (nx - ox) * k; ny = oy + (ny - oy) * k; nz = oz + (nz - oz) * k; } }
      A[ix] = nx; A[ix + 1] = ny; A[ix + 2] = nz;
      touched = true;
    }
    if (touched) { P.needsUpdate = true; g.computeVertexNormals(); g.computeBoundingSphere(); }
  }
}

// Crack a windscreen ('front' | 'rear') on the cab texture. Returns true when it shattered now.
export function crackGlass(car, zone, severity = 1) {
  const gl = car.userData.glass; if (!gl || !gl.WIN[zone]) return false;
  const st = (gl.cracked[zone] || 0) + severity; gl.cracked[zone] = st;
  const g = gl.tex.userData.ctx, W = g.canvas.width, H = g.canvas.height;
  const [u0, u1, v0, v1] = gl.WIN[zone];
  g.save(); g.beginPath(); g.rect(u0 * W, H - v1 * H, (u1 - u0) * W, (v1 - v0) * H); g.clip();
  if (st >= 2.2) { g.clearRect(u0 * W, H - v1 * H, (u1 - u0) * W, (v1 - v0) * H); g.restore(); gl.tex.needsUpdate = true; return !gl.gone?.[zone] && ((gl.gone ||= {})[zone] = true); }
  const cx = (u0 + (u1 - u0) * (0.3 + Math.random() * 0.4)) * W, cy = H - (v0 + (v1 - v0) * (0.3 + Math.random() * 0.4)) * H;
  g.strokeStyle = 'rgba(225,235,245,0.75)'; g.lineWidth = 1.4;
  for (let k = 0; k < 9; k++) { const a = Math.random() * 6.28; let x = cx, y = cy; g.beginPath(); g.moveTo(x, y); for (let s = 0; s < 4; s++) { x += Math.cos(a + (Math.random() - 0.5) * 0.6) * 14; y += Math.sin(a + (Math.random() - 0.5) * 0.6) * 14; g.lineTo(x, y); } g.stroke(); }
  for (const r of [6, 13, 22]) { g.beginPath(); g.arc(cx, cy, r, 0, 7); g.stroke(); }
  g.restore(); gl.tex.needsUpdate = true; return false;
}
