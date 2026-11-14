// Voragine — procedural city: object kinds (low-poly, vertex coloured, instanced) and the block layout.
// A kind's build() returns its parts: a plain geometry is vertex coloured (part 0 takes the per-instance
// tint; later plain parts glow at night when the kind has `glow`, else they are untinted detail), or a
// tagged part { g, role } where role is 'facade' (textured walls, `fac` names the texture set),
// 'beam' (headlight cones at night), 'water' (animated fountain water) or 'detail' (untinted).
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
function prism(r, len, x, y, color, sy = 1) { const g = new THREE.ConeGeometry(r, len, 4); g.rotateY(Math.PI / 4); g.rotateZ(-Math.PI / 2); g.scale(1, sy, 1); g.translate(x + len / 2, y, 0); return paint(g, color); }
function disc(r, x, y, z, color) { const g = new THREE.CylinderGeometry(r, r, 0.3, 16); g.rotateX(Math.PI / 2); g.translate(x, y, z); return paint(g, color); }
function nose(x, y, z) { const g = new THREE.ConeGeometry(0.07, 0.4, 6); g.rotateX(Math.PI / 2); g.translate(x, y, z); return paint(g, '#ff7b1c'); }
function vault(r, len, y, color) { const g = new THREE.CylinderGeometry(r, r, len, 10, 1, false, 0, Math.PI); g.rotateZ(Math.PI / 2); g.scale(1, 0.35, 1); g.translate(0, y, 0); return paint(g, color); }
const merge = (parts) => mergeGeometries(parts.filter(Boolean));
const hash3 = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };

// organic foliage blob: jittered icosphere, darker underneath (a cheap baked occlusion)
function blob(r, x, y, z, det = 1, jit = 0.16, lo = 0.58) {
  let g = new THREE.IcosahedronGeometry(r, det);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i), k = 1 + (hash3(Math.round(vx * 50), Math.round(vy * 50), Math.round(vz * 50)) - 0.5) * 2 * jit;
    p.setXYZ(i, vx * k, vy * k * 0.92, vz * k);
  }
  g.computeVertexNormals(); g.translate(x, y, z);
  if (g.index) g = g.toNonIndexed(); g.deleteAttribute('uv');
  const n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const t = Math.max(0, Math.min(1, (g.attributes.position.getY(i) - (y - r)) / (2 * r))); const c = lo + (1 - lo) * Math.pow(t, 0.8); a[i * 3] = a[i * 3 + 1] = a[i * 3 + 2] = c; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
// a vertical gradient on any painted part (white top → shade at the bottom)
function shade(g, y0, y1, lo = 0.6) {
  const p = g.attributes.position, c = g.attributes.color;
  for (let i = 0; i < p.count; i++) { const t = Math.max(0, Math.min(1, (p.getY(i) - y0) / (y1 - y0))); const k = lo + (1 - lo) * t; c.setXYZ(i, c.getX(i) * k, c.getY(i) * k, c.getZ(i) * k); }
  return g;
}

// window grid on the four faces of a w×d footprint, floors of fh starting at y0
function windows(w, d, h, y0, fh, color, inset = 0.6, ww = 1.2) {
  const out = [];
  for (let y = y0; y + fh * 0.6 < h; y += fh) {
    for (let x = -w / 2 + inset + ww / 2; x <= w / 2 - inset - ww / 2 + 0.01; x += ww * 2) { out.push(box(ww, fh * 0.55, 0.12, x, y, d / 2 + 0.03, color)); out.push(box(ww, fh * 0.55, 0.12, x, y, -d / 2 - 0.03, color)); }
    for (let z = -d / 2 + inset + ww / 2; z <= d / 2 - inset - ww / 2 + 0.01; z += ww * 2) { out.push(box(0.12, fh * 0.55, ww, w / 2 + 0.03, y, z, color)); out.push(box(0.12, fh * 0.55, ww, -w / 2 - 0.03, y, z, color)); }
  }
  return out;
}

// ---- textured facades (ambientCG CC0, see public/assets/CREDITS.txt): tile size in metres, window grid
export const FAC = {
  glass: { w: 24, h: 30, c: 16, r: 10 },
  white: { w: 24, h: 24, c: 14, r: 8 },
  brick: { w: 21, h: 21, c: 7, r: 7 },
  tower: { w: 21, h: 30, c: 14, r: 10 },
  concrete: { w: 26, h: 26, c: 10, r: 8 },
};
function walls(w, h, d, x, y, z, fac) {
  const F = FAC[fac], e = 0.05;
  const side = (len, ry, ox, oz) => {
    const g = new THREE.PlaneGeometry(len, h), uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * len) / F.w, (y + uv.getY(i) * h) / F.h);
    g.rotateY(ry); g.translate(x + ox, y + h / 2, z + oz);
    return g;
  };
  return [side(w, 0, 0, d / 2 + e), side(w, Math.PI, 0, -d / 2 - e), side(d, Math.PI / 2, w / 2 + e, 0), side(d, -Math.PI / 2, -w / 2 - e, 0)];
}
const facade = (fac, boxes) => ({ role: 'facade', fac, g: mergeGeometries(boxes.flatMap(([w, h, d, x, y, z]) => walls(w, h, d, x, y, z, fac))) });

// rooftop clutter: parapet, AC units, a water tank, antennas
function roof(w, d, y, o = {}) {
  const out = [], pc = o.parapet || '#6b6f78';
  out.push(box(w + 0.3, 0.7, 0.3, 0, y, d / 2, pc), box(w + 0.3, 0.7, 0.3, 0, y, -d / 2, pc), box(0.3, 0.7, d, w / 2, y, 0, pc), box(0.3, 0.7, d, -w / 2, y, 0, pc));
  const ac = o.ac ?? 3;
  for (let i = 0; i < ac; i++) { const x = -w / 2 + 1.6 + ((i * 2.3) % (w - 3)), z = -d / 2 + 1.5 + (i % 2) * 1.6; out.push(box(1.3, 0.9, 1.1, x, y, z, '#a7adb4'), cyl(0.4, 0.4, 0.06, x, y + 0.9, z, '#2b2f36', 10)); }
  if (o.tank) { const [tx, tz] = o.tank; for (const [lx, lz] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) out.push(box(0.15, 1.4, 0.15, tx + lx, y, tz + lz, '#3b3f46')); out.push(cyl(1.15, 1.15, 2.2, tx, y + 1.4, tz, '#7a5a3e', 12), cone(1.3, 0.9, tx, y + 3.6, tz, '#5b4532', 12)); }
  for (const [ax, az, ah] of o.ant || []) out.push(cyl(0.07, 0.1, ah, ax, y, az, '#c8ccd2', 5), box(1.2, 0.06, 0.06, ax, y + ah * 0.7, az, '#c8ccd2'));
  if (o.box) { const [bw, bh, bd, bx, bz] = o.box; out.push(box(bw, bh, bd, bx, y, bz, '#8a8f99')); }
  return out;
}
const blink = (ants, y) => ants.map(([ax, az, ah]) => ball(0.22, ax, y + ah + 0.1, az, '#ff3b2f'));

