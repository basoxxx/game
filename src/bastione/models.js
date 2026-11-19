// Bastione — cartoon 3D models from primitives: the 9 towers (each tier and specialisation changes
// the model), the blue keep, the red spawn gates, build pads, figure accessories and map props.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const MATS = new Map();
export function mat(color, o = {}) {
  const k = color + JSON.stringify(o);
  if (!MATS.has(k)) MATS.set(k, new THREE.MeshLambertMaterial({ color, flatShading: !!o.flat, emissive: o.em || '#000000', emissiveIntensity: o.ei ?? 1, transparent: !!o.op, opacity: o.op ?? 1, side: o.ds ? THREE.DoubleSide : THREE.FrontSide }));
  return MATS.get(k);
}
export function disposeMats() { for (const m of MATS.values()) m.dispose(); MATS.clear(); }
const TIER_STONE = ['#b98a5a', '#cfc8bb', '#f2eee6'];
const TRIM = ['#7a5232', '#8f8a80', '#e6b422'];

function mesh(geo, m, x = 0, y = 0, z = 0, sh = true) { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = sh; o.receiveShadow = true; return o; }

// a tower: Group with userData { head (aims), barrel (recoil), spin (rotates), glow (pulses), top (y of the muzzle) }
export function towerModel(def, tier, spec) {
  const g = new THREE.Group(), id = def.id, s = 1 + tier * 0.08 + (spec >= 0 ? 0.14 : 0), lv = spec >= 0 ? 2 : tier;
  const stone = mat(TIER_STONE[lv], { flat: true }), trim = mat(spec >= 0 ? (spec ? '#ff7a1a' : '#4ade80') : TRIM[lv]);
  const accent = mat(def.color);
  const baseH = 0.5 + lv * 0.18;
  g.add(mesh(new THREE.CylinderGeometry(1.05, 1.2, baseH, 8), stone, 0, baseH / 2, 0));
  g.add(mesh(new THREE.CylinderGeometry(1.12, 1.12, 0.12, 8), trim, 0, baseH, 0));
  const ud = g.userData = { head: null, barrel: null, spin: null, glow: null, top: 2 };
  const head = new THREE.Group(); head.position.y = baseH; g.add(head); ud.head = head;
  if (id === 'balestra') {
    const wood = mat('#8a5a34', { flat: true });
    const legs = 4, h = 1.3 + lv * 0.25;
    for (let i = 0; i < legs; i++) { const a = (i / legs) * Math.PI * 2 + Math.PI / 4; const l = mesh(new THREE.CylinderGeometry(0.09, 0.12, h, 5), wood, Math.cos(a) * 0.6, baseH + h / 2, Math.sin(a) * 0.6); g.add(l); }
    const plat = mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.16, 8), wood, 0, baseH + h, 0); g.add(plat);
    head.position.y = baseH + h + 0.08;
    const bow = new THREE.Group(); head.add(bow);
    bow.add(mesh(new THREE.BoxGeometry(0.22, 0.2, 1.1), mat('#6b4226'), 0, 0.35, 0.1));
    const arc = mesh(new THREE.TorusGeometry(0.55, 0.06, 5, 12, Math.PI), mat('#5b3a1e'), 0, 0.35, 0.55); arc.rotation.x = Math.PI / 2; bow.add(arc);
    if (spec === 0) { const b2 = bow.clone(); b2.position.x = 0.35; bow.position.x = -0.35; head.add(b2); }
    if (spec === 1) bow.add(mesh(new THREE.SphereGeometry(0.16, 8, 6), mat('#ff7a1a', { em: '#ff5a00', ei: 0.8 }), 0, 0.4, 0.75));
    const roofY = baseH + h + 1.25;
    const roof = mesh(new THREE.ConeGeometry(1.15, 0.9 + lv * 0.15, 8), accent, 0, roofY, 0); g.add(roof);
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + Math.PI / 4; g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.1, 4), wood, Math.cos(a) * 0.82, roofY - 0.85, Math.sin(a) * 0.82)); }
    ud.barrel = bow; ud.top = baseH + h + 0.5;
  } else if (id === 'cannone') {
    const body = mesh(new THREE.CylinderGeometry(0.85, 0.95, 0.9 + lv * 0.2, 10), stone, 0, 0.45 + lv * 0.1, 0); head.add(body);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; head.add(mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), stone, Math.cos(a) * 0.78, 1.05 + lv * 0.2, Math.sin(a) * 0.78)); }
    const pivot = new THREE.Group(); pivot.position.y = 1.15 + lv * 0.2; head.add(pivot);
    pivot.add(mesh(new THREE.SphereGeometry(0.45, 10, 8), mat('#3d4452'), 0, 0, 0));
    const barrel = new THREE.Group(); pivot.add(barrel);
    const n = spec === 1 ? 3 : 1, r = spec === 0 ? 0.36 : 0.24 + lv * 0.03;
    for (let i = 0; i < n; i++) { const b = mesh(new THREE.CylinderGeometry(r * 0.9, r, 1.3 + (spec === 0 ? 0.3 : 0), 10), mat('#2f3542'), (i - (n - 1) / 2) * 0.32, 0.12, 0.7); b.rotation.x = Math.PI / 2 - 0.25; barrel.add(b); barrel.add(mesh(new THREE.TorusGeometry(r, 0.06, 5, 10), trim, (i - (n - 1) / 2) * 0.32, 0.28, 1.32)); }
    ud.barrel = barrel; ud.top = 1.6 + lv * 0.2;
  } else if (id === 'gelo') {
    head.add(mesh(new THREE.CylinderGeometry(0.55, 0.75, 1.3 + lv * 0.3, 6), mat('#cfe8f7', { flat: true }), 0, 0.65 + lv * 0.15, 0));
    const cry = mesh(new THREE.OctahedronGeometry(0.55 + lv * 0.1, 0), mat('#7fd7ff', { flat: true, em: '#3bb4ff', ei: 0.45 }), 0, 2.1 + lv * 0.3, 0); cry.scale.y = 1.5; head.add(cry);
    for (let i = 0; i < 3 + lv; i++) { const a = (i / (3 + lv)) * Math.PI * 2; const sh = mesh(new THREE.OctahedronGeometry(0.16, 0), mat('#bdf0ff', { em: '#7fd7ff', ei: 0.4 }), Math.cos(a) * 0.9, 2.1 + lv * 0.3, Math.sin(a) * 0.9); sh.scale.y = 1.8; cry.add(sh); sh.position.set(Math.cos(a) * 1.4, 0, Math.sin(a) * 1.4); sh.scale.set(0.6, 1.2, 0.6); }
    if (spec === 1) for (let i = 0; i < 2; i++) { const ring = mesh(new THREE.TorusGeometry(1 + i * 0.35, 0.05, 4, 24), mat('#e0f7ff', { em: '#7fd7ff', ei: 0.6, op: 0.7 }), 0, 1.4 + i * 0.5, 0); ring.rotation.x = Math.PI / 2; head.add(ring); }
    ud.spin = cry; ud.glow = cry.material; ud.top = 2.1 + lv * 0.3; ud.static = true;
  } else if (id === 'tesla') {
    const h = 1.6 + lv * 0.35;
    head.add(mesh(new THREE.CylinderGeometry(0.22, 0.45, h, 8), mat('#4b3f72'), 0, h / 2, 0));
    for (let i = 0; i < 3 + (spec === 0 ? 2 : 0); i++) { const t = mesh(new THREE.TorusGeometry(0.55 - i * 0.07, 0.08, 6, 16), mat('#c08a3e'), 0, 0.5 + i * (h / 4.2), 0); t.rotation.x = Math.PI / 2; head.add(t); }
    const orb = mesh(new THREE.SphereGeometry(0.42 + lv * 0.06 + (spec === 1 ? 0.15 : 0), 14, 10), mat('#a78bfa', { em: '#8b5cf6', ei: 0.7 }), 0, h + 0.35, 0); head.add(orb);
    ud.glow = orb.material; ud.top = h + 0.35; ud.static = true;
  } else if (id === 'mortaio') {
    head.add(mesh(new THREE.CylinderGeometry(1.0, 1.05, 0.5, 10), mat('#6b4226', { flat: true }), 0, 0.25, 0));
    const pivot = new THREE.Group(); pivot.position.y = 0.7; head.add(pivot);
    const r = spec === 0 ? 0.6 : 0.45 + lv * 0.04;
    const barrel = new THREE.Group(); pivot.add(barrel);
    const b = mesh(new THREE.CylinderGeometry(r, r * 0.85, 1.2, 12), mat('#3a2c22'), 0, 0.45, 0.2); b.rotation.x = 0.55; barrel.add(b);
    { const tr = mesh(new THREE.TorusGeometry(r, 0.07, 5, 12), trim, 0, 0.97, 0.53); tr.rotation.x = Math.PI / 2 + 0.55; barrel.add(tr); }
    if (spec === 1) head.add(mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.6, 8), mat('#dc2626'), 0.75, 0.6, -0.5));
    ud.barrel = barrel; ud.top = 1.4;
  } else if (id === 'cecchino') {
    const h = 2.1 + lv * 0.4;
    head.add(mesh(new THREE.BoxGeometry(0.8, h, 0.8), stone, 0, h / 2, 0));
    const hut = new THREE.Group(); hut.position.y = h; head.add(hut);
    hut.add(mesh(new THREE.BoxGeometry(1.2, 0.7, 1.2), mat('#8a6d1d'), 0, 0.35, 0));
    { const cn = mesh(new THREE.ConeGeometry(1.0, 0.7, 4), accent, 0, 1.05, 0); cn.rotation.y = Math.PI / 4; hut.add(cn); }
    const gun = new THREE.Group(); hut.add(gun); gun.position.y = 0.4;
    const len = spec === 0 ? 2 : 1.5;
    const bar = mesh(new THREE.CylinderGeometry(0.06, 0.08, len, 6), mat('#222'), 0, 0, 0.6 + len / 2); bar.rotation.x = Math.PI / 2; gun.add(bar);
    if (spec === 1) { const b2 = bar.clone(); b2.position.x = 0.18; gun.add(b2); }
    gun.add(mesh(new THREE.SphereGeometry(0.1, 6, 5), mat('#7dd3fc', { em: '#38bdf8', ei: 0.5 }), 0, 0.15, 0.7));
    head.userData.hut = hut; ud.head = hut; ud.barrel = gun; ud.top = h + 0.5;
  } else if (id === 'veleno') {
    const pot = mesh(new THREE.SphereGeometry(0.85 + lv * 0.08, 12, 8, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.65), mat('#3b4a2a', { ds: true }), 0, 1.1 + lv * 0.08, 0); head.add(pot);
    const goo = mesh(new THREE.CircleGeometry(0.72 + lv * 0.07, 16), mat(spec === 1 ? '#d9f99d' : '#9be15d', { em: spec === 1 ? '#bef264' : '#65a30d', ei: 0.6 }), 0, 1.45 + lv * 0.12, 0); goo.rotation.x = -Math.PI / 2; head.add(goo);
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; head.add(mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.8, 5), mat('#5b3a1e'), Math.cos(a) * 0.7, 0.4, Math.sin(a) * 0.7)); }
    const bub = new THREE.Group(); head.add(bub); for (let i = 0; i < 4; i++) bub.add(mesh(new THREE.SphereGeometry(0.1 + (i % 2) * 0.06, 6, 5), mat('#d9ff9e', { em: '#a3e635', ei: 0.5 }), (i - 1.5) * 0.25, 1.6 + i * 0.12, (i % 2 - 0.5) * 0.3, false));
    if (spec === 0) { const tr = mesh(new THREE.TorusGeometry(0.9, 0.06, 4, 18), mat('#4c1d95'), 0, 1.5, 0); tr.rotation.x = Math.PI / 2; head.add(tr); }
    ud.bubbles = bub; ud.glow = goo.material; ud.top = 1.6; ud.static = true;
  } else if (id === 'caserma') {
    const w = 1.6 + lv * 0.15;
    head.add(mesh(new THREE.BoxGeometry(w, 1.0 + lv * 0.2, 1.3), mat('#f1ede6'), 0, 0.5 + lv * 0.1, 0));
    const roof = mesh(new THREE.ConeGeometry(w * 0.85, 0.9, 4), spec === 0 ? mat('#e6b422') : accent, 0, 1.45 + lv * 0.2, 0); roof.rotation.y = Math.PI / 4; roof.scale.z = 0.8; head.add(roof);
    head.add(mesh(new THREE.BoxGeometry(0.45, 0.65, 0.05), mat('#5b3a1e'), 0, 0.33, 0.67));
    head.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 4), mat('#666'), w / 2 - 0.1, 1.9 + lv * 0.2, -0.3));
    const fl = mesh(new THREE.PlaneGeometry(0.6, 0.38), mat(spec === 1 ? '#16a34a' : '#2f7cf6', { ds: true }), w / 2 + 0.2, 2.4 + lv * 0.2, -0.3, false); head.add(fl); ud.flag = fl;
    ud.top = 1.5; ud.static = true;
  } else if (id === 'miniera') {
    head.add(mesh(new THREE.DodecahedronGeometry(1.0 + lv * 0.1, 0), mat('#8a7a6a', { flat: true }), 0, 0.4, -0.15));
    const fr = mat('#8a5a34');
    head.add(mesh(new THREE.BoxGeometry(0.14, 1.0, 0.14), fr, -0.45, 0.55, 0.75), mesh(new THREE.BoxGeometry(0.14, 1.0, 0.14), fr, 0.45, 0.55, 0.75), mesh(new THREE.BoxGeometry(1.1, 0.14, 0.16), fr, 0, 1.05, 0.75));
    head.add(mesh(new THREE.PlaneGeometry(0.76, 0.9), mat('#1a120c'), 0, 0.5, 0.74, false));
    const gold = mat('#ffd23f', { em: '#f5b400', ei: 0.35, flat: true });
    for (let i = 0; i < 3 + lv * 2 + (spec >= 0 ? 3 : 0); i++) { const a = i * 2.4; head.add(mesh(new THREE.DodecahedronGeometry(0.13 + (i % 3) * 0.04, 0), gold, Math.cos(a) * (0.5 + (i % 4) * 0.12), 0.95 + (i % 3) * 0.2, Math.sin(a) * 0.4 - 0.1)); }
    const cart = new THREE.Group(); cart.position.set(0.9, 0.2, 1.1); head.add(cart);
    cart.add(mesh(new THREE.BoxGeometry(0.6, 0.35, 0.45), mat('#6b4226'), 0, 0.15, 0));
    cart.add(mesh(new THREE.DodecahedronGeometry(0.2, 0), gold, 0, 0.38, 0));
    if (spec === 0) head.add(mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 12), gold, -0.9, 0.3, 0.9));
    if (spec === 1) { const ch = mesh(new THREE.BoxGeometry(0.7, 0.45, 0.45), mat('#7c2d12'), -0.95, 0.25, 0.85); head.add(ch); head.add(mesh(new THREE.BoxGeometry(0.72, 0.08, 0.47), gold, -0.95, 0.42, 0.85)); }
    ud.top = 1.5; ud.static = true;
  }
  // tier pips: little golden studs on the base; specialised towers get a coloured banner gem
  for (let i = 0; i <= lv; i++) g.add(mesh(new THREE.SphereGeometry(0.09, 6, 5), mat('#ffd23f', { em: '#b48a00', ei: 0.3 }), -0.35 + i * 0.35, baseH * 0.55, 1.12, false));
  if (spec >= 0) g.add(mesh(new THREE.OctahedronGeometry(0.22, 0), mat(spec ? '#ff7a1a' : '#4ade80', { em: spec ? '#ff5a00' : '#16a34a', ei: 0.5 }), 0, baseH * 0.55, 1.18, false));
  g.scale.setScalar(s * 0.92);
  return g;
}

