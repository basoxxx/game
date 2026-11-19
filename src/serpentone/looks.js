// Serpentone — cartoon heads: glossy head, big eyes that blink and look around, a flicking tongue and
// the hats from the shop. Everything is built from primitives in a unit space (head radius 1).
import * as THREE from 'three';

const G = {};
const geo = (k, f) => G[k] || (G[k] = f());
const M = {};
const mat = (c, o = {}) => { const k = c + JSON.stringify(o); return M[k] || (M[k] = new THREE.MeshPhongMaterial({ color: c, shininess: 70, ...o })); };

export function buildHat(id, accent = '#ff3b5c') {
  const g = new THREE.Group();
  const add = (geom, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1) => { const o = new THREE.Mesh(geom, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.scale.setScalar(s); g.add(o); return o; };
  switch (id) {
    case 'berretto':
      add(geo('cap', () => new THREE.SphereGeometry(0.62, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2)), mat(accent), 0, 0.7, 0);
      add(geo('brim', () => new THREE.CylinderGeometry(0.5, 0.5, 0.06, 16, 1, false, -Math.PI / 2, Math.PI)), mat(accent), 0.35, 0.72, 0, 0, 0, 0);
      add(geo('pomp', () => new THREE.SphereGeometry(0.12, 8, 6)), mat('#ffffff'), 0, 1.33, 0);
      break;
    case 'festa': {
      const tex = stripes(accent, '#ffe14d');
      add(geo('cone', () => new THREE.ConeGeometry(0.42, 1.1, 18)), new THREE.MeshPhongMaterial({ map: tex, shininess: 50 }), 0, 1.25, 0, 0, 0, -0.15);
      add(geo('pomp2', () => new THREE.SphereGeometry(0.17, 10, 8)), mat('#ffffff'), -0.08, 1.82, 0);
      break;
    }
    case 'cilindro':
      add(geo('cyl', () => new THREE.CylinderGeometry(0.42, 0.42, 0.85, 20)), mat('#1b1b22', { shininess: 30 }), 0, 1.25, 0);
      add(geo('disc', () => new THREE.CylinderGeometry(0.72, 0.72, 0.06, 24)), mat('#1b1b22', { shininess: 30 }), 0, 0.84, 0);
      add(geo('band', () => new THREE.CylinderGeometry(0.43, 0.43, 0.16, 20)), mat(accent), 0, 0.96, 0);
      break;
    case 'elica': {
      add(geo('cap', () => new THREE.SphereGeometry(0.62, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2)), mat('#2f6bff'), 0, 0.7, 0);
      add(geo('stick', () => new THREE.CylinderGeometry(0.04, 0.04, 0.3, 6)), mat('#dddddd'), 0, 1.45, 0);
      const p = new THREE.Group(); p.position.y = 1.6; g.add(p); g.userData.spin = p;
      for (const [c, a] of [['#ff3b5c', 0], ['#ffd23f', Math.PI]]) { const b = new THREE.Mesh(geo('blade', () => new THREE.BoxGeometry(0.75, 0.04, 0.2)), mat(c)); b.position.x = Math.cos(a) * 0.38; b.position.z = Math.sin(a) * 0.38; p.add(b); }
      break;
    }
    case 'fiocco':
      add(geo('bowl', () => new THREE.ConeGeometry(0.3, 0.55, 12)), mat('#ff5fa2'), 0, 1.0, 0.3, -Math.PI / 2);
      add(geo('bowl', () => new THREE.ConeGeometry(0.3, 0.55, 12)), mat('#ff5fa2'), 0, 1.0, -0.3, Math.PI / 2);
      add(geo('knot', () => new THREE.SphereGeometry(0.16, 10, 8)), mat('#ff5fa2'), 0, 1.0, 0);
      break;
    case 'corona': {
      const gold = mat('#ffcc1a', { emissive: '#553300', shininess: 120, specular: '#fff3b0' });
      add(geo('crown', () => new THREE.CylinderGeometry(0.5, 0.44, 0.34, 20, 1, true)), new THREE.MeshPhongMaterial({ color: '#ffcc1a', emissive: '#553300', shininess: 120, specular: '#fff3b0', side: THREE.DoubleSide }), 0, 0.98, 0);
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; add(geo('spike', () => new THREE.ConeGeometry(0.1, 0.3, 6)), gold, Math.cos(a) * 0.47, 1.3, Math.sin(a) * 0.47); add(geo('gem', () => new THREE.SphereGeometry(0.07, 8, 6)), mat(i & 1 ? '#ff2b5c' : '#2bd0ff', { emissive: '#330011' }), Math.cos(a) * 0.5, 1.0, Math.sin(a) * 0.5); }
      break;
    }
    case 'vichingo':
      add(geo('helm', () => new THREE.SphereGeometry(0.72, 18, 9, 0, Math.PI * 2, 0, Math.PI / 2)), mat('#9aa3ad', { shininess: 110 }), 0, 0.55, 0);
      add(geo('horn', () => new THREE.ConeGeometry(0.16, 0.7, 10)), mat('#fff5dc'), 0, 1.0, 0.72, -0.9, 0, 0);
      add(geo('horn', () => new THREE.ConeGeometry(0.16, 0.7, 10)), mat('#fff5dc'), 0, 1.0, -0.72, 0.9, 0, 0);
      add(geo('rim', () => new THREE.TorusGeometry(0.72, 0.06, 6, 24).rotateX(Math.PI / 2)), mat('#c49a3a'), 0, 0.57, 0);
      break;
    case 'aureola':
      add(geo('halo', () => new THREE.TorusGeometry(0.5, 0.07, 8, 32).rotateX(Math.PI / 2)), new THREE.MeshBasicMaterial({ color: '#fff27a' }), 0, 1.55, 0);
      g.userData.bob = g.children[0];
      break;
  }
  return g;
}
const stripeCache = {};
function stripes(a, b) {
  const k = a + b; if (stripeCache[k]) return stripeCache[k];
  const c = document.createElement('canvas'); c.width = 32; c.height = 64; const x = c.getContext('2d');
  for (let i = 0; i < 8; i++) { x.fillStyle = i & 1 ? b : a; x.fillRect(0, i * 8, 32, 8); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return (stripeCache[k] = t);
}

// head: glossy sphere (stretched forward a little), eyes, pupils, tongue, hat
export function buildHead(color, hat, accent) {
  const g = new THREE.Group();
  const head = new THREE.Mesh(geo('head', () => new THREE.SphereGeometry(1, 24, 16)), new THREE.MeshPhongMaterial({ color, shininess: 60, specular: '#2a2a2a', emissive: '#000000' }));
  head.scale.set(1.18, 0.9, 1.0); g.add(head);
  const eyeM = mat('#ffffff', { shininess: 120 }), pupM = mat('#111111', { shininess: 150, specular: '#ffffff' });
  const eyes = [];
  for (const s of [-1, 1]) {
    const e = new THREE.Group(); e.position.set(0.45, 0.48, s * 0.45); g.add(e);
    const w = new THREE.Mesh(geo('eye', () => new THREE.SphereGeometry(0.4, 16, 12)), eyeM); e.add(w);
    const p = new THREE.Mesh(geo('pupil', () => new THREE.SphereGeometry(0.21, 12, 10)), pupM); p.position.set(0.25, 0.02, 0); e.add(p);
    eyes.push({ e, p });
  }
  const tongue = new THREE.Mesh(geo('tongue', () => { const b = new THREE.BoxGeometry(0.9, 0.04, 0.12); b.translate(0.45, 0, 0); return b; }), mat('#ff2f5a'));
  tongue.position.set(0.9, -0.1, 0); tongue.scale.x = 0.001; g.add(tongue);
  const cheek = mat('#ff7a9a', { transparent: true, opacity: 0.55 });
  for (const s of [-1, 1]) { const c = new THREE.Mesh(geo('cheek', () => new THREE.CircleGeometry(0.16, 12)), cheek); c.position.set(0.55, 0.05, s * 0.85); c.rotation.y = s > 0 ? 0.7 : Math.PI - 0.7; g.add(c); }
  const h = buildHat(hat, accent); g.add(h);
  return { g, head, eyes, tongue, hat: h };
}
