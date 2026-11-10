// Wheels: tyre carcass with tread / sidewall maps (slick, intermediate, wet, gravel), branded
// sidewalls in the compound colour, and per-category rims (aero covers, forged multi-spoke,
// rally five-spoke) with brake discs and calipers. All metalwork of a wheel is one
// vertex-coloured mesh, shared between every wheel of the same type.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { cached, memo, canvas, canvasTex, rng, FONT, MAT, mesh } from './core.js';

function sidewallTex(color, brand = 'PIRELLO  P ZERO') {
  return cached('sw' + color + brand, () => {
    const S = 512, [c, g] = canvas(S, S);
    g.translate(S / 2, S / 2);
    g.strokeStyle = color; g.lineWidth = 15; g.beginPath(); g.arc(0, 0, S * 0.445, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.10)'; g.lineWidth = 1.5; for (const rr of [0.405, 0.35]) { g.beginPath(); g.arc(0, 0, S * rr, 0, Math.PI * 2); g.stroke(); }
    g.fillStyle = '#e4e4e4'; g.font = `bold 27px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const base of [0, Math.PI]) { const R = S * 0.378; let ang = base - (brand.length * 0.082) / 2; for (const ch of brand) { g.save(); g.rotate(ang + Math.PI / 2); g.translate(0, -R); g.fillText(ch, 0, 0); g.restore(); ang += 0.082; } }
    // compound marks between the names
    g.fillStyle = color; for (const base of [Math.PI / 2, -Math.PI / 2]) { g.save(); g.rotate(base); g.fillRect(-16, -S * 0.392, 32, 9); g.restore(); }
    return canvasTex(c);
  });
}
export function sidewallMat(color) { return cached('swm' + color, () => new THREE.MeshStandardMaterial({ map: sidewallTex(color), transparent: true, roughness: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 })); }

// Tyre rubber on the carcass UVs (u = around, repeated 4x; v across: 0 .. .25 sidewall,
// .25 .. .75 tread, .75 .. 1 sidewall): satin sidewalls with moulding rings, worn dusty tread
// with rubber streaks along the rolling direction (they make the rotation visible); grooves
// for intermediates / wets, blocks for gravel; matching roughness and bump maps.
// tread: 'slick' | 'inter' | 'wet' | 'rally'
export function tyreMat(tread) {
  return cached('tyre' + tread, () => {
    const TW = 512, TH = 256; const [cc, g] = canvas(TW, TH), [rc, gr] = canvas(TW, TH), [bc, gb] = canvas(TW, TH);
    const rnd = rng(7); const y0 = TH * 0.25, y1 = TH * 0.75;
    g.fillStyle = '#17171a'; g.fillRect(0, 0, TW, TH); gr.fillStyle = 'rgb(176,176,176)'; gr.fillRect(0, 0, TW, TH); gb.fillStyle = 'rgb(128,128,128)'; gb.fillRect(0, 0, TW, TH);
    // tread band, lighter and rougher, darker shoulders
    const tg = g.createLinearGradient(0, y0, 0, y1); tg.addColorStop(0, '#1b1b1d'); tg.addColorStop(0.12, '#2b2a2a'); tg.addColorStop(0.5, '#302f2e'); tg.addColorStop(0.88, '#2b2a2a'); tg.addColorStop(1, '#1b1b1d');
    g.fillStyle = tg; g.fillRect(0, y0, TW, y1 - y0); gr.fillStyle = 'rgb(238,238,238)'; gr.fillRect(0, y0, TW, y1 - y0);
    for (let i = 0; i < 1400; i++) {
      const y = y0 + rnd() * (y1 - y0), x = rnd() * TW, len = 8 + rnd() * 70, a = rnd();
      g.fillStyle = a > 0.5 ? `rgba(70,66,62,${0.08 + rnd() * 0.14})` : `rgba(6,6,7,${0.1 + rnd() * 0.16})`; g.fillRect(x, y, len, 1); if (x + len > TW) g.fillRect(x - TW, y, len, 1);
      gb.fillStyle = a > 0.5 ? 'rgba(140,140,140,0.4)' : 'rgba(116,116,116,0.4)'; gb.fillRect(x, y, len, 1);
    }
    // sidewall moulding rings and speckle
    for (const y of [TH * 0.06, TH * 0.11, TH * 0.2, TH * 0.8, TH * 0.89, TH * 0.94]) { gb.fillStyle = 'rgb(170,170,170)'; gb.fillRect(0, y, TW, 2); g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(0, y, TW, 2); }
    for (let i = 0; i < 500; i++) { const y = rnd() < 0.5 ? rnd() * y0 : y1 + rnd() * (TH - y1), x = rnd() * TW; gr.fillStyle = `rgba(120,120,120,${0.2 + rnd() * 0.2})`; gr.fillRect(x, y, 1 + rnd() * 3, 1 + rnd() * 2); }
    const cut = (draw) => { for (const [ctx, col] of [[g, 'rgb(7,7,8)'], [gb, 'rgb(12,12,12)'], [gr, 'rgb(255,255,255)']]) { ctx.fillStyle = col; ctx.strokeStyle = col; draw(ctx); } };
    const mid = (y0 + y1) / 2, th = y1 - y0;
    if (tread === 'slick') {
      // wear indicators: rows of small holes across the tread
      for (let k = 0; k < 4; k++) for (const f of [0.14, 0.38, 0.62, 0.86]) cut((ctx) => { ctx.beginPath(); ctx.arc((k + 0.5) * TW / 4, y0 + f * th, 2.2, 0, 7); ctx.fill(); });
    } else if (tread === 'rally') {
      // gravel blocks: staggered lateral grooves, two circumferential channels
      for (let k = 0; k < 16; k++) { const x = (k / 16) * TW, off = (k % 2) * 9; cut((ctx) => { ctx.fillRect(x + off, y0 - 8, 7, th * 0.36 + 8); ctx.fillRect(x + 12 - off, mid - th * 0.12, 7, th * 0.24); ctx.fillRect(x + off, y1 - th * 0.36, 7, th * 0.36 + 8); }); }
      cut((ctx) => { ctx.fillRect(0, y0 + th * 0.345, TW, 5); ctx.fillRect(0, y1 - th * 0.345 - 5, TW, 5); });
    } else {
      // rain tyres: chevron grooves draining outwards (+ channels on the full wet)
      const n = tread === 'wet' ? 14 : 9, lw = tread === 'wet' ? 6 : 4;
      for (let k = 0; k < n; k++) { const x = (k / n) * TW; cut((ctx) => { ctx.lineWidth = lw; for (const dx of [0, TW, -TW]) { ctx.beginPath(); ctx.moveTo(x + dx - 26, y0 - 4); ctx.lineTo(x + dx + 8, mid); ctx.lineTo(x + dx - 26, y1 + 4); ctx.stroke(); } }); }
      cut((ctx) => { if (tread === 'wet') { ctx.fillRect(0, y0 + th * 0.27, TW, 6); ctx.fillRect(0, y1 - th * 0.27 - 6, TW, 6); } ctx.fillRect(0, mid - 2.5, TW, 5); });
    }
    const tex = (c, srgb) => { const t = canvasTex(c, { srgb, repeat: true, aniso: 8 }); t.repeat.set(tread === 'rally' ? 5 : 4, 1); return t; };
    return new THREE.MeshStandardMaterial({ map: tex(cc, true), roughnessMap: tex(rc, false), bumpMap: tex(bc, false), bumpScale: tread === 'slick' ? 0.3 : 3, roughness: 1, metalness: 0 });
  });
}
// compound colour -> tread pattern (rain compounds are blue / green in the game data)
export function treadFor(color, base = 'slick') {
  if (base === 'rally') return 'rally';
  const c = String(color || '').toLowerCase();
  return c === '#1e90ff' ? 'wet' : c === '#28c840' ? 'inter' : 'slick';
}

function tyreGeo(r, w, rimR) {
  return memo('tyre', [r, w, rimR], () => {
    const sr = Math.min(w * 0.24, (r - rimR) * 0.55), tw = w / 2 - sr, bulge = Math.min(0.012, w * 0.035);
    const pts = [], vs = [];
    // inner bead -> sidewall (slight bulge) -> shoulder arc -> crowned tread -> mirror
    const half = [];
    half.push([rimR - 0.004, w / 2 - 0.03]); half.push([rimR + 0.004, w / 2 - 0.012]);
    for (let k = 1; k <= 4; k++) { const t = k / 5, rr = rimR + (r - sr - rimR) * t; half.push([rr, w / 2 - 0.006 + Math.sin(t * Math.PI) * bulge]); }
    const side = half.length;
    for (let k = 0; k <= 6; k++) { const a = (k / 6) * (Math.PI / 2); half.push([r - sr + Math.sin(a) * sr - (k === 6 ? 0 : 0), tw + Math.cos(a) * sr]); }
    const crown = 0.004;
    const first = half.map(([rr, z]) => [rr, -z]);
    first.forEach(([rr, z], i) => { pts.push(new THREE.Vector2(rr, z)); vs.push(i < side ? (i / side) * 0.2 : 0.2 + ((i - side) / 6) * 0.05); });
    for (const f of [-0.5, 0, 0.5]) { pts.push(new THREE.Vector2(r + crown * (1 - Math.abs(f) * 2), f * tw * 2 * 0.98)); vs.push(0.5 + f * 0.46); }
    half.slice().reverse().forEach(([rr, z], i) => { const j = half.length - 1 - i; pts.push(new THREE.Vector2(rr, z)); vs.push(1 - (j < side ? (j / side) * 0.2 : 0.2 + ((j - side) / 6) * 0.05)); });
    const g = new THREE.LatheGeometry(pts, 48); const uv = g.attributes.uv, n = pts.length;
    for (let i = 0; i < uv.count; i++) uv.setY(i, vs[i % n]);
    g.rotateX(Math.PI / 2); g.computeVertexNormals();
    // weld the lathe seam normals
    const N = g.attributes.normal; for (let j = 0; j < n; j++) { const a = j, b = 48 * n + j; const x = N.getX(a) + N.getX(b), y = N.getY(a) + N.getY(b), z = N.getZ(a) + N.getZ(b), l = Math.hypot(x, y, z) || 1; N.setXYZ(a, x / l, y / l, z / l); N.setXYZ(b, x / l, y / l, z / l); }
    return g;
  });
}

// 2022+ wheel cover: dished carbon disc with moulded aero vanes, team-colour ring and rim lip
function coverMat(base, ring) {
  return cached('cover' + base + ring, () => {
    const S = 256, [c, g] = canvas(S, S), R = S / 2;
    g.translate(R, R);
    const gr = g.createRadialGradient(0, 0, 4, 0, 0, R); gr.addColorStop(0, '#3a3d44'); gr.addColorStop(0.3, base); gr.addColorStop(0.95, base); gr.addColorStop(1, '#050506');
    g.fillStyle = gr; g.fillRect(-R, -R, S, S);
    for (let k = 0; k < 9; k++) { g.save(); g.rotate((k / 9) * Math.PI * 2); g.fillStyle = 'rgba(255,255,255,0.085)'; g.beginPath(); g.moveTo(R * 0.24, -3); g.quadraticCurveTo(R * 0.5, -R * 0.16, R * 0.76, -R * 0.07); g.lineTo(R * 0.76, 0); g.quadraticCurveTo(R * 0.5, -R * 0.07, R * 0.24, 3); g.fill(); g.fillStyle = 'rgba(0,0,0,0.5)'; g.beginPath(); g.ellipse(R * 0.6, R * 0.1, R * 0.07, R * 0.022, 0.25, 0, 7); g.fill(); g.restore(); }
    g.strokeStyle = ring; g.lineWidth = R * 0.07; g.beginPath(); g.arc(0, 0, R * 0.85, 0, 7); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = 1.5; g.beginPath(); g.arc(0, 0, R * 0.9, 0, 7); g.stroke();
    g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, R * 0.22, 0, 7); g.stroke();
    return new THREE.MeshPhysicalMaterial({ map: canvasTex(c), roughness: 0.35, metalness: 0.2, clearcoat: 0.8, clearcoatRoughness: 0.08 });
  });
}
// spoke blur disc: the spokes averaged around the wheel (rim colour at partial coverage over the
// dark barrel), chrome hub and the bright rim lip; translucent so the brake glow shows through
function blurMat(rim, kind) {
  return cached('blur' + rim + kind, () => {
    const S = 128, R = S / 2, [c, g] = canvas(S, S);
    const col = new THREE.Color(rim), hex = (k) => `rgb(${Math.round(col.r * 255 * k)},${Math.round(col.g * 255 * k)},${Math.round(col.b * 255 * k)})`;
    const cov = kind === 'rally' ? 0.5 : 0.42, rnd = rng(3);
    const gr = g.createRadialGradient(R, R, 0, R, R, R);
    gr.addColorStop(0, '#d8dadf'); gr.addColorStop(0.18, '#9a9ca2'); gr.addColorStop(0.24, hex(0.95)); gr.addColorStop(0.6, hex(0.6 + cov * 0.4)); gr.addColorStop(0.86, hex(0.75)); gr.addColorStop(0.9, hex(1.05)); gr.addColorStop(0.97, hex(0.9)); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    for (let k = 0; k < 22; k++) { const r = R * (0.25 + rnd() * 0.62); g.strokeStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '0,0,0'},${0.05 + rnd() * 0.08})`; g.lineWidth = 1 + rnd() * 2; g.beginPath(); g.arc(R, R, r, 0, 7); g.stroke(); }
    return new THREE.MeshStandardMaterial({ map: canvasTex(c), transparent: true, opacity: 0.86, depthWrite: false, roughness: 0.35, metalness: 0.6, polygonOffset: true, polygonOffsetFactor: -1 });
  });
}
const metalMat = () => cached('wheelMetal', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.78, side: THREE.DoubleSide }));