// the player's keep: blue roofs, white walls, flags; ry faces the incoming road
export function keepModel() {
  const g = new THREE.Group();
  const wall = mat('#f2eee6', { flat: true }), blue = mat('#2f7cf6'), dark = mat('#1d4fb8'), stone = mat('#cfc8bb', { flat: true });
  g.add(mesh(new THREE.CylinderGeometry(2.6, 2.9, 0.4, 10), stone, 0, 0.2, 0));
  g.add(mesh(new THREE.BoxGeometry(3.2, 1.8, 3.2), wall, 0, 1.3, 0));
  for (let i = 0; i < 8; i++) { const x = -1.4 + (i % 4) * 0.93, z = i < 4 ? 1.55 : -1.55; g.add(mesh(new THREE.BoxGeometry(0.42, 0.42, 0.3), wall, x, 2.4, z)); }
  for (const [x, z] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) {
    g.add(mesh(new THREE.CylinderGeometry(0.55, 0.62, 2.8, 10), wall, x, 1.6, z));
    g.add(mesh(new THREE.ConeGeometry(0.78, 1.2, 10), blue, x, 3.6, z));
  }
  g.add(mesh(new THREE.CylinderGeometry(0.85, 0.95, 3.6, 12), wall, 0, 2.6, 0));
  g.add(mesh(new THREE.ConeGeometry(1.15, 1.6, 12), dark, 0, 5.2, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 4), mat('#666'), 0, 6.6, 0));
  const flag = mesh(new THREE.PlaneGeometry(1.1, 0.65, 4, 1), mat('#2f7cf6', { ds: true }), 0.56, 7.05, 0, false); g.add(flag);
  const door = mesh(new THREE.BoxGeometry(1.0, 1.2, 0.1), mat('#5b3a1e'), 0, 0.95, 1.62); g.add(door);
  g.userData.flag = flag;
  return g;
}
// enemy entrance: a red striped tent arch
export function gateModel() {
  const g = new THREE.Group(), red = mat('#e0303f'), dark = mat('#3a1420');
  const arch = mesh(new THREE.TorusGeometry(1.5, 0.35, 8, 16, Math.PI), red, 0, 0, 0); g.add(arch);
  g.add(mesh(new THREE.CircleGeometry(1.2, 16, 0, Math.PI), dark, 0, 0, -0.05, false));
  for (const s of [-1, 1]) { g.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 4), mat('#555'), s * 1.5, 2, 0)); g.add(mesh(new THREE.PlaneGeometry(0.6, 0.35), mat('#ff4256', { ds: true }), s * 1.5 + 0.3, 2.4, 0, false)); }
  return g;
}
export function padModel() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(1.05, 1.15, 0.22, 10), mat('#c9bba2', { flat: true }), 0, 0.11, 0));
  const ring = mesh(new THREE.TorusGeometry(0.75, 0.05, 4, 20), mat('#ffffff', { op: 0.75 }), 0, 0.24, 0, false); ring.rotation.x = Math.PI / 2; g.add(ring);
  const plus = mesh(new THREE.BoxGeometry(0.5, 0.04, 0.12), mat('#ffffff', { op: 0.75 }), 0, 0.24, 0, false); g.add(plus); const p2 = plus.clone(); p2.rotation.y = Math.PI / 2; g.add(p2);
  g.userData.ring = ring;
  return g;
}