// cars: headlights + taillights glow, a light cone on the road at night
const carLights = (len, y, wz) => merge([box(0.06, 0.18, 0.42, len / 2 + 0.01, y, wz, '#fff6d5'), box(0.06, 0.18, 0.42, len / 2 + 0.01, y, -wz, '#fff6d5'), box(0.06, 0.16, 0.36, -len / 2 - 0.01, y, wz, '#ff2a2a'), box(0.06, 0.16, 0.36, -len / 2 - 0.01, y, -wz, '#ff2a2a')]);
function beam(x0, w0, len, w1) {
  const g = new THREE.BufferGeometry(), y = 0.06;
  const p = [x0, y, -w0, x0 + len, y, -w1, x0 + len, y, w1, x0, y, -w0, x0 + len, y, w1, x0, y, w0];
  const c = [0.55, 0.5, 0.36, 0, 0, 0, 0, 0, 0, 0.55, 0.5, 0.36, 0, 0, 0, 0.55, 0.5, 0.36];
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); g.computeVertexNormals();
  return { role: 'beam', g };
}
// street lamp light pool on the pavement (night only)
function pool(x, z, r) {
  const g = new THREE.CircleGeometry(r, 20); g.rotateX(-Math.PI / 2); g.translate(x, 0.07, z);
  const p = g.attributes.position, c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const d = Math.hypot(p.getX(i) - x, p.getZ(i) - z) / r, k = Math.max(0, 1 - d) ** 1.6 * 0.3; c[i * 3] = k; c[i * 3 + 1] = k * 0.85; c[i * 3 + 2] = k * 0.55; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return { role: 'pool', g };
}
const carBody = (extra = []) => merge([box(4.2, 0.75, 1.9, 0, 0.3, 0, '#ffffff'), box(2.3, 0.62, 1.7, -0.2, 1.05, 0, '#ffffff'), box(2.1, 0.5, 1.74, -0.2, 1.08, 0, '#1d2633'), box(4.25, 0.12, 1.95, 0, 0.3, 0, '#2a2d33'), ...extra, ...[[-1.35, 0.9], [1.35, 0.9], [-1.35, -0.9], [1.35, -0.9]].map(([x, z]) => wheel(0.36, 0.3, x, z))]);

