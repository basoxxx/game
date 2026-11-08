// Venue dressing for "Scontro Totale": terrain material (ruts, wet patches, dirt sprayed onto
// grass, triplanar rock faces), water (streams and puddles), grandstands, parody-sponsor banners,
// light poles, sheds/barns/silos/containers, quarry boulders, arena and stadium structures, trees.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { pbr } from '../ui/gfx.js';
import { makeForest, makeTreeShadows, vegOfKind } from '../ui/vegetation.js';
import { mergeStatic } from './merge.js';

const UP = new THREE.Vector3(0, 1, 0);
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function canvasTex(w, h, draw, repeat = null) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); } return t; }
const shadowy = (o) => { o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); return o; };

export const SPONSORS = [
  { t: 'OLIO GRASSINI', s: 'lubrifica anche i rimpianti', bg: '#ffd400', fg: '#111' },
  { t: 'GOMME TONDE', s: 'rotolano, garantito', bg: '#111', fg: '#fff' },
  { t: 'BIRRA SCHIUMA', s: 'la bionda del pilota', bg: '#c8102e', fg: '#fff' },
  { t: 'RICAMBI RUGGINE', s: 'usato sicuro (quasi)', bg: '#8a4b1d', fg: '#ffe9c2' },
  { t: 'PNEUS POLPO', s: 'aderenza a otto braccia', bg: '#1f6fd1', fg: '#fff' },
  { t: 'FERRAMENTA FULMINE', s: 'viti, bulloni, miracoli', bg: '#f2f2f2', fg: '#d10000' },
  { t: 'AUTODEMOLIZIONI ZANZA', s: 'ritiriamo tutto', bg: '#2b8a3e', fg: '#fff' },
  { t: 'CARROZZERIA BOTTA', s: 'ne raddrizziamo di peggiori', bg: '#ff6a00', fg: '#111' },
];
let _atlas = null;
function sponsorAtlas() {
  if (_atlas) return _atlas;
  _atlas = canvasTex(1024, 1024, (g, W) => {
    SPONSORS.forEach((sp, i) => {
      const y = i * 128; g.fillStyle = sp.bg; g.fillRect(0, y, W, 128);
      g.fillStyle = sp.fg; g.globalAlpha = 0.15; for (let k = 0; k < 12; k++) g.fillRect(k * 90 - 20, y, 40, 128); g.globalAlpha = 1;
      g.font = 'italic 900 70px "Exo 2", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = sp.fg; g.fillText(sp.t, W / 2, y + 54);
      g.font = 'italic 700 24px "Exo 2", Arial, sans-serif'; g.fillText(sp.s, W / 2, y + 104);
      g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 6; g.strokeRect(3, y + 3, W - 6, 122);
    });
  });
  return _atlas;
}
// plane showing sponsor i (uv sub-rect of the atlas)
function bannerMat() { return (MATS.bannerM ||= new THREE.MeshStandardMaterial({ map: sponsorAtlas(), roughness: 0.62 })); }
function bannerGeo(w, h, i) { const g = new THREE.PlaneGeometry(w, h); const uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setY(k, 1 - (i + 1 - uv.getY(k)) / 8); return g; }

