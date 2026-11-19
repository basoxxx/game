// Kart Baso — procedural cartoon models: karts (4 bodies × 4 wheel sets), the 8 drivers, items,
// moving hazards and scenery props. Everything is built from primitives with toon materials and
// shared geometries (no downloads).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

let gradTex = null;
export function toonGrad() {
  if (gradTex) return gradTex;
  const d = new Uint8Array([90, 90, 90, 255, 170, 170, 170, 255, 255, 255, 255, 255]);
  gradTex = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat); gradTex.minFilter = gradTex.magFilter = THREE.NearestFilter; gradTex.needsUpdate = true;
  return gradTex;
}
const matCache = new Map();
export function toon(color, o = {}) {
  const key = color + JSON.stringify(o);
  if (matCache.has(key) && !o.unique) return matCache.get(key);
  const m = o.metal ? new THREE.MeshStandardMaterial({ color, metalness: 0.75, roughness: 0.3, emissive: o.emissive || 0x000000 })
    : new THREE.MeshToonMaterial({ color, gradientMap: toonGrad(), emissive: o.emissive || 0x000000, transparent: !!o.opacity, opacity: o.opacity ?? 1 });
  if (o.emissiveIntensity) m.emissiveIntensity = o.emissiveIntensity;
  if (!o.unique) matCache.set(key, m);
  return m;
}
export function disposeModelCaches() { vcM?.dispose(); vcM = null; for (const m of matCache.values()) m.dispose(); matCache.clear(); gradTex?.dispose(); gradTex = null; for (const g of Object.values(G)) g?.dispose?.(); for (const k in G) delete G[k]; }

const G = {}; // shared geometries
const geo = (k, f) => (G[k] ||= f());
const mesh = (g, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); return o; };

// ───────── kart
function wheel(kind, front) {
  const r = kind === 'tassellate' ? 0.4 : kind === 'morbide' ? 0.38 : front ? 0.31 : 0.36;
  const w = kind === 'morbide' ? 0.42 : kind === 'slick' ? 0.36 : front ? 0.28 : 0.36;
  const g = new THREE.Group();
  const tyre = mesh(geo(`tyre${kind}${front}`, () => new THREE.CylinderGeometry(r, r, w, kind === 'tassellate' ? 10 : 16).rotateZ(Math.PI / 2)), toon(kind === 'slick' ? '#1b1d22' : '#2a2c33'));
  g.add(tyre);
  const rim = mesh(geo(`rim${kind}${front}`, () => new THREE.CylinderGeometry(r * 0.55, r * 0.55, w + 0.02, 10).rotateZ(Math.PI / 2)), toon('#ffffff'));
  rim.name = 'rim'; g.add(rim);
  if (kind === 'tassellate') for (let i = 0; i < 8; i++) { const t = mesh(geo('lug', () => new THREE.BoxGeometry(w + 0.04, 0.08, 0.12)), toon('#2a2c33')); const a = (i / 8) * Math.PI * 2; t.position.set(0, Math.sin(a) * r, Math.cos(a) * r); t.rotation.x = -a; g.add(t); }
  g.userData.r = r;
  return g;
}

