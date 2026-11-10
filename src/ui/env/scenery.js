// Environment dressing for the 3D race view: mid-distance terrain relief, coast and water,
// painted track details, trackside life (campsites, car parks, big screens, marshals), rally
// stage props. Everything is merged or instanced: each builder adds a handful of draw calls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { pbr } from '../gfx.js';

const sm = (a, b, t) => { const u = Math.max(0, Math.min(1, (t - a) / (b - a))); return u * u * (3 - 2 * u); };
const rnd = (a, b) => a + Math.random() * (b - a);
// vertex-coloured part for merged prop geometries
function part(g, hex) {
  g = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal'].includes(k)) g.deleteAttribute(k);
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
}
// white vertices take the instance colour, the others keep their own
function tintWhite(mat, key) {
  mat.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <color_vertex>', `vColor = vec3(1.0);
    #ifdef USE_COLOR
      vColor = color.rgb;
    #endif
    #ifdef USE_INSTANCING_COLOR
      if (color.r > 0.99 && color.g > 0.99 && color.b > 0.99) vColor = instanceColor.rgb;
    #endif`); };
  mat.customProgramCacheKey = () => 'envtint' + key; return mat;
}
function instanced(scene, geo, mat, list, { shadow = true, colors = null } = {}) {
  if (!list.length) return null;
  const im = new THREE.InstancedMesh(geo, mat, list.length), c = new THREE.Color();
  list.forEach((m, k) => { im.setMatrixAt(k, m); if (colors) im.setColorAt(k, c.set(colors[k])); });
  im.castShadow = shadow; im.receiveShadow = true; im.computeBoundingSphere(); scene.add(im); return im;
}
// spatial hash of the track samples: distance from any point to the nearest sample
function trackField(geo, filter = null, cell = 90) {
  const m = new Map(), { N, x, y } = geo;
  for (let i = 0; i < N; i += 2) { if (filter && !filter(i)) continue; const k = Math.floor(x[i] / cell) + ',' + Math.floor(y[i] / cell); let l = m.get(k); if (!l) m.set(k, l = []); l.push(i); }
  return (px, pz, R = 3) => {
    const cx = Math.floor(px / cell), cz = Math.floor(pz / cell); let b = (R * cell) ** 2, bi = -1;
    for (let a = -R; a <= R; a++) for (let c = -R; c <= R; c++) { const l = m.get((cx + a) + ',' + (cz + c)); if (l) for (const i of l) { const d = (x[i] - px) ** 2 + (y[i] - pz) ** 2; if (d < b) { b = d; bi = i; } } }
    return [Math.sqrt(b), bi];
  };
}
const inObs = (r3, px, pz, m) => (r3.obstacles || []).some((o) => { const ex = px - o.x, ez = pz - o.z; if (!o.hl) return ex * ex + ez * ez < (o.r + m) ** 2; const c = Math.cos(o.rot), s = Math.sin(o.rot); return Math.abs(ex * c - ez * s) < o.hl + m && Math.abs(ex * s + ez * c) < o.hd + m; });
// true when a prop of radius rad at (px,pz) would stand between a TV camera and the track it films
function sightBlocked(r3, px, pz, rad) {
  const N = r3.geo.N;
  r3._envSight ||= (r3.tvCams || []).flatMap((c) => [0, -15, -30].map((d) => { const j = (c.i + d + N) % N; return [c.pos.x, c.pos.z, r3.geo.x[j], r3.geo.y[j]]; }));
  return r3._envSight.some(([x0, z0, x1, z1]) => { const dx = x1 - x0, dz = z1 - z0, L2 = dx * dx + dz * dz || 1; const t = Math.max(-0.3, Math.min(1, ((px - x0) * dx + (pz - z0) * dz) / L2)); return (px - x0 - dx * t) ** 2 + (pz - z0 - dz * t) ** 2 < (rad + 5) ** 2; });
}

