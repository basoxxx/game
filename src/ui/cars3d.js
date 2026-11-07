// Procedural 3D race cars: smooth lofted bodies, painted liveries (canvas texture),
// physical materials (clear-coat paint, carbon, rubber). +x = forward, y = up.
import * as THREE from 'three';

// ---------------- materials ----------------
const cache = new Map();
function cached(key, make) { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); }

function carbonTex() {
  return cached('carbonTex', () => {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const v = (x + y) % 2 ? 34 : 22; g.fillStyle = `rgb(${v},${v},${v + 3})`; g.fillRect(x * 8, y * 8, 8, 8); g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(x * 8, y * 8, 8, 2); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(8, 8); t.colorSpace = THREE.SRGBColorSpace; return t;
  });
}
export const MAT = {
  carbon: () => cached('carbon', () => new THREE.MeshPhysicalMaterial({ color: 0x2a2c31, map: carbonTex(), roughness: 0.32, metalness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.15 })),
  rubber: () => cached('rubber', () => new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.92, metalness: 0 })),
  rim: (c = '#2c3038') => cached('rim' + c, () => new THREE.MeshStandardMaterial({ color: c, roughness: 0.22, metalness: 0.95 })),
  glass: () => cached('glass', () => new THREE.MeshPhysicalMaterial({ color: 0x0a0d12, roughness: 0.04, metalness: 0.5, clearcoat: 1, transmission: 0 })),
  chrome: () => cached('chrome', () => new THREE.MeshStandardMaterial({ color: 0xdadde2, roughness: 0.12, metalness: 1 })),
  light: (c = '#fff6d8', ei = 2.2) => cached('light' + c + ei, () => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: ei, roughness: 0.2 })),
  paint: (hex) => cached('p' + hex, () => new THREE.MeshPhysicalMaterial({ color: hex, roughness: 0.35, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.06 })),
  band: (hex) => cached('b' + hex, () => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.55, metalness: 0, emissive: hex, emissiveIntensity: 0.08 })),
};

