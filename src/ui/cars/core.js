// Shared toolkit for the procedural race cars: cached materials / textures and the geometry
// builders (lofted hulls with wheel-arch cut-outs, swept wings, plates, rods...).
// Car space: +x = forward, y = up, z = across (the right-hand side of the car is +z).
import * as THREE from 'three';

// ---------------- caches ----------------
export const cache = new Map();
export function cached(key, make) { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); }
// geometry cache: every primitive goes through here, so cars of the same class share their
// buffers (and the merged meshes built from them can be cached by signature)
const geoCache = new Map();
export function memo(name, args, make) {
  const k = name + JSON.stringify(args);
  let g = geoCache.get(k);
  if (!g) { g = make(); g.userData.memo = true; geoCache.set(k, g); }
  return g;
}

export function luma(hex) { const n = parseInt((hex || '#000').slice(1), 16); return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; }
export function hashStr(t) { let h = 2166136261; for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619); return h >>> 0; }
export function rng(seed) { let s = (seed % 2147483646) + 1; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; }
// CPU-backed 2D canvases (willReadFrequently): with GPU-accelerated canvases the first readback
// (getImageData, texture upload) flushes the whole GPU canvas pipeline - many seconds in software GL
export function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d', { willReadFrequently: true })]; }
export function canvasTex(c, { srgb = true, repeat = false, aniso = 4 } = {}) {
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso; return t;
}
export const FONT = '"Exo 2", "Titillium Web", Arial, sans-serif';

// ---------------- textures ----------------
// 2x2 twill weave: each tow is a soft-shaded strip, alternating direction. 'col' = albedo,
// 'nrm' = tangent-space normal map of the same weave (the clear coat catches it at grazing angles)
function carbonTex(kind = 'col') {
  return cached('carbonTex' + kind, () => {
    const S = 128, T = 16, [c, g] = canvas(S, S), nrm = kind === 'nrm';
    for (let y = 0; y < S / T; y++) for (let x = 0; x < S / T; x++) {
      const horiz = ((x + y) >> 1) % 2 === 0;
      const gr = horiz ? g.createLinearGradient(0, y * T, 0, y * T + T) : g.createLinearGradient(x * T, 0, x * T + T, 0);
      const lo = nrm ? 40 : 14, hi = nrm ? 230 : 44;
      gr.addColorStop(0, `rgb(${lo},${lo},${lo + 2})`); gr.addColorStop(0.5, `rgb(${hi},${hi},${hi + 3})`); gr.addColorStop(1, `rgb(${lo},${lo},${lo + 2})`);
      g.fillStyle = gr; g.fillRect(x * T, y * T, T, T);
      if (!nrm) { g.fillStyle = 'rgba(0,0,0,0.25)'; for (let k = 2; k < T; k += 4) horiz ? g.fillRect(x * T, y * T + k, T, 1) : g.fillRect(x * T + k, y * T, 1, T); }
    }
    if (nrm) { // height -> normals (central differences, wrapping)
      const h = g.getImageData(0, 0, S, S).data, out = g.createImageData(S, S), H = (x, y) => h[(((y + S) % S) * S + ((x + S) % S)) * 4] / 255;
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const dx = (H(x + 1, y) - H(x - 1, y)) * 1.6, dy = (H(x, y + 1) - H(x, y - 1)) * 1.6, l = Math.hypot(dx, dy, 1), i = (y * S + x) * 4; out.data[i] = 128 - (dx / l) * 127; out.data[i + 1] = 128 + (dy / l) * 127; out.data[i + 2] = 128 + 127 / l; out.data[i + 3] = 255; }
      g.putImageData(out, 0, 0);
    }
    const t = canvasTex(c, { srgb: !nrm, repeat: true }); t.repeat.set(10, 10); return t;
  });
}
// metallic-flake normal noise under the clear coat (the coat itself stays mirror-smooth)
export function flakeTex() {
  return cached('flake', () => {
    const S = 128, [c, g] = canvas(S, S); const im = g.createImageData(S, S); const rnd = rng(11);
    for (let i = 0; i < S * S; i++) { const x = rnd() * 2 - 1, y = rnd() * 2 - 1; im.data[i * 4] = 128 + x * 110; im.data[i * 4 + 1] = 128 + y * 110; im.data[i * 4 + 2] = 255; im.data[i * 4 + 3] = 255; }
    g.putImageData(im, 0, 0);
    const t = canvasTex(c, { srgb: false, repeat: true }); t.repeat.set(36, 22); return t;
  });
}
export function whiteTex() { return cached('white', () => { const t = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t; }); }
// paint finishes: gloss clear coat (default), satin, matte wrap
export const FINISH = {
  gloss: { roughness: 0.28, metalness: 0.14, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.25, specularIntensity: 0.8, fl: 0.025 },
  satin: { roughness: 0.42, metalness: 0.2, clearcoat: 0.55, clearcoatRoughness: 0.3, envMapIntensity: 1.0, specularIntensity: 0.6, fl: 0.012 },
  matte: { roughness: 0.62, metalness: 0.08, clearcoat: 0.16, clearcoatRoughness: 0.6, envMapIntensity: 0.8, specularIntensity: 0.45, fl: 0.0 },
};
// team livery finish: L.finish if given, else picked from the colours (most teams gloss)
export function finishOf(L) { if (L && FINISH[L.finish]) return L.finish; const h = hashStr(String(L?.primary) + L?.secondary + L?.accent) % 10; return h === 0 ? 'matte' : h < 3 ? 'satin' : 'gloss'; }
const PAINT = FINISH.gloss;
export function paintProps(finish = 'gloss') { const { fl, ...f } = FINISH[finish] || PAINT; return { ...f, normalMap: flakeTex(), normalScale: new THREE.Vector2(fl, fl) }; }

