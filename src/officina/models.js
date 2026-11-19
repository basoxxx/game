// Officina — 3D models: the cars (Apex Dynasty's procedural race cars for every class, a kart of our own),
// the four kinds of parts in tier colours and the delivery crates. Templates are built once per kind and
// cloned (shared geometry and materials), every model is normalised to a given length on the floor.
import * as THREE from 'three';
import { buildCar } from '../ui/cars3d.js';
import { carDef, classOf, TIER_COLORS } from './data.js';

const tpl = new Map();
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.1, ...o });
const M = {};
const mat = (k, make) => (M[k] ||= make());
function mesh(geo, m, x = 0, y = 0, z = 0) { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; return o; }

// normalise: length along x = L, sitting on y = 0, centred
function fit(obj, L) {
  const b = new THREE.Box3().setFromObject(obj), sz = b.getSize(new THREE.Vector3());
  const k = L / Math.max(sz.x, sz.z, 0.001);
  const g = new THREE.Group(); obj.scale.multiplyScalar(k);
  const c = b.getCenter(new THREE.Vector3()).multiplyScalar(k);
  obj.position.set(-c.x, -b.min.y * k, -c.z);
  g.add(obj); g.userData.h = sz.y * k;
  return g;
}

// ───────── kart (tiers 1-5): tray chassis, four fat little tyres, nose and side pods in livery colours, driver
function kart(L, num) {
  const g = new THREE.Group();
  const p = std(L.primary, { roughness: 0.35, metalness: 0.2 }), s = std(L.secondary, { roughness: 0.4 }), dark = mat('kdark', () => std(0x1a1b1f, { roughness: 0.7 })), steel = mat('ksteel', () => std(0x9aa3ad, { metalness: 0.8, roughness: 0.3 }));
  const tyre = mat('ktyre', () => std(0x141416, { roughness: 0.9 })), rim = mat('krim', () => std(0xd8dde3, { metalness: 0.7, roughness: 0.3 }));
  g.add(mesh(new THREE.BoxGeometry(1.5, 0.05, 0.75), steel, 0, 0.12, 0));
  for (const [x, z, r, w] of [[0.55, 0.52, 0.13, 0.13], [0.55, -0.52, 0.13, 0.13], [-0.55, 0.55, 0.14, 0.2], [-0.55, -0.55, 0.14, 0.2]]) {
    const t = mesh(new THREE.CylinderGeometry(r, r, w, 18), tyre, x, r, z); t.rotation.x = Math.PI / 2; g.add(t);
    const h = mesh(new THREE.CylinderGeometry(r * 0.6, r * 0.6, w + 0.01, 12), rim, x, r, z); h.rotation.x = Math.PI / 2; g.add(h);
  }
  const nose = mesh(new THREE.BoxGeometry(0.42, 0.16, 0.7), p, 0.78, 0.2, 0); nose.rotation.z = -0.25; g.add(nose);
  for (const z of [0.42, -0.42]) g.add(mesh(new THREE.BoxGeometry(0.7, 0.14, 0.12), s, -0.05, 0.2, z));
  g.add(mesh(new THREE.BoxGeometry(0.3, 0.14, 0.55), p, -0.86, 0.22, 0)); // rear bumper
  const seat = mesh(new THREE.BoxGeometry(0.34, 0.32, 0.34), dark, -0.18, 0.3, 0); seat.rotation.z = 0.25; g.add(seat);
  g.add(mesh(new THREE.BoxGeometry(0.22, 0.2, 0.2), steel, -0.55, 0.3, -0.22)); // engine
  const col = mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.4, 6), steel, 0.25, 0.32, 0); col.rotation.z = 0.9; g.add(col);
  const wheel = mesh(new THREE.TorusGeometry(0.1, 0.018, 6, 16), dark, 0.13, 0.46, 0); wheel.rotation.y = Math.PI / 2; wheel.rotation.x = 0.5; g.add(wheel);
  const body = mesh(new THREE.CapsuleGeometry(0.13, 0.22, 4, 8), s, -0.12, 0.58, 0); body.rotation.z = 0.3; g.add(body);
  g.add(mesh(new THREE.SphereGeometry(0.13, 16, 12), p, -0.08, 0.86, 0)); // helmet
  const visor = mesh(new THREE.SphereGeometry(0.1, 12, 8, 0, Math.PI, 0, Math.PI / 2.2), dark, -0.03, 0.87, 0); visor.rotation.z = -Math.PI / 2; visor.rotation.y = Math.PI / 2; g.add(visor);
  const plate = mesh(new THREE.BoxGeometry(0.02, 0.2, 0.3), mat('kplate', () => std(0xf2f2f2)), 0.95, 0.32, 0); plate.rotation.z = -0.3; g.add(plate);
  g.userData.num = num;
  return g;
}

