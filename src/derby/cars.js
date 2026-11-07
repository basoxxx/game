// Demolition "bangers": old saloons, muscle cars, pick-ups and hatchbacks with rusty, dirty paint.
// Bodies are unique (non-shared) geometries so they can be dented vertex by vertex; bumpers,
// bonnet, boot lid and spoiler are separate meshes that can be torn off and thrown into the world.
import * as THREE from 'three';

export const BANGERS = [
  { id: 'berlina', name: 'Torpedo 78', desc: 'Berlina anni ’70: pesante, robusta, prevedibile.', mass: 1450, power: 1.0, top: 1.0, armor: 1.25, grip: 1.0, color: '#7a1f1f' },
  { id: 'muscle', name: 'Bisonte V8', desc: 'Muscle car: tanta potenza, coda nervosa.', mass: 1500, power: 1.28, top: 1.12, armor: 1.0, grip: 0.92, color: '#1f3f7a' },
  { id: 'pickup', name: 'Mulo 4x4', desc: 'Pick-up a trazione integrale: un ariete.', mass: 1750, power: 1.08, top: 0.92, armor: 1.5, grip: 1.08, awd: true, color: '#5b6b2b' },
  { id: 'utilitaria', name: 'Grillo GT', desc: 'Utilitaria leggera e agile, ma fragile.', mass: 1050, power: 0.9, top: 0.98, armor: 0.75, grip: 1.12, color: '#c99a12' },
];
export const AI_COLORS = ['#9b2c2c', '#2c5d9b', '#3d7a3a', '#b8761c', '#6b3d8f', '#2b8a8a', '#8f8f8f', '#c7c2b0', '#3a3a3a', '#a33b6b', '#47602b'];

// ---------- materials ----------
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
function rand(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
// u along the car (rear->front), v around (0 right side, .25 top, .5 left, .75 bottom)
function bangerPaint(color, number, seed) {
  const R = rand(seed * 977 + 13);
  const tex = canvasTex(1024, 512, (g, W, H) => {
    g.fillStyle = color; g.fillRect(0, 0, W, H);
    // faded / sun-bleached top
    const gr = g.createLinearGradient(0, H * 0.5, 0, H * 0.75); gr.addColorStop(0, 'rgba(255,255,255,0.08)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, H * 0.5, W, H * 0.25);
    // racing stripe
    if (R() < 0.6) { g.fillStyle = R() < 0.5 ? '#f2efe6' : '#141414'; g.fillRect(0, H * 0.72, W, H * 0.06); }
    // rust and primer patches
    for (let i = 0; i < 26; i++) {
      const x = R() * W, y = R() * H, r = 8 + R() * 46;
      const rg = g.createRadialGradient(x, y, 0, x, y, r);
      const rust = R() < 0.7; rg.addColorStop(0, rust ? 'rgba(122,58,22,0.95)' : 'rgba(120,124,128,0.9)'); rg.addColorStop(0.6, rust ? 'rgba(92,44,18,0.7)' : 'rgba(110,112,116,0.5)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rg; g.beginPath(); g.ellipse(x, y, r, r * (0.4 + R() * 0.8), R() * 3, 0, 7); g.fill();
    }
    // mud along the bottom of the sides
    for (const v0 of [0.0, 0.5]) { const y0 = H - v0 * H; const m = g.createLinearGradient(0, y0, 0, y0 - H * 0.12); m.addColorStop(0, 'rgba(70,52,34,0.95)'); m.addColorStop(1, 'rgba(70,52,34,0)'); g.fillStyle = m; g.fillRect(0, y0 - H * 0.12, W, H * 0.12); }
    g.fillStyle = 'rgba(60,44,30,0.9)'; g.fillRect(0, H * 0.12, W, H * 0.13);
    // door roundel with number (both sides)
    for (const [vc, flip] of [[0.06, false], [0.44, true]]) {
      g.save(); g.translate(W * 0.5, H - vc * H); if (flip) g.rotate(Math.PI);
      g.fillStyle = '#f4f1e8'; g.beginPath(); g.arc(0, 0, 44, 0, 7); g.fill(); g.lineWidth = 6; g.strokeStyle = '#111'; g.stroke();
      g.fillStyle = '#111'; g.font = '900 56px "Exo 2", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(number), 0, 3); g.restore();
    }
    // scratches
    g.strokeStyle = 'rgba(230,230,230,0.35)'; g.lineWidth = 1.5; for (let i = 0; i < 40; i++) { const x = R() * W, y = R() * H; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (R() - 0.5) * 90, y + (R() - 0.5) * 10); g.stroke(); }
  });
  return new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.62, metalness: 0.25, clearcoat: 0.25, clearcoatRoughness: 0.5 });
}
const M = {
  dark: new THREE.MeshStandardMaterial({ color: 0x16171a, roughness: 0.85 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xc9ccd1, roughness: 0.25, metalness: 1 }),
  rubber: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.95 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x6d7076, roughness: 0.5, metalness: 0.8 }),
  glass: new THREE.MeshPhysicalMaterial({ color: 0x0f151c, roughness: 0.08, metalness: 0.6, clearcoat: 1 }),
  head: new THREE.MeshStandardMaterial({ color: 0xfff4d8, emissive: 0xfff0c8, emissiveIntensity: 0.6, roughness: 0.3 }),
  tail: new THREE.MeshStandardMaterial({ color: 0xff2a1a, emissive: 0xff1a0a, emissiveIntensity: 0.9, roughness: 0.3 }),
  cage: new THREE.MeshStandardMaterial({ color: 0xd8d8d8, roughness: 0.5, metalness: 0.6 }),
};

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
  return g;
}
function mesh(g, m) { const o = new THREE.Mesh(g, m); o.castShadow = true; o.receiveShadow = true; return o; }
function box(w, h, d, m, x, y, z) { const o = mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); return o; }