// ---------------------------------------------------------------- coast, water, backdrop
// The sea is a half-plane beyond a straight coast line on the biome's sea bearing. Sets
// r3.seaMask(x,z) and r3.coastK(x,z) (1 inland -> 0 at the shore; hills and relief fade with it).
export function buildCoast(r3, biome, street) {
  const [x0, y0, x1, y1] = r3.geo.bbox, cx = (x0 + x1) / 2, cz = (y0 + y1) / 2;
  if (biome.cone && !r3.low) {
    // lone volcano on the horizon: snow cap, blue-grey flanks fading into the haze
    const a = biome.cone.a * Math.PI / 180, H = biome.cone.h, g = new THREE.ConeGeometry(H * 1.9, H, 48, 12, true).translate(0, H / 2, 0);
    const p = g.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
    for (let i = 0; i < p.count; i++) { const t = p.getY(i) / H, w = 0.5 + 0.5 * Math.sin(Math.atan2(p.getZ(i), p.getX(i)) * 9); if (t > 0.8) { const k = (1 - t) / 0.2 * H * 1.9 * 0.45; p.setX(i, p.getX(i) * 0.55 + Math.sign(p.getX(i)) * k * 0.05); p.setZ(i, p.getZ(i) * 0.55); } c.setHex(t > 0.62 + w * 0.1 ? 0xf4f6fa : 0x59677c); col.set([c.r, c.g, c.b], i * 3); }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 })); m.position.set(cx + Math.cos(a) * 5200, -40, cz + Math.sin(a) * 5200); r3.scene.add(m);
  }
  if (!biome.sea) return;
  const a = biome.sea.a * Math.PI / 180, dx = Math.cos(a), dz = Math.sin(a);
  let D = -1e9; const { N, x, y } = r3.geo;
  for (let i = 0; i < N; i++) D = Math.max(D, (x[i] - cx) * dx + (y[i] - cz) * dz);
  D += street > 0.7 ? 70 : 150;
  const proj = (px, pz) => (px - cx) * dx + (pz - cz) * dz, latOf = (px, pz) => -(px - cx) * dz + (pz - cz) * dx;
  // natural coastline: bays and headlands only ever push the shore out to sea (never towards
  // the circuit); harbour fronts (street circuits) stay straighter
  const ph = [Math.random() * 6.283, Math.random() * 6.283, Math.random() * 6.283], ampK = street > 0.7 ? 0.25 : 1;
  const bay = (l) => ampK * (110 * (1 + Math.sin(l / 520 + ph[0])) + 45 * (1 + Math.sin(l / 190 + ph[1])) + 14 * (1 + Math.sin(l / 61 + ph[2])));
  const shoreAt = (px, pz) => D + bay(latOf(px, pz));
  r3.seaMask = (px, pz) => proj(px, pz) > shoreAt(px, pz) - 14;
  r3.coastK = (px, pz) => sm(0, 1, (shoreAt(px, pz) - 30 - proj(px, pz)) / 260);
  // strip between (shore + d0) and (shore + d1) along the curved coast, built in (along, lateral) space
  const quad = (d0, d1, yy, mat, half = 9000) => {
    const nl = r3.low ? 160 : 420, na = Math.max(1, Math.min(24, Math.round((d1 - d0) / 300)));
    const pos = [], idx = [];
    for (let j = 0; j <= nl; j++) {
      const l = -half + (2 * half * j) / nl, s0 = D + bay(l);
      for (let i = 0; i <= na; i++) { const t = i / na, ex = d1 > 2000 ? d1 : s0 + d1, al = (s0 + d0) + (ex - (s0 + d0)) * (t * t); pos.push(cx + dx * al - dz * l, yy, cz + dz * al + dx * l); }
      if (j < nl) for (let i = 0; i < na; i++) { const k = j * (na + 1) + i; idx.push(k, k + 1, k + na + 1, k + 1, k + na + 2, k + na + 1); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    if (g.attributes.normal.getY(0) < 0) { const ia = g.index.array; for (let k = 0; k < ia.length; k += 3) { const t = ia[k]; ia[k] = ia[k + 1]; ia[k + 1] = t; } g.computeVertexNormals(); }
    const m = new THREE.Mesh(g, mat); m.receiveShadow = true; r3.scene.add(m); return m;
  };
  const night = r3.night;
  const water = new THREE.MeshStandardMaterial({ color: night ? 0x0a1420 : 0x1f5672, roughness: 0.16, metalness: 0.25, envMapIntensity: 1.3 });
  if (!r3.low) {
    // rippled reflections: two scrolling layers of procedural normal noise in world space
    water.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;').replace('#include <project_vertex>', '#include <project_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        varying vec3 vWp;
        float wh(vec2 p) { p = fract(p * vec2(127.1, 311.7)); p += dot(p, p + 19.19); return fract(p.x * p.y); }
        float wn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(wh(i), wh(i + vec2(1, 0)), f.x), mix(wh(i + vec2(0, 1)), wh(i + vec2(1, 1)), f.x), f.y); }`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          { vec2 p = vWp.xz; float e = 0.6; float dd = length(vWp - cameraPosition); float k = 0.5 / (1.0 + dd * 0.004);
            float h0 = wn(p * 0.35) + 0.5 * wn(p * 0.9 + 7.0), hx = wn((p + vec2(e, 0.0)) * 0.35) + 0.5 * wn((p + vec2(e, 0.0)) * 0.9 + 7.0), hz = wn((p + vec2(0.0, e)) * 0.35) + 0.5 * wn((p + vec2(0.0, e)) * 0.9 + 7.0);
            vec3 wnrm = normalize(vec3((h0 - hx) * k, 0.3, (h0 - hz) * k));
            normal = normalize(mix(normal, (viewMatrix * vec4(wnrm, 0.0)).xyz, 0.85));
            diffuseColor.rgb *= 0.8 + 0.4 * wn(p * 0.02); }`)
        // far water: rougher so the sub-pixel ripples do not sparkle / alias
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.42, smoothstep(250.0, 2500.0, length(vWp - cameraPosition)));');
    };
    water.customProgramCacheKey = () => 'envwater';
  }
  quad(0, 9000, -0.12, water);
  // shore: quay (street circuits) or beach
  const shore = new THREE.MeshStandardMaterial({ color: street > 0.7 ? 0x9a9690 : 0xd9c9a0, roughness: 0.95 });
  quad(street > 0.7 ? -16 : -30, 1, -0.05, shore);
  if (street > 0.7) quad(-1.2, 0.2, -0.03, new THREE.MeshStandardMaterial({ color: 0xc9c4ba, roughness: 0.9 })); // quay edge stones
  // boats: moored yachts near the shore, a few further out
  const hull = [part(new THREE.BoxGeometry(1, 0.22, 0.26).translate(0, 0.08, 0), '#ffffff'), part(new THREE.BoxGeometry(0.42, 0.14, 0.2).translate(-0.08, 0.26, 0), '#eef1f4'), part(new THREE.BoxGeometry(0.4, 0.05, 0.19).translate(-0.08, 0.3, 0), '#27323f'), part(new THREE.BoxGeometry(0.2, 0.1, 0.14).translate(-0.12, 0.38, 0), '#f4f4f4')];
  const bg = mergeGeometries(hull); const list = [], cols = []; const d = new THREE.Object3D();
  const nb = Math.round((street > 0.7 ? 150 : 50) * (r3.low ? 0.3 : 1));
  for (let k = 0; k < nb; k++) {
    const far = Math.random() < 0.25, off = far ? rnd(200, 1200) : rnd(8, 150), lat = (Math.random() - 0.5) * (far ? 3600 : 1700), L = far ? rnd(16, 45) : rnd(10, 38);
    const so = bay(lat); d.position.set(cx + dx * (D + so + off) - dz * lat, -0.15, cz + dz * (D + so + off) + dx * lat); d.rotation.set(0, far ? Math.random() * 6.28 : -a + (Math.random() < 0.5 ? 0 : Math.PI) + rnd(-0.12, 0.12), 0); d.scale.set(L, L * 0.8, L * 0.85); d.updateMatrix();
    list.push(d.matrix.clone()); cols.push(['#ffffff', '#f2f2ee', '#1d2a3a', '#e9e4d8', '#ffffff'][k % 5]);
  }
  instanced(r3.scene, bg, tintWhite(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, ...(night ? { emissive: 0xffe2b0, emissiveIntensity: 0.25 } : {}) }), 'boat'), list, { colors: cols });
}

