// Procedural 3D race cars: smooth lofted bodies, painted liveries (canvas texture),
// physical materials (clear-coat paint, carbon, rubber). +x = forward, y = up.
// The builders live in ./cars/: core.js (materials + geometry toolkit), livery.js (paint),
// wheels.js, formula.js (Formula / junior), closed.js (hypercar, GT, Rally1).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MAT, cached, memo, whiteTex } from './cars/core.js';
import { sidewallMat, tyreMat, treadFor } from './cars/wheels.js';
import { formula } from './cars/formula.js';
import { hypercar, gt, rally } from './cars/closed.js';

export { MAT };

// category: 'formula' | 'junior' | 'endurance' (hypercar) | 'gt' | 'rally'
// opts: { helmet, tyre, number, sponsor, driver, dirt, hq, lod, merge, night }
export function buildCar(category, livery, opts = {}) {
  const L = { primary: '#e10600', secondary: '#ffffff', accent: '#111111', pattern: 1, ...livery };
  const car = category === 'rally' ? rally(L, opts) : category === 'gt' ? gt(L, opts) : category === 'endurance' ? hypercar(L, opts) : formula(L, { ...opts, jr: category === 'junior' });
  if (category === 'junior') car.scale.setScalar(0.94);
  car.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  const merge = opts.merge !== false;
  const farSpec = opts.lod && merge ? collectFar(car, opts) : null;
  if (merge) mergeStatic(car);
  if (farSpec) attachFar(car, farSpec);
  car.traverse((o) => { if (!car.userData.dirtMat && o.isMesh && o.material?.userData?.livery && o.material.userData.dirtU) car.userData.dirtMat = o.material; });
  return car;
}

// ---------------- draw-call reduction ----------------
// A car is built from a few hundred small meshes; static parts that share a material are
// baked into one mesh (car-local space). Kept separate: wheel groups (spin + steering), helmet
// parts (hidden in the cockpit view) and tyre sidewall decals (swapped by setTyreColor).
// Every primitive comes from the geometry cache, so the merged result is cached by its
// signature too: all cars of a class share the same GPU buffers.
const KEEP_ATTR = ['position', 'normal', 'uv'];
function bakeGeometry(src, rel) {
  const g = src.clone();
  for (const k of Object.keys(g.attributes)) if (!KEEP_ATTR.includes(k)) g.deleteAttribute(k);
  g.morphAttributes = {}; g.clearGroups();
  if (!g.attributes.normal) g.computeVertexNormals();
  const n = g.attributes.position.count;
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  if (!g.index) { const idx = new (n > 65535 ? Uint32Array : Uint16Array)(n); for (let i = 0; i < n; i++) idx[i] = i; g.setIndex(new THREE.BufferAttribute(idx, 1)); }
  g.applyMatrix4(rel);
  return g;
}
const mergedCache = new Map();
const sigOf = (g, rel) => g.uuid + ':' + rel.elements.map((e) => Math.round(e * 2000)).join(',');
// parts: [{ geo, rel (Matrix4) }] -> one geometry (cached when every source is a cached primitive)
function mergeParts(parts) {
  const cacheable = parts.every((p) => p.geo.userData.memo);
  const key = cacheable ? parts.map((p) => sigOf(p.geo, p.rel)).join('|') : null;
  if (key && mergedCache.has(key)) return mergedCache.get(key);
  const baked = parts.map((p) => bakeGeometry(p.geo, p.rel));
  const g = mergeGeometries(baked, false); for (const b of baked) b.dispose();
  if (g) { g.computeBoundingSphere(); g.userData.memo = !!key; g.userData.counts = parts.map((p) => p.geo.attributes.position.count); }
  if (key) mergedCache.set(key, g);
  return g;
}
function mergeInto(root, meshes) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const groups = new Map();
  for (const m of meshes) {
    if (Array.isArray(m.material)) continue;
    const k = m.material.uuid + (m.castShadow ? 's' : '') + (m.receiveShadow ? 'r' : '') + m.renderOrder + (m.userData.band ? 'b' : '') + (m.userData.tyre ? 't' : '');
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(m);
  }
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const merged = mergeParts(list.map((m) => ({ geo: m.geometry, rel: new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld) })));
    if (!merged) continue;
    const mm = new THREE.Mesh(merged, list[0].material);
    mm.castShadow = list[0].castShadow; mm.receiveShadow = list[0].receiveShadow; mm.renderOrder = list[0].renderOrder;
    mm.userData.merged = list.length; if (list[0].userData.band) mm.userData.band = true;
    root.add(mm);
    for (const m of list) m.removeFromParent();
  }
}
export function mergeStatic(car) {
  const keep = new Set([...(car.userData.wheels || []), ...(car.userData.helmetParts || [])]);
  const stat = [];
  const walk = (o) => { for (const c of o.children) { if (keep.has(c)) continue; if (c.isMesh) { if (!c.userData.band && c.visible) stat.push(c); } else walk(c); } };
  walk(car);
  mergeInto(car, stat);
  for (const w of car.userData.wheels || []) for (const sp of w.userData.spin || []) {
    const parts = []; sp.traverse((o) => { if (o.isMesh) parts.push(o); });
    mergeInto(sp, parts);
  }
  // drop the now empty helper groups
  const prune = (o) => { for (const c of [...o.children]) { if (keep.has(c)) continue; prune(c); if (!c.isMesh && c.type === 'Group' && !c.children.length) c.removeFromParent(); } };
  prune(car);
  return car;
}