function wheel(r, w) {
  const grp = new THREE.Group(), spin = new THREE.Group(); grp.add(spin);
  const prof = []; const rr = w * 0.25, rimR = r * 0.58;
  prof.push(new THREE.Vector2(rimR, -w / 2));
  for (let k = 0; k <= 5; k++) { const a = -Math.PI / 2 + (k / 5) * (Math.PI / 2); prof.push(new THREE.Vector2(r - rr + Math.cos(a) * rr, -w / 2 + rr + Math.sin(a) * rr)); }
  for (let k = 0; k <= 5; k++) { const a = (k / 5) * (Math.PI / 2); prof.push(new THREE.Vector2(r - rr + Math.cos(a) * rr, w / 2 - rr + Math.sin(a) * rr)); }
  prof.push(new THREE.Vector2(rimR, w / 2));
  const tg = new THREE.LatheGeometry(prof, 28); tg.rotateX(Math.PI / 2); spin.add(mesh(tg, M.rubber));
  for (const sg of [1, -1]) {
    const disc = mesh(new THREE.CylinderGeometry(rimR, rimR * 0.9, 0.04, 20), M.steel); disc.rotation.x = Math.PI / 2; disc.position.z = sg * w * 0.32; spin.add(disc);
    for (let k = 0; k < 5; k++) { const h = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.05, 6), M.dark); h.rotation.x = Math.PI / 2; const a = (k / 5) * Math.PI * 2; h.position.set(Math.cos(a) * rimR * 0.55, Math.sin(a) * rimR * 0.55, sg * w * 0.35); spin.add(h); }
  }
  grp.userData.spin = spin; return grp;
}

