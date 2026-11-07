// Procedural 3D race cars: smooth lofted bodies, painted liveries (canvas texture),
// physical materials (clear-coat paint, carbon, rubber). +x = forward, y = up.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ---------------- materials ----------------
const cache = new Map();
function cached(key, make) { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); }

// 2x2 twill weave: each tow is a soft-shaded strip, alternating direction; the bump map
// carries the same pattern so the clear coat catches the weave at grazing angles
function carbonTex(bump) {
  return cached('carbonTex' + !!bump, () => {
    const S = 128, T = 16, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
    for (let y = 0; y < S / T; y++) for (let x = 0; x < S / T; x++) {
      const horiz = ((x + y) >> 1) % 2 === 0;
      const gr = horiz ? g.createLinearGradient(0, y * T, 0, y * T + T) : g.createLinearGradient(x * T, 0, x * T + T, 0);
      const lo = bump ? 70 : 16, hi = bump ? 200 : 46;
      gr.addColorStop(0, `rgb(${lo},${lo},${lo + 2})`); gr.addColorStop(0.5, `rgb(${hi},${hi},${hi + 3})`); gr.addColorStop(1, `rgb(${lo},${lo},${lo + 2})`);
      g.fillStyle = gr; g.fillRect(x * T, y * T, T, T);
      if (!bump) { g.fillStyle = 'rgba(0,0,0,0.25)'; for (let k = 2; k < T; k += 4) horiz ? g.fillRect(x * T, y * T + k, T, 1) : g.fillRect(x * T + k, y * T, 1, T); }
    }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(10, 10); t.anisotropy = 4; if (!bump) t.colorSpace = THREE.SRGBColorSpace; return t;
  });
}
export const MAT = {
  carbon: () => cached('carbon', () => new THREE.MeshPhysicalMaterial({ color: 0x6a6d74, map: carbonTex(), bumpMap: carbonTex(true), bumpScale: 0.35, roughness: 0.5, metalness: 0.1, clearcoat: 0.45, clearcoatRoughness: 0.14, envMapIntensity: 0.55 })),
  rubber: () => cached('rubber', () => new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.92, metalness: 0 })),
  rim: (c = '#2c3038') => cached('rim' + c, () => new THREE.MeshStandardMaterial({ color: c, roughness: 0.22, metalness: 0.95 })),
  glass: () => cached('glass', () => new THREE.MeshPhysicalMaterial({ color: 0x0a0d12, roughness: 0.04, metalness: 0.5, clearcoat: 1, transmission: 0 })),
  mirror: () => cached('mirror', () => new THREE.MeshStandardMaterial({ color: 0xb8c6d2, metalness: 1, roughness: 0.04 })),
  visor: () => cached('visor', () => new THREE.MeshPhysicalMaterial({ color: 0x07090c, roughness: 0.05, metalness: 0.6, clearcoat: 1, iridescence: 1, iridescenceIOR: 1.8, iridescenceThicknessRange: [250, 600], envMapIntensity: 1.6 })),
  chrome: () => cached('chrome', () => new THREE.MeshStandardMaterial({ color: 0xdadde2, roughness: 0.12, metalness: 1 })),
  light: (c = '#fff6d8', ei = 2.2) => cached('light' + c + ei, () => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: ei, roughness: 0.2 })),
  paint: (hex) => cached('p' + hex, () => new THREE.MeshPhysicalMaterial({ color: hex, roughness: 0.3, metalness: 0.12, clearcoat: 1, clearcoatRoughness: 0.03, normalMap: flakeTex(), normalScale: new THREE.Vector2(0.06, 0.06), envMapIntensity: 1.25, specularIntensity: 0.8 })),
  // printed decal on a painted part (wing end plates): texture + same clear coat as the paint
  decal: (key, draw, w = 512, h = 256, flip = false) => cached('d' + key + flip, () => {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    if (flip) { t.wrapS = THREE.RepeatWrapping; t.repeat.x = -1; }
    return new THREE.MeshPhysicalMaterial({ map: t, roughness: 0.3, metalness: 0.12, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.25, specularIntensity: 0.8 });
  }),
  band: (hex) => cached('b' + hex, () => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.55, metalness: 0, emissive: hex, emissiveIntensity: 0.08 })),
};