// ---------------------------------------------------------------- mid-distance relief
// Rolling ground, banks and mounds between the flat circuit corridor and the far hills.
// Sets r3.envH(x,z); flat (0) near the track, the pit straight / paddock and the shore.
export function buildMidTerrain(r3, mat, biome, uvOf) {
  const amp = biome.amp * (r3.low ? 0.8 : 1); if (!(amp > 0.5)) return;
  const g = r3.geo, [x0, y0, x1, y1] = g.bbox, [cx, cz] = r3.hillC, R0 = r3.hillR0, M = 430;
  const X0 = x0 - M, Z0 = y0 - M, EX = x1 - x0 + 2 * M, EZ = y1 - y0 + 2 * M;
  const cs = Math.max(13, Math.max(EX, EZ) / (r3.low ? 90 : 140)), nx = Math.ceil(EX / cs), nz = Math.ceil(EZ / cs);
  const dTrack = trackField(g), dPit = r3.inPitZone ? trackField(g, (i) => r3.inPitZone(i, 44)) : null;
  const ph = Array.from({ length: 8 }, () => Math.random() * 6.283);
  const H = new Float32Array((nx + 1) * (nz + 1));
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const px = X0 + i * cs, pz = Z0 + j * cs;
    const [dt] = dTrack(px, pz); let k = sm(58, 165, dt); if (k <= 0) continue;
    if (dPit) k *= sm(150, 300, dPit(px, pz, 4)[0]);
    k *= 1 - sm(R0 - 190, R0 - 40, Math.hypot(px - cx, pz - cz));
    if (r3.coastK) k *= r3.coastK(px, pz);
    for (const o of r3.obstacles || []) if (o.r > 10) k *= sm(o.r + 8, o.r + 70, Math.hypot(px - o.x, pz - o.z));
    if (k <= 0) continue;
    // domain-warped so the relief does not read as a regular egg-crate from the helicopter
    const wx = px + 90 * Math.sin(pz * 0.0041 + ph[6]) + 40 * Math.sin((px + pz) * 0.0093 + ph[3]), wz = pz + 90 * Math.sin(px * 0.0037 + ph[7]) + 40 * Math.sin((px - pz) * 0.0087 + ph[2]);
    const n = 0.62 * Math.sin(wx * 0.0105 + ph[0]) * Math.cos(wz * 0.0118 + ph[1]) + 0.42 * Math.sin((wx + wz) * 0.021 + ph[2]) * Math.sin((wx - wz) * 0.017 + ph[3]) + 0.16 * Math.sin(wx * 0.052 + ph[4]) * Math.sin(wz * 0.047 + ph[5]);
    H[j * (nx + 1) + i] = amp * k * (0.18 + Math.max(0, n + 0.4) ** 1.2);
  }
  r3.envH = (px, pz) => {
    const fx = (px - X0) / cs, fz = (pz - Z0) / cs; if (!(fx >= 0 && fz >= 0 && fx < nx && fz < nz)) return 0;
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, k = j * (nx + 1) + i;
    const h00 = H[k], h10 = H[k + 1], h01 = H[k + nx + 1], h11 = H[k + nx + 2];
    return u + v <= 1 ? h00 + u * (h10 - h00) + v * (h01 - h00) : h11 + (1 - u) * (h01 - h11) + (1 - v) * (h10 - h11);
  };
  const pos = new Float32Array(H.length * 3), uv = new Float32Array(H.length * 2), col = new Float32Array(H.length * 3), idx = [];
  const rough = new THREE.Color(biome.hillCol), c = new THREE.Color();
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const k = j * (nx + 1) + i, px = X0 + i * cs, pz = Z0 + j * cs, h = H[k];
    pos.set([px, h - 0.3, pz], k * 3); uv.set(uvOf(px, pz), k * 2);
    // rough, darker grass on the higher ground and in patches; mown-looking pale grass below
    const f = Math.min(1, h / (amp * 0.9)) * (0.35 + 0.3 * Math.sin(px * 0.031 + pz * 0.017 + ph[6])) + 0.12 * Math.max(0, Math.sin(px * 0.013 - pz * 0.021 + ph[7]));
    c.setRGB(1, 1, 1).lerp(rough, Math.max(0, Math.min(0.75, f))); col.set([c.r, c.g, c.b], k * 3);
    if (i < nx && j < nz && Math.max(h, H[k + 1], H[k + nx + 1], H[k + nx + 2]) > 0.02) idx.push(k, k + nx + 1, k + 1, k + 1, k + nx + 1, k + nx + 2);
  }
  if (!idx.length) return;
  const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); bg.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); bg.setAttribute('color', new THREE.BufferAttribute(col, 3)); bg.setIndex(idx); bg.computeVertexNormals();
  const m = new THREE.Mesh(bg, mat); m.receiveShadow = true; r3.scene.add(m);
}

