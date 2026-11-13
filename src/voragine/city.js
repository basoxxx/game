// Voragine — procedural city: object kinds (low-poly, vertex coloured, instanced) and the block layout.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---- geometry kit: parts are merged into one BufferGeometry with a colour attribute
const C = new THREE.Color();
function paint(g, color) {
  g = g.index ? g.toNonIndexed() : g;
  g.deleteAttribute('uv');
  C.set(color);
  const n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = C.r; a[i * 3 + 1] = C.g; a[i * 3 + 2] = C.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
const box = (w, h, d, x, y, z, color, ry = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (ry) g.rotateY(ry); g.translate(x, y + h / 2, z); return paint(g, color); };
const cyl = (rt, rb, h, x, y, z, color, seg = 8) => { const g = new THREE.CylinderGeometry(rt, rb, h, seg); g.translate(x, y + h / 2, z); return paint(g, color); };
const ball = (r, x, y, z, color, det = 0) => { const g = new THREE.IcosahedronGeometry(r, det); g.translate(x, y, z); return paint(g, color); };
const cone = (r, h, x, y, z, color, seg = 7) => { const g = new THREE.ConeGeometry(r, h, seg); g.translate(x, y + h / 2, z); return paint(g, color); };
const wheel = (r, w, x, z) => { const g = new THREE.CylinderGeometry(r, r, w, 8); g.rotateX(Math.PI / 2); g.translate(x, r, z); return paint(g, '#15171b'); };
const merge = (parts) => mergeGeometries(parts.filter(Boolean));

// window grid on the four faces of a w×d footprint, floors of fh starting at y0
function windows(w, d, h, y0, fh, color, inset = 0.6, ww = 1.2) {
  const out = [];
  for (let y = y0; y + fh * 0.6 < h; y += fh) {
    for (let x = -w / 2 + inset + ww / 2; x <= w / 2 - inset - ww / 2 + 0.01; x += ww * 2) { out.push(box(ww, fh * 0.55, 0.12, x, y, d / 2 + 0.03, color)); out.push(box(ww, fh * 0.55, 0.12, x, y, -d / 2 - 0.03, color)); }
    for (let z = -d / 2 + inset + ww / 2; z <= d / 2 - inset - ww / 2 + 0.01; z += ww * 2) { out.push(box(0.12, fh * 0.55, ww, w / 2 + 0.03, y, z, color)); out.push(box(0.12, fh * 0.55, ww, -w / 2 - 0.03, y, z, color)); }
  }
  return out;
}

// Object kinds. r = footprint radius used for "fits in the hole", h = height (for the fall),
// tint = per-instance colours for the white parts, glow = parts that light up at night.
export const KINDS = {
  person: { label: 'Pedoni', r: 0.32, h: 1.8, tint: ['#e8513d', '#3d7be8', '#f2c230', '#36b37e', '#f2f2f2', '#9b59b6', '#ff8a3d', '#222'],
    build: () => [merge([box(0.5, 0.8, 0.3, 0, 0, 0, '#3b4252'), box(0.55, 0.65, 0.34, 0, 0.8, 0, '#ffffff'), ball(0.2, 0, 1.6, 0, '#f1c7a5')])] },
  cone: { label: 'Coni', r: 0.28, h: 0.75, tint: ['#ffffff'], build: () => [merge([box(0.6, 0.06, 0.6, 0, 0, 0, '#ff6a00'), cone(0.25, 0.7, 0, 0.05, 0, '#ff6a00'), cyl(0.15, 0.17, 0.12, 0, 0.35, 0, '#ffffff')])] },
  hydrant: { label: 'Idranti', r: 0.3, h: 0.9, tint: ['#d7263d', '#f2c230'], build: () => [merge([cyl(0.2, 0.22, 0.75, 0, 0, 0, '#ffffff'), ball(0.2, 0, 0.78, 0, '#ffffff'), cyl(0.08, 0.08, 0.5, 0, 0.45, 0, '#cccccc')])] },
  bin: { label: 'Cestini', r: 0.36, h: 1, tint: ['#2f7d4f', '#3a5f9e', '#7a7f87'], build: () => [merge([cyl(0.32, 0.28, 0.95, 0, 0, 0, '#ffffff'), cyl(0.34, 0.34, 0.08, 0, 0.95, 0, '#333a44')])] },
  lamp: { label: 'Lampioni', r: 0.34, h: 5, tint: ['#9aa3ad'], glow: true,
    build: () => [merge([cyl(0.09, 0.12, 4.6, 0, 0, 0, '#ffffff'), box(1.1, 0.12, 0.18, 0.45, 4.55, 0, '#ffffff')]), merge([box(0.5, 0.14, 0.3, 0.85, 4.42, 0, '#fff4c4')])] },
  bench: { label: 'Panchine', r: 0.85, h: 1, tint: ['#8a5a3b', '#2f6b4f', '#6b3a2e'], build: () => [merge([box(1.8, 0.1, 0.5, 0, 0.45, 0, '#ffffff'), box(1.8, 0.45, 0.08, 0, 0.55, -0.22, '#ffffff'), box(0.08, 0.45, 0.45, -0.8, 0, 0, '#333'), box(0.08, 0.45, 0.45, 0.8, 0, 0, '#333')])] },
  bush: { label: 'Cespugli', r: 0.75, h: 1.2, tint: ['#3f8f3a', '#2f7a40', '#5a9e2f'], build: () => [merge([ball(0.75, 0, 0.55, 0, '#ffffff', 0), ball(0.5, 0.45, 0.45, 0.2, '#ffffff', 0)])] },
  tree: { label: 'Alberi', r: 1.3, h: 6, tint: ['#3e9b47', '#2d8040', '#6aa84f', '#c9802f', '#d64f6a'],
    build: () => [merge([cyl(0.22, 0.3, 2.4, 0, 0, 0, '#6b4a33'), ball(1.5, 0, 3.4, 0, '#ffffff', 0), ball(1.05, 0.5, 4.5, 0.2, '#ffffff', 0)])] },
  pine: { label: 'Alberi', r: 1.2, h: 7, tint: ['#2a6e45', '#1f5f3c'], build: () => [merge([cyl(0.2, 0.25, 1.4, 0, 0, 0, '#5b3c28'), cone(1.4, 3, 0, 1.2, 0, '#ffffff'), cone(1.0, 2.6, 0, 3.2, 0, '#ffffff')])] },
  kiosk: { label: 'Chioschi', r: 1.7, h: 3.2, tint: ['#e8513d', '#2f9e9e', '#f2a541', '#7f5af0'], glow: true,
    build: () => [merge([box(2.8, 2.4, 2.2, 0, 0, 0, '#f3efe6'), box(3.3, 0.4, 2.8, 0, 2.4, 0, '#ffffff'), box(3.3, 0.25, 0.5, 0, 2.2, 1.35, '#ffffff')]), merge([box(2.2, 0.9, 0.05, 0, 1.1, 1.12, '#ffe7a8')])] },
  fountain: { label: 'Fontane', r: 3, h: 2.2, tint: ['#d9d4c7'], build: () => [merge([cyl(3, 3.1, 0.7, 0, 0, 0, '#ffffff', 14), cyl(2.6, 2.6, 0.05, 0, 0.66, 0, '#4fa3d9', 14), cyl(0.5, 0.7, 1.4, 0, 0.7, 0, '#ffffff'), cyl(1.2, 0.6, 0.3, 0, 1.9, 0, '#ffffff', 10)])] },
  car: { label: 'Auto', r: 2.15, h: 1.6, tint: ['#e63946', '#1d4ed8', '#f4f4f4', '#222831', '#f2c230', '#2a9d8f', '#8d99ae', '#ff7b00'],
    build: () => [merge([box(4.2, 0.75, 1.9, 0, 0.3, 0, '#ffffff'), box(2.3, 0.62, 1.7, -0.2, 1.05, 0, '#ffffff'), box(2.1, 0.5, 1.74, -0.2, 1.08, 0, '#1d2633'), ...[[-1.35, 0.9], [1.35, 0.9], [-1.35, -0.9], [1.35, -0.9]].map(([x, z]) => wheel(0.36, 0.3, x, z))]),
      merge([box(0.05, 0.18, 0.4, 2.11, 0.75, 0.6, '#fff6d5'), box(0.05, 0.18, 0.4, 2.11, 0.75, -0.6, '#fff6d5')])], glow: true },
  taxi: { label: 'Auto', r: 2.15, h: 1.9, tint: ['#ffc21a'],
    build: () => [merge([box(4.2, 0.75, 1.9, 0, 0.3, 0, '#ffffff'), box(2.3, 0.62, 1.7, -0.2, 1.05, 0, '#ffffff'), box(2.1, 0.5, 1.74, -0.2, 1.08, 0, '#1d2633'), box(0.8, 0.25, 0.4, -0.2, 1.67, 0, '#111'), ...[[-1.35, 0.9], [1.35, 0.9], [-1.35, -0.9], [1.35, -0.9]].map(([x, z]) => wheel(0.36, 0.3, x, z))])] },
  van: { label: 'Furgoni', r: 2.7, h: 2.6, tint: ['#f4f4f4', '#2f5d8a', '#c0392b', '#3c763d'],
    build: () => [merge([box(5.2, 2.0, 2.1, 0, 0.35, 0, '#ffffff'), box(0.9, 0.9, 2.0, 2.55, 0.35, 0, '#ffffff'), box(0.1, 0.7, 1.9, 2.98, 1.3, 0, '#1d2633'), ...[[-1.8, 1], [1.8, 1], [-1.8, -1], [1.8, -1]].map(([x, z]) => wheel(0.42, 0.3, x, z))])] },
  bus: { label: 'Autobus', r: 5, h: 3.4, tint: ['#e8513d', '#f2a541', '#2f9e9e'], glow: true,
    build: () => [merge([box(10.5, 2.6, 2.5, 0, 0.45, 0, '#ffffff'), box(10.6, 0.25, 2.55, 0, 3.05, 0, '#e8e8e8'), ...[[-3.5, 1.2], [3.5, 1.2], [-3.5, -1.2], [3.5, -1.2]].map(([x, z]) => wheel(0.5, 0.3, x, z))]),
      merge([box(9.6, 0.9, 2.56, -0.2, 1.8, 0, '#bfe3ff'), box(0.06, 1.2, 2.2, 5.26, 1.5, 0, '#bfe3ff')])] },
  house: { label: 'Case', r: 4.6, h: 9, tint: ['#f2e3c6', '#e8b4a0', '#cfe0c3', '#f7f3ea', '#c9d6e8', '#f0c987'], glow: true,
    build: () => [merge([box(8, 5.5, 7.5, 0, 0, 0, '#ffffff'), cone(6.4, 3.2, 0, 5.5, 0, '#a2412f', 4).rotateY(Math.PI / 4), box(1.4, 2.2, 0.15, 0, 0, 3.8, '#5b3c28'), box(0.9, 2, 0.9, 2.5, 6, -1, '#8a5a3b')]), merge(windows(8, 7.5, 5.5, 1.2, 2.6, '#ffe7a8', 1.2, 1.1))] },
  shop: { label: 'Negozi', r: 6.2, h: 7, tint: ['#e9ecef', '#f8d9c4', '#d4e4f7', '#f3e8c8'], glow: true,
    build: () => [merge([box(12, 6, 10, 0, 0, 0, '#ffffff'), box(12.4, 0.5, 10.4, 0, 6, 0, '#5c6370'), box(10, 0.4, 1.6, 0, 3.2, 5.6, '#e8513d'), box(3, 1.2, 0.2, 3, 4.4, 5.1, '#2f9e9e')]), merge([box(9.5, 2.6, 0.12, 0, 0.3, 5.03, '#bfe3ff'), ...windows(12, 10, 6, 4.2, 3, '#ffe7a8', 1.4, 1.3).slice(4)])] },
  apartment: { label: 'Palazzi', r: 6.4, h: 21, tint: ['#e3d5c4', '#cfc6bb', '#bcc9d4', '#e8c8a8', '#d9c6e0'], glow: true,
    build: () => [merge([box(12, 20, 12, 0, 0, 0, '#ffffff'), box(12.6, 0.6, 12.6, 0, 20, 0, '#6b6f78'), box(3, 1.8, 3, 2, 20.6, 2, '#8a8f99')]), merge(windows(12, 12, 20, 1.5, 3, '#ffe7a8', 1, 1.2))] },
  office: { label: 'Uffici', r: 6.4, h: 32, tint: ['#9fb3c8', '#7f95ad', '#b8c2cc', '#8fa89a'], glow: true,
    build: () => [merge([box(12, 30, 12, 0, 0, 0, '#ffffff'), box(10, 2, 10, 0, 30, 0, '#5c6370'), cyl(0.15, 0.15, 4, 3, 32, 3, '#ccc')]), merge(windows(12, 12, 30, 1.2, 2.4, '#d6ecff', 0.5, 0.9))] },
  tower: { label: 'Grattacieli', r: 10.5, h: 60, tint: ['#7d93b2', '#8aa1a8', '#a3a9c2', '#6f8faf'], glow: true,
    build: () => [merge([box(20, 26, 20, 0, 0, 0, '#ffffff'), box(16, 18, 16, 0, 26, 0, '#ffffff'), box(11, 12, 11, 0, 44, 0, '#ffffff'), cyl(0.3, 0.3, 6, 0, 56, 0, '#d0d4da')]),
      merge([...windows(20, 20, 26, 1.5, 2.6, '#d6ecff', 0.6, 1), ...windows(16, 16, 44, 27, 2.6, '#d6ecff', 0.6, 1).map((g) => g), ...windows(11, 11, 56, 45, 2.6, '#d6ecff', 0.6, 1)])] },
  landmark: { label: 'Monumenti', r: 14, h: 95, tint: ['#e9e4d8'], glow: true,
    build: () => [merge([box(26, 4, 26, 0, 0, 0, '#ffffff'), box(16, 40, 16, 0, 4, 0, '#ffffff'), box(12, 24, 12, 0, 44, 0, '#ffffff'), box(8, 14, 8, 0, 68, 0, '#ffffff'), cone(4.5, 12, 0, 82, 0, '#c9a24a', 4).rotateY(Math.PI / 4)]),
      merge([...windows(16, 16, 44, 6, 3, '#ffe7a8', 0.8, 1.2), ...windows(12, 12, 68, 46, 3, '#ffe7a8', 0.8, 1.2)])] },
};
// building kinds report the radius of their real footprint; points grow with the area
for (const [id, k] of Object.entries(KINDS)) { k.id = id; k.pts = Math.max(0.35, k.r * k.r * 3); }
// kinds that matter for the "now you can swallow…" hints, in unlock order
export const MILESTONES = ['person', 'bench', 'tree', 'car', 'van', 'house', 'bus', 'shop', 'apartment', 'tower', 'landmark'];

export const CITIES = {
  centro: { name: 'Centro Città', sub: 'Viali, uffici e un monumento in piazza', seed: 11, sky: '#9ec9f0', fog: '#bcd8f0', sun: '#fff2dc', amb: 0.62, night: false, landmark: true,
    w: { downtown: 0.32, shops: 0.2, plaza: 0.14, park: 0.14, parking: 0.1, res: 0.1 } },
  giardino: { name: 'Quartiere Giardino', sub: 'Villette, parchi e il tramonto', seed: 27, sky: '#f7b98b', fog: '#f3c9a6', sun: '#ffc48a', amb: 0.55, night: false, landmark: false,
    w: { res: 0.44, park: 0.24, shops: 0.14, plaza: 0.1, parking: 0.08 } },
  notte: { name: 'Città di Notte', sub: 'Neon, finestre accese e traffico notturno', seed: 43, sky: '#0b1230', fog: '#121a3a', sun: '#9fb2ff', amb: 0.62, night: true, landmark: true,
    w: { downtown: 0.36, shops: 0.22, plaza: 0.14, park: 0.1, parking: 0.12, res: 0.06 } },
};

export const ROAD = 12, BLOCK = 30, PITCH = ROAD + BLOCK, NB = 6;
export const HALF = (NB * PITCH) / 2; // road centres at -HALF + k*PITCH, k = 0..NB
export const roadC = (k) => -HALF + k * PITCH;

function pick(r, w) { let t = r() * Object.values(w).reduce((a, b) => a + b, 0); for (const [k, v] of Object.entries(w)) { if ((t -= v) <= 0) return k; } return Object.keys(w)[0]; }

// Lay out the city. Returns { blocks, items: [{kind,x,z,rot,s}], movers: [{kind,…,path}] }
export function layoutCity(cityId) {
  const cfg = CITIES[cityId] || CITIES.centro;
  const r = rng(cfg.seed);
  const items = [], movers = [], blocks = [];
  const add = (kind, x, z, rot = r() * Math.PI * 2, s = 0.92 + r() * 0.16) => items.push({ kind, x, z, rot, s });
  const mid = Math.floor(NB / 2);
  for (let bx = 0; bx < NB; bx++) for (let bz = 0; bz < NB; bz++) {
    const x0 = roadC(bx) + ROAD / 2, z0 = roadC(bz) + ROAD / 2, cx = x0 + BLOCK / 2, cz = z0 + BLOCK / 2;
    let type = cfg.landmark && bx === mid && bz === mid ? 'landmark' : pick(r, cfg.w);
    blocks.push({ bx, bz, x0, z0, type });
    // sidewalk furniture on all four sides
    for (let i = 0; i < 4; i++) {
      for (let t = 3; t < BLOCK - 2; t += 7.5) {
        const [x, z, rot] = i === 0 ? [x0 + t, z0 + 1.1, 0] : i === 1 ? [x0 + t, z0 + BLOCK - 1.1, Math.PI] : i === 2 ? [x0 + 1.1, z0 + t, Math.PI / 2] : [x0 + BLOCK - 1.1, z0 + t, -Math.PI / 2];
        const v = r();
        if (t === 3 || v < 0.3) add('lamp', x, z, rot + Math.PI / 2, 1);
        else if (v < 0.42) add('hydrant', x, z);
        else if (v < 0.58) add('bin', x, z);
        else if (v < 0.7) add('bench', x, z, rot, 1);
        else if (v < 0.78) add('cone', x, z);
        if (r() < 0.75) add('person', x + (r() - 0.5) * 2, z + (r() - 0.5) * 2);
      }
    }
    const lots4 = [[-6.5, -6.5], [6.5, -6.5], [-6.5, 6.5], [6.5, 6.5]];
    const yard = (x, z, n) => { for (let i = 0; i < n; i++) add(r() < 0.6 ? 'bush' : 'person', x + (r() - 0.5) * 3, z + (r() - 0.5) * 3); };
    if (type === 'landmark') {
      add('landmark', cx, cz, 0, 1);
      for (const [dx, dz] of [[-12, -12], [12, -12], [-12, 12], [12, 12]]) add('tree', cx + dx, cz + dz);
      for (let i = 0; i < 18; i++) add('person', cx + (r() - 0.5) * 26, cz + (r() < 0.5 ? -1 : 1) * (13 + r()));
    } else if (type === 'downtown') {
      if (r() < 0.35) { add('tower', cx, cz, (r() * 4 | 0) * Math.PI / 2, 0.95 + r() * 0.1); for (const [dx, dz] of lots4) add('bush', cx + dx * 1.9, cz + dz * 1.9); }
      else for (const [dx, dz] of lots4) { add(r() < 0.5 ? 'office' : 'apartment', cx + dx, cz + dz, (r() * 4 | 0) * Math.PI / 2, 0.92 + r() * 0.08); }
    } else if (type === 'shops') {
      for (const [dx, dz] of lots4) { if (r() < 0.82) add('shop', cx + dx, cz + dz, (r() * 4 | 0) * Math.PI / 2, 0.92 + r() * 0.06); else { add('kiosk', cx + dx, cz + dz); yard(cx + dx, cz + dz, 4); } }
    } else if (type === 'res') {
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
        const x = cx + i * 9, z = cz + j * 9;
        if (i === 0 && j === 0 && r() < 0.5) { add('tree', x, z); add('bench', x + 2, z + 2); continue; }
        add('house', x, z, (r() * 4 | 0) * Math.PI / 2, 0.88 + r() * 0.1);
        if (r() < 0.5) add(r() < 0.5 ? 'bush' : 'tree', x + (r() < 0.5 ? -4.6 : 4.6), z + (r() - 0.5) * 6);
      }
    } else if (type === 'park') {
      add('fountain', cx, cz, 0, 1);
      for (let i = 0; i < 16; i++) { const a = r() * Math.PI * 2, d = 6 + r() * 7.5; add(r() < 0.3 ? 'pine' : 'tree', cx + Math.cos(a) * d, cz + Math.sin(a) * d); }
      for (let i = 0; i < 10; i++) { const a = r() * Math.PI * 2, d = 4 + r() * 9; add('bush', cx + Math.cos(a) * d, cz + Math.sin(a) * d); }
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; add('bench', cx + Math.cos(a) * 4.6, cz + Math.sin(a) * 4.6, -a, 1); }
      for (let i = 0; i < 16; i++) { const a = r() * Math.PI * 2, d = 3.6 + r() * 9; add('person', cx + Math.cos(a) * d, cz + Math.sin(a) * d); }
    } else if (type === 'plaza') {
      add('fountain', cx, cz, 0, 1);
      for (const [dx, dz] of lots4) { add('kiosk', cx + dx * 1.3, cz + dz * 1.3, Math.atan2(-dx, -dz)); add('tree', cx + dx * 0.75, cz + dz * 1.6); }
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; add('bench', cx + Math.cos(a) * 5.4, cz + Math.sin(a) * 5.4, -a, 1); }
      for (let i = 0; i < 30; i++) add('person', cx + (r() - 0.5) * 24, cz + (r() - 0.5) * 24);
      for (let i = 0; i < 6; i++) add('cone', cx + (r() - 0.5) * 22, cz + (r() - 0.5) * 22);
    } else if (type === 'parking') {
      for (let row = 0; row < 4; row++) for (let c = 0; c < 6; c++) {
        if (r() < 0.2) continue;
        const k = r() < 0.12 ? 'van' : r() < 0.1 ? 'taxi' : 'car';
        add(k, x0 + 4 + c * 4.4, z0 + 5 + row * 6.6, Math.PI / 2 + (r() < 0.5 ? Math.PI : 0), 1);
      }
      if (r() < 0.6) add('bus', cx, z0 + BLOCK - 3.2, 0, 1);
      for (let i = 0; i < 6; i++) add('person', x0 + 3 + r() * 24, z0 + 3 + r() * 24);
    }
  }
  // parked cars along every road (both kerbs) and traffic in the lanes
  for (let k = 0; k <= NB; k++) {
    const c = roadC(k);
    for (let seg = 0; seg < NB; seg++) {
      const a0 = roadC(seg) + ROAD / 2 + 3, a1 = roadC(seg + 1) - ROAD / 2 - 3;
      for (let t = a0; t < a1; t += 6 + r() * 3) {
        if (r() < 0.45) continue;
        const side = r() < 0.5 ? -1 : 1, kind = r() < 0.1 ? 'van' : r() < 0.08 ? 'taxi' : 'car';
        if (r() < 0.5) add(kind, c + side * 4.4, t, Math.PI / 2, 1); else add(kind, t, c + side * 4.4, 0, 1);
      }
    }
    // moving traffic: along x on road z=c and along z on road x=c
    for (let i = 0; i < 3; i++) {
      for (const axis of ['x', 'z']) {
        const dir = r() < 0.5 ? 1 : -1, lane = dir * 1.8 * (axis === 'x' ? 1 : -1);
        const kind = r() < 0.12 ? 'bus' : r() < 0.18 ? 'taxi' : r() < 0.15 ? 'van' : 'car';
        movers.push({ kind, axis, line: c + lane, dir, t: -HALF + r() * HALF * 2, speed: (kind === 'bus' ? 6 : 8) + r() * 5, s: 1 });
      }
    }
  }
  // strollers: people pacing along sidewalks
  for (let i = 0; i < 70; i++) {
    const k = 1 + ((r() * (NB - 1)) | 0), axis = r() < 0.5 ? 'x' : 'z', side = r() < 0.5 ? -1 : 1;
    movers.push({ kind: 'person', axis, line: roadC(k) + side * (ROAD / 2 + 1.1 + r() * 0.6), dir: r() < 0.5 ? 1 : -1, t: -HALF + r() * HALF * 2, speed: 1.1 + r() * 0.9, s: 0.92 + r() * 0.16 });
  }
  return { cfg, blocks, items, movers };
}