// ---------------- livery painting ----------------
function luma(hex) { const n = parseInt((hex || '#000').slice(1), 16); return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; }
// u: 0 rear -> 1 front ; v: 0 right side (mid height) -> 0.25 top -> 0.5 left -> 0.75 bottom
const SPONSORS = ['PETRONIX', 'ROLEXA', 'DHX', 'ORACLO', 'BREMBI', 'LAVAZZO', 'PUMO', 'LENOVA', 'MONSTRO', 'SANTANDOR', 'CRYPTO.CAM', 'ARAMCORE', 'TAG HEUERR', 'VELOXA', 'KAPPA-ONE', 'NORDLINK'];
function hashStr(t) { let h = 2166136261; for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619); return h >>> 0; }
function liveryTexture(L, { number, sponsor, pattern = L.pattern ?? 1, kind, dirt = 0, hq = false }) {
  const key = ['liv', kind, L.primary, L.secondary, L.accent, pattern, number, sponsor, dirt, hq].join('|');
  return cached(key, () => {
    // drawn in 1024x512 units; hero cars (player, showroom) get a 2x canvas for crisp decals
    const W = 1024, H = 512, SC = hq ? 2 : 1;
    const c = document.createElement('canvas'); c.width = W * SC; c.height = H * SC; const g = c.getContext('2d'); g.scale(SC, SC);
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
    // carbon weave showing through the lower band, accent pinstripe on the paint edge
    {
      const y0 = Y(0.88), y1 = Y(0.62);
      for (let y = y1; y < y0; y += 4) for (let x = 0; x < W; x += 4) { if (((x + y) >> 2) % 2) { g.fillStyle = 'rgba(255,255,255,0.045)'; g.fillRect(x, y, 4, 2); } }
      g.fillStyle = L.accent; band(0.615, 0.622); band(0.878, 0.885);
    }
    // secondary sponsors: sidepod / engine cover, cockpit side, nose top, small technical
    // partner decals; chosen per team from its colours so every car is consistent
    {
      const h0 = hashStr(L.primary + L.secondary + (sponsor || ''));
      const pick = (k) => SPONSORS[(h0 + k * 7) % SPONSORS.length];
      const decal = (txt, uC, vC, maxW, size0, rot, boxed) => {
        g.save(); g.translate(uC * W, Y(vC)); g.rotate(rot);
        let size = size0; g.font = `italic 900 ${size}px "Exo 2", sans-serif`;
        while (g.measureText(txt).width > maxW * W && size > 10) { size -= 2; g.font = `italic 900 ${size}px "Exo 2", sans-serif`; }
        const tw = g.measureText(txt).width;
        if (boxed) { g.fillStyle = boxed; g.fillRect(-tw / 2 - 8, -size * 0.62, tw + 16, size * 1.24); }
        g.fillStyle = boxed ? (luma(boxed) > 0.6 ? '#111' : '#fff') : ink; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, 0, 2); g.restore();
      };
      const sA = pick(1), sB = pick(2), sC = pick(3);
      const top = kind === 'formula' ? [[0.22, sA], [0.62, sB]] : [[kind === 'rally' ? 0.6 : 0.68, sA], [0.25, sB]];
      for (const [u, t] of top) decal(t, u, 0.25, 0.16, 46, 0, null);
      for (const [vC, flip] of [[0.1, 0], [0.4, Math.PI]]) {
        decal(sC, kind === 'formula' ? 0.56 : kind === 'rally' ? 0.3 : 0.82, vC + (flip ? 0.04 : -0.04), 0.1, 30, flip, kind === 'formula' ? null : L.secondary);
        decal(sB, kind === 'formula' ? 0.18 : 0.12, vC, 0.1, 30, flip, null);
        // technical partners: tiny white/black patches
        for (let k = 0; k < 3; k++) decal(pick(5 + k), (kind === 'formula' ? 0.47 : 0.42) + k * 0.045, vC - (flip ? -0.07 : 0.07), 0.035, 16, flip, k % 2 ? '#ffffff' : '#111111');
      }
    }
    // top number (formula nose)
    if (number != null && kind === 'formula') { g.save(); g.translate(W * 0.86, Y(0.25)); g.rotate(Math.PI / 2); g.fillStyle = ink; g.font = 'italic 900 60px "Exo 2", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(number), 0, 0); g.restore(); }
    // panel lines: engraved seams (dark groove + faint lit lip) with fasteners, per body type
    {
      const seamV = (u, v0, v1) => { g.fillStyle = 'rgba(0,0,0,0.42)'; g.fillRect(u * W - 0.8, Y(v1), 1.6, Y(v0) - Y(v1)); g.fillStyle = 'rgba(255,255,255,0.13)'; g.fillRect(u * W + 0.9, Y(v1), 0.9, Y(v0) - Y(v1)); };
      const seamH = (v, u0, u1) => { g.fillStyle = 'rgba(0,0,0,0.42)'; g.fillRect(u0 * W, Y(v) - 0.8, (u1 - u0) * W, 1.6); g.fillStyle = 'rgba(255,255,255,0.13)'; g.fillRect(u0 * W, Y(v) + 0.9, (u1 - u0) * W, 0.9); };
      const dots = (u0, v0, u1, v1, n) => { for (let k = 0; k <= n; k++) { const t = k / n; g.fillStyle = 'rgba(20,20,22,0.55)'; g.beginPath(); g.arc((u0 + (u1 - u0) * t) * W, Y(v0 + (v1 - v0) * t), 1.3, 0, 7); g.fill(); } };
      if (kind === 'formula') {
        seamV(0.808, 0, 1); seamV(0.565, 0.02, 0.48); seamV(0.3, 0.03, 0.47);
        for (const v of [0.19, 0.31]) seamH(v, 0.03, 0.36);
        dots(0.04, 0.19, 0.34, 0.19, 12); dots(0.04, 0.31, 0.34, 0.31, 12);
        for (const v of [0.12, 0.38]) seamH(v, 0.14, 0.48);
      } else if (kind === 'rally') {
        for (const [a, b] of [[0.0, 0.24], [0.26, 0.5]]) { seamV(0.39, a, b); seamV(0.6, a, b); seamV(0.82, a, b); }
        seamH(0.205, 0.68, 0.98); seamH(0.295, 0.68, 0.98); seamH(0.2, 0.02, 0.2); seamH(0.3, 0.02, 0.2);
        for (const v of [0.12, 0.38]) { g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 1.4; g.beginPath(); g.arc(0.18 * W, Y(v), 9, 0, 7); g.stroke(); }
      } else {
        for (const [a, b] of [[0.02, 0.2], [0.3, 0.48]]) { seamV(0.42, a, b); seamV(0.66, a, b); }
        seamH(0.2, 0.7, 0.97); seamH(0.3, 0.7, 0.97); seamV(0.97, 0.18, 0.32);
        dots(0.72, 0.2, 0.95, 0.2, 8); dots(0.72, 0.3, 0.95, 0.3, 8);
      }
    }
    if (dirt > 0) {
      // mud and dust (v .5-.75 = left side below the belt, .75-1 = right side): caked on the
      // sills and lower doors, fading up the sides, speckled spray, dusty rear
      let seed = 5; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      const mc = (a) => `rgba(${118 + rnd() * 30},${90 + rnd() * 20},${58 + rnd() * 16},${a})`;
      g.fillStyle = `rgba(112,86,58,${0.82 * dirt})`; g.fillRect(0, Y(0.94), W, Y(0.56) - Y(0.94));
      const fade = (va, vb) => { const gr = g.createLinearGradient(0, Y(va), 0, Y(vb)); gr.addColorStop(0, `rgba(122,94,62,${0.8 * dirt})`); gr.addColorStop(1, 'rgba(122,94,62,0)'); g.fillStyle = gr; g.fillRect(0, Math.min(Y(va), Y(vb)), W, Math.abs(Y(va) - Y(vb))); };
      fade(0.56, 0.44); fade(0.94, 1.0); fade(0.0, 0.07);
      for (let i = 0; i < 3200 * dirt; i++) {
        const u = rnd(), r = rnd(); const v = r < 0.45 ? 0.42 + rnd() * 0.16 : r < 0.75 ? 0.9 + rnd() * 0.1 : rnd() * 0.1;
        g.fillStyle = mc(0.2 + rnd() * 0.55); g.fillRect(u * W, Y(v), 1 + rnd() * 6, 1 + rnd() * 3);
      }
      const rear = g.createLinearGradient(0, 0, W * 0.16, 0); rear.addColorStop(0, `rgba(120,92,60,${0.65 * dirt})`); rear.addColorStop(1, 'rgba(120,92,60,0)'); g.fillStyle = rear; g.fillRect(0, 0, W * 0.16, H);
      g.fillStyle = `rgba(150,128,100,${0.12 * dirt})`; g.fillRect(0, 0, W, H);
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = hq ? 16 : 8;
    const lm = new THREE.MeshPhysicalMaterial({ map: t, roughness: dirt > 0 ? 0.32 + dirt * 0.35 : 0.3, metalness: 0.12, clearcoat: 1 - dirt * 0.6, clearcoatRoughness: 0.03 + dirt * 0.4, normalMap: flakeTex(), normalScale: new THREE.Vector2(0.06, 0.06), envMapIntensity: 1.25, specularIntensity: 0.8 });
    lm.userData.keepFar = true; return lm;
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
// flat plate whose faces carry a planar 0..1 UV over its outline (for printed decals);
// mirror = true flips u so the decal reads correctly on the -z (right-hand) side of the car
function decalPlate(points, thickness, m, z = 0, mirror = false) {
  const o = plate(points, thickness, m, z);
  const g = o.geometry, P = g.attributes.position, uv = g.attributes.uv;
  g.computeBoundingBox(); const { min, max } = g.boundingBox;
  for (let i = 0; i < P.count; i++) { const u = (P.getX(i) - min.x) / (max.x - min.x || 1); uv.setXY(i, mirror ? 1 - u : u, (P.getY(i) - min.y) / (max.y - min.y || 1)); }
  return o;
}
// end-plate artwork: team colour field, big sponsor name, small partner logos and stripes
function endplateMat(L, sponsor) {
  return MAT.decal(['ep', L.primary, L.secondary, L.accent, sponsor].join('|'), (g, w, h) => {
    g.fillStyle = L.primary; g.fillRect(0, 0, w, h);
    g.fillStyle = L.secondary; g.fillRect(0, h * 0.72, w, h * 0.28);
    g.fillStyle = L.accent; g.fillRect(0, h * 0.7, w, h * 0.03);
    const ink = luma(L.primary) > 0.6 ? '#0b0b0d' : '#ffffff';
    const txt = String(sponsor || 'APEX').toUpperCase();
    let size = 120; g.font = `italic 900 ${size}px "Exo 2", sans-serif`;
    while (g.measureText(txt).width > w * 0.82 && size > 30) { size -= 6; g.font = `italic 900 ${size}px "Exo 2", sans-serif`; }
    g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, w * 0.5, h * 0.42);
    const h0 = hashStr(L.primary + txt);
    g.font = 'italic 900 26px "Exo 2", sans-serif'; g.fillStyle = luma(L.secondary) > 0.6 ? '#111' : '#fff';
    g.fillText(SPONSORS[h0 % SPONSORS.length], w * 0.3, h * 0.86); g.fillText(SPONSORS[(h0 + 5) % SPONSORS.length], w * 0.72, h * 0.86);
  });
}
// helmet livery on the sphere UVs (u = around, u .5 faces forward; v = 0 bottom .. 1 top):
// base colour, crown design, side stripes in the team colours, number on the back
function helmetMat(base, L, number) {
  return cached(['helm', base, L.primary, L.secondary, L.accent, number].join('|'), () => {
    const w = 512, h = 256, c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    const a1 = L.primary.toLowerCase() === String(base).toLowerCase() ? L.secondary : L.primary;
    // crown: swept shapes from the top
    g.fillStyle = a1; g.beginPath(); g.moveTo(0, 0); g.lineTo(w, 0); g.lineTo(w, h * 0.16);
    for (let k = 8; k >= 0; k--) { const x = (k / 8) * w; g.lineTo(x, h * (0.16 + 0.14 * Math.abs(Math.sin(k * 0.785 + 0.4)))); }
    g.closePath(); g.fill();
    // side stripes sweeping back from the visor
    for (const [col, y0, th] of [[L.accent, 0.42, 0.05], [a1, 0.5, 0.08], [L.accent, 0.6, 0.03]]) {
      g.fillStyle = col; g.beginPath();
      g.moveTo(w * 0.62, h * y0); g.bezierCurveTo(w * 0.8, h * (y0 - 0.1), w * 0.95, h * (y0 + 0.1), w, h * y0); g.lineTo(w, h * (y0 + th)); g.bezierCurveTo(w * 0.95, h * (y0 + th + 0.1), w * 0.8, h * (y0 + th - 0.1), w * 0.62, h * (y0 + th)); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(w * 0.38, h * y0); g.bezierCurveTo(w * 0.2, h * (y0 - 0.1), w * 0.05, h * (y0 + 0.1), 0, h * y0); g.lineTo(0, h * (y0 + th)); g.bezierCurveTo(w * 0.05, h * (y0 + th + 0.1), w * 0.2, h * (y0 + th - 0.1), w * 0.38, h * (y0 + th)); g.closePath(); g.fill();
    }
    // chin / lower shell darker, number at the back
    g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(0, h * 0.82, w, h * 0.18);
    if (number != null) { g.fillStyle = luma(base) > 0.6 ? '#111' : '#fff'; g.font = 'italic 900 46px "Exo 2", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(number), w * 0.0 + 1, h * 0.36); g.fillText(String(number), w, h * 0.36); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return new THREE.MeshPhysicalMaterial({ map: t, roughness: 0.25, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.3 });
  });
}
function rod(a, b, r, m) {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
  const len = va.distanceTo(vb);
  const o = mesh(new THREE.CylinderGeometry(r, r, len, 6), m);
  o.position.copy(va).add(vb).multiplyScalar(0.5);
  o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
  return o;
}

// ---------------- shaped loft ----------------
// Like loft(), but each section has its own top/bottom heights and different half-widths at
// the belt line (w), at the top (wt) and at the bottom (wb): tumblehome, undercuts, hulls.
// section: { x, top, bot, belt?, w, wt?, wb?, n? }
const geoCache = new Map();
function memo(name, args, make) { const k = name + JSON.stringify(args); if (!geoCache.has(k)) geoCache.set(k, make()); return geoCache.get(k); }
function hull(sections, opts = {}) { return memo('h', [sections, opts], () => hullRaw(sections, opts)); }
function hullRaw(sections, { seg = 48, around = 40, u0 = 0, u1 = 1, capFront = true, capRear = true } = {}) {
  const S = sections.slice().sort((a, b) => a.x - b.x).map((q) => ({ belt: (q.top + q.bot) / 2, wt: q.w, wb: q.w, n: 3, ...q }));
  const keys = ['top', 'bot', 'belt', 'w', 'wt', 'wb', 'n'];
  const sample = (x) => {
    let i = 0; while (i < S.length - 2 && S[i + 1].x < x) i++;
    const a = S[Math.max(0, i - 1)], b = S[i], c = S[i + 1], d = S[Math.min(S.length - 1, i + 2)];
    const t = Math.max(0, Math.min(1, (x - b.x) / ((c.x - b.x) || 1)));
    const o = {};
    for (const k of keys) { const p0 = a[k], p1 = b[k], p2 = c[k], p3 = d[k]; const t2 = t * t, t3 = t2 * t; o[k] = 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3); }
    o.w = Math.max(0.004, o.w); o.wt = Math.max(0.002, o.wt); o.wb = Math.max(0.002, o.wb); o.n = Math.max(1.6, o.n);
    o.top = Math.max(o.top, o.belt + 0.002); o.bot = Math.min(o.bot, o.belt - 0.002);
    return o;
  };
  const x0 = S[0].x, x1 = S[S.length - 1].x;
  const pos = [], uv = [], idx = [];
  const pt = (s, th) => {
    const cs = Math.cos(th), sn = Math.sin(th), e = 2 / s.n;
    const uz = Math.sign(cs) * Math.abs(cs) ** e, uy = Math.sign(sn) * Math.abs(sn) ** e;
    const hw = uy >= 0 ? s.w + (s.wt - s.w) * uy * uy : s.w + (s.wb - s.w) * uy * uy;
    return [uz * hw, uy >= 0 ? s.belt + uy * (s.top - s.belt) : s.belt + uy * (s.belt - s.bot)];
  };
  // vertices are spread by arc length inside each quadrant (boxy sections would otherwise
  // bunch their vertices at the corners and get wrong normals on the flat sides); quadrant
  // boundaries stay at v = 0 / .25 / .5 / .75 so liveries map consistently
  const Q = Math.max(2, Math.round(around / 4)); around = Q * 4;
  const M = 64;
  for (let i = 0; i <= seg; i++) {
    const x = x0 + (x1 - x0) * (i / seg); const s = sample(x);
    for (let q = 0; q < 4; q++) {
      const dense = []; const len = [0];
      for (let k = 0; k <= M; k++) { const p = pt(s, (q + k / M) * Math.PI / 2); dense.push(p); if (k) len.push(len[k - 1] + Math.hypot(p[0] - dense[k - 1][0], p[1] - dense[k - 1][1])); }
      const total = len[M] || 1; let k = 0;
      for (let j = 0; j < Q + (q === 3 ? 1 : 0); j++) {
        const target = (j / Q) * total; while (k < M - 1 && len[k + 1] < target) k++;
        const f = Math.min(1, (target - len[k]) / ((len[k + 1] - len[k]) || 1));
        const z = dense[k][0] + (dense[k + 1][0] - dense[k][0]) * f, y = dense[k][1] + (dense[k + 1][1] - dense[k][1]) * f;
        pos.push(x, y, z); uv.push(u0 + (u1 - u0) * (i / seg), (q * Q + j) / around);
      }
    }
  }
  const R = around + 1;
  for (let i = 0; i < seg; i++) for (let j = 0; j < around; j++) { const a = i * R + j, b = a + R; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const cap = (i, front) => { const s = sample(x0 + (x1 - x0) * (i / seg)); const ci = pos.length / 3; pos.push(x0 + (x1 - x0) * (i / seg), s.belt, 0); uv.push(front ? u1 : u0, 0.25); for (let j = 0; j < around; j++) { const a = i * R + j; front ? idx.push(ci, a + 1, a) : idx.push(ci, a, a + 1); } };
  if (capRear) cap(0, false); if (capFront) cap(seg, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// Swept airfoil built along z: samples [{z, x (leading edge), y, c (chord), a (angle, rad), t (thickness)}]
function sweptWing(samples, m) {
  const g0 = memo('w', samples, () => sweptGeo(samples));
  const o = mesh(g0, m); return o;
}
function sweptGeo(samples) {
  const prof = []; const NP = 12;
  for (let k = 0; k <= NP; k++) { const u = k / NP; prof.push([u, 0.6 * (1 - u) * Math.sqrt(u) * 1.9]); }
  const loop = [...prof.map(([u, h]) => [u, h]), ...prof.slice(1, -1).reverse().map(([u, h]) => [u, -h * 0.35])];
  const pos = [], idx = [];
  samples.forEach((sm) => {
    const ca = Math.cos(sm.a), sa = Math.sin(sm.a);
    for (const [u, h] of loop) { const lx = -u * sm.c, ly = h * sm.t; pos.push(sm.x + lx * ca - ly * sa, sm.y + lx * sa + ly * ca, sm.z); }
  });
  const L = loop.length;
  for (let i = 0; i < samples.length - 1; i++) for (let j = 0; j < L; j++) { const a = i * L + j, b = i * L + (j + 1) % L, c = a + L, d = b + L; idx.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
const spanSamples = (half, n, f) => { const out = []; for (let k = 0; k <= n; k++) { const z = -half + (2 * half * k) / n; out.push({ z, ...f(Math.abs(z) / half, z) }); } return out; };

// ---------------- tyres & wheels ----------------
function sidewallTex(color, brand = 'PIRELLO  P ZERO') {
  return cached('sw' + color + brand, () => {
    const S = 512, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
    g.clearRect(0, 0, S, S); g.translate(S / 2, S / 2);
    g.strokeStyle = color; g.lineWidth = 16; g.beginPath(); g.arc(0, 0, S * 0.44, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#e4e4e4'; g.font = 'bold 28px "Exo 2", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const base of [0, Math.PI]) { const txt = brand; const R = S * 0.385; let ang = base - (txt.length * 0.082) / 2; for (const ch of txt) { g.save(); g.rotate(ang + Math.PI / 2); g.translate(0, -R); g.fillText(ch, 0, 0); g.restore(); ang += 0.082; } }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
  });
}
// tyre rubber mapped on the lathe UVs (u = around, v = across the profile: 0 / 1 at the
// rim, tread between v .467 and .533): satin sidewall, dusty worn tread with rubber
// streaks along the rolling direction (they also make the rotation visible), grooved
// blocks for gravel tyres; matching roughness and bump maps
function tyreMat(kind) {
  return cached('tyre' + kind, () => {
    const W = 512, H = 256, mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return [c, c.getContext('2d')]; };
    const [cc, g] = mk(), [rc, gr] = mk(), [bc, gb] = mk();
    let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const V0 = 0.4, T0 = 0.467, T1 = 0.533, V1 = 0.6;
    for (let y = 0; y < H; y++) {
      const v = 1 - (y + 0.5) / H;
      const tread = v > T0 && v < T1 ? 1 : 0, shoulder = !tread && v > V0 && v < V1 ? 1 - Math.min(Math.abs(v - T0), Math.abs(v - T1)) / (T0 - V0) : 0;
      const base = tread ? 40 : 22 + shoulder * 10;
      g.fillStyle = `rgb(${base},${base - 1},${base - 2})`; g.fillRect(0, y, W, 1);
      const ro = tread ? 236 : 175 + shoulder * 40; gr.fillStyle = `rgb(${ro},${ro},${ro})`; gr.fillRect(0, y, W, 1);
      gb.fillStyle = 'rgb(128,128,128)'; gb.fillRect(0, y, W, 1);
    }
    const ty0 = (1 - T1) * H, ty1 = (1 - T0) * H;
    // streaks / graining on the tread, faint moulding lines on the sidewall
    for (let i = 0; i < 900; i++) {
      const y = ty0 + rnd() * (ty1 - ty0), x = rnd() * W, len = 6 + rnd() * 60, a = rnd();
      g.fillStyle = a > 0.5 ? `rgba(70,64,58,${0.25 + rnd() * 0.35})` : `rgba(8,8,9,${0.3 + rnd() * 0.3})`; g.fillRect(x, y, len, 1);
      gb.fillStyle = a > 0.5 ? 'rgba(160,160,160,0.6)' : 'rgba(100,100,100,0.6)'; gb.fillRect(x, y, len, 1);
    }
    for (let i = 0; i < 400; i++) { const y = rnd() < 0.5 ? rnd() * ty0 * 0.95 : ty1 + rnd() * (H - ty1) * 0.95, x = rnd() * W; gr.fillStyle = `rgba(120,120,120,${0.2 + rnd() * 0.2})`; gr.fillRect(x, y, 1 + rnd() * 3, 1 + rnd() * 2); }
    if (kind === 'rally') {
      // block tread: lateral grooves alternating across the centre, a circumferential groove
      for (let k = 0; k < 44; k++) {
        const x = (k / 44) * W, off = (k % 2) * 5;
        for (const [ctx, col] of [[g, 'rgb(10,10,11)'], [gb, 'rgb(20,20,20)'], [gr, 'rgb(255,255,255)']]) { ctx.fillStyle = col; ctx.fillRect(x + off, ty0 - 6, 3, (ty1 - ty0) / 2 + 4); ctx.fillRect(x + 5 - off, ty0 + (ty1 - ty0) / 2 + 2, 3, (ty1 - ty0) / 2 + 4); }
      }
      for (const [ctx, col] of [[g, 'rgb(10,10,11)'], [gb, 'rgb(20,20,20)']]) { ctx.fillStyle = col; ctx.fillRect(0, (ty0 + ty1) / 2 - 1, W, 2); }
    }
    const tex = (c, srgb) => { const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
    return new THREE.MeshStandardMaterial({ map: tex(cc, true), roughnessMap: tex(rc), bumpMap: tex(bc), bumpScale: kind === 'rally' ? 2.5 : 0.6, roughness: 1, metalness: 0 });
  });
}
// metallic-flake normal noise under the clear coat (the coat itself stays mirror-smooth)
function flakeTex() {
  return cached('flake', () => {
    const S = 128, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'); const im = g.createImageData(S, S);
    let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < S * S; i++) { const x = rnd() * 2 - 1, y = rnd() * 2 - 1; im.data[i * 4] = 128 + x * 110; im.data[i * 4 + 1] = 128 + y * 110; im.data[i * 4 + 2] = 255; im.data[i * 4 + 3] = 255; }
    g.putImageData(im, 0, 0);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(36, 22); return t;
  });
}
// 2022+ wheel cover: dished carbon disc with moulded aero vanes, team-colour ring and
// rim lip, all in one texture (one draw call per wheel face)
function coverMat(base, ring) {
  return cached('cover' + base + ring, () => {
    const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'); const R = S / 2;
    g.translate(R, R);
    const gr = g.createRadialGradient(0, 0, 4, 0, 0, R); gr.addColorStop(0, '#3a3d44'); gr.addColorStop(0.35, base); gr.addColorStop(0.95, base); gr.addColorStop(1, '#050506');
    g.fillStyle = gr; g.fillRect(-R, -R, S, S);
    for (let k = 0; k < 10; k++) { g.save(); g.rotate((k / 10) * Math.PI * 2); g.fillStyle = 'rgba(255,255,255,0.07)'; g.beginPath(); g.moveTo(R * 0.22, -3); g.quadraticCurveTo(R * 0.5, -R * 0.14, R * 0.74, -R * 0.06); g.lineTo(R * 0.74, 0); g.quadraticCurveTo(R * 0.5, -R * 0.06, R * 0.22, 3); g.fill(); g.restore(); }
    g.strokeStyle = ring; g.lineWidth = R * 0.08; g.beginPath(); g.arc(0, 0, R * 0.82, 0, 7); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 1.5; g.beginPath(); g.arc(0, 0, R * 0.865, 0, 7); g.stroke();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return new THREE.MeshPhysicalMaterial({ map: t, roughness: 0.35, metalness: 0.2, clearcoat: 0.8, clearcoatRoughness: 0.08 });
  });
}
function sidewallMat(color) { return cached('swm' + color, () => new THREE.MeshStandardMaterial({ map: sidewallTex(color), transparent: true, roughness: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 })); }

// kind: 'f1' (wheel covers), 'gt' (centre-lock 5 spoke), 'rally' (white multi-spoke)
function wheel(r, w, tyreColor, { rim = '#1c1f24', kind = 'gt', rimFrac = 0.66, cover = null, decal = true } = {}) {
  const grp = new THREE.Group(); const spin = new THREE.Group(); grp.add(spin);
  const prof = []; const rr = w * 0.2; const rimR = r * rimFrac;
  prof.push(new THREE.Vector2(rimR, -w / 2 + 0.01));
  for (let k = 0; k <= 6; k++) { const a = -Math.PI / 2 + (k / 6) * (Math.PI / 2); prof.push(new THREE.Vector2(r - rr + Math.cos(a) * rr, -w / 2 + rr + Math.sin(a) * rr)); }
  for (let k = 0; k <= 6; k++) { const a = (k / 6) * (Math.PI / 2); prof.push(new THREE.Vector2(r - rr + Math.cos(a) * rr, w / 2 - rr + Math.sin(a) * rr)); }
  prof.push(new THREE.Vector2(rimR, w / 2 - 0.01));
  const tg = new THREE.LatheGeometry(prof, 44); tg.rotateX(Math.PI / 2);
  spin.add(mesh(tg, tyreMat(kind === 'rally' ? 'rally' : 'slick')));
  // sidewall branding with compound colour (planar UV on a disc)
  if (decal) for (const sgn of [1, -1]) {
    const d = new THREE.Mesh(new THREE.RingGeometry(rimR * 1.01, r * 0.985, 48, 1), sidewallMat(tyreColor || '#ffd400'));
    const uv = d.geometry.attributes.uv, P = d.geometry.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.5 + P.getX(i) / (2 * r / 0.92), 0.5 + P.getY(i) / (2 * r / 0.92));
    d.position.z = sgn * (w / 2 + 0.003); if (sgn < 0) d.rotation.y = Math.PI; d.userData.band = true; spin.add(d);
  }
  const rimM = MAT.rim(rim);
  const barrel = mesh(new THREE.CylinderGeometry(rimR, rimR, w * 0.94, 32, 1, true), rimM); barrel.rotation.x = Math.PI / 2; spin.add(barrel);
  for (const sgn of [1, -1]) {
    const face = new THREE.Group(); face.position.z = sgn * w * 0.36;
    face.add(mesh(new THREE.CircleGeometry(rimR * 0.99, 32), MAT.rim('#0d0f12')));
    if (kind === 'f1') {
      // 2022+ wheel cover: slightly dished disc with team-coloured ring
      const cv = mesh(new THREE.CircleGeometry(rimR * 0.97, 40), coverMat(cover || '#16181c', rim)); cv.position.z = 0.012; face.add(cv);
      const nut = mesh(new THREE.CylinderGeometry(rimR * 0.16, rimR * 0.18, 0.05, 6), MAT.chrome()); nut.rotation.x = Math.PI / 2; nut.position.z = 0.03; face.add(nut);
    } else {
      const n = kind === 'rally' ? 8 : 5;
      for (let k = 0; k < n; k++) {
        const ang = (k / n) * Math.PI * 2;
        const sp = mesh(new THREE.BoxGeometry(rimR * 0.92, rimR * (kind === 'rally' ? 0.13 : 0.2), 0.03), rimM);
        sp.position.set(Math.cos(ang) * rimR * 0.46, Math.sin(ang) * rimR * 0.46, 0.01); sp.rotation.z = ang; face.add(sp);
      }
      const hub = mesh(new THREE.CylinderGeometry(rimR * 0.2, rimR * 0.22, 0.06, kind === 'rally' ? 5 : 12), kind === 'rally' ? rimM : MAT.chrome()); hub.rotation.x = Math.PI / 2; hub.position.z = 0.02; face.add(hub);
      // brake disc & calliper visible through spokes
      const disc = mesh(new THREE.CylinderGeometry(rimR * 0.82, rimR * 0.82, 0.03, 28), MAT.rim('#555a61')); disc.rotation.x = Math.PI / 2; disc.position.z = -0.05; face.add(disc);
    }
    if (sgn < 0) face.rotation.y = Math.PI;
    spin.add(face);
  }
  if (kind !== 'f1') { const cal = mesh(new THREE.BoxGeometry(rimR * 0.5, rimR * 0.35, 0.06), MAT.paint('#c8102e')); cal.position.set(rimR * 0.45, rimR * 0.45, 0); grp.add(cal); }
  grp.userData.spin = [spin]; grp.userData.spinAxis = 'z';
  grp.userData.rimR = rimR; grp.userData.w = w; grp.userData.kind = kind; grp.userData.r = r;
  return grp;
}

// ---------------- Formula (2022+ ground-effect car) ----------------
function formula(L, opts) {
  const car = new THREE.Group();
  const paint = liveryTexture(L, { ...opts, kind: 'formula' });
  const sec = MAT.paint(L.secondary), acc = MAT.paint(L.accent), cf = MAT.carbon(), blk = MAT.rubber();
  const XF = 1.8, XR = -1.8; // axles
  // survival cell + long nose
  car.add(mesh(hull([
    { x: -0.9, top: 0.76, bot: 0.07, w: 0.36, wt: 0.3, wb: 0.34, n: 3 },
    { x: -0.3, top: 0.79, bot: 0.07, w: 0.38, wt: 0.32, wb: 0.36, n: 3 },
    { x: 0.35, top: 0.76, bot: 0.08, w: 0.36, wt: 0.26, wb: 0.34, n: 3 },
    { x: 1.1, top: 0.64, bot: 0.12, w: 0.27, wt: 0.2, wb: 0.25, n: 2.8 },
    { x: 1.8, top: 0.5, bot: 0.15, w: 0.19, wt: 0.14, wb: 0.18, n: 2.6 },
    { x: 2.45, top: 0.33, bot: 0.14, w: 0.13, wt: 0.1, wb: 0.12, n: 2.4 },
    { x: 2.78, top: 0.22, bot: 0.13, w: 0.07, wt: 0.05, wb: 0.07, n: 2.2 },
  ], { u0: 0.4, u1: 1 }), paint));
  // sidepods: high inlet, deep undercut, downwash ramp into the coke-bottle
  car.add(mesh(hull([
    { x: -1.95, top: 0.36, bot: 0.12, belt: 0.27, w: 0.2, wt: 0.14, wb: 0.18, n: 3 },
    { x: -1.3, top: 0.46, bot: 0.12, belt: 0.34, w: 0.42, wt: 0.33, wb: 0.34, n: 3.2 },
    { x: -0.55, top: 0.6, bot: 0.14, belt: 0.48, w: 0.7, wt: 0.6, wb: 0.42, n: 3.6 },
    { x: 0.05, top: 0.68, bot: 0.2, belt: 0.56, w: 0.78, wt: 0.66, wb: 0.46, n: 4 },
    { x: 0.42, top: 0.68, bot: 0.3, belt: 0.58, w: 0.76, wt: 0.68, wb: 0.5, n: 4.4 },
  ], { u0: 0.12, u1: 0.5, capFront: false }), paint));
  // dark inlet mouths
  for (const z of [0.56, -0.56]) { const inl = mesh(new THREE.BoxGeometry(0.03, 0.2, 0.36), blk); inl.position.set(0.42, 0.55, z); car.add(inl); }
  // engine cover, airbox and roll hoop
  car.add(mesh(hull([
    { x: -2.25, top: 0.46, bot: 0.3, w: 0.07, wt: 0.05, n: 2.6 },
    { x: -1.8, top: 0.58, bot: 0.28, w: 0.16, wt: 0.1, n: 2.8 },
    { x: -1.2, top: 0.78, bot: 0.3, w: 0.24, wt: 0.14, n: 3 },
    { x: -0.7, top: 1.0, bot: 0.4, w: 0.22, wt: 0.12, n: 3 },
    { x: -0.42, top: 1.05, bot: 0.55, w: 0.17, wt: 0.1, n: 2.8 },
  ], { u0: 0.02, u1: 0.4 }), paint));
  const ab = mesh(new THREE.CircleGeometry(0.1, 20), blk); ab.position.set(-0.415, 0.93, 0); ab.rotation.y = Math.PI / 2; ab.scale.set(0.9, 1.15, 1); car.add(ab);
  const tcam = mesh(new THREE.BoxGeometry(0.16, 0.05, 0.03), MAT.paint('#ffd400')); tcam.position.set(-0.5, 1.08, 0); car.add(tcam);
  // shark fin
  car.add(plate([[-0.75, 1.0], [-1.95, 0.74], [-1.95, 0.6], [-1.2, 0.76]], 0.012, MAT.paint(L.primary)));
  // cockpit rim + headrest
  car.add(mesh(loft([{ x: -0.62, w: 0.48, h: 0.05, y: 0.785, n: 3 }, { x: -0.1, w: 0.52, h: 0.05, y: 0.785, n: 3 }, { x: 0.3, w: 0.3, h: 0.04, y: 0.765, n: 3 }], { seg: 10, around: 20 }), blk));
  const helmet = mesh(new THREE.SphereGeometry(0.135, 28, 18), helmetMat(opts.helmet || '#ffd400', L, opts.number)); helmet.position.set(-0.36, 0.86, 0); helmet.scale.set(1.18, 1, 1); car.add(helmet);
  // visor faces forward (+x): sphere phi = pi points along +x
  const visor = mesh(new THREE.SphereGeometry(0.138, 22, 10, Math.PI - 0.95, 1.9, 1.22, 0.42), MAT.visor()); visor.position.copy(helmet.position); visor.scale.copy(helmet.scale); car.add(visor);
  car.userData.helmetParts = [helmet, visor];
  // cockpit interior: steering wheel with display
  {
    const sw = new THREE.Group();
    sw.add(mesh(new THREE.BoxGeometry(0.035, 0.13, 0.27), cf));
    for (const z of [-0.15, 0.15]) { const g = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.15, 10), blk); g.position.set(0, -0.01, z); sw.add(g); const glove = mesh(new THREE.SphereGeometry(0.035, 10, 8), blk); glove.position.set(-0.025, 0, z); glove.scale.set(1.2, 1, 0.8); sw.add(glove); }
    const dc = document.createElement('canvas'); dc.width = 128; dc.height = 64; const dx = dc.getContext('2d');
    dx.fillStyle = '#05070a'; dx.fillRect(0, 0, 128, 64); dx.fillStyle = '#18e06a'; dx.font = 'bold 34px monospace'; dx.textAlign = 'center'; dx.fillText('7', 64, 44); dx.font = 'bold 12px monospace'; dx.fillStyle = '#ffd400'; dx.fillText('-0.142', 26, 58); dx.fillStyle = '#4fc3ff'; dx.fillText('ERS 78%', 100, 58);
    for (let k = 0; k < 10; k++) { dx.fillStyle = k < 4 ? '#18e06a' : k < 7 ? '#ff3030' : '#4f7dff'; dx.fillRect(10 + k * 11, 4, 8, 6); }
    const dt = new THREE.CanvasTexture(dc); dt.colorSpace = THREE.SRGBColorSpace;
    const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.05), new THREE.MeshBasicMaterial({ map: dt })); disp.position.set(-0.019, 0.01, 0); disp.rotation.y = -Math.PI / 2; sw.add(disp);
    sw.position.set(-0.1, 0.72, 0); sw.rotation.z = 0.45; car.add(sw);
  }
  // halo (titanium, carbon fairing)
  const haloCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.66, 0.79, 0.29), new THREE.Vector3(-0.42, 1.0, 0.29), new THREE.Vector3(-0.05, 1.03, 0.2), new THREE.Vector3(0.12, 1.0, 0), new THREE.Vector3(-0.05, 1.03, -0.2), new THREE.Vector3(-0.42, 1.0, -0.29), new THREE.Vector3(-0.66, 0.79, -0.29)]);
  car.add(mesh(new THREE.TubeGeometry(haloCurve, 48, 0.03, 10), cf));
  car.add(rod([0.12, 1.0, 0], [0.32, 0.75, 0], 0.028, cf));
  // mirrors on sidepod shoulders
  for (const z of [0.5, -0.5]) {
    // aero mirror housing (painted, teardrop) on a carbon stalk from the sidepod
    car.add(rod([0.2, 0.66, z * 0.78], [0.3, 0.8, z], 0.012, cf));
    const mr = mesh(new THREE.SphereGeometry(1, 14, 10, 0, Math.PI * 2, 0, Math.PI), MAT.paint(L.primary)); mr.position.set(0.3, 0.81, z); mr.scale.set(0.062, 0.036, 0.088); car.add(mr);
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.06), MAT.mirror()); gl.position.set(0.228, 0.81, z); gl.rotation.y = -Math.PI / 2; car.add(gl);
  }
  // floor: wide plate with edge wings and fences, diffuser
  car.add(plate([[XR + 0.2, -0.78], [0.55, -0.92], [0.95, -0.66], [1.2, -0.3], [1.2, 0.3], [0.95, 0.66], [0.55, 0.92], [XR + 0.2, 0.78]], 0.022, cf).rotateX(Math.PI / 2).translateZ(-0.05));
  for (const z of [0.93, -0.93]) { const edge = plate([[0.6, 0.05], [-0.9, 0.05], [-0.9, 0.12], [0.3, 0.1]], 0.012, cf, 0); edge.position.z = z; car.add(edge); }
  for (const z of [0.42, 0.62, -0.42, -0.62]) { const fence = plate([[1.15, 0.05], [0.7, 0.05], [0.75, 0.22], [1.05, 0.2]], 0.01, cf, 0); fence.position.z = z; car.add(fence); }
  const diff = mesh(new THREE.BoxGeometry(0.62, 0.02, 1.5), cf); diff.position.set(XR - 0.2, 0.17, 0); diff.rotation.z = -0.32; car.add(diff);
  for (const z of [-0.75, -0.25, 0.25, 0.75]) { const st = plate([[XR + 0.12, 0.06], [XR - 0.52, 0.27], [XR - 0.52, 0.1], [XR + 0.12, 0.05]], 0.01, cf, 0); st.position.z = z; car.add(st); }
  // front wing: four elements that sweep up towards the end plates, neutral centre under the nose
  const fwX = 2.86;
  const fw = (k) => spanSamples(0.98, 24, (u) => {
    const out = Math.max(0, (u - 0.22) / 0.78);
    return { x: fwX - 0.04 - k * 0.12 - out * (0.04 + k * 0.05), y: 0.075 + k * 0.045 + out * out * (0.05 + k * 0.06), c: (0.3 - k * 0.05) * (1 - out * 0.25), a: -0.04 - k * 0.2 - out * 0.12, t: 0.035 - k * 0.004 };
  });
  car.add(sweptWing(fw(0), acc)); car.add(sweptWing(fw(1), sec)); car.add(sweptWing(fw(2), sec)); car.add(sweptWing(fw(3), acc));
  for (const z of [0.985, -0.985]) car.add(plate([[fwX + 0.02, 0.05], [fwX - 0.62, 0.05], [fwX - 0.66, 0.3], [fwX - 0.42, 0.36], [fwX - 0.1, 0.22]], 0.012, acc, z));
  car.add(rod([2.5, 0.18, 0.09], [2.55, 0.11, 0.12], 0.016, cf)); car.add(rod([2.5, 0.18, -0.09], [2.55, 0.11, -0.12], 0.016, cf));
  // rear wing with rounded 2022 end plates, DRS flap, beam wing and swan-neck pylon
  const rwX = -2.42;
  car.add(sweptWing(spanSamples(0.5, 12, (u) => ({ x: rwX + 0.18, y: 0.82 + u * u * 0.04, c: 0.36, a: -0.18, t: 0.045 })), paint));
  car.add(sweptWing(spanSamples(0.5, 12, (u) => ({ x: rwX + 0.05, y: 0.96 + u * u * 0.03, c: 0.22, a: -0.55, t: 0.03 })), acc));
  for (const z of [0.5, -0.5]) car.add(decalPlate([[rwX + 0.24, 0.42], [rwX + 0.28, 0.82], [rwX + 0.16, 1.02], [rwX - 0.08, 1.07], [rwX - 0.24, 1.0], [rwX - 0.28, 0.6], [rwX - 0.1, 0.42]], 0.014, endplateMat(L, opts.sponsor), z, z < 0));
  // pitot tube on the nose tip, radio antenna on the nose and behind the roll hoop
  car.add(rod([2.74, 0.19, 0], [2.98, 0.2, 0], 0.006, MAT.chrome()));
  car.add(rod([1.35, 0.6, 0.06], [1.31, 0.75, 0.07], 0.004, blk));
  car.add(rod([-1.05, 0.84, 0], [-1.12, 1.0, 0], 0.005, blk));
  car.add(sweptWing(spanSamples(0.46, 8, () => ({ x: rwX + 0.25, y: 0.36, c: 0.2, a: -0.12, t: 0.025 })), cf));
  car.add(sweptWing(spanSamples(0.46, 8, () => ({ x: rwX + 0.1, y: 0.44, c: 0.14, a: -0.35, t: 0.02 })), cf));
  car.add(plate([[-1.95, 0.48], [rwX + 0.1, 0.9], [rwX - 0.02, 0.9], [-2.1, 0.46]], 0.03, cf));
  const rl = mesh(new THREE.BoxGeometry(0.04, 0.05, 0.12), MAT.light('#ff2020', 3)); rl.position.set(-2.3, 0.33, 0); car.add(rl);
  // suspension (push-rod front, pull-rod rear), brake ducts, wheels
  const wheels = [];
  const W = [[XF, 0.81, 0.36, 0.305, true], [XF, -0.81, 0.36, 0.305, true], [XR, 0.79, 0.36, 0.405, false], [XR, -0.79, 0.36, 0.405, false]];
  for (const [x, z, r, w, front] of W) {
    const wh = wheel(r, w, opts.tyre, { kind: 'f1', rim: L.accent, cover: '#15171b', rimFrac: 0.62 }); wh.position.set(x, r, z); car.add(wh); wheels.push(wh);
    const zi = Math.sign(z) * (front ? 0.2 : 0.3), zo = z - Math.sign(z) * (w / 2 + 0.03);
    car.add(rod([x + 0.32, front ? 0.36 : 0.4, zi], [x, r + 0.1, zo], 0.016, cf));
    car.add(rod([x - 0.3, front ? 0.34 : 0.38, zi], [x, r + 0.1, zo], 0.016, cf));
    car.add(rod([x + 0.3, 0.2, zi], [x, r - 0.12, zo], 0.016, cf));
    car.add(rod([x - 0.3, 0.2, zi], [x, r - 0.12, zo], 0.016, cf));
    car.add(rod(front ? [x - 0.05, r - 0.1, zo] : [x, r + 0.12, zo], front ? [x - 0.15, 0.6, zi] : [x + 0.15, 0.22, zi], 0.013, cf));
    const duct = mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.62, 0.12, 20), cf); duct.rotation.x = Math.PI / 2; duct.position.set(x, r, z - Math.sign(z) * (w / 2 + 0.06)); car.add(duct);
    if (front) { const wl = sweptWing(spanSamples(0.13, 4, () => ({ x: x + 0.2, y: r * 2 + 0.05, c: 0.32, a: 0.05, t: 0.03 })), cf); wl.position.z = z; car.add(wl); }
  }
  car.userData.wheels = wheels;
  return car;
}