// Object kinds. r = footprint radius used for "fits in the hole", h = height (for the fall),
// tint = per-instance colours for the white parts, glow = parts that light up at night,
// pick = optional parts of which each instance shows exactly one, ao = height of the darkened base.
export const KINDS = {
  person: { label: 'Pedoni', r: 0.32, h: 1.8, ao: 0.6, tint: ['#e8513d', '#3d7be8', '#f2c230', '#36b37e', '#f2f2f2', '#9b59b6', '#ff8a3d', '#222'],
    build: () => [merge([box(0.22, 0.8, 0.26, -0.13, 0, 0, '#3b4252'), box(0.22, 0.8, 0.26, 0.13, 0, 0, '#3b4252'), box(0.56, 0.66, 0.34, 0, 0.8, 0, '#ffffff'), box(0.14, 0.55, 0.16, -0.36, 0.86, 0, '#ffffff'), box(0.14, 0.55, 0.16, 0.36, 0.86, 0, '#ffffff'), ball(0.2, 0, 1.62, 0, '#f1c7a5', 1), box(0.36, 0.1, 0.36, 0, 1.76, 0, '#4a3426')])] },
  cone: { label: 'Coni', r: 0.28, h: 0.75, tint: ['#ffffff'], build: () => [merge([box(0.6, 0.06, 0.6, 0, 0, 0, '#ff6a00'), cone(0.25, 0.7, 0, 0.05, 0, '#ff6a00'), cyl(0.15, 0.17, 0.12, 0, 0.35, 0, '#ffffff')])] },
  hydrant: { label: 'Idranti', r: 0.3, h: 0.9, tint: ['#d7263d', '#f2c230'], build: () => [merge([cyl(0.2, 0.22, 0.75, 0, 0, 0, '#ffffff'), ball(0.2, 0, 0.78, 0, '#ffffff'), cyl(0.08, 0.08, 0.5, 0, 0.45, 0, '#cccccc')])] },
  bin: { label: 'Cestini', r: 0.36, h: 1, tint: ['#2f7d4f', '#3a5f9e', '#7a7f87'], build: () => [merge([cyl(0.32, 0.28, 0.95, 0, 0, 0, '#ffffff'), cyl(0.34, 0.34, 0.08, 0, 0.95, 0, '#333a44')])] },
  bollard: { label: 'Bitte', r: 0.3, h: 0.7, tint: ['#2b2f36'], build: () => [merge([cyl(0.22, 0.26, 0.55, 0, 0, 0, '#ffffff'), cyl(0.3, 0.3, 0.12, 0, 0.55, 0, '#ffffff')])] },
  lamp: { label: 'Lampioni', r: 0.34, h: 5, ao: 0.4, tint: ['#9aa3ad'], glow: true,
    build: () => [merge([cyl(0.09, 0.12, 4.6, 0, 0, 0, '#ffffff'), cyl(0.16, 0.2, 0.5, 0, 0, 0, '#ffffff'), box(1.1, 0.12, 0.18, 0.45, 4.55, 0, '#ffffff')]), merge([box(0.5, 0.14, 0.3, 0.85, 4.42, 0, '#fff4c4')]), pool(0.85, 0, 4.2)] },
  bench: { label: 'Panchine', r: 0.85, h: 1, ao: 0.3, tint: ['#8a5a3b', '#2f6b4f', '#6b3a2e'], build: () => [merge([box(1.8, 0.1, 0.5, 0, 0.45, 0, '#ffffff'), box(1.8, 0.45, 0.08, 0, 0.55, -0.22, '#ffffff'), box(0.08, 0.45, 0.45, -0.8, 0, 0, '#333'), box(0.08, 0.45, 0.45, 0.8, 0, 0, '#333')])] },
  snowman: { label: 'Pupazzi di neve', r: 0.6, h: 2.1, ao: 0.4, tint: ['#ffffff'],
    build: () => [merge([blob(0.62, 0, 0.55, 0, 1, 0.05, 0.8), blob(0.44, 0, 1.38, 0, 1, 0.05, 0.85), blob(0.3, 0, 1.94, 0, 1, 0.04, 0.9)]), merge([nose(0, 1.95, 0.45), cyl(0.26, 0.26, 0.05, 0, 2.15, 0, '#1b1b1f', 10), cyl(0.17, 0.17, 0.32, 0, 2.18, 0, '#1b1b1f', 10), box(0.9, 0.12, 0.12, 0, 1.6, 0, '#c0392b')])] },
  bush: { label: 'Cespugli', r: 0.75, h: 1.2, ao: 0.5, tint: ['#3f8f3a', '#2f7a40', '#5a9e2f'], build: () => [merge([blob(0.75, 0, 0.55, 0, 1, 0.18), blob(0.5, 0.45, 0.45, 0.2, 1, 0.18)])] },
  snowbush: { label: 'Cespugli', r: 0.75, h: 1.2, ao: 0.5, tint: ['#2f6e45', '#3c7a4a'], build: () => [merge([blob(0.75, 0, 0.5, 0, 1, 0.18), blob(0.5, 0.45, 0.42, 0.2, 1, 0.18)]), { role: 'detail', g: merge([blob(0.6, 0, 0.82, 0, 1, 0.12, 0.92).scale(1, 0.55, 1).translate(0, 0.36, 0)]) }] },
  tree: { label: 'Alberi', r: 1.3, h: 6, ao: 0.8, tint: ['#3e9b47', '#2d8040', '#6aa84f', '#c9802f', '#d64f6a', '#4f9a3a'],
    build: () => [merge([blob(1.45, 0, 3.5, 0), blob(1.05, 0.95, 3.0, 0.35), blob(1.0, -0.8, 3.2, -0.55), blob(0.95, 0.2, 4.6, 0.15), blob(0.8, -0.3, 3.0, 0.9)]), { role: 'detail', g: merge([cyl(0.18, 0.32, 2.8, 0, 0, 0, '#6b4a33', 6)]) }] },
  pine: { label: 'Alberi', r: 1.2, h: 7, ao: 0.8, tint: ['#2a6e45', '#1f5f3c', '#2f7a4a'],
    build: () => [merge([shade(cone(1.55, 2.6, 0, 1.0, 0, '#ffffff', 9), 1, 3.6, 0.55), shade(cone(1.2, 2.4, 0, 2.6, 0, '#ffffff', 9), 2.6, 5, 0.6), shade(cone(0.8, 2.2, 0, 4.2, 0, '#ffffff', 9), 4.2, 6.4, 0.65)]), { role: 'detail', g: cyl(0.18, 0.26, 1.4, 0, 0, 0, '#5b3c28', 6) }] },
  snowpine: { label: 'Abeti', r: 1.2, h: 7.5, ao: 0.8, tint: ['#24603d', '#1d5536', '#2b6b47'],
    build: () => [merge([shade(cone(1.55, 2.6, 0, 1.0, 0, '#ffffff', 9), 1, 3.6, 0.55), shade(cone(1.2, 2.4, 0, 2.6, 0, '#ffffff', 9), 2.6, 5, 0.6), shade(cone(0.8, 2.2, 0, 4.2, 0, '#ffffff', 9), 4.2, 6.4, 0.65)]),
      { role: 'detail', g: merge([cyl(0.18, 0.26, 1.4, 0, 0, 0, '#5b3c28', 6), cone(0.95, 0.9, 0, 2.75, 0, '#f4f8ff', 9), cone(0.7, 0.85, 0, 4.3, 0, '#f4f8ff', 9), cone(0.42, 0.85, 0, 5.6, 0, '#f4f8ff', 9)]) }] },
  kiosk: { label: 'Chioschi', r: 1.7, h: 3.2, ao: 1, tint: ['#e8513d', '#2f9e9e', '#f2a541', '#7f5af0'], glow: true,
    build: () => [merge([box(2.8, 2.4, 2.2, 0, 0, 0, '#f3efe6'), box(3.3, 0.4, 2.8, 0, 2.4, 0, '#ffffff'), box(3.3, 0.25, 0.5, 0, 2.2, 1.35, '#ffffff'), ...[-1.2, -0.4, 0.4, 1.2].map((x, i) => box(0.8, 0.06, 0.9, x, 2.25, 1.55, i % 2 ? '#ffffff' : '#f3efe6'))]), merge([box(2.2, 0.9, 0.05, 0, 1.1, 1.12, '#ffe7a8')])] },
  fountain: { label: 'Fontane', r: 3, h: 2.2, ao: 0.5, tint: ['#d9d4c7'],
    build: () => [merge([cyl(3, 3.1, 0.7, 0, 0, 0, '#ffffff', 18), cyl(2.75, 2.75, 0.12, 0, 0.66, 0, '#9a968c', 18), cyl(0.5, 0.7, 1.4, 0, 0.7, 0, '#ffffff', 10), cyl(1.2, 0.6, 0.3, 0, 1.9, 0, '#ffffff', 12)]),
      { role: 'water', g: merge([cyl(2.62, 2.62, 0.05, 0, 0.6, 0, '#5fb8ec', 24), cyl(1.05, 1.05, 0.04, 0, 2.16, 0, '#7cc8f2', 14), cyl(0.06, 0.16, 1.3, 0, 2.15, 0, '#d6f0ff', 6), cyl(1.25, 1.05, 1.5, 0, 0.66, 0, '#a8dcfa', 14).translate(0, 0, 0)]) }] },
  xtree: { label: 'Alberi di Natale', r: 2.6, h: 11, ao: 0.8, tint: ['#1f5c38'], glow: true,
    build: () => [merge([shade(cone(2.6, 3.4, 0, 0.6, 0, '#ffffff', 11), 0.6, 4, 0.55), shade(cone(2.0, 3.2, 0, 3.0, 0, '#ffffff', 11), 3, 6.2, 0.6), shade(cone(1.3, 3.2, 0, 5.4, 0, '#ffffff', 11), 5.4, 8.6, 0.65), cyl(0.3, 0.4, 0.8, 0, 0, 0, '#5b3c28')]),
      merge([cone(0.45, 0.9, 0, 8.5, 0, '#ffd34a', 5), ...Array.from({ length: 26 }, (_, i) => { const t = i / 26, y = 1 + t * 7.4, rr = 2.5 * (1 - t * 0.85) + 0.05, a = i * 2.4; return ball(0.2, Math.cos(a) * rr, y, Math.sin(a) * rr, ['#ff3b3b', '#ffd34a', '#4ab0ff', '#ffffff'][i % 4]); })])] },
  car: { label: 'Auto', r: 2.15, h: 1.6, ao: 0.5, tint: ['#e63946', '#1d4ed8', '#f4f4f4', '#222831', '#f2c230', '#2a9d8f', '#8d99ae', '#ff7b00'], glow: true,
    build: () => [carBody(), carLights(4.2, 0.62, 0.6), beam(2.1, 0.8, 8, 2.6)] },
  taxi: { label: 'Auto', r: 2.15, h: 1.9, ao: 0.5, tint: ['#ffc21a'], glow: true,
    build: () => [carBody([box(0.8, 0.25, 0.4, -0.2, 1.67, 0, '#111')]), carLights(4.2, 0.62, 0.6), beam(2.1, 0.8, 8, 2.6)] },
  van: { label: 'Furgoni', r: 2.7, h: 2.6, ao: 0.6, tint: ['#f4f4f4', '#2f5d8a', '#c0392b', '#3c763d'], glow: true,
    build: () => [merge([box(5.2, 2.0, 2.1, 0, 0.35, 0, '#ffffff'), box(0.9, 0.9, 2.0, 2.55, 0.35, 0, '#ffffff'), box(0.1, 0.7, 1.9, 2.98, 1.3, 0, '#1d2633'), box(5.25, 0.14, 2.14, 0, 0.35, 0, '#2a2d33'), ...[[-1.8, 1], [1.8, 1], [-1.8, -1], [1.8, -1]].map(([x, z]) => wheel(0.42, 0.3, x, z))]), carLights(6.0, 0.7, 0.7), beam(3.0, 0.9, 9, 2.8)] },
  plow: { label: 'Spazzaneve', r: 2.9, h: 3, ao: 0.6, tint: ['#ff7b00', '#f2c230'], glow: true,
    build: () => [merge([box(4.6, 1.9, 2.2, -0.4, 0.45, 0, '#ffffff'), box(1.6, 1.4, 2.1, 2.2, 0.45, 0, '#ffffff'), box(0.1, 0.8, 1.9, 3.02, 1.1, 0, '#1d2633'), box(0.4, 0.9, 3.2, 3.5, 0.1, 0, '#c8ccd2', 0), box(0.4, 0.3, 0.8, -1, 2.35, 0, '#ff9f1c'), ...[[-1.8, 1.05], [1.4, 1.05], [-1.8, -1.05], [1.4, -1.05]].map(([x, z]) => wheel(0.48, 0.34, x, z))]), carLights(6.0, 1.2, 0.7), beam(3.8, 1.2, 9, 3)] },
  bus: { label: 'Autobus', r: 5, h: 3.4, ao: 0.6, tint: ['#e8513d', '#f2a541', '#2f9e9e'], glow: true,
    build: () => [merge([box(10.5, 2.6, 2.5, 0, 0.45, 0, '#ffffff'), box(10.6, 0.25, 2.55, 0, 3.05, 0, '#e8e8e8'), box(3, 0.4, 1.6, 1.5, 3.3, 0, '#c9ced6'), ...[[-3.5, 1.2], [3.5, 1.2], [-3.5, -1.2], [3.5, -1.2]].map(([x, z]) => wheel(0.5, 0.3, x, z))]),
      merge([box(9.6, 0.9, 2.56, -0.2, 1.8, 0, '#bfe3ff'), box(0.06, 1.2, 2.2, 5.26, 1.5, 0, '#bfe3ff'), box(0.06, 0.2, 0.5, 5.27, 0.75, 0.9, '#fff6d5'), box(0.06, 0.2, 0.5, 5.27, 0.75, -0.9, '#fff6d5'), box(0.06, 0.3, 0.3, -5.27, 0.8, 1, '#ff2a2a'), box(0.06, 0.3, 0.3, -5.27, 0.8, -1, '#ff2a2a')]), beam(5.2, 1, 10, 3)] },
  forklift: { label: 'Muletti', r: 1.4, h: 2.4, ao: 0.4, tint: ['#f2c230', '#e8513d'],
    build: () => [merge([box(2.2, 1.0, 1.3, 0, 0.3, 0, '#ffffff'), box(0.12, 1.3, 1.1, -0.5, 1.3, 0, '#2a2d33'), box(1.3, 0.08, 1.2, -0.2, 2.5, 0, '#ffffff'), ...[[-0.8, 0.65], [0.7, 0.65], [-0.8, -0.65], [0.7, -0.65]].map(([x, z]) => wheel(0.3, 0.26, x, z)), box(0.1, 2.3, 0.9, 1.15, 0.1, 0, '#3b3f46'), box(1.1, 0.06, 0.18, 1.7, 0.15, 0.3, '#3b3f46'), box(1.1, 0.06, 0.18, 1.7, 0.15, -0.3, '#3b3f46')])] },
  container: { label: 'Container', r: 3.2, h: 2.6, ao: 0.5, tint: ['#c0392b', '#1f5fa8', '#2f8f4f', '#e67e22', '#8e9aa6', '#d4ac0d', '#6c3483', '#16a085'],
    build: () => [merge([box(6.1, 2.6, 2.45, 0, 0, 0, '#ffffff'), ...Array.from({ length: 9 }, (_, i) => box(0.1, 2.4, 2.52, -2.6 + i * 0.65, 0.1, 0, '#d7d7d7')), box(0.06, 2.4, 2.3, 3.07, 0.1, 0, '#bdbdbd')])] },
  stack: { label: 'Container', r: 3.4, h: 7.8, ao: 0.8, tint: ['#ffffff'],
    build: () => [merge([[0, '#c0392b'], [2.6, '#1f5fa8'], [5.2, '#e67e22']].flatMap(([y, c], k) => [box(6.1, 2.58, 2.45, k === 1 ? 0.15 : 0, y, 0, c), ...Array.from({ length: 9 }, (_, i) => box(0.08, 2.3, 2.5, -2.6 + i * 0.65 + (k === 1 ? 0.15 : 0), y + 0.14, 0, new THREE.Color(c).multiplyScalar(0.8).getStyle()))]))] },
  stack2: { label: 'Container', r: 3.4, h: 5.2, ao: 0.8, tint: ['#ffffff'],
    build: () => [merge([[0, '#2f8f4f'], [2.6, '#8e9aa6']].flatMap(([y, c], k) => [box(6.1, 2.58, 2.45, k ? -0.2 : 0, y, 0, c), ...Array.from({ length: 9 }, (_, i) => box(0.08, 2.3, 2.5, -2.6 + i * 0.65 + (k ? -0.2 : 0), y + 0.14, 0, new THREE.Color(c).multiplyScalar(0.8).getStyle()))]))] },
  boat: { label: 'Barche', r: 3.4, h: 4.2, ao: 0.2, tint: ['#2f5d8a', '#c0392b', '#2f8f4f', '#f2f2f2'],
    build: () => [merge([box(5.4, 1.2, 2.3, -0.4, 0, 0, '#ffffff'), prism(1.63, 1.4, 2.3, 0.6, '#ffffff', 0.52), box(5.5, 0.15, 2.4, -0.4, 1.2, 0, '#f4f1e6'), box(1.8, 1.4, 1.7, -1.2, 1.35, 0, '#f4f1e6'), box(1.85, 0.4, 1.75, -1.2, 2.2, 0, '#1d2633'), cyl(0.06, 0.06, 2.6, -1.2, 2.75, 0, '#c8ccd2', 4)])] },
  yacht: { label: 'Yacht', r: 5, h: 4.6, ao: 0.2, tint: ['#f4f4f4', '#e9e4d8'],
    build: () => [merge([box(8, 1.4, 3.2, -0.5, 0, 0, '#ffffff'), prism(2.26, 2.4, 3.5, 0.7, '#ffffff', 0.44), box(8.1, 0.2, 3.25, -0.5, 0.45, 0, '#1f5fa8'), box(4.2, 1.2, 2.6, -1.3, 1.4, 0, '#ffffff'), box(4.3, 0.45, 2.65, -1.3, 1.95, 0, '#1d2633'), box(2.2, 0.9, 2.2, -1.8, 2.6, 0, '#ffffff'), cyl(0.06, 0.06, 1.5, -1.8, 3.5, 0, '#c8ccd2', 4)])] },
  house: { label: 'Case', r: 4.6, h: 9, ao: 1.4, tint: ['#f2e3c6', '#e8b4a0', '#cfe0c3', '#f7f3ea', '#c9d6e8', '#f0c987'], glow: true,
    build: () => [merge([box(8, 5.5, 7.5, 0, 0, 0, '#ffffff'), box(8.2, 0.35, 7.7, 0, 0, 0, '#8d8579'), shade(cone(6.4, 3.2, 0, 5.5, 0, '#a2412f', 4).rotateY(Math.PI / 4), 5.5, 8.7, 0.7), box(1.4, 2.2, 0.15, 0, 0, 3.8, '#5b3c28'), box(2, 0.15, 1, 0, 2.3, 4.1, '#7a6e60'), box(0.9, 2, 0.9, 2.5, 6, -1, '#8a5a3b')]), merge(windows(8, 7.5, 5.5, 1.2, 2.6, '#ffe7a8', 1.2, 1.1))] },
  chalet: { label: 'Chalet', r: 4.6, h: 9.5, ao: 1.4, tint: ['#8a5a3b', '#a8703f', '#6b4a33', '#9c6b45'], glow: true,
    build: () => [merge([box(8, 5.5, 7.5, 0, 0, 0, '#ffffff'), box(8.2, 0.6, 7.7, 0, 0, 0, '#7d776e'), box(1.4, 2.2, 0.15, 0, 0, 3.8, '#3b2a1e'), box(8.6, 0.25, 1.4, 0, 3.0, 4.4, '#ffffff'), box(0.9, 2.4, 0.9, 2.5, 6.4, -1, '#7d776e')]),
      merge(windows(8, 7.5, 5.5, 1.2, 2.6, '#ffd08a', 1.2, 1.1)),
      { role: 'detail', g: merge([cone(6.6, 3.8, 0, 5.4, 0, '#f4f8ff', 4).rotateY(Math.PI / 4), box(1.0, 0.3, 1.0, 2.5, 8.8, -1, '#f4f8ff')]) }] },
  shop: { label: 'Negozi', r: 6.2, h: 7, ao: 1.4, tint: ['#e9ecef', '#f8d9c4', '#d4e4f7', '#f3e8c8'], glow: true,
    build: () => [merge([box(12, 6, 10, 0, 0, 0, '#ffffff'), box(12.4, 0.5, 10.4, 0, 6, 0, '#5c6370'), ...[-4.5, -1.5, 1.5, 4.5].map((x, i) => box(3, 0.35, 1.6, x, 3.2, 5.6, i % 2 ? '#f4f1e6' : '#e8513d')), box(3, 1.2, 0.2, 3, 4.4, 5.1, '#2f9e9e'), ...roof(12, 10, 6.5, { ac: 3, parapet: '#5c6370' })]), merge([box(9.5, 2.6, 0.12, 0, 0.3, 5.03, '#bfe3ff'), ...windows(12, 10, 6, 4.2, 3, '#ffe7a8', 1.4, 1.3).slice(4)])] },
  warehouse: { label: 'Magazzini', r: 8.6, h: 10, ao: 1.6, tint: ['#9fb3c8', '#c9ced6', '#b6c4a8', '#c8a98a'], glow: true,
    build: () => [merge([box(16, 8, 12, 0, 0, 0, '#ffffff'), ...Array.from({ length: 24 }, (_, i) => box(0.12, 7.8, 12.1, -7.6 + i * 0.66, 0, 0, '#e2e2e2')), box(16.4, 0.5, 12.4, 0, 8, 0, '#6b6f78'), vault(6.1, 16.2, 8.2, '#a7adb4'), box(5, 5, 0.2, -3, 0, 6.05, '#4a4f58'), box(5, 5, 0.2, 3.5, 0, 6.05, '#4a4f58')]), merge([box(14, 0.6, 0.1, 0, 6.6, 6.08, '#ffe7a8'), box(14, 0.6, 0.1, 0, 6.6, -6.08, '#ffe7a8')])] },
  apartment: { label: 'Palazzi', r: 6.4, h: 21, ao: 2.4, tint: ['#e3d5c4', '#cfc6bb', '#bcc9d4', '#e8c8a8', '#d9c6e0'], glow: true, pick: [1, 2],
    build: () => [merge([box(12, 20, 12, 0, 0, 0, '#ffffff'), box(12.4, 0.5, 12.4, 0, 0, 0, '#6b6f78'), ...roof(12, 12, 20, { ac: 4, tank: [3, -2.5], ant: [[-4, 4, 4]], box: [3, 1.8, 3, 2, 2] })]),
      facade('white', [[12, 20, 12, 0, 0, 0]]), facade('brick', [[12, 20, 12, 0, 0, 0]]), merge(blink([[-4, 4, 4]], 20))] },
  office: { label: 'Uffici', r: 6.4, h: 32, ao: 2.4, tint: ['#9fb3c8', '#7f95ad', '#b8c2cc', '#8fa89a'], glow: true, pick: [1, 2],
    build: () => [merge([box(12, 30, 12, 0, 0, 0, '#ffffff'), box(10, 2, 10, 0, 30, 0, '#5c6370'), box(12.4, 1.2, 12.4, 0, 0, 0, '#4a4f58'), ...roof(12, 12, 30, { ac: 2, ant: [[3, 3, 5], [-3.5, -3, 3]] })]),
      facade('glass', [[12, 30, 12, 0, 0, 0]]), facade('concrete', [[12, 30, 12, 0, 0, 0]]), merge(blink([[3, 3, 5], [-3.5, -3, 3]], 32))] },
  tower: { label: 'Grattacieli', r: 10.5, h: 60, ao: 3, tint: ['#7d93b2', '#8aa1a8', '#a3a9c2', '#6f8faf'], glow: true, pick: [1, 2],
    build: () => [merge([box(20, 26, 20, 0, 0, 0, '#ffffff'), box(16, 18, 16, 0, 26, 0, '#ffffff'), box(11, 12, 11, 0, 44, 0, '#ffffff'), box(20.6, 1.6, 20.6, 0, 0, 0, '#3b3f46'), cyl(0.3, 0.3, 6, 0, 56, 0, '#d0d4da'), ...roof(20, 20, 26, { ac: 6, tank: [-6, 6] }).slice(4), ...roof(16, 16, 44, { ac: 3 }).slice(4), ...roof(11, 11, 56, { ac: 1, ant: [[3, 3, 4]] })]),
      facade('tower', [[20, 26, 20, 0, 0, 0], [16, 18, 16, 0, 26, 0], [11, 12, 11, 0, 44, 0]]), facade('glass', [[20, 26, 20, 0, 0, 0], [16, 18, 16, 0, 26, 0], [11, 12, 11, 0, 44, 0]]), merge(blink([[0, 0, 6], [3, 3, 4]], 56))] },
  crane: { label: 'Gru', r: 9, h: 40, ao: 1.5, tint: ['#e94f1d', '#1f5fa8', '#f2c230'], glow: true,
    build: () => [merge([...[[-5, -4], [5, -4], [-5, 4], [5, 4]].map(([x, z]) => box(1, 26, 1, x, 0, z, '#ffffff')), box(11, 1.2, 1, 0, 12, -4, '#ffffff'), box(11, 1.2, 1, 0, 12, 4, '#ffffff'), box(1.2, 2, 10, -5, 24, 0, '#ffffff'), box(1.2, 2, 10, 5, 24, 0, '#ffffff'),
      box(1.4, 1.6, 34, 0, 26, 6, '#ffffff'), box(0.5, 10, 0.5, 0, 26, -4, '#ffffff'), box(3, 2.4, 2.6, 0, 23.2, 8, '#f4f1e6'), box(4, 3, 4, 0, 27.6, -8, '#5c6370'), cyl(0.06, 0.06, 18, 0, 6, 14, '#2b2f36', 4), box(2.4, 0.5, 2, 0, 5.5, 14, '#2b2f36'), ...[[-5, -4], [5, -4], [-5, 4], [5, 4]].map(([x, z]) => box(1.6, 0.8, 2.2, x, 0, z, '#3b3f46'))]),
      merge([ball(0.3, 0, 27.8, 22.8, '#ff3b2f'), ball(0.3, 0, 31, -8, '#ff3b2f'), box(2.9, 1, 0.1, 0, 24.2, 9.32, '#ffe7a8')])] },
  ship: { label: 'Navi', r: 13.5, h: 22, ao: 1, tint: ['#ffffff'], glow: true,
    build: () => [merge([box(24, 6, 9, -1, 0, 0, '#8a2a22'), prism(6.36, 5, 11, 3, '#8a2a22', 0.67), box(24.2, 0.8, 9.1, -1, 0, 0, '#1b1b1f'), box(24.4, 0.4, 9.2, -1, 6, 0, '#e9e4d8'),
      box(5, 9, 8, -10, 6.4, 0, '#f4f1e6'), box(5.2, 1.2, 8.4, -10, 15.4, 0, '#d0d4da'), box(5.1, 0.8, 8.1, -10, 13.6, 0, '#1d2633'), cyl(0.9, 1.1, 4, -11, 16.6, 0, '#c0392b', 10),
      ...[[-3, '#1f5fa8'], [1.5, '#e67e22'], [6, '#2f8f4f'], [10.5, '#c0392b']].flatMap(([x, c], i) => [box(4, 2.5, 8, x, 6.4, 0, c), ...(i % 2 ? [box(4, 2.5, 8, x, 8.9, 0, '#8e9aa6')] : [])])]),
      merge([...[0, 1, 2, 3, 4].map((i) => box(0.6, 0.6, 0.1, -12 + i * 1.1, 10, 4.06, '#ffe7a8')), ...[0, 1, 2, 3, 4].map((i) => box(0.6, 0.6, 0.1, -12 + i * 1.1, 10, -4.06, '#ffe7a8')), ball(0.35, -10, 17.6, 0, '#ff3b2f')])] },
  bell: { label: 'Campanili', r: 7.5, h: 52, ao: 2.6, tint: ['#d9cbb0'], glow: true,
    build: () => [merge([box(14, 3, 14, 0, 0, 0, '#c9bba0'), box(9, 30, 9, 0, 3, 0, '#ffffff'), box(9.8, 1, 9.8, 0, 18, 0, '#e9e1cf'), box(9.8, 1, 9.8, 0, 33, 0, '#e9e1cf'),
      ...[[-3, 4.55], [3, 4.55]].flatMap(([x, z]) => [box(2.2, 6, 0.3, x, 35, z, '#2a2420'), box(2.2, 6, 0.3, x, 35, -z, '#2a2420'), box(0.3, 6, 2.2, z, 35, x, '#2a2420'), box(0.3, 6, 2.2, -z, 35, x, '#2a2420')]),
      box(9, 9, 9, 0, 34, 0, '#ffffff'), box(9.8, 1, 9.8, 0, 43, 0, '#e9e1cf'), cone(6.6, 8, 0, 44, 0, '#5e7a6a', 4).rotateY(Math.PI / 4), cyl(0.15, 0.15, 3, 0, 51, 0, '#c9a24a'), disc(2.2, 0, 27, 4.65, '#f4f1e6')]),
      merge([cyl(0.9, 1.5, 1.8, 0, 37, 0, '#ffcf6a', 10), ...windows(9, 9, 30, 6, 6, '#ffe7a8', 3, 1)])] },
  landmark: { label: 'Monumenti', r: 14, h: 95, ao: 3, tint: ['#e9e4d8'], glow: true,
    build: () => [merge([box(26, 4, 26, 0, 0, 0, '#ffffff'), box(16, 40, 16, 0, 4, 0, '#ffffff'), box(12, 24, 12, 0, 44, 0, '#ffffff'), box(8, 14, 8, 0, 68, 0, '#ffffff'), cone(4.5, 12, 0, 82, 0, '#c9a24a', 4).rotateY(Math.PI / 4), box(17, 1, 17, 0, 43.5, 0, '#cfc8b6'), box(13, 1, 13, 0, 67.5, 0, '#cfc8b6')]),
      merge([...windows(16, 16, 44, 6, 3, '#ffe7a8', 0.8, 1.2), ...windows(12, 12, 68, 46, 3, '#ffe7a8', 0.8, 1.2)])] },
};
// building kinds report the radius of their real footprint; points grow with the area
for (const [id, k] of Object.entries(KINDS)) { k.id = id; k.pts = Math.max(0.35, k.r * k.r * 3); k.ao = k.ao ?? Math.min(2.5, k.h * 0.3); }
// kinds that matter for the "now you can swallow…" hints, in unlock order
export const MILESTONES = ['person', 'bench', 'tree', 'car', 'van', 'house', 'bus', 'shop', 'apartment', 'tower', 'landmark'];
// "big moments": swallowing one of these slows time down for a beat
export const BIG = new Set(['tower', 'landmark', 'crane', 'ship', 'bell', 'office']);