// a car of tier t, `len` metres long. track = lighter version for the test track (no shadows)
export function carModel(t, len = 2, { shadow = true } = {}) {
  const key = 'car' + t;
  if (!tpl.has(key)) {
    const d = carDef(t), cls = classOf(t);
    let o;
    try { o = cls.model === 'kart' ? kart(d.livery, d.num) : buildCar(cls.model, d.livery, { number: d.num, sponsor: d.team.split(' ')[0], hq: false }); }
    catch (e) { console.warn('officina car', t, e); o = kart(d.livery, d.num); }
    tpl.set(key, fit(o, 1));
  }
  const c = tpl.get(key).clone(true);
  c.scale.setScalar(len);
  if (!shadow) c.traverse((m) => { if (m.isMesh) { m.castShadow = false; } });
  return c;
}

// ───────── parts (one template per kind and tier colour)
function tierMat(t) { return mat('tier' + t, () => std(TIER_COLORS[(t - 1) % TIER_COLORS.length], { metalness: 0.55, roughness: 0.28, emissive: new THREE.Color(TIER_COLORS[(t - 1) % TIER_COLORS.length]).multiplyScalar(t >= 7 ? 0.18 : 0.05) })); }
const metal = () => mat('pmetal', () => std(0x6d747d, { metalness: 0.85, roughness: 0.25 }));
const black = () => mat('pblack', () => std(0x17181b, { roughness: 0.75 }));
const carbon = () => mat('pcarbon', () => std(0x23252a, { roughness: 0.35, metalness: 0.3 }));
function engine(t) {
  const g = new THREE.Group(), c = tierMat(t);
  g.add(mesh(new THREE.BoxGeometry(1.1, 0.5, 0.7), metal(), 0, 0.3, 0));
  for (const z of [-0.2, 0.2]) { const head = mesh(new THREE.BoxGeometry(1.0, 0.18, 0.28), c, 0, 0.64, z); head.rotation.x = z > 0 ? -0.35 : 0.35; g.add(head); }
  for (let i = 0; i < 4; i++) for (const z of [-0.26, 0.26]) g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.18, 10), black(), -0.36 + i * 0.24, 0.8, z));
  const pipe = mesh(new THREE.TorusGeometry(0.22, 0.05, 8, 16, Math.PI), metal(), 0.62, 0.36, 0.25); pipe.rotation.y = Math.PI / 2; g.add(pipe);
  g.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.12, 20), c, -0.62, 0.32, 0)).rotation.z = Math.PI / 2;
  return g;
}
function aero(t) {
  const g = new THREE.Group(), c = tierMat(t);
  const sh = new THREE.Shape(); sh.moveTo(-0.3, 0); sh.quadraticCurveTo(0.05, 0.13, 0.32, 0.02); sh.quadraticCurveTo(0.05, 0.05, -0.3, 0);
  const wing = new THREE.ExtrudeGeometry(sh, { depth: 1.3, bevelEnabled: false }); wing.translate(0, 0, -0.65);
  g.add(mesh(wing, c, 0, 0.55, 0));
  const w2 = mesh(wing, carbon(), -0.05, 0.75, 0); w2.scale.set(0.7, 0.8, 1); g.add(w2);
  for (const z of [-0.67, 0.67]) g.add(mesh(new THREE.BoxGeometry(0.75, 0.6, 0.03), carbon(), 0, 0.6, z));
  for (const z of [-0.2, 0.2]) g.add(mesh(new THREE.BoxGeometry(0.08, 0.55, 0.04), metal(), 0, 0.28, z));
  return g;
}
function tyreP(t) {
  const g = new THREE.Group(), c = tierMat(t);
  const ty = mesh(new THREE.TorusGeometry(0.38, 0.17, 14, 28), black(), 0, 0.56, 0); g.add(ty);
  const rim = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.3, 20), c, 0, 0.56, 0); rim.rotation.x = Math.PI / 2; g.add(rim);
  const hub = mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.36, 10), metal(), 0, 0.56, 0); hub.rotation.x = Math.PI / 2; g.add(hub);
  const band = mesh(new THREE.TorusGeometry(0.47, 0.025, 6, 32), c, 0, 0.56, 0.12); g.add(band);
  g.rotation.y = 0.5;
  return g;
}
function chassis(t) {
  const g = new THREE.Group(), c = tierMat(t);
  const rod = (a, b, r = 0.035, m = c) => { const v = new THREE.Vector3().subVectors(b, a), len = v.length(); const o = mesh(new THREE.CylinderGeometry(r, r, len, 8), m); o.position.copy(a).addScaledVector(v, 0.5); o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize()); g.add(o); };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const pts = [V(-0.7, 0.15, -0.35), V(0.7, 0.15, -0.3), V(0.7, 0.15, 0.3), V(-0.7, 0.15, 0.35)];
  for (let i = 0; i < 4; i++) rod(pts[i], pts[(i + 1) % 4], 0.05);
  const top = [V(-0.3, 0.7, -0.28), V(0.25, 0.55, -0.25), V(0.25, 0.55, 0.25), V(-0.3, 0.7, 0.28)];
  for (let i = 0; i < 4; i++) { rod(top[i], top[(i + 1) % 4]); rod(top[i], pts[i]); }
  rod(V(-0.3, 0.7, -0.28), V(-0.7, 0.15, 0.35)); rod(V(0.25, 0.55, 0.25), V(0.7, 0.15, -0.3));
  g.add(mesh(new THREE.BoxGeometry(1.2, 0.04, 0.55), carbon(), 0, 0.12, 0));
  return g;
}
const PART_BUILD = { motore: engine, aero, gomme: tyreP, telaio: chassis };
export function partModel(kind, t, len = 1.6) {
  const key = `p${kind}${t}`;
  if (!tpl.has(key)) tpl.set(key, fit((PART_BUILD[kind] || engine)(t), 1));
  const c = tpl.get(key).clone(true); c.scale.setScalar(len); return c;
}

