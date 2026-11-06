// Procedural low-poly 3D car models with liveries (Three.js)
import * as THREE from 'three';

const matCache = new Map();
function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.35, metalness: opts.metal ?? 0.25, emissive: opts.emissive || 0x000000, emissiveIntensity: opts.ei ?? 1 });
  matCache.set(key, m);
  return m;
}
const black = () => mat('#0d0e11', { rough: 0.6, metal: 0.1 });
const carbon = () => mat('#16181c', { rough: 0.45, metal: 0.3 });

function box(w, h, d, m, x = 0, y = 0, z = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(g, m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}
// tapered box: front narrower/lower (along +x)
function taper(len, wBack, wFront, hBack, hFront, m, x = 0, y = 0, z = 0) {
  const g = new THREE.BoxGeometry(len, 1, 1, 4, 1, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = (p.getX(i) + len / 2) / len; // 0 back -> 1 front
    const w = wBack + (wFront - wBack) * t, h = hBack + (hFront - hBack) * t;
    p.setY(i, p.getY(i) * h + (p.getY(i) > 0 ? 0 : 0));
    p.setZ(i, p.getZ(i) * w);
  }
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

function wheel(r, w, tyreColor) {
  const grp = new THREE.Group();
  const tyre = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 20), black());
  tyre.rotation.x = Math.PI / 2;
  tyre.castShadow = true;
  grp.add(tyre);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.62, r * 0.62, w + 0.02, 14), mat('#2b2f36', { metal: 0.8, rough: 0.3 }));
  rim.rotation.x = Math.PI / 2;
  grp.add(rim);
  const band = new THREE.Mesh(new THREE.TorusGeometry(r * 0.8, r * 0.05, 6, 24), mat(tyreColor || '#ffd400', { rough: 0.5 }));
  band.position.z = w / 2 + 0.005;
  grp.add(band);
  const band2 = band.clone(); band2.position.z = -w / 2 - 0.005; grp.add(band2);
  grp.userData.spin = [tyre, rim];
  return grp;
}

function prof(points, width, m, bevel = 0.08, z = 0) {
  const sh = new THREE.Shape();
  points.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.01, width - bevel * 2), bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3, curveSegments: 8 });
  g.translate(0, 0, -(width - bevel * 2) / 2 + z);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, m);
  mesh.castShadow = true;
  return mesh;
}
const glass = () => mat('#0b1017', { rough: 0.05, metal: 0.9 });

