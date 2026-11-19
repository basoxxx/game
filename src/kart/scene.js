// Kart Baso — static scenery for a track or an arena: sky, lights, road ribbons, shoulders and
// terrain, kerbs, barriers, start gantry, ramps, boost pads, puddles and themed props (instanced).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toon, toonGrad } from './models.js';
import { rng, hashStr } from './track.js';

const cv = (w, h, f) => { const c = document.createElement('canvas'); c.width = w; c.height = h; f(c.getContext('2d'), w, h); return c; };
function tex(c, rep = true, srgb = true) { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t; }
const shade = (hex, f) => { const c = new THREE.Color(hex); c.multiplyScalar(f); return '#' + c.getHexString(); };

// ───────── textures
function roadTexture(T, kind) {
  return tex(cv(256, 256, (g, w, h) => {
    const R = rng(7);
    if (kind === 'cometa') {
      g.fillStyle = T.road; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(94,242,255,.25)'; g.lineWidth = 2; for (let x = 0; x <= w; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); } for (let y = 0; y <= h; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      g.fillStyle = '#5ef2ff'; g.fillRect(0, 0, 10, h); g.fillStyle = '#ff4dd2'; g.fillRect(w - 10, 0, 10, h);
      return;
    }
    g.fillStyle = T.road; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) { g.fillStyle = R() < 0.5 ? 'rgba(0,0,0,.10)' : 'rgba(255,255,255,.07)'; g.fillRect(R() * w, R() * h, 1 + R() * 2, 1 + R() * 2); }
    if (kind === 'biscotti') { g.fillStyle = 'rgba(160,100,40,.35)'; for (let y = 16; y < h; y += 32) for (let x = 24; x < w; x += 42) { g.beginPath(); g.arc(x + (y % 64 ? 20 : 0), y, 3.5, 0, 7); g.fill(); } }
    // tyre marks
    g.fillStyle = 'rgba(0,0,0,.08)'; for (const x of [70, 96, 160, 186]) g.fillRect(x, 0, 8, h);
    g.fillStyle = T.line; g.fillRect(6, 0, 7, h); g.fillRect(w - 13, 0, 7, h);
    g.fillRect(w / 2 - 3, 0, 6, h * 0.45);
  }));
}
function groundTexture(T, color = T.ground, color2 = T.ground2 || T.ground) {
  return tex(cv(256, 256, (g, w, h) => {
    const R = rng(3);
    g.fillStyle = color; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) { g.fillStyle = color2; g.globalAlpha = 0.25 + R() * 0.3; g.beginPath(); g.arc(R() * w, R() * h, 6 + R() * 22, 0, 7); g.fill(); }
    g.globalAlpha = 1;
    for (let i = 0; i < 1800; i++) { g.fillStyle = R() < 0.5 ? 'rgba(0,0,0,.08)' : 'rgba(255,255,255,.08)'; g.fillRect(R() * w, R() * h, 2, 2 + R() * 3); }
  }));
}
function kerbTexture(T) { return tex(cv(64, 64, (g) => { g.fillStyle = T.kerb[0]; g.fillRect(0, 0, 64, 32); g.fillStyle = T.kerb[1]; g.fillRect(0, 32, 64, 32); })); }
function chevronTexture(col) {
  return tex(cv(64, 128, (g, w, h) => {
    g.fillStyle = 'rgba(0,0,0,0)'; g.clearRect(0, 0, w, h);
    g.fillStyle = col; g.globalAlpha = 0.35; g.fillRect(0, 0, w, h); g.globalAlpha = 1;
    g.fillStyle = '#ffffff';
    for (let y = 0; y < h; y += 64) { g.beginPath(); g.moveTo(6, y + 50); g.lineTo(32, y + 14); g.lineTo(58, y + 50); g.lineTo(58, y + 62); g.lineTo(32, y + 28); g.lineTo(6, y + 62); g.closePath(); g.fill(); }
  }));
}
function checkerTexture() { return tex(cv(64, 16, (g) => { for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) { g.fillStyle = (x + y) % 2 ? '#111' : '#fff'; g.fillRect(x * 4, y * 4, 4, 4); } }), false); }
function bannerTexture(text, a, b) {
  return tex(cv(512, 96, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, a); gr.addColorStop(1, b); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff'; g.font = 'italic 900 64px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,.35)'; g.strokeText(text, w / 2, h / 2 + 4); g.fillText(text, w / 2, h / 2 + 4);
  }), false);
}
export function lavaTexture() {
  return tex(cv(256, 256, (g, w, h) => {
    const R = rng(11); g.fillStyle = '#ff4a12'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) { const gr = g.createRadialGradient(0, 0, 0, 0, 0, 30); gr.addColorStop(0, 'rgba(255,230,90,.9)'); gr.addColorStop(1, 'rgba(255,120,20,0)'); g.save(); g.translate(R() * w, R() * h); g.fillStyle = gr; g.fillRect(-30, -30, 60, 60); g.restore(); }
    g.strokeStyle = 'rgba(60,10,0,.6)'; g.lineWidth = 3; for (let i = 0; i < 26; i++) { g.beginPath(); let x = R() * w, y = R() * h; g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (R() - 0.5) * 50; y += (R() - 0.5) * 50; g.lineTo(x, y); } g.stroke(); }
  }));
}