// Every lacquered surface of a car (livery, paint, decals, carbon, glass, visor, wheel covers,
// exhaust tips) is ONE shader program: physical + map + normal map + clear coat + dirt layer.
// Software GL needs ~1 s to link each program, so fewer variants = much faster first frames.
// Dirt that builds up during a race / stage: dust and mud kicked up by the wheels, heaviest on
// the sills, behind the wheels and on the tail, broken up by noise; it dulls the clear coat.
// Driven per material by userData.dirtU (0..1) and userData.dirtCol (the race view sets them).
export function dirtPatch(m) {
  const U = { value: 0 }, C = { value: new THREE.Color(0.42, 0.33, 0.22) };
  m.userData.dirtU = U; m.userData.dirtCol = C;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uDirt = U; sh.uniforms.uDirtCol = C;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vDirtP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvDirtP = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      uniform float uDirt; uniform vec3 uDirtCol; varying vec3 vDirtP;
      float dHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float dNoise(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(dHash(i), dHash(i + vec3(1, 0, 0)), f.x), mix(dHash(i + vec3(0, 1, 0)), dHash(i + vec3(1, 1, 0)), f.x), f.y),
                   mix(mix(dHash(i + vec3(0, 0, 1)), dHash(i + vec3(1, 0, 1)), f.x), mix(dHash(i + vec3(0, 1, 1)), dHash(i + vec3(1, 1, 1)), f.x), f.y), f.z); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        float dMask = 0.0;
        if (uDirt > 0.001) {
          float dN = dNoise(vDirtP * vec3(2.3, 5.5, 2.3)) * 0.55 + dNoise(vDirtP * vec3(11.0, 17.0, 11.0)) * 0.3 + dNoise(vDirtP * vec3(37.0, 41.0, 37.0)) * 0.15;
          float dLow = 1.0 - smoothstep(0.16, 0.95, vDirtP.y);
          float dRear = smoothstep(-0.9, -2.3, vDirtP.x) * 0.75;
          float dAmt = uDirt * (dLow * 1.2 + dRear + 0.22);
          dMask = clamp(smoothstep(0.0, 0.3, dAmt - (1.0 - dN) * 0.85), 0.0, 0.94);
          diffuseColor.rgb = mix(diffuseColor.rgb, uDirtCol * (0.7 + 0.6 * dN), dMask);
        }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.9, dMask);')
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n#ifdef USE_CLEARCOAT\nmaterial.clearcoat *= 1.0 - dMask;\n#endif');
  };
  m.customProgramCacheKey = () => 'livdirt';
  return m;
}
// coat({...}): the shared lacquer material (map / normal map default to white / flat flake)
export function coat(o = {}) {
  const p = { ...PAINT, ...o }; delete p.fl;
  if (!p.map) p.map = whiteTex();
  if (!p.normalMap) { p.normalMap = flakeTex(); p.normalScale = p.normalScale || new THREE.Vector2(0, 0); }
  if (!(p.clearcoat > 0)) p.clearcoat = 0.05;
  return dirtPatch(new THREE.MeshPhysicalMaterial(p));
}