// ---------------- livery painting ----------------
function luma(hex) { const n = parseInt((hex || '#000').slice(1), 16); return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; }
// u: 0 rear -> 1 front ; v: 0 right side (mid height) -> 0.25 top -> 0.5 left -> 0.75 bottom
function liveryTexture(L, { number, sponsor, pattern = L.pattern ?? 1, kind }) {
  const key = ['liv', kind, L.primary, L.secondary, L.accent, pattern, number, sponsor].join('|');
  return cached(key, () => {
    const W = 1024, H = 512;
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    const Y = (v) => H - v * H; // v -> canvas y
    g.fillStyle = L.primary; g.fillRect(0, 0, W, H);
    // underside darker
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, Y(0.85), W, Y(0.65) - Y(0.85));
    g.fillStyle = L.secondary;
    const band = (v0, v1, u0 = 0, u1 = 1) => g.fillRect(u0 * W, Y(v1), (u1 - u0) * W, Y(v0) - Y(v1));
    switch (pattern % 6) {
      case 0: band(0.23, 0.27); break; // pinstripe on top
      case 1: band(0.2, 0.3); g.fillStyle = L.accent; band(0.195, 0.205); band(0.295, 0.305); break; // racing stripe
      case 2: g.beginPath(); g.moveTo(W * 0.55, 0); g.lineTo(W, 0); g.lineTo(W, H); g.lineTo(W * 0.42, H); g.closePath(); g.fill(); break; // two-tone front
      case 3: for (let i = 0; i < 3; i++) { g.fillStyle = i === 1 ? L.accent : L.secondary; g.beginPath(); const u = 0.32 + i * 0.1; g.moveTo(W * u, 0); g.lineTo(W * (u + 0.05), H * 0.5); g.lineTo(W * u, H); g.lineTo(W * (u + 0.035), H); g.lineTo(W * (u + 0.085), H * 0.5); g.lineTo(W * (u + 0.035), 0); g.fill(); } break;
      case 4: { const gr = g.createLinearGradient(0, 0, W, 0); gr.addColorStop(0.1, L.primary); gr.addColorStop(0.9, L.secondary); g.fillStyle = gr; g.fillRect(0, 0, W, H); g.fillStyle = L.accent; band(0.08, 0.1); band(0.4, 0.42); break; }
      default: band(0, 0.06); band(0.44, 0.56); band(0.94, 1); g.fillStyle = L.accent; band(0.06, 0.075); band(0.425, 0.44); band(0.925, 0.94); // side flash
    }
    // carbon-ish lower edge on sides
    g.fillStyle = 'rgba(15,15,18,0.85)'; band(0.62, 0.88);
    const ink = luma(L.primary) > 0.6 ? '#0b0b0d' : '#ffffff';
    const side = (draw, uC, vC, flip) => { g.save(); g.translate(uC * W, Y(vC)); if (flip) g.rotate(Math.PI); draw(); g.restore(); };
    const numU = kind === 'formula' ? 0.72 : kind === 'rally' ? 0.5 : 0.56;
    const spU = kind === 'formula' ? 0.38 : kind === 'rally' ? 0.78 : 0.3;
    for (const [vC, flip] of [[0.07, false], [0.43, true]]) {
      if (number != null) side(() => {
        if (kind !== 'formula') { g.fillStyle = '#ffffff'; g.beginPath(); g.roundRect ? g.roundRect(-70, -48, 140, 96, 14) : g.rect(-70, -48, 140, 96); g.fill(); }
        g.fillStyle = kind === 'formula' ? ink : '#111111'; g.font = 'italic 900 84px "Exo 2", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(number), 0, 6);
      }, numU, vC, flip);
      if (sponsor) side(() => {
        g.fillStyle = ink; let size = 56; g.font = `800 ${size}px "Exo 2", sans-serif`;
        while (g.measureText(sponsor).width > W * 0.26 && size > 16) { size -= 4; g.font = `800 ${size}px "Exo 2", sans-serif`; }
        g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(sponsor.toUpperCase(), 0, 4);
      }, spU, vC, flip);
    }
    // top number (formula nose)
    if (number != null && kind === 'formula') { g.save(); g.translate(W * 0.86, Y(0.25)); g.rotate(Math.PI / 2); g.fillStyle = ink; g.font = 'italic 900 60px "Exo 2", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(number), 0, 0); g.restore(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    return new THREE.MeshPhysicalMaterial({ map: t, roughness: 0.35, metalness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 });
  });
}