// ───────── ribbons along a path
function ribbon(path, lat0, lat1, y0fn, y1fn, uv, opts = {}) {
  const n = path.n, closed = path.closed, cnt = closed ? n + 1 : n;
  const pos = new Float32Array(cnt * 2 * 3), uvs = new Float32Array(cnt * 2 * 2), idx = [];
  for (let k = 0; k < cnt; k++) {
    const i = k % n, nx = path.nx(i), nz = path.nz(i), w2 = path.w[i] / 2;
    const l0 = typeof lat0 === 'function' ? lat0(w2, i) : lat0, l1 = typeof lat1 === 'function' ? lat1(w2, i) : lat1;
    const ax = path.x[i] + nx * l0, az = path.z[i] + nz * l0, bx = path.x[i] + nx * l1, bz = path.z[i] + nz * l1;
    pos.set([ax, y0fn(i), az, bx, y1fn(i), bz], k * 6);
    const s = k === n ? path.len : path.s[i];
    if (uv === 'world') uvs.set([ax / 12, az / 12, bx / 12, bz / 12], k * 4);
    else uvs.set([0, s / uv, 1, s / uv], k * 4);
    if (k < cnt - 1) { const a = k * 2, b = a + 1, c = a + 2, d = a + 3; if (opts.flip) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2)); g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ───────── props (merged, vertex-coloured, instanced)
function part(g, color) { const c = new THREE.Color(color); const n = g.attributes.position.count; const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); if (g.index) return g.toNonIndexed(); return g; }
const merge = (...parts) => mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
const PROPS = {
  tree: () => merge(part(new THREE.CylinderGeometry(0.35, 0.5, 3, 6).translate(0, 1.5, 0), '#7a4a2a'), part(new THREE.IcosahedronGeometry(2.2, 0).translate(0, 4.2, 0), '#3fae3a'), part(new THREE.IcosahedronGeometry(1.5, 0).translate(0.8, 5.4, 0.3), '#5cc24a')),
  bush: () => part(new THREE.IcosahedronGeometry(1.3, 0).scale(1, 0.7, 1).translate(0, 0.7, 0), '#46b43e'),
  flower: () => merge(part(new THREE.CylinderGeometry(0.07, 0.07, 1.6, 4).translate(0, 0.8, 0), '#2f8a2a'), part(new THREE.CylinderGeometry(0.55, 0.55, 0.12, 10).rotateX(Math.PI / 2).translate(0, 1.7, 0.05), '#ffd23f'), part(new THREE.CylinderGeometry(0.25, 0.25, 0.16, 8).rotateX(Math.PI / 2).translate(0, 1.7, 0.1), '#6b3f1f')),
  hay: () => part(new THREE.CylinderGeometry(1, 1, 1.4, 12).rotateZ(Math.PI / 2).translate(0, 1, 0), '#e8c060'),
  palm: () => { const ps = [part(new THREE.CylinderGeometry(0.25, 0.4, 7, 6).translate(0, 3.5, 0).applyMatrix4(new THREE.Matrix4().makeRotationZ(0.15)), '#a0703a')]; for (let i = 0; i < 6; i++) ps.push(part(new THREE.ConeGeometry(0.6, 3.6, 4).scale(1, 1, 0.25).rotateZ(-Math.PI / 2 - 0.5).translate(1.8, 0, 0).rotateY((i / 6) * Math.PI * 2).translate(-1, 7, 0), '#2fbf4a')); return merge(...ps); },
  umbrella: () => merge(part(new THREE.CylinderGeometry(0.06, 0.06, 3, 5).translate(0, 1.5, 0), '#ffffff'), part(new THREE.ConeGeometry(1.8, 0.8, 8, 1, true).translate(0, 3.1, 0), '#ff4d6d')),
  hut: () => merge(part(new THREE.BoxGeometry(3, 2.4, 3).translate(0, 1.2, 0), '#22b8ff'), part(new THREE.ConeGeometry(2.6, 1.4, 4).rotateY(Math.PI / 4).translate(0, 3.1, 0), '#ffffff')),
  cactus: () => merge(part(new THREE.CapsuleGeometry(0.45, 3.2, 3, 8).translate(0, 2, 0), '#3f9a4a'), part(new THREE.CapsuleGeometry(0.3, 1.2, 3, 6).rotateZ(Math.PI / 2).translate(0.8, 2, 0), '#3f9a4a'), part(new THREE.CapsuleGeometry(0.28, 1, 3, 6).translate(1.4, 2.6, 0), '#3f9a4a')),
  mesa: () => merge(part(new THREE.CylinderGeometry(7, 9, 14, 7).translate(0, 7, 0), '#c0602a'), part(new THREE.CylinderGeometry(7.1, 7.1, 1.5, 7).translate(0, 12, 0), '#e8905a')),
  rock: () => part(new THREE.DodecahedronGeometry(1.4, 0).scale(1.2, 0.8, 1).translate(0, 0.6, 0), '#8a7a6a'),
  container: () => part(new THREE.BoxGeometry(2.6, 2.6, 6).translate(0, 1.3, 0), '#ffffff'),
  crane: () => merge(part(new THREE.BoxGeometry(1.2, 22, 1.2).translate(0, 11, 0), '#ffd23f'), part(new THREE.BoxGeometry(18, 1.2, 1.2).translate(5, 22, 0), '#ffd23f'), part(new THREE.BoxGeometry(2.4, 2, 2.4).translate(0, 21, 0), '#ff6a2f')),
  lamp: () => merge(part(new THREE.CylinderGeometry(0.12, 0.15, 6, 5).translate(0, 3, 0), '#40444c'), part(new THREE.SphereGeometry(0.5, 8, 6).translate(0, 6.2, 0), '#ffe9a0')),
  warehouse: () => merge(part(new THREE.BoxGeometry(14, 8, 10).translate(0, 4, 0), '#8a96a8'), part(new THREE.BoxGeometry(14.4, 1, 10.4).translate(0, 8.5, 0), '#c2410c')),
  pine: () => merge(part(new THREE.CylinderGeometry(0.3, 0.4, 2, 5).translate(0, 1, 0), '#6b4a2a'), part(new THREE.ConeGeometry(2.4, 3.4, 7).translate(0, 3, 0), '#2a7a4a'), part(new THREE.ConeGeometry(1.8, 2.8, 7).translate(0, 4.6, 0), '#2f8a52'), part(new THREE.ConeGeometry(1.1, 2.2, 7).translate(0, 6, 0), '#f4f8ff')),
  snowman: () => merge(part(new THREE.SphereGeometry(1.1, 10, 8).translate(0, 1, 0), '#ffffff'), part(new THREE.SphereGeometry(0.8, 10, 8).translate(0, 2.5, 0), '#ffffff'), part(new THREE.SphereGeometry(0.55, 10, 8).translate(0, 3.6, 0), '#ffffff'), part(new THREE.ConeGeometry(0.12, 0.6, 6).rotateX(Math.PI / 2).translate(0, 3.6, 0.7), '#ff8a1f'), part(new THREE.CylinderGeometry(0.45, 0.45, 0.6, 8).translate(0, 4.2, 0), '#22252b')),
  cabin: () => merge(part(new THREE.BoxGeometry(5, 3.4, 4).translate(0, 1.7, 0), '#8a5a3a'), part(new THREE.ConeGeometry(4, 2.4, 4).rotateY(Math.PI / 4).scale(1, 1, 0.8).translate(0, 4.6, 0), '#f4f8ff')),
  lollipop: () => merge(part(new THREE.CylinderGeometry(0.15, 0.15, 6, 5).translate(0, 3, 0), '#ffffff'), part(new THREE.CylinderGeometry(2, 2, 0.4, 16).rotateX(Math.PI / 2).translate(0, 6.6, 0), '#ffffff')),
  cane: () => { const ps = []; for (let i = 0; i < 8; i++) ps.push(part(new THREE.CylinderGeometry(0.35, 0.35, 0.9, 8).translate(0, 0.45 + i * 0.9, 0), i % 2 ? '#ffffff' : '#ff3b6b')); ps.push(part(new THREE.TorusGeometry(1, 0.35, 6, 10, Math.PI).translate(1, 7.2, 0), '#ff3b6b')); return merge(...ps); },
  cupcake: () => merge(part(new THREE.CylinderGeometry(1.6, 1.2, 1.6, 12).translate(0, 0.8, 0), '#ff9ed2'), part(new THREE.SphereGeometry(1.7, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 1.6, 0), '#fff0f8'), part(new THREE.SphereGeometry(0.4, 8, 6).translate(0, 3.4, 0), '#ff3b3b')),
  crystal: () => part(new THREE.OctahedronGeometry(1.4, 0).scale(0.6, 2, 0.6).translate(0, 2, 0), '#ff6a2f'),
  basalt: () => part(new THREE.CylinderGeometry(1.4, 1.8, 6, 6).translate(0, 3, 0), '#3a2a2a'),
  asteroid: () => part(new THREE.DodecahedronGeometry(2, 0), '#6a5a8a'),
};
const KITS = {
  meadow: [['tree', 70, 0.8, 1.4], ['bush', 60, 0.8, 1.6], ['flower', 90, 0.8, 1.4], ['hay', 18, 1, 1.3]],
  beach: [['palm', 60, 0.8, 1.3], ['umbrella', 40, 0.9, 1.2, ['#ff4d6d', '#22b8ff', '#ffd23f', '#3ee6b0']], ['hut', 12, 1, 1.2, ['#22b8ff', '#ff9a3c', '#3ee6b0']], ['rock', 20, 0.8, 1.8]],
  desert: [['cactus', 60, 0.8, 1.5], ['rock', 50, 0.8, 2.5], ['mesa', 16, 0.8, 1.6]],
  harbor: [['container', 60, 1, 1, ['#ff4d6d', '#22b8ff', '#ffd23f', '#2fbf4a', '#ff9a3c', '#8a96a8']], ['crane', 6, 1, 1.2], ['lamp', 40, 1, 1], ['warehouse', 10, 1, 1.3]],
  snow: [['pine', 120, 0.8, 1.6], ['snowman', 14, 0.9, 1.2], ['cabin', 8, 1, 1.2], ['rock', 20, 0.8, 1.8]],
  candy: [['lollipop', 40, 0.8, 1.4, ['#ff5fa2', '#49b6ff', '#ffd23f', '#3ee6b0', '#b28bff']], ['cane', 30, 0.8, 1.3], ['cupcake', 30, 0.8, 1.5, ['#ff9ed2', '#ffd6a0', '#b8e6ff']]],
  volcano: [['basalt', 50, 0.6, 1.4], ['crystal', 50, 0.6, 1.6, ['#ff6a2f', '#ffd23f', '#ff3b6b']], ['rock', 40, 0.8, 2]],
  space: [['asteroid', 70, 0.6, 2.6, ['#6a5a8a', '#4a5a8a', '#8a6a9a']]],
};