const MATS = {};
function mats() {
  if (MATS.ready) return MATS;
  MATS.ready = true;
  const corrCache = new Map();
  MATS.corr = (color) => corrCache.get(color) || corrCache.set(color, MATS.corrMake(color)).get(color);
  MATS.corrMake = (color) => new THREE.MeshStandardMaterial({ map: canvasTex(256, 256, (g, W, H) => { g.fillStyle = color; g.fillRect(0, 0, W, H); for (let x = 0; x < W; x += 16) { const gr = g.createLinearGradient(x, 0, x + 16, 0); gr.addColorStop(0, 'rgba(0,0,0,0.28)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(0,0,0,0.28)'); g.fillStyle = gr; g.fillRect(x, 0, 16, H); } for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(${110 + Math.random() * 40},${50 + Math.random() * 20},20,${Math.random() * 0.5})`; g.beginPath(); g.ellipse(Math.random() * W, Math.random() * H, 4 + Math.random() * 18, 3 + Math.random() * 30, 0, 0, 7); g.fill(); } }, [2, 1]), roughness: 0.65, metalness: 0.45 });
  MATS.barn = new THREE.MeshStandardMaterial({ map: canvasTex(256, 256, (g, W, H) => { g.fillStyle = '#8e2a1e'; g.fillRect(0, 0, W, H); for (let x = 0; x < W; x += 21) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x, 0, 2, H); g.fillStyle = `rgba(255,255,255,${Math.random() * 0.06})`; g.fillRect(x + 2, 0, 19, H); } }, [3, 1]), roughness: 0.9 });
  MATS.white = new THREE.MeshStandardMaterial({ color: 0xe8e4da, roughness: 0.8 });
  MATS.concrete = pbr('concrete_floor_worn_001', { color: 0xbab3a6, repeat: [4, 1] });
  MATS.steel = new THREE.MeshStandardMaterial({ color: 0x7c8086, roughness: 0.45, metalness: 0.8 });
  MATS.dark = new THREE.MeshStandardMaterial({ color: 0x1c1d20, roughness: 0.9 });
  MATS.roofRed = new THREE.MeshStandardMaterial({ color: 0xa33a2a, roughness: 0.6, metalness: 0.3 });
  MATS.lamp = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2d0, emissiveIntensity: 3 });
  MATS.wood = new THREE.MeshStandardMaterial({ map: canvasTex(128, 128, (g, W, H) => { g.fillStyle = '#7a5a3a'; g.fillRect(0, 0, W, H); for (let y = 0; y < H; y += 16) { g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, y, W, 2); } }), roughness: 0.9 });
  MATS.banner = null;
  MATS.crowd = canvasTex(512, 256, (g, W, H) => { g.fillStyle = '#2e2c2a'; g.fillRect(0, 0, W, H); for (let y = 6; y < H; y += 16) for (let x = 3 + (y % 32 ? 4 : 0); x < W; x += 9) { if (Math.random() < 0.12) continue; g.fillStyle = `hsl(${Math.random() * 360},${45 + Math.random() * 40}%,${30 + Math.random() * 40}%)`; g.fillRect(x - 3, y + 2, 7, 9); g.fillStyle = ['#f1c9a5', '#c58c62', '#8d5a3b', '#e6b892'][Math.floor(Math.random() * 4)]; g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); } }, [4, 1]);
  MATS.crowdMat = new THREE.MeshStandardMaterial({ map: MATS.crowd, roughness: 0.9 });
  return MATS;
}

// ------------------------------------------------------------------ terrain
export function buildGround(game) {
  const T = game.terrain, v = game.venue, tr = game.track, scene = game.scene;
  const n = (T.nc + 1) * (T.nr + 1), pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), bl = new Float32Array(n), lat = new Float32Array(n), wet = new Float32Array(n);
  for (let c = 0; c <= T.nc; c++) for (let r = 0; r <= T.nr; r++) { const k = c * (T.nr + 1) + r, x = T.X(c), z = T.Z(r); pos[k * 3] = x; pos[k * 3 + 1] = T.H[k]; pos[k * 3 + 2] = z; uv[k * 2] = x / 7; uv[k * 2 + 1] = z / 7; bl[k] = T.B[k]; lat[k] = T.D[k]; wet[k] = T.W[k]; }
  const idx = new Uint32Array(T.nc * T.nr * 6); let o = 0;
  for (let c = 0; c < T.nc; c++) for (let r = 0; r < T.nr; r++) { const a = c * (T.nr + 1) + r, b = a + T.nr + 1; idx[o++] = a; idx[o++] = a + 1; idx[o++] = b; idx[o++] = b; idx[o++] = a + 1; idx[o++] = b + 1; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setAttribute('blend', new THREE.BufferAttribute(bl, 1)); g.setAttribute('lat', new THREE.BufferAttribute(lat, 1)); g.setAttribute('wet', new THREE.BufferAttribute(wet, 1)); g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeVertexNormals();
  const rockGround = v.ground === 'rock';
  const mat = pbr('aerial_grass_rock', { color: rockGround ? 0xcdbd9b : 0xa9c48a, roughness: 1 });
  const surfId = v.surface === 'asphalt' ? 'asphalt_02' : 'gravel_floor';
  const surf = pbr(surfId, { color: 0xffffff, roughness: 1 });
  const rock = pbr('rocky_trail', { color: 0xbfae94, roughness: 1 });
  const tint = v.surface === 'asphalt' ? '0.6,0.6,0.62' : v.surface === 'mud' ? '0.42,0.31,0.21' : v.stadium ? '0.85,0.66,0.48' : '0.95,0.82,0.62';
  const mud = v.surface === 'mud' ? 1 : 0;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.mapB = { value: surf.map }; sh.uniforms.mapR = { value: rock.map }; sh.uniforms.hw = { value: (tr.width || 10) / 2 };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float blend; attribute float lat; attribute float wet; varying float vBlend; varying float vLat; varying float vWet; varying vec3 vWP; varying vec3 vWN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBlend = blend; vLat = lat; vWet = wet; vWP = position; vWN = normal;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      uniform sampler2D mapB; uniform sampler2D mapR; uniform float hw; varying float vBlend; varying float vLat; varying float vWet; varying vec3 vWP; varying vec3 vWN;
      float th(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float tn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(th(i), th(i+vec2(1,0)), f.x), mix(th(i+vec2(0,1)), th(i+vec2(1,1)), f.x), f.y); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec3 wn = normalize(vWN); vec3 bw = pow(abs(wn), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
        vec3 cR = (texture2D(mapR, vWP.zy * 0.07).rgb * bw.x + texture2D(mapR, vWP.xz * 0.07).rgb * bw.y + texture2D(mapR, vWP.xy * 0.07).rgb * bw.z) * vec3(0.86,0.77,0.64);
        float nz = tn(vWP.xz * 0.045) * 0.6 + tn(vWP.xz * 0.21) * 0.4;
        vec3 cB = mix(texture2D(mapB, vWP.xz * 0.16).rgb, texture2D(mapB, vWP.zx * 0.043 + 0.37).rgb, 0.35) * vec3(${tint}) * (0.86 + nz * 0.28);
        float rk = smoothstep(0.86, 0.62, wn.y) * (1.0 - vBlend);
        diffuseColor.rgb = mix(diffuseColor.rgb, cR, rk);
        float edge = abs(vLat) - hw;
        float spray = (1.0 - smoothstep(-1.0, 6.5, edge + (nz - 0.5) * 6.0)) * (1.0 - vBlend) * (1.0 - rk);
        diffuseColor.rgb = mix(diffuseColor.rgb, cB * 0.92, clamp(spray, 0.0, 1.0) * 0.8);
        // ruts: two pairs of compacted wheel grooves following the line, wandering a little
        float l = vLat + (tn(vWP.xz * 0.03) - 0.5) * 3.0;
        float rut = 0.0;
        for (int q = 0; q < 2; q++) { float c = (q == 0 ? -0.32 : 0.3) * hw; float d = abs(abs(l - c) - 0.8); rut += exp(-d * d * 7.0); }
        float loose = smoothstep(0.75, 1.0, abs(vLat) / max(hw, 1.0));
        vec3 cT = cB * (1.0 - rut * ${v.surface === 'asphalt' ? '0.32' : '0.26'}) * (1.0 + loose * 0.1);
        float tb = smoothstep(0.05, 0.95, vBlend);
        diffuseColor.rgb = mix(diffuseColor.rgb, cT, tb);
        float wetA = clamp(vWet * 1.4, 0.0, 1.0);
        wetA = max(wetA, ${mud ? '1.0' : '0.0'} * tb * smoothstep(0.6, 0.75, tn(vWP.xz * 0.09 + 3.1)) * 0.6);
        wetA = max(wetA, ${mud ? '0.45' : '0.0'} * tb * rut);
        diffuseColor.rgb *= 1.0 - wetA * 0.5;`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.38, wetA);');
  };
  mat.customProgramCacheKey = () => 'dzground' + v.id;
  const ground = new THREE.Mesh(g, mat); ground.receiveShadow = true; scene.add(ground);
  const far = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshStandardMaterial({ color: rockGround ? 0x9c8e70 : 0x6f8a52, roughness: 1 }));
  let hMin = 1e9; for (let k = 0; k < T.H.length; k += 7) hMin = Math.min(hMin, T.H[k]);
  far.rotation.x = -Math.PI / 2; far.position.set(T.cx, hMin - 4, T.cz); scene.add(far);
  return ground;
}

// ------------------------------------------------------------------ water
function waterMat() { return new THREE.MeshPhysicalMaterial({ color: 0x0f1c20, roughness: 0.03, metalness: 0.0, transparent: true, opacity: 0.9, envMapIntensity: 0.75, clearcoat: 1, clearcoatRoughness: 0.05 }); }
export function buildWaterMeshes(game) {
  const W = game.water, T = game.terrain, scene = game.scene;
  for (const s of W.streams) {
    const pts = [], idx = [], uvs = []; const steps = Math.ceil(s.len * 2 / 2.5), hw = s.w * 0.9;
    for (let q = 0; q <= steps; q++) {
      const a = -s.len + q * 2.5, y = s.level(a);
      for (const w of [-hw, hw]) { pts.push(s.x + s.dx * a - s.dz * w, y, s.z + s.dz * a + s.dx * w); uvs.push(a / 6, w / 6); }
      if (q) { const b = (q - 1) * 2; idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setIndex(idx); g.computeVertexNormals();
    if (g.attributes.normal.getY(0) < 0) { for (let k = 0; k < idx.length; k += 3) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t; } g.setIndex(idx); g.computeVertexNormals(); }
    const m = new THREE.Mesh(g, waterMat()); m.receiveShadow = true; scene.add(m);
    // reeds and stones along the banks (off-track)
  }
  if (W.puddles.length) {
    const alpha = canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, '#fff'); gr.addColorStop(0.65, '#ddd'); gr.addColorStop(1, '#000'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
    alpha.colorSpace = THREE.NoColorSpace;
    const geos = W.puddles.map((p) => { const c = new THREE.CircleGeometry(p.r, 18, 0, Math.PI * 2); c.rotateX(-Math.PI / 2); c.scale(1, 1, 0.7); c.rotateY(p.rot); c.translate(p.x, 0, p.z); const P = c.attributes.position; for (let i = 0; i < P.count; i++) P.setY(i, T.heightAt(P.getX(i), P.getZ(i)) + 0.03); return c; });
    const m = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshStandardMaterial({ color: 0x2d261d, roughness: 0.05, metalness: 0.1, alphaMap: alpha, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, envMapIntensity: 1.3 }));
    m.receiveShadow = true; scene.add(m);
  }
}

// ------------------------------------------------------------------ structures
function gable(w, d, h) { // triangular prism roof, ridge along x
  const s = new THREE.Shape(); s.moveTo(-d / 2, 0); s.lineTo(0, h); s.lineTo(d / 2, 0); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false }); g.translate(0, 0, -w / 2); g.rotateY(Math.PI / 2); return g;
}
function shed(kind, R) {
  const M = mats(), grp = new THREE.Group();
  if (kind === 'barn') {
    const w = 16, d = 11, h = 6;
    const walls = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M.barn); walls.position.y = h / 2; grp.add(walls);
    const roof = new THREE.Mesh(gable(w + 1, d + 1.2, 4.2), M.corr('#5d5f61')); roof.position.y = h; grp.add(roof);
    for (const x of [-w / 4, w / 4]) { const door = new THREE.Mesh(new THREE.BoxGeometry(3.6, 4.2, 0.2), M.barn); door.position.set(x, 2.1, d / 2 + 0.05); grp.add(door); const tr = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.25, 0.25), M.white); tr.position.set(x, 4.25, d / 2 + 0.1); grp.add(tr); const x1 = new THREE.Mesh(new THREE.BoxGeometry(4.9, 0.22, 0.22), M.white); x1.position.set(x, 2.1, d / 2 + 0.17); x1.rotation.z = 0.86; grp.add(x1); const x2 = x1.clone(); x2.rotation.z = -0.86; grp.add(x2); }
    return { grp, half: [w / 2, d / 2], h: h + 4 };
  }
  if (kind === 'silo') {
    const r = 2.6 + R() * 0.8, h = 12 + R() * 6;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 20), M.corr('#a7aaae')); body.position.y = h / 2; grp.add(body);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(r * 1.02, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.steel); dome.position.y = h; grp.add(dome);
    return { grp, half: [r, r], h: h + r, round: r };
  }
  if (kind === 'container') {
    const cols = ['#a33a2a', '#1f5f99', '#2e7d4f', '#c97f16', '#6b6f73'];
    const n = 1 + Math.floor(R() * 3);
    for (let i = 0; i < n; i++) { const c = new THREE.Mesh(new THREE.BoxGeometry(6.1, 2.6, 2.45), M.corr(cols[Math.floor(R() * cols.length)])); c.position.set(i === 2 ? 0.8 : 0, 1.3 + (i === 2 ? 2.6 : 0), i === 1 ? 2.6 : 0); c.rotation.y = i === 2 ? 0.2 : 0; grp.add(c); }
    return { grp, half: [3.2, n > 1 ? 2.6 : 1.3], h: 5 };
  }
  if (kind === 'cabin') {
    const c = new THREE.Mesh(new THREE.BoxGeometry(7, 2.8, 3), M.corr('#d9d5c8')); c.position.y = 1.6; grp.add(c);
    for (const x of [-2, 0.5]) { const wdw = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.9), new THREE.MeshStandardMaterial({ color: 0x18222c, roughness: 0.1, metalness: 0.5 })); wdw.position.set(x, 1.9, 1.51); grp.add(wdw); }
    for (const x of [-3, 3]) for (const z of [-1.2, 1.2]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), M.dark); b.position.set(x, 0.15, z); grp.add(b); }
    return { grp, half: [3.5, 1.5], h: 3 };
  }
  // generic metal shed with an open front
  const w = 12, d = 8, h = 5;
  const back = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.2), M.corr('#7d8a8f')); back.position.set(0, h / 2, -d / 2); grp.add(back);
  for (const x of [-w / 2, w / 2]) { const sd = new THREE.Mesh(new THREE.BoxGeometry(0.2, h, d), M.corr('#7d8a8f')); sd.position.set(x, h / 2, 0); grp.add(sd); }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.15, d + 1), M.corr('#6a6f72')); roof.position.y = h; roof.rotation.x = 0.06; grp.add(roof);
  for (let i = 0; i < 6; i++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 12), new THREE.MeshStandardMaterial({ color: [0x2a6fb0, 0xb3261e, 0x3d7a3a][i % 3], roughness: 0.6, metalness: 0.4 })); b.position.set(-4 + i * 1.3, 0.45, -2.5 + (i % 2)); grp.add(b); }
  return { grp, half: [w / 2, d / 2], h };
}
function grandstand(len, rows = 8, roofed = true) {
  const M = mats(), grp = new THREE.Group(), step = 0.8, rise = 0.55;
  for (let r = 0; r < rows; r++) {
    const tier = new THREE.Mesh(new THREE.BoxGeometry(len, rise, step), M.concrete); tier.position.set(0, rise * (r + 0.5), -r * step); grp.add(tier);
  }
  // crowd sheet over the tiers
  const sg = new THREE.PlaneGeometry(len - 0.4, Math.hypot(rows * step, rows * rise)); { const uv = sg.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setX(k, uv.getX(k) * len / 40); }
  const sheet = new THREE.Mesh(sg, M.crowdMat);
  sheet.position.set(0, rows * rise / 2 + 0.3, -rows * step / 2 + step / 2); grp.add(sheet);
  sheet.rotation.set(-(Math.PI / 2 - Math.atan2(rise, step)), 0, 0);
  const back = new THREE.Mesh(new THREE.BoxGeometry(len, rows * rise + 2.5, 0.4), M.concrete); back.position.set(0, (rows * rise + 2.5) / 2, -rows * step - 0.2); grp.add(back);
  const front = new THREE.Mesh(new THREE.BoxGeometry(len, 1.1, 0.25), M.white); front.position.set(0, 0.55, step / 2 + 0.2); grp.add(front);
  // sponsor boards on the front wall
  const atlas = sponsorAtlas();
  for (let x = -len / 2 + 4; x < len / 2 - 3; x += 8) { const b = new THREE.Mesh(bannerGeo(7.6, 0.95, Math.floor(Math.random() * 8)), bannerMat()); b.position.set(x + 0.2, 0.55, step / 2 + 0.34); grp.add(b); }
  if (roofed) {
    const top = rows * rise + 4.2;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(len + 1, 0.3, rows * step + 3), M.roofRed); roof.position.set(0, top, -rows * step / 2 + 0.6); roof.rotation.x = -0.08; grp.add(roof);
    for (let x = -len / 2; x <= len / 2 + 0.1; x += len / Math.max(1, Math.round(len / 12))) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, top, 8), M.steel); p.position.set(x, top / 2, -rows * step - 0.2); grp.add(p); }
  }
  return shadowy(grp);
}
function banner(i, w = 7.5, h = 1.5) {
  const M = mats(), grp = new THREE.Group();
  const b = new THREE.Mesh(bannerGeo(w, h, i), bannerMat()); b.position.y = 1.0 + h / 2; grp.add(b);
  for (const x of [-w / 2, w / 2]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.1 + h, 6), M.steel); p.position.set(x, (1.1 + h) / 2, -0.05); grp.add(p); }
  return shadowy(grp);
}