const CF = (rep, o) => { const t = carbonTex().clone(), n = carbonTex('nrm').clone(); t.repeat.set(rep, rep); n.repeat.set(rep, rep); t.needsUpdate = n.needsUpdate = true; const m = coat({ map: t, normalMap: n, ...o }); m.userData.farColor = 0x1d1e22; return m; };
export const MAT = {
  carbon: () => cached('carbon', () => CF(10, { color: 0x6a6d74, normalScale: new THREE.Vector2(0.35, 0.35), roughness: 0.5, metalness: 0.1, clearcoat: 0.45, clearcoatRoughness: 0.14, envMapIntensity: 0.55, specularIntensity: 0.6 })),
  // gloss carbon for wings and aero surfaces: tighter weave, deeper coat
  carbonGloss: () => cached('carbonG', () => CF(18, { color: 0x8a8d94, normalScale: new THREE.Vector2(0.2, 0.2), roughness: 0.34, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 0.9 })),
  rubber: () => cached('rubber', () => new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.92, metalness: 0 })),
  // matt black: inlets, wheel wells, grilles
  dark: () => cached('dark', () => new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 1, metalness: 0, envMapIntensity: 0.15 })),
  rim: (c = '#2c3038') => cached('rim' + c, () => new THREE.MeshStandardMaterial({ color: c, roughness: 0.22, metalness: 0.95 })),
  metal: (c = '#8d9097', rough = 0.35) => cached('metal' + c + rough, () => new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: 1 })),
  // exhaust tips: titanium with a heat tint (straw -> violet -> blue) toward the outlet (v = 1)
  exhaust: () => cached('exhaust', () => { const [c, g] = canvas(4, 64); const gr = g.createLinearGradient(0, 64, 0, 0); gr.addColorStop(0, '#8d8f94'); gr.addColorStop(0.4, '#a08a5c'); gr.addColorStop(0.62, '#6a4a7a'); gr.addColorStop(0.82, '#2f4a8a'); gr.addColorStop(1, '#3a2c48'); g.fillStyle = gr; g.fillRect(0, 0, 4, 64); const m = coat({ map: canvasTex(c), roughness: 0.3, metalness: 0.9, clearcoat: 0.3, clearcoatRoughness: 0.2, envMapIntensity: 1.1 }); m.userData.farColor = 0x6a625a; return m; }),
  glass: () => cached('glass', () => coat({ color: 0x06090d, roughness: 0.03, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.01, envMapIntensity: 1.7, specularIntensity: 1 })),
  mirror: () => cached('mirror', () => new THREE.MeshStandardMaterial({ color: 0xb8c6d2, metalness: 1, roughness: 0.04 })),
  // visor: smoked shield with a faint iridescent tint baked in the map (fresnel from the coat)
  visor: () => cached('visor', () => { const [c, g] = canvas(64, 64); const gr = g.createLinearGradient(0, 0, 64, 64); gr.addColorStop(0, '#2a1650'); gr.addColorStop(0.35, '#0c2236'); gr.addColorStop(0.65, '#2e1c0a'); gr.addColorStop(1, '#0a2a2a'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const m = coat({ map: canvasTex(c), color: 0x5a5a5a, roughness: 0.05, metalness: 0.75, clearcoat: 1, clearcoatRoughness: 0.0, envMapIntensity: 1.7, specularIntensity: 1 }); m.userData.farColor = 0x0a0c10; return m; }),
  chrome: () => cached('chrome', () => new THREE.MeshStandardMaterial({ color: 0xdadde2, roughness: 0.12, metalness: 1 })),
  light: (c = '#fff6d8', ei = 2.2) => cached('light' + c + ei, () => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: ei, roughness: 0.2 })),
  paint: (hex, finish = 'gloss') => cached('p' + hex + finish, () => coat({ color: hex, ...paintProps(finish) })),
  // satin plastic / fabric (mud flaps, seat, gloves)
  matte: (hex) => cached('mt' + hex, () => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.75, metalness: 0 })),
  // printed decal on a painted part (wing end plates, fins): texture + same clear coat as the paint
  decal: (key, draw, w = 512, h = 256, flip = false, finish = 'gloss') => cached('d' + key + flip + finish, () => {
    const [c, g] = canvas(w, h); draw(g, w, h);
    const t = canvasTex(c, { aniso: 8 });
    if (flip) { t.wrapS = THREE.RepeatWrapping; t.repeat.x = -1; }
    return coat({ map: t, ...paintProps(finish) });
  }),
  band: (hex) => cached('b' + hex, () => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.55, metalness: 0, emissive: hex, emissiveIntensity: 0.08 })),
};