function faceEyes(head, r, z = 0.92, y = 0.12, gap = 0.36) {
  for (const s of [-1, 1]) {
    const e = mesh(geo('eye', () => new THREE.SphereGeometry(0.11, 10, 8)), toon('#ffffff'), s * r * gap, r * y, r * z);
    const p = mesh(geo('pupil', () => new THREE.SphereGeometry(0.055, 8, 6)), toon('#15161a'), 0, 0, 0.07);
    e.add(p); head.add(e);
  }
}
function driver(ch) {
  const g = new THREE.Group();
  const jacket = toon(ch.color), skin = toon(ch.skin), hat = toon(ch.hat);
  const torso = mesh(geo('torso', () => new THREE.CapsuleGeometry(0.3, 0.35, 4, 10)), jacket, 0, 0.95, -0.25);
  g.add(torso);
  for (const s of [-1, 1]) { const arm = mesh(geo('arm', () => new THREE.CapsuleGeometry(0.09, 0.42, 3, 6)), jacket, s * 0.3, 0.98, 0.02); arm.rotation.x = 1.15; arm.rotation.z = -s * 0.25; g.add(arm); const hand = mesh(geo('hand', () => new THREE.SphereGeometry(0.1, 8, 6)), toon('#ffffff'), s * 0.22, 0.84, 0.28); g.add(hand); }
  const head = new THREE.Group(); head.position.set(0, 1.52, -0.22); head.name = 'head'; g.add(head);
  const R = 0.4;
  const look = ch.look;
  if (look === 'robot') {
    head.add(mesh(geo('rhead', () => new THREE.BoxGeometry(0.72, 0.6, 0.62)), toon(ch.skin, { metal: true })));
    head.add(mesh(geo('visor', () => new THREE.BoxGeometry(0.6, 0.2, 0.05)), toon('#5ef2ff', { emissive: '#2aa8c8' }), 0, 0.05, 0.32));
    head.add(mesh(geo('ant', () => new THREE.CylinderGeometry(0.025, 0.025, 0.35)), toon('#c9d6e6'), 0, 0.45, 0));
    head.add(mesh(geo('antb', () => new THREE.SphereGeometry(0.08, 8, 6)), toon('#ff3b6b', { emissive: '#aa1030' }), 0, 0.64, 0));
    for (const s of [-1, 1]) head.add(mesh(geo('bolt', () => new THREE.CylinderGeometry(0.08, 0.08, 0.12, 8).rotateZ(Math.PI / 2)), toon(ch.color), s * 0.4, 0, 0));
    return g;
  }
  if (look === 'rock') {
    const h = mesh(geo('rockhead', () => new THREE.DodecahedronGeometry(0.46, 0)), toon(ch.skin)); head.add(h);
    faceEyes(head, 0.46, 0.85, 0.15);
    head.add(mesh(geo('brow', () => new THREE.BoxGeometry(0.5, 0.08, 0.1)), toon('#5b616b'), 0, 0.17, 0.4));
    head.add(mesh(geo('helmet', () => new THREE.SphereGeometry(0.47, 14, 10, 0, Math.PI * 2, 0, 1.1)), hat, 0, 0.08, -0.04));
    return g;
  }
  if (look === 'tomato') {
    head.add(mesh(geo('tomhead', () => new THREE.SphereGeometry(0.46, 16, 12).scale(1.08, 0.9, 1)), skin));
    faceEyes(head, 0.46, 0.9, 0.12);
    for (let i = 0; i < 5; i++) { const l = mesh(geo('leaf', () => new THREE.ConeGeometry(0.09, 0.32, 5).rotateX(Math.PI / 2).translate(0, 0, 0.14)), hat, 0, 0.4, 0); l.rotation.set(-0.35, (i / 5) * Math.PI * 2, 0); head.add(l); }
    head.add(mesh(geo('stem', () => new THREE.CylinderGeometry(0.04, 0.05, 0.18)), hat, 0, 0.48, 0));
    return g;
  }
  const hd = mesh(geo('head', () => new THREE.SphereGeometry(R, 16, 12)), skin); head.add(hd);
  faceEyes(head, R);
  if (look === 'dog') {
    head.add(mesh(geo('snout', () => new THREE.SphereGeometry(0.2, 10, 8).scale(1, 0.8, 1)), toon('#e8c08a'), 0, -0.1, 0.34));
    head.add(mesh(geo('nose', () => new THREE.SphereGeometry(0.08, 8, 6)), toon('#1a1a1a'), 0, -0.02, 0.52));
    for (const s of [-1, 1]) { const e = mesh(geo('dogear', () => new THREE.BoxGeometry(0.14, 0.42, 0.24).translate(0, -0.18, 0)), hat, s * 0.38, 0.22, -0.02); e.rotation.z = s * 0.35; head.add(e); }
  } else if (look === 'cat') {
    for (const s of [-1, 1]) { const e = mesh(geo('catear', () => new THREE.ConeGeometry(0.15, 0.3, 4)), toon(ch.skin), s * 0.24, 0.38, 0); e.rotation.z = -s * 0.3; head.add(e); const inner = mesh(geo('catear2', () => new THREE.ConeGeometry(0.08, 0.18, 4)), toon('#ff9ccc'), s * 0.235, 0.37, 0.05); inner.rotation.z = -s * 0.3; head.add(inner); }
    head.add(mesh(geo('catnose', () => new THREE.SphereGeometry(0.05, 6, 5)), toon('#ff6fb5'), 0, -0.04, 0.4));
    for (const s of [-1, 1]) for (const yy of [-0.06, -0.12]) { const w = mesh(geo('whisk', () => new THREE.CylinderGeometry(0.008, 0.008, 0.36).rotateZ(Math.PI / 2)), toon('#333333'), s * 0.3, yy, 0.32); w.rotation.y = s * 0.2; head.add(w); }
    head.add(mesh(geo('bow', () => new THREE.TorusGeometry(0.09, 0.05, 6, 10)), toon('#ff6fb5'), 0.22, 0.3, 0.12));
  } else if (look === 'beanie') {
    head.add(mesh(geo('beanie', () => new THREE.SphereGeometry(R * 1.04, 16, 10, 0, Math.PI * 2, 0, 1.25)), hat, 0, 0.04, 0));
    head.add(mesh(geo('pom', () => new THREE.SphereGeometry(0.12, 10, 8)), toon('#ffffff'), 0, 0.48, 0));
    head.add(mesh(geo('cheek', () => new THREE.SphereGeometry(0.07, 8, 6)), toon('#ff9a8a'), 0.24, -0.1, 0.3));
    head.add(mesh(geo('cheek', () => new THREE.SphereGeometry(0.07, 8, 6)), toon('#ff9a8a'), -0.24, -0.1, 0.3));
  } else if (look === 'ponytail') {
    head.add(mesh(geo('hair', () => new THREE.SphereGeometry(R * 1.05, 16, 10, 0, Math.PI * 2, 0, 1.4)), hat, 0, 0.03, -0.03));
    const tail = mesh(geo('tail', () => new THREE.CapsuleGeometry(0.11, 0.35, 3, 8)), hat, 0, 0.1, -0.5); tail.rotation.x = 1.0; head.add(tail);
    const bolt = mesh(geo('boltclip', () => new THREE.OctahedronGeometry(0.11, 0)), toon('#ffe14a', { emissive: '#a08000' }), 0.26, 0.28, 0.22); head.add(bolt);
  } else if (look === 'granny') {
    head.add(mesh(geo('ghair', () => new THREE.SphereGeometry(R * 1.04, 16, 10, 0, Math.PI * 2, 0, 1.1)), hat, 0, 0.05, -0.04));
    head.add(mesh(geo('bun', () => new THREE.SphereGeometry(0.17, 10, 8)), hat, 0, 0.36, -0.22));
    const gog = new THREE.Group(); gog.position.set(0, 0.2, 0.3);
    for (const s of [-1, 1]) gog.add(mesh(geo('gogl', () => new THREE.TorusGeometry(0.11, 0.035, 6, 12)), toon('#9b5cff'), s * 0.14, 0, 0));
    head.add(gog);
    head.add(mesh(geo('scarf', () => new THREE.TorusGeometry(0.28, 0.08, 6, 14).rotateX(Math.PI / 2)), toon('#ff4d6d'), 0, -0.38, 0));
  }
  return g;
}