// ---------------- geometry: loft along x ----------------
// sections: [{x, w, h, y, n}] ; n = superellipse exponent (2 = ellipse, 4+ = boxy)
function loft(sections, { seg = 40, around = 32, flatBottom = 0, u0 = 0, u1 = 1, capFront = true, capRear = true } = {}) {
  const S = sections.slice().sort((a, b) => a.x - b.x);
  const sample = (x) => {
    let i = 0; while (i < S.length - 2 && S[i + 1].x < x) i++;
    const a = S[Math.max(0, i - 1)], b = S[i], c = S[i + 1], d = S[Math.min(S.length - 1, i + 2)];
    const t = Math.max(0, Math.min(1, (x - b.x) / ((c.x - b.x) || 1)));
    const cr = (k) => { const p0 = a[k], p1 = b[k], p2 = c[k], p3 = d[k]; const t2 = t * t, t3 = t2 * t; return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3); };
    return { w: Math.max(0.005, cr('w')), h: Math.max(0.005, cr('h')), y: cr('y'), n: Math.max(1.5, cr('n') || 2.5) };
  };
  const x0 = S[0].x, x1 = S[S.length - 1].x;
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= seg; i++) {
    const x = x0 + (x1 - x0) * (i / seg);
    const s = sample(x);
    for (let j = 0; j <= around; j++) {
      const th = (j / around) * Math.PI * 2;
      const cs = Math.cos(th), sn = Math.sin(th);
      const e = 2 / s.n;
      let z = (s.w / 2) * Math.sign(cs) * Math.abs(cs) ** e;
      let y = (s.h / 2) * Math.sign(sn) * Math.abs(sn) ** e;
      if (flatBottom && y < 0) y *= 1 - flatBottom;
      pos.push(x, s.y + y, z);
      uv.push(u0 + (u1 - u0) * (i / seg), j / around);
    }
  }
  const R = around + 1;
  for (let i = 0; i < seg; i++) for (let j = 0; j < around; j++) {
    const a = i * R + j, b = a + R;
    idx.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const addCap = (i, front) => {
    const s = sample(x0 + (x1 - x0) * (i / seg));
    const ci = pos.length / 3; pos.push(x0 + (x1 - x0) * (i / seg), s.y, 0); uv.push(front ? u1 : u0, 0.25);
    for (let j = 0; j < around; j++) { const a = i * R + j; front ? idx.push(ci, a, a + 1) : idx.push(ci, a + 1, a); }
  };
  if (capRear) addCap(0, false);
  if (capFront) addCap(seg, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
function mesh(g, m) { const o = new THREE.Mesh(g, m); o.castShadow = true; o.receiveShadow = true; return o; }

// airfoil extruded across z
function wingElement(chord, thick, span, m, { x = 0, y = 0, angle = 0, camber = 0.6 } = {}) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.quadraticCurveTo(chord * 0.25, thick * (1 + camber), chord, thick * 0.15);
  s.lineTo(chord, 0);
  s.quadraticCurveTo(chord * 0.45, -thick * 0.25, 0, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: span, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 1, curveSegments: 10 });
  g.translate(-chord / 2, 0, -span / 2);
  const o = mesh(g, m); o.position.set(x, y, 0); o.rotation.z = angle;
  return o;
}
function plate(points, thickness, m, z = 0) {
  const s = new THREE.Shape(); points.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y))); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: thickness, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 1 });
  g.translate(0, 0, -thickness / 2 + z);
  return mesh(g, m);
}
function rod(a, b, r, m) {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
  const len = va.distanceTo(vb);
  const o = mesh(new THREE.CylinderGeometry(r, r, len, 6), m);
  o.position.copy(va).add(vb).multiplyScalar(0.5);
  o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
  return o;
}

// ---------------- wheels ----------------
function wheel(r, w, tyreColor, rimColor = '#2c3038', spokes = 10) {
  const grp = new THREE.Group();
  const spin = new THREE.Group(); grp.add(spin);
  // tyre: lathe of a rounded profile (around y), then rotate so axle is z
  const prof = [];
  const rr = w * 0.22;
  const rimR = r * 0.66;
  prof.push(new THREE.Vector2(rimR, -w / 2));
  for (let k = 0; k <= 6; k++) { const a = -Math.PI / 2 + (k / 6) * (Math.PI / 2); prof.push(new THREE.Vector2(r - rr + Math.cos(a) * rr, -w / 2 + rr + Math.sin(a) * rr)); }
  for (let k = 0; k <= 6; k++) { const a = (k / 6) * (Math.PI / 2); prof.push(new THREE.Vector2(r - rr + Math.cos(a) * rr, w / 2 - rr + Math.sin(a) * rr)); }
  prof.push(new THREE.Vector2(rimR, w / 2));
  const tg = new THREE.LatheGeometry(prof, 36); tg.rotateX(Math.PI / 2);
  spin.add(mesh(tg, MAT.rubber()));
  // compound bands on both sidewalls
  for (const sgn of [1, -1]) {
    const band = mesh(new THREE.RingGeometry(r * 0.8, r * 0.86, 36), MAT.band(tyreColor || '#ffd400'));
    band.position.z = sgn * (w / 2 + 0.002); if (sgn < 0) band.rotation.y = Math.PI;
    band.userData.band = true; spin.add(band);
  }
  // rim
  const rim = mesh(new THREE.CylinderGeometry(rimR, rimR, w * 0.92, 24, 1, true), MAT.rim(rimColor)); rim.rotation.x = Math.PI / 2; spin.add(rim);
  for (const sgn of [1, -1]) {
    const face = new THREE.Group(); face.position.z = sgn * w * 0.4;
    face.add(mesh(new THREE.CircleGeometry(rimR * 0.98, 24), MAT.rim('#121417')));
    for (let k = 0; k < spokes; k++) { const s = mesh(new THREE.BoxGeometry(rimR * 0.95, rimR * 0.1, 0.02), MAT.rim(rimColor)); s.position.x = Math.cos((k / spokes) * Math.PI * 2) * rimR * 0.48; s.position.y = Math.sin((k / spokes) * Math.PI * 2) * rimR * 0.48; s.rotation.z = (k / spokes) * Math.PI * 2; face.add(s); }
    const hub = mesh(new THREE.CylinderGeometry(rimR * 0.18, rimR * 0.18, 0.06, 12), MAT.chrome()); hub.rotation.x = Math.PI / 2; face.add(hub);
    if (sgn < 0) face.rotation.y = Math.PI;
    spin.add(face);
  }
  grp.userData.spin = [spin];
  grp.userData.spinAxis = 'z';
  return grp;
}