// fixed collider for a placed structure
function solid(game, x, y, z, yaw, hx, hy, hz, round = 0) {
  const body = game.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y + hy, z).setRotation(new THREE.Quaternion().setFromAxisAngle(UP, yaw)));
  const col = game.world.createCollider(round ? RAPIER.ColliderDesc.cylinder(hy, round) : RAPIER.ColliderDesc.cuboid(hx, hy, hz), body);
  col.setFriction(0.6); game.handles.set(col.handle, { kind: 'wall' });
}

// spot near the track, outside the berms, far enough from every part of the track
function clearOf(game, x, z, r) { const tr = game.track; if (tr.arena) return true; const lim = (tr.width / 2 + 14 + r) ** 2; for (let i = 0; i < tr.N; i += 2) { const p = tr.pts[i]; if ((p.x - x) ** 2 + (p.z - z) ** 2 < lim) return false; } for (const s of game.water.streams) { const dx = x - s.x, dz = z - s.z; if (Math.abs(-dx * s.dz + dz * s.dx) < s.w + r + 2 && Math.abs(dx * s.dx + dz * s.dz) < s.len) return false; } return true; }

export function buildScenery(game) {
  const v = game.venue, tr = game.track, T = game.terrain, scene = game.scene, R = rng((v.seed || 9) * 17 + 3);
  game.blockers = []; // [x, z, r] for tree placement
  game.S = new THREE.Group(); scene.add(game.S);
  buildSceneryInner(game, R);
  // static dressing: one mesh per material
  mergeStatic(game.S);
}
function buildSceneryInner(game, R) {
  const v = game.venue, tr = game.track, T = game.terrain, scene = game.scene;
  const place = (obj, x, z, yaw, info) => { const y = T.heightAt(x, z); obj.position.set(x, y - 0.05, z); obj.rotation.y = yaw; game.S.add(obj); game.blockers.push([x, z, Math.max(...info.half) + 2]); if (info.half) solid(game, x, y, z, yaw, info.half[0], (info.h || 4) / 2, info.half[1], info.round || 0); };
  if (tr.arena) { buildArena(game, R); return; }
  if (tr.stunt) buildStunt(game, R);
  const hw = tr.width / 2;
  // start / finish gantry
  const p0 = tr.pts[0], nx = -Math.sin(p0.h), nz = Math.cos(p0.h);
  const bannerTex = canvasTex(1024, 128, (g) => { g.fillStyle = '#111'; g.fillRect(0, 0, 1024, 128); for (let i = 0; i < 32; i++) for (let j = 0; j < 4; j++) { g.fillStyle = (i + j) % 2 ? '#fff' : '#111'; g.fillRect(i * 32, j * 32, 32, 32); } g.fillStyle = '#e10600'; g.fillRect(256, 14, 512, 100); g.fillStyle = '#fff'; g.font = 'italic 900 56px "Exo 2", Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('SCONTRO TOTALE', 512, 66, 480); });
  const M = mats();
  for (const sd of [1, -1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7.5, 0.5), M.steel); p.position.set(p0.x + nx * sd * (hw + 1.5), p0.y + 3.75, p0.z + nz * sd * (hw + 1.5)); p.castShadow = true; game.S.add(p); }
  const ban = new THREE.Mesh(new THREE.BoxGeometry(tr.width + 3.5, 1.8, 0.3), [M.steel, M.steel, M.steel, M.steel, new THREE.MeshStandardMaterial({ map: bannerTex, roughness: 0.6 }), new THREE.MeshStandardMaterial({ map: bannerTex, roughness: 0.6 })]);
  ban.position.set(p0.x, p0.y + 6.6, p0.z); ban.rotation.y = -p0.h + Math.PI / 2; ban.castShadow = true; game.S.add(ban);
  const chk = new THREE.Mesh(new THREE.PlaneGeometry(1.6, tr.width), new THREE.MeshStandardMaterial({ map: bannerTex, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 }));
  chk.rotation.x = -Math.PI / 2; chk.rotation.z = -p0.h; chk.position.set(p0.x, T.heightAt(p0.x, p0.z) + 0.04, p0.z); game.S.add(chk);
  // grandstands
  const stands = v.stadium || tr.stunt ? [] : [0.03, 0.5, ...(v.farm ? [] : [0.27])];
  for (const fr of stands) {
    const i = Math.floor(fr * tr.N), p = tr.pts[i], k = p.k, sd = k > 0 ? 1 : -1, ox = -Math.sin(p.h) * sd, oz = Math.cos(p.h) * sd, off = hw + 15;
    const x = p.x + ox * off, z = p.z + oz * off; if (!clearOf(game, x, z, 8)) continue;
    const g = grandstand(40, 8); g.position.set(x, T.heightAt(x, z) - 0.2, z); g.rotation.y = Math.atan2(ox, oz) + Math.PI; game.S.add(g); game.blockers.push([x, z, 24]);
  }
  // sponsor banners and light poles along the track, outside the berm
  const poles = [], lamps = [];
  let bi = 0;
  for (let i = 0; i < tr.N; i += 22) {
    const p = tr.pts[i]; const sd = (i / 22) % 2 ? 1 : -1; const ox = -Math.sin(p.h) * sd, oz = Math.cos(p.h) * sd;
    const bx = p.x + ox * (hw + 12.5), bz = p.z + oz * (hw + 12.5);
    if (clearOf(game, bx, bz, -2.5)) { const b = banner(bi++ % 8); b.position.set(bx, T.heightAt(bx, bz) - 0.1, bz); b.rotation.y = Math.atan2(ox, oz) + Math.PI; game.S.add(b); }
    if (i % 44 === 0) { const lx = p.x - ox * (hw + 13), lz = p.z - oz * (hw + 13); if (clearOf(game, lx, lz, -2.5)) poles.push([lx, T.heightAt(lx, lz), lz, Math.atan2(-ox, -oz) + Math.PI]); }
  }
  if (poles.length) {
    const ph = v.stadium ? 16 : 11;
    const poleI = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.24, ph, 8).translate(0, ph / 2, 0), M.steel, poles.length);
    const lampI = new THREE.InstancedMesh(new THREE.BoxGeometry(1.4, 0.35, 0.7).translate(0, ph, 1.0), M.lamp, poles.length);
    const armI = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.12, 1.4).translate(0, ph - 0.1, 0.6), M.steel, poles.length);
    const d = new THREE.Object3D();
    poles.forEach(([x, y, z, yaw], i) => { d.position.set(x, y - 0.2, z); d.rotation.y = yaw; d.updateMatrix(); poleI.setMatrixAt(i, d.matrix); lampI.setMatrixAt(i, d.matrix); armI.setMatrixAt(i, d.matrix); });
    for (const m of [poleI, armI]) { m.castShadow = true; game.S.add(m); } game.S.add(lampI);
    game.lamps = lampI;
  }
  // buildings
  const kinds = v.port ? ['shed', 'container', 'cabin', 'shed', 'container'] : tr.stunt ? ['cabin', 'container', 'shed'] : v.farm ? ['barn', 'silo', 'barn', 'silo', 'shed', 'container', 'cabin'] : v.quarry ? ['shed', 'container', 'cabin', 'container', 'shed', 'silo'] : v.stadium ? ['cabin', 'container'] : ['shed', 'cabin', 'container', 'shed'];
  let placed = 0;
  for (let a = 0; a < 80 && placed < kinds.length; a++) {
    const i = Math.floor(R() * tr.N), p = tr.pts[i], sd = R() < 0.5 ? 1 : -1, off = hw + 26 + R() * 30;
    const x = p.x - Math.sin(p.h) * sd * off, z = p.z + Math.cos(p.h) * sd * off;
    const s = shed(kinds[placed], R); if (!clearOf(game, x, z, Math.max(...s.half))) continue;
    if (Math.abs(T.heightAt(x + 6, z) - T.heightAt(x - 6, z)) > 3 || game.blockers.some(([bx, bz, br]) => Math.hypot(bx - x, bz - z) < br + 10)) continue;
    shadowy(s.grp); place(s.grp, x, z, -p.h + (sd > 0 ? Math.PI : 0), s); placed++;
  }
  if (v.quarry) buildQuarry(game, R);
  if (v.stadium) buildStadium(game, R);
  if (v.farm) buildFarm(game, R);
  if (v.port) buildPort(game, R);
}

