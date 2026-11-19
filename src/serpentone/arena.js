// Serpentone — the four arenas: procedural ground shader (lawn stripes, sand ripples, neon grid, station
// panels), the rim, the shrinking storm wall, and the scenery outside the wall (all instanced).
import * as THREE from 'three';
import { rng } from './meta.js';

const GROUND_VS = `varying vec2 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const GROUND_FS = `
uniform int uType; uniform vec3 uA, uB, uC, uRim, uOut; uniform float uR, uRing, uTime, uLight;
varying vec2 vW;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }
void main(){
  vec2 p = vW; float d = length(p);
  vec3 col;
  float aa = fwidth(d) + 0.02;
  if (uType == 0) {
    // lawn: mowing stripes, grain, little flowers
    float st = smoothstep(0.46, 0.54, abs(fract(p.x / 14.0 + 0.15 * sin(p.y * 0.02)) - 0.5) * 2.0);
    col = mix(uA, uB, st) * (0.88 + 0.22 * noise(p * 0.4)) * (0.94 + 0.12 * noise(p * 0.04));
    vec2 c = floor(p / 2.6); float h = hash(c);
    if (h > 0.955) { vec2 q = fract(p / 2.6) - 0.5 - (vec2(hash(c + 3.1), hash(c + 7.7)) - 0.5) * 0.5; float l = length(q);
      vec3 fc = h > 0.97 ? vec3(1.0, 0.86, 0.2) : h > 0.94 ? vec3(1.0) : vec3(1.0, 0.45, 0.7);
      fc = mix(col, fc, 0.55); col = mix(col, fc, smoothstep(0.1, 0.07, l)); }
  } else if (uType == 1) {
    // sand: wind ripples, grain, shells
    float rip = 0.5 + 0.5 * sin(p.x * 0.55 + p.y * 0.2 + noise(p * 0.06) * 7.0);
    col = mix(uA, uB, rip * 0.7) * (0.93 + 0.12 * noise(p * 1.3));
    vec2 c = floor(p / 4.0); float h = hash(c);
    if (h > 0.975) { vec2 q = fract(p / 4.0) - 0.5; float l = length(q * vec2(1.0, 1.4)); col = mix(col, h > 0.98 ? vec3(1.0, 0.75, 0.8) : vec3(0.98, 0.95, 0.88), smoothstep(0.12, 0.08, l)); }
  } else if (uType == 2) {
    // neon: dark asphalt with a glowing grid that pulses outward
    col = uA * (0.75 + 0.5 * noise(p * 0.08)) + uB * 0.35 * noise(p * 0.5);
    vec2 g = abs(fract(p / 10.0) - 0.5); float line = smoothstep(0.465, 0.5, max(g.x, g.y));
    vec2 G = abs(fract(p / 50.0) - 0.5); float big = smoothstep(0.49, 0.5, max(G.x, G.y));
    float pulse = 0.55 + 0.45 * sin(uTime * 1.6 - d * 0.06);
    col += uC * line * 0.32 * pulse + uRim * big * 0.7;
  } else {
    // station deck: plates, seams, rivets, light strips
    vec2 cell = floor(p / 12.0), f = fract(p / 12.0);
    float e = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
    col = mix(uA, uB, hash(cell)) * (0.9 + 0.12 * noise(p * 0.6));
    col *= 1.0 - 0.6 * smoothstep(0.025, 0.0, e);
    vec2 rv = abs(f - 0.5); float riv = smoothstep(0.016, 0.008, length(rv - vec2(0.44)));
    col = mix(col, col * 1.5, riv);
    if (mod(cell.y, 5.0) == 0.0) col += uC * smoothstep(0.06, 0.0, abs(f.y - 0.5)) * (0.6 + 0.4 * sin(uTime * 3.0 + cell.x));
  }
  // the wall band, then outside the arena
  float edge = smoothstep(uR - 4.0, uR, d);
  col *= 1.0 - edge * 0.25;
  float out1 = smoothstep(uR + 0.5, uR + 0.5 + aa, d);
  vec3 o = uOut * (0.85 + 0.25 * noise(p * 0.3));
  if (uType == 1) o = mix(uB * 0.9, uB * 0.62, smoothstep(uR + 6.0, uR + 26.0, d));
  col = mix(col, o, out1);
  col = mix(col, uRim, smoothstep(uR - 1.2, uR - 0.6, d) * (1.0 - out1));
  // battle royale: the storm outside the ring
  if (uRing > 0.0) {
    float s = step(0.5, fract((p.x + p.y) / 7.0 + uTime * 0.4));
    float k = smoothstep(uRing - 0.2, uRing + 0.6, d);
    col = mix(col, mix(vec3(0.75, 0.05, 0.25), vec3(0.95, 0.15, 0.35), s), k * 0.42);
    col += vec3(1.0, 0.25, 0.5) * smoothstep(1.4, 0.0, abs(d - uRing)) * 0.8;
  }
  gl_FragColor = vec4(col * uLight, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const tm = new THREE.Matrix4(), tq = new THREE.Quaternion(), tp = new THREE.Vector3(), ts = new THREE.Vector3(), te = new THREE.Euler();
function inst(geo, mat, list, scene, shadow = false) {
  const m = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
  list.forEach((o, i) => { te.set(o.rx || 0, o.ry || 0, o.rz || 0); tq.setFromEuler(te); tm.compose(tp.set(o.x, o.y || 0, o.z), tq, ts.set(o.sx ?? o.s ?? 1, o.sy ?? o.s ?? 1, o.sz ?? o.s ?? 1)); m.setMatrixAt(i, tm); if (o.c) m.setColorAt(i, new THREE.Color(o.c)); });
  m.count = list.length; m.castShadow = shadow; scene.add(m); return m;
}

export function buildArena(scene, cfg, R, tier, seed = 1) {
  const r = rng(seed * 7 + 3), low = tier === 'low';
  const out = { uTime: { value: 0 }, uRing: { value: 0 }, update: null, disposables: [] };
  const id = cfg.ground;
  const extra = [60, 26, 60, 4][id];
  const C = (h) => new THREE.Color(h);
  const outCol = ['#2f6f2a', '#e8c98a', '#0a0718', '#1b2130'][id];
  const gmat = new THREE.ShaderMaterial({
    uniforms: { uType: { value: id }, uA: { value: C(cfg.a) }, uB: { value: C(cfg.b) }, uC: { value: C(cfg.c) }, uRim: { value: C(cfg.rim) }, uOut: { value: C(outCol) }, uR: { value: R }, uRing: out.uRing, uTime: out.uTime, uLight: { value: cfg.night ? 1 : 1.02 } },
    vertexShader: GROUND_VS, fragmentShader: GROUND_FS,
  });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(R + extra, low ? 96 : 192).rotateX(-Math.PI / 2), gmat);
  ground.renderOrder = -2; scene.add(ground);
  // beyond the ground: lawn, the sea, the night city floor (space has no floor: stars below too)
  if (id === 1) {
    const sea = new THREE.Mesh(new THREE.RingGeometry(R + extra - 6, R + 900, 96, 1).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
      uniforms: { uTime: out.uTime, uR: { value: R + extra } },
      vertexShader: GROUND_VS,
      fragmentShader: `uniform float uTime, uR; varying vec2 vW; void main(){ float d = length(vW) - uR; vec3 deep = vec3(0.0, 0.32, 0.55), shal = vec3(0.1, 0.78, 0.82);
        vec3 c = mix(shal, deep, smoothstep(0.0, 70.0, d)); float w = sin(d * 0.5 - uTime * 2.0) * 0.5 + 0.5; c += vec3(0.9) * smoothstep(0.92, 1.0, w) * smoothstep(40.0, 0.0, d) * 0.5;
        c += vec3(1.0) * smoothstep(2.5, 0.0, abs(d + 2.0 + sin(uTime * 1.3 + atan(vW.y, vW.x) * 18.0) * 1.2)) * 0.7;
        c += 0.05 * sin(vW.x * 0.3 + uTime) * sin(vW.y * 0.27 - uTime * 0.8); gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    }));
    sea.position.y = -0.05; sea.renderOrder = -3; scene.add(sea);
  } else if (id !== 3) {
    const far = new THREE.Mesh(new THREE.RingGeometry(R + extra - 1, R + 1200, 64, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: id === 0 ? '#2a6526' : '#07051a' }));
    far.position.y = -0.04; far.renderOrder = -3; scene.add(far);
  }

  // the rim (a raised kerb all round) and the arena-specific border
  const N = Math.round(R * 2 * Math.PI / 3.2);
  const kerb = new THREE.Mesh(new THREE.TorusGeometry(R + 0.4, 0.7, 8, low ? 128 : 256).rotateX(Math.PI / 2), new THREE.MeshPhongMaterial({ color: cfg.rim, emissive: cfg.night ? cfg.rim : '#000000', emissiveIntensity: cfg.night ? 0.9 : 0, shininess: 40 }));
  kerb.position.y = 0.25; scene.add(kerb);
  const props = [];
  if (id === 0) { // garden: a hedge, flower beds and trees outside
    const hedge = [];
    for (let i = 0; i < N * 2; i++) { const a = (i / (N * 2)) * Math.PI * 2, d = R + 2.4 + r() * 1.8; const s = 1.6 + r() * 1.1; hedge.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, y: s * 0.7, s, c: ['#2f8a2c', '#3a9a34', '#2a7a27'][i % 3] }); }
    props.push(inst(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true }), hedge, scene));
    const trees = [], tops = [], flowers = [];
    for (let i = 0; i < (low ? 60 : 140); i++) { const a = r() * Math.PI * 2, d = R + 9 + r() * 55, s = 2 + r() * 2.5; trees.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, y: s * 1.2, sx: s * 0.22, sy: s * 2.4, sz: s * 0.22 }); tops.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, y: s * 2.8, s: s * 1.2, c: ['#3faa3a', '#58c04a', '#2e8b57', '#7cc242'][i % 4] }); }
    for (let i = 0; i < (low ? 200 : 600); i++) { const a = r() * Math.PI * 2, d = R + 5 + r() * 40; flowers.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, y: 0.4, s: 0.45 + r() * 0.3, c: cfg.pal[i % cfg.pal.length] }); }
    props.push(inst(new THREE.CylinderGeometry(1, 1.2, 1, 6), new THREE.MeshLambertMaterial({ color: '#7a5230' }), trees, scene));
    props.push(inst(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true }), tops, scene));
    props.push(inst(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: '#ffffff' }), flowers, scene));
  } else if (id === 1) { // beach: posts and a rope, palms, beach umbrellas
    const posts = [];
    for (let i = 0; i < N / 2; i++) { const a = (i / (N / 2)) * Math.PI * 2; posts.push({ x: Math.cos(a) * (R + 1.6), z: Math.sin(a) * (R + 1.6), y: 1.1, sx: 0.35, sy: 2.2, sz: 0.35 }); }
    props.push(inst(new THREE.CylinderGeometry(1, 1, 1, 6), new THREE.MeshLambertMaterial({ color: '#8b5a2b' }), posts, scene));
    const rope = new THREE.Mesh(new THREE.TorusGeometry(R + 1.6, 0.12, 4, 256).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#f2e2b8' })); rope.position.y = 1.9; scene.add(rope);
    const trunks = [], leaves = [], umb = [], poles = [];
    for (let i = 0; i < (low ? 26 : 60); i++) {
      const a = r() * Math.PI * 2, d = R + 6 + r() * 16, h = 6 + r() * 4, lean = (r() - 0.5) * 0.4;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      trunks.push({ x, z, y: h / 2, sx: 0.45, sy: h, sz: 0.45, rz: lean });
      for (let k = 0; k < 6; k++) { const b = (k / 6) * Math.PI * 2; leaves.push({ x: x + Math.cos(b) * 1.6 - Math.sin(lean) * h, z: z + Math.sin(b) * 1.6, y: h - 0.2, sx: 3.4, sy: 0.18, sz: 1.0, ry: -b, rz: -0.35, c: k & 1 ? '#2f9e44' : '#40c057' }); }
    }
    for (let i = 0; i < (low ? 10 : 24); i++) { const a = r() * Math.PI * 2, d = R + 5 + r() * 14, x = Math.cos(a) * d, z = Math.sin(a) * d; umb.push({ x, z, y: 3.2, s: 2.4, c: ['#ff4d6d', '#ffbe0b', '#3a86ff', '#ffffff'][i % 4] }); poles.push({ x, z, y: 1.6, sx: 0.12, sy: 3.2, sz: 0.12 }); }
    props.push(inst(new THREE.CylinderGeometry(0.8, 1, 1, 6), new THREE.MeshLambertMaterial({ color: '#a47148' }), trunks, scene));
    props.push(inst(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: '#ffffff' }), leaves, scene));
    props.push(inst(new THREE.ConeGeometry(1, 0.6, 10, 1, true), new THREE.MeshLambertMaterial({ color: '#ffffff', side: THREE.DoubleSide }), umb, scene));
    props.push(inst(new THREE.CylinderGeometry(1, 1, 1, 5), new THREE.MeshLambertMaterial({ color: '#dddddd' }), poles, scene));
  } else if (id === 2) { // neon city: twin glowing tubes, towers with lit windows
    const tube = new THREE.Mesh(new THREE.TorusGeometry(R + 1.4, 0.3, 6, 256).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: cfg.c })); tube.position.y = 1.4; scene.add(tube);
    const towers = [];
    for (let i = 0; i < (low ? 70 : 160); i++) { const a = r() * Math.PI * 2, d = R + 14 + r() * 90, w = 6 + r() * 10, h = 10 + r() * 50 + d * 0.05; towers.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, y: h / 2, sx: w, sy: h, sz: w * (0.7 + r() * 0.6), ry: r() * 3, c: ['#2a1b5c', '#1d2a5c', '#3a1650', '#13203f'][i % 4] }); }
    const wm = new THREE.MeshLambertMaterial({ color: '#ffffff' });
    wm.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vP; varying vec3 vN;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvP = (instanceMatrix * vec4(position, 1.0)).xyz; vN = normal;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vP; varying vec3 vN; float h2(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        if (abs(vN.y) < 0.5) { vec2 g = vec2(vP.x + vP.z, vP.y) / vec2(2.2, 2.6); vec2 f = fract(g); float win = step(0.22, f.x) * step(f.x, 0.78) * step(0.25, f.y) * step(f.y, 0.75);
          float on = step(0.55, h2(floor(g) + floor(vP.xz * 0.05))); vec3 wc = mix(vec3(1.0, 0.25, 0.85), vec3(0.2, 0.9, 1.0), h2(floor(g) * 1.7)); totalEmissiveRadiance += wc * win * on * 1.1; }`);
    };
    props.push(inst(new THREE.BoxGeometry(1, 1, 1), wm, towers, scene));
  } else { // space station: a glowing barrier, modules floating around, stars and a planet
    const rail = new THREE.Mesh(new THREE.TorusGeometry(R + 1.6, 0.5, 6, 256).rotateX(Math.PI / 2), new THREE.MeshPhongMaterial({ color: '#9aa4b5', shininess: 80 })); rail.position.y = 1.1; scene.add(rail);
    const lamps = [];
    for (let i = 0; i < N / 3; i++) { const a = (i / (N / 3)) * Math.PI * 2; lamps.push({ x: Math.cos(a) * (R + 1.6), z: Math.sin(a) * (R + 1.6), y: 1.7, s: 0.35 }); }
    props.push(inst(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: cfg.rim }), lamps, scene));
    const mods = [];
    for (let i = 0; i < (low ? 16 : 34); i++) { const a = r() * Math.PI * 2, d = R + 40 + r() * 140; mods.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, y: -30 + r() * 50, sx: 6 + r() * 10, sy: 6 + r() * 6, sz: 20 + r() * 30, ry: r() * 3, rx: r() * 0.3, c: ['#8892a6', '#b0b8c8', '#6c7690'][i % 3] }); }
    props.push(inst(new THREE.CylinderGeometry(0.5, 0.5, 1, 10).rotateX(Math.PI / 2), new THREE.MeshPhongMaterial({ color: '#ffffff', shininess: 60 }), mods, scene));
    const sp = [], sc = [];
    for (let i = 0; i < (low ? 1500 : 4000); i++) { const u = r() * 2 - 1, a = r() * Math.PI * 2, rr = 1100, k = Math.sqrt(1 - u * u); sp.push(Math.cos(a) * k * rr, u * rr * 0.9 - (u < 0 ? 200 : 0), Math.sin(a) * k * rr); const c = 0.6 + r() * 0.4; sc.push(c, c, c + r() * 0.2); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)); sg.setAttribute('color', new THREE.Float32BufferAttribute(sc, 3));
    const stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, fog: false })); stars.frustumCulled = false; scene.add(stars); out.stars = stars;
    const planet = new THREE.Mesh(new THREE.SphereGeometry(160, 48, 32), new THREE.ShaderMaterial({
      vertexShader: 'varying vec3 vN; varying vec3 vP; void main(){ vN = normalize(normalMatrix * normal); vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec3 vN; varying vec3 vP; void main(){ float l = clamp(dot(vN, normalize(vec3(-0.6, 0.5, 0.6))), 0.0, 1.0); float b = sin(vP.y * 0.06 + sin(vP.x * 0.02) * 2.0) * 0.5 + 0.5;
        vec3 c = mix(vec3(0.95, 0.55, 0.3), vec3(0.75, 0.35, 0.55), b) * (0.08 + l * 1.1); c += vec3(0.4, 0.6, 1.0) * pow(1.0 - abs(vN.z), 3.0) * 0.6; gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
    }));
    planet.position.set(-520, -260, -700); scene.add(planet);
  }
  out.props = props;

  // the storm wall of the battle royale: an animated open cylinder, scaled to the ring every frame
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 14, 160, 1, true), new THREE.ShaderMaterial({
    uniforms: { uTime: out.uTime },
    vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform float uTime; varying vec2 vU; void main(){ float s = step(0.5, fract(vU.x * 120.0 + vU.y * 2.0 - uTime * 0.6)); float a = (1.0 - vU.y) * 0.55 + 0.1; vec3 c = mix(vec3(1.0, 0.2, 0.45), vec3(1.0, 0.55, 0.75), s); gl_FragColor = vec4(c * a, a); }',
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  }));
  wall.position.y = 7; wall.visible = false; wall.renderOrder = 4; scene.add(wall);
  out.wall = wall;
  out.setRing = (ring) => { out.uRing.value = ring; wall.visible = ring > 0; if (ring > 0) wall.scale.set(ring, 1, ring); };
  return out;
}