// ---------------------------------------------------------------- painted track details
// One alpha-blended, vertex-coloured mesh: resurfacing patches and tar seams, grid slots, the
// chequered start line, drain grates, astroturf behind the inside kerbs.
export function buildDecals(r3, street) {
  const g = r3.geo, N = g.N, W = r3.TW, pos = [], col = [], idx = [];
  const quad = (pts, rgba, y) => { const b = pos.length / 3; for (const [px, py, pz] of pts) { pos.push(px, py + y, pz); col.push(...rgba); } idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); };
  // rectangle in track space: s (samples), lane (m), half-length (m), half-width (m)
  const rect = (s, lane, hl, hw, rgba, y = 0.052) => {
    const p = r3.pose(((s % N) + N) % N, lane), fx = Math.cos(p.h), fz = Math.sin(p.h), nx = -fz, nz = fx, yy = p.y || 0;
    quad([[p.x - fx * hl - nx * hw, yy, p.z - fz * hl - nz * hw], [p.x - fx * hl + nx * hw, yy, p.z - fz * hl + nz * hw], [p.x + fx * hl - nx * hw, yy, p.z + fz * hl - nz * hw], [p.x + fx * hl + nx * hw, yy, p.z + fz * hl + nz * hw]], rgba, y);
  };
  // strip following the track between lateral offsets a..b over samples i0..i1
  const strip = (i0, i1, a, b, rgba, y = 0.048, fade = 0) => {
    for (let q = i0; q < i1; q++) {
      const p0 = r3.pose(((q % N) + N) % N, 0), p1 = r3.pose((((q + 1) % N) + N) % N, 0);
      const n0x = -Math.sin(p0.h), n0z = Math.cos(p0.h), n1x = -Math.sin(p1.h), n1z = Math.cos(p1.h), bq = pos.length / 3;
      const al = (t) => rgba[3] * (fade ? Math.min(1, Math.min(t - i0, i1 - t) / fade) : 1);
      for (const [p, nx, nz, t] of [[p0, n0x, n0z, q], [p1, n1x, n1z, q + 1]]) for (const o of [a, b]) { pos.push(p.x + nx * o, (p.y || 0) + y, p.z + nz * o); col.push(rgba[0], rgba[1], rgba[2], al(t)); }
      idx.push(bq, bq + 1, bq + 2, bq + 1, bq + 3, bq + 2);
    }
  };
  const pit = (i) => r3.inPitZone?.(i, 8);
  // resurfacing: darker fresh tarmac and paler old patches, each outlined by tar seams
  const nP = Math.round(N / 55);
  for (let k = 0; k < nP; k++) {
    // lengths in metres (samples are 5 m apart): lane-width patches 6-30 m, the rare full-width
    // relay 8-18 m and fainter, so no long dark slab ever covers the whole track
    const full = Math.random() < 0.18, fresh = Math.random() < 0.6;
    const len = Math.max(1, Math.round((full ? rnd(8, 18) : rnd(6, 30)) / g.ds)), i0 = Math.floor(Math.random() * N);
    const a = full ? -W / 2 + 0.45 : Math.random() < 0.5 ? -W / 2 + 0.45 : rnd(-1.5, 1.5), b = full ? W / 2 - 0.45 : a < -W / 4 ? rnd(-1, 2.5) : W / 2 - 0.45;
    const tone = fresh ? [0.02, 0.02, 0.025, rnd(0.16, 0.3) * (full ? 0.6 : 1)] : [0.62, 0.61, 0.6, rnd(0.035, 0.07)];
    strip(i0, i0 + len, a, b, tone, 0.047);
    const seam = [0.015, 0.015, 0.018, 0.5];
    for (const o of [a, b]) if (Math.abs(o) < W / 2 - 0.6) strip(i0, i0 + len, o - 0.05, o + 0.05, seam, 0.049);
    rect(i0, (a + b) / 2, 0.07, (b - a) / 2, seam, 0.049); rect(i0 + len, (a + b) / 2, 0.07, (b - a) / 2, seam, 0.049);
  }
  // longitudinal paving joint, crack sealing squiggles across the lane
  strip(0, N, 0.22, 0.3, [0.02, 0.02, 0.02, 0.2], 0.047);
  for (let k = 0; k < N / 14; k++) { const s = Math.random() * N, ln = rnd(-W / 2 + 1, W / 2 - 1); const p = r3.pose(s, ln); const b0 = pos.length / 3, L = rnd(1.5, 5), a0 = p.h + rnd(0.9, 2.2); let px = p.x, pz = p.z; for (let q = 0; q <= 5; q++) { const aa = a0 + Math.sin(q * 1.7 + k) * 0.5, wx = -Math.sin(aa) * 0.035, wz = Math.cos(aa) * 0.035; pos.push(px - wx, (p.y || 0) + 0.049, pz - wz, px + wx, (p.y || 0) + 0.049, pz + wz); col.push(0.015, 0.015, 0.018, 0.55, 0.015, 0.015, 0.018, 0.55); if (q < 5) { const b = b0 + q * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); } px += Math.cos(aa) * L / 5; pz += Math.sin(aa) * L / 5; } }
  if (!r3.open) {
    // chequered start / finish line: two rows of squares
    const sq = W / 16;
    for (let r = 0; r < 2; r++) for (let c = 0; c < 16; c++) { const v = (r + c) % 2 ? 0.93 : 0.03; rect(0.02 + (r - 0.5) * sq / g.ds, -W / 2 + sq * (c + 0.5), sq / 2, sq / 2, [v, v, v, 1], 0.056); }
    for (const cn of g.corners) {
      const span = Math.min(30, Math.max(10, Math.round(cn.r / 12))), side = cn.dir > 0 ? 1 : -1;
      if (pit(cn.i - span) || pit(cn.i + span)) continue;
      // astroturf strip behind the inside kerb (permanent circuits), drain grates at the apex
      if (street <= 0.7) strip(cn.i - span + 2, cn.i + span - 2, side * (W / 2 + 1.36), side * (W / 2 + 2.5), [0.1, 0.36, 0.14, 1], 0.03, 2);
      for (const dq of [-span * 0.5, 0, span * 0.5]) rect(cn.i + dq, side * (W / 2 - 0.62), 0.45, 0.2, [0.05, 0.05, 0.055, 0.85], 0.05);
    }
  }
  if (!idx.length) return;
  const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); bg.setAttribute('color', new THREE.Float32BufferAttribute(col, 4)); bg.setIndex(idx); bg.computeVertexNormals();
  const m = new THREE.Mesh(bg, new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, depthWrite: false, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  m.receiveShadow = true; m.renderOrder = 2; r3.scene.add(m);
}