// body: 'classico' | 'saetta' | 'bisonte' | 'piuma'
export function makeKart(ch, { body = 'classico', wheels = 'standard', paint = null, num = 0 } = {}) {
  const root = new THREE.Group();
  const tilt = new THREE.Group(); tilt.name = 'tilt'; root.add(tilt);
  const col = paint?.color || ch.color;
  const pm = paint?.rainbow ? rainbowMat() : toon(col, paint?.metal ? { metal: true } : {});
  const dark = toon('#2b2e36'), trim = toon('#f4f5f7');
  const wide = body === 'bisonte' ? 1.18 : body === 'piuma' ? 0.86 : 1;
  const long = body === 'saetta' ? 1.18 : 1;
  const k = new THREE.Group(); tilt.add(k);
  // floor pan + body tub
  k.add(mesh(geo(`pan${body}`, () => new THREE.BoxGeometry(1.25 * wide, 0.12, 2.2 * long)), dark, 0, 0.26, 0));
  if (body === 'piuma') {
    for (const s of [-1, 1]) { const t = mesh(geo('tube', () => new THREE.CylinderGeometry(0.06, 0.06, 2.0, 6).rotateX(Math.PI / 2)), pm, s * 0.5, 0.42, 0); k.add(t); }
    k.add(mesh(geo('nosep', () => new THREE.BoxGeometry(0.9, 0.18, 0.5)), pm, 0, 0.4, 1.0));
  } else {
    const tub = mesh(geo(`tub${body}`, () => { const g = new THREE.BoxGeometry(1.15 * wide, 0.36, 1.5 * long, 1, 1, 1); return g; }), pm, 0, 0.5, 0.05); k.add(tub);
    const nose = mesh(geo(`nose${body}`, () => new THREE.CylinderGeometry(0.28 * wide, 0.5 * wide, 0.75 * long, 4, 1).rotateY(Math.PI / 4).rotateX(Math.PI / 2).scale(1.15, 0.55, 1)), pm, 0, 0.45, 1.05 * long); k.add(nose);
    for (const s of [-1, 1]) k.add(mesh(geo(`pod${body}`, () => new THREE.CapsuleGeometry(0.17, 0.9 * long, 3, 8).rotateX(Math.PI / 2)), pm, s * 0.68 * wide, 0.42, 0.05));
    if (body === 'bisonte') { const bar = mesh(geo('bullbar', () => new THREE.TorusGeometry(0.55, 0.06, 6, 12, Math.PI)), trim, 0, 0.35, 1.55); bar.rotation.x = Math.PI / 2; bar.rotation.z = Math.PI; k.add(bar); for (const s of [-1, 1]) { const horn = mesh(geo('horn', () => new THREE.ConeGeometry(0.08, 0.4, 6).rotateZ(-Math.PI / 2)), trim, s * 0.75, 0.7, 0.9); horn.rotation.y = s > 0 ? 0 : Math.PI; k.add(horn); } }
  }
  // stripe + number plate
  k.add(mesh(geo(`stripe${body}`, () => new THREE.BoxGeometry(0.28, 0.02, 1.4 * long)), trim, 0, 0.69, 0.25));
  const plate = mesh(geo('plate', () => new THREE.CircleGeometry(0.2, 16)), numMat(num, col), 0, 0.52, 1.45 * long + 0.02); k.add(plate);
  // bumpers
  k.add(mesh(geo(`fbump${body}`, () => new THREE.CapsuleGeometry(0.09, 1.1 * wide, 3, 8).rotateZ(Math.PI / 2)), dark, 0, 0.26, 1.42 * long));
  k.add(mesh(geo(`rbump${body}`, () => new THREE.CapsuleGeometry(0.11, 1.2 * wide, 3, 8).rotateZ(Math.PI / 2)), dark, 0, 0.32, -1.22));
  // seat, steering wheel, engine, exhausts
  k.add(mesh(geo('seat', () => new THREE.BoxGeometry(0.62, 0.55, 0.16)), toon('#33363f'), 0, 0.8, -0.55));
  const sw = mesh(geo('sw', () => new THREE.TorusGeometry(0.2, 0.04, 6, 14)), dark, 0, 0.92, 0.4); sw.rotation.x = -0.9; sw.name = 'sw'; k.add(sw);
  k.add(mesh(geo('engine', () => new THREE.BoxGeometry(0.62, 0.38, 0.45)), toon('#5b616b'), 0, 0.55, -0.95));
  const ex = new THREE.Group(); ex.name = 'exhaust';
  for (const s of [-1, 1]) { const p = mesh(geo('pipe', () => new THREE.CylinderGeometry(0.07, 0.09, 0.42, 8).rotateX(Math.PI / 2 - 0.35)), toon('#c9d1dc', { metal: true }), s * 0.2, 0.68, -1.2); ex.add(p); }
  k.add(ex);
  if (body === 'saetta' || body === 'classico') {
    const wing = mesh(geo(`wing${body}`, () => new THREE.BoxGeometry(body === 'saetta' ? 1.4 : 1.15, 0.06, 0.34)), pm, 0, body === 'saetta' ? 1.12 : 0.98, -1.15); k.add(wing);
    for (const s of [-1, 1]) k.add(mesh(geo('wingpost', () => new THREE.BoxGeometry(0.05, 0.4, 0.12)), dark, s * 0.35, (body === 'saetta' ? 1.12 : 0.98) - 0.22, -1.12));
  }
  // flames (boost), drawn additive behind the exhausts
  const fl = new THREE.Group(); fl.name = 'flames'; fl.visible = false;
  for (const s of [-1, 1]) { const f = mesh(geo('flame', () => new THREE.ConeGeometry(0.13, 0.75, 8).rotateX(-Math.PI / 2).translate(0, 0, -0.35)), flameMat(), s * 0.2, 0.62, -1.42); fl.add(f); }
  k.add(fl);
  // wheels
  const W = [];
  const wx = 0.78 * wide, fz = 0.95 * long, rz = -0.85;
  for (const [x, z, front] of [[-wx, fz, true], [wx, fz, true], [-wx - 0.04, rz, false], [wx + 0.04, rz, false]]) {
    const piv = new THREE.Group(); piv.position.set(x, 0, z);
    const w = wheel(wheels, front); w.position.y = w.userData.r; w.getObjectByName('rim').material = toon(paint?.rainbow ? '#ffd23f' : col);
    piv.add(w); k.add(piv); W.push({ piv, w, front, r: w.userData.r });
  }
  // driver
  const d = driver(ch); d.name = 'driver'; tilt.add(d);
  // fewer draw calls: bake the static parts (chassis, driver body, head) into one mesh per material
  bake(k, (o) => o.name === 'sw' || o.name === 'flames' || W.some((x) => x.piv === o));
  for (const x of W) bake(x.w, () => false);
  bake(d, (o) => o.name === 'head');
  bake(d.getObjectByName('head'), () => false);
  root.userData ={ tilt, wheels: W, driver: d, flames: fl, sw, head: d.getObjectByName('head') };
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return root;
}
// merge the meshes directly inside `group` (and their static sub-groups) by material; `keep(o)`
// marks children that animate and must stay separate
const WHITE = new THREE.Color(1, 1, 1);
let vcM = null;
const vcMat = () => (vcM ||= new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGrad() }));
function bake(group, keep) {
  if (!group) return;
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const by = new Map(), drop = [];
  const visit = (o) => {
    for (const c of o.children) {
      if (keep(c)) continue;
      if (c.isMesh && !Array.isArray(c.material)) {
        const g = c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone();
        for (const n of Object.keys(g.attributes)) if (n !== 'position' && n !== 'normal' && n !== 'uv') g.deleteAttribute(n);
        if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
        g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, c.matrixWorld));
        // plain toon colours become vertex colours: they all share one material (one draw call)
        const m = c.material, plain = m.isMeshToonMaterial && !m.map && !m.transparent && m.emissive.getHex() === 0 && !m.vertexColors;
        const n = g.attributes.position.count, col = new Float32Array(n * 3);
        const cc = plain ? m.color : WHITE; for (let i = 0; i < n; i++) { col[i * 3] = cc.r; col[i * 3 + 1] = cc.g; col[i * 3 + 2] = cc.b; }
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        const key = plain ? vcMat() : m;
        if (!by.has(key)) by.set(key, []);
        by.get(key).push(g); drop.push(c);
      }
      if (!c.isMesh && c.children.length) visit(c);
      else if (c.isMesh && c.children.length) visit(c);
    }
  };
  visit(group);
  if (drop.length < 2) return;
  for (const c of drop) c.parent.remove(c);
  for (const [m, gs] of by) { const g = mergeGeometries(gs); for (const x of gs) x.dispose(); if (!g) continue; const mm = new THREE.Mesh(g, m); mm.castShadow = true; group.add(mm); }
  // empty helper groups left behind
  const empty = []; group.traverse((o) => { if (o !== group && !o.isMesh && !o.isSprite && o.children.length === 0 && !keep(o)) empty.push(o); });
  for (const e of empty) e.parent?.remove(e);
}
let rainbow = null;
function rainbowMat() {
  if (rainbow) return rainbow;
  const c = document.createElement('canvas'); c.width = 64; c.height = 8; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 64, 0); ['#ff4d6d', '#ff9a3c', '#ffe14a', '#3ee6b0', '#49b6ff', '#b28bff'].forEach((col, i) => gr.addColorStop(i / 5, col)); g.fillStyle = gr; g.fillRect(0, 0, 64, 8);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  rainbow = new THREE.MeshToonMaterial({ map: t, gradientMap: toonGrad() });
  return rainbow;
}
const numMats = new Map();
function numMat(n, col) {
  const key = n + col; if (numMats.has(key)) return numMats.get(key);
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.beginPath(); g.arc(32, 32, 31, 0, 7); g.fill();
  g.fillStyle = '#15161a'; g.font = 'italic 900 38px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), 32, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.MeshBasicMaterial({ map: t }); numMats.set(key, m); return m;
}
let flameM = null;
export function flameMat() { return (flameM ||= new THREE.MeshBasicMaterial({ color: '#ffb02e', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })); }