function buildQuarry(game, R) {
  const tr = game.track, T = game.terrain, hw = tr.width / 2;
  // boulders at the foot of the rock faces and scattered on the benches
  const rockMat = pbr('rocky_trail', { color: 0xb3a38a, repeat: [1, 1] });
  const base = new THREE.IcosahedronGeometry(1, 2); const P = base.attributes.position;
  for (let i = 0; i < P.count; i++) { const x = P.getX(i), y = P.getY(i), z = P.getZ(i); const f = 1 + 0.22 * Math.sin(x * 3.1 + y * 2.3) * Math.cos(z * 2.7 - y) + 0.1 * Math.sin(x * 7 + z * 5); P.setXYZ(i, x * f, y * f * 0.75, z * f); }
  base.computeVertexNormals();
  const list = [];
  for (let i = 0; i < tr.N; i += 3) {
    const p = tr.pts[i];
    for (const sd of [1, -1]) {
      if (R() > 0.35) continue;
      const off = hw + 13 + R() * 6, x = p.x - Math.sin(p.h) * sd * off, z = p.z + Math.cos(p.h) * sd * off;
      if (!clearOf(game, x, z, -3)) continue;
      const s = 0.7 + R() ** 2 * 2.4; list.push([x, T.heightAt(x, z), z, s]);
    }
  }
  const inst = new THREE.InstancedMesh(base, rockMat, list.length); const d = new THREE.Object3D();
  list.forEach(([x, y, z, s], i) => { d.position.set(x, y + s * 0.25, z); d.rotation.set(R() * 3, R() * 3, R() * 3); d.scale.set(s * (0.8 + R() * 0.5), s, s * (0.8 + R() * 0.5)); d.updateMatrix(); inst.setMatrixAt(i, d.matrix); if (s > 1) { const b = game.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y + s * 0.2, z)); const c = game.world.createCollider(RAPIER.ColliderDesc.ball(s * 0.75), b); game.handles.set(c.handle, { kind: 'wall' }); } });
  inst.castShadow = true; inst.receiveShadow = true; game.S.add(inst);
  // conveyor belt gantry crossing high over the track
  const i = Math.floor(tr.N * 0.4), p = tr.pts[i], M = mats();
  const grp = new THREE.Group(); const span = tr.width + 30;
  const belt = new THREE.Mesh(new THREE.BoxGeometry(span, 1.2, 1.6), M.corr('#c98a1a')); belt.position.y = 9; grp.add(belt);
  for (let x = -span / 2; x <= span / 2; x += span / 4) { if (Math.abs(x) < hw + 3) continue; const l = new THREE.Mesh(new THREE.BoxGeometry(0.4, 9, 0.4), M.steel); l.position.set(x, 4.5, 0); grp.add(l); }
  const tx = new THREE.Mesh(new THREE.BoxGeometry(span, 0.2, 0.2), M.steel); tx.position.set(0, 10, 0.8); grp.add(tx);
  shadowy(grp); grp.position.set(p.x, p.y, p.z); grp.rotation.y = -p.h + Math.PI / 2; game.S.add(grp);
}