// ---------------- Le Mans Hypercar ----------------
function endurance(L, opts) {
  const car = new THREE.Group();
  const paint = liveryTexture(L, { ...opts, kind: 'endurance' });
  const acc = MAT.paint(L.accent), cf = MAT.carbon(), blk = MAT.rubber();
  const XF = 1.5, XR = -1.6, R = 0.355;
  // low central hull: splitter nose, sculpted sides, high tail
  car.add(mesh(hull([
    { x: -2.48, top: 0.86, bot: 0.12, belt: 0.5, w: 0.92, wt: 0.88, wb: 0.86, n: 4.5 },
    { x: -2.2, top: 0.88, bot: 0.08, belt: 0.48, w: 0.98, wt: 0.92, wb: 0.9, n: 4.5 },
    { x: -1.2, top: 0.68, bot: 0.07, belt: 0.4, w: 0.92, wt: 0.78, wb: 0.86, n: 4 },
    { x: -0.3, top: 0.56, bot: 0.07, belt: 0.34, w: 0.82, wt: 0.62, wb: 0.8, n: 3.6 },
    { x: 0.6, top: 0.5, bot: 0.07, belt: 0.3, w: 0.82, wt: 0.56, wb: 0.8, n: 3.6 },
    { x: 1.6, top: 0.42, bot: 0.08, belt: 0.26, w: 0.6, wt: 0.42, wb: 0.6, n: 3.4 },
    { x: 2.25, top: 0.3, bot: 0.09, belt: 0.2, w: 0.62, wt: 0.4, wb: 0.66, n: 3.2 },
    { x: 2.5, top: 0.2, bot: 0.1, belt: 0.15, w: 0.5, wt: 0.32, wb: 0.56, n: 3 },
  ], { u0: 0, u1: 1 }), paint));
  // tall front fenders standing proud of the bonnet, with louvres on top
  for (const z of [0.79, -0.79]) {
    const f = mesh(hull([
      { x: 0.55, top: 0.62, bot: 0.3, w: 0.13, wt: 0.1, wb: 0.12, n: 3 },
      { x: 1.05, top: 0.86, bot: 0.3, w: 0.21, wt: 0.17, wb: 0.2, n: 3.4 },
      { x: 1.65, top: 0.9, bot: 0.32, w: 0.22, wt: 0.18, wb: 0.21, n: 3.6 },
      { x: 2.2, top: 0.62, bot: 0.24, w: 0.2, wt: 0.14, wb: 0.2, n: 3.2 },
      { x: 2.45, top: 0.34, bot: 0.16, w: 0.16, wt: 0.1, wb: 0.16, n: 3 },
    ], { u0: 0.62, u1: 0.98, seg: 32, around: 28 }), paint);
    f.position.z = z; car.add(f);
    for (let k = 0; k < 6; k++) { const lv = mesh(new THREE.BoxGeometry(0.03, 0.01, 0.3), blk); lv.position.set(1.25 + k * 0.08, 0.905 - k * 0.004, z); car.add(lv); }
    const hl = mesh(new THREE.BoxGeometry(0.05, 0.035, 0.26), MAT.light('#f4fbff', 3)); hl.position.set(2.24, 0.56, z); hl.rotation.z = -0.5; car.add(hl);
    const mr = mesh(new THREE.BoxGeometry(0.1, 0.07, 0.16), MAT.paint(L.primary)); mr.position.set(0.85, 0.82, z * 0.86); car.add(mr);
  }
  // rear fenders / haunches
  for (const z of [0.77, -0.77]) {
    const f = mesh(hull([
      { x: -0.4, top: 0.6, bot: 0.3, w: 0.12, wt: 0.08, wb: 0.12, n: 3 },
      { x: -1.1, top: 0.92, bot: 0.3, w: 0.23, wt: 0.18, wb: 0.22, n: 3.6 },
      { x: -1.9, top: 0.95, bot: 0.3, w: 0.24, wt: 0.2, wb: 0.23, n: 3.8 },
      { x: -2.47, top: 0.9, bot: 0.3, w: 0.23, wt: 0.2, wb: 0.22, n: 4 },
    ], { u0: 0.04, u1: 0.4, seg: 30, around: 28 }), paint);
    f.position.z = z; car.add(f);
  }
  // teardrop cockpit: painted bubble with glass screen and side windows
  car.add(mesh(hull([
    { x: -1.6, top: 0.74, bot: 0.4, w: 0.22, wt: 0.12, n: 3 },
    { x: -0.9, top: 1.0, bot: 0.4, w: 0.44, wt: 0.3, n: 3 },
    { x: -0.25, top: 1.07, bot: 0.4, w: 0.5, wt: 0.36, n: 3 },
    { x: 0.35, top: 0.95, bot: 0.4, w: 0.48, wt: 0.3, n: 3 },
    { x: 0.95, top: 0.58, bot: 0.38, w: 0.36, wt: 0.2, n: 2.8 },
  ], { u0: 0.36, u1: 0.62, seg: 36, around: 32 }), paint));
  car.add(mesh(hull([
    { x: -0.45, top: 1.075, bot: 0.78, w: 0.49, wt: 0.36, wb: 0.5, n: 3 },
    { x: 0.35, top: 0.955, bot: 0.66, w: 0.485, wt: 0.3, wb: 0.49, n: 3 },
    { x: 0.97, top: 0.59, bot: 0.5, w: 0.37, wt: 0.2, wb: 0.37, n: 2.8 },
  ], { seg: 20, around: 32 }), MAT.glass()));
  // shark fin and full-width rear wing on swan necks
  car.add(plate([[-0.9, 1.0], [-2.2, 1.04], [-2.45, 0.92], [-1.4, 0.84]], 0.016, MAT.paint(L.primary)));
  car.add(sweptWing(spanSamples(0.98, 16, (u) => ({ x: -2.1, y: 1.0 + u * u * 0.02, c: 0.36, a: -0.12, t: 0.045 })), acc));
  for (const z of [0.99, -0.99]) car.add(decalPlate([[-2.0, 0.84], [-2.05, 1.08], [-2.5, 1.08], [-2.5, 0.84]], 0.016, endplateMat(L, opts.sponsor), z, z < 0));
  for (const z of [0.3, -0.3]) car.add(plate([[-1.95, 0.84], [-2.25, 1.02], [-2.35, 1.02], [-2.12, 0.84]], 0.02, cf, z));
  // light bar, splitter, diffuser
  const tl = mesh(new THREE.BoxGeometry(0.03, 0.03, 1.84), MAT.light('#ff1e1e', 3.5)); tl.position.set(-2.5, 0.78, 0); car.add(tl);
  car.add(plate([[2.62, -0.95], [2.0, -0.95], [2.0, 0.95], [2.62, 0.95]], 0.025, cf).rotateX(Math.PI / 2).translateZ(-0.07));
  const dif = mesh(new THREE.BoxGeometry(0.55, 0.02, 1.6), cf); dif.position.set(-2.3, 0.2, 0); dif.rotation.z = -0.35; car.add(dif);
  const wheels = [];
  for (const [x, z] of [[XF, 0.8], [XF, -0.8], [XR, 0.8], [XR, -0.8]]) { const wh = wheel(R, 0.31, opts.tyre, { kind: 'gt', rim: '#22252b', rimFrac: 0.7 }); wh.position.set(x, R, z); car.add(wh); wheels.push(wh); }
  car.userData.wheels = wheels;
  return car;
}