// ---------------- distance LOD ----------------
// Far cars (small on screen) draw with 3-5 calls and a few thousand triangles: coarse
// versions of the livery shells keep their texture, the parts flagged far() (wings, floor,
// end plates...) are folded into one vertex-coloured mesh together with simplified static
// wheels and the helmet; lamps stay as they are. setCarLOD() swaps the two sets.
const FAR_MAT = () => cached('farMat', () => new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.12, clearcoat: 0.6, clearcoatRoughness: 0.1 }));
const isLamp = (m) => (m.emissiveIntensity || 0) > 1 && m.emissive && m.emissive.getHex() !== 0;
function colorOf(m) {
  if (m === MAT.carbon() || m === MAT.carbonGloss()) return new THREE.Color(0x1d1e22);
  if (m.userData.farColor) return new THREE.Color(m.userData.farColor);
  const c = m.color ? m.color.clone() : new THREE.Color(0x777777);
  if (m.map && m.map !== whiteTex()) c.multiplyScalar(0.35);
  return c;
}
function collectFar(car, opts) {
  car.updateMatrixWorld(true);
  const inv = car.matrixWorld.clone().invert();
  const rel = (o) => new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
  const skip = new Set([...(car.userData.wheels || []), ...(car.userData.helmetParts || [])]);
  const vc = [], tex = new Map();
  const walk = (o) => {
    for (const c of o.children) {
      if (skip.has(c)) continue;
      if (!c.isMesh) { walk(c); continue; }
      const f = c.userData.far; if (!f || isLamp(c.material)) continue;
      const part = { geo: f === true ? c.geometry : f, rel: rel(c) };
      if (c.material.userData.livery) { if (!tex.has(c.material)) tex.set(c.material, []); tex.get(c.material).push(part); } else vc.push({ ...part, col: colorOf(c.material) });
    }
  };
  walk(car);
  const tyre = new THREE.Color(0x151517), rimCol = new THREE.Color(opts.farRim || 0x2a2d33);
  for (const w of car.userData.wheels || []) {
    const { rimR = 0.22, w: ww = 0.3 } = w.userData, r = w.userData.r || rimR / 0.64, m = rel(w);
    vc.push({ geo: memo('farTyre', [r, ww], () => new THREE.CylinderGeometry(r, r, ww, 14, 1, false).rotateX(Math.PI / 2)), rel: m, col: tyre });
    vc.push({ geo: memo('farRim', [rimR, ww], () => mergeGeometries([new THREE.CircleGeometry(rimR, 12).translate(0, 0, ww / 2 + 0.006), new THREE.CircleGeometry(rimR, 12).rotateY(Math.PI).translate(0, 0, -ww / 2 - 0.006)])), rel: m, col: rimCol });
  }
  const h = car.userData.helmetParts?.[0];
  if (h && !h.userData.noFar) vc.push({ geo: memo('farHelm', 0, () => new THREE.SphereGeometry(1, 8, 6)), rel: rel(h), col: new THREE.Color((typeof opts.helmet === 'object' ? opts.helmet?.c1 : opts.helmet) || '#ffd400') });
  return { vc, tex };
}
function attachFar(car, { vc, tex }) {
  const near = car.children.filter((c) => !(c.isMesh && isLamp(c.material)));
  const farM = [];
  const add = (g, m) => { const o = new THREE.Mesh(g, m); o.castShadow = true; o.receiveShadow = true; o.visible = false; o.userData.far = true; car.add(o); farM.push(o); };
  if (vc.length) {
    const base = mergeParts(vc);
    if (base) {
      // shared positions / normals, per-car colours
      const g = new THREE.BufferGeometry(); g.setAttribute('position', base.attributes.position); g.setAttribute('normal', base.attributes.normal); g.setIndex(base.index);
      g.boundingSphere = base.boundingSphere;
      const n = base.attributes.position.count, a = new Float32Array(n * 3); let i = 0;
      vc.forEach((p, k) => { for (let e = i + base.userData.counts[k]; i < e; i++) { a[i * 3] = p.col.r; a[i * 3 + 1] = p.col.g; a[i * 3 + 2] = p.col.b; } });
      g.setAttribute('color', new THREE.BufferAttribute(a, 3));
      add(g, FAR_MAT());
    }
  }
  for (const [m, parts] of tex) { const g = mergeParts(parts); if (g) add(g, m); }
  if (!farM.length) return;
  car.userData.lod = { near, far: farM, level: 0 };
}
export function setCarLOD(car, far) {
  const l = car.userData.lod, lv = far ? 1 : 0; if (!l || l.level === lv) return;
  l.level = lv;
  for (const o of l.near) o.visible = !lv;
  for (const o of l.far) o.visible = !!lv;
}

// compound change at a pit stop: sidewall colour band and the tread (slick / intermediate / wet)
export function setTyreColor(car, color) {
  const band = sidewallMat(color);
  for (const w of car.userData.wheels || []) w.traverse((o) => {
    if (o.userData?.band) o.material = band;
    else if (o.userData?.tyre) o.material = tyreMat(treadFor(color, o.userData.tyre));
  });
}