// ---------------------------------------------------------------- trackside life
let _pg = null;
function personLo() {
  if (_pg) return _pg;
  _pg = mergeGeometries([part(new THREE.BoxGeometry(0.3, 0.86, 0.2).translate(0, 0.43, 0), '#2b3445'), part(new THREE.BoxGeometry(0.46, 0.62, 0.24).translate(0, 1.17, 0), '#ffffff'), part(new THREE.BoxGeometry(0.2, 0.22, 0.2).translate(0, 1.6, 0), '#c99a7a')]);
  return _pg;
}
function carLo() {
  const s = new THREE.Shape(); s.moveTo(-2.1, 0.25); s.lineTo(2.1, 0.25); s.lineTo(2.1, 0.75); s.lineTo(1.2, 0.85); s.lineTo(0.55, 1.38); s.lineTo(-1.1, 1.38); s.lineTo(-1.75, 0.9); s.lineTo(-2.1, 0.85); s.lineTo(-2.1, 0.25);
  const body = part(new THREE.ExtrudeGeometry(s, { depth: 1.7, bevelEnabled: false }).translate(0, 0, -0.85), '#ffffff');
  const glass = part(new THREE.BoxGeometry(1.75, 0.4, 1.72).translate(-0.3, 1.13, 0), '#1c232b');
  const wheels = [-1.3, 1.3].map((x) => part(new THREE.BoxGeometry(0.62, 0.62, 1.78).translate(x, 0.31, 0), '#111214'));
  return mergeGeometries([body, glass, ...wheels]);
}
export function buildLife(r3, street, biome) {
  const g = r3.geo, N = g.N, W = r3.TW, low = r3.low, K = low ? 0.3 : 1, d = new THREE.Object3D(), scene = r3.scene;
  const envH = (x, z) => (r3.envH ? r3.envH(x, z) : 0), field = trackField(g);
  const free = (px, pz, rad, minTrack) => field(px, pz)[0] > minTrack && !r3.seaMask?.(px, pz) && !inObs(r3, px, pz, rad);
  const mAt = (x, y, z, ry, sx = 1, sy = sx, sz = sx) => { d.position.set(x, y, z); d.rotation.set(0, ry, 0); d.scale.set(sx, sy, sz); d.updateMatrix(); return d.matrix.clone(); };
  const carG = carLo(), carMat = tintWhite(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.3 }), 'car');
  const carCols = ['#e8e8e8', '#1c1d20', '#7d8288', '#2b3f66', '#8a1c1c', '#c9c2b0', '#3d4a3a', '#f1f1ee', '#5b6066', '#a8adb3', '#27548a', '#b9b3a6'];
  const cars = [], carC = [];
  // ---- marshals at their posts (orange overalls), intervention cars beside some of them
  const people = [], pc = [];
  const huts = (r3.obstacles || []).filter((o) => o.r === 2.5 && o.h === 3);
  huts.forEach((o, k) => {
    const [, i] = field(o.x, o.z); if (i < 0) return;
    const fx = Math.cos(g.hdg[i]), fz = Math.sin(g.hdg[i]), ry = Math.atan2(g.x[i] - o.x, g.y[i] - o.z);
    for (const s of [-1, 1]) { const px = o.x + fx * s * rnd(1.9, 2.6), pz = o.z + fz * s * rnd(1.9, 2.6); people.push(mAt(px, 0, pz, ry + rnd(-0.5, 0.5), rnd(0.95, 1.05))); pc.push(k % 5 === 2 ? '#f2f2f2' : '#f26a10'); }
    if (k % 3 === 0 && street <= 0.7) {
      const tx = (o.x - g.x[i]), tz = (o.z - g.y[i]), L = Math.hypot(tx, tz) || 1, px = o.x + fx * 7.5 + tx / L * 1.5, pz = o.z + fz * 7.5 + tz / L * 1.5;
      if (free(px, pz, 2.6, W / 2 + 6) && !sightBlocked(r3, px, pz, 2.5)) { cars.push(mAt(px, 0, pz, -g.hdg[i], k % 6 ? 1 : 1.25, k % 6 ? 1 : 1.5, k % 6 ? 1 : 1.2)); carC.push(k % 6 ? (k % 2 ? '#f4f4f4' : '#d81e1e') : '#f0b400'); r3.obstacles.push({ x: px, z: pz, r: 3, h: 0 }); }
    }
  });
  // ---- giant screens beside the corner grandstands
  {
    const scr = [], posts = []; let n = 0;
    for (const o of (r3.obstacles || []).filter((q) => q.hl === 16)) {
      if (n >= (low ? 2 : 5)) break;
      for (const s of [1, -1]) {
        const c = Math.cos(o.rot), sn = Math.sin(o.rot), px = o.x + c * s * 26, pz = o.z - sn * s * 26;
        if (!free(px, pz, 6, W / 2 + 9) || sightBlocked(r3, px, pz, 6)) continue;
        scr.push(mAt(px, 0, pz, o.rot)); posts.push(mAt(px, 0, pz, o.rot)); r3.obstacles.push({ x: px, z: pz, r: 6, h: 11 }); n++; break;
      }
    }
    if (scr.length) {
      const c = document.createElement('canvas'); c.width = 512; c.height = 288; const x = c.getContext('2d');
      const gr = x.createLinearGradient(0, 0, 0, 288); gr.addColorStop(0, '#31465c'); gr.addColorStop(0.55, '#55606a'); gr.addColorStop(0.56, '#2b2d31'); gr.addColorStop(1, '#3a3c40'); x.fillStyle = gr; x.fillRect(0, 0, 512, 288);
      x.fillStyle = '#d9d9d9'; x.fillRect(0, 196, 512, 5); x.fillStyle = '#c8141b'; for (let k = 0; k < 9; k++) x.fillRect(250 + k * 30, 236, 15, 9);
      x.fillStyle = '#e10600'; x.beginPath(); x.moveTo(250, 214); x.lineTo(330, 196); x.lineTo(420, 204); x.lineTo(436, 226); x.lineTo(256, 232); x.fill(); x.fillStyle = '#111'; x.beginPath(); x.arc(286, 230, 13, 0, 7); x.arc(404, 228, 13, 0, 7); x.fill();
      x.fillStyle = 'rgba(8,10,14,0.82)'; x.fillRect(14, 14, 150, 224); x.font = 'bold 15px sans-serif';
      ['VER', 'LEC', 'NOR', 'HAM', 'PIA', 'RUS', 'SAI', 'ALO', 'GAS', 'TSU'].forEach((t, k) => { x.fillStyle = k ? '#fff' : '#ffd400'; x.fillText(`${k + 1}`, 22, 36 + k * 21); x.fillStyle = ['#1e41ff', '#e10600', '#ff8000', '#e10600', '#ff8000', '#00a19c', '#1e41ff', '#0b7a3a', '#ff5fa2', '#2b4562'][k]; x.fillRect(42, 24 + k * 21, 4, 14); x.fillStyle = '#fff'; x.fillText(t, 52, 36 + k * 21); x.fillStyle = '#aab'; x.fillText(k ? `+${(k * 1.7 + 0.4).toFixed(1)}` : 'LEADER', 96, 36 + k * 21); });
      x.fillStyle = '#e10600'; x.fillRect(330, 14, 168, 30); x.fillStyle = '#fff'; x.font = 'italic 900 22px sans-serif'; x.fillText('APEX TV · LIVE', 340, 36);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
      const sm0 = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: r3.night ? 1.1 : 0.85 });
      instanced(scene, new THREE.PlaneGeometry(11, 6.2).translate(0, 7.4, 0.36), sm0, scr, { shadow: false });
      const frame = mergeGeometries([new THREE.BoxGeometry(11.6, 6.8, 0.6).translate(0, 7.4, 0), new THREE.BoxGeometry(0.5, 4.2, 0.5).translate(-4, 2.1, 0), new THREE.BoxGeometry(0.5, 4.2, 0.5).translate(4, 2.1, 0), new THREE.BoxGeometry(9, 0.3, 2.4).translate(0, 0.15, -0.6)]);
      instanced(scene, frame, new THREE.MeshStandardMaterial({ color: 0x25282d, roughness: 0.6, metalness: 0.5 }), posts);
    }
  }
  // ---- campsites on the surrounding ground: tents, motorhomes, cars, people
  if (biome.camp > 0 || biome.parks > 0) {
    const tents = [], tc = [], vans = [], vc = [];
    const tentG = mergeGeometries([part(new THREE.ConeGeometry(1.9, 1.7, 4, 1).rotateY(Math.PI / 4).scale(1, 1, 1.25).translate(0, 0.85, 0), '#ffffff')]);
    const vanG = mergeGeometries([part(new THREE.BoxGeometry(6.4, 2.3, 2.3).translate(0, 1.75, 0), '#ffffff'), part(new THREE.BoxGeometry(1.4, 1.5, 2.2).translate(3.6, 1.2, 0), '#ffffff'), part(new THREE.BoxGeometry(6.5, 0.5, 2.34).translate(0, 1.9, 0), '#2c3340'), part(new THREE.BoxGeometry(0.1, 0.7, 1.9).translate(4.31, 1.5, 0), '#1c232b'), part(new THREE.BoxGeometry(5.4, 0.5, 2.2).translate(0, 0.5, 0), '#17181a'), part(new THREE.BoxGeometry(3.2, 0.06, 2.4).translate(-0.6, 2.6, 2.2), '#d9d4c8')]);
    const tentCols = ['#d8401e', '#2d7a4a', '#2c5ea8', '#e8b820', '#7a8a3c', '#c9c2b0', '#3a7f8f', '#f08030', '#5a4a8a', '#b0362e'];
    const nSite = Math.round((low ? 4 : 11) * biome.camp);
    for (let s = 0, guard = 0; s < nSite && guard < 400; guard++) {
      const i = Math.floor(Math.random() * N), side = Math.random() < 0.5 ? 1 : -1, off = rnd(95, 250);
      const cx = g.x[i] - Math.sin(g.hdg[i]) * side * off, cz = g.y[i] + Math.cos(g.hdg[i]) * side * off;
      if (!free(cx, cz, 14, 85) || (r3.hillR0 && Math.hypot(cx - r3.hillC[0], cz - r3.hillC[1]) > r3.hillR0 - 60)) continue;
      s++; const rot0 = Math.random() * 3.14, n = Math.round(rnd(14, 40));
      for (let k = 0; k < n; k++) {
        const a = Math.random() * 6.283, rr = Math.sqrt(Math.random()) * 34, px = cx + Math.cos(a) * rr, pz = cz + Math.sin(a) * rr;
        if (!free(px, pz, 2.5, 80)) continue;
        const y = envH(px, pz) - 0.35, t = Math.random();
        if (t < 0.55) { tents.push(mAt(px, y, pz, rot0 + rnd(-0.4, 0.4), rnd(0.8, 1.25))); tc.push(tentCols[Math.floor(Math.random() * tentCols.length)]); if (Math.random() < 0.5) { people.push(mAt(px + rnd(-2.5, 2.5), y + 0.3, pz + rnd(-2.5, 2.5), Math.random() * 6.28)); pc.push(tentCols[Math.floor(Math.random() * tentCols.length)]); } }
        else if (t < 0.72) { vans.push(mAt(px, y + 0.1, pz, rot0 + (Math.random() < 0.5 ? 0 : Math.PI) + rnd(-0.15, 0.15))); vc.push(['#f4f4f2', '#ecebe6', '#dfe3e6', '#f1ede2'][k % 4]); }
        else { cars.push(mAt(px, y + 0.3, pz, rot0 + Math.PI / 2 + rnd(-0.3, 0.3))); carC.push(carCols[Math.floor(Math.random() * carCols.length)]); }
      }
    }
    // ---- spectator car parks: rows of cars on the grass further out
    const nPark = Math.round((low ? 1 : 3) * biome.parks);
    for (let s = 0, guard = 0; s < nPark && guard < 300; guard++) {
      const i = Math.floor(Math.random() * N), side = Math.random() < 0.5 ? 1 : -1, off = rnd(130, 300);
      const cx = g.x[i] - Math.sin(g.hdg[i]) * side * off, cz = g.y[i] + Math.cos(g.hdg[i]) * side * off;
      if (!free(cx, cz, 40, 110)) continue;
      s++; const rot = -g.hdg[i], c = Math.cos(g.hdg[i]), sn = Math.sin(g.hdg[i]), rows = low ? 4 : 8, per = low ? 16 : 30;
      for (let r = 0; r < rows; r++) for (let q = 0; q < per; q++) {
        if (Math.random() < 0.14) continue;
        const u = (q - per / 2) * 2.75, v = (r - rows / 2) * 6.2 + (r % 2 ? 0 : 1.4), px = cx + c * u - sn * v, pz = cz + sn * u + c * v;
        if (!free(px, pz, 2.2, 90)) continue;
        cars.push(mAt(px, envH(px, pz) - 0.33, pz, rot + Math.PI / 2 + (r % 2 ? Math.PI : 0) + rnd(-0.04, 0.04), rnd(0.92, 1.08))); carC.push(carCols[Math.floor(Math.random() * carCols.length)]);
      }
    }
    instanced(scene, tentG, tintWhite(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, flatShading: true }), 'tent'), tents, { colors: tc, shadow: false });
    instanced(scene, vanG, tintWhite(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }), 'van'), vans, { colors: vc, shadow: false });
  }
  instanced(scene, carG, carMat, cars, { colors: carC, shadow: false });
  instanced(scene, personLo(), tintWhite(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), 'ppl'), people, { colors: pc, shadow: false });
  // ---- TV helicopter circling above the circuit
  if (!r3.open) {
    const hg = mergeGeometries([part(new THREE.SphereGeometry(1.5, 10, 8).scale(1.7, 1, 1), '#e8e8ea'), part(new THREE.CylinderGeometry(0.16, 0.34, 5.2, 6).rotateZ(Math.PI / 2).translate(-4.4, 0.35, 0), '#e8e8ea'), part(new THREE.BoxGeometry(0.12, 1.5, 0.9).translate(-6.8, 0.9, 0), '#c8141b'), part(new THREE.BoxGeometry(11, 0.06, 0.34).translate(0, 1.75, 0), '#1a1b1e'), part(new THREE.BoxGeometry(0.34, 0.06, 11).translate(0, 1.75, 0), '#1a1b1e'), part(new THREE.SphereGeometry(1.2, 8, 6, 0, Math.PI * 2, 0, 1.4).scale(1.3, 0.9, 0.95).rotateZ(-1.1).translate(1.1, 0.1, 0), '#1c2a3a'), part(new THREE.BoxGeometry(3.2, 0.1, 0.12).translate(0, -1.6, 0.9), '#333'), part(new THREE.BoxGeometry(3.2, 0.1, 0.12).translate(0, -1.6, -0.9), '#333')]);
    const heli = new THREE.Mesh(hg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.3 })); scene.add(heli);
    const [bx0, bz0, bx1, bz1] = g.bbox, hx = (bx0 + bx1) / 2, hz = (bz0 + bz1) / 2, R = Math.min(bx1 - bx0, bz1 - bz0) * 0.3 + 80; let t = Math.random() * 100;
    const tick = (dt) => { t += dt * 0.035; heli.position.set(hx + Math.cos(t) * R, 150 + Math.sin(t * 3) * 8, hz + Math.sin(t) * R); heli.rotation.set(0, -t - Math.PI / 2, 0.12); };
    tick(0); const prev = r3._envTick; r3._envTick = (dt) => { prev?.(dt); tick(dt); };
  }
}