// returns THREE.Group with userData { wheels[], body (deformable mesh), parts[] (detachables), wheelPos[], dims }
export function buildBanger(type, color, number = 7, seed = 1) {
  const car = new THREE.Group();
  const paint = bangerPaint(color, number, seed);
  const pm = new THREE.MeshPhysicalMaterial({ color, roughness: 0.6, metalness: 0.25, clearcoat: 0.2 });
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
  const body = mesh(hull(lower, { seg: 40, Q: 9 }), paint); car.add(body);
  // greenhouse: cabin over the middle (pick-up: short cab, then bed)
  const cabRear = type === 'pickup' ? -0.15 : type === 'utilitaria' ? -L + 0.15 : -L + 0.7, cabFront = type === 'utilitaria' ? 0.75 : type === 'pickup' ? 1.0 : 0.85;
  const winTex = canvasTex(512, 256, (g, W, H) => { g.fillStyle = color; g.fillRect(0, 0, W, H); g.fillStyle = 'rgba(60,44,30,0.35)'; g.fillRect(0, 0, W, H); const win = (u0, u1, v0, v1) => { g.fillStyle = '#0d1218'; g.fillRect(u0 * W, H - v1 * H, (u1 - u0) * W, (v1 - v0) * H); g.strokeStyle = 'rgba(200,220,240,0.25)'; g.lineWidth = 3; g.beginPath(); g.moveTo(u0 * W + 20, H - v1 * H + 10); g.lineTo(u0 * W + 70, H - v0 * H - 10); g.stroke(); }; for (const [a, b] of [[0.015, 0.1], [0.4, 0.485]]) { win(0.1, 0.47, a, b); win(0.53, 0.88, a, b); } win(0.86, 0.995, 0.12, 0.38); win(0.005, 0.12, 0.12, 0.38); });
  const gm = new THREE.MeshPhysicalMaterial({ map: winTex, roughness: 0.45, metalness: 0.2, clearcoat: 0.4 });
  const cab = mesh(hull([
    { x: cabRear, top: beltY + 0.08, bot: beltY - 0.02, belt: beltY, w: Wd - 0.08, wt: Wd - 0.18, n: 5 },
    { x: cabRear + 0.3, top: roofY, bot: beltY - 0.02, belt: beltY + 0.02, w: Wd - 0.1, wt: Wd - 0.24, n: 5 },
    { x: cabFront - 0.45, top: roofY - 0.02, bot: beltY - 0.02, belt: beltY + 0.02, w: Wd - 0.1, wt: Wd - 0.26, n: 5 },
    { x: cabFront, top: beltY + 0.06, bot: beltY - 0.04, belt: beltY, w: Wd - 0.1, wt: Wd - 0.2, n: 5 },
  ], { seg: 18, Q: 7 }), gm); car.add(cab);
  // roll cage bars visible through windows, roof number board
  car.add(box(0.5, 0.02, 0.5, M.cage, (cabRear + cabFront) / 2, roofY + 0.02, 0));
  const parts = [];
  const part = (o, zone, hp) => { o.userData.zone = zone; o.userData.hp = hp; car.add(o); parts.push(o); return o; };
  // bumpers, bonnet, boot, spoiler, mirrors, exhaust
  part(box(0.16, 0.18, Wd * 2 - 0.05, M.chrome, L + 0.04, 0.42, 0), 'front', 26);
  part(box(0.16, 0.18, Wd * 2 - 0.05, M.chrome, -L - 0.04, 0.42, 0), 'rear', 26);
  const bonnet = part(mesh(hull([{ x: cabFront + 0.05, top: beltY + 0.035, bot: beltY - 0.01, w: Wd - 0.12, n: 6 }, { x: L - 0.12, top: beltY - 0.12, bot: beltY - 0.17, w: Wd - 0.18, n: 6 }], { seg: 6, Q: 5, u0: 0.62, u1: 0.95 }), paint), 'front', 34);
  if (type === 'muscle') { const sc = box(0.5, 0.12, 0.4, M.dark, 1.15, beltY + 0.08, 0); bonnet.add(sc); }
  if (type !== 'pickup') part(mesh(hull([{ x: -L + 0.12, top: beltY - 0.03, bot: beltY - 0.08, w: Wd - 0.16, n: 6 }, { x: cabRear + 0.02, top: beltY + 0.04, bot: beltY - 0.01, w: Wd - 0.12, n: 6 }], { seg: 6, Q: 5, u0: 0.05, u1: 0.3 }), paint), 'rear', 30);
  else { car.add(box(1.7, 0.05, Wd * 2 - 0.2, M.dark, -1.25, beltY - 0.02, 0)); part(box(0.06, 0.38, Wd * 2 - 0.1, pm, -L + 0.03, beltY - 0.18, 0), 'rear', 30); }
  if (type === 'muscle' || type === 'utilitaria') part(box(0.32, 0.04, Wd * 2 - 0.25, M.dark, -L + 0.2, beltY + 0.18, 0), 'rear', 14);
  for (const z of [Wd + 0.05, -Wd - 0.05]) part(box(0.12, 0.09, 0.08, pm, cabFront - 0.15, beltY + 0.15, z), z > 0 ? 'left' : 'right', 8);
  for (const z of [0.55, -0.55]) { car.add(box(0.04, 0.12, 0.26, M.head, L - 0.01, 0.66, z)); car.add(box(0.04, 0.1, 0.24, M.tail, -L + 0.01, 0.7, z)); }
  const ex = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 10), M.chrome); ex.rotation.z = Math.PI / 2; ex.position.set(-L - 0.1, 0.32, -0.5); car.add(ex);
  // underbody shadow plate
  car.add(box(L * 2 - 0.4, 0.04, Wd * 2 - 0.3, M.dark, 0, 0.27, 0));
  // wheels
  const wr = type === 'pickup' ? 0.4 : 0.34, ww = type === 'pickup' ? 0.3 : 0.24, wx = L - 0.72, wz = Wd - 0.12;
  const wheels = [], wheelPos = [];
  for (const [x, z] of [[wx, wz], [wx, -wz], [-wx + 0.05, wz], [-wx + 0.05, -wz]]) { const w = wheel(wr, ww); w.position.set(x, wr, z); car.add(w); wheels.push(w); wheelPos.push([x, z]); }
  // keep the original body vertices for deformation
  body.geometry.userData.orig = Float32Array.from(body.geometry.attributes.position.array);
  cab.geometry.userData.orig = Float32Array.from(cab.geometry.attributes.position.array);
  car.userData = { wheels, wheelPos, wr, body, cab, parts, dims: { L, W: Wd, H: roofY }, paint };
  return car;
}