// ───────── items
export function makeRicciolo() {
  const pts = []; for (let i = 0; i <= 40; i++) { const t = i / 40, a = t * Math.PI * 6; pts.push(new THREE.Vector3(Math.cos(a) * 0.32, Math.sin(a) * 0.32, (t - 0.5) * 1.3)); }
  const g = geo('fusillo', () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.15, 6));
  const m = mesh(g, toon('#ffd23f', { emissive: '#4a3a00' }));
  const grp = new THREE.Group(); grp.add(m); m.name = 'spin';
  return grp;
}
export function makeBomb() {
  const g = new THREE.Group();
  g.add(mesh(geo('bomb', () => new THREE.SphereGeometry(0.55, 14, 10)), toon('#2b2d42')));
  g.add(mesh(geo('bband', () => new THREE.TorusGeometry(0.55, 0.06, 6, 16).rotateX(Math.PI / 2)), toon('#ff3b6b')));
  for (const s of [-1, 1]) g.add(mesh(geo('beye', () => new THREE.SphereGeometry(0.12, 8, 6)), toon('#ffffff'), s * 0.2, 0.15, 0.45));
  g.add(mesh(geo('fuse', () => new THREE.CylinderGeometry(0.05, 0.05, 0.35)), toon('#8a6a3a'), 0, 0.68, 0));
  const spark = mesh(geo('spark', () => new THREE.SphereGeometry(0.12, 6, 5)), flameMat(), 0, 0.88, 0); spark.name = 'spark'; g.add(spark);
  return g;
}
export function makeOilDecal() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  x.fillStyle = 'rgba(40,30,60,.95)';
  x.beginPath(); for (let i = 0; i <= 24; i++) { const a = (i / 24) * Math.PI * 2, r = 46 + Math.sin(i * 2.7) * 9 + Math.cos(i * 1.3) * 6; x.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); } x.fill();
  const gr = x.createRadialGradient(50, 50, 2, 50, 50, 30); gr.addColorStop(0, 'rgba(180,140,255,.7)'); gr.addColorStop(1, 'rgba(180,140,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
}
export function makeShield() { return new THREE.Mesh(geo('shield', () => new THREE.SphereGeometry(1.7, 20, 14)), new THREE.MeshBasicMaterial({ color: '#4ad6ff', transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false })); }
export function makeMagnet() {
  const g = new THREE.Group();
  const u = mesh(geo('magu', () => new THREE.TorusGeometry(0.35, 0.12, 8, 14, Math.PI)), toon('#ff4d6d')); u.rotation.z = Math.PI; g.add(u);
  for (const s of [-1, 1]) g.add(mesh(geo('magtip', () => new THREE.BoxGeometry(0.25, 0.18, 0.25)), toon('#e5e7eb'), s * 0.35, 0.05, 0));
  return g;
}
export function makeBalloon(color) {
  const g = new THREE.Group();
  g.add(mesh(geo('balloon', () => new THREE.SphereGeometry(0.42, 12, 10).scale(1, 1.2, 1)), toon(color, { emissive: color, emissiveIntensity: 0.15 })));
  g.add(mesh(geo('string', () => new THREE.CylinderGeometry(0.01, 0.01, 0.9)), toon('#ffffff'), 0, -0.9, 0));
  return g;
}