// greenhouse paint with dark tinted windows (u: rear->front, v: 0 right side, .25 top, .5 left)
function greenhouseMat(color, gt) {
  return cached('gh' + color + gt, () => {
    const W = 512, H = 256, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    g.fillStyle = color; g.fillRect(0, 0, W, H);
    const Y = (v) => H - v * H;
    const win = (u0, u1, v0, v1) => { const gr = g.createLinearGradient(0, Y(v1), 0, Y(v0)); gr.addColorStop(0, '#1b2430'); gr.addColorStop(0.5, '#0a0e14'); gr.addColorStop(1, '#141b24'); g.fillStyle = gr; g.beginPath(); if (g.roundRect) g.roundRect(u0 * W, Y(v1), (u1 - u0) * W, Y(v0) - Y(v1), 10); else g.rect(u0 * W, Y(v1), (u1 - u0) * W, Y(v0) - Y(v1)); g.fill(); };
    for (const [a, b] of [[0.015, 0.105], [0.395, 0.485]]) { win(0.12, 0.5, a, b); win(0.55, 0.84, a, b); }
    win(0.84, 0.995, 0.115, 0.385); win(0.005, 0.11, 0.115, 0.385);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    const m = new THREE.MeshPhysicalMaterial({ map: t, roughness: 0.3, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.04 }); m.userData.keepFar = true; return m;
  });
}