// pal = ground palette; sub = kind substitutions for the theme
export const CITIES = {
  centro: { name: 'Centro Città', sub: 'Viali, uffici e un monumento in piazza', seed: 11, sky: '#9ec9f0', fog: '#bcd8f0', sun: '#fff2dc', amb: 0.62, night: false, landmark: 'landmark',
    pal: { grass: '#6fae55', asph: '#41444c', walk: '#c9c4ba', conc: '#b3afa6', line: '#f4f1e6', tile: '#d8cfbf', water: '#3c7fae' }, outer: '#5f9a4a', hill: '#4f8b45',
    w: { downtown: 0.32, shops: 0.2, plaza: 0.14, park: 0.14, parking: 0.1, res: 0.1 } },
  giardino: { name: 'Quartiere Giardino', sub: 'Villette, parchi e il tramonto', seed: 27, sky: '#f7b98b', fog: '#f3c9a6', sun: '#ffc48a', amb: 0.55, night: false, sunset: true, landmark: false,
    pal: { grass: '#7aa452', asph: '#4a4648', walk: '#d1c3b0', conc: '#b8aa98', line: '#f4ead2', tile: '#d9c4a8', water: '#4a7fa0' }, outer: '#6a9a48', hill: '#5a8a42',
    w: { res: 0.44, park: 0.24, shops: 0.14, plaza: 0.1, parking: 0.08 } },
  notte: { name: 'Città di Notte', sub: 'Neon, finestre accese e traffico notturno', seed: 43, sky: '#0b1230', fog: '#121a3a', sun: '#9fb2ff', amb: 0.95, night: true, landmark: 'landmark',
    pal: { grass: '#22402e', asph: '#24272f', walk: '#585b66', conc: '#464a55', line: '#d9d9b0', tile: '#545867', water: '#14263e' }, outer: '#16261d', hill: '#1a2a26',
    w: { downtown: 0.36, shops: 0.22, plaza: 0.14, park: 0.1, parking: 0.12, res: 0.06 } },
  porto: { name: 'Porto', sub: 'Gru, container e navi in banchina', seed: 61, sky: '#9fcdef', fog: '#c9e0ee', sun: '#fff1da', amb: 0.6, night: false, landmark: 'ship', docks: true,
    pal: { grass: '#7aa35a', asph: '#45474d', walk: '#bdb8ae', conc: '#a9a59c', line: '#f4f1e6', tile: '#cfc6b6', water: '#2f78a8' }, outer: '#3a7db0', hill: '#5d8f55',
    w: { yard: 0.34, shops: 0.14, res: 0.12, parking: 0.12, plaza: 0.1, downtown: 0.1, park: 0.08 } },
  neve: { name: 'Neve', sub: 'Chalet, abeti innevati e pista di pattinaggio', seed: 83, sky: '#b9cfe6', fog: '#e2ebf4', sun: '#fff0e2', amb: 0.72, night: false, snow: true, landmark: 'bell',
    pal: { grass: '#eef3f8', asph: '#5a5e66', walk: '#d9dee5', conc: '#cdd3db', line: '#f8f8f2', tile: '#e1e5ea', water: '#a9d4ec' }, outer: '#e8eef5', hill: '#dfe7f0',
    sub: { house: 'chalet', tree: 'snowpine', pine: 'snowpine', fountain: 'xtree', bush: 'snowbush', van: 'plow' },
    w: { res: 0.36, park: 0.2, shops: 0.16, plaza: 0.12, rink: 0.08, parking: 0.08 } },
};