// ---------------------------------------------------------------- rally stage props
export function buildRallyExtras(r3, near, surf, look) {
  const g = r3.geo, N = g.N, W = r3.TW, low = r3.low, scene = r3.scene, d = new THREE.Object3D();
  const sight = (r3.tvCams || []).flatMap((c) => [0, -12, -24].map((dd) => { const j = Math.max(0, Math.min(N - 1, c.i + dd)); return [c.pos.x, c.pos.z, g.x[j], g.y[j]]; }));
  const blocks = (px, pz, rad) => sight.some(([x0, z0, x1, z1]) => { const dx = x1 - x0, dz = z1 - z0, L2 = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((px - x0) * dx + (pz - z0) * dz) / L2)); return (px - x0 - dx * t) ** 2 + (pz - z0 - dz * t) ** 2 < (rad + 4) ** 2; });
  const at = (i, side, off) => { i = Math.max(0, Math.min(N - 1, i)); return [g.x[i] - Math.sin(g.hdg[i]) * side * off, g.y[i] + Math.cos(g.hdg[i]) * side * off]; };
  const clear = (px, pz, r) => near(px, pz)[0] > (W / 2 + 1.6 + r) ** 2;
  const mAt = (x, y, z, ry, sx, sy = sx, sz = sx, rx = 0) => { d.position.set(x, y, z); d.rotation.set(rx, ry, rx * 0.7); d.scale.set(sx, sy, sz); d.updateMatrix(); return d.matrix.clone(); };
  // rocks: boulders by the road, outcrops and crags further back
  {
    const rg = new THREE.IcosahedronGeometry(1, 0), p = rg.attributes.position, seen = new Map();
    for (let i = 0; i < p.count; i++) { const k = p.getX(i).toFixed(3) + p.getY(i).toFixed(3) + p.getZ(i).toFixed(3); if (!seen.has(k)) seen.set(k, 0.72 + Math.random() * 0.5); const s = seen.get(k); p.setXYZ(i, p.getX(i) * s, p.getY(i) * s * 0.8, p.getZ(i) * s); }
    rg.computeVertexNormals();
    const list = [], cols = [], base = new THREE.Color(look.rock), c = new THREE.Color();
    const n = Math.round(N * 0.5 * look.rocks * (low ? 0.3 : 1));
    for (let k = 0; k < n; k++) {
      const i = Math.floor(Math.random() * N), side = Math.random() < 0.5 ? 1 : -1, big = Math.random() < 0.16;
      const s = big ? rnd(3, 9) : rnd(0.3, 1.5), off = W / 2 + (big ? rnd(13, 90) : 2.6 + Math.random() ** 2 * 26) + s;
      const [px, pz] = at(i, side, off); if (!clear(px, pz, s * 1.3) || (s > 1 && blocks(px, pz, s))) continue;
      list.push(mAt(px, r3.groundH(px, pz) - s * 0.3, pz, Math.random() * 6.28, s * rnd(0.8, 1.4), s * rnd(0.6, big ? 1.5 : 1), s * rnd(0.8, 1.3), rnd(-0.3, 0.3)));
      const v = rnd(0.75, 1.1); c.copy(base).multiplyScalar(v); if (surf === 'snow' && Math.random() < 0.7) c.lerp(new THREE.Color(0xf2f6fa), 0.75); cols.push('#' + c.getHexString());
    }
    const rm = low ? new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }) : pbr('rocky_trail', { color: 0xffffff, repeat: [1.5, 1.5] }); rm.flatShading = true;
    instanced(scene, rg, rm, list, { colors: cols, shadow: false });
  }
  // log piles in the forests, marker poles on snow, huts and barns
  if (look.logs) {
    const lg = mergeGeometries([[0, 0.3, -0.62], [0, 0.3, 0], [0, 0.3, 0.62], [0, 0.82, -0.31], [0, 0.82, 0.31], [0, 1.34, 0]].flatMap(([x, y, z]) => [part(new THREE.CylinderGeometry(0.3, 0.3, 5, 7, 1, true).rotateZ(Math.PI / 2).translate(x, y, z), '#6b4a2e'), part(new THREE.CircleGeometry(0.3, 7).rotateY(Math.PI / 2).translate(2.5, y, z), '#c9a877'), part(new THREE.CircleGeometry(0.3, 7).rotateY(-Math.PI / 2).translate(-2.5, y, z), '#c9a877')]));
    const list = [];
    for (let k = 0; k < N / 70 * look.logs * (low ? 0.4 : 1); k++) { const i = Math.floor(Math.random() * N), side = Math.random() < 0.5 ? 1 : -1; const [px, pz] = at(i, side, W / 2 + rnd(5.5, 10)); if (!clear(px, pz, 3.6) || blocks(px, pz, 3)) continue; list.push(mAt(px, r3.groundH(px, pz) - 0.1, pz, -g.hdg[i] + rnd(-0.15, 0.15), 1)); }
    instanced(scene, lg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), list);
  }
  if (surf === 'snow') {
    const list = []; for (let i = 0; i < N; i += 5) for (const side of [1, -1]) { const [px, pz] = at(i, side, W / 2 + 1.9); list.push(mAt(px, (g.h ? g.h[i] : 0) + 0.2, pz, 0, 1)); }
    instanced(scene, new THREE.CylinderGeometry(0.03, 0.03, 1.5, 5).translate(0, 0.75, 0), new THREE.MeshStandardMaterial({ color: 0xff5a10, roughness: 0.6 }), list, { shadow: false });
  }
  if (look.huts) {
    const wall = { snow: '#7a2b22', gravel: '#8a6a48', rough: '#d9c8a8', tarmac: '#ece4d2' }[surf], roof = { snow: '#f0f4f8', gravel: '#4a4038', rough: '#a8623a', tarmac: '#9a4a32' }[surf];
    const rs = new THREE.Shape(); rs.moveTo(-3.6, 0); rs.lineTo(0, 2.3); rs.lineTo(3.6, 0); rs.lineTo(-3.6, 0);
    const hg = mergeGeometries([part(new THREE.BoxGeometry(9, 3.4, 6.4).translate(0, 1.7, 0), '#ffffff'), part(new THREE.ExtrudeGeometry(rs, { depth: 9.6, bevelEnabled: false }).rotateY(Math.PI / 2).translate(-4.8, 3.4, 0), roof), part(new THREE.BoxGeometry(1.1, 2.1, 0.1).translate(-1.5, 1.05, 3.22), '#3a2a1e'), part(new THREE.BoxGeometry(1.2, 1.1, 0.1).translate(1.6, 1.9, 3.22), '#26303a'), part(new THREE.BoxGeometry(0.7, 1.6, 0.7).translate(2.6, 5, -0.8), '#6a6058')]);
    const list = [], cols = [];
    for (let k = 0, guard = 0; k < N / 170 * look.huts * (low ? 0.4 : 1) && guard < 400; guard++) {
      const i = Math.floor(Math.random() * N), side = Math.random() < 0.5 ? 1 : -1; const [px, pz] = at(i, side, W / 2 + rnd(13, 46));
      if (!clear(px, pz, 9) || blocks(px, pz, 7)) continue;
      // a small hamlet: 1-4 buildings
      const nb = 1 + Math.floor(Math.random() * (surf === 'tarmac' ? 4 : 2));
      for (let q = 0; q < nb; q++) { const hx = px + q * rnd(10, 13) * Math.cos(g.hdg[i]), hz = pz + q * rnd(10, 13) * Math.sin(g.hdg[i]); if (!clear(hx, hz, 8) || blocks(hx, hz, 7)) continue; const s = rnd(0.8, 1.2); list.push(mAt(hx, r3.groundH(hx, hz) - 0.5, hz, -g.hdg[i] + (side > 0 ? Math.PI : 0) + rnd(-0.25, 0.25), s)); cols.push(wall); }
      k++;
    }
    instanced(scene, hg, tintWhite(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), 'hut'), list, { colors: cols });
  }
}