// ---------------- cars ----------------
function formula(L, opts) {
  const car = new THREE.Group();
  const paint = liveryTexture(L, { ...opts, kind: 'formula' });
  const sec = MAT.paint(L.secondary), acc = MAT.paint(L.accent), cf = MAT.carbon();
  // monocoque + nose (u 0.35..1)
  car.add(mesh(loft([
    { x: -1.05, w: 0.78, h: 0.62, y: 0.5, n: 3 }, { x: -0.45, w: 0.84, h: 0.58, y: 0.5, n: 3 }, { x: 0.3, w: 0.72, h: 0.5, y: 0.47, n: 2.8 },
    { x: 1.1, w: 0.46, h: 0.36, y: 0.4, n: 2.6 }, { x: 1.9, w: 0.32, h: 0.24, y: 0.3, n: 2.4 }, { x: 2.55, w: 0.24, h: 0.14, y: 0.2, n: 2.2 }, { x: 2.78, w: 0.12, h: 0.07, y: 0.17, n: 2 },
  ], { u0: 0.38, u1: 1, flatBottom: 0.4 }), paint));
  // sidepods (u 0.1..0.55)
  car.add(mesh(loft([
    { x: -2.05, w: 0.5, h: 0.18, y: 0.3, n: 2.6 }, { x: -1.5, w: 1.05, h: 0.3, y: 0.36, n: 3 }, { x: -0.6, w: 1.5, h: 0.42, y: 0.42, n: 3.6 }, { x: 0.15, w: 1.42, h: 0.38, y: 0.44, n: 4 }, { x: 0.3, w: 1.3, h: 0.3, y: 0.46, n: 4 },
  ], { u0: 0.12, u1: 0.5, flatBottom: 0.5 }), paint));
  // sidepod inlets (dark)
  for (const z of [0.58, -0.58]) { const inl = mesh(new THREE.BoxGeometry(0.05, 0.22, 0.26), MAT.rubber()); inl.position.set(0.31, 0.47, z); car.add(inl); }
  // engine cover + airbox + shark fin (u 0..0.4)
  car.add(mesh(loft([
    { x: -2.5, w: 0.16, h: 0.16, y: 0.46, n: 2.4 }, { x: -2.0, w: 0.34, h: 0.36, y: 0.52, n: 2.6 }, { x: -1.3, w: 0.56, h: 0.7, y: 0.62, n: 2.8 }, { x: -0.78, w: 0.46, h: 0.86, y: 0.7, n: 2.6 }, { x: -0.55, w: 0.36, h: 0.7, y: 0.72, n: 2.4 },
  ], { u0: 0.02, u1: 0.36 }), paint));
  const fin = plate([[-0.7, 1.02], [-2.3, 0.68], [-2.3, 0.56], [-1.2, 0.8]], 0.02, paint); car.add(fin);
  // airbox inlet
  const ab = mesh(new THREE.TorusGeometry(0.11, 0.035, 8, 16), cf); ab.position.set(-0.6, 1.0, 0); ab.rotation.y = Math.PI / 2; car.add(ab);
  // cockpit opening + headrest
  const cp = mesh(loft([{ x: -0.62, w: 0.46, h: 0.06, y: 0.79, n: 3 }, { x: -0.1, w: 0.5, h: 0.06, y: 0.77, n: 3 }, { x: 0.25, w: 0.32, h: 0.05, y: 0.73, n: 3 }], { seg: 10, around: 20 }), MAT.rubber()); car.add(cp);
  const helmet = mesh(new THREE.SphereGeometry(0.15, 20, 14), MAT.paint(opts.helmet || '#ffd400')); helmet.position.set(-0.32, 0.88, 0); helmet.scale.set(1.15, 1, 1); car.add(helmet);
  const visor = mesh(new THREE.SphereGeometry(0.152, 20, 10, -0.9, 1.8, 1.2, 0.5), MAT.glass()); visor.position.copy(helmet.position); visor.scale.copy(helmet.scale); car.add(visor);
  car.userData.helmetParts = [helmet, visor];
  // cockpit interior (seen from the driver's camera): steering wheel with display, mirrors
  {
    const sw = new THREE.Group();
    const body = mesh(new THREE.BoxGeometry(0.035, 0.13, 0.27), MAT.carbon ? MAT.carbon() : cf); sw.add(body);
    for (const z of [-0.15, 0.15]) { const g = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.15, 10), MAT.rubber()); g.position.set(0, -0.01, z); sw.add(g); const glove = mesh(new THREE.SphereGeometry(0.035, 10, 8), MAT.rubber()); glove.position.set(-0.025, 0.0, z); glove.scale.set(1.2, 1, 0.8); sw.add(glove); }
    const dc = document.createElement('canvas'); dc.width = 128; dc.height = 64; const dx = dc.getContext('2d');
    dx.fillStyle = '#05070a'; dx.fillRect(0, 0, 128, 64); dx.fillStyle = '#18e06a'; dx.font = 'bold 34px monospace'; dx.textAlign = 'center'; dx.fillText('7', 64, 44); dx.font = 'bold 12px monospace'; dx.fillStyle = '#ffd400'; dx.fillText('-0.142', 26, 58); dx.fillStyle = '#4fc3ff'; dx.fillText('ERS 78%', 100, 58);
    for (let k = 0; k < 10; k++) { dx.fillStyle = k < 4 ? '#18e06a' : k < 7 ? '#ff3030' : '#4f7dff'; dx.fillRect(10 + k * 11, 4, 8, 6); }
    const dt = new THREE.CanvasTexture(dc); dt.colorSpace = THREE.SRGBColorSpace;
    const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.05), new THREE.MeshBasicMaterial({ map: dt })); disp.position.set(-0.019, 0.01, 0); disp.rotation.y = -Math.PI / 2; sw.add(disp);
    sw.position.set(-0.1, 0.74, 0); sw.rotation.z = 0.45; car.add(sw);
    for (const z of [-0.56, 0.56]) {
      const stalk = rod([-0.1, 0.66, z * 0.75], [0.05, 0.76, z], 0.012, cf); car.add(stalk);
      const mir = mesh(new THREE.BoxGeometry(0.025, 0.05, 0.12), MAT.paint(L.primary || '#333')); mir.position.set(0.05, 0.76, z); car.add(mir);
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.05), new THREE.MeshStandardMaterial({ color: 0x9fb6c8, metalness: 1, roughness: 0.05 })); glass.position.set(0.032, 0.76, z); glass.rotation.y = -Math.PI / 2; car.add(glass);
    }
  }
  // halo
  const haloCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.62, 0.8, 0.3), new THREE.Vector3(-0.35, 1.06, 0.29), new THREE.Vector3(0.05, 1.06, 0.18), new THREE.Vector3(0.22, 1.02, 0), new THREE.Vector3(0.05, 1.06, -0.18), new THREE.Vector3(-0.35, 1.06, -0.29), new THREE.Vector3(-0.62, 0.8, -0.3)]);
  car.add(mesh(new THREE.TubeGeometry(haloCurve, 40, 0.032, 8), cf));
  car.add(rod([0.22, 1.02, 0], [0.38, 0.74, 0], 0.03, cf));
  // floor + edge
  car.add(plate([[-2.25, -0.72], [0.55, -0.72], [0.95, -0.4], [0.95, 0.4], [0.55, 0.72], [-2.25, 0.72]], 0.03, cf).rotateX(Math.PI / 2).translateZ(-0.09));
  // front wing (3 elements + endplates)
  const fw = new THREE.Group(); fw.position.set(2.55, 0.11, 0);
  fw.add(wingElement(0.42, 0.04, 1.95, acc, { x: 0.05, y: 0, angle: -0.04 }));
  fw.add(wingElement(0.24, 0.03, 1.8, sec, { x: -0.14, y: 0.07, angle: -0.22 }));
  fw.add(wingElement(0.18, 0.025, 1.6, sec, { x: -0.26, y: 0.13, angle: -0.38 }));
  for (const z of [0.99, -0.99]) fw.add(plate([[-0.38, -0.02], [0.3, -0.02], [0.22, 0.2], [-0.32, 0.26]], 0.015, acc, z));
  car.add(fw);
  car.add(rod([2.45, 0.16, 0.08], [2.4, 0.2, 0.08], 0.02, cf));
  // rear wing + beam wing + endplates
  const rw = new THREE.Group(); rw.position.set(-2.42, 0.98, 0);
  rw.add(wingElement(0.38, 0.05, 1.0, acc, { x: 0, y: 0, angle: -0.12 }));
  rw.add(wingElement(0.22, 0.03, 1.0, sec, { x: 0.12, y: 0.12, angle: -0.5 }));
  for (const z of [0.51, -0.51]) rw.add(plate([[-0.32, -0.42], [0.25, -0.38], [0.3, 0.24], [-0.3, 0.2]], 0.018, paint, z));
  car.add(rw);
  car.add(wingElement(0.22, 0.03, 0.9, cf, { x: -2.35, y: 0.42, angle: -0.15 }));
  car.add(plate([[-2.0, 0.48], [-2.15, 0.95], [-2.3, 0.95], [-2.2, 0.48]], 0.04, cf));
  // rain light
  const rl = mesh(new THREE.BoxGeometry(0.03, 0.06, 0.1), MAT.light('#ff2020', 3)); rl.position.set(-2.52, 0.45, 0); car.add(rl);
  // mirrors
  for (const z of [0.42, -0.42]) { const mr = mesh(new THREE.BoxGeometry(0.06, 0.06, 0.13), acc); mr.position.set(0.1, 0.84, z); car.add(mr); car.add(rod([0.1, 0.78, z * 0.7], [0.1, 0.82, z], 0.012, cf)); }
  // suspension + wheels
  const wheels = [];
  const W = [[1.62, 0.84, 0.335, 0.34], [1.62, -0.84, 0.335, 0.34], [-1.72, 0.8, 0.36, 0.42], [-1.72, -0.8, 0.36, 0.42]];
  for (const [x, z, r, w] of W) {
    const wh = wheel(r, w, opts.tyre); wh.position.set(x, r, z); car.add(wh); wheels.push(wh);
    const zi = Math.sign(z) * 0.3;
    car.add(rod([x - 0.25, 0.42, zi], [x, r + 0.08, z - Math.sign(z) * w / 2], 0.018, cf));
    car.add(rod([x + 0.2, 0.36, zi], [x, r - 0.05, z - Math.sign(z) * w / 2], 0.018, cf));
    car.add(rod([x - 0.15, 0.3, zi], [x, r - 0.12, z - Math.sign(z) * w / 2], 0.016, cf));
  }
  car.userData.wheels = wheels;
  return car;
}