// ---- rim hardware, one vertex-coloured geometry ----
const RIMS = {
  // n spokes, hub radius, spoke widths at hub / rim (fractions of rimR), twin = paired spokes
  gt: { n: 10, hub: 0.2, a: 0.085, b: 0.05, twin: false, nut: true },
  hyper: { n: 7, hub: 0.2, a: 0.07, b: 0.045, twin: true, nut: true },
  jr: { n: 6, hub: 0.2, a: 0.075, b: 0.05, twin: true, nut: true },
  rally: { n: 5, hub: 0.26, a: 0.1, b: 0.085, twin: true, nut: false },
};
function hardwareGeo(kind, rimR, w, rimHex) {
  return memo('whw', [kind, rimR, w, rimHex], () => {
    const parts = []; const M = new THREE.Matrix4();
    const add = (g, col, m) => { const q = g.index ? g.toNonIndexed() : g.clone(); if (m) q.applyMatrix4(m); for (const k of Object.keys(q.attributes)) if (k !== 'position' && k !== 'normal') q.deleteAttribute(k); if (!q.attributes.normal) q.computeVertexNormals(); const c = new THREE.Color(col), n = q.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } q.setAttribute('color', new THREE.BufferAttribute(a, 3)); parts.push(q); };
    const rz = new THREE.Matrix4().makeRotationX(Math.PI / 2);
    const lat = (pts, seg = 36) => new THREE.LatheGeometry(pts.map(([r, z]) => new THREE.Vector2(r, z)), seg).applyMatrix4(rz);
    const face = w * 0.36, rimC = new THREE.Color(rimHex), lipC = rimC.clone().lerp(new THREE.Color(0xe8eaee), 0.35), darkC = rimC.clone().multiplyScalar(0.45);
    // barrel with outer flange and polished lip; plain dark inner side
    add(lat([[rimR * 0.96, -w * 0.47], [rimR * 1.0, -w * 0.47], [rimR * 0.985, -w * 0.3], [rimR * 0.985, w * 0.38], [rimR * 1.015, w * 0.455], [rimR * 1.03, w * 0.485], [rimR * 1.0, w * 0.5], [rimR * 0.955, w * 0.47], [rimR * 0.935, face + 0.01]]), kind === 'f1' ? 0x1a1b1e : '#' + darkC.getHexString());
    add(lat([[rimR * 1.03, w * 0.485], [rimR * 1.0, w * 0.5], [rimR * 0.965, w * 0.478]], 36), kind === 'f1' ? 0x2a2c31 : '#' + lipC.getHexString());
    add(new THREE.CircleGeometry(rimR * 0.97, 24), 0x08080a, new THREE.Matrix4().makeRotationY(Math.PI).setPosition(0, 0, -w * 0.3));
    if (kind === 'f1') {
      // brake drum / duct seen from inboard, wheel nut on the cover
      add(lat([[rimR * 0.5, -w * 0.3], [rimR * 0.86, -w * 0.3], [rimR * 0.9, -w * 0.46], [rimR * 0.5, -w * 0.5]], 24), 0x121315);
      add(new THREE.CylinderGeometry(rimR * 0.13, rimR * 0.16, 0.05, 6).applyMatrix4(rz), 0xc9ccd2, M.makeTranslation(0, 0, face + 0.04));
      add(new THREE.CylinderGeometry(rimR * 0.2, rimR * 0.22, 0.02, 20).applyMatrix4(rz), 0x2a2c30, M.makeTranslation(0, 0, face + 0.022));
    } else {
      const S = RIMS[kind] || RIMS.gt, dish = Math.max(0.004, w * 0.1 - 0.012);
      add(new THREE.CircleGeometry(rimR * 0.97, 24), 0x060607, M.makeTranslation(0, 0, face - 0.085));
      // vented disc with a darker swept band, alloy bell
      add(lat([[rimR * 0.34, face - 0.055], [rimR * 0.82, face - 0.055], [rimR * 0.82, face - 0.03], [rimR * 0.34, face - 0.03]], 32), 0x6a6c70);
      add(new THREE.RingGeometry(rimR * 0.42, rimR * 0.78, 32), 0x3c3d41, M.makeTranslation(0, 0, face - 0.0295));
      add(new THREE.CylinderGeometry(rimR * 0.3, rimR * 0.34, 0.05, 20).applyMatrix4(rz), 0x1a1b1e, M.makeTranslation(0, 0, face - 0.02));
      // spokes: tapered blades rising from the hub to the rim (concave face)
      const r0 = rimR * S.hub * 0.8, r1 = rimR * 0.955;
      const sh = new THREE.Shape(); sh.moveTo(r0, -rimR * S.a / 2); sh.lineTo(r1, -rimR * S.b / 2); sh.lineTo(r1, rimR * S.b / 2); sh.lineTo(r0, rimR * S.a / 2); sh.closePath();
      const sg = new THREE.ExtrudeGeometry(sh, { depth: 0.022, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 1, steps: 1 });
      const P = sg.attributes.position; for (let i = 0; i < P.count; i++) P.setZ(i, P.getZ(i) + face + 0.008 + (Math.max(0, P.getX(i) - r0) / (r1 - r0)) ** 1.5 * dish);
      sg.computeVertexNormals();
      for (let k = 0; k < S.n; k++) {
        const ang = (k / S.n) * Math.PI * 2;
        if (S.twin) for (const d of [-1, 1]) add(sg, rimHex, new THREE.Matrix4().makeRotationZ(ang + d * 0.085).multiply(new THREE.Matrix4().makeRotationZ(d * 0.07)));
        else add(sg, rimHex, new THREE.Matrix4().makeRotationZ(ang));
      }
      add(new THREE.CylinderGeometry(rimR * S.hub, rimR * (S.hub + 0.03), 0.05, 24).applyMatrix4(rz), rimHex, M.makeTranslation(0, 0, face + 0.02));
      if (S.nut) { add(new THREE.CylinderGeometry(rimR * 0.1, rimR * 0.13, 0.05, 6).applyMatrix4(rz), 0xd0d3d8, M.makeTranslation(0, 0, face + 0.055)); add(new THREE.CylinderGeometry(rimR * 0.05, rimR * 0.05, 0.07, 10).applyMatrix4(rz), 0x16171a, M.makeTranslation(0, 0, face + 0.05)); }
      else for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2 + 0.3; add(new THREE.CylinderGeometry(rimR * 0.035, rimR * 0.035, 0.03, 6).applyMatrix4(rz), 0x9a9da3, M.makeTranslation(Math.cos(a) * rimR * 0.15, Math.sin(a) * rimR * 0.15, face + 0.045)); }
    }
    const g = mergeGeometries(parts, false); for (const p of parts) p.dispose();
    return g;
  });
}