// ---------------- mesh helpers ----------------
export function mesh(g, m) { const o = new THREE.Mesh(g, m); o.castShadow = true; o.receiveShadow = true; return o; }
// far(o): the part also shows in the distance LOD (optionally with a cheaper geometry)
export function far(o, geo) { o.userData.far = geo || true; return o; }
export function at(o, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) { o.position.set(x, y, z); if (rx || ry || rz) o.rotation.set(rx, ry, rz); return o; }
export function box(w, h, d, m, x = 0, y = 0, z = 0) { const o = mesh(memo('box', 0, () => new THREE.BoxGeometry(1, 1, 1)), m); o.scale.set(w, h, d); o.position.set(x, y, z); return o; }
// cylinder along z (axle direction) by default; axis 'x' or 'y' to turn it
export function cyl(r0, r1, len, m, { seg = 16, axis = 'z', open = false } = {}) {
  const o = mesh(memo('cyl', [r0 === r1 ? 1 : r0 / r1, seg, open], () => new THREE.CylinderGeometry(r0 === r1 ? 1 : r0 / r1, 1, 1, seg, 1, open)), m);
  o.scale.set(r1, len, r1); if (axis === 'z') o.rotation.x = Math.PI / 2; else if (axis === 'x') o.rotation.z = -Math.PI / 2; return o;
}
export function sph(r, m, { ws = 16, hs = 12, sx = 1, sy = 1, sz = 1 } = {}) { const o = mesh(memo('sph', [ws, hs], () => new THREE.SphereGeometry(1, ws, hs)), m); o.scale.set(r * sx, r * sy, r * sz); return o; }
const _va = new THREE.Vector3(), _vb = new THREE.Vector3(), _vx = new THREE.Vector3(), _vy = new THREE.Vector3(), _vz = new THREE.Vector3(), _m4 = new THREE.Matrix4();
export function rod(a, b, r, m, seg = 6) {
  _va.set(...a); _vb.set(...b);
  const len = _va.distanceTo(_vb);
  const o = mesh(memo('rod', seg, () => new THREE.CylinderGeometry(1, 1, 1, seg)), m);
  o.scale.set(r, len, r);
  o.position.copy(_va).add(_vb).multiplyScalar(0.5);
  o.quaternion.setFromUnitVectors(_vy.set(0, 1, 0), _vx.copy(_vb).sub(_va).normalize());
  return o;
}
// aero-profiled arm (wishbones, stays): flat blade from a to b, chord along the car's x axis
export function blade(a, b, chord, thick, m) {
  _va.set(...a); _vb.set(...b);
  const len = _va.distanceTo(_vb);
  const o = mesh(memo('blade', 0, () => new THREE.CylinderGeometry(1, 1, 1, 10)), m);
  _vy.copy(_vb).sub(_va).normalize();
  _vx.set(1, 0, 0).addScaledVector(_vy, -_vy.x); if (_vx.lengthSq() < 1e-4) _vx.set(0, 0, 1).addScaledVector(_vy, -_vy.z); _vx.normalize();
  _vz.crossVectors(_vx, _vy);
  o.quaternion.setFromRotationMatrix(_m4.makeBasis(_vx, _vy, _vz));
  o.scale.set(chord / 2, len, thick / 2);
  o.position.copy(_va).add(_vb).multiplyScalar(0.5);
  return o;
}
export function tube(points, r, m, { seg = 32, rad = 8, closed = false } = {}) {
  return mesh(memo('tube', [points, r, seg, rad, closed], () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), closed), seg, r, rad, closed)), m);
}
// flat plate from an outline in the x/y plane, extruded across z (centred on z)
export function plate(points, thickness, m, z = 0, bevel = 0.008) {
  const g = memo('pl', [points, thickness, z, bevel], () => {
    const s = new THREE.Shape(); points.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y))); s.closePath();
    const g2 = new THREE.ExtrudeGeometry(s, { depth: thickness, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: Math.min(bevel, thickness * 0.45), bevelSegments: 1 });
    g2.translate(0, 0, -thickness / 2 + z); return g2;
  });
  return mesh(g, m);
}
// horizontal plate from a top-view outline [[x, z], ...] at height y
export function slab(points, thickness, m, y = 0, bevel = 0.006) {
  const g = memo('slab', [points, thickness, y, bevel], () => {
    const s = new THREE.Shape(); points.forEach(([x, z], i) => (i ? s.lineTo(x, z) : s.moveTo(x, z))); s.closePath();
    const g2 = new THREE.ExtrudeGeometry(s, { depth: thickness, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: Math.min(bevel, thickness * 0.45), bevelSegments: 1 });
    g2.rotateX(Math.PI / 2); g2.translate(0, y + thickness / 2, 0); return g2;
  });
  return mesh(g, m);
}
// flat plate whose faces carry a planar 0..1 UV over its outline (for printed decals);
// mirror = true flips u so the decal reads correctly on the -z (left-hand) side of the car
export function decalPlate(points, thickness, m, z = 0, mirror = false) {
  const g = memo('dp', [points, thickness, z, mirror], () => {
    const s = new THREE.Shape(); points.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y))); s.closePath();
    const g2 = new THREE.ExtrudeGeometry(s, { depth: thickness, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.004, bevelSegments: 1 });
    g2.translate(0, 0, -thickness / 2 + z);
    const P = g2.attributes.position, uv = g2.attributes.uv, N = g2.attributes.normal, out = mirror ? -1 : 1;
    g2.computeBoundingBox(); const { min, max } = g2.boundingBox;
    // the inner face (seen from the other side of the plate) gets its u flipped too, so the
    // artwork reads the right way round from both sides instead of mirrored
    for (let i = 0; i < P.count; i++) { const u = (P.getX(i) - min.x) / (max.x - min.x || 1), inner = N.getZ(i) * out < -0.5; uv.setXY(i, mirror !== inner ? 1 - u : u, (P.getY(i) - min.y) / (max.y - min.y || 1)); }
    return g2;
  });
  return mesh(g, m);
}
export function lathe(profile, seg, m) { return mesh(memo('lathe', [profile, seg], () => { const g = new THREE.LatheGeometry(profile.map(([r, z]) => new THREE.Vector2(r, z)), seg); g.rotateX(Math.PI / 2); return g; }), m); }