export function buildScene(world, { tier = 'high', shadows = true } = {}) {
  const T = world.theme, scene = new THREE.Scene(), dispose = [];
  const R = rng(hashStr(world.key + 'scene'));
  const night = !!T.night, dusk = !!T.dusk;
  scene.fog = new THREE.Fog(T.fog, night ? 160 : 140, night ? 700 : 560);
  scene.background = new THREE.Color(T.sky[1]);
  // sky dome
  {
    const g = new THREE.SphereGeometry(900, 24, 16), col = [], pos = g.attributes.position;
    const top = new THREE.Color(T.sky[0]), hor = new THREE.Color(T.sky[1]);
    for (let i = 0; i < pos.count; i++) { const t = Math.max(0, pos.getY(i) / 900); const c = hor.clone().lerp(top, Math.pow(t, 0.6)); col.push(c.r, c.g, c.b); }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const sky = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    sky.renderOrder = -10; sky.name = 'sky'; scene.add(sky);
  }
  if (night || dusk) {
    const n = night ? 1400 : 400, p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const a = R() * Math.PI * 2, e = (night ? -0.3 : 0.25) + R() * 1.2, r = 850; p.set([Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r], i * 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const st = new THREE.Points(g, new THREE.PointsMaterial({ color: '#ffffff', size: night ? 2.2 : 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: night ? 0.9 : 0.5 }));
    st.name = 'stars'; scene.add(st);
  }
  // clouds
  if (!night && T.props !== 'volcano') {
    const cg = merge(part(new THREE.IcosahedronGeometry(14, 1), '#ffffff'), part(new THREE.IcosahedronGeometry(10, 1).translate(14, -3, 2), '#ffffff'), part(new THREE.IcosahedronGeometry(9, 1).translate(-13, -4, -2), '#f0f6ff'));
    const cm = new THREE.InstancedMesh(cg, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, transparent: true, opacity: dusk ? 0.55 : 0.92 }), 14);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < 14; i++) { const a = R() * Math.PI * 2, d = 380 + R() * 300; m4.compose(new THREE.Vector3(Math.cos(a) * d, 120 + R() * 120, Math.sin(a) * d), new THREE.Quaternion(), new THREE.Vector3(1 + R(), 0.45 + R() * 0.3, 1 + R())); cm.setMatrixAt(i, m4); }
    if (dusk) cm.material.color = new THREE.Color('#ffb8c8');
    cm.name = 'clouds'; scene.add(cm);
  }
  // lights
  const hemi = new THREE.HemisphereLight(T.hemi[0], T.hemi[1], night ? 1.1 : dusk ? 1.15 : 1.35); scene.add(hemi);
  const sun = new THREE.DirectionalLight(T.sun, night ? 1.2 : dusk ? 1.6 : 2.2);
  sun.position.set(120, 200, 80); sun.target.position.set(0, 0, 0);
  sun.castShadow = shadows;
  if (shadows) { const sc = sun.shadow.camera; sc.left = sc.bottom = -45; sc.right = sc.top = 45; sc.near = 10; sc.far = 500; sun.shadow.mapSize.set(tier === 'high' ? 2048 : 1024, tier === 'high' ? 2048 : 1024); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.05; }
  scene.add(sun, sun.target);
  if (night) scene.add(new THREE.AmbientLight('#5a4aaa', 0.6));

  const out = { scene, sun, dispose, anim: [] };
  if (world.kind === 'arena') buildArena(world, out, R);
  else buildTrack(world, out, R, tier);
  return out;
}