// grid slots painted where the cars actually line up (called once, on the first frame of a race start)
export function buildGridSlots(r3) {
  const pos = [], idx = [];
  const quad = (cx, cz, fx, fz, lon, lat, hl, hw, y) => { const nx = -fz, nz = fx, x = cx + fx * lon + nx * lat, z = cz + fz * lon + nz * lat, b = pos.length / 3; pos.push(x - fx * hl - nx * hw, y, z - fz * hl - nz * hw, x - fx * hl + nx * hw, y, z - fz * hl + nz * hw, x + fx * hl - nx * hw, y, z + fz * hl - nz * hw, x + fx * hl + nx * hw, y, z + fz * hl + nz * hw); idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); };
  for (const car of r3.cars.values()) {
    const m = car.mesh; if (!m.visible) continue;
    const fx = Math.cos(m.rotation.y), fz = -Math.sin(m.rotation.y), y = m.position.y + 0.04;
    quad(m.position.x, m.position.z, fx, fz, 2.9, 0, 0.08, 1.3, y);
    for (const sd of [-1, 1]) quad(m.position.x, m.position.z, fx, fz, 2.1, sd * 1.26, 0.85, 0.05, y);
  }
  if (!idx.length) return;
  const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); bg.setIndex(idx); bg.computeVertexNormals();
  const mesh = new THREE.Mesh(bg, new THREE.MeshStandardMaterial({ color: 0xe9e9e6, roughness: 0.7, transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  mesh.receiveShadow = true; mesh.renderOrder = 2; r3.scene.add(mesh);
}