// accessories for the bean figures (instanced): unit-figure space, the figure is ~1.1 tall
export const ACC = {
  helmet: () => { const g = new THREE.SphereGeometry(0.3, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2); g.translate(0, 0.78, 0); return g; },
  shield: () => { const g = new THREE.BoxGeometry(0.42, 0.5, 0.07); g.translate(0.18, 0.5, 0.33); return g; },
  wings: () => { const a = new THREE.PlaneGeometry(0.6, 0.32); a.translate(0.33, 0, 0); a.rotateY(-0.35); a.translate(0.16, 0.66, -0.15); const b = new THREE.PlaneGeometry(0.6, 0.32); b.translate(-0.33, 0, 0); b.rotateY(0.35); b.translate(-0.16, 0.66, -0.15); return mergeGeometries([a, b]); },
  crown: () => { const g = new THREE.CylinderGeometry(0.22, 0.2, 0.18, 8, 1, true); g.translate(0, 0.98, 0); return g; },
  hood: () => { const g = new THREE.ConeGeometry(0.3, 0.42, 8); g.translate(0, 1.0, -0.02); return g; },
  band: () => { const g = new THREE.TorusGeometry(0.27, 0.04, 4, 14); g.rotateX(Math.PI / 2); g.translate(0, 0.78, 0); return g; },
  sword: () => { const g = new THREE.BoxGeometry(0.06, 0.5, 0.06); g.translate(-0.34, 0.55, 0.2); return g; },
  dot: () => { const g = new THREE.SphereGeometry(0.08, 6, 5); g.translate(0, 0.45, 0.27); return g; },
};