function buildFarm(game, R) {
  const tr = game.track, T = game.terrain, hw = tr.width / 2, M = mats();
  // wooden post-and-rail fencing sections and wrecked tractors / hay stacks beyond the berms
  const rails = [];
  for (let i = 0; i < tr.N; i += 4) {
    const p = tr.pts[i]; for (const sd of [1, -1]) { const off = hw + 16, x = p.x - Math.sin(p.h) * sd * off, z = p.z + Math.cos(p.h) * sd * off; if (clearOf(game, x, z, -2)) rails.push([x, T.heightAt(x, z), z, -p.h]); }
  }
  const post = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 1.3, 0.16).translate(0, 0.65, 0), M.wood, rails.length);
  const rail = new THREE.InstancedMesh(mergeGeometries([new THREE.BoxGeometry(10.2, 0.14, 0.06).translate(0, 0.55, 0), new THREE.BoxGeometry(10.2, 0.14, 0.06).translate(0, 1.05, 0)]), M.wood, rails.length);
  const d = new THREE.Object3D(); rails.forEach(([x, y, z, yaw], i) => { d.position.set(x, y, z); d.rotation.y = yaw; d.updateMatrix(); post.setMatrixAt(i, d.matrix); rail.setMatrixAt(i, d.matrix); });
  post.castShadow = rail.castShadow = true; game.S.add(post); game.S.add(rail);
  // tractor
  for (let n = 0; n < 2; n++) {
    const i = Math.floor(R() * tr.N), p = tr.pts[i], off = hw + 20, sd = n ? 1 : -1, x = p.x - Math.sin(p.h) * sd * off, z = p.z + Math.cos(p.h) * sd * off;
    if (!clearOf(game, x, z, 2)) continue;
    const g = new THREE.Group(), red = new THREE.MeshStandardMaterial({ color: 0x2f6b2a, roughness: 0.6, metalness: 0.3 });
    const b = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.0, 1.1), red); b.position.set(0.4, 1.3, 0); g.add(b);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.4, 1.3), new THREE.MeshStandardMaterial({ color: 0x1a2228, roughness: 0.2, metalness: 0.5, transparent: true, opacity: 0.6 })); cab.position.set(-0.7, 2.4, 0); g.add(cab);
    for (const [wx, wr] of [[-0.8, 0.95], [1.3, 0.55]]) for (const wz of [-0.85, 0.85]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(wr, wr, 0.45, 16), M.dark); w.rotation.x = Math.PI / 2; w.position.set(wx, wr, wz); g.add(w); }
    shadowy(g); g.position.set(x, T.heightAt(x, z), z); g.rotation.y = R() * 6; game.S.add(g); solid(game, x, T.heightAt(x, z), z, 0, 1.6, 1.4, 1.2);
  }
}

function buildStadium(game, R) {
  const tr = game.track, T = game.terrain, scene = game.scene, M = mats();
  const [x0, z0, x1, z1] = tr.bbox, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, ex = (x1 - x0) / 2 + 30, ez = (z1 - z0) / 2 + 30;
  // grandstands on all four sides, facing the infield
  for (const [x, z, len, yaw] of [[cx, cz - ez, (x1 - x0) + 30, 0], [cx, cz + ez, (x1 - x0) + 30, Math.PI], [cx - ex, cz, (z1 - z0) + 20, Math.PI / 2], [cx + ex, cz, (z1 - z0) + 20, -Math.PI / 2]]) {
    const g = grandstand(len, 12); g.position.set(x, T.heightAt(x, z) - 0.3, z); g.rotation.y = yaw; game.S.add(g);
  }
  // concrete retaining wall inside the stands (fixed colliders)
  const wallM = M.concrete;
  for (const [x, z, w, d] of [[cx, cz - ez + 3, (x1 - x0) + 40, 0.6], [cx, cz + ez - 3, (x1 - x0) + 40, 0.6], [cx - ex + 3, cz, 0.6, (z1 - z0) + 40], [cx + ex - 3, cz, 0.6, (z1 - z0) + 40]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 1.4, d), wallM); m.position.set(x, T.heightAt(x, z) + 0.7, z); m.castShadow = m.receiveShadow = true; game.S.add(m); solid(game, x, T.heightAt(x, z), z, 0, w / 2, 0.7, d / 2);
  }
  // floodlight towers at the corners with real spot lights
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const x = cx + sx * (ex + 6), z = cz + sz * (ez + 6), y = T.heightAt(x, z);
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 34, 8).translate(0, 17, 0), M.steel); tower.position.set(x, y, z); tower.castShadow = true; game.S.add(tower);
    const head = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 0.6), M.lamp); head.position.set(x, y + 34, z); head.lookAt(cx, 0, cz); game.S.add(head);
    const sp = new THREE.SpotLight(0xfff1dc, 1100, 320, 0.62, 0.55, 1.35); sp.position.set(x, y + 34, z); sp.target.position.set(cx - sx * 20, 0, cz - sz * 15); game.S.add(sp); game.S.add(sp.target);
  }
  // wreck pile and tyre mountains in the infield lobes
}