function endurance(L, opts) {
  const car = new THREE.Group();
  const paint = liveryTexture(L, { ...opts, kind: 'endurance' });
  const acc = MAT.paint(L.accent), cf = MAT.carbon();
  // main tub
  car.add(mesh(loft([
    { x: -2.5, w: 1.8, h: 0.6, y: 0.58, n: 3.6 }, { x: -1.9, w: 1.96, h: 0.78, y: 0.6, n: 3.4 }, { x: -1.0, w: 1.86, h: 0.6, y: 0.55, n: 3.2 }, { x: 0.2, w: 1.72, h: 0.56, y: 0.52, n: 3.2 },
    { x: 1.2, w: 1.92, h: 0.52, y: 0.46, n: 3.2 }, { x: 2.05, w: 1.88, h: 0.34, y: 0.36, n: 3 }, { x: 2.52, w: 1.5, h: 0.14, y: 0.27, n: 2.6 },
  ], { flatBottom: 0.6, around: 40 }), paint));
  // wheel-arch fenders
  for (const [x, len] of [[1.55, 1.05], [-1.6, 1.15]]) for (const z of [0.72, -0.72]) {
    const f = mesh(loft([{ x: x - len / 2, w: 0.34, h: 0.3, y: 0.6, n: 2.4 }, { x: x - len * 0.2, w: 0.5, h: 0.62, y: 0.7, n: 2.4 }, { x: x + len * 0.2, w: 0.5, h: 0.62, y: 0.7, n: 2.4 }, { x: x + len / 2, w: 0.34, h: 0.26, y: 0.56, n: 2.4 }], { seg: 18, around: 24 }), paint);
    f.position.z = z; car.add(f);
  }
  // canopy
  car.add(mesh(loft([{ x: -1.0, w: 0.9, h: 0.2, y: 0.86, n: 3 }, { x: -0.5, w: 1.15, h: 0.62, y: 0.98, n: 2.8 }, { x: 0.2, w: 1.1, h: 0.56, y: 0.92, n: 2.6 }, { x: 0.75, w: 0.8, h: 0.18, y: 0.78, n: 2.4 }], { seg: 24, around: 28 }), MAT.glass()));
  car.add(mesh(loft([{ x: -1.25, w: 0.5, h: 0.24, y: 0.92, n: 3 }, { x: -0.55, w: 0.95, h: 0.5, y: 1.05, n: 3 }, { x: -0.35, w: 0.8, h: 0.42, y: 1.1, n: 3 }], { seg: 12, around: 20 }), paint));
  // shark fin
  car.add(plate([[-0.55, 1.28], [-2.3, 1.3], [-2.3, 0.96], [-1.0, 1.0]], 0.025, paint));
  // rear wing
  const rw = new THREE.Group(); rw.position.set(-2.38, 1.3, 0);
  rw.add(wingElement(0.42, 0.05, 1.96, acc, { angle: -0.08 }));
  for (const z of [0.99, -0.99]) rw.add(plate([[-0.3, -0.5], [0.28, -0.5], [0.3, 0.14], [-0.3, 0.14]], 0.02, paint, z));
  car.add(rw);
  for (const z of [0.4, -0.4]) car.add(rod([-2.2, 0.9, z], [-2.35, 1.27, z], 0.03, cf));
  // splitter, diffuser
  car.add(plate([[2.55, -0.95], [2.0, -0.95], [2.0, 0.95], [2.55, 0.95]], 0.03, cf).rotateX(Math.PI / 2).translateZ(-0.12));
  // lights
  for (const z of [0.62, -0.62]) { const hl = mesh(new THREE.BoxGeometry(0.06, 0.06, 0.42), MAT.light('#fffbe8', 3)); hl.position.set(2.32, 0.48, z); hl.rotation.y = Math.sign(z) * 0.25; car.add(hl); }
  const tl = mesh(new THREE.BoxGeometry(0.04, 0.05, 1.7), MAT.light('#ff1e1e', 3)); tl.position.set(-2.52, 0.82, 0); car.add(tl);
  const wheels = [];
  for (const [x, z] of [[1.55, 0.86], [1.55, -0.86], [-1.6, 0.86], [-1.6, -0.86]]) { const wh = wheel(0.36, 0.33, opts.tyre, '#1f2328', 6); wh.position.set(x, 0.36, z); car.add(wh); wheels.push(wh); }
  car.userData.wheels = wheels;
  return car;
}