// ---------------- Rally1 hatchback (and GT coupé for endurance traffic) ----------------
function rally(L, opts) {
  const gt = !!opts.gt;
  const car = new THREE.Group();
  const paint = liveryTexture(L, { ...opts, kind: 'rally' });
  const acc = MAT.paint(L.accent), cf = MAT.carbon(), blk = MAT.rubber();
  const XF = gt ? 1.4 : 1.3, XR = gt ? -1.3 : -1.3, R = gt ? 0.34 : 0.33, TZ = 0.8;
  const lift = gt ? -0.08 : 0;
  // lower body (belt kept low so the livery covers the doors), bonnet sloping into a deep bumper
  car.add(mesh(hull([
    { x: -2.08, top: 0.9 + lift, bot: 0.3, belt: 0.36, w: 0.84, wt: 0.8, wb: 0.8, n: 5 },
    { x: -1.85, top: 0.98 + lift, bot: 0.24, belt: 0.32, w: 0.93, wt: 0.88, wb: 0.88, n: 5.5 },
    { x: -0.4, top: 0.98 + lift, bot: 0.22, belt: 0.3, w: 0.9, wt: 0.86, wb: 0.86, n: 6 },
    { x: 0.8, top: 0.96 + lift, bot: 0.22, belt: 0.3, w: 0.9, wt: 0.85, wb: 0.86, n: 6 },
    { x: 1.55, top: 0.86 + lift, bot: 0.21, belt: 0.3, w: 0.9, wt: 0.84, wb: 0.86, n: 5 },
    { x: 1.98, top: 0.72 + lift, bot: 0.2, belt: 0.3, w: 0.86, wt: 0.78, wb: 0.84, n: 4.5 },
    { x: 2.15, top: 0.56 + lift, bot: 0.22, belt: 0.3, w: 0.78, wt: 0.68, wb: 0.78, n: 4 },
  ], { u0: 0, u1: 1 }), paint));
  // greenhouse (glass) with tumblehome, painted roof panel and pillars
  const gh = gt ? [
    { x: -1.9, top: 0.98, bot: 0.86, belt: 0.89, w: 0.7, wt: 0.6, wb: 0.72, n: 4 }, { x: -1.3, top: 1.2, bot: 0.86, belt: 0.89, w: 0.72, wt: 0.58, wb: 0.76, n: 4.5 }, { x: -0.3, top: 1.24, bot: 0.86, belt: 0.89, w: 0.72, wt: 0.58, wb: 0.76, n: 4.5 }, { x: 0.45, top: 1.12, bot: 0.86, belt: 0.89, w: 0.7, wt: 0.54, wb: 0.76, n: 4 }, { x: 1.15, top: 0.9, bot: 0.84, belt: 0.87, w: 0.7, wt: 0.6, wb: 0.74, n: 4 },
  ] : [
    { x: -1.98, top: 1.08, bot: 0.92, belt: 0.95, w: 0.72, wt: 0.62, wb: 0.76, n: 4.5 }, { x: -1.75, top: 1.4, bot: 0.92, belt: 0.95, w: 0.74, wt: 0.6, wb: 0.8, n: 5 }, { x: -0.2, top: 1.45, bot: 0.92, belt: 0.95, w: 0.74, wt: 0.62, wb: 0.8, n: 5 }, { x: 0.5, top: 1.34, bot: 0.92, belt: 0.95, w: 0.72, wt: 0.58, wb: 0.8, n: 4.5 }, { x: 1.12, top: 0.98, bot: 0.9, belt: 0.93, w: 0.72, wt: 0.62, wb: 0.8, n: 4.5 },
  ];
  car.add(mesh(hull(gh, { seg: 30, around: 36 }), greenhouseMat(L.primary, gt)));
  for (const z of [1, -1]) {
    const mr = mesh(new THREE.BoxGeometry(0.12, 0.09, 0.14), MAT.paint(L.primary)); mr.position.set(0.85, 1.0 + lift, z * 0.96); car.add(mr);
  }
  // boxy flared arches with vents, side skirts
  const arch = (x, z) => {
    const s = new THREE.Shape(); const w = R + 0.16, h = R + 0.2;
    s.moveTo(-w - 0.12, 0.08); s.lineTo(-w, h * 0.85); s.quadraticCurveTo(0, h + 0.18, w, h * 0.85); s.lineTo(w + 0.16, 0.12); s.lineTo(w + 0.05, 0.12);
    s.absarc(0, 0, R + 0.06, 0, Math.PI, false); s.lineTo(-w - 0.12, 0.08);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.2, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2 });
    g.translate(0, R, -0.1);
    const m = mesh(g, paint); m.position.set(x, 0, z); car.add(m);
    for (let k = 0; k < 4; k++) { const v = mesh(new THREE.BoxGeometry(0.03, 0.015, 0.14), blk); v.position.set(x + (x > 0 ? -1 : 1) * (R + 0.08) + k * 0.05 * (x > 0 ? -1 : 1), R * 2 + 0.16, z - Math.sign(z) * 0.02); car.add(v); }
  };
  for (const x of [XF, XR]) for (const z of [0.86, -0.86]) arch(x, z);
  for (const z of [0.95, -0.95]) { const sk = mesh(new THREE.BoxGeometry(XF - XR - 0.9, 0.1, 0.08), cf); sk.position.set((XF + XR) / 2, 0.24, z); car.add(sk); }
  // aero: splitter, canards, huge rear wing on swan necks (Rally1) or GT wing
  car.add(plate([[2.3, -0.88], [1.9, -0.88], [1.9, 0.88], [2.3, 0.88]], 0.025, cf).rotateX(Math.PI / 2).translateZ(-0.16));
  for (const z of [0.78, -0.78]) { const cn = plate([[2.18, 0.42], [1.95, 0.4], [1.98, 0.46], [2.16, 0.48]], 0.01, cf, 0); cn.position.z = z; car.add(cn); }
  const wy = gt ? 1.2 : 1.6, wx = gt ? -2.1 : -1.98;
  car.add(sweptWing(spanSamples(gt ? 0.82 : 0.9, 14, () => ({ x: wx + 0.25, y: wy, c: 0.42, a: -0.1, t: 0.05 })), gt ? cf : acc));
  if (!gt) car.add(sweptWing(spanSamples(0.9, 14, () => ({ x: wx + 0.05, y: wy + 0.1, c: 0.2, a: -0.45, t: 0.03 })), acc));
  for (const z of [1, -1]) {
    const span = gt ? 0.82 : 0.9;
    car.add(gt ? plate([[wx + 0.3, wy - 0.18], [wx + 0.32, wy + 0.16], [wx - 0.22, wy + 0.2], [wx - 0.24, wy - 0.22]], 0.014, cf, z * (span + 0.01)) : decalPlate([[wx + 0.3, wy - 0.18], [wx + 0.32, wy + 0.16], [wx - 0.22, wy + 0.2], [wx - 0.24, wy - 0.22]], 0.014, endplateMat(L, opts.sponsor), z * (span + 0.01), z < 0));
    car.add(plate([[wx + 0.1, wy], [wx + 0.15, (gt ? 0.9 : 1.05) + lift], [wx - 0.05, (gt ? 0.9 : 1.05) + lift], [wx - 0.05, wy]], 0.025, cf, z * 0.42));
  }
  // lights, grille, exhaust
  for (const z of [0.6, -0.6]) { const hl = mesh(new THREE.BoxGeometry(0.06, 0.07, 0.3), MAT.light('#f6fbff', 2.4)); hl.position.set(2.0, 0.7 + lift, z); hl.rotation.y = Math.sign(z) * 0.35; hl.rotation.z = -0.3; car.add(hl); const tl = mesh(new THREE.BoxGeometry(0.04, 0.08, 0.28), MAT.light('#ff2020', 3)); tl.position.set(-2.07, 0.8 + lift, z * 1.05); car.add(tl); }
  const gr = mesh(new THREE.BoxGeometry(0.04, 0.2, 0.9), blk); gr.position.set(2.14, 0.38, 0); car.add(gr);
  for (const z of [0.58, -0.58]) { const intake = mesh(new THREE.BoxGeometry(0.04, 0.14, 0.26), blk); intake.position.set(2.1, 0.32, z); car.add(intake); }
  const ex = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.2, 14), MAT.chrome()); ex.rotation.z = Math.PI / 2; ex.position.set(-2.1, 0.3, gt ? 0 : -0.55); car.add(ex);
  if (!gt) {
    const scoop = mesh(hull([{ x: -0.6, top: 1.54, bot: 1.43, w: 0.14, n: 3 }, { x: 0.0, top: 1.56, bot: 1.43, w: 0.16, n: 3 }, { x: 0.15, top: 1.5, bot: 1.43, w: 0.12, n: 3 }], { seg: 10, around: 20 }), acc); car.add(scoop);
    const sm = mesh(new THREE.CircleGeometry(0.07, 16), blk); sm.position.set(0.151, 1.48, 0); sm.rotation.y = Math.PI / 2; car.add(sm);
    for (const [x, z] of [[XF - 0.5, 0.88], [XF - 0.5, -0.88], [XR - 0.5, 0.88], [XR - 0.5, -0.88]]) { const mf = mesh(new THREE.BoxGeometry(0.015, 0.34, 0.3), blk); mf.position.set(x, 0.2, z); car.add(mf); }
  }
  const wheels = [];
  for (const [x, z] of [[XF, TZ], [XF, -TZ], [XR, TZ], [XR, -TZ]]) { const wh = wheel(R, gt ? 0.3 : 0.24, gt ? '#ffd400' : '#9a9a9a', { kind: gt ? 'gt' : 'rally', rim: gt ? '#2a2d33' : '#eef0f2', rimFrac: gt ? 0.72 : 0.62, decal: gt }); wh.position.set(x, R, z); car.add(wh); wheels.push(wh); }
  car.userData.wheels = wheels;
  return car;
}