export const ROAD = 12, BLOCK = 30, PITCH = ROAD + BLOCK, NB = 7;
export const HALF = (NB * PITCH) / 2; // road centres at -HALF + k*PITCH, k = 0..NB
export const roadC = (k) => -HALF + k * PITCH;

function pick(r, w) { let t = r() * Object.values(w).reduce((a, b) => a + b, 0); for (const [k, v] of Object.entries(w)) { if ((t -= v) <= 0) return k; } return Object.keys(w)[0]; }

// Lay out the city. Returns { blocks, items: [{kind,x,z,rot,s}], movers: [{kind,…,path}] }
export function layoutCity(cityId, seed) {
  const cfg = CITIES[cityId] || CITIES.centro;
  const r = rng(seed ?? cfg.seed);
  const items = [], movers = [], blocks = [];
  const sub = cfg.sub || {};
  const add = (kind, x, z, rot = r() * Math.PI * 2, s = 0.92 + r() * 0.16) => items.push({ kind: sub[kind] || kind, x, z, rot, s });
  const mid = Math.floor(NB / 2);
  for (let bx = 0; bx < NB; bx++) for (let bz = 0; bz < NB; bz++) {
    const x0 = roadC(bx) + ROAD / 2, z0 = roadC(bz) + ROAD / 2, cx = x0 + BLOCK / 2, cz = z0 + BLOCK / 2;
    let type = pick(r, cfg.w);
    if (cfg.docks && bz === NB - 1) type = 'dock';
    if (cfg.landmark && bx === mid && bz === (cfg.landmark === 'ship' ? NB - 1 : mid)) type = 'landmark';
    blocks.push({ bx, bz, x0, z0, type });
    // sidewalk furniture on all four sides
    for (let i = 0; i < 4; i++) {
      for (let t = 3; t < BLOCK - 2; t += 7.5) {
        const [x, z, rot] = i === 0 ? [x0 + t, z0 + 1.1, 0] : i === 1 ? [x0 + t, z0 + BLOCK - 1.1, Math.PI] : i === 2 ? [x0 + 1.1, z0 + t, Math.PI / 2] : [x0 + BLOCK - 1.1, z0 + t, -Math.PI / 2];
        const v = r();
        if (t === 3 || v < 0.3) add('lamp', x, z, rot + Math.PI / 2, 1);
        else if (type === 'dock') { if (v < 0.75) add('bollard', x, z); }
        else if (v < 0.42) add(cfg.snow && v < 0.36 ? 'snowman' : 'hydrant', x, z);
        else if (v < 0.58) add('bin', x, z);
        else if (v < 0.7) add('bench', x, z, rot, 1);
        else if (v < 0.78) add('cone', x, z);
        if (r() < 0.75) add('person', x + (r() - 0.5) * 2, z + (r() - 0.5) * 2);
      }
    }
    const lots4 = [[-6.5, -6.5], [6.5, -6.5], [-6.5, 6.5], [6.5, 6.5]];
    const yard = (x, z, n) => { for (let i = 0; i < n; i++) add(r() < 0.6 ? 'bush' : 'person', x + (r() - 0.5) * 3, z + (r() - 0.5) * 3); };
    if (type === 'landmark') {
      if (cfg.landmark === 'ship') { add('ship', cx, cz, 0, 1); continue; }
      add(cfg.landmark, cx, cz, 0, 1);
      for (const [dx, dz] of [[-12, -12], [12, -12], [-12, 12], [12, 12]]) add('tree', cx + dx, cz + dz);
      for (let i = 0; i < 18; i++) add('person', cx + (r() - 0.5) * 26, cz + (r() < 0.5 ? -1 : 1) * (13 + r()));
    } else if (type === 'dock') {
      const n = r();
      if (n < 0.4) { add('yacht', cx, cz - 6, r() < 0.5 ? 0 : Math.PI, 1); add('boat', cx - 6.5, cz + 6, 0, 1); add('boat', cx + 6.5, cz + 6, Math.PI, 1); }
      else if (n < 0.75) { add('boat', cx - 6, cz - 6, 0, 1); add('boat', cx + 6, cz - 6, Math.PI, 1); add('yacht', cx, cz + 6, 0, 1); }
      else { add('yacht', cx - 4, cz - 6, 0, 1); add('yacht', cx + 4, cz + 6, Math.PI, 1); }
    } else if (type === 'yard') {
      if (r() < 0.4) {
        add('crane', cx, cz, (r() * 2 | 0) * Math.PI, 1);
        for (const [dx, dz] of lots4) add('container', cx + dx * 1.45, cz + dz * 1.65, 0, 1);
        for (let i = 0; i < 5; i++) add('person', cx + (r() - 0.5) * 22, cz + (r() - 0.5) * 22);
      } else if (r() < 0.45) {
        add('warehouse', cx, cz - 2.5, 0, 1);
        add('forklift', cx - 7, cz + 9.5, r() * 6); add('forklift', cx + 6, cz + 10, r() * 6); add('container', cx + 1, cz + 10, 0, 1);
        for (let i = 0; i < 4; i++) add('person', cx + (r() - 0.5) * 22, cz + 8 + r() * 4);
      } else {
        for (const x of [-8, 0, 8]) for (const z of [-8.5, -3, 3, 8.5]) {
          const v = r();
          if (v < 0.22) add('stack', cx + x, cz + z, r() < 0.5 ? 0 : Math.PI, 1);
          else if (v < 0.42) add('stack2', cx + x, cz + z, r() < 0.5 ? 0 : Math.PI, 1);
          else if (v < 0.8) add('container', cx + x, cz + z, r() < 0.5 ? 0 : Math.PI, 1);
          else if (v < 0.88) add('forklift', cx + x, cz + z, r() * 6, 1);
          else add('person', cx + x, cz + z);
        }
      }
    } else if (type === 'rink') {
      for (let i = 0; i < 22; i++) add('person', cx + (r() - 0.5) * 18, cz + (r() - 0.5) * 14);
      for (let i = 0; i < 4; i++) add('bench', cx - 9 + i * 6, cz + 10.5, Math.PI, 1);
      add('kiosk', cx - 10, cz - 10.5, 0); add('kiosk', cx + 10, cz - 10.5, 0);
      add('snowman', cx - 12, cz + 11); add('snowman', cx + 12, cz + 11);
    } else if (type === 'downtown') {
      if (r() < 0.35) { add('tower', cx, cz, (r() * 4 | 0) * Math.PI / 2, 0.95 + r() * 0.1); for (const [dx, dz] of lots4) add('bush', cx + dx * 1.9, cz + dz * 1.9); }
      else for (const [dx, dz] of lots4) { add(r() < 0.5 ? 'office' : 'apartment', cx + dx, cz + dz, (r() * 4 | 0) * Math.PI / 2, 0.92 + r() * 0.08); }
    } else if (type === 'shops') {
      for (const [dx, dz] of lots4) { if (r() < 0.82) add('shop', cx + dx, cz + dz, (r() * 4 | 0) * Math.PI / 2, 0.92 + r() * 0.06); else { add('kiosk', cx + dx, cz + dz); yard(cx + dx, cz + dz, 4); } }
    } else if (type === 'res') {
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
        const x = cx + i * 9, z = cz + j * 9;
        if (i === 0 && j === 0 && r() < 0.5) { add(cfg.snow && r() < 0.5 ? 'snowman' : 'tree', x, z); add('bench', x + 2, z + 2); continue; }
        add('house', x, z, (r() * 4 | 0) * Math.PI / 2, 0.88 + r() * 0.1);
        if (r() < 0.5) add(r() < 0.5 ? 'bush' : 'tree', x + (r() < 0.5 ? -4.6 : 4.6), z + (r() - 0.5) * 6);
      }
    } else if (type === 'park') {
      add('fountain', cx, cz, 0, 1);
      for (let i = 0; i < 16; i++) { const a = r() * Math.PI * 2, d = 6 + r() * 7.5; add(r() < 0.3 ? 'pine' : 'tree', cx + Math.cos(a) * d, cz + Math.sin(a) * d); }
      for (let i = 0; i < 10; i++) { const a = r() * Math.PI * 2, d = 4 + r() * 9; add(cfg.snow && r() < 0.3 ? 'snowman' : 'bush', cx + Math.cos(a) * d, cz + Math.sin(a) * d); }
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
        let kind = r() < 0.12 ? 'bus' : r() < 0.18 ? 'taxi' : r() < 0.15 ? 'van' : 'car';
        kind = sub[kind] || kind;
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