function rally(L, opts) {
  const car = new THREE.Group();
  const paint = liveryTexture(L, { ...opts, kind: 'rally' });
  const acc = MAT.paint(L.accent);
  // body
  car.add(mesh(loft([
    { x: -2.05, w: 1.78, h: 0.86, y: 0.82, n: 6 }, { x: -1.6, w: 1.86, h: 0.92, y: 0.8, n: 6 }, { x: 0.6, w: 1.86, h: 0.84, y: 0.78, n: 6 }, { x: 1.6, w: 1.82, h: 0.62, y: 0.68, n: 5 }, { x: 2.08, w: 1.7, h: 0.48, y: 0.6, n: 4 },
  ], { flatBottom: 0.5, around: 36 }), paint));
  // cabin
  car.add(mesh(loft([{ x: -1.9, w: 1.42, h: 0.46, y: 1.32, n: 5 }, { x: -1.2, w: 1.5, h: 0.6, y: 1.36, n: 5 }, { x: 0.1, w: 1.44, h: 0.58, y: 1.35, n: 5 }, { x: 0.8, w: 1.3, h: 0.12, y: 1.18, n: 4 }], { seg: 20, around: 28 }), MAT.glass()));
  car.add(mesh(loft([{ x: -1.82, w: 1.4, h: 0.06, y: 1.62, n: 6 }, { x: 0.1, w: 1.42, h: 0.06, y: 1.66, n: 6 }], { seg: 6, around: 20 }), paint));
  // arch flares
  for (const x of [1.32, -1.3]) for (const z of [0.9, -0.9]) { const f = mesh(new THREE.TorusGeometry(0.43, 0.08, 8, 16, Math.PI), MAT.paint(L.accent)); f.position.set(x, 0.38, z); car.add(f); }
  // spoiler
  car.add(wingElement(0.5, 0.05, 1.86, acc, { x: -2.0, y: 1.72, angle: -0.06 }));
  for (const z of [0.6, -0.6]) car.add(rod([-1.95, 1.4, z], [-2.0, 1.7, z], 0.03, acc));
  // roof scoop
  const sc = mesh(new THREE.BoxGeometry(0.4, 0.08, 0.3), acc); sc.position.set(-0.3, 1.72, 0); car.add(sc);
  // light pod
  for (const z of [-0.45, -0.15, 0.15, 0.45]) { const l = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.08, 18), MAT.light('#fff7d0', 2.4)); l.rotation.z = Math.PI / 2; l.position.set(2.12, 0.86, z); car.add(l); const ring = mesh(new THREE.TorusGeometry(0.1, 0.018, 6, 16), MAT.rubber()); ring.rotation.y = Math.PI / 2; ring.position.set(2.16, 0.86, z); car.add(ring); }
  // mud flaps
  for (const [x, z] of [[0.82, 0.86], [0.82, -0.86], [-1.82, 0.86], [-1.82, -0.86]]) { const mf = mesh(new THREE.BoxGeometry(0.02, 0.3, 0.32), MAT.rubber()); mf.position.set(x, 0.2, z); car.add(mf); }
  const wheels = [];
  for (const [x, z] of [[1.32, 0.86], [1.32, -0.86], [-1.3, 0.86], [-1.3, -0.86]]) { const wh = wheel(0.34, 0.25, '#6b6b6b', '#e8e8e8', 6); wh.position.set(x, 0.34, z); car.add(wh); wheels.push(wh); }
  car.userData.wheels = wheels;
  return car;
}

export function buildCar(category, livery, opts = {}) {
  const L = { primary: '#e10600', secondary: '#ffffff', accent: '#111111', pattern: 1, ...livery };
  const car = category === 'rally' ? rally(L, opts) : category === 'endurance' ? endurance(L, opts) : formula(L, opts);
  if (category === 'junior') car.scale.setScalar(0.94);
  car.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return car;
}

export function setTyreColor(car, color) {
  for (const w of car.userData.wheels || []) w.traverse((o) => { if (o.userData?.band) o.material = MAT.band(color); });
}