export function buildCar(category, livery, opts = {}) {
  const L = { primary: '#e10600', secondary: '#ffffff', accent: '#111111', pattern: 1, ...livery };
  const car = category === 'rally' ? rally(L, opts) : category === 'gt' ? rally(L, { ...opts, gt: true }) : category === 'endurance' ? endurance(L, opts) : formula(L, opts);
  if (category === 'junior') car.scale.setScalar(0.94);
  car.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  if (opts.merge !== false) mergeStatic(car);
  if (opts.lod && opts.merge !== false) buildFarLOD(car, opts);
  return car;
}

// ---------------- distance LOD ----------------
// Far cars (small on screen) draw with 2-4 calls instead of ~40: the livery body, lamps and
// greenhouse stay as they are; every other part (wings, carbon, wheels, helmet...) is folded
// into one vertex-coloured mesh with static, simplified wheels. setCarLOD() swaps the sets.
const FAR_MAT = () => cached('farMat', () => new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.12, clearcoat: 0.6, clearcoatRoughness: 0.1 }));
function colorOf(m) {
  if (m === MAT.carbon()) return new THREE.Color(0x1d1e22);
  if (m.map && !m.color) return new THREE.Color(0x555555);
  const c = m.color ? m.color.clone() : new THREE.Color(0x777777);
  if (m.map) c.multiplyScalar(0.35);
  return c;
}
function withColor(g, col) { const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; }
function buildFarLOD(car, opts) {
  car.updateMatrixWorld(true);
  const inv = car.matrixWorld.clone().invert(), rel = new THREE.Matrix4();
  const near = [], parts = [];
  for (const c of car.children) {
    if (!c.isMesh || c.userData.band || Array.isArray(c.material)) continue;
    const m = c.material;
    if (m.userData?.keepFar || (m.emissiveIntensity || 0) > 1) continue;
    near.push(c); parts.push(withColor(bakeGeometry(c.geometry, rel.multiplyMatrices(inv, c.matrixWorld)), colorOf(m)));
  }
  const tyre = new THREE.Color(0x151517);
  for (const w of car.userData.wheels || []) {
    near.push(w);
    const { rimR = 0.22, w: ww = 0.3 } = w.userData; const r = w.userData.r || rimR / 0.64;
    const t = new THREE.CylinderGeometry(r, r, ww, 18, 1, false).rotateX(Math.PI / 2);
    w.updateMatrixWorld(true);
    parts.push(withColor(bakeGeometry(t, rel.multiplyMatrices(inv, w.matrixWorld)), tyre));
    for (const s of [1, -1]) { const d = new THREE.CircleGeometry(rimR, 16); if (s < 0) d.rotateY(Math.PI); d.translate(0, 0, s * (ww / 2 + 0.004)); parts.push(withColor(bakeGeometry(d, rel.multiplyMatrices(inv, w.matrixWorld)), new THREE.Color(opts.farRim || 0x2a2d33))); }
  }
  for (const h of car.userData.helmetParts || []) { near.push(h); h.updateMatrixWorld(true); parts.push(withColor(bakeGeometry(new THREE.SphereGeometry(0.135, 10, 8), rel.multiplyMatrices(inv, h.matrixWorld)), new THREE.Color(opts.helmet || '#ffd400'))); break; }
  if (!parts.length) return;
  const g = mergeGeometries(parts, false); if (!g) return;
  g.computeBoundingSphere();
  const far = new THREE.Mesh(g, FAR_MAT()); far.castShadow = true; far.receiveShadow = true; far.visible = false; far.userData.far = true;
  car.add(far);
  car.userData.lod = { near, far: [far], level: 0 };
}
export function setCarLOD(car, far) {
  const l = car.userData.lod; if (!l || l.level === +far) return;
  l.level = +far;
  for (const o of l.near) o.visible = !far;
  for (const o of l.far) o.visible = far;
}

// ---------------- draw-call reduction ----------------
// A car is built from ~100 small meshes; static parts that share a material are baked into
// one mesh (car-local space). Kept separate: wheel groups (spin + steering), helmet parts
// (hidden in the cockpit view) and tyre sidewall decals (swapped by setTyreColor). Inside
// each wheel the rotating parts are merged per material within their spin group.
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
function mergeInto(root, meshes) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const groups = new Map();
  for (const m of meshes) {
    if (Array.isArray(m.material)) continue;
    const k = m.material.uuid + (m.castShadow ? 's' : '') + (m.receiveShadow ? 'r' : '') + m.renderOrder + (m.userData.band ? 'b' : '');
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(m);
  }
  const rel = new THREE.Matrix4();
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const merged = mergeGeometries(list.map((m) => bakeGeometry(m.geometry, rel.multiplyMatrices(inv, m.matrixWorld))), false);
    if (!merged) continue;
    merged.computeBoundingSphere();
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

export function setTyreColor(car, color) {
  for (const w of car.userData.wheels || []) w.traverse((o) => { if (o.userData?.band) o.material = sidewallMat(color); });
}