// kind: 'f1' (wheel covers), 'gt', 'hyper', 'jr' (forged centre-lock), 'rally' (white five twin-spoke)
// side: +1 / -1 = which way the wheel face looks (the sign of the wheel's z on the car)
export function wheel(r, w, tyreColor, { rim = '#1c1f24', kind = 'gt', rimFrac = 0.66, cover = null, decal = true, side = 1, tread = 'slick', caliper = '#c8102e' } = {}) {
  const grp = new THREE.Group(); const spin = new THREE.Group(); grp.add(spin);
  const rimR = r * rimFrac, flip = side < 0;
  const tm = mesh(tyreGeo(r, w, rimR), tyreMat(treadFor(tyreColor, tread))); tm.userData.tyre = tread; spin.add(tm);
  // sidewall branding with the compound colour (planar UV on a ring)
  if (decal) for (const sgn of [1, -1]) {
    const g = memo('swr', [rimR, r, w], () => { const d = new THREE.RingGeometry(rimR * 1.02, r * 0.975, 48, 1); const uv = d.attributes.uv, P = d.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.5 + P.getX(i) / (2 * r / 0.92), 0.5 + P.getY(i) / (2 * r / 0.92)); return d; });
    const d = new THREE.Mesh(g, sidewallMat(tyreColor || '#ffd400'));
    d.position.z = sgn * (w / 2 + 0.008); if (sgn < 0) d.rotation.y = Math.PI; d.userData.band = true; spin.add(d);
  }
  const hw = mesh(hardwareGeo(kind, +rimR.toFixed(4), w, rim), metalMat()); if (flip) hw.rotation.y = Math.PI; spin.add(hw);
  if (kind === 'f1') {
    const cg = memo('cover', [rimR, w], () => { const g = new THREE.LatheGeometry([new THREE.Vector2(0.001, w * 0.36 + 0.02), new THREE.Vector2(rimR * 0.5, w * 0.36 + 0.016), new THREE.Vector2(rimR * 0.96, w * 0.36 + 0.004)], 40); g.rotateX(Math.PI / 2); const P = g.attributes.position, uv = g.attributes.uv; for (let i = 0; i < P.count; i++) uv.setXY(i, 0.5 + P.getX(i) / (2 * rimR * 0.96), 0.5 + P.getY(i) / (2 * rimR * 0.96)); g.computeVertexNormals(); return g; });
    const cv = mesh(cg, coverMat(cover || '#16181c', rim)); cv.material.side = THREE.DoubleSide; if (flip) cv.rotation.y = Math.PI; spin.add(cv);
  } else {
    // caliper: static, hugging the disc at the rear of the wheel
    const cal = mesh(memo('caliper', [rimR], () => { const sh = new THREE.Shape(); sh.absarc(0, 0, rimR * 0.9, -0.5, 0.5, false); sh.absarc(0, 0, rimR * 0.56, 0.5, -0.5, true); sh.closePath(); const g = new THREE.ExtrudeGeometry(sh, { depth: 0.07, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 1, curveSegments: 8 }); g.translate(0, 0, -0.035); return g; }), MAT.paint(caliper));
    cal.position.z = (flip ? -1 : 1) * (w * 0.36 - 0.045); cal.rotation.z = 2.6; grp.add(cal);
  }
  // motion blur: at speed the spokes smear into a translucent disc (shown by the race view)
  const blur = [];
  if (kind !== 'f1') {
    const b = new THREE.Mesh(memo('blurDisc', [rimR], () => new THREE.CircleGeometry(rimR * 0.96, 32)), blurMat(rim, kind)); b.position.z = (flip ? -1 : 1) * (w * 0.36 + 0.035); if (flip) b.rotation.y = Math.PI;
    b.visible = false; b.renderOrder = 1; b.userData.blur = true; grp.add(b); blur.push(b);
  }
  grp.userData.blur = blur;
  grp.userData.spin = [spin]; grp.userData.spinAxis = 'z';
  grp.userData.rimR = rimR; grp.userData.w = w; grp.userData.kind = kind; grp.userData.r = r; grp.userData.tread = tread;
  return grp;
}