function buildTrack(W, out, R, tier) {
  const { scene } = out, T = W.theme, main = W.main;
  let ymin = Infinity, ymax = -Infinity; for (let i = 0; i < main.n; i++) { ymin = Math.min(ymin, main.y[i]); ymax = Math.max(ymax, main.y[i]); }
  const hilly = ymax - ymin > 0.5;
  const roadMat = new THREE.MeshLambertMaterial({ map: roadTexture(T, W.def.theme), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  if (W.void) { roadMat.emissive = new THREE.Color('#1a1040'); roadMat.transparent = true; roadMat.opacity = 0.95; }
  const groundMat = new THREE.MeshLambertMaterial({ map: groundTexture(T) });
  const off = W.off;
  const shoulderMat = off === 'lava' ? new THREE.MeshLambertMaterial({ map: groundTexture(T, '#5e4842', '#6e5248') }) : groundMat;
  // road ribbons (main + shortcuts)
  for (const p of W.paths) {
    const surfMat = p.isMain ? roadMat : new THREE.MeshLambertMaterial({ map: groundTexture(T, p.surf === 'choco' ? '#6a3a1a' : p.surf === 'snow' ? '#e8f0ff' : '#b8885a', p.surf === 'choco' ? '#7a4a2a' : p.surf === 'snow' ? '#ffffff' : '#c89a6a'), polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    const road = new THREE.Mesh(ribbon(p, (w2) => -w2, (w2) => w2, (i) => p.y[i] + 0.03, (i) => p.y[i] + 0.03, p.isMain ? 14 : 'world'), surfMat);
    road.receiveShadow = true; scene.add(road);
    if (W.void) {
      // underside + glowing edges
      const und = new THREE.Mesh(ribbon(p, (w2) => -w2, (w2) => w2, (i) => p.y[i] - 0.6, (i) => p.y[i] - 0.6, 14, { flip: true }), new THREE.MeshBasicMaterial({ color: '#2a1a6a' })); scene.add(und);
      for (const s of [-1, 1]) { const e = new THREE.Mesh(ribbon(p, (w2) => s * w2, (w2) => s * w2, (i) => p.y[i] + 0.05, (i) => p.y[i] - 0.6, 14, { flip: s > 0 }), new THREE.MeshBasicMaterial({ color: s > 0 ? '#ff4dd2' : '#5ef2ff', side: THREE.DoubleSide })); scene.add(e); }
      continue;
    }
    // shoulders + terrain skirt
    const m = p.margin;
    for (const s of [-1, 1]) {
      const sh = new THREE.Mesh(ribbon(p, (w2) => s * w2, (w2) => s * (w2 + m + 2), (i) => p.y[i] - (p.isMain ? 0.06 : 0.14), (i) => p.y[i] - (p.isMain ? 0.06 : 0.14), 'world', { flip: s < 0 }), shoulderMat);
      sh.receiveShadow = true; scene.add(sh);
      if (hilly || off === 'lava') {
        const base = off === 'lava' ? -1.6 : ymin - 0.05;
        const sk = new THREE.Mesh(ribbon(p, (w2) => s * (w2 + m + 2), (w2) => s * (w2 + m + (off === 'lava' ? 6 : 26)), (i) => p.y[i] - (p.isMain ? 0.06 : 0.14), () => base, 'world', { flip: s < 0 }), shoulderMat);
        sk.receiveShadow = true; scene.add(sk);
      }
    }
  }
  // ground plane (lava / sea / grass)
  if (!W.void) {
    if (off === 'lava') {
      const lt = lavaTexture(); lt.repeat.set(40, 40);
      const lava = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: lt, color: '#ffffff' }));
      lava.position.y = -1.2; scene.add(lava); out.anim.push((t) => { lt.offset.set(t * 0.01, t * 0.006); });
    } else {
      const gt = groundTexture(T); gt.repeat.set(1600 / 12, 1600 / 12);
      const gm = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: gt }));
      gm.position.y = ymin - 0.08; gm.receiveShadow = true; scene.add(gm);
    }
    if (W.def.sea) {
      const sea = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: T.sea, transparent: true, opacity: 0.92, emissive: new THREE.Color(T.sea).multiplyScalar(0.25) }));
      const s = W.def.sea; if (s.side === 'south') sea.position.set(0, -0.02, s.z - 800); else sea.position.set(s.x + 800, -0.02, 0);
      scene.add(sea); out.anim.push((t) => { sea.position.y = -0.02 + Math.sin(t * 0.8) * 0.05; });
    }
  }
  // kerbs on the bends
  if (!W.void) {
    const km = new THREE.MeshLambertMaterial({ map: kerbTexture(T), polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    let i = 0; const n = main.n;
    while (i < n) {
      if (Math.abs(main.curv[i]) > 0.018) {
        let j = i; while (j < n && Math.abs(main.curv[j]) > 0.012) j++;
        const a = Math.max(0, i - 2), b = Math.min(n - 1, j + 2);
        for (const s of [-1, 1]) {
          const pos = [], uv = [], idx = [];
          for (let k = a; k <= b; k++) {
            const nx = main.nx(k), nz = main.nz(k), w2 = main.w[k] / 2;
            const l0 = s * (w2 - 0.2), l1 = s * (w2 + 1.1);
            pos.push(main.x[k] + nx * l0, main.y[k] + 0.06, main.z[k] + nz * l0, main.x[k] + nx * l1, main.y[k] + 0.06, main.z[k] + nz * l1);
            uv.push(0, main.s[k] / 2.2, 1, main.s[k] / 2.2);
            if (k < b) { const q = (k - a) * 2; if (s < 0) idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); else idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
          }
          const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
          const kb = new THREE.Mesh(g, km); kb.receiveShadow = true; scene.add(kb);
        }
        i = j + 4;
      } else i++;
    }
  }
  // barriers along every path edge (+ margin), with openings where another path joins
  const segs = [];
  const insideOther = (x, z, self) => { for (const p of W.paths) { if (p === self) continue; const q = p.nearest(x, z, -1, {}); if (Math.abs(q.lat) < q.w / 2 + p.margin - 0.3) return true; } return false; };
  if (!W.void) {
    for (const p of W.paths) {
      const last = p.closed ? p.n : p.n - 1;
      for (let i = 0; i < last; i += 1) {
        const j = (i + 1) % p.n;
        for (const s of [-1, 1]) {
          const e0 = s * (p.w[i] / 2 + p.margin + 0.6), e1 = s * (p.w[j] / 2 + p.margin + 0.6);
          const ax = p.x[i] + p.nx(i) * e0, az = p.z[i] + p.nz(i) * e0, bx = p.x[j] + p.nx(j) * e1, bz = p.z[j] + p.nz(j) * e1;
          const mx = (ax + bx) / 2, mz = (az + bz) / 2;
          if (insideOther(mx, mz, p)) continue;
          segs.push({ x: mx, z: mz, y: (p.y[i] + p.y[j]) / 2, len: Math.hypot(bx - ax, bz - az) + 0.05, a: Math.atan2(bx - ax, bz - az), c: (i >> 1) % 2 });
        }
      }
    }
  } else {
    for (const [a, b] of W.rails) for (let s = a; s < b; s += 2.5) for (const sd of [-1, 1]) {
      const p0 = main.pointAt(s, sd * (main.w[0] / 2 + 0.25)), p1 = main.pointAt(s + 2.5, sd * (main.w[0] / 2 + 0.25));
      segs.push({ x: (p0.x + p1.x) / 2, z: (p0.z + p1.z) / 2, y: (p0.y + p1.y) / 2, len: Math.hypot(p1.x - p0.x, p1.z - p0.z) + 0.05, a: Math.atan2(p1.x - p0.x, p1.z - p0.z), c: sd > 0 ? 1 : 0, rail: true });
    }
  }
  const bg = W.void ? new THREE.BoxGeometry(0.25, 0.25, 1) : new THREE.BoxGeometry(0.7, 0.9, 1);
  const mats = W.void ? [new THREE.MeshBasicMaterial({ color: T.wall[0] }), new THREE.MeshBasicMaterial({ color: T.wall[1] })] : [toon(T.wall[0]), toon(T.wall[1])];
  for (const c of [0, 1]) {
    const list = segs.filter((s) => s.c === c);
    const im = new THREE.InstancedMesh(bg, mats[c], Math.max(1, list.length));
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    list.forEach((s, i) => { e.set(0, s.a, 0); q.setFromEuler(e); m4.compose(new THREE.Vector3(s.x, s.y + (s.rail ? 0.7 : 0.45), s.z), q, new THREE.Vector3(1, 1, s.len)); im.setMatrixAt(i, m4); });
    im.count = list.length; im.castShadow = !W.void; im.receiveShadow = true; scene.add(im);
  }
  if (W.void) { // rail posts
    const posts = segs.filter((_, i) => i % 3 === 0);
    const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.08, 0.8, 5), new THREE.MeshBasicMaterial({ color: '#ffffff' }), Math.max(1, posts.length));
    const m4 = new THREE.Matrix4(); posts.forEach((s, i) => { m4.makeTranslation(s.x, s.y + 0.35, s.z); im.setMatrixAt(i, m4); }); im.count = posts.length; scene.add(im);
  }
  // start line + gantry
  {
    const p = main.pointAt(0), w = main.w[0];
    const cm = new THREE.Mesh(new THREE.PlaneGeometry(w, 2.2).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: checkerTexture(), polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    cm.position.set(p.x, p.y + 0.05, p.z); cm.rotation.y = Math.atan2(p.tx, p.tz); cm.material.map.repeat.set(1, 1); scene.add(cm);
    const gan = new THREE.Group(); gan.position.set(p.x, p.y, p.z); gan.rotation.y = Math.atan2(p.tx, p.tz);
    const pm = toon('#f4f5f7');
    for (const s of [-1, 1]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 8, 10), pm); post.position.set(s * (w / 2 + 1.2), 4, 0); post.castShadow = true; gan.add(post); }
    const ban = new THREE.Mesh(new THREE.BoxGeometry(w + 3.4, 2, 0.6), [toon('#ff3b6b'), toon('#ff3b6b'), toon('#ff3b6b'), toon('#ff3b6b'), new THREE.MeshBasicMaterial({ map: bannerTexture('KART BASO', '#ff3b6b', '#ffb02e') }), new THREE.MeshBasicMaterial({ map: bannerTexture('KART BASO', '#ffb02e', '#ff3b6b') })]);
    ban.position.y = 8; ban.castShadow = true; gan.add(ban);
    // countdown lamps (lit by the view)
    const lamps = [];
    for (let i = 0; i < 3; i++) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 8), new THREE.MeshBasicMaterial({ color: '#331111' })); l.position.set((i - 1) * 1.3, 6.5, -0.35); gan.add(l); lamps.push(l); }
    out.lamps = lamps;
    scene.add(gan);
  }
  // jump ramps: striped wedges on the road
  {
    const rm = new THREE.MeshLambertMaterial({ map: tex(cv(64, 64, (g) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#ffffff' : '#ff8a1f'; g.fillRect(0, i * 8, 64, 8); } })), polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    for (const j of W.jumps) {
      const pos = [], uv = [], idx = [], steps = 8;
      for (let k = 0; k <= steps; k++) {
        const a = (k / steps) * j.len, q = main.pointAt(j.s0 + a), h = j.h * Math.pow(a / j.len, 1.25), w2 = q.w / 2;
        for (const s of [-1, 1]) pos.push(q.x - q.tz * s * w2, q.y + h + 0.04, q.z + q.tx * s * w2);
        uv.push(0, k / steps * 2, 1, k / steps * 2);
        if (k < steps) { const b = k * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
      }
      // back face
      const e = pos.length / 3 - 2, q = main.pointAt(j.s0 + j.len);
      for (const s of [-1, 1]) pos.push(q.x - q.tz * s * q.w / 2, q.y, q.z + q.tx * s * q.w / 2);
      uv.push(0, 0, 1, 0); const f = e + 2; idx.push(e, e + 1, f, e + 1, f + 1, f);
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
      const m = new THREE.Mesh(g, rm); m.material.side = THREE.DoubleSide; m.receiveShadow = true; m.castShadow = true; scene.add(m);
    }
  }
  buildCommonFeatures(W, out);
  scatterProps(W, out, R, (x, z) => { const o = W.probe(x, z, -1, {}); return o.excess > (o.path?.margin ?? 0) + 3; }, (x, z) => W.probe(x, z, -1, {}).path?.y?.[0] ?? 0);
}

function buildCommonFeatures(W, out) {
  const { scene } = out, T = W.theme, F = W.F;
  // boost pads
  const ct = chevronTexture(T.props === 'candy' ? '#ff5fa2' : '#ffb02e');
  const pm = new THREE.MeshBasicMaterial({ map: ct, transparent: true, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5, depthWrite: false });
  for (const b of F.boosts) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(b.hw * 2, b.hl * 2).rotateX(-Math.PI / 2), pm);
    m.position.set(b.x, b.y + 0.08, b.z); m.rotation.y = Math.atan2(b.tx, b.tz); ct.repeat.set(1, b.hl * 2 / 3); scene.add(m);
  }
  out.anim.push((t) => { ct.offset.y = -t * 2.2; });
  // puddles / ice / chocolate
  const MUD = { mud: '#5a3a1a', puddle: '#3aa0ff', ice: '#bfe8ff', oil: '#2a2238', choco: '#4a2a14' };
  for (const m of F.muds) {
    const c = MUD[m.mesh] || MUD.mud;
    const d = new THREE.Mesh(new THREE.CircleGeometry(m.r, 24).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: c, transparent: true, opacity: m.mesh === 'ice' ? 0.8 : 0.92, emissive: m.mesh === 'ice' ? '#3a6a8a' : '#000000', polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, depthWrite: false }));
    d.position.set(m.x, m.y + 0.06, m.z); scene.add(d);
  }
  // geysers: crater rings (the column is animated by the view)
  for (const g of F.geysers) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(g.r, 0.35, 6, 16).rotateX(Math.PI / 2), toon(T.props === 'snow' ? '#9fb4d0' : '#3a2a2a'));
    r.position.set(g.x, g.y + 0.1, g.z); scene.add(r);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(g.r, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: T.props === 'snow' ? '#7ad0ff' : '#ff6a1a', polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    hole.position.set(g.x, g.y + 0.07, g.z); scene.add(hole);
  }
}