// ───────── delivery crate: wooden box with a coloured band (orange = car, blue = parts)
export function crateModel(kind = 'car', len = 1.3) {
  const key = 'crate' + kind;
  if (!tpl.has(key)) {
    const g = new THREE.Group();
    const wood = mat('wood', () => std(0xb98a52, { roughness: 0.8 })), dark = mat('wood2', () => std(0x7a5530, { roughness: 0.85 }));
    const band = mat('band' + kind, () => std(kind === 'part' ? 0x2f80ff : 0xff7a1a, { emissive: new THREE.Color(kind === 'part' ? 0x2f80ff : 0xff7a1a).multiplyScalar(0.35), roughness: 0.4 }));
    g.add(mesh(new THREE.BoxGeometry(1, 0.8, 0.8), wood, 0, 0.4, 0));
    for (const x of [-0.46, 0.46]) g.add(mesh(new THREE.BoxGeometry(0.1, 0.84, 0.84), dark, x, 0.4, 0));
    g.add(mesh(new THREE.BoxGeometry(1.02, 0.16, 0.82), band, 0, 0.4, 0));
    g.add(mesh(new THREE.BoxGeometry(0.16, 0.82, 0.82), band, 0, 0.4, 0));
    tpl.set(key, fit(g, 1));
  }
  const c = tpl.get(key).clone(true); c.scale.setScalar(len); return c;
}
export function itemModel(it, cell) {
  if (!it) return null;
  if (it.k === 'car') return carModel(it.t, cell * 0.92);
  if (it.k === 'part') return partModel(it.p, it.t, cell * 0.62);
  return crateModel(it.c, cell * 0.55);
}
export function disposeModels() {
  // the race cars' geometries and materials live in the shared cache of src/ui/cars (Apex Dynasty uses them
  // too): only our own models (kart, parts, crates) are released
  for (const [k, g] of tpl) { if (k.startsWith('car') && classOf(+k.slice(3)).model !== 'kart') continue; g.traverse((o) => { if (o.isMesh) { o.geometry?.dispose?.(); if (k.startsWith('car')) o.material?.dispose?.(); } }); }
  tpl.clear();
  for (const k of Object.keys(M)) { M[k].dispose?.(); delete M[k]; }
}