// ---------------- shaped loft ----------------
// Body shell lofted along x. Each section has its own top / bottom heights and different
// half-widths at the belt line (w), at the top (wt) and at the bottom (wb): tumblehome,
// undercuts, hulls. n / nb = superellipse exponents of the upper / lower half (2 = round,
// 5+ = boxy). section: { x, top, bot, belt?, w, wt?, wb?, n?, nb? }
//
// Livery UVs: u runs rear -> front (u0..u1). v wraps around the section with most of the
// texture given to what is seen:  0 .. .20 right side (belt -> shoulder), .20 .. .70 top
// (right shoulder -> left shoulder), .70 .. .90 left side (shoulder -> belt), .90 .. 1 the
// underside (left sill, floor, right sill).
//
// arches: [{ x, y, r, zin, sgn? }] wheel openings: every vertex outboard of |z| = zin (or of
// z * sgn = zin for one-sided shells) that lies
// inside the circle is lifted to the arch line (normals are kept from the uncut surface, so
// the body side stays smooth right up to a crisp wheel-arch edge).
export function hull(sections, opts = {}) { return memo('h', [sections, opts], () => hullRaw(sections, opts)); }
function hullRaw(sections, { seg = 48, around = 40, u0 = 0, u1 = 1, capFront = true, capRear = true, arches = null, archN = 12, zOff = 0 } = {}) {
  const S = sections.slice().sort((a, b) => a.x - b.x).map((q) => { const o = { belt: (q.top + q.bot) / 2, wt: q.w, wb: q.w, n: 3, ...q }; if (o.nb == null) o.nb = o.n; return o; });
  const keys = ['top', 'bot', 'belt', 'w', 'wt', 'wb', 'n', 'nb'];
  const sample = (x) => {
    let i = 0; while (i < S.length - 2 && S[i + 1].x < x) i++;
    const a = S[Math.max(0, i - 1)], b = S[i], c = S[i + 1], d = S[Math.min(S.length - 1, i + 2)];
    const t = Math.max(0, Math.min(1, (x - b.x) / ((c.x - b.x) || 1)));
    const o = {};
    for (const k of keys) { const p0 = a[k], p1 = b[k], p2 = c[k], p3 = d[k]; const t2 = t * t, t3 = t2 * t; o[k] = 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3); }
    o.w = Math.max(0.004, o.w); o.wt = Math.max(0.002, o.wt); o.wb = Math.max(0.002, o.wb); o.n = Math.max(1.6, o.n); o.nb = Math.max(1.6, o.nb);
    o.top = Math.max(o.top, o.belt + 0.002); o.bot = Math.min(o.bot, o.belt - 0.002);
    return o;
  };
  const x0 = S[0].x, x1 = S[S.length - 1].x;
  let xs = []; for (let i = 0; i <= seg; i++) xs.push(x0 + (x1 - x0) * (i / seg));
  if (arches) {
    const ax = [], gap = ((x1 - x0) / seg) * 0.4;
    for (const a of arches) for (let k = 0; k <= archN; k++) { const x = a.x + a.r * Math.cos((k / archN) * Math.PI); if (x > x0 + 0.01 && x < x1 - 0.01) ax.push(x); }
    xs = xs.filter((x, i) => i === 0 || i === seg || !ax.some((q) => Math.abs(q - x) < gap)).concat(ax).sort((a, b) => a - b);
  }
  const pos = [], uv = [], idx = [];
  const pt = (s, q, tl) => {
    const th = (q + tl) * Math.PI / 2, cs = Math.cos(th), sn = Math.sin(th), up = q < 2, n = up ? s.n : s.nb, e = 2 / n;
    const az = Math.abs(cs) ** e, ay = Math.abs(sn) ** e, c = 2 ** (-1 / n);
    const sz = q === 0 || q === 3 ? 1 : -1;
    const hw = up ? s.w + (s.wt - s.w) * ay * ay : s.w + (s.wb - s.w) * ay * ay;
    const fy = Math.min(1, ay / c), fz = Math.min(1, az / c), first = tl <= 0.5;
    const v = q === 0 ? (first ? 0.2 * fy : 0.2 + 0.25 * (1 - fz)) : q === 1 ? (first ? 0.45 + 0.25 * fz : 0.7 + 0.2 * (1 - fy)) : q === 2 ? (first ? 0.9 + 0.025 * fy : 0.925 + 0.025 * (1 - fz)) : (first ? 0.95 + 0.025 * fz : 0.975 + 0.025 * (1 - fy));
    return [sz * az * hw, up ? s.belt + ay * (s.top - s.belt) : s.belt - ay * (s.belt - s.bot), v];
  };
  // vertices are spread by arc length inside each quadrant (boxy sections would otherwise
  // bunch their vertices at the corners and get wrong normals on the flat sides)
  const Q = Math.max(2, Math.round(around / 4)); around = Q * 4;
  const M = 48, NX = xs.length;
  for (let i = 0; i < NX; i++) {
    const x = xs[i], s = sample(x), u = u0 + (u1 - u0) * ((x - x0) / (x1 - x0));
    for (let q = 0; q < 4; q++) {
      const dense = [], len = [0];
      for (let k = 0; k <= M; k++) { const p = pt(s, q, k / M); dense.push(p); if (k) len.push(len[k - 1] + Math.hypot(p[0] - dense[k - 1][0], p[1] - dense[k - 1][1])); }
      const total = len[M] || 1; let k = 0;
      for (let j = 0; j < Q + (q === 3 ? 1 : 0); j++) {
        const target = (j / Q) * total; while (k < M - 1 && len[k + 1] < target) k++;
        const f = Math.max(0, Math.min(1, (target - len[k]) / ((len[k + 1] - len[k]) || 1)));
        const A = dense[k], B = dense[k + 1];
        pos.push(x, A[1] + (B[1] - A[1]) * f, A[0] + (B[0] - A[0]) * f); uv.push(u, j === Q && q === 3 ? 1 : A[2] + (B[2] - A[2]) * f);
      }
    }
  }
  const R = around + 1;
  for (let i = 0; i < NX - 1; i++) for (let j = 0; j < around; j++) { const a = i * R + j, b = a + R; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  // smooth normals from the uncut surface, welded across the v seam
  const tmp = new THREE.BufferGeometry(); tmp.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); tmp.setIndex(idx); tmp.computeVertexNormals();
  const nor = Array.from(tmp.attributes.normal.array); tmp.dispose();
  for (let i = 0; i < NX; i++) {
    const a = i * R * 3, b = (i * R + around) * 3;
    let nx = nor[a] + nor[b], ny = nor[a + 1] + nor[b + 1], nz = nor[a + 2] + nor[b + 2]; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    nor[a] = nor[b] = nx; nor[a + 1] = nor[b + 1] = ny; nor[a + 2] = nor[b + 2] = nz;
  }
  if (arches) for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i], z = Math.abs(pos[i + 2] + zOff);
    for (const a of arches) { const dx = x - a.x; if ((a.sgn ? pos[i + 2] * a.sgn : z) >= a.zin && Math.abs(dx) < a.r) { const ya = a.y + Math.sqrt(a.r * a.r - dx * dx); if (pos[i + 1] < ya) pos[i + 1] = ya; } }
  }
  // flat end caps with their own vertices (crisp edge)
  const cap = (i, front) => {
    const base = pos.length / 3, s = sample(xs[i]);
    for (let j = 0; j <= around; j++) { const k = (i * R + j) * 3; pos.push(pos[k], pos[k + 1], pos[k + 2]); nor.push(front ? 1 : -1, 0, 0); uv.push(uv[(i * R + j) * 2], uv[(i * R + j) * 2 + 1]); }
    const ci = pos.length / 3; pos.push(xs[i], s.belt, 0); nor.push(front ? 1 : -1, 0, 0); uv.push(front ? u1 : u0, 0.45);
    for (let j = 0; j < around; j++) { const a = base + j; front ? idx.push(ci, a + 1, a) : idx.push(ci, a, a + 1); }
  };
  if (capRear) cap(0, false); if (capFront) cap(NX - 1, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  return g;
}
// a body shell: full-detail hull near, a coarse one in the distance LOD
export function shell(sections, opts, m, z = 0) {
  const o = mesh(hull(sections, opts), m); o.position.z = z;
  const lo = { ...opts, seg: Math.max(6, Math.round((opts.seg || 48) / 4)), around: 12, capFront: opts.panel || opts.capFront, capRear: opts.panel || opts.capRear }; if (opts.arches) lo.archN = 5;
  o.userData.far = hull(sections, lo);
  return o;
}
// End panel of a body shell built with capFront / capRear = false: the end section closed by
// a shallow dome (bulge metres outward at the centre, rounded towards the edge) with a planar UV
// over its outline, u = left -> right as seen from behind (rear) or from ahead (front), v = up.
// Carries its own printed material (tail-light band, grille, diffuser...).
export function endPanel(sections, opts, front, m, bulge = 0.05, rings = 6) {
  const g = memo('endp', [sections, opts, front, bulge, rings], () => {
    const h = hullRaw(sections, { ...opts, seg: 1, capFront: false, capRear: false, arches: null });
    const P = h.attributes.position, R = P.count / 2, o = front ? R : 0, sg = front ? 1 : -1;
    let cy = 0, z0 = 1e9, z1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (let j = 0; j < R; j++) { const y = P.getY(o + j), z = P.getZ(o + j); cy += y / R; z0 = Math.min(z0, z); z1 = Math.max(z1, z); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const x = P.getX(o), pos = [], uv = [], idx = [];
    for (let k = 0; k <= rings; k++) {
      const t = 1 - k / rings, bx = sg * bulge * (1 - t * t * t); // t = 1 on the rim, 0 at the centre
      for (let j = 0; j < R; j++) { const y = cy + (P.getY(o + j) - cy) * t, z = P.getZ(o + j) * t; pos.push(x + bx, y, z); uv.push(front ? (z1 - z) / (z1 - z0) : (z - z0) / (z1 - z0), (y - y0) / (y1 - y0)); }
    }
    for (let k = 0; k < rings; k++) for (let j = 0; j < R - 1; j++) { const a = k * R + j, b = a + R; !front ? idx.push(a, a + 1, b, b, a + 1, b + 1) : idx.push(a, b, a + 1, b, b + 1, a + 1); }
    const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g2.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g2.setIndex(idx); g2.computeVertexNormals();
    g2.userData.box = { z0, z1, y0, y1, x }; return g2;
  });
  return mesh(g, m); // near only: the far hull closes its own ends (see shell())
}
// the dark mouth of an open-ended hull (inlets): the end section as a flat disc
export function mouth(sections, opts, front, m, inset = 0) {
  const g = memo('mouth', [sections, opts, front, inset], () => {
    const h = hullRaw(sections, { ...opts, seg: 1, capFront: false, capRear: false });
    const P = h.attributes.position, R = P.count / 2, o = front ? R : 0, pos = [], idx = [];
    let cy = 0; for (let j = 0; j < R; j++) cy += P.getY(o + j) / R;
    const x = P.getX(o) + (front ? -inset : inset);
    for (let j = 0; j < R; j++) pos.push(x, P.getY(o + j), P.getZ(o + j));
    pos.push(x, cy, 0);
    for (let j = 0; j < R - 1; j++) front ? idx.push(R, j + 1, j) : idx.push(R, j, j + 1);
    const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g2.setIndex(idx); g2.computeVertexNormals(); return g2;
  });
  return mesh(g, m);
}

// ---------------- wheel-arch flare ----------------
// A lip swept around a wheel opening: from the body side (z = 0 here) it swells outwards by
// `out` over a band `band` wide above the arch edge, then turns in under the arch.
// a0 / a1: start / end angle (rad, 0 = front, PI = rear). Built at the origin of the wheel.
export function archFlare(r, out, band, m, { a0 = 0.05, a1 = Math.PI - 0.05, n = 20, side = 1, inner = 0.05 } = {}) {
  const g = memo('flare', [r, out, band, a0, a1, n, side, inner], () => {
    // profile across the lip: [radial offset, lateral offset]
    const prof = [[band, 0], [band * 0.72, out * 0.45], [band * 0.38, out * 0.86], [0.012, out], [0, out * 0.96], [-0.004, out * 0.6], [-0.004, -inner]];
    const pos = [], idx = [], L = prof.length;
    for (let i = 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * (i / n), fade = Math.min(1, Math.sin((i / n) * Math.PI) * 3 + 0.25);
      for (const [dr, dz] of prof) { const rr = r + dr; pos.push(Math.cos(a) * rr, Math.sin(a) * rr, side * dz * (dz > 0 ? fade : 1)); }
    }
    for (let i = 0; i < n; i++) for (let j = 0; j < L - 1; j++) { const a = i * L + j, b = a + L; side > 0 ? idx.push(a, a + 1, b, b, a + 1, b + 1) : idx.push(a, b, a + 1, b, b + 1, a + 1); }
    const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g2.setIndex(idx); g2.computeVertexNormals(); return g2;
  });
  return mesh(g, m);
}

// ---------------- wings ----------------
// Swept airfoil built along z: samples [{z, x (leading edge), y, c (chord), a (angle, rad), t (thickness)}]
export function sweptWing(samples, m, lowN = 0) {
  const o = mesh(memo('w', [samples, 12], () => sweptGeo(samples, 12)), m);
  if (lowN) { const pick = []; for (let k = 0; k <= lowN; k++) pick.push(samples[Math.round((k / lowN) * (samples.length - 1))]); o.userData.far = memo('w', [pick, 3], () => sweptGeo(pick, 3)); }
  return o;
}
function sweptGeo(samples, NP) {
  const prof = [];
  for (let k = 0; k <= NP; k++) { const u = (k / NP) ** 1.5; prof.push([u, 0.6 * (1 - u) * Math.sqrt(u) * 1.9]); }
  const loop = [...prof.map(([u, h]) => [u, h]), ...prof.slice(1, -1).reverse().map(([u, h]) => [u, -h * 0.35])];
  const pos = [], idx = [], L = loop.length;
  const ring = (sm) => { const ca = Math.cos(sm.a), sa = Math.sin(sm.a); for (const [u, h] of loop) { const lx = -u * sm.c, ly = h * sm.t; pos.push(sm.x + lx * ca - ly * sa, sm.y + lx * sa + ly * ca, sm.z); } };
  samples.forEach(ring);
  for (let i = 0; i < samples.length - 1; i++) for (let j = 0; j < L; j++) { const a = i * L + j, b = i * L + (j + 1) % L, c = a + L, d = b + L; idx.push(a, b, c, b, d, c); }
  // closed tips (own vertices so the edge stays crisp)
  for (const [sm, flip] of [[samples[0], false], [samples[samples.length - 1], true]]) {
    const base = pos.length / 3; ring(sm);
    for (let j = 1; j < L - 1; j++) flip ? idx.push(base, base + j + 1, base + j) : idx.push(base, base + j, base + j + 1);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
export const spanSamples = (half, n, f) => { const out = []; for (let k = 0; k <= n; k++) { const z = -half + (2 * half * k) / n; out.push({ z, ...f(Math.abs(z) / half, z) }); } return out; };