function buildArena(A, out, R) {
  const { scene } = out, T = A.theme, S = A.size;
  const floor = A.round ? new THREE.CircleGeometry(S + 2, 48) : new THREE.PlaneGeometry(S * 2 + 4, S * 2 + 4);
  floor.rotateX(-Math.PI / 2);
  const ft = A.round ? groundTexture(T, '#3a3560', '#4a4578') : roadTexture(T, 'prato'); ft.repeat.set(A.round ? 8 : 10, A.round ? 8 : 10);
  if (!A.round) { ft.repeat.set(1, 1); }
  const fm = new THREE.Mesh(floor, new THREE.MeshLambertMaterial({ map: A.round ? ft : tileTexture(), emissive: A.round ? '#120c30' : '#000000' }));
  fm.receiveShadow = true; scene.add(fm);
  const gt = groundTexture(A.round ? { ground: '#1a1440', ground2: '#2a2060' } : T); gt.repeat.set(160, 160);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: gt })); ground.position.y = -0.05; ground.receiveShadow = true; scene.add(ground);
  // walls
  const wm = [toon(T.wall[0]), toon(T.wall[1])];
  if (A.round) {
    for (let i = 0; i < 64; i++) { const a = (i / 64) * Math.PI * 2; const b = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.4, (S + 0.8) * Math.PI * 2 / 64 + 0.1), wm[i % 2]); b.position.set(Math.cos(a) * (S + 0.8), 0.7, Math.sin(a) * (S + 0.8)); b.rotation.y = -a; b.castShadow = true; scene.add(b); }
  } else {
    for (let s = 0; s < 4; s++) for (let i = 0; i < 16; i++) { const t = -S + (i + 0.5) * (2 * S / 16); const b = new THREE.Mesh(new THREE.BoxGeometry(2 * S / 16, 1.4, 1.2), wm[(i + s) % 2]); const sg = s < 2 ? -1 : 1; if (s % 2 === 0) b.position.set(t, 0.7, sg * (S + 0.8)); else { b.position.set(sg * (S + 0.8), 0.7, t); b.rotation.y = Math.PI / 2; } b.castShadow = true; scene.add(b); }
  }
  // pillars
  for (const p of A.pillars) {
    const g = new THREE.Group(); g.position.set(p.x, 0, p.z);
    if (p.r > 5 && !A.round) { // fountain
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(p.r, p.r + 0.3, 1.2, 24), toon('#d8dde6')).translateY(0.6));
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(p.r - 0.5, p.r - 0.5, 0.1, 24), new THREE.MeshLambertMaterial({ color: '#49b6ff', emissive: '#103050' })).translateY(1.15));
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.9, 4, 10), toon('#d8dde6')).translateY(2));
      g.add(new THREE.Mesh(new THREE.SphereGeometry(1.4, 12, 8), new THREE.MeshBasicMaterial({ color: '#bfe8ff', transparent: true, opacity: 0.6 })).translateY(4.4));
    } else {
      const m = new THREE.Mesh(A.round ? new THREE.DodecahedronGeometry(p.r, 0) : new THREE.CylinderGeometry(p.r, p.r, 3, 12), toon(A.round ? '#6a5a8a' : T.wall[0]));
      m.position.y = A.round ? p.r * 0.5 : 1.5; m.castShadow = true; g.add(m);
    }
    scene.add(g);
  }
  // ramps
  const rm = new THREE.MeshLambertMaterial({ color: '#ff8a1f' });
  for (const r of A.ramps) {
    const shape = new THREE.Shape(); shape.moveTo(-r.len / 2, 0); shape.lineTo(r.len / 2, r.h); shape.lineTo(r.len / 2, 0); shape.lineTo(-r.len / 2, 0);
    const g = new THREE.ExtrudeGeometry(shape, { depth: r.hw * 2, bevelEnabled: false }); g.translate(0, 0, -r.hw);
    const m = new THREE.Mesh(g, rm); m.position.set(r.x, 0, r.z); m.rotation.y = r.a; m.castShadow = true; m.receiveShadow = true; scene.add(m);
  }
  buildCommonFeatures(A, out);
  scatterProps(A, out, R, (x, z) => (A.round ? Math.hypot(x, z) > S + 5 : Math.max(Math.abs(x), Math.abs(z)) > S + 5), () => 0, 0.6);
}
function tileTexture() {
  const t = tex(cv(256, 256, (g) => { for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) { g.fillStyle = (x + y) % 2 ? '#e8dcc0' : '#d4c4a0'; g.fillRect(x * 32, y * 32, 32, 32); } g.strokeStyle = 'rgba(0,0,0,.12)'; for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, 256); g.moveTo(0, i * 32); g.lineTo(256, i * 32); g.stroke(); } }));
  t.repeat.set(8, 8); return t;
}