// ───────── hazards
export function makeBumper(kind) {
  const g = new THREE.Group();
  if (kind === 'cow') {
    const white = toon('#f4f5f7'), black = toon('#1f2126'), pink = toon('#ffb3c7');
    g.add(mesh(geo('cowb', () => new THREE.CapsuleGeometry(0.85, 1.6, 4, 10).rotateX(Math.PI / 2)), white, 0, 1.5, 0));
    for (const [x, y, z] of [[0.6, 1.9, 0.3], [-0.5, 1.4, -0.6], [0.2, 2.2, -0.9], [-0.7, 1.8, 0.7]]) g.add(mesh(geo('cows', () => new THREE.SphereGeometry(0.42, 8, 6).scale(1, 0.6, 1)), black, x, y, z));
    const head = mesh(geo('cowh', () => new THREE.BoxGeometry(0.9, 0.8, 0.9)), white, 0, 2.0, 1.55); g.add(head);
    g.add(mesh(geo('cowm', () => new THREE.BoxGeometry(0.92, 0.42, 0.4)), pink, 0, 1.78, 2.05));
    for (const s of [-1, 1]) { g.add(mesh(geo('cowhorn', () => new THREE.ConeGeometry(0.1, 0.35, 6)), toon('#f0e0b0'), s * 0.35, 2.55, 1.5)); g.add(mesh(geo('eye', () => new THREE.SphereGeometry(0.11, 10, 8)), toon('#ffffff'), s * 0.22, 2.15, 2.0)); }
    for (const [x, z] of [[-0.5, -0.8], [0.5, -0.8], [-0.5, 0.8], [0.5, 0.8]]) g.add(mesh(geo('cowleg', () => new THREE.CylinderGeometry(0.16, 0.14, 0.8, 6)), white, x, 0.4, z));
    g.add(mesh(geo('bell', () => new THREE.ConeGeometry(0.18, 0.3, 8)), toon('#f5c542', { metal: true }), 0, 1.45, 1.6));
  } else if (kind === 'ball') {
    const c = document.createElement('canvas'); c.width = 128; c.height = 64; const x = c.getContext('2d');
    ['#ff4d6d', '#ffffff', '#ffd23f', '#ffffff', '#22b8ff', '#ffffff'].forEach((col, i) => { x.fillStyle = col; x.fillRect(i * 128 / 6, 0, 128 / 6 + 1, 64); });
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    g.add(mesh(geo('ball', () => new THREE.SphereGeometry(2, 20, 14)), new THREE.MeshToonMaterial({ map: t, gradientMap: toonGrad() }), 0, 2, 0));
  } else if (kind === 'boulder' || kind === 'snowball') {
    g.add(mesh(geo(kind, () => (kind === 'boulder' ? new THREE.DodecahedronGeometry(2, 1) : new THREE.IcosahedronGeometry(2, 2))), toon(kind === 'boulder' ? '#8a5a3a' : '#f4f8ff'), 0, 2, 0));
    if (kind === 'snowball') for (const s of [-1, 1]) g.add(mesh(geo('coal', () => new THREE.SphereGeometry(0.2, 6, 5)), toon('#1a1a1a'), s * 0.6, 2.7, 1.75));
  } else if (kind === 'crate') {
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
    x.fillStyle = '#c98a4b'; x.fillRect(0, 0, 64, 64); x.strokeStyle = '#8a5a2a'; x.lineWidth = 5; x.strokeRect(3, 3, 58, 58); x.beginPath(); x.moveTo(4, 4); x.lineTo(60, 60); x.moveTo(60, 4); x.lineTo(4, 60); x.stroke();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    g.add(mesh(geo('crate', () => new THREE.BoxGeometry(3.2, 3.2, 3.2)), new THREE.MeshToonMaterial({ map: t, gradientMap: toonGrad() }), 0, 1.6, 0));
  } else if (kind === 'press') {
    g.add(mesh(geo('pressb', () => new THREE.CylinderGeometry(2.4, 2.4, 0.8, 18)), toon('#ff5fa2'), 0, 1.2, 0));
    g.add(mesh(geo('cookie', () => new THREE.CylinderGeometry(2.1, 2.1, 0.5, 18)), toon('#e0a060'), 0, 0.5, 0));
    for (let i = 0; i < 6; i++) { const a = i * 1.05; g.add(mesh(geo('chip', () => new THREE.SphereGeometry(0.22, 6, 5)), toon('#5a2a1a'), Math.cos(a) * 1.2, 0.78, Math.sin(a) * 1.2)); }
    g.add(mesh(geo('pressr', () => new THREE.CylinderGeometry(0.4, 0.4, 6, 10)), toon('#c9d1dc', { metal: true }), 0, 4.4, 0));
  } else if (kind === 'planet') {
    g.add(mesh(geo('planet', () => new THREE.SphereGeometry(2, 18, 14)), toon('#ff9a3c', { emissive: '#552000' }), 0, 2.2, 0));
    const ring = mesh(geo('pring', () => new THREE.TorusGeometry(3, 0.18, 6, 30).rotateX(Math.PI / 2 - 0.4)), toon('#5ef2ff', { emissive: '#1a6a7a' }), 0, 2.2, 0); g.add(ring);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// item box: translucent rainbow cube with a "?" on every face
let boxMat = null;
export function itemBoxMaterial() {
  if (boxMat) return boxMat;
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  const gr = x.createLinearGradient(0, 0, 128, 128); ['#ff4d6d', '#ffd23f', '#3ee6b0', '#49b6ff', '#b28bff'].forEach((col, i) => gr.addColorStop(i / 4, col));
  x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
  x.fillStyle = 'rgba(255,255,255,.35)'; x.fillRect(10, 10, 108, 108);
  x.fillStyle = '#ffffff'; x.font = '900 92px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineWidth = 8; x.strokeStyle = 'rgba(40,20,80,.55)'; x.strokeText('?', 64, 70); x.fillText('?', 64, 70);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  boxMat = new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.88 });
  return boxMat;
}