export function buildCar(category, livery, opts = {}) {
  const L = { primary: '#e10600', secondary: '#ffffff', accent: '#111111', ...livery };
  const P = mat(L.primary, { rough: 0.22, metal: 0.4 });
  const S = mat(L.secondary, { rough: 0.28, metal: 0.35 });
  const A = mat(L.accent, { rough: 0.32, metal: 0.3 });
  const car = new THREE.Group();
  const wheels = [];
  if (category === 'rally') {
    car.add(prof([[2.05, 0.3], [2.1, 0.62], [1.92, 0.82], [1.0, 0.97], [0.55, 1.02], [-0.2, 1.48], [-1.5, 1.46], [-1.95, 1.05], [-2.05, 0.95], [-2.05, 0.3]], 1.82, P, 0.1));
    car.add(prof([[0.5, 1.04], [-0.17, 1.43], [-1.47, 1.41], [-1.86, 1.06]], 1.85, glass(), 0.1));
    car.add(prof([[2.0, 0.3], [2.07, 0.52], [-2.04, 0.52], [-2.04, 0.3]], 1.88, S, 0.06));
    car.add(prof([[2.0, 0.52], [2.05, 0.58], [-2.0, 0.58], [-2.0, 0.52]], 1.9, A, 0.02));
    car.add(box(0.55, 0.06, 1.9, A, -1.95, 1.6, 0));
    car.add(box(0.08, 0.3, 0.06, A, -1.85, 1.45, 0.65)); car.add(box(0.08, 0.3, 0.06, A, -1.85, 1.45, -0.65));
    car.add(box(0.5, 0.32, 0.02, mat('#ffffff'), -0.1, 0.78, 1.0)); car.add(box(0.5, 0.32, 0.02, mat('#ffffff'), -0.1, 0.78, -1.0));
    for (const z of [-0.45, -0.15, 0.15, 0.45]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.08, 14), mat('#fff8d0', { emissive: '#fff2b0', ei: 0.9 })); l.rotation.z = Math.PI / 2; l.position.set(2.1, 0.88, z); car.add(l); }
    for (const [x, z] of [[1.32, 0.86], [1.32, -0.86], [-1.3, 0.86], [-1.3, -0.86]]) { const w = wheel(0.34, 0.25, '#888'); w.position.set(x, 0.34, z); car.add(w); wheels.push(w); }
  } else if (category === 'endurance') {
    car.add(prof([[2.45, 0.18], [2.52, 0.4], [2.15, 0.6], [1.55, 0.8], [1.0, 0.72], [0.6, 0.76], [-0.2, 1.16], [-0.95, 1.1], [-1.3, 0.84], [-1.85, 0.9], [-2.45, 0.82], [-2.5, 0.22]], 1.96, P, 0.14));
    car.add(prof([[0.58, 0.78], [-0.2, 1.19], [-0.92, 1.13], [-0.92, 0.82]], 1.28, glass(), 0.06));
    car.add(prof([[2.4, 0.18], [2.47, 0.33], [-2.48, 0.33], [-2.48, 0.18]], 2.02, S, 0.04));
    car.add(prof([[-0.6, 1.12], [-2.2, 1.12], [-2.2, 0.85], [-1.2, 0.9]], 0.05, S, 0));
    car.add(box(0.5, 0.06, 2.0, A, -2.4, 1.2, 0));
    car.add(box(0.36, 0.42, 0.05, A, -2.35, 1.0, 0.98)); car.add(box(0.36, 0.42, 0.05, A, -2.35, 1.0, -0.98));
    car.add(box(0.04, 0.08, 0.55, mat('#fffbe0', { emissive: '#fff5c0', ei: 1.4 }), 2.44, 0.5, 0.6));
    car.add(box(0.04, 0.08, 0.55, mat('#fffbe0', { emissive: '#fff5c0', ei: 1.4 }), 2.44, 0.5, -0.6));
    car.add(box(0.04, 0.05, 1.7, mat('#ff2020', { emissive: '#ff0000', ei: 1.4 }), -2.52, 0.72, 0));
    for (const [x, z] of [[1.55, 0.88], [1.55, -0.88], [-1.6, 0.88], [-1.6, -0.88]]) { const w = wheel(0.36, 0.32, '#ffd400'); w.position.set(x, 0.36, z); car.add(w); wheels.push(w); }
  } else {
    car.add(prof([[2.95, 0.16], [2.95, 0.24], [2.3, 0.42], [1.2, 0.6], [0.45, 0.7], [0.1, 0.66], [-0.5, 0.68], [-0.5, 0.14], [2.9, 0.12]], 0.62, P, 0.1));
    car.add(prof([[-0.35, 0.68], [-0.15, 1.02], [-0.65, 1.04], [-1.6, 0.72], [-2.3, 0.52], [-2.35, 0.2], [-0.35, 0.18]], 0.6, P, 0.1));
    car.add(prof([[0.7, 0.3], [0.45, 0.6], [-0.4, 0.64], [-1.45, 0.42], [-1.85, 0.2], [0.7, 0.18]], 1.45, S, 0.13));
    car.add(prof([[0.65, 0.36], [0.5, 0.52], [-0.5, 0.56], [-0.5, 0.36]], 1.62, P, 0.06));
    car.add(box(4.6, 0.04, 1.45, carbon(), -0.1, 0.1, 0));
    car.add(prof([[3.1, 0.08], [3.1, 0.12], [2.45, 0.18], [2.45, 0.08]], 1.95, A, 0.02));
    car.add(prof([[2.95, 0.16], [2.95, 0.2], [2.5, 0.28], [2.5, 0.2]], 1.86, S, 0.02));
    car.add(box(0.6, 0.26, 0.04, A, 2.8, 0.2, 0.98)); car.add(box(0.6, 0.26, 0.04, A, 2.8, 0.2, -0.98));
    car.add(prof([[-2.05, 0.9], [-2.0, 0.96], [-2.5, 1.0], [-2.55, 0.92]], 1.0, A, 0.02));
    car.add(prof([[-2.15, 1.02], [-2.12, 1.06], [-2.45, 1.1], [-2.48, 1.04]], 1.0, S, 0.02));
    car.add(prof([[-2.0, 0.4], [-2.0, 1.1], [-2.6, 1.12], [-2.6, 0.5]], 0.04, P, 0, 0.5)); car.add(prof([[-2.0, 0.4], [-2.0, 1.1], [-2.6, 1.12], [-2.6, 0.5]], 0.04, P, 0, -0.5));
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.035, 6, 16, Math.PI), carbon());
    halo.rotation.set(0, Math.PI / 2, -0.25); halo.position.set(0.15, 0.82, 0); car.add(halo);
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 10), mat(opts.helmet || '#ffd400', { rough: 0.2, metal: 0.4 }));
    helmet.position.set(-0.05, 0.84, 0); car.add(helmet);
    for (const x of [1.45, -1.45]) for (const z of [0.45, -0.45]) car.add(box(0.05, 0.03, 0.6, carbon(), x, 0.33, z * 1.25));
    for (const [x, z, r, w] of [[1.5, 0.84, 0.33, 0.33], [1.5, -0.84, 0.33, 0.33], [-1.62, 0.8, 0.36, 0.42], [-1.62, -0.8, 0.36, 0.42]]) { const wh = wheel(r, w, opts.tyre || '#ffd400'); wh.position.set(x, r, z); car.add(wh); wheels.push(wh); }
  }
  car.userData.wheels = wheels;
  return car;
}

export function setTyreColor(car, color) {
  for (const w of car.userData.wheels || []) for (const ch of w.children) if (ch.geometry?.type === 'TorusGeometry') ch.material = mat(color, { rough: 0.5 });
}