function buildArena(game, R) {
  const tr = game.track, s = game.scene, T = game.terrain, M = mats();
  const wallMat = pbr('concrete_floor_worn_001', { color: 0xb8b0a0, repeat: [20, 1] });
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(tr.R + 10.5, tr.R + 10.5, 3, 96, 1, true), wallMat); wall.position.set(T.cx, 7.6, T.cz); wall.material.side = THREE.DoubleSide; wall.receiveShadow = true; game.S.add(wall);
  // sponsor boards on the inner ring
  for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2, r = tr.R + 6; const b = new THREE.Mesh(bannerGeo(9, 1.4, k % 8), bannerMat()); const x = T.cx + Math.cos(a) * r, z = T.cz + Math.sin(a) * r; b.position.set(x, T.heightAt(x, z) + 1.2, z); b.lookAt(T.cx, b.position.y, T.cz); game.S.add(b); }
  // grandstands around the bowl
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + 0.26, r = tr.R + 26; const g = grandstand(34, 10); const x = T.cx + Math.cos(a) * r, z = T.cz + Math.sin(a) * r; g.position.set(x, T.heightAt(x, z) - 0.5, z); g.rotation.y = Math.atan2(T.cx - x, T.cz - z); game.S.add(g); }
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2; const x = T.cx + Math.cos(a) * (tr.R + 16), z = T.cz + Math.sin(a) * (tr.R + 16);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 26, 8), M.steel); m.position.set(x, T.heightAt(x, z) + 13, z); m.castShadow = true; game.S.add(m);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(3, 1.4, 0.6), M.lamp); lamp.position.set(x, m.position.y + 13.5, z); lamp.lookAt(T.cx, 0, T.cz); game.S.add(lamp);
    if (game.venue.sky === 'night' && k % 2 === 0) { const sp = new THREE.SpotLight(0xfff1dc, 900, 220, 0.75, 0.6, 1.3); sp.position.copy(lamp.position); sp.target.position.set(T.cx - Math.cos(a) * 12, 0, T.cz - Math.sin(a) * 12); game.S.add(sp); game.S.add(sp.target); }
  }
  // heap of scrapped cars on the central mound
  if (tr.island) {
    const cols = ['#5b2a1e', '#2b3a4a', '#4a4a3a', '#3a2a2a'];
    for (let k = 0; k < 7; k++) { const a = (k / 7) * 6.28 + 0.3, r = k < 6 ? 1.6 : 0; const c = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.1, 1.7), M.corr(cols[k % 4])); const x = T.cx + Math.cos(a) * r, z = T.cz + Math.sin(a) * r; c.position.set(x, T.heightAt(x, z) + 0.5 + (k === 6 ? 1.1 : 0), z); c.rotation.set((R() - 0.5) * 0.4, a, (R() - 0.5) * 0.5); c.castShadow = true; game.S.add(c); }
    solid(game, T.cx, T.heightAt(T.cx, T.cz) - 0.3, T.cz, 0, 0, 1.4, 0, 3.2);
  }
}