function scatterProps(W, out, R, okAt, yAt, density = 1) {
  const kit = KITS[W.theme.props] || KITS.meadow, { scene } = out;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  const cx = W.main ? avg(W.main.x) : 0, cz = W.main ? avg(W.main.z) : 0;
  for (const [id, n0, s0, s1, colors] of kit) {
    const n = Math.round(n0 * density);
    const g = PROPS[id]();
    const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGrad(), emissive: id === 'crystal' ? '#ff3a00' : id === 'lamp' ? '#3a3000' : '#000000' });
    const im = new THREE.InstancedMesh(g, mat, n);
    let c = 0;
    for (let tries = 0; tries < n * 12 && c < n; tries++) {
      let x, z;
      if (W.main) { const i = Math.floor(R() * W.main.n); const side = R() < 0.5 ? -1 : 1; const d = W.main.w[i] / 2 + (W.main.margin || 0) + 4 + Math.pow(R(), 1.6) * (id === 'mesa' || id === 'warehouse' || id === 'crane' ? 120 : 70); x = W.main.x[i] + W.main.nx(i) * side * d; z = W.main.z[i] + W.main.nz(i) * side * d; }
      else { const a = R() * Math.PI * 2, d = W.size + 8 + R() * 70; x = Math.cos(a) * d; z = Math.sin(a) * d; }
      if (!okAt(x, z)) continue;
      const big = id === 'mesa' || id === 'warehouse';
      if (big && Math.hypot(x - cx, z - cz) < 60 && R() < 0.8) continue;
      let y = W.void ? yAt(x, z) - 10 - R() * 30 : W.main ? Math.max(0, nearestY(W, x, z) - (W.off === 'lava' ? 0 : 0)) : 0;
      if (W.off === 'lava') y = Math.min(y, -1.2) + (id === 'basalt' ? 0 : 0);
      const s = s0 + R() * (s1 - s0);
      e.set(W.void ? R() * 3 : 0, R() * Math.PI * 2, W.void ? R() * 3 : 0); q.setFromEuler(e);
      m4.compose(v.set(x, y, z), q, sc.set(s, s, s)); im.setMatrixAt(c, m4);
      if (colors) im.setColorAt(c, new THREE.Color(colors[Math.floor(R() * colors.length)]));
      c++;
    }
    im.count = c; im.castShadow = !W.void; im.receiveShadow = true;
    scene.add(im);
  }
  // distant hills / mountains / volcano
  const hillCol = { meadow: '#4aa83e', beach: '#5ab84a', desert: '#c0602a', harbor: '#3a4660', snow: '#e8f0ff', candy: '#ff9ed2', volcano: '#2a1a1a', space: '#2a1a5a' }[W.theme.props] || '#4aa83e';
  if (W.theme.props !== 'space') {
    const hg = W.theme.props === 'snow' ? new THREE.ConeGeometry(1, 1, 6) : new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    const hm = new THREE.InstancedMesh(hg, new THREE.MeshLambertMaterial({ color: hillCol, flatShading: true }), 40);
    for (let i = 0; i < 40; i++) { const a = (i / 40) * Math.PI * 2 + R() * 0.1, d = 480 + R() * 180, s = 30 + R() * 48; m4.compose(v.set(cx + Math.cos(a) * d, W.theme.props === 'snow' ? s * 0.6 : -5, cz + Math.sin(a) * d), q.identity(), sc.set(s * 1.4, s * (W.theme.props === 'snow' ? 1.6 : 0.6 + R() * 0.5), s * 1.4)); hm.setMatrixAt(i, m4); }
    scene.add(hm);
  } else {
    // planets in the sky
    for (const [x, y, z, r, col] of [[-300, 120, -400, 70, '#ff9a3c'], [420, 200, 120, 40, '#5ef2ff'], [80, 60, 500, 30, '#ff4dd2']]) { const p = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), new THREE.MeshBasicMaterial({ color: col, fog: false })); p.position.set(x, y, z); scene.add(p); }
  }
  if (W.theme.props === 'volcano') {
    const vg = new THREE.CylinderGeometry(30, 120, 110, 12, 1, true); const v0 = new THREE.Mesh(vg, toon('#3a2222')); v0.position.set(cx + 60, 40, cz + 380); scene.add(v0);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(30, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ff7a2a', fog: false })); glow.position.set(cx + 60, 94, cz + 380); scene.add(glow);
  }
}
const avg = (a) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return s / a.length; };
function nearestY(W, x, z) { const q = W.main.nearest(x, z, -1, {}); const d = Math.abs(q.lat) - q.w / 2; return d < 30 ? q.y * Math.max(0, 1 - d / 30) : 0; }