// Dent the body around a local-space point. dir: local direction of the push. amount in metres.
export function dent(car, local, dir, amount) {
  const geos = [car.userData.body.geometry, car.userData.cab.geometry];
  for (const g of geos) {
    const P = g.attributes.position; const R = 0.55 + amount * 1.6;
    let touched = false;
    for (let i = 0; i < P.count; i++) {
      const dx = P.getX(i) - local.x, dy = P.getY(i) - local.y, dz = P.getZ(i) - local.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz); if (d > R) continue;
      const f = (1 - d / R) ** 2 * amount;
      let nx = P.getX(i) + dir.x * f, ny = P.getY(i) + dir.y * f * 0.6 - f * 0.08, nz = P.getZ(i) + dir.z * f;
      const O = g.userData.orig;
      if (O) { const ox = O[i * 3], oy = O[i * 3 + 1], oz = O[i * 3 + 2]; const dd = Math.hypot(nx - ox, ny - oy, nz - oz); if (dd > 0.42) { const k = 0.42 / dd; nx = ox + (nx - ox) * k; ny = oy + (ny - oy) * k; nz = oz + (nz - oz) * k; } }
      P.setXYZ(i, nx, ny, nz);
      touched = true;
    }
    if (touched) { P.needsUpdate = true; g.computeVertexNormals(); }
  }
}