// ------------------------------------------------------------------ scorch marks (persistent)
let _scorchMat = null;
export function buildScorch(game, x, z, r = 3.2) {
  const T = game.terrain;
  if (!_scorchMat) {
    const t = canvasTex(128, 128, (g) => { const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62); gr.addColorStop(0, 'rgba(8,6,5,0.95)'); gr.addColorStop(0.45, 'rgba(14,11,9,0.8)'); gr.addColorStop(1, 'rgba(20,16,12,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); for (let i = 0; i < 26; i++) { const a = Math.random() * 6.28, l = 30 + Math.random() * 30; g.strokeStyle = 'rgba(10,8,6,0.5)'; g.lineWidth = 2 + Math.random() * 4; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + Math.cos(a) * l, 64 + Math.sin(a) * l); g.stroke(); } });
    _scorchMat = new THREE.MeshStandardMaterial({ map: t, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -5 });
  }
  const g = new THREE.CircleGeometry(r, 16); g.rotateX(-Math.PI / 2); g.rotateY(Math.random() * 6.28);
  const P = g.attributes.position; for (let i = 0; i < P.count; i++) P.setY(i, T.heightAt(P.getX(i) + x, P.getZ(i) + z) + 0.05);
  const m = new THREE.Mesh(g, _scorchMat); m.position.set(x, 0, z); m.receiveShadow = true; m.renderOrder = 1; game.scene.add(m);
  (game.scorches ||= []).push(m); if (game.scorches.length > 24) { const o = game.scorches.shift(); game.scene.remove(o); o.geometry.dispose(); }
}

// ------------------------------------------------------------------ port
const CONT_COLS = ['#a33a2a', '#1f5f99', '#2e7d4f', '#c97f16', '#6b6f73', '#b8b2a0'];
function buildPort(game, R) {
  const tr = game.track, T = game.terrain, M = mats(), hw = tr.width / 2, [x0, , x1, z1] = tr.bbox;
  const quayZ = z1 + 34;
  // container walls lining the quays: instanced per colour, one fixed collider per stack
  const lists = CONT_COLS.map(() => []);
  const near = (x, z, minD, iSkip) => { for (let k = 0; k < tr.N; k += 2) { if (Math.min(Math.abs(k - iSkip), tr.N - Math.abs(k - iSkip)) < 14) continue; const q = tr.pts[k]; if ((q.x - x) ** 2 + (q.z - z) ** 2 < minD * minD) return true; } return false; };
  for (let i = 0; i < tr.N; i += 3) {
    const p = tr.pts[i]; if (Math.abs(p.k) > 1 / 110) continue;
    if (game.near(tr.jumps, i, 45) || i < 14 || i > tr.N - 10) continue;
    if (game.water.streams.some((s) => Math.hypot(s.x - p.x, s.z - p.z) < 30)) continue;
    if (Math.floor(i / 21) % 3 === 2) continue; // gaps between the blocks
    for (const sd of [1, -1]) {
      if (R() < 0.18) continue;
      const off = hw + 4.8 + R() * 0.6, x = p.x - Math.sin(p.h) * sd * off, z = p.z + Math.cos(p.h) * sd * off;
      if (z > quayZ - 6 || near(x, z, hw + 6, i)) continue;
      const n = 1 + Math.floor(R() * 3), y = T.heightAt(x, z), yaw = -p.h;
      for (let k = 0; k < n; k++) lists[Math.floor(R() * CONT_COLS.length)].push([x + (R() - 0.5) * 0.3, y + 1.3 + k * 2.6, z, yaw + (R() - 0.5) * 0.06]);
      solid(game, x, y, z, yaw, 3.05, 1.3 * n, 1.22);
      game.blockers.push([x, z, 5]);
    }
  }
  const cg = new THREE.BoxGeometry(6.1, 2.6, 2.44), d = new THREE.Object3D();
  lists.forEach((L, ci) => { if (!L.length) return; const inst = new THREE.InstancedMesh(cg, M.corr(CONT_COLS[ci]), L.length); L.forEach(([x, y, z, yaw], i) => { d.position.set(x, y, z); d.rotation.set(0, yaw, 0); d.updateMatrix(); inst.setMatrixAt(i, d.matrix); }); inst.castShadow = inst.receiveShadow = true; game.scene.add(inst); });
  // the sea beyond the quay, a concrete edge with bollards and a low kerb
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(2600, 900).rotateX(-Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: 0x11262c, roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 0.9 }));
  sea.position.set(T.cx, -1.6, quayZ + 450); sea.receiveShadow = true; game.scene.add(sea);
  const qlen = T.sx;
  const edge = new THREE.Mesh(new THREE.BoxGeometry(qlen, 4.4, 1.2), M.concrete); edge.position.set(T.cx, -2.0, quayZ + 0.4); edge.receiveShadow = true; game.S.add(edge);
  const kerb = new THREE.Mesh(new THREE.BoxGeometry(qlen, 0.5, 0.5), new THREE.MeshStandardMaterial({ color: 0xd8c23a, roughness: 0.7 })); kerb.position.set(T.cx, T.heightAt(T.cx, quayZ - 1) + 0.25, quayZ - 0.6); game.S.add(kerb);
  solid(game, T.cx, T.heightAt(T.cx, quayZ - 1) - 0.5, quayZ - 0.6, 0, qlen / 2, 1.0, 0.3);
  for (let x = T.cx - qlen / 2 + 6; x < T.cx + qlen / 2; x += 14) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.35, 0.7, 10), M.dark); b.position.set(x, T.heightAt(x, quayZ - 1.6) + 0.35, quayZ - 1.6); b.castShadow = true; game.S.add(b); }
  // moored cargo ship
  const ship = new THREE.Group(), hullM = new THREE.MeshStandardMaterial({ color: 0x2a2f36, roughness: 0.6, metalness: 0.4 }), redM = new THREE.MeshStandardMaterial({ color: 0x8e2418, roughness: 0.7 });
  const hull = new THREE.Mesh(new THREE.BoxGeometry(150, 9, 24), hullM); hull.position.y = 2.5; ship.add(hull);
  const bottom = new THREE.Mesh(new THREE.BoxGeometry(150, 3, 23.6), redM); bottom.position.y = -2.4; ship.add(bottom);
  const bow = new THREE.Mesh(new THREE.CylinderGeometry(12, 12, 9, 3, 1, false, 0, Math.PI).rotateY(-Math.PI / 2), hullM); bow.scale.set(1.8, 1, 1); bow.position.set(75, 2.5, 0); ship.add(bow);
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(14, 14, 20), M.white); bridge.position.set(-60, 14, 0); ship.add(bridge);
  const stack = new THREE.Mesh(new THREE.BoxGeometry(5, 8, 5), redM); stack.position.set(-68, 25, 0); ship.add(stack);
  for (let k = 0; k < 9; k++) for (let j = 0; j < 3; j++) for (let l = 0; l < 1 + ((k * 7 + j) % 3); l++) { const c = new THREE.Mesh(new THREE.BoxGeometry(12.2, 2.6, 2.44), M.corr(CONT_COLS[(k * 3 + j + l) % CONT_COLS.length])); c.position.set(-40 + k * 12.6, 8.3 + l * 2.6, -7 + j * 7); ship.add(c); }
  shadowy(ship); ship.position.set(T.cx + 40, -1.2, quayZ + 26); game.S.add(ship);
  // portal cranes along the quay
  const craneM = new THREE.MeshStandardMaterial({ color: 0xc8361e, roughness: 0.55, metalness: 0.35 }), whiteM = M.white;
  for (let n = 0; n < 3; n++) {
    const x = x0 + (x1 - x0) * (0.2 + n * 0.3), z = quayZ - 9, y = T.heightAt(x, z);
    const c = new THREE.Group();
    for (const [lx, lz] of [[-7, -5], [7, -5], [-7, 5], [7, 5]]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(1.1, 26, 1.1), (lx + lz) % 2 ? craneM : craneM); leg.position.set(lx, 13, lz); c.add(leg); }
    for (const lx of [-7, 7]) { const br = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 11), whiteM); br.position.set(lx, 12, 0); c.add(br); }
    const boom = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.4, 78), craneM); boom.position.set(0, 27.5, 18); c.add(boom);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.6, 3.4), whiteM); cab.position.set(0, 25, 6 + n * 7); c.add(cab);
    const mast = new THREE.Mesh(new THREE.BoxGeometry(1.4, 12, 1.4), craneM); mast.position.set(0, 34, -4); c.add(mast);
    for (const s of [-1, 1]) { const st = tube2(new THREE.Vector3(0, 40, -4), new THREE.Vector3(0, 28.5, s > 0 ? 50 : -18), 0.12, M.steel); c.add(st); }
    shadowy(c); c.position.set(x, y, z); game.S.add(c);
    for (const [lx, lz] of [[-7, -5], [7, -5], [-7, 5], [7, 5]]) solid(game, x + lx, y, z + lz, 0, 0.6, 3, 0.6);
    game.blockers.push([x, z, 12]);
  }
}
function tube2(a, b, r, m) { const d = new THREE.Vector3().subVectors(b, a); const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 6), m); o.position.copy(a).addScaledVector(d, 0.5); o.quaternion.setFromUnitVectors(UP, d.normalize()); return o; }

// ------------------------------------------------------------------ stunt ramp
function buildStunt(game, R) {
  const tr = game.track, T = game.terrain, M = mats(), lip = tr.lipX;
  // kicker: circular arc ending at 24 deg, built from convex segments (physics) and a skinned mesh
  const K = 17, A = 24 * Math.PI / 180, Rr = K / Math.sin(A), halfW = 7, seg = 10;
  const prof = []; for (let i = 0; i <= seg; i++) { const a = (A * i) / seg; prof.push([lip - K + Rr * Math.sin(a), Rr * (1 - Math.cos(a))]); }
  game.kickerH = prof[seg][1];
  for (let i = 0; i < seg; i++) {
    const [xa, ya] = prof[i], [xb, yb] = prof[i + 1], pts = [];
    for (const z of [-halfW, halfW]) pts.push(xa, ya, z, xb, yb, z, xa, -1.6, z, xb, -1.6, z);
    const body = game.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const col = game.world.createCollider(RAPIER.ColliderDesc.convexHull(new Float32Array(pts)).setFriction(1.0), body);
    if (col) game.handles.set(col.handle, { kind: 'ground' });
  }
  const chevron = canvasTex(256, 256, (g, W, H) => { g.fillStyle = '#1a1a1a'; g.fillRect(0, 0, W, H); g.fillStyle = '#ffd400'; for (let k = -2; k < 6; k++) { g.beginPath(); g.moveTo(0, k * 64); g.lineTo(W / 2, k * 64 + 64); g.lineTo(W, k * 64); g.lineTo(W, k * 64 + 28); g.lineTo(W / 2, k * 64 + 92); g.lineTo(0, k * 64 + 28); g.closePath(); g.fill(); } }, [3, 2]);
  const topM = new THREE.MeshStandardMaterial({ map: chevron, roughness: 0.75, metalness: 0.2 });
  const pos = [], uv = [], idx = [];
  prof.forEach(([x, y], i) => { for (const z of [-halfW, halfW]) { pos.push(x, y + 0.02, z); uv.push(z / (2 * halfW) + 0.5, i / seg); } if (i) { const b = (i - 1) * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); } });
  const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); tg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); tg.setIndex(idx); tg.computeVertexNormals();
  if (tg.attributes.normal.getY(0) < 0) { tg.index.array.reverse(); tg.computeVertexNormals(); }
  const top = new THREE.Mesh(tg, topM); top.receiveShadow = true; top.castShadow = true; game.scene.add(top);
  // side cheeks and the front face (steel)
  for (const z of [-halfW, halfW]) { const sh = new THREE.Shape(); sh.moveTo(prof[0][0], -1.6); prof.forEach(([x, y]) => sh.lineTo(x, y)); sh.lineTo(lip, -1.6); sh.closePath(); const g = new THREE.ShapeGeometry(sh); const m = new THREE.Mesh(g, M.corr('#7d8a8f')); m.material.side = THREE.DoubleSide; m.position.z = z; m.castShadow = true; game.S.add(m); }
  const face = new THREE.Mesh(new THREE.BoxGeometry(0.3, game.kickerH + 1.6, halfW * 2), M.corr('#6a6f72')); face.position.set(lip + 0.15, (game.kickerH - 1.6) / 2, 0); game.S.add(face);
  // distance lines across the landing slope, medal lines and signboards
  const tg2 = game.o.targets || [60, 80, 95], medalC = ['#c9803f', '#d9dee6', '#ffcf3a'];
  const lineM = new THREE.MeshBasicMaterial({ color: 0xf4f1e8, transparent: true, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -4, depthWrite: false });
  const strip = (x, w, mat) => { const g = new THREE.PlaneGeometry(w, 28, 1, 8); g.rotateX(-Math.PI / 2); const P = g.attributes.position; for (let i = 0; i < P.count; i++) P.setY(i, T.heightAt(x + P.getX(i), P.getZ(i)) + 0.06); const m = new THREE.Mesh(g, mat); m.position.x = x; game.scene.add(m); };
  const nums = canvasTex(1024, 256, (g, W, H) => { g.fillStyle = '#111'; g.fillRect(0, 0, W, H); g.font = 'italic 900 58px "Exo 2", Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; for (let i = 0; i < 16; i++) { const cx = (i % 8) * 128 + 64, cy = Math.floor(i / 8) * 128 + 64; g.fillStyle = '#ffd400'; g.fillText(String((i + 1) * 10), cx, cy); } });
  for (let d = 10; d <= 160; d += 10) {
    const x = lip + d; strip(x, 0.35, lineM);
    for (const z of [-17.5, 17.5]) {
      const i = d / 10 - 1, g = new THREE.PlaneGeometry(2.6, 1.3); const u0 = (i % 8) / 8, v0 = 1 - (Math.floor(i / 8) + 1) / 2; const uvA = g.attributes.uv; for (let k = 0; k < uvA.count; k++) uvA.setXY(k, u0 + uvA.getX(k) / 8, v0 + uvA.getY(k) / 2);
      const b = new THREE.Mesh(g, (M.numM ||= new THREE.MeshStandardMaterial({ map: nums, roughness: 0.6, side: THREE.DoubleSide }))); b.position.set(x, T.heightAt(x, z) + 1.6, z); b.rotation.y = z > 0 ? Math.PI : 0; game.S.add(b);
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.2, 0.12), M.steel); post.position.set(x, T.heightAt(x, z) + 0.5, z); game.S.add(post);
    }
  }
  tg2.forEach((d, k) => {
    strip(lip + d, 0.8, new THREE.MeshBasicMaterial({ color: medalC[k], transparent: true, opacity: 0.9, polygonOffset: true, polygonOffsetFactor: -4, depthWrite: false }));
    for (const z of [-15.5, 15.5]) { const x = lip + d, y = T.heightAt(x, z); const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 4, 6), M.steel); pole.position.set(x, y + 2, z); game.S.add(pole); const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.9), new THREE.MeshStandardMaterial({ color: medalC[k], roughness: 0.6, side: THREE.DoubleSide, emissive: medalC[k], emissiveIntensity: 0.15 })); flag.position.set(x + 0.7, y + 3.5, z); game.S.add(flag); }
  });
  // stands along the landing slope and banners along the run-in
  for (const [x, z] of [[lip + 40, -36], [lip + 95, -36], [lip + 40, 36], [lip + 95, 36], [lip - 30, -34]]) { const g = grandstand(36, 9); g.position.set(x, T.heightAt(x, z) - 0.3, z); g.rotation.y = z > 0 ? Math.PI : 0; game.S.add(g); game.blockers.push([x, z, 24]); }
  for (let x = tr.bbox[0] + 30, i = 0; x < lip - 20; x += 24, i++) for (const z of [-18, 18]) { const b = banner((i + (z > 0 ? 3 : 0)) % 8); b.position.set(x, T.heightAt(x, z) - 0.1, z); b.rotation.y = z > 0 ? Math.PI : 0; game.S.add(b); }
  // a big inflatable-style arch over the lip
  const archM = new THREE.MeshStandardMaterial({ color: 0xe10600, roughness: 0.5 });
  const arch = new THREE.Mesh(new THREE.TorusGeometry(10, 0.7, 10, 32, Math.PI), archM); arch.position.set(lip - K - 4, 0, 0); arch.rotation.y = Math.PI / 2; arch.castShadow = true; game.S.add(arch);
}

// ------------------------------------------------------------------ trees
export function buildTrees(game) {
  const T = game.terrain, tr = game.track, v = game.venue;
  const pool = v.ground === 'rock' ? vegOfKind(['broad', 'bush', 'desert']) : vegOfKind(['conifer', 'broad', 'bush']);
  if (!pool.length) return;
  const items = []; const target = Math.round((v.forest ? 2600 : v.stadium ? 500 : v.farm ? 1100 : 1400) * (game.low ? 0.4 : 1));
  const bl = game.blockers || [];
  const clear = (x, z) => {
    if (tr.arena) return Math.hypot(x - T.cx, z - T.cz) > tr.R + 44;
    if (v.stadium) { const [x0, z0, x1, z1] = tr.bbox; if (x > x0 - 190 && x < x1 + 190 && z > z0 - 190 && z < z1 + 190) return false; }
    for (let i = 0; i < tr.N; i += 3) { const p = tr.pts[i]; if ((p.x - x) ** 2 + (p.z - z) ** 2 < (tr.width / 2 + 16) ** 2) return false; }
    for (const [bx, bz, br] of bl) if ((bx - x) ** 2 + (bz - z) ** 2 < br * br) return false;
    if (T.waterAt(x, z) > 0.05) return false;
    return true;
  };
  let guard = 0;
  while (items.length < target && guard++ < target * 5) {
    const cx = T.cx + (Math.random() - 0.5) * T.sx * 0.94, cz = T.cz + (Math.random() - 0.5) * T.sz * 0.94;
    const n = 3 + Math.floor(Math.random() * 8);
    for (let q = 0; q < n; q++) {
      const x = cx + (Math.random() - 0.5) * 30, z = cz + (Math.random() - 0.5) * 30; if (!clear(x, z)) continue;
      const meta = pool[Math.floor(Math.random() * pool.length)];
      const h = { conifer: 11 + Math.random() * 9, broad: 6 + Math.random() * 5, bush: 1.8 + Math.random() * 1.5, desert: 4 + Math.random() * 3 }[meta.kind] || 6;
      const t = 0.82 + Math.random() * 0.25;
      items.push({ x, y: T.heightAt(x, z) - 0.2, z, h, meta, rot: Math.random() * 6.28, tint: [t, t, t * 0.95] });
    }
  }
  game.scene.add(makeTreeShadows(items));
  const f = makeForest(items); if (v.sky === 'night') f.material.uniforms.light.value = 0.4; game.scene.add(f);
}
